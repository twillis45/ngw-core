"""
Executive Dashboard — API routes.

Single aggregated endpoint that combines analytics, benchmark, and learning data
into a compact payload for the executive dashboard.

Routes:
  GET  /api/exec/dashboard?days=7   — full dashboard payload
  GET  /api/exec/dashboard/trends   — extended trend data (7d + 30d)
"""
from __future__ import annotations

import logging
import time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from auth.dev_guard import get_dev_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/exec", tags=["exec-dashboard"])

# Assumed upgrade value for revenue estimation (USD)
_AVG_UPGRADE_VALUE_USD = 12.0


# ── Main dashboard ─────────────────────────────────────────────────────────────

@router.get("/dashboard")
async def exec_dashboard(
    days: int = Query(7, ge=1, le=365),
    user: Dict = Depends(get_dev_user),
):
    """
    Full executive dashboard payload.
    Aggregates: KPIs, trends, pattern table, failure insights,
    benchmark status, revenue breakdown, experiment impact.
    """
    result: Dict[str, Any] = {
        "generated_at": time.time(),
        "days": days,
    }

    # Run all sections in sequence — each is isolated, failures return empty dicts
    result["kpis"]              = _get_kpis(days)
    result["kpi_prev"]          = _get_kpis(days * 2, offset_days=days)
    result["benchmark_status"]  = _get_benchmark_status()
    result["patterns"]          = _get_pattern_table(days)
    result["failure_insights"]  = _get_failure_insights()
    result["revenue"]           = _get_revenue(days)
    result["experiments"]       = _get_experiments()

    return result


@router.get("/dashboard/trends")
async def exec_trends(
    user: Dict = Depends(get_dev_user),
):
    """Extended trend data — 7-day and 30-day daily series."""
    from db.analytics import get_daily_trend
    return {
        "7d":  get_daily_trend(days=7),
        "30d": get_daily_trend(days=30),
    }


# ── Section builders ───────────────────────────────────────────────────────────

def _get_kpis(days: int, offset_days: int = 0) -> Dict[str, Any]:
    """
    Headline KPIs for the period [now - days - offset_days, now - offset_days].
    When offset_days=0 returns current period; when offset_days=days returns previous period
    (used for delta calculation).
    """
    try:
        from db.analytics import get_kpi_summary, get_shoot_mode_stats
        from db.database import get_db
        import time as _time

        now    = _time.time()
        since  = now - (days + offset_days) * 86400
        until  = now - offset_days * 86400

        kpi    = get_kpi_summary(days) if offset_days == 0 else _kpi_in_window(since, until)
        shoot  = get_shoot_mode_stats(days) if offset_days == 0 else _shoot_in_window(since, until)

        # Revenue per session: estimated from upgrades × avg value / sessions
        sessions  = kpi.get("total_sessions", 0) or 1
        upgrades  = kpi.get("upgrades", 0)
        rev_total = upgrades * _AVG_UPGRADE_VALUE_USD
        rev_per_s = round(rev_total / sessions, 2)

        return {
            "success_rate":        round(kpi.get("match_rate_pct", 0) / 100, 4),
            "conversion_rate":     round(kpi.get("conversion_rate_pct", 0) / 100, 4),
            "revenue_per_session": rev_per_s,
            "total_upgrades":      upgrades,
            "total_sessions":      kpi.get("total_sessions", 0),
            "total_analyses":      kpi.get("total_analyses", 0),
            "match_rate_pct":      kpi.get("match_rate_pct", 0),
            "conversion_rate_pct": kpi.get("conversion_rate_pct", 0),
            "avg_steps_to_match":  shoot.get("avg_steps_to_match"),
            "shoot_match_rate":    shoot.get("match_rate_pct", 0),
        }
    except Exception:
        logger.debug("KPI section failed", exc_info=True)
        return {}


def _kpi_in_window(since: float, until: float) -> Dict[str, Any]:
    """KPI counts for an arbitrary [since, until] window."""
    try:
        from db.database import get_db
        with get_db() as conn:
            sessions = conn.execute(
                "SELECT COUNT(DISTINCT session_id) as cnt FROM analytics_events "
                "WHERE created_at>=? AND created_at<? AND session_id IS NOT NULL",
                (since, until),
            ).fetchone()["cnt"]
            analyses = conn.execute(
                "SELECT COUNT(*) as cnt FROM analytics_events "
                "WHERE name='ANALYSIS_COMPLETE' AND created_at>=? AND created_at<?",
                (since, until),
            ).fetchone()["cnt"]
            upgrades = conn.execute(
                "SELECT COUNT(*) as cnt FROM analytics_events "
                "WHERE name='UPGRADE_COMPLETED' AND created_at>=? AND created_at<?",
                (since, until),
            ).fetchone()["cnt"]
            paywall = conn.execute(
                "SELECT COUNT(*) as cnt FROM analytics_events "
                "WHERE name='PAYWALL_TRIGGERED' AND created_at>=? AND created_at<?",
                (since, until),
            ).fetchone()["cnt"]
            matches = conn.execute(
                "SELECT COUNT(*) as cnt FROM analytics_events "
                "WHERE name='MATCH_ACHIEVED' AND created_at>=? AND created_at<?",
                (since, until),
            ).fetchone()["cnt"]
            shoots = conn.execute(
                "SELECT COUNT(*) as cnt FROM analytics_events "
                "WHERE name='SHOOT_MODE_STARTED' AND created_at>=? AND created_at<?",
                (since, until),
            ).fetchone()["cnt"]
        return {
            "total_sessions":      sessions,
            "total_analyses":      analyses,
            "upgrades":            upgrades,
            "match_rate_pct":      round(matches / shoots * 100, 1) if shoots else 0,
            "conversion_rate_pct": round(upgrades / paywall * 100, 1) if paywall else 0,
        }
    except Exception:
        return {}


def _shoot_in_window(since: float, until: float) -> Dict[str, Any]:
    try:
        from db.database import get_db
        with get_db() as conn:
            starts = conn.execute(
                "SELECT COUNT(*) as cnt FROM analytics_events "
                "WHERE name='SHOOT_MODE_STARTED' AND created_at>=? AND created_at<?",
                (since, until),
            ).fetchone()["cnt"]
            matches = conn.execute(
                "SELECT COUNT(*) as cnt FROM analytics_events "
                "WHERE name='MATCH_ACHIEVED' AND created_at>=? AND created_at<?",
                (since, until),
            ).fetchone()["cnt"]
        return {
            "match_rate_pct":      round(matches / starts * 100, 1) if starts else 0,
            "avg_steps_to_match":  None,
        }
    except Exception:
        return {}


def _get_benchmark_status() -> Dict[str, Any]:
    """Latest benchmark run + trend sparkline + active regressions."""
    try:
        from db.benchmark import get_benchmark_runs, get_last_n_run_scores, get_run_results
        from db.benchmark_baseline import get_latest_baseline

        runs = get_benchmark_runs(limit=1)
        if not runs:
            return {"has_runs": False}

        latest   = runs[0]
        trend    = get_last_n_run_scores(10)
        baseline = get_latest_baseline()

        # Count active regressions in latest run
        results   = get_run_results(latest["id"])
        reg_cases = [r for r in results if r.get("regression_flag")]

        # Baseline delta
        baseline_delta = None
        if baseline and latest.get("overall_score") is not None:
            baseline_delta = round(
                (latest["overall_score"] - baseline.get("overall_score", 0)), 4
            )

        return {
            "has_runs":          True,
            "run_id":            latest["id"],
            "overall_score":     latest.get("overall_score"),
            "pattern_accuracy":  latest.get("pattern_accuracy"),
            "blueprint_score":   latest.get("avg_blueprint_score"),
            "confidence_error":  latest.get("confidence_error"),
            "total_cases":       latest.get("total_cases"),
            "passed_cases":      latest.get("passed_cases"),
            "regression_count":  latest.get("regression_count", 0),
            "status":            latest.get("status"),
            "started_at":        latest.get("started_at"),
            "completed_at":      latest.get("completed_at"),
            "blocked":           latest.get("status") == "blocked",
            "trend":             trend,
            "regression_cases":  len(reg_cases),
            "top_regressions":   reg_cases[:3],
            "baseline_delta":    baseline_delta,
            "has_baseline":      baseline is not None,
        }
    except Exception:
        logger.debug("Benchmark status section failed", exc_info=True)
        return {"has_runs": False}


def _get_pattern_table(days: int) -> List[Dict[str, Any]]:
    """
    Per-pattern cross-section: success rate, conversion rate, revenue/session,
    benchmark score, and delta from previous run.
    """
    try:
        from db.analytics import get_pattern_performance
        from db.benchmark import get_pattern_metrics, get_benchmark_runs, get_run_results
        from collections import defaultdict

        perf     = get_pattern_performance(days)
        bm_all   = get_pattern_metrics()
        bm_map   = {m["pattern_id"]: m for m in bm_all}

        # Build delta map: cur run vs previous run
        delta_map: Dict[str, float] = {}
        runs = get_benchmark_runs(limit=2)
        if len(runs) >= 2:
            def _avg_by_pat(results):
                g = defaultdict(list)
                for r in results:
                    g[r.get("pattern_id", "unknown")].append(r.get("final_score", 0.0))
                return {k: sum(v) / len(v) for k, v in g.items()}
            cur  = _avg_by_pat(get_run_results(runs[0]["id"]))
            prev = _avg_by_pat(get_run_results(runs[1]["id"]))
            for pid in cur:
                if pid in prev:
                    delta_map[pid] = round(cur[pid] - prev[pid], 4)

        # Merge analytics + benchmark
        rows: List[Dict[str, Any]] = []
        seen = set()
        for p in perf:
            pat_name = (p.get("pattern") or "unknown").lower().replace("-", "_").replace(" ", "_")
            seen.add(pat_name)
            bm = bm_map.get(pat_name, {})
            ac = p.get("analysis_count", 0) or 1
            uc = p.get("upgrade_count", 0)
            rows.append({
                "pattern_id":          pat_name,
                "analysis_count":      p.get("analysis_count", 0),
                "conversion_rate":     round(p.get("conversion_rate_pct", 0) / 100, 4),
                "conversion_rate_pct": p.get("conversion_rate_pct", 0),
                "revenue_per_session": round(uc * _AVG_UPGRADE_VALUE_USD / ac, 2),
                "benchmark_score":     bm.get("benchmark_score"),
                "live_success_rate":   bm.get("live_success_rate"),
                "confidence_error":    bm.get("confidence_error"),
                "delta_change":        delta_map.get(pat_name),
            })

        # Also add patterns only in benchmark (no analytics data yet)
        for m in bm_all:
            if m["pattern_id"] not in seen:
                rows.append({
                    "pattern_id":          m["pattern_id"],
                    "analysis_count":      0,
                    "conversion_rate":     None,
                    "conversion_rate_pct": None,
                    "revenue_per_session": None,
                    "benchmark_score":     m.get("benchmark_score"),
                    "live_success_rate":   m.get("live_success_rate"),
                    "confidence_error":    m.get("confidence_error"),
                    "delta_change":        delta_map.get(m["pattern_id"]),
                })

        return sorted(rows, key=lambda x: x.get("benchmark_score") or 0, reverse=True)
    except Exception:
        logger.debug("Pattern table section failed", exc_info=True)
        return []


def _get_failure_insights() -> List[Dict[str, Any]]:
    """
    Top 5 failure insights from failure_clusters, sorted by severity + frequency.
    Also incorporates recent benchmark regressions.
    """
    try:
        from db.learning import get_failure_clusters
        from db.benchmark import get_benchmark_runs, get_run_results

        SEVERITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3}

        clusters = get_failure_clusters(status="open", limit=20)
        clusters_sorted = sorted(
            clusters,
            key=lambda c: (SEVERITY_ORDER.get(c.get("severity", "low"), 3), -c.get("frequency", 0)),
        )

        insights = []
        for c in clusters_sorted[:5]:
            insights.append({
                "id":          c.get("id"),
                "source":      "failure_cluster",
                "mode":        c.get("failure_mode"),
                "severity":    c.get("severity", "low"),
                "pattern":     c.get("pattern_id"),
                "environment": c.get("environment"),
                "frequency":   c.get("frequency", 0),
                "affected_sessions": c.get("affected_sessions", 0),
                "status":      c.get("status"),
                "candidate_id": c.get("candidate_id"),
            })

        # If fewer than 5, pad with benchmark regressions
        if len(insights) < 5:
            runs = get_benchmark_runs(limit=1)
            if runs:
                results = get_run_results(runs[0]["id"])
                reg = [r for r in results if r.get("regression_flag")]
                for r in reg[:5 - len(insights)]:
                    insights.append({
                        "id":        r.get("id"),
                        "source":    "benchmark_regression",
                        "mode":      "score_regression",
                        "severity":  "medium",
                        "pattern":   r.get("pattern_id"),
                        "frequency": 1,
                        "final_score": r.get("final_score"),
                        "status":    "open",
                    })

        return insights
    except Exception:
        logger.debug("Failure insights section failed", exc_info=True)
        return []


def _get_revenue(days: int) -> Dict[str, Any]:
    """
    Revenue breakdown by product type and session outcome.
    Inferred from UPGRADE_COMPLETED analytics events (data_json fields).
    """
    try:
        from db.database import get_db
        import json as _json

        since = time.time() - days * 86400
        with get_db() as conn:
            rows = conn.execute(
                "SELECT data_json FROM analytics_events "
                "WHERE name='UPGRADE_COMPLETED' AND created_at>=?",
                (since,),
            ).fetchall()

        by_product: Dict[str, int] = {"Core": 0, "Pro": 0, "Studio": 0, "Presets": 0, "Other": 0}
        by_outcome: Dict[str, int] = {"nailed_it": 0, "close": 0, "failed": 0, "unknown": 0}
        total = 0

        for row in rows:
            total += 1
            try:
                data = _json.loads(row["data_json"] or "{}")
            except Exception:
                data = {}

            # Product
            plan = (data.get("plan") or data.get("product") or data.get("tier") or "").lower()
            if "pro" in plan:
                by_product["Pro"] += 1
            elif "studio" in plan:
                by_product["Studio"] += 1
            elif "preset" in plan:
                by_product["Presets"] += 1
            elif "core" in plan or "basic" in plan:
                by_product["Core"] += 1
            else:
                by_product["Other"] += 1

            # Outcome at time of upgrade
            outcome = (data.get("outcome") or data.get("shoot_outcome") or "unknown").lower()
            if "nail" in outcome or "match" in outcome:
                by_outcome["nailed_it"] += 1
            elif "close" in outcome or "near" in outcome:
                by_outcome["close"] += 1
            elif "fail" in outcome or "miss" in outcome:
                by_outcome["failed"] += 1
            else:
                by_outcome["unknown"] += 1

        return {
            "total_upgrades":     total,
            "estimated_revenue":  round(total * _AVG_UPGRADE_VALUE_USD, 2),
            "by_product":         by_product,
            "by_outcome":         by_outcome,
            "avg_value_usd":      _AVG_UPGRADE_VALUE_USD,
        }
    except Exception:
        logger.debug("Revenue section failed", exc_info=True)
        return {"total_upgrades": 0, "by_product": {}, "by_outcome": {}}


def _get_experiments() -> List[Dict[str, Any]]:
    """
    Recent experiment impacts from candidate_evaluations + release_attributions
    + monitoring_snapshots. Returns up to 8 entries, newest first.
    """
    try:
        from db.learning import get_release_attributions, get_monitoring_snapshots
        import json as _json

        attributions = get_release_attributions(limit=8)
        experiments  = []

        for attr in attributions:
            snaps = get_monitoring_snapshots(attr["id"])

            # Get the latest monitoring snapshot
            latest_snap = snaps[-1] if snaps else None

            # Parse pre-release baseline
            pre = {}
            try:
                pre = _json.loads(attr.get("pre_release_baseline_json") or "{}")
            except Exception:
                pass

            # Parse expected lift
            expected = {}
            try:
                expected = _json.loads(attr.get("expected_lift_json") or "{}")
            except Exception:
                pass

            experiments.append({
                "id":               attr["id"],
                "candidate_id":     attr.get("candidate_id"),
                "title":            attr.get("release_version") or f"Release {attr['id'][:8]}",
                "release_version":  attr.get("release_version"),
                "release_date":     attr.get("release_date"),
                "source_cluster":   attr.get("source_cluster_id"),
                "status":           "deployed",
                "pre_baseline":     pre,
                "expected_lift":    expected,
                "monitoring": {
                    "has_data":          bool(snaps),
                    "snapshot_count":    len(snaps),
                    "latest_window":     latest_snap.get("window_days") if latest_snap else None,
                    "success_rate_delta": latest_snap.get("success_rate_delta") if latest_snap else None,
                    "conversion_delta":  latest_snap.get("conversion_delta") if latest_snap else None,
                    "confidence_delta":  latest_snap.get("confidence_delta") if latest_snap else None,
                    "alert_type":        latest_snap.get("alert_type") if latest_snap else None,
                } if latest_snap else {"has_data": False},
            })

        return experiments
    except Exception:
        logger.debug("Experiments section failed", exc_info=True)
        return []
