"""Analytics event storage and aggregation."""
from __future__ import annotations

import json
import time
import uuid
from typing import Any, Dict, List, Optional

from db.database import get_db
from db.provenance import EXCL_METRICS, EXCL_COHORTS, EXCL_CONVERSION, EXCL_LEARNING


def _origin_filter(origin: Optional[str], kind: str = 'metrics') -> str:
    """
    Return the SQL AND-fragment for filtering analytics events by session origin.

    origin=None / 'all'  → use the standard exclusion-flag filter (existing behavior,
                            production cohort by default).
    origin='production'  → restrict to sessions explicitly classified as production.
    origin='internal'    → restrict to internal + expert_review sessions (ignores
                            the normal exclusion flags so internal traffic is visible).

    kind: 'metrics' | 'conversion' | 'cohorts' | 'learning' — selects which EXCL_*
          constant to fall back to when origin is None/all.
    """
    if not origin or origin == 'all':
        excl_map = {
            'metrics':    EXCL_METRICS,
            'conversion': EXCL_CONVERSION,
            'cohorts':    EXCL_COHORTS,
            'learning':   EXCL_LEARNING,
        }
        return excl_map.get(kind, EXCL_METRICS)

    if origin == 'production':
        return (
            " AND (session_id IS NULL OR session_id IN"
            " (SELECT session_id FROM session_provenance WHERE session_origin='production')) "
        )

    # 'internal' — covers both internal and expert_review
    return (
        " AND (session_id IS NULL OR session_id IN"
        " (SELECT session_id FROM session_provenance"
        "  WHERE session_origin IN ('internal','expert_review'))) "
    )


# ── Schema ────────────────────────────────────────────────────────────────────

def init_analytics_table() -> None:
    """Create analytics_events table if it doesn't exist."""
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS analytics_events (
                id          TEXT PRIMARY KEY,
                name        TEXT NOT NULL,
                user_id     TEXT,
                session_id  TEXT,
                data_json   TEXT NOT NULL DEFAULT '{}',
                created_at  REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_analytics_name ON analytics_events(name);
            CREATE INDEX IF NOT EXISTS idx_analytics_created ON analytics_events(created_at);
            CREATE INDEX IF NOT EXISTS idx_analytics_user ON analytics_events(user_id);
        """)


# ── Write ─────────────────────────────────────────────────────────────────────

def record_event(
    name: str,
    user_id: Optional[str] = None,
    session_id: Optional[str] = None,
    data: Optional[Dict[str, Any]] = None,
) -> None:
    with get_db() as conn:
        conn.execute(
            """INSERT INTO analytics_events (id, name, user_id, session_id, data_json, created_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (str(uuid.uuid4()), name, user_id, session_id, json.dumps(data or {}), time.time()),
        )


# ── Read / Aggregation ────────────────────────────────────────────────────────

# Funnel event ordering — used for conversion % calculation
FUNNEL_EVENTS = [
    "LANDING_VIEW",
    "IMAGE_UPLOADED",
    "ANALYSIS_COMPLETE",
    "FIRST_FIX_SHOWN",
    "PAYWALL_TRIGGERED",
    "UPGRADE_CLICKED",
    "UPGRADE_COMPLETED",
    "SHOOT_MODE_STARTED",
    "MATCH_ACHIEVED",
    "SETUP_SAVED",
]


def get_funnel_stats(days: int = 30, origin: Optional[str] = None) -> List[Dict[str, Any]]:
    """Return count and conversion % for each funnel step."""
    since = time.time() - days * 86400
    excl = _origin_filter(origin, 'metrics')
    with get_db() as conn:
        rows = conn.execute(
            """SELECT name, COUNT(*) as cnt
               FROM analytics_events
               WHERE created_at >= ? AND name IN ({}){}
               GROUP BY name""".format(",".join("?" * len(FUNNEL_EVENTS)), excl),
            [since] + FUNNEL_EVENTS,
        ).fetchall()
    counts = {r["name"]: r["cnt"] for r in rows}
    result = []
    top = counts.get(FUNNEL_EVENTS[0], 0) or 1
    for ev in FUNNEL_EVENTS:
        cnt = counts.get(ev, 0)
        result.append({
            "event": ev,
            "count": cnt,
            "conversion_pct": round(cnt / top * 100, 1) if top else 0,
        })
    return result


def get_pattern_breakdown(days: int = 30, origin: Optional[str] = None) -> Dict[str, Any]:
    """Break down analyses and upgrades by lighting pattern."""
    since = time.time() - days * 86400
    em = _origin_filter(origin, 'metrics')
    ec = _origin_filter(origin, 'conversion')
    with get_db() as conn:
        # analyses by pattern
        analysis_rows = conn.execute(
            f"""SELECT json_extract(data_json, '$.pattern') as pattern, COUNT(*) as cnt
               FROM analytics_events
               WHERE name = 'ANALYSIS_COMPLETE' AND created_at >= ?{em}
               GROUP BY pattern ORDER BY cnt DESC LIMIT 10""",
            (since,),
        ).fetchall()
        # upgrades by pattern
        upgrade_rows = conn.execute(
            f"""SELECT json_extract(data_json, '$.pattern') as pattern, COUNT(*) as cnt
               FROM analytics_events
               WHERE name = 'UPGRADE_COMPLETED' AND created_at >= ?{ec}
               GROUP BY pattern ORDER BY cnt DESC LIMIT 10""",
            (since,),
        ).fetchall()
        # by confidence level (high/medium/low from score buckets)
        confidence_rows = conn.execute(
            f"""SELECT
                 CASE
                   WHEN CAST(json_extract(data_json, '$.score') AS REAL) >= 0.75 THEN 'strong'
                   WHEN CAST(json_extract(data_json, '$.score') AS REAL) >= 0.5  THEN 'partial'
                   ELSE 'weak'
                 END as level,
                 COUNT(*) as cnt
               FROM analytics_events
               WHERE name = 'ANALYSIS_COMPLETE' AND created_at >= ?{em}
               GROUP BY level""",
            (since,),
        ).fetchall()
        # by entry point (source field)
        entry_rows = conn.execute(
            f"""SELECT json_extract(data_json, '$.source') as source, COUNT(*) as cnt
               FROM analytics_events
               WHERE name IN ('ANALYSIS_COMPLETE', 'UPGRADE_COMPLETED') AND created_at >= ?{em}
               GROUP BY source ORDER BY cnt DESC LIMIT 10""",
            (since,),
        ).fetchall()
    return {
        "by_pattern": [{"pattern": r["pattern"] or "unknown", "count": r["cnt"]} for r in analysis_rows],
        "upgrades_by_pattern": [{"pattern": r["pattern"] or "unknown", "count": r["cnt"]} for r in upgrade_rows],
        "by_confidence": [{"level": r["level"], "count": r["cnt"]} for r in confidence_rows],
        "by_entry_point": [{"source": r["source"] or "direct", "count": r["cnt"]} for r in entry_rows],
    }


def get_shoot_mode_stats(days: int = 30, origin: Optional[str] = None) -> Dict[str, Any]:
    """Shoot mode start rate, match rate, avg steps, avg time to match."""
    since = time.time() - days * 86400
    em = _origin_filter(origin, 'metrics')
    with get_db() as conn:
        started = conn.execute(
            f"SELECT COUNT(*) as cnt FROM analytics_events WHERE name='SHOOT_MODE_STARTED' AND created_at>=?{em}",
            (since,),
        ).fetchone()["cnt"]
        matched = conn.execute(
            f"SELECT COUNT(*) as cnt FROM analytics_events WHERE name='MATCH_ACHIEVED' AND created_at>=?{em}",
            (since,),
        ).fetchone()["cnt"]
        # avg steps completed (from MATCH_ACHIEVED data.steps_completed)
        avg_steps_row = conn.execute(
            f"""SELECT AVG(CAST(json_extract(data_json, '$.steps_completed') AS REAL)) as avg
               FROM analytics_events WHERE name='MATCH_ACHIEVED' AND created_at>=?{em}""",
            (since,),
        ).fetchone()
        avg_steps = round(avg_steps_row["avg"] or 0, 1)
        # avg time from SHOOT_MODE_STARTED to MATCH_ACHIEVED (by session_id)
        # approximate: use created_at differences for sessions that have both
        sessions_started = conn.execute(
            f"""SELECT session_id, created_at FROM analytics_events
               WHERE name='SHOOT_MODE_STARTED' AND session_id IS NOT NULL AND created_at>=?{em}""",
            (since,),
        ).fetchall()
        sessions_matched = conn.execute(
            f"""SELECT session_id, created_at FROM analytics_events
               WHERE name='MATCH_ACHIEVED' AND session_id IS NOT NULL AND created_at>=?{em}""",
            (since,),
        ).fetchall()
    # compute avg time
    start_map = {r["session_id"]: r["created_at"] for r in sessions_started}
    match_map = {r["session_id"]: r["created_at"] for r in sessions_matched}
    times = [
        match_map[sid] - start_map[sid]
        for sid in match_map
        if sid in start_map and match_map[sid] > start_map[sid]
    ]
    avg_time_secs = round(sum(times) / len(times), 0) if times else None
    return {
        "started": started,
        "matched": matched,
        "match_rate_pct": round(matched / started * 100, 1) if started else 0,
        "avg_steps_completed": avg_steps,
        "avg_time_to_match_secs": avg_time_secs,
    }


def get_retention_stats(days: int = 30, origin: Optional[str] = None) -> Dict[str, Any]:
    """Return users, saved setups, recreated setups."""
    since = time.time() - days * 86400
    ec = _origin_filter(origin, 'cohorts')
    with get_db() as conn:
        total_sessions = conn.execute(
            f"SELECT COUNT(DISTINCT session_id) as cnt FROM analytics_events WHERE created_at>=? AND session_id IS NOT NULL{ec}",
            (since,),
        ).fetchone()["cnt"]
        # Return users = session_ids that appear on 2+ different days
        return_sessions = conn.execute(
            f"""SELECT COUNT(*) as cnt FROM (
               SELECT session_id FROM analytics_events
               WHERE created_at>=? AND session_id IS NOT NULL{ec}
               GROUP BY session_id
               HAVING COUNT(DISTINCT date(created_at, 'unixepoch')) >= 2
            )""",
            (since,),
        ).fetchone()["cnt"]
        saved = conn.execute(
            f"SELECT COUNT(*) as cnt FROM analytics_events WHERE name='SETUP_SAVED' AND created_at>=?{ec}",
            (since,),
        ).fetchone()["cnt"]
        recreated = conn.execute(
            f"SELECT COUNT(*) as cnt FROM analytics_events WHERE name='SETUP_RECREATED' AND created_at>=?{ec}",
            (since,),
        ).fetchone()["cnt"]
    return {
        "total_sessions": total_sessions,
        "return_sessions": return_sessions,
        "return_rate_pct": round(return_sessions / total_sessions * 100, 1) if total_sessions else 0,
        "setups_saved": saved,
        "setups_recreated": recreated,
    }


def get_paywall_stats(days: int = 30, origin: Optional[str] = None) -> Dict[str, Any]:
    """Paywall views, clicks, conversions."""
    since = time.time() - days * 86400
    ec = _origin_filter(origin, 'conversion')
    with get_db() as conn:
        views = conn.execute(
            f"SELECT COUNT(*) as cnt FROM analytics_events WHERE name='PAYWALL_TRIGGERED' AND created_at>=?{ec}",
            (since,),
        ).fetchone()["cnt"]
        clicks = conn.execute(
            f"SELECT COUNT(*) as cnt FROM analytics_events WHERE name='UPGRADE_CLICKED' AND created_at>=?{ec}",
            (since,),
        ).fetchone()["cnt"]
        conversions = conn.execute(
            f"SELECT COUNT(*) as cnt FROM analytics_events WHERE name='UPGRADE_COMPLETED' AND created_at>=?{ec}",
            (since,),
        ).fetchone()["cnt"]
        # by trigger (blueprint / shoot_mode / save)
        trigger_rows = conn.execute(
            f"""SELECT json_extract(data_json, '$.trigger') as trigger, COUNT(*) as cnt
               FROM analytics_events
               WHERE name='PAYWALL_TRIGGERED' AND created_at>=?{ec}
               GROUP BY trigger ORDER BY cnt DESC""",
            (since,),
        ).fetchall()
    return {
        "views": views,
        "clicks": clicks,
        "conversions": conversions,
        "ctr_pct": round(clicks / views * 100, 1) if views else 0,
        "cvr_pct": round(conversions / views * 100, 1) if views else 0,
        "by_trigger": [{"trigger": r["trigger"] or "unknown", "count": r["cnt"]} for r in trigger_rows],
    }


def get_kpi_summary(days: int = 30, origin: Optional[str] = None) -> Dict[str, Any]:
    """Headline KPIs for the dashboard strip."""
    since = time.time() - days * 86400
    em = _origin_filter(origin, 'metrics')
    ec = _origin_filter(origin, 'conversion')
    with get_db() as conn:
        total_sessions = conn.execute(
            f"SELECT COUNT(DISTINCT session_id) as cnt FROM analytics_events WHERE created_at>=? AND session_id IS NOT NULL{em}",
            (since,),
        ).fetchone()["cnt"]
        total_users = conn.execute(
            f"SELECT COUNT(DISTINCT user_id) as cnt FROM analytics_events WHERE created_at>=? AND user_id IS NOT NULL{em}",
            (since,),
        ).fetchone()["cnt"]
        analyses = conn.execute(
            f"SELECT COUNT(*) as cnt FROM analytics_events WHERE name='ANALYSIS_COMPLETE' AND created_at>=?{em}",
            (since,),
        ).fetchone()["cnt"]
        shoots = conn.execute(
            f"SELECT COUNT(*) as cnt FROM analytics_events WHERE name='SHOOT_MODE_STARTED' AND created_at>=?{em}",
            (since,),
        ).fetchone()["cnt"]
        matches = conn.execute(
            f"SELECT COUNT(*) as cnt FROM analytics_events WHERE name='MATCH_ACHIEVED' AND created_at>=?{em}",
            (since,),
        ).fetchone()["cnt"]
        upgrades = conn.execute(
            f"SELECT COUNT(*) as cnt FROM analytics_events WHERE name='UPGRADE_COMPLETED' AND created_at>=?{ec}",
            (since,),
        ).fetchone()["cnt"]
        paywall_views = conn.execute(
            f"SELECT COUNT(*) as cnt FROM analytics_events WHERE name='PAYWALL_TRIGGERED' AND created_at>=?{ec}",
            (since,),
        ).fetchone()["cnt"]
    return {
        "total_sessions": total_sessions,
        "total_users": total_users,
        "total_analyses": analyses,
        "match_rate_pct": round(matches / shoots * 100, 1) if shoots else 0,
        "conversion_rate_pct": round(upgrades / paywall_views * 100, 1) if paywall_views else 0,
        "analyses_per_session": round(analyses / total_sessions, 1) if total_sessions else 0,
        "upgrades": upgrades,
    }


def get_success_conversion_breakdown(days: int = 30, origin: Optional[str] = None) -> Dict[str, Any]:
    """Compare upgrade rate for sessions that achieved a match vs those that didn't."""
    since = time.time() - days * 86400
    em = _origin_filter(origin, 'metrics')
    ec = _origin_filter(origin, 'conversion')
    with get_db() as conn:
        matched_sessions = conn.execute(
            f"""SELECT DISTINCT session_id FROM analytics_events
               WHERE name='MATCH_ACHIEVED' AND session_id IS NOT NULL AND created_at>=?{ec}""",
            (since,),
        ).fetchall()
        shoot_sessions = conn.execute(
            f"""SELECT DISTINCT session_id FROM analytics_events
               WHERE name='SHOOT_MODE_STARTED' AND session_id IS NOT NULL AND created_at>=?{em}""",
            (since,),
        ).fetchall()
        upgraded_sessions = conn.execute(
            f"""SELECT DISTINCT session_id FROM analytics_events
               WHERE name='UPGRADE_COMPLETED' AND session_id IS NOT NULL AND created_at>=?{ec}""",
            (since,),
        ).fetchall()
    matched_set = {r["session_id"] for r in matched_sessions}
    shoot_set = {r["session_id"] for r in shoot_sessions}
    upgraded_ids = {r["session_id"] for r in upgraded_sessions}
    not_matched_set = shoot_set - matched_set
    matched_converted = len(matched_set & upgraded_ids)
    not_matched_converted = len(not_matched_set & upgraded_ids)
    matched_rate = round(matched_converted / len(matched_set) * 100, 1) if matched_set else 0
    not_matched_rate = round(not_matched_converted / len(not_matched_set) * 100, 1) if not_matched_set else 0
    return {
        "matched_sessions": len(matched_set),
        "not_matched_sessions": len(not_matched_set),
        "matched_converted": matched_converted,
        "not_matched_converted": not_matched_converted,
        "matched_conversion_rate_pct": matched_rate,
        "not_matched_conversion_rate_pct": not_matched_rate,
        "lift_pct": round(matched_rate - not_matched_rate, 1),
    }


def get_pattern_performance(days: int = 30, origin: Optional[str] = None) -> List[Dict[str, Any]]:
    """Per-pattern: analysis count, upgrade count, conversion rate."""
    since = time.time() - days * 86400
    em = _origin_filter(origin, 'metrics')
    ec = _origin_filter(origin, 'conversion')
    with get_db() as conn:
        analysis_rows = conn.execute(
            f"""SELECT json_extract(data_json, '$.pattern') as pattern, COUNT(*) as cnt
               FROM analytics_events
               WHERE name='ANALYSIS_COMPLETE' AND created_at>=?{em}
               GROUP BY pattern ORDER BY cnt DESC LIMIT 15""",
            (since,),
        ).fetchall()
        upgrade_rows = conn.execute(
            f"""SELECT json_extract(data_json, '$.pattern') as pattern, COUNT(*) as cnt
               FROM analytics_events
               WHERE name='UPGRADE_COMPLETED' AND created_at>=?{ec}
               GROUP BY pattern ORDER BY cnt DESC""",
            (since,),
        ).fetchall()
    upgrade_map = {(r["pattern"] or "unknown"): r["cnt"] for r in upgrade_rows}
    result = []
    for r in analysis_rows:
        pat = r["pattern"] or "unknown"
        ac = r["cnt"]
        uc = upgrade_map.get(pat, 0)
        result.append({
            "pattern": pat,
            "analysis_count": ac,
            "upgrade_count": uc,
            "conversion_rate_pct": round(uc / ac * 100, 1) if ac else 0,
        })
    return sorted(result, key=lambda x: x["conversion_rate_pct"], reverse=True)


def get_daily_trend(days: int = 30, origin: Optional[str] = None) -> List[Dict[str, Any]]:
    """Daily counts of analyses, upgrades, and matches."""
    since = time.time() - days * 86400
    em = _origin_filter(origin, 'metrics')
    with get_db() as conn:
        rows = conn.execute(
            f"""SELECT date(created_at, 'unixepoch') as day,
                      SUM(CASE WHEN name='ANALYSIS_COMPLETE' THEN 1 ELSE 0 END) as analyses,
                      SUM(CASE WHEN name='UPGRADE_COMPLETED' THEN 1 ELSE 0 END) as upgrades,
                      SUM(CASE WHEN name='MATCH_ACHIEVED' THEN 1 ELSE 0 END) as matches
               FROM analytics_events
               WHERE created_at >= ?{em}
               GROUP BY day ORDER BY day""",
            (since,),
        ).fetchall()
    return [
        {"day": r["day"], "analyses": r["analyses"], "upgrades": r["upgrades"], "matches": r["matches"]}
        for r in rows
    ]


def get_session_quality(days: int = 30, origin: Optional[str] = None) -> Dict[str, Any]:
    """Session depth, bounce rate, and engagement funnel percentages."""
    since = time.time() - days * 86400
    ec = _origin_filter(origin, 'cohorts')
    with get_db() as conn:
        total = conn.execute(
            f"SELECT COUNT(DISTINCT session_id) as cnt FROM analytics_events WHERE session_id IS NOT NULL AND created_at>=?{ec}",
            (since,),
        ).fetchone()["cnt"]
        avg_depth_row = conn.execute(
            f"""SELECT AVG(cnt) as avg FROM (
               SELECT session_id, COUNT(*) as cnt FROM analytics_events
               WHERE session_id IS NOT NULL AND created_at>=?{ec}
               GROUP BY session_id)""",
            (since,),
        ).fetchone()
        bounced = conn.execute(
            f"""SELECT COUNT(*) as cnt FROM (
               SELECT session_id FROM analytics_events
               WHERE session_id IS NOT NULL AND created_at>=?{ec}
               GROUP BY session_id HAVING COUNT(*) = 1)""",
            (since,),
        ).fetchone()["cnt"]
        reached_analysis = conn.execute(
            f"SELECT COUNT(DISTINCT session_id) as cnt FROM analytics_events WHERE name='ANALYSIS_COMPLETE' AND session_id IS NOT NULL AND created_at>=?{ec}",
            (since,),
        ).fetchone()["cnt"]
        reached_shoot = conn.execute(
            f"SELECT COUNT(DISTINCT session_id) as cnt FROM analytics_events WHERE name='SHOOT_MODE_STARTED' AND session_id IS NOT NULL AND created_at>=?{ec}",
            (since,),
        ).fetchone()["cnt"]
        reached_match = conn.execute(
            f"SELECT COUNT(DISTINCT session_id) as cnt FROM analytics_events WHERE name='MATCH_ACHIEVED' AND session_id IS NOT NULL AND created_at>=?{ec}",
            (since,),
        ).fetchone()["cnt"]
    return {
        "total_sessions": total,
        "avg_events_per_session": round(avg_depth_row["avg"] or 0, 1),
        "bounce_rate_pct": round(bounced / total * 100, 1) if total else 0,
        "analysis_reach_pct": round(reached_analysis / total * 100, 1) if total else 0,
        "shoot_mode_reach_pct": round(reached_shoot / total * 100, 1) if total else 0,
        "match_reach_pct": round(reached_match / total * 100, 1) if total else 0,
    }


def get_all_stats(days: int = 30, origin: Optional[str] = None) -> Dict[str, Any]:
    """Aggregate all dashboard stats in one call."""
    return {
        "days": days,
        "funnel":     get_funnel_stats(days, origin),
        "patterns":   get_pattern_breakdown(days, origin),
        "shoot_mode": get_shoot_mode_stats(days, origin),
        "retention":  get_retention_stats(days, origin),
        "paywall":    get_paywall_stats(days, origin),
    }
