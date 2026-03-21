/**
 * ResultPatternComparePrompt
 * ==========================
 * Shown when confidence is low (< 0.65) AND alternatives exist.
 * Invites the user to compare the top alternatives in Shoot Mode.
 * Fires 'compare_prompt_shown' on mount, 'compare_prompt_clicked' on CTA.
 *
 * Props:
 *   bestMatch    — result.bestMatch
 *   alternatives — result.alternatives (array of { name, lightingPattern, reliabilityScore })
 *   onCompare    — callback when user clicks Compare button
 */
import { useEffect } from 'react';
import { trackEvent } from '../../data/analytics';

export default function ResultPatternComparePrompt({ bestMatch, alternatives, onCompare }) {
  const score = bestMatch?.reliabilityScore ?? 1;

  // Only render when confidence is low and there are alternatives
  if (score >= 0.65 || !alternatives || alternatives.length === 0) return null;

  const top = alternatives[0];
  const topScore = Math.round((top?.reliabilityScore ?? 0) * 100);
  const bestScore = Math.round(score * 100);

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    trackEvent('compare_prompt_shown', {
      pattern:      bestMatch?.lightingPattern,
      score:        bestScore,
      alt_pattern:  top?.lightingPattern,
      alt_score:    topScore,
    });
  }, []);

  function handleCompare() {
    trackEvent('compare_prompt_clicked', {
      pattern:     bestMatch?.lightingPattern,
      alt_pattern: top?.lightingPattern,
    });
    if (onCompare) onCompare(top);
  }

  return (
    <div className="rcp">
      <div className="rcp__icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
      </div>
      <div className="rcp__content">
        <p className="rcp__headline">Not sure which pattern fits?</p>
        <p className="rcp__body">
          <strong>{bestMatch?.name ?? bestMatch?.lightingPattern}</strong> ({bestScore}%) and{' '}
          <strong>{top.name ?? top.lightingPattern}</strong> ({topScore}%) are very close.
          Compare them live in Shoot Mode.
        </p>
      </div>
      <button className="rcp__cta" onClick={handleCompare} type="button">
        Compare Patterns
      </button>
    </div>
  );
}
