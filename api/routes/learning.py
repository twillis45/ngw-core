"""
Learning Ops API — /api/lab/learning/*
========================================
Surfaces the closed-loop learning system to the LAB UI.

All endpoints are protected by the same dev-user whitelist as the rest of LAB.

Endpoints
---------
GET  /lab/learning/ops            — learning ops dashboard summary
POST /lab/learning/ingest         — trigger analytics ingestion run
GET  /lab/learning/clusters       — list failure clusters
GET  /lab/learning/clusters/{id}  — single cluster detail
PATCH /lab/learning/clusters/{id} — update cluster status
POST /lab/learning/clusters/{id}/generate-candidate
                                  — auto-generate candidate from cluster
POST /lab/learning/candidates/{id}/evaluate
                                  — run sandbox evaluation against Gold Set
POST /lab/learning/candidates/{id}/release
                                  — record release attribution for accepted candidate
GET  /lab/learning/candidates/{id}/evaluations
                                  — list evaluations for a candidate
GET  /lab/learning/monitoring     — post-release monitoring summary (all attributions)
GET  /lab/learning/monitoring/{id}— detailed monitoring report for one attribution
POST /lab/learning/monitoring/sweep
                                  — trigger monitoring sweep for a given window
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from auth.dev_guard import get_dev_user
from db.database import (
    get_rule_candidate,
    update_rule_candidate,
    get_rule_candidates,
    create_gold_set_entry,
    get_gold_set_entries,
    update_gold_set_entry,
)
from db.learning import (
    get_failure_clusters,
    get_failure_cluster,
    update_failure_cluster,
    get_candidate_evaluations,
    get_release_attributions,
    get_release_attribution_by_candidate,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/lab/learning", tags=["learning"])


# ── Pydantic models ────────────────────────────────────────────────────────────

class ClusterStatusUpdate(BaseModel):
    status: str  # open | investigating | resolved | dismissed
    notes: Optional[str] = None


class IngestRequest(BaseModel):
    days: int = Field(30, ge=7, le=90)
    mode: str = Field("production", pattern="^(production|dev)$")


class GenerateCandidateRequest(BaseModel):
    created_by: str = "system:auto"


class ReleaseRequest(BaseModel):
    release_version: Optional[str] = None
    expected_lift: Dict[str, Any] = Field(default_factory=dict)
    baseline_days: int = Field(30, ge=7, le=90)


class MonitoringSweepRequest(BaseModel):
    window_days: int = Field(30, ge=7, le=30)


class SchedulerStartRequest(BaseModel):
    interval_hours: Optional[int] = Field(None, ge=1, le=168)
    window_days:    Optional[int] = Field(None, ge=7, le=90)


class SchedulerConfigRequest(BaseModel):
    interval_hours: Optional[int] = Field(None, ge=1, le=168)
    window_days:    Optional[int] = Field(None, ge=7, le=90)


class PromoteRequest(BaseModel):
    """Explicitly promote a candidate to review_ready (requires clean eval)."""
    override_blocked: bool = False
    reason: Optional[str] = None


class EvaluateRequest(BaseModel):
    """Options for sandbox evaluation."""
    auto_release_on_safe: bool = Field(
        False,
        description=(
            "If True and verdict is 'safe', automatically advance the candidate "
            "to 'accepted' without requiring a separate human-review step. "
            "Only applies when verdict is exactly 'safe' — 'risky' still requires review."
        ),
    )


# ── Dashboard summary ──────────────────────────────────────────────────────────

@router.get("/ops")
def learning_ops_dashboard(user=Depends(get_dev_user)):
    """
    Single-call Learning Ops dashboard: open clusters, pending evaluations,
    recent releases, active alerts.
    """
    from db.learning import get_failure_clusters, get_active_monitoring_alerts

    open_clusters = get_failure_clusters(status="open", limit=50)
    critical_clusters = [c for c in open_clusters if c.get("severity") in ("critical", "high")]

    investigating = get_failure_clusters(status="investigating", limit=20)

    # Candidates that need evaluation (proposed status, no evaluation yet)
    proposed_candidates = get_rule_candidates(status="proposed", limit=50)
    needs_eval = []
    for c in proposed_candidates:
        meta = c.get("proposed_change") or {}
        if isinstance(meta, str):
            import json
            try:
                meta = json.loads(meta)
            except Exception:
                meta = {}
        if meta.get("_meta", {}).get("auto_generated"):
            evals = get_candidate_evaluations(c["id"])
            if not evals:
                needs_eval.append(c)

    attributions = get_release_attributions(limit=10)
    alerts = get_active_monitoring_alerts()

    return {
        "open_clusters": len(open_clusters),
        "critical_clusters": len(critical_clusters),
        "investigating_clusters": len(investigating),
        "candidates_needing_eval": len(needs_eval),
        "recent_releases": len(attributions),
        "active_alerts": len(alerts),
        "top_clusters": [
            {
                "id": c["id"],
                "pattern_id": c.get("pattern_id"),
                "failure_mode": c["failure_mode"],
                "severity": c["severity"],
                "frequency": c["frequency"],
                "candidate_id": c.get("candidate_id"),
            }
            for c in (critical_clusters or open_clusters)[:5]
        ],
        "alerts": [
            {
                "id": a["id"],
                "attribution_id": a.get("attribution_id"),
                "candidate_id": a.get("candidate_id"),
                "alert_type": a["alert_type"],
                "window_days": a.get("window_days"),
                "success_rate_delta": a.get("success_rate_delta"),
                "conversion_delta": a.get("conversion_delta"),
            }
            for a in alerts[:5]
        ],
    }


# ── Scheduler control ──────────────────────────────────────────────────────────

@router.get("/scheduler")
async def scheduler_status(user=Depends(get_dev_user)):
    """Return current scheduler state."""
    from engine.scheduler import get_scheduler_status
    return get_scheduler_status()


@router.post("/scheduler/start")
async def scheduler_start(body: SchedulerStartRequest, user=Depends(get_dev_user)):
    """
    Start the scheduler. No-op if already running.
    Optionally override interval_hours and window_days.
    Runs first pass immediately (no warmup delay).
    """
    from engine.scheduler import start_scheduler
    return start_scheduler(
        interval_hours=body.interval_hours,
        window_days=body.window_days,
        warmup_secs=0,
        started_by="api",
    )


@router.post("/scheduler/stop")
async def scheduler_stop(user=Depends(get_dev_user)):
    """Stop the running scheduler. No-op if not running."""
    from engine.scheduler import stop_scheduler
    return stop_scheduler()


@router.patch("/scheduler")
async def scheduler_configure(body: SchedulerConfigRequest, user=Depends(get_dev_user)):
    """
    Update scheduler config (interval_hours and/or window_days).
    If currently running, restarts immediately with the new config.
    If not running, saves config for next start.
    """
    from engine.scheduler import configure_scheduler
    return configure_scheduler(
        interval_hours=body.interval_hours,
        window_days=body.window_days,
    )


@router.post("/scheduler/run-now")
async def scheduler_run_now(user=Depends(get_dev_user)):
    """
    Trigger an immediate ingestion run, resetting the timer.
    If the scheduler is not running, starts it first.
    """
    from engine.scheduler import trigger_run_now
    return trigger_run_now()


# ── Ingestion ──────────────────────────────────────────────────────────────────

@router.post("/ingest")
def trigger_ingestion(
    body: IngestRequest,
    user=Depends(get_dev_user),
):
    """
    Trigger an analytics ingestion run to detect/update failure clusters.

    mode='production' (default) — only clean production sessions (same as scheduler).
    mode='dev'                  — includes all sessions (internal/dev) for pipeline
                                  testing before real production traffic exists.
    """
    from engine.learning.ingestion import ingest_from_analytics
    origin = "all" if body.mode == "dev" else "production"
    summary = ingest_from_analytics(days=body.days, origin=origin)
    return summary


# ── Failure Clusters ───────────────────────────────────────────────────────────

@router.get("/clusters")
def list_clusters(
    status: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    user=Depends(get_dev_user),
):
    return get_failure_clusters(status=status, severity=severity, limit=limit)


@router.get("/clusters/{cluster_id}")
def get_cluster(cluster_id: str, user=Depends(get_dev_user)):
    cluster = get_failure_cluster(cluster_id)
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")
    # Attach linked candidate if any
    if cluster.get("candidate_id"):
        cluster["candidate"] = get_rule_candidate(cluster["candidate_id"])
    return cluster


@router.patch("/clusters/{cluster_id}")
def update_cluster_status(
    cluster_id: str,
    body: ClusterStatusUpdate,
    user=Depends(get_dev_user),
):
    valid_statuses = {"open", "investigating", "resolved", "dismissed"}
    if body.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"status must be one of {valid_statuses}")
    updates = {"status": body.status}
    if body.notes:
        # Append notes to evidence
        cluster = get_failure_cluster(cluster_id)
        if cluster:
            ev = cluster.get("evidence", {})
            ev["reviewer_notes"] = body.notes
            import json
            updates["evidence_json"] = json.dumps(ev)
    updated = update_failure_cluster(cluster_id, **updates)
    if not updated:
        raise HTTPException(status_code=404, detail="Cluster not found")
    return updated


@router.post("/clusters/{cluster_id}/generate-candidate")
def generate_candidate_from_cluster(
    cluster_id: str,
    body: GenerateCandidateRequest,
    user=Depends(get_dev_user),
):
    """Auto-generate a rule_candidate from a specific failure cluster."""
    from engine.learning.auto_candidate import generate_candidate_for_cluster
    candidate = generate_candidate_for_cluster(
        cluster_id=cluster_id,
        created_by=body.created_by or f"lab:{user.get('email', 'unknown')}",
    )
    if not candidate:
        cluster = get_failure_cluster(cluster_id)
        if not cluster:
            raise HTTPException(status_code=404, detail="Cluster not found")
        if cluster.get("candidate_id"):
            return {
                "already_exists": True,
                "candidate": get_rule_candidate(cluster["candidate_id"]),
            }
        raise HTTPException(
            status_code=409,
            detail="Cluster is not eligible for auto-generation (low severity, resolved, or dismissed).",
        )
    return {"created": True, "candidate": candidate}


# ── Candidate Evaluation ───────────────────────────────────────────────────────

@router.post("/candidates/{candidate_id}/evaluate")
def evaluate_candidate(
    candidate_id: str,
    body: EvaluateRequest = None,
    user=Depends(get_dev_user),
):
    """
    Run sandbox evaluation for a candidate against the Gold Set.
    Stores result in candidate_evaluations.
    Returns the evaluation with verdict (safe | risky | blocked).

    auto_release_on_safe (default: false):
      When true and verdict == 'safe', the candidate is automatically advanced
      to 'accepted' — skipping the manual review step.
      'risky' still requires a human to accept.
      'blocked' always stays in 'proposed'.
    """
    if body is None:
        body = EvaluateRequest()

    candidate = get_rule_candidate(candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    from engine.learning.sandbox_eval import evaluate_candidate as run_eval
    evaluation = run_eval(candidate)
    verdict = evaluation.get("verdict")

    if verdict == "blocked":
        # Regressions detected — must not proceed without override
        update_rule_candidate(candidate_id, status="proposed")
        evaluation["promotion_blocked"] = True
        evaluation["new_status"] = "proposed"
        evaluation["promotion_message"] = (
            "Candidate has been evaluated as BLOCKED due to detected regressions. "
            "It cannot be promoted to review_ready until regressions are resolved. "
            "Admin override available via /candidates/{id}/promote."
        )
    elif verdict == "safe" and body.auto_release_on_safe:
        # Safe + auto-promote flag → skip review, go straight to accepted
        update_rule_candidate(candidate_id, status="accepted")
        evaluation["promotion_blocked"] = False
        evaluation["new_status"] = "accepted"
        evaluation["promotion_message"] = (
            "Candidate auto-accepted (verdict: safe, auto_release_on_safe=true). "
            "Ready to apply or record a release."
        )
        logger.info(
            "Candidate %s auto-accepted after safe eval (requested by %s)",
            candidate_id, user.get("email"),
        )
    else:
        # Safe or risky — promote to review_ready, await human decision
        update_rule_candidate(candidate_id, status="review_ready")
        evaluation["promotion_blocked"] = False
        evaluation["new_status"] = "review_ready"
        evaluation["promotion_message"] = (
            f"Candidate promoted to review_ready (verdict: {verdict}). "
            "Human review required before acceptance."
        )

    return evaluation


@router.post("/candidates/{candidate_id}/promote")
def promote_candidate(
    candidate_id: str,
    body: PromoteRequest,
    user=Depends(get_dev_user),
):
    """
    Explicitly promote a candidate to review_ready.
    Requires override_blocked=True if the latest evaluation was 'blocked'.
    """
    candidate = get_rule_candidate(candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    evals = get_candidate_evaluations(candidate_id)
    latest_eval = evals[0] if evals else None

    if latest_eval and latest_eval.get("verdict") == "blocked" and not body.override_blocked:
        raise HTTPException(
            status_code=409,
            detail=(
                "Latest evaluation verdict is 'blocked'. "
                "Set override_blocked=true to force promotion. "
                "Include a reason explaining why the override is safe."
            ),
        )

    update_rule_candidate(candidate_id, status="review_ready")
    logger.warning(
        "Candidate %s force-promoted to review_ready by %s. Reason: %s",
        candidate_id, user.get("email"), body.reason,
    )
    return {
        "promoted": True,
        "candidate_id": candidate_id,
        "status": "review_ready",
        "override_used": body.override_blocked,
        "reason": body.reason,
    }


@router.get("/candidates/{candidate_id}/evaluations")
def list_evaluations(candidate_id: str, user=Depends(get_dev_user)):
    """List all sandbox evaluations for a candidate, most recent first."""
    candidate = get_rule_candidate(candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    evals = get_candidate_evaluations(candidate_id)
    return {
        "candidate_id": candidate_id,
        "candidate_status": candidate.get("status"),
        "evaluations": evals,
        "latest_verdict": evals[0].get("verdict") if evals else None,
    }


# ── Release Attribution ────────────────────────────────────────────────────────

@router.post("/candidates/{candidate_id}/release")
def record_release(
    candidate_id: str,
    body: ReleaseRequest,
    user=Depends(get_dev_user),
):
    """
    Record a release attribution for an accepted candidate.
    Captures current analytics as pre-release baseline for monitoring.

    SAFETY: Only accepted candidates may be released.
    """
    from db.learning import create_release_attribution
    from engine.learning.monitoring import capture_pre_release_baseline

    candidate = get_rule_candidate(candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    if candidate.get("status") != "accepted":
        raise HTTPException(
            status_code=409,
            detail=(
                f"Candidate status is '{candidate.get('status')}'. "
                "Only 'accepted' candidates can be released. "
                "Accept the candidate first via the Candidates UI."
            ),
        )

    # Check if already released
    existing = get_release_attribution_by_candidate(candidate_id)
    if existing:
        return {
            "already_released": True,
            "attribution": existing,
        }

    # Capture baseline before recording release
    baseline = capture_pre_release_baseline(days=body.baseline_days)

    # Find source cluster
    proposed_change = candidate.get("proposed_change") or {}
    if isinstance(proposed_change, str):
        import json
        try:
            proposed_change = json.loads(proposed_change)
        except Exception:
            proposed_change = {}
    source_cluster_id = proposed_change.get("_meta", {}).get("source_cluster_id")

    attribution = create_release_attribution(
        candidate_id=candidate_id,
        release_version=body.release_version,
        source_cluster_id=source_cluster_id,
        expected_lift=body.expected_lift,
        pre_release_baseline=baseline,
    )

    # Mark candidate as implemented
    update_rule_candidate(candidate_id, status="implemented")

    # Mark source cluster as resolved
    if source_cluster_id:
        update_failure_cluster(source_cluster_id, status="resolved")

    logger.info(
        "Release attribution created: candidate=%s attribution=%s version=%s",
        candidate_id, attribution["id"], body.release_version,
    )
    return {
        "created": True,
        "attribution": attribution,
        "baseline_captured": baseline,
        "monitoring_windows": [7, 14, 30],
    }


# ── Post-Release Monitoring ────────────────────────────────────────────────────

@router.get("/monitoring")
def list_monitoring(
    limit: int = Query(20, ge=1, le=100),
    user=Depends(get_dev_user),
):
    """List all release attributions with their latest monitoring status."""
    from db.learning import get_active_monitoring_alerts, get_monitoring_snapshots

    attributions = get_release_attributions(limit=limit)
    result = []
    for attr in attributions:
        snaps = get_monitoring_snapshots(attr["id"])
        alerts = [s for s in snaps if s.get("alert_type")]
        result.append({
            "attribution_id": attr["id"],
            "candidate_id": attr.get("candidate_id"),
            "release_version": attr.get("release_version"),
            "release_date": attr.get("release_date"),
            "expected_lift": attr.get("expected_lift", {}),
            "windows_measured": [s["window_days"] for s in snaps],
            "alert_status": "rollback_review" if any(a["alert_type"] == "rollback_review" for a in alerts)
                           else "candidate_regression" if alerts
                           else "nominal",
            "latest_snapshot": snaps[0] if snaps else None,
        })

    alerts = get_active_monitoring_alerts()
    return {
        "attributions": result,
        "active_alerts": len(alerts),
        "alert_summary": [
            {
                "attribution_id": a.get("attribution_id"),
                "candidate_id": a.get("candidate_id"),
                "alert_type": a["alert_type"],
                "window_days": a.get("window_days"),
            }
            for a in alerts[:10]
        ],
    }


@router.get("/monitoring/{attribution_id}")
def get_monitoring_report_endpoint(attribution_id: str, user=Depends(get_dev_user)):
    """Detailed monitoring report for a single release attribution."""
    from engine.learning.monitoring import get_monitoring_report
    report = get_monitoring_report(attribution_id)
    if "error" in report:
        raise HTTPException(status_code=404, detail=report["error"])
    return report


@router.post("/monitoring/sweep")
def trigger_monitoring_sweep(
    body: MonitoringSweepRequest,
    user=Depends(get_dev_user),
):
    """
    Trigger a monitoring sweep for all released candidates within
    the specified window. Creates snapshots and raises alerts as needed.
    """
    from engine.learning.monitoring import run_monitoring_sweep
    return run_monitoring_sweep(window_days=body.window_days)


@router.post("/monitoring/sweep-all")
def trigger_monitoring_sweep_all(user=Depends(get_dev_user)):
    """
    Trigger monitoring sweeps for all three windows (7d, 14d, 30d) in sequence.
    Returns a combined summary of snapshots and alerts created.
    """
    from engine.learning.monitoring import run_monitoring_sweep
    results = {}
    total_snapshots = 0
    total_alerts = 0
    for window in [7, 14, 30]:
        try:
            r = run_monitoring_sweep(window_days=window)
            results[f"{window}d"] = r
            total_snapshots += r.get("snapshots_created", 0)
            total_alerts += r.get("alerts_created", 0)
        except Exception as exc:
            results[f"{window}d"] = {"error": str(exc)}
    return {
        "windows_swept": [7, 14, 30],
        "total_snapshots": total_snapshots,
        "total_alerts": total_alerts,
        "by_window": results,
    }


class ApplyCandidateRequest(BaseModel):
    notes: Optional[str] = None


@router.post("/candidates/{candidate_id}/apply")
def apply_candidate_to_engine(
    candidate_id: str,
    body: ApplyCandidateRequest,
    user=Depends(get_dev_user),
):
    """
    Apply an accepted confidence_recalibration candidate to the engine by
    writing its suggested floor to confidence_overrides.json.

    SAFETY RULES:
      - Only candidates with status='accepted' may be applied
      - Only candidate_type='confidence_recalibration' is auto-applicable
      - All other types return a 422 with instructions for manual application
      - The override file is NEVER deleted by this endpoint — only appended/updated
      - A human must restart the engine for changes to take effect
    """
    import json as _json
    from pathlib import Path

    candidate = get_rule_candidate(candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    if candidate.get("status") != "accepted":
        raise HTTPException(
            status_code=409,
            detail=(
                f"Candidate status is '{candidate.get('status')}'. "
                "Only 'accepted' candidates may be applied. "
                "Accept the candidate first via the Candidates UI."
            ),
        )

    proposed_change = candidate.get("proposed_change") or {}
    if isinstance(proposed_change, str):
        try:
            proposed_change = _json.loads(proposed_change)
        except Exception:
            proposed_change = {}

    candidate_type = proposed_change.get("_meta", {}).get("candidate_type") or proposed_change.get("type")

    if candidate_type != "confidence_recalibration":
        raise HTTPException(
            status_code=422,
            detail=(
                f"Candidate type '{candidate_type}' cannot be auto-applied. "
                "Only 'confidence_recalibration' candidates can be applied via this endpoint. "
                "Apply blueprint_correction, shoot_mode_step_fix, dataset_promotion, or trust_safety "
                "candidates manually via the engine configuration."
            ),
        )

    pattern_id = proposed_change.get("pattern_id")
    if not pattern_id:
        raise HTTPException(status_code=422, detail="Candidate has no pattern_id — cannot apply.")

    # Load or create confidence_overrides.json
    overrides_path = Path(__file__).resolve().parent.parent.parent / "engine" / "confidence_overrides.json"
    overrides: dict = {}
    if overrides_path.exists():
        try:
            overrides = _json.loads(overrides_path.read_text())
        except Exception:
            overrides = {}

    # Compute the new floor from calibration data
    z_score = abs(proposed_change.get("z_score", 1.0))
    current_cvr = proposed_change.get("current_cvr", 0.0)
    fleet_mean = proposed_change.get("fleet_mean_cvr", current_cvr)
    # Suggested floor: midpoint between current CVR and fleet mean, as a confidence score
    suggested_floor = round(min(0.9, max(0.1, (current_cvr + fleet_mean) / 200)), 3)

    overrides[pattern_id] = {
        "confidence_floor":    suggested_floor,
        "applied_at":          __import__('time').time(),
        "applied_by":          user.get("email", "lab"),
        "candidate_id":        candidate_id,
        "reason":              "confidence_recalibration",
        "notes":               body.notes or candidate.get("rationale", ""),
        "previous_floor":      overrides.get(pattern_id, {}).get("confidence_floor"),
    }

    try:
        overrides_path.parent.mkdir(parents=True, exist_ok=True)
        overrides_path.write_text(_json.dumps(overrides, indent=2))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to write overrides: {exc}")

    # Mark candidate as implemented
    update_rule_candidate(candidate_id, status="implemented")

    logger.info(
        "Candidate %s applied to engine: pattern=%s floor=%.3f by=%s",
        candidate_id, pattern_id, suggested_floor, user.get("email"),
    )
    return {
        "applied": True,
        "pattern_id": pattern_id,
        "confidence_floor": suggested_floor,
        "overrides_path": str(overrides_path),
        "restart_required": True,
        "message": (
            f"Confidence floor for '{pattern_id}' set to {suggested_floor:.3f}. "
            "Engine restart required for changes to take effect."
        ),
    }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Knowledge Base Endpoints
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# GET  /lab/learning/knowledge               — full pattern knowledge base
# GET  /lab/learning/knowledge/{pattern_id}  — single pattern entry
# POST /lab/learning/knowledge/{pattern_id}/signals — aggregate signals for pattern
# POST /lab/learning/knowledge/{pattern_id}/ci-gate — run CI gate for a candidate


@router.get("/knowledge")
def list_knowledge_base(user=Depends(get_dev_user)):
    """
    Return the full NGW pattern knowledge base.

    Each entry describes a pattern's risk level, expected symptoms,
    known fix steps, and minimum signal thresholds.
    """
    from engine.learning.knowledge import PATTERN_KNOWLEDGE_BASE, MIN_SIGNALS
    from dataclasses import asdict

    entries = []
    for pid, entry in PATTERN_KNOWLEDGE_BASE.items():
        entries.append({
            "pattern_id":            entry.pattern_id,
            "display_name":          entry.display_name,
            "family":                entry.family,
            "risk_level":            entry.risk_level,
            "min_signals_for_change": entry.min_signals_for_change,
            "symptom_count":         len(entry.symptoms),
            "tags":                  entry.tags,
            "description":           entry.description,
        })

    by_risk = {
        "low":    [e["pattern_id"] for e in entries if e["risk_level"] == "low"],
        "medium": [e["pattern_id"] for e in entries if e["risk_level"] == "medium"],
        "high":   [e["pattern_id"] for e in entries if e["risk_level"] == "high"],
    }

    return {
        "total_patterns": len(entries),
        "min_signals":    MIN_SIGNALS,
        "by_risk":        by_risk,
        "entries":        entries,
    }


@router.get("/knowledge/{pattern_id}")
def get_knowledge_entry(pattern_id: str, user=Depends(get_dev_user)):
    """Return the full knowledge entry for a single pattern, including all symptoms and fix steps."""
    from engine.learning.knowledge import get_pattern_entry
    from dataclasses import asdict

    entry = get_pattern_entry(pattern_id)
    if not entry:
        raise HTTPException(status_code=404, detail=f"Pattern '{pattern_id}' not found in knowledge base")

    result = asdict(entry)
    return result


class SignalAggregateRequest(BaseModel):
    window_days: int = Field(default=30, ge=1, le=365)


@router.post("/knowledge/{pattern_id}/signals")
def aggregate_pattern_signals(
    pattern_id:  str,
    body:        SignalAggregateRequest,
    user=Depends(get_dev_user),
):
    """
    Aggregate quality-weighted production signals for a pattern.

    Returns an AggregatedInsight with signal counts, success/fail rates,
    signal quality label, and threshold pass/fail for each risk tier.
    """
    from db.signals import get_pattern_breakdown
    from engine.learning.knowledge import (
        LearningSignal, enrich_signal_weights,
        aggregate_signals_for_pattern, get_pattern_entry, MIN_SIGNALS,
    )
    from dataclasses import asdict

    entry = get_pattern_entry(pattern_id)
    if not entry:
        raise HTTPException(status_code=404, detail=f"Pattern '{pattern_id}' not found in knowledge base")

    try:
        rows = get_pattern_breakdown(pattern_id=pattern_id, days=body.window_days)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Signal load failed: {exc}")

    signals = []
    for row in (rows or []):
        sig = LearningSignal(
            signal_id        = str(row.get("id", "")),
            pattern_id       = pattern_id,
            outcome          = str(row.get("outcome", "unknown")),
            skill_tier       = str(row.get("skill_tier", "unknown")),
            confidence_score = float(row.get("confidence_score", 0.5)),
            source           = str(row.get("signal_source", "live")),
            session_id       = str(row.get("session_id", "")),
        )
        signals.append(sig)

    enrich_signal_weights(signals)
    insight = aggregate_signals_for_pattern(pattern_id, signals, window_days=body.window_days)

    return {
        "pattern_id":             insight.pattern_id,
        "window_days":            insight.window_days,
        "raw_signal_count":       insight.raw_signal_count,
        "weighted_signal_count":  insight.weighted_signal_count,
        "weighted_success_rate":  insight.weighted_success_rate,
        "weighted_fail_rate":     insight.weighted_fail_rate,
        "dominant_failure_mode":  insight.dominant_failure_mode,
        "signal_quality_label":   insight.signal_quality_label,
        "meets_low_threshold":    insight.meets_low_threshold,
        "meets_medium_threshold": insight.meets_medium_threshold,
        "meets_high_threshold":   insight.meets_high_threshold,
        "thresholds":             MIN_SIGNALS,
        "pattern_risk_level":     entry.risk_level,
        "pattern_min_signals":    entry.min_signals_for_change,
    }


class CIGateRequest(BaseModel):
    candidate_id:    Optional[str] = None      # if omitted, runs a pattern-level readiness check
    benchmark_delta: Optional[float] = None   # override for testing


@router.post("/knowledge/{pattern_id}/ci-gate")
def run_ci_gate(
    pattern_id: str,
    body:       CIGateRequest,
    user=Depends(get_dev_user),
):
    """
    Run the CI gate evaluation for a pattern.

    If candidate_id is provided, loads that candidate from the DB and runs
    the full DB-backed evaluation (evaluate_candidate_gate).

    If candidate_id is omitted, synthesises a minimal candidate dict for the
    pattern and runs the pure-function evaluation (evaluate_candidate_dict)
    against live production signals — useful for the Knowledge Base readiness
    check where no pending candidate exists yet.

    Checks:
      1. Signal sufficiency (weighted signals ≥ MIN_SIGNALS[risk_level])
      2. Benchmark delta (no overall regression)
      3. Pattern regression (no single pattern drops > 5%)

    Returns disposition: auto_deploy | human_review | human_gate | blocked | insufficient
    """
    from engine.learning.ci_gate import (
        evaluate_candidate_gate,
        evaluate_candidate_dict,
        summarise_gate_result,
        _load_production_signals,
    )
    from engine.learning.knowledge import aggregate_signals_for_pattern

    if body.candidate_id:
        result = evaluate_candidate_gate(body.candidate_id)
    else:
        # Pattern-level readiness check — no candidate required
        raw_signals = _load_production_signals(pattern_id)
        insight = aggregate_signals_for_pattern(pattern_id, raw_signals) if raw_signals else None
        candidate = {"id": f"pattern_check_{pattern_id}", "pattern_id": pattern_id}
        result = evaluate_candidate_dict(
            candidate       = candidate,
            insight         = insight,
            benchmark_delta = body.benchmark_delta,
        )

    return {
        "candidate_id":    result.candidate_id,
        "pattern_id":      result.pattern_id,
        "risk_level":      result.risk_level,
        "disposition":     result.disposition,
        "overall_verdict": result.overall_verdict,
        "blocking_reason": result.blocking_reason,
        "summary":         summarise_gate_result(result),
        "gates": [
            {
                "gate":    g.gate,
                "verdict": g.verdict,
                "message": g.message,
                "detail":  g.detail,
            }
            for g in result.gates
        ],
        "notes":        result.notes,
        "evaluated_at": result.evaluated_at,
    }


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Revenue & Projection Endpoints
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# POST /lab/learning/revenue/impact     — compute revenue delta for a pattern fix
# POST /lab/learning/revenue/simulate   — run 30-day simulation for N scenarios


class RevenueImpactRequest(BaseModel):
    pattern_id:       str
    sessions_per_day: float = Field(..., gt=0)
    before_cvr:       float = Field(..., ge=0.0, le=1.0)
    after_cvr:        float = Field(..., ge=0.0, le=1.0)
    arpu:             float = Field(default=9.0, gt=0)
    days:             int   = Field(default=30, ge=1, le=365)
    description:      str   = ""


@router.post("/revenue/impact")
def compute_revenue_impact_endpoint(
    body: RevenueImpactRequest,
    user=Depends(get_dev_user),
):
    """
    Compute the incremental revenue impact of a CVR improvement for one pattern.

    Returns: cvr_lift, additional_conversions_30d, delta_revenue_30d, annualised_delta
    """
    from engine.learning.revenue import compute_revenue_impact
    from dataclasses import asdict

    try:
        scenario = compute_revenue_impact(
            pattern_id       = body.pattern_id,
            sessions_per_day = body.sessions_per_day,
            before_cvr       = body.before_cvr,
            after_cvr        = body.after_cvr,
            arpu             = body.arpu,
            days             = body.days,
            description      = body.description,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    return asdict(scenario)


class SimulateScenario(BaseModel):
    name:              str
    description:       str = ""
    pattern_id:        str
    risk_level:        str = "medium"
    sessions_per_day:  float
    baseline_cvr:      float
    target_cvr:        float
    arpu:              float = 9.0
    daily_new_signals: Optional[float] = None


class SimulateRequest(BaseModel):
    scenarios: list[SimulateScenario] = Field(..., min_length=1, max_length=20)


@router.post("/revenue/simulate")
def simulate_revenue(
    body: SimulateRequest,
    user=Depends(get_dev_user),
):
    """
    Run a 30-day revenue projection simulation for a list of scenarios.

    Each scenario represents a pattern fix with its own risk level and
    daily session volume. Returns day-by-day signal accumulation, gate
    unlock/deploy events, and revenue delta vs. baseline.
    """
    from engine.learning.revenue import project_30_day_metrics, summarise_revenue_impact

    sc_dicts = [s.model_dump() for s in body.scenarios]
    projections = project_30_day_metrics(sc_dicts)
    summary     = summarise_revenue_impact(projections)

    from db.database import save_simulation_run
    result_projections = [
            {
                "scenario_name":          p.scenario_name,
                "pattern_id":             p.pattern_id,
                "risk_level":             p.risk_level,
                "gate_unlock_day":        p.gate_unlock_day,
                "deploy_day":             p.deploy_day,
                "revenue_delta_30d":      p.revenue_delta_30d,
                "annualised_delta":       p.annualised_delta,
                "total_conversions_30d":  p.total_conversions_30d,
                "baseline_conversions_30d": p.baseline_conversions_30d,
                "day_snapshots": [
                    {
                        "day":                snap.day,
                        "cumulative_signals": snap.cumulative_signals,
                        "gate_status":        snap.gate_status,
                        "cvr":                snap.cvr,
                        "sessions":           snap.sessions,
                        "conversions":        snap.conversions,
                        "revenue":            snap.revenue,
                    }
                    for snap in p.day_snapshots
                ],
            }
            for p in projections
        ]

    # Persist run to DB so history survives logout/cache-clear
    run_by = user.get("email") if user else None
    saved  = save_simulation_run(summary=summary, projections=result_projections, run_by=run_by)

    return {
        "id":          saved["id"],
        "run_at":      saved["run_at"],
        "summary":     summary,
        "projections": result_projections,
    }


@router.get("/revenue/simulate/history")
def get_simulation_history(
    limit: int = 20,
    user=Depends(get_dev_user),
):
    """Return past simulation runs, newest first (max 20)."""
    from db.database import list_simulation_runs
    runs = list_simulation_runs(limit=min(limit, 20))
    return {"runs": runs, "count": len(runs)}


@router.get("/revenue/simulate/latest")
def get_latest_simulation(user=Depends(get_dev_user)):
    """Return the most recent simulation run, or 404 if none exists."""
    from db.database import get_latest_simulation_run
    run = get_latest_simulation_run()
    if not run:
        raise HTTPException(status_code=404, detail="No simulation runs found")
    return run


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Gold Set — Seed from Reference Dataset
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#
# POST /lab/learning/gold-set/seed-from-reference
#   Bulk-promotes reference dataset entries into the Gold Set.
#   Defaults to tier=gold (benchmark_verified, entry_trust_score ≥ 0.85).
#   Skips entries whose image_path is already in the Gold Set (idempotent).


class SeedGoldSetRequest(BaseModel):
    tier:        str            = Field("gold", description="dataset_tier to import ('gold', 'community', 'all')")
    pattern_id:  Optional[str]  = Field(None, description="Limit to a single pattern. Omit for all patterns.")
    image_paths: Optional[List[str]] = Field(None, description="If set, only process these specific image paths.")
    force:       bool           = Field(False, description="If true, re-import even if already in the Gold Set (refresh expected_analysis).")
    dry_run:     bool           = Field(False, description="If true, return what would be created without writing.")


@router.post("/gold-set/seed-from-reference")
def seed_gold_set_from_reference(
    body: SeedGoldSetRequest,
    user=Depends(get_dev_user),
):
    """
    Promote reference dataset entries into the Gold Set.

    Gold-tier reference entries already have:
      - Verified image files on disk
      - ground_truth.expected_pattern (authoritative label)
      - Photographer = benchmark_verified + entry_trust_score ≥ 0.85

    Each imported entry is created as status='approved' so it
    immediately participates in candidate sandbox evaluations.

    Idempotent — skips any image already present in the Gold Set.
    """
    from engine.reference_dataset import list_entries, DATASET_ROOT

    # 1. Load reference entries matching the requested tier / pattern
    filters: dict = {}
    if body.tier and body.tier != "all":
        filters["tier"] = body.tier
    if body.pattern_id:
        filters["pattern_id"] = body.pattern_id

    ref_entries = list_entries(**filters)

    # 2. Build set of image paths already in the Gold Set (for dedup / force-update)
    existing = get_gold_set_entries(limit=5000)
    existing_map = {e["image_path"]: e["id"] for e in existing}  # path → entry_id

    # Normalise the caller-supplied image_paths filter to a set for O(1) lookup
    filter_paths: Optional[set] = set(body.image_paths) if body.image_paths else None

    created = []
    skipped = []

    for entry in ref_entries:
        meta = entry.get("metadata") or {}
        pattern_id   = entry.get("pattern_id") or meta.get("pattern_id")
        reference_id = entry.get("reference_id") or meta.get("reference_id")
        gt = meta.get("ground_truth") or {}

        if not pattern_id or not reference_id:
            skipped.append({"reason": "missing pattern_id or reference_id", "entry": str(entry)[:80]})
            continue

        # Verify image exists on disk
        img_path = DATASET_ROOT / pattern_id / reference_id / "image.jpg"
        if not img_path.exists():
            img_path = DATASET_ROOT / pattern_id / reference_id / "image.png"
        if not img_path.exists():
            skipped.append({"reason": "image file not found on disk", "pattern": pattern_id, "reference_id": reference_id})
            continue

        # Use a consistent relative path from project root
        rel_path = str(img_path.relative_to(DATASET_ROOT.parent.parent))

        # If caller restricted to specific paths, skip anything not in that set
        if filter_paths is not None and rel_path not in filter_paths:
            continue

        already_exists = rel_path in existing_map
        if already_exists and not body.force:
            skipped.append({"reason": "already in Gold Set", "pattern": pattern_id, "reference_id": reference_id})
            continue

        # Build expected_analysis from ground_truth
        expected_analysis = {
            "pattern":       gt.get("expected_pattern"),
            "light_count":   gt.get("expected_light_count"),
            "acceptable_patterns": gt.get("acceptable_patterns", []),
            "acceptable_light_count_range": gt.get("acceptable_light_count_range"),
            "key_direction": gt.get("expected_key_direction"),
            "source":        "reference_dataset",
            "reference_id":  reference_id,
            "dataset_tier":  meta.get("dataset_tier", "gold"),
            "trust_score":   meta.get("entry_trust_score"),
        }

        seed_notes = f"[Seeded from reference dataset — {meta.get('dataset_tier','gold')} tier] {meta.get('notes', '')}".strip()

        if body.dry_run:
            created.append({
                "image_path": rel_path,
                "pattern":    gt.get("expected_pattern"),
                "notes":      meta.get("notes", "")[:80],
                "action":     "update" if already_exists else "create",
                "dry_run":    True,
            })
            continue

        if already_exists and body.force:
            # Update the existing Gold Set entry with refreshed reference data
            entry_id = existing_map[rel_path]
            update_gold_set_entry(
                entry_id,
                expected_analysis=expected_analysis,
                notes=seed_notes,
                status="approved",
            )
            created.append({
                "id":         entry_id,
                "image_path": rel_path,
                "pattern":    gt.get("expected_pattern"),
                "action":     "updated",
            })
        else:
            gs_entry = create_gold_set_entry(
                image_path=rel_path,
                expected_analysis=expected_analysis,
                notes=seed_notes,
                status="approved",
                created_by=user.get("email", "lab-seed"),
            )
            created.append({
                "id":         gs_entry["id"],
                "image_path": rel_path,
                "pattern":    gt.get("expected_pattern"),
                "action":     "created",
            })
        existing_map[rel_path] = created[-1]["id"]  # prevent dupes within this batch

    return {
        "created":      len(created),
        "skipped":      len(skipped),
        "dry_run":      body.dry_run,
        "entries":      created,
        "skip_reasons": skipped,
    }
