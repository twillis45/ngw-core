"""
Benchmark System v2 — SQLite schema and CRUD.

Tables:
  benchmark_cases    — structured test cases (upgraded Gold Set entries)
  benchmark_runs     — one record per benchmark execution
  benchmark_results  — per-case scores for each run
  pattern_metrics    — aggregated live + benchmark performance per pattern
"""
from __future__ import annotations

import json
import time
import uuid
from typing import Any, Dict, List, Optional

from db.database import get_db

# ── Schema ───────────────────────────────────────────────────────────────────

_BENCHMARK_SCHEMA = """
    CREATE TABLE IF NOT EXISTS benchmark_cases (
        id                  TEXT PRIMARY KEY,
        pattern_id          TEXT NOT NULL,
        difficulty          TEXT NOT NULL DEFAULT 'medium',
        environment_tags    TEXT NOT NULL DEFAULT '[]',
        image_path          TEXT NOT NULL,
        expected_analysis   TEXT NOT NULL DEFAULT '{}',
        expected_blueprint  TEXT NOT NULL DEFAULT '{}',
        expected_fixes      TEXT NOT NULL DEFAULT '[]',
        source_gold_set_id  TEXT,
        notes               TEXT,
        created_by          TEXT,
        created_at          REAL NOT NULL,
        updated_at          REAL NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_bm_cases_pattern    ON benchmark_cases(pattern_id);
    CREATE INDEX IF NOT EXISTS idx_bm_cases_difficulty ON benchmark_cases(difficulty);

    CREATE TABLE IF NOT EXISTS benchmark_runs (
        id                  TEXT PRIMARY KEY,
        run_type            TEXT NOT NULL DEFAULT 'manual',
        trigger             TEXT NOT NULL DEFAULT 'manual',
        started_at          REAL NOT NULL,
        completed_at        REAL,
        overall_score       REAL,
        pattern_accuracy    REAL,
        avg_blueprint_score REAL,
        confidence_error    REAL,
        total_cases         INTEGER DEFAULT 0,
        passed_cases        INTEGER DEFAULT 0,
        regression_count    INTEGER DEFAULT 0,
        status              TEXT NOT NULL DEFAULT 'running',
        triggered_by        TEXT,
        notes               TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_bm_runs_started ON benchmark_runs(started_at DESC);

    CREATE TABLE IF NOT EXISTS benchmark_results (
        id                  TEXT PRIMARY KEY,
        run_id              TEXT NOT NULL REFERENCES benchmark_runs(id) ON DELETE CASCADE,
        case_id             TEXT NOT NULL REFERENCES benchmark_cases(id) ON DELETE CASCADE,
        predicted_pattern   TEXT,
        pattern_correct     INTEGER DEFAULT 0,
        blueprint_score     REAL DEFAULT 0.0,
        fix_score           REAL DEFAULT 0.0,
        confidence_score    REAL DEFAULT 0.0,
        confidence_error    REAL DEFAULT 0.0,
        final_score         REAL DEFAULT 0.0,
        regression_flag     INTEGER DEFAULT 0,
        analysis_snapshot   TEXT,
        error_msg           TEXT,
        scored_at           REAL NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_bm_results_run  ON benchmark_results(run_id);
    CREATE INDEX IF NOT EXISTS idx_bm_results_case ON benchmark_results(case_id);

    CREATE TABLE IF NOT EXISTS pattern_metrics (
        pattern_id        TEXT PRIMARY KEY,
        benchmark_score   REAL DEFAULT 0.0,
        live_success_rate REAL DEFAULT 0.0,
        confidence_error  REAL DEFAULT 0.0,
        run_count         INTEGER DEFAULT 0,
        last_updated      REAL NOT NULL
    );
"""


def init_benchmark_tables() -> None:
    """Idempotent: create all benchmark tables if they don't exist."""
    with get_db() as conn:
        conn.executescript(_BENCHMARK_SCHEMA)


# ── Benchmark Cases ──────────────────────────────────────────────────────────

def create_benchmark_case(
    pattern_id: str,
    image_path: str,
    expected_analysis: Optional[Dict[str, Any]] = None,
    expected_blueprint: Optional[Dict[str, Any]] = None,
    expected_fixes: Optional[List[str]] = None,
    difficulty: str = "medium",
    environment_tags: Optional[List[str]] = None,
    source_gold_set_id: Optional[str] = None,
    notes: Optional[str] = None,
    created_by: Optional[str] = None,
) -> Dict[str, Any]:
    cid = uuid.uuid4().hex
    now = time.time()
    with get_db() as conn:
        conn.execute(
            """INSERT INTO benchmark_cases
               (id, pattern_id, difficulty, environment_tags, image_path,
                expected_analysis, expected_blueprint, expected_fixes,
                source_gold_set_id, notes, created_by, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                cid, pattern_id, difficulty,
                json.dumps(environment_tags or []),
                image_path,
                json.dumps(expected_analysis or {}),
                json.dumps(expected_blueprint or {}),
                json.dumps(expected_fixes or []),
                source_gold_set_id, notes, created_by, now, now,
            ),
        )
    return get_benchmark_case(cid)  # type: ignore[return-value]


def get_benchmark_cases(
    pattern_id: Optional[str] = None,
    difficulty: Optional[str] = None,
    limit: int = 200,
) -> List[Dict[str, Any]]:
    clauses: List[str] = []
    params: list = []
    if pattern_id:
        clauses.append("pattern_id = ?")
        params.append(pattern_id)
    if difficulty:
        clauses.append("difficulty = ?")
        params.append(difficulty)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    params.append(limit)
    with get_db() as conn:
        rows = conn.execute(
            f"SELECT * FROM benchmark_cases {where} ORDER BY created_at DESC LIMIT ?",
            params,
        ).fetchall()
    return [_deser_case(r) for r in rows]


def get_benchmark_case(case_id: str) -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM benchmark_cases WHERE id = ?", (case_id,)
        ).fetchone()
    return _deser_case(row) if row else None


def update_benchmark_case(case_id: str, **kwargs) -> Optional[Dict[str, Any]]:
    now = time.time()
    sets = ["updated_at = ?"]
    vals: list = [now]
    _json_fields = {"expected_analysis", "expected_blueprint", "expected_fixes", "environment_tags"}
    for key in ("pattern_id", "difficulty", "environment_tags", "image_path",
                "expected_analysis", "expected_blueprint", "expected_fixes", "notes"):
        if key in kwargs and kwargs[key] is not None:
            v = kwargs[key]
            if key in _json_fields and isinstance(v, (dict, list)):
                v = json.dumps(v)
            sets.append(f"{key} = ?")
            vals.append(v)
    vals.append(case_id)
    with get_db() as conn:
        conn.execute(f"UPDATE benchmark_cases SET {', '.join(sets)} WHERE id = ?", vals)
    return get_benchmark_case(case_id)


def delete_benchmark_case(case_id: str) -> bool:
    with get_db() as conn:
        c = conn.execute("DELETE FROM benchmark_cases WHERE id = ?", (case_id,))
    return c.rowcount > 0


def _deser_case(row) -> Dict[str, Any]:
    d = dict(row)
    for f in ("expected_analysis", "expected_blueprint", "expected_fixes", "environment_tags"):
        if d.get(f):
            try:
                d[f] = json.loads(d[f])
            except Exception:
                pass
    return d


# ── Benchmark Runs ───────────────────────────────────────────────────────────

def create_benchmark_run(
    run_type: str = "manual",
    trigger: str = "manual",
    triggered_by: Optional[str] = None,
    notes: Optional[str] = None,
) -> Dict[str, Any]:
    rid = uuid.uuid4().hex
    now = time.time()
    with get_db() as conn:
        conn.execute(
            """INSERT INTO benchmark_runs
               (id, run_type, trigger, started_at, status, triggered_by, notes)
               VALUES (?,?,?,?,?,?,?)""",
            (rid, run_type, trigger, now, "running", triggered_by, notes),
        )
    return get_benchmark_run(rid)  # type: ignore[return-value]


def complete_benchmark_run(
    run_id: str,
    overall_score: float,
    pattern_accuracy: float,
    avg_blueprint_score: float,
    confidence_error: float,
    total_cases: int,
    passed_cases: int,
    regression_count: int,
    status: str = "completed",
) -> Optional[Dict[str, Any]]:
    now = time.time()
    with get_db() as conn:
        conn.execute(
            """UPDATE benchmark_runs SET
               completed_at = ?, overall_score = ?, pattern_accuracy = ?,
               avg_blueprint_score = ?, confidence_error = ?,
               total_cases = ?, passed_cases = ?, regression_count = ?,
               status = ?
               WHERE id = ?""",
            (now, overall_score, pattern_accuracy, avg_blueprint_score,
             confidence_error, total_cases, passed_cases, regression_count,
             status, run_id),
        )
    return get_benchmark_run(run_id)


def get_benchmark_runs(limit: int = 20) -> List[Dict[str, Any]]:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM benchmark_runs ORDER BY started_at DESC LIMIT ?", (limit,)
        ).fetchall()
    return [dict(r) for r in rows]


def get_benchmark_run(run_id: str) -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM benchmark_runs WHERE id = ?", (run_id,)
        ).fetchone()
    return dict(row) if row else None


def get_recent_completed_run(exclude_run_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Most recent completed run, optionally excluding the current run."""
    with get_db() as conn:
        if exclude_run_id:
            row = conn.execute(
                """SELECT * FROM benchmark_runs
                   WHERE status IN ('completed', 'blocked') AND id != ?
                   ORDER BY started_at DESC LIMIT 1""",
                (exclude_run_id,),
            ).fetchone()
        else:
            row = conn.execute(
                """SELECT * FROM benchmark_runs
                   WHERE status IN ('completed', 'blocked')
                   ORDER BY started_at DESC LIMIT 1"""
            ).fetchone()
    return dict(row) if row else None


def get_last_n_run_scores(n: int = 5) -> List[float]:
    """Return overall_score for the last N completed runs (most recent first)."""
    with get_db() as conn:
        rows = conn.execute(
            """SELECT overall_score FROM benchmark_runs
               WHERE status IN ('completed', 'blocked') AND overall_score IS NOT NULL
               ORDER BY started_at DESC LIMIT ?""",
            (n,),
        ).fetchall()
    return [r["overall_score"] for r in rows]


# ── Benchmark Results ────────────────────────────────────────────────────────

def save_benchmark_result(
    run_id: str,
    case_id: str,
    predicted_pattern: Optional[str],
    pattern_correct: bool,
    blueprint_score: float,
    fix_score: float,
    confidence_score: float,
    confidence_error: float,
    final_score: float,
    regression_flag: bool = False,
    analysis_snapshot: Optional[Dict[str, Any]] = None,
    error_msg: Optional[str] = None,
) -> Dict[str, Any]:
    rid = uuid.uuid4().hex
    now = time.time()
    with get_db() as conn:
        conn.execute(
            """INSERT INTO benchmark_results
               (id, run_id, case_id, predicted_pattern, pattern_correct,
                blueprint_score, fix_score, confidence_score, confidence_error,
                final_score, regression_flag, analysis_snapshot, error_msg, scored_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                rid, run_id, case_id, predicted_pattern,
                1 if pattern_correct else 0,
                blueprint_score, fix_score, confidence_score,
                confidence_error, final_score,
                1 if regression_flag else 0,
                json.dumps(analysis_snapshot) if analysis_snapshot else None,
                error_msg, now,
            ),
        )
    return get_benchmark_result(rid)  # type: ignore[return-value]


def get_benchmark_result(result_id: str) -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM benchmark_results WHERE id = ?", (result_id,)
        ).fetchone()
    return _deser_result(row) if row else None


def get_run_results(run_id: str) -> List[Dict[str, Any]]:
    """All case results for a run, enriched with case metadata, sorted worst-first."""
    with get_db() as conn:
        rows = conn.execute(
            """SELECT r.*,
                      c.pattern_id, c.difficulty, c.image_path,
                      c.expected_analysis, c.expected_blueprint, c.expected_fixes
               FROM benchmark_results r
               JOIN benchmark_cases c ON r.case_id = c.id
               WHERE r.run_id = ?
               ORDER BY r.final_score ASC""",
            (run_id,),
        ).fetchall()
    return [_deser_result(r) for r in rows]


def get_case_history(case_id: str, limit: int = 10) -> List[Dict[str, Any]]:
    """Score history for one case across all runs."""
    with get_db() as conn:
        rows = conn.execute(
            """SELECT r.*, br.started_at as run_started_at, br.run_type
               FROM benchmark_results r
               JOIN benchmark_runs br ON r.run_id = br.id
               WHERE r.case_id = ?
               ORDER BY br.started_at DESC LIMIT ?""",
            (case_id, limit),
        ).fetchall()
    return [_deser_result(r) for r in rows]


def get_previous_pattern_scores(run_id: str) -> Dict[str, float]:
    """Per-pattern average final_score from the most recent previous completed run."""
    prev = get_recent_completed_run(exclude_run_id=run_id)
    if not prev:
        return {}
    with get_db() as conn:
        rows = conn.execute(
            """SELECT c.pattern_id, AVG(r.final_score) AS avg_score
               FROM benchmark_results r
               JOIN benchmark_cases c ON r.case_id = c.id
               WHERE r.run_id = ?
               GROUP BY c.pattern_id""",
            (prev["id"],),
        ).fetchall()
    return {r["pattern_id"]: r["avg_score"] for r in rows}


def _deser_result(row) -> Dict[str, Any]:
    d = dict(row)
    d["pattern_correct"] = bool(d.get("pattern_correct"))
    d["regression_flag"] = bool(d.get("regression_flag"))
    if d.get("analysis_snapshot"):
        try:
            d["analysis_snapshot"] = json.loads(d["analysis_snapshot"])
        except Exception:
            pass
    for f in ("expected_analysis", "expected_blueprint", "expected_fixes"):
        if d.get(f):
            try:
                d[f] = json.loads(d[f])
            except Exception:
                pass
    return d


# ── Pattern Metrics ──────────────────────────────────────────────────────────

def upsert_pattern_metric(
    pattern_id: str,
    benchmark_score: float,
    live_success_rate: float,
    confidence_error: float,
) -> Dict[str, Any]:
    now = time.time()
    with get_db() as conn:
        existing = conn.execute(
            "SELECT run_count FROM pattern_metrics WHERE pattern_id = ?", (pattern_id,)
        ).fetchone()
        if existing:
            conn.execute(
                """UPDATE pattern_metrics SET
                   benchmark_score = ?, live_success_rate = ?, confidence_error = ?,
                   run_count = run_count + 1, last_updated = ?
                   WHERE pattern_id = ?""",
                (benchmark_score, live_success_rate, confidence_error, now, pattern_id),
            )
        else:
            conn.execute(
                """INSERT INTO pattern_metrics
                   (pattern_id, benchmark_score, live_success_rate,
                    confidence_error, run_count, last_updated)
                   VALUES (?,?,?,?,1,?)""",
                (pattern_id, benchmark_score, live_success_rate, confidence_error, now),
            )
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM pattern_metrics WHERE pattern_id = ?", (pattern_id,)
        ).fetchone()
    return dict(row) if row else {}


def get_pattern_metrics(pattern_id: Optional[str] = None) -> List[Dict[str, Any]]:
    with get_db() as conn:
        if pattern_id:
            rows = conn.execute(
                "SELECT * FROM pattern_metrics WHERE pattern_id = ?", (pattern_id,)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM pattern_metrics ORDER BY benchmark_score DESC"
            ).fetchall()
    return [dict(r) for r in rows]
