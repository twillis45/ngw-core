/**
 * HelpTip — inline ? button with a popover tooltip.
 *
 * Usage:
 *   <HelpTip text="Explains the thing" />
 *   <HelpTip title="Source Quality" text="Hard means..." />
 *
 * Renders inline next to any label. Closes on outside click / tap.
 */
import { useState, useRef, useEffect } from 'react';

export default function HelpTip({ text, title, side = 'above' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function close(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
    };
  }, [open]);

  const popoverStyle = side === 'below'
    ? { top: 'calc(100% + 6px)', bottom: 'auto' }
    : {};

  return (
    <span className="help-tip" ref={ref}>
      <button
        type="button"
        className={`help-tip__btn${open ? ' help-tip__btn--open' : ''}`}
        onClick={() => setOpen(v => !v)}
        aria-label={title || 'More info'}
        aria-expanded={open}
      >?</button>
      {open && (
        <span className="help-tip__popover" role="tooltip" style={popoverStyle}>
          {title && <strong className="help-tip__title">{title}</strong>}
          {text}
        </span>
      )}
    </span>
  );
}
