import { useState } from 'react';
import ShowMore from '../components/ShowMore';
import CardIcon from '../components/CardIcon';

export default function HowToTestCard({ steps, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const [checked, setChecked] = useState({});

  if (!steps || steps.length === 0) return null;

  function toggleCheck(i) {
    setChecked(prev => ({ ...prev, [i]: !prev[i] }));
  }

  const doneCount = Object.values(checked).filter(Boolean).length;

  return (
    <div className="result-card">
      <button
        type="button"
        className="result-card__header result-card__header--toggle"
        onClick={() => setOpen(!open)}
      >
        <CardIcon name="clipboard" />
        <span>Setup Checklist</span>
        {doneCount > 0 && (
          <span className="checklist__progress">{doneCount}/{steps.length}</span>
        )}
        <span className="result-card__chevron">{open ? '\u25BE' : '\u25B8'}</span>
      </button>

      {open && (
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
      )}
    </div>
  );
}
