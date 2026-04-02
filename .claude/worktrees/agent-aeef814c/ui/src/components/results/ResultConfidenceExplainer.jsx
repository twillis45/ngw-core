/**
 * ResultConfidenceExplainer
 * =========================
 * Expandable panel that explains why the engine is confident or uncertain.
 * Shows strong signals detected, weak signals, and a plain-language summary.
 * Fires 'confidence_explainer_opened' on expand.
 *
 * Props:
 *   bestMatch         — result.bestMatch ({ reliabilityScore, lightingPattern, name })
 *   signalReliability — result.signalReliability
 *   edgeCaseFlags     — result.edgeCaseFlags
 */
import { useState } from 'react';
import { trackEvent } from '../../data/analytics';

const CONFIDENCE_LEVELS = [
  { min: 0.85, label: 'High Confidence',     color: 'var(--color-success)',  bg: 'var(--color-success-subtle)' },
  { min: 0.65, label: 'Good Confidence',     color: 'var(--color-success)',  bg: 'var(--color-success-subtle)' },
  { min: 0.45, label: 'Moderate Confidence', color: 'var(--color-warning)',  bg: 'var(--color-warning-subtle)' },
  { min: 0,    label: 'Low Confidence',      color: 'var(--color-error)',    bg: 'var(--color-error-subtle)'   },
];

function getLevel(score) {
  return CONFIDENCE_LEVELS.find(l => score >= l.min) || CONFIDENCE_LEVELS[CONFIDENCE_LEVELS.length - 1];
}

/** Human-readable label for each signal key. */
const SIGNAL_LABELS = {
  catchlight_position:        'Catchlight position',
  shadow_direction:           'Shadow direction',
  nose_shadow_shape:          'Nose shadow shape',
  shadow_edge_quality:        'Shadow edge softness',
  highlight_side:             'Key-light side',
  face_detected:              'Face clearly visible',
  color_temperature_detected: 'Color temperature signal',
  specular_highlight:         'Specular highlight detail',
  background_brightness:      'Background brightness',
  skin_tone_gradient:         'Skin tone gradient',
};

/** Edge case flag labels. */
const FLAG_LABELS = {
  blown_highlights:        'Blown highlights detected',
  mixed_color_temperature: 'Mixed color temperatures',
  outdoor_foliage_shadows: 'Outdoor foliage shadows',
  window_light_gradient:   'Window light gradient',
  extreme_low_key:         'Extreme low-key exposure',
  bw_processing:           'Black & white image',
  no_face:                 'No face detected',
};

function ConfidenceBar({ score }) {
  const pct = Math.round(score * 100);
  const level = getLevel(score);
  return (
    <div className="rce__bar-wrap">
      <div className="rce__bar-track">
        <div
          className="rce__bar-fill"
          style={{ width: `${pct}%`, background: level.color }}
        />
      </div>
      <span className="rce__bar-label" style={{ color: level.color }}>{pct}%</span>
    </div>
  );
}

export default function ResultConfidenceExplainer({ bestMatch, signalReliability, edgeCaseFlags }) {
  const [open, setOpen] = useState(false);

  const rawScore = bestMatch?.reliabilityScore ?? 0;
  const score    = rawScore > 1 ? rawScore / 100 : rawScore;
  const pattern = bestMatch?.lightingPattern  ?? '';
  const level   = getLevel(score);

  const signals  = signalReliability?.signalsAvailable   ?? [];
  const total    = signalReliability?.signalsTotal        ?? 0;
  const strength = signalReliability?.overallSignalStrength ?? score;

  const activeFlags = edgeCaseFlags
    ? Object.entries(edgeCaseFlags).filter(([, v]) => v).map(([k]) => k)
    : [];

  function handleToggle() {
    if (!open) {
      trackEvent('confidence_explainer_opened', {
        pattern,
        score: Math.round(score * 100),
        signal_strength: Math.round(strength * 100),
        flags: activeFlags,
      });
    }
    setOpen(v => !v);
  }

  // Determine summary copy based on score
  let summary;
  if (score >= 0.85) {
    summary = `Strong signal — the engine found clear, consistent lighting cues that point to ${pattern || 'this pattern'} with high certainty.`;
  } else if (score >= 0.65) {
    summary = `Good signal — most lighting cues point to ${pattern || 'this pattern'}, though one or two signals were weaker than ideal.`;
  } else if (score >= 0.45) {
    summary = `Moderate signal — some lighting cues match ${pattern || 'this pattern'}, but several are unclear or conflicting. Treat this as a starting point.`;
  } else {
    summary = `Low signal — the engine couldn't find enough clear cues to commit to ${pattern || 'a pattern'} with confidence. See suggestions below.`;
  }

  return (
    <div className="rce" style={{ borderColor: level.bg }}>
      {/* Header row — always visible */}
      <button className="rce__header" onClick={handleToggle} type="button" aria-expanded={open}>
        <div className="rce__header-left">
          <span className="rce__badge" style={{ color: level.color, background: level.bg }}>
            {level.label}
          </span>
          <ConfidenceBar score={score} />
        </div>
        <svg
          className={`rce__chevron${open ? ' rce__chevron--open' : ''}`}
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {/* Expanded panel */}
      {open && (
        <div className="rce__body">
          <p className="rce__summary">{summary}</p>

          {/* Strong signals */}
          {signals.length > 0 && (
            <div className="rce__group">
              <div className="rce__group-label">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)"
                  strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5 }}>
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Signals detected ({signals.length}/{total})
              </div>
              <div className="rce__signals">
                {signals.map(sig => (
                  <span key={sig} className="rce__signal rce__signal--strong">
                    {SIGNAL_LABELS[sig] || sig.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Active edge-case flags */}
          {activeFlags.length > 0 && (
            <div className="rce__group">
              <div className="rce__group-label rce__group-label--warn">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning)"
                  strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 5 }}>
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                Factors that reduce accuracy
              </div>
              <div className="rce__signals">
                {activeFlags.map(f => (
                  <span key={f} className="rce__signal rce__signal--warn">
                    {FLAG_LABELS[f] || f.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            </div>
          )}

          {score < 0.65 && (
            <p className="rce__tip">
              Tip: Upload a sharper, well-exposed reference image with the face clearly visible to increase accuracy.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
