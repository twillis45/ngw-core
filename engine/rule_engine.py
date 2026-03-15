"""Legacy rule engine wrapper — convenience layer over engine.selector.

.. deprecated::
    Production routes now call ``engine.selector.select_best_system()``
    directly (via ``engine.orchestrator``).  This module is retained for:

    - Validation models (``LightingSystemEntry``, ``LightingSystemsPayload``)
      used by YAML loaders and validation scripts.
    - The ``recommend()`` convenience function used by smoke tests and
      example scripts.
    - Backward compatibility with external consumers.

    New code should use ``engine.orchestrator.recommend_system()`` or
    ``engine.selector.select_best_system()`` instead of this module.
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional, Sequence

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from engine.normalizer import normalize_modifier_list
from engine.selector import as_public_selection, select_best_system
from models.input_model import InputModel
from models.output_model import SelectionResult

ENGINE_VERSION = "1.0.0"


class LightingSystemEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    taxonomy_refs: Dict[str, Any] = Field(default_factory=dict)
    criteria: Dict[str, Any] = Field(default_factory=dict)
    features: Dict[str, Any] = Field(default_factory=dict)
    modifier: Optional[float] = None

    @field_validator("id")
    @classmethod
    def validate_id(cls, v: str) -> str:
        vv = str(v).strip()
        if not vv:
            raise ValueError("id must be non-empty")
        return vv

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        vv = str(v).strip()
        if not vv:
            raise ValueError("name must be non-empty")
        return vv


class LightingSystemsPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    systems: List[LightingSystemEntry] = Field(min_length=1)
    input: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    modifiers_available: List[str] = Field(default_factory=list)

    @field_validator("systems")
    @classmethod
    def validate_unique_system_ids(cls, systems: List[LightingSystemEntry]) -> List[LightingSystemEntry]:
        seen = set()
        for s in systems:
           sid = str(s.id).strip()
           if sid in seen:
               raise ValueError(f"Duplicate system id: {sid}")
           seen.add(sid)
        return systems

class RuleEngineOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    selection: SelectionResult
    diagram_spec: Dict[str, Any]
    content: str
    trace: Dict[str, Any] = Field(default_factory=dict)
    systems_evaluated: int = 0
    systems: List[Dict[str, Any]] = Field(default_factory=list)
    engine_version: str = "ngw-core-v1.0"


def _parse_systems(systems: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    parsed: List[Dict[str, Any]] = []
    seen = set()

    for raw in systems:
        entry = LightingSystemEntry.model_validate(raw)
        dumped = entry.model_dump()
        sid = dumped["id"]
        if sid in seen:
            raise ValueError(f"Duplicate system id: {sid}")
        seen.add(sid)
        parsed.append(dumped)

    return parsed


def _coerce_payload(
    payload: Optional[Dict[str, Any]] = None,
    *,
    json_string: Optional[str] = None,
    systems: Optional[Sequence[Dict[str, Any]]] = None,
) -> LightingSystemsPayload:
    provided = sum(x is not None for x in (payload, json_string, systems))
    if provided != 1:
        raise ValueError("Provide exactly one of payload, json_string, or systems")

    def _ensure_no_duplicate_ids(items: Sequence[Dict[str, Any]]) -> None:
        seen = set()
        for raw in items:
            sid = str((raw or {}).get("id", "")).strip()
            if sid in seen:
                raise ValueError(f"Duplicate system id: {sid}")
            seen.add(sid)

    if systems is not None:
        raw_systems = list(systems)
        _ensure_no_duplicate_ids(raw_systems)
        return LightingSystemsPayload.model_validate({"systems": raw_systems})

    if json_string is not None:
        data = json.loads(json_string)
        if not isinstance(data, dict):
            raise ValueError("json_string must decode to an object")
        raw_systems = list(data.get("systems") or [])
        _ensure_no_duplicate_ids(raw_systems)
        return LightingSystemsPayload.model_validate(data)

    raw_systems = list((payload or {}).get("systems") or [])
    _ensure_no_duplicate_ids(raw_systems)
    return LightingSystemsPayload.model_validate(payload)


def run_rule_engine(
    payload: Optional[Dict[str, Any]] = None,
    *,
    json_string: Optional[str] = None,
    systems: Optional[Sequence[Dict[str, Any]]] = None,
) -> RuleEngineOutput:
    req = _coerce_payload(payload, json_string=json_string, systems=systems)

    systems = [s.model_dump() for s in req.systems]
    
    input_payload = dict(req.input or {})
    input_model = InputModel.model_validate(
        {
            "skin_tone": input_payload.get("skin_tone"),
            "mood": input_payload.get("mood"),
            "environment": input_payload.get("environment"),
            "gear_profile": input_payload.get("gear_profile"),
            "modifiers_available": input_payload.get("modifiers_available", []),
            "trace": input_payload.get("trace", {}),
        }
    )
    modifiers_available = normalize_modifier_list(
        req.modifiers_available or input_model.modifiers_available
    )

    outcome = select_best_system(
        systems,
        input_ctx=input_model.model_dump(),
        modifiers_available=modifiers_available,
    )
    selection = as_public_selection(outcome, trace=input_model.trace)

    winner = selection.top_picks[0]
    content = (
        f"Recommended: {winner.breakdown.system_name} "
        f"(score {float(winner.breakdown.final_score):.1f}; "
        f"confidence {float(selection.confidence):.1f}/100)."
    )

    if len(selection.top_picks) > 1:
        lines = [content]
        for idx, pick in enumerate(selection.top_picks[1:], start=2):
            lines.append(f"Alt #{idx}: {pick.breakdown.system_name}")
        content = "\n".join(lines)

    return RuleEngineOutput(
        selection=selection,
        diagram_spec=dict(winner.diagram_spec),
        content=content,
        trace=input_model.trace,
        systems_evaluated=len(systems),
        systems=systems,
    )


def recommend(payload: Dict[str, Any]) -> Dict[str, Any]:
    if "systems" not in payload:
        gear_profile = str(payload.get("gear_profile") or "strobe_mono")
        mood = str(payload.get("mood") or "corporate")
        environment = str(payload.get("environment") or "studio")
        modifiers_available = list(payload.get("modifiers_available") or [])

        synthesized_payload = {
            "systems": [
                {
                    "id": "candidate_1",
                    "name": "Candidate 1",
                    "criteria": {
                        "brightness": 5000,
                        "color_accuracy": 85,
                        "portability": 50,
                        "battery_life": 50,
                        "energy_efficiency": 50,
                    },
                    "features": {},
                    "taxonomy_refs": {
                        "gear_profile": gear_profile,
                        "mood": mood,
                        "environment": environment,
                        "modifier_family": modifiers_available[0] if modifiers_available else "softbox_rect",
                    },
                }
            ],
            "input": {
                "skin_tone": payload.get("skin_tone"),
                "mood": mood,
                "environment": environment,
                "gear_profile": gear_profile,
                "modifiers_available": modifiers_available,
            },
            "modifiers_available": modifiers_available,
        }
        out = run_rule_engine(synthesized_payload)
    else:
        out = run_rule_engine(payload)

    return {
        "winner": out.selection.winner.system_id,
        "score": out.selection.winner.final_score,
        "diagram_spec": out.diagram_spec,
        "content": out.content,
    }
