"""
Learning system schema and CRUD operations.

Tables:
  failure_clusters       — aggregated failure patterns from production analytics
  candidate_evaluations  — sandbox eval results for rule_candidates
  release_attributions   — accepted candidates linked to specific releases
  monitoring_snapshots   — post-release metric windows (7/14/30 day)
"""
from __future__ import annotations

import json
import time
import uuid
from typing import Any, Dict, List, Optional

from db.database import get_db


# ── Schema ─────────────────────────────────────────────────────────────────────

def init_learning_tables() -> None:
    """Create learning-system tables if they don't exist."""
    with get_db() as conn:
        conn.executescript("""
            -- Failure clusters: aggregated from analytics ingestion runs
            CREATE TABLE IF NOT EXISTS failure_clusters (
                id                  TEXT PRIMARY KEY,
                pattern_id          TEXT,
                environment         TEXT,
                subject_type        TEXT,
                failure_mode        TEXT NOT NULL,
                severity            TEXT NOT NULL DEFAULT 'low',
                frequency           INTEGER NOT NULL DEFAULT 0,
                affected_sessions   INTEGER NOT NULL DEFAULT 0,
                evidence_json       TEXT NOT NULL DEFAULT '{}',
                candidate_id        TEXT,
                status              TEXT NOT NULL DEFAULT 'open',
                ingested_at         REAL NOT NULL,
                updated_at          REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_fc_pattern   ON failure_clusters(pattern_id);
            CREATE INDEX IF NOT EXISTS idx_fc_status    ON failure_clusters(status);
            CREATE INDEX IF NOT EXISTS idx_fc_severity  ON failure_clusters(severity);
            CREATE INDEX IF NOT EXISTS idx_fc_mode      ON failure_clusters(failure_mode);

            -- Sandbox evaluation results for a candidate
            CREATE TABLE IF NOT EXISTS candidate_evaluations (
                id                      TEXT PRIMARY KEY,
                candidate_id            TEXT NOT NULL,
                eval_type               TEXT NOT NULL DEFAULT 'gold_set',
                total_entries           INTEGER DEFAULT 0,
                pass_before             INTEGER DEFAULT 0,
                pass_after              INTEGER DEFAULT 0,
                pass_delta              INTEGER DEFAULT 0,
                soft_pass_delta         INTEGER DEFAULT 0,
                fail_delta              INTEGER DEFAULT 0,
                regressions_json        TEXT NOT NULL DEFAULT '[]',
                affected_patterns_json  TEXT NOT NULL DEFAULT '[]',
                confidence_shift        REAL,
                risk_level              TEXT NOT NULL DEFAULT 'low',
                verdict                 TEXT NOT NULL DEFAULT 'safe',
                notes                   TEXT,
                ran_at                  REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_ce_candidate ON candidate_evaluations(candidate_id);

            -- Release attribution: links accepted candidate to a versioned release
            CREATE TABLE IF NOT EXISTS release_attributions (
                id                          TEXT PRIMARY KEY,
                candidate_id                TEXT NOT NULL,
                release_version             TEXT,
                release_date                REAL NOT NULL,
                source_cluster_id           TEXT,
                expected_lift_json          TEXT NOT NULL DEFAULT '{}',
                pre_release_baseline_json   TEXT NOT NULL DEFAULT '{}',
                created_at                  REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_ra_candidate ON release_attributions(candidate_id);

            -- Post-release monitoring windows
            CREATE TABLE IF NOT EXISTS monitoring_snapshots (
                id                  TEXT PRIMARY KEY,
                attribution_id      TEXT NOT NULL,
                window_days         INTEGER NOT NULL,
                measured_at         REAL NOT NULL,
                success_rate_delta  REAL,
                confidence_delta    REAL,
                conversion_delta    REAL,
                trust_delta         REAL,
                alert_type          TEXT,
                snapshot_json       TEXT NOT NULL DEFAULT '{}'
            );
            CREATE INDEX IF NOT EXISTS idx_ms_attribution ON monitoring_snapshots(attribution_id);
        """)


# ── Failure Cluster CRUD ────────────────────────────────────────────────────────

def upsert_failure_cluster(
    pattern_id: Optional[str],
    environment: Optional[str],
    subject_type: Optional[str],
    failure_mode: str,
    severity: str,
    frequency: int,
    affected_sessions: int,
    evidence: Dict[str, Any],
) -> Dict[str, Any]:
    """Insert or update a failure cluster. Keyed on (pattern_id, failure_mode)."""
    now = time.time()
    with get_db() as conn:
        existing = conn.execute(
            """SELECT id FROM failure_clusters
               WHERE pattern_id IS ? AND failure_mode = ? AND status NOT IN ('resolved', 'dismissed')
               LIMIT 1""",
            (pattern_id, failure_mode),
        ).fetchone()
        if existing:
            cid = existing["id"]
            conn.execute(
                """UPDATE failure_clusters
                   SET severity=?, frequency=?, affected_sessions=?, evidence_json=?, updated_at=?
                   WHERE id=?""",
                (severity, frequency, affected_sessions, json.dumps(evidence), now, cid),
            )
        else:
            cid = str(uuid.uuid4())
            conn.execute(
                """INSERT INTO failure_clusters
                   (id, pattern_id, environment, subject_type, failure_mode, severity,
                    frequency, affected_sessions, evidence_json, status, ingested_at, updated_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
                (cid, pattern_id, environment, subject_type, failure_mode, severity,
                 frequency, affected_sessions, json.dumps(evidence), "open", now, now),
            )
    return get_failure_cluster(cid)


def get_failure_clusters(
    status: Optional[str] = None,
    severity: Optional[str] = None,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    with get_db() as conn:
        if status and severity:
            rows = conn.execute(
                "SELECT * FROM failure_clusters WHERE status=? AND severity=? ORDER BY ingested_at DESC LIMIT ?",
                (status, severity, limit),
            ).fetchall()
        elif status:
            rows = conn.execute(
                "SELECT * FROM failure_clusters WHERE status=? ORDER BY ingested_at DESC LIMIT ?",
                (status, limit),
            ).fetchall()
        elif severity:
            rows = conn.execute(
                "SELECT * FROM failure_clusters WHERE severity=? ORDER BY ingested_at DESC LIMIT ?",
                (severity, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM failure_clusters ORDER BY ingested_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
    return [_decode_cluster(r) for r in rows]


def get_failure_cluster(cluster_id: str) -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM failure_clusters WHERE id=?", (cluster_id,)
        ).fetchone()
    return _decode_cluster(row) if row else None


def update_failure_cluster(cluster_id: str, **kwargs) -> Optional[Dict[str, Any]]:
    if not kwargs:
        return get_failure_cluster(cluster_id)
    kwargs["updated_at"] = time.time()
    sets = [f"{k}=?" for k in kwargs]
    vals = list(kwargs.values()) + [cluster_id]
    with get_db() as conn:
        conn.execute(
            f"UPDATE failure_clusters SET {', '.join(sets)} WHERE id=?", vals
        )
    return get_failure_cluster(cluster_id)


def _decode_cluster(row) -> Dict[str, Any]:
    d = dict(row)
    d["evidence"] = json.loads(d.pop("evidence_json", "{}"))
    return d


# ── Candidate Evaluation CRUD ───────────────────────────────────────────────────

def create_candidate_evaluation(
    candidate_id: str,
    eval_type: str,
    total_entries: int,
    pass_before: int,
    pass_after: int,
    pass_delta: int,
    soft_pass_delta: int,
    fail_delta: int,
    regressions: List[Dict[str, Any]],
    affected_patterns: List[str],
    confidence_shift: Optional[float],
    risk_level: str,
    verdict: str,
    notes: Optional[str] = None,
) -> Dict[str, Any]:
    eid = str(uuid.uuid4())
    now = time.time()
    with get_db() as conn:
        conn.execute(
            """INSERT INTO candidate_evaluations
               (id, candidate_id, eval_type, total_entries, pass_before, pass_after,
                pass_delta, soft_pass_delta, fail_delta, regressions_json,
                affected_patterns_json, confidence_shift, risk_level, verdict, notes, ran_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (eid, candidate_id, eval_type, total_entries, pass_before, pass_after,
             pass_delta, soft_pass_delta, fail_delta, json.dumps(regressions),
             json.dumps(affected_patterns), confidence_shift, risk_level, verdict, notes, now),
        )
    return get_candidate_evaluation(eid)


def get_candidate_evaluations(candidate_id: str) -> List[Dict[str, Any]]:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM candidate_evaluations WHERE candidate_id=? ORDER BY ran_at DESC",
            (candidate_id,),
        ).fetchall()
    return [_decode_eval(r) for r in rows]


def get_candidate_evaluation(eval_id: str) -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM candidate_evaluations WHERE id=?", (eval_id,)
        ).fetchone()
    return _decode_eval(row) if row else None


def _decode_eval(row) -> Dict[str, Any]:
    d = dict(row)
    d["regressions"] = json.loads(d.pop("regressions_json", "[]"))
    d["affected_patterns"] = json.loads(d.pop("affected_patterns_json", "[]"))
    return d


# ── Release Attribution CRUD ────────────────────────────────────────────────────

def create_release_attribution(
    candidate_id: str,
    release_version: Optional[str],
    source_cluster_id: Optional[str],
    expected_lift: Dict[str, Any],
    pre_release_baseline: Dict[str, Any],
) -> Dict[str, Any]:
    rid = str(uuid.uuid4())
    now = time.time()
    with get_db() as conn:
        conn.execute(
            """INSERT INTO release_attributions
               (id, candidate_id, release_version, release_date,
                source_cluster_id, expected_lift_json, pre_release_baseline_json, created_at)
               VALUES (?,?,?,?,?,?,?,?)""",
            (rid, candidate_id, release_version, now,
             source_cluster_id, json.dumps(expected_lift), json.dumps(pre_release_baseline), now),
        )
    return get_release_attribution(rid)


def get_release_attributions(limit: int = 50) -> List[Dict[str, Any]]:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM release_attributions ORDER BY release_date DESC LIMIT ?", (limit,)
        ).fetchall()
    return [_decode_attribution(r) for r in rows]


def get_release_attribution(attr_id: str) -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM release_attributions WHERE id=?", (attr_id,)
        ).fetchone()
    return _decode_attribution(row) if row else None


def get_release_attribution_by_candidate(candidate_id: str) -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM release_attributions WHERE candidate_id=? ORDER BY release_date DESC LIMIT 1",
            (candidate_id,),
        ).fetchone()
    return _decode_attribution(row) if row else None


def _decode_attribution(row) -> Dict[str, Any]:
    d = dict(row)
    d["expected_lift"] = json.loads(d.pop("expected_lift_json", "{}"))
    d["pre_release_baseline"] = json.loads(d.pop("pre_release_baseline_json", "{}"))
    return d


# ── Monitoring Snapshot CRUD ────────────────────────────────────────────────────

def create_monitoring_snapshot(
    attribution_id: str,
    window_days: int,
    success_rate_delta: Optional[float],
    confidence_delta: Optional[float],
    conversion_delta: Optional[float],
    trust_delta: Optional[float],
    alert_type: Optional[str],
    snapshot: Dict[str, Any],
) -> Dict[str, Any]:
    sid = str(uuid.uuid4())
    now = time.time()
    with get_db() as conn:
        conn.execute(
            """INSERT INTO monitoring_snapshots
               (id, attribution_id, window_days, measured_at, success_rate_delta,
                confidence_delta, conversion_delta, trust_delta, alert_type, snapshot_json)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (sid, attribution_id, window_days, now, success_rate_delta,
             confidence_delta, conversion_delta, trust_delta, alert_type, json.dumps(snapshot)),
        )
    return get_monitoring_snapshot(sid)


def get_monitoring_snapshots(attribution_id: str) -> List[Dict[str, Any]]:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM monitoring_snapshots WHERE attribution_id=? ORDER BY measured_at DESC",
            (attribution_id,),
        ).fetchall()
    return [_decode_snapshot(r) for r in rows]


def get_monitoring_snapshot(snap_id: str) -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM monitoring_snapshots WHERE id=?", (snap_id,)
        ).fetchone()
    return _decode_snapshot(row) if row else None


def get_active_monitoring_alerts() -> List[Dict[str, Any]]:
    """Return all snapshots with a non-null alert_type."""
    with get_db() as conn:
        rows = conn.execute(
            """SELECT ms.*, ra.candidate_id, ra.release_version
               FROM monitoring_snapshots ms
               JOIN release_attributions ra ON ms.attribution_id = ra.id
               WHERE ms.alert_type IS NOT NULL
               ORDER BY ms.measured_at DESC LIMIT 50""",
        ).fetchall()
    return [_decode_snapshot(r) for r in rows]


def _decode_snapshot(row) -> Dict[str, Any]:
    d = dict(row)
    d["snapshot"] = json.loads(d.pop("snapshot_json", "{}"))
    return d
