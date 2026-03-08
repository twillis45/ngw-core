import ReliabilityDots from '../components/ReliabilityDots';

export default function BestMatchCard({ data }) {
  if (!data) return null;
  return (
    <div className="result-card best-match">
      <div className="result-card__header">
        <span className="result-card__icon">{'\u2705'}</span>
        <span>Best Match</span>
      </div>

      <div className="best-match__name">{data.name}</div>

      <ReliabilityDots dots={data.reliabilityDots} label={data.reliabilityLabel} />

      <p className="best-match__rationale">{data.rationale}</p>
    </div>
  );
}
