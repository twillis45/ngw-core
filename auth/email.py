"""Email sending for NGW — verification emails and transactional messages.

Configuration (env vars):
    SMTP_HOST     — SMTP server hostname (default: localhost)
    SMTP_PORT     — SMTP port (default: 587)
    SMTP_USER     — SMTP username / sender address
    SMTP_PASS     — SMTP password
    FROM_EMAIL    — From address (defaults to SMTP_USER)
    APP_URL       — Base URL for links in emails (default: http://localhost:8000)

Dev mode: if SMTP_HOST is not set, verification links are printed to stdout
instead of being sent. This lets the full flow work without SMTP configured.
"""
from __future__ import annotations

import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

log = logging.getLogger(__name__)

SMTP_HOST  = os.getenv("SMTP_HOST", "")
SMTP_PORT  = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER  = os.getenv("SMTP_USER", "")
SMTP_PASS  = os.getenv("SMTP_PASS", "")
FROM_EMAIL = os.getenv("FROM_EMAIL", SMTP_USER) or "hello@noguesswork.com"
APP_URL    = os.getenv("APP_URL", "http://localhost:8000").rstrip("/")


def _send(to: str, subject: str, html: str, text: str) -> None:
    """Send an email. Falls back to console log if SMTP is not configured."""
    if not SMTP_HOST:
        log.warning("[EMAIL — no SMTP configured, printing to console]")
        print(f"\n{'='*60}")
        print(f"TO:      {to}")
        print(f"SUBJECT: {subject}")
        print(f"BODY:    {text}")
        print(f"{'='*60}\n")
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = FROM_EMAIL
    msg["To"] = to
    msg.attach(MIMEText(text, "plain"))
    msg.attach(MIMEText(html, "html"))

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
            server.ehlo()
            if SMTP_PORT != 465:
                server.starttls()
            if SMTP_USER and SMTP_PASS:
                server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(FROM_EMAIL, to, msg.as_string())
    except Exception as exc:
        log.error("Failed to send email to %s: %s", to, exc)
        raise


def send_verification_email(to_email: str, token: str) -> None:
    verify_url = f"{APP_URL}/ui?verify_token={token}"

    html = f"""<!DOCTYPE html>
<html>
<body style="font-family:sans-serif;background:#0f1117;color:#f9fafb;padding:40px 20px;margin:0">
  <div style="max-width:480px;margin:0 auto;background:#1a1d26;border-radius:12px;padding:36px 32px;border:1px solid #2a2d3a">
    <div style="text-align:center;margin-bottom:28px">
      <svg width="40" height="40" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="4" y="4" width="40" height="40" rx="12" stroke="#4DA3FF" stroke-width="2" fill="none"/>
        <path d="M18 14 L24 34 L30 14" stroke="#4DA3FF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
        <circle cx="24" cy="14" r="3" fill="#4DA3FF"/>
      </svg>
      <p style="color:#9ca3af;font-size:.875rem;margin:8px 0 0">No Guesswork Lighting</p>
    </div>
    <h1 style="font-size:1.375rem;font-weight:700;text-align:center;margin:0 0 8px">Verify your email</h1>
    <p style="color:#9ca3af;text-align:center;font-size:.9rem;margin:0 0 28px">
      Click the button below to confirm your address and activate your account.
    </p>
    <a href="{verify_url}"
       style="display:block;text-align:center;background:#4DA3FF;color:#fff;text-decoration:none;
              padding:14px 24px;border-radius:8px;font-weight:600;font-size:1rem;margin-bottom:24px">
      Verify Email Address
    </a>
    <p style="color:#6b7280;font-size:.8rem;text-align:center;margin:0">
      This link expires in 24 hours. If you didn't create an account, you can ignore this email.
    </p>
  </div>
</body>
</html>"""

    text = (
        f"Verify your NGW email address\n\n"
        f"Click the link below to confirm your address:\n{verify_url}\n\n"
        f"This link expires in 24 hours.\n"
        f"If you didn't create an account, ignore this email."
    )

    _send(to_email, "Verify your NGW email address", html, text)
