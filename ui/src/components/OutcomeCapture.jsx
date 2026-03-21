/**
 * OutcomeCapture — "Did you get the shot?"
 *
 * The most important UI in the learning system.
 * Every click here is ground truth that feeds:
 *   - Pattern success rates
 *   - Confidence calibration
 *   - Blueprint accuracy
 *   - Revenue optimization
 *
 * Renders as a persistent card on the Results screen.
 * Once tapped: shows confirmation, cannot be changed.
 * If user leaves without tapping: caller should fire sendSignal(null).
 */
import { useState } from 'react';

const OUTCOMES = [
  {
    id:    'nailed_it',
    label: 'Nailed It',
    sub:   'Got the shot',
    icon:  '✓',
    cls:   'oc-btn--success',
  },
  {
    id:    'close',
    label: 'Close',
    sub:   'Almost there',
    icon:  '~',
    cls:   'oc-btn--close',
  },
  {
    id:    'failed',
    label: 'Didn\'t Work',
    sub:   'Needs fixing',
    icon:  '✕',
    cls:   'oc-btn--fail',
  },
];

const CONFIRM_COPY = {
  nailed_it: { headline: 'Great — noted!',    sub: 'This helps us nail this pattern for everyone.' },
  close:      { headline: 'Almost there.',    sub: 'We\'ll tune the guidance for this setup.' },
  failed:     { headline: 'Noted. We\'ll fix it.', sub: 'Failures teach the most. This is logged.' },
};

/**
 * @param {Function} onOutcome   — called with 'nailed_it' | 'close' | 'failed'
 * @param {boolean}  [loading]   — shows spinner while signal is in-flight
 * @param {string}   [sent]      — outcome already recorded (pre-filled state)
 * @param {boolean}  [compact]   — smaller inline variant (no card chrome)
 */
export default function OutcomeCapture({ onOutcome, loading = false, sent = null, compact = false }) {
  const [selected, setSelected] = useState(sent);

  function handleClick(outcomeId) {
    if (selected || loading) return;
    setSelected(outcomeId);
    onOutcome(outcomeId);
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
      <div className="oc-prompt">Did you get the shot?</div>
      <div className="oc-sub">Your feedback trains the system</div>
      <div className="oc-btns">
        {OUTCOMES.map(o => (
          <button
            key={o.id}
            className={`oc-btn ${o.cls} ${loading ? 'oc-btn--loading' : ''}`}
            onClick={() => handleClick(o.id)}
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
