# Cue-Based Image Analysis Architecture

## Overview

NGW's image analysis uses a structured, cue-based pipeline to reverse-engineer lighting setups from photographs. Instead of jumping directly from pixels to pattern names, the system extracts 15 observable visual cues, then feeds them through a 4-stage inference pipeline before producing recommendations.

This approach provides:
- Explainable reasoning (each conclusion traces back to specific cues)
- Graceful degradation (missing cues reduce confidence, don't break analysis)
- Ambiguity expression (multiple hypotheses with ranked confidence)
- Special-case awareness (B&W, dappled light, pose interference)

## Pipeline Flow

```
image
  │
  ├── analyze_image_regions(return_masks=True)   [vision_pipeline.py]
  │     returns: masks, catchlights, face_box, palettes
  │
  └── extract_visual_cues()                       [cue_extraction.py]
        returns: VisualCueReport (15 optional cues)
              │
              └── run_cue_inference_pipeline()     [cue_inference.py]
                    ├── infer_geometry()        → GeometryInference
                    ├── infer_source_quality()  → SourceQualityInference
                    ├── infer_environment()     → EnvironmentInference
                    └── infer_setup_family()    → SetupFamilyInference
                          │
                          └── enriches LightingInference  [lighting_inference.py]
                                (confidence boost / gap fill / disagreement notes)
```

## Files

| File | Role |
|---|---|
| `engine/image_analysis_models.py` | 15 Pydantic cue models + VisualCueReport + 4 inference dataclasses |
| `engine/cue_extraction.py` | 15 extraction functions + `extract_visual_cues()` orchestrator |
| `engine/cue_inference.py` | 4-stage inference + `run_cue_inference_pipeline()` |
| `engine/vision_pipeline.py` | `analyze_image_regions(return_masks=True)` exposes raw masks |
| `engine/lighting_inference.py` | Cue enrichment block in `infer_lighting_from_vision()` |
| `engine/image_analysis.py` | Wiring in `describe_image()` |
| `tests/test_visual_cues.py` | Tests for models, extraction, inference, integration |

## The 15 Visual Cues

Each cue is a Pydantic model with a `confidence` float and optional `notes` list.

| # | Cue | What it observes |
|---|---|---|
| 1 | ShadowEdgeHardness | Hard/soft/mixed shadow edges via Canny density |
| 2 | PrimaryShadowDirection | Left/right face brightness asymmetry |
| 3 | VerticalLightAngle | Upper vs lower face brightness → high/eye/low |
| 4 | CatchlightPosition | Per-eye clock positions (from existing catchlight data) |
| 5 | CatchlightShape | Round/rectangular/octagonal (from existing data) |
| 6 | HighlightToShadowTransition | Gradual vs sharp brightness transitions |
| 7 | ContrastRatio | Numeric ratio + low/medium/high/extreme label |
| 8 | SubjectBackgroundSeparation | Luminance delta at person mask boundary |
| 9 | BackgroundIllumination | Even/gradient/spot/dark via background quadrant analysis |
| 10 | SpecularHighlightBehavior | High-brightness pixel density and spread |
| 11 | ReflectionArchitecture | Catchlight count per eye + symmetry score |
| 12 | MultiShadowDetection | Shadow cluster count in dark regions |
| 13 | EnvironmentalShadowContinuity | Natural light indicators (color temp, texture, dappled foliage) |
| 14 | PoseInducedShadowInterference | Chin/body shadow detection below face |
| 15 | TonalProcessingEstimation | B&W, high-contrast grading, film look flags |

Cues 4, 5, and 11 repackage existing catchlight data — no new CV work. The others use masked histogram analysis, edge detection, and region comparison.

## 4-Stage Inference

### Stage 1: GeometryInference
From shadow direction, vertical angle, multi-shadow detection, and catchlight positions → key light direction, height, light count estimate, fill detection, shadow pattern name.

### Stage 2: SourceQualityInference
From shadow edge hardness, highlight behavior, catchlight shape, transition rate → modifier family (softbox, beauty_dish, umbrella, hard_source, ambient), transition character.

### Stage 3: EnvironmentInference
From background illumination, environmental shadows, tonal processing, contrast ratio → natural vs studio, environment type, background treatment, special cases.

**Special cases detected:**
- `dappled_foliage` — green-dominant background with high texture variance
- `direct_sunlight` — hard shadows + natural indicators
- `bw_processing` — grayscale image, color cues unreliable
- `high_contrast_grade` — heavy post-processing
- `pose_shadow_interference` — chin/body shadows may be misattributed to lighting

### Stage 4: SetupFamilyInference
Combines all three prior stages → primary hypothesis with confidence, ranked alternates, ambiguity notes, recommendation hints.

**Setup families scored:** single_key_rembrandt, clamshell_beauty, triangle_headshot, edge_lit_dramatic, flat_even, natural_ambient, single_hard_dramatic.

## Enrichment Strategy

The cue pipeline does **not** replace existing catchlight-based inference. It enriches it:

1. **Agreement boost** — If cue and catchlight patterns match, confidence increases by up to +0.15
2. **Gap fill** — If catchlights give "unknown" but cues have a hypothesis, use it at 0.6× confidence
3. **Disagreement notes** — Catchlight result kept, cue alternative recorded in notes
4. **Modifier enrichment** — When catchlights can't determine modifier but cue source quality can

## Graceful Degradation

- Every cue in VisualCueReport is `Optional` — the report is valid with 0 cues
- Each extraction function is wrapped in try/except in the orchestrator
- `cues_computed` tracks how many cues populated successfully
- `overall_confidence()` is a weighted average of only populated cues
- If no masks available, only catchlight-repackaging cues (4, 5, 11) are extracted

## Next Steps

Architecture is in place. Extraction accuracy improvements to prioritize:

1. **Shadow edge hardness** — Tune Canny thresholds per skin tone; current thresholds are conservative
2. **Multi-shadow detection** — Add connected-component angular spread analysis for light count
3. **Primary shadow direction** — Use facial landmarks for more precise face-half splitting
4. **Background illumination** — Add gradient direction detection (not just uniformity)
5. **Pose interference** — Extend beyond chin shadows to arm/hand/hair shadows
6. **Specular highlights** — Differentiate skin specular from modifier reflection
7. **Cross-cue validation** — Use cue agreement/disagreement to refine per-cue confidence
8. **Benchmark suite** — Curated test images with known lighting setups for accuracy measurement
