from __future__ import annotations

import hashlib
import html
import os
import secrets

import httpx


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


async def send_test_email(recipient: str) -> None:
    await _send_transactional_email(
        recipient,
        "Borhan transactional email test",
        "This is a test message from the Borhan platform administrator.",
        "<p>This is a test message from the Borhan platform administrator.</p>",
    )