"""
Seed VLM disagreement rows for smoke-testing Failure Triage.

Creates realistic triage data with both overconfident misses (VLM was
confident but wrong) and underconfident hits (VLM agreed but with low
confidence), so the LAB Triage panel has rows to display.

Usage:
    cd /Users/toddwillis/Documents/ngw-core
    python3 scripts/seed_triage_data.py

Flags:
    --clear     Remove all seeded rows before inserting (matches analysis_id prefix 'seed-')
    --count N   Number of rows per category (default 8)
"""
from __future__ import annotations

import argparse
import os
import sys
import time
import uuid

# Ensure project root is on path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from db.database import get_db, save_vlm_disagreements

# ── Realistic pattern names from the NGW domain ─────────────────
PATTERNS = [
    "butterfly",
    "clamshell",
    "paramount",
    "loop",
    "split",
    "broad",
    "short",
    "flat_loop",
    "high_cheek",
    "rembrandt",
]

RESOLVED_SOURCES = [
    "reference_read",
    "cv_classifier_v3",
    "specialty_resolver",
    "vlm_hint_confirmed",
]

PIPELINE_VERSION = "3A.2-seed"

# ── Seed data generators ────────────────────────────────────────

def _make_overconfident_miss(i: int) -> dict:
    """VLM was confident but disagreed with CV resolver — candidate failure."""
    vlm_pattern = PATTERNS[i % len(PATTERNS)]
    # Pick a different resolved pattern
    resolved_pattern = PATTERNS[(i + 3) % len(PATTERNS)]
    confidence = round(0.65 + (i % 6) * 0.05, 2)  # 0.65 – 0.90
    return {
        "field_name": "pattern",
        "vlm_value": vlm_pattern,
        "vlm_confidence": confidence,
        "resolved_value": resolved_pattern,
        "resolved_source": RESOLVED_SOURCES[i % len(RESOLVED_SOURCES)],
        "agreement": "conflicting",
        "disagreement_magnitude": round(abs(confidence - 0.4), 2),
        "pipeline_version": PIPELINE_VERSION,
    }


def _make_underconfident_hit(i: int) -> dict:
    """VLM agreed with CV resolver but at low confidence — uncertain."""
    pattern = PATTERNS[(i + 5) % len(PATTERNS)]
    confidence = round(0.10 + (i % 7) * 0.05, 2)  # 0.10 – 0.40
    return {
        "field_name": "pattern",
        "vlm_value": pattern,
        "vlm_confidence": confidence,
        "resolved_value": pattern,  # same — they agree
        "resolved_source": RESOLVED_SOURCES[(i + 1) % len(RESOLVED_SOURCES)],
        "agreement": "confirmed",
        "disagreement_magnitude": 0.0,
        "pipeline_version": PIPELINE_VERSION,
    }


def main():
    parser = argparse.ArgumentParser(description="Seed triage data for smoke testing")
    parser.add_argument("--clear", action="store_true", help="Remove existing seed rows first")
    parser.add_argument("--count", type=int, default=8, help="Rows per category (default 8)")
    args = parser.parse_args()

    if args.clear:
        print("Clearing existing seed triage rows (analysis_id LIKE 'seed-%')...")
        with get_db() as conn:
            cur = conn.execute(
                "DELETE FROM vlm_disagreements WHERE analysis_id LIKE 'seed-%'"
            )
            print(f"  Removed {cur.rowcount} rows.\n")

    n = args.count
    print(f"Seeding {n} overconfident misses + {n} underconfident hits...\n")

    # Each "analysis" gets a unique seed analysis_id
    for i in range(n):
        analysis_id = f"seed-overconf-{uuid.uuid4().hex[:8]}"
        record = _make_overconfident_miss(i)
        save_vlm_disagreements(analysis_id, [record])
        print(f"  [overconfident] {record['vlm_value']:>14s} vs {record['resolved_value']:<14s}  "
              f"conf={record['vlm_confidence']:.2f}  id={analysis_id}")

    print()

    for i in range(n):
        analysis_id = f"seed-underconf-{uuid.uuid4().hex[:8]}"
        record = _make_underconfident_hit(i)
        save_vlm_disagreements(analysis_id, [record])
        print(f"  [underconfident] {record['vlm_value']:>14s} = {record['resolved_value']:<14s}  "
              f"conf={record['vlm_confidence']:.2f}  id={analysis_id}")

    print(f"\nDone. {n * 2} triage rows seeded.")
    print("Verify: open LAB > Intel > Learning Ops > Triage panel.")


if __name__ == "__main__":
    main()
