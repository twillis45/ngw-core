/**
 * OutcomeCapture — "Did you nail it?"
 *
 * The most important UI in the learning system.
 * Every click here is ground truth that feeds:
 *   - Pattern success rates
 *   - Confidence calibration
 *   - Blueprint accuracy
 *   - Revenue optimization
 *
 * Merged with FeedbackCard — this is the single, definitive outcome signal.
 * Renders as a persistent section on the Results screen and after shoot-mode lock.
 * Once tapped: shows confirmation, cannot be changed.
 * If user leaves without tapping: caller should fire sendSignal(null).
 */
import { useState } from 'react';
import { saveFeedback } from '../data/feedbackStore';

const OUTCOMES = [
  {
    id:     'nailed_it',
    label:  'Nailed It',
    sub:    'Shot locked',
    icon:   '✓',
    cls:    'oc-btn--success',
    rating: 'perfect',
  },
  {
    id:     'close',
    label:  'Almost',
    sub:    'Close enough',
    icon:   '~',
    cls:    'oc-btn--close',
    rating: 'tweaks',
  },
  {
    id:     'failed',
    label:  'Off',
    sub:    'Needs work',
    icon:   '✕',
    cls:    'oc-btn--fail',
    rating: 'didnt_work',
  },
];

// Viral confirmation copy — personality that makes the app feel alive
const CONFIRM_COPY = {
  nailed_it: {
    headline: 'Nailed it.',
    sub: 'That\'s a pattern confirmed. Every shot you lock makes this better for everyone.',
  },
  close:  {
    headline: 'Almost — we\'ll tune it.',
    sub: 'Close is data too. This helps calibrate the guidance for this setup.',
  },
  failed: {
    headline: 'Logged. We\'ll fix it.',
    sub: 'Failures teach the most. This one goes straight into the refinement queue.',
  },
};

/**
 * @param {Function} onOutcome   — called with 'nailed_it' | 'close' | 'failed'
 * @param {boolean}  [loading]   — shows spinner while signal is in-flight
 * @param {string}   [sent]      — outcome already recorded (pre-filled state)
 * @param {boolean}  [compact]   — smaller inline variant (no card chrome)
 * @param {string}   [setupId]   — passed to feedbackStore
 * @param {string}   [mood]      — passed to feedbackStore
 * @param {string}   [pattern]   — passed to feedbackStore
 */
export default function OutcomeCapture({
  onOutcome, loading = false, sent = null, compact = false,
  setupId = null, mood = null, pattern = null,
}) {
  const [selected, setSelected] = useState(sent);

  function handleClick(outcome) {
    if (selected || loading) return;
    setSelected(outcome.id);
    // Persist to local feedback store (offline-capable record)
    saveFeedback({ setupId, mood, pattern, rating: outcome.rating });
    // Fire parent signal (analytics / learning backend)
    if (onOutcome) onOutcome(outcome.id);
  }

  if (selected) {
    const copy = CONFIRM_COPY[selected] || CONFIRM_COPY.nailed_it;
    const outcome = OUTCOMES.find(o => o.id === selected);
    return (
      <div className={`oc-wrap oc-wrap--done ${compact ? 'oc-wrap--compact' : ''}`}>
        <div className={`oc-confirm ${outcome?.cls || ''}`}>
          <span className="oc-confirm__icon">{outcome?.icon}</span>
          <div className="oc-confirm__text">
            <span className="oc-confirm__headline">{copy.headline}</span>
            <span className="oc-confirm__sub">{copy.sub}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`oc-wrap ${compact ? 'oc-wrap--compact' : ''}`}>
      <div className="oc-prompt">Did you nail it?</div>
      <div className="oc-sub">Your answer trains the system — takes 1 second</div>
      <div className="oc-btns">
        {OUTCOMES.map(o => (
          <button
            key={o.id}
            className={`oc-btn ${o.cls} ${loading ? 'oc-btn--loading' : ''}`}
            onClick={() => handleClick(o)}
            disabled={loading}
          >
            <span className="oc-btn__icon">{o.icon}</span>
            <span className="oc-btn__label">{o.label}</span>
            <span className="oc-btn__sub">{o.sub}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
