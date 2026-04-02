/**
 * paywallTrigger — pure function to evaluate which paywall (if any) should fire.
 *
 * Priority hierarchy:
 *   1. SUCCESS_MOMENT  — user tapped "Nailed it" or saved a setup (highest intent)
 *   2. SHOOT_MODE      — user attempted to enter Shoot Mode
 *   3. ANALYSIS_LIMIT  — analysis count >= threshold
 *   4. PASSIVE_NUDGE   — analysis count >= 2 (non-blocking)
 */

import { getPaywallConfig } from './pricingStore';

export const TRIGGER = {
  SUCCESS_MOMENT: 'success_moment',
  SHOOT_MODE:     'shoot_mode',
  ANALYSIS_LIMIT: 'analysis_limit',
  PASSIVE_NUDGE:  'passive_nudge',
};

const COOLDOWN_KEY = 'ngw_success_paywall_ts';
const COOLDOWN_MS  = 24 * 60 * 60 * 1000; // 24 hours

function isSuccessCoolingDown() {
  try {
    const ts = parseInt(sessionStorage.getItem(COOLDOWN_KEY) || '0', 10);
    return Date.now() - ts < COOLDOWN_MS;
  } catch { return false; }
}

export function markSuccessMomentShown() {
  try { sessionStorage.setItem(COOLDOWN_KEY, String(Date.now())); } catch {}
}

/**
 * Evaluate which paywall gate (if any) should fire.
 *
 * @param {object} params
 * @param {boolean} params.isPaid
 * @param {number}  params.analysisCount
 * @param {string}  [params.event]  — 'NAILED_IT' | 'ANALYSIS_SAVED' | 'SHOOT_MODE_ENTER'
 * @returns {{ trigger: string, paywallType: string, copyVariant: string|null } | null}
 */
export function evaluatePaywallTrigger({ isPaid, analysisCount, event }) {
  if (isPaid) return null;

  const paywallCfg = getPaywallConfig();
  const threshold  = paywallCfg.threshold ?? 3;

  // Priority 1 — success moment
  if ((event === 'NAILED_IT' || event === 'ANALYSIS_SAVED') && !isSuccessCoolingDown()) {
    return { trigger: TRIGGER.SUCCESS_MOMENT, paywallType: 'value_triggered', copyVariant: null };
  }

  // Priority 2 — shoot mode entry
  if (event === 'SHOOT_MODE_ENTER') {
    return { trigger: TRIGGER.SHOOT_MODE, paywallType: 'shoot_mode', copyVariant: null };
  }

  // Priority 3 — analysis limit
  if (analysisCount >= threshold) {
    return {
      trigger: TRIGGER.ANALYSIS_LIMIT,
      paywallType: paywallCfg.type || 'hard',
      copyVariant: null,
    };
  }

  // Priority 4 — passive nudge
  if (analysisCount >= 2) {
    return { trigger: TRIGGER.PASSIVE_NUDGE, paywallType: 'nudge', copyVariant: null };
  }

  return null;
}
