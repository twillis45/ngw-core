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

import { useEffect } from 'react';
import { trackEvent } from '../data/analytics';
import { broadcastConversion, trackExposure } from '../data/experimentTracker';
import { getActiveInGroup } from '../data/flagsStore';
import { getActivePricing } from '../data/pricingStore';
import { markSuccessMomentShown } from '../data/paywallTrigger';

export default function SuccessMomentPaywall({ onUnlock, onDismiss, pattern }) {
  const pricing = getActivePricing();
  const ctaText = `Unlock Full Access — $${pricing.price_monthly}/mo`;

  const patternLabel = pattern
    ? pattern.charAt(0).toUpperCase() + pattern.slice(1).replace(/_/g, ' ')
    : null;

  useEffect(() => {
    markSuccessMomentShown();

    const pricingFlag = getActiveInGroup('pricing');
    const paywallFlag = getActiveInGroup('paywall_timing');
    if (pricingFlag) trackExposure(pricingFlag.name, 'treatment');
    if (paywallFlag) trackExposure(paywallFlag.name, 'treatment');

    trackEvent('PAYWALL_TRIGGERED', {
      trigger: 'success_moment',
      type: 'value_triggered',
      pricing_flag: pricingFlag?.name || 'default',
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleUnlock() {
    trackEvent('UPGRADE_CLICKED', { trigger: 'success_moment', type: 'value_triggered' });
    broadcastConversion('UPGRADE_CLICKED', { trigger: 'success_moment' });
    onUnlock?.();
  }

  function handleDismiss() {
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

        {/* Headline */}
        <h2 className="success-paywall__headline">
          That's the shot.
        </h2>

        {/* Context line */}
        {patternLabel ? (
          <p className="success-paywall__sub">
            You just nailed a {patternLabel} setup.
            Lock in every setup like this.
          </p>
        ) : (
          <p className="success-paywall__sub">
            Unlock every setup this precise — every time.
          </p>
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
        {pricing.price_yearly && (
          <p className="success-paywall__yearly">
            Save {pricing.yearly_discount_pct || 20}% · Pay yearly
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
    </div>
  );
}
