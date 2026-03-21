"""SQLite database for user accounts and synced data."""
from __future__ import annotations

import json
import sqlite3
import time
import uuid
from pathlib import Path
from contextlib import contextmanager
from typing import Any, Dict, List, Optional

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "ngw_users.db"


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


@contextmanager
def get_db():
    conn = _get_conn()
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    """Create tables if they don't exist."""
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id          TEXT PRIMARY KEY,
                email       TEXT UNIQUE NOT NULL,
                username    TEXT UNIQUE NOT NULL,
                hashed_pw   TEXT NOT NULL,
                created_at  REAL NOT NULL,
                updated_at  REAL NOT NULL
            );

            CREATE TABLE IF NOT EXISTS user_kits (
                id          TEXT PRIMARY KEY,
                user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                kit_json    TEXT NOT NULL,
                updated_at  REAL NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_user_kits_user ON user_kits(user_id);

            CREATE TABLE IF NOT EXISTS user_setups (
                id          TEXT PRIMARY KEY,
                user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                name        TEXT NOT NULL,
                tag         TEXT NOT NULL DEFAULT 'personal',
                result_json TEXT NOT NULL,
                created_at  REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_user_setups_user ON user_setups(user_id);

            CREATE TABLE IF NOT EXISTS user_feedback (
                id          TEXT PRIMARY KEY,
                user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                setup_id    TEXT NOT NULL,
                mood        TEXT,
                pattern     TEXT,
                rating      INTEGER,
                comment     TEXT,
                created_at  REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_user_feedback_user ON user_feedback(user_id);

            CREATE TABLE IF NOT EXISTS admin_changelog (
                id          TEXT PRIMARY KEY,
                entity_type TEXT NOT NULL,
                entity_id   TEXT NOT NULL,
                action      TEXT NOT NULL,
                diff_json   TEXT NOT NULL,
                created_at  REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_changelog_entity ON admin_changelog(entity_type, entity_id);

            CREATE TABLE IF NOT EXISTS image_ground_truth (
                id               TEXT PRIMARY KEY,
                image_path       TEXT NOT NULL,
                expected_mood    TEXT,
                expected_pattern TEXT,
                actual_mood      TEXT,
                actual_pattern   TEXT,
                corrections      TEXT,
                created_at       REAL NOT NULL,
                updated_at       REAL NOT NULL
            );

            CREATE TABLE IF NOT EXISTS feedback_aggregates (
                id          TEXT PRIMARY KEY,
                system_id   TEXT NOT NULL,
                mood        TEXT,
                total_count INTEGER DEFAULT 0,
                avg_rating  REAL DEFAULT 0.0,
                updated_at  REAL NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_feedback_agg_sys_mood ON feedback_aggregates(system_id, mood);

            CREATE TABLE IF NOT EXISTS gold_set_entries (
                id                  TEXT PRIMARY KEY,
                image_path          TEXT NOT NULL,
                expected_analysis   TEXT,
                notes               TEXT,
                status              TEXT NOT NULL DEFAULT 'draft',
                created_by          TEXT,
                created_at          REAL NOT NULL,
                updated_at          REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_gold_set_status ON gold_set_entries(status);

            CREATE TABLE IF NOT EXISTS rule_candidates (
                id                  TEXT PRIMARY KEY,
                title               TEXT NOT NULL,
                description         TEXT NOT NULL,
                rationale           TEXT,
                source_gold_set_id  TEXT,
                proposed_change     TEXT,
                status              TEXT NOT NULL DEFAULT 'proposed',
                created_by          TEXT,
                created_at          REAL NOT NULL,
                updated_at          REAL NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_rule_candidates_status ON rule_candidates(status);
        """)
    from db.analytics import init_analytics_table
    init_analytics_table()
    from db.learning import init_learning_tables
    init_learning_tables()
    from db.provenance import init_provenance_table
    init_provenance_table()


# ── User CRUD ──────────────────────────────────────────────

def create_user(email: str, username: str, hashed_pw: str) -> Dict[str, Any]:
    uid = uuid.uuid4().hex
    now = time.time()
    with get_db() as conn:
        conn.execute(
            "INSERT INTO users (id, email, username, hashed_pw, created_at, updated_at) VALUES (?,?,?,?,?,?)",
            (uid, email.lower(), username, hashed_pw, now, now),
        )
    return {"id": uid, "email": email.lower(), "username": username}


def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM users WHERE email = ?", (email.lower(),)).fetchone()
    return dict(row) if row else None


def get_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return dict(row) if row else None


# ── Kit CRUD ───────────────────────────────────────────────

def save_user_kit(user_id: str, kit: Dict[str, Any]) -> Dict[str, Any]:
    kid = uuid.uuid4().hex
    now = time.time()
    kit_json = json.dumps(kit)
    with get_db() as conn:
        conn.execute(
            """INSERT INTO user_kits (id, user_id, kit_json, updated_at) VALUES (?,?,?,?)
               ON CONFLICT(user_id) DO UPDATE SET kit_json=excluded.kit_json, updated_at=excluded.updated_at""",
            (kid, user_id, kit_json, now),
        )
    return {"user_id": user_id, "kit": kit, "updated_at": now}


def get_user_kit(user_id: str) -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        row = conn.execute("SELECT * FROM user_kits WHERE user_id = ?", (user_id,)).fetchone()
    if not row:
        return None
    return {"id": row["id"], "kit": json.loads(row["kit_json"]), "updated_at": row["updated_at"]}


def delete_user_kit(user_id: str) -> bool:
    with get_db() as conn:
        c = conn.execute("DELETE FROM user_kits WHERE user_id = ?", (user_id,))
    return c.rowcount > 0


# ── Setups CRUD ────────────────────────────────────────────

def save_user_setup(user_id: str, name: str, tag: str, result: Dict[str, Any]) -> Dict[str, Any]:
    sid = uuid.uuid4().hex
    now = time.time()
    with get_db() as conn:
        conn.execute(
            "INSERT INTO user_setups (id, user_id, name, tag, result_json, created_at) VALUES (?,?,?,?,?,?)",
            (sid, user_id, name, tag, json.dumps(result), now),
        )
    return {"id": sid, "name": name, "tag": tag, "created_at": now}


def get_user_setups(user_id: str, limit: int = 50) -> List[Dict[str, Any]]:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM user_setups WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
            (user_id, limit),
        ).fetchall()
    return [
        {"id": r["id"], "name": r["name"], "tag": r["tag"],
         "result": json.loads(r["result_json"]), "created_at": r["created_at"]}
        for r in rows
    ]


def delete_user_setup(user_id: str, setup_id: str) -> bool:
    with get_db() as conn:
        c = conn.execute("DELETE FROM user_setups WHERE id = ? AND user_id = ?", (setup_id, user_id))
    return c.rowcount > 0


# ── Feedback CRUD ──────────────────────────────────────────

def save_user_feedback(user_id: str, setup_id: str, mood: str, pattern: str,
                       rating: int, comment: str) -> Dict[str, Any]:
    fid = uuid.uuid4().hex
    now = time.time()
    with get_db() as conn:
        conn.execute(
            "INSERT INTO user_feedback (id, user_id, setup_id, mood, pattern, rating, comment, created_at) VALUES (?,?,?,?,?,?,?,?)",
            (fid, user_id, setup_id, mood, pattern, rating, comment, now),
        )
    return {"id": fid, "setup_id": setup_id, "rating": rating, "created_at": now}


def get_user_feedback(user_id: str, limit: int = 100) -> List[Dict[str, Any]]:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM user_feedback WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
            (user_id, limit),
        ).fetchall()
    return [dict(r) for r in rows]


# ── Admin Changelog ───────────────────────────────────────

def log_admin_change(entity_type: str, entity_id: str, action: str, diff: Dict[str, Any]) -> Dict[str, Any]:
    cid = uuid.uuid4().hex
    now = time.time()
    with get_db() as conn:
        conn.execute(
            "INSERT INTO admin_changelog (id, entity_type, entity_id, action, diff_json, created_at) VALUES (?,?,?,?,?,?)",
            (cid, entity_type, entity_id, action, json.dumps(diff), now),
        )
    return {"id": cid, "entity_type": entity_type, "entity_id": entity_id, "action": action, "created_at": now}


def get_admin_changelog(limit: int = 50) -> List[Dict[str, Any]]:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM admin_changelog ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
    return [
        {**dict(r), "diff": json.loads(r["diff_json"])}
        for r in rows
    ]


# ── Image Ground Truth ────────────────────────────────────

def save_image_ground_truth(
    image_path: str,
    expected_mood: Optional[str] = None,
    expected_pattern: Optional[str] = None,
    actual_mood: Optional[str] = None,
    actual_pattern: Optional[str] = None,
    corrections: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    gid = uuid.uuid4().hex
    now = time.time()
    with get_db() as conn:
        conn.execute(
            """INSERT INTO image_ground_truth
               (id, image_path, expected_mood, expected_pattern, actual_mood, actual_pattern, corrections, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?)""",
            (gid, image_path, expected_mood, expected_pattern, actual_mood, actual_pattern,
             json.dumps(corrections) if corrections else None, now, now),
        )
    return {"id": gid, "image_path": image_path, "created_at": now}


def get_image_ground_truths(limit: int = 100) -> List[Dict[str, Any]]:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM image_ground_truth ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
    results = []
    for r in rows:
        d = dict(r)
        if d.get("corrections"):
            d["corrections"] = json.loads(d["corrections"])
        results.append(d)
    return results


# ── Feedback Aggregates ───────────────────────────────────

def upsert_feedback_aggregate(system_id: str, mood: str, rating: float) -> None:
    now = time.time()
    with get_db() as conn:
        existing = conn.execute(
            "SELECT id, total_count, avg_rating FROM feedback_aggregates WHERE system_id = ? AND mood = ?",
            (system_id, mood),
        ).fetchone()
        if existing:
            new_count = existing["total_count"] + 1
            new_avg = (existing["avg_rating"] * existing["total_count"] + rating) / new_count
            conn.execute(
                "UPDATE feedback_aggregates SET total_count = ?, avg_rating = ?, updated_at = ? WHERE id = ?",
                (new_count, new_avg, now, existing["id"]),
            )
        else:
            aid = uuid.uuid4().hex
            conn.execute(
                "INSERT INTO feedback_aggregates (id, system_id, mood, total_count, avg_rating, updated_at) VALUES (?,?,?,?,?,?)",
                (aid, system_id, mood, 1, float(rating), now),
            )


def get_feedback_aggregates() -> List[Dict[str, Any]]:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM feedback_aggregates ORDER BY system_id, mood"
        ).fetchall()
    return [dict(r) for r in rows]


def refresh_feedback_aggregates() -> int:
    """Recompute all feedback aggregates from user_feedback table."""
    with get_db() as conn:
        conn.execute("DELETE FROM feedback_aggregates")
        rows = conn.execute(
            """SELECT setup_id, mood, COUNT(*) as cnt, AVG(rating) as avg_r
               FROM user_feedback
               WHERE rating IS NOT NULL
               GROUP BY setup_id, mood"""
        ).fetchall()
        now = time.time()
        count = 0
        for r in rows:
            aid = uuid.uuid4().hex
            conn.execute(
                "INSERT INTO feedback_aggregates (id, system_id, mood, total_count, avg_rating, updated_at) VALUES (?,?,?,?,?,?)",
                (aid, r["setup_id"], r["mood"], r["cnt"], r["avg_r"], now),
            )
            count += 1
    return count


# ── Gold Set Entries CRUD ─────────────────────────────────

def create_gold_set_entry(
    image_path: str,
    expected_analysis: Optional[Dict[str, Any]] = None,
    notes: Optional[str] = None,
    status: str = "draft",
    created_by: Optional[str] = None,
) -> Dict[str, Any]:
    gid = uuid.uuid4().hex
    now = time.time()
    with get_db() as conn:
        conn.execute(
            """INSERT INTO gold_set_entries
               (id, image_path, expected_analysis, notes, status, created_by, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?)""",
            (gid, image_path,
             json.dumps(expected_analysis) if expected_analysis else None,
             notes, status, created_by, now, now),
        )
    return {
        "id": gid, "image_path": image_path,
        "expected_analysis": expected_analysis,
        "notes": notes, "status": status,
        "created_by": created_by,
        "created_at": now, "updated_at": now,
    }


def get_gold_set_entries(
    status: Optional[str] = None,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    with get_db() as conn:
        if status:
            rows = conn.execute(
                "SELECT * FROM gold_set_entries WHERE status = ? ORDER BY created_at DESC LIMIT ?",
                (status, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM gold_set_entries ORDER BY created_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
    results = []
    for r in rows:
        d = dict(r)
        if d.get("expected_analysis"):
            d["expected_analysis"] = json.loads(d["expected_analysis"])
        results.append(d)
    return results


def get_gold_set_entry(entry_id: str) -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM gold_set_entries WHERE id = ?", (entry_id,)
        ).fetchone()
    if not row:
        return None
    d = dict(row)
    if d.get("expected_analysis"):
        d["expected_analysis"] = json.loads(d["expected_analysis"])
    return d


def update_gold_set_entry(entry_id: str, **kwargs) -> Optional[Dict[str, Any]]:
    now = time.time()
    sets = ["updated_at = ?"]
    vals: list = [now]
    for key in ("expected_analysis", "notes", "status"):
        if key in kwargs:
            v = kwargs[key]
            if key == "expected_analysis" and isinstance(v, dict):
                v = json.dumps(v)
            sets.append(f"{key} = ?")
            vals.append(v)
    vals.append(entry_id)
    with get_db() as conn:
        conn.execute(
            f"UPDATE gold_set_entries SET {', '.join(sets)} WHERE id = ?",
            vals,
        )
    return get_gold_set_entry(entry_id)


def delete_gold_set_entry(entry_id: str) -> bool:
    with get_db() as conn:
        c = conn.execute("DELETE FROM gold_set_entries WHERE id = ?", (entry_id,))
    return c.rowcount > 0


# ── Rule Candidates CRUD ─────────────────────────────────

def create_rule_candidate(
    title: str,
    description: str,
    rationale: Optional[str] = None,
    source_gold_set_id: Optional[str] = None,
    proposed_change: Optional[Dict[str, Any]] = None,
    status: str = "proposed",
    created_by: Optional[str] = None,
) -> Dict[str, Any]:
    cid = uuid.uuid4().hex
    now = time.time()
    with get_db() as conn:
        conn.execute(
            """INSERT INTO rule_candidates
               (id, title, description, rationale, source_gold_set_id, proposed_change, status, created_by, created_at, updated_at)
               VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (cid, title, description, rationale, source_gold_set_id,
             json.dumps(proposed_change) if proposed_change else None,
             status, created_by, now, now),
        )
    return {
        "id": cid, "title": title, "description": description,
        "rationale": rationale, "source_gold_set_id": source_gold_set_id,
        "proposed_change": proposed_change, "status": status,
        "created_by": created_by,
        "created_at": now, "updated_at": now,
    }


def get_rule_candidates(
    status: Optional[str] = None,
    limit: int = 50,
) -> List[Dict[str, Any]]:
    with get_db() as conn:
        if status:
            rows = conn.execute(
                "SELECT * FROM rule_candidates WHERE status = ? ORDER BY created_at DESC LIMIT ?",
                (status, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM rule_candidates ORDER BY created_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
    results = []
    for r in rows:
        d = dict(r)
        if d.get("proposed_change"):
            d["proposed_change"] = json.loads(d["proposed_change"])
        results.append(d)
    return results


def get_rule_candidate(candidate_id: str) -> Optional[Dict[str, Any]]:
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM rule_candidates WHERE id = ?", (candidate_id,)
        ).fetchone()
    if not row:
        return None
    d = dict(row)
    if d.get("proposed_change"):
        d["proposed_change"] = json.loads(d["proposed_change"])
    return d


def update_rule_candidate(candidate_id: str, **kwargs) -> Optional[Dict[str, Any]]:
    now = time.time()
    sets = ["updated_at = ?"]
    vals: list = [now]
    for key in ("title", "description", "rationale", "proposed_change", "status"):
        if key in kwargs:
            v = kwargs[key]
            if key == "proposed_change" and isinstance(v, dict):
                v = json.dumps(v)
            sets.append(f"{key} = ?")
            vals.append(v)
    vals.append(candidate_id)
    with get_db() as conn:
        conn.execute(
            f"UPDATE rule_candidates SET {', '.join(sets)} WHERE id = ?",
            vals,
        )
    return get_rule_candidate(candidate_id)


def delete_rule_candidate(candidate_id: str) -> bool:
    with get_db() as conn:
        c = conn.execute("DELETE FROM rule_candidates WHERE id = ?", (candidate_id,))
    return c.rowcount > 0
