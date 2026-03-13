"""Data models for the constrained inverse-lighting solver.

Architecture
============
These models form the data backbone for the solver layer that sits between
signal extraction (vision_passes.py) and the reference read (reference_read.py).

The solver does NOT replace any existing models.  It produces a ``SolverResult``
that enriches the pipeline outputs with:
- Canonical coordinate normalization
- Per-region reliability scores
- Per-pass weight profiles (with contamination downgrading)
- Dominant-source consensus across passes
- Cross-pass consistency scores
- Explicit contradiction objects
- 3D scene geometry estimates
- Ranked lighting hypotheses with forward-simulation validation
- Full solver trace for LAB debugging

Design principles (mirroring image_analysis_models.py):
- Every model has a ``confidence`` (0.0–1.0) where applicable
- All fields have defaults — models instantiate safely with no arguments
- Pydantic models use ``model_config = ConfigDict(extra="forbid")``
- Dataclasses used for pure-computation containers
- List fields use ``Field(default_factory=list)``
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


# ═══════════════════════════════════════════════════════════════════════════
# Canonical Coordinate System
# ═══════════════════════════════════════════════════════════════════════════


class CanonicalCoord(BaseModel):
    """Subject-centric 3D position in canonical coordinates.

    Coordinate frame:
        X = right (from subject's perspective, camera-left is negative)
        Y = up (floor is negative, ceiling is positive)
        Z = toward camera (behind subject is negative)

    All values are normalized to subject scale:
        1.0 = one subject-height unit (approx head-to-waist for portraits)

    This normalization allows cross-image comparison regardless of
    focal length, distance, or framing.
    """
    model_config = ConfigDict(extra="forbid")

    x: float = 0.0
    y: float = 0.0
    z: float = 0.0
    confidence: float = 0.0
    reference_frame: str = "subject_centric"  # always subject_centric in canonical
    notes: List[str] = Field(default_factory=list)


class CanonicalDirection(BaseModel):
    """Direction in canonical coordinate space, expressed as angles.

    azimuth_deg: horizontal angle from front (0°=front, +90°=right, ±180°=behind, -90°=left)
    elevation_deg: vertical angle from horizontal (0°=eye level, +90°=directly above, -90°=below)
    """
    model_config = ConfigDict(extra="forbid")

    azimuth_deg: float = 0.0
    elevation_deg: float = 0.0
    confidence: float = 0.0


# ═══════════════════════════════════════════════════════════════════════════
# Region Reliability
# ═══════════════════════════════════════════════════════════════════════════


class RegionReliability(BaseModel):
    """Per-region reliability scores for signal extraction.

    Each score is 0.0 (completely unreliable) to 1.0 (fully reliable).
    Scores reflect data quality, not signal strength.
    """
    model_config = ConfigDict(extra="forbid")

    face: float = 0.0
    torso: float = 0.0
    background: float = 0.0
    hair: float = 0.0
    skin_general: float = 0.0
    specular_surfaces: float = 0.0
    shadow_regions: float = 0.0
    highlight_regions: float = 0.0
    overall: float = 0.0
    degradation_reasons: List[str] = Field(default_factory=list)
    notes: List[str] = Field(default_factory=list)


# ═══════════════════════════════════════════════════════════════════════════
# Signal Weights
# ═══════════════════════════════════════════════════════════════════════════


class SignalWeight(BaseModel):
    """Weight for a single pass signal, with contamination tracking.

    base_weight: the default weight for this pass (1.0 = full trust)
    adjusted_weight: after contamination downgrading
    downgrade_reasons: why weight was reduced
    """
    model_config = ConfigDict(extra="forbid")

    pass_name: str = ""
    base_weight: float = 1.0
    adjusted_weight: float = 1.0
    downgrade_reasons: List[str] = Field(default_factory=list)

    @property
    def is_downgraded(self) -> bool:
        return self.adjusted_weight < self.base_weight


class PassWeightProfile(BaseModel):
    """Collection of signal weights for all passes.

    Used by consensus solver to weight each pass's contribution.
    """
    model_config = ConfigDict(extra="forbid")

    weights: Dict[str, SignalWeight] = Field(default_factory=dict)
    total_downgrades: int = 0
    notes: List[str] = Field(default_factory=list)

    def get_weight(self, pass_name: str) -> float:
        """Get adjusted weight for a pass, defaulting to 0.5 if unknown."""
        sw = self.weights.get(pass_name)
        return sw.adjusted_weight if sw else 0.5

    def downgraded_passes(self) -> List[str]:
        """List pass names that have been downgraded."""
        return [name for name, sw in self.weights.items() if sw.is_downgraded]


# ═══════════════════════════════════════════════════════════════════════════
# Consensus
# ═══════════════════════════════════════════════════════════════════════════


class ConsensusVote(BaseModel):
    """A single pass's vote on a dimension."""
    model_config = ConfigDict(extra="forbid")

    pass_name: str = ""
    value: Any = None  # str, float, or int depending on dimension
    weight: float = 0.0
    confidence: float = 0.0


class DimensionConsensus(BaseModel):
    """Consensus result for a single dimension (direction, height, etc.)."""
    model_config = ConfigDict(extra="forbid")

    dimension: str = ""  # direction | height | distance | modifier | light_count | environment
    consensus_value: Any = None
    consensus_confidence: float = 0.0
    contributing_votes: List[ConsensusVote] = Field(default_factory=list)
    dissenting_votes: List[ConsensusVote] = Field(default_factory=list)
    spread: float = 0.0  # measure of disagreement (0=perfect agreement, 1=no agreement)
    notes: List[str] = Field(default_factory=list)


class ConsensusResult(BaseModel):
    """Full consensus across all dimensions."""
    model_config = ConfigDict(extra="forbid")

    dimensions: Dict[str, DimensionConsensus] = Field(default_factory=dict)
    overall_agreement: float = 0.0  # 0.0-1.0
    dominant_direction_deg: Optional[float] = None
    dominant_height_class: Optional[str] = None
    dominant_distance_ft: Optional[float] = None
    dominant_modifier: Optional[str] = None
    dominant_light_count: Optional[int] = None
    dominant_environment: Optional[str] = None
    notes: List[str] = Field(default_factory=list)


# ═══════════════════════════════════════════════════════════════════════════
# Consistency
# ═══════════════════════════════════════════════════════════════════════════


class PairwiseAgreement(BaseModel):
    """Agreement between two passes on a single dimension."""
    model_config = ConfigDict(extra="forbid")

    pass_a: str = ""
    pass_b: str = ""
    dimension: str = ""
    value_a: Any = None
    value_b: Any = None
    agrees: bool = False
    distance: float = 0.0  # 0=identical, higher=more different


class ConsistencyScore(BaseModel):
    """Cross-pass consistency score for one dimension."""
    model_config = ConfigDict(extra="forbid")

    dimension: str = ""
    score: float = 0.0  # 0.0-1.0 (1.0 = all passes agree)
    total_pairs: int = 0
    agreeing_pairs: int = 0
    agreements: List[PairwiseAgreement] = Field(default_factory=list)
    conflicts: List[PairwiseAgreement] = Field(default_factory=list)
    notes: List[str] = Field(default_factory=list)


# ═══════════════════════════════════════════════════════════════════════════
# Contradictions
# ═══════════════════════════════════════════════════════════════════════════


class Contradiction(BaseModel):
    """Explicit contradiction between two passes."""
    model_config = ConfigDict(extra="forbid")

    contradiction_id: str = ""
    pass_a: str = ""
    pass_b: str = ""
    dimension: str = ""  # direction | height | modifier | light_count | environment | color_temp
    value_a: Any = None
    value_b: Any = None
    severity: str = "low"  # low | medium | high
    resolution_hint: str = ""
    notes: List[str] = Field(default_factory=list)


class ContradictionReport(BaseModel):
    """Collection of all detected contradictions."""
    model_config = ConfigDict(extra="forbid")

    contradictions: List[Contradiction] = Field(default_factory=list)
    ambiguity_class: str = "clean"  # clean | minor_conflicts | genuine_ambiguity | insufficient_data
    high_severity_count: int = 0
    notes: List[str] = Field(default_factory=list)

    @property
    def has_serious_conflicts(self) -> bool:
        return self.high_severity_count > 0


# ═══════════════════════════════════════════════════════════════════════════
# Scene Geometry
# ═══════════════════════════════════════════════════════════════════════════


class SurfaceEstimate(BaseModel):
    """Estimated surface in the scene."""
    model_config = ConfigDict(extra="forbid")

    surface_id: str = ""
    surface_type: str = "unknown"  # face | body | floor | wall | ceiling | background | object
    normal_direction: Optional[CanonicalDirection] = None
    position: Optional[CanonicalCoord] = None
    reflectance_class: str = "diffuse"  # diffuse | glossy | specular | mixed
    confidence: float = 0.0


class OccluderEstimate(BaseModel):
    """Estimated light-blocking object in the scene."""
    model_config = ConfigDict(extra="forbid")

    occluder_id: str = ""
    occluder_type: str = "unknown"  # body_part | object | architecture | unknown
    blocked_direction: Optional[CanonicalDirection] = None
    severity: str = "partial"  # partial | full
    confidence: float = 0.0


class BouncePath(BaseModel):
    """Estimated light bounce path."""
    model_config = ConfigDict(extra="forbid")

    source_direction: Optional[CanonicalDirection] = None
    bounce_surface: str = ""  # floor | wall | ceiling | reflector | unknown
    contribution: str = "minor"  # minor | moderate | significant
    confidence: float = 0.0


class SceneGeometryModel(BaseModel):
    """3D scene geometry model built from vision data."""
    model_config = ConfigDict(extra="forbid")

    surfaces: List[SurfaceEstimate] = Field(default_factory=list)
    occluders: List[OccluderEstimate] = Field(default_factory=list)
    bounce_paths: List[BouncePath] = Field(default_factory=list)
    estimated_room_depth_ft: Optional[float] = None
    estimated_room_width_ft: Optional[float] = None
    estimated_ceiling_height_ft: Optional[float] = None
    scene_complexity: str = "simple"  # simple | moderate | complex
    confidence: float = 0.0
    notes: List[str] = Field(default_factory=list)


# ═══════════════════════════════════════════════════════════════════════════
# Lighting Hypotheses
# ═══════════════════════════════════════════════════════════════════════════


class LightSource(BaseModel):
    """A single light source in a hypothesis."""
    model_config = ConfigDict(extra="forbid")

    role: str = "key"  # key | fill | rim | background | bounce | ambient
    position: Optional[CanonicalCoord] = None
    direction: Optional[CanonicalDirection] = None
    intensity_relative: float = 1.0  # relative to key (key=1.0)
    color_temp_kelvin: Optional[int] = None
    size_class: str = "unknown"  # small | medium | large | very_large | unknown
    modifier: str = "unknown"  # softbox | umbrella | beauty_dish | grid | reflector | bare | window | sun | unknown
    distance_ft_estimate: Optional[float] = None
    confidence: float = 0.0
    notes: List[str] = Field(default_factory=list)


class LightingHypothesis(BaseModel):
    """A complete lighting hypothesis — one candidate interpretation."""
    model_config = ConfigDict(extra="forbid")

    hypothesis_id: str = ""
    sources: List[LightSource] = Field(default_factory=list)
    light_count: int = 0
    modifier_family: str = "unknown"
    environment: str = "unknown"  # studio | natural | mixed | unknown
    pattern_name: str = "unknown"  # rembrandt | loop | butterfly | split | flat | clamshell | unknown
    confidence: float = 0.0
    validation_score: Optional[float] = None  # set after forward simulation
    generation_reason: str = ""  # why this candidate was generated
    constraint_violations: List[str] = Field(default_factory=list)
    notes: List[str] = Field(default_factory=list)


# ═══════════════════════════════════════════════════════════════════════════
# Simulation & Validation
# ═══════════════════════════════════════════════════════════════════════════


class SimulationPrediction(BaseModel):
    """Forward model prediction — what the image should look like given a hypothesis."""
    model_config = ConfigDict(extra="forbid")

    hypothesis_id: str = ""
    predicted_shadow_direction_deg: Optional[float] = None
    predicted_shadow_softness: str = "unknown"  # hard | soft | mixed
    predicted_highlight_direction_deg: Optional[float] = None
    predicted_contrast_ratio: Optional[float] = None
    predicted_catchlight_clock: Optional[int] = None  # 1-12
    predicted_color_temp_kelvin: Optional[int] = None
    predicted_fill_visibility: str = "unknown"  # none | subtle | moderate | strong
    predicted_background_illumination: str = "unknown"  # dark | gradient | even | lit
    confidence: float = 0.0
    notes: List[str] = Field(default_factory=list)


class DimensionMatch(BaseModel):
    """Match score for one predicted vs observed dimension."""
    model_config = ConfigDict(extra="forbid")

    dimension: str = ""
    predicted: Any = None
    observed: Any = None
    match_score: float = 0.0  # 0.0 = complete mismatch, 1.0 = perfect match
    distance: float = 0.0  # raw distance (units depend on dimension)
    notes: str = ""


class ValidationScore(BaseModel):
    """How well a hypothesis matches observations."""
    model_config = ConfigDict(extra="forbid")

    hypothesis_id: str = ""
    overall_score: float = 0.0  # 0.0-1.0
    per_dimension: List[DimensionMatch] = Field(default_factory=list)
    mismatches: List[str] = Field(default_factory=list)  # human-readable mismatch descriptions
    notes: List[str] = Field(default_factory=list)


# ═══════════════════════════════════════════════════════════════════════════
# Solver Trace (debugging / LAB visibility)
# ═══════════════════════════════════════════════════════════════════════════


class SolverTraceStep(BaseModel):
    """One step in the solver trace."""
    model_config = ConfigDict(extra="forbid")

    step_name: str = ""
    step_number: int = 0
    duration_ms: float = 0.0
    input_summary: str = ""
    output_summary: str = ""
    notes: List[str] = Field(default_factory=list)


class SolverTrace(BaseModel):
    """Full debug trace of the solver run."""
    model_config = ConfigDict(extra="forbid")

    steps: List[SolverTraceStep] = Field(default_factory=list)
    total_duration_ms: float = 0.0
    candidates_generated: int = 0
    candidates_pruned: int = 0
    final_candidate_count: int = 0
    rejection_reasons: List[str] = Field(default_factory=list)
    notes: List[str] = Field(default_factory=list)


# ═══════════════════════════════════════════════════════════════════════════
# Top-level Solver Result
# ═══════════════════════════════════════════════════════════════════════════


class SolverResult(BaseModel):
    """Top-level output of the constrained inverse-lighting solver.

    Encapsulates all solver outputs: candidates, consensus, consistency,
    contradictions, and the full solver trace.

    This model is threaded through the pipeline as an enrichment — it
    never replaces any existing field.  Consumer code should check
    ``ok`` before reading solver data.
    """
    model_config = ConfigDict(extra="forbid")

    # ── Candidates ──
    candidates: List[LightingHypothesis] = Field(default_factory=list)
    best_candidate_index: int = 0
    validation_scores: List[ValidationScore] = Field(default_factory=list)

    # ── Consensus ──
    consensus: Optional[ConsensusResult] = None

    # ── Consistency ──
    consistency_scores: List[ConsistencyScore] = Field(default_factory=list)
    overall_consistency: float = 0.0

    # ── Contradictions ──
    contradiction_report: Optional[ContradictionReport] = None

    # ── Scene geometry ──
    scene_geometry: Optional[SceneGeometryModel] = None

    # ── Region reliability ──
    region_reliability: Optional[RegionReliability] = None

    # ── Pass weights ──
    pass_weight_profile: Optional[PassWeightProfile] = None

    # ── Ambiguity classification ──
    ambiguity_class: str = "clean"  # clean | minor_conflicts | genuine_ambiguity | insufficient_data | hybrid_lighting
    ambiguity_notes: List[str] = Field(default_factory=list)

    # ── Trace ──
    solver_trace: Optional[SolverTrace] = None

    # ── Status ──
    ok: bool = True
    notes: List[str] = Field(default_factory=list)

    @property
    def best_candidate(self) -> Optional[LightingHypothesis]:
        """The highest-ranked candidate, or None if no candidates."""
        if self.candidates and 0 <= self.best_candidate_index < len(self.candidates):
            return self.candidates[self.best_candidate_index]
        return None

    @property
    def candidate_count(self) -> int:
        return len(self.candidates)

    @property
    def has_contradictions(self) -> bool:
        return (
            self.contradiction_report is not None
            and self.contradiction_report.has_serious_conflicts
        )
