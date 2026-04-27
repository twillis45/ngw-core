# ENGINE_TRUTH.md — Official Inference Pipeline & Rules

> Control document. Last audited: 2026-04-17
> This file is the single authoritative reference for how the NGW engine
> processes images and produces lighting analysis. Any code change that
> contradicts this document requires updating the document first.

---

## 1. Official Pipeline Stages

The engine pipeline as currently implemented in `engine/orchestrator.py` (`analyze_image`):

```
Layer 0 — Mode Pre-Read            _layer0_mode_preread()
  -> mode_flags: no_face, is_bw, is_hcg, scene_type

Layer 1 — CV Signals               describe_image() + run_extended_pipeline()
  -> cue_extraction                engine/cue_extraction.py
  -> vision_pipeline               engine/vision_pipeline.py
  -> vision_passes (30+ signals)   engine/vision_passes.py
  -> VisualCueReport (cue_report)

Stage 1 — Definitive Signatures    _stage1_definitive_signatures()
  -> Short-circuits to pattern BEYOND DOUBT before Layer 2
  -> Sets result.definitive_pattern (immutable — no downstream override)

Layer 2 — Lighting Inference       infer_lighting_from_vision()
  -> pattern, modifier, light_count from catchlight topology
  -> Definitive-pattern light_count override applied immediately after

Layer 3 — Cue Inference            run_cue_inference_pipeline()
  -> geometry -> source_quality -> environment -> setup_family

Layer 4 — Solver Chain             _run_solver_chain()
  -> pass_weights -> consensus -> consistency -> contradictions
  -> re-consensus if contradictions exist

Layer 5 — Reference Read           reference_read()
  -> three-layer analysis (lighting_read, scene_context, image_read)
  -> Contributes highest-priority candidate to resolve_pattern_candidates()

Layer 6 — Pattern Resolution       resolve_pattern_candidates()
  -> Ranked candidates: reference_read > lighting_inference > cue_inference > light_structure
  -> Signal contradiction demotion + cascade demotion
  -> All-classifiers-demoted → ambiguity_fallback → "unknown"
  -> Sole-survivor confidence lift (light_structure only)

Post-Resolution Corrections        (inline in analyze_image, after Layer 6)
  -> Pattern-specific upgrades (butterfly→clamshell, loop→triangle, etc.)
  -> Overfill flat override
  -> Pose resolver (broad/short disambiguation from face_orientation)
  -> Specialty pattern classification (high_key, low_key, window_portrait, etc.)

Perception Layer                   _compute_perception_layer()
  -> face_validation, signal_reliability, edge_case_flags, perception_explanation

Light Count Post-Processing        (inline, after perception layer)
  -> Pattern-physics floors/caps (clamshell ≥2, butterfly =1, ring_light =1, etc.)
  -> Catchlight floor (never lowers; exempt: definitive patterns)
  -> VLM background light floor
  -> General sanity cap ≤4
```

---

## 2. Expert Deconstruction Analysis Order

**This ordering is MANDATORY.** Never violate it.

```
0.  mode pre-read
1.  definitive signature checks
2.  global tonal / environment read
3.  catchlight position → key direction   ← catchlights are PRIMARY for direction
4.  catchlight shape → key elevation
5.  core facial pattern resolution        ← informed by catchlight-confirmed direction
6.  multi-light structure (catchlight count + topology)
7.  fill analysis
8.  light quality / modifier evidence (catchlight shape + size)
9.  catchlight cross-audit                ← formal consistency check vs shadow/highlight
10. separation / accent lights
11. background treatment
12. source_context / environment
13. pose-relative correction  ← pose resolver fires here
14. setup_family inference
15. blueprint / reconstruction synthesis
```

**Permanent ordering rules:**
- **Catchlights before pattern**: catchlight position determines key direction;
  key direction determines pattern. A catchlight at 10 o'clock = off-axis key = loop,
  not butterfly/clamshell. Never resolve pattern without checking catchlight position first.
- Geometry first; semantic hints only after physical grounding
- Pattern before `setup_family`; pattern before `source_context`
- Broad/short requires pose confidence ≥ 0.65 (face_orientation.confidence)
- Unknown direction is not on-axis
- Upper catchlights support key elevation; lower catchlights are fill/reflector evidence
- Catchlight position is the strongest single key-direction signal — it overrides
  shadow-geometry direction when they conflict (shadow geometry can be confused by
  face angle; catchlights reflect physical light position directly)

---

## 3. Stage 1 Definitive Signatures

Patterns set at Stage 1 are determined BEYOND DOUBT from a single physical feature.
They are set on `result.definitive_pattern` before Layer 2 and **cannot be overridden** by any downstream classifier, resolver, or VLM hint.

| Pattern | Trigger | Physical Basis |
|---------|---------|----------------|
| `ring_light` | Annular donut catchlight in both eyes | Ring's circular emission creates characteristic hollow oval |
| `silhouette_key` | No catchlights + full_shadow + bright background | Single backlight — no front-facing source |
| `rim` | `separation_light.has_rim_light` + full_shadow + dark background | Single edge/separation source |
| `triangle` | ≥3 distinct catchlights forming triangle geometry | Hurley triangle — key + fill + hair/rim |

### Definitive Light Counts

When Stage 1 fires, the light count is set from physics, not from catchlight deduplication:

| Pattern | Authoritative Count |
|---------|---------------------|
| `ring_light` | 1 |
| `silhouette_key` | 1 |
| `rim` | 1 |
| `triangle` | 3 |

These patterns are **exempt from the catchlight floor** (line ~4210 in orchestrator.py). The catchlight floor never overrides a definitive light count.

---

## 4. Pattern Classification Precedence

`resolve_pattern_candidates()` ranks candidates by source priority, then applies contradiction demotion:

| Priority | Source | File | Role |
|----------|--------|------|------|
| 0 | `reference_read` | `engine/reference_read.py` | Richest 3-layer geometry analysis |
| 1 | `lighting_inference` | `engine/lighting_inference.py` | Catchlight topology (hardware signal) |
| 2 | `cue_inference` | `engine/cue_inference.py` | Shadow direction + elevation geometry |
| 3 | `light_structure` | `engine/vision_passes.py` | Nose-shadow CV geometry (confirmation only) |

VLM output is **semantic hinting only** — it never enters as a ranked candidate. It may apply a confidence boost when it agrees with the CV primary.

### Contradiction Demotion Thresholds

| Source | Threshold | Notes |
|--------|-----------|-------|
| `reference_read` | 0.60 | Lowest — richest analysis, strictest demotion standard |
| `cue_inference` (independent) | 0.70 | Between RR and LI |
| `lighting_inference` | 0.80 | Highest — most reliable hardware signal |
| `light_structure` | 0.70 | Secondary confirmation; pushed to priority 4 when demoted |

### Triangle Isolation Contradiction (added 2026-04-17)

`triangle_isolation` from `light_structure` (percentile-based cheek brightness spread) contradicts both **loop** and **split** when the value indicates a Rembrandt triangle:

| Pattern | Threshold | Score | Rationale |
|---------|-----------|-------|-----------|
| `loop` | tri_iso > 0.80 | +0.70 | Definitive triangle — loop has no connected cheek triangle |
| `loop` | tri_iso > 0.40 | +0.45 | Moderate triangle evidence |
| `split` | tri_iso > 0.80 | +0.60 | Split has uniformly dark shadow side — no bright patch |
| `split` | tri_iso > 0.40 | +0.40 | Moderate triangle evidence |

These rules fire independently of `shadow_continuity` — they use different detection methods (percentile spread vs connected-component analysis) and must not gate each other.

**Dark skin fix**: `extract_light_structure()` previously rejected valid pipeline data because `light_structure_pass` does not set `"ok": True` in its output dict. Fixed to check `"ok" is not False` instead of `get("ok", False)`. Without this fix, `cue_report.light_structure` was never populated, and all triangle_isolation contradiction rules silently failed.

### Clamshell Reality-Check Guards (P6)

Applied inside `reference_read.build_lighting_read()` before the pattern is emitted. `reference_read` operates at priority 0, so these guards must mirror the equivalent checks in `cue_inference` — they cannot be overridden downstream.

| Guard | Condition | Action |
|-------|-----------|--------|
| Guard A — Pose | `face_orientation.confidence ≥ 0.65` AND `broad_side` known (face turned) | `shadow_pattern = "unknown"` |
| Guard B — BW + unknown direction | `is_bw == True` AND `key_light_direction in ("unknown", "")` | `shadow_pattern = "unknown"` |
| Guard C — Topology-only lateral key | `geometry.shadow_pattern in ("unknown", "")` (no shadow-direction corroboration) AND `key_light_direction in {"left", "right", "lower_left", "lower_right"}` | `shadow_pattern = "unknown"` |

Guard C closes a specific gap: when `lighting_inference`'s vertical-topology detection assigns "clamshell" (2-light upper+lower catchlight signature) and `geometry.shadow_pattern` is "unknown" (cue_inference shadow-direction analysis produced no pattern), a clearly lateral key direction makes clamshell physically impossible — the key cannot produce under-chin fill shadow geometry from ≥90° off-axis. Setting the pattern to "unknown" causes the orchestrator's resolver filter (line 1729/1731: `sp != "unknown"`) to skip this candidate and let cue_inference's geometric answer win.

**Not blocked by Guard C**: keys at `top_center`, `upper_left`, `upper_right` — these are legitimate clamshell positions (overhead and near-overhead). Guard C only fires for strictly horizontal or below-horizontal keys.

### Cascade Demotion

When `reference_read` is demoted for pattern X, any other source that independently agrees on X AND passes the same contradiction test is also demoted. All demoted sources are pushed to priority 4 (below `light_structure` at 3).

### All-Classifiers-Demoted → Ambiguity Fallback

When **all three high-priority classifiers** (reference_read, lighting_inference, cue_inference) are independently demoted **and** `light_count == 0` (no catchlight physical evidence):

→ Pattern is overridden to `"unknown"` with source `ambiguity_fallback`, confidence 0.3, cue `all_classifiers_demoted`.

This prevents forcing a geometric pattern on genuinely ambiguous scenes (mixed ambient/flash, multiple contradicting sources).

---

## 5. VLM Safety Constraints

### Rule: VLM Must Not Override Physics

The VLM (`engine/vlm.py`) is scoped to subject/scene description only. It is **semantic enrichment**, not authoritative classification.

- VLM output never enters `resolve_pattern_candidates()` as a ranked candidate
- VLM may add a convergence confidence boost (+0.05 max) when it agrees with the CV primary
- VLM may raise `light_count` by +1 when `background_light_present=True` (VLM background light floor) — but only raises, never lowers; exempt: ring_light
- Conflicts produce `VLWReconciliation` record for human review

**Describe VLM output as "hint" or "enrichment" — never as "confirmed" or "detected".**

---

## 6. Light Count Post-Processing Rules

All rules run in this order after pattern resolution. Later rules can override earlier ones **except** definitive-pattern overrides (which fire at Layer 2 and are exempt from the catchlight floor).

| Rule | Condition | Action |
|------|-----------|--------|
| Signal-based butterfly correction | `authoritative_pattern == butterfly` AND `sd < 0.15` AND `lr < 0.10` AND `lc > 1` | Force `lc = 1` |
| High-key/flat catchlight floor | Pattern in (`high_key`, `flat`) AND `lc < 2` AND symmetric multi-source catchlights confirmed | Raise to `lc = 2` |
| High-key shadow cap | `authoritative_pattern == high_key` AND `lc > 2` AND `sd < 0.1` | Cap to `lc = 2` |
| Athletic rim sculpt minimum | `authoritative_pattern == athletic_rim_sculpt` AND `lc < 2` | Raise to `lc = 2` |
| Clamshell minimum | `authoritative_pattern == clamshell` AND `lc < 2` | Raise to `lc = 2` (clamshell is physically key + fill) |
| Ring light fixed | `authoritative_pattern == ring_light` | Force `lc = 1` (always single source) |
| Catchlight floor | `authoritative_pattern` not in definitive set AND `cl_inferred_count > lc >= 2` AND `cl_inferred_count ≤ 4` | Raise to cl_inferred_count |
| VLM background light floor | `background_light_present == True` AND pattern ≠ ring_light AND `0 < lc < 4` | Raise `lc` by 1 |
| Sanity cap | `lc > 4` | Cap to geo_lc (if available and ≤ 4), else cap to 4 |

---

## 7. Pose Resolver

### Purpose

Broad and short are face-pose-relative patterns — the shadow geometry is identical. Only the relationship between key light direction and face turn direction disambiguates:

- **Broad**: key is on the side the face is turned **toward** (broader/larger area of face visible to camera)
- **Short**: key is on the side the face is turned **away from** (narrower side)

### Data Source

`cue_report.face_orientation` (`FaceOrientation` object, computed in `cue_extraction.py`):

| Field | Type | Values |
|-------|------|--------|
| `yaw` | float | -1.0 to +1.0 (negative = face left, positive = face right) |
| `yaw_label` | str | `frontal` \| `slight_left/right` \| `moderate_left/right` \| `significant_left/right` |
| `broad_side` | str | `"left"` \| `"right"` \| `"unknown"` — image direction where key = broad |
| `short_side` | str | `"left"` \| `"right"` \| `"unknown"` |
| `confidence` | float | 0.0 (frontal) → 0.45 (slight) → 0.65 (moderate) → 0.80 (significant) |

### Guard Conditions (all must pass)

1. `face_orientation.confidence >= 0.65` (moderate or significant turn; frontal is indeterminate)
2. `key_side` is resolved to `"left"` or `"right"` (normalized from `upper_left`/`upper_right`/etc.)
3. Scene is studio-controlled (`controlled_background` in env_hints) OR `|yaw| >= 0.40`
4. `authoritative_pattern` in eligible set: `{butterfly, loop, rembrandt, split, low_key}`

### Reclassification

- `key_side == broad_side` → upgrade to `"broad"`, cue `pose_resolver:broad`
- `key_side == short_side` → upgrade to `"short"`, cue `pose_resolver:short`

### Limitations

- Requires face detection (MediaPipe landmarks). No face → no pose data → resolver does not fire.
- Extreme low-key portraits with face angled down may have `face_orientation = None`.
- Legacy yaw-magnitude rules (`split → broad` when `|yaw| > 0.2`, `rembrandt → short` when `|yaw| > 0.5`) are retained for studio cases where key_side is unresolved.

### API Surface

- `analysis_result_to_replay_dict()` → `face_orientation` dict
- `build_reference_description()` → `poseOrientation` dict (camelCase)

---

## 8. High-Key Detection Logic

High-key has four independent detection paths (in priority order):

1. **Mood path** (primary): `mood == "high_key"` AND `base not in ("unknown", "clamshell")` AND not 3-light AND no directional shadow AND not overfill → `return "high_key"`

2. **Bright-background fallback** (loop/butterfly/broad): `bg_bright` AND `brightness in ("high", "very_high")` AND `base in ("loop", "butterfly", "broad")` AND no directional shadow AND not 3-light → `return "high_key"`

3. **Clamshell in bright environment**: `bg_bright` AND `brightness in ("high", "very_high")` AND `base == "clamshell"` AND `light_count >= 4` AND no off-axis key → `return "high_key"` (lc ≥ 4 filters genuine triangle setups)

4. **Pixel-evidence fallback**: `bg_bright` AND `base in ("clamshell", "butterfly", "flat")` AND `shadow_density < 0.06` AND `fill_ratio > 0.95` → `return "high_key"` (no 3-light guard — base check already excludes triangle; sd + fr signals are stronger diagnostic than catchlight count)

### Overfill Guard

`_hk_is_overfill = shadow_density < 0.03 AND fill_ratio > 0.95`

When overfill is detected, paths 1 and 4 are blocked. Overfill (flat multi-source setup with excessive fill) and high_key have identical mood signals but differ by background: overfill has neutral bg, high_key has blown-white bg.

---

## 9. Benchmark Suite Status

| Date | PASS | SOFT | FAIL | Unique Fixtures | Notes |
|------|------|------|------|-----------------|-------|
| 2026-03-16 | — | — | — | — | Baseline (no benchmarks) |
| 2026-04-12 | 27 | 1 | 0 | 28 | After full tightening sprint |
| 2026-04-19 | 45 | 11 | 0 | 56* | *56 entries included 14 duplicate rembrandt_t1 IDs — actual unique = 42 |
| 2026-04-26 | 33 | 9 | 0 | 42 | After NGW-45 Guard C + beauty_clamshell fix; deduplication corrected |

### Remaining SOFT (9)

Current SOFT_PASS fixtures are within acceptable_patterns but did not hit the primary expected value. All are pre-existing instabilities — none introduced by the 2026-04-26 engine changes.

Key chronic soft cases: `short_fashion_key` (no face in dark portrait), `high_key` (blown-highlights light-count instability), `window_negative_fill`, `white_seamless_catalog`, `rembrandt_color_editorial_blonde_ocean`, `rembrandt_bw_man_short_light_turned`.

### Removed Benchmarks (not geometric patterns)

The following were removed because they test setup_family / mood / technique — not geometric lighting patterns:

- `corporate_soft_key` — setup_family (corporate portraiture technique)
- `weak_catchlight` — signal condition (low catchlight intensity)
- `golden_hour` — mood (outdoor warm tonal condition)
- `reflector_fill` — technique (reflector as fill modifier)

---

## 10. Dark Skin / Low-Contrast Adaptations (added 2026-04-17)

### FaceLandmarker CLAHE Boost

`vision_pipeline.py` applies CLAHE (Contrast Limited Adaptive Histogram Equalization) to the face crop before FaceLandmarker when the crop's mean luminance is below 80. This lifts shadow detail without blowing highlights, giving the landmark model more gradient signal on dark skin against dark backgrounds.

- Applied in LAB color space (L channel only) — preserves hue/saturation
- `clipLimit=2.5, tileGridSize=(8, 8)` — moderate boost, avoids artifacts
- Face crop padding increased from 20% → 25% for additional context

### Adaptive Catchlight Detection

- V threshold: bright images (p99 > 200): `max(floor, p99 * 0.92)`; dark images (v_mean < 80): `max(80, p99 * 0.70)`; normal: floor
- Adaptive S max: `80 + int((100 - v_mean) * 1.2)` when v_mean < 100
- Morph opening skipped when iris radius < 25px (small catchlights destroyed)
- Relaxed proximity and size ratio for small irises (radius < 30)
- Lower-hemisphere catchlights kept when min(left_r, right_r) < 30

### Triangle Detection for Dark Skin

- Percentile-based triangle: `p75/p25 spread > 0.15 AND bright_vs_jaw > 0.10`
- Split-branch triangle check: when |L-R| > 0.5, checks for triangle before classifying as split
- Dark skin fallback: strong asymmetry + shadow_strong as triangle evidence
- Shadow connectivity relaxed for dark skin (face_mean < 75)

---

## 11. Data Architecture

| Source | Count | Purpose | Keyed On |
|--------|-------|---------|----------|
| `data/lighting_systems.json` | 47 | Gear-centric recommendation database | (gear_profile, modifier_family, environment) |
| `data/systems/canonical/*.yml` | 19 | Pattern-centric geometric light placements | Named pattern (clamshell, rembrandt, etc.) |
| `benchmarks/*.json` | 28 | Ground truth for engine regression testing | benchmark_id |
| `data/gold_set/manifest.json` | 29 | Learning pipeline ground truth manifest | id |

---

## 11. Field Naming Convention

| Field | Where Used | Convention |
|-------|-----------|------------|
| `pattern` | LightingInference, DiagramSpec, PatternCandidate | **Preferred for new code** |
| `shadow_pattern` | cue_inference, reference_read | Legacy name |
| `pattern_name` | LightingHypothesis (solver) | Solver convention |
| `authoritative_pattern` | AnalysisResult | Resolved single pattern — post all corrections |

New code should use `pattern`. Legacy code should be migrated when touched.

---

## 12. Taxonomy Boundaries (TX Rule)

These three concepts are **strictly orthogonal** — never mix them as peer pattern outputs:

| Concept | Field | Examples |
|---------|-------|---------|
| `pattern` | `authoritative_pattern` | loop, rembrandt, butterfly, clamshell, broad, short, high_key, low_key, rim, triangle, ring_light, split, flat, projected, window_portrait, athletic_rim_sculpt, tabletop_soft_product |
| `setup_family` | `setup_family` (cue_inference output) | clamshell_beauty, three_point_studio, corporate_soft_key, rembrandt_dramatic |
| `source_context` | `source_context` | natural_window, studio_strobe, continuous_led, outdoor_sun |

`setup_family` and `source_context` are resolved **after** `authoritative_pattern` is settled. They must not appear as candidate patterns in `resolve_pattern_candidates()`.

---

## 13. LightingRead Fill Fields (NGW-50)

`LightingRead` (the output object emitted by `reference_read.build_lighting_read()`) includes two fill-related fields:

| Field | Type | Values | Notes |
|-------|------|--------|-------|
| `fill_presence` | str | `none` \| `subtle` \| `moderate` \| `strong` \| `unknown` | Estimated fill intensity from shadow ratios |
| `fill_direction` | str | `below` \| `camera-left` \| `camera-right` \| `camera-axis` \| `none` \| `unknown` | Geometric position of fill light |

### fill_direction Derivation Logic

Computed by `_derive_fill_direction(shadow_pattern, key_direction, fill_presence)` in `reference_read.py`:

| Condition | fill_direction |
|-----------|---------------|
| `fill_presence == "none"` | `"none"` |
| `fill_presence in ("unknown", "")` | `"unknown"` |
| `shadow_pattern` contains "clamshell" | `"below"` (under-chin reflector/softbox) |
| `shadow_pattern` contains "butterfly" | `"below"` (Paramount fill is always below key) |
| `key_direction == "upper_left"` | `"camera-right"` |
| `key_direction == "upper_right"` | `"camera-left"` |
| `key_direction == "left"` | `"camera-right"` |
| `key_direction == "right"` | `"camera-left"` |
| `key_direction == "lower_left"` | `"camera-right"` |
| `key_direction == "lower_right"` | `"camera-left"` |
| `key_direction == "top_center"` | `"camera-axis"` |
| `shadow_pattern` in (`flat`, `ring_light`, `high_key`) | `"camera-axis"` |
| fallback | `"camera-axis"` |

Physical rationale: fill always comes from the opposite side of the key for directional patterns (reduces key shadows). For clamshell/butterfly, the fill is a below-chin reflector regardless of key direction. For non-directional patterns (flat, ring, high_key), fill is frontal/on-axis.

## 14. Mode Routing — Complex-Lighting Strategy Phase 1+

After the perception layer runs, `route_analysis_mode()` decides the analysis's *answer shape*. **Mode is the headline output**; pattern resolution becomes mode-conditional content. Pattern fields (`authoritative_pattern`, `pattern_candidates`, `pattern_status`) are **unchanged by routing** — mode is additive metadata.

### 14.1 Doctrine

- **Mode before pattern.** Reporting, workflow, and recreation strategies are mode-conditional. Pattern naming serves mode-conditional content, not the headline.
- **Mode is mutually exclusive; evidence factors are not.** A scene's evidence factors (multi-source, ambiguity, low signal, etc.) routinely co-exist. The router picks the highest-precedence mode whose gate fires; lower-mode evidence is preserved in `pattern_candidates.alternates` and `pattern_candidates.contradictions` for downstream consumers. Modes describe *the engine's response shape*, not *categories of the scene itself*.
- **Mode-confidence is not pattern-confidence.** Three confidence concepts exist and must not be conflated: `mode_confidence` (router certainty in mode), `candidate_credibility` (per-pattern credibility for BOUNDED, Phase 3), `contribution_confidence` (per-LightContribution belief for HYBRID, Phase 3). Phase 1 introduces only `mode_confidence`.
- **No `pattern_confidence` in mode routing.** The mode router must not consume pattern_confidence. Mode routing inputs are `face_validation`, `signal_reliability`, `pattern_status`, `authoritative_pattern_source`, and (in Phase 3) `ComplexityProfile`.

### 14.2 Router precedence

```
INSUFFICIENT > HYBRID > BOUNDED > CLASSICAL
```

Higher-precedence modes have hard gates evaluated against the available signals; lower modes are fallthrough.

### 14.3 Phase 1 + 3A gates (current)

| Gate | Condition | Source |
|------|-----------|--------|
| INSUFFICIENT | `not face_validation.face_detected` | `_compute_face_validation` |
| INSUFFICIENT | `face_validation.face_quality == "poor"` | `_compute_face_validation` |
| INSUFFICIENT | `signal_reliability.overall_signal_strength < 0.40` | `_compute_signal_reliability` |
| INSUFFICIENT | `complexity_profile.catchlight_reliability == "blocked"` | `compute_scene_complexity` (Phase 3A; mostly redundant with no_face today) |
| HYBRID | `complexity_profile.load_bearing_source_count >= 2` AND ≥ 1 corroborator from {`rim_load_bearing`, `ambient_contamination >= 0.5`, `shadow_conflict_score >= 0.50` with reliable catchlight} | Phase 3A — strict |
| BOUNDED (long-term) | top-2 candidates: both classical, *different patterns*, primary ≥ 0.35, top-alt ≥ 0.50, spread ≤ 0.15 | Phase 3A — partial (raw confidence as credibility proxy) |
| BOUNDED (bootstrap) | `pattern_status == CONTESTED` AND `"_demoted" in source` AND `len(alternates) >= 1` | TEMPORARY — resolver mechanics |
| CLASSICAL | fallthrough | — |

The 0.40 `signal_strength` floor was confirmed via threshold sweep (`engine.benchmark_v2.threshold_sweep`) to sit in the middle of a stable [0.30, 0.50] plateau on the current 42-benchmark corpus.

**Phase 3A HYBRID gate corroborators (strict — empirical refinement):**
`multi_catchlight_topology` (cluster_geometry: triangular/linear/strip) was originally proposed as a corroborator but found empirically too noisy on existing CV — clean Rembrandt with a small fill reads `linear`/`triangular`, ring lights read `strip`. Topology stays on `ComplexityProfile` for observability but is **not** consumed by the HYBRID gate in Phase 3A. Phase 3B will rebuild a topology trigger using intensity-relative signals from `catchlight_intelligence`.

**Phase 3A long-term BOUNDED predicate (strict):**
- Top-2 candidates must NAME DIFFERENT PATTERNS (same-pattern-twice is confirmation, not ambiguity — strongest CLASSICAL signal).
- Both candidates must be in `_CLASSICAL_BOUNDED_SET = {loop, butterfly, clamshell, rembrandt, split, broad, short, flat, high_key, low_key, triangle}`.
- Primary confidence ≥ 0.35; top-alternate ≥ 0.50; spread ≤ 0.15.
- INSUFFICIENT and HYBRID gates must not have fired.

This uses raw confidence as a *credibility proxy*. Phase 3B replaces it with real photographic-evidence credibility scoring (which is independent of resolver-internal source-priority arithmetic). The proxy is documented in `route_analysis_mode()`'s docstring.

### 14.4 BOUNDED bootstrap — STILL TEMPORARY (Phase 3A retains as fallback)

Phase 3A added a long-term BOUNDED predicate (§14.3) that fires before the bootstrap. The bootstrap is preserved as a fallback for cases the long-term doesn't reach yet:

- The bootstrap fires when `pattern_status == CONTESTED` AND `_demoted in source` AND `len(alternates) ≥ 1` AND the long-term predicate did NOT fire.
- It exists so Phase 1's catchable cases (4/42 benchmarks) don't silently drop out when the long-term predicate is too strict.
- Phase 3B retires the bootstrap entirely once real `candidate_credibility` scoring + key-direction agreement detection land.

### 14.5 Truthfulness rules in effect

- **`catchlight_reliability == "blocked"` is NOT a glasses detector.** Phase 3B / Phase 3C use an "unresolvable-catchlight-signal" detector that fires when the resolver produces a low-confidence demoted winner with many catchlights. This catches the glasses test case as one shape of contamination but also fires on mirror selfies, heavy reflective contamination, etc. Naming is honest throughout: variable `catchlight_unreliable`, reason `low_confidence_demoted_winner_with_many_catchlights`, test class `TestCatchlightUnreliabilityDetector`. A true glasses CV detector remains future work — would require image-bytes plumbing into the orchestrator OR new eye-region passes in `cue_extraction.py`.
- **`outcome_trust_risk` is a confident-wrong-winner detector, not a mixed-light classifier.** Phase 3C/B fires INSUFFICIENT when a high-confidence resolver winner from a clean source has weak cross-system support (single-classifier evidence), an active geometry-coherent counter-narrative, AND no catchlight-shadow paradox to anchor a BOUNDED interpretation. The catchlight-conflict gate is the empirical discriminator between this signature and legitimate two-credible-reads: tested on byte-identical-classifier-output pair (`mixed_light_failure` vs `blonde_ocean`), only the catchlight paradox flag distinguishes them.
- **CLA→BND borderlines (Phase 3C Workstream D) — accepted ambiguity.** Two benchmarks (`white_seamless_catalog`, `window_soft_side`) route BOUNDED via the long-term predicate but are photographer-tagged CLASSICAL. Inspection (`engine.benchmark_v2.inspect_borderlines`) confirms they produce **byte-identical engine signals to the confirmed-BOUNDED `bounded_loop_vs_short_rihanna_t1`**: same classical credibility list (loop @ 0.70 ev=2, short @ 0.60 ev=1), same gate states, same specialty-source resolver upgrade. Adding a `specialty:*` source guardrail would block all three uniformly — losing the rihanna BND hit alongside the FPs. The classifier disagreement (light_structure + lighting_inference vote loop; cue_inference votes short; reference_read applies a specialty upgrade) is real photographic ambiguity on turned-face / pose-relative scenes. The differential photographer tagging across the three is judgment-call variability, not engine error. **Decision: accept as borderline ambiguity.** No predicate change. Documented as photographer-re-review candidates if and when a curation pass revisits them.
- **Confidence ceiling for INSUFFICIENT.** When `analysis_mode == INSUFFICIENT`, `pattern_confidence` is capped at 0.70 regardless of resolver-internal arithmetic. Enforced post-routing in `analyze_image()`.
- **Pattern-status interaction.** When `analysis_mode == BOUNDED`, `pattern_status` is `CONTESTED` (driven by Pass 1's `_demoted`/`ambiguity_fallback` predicate). FUSED_FINAL on a BOUNDED result is forbidden by construction.
- **Catchlight-shadow paradox surfaces but does not yet override.** As of the Lane (b) fix, `LightingRead.contradictions` records the paradox when shadow direction and catchlight position disagree on horizontal key direction, and the resolver promotes it into `pattern_candidates.contradictions`. Acting on the signal — demoting shadow-direction-derived candidates per the catchlight-first doctrine — is queued for Phase 3.

### 14.6 Mode-conditional output (preserved + planned)

| Field | CLASSICAL | BOUNDED | HYBRID (Phase 3) | INSUFFICIENT |
|-------|-----------|---------|------------------|--------------|
| `authoritative_pattern` | the answer | leading candidate | dominant driver | best guess (capped 0.70) |
| `pattern_status` | FUSED_FINAL | CONTESTED | (Phase 3) | CONTESTED or UNKNOWN |
| `pattern_confidence` | meaningful | meaningful + alternates surfaced | dominant-driver only | capped 0.70 |
| `analysis_mode` | classical | bounded | hybrid | insufficient |
| `mode_confidence` | high (~0.85) | bootstrap modest (~0.70) | (Phase 3) | high (≥ 0.70) |
| `pattern_reasoning` | single-pattern statement | multi-candidate framing (Pass 1) | decomposition summary (Phase 3) | what's known + what's missing (Phase 3 UI) |

### 14.7 Phasing reference

| Phase | Status | Scope |
|-------|--------|-------|
| Phase 1 | **Live** | AnalysisMode router; INSUFFICIENT + bootstrap BOUNDED gates; CONTESTED status reorder; multi-candidate pattern_reasoning |
| Phase 2 | **Live** | Benchmark mode-tagging, mode confusion matrix, threshold sensitivity sweep, shadow-mode L1 telemetry emission |
| Phase 3A | **Live** | ComplexityProfile skeleton (existing signals only); compute_scene_complexity(); HYBRID gate strict + corroboration-required; long-term BOUNDED predicate (raw-confidence proxy); rim_load_bearing structural-evidence-only; placeholder axes carry not_yet_computed |
| Phase 3B | Queued | Real `candidate_credibility` scoring; per-contribution `contribution_confidence`; new CV detectors (multi-face, gels, post-processing risk, compositing, occlusion, crop completeness); `HybridDecomposition` data shape (LightContribution, BuildStep); catchlight-overrides-shadow doctrinal action; bootstrap BOUNDED retired |
| Phase 4 | Blocked on Phase 2 gate D (two-week shadow-mode observation) | Mode-aware UI: BOUNDED candidate cards, INSUFFICIENT result screen, HYBRID decomposition table |
| Phase 5 | Queued | Feedback architecture (per-mode signal mapping, decomposition corrections) |
| Phase 6 | Queued | Edge-case polish (window+strobe, gels, group, mirror, etc.) |

See `docs/TAXONOMY_TRUTH.md` for `AnalysisMode`'s relationship to `pattern`, `setup_family`, and `source_context`.
