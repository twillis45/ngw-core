from __future__ import annotations

from typing import Any, Dict, List, Optional

from models.output_model import CriterionComponent, FeatureBonus, ScoreBreakdown

FALLBACK_MODIFIER: float = 0.85


def _safe_float(v: Any) -> float:
    try:
        return float(v)
    except Exception:
        return 0.0


def score_system(
    system: Dict[str, Any],
    *,
    input_ctx: Optional[Dict[str, Any]] = None,
) -> ScoreBreakdown:
    """
    Deterministic scoring:
      - base_score = sum(numeric criteria, normalised) + small feature bonuses
      - modifier = system.modifier (0..1], fallback if missing/invalid)
      - final_score = base_score * modifier
    """
    system_id = str(system.get("id") or system.get("system_id") or system.get("name") or "unknown")

    criteria = system.get("criteria") or {}
    components: List[CriterionComponent] = []

    base = 0.0
    for k, v in sorted(criteria.items(), key=lambda kv: str(kv[0])):
        raw = _safe_float(v)
        # normalised: forgiving 0-100-ish scale
        normalised = max(0.0, min(100.0, raw / 100.0 if raw > 100 else raw))
        weight = 1.0
        weighted = normalised * weight
        base += weighted
        components.append(
            CriterionComponent(
                criterion=str(k),
                raw=raw,
                normalised=normalised,
                weight=weight,
                weighted=weighted,
                reason="",
            )
        )

    bonuses: List[FeatureBonus] = []
    features = system.get("features") or {}
    if features.get("dimmable"):
        bonuses.append(FeatureBonus(feature="dimmable", value=True, points=2.0, reason="Fine control."))
    if features.get("battery"):
        bonuses.append(FeatureBonus(feature="battery", value=True, points=1.5, reason="Portable power."))

    bonus_points = sum(b.points for b in bonuses)
    base_score = base + bonus_points

    mod_raw = system.get("modifier", None)
    notes: List[str] = []
    try:
        mod = float(mod_raw)
    except Exception:
        mod = FALLBACK_MODIFIER

    if mod_raw is None:
        notes.append("Missing modifier; using fallback.")
    if mod <= 0:
        notes.append("Modifier <= 0; score silenced.")
        mod = 0.0
    if mod > 1.0:
        notes.append("Modifier capped at 1.0.")
        mod = 1.0

    final_score = base_score * mod

    return ScoreBreakdown(
        system_id=system_id,
        base_score=round(base_score, 3),
        modifier=mod,
        final_score=round(final_score, 3),
        components=components,
        feature_bonuses=bonuses,
        notes=notes,
    )
