"""Tests for engine/selector.py

Covers:
  Fix #8  — tie-breaking produces explicit tie annotation in reasons
  Edge    — single system, identical systems, ranking order
"""

import pytest

from engine.selector import select_best_system


# ── Helpers ──────────────────────────────────────────────────────────────────

def _sys(id_: str, brightness: float = 5000, modifier: float | None = None, **feats) -> dict:
    s: dict = {
        "id": id_,
        "name": f"System {id_}",
        "criteria": {
            "brightness": brightness,
            "energy_efficiency": 100,
            "color_accuracy": 90,
            "lifespan_hours": 25000,
            "cost_effectiveness": 70,
        },
        "features": feats,
    }
    if modifier is not None:
        s["modifier"] = modifier
    return s


# ── Basic selection ──────────────────────────────────────────────────────────

class TestBasicSelection:
    def test_single_system(self):
        result = select_best_system([_sys("only")])
        assert result.winner.system_id == "only"
        assert result.total_candidates == 1
        assert len(result.rankings) == 1
        # No runner-up reason
        assert not any("Runner-up" in r for r in result.reasons)
        assert not any("Tie" in r for r in result.reasons)

    def test_clear_winner(self):
        systems = [_sys("weak", brightness=1000), _sys("strong", brightness=9000)]
        result = select_best_system(systems)
        assert result.winner.system_id == "strong"
        assert result.rankings[0].rank == 1
        assert result.rankings[1].rank == 2

    def test_empty_list_raises(self):
        with pytest.raises(ValueError, match="empty"):
            select_best_system([])


# ── Tie-breaking (Fix #8) ────────────────────────────────────────────────────

class TestTieBreaking:
    def test_identical_systems_tie_by_id(self):
        """When scores are equal, the lexicographically smaller id wins."""
        a = _sys("alpha")
        b = _sys("beta")
        result = select_best_system([b, a])  # intentionally reversed input
        assert result.winner.system_id == "alpha"
        # Reason should mention the tie explicitly
        tie_reasons = [r for r in result.reasons if "Tie" in r]
        assert len(tie_reasons) == 1
        assert "lexicographic" in tie_reasons[0]

    def test_tie_reason_contains_both_names(self):
        a = _sys("aaa")
        b = _sys("bbb")
        result = select_best_system([a, b])
        tie_reasons = [r for r in result.reasons if "Tie" in r]
        assert "System bbb" in tie_reasons[0]

    def test_non_tie_uses_margin_reason(self):
        weak = _sys("a", brightness=1000)
        strong = _sys("b", brightness=9000)
        result = select_best_system([weak, strong])
        assert any("margin" in r for r in result.reasons)
        assert not any("Tie" in r for r in result.reasons)


# ── Determinism ──────────────────────────────────────────────────────────────

class TestSelectorDeterminism:
    def test_order_independent(self):
        """Result must be identical regardless of input order."""
        systems = [_sys("c", brightness=3000), _sys("a", brightness=9000), _sys("b", brightness=6000)]
        r1 = select_best_system(systems)
        r2 = select_best_system(list(reversed(systems)))
        assert r1.winner.system_id == r2.winner.system_id
        assert r1.winner.final_score == r2.winner.final_score
        assert [rc.breakdown.system_id for rc in r1.rankings] == [
            rc.breakdown.system_id for rc in r2.rankings
        ]


# ── Reasons completeness ────────────────────────────────────────────────────

class TestReasonsCompleteness:
    def test_reasons_cover_all_sections(self):
        systems = [_sys("a", dimmable=True, smart_ready=True), _sys("b", brightness=9000)]
        result = select_best_system(systems)
        reasons_text = " ".join(result.reasons)
        assert "selected" in reasons_text
        assert "modifier" in reasons_text.lower() or "fallback" in reasons_text.lower()
        assert "criterion" in reasons_text.lower() or "Strongest" in reasons_text

    def test_confidence_in_reasons(self):
        result = select_best_system([_sys("a")])
        reasons_text = " ".join(result.reasons)
        assert "confidence" in reasons_text.lower()


# ── Confidence propagation ───────────────────────────────────────────────────

class TestSelectorConfidence:
    def test_confidence_on_result(self):
        result = select_best_system([_sys("a")])
        assert 0 <= result.confidence <= 100

    def test_confidence_matches_winner(self):
        result = select_best_system([_sys("a"), _sys("b", brightness=9000)])
        assert result.confidence == result.winner.confidence.score

    def test_high_spec_system_higher_confidence(self):
        sparse = {"id": "sparse", "name": "Sparse", "criteria": {}, "features": {}}
        rich = _sys("rich", brightness=8000, modifier=1.1, dimmable=True, smart_ready=True, waterproof=True)
        result = select_best_system([sparse, rich])
        rich_bd = next(r.breakdown for r in result.rankings if r.breakdown.system_id == "rich")
        sparse_bd = next(r.breakdown for r in result.rankings if r.breakdown.system_id == "sparse")
        assert rich_bd.confidence.score > sparse_bd.confidence.score


# ── Top picks ────────────────────────────────────────────────────────────────

class TestTopPicks:
    def test_single_system_one_pick(self):
        result = select_best_system([_sys("only")])
        assert len(result.top_picks) == 1
        assert result.top_picks[0].rank == 1
        assert result.top_picks[0].breakdown.system_id == "only"
        assert "Primary" in result.top_picks[0].reason

    def test_two_systems_two_picks(self):
        result = select_best_system([_sys("a"), _sys("b", brightness=9000)])
        assert len(result.top_picks) == 2
        assert result.top_picks[0].rank == 1
        assert result.top_picks[1].rank == 2
        assert "Alternative" in result.top_picks[1].reason

    def test_three_systems_three_picks(self):
        systems = [
            _sys("low", brightness=1000),
            _sys("mid", brightness=5000),
            _sys("high", brightness=9000),
        ]
        result = select_best_system(systems)
        assert len(result.top_picks) == 3
        assert [p.rank for p in result.top_picks] == [1, 2, 3]

    def test_more_than_three_still_three_picks(self):
        systems = [_sys(f"s{i}", brightness=1000 * i) for i in range(1, 8)]
        result = select_best_system(systems)
        assert len(result.top_picks) == 3
        assert result.top_picks[0].breakdown.system_id == result.winner.system_id

    def test_picks_match_rankings_order(self):
        systems = [_sys("c", brightness=3000), _sys("a", brightness=9000), _sys("b", brightness=6000)]
        result = select_best_system(systems)
        for pick in result.top_picks:
            ranked = result.rankings[pick.rank - 1]
            assert pick.breakdown.system_id == ranked.breakdown.system_id

    def test_alternative_reason_identifies_gap(self):
        """Alternative reason should mention the criterion or bonus gap."""
        systems = [
            _sys("loser", brightness=1000),
            _sys("winner", brightness=9000, dimmable=True),
        ]
        result = select_best_system(systems)
        alt = result.top_picks[1]
        assert "behind" in alt.reason or "tied" in alt.reason

    def test_tie_alternative_reason(self):
        """Tied alternatives should mention tie-break."""
        a = _sys("alpha")
        b = _sys("beta")
        result = select_best_system([b, a])
        alt = result.top_picks[1]
        assert "tie-break" in alt.reason

    def test_top_picks_deterministic(self):
        systems = [_sys("c", brightness=3000), _sys("a", brightness=9000), _sys("b", brightness=6000)]
        r1 = select_best_system(systems)
        r2 = select_best_system(list(reversed(systems)))
        assert [p.breakdown.system_id for p in r1.top_picks] == [
            p.breakdown.system_id for p in r2.top_picks
        ]
        assert [p.reason for p in r1.top_picks] == [p.reason for p in r2.top_picks]

    def test_primary_reason_includes_score_and_confidence(self):
        result = select_best_system([_sys("a", brightness=8000, modifier=1.1)])
        primary = result.top_picks[0]
        assert str(result.winner.final_score) in primary.reason
        assert "confidence" in primary.reason.lower()


# ── Diagram spec on top picks ────────────────────────────────────────────────

class TestTopPicksDiagram:
    def test_every_pick_has_diagram(self):
        systems = [_sys("a", brightness=1000), _sys("b", brightness=5000), _sys("c", brightness=9000)]
        result = select_best_system(systems)
        for pick in result.top_picks:
            assert pick.diagram_spec is not None
            assert pick.diagram_spec.system_id == pick.breakdown.system_id
            assert len(pick.diagram_spec.lights) >= 1

    def test_diagram_has_key_light(self):
        result = select_best_system([_sys("a")])
        d = result.top_picks[0].diagram_spec
        roles = [l.role for l in d.lights]
        assert "key" in roles

    def test_diagram_with_taxonomy_refs(self):
        """System with taxonomy_refs should produce mood-aware diagram."""
        s = {
            "id": "test",
            "name": "Test System",
            "criteria": {"brightness": 8000},
            "features": {},
            "taxonomy_refs": {
                "gear_profile": "strobe_mono",
                "modifier_family": "beauty_dish",
                "mood": "beauty",
                "environment": "studio_large",
                "skin_tone": "medium",
            },
        }
        result = select_best_system([s])
        d = result.top_picks[0].diagram_spec
        key = d.lights[0]
        assert key.angle_deg == 0.0  # beauty = frontal

    def test_diagram_deterministic(self):
        systems = [_sys("a", brightness=9000), _sys("b", brightness=5000)]
        r1 = select_best_system(systems)
        r2 = select_best_system(list(reversed(systems)))
        for p1, p2 in zip(r1.top_picks, r2.top_picks):
            assert p1.diagram_spec.model_dump() == p2.diagram_spec.model_dump()
