"""
Nightly benchmark drift check — called by the nightly.yml GitHub Action.

Invokes engine.benchmark_v2.nightly.run_nightly_check() directly (no HTTP),
writes the result to /tmp/nightly_result.json, and exits 1 if drift was detected.

Usage:
  python3 scripts/nightly_benchmark.py [--notes "optional note"]
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="Nightly benchmark drift check")
    parser.add_argument("--notes", default="Nightly scheduled run", help="Run notes")
    parser.add_argument("--out", default="/tmp/nightly_result.json", help="Output file")
    args = parser.parse_args()

    from engine.benchmark_v2.nightly import run_nightly_check

    print("▶ Running nightly drift check ...")
    result = run_nightly_check(triggered_by="nightly-ci", notes=args.notes)

    out_path = Path(args.out)
    out_path.write_text(json.dumps(result, indent=2, default=str))
    print(f"✓ Results written to {out_path}")

    status     = result.get("status", "unknown")
    score      = result.get("overall_score")
    drift_cnt  = len(result.get("drift_items", []))
    candidates = result.get("candidates_created", 0)

    score_str = f"{score:.3f}" if score is not None else "—"

    if status == "drift":
        print(f"\n⚠️  Drift detected  |  score={score_str}  |  {drift_cnt} item(s)")
        for item in result.get("drift_items", [])[:8]:
            pid   = item.get("pattern_id", "overall")
            delta = item.get("delta", 0) * 100
            print(f"  • {item.get('type','?')} [{pid}] Δ{delta:+.1f}%")
        if candidates:
            print(f"\n  → {candidates} candidate(s) auto-created for investigation.")
        sys.exit(1)
    elif status == "no_baseline":
        print("ℹ️  No baseline set — nothing to compare. Run passes.")
        sys.exit(0)
    else:
        print(f"\n✅  No significant drift  |  score={score_str}")
        sys.exit(0)


if __name__ == "__main__":
    main()
