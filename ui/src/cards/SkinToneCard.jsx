import CardIcon from '../components/CardIcon';

const TONE_META = {
  light:  { label: 'Light',  swatch: '#FDDBB4' },
  medium: { label: 'Medium', swatch: '#C68642' },
  dark:   { label: 'Dark',   swatch: '#8D5524' },
  mixed:  { label: 'Mixed Tones', swatch: 'linear-gradient(135deg, #FDDBB4 33%, #C68642 66%, #8D5524 100%)' },
};

export default function SkinToneCard({ data }) {
  if (!data) return null;
  const meta = TONE_META[data.skinTone] || { label: data.skinTone, swatch: '#888' };

  return (
    <div className="result-card">
      <div className="result-card__header">
        <CardIcon name="palette" />
        <span>Skin Tone</span>
        <span className="skin-tone-badge" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', background: meta.swatch, flexShrink: 0, display: 'inline-block' }} />
          {meta.label}
        </span>
      </div>

      {data.skinTone === 'mixed' && (
        <div className="skin-tip skin-tip--callout">
          <div className="skin-tip__label">Mixed Skin Tone Session</div>
          <div className="skin-tip__value">
            Optimize your baseline for the darkest subject. Lighter subjects will remain well-exposed while darker subjects will never be underexposed.
          </div>
        </div>
      )}

      {data.tips.map((tip, i) => (
        <div className="skin-tip" key={i}>
          <div className="skin-tip__label">{tip.label}</div>
          <div className="skin-tip__value">{tip.value}</div>
        </div>
      ))}

      {data.mixedNote && (
        <div className="skin-tip skin-tip--note">
          <div className="skin-tip__label">Sequential Sessions</div>
          <div className="skin-tip__value">{data.mixedNote}</div>
        </div>
      )}
    </div>
  );
}
