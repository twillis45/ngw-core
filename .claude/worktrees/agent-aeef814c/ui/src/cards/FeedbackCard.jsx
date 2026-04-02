import { useState } from 'react';
import { saveFeedback } from '../data/feedbackStore';
import CardIcon from '../components/CardIcon';

export default function FeedbackCard({ setupId, mood, pattern }) {
  const [submitted, setSubmitted] = useState(false);
  const [selected, setSelected] = useState(null);

  function handleRate(rating) {
    setSelected(rating);
    saveFeedback({ setupId, mood, pattern, rating });
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="result-card">
        <div className="result-card__header">
          <CardIcon name="check" />
          <span>Feedback Recorded</span>
        </div>
        <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-text-secondary)' }}>
          {selected === 'perfect' && 'Noted. Setup marked as verified.'}
          {selected === 'tweaks' && 'Noted. Flagged for calibration.'}
          {selected === 'didnt_work' && 'Noted. Flagged for review.'}
        </p>
      </div>
    );
  }

  return (
    <div className="result-card">
      <div className="result-card__header">
        <CardIcon name="chat" />
        <span>Rate This Setup</span>
      </div>
      <p style={{
        fontSize: 'var(--text-base)',
        color: 'var(--color-text-secondary)',
        marginBottom: 'var(--space-md)',
      }}>
        Builds a verified record of what holds across shoots.
      </p>
      <div className="feedback-buttons">
        <button
          className="btn btn--sm btn--ghost feedback-btn feedback-btn--perfect"
          onClick={() => handleRate('perfect')}
        >
          Matched
        </button>
        <button
          className="btn btn--sm btn--ghost feedback-btn feedback-btn--tweaks"
          onClick={() => handleRate('tweaks')}
        >
          Needed Tweaks
        </button>
        <button
          className="btn btn--sm btn--ghost feedback-btn feedback-btn--bad"
          onClick={() => handleRate('didnt_work')}
        >
          Didn't Work
        </button>
      </div>
    </div>
  );
}
