from __future__ import annotations

import math
from typing import Any, Dict, List, Tuple

from models.output_model import Confidence, CriterionComponent, FeatureBonus, ScoreBreakdown

FALLBACK_MODIFIER: float = 1.0

BASE_WEIGHTS: Dict[str, float] = {
    "brightness": 0.20,
    "color_accuracy": 0.20,
    "portability": 0.20,
    "battery_life": 0.20,
    "energy_efficiency": 0.20,
}

NORMALISATION_CAPS: Dict[str, float] = {
    "brightness": 10000.0,
    "color_accuracy": 100.0,
    "portability": 100.0,
    "battery_life": 100.0,
    "energy_efficiency": 200.0,
}

BONUS_RULES: Dict[str, float] = {
    "dimmable": 5.0,
    "smart_ready": 5.0,
    "battery": 4.0,
    "waterproof": 3.0,
}


def _safe_float(v: Any) -> float:
    try:
        f = float(v)
    except Exception:
        return 0.0
    if math.isnan(f) or math.isinf(f):
        return 0.0
    return f


def _normalise(raw: float, cap: float) -> float:
    if cap <= 0:
        return 0.0
    if raw <= 0:
        return 0.0
    return max(0.0, min(100.0, (raw / cap) * 100.0))


def _was_clamped(raw: float, cap: float) -> str:
    if cap <= 0:
        return ""
    if raw < 0:
        return "clamped from negative"
    if raw > cap:
        return f"capped at {cap}"
    return ""


def _resolve_modifier(system: Dict[str, Any]) -> Tuple[float, str, List[str], bool]:
    notes: List[str] = []
    raw = system.get("modifier", None)

    if raw is None:
        notes.append("Missing modifier; using fallback.")
        return FALLBACK_MODIFIER, "fallback", notes, False

    try:
        mod = float(raw)
    except Exception:
        notes.append("Invalid modifier; using fallback.")
        return FALLBACK_MODIFIER, "fallback_invalid", notes, False

    if math.isnan(mod) or math.isinf(mod):
        notes.append("Invalid modifier; using fallback.")
        return FALLBACK_MODIFIER, "fallback_invalid", notes, False

    if mod < 0:
        notes.append("Negative modifier; using fallback.")
        return FALLBACK_MODIFIER, "fallback_invalid_negative", notes, False

    if mod == 0:
        notes.append("Modifier 0 applied explicitly.")
        return 0.0, "provided", notes, True

    return mod, "provided", notes, True


def _build_confidence(
    supplied_criteria_count: int,
    earned_bonus_count: int,
    modifier_provided: bool,
    notes: List[str],
) -> Confidence:
    criteria_total = max(1, len(NORMALISATION_CAPS))
    feature_total = max(1, len(BONUS_RULES))

    criteria_coverage = round((supplied_criteria_count / criteria_total) * 100.0, 3)
    criteria_quality = criteria_coverage
    feature_coverage = round((earned_bonus_count / feature_total) * 100.0, 3)
    modifier_signal = 100.0 if modifier_provided else 0.0

    score = round(
        min(
            100.0,
            (criteria_coverage * 0.65) + (feature_coverage * 0.20) + (modifier_signal * 0.15),
        ),
        3,
    )

    reasons = [
        f"Criteria coverage: {criteria_coverage:.1f}%",
        f"Feature coverage: {feature_coverage:.1f}%",
        f"Modifier provided signal: {modifier_signal:.1f}%",
        f"composite confidence score: {score:.1f}",
        "Confidence included and used for explanation.",
    ]
    reasons.extend(notes[:2])

    return Confidence(
        score=score,
        method="coverage+signals",
        criteria_coverage=criteria_coverage,
        criteria_quality=criteria_quality,
        feature_coverage=feature_coverage,
        feature_match=feature_coverage,
        modifier_provided=modifier_signal,
        reasons=reasons[:8],
        details={
            "criteria_supplied": supplied_criteria_count,
            "bonuses_earned": earned_bonus_count,
        },
    )


def score_system(system: Dict[str, Any], *, input_ctx: Dict[str, Any] | None = None) -> ScoreBreakdown:
    system_id = str(system.get("id") or system.get("system_id") or system.get("name") or "unknown")
    system_name = str(system.get("name") or system_id)

    criteria = dict(system.get("criteria") or {})
    components: List[CriterionComponent] = []
    subtotal = 0.0
    notes: List[str] = []
    supplied_criteria_count = 0

    for criterion, weight in BASE_WEIGHTS.items():
        raw = _safe_float(criteria.get(criterion, 0.0))
        cap = NORMALISATION_CAPS[criterion]
        normalised = _normalise(raw, cap)
        weighted = normalised * weight
        subtotal += weighted

        reason = _was_clamped(raw, cap)
        if reason:
            notes.append(f"{criterion}: {reason}")
        if criterion in criteria:
            supplied_criteria_count += 1

        components.append(
            CriterionComponent(
                criterion=criterion,
                raw=raw,
                normalised=round(normalised, 3),
                weight=weight,
                weighted=round(weighted, 3),
                reason=reason,
            )
        )

    features = dict(system.get("features") or {})
    feature_bonuses: List[FeatureBonus] = []
    bonus_total = 0.0

    for feature, points in BONUS_RULES.items():
        enabled = bool(features.get(feature, False))
        if enabled:
            bonus_total += points
            feature_bonuses.append(
                FeatureBonus(
                    feature=feature,
                    value=True,
                    points=points,
                    reason=f"{feature} bonus applied.",
                )
            )

    modifier, modifier_source, modifier_notes, modifier_provided = _resolve_modifier(system)
    notes.extend(modifier_notes)

    base_score = subtotal + bonus_total

    final_score = base_score * modifier

    confidence = _build_confidence(
        supplied_criteria_count=supplied_criteria_count,
        earned_bonus_count=len(feature_bonuses),
        modifier_provided=modifier_provided,
        notes=notes,
    )

    return ScoreBreakdown(
        system_id=system_id,
        system_name=system_name,
        subtotal=round(subtotal, 3),
        bonus_total=round(bonus_total, 3),
        base_score=round(base_score, 3),
        modifier=round(modifier, 3),
        modifier_source=modifier_source,
        final_score=round(final_score, 3),
        components=components,
        feature_bonuses=feature_bonuses,
        notes=notes,
        confidence=confidence,
    )
