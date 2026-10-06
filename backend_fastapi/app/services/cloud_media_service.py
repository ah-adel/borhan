from __future__ import annotations

import hashlib
import os
import time
from typing import Any
from urllib.parse import quote, urlencode

import httpx


class MediaProviderError(RuntimeError):
    pass


def _supabase_config() -> tuple[str, str, str]:
    base_url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    bucket = os.getenv("SUPABASE_PRIVATE_MEDIA_BUCKET", "course-materials").strip()
    if not base_url or not service_key or not bucket:
        raise MediaProviderError("Supabase Storage is not configured.")
    return base_url, service_key, bucket


def _supabase_headers(service_key: str) -> dict[str, str]:
    return {"apikey": service_key, "Authorization": f"Bearer {service_key}"}


async def create_supabase_upload_ticket(object_key: str, mime_type: str) -> dict[str, str]:
    base_url, service_key, bucket = _supabase_config()
    endpoint = f"{base_url}/storage/v1/object/upload/sign/{quote(bucket, safe='')}/{quote(object_key, safe='/')}"
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(15.0)) as client:
            response = await client.post(
                endpoint,
                headers={**_supabase_headers(service_key), "Content-Type": "application/json"},
                json={"upsert": False, "contentType": mime_type},
            )
            response.raise_for_status()
            data = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise MediaProviderError("Could not create a Supabase signed upload URL.") from exc

    token = data.get("token")
    signed_url = data.get("signedURL") or data.get("signedUrl") or data.get("url")
    if not isinstance(token, str) or not token or not isinstance(signed_url, str) or not signed_url:
        raise MediaProviderError("Supabase returned an invalid upload signature.")
    if signed_url.startswith("/"):
        signed_url = f"{base_url}/storage/v1{signed_url}"
    elif not signed_url.startswith("http"):
        signed_url = f"{base_url}/storage/v1/{signed_url.lstrip('/')}"
    return {"token": token, "signed_url": signed_url, "path": object_key}


async def create_supabase_download_url(object_key: str, expires_in: int = 300) -> str:
    base_url, service_key, bucket = _supabase_config()
    endpoint = f"{base_url}/storage/v1/object/sign/{quote(bucket, safe='')}/{quote(object_key, safe='/')}"
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as client:
            response = await client.post(
                endpoint,
                headers={**_supabase_headers(service_key), "Content-Type": "application/json"},
                json={"expiresIn": expires_in, "download": True},
            )
            response.raise_for_status()
            data = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise MediaProviderError("Could not create a Supabase signed download URL.") from exc

    signed_url = data.get("signedURL") or data.get("signedUrl")
    if not isinstance(signed_url, str) or not signed_url:
        raise MediaProviderError("Supabase returned an invalid download signature.")
    return signed_url if signed_url.startswith("http") else f"{base_url}/storage/v1{signed_url}"


async def delete_supabase_object(object_key: str) -> None:
    base_url, service_key, bucket = _supabase_config()
    endpoint = f"{base_url}/storage/v1/object/{quote(bucket, safe='')}/{quote(object_key, safe='/')}"
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as client:
            response = await client.delete(endpoint, headers=_supabase_headers(service_key))
            response.raise_for_status()
    except httpx.HTTPError as exc:
        raise MediaProviderError("Could not delete the Supabase Storage object.") from exc


def create_bunny_upload_signature(video_id: str, expires_at: int) -> tuple[str, str]:
    library_id = os.getenv("BUNNY_STREAM_LIBRARY_ID", "").strip()
    api_key = os.getenv("BUNNY_STREAM_API_KEY", "").strip()
    if not library_id or not api_key:
        raise MediaProviderError("Bunny Stream uploads are not configured.")
    signature = hashlib.sha256(f"{library_id}{api_key}{expires_at}{video_id}".encode("utf-8")).hexdigest()
    return library_id, signature


async def create_bunny_video(title: str) -> str:
    library_id = os.getenv("BUNNY_STREAM_LIBRARY_ID", "").strip()
    api_key = os.getenv("BUNNY_STREAM_API_KEY", "").strip()
    if not library_id or not api_key:
        raise MediaProviderError("Bunny Stream uploads are not configured.")
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(15.0)) as client:
            response = await client.post(
                f"https://video.bunnycdn.com/library/{quote(library_id, safe='')}/videos",
                headers={"AccessKey": api_key, "Accept": "application/json", "Content-Type": "application/json"},
                json={"title": title},
            )
            response.raise_for_status()
            data: dict[str, Any] = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise MediaProviderError("Could not create a Bunny Stream video.") from exc
    video_id = data.get("guid")
    if not isinstance(video_id, str) or not video_id:
        raise MediaProviderError("Bunny Stream returned an invalid video ID.")
    return video_id


def create_bunny_playback_url(video_id: str, expires_in: int = 300) -> str:
    library_id = os.getenv("BUNNY_STREAM_LIBRARY_ID", "").strip()
    token_key = os.getenv("BUNNY_STREAM_TOKEN_KEY", "").strip()
    if not library_id or not token_key:
        raise MediaProviderError("Bunny Stream playback authentication is not configured.")
    expires_at = int(time.time()) + expires_in
    token = hashlib.sha256(f"{token_key}{video_id}{expires_at}".encode("utf-8")).hexdigest()
    query = urlencode({"token": token, "expires": expires_at})
    return f"https://player.mediadelivery.net/embed/{quote(library_id, safe='')}/{quote(video_id, safe='')}?{query}"


async def delete_bunny_video(video_id: str) -> None:
    library_id = os.getenv("BUNNY_STREAM_LIBRARY_ID", "").strip()
    api_key = os.getenv("BUNNY_STREAM_API_KEY", "").strip()
    if not library_id or not api_key:
        raise MediaProviderError("Bunny Stream is not configured.")
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as client:
            response = await client.delete(
                f"https://video.bunnycdn.com/library/{quote(library_id, safe='')}/videos/{quote(video_id, safe='')}",
                headers={"AccessKey": api_key},
            )
            response.raise_for_status()
    except httpx.HTTPError as exc:
        raise MediaProviderError("Could not delete the Bunny Stream video.") from exc


async def delete_cloud_media_asset(asset: dict[str, Any]) -> None:
    if asset.get("provider") == "supabase" and asset.get("object_key"):
        await delete_supabase_object(str(asset["object_key"]))
    elif asset.get("provider") == "bunny" and asset.get("remote_id"):
        await delete_bunny_video(str(asset["remote_id"]))
    elif asset.get("provider") != "external":
        raise MediaProviderError("Cloud media asset metadata is incomplete.")


async def cleanup_course_media_assets(assets: list[dict[str, Any]], course_id: str) -> list[dict[str, str]]:
    from app.db import delete_media_asset_record, is_media_asset_referenced_outside_course

    errors: list[dict[str, str]] = []
    for asset in assets:
        asset_id = str(asset["id"])
        if is_media_asset_referenced_outside_course(asset_id, course_id):
            continue
        try:
            await delete_cloud_media_asset(asset)
        except MediaProviderError as exc:
            errors.append({"asset_id": asset_id, "message": str(exc)})
            continue
        delete_media_asset_record(asset_id)
    return errors