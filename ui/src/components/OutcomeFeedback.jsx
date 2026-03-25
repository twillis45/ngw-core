/**
 * OutcomeFeedback — structured "why did it fail?" prompt.
 *
 * Appears ~600ms after the user selects "Off" in OutcomeCapture.
 * Gives the learning pipeline the signal it needs to classify whether
 * the failure was a misclassification, blueprint issue, or something else.
 *
 * UX principles:
 * - One tap, no required text
 * - Easy to dismiss (skip is valid — partial signal is still signal)
 * - Appears inline so it doesn't interrupt the results view
 */
import { useState } from 'react';

const REASONS = [
  {
    id:    'wrong_pattern',
    label: 'Wrong lighting type',
    sub:   'The pattern doesn\'t match my shot at all',
    icon:  '✕',
  },
  {
    id:    'blueprint_didnt_work',
    label: 'Setup didn\'t work',
    sub:   'Pattern seemed right, but following the steps failed',
    icon:  '⚙',
  },
  {
    id:    'couldnt_understand',
    label: 'Couldn\'t follow it',
    sub:   'Instructions were unclear or too hard to execute',
    icon:  '?',
  },
  {
    id:    'low_confidence_confirmed',
    label: 'System seemed unsure',
    sub:   'Weak confidence — I tried anyway',
    icon:  '~',
  },
];

/**
 * @param {string}   failureEventId  — ID returned by POST /api/failures/event
 * @param {string}   sessionId       — current session ID
 * @param {Function} onDone          — called when user picks reason or dismisses
 */
export default function OutcomeFeedback({ failureEventId, sessionId, onDone }) {
  const [sent, setSent] = useState(false);
  const [selected, setSelected] = useState(null);

  function handlePick(reason) {
    if (sent) return;
    setSelected(reason.id);
    setSent(true);

    fetch('/api/failures/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        failure_event_id: failureEventId,
        session_id: sessionId,
        reason: reason.id,
      }),
    }).catch(() => {});

    // Auto-dismiss after brief confirmation
    setTimeout(() => onDone?.(), 1200);
  }

  function handleSkip() {
    onDone?.();
  }

  if (sent && selected) {
    const reason = REASONS.find(r => r.id === selected);
    return (
      <div className="outcome-fb outcome-fb--done">
        <span className="outcome-fb__check">✓</span>
        <span className="outcome-fb__confirm">Got it — {reason?.label?.toLowerCase()}</span>
      </div>
    );
  }

  return (
    <div className="outcome-fb">
      <div className="outcome-fb__heading">What went wrong?</div>
      <div className="outcome-fb__sub">Takes 1 tap — helps us fix this pattern faster</div>
      <div className="outcome-fb__options">
        {REASONS.map(r => (
          <button
            key={r.id}
            className="outcome-fb__btn"
            onClick={() => handlePick(r)}
            type="button"
          >
            <span className="outcome-fb__icon">{r.icon}</span>
            <div className="outcome-fb__text">
              <span className="outcome-fb__label">{r.label}</span>
              <span className="outcome-fb__sub-text">{r.sub}</span>
            </div>
          </button>
        ))}
      </div>
      <button className="outcome-fb__skip" onClick={handleSkip} type="button">
        Skip
      </button>
    </div>
  );
}
