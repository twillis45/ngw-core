/**
 * Adaptive Pricing Engine — Part 16.2 / 16.5 (client-side)
 *
 * Computes the right price, messaging, and CTA based on value state.
 *
 * ANTI-DISCOUNT GUARDRAILS (Part 16.8):
 *   - Never show a lower price than the highest seen this session
 *   - Tracked via sessionStorage key: ngw_max_price_seen
 *   - Price consistency maintained for the lifetime of the session
 *
 * PRICE MAP:
 *   LOW_VALUE       → $39   (exploration framing)
 *   DISCOVERY       → $39   (learning framing)
 *   SUCCESS_MOMENT  → $59   (outcome anchor)
 *   HIGH_INTENT     → $59   (workflow framing)
 *   FAILURE_TENSION → $39   (fix-focused framing)
 */

import { VALUE_STATES } from './valueState.js';

const SESSION_MAX_PRICE_KEY = 'ngw_max_price_seen';
const PRICE_LADDER = [39, 49, 59, 79];

// ── State → base price ────────────────────────────────────────────────────────
const STATE_BASE_PRICE = {
  [VALUE_STATES.LOW_VALUE]:       39,
  [VALUE_STATES.DISCOVERY]:       39,
  [VALUE_STATES.SUCCESS_MOMENT]:  59,
  [VALUE_STATES.HIGH_INTENT]:     59,
  [VALUE_STATES.FAILURE_TENSION]: 39,
};

// ── State → messaging ─────────────────────────────────────────────────────────
const STATE_MESSAGING = {
  [VALUE_STATES.LOW_VALUE]: {
    headline:    'Understand your lighting',
    subheadline: 'Get precise setups — no more guessing what works.',
    cta:         'Start for $__PRICE__/mo',
    valueFrame:  'exploration',
    proof:       'Used by photographers who want consistent results.',
    urgency:     null,
  },
  [VALUE_STATES.DISCOVERY]: {
    headline:    'Get consistent results',
    subheadline: "You're learning fast — unlock the full system.",
    cta:         'Unlock Full Access — $__PRICE__/mo',
    valueFrame:  'learning',
    proof:       'Full blueprints. Every modifier. All 28 patterns.',
    urgency:     null,
  },
  [VALUE_STATES.SUCCESS_MOMENT]: {
    headline:    'You just nailed it — make it repeatable',
    subheadline: 'Save this exact setup. Reproduce it on every shoot.',
    cta:         'Keep This Result — $__PRICE__/mo',
    valueFrame:  'outcome',
    proof:       'Photographers using NGW report 3× faster setup time.',
    urgency:     "Your setup is ready to save — don't lose it.",
  },
  [VALUE_STATES.HIGH_INTENT]: {
    headline:    'Run your shoots with confidence',
    subheadline: 'Shoot Mode. Blueprints. Every pattern — fully unlocked.',
    cta:         'Unlock Pro — $__PRICE__/mo',
    valueFrame:  'workflow',
    proof:       'Everything you need for every shoot, on set.',
    urgency:     null,
  },
  [VALUE_STATES.FAILURE_TENSION]: {
    headline:    'Fix what went wrong — fast',
    subheadline: 'Get the exact adjustment your lighting needs right now.',
    cta:         'Fix It Now — $__PRICE__/mo',
    valueFrame:  'fix',
    proof:       'NGW identifies the exact problem and gives you the solution.',
    urgency:     "Don't leave the set without getting this right.",
  },
};

// ── Main function ─────────────────────────────────────────────────────────────

/**
 * Get the adaptive pricing config for the current user state.
 *
 * @param {string} valueState        — from detectValueState()
 * @param {object} [options]
 * @param {string} [options.experimentVariant]  — 'price_high' | 'price_low' | null
 * @returns {{
 *   priceMonthly:      number,
 *   priceYearly:       number,
 *   yearlyDiscountPct: number,
 *   messaging:         object,
 *   ctaVariant:        string,
 *   state:             string,
 *   guardrailApplied:  boolean,
 *   experimentVariant: string|null,
 * }}
 */
export function getAdaptivePricing(valueState, { experimentVariant = null } = {}) {
  let basePrice = STATE_BASE_PRICE[valueState] ?? 39;

  // Experiment override
  if (experimentVariant === 'price_high') {
    basePrice = snapToLadder(basePrice + 10);
  } else if (experimentVariant === 'price_low') {
    basePrice = snapToLadder(basePrice - 10);
  }

  // Anti-discount guardrail
  const sessionMax = getSessionMaxPrice();
  let guardrailApplied = false;
  if (basePrice < sessionMax) {
    basePrice = sessionMax;
    guardrailApplied = true;
  }

  // Update session max
  setSessionMaxPrice(basePrice);

  const template = STATE_MESSAGING[valueState] ?? STATE_MESSAGING[VALUE_STATES.LOW_VALUE];
  const messaging = {
    ...template,
    cta:   template.cta.replace('__PRICE__', String(basePrice)),
    price: basePrice,
  };

  return {
    priceMonthly:      basePrice,
    priceYearly:       basePrice * 10,
    yearlyDiscountPct: 17,
    messaging,
    ctaVariant:        messaging.cta,
    state:             valueState,
    guardrailApplied,
    experimentVariant,
  };
}

// ── Session max price helpers ─────────────────────────────────────────────────

export function getSessionMaxPrice() {
  try {
    return parseInt(sessionStorage.getItem(SESSION_MAX_PRICE_KEY) || '0', 10);
  } catch {
    return 0;
  }
}

export function setSessionMaxPrice(price) {
  try {
    const current = getSessionMaxPrice();
    if (price > current) {
      sessionStorage.setItem(SESSION_MAX_PRICE_KEY, String(price));
    }
  } catch {}
}

export function clearSessionMaxPrice() {
  try {
    sessionStorage.removeItem(SESSION_MAX_PRICE_KEY);
  } catch {}
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function snapToLadder(price) {
  return PRICE_LADDER.reduce((a, b) =>
    Math.abs(b - price) < Math.abs(a - price) ? b : a
  );
}
