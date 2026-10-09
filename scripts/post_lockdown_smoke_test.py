from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = ROOT / "backend_fastapi"


def _load_local_auth_environment() -> None:
    allowed = {"DATABASE_URL", "JWT_SECRET", "JWT_SECRET_KEY"}
    env_file = ROOT / ".env"
    if not env_file.is_file():
        return
    for raw_line in env_file.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        name = name.strip().removeprefix("export ").strip()
        if name not in allowed or os.environ.get(name):
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ('"', "'"):
            value = value[1:-1]
        os.environ[name] = value


def _active_admin_id() -> str:
    import psycopg2

    database_url = os.environ.get("DATABASE_URL", "")
    if not database_url:
        raise RuntimeError("database_url_missing")
    connection = psycopg2.connect(database_url, connect_timeout=12)
    try:
        connection.set_session(readonly=True, autocommit=False)
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT id FROM public.users "
                "WHERE role = 'admin' AND status = 'active' AND is_verified IS TRUE "
                "ORDER BY id LIMIT 1"
            )
            row = cursor.fetchone()
            if row is None:
                raise RuntimeError("active_admin_unavailable")
            return str(row[0])
    finally:
        connection.rollback()
        connection.close()


def _request(base_url: str, path: str, token: str | None = None) -> tuple[int, int | None]:
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = Request(f"{base_url}{path}", headers=headers, method="GET")
    try:
        with urlopen(request, timeout=90) as response:
            status = response.status
            body = response.read()
    except HTTPError as error:
        return error.code, None
    except (URLError, TimeoutError, OSError):
        return 0, None

    try:
        payload = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return status, None
    data = payload.get("data") if isinstance(payload, dict) else None
    if isinstance(data, list):
        return status, len(data)
    if isinstance(data, dict):
        for key in ("items", "courses", "instructors"):
            if isinstance(data.get(key), list):
                return status, len(data[key])
    return status, None


def main() -> int:
    parser = argparse.ArgumentParser(description="GET-only post-lockdown production smoke checks.")
    parser.add_argument("--base-url", default="https://borhan-eu.onrender.com")
    parser.add_argument("--expected-public-course-count", type=int)
    parser.add_argument("--skip-admin-checks", action="store_true")
    args = parser.parse_args()
    base_url = args.base_url.rstrip("/")

    _load_local_auth_environment()
    sys.path.insert(0, str(BACKEND_ROOT))
    from app.core.security import create_access_token

    checks = [
        ("health", "/health", None),
        ("public_courses", "/api/courses/public", None),
    ]
    if args.skip_admin_checks:
        print("SMOKE admin_endpoint_check=not_verifiable skipped=true")
    else:
        admin_id = _active_admin_id()
        token = create_access_token(admin_id, "admin", mfa_verified=True, expires_minutes=5)
        checks.extend([
            ("admin_instructors", "/api/admin/instructors", token),
            ("admin_courses", "/api/courses", token),
        ])
    results = {}
    successful = True
    for name, path, auth_token in checks:
        status, count = _request(base_url, path, auth_token)
        results[name] = {"status": status, "count": count}
        if status != 200:
            successful = False
        suffix = f" count={count}" if count is not None else " count=unknown"
        print(f"SMOKE {name} status={status}{suffix}")

    public_count = results["public_courses"]["count"]
    if args.expected_public_course_count is not None:
        count_matches = public_count == args.expected_public_course_count
        print(f"SMOKE public_course_count_matches={count_matches}")
        successful = successful and count_matches
    print(f"SMOKE all_checks_passed={successful}")
    return 0 if successful else 1


if __name__ == "__main__":
    raise SystemExit(main())