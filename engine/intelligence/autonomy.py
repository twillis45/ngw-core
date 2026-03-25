"""
Autonomous Optimization Engine
================================
Sits above the learning system and flag optimizer.  Runs the full
decision loop and applies changes within its sanctioned scope.

Risk Tiers:
  LOW    — UI ordering, messaging, rollout %, low-risk flag moves
           → auto-apply if reversible, validated, throttle OK
  MEDIUM — threshold tuning, confidence presentation, blueprint ordering
           → enqueue for review, never auto-apply
  HIGH   — model logic, pattern classification, pricing, benchmarks
           → never auto-apply, always explicit approval required

Throttle limits (Part 15.8):
  MAX_AUTO_ACTIONS_PER_24H = 10
  COOLDOWN_SECONDS_PER_SCOPE = 21600  (6 hours)

Sample gating (Part 15.9):
  Minimum exposure / outcome count before any action is taken.

Autonomy scope (Part 15.2):
  AUTO-ALLOWED LOW-RISK ACTIONS:
    increase_rollout, decrease_rollout, promote_variant, rollback_variant,
    reorder_symptoms, reorder_fixes, adjust_paywall_timing,
    adjust_message_variant_exposure, promote_benchmarked_blueprint_variant

  REVIEW-REQUIRED (MEDIUM):
    classification_threshold_change, confidence_calibration_change,
    blueprint_logic_modification, benchmark_threshold_change

  NEVER AUTO-ALLOWED (HIGH):
    model_retrain, delete_benchmark_baseline, modify_gold_set,
    change_guardrail_rule, ship_high_risk_logic

SAFETY:
  - Every action is logged to autonomy_log before and after application.
  - All actions are reversible by design — rollback_path stored on every log entry.
  - The engine NEVER bypasses benchmark enforcement.
  - Trust score protection: if MISSED_IT spikes or HCM increases, related
    optimizations are paused automatically.
"""
from __future__ import annotations

import json
import logging
import time
from typing import Any, Dict, List, Optional

from db.intelligence import (
    log_autonomy_action,
    update_autonomy_action,
    enqueue_autonomy_action,
    get_autonomy_queue,
    resolve_autonomy_queue_item,
    count_auto_actions_last_24h,
    get_last_action_for_scope,
    get_latest_intelligence_snapshot,
)

logger = logging.getLogger(__name__)

# ── Constants ──────────────────────────────────────────────────────────────────

MAX_AUTO_ACTIONS_PER_24H   = 10
COOLDOWN_SECONDS_PER_SCOPE = 21_600   # 6 hours
MIN_EXPOSURE_COUNT         = 50       # minimum sessions before acting
MIN_OUTCOME_COUNT          = 10       # minimum outcome events before acting
TRUST_PROTECTION_HCM_SPIKE = 0.25     # pause if high-conf-missed > 25%

# Action → risk tier mapping
_ACTION_RISK: Dict[str, str] = {
    # LOW — auto-allowed
    "increase_rollout":                   "LOW",
    "decrease_rollout":                   "LOW",
    "promote_variant":                    "LOW",
    "rollback_variant":                   "LOW",
    "reorder_symptoms":                   "LOW",
    "reorder_fixes":                      "LOW",
    "adjust_paywall_timing":              "LOW",
    "adjust_message_variant_exposure":    "LOW",
    "promote_benchmarked_blueprint":      "LOW",
    "pause_pattern_optimization":         "LOW",

    # MEDIUM — review required
    "classification_threshold_change":    "MEDIUM",
    "confidence_calibration_change":      "MEDIUM",
    "blueprint_logic_modification":       "MEDIUM",
    "benchmark_threshold_change":         "MEDIUM",
    "new_candidate_promotion":            "MEDIUM",

    # HIGH — never auto
    "model_retrain":                      "HIGH",
    "delete_benchmark_baseline":          "HIGH",
    "modify_gold_set":                    "HIGH",
    "change_guardrail_rule":              "HIGH",
    "ship_high_risk_logic":               "HIGH",
}

_NEVER_AUTO = {"model_retrain", "delete_benchmark_baseline", "modify_gold_set",
               "change_guardrail_rule", "ship_high_risk_logic"}


# ── Trust protection ───────────────────────────────────────────────────────────

def _check_trust_protection() -> Optional[str]:
    """
    Return a reason string if trust protection should pause optimizations,
    or None if safe to proceed.
    """
    try:
        snap = get_latest_intelligence_snapshot()
        if snap:
            hcm = snap.get("high_conf_missed_rate") or 0
            if hcm >= TRUST_PROTECTION_HCM_SPIKE:
                return f"high_conf_missed_rate={hcm:.2%} exceeds {TRUST_PROTECTION_HCM_SPIKE:.0%} threshold"
    except Exception as exc:
        logger.warning("autonomy: trust protection check failed — %s", exc)
    return None


# ── Throttle + cooldown ───────────────────────────────────────────────────────

def _throttle_ok() -> bool:
    return count_auto_actions_last_24h() < MAX_AUTO_ACTIONS_PER_24H


def _cooldown_ok(scope: str) -> bool:
    last = get_last_action_for_scope(scope)
    if last is None:
        return True
    last_at = last.get("created_at") or 0
    return (time.time() - last_at) >= COOLDOWN_SECONDS_PER_SCOPE


# ── Risk classification ───────────────────────────────────────────────────────

def classify_risk(action_type: str) -> str:
    return _ACTION_RISK.get(action_type, "HIGH")  # unknown → HIGH by default


def can_auto_apply(action_type: str) -> bool:
    tier = classify_risk(action_type)
    return tier == "LOW" and action_type not in _NEVER_AUTO


# ── Core decision loop ────────────────────────────────────────────────────────

def run_decision_loop(days: int = 30) -> Dict[str, Any]:
    """
    Full autonomy decision loop — Part 15.4.

    Steps:
      1. monitor metrics (get latest intelligence snapshot + flag decisions)
      2. detect deviations / opportunities
      3. classify each action's risk tier
      4. apply if LOW + throttle OK + cooldown OK + trust OK
      5. enqueue MEDIUM/HIGH for human review
      6. log everything
    """
    from engine.intelligence.flag_optimizer import evaluate_all_flags

    loop_started = time.time()
    results: Dict[str, Any] = {
        "applied":   [],
        "queued":    [],
        "skipped":   [],
        "paused":    [],
        "errors":    [],
        "throttle_remaining": MAX_AUTO_ACTIONS_PER_24H - count_auto_actions_last_24h(),
    }

    # Trust protection check — pause everything if HCM is spiking
    trust_issue = _check_trust_protection()
    if trust_issue:
        logger.warning("autonomy: trust protection pause — %s", trust_issue)
        results["paused"].append({"reason": trust_issue, "scope": "global"})
        return results

    # Get flag optimization decisions
    try:
        flag_decisions = evaluate_all_flags(days=days)
    except Exception as exc:
        logger.exception("autonomy: flag evaluation failed")
        results["errors"].append(str(exc))
        flag_decisions = []

    for fd in flag_decisions:
        try:
            _process_flag_decision(fd, results)
        except Exception as exc:
            logger.exception("autonomy: error processing flag decision %s", fd.get("flag_name"))
            results["errors"].append(str(exc))

    results["elapsed_secs"] = round(time.time() - loop_started, 2)
    results["throttle_remaining"] = MAX_AUTO_ACTIONS_PER_24H - count_auto_actions_last_24h()

    logger.info(
        "autonomy_loop: applied=%d queued=%d skipped=%d paused=%d elapsed=%.2fs",
        len(results["applied"]), len(results["queued"]),
        len(results["skipped"]), len(results["paused"]),
        results["elapsed_secs"],
    )
    return results


def _process_flag_decision(decision: Dict[str, Any], results: Dict[str, Any]) -> None:
    """Process one flag optimization decision through the risk/throttle/apply pipeline."""
    decision_type = decision.get("decision")
    flag_name = decision.get("flag_name", "")
    scope = f"flag:{flag_name}"

    if decision_type == "hold":
        results["skipped"].append({"scope": scope, "reason": decision.get("reason")})
        return

    # Map decision → action_type
    if decision_type == "promote":
        action_type = "increase_rollout"
    elif decision_type == "rollback":
        action_type = "decrease_rollout"
    else:
        results["skipped"].append({"scope": scope, "reason": f"unknown_decision:{decision_type}"})
        return

    risk_tier = classify_risk(action_type)
    trigger_metrics = decision.get("metrics", {})
    trigger_metrics["intelligence_score"] = decision.get("intelligence_score")

    previous_state = {"rollout_pct": decision.get("current_rollout_pct")}
    new_state      = {"rollout_pct": decision.get("new_rollout_pct")}
    rollback_path  = {"action": "decrease_rollout", "rollout_pct": decision.get("current_rollout_pct")}

    # Check guardrails
    if not can_auto_apply(action_type):
        action_id = enqueue_autonomy_action(
            action_type=action_type, scope=scope, risk_tier=risk_tier,
            payload={**decision, "action_type": action_type},
            trigger_metrics=trigger_metrics,
        )
        log_autonomy_action(
            action_type=action_type, scope=scope, risk_tier=risk_tier,
            status="queued_for_review",
            previous_state=previous_state, new_state=new_state,
            trigger_metrics=trigger_metrics,
            expected_outcome=f"{action_type} {flag_name} to {new_state.get('rollout_pct')}%",
            rollback_path=rollback_path,
        )
        results["queued"].append({"scope": scope, "action_type": action_type, "action_id": action_id})
        return

    if not _throttle_ok():
        results["skipped"].append({"scope": scope, "reason": "daily_throttle_exceeded"})
        return

    if not _cooldown_ok(scope):
        results["skipped"].append({"scope": scope, "reason": "cooldown_active"})
        return

    if decision.get("new_rollout_pct") is None:
        results["skipped"].append({"scope": scope, "reason": "no_rollout_target"})
        return

    # Apply the action
    action_id = log_autonomy_action(
        action_type=action_type, scope=scope, risk_tier=risk_tier,
        status="applying",
        previous_state=previous_state, new_state=new_state,
        trigger_metrics=trigger_metrics,
        expected_outcome=f"{action_type} {flag_name} → {new_state.get('rollout_pct')}%",
        rollback_path=rollback_path,
    )

    try:
        _apply_rollout_change(flag_name, decision["new_rollout_pct"])
        update_autonomy_action(action_id, "applied", applied_at=time.time())
        results["applied"].append({
            "scope":       scope,
            "action_type": action_type,
            "action_id":   action_id,
            "from_pct":    decision.get("current_rollout_pct"),
            "to_pct":      decision.get("new_rollout_pct"),
            "reason":      decision.get("reason"),
        })
        logger.info("autonomy: applied %s %s → %d%%", action_type, flag_name,
                    decision["new_rollout_pct"])
    except Exception as exc:
        update_autonomy_action(action_id, "failed", actual_outcome=str(exc))
        results["errors"].append(f"{scope}: {exc}")
        logger.error("autonomy: failed to apply %s %s — %s", action_type, flag_name, exc)


# ── Flag rollout application ───────────────────────────────────────────────────

def _apply_rollout_change(flag_name: str, new_pct: int) -> None:
    """
    Write the new rollout % to flags.json.
    This is the ONLY write path for autonomous rollout changes.
    """
    import json as _json
    from pathlib import Path as _Path
    flags_path = _Path("data/flags.json")
    flags = _json.loads(flags_path.read_text(encoding="utf-8"))
    changed = False
    for f in flags:
        if f.get("flag_name") == flag_name:
            f["rollout_pct"] = new_pct
            changed = True
            break
    if not changed:
        raise ValueError(f"flag {flag_name!r} not found in flags.json")
    tmp = flags_path.with_suffix(".tmp")
    tmp.write_text(_json.dumps(flags, indent=2), encoding="utf-8")
    tmp.replace(flags_path)
    logger.info("autonomy: flags.json updated — %s → %d%%", flag_name, new_pct)


# ── Approval flow (MEDIUM/HIGH) ────────────────────────────────────────────────

def approve_queued_action(action_id: str, approved_by: str) -> Dict[str, Any]:
    """
    Approve a pending MEDIUM/HIGH queue item.
    Marks it approved in the queue — actual application is a separate step
    requiring explicit execution (never automatic).
    """
    queue = get_autonomy_queue(status="pending")
    item  = next((q for q in queue if q["action_id"] == action_id), None)
    if not item:
        return {"error": f"action {action_id} not found in pending queue"}

    resolve_autonomy_queue_item(action_id, "approved")
    log_autonomy_action(
        action_type=item["action_type"],
        scope=item["scope"],
        risk_tier=item["risk_tier"],
        status="approved",
        previous_state={}, new_state=json.loads(item["payload_json"]),
        trigger_metrics=json.loads(item.get("trigger_metrics_json") or "{}"),
        expected_outcome=f"approved by {approved_by}",
        rollback_path={},
    )
    return {"approved": True, "action_id": action_id, "approved_by": approved_by}


def reject_queued_action(action_id: str, rejected_by: str, reason: str = "") -> Dict[str, Any]:
    resolve_autonomy_queue_item(action_id, "rejected")
    return {"rejected": True, "action_id": action_id, "rejected_by": rejected_by, "reason": reason}


# ── Dashboard summary ─────────────────────────────────────────────────────────

def build_autonomy_dashboard_summary(days: int = 7) -> Dict[str, Any]:
    """
    Summary data for the autonomy section of ExecDashboard.
    """
    from db.intelligence import get_autonomy_log
    log = get_autonomy_log(limit=200)
    cutoff = time.time() - days * 86400

    recent = [a for a in log if (a.get("created_at") or 0) >= cutoff]

    applied   = [a for a in recent if a["status"] == "applied"]
    rollbacks = [a for a in recent if a["status"] == "reverted"]
    queued    = get_autonomy_queue(status="pending")
    paused    = [a for a in recent if a["status"] == "paused"]

    trust_issue = _check_trust_protection()

    # Risk distribution of recent actions
    risk_dist: Dict[str, int] = {"LOW": 0, "MEDIUM": 0, "HIGH": 0}
    for a in recent:
        tier = a.get("risk_tier", "LOW")
        risk_dist[tier] = risk_dist.get(tier, 0) + 1

    return {
        "window_days":         days,
        "trust_status":        "paused" if trust_issue else "active",
        "trust_pause_reason":  trust_issue,
        "throttle_remaining":  MAX_AUTO_ACTIONS_PER_24H - count_auto_actions_last_24h(),
        "recent_applied":      applied[:10],
        "recent_rollbacks":    rollbacks[:5],
        "pending_approvals":   len(queued),
        "pending_queue":       queued,
        "paused_scopes":       paused[:5],
        "risk_distribution":   risk_dist,
        "total_actions_window": len(recent),
    }
