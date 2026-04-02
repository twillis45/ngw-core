"""Archetype classifier — maps extracted lighting signals to master profiles.

This is a *knowledge layer* that sits above the low-level vision passes.
It takes the structured output from catchlight topology, highlight analysis,
light structure, separation light, off-axis key, bounce contributor, and
continuous source passes, then scores each known archetype signature against
those signals.

Design principle: "Do not force stylistic labels inside low-level passes.
Extract and store signals cleanly so higher layers can classify and match them."

The archetype signatures are loaded from data/taxonomy/archetype_signatures.yaml.
Each signature defines expected signal ranges and weights. Classification
proceeds by evaluating each signal against the observed data, computing a
weighted match score, and returning the best-matching archetype(s).

Usage
-----
>>> from engine.archetype_classifier import classify_archetype
>>> result = classify_archetype(
...     catchlight_topology=topology_data,
...     highlight_symmetry=symmetry_data,
...     ...
... )
>>> result.primary_archetype  # "hurley" | "penn" | None
>>> result.primary_confidence  # 0.0–1.0
"""

from __future__ import annotations

import logging
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel, ConfigDict, Field

logger = logging.getLogger(__name__)

SIGNATURES_PATH = Path(__file__).resolve().parent.parent / "data" / "taxonomy" / "archetype_signatures.yaml"


# ═══════════════════════════════════════════════════════════════════════════
# Data Model
# ═══════════════════════════════════════════════════════════════════════════


class ArchetypeClassification(BaseModel):
    """Result of archetype classification."""
    model_config = ConfigDict(extra="forbid")

    primary_archetype: Optional[str] = None     # hurley|penn|karsh|leibovitz|etc
    primary_confidence: float = 0.0
    secondary_archetype: Optional[str] = None
    secondary_confidence: float = 0.0
    all_scores: Dict[str, float] = Field(default_factory=dict)
    matched_signals: List[str] = Field(default_factory=list)
    unmatched_signals: List[str] = Field(default_factory=list)
    notes: List[str] = Field(default_factory=list)
    ok: bool = True


# ═══════════════════════════════════════════════════════════════════════════
# Signature Loading
# ═══════════════════════════════════════════════════════════════════════════


@lru_cache(maxsize=1)
def load_archetype_signatures(path: Optional[str] = None) -> Dict[str, Any]:
    """Load archetype signature definitions from YAML.

    Returns a dict keyed by archetype_id (e.g. "hurley", "penn").
    Each value has: label, description, signals (dict), min_match_score.
    """
    import yaml

    p = Path(path) if path else SIGNATURES_PATH
    if not p.exists():
        logger.warning("Archetype signatures file not found: %s", p)
        return {}

    with open(p) as f:
        data = yaml.safe_load(f)

    if not isinstance(data, dict):
        logger.warning("Invalid archetype signatures format in %s", p)
        return {}

    return data


def _reload_signatures(path: Optional[str] = None) -> Dict[str, Any]:
    """Reload signatures (clears cache). For testing."""
    load_archetype_signatures.cache_clear()
    return load_archetype_signatures(path)


# ═══════════════════════════════════════════════════════════════════════════
# Signal Extraction from Pass Outputs
# ═══════════════════════════════════════════════════════════════════════════


def _extract_observed_signals(
    catchlight_topology: Optional[Dict[str, Any]] = None,
    highlight_symmetry: Optional[Dict[str, Any]] = None,
    highlight_axis_map: Optional[Dict[str, Any]] = None,
    off_axis_key: Optional[Dict[str, Any]] = None,
    light_structure: Optional[Dict[str, Any]] = None,
    separation_light: Optional[Dict[str, Any]] = None,
    bounce_contributor: Optional[Dict[str, Any]] = None,
    continuous_source: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Extract a flat dict of observed signal values from pass outputs.

    Only includes signals that are actually available (not None, not from
    failed passes).  Keys match the signal names used in
    archetype_signatures.yaml.
    """
    obs: Dict[str, Any] = {}

    # --- Catchlight topology ---
    if isinstance(catchlight_topology, dict) and catchlight_topology.get("ok"):
        geom = catchlight_topology.get("cluster_geometry")
        if geom and geom != "unknown":
            obs["catchlight_cluster_geometry"] = geom
        count = catchlight_topology.get("catchlight_count")
        if count is not None and count > 0:
            obs["catchlight_count"] = int(count)

    # --- Highlight symmetry ---
    if isinstance(highlight_symmetry, dict) and highlight_symmetry.get("ok"):
        sym = highlight_symmetry.get("symmetry_score")
        if sym is not None:
            obs["symmetry_score"] = float(sym)
        fill = highlight_symmetry.get("fill_detected")
        if fill is not None:
            obs["fill_detected"] = bool(fill)
        ev = highlight_symmetry.get("underfill_ev")
        if ev is not None:
            obs["underfill_ev"] = float(ev)

    # --- Highlight axis map ---
    if isinstance(highlight_axis_map, dict) and highlight_axis_map.get("ok"):
        ac = highlight_axis_map.get("axis_count")
        if ac is not None:
            obs["axis_count"] = int(ac)
        wr = highlight_axis_map.get("wrap_ratio")
        if wr is not None:
            obs["wrap_ratio"] = float(wr)

    # --- Off-axis key ---
    if isinstance(off_axis_key, dict) and off_axis_key.get("ok"):
        angle = off_axis_key.get("off_axis_angle_deg")
        if angle is not None:
            obs["off_axis_angle_deg"] = float(angle)

    # --- Light structure ---
    if isinstance(light_structure, dict) and light_structure.get("ok"):
        pname = light_structure.get("pattern_name")
        if pname and pname != "unknown":
            obs["light_structure_pattern"] = pname
        tri = light_structure.get("triangle_detected")
        if tri is not None:
            obs["triangle_detected"] = bool(tri)

    # --- Separation light ---
    if isinstance(separation_light, dict) and separation_light.get("ok"):
        if separation_light.get("has_hair_light") is not None:
            obs["has_hair_light"] = bool(separation_light["has_hair_light"])
        if separation_light.get("has_rim_light") is not None:
            obs["has_rim_light"] = bool(separation_light["has_rim_light"])
        conf = separation_light.get("spill_vs_intentional_confidence")
        if conf is not None:
            obs["spill_vs_intentional_confidence"] = float(conf)

    # --- Bounce contributor ---
    if isinstance(bounce_contributor, dict) and bounce_contributor.get("ok"):
        bc = bounce_contributor.get("total_bounce_contribution")
        if bc is not None:
            obs["bounce_contribution"] = float(bc)

    # --- Continuous source ---
    if isinstance(continuous_source, dict) and continuous_source.get("ok"):
        tech = continuous_source.get("likely_technology")
        if tech and tech != "unknown":
            obs["light_technology"] = tech
        sharp = continuous_source.get("specular_edge_sharpness")
        if sharp is not None:
            obs["specular_edge_sharpness"] = float(sharp)

    return obs


# ═══════════════════════════════════════════════════════════════════════════
# Signal Matching
# ═══════════════════════════════════════════════════════════════════════════


def _match_signal(
    signal_spec: Dict[str, Any],
    observed_value: Any,
) -> bool:
    """Check if an observed value matches a signal specification.

    Handles:
      - expected: exact match (str, bool, or list of acceptable values)
      - min / max: numeric range
      - min + max combined: value must be within [min, max]
    """
    if observed_value is None:
        return False

    # --- Boolean expected ---
    if "expected" in signal_spec:
        expected = signal_spec["expected"]

        if isinstance(expected, bool):
            return bool(observed_value) == expected

        if isinstance(expected, list):
            return str(observed_value).lower() in [str(e).lower() for e in expected]

        # Single value comparison
        return str(observed_value).lower() == str(expected).lower()

    # --- Numeric range ---
    try:
        val = float(observed_value)
    except (TypeError, ValueError):
        return False

    has_min = "min" in signal_spec
    has_max = "max" in signal_spec

    if has_min and has_max:
        return signal_spec["min"] <= val <= signal_spec["max"]
    elif has_min:
        return val >= signal_spec["min"]
    elif has_max:
        return val <= signal_spec["max"]

    return False


def _score_archetype(
    archetype_id: str,
    archetype_spec: Dict[str, Any],
    observed: Dict[str, Any],
) -> Tuple[float, List[str], List[str]]:
    """Score a single archetype against observed signals.

    Returns (normalised_score, matched_signals, unmatched_signals).
    The score is the weighted fraction of matching signals.
    """
    signals = archetype_spec.get("signals", {})
    if not signals:
        return 0.0, [], []

    total_weight = 0.0
    matched_weight = 0.0
    matched: List[str] = []
    unmatched: List[str] = []

    for signal_name, spec in signals.items():
        weight = float(spec.get("weight", 1.0))
        total_weight += weight

        if signal_name not in observed:
            # Signal not available — don't penalise, but don't reward
            continue

        if _match_signal(spec, observed[signal_name]):
            matched_weight += weight
            matched.append(f"{archetype_id}:{signal_name}")
        else:
            unmatched.append(f"{archetype_id}:{signal_name}")

    if total_weight <= 0:
        return 0.0, matched, unmatched

    score = matched_weight / total_weight
    return round(score, 4), matched, unmatched


# ═══════════════════════════════════════════════════════════════════════════
# Main Classifier
# ═══════════════════════════════════════════════════════════════════════════


def classify_archetype(
    catchlight_topology: Optional[Dict[str, Any]] = None,
    highlight_symmetry: Optional[Dict[str, Any]] = None,
    highlight_axis_map: Optional[Dict[str, Any]] = None,
    off_axis_key: Optional[Dict[str, Any]] = None,
    light_structure: Optional[Dict[str, Any]] = None,
    separation_light: Optional[Dict[str, Any]] = None,
    bounce_contributor: Optional[Dict[str, Any]] = None,
    continuous_source: Optional[Dict[str, Any]] = None,
    signatures_path: Optional[str] = None,
) -> ArchetypeClassification:
    """Classify lighting signals against known archetype signatures.

    Parameters
    ----------
    catchlight_topology : dict, optional
        Output from catchlight_topology_pass.
    highlight_symmetry : dict, optional
        Output from highlight_symmetry_pass.
    highlight_axis_map : dict, optional
        Output from highlight_axis_map_pass.
    off_axis_key : dict, optional
        Output from off_axis_key_pass.
    light_structure : dict, optional
        Output from light_structure_pass.
    separation_light : dict, optional
        Output from separation_light_pass.
    bounce_contributor : dict, optional
        Output from bounce_contributor_pass.
    continuous_source : dict, optional
        Output from continuous_source_heuristic_pass.
    signatures_path : str, optional
        Override path to archetype_signatures.yaml (for testing).

    Returns
    -------
    ArchetypeClassification
        Classification result with primary/secondary archetype and scores.
    """
    # Load signatures
    try:
        if signatures_path:
            sigs = _reload_signatures(signatures_path)
        else:
            sigs = load_archetype_signatures()
    except Exception as exc:
        logger.warning("Failed to load archetype signatures: %s", exc)
        return ArchetypeClassification(
            ok=False,
            notes=[f"Failed to load signatures: {exc}"],
        )

    if not sigs:
        return ArchetypeClassification(
            ok=True,
            notes=["No archetype signatures loaded"],
        )

    # Extract observed signals
    observed = _extract_observed_signals(
        catchlight_topology=catchlight_topology,
        highlight_symmetry=highlight_symmetry,
        highlight_axis_map=highlight_axis_map,
        off_axis_key=off_axis_key,
        light_structure=light_structure,
        separation_light=separation_light,
        bounce_contributor=bounce_contributor,
        continuous_source=continuous_source,
    )

    if not observed:
        return ArchetypeClassification(
            ok=True,
            notes=["No signals available for classification"],
        )

    # Score each archetype
    all_scores: Dict[str, float] = {}
    all_matched: List[str] = []
    all_unmatched: List[str] = []

    for arch_id, arch_spec in sigs.items():
        score, matched, unmatched = _score_archetype(arch_id, arch_spec, observed)
        min_score = float(arch_spec.get("min_match_score", 0.5))

        if score >= min_score:
            all_scores[arch_id] = score
        else:
            all_scores[arch_id] = 0.0  # Below threshold

        all_matched.extend(matched)
        all_unmatched.extend(unmatched)

    # Find top two
    sorted_archetypes = sorted(all_scores.items(), key=lambda x: x[1], reverse=True)

    primary_arch = None
    primary_conf = 0.0
    secondary_arch = None
    secondary_conf = 0.0

    if sorted_archetypes and sorted_archetypes[0][1] > 0:
        primary_arch = sorted_archetypes[0][0]
        primary_conf = sorted_archetypes[0][1]

    if len(sorted_archetypes) > 1 and sorted_archetypes[1][1] > 0:
        secondary_arch = sorted_archetypes[1][0]
        secondary_conf = sorted_archetypes[1][1]

    notes: List[str] = []
    if observed:
        notes.append(f"Evaluated {len(observed)} observed signals against {len(sigs)} archetypes")
    if primary_arch:
        label = sigs.get(primary_arch, {}).get("label", primary_arch)
        notes.append(f"Best match: {label} ({primary_conf:.1%})")

    return ArchetypeClassification(
        primary_archetype=primary_arch,
        primary_confidence=round(primary_conf, 4),
        secondary_archetype=secondary_arch,
        secondary_confidence=round(secondary_conf, 4),
        all_scores={k: round(v, 4) for k, v in all_scores.items()},
        matched_signals=all_matched,
        unmatched_signals=all_unmatched,
        notes=notes,
        ok=True,
    )
