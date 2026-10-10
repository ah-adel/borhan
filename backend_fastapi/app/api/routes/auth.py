from __future__ import annotations

import threading
import time
import uuid
from collections import deque
from datetime import datetime, timedelta, timezone
from typing import Any

import pyotp
from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Query, Request, status
from pydantic import BaseModel, Field

from app.core.config import settings
from app.core.security import create_access_token, get_current_user, get_user_from_mfa_authorization
from app.db import (
    consume_email_verification_token,
    create_user_record,
    enable_user_mfa,
    get_all_users,
    get_platform_admin_settings,
    get_profile_by_user_id,
    get_password_reset_email,
    get_user_by_email,
    get_user_mfa_lock,
    get_user_mfa_secret,
    reserve_email_verification,
    reserve_password_reset_token,
    record_failed_mfa_attempt,
    reset_user_mfa_attempts,
    save_pending_mfa_secret,
    update_user_account,
    reset_password_with_token,
    upgrade_user_password_hash,
    verify_password,
)
from app.services.email_service import EmailDeliveryError, create_verification_token, hash_verification_token, send_password_reset_email, send_verification_email
from app.schemas.auth import AccountProfileUpdate, CompletePasswordResetRequest, ForgotPasswordRequest, SignInRequest, SignUpRequest
from app.schemas.common import ApiErrorResponse, ApiSuccessResponse

router = APIRouter()


class _PasswordResetRateLimiter:
    """Process-local buckets reset on restart and are not shared across instances."""

    window_seconds = 3600

    def __init__(self) -> None:
        self._buckets: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def _allow(self, limits: tuple[tuple[str, int], ...]) -> bool:
        now = time.monotonic()
        with self._lock:
            buckets = [(key, limit, self._buckets.setdefault(key, deque())) for key, limit in limits]
            for _, _, bucket in buckets:
                while bucket and bucket[0] <= now - self.window_seconds:
                    bucket.popleft()
            if any(len(bucket) >= limit for _, limit, bucket in buckets):
                return False
            for _, _, bucket in buckets:
                bucket.append(now)
            if len(self._buckets) > 10000:
                for key, bucket in list(self._buckets.items()):
                    while bucket and bucket[0] <= now - self.window_seconds:
                        bucket.popleft()
                    if not bucket:
                        self._buckets.pop(key, None)
                while len(self._buckets) > 10000:
                    oldest_key = min(self._buckets, key=lambda key: self._buckets[key][-1])
                    self._buckets.pop(oldest_key, None)
            return True

    def allow_forgot(self, ip: str, email: str) -> bool:
        return self._allow(((f"forgot-ip:{ip}", 10), (f"forgot-email:{email}", 3)))

    def allow_reset_ip(self, ip: str) -> bool:
        return self._allow(((f"reset-ip:{ip}", 10),))

    def allow_reset_email(self, email: str) -> bool:
        return self._allow(((f"reset-email:{email}", 5),))

    def allow_reset_token(self, token_hash: str) -> bool:
        return self._allow(((f"reset-token:{token_hash}", 5),))

    def clear(self) -> None:
        with self._lock:
            self._buckets.clear()


_password_reset_limiter = _PasswordResetRateLimiter()


def _request_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


async def _process_password_reset_request(email: str) -> None:
    user = get_user_by_email(email)
    if user is None:
        return
    token = create_verification_token()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)
    if reserve_password_reset_token(user["id"], hash_verification_token(token), expires_at):
        await send_password_reset_email(user["email"], token)


def _reset_rate_limited() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail={"error": "Too many password reset attempts. Try again later.", "code": "password_reset_rate_limited"},
    )


class MfaVerificationRequest(BaseModel):
    code: str = Field(..., pattern=r"^\d{6}$")
    remember_me: bool = False


class EmailVerificationRequest(BaseModel):
    token: str = Field(..., min_length=32, max_length=128)


class ResendVerificationRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=254)


def _auth_result(
    user: dict[str, Any],
    profile: dict[str, Any],
    access_token: str,
    expires_at: datetime,
) -> ApiSuccessResponse[dict[str, Any]]:
    return ApiSuccessResponse(
        data={
            "user": {"id": user["id"], "email": user["email"], "role": user["role"]},
            "session": {
                "user_id": user["id"],
                "email": user["email"],
                "authenticated": True,
                "access_token": access_token,
                "token_type": "bearer",
                "expires_at": expires_at.isoformat(),
            },
            "profile": profile,
        },
        message="Signed in successfully.",
    )


REMEMBER_ME_TOKEN_EXPIRE_MINUTES = 14 * 24 * 60


def _issue_access_token(
    user: dict[str, Any],
    *,
    remember_me: bool = False,
    mfa_verified: bool = False,
) -> tuple[str, datetime]:
    platform_settings = get_platform_admin_settings()
    configured_expiration = platform_settings.get("jwt_expiration_minutes", settings.jwt_access_token_expire_minutes)
    normal_expiration = (
        configured_expiration
        if isinstance(configured_expiration, int)
        and not isinstance(configured_expiration, bool)
        and configured_expiration > 0
        else settings.jwt_access_token_expire_minutes
    )
    expires_minutes = (
        REMEMBER_ME_TOKEN_EXPIRE_MINUTES
        if remember_me and user["role"] != "admin"
        else normal_expiration
    )
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=expires_minutes)
    token = create_access_token(
        user["id"],
        user["role"],
        mfa_verified=mfa_verified,
        expires_minutes=expires_minutes,
        session_version=int(user.get("session_version", 0)),
    )
    return token, expires_at


def _mfa_challenge_result(user: dict[str, Any], setup_required: bool) -> ApiSuccessResponse[dict[str, Any]]:
    purpose = "mfa_setup" if setup_required else "mfa_challenge"
    return ApiSuccessResponse(
        data={
            "user": {"id": user["id"], "email": user["email"], "role": user["role"]},
            "mfa_required": not setup_required,
            "mfa_setup_required": setup_required,
            "challenge_token": create_access_token(
                user["id"],
                user["role"],
                token_purpose=purpose,
                expires_minutes=5,
                session_version=int(user.get("session_version", 0)),
            ),
        },
        message="Complete multi-factor authentication to continue.",
    )


def _profile_payload(user: dict[str, Any]) -> dict[str, Any]:
    profile = get_profile_by_user_id(user["id"]) or {
        "id": user["id"],
        "full_name": user["name"],
        "role": user["role"],
        "avatar_url": user.get("avatar"),
        "bio": None,
        "created_at": user.get("created_at") or datetime.now(timezone.utc).isoformat(),
        "updated_at": user.get("updated_at") or datetime.now(timezone.utc).isoformat(),
    }
    return {
        "id": profile["id"],
        "full_name": profile["full_name"],
        "role": profile["role"],
        "avatar_url": profile.get("avatar_url"),
        "bio": profile.get("bio"),
        "created_at": profile["created_at"],
        "updated_at": profile["updated_at"],
    }


@router.post(
    "/auth/sign-up",
    response_model=ApiSuccessResponse[dict[str, Any]],
    status_code=status.HTTP_201_CREATED,
    responses={400: {"model": ApiErrorResponse}, 409: {"model": ApiErrorResponse}},
)
async def sign_up(payload: SignUpRequest) -> ApiSuccessResponse[dict[str, Any]]:
    normalized_email = payload.email.strip().lower()
    normalized_password = payload.password.strip()
    platform_settings = get_platform_admin_settings()
    if payload.role == "student" and not platform_settings.get("allowStudentSignup", True):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"error": "Student registration is currently closed."})
    existing = get_user_by_email(normalized_email)
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"error": "An account with that email already exists."})

    now = datetime.now(timezone.utc).isoformat()
    user_id = str(uuid.uuid4())
    user = create_user_record({
        "id": user_id,
        "name": payload.full_name.strip(),
        "email": normalized_email,
        "password": normalized_password,
        "role": payload.role,
        "status": "active",
        "is_verified": False,
        "verification_status": "pending" if payload.role == "instructor" else "approved",
        "avatar": None,
        "permissions": {"manage_courses": 1, "moderate_students": 1, "view_analytics": 1},
        "joined_at": now,
        "created_at": now,
        "updated_at": now,
        "profile_full_name": payload.full_name.strip(),
        "profile_avatar_url": None,
        "profile_bio": None,
    })

    token = create_verification_token()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)
    if not reserve_email_verification(user_id, hash_verification_token(token), expires_at):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail={"error": "Please wait before requesting another verification email."})
    try:
        await send_verification_email(normalized_email, token)
    except EmailDeliveryError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail={"error": "Account created, but the verification email could not be sent. Request another email shortly."}) from exc

    return ApiSuccessResponse(
        data={
            "user": {"id": user["id"], "email": user["email"], "role": user["role"]},
            "verification_required": True,
        },
        message="Check your email for the verification link.",
    )


@router.post("/auth/verify-email", response_model=ApiSuccessResponse[dict[str, bool]])
async def verify_email(payload: EmailVerificationRequest) -> ApiSuccessResponse[dict[str, bool]]:
    if not consume_email_verification_token(hash_verification_token(payload.token)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"error": "Verification link is invalid, expired, or already used."})
    return ApiSuccessResponse(data={"verified": True}, message="Email address verified successfully.")


@router.post("/auth/resend-verification", response_model=ApiSuccessResponse[dict[str, bool]])
async def resend_verification(payload: ResendVerificationRequest) -> ApiSuccessResponse[dict[str, bool]]:
    user = get_user_by_email(payload.email.strip().lower())
    if user is not None and not user.get("is_verified", False):
        token = create_verification_token()
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)
        if reserve_email_verification(user["id"], hash_verification_token(token), expires_at):
            try:
                await send_verification_email(user["email"], token)
            except EmailDeliveryError:
                pass
    return ApiSuccessResponse(data={"accepted": True}, message="If the account needs verification, an email will be sent.")


@router.post("/auth/forgot-password", response_model=ApiSuccessResponse[dict[str, bool]])
async def forgot_password(
    payload: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    request: Request,
) -> ApiSuccessResponse[dict[str, bool]]:
    if _password_reset_limiter.allow_forgot(_request_ip(request), payload.email):
        background_tasks.add_task(_process_password_reset_request, payload.email)
    return ApiSuccessResponse(
        data={"accepted": True},
        message="If an account exists for this email, a password reset link will be sent.",
    )


@router.post("/auth/reset-password", response_model=ApiSuccessResponse[dict[str, bool]])
async def reset_password(
    payload: CompletePasswordResetRequest,
    request: Request,
) -> ApiSuccessResponse[dict[str, bool]]:
    if not _password_reset_limiter.allow_reset_ip(_request_ip(request)):
        raise _reset_rate_limited()

    new_password = payload.new_password.strip()
    if not 6 <= len(new_password) <= 128:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"error": "Password must be between 6 and 128 characters long."},
        )

    token_hash = hash_verification_token(payload.token)
    reset_email = get_password_reset_email(token_hash)
    allowed = (
        _password_reset_limiter.allow_reset_email(reset_email.strip().lower())
        if reset_email
        else _password_reset_limiter.allow_reset_token(token_hash)
    )
    if not allowed:
        raise _reset_rate_limited()

    if not reset_password_with_token(token_hash, new_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "Password reset link is invalid, expired, or already used.",
                "code": "password_reset_invalid",
            },
        )
    return ApiSuccessResponse(data={"reset": True}, message="Password updated successfully.")


@router.post(
    "/auth/sign-in",
    response_model=ApiSuccessResponse[dict[str, Any]],
    status_code=status.HTTP_200_OK,
    responses={400: {"model": ApiErrorResponse}, 401: {"model": ApiErrorResponse}},
)
async def sign_in(payload: SignInRequest) -> ApiSuccessResponse[dict[str, Any]]:
    normalized_email = payload.email.strip().lower()
    normalized_password = payload.password.strip()
    user = get_user_by_email(normalized_email)
    if user is None or user.get("status") != "active":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"error": "Invalid email or password."})
    password_valid, needs_upgrade = verify_password(normalized_password, user["password"])
    if not password_valid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"error": "Invalid email or password."})
    if not user.get("is_verified", False):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"error": "Email verification is required before signing in.", "code": "email_not_verified"})
    if needs_upgrade:
        upgrade_user_password_hash(user["id"], normalized_password)

    platform_settings = get_platform_admin_settings()
    if platform_settings.get("enforce_mfa") or user.get("mfa_enabled"):
        mfa_lock = get_user_mfa_lock(user["id"])
        if mfa_lock and mfa_lock[1] and mfa_lock[1] > datetime.now(timezone.utc):
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail={"error": "Multi-factor verification is temporarily locked. Try again later."})
        return _mfa_challenge_result(user, setup_required=not user.get("mfa_enabled", False))

    profile = _profile_payload(user)
    access_token, expires_at = _issue_access_token(user, remember_me=payload.remember_me)
    return _auth_result(user, profile, access_token, expires_at)


@router.post("/auth/mfa/setup", response_model=ApiSuccessResponse[dict[str, str]])
async def setup_mfa(authorization: str | None = Header(default=None, alias="Authorization")) -> ApiSuccessResponse[dict[str, str]]:
    authentication = get_user_from_mfa_authorization(authorization)
    if authentication is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"error": "Authentication required."})
    user, token_purpose = authentication
    if token_purpose == "mfa_challenge":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"error": "A verification challenge cannot start MFA enrollment."})

    secret = pyotp.random_base32()
    if not save_pending_mfa_secret(user["id"], secret):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"error": "Account is unavailable."})
    totp = pyotp.TOTP(secret)
    return ApiSuccessResponse(
        data={
            "secret": secret,
            "otpauth_url": totp.provisioning_uri(name=user["email"], issuer_name=settings.app_name),
        },
        message="Add this account to an authenticator app, then verify the current code.",
    )


@router.post("/auth/mfa/verify", response_model=ApiSuccessResponse[dict[str, Any]])
async def verify_mfa(
    payload: MfaVerificationRequest,
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> ApiSuccessResponse[dict[str, Any]]:
    authentication = get_user_from_mfa_authorization(authorization)
    if authentication is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"error": "Authentication required."})
    user, token_purpose = authentication
    lock = get_user_mfa_lock(user["id"])
    if lock and lock[1] and lock[1] > datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail={"error": "Multi-factor verification is temporarily locked. Try again later."})

    enrolling = token_purpose in {"mfa_setup", "access"}
    secret = get_user_mfa_secret(user["id"], pending=enrolling)
    if not secret:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"error": "MFA setup is required before verification."})
    if not pyotp.TOTP(secret).verify(payload.code, valid_window=1):
        record_failed_mfa_attempt(user["id"])
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"error": "The authenticator code is invalid."})

    if enrolling and not enable_user_mfa(user["id"]):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"error": "MFA enrollment could not be completed."})
    reset_user_mfa_attempts(user["id"])
    refreshed_user = {**user, "mfa_enabled": True}
    access_token, expires_at = _issue_access_token(
        user,
        remember_me=payload.remember_me,
        mfa_verified=True,
    )
    return _auth_result(refreshed_user, _profile_payload(user), access_token, expires_at)


@router.get(
    "/auth/me",
    response_model=ApiSuccessResponse[dict[str, Any]],
    status_code=status.HTTP_200_OK,
    responses={404: {"model": ApiErrorResponse}},
)
async def get_me(authorization: str | None = Header(default=None, alias="Authorization")) -> ApiSuccessResponse[dict[str, Any]]:
    user = get_current_user(authorization)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"error": "Authentication required."})

    profile = _profile_payload(user)
    return ApiSuccessResponse(
        data={
            "user": {
                "id": user["id"],
                "email": user["email"],
                "role": user["role"],
            },
            "profile": profile,
        },
        message="Profile loaded successfully.",
    )


@router.patch(
    "/auth/profile",
    response_model=ApiSuccessResponse[dict[str, Any]],
    status_code=status.HTTP_200_OK,
    responses={401: {"model": ApiErrorResponse}, 404: {"model": ApiErrorResponse}, 409: {"model": ApiErrorResponse}},
)
async def update_profile(
    payload: AccountProfileUpdate,
    user_id: str = Query(..., min_length=1),
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> ApiSuccessResponse[dict[str, Any]]:
    current_user = get_current_user(authorization)
    if current_user is None or current_user["id"] != user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"error": "Authentication required."})

    existing_email_owner = get_user_by_email(payload.email)
    if existing_email_owner is not None and existing_email_owner["id"] != user_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"error": "An account with that email already exists."})

    user = update_user_account(user_id, payload.full_name, payload.email, payload.bio)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"error": "User not found."})

    email_changed = payload.email.strip().lower() != current_user["email"].strip().lower()
    if email_changed:
        token = create_verification_token()
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=30)
        if not reserve_email_verification(user_id, hash_verification_token(token), expires_at):
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail={"error": "Please wait before requesting another verification email."})
        try:
            await send_verification_email(user["email"], token)
        except EmailDeliveryError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={
                    "error": "Email updated, but the verification message could not be sent. Request another email shortly.",
                    "code": "email_not_verified",
                },
            ) from exc

    return ApiSuccessResponse(
        data={
            "user": {"id": user["id"], "email": user["email"], "role": user["role"]},
            "profile": _profile_payload(user),
            "verification_required": email_changed,
        },
        message="Verify the new email address before signing in again." if email_changed else "Profile updated successfully.",
    )


@router.get(
    "/users",
    response_model=ApiSuccessResponse[list[dict[str, Any]]],
    status_code=status.HTTP_200_OK,
    responses={401: {"model": ApiErrorResponse}, 403: {"model": ApiErrorResponse}},
)
async def list_users(
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> ApiSuccessResponse[list[dict[str, Any]]]:
    current_user = get_current_user(authorization)
    if current_user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"error": "Authentication required."})
    if current_user["role"] != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"error": "Admin access required."})

    users = get_all_users()
    normalized_users = [
        {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
            "role": user["role"],
            "status": user["status"],
            "avatar": user.get("avatar"),
            "joined_at": user.get("joined_at"),
            "created_at": user.get("created_at"),
            "updated_at": user.get("updated_at"),
        }
        for user in users
    ]

    return ApiSuccessResponse(
        data=normalized_users,
        message="Users retrieved successfully.",
    )


@router.post(
    "/auth/sign-out",
    response_model=ApiSuccessResponse[dict[str, bool]],
    status_code=status.HTTP_200_OK,
)
async def sign_out() -> ApiSuccessResponse[dict[str, bool]]:
    return ApiSuccessResponse(data={"signed_out": True}, message="Signed out successfully.")
