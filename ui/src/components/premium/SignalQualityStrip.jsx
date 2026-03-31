import SectionLabel from './SectionLabel';

/** SignalQualityStrip — compact horizontal row of 3 confidence indicators.
 *  signals: { face, shadow, exposure } each { label, confidence: 0–1 } */
export default function SignalQualityStrip({ signals }) {
  if (!signals) return null;

  const items = [
    { key: 'face',     label: signals.face?.label     || 'Face',     confidence: signals.face?.confidence     ?? 0 },
    { key: 'shadow',   label: signals.shadow?.label   || 'Shadow',   confidence: signals.shadow?.confidence   ?? 0 },
    { key: 'exposure', label: signals.exposure?.label || 'Exposure', confidence: signals.exposure?.confidence ?? 0 },
  ];

  function barColor(c) {
    if (c >= 0.85) return 'var(--color-score-success, #4CAF7D)';
    if (c >= 0.70) return 'var(--color-score-warning, #E8A838)';
    return 'var(--color-score-alert, #E85C38)';
  }

  return (
    <div className="ngw-signal-strip">
      <SectionLabel>Signal Quality</SectionLabel>
      <div className="ngw-signal-strip__items">
        {items.map(({ key, label, confidence }) => (
          <div key={key} className="ngw-signal-strip__item">
            <div className="ngw-signal-strip__item-label">{label}</div>
            <div className="ngw-signal-strip__bar-track">
              <div
                className="ngw-signal-strip__bar-fill"
                style={{
                  width: `${Math.round(confidence * 100)}%`,
                  background: barColor(confidence),
                }}
              />
            </div>
            <div className="ngw-signal-strip__confidence">
              {Math.round(confidence * 100)}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
