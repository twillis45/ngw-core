/**
 * ToggleSetting — a labeled row with a toggle switch.
 *
 * Props:
 *   label       — string, primary label
 *   description — string, helper text below the label
 *   value       — boolean
 *   onChange    — (bool) => void
 *   warning     — string, optional warning text
 *   disabled    — bool
 */
export default function ToggleSetting({
  label,
  description,
  value,
  onChange,
  warning,
  disabled = false,
}) {
  return (
    <div className={`stg-row stg-row--toggle${disabled ? ' stg-row--disabled' : ''}`}>
      <div className="stg-row__meta">
        <span className="stg-row__label">{label}</span>
        {description && (
          <span className="stg-row__desc">{description}</span>
        )}
        {warning && (
          <span className="stg-row__warning">{warning}</span>
        )}
      </div>
      <button
        className={`stg__toggle${value ? ' stg__toggle--on' : ''}`}
        onClick={() => !disabled && onChange(!value)}
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        disabled={disabled}
      >
        <span className="stg__toggle-knob" />
      </button>
    </div>
  );
}
