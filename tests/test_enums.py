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
    SourceContext,
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

    def test_canonical_patterns(self):
        """The 14 canonical geometry patterns must all be present and addressable."""
        canonical = [
            "loop", "rembrandt", "butterfly", "clamshell", "split",
            "broad", "short", "high_key", "low_key", "flat",
            "ring_light", "rim", "silhouette_key", "projected",
        ]
        for p in canonical:
            assert LightingPattern(p).value == p, f"Canonical pattern missing: {p}"

    def test_canonical_pattern_display_labels(self):
        """Every canonical pattern must have a human-readable display label
        (not raw snake_case)."""
        canonical = [
            "loop", "rembrandt", "butterfly", "clamshell", "split",
            "broad", "short", "high_key", "low_key", "flat",
            "ring_light", "rim", "silhouette_key", "projected",
        ]
        for p in canonical:
            label = LightingPattern(p).label
            assert label != p, f"Pattern '{p}' has no custom display label (shows raw value)"
            assert "_" not in label, f"Pattern '{p}' label contains underscore: '{label}'"

    def test_new_canonical_values_and_labels(self):
        assert LightingPattern.RING_LIGHT == "ring_light"
        assert LightingPattern.RING_LIGHT.label == "Ring Light"
        assert LightingPattern.RIM == "rim"
        assert LightingPattern.RIM.label == "Rim / Edge Light"
        assert LightingPattern.PROJECTED == "projected"
        assert LightingPattern.PROJECTED.label == "Projected / Interrupted Light"
        assert LightingPattern.SILHOUETTE_KEY == "silhouette_key"
        assert LightingPattern.SILHOUETTE_KEY.label == "Silhouette / Back Key"

    def test_migration_aliases_still_deserialize(self):
        """Old machine values must still deserialize for replay record safety.
        These are temporary — remove after 2026-05-06 alias window closes."""
        aliases = {
            "rim_only":        "Rim / Edge Light",
            "axial":           "Ring Light",           # stray axial shim → ring_light
            "flat_fashion":    "Flat",
            "gobo_projection": "Projected / Interrupted Light",
            "golden_hour":     "Golden Hour",
            "overcast_natural": "Overcast Natural",
        }
        for value, expected_label in aliases.items():
            p = LightingPattern(value)
            assert p.value == value
            assert p.label == expected_label, (
                f"Alias '{value}' label mismatch: got '{p.label}', expected '{expected_label}'"
            )

    def test_removed_values_are_aliases_not_canonical(self):
        """Renamed/removed patterns must not appear as primary canonical values —
        they exist only as migration shims."""
        canonical_values = {p.value for p in LightingPattern
                            if p not in (
                                LightingPattern.RIM_ONLY,
                                LightingPattern.AXIAL,
                                LightingPattern.FLAT_FASHION,
                                LightingPattern.GOBO_PROJECTION,
                                LightingPattern.GOLDEN_HOUR,
                                LightingPattern.OVERCAST_NATURAL,
                            )}
        assert "ring_light" in canonical_values
        assert "rim" in canonical_values
        assert "projected" in canonical_values
        assert "flat" in canonical_values

    def test_existing_specialty_patterns(self):
        """Specialty patterns must remain in the enum — they have benchmarks."""
        specialty = [
            "window_portrait", "bare_bulb_editorial", "strip_dramatic",
            "short_fashion_key", "soft_editorial_key", "editorial_rim_key",
            "tabletop_soft_product", "bottle_backlight", "athletic_rim_sculpt",
            "window_negative_fill", "shallow_loop", "triangle", "hybrid",
        ]
        for p in specialty:
            assert LightingPattern(p).value == p, f"Specialty pattern missing: {p}"

    def test_source_context_enum(self):
        """SourceContext must contain the canonical source-type values that
        replaced source-type patterns."""
        canonical_contexts = ["studio", "window", "overcast", "golden_hour",
                              "mixed_source", "outdoor_sun", "unknown"]
        for ctx in canonical_contexts:
            assert SourceContext(ctx).value == ctx
        # Display labels must be human-readable
        assert SourceContext.WINDOW.label == "Window Light"
        assert SourceContext.GOLDEN_HOUR.label == "Golden Hour"
        assert SourceContext.MIXED_SOURCE.label == "Mixed Sources"
        assert SourceContext.OVERCAST.label == "Overcast"

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


class TestAnalysisOrderEnforcement:
    """Analysis-Order Enforcement Pass — negative tests.

    These tests guard against the most dangerous failure modes identified in
    the Expert Deconstruction Order (s61):

      - Source/environment descriptors must NEVER reach authoritative_pattern
      - Display labels must NEVER enter canonical backend fields
      - Unknown key direction must NOT collapse to on-axis assumption
    """

    def test_source_context_values_blocked_from_pattern_resolution(self):
        """NEGATIVE TEST (most dangerous failure mode).

        Source-context values (golden_hour, overcast_natural, window_light,
        mixed_light, etc.) must NEVER become the authoritative_pattern stored
        in canonical DB/API fields.  If _normalize_pattern lets any of these
        through, taxonomy contamination occurs.

        These are environment/source descriptors, not shadow geometry patterns.
        The correct authoritative_pattern for a golden-hour shot is the
        geometry (e.g. "loop"), not "golden_hour".
        """
        from engine.orchestrator import AnalysisResult, resolve_pattern_candidates

        SOURCE_CONTEXT_VALUES = [
            "golden_hour",
            "overcast_natural",
            "overcast",
            "window_light",
            "mixed_light",
            "mixed_source",
            "outdoor_sun",
            "outdoor_shade",
        ]

        for sc_val in SOURCE_CONTEXT_VALUES:
            # Simulate a reference_read that leaked a source_context value as pattern
            from engine.orchestrator import PatternCandidate, PatternCandidates
            from engine.image_analysis_models import VisualCueReport

            result = AnalysisResult()
            # Inject a fake reference_analysis whose lighting_read.shadow_pattern
            # is a source_context value (simulating the contamination scenario)
            class FakeLR:
                shadow_pattern = sc_val
                pattern_confidence = 0.8
                pattern_source = "test"
                pattern_confidence_label = "strong"
            class FakeRA:
                lighting_read = FakeLR()
                def model_dump(self): return {}
            result.reference_analysis = FakeRA()

            pc = resolve_pattern_candidates(result)
            assert pc.authoritative_pattern != sc_val, (
                f"FAIL: source_context value '{sc_val}' reached authoritative_pattern. "
                f"Got: '{pc.authoritative_pattern}'. "
                f"Source-context values must be blocked by _normalize_pattern."
            )

    def test_display_labels_blocked_from_canonical_fields(self):
        """Display labels with slashes must never enter canonical pattern fields."""
        from engine.orchestrator import AnalysisResult, resolve_pattern_candidates

        DISPLAY_LABEL_LEAKS = [
            "Rim / Edge Light",
            "Ring / Axial",
            "Projected / Interrupted Light",
        ]
        for label in DISPLAY_LABEL_LEAKS:
            result = AnalysisResult()
            class FakeLR:
                shadow_pattern = label
                pattern_confidence = 0.9
                pattern_source = "test"
                pattern_confidence_label = "strong"
            class FakeRA:
                lighting_read = FakeLR()
                def model_dump(self): return {}
            result.reference_analysis = FakeRA()

            pc = resolve_pattern_candidates(result)
            assert " / " not in (pc.authoritative_pattern or ""), (
                f"FAIL: display label '{label}' with slash reached authoritative_pattern. "
                f"Got: '{pc.authoritative_pattern}'. Display labels must stay in UI only."
            )

    def test_mode_flags_populated_after_preread(self):
        """Layer 0 mode_flags must be populated after _layer0_mode_preread."""
        from engine.orchestrator import AnalysisResult, _layer0_mode_preread
        result = AnalysisResult()
        _layer0_mode_preread(result)
        assert isinstance(result.mode_flags, dict)
        assert "no_face"    in result.mode_flags
        assert "is_bw"      in result.mode_flags
        assert "is_hcg"     in result.mode_flags
        assert "scene_type" in result.mode_flags

    def test_definitive_pattern_wins_resolver(self):
        """Stage 1 definitive_pattern must short-circuit resolve_pattern_candidates."""
        from engine.orchestrator import AnalysisResult, resolve_pattern_candidates
        result = AnalysisResult()
        result.definitive_pattern = "ring_light"
        # Even with a reference_read saying something else, ring_light wins
        class FakeLR:
            shadow_pattern = "loop"
            pattern_confidence = 0.9
            pattern_source = "test"
            pattern_confidence_label = "strong"
        class FakeRA:
            lighting_read = FakeLR()
            def model_dump(self): return {}
        result.reference_analysis = FakeRA()

        pc = resolve_pattern_candidates(result)
        assert pc.authoritative_pattern == "ring_light", (
            f"FAIL: definitive_pattern 'ring_light' was overridden. "
            f"Got: '{pc.authoritative_pattern}'. Stage 1 must win."
        )
        assert pc.primary.source == "definitive_signature"
