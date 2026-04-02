"""
Session Signals — the learning engine's ground truth.

Answers the single most important question: "Did the user get the shot?"

Core loop: Prediction → Action → Outcome → Signal → Learning → Improvement

Every analysis session should produce exactly one signal.
Signals are written immediately — never batched.

signal_source values:
  live          — real user session (default; included in all analytics)
  seeded        — bootstrap/synthetic data (excluded from all analytics)
  internal      — developer/admin session (excluded by default)
  expert_review — curator session (excluded by default)

Table: session_signals (SQLite, WAL mode via shared get_db())
"""
from __future__ import annotations

import time
import uuid
import random
from typing import Any, Dict, List, Optional

from db.database import get_db


# ─── Schema ────────────────────────────────────────────────────────────────────

_DDL = """
CREATE TABLE IF NOT EXISTS session_signals (
    id               TEXT PRIMARY KEY,
    session_id       TEXT,
    user_id          TEXT,
    pattern_id       TEXT NOT NULL,
    confidence_score REAL CHECK (confidence_score >= 0 AND confidence_score <= 1),
    outcome          TEXT CHECK (outcome IN ('nailed_it', 'close', 'failed', 'unknown')),
    input_method     TEXT,
    subject_type     TEXT,
    environment      TEXT,
    mood             TEXT,
    shoot_mode_entered INTEGER DEFAULT 0,
    steps_completed  INTEGER DEFAULT 0,
    steps_total      INTEGER DEFAULT 0,
    deviation_count  INTEGER DEFAULT 0,
    saved_setup      INTEGER DEFAULT 0,
    upgraded         INTEGER DEFAULT 0,
    revenue_value    REAL    DEFAULT 0,
    created_at       REAL    DEFAULT (unixepoch()),
    signal_source    TEXT    DEFAULT 'live'
                             CHECK (signal_source IN ('seeded', 'live', 'internal', 'expert_review')),
    include_in_learning    INTEGER DEFAULT 1,
    include_in_metrics     INTEGER DEFAULT 1,
    include_in_conversion  INTEGER DEFAULT 1,
    include_in_cohorts     INTEGER DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_signals_pattern ON session_signals (pattern_id);
CREATE INDEX IF NOT EXISTS idx_signals_outcome ON session_signals (outcome);
CREATE INDEX IF NOT EXISTS idx_signals_created ON session_signals (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_user    ON session_signals (user_id);
"""

# Columns added after initial schema — migrated via ALTER TABLE
_NEW_COLUMNS = [
    ("signal_source",           "TEXT    DEFAULT 'live'"),
    ("include_in_learning",     "INTEGER DEFAULT 1"),
    ("include_in_metrics",      "INTEGER DEFAULT 1"),
    ("include_in_conversion",   "INTEGER DEFAULT 1"),
    ("include_in_cohorts",      "INTEGER DEFAULT 1"),
    # Phase 4b — analysis traceability
    ("analysis_id",             "TEXT"),
    ("system_version",          "TEXT"),
    ("image_path",              "TEXT"),
]

_SEED_ROWS = [
    # ── clamshell: high success, high confidence ─────────────────────────────
    ("clamshell", 0.91, "nailed_it",  "indoor",  "portrait",  "beauty",  False, 0, 12.0),
    ("clamshell", 0.88, "nailed_it",  "indoor",  "portrait",  "beauty",  True,  2, 12.0),
    ("clamshell", 0.85, "nailed_it",  "studio",  "headshot",  None,      False, 0, 0.0),
    ("clamshell", 0.90, "nailed_it",  "studio",  "portrait",  "beauty",  True,  0, 12.0),
    ("clamshell", 0.83, "close",      "indoor",  "portrait",  None,      False, 1, 0.0),
    ("clamshell", 0.78, "nailed_it",  "studio",  "headshot",  "neutral", False, 0, 0.0),
    ("clamshell", 0.92, "nailed_it",  "outdoor", "portrait",  "beauty",  True,  0, 12.0),
    ("clamshell", 0.70, "close",      "indoor",  "headshot",  None,      False, 2, 0.0),
    ("clamshell", 0.86, "nailed_it",  "studio",  "portrait",  "beauty",  False, 0, 0.0),
    ("clamshell", 0.81, "nailed_it",  "indoor",  "headshot",  None,      True,  0, 12.0),

    # ── loop: medium success, varied confidence ───────────────────────────────
    ("loop",      0.72, "nailed_it",  "studio",  "portrait",  "natural", True,  1, 12.0),
    ("loop",      0.68, "close",      "indoor",  "portrait",  "moody",   False, 3, 0.0),
    ("loop",      0.75, "nailed_it",  "studio",  "headshot",  None,      False, 0, 0.0),
    ("loop",      0.60, "failed",     "outdoor", "portrait",  "moody",   False, 4, 0.0),
    ("loop",      0.77, "close",      "indoor",  "portrait",  "natural", True,  2, 12.0),
    ("loop",      0.71, "nailed_it",  "studio",  "headshot",  None,      False, 0, 0.0),
    ("loop",      0.58, "failed",     "indoor",  "portrait",  "moody",   False, 5, 0.0),
    ("loop",      0.80, "nailed_it",  "studio",  "portrait",  "natural", True,  0, 12.0),
    ("loop",      0.65, "close",      "indoor",  "headshot",  None,      False, 2, 0.0),
    ("loop",      0.73, "nailed_it",  "outdoor", "portrait",  None,      False, 1, 0.0),

    # ── rembrandt: mixed, lower confidence when failing ───────────────────────
    ("rembrandt", 0.65, "close",      "studio",  "portrait",  "dramatic", True, 2, 12.0),
    ("rembrandt", 0.70, "nailed_it",  "studio",  "portrait",  "moody",   False, 0, 0.0),
    ("rembrandt", 0.55, "failed",     "indoor",  "portrait",  "dramatic", False, 5, 0.0),
    ("rembrandt", 0.72, "nailed_it",  "studio",  "headshot",  None,      True,  0, 12.0),
    ("rembrandt", 0.60, "close",      "indoor",  "portrait",  "moody",   False, 3, 0.0),
    ("rembrandt", 0.48, "failed",     "outdoor", "portrait",  "dramatic", False, 6, 0.0),
    ("rembrandt", 0.75, "nailed_it",  "studio",  "portrait",  "moody",   True,  1, 12.0),
    ("rembrandt", 0.52, "failed",     "indoor",  "headshot",  None,      False, 4, 0.0),
    ("rembrandt", 0.68, "close",      "studio",  "portrait",  "dramatic", False, 2, 0.0),
    ("rembrandt", 0.63, "close",      "indoor",  "portrait",  "moody",   False, 3, 0.0),

    # ── split: low success, mostly struggles ──────────────────────────────────
    ("split",     0.52, "failed",     "studio",  "portrait",  "dramatic", False, 5, 0.0),
    ("split",     0.45, "failed",     "indoor",  "portrait",  "edgy",    False, 7, 0.0),
    ("split",     0.60, "close",      "studio",  "portrait",  "dramatic", True,  3, 12.0),
    ("split",     0.38, "failed",     "outdoor", "portrait",  None,      False, 8, 0.0),
    ("split",     0.55, "close",      "indoor",  "headshot",  "edgy",    False, 4, 0.0),
    ("split",     0.50, "failed",     "studio",  "portrait",  "dramatic", False, 6, 0.0),
    ("split",     0.43, "failed",     "indoor",  "portrait",  "edgy",    False, 7, 0.0),
    ("split",     0.62, "nailed_it",  "studio",  "portrait",  "dramatic", True,  1, 12.0),
    ("split",     0.41, "failed",     "outdoor", "portrait",  None,      False, 9, 0.0),
    ("split",     0.48, "close",      "indoor",  "headshot",  "edgy",    False, 4, 0.0),

    # ── butterfly: bonus pattern ──────────────────────────────────────────────
    ("butterfly", 0.82, "nailed_it",  "studio",  "portrait",  "glamour", True,  0, 12.0),
    ("butterfly", 0.75, "close",      "indoor",  "portrait",  "beauty",  False, 2, 0.0),
    ("butterfly", 0.88, "nailed_it",  "studio",  "headshot",  None,      True,  0, 12.0),
    ("butterfly", 0.67, "close",      "indoor",  "portrait",  "glamour", False, 3, 0.0),
    ("butterfly", 0.79, "nailed_it",  "studio",  "portrait",  "beauty",  False, 0, 0.0),
]


def init_signals_tables() -> None:
    """Create session_signals table, indexes, and migrate new columns. Safe to call multiple times."""
    with get_db() as conn:
        conn.executescript(_DDL)
        _migrate_schema(conn)


def _migrate_schema(conn) -> None:
    """Add new columns + indexes to existing tables (idempotent)."""
    existing_cols = {
        row[1] for row in conn.execute("PRAGMA table_info(session_signals)").fetchall()
    }
    for col, defn in _NEW_COLUMNS:
        if col not in existing_cols:
            conn.execute(f"ALTER TABLE session_signals ADD COLUMN {col} {defn}")

    # Indexes for new columns — created here so they work for both fresh and
    # migrated tables (executescript above is a no-op on existing tables)
    conn.executescript("""
        CREATE INDEX IF NOT EXISTS idx_signals_source
            ON session_signals (signal_source);
        CREATE INDEX IF NOT EXISTS idx_signals_learning
            ON session_signals (include_in_learning);
        CREATE INDEX IF NOT EXISTS idx_signals_metrics
            ON session_signals (include_in_metrics);
    """)


def seed_signals(force: bool = False) -> int:
    """
    Insert bootstrap seed rows if the table is empty (or force=True).
    Returns number of rows inserted.
    Spreads created_at across the last 30 days for realistic trend charts.

    All seeded rows have:
      signal_source = 'seeded'
      include_in_* = 0  (excluded from all production analytics)
    """
    with get_db() as conn:
        existing = conn.execute("SELECT COUNT(*) as cnt FROM session_signals").fetchone()["cnt"]
        if existing > 0 and not force:
            return 0

        # Wipe previous seed rows so force-reseed is idempotent
        if force:
            conn.execute("DELETE FROM session_signals WHERE signal_source = 'seeded'")

        now = time.time()
        inserted = 0
        for i, row in enumerate(_SEED_ROWS):
            (pat, conf, outcome, env, subj, mood, shoot, steps, rev) = row
            # Spread across last 30 days — newest first
            age_days = (len(_SEED_ROWS) - i) * (30 / len(_SEED_ROWS))
            created  = now - age_days * 86400

            conn.execute(
                """INSERT INTO session_signals
                   (id, session_id, user_id, pattern_id, confidence_score, outcome,
                    input_method, subject_type, environment, mood,
                    shoot_mode_entered, steps_completed, steps_total,
                    deviation_count, saved_setup, upgraded, revenue_value, created_at,
                    signal_source, include_in_learning, include_in_metrics,
                    include_in_conversion, include_in_cohorts)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    str(uuid.uuid4()),
                    str(uuid.uuid4()),   # session_id (synthetic)
                    None,                # user_id (anonymous seed)
                    pat, conf, outcome,
                    "reference_photo" if i % 3 == 0 else "wizard",
                    subj, env, mood,
                    1 if shoot else 0,
                    steps, steps + random.randint(0, 3),
                    random.randint(0, 3),
                    1 if rev > 0 else 0,
                    1 if rev > 0 else 0,
                    rev, created,
                    "seeded", 0, 0, 0, 0,   # excluded from all analytics
                ),
            )
            inserted += 1

        return inserted


# ─── Writes ─────────────────────────────────────────────────────────────────────

def record_signal(
    pattern_id: str,
    confidence_score: Optional[float] = None,
    outcome: Optional[str] = None,
    session_id: Optional[str] = None,
    user_id: Optional[str] = None,
    input_method: Optional[str] = None,
    subject_type: Optional[str] = None,
    environment: Optional[str] = None,
    mood: Optional[str] = None,
    shoot_mode_entered: bool = False,
    steps_completed: int = 0,
    steps_total: int = 0,
    deviation_count: int = 0,
    saved_setup: bool = False,
    upgraded: bool = False,
    revenue_value: float = 0.0,
    signal_source: str = "live",
    analysis_id: Optional[str] = None,
    system_version: Optional[str] = None,
    image_path: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Write one signal row immediately. No batching.
    Returns the created record (id + created_at + outcome).

    signal_source controls analytics inclusion:
      'live'          → all include_* = True  (default)
      'seeded'        → all include_* = False
      'internal'      → all include_* = False
      'expert_review' → all include_* = False
    """
    sig_id     = str(uuid.uuid4())
    created_at = time.time()

    # Infer outcome if not provided (rule: high confidence + no input → 'close')
    if outcome is None:
        if confidence_score is not None and confidence_score >= 0.80:
            outcome = "close"
        else:
            outcome = "unknown"

    # Live signals are included in all analytics; all others are excluded
    include = 1 if signal_source == "live" else 0

    with get_db() as conn:
        conn.execute(
            """INSERT INTO session_signals
               (id, session_id, user_id, pattern_id, confidence_score, outcome,
                input_method, subject_type, environment, mood,
                shoot_mode_entered, steps_completed, steps_total,
                deviation_count, saved_setup, upgraded, revenue_value, created_at,
                signal_source, include_in_learning, include_in_metrics,
                include_in_conversion, include_in_cohorts,
                analysis_id, system_version, image_path)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                sig_id, session_id, user_id, pattern_id, confidence_score, outcome,
                input_method, subject_type, environment, mood,
                1 if shoot_mode_entered else 0,
                steps_completed, steps_total, deviation_count,
                1 if saved_setup else 0,
                1 if upgraded else 0,
                revenue_value, created_at,
                signal_source, include, include, include, include,
                analysis_id, system_version, image_path,
            ),
        )

    return {"id": sig_id, "created_at": created_at, "outcome": outcome}


# ─── Reads ──────────────────────────────────────────────────────────────────────

def get_summary(days: int = 30, source: Optional[str] = None) -> Dict[str, Any]:
    """
    Headline KPIs for the signals panel.

    source = 'live' | 'seeded' | 'internal' | 'expert_review' | 'all'
    When source is None, defaults to metrics-eligible rows (include_in_metrics=1).

    Returns:
        total_sessions, success_rate, top_pattern, worst_pattern,
        conversion_rate, avg_confidence, revenue_total
    """
    since = time.time() - days * 86400
    where, params = _source_filter(source, since)

    with get_db() as conn:
        total = conn.execute(
            f"SELECT COUNT(*) as cnt FROM session_signals {where}",
            params,
        ).fetchone()["cnt"]

        success = conn.execute(
            f"SELECT COUNT(*) as cnt FROM session_signals {where} "
            f"{'AND' if where else 'WHERE'} outcome='nailed_it'",
            params,
        ).fetchone()["cnt"]

        upgraded = conn.execute(
            f"SELECT COUNT(*) as cnt FROM session_signals {where} "
            f"{'AND' if where else 'WHERE'} upgraded=1",
            params,
        ).fetchone()["cnt"]

        revenue = conn.execute(
            f"SELECT COALESCE(SUM(revenue_value),0) as rev FROM session_signals {where}",
            params,
        ).fetchone()["rev"]

        avg_conf = conn.execute(
            f"SELECT AVG(confidence_score) as avg FROM session_signals {where} "
            f"{'AND' if where else 'WHERE'} confidence_score IS NOT NULL",
            params,
        ).fetchone()["avg"]

        # Top pattern by success count
        top_row = conn.execute(
            f"""SELECT pattern_id, COUNT(*) as cnt
               FROM session_signals {where}
               {'AND' if where else 'WHERE'} outcome='nailed_it'
               GROUP BY pattern_id ORDER BY cnt DESC LIMIT 1""",
            params,
        ).fetchone()

        # Worst pattern by failure rate (min 3 sessions)
        worst_row = conn.execute(
            f"""SELECT pattern_id,
                      AVG(CASE WHEN outcome='nailed_it' THEN 1.0 ELSE 0.0 END) as sr
               FROM session_signals {where}
               GROUP BY pattern_id
               HAVING COUNT(*) >= 3
               ORDER BY sr ASC LIMIT 1""",
            params,
        ).fetchone()

    return {
        "total_sessions":   total,
        "success_rate":     round(success / total, 4) if total else 0.0,
        "conversion_rate":  round(upgraded / total, 4) if total else 0.0,
        "avg_confidence":   round(avg_conf, 4) if avg_conf else None,
        "revenue_total":    round(revenue, 2),
        "top_pattern":      top_row["pattern_id"] if top_row else None,
        "worst_pattern":    worst_row["pattern_id"] if worst_row else None,
        "days":             days,
        "source_filter":    source or "metrics_eligible",
    }


def get_pattern_breakdown(days: int = 30, source: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Per-pattern aggregation — the primary learning feed.

    source = 'live' | 'seeded' | 'internal' | 'expert_review' | 'all'
    When source is None, defaults to learning-eligible rows (include_in_learning=1).

    Bootstrap validation query:
        SELECT pattern_id, COUNT(*), AVG(CASE WHEN outcome='nailed_it' THEN 1 ELSE 0 END)
        FROM session_signals GROUP BY pattern_id;

    Expected: clamshell highest, split lowest.
    """
    since = time.time() - days * 86400
    where, params = _source_filter(source, since)

    with get_db() as conn:
        rows = conn.execute(
            f"""SELECT
                  pattern_id,
                  COUNT(*) as sessions,
                  SUM(CASE WHEN outcome='nailed_it' THEN 1 ELSE 0 END) as nailed,
                  SUM(CASE WHEN outcome='close'     THEN 1 ELSE 0 END) as close,
                  SUM(CASE WHEN outcome='failed'    THEN 1 ELSE 0 END) as failed,
                  AVG(confidence_score)                                as avg_confidence,
                  SUM(CASE WHEN upgraded=1 THEN 1 ELSE 0 END)          as conversions,
                  SUM(revenue_value)                                   as revenue,
                  AVG(CASE WHEN shoot_mode_entered=1 THEN 1.0 ELSE 0.0 END) as shoot_rate,
                  AVG(deviation_count)                                  as avg_deviations
               FROM session_signals
               {where}
               GROUP BY pattern_id
               ORDER BY sessions DESC""",
            params,
        ).fetchall()

    result = []
    for r in rows:
        s = r["sessions"] or 1
        result.append({
            "pattern_id":      r["pattern_id"],
            "sessions":        r["sessions"],
            "nailed":          r["nailed"],
            "close":           r["close"],
            "failed":          r["failed"],
            "success_rate":    round(r["nailed"] / s, 4),
            "close_rate":      round(r["close"]  / s, 4),
            "fail_rate":       round(r["failed"] / s, 4),
            "avg_confidence":  round(r["avg_confidence"], 4) if r["avg_confidence"] else None,
            "conversions":     r["conversions"],
            "conversion_rate": round(r["conversions"] / s, 4),
            "revenue":         round(r["revenue"] or 0, 2),
            "revenue_per_session": round((r["revenue"] or 0) / s, 2),
            "shoot_mode_rate": round(r["shoot_rate"] or 0, 4),
            "avg_deviations":  round(r["avg_deviations"] or 0, 2),
        })

    return sorted(result, key=lambda x: x["success_rate"], reverse=True)


def get_recent_signals(
    limit: int = 50,
    pattern_id: Optional[str] = None,
    source: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Latest N signals, optionally filtered by pattern and/or signal_source.
    source = 'live' | 'seeded' | 'internal' | 'expert_review' | 'all'
    """
    conditions: List[str] = []
    params: List[Any] = []

    if pattern_id:
        conditions.append("pattern_id = ?")
        params.append(pattern_id)

    if source and source != "all":
        conditions.append("signal_source = ?")
        params.append(source)

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    params.append(limit)

    with get_db() as conn:
        rows = conn.execute(
            f"SELECT * FROM session_signals {where} ORDER BY created_at DESC LIMIT ?",
            params,
        ).fetchall()
    return [dict(r) for r in rows]


def get_confidence_calibration(days: int = 30, source: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Compare predicted confidence vs actual outcome per pattern.
    High confidence + failure → model is miscalibrated.
    Returns per-pattern: avg_confidence, success_rate, calibration_gap.
    """
    breakdown = get_pattern_breakdown(days, source=source)
    result = []
    for p in breakdown:
        conf = p.get("avg_confidence")
        sr   = p.get("success_rate", 0)
        gap  = round(conf - sr, 4) if conf is not None else None
        result.append({
            "pattern_id":       p["pattern_id"],
            "avg_confidence":   conf,
            "success_rate":     sr,
            "calibration_gap":  gap,
            "sessions":         p["sessions"],
            "flag":             "overconfident" if gap and gap > 0.20 else
                                "underconfident" if gap and gap < -0.20 else
                                "calibrated",
        })
    return sorted(result, key=lambda x: abs(x["calibration_gap"] or 0), reverse=True)


def get_hygiene_summary() -> Dict[str, Any]:
    """
    Signal Hygiene summary — counts by source and by analytics eligibility.

    Returns:
        total, live, seeded, internal, expert_review,
        learning_eligible, metrics_eligible, conversion_eligible, cohorts_eligible
    """
    with get_db() as conn:
        total = conn.execute(
            "SELECT COUNT(*) as cnt FROM session_signals"
        ).fetchone()["cnt"]

        by_source = {
            row["signal_source"]: row["cnt"]
            for row in conn.execute(
                "SELECT signal_source, COUNT(*) as cnt FROM session_signals GROUP BY signal_source"
            ).fetchall()
        }

        learning_eligible = conn.execute(
            "SELECT COUNT(*) as cnt FROM session_signals WHERE include_in_learning=1"
        ).fetchone()["cnt"]

        metrics_eligible = conn.execute(
            "SELECT COUNT(*) as cnt FROM session_signals WHERE include_in_metrics=1"
        ).fetchone()["cnt"]

        conversion_eligible = conn.execute(
            "SELECT COUNT(*) as cnt FROM session_signals WHERE include_in_conversion=1"
        ).fetchone()["cnt"]

        cohorts_eligible = conn.execute(
            "SELECT COUNT(*) as cnt FROM session_signals WHERE include_in_cohorts=1"
        ).fetchone()["cnt"]

        unknown_count = conn.execute(
            "SELECT COUNT(*) as cnt FROM session_signals WHERE outcome='unknown'"
        ).fetchone()["cnt"]

    return {
        "total":               total,
        "live":                by_source.get("live", 0),
        "seeded":              by_source.get("seeded", 0),
        "internal":            by_source.get("internal", 0),
        "expert_review":       by_source.get("expert_review", 0),
        "unknown_count":       unknown_count,
        "learning_eligible":   learning_eligible,
        "metrics_eligible":    metrics_eligible,
        "conversion_eligible": conversion_eligible,
        "cohorts_eligible":    cohorts_eligible,
    }



def get_recalibration_hints(days: int = 30) -> list:
    """
    Return concrete per-pattern recalibration suggestions.
    For each overconfident pattern: avg_confidence, success_rate, suggested_floor.
    Only returns patterns with >= 5 live sessions and a calibration gap > 0.10.
    """
    since = time.time() - days * 86400
    with get_db() as conn:
        rows = conn.execute(
            """SELECT pattern_id,
                      AVG(confidence_score) as avg_conf,
                      AVG(CASE WHEN outcome='nailed_it' THEN 1.0 ELSE 0.0 END) as success_rate,
                      COUNT(*) as sessions
               FROM session_signals
               WHERE include_in_learning=1
                 AND confidence_score IS NOT NULL
                 AND outcome IS NOT NULL
                 AND created_at >= ?
               GROUP BY pattern_id
               HAVING sessions >= 5""",
            [since],
        ).fetchall()

    hints = []
    for r in rows:
        avg_conf = round(r["avg_conf"], 4) if r["avg_conf"] else None
        sr = round(r["success_rate"], 4) if r["success_rate"] is not None else None
        if avg_conf is None or sr is None:
            continue
        gap = round(avg_conf - sr, 4)
        if gap <= 0.10:
            continue  # calibrated or underconfident — no hint needed
        suggested_floor = round(sr + 0.05, 3)  # add 5pp buffer above actual success rate
        reduction = round(avg_conf - suggested_floor, 3)
        hints.append({
            "pattern_id":      r["pattern_id"],
            "avg_confidence":  avg_conf,
            "success_rate":    sr,
            "calibration_gap": gap,
            "suggested_floor": suggested_floor,
            "reduction_pp":    round(reduction * 100, 1),
            "sessions":        r["sessions"],
            "action":          f"Reduce {r['pattern_id']} confidence floor by ~{round(reduction * 100, 1)}pp (from {round(avg_conf*100,1)}% to {round(suggested_floor*100,1)}%)",
        })
    return sorted(hints, key=lambda x: -x["calibration_gap"])


def get_calibration_by_environment(days: int = 30) -> list:
    """
    Confidence vs outcome per (pattern_id, environment) pair.
    Only returns combinations with >= 3 sessions and a non-null environment.
    """
    since = time.time() - days * 86400
    with get_db() as conn:
        rows = conn.execute(
            """SELECT pattern_id, environment,
                      AVG(confidence_score) as avg_conf,
                      AVG(CASE WHEN outcome='nailed_it' THEN 1.0 ELSE 0.0 END) as success_rate,
                      COUNT(*) as sessions
               FROM session_signals
               WHERE include_in_learning=1
                 AND confidence_score IS NOT NULL
                 AND outcome IS NOT NULL
                 AND environment IS NOT NULL
                 AND environment != ''
                 AND created_at >= ?
               GROUP BY pattern_id, environment
               HAVING sessions >= 3
               ORDER BY pattern_id, environment""",
            [since],
        ).fetchall()

    result = []
    for r in rows:
        avg_conf = round(r["avg_conf"], 4) if r["avg_conf"] else None
        sr = round(r["success_rate"], 4) if r["success_rate"] is not None else None
        gap = round(avg_conf - sr, 4) if avg_conf is not None and sr is not None else None
        flag = (
            "overconfident"   if gap and gap > 0.20 else
            "underconfident"  if gap and gap < -0.20 else
            "calibrated"
        )
        result.append({
            "pattern_id":      r["pattern_id"],
            "environment":     r["environment"],
            "avg_confidence":  avg_conf,
            "success_rate":    sr,
            "calibration_gap": gap,
            "flag":            flag,
            "sessions":        r["sessions"],
        })
    return sorted(result, key=lambda x: abs(x["calibration_gap"] or 0), reverse=True)


def get_gold_set_suggestions(days: int = 90, limit: int = 20) -> list:
    """
    Surface high-quality signals as gold set candidates.

    Criteria:
      - outcome = 'nailed_it'
      - confidence_score >= 0.80
      - input_method = 'reference_photo'
      - signal_source = 'live'
      - Not already in gold_set_entries (if that table exists)

    Returns up to `limit` suggestions, ordered by confidence desc.
    """
    since = time.time() - days * 86400
    with get_db() as conn:
        # Check if gold_set_entries table exists
        has_gold = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='gold_set_entries'"
        ).fetchone()

        if has_gold:
            # Check if gold_set_entries has a session_id column for dedup
            gold_cols = {
                r["name"]
                for r in conn.execute("PRAGMA table_info(gold_set_entries)").fetchall()
            }
            if "session_id" in gold_cols:
                rows = conn.execute(
                    """SELECT s.id, s.session_id, s.pattern_id, s.confidence_score,
                              s.environment, s.subject_type, s.created_at, s.image_path
                       FROM session_signals s
                       WHERE s.outcome='nailed_it'
                         AND s.confidence_score >= 0.80
                         AND s.input_method='reference_photo'
                         AND s.signal_source='live'
                         AND s.created_at >= ?
                         AND NOT EXISTS (
                           SELECT 1 FROM gold_set_entries g
                           WHERE g.session_id = s.session_id
                         )
                       ORDER BY s.confidence_score DESC
                       LIMIT ?""",
                    [since, limit],
                ).fetchall()
            else:
                # gold_set_entries exists but has no session_id link — skip dedup
                rows = conn.execute(
                    """SELECT id, session_id, pattern_id, confidence_score,
                              environment, subject_type, created_at, image_path
                       FROM session_signals
                       WHERE outcome='nailed_it'
                         AND confidence_score >= 0.80
                         AND input_method='reference_photo'
                         AND signal_source='live'
                         AND created_at >= ?
                       ORDER BY confidence_score DESC
                       LIMIT ?""",
                    [since, limit],
                ).fetchall()
        else:
            rows = conn.execute(
                """SELECT id, session_id, pattern_id, confidence_score,
                          environment, subject_type, created_at, image_path
                   FROM session_signals
                   WHERE outcome='nailed_it'
                     AND confidence_score >= 0.80
                     AND input_method='reference_photo'
                     AND signal_source='live'
                     AND created_at >= ?
                   ORDER BY confidence_score DESC
                   LIMIT ?""",
                [since, limit],
            ).fetchall()

    return [
        {
            "signal_id":      r["id"],
            "session_id":     r["session_id"],
            "pattern_id":     r["pattern_id"],
            "confidence":     round(r["confidence_score"], 3),
            "environment":    r["environment"],
            "subject_type":   r["subject_type"],
            "created_at":     r["created_at"],
            "image_path":     dict(r).get("image_path"),
            "reason":         f"High-confidence nailed_it ({round(r['confidence_score']*100,1)}%) reference photo",
        }
        for r in rows
    ]


# ─── Internal helpers ────────────────────────────────────────────────────────────

def _source_filter(source: Optional[str], since: float):
    """
    Build a WHERE clause and params list for source + time filtering.

    source = None         → WHERE include_in_learning=1 AND created_at >= ?
    source = 'live'       → WHERE signal_source='live' AND created_at >= ?
    source = 'seeded'     → WHERE signal_source='seeded' AND created_at >= ?
    source = 'all'        → WHERE created_at >= ?
    """
    if source is None:
        # Default: metrics/learning-eligible only (live rows)
        return "WHERE include_in_metrics=1 AND created_at >= ?", [since]
    if source == "all":
        return "WHERE created_at >= ?", [since]
    return "WHERE signal_source=? AND created_at >= ?", [source, since]
