# NGW Lighting Tool — Architecture & Implementation Plan

## Engine Analysis Summary

The existing `ngw-core-v1` engine provides:

- **30 lighting system candidates** in `lighting_systems.json`, each with criteria, features, taxonomy_refs, `why_this_works`, `failure_modes`, `substitutions`, difficulty, and setup time
- **Rule engine** (`engine/rule_engine.py`) that accepts systems + input context → runs scoring → selects best system → generates diagram
- **Scoring** (`engine/scoring.py`) produces `ScoreBreakdown` with criteria components, feature bonuses, confidence (score, method, criteria_coverage, feature_match)
- **Selector** (`engine/selector.py`) ranks systems, returns `SelectionResult` with winner, top_picks (up to 3), confidence, rankings
- **Diagram engine** (`engine/diagram.py`) outputs `DiagramSpec` with typed light placements (role, angle_deg, height_m, distance_m, modifier), subject position, camera position
- **Pattern classifier** (`engine/patterns.py`) classifies lighting patterns (clamshell, rembrandt-ish, loop, split/short) and returns shadow expectations + catchlight guidance
- **Vision pipeline** (`engine/vision_pipeline.py`) analyzes uploaded images: person segmentation, face detection, skin/clothing/background palettes, pose estimation, skin tone guess
- **Image analysis** (`engine/image_analysis.py`) wraps vision pipeline with basic mode (palette only) and vision mode (full segmentation)

### Key Data Shapes for UI Integration

**Engine Input** (what the UI must construct):
```
{
  systems: LightingSystemEntry[],  // filtered from lighting_systems.json
  input: {
    skin_tone, mood, environment,
    gear_profile, modifiers_available
  },
  modifiers_available: string[]
}
```

**Engine Output** (what the UI must render):
```
RuleEngineOutput {
  selection: SelectionResult {
    confidence: float (0–100)
    winner: WinnerInfo { system_id, system_name, final_score, confidence, rationale }
    top_picks: SelectionPick[] {
      rank, breakdown: ScoreBreakdown, reason, diagram_spec: DiagramSpec
    }
  }
  diagram_spec: DiagramSpec {
    system_id, lights: LightPlacement[], subject: SubjectPosition, camera: CameraPosition
  }
  content: string
  systems_evaluated: int
}
```

**DiagramSpec.lights[n]**:
```
LightPlacement { role, label, angle_deg, height_m, distance_m, modifier, notes }
```

**LightingSystemEntry fields available per system**:
```
why_this_works: string
failure_modes: string[]
substitutions: { if_missing, use, tradeoff }[]
difficulty: int (1–5)
setup_time_minutes: int
```

---

## A. Mobile-First Information Architecture

```
[Start]
  ├── Match a Look
  │     ├── Upload Reference Image
  │     ├── Select Subject Type
  │     ├── Select Environment
  │     ├── Ceiling Height
  │     ├── Gear Mode → [Use My Gear → Gear Entry] | [Best Possible → skip]
  │     └── → Results
  │
  └── Build From Scratch
        ├── Select Subject Type
        ├── Select Mood / Look
        ├── Select Environment
        ├── Ceiling Height
        ├── Gear Mode → [Use My Gear → Gear Entry] | [Best Possible → skip]
        └── → Results

[Results] (stacked cards)
  1. Best Match         — name, reliability, "Why This Works"
  2. Shoot This Setup   — per-light cards, camera, subject, background
  3. Space Check        — ceiling/room feasibility
  4. Diagram            — SVG top-down, distances labeled
  5. How to Test        — interactive checklist
  6. What to Look For   — good signs + warnings
  7. Quick Fixes        — problem → fix pairs
  8. Substitutions      — if_missing → use → tradeoff (from engine data)
  9. Other Setups       — alternatives with reliability scores

[Sticky Bottom Bar]
  Adapt | Save | Rebuild | Fewer Lights
```

---

## B. Screen-by-Screen UX Flow

### Screen 1: Start
- Full-bleed dark screen
- Logo mark + "NGW Lighting"
- "How do you want to start?"
- Two large tap cards:
  - **Match a Look** — icon: image — "Upload a reference photo and recreate the lighting"
  - **Build From Scratch** — icon: sliders — "Start with your subject, mood, space, and gear"

### Screen 2: Gear Mode
- "Are we building around your gear?"
- Two large tap cards:
  - **Use My Gear** — icon: wrench — "Recommend setups I can actually build"
  - **Best Possible Setup** — icon: star — "Show me the ideal regardless of what I own"

### Screen 3: Wizard (3–5 steps depending on path)
- Progress dots at top
- Back button (chevron left)
- Step title + subtitle
- Chip-based inputs (single-select per question)
- "Continue" button pinned to bottom

**Match a Look steps:**
1. Upload reference + Subject type + Environment (combined for speed)
2. Ceiling height
3. Gear entry (if Use My Gear)
4. Review summary → "Show Me the Setup"

**Build From Scratch steps:**
1. Subject type
2. Mood / Look
3. Environment + Ceiling height
4. Gear entry (if Use My Gear)
5. Review summary → "Show Me the Setup"

### Screen 4: Results
- Context bar: "Portrait · Clean & Classic · Studio"
- Stacked card stream (9 cards)
- Sticky bottom action bar

---

## C. React Component Hierarchy

```
<App>
  <AppShell>
    <StartScreen />
    <GearModeScreen />
    <WizardScreen>
      <ProgressDots />
      <StepContent>
        <ImageUploadStep />     // Match a Look only
        <SubjectStep />
        <MoodStep />            // Build From Scratch only
        <EnvironmentStep />
        <CeilingStep />
        <GearEntryStep>
          <GearSection title="Lights">
            <QuantityStepper />...
          </GearSection>
          <GearSection title="Modifiers">
            <QuantityStepper />...
          </GearSection>
          <GearSection title="Support">
            <QuantityStepper />...
          </GearSection>
        </GearEntryStep>
        <ReviewStep />
      </StepContent>
      <BottomAction />
    </WizardScreen>
    <ResultsScreen>
      <ResultsHeader />
      <BestMatchCard />
      <ShootSetupCard>
        <LightCard />...
        <CameraBlock />
        <SubjectBlock />
        <BackgroundBlock />
      </ShootSetupCard>
      <SpaceCheckCard />
      <DiagramCard>
        <SetupDiagram />      // SVG
      </DiagramCard>
      <TestStepsCard />       // interactive checklist
      <LookForCard />
      <QuickFixesCard />
      <SubstitutionsCard />
      <AlternativesCard />
      <StickyBottomBar />
    </ResultsScreen>
  </AppShell>
</App>
```

---

## D. Recommended File Structure

```
src/
├── app/
│   ├── App.jsx                 // Router + screen state
│   └── AppShell.jsx            // Max-width container, ambient bg
├── screens/
│   ├── StartScreen.jsx
│   ├── GearModeScreen.jsx
│   ├── WizardScreen.jsx
│   └── ResultsScreen.jsx
├── components/
│   ├── ui/                     // Primitives
│   │   ├── Chip.jsx
│   │   ├── ChipGroup.jsx
│   │   ├── QuantityStepper.jsx
│   │   ├── Card.jsx
│   │   ├── CardHeader.jsx
│   │   ├── Btn.jsx
│   │   ├── ProgressDots.jsx
│   │   ├── SectionLabel.jsx
│   │   └── Icons.jsx
│   ├── cards/                  // Result cards
│   │   ├── BestMatchCard.jsx
│   │   ├── ShootSetupCard.jsx
│   │   ├── SpaceCheckCard.jsx
│   │   ├── DiagramCard.jsx
│   │   ├── TestStepsCard.jsx
│   │   ├── LookForCard.jsx
│   │   ├── QuickFixesCard.jsx
│   │   ├── SubstitutionsCard.jsx
│   │   └── AlternativesCard.jsx
│   ├── diagram/
│   │   └── SetupDiagram.jsx    // SVG top-down renderer
│   └── wizard/
│       ├── ImageUploadStep.jsx
│       ├── SubjectStep.jsx
│       ├── MoodStep.jsx
│       ├── EnvironmentStep.jsx
│       ├── CeilingStep.jsx
│       ├── GearEntryStep.jsx
│       └── ReviewStep.jsx
├── engine/                     // Engine bridge
│   ├── adapter.js              // Maps UI state → engine payload
│   ├── resultMapper.js         // Maps engine output → UI card schemas
│   └── systemFilter.js         // Filters lighting_systems.json by user input
├── data/
│   ├── options.js              // Subject types, moods, environments, etc.
│   └── gearCatalog.js          // Light, modifier, support options
├── theme/
│   └── tokens.js               // Colors, spacing, typography, radii
└── hooks/
    ├── useWizardState.js
    └── useEngineQuery.js
```

---

## E. UI State / Data Model

### Wizard State
```typescript
interface WizardState {
  // Path
  mode: 'match' | 'build' | null;
  gearMode: 'myGear' | 'bestPossible' | null;
  step: number;

  // User selections
  referenceImage: File | null;          // Match a Look only
  imageAnalysis: ImageAnalysisResult | null;  // from vision pipeline
  subject: string | null;               // "Headshot", "Portrait", etc.
  mood: string | null;                  // "Clean & Classic", etc. (Build only)
  environment: string | null;           // "Studio", "Home Studio", etc.
  ceiling: string | null;               // "8 ft", "10 ft", etc.

  // Gear (only if gearMode === 'myGear')
  gear: {
    lights: Record<string, number>;     // { "AD600": 2, "Speedlight": 1 }
    modifiers: Record<string, number>;  // { "Octa": 1, "Beauty Dish": 1 }
    support: Record<string, number>;    // { "C-Stand": 3 }
  };
}
```

### Engine Bridge
```typescript
// adapter.js — Maps wizard state → engine payload
function buildEnginePayload(state: WizardState): EnginePayload {
  // 1. Map UI mood → taxonomy mood key
  // 2. Map UI environment → taxonomy environment key
  // 3. Map UI gear → gear_profile + modifiers_available
  // 4. Filter lighting_systems.json to relevant candidates
  // 5. Return { systems, input, modifiers_available }
}
```

### Result State
```typescript
interface ResultState {
  bestMatch: {
    name: string;
    reliability: number;          // 0–100 from confidence.score
    reliabilityLabel: string;     // "Very Reliable", "Reliable", etc.
    why: string;                  // from system.why_this_works
    pattern: string;              // from classify_lighting_pattern()
  };

  lights: LightSetup[];          // from diagram_spec.lights, enriched
  camera: CameraGuidance;        // derived from diagram_spec.camera + defaults
  subject: SubjectGuidance;
  background: BackgroundGuidance | null;

  spaceCheck: SpaceCheck;        // derived from ceiling + modifier sizes
  diagram: DiagramSpec;          // direct from engine
  testSteps: string[];           // generated from pattern + light count
  lookFor: {
    good: string[];              // from shadow_expectations_for()
    warnings: WarningFix[];      // from shadow_expectations_for()
  };
  quickFixes: ProblemFix[];      // from shadow_expectations + failure_modes
  substitutions: Substitution[]; // from system.substitutions
  alternatives: Alternative[];   // from top_picks[1:] + other ranked systems
}
```

### Mapping Engine → UI Language
```
confidence.score      → reliability (number)
                      → reliabilityLabel:
                          90–100 → "Very Reliable"
                          75–89  → "Reliable"
                          60–74  → "Good Option"
                          40–59  → "Experimental"
                          <40    → "Not Ideal"

system.why_this_works → "Why This Works" card body
system.failure_modes  → feeds into "What to Look For" warnings
system.substitutions  → "Substitutions" card
system.difficulty     → optional complexity badge
system.setup_time     → "~15 min setup" badge

LightPlacement.role         → "Key Light", "Fill Light", "Rim Light"
LightPlacement.modifier     → translated to photographer name
LightPlacement.angle_deg    → "45° camera left"
LightPlacement.height_m     → converted to feet/inches relative to subject
LightPlacement.distance_m   → converted to feet

classify_lighting_pattern() → pattern name for shadow_expectations_for()
shadow_expectations_for()   → "What to Look For" + "Quick Fixes"
catchlight_plan_for()       → merged into "What to Look For"
```

---

## F. Result Card Schema

```typescript
// Each card maps to a React component with this data shape:

interface BestMatchData {
  name: string;                    // system_name (photographer friendly)
  reliability: number;             // 0–100
  reliabilityLabel: string;
  why: string;
  pattern: string;                 // "Loop", "Clamshell", etc.
  setupTime: number;               // minutes
  difficulty: number;              // 1–5
}

interface LightSetup {
  role: string;                    // "Key Light", "Fill Light", "Rim Light"
  modifier: string;                // "Beauty Dish (22\")"
  angle: string;                   // "45° camera left"
  height: string;                  // "20\" above subject eyes"
  distSubject: string;             // "5 ft"
  distBackground: string | null;
  purpose: string;
  power: string;                   // "1/4 → adjust to f/8"
}

interface CameraGuidance {
  lens: string;
  height: string;
  angle: string;
  distance: string;
  settings: string;                // "ISO 100 · 1/200 · f/8"
  wb: string;
}

interface SubjectGuidance {
  distBackground: string;
  pose: string;
}

interface SpaceCheck {
  minCeiling: string;
  recCeiling: string;
  minWidth: string;
  subjectToBg: string;
  cameraToSubject: string;
  notes: string;
  isTight: boolean;
}

interface TestStep {
  text: string;
  checked: boolean;                // local UI state
}

interface WarningFix {
  sign: string;
  fix: string;
}

interface Substitution {
  ifMissing: string;
  use: string;
  tradeoff: string;
}

interface Alternative {
  name: string;
  reliability: number;
  reliabilityLabel: string;
  desc: string;
  pattern: string;
}
```

---

## G. Theme / Token System

```javascript
export const tokens = {
  // Colors
  color: {
    bg:          '#0E0F12',
    card:        '#17191F',
    cardUp:      '#1E2129',
    cardHover:   '#252830',
    text:        '#F4F6F8',
    textSec:     '#A9AFBB',
    textDim:     '#6B7280',
    border:      '#2A2E38',
    accent:      '#4DA3FF',
    accentDim:   '#4DA3FF33',
    success:     '#39D98A',
    successDim:  '#39D98A22',
    warn:        '#F5B041',
    warnDim:     '#F5B04122',
    error:       '#FF5D5D',
    errorDim:    '#FF5D5D22',
    creative:    '#9B7CFF',
    creativeDim: '#9B7CFF22',
  },

  // Typography
  font: {
    sans:  "'DM Sans', -apple-system, sans-serif",
    mono:  "'DM Mono', 'SF Mono', monospace",
  },
  fontSize: {
    xs: 11,   // labels, overlines
    sm: 13,   // secondary text, chip labels
    md: 14,   // body, descriptions
    lg: 17,   // card titles
    xl: 22,   // step titles
    xxl: 28,  // screen headings
  },
  fontWeight: {
    normal: 400,
    medium: 500,
    semi:   600,
    bold:   700,
    heavy:  800,
  },

  // Spacing
  space: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
  },

  // Radii
  radius: {
    sm: 8,
    md: 10,
    lg: 14,
    full: 100,
  },

  // Shadows
  shadow: {
    card: '0 2px 16px rgba(0,0,0,.35)',
    glow: (color) => `0 0 20px ${color}33, 0 0 40px ${color}11`,
  },

  // Animation
  ease: {
    out: 'cubic-bezier(.16,1,.3,1)',
    spring: 'cubic-bezier(.34,1.56,.64,1)',
  },
  duration: {
    fast: '0.2s',
    normal: '0.35s',
    slow: '0.45s',
  },

  // Layout
  maxWidth: 480,
  tapTarget: 44,  // minimum touch target (px)
};
```

---

## H. Priority Implementation Plan

### Phase 1: Core Flow (Claude Code — engine wiring)
1. Create `engine/adapter.js` — maps wizard state → engine payload
2. Create `engine/systemFilter.js` — filters `lighting_systems.json` by mood, environment, gear
3. Create `engine/resultMapper.js` — maps `RuleEngineOutput` → UI result schemas
4. Wire `patterns.py` output into result mapper (shadow expectations, catchlight plan)
5. Add `/api/shoot-match` endpoint that accepts wizard params + optional image

### Phase 2: UI Components (here or Claude Code)
1. Extract theme tokens to `theme/tokens.js`
2. Build UI primitives: Chip, QuantityStepper, Card, CardHeader, Btn, ProgressDots
3. Build wizard steps as individual components
4. Build result cards as individual components
5. Wire to engine adapter

### Phase 3: Shoot Match (image upload path)
1. Image upload component with preview + drag/drop
2. Call `describe_image(path, "vision")` on upload
3. Use vision output to pre-fill wizard (subject type from pose, mood hints from palette)
4. Pass image analysis context through to engine for better system selection

### Phase 4: Polish
1. Substitutions card (data already exists per system)
2. Sticky bottom bar actions (Adapt, Save, Rebuild, Fewer Lights)
3. Adaptation actions (Make It Softer, More Dramatic, Low Ceiling, Portable)
4. Setup checklist persistence
5. Diagram interactivity (tappable lights)
6. Transition animations between screens

### Phase 5: Extended
1. Save/load setups (local storage or API)
2. PDF export of setup card
3. Gear profile presets ("My Studio Kit", "Location Kit")
4. Multi-setup comparison
5. Shot list integration

---

## I. UI Copy Reference

### Screen Labels
| Location | Copy |
|----------|------|
| Start heading | "How do you want to start?" |
| Start subtitle | "Choose your workflow" |
| Match card title | "Match a Look" |
| Match card desc | "Upload a reference photo and recreate the lighting" |
| Build card title | "Build From Scratch" |
| Build card desc | "Start with your subject, mood, space, and gear" |
| Gear heading | "Are we building around your gear?" |
| Gear subtitle | "This shapes which setups we recommend" |
| My Gear title | "Use My Gear" |
| My Gear desc | "Recommend setups I can actually build" |
| Best Possible title | "Best Possible Setup" |
| Best Possible desc | "Show me the ideal regardless of what I own" |

### Wizard Step Labels
| Step | Title | Subtitle |
|------|-------|----------|
| Subject | "What are you shooting?" | "Choose subject type" |
| Mood | "What's the mood?" | "The look you're going for" |
| Environment | "Where are you shooting?" | "Environment and ceiling height" |
| Ceiling | "Ceiling height?" | "Affects modifier choices and placement" |
| Gear | "What gear do you have?" | "Tap to add, use steppers for quantity" |
| Review | "Ready to go" | "Here's what we're working with" |

### Result Card Titles
| Card | Title | Possible Tag |
|------|-------|--------------|
| Best Match | "Best Match" | "Very Reliable" / "Reliable" / etc. |
| Setup | "Shoot This Setup" | "3 lights" |
| Camera | "Camera & Subject" | — |
| Space | "Space Check" | "Good to Go" / "Tight Fit" |
| Diagram | "Setup Diagram" | "Top-down view" |
| Test | "How to Test This Setup" | "0/10" counter |
| Look For | "What to Look For" | — |
| Fixes | "Quick Fixes" | — |
| Subs | "Substitutions" | — |
| Alts | "Other Setups You Could Try" | — |

### Button Labels
| Context | Label |
|---------|-------|
| Wizard continue | "Continue" |
| Wizard generate | "Show Me the Setup →" |
| Bottom bar | "Adapt" · "Save" · "Rebuild" · "Fewer Lights" |
| Adaptations | "Make It Softer" · "More Dramatic" · "Low Ceiling Version" · "Portable Version" |

### Reliability Labels
| Score Range | Label | Color |
|-------------|-------|-------|
| 90–100 | Very Reliable | #39D98A (success) |
| 75–89 | Reliable | #4DA3FF (accent) |
| 60–74 | Good Option | #F5B041 (warn) |
| 40–59 | Experimental | #FF5D5D (error) |
| <40 | Not Ideal | #FF5D5D (error) |
