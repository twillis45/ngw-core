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
import { getActiveInGroup, getAllFlags, getSessionId } from '../data/flagsStore';
import { VALUE_FRAMES, getPaywallConfig } from '../data/pricingStore';
import UpgradePrompt from './UpgradePrompt';

export default function PaywallGate({
  isPaid,
  onUnlock,
  paywallType,
  headline,
  bullets,
  ctaText,
  preview = true,
  children,
}) {
  const [bypassed, setBypassed] = useState(false);

  const paywallCfg = getPaywallConfig();
  const effectiveType = paywallType || paywallCfg.type || 'hard';

  const activeCTA = getActiveInGroup('cta_messaging');
  const frame = activeCTA?.config?.value_frame || 'confidence';
  const frameData = VALUE_FRAMES[frame] || VALUE_FRAMES.confidence;

  const effectiveHeadline = headline || frameData.headline;
  const effectiveBullets = bullets || frameData.bullets;

  const pricingFlag = getActiveInGroup('pricing');
  const paywallFlag = getActiveInGroup('paywall_timing');

  useEffect(() => {
    if (isPaid) return;

    if (pricingFlag) trackExposure(pricingFlag.name, 'treatment');
    if (paywallFlag) trackExposure(paywallFlag.name, 'treatment');

    trackEvent('PAYWALL_TRIGGERED', {
      trigger: 'inline',
      type: effectiveType,
      frame,
      pricing_flag: pricingFlag?.name || 'default',
      paywall_flag: paywallFlag?.name || 'default',
    });

    // Attribute to all active pricing + paywall experiments
    const sid = getSessionId();
    for (const [flagName, def] of Object.entries(getAllFlags())) {
      if (!def.enabled) continue;
      if (def.group !== 'pricing' && def.group !== 'paywall_timing') continue;
      fetch('/api/experiments/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sid,
          flag_name: flagName,
          variant: def.variant,
          event_name: 'PAYWALL_TRIGGERED',
          data: { type: effectiveType },
        }),
      }).catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (isPaid) return <>{children}</>;
  if (effectiveType === 'soft' && bypassed) return <>{children}</>;

  function handleUnlock() {
    trackEvent('UPGRADE_CLICKED', { headline: effectiveHeadline, frame, type: effectiveType });
    broadcastConversion('UPGRADE_CLICKED', { frame, type: effectiveType });
    onUnlock?.();
  }

  function handleBypass() {
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
            ctaText={ctaText}
            compact
          />
        </div>
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
        ctaText={ctaText}
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
    </div>
  );
}
