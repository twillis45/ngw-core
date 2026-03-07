from __future__ import annotations

from typing import Any, Dict, List
from pydantic import BaseModel, Field, ConfigDict


class CriterionComponent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    criterion: str
    raw: float
    normalised: float
    weight: float
    weighted: float
    reason: str = ""


class FeatureBonus(BaseModel):
    model_config = ConfigDict(extra="forbid")

    feature: str
    value: Any
    points: float
    reason: str = ""


class ScoreBreakdown(BaseModel):
    model_config = ConfigDict(extra="forbid")

    system_id: str
    base_score: float
    modifier: float
    final_score: float
    components: List[CriterionComponent] = Field(default_factory=list)
    feature_bonuses: List[FeatureBonus] = Field(default_factory=list)
    notes: List[str] = Field(default_factory=list)


class Confidence(BaseModel):
    model_config = ConfigDict(extra="forbid")

    score: int = 0  # 0-100
    method: str = "margin"
    details: Dict[str, Any] = Field(default_factory=dict)


class WinnerInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")

    system_id: str
    confidence: Confidence
    rationale: str = ""
    score_breakdown: ScoreBreakdown


class AlternativeInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")

    system_id: str
    score: float
    delta: float
    notes: List[str] = Field(default_factory=list)


class SelectionResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    winner: WinnerInfo
    alternatives: List[AlternativeInfo] = Field(default_factory=list)
    trace: Dict[str, Any] = Field(default_factory=dict)
