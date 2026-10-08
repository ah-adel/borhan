from __future__ import annotations

import argparse
import getpass
import json
from datetime import datetime, timezone

from fastapi.testclient import TestClient

from app.core.security import get_current_user
from app.db import _normalize_password, get_connection, get_user_by_id, verify_password
from app.main import app


OWNER_ID = "admin-1"
ADMIN_PERMISSIONS = {
    "manage_courses": 1,
    "moderate_students": 1,
    "view_analytics": 1,
}


def provision(email: str, name: str, password: str) -> None:
    normalized_email = email.strip().lower()
    now = datetime.now(timezone.utc).isoformat()
    hashed_password = _normalize_password(password)
    permissions = json.dumps(ADMIN_PERMISSIONS, separators=(",", ":"))

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                "SELECT id, email FROM users WHERE id = %s OR LOWER(email) = %s FOR UPDATE",
                (OWNER_ID, normalized_email),
            )
            rows = cursor.fetchall()
            owner = next((row for row in rows if row[0] == OWNER_ID), None)
            existing_email = next((row for row in rows if row[1].lower() == normalized_email), None)

            if owner is not None and owner[1].lower() != normalized_email:
                raise RuntimeError("The reserved platform-owner ID already belongs to another email; no changes were made.")
            if existing_email is not None and existing_email[0] != OWNER_ID:
                raise RuntimeError("This email belongs to a different user ID; promoting it would break the platform-owner identity, so no changes were made.")

            cursor.execute(
                """
                INSERT INTO users (
                    id, name, email, password, role, status, permissions,
                    joined_at, created_at, updated_at, is_verified
                ) VALUES (%s, %s, %s, %s, 'admin', 'active', %s, %s, %s, %s, TRUE)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    email = EXCLUDED.email,
                    password = EXCLUDED.password,
                    role = EXCLUDED.role,
                    status = EXCLUDED.status,
                    permissions = EXCLUDED.permissions,
                    updated_at = EXCLUDED.updated_at,
                    is_verified = TRUE
                """,
                (OWNER_ID, name.strip(), normalized_email, hashed_password, permissions, now, now, now),
            )
            cursor.execute(
                """
                INSERT INTO profiles (id, full_name, role, avatar_url, bio, created_at, updated_at)
                VALUES (%s, %s, 'admin', NULL, 'Platform administrator.', %s, %s)
                ON CONFLICT (id) DO UPDATE SET
                    full_name = EXCLUDED.full_name,
                    role = EXCLUDED.role,
                    bio = EXCLUDED.bio,
                    updated_at = EXCLUDED.updated_at
                """,
                (OWNER_ID, name.strip(), now, now),
            )
        connection.commit()

    user = get_user_by_id(OWNER_ID)
    if (
        user is None
        or user.get("email") != normalized_email
        or user.get("role") != "admin"
        or user.get("status") != "active"
        or not user.get("is_verified")
        or user.get("permissions") != ADMIN_PERMISSIONS
        or not verify_password(password, user["password"])[0]
    ):
        raise RuntimeError("The persisted platform administrator did not pass record validation.")

    with TestClient(app) as client:
        response = client.post(
            "/api/auth/sign-in",
            json={"email": normalized_email, "password": password},
        )
        if response.status_code != 200:
            raise RuntimeError(f"Auth API rejected the new credentials (HTTP {response.status_code}).")

        result = response.json().get("data", {})
        if result.get("user", {}).get("id") != OWNER_ID or result.get("user", {}).get("role") != "admin":
            raise RuntimeError("Auth API returned an unexpected account identity or role.")

        access_token = result.get("session", {}).get("access_token")
        if not access_token:
            raise RuntimeError("Password was accepted, but MFA is required before an authenticated session is issued.")

        authenticated_user = get_current_user(f"Bearer {access_token}")
        if authenticated_user is None or authenticated_user.get("id") != OWNER_ID:
            raise RuntimeError("The issued access token failed authentication against the current security service.")

        admin_response = client.get(
            "/api/admin/settings",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if admin_response.status_code != 200:
            raise RuntimeError(f"The authenticated account failed the admin API check (HTTP {admin_response.status_code}).")

    print(f"Super Admin provisioned and authenticated: {normalized_email} ({OWNER_ID}).")


def main() -> None:
    parser = argparse.ArgumentParser(description="Provision the platform's reserved Super Admin account.")
    parser.add_argument("--email", required=True, help="Email address for the platform owner account.")
    parser.add_argument("--name", default="Platform Administrator", help="Display name for the account.")
    args = parser.parse_args()
    password = getpass.getpass("New Super Admin password: ")
    if not password:
        parser.error("Password cannot be empty.")
    provision(args.email, args.name, password)


if __name__ == "__main__":
    main()