"""Gold benchmark scorecard tests for the NGW lighting analysis pipeline.

Runs 5 benchmark cases through the archetype classifier and solver
infrastructure, validates expected signals, scores 10 categories (0-3),
and produces a structured report.

Run with:
    pytest -m benchmark -v -s tests/test_benchmark_scorecard.py
"""
import json
import tempfile
from pathlib import Path

import pytest

from engine.benchmark_scorer import (
    BenchmarkReport,
    build_pass_fixtures,
    check_expected_signals,
    check_failure_guards,
    detect_regressions,
    format_report,
    load_previous_results,
    run_all_benchmarks,
    run_benchmark_case,
    save_results,
)

pytestmark = pytest.mark.benchmark

DEFINITIONS_PATH = Path(__file__).resolve().parent.parent / "data" / "benchmarks" / "benchmark_definitions.json"

# Load definitions once for parametrization
_defs = json.loads(DEFINITIONS_PATH.read_text())
CASE_IDS = [c["test_id"] for c in _defs["benchmark_cases"]]
CASES_BY_ID = {c["test_id"]: c for c in _defs["benchmark_cases"]}


# ═══════════════════════════════════════════════════════════════════════════
# Fixtures
# ═══════════════════════════════════════════════════════════════════════════


@pytest.fixture(scope="module")
def full_report():
    """Run all benchmarks once for the module."""
    return run_all_benchmarks()


# ═══════════════════════════════════════════════════════════════════════════
# Core Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestBenchmarkScorecard:
    """Main benchmark scorecard test suite."""

    def test_all_benchmarks_run(self, full_report):
        """All 5 benchmark cases run without error."""
        assert len(full_report.cases) == 5
        for case in full_report.cases:
            assert case.test_id in CASE_IDS
            assert case.max_score > 0

    def test_overall_score_above_minimum(self, full_report):
        """Total score is above 50% of maximum (basic sanity)."""
        assert full_report.max_score > 0
        assert full_report.pct >= 50.0, (
            f"Overall score {full_report.total_score}/{full_report.max_score} "
            f"({full_report.pct}%) is below 50% minimum"
        )

    @pytest.mark.parametrize("case_id", CASE_IDS)
    def test_signal_checks(self, case_id):
        """All expected signals match the fixture values."""
        case_def = CASES_BY_ID[case_id]
        pass_fixtures = build_pass_fixtures(case_def["expected_signals"])
        results = check_expected_signals(pass_fixtures, case_def["expected_signals"])

        failed = [r for r in results if not r.passed]
        if failed:
            lines = [f"\n  Signal check failures for {case_id}:"]
            for r in failed:
                lines.append(f"    {r.pass_key}.{r.field}: expected={r.expected}, actual={r.actual} ({r.check_type})")
            pytest.fail("\n".join(lines))

    @pytest.mark.parametrize("case_id", CASE_IDS)
    def test_archetype_classification(self, case_id):
        """Archetype classifier returns expected primary archetype."""
        case_def = CASES_BY_ID[case_id]
        result = run_benchmark_case(case_def)
        arch = result.archetype_result

        print(f"\n  [{case_id}] Archetype: expected={arch['expected']}, "
              f"actual={arch['actual']}, confidence={arch.get('confidence', 0):.2f}")
        if arch.get("all_scores"):
            print(f"  All scores: {arch['all_scores']}")
        if arch.get("matched_signals"):
            print(f"  Matched: {arch['matched_signals']}")

        if arch["expected"] is None:
            # Null archetype: pass if no avoided archetype matched AND
            # confidence is not extremely high
            failures_to_avoid = case_def.get("expected_failures_to_avoid", [])
            actual = arch.get("actual")
            assert actual not in failures_to_avoid, (
                f"Avoided archetype '{actual}' was classified as primary"
            )
            # Acceptable: any match with confidence < 0.85, or no match
            confidence = arch.get("confidence", 0.0)
            assert confidence < 0.85 or actual is None, (
                f"Null-expected case matched '{actual}' with very high confidence {confidence:.2f}"
            )
        else:
            assert arch.get("passed"), (
                f"Expected archetype '{arch['expected']}' but got '{arch['actual']}' "
                f"(confidence={arch.get('confidence', 0):.2f})"
            )

    @pytest.mark.parametrize("case_id", CASE_IDS)
    def test_failure_guards(self, case_id):
        """No avoided archetype is the primary classification."""
        case_def = CASES_BY_ID[case_id]
        result = run_benchmark_case(case_def)

        failed_guards = [g for g in result.failure_guard_results if not g["passed"]]
        if failed_guards:
            names = [g["archetype"] for g in failed_guards]
            pytest.fail(
                f"Failure guard violation in {case_id}: "
                f"avoided archetypes {names} matched as primary"
            )

    @pytest.mark.parametrize("case_id", CASE_IDS)
    def test_category_scores(self, case_id):
        """Each category score is within 1 point of expected."""
        case_def = CASES_BY_ID[case_id]
        result = run_benchmark_case(case_def)

        print(f"\n  [{case_id}] Category scores:")
        for cs in result.category_scores:
            marker = "OK" if abs(cs.actual_score - cs.expected_score) <= 1 else "MISS"
            print(f"    {cs.category:<35} exp={cs.expected_score} act={cs.actual_score} [{marker}]")

        misses = [
            cs for cs in result.category_scores
            if abs(cs.actual_score - cs.expected_score) > 1
        ]
        if misses:
            lines = [f"\n  Category score misses for {case_id} (>1 point off):"]
            for cs in misses:
                lines.append(f"    {cs.category}: expected={cs.expected_score}, actual={cs.actual_score}")
            pytest.fail("\n".join(lines))


# ═══════════════════════════════════════════════════════════════════════════
# Report & Storage Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestReportAndStorage:
    """Tests for report formatting, storage, and regression detection."""

    def test_report_formatting(self, full_report):
        """Report contains expected sections."""
        text = format_report(full_report)
        print(f"\n{text}")

        assert "NGW BENCHMARK SCORECARD" in text
        assert "TOTAL:" in text
        assert "REGRESSIONS:" in text
        for case_id in CASE_IDS:
            assert case_id in text

    def test_results_round_trip(self, full_report):
        """Save and load results survive round-trip."""
        with tempfile.TemporaryDirectory() as tmpdir:
            save_results(full_report, results_dir=tmpdir)
            loaded = load_previous_results(results_dir=tmpdir)

            assert loaded is not None
            assert loaded["engine_version"] == full_report.engine_version
            assert loaded["total_score"] == full_report.total_score
            assert loaded["max_score"] == full_report.max_score
            assert len(loaded["cases"]) == len(full_report.cases)

    def test_regression_detection_no_regression(self, full_report):
        """No regressions when comparing report to itself."""
        with tempfile.TemporaryDirectory() as tmpdir:
            save_results(full_report, results_dir=tmpdir)
            previous = load_previous_results(results_dir=tmpdir)
            regs = detect_regressions(full_report, previous)
            assert len(regs) == 0, f"Unexpected regressions: {regs}"

    def test_regression_detection_with_drop(self, full_report):
        """Regression detected when previous scores are higher."""
        # Create a fake previous result with inflated scores
        fake_previous = {
            "engine_version": "0.9.0",
            "cases": [
                {
                    "test_id": full_report.cases[0].test_id,
                    "total_score": full_report.cases[0].total_score + 5,
                    "category_scores": {
                        cs.category: {"expected": cs.expected_score, "actual": cs.actual_score + 1}
                        for cs in full_report.cases[0].category_scores
                    },
                }
            ],
        }
        regs = detect_regressions(full_report, fake_previous)
        assert len(regs) > 0, "Should detect regression vs inflated previous"


# ═══════════════════════════════════════════════════════════════════════════
# Fixture Construction Tests
# ═══════════════════════════════════════════════════════════════════════════


class TestFixtureConstruction:
    """Tests for the fixture building helpers."""

    def test_midpoint_resolution(self):
        """Range specs resolve to midpoint values."""
        signals = {
            "highlight_symmetry": {
                "symmetry_score": {"min": 0.5, "max": 1.0},
                "fill_detected": True,
            }
        }
        fixtures = build_pass_fixtures(signals)
        assert fixtures["highlight_symmetry"]["ok"] is True
        assert fixtures["highlight_symmetry"]["symmetry_score"] == 0.75
        assert fixtures["highlight_symmetry"]["fill_detected"] is True

    def test_all_cases_build_valid_fixtures(self):
        """Every benchmark case produces valid fixture dicts with ok=True."""
        for case_def in _defs["benchmark_cases"]:
            fixtures = build_pass_fixtures(case_def["expected_signals"])
            for pass_key, pass_data in fixtures.items():
                assert pass_data.get("ok") is True, f"{case_def['test_id']}/{pass_key} missing ok=True"

    def test_signal_self_check(self):
        """Fixtures built from expected_signals should pass all signal checks."""
        for case_def in _defs["benchmark_cases"]:
            fixtures = build_pass_fixtures(case_def["expected_signals"])
            results = check_expected_signals(fixtures, case_def["expected_signals"])
            failed = [r for r in results if not r.passed]
            assert not failed, (
                f"{case_def['test_id']}: {len(failed)} self-check failures: "
                + ", ".join(f"{r.pass_key}.{r.field}" for r in failed)
            )
