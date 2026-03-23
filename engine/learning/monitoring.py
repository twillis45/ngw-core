"""
Post-Release Monitoring
========================
Tracks accepted candidates after they reach production by comparing
current analytics metrics against the pre-release baseline captured at
release_attribution time.

Windows: 7, 14, 30 days after release_date.

Alert thresholds
-----------------
candidate_regression
    success_rate_delta < -5pp  or  confidence_delta < -0.1
rollback_review
    conversion_delta < -3pp  or  trust_delta < -0.15  or
    success_rate_delta < -10pp

SAFETY RULES:
  - Monitoring ONLY reads analytics and writes monitoring_snapshots.
  - It does NOT revert candidates or modify production rules.
  - Alerts are surfaced via the /lab/learning/monitoring API for human review.
"""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional

from db.analytics import get_kpi_summary, get_shoot_mode_stats, get_success_conversion_breakdown
from db.learning import (
    create_monitoring_snapshot,
    get_release_attributions,
    get_release_attribution,
    get_monitoring_snapshots,
)

logger = logging.getLogger(__name__)

# Alert thresholds (percentage points or absolute values)
_REGRESSION_THRESHOLD_SUCCESS = -5.0      # pp match rate drop
_REGRESSION_THRESHOLD_CONFIDENCE = -0.10  # absolute confidence drop
_ROLLBACK_THRESHOLD_CONVERSION = -3.0     # pp CVR drop
_ROLLBACK_THRESHOLD_TRUST = -0.15         # absolute trust drop
_ROLLBACK_THRESHOLD_SUCCESS_HARD = -10.0  # pp hard match rate drop


def run_monitoring_sweep(window_days: int = 30) -> Dict[str, Any]:
    """
    Check all released candidates that are within the `window_days` monitoring
    window and have not yet been measured at this window size.

    Returns a summary of snapshots created and alerts raised.
    """
    attributions = get_release_attributions(limit=100)
    now = time.time()
    results = {
        "window_days": window_days,
        "checked": 0,
        "snapshots_created": 0,
        "alerts": [],
        "errors": [],
    }

    for attr in attributions:
        release_date = attr.get("release_date", 0)
        attr_id = attr["id"]
        days_since_release = (now - release_date) / 86400

        # Only measure if the window has elapsed
        if days_since_release < window_days:
            continue

        # Check if we already have a snapshot for this window
        existing_snapshots = get_monitoring_snapshots(attr_id)
        already_measured = any(
            s.get("window_days") == window_days for s in existing_snapshots
        )
        if already_measured:
            continue

        results["checked"] += 1
        try:
            snap = _measure_and_snapshot(attr, window_days)
            if snap:
                results["snapshots_created"] += 1
                if snap.get("alert_type"):
                    results["alerts"].append({
                        "attribution_id": attr_id,
                        "candidate_id": attr.get("candidate_id"),
                        "alert_type": snap["alert_type"],
                        "window_days": window_days,
                        "snapshot_id": snap["id"],
                    })
        except Exception as exc:
            logger.exception("monitoring sweep: error on attribution %s", attr_id)
            results["errors"].append({"attribution_id": attr_id, "error": str(exc)})

    return results


def _measure_and_snapshot(
    attribution: Dict[str, Any],
    window_days: int,
) -> Optional[Dict[str, Any]]:
    """
    Take a current metric snapshot and compare against the pre-release baseline.
    """
    attr_id = attribution["id"]
    baseline = attribution.get("pre_release_baseline") or {}

    # Gather current metrics
    kpi = get_kpi_summary(days=window_days)
    shoot_mode = get_shoot_mode_stats(days=window_days)
    success_conv = get_success_conversion_breakdown(days=window_days)

    current = {
        "match_rate_pct": shoot_mode.get("match_rate_pct", 0),
        "conversion_rate_pct": kpi.get("conversion_rate_pct", 0),
        "analysis_per_session": kpi.get("analysis_per_session", 0),
        "matched_conversion_rate_pct": success_conv.get("matched_conversion_rate_pct", 0),
        "lift_pct": success_conv.get("lift_pct", 0),
    }

    # Compute deltas vs baseline
    baseline_match = baseline.get("match_rate_pct", 0) or 0
    baseline_cvr = baseline.get("conversion_rate_pct", 0) or 0
    baseline_lift = baseline.get("lift_pct", 0) or 0
    baseline_confidence = baseline.get("confidence_mean", 0) or 0

    current_match = current["match_rate_pct"]
    current_cvr = current["conversion_rate_pct"]
    current_lift = current.get("lift_pct", 0)

    success_rate_delta = round(current_match - baseline_match, 2)
    conversion_delta = round(current_cvr - baseline_cvr, 2)
    trust_delta = round(current_lift - baseline_lift, 2)
    confidence_delta = None  # requires per-session confidence capture — flagged for future

    # Determine alert type
    alert_type = None
    if (
        success_rate_delta <= _ROLLBACK_THRESHOLD_SUCCESS_HARD
        or conversion_delta <= _ROLLBACK_THRESHOLD_CONVERSION
        or trust_delta <= _ROLLBACK_THRESHOLD_TRUST
    ):
        alert_type = "rollback_review"
    elif success_rate_delta <= _REGRESSION_THRESHOLD_SUCCESS:
        alert_type = "candidate_regression"

    if alert_type:
        logger.warning(
            "monitoring: %s alert for attribution %s (window=%dd): "
            "match_rate_delta=%s, cvr_delta=%s",
            alert_type, attr_id, window_days, success_rate_delta, conversion_delta,
        )

    snapshot = create_monitoring_snapshot(
        attribution_id=attr_id,
        window_days=window_days,
        success_rate_delta=success_rate_delta,
        confidence_delta=confidence_delta,
        conversion_delta=conversion_delta,
        trust_delta=trust_delta,
        alert_type=alert_type,
        snapshot={
            "baseline": baseline,
            "current": current,
            "delta": {
                "success_rate": success_rate_delta,
                "conversion": conversion_delta,
                "trust": trust_delta,
            },
            "window_days": window_days,
            "measured_at_iso": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        },
    )

    return snapshot


def capture_pre_release_baseline(days: int = 30) -> Dict[str, Any]:
    """
    Capture current analytics metrics as a baseline snapshot for a release.
    Call this BEFORE recording the release_attribution.
    """
    kpi = get_kpi_summary(days=days)
    shoot_mode = get_shoot_mode_stats(days=days)
    success_conv = get_success_conversion_breakdown(days=days)

    return {
        "match_rate_pct": shoot_mode.get("match_rate_pct", 0),
        "conversion_rate_pct": kpi.get("conversion_rate_pct", 0),
        "analysis_per_session": kpi.get("analysis_per_session", 0),
        "matched_conversion_rate_pct": success_conv.get("matched_conversion_rate_pct", 0),
        "lift_pct": success_conv.get("lift_pct", 0),
        "total_sessions": kpi.get("total_sessions", 0),
        "total_users": kpi.get("total_users", 0),
        "baseline_days": days,
        "captured_at": time.time(),
    }


def get_monitoring_report(attribution_id: str) -> Dict[str, Any]:
    """
    Return a full monitoring report for a single release attribution,
    including all window snapshots and current status.
    """
    attribution = get_release_attribution(attribution_id)
    if not attribution:
        return {"error": "Attribution not found"}

    snapshots = get_monitoring_snapshots(attribution_id)
    windows_measured = [s["window_days"] for s in snapshots]
    windows_pending = [w for w in (7, 14, 30) if w not in windows_measured]

    now = time.time()
    release_date = attribution.get("release_date", now)
    days_live = round((now - release_date) / 86400, 1)

    alerts = [s for s in snapshots if s.get("alert_type")]
    highest_alert = None
    if any(s["alert_type"] == "rollback_review" for s in alerts):
        highest_alert = "rollback_review"
    elif any(s["alert_type"] == "candidate_regression" for s in alerts):
        highest_alert = "candidate_regression"

    return {
        "attribution_id": attribution_id,
        "candidate_id": attribution.get("candidate_id"),
        "release_version": attribution.get("release_version"),
        "days_live": days_live,
        "expected_lift": attribution.get("expected_lift", {}),
        "windows_measured": windows_measured,
        "windows_pending": windows_pending,
        "alert_status": highest_alert or "nominal",
        "snapshots": snapshots,
    }
