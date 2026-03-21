"""
SOFT_PASS Ingestion — Benchmark Boundary Learner
=================================================
Reads benchmark run results, identifies SOFT_PASS entries, and feeds them
into the failure_cluster pipeline so the learning system can act on them.

A SOFT_PASS means: the engine detected an *acceptable* but not *expected*
pattern for an image. When the same (expected → detected) confusion recurs
across multiple runs, it's a meaningful signal: the pattern boundary between
those two patterns needs calibration work.

This script turns that signal into `failure_clusters` with
failure_mode='pattern_boundary', which auto_candidate.py will convert into
proposed rule_candidates for human review.

Usage
-----
    python3 scripts/ingest_soft_pass.py               # last 5 runs
    python3 scripts/ingest_soft_pass.py --runs 10     # last N runs
    python3 scripts/ingest_soft_pass.py --all         # all runs ever
    python3 scripts/ingest_soft_pass.py --dry-run     # print clusters, no DB writes
    python3 scripts/ingest_soft_pass.py --min-runs 1  # flag even single-run confusions

SAFETY RULES:
  - Only writes to failure_clusters — never touches rule_candidates directly
  - Dry-run mode makes zero DB writes
  - Existing clusters are updated (upserted), never duplicated
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# ---------------------------------------------------------------------------
# Path setup — ensure project root is importable
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

RESULTS_DIR = PROJECT_ROOT / "benchmarks" / "results"
BENCHMARKS_DIR = PROJECT_ROOT / "benchmarks"

# ---------------------------------------------------------------------------
# Severity table: how many runs show the same confusion?
# ---------------------------------------------------------------------------
def _severity(run_count: int) -> str:
    if run_count >= 8:
        return "critical"
    if run_count >= 5:
        return "high"
    if run_count >= 3:
        return "medium"
    return "low"


# ---------------------------------------------------------------------------
# Load benchmark ground truth for acceptable_patterns lookup
# ---------------------------------------------------------------------------
def _load_ground_truths() -> Dict[str, Dict[str, Any]]:
    """Return {benchmark_id: ground_truth_dict} for all benchmark JSON files."""
    gts: Dict[str, Dict[str, Any]] = {}
    for p in BENCHMARKS_DIR.glob("*.json"):
        try:
            data = json.loads(p.read_text())
            bid = data.get("benchmark_id") or p.stem
            gts[bid] = data.get("ground_truth", {})
        except Exception:
            pass
    return gts


# ---------------------------------------------------------------------------
# Load result files
# ---------------------------------------------------------------------------
def _load_runs(n: Optional[int]) -> List[Dict[str, Any]]:
    """Load the N most recent result files (or all if n is None)."""
    files = sorted(RESULTS_DIR.glob("run_*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
    if n is not None:
        files = files[:n]
    runs = []
    for f in files:
        try:
            runs.append(json.loads(f.read_text()))
        except Exception as exc:
            print(f"  [warn] could not load {f.name}: {exc}", file=sys.stderr)
    return runs


# ---------------------------------------------------------------------------
# Cluster analysis
# ---------------------------------------------------------------------------
def analyse_soft_passes(
    runs: List[Dict[str, Any]],
    ground_truths: Dict[str, Dict[str, Any]],
    min_runs: int = 2,
) -> List[Dict[str, Any]]:
    """
    Find recurring SOFT_PASS confusions across runs.

    Returns a list of cluster dicts, each representing a unique
    (expected_pattern → detected_pattern) confusion pair.
    """
    # key: (expected_pattern, detected_pattern)
    # value: list of {run_ts, benchmark_id, confidence, diagnostics, check_detail}
    boundary_hits: Dict[Tuple[str, str], List[Dict[str, Any]]] = defaultdict(list)

    for run in runs:
        run_ts = run.get("run_timestamp", "?")
        for result in run.get("results", []):
            if result.get("verdict") != "SOFT_PASS":
                continue

            bid = result.get("benchmark_id", "?")
            detected = result.get("detected", {})
            checks = result.get("checks", {})
            diag = result.get("diagnostics", {})

            detected_pattern = detected.get("pattern", "unknown")
            detected_conf = detected.get("pattern_confidence", 0.0)

            # Get the expected pattern from the ground truth data
            gt = ground_truths.get(bid, {})
            expected_pattern = gt.get("expected_pattern", "unknown")
            acceptable = gt.get("acceptable_patterns", [])

            # Only care about pattern-level SOFT_PASSes (not light count only)
            pattern_check = checks.get("pattern", {})
            if pattern_check.get("status") != "SOFT_PASS":
                continue

            key = (expected_pattern, detected_pattern)
            boundary_hits[key].append({
                "run_ts": run_ts,
                "benchmark_id": bid,
                "confidence": detected_conf,
                "acceptable_patterns": acceptable,
                "signals_available": diag.get("signals_available"),
                "signal_strength": diag.get("signal_strength"),
                "face_detected": diag.get("face_detected"),
                "edge_cases": diag.get("edge_cases", []),
                "ambiguity_flags": diag.get("ambiguity_flags", []),
                "light_count_check": checks.get("light_count", {}).get("status"),
                "key_direction_check": checks.get("key_direction", {}).get("status"),
                "timing_s": result.get("timing_s"),
            })

    # Build cluster list, filtering by min_runs threshold
    clusters = []
    for (expected, detected), hits in sorted(boundary_hits.items(), key=lambda x: -len(x[1])):
        unique_runs = len({h["run_ts"] for h in hits})
        if unique_runs < min_runs:
            continue

        benchmark_ids = sorted({h["benchmark_id"] for h in hits})
        avg_conf = sum(h["confidence"] for h in hits) / len(hits)
        all_edge_cases = [ec for h in hits for ec in h["edge_cases"]]
        all_ambiguity = [af for h in hits for af in h["ambiguity_flags"]]

        # Edge-case frequency across all hits
        ec_freq: Dict[str, int] = defaultdict(int)
        for ec in all_edge_cases:
            ec_freq[ec] += 1
        amb_freq: Dict[str, int] = defaultdict(int)
        for af in all_ambiguity:
            amb_freq[af] += 1

        # Signal quality summary
        sig_vals = [h["signal_strength"] for h in hits if h["signal_strength"] is not None]
        avg_signal = round(sum(sig_vals) / len(sig_vals), 3) if sig_vals else None

        # Co-occurring direction failures
        direction_failures = sum(1 for h in hits if h.get("key_direction_check") == "FAIL")

        clusters.append({
            "expected_pattern": expected,
            "detected_pattern": detected,
            "run_count": unique_runs,
            "hit_count": len(hits),
            "benchmark_ids": benchmark_ids,
            "severity": _severity(unique_runs),
            "evidence": {
                "expected_pattern": expected,
                "detected_pattern": detected,
                "run_count": unique_runs,
                "hit_count": len(hits),
                "benchmark_ids": benchmark_ids,
                "avg_confidence": round(avg_conf, 3),
                "avg_signal_strength": avg_signal,
                "direction_failures_alongside": direction_failures,
                "top_edge_cases": dict(sorted(ec_freq.items(), key=lambda x: -x[1])[:5]),
                "top_ambiguity_flags": dict(sorted(amb_freq.items(), key=lambda x: -x[1])[:5]),
            },
        })

    return clusters


# ---------------------------------------------------------------------------
# Ingest into DB
# ---------------------------------------------------------------------------
def ingest_clusters(
    clusters: List[Dict[str, Any]],
    dry_run: bool = False,
) -> Dict[str, Any]:
    """Write clusters to failure_clusters via upsert_failure_cluster."""
    if not dry_run:
        from db.learning import upsert_failure_cluster  # lazy import

    created = []
    for c in clusters:
        # Use expected_pattern as pattern_id — it's the pattern that needs calibration.
        # Include detected_pattern in the cluster key via the failure_mode label so
        # (expected=loop, detected=rembrandt) gets a distinct cluster from
        # (expected=loop, detected=split).
        pattern_id = c["expected_pattern"]
        # Encode the confusion direction into environment field for disambiguation
        confusion_tag = f"{c['expected_pattern']}→{c['detected_pattern']}"

        evidence = c["evidence"]
        severity = c["severity"]
        frequency = c["run_count"]
        affected = c["hit_count"]

        if dry_run:
            print(
                f"  [dry-run] would upsert cluster: {confusion_tag}  "
                f"severity={severity}  runs={frequency}  hits={affected}"
            )
            created.append({"confusion": confusion_tag, "dry_run": True})
            continue

        cluster_record = upsert_failure_cluster(
            pattern_id=pattern_id,
            environment=confusion_tag,          # encodes the confusion direction
            subject_type="benchmark",
            failure_mode="pattern_boundary",
            severity=severity,
            frequency=frequency,
            affected_sessions=affected,
            evidence=evidence,
        )
        created.append({
            "id": cluster_record["id"],
            "confusion": confusion_tag,
            "severity": severity,
        })

    return {
        "total_clusters": len(clusters),
        "ingested": len(created),
        "records": created,
    }


# ---------------------------------------------------------------------------
# Pretty printer
# ---------------------------------------------------------------------------
def print_report(clusters: List[Dict[str, Any]]) -> None:
    if not clusters:
        print("  No recurring SOFT_PASS confusions found.")
        return

    print(f"\n{'─'*68}")
    print(f"  {'CONFUSION PAIR':<38} {'RUNS':>5}  {'HITS':>5}  SEVERITY")
    print(f"{'─'*68}")
    for c in clusters:
        pair = f"{c['expected_pattern']} ← {c['detected_pattern']}"
        print(
            f"  {pair:<38} {c['run_count']:>5}  {c['hit_count']:>5}  {c['severity'].upper()}"
        )
        bids = ", ".join(c["benchmark_ids"][:4])
        if len(c["benchmark_ids"]) > 4:
            bids += f" +{len(c['benchmark_ids'])-4} more"
        print(f"    benchmarks: {bids}")
        ev = c["evidence"]
        if ev.get("top_edge_cases"):
            print(f"    edge cases: {ev['top_edge_cases']}")
        if ev.get("top_ambiguity_flags"):
            print(f"    ambiguity:  {ev['top_ambiguity_flags']}")
    print(f"{'─'*68}")
    by_sev = defaultdict(int)
    for c in clusters:
        by_sev[c["severity"]] += 1
    print(f"  Totals: " + "  ".join(f"{s}={n}" for s, n in sorted(by_sev.items())))
    print()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def main() -> None:
    parser = argparse.ArgumentParser(
        description="Ingest SOFT_PASS benchmark results as pattern_boundary failure clusters"
    )
    parser.add_argument(
        "--runs", type=int, default=5, metavar="N",
        help="Number of most-recent runs to analyse (default: 5)",
    )
    parser.add_argument(
        "--all", action="store_true",
        help="Analyse ALL benchmark result files",
    )
    parser.add_argument(
        "--min-runs", type=int, default=2, metavar="N",
        help="Minimum number of runs showing the same confusion to create a cluster (default: 2)",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Print analysis without writing to the database",
    )
    parser.add_argument(
        "--auto-candidate", action="store_true",
        help="After ingesting clusters, auto-generate candidates for medium+ severity",
    )
    args = parser.parse_args()

    n_runs = None if args.all else args.runs
    label = "all" if args.all else f"last {n_runs}"

    print(f"\n── SOFT_PASS Ingestion ({label} runs, min_runs={args.min_runs}) ─────────────────")

    runs = _load_runs(n_runs)
    if not runs:
        print("  No benchmark result files found.")
        return
    print(f"  Loaded {len(runs)} run file(s) from {RESULTS_DIR}")

    ground_truths = _load_ground_truths()
    print(f"  Loaded {len(ground_truths)} benchmark ground truth file(s)")

    clusters = analyse_soft_passes(runs, ground_truths, min_runs=args.min_runs)
    print(f"  Found {len(clusters)} recurring confusion pair(s) (≥{args.min_runs} runs)\n")

    print_report(clusters)

    if args.dry_run:
        print("  [dry-run] skipping DB writes\n")
        ingest_clusters(clusters, dry_run=True)
        return

    result = ingest_clusters(clusters, dry_run=False)
    print(f"  ✓ Ingested {result['ingested']} cluster(s) into failure_clusters")

    if args.auto_candidate:
        from engine.learning.auto_candidate import generate_candidates_for_open_clusters
        print("\n  Running auto-candidate generation for medium+ clusters…")
        gen = generate_candidates_for_open_clusters(min_severity="medium", created_by="system:soft_pass_ingest")
        print(f"  ✓ Generated {gen['generated']} candidate(s)  "
              f"(eligible={gen['eligible_clusters']}, skipped={gen['skipped']}, errors={gen['errors']})")
        for cand in gen.get("candidates", []):
            print(f"    · {cand['candidate_id']}  [{cand['failure_mode']}  {cand['severity']}]")

    print()


if __name__ == "__main__":
    main()
