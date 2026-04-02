#!/usr/bin/env python3
"""Verify reference dataset integrity and coverage.

Checks every entry in data/reference_dataset/ for:
  1. Required files (image.jpg, metadata.json)
  2. Metadata schema validity
  3. Image readability
  4. Ground truth consistency
  5. Overall pattern coverage

Usage:
    python scripts/verify_dataset.py              # full verification
    python scripts/verify_dataset.py --quick      # metadata only (no image loads)
    python scripts/verify_dataset.py --fix        # auto-fix minor issues
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Tuple

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

DATASET_DIR = PROJECT_ROOT / "data" / "reference_dataset"

# ═══════════════════════════════════════════════════════════════════════════
# CANONICAL PATTERNS (from engine/enums.py LightingPattern)
# ═══════════════════════════════════════════════════════════════════════════

CANONICAL_PATTERNS = {
    "clamshell", "loop", "rembrandt", "split", "butterfly", "triangle",
    "broad", "short", "rim_only", "high_key", "low_key", "flat_fashion",
    "window_portrait", "golden_hour", "overcast_natural", "ring_light",
    "bare_bulb_editorial", "strip_dramatic", "short_fashion_key",
    "soft_editorial_key", "editorial_rim_key", "tabletop_soft_product",
    "bottle_backlight", "athletic_rim_sculpt", "window_negative_fill",
    "hybrid", "unknown", "gobo", "flat",
}

REQUIRED_META_FIELDS = {"reference_id", "pattern_id", "dataset_tier", "entry_trust_score"}
VALID_TIERS = {"gold", "community", "synthetic"}
VALID_APPROVAL = {"draft", "approved", "rejected"}


# ═══════════════════════════════════════════════════════════════════════════
# VERIFY SINGLE ENTRY
# ═══════════════════════════════════════════════════════════════════════════

def verify_entry(
    entry_dir: Path,
    *,
    quick: bool = False,
) -> Tuple[str, List[str], List[str]]:
    """Verify a single dataset entry.

    Returns: (status, errors, warnings)
    """
    errors: List[str] = []
    warnings: List[str] = []

    # Required files
    image_path = entry_dir / "image.jpg"
    meta_path = entry_dir / "metadata.json"

    if not meta_path.exists():
        errors.append("missing metadata.json")
    if not image_path.exists():
        errors.append("missing image.jpg")

    # Metadata validation
    metadata: Dict[str, Any] = {}
    if meta_path.exists():
        try:
            with open(meta_path) as f:
                metadata = json.load(f)
        except json.JSONDecodeError as e:
            errors.append(f"invalid JSON in metadata.json: {e}")
            return ("FAIL", errors, warnings)

        # Required fields
        for field in REQUIRED_META_FIELDS:
            if field not in metadata:
                errors.append(f"missing required field: {field}")

        # Pattern validity
        pattern = metadata.get("pattern_id", "")
        if pattern and pattern not in CANONICAL_PATTERNS:
            warnings.append(f"pattern_id '{pattern}' not in canonical set")

        # Folder-pattern consistency
        expected_pattern = entry_dir.parent.name
        if pattern and pattern != expected_pattern:
            errors.append(f"pattern_id '{pattern}' != folder name '{expected_pattern}'")

        # Tier validity
        tier = metadata.get("dataset_tier", "")
        if tier and tier not in VALID_TIERS:
            errors.append(f"invalid dataset_tier: '{tier}'")

        # Trust score range
        trust = metadata.get("entry_trust_score")
        if trust is not None:
            if not isinstance(trust, (int, float)) or not (0.0 <= trust <= 1.0):
                errors.append(f"trust_score out of range: {trust}")

        # Reference ID matches directory name
        ref_id = metadata.get("reference_id", "")
        if ref_id and ref_id != entry_dir.name:
            warnings.append(f"reference_id '{ref_id}' != directory name '{entry_dir.name}'")

        # Ground truth presence (for benchmark-sourced entries)
        if "ground_truth" in metadata:
            gt = metadata["ground_truth"]
            if "expected_pattern" not in gt:
                warnings.append("ground_truth missing expected_pattern")
            if "acceptable_patterns" not in gt:
                warnings.append("ground_truth missing acceptable_patterns")

    # Image validation (unless --quick)
    if not quick and image_path.exists():
        try:
            from PIL import Image
            with Image.open(image_path) as img:
                w, h = img.size
                if w < 100 or h < 100:
                    warnings.append(f"very small image: {w}x{h}")
                if w > 6000 or h > 6000:
                    warnings.append(f"very large image: {w}x{h}")

                # Check dimensions match metadata
                dims = metadata.get("image_dimensions", {})
                if dims:
                    if dims.get("width") != w or dims.get("height") != h:
                        warnings.append(
                            f"dimension mismatch: metadata says "
                            f"{dims.get('width')}x{dims.get('height')}, "
                            f"image is {w}x{h}"
                        )
        except Exception as e:
            errors.append(f"image unreadable: {e}")

    # Determine status
    if errors:
        return ("FAIL", errors, warnings)
    elif warnings:
        return ("WARN", errors, warnings)
    return ("PASS", errors, warnings)


# ═══════════════════════════════════════════════════════════════════════════
# VERIFY ALL ENTRIES
# ═══════════════════════════════════════════════════════════════════════════

def verify_all(*, quick: bool = False) -> Dict[str, Any]:
    """Verify all entries in reference_dataset/."""
    results = []
    pattern_counts: Dict[str, int] = {}

    if not DATASET_DIR.exists():
        return {
            "status": "FAIL",
            "message": f"Dataset directory not found: {DATASET_DIR}",
            "results": [],
        }

    for pattern_dir in sorted(DATASET_DIR.iterdir()):
        if not pattern_dir.is_dir() or pattern_dir.name.startswith("_"):
            continue

        pattern = pattern_dir.name
        pattern_counts.setdefault(pattern, 0)

        for entry_dir in sorted(pattern_dir.iterdir()):
            if not entry_dir.is_dir():
                continue

            status, errors, warnings = verify_entry(entry_dir, quick=quick)
            pattern_counts[pattern] += 1

            results.append({
                "entry": f"{pattern}/{entry_dir.name}",
                "status": status,
                "errors": errors,
                "warnings": warnings,
            })

    total = len(results)
    passed = sum(1 for r in results if r["status"] == "PASS")
    warned = sum(1 for r in results if r["status"] == "WARN")
    failed = sum(1 for r in results if r["status"] == "FAIL")

    # Coverage analysis
    covered = set(pattern_counts.keys())
    high_priority = {
        "rembrandt", "loop", "split", "butterfly", "clamshell",
        "broad", "short", "window_portrait", "flat_fashion",
        "high_key", "low_key", "ring_light", "gobo", "triangle",
    }
    missing_hp = sorted(high_priority - covered)

    overall = "PASS" if failed == 0 else "FAIL"

    return {
        "status": overall,
        "total": total,
        "passed": passed,
        "warned": warned,
        "failed": failed,
        "patterns_covered": len(covered),
        "missing_high_priority": missing_hp,
        "pattern_counts": dict(sorted(pattern_counts.items())),
        "results": results,
    }


# ═══════════════════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════════════════

def main() -> int:
    parser = argparse.ArgumentParser(description="Verify reference dataset integrity")
    parser.add_argument("--quick", action="store_true", help="Skip image validation")
    args = parser.parse_args()

    print("Verifying reference dataset...\n")

    report = verify_all(quick=args.quick)

    if report.get("message"):
        print(f"  ❌ {report['message']}")
        return 1

    # Per-entry results
    for r in report["results"]:
        icon = {"PASS": "✅", "WARN": "⚠️ ", "FAIL": "❌"}.get(r["status"], "  ")
        print(f"  {icon} {r['entry']}")
        for e in r["errors"]:
            print(f"       ERROR: {e}")
        for w in r["warnings"]:
            print(f"       WARN:  {w}")

    # Summary
    print(f"\n{'─' * 50}")
    print(f"Total: {report['total']}  |  "
          f"Pass: {report['passed']}  |  "
          f"Warn: {report['warned']}  |  "
          f"Fail: {report['failed']}")
    print(f"Patterns covered: {report['patterns_covered']}")

    if report["pattern_counts"]:
        print(f"\nPer-pattern counts:")
        for pat, count in report["pattern_counts"].items():
            print(f"  {pat:25s} {count}")

    if report["missing_high_priority"]:
        print(f"\n⚠️  Missing high-priority patterns:")
        for p in report["missing_high_priority"]:
            print(f"  • {p}")

    print(f"\nOverall: {report['status']}")
    return 0 if report["status"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
