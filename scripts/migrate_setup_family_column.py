#!/usr/bin/env python3
"""
Migration: Add setup_family column to gold_set_entries and
distillation_candidate_reviews, then backfill flat_fashion-origin records.

Guardrails:
  - WA: Audit log written BEFORE any DB write.
  - TR: Backfill only touches records whose expected_pattern = 'flat'
        AND whose notes field contains the migration marker
        ('migrated from flat_fashion') — conservative scope.
  - Schema: TEXT NULL DEFAULT NULL on both tables.  No existing rows broken.

Run:
    python3 scripts/migrate_setup_family_column.py

Re-runnable: safe to run multiple times (ADD COLUMN is guarded; UPDATE is
             idempotent because it only sets NULL→value).

Verification after run:
    python3 -c "
    import sqlite3, json
    c = sqlite3.connect('data/ngw_users.db')
    print('gold setup_family counts:', dict(c.execute(
        'SELECT setup_family, COUNT(*) FROM gold_set_entries GROUP BY setup_family').fetchall()))
    print('dcr setup_family counts:', dict(c.execute(
        'SELECT setup_family, COUNT(*) FROM distillation_candidate_reviews GROUP BY setup_family').fetchall()))
    "
"""

import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DB_PATH   = REPO_ROOT / "data" / "ngw_users.db"
AUDIT_DIR = REPO_ROOT / "data" / "migration_audit"


# ── SetupFamily canonical values ────────────────────────────────────────────
VALID_SETUP_FAMILIES = {
    "portrait_classic", "headshot", "dramatic_portrait", "beauty",
    "fashion_catalog", "fashion_editorial",
    "editorial", "fine_art",
    "commercial", "high_key_commercial",
    "product_tabletop", "product_apparel", "bottle_liquid",
    "athletic",
    "natural_light", "lifestyle",
    "projected_textured", "high_key_beauty",
    "unknown",
}


def _write_audit(payload: dict) -> Path:
    """Write audit JSON before any DB mutation."""
    AUDIT_DIR.mkdir(parents=True, exist_ok=True)
    ts  = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    out = AUDIT_DIR / f"setup_family_migration_{ts}.json"
    out.write_text(json.dumps(payload, indent=2))
    print(f"[AUDIT] Written → {out}")
    return out


def _column_exists(conn: sqlite3.Connection, table: str, column: str) -> bool:
    cols = [row[1] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()]
    return column in cols


def run() -> None:
    if not DB_PATH.exists():
        print(f"[ERROR] Database not found: {DB_PATH}", file=sys.stderr)
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    # ── Pre-migration analysis ───────────────────────────────────────────────
    gse_flat = cur.execute(
        "SELECT COUNT(*) FROM gold_set_entries "
        "WHERE expected_analysis LIKE '%\"flat\"%' "
        "   OR notes LIKE '%flat_fashion%'"
    ).fetchone()[0]

    dcr_flat = cur.execute(
        "SELECT COUNT(*) FROM distillation_candidate_reviews "
        "WHERE expected_pattern = 'flat'"
    ).fetchone()[0]

    audit = {
        "migration_id":   "setup_family_column_v1",
        "timestamp_utc":  datetime.now(timezone.utc).isoformat(),
        "description":    "Add setup_family TEXT NULL column to gold_set_entries and distillation_candidate_reviews; backfill fashion_catalog for migrated flat_fashion records.",
        "guardrail_class": ["WA", "TR"],
        "pre_migration": {
            "gold_set_flat_candidates":  gse_flat,
            "dcr_flat_expected_pattern": dcr_flat,
        },
        "schema_changes": [
            "ALTER TABLE gold_set_entries ADD COLUMN setup_family TEXT NULL DEFAULT NULL",
            "ALTER TABLE distillation_candidate_reviews ADD COLUMN setup_family TEXT NULL DEFAULT NULL",
        ],
        "backfill_rule": (
            "SET setup_family = 'fashion_catalog' WHERE expected_pattern = 'flat' "
            "AND notes LIKE '%flat_fashion%' (conservative — only confirmed migrated records)"
        ),
        "valid_setup_families": sorted(VALID_SETUP_FAMILIES),
    }

    # ── Write audit BEFORE any mutation ─────────────────────────────────────
    _write_audit(audit)

    # ── Schema migration ─────────────────────────────────────────────────────
    tables = ["gold_set_entries", "distillation_candidate_reviews"]
    for table in tables:
        if _column_exists(conn, table, "setup_family"):
            print(f"[SKIP]  {table}.setup_family already exists")
        else:
            cur.execute(f"ALTER TABLE {table} ADD COLUMN setup_family TEXT NULL DEFAULT NULL")
            print(f"[ADD]   {table}.setup_family TEXT NULL added")

    conn.commit()

    # ── Backfill: gold_set_entries ───────────────────────────────────────────
    # Gold set entries store expected_analysis as JSON blob.
    # Conservative approach: flag only records where notes mention flat_fashion
    # OR where expected_analysis contains "flat_fashion" as pattern value.
    rows = cur.execute(
        "SELECT id, expected_analysis, notes FROM gold_set_entries "
        "WHERE setup_family IS NULL"
    ).fetchall()

    gse_backfilled = 0
    for row in rows:
        ea   = row["expected_analysis"] or ""
        note = row["notes"] or ""
        # Check if this record was originally flat_fashion
        is_flat_fashion_origin = (
            "flat_fashion" in ea
            or "flat_fashion" in note
        )
        if is_flat_fashion_origin:
            cur.execute(
                "UPDATE gold_set_entries SET setup_family = ? WHERE id = ?",
                ("fashion_catalog", row["id"])
            )
            gse_backfilled += 1
            print(f"  [GSE backfill] {row['id'][:12]}… → fashion_catalog")

    # ── Backfill: distillation_candidate_reviews ─────────────────────────────
    # More conservative: only touch records with flat expected_pattern
    # AND candidate_reason or notes mentioning flat_fashion origin.
    dcr_rows = cur.execute(
        "SELECT id, expected_pattern, notes, candidate_reason "
        "FROM distillation_candidate_reviews "
        "WHERE expected_pattern = 'flat' AND setup_family IS NULL"
    ).fetchall()

    dcr_backfilled = 0
    for row in dcr_rows:
        note   = row["notes"] or ""
        reason = row["candidate_reason"] or ""
        is_flat_fashion_origin = (
            "flat_fashion" in note
            or "flat_fashion" in reason
        )
        if is_flat_fashion_origin:
            cur.execute(
                "UPDATE distillation_candidate_reviews SET setup_family = ? WHERE id = ?",
                ("fashion_catalog", row["id"])
            )
            dcr_backfilled += 1
            print(f"  [DCR backfill] {row['id'][:12]}… → fashion_catalog")

    conn.commit()
    conn.close()

    # ── Summary ──────────────────────────────────────────────────────────────
    print()
    print("── Setup Family Migration Complete ──────────────────────────")
    print(f"  gold_set_entries.setup_family:               column added")
    print(f"  distillation_candidate_reviews.setup_family: column added")
    print(f"  GSE records backfilled (fashion_catalog):    {gse_backfilled}")
    print(f"  DCR records backfilled (fashion_catalog):    {dcr_backfilled}")
    print()
    print("  Next: Verify with:")
    print("    python3 -c \"import sqlite3, json; c=sqlite3.connect('data/ngw_users.db'); "
          "print(dict(c.execute('SELECT setup_family,COUNT(*) FROM gold_set_entries GROUP BY setup_family').fetchall()))\"")


if __name__ == "__main__":
    run()
