#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# NGW Smoke Test — repeatable auth / email / OpenAI / API check
#
# Usage:
#   ./scripts/smoke_test.sh                          # local (default)
#   ./scripts/smoke_test.sh https://app.noguessworksystems.com
#
# Exit code: 0 = all passed, 1 = one or more failed
# ──────────────────────────────────────────────────────────────

set -euo pipefail

BASE="${1:-http://localhost:8000}"
PASS=0
FAIL=0
RESULTS=()

# ── helpers ──────────────────────────────────────────────────

green() { printf "\033[32m✔ %s\033[0m\n" "$*"; }
red()   { printf "\033[31m✘ %s\033[0m\n" "$*"; }
yellow(){ printf "\033[33m⚠ %s\033[0m\n" "$*"; }

check() {
  local label="$1"; shift
  local expected_pattern="$1"; shift
  local response
  response=$(curl -s "$@") || true

  if echo "$response" | grep -q "$expected_pattern"; then
    green "$label"
    RESULTS+=("PASS: $label")
    (( PASS++ )) || true
  else
    red "$label"
    echo "    Response: $response" >&2
    RESULTS+=("FAIL: $label — got: $response")
    (( FAIL++ )) || true
  fi
}

echo ""
echo "NGW Smoke Test → $BASE"
echo "────────────────────────────────────"

# ── 1. Health ─────────────────────────────────────────────────
check "Health endpoint" \
  '"status":"ok"' \
  "$BASE/health"

# ── 2. Config (non-sensitive) ─────────────────────────────────
check "Config endpoint" \
  '"vlm_provider"' \
  "$BASE/api/config"

# ── 3. Diagnostics ────────────────────────────────────────────
check "Diagnostics endpoint" \
  '"status"' \
  "$BASE/api/diagnostics"

# ── 4. OpenAI connectivity ────────────────────────────────────
# Diagnostics should show openai_api_key present and not report billing error
DIAG=$(curl -s "$BASE/api/diagnostics")
if echo "$DIAG" | grep -q '"openai_api_key":"set"'; then
  green "OpenAI API key is set in environment"
  RESULTS+=("PASS: OpenAI API key set")
  (( PASS++ )) || true
else
  red "OpenAI API key NOT SET in environment — image analysis will fail"
  RESULTS+=("FAIL: OPENAI_API_KEY missing from Render env vars")
  (( FAIL++ )) || true
fi

# ── 5. Auth — register a test user ───────────────────────────
TEST_EMAIL="smoke_$(date +%s)@ngwtest.local"
TEST_PW="testpass99"
TEST_NAME="Smoke Test"

REGISTER_RESP=$(curl -s -X POST "$BASE/api/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"username\":\"smoke$(date +%s)\",\"password\":\"$TEST_PW\"}")

if echo "$REGISTER_RESP" | grep -q '"token"'; then
  green "Auth register"
  RESULTS+=("PASS: Auth register")
  (( PASS++ )) || true
  TOKEN=$(echo "$REGISTER_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])" 2>/dev/null || echo "")
else
  red "Auth register"
  echo "    Response: $REGISTER_RESP" >&2
  RESULTS+=("FAIL: Auth register")
  (( FAIL++ )) || true
  TOKEN=""
fi

# ── 6. Auth — login ───────────────────────────────────────────
if [ -n "$TOKEN" ]; then
  LOGIN_RESP=$(curl -s -X POST "$BASE/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PW\"}")

  if echo "$LOGIN_RESP" | grep -q '"token"'; then
    green "Auth login"
    RESULTS+=("PASS: Auth login")
    (( PASS++ )) || true
  else
    red "Auth login"
    RESULTS+=("FAIL: Auth login")
    (( FAIL++ )) || true
  fi
fi

# ── 7. Auth — /me ─────────────────────────────────────────────
if [ -n "$TOKEN" ]; then
  ME_RESP=$(curl -s "$BASE/api/auth/me" -H "Authorization: Bearer $TOKEN")
  if echo "$ME_RESP" | grep -q "$TEST_EMAIL"; then
    green "Auth /me (JWT valid)"
    RESULTS+=("PASS: Auth /me")
    (( PASS++ )) || true
  else
    red "Auth /me (JWT invalid or missing)"
    RESULTS+=("FAIL: Auth /me")
    (( FAIL++ )) || true
  fi
fi

# ── 8. Magic link request (email delivery test) ───────────────
ML_RESP=$(curl -s -X POST "$BASE/api/auth/magic-link/request" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\"}")

if echo "$ML_RESP" | grep -q '"detail"'; then
  green "Magic link request (endpoint responds)"
  RESULTS+=("PASS: Magic link request")
  (( PASS++ )) || true
else
  red "Magic link request"
  RESULTS+=("FAIL: Magic link request — $ML_RESP")
  (( FAIL++ )) || true
fi

# ── 9. Password reset request ─────────────────────────────────
PWR_RESP=$(curl -s -X POST "$BASE/api/auth/password-reset/request" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\"}")

if echo "$PWR_RESP" | grep -q '"detail"'; then
  green "Password reset request (endpoint responds)"
  RESULTS+=("PASS: Password reset request")
  (( PASS++ )) || true
else
  red "Password reset request"
  RESULTS+=("FAIL: Password reset request — $PWR_RESP")
  (( FAIL++ )) || true
fi

# ── 10. Stripe config ─────────────────────────────────────────
STRIPE_CONF=$(curl -s "$BASE/api/config")
if echo "$STRIPE_CONF" | grep -q '"stripe_configured":true'; then
  green "Stripe is configured"
  RESULTS+=("PASS: Stripe configured")
  (( PASS++ )) || true
else
  yellow "Stripe not configured (set STRIPE_SECRET_KEY, STRIPE_PRICE_ID_MONTHLY, etc.)"
  RESULTS+=("WARN: Stripe not configured")
fi

# ── 11. SMTP check (indirect — check server log/config) ───────
SMTP_STATUS=$(curl -s "$BASE/api/diagnostics" | python3 -c "
import sys, json
try:
  d = json.load(sys.stdin)
  smtp = d.get('smtp_configured', d.get('email_configured', 'unknown'))
  print(smtp)
except:
  print('unknown')
" 2>/dev/null || echo "unknown")

if [ "$SMTP_STATUS" = "True" ] || [ "$SMTP_STATUS" = "true" ] || [ "$SMTP_STATUS" = "1" ]; then
  green "SMTP configured"
  RESULTS+=("PASS: SMTP configured")
  (( PASS++ )) || true
else
  yellow "SMTP status unknown — check Render env vars: SMTP_HOST, SMTP_USER, SMTP_PASS"
  yellow "  Expected: SMTP_HOST=smtp.resend.com  SMTP_USER=resend  SMTP_PASS=re_..."
  RESULTS+=("WARN: SMTP status unknown from diagnostics")
fi

# ── Summary ───────────────────────────────────────────────────
echo ""
echo "────────────────────────────────────"
echo "Results: $PASS passed, $FAIL failed"
echo ""
for r in "${RESULTS[@]}"; do
  echo "  $r"
done
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "❌ Smoke test FAILED — $FAIL issue(s) found"
  exit 1
else
  echo "✅ All smoke tests passed"
  exit 0
fi
