from __future__ import annotations

import json
from typing import Any, Dict, List, Optional, Sequence, Union

from pydantic import BaseModel, Field, ConfigDict, field_validator

from engine.normalizer import normalize_modifier_list
from engine.selector import select_best_system, as_public_selection
from models.input_model import InputModel
from models.output_model import SelectionResult


class SystemEntry(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    name: Optional[str] = None
    taxonomy_refs: Dict[str, Any] = Field(default_factory=dict)
    criteria: Dict[str, Any] = Field(default_factory=dict)
    features: Dict[str, Any] = Field(default_factory=dict)
    modifier: Optional[float] = None

    @field_validator("id")
    @classmethod
    def _id_non_empty(cls, v: str) -> str:
        if not str(v).strip():
            raise ValueError("id must be non-empty")
        return str(v)


class RuleEngineOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    selection: SelectionResult
    diagram_spec: Dict[str, Any]
    content: str
    trace: Dict[str, Any] = Field(default_factory=dict)


def _parse_systems(systems: Union[str, Sequence[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    if isinstance(systems, str):
        data = json.loads(systems)
        if not isinstance(data, list):
            raise ValueError("systems JSON must decode to a list")
        systems_list = data
    else:
        systems_list = list(systems)

    out: List[Dict[str, Any]] = []
    seen = set()
    for s in systems_list:
        entry = SystemEntry(**s).model_dump()
        sid = entry["id"]
        if sid in seen:
            raise ValueError(f"Duplicate system id: {sid}")
        seen.add(sid)
        out.append(entry)
    return out


def run_rule_engine(payload: Dict[str, Any]) -> RuleEngineOutput:
    input_payload = payload.get("input", {}) or {}
    input_model = InputModel.from_payload(input_payload)

    systems = _parse_systems(payload.get("systems", []))
    modifiers_available = normalize_modifier_list(payload.get("modifiers_available", input_model.modifiers_available))

    outcome = select_best_system(systems, input_ctx=input_model.model_dump(), modifiers_available=modifiers_available)
    selection = as_public_selection(outcome, trace=input_model.trace)

    diagram_spec = outcome.winner.diagram_spec.model_dump()

    content = f"Winner: {selection.winner.system_id} (confidence {selection.winner.confidence.score}%)"
    if selection.alternatives:
        content += " | Alternatives: " + ", ".join(a.system_id for a in selection.alternatives[:3])

    return RuleEngineOutput(selection=selection, diagram_spec=diagram_spec, content=content, trace=input_model.trace)


def recommend(payload: Dict[str, Any]) -> Dict[str, Any]:
    out = run_rule_engine(payload)
    return {"score": out.selection.winner.score_breakdown.final_score}
