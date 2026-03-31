/**
 * adaptivePricing — returns pricing config based on user value state.
 * Stub implementation — returns standard pricing; replace with full engine when ready.
 */

const GUARDRAIL_KEY = 'ngw_pricing_guardrail';
const MAX_DISCOUNT_SESSIONS = 3;

const BASE_PRICING = {
  priceMonthly: 39,
  priceYearly: 390,
  ctaVariant: 'default',
  guardrailApplied: false,
  messaging: {
    valueFrame: 'default',
    headline: 'Upgrade to Pro',
    subhead: 'Unlock unlimited analyses and full feature access.',
  },
};

/**
 * Returns adaptive pricing config for the given value state.
 * @param {string} valueState
 * @param {object} opts
 * @returns {object} pricing config
 */
export function getAdaptivePricing(valueState, { experimentVariant = null } = {}) {
  return { ...BASE_PRICING };
}

/**
 * Returns the max discounted price allowed for this session (guardrail).
 */
export function getSessionMaxPrice() {
  try {
    const raw = sessionStorage.getItem(GUARDRAIL_KEY);
    return raw ? parseInt(raw, 10) : BASE_PRICING.priceMonthly;
  } catch {
    return BASE_PRICING.priceMonthly;
  }
}
