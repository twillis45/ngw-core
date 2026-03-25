"""
NGW Revenue Optimization — BusinessMetrics and Conversion Projection.

This module quantifies the revenue impact of pattern accuracy improvements.
It answers the question: "If we fix the Rembrandt classifier, how much does
that move the needle on conversions and revenue?"

Key classes
-----------
BusinessMetrics     — snapshot of revenue KPIs for a period
ConversionScenario  — before/after scenario for a single pattern fix
RevenueProjection   — full 30-day simulation output for one scenario

Key functions
-------------
compute_revenue_impact(pattern_id, sessions_per_day, before_cvr, after_cvr,
                       arpu, days)            → ConversionScenario
project_30_day_metrics(scenarios)             → list[RevenueProjection]
summarise_revenue_impact(projections)         → dict   (dashboard summary)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


# ── Default economic assumptions ──────────────────────────────────────────────
# Override by passing explicit values to the compute functions.

DEFAULT_ARPU_USD        = 9.00    # average revenue per converted session (subscription credit)
DEFAULT_SESSION_VALUE   = 0.40    # incremental value of each shoot-mode session started
DEFAULT_MATCH_LIFT      = 0.03    # expected CVR lift when pattern match improves 10pp
DEFAULT_DAYS            = 30


# ── Dataclasses ───────────────────────────────────────────────────────────────

@dataclass
class BusinessMetrics:
    """
    Revenue KPI snapshot for a time period.

    Designed to be storable in the monitoring_snapshots table or returned
    as JSON from the exec_dashboard route.
    """
    period_days:          int
    total_sessions:       int
    shoot_mode_sessions:  int          # sessions that entered shoot mode
    converted_sessions:   int          # sessions that purchased / upgraded
    matched_sessions:     int          # sessions with a confident pattern match

    conversion_rate:      float        # converted / total
    shoot_mode_rate:      float        # shoot_mode / total
    match_rate:           float        # matched / total
    match_conversion_rate: float       # converted among matched sessions

    gross_revenue_usd:    float
    avg_revenue_per_session: float
    avg_revenue_per_conversion: float  # ARPU

    top_patterns:         List[str] = field(default_factory=list)
    low_cvr_patterns:     List[str] = field(default_factory=list)
    computed_at:          str = ""

    @classmethod
    def from_raw(
        cls,
        period_days:         int,
        total:               int,
        shoot_mode:          int,
        converted:           int,
        matched:             int,
        gross_revenue:       float,
        arpu:                float,
        top_patterns:        Optional[List[str]] = None,
        low_cvr_patterns:    Optional[List[str]] = None,
    ) -> "BusinessMetrics":
        safe_total = total or 1
        return cls(
            period_days              = period_days,
            total_sessions           = total,
            shoot_mode_sessions      = shoot_mode,
            converted_sessions       = converted,
            matched_sessions         = matched,
            conversion_rate          = round(converted / safe_total, 4),
            shoot_mode_rate          = round(shoot_mode / safe_total, 4),
            match_rate               = round(matched / safe_total, 4),
            match_conversion_rate    = round(converted / max(matched, 1), 4),
            gross_revenue_usd        = round(gross_revenue, 2),
            avg_revenue_per_session  = round(gross_revenue / safe_total, 4),
            avg_revenue_per_conversion = round(arpu, 2),
            top_patterns             = top_patterns or [],
            low_cvr_patterns         = low_cvr_patterns or [],
            computed_at              = datetime.now(timezone.utc).isoformat(),
        )


@dataclass
class ConversionScenario:
    """
    Before/after revenue projection for a single pattern fix.

    The delta_revenue_30d is the headline number shown in the Lab UI
    and used in candidate promotion decisions.
    """
    pattern_id:              str
    description:             str
    sessions_per_day:        float        # how many sessions see this pattern daily
    before_cvr:              float        # current conversion rate (0–1)
    after_cvr:               float        # projected conversion rate after fix (0–1)
    arpu:                    float        # revenue per conversion ($)
    days:                    int

    cvr_lift:                float = 0.0  # after_cvr − before_cvr
    additional_conversions_30d: float = 0.0
    delta_revenue_30d:       float = 0.0
    baseline_revenue_30d:    float = 0.0
    projected_revenue_30d:   float = 0.0
    annualised_delta:        float = 0.0

    def __post_init__(self) -> None:
        self.cvr_lift = round(self.after_cvr - self.before_cvr, 4)
        total_sessions_30d = self.sessions_per_day * self.days
        self.baseline_revenue_30d  = round(total_sessions_30d * self.before_cvr * self.arpu, 2)
        self.projected_revenue_30d = round(total_sessions_30d * self.after_cvr  * self.arpu, 2)
        self.delta_revenue_30d     = round(self.projected_revenue_30d - self.baseline_revenue_30d, 2)
        self.additional_conversions_30d = round(total_sessions_30d * self.cvr_lift, 1)
        self.annualised_delta      = round(self.delta_revenue_30d * 12, 2)


@dataclass
class DaySnapshot:
    """One day's worth of simulated metrics."""
    day:                 int
    new_signals:         int
    cumulative_signals:  int
    cvr:                 float
    sessions:            int
    conversions:         int
    revenue:             float
    gate_status:         str    # insufficient | pending | auto_deploy | human_review | human_gate


@dataclass
class RevenueProjection:
    """
    Full 30-day simulation output for a named scenario.

    Captures the day-by-day build of signals, CVR improvement,
    and gate status transitions.
    """
    scenario_name:       str
    description:         str
    pattern_id:          str
    risk_level:          str
    sessions_per_day:    float
    baseline_cvr:        float
    target_cvr:          float
    arpu:                float

    day_snapshots:       List[DaySnapshot] = field(default_factory=list)
    gate_unlock_day:     Optional[int]     = None    # day signals crossed threshold
    deploy_day:          Optional[int]     = None    # day change was deployed
    total_revenue_30d:   float = 0.0
    baseline_revenue_30d: float = 0.0
    revenue_delta_30d:   float = 0.0
    total_conversions_30d: int = 0
    baseline_conversions_30d: int = 0
    annualised_delta:    float = 0.0
    computed_at:         str = ""


# ── Compute functions ─────────────────────────────────────────────────────────

def compute_revenue_impact(
    pattern_id:       str,
    sessions_per_day: float,
    before_cvr:       float,
    after_cvr:        float,
    arpu:             float = DEFAULT_ARPU_USD,
    days:             int   = DEFAULT_DAYS,
    description:      str   = "",
) -> ConversionScenario:
    """
    Compute the incremental revenue impact of a CVR improvement for one pattern.

    Parameters
    ----------
    pattern_id        : e.g. "rembrandt"
    sessions_per_day  : average daily sessions for this pattern
    before_cvr        : current CVR, e.g. 0.048 for 4.8%
    after_cvr         : projected CVR after fix, e.g. 0.061 for 6.1%
    arpu              : average revenue per conversion ($)
    days              : projection window (default 30)
    description       : human-readable label for the scenario

    Returns
    -------
    ConversionScenario with all delta fields populated.

    Examples
    --------
    >>> scenario = compute_revenue_impact("rembrandt", 40, 0.042, 0.065, arpu=9.0)
    >>> scenario.delta_revenue_30d
    248.4
    >>> scenario.annualised_delta
    2980.8
    """
    if not (0.0 <= before_cvr <= 1.0):
        raise ValueError(f"before_cvr must be in [0, 1]; got {before_cvr}")
    if not (0.0 <= after_cvr <= 1.0):
        raise ValueError(f"after_cvr must be in [0, 1]; got {after_cvr}")
    if sessions_per_day < 0:
        raise ValueError(f"sessions_per_day must be ≥0; got {sessions_per_day}")

    return ConversionScenario(
        pattern_id        = pattern_id,
        description       = description or f"{pattern_id} CVR lift",
        sessions_per_day  = sessions_per_day,
        before_cvr        = before_cvr,
        after_cvr         = after_cvr,
        arpu              = arpu,
        days              = days,
    )


def project_30_day_metrics(
    scenarios: List[Dict[str, Any]],
) -> List[RevenueProjection]:
    """
    Run the 30-day simulation for a list of scenario configs.

    Each scenario dict must have:
      name              str
      description       str
      pattern_id        str
      risk_level        str   (low | medium | high)
      sessions_per_day  float
      baseline_cvr      float
      target_cvr        float
      arpu              float  (optional, defaults to DEFAULT_ARPU_USD)
      daily_new_signals float  (how many new signals accumulate per day)

    The simulation models:
    - Day-by-day signal accumulation (weighted by DEFAULT tier assumptions)
    - Gate unlock day (when MIN_SIGNALS threshold is crossed)
    - CVR improvement phased in linearly after deploy
    - Revenue delta day-by-day
    """
    from engine.learning.knowledge import MIN_SIGNALS

    projections: List[RevenueProjection] = []

    for sc in scenarios:
        name             = sc["name"]
        description      = sc.get("description", name)
        pattern_id       = sc["pattern_id"]
        risk_level       = sc.get("risk_level", "medium").lower()
        sessions_pd      = float(sc["sessions_per_day"])
        baseline_cvr     = float(sc["baseline_cvr"])
        target_cvr       = float(sc["target_cvr"])
        arpu             = float(sc.get("arpu", DEFAULT_ARPU_USD))
        _raw_signals     = sc.get("daily_new_signals")
        daily_signals    = float(_raw_signals) if _raw_signals is not None else sessions_pd * 0.3

        threshold = MIN_SIGNALS.get(risk_level, MIN_SIGNALS["medium"])

        proj = RevenueProjection(
            scenario_name    = name,
            description      = description,
            pattern_id       = pattern_id,
            risk_level       = risk_level,
            sessions_per_day = sessions_pd,
            baseline_cvr     = baseline_cvr,
            target_cvr       = target_cvr,
            arpu             = arpu,
            computed_at      = datetime.now(timezone.utc).isoformat(),
        )

        cumulative_signals = 0
        gate_unlocked      = False
        deployed           = False
        total_revenue      = 0.0
        baseline_revenue   = 0.0
        total_conversions  = 0
        baseline_convs     = 0

        for day in range(1, 31):
            # Signal accumulation — assume ~70% of daily sessions generate a signal
            cumulative_signals += int(daily_signals)

            # Gate status
            if not gate_unlocked and cumulative_signals >= threshold:
                gate_unlocked     = True
                proj.gate_unlock_day = day

                # Deploy lag:
                #   low    → auto-deploy same day
                #   medium → +3 days for review
                #   high   → +7 days for committee
                if risk_level == "low":
                    deploy_lag = 0
                elif risk_level == "medium":
                    deploy_lag = 3
                else:
                    deploy_lag = 7
                proj.deploy_day = day + deploy_lag

            if proj.deploy_day and day >= proj.deploy_day:
                deployed = True

            # CVR for this day — linear ramp from baseline to target over 7 days post-deploy
            if deployed and proj.deploy_day:
                ramp_day = day - proj.deploy_day
                ramp_fraction = min(ramp_day / 7.0, 1.0)
                current_cvr = baseline_cvr + (target_cvr - baseline_cvr) * ramp_fraction
            else:
                current_cvr = baseline_cvr

            # Gate status label
            if deployed:
                gate_status = "deployed"
            elif gate_unlocked:
                gate_status = {"low": "auto_deploy", "medium": "human_review", "high": "human_gate"}.get(risk_level, "pending")
            elif cumulative_signals > 0:
                gate_status = "insufficient"
            else:
                gate_status = "no_signals"

            sessions    = int(sessions_pd)
            conversions = int(sessions * current_cvr)
            baseline_c  = int(sessions * baseline_cvr)
            revenue     = sessions * current_cvr * arpu
            base_rev    = sessions * baseline_cvr * arpu

            total_revenue    += revenue
            baseline_revenue += base_rev
            total_conversions  += conversions
            baseline_convs     += baseline_c

            proj.day_snapshots.append(DaySnapshot(
                day                = day,
                new_signals        = int(daily_signals),
                cumulative_signals = cumulative_signals,
                cvr                = round(current_cvr, 4),
                sessions           = sessions,
                conversions        = conversions,
                revenue            = round(revenue, 2),
                gate_status        = gate_status,
            ))

        proj.total_revenue_30d      = round(total_revenue, 2)
        proj.baseline_revenue_30d   = round(baseline_revenue, 2)
        proj.revenue_delta_30d      = round(total_revenue - baseline_revenue, 2)
        proj.total_conversions_30d  = total_conversions
        proj.baseline_conversions_30d = baseline_convs
        proj.annualised_delta       = round(proj.revenue_delta_30d * 12, 2)

        projections.append(proj)
        logger.info(
            "Scenario '%s': gate_unlock_day=%s deploy_day=%s "
            "revenue_delta_30d=$%.2f annualised=$%.2f",
            name,
            proj.gate_unlock_day,
            proj.deploy_day,
            proj.revenue_delta_30d,
            proj.annualised_delta,
        )

    return projections


def summarise_revenue_impact(projections: List[RevenueProjection]) -> Dict[str, Any]:
    """
    Roll up a list of RevenueProjection into a dashboard-ready summary dict.

    Returns
    -------
    {
        "total_scenarios":      int,
        "total_revenue_delta_30d": float,
        "total_annualised_delta": float,
        "fastest_deploy_day":   int | None,
        "scenarios":            [ {name, pattern_id, revenue_delta_30d, annualised_delta,
                                   gate_unlock_day, deploy_day, risk_level} ]
    }
    """
    if not projections:
        return {
            "total_scenarios":          0,
            "total_revenue_delta_30d":  0.0,
            "total_annualised_delta":   0.0,
            "fastest_deploy_day":       None,
            "scenarios":                [],
        }

    total_delta     = sum(p.revenue_delta_30d for p in projections)
    total_annual    = sum(p.annualised_delta for p in projections)
    deploy_days     = [p.deploy_day for p in projections if p.deploy_day]
    fastest         = min(deploy_days) if deploy_days else None

    return {
        "total_scenarios":          len(projections),
        "total_revenue_delta_30d":  round(total_delta, 2),
        "total_annualised_delta":   round(total_annual, 2),
        "fastest_deploy_day":       fastest,
        "scenarios": [
            {
                "name":               p.scenario_name,
                "pattern_id":         p.pattern_id,
                "risk_level":         p.risk_level,
                "revenue_delta_30d":  p.revenue_delta_30d,
                "annualised_delta":   p.annualised_delta,
                "gate_unlock_day":    p.gate_unlock_day,
                "deploy_day":         p.deploy_day,
                "cvr_lift":           round(p.target_cvr - p.baseline_cvr, 4),
            }
            for p in sorted(projections, key=lambda x: x.revenue_delta_30d, reverse=True)
        ],
    }
