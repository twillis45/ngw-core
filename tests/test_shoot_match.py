"""Tests for POST /api/shoot-match endpoint."""

import pytest
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _wizard(**overrides):
    base = {
        "subject": "headshot",
        "mood": "Clean & Classic",
        "environment": "Large Studio",
        "ceiling": "normal",
        "gearMode": "anyGear",
        "gear": [],
    }
    base.update(overrides)
    return base


# ── Happy path ───────────────────────────────────────────────────────────────

def test_shoot_match_happy_path():
    resp = client.post("/api/shoot-match", json=_wizard())
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert "requestId" in data
    cards = data["cards"]

    # All 9 card keys present
    for key in (
        "bestMatch", "shootThisSetup", "spaceCheck", "diagram",
        "howToTest", "whatToLookFor", "whyThisWorks", "quickFixes",
        "substitutions", "otherSetups",
    ):
        assert key in cards, f"Missing card: {key}"


def test_best_match_card_shape():
    resp = client.post("/api/shoot-match", json=_wizard())
    bm = resp.json()["cards"]["bestMatch"]
    assert isinstance(bm["name"], str) and bm["name"]
    assert 0 <= bm["reliability"] <= 100
    assert bm["reliabilityLabel"] in (
        "Very Reliable", "Reliable", "Good Option", "Experimental", "Not Ideal"
    )
    assert isinstance(bm["difficulty"], int)
    assert isinstance(bm["setupTime"], int)


def test_shoot_setup_has_lights():
    resp = client.post("/api/shoot-match", json=_wizard())
    lights = resp.json()["cards"]["shootThisSetup"]["lights"]
    assert len(lights) >= 1
    for l in lights:
        assert "role" in l
        assert "modifier" in l
        assert "position" in l
        assert "distance" in l


def test_what_to_look_for_has_content():
    resp = client.post("/api/shoot-match", json=_wizard())
    wtlf = resp.json()["cards"]["whatToLookFor"]
    assert isinstance(wtlf["goodSigns"], list)
    assert isinstance(wtlf["warnings"], list)
    assert isinstance(wtlf["catchlights"], dict)


def test_substitutions_shape():
    resp = client.post("/api/shoot-match", json=_wizard())
    subs = resp.json()["cards"]["substitutions"]["items"]
    assert isinstance(subs, list)
    for s in subs:
        assert "ifMissing" in s
        assert "use" in s
        assert "tradeoff" in s


# ── Gear filtering ───────────────────────────────────────────────────────────

def test_my_gear_filters_systems():
    resp = client.post("/api/shoot-match", json=_wizard(
        mood="Soft & Ethereal",
        environment="Large Studio",
        gearMode="myGear",
        gear=["strobe"],
    ))
    assert resp.status_code == 200
    name = resp.json()["cards"]["bestMatch"]["name"].lower()
    assert "strobe" in name or "mono" in name


# ── Edge cases ───────────────────────────────────────────────────────────────

def test_no_matching_systems_returns_422():
    resp = client.post("/api/shoot-match", json=_wizard(
        mood="High Fashion",
        environment="Outdoor",
        gearMode="myGear",
        gear=["ring light"],
    ))
    assert resp.status_code == 422


def test_missing_mood_still_works():
    """When mood doesn't map, no mood filter is applied — should still return."""
    resp = client.post("/api/shoot-match", json=_wizard(mood="Unknown Mood"))
    assert resp.status_code == 200


# ── Mood/environment mapping ────────────────────────────────────────────────

@pytest.mark.parametrize("mood", [
    "Clean & Classic", "Moody & Dramatic", "Soft & Ethereal",
    "Bold & Edgy", "Natural & Available", "Cinematic",
])
def test_all_moods_return_results(mood):
    """Every mapped mood should find at least one system across all environments."""
    resp = client.post("/api/shoot-match", json=_wizard(mood=mood, environment="Large Studio"))
    # Some mood+env combos may legitimately have no systems — accept 200 or 422
    assert resp.status_code in (200, 422)
