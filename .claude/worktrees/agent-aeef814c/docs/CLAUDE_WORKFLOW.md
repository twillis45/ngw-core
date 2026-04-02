# CLAUDE_WORKFLOW.md -- Session Protocol, Work Lanes & Anti-Drift Rules

> Control document. Last audited: 2026-03-16
> This document governs how development sessions are conducted in this repo.
> All contributors (human and AI) must follow these rules.

---

## 1. Session Protocol

### Starting a Session

1. Read this file and `ENGINE_TRUTH.md` and `TAXONOMY_TRUTH.md`
2. Check `git status` for uncommitted changes
3. Identify which work lane(s) the task touches
4. Confirm no cross-lane violations before beginning
5. For multi-file changes, write a staged plan BEFORE editing

### Ending a Session

1. Run relevant tests (`pytest tests/` or specific test file)
2. Verify no new string-literal categories were introduced
3. Verify no route-level inference logic was added
4. Commit with clear message referencing the work lane

### Development Principle

> Measure twice, cut once. Audit before acting.
> Never refactor in the dark -- understand the pipeline flow before changing it.
> Small, focused changes that can be independently verified.
> When in doubt, write a test first.

---

## 2. Work Lanes

All repo work falls into exactly one of four lanes. Code changes that cross
lane boundaries require explicit justification and a staged plan.

### Lane 1: Engine Logic

**Scope**: Core inference pipeline, solvers, signal processing

**Files**:
- `engine/orchestrator.py` -- pipeline coordination
- `engine/cue_extraction.py` -- signal extraction from images
- `engine/cue_inference.py` -- 4-stage interpretive pipeline
- `engine/lighting_inference.py` -- catchlight/pattern analysis
- `engine/pattern_matcher.py` -- pattern scoring against database
- `engine/consensus_solver.py` -- weighted voting across passes
- `engine/consistency_engine.py` -- cross-pass agreement scoring
- `engine/contradiction_engine.py` -- conflict detection
- `engine/signal_weights.py` -- pass weight computation
- `engine/solver_trace.py` -- trace/debug output
- `engine/solver_models.py` -- solver data models
- `engine/solver_constants.py` -- solver thresholds
- `engine/vision_pipeline.py` -- image region analysis
- `engine/vision_passes.py` -- 30+ extended signal passes
- `engine/reference_read.py` -- three-layer reference analysis
- `engine/vlm.py` -- VLM integration
- `engine/vlw_reconciliation.py` -- VLM vs CV comparison
- `engine/image_analysis.py` -- describe_image entry point
- `engine/image_analysis_models.py` -- data models
- `engine/constants.py` -- centralized thresholds
- `engine/patterns.py` -- rule-based pattern classification
- `engine/scoring.py` -- system scoring
- `engine/selector.py` -- system selection/ranking
- `engine/diagram.py` -- diagram spec generation

### Lane 2: Taxonomy / Schema

**Scope**: Enum definitions, YAML taxonomy, data models

**Files**:
- `engine/enums.py` -- all enum definitions
- `data/taxonomy/*.yaml` -- taxonomy YAML files
- `data/lighting_patterns.json` -- pattern matching database
- `models/output_model.py` -- API output models
- `engine/image_analysis_models.py` -- internal data models
- `engine/solver_models.py` -- solver data models

### Lane 3: Dataset / LAB

**Scope**: Reference images, benchmark data, LAB pipeline

**Files**:
- `data/reference_dataset/` -- curated reference images
- `data/systems/canonical/*.yml` -- canonical system definitions
- `data/lighting_systems.json` -- generated system database
- `api/routes/lab.py` -- LAB management endpoints
- `tests/benchmark_fixtures/` -- benchmark test data
- `tests/test_lighting_benchmarks.py` -- benchmark tests

### Lane 4: API / UI

**Scope**: Routes, frontend, static assets

**Files**:
- `api/routes/*.py` -- all API routes
- `main.py` -- FastAPI app setup
- `ui/src/` -- React/JSX frontend
- `static/` -- static assets
- `ui/src/transform.js` -- API response transformation

### Cross-Lane Violations Found

| Violation | Description | Severity |
|-----------|-------------|----------|
| `shoot_match.py` imports `classify_lighting_pattern` | Route (Lane 4) calls engine classifier directly instead of through orchestrator (Lane 1) | HIGH |
| `shoot_match.py` imports `shadow_expectations_for`, `catchlight_plan_for` | Route builds coaching content from engine functions; should be orchestrator responsibility | MEDIUM |
| `shoot_match.py` MOOD_MAP, ENVIRONMENT_MAP, GEAR_MAP | Route defines taxonomy mappings (Lane 2 concern) inline | MEDIUM |
| `shoot_match.py` builds diagram directly | Route calls `build_diagram()` and `build_reference_diagram()` directly instead of through orchestrator | MEDIUM |
| `shoot_match.py` line 703 imports `score_system` for backfill | Route performs scoring (Lane 1) directly for alternative-backfill logic | LOW |
| `main.py` imports `select_best_system` directly | `/recommend` endpoint bypasses orchestrator | MEDIUM |
| `ui/src/transform.js:detectLightingPattern()` | UI re-implements pattern detection logic that should come from engine | MEDIUM |

---

## 3. Anti-Drift Rules

### Rule 1: No New Categories Outside Enums/Taxonomy

Every categorical value (pattern name, modifier family, environment type, etc.)
must be defined in `engine/enums.py` or `data/taxonomy/*.yaml`. No hardcoded
string literals for categories in engine or route code.

**Current Violations**: See TAXONOMY_TRUTH.md section 3.

### Rule 2: No Alternate Inference Paths

All image analysis must flow through `engine/orchestrator.analyze_image()`.
No route or utility may construct its own analysis pipeline by importing
engine internals directly.

**Current Violations**:
- `shoot_match.py` correctly calls `analyze_image()` for reference images
- But falls back to `classify_lighting_pattern()` for non-reference path, bypassing the full pipeline

### Rule 3: No Route-Level Inference Logic

Routes must not contain pattern classification, shadow analysis, or lighting
inference logic. They should call orchestrator functions and format the response.

**Current Violations**:
- `shoot_match.py` calls `classify_lighting_pattern()` directly (line 737)
- `shoot_match.py` calls `shadow_expectations_for()` directly (line 769)
- `shoot_match.py` calls `catchlight_plan_for()` directly (line 770)
- `shoot_match.py` calls `build_reference_diagram()` directly (line 750)

### Rule 4: No VLM Override of Physical Validation

VLM outputs may enrich (add context, boost confidence) but must NEVER replace
CV-measured values. The `vlw_reconciliation.py` module enforces this.

**Current Status**: COMPLIANT. No violations found.

### Rule 5: No Early Collapse of Ambiguous Candidates

When multiple patterns are plausible, the pipeline must preserve all candidates
with confidence scores through to the output. Collapsing to a single answer
too early hides uncertainty from the user.

**Current Violations**:
- `_resolve_authoritative_pattern()` collapses to single string
- `_infer_shadow_pattern()` returns single string, not candidates
- `_infer_pattern_from_catchlights()` returns single pattern, not ranked list
- UI receives only `authoritative_pattern`, not alternate candidates

### Rule 6: No Writing to Canonical Dataset Without Review Markers

Any write to `data/reference_dataset/` or `data/systems/canonical/` must include:
- Processing timestamp
- Engine version
- Review status marker

**Current Status**: Reference dataset entries include `metadata.json` with timestamps.
Canonical YAML files do not have version markers.

### Rule 7: No Benchmark Expectation Changes Without Approval

Benchmark expected values in `tests/benchmark_fixtures/` must not be changed
to make failing tests pass. If the engine behavior changes, the benchmark
expectation change must be explicitly justified.

### Rule 8: No Mixing Runtime/Debug/Generated with Canonical Data

Runtime uploads, debug overlays, and generated analysis artifacts must stay in
their designated directories and never be committed to canonical data paths.

**Current Status**: `static/uploads/` is not in `.gitignore` -- should be added.

### Rule 9: No Large Multi-File Edits Without Staged Plan

Changes touching more than 3 files require a written plan listing:
- Files to be changed
- Nature of change per file
- Test coverage for each change
- Rollback strategy

### Rule 10: All Architecture Changes Must Be Documented

Any change to pipeline stages, classifier precedence, solver chain, or data
flow must update `ENGINE_TRUTH.md` before or simultaneously with the code change.

---

## 4. Quick Reference: Key File Locations

| Concern | File |
|---------|------|
| Pipeline entry point | `engine/orchestrator.py` |
| All enums | `engine/enums.py` |
| All thresholds | `engine/constants.py` |
| Solver thresholds | `engine/solver_constants.py` |
| API main | `main.py` |
| Primary route | `api/routes/shoot_match.py` |
| UI transform layer | `ui/src/transform.js` |
| Taxonomy YAML | `data/taxonomy/` |
| Canonical systems | `data/systems/canonical/` |
| Benchmark tests | `tests/test_lighting_benchmarks.py` |
| Control documents | `docs/ENGINE_TRUTH.md`, `docs/TAXONOMY_TRUTH.md`, this file |

---

## 5. Common Pitfalls

1. **Adding a new lighting pattern**: Must update `engine/enums.py` (LightingPattern),
   `data/taxonomy/lighting_patterns.yaml`, and `data/lighting_patterns.json`. Forgetting
   any one of these creates drift.

2. **Changing classifier behavior**: Must check all four classifiers listed in
   ENGINE_TRUTH.md section 2 to ensure consistency.

3. **Adding a new vision pass**: Must register in `engine/vision_passes.py`,
   add default weight in `engine/solver_constants.py`, and add a test in `tests/`.

4. **Modifying scoring weights**: Must verify benchmark tests still pass.
   Weight changes affect all recommendation outputs.

5. **UI pattern detection**: `transform.js:detectLightingPattern()` duplicates
   engine logic. Any engine-side pattern change must be mirrored in the UI
   fallback, or (preferred) the UI fallback should be removed in favor of
   always using the API-provided `authoritative_pattern`.
