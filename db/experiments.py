"""
Experiment assignment and event storage.

Tables:
  experiment_assignments  — which bucket/variant each session got for each flag
  experiment_events       — conversion events tagged with flag + variant
"""
from __future__ import annotations

import hashlib
import json
import time
from typing import Any, Dict, List, Optional

from db.database import get_db


# ── Schema ──────────────────────────────────────────────────────────────────

def init_experiments_tables() -> None:
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS experiment_assignments (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id  TEXT NOT NULL,
                flag_name   TEXT NOT NULL,
                variant     TEXT NOT NULL,
                bucket      INTEGER NOT NULL,
                assigned_at REAL NOT NULL,
                UNIQUE(session_id, flag_name)
            );
            CREATE INDEX IF NOT EXISTS idx_exp_assign_flag
                ON experiment_assignments(flag_name, variant);
            CREATE INDEX IF NOT EXISTS idx_exp_assign_session
                ON experiment_assignments(session_id);

            CREATE TABLE IF NOT EXISTS experiment_events (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id  TEXT NOT NULL,
                flag_name   TEXT NOT NULL,
                variant     TEXT NOT NULL,
                event_name  TEXT NOT NULL,
                data_json   TEXT NOT NULL DEFAULT '{}',
                created_at  REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_exp_events_flag
                ON experiment_events(flag_name, variant, event_name);
            CREATE INDEX IF NOT EXISTS idx_exp_events_session
                ON experiment_events(session_id);
        """)


# ── Assignment ───────────────────────────────────────────────────────────────

def _bucket(session_id: str, flag_name: str) -> int:
    """Deterministic bucket 0–99 from hash of session+flag."""
    h = hashlib.sha256(f"{session_id}:{flag_name}".encode()).hexdigest()
    return int(h[:8], 16) % 100


def assign_flag(session_id: str, flag_name: str, flag_def: Dict) -> str:
    """
    Return the variant for this session+flag.
    Persists the assignment for consistency (first assignment wins).
    Returns 'control' if flag is disabled or session is outside rollout_pct.
    Returns 'treatment' if session is inside rollout_pct.
    """
    if not flag_def.get("enabled", False):
        return "control"

    rollout_pct = flag_def.get("rollout_pct", 0)
    bucket = _bucket(session_id, flag_name)
    variant = "treatment" if bucket < rollout_pct else "control"

    try:
        with get_db() as conn:
            conn.execute(
                """
                INSERT OR IGNORE INTO experiment_assignments
                    (session_id, flag_name, variant, bucket, assigned_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (session_id, flag_name, variant, bucket, time.time()),
            )
    except Exception:
        pass  # Never block on assignment persistence failure

    return variant


def get_assignment(session_id: str, flag_name: str) -> Optional[str]:
    """Return existing persisted variant, or None if not yet assigned."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT variant FROM experiment_assignments WHERE session_id=? AND flag_name=?",
            (session_id, flag_name),
        ).fetchone()
    return row["variant"] if row else None


# ── Events ───────────────────────────────────────────────────────────────────

def record_experiment_event(
    session_id: str,
    flag_name: str,
    variant: str,
    event_name: str,
    data: Optional[Dict[str, Any]] = None,
) -> None:
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO experiment_events
                (session_id, flag_name, variant, event_name, data_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (session_id, flag_name, variant, event_name,
             json.dumps(data or {}), time.time()),
        )


# ── Metrics ──────────────────────────────────────────────────────────────────

def get_experiment_metrics(flag_name: str, days: int = 30) -> Dict:
    """
    Return per-variant metrics for a flag.
    Includes: sessions, analyses, conversions, conversion_rate, revenue_est, arpu_est.
    """
    cutoff = time.time() - days * 86400

    with get_db() as conn:
        sessions_rows = conn.execute(
            """
            SELECT variant, COUNT(DISTINCT session_id) AS cnt
            FROM experiment_assignments
            WHERE flag_name=? AND assigned_at >= ?
            GROUP BY variant
            """,
            (flag_name, cutoff),
        ).fetchall()

        events_rows = conn.execute(
            """
            SELECT variant, event_name, COUNT(*) AS cnt
            FROM experiment_events
            WHERE flag_name=? AND created_at >= ?
            GROUP BY variant, event_name
            """,
            (flag_name, cutoff),
        ).fetchall()

    by_variant: Dict[str, Dict] = {}

    for row in sessions_rows:
        v = row["variant"]
        by_variant[v] = {
            "variant": v,
            "sessions": row["cnt"],
            "analyses": 0,
            "conversions": 0,
            "paywall_hits": 0,
            "nailed_its": 0,
            "conversion_rate": 0.0,
            "revenue_est": 0.0,
            "arpu_est": 0.0,
        }

    for row in events_rows:
        v = row["variant"]
        if v not in by_variant:
            by_variant[v] = {
                "variant": v, "sessions": 0, "analyses": 0,
                "conversions": 0, "paywall_hits": 0, "nailed_its": 0,
                "conversion_rate": 0.0, "revenue_est": 0.0, "arpu_est": 0.0,
            }
        name = row["event_name"]
        cnt = row["cnt"]
        if name == "SHOOT_MATCHED":
            by_variant[v]["analyses"] += cnt
        elif name in ("UPGRADE_CLICKED", "UPGRADE_COMPLETED"):
            by_variant[v]["conversions"] += cnt
        elif name == "PAYWALL_TRIGGERED":
            by_variant[v]["paywall_hits"] += cnt
        elif name in ("OUTCOME_NAILED_IT", "OUTCOME_CLOSE"):
            by_variant[v]["nailed_its"] += cnt

    for _v, m in by_variant.items():
        s = m["sessions"] or 1
        c = m["conversions"]
        m["conversion_rate"] = round(c / s * 100, 1)
        # Revenue estimate at $39 base — overridden per pricing flag
        m["revenue_est"] = round(c * 39.0, 2)
        m["arpu_est"] = round(m["revenue_est"] / s, 2)

    return {
        "flag_name": flag_name,
        "days": days,
        "variants": list(by_variant.values()),
    }


def get_all_experiment_metrics(days: int = 30) -> List[Dict]:
    """Return metrics for every flag that has any assignments in the window."""
    cutoff = time.time() - days * 86400
    with get_db() as conn:
        rows = conn.execute(
            "SELECT DISTINCT flag_name FROM experiment_assignments WHERE assigned_at >= ?",
            (cutoff,),
        ).fetchall()
    return [get_experiment_metrics(row["flag_name"], days) for row in rows]


# ── Decision Engine ──────────────────────────────────────────────────────────

def generate_candidates(days: int = 30) -> List[Dict]:
    """
    Evaluate all active experiments and generate promote/rollback/hold candidates.

    PROMOTE:  treatment CVR >= control + 5pp AND ARPU >= control
              OR ARPU delta >= $5 with CVR delta >= -3pp
    ROLLBACK: treatment CVR <= control - 10pp
    HOLD:     mixed results or insufficient data (< 50 treatment sessions)
    """
    all_metrics = get_all_experiment_metrics(days)
    candidates = []

    for exp in all_metrics:
        variants = {v["variant"]: v for v in exp["variants"]}
        control = variants.get("control")
        treatment = variants.get("treatment")

        if not control or not treatment:
            continue
        if treatment["sessions"] < 50:
            continue  # Not enough data for a decision

        ctrl_cvr = control["conversion_rate"]
        trt_cvr = treatment["conversion_rate"]
        ctrl_arpu = control["arpu_est"]
        trt_arpu = treatment["arpu_est"]
        cvr_delta = round(trt_cvr - ctrl_cvr, 1)
        arpu_delta = round(trt_arpu - ctrl_arpu, 2)

        if cvr_delta >= 5 and trt_arpu >= ctrl_arpu:
            action = "PROMOTE"
            reason = (
                f"Conversion +{cvr_delta}pp vs control "
                f"(ARPU ${trt_arpu:.2f} vs control ${ctrl_arpu:.2f})"
            )
        elif arpu_delta >= 5 and cvr_delta >= -3:
            action = "PROMOTE"
            reason = (
                f"ARPU +${arpu_delta:.2f} with only {cvr_delta}pp conversion impact — "
                "revenue-positive trade-off"
            )
        elif cvr_delta <= -10:
            action = "ROLLBACK"
            reason = (
                f"Conversion -{abs(cvr_delta)}pp vs control — "
                "hurting conversion significantly"
            )
        else:
            action = "HOLD"
            reason = "Mixed or insufficient signal — continue collecting data"

        candidates.append({
            "flag_name": exp["flag_name"],
            "action": action,
            "reason": reason,
            "cvr_delta_pp": cvr_delta,
            "arpu_delta": arpu_delta,
            "control": {
                "sessions": control["sessions"],
                "cvr": ctrl_cvr,
                "arpu": ctrl_arpu,
            },
            "treatment": {
                "sessions": treatment["sessions"],
                "cvr": trt_cvr,
                "arpu": trt_arpu,
            },
            # Composite score: conversion probability × revenue per user
            "composite_score": round((trt_cvr / 100) * trt_arpu, 3),
        })

    # Sort: PROMOTE first, then HOLD, then ROLLBACK; within each by composite_score desc
    order = {"PROMOTE": 0, "HOLD": 1, "ROLLBACK": 2}
    candidates.sort(key=lambda c: (order.get(c["action"], 9), -c["composite_score"]))
    return candidates
