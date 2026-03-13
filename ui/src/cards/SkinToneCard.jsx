export default function SkinToneCard({ data }) {
  if (!data) return null;

  const toneLabels = { light: 'Light', medium: 'Medium', dark: 'Dark' };

  return (
    <div className="result-card">
      <div className="result-card__header">
        <span className="result-card__icon">{'\u{1F3A8}'}</span>
        <span>Skin Tone Adjustments</span>
        <span className="skin-tone-badge">{toneLabels[data.skinTone] || data.skinTone}</span>
      </div>

      {data.tips.map((tip, i) => (
        <div className="skin-tip" key={i}>
          <div className="skin-tip__label">{tip.label}</div>
          <div className="skin-tip__value">{tip.value}</div>
        </div>
      ))}
    </div>
  );
}
