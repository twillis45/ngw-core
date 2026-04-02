/**
 * ActionSetting — a labeled row with an action button.
 * Destructive actions show in red and require an extra confirm step (via
 * ConfirmActionModal) when destructive=true.
 *
 * Props:
 *   label       — string, primary label
 *   description — string, helper text
 *   buttonText  — string, button label
 *   onClick     — () => void
 *   destructive — bool, red styling + confirmation gating
 *   disabled    — bool
 */
export default function ActionSetting({
  label,
  description,
  buttonText,
  onClick,
  destructive = false,
  disabled = false,
}) {
  return (
    <div className="stg-row stg-row--action">
      <div className="stg-row__meta">
        <span className="stg-row__label">{label}</span>
        {description && (
          <span className="stg-row__desc">{description}</span>
        )}
      </div>
      <button
        className={`btn btn--sm${destructive ? ' btn--danger' : ' btn--ghost'}`}
        onClick={onClick}
        type="button"
        disabled={disabled}
      >
        {buttonText}
      </button>
    </div>
  );
}
