# ENGINE_TRUTH.md -- Official Inference Pipeline & Rules

> Control document. Last audited: 2026-03-16
> This file is the single authoritative reference for how the NGW engine
> processes images and produces lighting analysis. Any code change that
> contradicts this document requires updating the document first.

---

## 1. Official Pipeline Stages

The engine pipeline as currently implemented in `engine/orchestrator.py`:

```
1. describe_image()           [engine/image_analysis.py]
   -> cue_extraction          [engine/cue_extraction.py]
   -> vision_pipeline         [engine/vision_pipeline.py]
   -> cue_report (VisualCueReport)

2. run_extended_pipeline()    [engine/vision_passes.py]
   -> 30+ signal passes (shadow, highlight, catchlight, etc.)
   -> pass_outputs dict

3. lighting_inference()       [engine/lighting_inference.py]
   -> pattern, modifier, light_count from catchlight topology

4. cue_inference_pipeline()   [engine/cue_inference.py]
   -> geometry -> source_quality -> environment -> setup_family
   -> 4-stage interpretive pipeline from VisualCueReport

5. solver_chain()             [engine/consensus_solver.py + friends]
   -> compute_pass_weights    [engine/signal_weights.py]
   -> compute_region_reliability
   -> solve_dominant_source   [engine/consensus_solver.py]
   -> score_consistency       [engine/consistency_engine.py]
   -> find_contradictions     [engine/contradiction_engine.py]
   -> apply_contradiction_feedback -> re-consensus
   -> extract_candidates
   -> build_solver_trace      [engine/solver_trace.py]
   -> SolverResult

6. reference_read()           [engine/reference_read.py]
   -> three-layer analysis (lighting_read, scene_context, image_read)

7. authoritative_pattern_resolution()  [engine/orchestrator.py]
   -> Priority: reference_read > lighting_inference > "unknown"
```

### Target Pipeline (not yet fully wired)

```
vision_passes -> cue_extraction -> cue_inference -> consensus_solver
  -> consistency_engine -> contradiction_engine -> selector
  -> rule_engine -> output_model
```

### Current Deviations from Target

| Gap | Description | Location |
|-----|-------------|----------|
| Missing `consistency_engine` in main flow | Consistency scores are computed inside solver chain but not surfaced as a gate | `orchestrator.py:_run_solver_chain` |
| No dedicated `rule_engine` stage | Scoring/selection happens in `selector.py` + `scoring.py` without a formalized rule engine stage | `engine/selector.py` |
| Cue inference runs AFTER lighting inference | Should run before so its output feeds the solver; currently both run independently | `orchestrator.py:analyze_image` lines 249-269 |
| `output_model` is a Pydantic schema, not a pipeline stage | No formal output assembly stage; routes assemble their own response shapes | `api/routes/shoot_match.py` |

---

## 2. Pattern Classification Precedence

Four classifiers exist. This is a known duplication. Precedence per `orchestrator.py` docstring:

| Priority | Classifier | File | Role |
|----------|-----------|------|------|
| 1 | `pattern_matcher.match_lighting_patterns()` | `engine/pattern_matcher.py` | Primary -- scores against vision pass outputs + cue report |
| 2 | `lighting_inference._infer_pattern_from_catchlights()` | `engine/lighting_inference.py` | Secondary -- catchlight topology analysis |
| 3 | `cue_inference._infer_shadow_pattern()` | `engine/cue_inference.py` | Tertiary -- shadow direction + height mapping |
| 4 | `patterns.classify_lighting_pattern()` | `engine/patterns.py` | Fallback -- rule-based from mood + modifier + gear |

### Authoritative Pattern Resolution (orchestrator.py)

```
1. reference_read.lighting_read.shadow_pattern  (richest context)
2. lighting_inference.pattern                    (vision-based)
3. "unknown"                                     (fallback)
```

**VIOLATION**: `shoot_match.py` line 737 falls back to `classify_lighting_pattern()` (priority 4 classifier) when the authoritative pattern is unavailable, bypassing the cue_inference classifier entirely.

---

## 3. Candidate-First Inference Requirement

### Required Flow

```
signals -> cues -> candidates -> validation -> contradictions -> ranking -> final decision
```

### Required Output Fields per Result

- `primary_candidate` -- top hypothesis with confidence
- `alternate_candidates` -- ranked alternatives
- `validation_scores` -- per-candidate physical consistency scores
- `contradictions` -- flagged conflicts across classifiers
- `confidence` -- composite score reflecting data quality and agreement
- `needs_review` -- boolean flag for human review

### Current Status

| Field | Implemented | Location |
|-------|------------|----------|
| primary_candidate | PARTIAL -- `SetupFamilyInference.primary_hypothesis` | `cue_inference.py` |
| alternate_candidates | YES -- `SetupFamilyInference.alternate_hypotheses` | `cue_inference.py` |
| validation_scores | MISSING -- no per-candidate validation scoring | -- |
| contradictions | YES -- `ContradictionReport` | `contradiction_engine.py` |
| confidence | YES -- multi-source composite | `scoring.py`, `solver_trace.py` |
| needs_review | YES -- `SolverResult.needs_review` | `solver_models.py` |

### Early Collapse Points

1. **`_infer_shadow_pattern()` in cue_inference.py** -- Returns a single pattern string, not candidates. When `light_count <= 2` and key_direction is `upper_left`, it immediately returns `"rembrandt"` without considering `loop` as an alternate.

2. **`_resolve_authoritative_pattern()` in orchestrator.py** -- Collapses to a single string. Discards all alternate hypotheses from cue_inference and solver.

3. **`shoot_match.py` pattern assignment (line 734-743)** -- Uses authoritative pattern OR fallback classifier; never exposes alternates to the UI.

4. **`lighting_inference._infer_pattern_from_catchlights()`** -- Returns one pattern, not a ranked list of candidates with confidence.

---

## 4. VLM Safety Constraints

### Rule: VLM Must Not Override Physics

The VLM (engine/vlm.py) is explicitly scoped to subject/scene description only. Per the VLM system prompt:

> "You extract signals only. A separate rule engine interprets these signals -- you must NEVER determine the final lighting setup, modifier type, or equipment."

### VLW Reconciliation Safety (engine/vlw_reconciliation.py)

The `reconcile_vlw()` function compares VLM hypotheses against CV evidence. Critical constraint documented in the module:

> "This module NEVER modifies LightingRead field values. The only automatic action is `apply_confirmed_boosts()` which exclusively adjusts the confidence float."

### Current Compliance

- VLM `lighting_style` field IS used for reconciliation comparison but never overrides CV values -- **COMPLIANT**
- `apply_confirmed_boosts()` only adjusts confidence, never field values -- **COMPLIANT**
- Conflicts produce `VLWReconciliation` report for human review -- **COMPLIANT**
- VLM description is surfaced to UI as enrichment data, not as authoritative lighting analysis -- **COMPLIANT**

---

## 5. Solver Chain Architecture

### Current Chain (orchestrator.py:_run_solver_chain)

```
pass_weights = compute_pass_weights(cue_report, vision_data)
region_reliability = compute_region_reliability(vision_data, scene_ctx, cue_report)
consensus = solve_dominant_source(pass_outputs, pass_weights, cue_inference)
consistency_scores = score_consistency(pass_outputs, pass_weights)
contradiction_report = find_contradictions(pass_outputs, cue_report, cue_inference)

IF contradictions exist:
    pass_weights = apply_contradiction_feedback(pass_weights, contradiction_report, consensus)
    consensus = solve_dominant_source(pass_outputs, adjusted_weights, cue_inference)   # re-run
    consistency_scores = score_consistency(pass_outputs, adjusted_weights)              # re-run

candidates = _extract_candidates(pass_outputs)
trace = build_solver_trace(consensus, pass_weights, contradiction_report, ...)
SolverResult assembled
```

### Key Design Decisions

- Solver chain ENRICHES existing data; it never replaces cue_inference or reference_read
- Contradiction feedback loop re-runs consensus with adjusted weights
- Pass weight floor: never below 15% of base weight (`_FEEDBACK_WEIGHT_FLOOR = 0.15`)
- Solver quality signals modulate recommendation confidence in scoring.py

---

## 6. Data Architecture (Two Non-Overlapping Sources)

| Source | Count | Purpose | Keyed On |
|--------|-------|---------|----------|
| `data/lighting_systems.json` | 47 | Gear-centric recommendation database | (gear_profile, modifier_family, environment) |
| `data/systems/canonical/*.yml` | 19 | Pattern-centric geometric light placements | Named pattern (clamshell, rembrandt, etc.) |

These two sources serve different pipeline stages and must not be merged or cross-referenced without explicit mapping logic.

---

## 7. Field Naming Convention

These four fields all refer to the same concept (lighting pattern):

| Field | Where Used | Convention |
|-------|-----------|------------|
| `pattern` | LightingInference, DiagramSpec | Preferred for new code |
| `shadow_pattern` | cue_inference, reference_read | Legacy name |
| `pattern_name` | LightingHypothesis (solver) | Solver convention |
| `authoritative_pattern` | AnalysisResult | Resolved single pattern |

New code should use `pattern`. Legacy code should be migrated when touched.
