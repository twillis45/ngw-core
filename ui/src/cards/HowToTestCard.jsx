export default function HowToTestCard({ steps }) {
  if (!steps || steps.length === 0) return null;

  return (
    <div className="result-card">
      <div className="result-card__header">
        <span className="result-card__icon">{'\u{1F9EA}'}</span>
        <span>How to Test</span>
      </div>

      <ol className="checklist">
        {steps.map((step, i) => (
          <li className="checklist__item" key={i}>{step}</li>
        ))}
      </ol>
    </div>
  );
}
