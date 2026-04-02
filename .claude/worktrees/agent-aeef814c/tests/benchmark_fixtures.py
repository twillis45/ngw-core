"""Benchmark fixture definitions for the 5-image lighting pipeline test set.

Provides:
  - SignalSpec / SignalResult / BenchmarkResult / BenchmarkCase dataclasses
  - SignalChecker utility
  - 5 benchmark case factory functions
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


# ── Dataclasses ───────────────────────────────────────────

@dataclass
class SignalSpec:
    """One expected signal to validate in pipeline output."""
    pass_key: str
    field: str
    check_type: str  # exact | range | bool | threshold_min | threshold_max | presence
    expected: Any = None
    min_val: Optional[float] = None
    max_val: Optional[float] = None
    description: str = ""

    def __post_init__(self):
        if not self.description:
            label = f"{self.pass_key}.{self.field}"
            if self.check_type == "exact":
                self.description = f'{label} == {self.expected!r}'
            elif self.check_type == "range":
                self.description = f"{label} in [{self.min_val}, {self.max_val}]"
            elif self.check_type == "bool":
                self.description = f"{label} is {self.expected}"
            elif self.check_type == "threshold_min":
                self.description = f"{label} >= {self.min_val}"
            elif self.check_type == "threshold_max":
                self.description = f"{label} <= {self.max_val}"
            elif self.check_type == "presence":
                self.description = f"{label} is present and truthy"


@dataclass
class SignalResult:
    """Result of checking one signal spec."""
    passed: bool
    actual: Any
    description: str
    check_type: str
    skipped: bool = False
    reason: str = ""


@dataclass
class BenchmarkResult:
    """Aggregate result from checking all signals for one case."""
    total: int = 0
    passed: int = 0
    failed: int = 0
    skipped: int = 0
    details: List[SignalResult] = field(default_factory=list)

    @property
    def all_passed(self) -> bool:
        return self.failed == 0


@dataclass
class BenchmarkCase:
    """Complete benchmark test case definition."""
    test_id: str
    category: str
    description: str
    pass_fixtures: Dict[str, Dict[str, Any]]
    expected_signals: List[SignalSpec]
    expected_failures_to_avoid: List[str]
    expected_archetype: Optional[str]
    notes: str = ""


# ── Signal Checker ────────────────────────────────────────

class SignalChecker:
    """Validate pipeline outputs against expected signal specs."""

    def check_signal(
        self,
        pass_outputs: Dict[str, Dict[str, Any]],
        spec: SignalSpec,
    ) -> SignalResult:
        """Check a single signal spec against pipeline outputs."""
        pass_data = pass_outputs.get(spec.pass_key)
        if pass_data is None:
            return SignalResult(
                passed=False, actual=None, description=spec.description,
                check_type=spec.check_type, skipped=True,
                reason=f"pass_key '{spec.pass_key}' not in outputs",
            )

        if not pass_data.get("ok", True):
            return SignalResult(
                passed=False, actual=None, description=spec.description,
                check_type=spec.check_type, skipped=True,
                reason=f"pass '{spec.pass_key}' has ok=False",
            )

        actual = pass_data.get(spec.field)
        if actual is None and spec.check_type != "presence":
            return SignalResult(
                passed=False, actual=None, description=spec.description,
                check_type=spec.check_type, skipped=True,
                reason=f"field '{spec.field}' not in '{spec.pass_key}'",
            )

        if spec.check_type == "exact":
            passed = str(actual).lower() == str(spec.expected).lower()
        elif spec.check_type == "range":
            try:
                val = float(actual)
                low = spec.min_val if spec.min_val is not None else float("-inf")
                high = spec.max_val if spec.max_val is not None else float("inf")
                passed = low <= val <= high
            except (TypeError, ValueError):
                passed = False
        elif spec.check_type == "bool":
            passed = bool(actual) == bool(spec.expected)
        elif spec.check_type == "threshold_min":
            try:
                passed = float(actual) >= spec.min_val
            except (TypeError, ValueError):
                passed = False
        elif spec.check_type == "threshold_max":
            try:
                passed = float(actual) <= spec.max_val
            except (TypeError, ValueError):
                passed = False
        elif spec.check_type == "presence":
            passed = actual is not None and bool(actual)
        else:
            passed = False

        return SignalResult(
            passed=passed, actual=actual, description=spec.description,
            check_type=spec.check_type,
        )

    def check_all(
        self,
        pass_outputs: Dict[str, Dict[str, Any]],
        specs: List[SignalSpec],
    ) -> BenchmarkResult:
        """Check all signal specs, return aggregate result."""
        result = BenchmarkResult()
        for spec in specs:
            sr = self.check_signal(pass_outputs, spec)
            result.details.append(sr)
            result.total += 1
            if sr.skipped:
                result.skipped += 1
            elif sr.passed:
                result.passed += 1
            else:
                result.failed += 1
        return result


# ── Benchmark Case Definitions ────────────────────────────

def hurley_triangle_continuous_headshot() -> BenchmarkCase:
    """Hurley-style headshot: triangular LED panels, soft continuous light."""
    return BenchmarkCase(
        test_id="hurley_triangle_headshot",
        category="continuous_headshot",
        description=(
            "Peter Hurley-style headshot — 3 continuous LED panels in triangular "
            "arrangement, slightly off-axis, broad wrap, high fill"
        ),
        pass_fixtures={
            "catchlight_topology": {
                "ok": True,
                "cluster_geometry": "triangular",
                "catchlight_count": 3,
                "bilateral_symmetry_score": 0.8,
                "inter_catchlight_spacing": [40.0, 40.0, 40.0],
                "confidence": 0.85,
            },
            "continuous_source": {
                "ok": True,
                "likely_technology": "continuous_led",
                "specular_edge_sharpness": 0.2,
                "color_temp_consistency": 0.92,
                "confidence": 0.8,
            },
            "off_axis_key": {
                "ok": True,
                "key_azimuth_deg": 20.0,
                "key_elevation_deg": 25.0,
                "is_off_axis": True,
                "off_axis_angle_deg": 20.0,
                "detection_method": "combined",
                "confidence": 0.75,
            },
            "highlight_symmetry": {
                "ok": True,
                "symmetry_score": 0.7,
                "dominant_side": "left",
                "fill_detected": True,
                "underfill_ev": 0.8,
                "left_intensity": 0.75,
                "right_intensity": 0.65,
                "intensity_ratio": 1.15,
                "confidence": 0.8,
            },
            "highlight_axis_map": {
                "ok": True,
                "axis_count": 1,
                "wrap_ratio": 0.75,
                "axis_consistency": 0.85,
                "dominant_axis_deg": 15.0,
                "confidence": 0.8,
            },
            "light_structure": {
                "ok": True,
                "pattern_name": "loop",
                "nose_shadow_shape": "loop",
                "triangle_detected": False,
                "nose_shadow_length_ratio": 0.3,
                "confidence": 0.7,
            },
            "bounce_contributor": {
                "ok": True,
                "primary_fill_type": "reflector",
                "fill_to_key_ratio": 0.6,
                "total_bounce_contribution": 0.25,
                "confidence": 0.65,
            },
            "separation_light": {
                "ok": True,
                "has_hair_light": False,
                "has_rim_light": False,
                "has_background_spill": False,
                "spill_vs_intentional_confidence": 0.5,
                "confidence": 0.6,
            },
            # Solver-compatible pass outputs
            "shadow_pass": {
                "ok": True,
                "shadow_vector_deg": 200.0,
                "shadow_vertical_angle_deg": 35.0,
                "confidence": 0.6,
            },
            "catchlight_pass": {
                "ok": True,
                "primary_clock_position": 10,
                "catchlight_count": 3,
                "confidence": 0.7,
            },
        },
        expected_signals=[
            SignalSpec("catchlight_topology", "cluster_geometry", "exact",
                       expected="triangular",
                       description="Hurley triangular catchlight cluster"),
            SignalSpec("continuous_source", "likely_technology", "exact",
                       expected="continuous_led",
                       description="Continuous LED technology detected"),
            SignalSpec("off_axis_key", "off_axis_angle_deg", "range",
                       min_val=15.0, max_val=25.0,
                       description="Off-axis angle in Hurley range (15-25°)"),
            SignalSpec("highlight_symmetry", "symmetry_score", "threshold_min",
                       min_val=0.5,
                       description="Moderate-to-high bilateral symmetry"),
            SignalSpec("highlight_axis_map", "wrap_ratio", "threshold_min",
                       min_val=0.6,
                       description="Broad wrap ratio (Hurley signature)"),
        ],
        expected_failures_to_avoid=["caravaggio", "penn", "karsh"],
        expected_archetype="hurley",
        notes="Tests triangular catchlight detection and continuous LED inference",
    )


def clean_clamshell_beauty() -> BenchmarkCase:
    """Clamshell beauty: beauty dish above + fill below, butterfly pattern."""
    return BenchmarkCase(
        test_id="clean_clamshell_beauty",
        category="beauty_portrait",
        description=(
            "Clean clamshell beauty portrait — beauty dish overhead + fill "
            "below, near-perfect bilateral symmetry, butterfly/paramount pattern"
        ),
        pass_fixtures={
            "catchlight_topology": {
                "ok": True,
                "cluster_geometry": "dual",
                "catchlight_count": 2,
                "bilateral_symmetry_score": 0.95,
                "inter_catchlight_spacing": [180.0],
                "confidence": 0.9,
            },
            "continuous_source": {
                "ok": True,
                "likely_technology": "strobe",
                "specular_edge_sharpness": 0.5,
                "color_temp_consistency": 0.95,
                "confidence": 0.75,
            },
            "off_axis_key": {
                "ok": True,
                "key_azimuth_deg": 5.0,
                "key_elevation_deg": 45.0,
                "is_off_axis": False,
                "off_axis_angle_deg": 5.0,
                "detection_method": "shadow",
                "confidence": 0.8,
            },
            "highlight_symmetry": {
                "ok": True,
                "symmetry_score": 0.92,
                "dominant_side": "center",
                "fill_detected": True,
                "underfill_ev": 0.5,
                "left_intensity": 0.8,
                "right_intensity": 0.78,
                "intensity_ratio": 1.03,
                "confidence": 0.9,
            },
            "highlight_axis_map": {
                "ok": True,
                "axis_count": 1,
                "wrap_ratio": 0.65,
                "axis_consistency": 0.92,
                "dominant_axis_deg": 0.0,
                "confidence": 0.85,
            },
            "light_structure": {
                "ok": True,
                "pattern_name": "butterfly",
                "nose_shadow_shape": "butterfly",
                "triangle_detected": False,
                "nose_shadow_length_ratio": 0.15,
                "confidence": 0.85,
            },
            "bounce_contributor": {
                "ok": True,
                "primary_fill_type": "fill_below",
                "fill_to_key_ratio": 0.8,
                "total_bounce_contribution": 0.35,
                "confidence": 0.75,
            },
            "separation_light": {
                "ok": True,
                "has_hair_light": False,
                "has_rim_light": False,
                "has_background_spill": False,
                "spill_vs_intentional_confidence": 0.5,
                "confidence": 0.6,
            },
            # Solver-compatible
            "shadow_pass": {
                "ok": True,
                "shadow_vector_deg": 180.0,
                "shadow_vertical_angle_deg": 50.0,
                "confidence": 0.8,
            },
            "catchlight_pass": {
                "ok": True,
                "primary_clock_position": 12,
                "catchlight_count": 2,
                "confidence": 0.85,
            },
        },
        expected_signals=[
            SignalSpec("catchlight_topology", "cluster_geometry", "exact",
                       expected="dual",
                       description="Dual vertical catchlights (clamshell)"),
            SignalSpec("highlight_symmetry", "symmetry_score", "threshold_min",
                       min_val=0.85,
                       description="Near-perfect bilateral symmetry"),
            SignalSpec("light_structure", "pattern_name", "exact",
                       expected="butterfly",
                       description="Butterfly/paramount pattern from overhead key"),
            SignalSpec("highlight_symmetry", "fill_detected", "bool",
                       expected=True,
                       description="Fill light detected (from below)"),
            SignalSpec("off_axis_key", "is_off_axis", "bool",
                       expected=False,
                       description="Key is on-axis (directly overhead)"),
        ],
        expected_failures_to_avoid=["caravaggio", "karsh"],
        expected_archetype="adler",
        notes="Tests dual catchlight + bilateral symmetry + butterfly pattern",
    )


def karsh_rembrandt_dramatic() -> BenchmarkCase:
    """Karsh-style dramatic portrait: single key, Rembrandt triangle, hair light."""
    return BenchmarkCase(
        test_id="karsh_rembrandt_dramatic",
        category="dramatic_portrait",
        description=(
            "Classic Karsh/Rembrandt dramatic portrait — single powerful key "
            "light 40° off-axis, Rembrandt triangle, deep shadows, hair light"
        ),
        pass_fixtures={
            "catchlight_topology": {
                "ok": True,
                "cluster_geometry": "single",
                "catchlight_count": 1,
                "bilateral_symmetry_score": 0.1,
                "confidence": 0.8,
            },
            "continuous_source": {
                "ok": True,
                "likely_technology": "strobe",
                "specular_edge_sharpness": 0.65,
                "color_temp_consistency": 0.9,
                "confidence": 0.7,
            },
            "off_axis_key": {
                "ok": True,
                "key_azimuth_deg": 40.0,
                "key_elevation_deg": 35.0,
                "is_off_axis": True,
                "off_axis_angle_deg": 40.0,
                "detection_method": "combined",
                "confidence": 0.85,
            },
            "highlight_symmetry": {
                "ok": True,
                "symmetry_score": 0.15,
                "dominant_side": "left",
                "fill_detected": False,
                "underfill_ev": 3.0,
                "left_intensity": 0.85,
                "right_intensity": 0.2,
                "intensity_ratio": 4.25,
                "confidence": 0.9,
            },
            "highlight_axis_map": {
                "ok": True,
                "axis_count": 1,
                "wrap_ratio": 0.3,
                "axis_consistency": 0.9,
                "dominant_axis_deg": 40.0,
                "confidence": 0.85,
            },
            "light_structure": {
                "ok": True,
                "pattern_name": "rembrandt",
                "nose_shadow_shape": "triangle",
                "triangle_detected": True,
                "triangle_cheek": "right",
                "triangle_completeness": 0.85,
                "nose_shadow_length_ratio": 0.6,
                "confidence": 0.9,
            },
            "bounce_contributor": {
                "ok": True,
                "primary_fill_type": "none",
                "fill_to_key_ratio": 0.0,
                "total_bounce_contribution": 0.05,
                "confidence": 0.7,
            },
            "separation_light": {
                "ok": True,
                "has_hair_light": True,
                "hair_light_direction_deg": 135.0,
                "hair_light_intensity": 0.6,
                "has_rim_light": False,
                "has_background_spill": False,
                "spill_vs_intentional_confidence": 0.85,
                "confidence": 0.8,
            },
            # Solver-compatible
            # Clock 10 → -60° (300° canonical). Shadow falls opposite key:
            # shadow_vector_deg + 180 should ≈ 300°, so shadow ≈ 120°
            "shadow_pass": {
                "ok": True,
                "shadow_vector_deg": 120.0,
                "shadow_vertical_angle_deg": 30.0,
                "confidence": 0.85,
            },
            "catchlight_pass": {
                "ok": True,
                "primary_clock_position": 10,
                "catchlight_count": 1,
                "confidence": 0.8,
            },
        },
        expected_signals=[
            SignalSpec("light_structure", "pattern_name", "exact",
                       expected="rembrandt",
                       description="Rembrandt lighting pattern"),
            SignalSpec("light_structure", "triangle_detected", "bool",
                       expected=True,
                       description="Rembrandt triangle on shadow cheek"),
            SignalSpec("highlight_symmetry", "symmetry_score", "threshold_max",
                       max_val=0.35,
                       description="Strong asymmetry (dramatic single key)"),
            SignalSpec("separation_light", "has_hair_light", "bool",
                       expected=True,
                       description="Intentional hair light present"),
            SignalSpec("off_axis_key", "off_axis_angle_deg", "range",
                       min_val=30.0, max_val=50.0,
                       description="Key angle in Karsh range (30-50°)"),
            SignalSpec("highlight_symmetry", "underfill_ev", "threshold_min",
                       min_val=2.0,
                       description="Deep underfill (≥2 EV)"),
        ],
        expected_failures_to_avoid=["hurley", "adler", "bryce"],
        expected_archetype="karsh",
        notes="Tests Rembrandt triangle detection, deep shadow, hair light differentiation",
    )


def soft_window_negative_fill() -> BenchmarkCase:
    """Window light portrait: natural directional source, v-flat negative fill."""
    return BenchmarkCase(
        test_id="soft_window_negative_fill",
        category="natural_portrait",
        description=(
            "Soft window portrait with negative fill — single directional "
            "natural/continuous source, v-flat on fill side absorbing bounce"
        ),
        pass_fixtures={
            "catchlight_topology": {
                "ok": True,
                "cluster_geometry": "unknown",
                "catchlight_count": 0,
                "bilateral_symmetry_score": 0.0,
                "confidence": 0.3,
            },
            "continuous_source": {
                "ok": True,
                "likely_technology": "continuous_panel",
                "specular_edge_sharpness": 0.15,
                "color_temp_consistency": 0.85,
                "confidence": 0.65,
            },
            "off_axis_key": {
                "ok": True,
                "key_azimuth_deg": 75.0,
                "key_elevation_deg": 30.0,
                "is_off_axis": True,
                "off_axis_angle_deg": 75.0,
                "detection_method": "shadow",
                "confidence": 0.7,
            },
            "highlight_symmetry": {
                "ok": True,
                "symmetry_score": 0.25,
                "dominant_side": "left",
                "fill_detected": False,
                "underfill_ev": 1.8,
                "left_intensity": 0.7,
                "right_intensity": 0.2,
                "intensity_ratio": 3.5,
                "confidence": 0.8,
            },
            "highlight_axis_map": {
                "ok": True,
                "axis_count": 1,
                "wrap_ratio": 0.45,
                "axis_consistency": 0.9,
                "dominant_axis_deg": 270.0,
                "confidence": 0.8,
            },
            "light_structure": {
                "ok": True,
                "pattern_name": "loop",
                "nose_shadow_shape": "loop",
                "triangle_detected": False,
                "nose_shadow_length_ratio": 0.4,
                "confidence": 0.65,
            },
            "bounce_contributor": {
                "ok": True,
                "primary_fill_type": "negative_fill",
                "fill_to_key_ratio": 0.0,
                "total_bounce_contribution": 0.02,
                "confidence": 0.6,
            },
            "separation_light": {
                "ok": True,
                "has_hair_light": False,
                "has_rim_light": False,
                "has_background_spill": True,
                "spill_vs_intentional_confidence": 0.2,
                "confidence": 0.55,
            },
            # Solver-compatible
            "shadow_pass": {
                "ok": True,
                "shadow_vector_deg": 90.0,
                "shadow_vertical_angle_deg": 25.0,
                "confidence": 0.7,
            },
            "catchlight_pass": {
                "ok": True,
                "primary_clock_position": 9,
                "catchlight_count": 0,
                "confidence": 0.3,
            },
            "environment_light_pass": {
                "ok": True,
                "environment_type": "window",
                "confidence": 0.7,
            },
        },
        expected_signals=[
            SignalSpec("highlight_axis_map", "axis_count", "exact",
                       expected=1,
                       description="Single dominant light axis (window)"),
            SignalSpec("continuous_source", "likely_technology", "exact",
                       expected="continuous_panel",
                       description="Continuous/natural source detected"),
            SignalSpec("bounce_contributor", "primary_fill_type", "exact",
                       expected="negative_fill",
                       description="Negative fill (v-flat) identified"),
            SignalSpec("highlight_symmetry", "fill_detected", "bool",
                       expected=False,
                       description="No positive fill detected"),
            SignalSpec("highlight_symmetry", "symmetry_score", "threshold_max",
                       max_val=0.4,
                       description="Asymmetric (window + negative fill)"),
        ],
        expected_failures_to_avoid=["hurley", "adler", "penn"],
        expected_archetype=None,
        notes=(
            "Tests window light detection, negative fill classification, and "
            "correct behavior when no archetype matches strongly"
        ),
    )


def reflective_fashion_specular() -> BenchmarkCase:
    """Fashion with reflective wardrobe: strip lights, multi-axis, strobes."""
    return BenchmarkCase(
        test_id="reflective_fashion_specular",
        category="fashion_editorial",
        description=(
            "Reflective wardrobe / shiny fashion image — strip softboxes "
            "creating linear catchlights, multiple light axes, harsh strobe"
        ),
        pass_fixtures={
            "catchlight_topology": {
                "ok": True,
                "cluster_geometry": "strip",
                "catchlight_count": 4,
                "bilateral_symmetry_score": 0.3,
                "inter_catchlight_spacing": [30.0, 25.0, 35.0],
                "confidence": 0.8,
            },
            "continuous_source": {
                "ok": True,
                "likely_technology": "strobe",
                "specular_edge_sharpness": 0.85,
                "color_temp_consistency": 0.95,
                "confidence": 0.8,
            },
            "off_axis_key": {
                "ok": True,
                "key_azimuth_deg": 45.0,
                "key_elevation_deg": 25.0,
                "is_off_axis": True,
                "off_axis_angle_deg": 45.0,
                "detection_method": "highlight",
                "confidence": 0.7,
            },
            "highlight_symmetry": {
                "ok": True,
                "symmetry_score": 0.25,
                "dominant_side": "left",
                "fill_detected": False,
                "underfill_ev": 2.0,
                "left_intensity": 0.8,
                "right_intensity": 0.35,
                "intensity_ratio": 2.29,
                "confidence": 0.75,
            },
            "highlight_axis_map": {
                "ok": True,
                "axis_count": 2,
                "wrap_ratio": 0.3,
                "axis_consistency": 0.4,
                "dominant_axis_deg": 45.0,
                "confidence": 0.7,
            },
            "light_structure": {
                "ok": True,
                "pattern_name": "split",
                "nose_shadow_shape": "split",
                "triangle_detected": False,
                "nose_shadow_length_ratio": 0.5,
                "confidence": 0.6,
            },
            "bounce_contributor": {
                "ok": True,
                "primary_fill_type": "v_flat",
                "fill_to_key_ratio": 0.1,
                "total_bounce_contribution": 0.08,
                "confidence": 0.55,
            },
            "separation_light": {
                "ok": True,
                "has_hair_light": True,
                "hair_light_direction_deg": 160.0,
                "hair_light_intensity": 0.5,
                "has_rim_light": False,
                "has_background_spill": False,
                "spill_vs_intentional_confidence": 0.8,
                "confidence": 0.75,
            },
            # Solver-compatible
            # Clock 10 → -60° (300° canonical). Shadow falls opposite key:
            # shadow_vector_deg + 180 should ≈ 300°, so shadow ≈ 125°
            "shadow_pass": {
                "ok": True,
                "shadow_vector_deg": 125.0,
                "shadow_vertical_angle_deg": 20.0,
                "confidence": 0.65,
            },
            "catchlight_pass": {
                "ok": True,
                "primary_clock_position": 10,
                "catchlight_count": 4,
                "confidence": 0.75,
            },
        },
        expected_signals=[
            SignalSpec("catchlight_topology", "cluster_geometry", "exact",
                       expected="strip",
                       description="Strip/linear catchlight pattern"),
            SignalSpec("highlight_axis_map", "axis_count", "threshold_min",
                       min_val=2,
                       description="Multi-axis highlights (multiple lights)"),
            SignalSpec("continuous_source", "likely_technology", "exact",
                       expected="strobe",
                       description="Strobe technology detected"),
            SignalSpec("continuous_source", "specular_edge_sharpness", "threshold_min",
                       min_val=0.7,
                       description="High specular edge sharpness (strobe)"),
        ],
        expected_failures_to_avoid=["hurley", "bryce"],
        expected_archetype="penn",
        notes="Tests strip catchlight detection, multi-axis analysis, specular edge sharpness",
    )


# ── Case Registry ─────────────────────────────────────────

ALL_BENCHMARK_CASES = {
    "hurley_triangle_headshot": hurley_triangle_continuous_headshot,
    "clean_clamshell_beauty": clean_clamshell_beauty,
    "karsh_rembrandt_dramatic": karsh_rembrandt_dramatic,
    "soft_window_negative_fill": soft_window_negative_fill,
    "reflective_fashion_specular": reflective_fashion_specular,
}


def load_all_cases() -> Dict[str, BenchmarkCase]:
    """Load all benchmark cases."""
    return {k: fn() for k, fn in ALL_BENCHMARK_CASES.items()}
