import os
import secrets
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from pydantic import BaseModel, Field, model_validator


def _env_path(name: str, default: str) -> Path:
    value = os.getenv(name, default).strip()
    return Path(value).expanduser().resolve() if value else Path(default).expanduser().resolve()


def _jwt_secret_key() -> str:
    configured_key = os.getenv("JWT_SECRET", "").strip() or os.getenv("JWT_SECRET_KEY", "").strip()
    if configured_key:
        if len(configured_key.encode("utf-8")) < 32:
            raise ValueError("JWT_SECRET must contain at least 32 bytes.")
        return configured_key

    if os.getenv("ENVIRONMENT", "").strip().lower() in {"prod", "production", "vercel"}:
        raise ValueError("JWT_SECRET is required in production.")

    data_dir = _env_path("APP_DATA_DIR", "/app/data")
    data_dir.mkdir(parents=True, exist_ok=True)
    key_path = data_dir / ".jwt_signing_key"
    try:
        existing_key = key_path.read_text(encoding="ascii").strip()
    except FileNotFoundError:
        existing_key = ""
    if existing_key:
        if len(existing_key.encode("ascii")) < 32:
            raise ValueError("The persisted JWT signing key is invalid.")
        return existing_key

    generated_key = secrets.token_urlsafe(64)
    temporary_path = data_dir / f".jwt_signing_key.{secrets.token_hex(8)}.tmp"
    descriptor = os.open(temporary_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "w", encoding="ascii") as key_file:
            key_file.write(generated_key)
            key_file.flush()
            os.fsync(key_file.fileno())
        try:
            os.link(temporary_path, key_path)
        except FileExistsError:
            pass
    finally:
        temporary_path.unlink(missing_ok=True)

    persisted_key = key_path.read_text(encoding="ascii").strip()
    if len(persisted_key.encode("ascii")) < 32:
        raise ValueError("The persisted JWT signing key is invalid.")
    return persisted_key


class Settings(BaseModel):
    app_name: str = Field(default_factory=lambda: os.getenv("APP_NAME", "Fasl_ai_v2"))
    environment: str = Field(default_factory=lambda: os.getenv("ENVIRONMENT", "development").strip().lower())
    ai_service_enabled: bool = Field(default_factory=lambda: os.getenv("AI_SERVICE_ENABLED", "false" if os.getenv("ENVIRONMENT", "").strip().lower() in {"prod", "production", "vercel"} else "true").strip().lower() in {"1", "true", "yes"})
    debug: bool = Field(default=False)
    host: str = Field(default="0.0.0.0")
    port: int = Field(default=8000)
    database_auto_init: bool = Field(default_factory=lambda: os.getenv("DATABASE_AUTO_INIT", "true").strip().lower() in {"1", "true", "yes"})
    database_url: str = Field(default_factory=lambda: os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5433/educational_platform_v2"))
    jwt_secret_key: str = Field(default_factory=_jwt_secret_key)
    jwt_access_token_expire_minutes: int = Field(default_factory=lambda: int(os.getenv("JWT_ACCESS_TOKEN_EXPIRE_MINUTES", "60")), ge=1)
    data_dir: Path = Field(default_factory=lambda: _env_path("APP_DATA_DIR", "/app/data"))

    model_config = {"arbitrary_types_allowed": True}

    @model_validator(mode="after")
    def validate_production_settings(self) -> "Settings":
        if self.environment not in {"prod", "production", "vercel"}:
            return self

        if self.database_auto_init:
            raise ValueError("DATABASE_AUTO_INIT must be false in production.")

        database = urlparse(self.database_url)
        ssl_mode = parse_qs(database.query).get("sslmode", [""])[0].lower()
        if not database.hostname or not database.hostname.endswith(".pooler.supabase.com") or database.port != 6543:
            raise ValueError("Production DATABASE_URL must use the Supabase transaction pooler on port 6543.")
        if ssl_mode not in {"require", "verify-ca", "verify-full"}:
            raise ValueError("Production DATABASE_URL must enable SSL with sslmode=require or stronger.")
        if self.ai_service_enabled:
            ai_service_url = os.getenv("AI_SERVICE_URL", "").strip()
            ai_host = urlparse(ai_service_url).hostname if ai_service_url else None
            if not ai_host or ai_host in {"localhost", "127.0.0.1", "::1"}:
                raise ValueError("AI_SERVICE_URL must be a deployed external URL when AI_SERVICE_ENABLED is true in production.")
        return self

    def ensure_runtime_paths(self) -> None:
        if self.environment not in {"prod", "production", "vercel"}:
            self.data_dir.mkdir(parents=True, exist_ok=True)


settings = Settings()
settings.ensure_runtime_paths()
