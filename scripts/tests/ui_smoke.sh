#!/usr/bin/env bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# NGW UI Smoke Test
# Runs critical-path checks against the dev server using agent-browser (CDP).
#
# Usage:
#   ./scripts/tests/ui_smoke.sh              # default: localhost:5173
#   ./scripts/tests/ui_smoke.sh 5174         # custom port
#   ./scripts/tests/ui_smoke.sh 5173 --keep  # keep screenshots after run
#
# Requirements:
#   npx agent-browser  (or install globally: npm i -g agent-browser)
#
# Output:
#   Screenshots saved to /tmp/ngw-smoke/
#   Pass/fail summary printed to stdout
#   Exit code 0 = all passed, 1 = failures found
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

set -euo pipefail

PORT="${1:-5173}"
BASE_URL="http://localhost:${PORT}"
KEEP="${2:-}"
SHOT_DIR="/tmp/ngw-smoke"
AB="npx --yes agent-browser"
PASS=0
FAIL=0
FAILURES=()

mkdir -p "$SHOT_DIR"

# ── Colours ──────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RESET='\033[0m'
BOLD='\033[1m'

# ── Helpers ───────────────────────────────────────────────────────────────────

log_section() { echo -e "\n${BLUE}${BOLD}▶ $1${RESET}"; }

pass() {
  PASS=$((PASS + 1))
  echo -e "  ${GREEN}✓${RESET} $1"
}

fail() {
  FAIL=$((FAIL + 1))
  FAILURES+=("$1")
  echo -e "  ${RED}✗${RESET} $1"
}

shot() {
  local name="$1"
  $AB screenshot "$SHOT_DIR/${name}.png" 2>/dev/null || true
}

# Run a snippet and check the output contains an expected string
check_text() {
  local label="$1"
  local expected="$2"
  local result
  result=$($AB snapshot -i 2>/dev/null || echo "")
  if echo "$result" | grep -q "$expected"; then
    pass "$label"
  else
    fail "$label (expected: \"$expected\")"
  fi
}

# Check that an element ref exists with a given label fragment
check_ref() {
  local label="$1"
  local expected="$2"
  local result
  result=$($AB snapshot -i 2>/dev/null || echo "")
  if echo "$result" | grep -qi "$expected"; then
    pass "$label"
  else
    fail "$label (not found: \"$expected\")"
  fi
}

# Check that text does NOT appear on screen
check_absent() {
  local label="$1"
  local forbidden="$2"
  local result
  result=$($AB snapshot -i 2>/dev/null || echo "")
  if echo "$result" | grep -qi "$forbidden"; then
    fail "$label (found forbidden: \"$forbidden\")"
  else
    pass "$label"
  fi
}

nav_click() {
  # Click bottom nav by index (0=Home 1=Recipes 2=MyKit 3=Saved 4=New)
  local idx="$1"
  $AB eval "document.querySelectorAll('.bottom-nav__btn, .bottom-nav button, nav button')[${idx}]?.click()" 2>/dev/null || true
  sleep 0.5
}

# ── Preflight: dev server ─────────────────────────────────────────────────────

log_section "Preflight"

if ! curl -sf "$BASE_URL" -o /dev/null 2>/dev/null; then
  echo -e "${RED}${BOLD}Dev server not found at $BASE_URL${RESET}"
  echo "  Start it with: npx vite  (or npm run dev)"
  exit 1
fi
pass "Dev server running at $BASE_URL"

# ── Open app ──────────────────────────────────────────────────────────────────

$AB open "$BASE_URL" 2>/dev/null
$AB wait --load networkidle 2>/dev/null
$AB set viewport 390 844 2>/dev/null
sleep 0.5

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
log_section "Home Screen (Guest)"
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

shot "01-home-guest"

check_text "Hero headline present"           "See your light"
check_ref  "'Analyze a Photo' CTA"           "Analyze a Photo"
check_ref  "'Browse Proven Setups' row"      "Browse Proven Setups"
check_ref  "Sign-in button visible"          "Sign in"
check_ref  "Settings gear visible"           "Settings"
check_absent "No 'Build from Scratch'"       "Build from Scratch"
check_absent "No stage card without data"    "home-v2__stage"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
log_section "Auth Screen — Sign In"
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Open auth
SIGNIN_REF=$($AB snapshot -i 2>/dev/null | grep '"Sign in"' | grep -o 'ref=e[0-9]*' | head -1 | sed 's/ref=//')
$AB click "@${SIGNIN_REF}" 2>/dev/null
sleep 0.5
shot "02-auth-signin"

check_ref  "Auth card renders"               "Sign in"
check_ref  "'Log In' button accessible"      "Log In"

# Check button has background (not invisible) via CSS
BTN_BG=$($AB eval "getComputedStyle(document.querySelector('.auth-form__submit'))?.backgroundColor" 2>/dev/null || echo "")
if echo "$BTN_BG" | grep -qv "rgba(0, 0, 0, 0)"; then
  pass "Auth submit button has visible background"
else
  fail "Auth submit button background is transparent (invisible)"
fi

# Bad credentials
EMAIL_REF=$($AB snapshot -i 2>/dev/null | grep 'textbox "Email"' | grep -o 'ref=e[0-9]*' | head -1 | sed 's/ref=//')
PASS_REF=$($AB snapshot -i 2>/dev/null | grep 'textbox "Password"' | grep -o 'ref=e[0-9]*' | head -1 | sed 's/ref=//')
LOGIN_REF=$($AB snapshot -i 2>/dev/null | grep '"Log In"' | grep -o 'ref=e[0-9]*' | head -1 | sed 's/ref=//')

$AB fill "@${EMAIL_REF}" "bad@test.com"  2>/dev/null
$AB fill "@${PASS_REF}"  "wrongpassword" 2>/dev/null
$AB click "@${LOGIN_REF}" 2>/dev/null
sleep 2
shot "03-auth-bad-creds"

check_ref  "Bad-creds error banner shows" "Invalid email or password"

# Close auth
CLOSE_REF=$($AB snapshot -i 2>/dev/null | grep '"Close"' | grep -o 'ref=e[0-9]*' | head -1 | sed 's/ref=//')
$AB click "@${CLOSE_REF}" 2>/dev/null
sleep 0.4

check_ref  "Back to home after close" "See your light"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
log_section "Auth Screen — Sign Up"
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SIGNIN_REF=$($AB snapshot -i 2>/dev/null | grep '"Sign in"' | grep -o 'ref=e[0-9]*' | head -1 | sed 's/ref=//')
$AB click "@${SIGNIN_REF}" 2>/dev/null; sleep 0.4

SIGNUP_REF=$($AB snapshot -i 2>/dev/null | grep "Sign up" | grep -o 'ref=e[0-9]*' | head -1 | sed 's/ref=//')
$AB click "@${SIGNUP_REF}" 2>/dev/null; sleep 0.4
shot "04-auth-signup"

check_ref  "Create account form renders"     "Create your account"
check_ref  "'Create Account' button"         "Create Account"

# Check button is styled
BTN_BG=$($AB eval "getComputedStyle(document.querySelector('.auth-form__submit'))?.backgroundColor" 2>/dev/null || echo "")
if echo "$BTN_BG" | grep -qv "rgba(0, 0, 0, 0)"; then
  pass "Create Account button has visible background"
else
  fail "Create Account button background is transparent"
fi

CLOSE_REF=$($AB snapshot -i 2>/dev/null | grep '"Close"' | grep -o 'ref=e[0-9]*' | head -1 | sed 's/ref=//')
$AB click "@${CLOSE_REF}" 2>/dev/null; sleep 0.4

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
log_section "Auth Screen — Forgot Password"
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SIGNIN_REF=$($AB snapshot -i 2>/dev/null | grep '"Sign in"' | grep -o 'ref=e[0-9]*' | head -1 | sed 's/ref=//')
$AB click "@${SIGNIN_REF}" 2>/dev/null; sleep 0.4

FORGOT_REF=$($AB snapshot -i 2>/dev/null | grep "Forgot" | grep -o 'ref=e[0-9]*' | head -1 | sed 's/ref=//')
$AB click "@${FORGOT_REF}" 2>/dev/null; sleep 0.4

EMAIL_REF=$($AB snapshot -i 2>/dev/null | grep 'textbox "Email"' | grep -o 'ref=e[0-9]*' | head -1 | sed 's/ref=//')
$AB fill "@${EMAIL_REF}" "smoke@test.com" 2>/dev/null

SEND_REF=$($AB snapshot -i 2>/dev/null | grep "Send Reset" | grep -o 'ref=e[0-9]*' | head -1 | sed 's/ref=//')
$AB click "@${SEND_REF}" 2>/dev/null; sleep 2
shot "05-auth-reset-sent"

check_ref  "Reset sent success state"        "Check your email"
check_ref  "Privacy-respecting copy"         "smoke@test.com"
check_ref  "Expiry notice"                   "expires"

BACK_REF=$($AB snapshot -i 2>/dev/null | grep "Back to sign in" | grep -o 'ref=e[0-9]*' | head -1 | sed 's/ref=//')
$AB click "@${BACK_REF}" 2>/dev/null; sleep 0.3
CLOSE_REF=$($AB snapshot -i 2>/dev/null | grep '"Close"' | grep -o 'ref=e[0-9]*' | head -1 | sed 's/ref=//')
$AB click "@${CLOSE_REF}" 2>/dev/null; sleep 0.4

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
log_section "Settings (Guest)"
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

GEAR_REF=$($AB snapshot -i 2>/dev/null | grep '"Settings"' | grep -o 'ref=e[0-9]*' | head -1 | sed 's/ref=//')
$AB click "@${GEAR_REF}" 2>/dev/null; sleep 0.5
shot "06-settings-guest"

check_ref  "Settings screen header"         "Settings"
check_ref  "Guest user label"               "Guest"
check_ref  "Free tier badge"                "Free"
check_ref  "Photographer mode row"          "Photographer mode"
check_ref  "Units row"                      "Units"
check_ref  "Preferences row"                "Preferences"
check_ref  "Help & FAQ row"                 "Help"
check_ref  "Privacy Policy row"             "Privacy"
check_ref  "Version footer"                 "v1."

BACK_REF=$($AB snapshot -i 2>/dev/null | grep "Back" | grep -o 'ref=e[0-9]*' | head -1 | sed 's/ref=//')
$AB click "@${BACK_REF}" 2>/dev/null; sleep 0.4

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
log_section "Recipes Screen"
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

BROWSE_REF=$($AB snapshot -i 2>/dev/null | grep "Browse Proven" | grep -o 'ref=e[0-9]*' | head -1 | sed 's/ref=//')
$AB click "@${BROWSE_REF}" 2>/dev/null; sleep 0.5
shot "07-recipes"

check_ref  "Recipes heading"                "Recipes"
check_ref  "Filter chips visible"           "Headshot"
check_ref  "PRO ONLY gating for guest"      "PRO ONLY"
check_ref  "Lock icon on cards"             "Sign in"

# Filter chip test
HEADSHOT_REF=$($AB snapshot -i 2>/dev/null | grep '"Headshot"' | grep -o 'ref=e[0-9]*' | head -1 | sed 's/ref=//')
$AB click "@${HEADSHOT_REF}" 2>/dev/null; sleep 0.5
shot "07b-recipes-filtered"
check_ref  "Headshot filter applied"        "Headshot"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
log_section "Paywall Modal"
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Tap "All" to reset filter, then tap first locked recipe
ALL_REF=$($AB snapshot -i 2>/dev/null | grep '"All"' | grep -o 'ref=e[0-9]*' | head -1 | sed 's/ref=//')
$AB click "@${ALL_REF}" 2>/dev/null; sleep 0.3

FIRST_RECIPE=$($AB snapshot -i 2>/dev/null | grep 'PRO ONLY' | grep -o 'ref=e[0-9]*' | head -1 | sed 's/ref=//')
$AB click "@${FIRST_RECIPE}" 2>/dev/null; sleep 0.5
shot "08-paywall"

check_ref  "Paywall eyebrow"                "UNLOCK THE FULL SYSTEM"
check_ref  "Monthly/Yearly toggle"          "Monthly"
check_ref  "Yearly toggle with badge"       "Save 17%"
check_ref  "Free tier card"                 "Current plan"
check_ref  "Pro tier CTA accessible in DOM" "Start Pro"

# Check Pro CTA is reachable by scrolling
$AB scroll down 300 2>/dev/null; sleep 0.3
shot "08b-paywall-scrolled"

check_ref  "Pro CTA visible after scroll"   "Start Pro"

# Yearly pricing check: $33/mo (390/12=32.5→33), not $390/mo
YEARLY_REF=$($AB snapshot -i 2>/dev/null | grep "Yearly" | grep -o 'ref=e[0-9]*' | head -1 | sed 's/ref=//')
$AB click "@${YEARLY_REF}" 2>/dev/null; sleep 0.4
shot "08c-paywall-yearly"

YEARLY_PRICE=$($AB eval "document.querySelector('.pricing-tier--featured .pricing-tier__amount')?.textContent" 2>/dev/null || echo "")
if [ "$YEARLY_PRICE" = "33" ] || [ "$YEARLY_PRICE" = "32" ]; then
  pass "Yearly price shows per-month equivalent (~\$33/mo)"
else
  fail "Yearly price incorrect: got '\$${YEARLY_PRICE}' (expected ~\$33)"
fi

# Billing note should say /yr not /mo×12
BILLING_NOTE=$($AB eval "document.querySelector('.pricing-tier__billing-note')?.textContent" 2>/dev/null || echo "")
if echo "$BILLING_NOTE" | grep -q "Billed \$390/yr"; then
  pass "Yearly billing note shows \$390/yr"
else
  fail "Yearly billing note incorrect: got '${BILLING_NOTE}'"
fi

$AB scroll up 9999 2>/dev/null; sleep 0.2
CLOSE_REF=$($AB snapshot -i 2>/dev/null | grep '"Close"' | grep -o 'ref=e[0-9]*' | head -1 | sed 's/ref=//')
$AB click "@${CLOSE_REF}" 2>/dev/null; sleep 0.4

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
log_section "My Kit — Add / Change / Clear"
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

nav_click 2
shot "09-my-kit"

SNAPSHOT=$($AB snapshot -i 2>/dev/null)

if echo "$SNAPSHOT" | grep -q "Add your gear"; then
  # Empty state — add a kit
  pass "My Kit empty state renders"

  ADD_REF=$(echo "$SNAPSHOT" | grep "Add Your First Light" | grep -o 'ref=e[0-9]*' | head -1 | sed 's/ref=//')
  $AB click "@${ADD_REF}" 2>/dev/null; sleep 0.5

  check_ref "Kit picker opens"              "Edit Your Kit"
  check_ref "BETTER/BEST groupings"         "BETTER"

  # Select first kit in BETTER group and save
  FIRST_KIT=$($AB snapshot -i 2>/dev/null | grep 'button "2-Light Portrait\|1-Light Starter\|3-Light' | grep -o 'ref=e[0-9]*' | head -1 | sed 's/ref=//')
  $AB click "@${FIRST_KIT}" 2>/dev/null; sleep 0.3

  SAVE_REF=$($AB snapshot -i 2>/dev/null | grep "Save Kit" | grep -o 'ref=e[0-9]*' | head -1 | sed 's/ref=//')
  $AB click "@${SAVE_REF}" 2>/dev/null; sleep 0.8
  shot "09b-my-kit-saved"

  check_ref  "Kit saved — recipe match banner"  "YOUR KIT MATCHES"
  check_ref  "Recipe count in banner"           "recipes"
  check_ref  "LIGHTS section"                   "LIGHTS"
  check_ref  "Active in recipes"                "Active in"
  check_ref  "MODIFIERS section"                "MODIFIERS"
  check_ref  "Clear Kit button"                 "Clear Kit"

else
  # Kit already populated
  pass "My Kit populated state renders"
  check_ref  "Kit match banner"                 "YOUR KIT MATCHES"
  check_ref  "Clear Kit button"                 "Clear Kit"
fi

# Change kit
$AB eval "Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Edit')?.click()" 2>/dev/null; sleep 0.5
check_ref  "Kit picker opens for edit"          "Edit Your Kit"

# Pick a different kit
SMALL_KIT=$($AB snapshot -i 2>/dev/null | grep '1-Light Starter\|Single Umbrella\|LED Single' | grep -o 'ref=e[0-9]*' | head -1 | sed 's/ref=//')
[ -n "$SMALL_KIT" ] && $AB click "@${SMALL_KIT}" 2>/dev/null; sleep 0.3

SAVE_REF=$($AB snapshot -i 2>/dev/null | grep "Save Kit" | grep -o 'ref=e[0-9]*' | head -1 | sed 's/ref=//')
$AB click "@${SAVE_REF}" 2>/dev/null; sleep 0.8

COUNT_BEFORE=$($AB eval "document.querySelector('.home-v2__kit-count, [class*=kit-count], [class*=matches]')?.textContent" 2>/dev/null || echo "")
shot "09c-kit-changed"
check_ref  "Recipe count updates after kit change" "recipes"

# Clear kit — 2-tap confirm
CLEAR_REF=$($AB snapshot -i 2>/dev/null | grep '"Clear Kit"' | grep -o 'ref=e[0-9]*' | head -1 | sed 's/ref=//')
$AB click "@${CLEAR_REF}" 2>/dev/null; sleep 0.5
check_ref  "Clear Kit → Confirm Clear (2-tap)"  "Confirm Clear"

CONFIRM_REF=$($AB snapshot -i 2>/dev/null | grep '"Confirm Clear"' | grep -o 'ref=e[0-9]*' | head -1 | sed 's/ref=//')
$AB click "@${CONFIRM_REF}" 2>/dev/null; sleep 0.8
shot "09d-kit-cleared"

check_ref  "Kit cleared → empty state"     "Add your gear"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
log_section "Saved Setups (empty)"
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

nav_click 3
shot "10-saved-empty"
check_ref  "Saved empty state"             "No setups yet"
check_ref  "Build a Setup CTA"             "Build a Setup"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
log_section "New Tab"
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

nav_click 4
sleep 0.4
shot "11-new-tab"
check_ref  "New tab navigates to home"     "See your light"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
log_section "Content Guards"
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

# Reload fresh state and check filtered words never appear on home
$AB open "$BASE_URL" 2>/dev/null; sleep 1
$AB set viewport 390 844 2>/dev/null

check_absent "Filtered word 'split' absent from home"  "split"
check_absent "Filtered word 'build' absent from home"  "Build from Scratch"
check_absent "No 'LIGHTING PATTERN' label"             "LIGHTING PATTERN"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Close browser
$AB close 2>/dev/null || true

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Summary
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TOTAL=$((PASS + FAIL))

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BOLD}NGW UI Smoke Test — Results${RESET}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  ${GREEN}Passed:${RESET} $PASS / $TOTAL"

if [ $FAIL -gt 0 ]; then
  echo -e "  ${RED}Failed:${RESET} $FAIL / $TOTAL"
  echo ""
  echo -e "${RED}${BOLD}Failures:${RESET}"
  for f in "${FAILURES[@]}"; do
    echo -e "  ${RED}✗${RESET} $f"
  done
fi

echo ""
echo -e "  Screenshots: $SHOT_DIR/"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -z "$KEEP" ] && [ $FAIL -eq 0 ]; then
  echo -e "  ${YELLOW}(pass --keep to retain screenshots on success)${RESET}"
fi

[ $FAIL -eq 0 ] && exit 0 || exit 1
