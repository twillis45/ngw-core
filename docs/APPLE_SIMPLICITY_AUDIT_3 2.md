# Apple Simplicity Audit #3 — The Brutal Cut

> **Date:** 2026-04-12
> **Lens:** Working pro photographer, iPhone in hand, just shot a reference. Needs to rebuild this light in under 60 seconds. Every extra tap, every redundant data point, every "section" they have to scroll past is friction that costs them a setup.
> **Theme:** *The app still thinks like an engineer presenting a report. A photographer needs a recipe card pinned to the wall.*

---

## The Big Problem: Too Many Stops

The current flow has **6 screens** between "I have a photo" and "I'm building the light":

```
Home → Processing → Results → Setup → Mode Picker → Cockpit
```

Apple would ship **3**:

```
Home → Processing → Answer (with Build action)
```

Every extra screen is a chance for the photographer to lose momentum, get distracted, or decide the app isn't worth the friction. The Results screen is a report. The Setup screen is a preview of the cockpit. The Mode Picker is a speed bump. Three of those six screens exist to present data that could live on ONE screen.

This audit attacks the remaining bloat, redundancy, and engineer-facing data that survived Audits 1 and 2.

---

## FLOW — Navigation & Screen Architecture

### F-1: Results → Setup is a redundant handoff (CRITICAL)

- **Problem:** The Results screen shows pattern, confidence, modifier, catchlight, direction, distance, height, fill, diagram. The Setup screen shows... pattern, confidence, modifier, catchlight direction, distance, height, fill, diagram. **The same data, reshuffled into a different layout.** The photographer sees their answer, taps "Build It," and is shown their answer *again* in a slightly different format before they can actually start building.
- **Photographer impact:** "I already saw this. Let me work." Every second on the Setup screen is a second they could be adjusting a light stand.
- **Apple approach:** The Results screen IS the pre-build screen. "Build This Light" goes directly to the cockpit. The Setup screen's unique value — the mode picker and save function — can be a bottom sheet on Results, not a whole screen.
- **Fix:** Eliminate the Setup screen as a standalone destination. Results → (optional mode sheet) → Cockpit. The Setup screen's spec grid and diagram are redundant with Results. Save function moves to a sheet or the cockpit's exit flow.
- **Impact:** CRITICAL — removes an entire screen from the flow, ~8-15 seconds of friction
- **Effort:** HIGH
- **Status:** PROPOSED

### F-2: Mode Picker interrupts every cockpit entry (HIGH)

- **Problem:** Every time you tap "Build This Light" or "Build It Anyway," a bottom sheet asks you to choose Photographer / Assistant / Learning. Most photographers will pick "Photographer" every time. Making them choose on every entry is like asking "are you sure?" before every action.
- **Apple approach:** Remember the last selection. Default to it silently. Show a small mode indicator in the cockpit header that can be tapped to switch. First-time users get the picker; returning users go straight in.
- **Fix:** Persist mode in localStorage. Skip the picker if a mode is already set. Add a mode switcher to the cockpit header (tap the "FULL DETAILS" subtitle to change).
- **Impact:** HIGH — removes a full modal interaction from every cockpit entry
- **Effort:** LOW
- **Status:** PROPOSED

---

## RESULTS — Still Too Much Report, Not Enough Recipe

### R-7: VF overlay second line is noise (MEDIUM)

- **Location:** `ResultScreen.jsx` ~lines 2338-2353, below pattern/confidence on the photo
- **Problem:** Below "Rembrandt 67%" on the photo, there's a second line: ModifierSilhouette (28px) + meta Pill ("shot in studio") + source attribution ("67% confidence · catchlight analysis"). Three elements. The modifier silhouette at 28px is too small to read. The meta pill ("shot in studio") is obvious context. The source attribution repeats the confidence percentage that's already shown at 26px above it.
- **Photographer impact:** Their eye hits "Rembrandt 67%" and then gets pulled down to three small competing elements that add nothing.
- **Apple approach:** The photo overlay shows ONE thing: the answer. "Rembrandt · 67%". Nothing else. The modifier and source context live below the fold.
- **Fix:** Remove the entire second line from the VF overlay. Pattern + confidence is the hero. Everything else is below the drag handle.
- **Impact:** MEDIUM — cleaner hero moment, less visual noise on the photo
- **Effort:** TRIVIAL
- **Status:** PROPOSED

### R-8: Lighting Summary Strip chips duplicate the diagram (LOW)

- **Location:** `ResultScreen.jsx` ~lines 2547-2567
- **Problem:** "KEY UPPER LEFT" and "HARD" chips sit between the drag handle and the lighting diagram. The diagram directly below shows the key light position (upper left) with a labeled arrow. The light quality is shown in THE SETUP's modifier section. These chips are a third presentation of data available in two other places within 200px of scroll.
- **Photographer impact:** Chips feel like captions for a diagram that's already self-explanatory.
- **Apple approach:** The diagram IS the summary. It shows where the key is. No caption needed.
- **Fix:** Remove the Lighting Summary Strip entirely. The diagram speaks for itself.
- **Impact:** LOW — saves ~30px, removes 2 redundant elements
- **Effort:** TRIVIAL
- **Status:** PROPOSED

### R-9: THE LIGHT section has 5 sub-sections for one concept (HIGH)

- **Location:** `ResultScreen.jsx` ~lines 2668-2762
- **Problem:** THE LIGHT expanded view shows: (1) PatternBars, (2) Signal — ShadowSignature dial, (3) Components — Key/Fill/Ambient chips, (4) Direction — DirectionalCompass, (5) Read — shadow narrative. Five labeled sub-sections (each with its own "SubLabel" header) inside one SectionPanel. Each has its own visual widget. That's five things competing to explain "we found Rembrandt lighting with the key at upper left."
- **Photographer impact:** On mobile, "SHOW MORE" reveals a wall of widgets. The photographer asked "what pattern?" — they didn't ask for a shadow angle dial, a light component chip strip, a directional compass, AND a text narrative.
- **Apple approach:** THE LIGHT should answer exactly two questions: (1) What pattern? (2) How sure are you? The shadow geometry evidence belongs in DETAIL/diagnostics for the curious.
- **Fix:** THE LIGHT shows ONLY the PatternBars (hero pattern + collapsed candidates). Signal, Components, Direction, and Read all move into the DETAIL drawer under a "Shadow Analysis" sub-section. THE LIGHT becomes a 3-line section: pattern name, confidence bar, candidates toggle. Done.
- **Impact:** HIGH — transforms a 400px+ widget wall into a tight 100px answer
- **Effort:** MEDIUM
- **Status:** PROPOSED

### R-10: Two expansion mechanisms in THE LIGHT (LOW)

- **Location:** `ResultScreen.jsx` — "1 OTHER CANDIDATE" toggle (~line 2680 via PatternBars) + "SHOW MORE" button (~line 2742)
- **Problem:** Within 140px on mobile, there are two different expand/collapse UI patterns: "1 OTHER CANDIDATE" toggles runner-up patterns, and "SHOW MORE" reveals the Signal/Components/Direction/Read sub-sections. Two mechanisms for progressive disclosure in one tiny section.
- **Apple approach:** One section, one toggle. Or better: if R-9 is fixed, only the candidates toggle remains and SHOW MORE disappears entirely.
- **Fix:** Resolved by R-9 — moving Signal/Components/Direction/Read to DETAIL eliminates the need for SHOW MORE.
- **Impact:** LOW
- **Effort:** TRIVIAL (side effect of R-9)
- **Status:** PROPOSED (blocked on R-9)

---

## SETUP SCREEN — The Redundant Preview

### S-3: Iris Coverage Scale is still an engineer widget (MEDIUM)

- **Location:** `SetupScreen.jsx` — IrisCoverageScale component in the flip card and desktop hero
- **Problem:** The banded ruler (TINY → SMALL → MEDIUM → LARGE → HUGE → XL) with a golden marker pin, plus numeric readouts "16.4% iris" and "0.027 ir²", survives on the Setup screen even though Audit #1 replaced it with "APPARENT SOURCE · Tiny" on the Results screen. A photographer doesn't think in iris percentages or angular area. They think "small hard source" or "big wraparound."
- **Photographer impact:** Engineer metric taking ~60px of prime real estate on the spec card.
- **Apple approach:** Use the same compact "APPARENT SOURCE · Tiny" treatment from Results. One line. No ruler.
- **Fix:** Replace IrisCoverageScale on SetupScreen with the compact inline label. If the ruler must exist, put it behind a tap on the label.
- **Impact:** MEDIUM — reclaims 60px of spec card, removes engineer widget
- **Effort:** LOW
- **Status:** PROPOSED

### S-4: Summary chips row repeats the spec grid (LOW)

- **Location:** `SetupScreen.jsx` — horizontal scrollable chip strip
- **Problem:** Four chips: "30-45 Off Axis Left · Strip Box · 1 light · 5500K". Every one of these values is already shown in the spec grid above (Direction, Modifier name, Lights count) or in the Camera section (CCT). The chip strip is a fourth rendering of data already visible in three other places on the same screen.
- **Apple approach:** Don't show data twice. If the spec grid has it, the chips don't need it.
- **Fix:** Remove the summary chips strip entirely.
- **Impact:** LOW — saves ~40px of scroll, removes pure redundancy
- **Effort:** TRIVIAL
- **Status:** PROPOSED

### S-5: Camera section is P3 data in P1 position (LOW)

- **Location:** `SetupScreen.jsx` — CAMERA panel showing focal length, aperture, framing guidance
- **Problem:** "85–135mm f/2.8–5.6 · tight crop — framing obscured by projected light pattern" is interesting context, but it doesn't help rebuild the light. The photographer already knows what lens they're using. Focal length and aperture are camera decisions, not lighting decisions.
- **Apple approach:** Camera data belongs inside SETUP GUIDE or DETAIL, not in the primary flow.
- **Fix:** Move Camera section into the SETUP GUIDE drawer. Or show only the subject framing guidance ("Position camera at left-side 3/4 angle") which IS actionable for lighting.
- **Impact:** LOW — reduces main scroll length, keeps focus on lighting
- **Effort:** TRIVIAL
- **Status:** PROPOSED

---

## COCKPIT — Good Bones, Missing Gestures

### C-5: No swipe navigation between steps (HIGH)

- **Location:** `Day1ShootScreen.jsx` — step navigation is button-only
- **Problem:** Four-step linear flow (Position → Distance → Height → Capture) with Prev/Next buttons but no swipe gesture. Every modern step-based mobile UI supports left/right swipe. The photographer's hands are on the phone — swiping is faster than finding a button. The step dots at the bottom visually imply swipe (they look like page dots).
- **Apple approach:** Steps ARE pages. Swipe left/right. Buttons are fallback for precision.
- **Fix:** Add horizontal swipe gesture detection (touchStart/touchMove/touchEnd with deltaX threshold). Swipe left = next step, swipe right = prev step. Keep buttons as alternative.
- **Impact:** HIGH — matches every photographer's muscle memory from every other app
- **Effort:** MEDIUM
- **Status:** PROPOSED

### C-6: Reference photo doesn't breathe (MEDIUM)

- **Location:** `Day1ShootScreen.jsx` — hero image is 290px max-height (photographer mode)
- **Problem:** The reference photo is the most important element in the cockpit — it's what the photographer is trying to match. But it's compressed to 290px in a 430px viewport, with the spec strip above and the step lead + TIPS below. The photo gets less than half the screen. On actual set, the photographer is squinting between their phone and the physical setup. The reference needs to be BIG.
- **Apple approach:** The photo dominates. Spec strip overlays the photo (like the Results VF overlay does). Step lead is minimal — just the current value. The photo gets 60-70% of the viewport.
- **Fix:** Overlay the compact spec strip on the photo (position absolute, top, like the VF overlay on Results). Move the step lead to overlay the bottom of the photo (same gradient treatment as Results). Photo grows to fill available space. TIPS toggle stays below.
- **Impact:** MEDIUM — reference photo becomes the hero, matches Results screen's photo-first philosophy
- **Effort:** MEDIUM
- **Status:** PROPOSED

### C-7: Step lead has 3 levels of text for one number (LOW)

- **Location:** `Day1ShootScreen.jsx` — PhotographerBody step content
- **Problem:** Each step shows: (1) Title "KEY ANGLE" (10px label), (2) Lead "67°" (22px hero), (3) SubLead "rembrandt target 45–60° · 10 o'clock" (11px context). Three typographic levels for one concept. The photographer needs the number. The label is redundant with context (they know what step they're on from the step dots). The sublead mixes the pattern target range with the clock position, which is a different dimension.
- **Apple approach:** The NUMBER is the UI. "67°" at hero scale. Period. Context is on the photo overlay. Label is implied by the step position.
- **Fix:** Remove the step title label. Keep only the hero number and a single-line context string. Or better: if C-6 is implemented, overlay the number on the photo and eliminate the separate lead section entirely.
- **Impact:** LOW — tighter step content, less reading
- **Effort:** TRIVIAL
- **Status:** PROPOSED

---

## INNOVATION — Proposed Structural Changes

### I-1: The Recipe Card Pattern

**Concept:** Replace the current Results → Setup → Cockpit flow with a single "Recipe Card" that flips between two modes:

**FRONT: The Answer**
- Photo with pattern + confidence overlay (existing VF treatment)
- One card below: "Rembrandt · Strip Box · 67° off-axis · 4 ft · Upper Left"
- Diagram (existing)
- "Build This Light" CTA

**BACK: The Cockpit**
- Same screen, different mode
- Photo with step overlays
- Step-by-step guidance below
- Swipe between steps

One screen. Two modes. No Setup screen. No Mode Picker. The photographer taps "Build" and the card flips from analysis to action. The physical metaphor: you're looking at a recipe card, then you flip it over and start cooking.

### I-2: Ambient Dashboard Cockpit

**Concept:** Instead of a linear 4-step wizard, show all parameters simultaneously like a car dashboard. The photographer sees their current setup state at a glance:

```
┌─────────────────────────┐
│  [Reference Photo]       │
│  ← 67° angle overlay →  │
│                          │
├──────────┬──────────────┤
│  ANGLE   │  DISTANCE    │
│   67°    │   4 ft       │
│  ✓ good  │  ⚠ too far   │
├──────────┼──────────────┤
│  HEIGHT  │  PATTERN     │
│   High   │  Rembrandt   │
│  ✓ good  │  67% conf    │
└──────────┴──────────────┘
```

Each cell is tappable for detail. Green checkmark = within target range. Warning = needs adjustment. The photographer sees EVERYTHING at once and knows exactly what needs fixing. No sequential steps. No "Next" buttons. Just a live status board.

### I-3: Tap-the-Photo Interaction

**Concept:** Instead of abstract widgets, make the reference photo interactive:
- Tap the catchlight → shows angle detail
- Tap the shadow → shows shadow analysis
- Tap the modifier silhouette → shows modifier specs
- Tap empty space → returns to overview

The photo IS the UI. No separate "sections." The data lives ON the image, revealed by touch. This is what Apple would ship: direct manipulation, not abstracted panels.

---

## Execution Priority

| Order | Finding | Impact | Effort | ROI |
|-------|---------|--------|--------|-----|
| 1 | **F-2** Mode picker skip | HIGH | LOW | Best quick win — instant UX improvement |
| 2 | **R-7** VF overlay cleanup | MEDIUM | TRIVIAL | 5-minute fix, cleaner hero |
| 3 | **R-8** Remove summary chips | LOW | TRIVIAL | 5-minute fix, less noise |
| 4 | **R-9** Collapse THE LIGHT | HIGH | MEDIUM | Biggest single-screen improvement |
| 5 | **C-5** Swipe navigation | HIGH | MEDIUM | Modern mobile UX expectation |
| 6 | **C-6** Photo-dominant cockpit | MEDIUM | MEDIUM | Matches photographer workflow |
| 7 | **S-4** Remove summary chips (setup) | LOW | TRIVIAL | Quick redundancy kill |
| 8 | **S-3** Replace iris scale | MEDIUM | LOW | Remove last engineer widget |
| 9 | **S-5** Move camera section | LOW | TRIVIAL | Tighten setup scroll |
| 10 | **F-1** Kill setup screen | CRITICAL | HIGH | Architectural — do after above |
| 11 | **C-7** Simplify step lead | LOW | TRIVIAL | Polish after C-6 |
| 12 | **R-10** Single toggle | LOW | TRIVIAL | Side effect of R-9 |

**Highest-impact single change:** F-2 + R-9 together. Skip the mode picker AND collapse THE LIGHT to just the answer. This removes a full modal + transforms the results screen from a report into a recipe card.

**Most innovative change:** I-1 (Recipe Card) or I-2 (Ambient Dashboard). Both fundamentally rethink the multi-screen flow. I-1 is more achievable short-term; I-2 is the premium end-state.

---

## Audit Summary

| Finding | Screen | Impact | Effort | Status |
|---------|--------|--------|--------|--------|
| **F-1** | Flow | CRITICAL | HIGH | PROPOSED |
| **F-2** | Flow | HIGH | LOW | PROPOSED |
| **R-7** | Results | MEDIUM | TRIVIAL | PROPOSED |
| **R-8** | Results | LOW | TRIVIAL | PROPOSED |
| **R-9** | Results | HIGH | MEDIUM | PROPOSED |
| **R-10** | Results | LOW | TRIVIAL | PROPOSED (blocked R-9) |
| **S-3** | Setup | MEDIUM | LOW | PROPOSED |
| **S-4** | Setup | LOW | TRIVIAL | PROPOSED |
| **S-5** | Setup | LOW | TRIVIAL | PROPOSED |
| **C-5** | Cockpit | HIGH | MEDIUM | PROPOSED |
| **C-6** | Cockpit | MEDIUM | MEDIUM | PROPOSED |
| **C-7** | Cockpit | LOW | TRIVIAL | PROPOSED |
| **I-1** | Architecture | — | HIGH | INNOVATION |
| **I-2** | Architecture | — | HIGH | INNOVATION |
| **I-3** | Architecture | — | HIGH | INNOVATION |
