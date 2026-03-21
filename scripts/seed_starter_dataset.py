#!/usr/bin/env python3
"""Seed the starter reference dataset from verified benchmark images.

Promotes benchmark images (which have human-verified ground truth) into
data/reference_dataset/ with proper metadata, creating the foundation for
the pattern-matching reference library.

Usage:
    python scripts/seed_starter_dataset.py                # seed all
    python scripts/seed_starter_dataset.py --dry-run      # preview only
    python scripts/seed_starter_dataset.py --force        # overwrite existing
    python scripts/seed_starter_dataset.py --filter split # seed only matching IDs
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

BENCHMARKS_DIR = PROJECT_ROOT / "benchmarks"
DATASET_DIR = PROJECT_ROOT / "data" / "reference_dataset"
VERSION_PATH = DATASET_DIR / "_version.json"
MANIFEST_PATH = DATASET_DIR / "_manifest.json"

# ═══════════════════════════════════════════════════════════════════════════
# KEY DIRECTION MAPPING — benchmark strings → numeric degrees
# ═══════════════════════════════════════════════════════════════════════════

_DIRECTION_TO_DEG: Dict[str, Optional[float]] = {
    "upper_left": 315.0,
    "upper_right": 45.0,
    "left": 270.0,
    "right": 90.0,
    "top_center": 0.0,
    "center": 0.0,
    "unknown": None,
}

# ═══════════════════════════════════════════════════════════════════════════
# ENVIRONMENT INFERENCE — map benchmark categories/patterns to environments
# ═══════════════════════════════════════════════════════════════════════════

_PATTERN_ENVIRONMENTS: Dict[str, str] = {
    "window_portrait": "window_light",
    "golden_hour": "natural",
    "overcast_natural": "natural",
}


def _infer_environment(pattern: str, category: str) -> str:
    """Infer environment from pattern and category."""
    if pattern in _PATTERN_ENVIRONMENTS:
        return _PATTERN_ENVIRONMENTS[pattern]
    if category in ("natural",):
        return "window_light"
    if category in ("edge_case",):
        return "mixed"
    return "studio"


# ═══════════════════════════════════════════════════════════════════════════
# TIER MAPPING — benchmark difficulty → dataset tier
# ═══════════════════════════════════════════════════════════════════════════

def _infer_tier(difficulty: str, category: str) -> str:
    """Map benchmark difficulty to dataset tier.

    Benchmark images are verified by human ground truth, so they start
    at 'gold' (standard difficulty) or 'community' (hard/edge case).
    """
    if difficulty == "hard" or category == "edge_case":
        return "community"
    return "gold"


def _infer_trust_score(difficulty: str, category: str) -> float:
    """Assign trust score based on verification quality.

    All benchmark images have human-verified ground truth, so they
    score higher than unverified references.
    """
    if difficulty == "hard" or category == "edge_case":
        return 0.7
    return 0.9


# ═══════════════════════════════════════════════════════════════════════════
# BUILD METADATA FROM BENCHMARK
# ═══════════════════════════════════════════════════════════════════════════

def build_metadata(benchmark: Dict[str, Any]) -> Dict[str, Any]:
    """Convert a benchmark JSON into reference_dataset metadata."""
    gt = benchmark["ground_truth"]
    meta = benchmark["metadata"]

    pattern = gt["expected_pattern"]
    category = meta.get("category", "")
    difficulty = meta.get("difficulty", "standard")
    key_dir = gt.get("expected_key_direction", "unknown")

    return {
        "reference_id": benchmark["benchmark_id"],
        "pattern_id": pattern,
        "photographer": "benchmark_verified",
        "dataset_tier": _infer_tier(difficulty, category),
        "entry_trust_score": _infer_trust_score(difficulty, category),
        "approval_status": "approved",
        "environment": _infer_environment(pattern, category),
        "source_type": "found_online",
        "light_count": gt.get("expected_light_count"),
        "key_direction_deg": _DIRECTION_TO_DEG.get(key_dir),
        "shadow_pattern": pattern,
        "notes": benchmark.get("description", ""),
        # Ground truth preservation
        "ground_truth": {
            "expected_pattern": pattern,
            "acceptable_patterns": gt.get("acceptable_patterns", [pattern]),
            "expected_light_count": gt.get("expected_light_count"),
            "acceptable_light_count_range": gt.get("acceptable_light_count_range"),
            "expected_key_direction": key_dir,
        },
        "benchmark_metadata": {
            "category": category,
            "difficulty": difficulty,
            "known_challenges": meta.get("known_challenges", []),
            "added_date": meta.get("added_date"),
            "promoted_to_dataset": datetime.now(timezone.utc).isoformat(),
        },
    }


# ═══════════════════════════════════════════════════════════════════════════
# SEED ONE ENTRY
# ═══════════════════════════════════════════════════════════════════════════

def seed_entry(
    benchmark_path: Path,
    *,
    dry_run: bool = False,
    force: bool = False,
) -> Dict[str, Any]:
    """Seed a single benchmark into reference_dataset/.

    Returns a result dict with status and paths.
    """
    with open(benchmark_path) as f:
        benchmark = json.load(f)

    bid = benchmark["benchmark_id"]
    pattern = benchmark["ground_truth"]["expected_pattern"]
    image_rel = benchmark.get("image_path", "")
    image_src = PROJECT_ROOT / image_rel

    if not image_src.exists():
        return {"id": bid, "status": "skip", "reason": f"image not found: {image_src}"}

    # Target paths
    entry_dir = DATASET_DIR / pattern / bid
    target_image = entry_dir / "image.jpg"
    target_metadata = entry_dir / "metadata.json"

    if target_metadata.exists() and not force:
        return {"id": bid, "status": "exists", "path": str(entry_dir)}

    metadata = build_metadata(benchmark)

    # Get image dimensions
    try:
        from PIL import Image
        with Image.open(image_src) as img:
            w, h = img.size
        metadata["image_dimensions"] = {"width": w, "height": h}
    except Exception:
        pass

    metadata["ingested_at"] = datetime.now(timezone.utc).isoformat()
    metadata["has_signals"] = False
    metadata["has_vlm_reconstruction"] = False
    metadata["has_debug_overlay"] = False

    if dry_run:
        return {
            "id": bid,
            "status": "would_create",
            "pattern": pattern,
            "path": str(entry_dir),
            "metadata": metadata,
        }

    # Create entry directory and copy files
    entry_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(str(image_src), str(target_image))

    with open(target_metadata, "w") as f:
        json.dump(metadata, f, indent=2)

    # Create thumbnail
    try:
        from PIL import Image
        with Image.open(target_image) as img:
            img.thumbnail((200, 200))
            img.save(entry_dir / "thumbnail.jpg", "JPEG", quality=80)
    except Exception:
        pass

    return {
        "id": bid,
        "status": "created",
        "pattern": pattern,
        "path": str(entry_dir),
    }


# ═══════════════════════════════════════════════════════════════════════════
# BUILD MANIFEST
# ═══════════════════════════════════════════════════════════════════════════

def build_manifest() -> Dict[str, Any]:
    """Scan reference_dataset/ and build a coverage manifest."""
    entries = []
    pattern_coverage: Dict[str, List[str]] = {}

    if not DATASET_DIR.exists():
        return {"entries": [], "pattern_coverage": {}, "total": 0}

    for pattern_dir in sorted(DATASET_DIR.iterdir()):
        if not pattern_dir.is_dir() or pattern_dir.name.startswith("_"):
            continue

        pattern = pattern_dir.name
        if pattern not in pattern_coverage:
            pattern_coverage[pattern] = []

        for entry_dir in sorted(pattern_dir.iterdir()):
            if not entry_dir.is_dir():
                continue

            meta_path = entry_dir / "metadata.json"
            has_image = (entry_dir / "image.jpg").exists()
            has_signals = (entry_dir / "signals.json").exists()
            has_vlm = (entry_dir / "vlm_reconstruction.json").exists()

            entry_info = {
                "reference_id": entry_dir.name,
                "pattern": pattern,
                "has_image": has_image,
                "has_metadata": meta_path.exists(),
                "has_signals": has_signals,
                "has_vlm_reconstruction": has_vlm,
            }

            if meta_path.exists():
                try:
                    with open(meta_path) as f:
                        meta = json.load(f)
                    entry_info["dataset_tier"] = meta.get("dataset_tier", "unknown")
                    entry_info["trust_score"] = meta.get("entry_trust_score", 0)
                    entry_info["approval_status"] = meta.get("approval_status", "unknown")
                except Exception:
                    pass

            entries.append(entry_info)
            pattern_coverage[pattern].append(entry_dir.name)

    # Coverage gaps — patterns from canonical YAMLs not in dataset
    canonical_dir = PROJECT_ROOT / "data" / "systems" / "canonical"
    all_canonical = set()
    if canonical_dir.exists():
        all_canonical = {p.stem for p in canonical_dir.glob("*.yml")}

    # Also include core enum patterns
    core_patterns = {
        "clamshell", "loop", "rembrandt", "split", "butterfly", "triangle",
        "broad", "short", "rim_only", "high_key", "low_key", "flat_fashion",
        "window_portrait", "golden_hour", "overcast_natural", "ring_light",
        "gobo", "unknown",
    }
    all_target = all_canonical | core_patterns
    covered = set(pattern_coverage.keys())

    # A canonical YAML is also covered if a benchmark entry for it exists
    # under its parent geometry pattern (e.g. beauty_dish_clean → butterfly/).
    # Scan benchmark JSONs to find these mappings.
    benchmark_dir = PROJECT_ROOT / "benchmarks"
    for bj in benchmark_dir.glob("*.json"):
        try:
            with open(bj) as f:
                bdata = json.load(f)
            bid = bdata.get("benchmark_id", "")
            parent = bdata.get("ground_truth", {}).get("expected_pattern", "")
            # If the benchmark ID is a canonical target and its parent pattern
            # has entries in the dataset, count the canonical ID as covered.
            if bid in all_target and parent in covered:
                covered.add(bid)
            # Also cover the benchmark ID itself if it has a dataset entry
            if bid in all_target and parent == bid:
                pass  # already handled by directory scan
        except Exception:
            pass

    missing = sorted(all_target - covered)

    manifest = {
        "_generated_at": datetime.now(timezone.utc).isoformat(),
        "_description": "Auto-generated dataset coverage manifest",
        "total_entries": len(entries),
        "total_patterns_covered": len(covered),
        "total_patterns_target": len(all_target),
        "coverage_pct": round(len(covered) / max(len(all_target), 1) * 100, 1),
        "pattern_coverage": {k: len(v) for k, v in sorted(pattern_coverage.items())},
        "missing_patterns": missing,
        "entries": entries,
    }

    return manifest


# ═══════════════════════════════════════════════════════════════════════════
# UPDATE VERSION
# ═══════════════════════════════════════════════════════════════════════════

def update_version(entry_count: int) -> None:
    """Update _version.json with new entry count."""
    version = {
        "schema_version": "1.0.0",
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "entry_count": entry_count,
    }
    if VERSION_PATH.exists():
        try:
            with open(VERSION_PATH) as f:
                existing = json.load(f)
            version["created_at"] = existing.get("created_at", version["updated_at"])
        except Exception:
            version["created_at"] = version["updated_at"]
    else:
        version["created_at"] = version["updated_at"]

    DATASET_DIR.mkdir(parents=True, exist_ok=True)
    with open(VERSION_PATH, "w") as f:
        json.dump(version, f, indent=2)


# ═══════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════

def main() -> int:
    parser = argparse.ArgumentParser(description="Seed starter dataset from benchmarks")
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing")
    parser.add_argument("--force", action="store_true", help="Overwrite existing entries")
    parser.add_argument("--filter", type=str, default="", help="Only seed matching benchmark IDs")
    args = parser.parse_args()

    # Find all benchmark JSONs
    benchmark_files = sorted(BENCHMARKS_DIR.glob("*.json"))
    if not benchmark_files:
        print("No benchmark files found in", BENCHMARKS_DIR)
        return 1

    print(f"{'[DRY RUN] ' if args.dry_run else ''}Seeding starter dataset from {len(benchmark_files)} benchmarks\n")

    results = []
    for bf in benchmark_files:
        bid = bf.stem
        if args.filter and args.filter.lower() not in bid.lower():
            continue

        result = seed_entry(bf, dry_run=args.dry_run, force=args.force)
        results.append(result)

        status = result["status"]
        icon = {"created": "✅", "exists": "⏭️ ", "skip": "⚠️ ", "would_create": "🔍"}
        print(f"  {icon.get(status, '  ')} {result['id']:30s} → {status}")
        if status == "skip":
            print(f"     {result.get('reason', '')}")

    # Summary
    created = sum(1 for r in results if r["status"] == "created")
    existed = sum(1 for r in results if r["status"] == "exists")
    skipped = sum(1 for r in results if r["status"] == "skip")
    previewed = sum(1 for r in results if r["status"] == "would_create")

    print(f"\n{'─' * 50}")
    if args.dry_run:
        print(f"Would create: {previewed}  |  Already exist: {existed}  |  Skipped: {skipped}")
    else:
        print(f"Created: {created}  |  Already exist: {existed}  |  Skipped: {skipped}")

    # Build and write manifest
    if not args.dry_run:
        manifest = build_manifest()
        with open(MANIFEST_PATH, "w") as f:
            json.dump(manifest, f, indent=2)

        # Update version
        update_version(manifest["total_entries"])

        print(f"\nDataset coverage: {manifest['coverage_pct']}% "
              f"({manifest['total_patterns_covered']}/{manifest['total_patterns_target']} patterns)")
        if manifest["missing_patterns"]:
            print(f"Missing patterns: {', '.join(manifest['missing_patterns'])}")
        print(f"\nManifest: {MANIFEST_PATH}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
