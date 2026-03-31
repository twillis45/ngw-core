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
# GET /health → {"ok": true, "service": "ngw-core"}
check "Health endpoint" \
  '"ok"' \
  "$BASE/health"

# ── 2. Config (non-sensitive) ─────────────────────────────────
# GET /api/config → {"moods":[...], "patterns":[...], "issue_types":[...]}
check "Config endpoint (moods)" \
  '"moods"' \
  "$BASE/api/config"

# ── 3. Diagnostics (taxonomy) ─────────────────────────────────
# GET /api/diagnostics → {"count":N, "known_patterns":[...], "diagnostics":[...]}
check "Diagnostics endpoint (taxonomy)" \
  '"count"' \
  "$BASE/api/diagnostics"

# ── 4. Auth — register a test user ───────────────────────────
TEST_EMAIL="smoke_$(date +%s)@ngwtest.local"
TEST_PW="testpass99"

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

# ── 5. Auth — login ───────────────────────────────────────────
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

# ── 6. Auth — /me ─────────────────────────────────────────────
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

# ── 7. VLM / API key status (admin-only endpoint) ────────────
# GET /api/health/api-keys requires admin JWT.
# We use the smoke test token — this will succeed if TEST_EMAIL is admin,
# otherwise we get a 403 and warn (not fail) since it's access-controlled.
if [ -n "$TOKEN" ]; then
  KEY_RESP=$(curl -s "$BASE/api/health/api-keys" -H "Authorization: Bearer $TOKEN")
  if echo "$KEY_RESP" | grep -q '"vlm_available"'; then
    VLM_OK=$(echo "$KEY_RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('vlm_available','?'))" 2>/dev/null || echo "?")
    if [ "$VLM_OK" = "True" ] || [ "$VLM_OK" = "true" ]; then
      green "VLM available (API key valid)"
      RESULTS+=("PASS: VLM available")
      (( PASS++ )) || true
    else
      red "VLM not available — check OPENAI_API_KEY / VLM_PROVIDER in Render env vars"
      RESULTS+=("FAIL: VLM not available — image analysis will fail")
      (( FAIL++ )) || true
    fi
  else
    yellow "VLM status unknown — /api/health/api-keys requires admin JWT (expected for smoke test user)"
    RESULTS+=("WARN: VLM check skipped — smoke test user is not admin")
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

# ── 10. SMTP / email — indirect check via magic link ──────────
# We can't check SMTP config directly without an admin endpoint.
# Instead we check if the magic link endpoint returned successfully
# (if SMTP were broken, the endpoint still returns 200 — it's non-fatal).
# Manual check: Render dashboard → SMTP_HOST, SMTP_USER, SMTP_PASS env vars.
yellow "SMTP — manual verification required: check Render env vars"
yellow "  SMTP_HOST=smtp.resend.com  SMTP_USER=resend  SMTP_PASS=re_..."
RESULTS+=("WARN: SMTP requires manual Render env var check")

# ── 11. Stripe config ─────────────────────────────────────────
# /api/config returns moods/patterns — Stripe config is not exposed publicly.
# Manual check: verify STRIPE_SECRET_KEY, STRIPE_PRICE_ID_MONTHLY in Render.
STRIPE_KEY_SET=$([ -n "${STRIPE_SECRET_KEY:-}" ] && echo "yes" || echo "no")
if [ "$STRIPE_KEY_SET" = "yes" ]; then
  green "Stripe secret key present (local env)"
  RESULTS+=("PASS: Stripe key in local env")
  (( PASS++ )) || true
else
  yellow "Stripe not verified — set STRIPE_SECRET_KEY in Render env vars"
  RESULTS+=("WARN: Stripe not verified by smoke test")
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
