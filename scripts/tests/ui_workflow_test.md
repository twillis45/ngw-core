# NGW UI Workflow Test Plan
> Last run: 2026-03-31 | Viewport: 390×844 (iPhone 14 Pro) | Dev server: localhost:5173
> Tool: `npx agent-browser` (CDP-based headless Chrome)

---

## How to Run

```bash
cd /Users/toddwillis/Documents/ngw-core
npx vite  # ensure dev server is on :5173
npx agent-browser set viewport 390 844
# Then run each section below manually or via the companion shell script
# scripts/tests/ui_smoke.sh
```

---

## Guest / Unauthenticated Paths

### Home Screen (Free)
- [ ] Hero: "See your light." headline + subtitle render
- [ ] "Analyze a Photo" CTA — amber/gold button, visible label
- [ ] "Trusted by photographers…" hint text
- [ ] "Browse Proven Setups" secondary row with book icon
- [ ] No "Build from Scratch" button visible
- [ ] Stage card absent when no saved setups exist
- [ ] Sign-in button: icon + "Sign in" text, no pill border
- [ ] Settings gear icon visible
- [ ] No theme toggle on home (it's suppressed on home/welcome)
- [ ] Bottom nav: Home (active), Recipes, My Kit, Saved, New

### Auth — Sign In
- [ ] Tap "Sign in" → auth card renders
- [ ] "Log In" button: amber/gold, dark text, full-width (**was white-invisible — fixed**)
- [ ] Bad credentials → red "Invalid email or password" banner
- [ ] Fields retain value after failed submit
- [ ] Close (×) → back to home

### Auth — Sign Up
- [ ] "Don't have an account? Sign up →" → create account form
- [ ] "Create Account" button styled correctly (amber/gold)
- [ ] Bad email (missing @) → browser native validation tooltip
- [ ] "Already have an account? Log in →" → back to sign in

### Auth — Forgot Password
- [ ] "Forgot your password?" → reset form
- [ ] "Send Reset Link" button styled correctly (amber/gold)
- [ ] Bad email → browser validation
- [ ] Valid email submit → "Check your email" success state
  - Checkmark icon, privacy-respecting copy, 1-hour expiry notice
- [ ] "Back to sign in" from reset success → sign in form

### Settings (Guest)
- [ ] Gear icon → Settings screen
- [ ] "G" avatar, "Guest" label, "Free" badge
- [ ] Photographer mode row with "Tap to change >"
- [ ] GENERAL: Units, Analysis auto-save toggle, Default kit view, Preferences
- [ ] SUPPORT: Help & FAQ, Contact support, Rate NGW
- [ ] LEGAL: Privacy Policy, Terms of Service
- [ ] Footer: "No Guesswork Lighting v1.4.x"
- [ ] "< Back" → returns to home

### Preferences
- [ ] Full list: Shoot Mode, Analysis, Recipes, Appearance, Intelligence, Privacy sections
- [ ] "Reset to Defaults" button at bottom (amber/gold, destructive intent)
- [ ] "< Settings" back nav → Settings screen

### Recipes (Guest)
- [ ] Navigate via "Browse Proven Setups" CTA or bottom nav
- [ ] "Recipes" title, filter chips: All, Headshot, Event, Studio, Creative, Video
- [ ] Filter chip tap → list filters correctly (Headshot tested ✓)
- [ ] All recipes show "PRO ONLY" badge and lock icon for guest
- [ ] "Sign in" prompt on each card
- [ ] Tap locked recipe → Paywall modal opens

### Paywall Modal
- [ ] "UNLOCK THE FULL SYSTEM" eyebrow
- [ ] Monthly/Yearly billing toggle — "Save 17%" badge on Yearly
- [ ] Free tier card: $0, feature list with ✓/— markers, "Current plan" (disabled)
- [ ] Pro tier card: $39/mo, full feature list, "Start Pro — $39/mo →" CTA
- [ ] Studio tier: "Coming soon" (disabled)
- [ ] Modal scrollable to reveal Pro CTA (**was clipped — fixed**)
- [ ] Close (×) → back to Recipes
- [ ] Tap overlay backdrop → closes modal

### My Kit
- [ ] Empty state: bag icon, "Add your gear" heading, 3 bullet benefits, "Add Your First Light" CTA, "Skip for now"
- [ ] "Add Your First Light" → Kit Picker screen
  - PHOTO KITS / VIDEO KITS / Speedlights / Portable Strobes sections (collapsible)
  - BETTER ★ / BEST / GOOD groupings
  - Select a kit → "N lights owned" summary bar appears
  - Selected card gets amber border
  - "Save Kit →" sticky CTA
- [ ] After save → My Kit populated:
  - "YOUR KIT MATCHES N recipes Browse >" banner
  - LIGHTS section: gear name, quantity, "Active in X recipes" green bar
  - MODIFIERS section
  - SUPPORT section
  - Tip row (e.g. "Add a beauty dish — unlocks…")
  - "Clear Kit" (amber/gold, bottom)
- [ ] Edit → back to Kit Picker with current selection
- [ ] Change kit → recipe count updates reactively (**verified: 9 → 10 recipes**)
- [ ] "Browse >" → navigates to Recipes screen
- [ ] "Clear Kit" → first tap: "Confirm Clear"; second tap: returns to empty state (**2-tap confirm ✓**)

### Saved Setups (Guest)
- [ ] Empty state: list icon, "No setups yet", 3-step guide, "Build a Setup" CTA

### New Tab (+)
- [ ] Tapping + nav → navigates to Home screen

---

## Known Issues / Observations

| # | Severity | Description | Status |
|---|----------|-------------|--------|
| 1 | 🔴 Fixed | Auth buttons (Log In, Create Account, Send Reset) invisible — white bg, no styling | Fixed 2026-03-31 |
| 2 | 🔴 Fixed | Paywall modal clips Pro CTA — no scroll affordance on mobile | Fixed 2026-03-31 |
| 3 | 🟡 Review | Kit match count "Active in X recipes" jumps from 2→7 during Clear Kit confirm step | Needs investigation |
| 4 | 🟡 Review | Kit-matched recipes not visually differentiated in recipe list (guest can't tell which 9 match) | Design decision? |
| 5 | 🟡 Review | Header (logo, sign-in, settings) only shows on home/results/shoot_mode — Recipes/MyKit use their own header | By design — verify intentional |

---

## Paid / Authenticated Paths (requires sign-in)
> These paths need to be tested manually or with a test account

- [ ] Home (Paid) — stage card with last analysis result
- [ ] Home (Paid, no result) — continue card with last saved setup
- [ ] Home (Paid) — recent setups list (up to 3)
- [ ] "Resume last analysis" → results screen
- [ ] "Continue last setup" → saved setups screen
- [ ] Stage card: pattern name filtered (no "split", "build", "none", "bare")
- [ ] Stage card camera LCD styling (dark bg, corner brackets, confidence %, chips)
- [ ] User avatar in header (initial letter, links to Settings)
- [ ] Settings (Paid) — "Pro" badge, plan info
- [ ] Recipes (Paid) — unlocked cards, setup sheet accessible
- [ ] Shoot Mode flow
- [ ] Analysis flow: upload photo → ref_eval → results screen

---

## Regression Checklist (run after any CSS/logic change)

```
□ Auth buttons visible (amber/gold, dark text)
□ Paywall modal scrollable to Pro CTA
□ Stage card not shown when no saved setups
□ "split" / "build" not appearing as text anywhere on home
□ No "Build from Scratch" button on home
□ Sign-in button: no pill border/background
□ Bottom nav: 5 tabs, correct icons
□ Kit recipe count updates when kit changes
□ Clear Kit requires 2-tap confirmation
```

---

## Suggestion: Automate with agent-browser shell script

Save a companion script at `scripts/tests/ui_smoke.sh` that:
1. Launches `agent-browser` against `localhost:5173`
2. Sets mobile viewport (390×844)
3. Runs each critical path and screenshots to `/tmp/ngw-test/`
4. Reports pass/fail based on element presence

This gives you a fast visual regression check after every significant CSS or logic change without manual re-testing. Can be wired into a pre-deploy hook or run manually before PRs.
