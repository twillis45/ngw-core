/**
 * SegmentedSetting — a labeled row with an inline segmented control.
 *
 * Props:
 *   label       — string, primary label
 *   description — string, helper text below the label
 *   options     — [{ id, label, title? }]
 *   value       — currently selected id
 *   onChange    — (id) => void
 *   compact     — bool, smaller pill style (for 4+ options)
 *   warning     — string, optional warning text
 */
export default function SegmentedSetting({
  label,
  description,
  options,
  value,
  onChange,
  compact = false,
  warning,
}) {
  return (
    <div className="stg-row">
      <div className="stg-row__meta">
        <span className="stg-row__label">{label}</span>
        {description && (
          <span className="stg-row__desc">{description}</span>
        )}
        {warning && (
          <span className="stg-row__warning">{warning}</span>
        )}
      </div>
      <div className={`stg__seg${compact ? ' stg__seg--compact' : ''}`}>
        {options.map(opt => (
          <button
            key={opt.id}
            className={`stg__seg-btn${value === opt.id ? ' stg__seg-btn--on' : ''}`}
            onClick={() => onChange(opt.id)}
            title={opt.title}
            type="button"
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
