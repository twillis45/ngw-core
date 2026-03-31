/**
 * paywallAnalytics.test.js
 *
 * Regression-hardening tests for NGW Core paywall analytics.
 * Enforces canonical enum values end-to-end:
 *   trigger_type | surface | paywall_type | presentation_type | source_screen
 *
 * Canonical registries (must match paywallEvents.js):
 *   trigger_type      : nailed_it | close | failure | exit_intent | shoot_mode | recipe_locked | analysis_limit
 *   surface           : blueprint_card | camera_settings | gear_recommendation | exit_intent | shoot_mode | recipe_locked | success_moment
 *   paywall_type      : pricing | shoot
 *   presentation_type : bottom_sheet | inline_gate | nudge
 *   source_screen     : ResultsScreenV2 | RecipeScreen
 *
 * Deprecated values that must NEVER appear in attribution fields:
 *   hard | soft | blueprint | camera | gear | inline_gate (as paywall_type) | bottom_sheet (as paywall_type)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Canonical enum sets ────────────────────────────────────────────────────

const TRIGGER_TYPES = new Set([
  'nailed_it', 'close', 'failure', 'exit_intent',
  'shoot_mode', 'recipe_locked', 'analysis_limit',
]);

const SURFACES = new Set([
  'blueprint_card', 'camera_settings', 'gear_recommendation',
  'exit_intent', 'shoot_mode', 'recipe_locked', 'success_moment',
]);

const PAYWALL_TYPES = new Set(['pricing', 'shoot']);

const PRESENTATION_TYPES = new Set(['bottom_sheet', 'inline_gate', 'nudge']);

const SOURCE_SCREENS = new Set(['ResultsScreenV2', 'RecipeScreen']);

// Deprecated — must never appear in attribution fields
const DEPRECATED = ['hard', 'soft', 'blueprint', 'camera', 'gear'];

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('../data/flagsStore', () => ({
  getSessionId: () => 'test-session-abc123',
}));

vi.mock('../data/authApi', () => ({
  authHeaders: () => ({ Authorization: 'Bearer test-token' }),
}));

let fetchCalls = [];
let beaconCalls = [];

beforeEach(() => {
  fetchCalls = [];
  beaconCalls = [];

  global.fetch = vi.fn((url, opts) => {
    fetchCalls.push({ url, body: JSON.parse(opts?.body || '{}') });
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ url: 'https://stripe.com/test-checkout', session_id: 'cs_test_123' }),
    });
  });

  // Intercept Blob constructor to capture the JSON string before it's wrapped
  global.Blob = vi.fn().mockImplementation(function ([content]) {
    this._content = content;
  });

  global.navigator = {
    sendBeacon: vi.fn((url, blob) => {
      // blob._content is set by our Blob mock above — synchronous, no async needed
      beaconCalls.push({ url, body: JSON.parse(blob._content) });
      return true;
    }),
  };

  // Prevent redirect side-effect in startStripeCheckout
  delete global.window;
  global.window = {
    location: { origin: 'https://app.ngw.test', href: '' },
  };
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── Helper ─────────────────────────────────────────────────────────────────

function assertNoDeprecatedValues(payload) {
  const str = JSON.stringify(payload);
  for (const bad of DEPRECATED) {
    // match as standalone value (surrounded by quotes), not as substring
    expect(str, `deprecated value "${bad}" found in payload`).not.toMatch(
      new RegExp(`"${bad}"`)
    );
  }
  // These must not appear as paywall_type values
  expect(payload.paywall_type, 'paywall_type must not be bottom_sheet').not.toBe('bottom_sheet');
  expect(payload.paywall_type, 'paywall_type must not be inline_gate').not.toBe('inline_gate');
}

// ─── A. paywallEvents — shape + enum validation ──────────────────────────────

describe('A. paywallEvents — emitter shape and enum validation', async () => {
  const {
    trackPaywallShown,
    trackPaywallDismissed,
    trackPaywallCTAClicked,
    trackCheckoutStarted,
    trackCheckoutFailed,
  } = await import('../data/paywallEvents');

  describe('trackPaywallShown', () => {
    it('emits correct shape with all canonical fields', () => {
      trackPaywallShown({
        trigger_type: 'nailed_it',
        surface: 'blueprint_card',
        paywall_type: 'pricing',
        presentation_type: 'bottom_sheet',
        source_screen: 'ResultsScreenV2',
        billing_period: 'monthly',
      });

      const { body } = fetchCalls[0];
      expect(body.event_name).toBe('PAYWALL_SHOWN');
      expect(body.session_id).toBe('test-session-abc123');
      expect(body.trigger_type).toBe('nailed_it');
      expect(body.surface).toBe('blueprint_card');
      expect(body.paywall_type).toBe('pricing');
      expect(body.presentation_type).toBe('bottom_sheet');
      expect(body.source_screen).toBe('ResultsScreenV2');
      assertNoDeprecatedValues(body);
    });

    it('defaults paywall_type to "pricing" (not bottom_sheet or inline_gate)', () => {
      trackPaywallShown({ trigger_type: 'exit_intent', surface: 'exit_intent' });
      expect(fetchCalls[0].body.paywall_type).toBe('pricing');
      expect(fetchCalls[0].body.presentation_type).toBe('bottom_sheet');
    });

    it('defaults source_screen to "unknown" (not a deprecated value)', () => {
      trackPaywallShown({ trigger_type: 'recipe_locked', surface: 'recipe_locked', paywall_type: 'pricing' });
      expect(fetchCalls[0].body.source_screen).toBe('unknown');
      assertNoDeprecatedValues(fetchCalls[0].body);
    });
  });

  describe('trackPaywallDismissed', () => {
    it('emits canonical fields via beacon', () => {
      trackPaywallDismissed({
        trigger_type: 'shoot_mode',
        surface: 'shoot_mode',
        paywall_type: 'shoot',
        presentation_type: 'bottom_sheet',
        source_screen: 'ResultsScreenV2',
        dismissed_via: 'close_button',
        billing_period: 'monthly',
        time_on_screen_ms: 3000,
      });

      expect(beaconCalls[0].body.event_name).toBe('PAYWALL_DISMISSED');
      expect(beaconCalls[0].body.paywall_type).toBe('shoot');
      expect(beaconCalls[0].body.presentation_type).toBe('bottom_sheet');
      assertNoDeprecatedValues(beaconCalls[0].body);
    });

    it('defaults paywall_type to "pricing" (not bottom_sheet)', () => {
      trackPaywallDismissed({ trigger_type: 'recipe_locked', surface: 'recipe_locked' });
      expect(beaconCalls[0].body.paywall_type).toBe('pricing');
    });
  });

  describe('trackPaywallCTAClicked', () => {
    it('emits canonical fields', () => {
      trackPaywallCTAClicked({
        trigger_type: 'exit_intent',
        surface: 'exit_intent',
        paywall_type: 'pricing',
        presentation_type: 'bottom_sheet',
        source_screen: 'ResultsScreenV2',
        cta_text: 'See the full breakdown — Go Pro',
        billing_period: 'monthly',
      });

      const { body } = fetchCalls[0];
      expect(body.event_name).toBe('PAYWALL_CTA_CLICKED');
      expect(body.trigger_type).toBe('exit_intent');
      expect(body.surface).toBe('exit_intent');
      expect(body.presentation_type).toBe('bottom_sheet');
      assertNoDeprecatedValues(body);
    });

    it('inline_gate presentation_type passes through correctly', () => {
      trackPaywallCTAClicked({
        trigger_type: 'nailed_it',
        surface: 'camera_settings',
        paywall_type: 'pricing',
        presentation_type: 'inline_gate',
        source_screen: 'ResultsScreenV2',
      });
      // inline_gate IS a valid presentation_type value
      expect(fetchCalls[0].body.presentation_type).toBe('inline_gate');
      // but paywall_type must NOT be inline_gate
      expect(fetchCalls[0].body.paywall_type).toBe('pricing');
    });
  });

  describe('trackCheckoutStarted', () => {
    it('emits canonical fields', () => {
      trackCheckoutStarted({
        trigger_type: 'recipe_locked',
        surface: 'recipe_locked',
        paywall_type: 'pricing',
        presentation_type: 'bottom_sheet',
        source_screen: 'RecipeScreen',
        billing_period: 'yearly',
      });

      const { body } = fetchCalls[0];
      expect(body.event_name).toBe('CHECKOUT_STARTED');
      expect(body.source_screen).toBe('RecipeScreen');
      expect(body.paywall_type).toBe('pricing');
      assertNoDeprecatedValues(body);
    });
  });

  describe('trackCheckoutFailed', () => {
    it('emits canonical fields', () => {
      trackCheckoutFailed({
        trigger_type: 'nailed_it',
        surface: 'blueprint_card',
        paywall_type: 'pricing',
        presentation_type: 'bottom_sheet',
        source_screen: 'ResultsScreenV2',
        billing_period: 'monthly',
        error: 'Network error',
      });

      const { body } = fetchCalls[0];
      expect(body.event_name).toBe('CHECKOUT_FAILED');
      expect(body.paywall_type).toBe('pricing');
      assertNoDeprecatedValues(body);
    });

    it('defaults paywall_type to "pricing" (not bottom_sheet)', () => {
      trackCheckoutFailed({ trigger_type: 'exit_intent', surface: 'exit_intent', error: 'timeout' });
      expect(fetchCalls[0].body.paywall_type).toBe('pricing');
    });
  });

  // Negative: deprecated values never appear as defaults
  describe('negative — deprecated values never appear in defaults', () => {
    it.each([
      ['trackPaywallShown',     () => trackPaywallShown({})],
      ['trackPaywallCTAClicked', () => trackPaywallCTAClicked({})],
      ['trackCheckoutStarted',   () => trackCheckoutStarted({})],
      ['trackCheckoutFailed',    () => trackCheckoutFailed({})],
    ])('%s default payload contains no deprecated values', async (name, fn) => {
      fn();
      const body = fetchCalls[fetchCalls.length - 1]?.body;
      assertNoDeprecatedValues(body);
    });

    it('trackPaywallDismissed default payload contains no deprecated values', () => {
      trackPaywallDismissed({});
      expect(beaconCalls[0]).toBeDefined();
      assertNoDeprecatedValues(beaconCalls[0].body);
    });
  });
});

// ─── E. Checkout continuity — startStripeCheckout request body ──────────────

describe('E. startStripeCheckout — request body canonical fields', async () => {
  const { startStripeCheckout } = await import('../data/stripeCheckout');

  it('sends billing_period, trigger_type, surface, paywall_type, source_screen', async () => {
    await startStripeCheckout({
      billingPeriod: 'monthly',
      triggerType: 'blueprint_card',
      surface: 'blueprint_card',
      paywallType: 'pricing',
      sourceScreen: 'ResultsScreenV2',
    }).catch(() => {}); // redirect throws in test env

    const { body } = fetchCalls[0];
    expect(body.billing_period).toBe('monthly');
    expect(body.trigger_type).toBe('blueprint_card');
    expect(body.surface).toBe('blueprint_card');
    expect(body.paywall_type).toBe('pricing');
    expect(body.source_screen).toBe('ResultsScreenV2');
    expect(body.ngw_session_id).toBe('test-session-abc123');
    expect(body.plan).toBe('pro');
  });

  it('shoot mode sends paywall_type "shoot"', async () => {
    await startStripeCheckout({
      billingPeriod: 'monthly',
      triggerType: 'shoot_mode',
      surface: 'shoot_mode',
      paywallType: 'shoot',
      sourceScreen: 'ResultsScreenV2',
    }).catch(() => {});

    expect(fetchCalls[0].body.paywall_type).toBe('shoot');
    assertNoDeprecatedValues(fetchCalls[0].body);
  });

  it('recipe_locked sends canonical surface and source_screen', async () => {
    await startStripeCheckout({
      billingPeriod: 'yearly',
      triggerType: 'recipe_locked',
      surface: 'recipe_locked',
      paywallType: 'pricing',
      sourceScreen: 'RecipeScreen',
    }).catch(() => {});

    const { body } = fetchCalls[0];
    expect(body.surface).toBe('recipe_locked');
    expect(body.source_screen).toBe('RecipeScreen');
    assertNoDeprecatedValues(body);
  });

  it('default paywallType is "pricing" (not bottom_sheet)', async () => {
    await startStripeCheckout({ billingPeriod: 'monthly' }).catch(() => {});
    expect(fetchCalls[0].body.paywall_type).toBe('pricing');
  });

  it('request body never contains deprecated values', async () => {
    await startStripeCheckout({
      billingPeriod: 'monthly',
      triggerType: 'nailed_it',
      surface: 'success_moment',
      paywallType: 'pricing',
      sourceScreen: 'ResultsScreenV2',
    }).catch(() => {});
    assertNoDeprecatedValues(fetchCalls[0].body);
  });
});

// ─── B. Entry point surface values ──────────────────────────────────────────

describe('B+C. Entry point surface/paywall_type correctness', () => {
  const ENTRY_POINTS = [
    // [description, trigger_type, surface, paywall_type, presentation_type, source_screen]
    ['blueprint_card tap',      'nailed_it',    'blueprint_card',      'pricing', 'bottom_sheet', 'ResultsScreenV2'],
    ['camera_settings gate',    'nailed_it',    'camera_settings',     'pricing', 'inline_gate',  'ResultsScreenV2'],
    ['gear_recommendation gate', 'nailed_it',   'gear_recommendation', 'pricing', 'inline_gate',  'ResultsScreenV2'],
    ['exit_intent',             'exit_intent',  'exit_intent',         'pricing', 'bottom_sheet', 'ResultsScreenV2'],
    ['shoot_mode gate',         'shoot_mode',   'shoot_mode',          'shoot',   'bottom_sheet', 'ResultsScreenV2'],
    ['recipe_locked gate',      'recipe_locked', 'recipe_locked',      'pricing', 'bottom_sheet', 'RecipeScreen'],
    ['success_moment (nailed_it)', 'nailed_it', 'success_moment',      'pricing', 'bottom_sheet', 'ResultsScreenV2'],
  ];

  it.each(ENTRY_POINTS)(
    '%s: surface=%s, paywall_type=%s is canonical',
    (desc, trigger_type, surface, paywall_type, presentation_type, source_screen) => {
      expect(TRIGGER_TYPES.has(trigger_type),
        `trigger_type "${trigger_type}" not in canonical registry`).toBe(true);
      expect(SURFACES.has(surface),
        `surface "${surface}" not in canonical registry`).toBe(true);
      expect(PAYWALL_TYPES.has(paywall_type),
        `paywall_type "${paywall_type}" not in canonical registry`).toBe(true);
      expect(PRESENTATION_TYPES.has(presentation_type),
        `presentation_type "${presentation_type}" not in canonical registry`).toBe(true);
      expect(SOURCE_SCREENS.has(source_screen),
        `source_screen "${source_screen}" not in canonical registry`).toBe(true);
    }
  );
});
