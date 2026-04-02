"""Tests for the shared enum module."""

import json

import pytest

from engine.enums import (
    AmbiguityClass,
    BenchmarkCategory,
    CatchlightPattern,
    CatchlightShape,
    ConfidenceLevel,
    ContaminationFlag,
    ContradictionSeverity,
    DatasetTier,
    DistanceClass,
    EnvironmentType,
    Genre,
    KeyHeightRelative,
    LightRole,
    LightTechnology,
    LightingPattern,
    MasterProfile,
    ModifierFamily,
    OccluderType,
    PatternCategory,
    ProcessingStatus,
    ReviewStatus,
    ShadowHardness,
    ShadowPattern,
    SignalType,
    SourceSizeClass,
    SourceType,
    StyleFamily,
    SubjectType,
    SurfaceClass,
    UnderfillType,
    enum_choices,
    enum_label,
    enum_values,
)


# ── String compatibility ──────────────────────────────────────────────────

class TestStringCompatibility:
    """Enum values must compare equal to their plain string equivalents."""

    def test_light_role_string_equality(self):
        assert LightRole.KEY == "key"
        assert LightRole.NEGATIVE_FILL == "negative_fill"

    def test_lighting_pattern_string_equality(self):
        assert LightingPattern.CLAMSHELL == "clamshell"
        assert LightingPattern.REMBRANDT == "rembrandt"

    def test_environment_string_equality(self):
        assert EnvironmentType.STUDIO == "studio"
        assert EnvironmentType.WINDOW_LIGHT == "window_light"

    def test_modifier_string_equality(self):
        assert ModifierFamily.BEAUTY_DISH == "beauty_dish"
        assert ModifierFamily.LARGE_OCTA == "large_octa"

    def test_enum_in_dict_key(self):
        """Enums should work as dict keys interchangeable with strings."""
        d = {LightRole.KEY: 1.0}
        assert d["key"] == 1.0

    def test_enum_in_set(self):
        s = {"key", "fill", "rim"}
        assert LightRole.KEY in s

    def test_enum_in_json(self):
        data = {"role": LightRole.KEY, "pattern": LightingPattern.CLAMSHELL}
        serialized = json.dumps(data)
        parsed = json.loads(serialized)
        assert parsed["role"] == "key"
        assert parsed["pattern"] == "clamshell"


# ── Labels ────────────────────────────────────────────────────────────────

class TestLabels:
    """Every enum value must expose a human-readable label."""

    def test_custom_label(self):
        assert LightingPattern.BUTTERFLY.label == "Butterfly / Paramount"
        assert LightingPattern.EDITORIAL_RIM_KEY.label == "Editorial Rim + Key"

    def test_auto_label(self):
        """Values without custom labels should auto-generate from snake_case."""
        assert LightRole.KEY.label == "Key"
        assert LightRole.FILL.label == "Fill"
        assert DatasetTier.GOLD.label == "Gold"

    def test_master_profile_labels(self):
        assert MasterProfile.HURLEY.label == "Peter Hurley"
        assert MasterProfile.KARSH.label == "Yousuf Karsh"
        assert MasterProfile.LEIBOVITZ.label == "Annie Leibovitz"

    def test_contamination_labels(self):
        assert ContaminationFlag.BW_OR_HEAVY_GRADE.label == "B&W or Heavy Grading"
        assert ContaminationFlag.NO_FACE_MESH.label == "No Face Mesh"

    def test_shadow_pattern_labels(self):
        assert ShadowPattern.TRIANGLE.label == "Triangle (Hurley)"
        assert ShadowPattern.CROSS_SHAPED_GOBO.label == "Cross-Shaped Gobo"

    def test_modifier_labels(self):
        assert ModifierFamily.LARGE_OCTA.label == "Large Octabox"
        assert ModifierFamily.UMBRELLA_SILVER.label == "Silver Umbrella"

    def test_light_tech_labels(self):
        assert LightTechnology.CONTINUOUS_LED.label == "Continuous LED"
        assert LightTechnology.STROBE.label == "Strobe"

    def test_all_enums_have_labels(self):
        """Every enum member must return a non-empty label string."""
        enum_classes = [
            LightRole, LightingPattern, PatternCategory, ModifierFamily,
            EnvironmentType, KeyHeightRelative, DistanceClass, SourceSizeClass,
            SubjectType, SourceType, DatasetTier, CatchlightShape,
            CatchlightPattern, ShadowPattern, LightTechnology, UnderfillType,
            SignalType, ConfidenceLevel, BenchmarkCategory, ReviewStatus,
            ProcessingStatus, MasterProfile, StyleFamily, ContradictionSeverity,
            AmbiguityClass, ShadowHardness, SurfaceClass, Genre,
            ContaminationFlag, OccluderType,
        ]
        for cls in enum_classes:
            for member in cls:
                assert isinstance(member.label, str), f"{cls.__name__}.{member.name} has no label"
                assert len(member.label) > 0, f"{cls.__name__}.{member.name} has empty label"


# ── No underscores in labels ─────────────────────────────────────────────

class TestLabelFormatting:
    """Labels must never contain raw underscores (that's the internal value)."""

    ENUM_CLASSES = [
        LightRole, LightingPattern, PatternCategory, ModifierFamily,
        EnvironmentType, KeyHeightRelative, DistanceClass, SourceSizeClass,
        SubjectType, SourceType, DatasetTier, CatchlightShape,
        CatchlightPattern, ShadowPattern, LightTechnology, UnderfillType,
        SignalType, ConfidenceLevel, BenchmarkCategory, ReviewStatus,
        ProcessingStatus, MasterProfile, StyleFamily, ContradictionSeverity,
        AmbiguityClass, ShadowHardness, SurfaceClass, Genre,
        ContaminationFlag, OccluderType,
    ]

    def test_no_underscores_in_labels(self):
        for cls in self.ENUM_CLASSES:
            for member in cls:
                assert "_" not in member.label, (
                    f"{cls.__name__}.{member.name}.label = {member.label!r} contains underscore"
                )


# ── Confidence bucketing ─────────────────────────────────────────────────

class TestConfidenceLevel:
    def test_from_score_boundaries(self):
        assert ConfidenceLevel.from_score(0.0) == ConfidenceLevel.VERY_LOW
        assert ConfidenceLevel.from_score(0.19) == ConfidenceLevel.VERY_LOW
        assert ConfidenceLevel.from_score(0.2) == ConfidenceLevel.LOW
        assert ConfidenceLevel.from_score(0.4) == ConfidenceLevel.MODERATE
        assert ConfidenceLevel.from_score(0.6) == ConfidenceLevel.HIGH
        assert ConfidenceLevel.from_score(0.8) == ConfidenceLevel.VERY_HIGH
        assert ConfidenceLevel.from_score(1.0) == ConfidenceLevel.VERY_HIGH


# ── Helpers ───────────────────────────────────────────────────────────────

class TestHelpers:
    def test_enum_values(self):
        values = enum_values(DatasetTier)
        assert "gold" in values
        assert "community" in values
        assert "synthetic" in values

    def test_enum_label_found(self):
        assert enum_label(LightRole, "key") == "Key"
        assert enum_label(MasterProfile, "hurley") == "Peter Hurley"

    def test_enum_label_fallback(self):
        assert enum_label(LightRole, "not_a_role") == "Not A Role"

    def test_enum_choices(self):
        choices = enum_choices(ContradictionSeverity)
        assert len(choices) == 3
        assert choices[0] == {"value": "low", "label": "Low"}


# ── Backward compatibility: existing string values still work ─────────

class TestBackwardCompatibility:
    """Verify that all string values currently used in the codebase
    can be constructed from these enums."""

    def test_existing_roles(self):
        existing = ["key", "fill", "negative_fill", "rim", "kicker",
                     "background", "bounce"]
        for r in existing:
            assert LightRole(r).value == r

    def test_existing_patterns(self):
        existing = ["clamshell", "loop", "rembrandt", "split", "butterfly",
                     "broad", "short", "rim_only", "high_key", "low_key",
                     "flat_fashion", "window_portrait", "golden_hour",
                     "overcast_natural", "ring_light", "bare_bulb_editorial",
                     "strip_dramatic", "window_negative_fill"]
        for p in existing:
            assert LightingPattern(p).value == p

    def test_existing_environments(self):
        existing = ["studio", "window_light", "natural", "outdoor", "mixed",
                     "unknown"]
        for e in existing:
            assert EnvironmentType(e).value == e

    def test_existing_heights(self):
        existing = ["low", "eye_level", "high", "above_eye_level",
                     "below_eye_level", "overhead", "unknown"]
        for h in existing:
            assert KeyHeightRelative(h).value == h

    def test_existing_dataset_tiers(self):
        existing = ["gold", "community", "synthetic"]
        for t in existing:
            assert DatasetTier(t).value == t

    def test_existing_modifiers(self):
        existing = ["beauty_dish", "softbox", "umbrella", "stripbox",
                     "octa", "reflector", "ring_light", "grid", "bare_bulb",
                     "window", "sun", "unknown"]
        for m in existing:
            assert ModifierFamily(m).value == m

    def test_existing_light_tech(self):
        existing = ["continuous_led", "continuous_panel", "continuous_tube",
                     "strobe", "flash", "unknown"]
        for lt in existing:
            assert LightTechnology(lt).value == lt

    def test_existing_approval_statuses(self):
        for s in ["draft", "approved", "rejected", "archived"]:
            assert ReviewStatus(s).value == s

    def test_existing_ambiguity_classes(self):
        for a in ["clean", "minor_conflicts", "genuine_ambiguity",
                   "insufficient_data", "hybrid_lighting"]:
            assert AmbiguityClass(a).value == a
