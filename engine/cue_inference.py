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

from engine.enums import FieldStatus
from engine.provenance_models import FieldCandidate
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
    # Two independent signals: vertical_light_angle pass (gradient-based)
    # and catchlight clock position (geometric — where the light reflection
    # sits in the eye directly encodes source elevation).
    # Clock mapping:
    #   11, 12, 1        → high  (directly above or near-above)
    #   10, 2            → high  (typical portrait upper-key position)
    #   9, 3             → eye_level
    #   4, 5, 6, 7, 8   → low   (clamshell / beauty below)
    key_height = "unknown"
    vl = cue_report.vertical_light_angle
    if vl and vl.confidence > 0.3:
        key_height = vl.angle
        notes.append(f"Vertical angle pass: {key_height} ({vl.confidence:.2f})")

    cl_pos = cue_report.catchlight_position
    if cl_pos and cl_pos.confidence > 0.3:
        all_positions = cl_pos.left_eye + cl_pos.right_eye
        clock_hours: List[int] = []
        for pos in all_positions:
            try:
                clock_hours.append(int(str(pos).split()[0]))
            except (ValueError, IndexError):
                pass
        if clock_hours:
            high_count = sum(1 for h in clock_hours if h in (10, 11, 12, 1, 2))
            eye_count = sum(1 for h in clock_hours if h in (3, 9))
            low_count = sum(1 for h in clock_hours if h in (4, 5, 6, 7, 8))
            total = len(clock_hours)
            # Key height uses upper catchlights as the primary signal.
            # Lower catchlights (4-8) are fill/reflector evidence, NOT key-height
            # evidence.  Counting them alongside upper catchlights incorrectly
            # drags butterfly and clamshell setups (which have intentional fill
            # from below) toward "low" or "eye_level".
            # Rule: if ANY upper catchlight exists, the key is high.  Only call
            # "low" when there are no upper catchlights at all (e.g. ring from
            # below, under-face reflector as primary source — genuinely unusual).
            if high_count > 0:
                cl_height = "high"
            elif eye_count > 0 and low_count == 0:
                cl_height = "eye_level"
            elif low_count > 0:
                cl_height = "low"
            else:
                cl_height = "unknown"

            if cl_height != "unknown":
                notes.append(
                    f"Catchlight clock positions {clock_hours} → key height: {cl_height} "
                    f"(conf {cl_pos.confidence:.2f})"
                )
                # Catchlight clock position is more reliable than gradient-based
                # vertical angle when confident, as it directly encodes source geometry.
                if key_height == "unknown" or cl_pos.confidence >= (vl.confidence if vl else 0):
                    key_height = cl_height

    # P8: Eye socket shadow depth — third key-height signal.
    # Measures the dark band above the iris created when a high key casts the
    # brow ridge shadow downward.  Fires when key_height is still "unknown"
    # OR when both previous signals agree for reinforcement.  Only uses the
    # eye socket signal when it has decent confidence (≥0.40) and the label
    # differs from the existing estimate only if socket confidence > existing.
    ess = cue_report.eye_socket_shadow
    if ess and ess.confidence >= 0.40 and ess.height_label != "unknown":
        if key_height == "unknown":
            key_height = ess.height_label
            notes.append(
                f"Eye socket shadow: depth_ratio={ess.depth_ratio:.3f} → "
                f"key height={ess.height_label} (conf {ess.confidence:.2f})"
            )
        elif ess.height_label == key_height:
            notes.append(
                f"Eye socket shadow confirms key height={ess.height_label} "
                f"(depth_ratio={ess.depth_ratio:.3f}, conf {ess.confidence:.2f})"
            )
        else:
            # Conflict: only override if ess is substantially more confident
            existing_conf = (vl.confidence if vl else 0.0)
            if ess.confidence > existing_conf + 0.15:
                notes.append(
                    f"Eye socket shadow overrides key height: "
                    f"{key_height} → {ess.height_label} "
                    f"(depth_ratio={ess.depth_ratio:.3f}, "
                    f"socket conf {ess.confidence:.2f} > prior {existing_conf:.2f})"
                )
                key_height = ess.height_label
            else:
                notes.append(
                    f"Eye socket shadow ({ess.height_label}, conf {ess.confidence:.2f}) "
                    f"conflicts with existing estimate ({key_height}) — "
                    f"insufficient margin to override."
                )

    # -- Light count (P2e: conservative dedup-aware estimation) --
    light_count = 0
    refl = cue_report.reflection_architecture
    if refl and refl.total_catchlights > 0:
        # P2e: per_eye_counts are already deduped (floor reflections
        # removed, nearby positions grouped).  Use max-per-eye.
        per_eye = refl.per_eye_counts
        light_count = max(per_eye.get("left", 0), per_eye.get("right", 0))

    multi = cue_report.multi_shadow_detection
    catchlights_found = refl and refl.total_catchlights > 0
    if multi and multi.shadow_count > 1:
        # P2e: Only trust multi-shadow over catchlights when multi-shadow
        # confidence is decent and the counts aren't wildly different.
        # A shadow_count of 2 on low confidence could be pose shadows.
        # When catchlights are absent (eyes obscured, sunglasses, etc.) the
        # multi-shadow detector is our only signal — but it also has more
        # false positives from colour/luminance gradients, so require higher
        # confidence to override the 1-light default.
        min_multi_conf = 0.4 if catchlights_found else 0.6
        if multi.confidence >= min_multi_conf and light_count < multi.shadow_count:
            # When catchlights are found, cap multi-shadow's contribution.
            # Multi-shadow detects gradient directions (hair, clothing folds,
            # bone structure) which inflate counts.  Allow it to add at most
            # 2 lights beyond the catchlight-based estimate to prevent wild
            # overestimates (e.g. multi=4 for a 2-light setup).
            if catchlights_found:
                _capped = min(multi.shadow_count, light_count + 2)
            else:
                _capped = multi.shadow_count
            notes.append(
                f"Multi-shadow suggests {multi.shadow_count} lights "
                f"(conf {multi.confidence:.2f}, "
                f"threshold {min_multi_conf:.1f}), "
                f"catchlights show {light_count}"
                + (f" — capped to {_capped}." if _capped < multi.shadow_count else " — using higher estimate.")
            )
            light_count = max(light_count, _capped)
        elif not catchlights_found and multi.confidence < min_multi_conf:
            notes.append(
                f"Multi-shadow suggests {multi.shadow_count} lights "
                f"(conf {multi.confidence:.2f}) but no catchlights found — "
                f"confidence below {min_multi_conf:.1f} threshold, ignoring."
            )

    if light_count == 0:
        light_count = 1  # assume at least one
        notes.append("No catchlights detected — assuming single light source.")

    # -- Fill detection (P5: fill_ratio luminance measurement as primary signal) --
    has_fill = False
    fill_position = None

    fr = cue_report.fill_ratio
    if fr and fr.confidence > 0.35:
        if fr.fill_label in ("flat", "soft_fill", "moderate_fill"):
            has_fill = True
            fill_position = "opposite key (reflector or fill light)"
            notes.append(
                f"Fill ratio={fr.ratio:.2f} ({fr.fill_label}) — "
                f"lit_mean={fr.lit_side_mean:.0f}, shadow_mean={fr.shadow_side_mean:.0f}."
            )
        elif fr.fill_label in ("low_fill",):
            has_fill = True
            fill_position = "minimal — possible bounce or reflector"
            notes.append(
                f"Fill ratio={fr.ratio:.2f} ({fr.fill_label}) — low fill detected."
            )
        else:
            # no_fill
            notes.append(f"Fill ratio={fr.ratio:.2f} (no_fill) — shadow side unlit.")

    if not has_fill and light_count >= 2:
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

    # -- Continuous angle estimates --
    # Elevation: derived from catchlight clock positions (most direct source).
    # Clock hour → approximate elevation above eye level:
    #   12 → 85°, 11/1 → 70°, 10/2 → 50°, 9/3 → 15°, 8/4 → -10°, 7/5 → -30°, 6 → -50°
    # Falls back to key_height category if catchlights unavailable.
    _CLOCK_TO_ELEV = {
        12: 85, 11: 70, 1: 70, 10: 50, 2: 50,
        9: 15, 3: 15, 8: -10, 4: -10, 7: -30, 5: -30, 6: -50,
    }
    _HEIGHT_FALLBACK = {"high": 45.0, "eye_level": 10.0, "low": -20.0}
    key_elevation_est: Optional[float] = None
    try:
        _cl_up_hours = [h for h in clock_hours if h in (10, 11, 12, 1, 2)]
        if _cl_up_hours:
            key_elevation_est = round(
                sum(_CLOCK_TO_ELEV[h] for h in _cl_up_hours) / len(_cl_up_hours), 1
            )
    except NameError:
        pass  # clock_hours not populated (no catchlights or low confidence)
    if key_elevation_est is None:
        key_elevation_est = _HEIGHT_FALLBACK.get(key_height)

    # Azimuth: derived from shadow direction → key position.
    # 0° = on-axis, ±45° = classic 45° portrait key, ±90° = side, ±120°+ = rim.
    _DIR_TO_AZIMUTH: dict = {
        "top_center":   0.0,
        "upper_right":  45.0,
        "upper_left":  -45.0,
        "right":        80.0,
        "left":        -80.0,
        "lower_right":  120.0,
        "lower_left":  -120.0,
        "below":        0.0,   # fill from below — same axis as key
        "unknown":      None,
    }
    key_azimuth_est: Optional[float] = _DIR_TO_AZIMUTH.get(key_direction)

    # -- Composite confidence --
    confidences = [c for c in [direction_confidence, vl.confidence if vl else 0] if c > 0]
    confidence = sum(confidences) / len(confidences) if confidences else 0.2

    # Conservative field_status for shadow_pattern:
    # INFERRED — a non-unknown pattern was derived from cue signals
    # ASSUMED  — _infer_shadow_pattern() returned "unknown" (real no-signal fallback)
    # UNKNOWN  — pattern not evaluated (shouldn't reach here, but safe default)
    _shadow_status = (
        FieldStatus.INFERRED if shadow_pattern not in ("unknown", "") else
        FieldStatus.ASSUMED  if shadow_pattern == "unknown" else
        FieldStatus.UNKNOWN
    )

    return GeometryInference(
        key_light_direction=key_direction,
        key_light_height=key_height,
        light_count_estimate=light_count,
        has_fill=has_fill,
        fill_position=fill_position,
        shadow_pattern=shadow_pattern,
        confidence=round(confidence, 2),
        notes=notes,
        field_status=_shadow_status,
        key_elevation_deg_estimate=key_elevation_est,
        key_azimuth_deg_estimate=key_azimuth_est,
    )


def _has_triangle_catchlights(cue_report: VisualCueReport) -> bool:
    """Return True if catchlight positions show classic triangle formation.

    Classic triangle: ≥2 upper catchlights (10–2 o'clock) AND ≥1 lower
    catchlight (4–8 o'clock) in at least one eye.
    """
    cp = cue_report.catchlight_position
    if not cp:
        return False

    def _is_triangle(positions: list) -> bool:
        hours = []
        for pos in positions:
            try:
                h = int(str(pos).split()[0])
                hours.append(h)
            except (ValueError, IndexError):
                continue
        # Bilateral requirement: separate flanking keys at upper-left (10-11)
        # AND upper-right (1-2), plus a lower fill (4-8).  This prevents false
        # positives from a single soft modifier creating adjacent catchlights
        # at 10 and 11 o'clock, or a loop+fill combination (single 10 o'clock
        # key with fill at 6).
        upper_left  = [h for h in hours if h in (10, 11)]
        upper_right = [h for h in hours if h in (1, 2)]
        lower       = [h for h in hours if h in (4, 5, 6, 7, 8)]
        return len(upper_left) >= 1 and len(upper_right) >= 1 and len(lower) >= 1

    left_ok  = _is_triangle(cp.left_eye)  if cp.left_eye  else False
    right_ok = _is_triangle(cp.right_eye) if cp.right_eye else False
    return left_ok or right_ok


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
    # ── Ring light: modifier-first detection via catchlight shape ──────────
    # Ring lights produce a distinctive annular (donut) catchlight reflection.
    # This signal is more reliable than shadow geometry for ring-light detection
    # because ring lights intentionally minimize shadows — direction-based
    # analysis is weak.  If the catchlight extractor detected 'ring' in the
    # shapes_seen list, accept it as ring_light immediately.
    # Confidence gate 0.45: ring detection is relatively specific; the 'ring'
    # value is only set when the donut/annular morphology is confirmed.
    _cs_rl = cue_report.catchlight_shape
    _rl_shape_signal = (
        _cs_rl is not None
        and _cs_rl.confidence >= 0.45
        and "ring" in getattr(_cs_rl, "shapes_seen", [])
    )
    if _rl_shape_signal:
        return "ring_light"

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
            # Contrast gate: triangle lighting = wrapping 3-source setup = low face contrast.
            # Use face_contrast when available (face-region only, not clothing).
            # Fall back to overall contrast if face_contrast is absent.
            cr = cue_report.contrast_ratio
            face_cr_label = getattr(cr, "face_label", None) if cr else None
            cr_label = (face_cr_label or (cr.label if cr else "unknown")).lower()
            if cr_label in ("low", "medium"):
                if _has_triangle_catchlights(cue_report):
                    return "triangle"
            # High/extreme contrast with 3+ catchlights per eye →
            # NOT triangle.  Extra catchlights are reflections from
            # glasses, jewellery, or specular skin surfaces.
            # Allow direction-based patterns to fire below.
            _triangle_rejected = True

    # Gate 3 (bilateral symmetric / Hurley approximation) removed.
    # Rationale: 2 upper catchlights per eye with low contrast is insufficient
    # evidence for triangle lighting.  The same signal fires on loop setups with
    # a strong frontal fill, soft corporate keys, and any 2-light portrait where
    # the fill doesn't register its own catchlight.  Downstream triangle detection
    # (gate 2 with explicit 3-catchlight evidence) and reference_read's triangle
    # classification are more specific.  Corporate_soft_key false-positive confirmed.

    # Clamshell: 2 lights, vertical alignment, key high, direction on-axis.
    # BUT — require catchlight evidence of upper + lower in BOTH eyes.
    # Without both-eye verification, a high 2-light setup could be
    # key + side fill, key + rim, or costume reflections creating
    # false lower catchlights.
    # Direction guard: real clamshell has the key roughly centered/on-axis.
    # If direction is upper_left or upper_right, that's a single 45° key
    # (Rembrandt/loop territory) — the "lower" catchlights are likely
    # eye wetness or specular reflections, not a dedicated fill.
    if light_count >= 2 and key_height == "high":
        if key_direction not in ("upper_left", "upper_right", "left", "right"):
            # Pose guard: clamshell requires a near-frontal face.
            # An overhead key + reflector fill reads correctly as clamshell
            # only when the face is presented frontally.  When |yaw| >= 0.25
            # (~15° turn) the "lower" catchlights are from a lateral fill or
            # eye wetness, not a dedicated below-chin reflector.
            # fo.confidence >= 0.65 corresponds to |yaw| >= 0.25 in the
            # face-yaw confidence scale (moderate+ turn).
            # If the face is turned, fall through so P6 can resolve the
            # direction-based pattern (loop → broad / short).
            _fo_clam = getattr(cue_report, "face_orientation", None)
            _face_turned = (
                _fo_clam is not None
                and _fo_clam.confidence >= 0.65
                and getattr(_fo_clam, "broad_side", "unknown") not in ("unknown", "")
            )
            if not _face_turned and _has_clamshell_catchlights(cue_report):
                return "clamshell"
        # else: fall through to direction-based patterns

    # ── High-key / flat detection ──
    # ANALYSIS-ORDER ENFORCEMENT (Stage 2 → tonal shapes, does not lead):
    # Tonal signals narrow confidence and suppress implausible branches.
    # They must not hard-replace a geometry read unless no directional
    # geometry evidence exists.
    #
    # Gate — TWO independent geometry signals, evaluated in priority order:
    #   PRIMARY:   key_direction from shadow analysis (Stage 3 in expert order)
    #              If the shadow analysis returned a definitive lateral direction
    #              (not "unknown", not "top_center"), a directional key IS present
    #              and cannot be collapsed to flat/symmetric high_key.
    #   SECONDARY: light_structure.pattern_name (Stage 6, secondary confirmation)
    #              If light_structure independently confirms a directional pattern
    #              at ≥ 0.55 confidence, geometry leads.
    #
    # Either signal alone is sufficient to suppress the tonal shortcut.
    # The tonal evidence still influences the contradiction scorer downstream.
    contrast = cue_report.contrast_ratio
    cr_label = (contrast.label if contrast else "unknown").lower()
    bg = cue_report.background_illumination
    bg_bright = bg and bg.brightness_relative == "brighter" if bg else False

    if cr_label == "low" and bg_bright:
        _DIRECTIONAL_PATTERNS = {
            "loop", "rembrandt", "broad", "short", "split", "butterfly",
        }
        # PRIMARY gate: lateral key_direction from shadow analysis.
        # "unknown" and "top_center" are consistent with high_key / flat
        # illumination.  Any lateral direction contradicts it.
        _key_is_lateral = key_direction not in ("unknown", "top_center", "", None)
        # SECONDARY gate: light_structure confirms a directional pattern.
        _ls_early = getattr(cue_report, "light_structure", None)
        _ls_pat_early = getattr(_ls_early, "pattern_name", "unknown") if _ls_early else "unknown"
        _ls_conf_early = getattr(_ls_early, "confidence", 0.0) if _ls_early else 0.0
        _ls_geometry_leads = _ls_pat_early in _DIRECTIONAL_PATTERNS and _ls_conf_early >= 0.55
        _geometry_leads = _key_is_lateral or _ls_geometry_leads
        if not _geometry_leads:
            return "high_key"
        # geometry leads — fall through; tonal high_key signal suppressed

    # ── Butterfly detection (enhanced) ──
    # Butterfly = key directly above, centered.  Classic test: symmetric
    # highlight on both cheeks + shadow under nose going straight down.
    # The shadow-direction extractor sometimes picks a slight lateral bias
    # on a centered key, so also check highlight symmetry as confirmation.
    hs = cue_report.highlight_symmetry
    # >0.70: clear bilateral symmetry confirms key is near-center.
    # Range 0.60–0.69 overlaps with well-filled loop/broad images (measured
    # 0.625 loop_standard, 0.627 broad) — lowering below 0.70 causes those
    # portraits to misclassify as butterfly.  Near-on-axis butterfly images
    # with symmetry in the 0.60–0.69 range are handled by the P3 nose-shadow
    # path below, which uses a direct CV measurement rather than symmetry alone.
    high_symmetry = hs and hs.symmetry_score > 0.70 if hs else False

    # ── Light-structure data (early access for clamshell disambiguation) ──
    # light_structure_pass() in vision_passes.py performs nose-shadow-shape
    # analysis including triangle detection on the cheek.  Accessed early so
    # the butterfly heuristics below can yield when light_structure already
    # identified clamshell — both patterns share key-high + on-axis geometry,
    # but clamshell's fill-from-below cancels the nose shadow that butterfly
    # creates.  Also used in P4 shadow continuity and direction-based patterns.
    ls = cue_report.light_structure
    _ls_pattern = getattr(ls, "pattern_name", "unknown") if ls else "unknown"
    _ls_conf = getattr(ls, "confidence", 0.0) if ls else 0.0
    _ls_triangle = getattr(ls, "triangle_detected", False) if ls else False

    _ls_says_clamshell = _ls_pattern == "clamshell" and _ls_conf >= 0.5
    # Positive butterfly confirmation from light_structure nose-shadow-shape
    # analysis.  When confidence ≥0.6, this is the most reliable butterfly
    # indicator: it directly measures whether the nose shadow drops straight
    # down (butterfly) or has a lateral component (loop/rembrandt).
    _ls_says_butterfly = _ls_pattern == "butterfly" and _ls_conf >= 0.6

    # Pre-read nose_shadow_length — used primarily for _nsl_blocks_butterfly.
    # NOTE: nsl.shadow_label currently returns "butterfly" as a near-constant
    # default across most images (observed confidence ~0.49 for all patterns).
    # It is NOT a reliable discriminating signal and must not be used alone to
    # distinguish butterfly from loop.  _nsl_blocks_butterfly (shadow_label ==
    # "none") remains valid as an explicit contradiction signal.
    nsl = cue_report.nose_shadow_length
    # If nsl explicitly says "none" — no visible nose shadow — butterfly is
    # contradicted (butterfly requires a downward nose shadow).
    _nsl_blocks_butterfly = (
        nsl is not None
        and nsl.confidence > 0.3
        and nsl.shadow_label == "none"
    )

    # Pre-read fill_ratio for P2c flat-fill butterfly path.
    # fill_label=="flat" (ratio ≥ ~0.85) means the shadow side is nearly as
    # bright as the key side — only possible when the key is near-centered
    # (butterfly/clamshell) or when a very heavy fill is used.
    # Measured separability: butterfly 0.899 (flat), tangents portrait 0.897
    # (flat) vs. loop_standard 0.581 (soft_fill), broad 0.605 (soft_fill).
    _fr = cue_report.fill_ratio
    _flat_fill = (
        _fr is not None
        and getattr(_fr, "fill_label", "") == "flat"
    )

    # ── Butterfly hard-block: high-confidence lateral shadow direction ────
    # Butterfly requires the nose shadow to drop straight down (centered)
    # from a key at 12 o'clock.  Reasoning in clock hours like a lighting
    # technician — the dedicated shadow-direction extractor reports a
    # clock_angle (1–12) describing where the shadow falls:
    #   • 8, 9, 10  → key from camera-right, clearly lateral
    #   • 2, 3, 4   → key from camera-left, clearly lateral
    #   • 11, 12, 1 → near top, butterfly possible
    #   • 5, 6, 7   → below the face (clamshell fill or underlight)
    # When clock_angle lands in the lateral hours {8, 9, 10, 2, 3, 4} with
    # confidence ≥ 0.7, the key has a directional component that is
    # geometrically incompatible with butterfly.  No combination of
    # high_symmetry, flat fill, nsl shadow_label, or light_structure
    # secondary signal may override this — they are softer cues that
    # misfire on B&W low-key full-body portraits where reduced tonal range
    # can confuse fill_ratio and symmetry estimators.  The
    # primary_shadow_direction extractor cross-validates two independent
    # methods (nose-shadow position + half-face brightness), so a 0.7+
    # confidence reading already represents agreement of two physics signals.
    # Direction-label fallback is kept for callers that produce a direction
    # without populating clock_angle.
    _LATERAL_CLOCK_HOURS = frozenset({2, 3, 4, 8, 9, 10})
    _LATERAL_DIR_LABELS = frozenset({
        "upper_left", "upper_right", "left", "right",
        "lower_left", "lower_right",
    })
    _psd_for_block = cue_report.primary_shadow_direction
    _high_conf_lateral_shadow = False
    if _psd_for_block is not None and getattr(_psd_for_block, "confidence", 0.0) >= 0.7:
        _psd_clock = getattr(_psd_for_block, "clock_angle", None)
        _psd_dir = getattr(_psd_for_block, "direction", "unknown")
        if _psd_clock is not None:
            _high_conf_lateral_shadow = _psd_clock in _LATERAL_CLOCK_HOURS
        else:
            _high_conf_lateral_shadow = _psd_dir in _LATERAL_DIR_LABELS

    if key_height == "high":
        # Strong path: shadow detector says centered (unknown direction).
        # Clamshell escape: clamshell also has key-high + on-axis, but
        # fill-from-below cancels the nose shadow that butterfly creates.
        # nsl "none" escape: no visible shadow → likely clamshell/flat.
        if key_direction == "unknown":
            if not _ls_says_clamshell and not _nsl_blocks_butterfly:
                return "butterfly"
        # Weak path: shadow says slightly off-axis, but highlights are
        # symmetric — key is near-center, not truly off-axis.
        # NOTE: very large fill sources (e.g. reflector fill) can push
        # hs.symmetry above 0.70 even for a genuine loop key — the resolver
        # handles this by preferring lighting_inference when it says "loop"
        # and is not heavily contradicted (see LI demotion threshold).
        if high_symmetry and key_direction in ("upper_left", "upper_right"):
            if (not _ls_says_clamshell
                and not _nsl_blocks_butterfly
                and not _high_conf_lateral_shadow):
                return "butterfly"
        # P2c: Flat fill + high key + slightly off-axis → soft butterfly.
        # fill_ratio.fill_label=="flat" means the shadow side is nearly as
        # bright as the key side (ratio ≥ ~0.85).  This level of fill is
        # only achievable when the key is near-centered — loop and broad
        # setups produce "soft_fill" (0.55–0.75) at most.  A key that reads
        # upper_left / upper_right but produces flat fill is a soft butterfly
        # where the shadow detector picked up a minor lateral bias.
        if _flat_fill and key_direction in ("upper_left", "upper_right"):
            if (not _ls_says_clamshell
                and not _nsl_blocks_butterfly
                and not _high_conf_lateral_shadow):
                return "butterfly"

    # ── P3: Nose shadow length → butterfly / loop disambiguation ──────────
    # When CV measures a short nose shadow drop, it is evidence of a near-
    # centered key.  fire before direction-based patterns so high-symmetry
    # + short-drop images skip the loop/rembrandt branch.
    # NOTE: nsl.shadow_label is known to default to "butterfly" for many
    # images — it is not a precise discriminating signal on its own.  The
    # combination with key_direction context and the resolver's contradiction
    # scoring provides the necessary disambiguation.
    nsl = cue_report.nose_shadow_length
    if nsl and nsl.confidence > 0.4 and nsl.shadow_label == "butterfly":
        # Domain rule: butterfly requires a symmetric sub-nasal shadow under
        # BOTH nostrils.  "top_center" / "unknown" direction labels bucket too
        # much noise to drive the call alone — require an independent
        # corroboration (high_symmetry from highlight analysis OR
        # light_structure explicit butterfly).  Bare top_center direction no
        # longer shortcuts to butterfly.
        if ((high_symmetry or _ls_says_butterfly)
            and not _ls_says_clamshell
            and not _high_conf_lateral_shadow):
            return "butterfly"
    # P3-ext: light_structure explicitly identifies butterfly geometry on a
    # barely-off-axis key (upper_left / upper_right, key high).  This covers
    # soft butterfly setups where the shadow direction detector sees a slight
    # lateral bias but the nose-shadow-shape analysis confirms centered geometry.
    # Requires ls.confidence ≥ 0.6 — ls is the more reliable CV signal here.
    if _ls_says_butterfly and key_direction in ("upper_left", "upper_right") and key_height == "high":
        if not _ls_says_clamshell and not _high_conf_lateral_shadow:
            return "butterfly"

    # ── P4: Shadow continuity → Rembrandt triangle confirmation ──────────
    # Merge shadow_continuity into the triangle signal used by the
    # loop/rembrandt decision.  If CV directly measures the nose shadow
    # connecting to the cheek shadow, treat it as triangle_detected=True
    # regardless of what light_structure_pass found.
    #
    # Guard: when light_structure confidently identifies a pattern that is
    # physically incompatible with a Rembrandt triangle, skip the override:
    #   - clamshell: near-zero shadow density → no triangle possible
    #   - split: straight shadow line, no cheek-nose connection
    #   - butterfly: symmetric centered shadow, no lateral triangle
    # Shadow continuity can false-positive on these due to tonal gradients,
    # high-contrast-grade processing, or pose-induced shadow patterns.
    _ls_blocks_triangle = _ls_conf >= 0.5 and _ls_pattern in ("clamshell", "split", "butterfly")
    sc = cue_report.shadow_continuity
    if sc and sc.confidence > 0.4 and not _ls_blocks_triangle:
        if sc.triangle_connected and sc.connectivity_score > 0.6:
            _ls_triangle = True  # CV confirmed the connection
        elif not sc.triangle_connected and sc.gap_width_ratio > 0.05:
            # CV confirmed there IS a gap → suppress any light_structure triangle claim
            _ls_triangle = False

    # ── Direction-based patterns ──
    # The dominant key light creates the shadow pattern regardless of how
    # many fill/accent/rim lights are present.  A 3-light setup with a 45°
    # key still produces a Rembrandt shadow; the extra lights only affect
    # shadow depth/fill, not the pattern name.

    # ── P6 setup: Broad vs Short disambiguation helpers ───────────────────
    # Precompute face orientation signals once; used in both the
    # upper_left/upper_right branch and the left/right branch below.
    #
    # "short" lighting = key illuminates the LESS visible (turned-away) cheek.
    # "broad" lighting = key illuminates the MORE visible (camera-facing) cheek.
    #
    # P6 fires AFTER Rembrandt is evaluated — rembrandt is more specific than
    # "short" (a Rembrandt portrait IS short-lit but carries richer information).
    # When rembrandt is confirmed, keep "rembrandt".  When the shadow is a
    # generic loop, qualify it as "short" or "broad" based on face orientation.
    fo = cue_report.face_orientation
    _fo_conf = fo.confidence if fo else 0.0
    _fo_broad = fo.broad_side if fo else "unknown"
    _fo_short = fo.short_side if fo else "unknown"

    # Natural light / window guard: bright background or environmental shadow
    # continuity indicating outdoors → do NOT override with broad/short.
    _bg_is_bright = bg and bg.brightness_relative == "brighter"
    _env_sc = cue_report.environmental_shadow_continuity
    _env_is_natural = (
        _env_sc is not None
        and getattr(_env_sc, "source_type", "") == "environmental"
    )
    _p6_blocked = _bg_is_bright or _env_is_natural

    def _p6_qualify_loop(key_dir: str) -> str:
        """If face orientation is confident enough, convert 'loop' → 'short'/'broad'.

        Returns "short", "broad", or "loop" (unchanged).
        """
        if _p6_blocked or _fo_conf < 0.45 or _fo_broad == "unknown":
            return "loop"
        _LEFT_DIRS = ("left", "upper_left", "lower_left")
        _RIGHT_DIRS = ("right", "upper_right", "lower_right")
        _side = "left" if key_dir in _LEFT_DIRS else ("right" if key_dir in _RIGHT_DIRS else None)
        if _side is None:
            return "loop"
        if _side == _fo_short:
            return "short"
        if _side == _fo_broad:
            return "broad"
        return "loop"

    # ── Direction-based patterns ──
    if key_direction in ("upper_left", "upper_right"):
        # Loop vs Rembrandt: both have ~45° off-axis key.
        # Rembrandt = nose shadow connects to cheek shadow, forming triangle.
        # Loop = nose shadow falls beside nose without touching cheek.
        #
        # P6 fires AFTER this block: if the result would be "loop", we
        # check face orientation to potentially qualify as "short" or "broad".
        # Rembrandt is not overridden — it carries richer information than
        # the orientation label and is what experienced photographers expect.
        #
        # High-contrast-grade (HCG) awareness:
        # Crushed shadows can make isolated dark areas connect to cheek even
        # when actual light never produced a triangle.  Under HCG, require
        # explicit triangle_detected=True with higher light_structure confidence
        # before calling rembrandt.  Without that evidence, prefer "loop" —
        # the more common soft-portrait pattern and the safer assumption.
        tp = cue_report.tonal_processing_estimation
        _is_hcg = (tp is not None and (tp.is_high_contrast_grade or tp.is_bw))
        _rembrandt_conf_threshold = 0.65 if _is_hcg else 0.5
        _loop_conf_threshold = 0.35 if _is_hcg else 0.5  # lower bar for loop under HCG

        # P4 exception: when shadow_continuity directly confirms the triangle
        # with high connectivity (not just a tonal gradient), lower the HCG
        # rembrandt threshold — geometric CV measurement is not affected by
        # tone-curve editing the way shadow-shape heuristics are.
        _sc_direct_triangle = (
            sc is not None
            and sc.confidence > 0.4
            and sc.triangle_connected
            and sc.connectivity_score > 0.7
        )
        if _sc_direct_triangle and _is_hcg:
            _rembrandt_conf_threshold = 0.50  # relax HCG threshold for direct CV evidence

        if _ls_conf >= _loop_conf_threshold and _ls_pattern == "loop" and not _ls_triangle:
            return _p6_qualify_loop(key_direction)

        if _ls_triangle and _ls_conf >= _rembrandt_conf_threshold:
            # P6 priority rule: a SIGNIFICANT face turn (conf ≥ 0.65) indicates
            # the subject is in a strong 3/4 or near-profile position.  In that
            # case the shadow triangle is incidental to the face position rather
            # than defining the lighting style.  Return "short"/"broad" instead
            # of "rembrandt".  A SLIGHT face turn (conf < 0.65) should still
            # defer to the shadow triangle — the rembrandt pattern is then the
            # dominant descriptor, as in classic slight-turn rembrandt portraits.
            _p6_override = _p6_qualify_loop(key_direction)
            if _fo_conf >= 0.65 and _p6_override in ("short", "broad"):
                return _p6_override
            return "rembrandt"

        if not _ls_triangle and _ls_pattern == "rembrandt" and _ls_conf >= _rembrandt_conf_threshold:
            # light_structure says rembrandt without triangle evidence
            # Under HCG this is unreliable — fall through to loop default
            if not _is_hcg:
                return "rembrandt"

        # light_structure escape for patterns compatible with upper diagonal keys.
        # NOTE: "split" is excluded — split requires a true 90° side key.
        # NOTE: "clamshell" is excluded — clamshell requires an on-axis key
        # (top_center or unknown direction).  key_direction of upper_left/upper_right
        # is a 45° lateral key which is physically incompatible with clamshell.
        # If light_structure says "clamshell" for a lateral key it is misreading
        # bilateral facial symmetry or heavy fill as a clamshell pattern — trust
        # direction instead.
        if _ls_conf >= 0.6 and _ls_pattern in ("butterfly", "broad"):
            return _ls_pattern

        # Default: loop for ambiguous off-axis patterns.
        # Rembrandt is a *specific* diagnostic that requires the triangle;
        # loop is the general category.  Only call rembrandt when
        # shadow_continuity directly confirms the triangle connection —
        # don't assume it from direction alone.
        if not _is_hcg and sc and sc.confidence > 0.3 and sc.triangle_connected:
            # Shadow continuity confirms triangle — rembrandt even without
            # strong light_structure confidence.
            return "rembrandt"
        # High-elevation single-source: prefer rembrandt over loop.
        # At high key elevation, the nose shadow reaches the cheek even without
        # explicit shadow_continuity confirmation.  Loop is a shallower-angle
        # pattern — if the vertical angle is confirmed high and there is only
        # one light source, rembrandt is the more specific default.
        if key_height == "high" and light_count <= 1:
            return "rembrandt"
        # No triangle evidence → default to loop (qualified by P6).
        return _p6_qualify_loop(key_direction)

    if key_direction in ("left", "right"):
        # Off-axis light without height info (no "upper_" prefix).
        # Most portrait lighting at 30-60° produces "left"/"right" direction
        # — loop is the most common pattern at these angles.  Split requires
        # a true 90° placement with a hard vertical divide across the face.
        # Default to loop (not split) and only call split when light_structure
        # explicitly confirms it AND highlight symmetry is LOW.
        # Guard: split = half-face dark → very low bilateral symmetry (< 0.45).
        # A loop/broad portrait with slightly lateral lighting can trigger
        # light_structure "split" if the shadow angle is steep.  Requiring
        # low highlight symmetry (both sides NOT lit) prevents these false positives.
        if _ls_conf >= 0.5 and _ls_pattern == "split":
            _hs_sym_for_split = getattr(hs, "symmetry_score", 1.0) if hs else 1.0
            if _hs_sym_for_split <= 0.45:
                return "split"
        if _ls_conf >= 0.5 and _ls_pattern in ("rembrandt", "loop", "broad", "short"):
            return _ls_pattern
        # Default: loop, qualified by P6 for short/broad
        return _p6_qualify_loop(key_direction)

    # ── Light-structure fallback for unknown key direction ──
    # When shadow direction extraction failed (key_direction == "unknown") but
    # light_structure_pass produced a confident facial shadow classification,
    # trust the nose-shadow-shape analysis.  This catches butterfly, loop,
    # rembrandt, split, and broad patterns that shadow-direction missed.
    if key_direction == "unknown" and _ls_conf >= 0.6 and _ls_pattern != "unknown":
        return _ls_pattern

    # ── Low-key detection ──
    # Low-key = high/extreme contrast + dark background + no clear directional
    # key (direction is unknown).  Placed AFTER direction-based patterns because
    # most dramatic rembrandt/split/loop portraits also have high contrast +
    # dark backgrounds — those should keep their geometric pattern names.
    bg_dark = bg and bg.brightness_relative == "darker" if bg else False
    if cr_label in ("high", "extreme") and bg_dark and key_direction == "unknown":
        return "low_key"

    # ── Flat: low contrast, no directional shadow ──
    if contrast and cr_label == "low" and key_direction == "unknown":
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

    # -- Catchlight shape → dominant modifier signal --
    # Catchlight geometry is the single most reliable modifier indicator:
    # the shape of a reflection in the eye directly encodes the modifier shape.
    # Weight 3x for rectangular/octagonal (near-definitive), 2x for round/large.
    cs = cue_report.catchlight_shape
    if cs and cs.confidence > 0.3:
        if cs.dominant_shape == "rectangular":
            modifier_hints.extend(["softbox", "softbox", "softbox"])
            notes.append("Rectangular catchlights → softbox (3× weight, near-definitive).")
        elif cs.dominant_shape in ("round", "octagonal"):
            modifier_hints.extend(["beauty_dish", "umbrella", "umbrella"])
            notes.append(f"{cs.dominant_shape.capitalize()} catchlights → beauty dish / umbrella (2× weight).")
        elif cs.dominant_shape == "mixed":
            modifier_hints.append("softbox")
            notes.append("Mixed catchlight shapes → likely soft modifier.")

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

    # -- Shadow penumbra (apparent source angular size) --
    # Independent of catchlight shape — measures the transition zone width
    # at the shadow edge, which encodes how large the source appears.
    # Gated: not added under high-contrast grade (HCG inflates apparent
    # penumbra width from tone-curve contrast, not actual source size).
    pen = cue_report.shadow_penumbra
    if pen and pen.confidence >= 0.3:
        tp_check = cue_report.tonal_processing_estimation
        _pen_is_hcg = tp_check is not None and (
            tp_check.is_high_contrast_grade or tp_check.is_bw
        )
        if not _pen_is_hcg:
            _sz = pen.apparent_source_size
            if _sz == "point":
                modifier_hints.append("hard_source")
                notes.append("Penumbra: point source size → bare bulb / direct flash.")
            elif _sz == "small":
                modifier_hints.append("hard_source")
                notes.append("Penumbra: small source → small fresnel / gridded modifier.")
            elif _sz == "medium":
                modifier_hints.append("umbrella")
                notes.append("Penumbra: medium source → umbrella / medium softbox.")
            elif _sz in ("large", "very_large"):
                modifier_hints.append("softbox")
                modifier_hints.append("softbox")
                notes.append(
                    f"Penumbra: {_sz} source → large softbox / umbrella / scrim (2× weight)."
                )
        else:
            notes.append(
                "Penumbra signal skipped — tonal processing (HCG/B&W) inflates "
                "apparent shadow width independently of source size."
            )

    # -- Catchlight size class (modifier size corroboration) --
    # catchlight size_ratio encodes how large the reflection is relative to
    # the iris — large reflections = large modifier.  Combined with shape
    # to give a composite modifier size estimate.
    cs_size = cue_report.catchlight_shape
    if cs_size and cs_size.size_class not in ("unknown", None) and cs_size.confidence > 0.3:
        _sc = cs_size.size_class
        if _sc == "point":
            modifier_hints.append("hard_source")
            notes.append("Catchlight size: point → bare bulb / direct source.")
        elif _sc == "small":
            modifier_hints.append("hard_source")
            notes.append("Catchlight size: small → small modifier / gridded head.")
        elif _sc == "medium":
            modifier_hints.append("umbrella")
            notes.append("Catchlight size: medium → octa / medium softbox.")
        elif _sc in ("large", "very_large"):
            modifier_hints.append("softbox")
            notes.append(f"Catchlight size: {_sc} → large softbox / umbrella.")

    # -- Tonal processing caveat --
    tp = cue_report.tonal_processing_estimation
    if tp and (tp.is_bw or tp.is_high_contrast_grade):
        notes.append(
            "CAUTION: Tonal processing detected — shadow hardness and contrast "
            "may reflect editing rather than actual light modifier."
        )
        # Remove ALL hard_source votes under tonal processing.
        # High-contrast grade inflates shadow edge density and transition
        # sharpness uniformly — every shadow-based hard signal is suspect.
        # Removing one vote (old behaviour) left residual hard majorities.
        hard_count = modifier_hints.count("hard_source")
        if hard_count > 0:
            while "hard_source" in modifier_hints:
                modifier_hints.remove("hard_source")
            modifier_hints.append("softbox")  # one neutral counterweight
            notes.append(
                f"Removed {hard_count} hard_source vote(s) due to tonal "
                "processing — shadow edges unreliable under contrast grade."
            )

    # -- Catchlight-absent skepticism --
    # When eyes are not visible (no catchlights), shadow edge density can be
    # inflated by occluding objects (flowers, hands, sunglasses, props, etc.)
    # creating sharp physical edges that mimic hard light.  Without catchlights
    # we have no modifier-shape evidence to corroborate.  Require at least one
    # other signal (specular highlights or sharp transition) before trusting
    # the shadow-edge "hard" vote.
    refl = cue_report.reflection_architecture
    catchlights_found = refl and refl.total_catchlights > 0
    if not catchlights_found and seh and seh.classification == "hard":
        has_hard_corroboration = False
        # Specular highlights: strong + tight = genuine hard source
        if spec and spec.confidence > 0.3 and spec.intensity == "strong" and spec.spread == "tight":
            has_hard_corroboration = True
        # Transition rate: sharp = genuine hard source
        if hst and hst.confidence > 0.3 and hst.rate == "sharp":
            has_hard_corroboration = True
        if not has_hard_corroboration:
            # No corroborating evidence — shadow edges are unreliable
            # without catchlights (could be occlusion artefacts from props,
            # hands, hair, accessories, etc.)
            if "hard_source" in modifier_hints:
                modifier_hints.remove("hard_source")
            modifier_hints.append("window")  # neutral — don't presume soft or hard
            notes.append(
                "No catchlights and no corroborating hard-source signals "
                "(specular/transition) — shadow edge 'hard' may be from face "
                "occlusion artefacts; downweighted to neutral."
            )

    # -- Vote on modifier family --
    modifier = _vote_modifier(modifier_hints)
    confidence = min(0.75, 0.3 + len(modifier_hints) * 0.1)

    # Conservative field_status for key_modifier_family:
    # INFERRED — a non-unknown modifier was derived from transition/specular hints
    # ASSUMED  — _vote_modifier() returned "unknown" (modifier_hints was empty)
    # UNKNOWN  — not reached in normal flow
    _modifier_status = (
        FieldStatus.INFERRED if modifier not in ("unknown", "") else
        FieldStatus.ASSUMED  if modifier == "unknown" else
        FieldStatus.UNKNOWN
    )

    return SourceQualityInference(
        key_modifier_family=modifier,
        transition_character=transition,
        confidence=round(confidence, 2),
        notes=notes,
        field_status=_modifier_status,
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

    # -- Shadow interruption pattern (projected / slit) --
    sip = cue_report.shadow_interruption_pattern
    if sip and sip.detected:
        special_cases.append("shadow_interruption_pattern")
        notes.append(
            f"Shadow interruption pattern detected ({sip.classification}, "
            f"{sip.line_count} lines, parallelism={sip.line_parallelism:.2f}) "
            f"— shadow-based cues may reflect projected (interrupted) lighting, "
            f"not conventional modifier placement."
        )

    # -- P2d: Rectangular/octagonal catchlights are strong evidence of a studio
    # modifier (softbox, octabox, etc.).  Suppress natural-light classification
    # and sunlight detection when catchlights clearly indicate studio gear.
    # EXCEPTION: In B&W images, catchlight shape classification is unreliable —
    # grayscale compression removes the color/texture cues that distinguish
    # studio modifiers from window reflections.  Window panes produce rectangular
    # reflections that look identical to softbox catchlights in B&W.
    _has_studio_catchlights = False
    _is_bw = "bw_processing" in special_cases
    cs = cue_report.catchlight_shape
    if cs and cs.confidence > 0.3 and cs.dominant_shape in ("rectangular", "octagonal", "square"):
        if not _is_bw:
            _has_studio_catchlights = True
            if is_natural:
                is_natural = False
                notes.append(
                    "P2d: Rectangular/octagonal catchlights override natural-light "
                    "indicators — studio modifier detected."
                )
        else:
            notes.append(
                "P2d: Rectangular catchlights detected but B&W processing makes "
                "catchlight shape unreliable — not overriding natural-light indicators."
            )

    # -- Shadow edge hardness → sunlight hint --
    seh = cue_report.shadow_edge_hardness
    if seh and seh.classification == "hard" and is_natural and not _has_studio_catchlights:
        special_cases.append("direct_sunlight")
        env_type = "outdoor_sun"
        notes.append("Hard shadows + natural indicators → direct sunlight likely.")
    elif is_natural and env_type == "unknown":
        # For B&W images, we can't reliably distinguish indoor window light
        # from outdoor shade — both produce soft shadows and environmental
        # backgrounds.  Leave env_type as "unknown" so the refinement block
        # below assigns "indoor_ambient", which allows the window_portrait
        # specialty rule to evaluate the image on other signals.
        if not _is_bw:
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

    # Conservative field_status for environment_type:
    # INFERRED — a non-unknown environment was derived from bg/shadow cues
    # ASSUMED  — env_type remained "unknown" (initial value, no cue conditions fired)
    # UNKNOWN  — not reached in normal flow
    _env_status = (
        FieldStatus.INFERRED if env_type not in ("unknown", "") else
        FieldStatus.ASSUMED  if env_type == "unknown" else
        FieldStatus.UNKNOWN
    )

    return EnvironmentInference(
        is_natural_light=is_natural,
        environment_type=env_type,
        background_treatment=bg_treatment,
        confidence=round(confidence, 2),
        special_cases=special_cases,
        notes=notes,
        field_status=_env_status,
    )


# ═══════════════════════════════════════════════════════════════════════════
# Stage 4: Setup Family Inference
# ═══════════════════════════════════════════════════════════════════════════


# Setup families map to the existing lighting pattern vocabulary
SETUP_FAMILIES = {
    "single_key_rembrandt": {
        "pattern": "rembrandt",
        "description": "Single key light at ~45 degrees creating Rembrandt triangle",
    },
    "single_key_split": {
        "pattern": "split",
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
        "pattern": "rembrandt",
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
                    "Shadow geometry suggests a masked light source (projected or slit flag) "
                    "rather than traditional portrait lighting."
                )
            elif sip.classification in ("patterned_projection", "unknown"):
                candidates.append({
                    "hypothesis": "gobo_projection",
                    "confidence": sip.confidence * 0.80,
                    "reason": (
                        f"Shadow interruption ({sip.classification}, "
                        f"{sip.line_count} lines) — projected pattern"
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
    # Convert alternates from List[Dict] to List[FieldCandidate] — typed provenance records.
    # Shape: {"hypothesis": str, "confidence": float, "reason": str} → FieldCandidate
    alternates = [
        FieldCandidate(
            value=c["hypothesis"],
            source="cue_inference",
            confidence=c.get("confidence", 0.0),
            demotion_reason=c.get("reason", ""),
            status=(
                FieldStatus.INFERRED if c["hypothesis"] not in ("unknown", "") else
                FieldStatus.ASSUMED
            ),
        )
        for c in candidates[1:4]  # top 3 alternates
    ]

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

    # Conservative field_status for primary_hypothesis:
    # INFERRED — a non-unknown hypothesis was scored from prior stage outputs
    # ASSUMED  — only candidate was "unknown" (real no-signal fallback at line ~1181)
    # UNKNOWN  — not reached in normal flow
    _setup_status = (
        FieldStatus.INFERRED if primary["hypothesis"] not in ("unknown", "") else
        FieldStatus.ASSUMED  if primary["hypothesis"] == "unknown" else
        FieldStatus.UNKNOWN
    )

    return SetupFamilyInference(
        primary_hypothesis=primary["hypothesis"],
        primary_confidence=round(primary["confidence"], 2),
        alternate_hypotheses=alternates,
        ambiguity_notes=ambiguity,
        recommendation_hints=hints,
        notes=notes,
        field_status=_setup_status,
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
