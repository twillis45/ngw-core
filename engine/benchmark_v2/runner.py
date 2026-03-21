"""
Benchmark System v2 — Runner and Regression Detection.

Orchestrates a full benchmark run:
  1. Load all benchmark cases from DB
  2. Run each case through the analysis pipeline
  3. Score each case (4 dimensions)
  4. Detect regressions against the previous run
  5. Auto-create rule candidates for critical regressions
  6. Update pattern_metrics table
  7. Return structured results with insights

Regression rules (hard-coded per spec):
  overall drop > 3%    → warning flag
  any pattern drop > 5% → critical block (status = 'blocked')
  confidence_error > 0.25 → alert
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# ── Thresholds ────────────────────────────────────────────────────────────────

OVERALL_REGRESSION_THRESHOLD  = 0.03   # 3%
PATTERN_REGRESSION_THRESHOLD  = 0.05   # 5%
CONFIDENCE_ERROR_ALERT        = 0.25
PASS_THRESHOLD                = 0.70   # score >= 0.70 = pass


# ── Main entry point ─────────────────────────────────────────────────────────

def run_benchmark(
    run_type: str = "manual",
    trigger: str = "manual",
    triggered_by: Optional[str] = None,
    case_limit: Optional[int] = None,
    notes: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Execute a complete benchmark run.
    Returns a structured results dict including regressions and insights.
    """
    from db.benchmark import (
        create_benchmark_run, complete_benchmark_run,
        get_benchmark_cases, get_recent_completed_run,
        get_previous_pattern_scores, upsert_pattern_metric,
        get_last_n_run_scores,
    )
    from engine.benchmark_v2.fix_signals import get_fix_success_rates

    # 1. Create run record
    run = create_benchmark_run(
        run_type=run_type, trigger=trigger,
        triggered_by=triggered_by, notes=notes,
    )
    run_id = run["id"]
    logger.info("Benchmark run %s started (%s cases limit=%s)", run_id, run_type, case_limit)

    # 2. Load cases
    cases = get_benchmark_cases(limit=case_limit or 500)
    if not cases:
        complete_benchmark_run(run_id, 0.0, 0.0, 0.0, 0.0, 0, 0, 0, status="completed_empty")
        return _empty_result(run_id, "No benchmark cases found. Create cases via POST /api/lab/benchmarks/cases.")

    # 3. Load fix success rates (once, shared across all cases)
    fix_rates = get_fix_success_rates()

    # 4. Load previous run for regression comparison
    prev_run     = get_recent_completed_run(exclude_run_id=run_id)
    prev_overall = prev_run["overall_score"] if prev_run else None
    prev_pattern = get_previous_pattern_scores(run_id)

    # 5. Run and score each case
    per_case: List[Dict[str, Any]] = []
    for case in cases:
        per_case.append(_run_single_case(case, run_id, fix_rates))

    # 6. Aggregate
    valid = [r for r in per_case if not r.get("error")]
    total = len(cases)
    scored = len(valid)

    if scored == 0:
        complete_benchmark_run(run_id, 0.0, 0.0, 0.0, 0.0, total, 0, 0, status="failed")
        return _empty_result(run_id, "All cases errored during pipeline execution.", status="failed")

    overall_score       = sum(r["final_score"]      for r in valid) / scored
    pattern_accuracy    = sum(1 for r in valid if r["pattern_correct"]) / scored
    avg_blueprint_score = sum(r["blueprint_score"]  for r in valid) / scored
    avg_conf_error      = sum(abs(r["confidence_error"]) for r in valid) / scored

    # 7. Per-pattern aggregates
    pattern_agg: Dict[str, List[float]] = {}
    for r in valid:
        pattern_agg.setdefault(r["pattern_id"], []).append(r["final_score"])

    per_pattern_avg = {
        pid: sum(scores) / len(scores)
        for pid, scores in pattern_agg.items()
    }

    # 8. Regression detection
    regressions, blocked = _detect_regressions(
        run_id, overall_score, prev_overall, per_pattern_avg, prev_pattern, avg_conf_error
    )

    # 9. Handle regressions (mark flags + auto-create candidates)
    if regressions:
        _handle_regressions(run_id, regressions, per_case, triggered_by)

    # 10. Update pattern_metrics table
    _update_pattern_metrics(valid, pattern_agg, per_pattern_avg)

    # 11. Historical trend (last 5 runs including this one)
    trend = get_last_n_run_scores(5)
    if not trend or trend[0] != overall_score:
        trend = [overall_score] + trend[:4]

    # 12. Finalise run record
    passed = sum(1 for r in valid if r["final_score"] >= PASS_THRESHOLD)
    run_status = "blocked" if blocked else "completed"
    complete_benchmark_run(
        run_id,
        overall_score=overall_score,
        pattern_accuracy=pattern_accuracy,
        avg_blueprint_score=avg_blueprint_score,
        confidence_error=avg_conf_error,
        total_cases=total,
        passed_cases=passed,
        regression_count=len(regressions),
        status=run_status,
    )

    logger.info(
        "Run %s complete: score=%.3f accuracy=%.2f regressions=%d status=%s",
        run_id, overall_score, pattern_accuracy, len(regressions), run_status
    )

    return {
        "run_id":             run_id,
        "status":             run_status,
        "overall_score":      round(overall_score, 4),
        "pattern_accuracy":   round(pattern_accuracy, 4),
        "avg_blueprint_score": round(avg_blueprint_score, 4),
        "confidence_error":   round(avg_conf_error, 4),
        "total_cases":        total,
        "passed_cases":       passed,
        "regression_count":   len(regressions),
        "regressions":        regressions,
        "blocked":            blocked,
        "per_pattern":        {k: round(v, 4) for k, v in per_pattern_avg.items()},
        "trend":              [round(s, 4) for s in trend],
        "insights":           _generate_insights(valid, per_case),
    }


# ── Single-case execution ─────────────────────────────────────────────────────

def _run_single_case(
    case: Dict[str, Any],
    run_id: str,
    fix_rates: Dict[str, float],
) -> Dict[str, Any]:
    from db.benchmark import save_benchmark_result
    from engine.benchmark_v2.scoring import (
        extract_predicted_pattern, extract_predicted_blueprint,
        extract_predicted_confidence,
        score_pattern, score_blueprint, score_fix_effectiveness,
        score_confidence, compute_final_score,
    )

    case_id    = case["id"]
    pattern_id = case["pattern_id"]
    image_path = case["image_path"]
    exp_bp     = case.get("expected_blueprint") or {}
    exp_an     = case.get("expected_analysis") or {}
    exp_pat    = exp_an.get("lighting_family") or exp_an.get("expected_pattern") or pattern_id

    try:
        analysis = _run_pipeline(image_path)

        pred_pattern    = extract_predicted_pattern(analysis)
        pred_blueprint  = extract_predicted_blueprint(analysis)
        pred_confidence = extract_predicted_confidence(analysis)

        pat_score  = score_pattern(exp_pat, pred_pattern)
        bp_score   = score_blueprint(exp_bp, pred_blueprint)
        fix_score  = score_fix_effectiveness(pattern_id, fix_rates)

        # Use live success rate as proxy for actual outcome (falls back to pat_score)
        actual_rate = fix_rates.get(f"{pattern_id}:success_rate", pat_score)
        conf_score, conf_error = score_confidence(pred_confidence, actual_rate)

        final_score = compute_final_score(pat_score, bp_score, fix_score, conf_score)

        save_benchmark_result(
            run_id=run_id, case_id=case_id,
            predicted_pattern=pred_pattern,
            pattern_correct=(pat_score == 1.0),
            blueprint_score=bp_score, fix_score=fix_score,
            confidence_score=conf_score, confidence_error=conf_error,
            final_score=final_score,
            analysis_snapshot={
                "predicted_pattern": pred_pattern,
                "predicted_blueprint": pred_blueprint,
                "predicted_confidence": pred_confidence,
            },
        )

        return {
            "case_id":         case_id,
            "pattern_id":      pattern_id,
            "image_path":      image_path,
            "predicted_pattern": pred_pattern,
            "pattern_correct": pat_score == 1.0,
            "blueprint_score": bp_score,
            "fix_score":       fix_score,
            "confidence_score": conf_score,
            "confidence_error": conf_error,
            "final_score":     final_score,
            "expected_pattern": exp_pat,
        }

    except Exception as exc:
        logger.error("Case %s (%s) failed: %s", case_id, image_path, exc)
        try:
            save_benchmark_result(
                run_id=run_id, case_id=case_id,
                predicted_pattern=None, pattern_correct=False,
                blueprint_score=0.0, fix_score=0.0,
                confidence_score=0.0, confidence_error=0.0,
                final_score=0.0, error_msg=str(exc),
            )
        except Exception:
            pass

        return {
            "case_id": case_id, "pattern_id": pattern_id,
            "image_path": image_path, "error": str(exc),
            "final_score": 0.0, "pattern_correct": False,
            "blueprint_score": 0.0, "fix_score": 0.0,
            "confidence_score": 0.0, "confidence_error": 0.0,
        }


def _run_pipeline(image_path: str) -> Dict[str, Any]:
    """Resolve path and run the full analysis pipeline."""
    path = Path(image_path)
    if not path.is_absolute():
        candidates = [
            path,
            Path("data") / path,
            Path("data/uploads/lab") / path.name,
            Path("data/reference_dataset") / path,
        ]
        for c in candidates:
            if c.exists():
                path = c
                break

    if not path.exists():
        raise FileNotFoundError(f"Image not found: {image_path}")

    # Lazy import to avoid circular dependencies at module load time
    from engine.orchestrator import analyze_image

    result = analyze_image(str(path), run_extended=True, run_vlm=False, debug=False)
    if not result.ok:
        raise RuntimeError(f"Pipeline not-ok: {result.description}")

    # Attempt dataclass serialisation; fallback to attribute extraction
    try:
        from dataclasses import asdict
        return asdict(result)
    except Exception:
        return {
            "reference_analysis": getattr(result, "reference_analysis", {}),
            "classification":     getattr(result, "classification", {}),
            "lighting_intel":     getattr(result, "lighting_intel", {}),
            "solver":             getattr(result, "solver_result", {}),
            "cv":                 getattr(result, "vision_data", {}),
            "vlm_reconstruction": getattr(result, "vlm_reconstruction", {}),
        }


# ── Regression detection ──────────────────────────────────────────────────────

def _detect_regressions(
    run_id: str,
    overall_score: float,
    prev_overall: Optional[float],
    per_pattern_avg: Dict[str, float],
    prev_pattern: Dict[str, float],
    avg_conf_error: float,
) -> tuple[List[Dict[str, Any]], bool]:
    regressions: List[Dict[str, Any]] = []
    blocked = False

    # Global drop
    if prev_overall is not None:
        drop = prev_overall - overall_score
        if drop > OVERALL_REGRESSION_THRESHOLD:
            regressions.append({
                "type": "global", "severity": "warning",
                "message": (
                    f"Overall score dropped {drop:.1%} "
                    f"({prev_overall:.3f} → {overall_score:.3f})"
                ),
                "previous_score": prev_overall,
                "current_score":  overall_score,
                "delta": -drop,
            })

    # Per-pattern drop (critical — blocks deployment)
    for pid, avg in per_pattern_avg.items():
        prev = prev_pattern.get(pid)
        if prev is None:
            continue
        drop = prev - avg
        if drop > PATTERN_REGRESSION_THRESHOLD:
            blocked = True
            regressions.append({
                "type": "pattern", "severity": "critical",
                "pattern_id": pid,
                "message": (
                    f"Pattern '{pid}' dropped {drop:.1%} "
                    f"({prev:.3f} → {avg:.3f})"
                ),
                "previous_score": prev,
                "current_score":  avg,
                "delta": -drop,
            })

    # Confidence alert
    if avg_conf_error > CONFIDENCE_ERROR_ALERT:
        regressions.append({
            "type": "confidence", "severity": "alert",
            "message": (
                f"Confidence error {avg_conf_error:.3f} "
                f"exceeds threshold {CONFIDENCE_ERROR_ALERT:.2f}"
            ),
            "confidence_error": avg_conf_error,
        })

    return regressions, blocked


def _handle_regressions(
    run_id: str,
    regressions: List[Dict[str, Any]],
    per_case: List[Dict[str, Any]],
    triggered_by: Optional[str],
) -> None:
    """Mark regression results and auto-create rule candidates."""
    from db.database import create_rule_candidate, get_db

    critical_patterns = {
        r["pattern_id"] for r in regressions if r.get("type") == "pattern"
    }

    # Mark affected results
    if critical_patterns:
        with get_db() as conn:
            for case_result in per_case:
                if case_result.get("pattern_id") in critical_patterns:
                    conn.execute(
                        "UPDATE benchmark_results SET regression_flag = 1 "
                        "WHERE run_id = ? AND case_id = ?",
                        (run_id, case_result["case_id"]),
                    )

    # Auto-create candidates for each pattern regression
    for reg in regressions:
        if reg.get("type") != "pattern":
            continue
        pid = reg.get("pattern_id", "unknown")
        try:
            create_rule_candidate(
                title=f"Benchmark Regression — {pid}",
                description=(
                    f"Pattern '{pid}' score dropped from {reg['previous_score']:.3f} "
                    f"to {reg['current_score']:.3f} ({reg['delta']:.1%}). "
                    f"Auto-flagged by Benchmark System v2, run {run_id}."
                ),
                rationale="benchmark_regression",
                proposed_change={
                    "status":         "needs_investigation",
                    "reason":         "benchmark_regression",
                    "pattern_id":     pid,
                    "previous_score": reg["previous_score"],
                    "current_score":  reg["current_score"],
                    "run_id":         run_id,
                },
                status="proposed",
                created_by=triggered_by or "benchmark_runner",
            )
            logger.info("Auto-created regression candidate for pattern '%s'", pid)
        except Exception as exc:
            logger.warning("Could not create candidate for %s: %s", pid, exc)


# ── Pattern metrics update ────────────────────────────────────────────────────

def _update_pattern_metrics(
    valid: List[Dict[str, Any]],
    pattern_agg: Dict[str, List[float]],
    per_pattern_avg: Dict[str, float],
) -> None:
    from db.benchmark import upsert_pattern_metric

    for pid, avg_score in per_pattern_avg.items():
        cases = [r for r in valid if r["pattern_id"] == pid]
        if not cases:
            continue
        live_rate  = sum(1 for r in cases if r["pattern_correct"]) / len(cases)
        conf_error = sum(abs(r["confidence_error"]) for r in cases) / len(cases)
        try:
            upsert_pattern_metric(
                pattern_id=pid,
                benchmark_score=avg_score,
                live_success_rate=live_rate,
                confidence_error=conf_error,
            )
        except Exception as exc:
            logger.warning("Could not update pattern_metrics for %s: %s", pid, exc)


# ── Insights generator ────────────────────────────────────────────────────────

def _generate_insights(
    valid: List[Dict[str, Any]],
    all_results: List[Dict[str, Any]],
) -> List[str]:
    """Auto-generate actionable, human-readable failure insights."""
    if not valid:
        return ["No valid results to analyse."]

    insights: List[str] = []

    # Pattern misclassification rates
    pattern_totals:   Dict[str, int] = {}
    pattern_failures: Dict[str, int] = {}
    for r in valid:
        pid = r.get("pattern_id", "unknown")
        pattern_totals[pid]   = pattern_totals.get(pid, 0) + 1
        if not r.get("pattern_correct"):
            pattern_failures[pid] = pattern_failures.get(pid, 0) + 1

    for pid, fails in sorted(pattern_failures.items(), key=lambda x: -x[1]):
        total = pattern_totals.get(pid, 1)
        pct   = fails / total
        if pct >= 0.5:
            insights.append(
                f"'{pid}' misclassified in {fails}/{total} cases ({pct:.0%})"
            )

    # Low blueprint accuracy
    low_bp = [r for r in valid if r.get("blueprint_score", 1.0) < 0.4]
    if low_bp:
        patterns = list({r["pattern_id"] for r in low_bp})[:3]
        insights.append(
            f"Blueprint accuracy below 40% in {len(low_bp)} cases "
            f"(patterns: {', '.join(patterns)})"
        )

    # Confidence calibration drift
    conf_errors = [r.get("confidence_error", 0.0) for r in valid]
    over  = [e for e in conf_errors if e > 0.15]
    under = [e for e in conf_errors if e < -0.15]
    if len(over) > len(valid) * 0.3:
        insights.append(
            f"Over-confident in {len(over)} cases "
            f"(avg error +{sum(over)/len(over):.2f})"
        )
    if len(under) > len(valid) * 0.3:
        insights.append(
            f"Under-confident in {len(under)} cases "
            f"(avg error {sum(under)/len(under):.2f})"
        )

    # Fix score gaps
    low_fix = [r for r in valid if r.get("fix_score", 1.0) < 0.3]
    if low_fix:
        fix_pats = list({r["pattern_id"] for r in low_fix})[:3]
        insights.append(
            f"Fix effectiveness low for: {', '.join(fix_pats)} — "
            f"update Shoot Mode guidance"
        )

    # Error cases
    errors = [r for r in all_results if r.get("error")]
    if errors:
        insights.append(f"{len(errors)} case(s) failed pipeline execution — check image paths")

    # Learning integration hints
    for r in valid:
        if r.get("blueprint_score", 1.0) < 0.5:
            insights.append(
                f"Blueprint corrections needed for '{r['pattern_id']}' — "
                f"consider proposing updated blueprint spec"
            )
            break  # one hint per run is enough

    if not insights:
        insights.append("No significant failure patterns detected in this run.")

    return insights[:8]  # cap at 8 to avoid dashboard overflow


# ── Utility ───────────────────────────────────────────────────────────────────

def _empty_result(run_id: str, message: str, status: str = "completed_empty") -> Dict[str, Any]:
    return {
        "run_id": run_id, "status": status, "message": message,
        "overall_score": 0.0, "pattern_accuracy": 0.0,
        "avg_blueprint_score": 0.0, "confidence_error": 0.0,
        "total_cases": 0, "passed_cases": 0,
        "regression_count": 0, "regressions": [],
        "blocked": False, "per_pattern": {}, "trend": [], "insights": [],
    }
