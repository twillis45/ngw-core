import { useState } from 'react';
import CardIcon from '../components/CardIcon';

/**
 * WhatToLookForCard — on-set lighting checklist.
 *
 * Props:
 *   goodSigns  — array of { text, level } objects  (level 1 = Essentials, 2 = Full)
 *                also accepts legacy string[] for backward compat
 *   warnings   — same format as goodSigns
 *   defaultOpen — open on mount (default false)
 */
export default function WhatToLookForCard({ goodSigns, warnings, defaultOpen = false }) {
  const [open, setOpen]       = useState(defaultOpen);
  const [showAll, setShowAll] = useState(false);

  const hasContent = (goodSigns && goodSigns.length > 0) || (warnings && warnings.length > 0);
  if (!hasContent) return null;

  /* Normalize — accept legacy strings or new { text, level } objects */
  function normalize(items) {
    if (!items) return [];
    return items.map(item =>
      typeof item === 'string' ? { text: item, level: 1 } : item
    );
  }

  const allGood = normalize(goodSigns);
  const allWarn = normalize(warnings);
  const hasAdvanced = [...allGood, ...allWarn].some(i => i.level > 1);

  const visGood = showAll ? allGood : allGood.filter(i => i.level === 1);
  const visWarn = showAll ? allWarn : allWarn.filter(i => i.level === 1);

  /* If all items are level 1 (no advanced), show all regardless */
  const displayGood = visGood.length > 0 ? visGood : allGood;
  const displayWarn = visWarn.length > 0 ? visWarn : allWarn;

  const totalVisible = displayGood.length + displayWarn.length;

  return (
    <div className="result-card">
      <button
        type="button"
        className="result-card__header result-card__header--toggle"
        onClick={() => setOpen(!open)}
      >
        <CardIcon name="eye" />
        <span>What to Look For</span>
        <span className="result-card__count">{totalVisible}</span>
        <span className="result-card__chevron">{open ? '\u25BE' : '\u25B8'}</span>
      </button>

      {open && (
        <div style={{ paddingTop: 4 }}>

          {/* Experience level toggle */}
          {hasAdvanced && (
            <div style={{
              display: 'flex',
              gap: 4,
              marginBottom: 14,
              background: 'var(--color-surface-elevated)',
              borderRadius: 'var(--radius-full)',
              padding: 3,
              width: 'fit-content',
            }}>
              <button
                type="button"
                onClick={() => setShowAll(false)}
                style={{
                  padding: '4px 12px',
                  fontSize: 'var(--text-xs)',
                  fontWeight: showAll ? 'var(--weight-normal)' : 'var(--weight-semibold)',
                  color: showAll ? 'var(--color-text-secondary)' : 'var(--color-text)',
                  background: showAll ? 'transparent' : 'var(--color-surface)',
                  border: 'none',
                  borderRadius: 'var(--radius-full)',
                  cursor: 'pointer',
                  transition: 'background 0.15s, color 0.15s',
                  boxShadow: showAll ? 'none' : 'var(--shadow-sm)',
                  letterSpacing: 'var(--tracking-wide)',
                  textTransform: 'uppercase',
                }}
              >
                Priority
              </button>
              <button
                type="button"
                onClick={() => setShowAll(true)}
                style={{
                  padding: '4px 12px',
                  fontSize: 'var(--text-xs)',
                  fontWeight: showAll ? 'var(--weight-semibold)' : 'var(--weight-normal)',
                  color: showAll ? 'var(--color-text)' : 'var(--color-text-secondary)',
                  background: showAll ? 'var(--color-surface)' : 'transparent',
                  border: 'none',
                  borderRadius: 'var(--radius-full)',
                  cursor: 'pointer',
                  transition: 'background 0.15s, color 0.15s',
                  boxShadow: showAll ? 'var(--shadow-sm)' : 'none',
                  letterSpacing: 'var(--tracking-wide)',
                  textTransform: 'uppercase',
                }}
              >
                Full read
              </button>
            </div>
          )}

          {/* Good signs */}
          {displayGood.length > 0 && (
            <div style={{ marginBottom: displayWarn.length > 0 ? 16 : 0 }}>
              <div style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 'var(--weight-semibold)',
                color: 'var(--color-success)',
                letterSpacing: 'var(--tracking-wider)',
                textTransform: 'uppercase',
                marginBottom: 8,
              }}>
                Signs it&rsquo;s working
              </div>
              {displayGood.map((item, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    padding: '5px 0',
                    borderBottom: i < displayGood.length - 1
                      ? '1px solid var(--border-faint)' : 'none',
                  }}
                >
                  <span style={{
                    color: 'var(--color-success)',
                    fontSize: 'var(--text-sm)',
                    lineHeight: 1.5,
                    flexShrink: 0,
                    marginTop: 1,
                  }}>
                    ✓
                  </span>
                  <span style={{
                    fontSize: 'var(--text-sm)',
                    color: 'var(--color-text)',
                    lineHeight: 1.5,
                  }}>
                    {item.text}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Warnings */}
          {displayWarn.length > 0 && (
            <div>
              <div style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 'var(--weight-semibold)',
                color: 'var(--color-warning)',
                letterSpacing: 'var(--tracking-wider)',
                textTransform: 'uppercase',
                marginBottom: 8,
              }}>
                Watch for
              </div>
              {displayWarn.map((item, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 8,
                    padding: '5px 0',
                    borderBottom: i < displayWarn.length - 1
                      ? '1px solid var(--border-faint)' : 'none',
                  }}
                >
                  <span style={{
                    color: 'var(--color-warning)',
                    fontSize: 'var(--text-sm)',
                    lineHeight: 1.5,
                    flexShrink: 0,
                    marginTop: 1,
                  }}>
                    ⚠
                  </span>
                  <span style={{
                    fontSize: 'var(--text-sm)',
                    color: 'var(--color-text)',
                    lineHeight: 1.5,
                  }}>
                    {item.text}
                  </span>
                </div>
              ))}
            </div>
          )}

        </div>
      )}
    </div>
  );
}
