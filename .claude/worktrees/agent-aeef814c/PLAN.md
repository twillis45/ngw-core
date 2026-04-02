# Studio Dark Pro — Implementation Plan

## A. Mobile-First Information Architecture

```
┌─────────────────────────────────────────────┐
│  TIER 1 — Entry                             │
│  WelcomeScreen                              │
│    ├── "Light a Mood" → MoodScreen          │
│    └── "Use My Kit"   → SetupWizard         │
├─────────────────────────────────────────────┤
│  TIER 2 — Setup Wizard (stepped)            │
│  Step flow varies by entry path:            │
│                                             │
│  Light a Mood path:                         │
│    Mood → Subject → Environment → Ceiling   │
│    → Gear Question → [Gear Entry] → Submit  │
│                                             │
│  Use My Kit path:                           │
│    Subject → Mood → Environment → Ceiling   │
│    → Gear Entry → Submit                    │
├─────────────────────────────────────────────┤
│  TIER 3 — Results (scrollable card stack)   │
│    1. Best Match  (hero)                    │
│    2. Shoot This Setup                      │
│    3. Space Check                           │
│    4. Lighting Diagram                      │
│    5. Camera & Subject                      │
│    6. How to Test This Setup                │
│    7. What to Look For                      │
│    8. Quick Fixes                           │
│    9. Other Setups You Could Try            │
│    + Sticky action bar                      │
└─────────────────────────────────────────────┘
```

Key architecture decisions:
- Replace the separate Mood/Gear screens with a single stepped wizard component
- Wizard tracks step index; back always goes to previous step
- Gear question ("Use My Gear" / "Best Possible Setup") lives inside the wizard, not the welcome screen
- The welcome screen is just the two entry-point cards — keep it fast and clean
- Results screen gains Camera & Subject card (merges camera settings + new subject/background guidance)
- "Substitutions" folds into "Other Setups You Could Try" as a subsection rather than its own card

---

## B. Screen-by-Screen UX Flow

### Screen 1: Welcome
```
┌──────────────────────────┐
│  Lighting Coach          │
│                          │
│  How are we shooting?    │
│                          │
│  ┌────────────────────┐  │
│  │  🎨                │  │
│  │  Light a Mood      │  │
│  │  Pick the vibe,    │  │
│  │  we build the      │  │
│  │  setup             │  │
│  └────────────────────┘  │
│                          │
│  ┌────────────────────┐  │
│  │  📷                │  │
│  │  Use My Kit        │  │
│  │  Tell us your      │  │
│  │  gear, we dial     │  │
│  │  it in             │  │
│  └────────────────────┘  │
└──────────────────────────┘
```
- Two tappable cards, nothing else
- No bottom bar on this screen
- Card tap → navigate to wizard with intent set

### Screen 2: Setup Wizard (multi-step)

Each wizard step is a single-purpose panel inside one screen component.
Progress indicator: subtle step dots at top (not a progress bar — too enterprise).

**Step: Mood** (Light a Mood path only, or second step in Use My Kit path)
```
┌──────────────────────────┐
│  ← What's the vibe?      │
│  ○ ○ ● ○ ○               │
│                          │
│  ┌────┐  ┌────┐          │
│  │Beauty│ │Cine│          │
│  └────┘  └────┘          │
│  ┌────┐  ┌────┐          │
│  │Corp│  │Edit│          │
│  └────┘  └────┘          │
│  ┌────┐  ┌────┐          │
│  │Natu│  │High│          │
│  └────┘  └────┘          │
│  ┌────┐                  │
│  │Low │                  │
│  └────┘                  │
│                          │
│  ┌──────────────────┐    │
│  │     Next →        │    │
│  └──────────────────┘    │
└──────────────────────────┘
```

**Step: Subject Type** (NEW — not in current app)
```
┌──────────────────────────┐
│  ← Who are we shooting?  │
│  ○ ● ○ ○ ○               │
│                          │
│  Chip grid:              │
│  [Headshot] [Half Body]  │
│  [Full Body] [Couple]    │
│  [Small Group] [Product] │
│  [Food] [Interior]       │
│                          │
│  ┌──────────────────┐    │
│  │     Next →        │    │
│  └──────────────────┘    │
└──────────────────────────┘
```

**Step: Environment** (NEW)
```
┌──────────────────────────┐
│  ← Where are we?         │
│  ○ ○ ● ○ ○               │
│                          │
│  Chip grid:              │
│  [Studio] [Home Studio]  │
│  [Office] [On Location]  │
│  [Outdoors] [Small Room] │
│                          │
│  ┌──────────────────┐    │
│  │     Next →        │    │
│  └──────────────────┘    │
└──────────────────────────┘
```

**Step: Ceiling Height** (NEW)
```
┌──────────────────────────┐
│  ← Ceiling height?       │
│  ○ ○ ○ ● ○               │
│                          │
│  Large segmented chips:  │
│  [Under 8 ft]            │
│  [8–9 ft]                │
│  [10–12 ft]              │
│  [12+ ft / Outdoors]     │
│                          │
│  ┌──────────────────┐    │
│  │     Next →        │    │
│  └──────────────────┘    │
└──────────────────────────┘
```

**Step: Gear Question** (Light a Mood path only)
```
┌──────────────────────────┐
│  ← Building around       │
│    your gear?             │
│  ○ ○ ○ ○ ●               │
│                          │
│  ┌────────────────────┐  │
│  │ 📷 Use My Gear    │  │
│  │ We'll work with   │  │
│  │ what you have     │  │
│  └────────────────────┘  │
│                          │
│  ┌────────────────────┐  │
│  │ ✨ Best Possible  │  │
│  │ Show me the ideal │  │
│  │ setup              │  │
│  └────────────────────┘  │
└──────────────────────────┘
```
- Tapping "Use My Gear" → goes to Gear Entry step
- Tapping "Best Possible" → skips gear, goes straight to submit

**Step: Gear Entry** (chip-based, no dropdowns)
```
┌──────────────────────────┐
│  ← What's in your kit?   │
│                          │
│  LIGHTS                  │
│  [Speedlight ×2]         │
│  [AD600 ×1]              │
│  [+ Add light]           │
│                          │
│  MODIFIERS               │
│  [Softbox] [Beauty Dish] │
│  [Umbrella] [Grid]       │
│  [+ more]                │
│                          │
│  SUPPORT                 │
│  [C-Stand ×3]            │
│  [Boom Arm ×1]           │
│                          │
│  ┌──────────────────┐    │
│  │   Get My Setup →  │    │
│  └──────────────────┘    │
└──────────────────────────┘
```
- Light chips have inline quantity steppers (−/+)
- Modifier chips are toggleable (selected/unselected)
- Support gear is chips with steppers
- No dropdown menus, no toggle switches, no text inputs for features

### Screen 3: Loading
```
┌──────────────────────────┐
│                          │
│        ⚡                │
│  Building your setup...  │
│  ━━━━━━━━━━━━━━━━━━━━    │
│                          │
└──────────────────────────┘
```

### Screen 4: Results
Card stack (see section F for full card schemas).
Bottom sticky bar with primary actions:
```
┌──────────────────────────┐
│  [Edit Setup] [Share 📋] │
└──────────────────────────┘
```
Future: Adapt, Use Fewer Lights, Make It Softer, etc.

---

## C. React Component Tree

```
App
├── AppHeader
└── ScreenRouter
    ├── WelcomeScreen
    │   └── IntentCard (×2)
    │
    ├── SetupWizard ← NEW (replaces MoodPickerScreen + GearInputScreen)
    │   ├── WizardProgress (step dots)
    │   ├── StepMood
    │   │   └── MoodTile (×7)
    │   ├── StepSubject ← NEW
    │   │   └── ChipSelect
    │   ├── StepEnvironment ← NEW
    │   │   └── ChipSelect
    │   ├── StepCeiling ← NEW
    │   │   └── ChipSelect
    │   ├── StepGearQuestion ← NEW (Light a Mood path only)
    │   │   └── IntentCard (×2)
    │   ├── StepGearEntry ← REWRITTEN
    │   │   ├── GearChipGroup (lights, with qty stepper)
    │   │   ├── GearChipGroup (modifiers, toggle only)
    │   │   └── GearChipGroup (support, with qty stepper)
    │   └── StickyBottomBar
    │
    ├── LoadingScreen
    │
    └── ResultsScreen
        ├── BestMatchCard
        ├── ShootSetupCard (enhanced with purpose per light)
        ├── SpaceCheckCard (enhanced with ceiling, distances)
        ├── DiagramCard (enhanced with all distances)
        ├── CameraSubjectCard ← NEW (merges camera + subject + background)
        ├── HowToTestCard (already updated with meter/exposure)
        ├── WhatToLookForCard (enhanced: nose shadow, catchlights, etc.)
        ├── QuickFixesCard (enhanced with more fixes)
        ├── OtherSetupsCard (enhanced with substitutions section)
        └── StickyBottomBar
```

---

## D. Recommended File Structure

```
ui/src/
├── main.jsx
├── App.jsx
│
├── context/
│   └── AppContext.jsx          # Keep, extend state model
│
├── theme/
│   └── tokens.css              # NEW — all design tokens
│
├── styles/
│   ├── reset.css               # NEW — extracted from app.css
│   ├── layout.css              # NEW — screen, sticky-bar, header
│   ├── components.css          # NEW — chips, buttons, cards, toggles
│   └── results.css             # NEW — result card styles
│
├── screens/
│   ├── WelcomeScreen.jsx       # Keep, update copy
│   ├── SetupWizard.jsx         # NEW — replaces MoodPickerScreen + GearInputScreen
│   ├── LoadingScreen.jsx       # Keep
│   └── ResultsScreen.jsx       # Keep, extend with new cards
│
├── wizard/                     # NEW — wizard step components
│   ├── WizardProgress.jsx
│   ├── StepMood.jsx
│   ├── StepSubject.jsx
│   ├── StepEnvironment.jsx
│   ├── StepCeiling.jsx
│   ├── StepGearQuestion.jsx
│   └── StepGearEntry.jsx
│
├── components/
│   ├── AppHeader.jsx           # Keep
│   ├── IntentCard.jsx          # Keep
│   ├── MoodTile.jsx            # Keep
│   ├── ChipSelect.jsx          # NEW — generic chip selector
│   ├── ChipStepper.jsx         # NEW — chip with ×N and +/−
│   ├── StickyBottomBar.jsx     # Keep
│   └── ReliabilityDots.jsx     # Keep
│   ├── GearModeToggle.jsx      # DELETE — replaced by StepGearQuestion
│   ├── LightEntry.jsx          # DELETE — replaced by StepGearEntry chips
│   └── ModifierChips.jsx       # DELETE — absorbed into StepGearEntry
│
├── cards/
│   ├── BestMatchCard.jsx       # Keep, update styling
│   ├── ShootSetupCard.jsx      # Keep, extend data fields
│   ├── SpaceCheckCard.jsx      # Keep, extend data fields
│   ├── DiagramCard.jsx         # Keep, extend with more distances
│   ├── CameraSubjectCard.jsx   # NEW — camera + subject + background
│   ├── HowToTestCard.jsx       # Keep (already enhanced)
│   ├── WhatToLookForCard.jsx   # Keep, extend content
│   ├── QuickFixesCard.jsx      # Keep, extend content
│   └── OtherSetupsCard.jsx     # Keep, add substitutions section
│   └── CameraSettingsCard.jsx  # DELETE — merged into CameraSubjectCard
│
├── data/
│   ├── gearPresets.js          # Keep, extend with new gear catalog
│   ├── subjectTypes.js         # NEW
│   ├── environments.js         # NEW
│   └── ceilingOptions.js       # NEW
│
├── coaching.js                 # Keep, extend per-mood content
├── transform.js                # Keep, extend output shape
└── api.js                      # Keep
```

Single `app.css` → split into 4 focused files imported from `main.jsx`.
The split makes it tractable to swap in the new Studio Dark Pro palette
without touching layout/component rules.

---

## E. UI State / Data Model

Extend AppContext state:

```javascript
const initialState = {
  // ── navigation ──────────────────────
  screen: 'welcome',       // 'welcome' | 'wizard' | 'loading' | 'results'
  history: [],

  // ── wizard state ────────────────────
  intent: null,             // 'mood' | 'kit'
  wizardStep: 0,            // current step index
  wizardSteps: [],          // computed step list based on intent

  // ── setup inputs ────────────────────
  mood: null,               // 'beauty' | 'cinematic' | ...
  subjectType: null,        // 'headshot' | 'half_body' | 'full_body' | ...
  environment: null,        // 'studio' | 'home_studio' | 'office' | ...
  ceilingHeight: null,      // 'under_8' | '8_9' | '10_12' | '12_plus'
  gearMode: null,           // 'my_gear' | 'best_setup'

  // ── gear inventory (chip-based) ─────
  gear: {
    lights: [],             // [{ type: 'speedlight', qty: 2 }, ...]
    modifiers: [],          // ['softbox', 'beauty_dish', ...]
    support: [],            // [{ type: 'c_stand', qty: 3 }, ...]
  },

  // ── results ─────────────────────────
  loading: false,
  apiResponse: null,
  result: null,
  error: null,
};
```

Key changes from current state:
- `lights` array with full feature objects → `gear.lights` array with type + qty
- `modifiers` flat array stays but moves under `gear`
- New fields: `subjectType`, `environment`, `ceilingHeight`
- `wizardStep` + `wizardSteps` for wizard navigation
- `gearMode` decision moves to a wizard step instead of a toggle on gear screen
- Screen enum shrinks: 'mood' and 'gear' become 'wizard'

New reducer actions:
```
SET_INTENT          → sets intent, computes wizardSteps
WIZARD_NEXT         → increment wizardStep (or submit if last)
WIZARD_BACK         → decrement wizardStep (or go to welcome if step 0)
SET_SUBJECT_TYPE    → set subjectType
SET_ENVIRONMENT     → set environment
SET_CEILING_HEIGHT  → set ceilingHeight
SET_GEAR_MODE       → set gearMode
ADD_GEAR_LIGHT      → add { type, qty: 1 } to gear.lights
REMOVE_GEAR_LIGHT   → remove from gear.lights
UPDATE_GEAR_QTY     → update qty for a gear.lights entry
TOGGLE_MODIFIER     → toggle in gear.modifiers (keep)
ADD_SUPPORT_GEAR    → add to gear.support
REMOVE_SUPPORT_GEAR → remove from gear.support
SET_MOOD            → keep
SET_LOADING         → keep
SET_RESULT          → keep
SET_ERROR           → keep
RESET               → keep
```

Wizard step computation:
```javascript
function computeSteps(intent) {
  if (intent === 'mood') {
    // Light a Mood path
    return ['mood', 'subject', 'environment', 'ceiling', 'gear_question'];
    // gear_question may append 'gear_entry' dynamically
  }
  if (intent === 'kit') {
    // Use My Kit path
    return ['subject', 'mood', 'environment', 'ceiling', 'gear_entry'];
  }
}
```

---

## F. Result Card Presentation Model

### Card 1: Best Match
```javascript
{
  name: "Strobe",                          // from lightName()
  reliabilityLevel: "Reliable",            // mapped from score
  reliabilityDots: 4,                      // 1–5
  whyThisWorks: "Strong color accuracy..." // renamed from rationale
}
```
UI: Hero card with gradient border. Large name, reliability badge, "Why This Works" paragraph.

### Card 2: Shoot This Setup
```javascript
{
  lights: [{
    role: "Key Light",
    modifier: "Beauty Dish",
    angle: "20° camera-right",
    height: "20 in above forehead",         // NEW — human height description
    distanceFromSubject: "5 ft",
    distanceFromBackground: null,           // only for bg lights
    purpose: "Punchy, directional key",     // NEW
  }]
}
```
UI: Each light is a mini-card with role as colored header. Key fields as label/value rows.

### Card 3: Space Check
```javascript
{
  minCeilingFt: "8.5",
  recommendedCeilingFt: "10",              // NEW
  minWidthFt: "12.5",
  minDepthFt: "12.8",
  subjectToBackgroundFt: "6–8",            // NEW
  cameraToSubjectFt: "8–10",              // NEW
  warnings: ["Tight with 8 ft ceiling..."],
  ceilingNote: "Works in 10 ft ceiling",   // NEW
}
```

### Card 4: Diagram
Keep current canvas renderer. Extend to show:
- All distance labels (light→subject, camera→subject, subject→background)
- Background light → background distance if applicable
- Ensure labels don't overlap (already has collision avoidance)

### Card 5: Camera & Subject (NEW — replaces CameraSettingsCard)
```javascript
{
  camera: {
    lens: "85–105mm",                      // NEW
    height: "At subject eye level",        // NEW
    angle: "Straight-on",                  // NEW
    distanceFromSubject: "8–10 ft",        // NEW
    aperture: "f/5.6 – f/8",
    iso: "100",
    shutter: "1/160",
    wb: "5500 K",
    tip: "Shoot at f/5.6–f/8 for full sharpness",
  },
  subject: {                               // NEW
    distanceFromBackground: "6–8 ft",
    poseNote: "Slight chin down, eyes to lens",
  },
  background: {                            // NEW — only if bg light exists
    lightDistance: "3 ft from backdrop",
    intendedLook: "1–2 stops over key for pure white",
  }
}
```
UI: Three sections inside one card — Camera / Subject / Background.

### Card 6: How to Test This Setup
Already enhanced with meter + exposure steps. Keep as-is.

### Card 7: What to Look For
Extend coaching.js `goodSigns` and `warnings` per mood to include:
```javascript
{
  goodSigns: [
    "Clean catchlight in the key-side eye",
    "Short nose shadow ending mid-cheek",
    "Defined jawline without harsh edge",
    "Balanced rim separation on shoulders",
    "Background at target brightness",
  ],
  warnings: [
    "Nose shadow too long → key is too high",
    "Face looks flat → fill is too strong or too close",
    "Rim blowing out hair → rim is too close or too powerful",
    "No subject separation → move subject farther from background",
    "Catchlight too high in eye → lower the key light",
    "Background too bright → reduce bg light or increase subject-bg distance",
    "Highlight clipping on skin → reduce key power or close down aperture",
  ]
}
```

### Card 8: Quick Fixes
Extend per-mood fixes to always include the universal set:
```javascript
[
  { problem: "Face too flat",           fix: "Reduce fill power or move fill back" },
  { problem: "Nose shadow too long",    fix: "Lower the key or move it more front-on" },
  { problem: "Rim too hot",             fix: "Move rim farther back or feather it" },
  { problem: "No separation",           fix: "Move subject 4+ ft from background" },
  { problem: "Catchlight too high",     fix: "Lower key to just above eye level" },
  { problem: "Background too bright",   fix: "Reduce bg light or increase subject-bg distance" },
  { problem: "Shadow too harsh",        fix: "Move key closer or use a larger modifier" },
]
```

### Card 9: Other Setups You Could Try
Keep alternatives section. Add substitutions subsection:
```javascript
{
  alternatives: [{ name, gapLabel, tradeoff }],
  substitutions: [                         // NEW
    "Swap beauty dish for 3 ft octa — softer, similar coverage",
    "Replace rim with V-flat bounce — less gear, natural feel",
  ]
}
```

---

## G. Theme / Token System

### tokens.css

```css
:root {
  /* ── Palette: Studio Dark Pro ───────── */
  --color-bg:            #0E0F12;
  --color-surface:       #17191F;
  --color-surface-elevated: #1E2129;
  --color-text:          #F4F6F8;
  --color-text-secondary:#A9AFBB;
  --color-border:        #2A2E38;

  --color-accent:        #4DA3FF;
  --color-accent-hover:  #3B8EE6;
  --color-accent-subtle: rgba(77, 163, 255, 0.12);

  --color-success:       #39D98A;
  --color-success-subtle:rgba(57, 217, 138, 0.12);
  --color-warning:       #F5B041;
  --color-warning-subtle:rgba(245, 176, 65, 0.10);
  --color-error:         #FF5D5D;
  --color-error-subtle:  rgba(255, 93, 93, 0.10);
  --color-creative:      #9B7CFF;
  --color-creative-subtle:rgba(155, 124, 255, 0.10);

  /* ── Spacing ────────────────────────── */
  --space-xs:  4px;
  --space-sm:  8px;
  --space-md:  12px;
  --space-lg:  16px;
  --space-xl:  20px;
  --space-2xl: 24px;
  --space-3xl: 32px;
  --space-4xl: 40px;

  /* ── Radius ─────────────────────────── */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-full: 999px;

  /* ── Typography ─────────────────────── */
  --font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display",
                 "Segoe UI", Roboto, sans-serif;
  --font-mono:   "SF Mono", "Fira Code", "Cascadia Code", monospace;

  --text-xs:   0.6875rem;  /* 11px */
  --text-sm:   0.75rem;    /* 12px */
  --text-base: 0.875rem;   /* 14px */
  --text-md:   0.9375rem;  /* 15px */
  --text-lg:   1.0625rem;  /* 17px */
  --text-xl:   1.25rem;    /* 20px */
  --text-2xl:  1.5rem;     /* 24px */
  --text-3xl:  1.75rem;    /* 28px */

  --weight-normal: 400;
  --weight-medium: 500;
  --weight-semibold: 600;
  --weight-bold:  700;
  --weight-black: 800;

  /* ── Elevation ──────────────────────── */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.3);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.4);
  --shadow-lg: 0 8px 24px rgba(0,0,0,0.5);

  /* ── Safe areas ─────────────────────── */
  --safe-bottom: env(safe-area-inset-bottom, 0px);
  --safe-top:    env(safe-area-inset-top, 0px);

  /* ── Tap targets ────────────────────── */
  --min-tap: 44px;

  /* ── Transitions ────────────────────── */
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --duration-fast: 0.15s;
  --duration-normal: 0.25s;
}
```

Light role colors (used in diagram and Shoot This Setup):
```css
  --color-key:  #F5B041;   /* warm amber */
  --color-fill: #4DA3FF;   /* blue accent */
  --color-rim:  #9B7CFF;   /* creative purple */
  --color-bg-light: #39D98A; /* green for bg light */
  --color-hair: #FF5D5D;   /* red for hair light */
```

---

## H. Priority Implementation Plan

### Phase 1: Foundation (do first)
Theme swap + CSS restructure.
**Files:** Split `app.css` into `tokens.css`, `reset.css`, `layout.css`, `components.css`, `results.css`.
Swap all color values to new Studio Dark Pro tokens.
This is high-impact, low-risk — everything looks better immediately.

### Phase 2: Wizard Architecture
Replace MoodPickerScreen + GearInputScreen with SetupWizard.
**New files:** `SetupWizard.jsx`, `WizardProgress.jsx`, `StepMood.jsx`, `StepSubject.jsx`, `StepEnvironment.jsx`, `StepCeiling.jsx`, `StepGearQuestion.jsx`, `StepGearEntry.jsx`
**New data files:** `subjectTypes.js`, `environments.js`, `ceilingOptions.js`
**State changes:** Extend AppContext with wizard state, new fields, new actions.
**Delete:** `GearModeToggle.jsx`, `LightEntry.jsx`, `ModifierChips.jsx`, `MoodPickerScreen.jsx`, `GearInputScreen.jsx`

### Phase 3: Chip-Based Gear Entry
Build `ChipSelect.jsx` (generic toggle chip grid) and `ChipStepper.jsx` (chip with quantity ×N and +/− buttons).
Rewrite gear presets to a flat catalog suitable for chip rendering.
Build `StepGearEntry.jsx` using chip components in three sections (Lights, Modifiers, Support).

### Phase 4: Enhanced Result Cards
Add `CameraSubjectCard.jsx`. Extend `transform.js` to produce camera/subject/background guidance.
Extend `coaching.js` with per-mood camera, subject, and background defaults.
Update `ShootSetupCard` to show purpose per light.
Update `SpaceCheckCard` with ceiling notes, camera-to-subject, subject-to-background.
Update `WhatToLookForCard` with nose/catchlight/jawline specifics.
Update `QuickFixesCard` with universal photographer fixes.
Update `OtherSetupsCard` with substitutions subsection.
Update `DiagramCard` to render all distance labels.
Delete `CameraSettingsCard.jsx` (merged into CameraSubjectCard).

### Phase 5: Copy & Language Polish
Final pass on all UI copy using the language rules in this plan (section I).
Verify no "winner", "confidence", "top picks" language leaks through.
Update reliability label mapping in transform.js.

### Phase 6: Premium UX (stretch)
- Sticky bottom bar with Adapt/Rebuild/Use Fewer Lights actions
- Setup checklist mode (tappable checkboxes on How to Test steps)
- Diagram tap → bottom sheet with light detail
- Subtle card entrance animations (opacity + translateY on mount)
- Smooth wizard step transitions (slide left/right)

---

## I. Implementation-Ready UI Copy

### Welcome Screen
```
Heading: "How are we shooting?"

Card 1:
  Label: "Light a Mood"
  Desc:  "Pick the vibe, we build the setup"
  Emoji: 🎨

Card 2:
  Label: "Use My Kit"
  Desc:  "Tell us your gear, we dial it in"
  Emoji: 📷
```

### Wizard Steps
```
Mood:
  Heading: "What's the vibe?"
  Button:  "Next →"

Subject:
  Heading: "Who are we shooting?"
  Chips: Headshot · Half Body · Full Body · Couple · Small Group
         Product · Food · Interior
  Button:  "Next →"

Environment:
  Heading: "Where are we?"
  Chips: Studio · Home Studio · Office · On Location · Outdoors · Small Room
  Button:  "Next →"

Ceiling:
  Heading: "Ceiling height?"
  Chips: Under 8 ft · 8–9 ft · 10–12 ft · 12+ ft / Outdoors
  Button:  "Next →"

Gear Question:
  Heading: "Building around your gear?"
  Card 1: "Use My Gear" / "We'll work with what you have"
  Card 2: "Best Possible Setup" / "Show me the ideal rig"

Gear Entry:
  Heading: "What's in your kit?"
  Section labels: "LIGHTS" · "MODIFIERS" · "SUPPORT"
  Button: "Get My Setup →"
```

### Gear Chip Labels
```
Lights:
  Speedlight · AD200 · AD400 · AD600 · B10 · LED Panel
  COB LED · Tube Light · Strobe Pack · Monolight · Ring Light
  Window / Natural

Modifiers:
  Softbox · Octabox · Beauty Dish · Stripbox · Umbrella
  Grid · Reflector · V-Flat · Snoot · Barn Doors · Scrim

Support:
  C-Stand · Light Stand · Boom Arm · Background Stand · Sandbag
  Apple Box · Clamps
```

### Loading
```
Icon: ⚡
Text: "Building your setup..."
```

### Results Cards
```
Card 1: "Best Match"
  Badge: "Reliable" (or Very Reliable / Good Option / Experimental / Not Ideal)
  Section: "Why This Works"

Card 2: "Shoot This Setup"
  Per light: Role · Modifier · Height · Distance · Angle · Purpose

Card 3: "Space Check"
  Labels: Minimum ceiling · Recommended ceiling · Working area
          Camera to subject · Subject to background

Card 4: "Lighting Diagram"

Card 5: "Camera & Subject"
  Sections: Camera · Subject · Background
  Camera fields: Lens · Height · Angle · Distance · Settings · White Balance
  Subject fields: Distance from Background · Pose Notes
  Background fields: Light Distance · Intended Look

Card 6: "How to Test This Setup"

Card 7: "What to Look For"
  Section 1: "Good signs"
  Section 2: "Watch out for"

Card 8: "Quick Fixes"
  Format: "If [problem] → [fix]"

Card 9: "Other Setups You Could Try"
  Subsection: "Substitutions"
```

### Sticky Actions
```
Primary row:
  "Edit Setup" (secondary button)
  "Share 📋" (ghost button)

Future actions (Phase 6):
  "Adapt" · "Rebuild" · "Use Fewer Lights"
  Sub-actions: "Make It Softer" · "More Dramatic" · "Low Ceiling" · "Portable"
```

### Reliability Labels (transform.js mapping)
```
90–100 → "Very Reliable"    (5 dots, success color)
75–89  → "Reliable"         (4 dots, success color)
60–74  → "Good Option"      (3 dots, accent color)
40–59  → "Experimental"     (2 dots, warning color)
below 40 → "Not Ideal"      (1 dot, error color)
```

---

## Components to Replace or Delete

| Current File | Action | Reason |
|---|---|---|
| `MoodPickerScreen.jsx` | **DELETE** | Absorbed into `SetupWizard` → `StepMood` |
| `GearInputScreen.jsx` | **DELETE** | Absorbed into `SetupWizard` → `StepGearEntry` |
| `GearModeToggle.jsx` | **DELETE** | Replaced by `StepGearQuestion` |
| `LightEntry.jsx` | **DELETE** | Replaced by `ChipStepper` in `StepGearEntry` |
| `ModifierChips.jsx` | **DELETE** | Absorbed into `StepGearEntry` |
| `CameraSettingsCard.jsx` | **DELETE** | Merged into new `CameraSubjectCard` |
| `app.css` | **REPLACE** | Split into 4 files + tokens.css |
| `WelcomeScreen.jsx` | **KEEP** | Update copy only (already done) |
| `ResultsScreen.jsx` | **KEEP** | Add CameraSubjectCard, update card order |
| `BestMatchCard.jsx` | **KEEP** | Restyle with new tokens, add "Why This Works" |
| `DiagramCard.jsx` | **KEEP** | Extend with distance labels |
| `AppContext.jsx` | **KEEP** | Extend with wizard state + new fields |
| `transform.js` | **KEEP** | Extend output shape |
| `coaching.js` | **KEEP** | Extend per-mood content |
| `gearPresets.js` | **KEEP** | Extend gear catalog for chip-based entry |
