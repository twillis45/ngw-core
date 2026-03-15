"""4-stage inference pipeline for visual cue analysis.

Pipeline stages:
    1. infer_geometry()        — light direction, height, count, shadow pattern
    2. infer_source_quality()  — modifier family, transition character
    3. infer_environment()     — natural vs studio, background, special cases
    4. infer_setup_family()    — primary hypothesis + alternates + ambiguity

Each stage reads the VisualCueReport and (for stage 4) the outputs of
prior stages. Stages are designed to be independently useful — even if
only some cues were extracted, the pipeline degrades gracefully.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from engine.image_analysis_models import (
    EnvironmentInference,
    GeometryInference,
    SetupFamilyInference,
    SourceQualityInference,
    VisualCueReport,
)


# ═══════════════════════════════════════════════════════════════════════════
# Stage 1: Geometry Inference
# ═══════════════════════════════════════════════════════════════════════════


def infer_geometry(cue_report: VisualCueReport) -> GeometryInference:
    """Infer light geometry from shadow direction, vertical angle,
    catchlight position, and multi-shadow cues.

    Builds a composite picture of where lights are positioned.
    """
    notes: List[str] = []

    # -- Key light direction --
    # P2e: key_light_direction stores the KEY position (where the light IS),
    # NOT the shadow-fall direction.  Since primary_shadow_direction reports
    # where shadows fall, we invert to get the key position.
    key_direction = "unknown"
    direction_confidence = 0.0

    _SHADOW_FALL_TO_KEY = {
        "upper_left": "upper_right",
        "upper_right": "upper_left",
        "left": "right",
        "right": "left",
        "below": "top_center",
        "top_center": "below",
        "lower_left": "lower_right",
        "lower_right": "lower_left",
        "unknown": "unknown",
    }
    shadow_dir = cue_report.primary_shadow_direction
    if shadow_dir and shadow_dir.confidence > 0.3:
        key_direction = _SHADOW_FALL_TO_KEY.get(shadow_dir.direction, shadow_dir.direction)
        direction_confidence = shadow_dir.confidence
        notes.append(
            f"Shadow falls {shadow_dir.direction} → key light at {key_direction} "
            f"({shadow_dir.confidence:.2f})"
        )

    # Cross-validate with catchlight position
    cl_pos = cue_report.catchlight_position
    if cl_pos and cl_pos.confidence > 0.3:
        # Catchlights tell us where the light IS, shadows where it ISN'T
        all_positions = cl_pos.left_eye + cl_pos.right_eye
        if all_positions:
            notes.append(f"Catchlight positions: {all_positions}")

    # -- Key light height --
    key_height = "unknown"
    vl = cue_report.vertical_light_angle
    if vl and vl.confidence > 0.3:
        key_height = vl.angle
        notes.append(f"Vertical angle: {key_height} ({vl.confidence:.2f})")

    # -- Light count (P2e: conservative dedup-aware estimation) --
    light_count = 0
    refl = cue_report.reflection_architecture
    if refl and refl.total_catchlights > 0:
        # P2e: per_eye_counts are already deduped (floor reflections
        # removed, nearby positions grouped).  Use max-per-eye.
        per_eye = refl.per_eye_counts
        light_count = max(per_eye.get("left", 0), per_eye.get("right", 0))

    multi = cue_report.multi_shadow_detection
    if multi and multi.shadow_count > 1:
        # P2e: Only trust multi-shadow over catchlights when multi-shadow
        # confidence is decent and the counts aren't wildly different.
        # A shadow_count of 2 on low confidence could be pose shadows.
        if multi.confidence >= 0.4 and light_count < multi.shadow_count:
            notes.append(
                f"Multi-shadow suggests {multi.shadow_count} lights "
                f"(conf {multi.confidence:.2f}), "
                f"catchlights show {light_count} — using higher estimate."
            )
            light_count = max(light_count, multi.shadow_count)

    if light_count == 0:
        light_count = 1  # assume at least one
        notes.append("No catchlights detected — assuming single light source.")

    # -- Fill detection --
    has_fill = False
    fill_position = None
    if light_count >= 2:
        has_fill = True
        fill_position = "near camera axis"  # safe default for multi-light
        notes.append("Multiple lights detected — fill likely present.")

    contrast = cue_report.contrast_ratio
    if contrast and contrast.label in ("low", "medium") and not has_fill:
        has_fill = True
        fill_position = "unknown"
        notes.append("Low/medium contrast suggests fill light or reflector present.")

    # -- Shadow pattern --
    shadow_pattern = _infer_shadow_pattern(cue_report, key_direction, key_height, light_count)

    # -- Composite confidence --
    confidences = [c for c in [direction_confidence, vl.confidence if vl else 0] if c > 0]
    confidence = sum(confidences) / len(confidences) if confidences else 0.2

    return GeometryInference(
        key_light_direction=key_direction,
        key_light_height=key_height,
        light_count_estimate=light_count,
        has_fill=has_fill,
        fill_position=fill_position,
        shadow_pattern=shadow_pattern,
        confidence=round(confidence, 2),
        notes=notes,
    )


def _has_clamshell_catchlights(cue_report: VisualCueReport) -> bool:
    """Check if catchlight positions show clamshell pattern.

    True clamshell requires upper + lower catchlights in BOTH eyes.
    A single eye with upper + lower could be costume reflections,
    environmental bounces, or metallic accessories catching the key.
    """
    cp = cue_report.catchlight_position
    if not cp or not cp.left_eye or not cp.right_eye:
        return False

    def _has_upper_and_lower(positions: list) -> bool:
        hours = []
        for pos in positions:
            try:
                h = int(str(pos).split()[0])
                hours.append(h)
            except (ValueError, IndexError):
                continue
        has_upper = any(h in (10, 11, 12, 1, 2) for h in hours)
        has_lower = any(h in (4, 5, 6, 7, 8) for h in hours)
        return has_upper and has_lower

    return _has_upper_and_lower(cp.left_eye) and _has_upper_and_lower(cp.right_eye)


def _infer_shadow_pattern(
    cue_report: VisualCueReport,
    key_direction: str,
    key_height: str,
    light_count: int,
) -> str:
    """Map geometry cues to a named shadow pattern."""
    # Triangle requires 3+ lights AND low/medium contrast.
    # Triangle lighting wraps from 3 directions, producing very even
    # illumination with minimal shadow depth.  High/extreme contrast
    # is physically impossible with a 3-light triangle — it indicates
    # a single dominant source with the extra catchlights being
    # reflections (glasses, jewellery, eyes themselves) not separate lights.
    _triangle_rejected = False
    refl = cue_report.reflection_architecture
    if refl and refl.total_catchlights >= 3:
        per_eye_max = max(refl.per_eye_counts.get("left", 0), refl.per_eye_counts.get("right", 0))
        if per_eye_max >= 3:
            # Contrast gate: triangle lighting = wrapping 3-source setup = low contrast
            cr = cue_report.contrast_ratio
            cr_label = (cr.label if cr else "unknown").lower()
            if cr_label in ("low", "medium"):
                return "triangle"
            # High/extreme contrast with 3+ catchlights per eye →
            # NOT triangle.  Extra catchlights are reflections from
            # glasses, jewellery, or specular skin surfaces.
            # Allow direction-based patterns to fire below.
            _triangle_rejected = True

    # Clamshell: 2 lights, vertical alignment, key high.
    # BUT — require catchlight evidence of upper + lower in BOTH eyes.
    # Without both-eye verification, a high 2-light setup could be
    # key + side fill, key + rim, or costume reflections creating
    # false lower catchlights.
    if light_count == 2 and key_height == "high":
        if _has_clamshell_catchlights(cue_report):
            return "clamshell"
        # else: fall through to direction-based patterns

    # Single/key-light patterns — also apply when count == 2, since a fill
    # or bounce source doesn't change the shadow PATTERN (only the depth).
    # P2c: Extended from "light_count <= 1" to "<= 2" so that direction-based
    # pattern classification works when a passive fill is detected.
    # Also apply when triangle was rejected (extra catchlights are reflections,
    # not separate lights — direction-based pattern is the correct classification).
    if light_count <= 2 or _triangle_rejected:
        # Shadow pattern is side-independent — a key at upper_left
        # creates the same pattern (mirrored) as upper_right.
        if key_direction in ("upper_left", "upper_right"):
            return "rembrandt"
        if key_direction in ("left", "right"):
            return "split"
        if key_direction == "unknown" and key_height == "high":
            return "butterfly"

    # Flat: low contrast, frontal
    contrast = cue_report.contrast_ratio
    if contrast and contrast.label == "low" and key_direction == "unknown":
        return "flat"

    return "unknown"


# ═══════════════════════════════════════════════════════════════════════════
# Stage 2: Source Quality Inference
# ═══════════════════════════════════════════════════════════════════════════


def infer_source_quality(cue_report: VisualCueReport) -> SourceQualityInference:
    """Infer modifier family from shadow edge hardness, transition rate,
    catchlight shape, and specular highlight behavior.
    """
    notes: List[str] = []

    # -- Shadow edge hardness → modifier hint --
    modifier_hints: List[str] = []
    seh = cue_report.shadow_edge_hardness
    if seh and seh.confidence > 0.3:
        if seh.classification == "soft":
            modifier_hints.append("softbox")
            modifier_hints.append("umbrella")
            notes.append("Soft shadow edges → large/diffused source.")
        elif seh.classification == "hard":
            modifier_hints.append("hard_source")
            notes.append("Hard shadow edges → small/undiffused source or direct sun.")
        elif seh.classification == "mixed":
            modifier_hints.append("window")
            notes.append("Mixed shadow edges — natural light or gridded modifier.")

    # -- Catchlight shape → modifier hint --
    cs = cue_report.catchlight_shape
    if cs and cs.confidence > 0.3:
        if cs.dominant_shape == "round":
            modifier_hints.append("beauty_dish")
            modifier_hints.append("umbrella")
            notes.append(f"Round catchlights → beauty dish or umbrella.")
        elif cs.dominant_shape == "rectangular":
            modifier_hints.append("softbox")
            notes.append("Rectangular catchlights → softbox.")

    # -- Transition rate --
    transition = "unknown"
    hst = cue_report.highlight_to_shadow_transition
    if hst and hst.confidence > 0.3:
        transition = hst.rate
        if hst.rate == "gradual":
            modifier_hints.append("softbox")
            modifier_hints.append("umbrella")
        elif hst.rate == "sharp":
            modifier_hints.append("hard_source")

    # -- Specular highlights --
    spec = cue_report.specular_highlight_behavior
    if spec and spec.confidence > 0.3:
        if spec.intensity == "strong" and spec.spread == "tight":
            modifier_hints.append("hard_source")
            notes.append("Strong tight specular highlights → hard/small source.")
        elif spec.intensity == "subtle" or spec.spread == "broad":
            modifier_hints.append("softbox")

    # -- Tonal processing caveat --
    tp = cue_report.tonal_processing_estimation
    if tp and (tp.is_bw or tp.is_high_contrast_grade):
        notes.append(
            "CAUTION: Tonal processing detected — shadow hardness and contrast "
            "may reflect editing rather than actual light modifier."
        )

    # -- Vote on modifier family --
    modifier = _vote_modifier(modifier_hints)
    confidence = min(0.75, 0.3 + len(modifier_hints) * 0.1)

    return SourceQualityInference(
        key_modifier_family=modifier,
        transition_character=transition,
        confidence=round(confidence, 2),
        notes=notes,
    )


def _vote_modifier(hints: List[str]) -> str:
    """Simple majority vote from modifier hints."""
    if not hints:
        return "unknown"

    counts: Dict[str, int] = {}
    for h in hints:
        counts[h] = counts.get(h, 0) + 1

    winner = max(counts, key=lambda k: counts[k])
    return winner


# ═══════════════════════════════════════════════════════════════════════════
# Stage 3: Environment Inference
# ═══════════════════════════════════════════════════════════════════════════


def infer_environment(cue_report: VisualCueReport) -> EnvironmentInference:
    """Infer shooting environment from background, shadow continuity,
    and tonal processing cues.

    Special cases explicitly tracked:
    - dappled_foliage
    - direct_sunlight
    - window_light
    - bw_processing
    - high_contrast_grade
    - pose_shadow_interference
    """
    notes: List[str] = []
    special_cases: List[str] = []

    is_natural = False
    env_type = "unknown"
    bg_treatment = "unknown"

    # -- Environmental shadow continuity --
    esc = cue_report.environmental_shadow_continuity
    if esc and esc.confidence > 0.3:
        if esc.has_natural_indicators:
            is_natural = True
            notes.append("Environmental cues suggest natural light.")
            for hint in esc.environment_hints:
                if hint == "dappled_foliage":
                    special_cases.append("dappled_foliage")
                    notes.append(
                        "Dappled foliage light detected — expect mixed hard/soft "
                        "shadows and irregular catchlight patterns."
                    )
                elif hint == "warm_background":
                    notes.append("Warm background tones — outdoor/natural environment likely.")
        if esc.has_artificial_indicators:
            notes.append("Controlled background suggests studio environment.")

    # -- Background illumination --
    bg = cue_report.background_illumination
    if bg and bg.confidence > 0.3:
        if bg.pattern == "even" and bg.brightness_relative == "darker":
            bg_treatment = "controlled"
            if not is_natural:
                env_type = "studio"
        elif bg.pattern == "environmental":
            bg_treatment = "environmental"
            is_natural = True
        elif bg.pattern == "dark":
            bg_treatment = "controlled"
            if not is_natural:
                env_type = "studio"
            notes.append("Very dark background — likely studio with no background light.")
        elif bg.pattern == "gradient":
            bg_treatment = "controlled"
            notes.append("Background gradient — possibly background light or natural falloff.")

    # -- Tonal processing flags --
    tp = cue_report.tonal_processing_estimation
    if tp:
        if tp.is_bw:
            special_cases.append("bw_processing")
            notes.append(
                "B&W processing detected — color temperature and saturation "
                "cues are unreliable for environment inference."
            )
        if tp.is_high_contrast_grade:
            special_cases.append("high_contrast_grade")
            notes.append(
                "High-contrast grading detected — contrast-based inferences "
                "may reflect editing, not actual lighting conditions."
            )

    # -- Pose shadow interference flag --
    psi = cue_report.pose_induced_shadow_interference
    if psi and psi.detected:
        special_cases.append("pose_shadow_interference")
        notes.append(
            f"Pose-induced shadows detected ({', '.join(psi.interference_regions)}) "
            f"— shadow-based cues may be less reliable."
        )

    # -- Shadow interruption pattern (gobo / projection / slit) --
    sip = cue_report.shadow_interruption_pattern
    if sip and sip.detected:
        special_cases.append("shadow_interruption_pattern")
        notes.append(
            f"Shadow interruption pattern detected ({sip.classification}, "
            f"{sip.line_count} lines, parallelism={sip.line_parallelism:.2f}) "
            f"— shadow-based cues may reflect projected/gobo lighting, "
            f"not conventional modifier placement."
        )

    # -- P2d: Rectangular/octagonal catchlights are strong evidence of a studio
    # modifier (softbox, octabox, etc.).  Suppress natural-light classification
    # and sunlight detection when catchlights clearly indicate studio gear.
    _has_studio_catchlights = False
    cs = cue_report.catchlight_shape
    if cs and cs.confidence > 0.3 and cs.dominant_shape in ("rectangular", "octagonal", "square"):
        _has_studio_catchlights = True
        if is_natural:
            is_natural = False
            notes.append(
                "P2d: Rectangular/octagonal catchlights override natural-light "
                "indicators — studio modifier detected."
            )

    # -- Shadow edge hardness → sunlight hint --
    seh = cue_report.shadow_edge_hardness
    if seh and seh.classification == "hard" and is_natural and not _has_studio_catchlights:
        special_cases.append("direct_sunlight")
        env_type = "outdoor_sun"
        notes.append("Hard shadows + natural indicators → direct sunlight likely.")
    elif is_natural and env_type == "unknown":
        env_type = "outdoor_shade"

    # -- Refine environment type --
    if env_type == "unknown":
        if is_natural:
            env_type = "indoor_ambient"
        elif bg_treatment == "controlled":
            env_type = "studio"

    # -- Confidence --
    factors = [
        esc.confidence if esc else 0,
        bg.confidence if bg else 0,
    ]
    valid_factors = [f for f in factors if f > 0]
    confidence = sum(valid_factors) / len(valid_factors) if valid_factors else 0.2

    return EnvironmentInference(
        is_natural_light=is_natural,
        environment_type=env_type,
        background_treatment=bg_treatment,
        confidence=round(confidence, 2),
        special_cases=special_cases,
        notes=notes,
    )


# ═══════════════════════════════════════════════════════════════════════════
# Stage 4: Setup Family Inference
# ═══════════════════════════════════════════════════════════════════════════


# Setup families map to the existing lighting pattern vocabulary
SETUP_FAMILIES = {
    "single_key_rembrandt": {
        "pattern": "rembrandt-ish",
        "description": "Single key light at ~45 degrees creating Rembrandt triangle",
    },
    "single_key_split": {
        "pattern": "split/short",
        "description": "Single key light at ~90 degrees creating split lighting",
    },
    "single_key_loop": {
        "pattern": "loop",
        "description": "Single key light at ~30 degrees creating loop shadow",
    },
    "clamshell_beauty": {
        "pattern": "clamshell",
        "description": "Two-light vertical (clamshell) for beauty/portrait",
    },
    "triangle_headshot": {
        "pattern": "triangle",
        "description": "Three-light triangle setup for commercial headshot",
    },
    "butterfly_paramount": {
        "pattern": "butterfly",
        "description": "Key directly above creating butterfly shadow under nose",
    },
    "window_light": {
        "pattern": "loop",
        "description": "Natural window light, typically soft single-source",
    },
    "natural_ambient": {
        "pattern": "unknown",
        "description": "Natural ambient light — no dominant artificial source",
    },
    "dramatic_chiaroscuro": {
        "pattern": "rembrandt-ish",
        "description": "High-contrast single-source dramatic lighting",
    },
    "gobo_projection": {
        "pattern": "unknown",
        "description": "Gobo or projection pattern creating shaped shadows on subject",
    },
    "slit_cut_light": {
        "pattern": "unknown",
        "description": "Slit or geometric bar lighting (venetian blind, flag, etc.)",
    },
}


def infer_setup_family(
    geometry: GeometryInference,
    source_quality: SourceQualityInference,
    environment: EnvironmentInference,
    cue_report: VisualCueReport,
) -> SetupFamilyInference:
    """Combine all prior stages into a final setup hypothesis.

    Outputs:
    - Primary hypothesis with confidence
    - Alternate hypotheses ranked by confidence
    - Explicit ambiguity notes
    - Recommendation hints for the scoring engine
    """
    notes: List[str] = []
    ambiguity: List[str] = []
    hints: List[str] = []

    candidates: List[Dict[str, Any]] = []

    # -- Score each setup family --

    # Triangle
    if geometry.shadow_pattern == "triangle":
        candidates.append({
            "hypothesis": "triangle_headshot",
            "confidence": geometry.confidence * 0.9,
            "reason": f"Triangle pattern detected ({geometry.light_count_estimate} lights)",
        })

    # Clamshell
    if geometry.shadow_pattern == "clamshell":
        candidates.append({
            "hypothesis": "clamshell_beauty",
            "confidence": geometry.confidence * 0.85,
            "reason": "Clamshell (vertical two-light) pattern detected",
        })

    # Rembrandt
    if geometry.shadow_pattern == "rembrandt":
        conf = geometry.confidence * 0.8
        # Boost if single light + hard source
        if geometry.light_count_estimate <= 1 and source_quality.key_modifier_family == "hard_source":
            candidates.append({
                "hypothesis": "dramatic_chiaroscuro",
                "confidence": conf * 1.1,
                "reason": "Single hard source with Rembrandt shadow — dramatic chiaroscuro",
            })
        candidates.append({
            "hypothesis": "single_key_rembrandt",
            "confidence": conf,
            "reason": f"Rembrandt shadow pattern, {geometry.light_count_estimate} light(s)",
        })

    # Loop
    if geometry.shadow_pattern == "loop":
        candidates.append({
            "hypothesis": "single_key_loop",
            "confidence": geometry.confidence * 0.75,
            "reason": "Loop shadow pattern detected",
        })

    # Butterfly
    if geometry.shadow_pattern == "butterfly":
        candidates.append({
            "hypothesis": "butterfly_paramount",
            "confidence": geometry.confidence * 0.7,
            "reason": "Butterfly/paramount shadow pattern (key directly above)",
        })

    # Flat
    if geometry.shadow_pattern == "flat":
        candidates.append({
            "hypothesis": "clamshell_beauty",
            "confidence": 0.35,
            "reason": "Flat lighting — possibly beauty/clamshell or overcast ambient",
        })
        candidates.append({
            "hypothesis": "natural_ambient",
            "confidence": 0.3,
            "reason": "Flat lighting could also be ambient/overcast",
        })

    # Natural light variants
    if environment.is_natural_light:
        if "dappled_foliage" in environment.special_cases:
            candidates.append({
                "hypothesis": "natural_ambient",
                "confidence": 0.55,
                "reason": "Dappled foliage light detected — natural ambient",
            })
            ambiguity.append(
                "Dappled foliage light creates mixed hard/soft patterns that "
                "can mimic multi-light studio setups."
            )
        elif "direct_sunlight" in environment.special_cases:
            candidates.append({
                "hypothesis": "natural_ambient",
                "confidence": 0.5,
                "reason": "Direct sunlight detected — natural single-source",
            })
            hints.append("Sun position acts as key light — look for reflectors/fill.")
        else:
            candidates.append({
                "hypothesis": "window_light",
                "confidence": 0.45,
                "reason": "Natural light indicators — window or ambient",
            })

    # Shadow interruption → gobo / slit candidates
    if "shadow_interruption_pattern" in environment.special_cases:
        sip = cue_report.shadow_interruption_pattern
        if sip and sip.detected:
            if sip.classification == "geometric_bar":
                candidates.append({
                    "hypothesis": "slit_cut_light",
                    "confidence": sip.confidence * 0.85,
                    "reason": (
                        f"Geometric bar shadows ({sip.line_count} parallel lines, "
                        f"parallelism={sip.line_parallelism:.2f}) — slit/flag lighting"
                    ),
                })
                hints.append(
                    "Shadow geometry suggests a masked light source (gobo or slit flag) "
                    "rather than traditional portrait lighting."
                )
            elif sip.classification in ("patterned_projection", "unknown"):
                candidates.append({
                    "hypothesis": "gobo_projection",
                    "confidence": sip.confidence * 0.80,
                    "reason": (
                        f"Shadow interruption ({sip.classification}, "
                        f"{sip.line_count} lines) — gobo or projection"
                    ),
                })
                hints.append(
                    "Projected pattern shadows detected. Standard pattern "
                    "classification (Rembrandt, loop, etc.) may not apply."
                )
            # Penalize all traditional candidates
            for c in candidates:
                if c["hypothesis"] not in ("gobo_projection", "slit_cut_light"):
                    c["confidence"] *= 0.6

    # Fallback: unknown
    if not candidates:
        candidates.append({
            "hypothesis": "unknown",
            "confidence": 0.15,
            "reason": "Insufficient cues for confident setup inference",
        })

    # -- Special case ambiguity notes --
    if "bw_processing" in environment.special_cases:
        ambiguity.append(
            "B&W processing detected — color-based modifier and environment "
            "inferences have reduced reliability."
        )
    if "high_contrast_grade" in environment.special_cases:
        ambiguity.append(
            "High-contrast grading detected — apparent contrast ratio may not "
            "reflect actual lighting ratio."
        )
    if "pose_shadow_interference" in environment.special_cases:
        ambiguity.append(
            "Pose-induced shadows detected — shadow direction and pattern "
            "inferences may be partially influenced by subject pose."
        )
    if "shadow_interruption_pattern" in environment.special_cases:
        ambiguity.append(
            "Shadow interruption pattern detected — shadow direction and pattern "
            "inferences reflect projected geometry, not conventional key light angle."
        )

    # -- Tonal processing caveat for modifier --
    tp = cue_report.tonal_processing_estimation
    if tp and (tp.is_bw or tp.is_high_contrast_grade):
        hints.append(
            "Tonal processing affects perceived contrast — modifier inference "
            "should be weighted lower than catchlight shape evidence."
        )

    # -- Sort candidates by confidence --
    candidates.sort(key=lambda c: c["confidence"], reverse=True)

    primary = candidates[0]
    alternates = candidates[1:4]  # top 3 alternates

    # -- Generate recommendation hints --
    if primary["confidence"] < 0.4:
        hints.append(
            "Low confidence in primary hypothesis — consider showing user "
            "multiple setup options rather than a single recommendation."
        )

    if environment.is_natural_light and source_quality.key_modifier_family != "unknown":
        hints.append(
            f"Natural light scene but modifier inference suggests '{source_quality.key_modifier_family}' "
            f"— this may be a reflector/scrim being used outdoors."
        )

    return SetupFamilyInference(
        primary_hypothesis=primary["hypothesis"],
        primary_confidence=round(primary["confidence"], 2),
        alternate_hypotheses=alternates,
        ambiguity_notes=ambiguity,
        recommendation_hints=hints,
        notes=notes,
    )


# ═══════════════════════════════════════════════════════════════════════════
# Convenience: Full pipeline in one call
# ═══════════════════════════════════════════════════════════════════════════


def run_cue_inference_pipeline(
    cue_report: VisualCueReport,
) -> Dict[str, Any]:
    """Run the full 4-stage inference pipeline on a cue report.

    Returns a dict with all 4 stage outputs for downstream use.
    """
    geometry = infer_geometry(cue_report)
    source_quality = infer_source_quality(cue_report)
    environment = infer_environment(cue_report)
    setup_family = infer_setup_family(geometry, source_quality, environment, cue_report)

    return {
        "geometry": geometry,
        "source_quality": source_quality,
        "environment": environment,
        "setup_family": setup_family,
    }
