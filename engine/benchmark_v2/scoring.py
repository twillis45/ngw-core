"""
Benchmark System v2 — Scoring Engine.

Four dimensions, each in [0.0, 1.0]:
  1. Pattern accuracy   weight=0.30  binary: correct pattern or not
  2. Blueprint score    weight=0.30  weighted comparison of key/fill specs
  3. Fix effectiveness  weight=0.20  historical fix success rate for pattern
  4. Confidence score   weight=0.20  calibration: predicted conf vs actual outcome

Final score = weighted sum. All helpers are pure functions with no side effects.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

# ── Weights ───────────────────────────────────────────────────────────────────

SCORE_WEIGHTS = {"pattern": 0.30, "blueprint": 0.30, "fix": 0.20, "confidence": 0.20}

BLUEPRINT_WEIGHTS = {"position": 0.30, "modifier": 0.25, "power": 0.25, "roles": 0.20}

# ── Normalisation alias maps ──────────────────────────────────────────────────

_POSITION_ALIASES: Dict[str, str] = {
    "45-degree": "45", "45degree": "45", "45_degree": "45",
    "front": "frontal", "direct": "frontal", "flat": "frontal",
    "side": "90", "sidelit": "90",
    "rear": "back", "behind": "back",
    "top": "top", "overhead": "top", "high": "top",
    "low": "bottom",
    "broad": "broad", "short": "short", "split": "split",
    "loop": "loop", "rembrandt": "rembrandt",
    "butterfly": "butterfly", "clamshell": "butterfly",
}

_MODIFIER_ALIASES: Dict[str, str] = {
    "softbox": "softbox", "soft_box": "softbox",
    "strip": "softbox", "stripbox": "softbox",
    "octa": "octa", "octabox": "octa", "octagonal": "octa",
    "umbrella": "umbrella", "shoot_through": "umbrella", "reflected": "umbrella",
    "beauty_dish": "beauty_dish", "beauty": "beauty_dish",
    "bare": "bare", "unmodified": "bare",
    "grid": "grid", "honeycomb": "grid",
    "reflector": "reflector", "panel": "reflector", "scrim": "reflector",
    "fresnel": "fresnel",
    "spot": "spot", "snoot": "spot",
    "ring": "ring", "ring_flash": "ring",
    "parabolic": "parabolic", "para": "parabolic",
}

_LIGHT_ROLES = ("key", "fill", "rim", "hair", "kicker", "background", "accent")


# ── 1. Pattern Accuracy ───────────────────────────────────────────────────────

def score_pattern(
    expected: str,
    predicted: Optional[str],
    acceptable_patterns: Optional[List] = None,
) -> float:
    """Match score: 1.0 if predicted matches expected or any acceptable alternate.

    acceptable_patterns — list of pattern IDs that are considered correct for
    this case (e.g. visually ambiguous pairs like clamshell/butterfly).
    Any match within the acceptable set scores 1.0 (full credit).
    """
    if not predicted:
        return 0.0
    _n = lambda s: s.lower().replace("-", "_").replace(" ", "_").strip()
    norm_pred = _n(predicted)
    if _n(expected) == norm_pred:
        return 1.0
    if acceptable_patterns:
        if any(_n(a) == norm_pred for a in acceptable_patterns):
            return 1.0
    return 0.0


# ── 2. Blueprint Score ────────────────────────────────────────────────────────

def score_blueprint(expected: Dict[str, Any], predicted: Dict[str, Any]) -> float:
    """Weighted comparison across key position, modifier, fill power, and roles."""
    pos  = _compare_position(_get(expected, "key.position"), _get(predicted, "key.position"))
    mod  = _compare_modifier(_get(expected, "key.modifier"), _get(predicted, "key.modifier"))
    pwr  = _compare_power_ratio(_get(expected, "fill.ratio"), _get(predicted, "fill.ratio"))
    role = _compare_roles(expected, predicted)
    return (
        BLUEPRINT_WEIGHTS["position"] * pos
        + BLUEPRINT_WEIGHTS["modifier"] * mod
        + BLUEPRINT_WEIGHTS["power"]    * pwr
        + BLUEPRINT_WEIGHTS["roles"]    * role
    )


def _get(d: Dict[str, Any], path: str) -> Optional[Any]:
    for p in path.split("."):
        if not isinstance(d, dict):
            return None
        d = d.get(p)  # type: ignore[assignment]
    return d


def _norm(s: Optional[str], aliases: Dict[str, str]) -> str:
    if not s:
        return "__none__"
    key = str(s).lower().replace("-", "_").replace(" ", "_").strip()
    return aliases.get(key, key)


def _compare_position(exp: Optional[str], pred: Optional[str]) -> float:
    if not exp and not pred:
        return 1.0
    if not exp or not pred:
        return 0.0
    ne, np_ = _norm(exp, _POSITION_ALIASES), _norm(pred, _POSITION_ALIASES)
    if ne == np_:
        return 1.0
    if ne in np_ or np_ in ne:
        return 0.5
    return 0.0


def _compare_modifier(exp: Optional[str], pred: Optional[str]) -> float:
    if not exp and not pred:
        return 1.0
    if not exp or not pred:
        return 0.3  # partial credit — unknown modifier
    return 1.0 if _norm(exp, _MODIFIER_ALIASES) == _norm(pred, _MODIFIER_ALIASES) else 0.0


def _compare_power_ratio(exp: Optional[str], pred: Optional[str]) -> float:
    """Compare fill ratios like '2:1', '4:1'. Graded by relative error."""
    if not exp and not pred:
        return 1.0  # both absent: no disagreement
    if not exp or not pred:
        return 0.5  # one side absent: neutral

    def _parse(s: str) -> Optional[float]:
        try:
            parts = str(s).replace(" ", "").split(":")
            return float(parts[0]) / float(parts[1]) if len(parts) == 2 else float(parts[0])
        except Exception:
            return None

    ev, pv = _parse(exp), _parse(pred)
    if ev is None or pv is None:
        return 0.5
    if ev == 0:
        return 0.5
    delta = abs(ev - pv) / ev
    if delta == 0.0:    return 1.0
    if delta <= 0.25:   return 0.75
    if delta <= 0.50:   return 0.40
    return 0.0


def _compare_roles(expected: Dict[str, Any], predicted: Dict[str, Any]) -> float:
    """Fraction of expected light roles present in prediction."""
    exp_roles  = {r for r in _LIGHT_ROLES if expected.get(r)}
    pred_roles = {r for r in _LIGHT_ROLES if predicted.get(r)}
    if not exp_roles:
        return 1.0
    return len(exp_roles & pred_roles) / len(exp_roles)


# ── 3. Fix Effectiveness ──────────────────────────────────────────────────────

def score_fix_effectiveness(pattern_id: str, fix_rates: Dict[str, float]) -> float:
    """Historical fix success rate for pattern. Defaults to 0.5 when no data."""
    rate = fix_rates.get(pattern_id)
    if rate is None:
        return 0.5
    return max(0.0, min(1.0, float(rate)))


# ── 4. Confidence Calibration ─────────────────────────────────────────────────

def score_confidence(
    predicted_confidence: Optional[float],
    actual_success_rate: Optional[float],
) -> Tuple[float, float]:
    """
    Returns (confidence_score, confidence_error).
    confidence_score = 1 - |error|     clamped to [0, 1]
    confidence_error = predicted - actual  (signed)
    """
    if predicted_confidence is None or actual_success_rate is None:
        return 0.5, 0.0
    error = float(predicted_confidence) - float(actual_success_rate)
    score = max(0.0, 1.0 - abs(error))
    return score, error


# ── 5. Final Score ────────────────────────────────────────────────────────────

def compute_final_score(
    pattern_score: float,
    blueprint_score: float,
    fix_score: float,
    confidence_score: float,
) -> float:
    raw = (
        SCORE_WEIGHTS["pattern"]    * pattern_score
        + SCORE_WEIGHTS["blueprint"]  * blueprint_score
        + SCORE_WEIGHTS["fix"]        * fix_score
        + SCORE_WEIGHTS["confidence"] * confidence_score
    )
    # Round to 6 decimal places to eliminate IEEE 754 sub-precision noise
    # (e.g. 0.30*1.0 + 0.30*1.0 + 0.20*0.5 + 0.20*0.5 = 0.7999999999999999 in Python)
    return round(raw, 6)


# ── Orchestrator Output Extractors ────────────────────────────────────────────

def extract_predicted_pattern(analysis: Dict[str, Any]) -> Optional[str]:
    """Extract the authoritative predicted pattern from pipeline output."""
    # Try multiple field paths — handle different pipeline versions
    paths = [
        # Top-level authoritative_pattern (set by priority resolver — most reliable)
        "authoritative_pattern",
        # Nested paths for older/alternative serialisation shapes
        "reference_analysis.authoritative_pattern",
        "reference_analysis.pattern",
        "classification.archetype",
        "classification.pattern",
        "lighting_intel.pattern",
        "lighting_inference.pattern",
    ]
    for path in paths:
        val = _get(analysis, path)
        if val and isinstance(val, str) and val.lower() not in ("unknown", "none", ""):
            return val
    # Last-resort: accept 'unknown' rather than None so callers can distinguish
    # "pipeline ran but couldn't classify" from "extraction failed entirely"
    for path in ("authoritative_pattern", "lighting_intel.pattern"):
        val = _get(analysis, path)
        if val and isinstance(val, str):
            return val
    return None


def extract_predicted_blueprint(analysis: Dict[str, Any]) -> Dict[str, Any]:
    """Build a structured blueprint dict from pipeline output."""
    blueprint: Dict[str, Any] = {}

    key_pos = (
        _get(analysis, "vlm_reconstruction.key_light.position")
        or _get(analysis, "lighting_intel.key_direction")
        or _get(analysis, "lighting_inference.key_direction")
        or _get(analysis, "cv.key_direction")
    )
    key_mod = (
        _get(analysis, "vlm_reconstruction.key_light.modifier")
        or _get(analysis, "lighting_intel.modifier_type")
        or _get(analysis, "lighting_inference.modifier_type")
        or _get(analysis, "cv.modifier_type")
    )
    fill_ratio = (
        _get(analysis, "vlm_reconstruction.fill_ratio")
        or _get(analysis, "lighting_intel.fill_ratio")
        or _get(analysis, "solver.fill_ratio")
        or _get(analysis, "solver_result.fill_ratio")
    )

    blueprint["key"]  = {"position": key_pos, "modifier": key_mod}
    blueprint["fill"] = {"ratio": fill_ratio}

    # Detect additional light roles
    for role in ("fill", "rim", "hair", "kicker", "background", "accent"):
        present = (
            _get(analysis, f"vlm_reconstruction.{role}_light")
            or _get(analysis, f"lighting_intel.{role}_light_present")
            or _get(analysis, f"solver.{role}_present")
            or _get(analysis, f"solver_result.{role}_present")
        )
        if present:
            blueprint[role] = present

    return blueprint


def extract_predicted_confidence(analysis: Dict[str, Any]) -> Optional[float]:
    """Extract overall confidence from pipeline output."""
    paths = [
        "reference_analysis.confidence",
        "classification.confidence",
        "solver.confidence",
        "solver_result.confidence",
        "lighting_intel.confidence",
    ]
    for path in paths:
        val = _get(analysis, path)
        if val is not None:
            try:
                return float(val)
            except Exception:
                continue
    return None
