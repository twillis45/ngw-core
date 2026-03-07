from __future__ import annotations

import time
import uuid
from typing import Any, Dict, List

from fastapi import FastAPI
from pydantic import BaseModel, Field, ConfigDict

from engine.rule_engine import run_rule_engine


ENGINE_VERSION = "1.0.0"

app = FastAPI(title="NGW Core v1", version=ENGINE_VERSION)


class RecommendRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    systems: List[Dict[str, Any]] = Field(min_length=1)
    input: Dict[str, Any] = Field(default_factory=dict)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    modifiers_available: List[str] = Field(default_factory=list)


class Usage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    processing_ms: int


class ResultPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    content: str
    structured: Dict[str, Any]
    diagram_spec: Dict[str, Any]


class RecommendResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: str
    request_id: str
    metadata: Dict[str, Any]
    usage: Usage
    result: ResultPayload


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok", "engine_version": ENGINE_VERSION}


@app.get("/")
def root() -> Dict[str, Any]:
    return {"title": "NGW Core v1", "endpoints": ["/health", "/recommend"]}


@app.post("/recommend")
def recommend(req: RecommendRequest) -> RecommendResponse:
    t0 = time.time()
    request_id = str(uuid.uuid4())

    out = run_rule_engine(
        {
            "systems": req.systems,
            "input": req.input,
            "metadata": req.metadata,
            "modifiers_available": req.modifiers_available,
        }
    )

    processing_ms = int((time.time() - t0) * 1000)

    structured = {
        "selection": out.selection.model_dump(),
        "confidence": out.selection.winner.confidence.score,
        "reasons": out.selection.winner.confidence.details.get("reasons", []),
    }

    resp_meta = dict(req.metadata or {})
    resp_meta.setdefault("trace", req.metadata.get("trace") if isinstance(req.metadata, dict) else None)
    resp_meta["engine_version"] = ENGINE_VERSION

    return RecommendResponse(
        status="success",
        request_id=request_id,
        metadata=resp_meta,
        usage=Usage(processing_ms=processing_ms),
        result=ResultPayload(content=out.content, structured=structured, diagram_spec=out.diagram_spec),
    )
