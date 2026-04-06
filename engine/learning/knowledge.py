"""
NGW Pattern Knowledge Base — Learning Layer.

This module is the epistemic core of the closed-loop learning system.
It defines *what NGW knows* about each lighting pattern, how it fails,
and how those failures should be weighted before a CI candidate is promoted.

Key classes
-----------
PatternEntry    — canonical pattern descriptor with known failure signatures
SymptomEntry    — a specific failure mode observed in production for a pattern
FixStep         — an actionable correction step with expected lift
LearningSignal  — a single quality-weighted feedback event from production
AggregatedInsight — rolled-up signal view used by the CI gate

Key functions
-------------
compute_signal_weight(skill_tier, confidence_score, source, outcome) → float
aggregate_signals_for_pattern(pattern_id, signals, days)            → AggregatedInsight
get_pattern_entry(pattern_id)                                        → PatternEntry | None
list_high_risk_patterns()                                            → list[str]
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


# ── Skill-tier multipliers ────────────────────────────────────────────────────
# Professionals catch real failures; beginners click randomly.
TIER_MULTIPLIERS: Dict[str, float] = {
    "pro":          2.0,
    "professional": 2.0,
    "advanced":     1.5,
    "intermediate": 1.0,
    "beginner":     0.5,
    "unknown":      0.7,   # conservative default
}

# Source-reliability multipliers
SOURCE_MULTIPLIERS: Dict[str, float] = {
    "expert_review": 2.5,  # curated human expert
    "live":          1.0,  # real production session
    "internal":      1.2,  # NGW team session
    "seeded":        0.4,  # synthetic seed data
    "unknown":       0.6,
}

# Outcome quality multipliers
OUTCOME_MULTIPLIERS: Dict[str, float] = {
    "nailed_it": 1.0,
    "close":     0.7,
    "failed":    1.0,   # failure signals are equally informative
    "unknown":   0.3,
}

# High-confidence corrections carry extra weight
CONFIDENCE_BOOST_THRESHOLD = 0.75
CONFIDENCE_BOOST_FACTOR    = 1.8


# ── Dataclasses ───────────────────────────────────────────────────────────────

@dataclass
class FixStep:
    """A single actionable correction step."""
    order:          int
    action:         str          # human-readable instruction
    module:         str          # e.g. "reference_read", "consensus_solver"
    parameter:      Optional[str] = None  # specific parameter to change
    expected_delta: float = 0.0   # expected accuracy improvement (0–1)
    notes:          str = ""


@dataclass
class SymptomEntry:
    """
    A known failure mode for a specific pattern.

    Symptoms are the *expected* failure signatures that inform whether a
    signal is consistent with a known problem or noise.
    """
    symptom_id:    str
    description:   str
    failure_mode:  str   # matches failure_cluster failure_mode values
    severity:      str   # low | medium | high
    frequency:     str   # rare | occasional | common | endemic
    fix_steps:     List[FixStep] = field(default_factory=list)
    notes:         str = ""


@dataclass
class PatternEntry:
    """
    Canonical knowledge entry for a lighting pattern.

    This is the stable reference that the CI gate checks signals against.
    It captures what the pattern looks like, what tends to go wrong, and
    how many signals are needed before we trust a proposed fix.
    """
    pattern_id:     str
    display_name:   str
    family:         str           # portrait | editorial | commercial | tabletop
    description:    str
    risk_level:     str           # low | medium | high
    # Minimum weighted signals needed before we consider a change safe
    min_signals_for_change: int
    # Known failure symptoms in order of frequency
    symptoms:       List[SymptomEntry] = field(default_factory=list)
    # Tags for grouping / filtering
    tags:           List[str] = field(default_factory=list)
    notes:          str = ""


@dataclass
class LearningSignal:
    """
    A single quality-weighted feedback event from production.

    Raw session signals (from db/signals.py) are converted to
    LearningSignal before aggregation so weight computation is
    centralised here rather than scattered across callers.
    """
    signal_id:       str
    pattern_id:      str
    outcome:         str          # nailed_it | close | failed | unknown
    skill_tier:      str          # pro | intermediate | beginner | unknown
    confidence_score: float       # NGW predicted confidence 0–1
    source:          str          # live | expert_review | internal | seeded
    weight:          float = 0.0  # computed by compute_signal_weight()
    session_id:      Optional[str] = None
    created_at:      Optional[str] = None
    notes:           str = ""


@dataclass
class AggregatedInsight:
    """
    Rolled-up signal view for a pattern over a time window.

    Produced by aggregate_signals_for_pattern() and consumed by the CI gate.
    """
    pattern_id:           str
    window_days:          int
    raw_signal_count:     int
    weighted_signal_count: float     # sum of weights
    weighted_success_rate: float     # weight-normalised success rate 0–1
    weighted_fail_rate:   float      # weight-normalised fail rate 0–1
    dominant_failure_mode: Optional[str]   # most common failure_mode
    signal_quality_label: str        # low | sufficient | strong
    meets_low_threshold:  bool       # ≥ MIN_SIGNALS["low"]
    meets_medium_threshold: bool     # ≥ MIN_SIGNALS["medium"]
    meets_high_threshold: bool       # ≥ MIN_SIGNALS["high"]
    computed_at:          str = ""


# ── Signal weight computation ─────────────────────────────────────────────────

def compute_signal_weight(
    skill_tier:       str,
    confidence_score: float,
    source:           str,
    outcome:          str = "unknown",
) -> float:
    """
    Compute the quality weight for a single production signal.

    Weight = tier_multiplier × source_multiplier × outcome_multiplier
             × confidence_boost (if confidence > threshold)

    The weight is capped at 5.0 to prevent any single expert-review
    correction from drowning out a large pool of live signals.

    Examples
    --------
    >>> compute_signal_weight("pro",         0.9, "expert_review", "nailed_it")
    9.0  → capped at 5.0
    >>> compute_signal_weight("beginner",    0.3, "live",          "unknown")
    0.105
    >>> compute_signal_weight("intermediate",0.8, "live",          "failed")
    1.8   (confidence boost applied)
    """
    tier_mult    = TIER_MULTIPLIERS.get(skill_tier.lower(), TIER_MULTIPLIERS["unknown"])
    source_mult  = SOURCE_MULTIPLIERS.get(source.lower(),   SOURCE_MULTIPLIERS["unknown"])
    outcome_mult = OUTCOME_MULTIPLIERS.get(outcome.lower(), OUTCOME_MULTIPLIERS["unknown"])

    weight = tier_mult * source_mult * outcome_mult

    # High-confidence signals get a boost — the model was very sure and we can
    # learn more from the outcome (right or wrong).
    if confidence_score >= CONFIDENCE_BOOST_THRESHOLD:
        weight *= CONFIDENCE_BOOST_FACTOR

    # Cap to prevent outlier expert reviews from dominating
    return min(weight, 5.0)


def enrich_signal_weights(signals: List[LearningSignal]) -> List[LearningSignal]:
    """Compute and attach weight to each signal in-place. Returns the list."""
    for s in signals:
        s.weight = compute_signal_weight(
            s.skill_tier, s.confidence_score, s.source, s.outcome
        )
    return signals


# ── Aggregation ───────────────────────────────────────────────────────────────

# Minimum weighted signal thresholds by risk level
MIN_SIGNALS: Dict[str, int] = {
    "low":    25,
    "medium": 75,
    "high":   200,
}


def aggregate_signals_for_pattern(
    pattern_id:   str,
    signals:      List[LearningSignal],
    window_days:  int = 30,
) -> AggregatedInsight:
    """
    Roll up a list of LearningSignals into an AggregatedInsight.

    Signals must already have `.weight` set (call enrich_signal_weights first).
    """
    raw_count       = len(signals)
    total_weight    = sum(s.weight for s in signals)
    success_weight  = sum(s.weight for s in signals if s.outcome in ("nailed_it", "close"))
    fail_weight     = sum(s.weight for s in signals if s.outcome == "failed")

    if total_weight > 0:
        weighted_success_rate = success_weight / total_weight
        weighted_fail_rate    = fail_weight    / total_weight
    else:
        weighted_success_rate = 0.0
        weighted_fail_rate    = 0.0

    # Dominant failure mode — most common non-null outcome among failed signals
    # We proxy this with a note field scan; real callers should pass enriched signals
    dominant_failure_mode: Optional[str] = None
    if fail_weight > 0:
        from collections import Counter
        mode_counts: Counter = Counter()
        for s in signals:
            if s.outcome == "failed" and s.notes:
                mode_counts[s.notes] += s.weight
        if mode_counts:
            dominant_failure_mode = mode_counts.most_common(1)[0][0]

    # Signal quality label
    if total_weight >= MIN_SIGNALS["medium"]:
        quality_label = "strong"
    elif total_weight >= MIN_SIGNALS["low"]:
        quality_label = "sufficient"
    else:
        quality_label = "low"

    return AggregatedInsight(
        pattern_id             = pattern_id,
        window_days            = window_days,
        raw_signal_count       = raw_count,
        weighted_signal_count  = round(total_weight, 2),
        weighted_success_rate  = round(weighted_success_rate, 4),
        weighted_fail_rate     = round(weighted_fail_rate, 4),
        dominant_failure_mode  = dominant_failure_mode,
        signal_quality_label   = quality_label,
        meets_low_threshold    = total_weight >= MIN_SIGNALS["low"],
        meets_medium_threshold = total_weight >= MIN_SIGNALS["medium"],
        meets_high_threshold   = total_weight >= MIN_SIGNALS["high"],
        computed_at            = datetime.now(timezone.utc).isoformat(),
    )


# ── Pattern knowledge base ────────────────────────────────────────────────────
# 28 patterns NGW recognises. Risk levels reflect both complexity and user
# impact: high-risk patterns are either very common (loop, rembrandt) or very
# easy to mis-classify (clamshell vs. butterfly, split vs. rim-only).

PATTERN_KNOWLEDGE_BASE: Dict[str, PatternEntry] = {

    # ── High-frequency portrait patterns ─────────────────────────────────────

    "loop": PatternEntry(
        pattern_id   = "loop",
        display_name = "Loop",
        family       = "portrait",
        description  = (
            "Key light ~30–45° off-axis, slightly above eye level. "
            "Creates a small loop shadow under the nose on the shadow side. "
            "The most common studio portrait pattern."
        ),
        risk_level              = "high",
        min_signals_for_change  = 200,
        symptoms = [
            SymptomEntry(
                symptom_id   = "loop_misclassified_rembrandt",
                description  = "Loop classified as Rembrandt — nose shadow wrongly reaches lip",
                failure_mode = "confidence_mismatch",
                severity     = "medium",
                frequency    = "occasional",
                fix_steps = [
                    FixStep(1, "Tighten shadow-loop detection threshold in reference_read",
                            "reference_read", "loop_shadow_threshold", 0.04),
                ],
            ),
            SymptomEntry(
                symptom_id   = "loop_misclassified_butterfly",
                description  = "Loop classified as Butterfly — key too high or too frontal",
                failure_mode = "confidence_mismatch",
                severity     = "low",
                frequency    = "rare",
            ),
        ],
        tags = ["headshot", "commercial", "high-volume"],
    ),

    "rembrandt": PatternEntry(
        pattern_id   = "rembrandt",
        display_name = "Rembrandt",
        family       = "portrait",
        description  = (
            "Key light ~45° off-axis, 45° above. Characteristic triangle of "
            "light on the shadow-side cheek. Strong chiaroscuro."
        ),
        risk_level             = "high",
        min_signals_for_change = 200,
        symptoms = [
            SymptomEntry(
                symptom_id   = "rembrandt_triangle_missed",
                description  = "Triangle of light not detected — classified as split or loop",
                failure_mode = "confidence_mismatch",
                severity     = "high",
                frequency    = "common",
                fix_steps = [
                    FixStep(1, "Lower triangle-detection brightness threshold",
                            "cue_extraction", "triangle_min_luminance", 0.06),
                    FixStep(2, "Verify catchlight is above eye line (≥10° elevation)",
                            "reference_read", "catchlight_elevation_gate", 0.02),
                ],
            ),
        ],
        tags = ["dramatic", "editorial", "high-contrast"],
    ),

    "split": PatternEntry(
        pattern_id   = "split",
        display_name = "Split",
        family       = "portrait",
        description  = (
            "Key light 90° off-axis, directly to the side of the subject. "
            "Half the face is in near-complete shadow."
        ),
        risk_level             = "medium",
        min_signals_for_change = 75,
        symptoms = [
            SymptomEntry(
                symptom_id   = "split_vs_rim_confusion",
                description  = "Split confused with rim-only — fill ratio too high",
                failure_mode = "confidence_mismatch",
                severity     = "medium",
                frequency    = "occasional",
            ),
        ],
        tags = ["dramatic", "editorial"],
    ),

    "butterfly": PatternEntry(
        pattern_id   = "butterfly",
        display_name = "Butterfly / Paramount",
        family       = "portrait",
        description  = (
            "Key light directly in front, high elevation. Creates a symmetrical "
            "butterfly-shaped shadow under the nose. Classic Hollywood glamour."
        ),
        risk_level             = "medium",
        min_signals_for_change = 75,
        symptoms = [
            SymptomEntry(
                symptom_id   = "butterfly_confused_loop",
                description  = "Butterfly classified as loop when key is slightly off-center",
                failure_mode = "confidence_mismatch",
                severity     = "low",
                frequency    = "occasional",
            ),
        ],
        tags = ["glamour", "fashion", "headshot"],
    ),

    "clamshell": PatternEntry(
        pattern_id   = "clamshell",
        display_name = "Clamshell",
        family       = "portrait",
        description  = (
            "Key light above, fill reflector or light below camera. "
            "Eliminates under-chin shadows. Very flattering for beauty and headshots."
        ),
        risk_level             = "high",
        min_signals_for_change = 200,
        symptoms = [
            SymptomEntry(
                symptom_id   = "clamshell_fill_undetected",
                description  = "Under-chin fill not detected; classified as butterfly",
                failure_mode = "confidence_mismatch",
                severity     = "high",
                frequency    = "common",
                fix_steps = [
                    FixStep(1, "Enable chin-region luminance probe for fill detection",
                            "cue_extraction", "chin_fill_probe", 0.08),
                ],
            ),
            SymptomEntry(
                symptom_id   = "clamshell_catchlight_below",
                description  = "Second catchlight below pupil not detected",
                failure_mode = "confidence_mismatch",
                severity     = "medium",
                frequency    = "occasional",
            ),
        ],
        tags = ["beauty", "headshot", "high-volume"],
    ),

    "broad": PatternEntry(
        pattern_id   = "broad",
        display_name = "Broad Lighting",
        family       = "portrait",
        description  = (
            "Key light illuminates the side of the face turned toward the camera. "
            "Widening effect — less flattering for wide faces."
        ),
        risk_level             = "low",
        min_signals_for_change = 25,
        symptoms = [
            SymptomEntry(
                symptom_id   = "broad_short_orientation_flip",
                description  = "Broad/Short orientation flipped due to subject pose ambiguity",
                failure_mode = "confidence_mismatch",
                severity     = "medium",
                frequency    = "occasional",
            ),
        ],
        tags = ["orientation-sensitive"],
    ),

    "short": PatternEntry(
        pattern_id   = "short",
        display_name = "Short Lighting",
        family       = "portrait",
        description  = (
            "Key light illuminates the side of the face turned away from the camera. "
            "Slimming effect — generally more flattering."
        ),
        risk_level             = "low",
        min_signals_for_change = 25,
        symptoms = [
            SymptomEntry(
                symptom_id   = "short_broad_orientation_flip",
                description  = "Short/Broad orientation flipped",
                failure_mode = "confidence_mismatch",
                severity     = "medium",
                frequency    = "occasional",
            ),
        ],
        tags = ["orientation-sensitive"],
    ),

    # ── Rim and separation patterns ───────────────────────────────────────────

    "rim": PatternEntry(
        pattern_id   = "rim",
        display_name = "Rim / Edge Light",
        family       = "portrait",
        description  = (
            "Single backlight or hairlight with no significant frontal fill. "
            "Subject silhouetted with bright rim edge."
        ),
        risk_level             = "medium",
        min_signals_for_change = 75,
        symptoms = [
            SymptomEntry(
                symptom_id   = "rim_vs_split",
                description  = "Rim classified as split when catchlight visible frontally",
                failure_mode = "confidence_mismatch",
                severity     = "medium",
                frequency    = "occasional",
            ),
        ],
        tags = ["silhouette", "dramatic", "separation"],
    ),

    "hair_rim": PatternEntry(
        pattern_id   = "hair_rim",
        display_name = "Hair / Kicker Light",
        family       = "portrait",
        description  = "Dedicated hairlight or kicker added to a primary pattern.",
        risk_level   = "low",
        min_signals_for_change = 25,
        tags         = ["modifier", "separation"],
    ),

    # ── Available light and mixed source ─────────────────────────────────────

    "available_light": PatternEntry(
        pattern_id   = "available_light",
        display_name = "Available / Ambient Light",
        family       = "documentary",
        description  = (
            "No artificial lighting. May be window light, outdoor, or mixed ambient. "
            "Pattern depends entirely on subject position relative to source."
        ),
        risk_level             = "medium",
        min_signals_for_change = 75,
        symptoms = [
            SymptomEntry(
                symptom_id   = "ambient_classified_as_strobe",
                description  = "Ambient session incorrectly classified as strobe setup",
                failure_mode = "confidence_mismatch",
                severity     = "high",
                frequency    = "occasional",
                fix_steps = [
                    FixStep(1, "Improve catchlight shape classifier to detect window vs strobe",
                            "cue_extraction", "catchlight_shape_classifier", 0.05),
                ],
            ),
        ],
        tags = ["natural", "window", "documentary"],
    ),

    "window_light": PatternEntry(
        pattern_id   = "window_light",
        display_name = "Window Light",
        family       = "documentary",
        description  = (
            "Soft, diffuse natural window source. Classic soft-box equivalent. "
            "Direction depends on window-subject geometry."
        ),
        risk_level             = "medium",
        min_signals_for_change = 75,
        tags                   = ["natural", "soft"],
    ),

    "mixed_ambient_strobe": PatternEntry(
        pattern_id   = "mixed_ambient_strobe",
        display_name = "Mixed Ambient + Strobe",
        family       = "editorial",
        description  = "Hybrid setup combining ambient with one or more strobe heads.",
        risk_level   = "high",
        min_signals_for_change = 200,
        symptoms = [
            SymptomEntry(
                symptom_id   = "mixed_source_wb_conflict",
                description  = "Conflicting CCT values between ambient and strobe cause WB confusion",
                failure_mode = "confidence_mismatch",
                severity     = "high",
                frequency    = "common",
            ),
        ],
        tags = ["editorial", "mixed-source", "complex"],
    ),

    # ── High-key and low-key ──────────────────────────────────────────────────

    "high_key": PatternEntry(
        pattern_id   = "high_key",
        display_name = "High-Key",
        family       = "commercial",
        description  = (
            "Bright, even, low-contrast lighting. White or light-grey background "
            "exposed to match or slightly exceed the subject."
        ),
        risk_level             = "low",
        min_signals_for_change = 25,
        symptoms = [
            SymptomEntry(
                symptom_id   = "high_key_blown_bg",
                description  = "Background overexposed to clipping — loses texture detail",
                failure_mode = "conversion_gap",
                severity     = "medium",
                frequency    = "occasional",
            ),
        ],
        tags = ["commercial", "clean", "product"],
    ),

    "low_key": PatternEntry(
        pattern_id   = "low_key",
        display_name = "Low-Key",
        family       = "editorial",
        description  = (
            "Dark, high-contrast lighting. Background at least 2 stops below subject. "
            "Dramatic, moody feel."
        ),
        risk_level             = "low",
        min_signals_for_change = 25,
        tags                   = ["dramatic", "editorial", "moody"],
    ),

    # ── Speciality setups ─────────────────────────────────────────────────────

    "beauty_dish": PatternEntry(
        pattern_id   = "beauty_dish",
        display_name = "Beauty Dish",
        family       = "commercial",
        description  = (
            "Semi-specular circular modifier, typically 22\"–30\". "
            "Characteristic doughnut-shaped catchlight."
        ),
        risk_level             = "medium",
        min_signals_for_change = 75,
        symptoms = [
            SymptomEntry(
                symptom_id   = "beauty_dish_catchlight_missed",
                description  = "Ring-shaped catchlight not detected; classified as umbrella or softbox",
                failure_mode = "confidence_mismatch",
                severity     = "medium",
                frequency    = "occasional",
                fix_steps = [
                    FixStep(1, "Add ring/annular catchlight shape detector",
                            "cue_extraction", "catchlight_ring_detector", 0.07),
                ],
            ),
        ],
        tags = ["modifier-specific", "beauty", "fashion"],
    ),

    "ring_flash": PatternEntry(
        pattern_id   = "ring_flash",
        display_name = "Ring Flash / Ring Light",
        family       = "editorial",
        description  = (
            "Circular flash tube around the lens. Zero shadow, flat frontal light "
            "with a thin outline shadow directly behind the subject."
        ),
        risk_level             = "medium",
        min_signals_for_change = 75,
        symptoms = [
            SymptomEntry(
                symptom_id   = "ring_flash_vs_frontal_softbox",
                description  = "Ring flash confused with frontal softbox — shadow behind not detected",
                failure_mode = "confidence_mismatch",
                severity     = "medium",
                frequency    = "occasional",
            ),
        ],
        tags = ["fashion", "editorial", "flat-light"],
    ),

    "octabox_large": PatternEntry(
        pattern_id   = "octabox_large",
        display_name = "Large Octabox",
        family       = "portrait",
        description  = "Octagonal softbox ≥60\". Very soft, wrapping light quality.",
        risk_level   = "low",
        min_signals_for_change = 25,
        tags         = ["soft", "wrapping", "flattering"],
    ),

    "parabolic": PatternEntry(
        pattern_id   = "parabolic",
        display_name = "Parabolic Reflector",
        family       = "portrait",
        description  = (
            "Deep parabolic dish. Hard-focused centre light with rapid fall-off. "
            "Used for both very hard and very soft results depending on focus."
        ),
        risk_level             = "medium",
        min_signals_for_change = 75,
        tags                   = ["modifier-specific", "fashion"],
    ),

    # ── Multi-light setups ────────────────────────────────────────────────────

    "three_point": PatternEntry(
        pattern_id   = "three_point",
        display_name = "Three-Point Lighting",
        family       = "commercial",
        description  = "Key + fill + backlight/hairlight. The broadcast/corporate standard.",
        risk_level             = "medium",
        min_signals_for_change = 75,
        symptoms = [
            SymptomEntry(
                symptom_id   = "three_point_backlight_missed",
                description  = "Backlight not detected; classified as two-light setup",
                failure_mode = "confidence_mismatch",
                severity     = "medium",
                frequency    = "common",
            ),
        ],
        tags = ["corporate", "broadcast", "multi-light"],
    ),

    "background_lit": PatternEntry(
        pattern_id   = "background_lit",
        display_name = "Background-Lit Setup",
        family       = "commercial",
        description  = "Dedicated background light(s) independent of subject lighting.",
        risk_level   = "low",
        min_signals_for_change = 25,
        tags         = ["background-separation", "commercial"],
    ),

    # ── Environmental setups ──────────────────────────────────────────────────

    "outdoor_sun_key": PatternEntry(
        pattern_id   = "outdoor_sun_key",
        display_name = "Outdoor / Sun as Key",
        family       = "documentary",
        description  = "Hard directional sunlight used as primary key source.",
        risk_level   = "low",
        min_signals_for_change = 25,
        tags         = ["outdoor", "natural", "hard-light"],
    ),

    "outdoor_fill_flash": PatternEntry(
        pattern_id   = "outdoor_fill_flash",
        display_name = "Outdoor Fill Flash",
        family       = "documentary",
        description  = "Sunlight + on-axis strobe fill. Balances ambient exposure.",
        risk_level             = "medium",
        min_signals_for_change = 75,
        symptoms = [
            SymptomEntry(
                symptom_id   = "fill_flash_strobe_power_misread",
                description  = "Fill flash power not detected — classified as pure ambient",
                failure_mode = "confidence_mismatch",
                severity     = "medium",
                frequency    = "occasional",
            ),
        ],
        tags = ["outdoor", "mixed-source"],
    ),

    "golden_hour": PatternEntry(
        pattern_id   = "golden_hour",
        display_name = "Golden Hour",
        family       = "documentary",
        description  = "Warm low-angle sun at sunrise/sunset. CCT 2200–3500K.",
        risk_level   = "low",
        min_signals_for_change = 25,
        tags         = ["outdoor", "warm", "natural"],
    ),

    # ── Specialty / product ───────────────────────────────────────────────────

    "product_light_tent": PatternEntry(
        pattern_id   = "product_light_tent",
        display_name = "Product / Light Tent",
        family       = "tabletop",
        description  = "Enclosed diffusion tent for even product illumination.",
        risk_level   = "low",
        min_signals_for_change = 25,
        tags         = ["product", "ecommerce", "tabletop"],
    ),

    "overhead_flat_lay": PatternEntry(
        pattern_id   = "overhead_flat_lay",
        display_name = "Overhead / Flat Lay",
        family       = "tabletop",
        description  = "Camera directly above subject, typically lit from sides.",
        risk_level   = "low",
        min_signals_for_change = 25,
        tags         = ["product", "food", "overhead"],
    ),

    # ── Unknown / edge cases ──────────────────────────────────────────────────

    "unknown": PatternEntry(
        pattern_id   = "unknown",
        display_name = "Unknown",
        family       = "unknown",
        description  = "Pattern could not be determined with sufficient confidence.",
        risk_level   = "high",
        min_signals_for_change = 200,
        tags         = ["fallback"],
    ),

    "mixed_complex": PatternEntry(
        pattern_id   = "mixed_complex",
        display_name = "Complex / Multi-Pattern",
        family       = "editorial",
        description  = "Scene contains multiple competing patterns; single-pattern label unreliable.",
        risk_level   = "high",
        min_signals_for_change = 200,
        tags         = ["complex", "multi-light"],
    ),
}


# ── Public accessors ──────────────────────────────────────────────────────────

def get_pattern_entry(pattern_id: str) -> Optional[PatternEntry]:
    """Return the knowledge entry for a pattern, or None if not found."""
    entry = PATTERN_KNOWLEDGE_BASE.get(pattern_id)
    if entry is None:
        # Try normalised lowercase
        entry = PATTERN_KNOWLEDGE_BASE.get(pattern_id.lower())
    return entry


def list_high_risk_patterns() -> List[str]:
    """Return pattern IDs with risk_level == 'high'."""
    return [pid for pid, e in PATTERN_KNOWLEDGE_BASE.items() if e.risk_level == "high"]


def list_patterns_by_risk(risk_level: str) -> List[str]:
    """Return pattern IDs for a given risk level (low | medium | high)."""
    return [pid for pid, e in PATTERN_KNOWLEDGE_BASE.items() if e.risk_level == risk_level]


def get_min_signals(pattern_id: str) -> int:
    """
    Return the minimum weighted signals required before approving a change
    for this pattern. Falls back to the HIGH threshold for unknown patterns.
    """
    entry = get_pattern_entry(pattern_id)
    if entry:
        return entry.min_signals_for_change
    return MIN_SIGNALS["high"]
