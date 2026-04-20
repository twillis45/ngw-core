I now have enough grounding from the actual codebase. Let me generate the comprehensive QA matrix.

---

# NGW CORE — OPERATOR-GRADE QA TEST MATRIX

**Generated:** 2026-04-19
**Branch:** `chore/studio-matte-rollout-prod`
**Scope:** Full product release gate — all tiers, all surfaces, all auth flows

---

## 1. QA_STRATEGY_SUMMARY

### Testing Order

**Phase 1 — Security and Auth Integrity (blockers if broken)**
Auth flows, JWT revocation, plan_guard enforcement, Stripe webhook verification. Nothing else matters if auth is wrong.

**Phase 2 — Core Analysis Workflow**
The single most-used flow: upload image → analyze → result. Engine correctness, confidence display, pattern accuracy. This is the product's value proposition.

**Phase 3 — Pricing and Paywall Truth**
Free tier limits enforced correctly. Pro/Studio gates at exact feature boundaries. No free rides; no false denials. Test with expired subscriptions explicitly.

**Phase 4 — Payments Lifecycle**
Stripe checkout round-trip, webhook handling, subscription state propagation, cancellation flow. Real Stripe test keys required.

**Phase 5 — Studio-Tier Backend**
Batch, API keys, teams, reference library, shared setups — all Studio-gated. Test plan_guard boundary precisely.

**Phase 6 — Screen-by-Screen UI + Visual Regression**
Home → Processing → Result → Setup → Cockpit → Recipes → Saved → Wizard. Studio Matte design tokens, layout on iPhone SE through 4K desktop.

**Phase 7 — Export, Journal, Repeatability, Performance**
Secondary but must pass before lock.

### Highest-Risk Areas

1. **JWT revocation (in-memory)** — blocklist clears on server restart; tokens issued before restart remain valid. No Redis backing. Explicit risk.
2. **Stripe webhook plan resolution** — legacy sessions without `plan` metadata fall back to `pro`; Studio users who purchased before the metadata field was added could be misclassified.
3. **Free tier analysis counter** — `increment_analysis_count` uses session_id + optional user_id; unauthenticated users can bypass by clearing localStorage or using a new browser session.
4. **Rate limit bypass** — In-memory rate limiter clears on restart; no Redis. Also: X-Forwarded-For spoofing risk if `TRUST_PROXY_HEADERS=1` and `TRUSTED_PROXY_IPS` is unset.
5. **Batch job isolation** — GET /api/batch/{id} queries by user_email; must verify cross-user access is denied.
6. **Apple Sign-In** — button present on login/signup pages but explicitly non-functional; must display honest state (not silently fail or error).
7. **Studio Matte visual regression** — 6+ files modified on current branch; token drift risk on ResultScreen, SetupScreen, HomeScreen.
8. **Setup sharing token** — GET /api/shared/setup/{token} is unauthenticated; must not expose PII beyond what the owner intended.

### What Requires Human Judgment

- Pattern correctness on real photos (not automatable — needs expert eye)
- "Feels premium" design quality on physical device
- Recipe difficulty ratings accuracy
- Gear recommendation realism (e.g., does the suggested modifier make sense for the pattern?)
- Copy accuracy vs. paywall (do CTAs accurately represent what the tier gives you?)
- Export PDF/PNG visual quality at print resolution

### What Can Be Automated

- All API endpoint responses, status codes, plan_guard rejections
- Auth token validity, expiry, revocation
- Rate limit threshold enforcement
- Stripe webhook signature verification rejection
- Batch endpoint job isolation
- Analysis count increment and threshold
- All `require_plan` boundaries via test tokens per tier

---

## 2. TEST_CASE_TABLES_BY_SUITE

---

### Suite 1: Auth and Account Lifecycle

| Test ID | Scenario | User Tier | Device | Env | Priority | Steps | Expected Result | Severity | Notes |
|---------|----------|-----------|--------|-----|----------|-------|-----------------|----------|-------|
| AUTH-001 | Email/password register — new user | Anonymous | Desktop Chrome | Staging | P0 | POST /api/auth/register `{email: "qa+001@ngw.test", username: "qauser001", password: "Secure!99"}` | HTTP 201, JWT returned, `email_verified: false`, verification email sent | Critical | Verify JWT decodes to correct user_id |
| AUTH-002 | Register duplicate email | Anonymous | Desktop Chrome | Staging | P0 | POST /api/auth/register with already-registered email | HTTP 409, `"Email already registered"` | Critical | Must not return 500 |
| AUTH-003 | Login — valid credentials | Free | Desktop Chrome | Staging | P0 | POST /api/auth/login `{email, password}` | HTTP 200, JWT returned, `email_verified` reflects DB state | Critical | |
| AUTH-004 | Login — wrong password | Anonymous | Desktop Chrome | Staging | P0 | POST /api/auth/login with wrong password | HTTP 401, `"Invalid email or password"` | Critical | Must not reveal whether email exists |
| AUTH-005 | Login rate limit — brute force protection | Anonymous | Desktop Chrome | Staging | P0 | POST /api/auth/login 6 times in 60s from same IP | 6th attempt returns HTTP 429 with `Retry-After` header | Critical | Confirms `check_rate_limit("login_ip", limit=5, window=60)` |
| AUTH-006 | JWT logout — token revocation | Free | Desktop Chrome | Staging | P0 | (1) Login → get JWT. (2) POST /api/auth/logout with JWT. (3) GET /api/auth/me with same JWT. | Step 3 returns HTTP 401 (revoked). In-memory JTI blocklist works. | Critical | Known risk: clears on server restart |
| AUTH-007 | Magic link — request + consume | Anonymous | Mobile Safari iOS | Staging | P1 | (1) POST /api/auth/magic-link/request with valid email. (2) Check email for link. (3) GET link URL. | JWT returned, user logged in | High | |
| AUTH-008 | Password reset — full round trip | Anonymous | Desktop Firefox | Staging | P1 | (1) POST /api/auth/password-reset/request. (2) Check email for reset link. (3) POST /api/auth/password-reset/confirm with new password. (4) Login with new password. | Step 4 returns HTTP 200 with valid JWT | High | |
| AUTH-009 | Email verification — token consumption | Free (unverified) | Desktop Chrome | Staging | P1 | (1) Register new account. (2) Click verification link from email. (3) GET /api/auth/me. | `email_verified: true` | High | |
| AUTH-010 | Account deletion | Free | Desktop Chrome | Staging | P1 | (1) Login. (2) DELETE /api/auth/me. (3) Attempt login with same credentials. | Step 2 returns HTTP 200. Step 3 returns HTTP 401. | High | Verify DB row removed |
| AUTH-011 | Google OAuth — button renders and redirects | Anonymous | Desktop Chrome | Staging | P1 | Navigate to `/login.html`. Click "Continue with Google". | Redirects to Google OAuth flow | High | |
| AUTH-012 | Apple Sign-In — button present, honest state | Anonymous | Mobile Safari iOS | Staging | P1 | Navigate to `/login.html` or `/signup.html`. Observe Apple Sign-In button. Tap it. | Button is visible. Tapping it either redirects to Apple flow OR shows an explicit "coming soon" message. Must NOT silently fail or produce an unhandled error. | Critical | Placeholder per product state — must not mislead |
| AUTH-013 | JWT used after 7-day expiry | Free | Desktop Chrome | Staging | P2 | Craft a JWT with `exp` set to `now - 1`. Send to GET /api/auth/me. | HTTP 401 | High | |
| AUTH-014 | GET /api/auth/me — admin flag | Admin | Desktop Chrome | Staging | P1 | Login as admin email. GET /api/auth/me. | `is_admin: true` in response | High | Verify `get_internal_emails()` check |
| AUTH-015 | Register rate limit — mass account creation | Anonymous | Desktop Chrome | Staging | P1 | POST /api/auth/register 11 times in 1 hour from same IP | 11th attempt returns HTTP 429 | High | Confirms `limit=10, window=3600` |

---

### Suite 2: Core Analysis Workflow

| Test ID | Scenario | User Tier | Device | Env | Priority | Steps | Expected Result | Severity | Notes |
|---------|----------|-----------|--------|-----|----------|-------|-----------------|----------|-------|
| ANAL-001 | Successful analysis — known Rembrandt reference | Free | Desktop Chrome | Staging | P0 | POST /api/analyze with `/static/ui/test_portrait.jpg` (valid JWT) | HTTP 200, `pattern` = `rembrandt` (or near), `confidence` ≥ 0.5, `ok: true` | Critical | Anchored against known benchmark image |
| ANAL-002 | Successful analysis — Loop reference | Pro | Desktop Chrome | Staging | P0 | POST /api/analyze with `/static/ui/loop_standard.jpg` | `pattern` = `loop`, `confidence` ≥ 0.6 | Critical | |
| ANAL-003 | Analysis — no face in image | Free | Desktop Chrome | Staging | P0 | POST /api/analyze with image containing no face | HTTP 200 with `ok: false` OR meaningful error state (not 500) | Critical | Engine must degrade gracefully |
| ANAL-004 | Analysis — JPEG over 10 MB | Free | Desktop Chrome | Staging | P0 | POST /api/analyze with 11 MB JPEG | Client-side downsampling kicks in (`downsampleImage`), upload proceeds ≤ 10 MB | High | `MAX_UPLOAD_BYTES = 10 * 1024 * 1024` in Day1DemoApp.jsx |
| ANAL-005 | Analysis — non-image file | Free | Desktop Chrome | Staging | P1 | POST /api/analyze with a `.pdf` file | Rejected gracefully — error message, not 500 | High | |
| ANAL-006 | Analysis count increments after success | Free | Desktop Chrome | Staging | P0 | (1) POST /api/usage/increment after analysis. (2) Check response. | `count` increments correctly; `is_at_limit: true` when count = 3 | Critical | Free tier gate depends on this |
| ANAL-007 | Free tier limit enforcement — 4th analysis blocked | Free (3 used) | Mobile Safari | Staging | P0 | Attempt 4th analysis on a Free account that has used all 3 | Paywall displayed; analysis does not proceed | Critical | |
| ANAL-008 | Pro tier — unlimited analyses | Pro | Desktop Chrome | Staging | P0 | Submit 5 analyses in sequence with Pro JWT | All 5 complete; no paywall triggered | Critical | |
| ANAL-009 | Analysis result stored in session log | Pro | Desktop Chrome | Staging | P1 | Analyze image. GET /api/user/analyses. | Result appears in list with `pattern`, `confidence`, timestamp | High | Requires `user_email` stored with result |
| ANAL-010 | VLM disabled in batch — no GPT-4o calls | Studio | Desktop Chrome | Staging | P1 | POST /api/batch/analyze with 2 images. Monitor server logs. | `run_vlm=False` confirmed in logs; no OpenAI API calls | High | See `_analyze_single`: `run_vlm=False` hardcoded |
| ANAL-011 | Confidence display — high vs low threshold | Pro | Desktop Chrome | Staging | P1 | Run analyses that produce high (≥0.75) and low (<0.4) confidence scores. | UI shows different visual states (high vs. low confidence screens — Figma nodes 1493:2 vs 1498:2) | High | |
| ANAL-012 | Analysis result — `authoritative_pattern` not `unknown` | Free | Desktop Chrome | Staging | P0 | Analyze 3 distinct portrait images with clear lighting. | None of the 3 return `pattern: "unknown"` | High | Unknown pattern degrades UX critically |

---

### Suite 3: Home → Processing → Result Flow

| Test ID | Scenario | User Tier | Device | Env | Priority | Steps | Expected Result | Severity | Notes |
|---------|----------|-----------|--------|-----|----------|-------|-----------------|----------|-------|
| FLOW-001 | Full flow — file drop on Home → Result | Free | Desktop Chrome | Staging | P0 | (1) Drop JPEG onto Home viewfinder. (2) Click Analyze button. (3) Wait for result. | Processing screen with stage messages appears. Result screen renders with pattern, confidence, diagram. | Critical | End-to-end happy path |
| FLOW-002 | Full flow — file picker on Home | Free | Mobile Chrome Android | Staging | P0 | (1) Tap viewfinder. (2) Choose image from gallery. (3) Tap Analyze. | Same as FLOW-001 | Critical | |
| FLOW-003 | Full flow — camera capture on mobile | Free | Mobile Safari iOS | Staging | P0 | (1) Tap camera icon. (2) Capture photo. (3) Tap Analyze. | Same as FLOW-001 | Critical | |
| FLOW-004 | "Try a sample" CTA on Home | Anonymous | Desktop Chrome | Staging | P0 | (1) Load Home screen with no image loaded. (2) Click "Try a sample" (sample Rembrandt prefetch CTA). | Sample image loads into viewfinder without network delay (pre-warmed) | High | HomeScreen `useEffect` prefetches sample on mount |
| FLOW-005 | Processing screen — stage messages display | Free | Desktop Chrome | Staging | P1 | Submit analysis, observe Processing screen. | Frosted glass readout visible; at least 2-3 stage messages cycle; pattern tease appears before result | High | |
| FLOW-006 | Result screen — all sections render | Free | Desktop Chrome | Staging | P0 | Complete analysis → reach Result screen. | Pattern name, confidence pill, lighting diagram, gear recommendations, and social export button all visible without scrolling on 375px viewport | High | |
| FLOW-007 | Result → Setup CTA — Pro paywall for Free user | Free | Desktop Chrome | Staging | P0 | On Result screen, tap "Build This Light" or "Save Setup" CTA. | Paywall modal or upgrade screen appears; action is blocked | Critical | |
| FLOW-008 | Result → Setup — Pro user flows through | Pro | Desktop Chrome | Staging | P0 | On Result screen, tap "Build This Light". | Setup screen loads with light cards and modifier details | Critical | |
| FLOW-009 | Back navigation — Result → Home | Free | Mobile Safari iOS | Staging | P1 | Complete analysis → reach Result screen. Tap back. | Returns to Home with `hasLastResult: true` state preserved; "View Last Result" option available | High | |
| FLOW-010 | Drag-and-drop — image drop on Home (desktop) | Free | Desktop Chrome | Staging | P1 | Drag a JPEG file over the Home viewfinder and drop it. | `isDragOver` state activates visual feedback; image loads into viewfinder | High | |
| FLOW-011 | URL-based image fetch on Home | Free | Desktop Chrome | Staging | P2 | Enter a valid direct-image URL into the Home screen URL input. | Image fetches and loads into viewfinder; EXIF strip populates if available | Medium | Uses `fetchImageFromUrl` |
| FLOW-012 | Daylight mode — visibility on bright screen | Any | Desktop Chrome | Staging | P2 | Enable "Daylight mode" in Settings. Return to Home. | Home screen steel opacities visibly brighter (~15% lift per code comment); UI readable | Medium | |

---

### Suite 4: Pricing and Paywall Truth

| Test ID | Scenario | User Tier | Device | Env | Priority | Steps | Expected Result | Severity | Notes |
|---------|----------|-----------|--------|-----|----------|-------|-----------------|----------|-------|
| PAY-001 | Free tier — exactly 3 analyses allowed | Free | Desktop Chrome | Staging | P0 | Create new account; complete 3 analyses; attempt 4th | 1-3 succeed. 4th triggers paywall. | Critical | |
| PAY-002 | Free tier counter — cross-session persistence | Free (2 used) | Desktop Chrome, then new tab | Staging | P0 | (1) Use 2 analyses in session A. (2) Clear localStorage. (3) Open new tab, login with same account. (4) Attempt analysis. | Counter reads 2 (server-side `user_id` scoping). Paywall triggers at 3rd total. | Critical | Authenticated users use user_id scoping via `/api/usage/increment` |
| PAY-003 | Free tier paywall — correct upgrade CTAs shown | Free (limit hit) | Desktop Chrome | Staging | P0 | Trigger paywall after 3rd analysis | Paywall shows Pro ($39/mo) and Studio ($59/mo) options with correct pricing. No incorrect prices. | Critical | |
| PAY-004 | Shoot Mode — blocked for Free tier | Free | Desktop Chrome | Staging | P0 | From Setup screen, tap "Shoot Mode" / cockpit entry | Paywall or upgrade screen; does not enter Day1ShootScreen | Critical | Shoot Mode is Pro+ |
| PAY-005 | Shot Match — blocked for Free tier | Free | Desktop Chrome | Staging | P0 | Attempt to access Shot Match feature | Blocked with upgrade prompt | Critical | |
| PAY-006 | Build Wizard — blocked for Free tier | Free | Desktop Chrome | Staging | P0 | Navigate to BuildWizardScreen | Blocked; upgrade prompt shown | Critical | |
| PAY-007 | Save Setup — blocked for Free tier | Free | Desktop Chrome | Staging | P0 | Analyze image. On Result or Setup screen, tap "Save Setup" | Paywall; action does not persist to localStorage or server | Critical | |
| PAY-008 | Diagram export — branded PNG — Pro tier | Pro | Desktop Chrome | Staging | P0 | On Result screen, tap export. Choose PNG. | PNG downloads with NGW branding watermark. Export succeeds. | Critical | |
| PAY-009 | White-label export — Studio only | Pro (not Studio) | Desktop Chrome | Staging | P0 | On export screen, look for white-label / remove-branding option | Option either absent or shows "Studio required" gate | Critical | |
| PAY-010 | Batch processing — blocked for Pro tier | Pro | Desktop Chrome | Staging | P0 | POST /api/batch/analyze with valid Pro JWT | HTTP 403, `"This feature requires a Studio subscription."` | Critical | Confirms `require_plan("studio")` |
| PAY-011 | REST API access — blocked for Pro tier | Pro | Desktop Chrome | Staging | P0 | POST /api/v1/analyze with Pro user's API key (if key generation is even allowed) | POST /api/api-keys returns HTTP 403 for Pro user | Critical | |
| PAY-012 | Expired Pro — access revoked correctly | Expired Pro | Desktop Chrome | Staging | P0 | Use JWT from previously active Pro account whose Stripe sub is now cancelled | Shoot Mode, Save Setup, Build Wizard blocked. Falls back to Free limits. | Critical | `customer.subscription.deleted` webhook must have fired |
| PAY-013 | Adaptive pricing — value state `high_value` shows correct price | Free (high-value signals) | Desktop Chrome | Staging | P1 | POST /api/paywall/adaptive-pricing with `usage_count: 10, shoot_mode_used: true, blueprint_views: 5` | Returns `price_monthly` ≤ 39 (no discount below guardrail), `state: "high_value"` or similar | High | |
| PAY-014 | Pricing page — correct prices displayed | Anonymous | Desktop Chrome | Staging | P0 | Navigate to `/pricing.html` | Pro = $39/mo, Studio = $59/mo shown. Annual options present. No stale prices. | Critical | |

---

### Suite 5: Payments and Subscription Lifecycle

| Test ID | Scenario | User Tier | Device | Env | Priority | Steps | Expected Result | Severity | Notes |
|---------|----------|-----------|--------|-----|----------|-------|-----------------|----------|-------|
| STRIPE-001 | Checkout session creation — Pro monthly | Free | Desktop Chrome | Stripe Test | P0 | POST /api/stripe/create-checkout-session `{plan: "pro", billing_period: "monthly", success_url: "...", cancel_url: "..."}` with valid JWT | HTTP 200, `url` is a valid `https://checkout.stripe.com/...` URL, `session_id` non-empty | Critical | Requires `STRIPE_PRICE_ID_MONTHLY` set |
| STRIPE-002 | Checkout session — Studio monthly | Free | Desktop Chrome | Stripe Test | P0 | Same as above with `plan: "studio"` | Valid Stripe checkout URL for Studio price | Critical | |
| STRIPE-003 | Checkout session — unauthenticated rejected | Anonymous | Desktop Chrome | Stripe Test | P0 | POST /api/stripe/create-checkout-session without JWT | HTTP 401, `"Authentication required to start checkout"` | Critical | |
| STRIPE-004 | Checkout session — invalid plan rejected | Free | Desktop Chrome | Stripe Test | P0 | POST with `plan: "enterprise"` | HTTP 400, `"Unsupported plan"` | High | |
| STRIPE-005 | Webhook — `checkout.session.completed` Pro | — | Backend | Stripe Test | P0 | Simulate Stripe webhook event `checkout.session.completed` with `plan: "pro"` in metadata, valid signature | Subscription created in DB with `plan: "pro"`, `status: "active"` | Critical | Must present `STRIPE_WEBHOOK_SECRET` header |
| STRIPE-006 | Webhook — `checkout.session.completed` Studio | — | Backend | Stripe Test | P0 | Same with `plan: "studio"` | Subscription `plan: "studio"`, `status: "active"` | Critical | |
| STRIPE-007 | Webhook — missing/invalid signature rejected | — | Backend | Stripe Test | P0 | POST /api/stripe/webhook without valid `Stripe-Signature` header | HTTP 400, `"Invalid signature"` or `"Webhook secret not configured"` | Critical | |
| STRIPE-008 | Webhook — duplicate event idempotency | — | Backend | Stripe Test | P0 | Send same `checkout.session.completed` webhook twice with identical session_id | Second webhook returns `{received: true, status: "already_processed"}`, no duplicate subscription created | Critical | |
| STRIPE-009 | Webhook — `customer.subscription.deleted` | Active Pro | Backend | Stripe Test | P0 | Simulate `customer.subscription.deleted` event for an active Pro subscription | Subscription marked cancelled in DB; user loses Pro access on next plan check | Critical | |
| STRIPE-010 | Post-checkout success — plan activates | Free→Pro | Desktop Chrome | Stripe Test | P0 | Complete full Stripe checkout flow using test card `4242 4242 4242 4242`. Return to `success_url`. | User's effective_plan = `pro`. Shoot Mode, Save Setup, Build Wizard unlocked. | Critical | End-to-end requires real Stripe test key |
| STRIPE-011 | Checkout session — success_url origin validation | Free | Desktop Chrome | Stripe Test | P1 | POST with `success_url: "https://evil.com/callback"` when `ALLOWED_ORIGINS` is set | HTTP 400, `"Invalid redirect URL origin."` | High | Open-redirect protection |
| STRIPE-012 | Legacy session — no `plan` metadata defaults to `pro` | — | Backend | Stripe Test | P1 | Simulate `checkout.session.completed` without `plan` key in metadata | `plan` defaults to `"pro"` per code fallback | Medium | |

---

### Suite 6: Studio-Tier Backend Features

| Test ID | Scenario | User Tier | Device | Env | Priority | Steps | Expected Result | Severity | Notes |
|---------|----------|-----------|--------|-----|----------|-------|-----------------|----------|-------|
| STUDIO-001 | Batch analyze — 1 image success | Studio | Desktop Chrome | Staging | P0 | POST /api/batch/analyze with 1 JPEG, Studio JWT | HTTP 200, `batch_id` returned, `status: "pending"` | Critical | |
| STUDIO-002 | Batch analyze — 10 images | Studio | Desktop Chrome | Staging | P0 | POST /api/batch/analyze with exactly 10 JPEGs | Accepted; `total_images: 10` | Critical | Max batch size |
| STUDIO-003 | Batch analyze — 11 images rejected | Studio | Desktop Chrome | Staging | P0 | POST /api/batch/analyze with 11 images | HTTP 400, `"Maximum 10 images per batch."` | Critical | |
| STUDIO-004 | Batch status polling — job completes | Studio | Desktop Chrome | Staging | P0 | (1) Submit batch of 2. (2) Poll GET /api/batch/{id} until `status: "complete"`. | Final response has `completed: 2`, `results` array with 2 entries, each having `pattern` and `confidence` | Critical | |
| STUDIO-005 | Batch isolation — user cannot access another user's job | Studio User A vs B | Desktop Chrome | Staging | P0 | User A submits batch; User B tries GET /api/batch/{job_id} | HTTP 404, `"Batch job not found."` | Critical | Cross-user data leak protection |
| STUDIO-006 | Batch — single image > 20 MB rejected | Studio | Desktop Chrome | Staging | P1 | POST /api/batch/analyze with one 21 MB JPEG | HTTP 400, `"Image ... exceeds 20 MB limit."` | High | |
| STUDIO-007 | API key generation — Studio user | Studio | Desktop Chrome | Staging | P0 | POST /api/api-keys `{name: "Test Key"}` | HTTP 201, full `key` (starting with `ngw_studio_`) returned once | Critical | Full key only shown on creation |
| STUDIO-008 | API key — Pro user blocked | Pro | Desktop Chrome | Staging | P0 | POST /api/api-keys with Pro JWT | HTTP 403, `"This feature requires a Studio subscription."` | Critical | |
| STUDIO-009 | API key limit — max 5 keys per account | Studio | Desktop Chrome | Staging | P1 | Generate 5 API keys; attempt 6th POST | HTTP 400, `"Maximum 5 active API keys per account."` | High | |
| STUDIO-010 | API key revocation | Studio | Desktop Chrome | Staging | P0 | (1) Generate key. (2) DELETE /api/api-keys/{id}. (3) POST /api/v1/analyze with revoked key. | Step 3 returns HTTP 401, `"Invalid or revoked API key."` | Critical | |
| STUDIO-011 | REST API — analyze with valid API key | Studio | Desktop Chrome | Staging | P0 | POST /api/v1/analyze with `X-API-Key: ngw_studio_...` header and valid JPEG | HTTP 200, `{status: "ok", pattern: "...", confidence: ..., result: {...}}` | Critical | |
| STUDIO-012 | REST API — rate limit 100/hr | Studio | Desktop Chrome | Staging | P1 | Generate 101 POST /api/v1/analyze requests in < 1 hour (use small/fast images or mock) | 101st request returns HTTP 429, `"Rate limit exceeded (100/hour)."` | High | In-memory; resets on restart |
| STUDIO-013 | Team creation | Studio | Desktop Chrome | Staging | P0 | POST /api/teams `{name: "QA Team Alpha"}` | HTTP 201, team object with `id`, `name`, user as owner | High | |
| STUDIO-014 | Team invite — valid email | Studio (owner) | Desktop Chrome | Staging | P0 | (1) Create team. (2) POST /api/teams/{id}/invite `{email: "member@ngw.test"}` | HTTP 200, `{status: "ok", invited: "member@ngw.test"}` (invitee must already have account) | High | |
| STUDIO-015 | Team invite — non-member owner role check | Studio (member, not owner) | Desktop Chrome | Staging | P1 | Team member (not owner) attempts POST /api/teams/{id}/invite | HTTP 403, `"Only team owners and admins can invite members."` | High | |
| STUDIO-016 | Team max 3 per account | Studio | Desktop Chrome | Staging | P1 | Create 3 teams; attempt 4th | HTTP 400, `"Maximum 3 teams per account."` | Medium | |
| STUDIO-017 | Reference library — upload | Studio | Desktop Chrome | Staging | P0 | POST /api/studio/references with image + `name` form field | HTTP 201; reference stored | High | |
| STUDIO-018 | Reference library — Pro blocked | Pro | Desktop Chrome | Staging | P0 | POST /api/studio/references with Pro JWT | HTTP 403 | High | |
| STUDIO-019 | Shared setup — create and access public link | Studio | Desktop Chrome | Staging | P0 | (1) Save a setup. (2) POST /api/user/setups/{id}/share. (3) GET /api/shared/setup/{token} without auth. | Step 3 returns setup data without requiring auth | High | Public endpoint |
| STUDIO-020 | Shared setup — token access does not expose PII | Studio | Desktop Chrome | Staging | P0 | GET /api/shared/setup/{token} from unauthenticated client | Response contains setup data but NOT owner email, user_id, or auth tokens | Critical | PII leak risk |

---

### Suite 7: Export Tests

| Test ID | Scenario | User Tier | Device | Env | Priority | Steps | Expected Result | Severity | Notes |
|---------|----------|-----------|--------|-----|----------|-------|-----------------|----------|-------|
| EXPORT-001 | Lighting diagram — visible on Result screen | Free | Desktop Chrome | Staging | P0 | Complete analysis. View Result screen. | Lighting diagram SVG/canvas renders with correct light positions and modifier shapes | Critical | |
| EXPORT-002 | Lighting diagram — side view renders | Pro | Desktop Chrome | Staging | P0 | On Setup screen, switch to side view diagram | `SideViewDiagram` renders; key light, subject, camera positions visible | High | |
| EXPORT-003 | Export PNG — Pro user | Pro | Desktop Chrome | Staging | P0 | On Result/Setup screen, tap Export → PNG | PNG file downloads; contains lighting diagram, NGW branding, pattern name, gear list | Critical | |
| EXPORT-004 | Export PDF — Pro user | Pro | Desktop Chrome | Staging | P0 | Tap Export → PDF | PDF downloads; all diagram content present | Critical | |
| EXPORT-005 | White-label export — Studio user | Studio | Desktop Chrome | Staging | P0 | On export screen, select "Remove NGW branding" or equivalent | Export generates without NGW watermark/logo | Critical | Studio differentiator |
| EXPORT-006 | Export — Free user blocked | Free | Desktop Chrome | Staging | P0 | On Result screen, tap Export (if visible) | Paywall or upgrade prompt. No file downloads. | Critical | |
| EXPORT-007 | Social export — share to clipboard/native share | Any | Mobile Safari iOS | Staging | P1 | Tap social share icon on Result screen | Native iOS share sheet opens with diagram image | High | |
| EXPORT-008 | Pull sheet — gear list completeness | Pro | Desktop Chrome | Staging | P1 | On Setup screen, open pull sheet / gear list | All gear items (light, modifier, power) rendered with correct values for the analyzed pattern | High | |
| EXPORT-009 | Export PNG — filename format | Pro | Desktop Chrome | Staging | P2 | Export PNG for a Rembrandt analysis | Filename includes pattern name (e.g., `ngw-rembrandt-setup.png`) not a random UUID | Medium | |
| EXPORT-010 | Export branding setting — disable NGW branding for Studio | Studio | Desktop Chrome | Staging | P1 | In Settings, toggle "Export branding" off. Export PNG. | PNG lacks NGW logo/wordmark | High | Requires Settings toggle working |

---

### Suite 8: Saved Data / Journal / Repeatability

| Test ID | Scenario | User Tier | Device | Env | Priority | Steps | Expected Result | Severity | Notes |
|---------|----------|-----------|--------|-----|----------|-------|-----------------|----------|-------|
| DATA-001 | Save setup — Pro user | Pro | Desktop Chrome | Staging | P0 | Analyze image → reach Setup screen → tap "Save Setup" → assign name | Setup persists; visible in Saved Setups screen on next visit | Critical | |
| DATA-002 | Save setup — survives page reload | Pro | Desktop Chrome | Staging | P0 | Save a setup. Reload page. Navigate to Saved Setups. | Setup still present (server-side persistence via `/api/user/setups`, not only localStorage) | Critical | |
| DATA-003 | Delete setup | Pro | Desktop Chrome | Staging | P1 | In Saved Setups, long-press or tap overflow on a setup → delete. | Setup removed from list; does not reappear on reload | High | |
| DATA-004 | Last-used pin in Saved Setups | Pro | Desktop Chrome | Staging | P2 | Open a saved setup. Return to Saved Setups list. | That setup is pinned as "Last Used" (`LAST_USED_KEY` in localStorage) | Medium | |
| DATA-005 | Session log — analyses appear | Pro | Desktop Chrome | Staging | P0 | Analyze 3 images. Navigate to Session Log / Lighting Journal (GET /api/user/analyses). | All 3 analyses listed with pattern, confidence, thumbnail | High | |
| DATA-006 | Session log — detail view | Pro | Desktop Chrome | Staging | P1 | From session log, tap an entry. | GET /api/user/analyses/{id} returns full result; detail screen renders | High | |
| DATA-007 | Cross-tab sync — saved setups | Pro | Desktop Chrome (2 tabs) | Staging | P1 | (1) Save setup in Tab A. (2) Switch to Tab B showing Saved Setups. | Tab B refreshes to show new setup (onSetupsChanged listener) | Medium | |
| DATA-008 | Kit save and retrieve | Pro | Desktop Chrome | Staging | P1 | (1) PUT /api/user/kit with lights/modifiers/support. (2) GET /api/user/kit. | Exact kit data returned | High | |
| DATA-009 | Preferences persist across sessions | Any | Desktop Chrome | Staging | P1 | Change font size, units, haptic feedback in Settings. Logout. Login again. | Settings restored (server-persisted via `/api/user/preferences`) | High | |
| DATA-010 | Free user — Save Setup blocked at API level | Free | Desktop Chrome | Staging | P0 | POST /api/user/setups with Free user JWT | HTTP 403 | Critical | Must not rely on UI gate alone |
| DATA-011 | Analysis history — Free user has no session log | Free | Desktop Chrome | Staging | P1 | GET /api/user/analyses with Free JWT | HTTP 403 (Pro+ feature) | High | |

---

### Suite 9: Recipes / Setup Content

| Test ID | Scenario | User Tier | Device | Env | Priority | Steps | Expected Result | Severity | Notes |
|---------|----------|-----------|--------|-----|----------|-------|-----------------|----------|-------|
| REC-001 | Recipe screen — all 31 recipes present | Any | Desktop Chrome | Staging | P0 | Navigate to Recipe screen. Count recipe cards rendered. | Exactly 31 recipes visible (across all categories) | Critical | `RECIPES` array in `recipes.js` |
| REC-002 | Recipe categories — all categories render | Any | Desktop Chrome | Staging | P0 | On Recipe screen, scroll or cycle through category tabs | All `RECIPE_CATEGORIES` have at least 1 recipe; no empty categories | High | |
| REC-003 | Recipe card — data completeness | Any | Desktop Chrome | Staging | P0 | Inspect any recipe card | name, description, setupTime, difficulty, modifier, pattern preview icon all present; no "undefined" strings | Critical | |
| REC-004 | Recipe difficulty labels | Any | Desktop Chrome | Staging | P1 | Check cards across difficulty 1, 2, 3 | Labels show "Easy", "Moderate", "Advanced" respectively with correct colors | High | `DIFFICULTY_LABEL` mapping |
| REC-005 | Recipes with `continuousPower` flag — 11 video recipes | Any | Desktop Chrome | Staging | P1 | Identify the 11 video-use recipes. Verify their card UI. | Video-context modifier/power metadata renders correctly | High | |
| REC-006 | Recipe pattern diagram — renders for all recipes | Any | Desktop Chrome | Staging | P1 | Scroll through all recipes; inspect `PatternDiagram` SVGs | All pattern types (rembrandt, loop, butterfly, split, clamshell, broad, short, ring) render their SVG shape; no blank/empty diagrams | High | |
| REC-007 | Recipe modifier label — no raw snake_case | Any | Desktop Chrome | Staging | P0 | Inspect recipe cards with `modifierFamily` values like `beauty_dish`, `softbox_rect` | Labels show "Beauty Dish", "Softbox" — not raw enum keys | High | `humanModifier()` function in RecipeScreen |
| REC-008 | Recipe detail / setup load | Pro | Desktop Chrome | Staging | P0 | Tap a recipe → "Load Setup" or equivalent CTA | Navigates to SetupScreen or BuildWizard pre-populated with recipe's setup | Critical | |
| REC-009 | Recipe detail — "Warning" field displayed | Any | Desktop Chrome | Staging | P1 | On a recipe card or detail that has a `warning` field (e.g. beauty-clamshell: "Key too high…") | Warning text visible in UI | Medium | Content completeness |
| REC-010 | Recipe "Why it works" line | Any | Desktop Chrome | Staging | P1 | On recipe detail | `whyItWorks` copy visible | Medium | |
| REC-011 | Recipes — content accuracy for working photographer | — | Human review | Staging | P1 | Professional photographer reviews all 31 recipes for: pattern accuracy, modifier realism, difficulty rating, use-case accuracy | Zero recipes that would embarrass a working pro | High | Human judgment required |

---

### Suite 10: Taxonomy / Benchmark Truth

| Test ID | Scenario | User Tier | Device | Env | Priority | Steps | Expected Result | Severity | Notes |
|---------|----------|-----------|--------|-----|----------|-------|-----------------|----------|-------|
| TAX-001 | Pattern enum — no unknown/null in benchmark set | — | Backend | Staging | P0 | Run `pytest tests/test_benchmarks.py` | All benchmark images produce a non-null, non-"unknown" `authoritative_pattern` | Critical | |
| TAX-002 | Pattern names — no raw snake_case in UI | — | Desktop Chrome | Staging | P0 | Run 5 analyses. Inspect Result screen for pattern display name. | Pattern displays as human-readable (e.g., "Rembrandt", "Loop", "Butterfly") not raw enum strings like `REMBRANDT` or `split_lighting` | Critical | `prettify()` util must be called |
| TAX-003 | Confidence score display — respects `Show confidence score` setting | Admin | Desktop Chrome | Staging | P1 | In Settings, toggle `Show confidence score` on. Run analysis. | Numeric confidence percentage visible on Result screen | High | Admin-only setting |
| TAX-004 | Catchlight-before-pattern rule — Rembrandt sample | — | Backend | Staging | P0 | Analyze `test_portrait.jpg` with `run_extended=True`. Inspect result `pattern_stages` / diagnostics. | Catchlight position resolved before pattern; no pattern resolution where catchlight check was skipped | Critical | Engine TRUTH.md rule violation risk |
| TAX-005 | VLM authority bounded — does not override physical evidence | — | Backend | Staging | P0 | Analyze image with clear contradicting VLM hint vs. physical catchlight. Inspect reasoning trace. | Physical catchlight evidence wins; VLM is labeled as "hint" not "confirmed" | Critical | VL guardrail — CLAUDE.md §III.VL |
| TAX-006 | Benchmark regression — no regressions vs. baseline | — | Backend | Staging | P0 | Run `pytest tests/test_benchmark_regression.py` | All patterns at or above baseline accuracy scores | Critical | |
| TAX-007 | `setup_family` not mixed with `pattern` | — | Backend | Staging | P1 | Run 3 analyses. Inspect JSON result structure. | `pattern` and `setup_family` are distinct fields; no `setup_family` value appears as a `pattern` output | High | TX guardrail — CLAUDE.md §III.TX |
| TAX-008 | `source_context` separation | — | Backend | Staging | P1 | Inspect analysis JSON for any result. | `source_context` field is separate from `pattern`; not mixed or compared as peer enum | High | TX guardrail |
| TAX-009 | Unknown direction is not on-axis | — | Backend | Staging | P1 | Analyze ambiguous image where direction cannot be determined. | `key_direction` set to `"unknown"` not `"on_axis"` | Medium | CLAUDE.md §IV.A rule |
| TAX-010 | Broad/Short requires pose confidence | — | Backend | Staging | P1 | Analyze image with ambiguous pose and plausible broad/short pattern. | `broad` or `short` pattern not resolved without `pose_confidence` signal above threshold | Medium | CLAUDE.md §IV.A |
| TAX-011 | Display thresholds do not imply behavioral truth | — | Desktop Chrome | Staging | P1 | Find confidence badge/pill UI. Inspect what values trigger "high" vs "low" visual states. | Thresholds match documented classification gates; not arbitrary visual tiers | Medium | DT guardrail — CLAUDE.md §III.DT |

---

### Suite 11: Performance / Responsiveness

| Test ID | Scenario | User Tier | Device | Env | Priority | Steps | Expected Result | Severity | Notes |
|---------|----------|-----------|--------|-----|----------|-------|-----------------|----------|-------|
| PERF-001 | Single analysis — wall clock time | Pro | Desktop Chrome | Staging | P0 | Submit standard JPEG (loop_standard.jpg). Measure time from submit to Result screen. | Analysis completes in ≤ 15 seconds (Render single instance) | High | |
| PERF-002 | Home screen load time — cold | Anonymous | Mobile Safari iOS | Staging | P1 | Navigate to app URL with empty cache. Measure time to interactive. | First meaningful paint ≤ 3 seconds on 4G | High | |
| PERF-003 | Batch 10 images — total runtime | Studio | Desktop Chrome | Staging | P1 | POST /api/batch/analyze with 10 standard JPEGs. Poll until complete. | Completes in ≤ 120 seconds (2 min per image max) | High | ThreadPoolExecutor max_workers=2 |
| PERF-004 | Processing screen — does not hang | Free | Mobile Safari iOS | Staging | P0 | Submit large JPEG (8 MB). Monitor Processing screen for stuck state. | Processing screen advances through stages; does not hang indefinitely | Critical | |
| PERF-005 | Home screen — desktop layout ≥ 1024px | Pro | Desktop Chrome 1440px | Staging | P0 | View Home screen at 1440px width. | Desktop layout renders correctly; no mobile breakpoint bleed; `LAYOUT_DESKTOP_MIN` respected | High | |
| PERF-006 | Recipe screen — 31 cards scroll performance | Any | Mobile Safari iOS | Staging | P1 | Scroll through all 31 recipes rapidly. | No frame drops below 30fps (subjective); no blank cards during scroll | High | |
| PERF-007 | Viewport stability — no jitter on iOS Safari | Free | Mobile Safari iOS | Staging | P1 | On Home screen, show/hide keyboard. | Viewport does not jump; `useStableViewport` stabilizes `stableVH` | High | |
| PERF-008 | Result screen — no layout shift on load | Free | Desktop Chrome | Staging | P1 | Load Result screen. Observe CLS (Cumulative Layout Shift). | CLS < 0.1 | Medium | |
| PERF-009 | Glass reflection — device tilt response | Free | Physical iPhone | Staging | P1 | On Home screen, tilt device left-right and up-down. | Glass viewfinder reflection moves with tilt; `useDeviceTilt` + `glassReflectionTransform` active | Medium | |
| PERF-010 | Reduce motion setting — animations disabled | Any | Desktop Chrome | Staging | P2 | Enable "Reduce motion" in Settings. Navigate between screens. | Screen transitions, button animations, and haptic-linked animations suppressed | Medium | |

---

### Suite 12: Visual Regression / Design Parity

| Test ID | Scenario | User Tier | Device | Env | Priority | Steps | Expected Result | Severity | Notes |
|---------|----------|-----------|--------|-----|----------|-------|-----------------|----------|-------|
| VIS-001 | Home screen — near-black background, glass viewfinder | Any | Desktop Chrome 1440px | Staging | P0 | Navigate to Home screen. Capture screenshot. Compare to Figma node 1336:2. | Background = near-black; viewfinder is glass (frosted, with inner shadow); Analyze button has LCD rim | Critical | Studio Matte canon — `project_studio_matte_home.md` |
| VIS-002 | Home screen — Carbon Black + Steel Blue — no gold | Any | Desktop Chrome | Staging | P0 | Inspect all color values on Home screen via DevTools. | Zero gold (`#F5C542` or similar) in any token. Palette = Carbon Black + Steel Blue only. | Critical | `project_studio_matte_tokens.md` — NO gold |
| VIS-003 | Result screen — high confidence vs low confidence visual states | Any | Desktop Chrome | Staging | P0 | Run analyses yielding high (≥0.75) and low (<0.4) confidence. Compare screens. | Figma nodes 1493:2 (high) and 1498:2 (low) — different visual treatment confirmed | Critical | |
| VIS-004 | Grain texture — background only, not on panels | Any | Desktop Chrome | Staging | P0 | Inspect Home, Result, Setup screens. Check for noise grain texture. | Grain/noise texture appears ONLY on the app background layer. Not on glass panels, cards, or overlays. | Critical | `feedback_grain_background_only.md` — critical memory rule |
| VIS-005 | Button tactility — raised not flat fills | Any | Desktop Chrome | Staging | P0 | Inspect Analyze button (CTA), Save Setup button, Recipe CTA buttons. | All CTAs use `CTA_BG`, `CTA_SHADOW`, `CTA_BEVEL` neumorphic treatment — raised appearance, not flat color fills | Critical | `feedback_tactile_neumorphic.md` memory rule |
| VIS-006 | Settings screen — 8 settings for users, 15 for admins | User vs Admin | Desktop Chrome | Staging | P0 | (1) Log in as regular user; count Settings items. (2) Log in as admin; count Settings items. | Regular user sees exactly 8. Admin sees all 15. | Critical | |
| VIS-007 | Lab screen — admin only | Admin vs User | Desktop Chrome | Staging | P0 | Log in as regular user; attempt to navigate to Lab screen (7 tabs). | Lab screen is not accessible to regular user; no route or entry point visible | Critical | |
| VIS-008 | Home screen — responsive at 375px (iPhone SE) | Any | Chrome DevTools 375px | Staging | P0 | Set viewport to 375×667. Load Home screen. | Viewfinder, Analyze button, navigation all visible without horizontal scroll | Critical | |
| VIS-009 | Home screen — responsive at 430px (iPhone 15 Pro Max) | Any | Chrome DevTools 430px | Staging | P0 | Set viewport to 430×932. Load Home screen. | Layout scales correctly; no clipping, no excessive whitespace | High | |
| VIS-010 | Home screen — responsive at 768px (iPad) | Any | Chrome DevTools 768px | Staging | P0 | Set viewport to 768×1024. | Tablet layout (or appropriate mobile layout). Not desktop, not cramped mobile. | High | |
| VIS-011 | Studio Matte tokens — studioMatte.js is sole token source | — | Code review | Staging | P0 | Grep for CSS variable references (`var(--`) in all Studio Matte screen files. | Zero `var(--...)` CSS variable references in _core, _adjacent, _shared studio screen files. All values from `studioMatte.js` imports. | Critical | Token drift risk — current branch has studioMatte.js modified |
| VIS-012 | Font smoothing — FONT_SMOOTH applied to all text | — | Desktop Chrome | Staging | P1 | Inspect body text and labels across Home, Result, Setup screens via DevTools. | `-webkit-font-smoothing: antialiased` active; text is not jagged on Retina displays | High | |
| VIS-013 | Dark/light mode — Daylight mode adds brightness lift | Any | Desktop Chrome | Staging | P1 | Toggle Daylight mode in Settings. | Visible brightness increase (~15%) on steel elements in Home screen; no other screens inadvertently brightened | Medium | |
| VIS-014 | OnboardingScreen — first-time user flow | New User | Mobile Safari iOS | Staging | P1 | Create new account; complete onboarding. | Onboarding screens complete without error; exits to Home on finish | High | |

---

## 3. DEVICE_MATRIX

| Device / Browser | Viewport | OS | Priority | Suite Coverage |
|-----------------|----------|----|----------|----------------|
| iPhone SE (3rd gen) — Safari | 375×667 | iOS 17 | P0 | All mobile-critical tests |
| iPhone 15 Pro Max — Safari | 430×932 | iOS 17 | P0 | Auth, Core Flow, Visual |
| Android Pixel 8 — Chrome | 393×873 | Android 14 | P0 | Auth, Core Flow |
| iPad Pro 11" — Safari | 834×1194 | iPadOS 17 | P1 | Layout, Recipes, Saved |
| MacBook Pro 14" — Chrome 1440px | 1440×900 | macOS 15 | P0 | All suites |
| MacBook Pro 14" — Firefox | 1440×900 | macOS 15 | P1 | Auth, Core Flow, Export |
| MacBook Pro 14" — Safari | 1440×900 | macOS 15 | P1 | Auth, Visual |
| Windows Desktop — Chrome 1920px | 1920×1080 | Windows 11 | P1 | Layout, Export, Payments |
| Windows Desktop — Edge | 1920×1080 | Windows 11 | P2 | Auth, Core Flow |
| Chrome DevTools 375px (simulated) | 375×667 | — | P0 | Visual regression all screens |
| Chrome DevTools 768px (simulated) | 768×1024 | — | P0 | Tablet layout |
| Chrome DevTools 1280px (simulated) | 1280×800 | — | P1 | Desktop breakpoint |

---

## 4. USER_TIER_MATRIX

| Suite | Free | Pro | Studio | Expired Pro | Expired Studio | Admin |
|-------|------|-----|--------|-------------|----------------|-------|
| Suite 1: Auth | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Suite 2: Core Analysis | ✓ | ✓ | ✓ | ✓ (limited) | ✓ (limited) | ✓ |
| Suite 3: Home→Result Flow | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Suite 4: Pricing / Paywall | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Suite 5: Stripe Payments | ✓→Pro | ✓→Studio | — | ✓ (churn) | ✓ (churn) | — |
| Suite 6: Studio Backend | — | ✓ (blocked) | ✓ | — | ✓ (blocked after expiry) | ✓ |
| Suite 7: Export | ✓ (blocked) | ✓ | ✓ | ✓ (blocked) | ✓ (Studio features blocked) | ✓ |
| Suite 8: Saved Data / Journal | ✓ (blocked) | ✓ | ✓ | ✓ (blocked) | ✓ (Pro features blocked) | ✓ |
| Suite 9: Recipes | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Suite 10: Taxonomy | — | — | — | — | — | ✓ (admin access to Lab) |
| Suite 11: Performance | ✓ | ✓ | ✓ | — | — | — |
| Suite 12: Visual Regression | ✓ | ✓ | — | — | — | ✓ |

**Key for Expired tiers:** Test that previously granted features are now correctly blocked after subscription cancellation webhook fires. Free-tier limits should re-apply.

---

## 5. RELEASE_BLOCKER_SET

The following test IDs must pass before any production deployment:

**Auth and Security**
- AUTH-001, AUTH-002, AUTH-003, AUTH-004, AUTH-005, AUTH-006, AUTH-012 (Apple Sign-In honest state)

**Core Analysis**
- ANAL-001, ANAL-002, ANAL-003, ANAL-006, ANAL-007, ANAL-008

**Home → Result Flow**
- FLOW-001, FLOW-002, FLOW-007, FLOW-008

**Pricing Truth**
- PAY-001, PAY-002, PAY-003, PAY-004, PAY-005, PAY-006, PAY-007, PAY-010, PAY-011, PAY-012, PAY-014

**Payments**
- STRIPE-001, STRIPE-003, STRIPE-005, STRIPE-006, STRIPE-007, STRIPE-008, STRIPE-009, STRIPE-010

**Studio Tier**
- STUDIO-001, STUDIO-003, STUDIO-005, STUDIO-007, STUDIO-008, STUDIO-010, STUDIO-011, STUDIO-018, STUDIO-020

**Export**
- EXPORT-003, EXPORT-006

**Data Integrity**
- DATA-001, DATA-002, DATA-010, DATA-011

**Recipes**
- REC-001, REC-003, REC-007, REC-008

**Taxonomy / Engine**
- TAX-001, TAX-002, TAX-004, TAX-006

**Visual**
- VIS-001, VIS-002, VIS-004, VIS-005, VIS-006, VIS-007, VIS-008, VIS-011

**Total release blockers: 58 test cases**

---

## 6. LOCK_CRITERIA_SET

Declare the release locked when ALL of the following are true:

1. **All 58 release-blocker test cases pass** with documented evidence (screenshot or API response log for each).

2. **Zero P0 open bugs** in the QA Bugs/Findings database with severity Critical or High and component = Auth, Core Analysis, Payments, or Plan Guard.

3. **Stripe test-mode round-trip verified**: Pro and Studio checkout → webhook → subscription active → feature access granted — in the Stripe test environment with test cards `4242 4242 4242 4242` (success) and `4000 0000 0000 0002` (decline).

4. **Expired subscription flow verified**: `customer.subscription.deleted` webhook correctly demotes user; Pro/Studio features blocked within one plan-check cycle.

5. **Apple Sign-In honest state confirmed**: Button present on login/signup but clearly communicates non-functional state. No silent failure, no unhandled JS error.

6. **JWT revocation known limitation documented**: In-memory JTI blocklist clears on restart. Documented in release notes or DEPLOY.md. Risk acknowledged by product owner.

7. **Free-tier counter not bypassable via new session (regression)**: AUTH-less counter bypass test (PAY-002) shows server-side `user_id` scoping works for authenticated users. Anonymous bypass risk documented.

8. **No raw snake_case pattern names in UI**: TAX-002 confirmed passing across all major analysis result screens.

9. **Grain texture boundary enforced**: VIS-004 confirmed — grain only on background layer on Home, Result, and Setup screens.

10. **No gold tokens in Studio Matte palette**: VIS-002 confirmed with DevTools color inspection on Home and Result screens.

11. **Batch cross-user isolation confirmed**: STUDIO-005 explicitly tested with two distinct Studio accounts.

12. **Shared setup PII check confirmed**: STUDIO-020 explicitly verified — no user email, user_id, or auth material in public GET /api/shared/setup/{token} response.

13. **Benchmark regression suite passes**: `pytest tests/test_benchmark_regression.py` green at the commit being released.

14. **Figma parity review completed**: Figma Delta status reviewed for all modified screens on current branch (`HomeScreen.jsx`, `SetupScreen.jsx`, `ResultScreen.jsx`, `BuildWizardScreen.jsx`, `RecipeScreen.jsx`, `SavedSetupsScreen.jsx`, `Day1ShootScreen.jsx`, `studioMatte.js`, `tokens.css`). Status documented as `Code Leads`, `Figma Leads`, or `In Parity` per screen.

15. **Render deployment smoke test passes**: After deploying to Render, run `smoke_test.py` and confirm all endpoints respond. Zero 5xx errors on health check (`GET /api/health`).

---

## 7. NOTION_IMPORT_STRUCTURE

### Database 1: QA Test Cases

**Name:** NGW QA — Test Cases

| Property | Type | Notes |
|----------|------|-------|
| Test ID | Title | e.g., AUTH-001 |
| Suite | Select | Auth, Core Analysis, Home Flow, Pricing, Payments, Studio Backend, Export, Saved Data, Recipes, Taxonomy, Performance, Visual |
| Scenario | Rich Text | Short description |
| User Tier | Multi-select | Free, Pro, Studio, Expired Pro, Expired Studio, Admin, Anonymous |
| Device | Multi-select | Desktop Chrome, Mobile Safari iOS, Mobile Chrome Android, iPad Safari, Desktop Firefox |
| Environment | Select | Staging, Stripe Test, Backend, Human Review |
| Priority | Select | P0, P1, P2 |
| Severity | Select | Critical, High, Medium, Low |
| Steps | Rich Text | Numbered steps |
| Expected Result | Rich Text | Exact expected outcome |
| Notes | Rich Text | Risk context, known issues |
| Automatable | Checkbox | Can this be automated? |
| Release Blocker | Checkbox | In the blocker set |
| Status | Select | Not Run, Pass, Fail, Blocked, Skip |
| Last Run Date | Date | |
| Last Run By | Person | |
| Bug Link | Relation | → QA Bugs/Findings |

---

### Database 2: QA Bugs / Findings

**Name:** NGW QA — Bugs & Findings

| Property | Type | Notes |
|----------|------|-------|
| Bug ID | Title | e.g., BUG-001 |
| Title | Rich Text | One-line description |
| Test ID (Found By) | Relation | → QA Test Cases |
| Suite | Select | Same options as Test Cases |
| Component | Select | Auth, Plan Guard, Stripe, Engine, UI-HomeScreen, UI-ResultScreen, UI-SetupScreen, UI-Recipes, UI-SavedSetups, UI-BuildWizard, UI-Cockpit, API-Batch, API-Teams, API-Keys, API-Studio, Export, Settings |
| Severity | Select | Critical, High, Medium, Low |
| Priority | Select | P0, P1, P2 |
| Status | Select | Open, In Progress, Fixed, Verified, Won't Fix, Duplicate |
| User Tier Affected | Multi-select | Same as Test Cases |
| Device Affected | Multi-select | Same as Test Cases |
| Environment | Select | Staging, Production, Both |
| Steps to Reproduce | Rich Text | |
| Actual Result | Rich Text | What actually happened |
| Expected Result | Rich Text | What should have happened |
| Screenshot / Evidence | Files | |
| Root Cause | Rich Text | Post-fix field |
| Fix Commit | Text | Git SHA |
| Opened Date | Date | EST |
| Closed Date | Date | EST |
| Release Blocker | Checkbox | |
| Assigned To | Person | |

---

### Database 3: QA Test Runs

**Name:** NGW QA — Test Runs

| Property | Type | Notes |
|----------|------|-------|
| Run ID | Title | e.g., RUN-2026-04-19-01 |
| Run Date | Date | EST |
| Release Target | Text | e.g., `chore/studio-matte-rollout-prod` |
| Git Commit | Text | Full SHA |
| Environment | Select | Staging, Production |
| Run By | Person | |
| Total Tests | Number | |
| Passed | Number | |
| Failed | Number | |
| Blocked | Number | |
| Skipped | Number | |
| Pass Rate % | Formula | `(Passed / Total Tests) * 100` |
| Blockers Open | Number | P0 Critical/High open bugs at close |
| Test Cases Run | Relation | → QA Test Cases (multi-select) |
| Bugs Filed | Relation | → QA Bugs & Findings |
| Status | Select | In Progress, Complete, Aborted |
| Release Decision | Select | Go, No-Go, Conditional Go |
| Notes | Rich Text | Known risks, conditional items |

---

### Database 4: QA Lock Criteria

**Name:** NGW QA — Lock Criteria

| Property | Type | Notes |
|----------|------|-------|
| Criterion ID | Title | e.g., LOCK-01 through LOCK-15 |
| Description | Rich Text | Full criterion text |
| Category | Select | Blockers, Stripe, Auth, Engine, Visual, Design Parity, Deployment |
| Status | Select | Not Checked, Pass, Fail, Waived |
| Evidence | Rich Text | Screenshot URL, log link, commit SHA, or "See test run RUN-..." |
| Verified By | Person | |
| Verified Date | Date | EST |
| Test Run | Relation | → QA Test Runs |
| Waiver Reason | Rich Text | If Status = Waived — explicit product owner sign-off required |
| Release Blocker | Checkbox | All 15 are blockers by default |

---

## 8. FINAL_JUDGMENT

**QA_MATRIX_READY_TO_RUN**

The matrix is fully grounded in actual code (`auth/plan_guard.py`, `api/routes/batch.py`, `api/routes/stripe_checkout.py`, `api/routes/teams.py`, `api/routes/api_keys.py`, `api/routes/studio_api.py`, `auth/security.py`, `auth/rate_limit.py`, `ui/src/screens/studio/_core/*`, `ui/src/screens/Day1DemoApp.jsx`, `ui/src/data/recipes.js`). Every test ID references a specific endpoint, component, limit value, or token constant from the live codebase — not from specification alone.

**Known gaps to resolve before first run:**

1. Confirm Stripe test price IDs are set in staging environment (`STRIPE_PRICE_ID_MONTHLY`, `STRIPE_PRICE_ID_STUDIO_MONTHLY`, etc.) — required for entire Suite 5.
2. Confirm `STRIPE_WEBHOOK_SECRET` is configured in staging — STRIPE-007 will produce misleading results without it.
3. Identify whether the 3 expired-plan test accounts exist in staging DB, or create them explicitly before running Suite 4 and 5 expired-tier tests.
4. Clarify Apple Sign-In behavior intent before AUTH-012 can be evaluated — "coming soon" message vs. silent placeholder vs. placeholder that should be hidden entirely.
5. Rate limit in `studio_api.py` is in-memory with no persistence. STUDIO-012 (100/hr limit test) requires either hitting it in a fresh server process or mocking the `_rate_limits` dict — note this in the test run.