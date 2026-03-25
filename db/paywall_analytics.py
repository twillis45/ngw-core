"""
Paywall Analytics DB — Part 16.11
Tables:
  paywall_impressions       — every paywall shown with state + price + outcome
  paywall_pricing_snapshots — periodic performance snapshots for dashboard
"""
from __future__ import annotations

import json
import time
import uuid
from typing import Any, Dict, List, Optional

from db.database import get_db


# ── Schema init ───────────────────────────────────────────────────────────────

def init_paywall_analytics_tables() -> None:
    """Create tables if they don't already exist."""
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS paywall_impressions (
                id                  TEXT PRIMARY KEY,
                session_id          TEXT,
                user_id             TEXT,
                value_state         TEXT    NOT NULL,
                price_shown         INTEGER NOT NULL,
                price_monthly       INTEGER NOT NULL,
                messaging_variant   TEXT,
                cta_variant         TEXT,
                trigger_type        TEXT,
                guardrail_applied   INTEGER DEFAULT 0,
                experiment_variant  TEXT,
                converted           INTEGER DEFAULT 0,
                converted_at        REAL,
                dismissed           INTEGER DEFAULT 0,
                dismissed_at        REAL,
                created_at          REAL    NOT NULL
            )
        """)
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_pi_session  ON paywall_impressions(session_id)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_pi_user     ON paywall_impressions(user_id)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_pi_state    ON paywall_impressions(value_state)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_pi_created  ON paywall_impressions(created_at)"
        )

        conn.execute("""
            CREATE TABLE IF NOT EXISTS paywall_pricing_snapshots (
                id            TEXT PRIMARY KEY,
                computed_at   REAL    NOT NULL,
                window_days   INTEGER DEFAULT 30,
                snapshot_json TEXT    NOT NULL
            )
        """)
        conn.commit()


# ── Write operations ──────────────────────────────────────────────────────────

def record_paywall_impression(
    value_state:        str,
    price_shown:        int,
    session_id:         Optional[str] = None,
    user_id:            Optional[str] = None,
    messaging_variant:  Optional[str] = None,
    cta_variant:        Optional[str] = None,
    trigger_type:       Optional[str] = None,
    guardrail_applied:  bool = False,
    experiment_variant: Optional[str] = None,
) -> str:
    """
    Record that a paywall was shown with a specific state and price.
    Returns the impression_id (UUID) for downstream conversion/dismiss tracking.
    """
    impression_id = str(uuid.uuid4())
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO paywall_impressions
              (id, session_id, user_id, value_state, price_shown, price_monthly,
               messaging_variant, cta_variant, trigger_type, guardrail_applied,
               experiment_variant, created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
            """,
            (
                impression_id,
                session_id,
                user_id,
                value_state,
                price_shown,
                price_shown,           # price_monthly = price_shown (monthly billing)
                messaging_variant,
                cta_variant,
                trigger_type,
                1 if guardrail_applied else 0,
                experiment_variant,
                time.time(),
            ),
        )
        conn.commit()
    return impression_id


def mark_impression_converted(impression_id: str) -> None:
    """Mark an impression as converted (upgrade flow started)."""
    with get_db() as conn:
        conn.execute(
            "UPDATE paywall_impressions SET converted=1, converted_at=? WHERE id=?",
            (time.time(), impression_id),
        )
        conn.commit()


def mark_impression_dismissed(impression_id: str) -> None:
    """Mark an impression as dismissed."""
    with get_db() as conn:
        conn.execute(
            "UPDATE paywall_impressions SET dismissed=1, dismissed_at=? WHERE id=?",
            (time.time(), impression_id),
        )
        conn.commit()


# ── Read operations ───────────────────────────────────────────────────────────

def get_paywall_performance(days: int = 30) -> List[Dict[str, Any]]:
    """
    Paywall performance by value state — for ExecDashboard Part 16.11 table.

    Returns per-state:
        value_state, impressions, conversions, conversion_rate (%),
        avg_price, revenue_per_user
    """
    cutoff = time.time() - days * 86400
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT
                value_state,
                COUNT(*)                                         AS impressions,
                SUM(converted)                                   AS conversions,
                ROUND(AVG(price_shown), 2)                       AS avg_price,
                ROUND(
                    CAST(SUM(converted) AS FLOAT) /
                    NULLIF(COUNT(*), 0) * 100, 1
                )                                                AS conversion_rate,
                ROUND(
                    CAST(SUM(converted) AS FLOAT) *
                    AVG(price_shown) /
                    NULLIF(COUNT(DISTINCT COALESCE(user_id, session_id)), 0), 2
                )                                                AS revenue_per_user
            FROM paywall_impressions
            WHERE created_at >= ?
            GROUP BY value_state
            ORDER BY conversion_rate DESC
            """,
            (cutoff,),
        ).fetchall()
    return [dict(r) for r in rows]


def save_pricing_snapshot(days: int = 30) -> None:
    """Persist current performance data as a snapshot for trend analysis."""
    snapshot = get_paywall_performance(days=days)
    with get_db() as conn:
        conn.execute(
            """
            INSERT INTO paywall_pricing_snapshots (id, computed_at, window_days, snapshot_json)
            VALUES (?,?,?,?)
            """,
            (str(uuid.uuid4()), time.time(), days, json.dumps(snapshot)),
        )
        conn.commit()
