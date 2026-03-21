import CardIcon from '../components/CardIcon';

export default function OtherSetupsCard({ alternatives, substitutions }) {
  const hasAlts = alternatives && alternatives.length > 0;
  const hasSubs = substitutions && substitutions.length > 0;
  if (!hasAlts && !hasSubs) return null;

  return (
    <div className="result-card">
      <div className="result-card__header">
        <CardIcon name="refresh" />
        <span>Alternative Setups</span>
      </div>

      {hasAlts && alternatives.map((alt, i) => (
        <div className="alt-row" key={i}>
          <div className="alt-row__name">{alt.name}</div>
          <span className="alt-row__badge">{alt.gapLabel}</span>
          {alt.tradeoff && (
            <div className="alt-row__tradeoff">{alt.tradeoff}</div>
          )}
        </div>
      ))}

      {hasSubs && (
        <>
          <div className="section-label" style={{ marginTop: hasAlts ? 16 : 0, marginBottom: 8 }}>
            Substitutions
          </div>
          <ul className="substitution-list">
            {substitutions.map((s, i) => (
              <li className="substitution-list__item" key={i}>{s}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
