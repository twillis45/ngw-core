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
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from auth.dev_guard import get_dev_user
from db.database import (
    get_rule_candidate,
    update_rule_candidate,
    get_rule_candidates,
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


class GenerateCandidateRequest(BaseModel):
    created_by: str = "system:auto"


class ReleaseRequest(BaseModel):
    release_version: Optional[str] = None
    expected_lift: Dict[str, Any] = Field(default_factory=dict)
    baseline_days: int = Field(30, ge=7, le=90)


class MonitoringSweepRequest(BaseModel):
    window_days: int = Field(30, ge=7, le=30)


class PromoteRequest(BaseModel):
    """Explicitly promote a candidate to review_ready (requires clean eval)."""
    override_blocked: bool = False
    reason: Optional[str] = None


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


# ── Ingestion ──────────────────────────────────────────────────────────────────

@router.post("/ingest")
def trigger_ingestion(
    body: IngestRequest,
    user=Depends(get_dev_user),
):
    """Trigger an analytics ingestion run to detect/update failure clusters."""
    from engine.learning.ingestion import ingest_from_analytics
    summary = ingest_from_analytics(days=body.days)
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
    user=Depends(get_dev_user),
):
    """
    Run sandbox evaluation for a candidate against the Gold Set.
    Stores result in candidate_evaluations.
    Returns the evaluation with verdict (safe | risky | blocked).
    """
    candidate = get_rule_candidate(candidate_id)
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    from engine.learning.sandbox_eval import evaluate_candidate as run_eval
    evaluation = run_eval(candidate)

    # If verdict is safe/risky, auto-set candidate to review_ready
    # If blocked, keep as proposed and add warning
    if evaluation.get("verdict") == "blocked":
        update_rule_candidate(candidate_id, status="proposed")
        evaluation["promotion_blocked"] = True
        evaluation["promotion_message"] = (
            "Candidate has been evaluated as BLOCKED due to detected regressions. "
            "It cannot be promoted to review_ready until regressions are resolved. "
            "Admin override available via /candidates/{id}/promote."
        )
    else:
        # Safe or risky — promote to review_ready
        update_rule_candidate(candidate_id, status="review_ready")
        evaluation["promotion_blocked"] = False
        evaluation["promotion_message"] = (
            f"Candidate promoted to review_ready (verdict: {evaluation.get('verdict')}). "
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
