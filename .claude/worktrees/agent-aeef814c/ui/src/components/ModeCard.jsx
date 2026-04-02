import ModeIcon from './ModeIcon';

/**
 * Home screen mode card — primary entry point for each app mode.
 * Follows the existing welcome__btn interaction pattern.
 */
export default function ModeCard({ mode, onSelect, disabled }) {
  return (
    <button
      className={`mode-card${disabled ? ' mode-card--disabled' : ''}`}
      onClick={() => !disabled && onSelect(mode)}
      disabled={disabled}
      type="button"
    >
      <span className="mode-card__icon">
        <ModeIcon name={mode.icon} />
      </span>
      <span className="mode-card__text">
        <strong>{mode.label}</strong>
        <small>{mode.tagline}</small>
      </span>
      <span className="mode-card__arrow">{'\u203A'}</span>
    </button>
  );
}
