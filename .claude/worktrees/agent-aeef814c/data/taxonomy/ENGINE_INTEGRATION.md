# Engine Integration Guide

How the NGW Core rule engine should consume the structured taxonomy.

## Current State

The taxonomy YAML files under `data/taxonomy/` are an **additive knowledge layer**. The existing `data/taxonomy.json` remains the authoritative source for scoring, system ID construction, and modifier calculations. Nothing in the engine changes in Phase 1.

## File Overview

| File | Purpose | Engine Use |
|---|---|---|
| `use_cases.yaml` | Categorizes photography scenarios | Map user intent to pattern/mood candidates |
| `visual_intents.yaml` | Describes desired visual qualities | Bridge between mood selection and pattern recommendation |
| `lighting_patterns.yaml` | Portrait and product lighting patterns | Replace hardcoded pattern lists in `patterns.py` |
| `modifier_families.yaml` | Light-shaping modifier catalog | Enrich modifier selection logic in scoring |
| `environment_constraints.yaml` | Room/space constraints | Replace hardcoded environment maps in `shoot_match.py` |
| `subject_types.yaml` | Subject categories with lighting notes | Drive subject-specific adjustments |
| `surface_material_behaviors.yaml` | Material reflection behaviors | Inform product-photography logic (future) |
| `diagnostic_failures.yaml` | Failure symptoms, causes, and fixes | Power coaching/troubleshooting in UI and API |
| `adaptation_variants.yaml` | Setup variants for constrained environments | Generate alternative recommendations |
| `reliability_labels.yaml` | Confidence tiers with score ranges | Label recommendation confidence |
| `setup_schema.yaml` | Schema definition for system profiles | Validate profile YAML files |
| `examples/*.yaml` | Complete system profiles | Serve as the structured recommendation data |

## How to Load

```python
# engine/taxonomy_loader.py (Phase 2)
import yaml
from pathlib import Path

TAXONOMY_DIR = Path(__file__).parent.parent / "data" / "taxonomy"

def _load(filename: str) -> dict:
    with open(TAXONOMY_DIR / filename) as f:
        return yaml.safe_load(f)

# Load once at startup, cache in module-level variables
USE_CASES = _load("use_cases.yaml")["use_cases"]
VISUAL_INTENTS = _load("visual_intents.yaml")["visual_intents"]
LIGHTING_PATTERNS = _load("lighting_patterns.yaml")["lighting_patterns"]
MODIFIER_FAMILIES = _load("modifier_families.yaml")["modifier_families"]
ENVIRONMENT_CONSTRAINTS = _load("environment_constraints.yaml")["environment_constraints"]
SUBJECT_TYPES = _load("subject_types.yaml")["subject_types"]
DIAGNOSTIC_FAILURES = _load("diagnostic_failures.yaml")["diagnostic_failures"]
ADAPTATION_VARIANTS = _load("adaptation_variants.yaml")["adaptation_variants"]
RELIABILITY_LABELS = _load("reliability_labels.yaml")["reliability_labels"]
```

## Lookup Functions

```python
def get_pattern(pattern_id: str) -> dict | None:
    """Look up a portrait lighting pattern by ID."""
    for p in LIGHTING_PATTERNS.get("portrait", []):
        if p["id"] == pattern_id:
            return p
    return None

def get_diagnostic(failure_id: str) -> dict | None:
    """Look up a diagnostic failure by ID."""
    for d in DIAGNOSTIC_FAILURES:
        if d["id"] == failure_id:
            return d
    return None

def get_diagnostics_for_pattern(pattern_id: str) -> list[dict]:
    """Get all diagnostic failures that affect a given pattern."""
    return [
        d for d in DIAGNOSTIC_FAILURES
        if pattern_id in d.get("patterns_affected", [])
        or "all" in d.get("patterns_affected", [])
    ]

def get_reliability_label(score: float) -> str:
    """Map a confidence score to a reliability label."""
    for label in RELIABILITY_LABELS:
        if label["min_score"] <= score <= label["max_score"]:
            return label["id"]
    return "not_ideal"

def load_profile(profile_name: str) -> dict:
    """Load a system profile from examples/."""
    return _load(f"examples/{profile_name}.yaml")
```

## Integration Points

### 1. `engine/patterns.py` — Pattern Classification

**Current**: `classify_lighting_pattern()` uses hardcoded string matching on mood, modifier, gear, key position, and fill method.

**Future**: Replace with taxonomy-driven lookup. The `lighting_patterns.yaml` entries include `key_angle_range`, `fill_approach`, and `shadow_signature` that can drive classification:

```python
# Instead of: if "dramatic" in m and ("45" in kp):
# Use: match key_angle against pattern.key_angle_range
pattern = match_pattern_from_inputs(
    mood=mood,
    key_angle=parse_angle(key_position_text),
    fill_method=fill_method_text,
)
```

### 2. `engine/scoring.py` — Scoring Enrichment

**Current**: `score_system()` uses criteria from `taxonomy.json` gear profiles + modifier adjustments + environment adjustments.

**Future**: System profiles in `examples/*.yaml` include pre-computed `reliability.rule_confidence` scores that can supplement or validate the criteria-based scoring.

### 3. `api/routes/shoot_match.py` — Replace Hardcoded Maps

**Current**: Contains hardcoded `MOOD_MAP`, `ENVIRONMENT_MAP`, `GEAR_MAP`, `GEAR_TO_MODIFIERS`, `CAMERA_SETTINGS`.

**Future**: These maps should be derived from taxonomy files:
- `MOOD_MAP` → `visual_intents.yaml` mood_mapping field
- `ENVIRONMENT_MAP` → `environment_constraints.yaml`
- `CAMERA_SETTINGS` → extracted from system profile `camera_architecture` sections
- `GEAR_TO_MODIFIERS` → `modifier_families.yaml` best_for/avoid_for fields

### 4. Coaching / Troubleshooting in UI

**Current**: `ui/src/coaching.js` has per-mood quickFixes and warnings.

**Future**: The API can serve `diagnostic_failures.yaml` entries filtered by the detected pattern, giving the UI structured troubleshooting data:

```python
# API endpoint: GET /api/diagnostics?pattern=rembrandt
diagnostics = get_diagnostics_for_pattern("rembrandt")
# Returns failures with symptoms, causes, and fixes
```

### 5. System Profile Recommendations

**Current**: `select_best_system()` returns a system from `lighting_systems.json`.

**Future**: After selecting a system, load the corresponding taxonomy profile for rich recommendation data:

```python
profile = load_profile("rembrandt_portrait")
# Returns: full light architecture, distances, expected results, diagnostics, substitutions
```

## Backward Compatibility

- `data/taxonomy.json` remains the authoritative source for scoring math
- `data/lighting_systems.json` remains the system catalog for the recommendation engine
- All existing API endpoints continue to work unchanged
- YAML files are read-only reference data — no engine code reads them yet
- `PyYAML` is already in `requirements.txt`
- All 533 existing tests pass without modification

## Migration Path (Phase 2)

1. Create `engine/taxonomy_loader.py` with functions above
2. Add taxonomy-driven pattern classification alongside existing logic (A/B)
3. Replace hardcoded maps in `shoot_match.py` one at a time
4. Add `/api/diagnostics` endpoint serving failure data
5. Update UI coaching cards to consume structured diagnostic data
6. Add profile-based recommendation enrichment to results
7. Write tests for each integration point before switching
