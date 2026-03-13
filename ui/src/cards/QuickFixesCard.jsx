import { useState } from 'react';

export default function QuickFixesCard({ fixes }) {
  if (!fixes || fixes.length === 0) return null;

  const priorityFixes = fixes.filter(f => f.priority);
  const otherFixes = fixes.filter(f => !f.priority);
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="result-card">
      <div className="result-card__header">
        <span className="result-card__icon">{'\u{1F527}'}</span>
        <span>Quick Fixes</span>
      </div>

      {/* Priority fixes — always visible */}
      {priorityFixes.map((f, i) => (
        <div className="fix-row fix-row--priority" key={`p${i}`}>
          <div className="fix-row__head">
            <div className="fix-row__problem">
              {f.problem ? `If ${f.problem.toLowerCase()}:` : 'Tip:'}
            </div>
            {f.tag && <span className="fix-row__tag">{f.tag}</span>}
          </div>
          <div className="fix-row__solution">{f.fix || f.text || ''}</div>
        </div>
      ))}

      {/* Other fixes — behind "Show more" */}
      {otherFixes.length > 0 && (
        <>
          {expanded && otherFixes.map((f, i) => (
            <div className="fix-row" key={`o${i}`}>
              <div className="fix-row__problem">
                {f.problem ? `If ${f.problem.toLowerCase()}:` : 'Tip:'}
              </div>
              <div className="fix-row__solution">{f.fix || f.text || ''}</div>
            </div>
          ))}
          <button
            className="show-more-btn"
            onClick={() => setExpanded(!expanded)}
            type="button"
          >
            {expanded ? 'Show less' : `+${otherFixes.length} more fixes`}
          </button>
        </>
      )}
    </div>
  );
}
