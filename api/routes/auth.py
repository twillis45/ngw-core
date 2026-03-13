"""Authentication routes: register, login, me."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field

from auth.security import (
    hash_password, verify_password, create_access_token, get_current_user,
)
from db.database import create_user, get_user_by_email

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterBody(BaseModel):
    email: str = Field(..., min_length=3)
    username: str = Field(..., min_length=2, max_length=32)
    password: str = Field(..., min_length=6, max_length=128)


class LoginBody(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    token: str
    user: dict


class UserResponse(BaseModel):
    id: str
    email: str
    username: str


@router.post("/register", response_model=TokenResponse, status_code=201)
def register(body: RegisterBody):
    existing = get_user_by_email(body.email)
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")
    hashed = hash_password(body.password)
    user = create_user(body.email, body.username, hashed)
    token = create_access_token(user["id"])
    return {"token": token, "user": user}


@router.post("/login", response_model=TokenResponse)
def login(body: LoginBody):
    user = get_user_by_email(body.email)
    if not user or not verify_password(body.password, user["hashed_pw"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user["id"])
    return {
        "token": token,
        "user": {"id": user["id"], "email": user["email"], "username": user["username"]},
    }


@router.get("/me", response_model=UserResponse)
def me(user=Depends(get_current_user)):
    return {"id": user["id"], "email": user["email"], "username": user["username"]}
