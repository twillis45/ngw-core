import { useState } from 'react';

export default function ShowMore({ items, limit = 4, renderItem }) {
  const [open, setOpen] = useState(false);
  if (!items || items.length === 0) return null;

  const visible = open ? items : items.slice(0, limit);
  const remaining = items.length - limit;

  return (
    <>
      {visible.map(renderItem)}
      {remaining > 0 && (
        <button
          className="show-more-btn"
          onClick={() => setOpen(!open)}
          type="button"
        >
          {open ? 'Show less' : `Show ${remaining} more`}
          <span className={`show-more-btn__arrow${open ? ' show-more-btn__arrow--open' : ''}`}>
            {'\u25BC'}
          </span>
        </button>
      )}
    </>
  );
}
