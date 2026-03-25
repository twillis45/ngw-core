/**
 * PaywallGate — flag-driven paywall with variant-aware copy and type.
 *
 * Supports four paywall types (from flags):
 *   hard            — blur + block, no bypass
 *   soft            — blur + "Continue anyway" once
 *   value_triggered — fires after a success moment (same as hard visually)
 *   nudge           — non-blocking inline prompt, no blur
 *
 * Copy and bullets come from the active value_frame experiment.
 * Pricing attribution wired to experiment tracker for A/B metrics.
 *
 * Props:
 *   isPaid      — boolean from usePaywall()
 *   onUnlock    — called when user taps upgrade CTA
 *   paywallType — override type ('hard'|'soft'|'nudge') — default from flags
 *   headline    — override headline
 *   bullets     — override bullets array
 *   ctaText     — override CTA button text
 *   preview     — show blurred preview behind gate (default true)
 *   children    — the gated content
 */

import { useEffect, useState } from 'react';
import { trackEvent } from '../data/analytics';
import { broadcastConversion, trackExposure } from '../data/experimentTracker';
import { getActiveInGroup } from '../data/flagsStore';
import { VALUE_FRAMES, getPaywallConfig } from '../data/pricingStore';
import { useAdaptivePaywall } from '../hooks/useAdaptivePaywall';
import PricingScreen from './PricingScreen';
import UpgradePrompt from './UpgradePrompt';

/**
 * PaywallGate — Part 16.6 updated
 * Now uses adaptive pricing via useAdaptivePaywall hook.
 * Dynamic: headline, subheadline, CTA, price all adapt to value state.
 * Static:  trust indicators, feature summary, comparison table (in PricingScreen).
 *
 * Props:
 *   isPaid       — boolean from usePaywall()
 *   onUnlock     — called when user taps upgrade CTA
 *   paywallType  — override type ('hard'|'soft'|'nudge') — default from flags
 *   recentOutcome — 'nailed_it' | 'missed_it' | null — drives value state
 *   usageCount   — number of analyses this session
 *   headline     — override headline (falls back to adaptive)
 *   bullets      — override bullets array (falls back to frame defaults)
 *   ctaText      — override CTA button text (falls back to adaptive)
 *   preview      — show blurred preview behind gate (default true)
 *   children     — the gated content
 */
export default function PaywallGate({
  isPaid,
  onUnlock,
  paywallType,
  recentOutcome = null,
  usageCount    = 0,
  headline,
  bullets,
  ctaText,
  preview = true,
  children,
}) {
  const [bypassed, setBypassed] = useState(false);
  const [showPricing, setShowPricing] = useState(false);

  const paywallCfg = getPaywallConfig();
  const effectiveType = paywallType || paywallCfg.type || 'hard';

  // Adaptive pricing hook — drives headline, CTA, price
  const { pricing, recordImpression, recordConverted, recordDismissed } = useAdaptivePaywall({
    recentOutcome,
    usageCount,
    triggerType: effectiveType,
  });

  // Fallback to static value frames if no override and adaptive not yet computed
  const activeCTA = getActiveInGroup('cta_messaging');
  const frame = activeCTA?.config?.value_frame || 'confidence';
  const frameData = VALUE_FRAMES[frame] || VALUE_FRAMES.confidence;

  const effectiveHeadline = headline || pricing.messaging?.headline || frameData.headline;
  const effectiveBullets  = bullets || frameData.bullets;
  const effectiveCTA      = ctaText || pricing.messaging?.cta || `Unlock Full Access — $${pricing.priceMonthly}/mo`;

  const pricingFlag = getActiveInGroup('pricing');
  const paywallFlag = getActiveInGroup('paywall_timing');

  useEffect(() => {
    if (isPaid) return;

    recordImpression();

    if (pricingFlag) trackExposure(pricingFlag.name, 'treatment');
    if (paywallFlag) trackExposure(paywallFlag.name, 'treatment');

    const triggerData = {
      trigger:      'inline',
      type:         effectiveType,
      frame,
      value_state:  pricing.state,
      price:        pricing.priceMonthly,
      pricing_flag: pricingFlag?.name || 'default',
      paywall_flag: paywallFlag?.name || 'default',
    };
    trackEvent('PAYWALL_TRIGGERED', triggerData);
    broadcastConversion('PAYWALL_TRIGGERED', triggerData, ['pricing', 'paywall_timing', 'cta_messaging']);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (isPaid) return <>{children}</>;
  if (effectiveType === 'soft' && bypassed) return <>{children}</>;

  function handleUnlock() {
    recordConverted();
    trackEvent('UPGRADE_CLICKED', { headline: effectiveHeadline, frame, type: effectiveType,
                                    value_state: pricing.state, price: pricing.priceMonthly });
    broadcastConversion('UPGRADE_CLICKED', { frame, type: effectiveType, price: pricing.priceMonthly });
    setShowPricing(true);
  }

  function handlePricingUnlock(plan) {
    setShowPricing(false);
    onUnlock?.();
  }

  function handleBypass() {
    recordDismissed();
    trackEvent('PAYWALL_BYPASSED', { type: 'soft', frame });
    setBypassed(true);
  }

  // Nudge: non-blocking — still shows children
  if (effectiveType === 'nudge') {
    return (
      <div className="paywall-gate paywall-gate--nudge">
        {children}
        <div className="paywall-gate__nudge">
          <UpgradePrompt
            headline={effectiveHeadline}
            bullets={effectiveBullets}
            onUnlock={handleUnlock}
            ctaText={effectiveCTA}
            compact
          />
        </div>
        {showPricing && (
          <PricingScreen
            trigger={effectiveType}
            source="PaywallGate"
            onClose={() => setShowPricing(false)}
            onUnlock={handlePricingUnlock}
          />
        )}
      </div>
    );
  }

  return (
    <div className="paywall-gate">
      {preview && (
        <div className="paywall-gate__preview" aria-hidden="true">
          {children}
          <div className="paywall-gate__blur-overlay" />
        </div>
      )}
      <UpgradePrompt
        headline={effectiveHeadline}
        bullets={effectiveBullets}
        onUnlock={handleUnlock}
        ctaText={effectiveCTA}
      />
      {effectiveType === 'soft' && (
        <button
          className="paywall-gate__bypass"
          onClick={handleBypass}
          type="button"
        >
          Continue without upgrading →
        </button>
      )}
      {showPricing && (
        <PricingScreen
          trigger={effectiveType}
          source="PaywallGate"
          onClose={() => setShowPricing(false)}
          onUnlock={handlePricingUnlock}
        />
      )}
    </div>
  );
}
