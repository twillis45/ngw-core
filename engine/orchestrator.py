"""Central orchestrator — single authoritative entry point for all engine flows.

This module eliminates ad-hoc route-level composition by providing three
high-level functions that coordinate the full decision chain:

    analyze_image()      — full image analysis pipeline (vision + solver + reference read)
    recommend_system()   — rule-based system recommendation
    evaluate_test_shot() — quick vision feedback for on-set test shots

The solver chain (consensus → consistency → contradiction → simulation →
validation → trace) is wired in here and ENRICHES existing pipeline output.
It never replaces cue_inference or reference_read — it adds structured
confidence, contradiction, and trace data alongside them.

Decision chain::

    describe_image  →  run_extended_pipeline  →  cue_inference
        →  consensus_solver  →  consistency_engine  →  contradiction_engine
        →  lighting_simulator + hypothesis_validator
        →  solver_trace
        →  reference_read  →  output

Usage::

    from engine.orchestrator import analyze_image, recommend_system

    result = analyze_image("/path/to/image.jpg")
    rec = recommend_system(systems, input_ctx={...})
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Sequence

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════
# Result containers
# ═══════════════════════════════════════════════════════════════════════════

class AnalysisResult:
    """Structured result from the full analysis pipeline."""

    __slots__ = (
        "ok", "description", "vision_data", "classification",
        "cue_report", "lighting_intel", "reference_analysis",
        "pipeline_results", "vlm_description", "vlm_reconstruction",
        "solver_result", "debug_data", "notes",
    )

    def __init__(self) -> None:
        self.ok: bool = True
        self.description: Dict[str, Any] = {}
        self.vision_data: Dict[str, Any] = {}
        self.classification: Dict[str, Any] = {}
        self.cue_report: Any = None
        self.lighting_intel: Any = None
        self.reference_analysis: Any = None
        self.pipeline_results: Optional[Dict[str, Any]] = None
        self.vlm_description: Any = None
        self.vlm_reconstruction: Any = None
        self.solver_result: Any = None
        self.debug_data: Dict[str, Any] = {}
        self.notes: List[str] = []


# ═══════════════════════════════════════════════════════════════════════════
# 1. Full image analysis
# ═══════════════════════════════════════════════════════════════════════════

def analyze_image(
    image_path: str,
    *,
    run_extended: bool = True,
    run_vlm: bool = False,
    run_solver: bool = True,
    debug: bool = False,
) -> AnalysisResult:
    """Full analysis pipeline — single entry point for all image analysis.

    Runs the following chain:
        1. describe_image (extraction)
        2. run_extended_pipeline (30+ signal passes)
        3. cue_inference_pipeline (interpretation)
        4. Solver chain: consensus → consistency → contradiction
        5. Hypothesis simulation + validation
        6. Solver trace
        7. Reference read (three-layer analysis)

    Parameters
    ----------
    image_path : str
        Path to the image file.
    run_extended : bool
        Run the full 30+ pass extended pipeline. Default True.
    run_vlm : bool
        Include VLM analysis if available. Default False.
    run_solver : bool
        Run the solver chain (consensus, consistency, contradiction).
        Default True.
    debug : bool
        Preserve debug data (masks, img_bgr) for overlay generation.

    Returns
    -------
    AnalysisResult
        Structured result with all pipeline outputs.
    """
    result = AnalysisResult()

    # ── Step 1: Image description (cue extraction) ──────────────────
    try:
        from engine.image_analysis import describe_image as _describe

        raw = _describe(image_path, "vision", debug=debug)
        result.description = {k: v for k, v in raw.items() if not k.startswith("_")}
        result.cue_report = raw.get("_cue_report")
        result.vlm_description = raw.get("_vlm_description")
        result.vision_data = raw.get("vision", {})
        result.classification = raw.get("classification", {})

        if debug:
            result.debug_data = {
                "img_bgr": raw.get("_debug_img_bgr"),
                "masks": raw.get("_debug_masks", {}),
                "face_box": raw.get("_debug_face_box"),
            }

        if not raw.get("ok"):
            result.ok = False
            result.notes.append("describe_image failed")
            return result
    except Exception as exc:
        logger.error("describe_image failed: %s", exc)
        result.ok = False
        result.notes.append(f"describe_image error: {exc}")
        return result

    # ── Step 2: Extended pipeline (signal + synthesis passes) ───────
    if run_extended:
        result.pipeline_results = _run_extended_pipeline(result)

    # ── Step 3: Lighting inference ──────────────────────────────────
    try:
        from engine.lighting_inference import infer_lighting_from_vision

        result.lighting_intel = infer_lighting_from_vision(
            result.vision_data,
            classification=result.classification,
            cue_report=result.cue_report,
        )
    except Exception as exc:
        logger.warning("Lighting inference failed: %s", exc)
        result.notes.append(f"lighting_inference skipped: {exc}")

    # ── Step 4: Cue inference pipeline (interpretation) ─────────────
    cue_inference_result = None
    if result.cue_report:
        try:
            from engine.cue_inference import run_cue_inference_pipeline

            cue_inference_result = run_cue_inference_pipeline(result.cue_report)
        except Exception as exc:
            logger.warning("Cue inference failed: %s", exc)
            result.notes.append(f"cue_inference skipped: {exc}")

    # ── Step 5: Solver chain (consensus → consistency → contradiction) ──
    if run_solver and result.pipeline_results:
        result.solver_result = _run_solver_chain(
            result.pipeline_results,
            result.cue_report,
            cue_inference_result,
            result.vision_data,
        )

    # ── Step 6: Reference read (three-layer analysis) ───────────────
    try:
        from engine.reference_read import build_reference_photo_analysis

        result.reference_analysis = build_reference_photo_analysis(
            vision_data=result.vision_data,
            classification=result.classification,
            cue_report=result.cue_report,
            lighting_intel=result.lighting_intel,
            image_analysis=raw if 'raw' in dir() else result.description,
            vlm_description=result.vlm_description,
        )
    except Exception as exc:
        logger.warning("Reference read failed: %s", exc)
        result.notes.append(f"reference_read skipped: {exc}")

    # ── Extract VLM reconstruction if available ─────────────────────
    if result.pipeline_results:
        result.vlm_reconstruction = result.pipeline_results.get("vlm_reconstruction")

    return result


# ═══════════════════════════════════════════════════════════════════════════
# 2. System recommendation
# ═══════════════════════════════════════════════════════════════════════════

def recommend_system(
    systems: Sequence[Dict[str, Any]],
    *,
    input_ctx: Optional[Dict[str, Any]] = None,
    modifiers_available: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Recommend best lighting system — wraps the rule engine.

    Parameters
    ----------
    systems : list of dicts
        Available lighting system definitions.
    input_ctx : dict or None
        User input context (mood, environment, gear, skin_tone).
    modifiers_available : list of str or None
        Modifier names available to the user.

    Returns
    -------
    dict
        Selection result from the rule engine.
    """
    from engine.selector import select_best_system, as_public_selection

    outcome = select_best_system(
        list(systems),
        input_ctx=input_ctx,
        modifiers_available=modifiers_available or [],
    )
    return as_public_selection(outcome)


# ═══════════════════════════════════════════════════════════════════════════
# 3. Test shot evaluation
# ═══════════════════════════════════════════════════════════════════════════

def evaluate_test_shot(image_path: str) -> Dict[str, Any]:
    """Quick vision feedback on a test shot.

    Runs only the extraction layer (no extended pipeline, no solver)
    for fast on-set feedback.

    Returns
    -------
    dict
        Vision description with classification and cue report.
    """
    from engine.image_analysis import describe_image as _describe

    raw = _describe(image_path, "vision")
    return {k: v for k, v in raw.items() if not k.startswith("_")}


# ═══════════════════════════════════════════════════════════════════════════
# Internal: Extended pipeline runner
# ═══════════════════════════════════════════════════════════════════════════

def _run_extended_pipeline(result: AnalysisResult) -> Optional[Dict[str, Any]]:
    """Run the 30+ pass extended vision pipeline."""
    try:
        import numpy as np
        from engine.vision_passes import run_extended_pipeline

        img_bgr = result.debug_data.get("img_bgr")
        if img_bgr is None:
            return None

        masks = result.debug_data.get("masks", {})
        face_box = result.debug_data.get("face_box")

        return run_extended_pipeline(
            img_bgr,
            person_mask=masks.get("person") if isinstance(masks, dict) else None,
            skin_mask=masks.get("skin") if isinstance(masks, dict) else None,
            background_mask=masks.get("background") if isinstance(masks, dict) else None,
            face_box=face_box,
            existing_catchlights=result.vision_data.get("catchlights"),
            existing_geometry=result.vision_data.get("pose"),
        )
    except Exception as exc:
        logger.warning("Extended pipeline failed: %s", exc)
        result.notes.append(f"extended_pipeline skipped: {exc}")
        return None


# ═══════════════════════════════════════════════════════════════════════════
# Internal: Solver chain
# ═══════════════════════════════════════════════════════════════════════════

def _run_solver_chain(
    pass_outputs: Dict[str, Any],
    cue_report: Any,
    cue_inference_result: Optional[Dict[str, Any]],
    vision_data: Optional[Dict[str, Any]],
) -> Optional[Any]:
    """Run consensus → consistency → contradiction → trace.

    Returns a SolverResult or None if the chain fails.
    The solver chain ENRICHES existing data — it never replaces
    cue_inference or reference_read outputs.
    """
    try:
        from engine.signal_weights import compute_pass_weights, compute_region_reliability
        from engine.consensus_solver import solve_dominant_source
        from engine.consistency_engine import score_consistency
        from engine.contradiction_engine import find_contradictions
        from engine.solver_trace import build_solver_trace
        from engine.solver_models import SolverResult

        # ── Pass weights (contamination downgrading) ──
        pass_weights = compute_pass_weights(
            cue_report=cue_report,
            vision_data=vision_data,
        )

        # ── Region reliability ──
        region_reliability = compute_region_reliability(
            vision_data=vision_data,
            scene_ctx=None,
            cue_report=cue_report,
        )

        # ── Consensus (weighted voting across passes) ──
        consensus = solve_dominant_source(
            pass_outputs, pass_weights, cue_inference=cue_inference_result,
        )

        # ── Consistency (cross-pass agreement scoring) ──
        consistency_scores = score_consistency(pass_outputs, pass_weights)
        overall_consistency = (
            sum(cs.overall_score for cs in consistency_scores) / len(consistency_scores)
            if consistency_scores else 0.0
        )

        # ── Contradictions ──
        contradiction_report = find_contradictions(
            pass_outputs,
            cue_report=cue_report,
            cue_inference=cue_inference_result,
        )

        # ── Hypothesis candidates (from synthesis passes) ──
        candidates = _extract_candidates(pass_outputs)

        # ── Solver trace ──
        trace = build_solver_trace(
            consensus_result=consensus,
            pass_weight_profile=pass_weights,
            contradiction_report=contradiction_report,
            region_reliability=region_reliability,
            candidates=candidates,
            overall_consistency=overall_consistency,
        )

        # ── Assemble SolverResult ──
        return SolverResult(
            candidates=candidates,
            consensus=consensus,
            consistency_scores=consistency_scores,
            overall_consistency=overall_consistency,
            contradiction_report=contradiction_report,
            region_reliability=region_reliability,
            pass_weight_profile=pass_weights,
            solver_trace=trace,
            needs_review=trace.needs_review,
            needs_review_reasons=trace.needs_review_reasons,
            regional_confidence=trace.regional_confidence,
            signal_reliability=trace.signal_reliability,
            ok=True,
        )
    except Exception as exc:
        logger.warning("Solver chain failed: %s", exc)
        return None


def _extract_candidates(pass_outputs: Dict[str, Any]) -> list:
    """Extract lighting hypothesis candidates from synthesis pass outputs."""
    from engine.solver_models import LightingHypothesis

    candidates = []

    # From lighting_hypothesis_engine pass
    hyp_data = pass_outputs.get("hypothesis", {})
    if isinstance(hyp_data, dict):
        raw_candidates = hyp_data.get("candidates", [])
        for i, cand in enumerate(raw_candidates):
            if isinstance(cand, dict):
                candidates.append(LightingHypothesis(
                    hypothesis_id=cand.get("id", f"h_{i}"),
                    confidence=cand.get("confidence", 0.0),
                    pattern_name=cand.get("pattern", "unknown"),
                    environment=cand.get("environment", "unknown"),
                    generation_reason=cand.get("reason", "synthesis_pass"),
                ))

    # Fallback: if no candidates from synthesis, create one from cue inference
    if not candidates:
        light_role = pass_outputs.get("light_role", {})
        if isinstance(light_role, dict) and light_role.get("ok"):
            candidates.append(LightingHypothesis(
                hypothesis_id="h_cue_fallback",
                confidence=light_role.get("confidence", 0.3),
                pattern_name=light_role.get("pattern", "unknown"),
                generation_reason="cue_inference_fallback",
            ))

    return candidates
