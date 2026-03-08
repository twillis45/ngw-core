export default function QuickFixesCard({ fixes }) {
  if (!fixes || fixes.length === 0) return null;

  return (
    <div className="result-card">
      <div className="result-card__header">
        <span className="result-card__icon">{'\u{1F527}'}</span>
        <span>Quick Fixes</span>
      </div>

      {fixes.map((f, i) => (
        <div className="fix-row" key={i}>
          <div className="fix-row__problem">If {f.problem.toLowerCase()}:</div>
          <div className="fix-row__solution">{f.fix}</div>
        </div>
      ))}
    </div>
  );
}
