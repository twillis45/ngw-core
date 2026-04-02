import ReliabilityDots from '../components/ReliabilityDots';

export default function BestMatchCard({ data, gearMatch }) {
  if (!data) return null;

  return (
    <div className="best-match-hero">
      {gearMatch && !gearMatch.isExact && (
        <div className={`gear-match-banner gear-match-banner--${gearMatch.tier}`}>
          <span className="gear-match-banner__label">{gearMatch.label}</span>
          {gearMatch.adaptNote && (
            <p className="gear-match-banner__note">{gearMatch.adaptNote}</p>
          )}
        </div>
      )}

      <div className="best-match__name">
        {data.name}
        {data.lightingPattern && (
          <span className="best-match__pattern">{data.lightingPattern}</span>
        )}
        {data.masterModeLabel && (
          <span className="best-match__master-badge">
            {data.masterModeIcon ? `${data.masterModeIcon} ` : ''}{data.masterModeLabel}
          </span>
        )}
      </div>

      <ReliabilityDots dots={data.reliabilityDots} label={data.reliabilityLabel} />
    </div>
  );
}
