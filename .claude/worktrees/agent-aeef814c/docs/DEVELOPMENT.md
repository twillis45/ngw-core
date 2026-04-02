# NGW Development Guide

**Version:** 1.0
**Last updated:** 2026-03-16

---

## Document Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-03-16 | Initial comprehensive development guide. Covers architecture, API, responsive layout, gear matching, diagram rendering, theme system, feature flags, testing, data files, and known issues. |

---

## Development Setup

### Prerequisites
- Python 3.10+
- Node.js 18+
- OpenAI API key (for VLM-powered reference analysis)

### Backend
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd ui
npm install
npm run dev          # Vite dev server on :5173
npx vite build       # Production build → ../static/ui/
```

### Running Both
```bash
# Terminal 1: Backend
make run

# Terminal 2: Frontend dev
cd ui && npm run dev
```

For production, `npx vite build` outputs to `static/ui/` which is served by FastAPI at `/ui`.

---

## Code Organization

### Backend (Python/FastAPI)

#### API Layer (`api/routes/`)
Route handlers that accept HTTP requests, call engine functions, and format responses.

| File | Route | Purpose |
|------|-------|---------|
| `shoot_match.py` | `/api/shoot-match` | Primary recommendation (mood + gear + optional image) |
| `shoot_mode.py` | `/api/shoot-mode` | Live shooting assistant |
| `lab.py` | `/api/lab` | Developer analysis + benchmarking |
| `auth.py` | `/api/auth` | User registration + login (JWT) |
| `user_data.py` | `/api/user-data` | Kit + saved setups cloud sync |
| `diagnostics.py` | `/api/diagnostics` | Engine introspection |
| `lighting_dna.py` | `/api/lighting-dna` | Pattern DNA fingerprinting |
| `spatial.py` | `/api/spatial` | Room planner calculations |
| `admin.py` | `/api/admin` | Admin tools |

#### Engine Layer (`engine/`)

**Image Analysis Pipeline:**
```
image_analysis.py          Entry point: analyze_image(path, mode)
  ├── vision_pipeline.py   Face detection, segmentation, palette extraction
  ├── vision_passes.py     Multi-pass analysis (highlights, surfaces, etc.)
  ├── cue_extraction.py    Extract 15 visual cues from image data
  ├── cue_inference.py     Infer geometry, source quality, environment
  ├── reference_read.py    VLM 3-layer analysis (image/lighting/recreation)
  └── lighting_inference.py  Pattern + cue interpretation → LightingInference
```

**Recommendation Pipeline:**
```
shoot_match.py (API)
  ├── Filter systems by mood + environment + gear (progressive relaxation)
  ├── selector.py          Rank filtered systems, select best
  ├── scoring.py           Score each system (criteria + features + confidence)
  ├── diagram.py           Generate DiagramSpec from selected system
  └── patterns.py          Classify lighting pattern, get expectations
```

**Solver Pipeline (extended analysis):**
```
consensus_solver.py        Multi-hypothesis consensus
  ├── contradiction_engine.py   Signal contradiction detection
  ├── consistency_engine.py     Cross-signal validation
  ├── hypothesis_validator.py   Hypothesis testing
  └── solver_models.py         Solver data models
```

**Knowledge Layer:**
```
patterns.py                    Pattern classification rules
pattern_matcher.py             Match against canonical definitions
lighting_knowledge_library.py  Canonical pattern database
archetype_classifier.py        Image archetype classification
lighting_dna.py                Pattern DNA fingerprinting
```

### Frontend (React/Vite)

#### State Management
Global state via React Context (`context/AppContext.jsx`):
- `screen` — current screen name (maps to SCREENS object in App.jsx)
- `result` — current recommendation result (from transform.js)
- `user` — authenticated user object
- `masterMode` — active master photographer mode
- `history` — screen navigation history stack

#### Data Flow
```
User Action
  → api.js: fetch('/api/shoot-match', payload)
  → API returns JSON response
  → transform.js: transformShootMatch(apiResponse)
     Maps raw API response to UI card data shapes
  → dispatch({ type: 'SET_RESULT', result })
  → ResultsScreen renders card stack
```

#### Key Transform Functions (`transform.js`)
- `transformForUI(apiResponse, mood)` — Build-from-scratch flow
- `transformShootMatch(apiResponse)` — Reference image flow
- `reliabilityFromConfidence(score)` — Score → dots + label
- `buildRefTestSteps(lightingRead, recreationSetup)` — Test checklist from ref analysis
- `buildRefQuickFixes(lightingRead, recreationSetup)` — Quick fixes from ref analysis

#### Responsive Breakpoints (`styles/app.css`)

| Breakpoint | Key Changes |
|------------|-------------|
| Base (< 640px) | Single column, bottom nav bar, max-width 600px |
| 640px+ | Wider padding, 3-col mood grid, 4-col camera grid |
| 768px+ | **Sidebar nav replaces bottom nav**, content area fills remaining width, 2-col recipe grid |
| 1080px+ | Wider sidebar (220px), **two-column results layout**, 3-col recipe grid |
| 1400px+ | Max content width 1100px |

The sidebar/bottom-nav transition is handled purely in CSS — the same `BottomNav` component renders in both layouts. On desktop (768px+), `.app-layout` becomes `display: flex` and `.bottom-nav` switches from `position: fixed; bottom: 0` to `position: static; flex-direction: column`.

---

## Gear Matching System

### Progressive Filter Relaxation (`shoot_match.py`)

Instead of returning 422 when no exact gear match exists, the system progressively relaxes filters:

```python
GEAR_GROUPS = {
    "flash":      ["speedlight", "speedlight_2_light", "strobe_mono", "strobe_pack"],
    "continuous":  ["led_panel", "led_cob", "led_tube", "continuous_2_light", ...],
    "ambient":     ["natural_window", "reflector_only"],
    "specialty":   ["ring_light"],
}
```

**Tier 1 (exact):** mood + environment + exact gear profile
**Tier 2 (gear_group):** mood + environment + any gear in same family
**Tier 3 (any_gear):** mood + exact gear (drop environment filter)
**Tier 4 (any_gear_group):** mood + gear family (drop environment)
**Tier 5 (mood_only):** best setup for mood regardless of gear

Response includes `gearMatch` object with tier, label, and adaptation notes.

---

## Diagram Rendering (`cards/DiagramCard.jsx`)

Diagrams are rendered on HTML5 Canvas (not SVG) with DPR-aware scaling.

### Key Features
- **Top-down view**: Subject center, lights at angle/distance, camera position
- **Side view**: Height visualization with subject silhouette
- **Compact canvas labels**: Role name only (e.g., "Key", "Fill") to avoid clutter
- **Detailed legend below canvas**: Full info per light (modifier, distance, angle, height)
- **Co-located light spreading**: Nudge logic for overlapping markers (e.g., clamshell key+fill)
- **Distance annotations**: Arrow measurements with horizontal tick marks
- **Collision-aware label placement**: 14-candidate offset system

### Canvas Sizing
```javascript
// Dynamic height accounts for legend:
maxCanvasH = vh - 320 - (140 + lightsCount * 24)
// Minimum 160px, ideal W * 0.65
```

---

## Theme System

Five themes stored in localStorage, applied via CSS custom properties:

| Theme | Key | Style |
|-------|-----|-------|
| Dark | `dark` | Studio dark (#0E0F12) — default |
| Light | `light` | Clean white |
| Photoshop | `photoshop` | Adobe Ps-inspired panels |
| Lightroom | `lightroom` | Adobe Lr-inspired |
| Daynote | `daynote` | Warm editorial |

Theme toggle cycles through all five. System preference (`prefers-color-scheme`) is used as initial default.

Implementation: `data/themeStore.js` handles persistence, `styles/app.css` defines all `:root` variables per theme.

---

## Feature Flags (`modes/featureFlags.js`)

Feature flags control visibility of experimental features:

| Flag | Controls |
|------|----------|
| `enable_lab` | NGW Lab screen + header button |
| `enable_shot_match` | Shot Match comparison mode |
| `enable_master_mode` | Master photographer mode selector |

Flags are checked via `isEnabled('flag_name')`. Some are auto-enabled based on user roles.

---

## Testing Strategy

### Backend Tests (70 files, 2100+ tests)

```bash
# Full suite
python3 -m pytest tests/ -q

# By area
python3 -m pytest tests/test_shoot_match.py -v      # API integration
python3 -m pytest tests/test_lighting_inference.py   # Pattern detection
python3 -m pytest tests/test_consensus_solver.py     # Solver logic
python3 -m pytest tests/test_diagram.py              # Diagram generation
python3 -m pytest tests/test_vision_passes.py        # Vision analysis
python3 -m pytest tests/test_benchmark_regression.py # Benchmark suite
```

### Frontend
```bash
cd ui && npx vite build   # Build check (catches JSX/import errors)
```

### Key Test Patterns
- **Shoot match tests** (`test_shoot_match.py`): Full API integration tests with mock images
- **Benchmark tests** (`test_benchmarks.py`, `test_benchmark_regression.py`): Score stability tests
- **Vision pass tests** (`test_vision_passes.py`): Individual analysis pass validation
- **Fuzz tests** (`test_fuzz.py`): Random input stress testing

---

## Data Files

| File | Purpose |
|------|---------|
| `data/lighting_systems.json` | 30+ lighting system candidates with criteria, features, taxonomy |
| `data/taxonomy.json` | Enum definitions: gear profiles, modifiers, moods, environments |
| `data/gear_aliases.json` | 172 brand/model name → canonical ID mappings |
| `data/lighting_patterns.json` | Pattern definitions with shadow/catchlight expectations |
| `data/reference_index.json` | Reference image metadata index |
| `data/systems/canonical/` | Per-pattern YAML files with full setup specifications |

---

## Known Issues & Planned Improvements

### Pattern Consistency (Critical)
Five independent classifiers produce different pattern names:
1. `pattern_matcher.match_lighting_patterns()` — pattern_matcher.py
2. `_infer_pattern_from_catchlights()` — lighting_inference.py
3. `_infer_shadow_pattern()` — cue_inference.py
4. `classify_lighting_pattern()` — patterns.py
5. `detectLightingPattern()` — ui/src/transform.js

**Plan**: Establish authoritative pattern from `reference_read.shadow_pattern` with fallback chain. See `.claude/plans/enchanted-prancing-lightning.md` Phase 3.

### Frontend Confidence Overrides
`transform.js` applies hard floors (75% for pattern match, 85% for mood+pattern). These override engine scores. Planned for removal once solver is wired into production.

### Solver Not Wired in Production
`shoot_match.py` calls `analyze_image(run_solver=False)`. The consensus solver and contradiction engine only run in Lab mode. Planned for Phase 1 of consistency plan.

### Field Name Fragmentation
Same concept uses different names: `pattern` (LightingInference), `shadow_pattern` (LightingRead), `pattern_name` (LightingHypothesis). Convention is documented; cleanup deferred.

---

## Related Documentation

- `docs/cue_system_architecture.md` — Cue-based analysis pipeline details
- `docs/modes.md` — Mode system architecture + how to add modes
- `data/ARCHITECTURE.md` — Data layer architecture (canonical setups, patterns, taxonomy)
- `data/taxonomy/ENGINE_INTEGRATION.md` — Taxonomy integration with engine
- `CORRECTIONS.md` — Lighting evaluation corrections log
- `PLAN.md` — Original UI implementation plan (historical)
- `.claude/plans/enchanted-prancing-lightning.md` — Engine-to-UI consistency plan
