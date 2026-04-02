"""seed_candidate_reviews.py — Phase 5c: seed distillation_candidate_reviews table.

Finds the latest Phase 5b candidates JSON report in data/distillation_candidates/,
seeds the distillation_candidate_reviews table from it, and prints a summary.

Safe to re-run: existing rows (keyed by image_path) are skipped, not overwritten.

Usage
-----
    python3 scripts/intelligence/seed_candidate_reviews.py
    python3 scripts/intelligence/seed_candidate_reviews.py --report path/to/report.json
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path


def _find_latest_report(candidates_dir: Path) -> Path:
    reports = sorted(candidates_dir.glob("candidates_*.json"), key=lambda p: p.stat().st_mtime)
    if not reports:
        raise FileNotFoundError(
            f"No candidates_*.json files found in {candidates_dir}. "
            "Run distillation_candidates.py first."
        )
    return reports[-1]


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed distillation_candidate_reviews from a Phase 5b report.")
    parser.add_argument(
        "--report",
        default=None,
        help="Path to a specific candidates JSON report. "
             "Defaults to the latest file in data/distillation_candidates/.",
    )
    args = parser.parse_args()

    # Resolve project root (two levels up from this script)
    project_root = Path(__file__).resolve().parent.parent.parent

    if args.report:
        report_path = Path(args.report).resolve()
    else:
        candidates_dir = project_root / "data" / "distillation_candidates"
        report_path = _find_latest_report(candidates_dir)

    if not report_path.exists():
        print(f"[error] Report not found: {report_path}", file=sys.stderr)
        sys.exit(1)

    print(f"[info] Seeding from: {report_path.name}")

    # Ensure DB is initialised (creates table if not exists)
    sys.path.insert(0, str(project_root))
    from db.database import init_db
    init_db()

    from db.distillation_reviews import seed_from_report
    seeded, skipped = seed_from_report(str(report_path))

    print(f"[info] Seeded {seeded} rows. Skipped {skipped} rows (already exist).")


if __name__ == "__main__":
    main()
