/**
 * useAdaptivePaywall — Part 16.6
 *
 * Detects the user's value state, computes adaptive pricing and messaging,
 * and exposes impression tracking to paywall components.
 *
 * Usage:
 *   const { valueState, pricing, recordImpression, recordConverted, recordDismissed }
 *     = useAdaptivePaywall({ recentOutcome: 'nailed_it', usageCount: 3 });
 */

import { useCallback, useMemo, useRef } from 'react';
import { detectValueState, getSessionCount } from '../engine/valueState.js';
import { getAdaptivePricing, getSessionMaxPrice } from '../engine/adaptivePricing.js';
import { getSessionId } from '../data/flagsStore.js';
import { getToken } from '../data/authApi.js';

/**
 * @param {object}       params
 * @param {string|null}  params.recentOutcome     — 'nailed_it' | 'missed_it' | null
 * @param {number}       params.usageCount        — analyses this session
 * @param {boolean}      params.shootModeUsed     — entered Shoot Mode
 * @param {number}       params.blueprintViews    — blueprint detail views
 * @param {string|null}  params.triggerType       — paywall trigger type (for analytics)
 * @param {string|null}  params.experimentVariant — A/B experiment variant
 */
export function useAdaptivePaywall({
  recentOutcome    = null,
  usageCount       = 0,
  shootModeUsed    = false,
  blueprintViews   = 0,
  triggerType      = null,
  experimentVariant = null,
} = {}) {
  const impressionIdRef = useRef(null);

  // Session count from localStorage (stable across re-renders)
  const sessionCount = useMemo(() => getSessionCount(), []);

  // Detect value state
  const { state: valueState } = useMemo(
    () => detectValueState({ recentOutcome, usageCount, sessionCount, shootModeUsed, blueprintViews }),
    [recentOutcome, usageCount, sessionCount, shootModeUsed, blueprintViews],
  );

  // Compute adaptive pricing (reads + updates sessionStorage guardrail)
  const pricing = useMemo(
    () => getAdaptivePricing(valueState, { experimentVariant }),
    [valueState, experimentVariant],
  );

  // ── Impression recording ──────────────────────────────────────────────────

  const recordImpression = useCallback(async () => {
    try {
      const _tk = getToken();
      const resp = await fetch('/api/paywall/impression', {
        method:      'POST',
        headers:     { 'Content-Type': 'application/json', ...(_tk ? { Authorization: `Bearer ${_tk}` } : {}) },
        credentials: 'include',
        body: JSON.stringify({
          value_state:        valueState,
          price_shown:        pricing.priceMonthly,
          session_id:         getSessionId(),
          messaging_variant:  pricing.messaging?.valueFrame ?? null,
          cta_variant:        pricing.ctaVariant,
          trigger_type:       triggerType,
          guardrail_applied:  pricing.guardrailApplied,
          experiment_variant: experimentVariant,
        }),
      });
      const data = await resp.json();
      impressionIdRef.current = data.impression_id ?? null;
    } catch {
      // Non-critical — impression tracking should never break the paywall UI
    }
  }, [valueState, pricing, triggerType, experimentVariant]);

  const recordConverted = useCallback(async () => {
    if (!impressionIdRef.current) return;
    try {
      const _tk2 = getToken();
      await fetch(`/api/paywall/impression/${impressionIdRef.current}/converted`, {
        method: 'POST', credentials: 'include',
        headers: _tk2 ? { Authorization: `Bearer ${_tk2}` } : {},
      });
    } catch {}
  }, []);

  const recordDismissed = useCallback(async () => {
    if (!impressionIdRef.current) return;
    try {
      const _tk3 = getToken();
      await fetch(`/api/paywall/impression/${impressionIdRef.current}/dismissed`, {
        method: 'POST', credentials: 'include',
        headers: _tk3 ? { Authorization: `Bearer ${_tk3}` } : {},
      });
    } catch {}
  }, []);

  return {
    valueState,
    pricing,
    recordImpression,
    recordConverted,
    recordDismissed,
  };
}
