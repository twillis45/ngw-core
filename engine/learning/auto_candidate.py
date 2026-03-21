"""
Auto-Candidate Generation
==========================
Converts failure clusters into structured rule_candidate proposals.

For each meaningful cluster, this module generates a candidate record in
`rule_candidates` with:
  - typed candidate_type
  - evidence-backed description and rationale
  - structured proposed_change dict
  - estimated_success_lift and estimated_regression_risk hints

SAFETY RULES:
  - Generated candidates start in status='proposed' — NEVER 'accepted'
  - No candidate is auto-accepted or auto-implemented
  - The cluster's candidate_id is set only after successful generation
  - All changes require human review via the LAB Candidates UI
"""
from __future__ import annotations

import json
import logging
import time
from typing import Any, Dict, Optional

from db.database import create_rule_candidate, get_rule_candidate
from db.learning import (
    get_failure_cluster,
    get_failure_clusters,
    update_failure_cluster,
)

logger = logging.getLogger(__name__)

# ── Candidate type mapping ──────────────────────────────────────────────────────

_FAILURE_TO_CANDIDATE_TYPE: Dict[str, str] = {
    "conversion_gap":       "blueprint_correction",
    "confidence_mismatch":  "confidence_recalibration",
    "step_deviation":       "shoot_mode_step_fix",
    "pattern_drift":        "dataset_promotion",
    "trust_gap":            "trust_safety",
    # Produced by scripts/ingest_soft_pass.py — recurring benchmark confusions
    "pattern_boundary":     "blueprint_correction",
}

# Severity → estimated regression risk label
_SEVERITY_TO_RISK: Dict[str, str] = {
    "critical": "medium",   # high-frequency changes carry regression risk
    "high":     "medium",
    "medium":   "low",
    "low":      "low",
}


def generate_candidate_for_cluster(
    cluster_id: str,
    created_by: str = "system:auto",
) -> Optional[Dict[str, Any]]:
    """
    Generate a single rule_candidate from a failure cluster.

    Returns the new candidate dict, or None if the cluster is not eligible
    (already has a candidate, is resolved/dismissed, or severity is too low).
    """
    cluster = get_failure_cluster(cluster_id)
    if cluster is None:
        logger.warning("auto_candidate: cluster %s not found", cluster_id)
        return None

    if cluster.get("candidate_id"):
        logger.info("auto_candidate: cluster %s already has candidate %s", cluster_id, cluster["candidate_id"])
        return get_rule_candidate(cluster["candidate_id"])

    if cluster.get("status") in ("resolved", "dismissed"):
        logger.info("auto_candidate: cluster %s is %s — skipping", cluster_id, cluster["status"])
        return None

    if cluster.get("severity") == "low" and cluster.get("frequency", 0) < 10:
        logger.info("auto_candidate: cluster %s is low-severity with low frequency — skipping", cluster_id)
        return None

    failure_mode = cluster.get("failure_mode", "unknown")
    candidate_type = _FAILURE_TO_CANDIDATE_TYPE.get(failure_mode, "blueprint_correction")
    evidence = cluster.get("evidence", {})
    pattern_id = cluster.get("pattern_id")
    severity = cluster.get("severity", "medium")

    title, description, rationale, proposed_change = _build_candidate_content(
        failure_mode=failure_mode,
        candidate_type=candidate_type,
        pattern_id=pattern_id,
        evidence=evidence,
        cluster=cluster,
    )

    estimated_success_lift = _estimate_lift(failure_mode, evidence)
    regression_risk = _SEVERITY_TO_RISK.get(severity, "medium")

    proposed_change["_meta"] = {
        "candidate_type": candidate_type,
        "auto_generated": True,
        "source_cluster_id": cluster_id,
        "failure_mode": failure_mode,
        "estimated_success_lift": estimated_success_lift,
        "estimated_regression_risk": regression_risk,
        "generated_at": time.time(),
    }

    try:
        candidate = create_rule_candidate(
            title=title,
            description=description,
            rationale=rationale,
            source_gold_set_id=None,
            proposed_change=proposed_change,
            status="proposed",
            created_by=created_by,
        )
    except Exception as exc:
        logger.exception("auto_candidate: failed to create candidate for cluster %s", cluster_id)
        return None

    # Link cluster → candidate
    update_failure_cluster(
        cluster_id,
        candidate_id=candidate["id"],
        status="investigating",
    )

    logger.info(
        "auto_candidate: created candidate %s (%s) for cluster %s [%s/%s]",
        candidate["id"], candidate_type, cluster_id, failure_mode, severity,
    )
    return candidate


def generate_candidates_for_open_clusters(
    min_severity: str = "medium",
    created_by: str = "system:auto",
) -> Dict[str, Any]:
    """
    Sweep all open clusters at or above `min_severity` and generate candidates.

    Returns a summary dict with counts and candidate IDs.
    """
    severity_order = {"low": 0, "medium": 1, "high": 2, "critical": 3}
    min_level = severity_order.get(min_severity, 1)

    clusters = get_failure_clusters(status="open")
    eligible = [
        c for c in clusters
        if severity_order.get(c.get("severity", "low"), 0) >= min_level
        and not c.get("candidate_id")
    ]

    generated = []
    skipped = []
    errors = []

    for cluster in eligible:
        try:
            candidate = generate_candidate_for_cluster(
                cluster_id=cluster["id"],
                created_by=created_by,
            )
            if candidate:
                generated.append({
                    "cluster_id": cluster["id"],
                    "candidate_id": candidate["id"],
                    "failure_mode": cluster.get("failure_mode"),
                    "severity": cluster.get("severity"),
                })
            else:
                skipped.append(cluster["id"])
        except Exception as exc:
            logger.exception("auto_candidate sweep: error on cluster %s", cluster["id"])
            errors.append({"cluster_id": cluster["id"], "error": str(exc)})

    return {
        "eligible_clusters": len(eligible),
        "generated": len(generated),
        "skipped": len(skipped),
        "errors": len(errors),
        "candidates": generated,
        "error_details": errors,
    }


# ── Content builders ────────────────────────────────────────────────────────────

def _build_candidate_content(
    failure_mode: str,
    candidate_type: str,
    pattern_id: Optional[str],
    evidence: Dict[str, Any],
    cluster: Dict[str, Any],
) -> tuple:
    """Return (title, description, rationale, proposed_change) for a candidate."""

    pat_label = f"'{pattern_id}'" if pattern_id else "global"
    freq = cluster.get("frequency", 0)
    severity = cluster.get("severity", "medium")

    if failure_mode == "conversion_gap":
        cvr = evidence.get("conversion_rate_pct", 0)
        ac = evidence.get("analysis_count", freq)
        uc = evidence.get("upgrade_count", 0)
        env_label = cluster.get("environment")
        env_context = f" specifically in {env_label} environments" if env_label else ""
        title = f"[Auto] Conversion gap — {pat_label} pattern ({ac} analyses, {cvr}% CVR)"
        description = (
            f"Pattern {pat_label} has been detected in {ac} analyses{env_context} but yielded only "
            f"{uc} upgrade(s) ({cvr}% CVR). This suggests the engine may be over-diagnosing "
            f"this pattern in contexts where users cannot act on the recommendation, or "
            f"the blueprint output for this pattern needs clearer actionability."
        )
        rationale = (
            f"A {severity}-severity conversion gap was detected over {cluster.get('affected_sessions', ac)} "
            f"sessions. Possible fixes: tighten detection threshold, add a 'confidence gate' "
            f"before showing this pattern, or improve blueprint copy for actionability."
        )
        proposed_change = {
            "type": "blueprint_correction",
            "pattern_id": pattern_id,
            "action": "review_detection_threshold",
            "current_cvr": cvr,
            "target_cvr_min": evidence.get("threshold_used", 1.0),
            "review_areas": ["detection_threshold", "blueprint_copy", "confidence_gate"],
        }

    elif failure_mode == "confidence_mismatch":
        cvr = evidence.get("conversion_rate_pct", 0)
        z_score = evidence.get("z_score", 0)
        fleet_mean = evidence.get("fleet_mean_cvr", 0)
        env_label = cluster.get("environment")
        env_context = f" in {env_label} environments" if env_label else ""
        title = f"[Auto] Confidence recalibration — {pat_label}{' (' + env_label + ')' if env_label else ''} (z={z_score}σ below fleet)"
        description = (
            f"Pattern {pat_label}{env_context} converts at {cvr}% — {abs(z_score)}σ below the fleet mean "
            f"of {fleet_mean}%. The engine may be reporting high confidence for detections "
            f"that do not lead to user success. Confidence scoring needs recalibration "
            f"for this pattern to reduce false expectations."
        )
        rationale = (
            f"Statistical outlier detected: this pattern's CVR is {abs(z_score)} standard "
            f"deviations below the mean. Recalibrating confidence output to better reflect "
            f"actual user success rates for this pattern."
        )
        proposed_change = {
            "type": "confidence_recalibration",
            "pattern_id": pattern_id,
            "action": "reduce_confidence_floor",
            "current_cvr": cvr,
            "fleet_mean_cvr": fleet_mean,
            "z_score": z_score,
            "suggested_confidence_adjustment": "investigate_floor",
        }

    elif failure_mode == "step_deviation":
        match_rate = evidence.get("match_rate_pct", 0)
        sessions = evidence.get("sessions_started", freq)
        avg_steps = evidence.get("avg_steps_completed")
        title = f"[Auto] Shoot mode step failure — {match_rate}% match rate ({sessions} sessions)"
        description = (
            f"Global shoot mode match rate is {match_rate}% — users are starting guided "
            f"sessions but not completing them. "
            + (f"Average steps completed: {avg_steps}. " if avg_steps else "")
            + "Step instructions may be imprecise, require hardware users don't have, "
            f"or the progression logic is not well-calibrated."
        )
        rationale = (
            f"A match rate of {match_rate}% across {sessions} shoot mode sessions is below "
            f"the {evidence.get('threshold_used', 30)}% threshold. Reviewing and improving "
            f"step instructions is expected to increase match completion and session quality."
        )
        proposed_change = {
            "type": "shoot_mode_step_fix",
            "pattern_id": pattern_id,
            "action": "audit_step_instructions",
            "current_match_rate_pct": match_rate,
            "sessions_analyzed": sessions,
            "avg_steps_completed": avg_steps,
            "review_areas": ["step_wording", "step_sequence", "hardware_assumptions", "exit_criteria"],
        }

    elif failure_mode == "pattern_drift":
        decline = evidence.get("decline_pct", 0)
        first_avg = evidence.get("first_half_daily_avg", 0)
        second_avg = evidence.get("second_half_daily_avg", 0)
        title = f"[Auto] Analysis volume drift — {decline}% decline over {evidence.get('trend_days', 30)}d"
        description = (
            f"Overall analysis volume has declined {decline}% in the recent period "
            f"(from {first_avg}/day to {second_avg}/day). This may reflect upstream "
            f"routing changes, VLM classification drift, or a shift in user upload patterns. "
            f"The reference dataset may need promotion of new exemplars."
        )
        rationale = (
            f"A {decline}% volume decline suggests the engine's pattern distribution is "
            f"shifting. Promoting recent high-quality sessions to the reference dataset "
            f"may recalibrate pattern detection toward current user behavior."
        )
        proposed_change = {
            "type": "dataset_promotion",
            "pattern_id": pattern_id,
            "action": "promote_recent_sessions_to_reference",
            "decline_pct": decline,
            "first_half_daily_avg": first_avg,
            "second_half_daily_avg": second_avg,
            "review_areas": ["reference_dataset_freshness", "recent_session_quality"],
        }

    elif failure_mode == "pattern_boundary":
        # Produced by ingest_soft_pass.py — recurring (expected → detected) SOFT_PASS confusion
        detected_pat = evidence.get("detected_pattern", "unknown")
        run_count = evidence.get("run_count", freq)
        hit_count = evidence.get("hit_count", freq)
        avg_conf = evidence.get("avg_confidence")
        bids = evidence.get("benchmark_ids", [])
        bid_sample = ", ".join(bids[:3]) + (f" +{len(bids)-3} more" if len(bids) > 3 else "")
        conf_note = f" (avg confidence: {avg_conf})" if avg_conf is not None else ""
        top_ec = evidence.get("top_edge_cases", {})
        ec_note = f"  Edge cases present: {list(top_ec.keys())}." if top_ec else ""
        top_amb = evidence.get("top_ambiguity_flags", {})
        amb_note = f"  Ambiguity flags: {list(top_amb.keys())}." if top_amb else ""

        title = (
            f"[Auto] Pattern boundary — {pat_label} detected as '{detected_pat}' "
            f"in {run_count} run(s)"
        )
        description = (
            f"Benchmark images labelled as '{pattern_id}' are consistently detected as "
            f"'{detected_pat}' (SOFT_PASS){conf_note} across {run_count} benchmark run(s) "
            f"({hit_count} hit(s)).{ec_note}{amb_note}\n\n"
            f"Affected benchmarks: {bid_sample}.\n\n"
            f"The engine is selecting a valid acceptable pattern but not the primary expected "
            f"one. This indicates the classification boundary between '{pattern_id}' and "
            f"'{detected_pat}' needs calibration."
        )
        rationale = (
            f"Recurring SOFT_PASS (not FAIL) means the engine is in the right neighbourhood "
            f"but consistently prefers '{detected_pat}' over '{pattern_id}' for these images. "
            f"Options: (a) tighten detection criteria for '{detected_pat}' in contexts where "
            f"'{pattern_id}' cues are present, (b) add distinguishing signal weights, or "
            f"(c) if the ground truth is ambiguous, promote '{detected_pat}' to the expected "
            f"pattern for these specific benchmark images."
        )
        proposed_change = {
            "type": "blueprint_correction",
            "pattern_id": pattern_id,
            "confused_with": detected_pat,
            "action": "review_pattern_boundary",
            "run_count": run_count,
            "hit_count": hit_count,
            "avg_confidence": avg_conf,
            "affected_benchmarks": bids,
            "top_edge_cases": top_ec,
            "top_ambiguity_flags": top_amb,
            "review_areas": [
                "boundary_detection_signals",
                "classifier_weight_for_confused_pair",
                "ground_truth_accuracy",
                "acceptable_patterns_list",
            ],
        }

    else:  # trust_gap
        lift = evidence.get("lift_pct", 0)
        matched_rate = evidence.get("matched_conversion_rate_pct", 0)
        unmatched_rate = evidence.get("not_matched_conversion_rate_pct", 0)
        title = f"[Auto] Trust gap — matched sessions convert at {matched_rate}% vs {unmatched_rate}% unmatched"
        description = (
            f"Sessions that achieve a match convert at {matched_rate}% — {abs(lift)}pp "
            f"{'lower' if lift < 0 else 'higher'} than unmatched sessions ({unmatched_rate}%). "
            f"The engine is delivering match completions that are not translating into upgrades. "
            f"This may indicate the match quality feels unsatisfying, the post-match CTA "
            f"is poorly positioned, or match results don't show clear value."
        )
        rationale = (
            f"Negative match→upgrade lift ({lift}pp) is a trust and value signal failure. "
            f"Investigating post-match experience, CTA positioning, and match result "
            f"clarity is expected to improve the conversion rate for matched sessions."
        )
        proposed_change = {
            "type": "trust_safety",
            "pattern_id": pattern_id,
            "action": "improve_post_match_conversion",
            "matched_cvr": matched_rate,
            "unmatched_cvr": unmatched_rate,
            "lift_pct": lift,
            "review_areas": ["post_match_cta", "match_result_clarity", "value_communication"],
        }

    return title, description, rationale, proposed_change


def _estimate_lift(failure_mode: str, evidence: Dict[str, Any]) -> str:
    """Return a human-readable estimated lift range for this failure mode."""
    if failure_mode == "conversion_gap":
        cvr = evidence.get("conversion_rate_pct", 0)
        return f"+{round(max(1, 5 - cvr), 1)}-{round(max(2, 10 - cvr), 1)}pp CVR"
    if failure_mode == "confidence_mismatch":
        z = abs(evidence.get("z_score", 1))
        return f"+{round(z * 0.5, 1)}-{round(z * 1.5, 1)}pp CVR (calibration)"
    if failure_mode == "step_deviation":
        mr = evidence.get("match_rate_pct", 0)
        return f"+{round((50 - mr) * 0.3, 1)}-{round((50 - mr) * 0.6, 1)}pp match rate"
    if failure_mode == "pattern_drift":
        return "+5-15% analysis volume recovery"
    if failure_mode == "trust_gap":
        lift = abs(evidence.get("lift_pct", 2))
        return f"+{round(lift * 0.5, 1)}-{round(lift * 1.2, 1)}pp matched-session CVR"
    return "unknown"
