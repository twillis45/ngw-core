from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List

from pydantic import BaseModel, ConfigDict, Field, field_validator


class TaskType(str, Enum):
    GENERATE = "generate"
    RECOMMEND = "recommend"


class OutputFormat(str, Enum):
    JSON = "json"
    TEXT = "text"


class EngineOptions(BaseModel):
    temperature: float = 0.7
    model_config = ConfigDict(extra="forbid")

    include_trace: bool = False
    include_diagram: bool = True


class ContextItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: str
    content: str

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        allowed = {"system", "user", "assistant"}
        if v not in allowed:
            raise ValueError(f"role must be one of {sorted(allowed)}")
        return v


class NGWRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompt: str
    task: TaskType = TaskType.RECOMMEND
    output_format: OutputFormat = OutputFormat.JSON
    context: List[ContextItem] = Field(default_factory=list)

    options: EngineOptions = Field(default_factory=EngineOptions)
    engine_options: EngineOptions = Field(default_factory=EngineOptions, alias="options")    
    @field_validator("prompt")
    @classmethod
    def validate_prompt(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("prompt must be non-empty")
        return v


class InputModel(BaseModel):
    model_config = ConfigDict(extra="allow")

    modifiers_available: List[str] = Field(default_factory=list)
    trace: Dict[str, Any] = Field(default_factory=dict)

