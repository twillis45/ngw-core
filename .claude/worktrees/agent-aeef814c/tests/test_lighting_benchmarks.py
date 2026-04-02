"""5-image lighting pipeline benchmark test set.

Validates archetype classification, signal accuracy, and solver consistency
for representative lighting scenarios.

Run with: .venv/bin/python -m pytest -m benchmark -v -s tests/test_lighting_benchmarks.py
"""
import time
from typing import Dict, Any, Optional

import pytest

from tests.benchmark_fixtures import (
    BenchmarkCase,
    SignalChecker,
    load_all_cases,
)
from engine.archetype_classifier import classify_archetype
from engine.consistency_engine import score_consistency
from engine.contradiction_engine import find_contradictions
from engine.consensus_solver import solve_dominant_source
from engine.signal_weights import compute_pass_weights
from engine.solver_models import PassWeightProfile

pytestmark = pytest.mark.benchmark

# ── Fixtures ──────────────────────────────────────────────

BENCHMARK_CASES = load_all_cases()
CHECKER = SignalChecker()


def _case_ids():
    return list(BENCHMARK_CASES.keys())


@pytest.fixture(params=_case_ids())
def benchmark_case(request) -> BenchmarkCase:
    """Yield each benchmark case in turn."""
    return BENCHMARK_CASES[request.param]


def _build_pass_weights() -> PassWeightProfile:
    """Build default pass weights (no vision data → all defaults)."""
    return compute_pass_weights()


# ── Output Helpers ────────────────────────────────────────

def _banner(case: BenchmarkCase):
    width = 60
    print(f"\n{'=' * width}")
    print(f"  BENCHMARK: {case.test_id}")
    print(f"  Category:  {case.category}")
    print(f"  {case.description}")
    print(f"{'=' * width}")


def _print_pass_outputs(case: BenchmarkCase):
    """Print key signal values from each pass fixture."""
    print("\n─── Pass Outputs ───")
    # Passes that carry archetype-relevant signals
    display_keys = [
        "catchlight_topology", "highlight_symmetry", "highlight_axis_map",
        "continuous_source", "off_axis_key", "light_structure",
        "bounce_contributor", "separation_light",
    ]
    for pk in display_keys:
        data = case.pass_fixtures.get(pk)
        if not data:
            continue
        parts = []
        for k, v in data.items():
            if k in ("ok", "confidence", "notes"):
                continue
            if isinstance(v, float):
                parts.append(f"{k}={v:.2f}")
            elif isinstance(v, list):
                parts.append(f"{k}=[{len(v)} items]")
            else:
                parts.append(f"{k}={v}")
        line = "  ".join(parts)
        print(f"  {pk:28s}  {line}")


def _print_signal_results(result):
    """Print per-signal validation results."""
    print("\n─── Signal Validation ───")
    for sr in result.details:
        status = "[SKIP]" if sr.skipped else ("[PASS]" if sr.passed else "[FAIL]")
        actual_str = f" (actual={sr.actual!r})" if not sr.passed and not sr.skipped else ""
        reason_str = f" — {sr.reason}" if sr.skipped else ""
        print(f"  {status} {sr.description}{actual_str}{reason_str}")
    print(f"  Result: {result.passed}/{result.total} signals passed"
          + (f", {result.skipped} skipped" if result.skipped else ""))


def _print_archetype(classification):
    """Print archetype classification results."""
    print("\n─── Archetype Classification ───")
    if classification.primary_archetype:
        print(f"  Primary:   {classification.primary_archetype}"
              f" ({classification.primary_confidence * 100:.1f}%)")
    else:
        print("  Primary:   None (no archetype matched)")
    if classification.secondary_archetype:
        print(f"  Secondary: {classification.secondary_archetype}"
              f" ({classification.secondary_confidence * 100:.1f}%)")
    if classification.matched_signals:
        print(f"  Matched:   {', '.join(classification.matched_signals)}")
    if classification.unmatched_signals:
        print(f"  Unmatched: {', '.join(classification.unmatched_signals)}")
    if classification.all_scores:
        scores = sorted(classification.all_scores.items(), key=lambda x: -x[1])
        line = ", ".join(f"{k}={v:.2f}" for k, v in scores)
        print(f"  All scores: {line}")


def _print_solver(consistency_scores, contradiction_report, consensus):
    """Print solver results."""
    print("\n─── Solver Results ───")
    print("  Consistency:")
    for cs in consistency_scores:
        print(f"    {cs.dimension:20s}  {cs.score:.2f}  ({cs.total_pairs} pairs)")
    print(f"  Contradictions: {contradiction_report.high_severity_count} high, "
          f"{len(contradiction_report.contradictions)} total → "
          f"ambiguity={contradiction_report.ambiguity_class}")
    if contradiction_report.contradictions:
        for c in contradiction_report.contradictions[:3]:
            print(f"    [{c.severity}] {c.dimension}: {c.pass_a}={c.value_a} vs {c.pass_b}={c.value_b}")
    print(f"  Consensus:")
    if consensus.dominant_direction_deg is not None:
        print(f"    direction: {consensus.dominant_direction_deg:.0f}°")
    if consensus.dominant_height_class:
        print(f"    height:    {consensus.dominant_height_class}")
    if consensus.dominant_modifier:
        print(f"    modifier:  {consensus.dominant_modifier}")
    if consensus.dominant_light_count is not None:
        print(f"    count:     {consensus.dominant_light_count}")
    print(f"    overall_agreement: {consensus.overall_agreement:.2f}")


# ── Layer A Tests: Signal Validation ──────────────────────

class TestLightingBenchmarkSuite:
    """5-image lighting pipeline benchmark test set.

    Layer A: deterministic tests using fixture dicts.
    Layer B: optional pipeline throughput test.
    """

    def test_expected_signals(self, benchmark_case):
        """Validate all expected signals match the fixture data."""
        _banner(benchmark_case)
        _print_pass_outputs(benchmark_case)

        result = CHECKER.check_all(
            benchmark_case.pass_fixtures,
            benchmark_case.expected_signals,
        )
        _print_signal_results(result)

        assert result.all_passed, (
            f"[{benchmark_case.test_id}] {result.failed} signal(s) failed: "
            + ", ".join(
                sr.description for sr in result.details
                if not sr.passed and not sr.skipped
            )
        )

    def test_archetype_classification(self, benchmark_case):
        """Verify archetype classifier produces expected primary archetype."""
        pf = benchmark_case.pass_fixtures

        classification = classify_archetype(
            catchlight_topology=pf.get("catchlight_topology"),
            highlight_symmetry=pf.get("highlight_symmetry"),
            highlight_axis_map=pf.get("highlight_axis_map"),
            off_axis_key=pf.get("off_axis_key"),
            light_structure=pf.get("light_structure"),
            separation_light=pf.get("separation_light"),
            bounce_contributor=pf.get("bounce_contributor"),
            continuous_source=pf.get("continuous_source"),
        )

        _print_archetype(classification)

        if benchmark_case.expected_archetype is not None:
            assert classification.primary_archetype == benchmark_case.expected_archetype, (
                f"[{benchmark_case.test_id}] Expected archetype "
                f"'{benchmark_case.expected_archetype}', got "
                f"'{classification.primary_archetype}'"
                f" (confidence={classification.primary_confidence:.2f})"
            )
        else:
            # If no archetype expected, verify low-to-moderate confidence or None.
            # Weak matches are acceptable (e.g., heisler at ~66% for window light)
            if classification.primary_archetype is not None:
                assert classification.primary_confidence < 0.75, (
                    f"[{benchmark_case.test_id}] Expected no strong archetype, "
                    f"got '{classification.primary_archetype}' at "
                    f"{classification.primary_confidence:.2f} confidence"
                )

    def test_solver_consistency(self, benchmark_case):
        """Verify solver produces consistent, non-contradictory results."""
        pf = benchmark_case.pass_fixtures
        pass_weights = _build_pass_weights()

        # Build solver-format pass_outputs (keyed by _pass suffix names)
        solver_outputs = {}
        # Map fixture keys to solver-expected keys
        key_map = {
            "shadow_pass": "shadow_pass",
            "catchlight_pass": "catchlight_pass",
            "environment_light_pass": "environment_light_pass",
        }
        for fixture_key, solver_key in key_map.items():
            if fixture_key in pf:
                solver_outputs[solver_key] = pf[fixture_key]

        # Run solver components
        consistency_scores = score_consistency(solver_outputs, pass_weights)
        contradiction_report = find_contradictions(solver_outputs)
        consensus = solve_dominant_source(solver_outputs, pass_weights)

        _print_solver(consistency_scores, contradiction_report, consensus)

        # Well-formed benchmark fixtures should not produce high-severity contradictions
        assert contradiction_report.high_severity_count == 0, (
            f"[{benchmark_case.test_id}] {contradiction_report.high_severity_count} "
            f"high-severity contradictions found in benchmark fixture"
        )

    def test_failures_to_avoid(self, benchmark_case):
        """Verify expected-wrong archetypes are NOT classified as primary."""
        if not benchmark_case.expected_failures_to_avoid:
            pytest.skip("No failures-to-avoid specified")
            return

        pf = benchmark_case.pass_fixtures
        classification = classify_archetype(
            catchlight_topology=pf.get("catchlight_topology"),
            highlight_symmetry=pf.get("highlight_symmetry"),
            highlight_axis_map=pf.get("highlight_axis_map"),
            off_axis_key=pf.get("off_axis_key"),
            light_structure=pf.get("light_structure"),
            separation_light=pf.get("separation_light"),
            bounce_contributor=pf.get("bounce_contributor"),
            continuous_source=pf.get("continuous_source"),
        )

        if classification.primary_archetype:
            assert classification.primary_archetype not in benchmark_case.expected_failures_to_avoid, (
                f"[{benchmark_case.test_id}] Classified as "
                f"'{classification.primary_archetype}' which is in the "
                f"failures-to-avoid list: {benchmark_case.expected_failures_to_avoid}"
            )


# ── Layer B: Pipeline Throughput ──────────────────────────

class TestPipelineThroughput:
    """Optional pipeline throughput benchmark (requires cv2)."""

    def test_pipeline_structural_completeness(self):
        """Run pipeline on a gradient image and verify all expected keys present."""
        try:
            import numpy as np
        except ImportError:
            pytest.skip("numpy not available")
            return

        try:
            from engine.vision_passes import run_extended_pipeline
        except ImportError:
            pytest.skip("engine.vision_passes not importable (cv2 missing?)")
            return

        # Simple gradient test image (BGR)
        img = np.zeros((400, 300, 3), dtype=np.uint8)
        # Add a soft gradient (simulating directional light)
        for y in range(400):
            for x in range(300):
                val = int(128 + 80 * (x / 300) - 40 * (y / 400))
                val = max(0, min(255, val))
                img[y, x] = [val, val, val]

        iterations = 3
        t0 = time.perf_counter()
        for _ in range(iterations):
            result = run_extended_pipeline(img)
        elapsed = time.perf_counter() - t0

        per_call_ms = (elapsed / iterations) * 1000
        print(f"\n  Pipeline throughput: {per_call_ms:.1f}ms/call ({iterations} iterations)")

        # Verify expected keys (new passes should be present)
        expected_keys = [
            "catchlight_topology",
            "highlight_axis_map",
            "highlight_symmetry",
            "continuous_source",
            "bounce_contributor",
            "separation_light",
            "off_axis_key",
            "light_structure",
        ]
        for key in expected_keys:
            assert key in result, f"Missing expected pipeline key: '{key}'"
            assert isinstance(result[key], dict), f"'{key}' should be a dict, got {type(result[key])}"
