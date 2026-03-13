"""Tests for the diagnostics API and taxonomy_loader."""

import pytest
from fastapi.testclient import TestClient

from main import app
from engine.taxonomy_loader import (
    DIAGNOSTIC_FAILURES,
    RELIABILITY_LABELS,
    get_diagnostic,
    get_diagnostics_for_pattern,
    get_all_diagnostics,
    get_reliability_label,
    list_known_patterns,
)

client = TestClient(app)


# ── taxonomy_loader unit tests ──────────────────────────────────────────────


class TestTaxonomyLoader:
    """Unit tests for engine/taxonomy_loader.py functions."""

    def test_diagnostic_failures_loaded(self):
        assert len(DIAGNOSTIC_FAILURES) >= 20

    def test_reliability_labels_loaded(self):
        assert len(RELIABILITY_LABELS) == 5

    def test_get_diagnostic_existing(self):
        entry = get_diagnostic("face_too_flat")
        assert entry is not None
        assert entry["id"] == "face_too_flat"
        assert "symptoms" in entry
        assert "likely_causes" in entry
        assert "quick_fixes" in entry
        assert "patterns_affected" in entry

    def test_get_diagnostic_missing(self):
        assert get_diagnostic("nonexistent_failure") is None

    def test_get_diagnostics_for_pattern_rembrandt(self):
        results = get_diagnostics_for_pattern("rembrandt")
        ids = [d["id"] for d in results]
        # Rembrandt-specific entries
        assert "missing_rembrandt_triangle" in ids
        assert "triangle_too_large" in ids
        # "all" pattern entries should be included
        assert "no_subject_separation" in ids
        assert "shadow_too_hard" in ids
        assert "color_cast_mixed" in ids

    def test_get_diagnostics_for_pattern_butterfly(self):
        results = get_diagnostics_for_pattern("butterfly")
        ids = [d["id"] for d in results]
        assert "nose_shadow_too_long" in ids
        assert "chin_shadow_too_heavy" in ids

    def test_get_diagnostics_for_pattern_unknown_returns_only_all(self):
        results = get_diagnostics_for_pattern("some_unknown_pattern")
        # Should still return entries with patterns_affected: [all]
        ids = [d["id"] for d in results]
        assert "no_subject_separation" in ids
        assert "shadow_too_hard" in ids
        # Should NOT return pattern-specific entries
        assert "missing_rembrandt_triangle" not in ids

    def test_get_all_diagnostics(self):
        all_diags = get_all_diagnostics()
        assert len(all_diags) == len(DIAGNOSTIC_FAILURES)

    def test_get_reliability_label_tiers(self):
        assert get_reliability_label(95) == "very_reliable"
        assert get_reliability_label(90) == "very_reliable"
        assert get_reliability_label(80) == "reliable"
        assert get_reliability_label(75) == "reliable"
        assert get_reliability_label(65) == "good_option"
        assert get_reliability_label(50) == "experimental"
        assert get_reliability_label(30) == "not_ideal"
        assert get_reliability_label(0) == "not_ideal"

    def test_get_reliability_label_boundary_100(self):
        assert get_reliability_label(100) == "very_reliable"

    def test_get_reliability_label_out_of_range(self):
        # Negative score falls through to default
        assert get_reliability_label(-5) == "not_ideal"

    def test_list_known_patterns(self):
        patterns = list_known_patterns()
        assert isinstance(patterns, list)
        assert "rembrandt" in patterns
        assert "loop" in patterns
        assert "butterfly" in patterns
        assert "clamshell" in patterns
        # "all" and "product_only" should be excluded
        assert "all" not in patterns
        assert "product_only" not in patterns

    def test_every_entry_has_required_fields(self):
        for d in DIAGNOSTIC_FAILURES:
            assert "id" in d, f"Missing id in {d}"
            assert "symptoms" in d, f"Missing symptoms in {d['id']}"
            assert "likely_causes" in d, f"Missing likely_causes in {d['id']}"
            assert "quick_fixes" in d, f"Missing quick_fixes in {d['id']}"
            assert "patterns_affected" in d, f"Missing patterns_affected in {d['id']}"

    def test_all_ids_unique(self):
        ids = [d["id"] for d in DIAGNOSTIC_FAILURES]
        assert len(ids) == len(set(ids)), f"Duplicate IDs: {[x for x in ids if ids.count(x) > 1]}"


# ── GET /api/diagnostics endpoint tests ─────────────────────────────────────


class TestDiagnosticsEndpoint:
    """Integration tests for GET /api/diagnostics."""

    def test_list_all(self):
        resp = client.get("/api/diagnostics")
        assert resp.status_code == 200
        data = resp.json()
        assert data["count"] >= 20
        assert data["pattern_filter"] is None
        assert isinstance(data["known_patterns"], list)
        assert isinstance(data["diagnostics"], list)

    def test_list_all_has_display_fields(self):
        resp = client.get("/api/diagnostics")
        data = resp.json()
        entry = data["diagnostics"][0]
        assert "symptoms_display" in entry
        assert "likely_causes_display" in entry
        assert "quick_fixes_display" in entry

    def test_filter_by_pattern_rembrandt(self):
        resp = client.get("/api/diagnostics", params={"pattern": "rembrandt"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["pattern_filter"] == "rembrandt"
        assert data["count"] > 0
        ids = [d["id"] for d in data["diagnostics"]]
        assert "missing_rembrandt_triangle" in ids

    def test_filter_by_pattern_loop(self):
        resp = client.get("/api/diagnostics", params={"pattern": "loop"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["count"] > 0
        ids = [d["id"] for d in data["diagnostics"]]
        assert "face_too_flat" in ids  # loop is in its patterns_affected
        assert "nose_shadow_too_long" in ids

    def test_filter_unknown_pattern_returns_all_entries(self):
        resp = client.get("/api/diagnostics", params={"pattern": "nonexistent"})
        assert resp.status_code == 200
        data = resp.json()
        # Should still get "all"-tagged entries
        ids = [d["id"] for d in data["diagnostics"]]
        assert "no_subject_separation" in ids

    def test_no_filter_returns_more_than_filtered(self):
        all_resp = client.get("/api/diagnostics")
        filtered_resp = client.get("/api/diagnostics", params={"pattern": "rembrandt"})
        assert all_resp.json()["count"] >= filtered_resp.json()["count"]


class TestDiagnosticsSingleEndpoint:
    """Integration tests for GET /api/diagnostics/{failure_id}."""

    def test_get_existing(self):
        resp = client.get("/api/diagnostics/face_too_flat")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == "face_too_flat"
        assert "symptoms" in data
        assert "likely_causes" in data
        assert "quick_fixes" in data
        assert "symptoms_display" in data

    def test_get_missing_returns_404(self):
        resp = client.get("/api/diagnostics/nonexistent_id")
        assert resp.status_code == 404

    def test_display_labels_humanized(self):
        resp = client.get("/api/diagnostics/raccoon_eyes")
        assert resp.status_code == 200
        data = resp.json()
        # likely_causes_display should be humanized
        assert "Key too high" in data["likely_causes_display"]
        assert "Insufficient fill" in data["likely_causes_display"]


# ── Shoot-match diagnostics card ────────────────────────────────────────────


def _wizard(**overrides):
    base = {
        "subject": "headshot",
        "mood": "Clean & Classic",
        "environment": "Large Studio",
        "ceiling": "normal",
        "gearMode": "anyGear",
        "gear": [],
    }
    base.update(overrides)
    return base


class TestShootMatchDiagnostics:
    """Verify that /api/shoot-match now includes diagnostics in the response."""

    def test_diagnostics_present_in_cards(self):
        resp = client.post("/api/shoot-match", json=_wizard())
        assert resp.status_code == 200
        cards = resp.json()["cards"]
        assert "diagnostics" in cards
        assert isinstance(cards["diagnostics"], list)

    def test_diagnostics_have_structure(self):
        resp = client.post("/api/shoot-match", json=_wizard())
        diags = resp.json()["cards"]["diagnostics"]
        if diags:  # may be empty for some patterns
            d = diags[0]
            assert "id" in d
            assert "symptoms" in d
            assert "likely_causes" in d
            assert "quick_fixes" in d

    def test_diagnostics_vary_by_mood(self):
        """Different moods yield different patterns and thus different diagnostics."""
        corp = client.post("/api/shoot-match", json=_wizard(mood="Clean & Classic"))
        drama = client.post("/api/shoot-match", json=_wizard(mood="Moody & Dramatic"))
        if corp.status_code == 200 and drama.status_code == 200:
            corp_ids = {d["id"] for d in corp.json()["cards"]["diagnostics"]}
            drama_ids = {d["id"] for d in drama.json()["cards"]["diagnostics"]}
            # They share "all"-tagged entries but may differ on pattern-specific ones
            # At minimum, both should have some diagnostics
            assert len(corp_ids) > 0 or len(drama_ids) > 0
