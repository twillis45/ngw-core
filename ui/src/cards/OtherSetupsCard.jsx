export default function OtherSetupsCard({ alternatives }) {
  if (!alternatives || alternatives.length === 0) return null;

  return (
    <div className="result-card">
      <div className="result-card__header">
        <span className="result-card__icon">{'\u{1F504}'}</span>
        <span>Other Setups</span>
      </div>

      {alternatives.map((alt, i) => (
        <div className="alt-row" key={i}>
          <div className="alt-row__name">{alt.name}</div>
          <span className="alt-row__gap">{alt.gap} pts behind &middot; {alt.gapLabel}</span>
          {alt.tradeoff && (
            <div className="alt-row__tradeoff">{alt.tradeoff}</div>
          )}
        </div>
      ))}
    </div>
  );
}
