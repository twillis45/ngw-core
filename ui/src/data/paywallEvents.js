/**
 * paywallEvents — fire-and-forget paywall event tracking.
 * Posts to /api/experiments/paywall-event (server-side fan-out across all active flag assignments).
 * Uses sendBeacon for dismissal events (survives page unload).
 *
 * Canonical field values:
 *
 *   trigger_type      — user moment: nailed_it | close | failure | exit_intent | shoot_mode | recipe_locked | analysis_limit
 *
 *   surface           — which UI component opened the paywall:
 *                       blueprint_card | camera_settings | gear_recommendation |
 *                       exit_intent | shoot_mode | recipe_locked | success_moment
 *                       "success_moment" = the nailed_it celebration overlay on ResultsScreenV2.
 *                       Distinct from the VALUE_STATES.SUCCESS_MOMENT enum in adaptivePricing.js
 *                       (internal pricing logic) — the surface name is intentionally the same
 *                       to make queries obvious.
 *
 *   paywall_type      — product paywall category: pricing | shoot
 *                       Do NOT use presentation values (bottom_sheet, inline_gate) here.
 *
 *   presentation_type — how the paywall was rendered to the user:
 *                       bottom_sheet | inline_gate | nudge
 *                       bottom_sheet = PricingScreen in BottomSheet (default for direct opens)
 *                       inline_gate  = PaywallGate hard/soft path (blurred content + overlay)
 *                       nudge        = PaywallGate nudge path (non-blocking inline prompt)
 *
 *   source_screen     — which screen the user was on: ResultsScreenV2 | RecipeScreen | ShootMode
 *
 * "hard" and "soft" are internal adaptive gate modes — they must NOT appear in these event payloads.
 */

import { getSessionId } from './flagsStore';

const PAYWALL_API = '/api/experiments/paywall-event';

function post(body) {
  fetch(PAYWALL_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {});
}

function beacon(body) {
  const str = JSON.stringify(body);
  try {
    navigator.sendBeacon(PAYWALL_API, new Blob([str], { type: 'application/json' }));
  } catch {
    post(body);
  }
}

export function trackPaywallShown({
  trigger_type,
  surface,
  paywall_type,
  presentation_type,
  source_screen,
  billing_period = 'monthly',
  copy_variant,
  pricing_variant,
}) {
  post({
    session_id:        getSessionId(),
    event_name:        'PAYWALL_SHOWN',
    trigger_type:      trigger_type      || 'unknown',
    surface:           surface           || 'unknown',
    paywall_type:      paywall_type      || 'pricing',
    presentation_type: presentation_type || 'bottom_sheet',
    source_screen:     source_screen     || 'unknown',
    billing_period,
    copy_variant:      copy_variant      || 'control',
    pricing_variant:   pricing_variant   || 'control_39',
  });
}

export function trackPaywallDismissed({
  trigger_type,
  surface,
  paywall_type,
  presentation_type,
  source_screen,
  dismissed_via,
  time_on_screen_ms,
  billing_period,
}) {
  beacon({
    session_id:        getSessionId(),
    event_name:        'PAYWALL_DISMISSED',
    trigger_type:      trigger_type      || 'unknown',
    surface:           surface           || 'unknown',
    paywall_type:      paywall_type      || 'pricing',
    presentation_type: presentation_type || 'bottom_sheet',
    source_screen:     source_screen     || 'unknown',
    dismissed_via:     dismissed_via     || 'unknown',
    billing_period:    billing_period    || 'monthly',
    time_on_screen_ms: time_on_screen_ms || null,
  });
}

export function trackPaywallCTAClicked({
  trigger_type,
  surface,
  paywall_type,
  presentation_type,
  source_screen,
  cta_text,
  billing_period,
}) {
  post({
    session_id:        getSessionId(),
    event_name:        'PAYWALL_CTA_CLICKED',
    trigger_type:      trigger_type      || 'unknown',
    surface:           surface           || 'unknown',
    paywall_type:      paywall_type      || 'pricing',
    presentation_type: presentation_type || 'bottom_sheet',
    source_screen:     source_screen     || 'unknown',
    cta_text:          cta_text          || '',
    billing_period:    billing_period    || 'monthly',
  });
}

export function trackCheckoutStarted({
  trigger_type,
  surface,
  paywall_type,
  presentation_type,
  source_screen,
  billing_period,
}) {
  post({
    session_id:        getSessionId(),
    event_name:        'CHECKOUT_STARTED',
    trigger_type:      trigger_type      || 'unknown',
    surface:           surface           || 'unknown',
    paywall_type:      paywall_type      || 'pricing',
    presentation_type: presentation_type || 'bottom_sheet',
    source_screen:     source_screen     || 'unknown',
    billing_period:    billing_period    || 'monthly',
  });
}

export function trackCheckoutFailed({
  trigger_type,
  surface,
  paywall_type,
  presentation_type,
  source_screen,
  billing_period,
  error,
}) {
  post({
    session_id:        getSessionId(),
    event_name:        'CHECKOUT_FAILED',
    trigger_type:      trigger_type      || 'unknown',
    surface:           surface           || 'unknown',
    paywall_type:      paywall_type      || 'pricing',
    presentation_type: presentation_type || 'bottom_sheet',
    source_screen:     source_screen     || 'unknown',
    billing_period:    billing_period    || 'monthly',
    data: { error: error || 'unknown' },
  });
}
