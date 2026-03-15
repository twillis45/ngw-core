"""Shared enum module for the NGW lighting intelligence system.

Every categorical value across the engine, dataset, LAB, API, and benchmark
system flows through this module.  This eliminates stringly-typed constants
scattered across files and guarantees:

    1.  Internal values use machine-safe snake_case strings.
    2.  Every enum exposes a human-readable ``.label`` property.
    3.  Dataset records store enum *values*, not labels.
    4.  APIs may return both ``value`` and ``label`` where useful.
    5.  ``unknown`` / ``none`` / ``pending`` states use explicit enum values.

Usage::

    from engine.enums import LightRole, LightingPattern

    role = LightRole.KEY
    role.value   # "key"
    role.label   # "Key"

All enums inherit from ``str`` so they are directly JSON-serializable and
can be compared against plain strings for backward compatibility::

    LightRole.KEY == "key"   # True
"""

from __future__ import annotations

from enum import Enum
from typing import Dict

# Module-level registry: maps (EnumClassName, value) → custom label.
# Populated by _register_labels() calls after each enum class definition.
_LABEL_REGISTRY: Dict[str, Dict[str, str]] = {}


def _register_labels(enum_class: type, labels: Dict[str, str]) -> None:
    """Register custom labels for an enum class."""
    _LABEL_REGISTRY[enum_class.__name__] = labels


# ═══════════════════════════════════════════════════════════════════════════
# Base mixin
# ═══════════════════════════════════════════════════════════════════════════

class _LabelMixin:
    """Provides a ``label`` property that converts snake_case to Title Case."""

    @property
    def label(self) -> str:
        custom_map = _LABEL_REGISTRY.get(type(self).__name__, {})
        custom = custom_map.get(self.value)
        if custom:
            return custom
        return self.value.replace("_", " ").title()


# ═══════════════════════════════════════════════════════════════════════════
# 1. Lighting Roles
# ═══════════════════════════════════════════════════════════════════════════

class LightRole(_LabelMixin, str, Enum):
    KEY = "key"
    FILL = "fill"
    NEGATIVE_FILL = "negative_fill"
    RIM = "rim"
    KICKER = "kicker"
    BACKGROUND = "background"
    BOUNCE = "bounce"
    HAIR_LIGHT = "hair_light"
    UNKNOWN_SECONDARY = "unknown_secondary"
    UNKNOWN = "unknown"


_register_labels(LightRole, {
"negative_fill": "Negative Fill",
"hair_light": "Hair Light",
"unknown_secondary": "Unknown Secondary",
})

# ═══════════════════════════════════════════════════════════════════════════
# 2. Lighting Patterns
# ═══════════════════════════════════════════════════════════════════════════

class LightingPattern(_LabelMixin, str, Enum):
    CLAMSHELL = "clamshell"
    LOOP = "loop"
    REMBRANDT = "rembrandt"
    SPLIT = "split"
    BUTTERFLY = "butterfly"
    BROAD = "broad"
    SHORT = "short"
    RIM_ONLY = "rim_only"
    HIGH_KEY = "high_key"
    LOW_KEY = "low_key"
    FLAT_FASHION = "flat_fashion"
    WINDOW_PORTRAIT = "window_portrait"
    GOLDEN_HOUR = "golden_hour"
    OVERCAST_NATURAL = "overcast_natural"
    RING_LIGHT = "ring_light"
    BARE_BULB_EDITORIAL = "bare_bulb_editorial"
    STRIP_DRAMATIC = "strip_dramatic"
    SHORT_FASHION_KEY = "short_fashion_key"
    SOFT_EDITORIAL_KEY = "soft_editorial_key"
    EDITORIAL_RIM_KEY = "editorial_rim_key"
    TABLETOP_SOFT_PRODUCT = "tabletop_soft_product"
    BOTTLE_BACKLIGHT = "bottle_backlight"
    ATHLETIC_RIM_SCULPT = "athletic_rim_sculpt"
    WINDOW_NEGATIVE_FILL = "window_negative_fill"
    HYBRID = "hybrid"
    UNKNOWN = "unknown"


_register_labels(LightingPattern, {
"clamshell": "Clamshell",
"butterfly": "Butterfly / Paramount",
"rim_only": "Rim / Edge Light",
"high_key": "High Key",
"low_key": "Low Key",
"flat_fashion": "Flat Fashion",
"window_portrait": "Window Portrait",
"golden_hour": "Golden Hour",
"overcast_natural": "Overcast Natural",
"ring_light": "Ring Light",
"bare_bulb_editorial": "Bare Bulb Editorial",
"strip_dramatic": "Strip Light Dramatic",
"short_fashion_key": "Short Fashion Key",
"soft_editorial_key": "Soft Editorial Key",
"editorial_rim_key": "Editorial Rim + Key",
"tabletop_soft_product": "Tabletop Soft Product",
"bottle_backlight": "Bottle Backlight",
"athletic_rim_sculpt": "Athletic Rim Sculpt",
"window_negative_fill": "Window Negative Fill",
})

# ═══════════════════════════════════════════════════════════════════════════
# 3. Pattern Categories
# ═══════════════════════════════════════════════════════════════════════════

class PatternCategory(_LabelMixin, str, Enum):
    BEAUTY = "beauty"
    CLASSIC = "classic"
    DRAMATIC = "dramatic"
    NATURAL = "natural"
    COMMERCIAL = "commercial"
    FASHION = "fashion"
    EDITORIAL = "editorial"
    PRODUCT = "product"
    ATHLETIC = "athletic"
    UNKNOWN = "unknown"


# ═══════════════════════════════════════════════════════════════════════════
# 4. Modifier Families
# ═══════════════════════════════════════════════════════════════════════════

class ModifierFamily(_LabelMixin, str, Enum):
    BEAUTY_DISH = "beauty_dish"
    SMALL_SOFTBOX = "small_softbox"
    MEDIUM_SOFTBOX = "medium_softbox"
    LARGE_OCTA = "large_octa"
    SOFTBOX = "softbox"
    SOFTBOX_STRIP = "softbox_strip"
    STRIPBOX = "stripbox"
    UMBRELLA_SILVER = "umbrella_silver"
    UMBRELLA_WHITE = "umbrella_white"
    UMBRELLA = "umbrella"
    REFLECTOR = "reflector"
    GRID_SPOT = "grid_spot"
    BARE_BULB = "bare_bulb"
    FRESNEL = "fresnel"
    TUBE_LIGHT = "tube_light"
    PANEL = "panel"
    DIFFUSION_FRAME = "diffusion_frame"
    NEGATIVE_FILL = "negative_fill"
    BOUNCE_SOURCE = "bounce_source"
    RING_LIGHT = "ring_light"
    OCTA = "octa"
    GRID = "grid"
    WINDOW = "window"
    SUN = "sun"
    UNKNOWN = "unknown"


_register_labels(ModifierFamily, {
"beauty_dish": "Beauty Dish",
"small_softbox": "Small Softbox",
"medium_softbox": "Medium Softbox",
"large_octa": "Large Octabox",
"softbox_strip": "Strip Softbox",
"stripbox": "Stripbox",
"umbrella_silver": "Silver Umbrella",
"umbrella_white": "White Umbrella",
"grid_spot": "Grid Spot",
"bare_bulb": "Bare Bulb",
"tube_light": "Tube Light",
"diffusion_frame": "Diffusion Frame",
"negative_fill": "Negative Fill (V-Flat)",
"bounce_source": "Bounce Source",
"ring_light": "Ring Light",
})

# ═══════════════════════════════════════════════════════════════════════════
# 5. Environment Types
# ═══════════════════════════════════════════════════════════════════════════

class EnvironmentType(_LabelMixin, str, Enum):
    STUDIO = "studio"
    WINDOW_LIGHT = "window_light"
    NATURAL = "natural"
    OUTDOOR = "outdoor"
    INDOOR_AMBIENT = "indoor_ambient"
    OUTDOOR_SHADE = "outdoor_shade"
    OUTDOOR_SUN = "outdoor_sun"
    OPEN_SHADE = "open_shade"
    OVERCAST = "overcast"
    MIXED = "mixed"
    PRODUCT_TABLETOP = "product_tabletop"
    UNKNOWN = "unknown"


_register_labels(EnvironmentType, {
"window_light": "Window Light",
"indoor_ambient": "Indoor Ambient",
"outdoor_shade": "Outdoor Shade",
"outdoor_sun": "Outdoor Sun",
"open_shade": "Open Shade",
"product_tabletop": "Product Tabletop",
})

# ═══════════════════════════════════════════════════════════════════════════
# 6. Camera Position
# ═══════════════════════════════════════════════════════════════════════════

class CameraHeightRelative(_LabelMixin, str, Enum):
    ABOVE = "above"
    AT_EYE_LEVEL = "at_eye_level"
    BELOW = "below"
    UNKNOWN = "unknown"


_register_labels(CameraHeightRelative, {
"at_eye_level": "At Eye Level",
})

class CameraHorizontalAngle(_LabelMixin, str, Enum):
    STRAIGHT_ON = "straight_on"
    SLIGHT_LEFT = "slight_left"
    SLIGHT_RIGHT = "slight_right"
    PROFILE_LEFT = "profile_left"
    PROFILE_RIGHT = "profile_right"
    UNKNOWN = "unknown"


_register_labels(CameraHorizontalAngle, {
"straight_on": "Straight On",
"slight_left": "Slight Left",
"slight_right": "Slight Right",
"profile_left": "Profile Left",
"profile_right": "Profile Right",
})

# ═══════════════════════════════════════════════════════════════════════════
# 7. Key Height Relative
# ═══════════════════════════════════════════════════════════════════════════

class KeyHeightRelative(_LabelMixin, str, Enum):
    LOW = "low"
    BELOW_EYE_LEVEL = "below_eye_level"
    EYE_LEVEL = "eye_level"
    ABOVE_EYE_LEVEL = "above_eye_level"
    HIGH = "high"
    OVERHEAD = "overhead"
    UNKNOWN = "unknown"


_register_labels(KeyHeightRelative, {
"below_eye_level": "Below Eye Level",
"eye_level": "Eye Level",
"above_eye_level": "Above Eye Level",
})

# ═══════════════════════════════════════════════════════════════════════════
# 8. Distance Classes
# ═══════════════════════════════════════════════════════════════════════════

class DistanceClass(_LabelMixin, str, Enum):
    VERY_CLOSE = "very_close"
    CLOSE = "close"
    MODERATE = "moderate"
    MEDIUM = "medium"
    FAR = "far"
    INFINITY = "infinity"
    UNKNOWN = "unknown"


_register_labels(DistanceClass, {
"very_close": "Very Close",
})

# ═══════════════════════════════════════════════════════════════════════════
# 9. Source Size Classes
# ═══════════════════════════════════════════════════════════════════════════

class SourceSizeClass(_LabelMixin, str, Enum):
    POINT = "point"
    VERY_SMALL = "very_small"
    SMALL = "small"
    MEDIUM = "medium"
    LARGE = "large"
    VERY_LARGE = "very_large"
    UNKNOWN = "unknown"


_register_labels(SourceSizeClass, {
"very_small": "Very Small",
"very_large": "Very Large",
})

# ═══════════════════════════════════════════════════════════════════════════
# 10. Subject Type
# ═══════════════════════════════════════════════════════════════════════════

class SubjectType(_LabelMixin, str, Enum):
    HEADSHOT = "headshot"
    PORTRAIT = "portrait"
    HALF_BODY = "half_body"
    FULL_BODY = "full_body"
    PRODUCT = "product"
    GROUP = "group"
    COUPLE = "couple"
    UNKNOWN = "unknown"


_register_labels(SubjectType, {
"half_body": "Half Body",
"full_body": "Full Body",
})

# ═══════════════════════════════════════════════════════════════════════════
# 11. Source Type (Photo Provenance)
# ═══════════════════════════════════════════════════════════════════════════

class SourceType(_LabelMixin, str, Enum):
    ORIGINAL_PHOTO = "original_photo"
    SCREENSHOT = "screenshot"
    STUDIO_TEST = "studio_test"
    FOUND_ONLINE = "found_online"
    BOOK_SCAN = "book_scan"
    AI_GENERATED = "ai_generated"
    UNKNOWN = "unknown"


_register_labels(SourceType, {
"original_photo": "Original Photo",
"studio_test": "Studio Test",
"found_online": "Found Online",
"book_scan": "Book Scan",
"ai_generated": "AI Generated",
})

# ═══════════════════════════════════════════════════════════════════════════
# 12. Dataset Tier
# ═══════════════════════════════════════════════════════════════════════════

class DatasetTier(_LabelMixin, str, Enum):
    GOLD = "gold"
    COMMUNITY = "community"
    SYNTHETIC = "synthetic"
    UNKNOWN = "unknown"


# ═══════════════════════════════════════════════════════════════════════════
# 13. Catchlight Shape
# ═══════════════════════════════════════════════════════════════════════════

class CatchlightShape(_LabelMixin, str, Enum):
    ROUND = "round"
    CIRCULAR = "circular"
    RECTANGULAR = "rectangular"
    SQUARE = "square"
    OCTAGONAL = "octagonal"
    STRIP = "strip"
    MIXED = "mixed"
    NONE_VISIBLE = "none_visible"
    UNKNOWN = "unknown"


_register_labels(CatchlightShape, {
"none_visible": "None Visible",
})

# ═══════════════════════════════════════════════════════════════════════════
# 14. Catchlight Position (clock reference)
# ═══════════════════════════════════════════════════════════════════════════

class CatchlightPosition(_LabelMixin, str, Enum):
    """Where in the iris the catchlight appears (clock position)."""
    TWELVE = "12"
    ONE = "1"
    TWO = "2"
    THREE = "3"
    FOUR = "4"
    FIVE = "5"
    SIX = "6"
    SEVEN = "7"
    EIGHT = "8"
    NINE = "9"
    TEN = "10"
    ELEVEN = "11"
    CENTER = "center"
    UNKNOWN = "unknown"


# ═══════════════════════════════════════════════════════════════════════════
# 15. Catchlight Cluster Geometry
# ═══════════════════════════════════════════════════════════════════════════

class CatchlightPattern(_LabelMixin, str, Enum):
    SINGLE = "single"
    DUAL = "dual"
    TRIANGULAR = "triangular"
    LINEAR = "linear"
    RING = "ring"
    STRIP = "strip"
    UNKNOWN = "unknown"


# ═══════════════════════════════════════════════════════════════════════════
# 16. Shadow Pattern
# ═══════════════════════════════════════════════════════════════════════════

class ShadowPattern(_LabelMixin, str, Enum):
    TRIANGLE = "triangle"
    CLAMSHELL = "clamshell"
    REMBRANDT = "rembrandt"
    LOOP = "loop"
    BUTTERFLY = "butterfly"
    FLAT = "flat"
    GOBO = "gobo"
    CROSS_SHAPED_GOBO = "cross_shaped_gobo"
    GRID_WINDOW_GOBO = "grid_window_gobo"
    SLIT_FLAG_PROJECTION = "slit_flag_projection"
    UNKNOWN = "unknown"


_register_labels(ShadowPattern, {
"triangle": "Triangle (Hurley)",
"cross_shaped_gobo": "Cross-Shaped Gobo",
"grid_window_gobo": "Grid / Window Gobo",
"slit_flag_projection": "Slit / Flag Projection",
})

# ═══════════════════════════════════════════════════════════════════════════
# 17. Light Technology
# ═══════════════════════════════════════════════════════════════════════════

class LightTechnology(_LabelMixin, str, Enum):
    CONTINUOUS_LED = "continuous_led"
    CONTINUOUS_PANEL = "continuous_panel"
    CONTINUOUS_TUBE = "continuous_tube"
    STROBE = "strobe"
    FLASH = "flash"
    UNKNOWN = "unknown"


_register_labels(LightTechnology, {
"continuous_led": "Continuous LED",
"continuous_panel": "Continuous Panel",
"continuous_tube": "Continuous Tube",
})

# ═══════════════════════════════════════════════════════════════════════════
# 18. Underfill Type
# ═══════════════════════════════════════════════════════════════════════════

class UnderfillType(_LabelMixin, str, Enum):
    NONE = "none"
    SUBTLE = "subtle"
    MODERATE = "moderate"
    STRONG = "strong"
    UNKNOWN = "unknown"


# ═══════════════════════════════════════════════════════════════════════════
# 19. Signal Type (which pass produced the signal)
# ═══════════════════════════════════════════════════════════════════════════

class SignalType(_LabelMixin, str, Enum):
    SHADOW = "shadow_pass"
    HIGHLIGHT = "highlight_pass"
    CATCHLIGHT = "catchlight_pass"
    LIGHT_DIRECTION_FIELD = "light_direction_field_pass"
    INVERSE_SQUARE = "inverse_square_solver_pass"
    SOLAR = "solar_geometry_pass"
    WINDOW = "window_geometry_pass"
    BOUNCE = "bounce_geometry_pass"
    REFLECTION = "reflection_geometry_pass"
    PENUMBRA = "shadow_penumbra_pass"
    COLOR_TEMP = "color_temperature_pass"
    ENVIRONMENT = "environment_light_pass"
    MODIFIER_SHAPE = "modifier_shape_solver_pass"
    POSE_SOLVER = "pose_solver_pass"
    SURFACE_CLASS = "surface_class_pass"
    HYPOTHESIS = "lighting_hypothesis_engine"
    CONSISTENCY = "consistency_engine"


_register_labels(SignalType, {
"shadow_pass": "Shadow Pass",
"highlight_pass": "Highlight Pass",
"catchlight_pass": "Catchlight Pass",
"light_direction_field_pass": "Light Direction Field",
"inverse_square_solver_pass": "Inverse Square Solver",
"solar_geometry_pass": "Solar Geometry",
"window_geometry_pass": "Window Geometry",
"bounce_geometry_pass": "Bounce Geometry",
"reflection_geometry_pass": "Reflection Geometry",
"shadow_penumbra_pass": "Shadow Penumbra",
"color_temperature_pass": "Color Temperature",
"environment_light_pass": "Environment Light",
"modifier_shape_solver_pass": "Modifier Shape Solver",
"pose_solver_pass": "Pose Solver",
"surface_class_pass": "Surface Class",
"lighting_hypothesis_engine": "Hypothesis Engine",
"consistency_engine": "Consistency Engine",
})

# ═══════════════════════════════════════════════════════════════════════════
# 20. Confidence Level (coarse bucketing)
# ═══════════════════════════════════════════════════════════════════════════

class ConfidenceLevel(_LabelMixin, str, Enum):
    VERY_LOW = "very_low"
    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"
    VERY_HIGH = "very_high"

    @classmethod
    def from_score(cls, score: float) -> "ConfidenceLevel":
        """Bucket a 0.0-1.0 confidence score into a level."""
        if score < 0.2:
            return cls.VERY_LOW
        if score < 0.4:
            return cls.LOW
        if score < 0.6:
            return cls.MODERATE
        if score < 0.8:
            return cls.HIGH
        return cls.VERY_HIGH


_register_labels(ConfidenceLevel, {
    "very_low": "Very Low",
    "very_high": "Very High",
})


# ═══════════════════════════════════════════════════════════════════════════
# 21. Benchmark Category
# ═══════════════════════════════════════════════════════════════════════════

class BenchmarkCategory(_LabelMixin, str, Enum):
    CATCHLIGHT_ACCURACY = "catchlight_accuracy"
    HIGHLIGHT_AXIS_ACCURACY = "highlight_axis_accuracy"
    SYMMETRY_ACCURACY = "symmetry_accuracy"
    UNDERFILL_DETECTION = "underfill_detection"
    MODIFIER_CANDIDATE_QUALITY = "modifier_candidate_quality"
    KEY_DIRECTION_ACCURACY = "key_direction_accuracy"
    ENVIRONMENT_DETECTION = "environment_detection"
    FALSE_MULTI_LIGHT_PREVENTION = "false_multi_light_prevention"
    CONTRADICTION_HANDLING = "contradiction_handling"
    CONFIDENCE_HONESTY = "confidence_honesty"


_register_labels(BenchmarkCategory, {
"catchlight_accuracy": "Catchlight Accuracy",
"highlight_axis_accuracy": "Highlight Axis Accuracy",
"symmetry_accuracy": "Symmetry Accuracy",
"underfill_detection": "Underfill Detection",
"modifier_candidate_quality": "Modifier Candidate Quality",
"key_direction_accuracy": "Key Direction Accuracy",
"environment_detection": "Environment Detection",
"false_multi_light_prevention": "False Multi-Light Prevention",
"contradiction_handling": "Contradiction Handling",
"confidence_honesty": "Confidence Honesty",
})

# ═══════════════════════════════════════════════════════════════════════════
# 22. Review Status
# ═══════════════════════════════════════════════════════════════════════════

class ReviewStatus(_LabelMixin, str, Enum):
    DRAFT = "draft"
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    ARCHIVED = "archived"
    UNKNOWN = "unknown"


# ═══════════════════════════════════════════════════════════════════════════
# 23. Processing Status
# ═══════════════════════════════════════════════════════════════════════════

class ProcessingStatus(_LabelMixin, str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    NEEDS_REPROCESSING = "needs_reprocessing"
    UNKNOWN = "unknown"


_register_labels(ProcessingStatus, {
"needs_reprocessing": "Needs Reprocessing",
})

# ═══════════════════════════════════════════════════════════════════════════
# 24. Rights Type
# ═══════════════════════════════════════════════════════════════════════════

class RightsType(_LabelMixin, str, Enum):
    OWNED = "owned"
    LICENSED = "licensed"
    CREATIVE_COMMONS = "creative_commons"
    FAIR_USE = "fair_use"
    PUBLIC_DOMAIN = "public_domain"
    UNKNOWN = "unknown"


_register_labels(RightsType, {
"creative_commons": "Creative Commons",
"fair_use": "Fair Use",
"public_domain": "Public Domain",
})

# ═══════════════════════════════════════════════════════════════════════════
# 25. Master Profile (Photographer Archetype)
# ═══════════════════════════════════════════════════════════════════════════

class MasterProfile(_LabelMixin, str, Enum):
    HURLEY = "hurley"
    PENN = "penn"
    KARSH = "karsh"
    LEIBOVITZ = "leibovitz"
    ADLER = "adler"
    HEISLER = "heisler"
    CARAVAGGIO = "caravaggio"
    BRYCE = "bryce"
    UNKNOWN = "unknown"


_register_labels(MasterProfile, {
"hurley": "Peter Hurley",
"penn": "Irving Penn",
"karsh": "Yousuf Karsh",
"leibovitz": "Annie Leibovitz",
"adler": "Lindsay Adler",
"heisler": "Gregory Heisler",
"caravaggio": "Caravaggio (Chiaroscuro)",
"bryce": "Bryce (Natural Light)",
})

# ═══════════════════════════════════════════════════════════════════════════
# 26. Style Family
# ═══════════════════════════════════════════════════════════════════════════

class StyleFamily(_LabelMixin, str, Enum):
    COMMERCIAL_HEADSHOT = "commercial_headshot"
    EDITORIAL_PORTRAIT = "editorial_portrait"
    BEAUTY = "beauty"
    FASHION = "fashion"
    DRAMATIC_PORTRAIT = "dramatic_portrait"
    NATURAL_LIGHT = "natural_light"
    PRODUCT = "product"
    ATHLETIC = "athletic"
    UNKNOWN = "unknown"


_register_labels(StyleFamily, {
"commercial_headshot": "Commercial Headshot",
"editorial_portrait": "Editorial Portrait",
"dramatic_portrait": "Dramatic Portrait",
"natural_light": "Natural Light",
})

# ═══════════════════════════════════════════════════════════════════════════
# 27. Contradiction Severity
# ═══════════════════════════════════════════════════════════════════════════

class ContradictionSeverity(_LabelMixin, str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


# ═══════════════════════════════════════════════════════════════════════════
# 28. Ambiguity Classification
# ═══════════════════════════════════════════════════════════════════════════

class AmbiguityClass(_LabelMixin, str, Enum):
    CLEAN = "clean"
    MINOR_CONFLICTS = "minor_conflicts"
    GENUINE_AMBIGUITY = "genuine_ambiguity"
    INSUFFICIENT_DATA = "insufficient_data"
    HYBRID_LIGHTING = "hybrid_lighting"


_register_labels(AmbiguityClass, {
"minor_conflicts": "Minor Conflicts",
"genuine_ambiguity": "Genuine Ambiguity",
"insufficient_data": "Insufficient Data",
"hybrid_lighting": "Hybrid Lighting",
})

# ═══════════════════════════════════════════════════════════════════════════
# 29. Shadow Hardness
# ═══════════════════════════════════════════════════════════════════════════

class ShadowHardness(_LabelMixin, str, Enum):
    HARD = "hard"
    SOFT = "soft"
    MIXED = "mixed"
    UNKNOWN = "unknown"


# ═══════════════════════════════════════════════════════════════════════════
# 30. Surface Class
# ═══════════════════════════════════════════════════════════════════════════

class SurfaceClass(_LabelMixin, str, Enum):
    FACE_SKIN = "face_skin"
    BODY_SKIN = "body_skin"
    HAIR = "hair"
    MATTE_FABRIC = "matte_fabric"
    SEMI_GLOSS_FABRIC = "semi_gloss_fabric"
    SATIN_SILK = "satin_silk"
    LEATHER = "leather"
    METALLIC = "metallic"
    GLASS = "glass"
    CHROME_LIKE = "chrome_like"
    SKIN_SHEEN = "skin_sheen"
    MATTE_SKIN = "matte_skin"
    BACKGROUND_PAPER = "background_paper"
    BACKGROUND_PAINTED_WALL = "background_painted_wall"
    UNKNOWN = "unknown"


_register_labels(SurfaceClass, {
"face_skin": "Face Skin",
"body_skin": "Body Skin",
"matte_fabric": "Matte Fabric",
"semi_gloss_fabric": "Semi-Gloss Fabric",
"satin_silk": "Satin / Silk",
"chrome_like": "Chrome-Like",
"skin_sheen": "Skin Sheen",
"matte_skin": "Matte Skin",
"background_paper": "Background Paper",
"background_painted_wall": "Background (Painted Wall)",
})

# ═══════════════════════════════════════════════════════════════════════════
# 31. Surface Reflectance
# ═══════════════════════════════════════════════════════════════════════════

class SurfaceReflectance(_LabelMixin, str, Enum):
    DIFFUSE = "diffuse"
    GLOSSY = "glossy"
    SPECULAR = "specular"
    MIXED = "mixed"
    UNKNOWN = "unknown"


# ═══════════════════════════════════════════════════════════════════════════
# 32. Region Reliability Keys
# ═══════════════════════════════════════════════════════════════════════════

class ReliabilityRegion(_LabelMixin, str, Enum):
    FACE = "face"
    TORSO = "torso"
    BACKGROUND = "background"
    HAIR = "hair"
    SKIN_GENERAL = "skin_general"
    SPECULAR_SURFACES = "specular_surfaces"
    SHADOW_REGIONS = "shadow_regions"
    HIGHLIGHT_REGIONS = "highlight_regions"


_register_labels(ReliabilityRegion, {
"skin_general": "Skin (General)",
"specular_surfaces": "Specular Surfaces",
"shadow_regions": "Shadow Regions",
"highlight_regions": "Highlight Regions",
})

# ═══════════════════════════════════════════════════════════════════════════
# 33. Occluder Type & Severity
# ═══════════════════════════════════════════════════════════════════════════

class OccluderType(_LabelMixin, str, Enum):
    BODY_PART = "body_part"
    OBJECT = "object"
    ARCHITECTURE = "architecture"
    FOLIAGE = "foliage"
    UNKNOWN = "unknown"


_register_labels(OccluderType, {
"body_part": "Body Part",
})

class OccluderSeverity(_LabelMixin, str, Enum):
    PARTIAL = "partial"
    FULL = "full"


# ═══════════════════════════════════════════════════════════════════════════
# 34. Bounce Contribution Level
# ═══════════════════════════════════════════════════════════════════════════

class BounceContribution(_LabelMixin, str, Enum):
    MINOR = "minor"
    MODERATE = "moderate"
    SIGNIFICANT = "significant"


# ═══════════════════════════════════════════════════════════════════════════
# 35. Scene Complexity
# ═══════════════════════════════════════════════════════════════════════════

class SceneComplexity(_LabelMixin, str, Enum):
    SIMPLE = "simple"
    MODERATE = "moderate"
    COMPLEX = "complex"


# ═══════════════════════════════════════════════════════════════════════════
# 36. Genre Classification
# ═══════════════════════════════════════════════════════════════════════════

class Genre(_LabelMixin, str, Enum):
    PORTRAIT = "portrait"
    EDITORIAL = "editorial"
    BEAUTY = "beauty"
    FASHION = "fashion"
    HEADSHOT = "headshot"
    ENVIRONMENTAL = "environmental"
    PRODUCT = "product"
    UNKNOWN = "unknown"


# ═══════════════════════════════════════════════════════════════════════════
# 37. Background Illumination Pattern & Brightness
# ═══════════════════════════════════════════════════════════════════════════

class BackgroundIlluminationPattern(_LabelMixin, str, Enum):
    EVEN = "even"
    GRADIENT = "gradient"
    SPOT = "spot"
    DARK = "dark"
    ENVIRONMENTAL = "environmental"
    UNKNOWN = "unknown"


class BackgroundBrightness(_LabelMixin, str, Enum):
    BRIGHTER = "brighter"
    SIMILAR = "similar"
    DARKER = "darker"
    UNKNOWN = "unknown"


# ═══════════════════════════════════════════════════════════════════════════
# 38. Specular Highlight Intensity & Spread
# ═══════════════════════════════════════════════════════════════════════════

class SpecularIntensity(_LabelMixin, str, Enum):
    STRONG = "strong"
    MODERATE = "moderate"
    SUBTLE = "subtle"
    NONE = "none"
    UNKNOWN = "unknown"


class SpecularSpread(_LabelMixin, str, Enum):
    BROAD = "broad"
    TIGHT = "tight"
    UNKNOWN = "unknown"


# ═══════════════════════════════════════════════════════════════════════════
# 39. VLM/CV Agreement Status
# ═══════════════════════════════════════════════════════════════════════════

class AgreementStatus(_LabelMixin, str, Enum):
    CONFIRMED = "confirmed"
    CONFLICTING = "conflicting"
    VLM_ONLY = "vlm_only"
    CV_ONLY = "cv_only"
    BOTH_INCONCLUSIVE = "both_inconclusive"
    STRONG_AGREEMENT = "strong_agreement"
    PARTIAL_AGREEMENT = "partial_agreement"
    SIGNIFICANT_CONFLICT = "significant_conflict"
    VLM_UNAVAILABLE = "vlm_unavailable"


_register_labels(AgreementStatus, {
"vlm_only": "VLM Only",
"cv_only": "CV Only",
"both_inconclusive": "Both Inconclusive",
"strong_agreement": "Strong Agreement",
"partial_agreement": "Partial Agreement",
"significant_conflict": "Significant Conflict",
"vlm_unavailable": "VLM Unavailable",
})

# ═══════════════════════════════════════════════════════════════════════════
# 40. Contrast Ratio
# ═══════════════════════════════════════════════════════════════════════════

class ContrastRatio(_LabelMixin, str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    EXTREME = "extreme"
    UNKNOWN = "unknown"


# ═══════════════════════════════════════════════════════════════════════════
# 41. Scene Type
# ═══════════════════════════════════════════════════════════════════════════

class SceneType(_LabelMixin, str, Enum):
    STUDIO_PORTRAIT = "studio_portrait"
    ENVIRONMENTAL = "environmental"
    OUTDOOR = "outdoor"
    UNKNOWN = "unknown"


_register_labels(SceneType, {
"studio_portrait": "Studio Portrait",
})

# ═══════════════════════════════════════════════════════════════════════════
# 42. Contamination Flags
# ═══════════════════════════════════════════════════════════════════════════

class ContaminationFlag(_LabelMixin, str, Enum):
    POSE_CONTAMINATED = "pose_contaminated"
    SURFACE_CONTAMINATED = "surface_contaminated"
    OCCLUSION_CONTAMINATED = "occlusion_contaminated"
    BACKGROUND_SPILL_CANDIDATE = "background_spill_candidate"
    INSUFFICIENT_VISIBILITY = "insufficient_visibility"
    BW_OR_HEAVY_GRADE = "bw_or_heavy_grade"
    SPECULAR_SURFACE = "specular_surface"
    NO_FACE_MESH = "no_face_mesh"
    ENVIRONMENTAL_BACKGROUND = "environmental_background"
    MULTIPLE_SHADOW_DIRECTIONS = "multiple_shadow_directions"
    SHADOW_INTERRUPTION_PATTERN = "shadow_interruption_pattern"
    LOW_RESOLUTION = "low_resolution"


_register_labels(ContaminationFlag, {
"pose_contaminated": "Pose Contamination",
"surface_contaminated": "Surface Contamination",
"occlusion_contaminated": "Occlusion Contamination",
"background_spill_candidate": "Background Spill Candidate",
"insufficient_visibility": "Insufficient Visibility",
"bw_or_heavy_grade": "B&W or Heavy Grading",
"specular_surface": "Specular Surface",
"no_face_mesh": "No Face Mesh",
"environmental_background": "Environmental Background",
"multiple_shadow_directions": "Multiple Shadow Directions",
"shadow_interruption_pattern": "Shadow Interruption Pattern",
"low_resolution": "Low Resolution",
})

# ═══════════════════════════════════════════════════════════════════════════
# Lookup helpers
# ═══════════════════════════════════════════════════════════════════════════

def enum_label(enum_class: type, value: str) -> str:
    """Get the human-readable label for a value from any enum class.

    Falls back to title-cased value if not found in the enum.
    """
    try:
        return enum_class(value).label
    except ValueError:
        return value.replace("_", " ").title()


def enum_values(enum_class: type) -> list[str]:
    """Return all values of an enum class as a list of strings."""
    return [e.value for e in enum_class]


def enum_choices(enum_class: type) -> list[dict]:
    """Return all values + labels as a list of dicts for API / UI usage."""
    return [{"value": e.value, "label": e.label} for e in enum_class]
