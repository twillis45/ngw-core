"""
Analytics → Failure Cluster Ingestion
======================================
Reads aggregated production analytics and identifies meaningful failure
patterns. Each failure type maps to a deterministic cluster record stored
in `failure_clusters`.

Failure modes detected
----------------------
conversion_gap
    A pattern has high analysis volume but very low upgrade rate. The engine
    is showing this pattern often, but users aren't converting — may indicate
    over-confident or incorrect pattern detection.

confidence_mismatch
    A pattern's analysis volume is high but its CVR is an outlier below the
    fleet mean by more than 2 standard deviations. Confidence is over-stated
    relative to actual user success.

step_deviation
    Shoot mode match rate is critically low (< 30%). Users enter shoot mode
    but cannot achieve a match — steps may be wrong or incompletable.

pattern_drift
    A pattern's daily analysis count has declined > 40% over the most recent
    window vs the prior window. May indicate upstream misclassification.

trust_gap
    Sessions achieve a match but upgrade rate from matched sessions is very
    low. The system earns trust operationally but not commercially.

SAFETY RULE: Ingestion ONLY writes to `failure_clusters`. It does NOT create
candidates, modify rule logic, or touch production datasets.
"""
from __future__ import annotations

import logging
import statistics
import time
from typing import Any, Dict, List, Optional, Tuple

from db.analytics import (
    get_pattern_performance,
    get_kpi_summary,
    get_shoot_mode_stats,
    get_daily_trend,
    get_success_conversion_breakdown,
)
# Ingestion already reads production-only data because all analytics functions
# apply EXCL_METRICS / EXCL_CONVERSION / EXCL_LEARNING filters at the DB layer.
# No additional filtering needed here.
from db.learning import upsert_failure_cluster
from db.failures import get_failure_stats
from engine.learning.failure_classifier import severity_from_class_and_confidence

logger = logging.getLogger(__name__)

# ── Thresholds ─────────────────────────────────────────────────────────────────

_MIN_ANALYSIS_COUNT = 5          # ignore patterns with too few samples
_CONVERSION_GAP_CVR_THRESHOLD = 1.0   # % — patterns with CVR < this are flagged
_STEP_DEVIATION_MATCH_RATE = 30.0     # % — global match rate below this triggers cluster
_PATTERN_DRIFT_DECLINE_PCT = 40.0     # % — daily analysis decline to flag drift
_TRUST_GAP_LIFT_THRESHOLD = -2.0      # pp — if matched sessions convert worse than unmatched


def _severity_from_frequency(frequency: int, cvr: float) -> str:
    if frequency >= 50 and cvr == 0:
        return "critical"
    if frequency >= 20 and cvr < 2.0:
        return "high"
    if frequency >= 10 and cvr < 5.0:
        return "medium"
    return "low"


def _fleet_cvr_stats(patterns: List[Dict[str, Any]]) -> Tuple[float, float]:
    """Return (mean, stdev) of conversion_rate_pct across all patterns."""
    rates = [p["conversion_rate_pct"] for p in patterns if p["analysis_count"] >= _MIN_ANALYSIS_COUNT]
    if len(rates) < 2:
        return (0.0, 0.0)
    return (statistics.mean(rates), statistics.stdev(rates))


def ingest_from_analytics(days: int = 30, origin: str = "production") -> Dict[str, Any]:
    """
    Run a full ingestion pass over the last `days` days of analytics.
    Returns a summary of clusters created/updated.

    This is the only entry point for ingestion. It is safe to call repeatedly —
    existing open clusters are updated in-place rather than duplicated.

    Args:
        days:   Analytics lookback window (7–90).
        origin: Data scope for this run.
                'production' (default) — only clean production sessions.
                'all'                  — all sessions including internal/dev.
                                         Use from the LAB UI to test the pipeline
                                         before real production traffic exists.
                                         The scheduler always uses 'production'.
    """
    logger.info("Learning ingestion started (days=%d origin=%s)", days, origin)
    started_at = time.time()

    # 'all' passed to analytics functions bypasses production exclusion filters.
    analytics_origin: Optional[str] = "all" if origin == "all" else None

    summary: Dict[str, Any] = {
        "days": days,
        "origin": origin,
        "clusters_created_or_updated": 0,
        "by_failure_mode": {},
        "errors": [],
    }

    try:
        patterns = get_pattern_performance(days=days, origin=analytics_origin)
        kpi = get_kpi_summary(days=days, origin=analytics_origin)
        shoot_mode = get_shoot_mode_stats(days=days)
        trend = get_daily_trend(days=days)
        success_conv = get_success_conversion_breakdown(days=days)
    except Exception as exc:
        logger.exception("Failed to load analytics for ingestion")
        summary["errors"].append(str(exc))
        return summary

    # 1 — Conversion gap clusters (per pattern)
    n = _ingest_conversion_gaps(patterns, summary)
    summary["by_failure_mode"]["conversion_gap"] = n

    # 2 — Confidence mismatch clusters (per pattern, fleet-relative)
    n = _ingest_confidence_mismatches(patterns, summary)
    summary["by_failure_mode"]["confidence_mismatch"] = n

    # 3 — Step deviation cluster (global shoot mode health)
    n = _ingest_step_deviation(shoot_mode, kpi, summary)
    summary["by_failure_mode"]["step_deviation"] = n

    # 4 — Pattern drift clusters (from daily trend)
    n = _ingest_pattern_drift(trend, summary)
    summary["by_failure_mode"]["pattern_drift"] = n

    # 5 — Trust gap cluster (from success→conversion breakdown)
    n = _ingest_trust_gap(success_conv, kpi, summary)
    summary["by_failure_mode"]["trust_gap"] = n

    # 6 — Environment-segmented conversion gaps
    n = _ingest_conversion_gaps_by_environment(days, summary, dev_mode=(origin == "all"))
    summary["by_failure_mode"]["env_conversion_gap"] = n

    # 7 — MISSED_IT failure events → misclassification / blueprint / low_conf clusters
    n = _ingest_missed_it_failures(days, summary)
    summary["by_failure_mode"]["missed_it"] = n

    # 8 — Refresh intelligence score snapshots after each ingestion run
    try:
        from engine.intelligence.score import compute_global_score, compute_pattern_scores
        compute_global_score(days=days, save=True)
        compute_pattern_scores(days=days, save=True)
        summary["by_failure_mode"]["intelligence_refresh"] = 1
    except Exception as exc:
        logger.warning("Intelligence score refresh failed: %s", exc)
        summary["errors"].append(f"intelligence_refresh: {exc}")

    elapsed = round(time.time() - started_at, 2)
    summary["elapsed_secs"] = elapsed
    summary["total_clusters"] = sum(summary["by_failure_mode"].values())
    summary["clusters_created_or_updated"] = summary["total_clusters"]
    # Convenience aliases used by the scheduler status display and UI
    summary["clusters_created"] = summary["total_clusters"]
    summary["clusters_updated"] = 0   # detectors upsert; split tracking is future work
    logger.info("Learning ingestion complete: %s clusters in %.2fs", summary["total_clusters"], elapsed)
    return summary


# ── Failure mode detectors ──────────────────────────────────────────────────────

def _ingest_conversion_gaps(patterns: List[Dict[str, Any]], summary: Dict) -> int:
    """Flag patterns with meaningful analysis volume but near-zero CVR."""
    count = 0
    for p in patterns:
        pat = p.get("pattern") or "unknown"
        ac = p.get("analysis_count", 0)
        cvr = p.get("conversion_rate_pct", 0.0)
        uc = p.get("upgrade_count", 0)

        if ac < _MIN_ANALYSIS_COUNT:
            continue
        if cvr >= _CONVERSION_GAP_CVR_THRESHOLD:
            continue

        severity = _severity_from_frequency(ac, cvr)
        evidence = {
            "analysis_count": ac,
            "upgrade_count": uc,
            "conversion_rate_pct": cvr,
            "threshold_used": _CONVERSION_GAP_CVR_THRESHOLD,
            "description": (
                f"Pattern '{pat}' seen {ac} times but only {uc} upgrade(s) — "
                f"CVR {cvr}% is below the {_CONVERSION_GAP_CVR_THRESHOLD}% threshold."
            ),
        }
        try:
            upsert_failure_cluster(
                pattern_id=pat,
                environment=None,
                subject_type=None,
                failure_mode="conversion_gap",
                severity=severity,
                frequency=ac,
                affected_sessions=ac,
                evidence=evidence,
            )
            count += 1
        except Exception as exc:
            logger.warning("conversion_gap upsert failed for %s: %s", pat, exc)
            summary["errors"].append(f"conversion_gap/{pat}: {exc}")
    return count


def _ingest_confidence_mismatches(patterns: List[Dict[str, Any]], summary: Dict) -> int:
    """Flag patterns whose CVR is > 2σ below the fleet mean."""
    mean, stdev = _fleet_cvr_stats(patterns)
    if stdev == 0:
        return 0  # not enough variance to detect mismatches

    count = 0
    threshold = mean - 2 * stdev
    for p in patterns:
        pat = p.get("pattern") or "unknown"
        ac = p.get("analysis_count", 0)
        cvr = p.get("conversion_rate_pct", 0.0)
        uc = p.get("upgrade_count", 0)

        if ac < _MIN_ANALYSIS_COUNT:
            continue
        if cvr >= threshold:
            continue  # within normal range

        z_score = round((cvr - mean) / stdev, 2) if stdev else 0.0
        severity = "high" if z_score < -3 else "medium"
        evidence = {
            "analysis_count": ac,
            "upgrade_count": uc,
            "conversion_rate_pct": cvr,
            "fleet_mean_cvr": round(mean, 2),
            "fleet_stdev_cvr": round(stdev, 2),
            "z_score": z_score,
            "description": (
                f"Pattern '{pat}' CVR {cvr}% is {abs(z_score)}σ below fleet mean "
                f"{round(mean, 1)}%. Confidence scoring may be over-stated for this pattern."
            ),
        }
        try:
            upsert_failure_cluster(
                pattern_id=pat,
                environment=None,
                subject_type=None,
                failure_mode="confidence_mismatch",
                severity=severity,
                frequency=ac,
                affected_sessions=ac,
                evidence=evidence,
            )
            count += 1
        except Exception as exc:
            logger.warning("confidence_mismatch upsert failed for %s: %s", pat, exc)
            summary["errors"].append(f"confidence_mismatch/{pat}: {exc}")
    return count


def _ingest_step_deviation(shoot_mode: Dict[str, Any], kpi: Dict[str, Any], summary: Dict) -> int:
    """Flag global shoot mode failure if match rate is critically low."""
    started = shoot_mode.get("started", 0)
    if started < _MIN_ANALYSIS_COUNT:
        return 0  # not enough shoot mode sessions

    match_rate = shoot_mode.get("match_rate_pct", 100.0)
    if match_rate >= _STEP_DEVIATION_MATCH_RATE:
        return 0

    avg_steps = shoot_mode.get("avg_steps_completed", None)
    avg_time = shoot_mode.get("avg_time_to_match_secs", None)
    matched = shoot_mode.get("matched", 0)

    severity = "critical" if match_rate < 15 else "high" if match_rate < 20 else "medium"
    evidence = {
        "sessions_started": started,
        "sessions_matched": matched,
        "match_rate_pct": match_rate,
        "avg_steps_completed": avg_steps,
        "avg_time_to_match_secs": avg_time,
        "threshold_used": _STEP_DEVIATION_MATCH_RATE,
        "description": (
            f"Global shoot mode match rate is {match_rate}% — below the "
            f"{_STEP_DEVIATION_MATCH_RATE}% threshold. Users are starting shoot mode "
            f"but not completing it. Guided steps may be incorrect or too complex."
        ),
    }
    try:
        upsert_failure_cluster(
            pattern_id=None,
            environment=None,
            subject_type=None,
            failure_mode="step_deviation",
            severity=severity,
            frequency=started,
            affected_sessions=started - matched,
            evidence=evidence,
        )
        return 1
    except Exception as exc:
        logger.warning("step_deviation upsert failed: %s", exc)
        summary["errors"].append(f"step_deviation: {exc}")
        return 0


def _ingest_pattern_drift(trend: List[Dict[str, Any]], summary: Dict) -> int:
    """Detect declining analysis volume over the trend window."""
    if len(trend) < 14:
        return 0  # need at least 2 weeks

    mid = len(trend) // 2
    first_half = trend[:mid]
    second_half = trend[mid:]

    first_avg = sum(d.get("analysis", 0) for d in first_half) / len(first_half)
    second_avg = sum(d.get("analysis", 0) for d in second_half) / len(second_half)

    if first_avg == 0:
        return 0

    decline_pct = round((first_avg - second_avg) / first_avg * 100, 1)
    if decline_pct < _PATTERN_DRIFT_DECLINE_PCT:
        return 0

    severity = "high" if decline_pct >= 60 else "medium"
    evidence = {
        "first_half_daily_avg": round(first_avg, 1),
        "second_half_daily_avg": round(second_avg, 1),
        "decline_pct": decline_pct,
        "trend_days": len(trend),
        "threshold_used": _PATTERN_DRIFT_DECLINE_PCT,
        "description": (
            f"Overall analysis volume has declined {decline_pct}% in the second half "
            f"of the {len(trend)}-day window vs the first half. "
            f"This may indicate upstream routing or classification drift."
        ),
    }
    try:
        upsert_failure_cluster(
            pattern_id=None,
            environment=None,
            subject_type=None,
            failure_mode="pattern_drift",
            severity=severity,
            frequency=len(trend),
            affected_sessions=int(first_avg * len(first_half)),
            evidence=evidence,
        )
        return 1
    except Exception as exc:
        logger.warning("pattern_drift upsert failed: %s", exc)
        summary["errors"].append(f"pattern_drift: {exc}")
        return 0


def _ingest_conversion_gaps_by_environment(days: int, summary: Dict, dev_mode: bool = False) -> int:
    """
    Detect conversion gaps segmented by (pattern, environment).
    Uses session_signals directly for environment breakdown.
    Only runs if there are signals with environment data.

    dev_mode=True drops the include_in_learning filter so internal sessions
    are included — used when the LAB UI triggers ingestion in 'all' origin mode.
    """
    import time

    learning_filter = "" if dev_mode else "AND include_in_learning=1"

    count = 0
    try:
        with __import__('db.database', fromlist=['get_db']).get_db() as conn:
            rows = conn.execute(
                f"""SELECT pattern_id, environment,
                          COUNT(*) as sessions,
                          SUM(CASE WHEN upgraded=1 THEN 1 ELSE 0 END) as upgrades
                   FROM session_signals
                   WHERE environment IS NOT NULL
                     AND environment != ''
                     {learning_filter}
                     AND created_at >= ?
                   GROUP BY pattern_id, environment
                   HAVING sessions >= ?""",
                [time.time() - days * 86400, _MIN_ANALYSIS_COUNT],
            ).fetchall()
    except Exception as exc:
        logger.warning("env_conversion_gap: query failed: %s", exc)
        summary["errors"].append(f"env_conversion_gap: {exc}")
        return 0

    for r in rows:
        pat = r["pattern_id"]
        env = r["environment"]
        sessions = r["sessions"]
        upgrades = r["upgrades"]
        cvr = round(upgrades / sessions * 100, 2) if sessions else 0.0

        if cvr >= _CONVERSION_GAP_CVR_THRESHOLD:
            continue

        severity = _severity_from_frequency(sessions, cvr)
        evidence = {
            "analysis_count": sessions,
            "upgrade_count": upgrades,
            "conversion_rate_pct": cvr,
            "environment": env,
            "description": (
                f"Pattern '{pat}' in {env} environment: {sessions} sessions, {upgrades} upgrades "
                f"({cvr}% CVR) — below {_CONVERSION_GAP_CVR_THRESHOLD}% threshold."
            ),
        }
        try:
            upsert_failure_cluster(
                pattern_id=pat,
                environment=env,
                subject_type=None,
                failure_mode="conversion_gap",
                severity=severity,
                frequency=sessions,
                affected_sessions=sessions,
                evidence=evidence,
            )
            count += 1
        except Exception as exc:
            logger.warning("env_conversion_gap upsert failed %s/%s: %s", pat, env, exc)
            summary["errors"].append(f"env_conversion_gap/{pat}/{env}: {exc}")

    return count


def _ingest_trust_gap(success_conv: Dict[str, Any], kpi: Dict[str, Any], summary: Dict) -> int:
    """Flag when matched sessions convert WORSE than unmatched (or barely better)."""
    matched_sessions = success_conv.get("matched_sessions", 0)
    if matched_sessions < _MIN_ANALYSIS_COUNT:
        return 0

    lift = success_conv.get("lift_pct", 0.0)
    if lift is None or lift > _TRUST_GAP_LIFT_THRESHOLD:
        return 0  # normal or positive lift

    matched_rate = success_conv.get("matched_conversion_rate_pct", 0.0)
    not_matched_rate = success_conv.get("not_matched_conversion_rate_pct", 0.0)
    matched_converted = success_conv.get("matched_converted", 0)

    severity = "critical" if lift < -5 else "high" if lift < -2 else "medium"
    evidence = {
        "matched_sessions": matched_sessions,
        "matched_conversion_rate_pct": matched_rate,
        "not_matched_conversion_rate_pct": not_matched_rate,
        "lift_pct": lift,
        "matched_converted": matched_converted,
        "description": (
            f"Sessions achieving a match convert at {matched_rate}% vs {not_matched_rate}% "
            f"for unmatched sessions — a negative lift of {abs(lift)}pp. "
            f"The system is delivering matches that don't translate to upgrades."
        ),
    }
    try:
        upsert_failure_cluster(
            pattern_id=None,
            environment=None,
            subject_type=None,
            failure_mode="trust_gap",
            severity=severity,
            frequency=matched_sessions,
            affected_sessions=matched_sessions - matched_converted,
            evidence=evidence,
        )
        return 1
    except Exception as exc:
        logger.warning("trust_gap upsert failed: %s", exc)
        summary["errors"].append(f"trust_gap: {exc}")
        return 0


# ── MISSED_IT failure detector ──────────────────────────────────────────────────

# Minimum failure count before we generate a cluster — avoids overfitting to noise
_MIN_FAILURES_FOR_CLUSTER = 3
# High-confidence failures are worth flagging even at low counts
_MIN_FAILURES_HIGH_CONFIDENCE = 2
_HIGH_CONFIDENCE_THRESHOLD = 0.65


def _ingest_missed_it_failures(days: int, summary: Dict) -> int:
    """
    Ingest MISSED_IT failure events from failure_events table.

    For each pattern with enough failures, creates/updates clusters grouped by
    dominant failure class (misclassification, blueprint_failure, etc.).

    SAFETY: minimum thresholds prevent overfitting on small sample sizes.
    Returns number of clusters created/updated.
    """
    try:
        stats = get_failure_stats(days=days)
    except Exception as exc:
        logger.warning("get_failure_stats failed: %s", exc)
        summary["errors"].append(f"missed_it: {exc}")
        return 0

    count = 0
    for row in stats:
        pattern = row.get("predicted_pattern") or "unknown"
        total = row.get("total_failures", 0)
        avg_conf = row.get("avg_confidence") or 0.0
        avg_sq = row.get("avg_signal_quality") or 0.0

        if total < _MIN_FAILURES_FOR_CLUSTER:
            # Allow high-confidence failures to surface earlier
            if not (
                total >= _MIN_FAILURES_HIGH_CONFIDENCE
                and avg_conf >= _HIGH_CONFIDENCE_THRESHOLD
            ):
                continue

        # Determine dominant failure class for this pattern
        n_misclass = row.get("n_misclass", 0) or 0
        n_blueprint = row.get("n_blueprint", 0) or 0
        n_low_conf = row.get("n_low_conf", 0) or 0
        n_edge = row.get("n_edge", 0) or 0

        dominant_class = max(
            [
                ("misclassification", n_misclass),
                ("blueprint_failure", n_blueprint),
                ("low_confidence", n_low_conf),
                ("edge_case", n_edge),
            ],
            key=lambda x: x[1],
        )[0]

        # Map to failure_mode names consistent with auto_candidate.py mapping
        failure_mode_map = {
            "misclassification":  "confidence_mismatch",  # high-conf wrong → recalibrate
            "blueprint_failure":  "step_deviation",        # steps fail → fix blueprint
            "low_confidence":     "confidence_mismatch",   # under-confident → recalibrate
            "edge_case":          "pattern_drift",          # edge cases → may need data
        }
        failure_mode = failure_mode_map.get(dominant_class, "confidence_mismatch")

        severity = severity_from_class_and_confidence(
            dominant_class, avg_conf, total
        )

        evidence = {
            "source": "missed_it_events",
            "total_failures": total,
            "dominant_class": dominant_class,
            "avg_confidence": round(avg_conf, 3),
            "avg_signal_quality": round(avg_sq, 3),
            "class_breakdown": {
                "misclassification": n_misclass,
                "blueprint_failure": n_blueprint,
                "low_confidence": n_low_conf,
                "edge_case": n_edge,
            },
        }

        try:
            upsert_failure_cluster(
                pattern_id=pattern,
                environment=None,
                subject_type=None,
                failure_mode=failure_mode,
                severity=severity,
                frequency=total,
                affected_sessions=total,
                evidence=evidence,
            )
            count += 1
        except Exception as exc:
            logger.warning("missed_it cluster upsert failed for %s: %s", pattern, exc)
            summary["errors"].append(f"missed_it/{pattern}: {exc}")

    logger.info("missed_it ingestion: %d clusters from failure_events", count)
    return count
