/**
 * usePaywallTrigger — manages the active paywall gate for this session.
 *
 * Returns:
 *   activeGate          — null | { trigger, paywallType, copyVariant }
 *   fireGate(event)     — evaluate and set the active gate for a given event
 *   dismissGate()       — fires PAYWALL_DISMISSED, clears gate
 *   bypassGate()        — fires PAYWALL_BYPASSED, clears gate (soft only)
 */

import { useState, useCallback } from 'react';
import { evaluatePaywallTrigger, markSuccessMomentShown, TRIGGER } from '../data/paywallTrigger';
import { trackEvent } from '../data/analytics';
import { broadcastConversion, trackExposure } from '../data/experimentTracker';
import { getActiveInGroup } from '../data/flagsStore';

export default function usePaywallTrigger({ isPaid, analysisCount }) {
  const [activeGate, setActiveGate] = useState(null);
  const [gateOpenedAt, setGateOpenedAt] = useState(null);

  const fireGate = useCallback((event) => {
    const gate = evaluatePaywallTrigger({ isPaid, analysisCount, event });
    if (!gate) return;

    setActiveGate(gate);
    setGateOpenedAt(Date.now());

    // Track exposure for all relevant flag groups
    const pricingFlag  = getActiveInGroup('pricing');
    const paywallFlag  = getActiveInGroup('paywall_timing');
    const ctaFlag      = getActiveInGroup('cta_messaging');
    if (pricingFlag)  trackExposure(pricingFlag.name, 'treatment');
    if (paywallFlag)  trackExposure(paywallFlag.name, 'treatment');
    if (ctaFlag)      trackExposure(ctaFlag.name, 'treatment');

    trackEvent('PAYWALL_TRIGGERED', {
      trigger: gate.trigger,
      type: gate.paywallType,
      analysis_count: analysisCount,
      pricing_flag: pricingFlag?.name || 'default',
      paywall_flag: paywallFlag?.name || 'default',
    });
  }, [isPaid, analysisCount]);

  const dismissGate = useCallback(() => {
    if (!activeGate) return;
    const elapsed = gateOpenedAt ? Date.now() - gateOpenedAt : null;
    trackEvent('PAYWALL_DISMISSED', {
      trigger: activeGate.trigger,
      type: activeGate.paywallType,
      time_to_dismiss_ms: elapsed,
    });
    setActiveGate(null);
    setGateOpenedAt(null);
  }, [activeGate, gateOpenedAt]);

  const bypassGate = useCallback(() => {
    if (!activeGate) return;
    trackEvent('PAYWALL_BYPASSED', {
      trigger: activeGate.trigger,
      type: activeGate.paywallType,
    });
    setActiveGate(null);
    setGateOpenedAt(null);
  }, [activeGate]);

  const handleUpgrade = useCallback(() => {
    broadcastConversion('UPGRADE_CLICKED', {
      trigger: activeGate?.trigger,
      type: activeGate?.paywallType,
    });
  }, [activeGate]);

  return { activeGate, fireGate, dismissGate, bypassGate, handleUpgrade };
}
