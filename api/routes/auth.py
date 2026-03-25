"""Authentication routes: register, login, me, email verification, logout."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field

from auth.rate_limit import check_rate_limit
from auth.security import (
    hash_password, verify_password, create_access_token, get_current_user,
    get_optional_user, revoke_token, decode_token_payload,
)

from auth.email import send_verification_email
from db.database import (
    create_user, get_user_by_email,
    create_verification_token, consume_verification_token,
    mark_email_verified,
    get_active_subscription, get_subscription_by_stripe_session,
)

router = APIRouter(prefix="/auth", tags=["auth"])
bearer_scheme = HTTPBearer(auto_error=False)


class RegisterBody(BaseModel):
    email: str = Field(..., min_length=3)
    username: str = Field(..., min_length=2, max_length=32)
    password: str = Field(..., min_length=6, max_length=128)


class LoginBody(BaseModel):
    email: str
    password: str


class VerifyBody(BaseModel):
    token: str


class TokenResponse(BaseModel):
    token: str
    user: dict


class UserResponse(BaseModel):
    id: str
    email: str
    username: str
    email_verified: bool = False


def _user_public(user: dict) -> dict:
    from db.provenance import get_internal_emails
    email = user.get("email", "")
    return {
        "id": user["id"],
        "email": email,
        "username": user["username"],
        "email_verified": bool(user.get("email_verified", 0)),
        "is_admin": email.lower() in get_internal_emails(),
    }


@router.post("/register", response_model=TokenResponse, status_code=201)
def register(body: RegisterBody, request: Request):
    # 10 registrations per IP per hour — prevents mass account creation
    check_rate_limit("register", request, limit=10, window=3600)
    existing = get_user_by_email(body.email)
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")
    hashed = hash_password(body.password)
    user = create_user(body.email, body.username, hashed)
    token = create_access_token(user["id"])

    # Send verification email (non-blocking — failure doesn't break registration)
    try:
        verif_token = create_verification_token(user["id"])
        send_verification_email(body.email, verif_token)
    except Exception:
        pass  # logged inside send_verification_email

    return {"token": token, "user": _user_public(user)}


@router.post("/login", response_model=TokenResponse)
def login(body: LoginBody, request: Request):
    # 5 attempts per IP per 60 s + 10 per-account per 15 min — brute-force protection
    check_rate_limit("login_ip",      request, limit=5,  window=60)
    check_rate_limit("login_account", request, limit=10, window=900, extra=body.email.lower())
    user = get_user_by_email(body.email)
    if not user or not verify_password(body.password, user["hashed_pw"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user["id"])
    return {"token": token, "user": _user_public(user)}


@router.get("/me", response_model=UserResponse)
def me(user=Depends(get_current_user)):
    return _user_public(user)


@router.post("/verify-email")
def verify_email(body: VerifyBody, request: Request):
    # 10 verification attempts per IP per hour — prevents token brute-force
    check_rate_limit("verify_email", request, limit=10, window=3600)
    user = consume_verification_token(body.token)
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired verification link")
    token = create_access_token(user["id"])
    return {"token": token, "user": _user_public(user)}


@router.get("/subscription-status")
def subscription_status(
    stripe_session: str | None = None,
    email: str | None = None,
    user=Depends(get_optional_user),
):
    """
    Validate whether a user has an active paid subscription.

    Checks in priority order:
      1. stripe_session param — direct checkout session lookup (post-payment redirect)
      2. authenticated user's email — most recent active subscription

    Security: the `email` query-param is accepted ONLY when a valid JWT is present
    and the requested email matches the authenticated user's email.  Unauthenticated
    callers or callers requesting a different user's status always get is_paid=false.
    This prevents unauthenticated enumeration of paid subscribers.

    Returns:
      { "is_paid": bool, "plan": str | None, "billing_period": str | None,
        "stripe_session_id": str | None }
    """
    _not_paid = {
        "is_paid": False, "plan": None, "billing_period": None,
        "stripe_session_id": None, "stripe_customer_id": None,
        "stripe_subscription_id": None, "status": "none",
    }

    def _paid_response(sub: dict) -> dict:
        return {
            "is_paid":               True,
            "plan":                  sub.get("plan"),
            "billing_period":        sub.get("billing_period"),
            "stripe_session_id":     sub.get("stripe_session_id"),
            "stripe_customer_id":    sub.get("stripe_customer_id"),
            "stripe_subscription_id": sub.get("stripe_subscription_id"),
            "status":                sub.get("status", "active"),
        }

    # 1. Direct session lookup (most trusted — Stripe session IDs are unguessable)
    if stripe_session:
        sub = get_subscription_by_stripe_session(stripe_session)
        if sub and sub.get("status") == "active":
            return _paid_response(sub)

    # 2. Email lookup — requires authentication.
    # Determine the email to look up: authenticated user's own email only.
    # If an email param is provided, it must match the JWT user's email exactly.
    jwt_email = user.get("email") if user else None

    if email:
        # Caller passed an explicit email — only allow if it matches their own JWT.
        if not jwt_email or jwt_email.lower() != email.strip().lower():
            return _not_paid
        lookup_email = jwt_email
    else:
        lookup_email = jwt_email

    if lookup_email:
        sub = get_active_subscription(lookup_email)
        if sub:
            return _paid_response(sub)

    return _not_paid


@router.post("/logout", status_code=200)
def logout(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
):
    """Revoke the current JWT by adding its JTI to the in-process blocklist.

    The token is invalid for the remainder of its lifetime (up to 7 days).
    On server restart the blocklist clears; for durable revocation, swap the
    in-memory store in auth/security.py for a Redis SETEX store.
    """
    if creds:
        payload = decode_token_payload(creds.credentials)
        if payload:
            jti = payload.get("jti")
            if jti:
                revoke_token(jti)
    return {"detail": "Logged out"}


@router.post("/resend-verification")
def resend_verification(user=Depends(get_current_user)):
    if user.get("email_verified"):
        raise HTTPException(status_code=400, detail="Email already verified")
    try:
        verif_token = create_verification_token(user["id"])
        send_verification_email(user["email"], verif_token)
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to send email") from exc
    return {"detail": "Verification email sent"}
