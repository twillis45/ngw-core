"""VLM Reconstruction Layer — intermediate physical reconstruction from pipeline signals.

This module implements a second VLM call that sits BETWEEN:
- VLM signal extraction + CV pipeline passes (upstream)
- NGW rule engine (downstream)

It takes the structured JSON produced by the full vision pipeline and asks a VLM
to reason about the extracted signals, build reconstruction candidates, and
estimate the most likely physical lighting configuration.

The output is an intermediate reconstruction object — NOT a final setup
selection, gear recommendation, or photographer-facing instruction.

Configuration (inherits from engine/vlm.py):
    VLM_PROVIDER      – "openai" | "anthropic" | "none"
    OPENAI_API_KEY    – Required when VLM_PROVIDER is "openai"
    ANTHROPIC_API_KEY – Required when VLM_PROVIDER is "anthropic"
    VLM_MODEL         – Model name override
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, List, Optional

from engine.image_analysis_models import (
    VLMReconstruction,
    VLMReconPrimary,
    VLMReconCandidate,
    VLMReconModifierCandidate,
    VLMReconRole,
    VLMReconRoles,
)

logger = logging.getLogger(__name__)

# ── System prompt ─────────────────────────────────────────────────────────

_RECON_SYSTEM_PROMPT = """\
You are the reconstruction layer for NGW (No Guesswork).
You will receive structured JSON produced by the NGW visual signal extraction pipeline.
Your job is to:
1. interpret the extracted signals
2. build one or more reconstruction candidates
3. estimate the most likely physical lighting configuration
4. report uncertainty honestly
5. return structured JSON only
You must NOT:
- generate stylistic labels like "cinematic" or "Rembrandt"
- make photographer-facing recommendations
- generate prose explanations
- override the NGW rule engine
- assume facts not supported by the signal data
This reconstruction layer sits BETWEEN:
- VLM signal extraction
- NGW rule engine
Your output is an intermediate physical reconstruction candidate only.
==================================================
INPUT
==================================================
You will receive structured JSON with pass outputs such as:
geometry_pass
pose_solver_pass
surface_class_pass
shadow_pass
highlight_pass
catchlight_pass
background_pass
specular_surface_pass
light_direction_field_pass
inverse_square_solver_pass
solar_geometry_pass
window_geometry_pass
bounce_geometry_pass
reflection_geometry_pass
shadow_penumbra_pass
occlusion_shadow_pass
color_temperature_pass
environment_light_pass
modifier_shape_solver_pass
light_role_support_signals
global_uncertainty_notes
==================================================
PRIMARY TASK
==================================================
Use the input signals to estimate:
1. dominant source direction
2. dominant source height
3. source size class
4. source distance class
5. probable modifier family candidates
6. probable environment
7. probable light count
8. probable light roles
9. whether negative fill is likely
10. whether background lighting is likely
11. whether bounce is likely
12. whether the image is too ambiguous for high-confidence reconstruction
==================================================
RECONSTRUCTION RULES
==================================================
Use the following priority order when reconstructing:
Priority 1
- catchlight geometry
- dominant_light_vector_deg from light_direction_field_pass
- highlight axis / rolloff
- modifier_shape_solver_pass
Priority 2
- shadow vector
- shadow penumbra
- inverse square falloff estimate
- reflection geometry
Priority 3
- background gradient
- bounce evidence
- color temperature
- solar/window/environment signals
Always account for:
- pose interference
- surface/material response
- occlusion shadows
- false multi-light risk
If signals conflict, reduce confidence rather than forcing certainty.
==================================================
STEP 1 — ESTIMATE DOMINANT SOURCE
==================================================
Estimate:
- key_light_angle_deg
- key_light_height_class
- key_light_height_deg_estimate
- key_light_distance_class
- key_light_distance_ft_estimate
Use:
- light_direction_field_pass
- catchlight_pass
- highlight_pass
- inverse_square_solver_pass
- shadow_pass
Allowed height classes:
- low
- eye_level
- slightly_above_eye
- high
- overhead
- unknown
Allowed distance classes:
- very_close
- close
- medium
- far
- unknown
==================================================
STEP 2 — ESTIMATE SOURCE SIZE / MODIFIER FAMILY
==================================================
Estimate:
- source_size_class
- modifier_family_candidates
Allowed size classes:
- very_small
- small
- medium
- large
- very_large
- unknown
Allowed modifier families:
- octa
- softbox
- stripbox
- beauty_dish
- parabolic_umbrella
- umbrella
- reflector_hard
- bare_bulb
- window
- sun
- unknown
Do not force a single modifier if evidence is weak.
Return candidates with confidence.
Use:
- modifier_shape_solver_pass
- shadow_penumbra_pass
- highlight_pass
- reflection_geometry_pass
- catchlight_pass
==================================================
STEP 3 — ESTIMATE ENVIRONMENT
==================================================
Estimate:
- environment
- environment_confidence
Allowed values:
- studio
- window
- sun
- open_shade
- overcast
- mixed
- product_tabletop
- unknown
Use:
- environment_light_pass
- solar_geometry_pass
- window_geometry_pass
- bounce_geometry_pass
- color_temperature_pass
- background_pass
==================================================
STEP 4 — ESTIMATE LIGHT COUNT AND ROLES
==================================================
Estimate:
- likely_light_count
- light_count_confidence
- roles
Roles should include:
- key
- fill
- negative_fill
- rim
- kicker
- background
- bounce
Example structure:
{
  "key": {"present": true, "confidence": 0.95},
  "fill": {"present": false, "confidence": 0.70},
  "negative_fill": {"present": true, "confidence": 0.68},
  "rim": {"present": false, "confidence": 0.42},
  "background": {"present": true, "confidence": 0.61},
  "bounce": {"present": false, "confidence": 0.40}
}
Use:
- light_role_support_signals
- background_pass
- bounce_geometry_pass
- reflection geometry
- false_multi_light_risk
Do not over-call multi-light setups.
==================================================
STEP 5 — BUILD RECONSTRUCTION CANDIDATES
==================================================
Create up to 3 candidates if ambiguity exists.
Each candidate should include:
- candidate_id
- key_light_angle_deg
- key_light_height_class
- key_light_height_deg_estimate
- key_light_distance_class
- key_light_distance_ft_estimate
- source_size_class
- modifier_family_candidates
- environment
- likely_light_count
- roles
- confidence_score
- ambiguity_notes
If one candidate is clearly stronger, still return it in a candidates array.
==================================================
STEP 6 — BUILD PRIMARY RECONSTRUCTION OUTPUT
==================================================
Return one primary reconstruction object summarizing the most likely physical interpretation.
Include:
- dominant_source_direction_deg
- dominant_source_height_class
- dominant_source_distance_ft
- source_size_class
- modifier_family_candidates
- environment
- likely_light_count
- roles
- reconstruction_confidence
- ambiguity_notes
- contradiction_notes
==================================================
CONFIDENCE GUIDELINES
==================================================
Increase confidence when:
- catchlights are clear
- LDF vectors cluster tightly
- highlight and shadow signals agree
- environment cues are consistent
- modifier shape evidence is strong
Reduce confidence when:
- pose complexity is high
- reflective surfaces dominate
- occlusion shadows are present
- eyes are obscured
- light role signals conflict
- multiple hypotheses remain plausible
Confidence score should be 0.0–1.0
==================================================
IMPORTANT RULE
==================================================
Do NOT produce:
- final setup selection
- exact gear recommendation
- photographer-facing instruction
- final diagram
- style labels
This output must remain an intermediate reconstruction object for the NGW rule engine.
==================================================
OUTPUT FORMAT
==================================================
Return JSON only with this structure:
{
  "primary_reconstruction": {
    "dominant_source_direction_deg": null,
    "dominant_source_height_class": null,
    "dominant_source_height_deg_estimate": null,
    "dominant_source_distance_class": null,
    "dominant_source_distance_ft": null,
    "source_size_class": null,
    "modifier_family_candidates": [
      {"type": "unknown", "confidence": 0.0}
    ],
    "environment": "unknown",
    "likely_light_count": null,
    "roles": {
      "key": {"present": null, "confidence": 0.0},
      "fill": {"present": null, "confidence": 0.0},
      "negative_fill": {"present": null, "confidence": 0.0},
      "rim": {"present": null, "confidence": 0.0},
      "kicker": {"present": null, "confidence": 0.0},
      "background": {"present": null, "confidence": 0.0},
      "bounce": {"present": null, "confidence": 0.0}
    },
    "reconstruction_confidence": 0.0,
    "ambiguity_notes": [],
    "contradiction_notes": []
  },
  "candidates": [
    {
      "candidate_id": "candidate_1",
      "key_light_angle_deg": null,
      "key_light_height_class": null,
      "key_light_height_deg_estimate": null,
      "key_light_distance_class": null,
      "key_light_distance_ft_estimate": null,
      "source_size_class": null,
      "modifier_family_candidates": [],
      "environment": "unknown",
      "likely_light_count": null,
      "roles": {},
      "confidence_score": 0.0,
      "ambiguity_notes": []
    }
  ]
}
Return JSON only.
No markdown.
No prose outside JSON."""

_RECON_USER_PROMPT = """\
Below is the structured signal extraction output from the NGW vision pipeline. \
Interpret these signals and produce a physical reconstruction. Return JSON only."""


# ── Signal serializer ─────────────────────────────────────────────────────

# Keys from the pipeline results dict that we pass to the VLM
_PIPELINE_KEYS = [
    "geometry",
    "pose_solver",
    "surface_class",
    "shadow",
    "highlight",
    "catchlight",
    "background",
    "specular_surface",
    "light_direction_field",
    "inverse_square",
    "solar",
    "window",
    "bounce",
    "reflection",
    "penumbra",
    "occlusion",
    "color_temp",
    "environment",
    "modifier_shape",
]

# Keys that should NOT be forwarded (internal arrays, images, etc.)
_STRIP_KEYS = {
    "ldf_vectors",           # numpy arrays
    "reflection_regions",    # large contour data
    "bounce_sources",        # can be large
}


def _sanitize_for_json(obj: Any) -> Any:
    """Recursively convert non-JSON-serializable values to strings."""
    if obj is None or isinstance(obj, (bool, int, float, str)):
        return obj
    if isinstance(obj, dict):
        return {
            k: _sanitize_for_json(v)
            for k, v in obj.items()
            if k not in _STRIP_KEYS
        }
    if isinstance(obj, (list, tuple)):
        return [_sanitize_for_json(item) for item in obj]
    # numpy scalars, etc.
    try:
        return float(obj)
    except (TypeError, ValueError):
        return str(obj)


def serialize_pipeline_signals(pipeline_results: Dict[str, Any]) -> str:
    """Extract and serialize relevant pipeline pass outputs for the VLM.

    Builds a clean JSON string containing pass outputs that the reconstruction
    VLM needs to reason about. Strips non-serializable data (numpy arrays,
    large contour lists) and adds light_role_support_signals + global
    uncertainty notes.
    """
    payload: Dict[str, Any] = {}

    for key in _PIPELINE_KEYS:
        val = pipeline_results.get(key)
        if val is not None:
            payload[f"{key}_pass"] = _sanitize_for_json(val)

    # Add light_role / hypothesis support signals
    hypothesis = pipeline_results.get("hypothesis") or pipeline_results.get("light_role")
    if hypothesis:
        support = {
            "likely_light_count": hypothesis.get("likely_light_count"),
            "light_count_confidence": hypothesis.get("light_count_confidence"),
            "roles": hypothesis.get("roles"),
            "multi_light_evidence_score": hypothesis.get("multi_light_evidence_score"),
            "false_multi_light_risk": hypothesis.get("false_multi_light_risk"),
            "light_role_notes": hypothesis.get("light_role_notes"),
        }
        payload["light_role_support_signals"] = _sanitize_for_json(support)

    # Add physics consistency results as uncertainty notes
    physics = pipeline_results.get("physics")
    uncertainty_notes: List[str] = []
    if physics:
        score = physics.get("best_physics_score", 0)
        violations = physics.get("violation_summary", [])
        if score < 0.5:
            uncertainty_notes.append(f"Physics consistency is low ({score:.2f})")
        if violations:
            uncertainty_notes.extend(violations[:5])

    # Add validation warnings
    validation = pipeline_results.get("validation", {})
    val_warnings = validation.get("warnings", [])
    if val_warnings:
        uncertainty_notes.extend(val_warnings[:3])

    payload["global_uncertainty_notes"] = uncertainty_notes

    return json.dumps(payload, indent=2, default=str)


# ── VLM callers ───────────────────────────────────────────────────────────

def _call_openai_recon(signal_json: str) -> Dict[str, Any]:
    """Call OpenAI with the reconstruction prompt and pipeline signals."""
    try:
        from openai import OpenAI
    except ImportError:
        raise RuntimeError("openai package not installed. Run: pip install openai")

    from engine.vlm import _VLM_MODEL, _call_with_retry

    client = OpenAI()

    def _do_call(_unused: str) -> Dict[str, Any]:
        response = client.chat.completions.create(
            model=_VLM_MODEL,
            messages=[
                {"role": "system", "content": _RECON_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": f"{_RECON_USER_PROMPT}\n\n{signal_json}",
                },
            ],
            max_tokens=3000,
            temperature=0.15,
            response_format={"type": "json_object"},
        )
        raw_text = response.choices[0].message.content or "{}"
        return json.loads(raw_text)

    return _call_with_retry(_do_call, signal_json, "OpenAI")


def _call_anthropic_recon(signal_json: str) -> Dict[str, Any]:
    """Call Anthropic with the reconstruction prompt and pipeline signals."""
    try:
        from anthropic import Anthropic
    except ImportError:
        raise RuntimeError("anthropic package not installed. Run: pip install anthropic")

    from engine.vlm import _VLM_MODEL, _call_with_retry

    client = Anthropic()

    def _do_call(_unused: str) -> Dict[str, Any]:
        response = client.messages.create(
            model=_VLM_MODEL,
            max_tokens=3000,
            system=_RECON_SYSTEM_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": f"{_RECON_USER_PROMPT}\n\n{signal_json}",
                },
            ],
        )
        raw_text = response.content[0].text or "{}"
        # Strip markdown fencing if present
        if raw_text.startswith("```"):
            lines = raw_text.split("\n")
            lines = [line for line in lines if not line.strip().startswith("```")]
            raw_text = "\n".join(lines)
        return json.loads(raw_text)

    return _call_with_retry(_do_call, signal_json, "Anthropic")


# ── Response parser ───────────────────────────────────────────────────────

def _parse_roles(raw_roles: Any) -> Optional[VLMReconRoles]:
    """Parse roles dict into VLMReconRoles model."""
    if not raw_roles or not isinstance(raw_roles, dict):
        return None
    try:
        parsed = {}
        for role_name in ("key", "fill", "negative_fill", "rim", "kicker", "background", "bounce"):
            role_data = raw_roles.get(role_name, {})
            if isinstance(role_data, dict):
                parsed[role_name] = VLMReconRole(
                    present=role_data.get("present"),
                    confidence=float(role_data.get("confidence", 0.0)),
                )
            else:
                parsed[role_name] = VLMReconRole()
        return VLMReconRoles(**parsed)
    except Exception as exc:
        logger.debug("Failed to parse roles: %s", exc)
        return None


def _parse_modifier_candidates(raw: Any) -> List[VLMReconModifierCandidate]:
    """Parse modifier family candidates list."""
    if not raw or not isinstance(raw, list):
        return []
    result = []
    for item in raw:
        if isinstance(item, dict):
            result.append(VLMReconModifierCandidate(
                type=item.get("type", "unknown"),
                confidence=float(item.get("confidence", 0.0)),
            ))
    return result


def _parse_candidate(raw: Dict[str, Any]) -> VLMReconCandidate:
    """Parse a single reconstruction candidate."""
    return VLMReconCandidate(
        candidate_id=raw.get("candidate_id", "candidate_1"),
        key_light_angle_deg=raw.get("key_light_angle_deg"),
        key_light_height_class=raw.get("key_light_height_class"),
        key_light_height_deg_estimate=raw.get("key_light_height_deg_estimate"),
        key_light_distance_class=raw.get("key_light_distance_class"),
        key_light_distance_ft_estimate=raw.get("key_light_distance_ft_estimate"),
        source_size_class=raw.get("source_size_class"),
        modifier_family_candidates=_parse_modifier_candidates(
            raw.get("modifier_family_candidates", [])
        ),
        environment=raw.get("environment", "unknown"),
        likely_light_count=raw.get("likely_light_count"),
        roles=_parse_roles(raw.get("roles")),
        confidence_score=float(raw.get("confidence_score", 0.0)),
        ambiguity_notes=raw.get("ambiguity_notes", []),
    )


def _parse_primary(raw: Dict[str, Any]) -> VLMReconPrimary:
    """Parse the primary reconstruction output."""
    return VLMReconPrimary(
        dominant_source_direction_deg=raw.get("dominant_source_direction_deg"),
        dominant_source_height_class=raw.get("dominant_source_height_class"),
        dominant_source_height_deg_estimate=raw.get("dominant_source_height_deg_estimate"),
        dominant_source_distance_class=raw.get("dominant_source_distance_class"),
        dominant_source_distance_ft=raw.get("dominant_source_distance_ft"),
        source_size_class=raw.get("source_size_class"),
        modifier_family_candidates=_parse_modifier_candidates(
            raw.get("modifier_family_candidates", [])
        ),
        environment=raw.get("environment", "unknown"),
        likely_light_count=raw.get("likely_light_count"),
        roles=_parse_roles(raw.get("roles")),
        reconstruction_confidence=float(raw.get("reconstruction_confidence", 0.0)),
        ambiguity_notes=raw.get("ambiguity_notes", []),
        contradiction_notes=raw.get("contradiction_notes", []),
    )


def parse_vlm_reconstruction(raw: Dict[str, Any]) -> VLMReconstruction:
    """Parse the full VLM reconstruction response into typed models.

    Gracefully handles missing/malformed data — each section is parsed
    independently and falls back to defaults.
    """
    primary_raw = raw.get("primary_reconstruction", {})
    candidates_raw = raw.get("candidates", [])

    try:
        primary = _parse_primary(primary_raw) if primary_raw else VLMReconPrimary()
    except Exception as exc:
        logger.warning("Failed to parse primary reconstruction: %s", exc)
        primary = VLMReconPrimary()

    candidates = []
    for c in candidates_raw:
        try:
            candidates.append(_parse_candidate(c))
        except Exception as exc:
            logger.debug("Failed to parse candidate: %s", exc)

    return VLMReconstruction(
        primary_reconstruction=primary,
        candidates=candidates,
        ok=True,
    )


# ── Public API ────────────────────────────────────────────────────────────

def vlm_reconstruct(
    pipeline_results: Dict[str, Any],
) -> Optional[VLMReconstruction]:
    """Run VLM-based reconstruction on pipeline signal outputs.

    Takes the full pipeline results dict (from ``run_extended_pipeline``)
    and sends the serialized signals to a VLM for physical reconstruction.

    Returns None if:
    - VLM is not configured (no API key)
    - The API call fails
    - Pipeline results are empty

    This function is best-effort — failures are logged but never propagate.
    """
    from engine.vlm import vlm_available, _VLM_PROVIDER

    if not vlm_available():
        logger.debug("VLM not available for reconstruction (provider=%s)", _VLM_PROVIDER)
        return None

    if not pipeline_results:
        logger.warning("VLM reconstruction: empty pipeline results")
        return None

    try:
        signal_json = serialize_pipeline_signals(pipeline_results)
        logger.debug(
            "VLM reconstruction input: %d chars, %d pass keys",
            len(signal_json),
            sum(1 for k in _PIPELINE_KEYS if k in pipeline_results),
        )

        if _VLM_PROVIDER == "openai":
            raw = _call_openai_recon(signal_json)
        elif _VLM_PROVIDER == "anthropic":
            raw = _call_anthropic_recon(signal_json)
        else:
            logger.warning("Unknown VLM provider for reconstruction: %s", _VLM_PROVIDER)
            return None

        result = parse_vlm_reconstruction(raw)
        logger.info(
            "VLM reconstruction complete: confidence=%.2f, candidates=%d",
            result.primary_reconstruction.reconstruction_confidence,
            len(result.candidates),
        )
        return result

    except Exception as exc:
        logger.warning("VLM reconstruction failed: %s", exc, exc_info=True)
        return VLMReconstruction(
            ok=False,
            notes=[f"VLM reconstruction call failed: {exc}"],
        )
