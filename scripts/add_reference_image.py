#!/usr/bin/env python3
"""Reference Dataset CLI — add images with full pipeline processing.

Ingests reference images into the NGW reference dataset, running the full
extended vision pipeline and VLM reconstruction on each image.

Usage examples:

  # Single image import
  python scripts/add_reference_image.py \\
    --image path/to/photo.jpg \\
    --pattern-id rembrandt \\
    --photographer "Yousuf Karsh" \\
    --tier gold \\
    --notes "Classic 45/45 Rembrandt setup"

  # Import with metadata JSON file
  python scripts/add_reference_image.py \\
    --image path/to/photo.jpg \\
    --metadata metadata.json

  # Import with inline metadata
  python scripts/add_reference_image.py \\
    --image path/to/photo.jpg \\
    --inline-metadata '{
      "reference_id": "karsh_rembrandt_001",
      "pattern_id": "rembrandt",
      "photographer": "Yousuf Karsh",
      "dataset_tier": "gold"
    }'

  # Batch import from folder (expects metadata.json per image)
  python scripts/add_reference_image.py --batch-dir path/to/images/

  # Reprocess all entries (re-run pipeline + VLM)
  python scripts/add_reference_image.py --reprocess-all

  # List entries
  python scripts/add_reference_image.py --list
  python scripts/add_reference_image.py --list --pattern rembrandt --status approved

  # Export manifest
  python scripts/add_reference_image.py --manifest

  # Skip pipeline (metadata only, fast)
  python scripts/add_reference_image.py --image photo.jpg --pattern-id loop \\
    --photographer "Test" --no-pipeline
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

# Add project root to path
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_PROJECT_ROOT))


def cmd_ingest(args: argparse.Namespace) -> None:
    """Ingest a single image with metadata."""
    from engine.reference_dataset import ingest_reference_image

    image_path = Path(args.image)
    if not image_path.exists():
        print(f"Error: Image not found: {image_path}", file=sys.stderr)
        sys.exit(1)

    # Build metadata from args or file
    if args.metadata:
        with open(args.metadata, "r") as f:
            metadata = json.load(f)
    elif args.inline_metadata:
        metadata = json.loads(args.inline_metadata)
    else:
        # Build from CLI flags
        ref_id = args.reference_id
        if not ref_id:
            # Auto-generate from filename
            ref_id = image_path.stem.replace(" ", "_").replace("-", "_").lower()

        metadata = {
            "reference_id": ref_id,
            "pattern_id": args.pattern_id,
            "photographer": args.photographer or "",
            "dataset_tier": args.tier,
        }
        if args.environment:
            metadata["environment"] = args.environment
        if args.notes:
            metadata["notes"] = args.notes
        if args.trust_score is not None:
            metadata["entry_trust_score"] = args.trust_score

    run_pipeline = not args.no_pipeline
    run_vlm = not args.no_vlm and run_pipeline

    print(f"Ingesting: {image_path}")
    print(f"  Pattern:  {metadata.get('pattern_id')}")
    print(f"  Ref ID:   {metadata.get('reference_id')}")
    print(f"  Pipeline: {'yes' if run_pipeline else 'skip'}")
    print(f"  VLM:      {'yes' if run_vlm else 'skip'}")

    try:
        result = ingest_reference_image(
            image_path,
            metadata,
            run_pipeline=run_pipeline,
            run_vlm=run_vlm,
            overwrite=args.overwrite,
        )

        if result.get("ok"):
            print(f"\n  OK: {result['entry_path']}")
            print(f"  Pipeline: {'passed' if result.get('pipeline_ok') else 'failed/skipped'}")
            print(f"  VLM:      {'passed' if result.get('vlm_ok') else 'failed/skipped'}")
            if result.get("warnings"):
                for w in result["warnings"]:
                    print(f"  Warning: {w}")
        else:
            print(f"\n  FAILED: {result}")
            sys.exit(1)

    except (ValueError, FileExistsError, FileNotFoundError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)


def cmd_batch(args: argparse.Namespace) -> None:
    """Batch import from a directory."""
    from engine.reference_dataset import ingest_reference_image

    batch_dir = Path(args.batch_dir)
    if not batch_dir.is_dir():
        print(f"Error: Not a directory: {batch_dir}", file=sys.stderr)
        sys.exit(1)

    # Find all images
    image_exts = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".webp"}
    images = sorted(f for f in batch_dir.iterdir() if f.suffix.lower() in image_exts)

    if not images:
        print(f"No images found in {batch_dir}")
        return

    # Load batch metadata if provided
    batch_meta = {}
    if args.metadata_file:
        with open(args.metadata_file, "r") as f:
            raw = json.load(f)
        # Can be a dict keyed by filename or a list
        if isinstance(raw, list):
            batch_meta = {m.get("reference_id", m.get("filename", "")): m for m in raw}
        elif isinstance(raw, dict):
            batch_meta = raw

    run_pipeline = not args.no_pipeline
    run_vlm = not args.no_vlm and run_pipeline
    success = 0
    errors = 0

    for img in images:
        # Find metadata for this image
        meta = batch_meta.get(img.stem, batch_meta.get(img.name, {}))
        if not meta.get("reference_id"):
            meta["reference_id"] = img.stem.replace(" ", "_").lower()
        if not meta.get("pattern_id"):
            meta["pattern_id"] = args.pattern_id or "unknown"
        if not meta.get("photographer"):
            meta["photographer"] = args.photographer or "Unknown"
        if not meta.get("dataset_tier"):
            meta["dataset_tier"] = args.tier

        print(f"\n[{success + errors + 1}/{len(images)}] {img.name} -> {meta['pattern_id']}/{meta['reference_id']}")

        try:
            result = ingest_reference_image(
                img, meta,
                run_pipeline=run_pipeline,
                run_vlm=run_vlm,
                overwrite=args.overwrite,
            )
            if result.get("ok"):
                print(f"  OK: pipeline={'ok' if result.get('pipeline_ok') else 'skip'} vlm={'ok' if result.get('vlm_ok') else 'skip'}")
                success += 1
            else:
                print(f"  FAILED")
                errors += 1
        except Exception as exc:
            print(f"  ERROR: {exc}")
            errors += 1

    print(f"\nBatch complete: {success} success, {errors} errors out of {len(images)} images")


def cmd_reprocess(args: argparse.Namespace) -> None:
    """Reprocess all entries."""
    from engine.reference_dataset import list_entries, reprocess_entry

    entries = list_entries(
        pattern_id=args.pattern if hasattr(args, 'pattern') and args.pattern else None,
    )

    if not entries:
        print("No entries to reprocess.")
        return

    print(f"Reprocessing {len(entries)} entries...")
    success = 0
    errors = 0

    for i, entry in enumerate(entries, 1):
        pid = entry["pattern_id"]
        rid = entry["reference_id"]
        print(f"\n[{i}/{len(entries)}] {pid}/{rid}")

        try:
            result = reprocess_entry(pid, rid)
            if result.get("ok"):
                print(f"  OK: pipeline={'ok' if result.get('pipeline_ok') else 'fail'} vlm={'ok' if result.get('vlm_ok') else 'fail'}")
                success += 1
            else:
                print("  FAILED")
                errors += 1
        except Exception as exc:
            print(f"  ERROR: {exc}")
            errors += 1

    print(f"\nReprocess complete: {success} success, {errors} errors")


def cmd_list(args: argparse.Namespace) -> None:
    """List entries."""
    from engine.reference_dataset import list_entries

    entries = list_entries(
        pattern_id=args.pattern,
        status=args.status,
        tier=args.tier_filter,
    )

    if not entries:
        print("No entries found.")
        return

    print(f"{'Reference ID':<30} {'Pattern':<20} {'Status':<10} {'Tier':<12} {'Signals':<8} {'VLM':<5}")
    print("-" * 90)

    for e in entries:
        meta = e.get("metadata", {})
        print(
            f"{e['reference_id']:<30} "
            f"{e['pattern_id']:<20} "
            f"{meta.get('approval_status', 'draft'):<10} "
            f"{meta.get('dataset_tier', ''):<12} "
            f"{'Y' if e.get('has_signals') else 'N':<8} "
            f"{'Y' if e.get('has_vlm_reconstruction') else 'N':<5}"
        )

    print(f"\nTotal: {len(entries)} entries")


def cmd_manifest(args: argparse.Namespace) -> None:
    """Export dataset manifest."""
    from engine.reference_dataset import export_dataset_manifest

    manifest = export_dataset_manifest()
    print(json.dumps(manifest, indent=2, default=str))


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Reference Dataset CLI — add images with full pipeline processing",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = parser.add_subparsers(dest="command")

    # ── ingest (default when --image is used) ──
    p_ingest = sub.add_parser("ingest", help="Ingest a single reference image")
    p_ingest.add_argument("--image", required=True, help="Path to image file")
    p_ingest.add_argument("--metadata", help="Path to metadata JSON file")
    p_ingest.add_argument("--inline-metadata", help="Inline metadata JSON string")
    p_ingest.add_argument("--reference-id", help="Reference ID (auto-generated from filename if omitted)")
    p_ingest.add_argument("--pattern-id", help="Pattern ID (e.g., rembrandt, butterfly)")
    p_ingest.add_argument("--photographer", help="Photographer name")
    p_ingest.add_argument("--tier", default="community", choices=["gold", "community", "synthetic"])
    p_ingest.add_argument("--environment", help="Environment (studio, natural, window_light, outdoor, mixed)")
    p_ingest.add_argument("--notes", help="Optional notes")
    p_ingest.add_argument("--trust-score", type=float, help="Trust score (0.0-1.0)")
    p_ingest.add_argument("--overwrite", action="store_true", help="Overwrite existing entry")
    p_ingest.add_argument("--no-pipeline", action="store_true", help="Skip vision pipeline")
    p_ingest.add_argument("--no-vlm", action="store_true", help="Skip VLM reconstruction")

    # ── batch ──
    p_batch = sub.add_parser("batch", help="Batch import from directory")
    p_batch.add_argument("--batch-dir", required=True, help="Directory with images")
    p_batch.add_argument("--metadata-file", help="Batch metadata JSON file")
    p_batch.add_argument("--pattern-id", help="Default pattern ID for all images")
    p_batch.add_argument("--photographer", help="Default photographer")
    p_batch.add_argument("--tier", default="community", choices=["gold", "community", "synthetic"])
    p_batch.add_argument("--overwrite", action="store_true")
    p_batch.add_argument("--no-pipeline", action="store_true")
    p_batch.add_argument("--no-vlm", action="store_true")

    # ── reprocess ──
    p_reprocess = sub.add_parser("reprocess", help="Re-run pipeline on existing entries")
    p_reprocess.add_argument("--pattern", help="Only reprocess entries for this pattern")

    # ── list ──
    p_list = sub.add_parser("list", help="List dataset entries")
    p_list.add_argument("--pattern", default=None, help="Filter by pattern")
    p_list.add_argument("--status", default=None, help="Filter by approval status")
    p_list.add_argument("--tier-filter", default=None, dest="tier_filter", help="Filter by tier")

    # ── manifest ──
    sub.add_parser("manifest", help="Export dataset manifest as JSON")

    # ── Quick shortcuts (no subcommand needed) ──
    parser.add_argument("--image", help="Quick ingest: path to image")
    parser.add_argument("--pattern-id", help="Quick ingest: pattern ID")
    parser.add_argument("--photographer", help="Quick ingest: photographer")
    parser.add_argument("--tier", default="community")
    parser.add_argument("--notes", help="Quick ingest: notes")
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--list", action="store_true", help="List entries")
    parser.add_argument("--manifest", action="store_true", help="Export manifest")
    parser.add_argument("--reprocess-all", action="store_true", help="Reprocess all entries")

    args = parser.parse_args()

    # Handle quick shortcuts
    if args.list and not args.command:
        args.pattern = None
        args.status = None
        args.tier_filter = None
        cmd_list(args)
    elif args.manifest and not args.command:
        cmd_manifest(args)
    elif args.reprocess_all and not args.command:
        cmd_reprocess(args)
    elif args.image and not args.command:
        # Quick ingest mode
        args.metadata = None
        args.inline_metadata = None
        args.reference_id = None
        args.environment = None
        args.trust_score = None
        args.no_pipeline = False
        args.no_vlm = False
        cmd_ingest(args)
    elif args.command == "ingest":
        cmd_ingest(args)
    elif args.command == "batch":
        cmd_batch(args)
    elif args.command == "reprocess":
        cmd_reprocess(args)
    elif args.command == "list":
        cmd_list(args)
    elif args.command == "manifest":
        cmd_manifest(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
