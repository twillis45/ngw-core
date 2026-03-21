"""Tests for engine/diagram.py

Covers:
  Schema validation    — DiagramSpec, LightPlacement, SubjectPosition, CameraPosition
  Key light placement  — angle, distance, height per mood
  Fill light presence  — present for beauty/corporate/natural/high_key, absent for low_key/cinematic/editorial
  Rim light presence   — present for low_key/cinematic/editorial/beauty
  Modifier adjustments — close modifiers reduce distance, far modifiers increase distance
  Defaults             — system without taxonomy_refs gets sensible defaults
  Determinism          — same input → same output
  Coordinate bounds    — all angles within [-180, 180], distances > 0, heights >= 0
"""

import pytest

from engine.diagram import (
    DiagramSpec,
    LightPlacement,
    SubjectPosition,
    CameraPosition,
    build_diagram,
    build_reference_diagram,
)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _sys(id_: str, mood: str = "corporate", gear: str = "strobe_mono",
         modifier: str = "softbox_rect") -> dict:
    return {
        "id": id_,
        "name": f"System {id_}",
        "criteria": {},
        "features": {},
        "taxonomy_refs": {
            "gear_profile": gear,
            "modifier_family": modifier,
            "mood": mood,
            "environment": "studio_large",
            "skin_tone": "medium",
        },
    }


def _bare_sys(id_: str = "bare") -> dict:
    """System with no taxonomy_refs."""
    return {"id": id_, "name": "Bare System", "criteria": {}, "features": {}}


# ── Schema validation ────────────────────────────────────────────────────────

class TestSchema:
    def test_diagram_spec_fields(self):
        d = build_diagram(_sys("a"))
        assert isinstance(d, DiagramSpec)
        assert d.system_id == "a"
        assert isinstance(d.subject, SubjectPosition)
        assert isinstance(d.camera, CameraPosition)
        assert len(d.lights) >= 1

    def test_light_placement_fields(self):
        d = build_diagram(_sys("a"))
        key = d.lights[0]
        assert isinstance(key, LightPlacement)
        assert key.role == "key"
        assert key.label != ""
        assert key.modifier != ""

    def test_subject_at_origin(self):
        d = build_diagram(_sys("a"))
        assert d.subject.x == 0.0
        assert d.subject.y == 0.0

    def test_camera_in_front(self):
        d = build_diagram(_sys("a"))
        assert d.camera.angle_deg == 0.0
        assert d.camera.distance_m > 0


# ── Key light per mood ───────────────────────────────────────────────────────

class TestKeyLightMood:
    def test_beauty_frontal(self):
        d = build_diagram(_sys("a", mood="beauty"))
        key = d.lights[0]
        assert key.angle_deg == 0.0  # Butterfly / paramount

    def test_low_key_angled(self):
        d = build_diagram(_sys("a", mood="low_key"))
        key = d.lights[0]
        assert key.angle_deg == 45.0  # Rembrandt

    def test_cinematic_strong_side(self):
        d = build_diagram(_sys("a", mood="cinematic"))
        key = d.lights[0]
        assert key.angle_deg == 60.0

    def test_corporate_slight_offset(self):
        d = build_diagram(_sys("a", mood="corporate"))
        key = d.lights[0]
        assert key.angle_deg == 20.0

    def test_natural_window_angle(self):
        d = build_diagram(_sys("a", mood="natural"))
        key = d.lights[0]
        assert key.angle_deg == 30.0

    def test_editorial_extreme(self):
        d = build_diagram(_sys("a", mood="editorial"))
        key = d.lights[0]
        assert key.angle_deg == 75.0

    def test_high_key_near_frontal(self):
        d = build_diagram(_sys("a", mood="high_key"))
        key = d.lights[0]
        assert key.angle_deg == 15.0


# ── Fill light ───────────────────────────────────────────────────────────────

class TestFillLight:
    def test_fill_present_corporate(self):
        d = build_diagram(_sys("a", mood="corporate"))
        roles = [l.role for l in d.lights]
        assert "fill" in roles

    def test_fill_present_beauty(self):
        d = build_diagram(_sys("a", mood="beauty"))
        roles = [l.role for l in d.lights]
        assert "fill" in roles

    def test_fill_present_high_key(self):
        d = build_diagram(_sys("a", mood="high_key"))
        roles = [l.role for l in d.lights]
        assert "fill" in roles

    def test_no_fill_low_key(self):
        d = build_diagram(_sys("a", mood="low_key"))
        roles = [l.role for l in d.lights]
        assert "fill" not in roles

    def test_no_fill_cinematic(self):
        d = build_diagram(_sys("a", mood="cinematic"))
        roles = [l.role for l in d.lights]
        assert "fill" not in roles

    def test_no_fill_editorial(self):
        d = build_diagram(_sys("a", mood="editorial"))
        roles = [l.role for l in d.lights]
        assert "fill" not in roles

    def test_fill_opposite_side(self):
        d = build_diagram(_sys("a", mood="corporate"))
        key = next(l for l in d.lights if l.role == "key")
        fill = next(l for l in d.lights if l.role == "fill")
        # Fill should be on opposite side of key
        assert key.angle_deg * fill.angle_deg <= 0  # Opposite signs (or one is zero)


# ── Rim light ────────────────────────────────────────────────────────────────

class TestRimLight:
    def test_rim_low_key(self):
        d = build_diagram(_sys("a", mood="low_key"))
        roles = [l.role for l in d.lights]
        assert "rim" in roles

    def test_rim_cinematic(self):
        d = build_diagram(_sys("a", mood="cinematic"))
        assert any(l.role == "rim" for l in d.lights)

    def test_rim_beauty(self):
        d = build_diagram(_sys("a", mood="beauty"))
        assert any(l.role == "rim" for l in d.lights)

    def test_no_rim_corporate(self):
        d = build_diagram(_sys("a", mood="corporate"))
        assert not any(l.role == "rim" for l in d.lights)

    def test_rim_behind_subject(self):
        d = build_diagram(_sys("a", mood="low_key"))
        rim = next(l for l in d.lights if l.role == "rim")
        assert abs(rim.angle_deg) > 90  # Behind the subject

    def test_rim_has_grid(self):
        d = build_diagram(_sys("a", mood="low_key"))
        rim = next(l for l in d.lights if l.role == "rim")
        assert rim.modifier == "grid_spot"


# ── Modifier distance adjustments ────────────────────────────────────────────

class TestModifierDistance:
    def test_soft_modifier_closer(self):
        d_soft = build_diagram(_sys("a", modifier="softbox_octa"))
        d_bare = build_diagram(_sys("a", modifier="bare_bulb"))
        key_soft = d_soft.lights[0].distance_m
        key_bare = d_bare.lights[0].distance_m
        assert key_soft < key_bare

    def test_grid_modifier_farther(self):
        d_grid = build_diagram(_sys("a", modifier="grid_spot"))
        d_soft = build_diagram(_sys("a", modifier="softbox_rect"))
        assert d_grid.lights[0].distance_m > d_soft.lights[0].distance_m


# ── Defaults ─────────────────────────────────────────────────────────────────

class TestDefaults:
    def test_no_taxonomy_refs(self):
        d = build_diagram(_bare_sys())
        assert d.system_id == "bare"
        assert len(d.lights) >= 1
        assert d.lights[0].role == "key"

    def test_default_is_corporate_mood(self):
        d = build_diagram(_bare_sys())
        # Corporate default: key at 20° with fill
        assert d.lights[0].angle_deg == 20.0
        roles = [l.role for l in d.lights]
        assert "fill" in roles


# ── Coordinate bounds ────────────────────────────────────────────────────────

class TestCoordinateBounds:
    def test_all_angles_in_range(self):
        for mood in ["high_key", "low_key", "natural", "cinematic", "beauty", "editorial", "corporate"]:
            d = build_diagram(_sys("a", mood=mood))
            for light in d.lights:
                assert -180.0 <= light.angle_deg <= 180.0, f"{mood}/{light.role}: angle {light.angle_deg}"

    def test_all_distances_positive(self):
        for mood in ["high_key", "low_key", "natural", "cinematic", "beauty", "editorial", "corporate"]:
            d = build_diagram(_sys("a", mood=mood))
            for light in d.lights:
                assert light.distance_m > 0, f"{mood}/{light.role}: distance {light.distance_m}"

    def test_all_heights_non_negative(self):
        for mood in ["high_key", "low_key", "natural", "cinematic", "beauty", "editorial", "corporate"]:
            d = build_diagram(_sys("a", mood=mood))
            for light in d.lights:
                assert light.height_m >= 0, f"{mood}/{light.role}: height {light.height_m}"


# ── Determinism ──────────────────────────────────────────────────────────────

class TestDiagramDeterminism:
    def test_same_input_same_output(self):
        s = _sys("a", mood="cinematic")
        a = build_diagram(s)
        b = build_diagram(s)
        assert a.model_dump() == b.model_dump()


# ── Reference diagram (detected lighting) ──────────────────────────────────

class TestReferenceDiagram:
    def test_triangle_has_three_lights(self):
        d = build_reference_diagram(pattern="triangle", modifier_family="softbox_rect")
        assert d.system_id == "reference_detected"
        assert len(d.lights) == 3
        roles = [l.role for l in d.lights]
        assert "key_left" in roles
        assert "key_right" in roles
        assert "fill_low" in roles

    def test_triangle_symmetric_keys(self):
        d = build_reference_diagram(pattern="triangle", modifier_family="softbox_rect")
        left = next(l for l in d.lights if l.role == "key_left")
        right = next(l for l in d.lights if l.role == "key_right")
        assert left.angle_deg == -right.angle_deg
        assert left.height_m == right.height_m
        assert left.distance_m == right.distance_m
        assert left.modifier == right.modifier == "softbox_rect"

    def test_clamshell_has_two_lights(self):
        d = build_reference_diagram(pattern="clamshell", modifier_family="beauty_dish")
        assert len(d.lights) == 2
        roles = [l.role for l in d.lights]
        assert "key" in roles
        assert "fill" in roles

    def test_clamshell_key_above_fill(self):
        d = build_reference_diagram(pattern="clamshell")
        key = next(l for l in d.lights if l.role == "key")
        fill = next(l for l in d.lights if l.role == "fill")
        assert key.height_m > fill.height_m

    def test_rembrandt_single_key_at_45(self):
        d = build_reference_diagram(pattern="rembrandt", modifier_family="beauty_dish")
        assert len(d.lights) == 1
        assert d.lights[0].angle_deg == 45.0
        assert d.lights[0].modifier == "beauty_dish"

    def test_loop_single_key_at_30(self):
        d = build_reference_diagram(pattern="loop")
        assert len(d.lights) == 1
        assert d.lights[0].angle_deg == 30.0

    def test_split_single_key_at_90(self):
        d = build_reference_diagram(pattern="split")
        assert len(d.lights) == 1
        assert d.lights[0].angle_deg == 90.0

    def test_unknown_fallback(self):
        d = build_reference_diagram(pattern="unknown")
        assert len(d.lights) == 1
        assert d.lights[0].role == "key"
        # Generic position
        assert d.lights[0].angle_deg == 20.0

    def test_modifier_none_defaults_to_unknown(self):
        d = build_reference_diagram(pattern="loop", modifier_family=None)
        assert d.lights[0].modifier == "unknown"

    def test_all_patterns_produce_valid_spec(self):
        """Every pattern produces a valid DiagramSpec with sane bounds."""
        for pat in ["triangle", "clamshell", "rembrandt", "loop", "split", "unknown"]:
            d = build_reference_diagram(pattern=pat)
            assert isinstance(d, DiagramSpec)
            assert d.system_id == "reference_detected"
            for light in d.lights:
                assert -180.0 <= light.angle_deg <= 180.0
                assert light.distance_m > 0
                assert light.height_m >= 0
                assert light.modifier != ""


# ── Background light on reference diagram ────────────────────────────────

class TestReferenceDiagramBackgroundLight:
    def test_background_light_added_when_flag_true(self):
        """background_light=True should add a background role light."""
        d = build_reference_diagram(pattern="rembrandt", background_light=True)
        roles = [l.role for l in d.lights]
        assert "background" in roles
        bg = next(l for l in d.lights if l.role == "background")
        assert bg.angle_deg == 180.0  # Behind subject
        assert bg.label == "Detected Background Light"
        assert any("background" in n.lower() for n in bg.notes)

    def test_no_background_light_by_default(self):
        """Without background_light flag, no background role should exist."""
        d = build_reference_diagram(pattern="rembrandt")
        roles = [l.role for l in d.lights]
        assert "background" not in roles

    def test_background_light_false_no_bg(self):
        """Explicit background_light=False → no background role."""
        d = build_reference_diagram(pattern="loop", background_light=False)
        roles = [l.role for l in d.lights]
        assert "background" not in roles

    def test_background_light_with_triangle(self):
        """Triangle + background light → 4 lights total."""
        d = build_reference_diagram(pattern="triangle", background_light=True)
        assert len(d.lights) == 4
        roles = [l.role for l in d.lights]
        assert "key_left" in roles
        assert "key_right" in roles
        assert "fill_low" in roles
        assert "background" in roles

    def test_background_light_with_clamshell(self):
        """Clamshell + background light → 3 lights total."""
        d = build_reference_diagram(pattern="clamshell", background_light=True)
        assert len(d.lights) == 3
        roles = [l.role for l in d.lights]
        assert "key" in roles
        assert "fill" in roles
        assert "background" in roles

    def test_background_light_with_unknown(self):
        """Unknown + background light → 2 lights (key + background)."""
        d = build_reference_diagram(pattern="unknown", background_light=True)
        assert len(d.lights) == 2
        roles = [l.role for l in d.lights]
        assert "key" in roles
        assert "background" in roles

    def test_all_patterns_valid_with_background(self):
        """Every pattern with background light should produce valid specs."""
        for pat in ["triangle", "clamshell", "rembrandt", "loop", "split", "unknown"]:
            d = build_reference_diagram(pattern=pat, background_light=True)
            assert isinstance(d, DiagramSpec)
            bg_lights = [l for l in d.lights if l.role == "background"]
            assert len(bg_lights) == 1
            bg = bg_lights[0]
            assert -180.0 <= bg.angle_deg <= 180.0
            assert bg.distance_m > 0
            assert bg.height_m >= 0
