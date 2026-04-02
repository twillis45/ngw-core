"""Tests for engine/lighting_inference.py

Covers:
  - Pattern inference from catchlight clock positions
  - Modifier inference from catchlight shapes
  - Cross-validation between palette mood and catchlight pattern
  - Skin tone mapping
  - to_input_ctx_fields() output
  - Full infer_lighting_from_vision() pipeline
"""

import pytest

from engine.lighting_inference import (
    LightingInference,
    _infer_background_light,
    _infer_modifier_from_catchlights,
    _infer_pattern_from_catchlights,
    _merge_with_classification,
    build_reference_description,
    describe_background,
    describe_catchlights,
    describe_light_quality,
    describe_pattern,
    describe_subject,
    infer_lighting_from_vision,
    match_catchlights_to_diagram,
)


# ── Catchlight builders ────────────────────────────────────────────────────

def _c(eye: str, position: str, shape: str = "round", intensity: float = 0.9):
    """Shorthand for a catchlight dict."""
    return {"eye": eye, "position": f"{position} o'clock", "shape": shape, "intensity": intensity}


# ── Pattern from catchlights ───────────────────────────────────────────────

class TestPatternFromCatchlights:
    def test_no_catchlights(self):
        result = _infer_pattern_from_catchlights([])
        assert result["pattern"] == "unknown"
        assert result["pattern_confidence"] == 0.0
        assert result["light_count"] == 0

    def test_single_at_10_loop_indeterminate(self):
        # 10 o'clock is camera-left elevated — loop and rembrandt are indistinguishable
        # from catchlight position alone (nose shadow is the only real discriminator).
        # Returns "loop" with low confidence so the orchestrator can override via shadow.
        result = _infer_pattern_from_catchlights([_c("left", "10"), _c("right", "10")])
        assert result["pattern"] == "loop"
        assert result["pattern_confidence"] <= 0.65
        assert "30-45 off-axis" in result["key_position_text"]
        assert result["light_count"] == 1

    def test_single_at_11_loop_indeterminate(self):
        # Same reasoning as 10 o'clock — returns loop with low confidence.
        result = _infer_pattern_from_catchlights([_c("left", "11")])
        assert result["pattern"] == "loop"
        assert result["pattern_confidence"] <= 0.65

    def test_single_at_1_loop(self):
        result = _infer_pattern_from_catchlights([_c("left", "1"), _c("right", "1")])
        assert result["pattern"] == "loop"
        assert "30-45 off-axis" in result["key_position_text"]

    def test_single_at_2_loop(self):
        result = _infer_pattern_from_catchlights([_c("left", "2")])
        assert result["pattern"] == "loop"

    def test_single_at_12_loop_butterfly(self):
        result = _infer_pattern_from_catchlights([_c("left", "12"), _c("right", "12")])
        assert result["pattern"] == "loop"
        assert result["light_count"] == 1

    def test_single_at_3_split(self):
        result = _infer_pattern_from_catchlights([_c("left", "3"), _c("right", "3")])
        assert result["pattern"] == "split"
        assert result["key_position_text"] == "90"

    def test_single_at_9_split(self):
        result = _infer_pattern_from_catchlights([_c("left", "9")])
        assert result["pattern"] == "split"

    def test_clamshell_both_eyes(self):
        result = _infer_pattern_from_catchlights([
            _c("left", "12"), _c("left", "6"),
            _c("right", "12"), _c("right", "6"),
        ])
        assert result["pattern"] == "clamshell"
        assert result["pattern_confidence"] >= 0.7
        assert result["fill_method_text"] == "near camera axis"

    def test_clamshell_one_eye_falls_through(self):
        """Single-eye clamshell is NOT reliable — could be costume reflections
        or environmental bounces.  Should fall through to multi-catchlight
        analysis instead of returning a weak clamshell signal."""
        result = _infer_pattern_from_catchlights([
            _c("left", "11"), _c("left", "5"),
        ])
        # With only one eye, pattern should NOT be clamshell
        assert result["pattern"] != "clamshell"

    def test_triangle_both_eyes(self):
        result = _infer_pattern_from_catchlights([
            _c("left", "10"), _c("left", "2"), _c("left", "6"),
            _c("right", "10"), _c("right", "2"), _c("right", "6"),
        ])
        assert result["pattern"] == "triangle"
        assert result["pattern_confidence"] >= 0.8
        assert result["key_position_text"] == "triangle"
        assert result["light_count"] == 3

    def test_triangle_one_eye(self):
        result = _infer_pattern_from_catchlights([
            _c("left", "10"), _c("left", "2"), _c("left", "5"),
        ])
        assert result["pattern"] == "triangle"
        assert result["pattern_confidence"] < 0.7  # lower for one eye

    def test_unusual_position_unknown(self):
        result = _infer_pattern_from_catchlights([_c("left", "7")])
        assert result["pattern"] == "unknown"
        assert len(result["unrecognized_details"]) >= 1

    def test_consistency_boosts_confidence(self):
        """Both eyes matching should give higher confidence than one eye."""
        one_eye = _infer_pattern_from_catchlights([_c("left", "10")])
        both_eyes = _infer_pattern_from_catchlights([_c("left", "10"), _c("right", "10")])
        assert both_eyes["pattern_confidence"] > one_eye["pattern_confidence"]


# ── Modifier from catchlights ──────────────────────────────────────────────

class TestModifierFromCatchlights:
    def test_no_catchlights(self):
        result = _infer_modifier_from_catchlights([])
        assert result["modifier"] is None
        assert result["modifier_confidence"] == 0.0

    def test_all_round_beauty_dish(self):
        result = _infer_modifier_from_catchlights([
            _c("left", "10", shape="round"),
            _c("right", "10", shape="round"),
        ])
        assert result["modifier"] == "beauty_dish"
        assert result["modifier_confidence"] == 0.5

    def test_all_rectangular_softbox(self):
        result = _infer_modifier_from_catchlights([
            _c("left", "10", shape="rectangular"),
            _c("right", "10", shape="rectangular"),
        ])
        assert result["modifier"] == "softbox_rect"
        assert result["modifier_confidence"] == 0.6

    def test_mixed_shapes_lower_confidence(self):
        result = _infer_modifier_from_catchlights([
            _c("left", "10", shape="round"),
            _c("right", "10", shape="rectangular"),
        ])
        assert result["modifier_confidence"] <= 0.3


# ── Cross-validation (mood vs pattern) ─────────────────────────────────────

class TestMergeWithClassification:
    def test_no_classification(self):
        result = _merge_with_classification(None, {"pattern": "loop"})
        assert result["detected_mood"] is None

    def test_mood_agrees_with_pattern(self):
        """beauty + clamshell → boosted confidence."""
        classification = {"mood": "beauty", "confidence": 0.7}
        pattern = {"pattern": "clamshell", "pattern_confidence": 0.75}
        result = _merge_with_classification(classification, pattern)
        assert result["detected_mood"] == "beauty"
        # Boosted: 0.6 * 0.7 + 0.4 * 0.75 = 0.72
        assert result["mood_confidence"] >= 0.7

    def test_mood_disagrees_with_pattern(self):
        """corporate + split/short → lowered confidence."""
        classification = {"mood": "corporate", "confidence": 0.7}
        pattern = {"pattern": "split", "pattern_confidence": 0.6}
        result = _merge_with_classification(classification, pattern)
        assert result["detected_mood"] == "corporate"
        # Lowered: 0.4 * 0.7 + 0.2 * 0.6 = 0.40
        assert result["mood_confidence"] < 0.5
        assert any("disagree" in n or "doesn't match" in n for n in result["notes"])

    def test_unknown_pattern_uses_palette(self):
        classification = {"mood": "natural", "confidence": 0.65}
        pattern = {"pattern": "unknown", "pattern_confidence": 0.0}
        result = _merge_with_classification(classification, pattern)
        assert result["detected_mood"] == "natural"
        assert result["mood_confidence"] == 0.65  # palette as-is


# ── to_input_ctx_fields ───────────────────────────────────────────────────

class TestToInputCtxFields:
    def test_full_inference(self):
        inf = LightingInference(
            pattern="triangle",
            pattern_confidence=0.85,
            modifier_family="softbox_rect",
            modifier_confidence=0.6,
            light_count=3,
            key_position_text="triangle",
            fill_method_text="",
            detected_mood="beauty",
            mood_confidence=0.7,
            detected_skin_tone="light",
            skin_tone_confidence=0.8,
        )
        ctx = inf.to_input_ctx_fields()
        assert ctx["detected_pattern"] == "triangle"
        assert ctx["detected_pattern_confidence"] == 0.85
        assert ctx["detected_modifier"] == "softbox_rect"
        assert ctx["detected_mood"] == "beauty"
        assert ctx["detected_skin_tone"] == "light"
        assert ctx["detected_light_count"] == 3
        assert ctx["detected_key_position"] == "triangle"

    def test_empty_inference(self):
        inf = LightingInference()
        ctx = inf.to_input_ctx_fields()
        assert ctx == {}

    def test_partial_inference(self):
        inf = LightingInference(
            pattern="loop",
            pattern_confidence=0.5,
            key_position_text="30 off-axis",
        )
        ctx = inf.to_input_ctx_fields()
        assert "detected_pattern" in ctx
        assert "detected_key_position" in ctx
        assert "detected_modifier" not in ctx
        assert "detected_mood" not in ctx


# ── Full pipeline ─────────────────────────────────────────────────────────

class TestInferLightingFromVision:
    def test_triangle_vision_data(self):
        """Simulated triangle catchlight data → triangle pattern."""
        vision_data = {
            "ok": True,
            "catchlights": {
                "ok": True,
                "count": 3,
                "catchlights": [
                    {"eye": "left", "position": "10 o'clock", "shape": "rectangular", "intensity": 0.9},
                    {"eye": "left", "position": "2 o'clock", "shape": "rectangular", "intensity": 0.88},
                    {"eye": "left", "position": "6 o'clock", "shape": "rectangular", "intensity": 0.75},
                    {"eye": "right", "position": "10 o'clock", "shape": "rectangular", "intensity": 0.91},
                    {"eye": "right", "position": "2 o'clock", "shape": "rectangular", "intensity": 0.87},
                    {"eye": "right", "position": "5 o'clock", "shape": "rectangular", "intensity": 0.72},
                ],
            },
            "skin_tone": {
                "ok": True,
                "skin_tone_guess": "light",
                "confidence": "high",
            },
        }
        classification = {"mood": "beauty", "confidence": 0.6}
        result = infer_lighting_from_vision(vision_data, classification)
        assert result.pattern == "triangle"
        assert result.pattern_confidence >= 0.8
        assert result.modifier_family == "softbox_rect"
        assert result.detected_skin_tone == "light"
        assert result.skin_tone_confidence == 0.8

    def test_single_catchlight_loop_cinematic(self):
        # 10 o'clock catchlight returns "loop" with low confidence (loop/rembrandt
        # indeterminate without nose shadow).  Mood classification can override later.
        vision_data = {
            "ok": True,
            "catchlights": {
                "ok": True,
                "count": 1,
                "catchlights": [
                    {"eye": "left", "position": "10 o'clock", "shape": "round", "intensity": 0.95},
                    {"eye": "right", "position": "10 o'clock", "shape": "round", "intensity": 0.93},
                ],
            },
            "skin_tone": {"ok": False},
        }
        result = infer_lighting_from_vision(vision_data, classification={"mood": "cinematic", "confidence": 0.7})
        assert result.pattern == "loop"
        assert result.pattern_confidence <= 0.65
        assert result.modifier_family == "beauty_dish"
        assert result.detected_mood == "cinematic"
        assert result.detected_skin_tone is None

    def test_no_catchlights_unknown(self):
        vision_data = {
            "ok": True,
            "catchlights": {"ok": True, "count": 0, "catchlights": []},
            "skin_tone": {"ok": False},
        }
        result = infer_lighting_from_vision(vision_data)
        assert result.pattern == "unknown"
        assert result.modifier_family is None
        assert result.light_count == 0

    def test_deep_skin_mapped_to_dark(self):
        vision_data = {
            "ok": True,
            "catchlights": {"ok": True, "count": 0, "catchlights": []},
            "skin_tone": {
                "ok": True,
                "skin_tone_guess": "deep",
                "confidence": "medium",
            },
        }
        result = infer_lighting_from_vision(vision_data)
        assert result.detected_skin_tone == "dark"
        assert result.skin_tone_confidence == 0.5

    def test_catchlights_not_ok(self):
        """When catchlights detection failed, should still work gracefully."""
        vision_data = {
            "ok": True,
            "catchlights": {"ok": False, "reason": "no_face_mesh_detected"},
            "skin_tone": {"ok": True, "skin_tone_guess": "medium", "confidence": "high"},
        }
        result = infer_lighting_from_vision(vision_data)
        assert result.pattern == "unknown"
        assert result.detected_skin_tone == "medium"


# ── Catchlight → diagram matching ─────────────────────────────────────────

class TestMatchCatchlightsToDiagram:
    def test_rembrandt_matches_upper_left(self):
        """10 o'clock catchlights should match the key light in rembrandt."""
        lights = [{"role": "key", "angle_deg": 45.0, "modifier": "beauty_dish"}]
        catchlights = [
            _c("left", "10"),
            _c("right", "10"),
        ]
        result = match_catchlights_to_diagram(lights, catchlights, "rembrandt")
        assert len(result) == 1
        assert len(result[0]["detectedFrom"]) == 2  # both eyes matched
        assert result[0]["detectedFrom"][0]["position"] == "10 o'clock"

    def test_triangle_matches_three_roles(self):
        """Triangle catchlights should map to key_left, key_right, fill_low."""
        lights = [
            {"role": "key_left", "angle_deg": -30.0, "modifier": "softbox"},
            {"role": "key_right", "angle_deg": 30.0, "modifier": "softbox"},
            {"role": "fill_low", "angle_deg": 0.0, "modifier": "softbox"},
        ]
        catchlights = [
            _c("left", "10"),   # upper_left → key_left
            _c("left", "2"),    # upper_right → key_right
            _c("left", "6"),    # lower → fill_low
        ]
        result = match_catchlights_to_diagram(lights, catchlights, "triangle")
        key_left_matches = result[0]["detectedFrom"]
        key_right_matches = result[1]["detectedFrom"]
        fill_matches = result[2]["detectedFrom"]
        assert len(key_left_matches) == 1
        assert key_left_matches[0]["position"] == "10 o'clock"
        assert len(key_right_matches) == 1
        assert key_right_matches[0]["position"] == "2 o'clock"
        assert len(fill_matches) == 1
        assert fill_matches[0]["position"] == "6 o'clock"

    def test_clamshell_matches_upper_and_lower(self):
        """Clamshell: upper catchlight → key, lower → fill."""
        lights = [
            {"role": "key", "angle_deg": 0.0, "modifier": "beauty_dish"},
            {"role": "fill", "angle_deg": 0.0, "modifier": "reflector"},
        ]
        catchlights = [
            _c("left", "12"),  # top_center → key
            _c("left", "6"),   # lower → fill
        ]
        result = match_catchlights_to_diagram(lights, catchlights, "clamshell")
        assert len(result[0]["detectedFrom"]) == 1  # key
        assert result[0]["detectedFrom"][0]["position"] == "12 o'clock"
        assert len(result[1]["detectedFrom"]) == 1  # fill
        assert result[1]["detectedFrom"][0]["position"] == "6 o'clock"

    def test_no_catchlights_empty_matches(self):
        """No catchlights → all detectedFrom lists empty."""
        lights = [{"role": "key", "angle_deg": 45.0, "modifier": "grid"}]
        result = match_catchlights_to_diagram(lights, [], "rembrandt")
        assert len(result) == 1
        assert result[0]["detectedFrom"] == []

    def test_unknown_pattern_no_matches(self):
        """Unknown pattern has no quadrant mapping → empty detectedFrom."""
        lights = [{"role": "key", "angle_deg": 20.0, "modifier": "softbox"}]
        catchlights = [_c("left", "10")]
        result = match_catchlights_to_diagram(lights, catchlights, "unknown")
        assert result[0]["detectedFrom"] == []

    def test_split_matches_hard_left(self):
        """9 o'clock catchlight → split key."""
        lights = [{"role": "key", "angle_deg": 90.0, "modifier": "grid"}]
        catchlights = [_c("left", "9")]
        result = match_catchlights_to_diagram(lights, catchlights, "split")
        assert len(result[0]["detectedFrom"]) == 1

    def test_original_light_data_preserved(self):
        """Matching should preserve all original light fields."""
        lights = [{"role": "key", "angle_deg": 45.0, "modifier": "beauty_dish", "extra": "value"}]
        result = match_catchlights_to_diagram(lights, [], "rembrandt")
        assert result[0]["angle_deg"] == 45.0
        assert result[0]["modifier"] == "beauty_dish"
        assert result[0]["extra"] == "value"


# ── Description generators ────────────────────────────────────────────────

class TestDescribeCatchlights:
    def test_no_catchlight_data(self):
        inf = LightingInference()
        result = describe_catchlights({}, inf)
        assert "No catchlights" in result["summary"]
        assert result["details"] == []
        assert isinstance(result["whatTheyReveal"], str)

    def test_not_ok_catchlights(self):
        inf = LightingInference()
        result = describe_catchlights({"ok": False}, inf)
        assert "No catchlights" in result["summary"]

    def test_single_catchlight(self):
        data = {
            "ok": True,
            "count": 1,
            "catchlights": [
                {"eye": "left", "position": "10 o'clock", "shape": "round", "intensity": 0.9},
            ],
            "inferred": {
                "keyLightPosition": "above, slightly left",
                "likelyModifier": "beauty dish or round source",
                "lightCount": 1,
            },
        }
        inf = LightingInference(pattern="rembrandt", pattern_confidence=0.7)
        result = describe_catchlights(data, inf)
        assert "One" in result["summary"] or "one" in result["summary"]
        assert "round" in result["summary"]
        assert len(result["details"]) >= 1
        assert "above, slightly left" in result["whatTheyReveal"]
        assert "rembrandt" in result["whatTheyReveal"].lower()

    def test_two_catchlights_clamshell(self):
        data = {
            "ok": True,
            "count": 2,
            "catchlights": [
                {"eye": "left", "position": "12 o'clock", "shape": "rectangular", "intensity": 0.85},
                {"eye": "left", "position": "6 o'clock", "shape": "rectangular", "intensity": 0.6},
            ],
            "inferred": {},
        }
        inf = LightingInference(pattern="clamshell", pattern_confidence=0.75)
        result = describe_catchlights(data, inf)
        assert "Two" in result["summary"] or "two" in result["summary"]
        assert "clamshell" in result["whatTheyReveal"].lower()

    def test_three_catchlights_triangle(self):
        data = {
            "ok": True,
            "count": 3,
            "catchlights": [
                {"eye": "left", "position": "10 o'clock", "shape": "rectangular", "intensity": 0.9},
                {"eye": "left", "position": "2 o'clock", "shape": "rectangular", "intensity": 0.88},
                {"eye": "left", "position": "6 o'clock", "shape": "rectangular", "intensity": 0.7},
            ],
            "inferred": {},
        }
        inf = LightingInference(pattern="triangle", pattern_confidence=0.85)
        result = describe_catchlights(data, inf)
        assert "Three" in result["summary"] or "three" in result["summary"]
        assert "triangle" in result["whatTheyReveal"].lower()


class TestDescribeLightQuality:
    def test_no_classification(self):
        result = describe_light_quality(None, None)
        assert result["quality"] == "unknown"
        assert "could not be determined" in result["summary"]

    def test_hard_warm_low(self):
        classification = {
            "lightQuality": "hard",
            "colorTemperature": "warm",
            "brightness": "low",
            "suggestedRecipe": "dramatic-rembrandt",
        }
        result = describe_light_quality(classification, None)
        assert result["quality"] == "hard"
        assert result["colorTemperature"] == "warm"
        assert result["brightness"] == "low"
        assert "Hard light" in result["summary"]
        assert "Warm" in result["summary"]
        assert "45" in result["direction"]

    def test_soft_neutral_high(self):
        classification = {
            "lightQuality": "soft",
            "colorTemperature": "neutral",
            "brightness": "high",
            "suggestedRecipe": "beauty-clamshell",
        }
        result = describe_light_quality(classification, None)
        assert result["quality"] == "soft"
        assert "Soft" in result["summary"]
        assert "Frontal" in result["direction"] or "on-axis" in result["direction"]


class TestDescribeBackground:
    def test_no_vision_data(self):
        result = describe_background(None, None)
        assert "could not be analyzed" in result["summary"]

    def test_dark_background(self):
        vision = {
            "region_attribution": {
                "masks": {"background_ratio": 0.55},
                "palettes": {
                    "background_palette": [
                        {"rgb": [20, 20, 22], "hex": "#141416", "name": "black", "pct": 80},
                        {"rgb": [35, 30, 28], "hex": "#231e1c", "name": "dark brown", "pct": 20},
                    ],
                },
            },
        }
        result = describe_background(vision, None)
        assert "dark" in result["summary"].lower() or "black" in result["summary"].lower()
        assert result["backgroundRatio"] == 0.55
        assert len(result["dominantColors"]) >= 1
        assert len(result["notes"]) >= 1

    def test_bright_background(self):
        vision = {
            "region_attribution": {
                "masks": {"background_ratio": 0.65},
                "palettes": {
                    "background_palette": [
                        {"rgb": [245, 245, 245], "hex": "#f5f5f5", "name": "white", "pct": 90},
                    ],
                },
            },
        }
        result = describe_background(vision, None)
        assert "white" in result["summary"].lower() or "bright" in result["summary"].lower()
        assert "white" in result["notes"][0].lower() or "bright" in result["notes"][0].lower()

    def test_tight_crop_framing(self):
        """Small background ratio means tight crop."""
        vision = {
            "region_attribution": {
                "masks": {"background_ratio": 0.15},
                "palettes": {
                    "background_palette": [
                        {"rgb": [100, 100, 100], "hex": "#646464", "name": "gray", "pct": 100},
                    ],
                },
            },
        }
        result = describe_background(vision, None)
        assert "tight" in result["summary"].lower() or "only" in result["summary"].lower()

    def test_no_background_palette(self):
        vision = {
            "region_attribution": {
                "masks": {"background_ratio": 0.4},
                "palettes": {"background_palette": []},
            },
        }
        result = describe_background(vision, None)
        assert "could not be isolated" in result["summary"]


class TestDescribePattern:
    def test_known_pattern(self):
        inf = LightingInference(
            pattern="rembrandt",
            pattern_confidence=0.7,
            light_count=1,
            key_position_text="45 off-axis",
            modifier_family="beauty_dish",
            modifier_confidence=0.5,
            detected_mood="cinematic",
            mood_confidence=0.6,
        )
        result = describe_pattern(inf)
        assert result["name"] == "rembrandt"
        assert "Rembrandt" in result["description"]
        assert result["confidenceLabel"] == "high confidence"
        assert result["lightCount"] == 1
        assert result["keyPosition"] == "45 off-axis"
        assert result["modifier"]["name"] == "beauty_dish"
        assert result["mood"]["name"] == "cinematic"

    def test_unknown_pattern(self):
        inf = LightingInference()
        result = describe_pattern(inf)
        assert result["name"] == "unknown"
        assert "could not be identified" in result["description"]
        assert result["confidenceLabel"] == "low confidence"

    def test_moderate_confidence_label(self):
        inf = LightingInference(pattern="loop", pattern_confidence=0.5)
        result = describe_pattern(inf)
        assert result["confidenceLabel"] == "moderate confidence"

    def test_all_patterns_have_descriptions(self):
        for pat in ["triangle", "clamshell", "rembrandt", "loop", "split", "unknown"]:
            inf = LightingInference(pattern=pat)
            result = describe_pattern(inf)
            assert len(result["description"]) > 20, f"No description for pattern: {pat}"


class TestDescribeSubject:
    def test_no_vision_data(self):
        result = describe_subject(None)
        assert result["pose"] == "unknown"
        assert "could not be analyzed" in result["summary"]

    def test_standing_front(self):
        vision = {
            "pose": {"ok": True, "pose": "standing", "angle": "front-ish", "visibility": 0.8},
            "region_attribution": {
                "masks": {"person_ratio": 0.5},
                "face_box": [0.35, 0.1, 0.65, 0.4],
            },
            "skin_tone": {
                "ok": True,
                "skin_tone_guess": "medium",
                "confidence": "high",
            },
        }
        result = describe_subject(vision)
        assert result["pose"] == "standing"
        assert result["angle"] == "front-ish"
        assert "standing" in result["summary"].lower()
        assert "facing" in result["summary"].lower() or "front" in result["summary"].lower()
        assert "medium" in result["summary"].lower() or "medium" in (result["skinTone"] or "")
        assert "centred" in result["facePosition"].lower() or "center" in result["facePosition"].lower()

    def test_sitting_profile(self):
        vision = {
            "pose": {"ok": True, "pose": "sitting", "angle": "profile-ish", "visibility": 0.6},
            "region_attribution": {
                "masks": {"person_ratio": 0.7},
                "face_box": [0.1, 0.05, 0.4, 0.35],
            },
            "skin_tone": {"ok": False},
        }
        result = describe_subject(vision)
        assert result["pose"] == "sitting"
        assert result["angle"] == "profile-ish"
        assert "seated" in result["summary"].lower()
        assert "side" in result["summary"].lower() or "profile" in result["summary"].lower()
        assert "left" in result["facePosition"].lower()

    def test_tight_crop(self):
        vision = {
            "pose": {"ok": True, "pose": "standing", "angle": "front-ish", "visibility": 0.9},
            "region_attribution": {
                "masks": {"person_ratio": 0.75},
            },
            "skin_tone": {"ok": False},
        }
        result = describe_subject(vision)
        assert "tight" in result["framing"].lower() or "fills" in result["framing"].lower()

    def test_full_body_framing(self):
        vision = {
            "pose": {"ok": True, "pose": "standing", "angle": "front-ish", "visibility": 0.5},
            "region_attribution": {
                "masks": {"person_ratio": 0.1},
            },
            "skin_tone": {"ok": False},
        }
        result = describe_subject(vision)
        assert "full" in result["framing"].lower() or "environmental" in result["framing"].lower()

    def test_pose_not_ok(self):
        vision = {
            "pose": {"ok": False, "reason": "no_pose_detected"},
            "region_attribution": {"masks": {}},
            "skin_tone": {"ok": False},
        }
        result = describe_subject(vision)
        assert result["pose"] == "unknown"
        assert result["angle"] == "unknown"


class TestBuildReferenceDescription:
    def test_full_pipeline(self):
        vision_data = {
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
            "pose": {"ok": True, "pose": "standing", "angle": "front-ish", "visibility": 0.8},
            "region_attribution": {
                "masks": {
                    "person_ratio": 0.5,
                    "background_ratio": 0.4,
                },
                "palettes": {
                    "background_palette": [
                        {"rgb": [30, 28, 25], "hex": "#1e1c19", "name": "dark brown", "pct": 100},
                    ],
                },
                "face_box": [0.3, 0.1, 0.7, 0.4],
            },
            "skin_tone": {
                "ok": True,
                "skin_tone_guess": "light",
                "confidence": "high",
            },
        }
        classification = {
            "mood": "cinematic",
            "confidence": 0.7,
            "lightQuality": "hard",
            "colorTemperature": "warm",
            "brightness": "low",
            "suggestedRecipe": "dramatic-rembrandt",
        }
        image_analysis = {
            "ok": True,
            "palette": {"overall": []},
            "classification": classification,
            "vision": vision_data,
        }
        inference = LightingInference(
            pattern="rembrandt",
            pattern_confidence=0.7,
            modifier_family="beauty_dish",
            modifier_confidence=0.5,
            light_count=1,
            key_position_text="45 off-axis",
            detected_mood="cinematic",
            mood_confidence=0.6,
            detected_skin_tone="light",
            skin_tone_confidence=0.8,
        )

        result = build_reference_description(
            vision_data=vision_data,
            classification=classification,
            image_analysis=image_analysis,
            inference=inference,
        )

        # All five sections present
        assert "catchlights" in result
        assert "lightQuality" in result
        assert "background" in result
        assert "pattern" in result
        assert "subject" in result

        # Catchlights
        assert "round" in result["catchlights"]["summary"]
        assert "rembrandt" in result["catchlights"]["whatTheyReveal"].lower()

        # Light quality
        assert result["lightQuality"]["quality"] == "hard"
        assert result["lightQuality"]["colorTemperature"] == "warm"

        # Background
        assert "dark" in result["background"]["summary"].lower()

        # Pattern
        assert result["pattern"]["name"] == "rembrandt"
        assert "Rembrandt" in result["pattern"]["description"]

        # Subject
        assert result["subject"]["pose"] == "standing"
        assert "light" in result["subject"]["skinTone"].lower()

    def test_minimal_data(self):
        """With empty vision data, all sections should return safely."""
        result = build_reference_description(
            vision_data={},
            classification=None,
            image_analysis={},
            inference=LightingInference(),
        )
        assert "catchlights" in result
        assert "lightQuality" in result
        assert "background" in result
        assert "pattern" in result
        assert "subject" in result
        # Nothing should crash, all should have summaries
        assert isinstance(result["catchlights"]["summary"], str)
        assert isinstance(result["lightQuality"]["summary"], str)
        assert isinstance(result["background"]["summary"], str)
        assert isinstance(result["pattern"]["description"], str)
        assert isinstance(result["subject"]["summary"], str)


# ── Background light inference ───────────────────────────────────────────

def _vision_with_bg(rgb_vals):
    """Build minimal vision_data with a given background palette RGB."""
    return {
        "region_attribution": {
            "masks": {"background_ratio": 0.5},
            "palettes": {
                "background_palette": [
                    {"rgb": rgb_vals, "hex": "#000000", "name": "test", "pct": 100},
                ],
            },
        },
    }


class TestInferBackgroundLight:
    def test_very_bright_bg_detected(self):
        """avg_luma > 220 → dedicated background light with high confidence."""
        result = _infer_background_light(_vision_with_bg([240, 240, 240]))
        assert result["detected"] is True
        assert result["confidence"] >= 0.8
        assert len(result["notes"]) >= 1

    def test_bright_bg_detected(self):
        """avg_luma 180–220 → background light with moderate confidence."""
        result = _infer_background_light(_vision_with_bg([200, 195, 190]))
        assert result["detected"] is True
        assert 0.5 <= result["confidence"] <= 0.7

    def test_mid_bright_bg_not_detected(self):
        """avg_luma 140–180 → ambiguous, not detected but some confidence."""
        result = _infer_background_light(_vision_with_bg([160, 155, 150]))
        assert result["detected"] is False
        assert result["confidence"] > 0.0
        assert len(result["notes"]) >= 1

    def test_dark_bg_not_detected(self):
        """avg_luma < 140 → no background light."""
        result = _infer_background_light(_vision_with_bg([30, 28, 25]))
        assert result["detected"] is False
        assert result["confidence"] == 0.0

    def test_no_bg_palette(self):
        """No background palette at all → not detected."""
        result = _infer_background_light({"region_attribution": {"palettes": {}}})
        assert result["detected"] is False

    def test_empty_vision_data(self):
        """Empty vision dict → not detected."""
        result = _infer_background_light({})
        assert result["detected"] is False

    def test_weighted_luma_mostly_white(self):
        """99% white + 1% black should still register as very bright."""
        vision = {
            "region_attribution": {
                "masks": {"background_ratio": 0.7},
                "palettes": {
                    "background_palette": [
                        {"rgb": [254, 254, 254], "hex": "#fefefe", "name": "white", "pct": 99.0},
                        {"rgb": [43, 49, 55], "hex": "#2b3137", "name": "black", "pct": 1.0},
                    ],
                },
            },
        }
        result = _infer_background_light(vision)
        # Weighted avg: (254 * 99 + 49 * 1) / 100 ≈ 251.9 → very bright
        assert result["detected"] is True
        assert result["confidence"] >= 0.8

    def test_weighted_luma_no_pct_fallback(self):
        """When pct is 0 or missing, fall back to unweighted average."""
        vision = {
            "region_attribution": {
                "palettes": {
                    "background_palette": [
                        {"rgb": [240, 240, 240], "hex": "#f0f0f0", "name": "white"},
                    ],
                },
            },
        }
        result = _infer_background_light(vision)
        assert result["detected"] is True
        assert result["confidence"] >= 0.8


class TestBackgroundLightIntegration:
    """Test that background light flows through infer_lighting_from_vision."""

    def test_bright_bg_increments_light_count(self):
        """Bright background should add 1 to light_count."""
        vision_data = {
            "ok": True,
            "catchlights": {
                "ok": True,
                "count": 1,
                "catchlights": [
                    {"eye": "left", "position": "10 o'clock", "shape": "round", "intensity": 0.9},
                ],
            },
            "skin_tone": {"ok": False},
            "region_attribution": {
                "masks": {"background_ratio": 0.5},
                "palettes": {
                    "background_palette": [
                        {"rgb": [240, 240, 240], "hex": "#f0f0f0", "name": "white", "pct": 100},
                    ],
                },
            },
        }
        result = infer_lighting_from_vision(vision_data)
        assert result.background_light_detected is True
        assert result.background_light_confidence >= 0.8
        # 1 catchlight light + 1 background light = 2
        assert result.light_count == 2

    def test_dark_bg_no_background_light(self):
        """Dark background → no background light, light_count unchanged."""
        vision_data = {
            "ok": True,
            "catchlights": {
                "ok": True,
                "count": 1,
                "catchlights": [
                    {"eye": "left", "position": "10 o'clock", "shape": "round", "intensity": 0.9},
                ],
            },
            "skin_tone": {"ok": False},
            "region_attribution": {
                "masks": {"background_ratio": 0.5},
                "palettes": {
                    "background_palette": [
                        {"rgb": [20, 20, 20], "hex": "#141414", "name": "black", "pct": 100},
                    ],
                },
            },
        }
        result = infer_lighting_from_vision(vision_data)
        assert result.background_light_detected is False
        assert result.light_count == 1  # Only the catchlight light

    def test_to_input_ctx_includes_background(self):
        """Background light should appear in input_ctx when detected."""
        inf = LightingInference(
            pattern="loop",
            pattern_confidence=0.5,
            light_count=2,
            background_light_detected=True,
            background_light_confidence=0.85,
        )
        ctx = inf.to_input_ctx_fields()
        assert ctx["detected_background_light"] is True
        assert ctx["detected_background_light_confidence"] == 0.85

    def test_to_input_ctx_excludes_background_when_false(self):
        """No background light → no background keys in input_ctx."""
        inf = LightingInference(pattern="loop", pattern_confidence=0.5)
        ctx = inf.to_input_ctx_fields()
        assert "detected_background_light" not in ctx


class TestDescribeBackgroundWithLight:
    """Test describe_background() with background light info from inference."""

    def test_bg_light_in_description(self):
        """When inference says background light detected, describe_background should include it."""
        vision = {
            "region_attribution": {
                "masks": {"background_ratio": 0.5},
                "palettes": {
                    "background_palette": [
                        {"rgb": [240, 240, 240], "hex": "#f0f0f0", "name": "white", "pct": 100},
                    ],
                },
            },
        }
        inf = LightingInference(background_light_detected=True, background_light_confidence=0.85)
        result = describe_background(vision, None, inference=inf)
        assert result["backgroundLight"] is not None
        assert result["backgroundLight"]["detected"] is True
        assert result["backgroundLight"]["confidence"] == 0.85
        assert "background light" in result["summary"].lower()
        assert any("background light" in n.lower() for n in result["notes"])

    def test_no_bg_light_in_description(self):
        """When no background light detected, backgroundLight should be None."""
        vision = {
            "region_attribution": {
                "masks": {"background_ratio": 0.5},
                "palettes": {
                    "background_palette": [
                        {"rgb": [30, 28, 25], "hex": "#1e1c19", "name": "dark", "pct": 100},
                    ],
                },
            },
        }
        inf = LightingInference(background_light_detected=False)
        result = describe_background(vision, None, inference=inf)
        assert result["backgroundLight"] is None

    def test_no_inference_passed(self):
        """When no inference is passed, backgroundLight should be None."""
        vision = {
            "region_attribution": {
                "masks": {"background_ratio": 0.5},
                "palettes": {
                    "background_palette": [
                        {"rgb": [240, 240, 240], "hex": "#f0f0f0", "name": "white", "pct": 100},
                    ],
                },
            },
        }
        result = describe_background(vision, None)
        assert result["backgroundLight"] is None
