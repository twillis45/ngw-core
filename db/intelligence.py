"""
Intelligence System — Database Layer
=====================================
Tables:
  nailed_it_events     — rich NAILED_IT captures (mirrors failure_events)
  intelligence_snapshots — global score history (computed on demand / scheduled)
  pattern_intelligence — per-pattern score history
  autonomy_log         — full audit trail for every autonomous action
  autonomy_queue       — pending MEDIUM/HIGH risk decisions awaiting approval
"""
from __future__ import annotations

import json
import time
import uuid
from typing import Any, Dict, List, Optional

from db.database import get_db


# ── Schema ─────────────────────────────────────────────────────────────────────

def init_intelligence_tables() -> None:
    with get_db() as conn:
        conn.executescript("""
            -- Rich NAILED_IT events — symmetric with failure_events
            CREATE TABLE IF NOT EXISTS nailed_it_events (
                id                TEXT PRIMARY KEY,
                session_id        TEXT,
                user_id           TEXT,
                predicted_pattern TEXT NOT NULL,
                confidence        REAL,
                signal_quality    REAL,
                blueprint_id      TEXT,
                image_hash        TEXT,
                subject_type      TEXT,
                environment       TEXT,
                shadow_density    REAL,
                lighting_geometry TEXT,
                edge_case_flags   TEXT DEFAULT '{}',
                created_at        REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_nit_pattern ON nailed_it_events(predicted_pattern);
            CREATE INDEX IF NOT EXISTS idx_nit_created ON nailed_it_events(created_at);
            CREATE INDEX IF NOT EXISTS idx_nit_user    ON nailed_it_events(user_id);

            -- Global intelligence score snapshots
            CREATE TABLE IF NOT EXISTS intelligence_snapshots (
                id                          TEXT PRIMARY KEY,
                computed_at                 REAL NOT NULL,
                window_days                 INTEGER DEFAULT 30,
                score                       REAL NOT NULL,
                nailed_it_rate              REAL,
                missed_it_rate              REAL,
                high_conf_missed_rate       REAL,
                confidence_alignment        REAL,
                high_value_signal_rate      REAL,
                total_outcomes              INTEGER,
                total_nailed_it             INTEGER,
                total_missed_it             INTEGER,
                components_json             TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_intel_snap_at ON intelligence_snapshots(computed_at);

            -- Per-pattern intelligence scores
            CREATE TABLE IF NOT EXISTS pattern_intelligence (
                id                          TEXT PRIMARY KEY,
                computed_at                 REAL NOT NULL,
                window_days                 INTEGER DEFAULT 30,
                pattern                     TEXT NOT NULL,
                score                       REAL NOT NULL,
                nailed_it_rate              REAL,
                missed_it_rate              REAL,
                high_conf_missed_rate       REAL,
                confidence_alignment        REAL,
                signal_quality_avg          REAL,
                usage_count                 INTEGER,
                sufficient_data             INTEGER DEFAULT 1,
                priority_level              TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_pat_intel_pattern ON pattern_intelligence(pattern);
            CREATE INDEX IF NOT EXISTS idx_pat_intel_at      ON pattern_intelligence(computed_at);

            -- Full audit log for every autonomous decision
            CREATE TABLE IF NOT EXISTS autonomy_log (
                action_id           TEXT PRIMARY KEY,
                created_at          REAL NOT NULL,
                action_type         TEXT NOT NULL,
                scope               TEXT NOT NULL,
                risk_tier           TEXT NOT NULL,
                status              TEXT NOT NULL DEFAULT 'pending',
                previous_state_json TEXT,
                new_state_json      TEXT,
                trigger_metrics_json TEXT,
                expected_outcome    TEXT,
                actual_outcome      TEXT,
                rollback_path_json  TEXT,
                approved_by         TEXT,
                applied_at          REAL,
                reverted_at         REAL,
                revert_reason       TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_autlog_created ON autonomy_log(created_at);
            CREATE INDEX IF NOT EXISTS idx_autlog_status  ON autonomy_log(status);
            CREATE INDEX IF NOT EXISTS idx_autlog_scope   ON autonomy_log(scope);

            -- Queue for pending MEDIUM/HIGH risk actions needing approval
            CREATE TABLE IF NOT EXISTS autonomy_queue (
                action_id           TEXT PRIMARY KEY,
                created_at          REAL NOT NULL,
                action_type         TEXT NOT NULL,
                scope               TEXT NOT NULL,
                risk_tier           TEXT NOT NULL,
                payload_json        TEXT NOT NULL,
                trigger_metrics_json TEXT,
                status              TEXT NOT NULL DEFAULT 'pending'
            );
            CREATE INDEX IF NOT EXISTS idx_autq_status ON autonomy_queue(status);
        """)


# ── NAILED_IT events ───────────────────────────────────────────────────────────

def record_nailed_it_event(
    predicted_pattern: str,
    session_id: Optional[str] = None,
    user_id: Optional[str] = None,
    confidence: Optional[float] = None,
    signal_quality: Optional[float] = None,
    blueprint_id: Optional[str] = None,
    image_hash: Optional[str] = None,
    subject_type: Optional[str] = None,
    environment: Optional[str] = None,
    shadow_density: Optional[float] = None,
    lighting_geometry: Optional[str] = None,
    edge_case_flags: Optional[Dict[str, Any]] = None,
) -> str:
    event_id = str(uuid.uuid4())
    with get_db() as conn:
        conn.execute(
            """INSERT INTO nailed_it_events (
                id, session_id, user_id, predicted_pattern, confidence,
                signal_quality, blueprint_id, image_hash, subject_type,
                environment, shadow_density, lighting_geometry,
                edge_case_flags, created_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                event_id, session_id, user_id, predicted_pattern, confidence,
                signal_quality, blueprint_id, image_hash, subject_type,
                environment, shadow_density, lighting_geometry,
                json.dumps(edge_case_flags or {}), time.time(),
            ),
        )
    return event_id


def get_nailed_it_events(
    pattern: Optional[str] = None,
    days: int = 30,
    limit: int = 500,
) -> List[Dict[str, Any]]:
    cutoff = time.time() - days * 86400
    with get_db() as conn:
        if pattern:
            rows = conn.execute(
                "SELECT * FROM nailed_it_events WHERE predicted_pattern=? AND created_at>=? ORDER BY created_at DESC LIMIT ?",
                (pattern, cutoff, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM nailed_it_events WHERE created_at>=? ORDER BY created_at DESC LIMIT ?",
                (cutoff, limit),
            ).fetchall()
    return [dict(r) for r in rows]


# ── Intelligence snapshots ─────────────────────────────────────────────────────

def save_intelligence_snapshot(
    score: float,
    components: Dict[str, Any],
    window_days: int = 30,
) -> str:
    snap_id = str(uuid.uuid4())
    c = components
    with get_db() as conn:
        conn.execute(
            """INSERT INTO intelligence_snapshots (
                id, computed_at, window_days, score,
                nailed_it_rate, missed_it_rate, high_conf_missed_rate,
                confidence_alignment, high_value_signal_rate,
                total_outcomes, total_nailed_it, total_missed_it, components_json
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                snap_id, time.time(), window_days, round(score, 2),
                c.get("nailed_it_rate"), c.get("missed_it_rate"),
                c.get("high_conf_missed_rate"), c.get("confidence_alignment"),
                c.get("high_value_signal_rate"),
                c.get("total_outcomes"), c.get("total_nailed_it"),
                c.get("total_missed_it"), json.dumps(c),
            ),
        )
    return snap_id


def get_intelligence_history(limit: int = 30, window_days: int = 30) -> List[Dict[str, Any]]:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM intelligence_snapshots WHERE window_days=? ORDER BY computed_at DESC LIMIT ?",
            (window_days, limit),
        ).fetchall()
    return [dict(r) for r in rows]


def get_latest_intelligence_snapshot(window_days: int = 30) -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM intelligence_snapshots WHERE window_days=? ORDER BY computed_at DESC LIMIT 1",
            (window_days,),
        ).fetchone()
    return dict(row) if row else None


# ── Pattern intelligence ───────────────────────────────────────────────────────

def save_pattern_intelligence_batch(
    scores: List[Dict[str, Any]],
    window_days: int = 30,
) -> int:
    now = time.time()
    with get_db() as conn:
        for s in scores:
            conn.execute(
                """INSERT INTO pattern_intelligence (
                    id, computed_at, window_days, pattern, score,
                    nailed_it_rate, missed_it_rate, high_conf_missed_rate,
                    confidence_alignment, signal_quality_avg,
                    usage_count, sufficient_data, priority_level
                ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    str(uuid.uuid4()), now, window_days,
                    s["pattern"], round(s["score"], 2),
                    s.get("nailed_it_rate"), s.get("missed_it_rate"),
                    s.get("high_conf_missed_rate"), s.get("confidence_alignment"),
                    s.get("signal_quality_avg"), s.get("usage_count", 0),
                    1 if s.get("sufficient_data", True) else 0,
                    s.get("priority_level"),
                ),
            )
    return len(scores)


def get_latest_pattern_scores(window_days: int = 30) -> List[Dict[str, Any]]:
    """Return most recent score per pattern."""
    with get_db() as conn:
        rows = conn.execute(
            """SELECT p.* FROM pattern_intelligence p
               INNER JOIN (
                   SELECT pattern, MAX(computed_at) AS max_at
                   FROM pattern_intelligence WHERE window_days=?
                   GROUP BY pattern
               ) latest ON p.pattern=latest.pattern AND p.computed_at=latest.max_at""",
            (window_days,),
        ).fetchall()
    return [dict(r) for r in rows]


# ── Autonomy log ───────────────────────────────────────────────────────────────

def log_autonomy_action(
    action_type: str,
    scope: str,
    risk_tier: str,
    status: str,
    previous_state: Dict[str, Any],
    new_state: Dict[str, Any],
    trigger_metrics: Dict[str, Any],
    expected_outcome: str,
    rollback_path: Optional[Dict[str, Any]] = None,
) -> str:
    action_id = str(uuid.uuid4())
    with get_db() as conn:
        conn.execute(
            """INSERT INTO autonomy_log (
                action_id, created_at, action_type, scope, risk_tier, status,
                previous_state_json, new_state_json, trigger_metrics_json,
                expected_outcome, rollback_path_json
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (
                action_id, time.time(), action_type, scope, risk_tier, status,
                json.dumps(previous_state), json.dumps(new_state),
                json.dumps(trigger_metrics), expected_outcome,
                json.dumps(rollback_path or {}),
            ),
        )
    return action_id


def update_autonomy_action(
    action_id: str,
    status: str,
    actual_outcome: Optional[str] = None,
    applied_at: Optional[float] = None,
    reverted_at: Optional[float] = None,
    revert_reason: Optional[str] = None,
    approved_by: Optional[str] = None,
) -> None:
    with get_db() as conn:
        conn.execute(
            """UPDATE autonomy_log SET
                status=?, actual_outcome=COALESCE(?,actual_outcome),
                applied_at=COALESCE(?,applied_at),
                reverted_at=COALESCE(?,reverted_at),
                revert_reason=COALESCE(?,revert_reason),
                approved_by=COALESCE(?,approved_by)
               WHERE action_id=?""",
            (status, actual_outcome, applied_at, reverted_at,
             revert_reason, approved_by, action_id),
        )


def get_autonomy_log(
    limit: int = 50,
    risk_tier: Optional[str] = None,
    status: Optional[str] = None,
) -> List[Dict[str, Any]]:
    with get_db() as conn:
        if risk_tier and status:
            rows = conn.execute(
                "SELECT * FROM autonomy_log WHERE risk_tier=? AND status=? ORDER BY created_at DESC LIMIT ?",
                (risk_tier, status, limit),
            ).fetchall()
        elif risk_tier:
            rows = conn.execute(
                "SELECT * FROM autonomy_log WHERE risk_tier=? ORDER BY created_at DESC LIMIT ?",
                (risk_tier, limit),
            ).fetchall()
        elif status:
            rows = conn.execute(
                "SELECT * FROM autonomy_log WHERE status=? ORDER BY created_at DESC LIMIT ?",
                (status, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM autonomy_log ORDER BY created_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
    return [dict(r) for r in rows]


# ── Autonomy queue ─────────────────────────────────────────────────────────────

def enqueue_autonomy_action(
    action_type: str,
    scope: str,
    risk_tier: str,
    payload: Dict[str, Any],
    trigger_metrics: Dict[str, Any],
) -> str:
    action_id = str(uuid.uuid4())
    with get_db() as conn:
        conn.execute(
            """INSERT INTO autonomy_queue (
                action_id, created_at, action_type, scope, risk_tier,
                payload_json, trigger_metrics_json, status
            ) VALUES (?,?,?,?,?,?,?,?)""",
            (
                action_id, time.time(), action_type, scope, risk_tier,
                json.dumps(payload), json.dumps(trigger_metrics), "pending",
            ),
        )
    return action_id


def get_autonomy_queue(status: str = "pending") -> List[Dict[str, Any]]:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM autonomy_queue WHERE status=? ORDER BY created_at ASC",
            (status,),
        ).fetchall()
    return [dict(r) for r in rows]


def resolve_autonomy_queue_item(action_id: str, status: str) -> None:
    with get_db() as conn:
        conn.execute(
            "UPDATE autonomy_queue SET status=? WHERE action_id=?",
            (status, action_id),
        )


# ── Throttle helpers ───────────────────────────────────────────────────────────

def count_auto_actions_last_24h() -> int:
    """Count LOW-risk auto-applied actions in the last 24 hours (throttle guard)."""
    cutoff = time.time() - 86400
    with get_db() as conn:
        row = conn.execute(
            "SELECT COUNT(*) FROM autonomy_log WHERE risk_tier='LOW' AND status='applied' AND created_at>=?",
            (cutoff,),
        ).fetchone()
    return row[0] if row else 0


def get_last_action_for_scope(scope: str) -> Optional[Dict[str, Any]]:
    """Return most recent action for a scope (cooldown check)."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM autonomy_log WHERE scope=? ORDER BY created_at DESC LIMIT 1",
            (scope,),
        ).fetchone()
    return dict(row) if row else None
