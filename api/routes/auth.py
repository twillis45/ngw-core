"""Authentication routes: register, login, me, email verification."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from auth.security import (
    hash_password, verify_password, create_access_token, get_current_user,
    get_optional_user,
)
from auth.email import send_verification_email
from db.database import (
    create_user, get_user_by_email,
    create_verification_token, consume_verification_token,
    mark_email_verified,
    get_active_subscription, get_subscription_by_stripe_session,
)

router = APIRouter(prefix="/auth", tags=["auth"])


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
def register(body: RegisterBody):
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
def login(body: LoginBody):
    user = get_user_by_email(body.email)
    if not user or not verify_password(body.password, user["hashed_pw"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user["id"])
    return {"token": token, "user": _user_public(user)}


@router.get("/me", response_model=UserResponse)
def me(user=Depends(get_current_user)):
    return _user_public(user)


@router.post("/verify-email")
def verify_email(body: VerifyBody):
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
      2. email param or authenticated user's email — most recent active subscription

    Returns:
      { "is_paid": bool, "plan": str | None, "billing_period": str | None,
        "stripe_session_id": str | None }
    """
    # 1. Direct session lookup (most trusted — used immediately after checkout)
    if stripe_session:
        sub = get_subscription_by_stripe_session(stripe_session)
        if sub and sub.get("status") == "active":
            return {
                "is_paid": True,
                "plan": sub["plan"],
                "billing_period": sub["billing_period"],
                "stripe_session_id": sub["stripe_session_id"],
            }

    # 2. Email lookup — prefer explicit param, fall back to JWT user
    lookup_email = email or (user.get("email") if user else None)
    if lookup_email:
        sub = get_active_subscription(lookup_email)
        if sub:
            return {
                "is_paid": True,
                "plan": sub["plan"],
                "billing_period": sub["billing_period"],
                "stripe_session_id": sub["stripe_session_id"],
            }

    return {"is_paid": False, "plan": None, "billing_period": None, "stripe_session_id": None}


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
