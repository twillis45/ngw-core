# NGW Lighting Architecture

## Overview

NGW separates lighting knowledge into four distinct layers:

```
reference image → pattern → setup → recipe
```

Each layer serves a specific purpose in the pipeline.

## Layer Definitions

### Layer 1 — Canonical Setups (`data/systems/canonical/`)

Production-quality lighting systems used by the engine. Each setup includes:

- Subject distance
- Light distances, angles, and heights
- Background distance
- Modifier specifications
- Camera height relative to subject
- Ceiling and environment constraints
- Shadow signature expectations
- Failure modes and substitutions

**15 canonical setups** cover the most marketable lighting patterns photographers need.

### Layer 2 — Pattern Library (`data/lighting_patterns.json`, `data/patterns/`)

Patterns classify what lighting concept is happening. They describe the visual signature
of a lighting style without specifying exact equipment or positions.

**24 named patterns** including: clamshell, loop, rembrandt, split, butterfly, broad,
short, rim_only, high_key, low_key, flat_fashion, window_portrait, golden_hour,
overcast_natural, ring_light, bare_bulb_editorial, strip_dramatic, short_fashion_key,
soft_editorial_key, editorial_rim_key, tabletop_soft_product, bottle_backlight,
athletic_rim_sculpt, window_negative_fill.

Each pattern includes geometry ranges, shadow signatures, modifier compatibility,
environment constraints, and scoring weights for the pattern matcher.

### Layer 3 — Recipe Layer (future)

Recipes provide instructional guidance for executing a setup:
- Camera starting settings
- Light meter targets
- Test shot procedures
- Shadow diagnostics
- Quick fixes

Recipes remain separate from pattern classification and setup geometry.

### Layer 4 — Reference Image Library (`data/reference_library/`)

Reference images train and validate NGW lighting recognition. Each entry includes:

- reference_id, photographer, lighting_pattern
- Complete light positions (angle, height, distance, modifier)
- Shadow signature, camera settings
- Dataset tier (gold/community), trust score
- Lighting notes

**16 gold-tier reference entries** covering all major patterns.

## Directory Structure

```
data/
  systems/
    canonical/       15 production-quality YAML setups
    catalog/         10 original catalog YAMLs (promoted/legacy)
    legacy/          14 older system definitions
    experimental/    (reserved for testing new setups)
    packs/           Pack metadata and profiles
  patterns/
    pattern_catalog.json   Pattern definitions with canonical setup links
  lighting_patterns.json   24 patterns with full scoring data
  reference_library/
    references.json        16 gold-tier reference image entries
  mappings/
    setup_to_pattern_map.json   Maps every setup to its pattern(s)
    setup_status_map.json       Migration status for every setup
  lighting_systems.json    47-entry gear recommendation database (legacy)
  taxonomy/                Enum definitions for moods, gear, modifiers
  taxonomy.json            Compiled taxonomy
```

## Migration Status Legend

- **CANONICAL** — New production setup in `data/systems/canonical/`
- **PROMOTE** — Catalog setup whose geometry was absorbed into a canonical setup
- **REFACTOR** — Concept was split across multiple canonical setups
- **LEGACY** — Retained for backward compatibility but not primary
- **RETIRE** — Stub or redundant entry, archived

## Engine Integration

The pattern matching pipeline:

```
vision passes → signal extraction → physics reconstruction
  → pattern_matcher.match_lighting_patterns()
  → reference_matcher.match_reference_images()
  → lighting_knowledge_library_pass()
  → ngw_validation_pass()
```

### Key Modules

- `engine/pattern_matcher.py` — Scores reconstruction against 24 patterns
- `engine/reference_matcher.py` — Matches against reference library entries
- `engine/lighting_knowledge_library.py` — Wraps pattern matching with physics adjustments
- `engine/lighting_dna.py` — 12-dimension fingerprinting for similarity search
- `engine/selector.py` — System selection from gear recommendation database
- `engine/diagram.py` — Diagram generation from system or pattern data

### Backward Compatibility

- `data/lighting_systems.json` (47 gear combos) still serves the `/shoot-match` API
- `data/systems/catalog/*.yml` still loaded by `engine/loaders/yaml_loader.py`
- `data/systems/legacy/*.yml` retained but not surfaced in primary selection
- All existing API endpoints continue to function unchanged
- Pattern matcher expanded from 18 to 24 patterns (additive, no breaking changes)
- Reference library expanded from 10 to 16 entries (additive)
