"""
Backfill benchmark_cases.subject_skin_tone_bucket by running the VLM
apparent_skin_tones query once per case image.

Bucketing rule (matches CLAUDE.md / docs/TAXONOMY_TRUTH.md ranges):
    light  ← very fair, fair, light-medium    (Fitzpatrick I–II)
    medium ← medium, medium-dark              (Fitzpatrick III–IV)
    dark   ← dark, very dark                  (Fitzpatrick V–VI)

When the image shows subjects with visibly different tones
(skin_tone_mixed=True) we record the DARKEST bucket present — dark-skin
misclassification is the failure mode we're guarding against, so the
stratified score should include mixed shots in the darker stratum.

Safety / idempotence:
- Only rewrites rows where subject_skin_tone_bucket IS NULL.
- Set FORCE=1 in the environment to re-bucket every row.
- Logs every decision to stdout so the one-time batch cost is auditable.

Usage:
    python3 scripts/backfill_skin_tone_buckets.py [--limit N] [--dry-run]
"""
from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path
from typing import List, Optional

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO))

from db.benchmark import init_benchmark_tables  # noqa: E402
from db.database import get_db  # noqa: E402
from engine.vlm import describe_reference_image, vlm_available  # noqa: E402


# ── Fitzpatrick-adjacent label → bucket ─────────────────────────────────
_LIGHT  = {"very fair", "fair", "light-medium"}
_MEDIUM = {"medium", "medium-dark"}
_DARK   = {"dark", "very dark"}

# Rank used when skin_tone_mixed=True so we can pick the darkest label.
_RANK = {"light": 0, "medium": 1, "dark": 2}


def _label_to_bucket(label: str) -> Optional[str]:
    lo = (label or "").strip().lower()
    if lo in _LIGHT:
        return "light"
    if lo in _MEDIUM:
        return "medium"
    if lo in _DARK:
        return "dark"
    return None


def _pick_bucket(labels: List[str]) -> Optional[str]:
    """Map a list of VLM apparent_skin_tones labels → single bucket.

    When multiple labels are present (skin_tone_mixed=True), we take the
    DARKEST bucket present — our regression gate cares about worst-case
    behavior on dark skin, not average.
    """
    buckets = {b for b in (_label_to_bucket(l) for l in labels) if b}
    if not buckets:
        return None
    return max(buckets, key=lambda b: _RANK[b])


def _iter_cases(limit: Optional[int], force: bool):
    init_benchmark_tables()
    with get_db() as conn:
        where = "" if force else "WHERE subject_skin_tone_bucket IS NULL"
        sql = f"SELECT id, image_path, pattern_id, subject_skin_tone_bucket FROM benchmark_cases {where} ORDER BY created_at ASC"
        if limit:
            sql += f" LIMIT {int(limit)}"
        rows = conn.execute(sql).fetchall()
    return [dict(r) for r in rows]


def _resolve_image_path(raw: str) -> Optional[Path]:
    """benchmark_cases.image_path may be absolute, repo-relative, or a URL.
    We only bucket on-disk images."""
    if not raw:
        return None
    p = Path(raw)
    if p.is_absolute() and p.exists():
        return p
    rel = REPO / raw
    if rel.exists():
        return rel
    return None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--limit", type=int, default=None, help="Only process first N cases")
    ap.add_argument("--dry-run", action="store_true", help="Print decisions but don't write DB")
    args = ap.parse_args()

    force = os.environ.get("FORCE", "").strip() == "1"

    if not vlm_available():
        print("ERROR: VLM not available (set OPENAI_API_KEY or ANTHROPIC_API_KEY).", file=sys.stderr)
        return 2

    cases = _iter_cases(args.limit, force)
    if not cases:
        print("No cases need backfill.")
        return 0

    print(f"Backfilling {len(cases)} case(s){' [DRY RUN]' if args.dry_run else ''}")
    print("=" * 80)

    ok = 0
    skipped = 0
    errors = 0
    t0 = time.time()

    for i, case in enumerate(cases, 1):
        cid = case["id"]
        pid = case["pattern_id"]
        raw_path = case["image_path"]
        img = _resolve_image_path(raw_path)
        if not img:
            print(f"[{i}/{len(cases)}] SKIP  {cid[:8]}… {pid:<18s} image_not_found: {raw_path}")
            skipped += 1
            continue

        try:
            desc = describe_reference_image(str(img))
        except Exception as exc:
            print(f"[{i}/{len(cases)}] ERROR {cid[:8]}… {pid:<18s} vlm_exception: {exc}")
            errors += 1
            continue

        if desc is None or not desc.ok:
            print(f"[{i}/{len(cases)}] ERROR {cid[:8]}… {pid:<18s} vlm_failed")
            errors += 1
            continue

        labels = list(desc.apparent_skin_tones or [])
        bucket = _pick_bucket(labels)
        if not bucket:
            print(f"[{i}/{len(cases)}] SKIP  {cid[:8]}… {pid:<18s} no_skin_label: {labels}")
            skipped += 1
            continue

        mixed = "[MIXED]" if getattr(desc, "skin_tone_mixed", False) else ""
        print(f"[{i}/{len(cases)}] OK    {cid[:8]}… {pid:<18s} {bucket:<6s} ← {labels} {mixed}")
        ok += 1

        if not args.dry_run:
            with get_db() as conn:
                conn.execute(
                    "UPDATE benchmark_cases SET subject_skin_tone_bucket = ?, updated_at = ? WHERE id = ?",
                    (bucket, time.time(), cid),
                )

    dt = time.time() - t0
    print("=" * 80)
    print(f"Done in {dt:.1f}s — bucketed={ok} skipped={skipped} errors={errors}")
    return 0 if errors == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
