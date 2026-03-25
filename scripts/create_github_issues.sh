#!/usr/bin/env bash
# ============================================================
# NGW Core — GitHub Issues Bootstrap
# Creates all MVP hardening issues with labels + milestones.
#
# Usage:
#   gh auth login
#   bash scripts/create_github_issues.sh
# ============================================================

set -e

REPO="twillis45/ngw-core"

echo "Creating labels..."
gh label create "blocker"      --color "D93F0B" --description "Must fix before launch"              --repo "$REPO" 2>/dev/null || true
gh label create "security"     --color "E4E669" --description "Auth, access control, secrets"       --repo "$REPO" 2>/dev/null || true
gh label create "infra"        --color "0075CA" --description "Deployment, CI/CD, dependencies"     --repo "$REPO" 2>/dev/null || true
gh label create "backend"      --color "5319E7" --description "FastAPI, engine, database"           --repo "$REPO" 2>/dev/null || true
gh label create "frontend"     --color "1D76DB" --description "React UI, hooks, screens"            --repo "$REPO" 2>/dev/null || true
gh label create "payments"     --color "FBCA04" --description "Stripe, subscriptions, paywall"      --repo "$REPO" 2>/dev/null || true
gh label create "observability" --color "0E8A16" --description "Logging, monitoring, alerts"        --repo "$REPO" 2>/dev/null || true

echo "Creating milestones..."
gh api repos/$REPO/milestones --method POST -f title="v1.0.0-launch"    -f description="Pre-launch blockers — must fix before first paying user" 2>/dev/null || true
gh api repos/$REPO/milestones --method POST -f title="v1.0.1-hardening" -f description="Week 1 post-deploy hardening"                           2>/dev/null || true
gh api repos/$REPO/milestones --method POST -f title="v1.1.0-polish"    -f description="First sprint post-launch"                               2>/dev/null || true

echo ""
echo "============================================================"
echo "MILESTONE: v1.0.0-launch (Pre-Launch Blockers)"
echo "============================================================"

gh issue create --repo "$REPO" \
  --title "Migrate SQLite to PostgreSQL (Neon) before first deploy" \
  --label "blocker,infra,backend" \
  --milestone "v1.0.0-launch" \
  --body "## Problem
SQLite does not support concurrent writes. The moment two users hit \`/recommend\` simultaneously, writes queue or fail. This is not acceptable for a commercial SaaS.

## Evidence
- \`db/database.py\` initialises a single SQLite file at \`ngw_users.db\`
- \`db/pg_provenance.py\` already has the PostgreSQL migration path started

## Acceptance Criteria
- [ ] Provision Neon Postgres via Render Marketplace or direct
- [ ] \`DATABASE_URL\` env var replaces the SQLite file path
- [ ] All \`db/\` modules updated to use async Postgres driver (\`asyncpg\` or \`psycopg2\`)
- [ ] Schema initialisation runs cleanly against Postgres
- [ ] All existing tests pass against Postgres
- [ ] SQLite file removed from repo and \`.gitignore\`d

## Notes
\`db/pg_provenance.py\` exists as a reference starting point. Alembic migrations should be added in the same PR (see issue #migrations)."

gh issue create --repo "$REPO" \
  --title "Add startup guard: reject NGW_DEV_MODE=1 outside local dev" \
  --label "blocker,security,backend" \
  --milestone "v1.0.0-launch" \
  --body "## Problem
\`NGW_DEV_MODE=1\` bypasses all authentication. If this env var is set (accidentally or maliciously) in production, any request is fully unauthenticated.

## Location
\`main.py\` — lifespan context manager

## Acceptance Criteria
- [ ] On startup, if \`NGW_DEV_MODE=1\` and \`ENV != 'development'\`, raise \`RuntimeError\` and refuse to start
- [ ] \`.env.example\` gains a prominent \`# DO NOT SET IN PRODUCTION\` comment on this var
- [ ] Unit test: assert the app refuses to start with \`NGW_DEV_MODE=1\` + \`ENV=production\`

## Fix
\`\`\`python
# main.py lifespan
if os.getenv('NGW_DEV_MODE') == '1' and os.getenv('ENV', 'development') != 'development':
    raise RuntimeError('NGW_DEV_MODE=1 must not be set in production. Refusing to start.')
\`\`\`"

gh issue create --repo "$REPO" \
  --title "Wire rate limiting to /register and /login endpoints" \
  --label "blocker,security,backend" \
  --milestone "v1.0.0-launch" \
  --body "## Problem
\`/register\` and \`/login\` have no rate limiting. Both are vulnerable to credential stuffing and brute force attacks. \`auth/rate_limit.py\` already exists but is not wired to any route.

## Location
- \`auth/rate_limit.py\` — rate limiter implementation (exists)
- \`api/routes/auth.py\` — routes to protect

## Acceptance Criteria
- [ ] \`/login\`: max 5 attempts per IP per minute, returns \`429 Too Many Requests\`
- [ ] \`/register\`: max 3 attempts per IP per minute
- [ ] Rate limit headers included in response (\`Retry-After\`, \`X-RateLimit-Remaining\`)
- [ ] Test: assert 429 is returned after limit exceeded

## Notes
Current implementation in \`auth/rate_limit.py\` uses in-process storage. Acceptable for MVP single-instance deploy. Add Redis-backed limiting when scaling to multiple workers."

gh issue create --repo "$REPO" \
  --title "Validate file upload: MIME type + size limit on /analyze and /recommend" \
  --label "blocker,security,backend" \
  --milestone "v1.0.0-launch" \
  --body "## Problem
File uploads in \`api/routes/lab.py\` and \`api/routes/recommend.py\` have minimal validation. A malformed, oversized, or non-image file can crash the OpenCV/MediaPipe pipeline or consume unbounded memory.

## Acceptance Criteria
- [ ] Reject files with MIME type outside \`image/jpeg\`, \`image/png\`, \`image/webp\`
- [ ] Reject files larger than 20MB — return \`413 Payload Too Large\`
- [ ] Validate magic bytes (not just Content-Type header, which can be spoofed)
- [ ] Return structured error JSON: \`{\"error\": \"invalid_file\", \"detail\": \"...\"}\`
- [ ] Tests for each rejection case

## Fix
\`\`\`python
import imghdr
ALLOWED_TYPES = {'jpeg', 'png', 'webp'}
MAX_SIZE_BYTES = 20 * 1024 * 1024

async def validate_upload(file: UploadFile):
    data = await file.read(MAX_SIZE_BYTES + 1)
    if len(data) > MAX_SIZE_BYTES:
        raise HTTPException(413, 'File too large. Max 20MB.')
    img_type = imghdr.what(None, h=data)
    if img_type not in ALLOWED_TYPES:
        raise HTTPException(415, f'Unsupported file type: {img_type}')
    return data
\`\`\`"

gh issue create --repo "$REPO" \
  --title "Pin all Python dependencies in requirements.txt" \
  --label "blocker,infra" \
  --milestone "v1.0.0-launch" \
  --body "## Problem
Several entries in \`requirements.txt\` use \`>=\` version constraints (e.g. \`openai>=1.30.0\`, \`stripe>=7.0.0\`). An upstream patch release can silently break the build or introduce a regression.

## Acceptance Criteria
- [ ] Run \`pip freeze\` in a clean venv to generate exact pinned versions for all packages
- [ ] Replace all \`>=\` constraints with exact \`==\` pins
- [ ] Add \`pip-audit\` as a dev dependency and document how to run it
- [ ] Verify \`docker build\` succeeds with pinned versions

## Command
\`\`\`bash
python -m venv .venv-pin && source .venv-pin/bin/activate
pip install -r requirements.txt
pip freeze > requirements.txt
\`\`\`"

gh issue create --repo "$REPO" \
  --title "First production deploy to Render" \
  --label "blocker,infra" \
  --milestone "v1.0.0-launch" \
  --body "## Deploy Checklist

### Pre-deploy
- [ ] All other \`v1.0.0-launch\` blockers resolved
- [ ] \`render.yaml\` health check path confirmed as \`/api/health\`
- [ ] All required env vars set in Render dashboard (see \`.env.example\`)
- [ ] Stripe webhook endpoint registered in Stripe dashboard pointing to \`https://<domain>/api/stripe/webhook\`
- [ ] \`STRIPE_WEBHOOK_SECRET\` set in Render env vars
- [ ] \`NGW_DEV_MODE\` NOT set in Render env vars
- [ ] \`ALLOWED_ORIGINS\` set to production domain only

### Deploy
- [ ] Push to \`main\` triggers Render auto-deploy
- [ ] Health check passes: \`GET /api/health\` returns 200
- [ ] API key probe passes: \`POST /api/health/api-keys/probe\`
- [ ] Test registration + login flow end-to-end
- [ ] Test Stripe checkout with test card \`4242 4242 4242 4242\`
- [ ] Test \`/recommend\` with a real image

### Post-deploy
- [ ] Verify Stripe webhook receives \`checkout.session.completed\` in Stripe dashboard
- [ ] Confirm SQLite disk is mounted at \`/app/data\` on Render (or Postgres connected)
- [ ] Tag release: \`git tag v1.0.0 && git push --tags\`"

echo ""
echo "============================================================"
echo "MILESTONE: v1.0.1-hardening (Week 1 post-deploy)"
echo "============================================================"

gh issue create --repo "$REPO" \
  --title "Add Sentry error monitoring to FastAPI backend" \
  --label "observability,backend" \
  --milestone "v1.0.1-hardening" \
  --body "## Problem
Uncaught exceptions in production are invisible. There is no alerting, no stack trace capture, and no way to discover errors except user reports.

## Acceptance Criteria
- [ ] \`sentry-sdk[fastapi]\` added to \`requirements.txt\`
- [ ] Sentry DSN added as \`SENTRY_DSN\` env var (set in Render, absent in dev by default)
- [ ] Sentry initialised in \`main.py\` before route registration
- [ ] \`environment\` tag set from \`ENV\` env var (\`production\` / \`development\`)
- [ ] VLM failures captured as Sentry breadcrumbs with image hash context
- [ ] Test: trigger a deliberate 500 and verify it appears in Sentry

## Implementation
\`\`\`python
# main.py (top, before routes)
import sentry_sdk
if dsn := os.getenv('SENTRY_DSN'):
    sentry_sdk.init(dsn=dsn, environment=os.getenv('ENV', 'development'), traces_sample_rate=0.2)
\`\`\`"

gh issue create --repo "$REPO" \
  --title "Add GitHub Actions CI: pytest + docker build on every push to main" \
  --label "infra" \
  --milestone "v1.0.1-hardening" \
  --body "## Problem
Tests exist (2,100+) but run manually. Regressions can ship undetected on any push.

## Acceptance Criteria
- [ ] \`.github/workflows/ci.yml\` created
- [ ] On push to \`main\` and all PRs: run \`pytest\` against the full test suite
- [ ] On push to \`main\`: run \`docker build\` to verify the image compiles
- [ ] CI fails the build if any test fails
- [ ] Badge added to README

## Workflow skeleton
\`\`\`yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.10' }
      - run: pip install -r requirements.txt
      - run: pytest --tb=short -q
  docker:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: docker build -t ngw-core:ci .
\`\`\`"

gh issue create --repo "$REPO" \
  --title "Add Alembic database migrations" \
  --label "backend,infra" \
  --milestone "v1.0.1-hardening" \
  --body "## Problem
Schema changes require manual \`ALTER TABLE\` or full DB recreation. There is no migration history, no rollback capability, and no way to apply schema changes safely in production.

## Acceptance Criteria
- [ ] \`alembic\` added to \`requirements.txt\`
- [ ] \`alembic init migrations\` run, \`alembic.ini\` configured
- [ ] Initial migration generated from current schema in \`db/database.py\`
- [ ] \`alembic upgrade head\` runs cleanly against Postgres
- [ ] Render pre-deploy command set to \`alembic upgrade head\`
- [ ] README updated with migration workflow

## Notes
Do this immediately after the Postgres migration. The initial migration should capture all tables defined in \`db/database.py\`: users, kits, setups, session_signals, feedback, subscriptions, experiments, failures, intelligence, paywall_analytics."

gh issue create --repo "$REPO" \
  --title "Enable Render disk snapshots and document backup restore process" \
  --label "infra" \
  --milestone "v1.0.1-hardening" \
  --body "## Problem
The SQLite database (or Postgres if migrated) has no automated backups. A corrupted file or accidental deletion means total data loss.

## Acceptance Criteria
- [ ] If using SQLite: Render disk snapshots enabled on the persistent disk (available on paid plans)
- [ ] If using Postgres/Neon: automated daily backups confirmed active in Neon dashboard
- [ ] Backup restore procedure documented in \`DEPLOY.md\`
- [ ] Test restore: confirm a backup can be restored to a clean instance

## Notes
Neon Postgres includes automated backups on all paid plans with point-in-time restore. This is another reason to complete the Postgres migration before launch."

gh issue create --repo "$REPO" \
  --title "Add structured JSON logging to FastAPI backend" \
  --label "observability,backend" \
  --milestone "v1.0.1-hardening" \
  --body "## Problem
Python logging currently emits plain text. In a cloud environment (Render), logs need to be parseable for filtering and alerting. VLM failures, auth events, and paywall triggers are not consistently logged.

## Acceptance Criteria
- [ ] Configure Python \`logging\` to emit JSON to stdout (Render captures stdout)
- [ ] All log records include: \`timestamp\`, \`level\`, \`module\`, \`message\`, \`request_id\` (where available)
- [ ] VLM failures logged at \`WARNING\` with \`image_hash\` and \`error\` fields
- [ ] Auth failures (login, expired token) logged at \`WARNING\` with \`ip\` field
- [ ] Paywall triggers logged at \`INFO\` with \`user_id\`, \`state\`, \`price\` fields

## Implementation options
- \`structlog\` (recommended, minimal setup)
- stdlib \`logging\` with a custom \`JSONFormatter\`"

echo ""
echo "============================================================"
echo "MILESTONE: v1.1.0-polish (First sprint post-launch)"
echo "============================================================"

gh issue create --repo "$REPO" \
  --title "Add NGW_ADMIN_SECRET header check to all /api/admin/* and /lab/* routes" \
  --label "security,backend" \
  --milestone "v1.1.0-polish" \
  --body "## Problem
Admin and lab routes are protected only by JWT + email allowlist (\`NGW_ADMIN_EMAILS\`). A valid JWT from a known admin email is sufficient. There is no second factor and no way to revoke admin access without rotating the JWT secret.

## Acceptance Criteria
- [ ] All routes under \`/api/admin/*\` and \`/lab/*\` require an \`X-Admin-Secret\` header matching \`NGW_ADMIN_SECRET\` env var
- [ ] Returns \`403 Forbidden\` if header is missing or incorrect
- [ ] \`NGW_ADMIN_SECRET\` documented in \`.env.example\` with generation instructions
- [ ] Automated test: assert 403 is returned without the header even with a valid admin JWT

## Notes
This is a FastAPI dependency — add it as \`Depends(require_admin_secret)\` alongside the existing \`Depends(require_admin_user)\`."

gh issue create --repo "$REPO" \
  --title "Frontend: VLM timeout UX — 90s timeout with retry button" \
  --label "frontend" \
  --milestone "v1.1.0-polish" \
  --body "## Problem
VLM analysis calls can take 15–60 seconds. If the call hangs or fails, the user sees an indefinite spinner with no feedback and no recovery path.

## Location
- \`ui/src/screens/LabScreen.jsx\` — analyze flow
- \`ui/src/screens/ResultsScreen.jsx\` / \`ResultsScreenV2.jsx\` — recommend flow

## Acceptance Criteria
- [ ] 90-second client-side timeout on all VLM-dependent API calls
- [ ] At 15s: show \`Taking longer than expected — still working…\` inline message
- [ ] At 90s: abort the request, show \`Analysis timed out. Try again.\` with a retry button
- [ ] Retry button re-submits the same request without requiring re-upload
- [ ] Timeout state is cleared on successful completion

## Notes
The amber error banner for VLM failures (added this session) handles the case where VLM fails — this issue handles the case where VLM is slow or hangs."

gh issue create --repo "$REPO" \
  --title "Add integration test for Stripe webhook handler" \
  --label "payments,backend" \
  --milestone "v1.1.0-polish" \
  --body "## Problem
The Stripe webhook at \`POST /api/stripe/webhook\` has no automated test. A broken webhook means subscriptions don't activate — paying users get blocked without any visibility.

## Acceptance Criteria
- [ ] Test: send a valid \`checkout.session.completed\` payload to \`/api/stripe/webhook\`
- [ ] Assert subscription is created in the database via \`db.database.create_subscription\`
- [ ] Test: send a \`customer.subscription.deleted\` payload
- [ ] Assert subscription is marked cancelled via \`cancel_subscription_by_stripe_id\`
- [ ] Test: send payload with invalid \`STRIPE_WEBHOOK_SECRET\` — assert 400 returned
- [ ] Use Stripe test fixture payloads (no live Stripe calls needed)

## Notes
Use \`httpx.TestClient\` with a mocked \`stripe.Webhook.construct_event\` to avoid live Stripe dependency."

gh issue create --repo "$REPO" \
  --title "Lock CORS to production domain — reject wildcard origins in production" \
  --label "security,backend" \
  --milestone "v1.1.0-polish" \
  --body "## Problem
\`ALLOWED_ORIGINS\` is read from env but not validated at startup. If unset or set to \`*\`, any origin can make credentialed requests to the API.

## Acceptance Criteria
- [ ] On startup, if \`ENV=production\` and \`ALLOWED_ORIGINS\` is empty or contains \`*\`, raise \`RuntimeError\` and refuse to start
- [ ] \`.env.example\` documents the expected format: \`ALLOWED_ORIGINS=https://yourdomain.com\`
- [ ] CORS middleware configured to disallow credentials with wildcard origin
- [ ] Test: assert startup fails with \`ALLOWED_ORIGINS=*\` in production mode"

gh issue create --repo "$REPO" \
  --title "Move session_max_price to server-side to prevent paywall price manipulation" \
  --label "security,payments,backend" \
  --milestone "v1.1.0-polish" \
  --body "## Problem
The anti-discount guardrail (\`session_max_price\`) is stored in \`sessionStorage\` on the client. A user can clear it to reset the session and get a lower adaptive price than they previously saw.

## Current behaviour
\`engine/paywall/adaptive_pricing.py\` receives \`session_max_price\` from the caller — currently the frontend sends this value from \`sessionStorage\`.

## Acceptance Criteria
- [ ] \`session_max_price\` stored server-side in the \`session_signals\` or a new \`paywall_sessions\` table, keyed by \`user_id\` + session window (e.g. 24h)
- [ ] \`POST /api/paywall/*\` endpoints read and update \`session_max_price\` from the database, not from the request body
- [ ] Frontend no longer sends \`session_max_price\` — it is ignored if received
- [ ] Test: assert price does not decrease within a session even if the client sends a lower value"

gh issue create --repo "$REPO" \
  --title "Document production rollback procedure in DEPLOY.md" \
  --label "infra" \
  --milestone "v1.1.0-polish" \
  --body "## Problem
There is no documented rollback procedure. A bad deploy currently has no defined recovery path.

## Acceptance Criteria
- [ ] \`DEPLOY.md\` updated with step-by-step rollback instructions for Render
- [ ] Documents: how to roll back via Render dashboard (instant, no CLI needed)
- [ ] Documents: how to identify the last known-good deploy hash
- [ ] Documents: database rollback procedure (Alembic downgrade command)
- [ ] Documents: how to verify the rollback was successful (health check + smoke test)

## Notes
Render supports instant rollback to any previous deploy from the dashboard — no CLI required. This is the primary rollback path for MVP."

echo ""
echo "============================================================"
echo "All issues created."
echo "View at: https://github.com/$REPO/issues"
echo "============================================================"
