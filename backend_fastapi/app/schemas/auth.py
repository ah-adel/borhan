from __future__ import annotations

from typing import Literal

from pydantic import Field, field_validator

from app.schemas.common import BaseSchema, UserRole

def normalize_email(value: str) -> str:
    return value.strip().lower().replace(" ", "").replace("<", "").replace(">", "")


def is_valid_email(value: str) -> bool:
    import re
    return bool(re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value))


class SessionUser(BaseSchema):
    id: str = Field(..., min_length=1, description="Unique authenticated user ID.")
    email: str = Field(..., description="Authenticated email address.")
    role: UserRole = Field(..., description="User role in the platform.")

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        normalized = normalize_email(value)
        if not is_valid_email(normalized):
            raise ValueError("Email address is invalid.")
        return normalized


class UserSession(BaseSchema):
    user_id: str = Field(..., min_length=1, description="Session user ID.")
    email: str = Field(..., description="Current user email.")
    authenticated: bool = Field(default=True, description="Whether the session is authenticated.")

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        normalized = normalize_email(value)
        if not is_valid_email(normalized):
            raise ValueError("Email address is invalid.")
        return normalized


class SignInRequest(BaseSchema):
    email: str = Field(..., description="User email to sign in with.")
    password: str = Field(..., min_length=6, max_length=128, description="Password for the user account.")
    remember_me: bool = Field(default=False, description="Keep the session signed in for longer.")

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        normalized = normalize_email(value)
        if not is_valid_email(normalized):
            raise ValueError("Email address is invalid.")
        return normalized


class SignUpRequest(BaseSchema):
    email: str = Field(..., description="User email to register.")
    password: str = Field(..., min_length=6, max_length=128, description="Password for registration.")
    full_name: str = Field(..., min_length=2, max_length=120, description="User full name.")
    role: Literal["student"] = Field(default="student", description="Public registration only creates student accounts.")

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        normalized = normalize_email(value)
        if not is_valid_email(normalized):
            raise ValueError("Email address is invalid.")
        return normalized


class AccountProfileUpdate(BaseSchema):
    full_name: str = Field(..., min_length=2, max_length=120, description="Updated user full name.")
    email: str = Field(..., description="Updated account email.")
    bio: str | None = Field(default=None, max_length=250, description="Updated profile biography.")

    @field_validator("full_name")
    @classmethod
    def validate_full_name(cls, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 2:
            raise ValueError("Full name must contain at least 2 characters.")
        return normalized

    @field_validator("email")
    @classmethod
    def validate_account_email(cls, value: str) -> str:
        normalized = normalize_email(value)
        if not is_valid_email(normalized):
            raise ValueError("Email address is invalid.")
        return normalized


class AuthResult(BaseSchema):
    error: str | None = Field(default=None, description="Optional authentication error.")
    user: SessionUser | None = Field(default=None, description="Authenticated user payload.")
    session: UserSession | None = Field(default=None, description="Current user session payload.")


class ResetPasswordRequest(BaseSchema):
    email: str = Field(..., description="Account email to reset the password for.")

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        normalized = normalize_email(value)
        if not is_valid_email(normalized):
            raise ValueError("Email address is invalid.")
        return normalized


class ForgotPasswordRequest(BaseSchema):
    email: str = Field(..., description="Account email to send a password reset link to.")

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        normalized = normalize_email(value)
        if not is_valid_email(normalized):
            raise ValueError("Email address is invalid.")
        return normalized


class CompletePasswordResetRequest(BaseSchema):
    token: str = Field(default="", max_length=128, description="Single-use password reset token.")
    new_password: str = Field(..., min_length=6, max_length=128, description="Replacement account password.")


class UpdateProfileRequest(BaseSchema):
    full_name: str | None = Field(default=None, min_length=2, max_length=120, description="Updated display name.")
    avatar_url: str | None = Field(default=None, description="Updated avatar URL.")
    bio: str | None = Field(default=None, description="Updated profile biography.")
    role: UserRole | None = Field(default=None, description="Updated user role.")
