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

# ── Context-aware weight profiles ──────────────────────────────────
# Pros in a studio care about light quality and output, not portability.
# Location pros need a balance. Beginners benefit from forgiving gear.
WEIGHT_PROFILES: Dict[str, Dict[str, float]] = {
    "studio_pro": {
        "brightness": 0.30,
        "color_accuracy": 0.35,
        "portability": 0.05,
        "battery_life": 0.05,
        "energy_efficiency": 0.25,
    },
    "location_pro": {
        "brightness": 0.25,
        "color_accuracy": 0.25,
        "portability": 0.20,
        "battery_life": 0.15,
        "energy_efficiency": 0.15,
    },
    "beginner": {
        "brightness": 0.15,
        "color_accuracy": 0.15,
        "portability": 0.25,
        "battery_life": 0.25,
        "energy_efficiency": 0.20,
    },
}

PRO_GEAR_PROFILES = {"strobe_mono", "strobe_pack", "fresnel"}
STUDIO_ENVIRONMENTS = {"studio_large", "studio_small"}
LOCATION_ENVIRONMENTS = {"on_location_indoor", "on_location_outdoor"}


def resolve_weight_profile(input_ctx: Dict[str, Any] | None = None) -> Dict[str, float]:
    """Determine scoring weights from gear + environment context."""
    if not input_ctx:
        return BASE_WEIGHTS

    env = input_ctx.get("environment", "")
    gear_profile = input_ctx.get("gear_profile", "")
    mods = set(input_ctx.get("modifiers_available") or [])
    has_pro_mods = bool(mods & {"beauty_dish", "softbox_octa", "softbox_strip", "grid_spot", "bare_bulb"})

    is_pro_gear = gear_profile in PRO_GEAR_PROFILES or has_pro_mods
    is_studio = env in STUDIO_ENVIRONMENTS
    is_location = env in LOCATION_ENVIRONMENTS

    if is_pro_gear and is_studio:
        return WEIGHT_PROFILES["studio_pro"]
    if is_pro_gear and is_location:
        return WEIGHT_PROFILES["location_pro"]
    if is_pro_gear:
        return WEIGHT_PROFILES["studio_pro"]
    if is_studio:
        return WEIGHT_PROFILES["studio_pro"]
    if is_location:
        return BASE_WEIGHTS

    return BASE_WEIGHTS


# ── Pro-quality scoring signals (Phase C) ──────────────────────────
# Additional criteria that matter to professional photographers.
PRO_BONUS_RULES: Dict[str, float] = {
    "recycle_time_fast": 3.0,       # fast recycle (< 1.5s at full power)
    "color_consistency": 4.0,       # flash-to-flash color stability (±50K)
    "power_range_wide": 3.0,        # 8+ stops of adjustment
    "modifier_ecosystem": 2.0,      # broad modifier compatibility
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
    "environment_match": 4.0,
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
    solver_quality: Dict[str, Any] | None = None,
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
    ]

    # ── Solver quality adjustment ──
    # When the solver chain has run, its consistency, contradiction, and
    # ambiguity signals modulate the confidence score.  This ensures
    # that recommendations built on ambiguous or contradictory analysis
    # report lower confidence to the user.
    solver_penalty = 0.0
    if solver_quality:
        # Low consistency (< 0.4 = substantial disagreement across passes)
        consistency = solver_quality.get("overall_consistency", 1.0)
        if consistency < 0.4:
            penalty = (0.4 - consistency) * 25.0  # max ~10 pts
            solver_penalty += penalty
            reasons.append(f"Low pass consistency ({consistency:.2f}): -{penalty:.1f}")

        # High-severity contradictions
        high_contradictions = solver_quality.get("high_contradiction_count", 0)
        if high_contradictions >= 2:
            penalty = min(15.0, high_contradictions * 5.0)
            solver_penalty += penalty
            reasons.append(f"{high_contradictions} high-severity contradictions: -{penalty:.1f}")
        elif high_contradictions == 1:
            solver_penalty += 3.0
            reasons.append("1 high-severity contradiction: -3.0")

        # Ambiguity class
        ambiguity = solver_quality.get("ambiguity_class", "clean")
        if ambiguity == "genuine_ambiguity":
            solver_penalty += 10.0
            reasons.append("Genuine ambiguity detected: -10.0")
        elif ambiguity == "insufficient_data":
            solver_penalty += 8.0
            reasons.append("Insufficient signal data: -8.0")

        # Needs review flag
        if solver_quality.get("needs_review", False):
            solver_penalty += 5.0
            reasons.append("Solver flagged for review: -5.0")

    score = round(max(0.0, score - solver_penalty), 3)
    reasons.append(f"composite confidence score: {score:.1f}")
    reasons.append("Confidence included and used for explanation.")
    reasons.extend(notes[:2])

    details: Dict[str, Any] = {
        "criteria_supplied": supplied_criteria_count,
        "bonuses_earned": earned_bonus_count,
    }
    if solver_quality:
        details["solver_penalty"] = round(solver_penalty, 3)
        details["solver_ambiguity"] = solver_quality.get("ambiguity_class", "unknown")

    return Confidence(
        score=score,
        method="coverage+signals+solver" if solver_quality else "coverage+signals",
        criteria_coverage=criteria_coverage,
        criteria_quality=criteria_quality,
        feature_coverage=feature_coverage,
        feature_match=feature_coverage,
        modifier_provided=modifier_signal,
        reasons=reasons[:10],
        details=details,
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

    # 2. Modifier match — exact, family-level, and mismatch penalty
    # Soft-modifier family: all softbox/octabox/umbrella variants produce similar
    # gradual shadow falloff and are interchangeable for setup recommendations.
    # Semi-hard (beauty_dish) and hard (grid_spot, snoot, bare_bulb) are distinct families.
    # bare_bulb is hard light — no diffusion, point-source quality — grouped with hard
    # modifiers so it gets correctly penalised when a soft source is detected.
    _SOFT_MODS = {
        "softbox", "softbox_rect", "softbox_large", "softbox_strip",
        "octabox", "octabox_large", "softbox_octa", "softbox_octa_large",
        "umbrella_shoot_through",
    }
    _SEMI_HARD_MODS = {"beauty_dish", "umbrella_reflective"}
    _HARD_MODS = {"grid_spot", "snoot", "barn_doors", "gobo", "optical_snoot", "bare_bulb"}

    detected_mod = input_ctx.get("detected_modifier")
    if detected_mod:
        conf = float(input_ctx.get("detected_modifier_confidence", 0.5))
        system_mod = taxonomy.get("modifier_family", "")

        if detected_mod == system_mod:
            # Exact match — full bonus
            pts = CONTEXT_BONUS_WEIGHTS["modifier_match"] * conf
            total += pts
            bonuses.append(FeatureBonus(
                feature="ctx_modifier_match",
                value=detected_mod,
                points=round(pts, 3),
                reason=f"Detected modifier '{detected_mod}' matches system exactly (conf {conf:.2f}).",
            ))
            notes.append(f"Context modifier match: +{pts:.1f}")
        elif detected_mod in _SOFT_MODS and system_mod in _SOFT_MODS:
            # Same soft family — partial bonus (different softbox shape, same quality)
            pts = CONTEXT_BONUS_WEIGHTS["modifier_match"] * conf * 0.6
            total += pts
            bonuses.append(FeatureBonus(
                feature="ctx_modifier_family_match",
                value=f"{detected_mod}→{system_mod}",
                points=round(pts, 3),
                reason=f"Detected soft modifier '{detected_mod}' — system '{system_mod}' is same soft family.",
            ))
            notes.append(f"Context modifier family match: +{pts:.1f}")
        else:
            # Cross-family mismatch penalty — soft detected but hard/semi-hard system,
            # or hard detected but soft system.  Prevents beauty dish from beating
            # softbox when reference analysis confirmed a soft source.
            _det_soft = detected_mod in _SOFT_MODS
            _sys_hard = system_mod in _SEMI_HARD_MODS | _HARD_MODS
            _det_hard = detected_mod in _SEMI_HARD_MODS | _HARD_MODS
            _sys_soft = system_mod in _SOFT_MODS
            if _det_soft and _sys_hard:
                # Soft source detected → penalise hard-modifier systems
                penalty = -(CONTEXT_BONUS_WEIGHTS["modifier_match"] * min(conf + 0.3, 1.0))
                total += penalty
                bonuses.append(FeatureBonus(
                    feature="ctx_modifier_mismatch",
                    value=f"{detected_mod}≠{system_mod}",
                    points=round(penalty, 3),
                    reason=f"Soft modifier detected ('{detected_mod}') but system uses '{system_mod}' (hard/semi-hard).",
                ))
                notes.append(f"Modifier mismatch penalty: {penalty:.1f}")
            elif _det_hard and _sys_soft:
                # Hard/semi-hard source detected → penalise soft systems (smaller penalty)
                penalty = -(CONTEXT_BONUS_WEIGHTS["modifier_match"] * conf * 0.5)
                total += penalty
                bonuses.append(FeatureBonus(
                    feature="ctx_modifier_mismatch",
                    value=f"{detected_mod}≠{system_mod}",
                    points=round(penalty, 3),
                    reason=f"Hard modifier detected ('{detected_mod}') but system uses soft '{system_mod}'.",
                ))
                notes.append(f"Modifier mismatch penalty: {penalty:.1f}")

    # 2b. Bare-bulb prior — bare strobe is uncommon in everyday portrait/headshot work.
    # Apply a standing penalty unless something in the context explicitly supports it:
    # user has no modifiers in their gear, or the detected modifier is bare_bulb itself.
    if taxonomy.get("modifier_family") == "bare_bulb":
        _user_mods = set(input_ctx.get("modifiers_available") or []) if input_ctx else set()
        _det_mod = input_ctx.get("detected_modifier") if input_ctx else None
        _bare_supported = (
            _det_mod == "bare_bulb"                         # reference confirmed bare strobe
            or (not _user_mods and not _det_mod)            # no modifier context at all — don't punish
        )
        if not _bare_supported:
            penalty = -5.0
            total += penalty
            bonuses.append(FeatureBonus(
                feature="bare_bulb_prior",
                value="bare_bulb",
                points=penalty,
                reason="Bare-bulb systems are uncommon for typical portrait setups; "
                       "no evidence of bare strobe use detected.",
            ))
            notes.append(f"Bare bulb prior penalty: {penalty:.1f}")

    # 2c. Continuous/LED gear prior — strobes and speedlights dominate portrait
    # photography.  Continuous LED is over-represented in system data (equal counts)
    # but significantly less common in practice for controlled stills work.
    # Penalise continuous systems relative to the environment unless the user's
    # own gear is continuous or the context genuinely suits it (live events,
    # outdoor run-and-gun, video-hybrid work).
    _CONTINUOUS_PROFILES = {
        "continuous_2_light", "led_panel", "led_panel_mono", "led_panel_2",
        "led_cob", "led_cob_mono", "led_tube", "continuous_led",
    }
    _system_gear = taxonomy.get("gear_profile", "")
    if _system_gear in _CONTINUOUS_PROFILES:
        _env = input_ctx.get("environment", "") if input_ctx else ""
        _user_gear = input_ctx.get("gear_profile", "") if input_ctx else ""
        _user_mods_raw = set(input_ctx.get("modifiers_available") or []) if input_ctx else set()
        # Continuous is contextually appropriate when:
        #   • the user explicitly selected continuous gear
        #   • the environment is live events or outdoor (run-and-gun/video hybrid)
        _CONTINUOUS_OK_ENVS = {"event", "on_location_outdoor", "live_event"}
        _continuous_ok = (
            _user_gear in _CONTINUOUS_PROFILES
            or _env in _CONTINUOUS_OK_ENVS
        )
        if not _continuous_ok:
            # Studio environments get a larger penalty — flash/strobe is strongly
            # preferred there; other environments get a smaller discouragement.
            _STUDIO_ENVS = {"studio_large", "studio_small", "studio_medium", "home_studio"}
            _cont_penalty = -8.0 if _env in _STUDIO_ENVS else -4.0
            total += _cont_penalty
            bonuses.append(FeatureBonus(
                feature="continuous_gear_prior",
                value=_system_gear,
                points=_cont_penalty,
                reason=f"Continuous/LED gear is less common than strobe/flash for "
                       f"'{_env or 'unspecified'}' environments; no continuous gear context detected.",
            ))
            notes.append(f"Continuous gear prior penalty: {_cont_penalty:.1f}")

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

    # 4. Environment match
    detected_env = input_ctx.get("detected_environment")
    if detected_env:
        system_env = taxonomy.get("environment", "")
        # Normalize: both "studio_large"/"studio_small" match "studio"
        env_match = (
            detected_env == system_env
            or (detected_env == "studio" and system_env.startswith("studio"))
            or (system_env == "studio" and detected_env.startswith("studio"))
            or (detected_env == "window_light" and system_env == "window_light")
        )
        if env_match:
            pts = CONTEXT_BONUS_WEIGHTS["environment_match"]
            total += pts
            bonuses.append(FeatureBonus(
                feature="ctx_environment_match",
                value=detected_env,
                points=round(pts, 3),
                reason=f"Detected environment '{detected_env}' matches system.",
            ))
            notes.append(f"Context environment match: +{pts:.1f}")

    # 5. Skin tone match
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

    # 6. Light count match — CV-detected number of sources drives gear_profile selection.
    # Uses deduped catchlight count from reflection_architecture (not raw count).
    # Gear profile → canonical source count mapping.
    _GEAR_LIGHT_COUNT: Dict[str, int] = {
        "strobe_mono": 1,
        "led_cob_mono": 1,
        "led_panel_mono": 1,
        "basic_2_light": 2,
        "speedlight_2_light": 2,
        "continuous_2_light": 2,
        "led_panel_2": 2,
        "basic_3_light": 3,
        "strobe_3_light": 3,
    }
    detected_lc = input_ctx.get("detected_light_count")
    if detected_lc is not None:
        lc_conf = float(input_ctx.get("detected_light_count_confidence", 0.5))
        system_lc = _GEAR_LIGHT_COUNT.get(taxonomy.get("gear_profile", ""))
        if system_lc is not None:
            if int(detected_lc) == system_lc:
                # Exact count match — meaningful bonus; CV confirmed this many sources
                pts = 7.0 * lc_conf
                total += pts
                bonuses.append(FeatureBonus(
                    feature="ctx_light_count_match",
                    value=str(int(detected_lc)),
                    points=round(pts, 3),
                    reason=f"CV detected {int(detected_lc)} light(s) — matches system's {system_lc}-light setup (conf {lc_conf:.2f}).",
                ))
                notes.append(f"Light count match ({int(detected_lc)}L): +{pts:.1f}")
            elif abs(int(detected_lc) - system_lc) == 1:
                # Off-by-one — small penalty (reflector or fill not always counted)
                penalty = -(3.5 * lc_conf)
                total += penalty
                bonuses.append(FeatureBonus(
                    feature="ctx_light_count_near_miss",
                    value=f"{int(detected_lc)}≠{system_lc}",
                    points=round(penalty, 3),
                    reason=f"CV detected {int(detected_lc)} light(s) but system uses {system_lc}.",
                ))
                notes.append(f"Light count near miss: {penalty:.1f}")
            else:
                # Large mismatch — significant penalty
                penalty = -(6.0 * lc_conf)
                total += penalty
                bonuses.append(FeatureBonus(
                    feature="ctx_light_count_mismatch",
                    value=f"{int(detected_lc)}≠{system_lc}",
                    points=round(penalty, 3),
                    reason=f"CV detected {int(detected_lc)} light(s) but system uses {system_lc} (large mismatch).",
                ))
                notes.append(f"Light count mismatch: {penalty:.1f}")

    return round(total, 3), bonuses, notes


def score_system(
    system: Dict[str, Any],
    *,
    input_ctx: Dict[str, Any] | None = None,
    solver_quality: Dict[str, Any] | None = None,
) -> ScoreBreakdown:
    system_id = str(system.get("id") or system.get("system_id") or system.get("name") or "unknown")
    system_name = str(system.get("name") or system_id)

    criteria = dict(system.get("criteria") or {})
    components: List[CriterionComponent] = []
    subtotal = 0.0
    notes: List[str] = []
    supplied_criteria_count = 0

    # Use context-aware weights when available (Phase B)
    weights = resolve_weight_profile(input_ctx)
    if weights is not BASE_WEIGHTS:
        profile_name = next(
            (k for k, v in WEIGHT_PROFILES.items() if v is weights), "custom"
        )
        notes.append(f"Weight profile: {profile_name}")

    for criterion, weight in weights.items():
        raw = _safe_float(criteria.get(criterion, 0.0))
        cap = NORMALISATION_CAPS.get(criterion, 100.0)
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

    # Pro-quality bonuses (Phase C) — additional signals for pro gear
    for pro_feature, pts in PRO_BONUS_RULES.items():
        if bool(features.get(pro_feature, False)):
            bonus_total += pts
            feature_bonuses.append(
                FeatureBonus(
                    feature=pro_feature,
                    value=True,
                    points=pts,
                    reason=f"{pro_feature} pro bonus applied.",
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
        solver_quality=solver_quality,
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
