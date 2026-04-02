"""Tests for Lighting DNA similarity comparison and search.

Tests cover:
1. compare_lighting_dna() — score ranges and edge cases
2. find_closest_setups() — ranking and top-N behavior
3. API endpoint — /lighting-match via TestClient
"""

import pytest
from fastapi.testclient import TestClient

from engine.lighting_dna import (
    LightingDNA,
    compare_lighting_dna,
    find_closest_setups,
    load_all_catalog_dna,
    CATALOG_DIR,
)


# ─── Comparison Tests ────────────────────────────────────────────────────


class TestCompareLightingDNA:
    """Test compare_lighting_dna() score computation."""

    def test_identical_dna_scores_100(self):
        dna = LightingDNA(
            key_angle_deg=45.0,
            key_height_ratio=0.65,
            modifier_type="beauty_dish",
            modifier_size=0.35,
            shadow_softness=0.35,
            highlight_specularity=0.6,
            fill_ratio=0.3,
            negative_fill=True,
            background_gradient=0.2,
            catchlight_shape="round",
            subject_distance_ft=6.5,
            camera_height=0.5,
        )
        score = compare_lighting_dna(dna, dna)
        assert score == 100.0

    def test_completely_different_scores_low(self):
        a = LightingDNA(
            key_angle_deg=0.0,
            key_height_ratio=0.0,
            modifier_type="bare_bulb",
            modifier_size=0.0,
            shadow_softness=0.0,
            highlight_specularity=0.0,
            fill_ratio=0.0,
            negative_fill=False,
            background_gradient=0.0,
            catchlight_shape="round",
            subject_distance_ft=1.0,
            camera_height=0.0,
        )
        b = LightingDNA(
            key_angle_deg=180.0,
            key_height_ratio=1.0,
            modifier_type="diffusion_panel",
            modifier_size=1.0,
            shadow_softness=1.0,
            highlight_specularity=1.0,
            fill_ratio=1.0,
            negative_fill=True,
            background_gradient=1.0,
            catchlight_shape="rectangular",
            subject_distance_ft=20.0,
            camera_height=1.0,
        )
        score = compare_lighting_dna(a, b)
        assert score < 30.0  # very different

    def test_similar_setups_score_high(self):
        """Two slightly different beauty dish setups should score high."""
        a = LightingDNA(
            key_angle_deg=45.0,
            key_height_ratio=0.65,
            modifier_type="beauty_dish",
            modifier_size=0.35,
            shadow_softness=0.35,
            fill_ratio=0.3,
            catchlight_shape="round",
        )
        b = LightingDNA(
            key_angle_deg=50.0,       # 5° difference
            key_height_ratio=0.60,    # slight difference
            modifier_type="beauty_dish",  # same
            modifier_size=0.38,       # minimal difference
            shadow_softness=0.38,     # minimal difference
            fill_ratio=0.25,          # slight difference
            catchlight_shape="round", # same
        )
        score = compare_lighting_dna(a, b)
        assert score > 80.0  # very similar

    def test_modifier_type_bonus(self):
        """Matching modifier_type gives bonus points."""
        base = LightingDNA(
            key_angle_deg=45.0,
            modifier_type="beauty_dish",
            modifier_size=0.35,
        )
        same_mod = LightingDNA(
            key_angle_deg=60.0,
            modifier_type="beauty_dish",  # same
            modifier_size=0.4,
        )
        diff_mod = LightingDNA(
            key_angle_deg=60.0,
            modifier_type="softbox_octa",  # different
            modifier_size=0.4,
        )
        score_same = compare_lighting_dna(base, same_mod)
        score_diff = compare_lighting_dna(base, diff_mod)
        assert score_same > score_diff

    def test_catchlight_shape_bonus(self):
        """Matching catchlight_shape gives bonus points."""
        base = LightingDNA(key_angle_deg=45.0, catchlight_shape="octagonal")
        match = LightingDNA(key_angle_deg=50.0, catchlight_shape="octagonal")
        no_match = LightingDNA(key_angle_deg=50.0, catchlight_shape="rectangular")

        score_match = compare_lighting_dna(base, match)
        score_no = compare_lighting_dna(base, no_match)
        assert score_match > score_no

    def test_unknown_modifier_no_bonus(self):
        """'unknown' modifier_type does not trigger bonus."""
        a = LightingDNA(modifier_type="unknown")
        b = LightingDNA(modifier_type="unknown")
        score_unk = compare_lighting_dna(a, b)
        # Should still score high (defaults match), but no categorical bonus
        assert score_unk > 80.0

    def test_score_always_in_range(self):
        """Score is always 0.0–100.0."""
        pairs = [
            (LightingDNA(), LightingDNA()),
            (
                LightingDNA(key_angle_deg=180.0),
                LightingDNA(key_angle_deg=0.0),
            ),
            (
                LightingDNA(shadow_softness=0.0, modifier_size=0.0),
                LightingDNA(shadow_softness=1.0, modifier_size=1.0),
            ),
        ]
        for a, b in pairs:
            score = compare_lighting_dna(a, b)
            assert 0.0 <= score <= 100.0

    def test_symmetry(self):
        """compare(a, b) == compare(b, a)."""
        a = LightingDNA(key_angle_deg=30.0, fill_ratio=0.5)
        b = LightingDNA(key_angle_deg=90.0, fill_ratio=0.0)
        assert compare_lighting_dna(a, b) == compare_lighting_dna(b, a)

    def test_negative_fill_difference(self):
        """Differing negative_fill slightly reduces score."""
        a = LightingDNA(key_angle_deg=45.0, negative_fill=True)
        b_same = LightingDNA(key_angle_deg=45.0, negative_fill=True)
        b_diff = LightingDNA(key_angle_deg=45.0, negative_fill=False)

        score_same = compare_lighting_dna(a, b_same)
        score_diff = compare_lighting_dna(a, b_diff)
        assert score_same > score_diff


# ─── Search Tests ────────────────────────────────────────────────────────


class TestFindClosestSetups:
    """Test find_closest_setups() ranking."""

    def _make_catalog(self):
        return [
            LightingDNA(
                key_angle_deg=0.0,
                modifier_type="beauty_dish",
                shadow_softness=0.35,
                catchlight_shape="round",
                source_id="clamshell",
                source_name="Clamshell",
            ),
            LightingDNA(
                key_angle_deg=55.0,
                modifier_type="beauty_dish",
                shadow_softness=0.3,
                catchlight_shape="round",
                source_id="rembrandt",
                source_name="Rembrandt",
            ),
            LightingDNA(
                key_angle_deg=90.0,
                modifier_type="grid",
                shadow_softness=0.1,
                catchlight_shape="round",
                source_id="split",
                source_name="Split",
            ),
            LightingDNA(
                key_angle_deg=0.0,
                modifier_type="softbox_octa",
                modifier_size=0.6,
                shadow_softness=0.65,
                catchlight_shape="octagonal",
                source_id="beauty-octa",
                source_name="Beauty Octa",
            ),
        ]

    def test_exact_match_first(self):
        """An exact DNA match should rank first with score 100."""
        catalog = self._make_catalog()
        query = catalog[0]  # exact copy of clamshell
        results = find_closest_setups(query, catalog_dna=catalog, top_n=3)
        assert len(results) == 3
        assert results[0][0].source_id == "clamshell"
        assert results[0][1] == 100.0

    def test_similar_ranked_higher(self):
        """A query close to clamshell should rank clamshell first."""
        catalog = self._make_catalog()
        query = LightingDNA(
            key_angle_deg=5.0,  # close to clamshell's 0
            modifier_type="beauty_dish",
            shadow_softness=0.38,
            catchlight_shape="round",
        )
        results = find_closest_setups(query, catalog_dna=catalog, top_n=4)
        assert results[0][0].source_id == "clamshell"

    def test_top_n_respected(self):
        catalog = self._make_catalog()
        query = LightingDNA()
        results = find_closest_setups(query, catalog_dna=catalog, top_n=2)
        assert len(results) == 2

    def test_top_n_exceeds_catalog(self):
        catalog = self._make_catalog()
        query = LightingDNA()
        results = find_closest_setups(query, catalog_dna=catalog, top_n=100)
        assert len(results) == len(catalog)

    def test_scores_descending(self):
        catalog = self._make_catalog()
        query = LightingDNA(key_angle_deg=30.0, shadow_softness=0.4)
        results = find_closest_setups(query, catalog_dna=catalog, top_n=4)
        scores = [r[1] for r in results]
        assert scores == sorted(scores, reverse=True)

    def test_empty_catalog(self):
        results = find_closest_setups(LightingDNA(), catalog_dna=[], top_n=5)
        assert results == []


# ─── Real Catalog Tests ──────────────────────────────────────────────────


class TestRealCatalogSearch:
    """Test similarity search against actual catalog files."""

    def test_clamshell_query_matches_clamshell(self):
        """A clamshell-like query should match the clamshell catalog entry."""
        if not CATALOG_DIR.exists():
            pytest.skip("Catalog directory not available")

        catalog = load_all_catalog_dna()
        if not catalog:
            pytest.skip("No catalog entries loaded")

        query = LightingDNA(
            key_angle_deg=0.0,
            key_height_ratio=0.6,
            modifier_type="beauty_dish",
            modifier_size=0.35,
            shadow_softness=0.35,
            fill_ratio=0.3,
            catchlight_shape="round",
            camera_height=0.5,
        )
        results = find_closest_setups(query, catalog_dna=catalog, top_n=3)
        assert len(results) > 0
        # The top match should be clamshell-ish
        top_id = results[0][0].source_id
        assert "clamshell" in top_id or results[0][1] > 70.0

    def test_dramatic_query_not_clamshell(self):
        """A dramatic/split query should NOT match clamshell first."""
        if not CATALOG_DIR.exists():
            pytest.skip("Catalog directory not available")

        catalog = load_all_catalog_dna()
        if not catalog:
            pytest.skip("No catalog entries loaded")

        query = LightingDNA(
            key_angle_deg=90.0,
            key_height_ratio=0.5,
            modifier_type="grid",
            modifier_size=0.1,
            shadow_softness=0.1,
            fill_ratio=0.0,
            negative_fill=True,
            catchlight_shape="round",
        )
        results = find_closest_setups(query, catalog_dna=catalog, top_n=3)
        assert len(results) > 0
        top_id = results[0][0].source_id
        assert "clamshell" not in top_id


# ─── API Endpoint Tests ─────────────────────────────────────────────────


class TestLightingMatchEndpoint:
    """Test POST /api/lighting-match endpoint."""

    @pytest.fixture
    def client(self):
        from main import app
        return TestClient(app)

    def test_match_with_dna(self, client):
        response = client.post("/api/lighting-match", json={
            "dna": {
                "key_angle_deg": 45.0,
                "key_height_ratio": 0.65,
                "modifier_type": "beauty_dish",
                "modifier_size": 0.35,
                "shadow_softness": 0.35,
                "highlight_specularity": 0.6,
                "fill_ratio": 0.3,
                "negative_fill": False,
                "background_gradient": 0.2,
                "catchlight_shape": "round",
                "subject_distance_ft": 6.5,
                "camera_height": 0.5,
            },
            "top_n": 3,
        })
        assert response.status_code == 200
        data = response.json()
        assert "query_dna" in data
        assert "matches" in data
        assert len(data["matches"]) <= 3
        assert data["catalog_size"] > 0
        # Each match has required fields
        for match in data["matches"]:
            assert "source_id" in match
            assert "source_name" in match
            assert "similarity_score" in match
            assert 0.0 <= match["similarity_score"] <= 100.0

    def test_match_with_analysis(self, client):
        response = client.post("/api/lighting-match", json={
            "analysis": {
                "vlm_signals": {
                    "reconstruction": {
                        "key_light_angle_deg": 45.0,
                        "key_light_height": "high",
                        "modifier_size_class": "medium",
                    },
                    "shadows": {"shadow_softness": 0.4},
                    "catchlights": {"catchlight_shape": "round"},
                },
                "lighting_read": {"fill_presence": "subtle"},
            },
            "top_n": 5,
        })
        assert response.status_code == 200
        data = response.json()
        assert len(data["matches"]) <= 5

    def test_match_no_input_422(self, client):
        response = client.post("/api/lighting-match", json={})
        assert response.status_code == 422

    def test_match_invalid_dna_422(self, client):
        response = client.post("/api/lighting-match", json={
            "dna": {"bogus_field": "bad"},
        })
        assert response.status_code == 422

    def test_match_default_top_n(self, client):
        response = client.post("/api/lighting-match", json={
            "dna": {"key_angle_deg": 0.0},
        })
        assert response.status_code == 200
        data = response.json()
        assert len(data["matches"]) <= 5  # default top_n

    def test_scores_sorted_descending(self, client):
        response = client.post("/api/lighting-match", json={
            "dna": {"key_angle_deg": 30.0, "shadow_softness": 0.5},
            "top_n": 10,
        })
        assert response.status_code == 200
        scores = [m["similarity_score"] for m in response.json()["matches"]]
        assert scores == sorted(scores, reverse=True)
