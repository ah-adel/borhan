from __future__ import annotations

import argparse
import base64
import hashlib
import mimetypes
import os
import uuid
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urlparse
from urllib.parse import urljoin
from urllib.parse import quote

import httpx
import psycopg2


ROOT = Path(__file__).resolve().parents[2]
ATTACHMENT_LIMIT = 20 * 1024 * 1024
VIDEO_LIMIT = 500 * 1024 * 1024


def _required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is required.")
    return value


def _database_url() -> str:
    value = _required_env("DATABASE_URL")
    parsed = urlparse(value)
    if not parsed.hostname or not parsed.hostname.endswith(".pooler.supabase.com") or parsed.port != 6543:
        raise RuntimeError("DATABASE_URL must use the Supabase transaction pooler on port 6543.")
    return value


def _resolve_legacy_file(raw_url: str) -> Path | None:
    parsed = urlparse(raw_url.strip())
    if parsed.scheme and parsed.scheme not in {"file"}:
        return None
    raw_path = unquote(parsed.path if parsed.scheme else raw_url).replace("\\", "/")
    parts = [part for part in PurePosixPath(raw_path).parts if part not in {"/", "", "."}]
    if ".." in parts:
        raise ValueError(f"Unsafe legacy media path: {raw_url}")

    relative: tuple[str, ...] | None = None
    for prefix in (("uploads",), ("public", "uploads")):
        if parts[:len(prefix)] == prefix:
            relative = tuple(parts[len(prefix):])
            break
    if relative is None:
        return None

    roots = (
        ROOT / "backend_fastapi" / "uploads",
        ROOT / "backend_fastapi" / "public" / "uploads",
        ROOT / "public" / "uploads",
        ROOT / "uploads",
    )
    for root in roots:
        candidate = (root.joinpath(*relative)).resolve()
        if root.resolve() in candidate.parents and candidate.is_file():
            return candidate
    return None


def _iter_file_chunks(file_path: Path, chunk_size: int = 8 * 1024 * 1024):
    with file_path.open("rb") as source:
        while chunk := source.read(chunk_size):
            yield chunk


def _upload_attachment(client: httpx.Client, file_path: Path, object_key: str, mime_type: str) -> None:
    base_url = _required_env("SUPABASE_URL").rstrip("/")
    service_key = _required_env("SUPABASE_SERVICE_ROLE_KEY")
    bucket = os.getenv("SUPABASE_PRIVATE_MEDIA_BUCKET", "course-materials").strip()
    endpoint = f"{base_url}/storage/v1/object/{quote(bucket, safe='')}/{quote(object_key, safe='/')}"
    response = client.post(
        endpoint,
        headers={
            "apikey": service_key,
            "Authorization": f"Bearer {service_key}",
            "Content-Type": mime_type,
            "Content-Length": str(file_path.stat().st_size),
            "x-upsert": "false",
        },
        content=_iter_file_chunks(file_path),
    )
    response.raise_for_status()


def _create_bunny_video_and_upload(client: httpx.Client, file_path: Path, filename: str, mime_type: str) -> tuple[str, str]:
    library_id = _required_env("BUNNY_STREAM_LIBRARY_ID")
    api_key = _required_env("BUNNY_STREAM_API_KEY")
    create_response = client.post(
        f"https://video.bunnycdn.com/library/{library_id}/videos",
        headers={"AccessKey": api_key, "Accept": "application/json", "Content-Type": "application/json"},
        json={"title": filename},
    )
    create_response.raise_for_status()
    video_id = str(create_response.json()["guid"])
    expires_at = int(__import__("time").time()) + 3600
    signature = hashlib.sha256(f"{library_id}{api_key}{expires_at}{video_id}".encode("utf-8")).hexdigest()
    encoded_filetype = base64.b64encode(mime_type.encode("utf-8")).decode("ascii")
    encoded_title = base64.b64encode(filename.encode("utf-8")).decode("ascii")
    tus_headers = {
        "Tus-Resumable": "1.0.0",
        "Upload-Length": str(file_path.stat().st_size),
        "Upload-Metadata": f"filetype {encoded_filetype},title {encoded_title}",
        "AuthorizationSignature": signature,
        "AuthorizationExpire": str(expires_at),
        "VideoId": video_id,
        "LibraryId": library_id,
    }
    session = client.post("https://video.bunnycdn.com/tusupload", headers=tus_headers)
    session.raise_for_status()
    upload_url = urljoin("https://video.bunnycdn.com", session.headers["Location"])
    upload_response = client.patch(
        upload_url,
        headers={
            **tus_headers,
            "Upload-Offset": "0",
            "Content-Type": "application/offset+octet-stream",
            "Content-Length": str(file_path.stat().st_size),
        },
        content=_iter_file_chunks(file_path),
    )
    upload_response.raise_for_status()
    return video_id, library_id


def migrate_media(*, delete_local: bool = False) -> dict[str, int]:
    supabase_url = os.getenv("SUPABASE_URL", "").strip()
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    bunny_library_id = os.getenv("BUNNY_STREAM_LIBRARY_ID", "").strip()
    bunny_api_key = os.getenv("BUNNY_STREAM_API_KEY", "").strip()
    if not all((supabase_url, service_key, bunny_library_id, bunny_api_key)):
        raise RuntimeError("Configure Supabase and Bunny secrets before migrating legacy media.")

    migrated = 0
    skipped = 0
    failures = 0
    local_files: dict[str, Path] = {}
    migrated_urls: dict[tuple[str, str], str] = {}
    with psycopg2.connect(_database_url(), sslmode="require", connect_timeout=10) as connection, httpx.Client(timeout=httpx.Timeout(600.0)) as client:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT l.id, m.course_id, c.instructor_id,
                       l.video_url, l.video_name, l.attachment_url, l.attachment_name
                FROM lessons l
                JOIN course_modules m ON m.id = l.module_id
                JOIN courses c ON c.id = m.course_id
                ORDER BY c.id, l.id
                """
            )
            lessons = cursor.fetchall()

        for lesson_id, course_id, instructor_id, video_url, video_name, attachment_url, attachment_name in lessons:
            for kind, current_url, stored_name in (
                ("video", video_url, video_name),
                ("attachment", attachment_url, attachment_name),
            ):
                if not isinstance(current_url, str) or not current_url.startswith(("/uploads/", "/public/uploads/", "uploads/", "public/uploads/")):
                    continue
                migration_key = (kind, current_url)
                if migration_key in migrated_urls:
                    asset_url = migrated_urls[migration_key]
                else:
                    try:
                        file_path = _resolve_legacy_file(current_url)
                    except ValueError as exc:
                        print(f"ERROR {current_url}: {exc}")
                        failures += 1
                        continue
                    if file_path is None:
                        print(f"MISSING {current_url}")
                        failures += 1
                        continue

                    file_size = file_path.stat().st_size
                    limit = VIDEO_LIMIT if kind == "video" else ATTACHMENT_LIMIT
                    if file_size > limit:
                        print(f"TOO_LARGE {current_url}: {file_size} bytes")
                        failures += 1
                        continue

                    filename = Path(stored_name or file_path.name).name
                    mime_type = mimetypes.guess_type(filename)[0] or ("video/mp4" if kind == "video" else "application/octet-stream")
                    asset_id = str(uuid.uuid4())
                    try:
                        if kind == "attachment":
                            object_key = f"legacy/{course_id}/{asset_id}/{filename}"
                            _upload_attachment(client, file_path, object_key, mime_type)
                            provider, remote_id = "supabase", None
                        else:
                            remote_id, _ = _create_bunny_video_and_upload(client, file_path, filename, mime_type)
                            object_key, provider = None, "bunny"

                        with connection.cursor() as cursor:
                            cursor.execute(
                                """
                                INSERT INTO media_assets
                                    (id, course_id, kind, provider, object_key, remote_id, original_name, mime_type, file_size, uploaded_by)
                                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                                """,
                                (asset_id, course_id, kind, provider, object_key, remote_id, filename, mime_type, file_size, instructor_id),
                            )
                        connection.commit()
                        asset_url = f"cloud-asset:{asset_id}"
                        migrated_urls[migration_key] = asset_url
                        migrated += 1
                    except Exception as exc:
                        connection.rollback()
                        print(f"ERROR {current_url}: {exc}")
                        failures += 1
                        continue

                column = "video_url" if kind == "video" else "attachment_url"
                with connection.cursor() as cursor:
                    cursor.execute(
                        f"UPDATE lessons SET {column} = %s WHERE id = %s AND {column} = %s",
                        (asset_url, lesson_id, current_url),
                    )
                    if cursor.rowcount == 0:
                        print(f"CHANGED {current_url}: lesson {lesson_id} no longer points to this file")
                        skipped += 1
                    else:
                        source_path = _resolve_legacy_file(current_url)
                        if source_path is not None:
                            local_files[current_url] = source_path
                connection.commit()

        if delete_local:
            for file_path in set(local_files.values()):
                try:
                    file_path.unlink(missing_ok=True)
                except OSError as exc:
                    print(f"LOCAL_DELETE_ERROR {file_path}: {exc}")
                    failures += 1

    return {"migrated": migrated, "skipped": skipped, "failures": failures}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Move lesson media from local uploads into Supabase Storage and Bunny Stream.")
    parser.add_argument("--delete-local", action="store_true", help="Delete source files only after each cloud copy and DB update succeeds.")
    options = parser.parse_args()
    summary = migrate_media(delete_local=options.delete_local)
    print(f"Migration complete: {summary}")
    if summary["failures"]:
        raise SystemExit(1)