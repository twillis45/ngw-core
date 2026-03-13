#!/usr/bin/env python3
"""Reference Image Ingestion CLI.

Add reference images to the NGW reference library with validated metadata.

Usage examples:

  # Ingest an image with its sidecar metadata file
  python scripts/ingest_reference.py --image photo.jpg --metadata photo.json

  # Ingest with inline metadata (JSON string)
  python scripts/ingest_reference.py --image photo.jpg --inline-metadata '{
    "reference_id": "karsh_rembrandt_002",
    "pattern_id": "rembrandt",
    "photographer": "Yousuf Karsh",
    "dataset_tier": "gold",
    "entry_trust_score": 1.0
  }'

  # Validate metadata only (no ingestion)
  python scripts/ingest_reference.py --validate metadata.json

  # Rebuild the central index from all sidecar files
  python scripts/ingest_reference.py --rebuild-index

  # Generate sidecar stubs for existing references.json entries
  python scripts/ingest_reference.py --generate-legacy-sidecars

  # Dry run (show what would happen without writing)
  python scripts/ingest_reference.py --generate-legacy-sidecars --dry-run

  # List all indexed references
  python scripts/ingest_reference.py --list
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Add project root to path
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_PROJECT_ROOT))

from engine.reference_ingestion import (
    REFERENCE_INDEX_PATH,
    generate_legacy_sidecars,
    get_index,
    ingest_reference,
    rebuild_index,
    validate_metadata,
)


def _print_table(rows: list[dict], columns: list[str], widths: list[int]) -> None:
    """Print a simple table."""
    header = "  ".join(col.ljust(w) for col, w in zip(columns, widths))
    print(header)
    print("-" * len(header))
    for row in rows:
        line = "  ".join(str(row.get(col, "")).ljust(w) for col, w in zip(columns, widths))
        print(line)


def cmd_ingest(args: argparse.Namespace) -> int:
    """Ingest an image with metadata."""
    image_path = Path(args.image)
    if not image_path.exists():
        print(f"ERROR: Image not found: {image_path}", file=sys.stderr)
        return 1

    # Load metadata
    if args.metadata:
        meta_path = Path(args.metadata)
        if not meta_path.exists():
            print(f"ERROR: Metadata file not found: {meta_path}", file=sys.stderr)
            return 1
        with open(meta_path, "r") as f:
            metadata = json.load(f)
    elif args.inline_metadata:
        try:
            metadata = json.loads(args.inline_metadata)
        except json.JSONDecodeError as exc:
            print(f"ERROR: Invalid JSON in --inline-metadata: {exc}", file=sys.stderr)
            return 1
    else:
        print("ERROR: Must provide --metadata or --inline-metadata", file=sys.stderr)
        return 1

    try:
        result = ingest_reference(
            image_path,
            metadata,
            overwrite=args.overwrite,
        )
        print(f"\n  Reference ingested successfully!")
        print(f"  Reference ID:   {result['reference_id']}")
        print(f"  Image:          {result['image_path']}")
        print(f"  Sidecar:        {result['sidecar_path']}")
        print(f"  Pattern folder: {result['pattern_folder']}")
        print(f"  Index entries:  {result['index_entry_count']}")

        if result.get("warnings"):
            print(f"\n  Warnings:")
            for w in result["warnings"]:
                print(f"    - {w}")

        print()
        return 0

    except (ValueError, FileNotFoundError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


def cmd_validate(args: argparse.Namespace) -> int:
    """Validate a metadata file."""
    meta_path = Path(args.validate)
    if not meta_path.exists():
        print(f"ERROR: File not found: {meta_path}", file=sys.stderr)
        return 1

    with open(meta_path, "r") as f:
        metadata = json.load(f)

    is_valid, errors = validate_metadata(metadata)

    if is_valid:
        print(f"  VALID: {meta_path}")
        print(f"  Reference ID: {metadata.get('reference_id')}")
        print(f"  Pattern:      {metadata.get('pattern_id')}")
        print(f"  Photographer: {metadata.get('photographer')}")
        print(f"  Tier:         {metadata.get('dataset_tier')}")
        return 0
    else:
        print(f"  INVALID: {meta_path}")
        for err in errors:
            print(f"    - {err}")
        return 1


def cmd_rebuild_index(args: argparse.Namespace) -> int:
    """Rebuild the central index."""
    index = rebuild_index()
    print(f"\n  Index rebuilt: {REFERENCE_INDEX_PATH}")
    print(f"  Total entries:   {index['total_entries']}")
    print(f"  Image-backed:    {index['image_backed_count']}")
    print(f"  Legacy:          {index['legacy_count']}")
    print()
    return 0


def cmd_generate_legacy_sidecars(args: argparse.Namespace) -> int:
    """Generate sidecar stubs for legacy entries."""
    results = generate_legacy_sidecars(dry_run=args.dry_run)

    if not results:
        print("  No legacy entries found.")
        return 0

    action = "Would create" if args.dry_run else "Status"
    _print_table(
        results,
        ["reference_id", "pattern_id", "status"],
        [35, 25, 20],
    )

    created = sum(1 for r in results if r["status"] in ("created", "would_create"))
    existing = sum(1 for r in results if r["status"] == "already_exists")
    skipped = sum(1 for r in results if r["status"] == "skipped_no_id")

    print(f"\n  {'Would create' if args.dry_run else 'Created'}: {created}")
    print(f"  Already exist: {existing}")
    print(f"  Skipped:       {skipped}")

    if not args.dry_run and created > 0:
        # Rebuild index after creating sidecars
        index = rebuild_index()
        print(f"\n  Index rebuilt: {index['total_entries']} total entries")

    print()
    return 0


def cmd_list(args: argparse.Namespace) -> int:
    """List all indexed references."""
    index = get_index()
    entries = index.get("entries", [])

    if not entries:
        print("  No reference entries found.")
        return 0

    rows = []
    for e in entries:
        rows.append({
            "reference_id": e.get("reference_id", ""),
            "pattern_id": e.get("pattern_id", e.get("lighting_pattern", "")),
            "photographer": e.get("photographer", "")[:20],
            "tier": e.get("dataset_tier", ""),
            "image": "yes" if e.get("has_image") else "no",
            "source": e.get("_source", ""),
        })

    _print_table(
        rows,
        ["reference_id", "pattern_id", "photographer", "tier", "image", "source"],
        [35, 25, 22, 12, 7, 10],
    )
    print(f"\n  Total: {len(entries)} entries ({index.get('image_backed_count', 0)} with images)")
    print()
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="NGW Reference Image Ingestion",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )

    # Ingest mode
    parser.add_argument("--image", type=str, help="Path to reference image file")
    parser.add_argument("--metadata", type=str, help="Path to metadata JSON file")
    parser.add_argument("--inline-metadata", type=str, help="Metadata as inline JSON string")
    parser.add_argument("--overwrite", action="store_true", help="Overwrite existing files")

    # Other modes
    parser.add_argument("--validate", type=str, help="Validate a metadata JSON file")
    parser.add_argument("--rebuild-index", action="store_true", help="Rebuild reference_index.json")
    parser.add_argument("--generate-legacy-sidecars", action="store_true",
                        help="Generate sidecar stubs for references.json entries")
    parser.add_argument("--list", action="store_true", help="List all indexed references")
    parser.add_argument("--dry-run", action="store_true", help="Show what would happen without writing")

    args = parser.parse_args()

    # Route to appropriate command
    if args.validate:
        return cmd_validate(args)
    elif args.rebuild_index:
        return cmd_rebuild_index(args)
    elif args.generate_legacy_sidecars:
        return cmd_generate_legacy_sidecars(args)
    elif args.list:
        return cmd_list(args)
    elif args.image:
        return cmd_ingest(args)
    else:
        parser.print_help()
        return 0


if __name__ == "__main__":
    sys.exit(main())
