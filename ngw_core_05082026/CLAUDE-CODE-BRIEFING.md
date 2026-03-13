# NGW Lighting Tool — Claude Code Briefing

## CONTEXT

We have a working lighting recommendation engine (`ngw-core-v1`) and a new React UI prototype for a feature called **Shoot Match**. The UI prototype is complete and tested. Now we need to integrate it with the existing engine.

## WHAT EXISTS

### Engine (Python — already built)
- `engine/rule_engine.py` — accepts systems + input context → scores → selects best → generates diagram
- `engine/scoring.py` — produces ScoreBreakdown with confidence scores
- `engine/selector.py` — ranks systems, returns top 3 picks
- `engine/diagram.py` — outputs DiagramSpec with LightPlacement objects (role, angle_deg, height_m, distance_m, modifier)
- `engine/patterns.py` — classifies lighting patterns (clamshell, rembrandt-ish, loop, split/short), returns shadow_expectations_for() and catchlight_plan_for()
- `engine/vision_pipeline.py` — analyzes uploaded images: segmentation, face detection, skin/clothing/bg palettes, pose, skin tone
- `engine/image_analysis.py` — wraps vision pipeline (basic mode + vision mode)
- `data/lighting_systems.json` — 30 lighting system candidates, each with: criteria, features, taxonomy_refs, why_this_works, failure_modes, substitutions[], difficulty, setup_time_minutes

### UI Prototype (React JSX — built, needs integration)
- Mobile-first dark studio theme (#0E0F12 bg)
- Full flow: Start → Gear Mode → Wizard → Results
- 9 result cards: Best Match, Shoot This Setup, Space Check, Diagram, How to Test, What to Look For, Quick Fixes, Substitutions, Other Setups
- Currently uses mock data via generateMockResults()

## WHAT NEEDS TO HAPPEN

### Phase 1: Engine Bridge (3 new files)

#### File 1: `src/engine/systemFilter.js`
Filter `lighting_systems.json` by user wizard selections.
- Input: { subject, mood, environment, ceiling, gearMode, gear }
- Match against system.taxonomy_refs (mood, environment, gear_profile)
- If gearMode === "myGear", filter to systems compatible with user's gear
- Return filtered systems array

#### File 2: `src/engine/adapter.js`  
Map wizard state → engine payload format.
- Map UI mood strings → taxonomy mood keys:
  - "Clean & Classic" → "corporate"
  - "Moody & Dramatic" → "cinematic" 
  - "Soft & Ethereal" → "beauty"
  - "Bold & Edgy" → "editorial"
  - "High Fashion" → "beauty"
  - "Natural & Available" → "natural"
  - "Cinematic" → "cinematic"
- Map UI environment → taxonomy environment keys:
  - "Small Room" → "studio_small"
  - "Home Studio" → "studio_small"
  - "Medium Studio" → "studio_medium"  
  - "Large Studio" → "studio_large"
  - "Outdoor" → "outdoor"
  - "Window Light" → "natural_light"
  - "Office" → "studio_small"
- Map UI gear selections → gear_profile + modifiers_available
- Construct the payload: { systems: [...], input: { skin_tone, mood, environment, gear_profile, modifiers_available }, modifiers_available: [...] }

#### File 3: `src/engine/resultMapper.js`
Map RuleEngineOutput → UI card schemas.
- `confidence.score` → reliability (0-100)
- Reliability labels: 90-100="Very Reliable", 75-89="Reliable", 60-74="Good Option", 40-59="Experimental", <40="Not Ideal"  
- `system.why_this_works` → "Why This Works" card body
- `system.failure_modes` → feeds "What to Look For" warnings
- `system.substitutions` → "Substitutions" card (ifMissing, use, tradeoff)
- `system.difficulty` → complexity badge
- `system.setup_time_minutes` → setup time badge
- `DiagramSpec.lights[n]` → per-light cards:
  - LightPlacement.role → "Key Light" / "Fill Light" / "Rim Light"
  - LightPlacement.modifier → photographer-friendly name
  - LightPlacement.angle_deg → "45° camera left"  
  - LightPlacement.height_m → convert to feet/inches relative to subject
  - LightPlacement.distance_m → convert to feet
- Call `classify_lighting_pattern()` → pattern name
- Call `shadow_expectations_for(pattern)` → "What to Look For" good signs + warnings
- Call `catchlight_plan_for(modifier, pattern)` → merge into "What to Look For"

### Phase 2: API Endpoint

Add `/api/shoot-match` endpoint to `api/routes/`:
- Accepts: { subject, mood, environment, ceiling, gearMode, gear, referenceImage? }
- Runs systemFilter → adapter → run_rule_engine → resultMapper
- Returns UI-ready card data

### Phase 3: Wire UI
- Replace generateMockResults() with actual API call
- Pass engine results through resultMapper to card components

## CODING RULES

- One feature per message
- Diffs only
- Max 150 lines changed per message
- End each response with READY FOR NEXT
- Use photographer-friendly language in all UI-facing strings
- NEVER use these terms in UI: engine, confidence score, top picks, alternatives, candidate, ranking, model output
- ALWAYS use these terms instead: Best Match, Reliability, Why This Works, Shoot This Setup, Space Check, How to Test This Setup, What to Look For, Quick Fixes, Substitutions, Other Setups You Could Try

## START INSTRUCTION

Start with Phase 1, File 1: Create `src/engine/systemFilter.js`. Read `data/lighting_systems.json` to understand the taxonomy_refs structure, then build the filter.
