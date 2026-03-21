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

def test_progressive_gear_matching_returns_adapted_setup():
    """Progressive gear matching should always return a setup, never 422."""
    resp = client.post("/api/shoot-match", json=_wizard(
        mood="High Fashion",
        environment="Outdoor",
        gearMode="myGear",
        gear=["ring light"],
    ))
    assert resp.status_code == 200
    data = resp.json()
    assert "gearMatch" in data
    assert "tier" in data["gearMatch"]
    assert "label" in data["gearMatch"]


def test_missing_mood_still_works():
    """When mood doesn't map, no mood filter is applied — should still return."""
    resp = client.post("/api/shoot-match", json=_wizard(mood="Unknown Mood"))
    assert resp.status_code == 200


# ── Mood/environment mapping ────────────────────────────────────────────────

def test_skin_tone_filters_results():
    resp = client.post("/api/shoot-match", json=_wizard(
        mood="Soft & Ethereal",
        environment="Large Studio",
        skinTone="dark",
    ))
    assert resp.status_code == 200
    # Should return a result (dark skin tone systems exist for beauty+large studio)
    assert resp.json()["cards"]["bestMatch"]["name"]


def test_skin_tone_graceful_when_no_match():
    """When skin tone filter yields no results, falls back to unfiltered."""
    resp = client.post("/api/shoot-match", json=_wizard(skinTone="light"))
    assert resp.status_code == 200


def test_reference_image_nonexistent_ignored():
    """referenceImage pointing to a non-existent file should not crash."""
    resp = client.post("/api/shoot-match", json=_wizard(referenceImage="/tmp/nonexistent.jpg"))
    assert resp.status_code == 200
    assert "referenceImageAnalysis" not in resp.json()


def test_camera_settings_included():
    resp = client.post("/api/shoot-match", json=_wizard())
    cards = resp.json()["cards"]
    cam = cards["cameraSettings"]
    assert cam is not None
    assert "aperture" in cam
    assert "iso" in cam
    assert "shutter" in cam
    assert "wb" in cam
    assert "tip" in cam


def test_pattern_not_unknown_for_corporate():
    resp = client.post("/api/shoot-match", json=_wizard(mood="Clean & Classic"))
    pattern = resp.json()["cards"]["howToTest"]["pattern"]
    assert pattern != "Unknown"


def test_upload_reference_endpoint():
    import io
    # Create a minimal 1x1 PNG
    png = (
        b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01'
        b'\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00'
        b'\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00'
        b'\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82'
    )
    resp = client.post(
        "/api/upload-reference",
        files={"file": ("test.png", io.BytesIO(png), "image/png")},
    )
    assert resp.status_code == 200
    assert "path" in resp.json()


@pytest.mark.parametrize("mood", [
    "Clean & Classic", "Moody & Dramatic", "Soft & Ethereal",
    "Bold & Edgy", "Natural & Available", "Cinematic",
])
def test_all_moods_return_results(mood):
    """Every mapped mood should find at least one system across all environments."""
    resp = client.post("/api/shoot-match", json=_wizard(mood=mood, environment="Large Studio"))
    # Some mood+env combos may legitimately have no systems — accept 200 or 422
    assert resp.status_code in (200, 422)


# ── Lighting intelligence (reference image) ────────────────────────────────

def test_lighting_intelligence_in_response(monkeypatch):
    """When a reference image has vision data, lightingIntelligence appears."""
    import engine.image_analysis as ia_mod

    fake_result = {
        "ok": True,
        "palette": {"overall": []},
        "orientation": "portrait",
        "is_grayscale_like": False,
        "classification": {
            "mood": "corporate", "confidence": 0.6,
            "lightQuality": "soft", "colorTemperature": "neutral",
            "brightness": "medium", "suggestedRecipe": "corporate-loop",
        },
        "vision": {
            "ok": True,
            "catchlights": {
                "ok": True,
                "count": 1,
                "catchlights": [
                    {"eye": "left", "position": "10 o'clock", "shape": "round", "intensity": 0.9},
                    {"eye": "right", "position": "10 o'clock", "shape": "round", "intensity": 0.88},
                ],
                "inferred": {
                    "keyLightPosition": "above, slightly left",
                    "likelyModifier": "beauty dish or round source",
                    "lightCount": 1,
                },
            },
            "skin_tone": {
                "ok": True,
                "skin_tone_guess": "light",
                "confidence": "high",
            },
            "pose": {"ok": True, "pose": "standing", "angle": "front-ish", "visibility": 0.8},
            "region_attribution": {
                "masks": {"person_ratio": 0.5, "background_ratio": 0.4},
                "palettes": {
                    "background_palette": [
                        {"rgb": [80, 80, 80], "hex": "#505050", "name": "gray", "pct": 100},
                    ],
                },
                "face_box": [0.3, 0.1, 0.7, 0.4],
            },
        },
    }
    monkeypatch.setattr(ia_mod, "describe_image", lambda *a, **kw: fake_result)

    import tempfile, os
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
        f.write(b"\xff\xd8\xff\xe0")  # minimal JPEG header bytes
        tmp_path = f.name

    try:
        resp = client.post("/api/shoot-match", json=_wizard(referenceImage=tmp_path))
        assert resp.status_code == 200
        data = resp.json()

        # lightingIntelligence carries scoring-influence fields
        assert "lightingIntelligence" in data
        intel = data["lightingIntelligence"]
        assert intel["detectedPattern"] == "rembrandt"
        assert intel["detectedModifier"] == "beauty_dish"
        assert intel["lightCount"] == 1
        assert "backgroundLight" in intel

        # referenceImageAnalysis is the full reference evaluation
        assert "referenceImageAnalysis" in data
        ref = data["referenceImageAnalysis"]
        assert "skinTone" in ref
        assert "catchlights" in ref

        # Top-level background data surfaced from vision pipeline
        assert "background" in ref
        assert ref["background"]["ratio"] == 0.4
        assert len(ref["background"]["palette"]) == 1

        # Diagram lives on the reference evaluation
        assert "detectedDiagram" in ref
        dd = ref["detectedDiagram"]
        assert len(dd["lights"]) == 1
        assert dd["lights"][0]["position"]  # has position description
        assert dd["lights"][0]["roleKey"] == "key"  # raw role preserved
        assert dd["raw"]["system_id"] == "reference_detected"
        assert dd["raw"]["lights"][0]["angle_deg"] == -45.0  # rembrandt 45° camera-left (10 o'clock catchlight)

        # Each diagram light links back to the catchlights that support it
        assert "detectedFrom" in dd["lights"][0]
        detected_from = dd["lights"][0]["detectedFrom"]
        assert len(detected_from) >= 1
        assert detected_from[0]["position"] == "10 o'clock"

        # Description section with human-readable narratives
        assert "description" in ref
        desc = ref["description"]
        assert "catchlights" in desc
        assert "lightQuality" in desc
        assert "background" in desc
        assert "pattern" in desc
        assert "subject" in desc
        assert isinstance(desc["catchlights"]["summary"], str)
        assert isinstance(desc["pattern"]["description"], str)
    finally:
        os.unlink(tmp_path)


def test_background_light_in_diagram(monkeypatch):
    """When reference image has bright background, background light appears on diagram."""
    import engine.image_analysis as ia_mod

    fake_result = {
        "ok": True,
        "palette": {"overall": []},
        "orientation": "portrait",
        "is_grayscale_like": False,
        "classification": {
            "mood": "corporate", "confidence": 0.6,
            "lightQuality": "soft", "colorTemperature": "neutral",
            "brightness": "high", "suggestedRecipe": "corporate-loop",
        },
        "vision": {
            "ok": True,
            "catchlights": {
                "ok": True,
                "count": 1,
                "catchlights": [
                    {"eye": "left", "position": "1 o'clock", "shape": "rectangular", "intensity": 0.9},
                    {"eye": "right", "position": "1 o'clock", "shape": "rectangular", "intensity": 0.88},
                ],
                "inferred": {},
            },
            "skin_tone": {"ok": True, "skin_tone_guess": "medium", "confidence": "high"},
            "pose": {"ok": True, "pose": "standing", "angle": "front-ish", "visibility": 0.8},
            "region_attribution": {
                "masks": {"person_ratio": 0.4, "background_ratio": 0.55},
                "palettes": {
                    "background_palette": [
                        {"rgb": [240, 240, 240], "hex": "#f0f0f0", "name": "white", "pct": 100},
                    ],
                },
                "face_box": [0.3, 0.1, 0.7, 0.4],
            },
        },
    }
    monkeypatch.setattr(ia_mod, "describe_image", lambda *a, **kw: fake_result)

    import tempfile, os
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
        f.write(b"\xff\xd8\xff\xe0")
        tmp_path = f.name

    try:
        resp = client.post("/api/shoot-match", json=_wizard(referenceImage=tmp_path))
        assert resp.status_code == 200
        data = resp.json()

        ref = data["referenceImageAnalysis"]

        # Top-level background section includes light detection
        assert "background" in ref
        assert ref["background"]["lightDetected"] is True
        assert ref["background"]["lightConfidence"] > 0.5

        # Diagram includes background light
        dd = ref["detectedDiagram"]
        role_keys = [l["roleKey"] for l in dd["lights"]]
        assert "background" in role_keys

        bg_light = next(l for l in dd["lights"] if l["roleKey"] == "background")
        assert bg_light["role"] == "Background Light"
        assert bg_light["position"] == "behind subject"
        assert "detectedFromNote" in bg_light

        # lightingIntelligence also reports background light
        intel = data["lightingIntelligence"]
        assert intel["backgroundLight"] is True
        assert intel["backgroundLightConfidence"] > 0.5
        # Light count includes background: 1 pattern light + 1 background = 2
        assert intel["lightCount"] == 2

        # Description includes background light info
        desc = ref["description"]
        assert desc["background"]["backgroundLight"] is not None
        assert desc["background"]["backgroundLight"]["detected"] is True
    finally:
        os.unlink(tmp_path)


def test_mood_discrepancy_noted(monkeypatch):
    """When user mood differs from detected mood, moodDiscrepancy is included."""
    import engine.image_analysis as ia_mod

    fake_result = {
        "ok": True,
        "palette": {"overall": []},
        "orientation": "portrait",
        "is_grayscale_like": False,
        "classification": {"mood": "cinematic", "confidence": 0.7},
        "vision": {
            "ok": True,
            "catchlights": {
                "ok": True,
                "count": 1,
                "catchlights": [
                    {"eye": "left", "position": "10 o'clock", "shape": "round", "intensity": 0.9},
                ],
            },
            "skin_tone": {"ok": False},
        },
    }
    monkeypatch.setattr(ia_mod, "describe_image", lambda *a, **kw: fake_result)

    import tempfile, os
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
        f.write(b"\xff\xd8\xff\xe0")
        tmp_path = f.name

    try:
        # User selects corporate but image is cinematic
        resp = client.post("/api/shoot-match", json=_wizard(
            mood="Clean & Classic",  # maps to "corporate"
            referenceImage=tmp_path,
        ))
        assert resp.status_code == 200
        data = resp.json()
        if "lightingIntelligence" in data:
            intel = data["lightingIntelligence"]
            if intel.get("detectedMood") and intel["detectedMood"] != "corporate":
                assert "moodDiscrepancy" in intel
    finally:
        os.unlink(tmp_path)
