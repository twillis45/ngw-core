"""Tests for benchmark regression detection enhancements."""

import json
import tempfile
from pathlib import Path

import pytest

from engine.benchmark_scorer import (
    BenchmarkCaseResult,
    BenchmarkReport,
    CategoryScore,
    RegressionAlert,
    detect_regression_alerts,
    load_full_history,
    load_history_by_version,
    save_results,
)

pytestmark = pytest.mark.benchmark


def _make_case(test_id, total_score, category_scores=None):
    cats = []
    if category_scores:
        for name, actual in category_scores.items():
            cats.append(CategoryScore(
                category=name,
                expected_score=3,
                actual_score=actual,
            ))
    return BenchmarkCaseResult(
        test_id=test_id,
        engine_version="1.0.0",
        timestamp="2026-01-01T00:00:00Z",
        category_scores=cats,
        total_score=total_score,
        max_score=30,
    )


def _make_previous(cases_data):
    """Build a previous result dict from list of (test_id, total, categories)."""
    cases = []
    for test_id, total, cats in cases_data:
        cases.append({
            "test_id": test_id,
            "total_score": total,
            "category_scores": {
                name: {"expected": 3, "actual": actual}
                for name, actual in cats.items()
            },
        })
    return {"cases": cases}


class TestDetectRegressionAlerts:

    def test_no_previous_returns_empty(self):
        report = BenchmarkReport(cases=[_make_case("test_01", 25)])
        alerts = detect_regression_alerts(report, None)
        assert alerts == []

    def test_no_regression_returns_empty(self):
        current = BenchmarkReport(cases=[
            _make_case("test_01", 25, {"catchlight_accuracy": 3}),
        ])
        previous = _make_previous([
            ("test_01", 25, {"catchlight_accuracy": 3}),
        ])
        alerts = detect_regression_alerts(current, previous)
        assert alerts == []

    def test_improvement_returns_empty(self):
        current = BenchmarkReport(cases=[
            _make_case("test_01", 28, {"catchlight_accuracy": 3}),
        ])
        previous = _make_previous([
            ("test_01", 25, {"catchlight_accuracy": 2}),
        ])
        alerts = detect_regression_alerts(current, previous)
        assert alerts == []

    def test_small_drop_is_warning(self):
        current = BenchmarkReport(cases=[
            _make_case("test_01", 24, {"catchlight_accuracy": 2}),
        ])
        previous = _make_previous([
            ("test_01", 25, {"catchlight_accuracy": 3}),
        ])
        alerts = detect_regression_alerts(current, previous)
        assert len(alerts) >= 1
        cat_alert = next(a for a in alerts if a.category == "catchlight_accuracy")
        assert cat_alert.severity == "warning"

    def test_large_total_drop_is_critical(self):
        current = BenchmarkReport(cases=[
            _make_case("test_01", 20),
        ])
        previous = _make_previous([
            ("test_01", 25, {}),
        ])
        alerts = detect_regression_alerts(current, previous)
        total_alert = next(a for a in alerts if a.category == "_total")
        assert total_alert.severity == "critical"
        assert total_alert.delta == -5

    def test_reflective_false_multi_light_is_critical(self):
        current = BenchmarkReport(cases=[
            _make_case("test_05_reflective_fashion_contamination", 20,
                       {"false_multi_light_prevention": 1}),
        ])
        previous = _make_previous([
            ("test_05_reflective_fashion_contamination", 22,
             {"false_multi_light_prevention": 3}),
        ])
        alerts = detect_regression_alerts(current, previous)
        cat_alert = next(
            a for a in alerts
            if a.category == "false_multi_light_prevention"
        )
        assert cat_alert.severity == "critical"

    def test_karsh_direction_is_critical(self):
        current = BenchmarkReport(cases=[
            _make_case("test_03_karsh_rembrandt_portrait", 20,
                       {"key_direction_accuracy": 1}),
        ])
        previous = _make_previous([
            ("test_03_karsh_rembrandt_portrait", 22,
             {"key_direction_accuracy": 3}),
        ])
        alerts = detect_regression_alerts(current, previous)
        cat_alert = next(
            a for a in alerts
            if a.category == "key_direction_accuracy"
        )
        assert cat_alert.severity == "critical"


class TestHistoryStorage:

    def test_save_and_load_history(self):
        with tempfile.TemporaryDirectory() as tmp:
            report1 = BenchmarkReport(
                cases=[_make_case("test_01", 25)],
                engine_version="1.0.0",
                timestamp="2026-01-01",
                total_score=25,
                max_score=30,
            )
            report2 = BenchmarkReport(
                cases=[_make_case("test_01", 27)],
                engine_version="1.1.0",
                timestamp="2026-01-15",
                total_score=27,
                max_score=30,
            )

            save_results(report1, tmp)
            save_results(report2, tmp)

            history = load_full_history(tmp)
            assert len(history) == 2
            assert history[0]["engine_version"] == "1.0.0"
            assert history[1]["engine_version"] == "1.1.0"

    def test_load_by_version(self):
        with tempfile.TemporaryDirectory() as tmp:
            report1 = BenchmarkReport(
                engine_version="1.0.0", timestamp="2026-01-01",
                total_score=20, max_score=30,
            )
            report2 = BenchmarkReport(
                engine_version="1.1.0", timestamp="2026-01-15",
                total_score=25, max_score=30,
            )
            save_results(report1, tmp)
            save_results(report2, tmp)

            by_version = load_history_by_version(tmp)
            assert "1.0.0" in by_version
            assert "1.1.0" in by_version
            assert by_version["1.0.0"]["total_score"] == 20
            assert by_version["1.1.0"]["total_score"] == 25

    def test_load_empty_dir(self):
        with tempfile.TemporaryDirectory() as tmp:
            assert load_full_history(tmp) == []
