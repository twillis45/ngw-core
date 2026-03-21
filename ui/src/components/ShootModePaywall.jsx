/**
 * ShootModePaywall — outcome-driven paywall for Shoot Mode.
 *
 * Copy and bullets are fixed per spec — no props needed for them.
 * The caller controls the trigger variant, which surfaces the
 * friction line that led the user here.
 *
 * Variants:
 *   default       — entry gate / generic
 *   first_attempt — "You're 2–3 adjustments away from nailing this."
 *   overlay       — "Unlock live guidance to place your light exactly."
 *   struggle      — "You're adjusting blindly right now."
 */

import { useEffect } from 'react';
import { trackEvent } from '../data/analytics';

const TRIGGER_COPY = {
  first_attempt: "You're 2–3 adjustments away from nailing this.",
  overlay:       'Unlock live guidance to place your light exactly.',
  struggle:      "You're adjusting blindly right now.",
};

const TRIGGER_CTA = {
  first_attempt: 'Recreate This Shot',
  overlay:       'Unlock Live Guidance',
  struggle:      'Fix This in Real Time',
};

export default function ShootModePaywall({ onUnlock, onClose, variant = 'default' }) {
  const triggerLine = TRIGGER_COPY[variant] || null;
  const ctaLabel    = TRIGGER_CTA[variant]  || 'Unlock Shoot Mode';

  useEffect(() => {
    trackEvent('PAYWALL_TRIGGERED', { trigger: 'shoot_mode', variant });
  }, []);

  function handleUnlock() {
    trackEvent('UPGRADE_CLICKED', {
      headline: 'Match this shot — not guess it',
      variant,
    });
    onUnlock();
  }

  return (
    <div className="sm-paywall-overlay" onClick={onClose}>
      <div className="sm-paywall" onClick={e => e.stopPropagation()}>

        {onClose && (
          <button
            className="sm-paywall__close"
            onClick={onClose}
            type="button"
            aria-label="Close"
          >
            ✕
          </button>
        )}

        {/* Lock icon */}
        <div className="sm-paywall__icon" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0110 0v4"/>
          </svg>
        </div>

        {/* Friction line — surfaces what led the user here */}
        {triggerLine && (
          <p className="sm-paywall__trigger">{triggerLine}</p>
        )}

        {/* Headline — outcome, not feature */}
        <h2 className="sm-paywall__headline">
          Match this shot —<br />not guess it
        </h2>

        {/* Bullets — all outcome language */}
        <ul className="sm-paywall__bullets">
          <li>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Place your light exactly
          </li>
          <li>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            See what to fix in real time
          </li>
          <li>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Get the shot faster
          </li>
        </ul>

        <button
          className="sm-paywall__cta"
          onClick={handleUnlock}
          type="button"
        >
          {ctaLabel}
        </button>

      </div>
    </div>
  );
}
