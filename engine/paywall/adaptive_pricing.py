"""
Adaptive Pricing Engine — Part 16.2 / 16.5
Maps value state + signals to price point, messaging, and CTA.

PRICE MAP (base prices before guardrails / experiment overrides):
  LOW_VALUE       → $39   low-friction, exploration framing
  DISCOVERY       → $39   learning + improvement framing
  SUCCESS_MOMENT  → $59   outcome anchor ("you just solved this — keep it")
  HIGH_INTENT     → $59   workflow + consistency framing
  FAILURE_TENSION → $39   fix-focused, urgency framing

ANTI-DISCOUNT GUARDRAILS (Part 16.8):
  - Never show a lower price than the highest seen in this session
  - Never oscillate rapidly — price consistency per session
  - session_max_price is tracked by the caller (sessionStorage on client)
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from engine.paywall.messaging import get_messaging

# ── Valid price points (snap to nearest) ─────────────────────────────────────
PRICE_LADDER = [39, 49, 59, 79]

# ── State → base price ────────────────────────────────────────────────────────
_STATE_BASE_PRICE: Dict[str, int] = {
    "low_value":       39,
    "discovery":       39,
    "success_moment":  59,
    "high_intent":     59,
    "failure_tension": 39,
}

# ── Intelligence score → price boost ─────────────────────────────────────────
# Format: (min_score, boost_dollars)
_INTEL_PRICE_BOOSTS = [
    (0.80, 10),   # score >= 0.80 → +$10 (e.g. $39→$49, $59→$69→snapped to $59)
    (0.65, 0),    # score 0.65–0.79 → no boost
]


def get_adaptive_pricing(
    value_state: str,
    intelligence_score: Optional[float] = None,
    nailed_it_rate:     Optional[float] = None,   # reserved for future use
    missed_it_rate:     Optional[float] = None,   # reserved for future use
    usage_count:        int = 0,
    session_depth:      int = 0,
    session_max_price:  int = 0,      # anti-discount guard — highest price seen this session
    experiment_variant: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Compute adaptive price, messaging, and CTA for the current user state.

    Returns:
        price_point        int   — resolved price (39 / 49 / 59 / 79)
        price_monthly      int   — same as price_point
        price_yearly       int   — price_point × 10 (~2 months free)
        yearly_discount_pct int
        messaging          dict  — headline, subheadline, cta, value_frame, proof, urgency
        cta_variant        str   — interpolated CTA label
        state              str   — value state used
        guardrail_applied  bool  — True if anti-discount rule raised the price
        experiment_variant str
    """
    state = value_state if isinstance(value_state, str) else str(value_state)
    base_price = _STATE_BASE_PRICE.get(state, 39)

    # ── Intelligence score boost ──────────────────────────────────────────────
    if intelligence_score is not None:
        for threshold, boost in _INTEL_PRICE_BOOSTS:
            if intelligence_score >= threshold:
                base_price = _snap_to_ladder(base_price + boost)
                break

    # ── Experiment variant override ───────────────────────────────────────────
    if experiment_variant == "price_high":
        base_price = _snap_to_ladder(base_price + 10)
    elif experiment_variant == "price_low":
        base_price = _snap_to_ladder(base_price - 10)

    # ── Anti-discount guardrail (Part 16.8) ───────────────────────────────────
    guardrail_applied = False
    if base_price < session_max_price:
        base_price = session_max_price
        guardrail_applied = True

    messaging = get_messaging(state, price=base_price)

    return {
        "price_point":         base_price,
        "price_monthly":       base_price,
        "price_yearly":        base_price * 10,
        "yearly_discount_pct": 17,
        "messaging":           messaging,
        "cta_variant":         messaging["cta"],
        "state":               state,
        "guardrail_applied":   guardrail_applied,
        "experiment_variant":  experiment_variant,
    }


def _snap_to_ladder(price: int) -> int:
    """Snap a price to the nearest valid price point in PRICE_LADDER."""
    return min(PRICE_LADDER, key=lambda p: abs(p - price))
