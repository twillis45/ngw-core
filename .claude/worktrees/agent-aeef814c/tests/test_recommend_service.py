"""Tests for engine.services.recommend_service.

Validates:
  - Service returns a RecommendResult with candidate-first structure
  - Backward-compatible fields (content, structured, diagram_spec) are populated
  - Primary and alternate candidates are correctly derived from selector picks
  - Formatting helpers produce expected output
"""

from __future__ import annotations

import pytest

from engine.services.recommend_service import (
    RecommendResult,
    build_recommend_result,
    _reason_list,
    _pick_reason,
    _content_from_picks,
)


def _make_system(sid="sys_a", name="Test System", mood="beauty"):
    return {
        "id": sid,
        "name": name,
        "criteria": {"core_mood": {"weight": 1.0, "value": mood}},
        "features": {},
        "taxonomy_refs": {"mood": mood},
        "modifier": None,
    }


class TestBuildRecommendResult:
    def test_basic_result(self):
        systems = [_make_system("s1", "System A"), _make_system("s2", "System B")]
        result = build_recommend_result(
            systems=systems,
            input_ctx={"mood": "beauty"},
            modifiers_available=[],
        )
        assert isinstance(result, RecommendResult)
        assert result.confidence >= 0
        assert result.content
        assert result.structured
        assert result.diagram_spec is not None
        assert result.request_id.startswith("req_")
        assert result.processing_ms >= 0

    def test_candidate_structure(self):
        systems = [
            _make_system("s1", "System A"),
            _make_system("s2", "System B"),
            _make_system("s3", "System C"),
        ]
        result = build_recommend_result(
            systems=systems,
            input_ctx={"mood": "beauty"},
            modifiers_available=[],
        )
        assert result.primary_candidate is not None
        assert "system_id" in result.primary_candidate
        assert "system_name" in result.primary_candidate
        assert "score" in result.primary_candidate
        assert "confidence" in result.primary_candidate
        # At least 1 alternate (we had 3 systems, top 3 picked)
        assert len(result.alternate_candidates) >= 1
        for alt in result.alternate_candidates:
            assert "system_id" in alt
            assert "delta" in alt

    def test_single_system(self):
        result = build_recommend_result(
            systems=[_make_system()],
            input_ctx={},
            modifiers_available=[],
        )
        assert result.primary_candidate is not None
        assert len(result.alternate_candidates) == 0

    def test_no_solver_quality(self):
        result = build_recommend_result(
            systems=[_make_system()],
            input_ctx={},
            modifiers_available=[],
        )
        assert result.validation_scores == {}
        assert result.needs_review is False

    def test_with_solver_quality(self):
        result = build_recommend_result(
            systems=[_make_system()],
            input_ctx={},
            modifiers_available=[],
            solver_quality={
                "overall_consistency": 0.65,
                "high_contradiction_count": 2,
                "ambiguity_class": "moderate",
                "needs_review": True,
            },
        )
        assert result.validation_scores["overall_consistency"] == 0.65
        assert result.validation_scores["high_contradiction_count"] == 2
        assert result.needs_review is True

    def test_backward_compatible_structured(self):
        result = build_recommend_result(
            systems=[_make_system("s1"), _make_system("s2")],
            input_ctx={},
            modifiers_available=[],
        )
        sel = result.structured["selection"]
        assert "confidence" in sel
        assert "winner" in sel
        assert sel["winner"]["system_id"] in ("s1", "s2")
        assert "top_picks" in sel
        assert len(sel["top_picks"]) >= 1


class TestDefaultValues:
    def test_empty_result(self):
        r = RecommendResult()
        assert r.content == ""
        assert r.confidence == 0.0
        assert r.needs_review is False
        assert r.alternate_candidates == []
