"""Tests for Lab API — access control, gold set CRUD, rule candidate CRUD."""
from __future__ import annotations

import os
import time
import uuid as uuid_mod

import pytest
from fastapi.testclient import TestClient

from db.database import init_db, get_db, get_user_by_email
from auth.security import create_access_token


# ── Setup ─────────────────────────────────────────────────

# Set dev emails before importing app so the guard picks them up
DEV_EMAIL = "dev@ngw-test.com"
os.environ["NGW_DEV_EMAILS"] = DEV_EMAIL

from main import app  # noqa: E402

client = TestClient(app)

# Pre-hashed bcrypt for "test123" — avoids bcrypt version issues in tests
_PREHASHED = "$2b$12$LJ3m4ys2Z3s8R5I2R5I2R.q9w8e7r6t5y4u3i2o1p0a9s8d7f6g5h4"


def _ensure_user(email: str, username: str) -> dict:
    """Insert user directly (bypassing bcrypt) or return existing."""
    user = get_user_by_email(email)
    if user:
        return user
    uid = uuid_mod.uuid4().hex
    now = time.time()
    with get_db() as conn:
        conn.execute(
            "INSERT INTO users (id, email, username, hashed_pw, created_at, updated_at) VALUES (?,?,?,?,?,?)",
            (uid, email.lower(), username, _PREHASHED, now, now),
        )
    return {"id": uid, "email": email.lower(), "username": username}


@pytest.fixture(autouse=True)
def setup_db():
    """Ensure tables exist and clean up lab tables between tests."""
    init_db()
    with get_db() as conn:
        conn.execute("DELETE FROM gold_set_entries")
        conn.execute("DELETE FROM rule_candidates")
    yield
    with get_db() as conn:
        conn.execute("DELETE FROM gold_set_entries")
        conn.execute("DELETE FROM rule_candidates")


def _make_dev_user():
    """Create (or find) a dev user and return auth headers."""
    user = _ensure_user(DEV_EMAIL, "devuser")
    token = create_access_token(user["id"])
    return {"Authorization": f"Bearer {token}"}


def _make_regular_user():
    """Create a unique non-dev user and return auth headers."""
    uid = uuid_mod.uuid4().hex[:8]
    email = f"regular_{uid}@ngw-test.com"
    user = _ensure_user(email, f"regular_{uid}")
    token = create_access_token(user["id"])
    return {"Authorization": f"Bearer {token}"}


# ── Access Control ────────────────────────────────────────

class TestLabAccess:
    def test_status_requires_auth(self):
        resp = client.get("/api/lab/status")
        assert resp.status_code == 401

    def test_status_rejects_non_dev(self):
        headers = _make_regular_user()
        resp = client.get("/api/lab/status", headers=headers)
        assert resp.status_code == 403

    def test_status_allows_dev(self):
        headers = _make_dev_user()
        resp = client.get("/api/lab/status", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "ok"
        assert body["user"] == DEV_EMAIL


# ── Gold Set CRUD ─────────────────────────────────────────

class TestGoldSet:
    def test_create_and_list(self):
        headers = _make_dev_user()

        # Create
        resp = client.post("/api/lab/gold-set", headers=headers, json={
            "image_path": "/test/image1.jpg",
            "expected_analysis": {"mood": "cinematic"},
            "notes": "Test entry",
            "status": "draft",
        })
        assert resp.status_code == 200
        entry = resp.json()
        assert entry["image_path"] == "/test/image1.jpg"
        assert entry["status"] == "draft"
        entry_id = entry["id"]

        # List
        resp = client.get("/api/lab/gold-set", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["count"] >= 1

        # Get by ID
        resp = client.get(f"/api/lab/gold-set/{entry_id}", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["id"] == entry_id

    def test_update(self):
        headers = _make_dev_user()

        # Create
        resp = client.post("/api/lab/gold-set", headers=headers, json={
            "image_path": "/test/image2.jpg",
            "status": "draft",
        })
        entry_id = resp.json()["id"]

        # Update
        resp = client.put(f"/api/lab/gold-set/{entry_id}", headers=headers, json={
            "status": "approved",
            "notes": "Updated note",
        })
        assert resp.status_code == 200
        updated = resp.json()
        assert updated["status"] == "approved"
        assert updated["notes"] == "Updated note"

    def test_delete(self):
        headers = _make_dev_user()

        # Create
        resp = client.post("/api/lab/gold-set", headers=headers, json={
            "image_path": "/test/image3.jpg",
        })
        entry_id = resp.json()["id"]

        # Delete
        resp = client.delete(f"/api/lab/gold-set/{entry_id}", headers=headers)
        assert resp.status_code == 200

        # Verify gone
        resp = client.get(f"/api/lab/gold-set/{entry_id}", headers=headers)
        assert resp.status_code == 404

    def test_filter_by_status(self):
        headers = _make_dev_user()

        # Create draft and approved entries
        client.post("/api/lab/gold-set", headers=headers, json={
            "image_path": "/test/draft.jpg",
            "status": "draft",
        })
        client.post("/api/lab/gold-set", headers=headers, json={
            "image_path": "/test/approved.jpg",
            "status": "approved",
        })

        # Filter by status
        resp = client.get("/api/lab/gold-set?status=approved", headers=headers)
        assert resp.status_code == 200
        body = resp.json()
        for entry in body["entries"]:
            assert entry["status"] == "approved"

    def test_non_dev_cannot_access(self):
        headers = _make_regular_user()
        resp = client.get("/api/lab/gold-set", headers=headers)
        assert resp.status_code == 403


# ── Rule Candidates CRUD ─────────────────────────────────

class TestRuleCandidates:
    def test_create_and_list(self):
        headers = _make_dev_user()

        # Create
        resp = client.post("/api/lab/candidates", headers=headers, json={
            "title": "Fix shadow detection",
            "description": "Shadow detection fails on backlit subjects",
            "rationale": "Found in gold set evaluation",
            "proposed_change": {"rule": "shadow_detect", "threshold": 0.7},
            "status": "proposed",
        })
        assert resp.status_code == 200
        candidate = resp.json()
        assert candidate["title"] == "Fix shadow detection"
        candidate_id = candidate["id"]

        # List
        resp = client.get("/api/lab/candidates", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["count"] >= 1

        # Get by ID
        resp = client.get(f"/api/lab/candidates/{candidate_id}", headers=headers)
        assert resp.status_code == 200
        assert resp.json()["id"] == candidate_id

    def test_update_status(self):
        headers = _make_dev_user()

        # Create
        resp = client.post("/api/lab/candidates", headers=headers, json={
            "title": "Test candidate",
            "description": "Test description",
        })
        candidate_id = resp.json()["id"]

        # Update status
        resp = client.put(f"/api/lab/candidates/{candidate_id}", headers=headers, json={
            "status": "accepted",
        })
        assert resp.status_code == 200
        assert resp.json()["status"] == "accepted"

    def test_delete(self):
        headers = _make_dev_user()

        # Create
        resp = client.post("/api/lab/candidates", headers=headers, json={
            "title": "To delete",
            "description": "Will be deleted",
        })
        candidate_id = resp.json()["id"]

        # Delete
        resp = client.delete(f"/api/lab/candidates/{candidate_id}", headers=headers)
        assert resp.status_code == 200

        # Verify gone
        resp = client.get(f"/api/lab/candidates/{candidate_id}", headers=headers)
        assert resp.status_code == 404

    def test_filter_by_status(self):
        headers = _make_dev_user()

        client.post("/api/lab/candidates", headers=headers, json={
            "title": "Proposed one",
            "description": "Desc",
            "status": "proposed",
        })
        client.post("/api/lab/candidates", headers=headers, json={
            "title": "Accepted one",
            "description": "Desc",
            "status": "accepted",
        })

        resp = client.get("/api/lab/candidates?status=proposed", headers=headers)
        assert resp.status_code == 200
        for c in resp.json()["candidates"]:
            assert c["status"] == "proposed"
