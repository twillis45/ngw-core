/**
 * ResultSymptomSuggestions
 * ========================
 * Surfaces up to 3 lighting symptom suggestions derived from signal flags.
 * Each suggestion is a tappable chip that navigates to the SymptomPage.
 * Fires 'symptom_suggested' on mount, 'symptom_clicked' per click.
 *
 * Props:
 *   symptoms  — string[] of symptom slugs from getSymptomsFromSignals()
 *   patternId — string — current pattern identifier (for analytics context)
 *   onSymptom — fn(slug) — callback when user taps a symptom
 */
import { useEffect } from 'react';
import { trackEvent } from '../../data/analytics';
import { getSymptomBySlug } from '../../data/symptoms';

export default function ResultSymptomSuggestions({ symptoms, patternId, onSymptom }) {
  if (!symptoms || symptoms.length === 0) return null;

  const defs = symptoms.map(s => getSymptomBySlug(s)).filter(Boolean);
  if (defs.length === 0) return null;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    trackEvent('symptom_suggested', {
      pattern:  patternId,
      symptoms: symptoms,
      count:    symptoms.length,
    });
  }, []);

  function handleClick(slug) {
    trackEvent('symptom_clicked', {
      pattern:  patternId,
      symptom:  slug,
    });
    if (onSymptom) onSymptom(slug);
  }

  return (
    <div className="rss">
      <div className="rss__header">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning)"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <span className="rss__label">Issues detected in this image</span>
      </div>
      <div className="rss__chips">
        {defs.map(def => (
          <button
            key={def.slug}
            className="rss__chip"
            onClick={() => handleClick(def.slug)}
            type="button"
          >
            <span className="rss__chip-icon">{def.icon}</span>
            <span className="rss__chip-title">{def.title}</span>
            <span className="rss__chip-tagline">{def.tagline}</span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ marginLeft: 'auto', flexShrink: 0 }}>
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}
