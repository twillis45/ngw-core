from __future__ import annotations

from datetime import datetime

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field

from enum import Enum

class StatusCode(str, Enum):
    SUCCESS = "success"
    ERROR = "error"

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


class Confidence(BaseModel):
    model_config = ConfigDict(extra="forbid")

    score: float = 0.0
    method: str = "unknown"
    criteria_coverage: float = 0.0
    criteria_quality: float = 0.0
    feature_coverage: float = 0.0
    feature_match: float = 0.0
    modifier_provided: float = 0.0
    reasons: List[str] = Field(default_factory=list)
    details: Dict[str, Any] = Field(default_factory=dict)

class ScoreBreakdown(BaseModel):
    model_config = ConfigDict(extra="forbid")

    system_id: str
    system_name: str
    subtotal: float = 0.0
    bonus_total: float = 0.0
    base_score: float
    modifier: float
    modifier_source: str = "fallback"
    final_score: float
    components: List[CriterionComponent] = Field(default_factory=list)
    feature_bonuses: List[FeatureBonus] = Field(default_factory=list)
    notes: List[str] = Field(default_factory=list)
    confidence: Confidence | None = None

class WinnerInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")

    system_id: str
    system_name: str = ""
    final_score: float = 0.0
    confidence: Confidence = Field(default_factory=Confidence)
    rationale: str = ""
    score_breakdown: Optional[ScoreBreakdown] = None


class AlternativeInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")

    system_id: str
    score: float
    delta: float
    notes: List[str] = Field(default_factory=list)


class SelectionPick(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rank: int
    breakdown: ScoreBreakdown
    reason: str = ""
    diagram_spec: Any = None


class SelectionResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    total_candidates: int = 0
    confidence: float = 0.0
    winner: WinnerInfo
    rankings: List[SelectionPick] = Field(default_factory=list)
    reasons: List[str] = Field(default_factory=list)
    top_picks: List[SelectionPick] = Field(default_factory=list)
    trace: Dict[str, Any] = Field(default_factory=dict)

class ErrorDetail(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str
    message: str


class UsageStats(BaseModel):
    model_config = ConfigDict(extra="forbid")

    processing_ms: float = 0.0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class ResultPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: str
    structured: Dict[str, Any]
    diagram_spec: Dict[str, Any]
    confidence: Optional[float] = None


class NGWResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    created_at: datetime = Field(default_factory=datetime.utcnow)

    request_id: str
    status: str
    result: Optional[ResultPayload] = None
    usage: UsageStats = Field(default_factory=UsageStats)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    error: Optional[ErrorDetail] = None
    @property
    def ok(self) -> bool:
         return self.status == StatusCode.SUCCESS

