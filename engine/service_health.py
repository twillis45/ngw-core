"""
Service health probes — database, SMTP (Resend), Stripe, and Sentry.

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
_sentry_probe_result: Optional[dict] = None


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


# ─────────────────────────────────────────────────────────────────────────────
# SENTRY
# ─────────────────────────────────────────────────────────────────────────────

def probe_sentry() -> dict:
    """Verify the Sentry DSN is reachable and the SDK is initialised.

    Parses the DSN to extract the ingest host, then does a lightweight
    GET to confirm network reachability — no events are sent.
    Falls back to checking SDK client state if network probe isn't needed.
    """
    import httpx
    from urllib.parse import urlparse

    dsn = os.getenv("SENTRY_DSN", "").strip()
    if not dsn:
        return {"ok": None, "service": "sentry", "detail": "not configured (SENTRY_DSN not set)"}

    # Parse DSN: https://<key>@<host>/<project_id>
    try:
        parsed = urlparse(dsn)
        host = parsed.hostname  # e.g. o123456.ingest.sentry.io
        if not host:
            raise ValueError("no hostname")
    except Exception as exc:
        return {"ok": False, "service": "sentry", "detail": f"invalid DSN format: {exc}"}

    # Check SDK is actually initialised
    try:
        import sentry_sdk
        client = sentry_sdk.get_client()
        sdk_ok = client is not None and getattr(client, "options", {}).get("dsn") is not None
    except Exception:
        sdk_ok = False

    # Pull environment + release from the initialised SDK client
    sentry_env     = None
    sentry_release = None
    if sdk_ok:
        try:
            opts = sentry_sdk.get_client().options or {}
            sentry_env     = opts.get("environment")
            sentry_release = opts.get("release")
        except Exception:
            pass

    # Lightweight network reachability check — GET the ingest host root
    t0 = time.monotonic()
    try:
        r = httpx.get(f"https://{host}/", timeout=8.0, follow_redirects=True)
        ms = round((time.monotonic() - t0) * 1000, 1)
        # Sentry returns 200 or 302 for the org root; any non-5xx = reachable
        if r.status_code < 500:
            sdk_note = " · SDK init OK" if sdk_ok else " · SDK not initialized"
            return {
                "ok": True, "service": "sentry",
                "detail": f"{host} reachable ({ms}ms){sdk_note}",
                "host": host, "latency_ms": ms, "sdk_ok": sdk_ok,
                "environment": sentry_env, "release": sentry_release,
            }
        else:
            return {
                "ok": False, "service": "sentry",
                "detail": f"HTTP {r.status_code} from {host}",
                "host": host, "latency_ms": None, "sdk_ok": sdk_ok,
                "environment": sentry_env, "release": sentry_release,
            }
    except Exception as exc:
        logger.error("Sentry probe failed: %s", exc)
        return {
            "ok": False, "service": "sentry",
            "detail": f"unreachable: {str(exc)[:120]}",
            "host": host, "latency_ms": None, "sdk_ok": False,
            "environment": sentry_env, "release": sentry_release,
        }
