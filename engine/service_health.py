"""
Service health probes — database, SMTP (Resend), and Stripe.

Each probe() function:
  - Returns {"ok": True,  "service": "<name>", "detail": "<...>"}  on success
  - Returns {"ok": False, "service": "<name>", "detail": "<...>"}  on failure
  - Returns {"ok": None,  "service": "<name>", "detail": "not configured"}
    when the service has no credentials set

Module-level _*_probe_result dicts are set once by main.py at startup and then
read by /api/health.  Nothing here is a kill-switch — all probes are informational.
"""
from __future__ import annotations

import os
import time
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Set by main.py lifespan; read by api/routes/health.py
_db_probe_result:     Optional[dict] = None
_smtp_probe_result:   Optional[dict] = None
_stripe_probe_result: Optional[dict] = None


# ─────────────────────────────────────────────────────────────────────────────
# DATABASE
# ─────────────────────────────────────────────────────────────────────────────

def probe_db() -> dict:
    """SELECT 1 against the live SQLite file.  Measures round-trip latency."""
    t0 = time.monotonic()
    try:
        from db.database import get_db
        with get_db() as conn:
            conn.execute("SELECT 1").fetchone()
        ms = round((time.monotonic() - t0) * 1000, 1)
        return {"ok": True, "service": "db", "detail": f"SQLite OK ({ms}ms)"}
    except Exception as exc:
        logger.error("DB probe failed: %s", exc)
        return {"ok": False, "service": "db", "detail": str(exc)}


# ─────────────────────────────────────────────────────────────────────────────
# SMTP / RESEND
# ─────────────────────────────────────────────────────────────────────────────

def probe_smtp() -> dict:
    """Connect → EHLO → STARTTLS → AUTH → quit.  No mail is sent."""
    import smtplib

    host = os.getenv("SMTP_HOST", "").strip()
    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER", "").strip()
    pw   = os.getenv("SMTP_PASS", "").strip()

    if not host:
        return {"ok": None, "service": "smtp", "detail": "not configured (SMTP_HOST not set)"}

    t0 = time.monotonic()
    try:
        with smtplib.SMTP(host, port, timeout=8) as s:
            s.ehlo()
            if port != 465:
                s.starttls()
                s.ehlo()
            if user and pw:
                s.login(user, pw)
        ms = round((time.monotonic() - t0) * 1000, 1)
        return {"ok": True, "service": "smtp", "detail": f"{host}:{port} auth OK ({ms}ms)"}
    except smtplib.SMTPAuthenticationError:
        return {"ok": False, "service": "smtp", "detail": f"authentication failed ({host}:{port})"}
    except Exception as exc:
        logger.error("SMTP probe failed: %s", exc)
        return {"ok": False, "service": "smtp", "detail": str(exc)}


# ─────────────────────────────────────────────────────────────────────────────
# STRIPE
# ─────────────────────────────────────────────────────────────────────────────

def probe_stripe() -> dict:
    """GET /v1/account to verify the secret key.  Read-only, no side effects."""
    import httpx

    key = os.getenv("STRIPE_SECRET_KEY", "").strip()
    if not key:
        return {"ok": None, "service": "stripe", "detail": "not configured (STRIPE_SECRET_KEY not set)"}

    mode = "live" if key.startswith("sk_live_") else "test"
    t0 = time.monotonic()
    try:
        r = httpx.get(
            "https://api.stripe.com/v1/account",
            headers={"Authorization": f"Bearer {key}"},
            timeout=8.0,
        )
        ms = round((time.monotonic() - t0) * 1000, 1)
        if r.status_code == 200:
            return {"ok": True, "service": "stripe", "detail": f"{mode} mode OK ({ms}ms)"}
        elif r.status_code == 401:
            return {"ok": False, "service": "stripe", "detail": f"invalid key — HTTP 401 ({mode} mode)"}
        else:
            return {"ok": False, "service": "stripe", "detail": f"HTTP {r.status_code}"}
    except Exception as exc:
        logger.error("Stripe probe failed: %s", exc)
        return {"ok": False, "service": "stripe", "detail": str(exc)}
