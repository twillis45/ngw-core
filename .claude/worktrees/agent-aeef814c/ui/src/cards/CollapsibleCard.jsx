import { useState } from 'react';

/**
 * Wrapper that makes any ref card collapsible.
 * Tap the header to toggle body visibility.
 */
export default function CollapsibleCard({
  icon,
  title,
  defaultOpen = true,
  className = '',
  children,
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`result-card ref-card${className ? ` ${className}` : ''}${open ? '' : ' ref-card--collapsed'}`}>
      <button
        className="result-card__header result-card__header--toggle"
        onClick={() => setOpen(!open)}
        type="button"
        aria-expanded={open}
      >
        <span className="result-card__icon">{icon}</span>
        <span style={{ flex: 1, textAlign: 'left' }}>{title}</span>
        <span className={`result-card__chevron${open ? ' result-card__chevron--open' : ''}`}>{'\u203A'}</span>
      </button>
      {open && children}
    </div>
  );
}
