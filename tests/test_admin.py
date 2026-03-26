"""Tests for admin API endpoints (systems CRUD, image labels, feedback, changelog)."""
import json
import shutil
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from main import app
from auth.dev_guard import get_dev_user

_DEV_USER = {"id": "dev-mode", "email": "dev@localhost", "name": "Dev Mode"}

client = TestClient(app)


@pytest.fixture(autouse=True, scope="module")
def _override_admin_auth():
    """Bypass get_dev_user for the duration of this module only."""
    app.dependency_overrides[get_dev_user] = lambda: _DEV_USER
    yield
    app.dependency_overrides.pop(get_dev_user, None)

SYSTEMS_PATH = Path("data/lighting_systems.json")
BACKUP_PATH = Path("data/lighting_systems.json.bak")
PATCH_PATH = Path("data/systems_patch.json")
PATCH_BACKUP = Path("data/systems_patch.json.bak")


@pytest.fixture(autouse=True)
def backup_systems_file():
    """Backup and restore lighting_systems.json around each test."""
    shutil.copy2(SYSTEMS_PATH, BACKUP_PATH)
    if PATCH_PATH.exists():
        shutil.copy2(PATCH_PATH, PATCH_BACKUP)
    yield
    shutil.copy2(BACKUP_PATH, SYSTEMS_PATH)
    BACKUP_PATH.unlink(missing_ok=True)
    if PATCH_BACKUP.exists():
        shutil.copy2(PATCH_BACKUP, PATCH_PATH)
        PATCH_BACKUP.unlink(missing_ok=True)


# ── Systems: List & Get ──────────────────────────────────

class TestSystemsList:
    def test_list_all_systems(self):
        resp = client.get("/api/admin/systems")
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] >= 30
        assert len(body["systems"]) == body["total"]

    def test_list_filter_by_mood(self):
        resp = client.get("/api/admin/systems", params={"mood": "beauty"})
        assert resp.status_code == 200
        body = resp.json()
        for s in body["systems"]:
            assert s["taxonomy_refs"]["mood"] == "beauty"

    def test_get_system_by_id(self):
        # Get first system ID
        all_resp = client.get("/api/admin/systems")
        first_id = all_resp.json()["systems"][0]["id"]

        resp = client.get(f"/api/admin/systems/{first_id}")
        assert resp.status_code == 200
        assert resp.json()["id"] == first_id

    def test_get_nonexistent_system(self):
        resp = client.get("/api/admin/systems/does_not_exist")
        assert resp.status_code == 404


# ── Systems: Create ──────────────────────────────────────

TEST_SYSTEM = {
    "id": "test__admin__create",
    "name": "Test Admin System",
    "criteria": {
        "brightness": 5000,
        "energy_efficiency": 80,
        "color_accuracy": 90,
        "lifespan_hours": 30000,
        "cost_effectiveness": 75,
    },
    "features": {"dimmable": True, "smart_ready": False, "waterproof": False},
    "taxonomy_refs": {
        "gear_profile": "led_panel",
        "modifier_family": "softbox_rect",
        "environment": "studio_small",
        "mood": "corporate",
    },
    "modifier": 1.05,
    "why_this_works": "Test system for admin CRUD",
    "failure_modes": ["Test failure mode"],
    "substitutions": [],
    "difficulty": 1,
    "setup_time_minutes": 10,
}


class TestSystemsCreate:
    def test_create_system(self):
        resp = client.post("/api/admin/systems", json=TEST_SYSTEM)
        assert resp.status_code == 201
        assert resp.json()["id"] == TEST_SYSTEM["id"]

        # Verify it's in the list
        check = client.get(f"/api/admin/systems/{TEST_SYSTEM['id']}")
        assert check.status_code == 200

    def test_create_duplicate_system(self):
        client.post("/api/admin/systems", json=TEST_SYSTEM)
        resp = client.post("/api/admin/systems", json=TEST_SYSTEM)
        assert resp.status_code == 409

    def test_create_invalid_system_missing_criteria(self):
        invalid = {**TEST_SYSTEM, "id": "test__invalid", "criteria": {"brightness": 5000}}
        resp = client.post("/api/admin/systems", json=invalid)
        assert resp.status_code == 422


# ── Systems: Update ──────────────────────────────────────

class TestSystemsUpdate:
    def test_update_system(self):
        client.post("/api/admin/systems", json=TEST_SYSTEM)
        resp = client.put(
            f"/api/admin/systems/{TEST_SYSTEM['id']}",
            json={"name": "Updated Name", "modifier": 1.25},
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "Updated Name"
        assert resp.json()["modifier"] == 1.25

    def test_update_nonexistent(self):
        resp = client.put("/api/admin/systems/does_not_exist", json={"name": "X"})
        assert resp.status_code == 404


# ── Systems: Delete ──────────────────────────────────────

class TestSystemsDelete:
    def test_delete_system(self):
        client.post("/api/admin/systems", json=TEST_SYSTEM)
        resp = client.delete(f"/api/admin/systems/{TEST_SYSTEM['id']}")
        assert resp.status_code == 200

        check = client.get(f"/api/admin/systems/{TEST_SYSTEM['id']}")
        assert check.status_code == 404

    def test_delete_nonexistent(self):
        resp = client.delete("/api/admin/systems/does_not_exist")
        assert resp.status_code == 404


# ── Systems: Merge Patch ─────────────────────────────────

class TestMergePatch:
    def test_merge_patch(self):
        before = client.get("/api/admin/systems").json()["total"]
        resp = client.post("/api/admin/systems/merge-patch")
        assert resp.status_code == 200
        body = resp.json()
        assert body["merged"] >= 0
        assert body["total_systems"] >= before

    def test_merge_patch_idempotent(self):
        client.post("/api/admin/systems/merge-patch")
        first_total = client.get("/api/admin/systems").json()["total"]
        client.post("/api/admin/systems/merge-patch")
        second_total = client.get("/api/admin/systems").json()["total"]
        assert first_total == second_total


# ── Image Labels ─────────────────────────────────────────

class TestImageLabels:
    def test_create_and_list_labels(self):
        label = {
            "image_path": "/tmp/test_photo.jpg",
            "expected_mood": "beauty",
            "actual_mood": "cinematic",
            "corrections": {"mood": "beauty", "reason": "soft light visible"},
        }
        resp = client.post("/api/admin/image-labels", json=label)
        assert resp.status_code == 201
        assert resp.json()["image_path"] == label["image_path"]

        listing = client.get("/api/admin/image-labels")
        assert listing.status_code == 200
        assert listing.json()["total"] >= 1


# ── Feedback Summary ─────────────────────────────────────

class TestFeedbackSummary:
    def test_get_feedback_summary(self):
        resp = client.get("/api/admin/feedback-summary")
        assert resp.status_code == 200
        assert "aggregates" in resp.json()

    def test_refresh_summary(self):
        resp = client.post("/api/admin/feedback-summary/refresh")
        assert resp.status_code == 200
        assert "refreshed" in resp.json()


# ── Changelog ────────────────────────────────────────────

class TestChangelog:
    def test_changelog_records_create(self):
        client.post("/api/admin/systems", json=TEST_SYSTEM)
        resp = client.get("/api/admin/changelog")
        assert resp.status_code == 200
        entries = resp.json()["entries"]
        assert len(entries) >= 1
        latest = entries[0]
        assert latest["entity_type"] == "system"
        assert latest["action"] == "create"

    def test_changelog_records_update(self):
        client.post("/api/admin/systems", json=TEST_SYSTEM)
        client.put(
            f"/api/admin/systems/{TEST_SYSTEM['id']}",
            json={"name": "Changed"},
        )
        resp = client.get("/api/admin/changelog")
        entries = resp.json()["entries"]
        update_entry = next((e for e in entries if e["action"] == "update"), None)
        assert update_entry is not None
        assert "before" in update_entry["diff"]
        assert "after" in update_entry["diff"]

    def test_changelog_records_delete(self):
        client.post("/api/admin/systems", json=TEST_SYSTEM)
        client.delete(f"/api/admin/systems/{TEST_SYSTEM['id']}")
        resp = client.get("/api/admin/changelog")
        entries = resp.json()["entries"]
        del_entry = next((e for e in entries if e["action"] == "delete"), None)
        assert del_entry is not None


# ── Full CRUD Lifecycle ──────────────────────────────────

class TestCRUDLifecycle:
    def test_full_lifecycle(self):
        # Create
        resp = client.post("/api/admin/systems", json=TEST_SYSTEM)
        assert resp.status_code == 201

        # Read
        resp = client.get(f"/api/admin/systems/{TEST_SYSTEM['id']}")
        assert resp.status_code == 200
        assert resp.json()["name"] == TEST_SYSTEM["name"]

        # Update
        resp = client.put(
            f"/api/admin/systems/{TEST_SYSTEM['id']}",
            json={"name": "Lifecycle Updated", "difficulty": 5},
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "Lifecycle Updated"
        assert resp.json()["difficulty"] == 5

        # Delete
        resp = client.delete(f"/api/admin/systems/{TEST_SYSTEM['id']}")
        assert resp.status_code == 200

        # Verify gone
        resp = client.get(f"/api/admin/systems/{TEST_SYSTEM['id']}")
        assert resp.status_code == 404
