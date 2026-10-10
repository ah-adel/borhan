from __future__ import annotations

import hashlib
import html
import logging
import os
import re
import secrets
from urllib.parse import urlencode

import httpx

logger = logging.getLogger("app.email")


class EmailDeliveryError(RuntimeError):
    pass


def create_verification_token() -> str:
    return secrets.token_urlsafe(32)


def hash_verification_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


async def _send_transactional_email(recipient: str, subject: str, text_content: str, html_content: str) -> None:
    api_key = os.getenv("BREVO_API_KEY", "").strip()
    sender_email = os.getenv("EMAIL_FROM_ADDRESS", "").strip()
    sender_name = os.getenv("EMAIL_FROM_NAME", "Borhan").strip()
    if not api_key or not sender_email:
        raise EmailDeliveryError("Brevo transactional email is not configured.")
    payload = {
        "sender": {"name": sender_name, "email": sender_email},
        "to": [{"email": recipient}],
        "subject": subject,
        "textContent": text_content,
        "htmlContent": html_content,
    }
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as client:
            response = await client.post(
                "https://api.brevo.com/v3/smtp/email",
                headers={"api-key": api_key, "accept": "application/json"},
                json=payload,
            )
            response.raise_for_status()
    except httpx.HTTPError as exc:
        raise EmailDeliveryError("Brevo could not deliver the transactional email.") from exc


async def send_verification_email(recipient: str, token: str) -> None:
    public_url = os.getenv("APP_PUBLIC_URL", "").strip().rstrip("/")
    if not public_url:
        raise EmailDeliveryError("APP_PUBLIC_URL is required for account verification.")
    verification_url = f"{public_url}/auth/verify-email?token={token}"
    safe_url = html.escape(verification_url, quote=True)
    await _send_transactional_email(
        recipient,
        "Verify your Borhan account",
        f"Verify your email address by opening this link: {verification_url}\nThis link expires in 30 minutes.",
        "<p>Verify your email address to activate your Borhan account.</p>"
        f'<p><a href="{safe_url}">Verify email address</a></p>'
        "<p>This link expires in 30 minutes.</p>",
    )


def _redact_password_reset_excerpt(body: str, secrets_to_redact: tuple[str, ...]) -> str:
    excerpt = body
    for secret in secrets_to_redact:
        if secret:
            excerpt = excerpt.replace(secret, "[REDACTED]")
    excerpt = re.sub(r"https?://[^\s\"'<>]+", "[URL REDACTED]", excerpt, flags=re.IGNORECASE)
    excerpt = re.sub(
        r"(?i)([\"']?(?:api[-_ ]?key|authorization|token|password|reset[_-]?link|url)[\"']?\s*:\s*[\"']?)[^\"'\s,}]+",
        r"\1[REDACTED]",
        excerpt,
    )
    excerpt = "".join(character if character.isprintable() else " " for character in excerpt)
    return excerpt[:200]


async def send_password_reset_email(recipient: str, token: str) -> bool:
    api_key = os.getenv("BREVO_API_KEY", "").strip()
    sender_email = os.getenv("EMAIL_FROM", "").strip()
    sender_name = os.getenv("EMAIL_FROM_NAME", "Borhan").strip() or "Borhan"
    frontend_url = os.getenv("FRONTEND_URL", "").strip().rstrip("/")
    missing = [
        name
        for name, value in (
            ("BREVO_API_KEY", api_key),
            ("EMAIL_FROM", sender_email),
            ("FRONTEND_URL", frontend_url),
        )
        if not value
    ]
    if missing:
        logger.warning("Password reset email skipped; missing configuration: %s", ", ".join(missing))
        return False

    reset_url = f"{frontend_url}/reset-password?{urlencode({'token': token})}"
    safe_url = html.escape(reset_url, quote=True)
    subject = "إعادة تعيين كلمة المرور | Reset your password"
    text_content = (
        "طلبت إعادة تعيين كلمة مرور حسابك في Borhan. افتح الرابط التالي خلال 30 دقيقة:\n"
        f"{reset_url}\nإذا لم تطلب ذلك، فتجاهل هذه الرسالة.\n\n"
        "You requested a Borhan password reset. Open this link within 30 minutes:\n"
        f"{reset_url}\nIf you did not request this, ignore this email."
    )
    html_content = (
        "<p>طلبت إعادة تعيين كلمة مرور حسابك في Borhan. تنتهي صلاحية الرابط خلال 30 دقيقة.</p>"
        f'<p><a href="{safe_url}">إعادة تعيين كلمة المرور</a></p>'
        "<p>إذا لم تطلب ذلك، فتجاهل هذه الرسالة.</p>"
        "<hr><p>You requested a Borhan password reset. This link expires in 30 minutes.</p>"
        f'<p><a href="{safe_url}">Reset password</a></p>'
        "<p>If you did not request this, ignore this email.</p>"
    )
    payload = {
        "sender": {"name": sender_name, "email": sender_email},
        "to": [{"email": recipient}],
        "subject": subject,
        "htmlContent": html_content,
        "textContent": text_content,
    }
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as client:
            response = await client.post(
                "https://api.brevo.com/v3/smtp/email",
                headers={
                    "api-key": api_key,
                    "accept": "application/json",
                    "content-type": "application/json",
                },
                json=payload,
            )
    except httpx.HTTPError as exc:
        logger.warning("Brevo password reset request failed; error_type=%s", type(exc).__name__)
        return False

    if not response.is_success:
        excerpt = _redact_password_reset_excerpt(response.text, (api_key, token, reset_url))
        logger.warning("Brevo password reset request failed; status=%s body=%s", response.status_code, excerpt)
        return False
    return True


async def send_test_email(recipient: str) -> None:
    await _send_transactional_email(
        recipient,
        "Borhan transactional email test",
        "This is a test message from the Borhan platform administrator.",
        "<p>This is a test message from the Borhan platform administrator.</p>",
    )