from __future__ import annotations

from datetime import datetime, timezone

import jwt
import pyotp
import pytest
from fastapi.testclient import TestClient

from app.api.routes import auth as auth_routes
from app.core import security
from app.core.config import settings
from app.main import app

client = TestClient(app)
NORMAL_EXPIRATION_MINUTES = 60
REMEMBER_ME_EXPIRATION_MINUTES = 14 * 24 * 60


def _user(role: str, *, mfa_enabled: bool = False) -> dict[str, object]:
    return {
        "id": f"{role}-test-user",
        "name": "Test User",
        "email": f"{role}@example.com",
        "password": "hashed-password",
        "role": role,
        "status": "active",
        "is_verified": True,
        "mfa_enabled": mfa_enabled,
    }


@pytest.fixture
def mock_auth_db(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(auth_routes, "get_platform_admin_settings", lambda: {"jwt_expiration_minutes": NORMAL_EXPIRATION_MINUTES})
    monkeypatch.setattr(security, "get_platform_admin_settings", lambda: {"jwt_expiration_minutes": NORMAL_EXPIRATION_MINUTES})
    monkeypatch.setattr(auth_routes, "verify_password", lambda *_args: (True, False))
    monkeypatch.setattr(auth_routes, "get_profile_by_user_id", lambda user_id: {
        "id": user_id,
        "full_name": "Test User",
        "role": "student",
        "avatar_url": None,
        "bio": None,
        "created_at": "2026-01-01T00:00:00+00:00",
        "updated_at": "2026-01-01T00:00:00+00:00",
    })


def _claims(token: str) -> dict[str, object]:
    return jwt.decode(token, settings.jwt_secret_key, algorithms=["HS256"])


@pytest.mark.parametrize("role", ["student", "instructor"])
@pytest.mark.parametrize(
    ("remember_me", "expected_minutes"),
    [(False, NORMAL_EXPIRATION_MINUTES), (True, REMEMBER_ME_EXPIRATION_MINUTES)],
)
def test_sign_in_uses_requested_lifetime_for_non_admin_roles(
    mock_auth_db: None,
    monkeypatch: pytest.MonkeyPatch,
    role: str,
    remember_me: bool,
    expected_minutes: int,
) -> None:
    user = _user(role)
    monkeypatch.setattr(auth_routes, "get_user_by_email", lambda _email: user)

    response = client.post(
        "/api/auth/sign-in",
        json={"email": user["email"], "password": "Secret123", "remember_me": remember_me},
    )

    assert response.status_code == 200, response.text
    session = response.json()["data"]["session"]
    claims = _claims(session["access_token"])
    assert claims["exp"] - claims["iat"] == expected_minutes * 60
    assert session["expires_at"]


def test_sign_in_ignores_remember_me_for_admin(
    mock_auth_db: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = _user("admin")
    monkeypatch.setattr(auth_routes, "get_user_by_email", lambda _email: user)

    response = client.post(
        "/api/auth/sign-in",
        json={"email": user["email"], "password": "Secret123", "remember_me": True},
    )

    assert response.status_code == 200, response.text
    claims = _claims(response.json()["data"]["session"]["access_token"])
    assert claims["exp"] - claims["iat"] == NORMAL_EXPIRATION_MINUTES * 60


def test_admin_token_factory_clamps_explicit_long_lifetime(
    mock_auth_db: None,
) -> None:
    token = security.create_access_token(
        "admin-test-user",
        "admin",
        expires_minutes=REMEMBER_ME_EXPIRATION_MINUTES,
    )

    claims = _claims(token)
    assert claims["exp"] - claims["iat"] == NORMAL_EXPIRATION_MINUTES * 60


def test_mfa_challenge_defers_remembered_token_until_verified(
    mock_auth_db: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user = _user("student", mfa_enabled=True)
    monkeypatch.setattr(auth_routes, "get_user_by_email", lambda _email: user)
    monkeypatch.setattr(auth_routes, "get_user_mfa_lock", lambda _user_id: None)

    challenge_response = client.post(
        "/api/auth/sign-in",
        json={"email": user["email"], "password": "Secret123", "remember_me": True},
    )

    assert challenge_response.status_code == 200, challenge_response.text
    challenge = challenge_response.json()["data"]
    assert "session" not in challenge
    challenge_claims = _claims(challenge["challenge_token"])
    assert challenge_claims["exp"] - challenge_claims["iat"] == 5 * 60

    secret = pyotp.random_base32()
    monkeypatch.setattr(auth_routes, "get_user_from_mfa_authorization", lambda _authorization: (user, "mfa_challenge"))
    monkeypatch.setattr(auth_routes, "get_user_mfa_secret", lambda _user_id, *, pending=False: secret)
    monkeypatch.setattr(auth_routes, "enable_user_mfa", lambda _user_id: True)
    monkeypatch.setattr(auth_routes, "reset_user_mfa_attempts", lambda _user_id: None)
    mfa_response = client.post(
        "/api/auth/mfa/verify",
        headers={"Authorization": f"Bearer {challenge['challenge_token']}"},
        json={"code": pyotp.TOTP(secret).now(), "remember_me": True},
    )

    assert mfa_response.status_code == 200, mfa_response.text
    claims = _claims(mfa_response.json()["data"]["session"]["access_token"])
    assert claims["exp"] - claims["iat"] == REMEMBER_ME_EXPIRATION_MINUTES * 60
    assert claims["mfa_verified"] is True


def test_expired_access_token_is_rejected(
    mock_auth_db: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    token = security.create_access_token(
        "student-test-user",
        "student",
        expires_minutes=-1,
    )
    monkeypatch.setattr(security, "get_user_by_id", lambda _user_id: _user("student"))

    assert security.get_current_user(f"Bearer {token}") is None