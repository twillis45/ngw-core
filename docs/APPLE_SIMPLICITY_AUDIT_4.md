# Apple Simplicity Audit #4 — Readability, Focus, Layout

> **Date:** 2026-04-12 (original) · 2026-04-13 (updated after implementation passes 1 & 2)
> **Lens:** Can a photographer read this in a dim studio at arm's length? Does every pixel earn its space? Is the eye guided or scattered?
> **Theme:** *Readability is not decoration. It's whether the tool works when you're holding a phone in one hand and a C-stand in the other.*

---

## The Core Problem: Information Density vs. Readability

Three screens. Three density problems:

1. **Results** — THE SETUP section crams catchlight eye + modifier emission + specs into a tight grid. Two 92px/88px visualizations compete side-by-side with 13px text. The grid gap is 12-14px. At arm's length in a dim studio, the modifier details are unreadable.

2. **Setup** — The flip card front face has **18 distinct data points** in 340px. Iris Coverage Scale alone takes 80px for one concept (TINY/SMALL/MEDIUM/LARGE/HUGE/XL banded ruler + "16.4% iris" + "0.027 ir²"). Spec cells use 9px labels. 9px. On a phone.

3. **Cockpit** — The reference photo gets **35.7% of the viewport**. Chrome (header + spec strip + step lead + tips + dots + buttons) takes 47.8%. The single most important element — the photo the photographer is trying to match — is subordinate to UI widgets.

---

## Findings & Fixes

### L-1: Cockpit photo must dominate — 60%+ of viewport (CRITICAL)

- **Problem:** Reference photo is 290px in a 812px viewport = 35.7%. Header (44px) + spec strip (44px) + step lead (56px) + tips (30px) + dots (22px) + buttons (88px) + home indicator (34px) = 318px of chrome. Photo loses.
- **Fix:** 
  - Compact the header: merge "COCKPIT" title into one line with step count
  - Overlay spec strip ON the photo top (position absolute, semi-transparent bg)
  - Overlay step lead ON the photo bottom (gradient treatment like Results VF)
  - Remove separate step lead section below photo
  - Photo grows to fill: target 420-450px
  - TIPS toggle + dots + buttons stay below
- **Impact:** CRITICAL — photo goes from 35% to ~55% of viewport
- **Effort:** HIGH

### L-2: Spec cell labels are 9px — unreadable at arm's length (HIGH)

- **Location:** SetupScreen flip card LongPressSpec cells
- **Problem:** Spec labels are 9px, values are 18px. On a 430px phone at arm's length (typical studio distance), 9px text is illegible. The labels ARE important — they tell you what the number means.
- **Fix:** Bump labels from 9px to 11px. Bump values from 18px to 20px. Increase cell padding from 8px 10px to 10px 14px.
- **Impact:** HIGH — legible specs at studio distance
- **Effort:** LOW

### L-3: Iris Coverage Scale is 80px of engineer data on Setup (HIGH)

- **Location:** SetupScreen IrisCoverageScale component
- **Problem:** 6-band banded ruler with golden marker pin + "TINY/SMALL/MEDIUM/LARGE/HUGE/XL" labels + "16.4% iris" + "0.027 ir²" = 80px of vertical space. Audit #1 replaced this with "APPARENT SOURCE · Tiny" on Results. Setup still has the full ruler. A photographer needs "Tiny source" or "Large source." Not a ruler with 6 bands and two numeric readouts.
- **Fix:** Replace IrisCoverageScale on Setup with the same compact inline label used on Results: "APPARENT SOURCE · [band]". One line, ~30px.
- **Impact:** HIGH — reclaims 50px, removes engineer widget, matches Results
- **Effort:** LOW

### L-4: Setup flip card has 18 data points in 340px (HIGH)

- **Location:** SetupScreen mobile flip card front face
- **Problem:** The front face shows: modifier graphic, modifier name, modifier size, iris coverage (3 forms), distance, optimal distance, position, direction, direction angle, height, height measurement, placement, fill, guidance text, flip hint. 18 items. Apple shows 3-5 per view.
- **Fix:** Front face shows ONLY the photographer's recipe:
  - Modifier graphic + name (hero, centered)
  - 4 key specs: Distance, Direction, Height, Fill (2×2 grid, larger text)
  - Flip hint
  - Everything else (iris coverage, position, placement, optimal values, guidance) → back face or removed
- **Impact:** HIGH — card becomes scannable instead of overwhelming
- **Effort:** MEDIUM

### L-5: Results THE SETUP has cramped 2-column grids (MEDIUM)

- **Location:** ResultScreen THE SETUP SectionPanel
- **Problem:** Catchlight eye (92px SVG) and modifier emission (88px) each sit in a 2-column grid with 12-14px gap. The right column has 13px text crammed next to the visual. On mobile at 430px - 50px margins - 92px visual - 12px gap = ~276px for text. But the text column also has a dark inset card with its own padding. Actual text width is ~200px. Two-line catchlight descriptions wrap aggressively.
- **Fix:** Stack vertically instead of grid. Visual on top (centered, hero treatment), text specs below. Each gets full width. Removes cramped side-by-side layout.
- **Impact:** MEDIUM — more breathing room, better visual hierarchy
- **Effort:** MEDIUM

### L-6: SectionPanel content padding is too tight (MEDIUM)

- **Location:** ResultScreen SectionPanel component — content padding is `4px 20px 14px`
- **Problem:** 4px top padding between the section divider and content. Content starts immediately after the label. No breathing room.
- **Fix:** Increase content top padding from 4px to 12px. Consistent with the 12px section gap.
- **Impact:** MEDIUM — sections feel less cramped
- **Effort:** TRIVIAL

### L-7: 11 different font sizes across the cockpit (LOW)

- **Location:** Day1ShootScreen — uses 8, 9, 10, 11, 12, 13, 14, 16, 20, 26, 28px
- **Problem:** No consistent type scale. Every element picks its own font size. The eye has no rhythm to follow.
- **Apple approach:** 4-5 sizes max: caption (10px), body (13px), subhead (16px), title (22px), display (32px).
- **Fix:** Standardize to 5-tier scale. Map all sizes to nearest tier.
- **Impact:** LOW — cumulative readability improvement
- **Effort:** MEDIUM

### L-8: Cockpit buttons row is 88px of chrome at the bottom (MEDIUM)

- **Location:** Day1ShootScreen action buttons — 16px top padding + 52px buttons + 20px bottom padding
- **Problem:** Prev (52×52px circle) + Capture (52px tall, flex-1) + Next (52×52px circle) with 12px gaps and 20px bottom padding. The circles are generous. The bottom padding is 2× the standard.
- **Fix:** Shrink prev/next to 44×44px. Reduce capture height to 44px. Reduce bottom padding to 12px. Reduce top padding to 10px. Saves ~30px for the photo.
- **Impact:** MEDIUM — 30px reclaimed for photo
- **Effort:** TRIVIAL

---

## Implementation Status (2026-04-13)

### Completed This Pass

| ID | Finding | What Was Done | Files |
|----|---------|---------------|-------|
| L-7 | 11 font sizes, no type scale | Defined canonical 5-tier TYPE/TYPE_DK in theme. T1=32/38, T2=20/24, T3=14/16, T4=11/13, T5=9/11. Desktop cockpit body text now uses dk-conditional sizing. | `studioMatte.js`, `Day1ShootScreen.jsx` |
| L-8 | Cockpit buttons 88px | Buttons already 44px (prev/next) + 44px (capture) from prior pass. Bottom padding was 16px. Desktop action row now uses 14px/28px/20px padding — tighter. | `Day1ShootScreen.jsx` |
| **R-1** | CTA buried at scroll bottom | Mobile "Build This Light" / "Build It Anyway" floated as sticky bottom bar with gradient fade. Always visible while scrolling drawers. | `ResultScreen.jsx` |
| **R-2** | Drag handle invisible at 0.18/0.28 | Brightened to steel(0.35/0.50) with improved highlight shadow. | `ResultScreen.jsx` |
| **R-3** | Cockpit desktop text too small | Header (15px exit, 12px COCKPIT, 14px DONE), PhotographerBody spec strip (16px), lead (38px), subLead (14px), LearningBody title (12px), lead (20px), WHY callout (14px body) all scaled for desktop. | `Day1ShootScreen.jsx` |
| **R-4** | Setup drawers collapsed on desktop | SETUP GUIDE and SAVE DETAILS drawers initialize open when isDesktop. | `SetupScreen.jsx` |
| **R-5** | Processing screen stretches on desktop | Centered 680px maxWidth container with shadow on desktop. | `ProcessingScreen.jsx` |
| **F-1** | Setup as separate screen before cockpit | Setup merged into Cockpit as step 0. All 3 modes (photographer, assistant, learning) get a setup overview step. Assistant auto-return goes to step 1 (skips setup on retakes). | `Day1ShootScreen.jsx` |
| **S-4/S-5** | Summary chips redundant | Already removed in prior pass (R-8). Confirmed stripped. | — |

### Bugs Fixed This Pass

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| `Cannot access 'D_DIAGRAM_TOP' before initialization` | `panelTop` referenced `D_DIAGRAM_TOP` before its `const` declaration (temporal dead zone) | Moved `panelTop` below all desktop constant definitions |
| Home/Processing break to desktop at 500px | `DESKTOP_MIN_WIDTH` (500) used instead of `LAYOUT_DESKTOP_MIN` (1024) in Day1DemoApp home/processing cases | Switched both to `LAYOUT_DESKTOP_MIN`, removed stale import |
| Stale `DESKTOP_MIN_WIDTH` import | Dead import from useStableViewport after migration to LAYOUT_DESKTOP_MIN | Removed from Day1DemoApp — now zero consumers |
| Comment/code mismatch on diagram well size | Comment said "275px padded = 247px" but code used +300 | Updated comment to match actual code (300px) |
| studioMatte.js TYPE comment | Comment said "+2px per tier" but actual deltas are +2–6px | Fixed comment to say "+2–6px" |

### Results World-Class Pass (2026-04-13, session 2)

| ID | Finding | What Was Done | Files |
|----|---------|---------------|-------|
| **R-10** | THE LIGHT stale 140px clip | Removed dead `lightExpanded` state and `maxHeight: 140` clip — THE LIGHT only shows pattern bars now (shadow analysis moved to DETAIL), so no clip/expand needed. | `ResultScreen.jsx` |
| **R-11** | Pattern winner lacks visual weight | Winner name 14→16px, definition 11→12px, bar track 3→4px with glow shadow, score 14→16px 800wt. Runner-up pattern bars unchanged. | `ResultScreen.jsx` |
| **R-12** | Section gap too tight | Analytical panel gap 12→16px. SectionPanel header label 10→11px. | `ResultScreen.jsx` |
| **R-13** | Mobile diagram has no label | Added "LIGHTING DIAGRAM" left-anchored + "TAP TO EXPAND" right-anchored with expand icon at diagram bottom. | `ResultScreen.jsx` |
| **R-14** | Drag handle too thin | Touch padding 8/4→10/6px. Handle width 36/28→40/32px. Transition upgraded to cubic-bezier. | `ResultScreen.jsx` |
| **R-15** | THE SETUP is scattered widgets | Catchlight eye + Modifier emission now side-by-side in ONE shared inset well with vertical divider (twin instrument panel). Modifier hero name bumped 20→22px. SpecCell labels 9→10px, padding 8/10→10/12px, radius 8→10px. Removed 3 separate nested wells → 1 unified well. Size range 11→12px. | `ResultScreen.jsx` |
| **L-5** | Results THE SETUP cramped grids | **CLOSED** — restructured as twin instruments + hero modifier name + spec grid below. | `ResultScreen.jsx` |
| **L-6** | SectionPanel padding 4px | **CLOSED** — already 12px from prior pass (confirmed in code). | — |

### Density Tightening Pass (2026-04-13, session 3)

| ID | Finding | What Was Done | Files |
|----|---------|---------------|-------|
| **T-1** | PatternBars double-padded (SectionPanel 20px + PatternBars 20px) | Removed PatternBars own `padding: 0 20px 16px` — SectionPanel handles margins. Winner silhouette 72→56px, runner-up 72→56px. Column gap 14→12px. Winner definition 12→11px. | `ResultScreen.jsx` |
| **T-2** | Diagram too tall for mobile | Aspect ratio `300/200` → `300/175`. Margins tightened (10/6 → 6/4). Internal padding `14px 16px` → `8px 14px 18px`. | `ResultScreen.jsx` |
| **T-3** | Drag handle spacing loose | Padding `10px 0 6px` → `8px 0 4px`. | `ResultScreen.jsx` |
| **T-4** | Twin instruments well spacious | Well padding `14px 12px 12px` → `10px 10px 8px`, gap 12→10, radius 12→10. CatchlightEye SVG 110→88px. ModifierEmission 88→72px. Removed redundant catchlight description line + angular area text. Label font 9→8px. | `ResultScreen.jsx` |
| **T-5** | SectionPanel padding generous | Header padding `12px 20px 0` → `10px 16px 0`. Content padding `12px 20px 14px` → `10px 16px 12px`. | `ResultScreen.jsx` |
| **T-6** | Analytical panel gaps loose | Panel gap 16→12px. Panel marginTop 6→4px. | `ResultScreen.jsx` |
| **T-7** | ModifierDetail spacing | Hero name 22→20px, size range 12→11px, marginBottom 14→10px, row gap 12→10px, row marginTop 10→8px. | `ResultScreen.jsx` |
| **T-8** | Iris coverage + physical meaning | Iris margin 10→8px, padding 8/12→6/10px, label 10→9px, value 13→12px. Physical meaning margin 10→6px, font 12→11px, line-height 18→16px. | `ResultScreen.jsx` |
| **T-9** | Bottom spacer + CTA bar | Mobile spacer 40→16px. CTA bar padding `10px 25px 18px` → `8px 25px 14px`. | `ResultScreen.jsx` |
| **T-10** | SpecCell too large | Radius 10→8px, padding `10px 12px` → `8px 10px`. | `ResultScreen.jsx` |

### SetupScreen Tightening Pass (2026-04-13, session 4)

| ID | Finding | What Was Done | Files |
|----|---------|---------------|-------|
| **S-1** | LongPressSpec values oversized (20px bold) | Values 20→14px with 2-line CSS clamp. Labels 11→10px. Padding `10px 14px` → `8px 10px`. | `SetupScreen.jsx` |
| **S-2** | ModifierEmission double-framed | Removed 108×88 chrome wrapper well. Bare 72px emission graphic centered. | `SetupScreen.jsx` |
| **S-3** | Hero modifier name too large | 20→16px. Card header padding `14px 16px 0` → `10px 16px 0`. KEY LIGHT label 10→9px. | `SetupScreen.jsx` |
| **S-4** | Spec grid padding loose | `10px 16px 12px` → `8px 14px 10px`. Gap 8→6. | `SetupScreen.jsx` |
| **S-5** | Flip hints oversized | Arrow padding 12→10px. Text 9→8px. Both faces tightened. | `SetupScreen.jsx` |
| **S-6** | CAMERA card padding | Radius 10→8, padding `10px 16px` → `8px 14px`. | `SetupScreen.jsx` |
| **S-7** | Chip strip padding | 6→5px padding. | `SetupScreen.jsx` |
| **S-8** | Main content gap too wide | 16→12px. Content padding `20px 25px` → `14px 20px`. | `SetupScreen.jsx` |
| **S-9** | Identity card header spacious | Padding `14px 20px` → `10px 16px`. Thumb 48→42px. Gap 14→12px. | `SetupScreen.jsx` |
| **S-10** | LightRoleCard/Strip padding generous | Card padding `10/12/12/14` → `8/10/10/12`, minWidth 140→130. Strip padding 8→6. | `SetupScreen.jsx` |
| **S-11** | Pre-shoot checklist padding loose | `14px 20px` → `10px 16px`. Item gap 8→6, marginTop 10→8. | `SetupScreen.jsx` |
| **S-12** | Desktop column gaps | Hero/right column gaps 14→12px. | `SetupScreen.jsx` |

**Result:** Entire Setup screen now fits in single mobile viewport (375×812) with zero scrolling. Cancel/Save Setup fully visible.

### Lighting Diagram World-Class Pass (2026-04-14)

| ID | Finding | What Was Done | Files |
|----|---------|---------------|-------|
| **D-1** | "Subject" label is noise — photographers don't need the circle labelled | Removed full-mode "Subject" text label | `LightingDiagram.jsx` |
| **D-2** | Key elevation never shown — HIGH/MED/LOW is critical signal | Added elevation label below key angle: HIGH=amber, MED=muted steel, LOW=blue. Compact mode suppresses MED (noise), full mode always shows | `LightingDiagram.jsx` |
| **D-3** | Fill marker fabricated from shallow shadowComponents pass | Gated fill marker on `reconstruction.fill_present`. `null`+moderate → suppressed. Only shows on `true` or strong/dominant signal. Added `negative_fill` detection with NEG_FILL label + warm absorber color | `LightingDiagram.jsx` |
| **D-4** | Key beam cone invisible at 0.10 opacity | KEY_BEAM lifted 0.10 → 0.16 | `LightingDiagram.jsx` |
| **D-5** | Shadow arrow too thin/faint — primary directional signal | Shadow line 1.25→1.5px, SHADOW_COLOR lifted 0.45→0.55 | `LightingDiagram.jsx` |
| **D-6** | Distance ruler invisible at st(0.18) | Ruler lines st(0.18)→st(0.28), arrowheads st(0.22)→st(0.32) | `LightingDiagram.jsx` |
| **D-7** | BG distance missing — diagram showed "BG" but no distance | Added `recon.background_distance_ft` to BG strip (was reading from wrong path `sd.*`) | `LightingDiagram.jsx` |
| **D-8** | Fill position collided with shadow label zone | Fill moved to camera-adjacent zone (`camY - 36` compact) — physically correct and clear of shadow arrow | `LightingDiagram.jsx` |
| **D-9** | Diagram too small / elements too timid at fluid scale | Canvas 220×150 → 240×165. subR 20→26. kDist 66→82. beamSpread 12→20. shadow length 22→28. Sun rays outerR 12→16. | `LightingDiagram.jsx` |
| **D-10** | No lit-side indicator — couldn't tell which side of face is illuminated | Added amber arc on key-facing side of subject head circle. Dynamically computed from key angle. Most impactful single change — communicates the light side instantly. | `LightingDiagram.jsx` |
| **D-11** | Key marker too small, no presence | Added glow halo (r=14, 6% fill) + soft outer ring (r=9, 10% fill) around key. Inner ring r 7→6, outer ring glow visible. Beam opacity 0.16→0.22. | `LightingDiagram.jsx` |

### Lighting Diagram Deep Pass (2026-04-14, session 2)

| ID | Finding | What Was Done | Files |
|----|---------|---------------|-------|
| **D-12** | Sun rays on studio modifier keys — semantically wrong | Removed sun-ray strokes from ALL studio modifier keys (including generic/unknown). Studio lights are not the sun. Generic unknown now uses concentric rings. | `LightingDiagram.jsx` |
| **D-13** | Key marker shape uninformative — generic dot for all modifiers | Modifier-shape-aware key markers: Rect softbox → rotated rect oriented toward subject. Octabox → octagon polygon. Beauty dish → circle with center hole. Strip → tall thin rect. Ring → thick ring arc. Parabolic/umbrella → open arc. Unknown → concentric rings (no rays). | `LightingDiagram.jsx` |
| **D-14** | No shadow-side arc — dual arc communicates face pattern instantly | Added blue arc on shadow side of subject head (opposite the amber lit-side arc). Amber = illuminated side, Blue = shadow zone. Together they encode the lighting ratio and face pattern without labels. | `LightingDiagram.jsx` |
| **D-15** | KEY angle number missing — photographers need the degree | Added angle label (e.g. "58°") between KEY and HIGH/MED/LOW. Source: `recon.key_light_angle_deg_pose_corrected` → `recon.key_light_angle_deg` → null. | `LightingDiagram.jsx` |

### Cockpit Overflow Fixes (2026-04-14, session 2)

| ID | Finding | What Was Done | Files |
|----|---------|---------------|-------|
| **C-1** | Hero step lead ("Rectangular Softbox") clips hard at right edge — word "Softbox" cut to "Softbo" | Reduced fontSize 32→30px on mobile step lead. Added `overflow: hidden, textOverflow: ellipsis, whiteSpace: nowrap` as safety net. At 30px the full modifier name fits in available 382px at all realistic modifier names. | `Day1ShootScreen.jsx` |
| **C-2** | Spec strip right side ("91% · Rembrandt") clips at card right — "Rembrandt" truncated to "Rem" | Added `flexShrink: 0, marginLeft: 8, overflow: hidden, textOverflow: ellipsis, whiteSpace: nowrap, maxWidth: 48%` to right p. Added `flex: 1, minWidth: 0, overflow: hidden, textOverflow: ellipsis, whiteSpace: nowrap` to left p. Both now properly contained. | `Day1ShootScreen.jsx` |

### Bugs Fixed (2026-04-14, session 2)

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| `Cannot access 'recon' before initialization` crash on ResultScreen | `keyElevation` const at line 56 referenced `recon` before its `const` declaration at line 73 (temporal dead zone in `let`/`const` block) | Moved `const recon = raw.reconstruction \|\| {}` above the `keyElevation` declaration |

### Remaining Open

| ID | Finding | Status | Effort |
|----|---------|--------|--------|
| L-1 | Cockpit photo must dominate 60%+ | **OPEN** — mobile photo is still ~35% viewport. Desktop two-column gives photo 55% column. Mobile overlay approach not yet implemented. | HIGH |
| L-2 | Spec cell labels 9px (SetupScreen) | **CLOSED** — labels bumped to 10px in S-1 | LOW |
| L-3 | Iris Coverage Scale 80px | **N/A** — Setup no longer has IrisCoverageScale (removed in prior pass) | LOW |
| L-4 | Setup flip card 18 data points | **CLOSED** — S-1 through S-7 reduced density; FILL clamped to 2 lines; emission bare; card fits viewport | MEDIUM |

---

### Open Findings (2026-04-14, session 2 — not yet fixed)

| ID | Screen | Finding | Severity | Effort |
|----|--------|---------|----------|--------|
| **O-1** | ResultScreen | "TAP TO EXPAND" label right-aligned at diagram card edge — clips at right (overflow:hidden card). Move to left-anchor or reduce padding. | MED | LOW |
| **O-2** | ResultScreen / DETAIL | Engine debug text visible in DETAIL section: "Vertical angle pass: high (0.75). Round catchlights → beauty dish / umbrella (2× weight)." — raw pipeline internals showing to users. Should be hidden behind ENGINE DIAGNOSTICS disclosure only. | HIGH | LOW |
| **O-3** | SetupScreen | FILL spec value "fill light or large reflector opposite" wraps to 2 lines and text clips at card right edge — card has no overflow:hidden, value phrase too long for 2-line clamp in ~158px column. Truncate with ellipsis or shorten phrasing. | MED | LOW |
| **O-4** | Cockpit | Step 1 photo is portrait-cropped into a 3:4-ish frame floating on a dark background with left/right black bars. The photo has more visual weight it could fill — a full bleed edge-to-edge crop would be more immersive and premium. | MED | MED |
| **O-5** | All | Cockpit is gated behind `sessionStorage.ngw_studio_cockpit = '1'` flag — no in-product path to unlock for QA/review except direct session storage injection. Consider a dev mode shortcut or URL param. | LOW | LOW |

---

## Cross-Cutting Issue Found in Audit (2026-04-13)

### Breakpoint Coherence

**Problem:** Two breakpoint systems existed — `DESKTOP_MIN_WIDTH=500` (useStableViewport) and `LAYOUT_DESKTOP_MIN=1024` (useIsDesktop). Day1DemoApp used the wrong one for Home and Processing, causing those screens to switch to desktop FitToViewport sizing at 500px while Results/Setup/Cockpit internally used 1024px for their own layouts. At 500–1024px viewports, the wrapper said "desktop" but the component said "mobile" — resulting in a 430px column inside a 1300px design space = ~50% scale.

**Fix:** All five screen cases in Day1DemoApp now use `LAYOUT_DESKTOP_MIN` (1024px). The `DESKTOP_MIN_WIDTH` import is removed. The export still exists in useStableViewport.js for the hook's internal use but has zero external consumers.

**Hardcoded spacing in ResultScreen:** Lines throughout use raw numbers (25px margins, 96px panel marginTop, 72px CTA spacer, 40px actions row). These are functional but brittle. Consider extracting to a constants block if further layout passes touch these areas.
