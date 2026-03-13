import ReliabilityDots from '../components/ReliabilityDots';

const DISTANCE_LABELS = {
  subjectToBackground: 'Subject \u2192 Background',
  keyLightToSubject: 'Key Light \u2192 Subject',
  cameraToSubject: 'Camera \u2192 Subject',
};

export default function BestMatchCard({ data }) {
  if (!data) return null;

  const distances = data.keyDistances;
  const distanceEntries = distances
    ? Object.entries(distances).filter(([, v]) => v)
    : [];
  const modifiers = data.modifierSummary || [];

  return (
    <div className="result-card best-match">
      <div className="result-card__header">
        <span className="result-card__icon">{'\uD83D\uDCA1'}</span>
        <span>Your Setup</span>
      </div>

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

      <div className="best-match__section-label">Why This Works</div>
      <p className="best-match__rationale">{data.rationale}</p>

      {modifiers.length > 0 && (
        <>
          <div className="best-match__section-label">Modifiers for This Look</div>
          <div className="modifier-summary">
            {modifiers.map(m => (
              <div className="modifier-summary__item" key={m.role}>
                <span className="modifier-summary__role">{m.role}</span>
                <span className="modifier-summary__mod">{m.modifier}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {distanceEntries.length > 0 && (
        <>
          <div className="best-match__section-label">Key Distances</div>
          <div className="key-distances">
            {distanceEntries.map(([key, val]) => (
              <div className="key-distances__item" key={key}>
                <span className="key-distances__label">{DISTANCE_LABELS[key] || key}</span>
                <span className="key-distances__value">{val}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {data.lightsGuide && data.lightsGuide.length > 0 && (
        <>
          <div className="best-match__section-label">Light Setup Guide</div>
          <div className="lights-guide">
            {data.lightsGuide.map(light => (
              <div className="lights-guide__item" key={light.role}>
                <div className="lights-guide__header">
                  <strong>{light.label}</strong>
                  <span className="lights-guide__modifier">{light.modifier}</span>
                </div>
                <p className="lights-guide__purpose">{light.purpose}</p>
                <div className="lights-guide__details">
                  <span className="lights-guide__detail">{light.positioning}</span>
                  <span className="lights-guide__detail">{light.power_guidance}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
