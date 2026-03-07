from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, ConfigDict

from engine.normalizer import normalize_token, normalize_modifier_list


class InputModel(BaseModel):
    """
    Boundary model for request input.

    Keep this permissive (extra allowed) so the API can evolve without breaking callers.
    """
    model_config = ConfigDict(extra="allow")

    skin_tone: str = Field(default="unknown")
    mood: str = Field(default="neutral")
    environment: str = Field(default="studio")
    gear_profile: str = Field(default="standard")
    modifiers_available: List[str] = Field(default_factory=list)

    preferences: Optional[Dict[str, Any]] = None
    trace: Dict[str, Any] = Field(default_factory=dict)

    @classmethod
    def from_payload(cls, payload: Dict[str, Any]) -> "InputModel":
        data = dict(payload or {})
        for k in ("skin_tone", "mood", "environment", "gear_profile"):
            if k in data and data[k] is not None:
                data[k] = normalize_token(str(data[k]))
        if "modifiers_available" in data and data["modifiers_available"] is not None:
            data["modifiers_available"] = normalize_modifier_list(data["modifiers_available"])
        return cls(**data)
