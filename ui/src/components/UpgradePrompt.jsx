/**
 * UpgradePrompt — inline conversion block shown at paywall gate points.
 *
 * Props:
 *   headline   — main hook line (varies per context)
 *   bullets    — string[] of what's unlocked
 *   onUnlock   — called when user taps the CTA
 *   variant    — 'default' | 'compact' | 'modal'
 */

import { trackEvent } from '../data/analytics';

export default function UpgradePrompt({ headline, bullets, onUnlock, ctaText = 'Founders Access — $39', variant = 'default' }) {
  return (
    <div className={`upgrade-prompt upgrade-prompt--${variant}`}>
      <div className="upgrade-prompt__icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0110 0v4"/>
        </svg>
      </div>

      <div className="upgrade-prompt__body">
        <p className="upgrade-prompt__headline">{headline}</p>

        {bullets && bullets.length > 0 && (
          <ul className="upgrade-prompt__bullets">
            {bullets.map((b, i) => (
              <li key={i}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                {b}
              </li>
            ))}
          </ul>
        )}
      </div>

      <button className="upgrade-prompt__cta" onClick={() => { trackEvent('UPGRADE_CLICKED', { headline }); onUnlock?.(); }} type="button">
        {ctaText}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </button>
    </div>
  );
}
