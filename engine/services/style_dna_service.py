"""Style DNA System — Phase 8 (scaffold).

Analyzes a portfolio of images and extracts the photographer's "style DNA":
the lighting patterns, contrast profiles, modifier preferences, and mood
tendencies that define their visual signature.

Architecture:
  - Accepts a list of AnalysisResult objects (already run through orchestrator).
  - Never re-runs inference — consumes results only.
  - Returns a structured StyleDNA dict suitable for the API response.

Production note: the portfolio loop (running analyze_image on each path) lives
in the API route / CLI layer, not here.  This service receives pre-computed
AnalysisResult objects so it stays testable and side-effect-free.
"""

from __future__ import annotations

import logging
from collections import Counter
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════
# Pattern labels
# ═══════════════════════════════════════════════════════════════════════════

_PATTERN_LABELS: Dict[str, str] = {
    "rembrandt": "Rembrandt",
    "loop": "Loop",
    "butterfly": "Butterfly/Paramount",
    "split": "Split",
    "broad": "Broad",
    "short": "Short",
    "clamshell": "Clamshell",
    "window_portrait": "Window Light",
    "high_key": "High Key",
    "low_key": "Low Key",
    "ring_light": "Ring Light",
    "rim": "Rim / Edge Light",
    "flat": "Flat",
    "projected": "Projected / Interrupted Light",
    "silhouette_key": "Silhouette / Back Key",
    "athletic_rim_sculpt": "Athletic Rim Sculpt",
    "unknown": "Unknown",
}


# ═══════════════════════════════════════════════════════════════════════════
# Signal extraction
# ═══════════════════════════════════════════════════════════════════════════

def _extract_image_signals(ar: Any) -> Optional[Dict[str, Any]]:
    """Extract per-image signals from a single AnalysisResult."""
    if not ar:
        return None

    signals: Dict[str, Any] = {
        "pattern": getattr(ar, "authoritative_pattern", "unknown") or "unknown",
        "modifier": None,
        "key_side": "unknown",
        "light_count": 0,
        "brightness": "normal",
        "contrast_ratio": None,
        "is_bw": False,
        "cct": None,
        "pattern_confidence": 0.5,
        "background_light": False,
        "mood": None,
    }

    li = getattr(ar, "lighting_intel", None)
    if li:
        signals["modifier"] = getattr(li, "modifier_family", None)
        signals["key_side"] = getattr(li, "key_side", "unknown")
        signals["light_count"] = getattr(li, "light_count", 0)
        signals["background_light"] = getattr(li, "background_light_detected", False)
        signals["cct"] = getattr(li, "detected_cct_kelvin", None)
        signals["pattern_confidence"] = getattr(li, "pattern_confidence", 0.5)
        signals["mood"] = getattr(li, "detected_mood", None)

    cl = getattr(ar, "classification", None)
    if cl:
        signals["brightness"] = getattr(cl, "brightness", "normal")

    cr = getattr(ar, "cue_report", None)
    if cr:
        contrast = getattr(cr, "contrast_ratio", None)
        if contrast:
            signals["contrast_ratio"] = getattr(contrast, "ratio", None)
        tone = getattr(cr, "tonal_processing_estimation", None)
        if tone:
            signals["is_bw"] = getattr(tone, "is_bw", False)

    ecf = getattr(ar, "edge_case_flags", None)
    if ecf and isinstance(ecf, dict):
        signals["is_bw"] = ecf.get("bwProcessing", signals["is_bw"])

    return signals


# ═══════════════════════════════════════════════════════════════════════════
# Style DNA computation
# ═══════════════════════════════════════════════════════════════════════════

def _pattern_distribution(all_signals: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Frequency-sorted pattern distribution with percentages."""
    counts: Counter = Counter(s["pattern"] for s in all_signals)
    total = max(1, len(all_signals))
    return [
        {
            "pattern": pat,
            "label": _PATTERN_LABELS.get(pat, pat),
            "count": cnt,
            "pct": round(cnt / total * 100, 1),
        }
        for pat, cnt in counts.most_common()
    ]


def _contrast_profile(all_signals: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Aggregate contrast statistics across portfolio."""
    ratios = [s["contrast_ratio"] for s in all_signals if s["contrast_ratio"] is not None]
    if not ratios:
        return {"available": False}
    avg = sum(ratios) / len(ratios)
    low = sum(1 for r in ratios if r < 3.0)
    mid = sum(1 for r in ratios if 3.0 <= r <= 6.0)
    high = sum(1 for r in ratios if r > 6.0)
    total = len(ratios)

    profile = "flat" if avg < 2.5 else "natural" if avg < 4.5 else "dramatic" if avg < 7.0 else "extreme"
    return {
        "available": True,
        "averageRatio": round(avg, 2),
        "profile": profile,
        "profileLabel": {
            "flat": "Flat (minimal shadows, commercial/beauty)",
            "natural": "Natural (moderate shadows, portrait standard)",
            "dramatic": "Dramatic (strong shadows, editorial/cinematic)",
            "extreme": "Extreme (very deep shadows, fine art/low-key)",
        }.get(profile, profile),
        "distribution": {
            "flat": {"count": low, "pct": round(low / total * 100, 1)},
            "natural": {"count": mid, "pct": round(mid / total * 100, 1)},
            "dramatic": {"count": high, "pct": round(high / total * 100, 1)},
        },
    }


def _modifier_usage(all_signals: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Modifier frequency distribution."""
    counts: Counter = Counter(
        s["modifier"] for s in all_signals if s["modifier"]
    )
    total = max(1, sum(counts.values()))
    return [
        {
            "modifier": mod,
            "count": cnt,
            "pct": round(cnt / total * 100, 1),
        }
        for mod, cnt in counts.most_common()
    ]


def _light_count_profile(all_signals: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Average and distribution of light counts."""
    counts = [s["light_count"] for s in all_signals if s["light_count"] > 0]
    if not counts:
        return {"available": False}
    avg = sum(counts) / len(counts)
    dist: Counter = Counter(counts)
    return {
        "available": True,
        "average": round(avg, 1),
        "distribution": {str(k): v for k, v in sorted(dist.items())},
    }


def _tone_profile(all_signals: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Brightness and B&W usage."""
    total = max(1, len(all_signals))
    brightness_counts: Counter = Counter(s["brightness"] for s in all_signals)
    bw_count = sum(1 for s in all_signals if s["is_bw"])
    return {
        "brightnessDistribution": {
            k: {"count": v, "pct": round(v / total * 100, 1)}
            for k, v in brightness_counts.most_common()
        },
        "bwImages": bw_count,
        "bwPct": round(bw_count / total * 100, 1),
    }


def _key_side_preference(all_signals: List[Dict[str, Any]]) -> Dict[str, Any]:
    known = [s["key_side"] for s in all_signals if s["key_side"] not in ("unknown",)]
    if not known:
        return {"preference": "unknown", "available": False}
    counts: Counter = Counter(known)
    total = len(known)
    dominant = counts.most_common(1)[0][0]
    return {
        "available": True,
        "preference": dominant,
        "distribution": {k: round(v / total * 100, 1) for k, v in counts.items()},
    }


def _generate_suggestions(
    pattern_dist: List[Dict[str, Any]],
    contrast_profile: Dict[str, Any],
    light_count_profile: Dict[str, Any],
    tone_profile: Dict[str, Any],
    total_images: int,
) -> List[str]:
    """Generate improvement suggestions based on portfolio analysis."""
    suggestions: List[str] = []

    # Pattern diversity
    if len(pattern_dist) == 1:
        only = pattern_dist[0]["label"]
        suggestions.append(
            f"Your portfolio uses exclusively {only} lighting. "
            f"Try Loop or Rembrandt for more pattern variety."
        )
    elif pattern_dist and pattern_dist[0]["pct"] > 70:
        dominant = pattern_dist[0]["label"]
        suggestions.append(
            f"{dominant} dominates {pattern_dist[0]['pct']:.0f}% of your work. "
            f"Diversifying patterns can expand your client appeal."
        )

    # Contrast profile
    if contrast_profile.get("available"):
        profile = contrast_profile.get("profile")
        if profile == "flat":
            suggestions.append(
                "Contrast is consistently flat — experiment with 1:4 or 1:8 key-to-fill "
                "ratios for more dimensional portraits."
            )
        elif profile == "extreme":
            suggestions.append(
                "Very high contrast throughout — consider adding subtle fill to "
                "retain shadow detail for client portraits."
            )

    # Light count
    if light_count_profile.get("available"):
        avg = light_count_profile["average"]
        if avg < 1.5:
            suggestions.append(
                "Most setups use a single light. A fill card or second light can "
                "dramatically expand your lighting vocabulary."
            )

    # B&W
    bw_pct = tone_profile.get("bwPct", 0)
    if bw_pct > 80:
        suggestions.append(
            "Over 80% of your portfolio is black and white. "
            "Color work showcases different technical skills and expands commercial opportunities."
        )

    # Portfolio size
    if total_images < 10:
        suggestions.append(
            f"Style DNA is based on {total_images} image(s). "
            "Add more images (20+) for a reliable style profile."
        )

    return suggestions


# ═══════════════════════════════════════════════════════════════════════════
# Main public function
# ═══════════════════════════════════════════════════════════════════════════

def analyze_user_portfolio(
    analysis_results: List[Any],
) -> Dict[str, Any]:
    """Compute Style DNA from a list of AnalysisResult objects.

    Parameters
    ----------
    analysis_results:
        List of AnalysisResult from engine.orchestrator.analyze_image().
        Pass only successfully-analyzed results (ar.ok is True).

    Returns
    -------
    dict — Style DNA report, JSON-serializable.
    """
    try:
        return _analyze_portfolio_inner(analysis_results)
    except Exception:
        logger.exception("Style DNA analysis failed")
        return {
            "error": "Style DNA analysis failed",
            "imageCount": len(analysis_results) if analysis_results else 0,
        }


def _analyze_portfolio_inner(
    analysis_results: List[Any],
) -> Dict[str, Any]:
    all_signals = [
        sig for ar in (analysis_results or [])
        if (sig := _extract_image_signals(ar)) is not None
    ]

    total = len(all_signals)
    if total == 0:
        return {
            "imageCount": 0,
            "error": "No analyzable images in portfolio.",
            "suggestions": ["Upload at least one image to generate a Style DNA profile."],
        }

    pat_dist = _pattern_distribution(all_signals)
    contrast = _contrast_profile(all_signals)
    modifiers = _modifier_usage(all_signals)
    light_counts = _light_count_profile(all_signals)
    tone = _tone_profile(all_signals)
    key_side = _key_side_preference(all_signals)

    suggestions = _generate_suggestions(pat_dist, contrast, light_counts, tone, total)

    # Signature pattern = dominant pattern
    signature = pat_dist[0] if pat_dist else {"pattern": "unknown", "label": "Unknown", "pct": 0}

    return {
        "imageCount": total,
        "signaturePattern": signature,
        "patternDistribution": pat_dist,
        "contrastProfile": contrast,
        "modifierUsage": modifiers,
        "lightCountProfile": light_counts,
        "toneProfile": tone,
        "keySidePreference": key_side,
        "suggestions": suggestions,
    }
