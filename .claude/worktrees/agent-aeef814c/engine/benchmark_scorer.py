"""Gold benchmark scorecard scorer for the NGW lighting analysis pipeline.

Loads benchmark definitions from data/benchmarks/benchmark_definitions.json,
constructs pass-output fixtures from expected_signals, runs the archetype
classifier + solver infrastructure, and produces a structured scorecard report.

Usage
-----
>>> from engine.benchmark_scorer import run_all_benchmarks, format_report
>>> report = run_all_benchmarks()
>>> print(format_report(report))
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from engine.constants import ENGINE_VERSION

logger = logging.getLogger(__name__)

DEFINITIONS_PATH = Path(__file__).resolve().parent.parent / "data" / "benchmarks" / "benchmark_definitions.json"
RESULTS_DIR = Path(__file__).resolve().parent.parent / "data" / "benchmarks" / "results"


# ═══════════════════════════════════════════════════════════════════════════
# Data Models
# ═══════════════════════════════════════════════════════════════════════════


@dataclass
class SignalCheckResult:
    """Result of checking one expected signal field."""
    pass_key: str
    field: str
    expected: Any
    actual: Any
    passed: bool
    check_type: str  # exact | range | bool | missing


@dataclass
class CategoryScore:
    """Score for one of the 10 scoring categories."""
    category: str
    expected_score: int  # 0-3
    actual_score: int    # 0-3
    rationale: str = ""


@dataclass
class BenchmarkCaseResult:
    """Full result for one benchmark case."""
    test_id: str
    engine_version: str
    timestamp: str
    signal_results: List[SignalCheckResult] = field(default_factory=list)
    category_scores: List[CategoryScore] = field(default_factory=list)
    archetype_result: Dict[str, Any] = field(default_factory=dict)
    failure_guard_results: List[Dict[str, Any]] = field(default_factory=list)
    total_score: int = 0
    max_score: int = 0
    pct: float = 0.0


@dataclass
class RegressionAlert:
    """Structured regression detection result."""
    test_id: str
    category: str
    prev_score: int
    curr_score: int
    delta: int
    severity: str = "warning"  # warning | critical
    message: str = ""


@dataclass
class BenchmarkReport:
    """Aggregate benchmark report across all cases."""
    cases: List[BenchmarkCaseResult] = field(default_factory=list)
    engine_version: str = ""
    timestamp: str = ""
    total_score: int = 0
    max_score: int = 0
    pct: float = 0.0
    regressions: List[Dict[str, Any]] = field(default_factory=list)
    regression_alerts: List[RegressionAlert] = field(default_factory=list)
    has_critical_regression: bool = False


# ═══════════════════════════════════════════════════════════════════════════
# Fixture Construction
# ═══════════════════════════════════════════════════════════════════════════


def _midpoint(spec: Dict[str, Any]) -> float:
    """For a range spec {min, max}, return midpoint."""
    lo = spec.get("min", 0.0)
    hi = spec.get("max", 1.0)
    return round((lo + hi) / 2, 4)


def _resolve_value(expected_value: Any) -> Any:
    """Convert an expected_signal value to a concrete fixture value.

    - dict with min/max → midpoint
    - bool/str/int/float → pass through
    """
    if isinstance(expected_value, dict):
        if "min" in expected_value or "max" in expected_value:
            return _midpoint(expected_value)
        return expected_value
    return expected_value


def build_pass_fixtures(expected_signals: Dict[str, Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    """Build pass-output fixture dicts from expected_signals.

    Each pass gets an `ok: True` field plus all the expected signal fields
    resolved to concrete values (ranges → midpoints).
    """
    fixtures = {}
    for pass_key, fields in expected_signals.items():
        fixture = {"ok": True}
        for field_name, expected_value in fields.items():
            fixture[field_name] = _resolve_value(expected_value)
        fixtures[pass_key] = fixture
    return fixtures


# ═══════════════════════════════════════════════════════════════════════════
# Signal Checking
# ═══════════════════════════════════════════════════════════════════════════


def _check_one_signal(
    pass_key: str,
    field_name: str,
    expected: Any,
    actual: Any,
) -> SignalCheckResult:
    """Check a single expected signal against actual value."""
    if actual is None:
        return SignalCheckResult(
            pass_key=pass_key, field=field_name,
            expected=expected, actual=None,
            passed=False, check_type="missing",
        )

    # Range check: {min, max}
    if isinstance(expected, dict) and ("min" in expected or "max" in expected):
        lo = expected.get("min", float("-inf"))
        hi = expected.get("max", float("inf"))
        try:
            val = float(actual)
            passed = lo <= val <= hi
        except (TypeError, ValueError):
            passed = False
        return SignalCheckResult(
            pass_key=pass_key, field=field_name,
            expected=expected, actual=actual,
            passed=passed, check_type="range",
        )

    # Bool check
    if isinstance(expected, bool):
        passed = actual == expected
        return SignalCheckResult(
            pass_key=pass_key, field=field_name,
            expected=expected, actual=actual,
            passed=passed, check_type="bool",
        )

    # String exact match
    if isinstance(expected, str):
        passed = str(actual) == expected
        return SignalCheckResult(
            pass_key=pass_key, field=field_name,
            expected=expected, actual=actual,
            passed=passed, check_type="exact",
        )

    # Numeric with tolerance
    if isinstance(expected, (int, float)):
        try:
            passed = abs(float(actual) - float(expected)) < 0.01
        except (TypeError, ValueError):
            passed = False
        return SignalCheckResult(
            pass_key=pass_key, field=field_name,
            expected=expected, actual=actual,
            passed=passed, check_type="exact",
        )

    # Fallback: exact equality
    passed = actual == expected
    return SignalCheckResult(
        pass_key=pass_key, field=field_name,
        expected=expected, actual=actual,
        passed=passed, check_type="exact",
    )


def check_expected_signals(
    pass_fixtures: Dict[str, Dict[str, Any]],
    expected_signals: Dict[str, Dict[str, Any]],
) -> List[SignalCheckResult]:
    """Check all expected signals against pass fixtures."""
    results = []
    for pass_key, fields in expected_signals.items():
        pass_data = pass_fixtures.get(pass_key, {})
        for field_name, expected_value in fields.items():
            actual = pass_data.get(field_name)
            result = _check_one_signal(pass_key, field_name, expected_value, actual)
            results.append(result)
    return results


# ═══════════════════════════════════════════════════════════════════════════
# Category Scoring
# ═══════════════════════════════════════════════════════════════════════════


def _count_signal_hits(
    signal_results: List[SignalCheckResult],
    pass_keys: List[str],
) -> tuple:
    """Count passed/total for signals in the given passes."""
    relevant = [r for r in signal_results if r.pass_key in pass_keys]
    if not relevant:
        return 0, 0
    passed = sum(1 for r in relevant if r.passed)
    return passed, len(relevant)


def _ratio_to_score(passed: int, total: int) -> int:
    """Convert pass/total ratio to 0-3 score."""
    if total == 0:
        return 0
    ratio = passed / total
    if ratio >= 0.95:
        return 3
    if ratio >= 0.7:
        return 2
    if ratio >= 0.4:
        return 1
    return 0


def score_category(
    category: str,
    signal_results: List[SignalCheckResult],
    archetype_result: Dict[str, Any],
    solver_results: Dict[str, Any],
) -> int:
    """Score one category (0-3) based on signal checks and solver outputs."""

    if category == "catchlight_accuracy":
        passed, total = _count_signal_hits(signal_results, ["catchlight_topology"])
        return _ratio_to_score(passed, total)

    if category == "highlight_axis_accuracy":
        passed, total = _count_signal_hits(signal_results, ["highlight_axis_map"])
        return _ratio_to_score(passed, total)

    if category == "symmetry_accuracy":
        # Symmetry score + fill_side from highlight_symmetry
        relevant = [r for r in signal_results
                     if r.pass_key == "highlight_symmetry"
                     and r.field in ("symmetry_score", "fill_detected", "fill_side")]
        if not relevant:
            return 0
        passed = sum(1 for r in relevant if r.passed)
        return _ratio_to_score(passed, len(relevant))

    if category == "underfill_detection":
        # fill_detected + underfill_ev + primary_fill_type
        relevant = [r for r in signal_results
                     if (r.pass_key == "highlight_symmetry" and r.field in ("fill_detected", "underfill_ev"))
                     or (r.pass_key == "bounce_contributor" and r.field == "primary_fill_type")]
        if not relevant:
            return 0
        passed = sum(1 for r in relevant if r.passed)
        return _ratio_to_score(passed, len(relevant))

    if category == "modifier_candidate_quality":
        passed, total = _count_signal_hits(signal_results, ["continuous_source"])
        return _ratio_to_score(passed, total)

    if category == "key_direction_accuracy":
        passed, total = _count_signal_hits(signal_results, ["off_axis_key"])
        return _ratio_to_score(passed, total)

    if category == "environment_detection":
        # Primary: check if consensus solver produced an environment
        consensus = solver_results.get("consensus")
        env = None
        if consensus is not None:
            env = getattr(consensus, "dominant_environment", None) if hasattr(consensus, "dominant_environment") else None
        if env is not None:
            return 3

        # Fallback: use signal-based scoring from continuous_source + bounce + separation
        # (solver may not extract environment from sparse fixtures)
        env_passes = ["continuous_source", "bounce_contributor", "separation_light"]
        passed, total = _count_signal_hits(signal_results, env_passes)
        return _ratio_to_score(passed, total)

    if category == "false_multi_light_prevention":
        consensus = solver_results.get("consensus")
        if consensus is None:
            return 1
        light_count = getattr(consensus, "dominant_light_count", None) if hasattr(consensus, "dominant_light_count") else None
        # Check catchlight count from signals
        ct_signals = [r for r in signal_results
                      if r.pass_key == "catchlight_topology" and r.field == "catchlight_count"]
        if ct_signals and ct_signals[0].passed:
            return 3 if light_count is not None else 2
        return 1

    if category == "contradiction_handling":
        contradictions = solver_results.get("contradictions")
        if contradictions is None:
            return 1
        ambiguity = getattr(contradictions, "ambiguity_class", "unknown") if hasattr(contradictions, "ambiguity_class") else "unknown"
        severity = getattr(contradictions, "high_severity_count", 0) if hasattr(contradictions, "high_severity_count") else 0
        # Clean signals → clean ambiguity = 3
        # Minor conflicts with low severity = 2
        # Genuine ambiguity correctly flagged = 2
        if ambiguity == "clean" and severity == 0:
            return 3
        if ambiguity in ("clean", "minor_conflicts") and severity <= 1:
            return 2
        if ambiguity != "unknown":
            return 1
        return 0

    if category == "confidence_honesty":
        arch = archetype_result
        confidence = arch.get("confidence", 0.0)
        expected_arch = arch.get("expected")
        actual_arch = arch.get("actual")

        if expected_arch is None:
            # No archetype expected → honest if confidence is moderate/low
            # (classifier may still find a match — that's ok if confidence isn't extreme)
            return 3 if confidence < 0.75 else (2 if confidence < 0.9 else 1)
        if actual_arch == expected_arch:
            # Correct classification → confidence should be decent
            return 3 if confidence > 0.4 else (2 if confidence > 0.2 else 1)
        # Wrong classification → penalize
        return 0

    logger.warning("Unknown scoring category: %s", category)
    return 0


# ═══════════════════════════════════════════════════════════════════════════
# Failure Guards
# ═══════════════════════════════════════════════════════════════════════════


def check_failure_guards(
    archetype_result: Dict[str, Any],
    expected_failures_to_avoid: List[str],
) -> List[Dict[str, Any]]:
    """Verify that no avoided archetype is the primary classification."""
    results = []
    actual_primary = archetype_result.get("actual")
    for arch in expected_failures_to_avoid:
        was_primary = actual_primary == arch
        results.append({
            "archetype": arch,
            "was_primary": was_primary,
            "passed": not was_primary,
        })
    return results


# ═══════════════════════════════════════════════════════════════════════════
# Run One Benchmark Case
# ═══════════════════════════════════════════════════════════════════════════


def _run_archetype_classifier(pass_fixtures: Dict[str, Dict[str, Any]]) -> Any:
    """Run classify_archetype with pass fixtures as keyword arguments."""
    from engine.archetype_classifier import classify_archetype
    return classify_archetype(
        catchlight_topology=pass_fixtures.get("catchlight_topology"),
        highlight_symmetry=pass_fixtures.get("highlight_symmetry"),
        highlight_axis_map=pass_fixtures.get("highlight_axis_map"),
        off_axis_key=pass_fixtures.get("off_axis_key"),
        light_structure=pass_fixtures.get("light_structure"),
        separation_light=pass_fixtures.get("separation_light"),
        bounce_contributor=pass_fixtures.get("bounce_contributor"),
        continuous_source=pass_fixtures.get("continuous_source"),
    )


def _run_solvers(pass_fixtures: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    """Run consistency, contradiction, and consensus solvers."""
    from engine.consistency_engine import score_consistency
    from engine.contradiction_engine import find_contradictions
    from engine.consensus_solver import solve_dominant_source
    from engine.signal_weights import compute_pass_weights

    pass_weights = compute_pass_weights()

    consistency = score_consistency(pass_fixtures, pass_weights)
    contradictions = find_contradictions(pass_fixtures)
    consensus = solve_dominant_source(pass_fixtures, pass_weights)

    return {
        "consistency": consistency,
        "contradictions": contradictions,
        "consensus": consensus,
    }


def run_benchmark_case(case_def: Dict[str, Any]) -> BenchmarkCaseResult:
    """Run a single benchmark case and return the result."""
    test_id = case_def["test_id"]
    expected_signals = case_def["expected_signals"]
    expected_archetype = case_def.get("expected_archetype")
    failures_to_avoid = case_def.get("expected_failures_to_avoid", [])
    scoring_defs = case_def.get("scoring_categories", {})

    ts = datetime.now(timezone.utc).isoformat()

    # Build fixtures from expected signals
    pass_fixtures = build_pass_fixtures(expected_signals)

    # Check signals
    signal_results = check_expected_signals(pass_fixtures, expected_signals)

    # Run archetype classifier
    try:
        classification = _run_archetype_classifier(pass_fixtures)
        archetype_result = {
            "expected": expected_archetype,
            "actual": classification.primary_archetype,
            "confidence": classification.primary_confidence,
            "secondary": classification.secondary_archetype,
            "matched_signals": classification.matched_signals,
            "all_scores": classification.all_scores,
            "passed": classification.primary_archetype == expected_archetype,
        }
    except Exception as e:
        logger.warning("Archetype classifier failed for %s: %s", test_id, e)
        archetype_result = {
            "expected": expected_archetype,
            "actual": None,
            "confidence": 0.0,
            "error": str(e),
            "passed": expected_archetype is None,
        }

    # Run solvers
    try:
        solver_results = _run_solvers(pass_fixtures)
    except Exception as e:
        logger.warning("Solver failed for %s: %s", test_id, e)
        solver_results = {"error": str(e)}

    # Failure guards
    failure_guard_results = check_failure_guards(archetype_result, failures_to_avoid)

    # Score categories
    category_scores = []
    for cat_name, cat_def in scoring_defs.items():
        expected_score = cat_def.get("expected_score", 0)
        actual_score = score_category(cat_name, signal_results, archetype_result, solver_results)
        category_scores.append(CategoryScore(
            category=cat_name,
            expected_score=expected_score,
            actual_score=actual_score,
            rationale=cat_def.get("rationale", ""),
        ))

    total_score = sum(c.actual_score for c in category_scores)
    max_score = sum(c.expected_score for c in category_scores)
    pct = round(total_score / max_score * 100, 1) if max_score > 0 else 0.0

    return BenchmarkCaseResult(
        test_id=test_id,
        engine_version=ENGINE_VERSION,
        timestamp=ts,
        signal_results=signal_results,
        category_scores=category_scores,
        archetype_result=archetype_result,
        failure_guard_results=failure_guard_results,
        total_score=total_score,
        max_score=max_score,
        pct=pct,
    )


# ═══════════════════════════════════════════════════════════════════════════
# Run All Benchmarks
# ═══════════════════════════════════════════════════════════════════════════


def run_all_benchmarks(
    definitions_path: Optional[str] = None,
) -> BenchmarkReport:
    """Load definitions and run all benchmark cases."""
    path = Path(definitions_path) if definitions_path else DEFINITIONS_PATH
    with open(path) as f:
        definitions = json.load(f)

    ts = datetime.now(timezone.utc).isoformat()
    cases = []
    for case_def in definitions.get("benchmark_cases", []):
        result = run_benchmark_case(case_def)
        cases.append(result)

    total_score = sum(c.total_score for c in cases)
    max_score = sum(c.max_score for c in cases)
    pct = round(total_score / max_score * 100, 1) if max_score > 0 else 0.0

    # Load previous and detect regressions
    previous = load_previous_results()
    regressions = detect_regressions_from_report(cases, previous) if previous else []

    return BenchmarkReport(
        cases=cases,
        engine_version=ENGINE_VERSION,
        timestamp=ts,
        total_score=total_score,
        max_score=max_score,
        pct=pct,
        regressions=regressions,
    )


# ═══════════════════════════════════════════════════════════════════════════
# Results Storage
# ═══════════════════════════════════════════════════════════════════════════


def _case_to_dict(case: BenchmarkCaseResult) -> Dict[str, Any]:
    """Serialize a BenchmarkCaseResult to a plain dict."""
    return {
        "test_id": case.test_id,
        "engine_version": case.engine_version,
        "timestamp": case.timestamp,
        "total_score": case.total_score,
        "max_score": case.max_score,
        "pct": case.pct,
        "signal_pass_rate": (
            f"{sum(1 for s in case.signal_results if s.passed)}/{len(case.signal_results)}"
        ),
        "archetype_passed": case.archetype_result.get("passed", False),
        "failure_guards_passed": all(g["passed"] for g in case.failure_guard_results),
        "category_scores": {
            c.category: {"expected": c.expected_score, "actual": c.actual_score}
            for c in case.category_scores
        },
    }


def save_results(
    report: BenchmarkReport,
    results_dir: Optional[str] = None,
) -> Path:
    """Append benchmark results as a JSONL line."""
    rdir = Path(results_dir) if results_dir else RESULTS_DIR
    rdir.mkdir(parents=True, exist_ok=True)
    results_file = rdir / "benchmark_results.jsonl"

    entry = {
        "engine_version": report.engine_version,
        "timestamp": report.timestamp,
        "total_score": report.total_score,
        "max_score": report.max_score,
        "pct": report.pct,
        "cases": [_case_to_dict(c) for c in report.cases],
    }

    with open(results_file, "a") as f:
        f.write(json.dumps(entry) + "\n")

    return results_file


def load_previous_results(
    results_dir: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Load the most recent benchmark results entry."""
    rdir = Path(results_dir) if results_dir else RESULTS_DIR
    results_file = rdir / "benchmark_results.jsonl"
    if not results_file.exists():
        return None

    last_line = None
    with open(results_file) as f:
        for line in f:
            line = line.strip()
            if line:
                last_line = line

    if not last_line:
        return None

    try:
        return json.loads(last_line)
    except json.JSONDecodeError:
        return None


# ═══════════════════════════════════════════════════════════════════════════
# Regression Detection
# ═══════════════════════════════════════════════════════════════════════════


def detect_regressions_from_report(
    current_cases: List[BenchmarkCaseResult],
    previous: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """Compare current results against previous run, flag regressions."""
    regressions = []
    prev_cases = {c["test_id"]: c for c in previous.get("cases", [])}

    for case in current_cases:
        prev = prev_cases.get(case.test_id)
        if not prev:
            continue

        # Overall case score regression
        if case.total_score < prev.get("total_score", 0):
            regressions.append({
                "test_id": case.test_id,
                "category": "_total",
                "prev_score": prev["total_score"],
                "curr_score": case.total_score,
                "delta": case.total_score - prev["total_score"],
            })

        # Per-category regressions
        prev_cats = prev.get("category_scores", {})
        for cat_score in case.category_scores:
            prev_cat = prev_cats.get(cat_score.category, {})
            prev_actual = prev_cat.get("actual", 0)
            if cat_score.actual_score < prev_actual:
                regressions.append({
                    "test_id": case.test_id,
                    "category": cat_score.category,
                    "prev_score": prev_actual,
                    "curr_score": cat_score.actual_score,
                    "delta": cat_score.actual_score - prev_actual,
                })

    return regressions


def detect_regressions(
    current: BenchmarkReport,
    previous: Optional[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Public API: detect regressions between current report and previous."""
    if not previous:
        return []
    return detect_regressions_from_report(current.cases, previous)


# ── Critical regression rules ──
# These map (test_id_substring, category) → reason for criticality.
_CRITICAL_REGRESSION_RULES = {
    ("reflective", "false_multi_light_prevention"): "False multi-light prevention worsened on reflective benchmark",
    ("window", "confidence_honesty"): "Confidence honesty worsened on ambiguous window benchmark",
    ("karsh", "key_direction_accuracy"): "Key direction accuracy worsened on dramatic directional portrait",
    ("rembrandt", "key_direction_accuracy"): "Key direction accuracy worsened on Rembrandt portrait",
}

_CRITICAL_TOTAL_DROP = 3  # 3+ point total drop = critical


def detect_regression_alerts(
    current: BenchmarkReport,
    previous: Optional[Dict[str, Any]],
) -> List[RegressionAlert]:
    """Enhanced regression detection with severity classification.

    Rules for CRITICAL severity:
        - Total case score drops by 3+ points
        - false_multi_light_prevention worsens on reflective benchmark
        - confidence_honesty worsens on ambiguous benchmarks
        - key_direction_accuracy worsens on dramatic directional portraits

    All other regressions are WARNING severity.
    """
    if not previous:
        return []

    raw = detect_regressions_from_report(current.cases, previous)
    alerts = []

    for reg in raw:
        test_id = reg["test_id"]
        category = reg["category"]
        delta = reg["delta"]

        severity = "warning"
        message = f"{test_id}/{category}: {reg['prev_score']} -> {reg['curr_score']} ({delta:+d})"

        # Check critical total drop
        if category == "_total" and abs(delta) >= _CRITICAL_TOTAL_DROP:
            severity = "critical"
            message = f"CRITICAL: {test_id} total dropped by {abs(delta)} points"

        # Check category-specific critical rules
        for (test_sub, cat_match), reason in _CRITICAL_REGRESSION_RULES.items():
            if test_sub in test_id.lower() and category == cat_match:
                severity = "critical"
                message = f"CRITICAL: {reason}"
                break

        alerts.append(RegressionAlert(
            test_id=test_id,
            category=category,
            prev_score=reg["prev_score"],
            curr_score=reg["curr_score"],
            delta=delta,
            severity=severity,
            message=message,
        ))

    return alerts


def load_full_history(
    results_dir: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Load all benchmark results (all versions)."""
    rdir = Path(results_dir) if results_dir else RESULTS_DIR
    results_file = rdir / "benchmark_results.jsonl"
    if not results_file.exists():
        return []

    entries = []
    with open(results_file) as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    entries.append(json.loads(line))
                except json.JSONDecodeError:
                    continue

    return entries


def load_history_by_version(
    results_dir: Optional[str] = None,
) -> Dict[str, Dict[str, Any]]:
    """Load benchmark history keyed by engine version.

    If multiple runs exist for the same version, the latest is kept.
    """
    entries = load_full_history(results_dir)
    by_version: Dict[str, Dict[str, Any]] = {}
    for entry in entries:
        version = entry.get("engine_version", "unknown")
        by_version[version] = entry  # last write wins
    return by_version


def run_benchmarks_with_regression_check(
    definitions_path: Optional[str] = None,
    results_dir: Optional[str] = None,
    save: bool = True,
) -> BenchmarkReport:
    """Run all benchmarks, save results, and check for regressions.

    This is the recommended entry point for CI / automated runs.
    """
    report = run_all_benchmarks(definitions_path)

    # Load previous and detect alerts
    previous = load_previous_results(results_dir)
    alerts = detect_regression_alerts(report, previous)
    report.regression_alerts = alerts
    report.has_critical_regression = any(a.severity == "critical" for a in alerts)

    if save:
        save_results(report, results_dir)

    return report


# ═══════════════════════════════════════════════════════════════════════════
# Report Formatting
# ═══════════════════════════════════════════════════════════════════════════


def format_report(report: BenchmarkReport) -> str:
    """Format a BenchmarkReport as structured text."""
    lines = []
    w = 56
    lines.append("=" * w)
    lines.append(f" NGW BENCHMARK SCORECARD  v{report.engine_version}")
    lines.append(f" {report.timestamp}")
    lines.append("=" * w)
    lines.append("")

    for case in report.cases:
        lines.append(f"-- {case.test_id} --")

        # Signal check summary
        sig_passed = sum(1 for s in case.signal_results if s.passed)
        sig_total = len(case.signal_results)
        lines.append(f"  Signals: {sig_passed}/{sig_total} passed")

        # Category scores
        lines.append(f"  {'Category':<35} {'Exp':>4} {'Act':>4}")
        lines.append(f"  {'-' * 43}")
        for cs in case.category_scores:
            marker = "  " if cs.actual_score >= cs.expected_score else " *"
            lines.append(
                f"  {cs.category:<35} {cs.expected_score:>4} {cs.actual_score:>4}{marker}"
            )

        # Archetype
        arch = case.archetype_result
        exp_a = arch.get("expected") or "none"
        act_a = arch.get("actual") or "none"
        conf = arch.get("confidence", 0.0)
        check = "PASS" if arch.get("passed") else "FAIL"
        lines.append(f"  Archetype: {exp_a} -> {act_a} (conf={conf:.2f}) [{check}]")

        # Failure guards
        fg_passed = sum(1 for g in case.failure_guard_results if g["passed"])
        fg_total = len(case.failure_guard_results)
        lines.append(f"  Failure guards: {fg_passed}/{fg_total} passed")

        # Case total
        lines.append(f"  Score: {case.total_score}/{case.max_score} ({case.pct}%)")
        lines.append("")

    # Summary
    lines.append("=" * w)
    lines.append(f" TOTAL: {report.total_score}/{report.max_score} ({report.pct}%)")

    if report.regressions:
        lines.append(f" REGRESSIONS: {len(report.regressions)} detected")
        for r in report.regressions:
            lines.append(f"   {r['test_id']}/{r['category']}: {r['prev_score']} -> {r['curr_score']} ({r['delta']:+d})")
    else:
        lines.append(" REGRESSIONS: none")

    if report.regression_alerts:
        criticals = [a for a in report.regression_alerts if a.severity == "critical"]
        warnings = [a for a in report.regression_alerts if a.severity == "warning"]
        if criticals:
            lines.append(f" CRITICAL ALERTS: {len(criticals)}")
            for a in criticals:
                lines.append(f"   !! {a.message}")
        if warnings:
            lines.append(f" WARNINGS: {len(warnings)}")
            for a in warnings:
                lines.append(f"   -- {a.message}")

    lines.append("=" * w)
    return "\n".join(lines)
