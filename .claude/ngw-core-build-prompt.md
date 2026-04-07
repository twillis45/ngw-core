# NGW CORE BUILD PROMPT
## Implementation Instructions for Core Flow

Use this prompt when resuming NGW Core implementation work.

---

## CONTEXT

We are building the core product flow for NGW (Next-Gen Lighting Analysis):
**Home → Processing → Result → Setup**

This is the only feature being built. No scope expansion. No design loops.

---

## CONSTRAINTS (Non-Negotiable)

1. **Build only the core flow.** Home, Processing, Merged Result (HC/LC), Setup. Nothing else.
2. **Device truth beats Figma.** Test on Samsung S25 after every stage. Real phone is source of truth.
3. **Flow completeness before polish.** Get the 5 screens navigating correctly, then optimize animations.
4. **Preserve non-negotiables:**
   - Captured image remains the anchor
   - Pattern + confidence are the first read
   - CTA is obvious and accessible
   - LC is credible (not broken, not cheaper)
   - No gold, no generic SaaS card spam, no decorative motion
5. **Build order is fixed.** Home → Processing → Result HC/LC → Setup. No jumping ahead.
6. **Foundations before screens.** Tokens → components → screens.
7. **No design reopening.** Use current Figma as source of truth (file: YQgGd8KZyZoXzZwJV7p4b6). Don't redesign mid-build.

---

## IMPLEMENTATION CHECKLIST

### Phase 1: Foundations (Day 1)
- [ ] Folder structure created (screens/, components/shared/, theme/)
- [ ] Color tokens implemented (8 colors + opacity variants as CSS custom properties)
- [ ] Typography tokens implemented (Inter fonts + type scale)
- [ ] Spacing, radius, shadow, motion tokens implemented
- [ ] Button, Card, Badge, Panel components stubbed
- [ ] All tokens tested on Samsung S25 (crisp text, shadow visibility)

### Phase 2: Home Screen (Day 2)
- [ ] Home screen built (lamp graphic + button + text)
- [ ] Navigation wired: tap Analyze → Processing
- [ ] Button hit target ≥ 48px
- [ ] Text readable on OLED
- [ ] Processing screen skeleton ready

### Phase 3: Processing Screen (Day 3)
- [ ] Processing screen built (image + spinner + timer + auto-advance)
- [ ] Auto-advance logic: 2.5s + 200-400ms jitter → Result
- [ ] Cancel button → Home
- [ ] Result HC screen skeleton ready
- [ ] Tested on S25 (spinner smooth, timer accurate, auto-advance timing correct)

### Phase 4: Result Screens (Day 4)
- [ ] Result HC built (pattern card + confidence badge + alternatives panel + CTAs)
- [ ] Confidence badge immediately visible (no scroll)
- [ ] Both CTAs visible and accessible
- [ ] Panel expand/collapse works (state change, animation deferred)
- [ ] Result LC built (panel closed by default, badge orange, same CTA prominence)
- [ ] Tested on S25 (both screenshots, LC doesn't feel broken)

### Phase 5: Setup Screen (Day 5)
- [ ] Setup screen built (form + inputs + read-only summary + CTAs)
- [ ] Cancel → Result (data intact)
- [ ] Confirm → stub success (console.log + toast)
- [ ] Full end-to-end test: Home → Processing → Result HC → Setup → back
- [ ] Test with Result LC as well
- [ ] Tested on S25 (form inputs responsive, no keyboard overlap, all text readable)

### Phase 6: Validation (Day 5 end)
- [ ] All navigation works (forward and back)
- [ ] No crashes or blocked flows
- [ ] All CTAs accessible (48px minimum hit target)
- [ ] All text readable (no dim text illegible)
- [ ] Confidence badges correct color (HC: green, LC: orange)
- [ ] Form accepts input
- [ ] Timer counts accurately
- [ ] Auto-advance fires at correct timing

---

## WHAT CAN BE STUBBED

| Feature | Stub Now | Upgrade Later |
|---------|----------|---------------|
| Lamp breathing animation | Static image | SVG morph or CSS animation |
| Processing morph | Ring spinner fallback | SVG morph |
| Panel expand animation | Instant state change | Smooth height + opacity |
| Photo upload | Hardcoded test image | Real camera integration |
| Result API | Mock response (confidence: 0.92) | Real VLM backend |
| Alternatives/Substitutions data | Hardcoded fixture | Backend API |
| Setup form submission | console.log + toast | Real gear DB + API |

---

## WHAT MUST BE PIXEL-ACCURATE NOW

1. Button positioning (Analyze, Build, Set up Anyway, Confirm) — 48px minimum, tappable
2. Text hierarchy (font size, weight, color) — must match tokens exactly
3. Image display (aspect ratio, centering, border radius 8px)
4. Confidence badge positioning (visible above fold, correct color)
5. Result card structure (pattern name first, gap label adjacent)
6. CTA group layout (both CTAs visible, no overflow)
7. Panel toggle (visual indicator of interactivity)

---

## MANDATORY INTERACTIONS NOW

1. Home → Processing: Tap "Analyze Photo" → navigate instantly
2. Processing → Result: Auto-advance after 2.5s + jitter
3. Result HC/LC → Setup: Tap "Build This Setup" → navigate with patternId
4. Result → Home: Tap "Analyze Another" → reset state, navigate
5. Setup → Result: Tap "Cancel" → back with data intact
6. Processing: Tap "Cancel" → Home
7. Panel toggle: Tap chevron → toggle open/closed state

---

## DEVICE TEST CHECKLIST

**After each screen is built, test on Samsung S25:**

- [ ] Home: Button tappable, text crisp, navigation instant
- [ ] Processing: Spinner smooth, timer accurate, auto-advance at ~2.5s, image correct
- [ ] Result HC: Badge visible above fold, both CTAs visible, panel state works, text crisp
- [ ] Result LC: Panel closed by default, badge orange, doesn't feel broken
- [ ] Setup: Form inputs responsive, summary displays correctly, no keyboard overlap

---

## BLOCKERS VS NON-BLOCKERS

**Blocker (fix immediately):**
- Navigation chain breaks
- CTA inaccessible or hidden
- Text illegible at normal size
- Token system not applied
- Form submission fails

**Non-blocker (work around, fix later):**
- Animation missing/choppy (fallback is acceptable)
- Placeholder image (test flow unblocked)
- API mocked (backend later)
- Keyboard doesn't dismiss (can still submit)
- Morph animation not implemented (ring spinner is fine)

---

## DAY-BY-DAY EXECUTION

### Day 1: Foundations (6-7 hours)
**Goal:** All tokens, theme, and shared components ready

1. **Morning (3h):** Folder structure + React scaffolding
   - Create screens/, components/shared/, theme/ folders
   - Scaffold all 4 screens as empty containers
   - Set up routing (React Router or state-based)

2. **Mid-morning (2h):** Implement tokens
   - Extract 8 colors from Figma (RGB + opacity vars)
   - Create `ui/src/theme/tokens.css` with CSS custom properties
   - Load Inter fonts in index.html
   - Apply theme to body (bg, text color)

3. **Afternoon (2h):** Complete token system
   - Spacing grid (4px multiples up to 32px)
   - Border radius (4, 8, 12px)
   - Shadow stack (inset, subtle, strong)
   - Motion tokens (durations + easing)

4. **Late afternoon (2h):** Build atomic components
   - Button (primary, secondary, ghost + sizes)
   - Card (shadow, radius, overflow)
   - Badge (small label with color)
   - Test on S25 (rendering, crispness)

**Commit:** `feat: core design tokens + atomic components`

---

### Day 2: Home Screen (5-6 hours)
**Goal:** Home screen complete, navigates to Processing

1. **Morning (3h):** Build Home screen
   - Lamp graphic (static SVG or image)
   - "Analyze photo" button (primary variant)
   - Navigation wired: tap → Processing

2. **Late morning (2h):** Setup Processing scaffold
   - Image display placeholder
   - Scanning indicator placeholder
   - Back/Cancel buttons

3. **Afternoon (1h):** Device testing
   - Test on S25: button hit target, text crisp, navigation instant

**Commit:** `feat: Home screen + Processing skeleton + navigation`

---

### Day 3: Processing Screen (6-8 hours)
**Goal:** Processing complete with auto-advance logic

1. **Morning (3h):** Implement Processing logic
   - Image display (from passed data)
   - Scanning indicator (ring spinner, 2.5s loop)
   - Timer display
   - Auto-advance: 2.5s + jitter → Result

2. **Late morning (2h):** Setup Result HC scaffold
   - Result card structure
   - Confidence badge placeholder
   - Alternatives panel placeholder
   - CTAs

3. **Afternoon (2h):** Test and polish
   - Device test on S25: spinner smooth, timer accurate, auto-advance timing
   - Verify image display correct

**Commit:** `feat: Processing screen + auto-advance logic`

---

### Day 4: Result Screens HC/LC (5-6 hours)
**Goal:** Both Result screens complete, navigate to Setup

1. **Morning (4h):** Build Result HC
   - Pattern card (name + gap label + confidence badge)
   - Alternatives panel (default open)
   - "Analyze Another" + "Build This Setup" CTAs
   - Panel toggle (state works, animation deferred)

2. **Late morning (1h):** Copy → Result LC
   - Badge color orange (different from HC)
   - Panel default closed
   - Verify LC credible (not broken)

3. **Afternoon (2h):** Wire navigation + device test
   - Build This Setup → Setup
   - Back → Result (data intact)
   - Device test on S25: both screens side-by-side, LC looks credible

**Commit:** `feat: Result HC + LC screens + CTA navigation`

---

### Day 5: Setup Screen + Full Flow Test (6-8 hours)
**Goal:** Setup complete, entire flow works end-to-end

1. **Morning (4h):** Build Setup screen
   - Form layout (from Figma mockup)
   - Text inputs (capture to local state)
   - Read-only summary (displays pattern info)
   - Confirm + Cancel buttons

2. **Late morning (2h):** Wire navigation + testing
   - Cancel → Result (data intact)
   - Confirm → stub success (console.log + toast)
   - Full end-to-end test on S25: Home → Processing → Result HC → Setup → back

3. **Afternoon (2h):** Test with Result LC, polish
   - Test: Home → analyze → Result LC → Setup
   - Fix any accessibility issues
   - Verify all CTAs tappable, all text readable

**Commit:** `feat: Setup screen + complete core flow`

---

## SELF-DISCIPLINE RULES

1. **No design reopening.** Use current Figma. Don't "improve" designs mid-build.
2. **No scope creep.** Build only Home, Processing, Result, Setup. No Recipes, Wizard, etc.
3. **No animation blocking.** Ring spinner is acceptable. Morph can wait.
4. **No skipping device tests.** Test on S25 after every stage. Don't assume code.
5. **No animation polish until baseline works.** Flow first, polish second.
6. **No generic improvements.** Build exactly what's in the checklist. Nothing more.

---

## CURRENT STATE

- **Figma file:** YQgGd8KZyZoXzZwJV7p4b6 (NGW Core — Product, Studio Matte Theme page)
- **Design tokens:** Extracted and approved
- **Prototype flows:** Wired in Figma (navigation, animations defined)
- **Haptics:** Preserved in code (`ui/src/utils/haptics.js`)
- **Code state:** Ready to start; no conflicting branches

---

## SUCCESS CRITERIA

By end of Day 5:
- [ ] All 5 screens built and interconnected
- [ ] Navigation works forward and back
- [ ] No crashes or blocked flows
- [ ] All text readable on S25 OLED
- [ ] All CTAs accessible (48px+)
- [ ] Form accepts input
- [ ] Timer counts accurately
- [ ] Auto-advance fires at correct timing
- [ ] Confidence badges correct color (HC: green, LC: orange)
- [ ] LC doesn't feel broken or cheaper than HC

If all checks pass: **Core product flow is proven and ready for Day 6 upgrades.**

---

## IMMEDIATE NEXT STEP

Start Day 1 now. Create folder structure and set up tokens. This is the enabling work for everything else.

Don't think, don't redesign, don't expand scope. Build.
