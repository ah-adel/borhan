from __future__ import annotations

import asyncio
import os
from datetime import datetime, timedelta, timezone

from app.db import create_user_record, get_user_by_email, reserve_email_verification
from app.services.email_service import create_verification_token, hash_verification_token, send_verification_email


async def bootstrap_admin() -> None:
    email = os.getenv("INITIAL_ADMIN_EMAIL", "").strip().lower()
    password = os.getenv("INITIAL_ADMIN_PASSWORD", "")
    name = os.getenv("INITIAL_ADMIN_NAME", "Platform Administrator").strip()
    if not email or len(password) < 16:
        raise RuntimeError("Set INITIAL_ADMIN_EMAIL and an INITIAL_ADMIN_PASSWORD of at least 16 characters.")

    existing = get_user_by_email(email)
    if existing is not None and existing.get("id") != "admin-1":
        raise RuntimeError("INITIAL_ADMIN_EMAIL is already assigned to another account.")

    create_user_record({
        "id": "admin-1",
        "name": name,
        "email": email,
        "password": password,
        "role": "admin",
        "status": "active",
        "is_verified": False,
        "permissions": {"manage_courses": 1, "moderate_students": 1, "view_analytics": 1},
        "profile_full_name": name,
        "profile_bio": "Platform administrator.",
    })
    token = create_verification_token()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)
    if reserve_email_verification("admin-1", hash_verification_token(token), expires_at):
        await send_verification_email(email, token)
    print(f"Platform administrator provisioned for {email}; verify its email before signing in.")


if __name__ == "__main__":
    asyncio.run(bootstrap_admin())