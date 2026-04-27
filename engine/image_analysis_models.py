"""Structured visual-cue models for image-based lighting reverse engineering.

Architecture
============
image → cue extraction → geometry inference → setup hypothesis → recommendation hints

Each of the 16 visual cues represents one observable property of a photograph.
Together they form a VisualCueReport that feeds a 4-stage inference pipeline:

    1. GeometryInference   — light direction, height, count, fill, shadow pattern
    2. SourceQualityInference — modifier family, transition character
    3. EnvironmentInference — natural vs studio, background treatment, special cases
    4. SetupFamilyInference — primary hypothesis + alternates + ambiguity notes

Design principles:
- Every cue has a ``confidence`` (0.0–1.0) and free-text ``notes``
- Cues are Optional in the aggregate report — graceful degradation per-cue
- Inference stages build on each other; later stages may read earlier outputs
- The pipeline *enriches* existing catchlight-based inference, never replaces it
- Ambiguity is first-class: alternate hypotheses and explicit uncertainty notes
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field

from engine.enums import FieldStatus
from engine.provenance_models import FieldCandidate


# ═══════════════════════════════════════════════════════════════════════════
# 15 Visual Cue Models
# ═══════════════════════════════════════════════════════════════════════════


class ShadowEdgeHardness(BaseModel):
    """Cue 1: How hard or soft are the shadow edges on the subject?"""
    model_config = ConfigDict(extra="forbid")

    classification: str = "unknown"  # hard | soft | mixed | unknown
    transition_width_px: Optional[float] = None  # edge gradient width if measured
    confidence: float = 0.0
    notes: List[str] = Field(default_factory=list)


class PrimaryShadowDirection(BaseModel):
    """Cue 2: Where is the dominant shadow cast relative to the face?"""
    model_config = ConfigDict(extra="forbid")

    direction: str = "unknown"  # upper_left | upper_right | left | right | below | unknown
    clock_angle: Optional[int] = None  # 1–12, like catchlight but for shadow fall
    consistency: str = "unknown"  # consistent | inconsistent | unknown
    confidence: float = 0.0
    notes: List[str] = Field(default_factory=list)


class VerticalLightAngle(BaseModel):
    """Cue 3: Is the key light high, at eye level, or low?"""
    model_config = ConfigDict(extra="forbid")

    angle: str = "unknown"  # high | eye_level | low | unknown
    evidence: str = ""  # e.g. "nose shadow extends to upper lip"
    confidence: float = 0.0
    notes: List[str] = Field(default_factory=list)


class CatchlightPosition(BaseModel):
    """Cue 4: Where are catchlights positioned in the iris?

    Repackages existing catchlight data from the vision pipeline.
    """
    model_config = ConfigDict(extra="forbid")

    left_eye: List[str] = Field(default_factory=list)  # ["10 o'clock", "6 o'clock"]
    right_eye: List[str] = Field(default_factory=list)
    symmetry: str = "unknown"  # symmetric | asymmetric | unknown
    confidence: float = 0.0
    notes: List[str] = Field(default_factory=list)


class CatchlightShape(BaseModel):
    """Cue 5: What shape are the catchlights (modifier signature)?

    Repackages existing catchlight shape data from the vision pipeline.
    size_ratio_mean is the mean catchlight area relative to iris area (0–0.5).
    size_class maps that ratio to a modifier size estimate.
    """
    model_config = ConfigDict(extra="forbid")

    dominant_shape: str = "unknown"  # round | rectangular | mixed | unknown
    shapes_seen: List[str] = Field(default_factory=list)
    size_ratio_mean: Optional[float] = None  # mean(catchlight_area / iris_area), 0–0.5
    size_class: str = "unknown"              # point | small | medium | large | very_large
    confidence: float = 0.0
    notes: List[str] = Field(default_factory=list)


class CatchlightTopology(BaseModel):
    """Multi-catchlight topology analysis.

    Extends basic catchlight detection with secondary/tertiary catchlights
    and cluster geometry classification.  Enables archetype-specific
    signature detection (e.g., triangular clusters for Hurley, strip arrays
    for Penn).
    """
    model_config = ConfigDict(extra="forbid")

    primary: Optional[Dict[str, Any]] = None        # {clock_pos, shape, size_ratio, intensity}
    secondary: Optional[Dict[str, Any]] = None       # same fields
    tertiary: Optional[Dict[str, Any]] = None        # same fields
    catchlight_count: int = 0
    cluster_geometry: str = "unknown"                 # single|dual|triangular|linear|ring|strip
    cluster_spread_deg: float = 0.0                   # angular spread of cluster
    inter_catchlight_spacing: Optional[List[float]] = None  # degrees between each pair
    bilateral_symmetry_score: float = 0.0             # 0=asymmetric, 1=perfectly mirrored
    confidence: float = 0.0
    notes: List[str] = Field(default_factory=list)
    ok: bool = True


class HighlightAxisMap(BaseModel):
    """Per-region facial highlight axis analysis.

    Divides the face into regions (cheeks, nose bridge, chin, jawlines,
    forehead) and measures the highlight gradient direction in each.
    Multiple distinct axes indicate multiple light sources.
    """
    model_config = ConfigDict(extra="forbid")

    regions: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    # e.g. {"left_cheek": {"axis_deg": 45, "width_ratio": 0.6, "intensity": 0.8}, ...}
    dominant_axis_deg: float = 0.0
    axis_count: int = 0                    # number of distinct axis directions (>15° apart)
    axis_consistency: float = 0.0          # 0=chaotic, 1=all regions same axis
    wrap_ratio: float = 0.0               # fraction of face receiving highlight (0-1)
    confidence: float = 0.0
    notes: List[str] = Field(default_factory=list)
    ok: bool = True


class HighlightSymmetry(BaseModel):
    """Bilateral highlight symmetry analysis.

    Compares left vs right face halves to quantify symmetry of illumination,
    detect fill presence, and measure underfill in EV stops.
    """
    model_config = ConfigDict(extra="forbid")

    left_intensity: float = 0.0            # mean highlight intensity, left half
    right_intensity: float = 0.0
    symmetry_score: float = 0.0            # 0=fully asymmetric, 1=perfectly symmetric
    dominant_side: str = "unknown"          # left|right|center|unknown
    intensity_ratio: float = 1.0           # brighter/dimmer (≥1.0)
    fill_detected: bool = False
    fill_side: Optional[str] = None        # opposite of dominant
    underfill_ev: Optional[float] = None   # exposure difference key vs fill
    confidence: float = 0.0
    notes: List[str] = Field(default_factory=list)
    ok: bool = True


class ContinuousSourceSignals(BaseModel):
    """Heuristics for continuous vs strobe light technology.

    Combines catchlight shape analysis, specular edge characteristics,
    and color temperature consistency to infer whether the scene was lit
    by continuous sources (LED panels, tubes) or strobes/flash.
    """
    model_config = ConfigDict(extra="forbid")

    likely_technology: str = "unknown"     # continuous_led|continuous_panel|continuous_tube|strobe|flash|unknown
    technology_confidence: float = 0.0
    evidence: List[str] = Field(default_factory=list)
    specular_edge_sharpness: float = 0.0   # 0=diffuse, 1=razor sharp (strobe indicator)
    color_temp_consistency: float = 0.0    # across highlights (high=continuous, variable=mixed)
    confidence: float = 0.0
    notes: List[str] = Field(default_factory=list)
    ok: bool = True


class BounceContributorAnalysis(BaseModel):
    """Classified bounce/reflector/fill contributor analysis."""
    model_config = ConfigDict(extra="forbid")
    contributors: List[Dict[str, Any]] = Field(default_factory=list)
    primary_fill_type: str = "unknown"
    fill_to_key_ratio: float = 0.0
    total_bounce_contribution: float = 0.0
    confidence: float = 0.0
    notes: List[str] = Field(default_factory=list)
    ok: bool = True


class SeparationLightAnalysis(BaseModel):
    """Hair light / separation light / background spill differentiation."""
    model_config = ConfigDict(extra="forbid")
    has_hair_light: bool = False
    hair_light_direction_deg: Optional[float] = None
    hair_light_intensity: float = 0.0
    hair_light_width_ratio: float = 0.0
    has_rim_light: bool = False
    rim_side: Optional[str] = None
    has_background_spill: bool = False
    spill_vs_intentional_confidence: float = 0.0
    confidence: float = 0.0
    notes: List[str] = Field(default_factory=list)
    ok: bool = True


class OffAxisKeyDetection(BaseModel):
    """Precise key light angle with off-axis detection."""
    model_config = ConfigDict(extra="forbid")
    key_azimuth_deg: float = 0.0
    key_elevation_deg: float = 0.0
    is_off_axis: bool = False
    off_axis_angle_deg: float = 0.0
    detection_method: str = "unknown"
    confidence: float = 0.0
    notes: List[str] = Field(default_factory=list)
    ok: bool = True


class LightStructureDetection(BaseModel):
    """Triangle lighting, loop, Rembrandt, butterfly structure detection."""
    model_config = ConfigDict(extra="forbid")
    nose_shadow_shape: str = "unknown"
    nose_shadow_length_ratio: float = 0.0
    nose_shadow_angle_deg: float = 0.0
    triangle_detected: bool = False
    triangle_cheek: Optional[str] = None
    triangle_completeness: float = 0.0
    pattern_name: str = "unknown"
    confidence: float = 0.0
    notes: List[str] = Field(default_factory=list)
    ok: bool = True

    # ── Enhanced signal fields (v2) ──────────────────────────────────
    # Nose shadow vector: computed from nose-tip shadow centroid, not
    # whole-face Sobel gradient.  More precise for pattern classification.
    nose_shadow_centroid_angle_deg: float = 0.0   # 0-360, nose-specific
    nose_shadow_centroid_distance: float = 0.0    # normalized 0-1

    # Shadow distribution: raw metrics before pattern thresholds
    left_right_asymmetry: float = 0.0             # |left - right| shadow density
    top_bottom_ratio: float = 0.0                 # bottom / max(top, 0.01)
    shadow_density: float = 0.0                   # overall shadow pixel ratio in nose region

    # Triangle isolation: how well the bright triangle stands out from
    # surrounding shadow.  High isolation = genuine Rembrandt triangle.
    # Low isolation = ambient spill or soft fill, not a real triangle.
    triangle_isolation: float = 0.0               # (triangle_bright - surround_dark) / face_mean

    # Highlight width ratio: fraction of face width that is highlight-lit.
    # > 0.5 suggests broad lighting; < 0.3 suggests short/narrow key.
    highlight_width_ratio: float = 0.0


class HighlightToShadowTransition(BaseModel):
    """Cue 6: How quickly do highlights transition to shadow?"""
    model_config = ConfigDict(extra="forbid")

    rate: str = "unknown"  # gradual | sharp | mixed | unknown
    transition_zone_width: Optional[float] = None  # relative measure 0–1
    confidence: float = 0.0
    notes: List[str] = Field(default_factory=list)


class ContrastRatio(BaseModel):
    """Cue 7: What is the overall contrast ratio of the image?"""
    model_config = ConfigDict(extra="forbid")

    ratio: Optional[float] = None  # numeric ratio if measurable
    label: str = "unknown"  # low | medium | high | extreme | unknown
    face_label: Optional[str] = None  # face-region-only contrast label (excludes clothing)
    confidence: float = 0.0
    notes: List[str] = Field(default_factory=list)


class SubjectBackgroundSeparation(BaseModel):
    """Cue 8: How much does the subject separate from the background?"""
    model_config = ConfigDict(extra="forbid")

    luminance_delta: Optional[float] = None  # 0–1 normalized difference
    edge_sharpness: str = "unknown"  # sharp | gradual | none | unknown
    confidence: float = 0.0
    notes: List[str] = Field(default_factory=list)


class BackgroundIllumination(BaseModel):
    """Cue 9: How is the background illuminated?"""
    model_config = ConfigDict(extra="forbid")

    pattern: str = "unknown"  # even | gradient | spot | dark | environmental | unknown
    brightness_relative: str = "unknown"  # brighter | similar | darker | unknown
    confidence: float = 0.0
    notes: List[str] = Field(default_factory=list)


class SpecularHighlightBehavior(BaseModel):
    """Cue 10: How do specular highlights behave on the skin?"""
    model_config = ConfigDict(extra="forbid")

    intensity: str = "unknown"  # strong | moderate | subtle | none | unknown
    spread: str = "unknown"  # broad | tight | unknown
    count_estimate: int = 0
    confidence: float = 0.0
    notes: List[str] = Field(default_factory=list)


class ReflectionArchitecture(BaseModel):
    """Cue 11: Overall catchlight/reflection count and symmetry across both eyes."""
    model_config = ConfigDict(extra="forbid")

    total_catchlights: int = 0
    per_eye_counts: Dict[str, int] = Field(default_factory=dict)  # {"left": 2, "right": 2}
    symmetry_score: float = 0.0  # 0 = asymmetric, 1 = perfectly symmetric
    confidence: float = 0.0
    notes: List[str] = Field(default_factory=list)


class MultiShadowDetection(BaseModel):
    """Cue 12: Are there multiple distinct shadow directions (multi-light)?"""
    model_config = ConfigDict(extra="forbid")

    shadow_count: int = 0
    angular_spread: Optional[float] = None  # degrees between most extreme shadows
    confidence: float = 0.0
    notes: List[str] = Field(default_factory=list)


class EnvironmentalShadowContinuity(BaseModel):
    """Cue 13: Do shadows suggest natural/environmental light vs. artificial?

    Key indicators:
    - Natural sunlight: sharp parallel shadows, warm color cast, consistent direction
    - Dappled foliage: irregular shadow patterns, soft and hard edges mixed
    - Studio: clean falloff, controlled spill, no environmental artifacts
    """
    model_config = ConfigDict(extra="forbid")

    has_natural_indicators: bool = False
    has_artificial_indicators: bool = False
    environment_hints: List[str] = Field(default_factory=list)  # ["dappled_foliage", "window_light", "direct_sun"]
    confidence: float = 0.0
    notes: List[str] = Field(default_factory=list)


class PoseInducedShadowInterference(BaseModel):
    """Cue 14: Are there shadows caused by the subject's pose rather than lighting?

    Common cases:
    - Chin shadow on chest (head tilted down)
    - Arm shadow on torso (crossed arms)
    - Hand shadow on face (hand on chin pose)
    These can confuse lighting inference if not identified.
    """
    model_config = ConfigDict(extra="forbid")

    detected: bool = False
    interference_regions: List[str] = Field(default_factory=list)  # ["chin_shadow", "arm_shadow"]
    severity: str = "none"  # none | mild | moderate | severe
    confidence: float = 0.0
    notes: List[str] = Field(default_factory=list)


class TonalProcessingEstimation(BaseModel):
    """Cue 15: Has the image been heavily processed (B&W, high-contrast grade, film look)?

    When detected, downstream inference should:
    - Discount color-temperature cues
    - Note that contrast may be editorial rather than from lighting
    - Flag uncertainty in modifier inference (hard shadows may be grading, not hard light)
    """
    model_config = ConfigDict(extra="forbid")

    is_bw: bool = False
    is_high_contrast_grade: bool = False
    is_desaturated: bool = False
    # True only when histogram shows actual pixel-level highlight clipping
    # (p99 ≥ CLIP_P99_MIN AND p99-p95 < CLIP_P99_DELTA). Distinct from
    # is_high_contrast_grade, which also fires on crushed-shadow scenes that
    # have no clipped highlights at all. Source of truth for the
    # blown_highlights edge-case flag.
    highlights_clipped: bool = False
    estimated_processing: str = "none"  # none | bw | high_contrast | film_emulation | heavy_grade | unknown
    mean_saturation: float = 0.0  # HSV mean saturation (0-255), used to detect warm toning in B&W
    confidence: float = 0.0
    notes: List[str] = Field(default_factory=list)


class ShadowInterruptionPattern(BaseModel):
    """Cue 16: Shadow shapes suggesting gobo, projection, or slit lighting.

    Detects when shadow shapes form straight geometric bars, cross the face
    in unnatural directions, or appear as projected/repeated patterns.  When
    detected, downstream inference should:

    - Reduce confidence in traditional pattern-family inference (Rembrandt,
      loop, butterfly, etc.) because the shadow geometry comes from the
      modifier obstruction, not key-to-subject angle.
    - Add gobo/projection/slit-light hypotheses.
    - Note that shadow direction and edge cues may be unreliable.
    """
    model_config = ConfigDict(extra="forbid")

    detected: bool = False
    classification: str = "none"  # none | geometric_bar | patterned_projection | unknown
    line_count: int = 0
    line_parallelism: float = 0.0  # 0-1, how parallel detected lines are
    periodicity_score: float = 0.0  # 0-1, regularity of line spacing
    shadow_face_incongruence: float = 0.0  # 0-1, how much lines defy facial contour
    confidence: float = 0.0
    notes: List[str] = Field(default_factory=list)


class NoseShadowLength(BaseModel):
    """Nose shadow drop length — disambiguates butterfly / loop / rembrandt.

    Measures how far below the nose tip the cast shadow extends,
    normalised to face height so it is scale-invariant.

    length_ratio thresholds:
      < 0.10  → butterfly / paramount (shadow barely drops below tip)
      0.10–0.30 → loop (shadow drops to upper-lip level)
      0.30–0.50 → loop / rembrandt transition
      > 0.50  → rembrandt / dramatic (shadow extends to chin region)
    """
    model_config = ConfigDict(extra="forbid")

    length_ratio: float = 0.0        # shadow_extension_px / face_height
    shadow_label: str = "unknown"    # butterfly | loop | loop_rembrandt | rembrandt | dramatic
    nose_tip_y_ratio: float = 0.0    # nose tip y / face_height (sanity check)
    confidence: float = 0.0
    notes: List[str] = Field(default_factory=list)


class ShadowContinuity(BaseModel):
    """Shadow connectivity — confirms or denies the Rembrandt triangle.

    A true Rembrandt triangle requires that the nose shadow connects
    continuously to the cheek shadow.  Disconnected shadows → loop.

    Measures a connectivity score in the lower-nose / upper-cheek region.
    """
    model_config = ConfigDict(extra="forbid")

    triangle_connected: bool = False      # nose shadow joins cheek shadow
    connectivity_score: float = 0.0      # 0=fully disconnected, 1=fully merged
    gap_width_ratio: float = 0.0         # gap between shadows / face width (0=connected)
    confidence: float = 0.0
    notes: List[str] = Field(default_factory=list)


class FillRatio(BaseModel):
    """Shadow-side vs key-side luminance ratio — quantifies fill light level.

    Computed by splitting the face box into lit and shadow halves and
    comparing their mean luminance in the skin region.

    ratio interpretation:
      > 0.75   → flat / very soft fill (nearly equal sides)
      0.55–0.75 → gentle fill, 1:2 to 1:3 ratio
      0.35–0.55 → moderate fill, 1:4 ratio
      0.20–0.35 → low fill, 1:8 ratio
      < 0.20   → no fill / dramatic / low-key
    """
    model_config = ConfigDict(extra="forbid")

    ratio: float = 0.0               # shadow_side_mean / lit_side_mean (0–1)
    fill_label: str = "unknown"      # flat | soft_fill | moderate_fill | low_fill | no_fill
    lit_side_mean: float = 0.0
    shadow_side_mean: float = 0.0
    confidence: float = 0.0
    notes: List[str] = Field(default_factory=list)


class ShadowPenumbra(BaseModel):
    """Shadow penumbra width — proxy for apparent source angular size.

    Wider penumbra → larger apparent source (bigger or closer modifier).
    Derived from ``shadow_penumbra_pass`` in the extended vision pipeline.
    """
    model_config = ConfigDict(extra="forbid")

    penumbra_width_px: float = 0.0          # mean transition zone width in pixels
    penumbra_width_ratio: float = 0.0       # width / face dimension (normalised)
    apparent_source_size: str = "unknown"   # point | small | medium | large | very_large
    penumbra_uniformity: float = 0.0        # 0=variable edges, 1=all same width
    confidence: float = 0.0
    notes: List[str] = Field(default_factory=list)


class EyeSocketShadow(BaseModel):
    """Eye socket shadow depth — secondary key-height signal from brow ridge.

    A high key light casts the brow ridge shadow downward into the eye socket,
    creating a dark band above the iris.  Measuring that region's relative
    luminance directly encodes key elevation without requiring catchlights.

    depth_ratio: (face_mean_lum - socket_mean_lum) / face_mean_lum
        High values (>0.20) → significant shadow above iris → high key
        Low values (<0.10)  → little or no shadow → eye-level or low key

    height_label:
        "high"       depth_ratio > 0.25
        "eye_level"  0.10 – 0.25
        "low"        depth_ratio < 0.10
    """
    model_config = ConfigDict(extra="forbid")

    depth_ratio: float = 0.0          # (face_mean - socket_mean) / face_mean
    socket_mean_lum: float = 0.0      # mean luminance in the brow/socket band
    face_mean_lum: float = 0.0        # mean luminance of the broader face region
    height_label: str = "unknown"     # high | eye_level | low | unknown
    confidence: float = 0.0
    notes: List[str] = Field(default_factory=list)


class FaceOrientation(BaseModel):
    """Face yaw (turn angle) — disambiguates broad from short lighting.

    Computed from landmark geometry by comparing nose-to-left-edge vs
    nose-to-right-edge distances relative to total face width.

    yaw range [-1, 1]:
        > 0   → face turned toward image-right (camera sees more of image-left side)
        < 0   → face turned toward image-left  (camera sees more of image-right side)
        ~0    → frontal (cannot distinguish broad from short)

    broad_side: the image-direction where the key light would need to come
                from in order to illuminate the MORE visible (wider) cheek.
                This is the "broad lighting" position.
    short_side: the image-direction where the key illuminates the LESS visible
                (narrower / turned-away) cheek = short lighting.

    Thresholds:
        |yaw| < 0.12   → frontal — can't reliably distinguish broad/short
        0.12–0.25      → slight turn
        0.25–0.40      → moderate turn (typical 3/4 portrait)
        > 0.40         → significant turn
    """
    model_config = ConfigDict(extra="forbid")

    yaw: float = 0.0                     # -1 to 1 (see above)
    yaw_label: str = "frontal"           # frontal | slight_right | moderate_right | significant_right
                                         # | slight_left | moderate_left | significant_left
    broad_side: str = "unknown"          # left | right | unknown — which image-direction = broad
    short_side: str = "unknown"          # left | right | unknown — which image-direction = short
    confidence: float = 0.0
    notes: List[str] = Field(default_factory=list)


# ═══════════════════════════════════════════════════════════════════════════
# Aggregate Cue Report
# ═══════════════════════════════════════════════════════════════════════════


class VisualCueReport(BaseModel):
    """Aggregate of all 16 visual cues extracted from an image.

    Every cue is Optional — if extraction fails for one cue, the others
    are still usable. ``cues_computed`` tracks how many succeeded.
    """
    model_config = ConfigDict(extra="forbid")

    shadow_edge_hardness: Optional[ShadowEdgeHardness] = None
    primary_shadow_direction: Optional[PrimaryShadowDirection] = None
    vertical_light_angle: Optional[VerticalLightAngle] = None
    catchlight_position: Optional[CatchlightPosition] = None
    catchlight_shape: Optional[CatchlightShape] = None
    catchlight_topology: Optional[CatchlightTopology] = None
    highlight_axis_map: Optional[HighlightAxisMap] = None
    highlight_symmetry: Optional[HighlightSymmetry] = None
    continuous_source_signals: Optional[ContinuousSourceSignals] = None
    bounce_contributor: Optional[BounceContributorAnalysis] = None
    separation_light: Optional[SeparationLightAnalysis] = None
    off_axis_key: Optional[OffAxisKeyDetection] = None
    light_structure: Optional[LightStructureDetection] = None
    highlight_to_shadow_transition: Optional[HighlightToShadowTransition] = None
    contrast_ratio: Optional[ContrastRatio] = None
    subject_background_separation: Optional[SubjectBackgroundSeparation] = None
    background_illumination: Optional[BackgroundIllumination] = None
    specular_highlight_behavior: Optional[SpecularHighlightBehavior] = None
    reflection_architecture: Optional[ReflectionArchitecture] = None
    multi_shadow_detection: Optional[MultiShadowDetection] = None
    environmental_shadow_continuity: Optional[EnvironmentalShadowContinuity] = None
    pose_induced_shadow_interference: Optional[PoseInducedShadowInterference] = None
    tonal_processing_estimation: Optional[TonalProcessingEstimation] = None
    shadow_interruption_pattern: Optional[ShadowInterruptionPattern] = None
    projected_pattern_shape: Optional[str] = None  # cross | vertical_slit | horizontal_slit | None
    shadow_penumbra: Optional[ShadowPenumbra] = None
    nose_shadow_length: Optional[NoseShadowLength] = None
    shadow_continuity: Optional[ShadowContinuity] = None
    fill_ratio: Optional[FillRatio] = None
    face_orientation: Optional[FaceOrientation] = None
    eye_socket_shadow: Optional[EyeSocketShadow] = None

    warm_cool_split: bool = False  # CV-derived: key warm, shadow cool, gap >1500K

    cues_computed: int = 0
    ok: bool = True
    notes: List[str] = Field(default_factory=list)

    def overall_confidence(self) -> float:
        """Weighted average confidence across all populated cues."""
        confidences = []
        for cue_field in [
            self.shadow_edge_hardness,
            self.primary_shadow_direction,
            self.vertical_light_angle,
            self.catchlight_position,
            self.catchlight_shape,
            self.catchlight_topology,
            self.highlight_axis_map,
            self.highlight_symmetry,
            self.continuous_source_signals,
            self.bounce_contributor,
            self.separation_light,
            self.off_axis_key,
            self.light_structure,
            self.highlight_to_shadow_transition,
            self.contrast_ratio,
            self.subject_background_separation,
            self.background_illumination,
            self.specular_highlight_behavior,
            self.reflection_architecture,
            self.multi_shadow_detection,
            self.environmental_shadow_continuity,
            self.pose_induced_shadow_interference,
            self.tonal_processing_estimation,
            self.shadow_interruption_pattern,
        ]:
            if cue_field is not None:
                confidences.append(cue_field.confidence)
        if not confidences:
            return 0.0
        return sum(confidences) / len(confidences)


# ═══════════════════════════════════════════════════════════════════════════
# Inference Stage Models (dataclasses — pure computation, no I/O)
# ═══════════════════════════════════════════════════════════════════════════


@dataclass
class GeometryInference:
    """Stage 1: Light geometry inferred from shadow and catchlight cues."""

    key_light_direction: str = "unknown"  # upper_left | upper_right | top_center | left | right | unknown
    key_light_height: str = "unknown"  # high | eye_level | low | unknown
    light_count_estimate: int = 0
    has_fill: bool = False
    fill_position: Optional[str] = None
    shadow_pattern: str = "unknown"  # rembrandt | loop | split | butterfly | flat | unknown
    confidence: float = 0.0
    notes: List[str] = field(default_factory=list)
    field_status: FieldStatus = FieldStatus.UNKNOWN

    # ── Continuous angle estimates ─────────────────────────────────────────
    # These are CV-derived estimates, not ground truth.  They bridge the gap
    # between categorical labels ("high", "upper_left") and the degree values
    # used by the blueprint service for physical reconstruction.
    # Elevation: 0° = eye level, 90° = directly overhead, negative = below.
    # Azimuth:   0° = camera axis (on-axis), ±45° = classic 45° key position,
    #            ±90° = side light, ±120°+ = rim/backlight territory.
    key_elevation_deg_estimate: Optional[float] = None   # 0–90° (key above eye level)
    key_azimuth_deg_estimate: Optional[float] = None     # 0–±180° (0 = on-axis)


@dataclass
class SourceQualityInference:
    """Stage 2: Modifier / source quality inferred from transition and specular cues."""

    key_modifier_family: str = "unknown"  # softbox | beauty_dish | umbrella | hard_source | window | ambient | unknown
    transition_character: str = "unknown"  # gradual | sharp | mixed | unknown
    confidence: float = 0.0
    notes: List[str] = field(default_factory=list)
    field_status: FieldStatus = FieldStatus.UNKNOWN


@dataclass
class EnvironmentInference:
    """Stage 3: Shooting environment inferred from background and shadow continuity cues.

    Special cases (populated in ``special_cases`` list):
    - ``"dappled_foliage"``  — mixed hard/soft edges, natural indicators
    - ``"direct_sunlight"``  — hard parallel shadows, warm cast
    - ``"window_light"``     — single-source soft, environmental indicators
    - ``"bw_processing"``    — B&W conversion detected, color cues unreliable
    - ``"high_contrast_grade"`` — editorial grading, contrast may not reflect lighting
    - ``"pose_shadow_interference"`` — pose-caused shadows may confuse inference
    """

    is_natural_light: bool = False
    environment_type: str = "unknown"  # studio | indoor_ambient | outdoor_shade | outdoor_sun | mixed | unknown
    background_treatment: str = "unknown"  # controlled | environmental | virtual | unknown
    confidence: float = 0.0
    special_cases: List[str] = field(default_factory=list)
    notes: List[str] = field(default_factory=list)
    field_status: FieldStatus = FieldStatus.UNKNOWN


@dataclass
class SetupFamilyInference:
    """Stage 4: Final setup hypothesis combining all prior stages.

    Outputs a primary hypothesis, alternates ranked by confidence,
    and explicit ambiguity notes for transparent reporting.
    """

    primary_hypothesis: str = "unknown"
    primary_confidence: float = 0.0
    alternate_hypotheses: List[FieldCandidate] = field(default_factory=list)
    # Each alternate: FieldCandidate(value=hypothesis, source="cue_inference",
    #                                confidence=..., demotion_reason=reason)
    ambiguity_notes: List[str] = field(default_factory=list)
    recommendation_hints: List[str] = field(default_factory=list)
    notes: List[str] = field(default_factory=list)
    field_status: FieldStatus = FieldStatus.UNKNOWN


# ═══════════════════════════════════════════════════════════════════════════
# Reference Photo Analysis — Three-Layer Read
# ═══════════════════════════════════════════════════════════════════════════


class ImageRead(BaseModel):
    """What is happening in the image — scene, mood, visual devices."""
    model_config = ConfigDict(extra="forbid")

    genre: str = "unknown"  # portrait | editorial | beauty | fashion | headshot | environmental | unknown
    subject_type: str = ""  # e.g. "woman", "man", "couple", "group of four"
    subject_count: int = 1  # how many subjects visible
    subject_skin_tones: List[str] = Field(default_factory=list)  # e.g. ["medium", "fair"]
    skin_tone_mixed: bool = False  # True when subjects have different skin tones
    visual_intent: str = ""
    mood: str = ""
    camera_subject_relationship: str = ""
    pose_notes: str = ""
    scene_description: str = ""  # VLM-enriched scene context: where, what, atmosphere
    background_relationship: str = ""
    contrast_shadow_feel: str = ""
    notable_visual_devices: List[str] = Field(default_factory=list)
    lighting_style: str = ""  # VLM high-level lighting family (e.g. "rembrandt", "clamshell")
    likely_photographer: str = ""  # VLM-identified photographer style (e.g. "Peter Lindbergh")
    narrative: str = ""
    confidence: float = 0.0
    resolution_quality: str = "unknown"  # excellent | good | fair | poor | unknown
    notes: List[str] = Field(default_factory=list)


class LightingRead(BaseModel):
    """Consolidated lighting analysis — what the light is doing."""
    model_config = ConfigDict(extra="forbid")

    source_quality: str = "unknown"  # hard | soft | mixed | unknown
    source_direction: str = "unknown"
    shadow_pattern: str = "unknown"  # rembrandt | loop | split | butterfly | flat | gobo | unknown
    shadow_pattern_detail: str = ""  # descriptive detail (e.g. "grid/window gobo") when available
    fill_presence: str = "unknown"  # none | subtle | moderate | strong | unknown
    fill_direction: str = "unknown"  # below | camera-left | camera-right | camera-axis | none | unknown
    rim_presence: str = "unknown"  # none | subtle | strong | unknown
    light_count: int = 0
    lighting_family: str = "unknown"
    tonal_processing_notes: str = ""
    key_observations: List[str] = Field(default_factory=list)
    ambiguity_notes: List[str] = Field(default_factory=list)
    confidence: float = 0.0
    resolution_quality: str = "unknown"  # excellent | good | fair | poor | unknown
    data_quality: str = "full"  # full | face_limited | environmental_limited
    archetype_classification: Optional[Dict[str, Any]] = None  # from archetype_classifier
    notes: List[str] = Field(default_factory=list)
    # Structured contradictions detected while building this lighting read.
    # Populated by build_lighting_read() when paradoxes are observed (e.g.,
    # catchlight-vs-shadow-direction horizontal mismatch). Surfaced through
    # PatternCandidates.contradictions so API consumers and downstream
    # triage can act on the signal. Doctrinal note: persistence only —
    # acting on these contradictions (e.g., demoting shadow-direction-
    # derived candidates per "catchlights before pattern") is downstream
    # work in the Complex-Lighting Strategy Phase 3 complexity scorer.
    contradictions: List[str] = Field(default_factory=list)


class RecreationSetup(BaseModel):
    """Practical recreation guidance — how to build this setup."""
    model_config = ConfigDict(extra="forbid")

    setup_family: str = "unknown"
    modifier_suggestion: str = "unknown"
    light_count: int = 0
    key_placement: str = ""
    fill_strategy: str = ""
    background_strategy: str = ""
    camera_subject_guidance: str = ""
    focal_length: str = ""       # e.g. "85-135mm"
    aperture: str = ""           # e.g. "f/2.8-5.6"
    setup_notes: List[str] = Field(default_factory=list)
    alternate_hypotheses: List[Dict[str, Any]] = Field(default_factory=list)
    confidence: float = 0.0
    resolution_quality: str = "unknown"  # excellent | good | fair | poor | unknown
    notes: List[str] = Field(default_factory=list)


class VLMGeometrySignals(BaseModel):
    """Observable camera/subject geometry extracted by VLM."""
    model_config = ConfigDict(extra="forbid")

    camera_height_relative_to_eyes: Optional[str] = None   # "above" | "at_eye_level" | "below"
    camera_horizontal_angle: Optional[str] = None           # "straight_on" | "slight_left" | "slight_right" | "profile_left" | "profile_right"
    head_rotation_deg: Optional[float] = None               # -90 (left) to 90 (right)
    torso_rotation_deg: Optional[float] = None              # -90 to 90
    shoulder_line_angle: Optional[float] = None             # degrees from horizontal, -45 to 45
    subject_lean: Optional[str] = None                      # "none" | "toward_camera" | "away" | "left" | "right"
    confidence: float = 0.0
    notes: List[str] = Field(default_factory=list)


class VLMShadowSignals(BaseModel):
    """Observable shadow physics extracted by VLM."""
    model_config = ConfigDict(extra="forbid")

    shadow_vector_deg: Optional[float] = None               # 0-360, direction shadow falls (0 = down from above)
    shadow_softness: Optional[float] = None                 # 0.0 (razor sharp) to 1.0 (fully diffused)
    shadow_length_ratio: Optional[float] = None             # nose shadow length / nose length
    shadow_visible_on: List[str] = Field(default_factory=list)  # e.g. ["nose", "jaw_left", "neck", "cheek_right"]
    confidence: float = 0.0
    notes: List[str] = Field(default_factory=list)


class VLMHighlightSignals(BaseModel):
    """Observable highlight physics extracted by VLM."""
    model_config = ConfigDict(extra="forbid")

    highlight_width_ratio: Optional[float] = None           # 0.0–1.0, lit side width / total face width
    highlight_specularity: Optional[float] = None           # 0.0 (matte diffuse) to 1.0 (mirror specular)
    highlight_axis_deg: Optional[float] = None              # angle of highlight band relative to vertical
    confidence: float = 0.0
    notes: List[str] = Field(default_factory=list)


class VLMCatchlightSignals(BaseModel):
    """Observable catchlight details extracted by VLM."""
    model_config = ConfigDict(extra="forbid")

    catchlight_count: Optional[int] = None                  # total distinct light sources visible in eyes
    catchlight_shape: Optional[str] = None                  # "round" | "rectangular" | "octagonal" | "strip" | "mixed" | "none_visible"
    catchlight_position: Optional[str] = None               # clock position of primary, e.g. "10_oclock"
    catchlight_relative_intensity: Optional[str] = None     # "bright" | "dim" | "mixed"
    jewellery_catchlight_suspected: bool = False             # True when VLM sees a lateral catchlight likely caused by earrings/jewellery
    confidence: float = 0.0
    notes: List[str] = Field(default_factory=list)


class VLMReconstructionEstimates(BaseModel):
    """VLM's best estimates for scene reconstruction.

    These are ESTIMATES only — the NGW rule engine makes final lighting decisions.
    """
    model_config = ConfigDict(extra="forbid")

    key_light_angle_deg: Optional[float] = None             # 0–180, angle from camera axis
    key_light_height: Optional[str] = None                  # "high" | "eye_level" | "low"
    modifier_size_class: Optional[str] = None               # "small" | "medium" | "large" | "very_large"
    fill_present: Optional[bool] = None
    negative_fill: Optional[bool] = None                    # v-flat / black flag visible or implied
    background_light_present: Optional[bool] = None
    background_distance_category: Optional[str] = None      # "close" | "moderate" | "far" | "infinity"
    confidence: float = 0.0
    notes: List[str] = Field(default_factory=list)


class ColorPalette(BaseModel):
    """Color analysis for a reference photo — dominant palette, contrasting pairs, light temperature."""
    model_config = ConfigDict(extra="forbid")

    dominant_colors: List[str] = Field(default_factory=list)
    # e.g. ["deep teal", "jade green", "warm amber skin", "black"]

    dominant_color_hexes: List[str] = Field(default_factory=list)
    # Approximate hex code per dominant_color, same order — e.g. ["#2E6B6A", "#4A8C5C", "#C9956A", "#1A1A1A"]

    contrasting_pairs: List[str] = Field(default_factory=list)
    # e.g. ["green qipao vs red parrot (complementary)", "warm skin vs cool teal background (warm/cool split)"]

    color_temperature_key: str = ""
    # Warm (~3200-4500K) | Neutral (~5500K) | Cool (~6500K+) | Mixed
    # e.g. "Neutral — consistent 5600K strobe"

    color_temperature_shadows: str = ""
    # e.g. "Cool — blue shadow fill from ambient bounce"

    warm_cool_split: bool = False
    # True when there is a deliberate warm/cool contrast between key light and shadows

    background_color: str = ""
    # e.g. "dark teal" | "white seamless" | "warm grey" | "black"

    color_harmony: str = ""
    # Primary harmony: analogous | complementary | split_complementary | triadic | monochromatic | neutral | warm_cool_split | unknown

    alternate_harmonies: List[str] = Field(default_factory=list)
    # Additional applicable harmonies beyond the primary — e.g. ["warm_cool_split", "triadic"]
    # UI shows these as selectable palette views

    harmony_swatches: Dict[str, List[str]] = Field(default_factory=dict)
    # Per-harmony color subsets from dominant_colors, keyed by harmony name.
    # e.g. {"complementary": ["vivid red", "deep teal"], "warm_cool_split": ["warm skin", "cool grey bg"]}
    # UI swaps displayed swatches when user picks a harmony tab.

    palette_character: str = ""
    # e.g. "Muted, desaturated — dark tones dominate with one vivid accent"

    color_grading_notes: str = ""
    # Any notable post-processing colour treatment observed

    confidence: float = 0.0
    notes: List[str] = Field(default_factory=list)


class VLMSignals(BaseModel):
    """Container for all VLM-extracted physical signals.

    Organized by observation domain (geometry, shadows, highlights, catchlights,
    reconstruction). Each sub-model carries its own confidence score.
    The rule engine consumes these signals — the VLM never makes final lighting decisions.
    """
    model_config = ConfigDict(extra="forbid")

    geometry: Optional[VLMGeometrySignals] = None
    shadows: Optional[VLMShadowSignals] = None
    highlights: Optional[VLMHighlightSignals] = None
    catchlights: Optional[VLMCatchlightSignals] = None
    reconstruction: Optional[VLMReconstructionEstimates] = None
    color_palette: Optional[ColorPalette] = None


class VLMDescription(BaseModel):
    """Structured output from a vision-language model describing a reference photo.

    Contains two layers:
    1. Subject/scene fields — cosmetic details, expression, styling, mood (legacy)
    2. Physical signals — geometry, shadows, highlights, catchlights (new)

    The signals namespace provides measurable observations that the rule engine
    interprets. The VLM extracts signals only; final lighting decisions are
    always made by the NGW rule engine.
    """
    model_config = ConfigDict(extra="forbid")

    # ── Legacy subject/scene fields (preserved for backward compatibility) ──
    subject_type: str = ""              # e.g. "woman", "man", "couple", "group of four"
    subject_count: int = 1              # how many people are visible
    apparent_skin_tones: List[str] = Field(default_factory=list)  # ["medium", "fair"]
    skin_tone_mixed: bool = False       # True when subjects have visibly different skin tones
    framing: str = ""                   # e.g. "extreme close-up, face and neck only"
    pose: str = ""                      # e.g. "head tilted left, chin down, direct gaze"
    expression: str = ""                # e.g. "intense, confrontational"
    styling_details: List[str] = Field(default_factory=list)  # ["heavy lashes", "glossy lips"]
    notable_features: List[str] = Field(default_factory=list) # ["strong jawline", "cheekbones emphasized"]
    background_context: str = ""        # e.g. "dark, no visible elements"
    clothing_accessories: str = ""      # e.g. "bare shoulders, no jewelry visible"
    overall_mood: str = ""              # e.g. "dramatic, mysterious"
    lighting_style: str = ""            # e.g. "rembrandt", "clamshell", "natural/ambient"
    likely_photographer: str = ""       # e.g. "Peter Lindbergh" or "unknown"
    derivation: Dict[str, str] = Field(default_factory=dict)  # reasoning for each VLM conclusion

    # ── Physical signals (new — rule engine consumes these) ──
    signals: Optional[VLMSignals] = None

    ok: bool = True
    notes: List[str] = Field(default_factory=list)


# ═══════════════════════════════════════════════════════════════════════════
# VLW Reconciliation  — VLM hypothesis vs CV evidence comparison
# ═══════════════════════════════════════════════════════════════════════════


class VLWDimensionResult(BaseModel):
    """Result of comparing VLM vs CV for a single lighting dimension."""
    model_config = ConfigDict(extra="forbid")

    dimension: str = ""           # lighting_pattern | light_count | source_quality | fill_presence | scene_type | mood
    vlm_value: str = ""           # VLM's mapped conclusion
    cv_value: str = ""            # CV's conclusion from LightingRead
    agreement: str = "unknown"    # confirmed | conflicting | vlm_only | cv_only | both_inconclusive
    confidence_boost: float = 0.0
    recommended_value: str = ""
    recommendation_source: str = ""  # cv | vlm | merged | human_review_required
    explanation: str = ""
    notes: List[str] = Field(default_factory=list)


class VLWReconciliation(BaseModel):
    """Aggregate VLM-vs-CV reconciliation across all lighting dimensions."""
    model_config = ConfigDict(extra="forbid")

    dimensions: List[VLWDimensionResult] = Field(default_factory=list)
    overall_agreement: str = "unknown"  # strong_agreement | partial_agreement | significant_conflict | vlm_unavailable
    conflict_count: int = 0
    confirmed_count: int = 0
    vlm_only_count: int = 0
    cv_only_count: int = 0
    requires_human_review: bool = False
    human_review_reasons: List[str] = Field(default_factory=list)
    proposed_adjustments: List[str] = Field(default_factory=list)
    confidence_delta: float = 0.0
    notes: List[str] = Field(default_factory=list)


class ReferencePhotoAnalysis(BaseModel):
    """Top-level container for the three-layer reference photo read."""
    model_config = ConfigDict(extra="forbid")

    image_read: Optional[ImageRead] = None
    lighting_read: Optional[LightingRead] = None
    recreation_setup: Optional[RecreationSetup] = None
    color_palette: Optional[ColorPalette] = None
    vlm_description: Optional[VLMDescription] = None
    vlw_reconciliation: Optional[VLWReconciliation] = None
    ok: bool = True
    notes: List[str] = Field(default_factory=list)


# ═══════════════════════════════════════════════════════════════════════════
# VLM Reconstruction  — intermediate physical reconstruction from pipeline signals
# ═══════════════════════════════════════════════════════════════════════════


class VLMReconModifierCandidate(BaseModel):
    """A modifier family candidate with confidence."""
    model_config = ConfigDict(extra="allow")

    type: str = "unknown"
    confidence: float = 0.0


class VLMReconRole(BaseModel):
    """Presence/confidence for a single light role."""
    model_config = ConfigDict(extra="allow")

    present: Optional[bool] = None
    confidence: float = 0.0


class VLMReconRoles(BaseModel):
    """All possible light roles in a reconstruction."""
    model_config = ConfigDict(extra="allow")

    key: VLMReconRole = Field(default_factory=VLMReconRole)
    fill: VLMReconRole = Field(default_factory=VLMReconRole)
    negative_fill: VLMReconRole = Field(default_factory=VLMReconRole)
    rim: VLMReconRole = Field(default_factory=VLMReconRole)
    kicker: VLMReconRole = Field(default_factory=VLMReconRole)
    background: VLMReconRole = Field(default_factory=VLMReconRole)
    bounce: VLMReconRole = Field(default_factory=VLMReconRole)


class VLMReconCandidate(BaseModel):
    """One reconstruction candidate from the VLM reconstruction layer."""
    model_config = ConfigDict(extra="allow")

    candidate_id: str = "candidate_1"
    key_light_angle_deg: Optional[float] = None
    key_light_height_class: Optional[str] = None
    key_light_height_deg_estimate: Optional[float] = None
    key_light_distance_class: Optional[str] = None
    key_light_distance_ft_estimate: Optional[float] = None
    source_size_class: Optional[str] = None
    modifier_family_candidates: List[VLMReconModifierCandidate] = Field(default_factory=list)
    environment: str = "unknown"
    likely_light_count: Optional[int] = None
    roles: Optional[VLMReconRoles] = None
    confidence_score: float = 0.0
    ambiguity_notes: List[str] = Field(default_factory=list)


class VLMReconPrimary(BaseModel):
    """The primary reconstruction — most likely physical interpretation."""
    model_config = ConfigDict(extra="allow")

    dominant_source_direction_deg: Optional[float] = None
    dominant_source_height_class: Optional[str] = None
    dominant_source_height_deg_estimate: Optional[float] = None
    dominant_source_distance_class: Optional[str] = None
    dominant_source_distance_ft: Optional[float] = None
    source_size_class: Optional[str] = None
    modifier_family_candidates: List[VLMReconModifierCandidate] = Field(default_factory=list)
    environment: str = "unknown"
    likely_light_count: Optional[int] = None
    roles: Optional[VLMReconRoles] = None
    reconstruction_confidence: float = 0.0
    ambiguity_notes: List[str] = Field(default_factory=list)
    contradiction_notes: List[str] = Field(default_factory=list)


class VLMReconstruction(BaseModel):
    """Complete VLM reconstruction output — intermediate physical reconstruction.

    Contains one primary reconstruction and up to 3 candidates when ambiguity
    exists. This sits between signal extraction and the NGW rule engine.
    """
    model_config = ConfigDict(extra="allow")

    primary_reconstruction: VLMReconPrimary = Field(default_factory=VLMReconPrimary)
    candidates: List[VLMReconCandidate] = Field(default_factory=list)
    ok: bool = True
    notes: List[str] = Field(default_factory=list)

    # ── Review & confidence (populated by solver trace) ──
    needs_review: bool = False
    needs_review_reasons: List[str] = Field(default_factory=list)
    validation_scores: Optional[Dict[str, float]] = None  # direction/height/modifier/distance/environment consistency
    contradiction_notes: List[str] = Field(default_factory=list)
    ambiguity_notes: List[str] = Field(default_factory=list)
    signal_reliability_summary: Optional[Dict[str, str]] = None  # pass_name → "high"/"moderate"/"low"/"excluded"
    solver_trace_summary: Optional[Dict[str, Any]] = None  # top_contributors, downgraded_signals, etc.

    # ── Master profile / archetype (from archetype_classifier) ──
    master_profile: Optional[str] = None            # primary MasterProfile enum value
    master_profile_confidence: float = 0.0
    style_family: Optional[str] = None              # StyleFamily enum value


# ═══════════════════════════════════════════════════════════════════════════
# Scene Context  — computed once, threaded through the reference read
# ═══════════════════════════════════════════════════════════════════════════


@dataclass
class SceneContext:
    """Computed once from vision_data at the start of the reference read.

    Replaces scattered ``_bg_is_environmental``, ``_no_face_mesh``,
    ``_person_ratio`` computations in ``reference_read.py``.  Every
    downstream function receives this instead of re-parsing
    ``vision_data`` dictionaries.
    """

    # ── Scene classification ──
    scene_type: str = "unknown"  # studio_portrait | environmental | outdoor | unknown

    # ── Face mesh availability ──
    has_face_mesh: bool = False
    face_mesh_failure_reason: str = ""  # "" | "no_face_mesh_detected" | "no_face_detected"

    # ── Mask ratios (computed once) ──
    person_ratio: float = 0.0
    skin_ratio: float = 0.0
    bg_ratio: float = 0.0

    # ── Background classification ──
    bg_pattern: str = "unknown"
    bg_is_environmental: bool = False
    bg_is_effectively_dark: bool = False

    # ── Face-dependent cue availability ──
    face_cue_count: int = 0  # 0-4: how many face-dependent cues produced data

    # ── Catchlight availability ──
    has_catchlights: bool = False
    catchlight_count: int = 0

    # ── Framing reliability ──
    pose_reliable: bool = True


@dataclass
class DramaticLightSignals:
    """Collected signals for dramatic hard-light detection.

    Pure data container — no thresholds.  Each field is either a gate
    (bool that must pass for the heuristic to even run) or a scored
    signal (bool contributing +1 to the score).

    Decomposed from ``_detect_dramatic_hard_light()`` so that individual
    signals can be tested in isolation and new signals added without
    touching the threshold logic.
    """

    # ── Gates (must pass; not scored) ──
    is_hard_quality: bool = False       # lightQuality == "hard"
    catchlights_contradict: bool = False  # soft modifier catchlights → abort

    # ── Scored signals (+1 each) ──
    low_brightness: bool = False        # brightness in (low, very_low)
    dramatic_mood: bool = False         # mood in (dramatic, edgy, cinematic, moody)
    bw_or_hcg: bool = False             # B&W or high-contrast grade
    high_bg_ratio: bool = False         # bg_ratio > threshold (suppressed for env)
    zero_catchlights: bool = False      # light_count == 0 (suppressed no face mesh)
    low_modifier_conf: bool = False     # modifier_confidence < threshold (suppressed no face mesh)
    high_contrast: bool = False         # contrast ratio high or extreme

    # ── Context ──
    no_face_mesh: bool = False          # face mesh unavailable

    @property
    def score(self) -> int:
        """Sum of active scored signals."""
        return sum([
            self.low_brightness, self.dramatic_mood, self.bw_or_hcg,
            self.high_bg_ratio, self.zero_catchlights,
            self.low_modifier_conf, self.high_contrast,
        ])
