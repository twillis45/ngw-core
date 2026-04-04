"""Centralized constants and thresholds for the NGW analysis pipeline.

Grouped by functional area.  When a future image fix requires a threshold
tweak, change the value here instead of hunting through 3 000 lines of
analysis code.

Architecture note
-----------------
Constants use simple classes (not enums) so they can be imported cheaply:

    from engine.constants import BG, FRAMING

Each class is a namespace — instances are never created.
"""

# ── Engine identity ──────────────────────────────────────────────────────
ENGINE_NAME = "ngw-core"
ENGINE_VERSION = "1.0.0"

MAX_TOP_PICKS = 3
CONFIDENCE_MAX = 100.0


# ═══════════════════════════════════════════════════════════════════════════
# Background Analysis  (cue_extraction.py + reference_read.py)
# ═══════════════════════════════════════════════════════════════════════════

class BG:
    """Background illumination pattern classification thresholds."""

    # ── Pattern classification (cue_extraction, extract_background_illumination) ──
    DARK_MEAN = 50            # bg_mean < this → "dark"
    DARK_MEDIUM_MEAN = 80     # bg_mean < this (with darker + low std) → "dark"
    STUDIO_STD_MAX = 40       # bg_std < this required for studio classification
    EVEN_STD = 15             # bg_std < this → "even"
    GRADIENT_STD_MAX = 60     # bg_std < this (with darker/similar + bg_mean >= GRADIENT_MEAN_MIN) → "gradient"
    GRADIENT_MEAN_MIN = 80    # bg_mean >= this required for gradient when bg_std 40-60

    # ── Brightness comparison (cue_extraction, extract_background_illumination) ──
    BRIGHTNESS_DELTA = 20     # luminance delta for darker/brighter/similar classification

    # ── Dark background garment correction ──
    DARK_GARMENT_CORRECTION_MEAN = 120  # bg_mean > this cancels dark-garment reclassification

    # ── Background relationship (reference_read.py, _build_background_relationship) ──
    MID_GREY_MIN = 50         # bg_mean in [MID_GREY_MIN, MID_GREY_MAX] → "mid-grey studio backdrop"
    MID_GREY_MAX = 200
    DARK_THRESHOLD = 50       # bg_mean < this → genuinely dark/black

    # ── Effectively dark (reference_read.py, _bg_is_effectively_dark) ──
    EFFECTIVELY_DARK_MEAN = 30

    # ── Subject-background separation (reference_read.py) ──
    SEPARATION_STRONG_DELTA = 0.6    # luminance delta ≥ this → "strong" separation
    SEPARATION_MODERATE_DELTA = 0.3  # luminance delta ≥ this → "moderate" separation
    SEPARATION_CLOSE_DELTA = 0.45    # luminance delta < this → subject "near" bg
    LUMINANCE_DELTA_PERCEPTUAL_MIN = 0.05  # minimum delta to confirm darker/brighter

    # ── Contrast-grading side-effect detection (cue_extraction) ──
    HCG_MEAN_THRESHOLD = 80   # bg_mean < this AND bg_std < HCG_STD → contrast grading note
    HCG_STD_THRESHOLD = 40


# ═══════════════════════════════════════════════════════════════════════════
# Background Environment Detection  (vision_pipeline.py)
# ═══════════════════════════════════════════════════════════════════════════

class BG_ENV:
    """Background environment (outdoor/studio/unknown) classification."""

    MIN_BG_PIXELS = 500          # minimum background pixels for analysis
    DARK_BRIGHTNESS = 60         # pixels below this counted as "dark"
    CANNY_LOW = 30               # Canny lower threshold for BG edges
    CANNY_HIGH = 90              # Canny upper threshold for BG edges
    BRIGHT_BG_THRESHOLD = 30     # brightness above this = "bright" BG region
    MIN_BRIGHT_BG_PIXELS = 500   # minimum bright-BG pixels for texture analysis

    # ── Outdoor / organic detection ──
    TEXTURE_STD_ORGANIC = 50     # texture std > this → organic detail
    EDGE_RATIO_ORGANIC = 0.06    # edge ratio > this → organic detail
    BRIGHT_STD_FOLIAGE = 30      # bright-region texture std > this → foliage candidate
    BRIGHT_EDGE_RATIO_OUTDOOR = 0.10

    # ── Foliage / greenery ──
    GREEN_DOMINANCE = 5          # green channel dominance threshold
    BW_BRIGHT_STD_FOLIAGE = 25   # B&W proxy for foliage texture
    BW_BRIGHT_EDGE_FOLIAGE = 0.12

    # ── Directional light ──
    DARK_RATIO_DIRECTIONAL = 0.3  # dark pixel ratio > this → directional/sunlight

    # ── Studio detection ──
    TEXTURE_STD_STUDIO = 20      # texture std < this → studio
    MEAN_DARK_STUDIO = 50        # mean < this in studio → dark studio BG
    TEXTURE_STD_EVEN_STUDIO = 25 # texture std < this → even studio BG
    DARK_RATIO_EVEN_STUDIO = 0.1 # dark ratio < this → even studio BG


# ═══════════════════════════════════════════════════════════════════════════
# Person Ratio & Framing  (reference_read.py)
# ═══════════════════════════════════════════════════════════════════════════

class FRAMING:
    """Person-ratio thresholds for camera-subject relationship."""

    # ── Standard framing (fallback) ──
    FULL_BODY = 0.35
    THREE_QUARTER = 0.20
    CLOSE_UP = 0.10
    TIGHT_CLOSE_UP = 0.04

    # ── Environmental scene framing ──
    ENV_FULL_BODY = 0.12
    ENV_DISTANT = 0.04

    # ── Extreme crop / gobo context ──
    EXTREME_CLOSEUP_BG = 0.20    # person_ratio < this with high bg_ratio → extreme close-up

    # ── Background ratio dominance ──
    BG_DOMINANT = 0.75           # bg_ratio > this → subject occupies < 25% of frame
    BG_EXTREME = 0.80            # bg_ratio > this → extreme background dominance

    # ── Pose reliability gate ──
    POSE_UNRELIABLE_BG = 0.75    # bg_ratio > this → pose interpretation unreliable

    # ── Gobo / dramatic thresholds ──
    GOBO_PERSON_RATIO = 0.25     # person_ratio < this → gobo masking reinterpretation
    GOBO_MYSTERIOUS = 0.30       # person_ratio < this with gobo + dark bg → mysterious

    # ── Small subject thresholds ──
    TINY_SUBJECT = 0.25          # person_ratio < this → tiny subject enrichment


# ═══════════════════════════════════════════════════════════════════════════
# Shadow Edge Detection  (cue_extraction.py)
# ═══════════════════════════════════════════════════════════════════════════

class SHADOW:
    """Shadow edge hardness and detection thresholds."""

    # ── Percentiles for shadow / midtone region isolation ──
    SHADOW_PERCENTILE = 33       # darker third of pixels
    MIDTONE_PERCENTILE = 66      # upper two-thirds

    # ── Canny edge detection (standard) ──
    CANNY_LOW = 50
    CANNY_HIGH = 150

    # ── Edge density classification (neutral lighting) ──
    HARD_DENSITY = 0.03          # edge density > this → hard shadow
    SOFT_DENSITY = 0.01          # edge density < this → soft shadow

    # ── Edge density classification (high-contrast grading) ──
    HARD_DENSITY_HCG = 0.05      # higher threshold under HCG
    SOFT_DENSITY_HCG = 0.015

    # ── Minimum density to classify ──
    MIN_TOTAL_DENSITY = 0.001    # below this → "unknown"

    # ── Minimum pixels ──
    MIN_PERSON_PIXELS = 100      # minimum person pixels for analysis

    # ── Multi-shadow gradient analysis (extract_multi_shadow_detection) ──
    SHADOW_REGION_PERCENTILE = 30
    MIN_SHADOW_PIXELS = 50
    SOBEL_KERNEL = 3
    SIGNIFICANT_GRADIENT_PERCENTILE = 70
    MIN_SIGNIFICANT_GRADIENTS = 20
    DIRECTION_BINS = 8
    DOMINANT_DIRECTION_THRESHOLD = 0.15


# ═══════════════════════════════════════════════════════════════════════════
# Catchlight Detection  (vision_pipeline.py)
# ═══════════════════════════════════════════════════════════════════════════

class CATCHLIGHT:
    """Catchlight detection and shape classification."""

    # ── Brightness thresholds ──
    V_THRESHOLD_COLOR = 190      # V-channel (brightness) for normal images
    V_THRESHOLD_BW = 160         # V-channel for B&W / dramatic images
    S_MAX = 80                   # S-channel (saturation) max for catchlight mask

    # ── B&W detection ──
    BW_SATURATION_CUTOFF = 45    # mean saturation < this → treat as B&W
    #   Editorial B&W often has mean sat 25-50; old threshold of 25 missed them

    # ── Morphology kernel sizes ──
    MORPH_KERNEL_BW = 2
    MORPH_KERNEL_COLOR = 2       # was 3 — too aggressive on downscaled images

    # ── Area thresholds ──
    MIN_AREA_BW = 2              # minimum contour area (B&W images)
    MIN_AREA_COLOR = 3           # minimum contour area (color images)
    MAX_AREA_RATIO = 0.4         # max contour area relative to crop

    # ── Shape classification ──
    CIRCULARITY_ROUND = 0.60     # circularity > this → round; else rectangular

    # ── Eye crop ──
    IRIS_CROP_RADIUS_MULT = 3    # radius multiplier for eye region extraction

    # ── Iris proximity filter ──
    # Catchlight centroid must be within this many iris-radii of the iris center.
    # True catchlights land on the iris surface (0–1.0×); lash-line shimmer from
    # mascara or specular makeup sits at the lash edge (~1.3–2.0×).
    # Raising from ∞ (no filter) to 1.25 eliminates lash/lid artifacts in
    # dramatic B&W and heavy-makeup images without dropping real catchlights.
    IRIS_PROXIMITY_MAX_MULT = 1.25

    # ── Topology pass minimum blob area ──
    # Raised from 3 to 6 px²: mascara flecks on B&W images survive the P90
    # threshold as 3-5 px² blobs; genuine catchlights are ≥ 8 px².
    TOPOLOGY_MIN_AREA = 6

    # ── Deduplication ──
    FLOOR_REFLECTION_CLOCKS = (5, 6, 7)  # clock positions filtered as floor reflections
    PROXIMITY_TOLERANCE = 1              # ±hours for grouping catchlights (was 2)

    # ── Clock positions for passive bounce (reference_read.py) ──
    UPPER_CLOCKS = (10, 11, 12, 1, 2)   # above eye level
    LOWER_CLOCKS = (4, 5, 6, 7, 8)      # below eye level (floor bounce)

    # ── Catchlight-based confidence (reference_read.py) ──
    INTENSITY_MIN_SOFT = 0.5     # min intensity for soft modifier shape detection
    SYMMETRY_ARTIFACT = 0.7      # symmetry < this → possible artifact, not real light
    CONFIDENCE_MIN = 0.3         # min confidence for studio catchlight detection


# ═══════════════════════════════════════════════════════════════════════════
# Skin Detection  (vision_pipeline.py)
# ═══════════════════════════════════════════════════════════════════════════

class SKIN:
    """Skin detection and tone classification."""

    # ── YCbCr ranges ──
    YCBCR_CB_MIN = 77
    YCBCR_CB_MAX = 127
    YCBCR_CR_MIN = 133
    YCBCR_CR_MAX = 173
    YCBCR_Y_MIN = 25
    YCBCR_Y_MAX = 235

    # ── B&W fallback ──
    RATIO_BW_FALLBACK = 0.01       # skin_ratio < this triggers B&W fallback
    PERSON_RATIO_BW_FALLBACK = 0.05
    COLOR_VARIANCE_BW = 5          # std < this → B&W image

    # ── Tone classification ──
    MIN_PIXELS_TONE = 800          # minimum skin pixels for tone classification
    DEEP_LUMA = 115                # luma < this → "deep" skin tone
    MEDIUM_LUMA = 165              # luma < this → "medium"; else "light"

    # ── Tone confidence ──
    CONFIDENCE_HIGH_RATIO = 0.10   # skin_ratio > this → high confidence
    CONFIDENCE_MEDIUM_RATIO = 0.05 # skin_ratio > this → medium confidence

    # ── Palette extraction minimums ──
    MIN_SKIN_PIXELS_PALETTE = 500
    MIN_CLOTHING_PIXELS_PALETTE = 1000
    MIN_BG_PIXELS_PALETTE = 1000


# ═══════════════════════════════════════════════════════════════════════════
# Tonal Processing  (cue_extraction.py)
# ═══════════════════════════════════════════════════════════════════════════

class TONAL:
    """B&W, high-contrast, and tonal processing detection."""

    # ── B&W detection ──
    CHANNEL_DIFF_BW = 16          # max RGB channel diff for B&W classification
    WARM_BW_MEAN_SAT = 30         # mean saturation < this for warm B&W path
    WARM_BW_P90_SAT = 50          # p90 saturation < this for warm B&W
    LOW_SAT_THRESHOLD = 40        # saturation < this counted as "low-saturation"
    LOW_SAT_PIXEL_PCT = 90        # > this % low-sat pixels → desaturated / B&W

    # ── Warm toning (B&W with residual color) ──
    WARM_TONING_SAT = 5           # mean_sat > this in B&W → warm toning detected

    # ── High-contrast grade detection ──
    HCG_TONAL_RANGE_MIN = 230     # luminance range > this → high-contrast candidate
    HCG_SATURATION_MAX = 60       # saturation < this → high-contrast (not vibrant)

    # ── Crushed shadows / clipped highlights (colour-graded images) ──
    CRUSH_P5_DELTA = 3            # p5 - p1 < this → shadows crushed
    CRUSH_P1_MAX = 15             # p1 must be < this for shadow crush
    CLIP_P99_DELTA = 3            # p99 - p95 < this → highlights clipped
    CLIP_P99_MIN = 240            # p99 must be > this for highlight clip
    CRUSH_RANGE_MIN = 200         # p99 - p1 > this → wide-range crush grade

    # ── Desaturated processing ──
    DESATURATED_SAT = 30          # mean saturation < this (not B&W) → desaturated


# ═══════════════════════════════════════════════════════════════════════════
# Contrast Ratio  (cue_extraction.py)
# ═══════════════════════════════════════════════════════════════════════════

class CONTRAST:
    """Contrast ratio label classification."""

    PERCENTILE_LOW = 5            # lower percentile for spread calculation
    PERCENTILE_HIGH = 95          # upper percentile for spread calculation
    SPREAD_LOW = 0.25             # spread < this → "low" contrast
    SPREAD_MEDIUM = 0.50          # spread < this → "medium"
    SPREAD_HIGH = 0.75            # spread < this → "high"; else "extreme"


# ═══════════════════════════════════════════════════════════════════════════
# Specular Highlights  (cue_extraction.py)
# ═══════════════════════════════════════════════════════════════════════════

class SPECULAR:
    """Specular highlight intensity classification."""

    BRIGHT_THRESHOLD = 200        # minimum brightness for "bright" pixel (p97)
    RATIO_STRONG = 0.05           # bright ratio > this → "strong"
    RATIO_MODERATE = 0.01         # bright ratio > this → "moderate"
    RATIO_SUBTLE = 0.002          # bright ratio > this → "subtle"; else "none"


# ═══════════════════════════════════════════════════════════════════════════
# Dramatic Hard Light Heuristic  (reference_read.py)
# ═══════════════════════════════════════════════════════════════════════════

class DRAMATIC:
    """Thresholds for _detect_dramatic_hard_light scoring."""

    BG_RATIO_SHADOW = 0.75        # bg_ratio > this → shadow-masking evidence
    PERSON_RATIO_ENV = 0.25       # person_ratio < this → environmental, not shadow
    MODIFIER_CONF_LOW = 0.35      # modifier confidence < this → scoring point
    SCORE_DEFAULT = 3             # score threshold for normal images
    SCORE_NO_FACE = 4             # score threshold when face mesh unavailable


# ═══════════════════════════════════════════════════════════════════════════
# Gobo / Shadow Interruption Pattern  (reference_read.py)
# ═══════════════════════════════════════════════════════════════════════════

class GOBO:
    """Gobo shape and shadow interruption pattern thresholds."""

    CROSS_LINE_COUNT = 2          # line count == this → cross-shaped gobo
    GRID_MIN_LINE_COUNT = 4       # line count >= this → grid/window gobo
    SLIT_LINE_COUNT = 1           # line count == this → single-slit pattern
    SIP_PARALLELISM_MARGINAL = 0.5  # parallelism < this → "possible" hedge
    BG_RATIO_CENTERED = 0.7      # bg_ratio > this → centered on-axis gobo


# ═══════════════════════════════════════════════════════════════════════════
# Confidence & Narrative  (reference_read.py)
# ═══════════════════════════════════════════════════════════════════════════

class CONFIDENCE:
    """Confidence thresholds for narrative hedging and reliability."""

    LOW = 0.3                     # confidence < this → strong hedge
    MODERATE = 0.6                # confidence < this → softer hedge
    RESOLVED_FLOOR_MIN = 4        # min resolved features to apply confidence floor
    FLOOR_NORMAL = 0.3            # confidence floor when features resolved
    FLOOR_GOBO = 0.50             # confidence floor for confirmed gobo setups
    ALTERNATE_THRESHOLD = 0.6     # below this → suggest alternate hypothesis


# ═══════════════════════════════════════════════════════════════════════════
# Genre & Mood Classification  (reference_read.py)
# ═══════════════════════════════════════════════════════════════════════════

class GENRE:
    """Genre signal count thresholds."""

    FASHION_SIGNALS_MIN = 2       # ≥ this → auto-classify as "fashion editorial"
    GLAMOUR_SIGNALS_MIN = 3       # ≥ this → add "glamorous" mood enrichment


# ═══════════════════════════════════════════════════════════════════════════
# Face Analysis  (cue_extraction.py)
# ═══════════════════════════════════════════════════════════════════════════

class FACE:
    """Face region analysis and nose shadow detection."""

    # ── Center region for nose shadow ──
    CENTER_START_PCT = 0.30       # face center starts at 30% from left
    CENTER_END_PCT = 0.70         # face center ends at 70%
    MIN_CENTER_WIDTH_PX = 10      # minimum center width for nose shadow analysis

    # ── Nose shadow sampling ──
    NOSE_SAMPLE_HEIGHTS = (0.40, 0.42, 0.44, 0.46, 0.48, 0.50, 0.52, 0.54)
    SHADOW_VALLEY_DARKNESS_PCT = 0.5  # darkness threshold (50% of face mean)
    LEFT_BOUNDARY_PCT = 0.47      # nose shadow left of this → left side shadow
    RIGHT_BOUNDARY_PCT = 0.53     # nose shadow right of this → right side shadow
    MIN_NOSE_VOTES = 3            # minimum votes for detection
    MIN_VOTE_RATIO = 0.5          # minimum proportion of votes

    # ── Vertical light angle ──
    VERTICAL_HIGH_THRESHOLD = 0.08   # relative brightness > this → high key light
    VERTICAL_LOW_THRESHOLD = -0.08   # relative brightness < this → low key light

    # ── Half-face brightness ──
    MIN_BRIGHTNESS_DIFF = 0.05    # minimum relative diff for directional classification

    # ── Pose-induced shadow ──
    CHIN_REGION_DIVISOR = 2       # face height divisor for chin region
    CHIN_SHADOW_DARKNESS = 0.25   # relative darkness threshold (25% of face mean)
    POSE_SEVERITY_MODERATE = 2    # ≥ this regions affected → moderate severity

    # ── Shadow interruption ──
    BBOX_PADDING_PCT = 0.2        # 20% padding around face bounding box
    MIN_PIXELS_FOR_LINES = 50     # min shadow pixels for line detection
    DILATION_KERNEL = 5           # kernel size for shadow boundary dilation
    MIN_LINE_LENGTH_DIVISOR = 6   # face width / this = min line length
    MIN_LINE_LENGTH_FALLBACK = 20


# ═══════════════════════════════════════════════════════════════════════════
# Separation & Transition  (cue_extraction.py)
# ═══════════════════════════════════════════════════════════════════════════

class SEPARATION:
    """Subject-background separation thresholds."""

    SHARP_DELTA = 0.3             # luminance delta > this → "sharp" separation
    GRADUAL_DELTA = 0.1           # luminance delta > this → "gradual"


class TRANSITION:
    """Highlight-to-shadow transition detection."""

    HISTOGRAM_BINS = 32
    PEAK_THRESHOLD = 0.03         # histogram peak threshold for bimodality
    MIN_PEAK_SEPARATION = 8       # min bin distance between peaks → sharp
    MIXED_STD_THRESHOLD = 0.15    # std > this with close peaks → mixed


# ═══════════════════════════════════════════════════════════════════════════
# Pose Detection  (vision_pipeline.py)
# ═══════════════════════════════════════════════════════════════════════════

class POSE:
    """Pose landmark visibility and geometry thresholds."""

    # ── Shoulder / angle ──
    SHOULDER_WIDTH_FRONT = 0.18   # shoulder width ratio > this → front-facing

    # ── Landmark framing ──
    SHOULDER_VIS_HEADSHOT = 0.3
    LOWER_VIS_HEADSHOT = 0.15
    HIP_VIS_FRAMING = 0.3
    KNEE_VIS_FRAMING = 0.2

    # ── Posture detection (full landmarks) ──
    HIP_VIS_POSTURE = 0.3
    KNEE_VIS_POSTURE = 0.3
    ANKLE_VIS_POSTURE = 0.25
    HIP_KNEE_SITTING_RATIO = 0.08

    # ── Posture detection (partial landmarks) ──
    PARTIAL_VIS = 0.25
    HIP_KNEE_SITTING_RATIO_PARTIAL = 0.10
    KNEE_ABOVE_HIP_VIS = 0.2

    # ── Mask-based framing ──
    V_EXTENT_FULL_BODY = 0.75
    V_EXTENT_HALF_BODY = 0.50
    LOWER_WIDER_SEATED = 1.15
    ASPECT_SEATED = 1.2
    ASPECT_STANDING = 1.8
    V_CENTER_SEATED = 0.55
    ASPECT_STANDING_BORDERLINE = 1.5
    H_EXTENT_FRONT_FACING = 0.35


# ═══════════════════════════════════════════════════════════════════════════
# Environmental Shadow Continuity  (cue_extraction.py)
# ═══════════════════════════════════════════════════════════════════════════

class ENVIRONMENT:
    """Natural vs artificial environment detection."""

    WARM_BIAS = 15                # warm bias > this → warm background
    TEXTURE_STD_ENV = 35          # bg texture std > this → environmental
    GREEN_DOMINANCE = 10          # green dominance > this → dappled foliage
    DAPPLED_STD_MIN = 30          # bg std > this for dappled classification
    ARTIFICIAL_STD_MAX = 20       # bg std < this → artificial light
    ARTIFICIAL_WARM_MAX = 10      # abs warm bias < this → artificial light


# ═══════════════════════════════════════════════════════════════════════════
# Line Detection / HoughLines  (cue_extraction.py)
# ═══════════════════════════════════════════════════════════════════════════

class HOUGH:
    """HoughLinesP and line geometry analysis parameters."""

    RHO = 1                       # pixel accuracy
    THETA_STEP_DEG = 1            # angular resolution in degrees
    THRESHOLD = 30                # accumulator threshold
    MAX_GAP = 10                  # maximum gap between segments

    # ── Parallelism / periodicity / pattern classification ──
    BODY_CONTOUR_PARALLELISM = 0.35
    BODY_CONTOUR_CROSS_SCORE = 0.25
    BODY_CONTOUR_PERIODICITY = 0.4
    PERPENDICULAR_TOLERANCE = 9   # ~20 degrees tolerance

    # ── Geometric bar classification ──
    GEO_BAR_PARALLELISM_MIN = 0.6
    GEO_BAR_MIN_LINES = 3
    GEO_BAR_INCONGRUENCE_MIN = 0.4

    # ── Patterned projection classification ──
    PATTERNED_PERIODICITY_MIN = 0.5
    PATTERNED_MIN_LINES = 4

    # ── Cross pattern classification ──
    CROSS_SCORE_MIN = 0.3
    CROSS_MIN_LINES = 2
    CROSS_INCONGRUENCE_MIN = 0.2

    # ── Generic multi-line classification ──
    MULTILINE_MIN_LINES = 5
    MULTILINE_INCONGRUENCE_MIN = 0.3

    # ── Unknown classification thresholds ──
    UNKNOWN_PARALLELISM = 0.5
    UNKNOWN_INCONGRUENCE = 0.5
    UNKNOWN_MIN_LINES = 2


# ═══════════════════════════════════════════════════════════════════════════
# Resolution Quality  (reference_read.py)
# ═══════════════════════════════════════════════════════════════════════════

class RESOLUTION:
    """Quality rating percentages for resolved analysis fields."""

    EXCELLENT = 90                # ≥ this % resolved → "excellent"
    GOOD = 75                     # ≥ this % → "good"
    FAIR = 50                     # ≥ this % → "fair"; else "limited"


# ═══════════════════════════════════════════════════════════════════════════
# Segmentation & Face Detection  (vision_pipeline.py)
# ═══════════════════════════════════════════════════════════════════════════

class SEGMENTATION:
    """Segmentation model thresholds."""

    PERSON_MASK_CONFIDENCE = 0.5  # min confidence for person segmentation
    PERSON_MASK_BLUR_KERNEL = 7   # median blur kernel for mask cleanup
    FACE_DETECTOR_CONFIDENCE = 0.5  # min detection confidence for face detector


# ═══════════════════════════════════════════════════════════════════════════
# K-Means Palette  (vision_pipeline.py)
# ═══════════════════════════════════════════════════════════════════════════

class PALETTE:
    """K-means palette extraction parameters."""

    DOWNSAMPLE_THRESHOLD = 20_000
    DOWNSAMPLE_COUNT = 20_000
    MAX_K = 8
    MAX_ITER = 20
    EPSILON = 1.0
    ATTEMPTS = 5

    # ── Per-region cluster counts ──
    SKIN_CLUSTERS = 4
    CLOTHING_CLUSTERS = 5
    BG_CLUSTERS = 5
