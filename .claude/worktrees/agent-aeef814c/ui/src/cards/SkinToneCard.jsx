import CardIcon from '../components/CardIcon';

const TONE_META = {
  light:  { label: 'Light',  swatch: '#FDDBB4' },
  medium: { label: 'Medium', swatch: '#C68642' },
  dark:   { label: 'Dark',   swatch: '#8D5524' },
  mixed:  { label: 'Multiple Subjects', swatch: 'linear-gradient(135deg, #FDDBB4 33%, #C68642 66%, #8D5524 100%)' },
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
          <div className="skin-tip__label">Multiple Subjects — Mixed Skin Tones</div>
          <div className="skin-tip__value">
            This session has subjects with different skin tones. Lock your baseline to the darkest subject — lighter subjects will hold; darker subjects will not survive underexposure. Manage exposure differences through subject positioning and flagging, not power changes.
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
          <div className="skin-tip__label">Workflow — Flagging & Sequential Order</div>
          <div className="skin-tip__value">{data.mixedNote}</div>
        </div>
      )}
    </div>
  );
}
