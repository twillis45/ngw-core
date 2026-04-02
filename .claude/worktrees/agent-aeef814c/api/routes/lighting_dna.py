"""Lighting DNA API routes — similarity search for lighting setups.

Provides:
- POST /api/lighting-match — compare a query DNA against the catalog
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from engine.lighting_dna import (
    LightingDNA,
    compare_lighting_dna,
    build_dna_from_analysis,
    find_closest_setups,
    load_all_catalog_dna,
)

router = APIRouter(tags=["lighting-dna"])

# Cache catalog DNA at module level (loaded once, read-only)
_catalog_cache: Optional[List[LightingDNA]] = None


def _get_catalog() -> List[LightingDNA]:
    global _catalog_cache
    if _catalog_cache is None:
        _catalog_cache = load_all_catalog_dna()
    return _catalog_cache


# ── Request / Response models ────────────────────────────────────────────

class LightingMatchRequest(BaseModel):
    """Request body for /lighting-match.

    Supply EITHER `dna` (pre-built DNA fingerprint) OR `analysis`
    (raw analysis outputs to build DNA from).
    """
    dna: Optional[Dict[str, Any]] = Field(
        None,
        description="Pre-built LightingDNA dict. If provided, used directly.",
    )
    analysis: Optional[Dict[str, Any]] = Field(
        None,
        description=(
            "Raw analysis outputs: vlm_signals, cue_report, lighting_read, "
            "recreation_setup. DNA will be built from these."
        ),
    )
    top_n: int = Field(5, ge=1, le=20, description="Number of matches to return.")


class MatchResult(BaseModel):
    source_id: str
    source_name: str
    similarity_score: float
    dna: Dict[str, Any]


class LightingMatchResponse(BaseModel):
    query_dna: Dict[str, Any]
    matches: List[MatchResult]
    catalog_size: int


# ── Endpoint ─────────────────────────────────────────────────────────────

@router.post("/lighting-match", response_model=LightingMatchResponse)
def lighting_match(body: LightingMatchRequest) -> LightingMatchResponse:
    """Find the closest catalog lighting setups to a query DNA.

    Supply either `dna` (a LightingDNA dict) or `analysis` (raw analysis
    outputs from the image analysis pipeline).  Returns the top N matches
    with similarity scores.
    """
    # Build query DNA
    if body.dna:
        try:
            query = LightingDNA(**body.dna)
        except Exception as exc:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid DNA payload: {exc}",
            )
    elif body.analysis:
        a = body.analysis
        query = build_dna_from_analysis(
            vlm_signals=a.get("vlm_signals"),
            cue_report=a.get("cue_report"),
            lighting_read=a.get("lighting_read"),
            recreation_setup=a.get("recreation_setup"),
        )
    else:
        raise HTTPException(
            status_code=422,
            detail="Provide either 'dna' or 'analysis' in request body.",
        )

    catalog = _get_catalog()
    results = find_closest_setups(query, catalog_dna=catalog, top_n=body.top_n)

    matches = [
        MatchResult(
            source_id=dna.source_id,
            source_name=dna.source_name,
            similarity_score=score,
            dna=dna.model_dump(exclude={"source_id", "source_name"}),
        )
        for dna, score in results
    ]

    return LightingMatchResponse(
        query_dna=query.model_dump(),
        matches=matches,
        catalog_size=len(catalog),
    )
