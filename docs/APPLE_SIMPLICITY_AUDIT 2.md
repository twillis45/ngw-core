# Apple Simplicity Audit — Pro Photographer Workflow

> **Date:** 2026-04-12
> **Lens:** Working portrait/beauty/fashion photographer on set, iPhone in hand, just analyzed a reference photo. What do they need RIGHT NOW to rebuild this light?
> **Principle:** Apple one-hero-per-view, progressive disclosure, information hierarchy. Only show what matters to the job.

---

## Priority Matrix

| Priority | What photographer needs | Time budget |
|----------|------------------------|-------------|
| **P1 — Glance** | Pattern name, confidence, modifier type, key position | < 1 second |
| **P2 — Study** | Diagram, modifier specs, shadow direction | 5-10 seconds |
| **P3 — Curious** | Catchlight details, runner-up candidates, color palette | Only if interested |
| **P4 — Engineer** | Raw signals, iris %, asymmetry %, pass reliability | Never on set |

---

## Screens Passing

### Home Screen — PASS
Already Apple-simple. One photo, one button. Viewfinder metaphor is strong. EXIF strip is useful context. No action needed.

### Processing Screen — PASS
Photo dimmed, timer counting, stage cycling, pattern tease reveal. Single focus, no competing elements. No action needed.

---

## Result Screen — Findings

### R-1: THE LIGHT section has no hero (MEDIUM)
- **Location:** `ResultScreen.jsx` ~lines 2537-2635, `PatternBars` component ~lines 1067-1236
- **Problem:** The 200px mobile clip shows up to 3-4 pattern candidates (72px face icons + one-line definitions + confidence bars) AND the Signal sublabel + ShadowSignature widget, all at similar visual weight. Runner-up patterns compete with the winning answer.
- **Photographer impact:** A photographer on set doesn't need to see that Loop scored 22% and Flat scored 8%. They need THE answer: "Rembrandt, 87% confidence."
- **Apple approach:** Show ONLY the winning pattern prominently (already on the VF overlay — good). Below the fold: diagram, modifier, rebuild specs. Runner-up candidates → behind a "See other candidates" disclosure toggle, not front and center.
- **Fix:** Collapse runner-up pattern bars behind a toggle. Show only the #1 candidate by default. Move Signal/ShadowSignature into the expanded state or into DETAIL.
- **Impact:** HIGH — reduces initial scroll by ~150px, focuses on THE answer
- **Effort:** LOW
- **Status:** DONE (2026-04-12) — Runner-ups collapsed behind "N OTHER CANDIDATES" toggle

### R-2: Catchlight chip soup in THE SETUP (MEDIUM)
- **Location:** `ResultScreen.jsx` ~lines 2644-2680
- **Problem:** The catchlight section fires 4 chips at identical visual weight:
  - `POSITION · 10 O'CLOCK`
  - `SHAPE · ROUND`
  - `COVERAGE · WIDE`
  - `SHADOW 76°`
  Four small chips of identical size/styling = four things competing for eye. The shadow angle is already shown in the dial widget above. Coverage repeats what the iris scale shows below.
- **Photographer impact:** A photographer needs: "Round catchlight at 10 o'clock." One sentence. Not four chips.
- **Apple approach:** One clean catchlight summary line replacing the chip row.
- **Fix:** Replace 4 chips with a single descriptive line: "Round catchlight at 10 o'clock · Wide coverage"
- **Impact:** HIGH — removes 4 competing elements, replaces with 1 readable statement
- **Effort:** LOW
- **Status:** DONE (2026-04-12) — Replaced with "Round at 10 o'clock" summary + quiet coverage line

### R-3: Iris Coverage Scale is engineer-facing (MEDIUM)
- **Location:** `ResultScreen.jsx` ~lines 1269-1377, `IrisCoverageScale` component
- **Problem:** Banded ruler (TINY/SMALL/MEDIUM/LARGE/HUGE) with numeric "12.3% iris" readout and angular area takes ~80px of vertical real estate. A photographer doesn't think in iris-diameter percentages. They think "is it a big soft source or a small hard source?" The band label alone ("MEDIUM") already tells them this.
- **Photographer impact:** The modifier family + size label ("Large Octabox") already implies source size. The ruler is engineering proof, not photographer utility.
- **Apple approach:** Fold into the catchlight summary as a single inline label: "Medium apparent source" — or remove entirely since modifier size communicates this.
- **Fix:** Replace IrisCoverageScale widget with a compact inline indicator or fold the band label into the catchlight summary line (from R-2 fix).
- **Impact:** MEDIUM — reclaims ~80px vertical space, removes engineer metric
- **Effort:** MEDIUM
- **Status:** DONE (2026-04-12) — Replaced banded ruler with compact "APPARENT SOURCE · Large" inline label

### R-4: DETAIL drawer mixes photographer + engineer data (LOW)
- **Location:** `ResultScreen.jsx` ~lines 2757-2964, `PullTabDrawer label="DETAIL"`
- **Problem:** Inside one expandable drawer:
  - Scene description → useful (photographer context)
  - Color palette → useful (helps match the vibe)
  - Signal strength bar → engineer metric
  - Raw signals (nose shadow °, L/R asymmetry %, shadow density %, highlight width %) → engineer metrics
  - Pass reliability chips → engine diagnostics
  - Supporting/contradicting bullet lists → verbose engine reasoning
  - Reasoning narrative → useful
- **Photographer impact:** A photographer opening "DETAIL" expects scene context and color info. They don't expect SignalGauge widgets and "PASS RELIABILITY" chips.
- **Apple approach:** Split into "Scene & Color" (photographer-facing, always in DETAIL) vs. "Engine Diagnostics" (hidden behind an advanced/developer toggle or removed from default view entirely).
- **Fix:** Move raw signals, pass reliability, supporting/contradicting lists into a separate collapsible "Diagnostics" sub-section or a developer-only mode.
- **Impact:** MEDIUM — cleaner progressive disclosure
- **Effort:** MEDIUM
- **Status:** DONE (2026-04-12) — Signal strength + reasoning stay visible; raw signals/pass reliability/supporting/contradicting moved into collapsed "ENGINE DIAGNOSTICS" disclosure

### R-5: Shadow angle shown in 3 places (LOW)
- **Location:** `ResultScreen.jsx` — catchlight chips (~2676), ShadowSignature (~2566), DirectionalCompass (~2583)
- **Problem:** The nose shadow angle appears as:
  1. A chip (`SHADOW 76°`) in the catchlight row
  2. The ShadowSignature dial widget (full angle compass)
  3. Part of the DirectionalCompass component
  Same data, three visual presentations.
- **Photographer impact:** Repetition creates noise. Photographers need the info ONCE, clearly.
- **Apple approach:** Show it in the strongest presentation (the dial widget). Remove the redundant chip.
- **Fix:** Remove `SHADOW {angle}°` chip from catchlight row. The ShadowSignature dial already presents this data in a richer, more visual way.
- **Impact:** LOW — removes 1 redundant chip
- **Effort:** TRIVIAL
- **Status:** DONE (2026-04-12) — Shadow chip removed as part of R-2 catchlight rewrite

### R-6: Mobile clip boundary cuts mid-candidate (LOW)
- **Location:** `ResultScreen.jsx` ~lines 2546-2611
- **Problem:** THE LIGHT section clips at a fixed 200px on mobile. This typically shows ~2 pattern candidates partially visible, creating a "something is cut off" feel rather than a clean boundary.
- **Photographer impact:** Partial visibility of the 2nd candidate looks broken, not intentional.
- **Apple approach:** Clip AFTER the #1 pattern + its confidence bar — a clean boundary. Or make the clip height dynamic based on the #1 candidate's rendered height.
- **Fix:** Change maxHeight from fixed 200px to dynamic value based on first candidate height, or clip at a natural boundary.
- **Impact:** LOW — cleaner truncation UX
- **Effort:** TRIVIAL
- **Status:** DONE (2026-04-12) — Reduced from 200px to 140px; clips cleanly after leader + toggle

---

## Setup Screen — Findings

### S-1: Long-press-to-reveal is undiscoverable (LOW)
- **Location:** `SetupScreen.jsx` — LongPressSpec cards
- **Problem:** LongPressSpec cards show "HOLD" as a hint, but long-press for secondary values is not standard mobile UX. Many photographers will never discover these values.
- **Photographer impact:** Hidden data = lost data for most users.
- **Apple approach:** Show the value. If it needs hierarchy, make it smaller/lighter text. Don't hide data behind a non-standard gesture.
- **Fix:** Show secondary values by default at reduced opacity/size. Remove the long-press mechanic.
- **Impact:** LOW
- **Effort:** LOW
- **Status:** DONE (2026-04-12) — Already fixed: all callers pass `alwaysRevealed`, HOLD hint never appears

### S-2: Flip card hint is barely visible (LOW)
- **Location:** `SetupScreen.jsx` — "TAP FOR DIAGRAM" / "TAP FOR SPECS" labels
- **Problem:** Flip hint text at steel(0.58) is the only indication the card is flippable. The metaphor is great but the hint is easy to miss.
- **Photographer impact:** Photographers might not realize the diagram exists on the back of the card.
- **Apple approach:** Slightly stronger hint on first view, or auto-flip briefly on entry as a teaching moment.
- **Fix:** Bump hint to steel(0.65) or add a subtle flip icon. Consider a one-time auto-peek animation on first visit.
- **Impact:** LOW
- **Effort:** LOW
- **Status:** DONE (2026-04-12) — Bumped from steel(0.58) to steel(0.65) + added ↻ flip icon glyph

---

## Cross-Screen Pattern Issues

### X-1: Modifier appears in too many forms (LOW)
- **Location:** ResultScreen — Lighting Summary Strip (~2428), THE SETUP ModifierEmission (~2717), Chip in summary strip (~2435), ModifierDetail grid (~2723), physicalMeaning narrative (~2727)
- **Problem:** The modifier appears as:
  1. ModifierSilhouette (36px) in the Lighting Summary Strip
  2. ModifierEmission (88px) in THE SETUP section
  3. Modifier family as a Chip in the summary strip
  4. Modifier family + size in the hero ModifierDetail grid
  5. physicalMeaning narrative text below
  Five representations of the same thing.
- **Apple approach:** Show it ONCE, big, with the name underneath. Then specs in a clean list.
- **Fix:** Consolidate modifier presentations. Remove the redundant chip and small silhouette from the summary strip — the large ModifierEmission in THE SETUP is the hero presentation.
- **Impact:** LOW
- **Effort:** MEDIUM
- **Status:** DONE (2026-04-12) — Removed ModifierSilhouette (36px) + modifier family chip from Lighting Summary Strip. Strip now shows only key direction + light quality. 28px silhouette on VF overlay retained (different context)

---

## Recommended Execution Order

| Order | Finding | Impact | Effort | Combined |
|-------|---------|--------|--------|----------|
| 1 | R-1 + R-2 | HIGH | LOW | Best ROI — do together |
| 2 | R-5 | LOW | TRIVIAL | Quick win while in ResultScreen |
| 3 | R-3 | MEDIUM | MEDIUM | Natural follow-on to R-2 |
| 4 | R-6 | LOW | TRIVIAL | Quick win |
| 5 | R-4 | MEDIUM | MEDIUM | Requires DETAIL drawer restructure |
| 6 | S-1 | LOW | LOW | SetupScreen pass |
| 7 | S-2 | LOW | LOW | SetupScreen pass |
| 8 | X-1 | LOW | MEDIUM | Cross-screen consolidation |

**Highest-impact single change:** R-1 + R-2 together. Collapse runner-up patterns behind a toggle AND replace the 4-chip catchlight row with a single clean statement. This alone removes ~200px of competing information from the initial view and focuses the photographer on what matters: the answer and the rebuild.

---

## Audit #2 — Settings & Shoot Mode / Cockpit (2026-04-12)

### Day1ShootScreen (Studio Matte Cockpit)

### C-1: Photographer cockpit spec grid too dense (MEDIUM)
- **Location:** `Day1ShootScreen.jsx` PhotographerBody, ~line 1200
- **Problem:** 4-column spec grid (ANGLE/DIST/HEIGHT/CCT) at 8px labels duplicates the active step's hero number. CCT not actionable on set.
- **Fix:** Replaced 4-cell grid with compact single-line summary: "45° · 4ft · Eye level". Removed CCT from cockpit. Card shrunk from 16px padding/16px radius to 12px/12px.
- **Impact:** HIGH — reduces cognitive load during active shooting
- **Effort:** LOW
- **Status:** DONE (2026-04-12)

### C-2: Coaching panel competes with step instruction (MEDIUM)
- **Location:** `Day1ShootScreen.jsx` CoachingPanel, ~line 1286
- **Problem:** LOOK FOR + FIXES bullets shown expanded below every step. ~120px of diagnostic content competing with the step's hero instruction.
- **Fix:** Created CoachingDisclosure wrapper. Photographer mode: collapsed behind "TIPS" toggle. Learning mode: collapsed behind "TROUBLESHOOTING" toggle. Only shown on demand.
- **Impact:** HIGH — ~120px saved per step, focuses on the action
- **Effort:** LOW
- **Status:** DONE (2026-04-12)

### C-3: Assistant mode coaching line is cryptic (LOW)
- **Location:** `Day1ShootScreen.jsx` AssistantBody, ~line 1425
- **Problem:** "IF {symptom} → {fix}" uppercase line adds decision overhead for a grip/assistant who needs a single command.
- **Fix:** Removed coaching line entirely. Assistant mode: verb + value + done.
- **Impact:** LOW
- **Effort:** TRIVIAL
- **Status:** DONE (2026-04-12)

### C-4: Learning mode WHY + coaching creates wall of text (LOW)
- **Location:** `Day1ShootScreen.jsx` LearningBody, ~line 1505
- **Problem:** WHY callout (60-80 words) + expanded coaching panel = 2+ viewports per step.
- **Fix:** Coaching now collapsed behind "TROUBLESHOOTING" toggle in learning mode too. WHY block already covers educational angle.
- **Impact:** LOW
- **Effort:** TRIVIAL
- **Status:** DONE (2026-04-12)

### ShootModeScreen (Full Shoot Mode)

### SM-1: Cockpit header has too many buttons (MEDIUM)
- **Location:** `ShootModeScreen.jsx` cockpit header, ~line 727
- **Problem:** 5-6 interactive elements in header: Active Setup label, setup name, pattern, wake lock badge, Live button, Team button, Role Switch button.
- **Fix:** Stripped header to setup name + pattern only. Wake lock status folded into pattern line. Live, Team, Role Switch moved to ••• action sheet.
- **Impact:** HIGH — header becomes scannable
- **Effort:** MEDIUM
- **Status:** DONE (2026-04-12)

### SM-2: Live View button in header AND bottom bar (LOW)
- **Location:** `ShootModeScreen.jsx` line ~743 (header) + line ~939 (bottom bar)
- **Problem:** Same action in two locations.
- **Fix:** Removed from header as part of SM-1. Kept in bottom bar only.
- **Impact:** LOW
- **Effort:** TRIVIAL
- **Status:** DONE (2026-04-12) — part of SM-1

### SM-3: Bottom bar center button has 4 label states (LOW)
- **Location:** `ShootModeScreen.jsx` bottom bar, ~line 905
- **Problem:** Single button label swaps between Retest/Close/Verify/Next depending on state. Cognitive load under pressure.
- **Fix:** Split into 3 context-specific bottom bars: (1) Normal stepping: "Next Step" / "Test Shot", (2) Test shot mode: "Cancel" + "Retest", (3) Locked: full-width "Done". Each state gets its own clear layout.
- **Impact:** LOW
- **Effort:** MEDIUM
- **Status:** DONE (2026-04-12)

### SM-4: Progress section shows 4 simultaneous indicators (MEDIUM)
- **Location:** `ShootModeScreen.jsx` progress section, ~line 839
- **Problem:** "Step 2 of 4 · 50% complete" + progress bar + "~8 min estimated" + signal text = 4 indicators.
- **Fix:** Reduced to "Step 2 of 4" + thin progress bar. Percentage, time estimate, and signal text removed. Locked status shown as inline " · Locked" badge.
- **Impact:** MEDIUM
- **Effort:** LOW
- **Status:** DONE (2026-04-12)

### Settings Screens

### SET-1: Day1SettingsScreen — PASS
- Clean 3-screen hierarchy. No Apple simplicity issues.

### SET-2: DEV TOOLS visible to all users — PASS (already gated)
- **Location:** `SettingsScreen.jsx` ~line 671
- Initially flagged, but on code review: DEV TOOLS are already behind `isEnabled('enable_lab')` which requires a hidden 7-tap gesture on the version label. Already follows Apple's "tap version 7 times" pattern. No fix needed.

### SET-3: Two parallel Settings implementations — TRACKED AS DEBT
- `Day1SettingsScreen.jsx` (inline styles) vs `SettingsScreen.jsx` (CSS classes)
- Different feature sets, different styling. Technical debt, not a UX issue.
- **Status:** DEFERRED — consolidation task

---

## Audit #2 Summary

| Finding | Screen | Impact | Effort | Status |
|---------|--------|--------|--------|--------|
| **C-1** | Day1ShootScreen | HIGH | LOW | DONE |
| **C-2** | Day1ShootScreen | HIGH | LOW | DONE |
| **C-3** | Day1ShootScreen | LOW | TRIVIAL | DONE |
| **C-4** | Day1ShootScreen | LOW | TRIVIAL | DONE |
| **SM-1** | ShootModeScreen | HIGH | MEDIUM | DONE |
| **SM-2** | ShootModeScreen | LOW | TRIVIAL | DONE (part of SM-1) |
| **SM-3** | ShootModeScreen | LOW | MEDIUM | DONE |
| **SM-4** | ShootModeScreen | MEDIUM | LOW | DONE |
| SET-1 | Day1SettingsScreen | — | — | PASS |
| SET-2 | SettingsScreen | — | — | PASS (already gated) |
| SET-3 | Both Settings | LOW | HIGH | DEFERRED (debt) |

---

## Aesthetic Pass — Studio Matte Surface Treatment (2026-04-12)

### AES-1: Settings screens missing camera/lighting aesthetic (MEDIUM)
- **Location:** `Day1SettingsScreen.jsx` — all 3 sub-screens (main, preferences, account)
- **Problem:** Settings used flat `C.bg` background with no grain, vignette, or specular edge. Transitioning from the home screen's matte-metal viewfinder into settings felt like entering a generic dark-mode iOS app — broke the camera-body aesthetic.
- **Fix:** Added `MatteBackground variant="subdued"` (the canonical shared surface component from `_shared/MatteBackground.jsx`) to all 3 sub-screens. Updated `ScreenHeader` to use frosted glass (`backdrop-filter: blur(12px)` + semi-transparent bg) instead of solid `C.bg`, so grain shows through when scrolling.
- **Refactoring note:** Initially created a duplicate `MatteSurface` in components/index.jsx. Discovered the canonical `MatteBackground` component already existed in `_shared/`. Refactored to use the canonical version with `variant="subdued"` (dimmer wash + specular so settings content owns visual hierarchy). Removed the duplicate.
- **Impact:** MEDIUM — visual continuity across all Studio Matte screens
- **Effort:** LOW
- **Status:** DONE (2026-04-12)

### AES-2: Catchlight eye graphic uses white instead of amber accent (LOW)
- **Location:** `ResultScreen.jsx` CatchlightEye component, ~lines 698-715
- **Problem:** Catchlight dots rendered as white (`rgba(255,255,255,...)`) with faint warm halos. The rest of the Studio Matte system uses amber accent (`rgba(245,210,140,...)`) for key data points — readout values, drawer labels, the "10 O'CLOCK" text label below the eye. The white dots broke the amber accent system.
- **Fix:** Changed dot fill to `rgba(245,210,140,${alpha})`, specular highlight to `rgba(255,240,210,0.95)`, and halos to `rgba(245,210,140,0.22/0.40)`. Both primary and secondary dots now glow amber. Fallback dot updated to match.
- **Impact:** LOW — visual cohesion with amber accent system
- **Effort:** TRIVIAL
- **Status:** DONE (2026-04-12)

---

## Audit #3 — The Brutal Cut (2026-04-12)

> **Theme:** The app still thinks like an engineer presenting a report. A photographer needs a recipe card pinned to the wall.
> **See:** `docs/APPLE_SIMPLICITY_AUDIT_3.md` for full write-up with line references, innovations, and execution rationale.

### Flow / Architecture

### F-1: Results → Setup is a redundant handoff (CRITICAL)
- **Location:** Full flow: Results screen → Setup screen
- **Problem:** Both screens show the same data (pattern, confidence, modifier, catchlight, direction, distance, height, fill, diagram) in different layouts. The photographer sees their answer on Results, taps "Build It," and is shown their answer again on Setup before they can actually start building. 6 screens between photo and action — Apple would ship 3.
- **Fix:** Eliminate Setup as a standalone screen. Results → (optional mode sheet) → Cockpit. Setup's unique value (save, mode selection) moves to sheets.
- **Impact:** CRITICAL — removes entire screen, saves 8-15 seconds of friction
- **Effort:** HIGH
- **Status:** PROPOSED

### F-2: Mode Picker interrupts every cockpit entry (HIGH)
- **Location:** `SetupScreen.jsx` mode picker bottom sheet
- **Problem:** Every "Build This Light" tap opens a bottom sheet asking Photographer / Assistant / Learning. Most users pick Photographer every time. Forced choice on every entry = friction.
- **Fix:** `handleStartCockpit` now calls `loadShootRole()` first. If a saved role exists in localStorage, skips the picker entirely and calls `onStartCockpit(savedRole)` directly. First-time users still see the picker; returning users go straight in.
- **Impact:** HIGH — removes full modal interaction per cockpit entry
- **Effort:** LOW
- **Status:** DONE (2026-04-12)

### Results Screen

### R-7: VF overlay second line is noise (MEDIUM)
- **Location:** `ResultScreen.jsx` ~lines 2338-2353
- **Problem:** Below "Rembrandt 67%" on the photo: ModifierSilhouette (28px, too small to read) + meta Pill ("shot in studio", obvious) + source attribution (repeats confidence %). Three elements adding nothing to the hero moment.
- **Fix:** Removed the entire second line from the VF overlay gradient. Pattern + confidence is the hero.
- **Impact:** MEDIUM — cleaner photo overlay
- **Effort:** TRIVIAL
- **Status:** DONE (2026-04-12)

### R-8: Lighting Summary Strip chips duplicate the diagram (LOW)
- **Location:** `ResultScreen.jsx` ~lines 2547-2567
- **Problem:** "KEY UPPER LEFT" and "HARD" chips sit between drag handle and diagram. The diagram below already shows key position with a labeled arrow. Third presentation of data visible in two other places within 200px.
- **Fix:** Removed the entire Lighting Summary Strip. Diagram goes straight to content.
- **Impact:** LOW — saves ~30px, removes 2 redundant elements
- **Effort:** TRIVIAL
- **Status:** DONE (2026-04-12)

### R-9: THE LIGHT section has 5 sub-sections for one concept (HIGH)
- **Location:** `ResultScreen.jsx` ~lines 2668-2762
- **Problem:** THE LIGHT expanded shows: PatternBars, Signal (ShadowSignature dial), Components (Key/Fill/Ambient chips), Direction (DirectionalCompass), Read (narrative). Five labeled sub-sections inside one panel. Each has its own widget. Wall of widgets to answer "what pattern?"
- **Fix:** THE LIGHT now shows ONLY PatternBars (hero pattern + collapsed candidates). Signal, Components, Direction, Read moved into DETAIL drawer under new "Shadow Analysis" sub-section with divider. SHOW MORE/LESS toggle removed (no longer needed).
- **Impact:** HIGH — transforms 400px+ widget wall into tight ~100px answer
- **Effort:** MEDIUM
- **Status:** DONE (2026-04-12)

### R-10: Two expansion mechanisms in THE LIGHT (LOW)
- **Location:** `ResultScreen.jsx` — "1 OTHER CANDIDATE" toggle + "SHOW MORE" button within 140px
- **Problem:** Two different progressive disclosure patterns in one section.
- **Fix:** Resolved by R-9 — SHOW MORE disappears when sub-sections move to DETAIL.
- **Impact:** LOW
- **Effort:** TRIVIAL (side effect of R-9)
- **Status:** DONE (2026-04-12) — side effect of R-9

### Setup Screen

### S-3: Iris Coverage Scale still engineer-facing on Setup (MEDIUM)
- **Location:** `SetupScreen.jsx` — IrisCoverageScale in flip card and desktop hero
- **Problem:** Banded ruler (TINY→XL) with "16.4% iris" and "0.027 ir²" survives on Setup even though Results uses compact "APPARENT SOURCE · Tiny." Photographer doesn't think in iris percentages.
- **Fix:** Replace with compact inline label matching Results treatment.
- **Impact:** MEDIUM — reclaims 60px, removes engineer widget
- **Effort:** LOW
- **Status:** DONE (2026-04-12) — resolved by L-3

### S-4: Summary chips row repeats the spec grid (LOW)
- **Location:** `SetupScreen.jsx` — horizontal scrollable chip strip
- **Problem:** 4 chips (direction, modifier, lights, CCT) all already in the spec grid above.
- **Fix:** Remove strip entirely.
- **Impact:** LOW — removes pure redundancy
- **Effort:** TRIVIAL
- **Status:** PROPOSED

### S-5: Camera section is P3 data in P1 position (LOW)
- **Location:** `SetupScreen.jsx` — CAMERA panel
- **Problem:** Focal length and aperture don't help rebuild the light. Already known by photographer.
- **Fix:** Move into SETUP GUIDE drawer.
- **Impact:** LOW — tightens setup scroll
- **Effort:** TRIVIAL
- **Status:** PROPOSED

### Cockpit

### C-5: No swipe navigation between steps (HIGH)
- **Location:** `Day1ShootScreen.jsx` — button-only step navigation
- **Problem:** 4-step linear flow with Prev/Next buttons but no swipe. Step dots visually imply swipe. Every modern step-based mobile UI supports swipe.
- **Fix:** Added touchStart/touchEnd swipe handlers on scrollable body. Horizontal swipe (|dx| > 50px, |dx| > |dy| × 1.5) triggers step navigation. Left = next, right = prev. Buttons remain as fallback. Uses stepsCountRef to avoid initialization ordering issues.
- **Impact:** HIGH — matches muscle memory from every other app
- **Effort:** MEDIUM
- **Status:** DONE (2026-04-12)

### C-6: Reference photo doesn't breathe (MEDIUM)
- **Location:** `Day1ShootScreen.jsx` — 290px max-height hero
- **Problem:** Reference photo gets <50% of 430px viewport. On set, photographer is squinting between phone and physical setup. Photo needs to be BIG.
- **Fix:** Photo now uses same fluid VF_HEIGHT calculation as Home/Results (~430px on iPhone 15). Buttons compacted, header merged to single line, dots padding reduced — reclaims ~50px total for the photo.
- **Impact:** MEDIUM — photo-dominant, matches Results screen philosophy
- **Effort:** MEDIUM
- **Status:** DONE (2026-04-12) — resolved by L-1 + L-8 + WF-2

### C-7: Step lead has 3 text levels for one number (LOW)
- **Location:** `Day1ShootScreen.jsx` — PhotographerBody step content
- **Problem:** Title "KEY ANGLE" (10px) + Lead "67°" (22px) + SubLead "rembrandt target 45–60° · 10 o'clock" (11px). Three levels for one concept. Photographer needs the number, not three typographic tiers.
- **Fix:** Removed title label. Hero number bumped from 22px to 28px. Single context line remains. Step position communicated by header ("STEP 1/4") and dots.
- **Impact:** LOW — tighter step content
- **Effort:** TRIVIAL
- **Status:** DONE (2026-04-12)

---

## Audit #3 — Innovations Proposed

### I-1: Recipe Card Pattern
Results flips into Cockpit in-place. One screen, two modes. FRONT: answer + diagram + "Build This." BACK: step-by-step guidance with overlays. No Setup screen. No navigation. The card flips from analysis to action.

### I-2: Ambient Dashboard Cockpit
Replace 4-step wizard with a live status board. All parameters visible simultaneously with ✓/⚠ indicators. Photographer sees everything at once and knows what needs fixing. No sequential steps. No "Next" buttons.

### I-3: Tap-the-Photo Interaction
Make the reference photo interactive. Tap catchlight → angle detail. Tap shadow → analysis. Tap modifier → specs. The photo IS the UI. Direct manipulation, not abstracted panels.

---

## Audit #3 Summary

| Finding | Screen | Impact | Effort | Status |
|---------|--------|--------|--------|--------|
| **F-1** | Flow | CRITICAL | HIGH | PROPOSED |
| **F-2** | Flow | HIGH | LOW | DONE |
| **R-7** | Results | MEDIUM | TRIVIAL | DONE |
| **R-8** | Results | LOW | TRIVIAL | DONE |
| **R-9** | Results | HIGH | MEDIUM | DONE |
| **R-10** | Results | LOW | TRIVIAL | DONE (side effect R-9) |
| **S-3** | Setup | MEDIUM | LOW | PROPOSED |
| **S-4** | Setup | LOW | TRIVIAL | PROPOSED |
| **S-5** | Setup | LOW | TRIVIAL | PROPOSED |
| **C-5** | Cockpit | HIGH | MEDIUM | DONE |
| **C-6** | Cockpit | MEDIUM | MEDIUM | PROPOSED |
| **C-7** | Cockpit | LOW | TRIVIAL | DONE |
| **I-1** | Architecture | — | HIGH | INNOVATION |
| **I-2** | Architecture | — | HIGH | INNOVATION |
| **I-3** | Architecture | — | HIGH | INNOVATION |

---

## Audit #4 — Readability, Focus, Layout (2026-04-12)

> **Theme:** Can a photographer read this in a dim studio at arm's length?
> **See:** `docs/APPLE_SIMPLICITY_AUDIT_4.md` for full write-up with pixel measurements and viewport analysis.

### L-1: Cockpit photo must dominate — match Home/Results VF size (CRITICAL)
- **Location:** `Day1ShootScreen.jsx` — reference photo maxHeight
- **Problem:** Reference photo was 290px in 812px viewport = 35.7%. Chrome (header + spec strip + step lead + tips + dots + buttons + home indicator) took 47.8%. Photo subordinate to UI widgets.
- **Fix:** Imported `useStableViewport`, computed VF_HEIGHT identically to Home/Results screens (fluid calc from viewport height). Photo now fills the same space as the viewfinder on other screens (~430px on iPhone 15). Header compacted to single line. Buttons shrunk (L-8). Step dots get tappable targets.
- **Impact:** CRITICAL — photo goes from 35% to ~55%+ of viewport
- **Effort:** HIGH
- **Status:** DONE (2026-04-12)

### L-2: Spec cell labels unreadable at arm's length (HIGH)
- **Location:** `SetupScreen.jsx` LongPressSpec component
- **Problem:** Labels were 9px, values 18px. At arm's length in a studio, 9px text is illegible.
- **Fix:** Labels bumped from 9px to 11px, values from 18px to 20px. Cell padding from `8px 10px` to `10px 14px`.
- **Impact:** HIGH — legible specs at studio distance
- **Effort:** LOW
- **Status:** DONE (2026-04-12)

### L-3: IrisCoverageScale is 80px of engineer data on Setup (HIGH)
- **Location:** `SetupScreen.jsx` — both flip card front and back face
- **Problem:** 6-band banded ruler with golden marker pin + "TINY/SMALL/MEDIUM/LARGE/HUGE/XL" labels + "16.4% iris" + "0.027 ir²" = 80px. Photographer needs "Tiny source" or "Large source."
- **Fix:** Both usages replaced with compact inline label: "APPARENT SOURCE · [band]" in amber accent. One line, ~30px.
- **Impact:** HIGH — reclaims 50px per instance, removes engineer widget
- **Effort:** LOW
- **Status:** DONE (2026-04-12) — also resolves S-3

### L-4: Setup flip card has 18 data points in 340px (HIGH)
- **Location:** `SetupScreen.jsx` — mobile flip card front face
- **Problem:** 16 items crammed into one view. Apple shows 3-5 per view.
- **Fix:** Replaced entire front-face spec section with a clean 2×2 CSS grid: Distance, Direction, Height, Fill. Removed: apparent source label, position spec (merged into direction), placement spec, "closer = softer" guidance text, optimal distance secondary. Front face now shows: KEY LIGHT label, modifier emission + name, 4-spec grid, flip hint. 7 items, down from 16.
- **Impact:** HIGH — card becomes scannable instead of overwhelming
- **Effort:** MEDIUM
- **Status:** DONE (2026-04-12)

### L-5: Results THE SETUP has cramped 2-column grids (MEDIUM)
- **Location:** `ResultScreen.jsx` THE SETUP SectionPanel
- **Problem:** 92px visual + 13px text crammed side-by-side in 2-column grid with 12px gap.
- **Fix:** Both catchlight and modifier rows converted from `display: grid` (2-column) to `display: flex; flexDirection: column` (stacked). Visuals centered on top, text specs below with full width. Catchlight text bumped from 13→14px.
- **Impact:** MEDIUM — better visual hierarchy, no more cramped side-by-side
- **Effort:** MEDIUM
- **Status:** DONE (2026-04-12)

### L-6: SectionPanel content padding too tight (MEDIUM)
- **Location:** `ResultScreen.jsx` SectionPanel component
- **Problem:** 4px top padding between section divider and content.
- **Fix:** Increased content top padding from 4px to 12px.
- **Impact:** MEDIUM — sections feel less cramped
- **Effort:** TRIVIAL
- **Status:** DONE (2026-04-12)

### L-7: 11 different font sizes across cockpit (LOW)
- **Location:** `Day1ShootScreen.jsx` — uses 8-28px across 11 different sizes
- **Problem:** No consistent type scale. Every element picks its own size.
- **Fix:** Standardize to 5-tier scale.
- **Impact:** LOW — cumulative readability improvement
- **Effort:** MEDIUM
- **Status:** PARTIAL — spec strip bumped 11→14px, step lead 28→32px, subLead 11→12px, buttons 52→44px

### L-8: Cockpit buttons row takes 88px of chrome (MEDIUM)
- **Location:** `Day1ShootScreen.jsx` — action buttons row
- **Problem:** Prev/Next 52×52px, capture 52px tall, 16px top + 20px bottom padding = 88px.
- **Fix:** Prev/next shrunk to 44×44px, capture to 44px. Bottom padding 20→12px, top 16→10px. Step dots padding 16→10px.
- **Impact:** MEDIUM — ~30px reclaimed for photo
- **Effort:** TRIVIAL
- **Status:** DONE (2026-04-12)

### Workflow Friction Reductions (2026-04-12)

### WF-1: Cockpit step dots are not tappable (LOW)
- **Location:** `Day1ShootScreen.jsx` — step indicator dots
- **Problem:** Dots visually suggest tappability but only prev/next buttons and swipe work. Direct step jumping requires sequential clicks.
- **Fix:** Added onClick handlers on each dot with expanded tap targets (padding: 8px 4px). Tapping any dot jumps directly to that step.
- **Impact:** LOW — saves 1-2 taps per session
- **Effort:** TRIVIAL
- **Status:** DONE (2026-04-12)

### WF-3: SetupScreen has no swipe-back gesture (MEDIUM)
- **Location:** `SetupScreen.jsx`
- **Problem:** Results has left-edge swipe-back but Setup requires tapping the back chevron. Inconsistent navigation. iOS muscle memory expects swipe-back everywhere.
- **Fix:** Added identical left-edge swipe-back gesture (touch starts within 24px of left edge, rightward drag > 80px fires `onCancel()`). Includes the same edge glow visual indicator as ResultScreen.
- **Impact:** MEDIUM — consistent navigation across all screens
- **Effort:** LOW
- **Status:** DONE (2026-04-12)

### WF-2: Cockpit header wastes vertical space with 2 lines (LOW)
- **Location:** `Day1ShootScreen.jsx` — header
- **Problem:** "COCKPIT" title (10px) + "PHOTOGRAPHER · STEP 1/4" subtitle (9px) = 2 lines + generous padding = ~42px of header chrome.
- **Fix:** Merged into single line: "COCKPIT 1/4". Padding reduced from `16px 20px 10px` to `12px 20px 6px`. Saves ~14px.
- **Impact:** LOW — every pixel reclaimed serves the photo
- **Effort:** TRIVIAL
- **Status:** DONE (2026-04-12)

---

## Audit #4 Summary

| Finding | Screen | Impact | Effort | Status |
|---------|--------|--------|--------|--------|
| **L-1** | Cockpit | CRITICAL | HIGH | DONE |
| **L-2** | Setup | HIGH | LOW | DONE |
| **L-3** | Setup | HIGH | LOW | DONE |
| **L-4** | Setup | HIGH | MEDIUM | DONE |
| **L-5** | Results | MEDIUM | MEDIUM | DONE |
| **L-6** | Results | MEDIUM | TRIVIAL | DONE |
| **L-7** | Cockpit | LOW | MEDIUM | PARTIAL |
| **L-8** | Cockpit | MEDIUM | TRIVIAL | DONE |
| **WF-1** | Cockpit | LOW | TRIVIAL | DONE |
| **WF-2** | Cockpit | LOW | TRIVIAL | DONE |
| **WF-3** | Setup | MEDIUM | LOW | DONE |
