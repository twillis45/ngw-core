"""Tests for engine/rule_engine.py

Covers:
  Fix #7  — empty id / name rejected
  Edge    — duplicate ids, JSON string input, dict input, multiple sources
"""

import json

import pytest

from engine.rule_engine import (
    LightingSystemEntry,
    LightingSystemsPayload,
    RuleEngineOutput,
    run_rule_engine,
)


# ── Helpers ──────────────────────────────────────────────────────────────────

def _valid_system(**overrides) -> dict:
    base = {
        "id": "led-1",
        "name": "LED Panel",
        "criteria": {"brightness": 5000},
        "features": {},
    }
    base.update(overrides)
    return base


# ── LightingSystemEntry validation (Fix #7) ─────────────────────────────────

class TestEntryValidation:
    def test_valid_entry(self):
        entry = LightingSystemEntry(**_valid_system())
        assert entry.id == "led-1"

    def test_empty_id_rejected(self):
        with pytest.raises(Exception):  # ValidationError
            LightingSystemEntry(**_valid_system(id=""))

    def test_empty_name_rejected(self):
        with pytest.raises(Exception):
            LightingSystemEntry(**_valid_system(name=""))

    def test_missing_criteria_defaults(self):
        data = {"id": "x", "name": "X"}
        entry = LightingSystemEntry(**data)
        assert entry.criteria == {}
        assert entry.features == {}
        assert entry.modifier is None


# ── Duplicate ID detection ───────────────────────────────────────────────────

class TestDuplicateIds:
    def test_duplicate_ids_rejected(self):
        with pytest.raises(Exception, match="Duplicate"):
            LightingSystemsPayload(
                systems=[
                    LightingSystemEntry(**_valid_system(id="dup")),
                    LightingSystemEntry(**_valid_system(id="dup", name="Other")),
                ]
            )

    def test_unique_ids_accepted(self):
        payload = LightingSystemsPayload(
            systems=[
                LightingSystemEntry(**_valid_system(id="a")),
                LightingSystemEntry(**_valid_system(id="b", name="Other")),
            ]
        )
        assert len(payload.systems) == 2


# ── run_rule_engine input modes ──────────────────────────────────────────────

class TestRunRuleEngine:
    def test_dict_input(self):
        result = run_rule_engine(systems=[_valid_system()])
        assert isinstance(result, RuleEngineOutput)
        assert result.systems_evaluated == 1
        assert result.engine_version == "ngw-core-v1.0"

    def test_json_string_input(self):
        payload = json.dumps({"systems": [_valid_system()]})
        result = run_rule_engine(json_string=payload)
        assert result.systems_evaluated == 1

    def test_no_input_raises(self):
        with pytest.raises(ValueError, match="exactly one"):
            run_rule_engine()

    def test_multiple_inputs_raises(self):
        with pytest.raises(ValueError, match="exactly one"):
            run_rule_engine(
                json_string='{"systems":[]}',
                systems=[_valid_system()],
            )

    def test_empty_systems_list_rejected(self):
        with pytest.raises(Exception):
            run_rule_engine(systems=[])

    def test_multi_system_ranking(self):
        systems = [
            _valid_system(id="weak", criteria={"brightness": 100}),
            _valid_system(id="strong", name="Strong", criteria={"brightness": 9000}),
        ]
        result = run_rule_engine(systems=systems)
        assert result.selection.winner.system_id == "strong"
        assert result.systems_evaluated == 2
