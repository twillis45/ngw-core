#!/usr/bin/env python3
"""
NGW 30-Day Learning + Revenue Simulation.

Simulates the closed-loop learning system across three strategic scenarios
and prints a full day-by-day report plus final comparison table.

Usage
-----
  cd /path/to/ngw-core
  python3 scripts/simulate_30day.py [--scenario all|1|2|3] [--json]

Scenarios
---------
  1 — Conservative (manual-only gate, no auto-deploy)
  2 — Moderate     (auto-deploy for low-risk, manual for medium/high)
  3 — Controlled Autonomy  [RECOMMENDED]
      Low  → auto-deploy
      Med  → human review gate
      High → always manual

Output
------
  - Day-by-day table for each scenario
  - Signal accumulation milestones
  - Gate unlock and deploy events
  - Revenue delta vs. baseline
  - Final 3-scenario comparison table
"""

from __future__ import annotations

import argparse
import json
import sys
import os
from typing import Any, Dict, List

# ── Path setup ────────────────────────────────────────────────────────────────
_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _ROOT not in sys.path:
    sys.path.insert(0, _ROOT)

from engine.learning.revenue import project_30_day_metrics, summarise_revenue_impact
from engine.learning.knowledge import MIN_SIGNALS


# ── Scenario definitions ──────────────────────────────────────────────────────
# Three patterns with high signal volume and meaningful CVR gaps.
# Scenario configs control the risk-level assignment, which drives the gate.

BASE_PATTERNS = [
    # ── High-volume / low-complexity patterns ──────────────────────────────
    {
        "pattern_id":        "loop",
        "sessions_per_day":  120,
        "baseline_cvr":      0.055,
        "target_cvr":        0.063,
        "daily_new_signals": 80,   # ~67% signal yield
        "arpu":              9.0,
    },
    {
        "pattern_id":        "broad",
        "sessions_per_day":  95,
        "baseline_cvr":      0.052,
        "target_cvr":        0.060,
        "daily_new_signals": 62,
        "arpu":              9.0,
    },
    # ── Medium-volume / medium-complexity patterns ─────────────────────────
    {
        "pattern_id":        "short",
        "sessions_per_day":  75,
        "baseline_cvr":      0.047,
        "target_cvr":        0.065,
        "daily_new_signals": 50,
        "arpu":              9.0,
    },
    {
        "pattern_id":        "rembrandt",
        "sessions_per_day":  40,
        "baseline_cvr":      0.042,
        "target_cvr":        0.065,
        "daily_new_signals": 28,
        "arpu":              9.0,
    },
    {
        "pattern_id":        "split",
        "sessions_per_day":  85,
        "baseline_cvr":      0.045,
        "target_cvr":        0.068,
        "daily_new_signals": 55,
        "arpu":              9.0,
    },
    # ── Lower-volume / high-complexity patterns ────────────────────────────
    {
        "pattern_id":        "butterfly",
        "sessions_per_day":  55,
        "baseline_cvr":      0.041,
        "target_cvr":        0.062,
        "daily_new_signals": 35,
        "arpu":              9.0,
    },
    {
        "pattern_id":        "clamshell",
        "sessions_per_day":  65,
        "baseline_cvr":      0.048,
        "target_cvr":        0.071,
        "daily_new_signals": 42,
        "arpu":              9.0,
    },
    {
        "pattern_id":        "high_key",
        "sessions_per_day":  50,
        "baseline_cvr":      0.043,
        "target_cvr":        0.069,
        "daily_new_signals": 32,
        "arpu":              9.0,
    },
]


def _make_scenarios(risk_overrides: Dict[str, str]) -> List[Dict[str, Any]]:
    """Build scenario list from base patterns + risk overrides."""
    sc = []
    for p in BASE_PATTERNS:
        pid = p["pattern_id"]
        risk = risk_overrides.get(pid, "medium")
        sc.append({
            "name":              f"{pid} ({risk})",
            "description":       f"{pid.title()} pattern fix — {risk} risk deployment",
            "pattern_id":        pid,
            "risk_level":        risk,
            "sessions_per_day":  p["sessions_per_day"],
            "baseline_cvr":      p["baseline_cvr"],
            "target_cvr":        p["target_cvr"],
            "arpu":              p["arpu"],
            "daily_new_signals": p["daily_new_signals"],
        })
    return sc


SCENARIO_CONFIGS: Dict[int, Dict[str, Any]] = {
    1: {
        "label":       "Conservative",
        "description": "All changes require human sign-off regardless of risk level.",
        "risk_overrides": {
            "loop":      "high",
            "broad":     "high",
            "short":     "high",
            "rembrandt": "high",
            "split":     "high",
            "butterfly": "high",
            "clamshell": "high",
            "high_key":  "high",
        },
    },
    2: {
        "label":       "Moderate",
        "description": "Low-risk changes auto-deploy; medium/high require review.",
        "risk_overrides": {
            "loop":      "low",
            "broad":     "low",
            "short":     "medium",
            "rembrandt": "medium",
            "split":     "medium",
            "butterfly": "high",
            "clamshell": "high",
            "high_key":  "high",
        },
    },
    3: {
        "label":       "Controlled Autonomy",
        "description": (
            "Low → auto-deploy; "
            "Medium → human review; "
            "High → human gate. "
            "Balances speed with safety."
        ),
        "risk_overrides": {
            "loop":      "low",
            "broad":     "low",
            "short":     "low",
            "rembrandt": "high",
            "split":     "medium",
            "butterfly": "medium",
            "clamshell": "medium",
            "high_key":  "high",
        },
    },
}


# ── Formatting helpers ────────────────────────────────────────────────────────

def _bar(value: float, max_value: float, width: int = 20) -> str:
    filled = min(int(round(width * value / max(max_value, 1))), width)
    return "█" * filled + "░" * (width - filled)


def _print_scenario_table(proj_list, scenario_label: str) -> None:
    sep = "─" * 100
    print(f"\n{'═' * 100}")
    print(f"  SCENARIO: {scenario_label}")
    print(f"{'═' * 100}")

    for proj in proj_list:
        threshold = MIN_SIGNALS.get(proj.risk_level, 75)
        cvr_lift  = round((proj.target_cvr - proj.baseline_cvr) * 100, 1)

        print(f"\n  Pattern: {proj.pattern_id.upper():<20}  "
              f"Risk: {proj.risk_level:<8}  "
              f"Threshold: {threshold} signals  "
              f"CVR target lift: +{cvr_lift:.1f}pp")
        print(f"  Gate unlock day: {proj.gate_unlock_day or '—':<5}  "
              f"Deploy day: {proj.deploy_day or '—':<5}  "
              f"Δ Revenue 30d: ${proj.revenue_delta_30d:>8.2f}  "
              f"Annualised: ${proj.annualised_delta:>9.2f}")
        print(f"\n  {'Day':>4}  {'Signals':>9}  {'Gate':>14}  "
              f"{'CVR':>6}  {'Sess':>5}  {'Conv':>5}  "
              f"{'Revenue':>9}  Signal Progress")
        print(f"  {sep[:95]}")

        for snap in proj.day_snapshots:
            bar = _bar(snap.cumulative_signals, threshold)
            event_flag = ""
            if snap.day == proj.gate_unlock_day:
                event_flag = " ← GATE UNLOCK"
            elif snap.day == proj.deploy_day:
                event_flag = " ← DEPLOY"

            print(
                f"  {snap.day:>4}  "
                f"{snap.cumulative_signals:>9}  "
                f"{snap.gate_status:>14}  "
                f"{snap.cvr*100:>5.2f}%  "
                f"{snap.sessions:>5}  "
                f"{snap.conversions:>5}  "
                f"${snap.revenue:>8.2f}  "
                f"{bar}{event_flag}"
            )

        print(f"\n  30-day revenue:  ${proj.total_revenue_30d:>10.2f}  "
              f"(baseline: ${proj.baseline_revenue_30d:.2f}  "
              f"delta: ${proj.revenue_delta_30d:+.2f})")


def _print_comparison_table(results: List[Dict[str, Any]]) -> None:
    print(f"\n\n{'═' * 100}")
    print("  FINAL 30-DAY COMPARISON")
    print(f"{'═' * 100}\n")

    fmt = (
        "  {:<22}  {:>16}  {:>16}  {:>14}  {:>13}  {:>12}"
    )
    print(fmt.format(
        "Scenario",
        "30d Revenue Δ",
        "Annualised Δ",
        "Patterns Fixed",
        "Fastest Deploy",
        "Auto-Deployed",
    ))
    print("  " + "─" * 96)

    for r in results:
        auto = sum(1 for s in r["summary"]["scenarios"] if s.get("risk_level") == "low" and s.get("deploy_day"))
        print(fmt.format(
            r["label"][:22],
            f"${r['summary']['total_revenue_delta_30d']:>+.2f}",
            f"${r['summary']['total_annualised_delta']:>+.2f}",
            str(r["summary"]["total_scenarios"]),
            str(r["summary"]["fastest_deploy_day"] or "—"),
            str(auto),
        ))

    print()
    # Recommendation
    best = max(results, key=lambda x: x["summary"]["total_revenue_delta_30d"])
    print(f"  ✅ Recommendation: {best['label']}")
    print(f"     30-day revenue delta: ${best['summary']['total_revenue_delta_30d']:+.2f}")
    print(f"     Annualised:           ${best['summary']['total_annualised_delta']:+.2f}")
    print()


# ── Main ──────────────────────────────────────────────────────────────────────

def run_simulation(
    scenarios_to_run: List[int] = None,
    as_json: bool = False,
) -> Dict[str, Any]:
    """
    Run the 30-day simulation.

    Parameters
    ----------
    scenarios_to_run : list of scenario numbers (1, 2, 3).  None = all.
    as_json          : if True, return a JSON-serialisable dict instead of printing.

    Returns
    -------
    Dict with results for all scenarios, suitable for JSON output.
    """
    if scenarios_to_run is None:
        scenarios_to_run = [1, 2, 3]

    all_results = []

    for sc_num in scenarios_to_run:
        config  = SCENARIO_CONFIGS[sc_num]
        label   = config["label"]
        sc_list = _make_scenarios(config["risk_overrides"])

        projections = project_30_day_metrics(sc_list)
        summary     = summarise_revenue_impact(projections)

        all_results.append({
            "scenario_number": sc_num,
            "label":           label,
            "description":     config["description"],
            "summary":         summary,
            "projections":     projections,
        })

        if not as_json:
            _print_scenario_table(projections, label)

    if not as_json:
        _print_comparison_table(all_results)

    # Build JSON-safe output
    output = {
        "simulated_at":  None,
        "scenarios":     [],
    }
    from datetime import datetime, timezone
    output["simulated_at"] = datetime.now(timezone.utc).isoformat()

    for r in all_results:
        sc_out = {
            "scenario_number":  r["scenario_number"],
            "label":            r["label"],
            "description":      r["description"],
            "summary":          r["summary"],
            "patterns": [
                {
                    "pattern_id":           p.pattern_id,
                    "risk_level":           p.risk_level,
                    "gate_unlock_day":      p.gate_unlock_day,
                    "deploy_day":           p.deploy_day,
                    "revenue_delta_30d":    p.revenue_delta_30d,
                    "annualised_delta":     p.annualised_delta,
                    "total_conversions_30d": p.total_conversions_30d,
                    "baseline_conversions_30d": p.baseline_conversions_30d,
                    "day_snapshots": [
                        {
                            "day":                 s.day,
                            "cumulative_signals":  s.cumulative_signals,
                            "gate_status":         s.gate_status,
                            "cvr":                 s.cvr,
                            "sessions":            s.sessions,
                            "conversions":         s.conversions,
                            "revenue":             s.revenue,
                        }
                        for s in p.day_snapshots
                    ],
                }
                for p in r["projections"]
            ],
        }
        output["scenarios"].append(sc_out)

    return output


def main() -> None:
    parser = argparse.ArgumentParser(description="NGW 30-day learning simulation")
    parser.add_argument(
        "--scenario", default="all",
        help="Scenario(s) to run: 'all', '1', '2', '3', or comma-separated e.g. '1,3'"
    )
    parser.add_argument(
        "--json", action="store_true",
        help="Output raw JSON instead of formatted tables"
    )
    args = parser.parse_args()

    if args.scenario == "all":
        to_run = [1, 2, 3]
    else:
        to_run = [int(x.strip()) for x in args.scenario.split(",")]

    result = run_simulation(scenarios_to_run=to_run, as_json=args.json)

    if args.json:
        print(json.dumps(result, indent=2, default=str))


if __name__ == "__main__":
    main()
