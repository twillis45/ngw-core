import { useState } from 'react';
import ShowMore from '../components/ShowMore';

export default function HowToTestCard({ steps }) {
  const [checked, setChecked] = useState({});

  if (!steps || steps.length === 0) return null;

  function toggleCheck(i) {
    setChecked(prev => ({ ...prev, [i]: !prev[i] }));
  }

  const doneCount = Object.values(checked).filter(Boolean).length;

  return (
    <div className="result-card">
      <div className="result-card__header">
        <span className="result-card__icon">{'\u2705'}</span>
        <span>Setup Checklist</span>
        {doneCount > 0 && (
          <span className="checklist__progress">{doneCount}/{steps.length}</span>
        )}
      </div>

      <div className="checklist">
        <ShowMore
          items={steps}
          limit={4}
          renderItem={(step, i) => (
            <button
              type="button"
              className={`checklist__item${checked[i] ? ' checklist__item--done' : ''}`}
              key={i}
              onClick={() => toggleCheck(i)}
            >
              <span className="checklist__check">{checked[i] ? '\u2713' : ''}</span>
              <span className="checklist__text">{step}</span>
            </button>
          )}
        />
      </div>
    </div>
  );
}
