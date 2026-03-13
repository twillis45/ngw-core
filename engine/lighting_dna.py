"""Lighting DNA — fingerprint vectors for lighting setup similarity search.

Each lighting setup (from catalog YAML or extracted from a photo analysis) is
reduced to a fixed-length numeric fingerprint called a "DNA".  Two DNA vectors
can be compared with `compare_lighting_dna()` which returns a 0–100 similarity
score.

The DNA is **not** the analysis itself — it is a compact, comparable summary
that the rule engine and UI use for nearest-neighbour lookup.

Usage:
    from engine.lighting_dna import (
        LightingDNA,
        compare_lighting_dna,
        build_dna_from_catalog,
        build_dna_from_analysis,
        find_closest_setups,
    )
"""
from __future__ import annotations

import logging
import math
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import yaml
from pydantic import BaseModel, ConfigDict, Field

logger = logging.getLogger(__name__)

# ── Catalog path ─────────────────────────────────────────────────────────

CATALOG_DIR = Path(__file__).resolve().parent.parent / "data" / "systems" / "catalog"


# ── DNA Model ────────────────────────────────────────────────────────────

class LightingDNA(BaseModel):
    """Compact numeric fingerprint for a lighting setup."""

    model_config = ConfigDict(extra="forbid")

    # Key light geometry
    key_angle_deg: float = 0.0          # 0–180, angle from camera axis
    key_height_ratio: float = 0.5       # 0.0 (floor) → 1.0 (directly above)

    # Modifier characteristics
    modifier_type: str = "unknown"      # beauty_dish, softbox_octa, stripbox, etc.
    modifier_size: float = 0.5          # 0.0 (bare bulb) → 1.0 (wall-size)

    # Light quality
    shadow_softness: float = 0.5        # 0.0 (razor hard) → 1.0 (fully diffused)
    highlight_specularity: float = 0.5  # 0.0 (matte) → 1.0 (mirror specular)

    # Fill
    fill_ratio: float = 0.0            # 0.0 (no fill) → 1.0 (equal to key)
    negative_fill: bool = False         # v-flat / flag on shadow side

    # Background
    background_gradient: float = 0.0    # 0.0 (even/dark) → 1.0 (strong gradient)

    # Catchlights
    catchlight_shape: str = "unknown"   # round, rectangular, octagonal, strip, mixed

    # Distance & camera
    subject_distance_ft: float = 5.0    # key-to-subject distance in feet
    camera_height: float = 0.5          # 0.0 (low) → 1.0 (high overhead)

    # Metadata (not used in comparison)
    source_id: str = ""                 # catalog system id or "analysis"
    source_name: str = ""               # human-readable name


# ── Comparison ───────────────────────────────────────────────────────────

# Weights for each numeric dimension (higher = more important)
_DIMENSION_WEIGHTS: Dict[str, float] = {
    "key_angle_deg":         1.0,   # normalized 0–1 by /180
    "key_height_ratio":      0.8,
    "modifier_size":         0.9,
    "shadow_softness":       1.0,
    "highlight_specularity": 0.7,
    "fill_ratio":            0.8,
    "negative_fill":         0.4,
    "background_gradient":   0.5,
    "subject_distance_ft":   0.3,   # normalized 0–1 by /20 (cap at 20ft)
    "camera_height":         0.6,
}

# Categorical matching bonuses
_MODIFIER_TYPE_BONUS = 0.10   # bonus when modifier_type matches
_CATCHLIGHT_SHAPE_BONUS = 0.08


def _normalize_angle(deg: float) -> float:
    """Normalize key angle 0-180 → 0.0-1.0."""
    return min(abs(deg), 180.0) / 180.0


def _normalize_distance(ft: float) -> float:
    """Normalize subject distance 0-20ft → 0.0-1.0."""
    return min(max(ft, 0.0), 20.0) / 20.0


def compare_lighting_dna(a: LightingDNA, b: LightingDNA) -> float:
    """Compare two Lighting DNA fingerprints.

    Returns a similarity score 0.0–100.0 where:
    - 100 = identical setups
    - 80+ = very similar (minor angle/distance differences)
    - 50-80 = same family, different execution
    - <50 = substantially different setups

    The comparison uses weighted Euclidean distance on numeric dimensions
    plus categorical bonuses for matching modifier_type and catchlight_shape.
    """
    # Build difference vector
    diffs: Dict[str, float] = {}

    diffs["key_angle_deg"] = abs(
        _normalize_angle(a.key_angle_deg) - _normalize_angle(b.key_angle_deg)
    )
    diffs["key_height_ratio"] = abs(a.key_height_ratio - b.key_height_ratio)
    diffs["modifier_size"] = abs(a.modifier_size - b.modifier_size)
    diffs["shadow_softness"] = abs(a.shadow_softness - b.shadow_softness)
    diffs["highlight_specularity"] = abs(
        a.highlight_specularity - b.highlight_specularity
    )
    diffs["fill_ratio"] = abs(a.fill_ratio - b.fill_ratio)
    diffs["negative_fill"] = 0.0 if a.negative_fill == b.negative_fill else 1.0
    diffs["background_gradient"] = abs(
        a.background_gradient - b.background_gradient
    )
    diffs["subject_distance_ft"] = abs(
        _normalize_distance(a.subject_distance_ft)
        - _normalize_distance(b.subject_distance_ft)
    )
    diffs["camera_height"] = abs(a.camera_height - b.camera_height)

    # Weighted sum of squared differences
    total_weight = 0.0
    weighted_sq_sum = 0.0
    for dim, diff in diffs.items():
        w = _DIMENSION_WEIGHTS.get(dim, 0.5)
        weighted_sq_sum += w * (diff ** 2)
        total_weight += w

    # Normalize → 0.0 (identical) to 1.0 (max different)
    if total_weight > 0:
        distance = math.sqrt(weighted_sq_sum / total_weight)
    else:
        distance = 0.0

    # Categorical bonuses (reduce distance)
    if a.modifier_type != "unknown" and a.modifier_type == b.modifier_type:
        distance = max(0.0, distance - _MODIFIER_TYPE_BONUS)
    if a.catchlight_shape != "unknown" and a.catchlight_shape == b.catchlight_shape:
        distance = max(0.0, distance - _CATCHLIGHT_SHAPE_BONUS)

    # Convert distance → similarity score (0–100)
    similarity = max(0.0, min(100.0, (1.0 - distance) * 100.0))
    return round(similarity, 1)


# ── DNA from catalog YAML ────────────────────────────────────────────────

# Mappings for text → numeric conversions
_HEIGHT_MAP: Dict[str, float] = {
    "floor": 0.0,
    "below face": 0.15,
    "below face level": 0.15,
    "below chin": 0.2,
    "chin level": 0.25,
    "face level": 0.35,
    "eye level": 0.5,
    "eye-level": 0.5,
    "just above eye line": 0.6,
    "above eye line": 0.65,
    "above eye level": 0.65,
    "above head": 0.75,
    "head height": 0.6,
    "head height or slightly above": 0.65,
    "high": 0.8,
    "overhead": 0.9,
    "directly above": 1.0,
}

_MODIFIER_SIZE_MAP: Dict[str, float] = {
    "bare bulb": 0.05,
    "grid": 0.1,
    "snoot": 0.1,
    "reflector": 0.2,
    "beauty dish": 0.35,
    "beauty dish + grid": 0.3,
    "beauty dish (optional sock)": 0.4,
    "small softbox": 0.4,
    "softbox": 0.5,
    "stripbox": 0.35,
    "stripbox + grid": 0.3,
    "umbrella": 0.55,
    "octagonal softbox": 0.6,
    "softbox_octa": 0.6,
    "large softbox": 0.7,
    "diffusion panel": 0.75,
    "scrim": 0.75,
    "large diffusion panel": 0.85,
    "window": 0.8,
    "wall": 0.95,
}

_SHADOW_SOFTNESS_BY_MODIFIER: Dict[str, float] = {
    "bare bulb": 0.05,
    "grid": 0.1,
    "snoot": 0.1,
    "reflector": 0.25,
    "beauty dish": 0.35,
    "beauty dish + grid": 0.3,
    "beauty dish (optional sock)": 0.45,
    "small softbox": 0.5,
    "stripbox": 0.4,
    "stripbox + grid": 0.35,
    "softbox": 0.55,
    "umbrella": 0.6,
    "octagonal softbox": 0.65,
    "large softbox": 0.75,
    "diffusion panel": 0.8,
    "scrim": 0.8,
    "large diffusion panel": 0.9,
    "window": 0.7,
}

_CATCHLIGHT_SHAPE_BY_MODIFIER: Dict[str, str] = {
    "beauty dish": "round",
    "beauty dish + grid": "round",
    "beauty dish (optional sock)": "round",
    "softbox": "rectangular",
    "small softbox": "rectangular",
    "large softbox": "rectangular",
    "stripbox": "strip",
    "stripbox + grid": "strip",
    "octagonal softbox": "octagonal",
    "softbox_octa": "octagonal",
    "umbrella": "round",
    "diffusion panel": "rectangular",
    "large diffusion panel": "rectangular",
    "bare bulb": "round",
    "reflector": "round",
    "window": "rectangular",
}

_MODIFIER_TYPE_MAP: Dict[str, str] = {
    "beauty dish": "beauty_dish",
    "beauty dish + grid": "beauty_dish",
    "beauty dish (optional sock)": "beauty_dish",
    "softbox": "softbox_rect",
    "small softbox": "softbox_rect",
    "large softbox": "softbox_rect",
    "octagonal softbox": "softbox_octa",
    "softbox_octa": "softbox_octa",
    "stripbox": "stripbox",
    "stripbox + grid": "stripbox",
    "umbrella": "umbrella",
    "diffusion panel": "diffusion_panel",
    "large diffusion panel": "diffusion_panel",
    "scrim": "diffusion_panel",
    "bare bulb": "bare_bulb",
    "grid": "grid",
    "snoot": "snoot",
    "reflector": "reflector",
    "window": "window",
}


def _parse_distance_range(dist_str: str) -> float:
    """Parse a distance string like '3–5' or '6-10' into a midpoint float."""
    if not dist_str:
        return 5.0
    # Replace en-dash and em-dash with hyphen
    cleaned = dist_str.replace("–", "-").replace("—", "-").strip().rstrip("ft").strip()
    if "-" in cleaned:
        parts = cleaned.split("-")
        try:
            lo = float(parts[0].strip())
            hi = float(parts[1].strip())
            return (lo + hi) / 2.0
        except (ValueError, IndexError):
            pass
    try:
        return float(cleaned)
    except ValueError:
        return 5.0


def _best_match_key(text: str, mapping: Dict[str, Any]) -> Optional[str]:
    """Find the best matching key in a mapping for a given text (case-insensitive)."""
    text_lower = text.lower().strip()
    # Exact match first
    if text_lower in mapping:
        return text_lower
    # Substring match (longest key first)
    for key in sorted(mapping.keys(), key=len, reverse=True):
        if key in text_lower:
            return key
    return None


def build_dna_from_catalog(catalog_path: str) -> Optional[LightingDNA]:
    """Build a LightingDNA fingerprint from a catalog YAML file.

    Returns None if the file cannot be parsed.
    """
    try:
        path = Path(catalog_path)
        with open(path, encoding="utf-8") as f:
            data = yaml.safe_load(f)

        if not data or not isinstance(data, dict):
            return None

        system_id = data.get("id", path.stem)
        system_name = data.get("name", system_id)
        lights = data.get("lights", [])

        # Find key light
        key_light = None
        fill_light = None
        for light in lights:
            role = light.get("role", "").lower()
            if role == "key":
                key_light = light
            elif role in ("fill", "under", "under-fill"):
                fill_light = light

        if not key_light:
            # Use first light as key
            key_light = lights[0] if lights else {}

        # Key angle
        key_angle = abs(float(key_light.get("angle-deg", 0.0)))

        # Key height
        height_text = str(key_light.get("height", "eye level")).lower()
        height_key = _best_match_key(height_text, _HEIGHT_MAP)
        key_height = _HEIGHT_MAP.get(height_key, 0.5) if height_key else 0.5

        # Modifier
        modifier_text = str(key_light.get("modifier", "unknown")).lower()
        mod_key = _best_match_key(modifier_text, _MODIFIER_SIZE_MAP)
        modifier_size = _MODIFIER_SIZE_MAP.get(mod_key, 0.5) if mod_key else 0.5
        shadow_soft = (
            _SHADOW_SOFTNESS_BY_MODIFIER.get(mod_key, 0.5) if mod_key else 0.5
        )
        catchlight_key = _best_match_key(modifier_text, _CATCHLIGHT_SHAPE_BY_MODIFIER)
        catchlight_shape = (
            _CATCHLIGHT_SHAPE_BY_MODIFIER.get(catchlight_key, "unknown")
            if catchlight_key
            else "unknown"
        )
        mod_type_key = _best_match_key(modifier_text, _MODIFIER_TYPE_MAP)
        modifier_type = (
            _MODIFIER_TYPE_MAP.get(mod_type_key, "unknown")
            if mod_type_key
            else "unknown"
        )

        # Distance
        dist_str = str(key_light.get("distance-ft", "5"))
        subject_distance = _parse_distance_range(dist_str)

        # Fill ratio
        fill_ratio = 0.0
        if fill_light:
            # Rough estimate: fill exists → base 0.3, if closer than key → higher
            fill_dist = _parse_distance_range(
                str(fill_light.get("distance-ft", "5"))
            )
            fill_ratio = min(0.8, max(0.2, subject_distance / max(fill_dist, 0.5) * 0.3))

        # Negative fill
        negative_fill = False
        for light in lights:
            notes = light.get("notes", [])
            if any("neg" in str(n).lower() or "v-flat" in str(n).lower() or "flag" in str(n).lower() for n in notes):
                negative_fill = True
                break

        # Camera height
        camera_data = data.get("diagram-defaults", {}).get("camera", {})
        cam_angle = str(camera_data.get("angle", "eye-level")).lower()
        camera_height_key = _best_match_key(cam_angle, _HEIGHT_MAP)
        camera_height = _HEIGHT_MAP.get(camera_height_key, 0.5) if camera_height_key else 0.5

        # Background gradient — estimate from shadow pattern
        shadow_data = data.get("shadow", {}).get("expected", {})
        pattern = shadow_data.get("pattern", "")
        bg_gradient = 0.1  # most studio setups have minimal gradient
        if pattern in ("split", "rembrandt"):
            bg_gradient = 0.3  # more dramatic setups often have gradient
        elif pattern in ("loop",):
            bg_gradient = 0.2

        # Specularity — estimate from modifier
        specularity = 0.5
        if modifier_type == "beauty_dish":
            specularity = 0.6
        elif modifier_type in ("bare_bulb", "grid", "snoot"):
            specularity = 0.8
        elif modifier_type in ("softbox_rect", "softbox_octa", "diffusion_panel"):
            specularity = 0.3
        elif modifier_type == "umbrella":
            specularity = 0.25

        return LightingDNA(
            key_angle_deg=key_angle,
            key_height_ratio=key_height,
            modifier_type=modifier_type,
            modifier_size=modifier_size,
            shadow_softness=shadow_soft,
            highlight_specularity=specularity,
            fill_ratio=fill_ratio,
            negative_fill=negative_fill,
            background_gradient=bg_gradient,
            catchlight_shape=catchlight_shape,
            subject_distance_ft=subject_distance,
            camera_height=camera_height,
            source_id=system_id,
            source_name=system_name,
        )

    except Exception as exc:
        logger.warning("Failed to build DNA from %s: %s", catalog_path, exc)
        return None


def load_all_catalog_dna() -> List[LightingDNA]:
    """Load DNA fingerprints for all catalog YAML files."""
    if not CATALOG_DIR.exists():
        logger.warning("Catalog directory not found: %s", CATALOG_DIR)
        return []

    results = []
    for yml_path in sorted(CATALOG_DIR.glob("*.yml")):
        dna = build_dna_from_catalog(str(yml_path))
        if dna:
            results.append(dna)

    logger.info("Loaded %d catalog DNA fingerprints", len(results))
    return results


# ── DNA from photo analysis ──────────────────────────────────────────────

def build_dna_from_analysis(
    vlm_signals: Optional[Dict[str, Any]] = None,
    cue_report: Optional[Dict[str, Any]] = None,
    lighting_read: Optional[Dict[str, Any]] = None,
    recreation_setup: Optional[Dict[str, Any]] = None,
) -> LightingDNA:
    """Build a LightingDNA from photo analysis outputs.

    Accepts raw dicts (from .model_dump()) of:
    - vlm_signals: VLMSignals (from VLMDescription.signals)
    - cue_report: VisualCueReport
    - lighting_read: LightingRead
    - recreation_setup: RecreationSetup

    Missing data → defaults are used.
    """
    vlm = vlm_signals or {}
    cues = cue_report or {}
    lr = lighting_read or {}
    rec = recreation_setup or {}

    # Key angle — prefer VLM reconstruction, fall back to recreation setup
    recon = vlm.get("reconstruction") or {}
    key_angle = recon.get("key_light_angle_deg")
    if key_angle is None:
        # Try to parse from recreation_setup.key_placement
        placement = rec.get("key_placement", "")
        if "45" in placement:
            key_angle = 45.0
        elif "90" in placement or "split" in placement.lower():
            key_angle = 90.0
        elif "center" in placement.lower() or "0" in placement:
            key_angle = 0.0
        else:
            key_angle = 30.0  # default moderate angle

    # Key height
    height_str = recon.get("key_light_height") or ""
    vlm_geo = vlm.get("geometry") or {}
    if height_str == "high":
        key_height = 0.75
    elif height_str == "eye_level":
        key_height = 0.5
    elif height_str == "low":
        key_height = 0.25
    elif vlm_geo.get("camera_height_relative_to_eyes") == "above":
        key_height = 0.65
    elif vlm_geo.get("camera_height_relative_to_eyes") == "below":
        key_height = 0.35
    else:
        key_height = 0.5

    # Modifier size
    mod_class = recon.get("modifier_size_class") or ""
    modifier_size_map = {"small": 0.15, "medium": 0.4, "large": 0.7, "very_large": 0.9}
    modifier_size = modifier_size_map.get(mod_class, 0.5)

    # Shadow softness — prefer VLM shadows, fall back to cue report
    shadows = vlm.get("shadows") or {}
    shadow_soft = shadows.get("shadow_softness")
    if shadow_soft is None:
        seh = cues.get("shadow_edge_hardness") or {}
        classification = seh.get("classification", "")
        shadow_soft = {"hard": 0.15, "mixed": 0.5, "soft": 0.8}.get(classification, 0.5)

    # Highlight specularity
    highlights = vlm.get("highlights") or {}
    specularity = highlights.get("highlight_specularity")
    if specularity is None:
        spec_cue = cues.get("specular_highlight_behavior") or {}
        intensity = spec_cue.get("intensity", "")
        specularity = {"low": 0.2, "moderate": 0.5, "high": 0.8}.get(intensity, 0.5)

    # Fill ratio
    fill_present = recon.get("fill_present")
    fill_str = lr.get("fill_presence", "")
    if fill_present is True:
        fill_ratio = {"subtle": 0.2, "moderate": 0.4, "strong": 0.6}.get(fill_str, 0.3)
    elif fill_present is False:
        fill_ratio = 0.0
    else:
        fill_ratio = {"none": 0.0, "subtle": 0.2, "moderate": 0.4, "strong": 0.6}.get(
            fill_str, 0.1
        )

    # Negative fill
    neg_fill = recon.get("negative_fill", False) or False

    # Background gradient
    bg_cue = cues.get("background_illumination") or {}
    bg_pattern = bg_cue.get("pattern", "")
    bg_gradient = {
        "even": 0.1,
        "dark": 0.1,
        "gradient": 0.6,
        "spot": 0.4,
        "environmental": 0.3,
    }.get(bg_pattern, 0.2)

    # Catchlight shape
    catchlights = vlm.get("catchlights") or {}
    catchlight_shape = catchlights.get("catchlight_shape") or "unknown"

    # Modifier type — from recreation_setup.modifier_suggestion
    mod_suggestion = rec.get("modifier_suggestion", "unknown").lower()
    mod_type_key = _best_match_key(mod_suggestion, _MODIFIER_TYPE_MAP)
    modifier_type = (
        _MODIFIER_TYPE_MAP.get(mod_type_key, "unknown")
        if mod_type_key
        else "unknown"
    )

    # Distance — rough estimate from modifier size
    distance_ft = 4.0 + modifier_size * 8.0  # small → ~4ft, large → ~10ft

    # Camera height
    cam_guidance = rec.get("camera_subject_guidance", "")
    if "above" in cam_guidance.lower() or "high" in cam_guidance.lower():
        cam_height = 0.7
    elif "below" in cam_guidance.lower() or "low" in cam_guidance.lower():
        cam_height = 0.3
    else:
        cam_height = 0.5

    return LightingDNA(
        key_angle_deg=key_angle,
        key_height_ratio=key_height,
        modifier_type=modifier_type,
        modifier_size=modifier_size,
        shadow_softness=shadow_soft,
        highlight_specularity=specularity,
        fill_ratio=fill_ratio,
        negative_fill=neg_fill,
        background_gradient=bg_gradient,
        catchlight_shape=catchlight_shape,
        subject_distance_ft=distance_ft,
        camera_height=cam_height,
        source_id="analysis",
        source_name="Photo Analysis",
    )


# ── Similarity search ────────────────────────────────────────────────────

def find_closest_setups(
    query_dna: LightingDNA,
    catalog_dna: Optional[List[LightingDNA]] = None,
    top_n: int = 5,
) -> List[Tuple[LightingDNA, float]]:
    """Find the top-N most similar catalog setups to a query DNA.

    Args:
        query_dna: The DNA to compare against.
        catalog_dna: Pre-loaded catalog DNA list.  If None, loads from disk.
        top_n: Number of results to return (default 5).

    Returns:
        List of (LightingDNA, similarity_score) tuples, sorted by score desc.
    """
    if catalog_dna is None:
        catalog_dna = load_all_catalog_dna()

    scored = []
    for setup_dna in catalog_dna:
        score = compare_lighting_dna(query_dna, setup_dna)
        scored.append((setup_dna, score))

    scored.sort(key=lambda x: x[1], reverse=True)
    return scored[:top_n]
