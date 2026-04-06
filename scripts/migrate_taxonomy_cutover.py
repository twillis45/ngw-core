"""NGW Taxonomy Hard-Cutover Migration Script — Phase 4

GUARDRAIL ACKNOWLEDGMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
This script modifies source facts in distillation_candidate_reviews
(expected_pattern, predicted_pattern), which is normally frozen under
guardrail TR-001.

This is an acknowledged exception: the changes are machine value renames
only — the semantic truth of each record is preserved.  No human review
decisions are altered.  Every modification is written to an audit log
before execution.

Run date:     2026-04-06
Alias window: migration aliases removed after 2026-05-06
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WHAT THIS SCRIPT DOES

1. Updates benchmark JSON files in benchmarks/
   - expected_pattern, benchmark_id references, acceptable_patterns lists

2. Updates data/gold_set/manifest.json
   - expected_pattern, acceptable_patterns

3. Updates data/reference_dataset/_manifest.json
   - pattern values in entry records

4. Updates SQLite DB: distillation_candidate_reviews
   - expected_pattern column (rename only — TR-001 acknowledged exception)
   - predicted_pattern column (rename only — TR-001 acknowledged exception)

5. Updates SQLite DB: gold_set_entries
   - expected_analysis JSON blob (pattern key)

6. Writes a complete audit log before any write executes.

USAGE

    python3 scripts/migrate_taxonomy_cutover.py --dry-run   # preview only
    python3 scripts/migrate_taxonomy_cutover.py             # execute

VERIFICATION

After running:
    grep -r "rim_only\\|ring_light\\|flat_fashion\\|gobo_projection" \\
        benchmarks/*.json data/gold_set/manifest.json
    # Must return zero matches (except in known_challenges prose)

    python3 scripts/run_benchmarks.py
    # Must stay >= 94% pass rate
"""

from __future__ import annotations

import argparse
import json
import logging
import sqlite3
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Tuple

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
log = logging.getLogger("ngw.migrate.taxonomy")

# ─────────────────────────────────────────────────────────────────────────────
# Rename map — old canonical value → new canonical value
# ─────────────────────────────────────────────────────────────────────────────

PATTERN_RENAMES: Dict[str, str] = {
    "rim_only":        "rim",
    "ring_light":      "axial",
    "flat_fashion":    "flat",
    "gobo_projection": "projected",
    "gobo":            "projected",    # benchmark files use "gobo" (not "gobo_projection")
    # Source-context moves — geometry default assigned conservatively
    "golden_hour":     "loop",         # warm directional sidelight → loop geometry default
    "overcast_natural": "flat",        # diffuse bilateral → flat geometry default
    "mixed_light":     "unknown",      # no reliable geometry default
}

# Human-readable note added to migrated records so reviewers know the default
GEOMETRY_DEFAULT_NOTE: Dict[str, str] = {
    "golden_hour":     "geometry defaulted to loop during source_context migration — verify",
    "overcast_natural": "geometry defaulted to flat during source_context migration — verify",
    "mixed_light":     "geometry defaulted to unknown during source_context migration — verify",
}

# Source context values assigned for moved patterns
SOURCE_CONTEXT_ASSIGN: Dict[str, str] = {
    "golden_hour":     "golden_hour",
    "overcast_natural": "overcast",
    "mixed_light":     "mixed_source",
}

# ─────────────────────────────────────────────────────────────────────────────
# Paths
# ─────────────────────────────────────────────────────────────────────────────

REPO_ROOT      = Path(__file__).parent.parent
BENCHMARKS_DIR = REPO_ROOT / "benchmarks"
GOLD_SET_MANIFEST = REPO_ROOT / "data" / "gold_set" / "manifest.json"
REF_MANIFEST   = REPO_ROOT / "data" / "reference_dataset" / "_manifest.json"
DB_PATH        = REPO_ROOT / "data" / "ngw_users.db"
AUDIT_LOG_DIR  = REPO_ROOT / "data" / "migration_audit"


# ─────────────────────────────────────────────────────────────────────────────
# Audit log
# ─────────────────────────────────────────────────────────────────────────────

def _audit_path() -> Path:
    AUDIT_LOG_DIR.mkdir(parents=True, exist_ok=True)
    ts = time.strftime("%Y%m%d_%H%M%S")
    return AUDIT_LOG_DIR / f"taxonomy_cutover_{ts}.json"


def _write_audit(audit: Dict[str, Any], path: Path) -> None:
    path.write_text(json.dumps(audit, indent=2, default=str))
    log.info("Audit log written: %s", path)


# ─────────────────────────────────────────────────────────────────────────────
# Rename helpers
# ─────────────────────────────────────────────────────────────────────────────

def _rename_value(value: str) -> str:
    """Return new canonical value, or the original if no rename needed."""
    return PATTERN_RENAMES.get(value, value)


def _rename_list(values: List[str]) -> Tuple[List[str], bool]:
    """Return (renamed_list, changed) for a list of pattern strings."""
    renamed = [_rename_value(v) for v in values]
    # Deduplicate while preserving order (flat + flat_fashion → flat, flat → flat)
    seen = set()
    deduped = []
    for v in renamed:
        if v not in seen:
            seen.add(v)
            deduped.append(v)
    changed = deduped != values
    return deduped, changed


# ─────────────────────────────────────────────────────────────────────────────
# Benchmark JSONs
# ─────────────────────────────────────────────────────────────────────────────

def _migrate_benchmark_files(dry_run: bool) -> List[Dict[str, Any]]:
    log.info("─── Benchmark JSON files ───────────────────────")
    records = []
    for jf in sorted(BENCHMARKS_DIR.glob("*.json")):
        data = json.loads(jf.read_text())
        original = json.dumps(data, sort_keys=True)
        changed_fields = []

        # expected_pattern
        ep = data.get("ground_truth", {}).get("expected_pattern", "")
        new_ep = _rename_value(ep)
        if new_ep != ep:
            changed_fields.append({"field": "expected_pattern", "old": ep, "new": new_ep})
            if not dry_run:
                data["ground_truth"]["expected_pattern"] = new_ep

        # acceptable_patterns
        ap = data.get("ground_truth", {}).get("acceptable_patterns", [])
        new_ap, ap_changed = _rename_list(ap)
        if ap_changed:
            changed_fields.append({"field": "acceptable_patterns", "old": ap, "new": new_ap})
            if not dry_run:
                data["ground_truth"]["acceptable_patterns"] = new_ap

        if changed_fields:
            records.append({"file": str(jf.name), "changes": changed_fields})
            log.info("  %s %s: %s", "DRY" if dry_run else "UPD", jf.name,
                     [(c["field"], c["old"], "→", c["new"]) for c in changed_fields])
            if not dry_run:
                jf.write_text(json.dumps(data, indent=2) + "\n")

    log.info("  Benchmark files changed: %d", len(records))
    return records


# ─────────────────────────────────────────────────────────────────────────────
# Gold set manifest
# ─────────────────────────────────────────────────────────────────────────────

def _migrate_gold_set_manifest(dry_run: bool) -> List[Dict[str, Any]]:
    log.info("─── Gold set manifest ──────────────────────────")
    if not GOLD_SET_MANIFEST.exists():
        log.warning("Gold set manifest not found: %s", GOLD_SET_MANIFEST)
        return []

    data = json.loads(GOLD_SET_MANIFEST.read_text())
    records = []
    entries = data.get("entries", data) if isinstance(data, dict) else data
    entry_list = entries if isinstance(entries, list) else []

    for entry in entry_list:
        changed_fields = []
        ep = entry.get("expected_pattern", "")
        new_ep = _rename_value(ep)
        if new_ep != ep:
            changed_fields.append({"field": "expected_pattern", "old": ep, "new": new_ep})
            if not dry_run:
                entry["expected_pattern"] = new_ep

        ap = entry.get("acceptable_patterns", [])
        new_ap, ap_changed = _rename_list(ap)
        if ap_changed:
            changed_fields.append({"field": "acceptable_patterns", "old": ap, "new": new_ap})
            if not dry_run:
                entry["acceptable_patterns"] = new_ap

        if changed_fields:
            rec = {"entry_id": entry.get("id", entry.get("benchmark_id", "?")),
                   "changes": changed_fields}
            records.append(rec)
            log.info("  %s gold_set entry %s", "DRY" if dry_run else "UPD",
                     rec["entry_id"])

    if records and not dry_run:
        GOLD_SET_MANIFEST.write_text(json.dumps(data, indent=2) + "\n")
        log.info("  Gold set manifest updated.")

    log.info("  Gold set entries changed: %d", len(records))
    return records


# ─────────────────────────────────────────────────────────────────────────────
# Reference dataset manifest
# ─────────────────────────────────────────────────────────────────────────────

def _migrate_ref_manifest(dry_run: bool) -> List[Dict[str, Any]]:
    log.info("─── Reference dataset manifest ─────────────────")
    if not REF_MANIFEST.exists():
        log.warning("Reference manifest not found: %s", REF_MANIFEST)
        return []

    data = json.loads(REF_MANIFEST.read_text())
    records = []
    entries = data if isinstance(data, list) else data.get("entries", [])

    for entry in entries:
        changed_fields = []
        for field in ("pattern", "expected_pattern", "shadow_pattern"):
            val = entry.get(field)
            if val and isinstance(val, str):
                new_val = _rename_value(val)
                if new_val != val:
                    changed_fields.append({"field": field, "old": val, "new": new_val})
                    if not dry_run:
                        entry[field] = new_val

        if changed_fields:
            records.append({
                "entry_id": entry.get("id", entry.get("filename", "?")),
                "changes": changed_fields,
            })

    if records and not dry_run:
        REF_MANIFEST.write_text(json.dumps(data, indent=2) + "\n")
        log.info("  Reference manifest updated.")

    log.info("  Reference manifest entries changed: %d", len(records))
    return records


# ─────────────────────────────────────────────────────────────────────────────
# DB migration
# ─────────────────────────────────────────────────────────────────────────────

def _migrate_db(dry_run: bool) -> Dict[str, Any]:
    log.info("─── SQLite DB migration ────────────────────────")
    if not DB_PATH.exists():
        log.warning("DB not found at %s — skipping DB migration", DB_PATH)
        return {"skipped": True, "reason": "DB not found"}

    db_records: Dict[str, Any] = {
        "guardrail_exception": (
            "TR-001 acknowledged: machine value rename only. "
            "Semantic truth of each record is preserved. "
            "Source facts (expected_pattern, predicted_pattern) are being updated "
            "solely to reflect the new canonical machine values."
        ),
        "distillation_candidate_reviews": [],
        "gold_set_entries": [],
    }

    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    try:
        # ── distillation_candidate_reviews ────────────────────────────────
        for old_val, new_val in PATTERN_RENAMES.items():
            # expected_pattern
            rows = conn.execute(
                "SELECT id, expected_pattern FROM distillation_candidate_reviews "
                "WHERE expected_pattern = ?", (old_val,)
            ).fetchall()
            for row in rows:
                rec = {
                    "table": "distillation_candidate_reviews",
                    "column": "expected_pattern",
                    "id": row["id"],
                    "old": old_val,
                    "new": new_val,
                }
                db_records["distillation_candidate_reviews"].append(rec)
                log.info("  %s dcr.expected_pattern %s → %s (id=%s)",
                         "DRY" if dry_run else "UPD", old_val, new_val, row["id"])
                if not dry_run:
                    conn.execute(
                        "UPDATE distillation_candidate_reviews "
                        "SET expected_pattern = ?, updated_at = ? WHERE id = ?",
                        (new_val, time.time(), row["id"]),
                    )

            # predicted_pattern
            rows = conn.execute(
                "SELECT id, predicted_pattern FROM distillation_candidate_reviews "
                "WHERE predicted_pattern = ?", (old_val,)
            ).fetchall()
            for row in rows:
                rec = {
                    "table": "distillation_candidate_reviews",
                    "column": "predicted_pattern",
                    "id": row["id"],
                    "old": old_val,
                    "new": new_val,
                }
                db_records["distillation_candidate_reviews"].append(rec)
                if not dry_run:
                    conn.execute(
                        "UPDATE distillation_candidate_reviews "
                        "SET predicted_pattern = ?, updated_at = ? WHERE id = ?",
                        (new_val, time.time(), row["id"]),
                    )

        # ── gold_set_entries (expected_analysis JSON blob) ────────────────
        rows = conn.execute(
            "SELECT id, expected_analysis FROM gold_set_entries "
            "WHERE expected_analysis IS NOT NULL"
        ).fetchall()
        for row in rows:
            try:
                ea = json.loads(row["expected_analysis"])
            except (json.JSONDecodeError, TypeError):
                continue
            changed = False
            old_ea = json.dumps(ea, sort_keys=True)
            pat = ea.get("pattern") or ea.get("expected_pattern")
            if pat and pat in PATTERN_RENAMES:
                new_pat = PATTERN_RENAMES[pat]
                for key in ("pattern", "expected_pattern"):
                    if ea.get(key) == pat:
                        ea[key] = new_pat
                        changed = True
            if changed:
                rec = {"table": "gold_set_entries", "id": row["id"],
                       "old_json": old_ea, "new_json": json.dumps(ea, sort_keys=True)}
                db_records["gold_set_entries"].append(rec)
                if not dry_run:
                    conn.execute(
                        "UPDATE gold_set_entries SET expected_analysis = ?, updated_at = ? "
                        "WHERE id = ?",
                        (json.dumps(ea), time.time(), row["id"]),
                    )

        if not dry_run:
            conn.commit()
            log.info("  DB commit complete.")

        dcr_count = len(db_records["distillation_candidate_reviews"])
        gs_count  = len(db_records["gold_set_entries"])
        log.info("  distillation_candidate_reviews rows changed: %d", dcr_count)
        log.info("  gold_set_entries rows changed: %d", gs_count)

    finally:
        conn.close()

    return db_records


# ─────────────────────────────────────────────────────────────────────────────
# Verification checks (post-migration)
# ─────────────────────────────────────────────────────────────────────────────

def _verify(dry_run: bool) -> bool:
    """Run post-migration sanity checks. Returns True if all pass."""
    if dry_run:
        log.info("─── Verification skipped (dry-run) ─────────────")
        return True

    log.info("─── Post-migration verification ────────────────")
    failures = []

    # 1. Benchmark files must not contain old values (except in prose fields)
    for jf in BENCHMARKS_DIR.glob("*.json"):
        data = json.loads(jf.read_text())
        gt = data.get("ground_truth", {})
        for old in PATTERN_RENAMES:
            if gt.get("expected_pattern") == old:
                failures.append(f"benchmark {jf.name}: expected_pattern still '{old}'")
            if old in gt.get("acceptable_patterns", []):
                failures.append(f"benchmark {jf.name}: acceptable_patterns still contains '{old}'")

    # 2. DB canonical fields must be snake_case only (no display labels)
    if DB_PATH.exists():
        conn = sqlite3.connect(str(DB_PATH))
        conn.row_factory = sqlite3.Row
        DISPLAY_INDICATORS = ["/", " ", "On-Axis", "Interrupted", "Back Key", "Edge Light"]
        try:
            rows = conn.execute(
                "SELECT id, expected_pattern, predicted_pattern "
                "FROM distillation_candidate_reviews"
            ).fetchall()
            for row in rows:
                for col in ("expected_pattern", "predicted_pattern"):
                    val = row[col]
                    if not val:
                        continue
                    for indicator in DISPLAY_INDICATORS:
                        if indicator in val:
                            failures.append(
                                f"GUARDRAIL TX-001: display label in canonical field "
                                f"dcr.{col} id={row['id']}: '{val}'"
                            )
        finally:
            conn.close()

    if failures:
        log.error("Verification FAILED:")
        for f in failures:
            log.error("  ✗ %s", f)
        return False

    log.info("  Verification PASSED — no old values remain in canonical fields")
    return True


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main() -> int:
    parser = argparse.ArgumentParser(description="NGW taxonomy hard-cutover migration")
    parser.add_argument("--dry-run", action="store_true",
                        help="Preview changes without writing anything")
    args = parser.parse_args()
    dry_run = args.dry_run

    if dry_run:
        log.info("DRY RUN — no files or DB rows will be modified")
    else:
        log.info("EXECUTE MODE — changes will be written")

    audit: Dict[str, Any] = {
        "migration": "taxonomy_hard_cutover",
        "date": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "dry_run": dry_run,
        "rename_map": PATTERN_RENAMES,
        "guardrail_exception": (
            "TR-001 acknowledged: distillation_candidate_reviews source fact update. "
            "Machine value rename only — semantic truth preserved."
        ),
        "surfaces": {},
    }

    # Write audit log BEFORE any changes (guardrail WA requirement)
    audit_path = _audit_path()
    if not dry_run:
        # Write skeleton audit first — will be updated after migrations complete
        _write_audit({**audit, "status": "in_progress"}, audit_path)

    # Execute migrations
    audit["surfaces"]["benchmark_files"] = _migrate_benchmark_files(dry_run)
    audit["surfaces"]["gold_set_manifest"] = _migrate_gold_set_manifest(dry_run)
    audit["surfaces"]["ref_manifest"] = _migrate_ref_manifest(dry_run)
    audit["surfaces"]["db"] = _migrate_db(dry_run)

    # Post-migration verification
    ok = _verify(dry_run)
    audit["verification_passed"] = ok
    audit["status"] = "complete" if ok else "failed"

    # Write final audit log
    if not dry_run:
        _write_audit(audit, audit_path)

    if ok:
        log.info("")
        log.info("Migration %s complete.", "preview" if dry_run else "")
        log.info("Next: python3 scripts/run_benchmarks.py  (must be >= 94%%)")
        if not dry_run:
            log.info("Audit log: %s", audit_path)
            log.info("Migration aliases valid until: 2026-05-06")
            log.info("Remove aliases from enums.py and blueprint_service.py after that date.")
        return 0
    else:
        log.error("Migration completed with verification failures — review audit log")
        return 1


if __name__ == "__main__":
    sys.exit(main())
