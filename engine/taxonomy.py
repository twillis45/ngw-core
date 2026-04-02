"""
NGW Canonical Taxonomy — Phase 1 Truth Lockdown
================================================

This module is the single source of truth for:
  - Category boundaries (what belongs in each category)
  - Canonical target field names (what new code must use)
  - Legacy alias map (what existing models still use)
  - Cross-category contamination rules

IMPORT RULE
-----------
All new modules import categorical constants from here, not from engine.enums
directly. engine.enums remains the definition site; this module is the usage
contract.

DO NOT add logic here.
DO NOT import from modules that import from here (circular import risk).
"""

from engine.enums import (
    LightingPattern,
    PatternCategory,
    ModifierFamily,
    EnvironmentType,
    LightRole,
    FieldStatus,
)

TAXONOMY_VERSION = "1.0.0"


# ── Category boundaries ───────────────────────────────────────────────────────
#
# Each category owns a distinct axis of the lighting description.
# Values from one category MUST NOT appear in another category's fields.
# Mixing axes (e.g. storing a modifier name in a pattern field) is contamination.
#
#   PATTERN      — geometric/tonal relationship of key light to subject face.
#                  Describes the resulting look on the subject.
#                  Examples: loop, rembrandt, butterfly, high_key, window_portrait.
#                  Owner: LightingPattern enum.
#                  ⚠ Do not store modifier names, environment names, or role names here.
#
#   MODIFIER     — physical light shaping tool. Describes the source, not the look.
#                  Examples: beauty_dish, large_octa, bare_bulb, window.
#                  Owner: ModifierFamily enum.
#                  ⚠ Do not store pattern names here.
#                  ⚠ Do not store gear brand names here.
#
#   ENVIRONMENT  — shooting context. Studio/natural/mixed — not the pattern result.
#                  Examples: studio, window_light, outdoor_sun, overcast.
#                  Owner: EnvironmentType enum.
#                  ⚠ window_light is an environment. window_portrait is a pattern.
#                  ⚠ Do not conflate environment with the pattern it commonly produces.
#
#   PATTERN_CATEGORY — coarse grouping for UX/filtering. Not for inference logic.
#                  Examples: dramatic, beauty, editorial, natural.
#                  Owner: PatternCategory enum.
#                  ⚠ Do not use PatternCategory values in inference branching.
#                  ⚠ It is a display taxonomy, not a reasoning taxonomy.
#
#   LIGHT_ROLE   — function of an individual light within a multi-light setup.
#                  Examples: key, fill, rim, background.
#                  Owner: LightRole enum.
#                  ⚠ Light role is per-source. Pattern is per-setup.
#                  ⚠ They are not interchangeable.

CATEGORY_BOUNDARIES: dict[str, str] = {
    "LightingPattern":  "Geometric/tonal relationship of key to subject. Per-setup. The resulting look.",
    "ModifierFamily":   "Physical light shaping tool. Per-source. Not the look.",
    "EnvironmentType":  "Shooting context. Not the pattern result. Not the modifier.",
    "PatternCategory":  "Coarse UX grouping only. Not for inference decisions.",
    "LightRole":        "Function of one light in a multi-light setup. Per-source.",
}


# ── Canonical target field names ──────────────────────────────────────────────
#
# These are the names new code MUST use when adding new fields or new models.
# Existing legacy fields are preserved in place — do not rename them in Phase 1.
# The alias map below documents where each legacy name maps to.
#
# 'pattern' is the canonical target name for the resolved lighting pattern.
# It is NOT yet the live field name in existing models — see FIELD_ALIASES below.
# New code that introduces a field for the resolved pattern must name it 'pattern'.

CANONICAL_FIELD_NAMES: dict[str, str] = {
    "pattern":         "Resolved lighting pattern for this analysis. Type: str (LightingPattern value).",
    "setup_family":    "Coarse setup classification. Type: str.",
    "modifier_family": "Light modifier type inferred for key source. Type: str (ModifierFamily value).",
    "environment":     "Shooting environment. Type: str (EnvironmentType value).",
    "pattern_status":  "FieldStatus for the resolved pattern. Type: FieldStatus.",
}


# ── Legacy alias map ──────────────────────────────────────────────────────────
#
# Maps legacy field names (still present in existing models) to their canonical
# target names. Existing code is NOT changed in Phase 1. This map exists so:
#   1. New code knows which canonical name to use instead of a legacy name.
#   2. Phase 2 provenance work knows which fields to annotate first.
#   3. Reviewers can grep FIELD_ALIASES to find drift candidates.
#
# Format: { "legacy_field_name": "canonical_target_name" }
#
# NOTE: 'pattern' does not yet exist as a live field in any model.
# 'authoritative_pattern' on AnalysisResult is the current resolution point.
# The goal of Phase 1 is to document this — not to rename it yet.

FIELD_ALIASES: dict[str, str] = {
    # In GeometryInference (image_analysis_models.py) and LightingRead —
    # the pattern inferred from shadow/highlight geometry at cue stage.
    "shadow_pattern":        "pattern",

    # In LightingHypothesis (solver_models.py) —
    # the pattern name assigned to each solver candidate.
    "pattern_name":          "pattern",

    # In AnalysisResult (orchestrator.py) —
    # the current final resolution point. Preferred name for code added after W1.
    "authoritative_pattern": "pattern",

    # In SetupFamilyInference (image_analysis_models.py) —
    # the primary hypothesis string from Stage 4 cue inference.
    "primary_hypothesis":    "setup_family",

    # In SourceQualityInference (image_analysis_models.py) —
    # the modifier family inferred from Stage 2 light quality cues.
    "key_modifier_family":   "modifier_family",
}


# ── Cross-category contamination rules ────────────────────────────────────────
#
# Known contamination risks. Any code that violates these rules introduces
# taxonomy drift that compounds silently across the pipeline.

CONTAMINATION_RULES: list[str] = [
    "Never store a ModifierFamily value in a pattern field (shadow_pattern, authoritative_pattern, pattern_name, etc.).",
    "Never store an EnvironmentType value in a pattern field.",
    "Never use PatternCategory values in inference branching — they are display-only groupings.",
    "Never store a LightRole value in a modifier_family field.",
    "Never derive environment from pattern or pattern from environment — they are independent axes.",
    "window_light (EnvironmentType) and window_portrait (LightingPattern) are distinct concepts. Do not conflate.",
    "setup_family and pattern are not synonyms. setup_family is coarser (e.g. 'single-key') than pattern (e.g. 'rembrandt').",
]


__all__ = [
    "LightingPattern",
    "PatternCategory",
    "ModifierFamily",
    "EnvironmentType",
    "LightRole",
    "FieldStatus",
    "TAXONOMY_VERSION",
    "CATEGORY_BOUNDARIES",
    "CANONICAL_FIELD_NAMES",
    "FIELD_ALIASES",
    "CONTAMINATION_RULES",
]
