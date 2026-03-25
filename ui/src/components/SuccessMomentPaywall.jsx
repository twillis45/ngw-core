/**
 * SuccessMomentPaywall — value_triggered paywall fired after a "nailed it" moment.
 *
 * This is the highest-intent paywall gate. It fires after the user confirms
 * a good result (saves a setup or taps "Nailed it"). No blur — the user has
 * already seen the result; this is celebratory, not blocking.
 *
 * Props:
 *   onUnlock   — called when user taps the upgrade CTA
 *   onDismiss  — called when user dismisses (fires PAYWALL_DISMISSED upstream)
 *   pattern    — string — the lighting pattern they just nailed (e.g. "Rembrandt")
 */

import { useEffect, useState } from 'react';
import { trackEvent } from '../data/analytics';
import { broadcastConversion, trackExposure } from '../data/experimentTracker';
import { getActiveInGroup } from '../data/flagsStore';
import { markSuccessMomentShown } from '../data/paywallTrigger';
import { useAdaptivePaywall } from '../hooks/useAdaptivePaywall';
import PricingScreen from './PricingScreen';

/**
 * SuccessMomentPaywall — Part 16.6
 * Uses adaptive pricing: SUCCESS_MOMENT state → $59, outcome-anchor messaging.
 *
 * Props:
 *   onUnlock    — called when user taps the upgrade CTA
 *   onDismiss   — called when user dismisses
 *   pattern     — string — the lighting pattern they just nailed (e.g. "Rembrandt")
 *   usageCount  — number of analyses this session (for state detection)
 */
export default function SuccessMomentPaywall({ onUnlock, onDismiss, pattern, usageCount = 0 }) {
  const { pricing, recordImpression, recordConverted, recordDismissed } = useAdaptivePaywall({
    recentOutcome: 'nailed_it',
    usageCount,
    triggerType: 'success_moment',
  });

  const ctaText = pricing.messaging?.cta || `Keep This Result — $${pricing.priceMonthly}/mo`;
  const headline = pricing.messaging?.headline || 'You just nailed it — make it repeatable';
  const subheadline = pricing.messaging?.subheadline || 'Save this exact setup. Reproduce it on every shoot.';
  const urgency = pricing.messaging?.urgency || null;

  const [showPricing, setShowPricing] = useState(false);

  const patternLabel = pattern
    ? pattern.charAt(0).toUpperCase() + pattern.slice(1).replace(/_/g, ' ')
    : null;

  useEffect(() => {
    markSuccessMomentShown();
    recordImpression();

    const pricingFlag = getActiveInGroup('pricing');
    const paywallFlag = getActiveInGroup('paywall_timing');
    if (pricingFlag) trackExposure(pricingFlag.name, 'treatment');
    if (paywallFlag) trackExposure(paywallFlag.name, 'treatment');

    trackEvent('PAYWALL_TRIGGERED', {
      trigger: 'success_moment',
      type: 'value_triggered',
      price: pricing.priceMonthly,
      value_state: 'success_moment',
      pricing_flag: pricingFlag?.name || 'default',
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleUnlock() {
    recordConverted();
    trackEvent('UPGRADE_CLICKED', { trigger: 'success_moment', type: 'value_triggered',
                                    price: pricing.priceMonthly });
    broadcastConversion('UPGRADE_CLICKED', { trigger: 'success_moment', price: pricing.priceMonthly });
    setShowPricing(true);
  }

  function handlePricingUnlock(plan) {
    setShowPricing(false);
    onUnlock?.(plan);
  }

  function handleDismiss() {
    recordDismissed();
    trackEvent('PAYWALL_DISMISSED', { trigger: 'success_moment', type: 'value_triggered' });
    onDismiss?.();
  }

  return (
    <div className="success-paywall-overlay" onClick={handleDismiss}>
      <div className="success-paywall" onClick={e => e.stopPropagation()}>

        {/* Gold lock icon */}
        <div className="success-paywall__icon" aria-hidden="true">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0110 0v4"/>
          </svg>
        </div>

        {/* Headline — adaptive (state-driven) */}
        <h2 className="success-paywall__headline">
          {headline}
        </h2>

        {/* Context line */}
        {patternLabel ? (
          <p className="success-paywall__sub">
            You just nailed a {patternLabel} setup.{' '}
            {subheadline}
          </p>
        ) : (
          <p className="success-paywall__sub">
            {subheadline}
          </p>
        )}

        {/* Urgency line (state-driven) */}
        {urgency && (
          <p className="success-paywall__urgency">{urgency}</p>
        )}

        {/* Bullets */}
        <ul className="success-paywall__bullets">
          {[
            'Full blueprints — exact positions and power ratios',
            'Recreate any reference image, light for light',
            'Shoot Mode — compare live, correct on set',
            'Every pattern, every modifier, optimised for your space',
          ].map((b, i) => (
            <li key={i}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5"
                strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              {b}
            </li>
          ))}
        </ul>

        {/* Primary CTA */}
        <button
          className="success-paywall__cta"
          onClick={handleUnlock}
          type="button"
        >
          {ctaText}
        </button>

        {/* Yearly badge */}
        {pricing.priceYearly && (
          <p className="success-paywall__yearly">
            Save {pricing.yearlyDiscountPct || 17}% · Pay yearly — ${pricing.priceYearly}/yr
          </p>
        )}

        {/* Soft dismiss */}
        <button
          className="success-paywall__dismiss"
          onClick={handleDismiss}
          type="button"
        >
          Continue without upgrading →
        </button>

      </div>

      {showPricing && (
        <PricingScreen
          trigger="success_moment"
          source="SuccessMomentPaywall"
          onClose={() => setShowPricing(false)}
          onUnlock={handlePricingUnlock}
        />
      )}
    </div>
  );
}
