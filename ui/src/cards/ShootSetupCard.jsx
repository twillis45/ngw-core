export default function ShootSetupCard({ lights }) {
  if (!lights || lights.length === 0) return null;

  return (
    <div className="result-card">
      <div className="result-card__header">
        <span className="result-card__icon">{'\u{1F4A1}'}</span>
        <span>Shoot This Setup</span>
      </div>

      {lights.map((l, i) => (
        <div className="setup-light" key={i}>
          <div className="setup-light__role">{l.label}</div>

          <div className="setup-light__row">
            <span className="setup-light__key">Position</span>
            <span className="setup-light__val">{l.positionText}</span>
          </div>
          <div className="setup-light__row">
            <span className="setup-light__key">Distance</span>
            <span className="setup-light__val">{l.distanceFt}</span>
          </div>
          <div className="setup-light__row">
            <span className="setup-light__key">Modifier</span>
            <span className="setup-light__val">{l.modifier}</span>
          </div>
          <div className="setup-light__row">
            <span className="setup-light__key">Power</span>
            <span className="setup-light__val">{l.powerHint}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
