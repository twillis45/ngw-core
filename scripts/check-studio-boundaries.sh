#!/usr/bin/env bash
# scripts/check-studio-boundaries.sh
#
# Enforces Studio Matte parallel-rollout import boundaries.
# Runs without ESLint in the toolchain. Exit 0 on clean, 1 on violation.
#
# Rules:
#   1. Prod code must not import from ui/src/screens/studio/**
#      Allowlist: ui/src/screens/Day1DemoApp.jsx (studio shell host).
#   2. Studio screens must not import prod *V2.jsx surfaces
#      (HomeScreenV2, ResultsScreenV2, WelcomeScreenV2).
#   3. ui/src/theme/studioMatte.js may only be imported from studio code
#      or the Day1DemoApp shell.

set -eu
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

fail=0

# ── Rule 1 ─────────────────────────────────────────────────────────────────
echo "[boundaries] Rule 1: prod code must not import screens/studio/**"
hits=$(grep -rln --include='*.jsx' --include='*.js' \
  -E "from ['\"][^'\"]*screens/studio" ui/src 2>/dev/null \
  | grep -v '^ui/src/screens/studio/' \
  | grep -v '^ui/src/screens/Day1DemoApp\.jsx$' \
  || true)
if [[ -n "$hits" ]]; then
  echo "  FAIL — prod files importing from screens/studio/:"
  echo "$hits" | sed 's/^/    /'
  fail=1
else
  echo "  OK"
fi

# ── Rule 2 ─────────────────────────────────────────────────────────────────
echo "[boundaries] Rule 2: studio screens must not import prod *V2.jsx"
hits=$(grep -rln --include='*.jsx' --include='*.js' \
  -E "from ['\"][^'\"]*(HomeScreenV2|ResultsScreenV2|WelcomeScreenV2)['\"]" \
  ui/src/screens/studio 2>/dev/null \
  || true)
if [[ -n "$hits" ]]; then
  echo "  FAIL — studio files importing prod *V2 screens:"
  echo "$hits" | sed 's/^/    /'
  fail=1
else
  echo "  OK"
fi

# ── Rule 3 ─────────────────────────────────────────────────────────────────
echo "[boundaries] Rule 3: theme/studioMatte importers are studio-only"
hits=$(grep -rln --include='*.jsx' --include='*.js' \
  -E "from ['\"][^'\"]*theme/studioMatte" ui/src 2>/dev/null \
  | grep -v '^ui/src/screens/studio/' \
  | grep -v '^ui/src/screens/Day1DemoApp\.jsx$' \
  | grep -v '^ui/src/theme/studioMatte\.js$' \
  || true)
if [[ -n "$hits" ]]; then
  echo "  FAIL — theme/studioMatte imported from outside studio:"
  echo "$hits" | sed 's/^/    /'
  fail=1
else
  echo "  OK"
fi

if [[ $fail -eq 0 ]]; then
  echo "[boundaries] All checks passed."
  exit 0
else
  echo "[boundaries] Violations found. See rules above."
  exit 1
fi
