"""
Failure Events — detailed MISSED_IT capture for the learning pipeline.

Every confirmed failure (outcome='failed') produces one failure_event record.
These feed the classification + clustering pipeline, separate from the
lighter session_signals table so the signal table stays fast.

Tables
------
  failure_events  — one row per user-confirmed failure, rich context
  failure_feedback — optional structured reason collected after failure

Signal flow:
  OutcomeCapture(failed)
    → POST /api/failures/event
      → failure_event inserted
        → classifier tags failure_class
          → ingestion groups into failure_cluster
            → auto_candidate generates rule proposal
"""
from __future__ import annotations

import json
import time
import uuid
from typing import Any, Dict, List, Optional

from db.database import get_db


# ── Schema ─────────────────────────────────────────────────────────────────────

def init_failure_tables() -> None:
    """Create failure tracking tables if they don't exist."""
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS failure_events (
                id                  TEXT PRIMARY KEY,
                session_id          TEXT,
                user_id             TEXT,
                predicted_pattern   TEXT NOT NULL,
                confidence          REAL,
                signal_quality      REAL,
                blueprint_id        TEXT,
                image_hash          TEXT,
                failure_class       TEXT,
                subject_type        TEXT,
                environment         TEXT,
                shadow_density      REAL,
                lighting_geometry   TEXT,
                edge_case_flags_json TEXT NOT NULL DEFAULT '{}',
                raw_context_json    TEXT NOT NULL DEFAULT '{}',
                created_at          REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_fe_pattern
                ON failure_events(predicted_pattern);
            CREATE INDEX IF NOT EXISTS idx_fe_class
                ON failure_events(failure_class);
            CREATE INDEX IF NOT EXISTS idx_fe_user
                ON failure_events(user_id);
            CREATE INDEX IF NOT EXISTS idx_fe_created
                ON failure_events(created_at);

            CREATE TABLE IF NOT EXISTS failure_feedback (
                id              TEXT PRIMARY KEY,
                failure_event_id TEXT NOT NULL,
                session_id      TEXT,
                reason          TEXT,
                free_text       TEXT,
                created_at      REAL NOT NULL,
                FOREIGN KEY (failure_event_id) REFERENCES failure_events(id)
            );
            CREATE INDEX IF NOT EXISTS idx_ff_event
                ON failure_feedback(failure_event_id);
        """)


# ── CRUD ───────────────────────────────────────────────────────────────────────

def record_failure_event(
    predicted_pattern: str,
    session_id: Optional[str] = None,
    user_id: Optional[str] = None,
    confidence: Optional[float] = None,
    signal_quality: Optional[float] = None,
    blueprint_id: Optional[str] = None,
    image_hash: Optional[str] = None,
    failure_class: Optional[str] = None,
    subject_type: Optional[str] = None,
    environment: Optional[str] = None,
    shadow_density: Optional[float] = None,
    lighting_geometry: Optional[str] = None,
    edge_case_flags: Optional[Dict] = None,
    raw_context: Optional[Dict] = None,
) -> str:
    """Insert a failure event. Returns the new row ID."""
    row_id = str(uuid.uuid4())
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO failure_events
              (id, session_id, user_id, predicted_pattern, confidence,
               signal_quality, blueprint_id, image_hash, failure_class,
               subject_type, environment, shadow_density, lighting_geometry,
               edge_case_flags_json, raw_context_json, created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                row_id, session_id, user_id, predicted_pattern,
                confidence, signal_quality, blueprint_id, image_hash,
                failure_class, subject_type, environment, shadow_density,
                lighting_geometry,
                json.dumps(edge_case_flags or {}),
                json.dumps(raw_context or {}),
                time.time(),
            ),
        )
    return row_id


def set_failure_class(failure_event_id: str, failure_class: str) -> None:
    """Update the failure_class after async classification."""
    with get_db() as conn:
        conn.execute(
            "UPDATE failure_events SET failure_class=? WHERE id=?",
            (failure_class, failure_event_id),
        )


def record_failure_feedback(
    failure_event_id: str,
    reason: str,
    session_id: Optional[str] = None,
    free_text: Optional[str] = None,
) -> str:
    """Store structured user feedback after a failure."""
    row_id = str(uuid.uuid4())
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO failure_feedback
              (id, failure_event_id, session_id, reason, free_text, created_at)
            VALUES (?,?,?,?,?,?)
            """,
            (row_id, failure_event_id, session_id, reason, free_text, time.time()),
        )
    return row_id


# ── Queries ────────────────────────────────────────────────────────────────────

def get_failure_events(
    pattern: Optional[str] = None,
    failure_class: Optional[str] = None,
    days: int = 30,
    limit: int = 200,
) -> List[Dict[str, Any]]:
    """List recent failure events, optionally filtered."""
    cutoff = time.time() - days * 86400
    conditions = ["created_at >= ?"]
    params: list = [cutoff]
    if pattern:
        conditions.append("predicted_pattern = ?")
        params.append(pattern)
    if failure_class:
        conditions.append("failure_class = ?")
        params.append(failure_class)
    params.append(limit)

    where = " AND ".join(conditions)
    with get_db() as conn:
        rows = conn.execute(
            f"SELECT * FROM failure_events WHERE {where} ORDER BY created_at DESC LIMIT ?",
            params,
        ).fetchall()
    return [dict(r) for r in rows]


def get_failure_stats(days: int = 30) -> List[Dict[str, Any]]:
    """
    Per-pattern failure stats used by the ingestion pipeline.
    Returns: pattern, total_failures, avg_confidence, class breakdown counts.
    """
    cutoff = time.time() - days * 86400
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT
                predicted_pattern,
                COUNT(*)                                        AS total_failures,
                AVG(confidence)                                 AS avg_confidence,
                AVG(signal_quality)                             AS avg_signal_quality,
                SUM(CASE WHEN failure_class='misclassification'    THEN 1 ELSE 0 END) AS n_misclass,
                SUM(CASE WHEN failure_class='blueprint_failure'     THEN 1 ELSE 0 END) AS n_blueprint,
                SUM(CASE WHEN failure_class='low_confidence'        THEN 1 ELSE 0 END) AS n_low_conf,
                SUM(CASE WHEN failure_class='edge_case'             THEN 1 ELSE 0 END) AS n_edge
            FROM failure_events
            WHERE created_at >= ?
            GROUP BY predicted_pattern
            ORDER BY total_failures DESC
            """,
            (cutoff,),
        ).fetchall()
    return [dict(r) for r in rows]


def get_feedback_loop_stats(days: int = 30) -> Dict[str, Any]:
    """
    Macro stats for the feedback loop dashboard.
    Compares failure events to overall session_signals to derive:
      - missed_it_rate per pattern
      - high-confidence failure rate (the worst kind — system was confident + wrong)
    """
    cutoff = time.time() - days * 86400
    with get_db() as conn:
        total_failures = conn.execute(
            "SELECT COUNT(*) FROM failure_events WHERE created_at >= ?", (cutoff,)
        ).fetchone()[0]

        by_class = conn.execute(
            """
            SELECT failure_class, COUNT(*) AS n
            FROM failure_events WHERE created_at >= ?
            GROUP BY failure_class
            """,
            (cutoff,),
        ).fetchall()

        high_conf_failures = conn.execute(
            """
            SELECT COUNT(*) FROM failure_events
            WHERE created_at >= ? AND confidence >= 0.65
            """,
            (cutoff,),
        ).fetchone()[0]

        # Compare to total session outcomes
        total_outcomes = conn.execute(
            "SELECT COUNT(*) FROM session_signals WHERE created_at >= ? AND include_in_metrics=1",
            (cutoff,),
        ).fetchone()[0]

        nailed_it = conn.execute(
            """
            SELECT COUNT(*) FROM session_signals
            WHERE created_at >= ? AND outcome='nailed_it' AND include_in_metrics=1
            """,
            (cutoff,),
        ).fetchone()[0]

    missed_it_rate = round(total_failures / total_outcomes * 100, 1) if total_outcomes else 0.0
    nailed_it_rate = round(nailed_it / total_outcomes * 100, 1) if total_outcomes else 0.0

    return {
        "days": days,
        "total_failures": total_failures,
        "total_outcomes": total_outcomes,
        "missed_it_rate_pct": missed_it_rate,
        "nailed_it_rate_pct": nailed_it_rate,
        "high_confidence_failures": high_conf_failures,
        "by_class": {r["failure_class"]: r["n"] for r in by_class},
    }
