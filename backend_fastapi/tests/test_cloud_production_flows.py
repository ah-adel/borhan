from __future__ import annotations

import hashlib
import time
from urllib.parse import parse_qs, urlparse

from fastapi.testclient import TestClient

from app.api.routes import auth as auth_routes
from app.api.routes import media as media_routes
from app.api.v1 import ai as ai_routes
from app.main import app
from app.services.cloud_media_service import create_bunny_playback_url, create_bunny_upload_signature
from app.services.email_service import hash_verification_token


client = TestClient(app)


def test_signup_requires_email_verification_and_issues_no_access_token(monkeypatch) -> None:
    sent_tokens: list[str] = []
    user = {
        "id": "new-user",
        "name": "New User",
        "email": "new@example.com",
        "role": "student",
        "status": "active",
        "is_verified": False,
    }

    monkeypatch.setattr(auth_routes, "get_platform_admin_settings", lambda: {"allowStudentSignup": True})
    monkeypatch.setattr(auth_routes, "get_user_by_email", lambda _email: None)
    monkeypatch.setattr(auth_routes, "create_user_record", lambda payload: {**user, **payload})
    monkeypatch.setattr(auth_routes, "reserve_email_verification", lambda *_args: True)

    async def capture_email(_email: str, token: str) -> None:
        sent_tokens.append(token)

    monkeypatch.setattr(auth_routes, "send_verification_email", capture_email)
    response = client.post(
        "/api/auth/sign-up",
        json={"email": user["email"], "password": "Secret123", "full_name": user["name"], "role": "student"},
    )

    assert response.status_code == 201, response.text
    data = response.json()["data"]
    assert data["verification_required"] is True
    assert "session" not in data
    assert len(sent_tokens) == 1


def test_email_verification_consumes_only_the_hashed_token(monkeypatch) -> None:
    submitted_tokens: list[str] = []
    raw_token = "a-valid-one-time-verification-token"

    def consume(token_hash: str) -> bool:
        submitted_tokens.append(token_hash)
        return token_hash == hash_verification_token(raw_token)

    monkeypatch.setattr(auth_routes, "consume_email_verification_token", consume)
    response = client.post("/api/auth/verify-email", json={"token": raw_token})

    assert response.status_code == 200, response.text
    assert response.json()["data"]["verified"] is True
    assert submitted_tokens == [hash_verification_token(raw_token)]


def test_unverified_account_cannot_sign_in(monkeypatch) -> None:
    user = {
        "id": "pending-user",
        "email": "pending@example.com",
        "role": "student",
        "status": "active",
        "is_verified": False,
        "password": "stored-hash",
    }
    monkeypatch.setattr(auth_routes, "get_user_by_email", lambda _email: user)
    monkeypatch.setattr(auth_routes, "verify_password", lambda *_args: (True, False))

    response = client.post("/api/auth/sign-in", json={"email": user["email"], "password": "Secret123"})

    assert response.status_code == 403
    assert response.json()["code"] == "email_not_verified"


def test_resend_throttle_does_not_call_brevo_when_reservation_is_denied(monkeypatch) -> None:
    user = {"id": "pending-user", "email": "pending@example.com", "is_verified": False}
    deliveries: list[str] = []
    monkeypatch.setattr(auth_routes, "get_user_by_email", lambda _email: user)
    monkeypatch.setattr(auth_routes, "reserve_email_verification", lambda *_args: False)

    async def record_delivery(email: str, _token: str) -> None:
        deliveries.append(email)

    monkeypatch.setattr(auth_routes, "send_verification_email", record_delivery)
    response = client.post("/api/auth/resend-verification", json={"email": user["email"]})

    assert response.status_code == 200
    assert response.json()["data"]["accepted"] is True
    assert deliveries == []


def test_unenrolled_user_cannot_receive_a_signed_download_url(monkeypatch) -> None:
    user = {"id": "student-1", "role": "student"}
    asset = {"id": "asset-1", "provider": "supabase", "object_key": "drafts/file.pdf"}
    monkeypatch.setattr(media_routes, "get_current_user", lambda _authorization: user)
    monkeypatch.setattr(media_routes, "get_media_asset", lambda _asset_id: asset)
    monkeypatch.setattr(media_routes, "can_access_media_asset", lambda *_args: False)

    async def must_not_sign(*_args, **_kwargs):
        raise AssertionError("A denied request must not receive a signed URL.")

    monkeypatch.setattr(media_routes, "create_supabase_download_url", must_not_sign)
    response = client.get("/api/media/assets/asset-1/signed-url", headers={"Authorization": "Bearer test"})

    assert response.status_code == 403


def test_enrolled_user_receives_a_short_lived_signed_attachment_url(monkeypatch) -> None:
    user = {"id": "student-1", "role": "student"}
    asset = {"id": "asset-1", "provider": "supabase", "object_key": "course/file.pdf"}
    monkeypatch.setattr(media_routes, "get_current_user", lambda _authorization: user)
    monkeypatch.setattr(media_routes, "get_media_asset", lambda _asset_id: asset)
    monkeypatch.setattr(media_routes, "can_access_media_asset", lambda *_args: True)

    async def signed_download(_object_key: str, expires_in: int) -> str:
        assert expires_in == 300
        return "https://storage.example/signed?expires=300"

    monkeypatch.setattr(media_routes, "create_supabase_download_url", signed_download)
    response = client.get("/api/media/assets/asset-1/signed-url", headers={"Authorization": "Bearer test"})

    assert response.status_code == 200, response.text
    assert response.json()["data"]["url"] == "https://storage.example/signed?expires=300"


def test_bunny_upload_ticket_keeps_api_key_server_side(monkeypatch) -> None:
    user = {"id": "instructor-1", "role": "instructor"}
    monkeypatch.setattr(media_routes, "get_current_user", lambda _authorization: user)
    monkeypatch.setattr(media_routes, "create_media_asset", lambda *_args, **_kwargs: None)
    monkeypatch.setenv("BUNNY_STREAM_LIBRARY_ID", "library-17")
    monkeypatch.setenv("BUNNY_STREAM_API_KEY", "server-api-key-not-returned")

    async def create_video(_title: str) -> str:
        return "video-guid"

    monkeypatch.setattr(media_routes, "create_bunny_video", create_video)
    response = client.post(
        "/api/media/videos/upload-ticket",
        headers={"Authorization": "Bearer test"},
        json={"filename": "lesson.mp4", "content_type": "video/mp4", "size": 2048},
    )

    assert response.status_code == 201, response.text
    ticket = response.json()["data"]
    assert ticket["video_id"] == "video-guid"
    assert ticket["library_id"] == "library-17"
    assert "signature" in ticket
    assert "server-api-key-not-returned" not in response.text


def test_linked_media_cannot_be_deleted_directly(monkeypatch) -> None:
    user = {"id": "instructor-1", "role": "instructor"}
    asset = {"id": "asset-1", "provider": "bunny", "remote_id": "video-guid"}
    monkeypatch.setattr(media_routes, "get_current_user", lambda _authorization: user)
    monkeypatch.setattr(media_routes, "get_media_asset", lambda _asset_id: asset)
    monkeypatch.setattr(media_routes, "can_access_media_asset", lambda *_args: True)
    monkeypatch.setattr(media_routes, "is_media_asset_referenced", lambda _asset_id: True)

    async def must_not_delete(_asset) -> None:
        raise AssertionError("A referenced media asset must not be deleted.")

    monkeypatch.setattr(media_routes, "delete_cloud_media_asset", must_not_delete)
    response = client.delete("/api/media/assets/asset-1", headers={"Authorization": "Bearer test"})

    assert response.status_code == 409


def test_cors_preflight_allows_local_frontend() -> None:
    response = client.options(
        "/api/auth/sign-in",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"},
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


def test_ai_endpoints_return_503_when_disabled(monkeypatch) -> None:
    monkeypatch.setattr(ai_routes.settings, "ai_service_enabled", False)
    response = client.get("/api/v1/ai/jobs/not-running")
    assert response.status_code == 503


def test_attachment_ticket_is_server_authorized_and_returns_cloud_reference(monkeypatch) -> None:
    user = {"id": "instructor-1", "role": "instructor"}
    created_assets: list[dict[str, object]] = []
    monkeypatch.setattr(media_routes, "get_current_user", lambda _authorization: user)
    monkeypatch.setattr(media_routes, "create_media_asset", lambda asset_id, **values: created_assets.append({"id": asset_id, **values}))

    async def signed_ticket(object_key: str, _content_type: str) -> dict[str, str]:
        return {"path": object_key, "token": "signed-upload-token", "signed_url": "https://storage.example/upload"}

    monkeypatch.setattr(media_routes, "create_supabase_upload_ticket", signed_ticket)
    response = client.post(
        "/api/media/attachments/upload-ticket",
        headers={"Authorization": "Bearer test"},
        json={"filename": "course.pdf", "content_type": "application/pdf", "size": 120},
    )

    assert response.status_code == 201, response.text
    data = response.json()["data"]
    assert data["asset_url"].startswith("cloud-asset:")
    assert data["token"] == "signed-upload-token"
    assert created_assets[0]["provider"] == "supabase"


def test_bunny_upload_and_playback_signatures_follow_provider_formula(monkeypatch) -> None:
    library_id = "library-17"
    api_key = "server-api-key"
    video_id = "video-guid"
    expires_at = int(time.time()) + 3600
    token_key = "private-token-key"
    monkeypatch.setenv("BUNNY_STREAM_LIBRARY_ID", library_id)
    monkeypatch.setenv("BUNNY_STREAM_API_KEY", api_key)
    monkeypatch.setenv("BUNNY_STREAM_TOKEN_KEY", token_key)

    returned_library, upload_signature = create_bunny_upload_signature(video_id, expires_at)
    expected_upload_signature = hashlib.sha256(f"{library_id}{api_key}{expires_at}{video_id}".encode()).hexdigest()
    playback_url = create_bunny_playback_url(video_id, expires_in=300)
    playback_query = parse_qs(urlparse(playback_url).query)
    playback_expiry = int(playback_query["expires"][0])
    expected_playback_token = hashlib.sha256(f"{token_key}{video_id}{playback_expiry}".encode()).hexdigest()

    assert returned_library == library_id
    assert upload_signature == expected_upload_signature
    assert f"/embed/{library_id}/{video_id}?token=" in playback_url
    assert "&expires=" in playback_url
    assert playback_query["token"] == [expected_playback_token]