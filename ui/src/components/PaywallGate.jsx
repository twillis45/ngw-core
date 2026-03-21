/**
 * PaywallGate — blurs and locks paid content behind an upgrade prompt.
 *
 * Props:
 *   isPaid     — boolean, from usePaywall()
 *   onUnlock   — called when user taps upgrade CTA
 *   headline   — upgrade prompt headline
 *   bullets    — what's included in the upgrade
 *   preview    — if true, show a blurred preview of children; if false, hide entirely
 *   children   — the gated content
 */

import { useEffect } from 'react';
import { trackEvent } from '../data/analytics';
import UpgradePrompt from './UpgradePrompt';

export default function PaywallGate({
  isPaid,
  onUnlock,
  headline = 'Build this exactly — positions, modifiers, power ratios.',
  bullets,
  ctaText,
  preview = true,
  children,
}) {
  useEffect(() => {
    if (!isPaid) trackEvent('PAYWALL_TRIGGERED', { trigger: 'inline' });
  }, []);

  if (isPaid) return <>{children}</>;

  const defaultBullets = bullets || [
    'Precise light positions and angles for this pattern',
    'Power ratios dialled in — stop adjusting between takes',
    'Modifier specs and distance callouts',
    'Camera settings optimised for this setup',
    'Founders access — $39 one-time. Price increases as seats fill.',
  ];

  return (
    <div className="paywall-gate">
      {preview && (
        <div className="paywall-gate__preview" aria-hidden="true">
          {children}
          <div className="paywall-gate__blur-overlay" />
        </div>
      )}
      <UpgradePrompt
        headline={headline}
        bullets={defaultBullets}
        onUnlock={onUnlock}
        ctaText={ctaText}
      />
    </div>
  );
}
