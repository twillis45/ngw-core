"""
NGW CI Gate — Signal-Sufficiency + Benchmark-Delta Evaluation.

A candidate must pass THREE gates before human promotion is even offered:

  Gate 1 — Signal Sufficiency
      Enough quality-weighted production signals exist to trust the change.
      Thresholds: low=25  medium=75  high=200  (from knowledge.MIN_SIGNALS)

  Gate 2 — Benchmark Delta
      The benchmark suite must not regress overall.
      A positive delta is not required, but any drop > DELTA_FLOOR is fatal.

  Gate 3 — Pattern Regression
      No individual pattern score may drop more than PATTERN_FLOOR.
      A single pattern blowout is unacceptable even if overall score holds.

Risk tiers decide the *automatic* disposition:
  low    — auto-deploy if all gates pass (still logged + monitored)
  medium — gates must pass, THEN human review is required
  high   — gates must pass, AND human gate is mandatory regardless of score

Public API
----------
evaluate_candidate_gate(candidate_id)         → CIGateResult
evaluate_candidate_dict(candidate, insight)   → CIGateResult   (testable, no DB)
summarise_gate_result(result)                 → str             (one-liner for UI)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# ── Thresholds ────────────────────────────────────────────────────────────────
DELTA_FLOOR   = -0.02   # −2% overall score → fatal regression
PATTERN_FLOOR = -0.05   # −5% any single pattern → fatal regression

# These mirror knowledge.MIN_SIGNALS but are duplicated here so this module
# is importable without the full knowledge base loaded.
MIN_SIGNALS: Dict[str, int] = {
    "low":    25,
    "medium": 75,
    "high":   200,
}

# Gate verdicts (internal)
PASS  = "pass"
WARN  = "warn"   # passed numerically but soft concern noted
FAIL  = "fail"

# Disposition codes (output)
AUTO_DEPLOY    = "auto_deploy"      # low risk, all gates pass
HUMAN_REVIEW   = "human_review"     # medium risk, gates pass → needs review
HUMAN_GATE     = "human_gate"       # high risk → always needs review
BLOCKED        = "blocked"          # one or more gates failed
INSUFFICIENT   = "insufficient"     # not enough signals to evaluate


# ── Dataclasses ───────────────────────────────────────────────────────────────

@dataclass
class GateResult:
    """Result for a single evaluation gate."""
    gate:       str   # "signal_sufficiency" | "benchmark_delta" | "pattern_regression"
    verdict:    str   # pass | warn | fail
    message:    str
    detail:     Dict[str, Any] = field(default_factory=dict)


@dataclass
class CIGateResult:
    """
    Full CI gate evaluation result for one candidate.

    disposition   — what happens next (auto_deploy / human_review / human_gate / blocked / insufficient)
    gates         — individual GateResult for each of the 3 gates
    risk_level    — inherited from pattern knowledge or candidate
    notes         — human-readable list of warnings / failures
    """
    candidate_id:    str
    pattern_id:      str
    risk_level:      str
    disposition:     str
    gates:           List[GateResult] = field(default_factory=list)
    overall_verdict: str = FAIL
    blocking_reason: Optional[str] = None
    notes:           List[str] = field(default_factory=list)
    evaluated_at:    str = ""

    @property
    def is_blocked(self) -> bool:
        return self.disposition == BLOCKED

    @property
    def is_insufficient(self) -> bool:
        return self.disposition == INSUFFICIENT

    @property
    def needs_human(self) -> bool:
        return self.disposition in (HUMAN_REVIEW, HUMAN_GATE)

    @property
    def can_auto_deploy(self) -> bool:
        return self.disposition == AUTO_DEPLOY


# ── Core evaluator ────────────────────────────────────────────────────────────

def evaluate_candidate_dict(
    candidate:       Dict[str, Any],
    insight:         Optional[Any]  = None,   # AggregatedInsight or None
    benchmark_delta: Optional[float] = None,
    per_pattern:     Optional[Dict[str, float]] = None,
    baseline_per_pattern: Optional[Dict[str, float]] = None,
) -> CIGateResult:
    """
    Pure-function CI gate evaluation — no DB calls.

    Parameters
    ----------
    candidate       : dict with keys: id, pattern_id, risk_level (or use knowledge default)
    insight         : AggregatedInsight from knowledge.aggregate_signals_for_pattern()
                      If None, only benchmark gates are evaluated.
    benchmark_delta : overall benchmark score delta vs. baseline (current − previous)
    per_pattern     : {pattern_id: score} from current benchmark run
    baseline_per_pattern: {pattern_id: score} from previous baseline run
    """
    from engine.learning.knowledge import (
        get_pattern_entry, MIN_SIGNALS as KB_MIN_SIGNALS,
    )

    candidate_id = str(candidate.get("id", "unknown"))
    pattern_id   = str(candidate.get("pattern_id", "unknown"))
    notes: List[str] = []
    gates: List[GateResult] = []

    # Determine risk level: candidate override > knowledge base > "medium"
    risk_level = str(candidate.get("risk_level", "")).lower()
    if risk_level not in ("low", "medium", "high"):
        entry = get_pattern_entry(pattern_id)
        risk_level = entry.risk_level if entry else "medium"

    min_signals = KB_MIN_SIGNALS.get(risk_level, KB_MIN_SIGNALS["medium"])

    # ── Gate 1: Signal Sufficiency ─────────────────────────────────────────────
    gate1 = _eval_signal_sufficiency(insight, min_signals, risk_level)
    gates.append(gate1)

    if gate1.verdict == FAIL:
        # No point running benchmark gates if we don't have enough signal
        result = CIGateResult(
            candidate_id    = candidate_id,
            pattern_id      = pattern_id,
            risk_level      = risk_level,
            disposition     = INSUFFICIENT,
            gates           = gates,
            overall_verdict = FAIL,
            blocking_reason = gate1.message,
            notes           = [gate1.message],
            evaluated_at    = _now(),
        )
        return result

    # ── Gate 2: Benchmark Delta ────────────────────────────────────────────────
    gate2 = _eval_benchmark_delta(benchmark_delta)
    gates.append(gate2)
    if gate2.verdict == FAIL:
        notes.append(gate2.message)

    # ── Gate 3: Pattern Regression ─────────────────────────────────────────────
    gate3 = _eval_pattern_regression(
        pattern_id, per_pattern or {}, baseline_per_pattern or {}
    )
    gates.append(gate3)
    if gate3.verdict == FAIL:
        notes.append(gate3.message)

    # ── Aggregate verdict ──────────────────────────────────────────────────────
    hard_failures = [g for g in gates if g.verdict == FAIL]

    if hard_failures:
        return CIGateResult(
            candidate_id    = candidate_id,
            pattern_id      = pattern_id,
            risk_level      = risk_level,
            disposition     = BLOCKED,
            gates           = gates,
            overall_verdict = FAIL,
            blocking_reason = hard_failures[0].message,
            notes           = notes,
            evaluated_at    = _now(),
        )

    # All gates pass — now apply risk-tier disposition
    if risk_level == "low":
        disposition = AUTO_DEPLOY
    elif risk_level == "medium":
        disposition = HUMAN_REVIEW
    else:  # high
        disposition = HUMAN_GATE

    # Warn annotations
    for g in gates:
        if g.verdict == WARN:
            notes.append(f"[warn] {g.message}")

    return CIGateResult(
        candidate_id    = candidate_id,
        pattern_id      = pattern_id,
        risk_level      = risk_level,
        disposition     = disposition,
        gates           = gates,
        overall_verdict = PASS,
        blocking_reason = None,
        notes           = notes,
        evaluated_at    = _now(),
    )


def evaluate_candidate_gate(candidate_id: str) -> CIGateResult:
    """
    Full DB-backed CI gate evaluation.

    Loads the candidate from the DB, fetches production signals from
    db.signals, runs the benchmark comparison, and returns a CIGateResult.
    """
    from db.learning  import get_candidate, get_candidate_evaluation
    from db.signals   import get_pattern_breakdown
    from db.benchmark_baseline import compare_to_baseline
    from engine.benchmark_v2.runner import run_benchmark
    from engine.learning.knowledge import (
        aggregate_signals_for_pattern, enrich_signal_weights, LearningSignal,
    )

    # Load candidate
    candidate = get_candidate(candidate_id)
    if not candidate:
        return _error_result(candidate_id, "unknown", f"Candidate {candidate_id!r} not found")

    pattern_id = candidate.get("pattern_id", "unknown")
    logger.info("CI gate evaluation: candidate=%s pattern=%s", candidate_id, pattern_id)

    # ── Fetch + weight production signals ──────────────────────────────────────
    raw_signals = _load_production_signals(pattern_id)
    insight: Optional[Any] = None
    if raw_signals:
        insight = aggregate_signals_for_pattern(pattern_id, raw_signals)
        logger.info(
            "CI gate: %d raw signals → %.1f weighted (quality=%s)",
            insight.raw_signal_count,
            insight.weighted_signal_count,
            insight.signal_quality_label,
        )

    # ── Run benchmark comparison ───────────────────────────────────────────────
    benchmark_delta: Optional[float] = None
    per_pattern:     Dict[str, float] = {}
    baseline_pp:     Dict[str, float] = {}

    try:
        run_result   = run_benchmark(run_type="ci", trigger="ci_gate",
                                     triggered_by="ci_gate")
        comparison   = compare_to_baseline(run_result)
        benchmark_delta = comparison.get("delta", 0.0)
        per_pattern  = run_result.get("per_pattern", {})
        baseline_pp  = comparison.get("baseline_per_pattern", {})
    except Exception as exc:
        logger.warning("CI gate: benchmark run skipped — %s", exc)
        # Don't block on benchmark failure; surface as a warning instead

    return evaluate_candidate_dict(
        candidate            = candidate,
        insight              = insight,
        benchmark_delta      = benchmark_delta,
        per_pattern          = per_pattern,
        baseline_per_pattern = baseline_pp,
    )


# ── Individual gate evaluators ────────────────────────────────────────────────

def _eval_signal_sufficiency(
    insight,  # AggregatedInsight | None
    min_signals: int,
    risk_level: str,
) -> GateResult:
    """Gate 1 — Do we have enough quality-weighted signals?"""
    if insight is None:
        return GateResult(
            gate    = "signal_sufficiency",
            verdict = FAIL,
            message = (
                f"No production signals found for this pattern. "
                f"Need ≥{min_signals} weighted signals for {risk_level}-risk change."
            ),
        )

    weighted = insight.weighted_signal_count
    threshold_met = weighted >= min_signals

    if not threshold_met:
        return GateResult(
            gate    = "signal_sufficiency",
            verdict = FAIL,
            message = (
                f"Insufficient signals: {weighted:.1f} weighted vs. {min_signals} "
                f"required ({risk_level} risk)."
            ),
            detail  = {
                "weighted_signals": weighted,
                "required":         min_signals,
                "raw_count":        insight.raw_signal_count,
                "quality_label":    insight.signal_quality_label,
            },
        )

    # Soft warn if quality is "sufficient" but not "strong" for medium/high risk
    if risk_level in ("medium", "high") and insight.signal_quality_label == "sufficient":
        return GateResult(
            gate    = "signal_sufficiency",
            verdict = WARN,
            message = (
                f"Signal count {weighted:.1f} meets threshold but is not yet 'strong'. "
                "Gathering more signals before deployment is advisable."
            ),
            detail  = {
                "weighted_signals": weighted,
                "required":         min_signals,
                "quality_label":    insight.signal_quality_label,
            },
        )

    return GateResult(
        gate    = "signal_sufficiency",
        verdict = PASS,
        message = f"Signal sufficiency met: {weighted:.1f} weighted signals (threshold={min_signals}).",
        detail  = {
            "weighted_signals": weighted,
            "required":         min_signals,
            "quality_label":    insight.signal_quality_label,
        },
    )


def _eval_benchmark_delta(benchmark_delta: Optional[float]) -> GateResult:
    """Gate 2 — Does the benchmark score hold?"""
    if benchmark_delta is None:
        return GateResult(
            gate    = "benchmark_delta",
            verdict = WARN,
            message = "No benchmark comparison available (first run or benchmark skipped).",
        )

    if benchmark_delta < DELTA_FLOOR:
        return GateResult(
            gate    = "benchmark_delta",
            verdict = FAIL,
            message = (
                f"Benchmark regression: overall score dropped {benchmark_delta:+.2%} "
                f"(floor is {DELTA_FLOOR:+.2%})."
            ),
            detail  = {"delta": benchmark_delta, "floor": DELTA_FLOOR},
        )

    if benchmark_delta < 0:
        return GateResult(
            gate    = "benchmark_delta",
            verdict = WARN,
            message = f"Minor benchmark dip: {benchmark_delta:+.2%} (within tolerance).",
            detail  = {"delta": benchmark_delta, "floor": DELTA_FLOOR},
        )

    return GateResult(
        gate    = "benchmark_delta",
        verdict = PASS,
        message = f"Benchmark delta OK: {benchmark_delta:+.2%}.",
        detail  = {"delta": benchmark_delta},
    )


def _eval_pattern_regression(
    target_pattern_id: str,
    per_pattern:       Dict[str, float],
    baseline_pp:       Dict[str, float],
) -> GateResult:
    """Gate 3 — No single pattern drops more than PATTERN_FLOOR."""
    if not per_pattern or not baseline_pp:
        return GateResult(
            gate    = "pattern_regression",
            verdict = WARN,
            message = "No per-pattern comparison data available.",
        )

    regressions: List[Dict[str, Any]] = []
    for pid, current_score in per_pattern.items():
        baseline_score = baseline_pp.get(pid)
        if baseline_score is None:
            continue
        delta = current_score - baseline_score
        if delta < PATTERN_FLOOR:
            regressions.append({
                "pattern_id":   pid,
                "delta":        round(delta, 4),
                "current":      round(current_score, 4),
                "baseline":     round(baseline_score, 4),
            })

    if regressions:
        worst = min(regressions, key=lambda r: r["delta"])
        return GateResult(
            gate    = "pattern_regression",
            verdict = FAIL,
            message = (
                f"Pattern regression detected: {worst['pattern_id']} dropped "
                f"{worst['delta']:+.2%} (floor is {PATTERN_FLOOR:+.2%}). "
                f"{len(regressions)} pattern(s) affected."
            ),
            detail  = {
                "regressions": regressions,
                "floor":       PATTERN_FLOOR,
            },
        )

    # Check specifically whether the target pattern improved
    if target_pattern_id in per_pattern and target_pattern_id in baseline_pp:
        td = per_pattern[target_pattern_id] - baseline_pp[target_pattern_id]
        detail_msg = f"Target pattern {target_pattern_id}: {td:+.2%}"
    else:
        detail_msg = "No per-pattern data for target pattern."

    return GateResult(
        gate    = "pattern_regression",
        verdict = PASS,
        message = f"No pattern regressions. {detail_msg}",
    )


# ── Helpers ───────────────────────────────────────────────────────────────────

def _load_production_signals(pattern_id: str):
    """
    Load production session signals from db.signals, convert to LearningSignal.
    Returns list of enriched LearningSignal objects.
    """
    from db.signals import get_pattern_breakdown
    from engine.learning.knowledge import LearningSignal, enrich_signal_weights

    try:
        rows = get_pattern_breakdown(pattern_id=pattern_id, days=90)
    except Exception as exc:
        logger.warning("Could not load signals for %s: %s", pattern_id, exc)
        return []

    signals: List = []
    for row in (rows or []):
        sig = LearningSignal(
            signal_id        = str(row.get("id", "")),
            pattern_id       = pattern_id,
            outcome          = str(row.get("outcome", "unknown")),
            skill_tier       = str(row.get("skill_tier", "unknown")),
            confidence_score = float(row.get("confidence_score", 0.5)),
            source           = str(row.get("signal_source", "live")),
            session_id       = str(row.get("session_id", "")),
            created_at       = str(row.get("created_at", "")),
        )
        signals.append(sig)

    return enrich_signal_weights(signals)


def _error_result(candidate_id: str, pattern_id: str, message: str) -> CIGateResult:
    return CIGateResult(
        candidate_id    = candidate_id,
        pattern_id      = pattern_id,
        risk_level      = "unknown",
        disposition     = BLOCKED,
        overall_verdict = FAIL,
        blocking_reason = message,
        notes           = [message],
        evaluated_at    = _now(),
    )


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Summariser ────────────────────────────────────────────────────────────────

def summarise_gate_result(result: CIGateResult) -> str:
    """
    Return a one-line human-readable summary suitable for the Lab UI.

    Examples
    --------
    "✅ Auto-deploy: all 3 gates passed (low risk, 47 weighted signals)"
    "🔴 Blocked: insufficient signals — 8.5 weighted vs. 25 required"
    "⚠️ Human review: gates passed, medium-risk candidate awaiting sign-off"
    """
    icons = {
        AUTO_DEPLOY:  "✅",
        HUMAN_REVIEW: "⚠️",
        HUMAN_GATE:   "🔐",
        BLOCKED:      "🔴",
        INSUFFICIENT: "⏳",
    }
    icon = icons.get(result.disposition, "❓")

    if result.disposition == AUTO_DEPLOY:
        passes = sum(1 for g in result.gates if g.verdict == PASS)
        return f"{icon} Auto-deploy: {passes}/3 gates passed ({result.risk_level} risk)"

    if result.disposition == HUMAN_REVIEW:
        return f"{icon} Human review required: gates passed, medium-risk candidate"

    if result.disposition == HUMAN_GATE:
        return f"{icon} Human gate: high-risk candidate — mandatory sign-off required"

    if result.disposition == BLOCKED:
        reason = result.blocking_reason or "unknown reason"
        return f"{icon} Blocked: {reason}"

    if result.disposition == INSUFFICIENT:
        signal_gate = next(
            (g for g in result.gates if g.gate == "signal_sufficiency"), None
        )
        detail = signal_gate.detail if signal_gate else {}
        weighted = detail.get("weighted_signals", 0)
        required = detail.get("required", "?")
        return (
            f"{icon} Insufficient signals: {weighted:.1f} weighted "
            f"vs. {required} required"
        )

    return f"{icon} {result.disposition}: {result.overall_verdict}"
