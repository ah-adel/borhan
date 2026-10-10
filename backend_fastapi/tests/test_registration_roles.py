from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app import db
from app.api.routes import admin as admin_routes
from app.api.routes import auth as auth_routes
from app.main import app

client = TestClient(app)


@pytest.fixture
def isolated_account_store(monkeypatch: pytest.MonkeyPatch) -> dict[str, object]:
    users: dict[str, dict[str, object]] = {}
    verification_emails: list[str] = []
    actors = {
        "admin-token": {"id": "admin-1", "role": "admin"},
        "student-token": {"id": "student-test", "role": "student"},
        "instructor-token": {"id": "instructor-test", "role": "instructor"},
    }

    def create_user(payload: dict[str, object]) -> dict[str, object]:
        email = str(payload["email"]).strip().lower()
        user = {
            **payload,
            "id": str(payload["id"]),
            "name": str(payload["name"]),
            "email": email,
            "password": db._normalize_password(str(payload["password"])),
            "status": str(payload.get("status", "active")),
            "is_verified": bool(payload.get("is_verified", False)),
            "avatar": None,
            "specialty": payload.get("specialty"),
            "joined_at": payload.get("joined_at"),
            "created_at": payload.get("created_at"),
            "updated_at": payload.get("updated_at"),
        }
        users[email] = user
        return user

    async def accept_verification_email(email: str, _token: str) -> None:
        verification_emails.append(email)

    def current_user(authorization: str | None) -> dict[str, str] | None:
        token = authorization.partition(" ")[2] if authorization else ""
        return actors.get(token)

    monkeypatch.setattr(auth_routes, "get_platform_admin_settings", lambda: {"allowStudentSignup": True})
    monkeypatch.setattr(auth_routes, "get_user_by_email", lambda email: users.get(email.lower()))
    monkeypatch.setattr(auth_routes, "create_user_record", create_user)
    monkeypatch.setattr(auth_routes, "reserve_email_verification", lambda *_args: True)
    monkeypatch.setattr(auth_routes, "send_verification_email", accept_verification_email)

    monkeypatch.setattr(admin_routes, "get_current_user", current_user)
    monkeypatch.setattr(
        admin_routes,
        "get_user_by_id",
        lambda user_id: next((actor for actor in actors.values() if actor["id"] == user_id), None),
    )
    monkeypatch.setattr(admin_routes, "get_all_users", lambda: list(users.values()))
    monkeypatch.setattr(admin_routes, "create_user_record", create_user)
    monkeypatch.setattr(admin_routes, "reserve_email_verification", lambda *_args: True)
    monkeypatch.setattr(admin_routes, "send_verification_email", accept_verification_email)
    monkeypatch.setattr(admin_routes, "get_admin_instructors", lambda: [])

    return {"users": users, "verification_emails": verification_emails}


def test_public_signup_rejects_instructor_and_still_accepts_students(isolated_account_store) -> None:
    users = isolated_account_store["users"]
    student_email = f"student-{uuid.uuid4().hex}@example.com"
    student = client.post(
        "/api/auth/sign-up",
        json={"email": student_email, "password": "SecurePass123", "full_name": "Public Student"},
    )
    assert student.status_code == 201, student.text
    assert student.json()["data"]["user"]["role"] == "student"
    assert users[student_email]["role"] == "student"

    instructor_email = f"instructor-{uuid.uuid4().hex}@example.com"
    rejected = client.post(
        "/api/auth/sign-up",
        json={
            "email": instructor_email,
            "password": "SecurePass123",
            "full_name": "Public Instructor",
            "role": "instructor",
        },
    )
    assert rejected.status_code == 422, rejected.text
    assert "student" in rejected.json()["error"].lower()
    assert instructor_email not in users

    mass_assignment_email = f"mass-assignment-{uuid.uuid4().hex}@example.com"
    mass_assignment = client.post(
        "/api/auth/sign-up",
        json={
            "email": mass_assignment_email,
            "password": "SecurePass123",
            "full_name": "Mass Assignment Attempt",
            "user_type": "instructor",
            "is_instructor": True,
        },
    )
    assert mass_assignment.status_code == 422, mass_assignment.text
    assert mass_assignment_email not in users


def test_admin_can_create_instructor_with_hashed_password_and_verification(isolated_account_store) -> None:
    email = f"managed-{uuid.uuid4().hex}@example.com"
    response = client.post(
        "/api/admin/instructors",
        headers={"Authorization": "Bearer admin-token"},
        json={"full_name": "Admin Instructor", "email": email, "password": "SecurePass123"},
    )

    assert response.status_code == 201, response.text
    user = isolated_account_store["users"][email]
    assert user["role"] == "instructor"
    assert user["password"].startswith("pbkdf2_sha256$")
    assert isolated_account_store["verification_emails"] == [email]


@pytest.mark.parametrize("token", ["student-token", "instructor-token"])
def test_non_admin_cannot_create_instructor_accounts(isolated_account_store, token: str) -> None:
    response = client.post(
        "/api/admin/instructors",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "full_name": "Forbidden Instructor",
            "email": f"forbidden-{uuid.uuid4().hex}@example.com",
            "password": "SecurePass123",
        },
    )

    assert response.status_code == 403, response.text


def test_admin_instructor_creation_rejects_duplicate_email(isolated_account_store) -> None:
    email = f"duplicate-{uuid.uuid4().hex}@example.com"
    payload = {"full_name": "Duplicate Instructor", "email": email, "password": "SecurePass123"}
    headers = {"Authorization": "Bearer admin-token"}

    first = client.post("/api/admin/instructors", headers=headers, json=payload)
    duplicate = client.post("/api/admin/instructors", headers=headers, json=payload)

    assert first.status_code == 201, first.text
    assert duplicate.status_code == 409, duplicate.text
    assert "already exists" in duplicate.json()["error"]