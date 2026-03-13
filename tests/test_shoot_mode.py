"""
Tests for the Shoot Mode API endpoints.

POST /api/shoot-mode/start
POST /api/shoot-mode/evaluate-test-shot
"""
import json
import unittest

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


# ── Shared fixture: a minimal shoot-match-style result ──

SAMPLE_RESULT = {
    "bestMatch": {
        "name": "Classic Rembrandt",
        "lightingPattern": "Rembrandt",
        "reliability": 88,
        "reliabilityLabel": "Reliable",
    },
    "cards": {
        "bestMatch": {
            "name": "Classic Rembrandt",
            "lightingPattern": "Rembrandt",
            "reliability": 88,
        },
        "shootThisSetup": {
            "lights": [
                {
                    "roleKey": "key",
                    "role": "Key Light",
                    "modifier": "Octabox",
                    "position": "45\u00b0 camera left",
                    "height": "6'6\" (10\" above eye level)",
                    "distance": "5'2\"",
                    "height_m": 2.0,
                    "distance_m": 1.6,
                    "powerHint": "1/2 power",
                    "notes": ["Feather slightly toward camera"],
                },
                {
                    "roleKey": "fill",
                    "role": "Fill Light",
                    "modifier": "Reflective Umbrella",
                    "position": "30\u00b0 camera right",
                    "height": "5'8\" (eye level)",
                    "distance": "6'0\"",
                    "height_m": 1.7,
                    "distance_m": 1.8,
                    "powerHint": "1/4 power",
                    "notes": [],
                },
                {
                    "roleKey": "rim",
                    "role": "Rim Light",
                    "modifier": "Grid / Snoot",
                    "position": "135\u00b0 behind subject",
                    "height": "7'0\" (1'6\" above eye level)",
                    "distance": "4'0\"",
                    "height_m": 2.15,
                    "distance_m": 1.2,
                    "powerHint": "1/4 power",
                    "notes": [],
                },
            ],
        },
        "cameraSettings": {
            "aperture": "f/4 \u2013 f/5.6",
            "iso": "100",
            "shutter": "1/160",
            "wb": "5500 K",
            "tip": "Stop down for sharper edges",
        },
        "howToTest": {
            "pattern": "Rembrandt",
            "fixOrder": ["Check shadow triangle", "Verify catchlight position"],
        },
        "whatToLookFor": {
            "goodSigns": ["Triangle of light on shadow cheek"],
            "warnings": ["Shadow too hard means move light farther"],
        },
        "quickFixes": {
            "fixes": ["Move key 6 inches toward camera for softer triangle"],
        },
        "substitutions": {
            "items": [
                {
                    "ifMissing": "Octabox",
                    "use": "Large umbrella",
                    "tradeoff": "Slightly less contrast",
                },
            ],
        },
        "diagnostics": [
            {
                "id": "shadow_too_dark",
                "symptoms": ["Shadow side completely black"],
                "likely_causes": ["No fill light"],
                "quick_fixes": ["Add reflector at fill side"],
            },
        ],
    },
}


class TestShootModeStart(unittest.TestCase):
    """Tests for POST /api/shoot-mode/start."""

    def test_photographer_returns_all_step_types(self):
        resp = client.post(
            "/api/shoot-mode/start",
            json={"result": SAMPLE_RESULT, "role": "photographer"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "success"
        assert "sessionId" in data
        assert "metadata" in data
        assert "steps" in data

        step_types = [s["type"] for s in data["steps"]]
        assert "camera_setup" in step_types
        assert "light_placement" in step_types
        assert "test_exposure" in step_types
        assert "adjustments" in step_types

    def test_photographer_step_count(self):
        """Photographer gets: 1 camera + 3 lights + 1 test + 1 adjustments = 6 steps."""
        resp = client.post(
            "/api/shoot-mode/start",
            json={"result": SAMPLE_RESULT, "role": "photographer"},
        )
        data = resp.json()
        assert len(data["steps"]) == 6

    def test_assistant_gets_only_light_steps(self):
        resp = client.post(
            "/api/shoot-mode/start",
            json={"result": SAMPLE_RESULT, "role": "assistant"},
        )
        data = resp.json()
        for step in data["steps"]:
            assert step["type"] == "light_placement", (
                f"Assistant should only get light_placement steps, got {step['type']}"
            )
        assert len(data["steps"]) == 3  # key, fill, rim

    def test_second_shooter_gets_camera_and_test(self):
        resp = client.post(
            "/api/shoot-mode/start",
            json={"result": SAMPLE_RESULT, "role": "second_shooter"},
        )
        data = resp.json()
        step_types = {s["type"] for s in data["steps"]}
        assert "camera_setup" in step_types
        assert "test_exposure" in step_types
        assert "light_placement" not in step_types
        assert "adjustments" not in step_types

    def test_step_ordering(self):
        """Steps should be numbered sequentially."""
        resp = client.post(
            "/api/shoot-mode/start",
            json={"result": SAMPLE_RESULT, "role": "photographer"},
        )
        data = resp.json()
        for i, step in enumerate(data["steps"]):
            assert step["stepNumber"] == i + 1

    def test_light_order_is_key_fill_rim(self):
        """Lights should be ordered: key, fill, rim."""
        resp = client.post(
            "/api/shoot-mode/start",
            json={"result": SAMPLE_RESULT, "role": "assistant"},
        )
        data = resp.json()
        roles = [s["data"]["roleKey"] for s in data["steps"]]
        assert roles == ["key", "fill", "rim"]

    def test_ceiling_warning_when_low(self):
        """Low ceiling (8 ft / 2.4m) should trigger warning on rim light at 2.15m."""
        resp = client.post(
            "/api/shoot-mode/start",
            json={"result": SAMPLE_RESULT, "role": "photographer", "ceilingHeight": "low"},
        )
        data = resp.json()
        # The rim light is at 2.15m; low ceiling is 2.4m.
        # 2.15 > 2.4 - 0.3 = 2.1, so it should warn "within 1 foot"
        light_steps = [s for s in data["steps"] if s["type"] == "light_placement"]
        rim_step = next(s for s in light_steps if s["data"]["roleKey"] == "rim")
        assert len(rim_step["warnings"]) > 0
        assert "ceiling" in rim_step["warnings"][0].lower()

    def test_no_ceiling_warning_when_high(self):
        """High ceiling (12 ft / 3.7m) should not warn on any lights."""
        resp = client.post(
            "/api/shoot-mode/start",
            json={"result": SAMPLE_RESULT, "role": "photographer", "ceilingHeight": "high"},
        )
        data = resp.json()
        light_steps = [s for s in data["steps"] if s["type"] == "light_placement"]
        for step in light_steps:
            assert len(step["warnings"]) == 0, (
                f"No warnings expected for high ceiling, got: {step['warnings']}"
            )

    def test_no_ceiling_warning_when_not_set(self):
        """No ceiling height means no warnings."""
        resp = client.post(
            "/api/shoot-mode/start",
            json={"result": SAMPLE_RESULT, "role": "photographer"},
        )
        data = resp.json()
        light_steps = [s for s in data["steps"] if s["type"] == "light_placement"]
        for step in light_steps:
            assert len(step["warnings"]) == 0

    def test_custom_ceiling_height_ft(self):
        """Custom ceiling height in feet should work."""
        # 7 ft = 2.13m — key light at 2.0m is within 0.13m, which is < 0.3m threshold
        resp = client.post(
            "/api/shoot-mode/start",
            json={"result": SAMPLE_RESULT, "role": "photographer", "ceilingHeightFt": 7.0},
        )
        data = resp.json()
        light_steps = [s for s in data["steps"] if s["type"] == "light_placement"]
        key_step = next(s for s in light_steps if s["data"]["roleKey"] == "key")
        assert len(key_step["warnings"]) > 0

    def test_metadata_fields(self):
        resp = client.post(
            "/api/shoot-mode/start",
            json={"result": SAMPLE_RESULT, "role": "photographer"},
        )
        data = resp.json()
        meta = data["metadata"]
        assert meta["setupName"] == "Classic Rembrandt"
        assert meta["role"] == "photographer"
        assert meta["totalSteps"] == 6
        assert meta["estimatedMinutes"] > 0

    def test_invalid_role_returns_422(self):
        resp = client.post(
            "/api/shoot-mode/start",
            json={"result": SAMPLE_RESULT, "role": "invalid_role"},
        )
        assert resp.status_code == 422

    def test_camera_step_has_all_fields(self):
        resp = client.post(
            "/api/shoot-mode/start",
            json={"result": SAMPLE_RESULT, "role": "photographer"},
        )
        data = resp.json()
        camera_step = next(s for s in data["steps"] if s["type"] == "camera_setup")
        assert camera_step["data"]["aperture"]
        assert camera_step["data"]["iso"]
        assert camera_step["data"]["shutter"]
        assert camera_step["data"]["wb"]

    def test_light_step_has_distance_ref(self):
        resp = client.post(
            "/api/shoot-mode/start",
            json={"result": SAMPLE_RESULT, "role": "photographer"},
        )
        data = resp.json()
        key_step = next(
            s for s in data["steps"]
            if s["type"] == "light_placement" and s["data"]["roleKey"] == "key"
        )
        ref = key_step["data"]["distanceRef"]
        assert ref is not None
        assert "feet" in ref
        assert "meters" in ref
        assert "approx" in ref

    def test_empty_lights_produces_no_light_steps(self):
        result_no_lights = {
            "cards": {
                "bestMatch": {"name": "No Lights Setup"},
                "shootThisSetup": {"lights": []},
                "cameraSettings": {"aperture": "f/8", "iso": "100", "shutter": "1/200", "wb": "5500 K"},
                "howToTest": {"fixOrder": []},
                "whatToLookFor": {"goodSigns": [], "warnings": []},
                "quickFixes": {"fixes": []},
                "substitutions": {"items": []},
                "diagnostics": [],
            },
        }
        resp = client.post(
            "/api/shoot-mode/start",
            json={"result": result_no_lights, "role": "assistant"},
        )
        data = resp.json()
        assert len(data["steps"]) == 0


class TestShootModeEvaluate(unittest.TestCase):
    """Tests for POST /api/shoot-mode/evaluate-test-shot."""

    def test_missing_image_returns_404(self):
        resp = client.post(
            "/api/shoot-mode/evaluate-test-shot",
            json={"testShotPath": "/nonexistent/image.jpg"},
        )
        assert resp.status_code == 404


if __name__ == "__main__":
    unittest.main()
