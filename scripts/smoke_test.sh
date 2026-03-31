#!/usr/bin/env bash
# ──────────────────────────────────────────────────────────────
# NGW Smoke Test — repeatable auth / email / OpenAI / API check
#
# Usage:
#   ./scripts/smoke_test.sh                          # local, no admin checks
#   ./scripts/smoke_test.sh https://app.noguessworksystems.com
#
# Full coverage (VLM + SMTP):
#   NGW_ADMIN_EMAIL=todd@toddwillisphoto.com \
#   NGW_ADMIN_PASS=yourpassword \
#   ./scripts/smoke_test.sh https://app.noguessworksystems.com
#
# Exit code: 0 = all passed, 1 = one or more failed
# ──────────────────────────────────────────────────────────────

set -euo pipefail

BASE="${1:-http://localhost:8000}"
ADMIN_EMAIL="${NGW_ADMIN_EMAIL:-}"
ADMIN_PASS="${NGW_ADMIN_PASS:-}"
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

# ── 7. Magic link request (email delivery test) ───────────────
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

# ── 8. Password reset request ─────────────────────────────────
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

# ── 9. Admin checks (VLM + SMTP) ──────────────────────────────
# These require admin credentials.  Pass via env vars:
#   NGW_ADMIN_EMAIL=todd@toddwillisphoto.com NGW_ADMIN_PASS=... ./smoke_test.sh
ADMIN_TOKEN=""
if [ -n "$ADMIN_EMAIL" ] && [ -n "$ADMIN_PASS" ]; then
  ADMIN_LOGIN=$(curl -s -X POST "$BASE/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASS\"}")
  if echo "$ADMIN_LOGIN" | grep -q '"token"'; then
    ADMIN_TOKEN=$(echo "$ADMIN_LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])" 2>/dev/null || echo "")
    green "Admin login ($ADMIN_EMAIL)"
    RESULTS+=("PASS: Admin login")
    (( PASS++ )) || true
  else
    red "Admin login failed — check NGW_ADMIN_EMAIL / NGW_ADMIN_PASS"
    RESULTS+=("FAIL: Admin login")
    (( FAIL++ )) || true
  fi
fi

if [ -n "$ADMIN_TOKEN" ]; then
  KEY_RESP=$(curl -s "$BASE/api/health/api-keys" -H "Authorization: Bearer $ADMIN_TOKEN")

  # ── 9a. VLM / OpenAI ──────────────────────────────────────
  VLM_OK=$(echo "$KEY_RESP" | python3 -c "
import sys, json
try:
  d = json.load(sys.stdin)
  print('true' if d.get('vlm_available') else 'false')
except:
  print('error')
" 2>/dev/null || echo "error")

  if [ "$VLM_OK" = "true" ]; then
    PROVIDER=$(echo "$KEY_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('provider','?'))" 2>/dev/null || echo "?")
    MODEL=$(echo "$KEY_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('model','?'))" 2>/dev/null || echo "?")
    HAS_ERR=$(echo "$KEY_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('has_errors',False))" 2>/dev/null || echo "False")
    green "VLM available — $PROVIDER / $MODEL"
    RESULTS+=("PASS: VLM available ($PROVIDER / $MODEL)")
    (( PASS++ )) || true
    if [ "$HAS_ERR" = "True" ]; then
      yellow "  ⚠ Recent API errors detected — check /api/health/api-keys for details"
    fi
  else
    red "VLM not available — image analysis will fail"
    echo "    Response: $KEY_RESP" >&2
    RESULTS+=("FAIL: VLM not available — check OPENAI_API_KEY / VLM_PROVIDER in Render")
    (( FAIL++ )) || true
  fi

  # ── 9b. SMTP ──────────────────────────────────────────────
  SMTP_OK=$(echo "$KEY_RESP" | python3 -c "
import sys, json
try:
  d = json.load(sys.stdin)
  print('true' if d.get('smtp_configured') else 'false')
  if d.get('smtp_host'): print('host=' + d['smtp_host'], file=__import__('sys').stderr)
except:
  print('error')
" 2>/dev/null || echo "error")

  if [ "$SMTP_OK" = "true" ]; then
    SMTP_HOST=$(echo "$KEY_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('smtp_host','?'))" 2>/dev/null || echo "?")
    FROM_EMAIL=$(echo "$KEY_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('from_email','?'))" 2>/dev/null || echo "?")
    green "SMTP configured — $SMTP_HOST / from: $FROM_EMAIL"
    RESULTS+=("PASS: SMTP configured ($SMTP_HOST)")
    (( PASS++ )) || true
  else
    red "SMTP not configured — magic links and password reset emails will not send"
    RESULTS+=("FAIL: SMTP not configured — set SMTP_HOST, SMTP_USER, SMTP_PASS in Render")
    (( FAIL++ )) || true
  fi

  # ── 9c. APP_URL ───────────────────────────────────────────
  APP_URL=$(echo "$KEY_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('app_url',''))" 2>/dev/null || echo "")
  if [ -n "$APP_URL" ]; then
    green "APP_URL set — $APP_URL"
    RESULTS+=("PASS: APP_URL set ($APP_URL)")
    (( PASS++ )) || true
  else
    yellow "APP_URL not set — email links will use wrong base URL"
    RESULTS+=("WARN: APP_URL not set in Render env vars")
  fi

else
  yellow "Admin checks skipped — set NGW_ADMIN_EMAIL and NGW_ADMIN_PASS for full coverage"
  yellow "  VLM (OpenAI), SMTP, and APP_URL checks require admin JWT"
  RESULTS+=("WARN: Admin checks skipped (no credentials provided)")
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
