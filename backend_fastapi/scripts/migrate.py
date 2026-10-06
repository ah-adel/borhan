from __future__ import annotations

import hashlib
import os
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import psycopg2


ROOT = Path(__file__).resolve().parents[2]
BASELINE = ROOT / "database" / "schema.sql"
LMS_BASELINE = ROOT / "database" / "lms_v2_architecture.sql"
MIGRATIONS = ROOT / "database" / "migrations"


def _database_url() -> str:
    value = os.getenv("DATABASE_URL", "").strip()
    if not value:
        raise RuntimeError("DATABASE_URL is required to apply migrations.")

    if os.getenv("ENVIRONMENT", "").strip().lower() in {"prod", "production", "vercel"}:
        parsed = urlparse(value)
        ssl_mode = parse_qs(parsed.query).get("sslmode", [""])[0].lower()
        if not parsed.hostname or not parsed.hostname.endswith(".pooler.supabase.com") or parsed.port != 6543:
            raise RuntimeError("Production migrations must use the Supabase transaction pooler on port 6543.")
        if ssl_mode not in {"require", "verify-ca", "verify-full"}:
            raise RuntimeError("Production migrations require sslmode=require or stronger.")
    return value


def apply_migrations() -> None:
    migration_files = [("0000_baseline", BASELINE), ("0000_lms_v2_architecture", LMS_BASELINE)]
    migration_files.extend(
        (path.stem, path)
        for path in sorted(MIGRATIONS.glob("*.sql"))
    )
    if not BASELINE.is_file() or not LMS_BASELINE.is_file() or not MIGRATIONS.is_dir():
        raise FileNotFoundError("Database baselines or migrations directory is missing.")

    connect_options = {"connect_timeout": 10}
    if os.getenv("ENVIRONMENT", "").strip().lower() in {"prod", "production", "vercel"}:
        connect_options["sslmode"] = "require"
    with psycopg2.connect(_database_url(), **connect_options) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_advisory_xact_lock(hashtext('fasl_ai_schema_migrations'))")
            cursor.execute(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version TEXT PRIMARY KEY,
                    checksum TEXT NOT NULL,
                    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )

            for version, path in migration_files:
                sql = path.read_text(encoding="utf-8")
                checksum = hashlib.sha256(sql.encode("utf-8")).hexdigest()
                cursor.execute("SELECT checksum FROM schema_migrations WHERE version = %s", (version,))
                recorded = cursor.fetchone()
                if recorded:
                    if recorded[0] != checksum:
                        raise RuntimeError(f"Applied migration {version} has changed; add a new migration instead.")
                    continue

                cursor.execute(sql)
                cursor.execute(
                    "INSERT INTO schema_migrations (version, checksum) VALUES (%s, %s)",
                    (version, checksum),
                )
                print(f"Applied {version} ({path.name})")


if __name__ == "__main__":
    apply_migrations()