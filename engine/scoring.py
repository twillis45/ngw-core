from __future__ import annotations

import math
from typing import Any, Dict, List, Tuple

from models.output_model import Confidence, CriterionComponent, FeatureBonus, ScoreBreakdown
from engine.patterns import classify_lighting_pattern
from engine.master_mode import compute_master_mode_bonus

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

CONTEXT_BONUS_WEIGHTS: Dict[str, float] = {
    "mood_match": 8.0,
    "modifier_match": 6.0,
    "pattern_match": 5.0,
    "skin_tone_match": 3.0,
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

    if mod > 10.0:
        notes.append(f"Modifier {mod} capped at 10.0.")
        return 10.0, "provided_capped", notes, True

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


def _compute_context_bonuses(
    system: Dict[str, Any],
    input_ctx: Dict[str, Any],
) -> Tuple[float, List[FeatureBonus], List[str]]:
    """Compute additive bonuses when image-derived context matches a system.

    Returns (total_bonus, bonus_list, notes).
    Called only when input_ctx has ``detected_*`` keys from LightingInference.
    """
    bonuses: List[FeatureBonus] = []
    notes: List[str] = []
    total = 0.0
    taxonomy = dict(system.get("taxonomy_refs") or {})

    # 1. Mood match
    detected_mood = input_ctx.get("detected_mood")
    if detected_mood:
        conf = float(input_ctx.get("detected_mood_confidence", 0.5))
        system_mood = taxonomy.get("mood", "")
        if detected_mood == system_mood:
            pts = CONTEXT_BONUS_WEIGHTS["mood_match"] * conf
            total += pts
            bonuses.append(FeatureBonus(
                feature="ctx_mood_match",
                value=detected_mood,
                points=round(pts, 3),
                reason=f"Detected mood '{detected_mood}' matches system (conf {conf:.2f}).",
            ))
            notes.append(f"Context mood match: +{pts:.1f}")

    # 2. Modifier match
    detected_mod = input_ctx.get("detected_modifier")
    if detected_mod:
        conf = float(input_ctx.get("detected_modifier_confidence", 0.5))
        system_mod = taxonomy.get("modifier_family", "")
        if detected_mod == system_mod:
            pts = CONTEXT_BONUS_WEIGHTS["modifier_match"] * conf
            total += pts
            bonuses.append(FeatureBonus(
                feature="ctx_modifier_match",
                value=detected_mod,
                points=round(pts, 3),
                reason=f"Detected modifier '{detected_mod}' matches system (conf {conf:.2f}).",
            ))
            notes.append(f"Context modifier match: +{pts:.1f}")

    # 3. Pattern match — classify what the system *would* produce, compare
    detected_pattern = input_ctx.get("detected_pattern")
    if detected_pattern:
        conf = float(input_ctx.get("detected_pattern_confidence", 0.5))
        system_pattern = classify_lighting_pattern(
            mood=taxonomy.get("mood", ""),
            modifier_family=taxonomy.get("modifier_family", ""),
            gear_profile=taxonomy.get("gear_profile", ""),
            key_position_text=input_ctx.get("detected_key_position", ""),
            fill_method_text=input_ctx.get("detected_fill_method", ""),
        )
        if detected_pattern == system_pattern:
            pts = CONTEXT_BONUS_WEIGHTS["pattern_match"] * conf
            total += pts
            bonuses.append(FeatureBonus(
                feature="ctx_pattern_match",
                value=detected_pattern,
                points=round(pts, 3),
                reason=f"Detected pattern '{detected_pattern}' matches system's '{system_pattern}' (conf {conf:.2f}).",
            ))
            notes.append(f"Context pattern match: +{pts:.1f}")

    # 4. Skin tone match
    detected_skin = input_ctx.get("detected_skin_tone")
    if detected_skin:
        conf = float(input_ctx.get("detected_skin_tone_confidence", 0.5))
        system_skin = taxonomy.get("skin_tone", "")
        if detected_skin == system_skin:
            pts = CONTEXT_BONUS_WEIGHTS["skin_tone_match"] * conf
            total += pts
            bonuses.append(FeatureBonus(
                feature="ctx_skin_tone_match",
                value=detected_skin,
                points=round(pts, 3),
                reason=f"Detected skin tone '{detected_skin}' matches system (conf {conf:.2f}).",
            ))
            notes.append(f"Context skin tone match: +{pts:.1f}")

    return round(total, 3), bonuses, notes


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

    # Context-aware bonuses from image analysis
    context_bonus = 0.0
    if input_ctx:
        context_bonus, ctx_bonuses, ctx_notes = _compute_context_bonuses(system, input_ctx)
        feature_bonuses.extend(ctx_bonuses)
        notes.extend(ctx_notes)

    modifier, modifier_source, modifier_notes, modifier_provided = _resolve_modifier(system)
    notes.extend(modifier_notes)

    # Master mode bonus (additive, 0.0 when no mode selected)
    mm_bonus = compute_master_mode_bonus(system, input_ctx.get("master_mode") if input_ctx else None)
    if mm_bonus > 0:
        feature_bonuses.append(
            FeatureBonus(
                feature="master_mode",
                value=True,
                points=mm_bonus,
                reason=f"Master mode affinity bonus ({input_ctx.get('master_mode')}).",
            )
        )

    base_score = subtotal + bonus_total + context_bonus + mm_bonus

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
