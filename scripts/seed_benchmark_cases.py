"""
Seed benchmark_cases table from the gold set manifest.

Usage:
    cd /Users/toddwillis/Documents/ngw-core
    python3 scripts/seed_benchmark_cases.py
"""
from __future__ import annotations

import json
import sys
import os

# Ensure project root is on path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from db.benchmark import init_benchmark_tables, get_benchmark_cases, create_benchmark_case

MANIFEST_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "data", "gold_set", "manifest.json",
)


def main():
    print("Initialising benchmark tables...")
    init_benchmark_tables()

    print(f"Reading manifest: {MANIFEST_PATH}")
    with open(MANIFEST_PATH) as f:
        manifest = json.load(f)

    entries = manifest.get("entries", [])
    print(f"Found {len(entries)} entries in manifest.\n")

    # Check existing cases to avoid duplicates (match on source_gold_set_id)
    existing = get_benchmark_cases(limit=500)
    existing_gold_ids = {c.get("source_gold_set_id") for c in existing if c.get("source_gold_set_id")}
    print(f"Existing cases in DB: {len(existing)} ({len(existing_gold_ids)} from gold set)\n")

    created = 0
    skipped = 0

    for entry in entries:
        gold_id = entry["id"]

        if gold_id in existing_gold_ids:
            print(f"  SKIP  {gold_id}  (already seeded)")
            skipped += 1
            continue

        # Map manifest difficulty to benchmark difficulty
        difficulty = entry.get("difficulty", "standard")
        if difficulty == "standard":
            difficulty = "medium"
        # "hard" maps directly

        # Build expected_analysis from manifest fields
        expected_analysis = {
            "expected_pattern":    entry.get("expected_pattern"),
            "acceptable_patterns": entry.get("acceptable_patterns", []),
            "expected_light_count": entry.get("expected_light_count"),
            "acceptable_light_count_range": entry.get("acceptable_light_count_range"),
            "expected_key_direction": entry.get("expected_key_direction"),
            "dataset_tier": entry.get("dataset_tier", "gold"),
            "trust_score":  entry.get("trust_score", 0.9),
            "known_challenges": entry.get("known_challenges", []),
        }

        case = create_benchmark_case(
            pattern_id=entry["expected_pattern"],
            image_path=entry["image_path"],
            expected_analysis=expected_analysis,
            difficulty=difficulty,
            source_gold_set_id=gold_id,
            notes=entry.get("notes") or None,
            created_by="seed_benchmark_cases.py",
        )
        print(f"  CREATED  {gold_id}  -> case id={case['id']}  pattern={case['pattern_id']}  difficulty={case['difficulty']}")
        created += 1

    print(f"\nDone. Created: {created}  Skipped: {skipped}")
    total = get_benchmark_cases(limit=500)
    print(f"Total benchmark cases in DB: {len(total)}")


if __name__ == "__main__":
    main()
