/**
 * SettingsSection — collapsible section wrapper with title + description.
 * Used for the four top-level settings groups: Experience, Intelligence,
 * Data & Privacy, Advanced.
 */
import { useState } from 'react';

export default function SettingsSection({
  title,
  description,
  children,
  collapsible = false,
  defaultExpanded = true,
  accent,               // optional accent color class suffix
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className={`stg-section${accent ? ` stg-section--${accent}` : ''}`}>
      <button
        className={`stg-section__header${collapsible ? ' stg-section__header--collapsible' : ''}`}
        onClick={collapsible ? () => setExpanded(v => !v) : undefined}
        type="button"
        aria-expanded={collapsible ? expanded : undefined}
      >
        <div className="stg-section__titles">
          <span className="stg-section__title">{title}</span>
          {description && (
            <span className="stg-section__desc">{description}</span>
          )}
        </div>
        {collapsible && (
          <span className={`stg-section__chevron${expanded ? ' stg-section__chevron--open' : ''}`}>
            ›
          </span>
        )}
      </button>

      {(!collapsible || expanded) && (
        <div className="stg-section__body">
          {children}
        </div>
      )}
    </div>
  );
}
