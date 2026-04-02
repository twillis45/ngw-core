/**
 * NGW Pricing Store
 *
 * Returns the active pricing config from feature flags.
 * Falls back to default $39/month baseline if no pricing experiment is active.
 *
 * Usage:
 *   import { getActivePricing, getPaywallConfig, VALUE_FRAMES } from './pricingStore';
 *   const pricing = getActivePricing();   // call after fetchFlags()
 *   const paywall = getPaywallConfig();
 */

import { getActiveInGroup } from './flagsStore';

// ── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_PRICING = {
  price_monthly: 39,
  price_yearly: 390,
  yearly_discount_pct: 17,
  trial_days: 0,
  free_analyses: 3,
  cta: 'Get Precise Setups',
  value_frame: 'confidence',
  flag_name: null,
};

export const DEFAULT_PAYWALL = {
  trigger: 'analysis_count',
  threshold: 3,
  type: 'hard',
};

// ── Active configs ────────────────────────────────────────────────────────────

/** Returns the active pricing config (from flags, or DEFAULT_PRICING). */
export function getActivePricing() {
  const active = getActiveInGroup('pricing');
  if (!active?.config) return DEFAULT_PRICING;
  return {
    ...DEFAULT_PRICING,
    ...active.config,
    flag_name: active.name,
    badge_yearly: active.config.yearly_discount_pct
      ? `Save ${active.config.yearly_discount_pct}%`
      : 'Save',
  };
}

/** Returns the active paywall config (from flags, or DEFAULT_PAYWALL). */
export function getPaywallConfig() {
  const active = getActiveInGroup('paywall_timing');
  return active?.config || DEFAULT_PAYWALL;
}

/** Returns the active CTA messaging config. */
export function getActiveCTA() {
  const active = getActiveInGroup('cta_messaging');
  return active?.config || VALUE_FRAMES.confidence;
}

// ── Value frames ──────────────────────────────────────────────────────────────

export const VALUE_FRAMES = {
  confidence: {
    headline: 'Get this shot right — first try.',
    sub: 'Exact positions. Power ratios. No guessing.',
    bullets: [
      'Precise light positions and angles for this setup',
      'Power ratios dialled in — stop adjusting between takes',
      'Modifier specs and distance callouts',
      'Camera settings optimised for this pattern',
    ],
  },
  speed: {
    headline: 'Less time adjusting. More time shooting.',
    sub: 'Every setup tested and ready to run.',
    bullets: [
      'Set up in minutes, not hours',
      'Skip the trial-and-error on every shoot',
      'Exact settings for your gear and your space',
      'Built for photographers who respect their time',
    ],
  },
  pro: {
    headline: 'Pro results. Exactly reproducible.',
    sub: 'The setups working photographers actually run.',
    bullets: [
      'Studio-tested setups with exact measurements',
      'Recreate any look from any reference image',
      'Consistent results across every session',
      'The system pros use to stop guessing',
    ],
  },
};

// ── Paywall types ─────────────────────────────────────────────────────────────

export const PAYWALL_TYPES = {
  hard: 'hard',                     // block after threshold, no bypass
  soft: 'soft',                     // warn + allow continuation once
  value_triggered: 'value_triggered', // fires after "nailed it" / success moment
  nudge: 'nudge',                   // non-blocking inline prompt
};
