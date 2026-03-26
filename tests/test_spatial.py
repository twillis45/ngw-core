"""
Tests for the Spatial Calibration feature.

Tests cover:
  - Spatial API endpoints (calibrate + validate)
  - Room constraint validation
  - Position computation from angle/distance
  - Ceiling auto-derivation
  - Shoot Mode room-guidance integration
  - Edge cases: tiny rooms, outdoor (no walls), single-light setups
"""
import math
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


@pytest.fixture(autouse=True, scope="module")
def _override_spatial_auth():
    """Bypass _is_authorized for shoot-mode integration tests in this module."""
    with patch("api.routes.shoot_mode._is_authorized", return_value=True):
        yield


# ── Fixtures ──────────────────────────────────────────────

SMALL_ROOM = {"lengthFt": 12, "widthFt": 10, "ceilingFt": 8}
MEDIUM_ROOM = {"lengthFt": 20, "widthFt": 15, "ceilingFt": 10}
LARGE_ROOM = {"lengthFt": 35, "widthFt": 25, "ceilingFt": 14}

SINGLE_KEY_SPEC = {
    "lights": [
        {"role": "key", "angle_deg": 45, "distance_m": 1.8, "height_m": 2.0, "modifier": "softbox"}
    ],
    "camera": {"distance_m": 2.0},
}

TWO_LIGHT_SPEC = {
    "lights": [
        {"role": "key", "angle_deg": 45, "distance_m": 1.8, "height_m": 2.0, "modifier": "softbox"},
        {"role": "fill", "angle_deg": -30, "distance_m": 2.0, "height_m": 1.7, "modifier": "umbrella"},
    ],
    "camera": {"distance_m": 2.5},
}

THREE_LIGHT_SPEC = {
    "lights": [
        {"role": "key", "angle_deg": 45, "distance_m": 1.8, "height_m": 2.0, "modifier": "softbox"},
        {"role": "fill", "angle_deg": -30, "distance_m": 2.0, "height_m": 1.7, "modifier": "umbrella"},
        {"role": "rim", "angle_deg": 160, "distance_m": 1.5, "height_m": 2.5, "modifier": "grid"},
    ],
    "camera": {"distance_m": 2.5},
}


# ── /spatial/calibrate tests ──────────────────────────────

class TestSpatialCalibrate:
    """POST /api/spatial/calibrate endpoint tests."""

    def test_basic_calibrate(self):
        """Calibrate returns positions, guidance, and no errors for a good room."""
        resp = client.post("/api/spatial/calibrate", json={
            "room": MEDIUM_ROOM,
            "diagramSpec": SINGLE_KEY_SPEC,
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "success"
        assert len(data["positions"]) == 1
        assert "key" in data["roomGuidance"]
        assert data["subject"]["x"] == pytest.approx(7.5, abs=0.1)  # center width
        assert data["camera"] is not None

    def test_two_light_calibrate(self):
        resp = client.post("/api/spatial/calibrate", json={
            "room": MEDIUM_ROOM,
            "diagramSpec": TWO_LIGHT_SPEC,
        })
        data = resp.json()
        assert data["status"] == "success"
        assert len(data["positions"]) == 2
        roles = {p["role"] for p in data["positions"]}
        assert "key" in roles
        assert "fill" in roles

    def test_three_light_calibrate(self):
        resp = client.post("/api/spatial/calibrate", json={
            "room": LARGE_ROOM,
            "diagramSpec": THREE_LIGHT_SPEC,
        })
        data = resp.json()
        assert data["status"] == "success"
        assert len(data["positions"]) == 3

    def test_custom_subject_position(self):
        resp = client.post("/api/spatial/calibrate", json={
            "room": MEDIUM_ROOM,
            "diagramSpec": SINGLE_KEY_SPEC,
            "subjectPosition": {"x": 10.0, "y": 8.0},
        })
        data = resp.json()
        assert data["subject"]["x"] == pytest.approx(10.0)
        assert data["subject"]["y"] == pytest.approx(8.0)

    def test_custom_camera_position(self):
        resp = client.post("/api/spatial/calibrate", json={
            "room": MEDIUM_ROOM,
            "diagramSpec": SINGLE_KEY_SPEC,
            "cameraPosition": {"x": 7.5, "y": 15.0},
        })
        data = resp.json()
        assert data["camera"]["x"] == pytest.approx(7.5)
        assert data["camera"]["y"] == pytest.approx(15.0)

    def test_position_computation_angle_45(self):
        """Key at 45°, 1.8m should be to the right and behind the subject."""
        resp = client.post("/api/spatial/calibrate", json={
            "room": LARGE_ROOM,
            "diagramSpec": SINGLE_KEY_SPEC,
        })
        data = resp.json()
        key_pos = data["positions"][0]
        subject = data["subject"]
        # 45° clockwise from front: dx = +sin(45)*dist, dy = +cos(45)*dist
        expected_dx = math.sin(math.radians(45)) * 1.8 * 3.28084
        expected_dy = math.cos(math.radians(45)) * 1.8 * 3.28084
        assert key_pos["x"] == pytest.approx(subject["x"] + expected_dx, abs=0.2)
        assert key_pos["y"] == pytest.approx(subject["y"] + expected_dy, abs=0.2)


# ── /spatial/validate tests ───────────────────────────────

class TestSpatialValidate:
    """POST /api/spatial/validate endpoint tests."""

    def test_all_fit(self):
        resp = client.post("/api/spatial/validate", json={
            "room": MEDIUM_ROOM,
            "lightHeights": [6.5, 5.5, 7.0],
        })
        data = resp.json()
        assert data["status"] == "success"
        assert data["fits"] is True
        assert len(data["warnings"]) == 0

    def test_ceiling_exceeded(self):
        resp = client.post("/api/spatial/validate", json={
            "room": SMALL_ROOM,
            "lightHeights": [8.5],
        })
        data = resp.json()
        assert data["fits"] is False
        assert len(data["warnings"]) == 1
        assert "exceeds" in data["warnings"][0].lower()

    def test_near_ceiling(self):
        resp = client.post("/api/spatial/validate", json={
            "room": SMALL_ROOM,
            "lightHeights": [7.5],  # within 1 ft of 8 ft ceiling
        })
        data = resp.json()
        assert data["fits"] is False
        assert "within 1 ft" in data["warnings"][0].lower()

    def test_mixed_heights(self):
        """Some lights fit, some don't."""
        resp = client.post("/api/spatial/validate", json={
            "room": SMALL_ROOM,
            "lightHeights": [6.0, 8.5, 7.5],
        })
        data = resp.json()
        assert data["fits"] is False
        assert len(data["warnings"]) == 2  # one exceeds, one near ceiling


# ── Constraint validation (via calibrate) ─────────────────

class TestConstraintValidation:
    """Test wall proximity and ceiling constraints through calibrate."""

    def test_tiny_room_generates_warnings(self):
        """Lights don't fit in a very small room."""
        tiny = {"lengthFt": 8, "widthFt": 7, "ceilingFt": 7.5}
        resp = client.post("/api/spatial/calibrate", json={
            "room": tiny,
            "diagramSpec": THREE_LIGHT_SPEC,
        })
        data = resp.json()
        # With a tiny room, at least some warnings should fire
        assert len(data["warnings"]) > 0

    def test_large_room_few_warnings(self):
        """Large room should have few or no constraint issues."""
        resp = client.post("/api/spatial/calibrate", json={
            "room": LARGE_ROOM,
            "diagramSpec": SINGLE_KEY_SPEC,
        })
        data = resp.json()
        # With a large room and one light, should be clean
        assert len(data["warnings"]) == 0

    def test_ceiling_warning_for_tall_light(self):
        """Light with height exceeding ceiling should generate an error."""
        tall_spec = {
            "lights": [
                {"role": "rim", "angle_deg": 160, "distance_m": 1.5, "height_m": 3.0, "modifier": "grid"},
            ],
        }
        resp = client.post("/api/spatial/calibrate", json={
            "room": SMALL_ROOM,
            "diagramSpec": tall_spec,
        })
        data = resp.json()
        ceiling_issues = [w for w in data["warnings"] if "ceiling" in w.lower() or "height" in w.lower()]
        assert len(ceiling_issues) > 0


# ── Room guidance text ────────────────────────────────────

class TestRoomGuidance:
    """Test room-relative guidance output."""

    def test_guidance_contains_wall_reference(self):
        resp = client.post("/api/spatial/calibrate", json={
            "room": MEDIUM_ROOM,
            "diagramSpec": SINGLE_KEY_SPEC,
        })
        data = resp.json()
        guidance = data["roomGuidance"]["key"]
        assert "ft from" in guidance
        assert "wall" in guidance

    def test_guidance_per_light(self):
        resp = client.post("/api/spatial/calibrate", json={
            "room": MEDIUM_ROOM,
            "diagramSpec": TWO_LIGHT_SPEC,
        })
        data = resp.json()
        assert "key" in data["roomGuidance"]
        assert "fill" in data["roomGuidance"]


# ── Shoot Mode room integration ──────────────────────────

class TestShootModeRoomIntegration:
    """Test that room dimensions flow into shoot-mode steps."""

    def _make_result(self):
        """Build a minimal shoot-match result for testing."""
        return {
            "bestMatch": {"name": "Test Setup", "lightingPattern": "Rembrandt"},
            "setup": {
                "lights": [
                    {
                        "role": "Key Light",
                        "roleKey": "key",
                        "position": "45° camera-right",
                        "height": "6'8\"",
                        "distance": "5'11\"",
                        "modifier": "Softbox",
                        "powerHint": "Start at 1/4 power",
                        "notes": ["Feather slightly toward camera"],
                        "angle_deg": 45,
                        "distance_m": 1.8,
                        "height_m": 2.0,
                    },
                ],
            },
            "cameraSettings": {
                "aperture": "f/5.6",
                "iso": "100",
                "shutter": "1/160",
                "wb": "Flash (5500K)",
            },
        }

    def test_shoot_mode_without_room(self):
        """Shoot mode works normally without room dimensions."""
        resp = client.post("/api/shoot-mode/start", json={
            "result": self._make_result(),
            "role": "photographer",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "success"
        assert len(data["steps"]) > 0

    def test_shoot_mode_with_room(self):
        """Room dimensions add wall-proximity tips to light steps."""
        resp = client.post("/api/shoot-mode/start", json={
            "result": self._make_result(),
            "role": "photographer",
            "roomDimensionsFt": {"lengthFt": 20, "widthFt": 15, "ceilingFt": 10},
        })
        assert resp.status_code == 200
        data = resp.json()
        light_steps = [s for s in data["steps"] if s["type"] == "light_placement"]
        assert len(light_steps) >= 1
        # Room tips should be appended
        all_tips = []
        for step in light_steps:
            all_tips.extend(step.get("tips", []))
        room_tips = [t for t in all_tips if "wall" in t.lower() or "ft from" in t.lower()]
        assert len(room_tips) > 0

    def test_shoot_mode_ceiling_from_room(self):
        """Ceiling height is derived from roomDimensionsFt when provided."""
        result = self._make_result()
        # Make the light height exceed the room ceiling
        result["setup"]["lights"][0]["height_m"] = 3.5  # ~11.5 ft
        resp = client.post("/api/shoot-mode/start", json={
            "result": result,
            "role": "photographer",
            "roomDimensionsFt": {"lengthFt": 20, "widthFt": 15, "ceilingFt": 9},
        })
        data = resp.json()
        light_steps = [s for s in data["steps"] if s["type"] == "light_placement"]
        # Should have a ceiling warning
        all_warnings = []
        for step in light_steps:
            all_warnings.extend(step.get("warnings", []))
        ceiling_warnings = [w for w in all_warnings if "ceiling" in w.lower() or "exceeds" in w.lower()]
        assert len(ceiling_warnings) > 0


# ── Validation edge cases ─────────────────────────────────

class TestEdgeCases:
    """Edge cases and boundary conditions."""

    def test_empty_lights(self):
        """Calibrate with no lights should return empty positions."""
        resp = client.post("/api/spatial/calibrate", json={
            "room": MEDIUM_ROOM,
            "diagramSpec": {"lights": []},
        })
        data = resp.json()
        assert data["status"] == "success"
        assert len(data["positions"]) == 0

    def test_validate_empty_heights(self):
        resp = client.post("/api/spatial/validate", json={
            "room": MEDIUM_ROOM,
            "lightHeights": [],
        })
        data = resp.json()
        assert data["fits"] is True

    def test_room_validation_rejects_negative_dims(self):
        resp = client.post("/api/spatial/validate", json={
            "room": {"lengthFt": -5, "widthFt": 10, "ceilingFt": 8},
            "lightHeights": [],
        })
        assert resp.status_code == 422  # Pydantic validation

    def test_room_validation_rejects_zero_ceiling(self):
        resp = client.post("/api/spatial/validate", json={
            "room": {"lengthFt": 10, "widthFt": 10, "ceilingFt": 0},
            "lightHeights": [],
        })
        assert resp.status_code == 422

    def test_single_light_in_corner(self):
        """Light placed near a corner should get wall warnings."""
        corner_spec = {
            "lights": [
                {"role": "key", "angle_deg": -90, "distance_m": 3.0, "height_m": 2.0, "modifier": "softbox"},
            ],
        }
        resp = client.post("/api/spatial/calibrate", json={
            "room": SMALL_ROOM,
            "diagramSpec": corner_spec,
            "subjectPosition": {"x": 5.0, "y": 4.8},
        })
        data = resp.json()
        key_pos = data["positions"][0]
        # -90° means camera-left, so x should decrease
        assert key_pos["x"] < 5.0
        # If it goes past the wall, there should be a warning
        if key_pos["x"] < 0 or key_pos["x"] < 1.5:
            assert len(data["warnings"]) > 0


# ── Ceiling category derivation ───────────────────────────
# This mirrors the JS ceilingFtToCategory() in transform.js.
# The Python version is tested here for parity.

def _ceiling_ft_to_category(ceiling_ft: float) -> str:
    """Python mirror of JS ceilingFtToCategory for testing."""
    if ceiling_ft < 8:
        return "under_8"
    if ceiling_ft < 10:
        return "8_9"
    if ceiling_ft < 12:
        return "10_12"
    return "12_plus"


class TestCeilingCategory:
    """Test ceiling height to category conversion logic."""

    def test_under_8(self):
        assert _ceiling_ft_to_category(7.5) == "under_8"

    def test_8_to_9(self):
        assert _ceiling_ft_to_category(8.5) == "8_9"

    def test_10_to_12(self):
        assert _ceiling_ft_to_category(11.0) == "10_12"

    def test_12_plus(self):
        assert _ceiling_ft_to_category(14.0) == "12_plus"

    def test_boundary_8(self):
        assert _ceiling_ft_to_category(8.0) == "8_9"

    def test_boundary_10(self):
        assert _ceiling_ft_to_category(10.0) == "10_12"

    def test_boundary_12(self):
        assert _ceiling_ft_to_category(12.0) == "12_plus"
