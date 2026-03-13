import { useState } from 'react';
import { saveFeedback } from '../data/feedbackStore';

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
          <span className="result-card__icon">{'\u2705'}</span>
          <span>Thanks for the Feedback</span>
        </div>
        <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-text-secondary)' }}>
          {selected === 'perfect' && 'Glad it worked. This setup is now marked as verified.'}
          {selected === 'tweaks' && 'Good to know. We\u2019ll factor this in for future recommendations.'}
          {selected === 'didnt_work' && 'Sorry about that. This helps us improve recommendations.'}
        </p>
      </div>
    );
  }

  return (
    <div className="result-card">
      <div className="result-card__header">
        <span className="result-card__icon">{'\uD83D\uDCAC'}</span>
        <span>How Did This Setup Work?</span>
      </div>
      <p style={{
        fontSize: 'var(--text-base)',
        color: 'var(--color-text-secondary)',
        marginBottom: 'var(--space-md)',
      }}>
        Your feedback helps build a verified database of what works.
      </p>
      <div className="feedback-buttons">
        <button
          className="btn btn--sm btn--ghost feedback-btn feedback-btn--perfect"
          onClick={() => handleRate('perfect')}
        >
          Nailed It
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
