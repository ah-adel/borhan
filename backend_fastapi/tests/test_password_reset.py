from __future__ import annotations

import asyncio
import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
import pytest

from app.api.routes import auth as auth_routes
from app.core import security
from app.main import app
from app.services import email_service
from app.services.email_service import hash_verification_token


client = TestClient(app)


@pytest.fixture(autouse=True)
def clear_password_reset_limiter():
    auth_routes._password_reset_limiter.clear()
    yield
    auth_routes._password_reset_limiter.clear()


def test_forgot_password_response_does_not_reveal_account_existence(monkeypatch, caplog) -> None:
    raw_token = secrets.token_urlsafe(32)
    stored_hashes: list[str] = []
    delivered_tokens: list[str] = []

    def find_user(email: str):
        return {"id": "student-1", "email": email} if email == "known@example.test" else None

    async def capture_email(_email: str, token: str) -> bool:
        delivered_tokens.append(token)
        return True

    monkeypatch.setattr(auth_routes, "get_user_by_email", find_user)
    monkeypatch.setattr(auth_routes, "create_verification_token", lambda: raw_token)
    monkeypatch.setattr(
        auth_routes,
        "reserve_password_reset_token",
        lambda _user_id, token_hash, _expires_at: stored_hashes.append(token_hash) is None,
    )
    monkeypatch.setattr(auth_routes, "send_password_reset_email", capture_email)

    unknown = client.post("/api/auth/forgot-password", json={"email": "unknown@example.test"})
    with caplog.at_level(logging.WARNING):
        known = client.post("/api/auth/forgot-password", json={"email": "known@example.test"})

    assert unknown.status_code == known.status_code == 200
    assert unknown.json() == known.json()
    assert stored_hashes == [hash_verification_token(raw_token)]
    assert delivered_tokens == [raw_token]
    assert raw_token not in caplog.text, "Reset token leaked to logs."


def test_reset_password_rejects_expired_and_used_tokens_with_one_error(monkeypatch) -> None:
    now = datetime.now(timezone.utc)
    valid_token = secrets.token_urlsafe(32)
    expired_token = secrets.token_urlsafe(32)
    records = {
        hash_verification_token(valid_token): {"email": "student@example.test", "expires_at": now + timedelta(minutes=30), "used": False},
        hash_verification_token(expired_token): {"email": "expired@example.test", "expires_at": now - timedelta(seconds=1), "used": False},
    }

    def find_email(token_hash: str):
        record = records.get(token_hash)
        return record["email"] if record else None

    def consume(token_hash: str, _password: str) -> bool:
        record = records.get(token_hash)
        if not record or record["used"] or record["expires_at"] <= datetime.now(timezone.utc):
            return False
        record["used"] = True
        return True

    monkeypatch.setattr(auth_routes, "get_password_reset_email", find_email)
    monkeypatch.setattr(auth_routes, "reset_password_with_token", consume)

    expired = client.post("/api/auth/reset-password", json={"token": expired_token, "new_password": "new-password"})
    first_use = client.post("/api/auth/reset-password", json={"token": valid_token, "new_password": "new-password"})
    second_use = client.post("/api/auth/reset-password", json={"token": valid_token, "new_password": "another-password"})

    assert expired.status_code == second_use.status_code == 400
    assert expired.json()["error"] == second_use.json()["error"]
    assert expired.json()["code"] == second_use.json()["code"] == "password_reset_invalid"
    assert first_use.status_code == 200


def test_reset_password_enforces_registration_password_length(monkeypatch) -> None:
    def must_not_reset(*_args):
        raise AssertionError("Invalid password lengths must not reach password storage.")

    monkeypatch.setattr(auth_routes, "get_password_reset_email", lambda _token_hash: None)
    monkeypatch.setattr(auth_routes, "reset_password_with_token", must_not_reset)

    too_short = client.post("/api/auth/reset-password", json={"token": "", "new_password": "abcde"})
    too_long = client.post("/api/auth/reset-password", json={"token": "", "new_password": "x" * 129})

    assert too_short.status_code == 422
    assert too_long.status_code == 422


def test_forgot_password_rate_limits_per_email_without_changing_response(monkeypatch) -> None:
    lookups: list[str] = []
    monkeypatch.setattr(auth_routes, "get_user_by_email", lambda email: lookups.append(email) and None)

    responses = [
        client.post("/api/auth/forgot-password", json={"email": "same@example.test"})
        for _ in range(4)
    ]

    assert all(response.status_code == 200 for response in responses)
    assert all(response.json() == responses[0].json() for response in responses)
    assert len(lookups) == 3


def test_forgot_password_rate_limits_per_ip(monkeypatch) -> None:
    lookups: list[str] = []
    monkeypatch.setattr(auth_routes, "get_user_by_email", lambda email: lookups.append(email) and None)

    responses = [
        client.post("/api/auth/forgot-password", json={"email": f"student-{index}@example.test"})
        for index in range(11)
    ]

    assert all(response.status_code == 200 for response in responses)
    assert all(response.json() == responses[0].json() for response in responses)
    assert len(lookups) == 10


def test_reset_password_rate_limits_per_account_email(monkeypatch) -> None:
    token = secrets.token_urlsafe(32)
    monkeypatch.setattr(auth_routes, "get_password_reset_email", lambda _token_hash: "same@example.test")
    monkeypatch.setattr(auth_routes, "reset_password_with_token", lambda *_args: False)

    responses = [
        client.post("/api/auth/reset-password", json={"token": token, "new_password": "new-password"})
        for _ in range(6)
    ]

    assert all(response.status_code == 400 for response in responses[:5])
    assert responses[5].status_code == 429
    assert responses[5].json()["code"] == "password_reset_rate_limited"


def test_reset_password_rate_limits_per_ip(monkeypatch) -> None:
    tokens = [secrets.token_urlsafe(32) for _ in range(11)]
    monkeypatch.setattr(auth_routes, "get_password_reset_email", lambda _token_hash: None)
    monkeypatch.setattr(auth_routes, "reset_password_with_token", lambda *_args: False)

    responses = [
        client.post("/api/auth/reset-password", json={"token": token, "new_password": "new-password"})
        for token in tokens
    ]

    assert all(response.status_code == 400 for response in responses[:10])
    assert responses[10].status_code == 429
    assert responses[10].json()["code"] == "password_reset_rate_limited"


def test_brevo_password_reset_request_is_correct_and_failure_logs_are_redacted(monkeypatch, caplog) -> None:
    api_key = secrets.token_urlsafe(32)
    token = secrets.token_urlsafe(32)
    frontend_url = "https://frontend.example.test"
    reset_url = f"{frontend_url}/reset-password?token={token}"
    captured: dict[str, object] = {}

    class FakeResponse:
        is_success = False
        status_code = 400
        text = f'{{"message":"rejected","token":"{token}","url":"{reset_url}","api-key":"{api_key}"}}'

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def post(self, url, *, headers, json):
            captured.update({"url": url, "headers": headers, "payload": json})
            return FakeResponse()

    monkeypatch.setenv("BREVO_API_KEY", api_key)
    monkeypatch.setenv("EMAIL_FROM", "noreply@example.test")
    monkeypatch.setenv("EMAIL_FROM_NAME", "Borhan")
    monkeypatch.setenv("FRONTEND_URL", frontend_url + "/")
    monkeypatch.setattr(email_service.httpx, "AsyncClient", lambda **_kwargs: FakeClient())

    with caplog.at_level(logging.WARNING, logger="app.email"):
        result = asyncio.run(email_service.send_password_reset_email("student@example.test", token))

    assert result is False
    assert captured["url"] == "https://api.brevo.com/v3/smtp/email"
    headers = captured["headers"]
    assert isinstance(headers, dict)
    assert set(headers) == {"api-key", "accept", "content-type"}
    payload = captured["payload"]
    assert isinstance(payload, dict)
    assert payload["sender"] == {"name": "Borhan", "email": "noreply@example.test"}
    assert payload["to"] == [{"email": "student@example.test"}]
    assert reset_url in payload["textContent"]
    assert "30 minutes" in payload["textContent"]
    assert "30 دقيقة" in payload["textContent"]
    assert "status=400" in caplog.text
    assert api_key not in caplog.text, "Brevo API key leaked to logs."
    assert token not in caplog.text, "Reset token leaked to logs."
    assert reset_url not in caplog.text, "Reset link leaked to logs."


def test_password_reset_db_value_is_sha256_hex_not_raw_token() -> None:
    token = secrets.token_urlsafe(32)
    token_hash = hash_verification_token(token)

    assert token_hash == hashlib.sha256(token.encode("utf-8")).hexdigest()
    assert len(token_hash) == 64
    assert token_hash != token


def test_access_tokens_from_before_password_reset_are_revoked(monkeypatch) -> None:
    monkeypatch.setattr(
        security,
        "get_user_by_id",
        lambda _user_id: {
            "id": "student-1",
            "role": "student",
            "status": "active",
            "is_verified": True,
            "mfa_enabled": False,
            "session_version": 1,
        },
    )

    assert security._user_from_claims({"sub": "student-1", "role": "student", "session_version": 0}) is None
    assert security._user_from_claims({"sub": "student-1", "role": "student", "session_version": 1})["id"] == "student-1"