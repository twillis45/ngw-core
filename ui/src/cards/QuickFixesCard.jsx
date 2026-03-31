import { useState, useEffect } from 'react';
import CardIcon from '../components/CardIcon';
import { trackEvent } from '../data/analytics';

/**
 * QuickFixesCard — actionable lighting fixes.
 *
 * Props:
 *   fixes      — array of fix objects { problem, fix, priority?, level?, tag? }
 *   isPaid     — if true, show all fixes; if false/undefined, show first free + blur rest
 *   onUnlock   — called when user taps unlock from blur overlay
 */
export default function QuickFixesCard({ fixes, isPaid, onUnlock }) {
  if (!fixes || fixes.length === 0) return null;

  // Normalize: some sources send plain strings instead of {problem, fix} objects.
  // Convert strings and filter out blanks.
  const normalized = fixes
    .map(f => typeof f === 'string' ? { problem: f, fix: '' } : f)
    .filter(f => f && (f.problem || f.fix || f.text));

  if (normalized.length === 0) return null;

  const priorityFixes = normalized.filter(f => f.priority);
  const otherFixes    = normalized.filter(f => !f.priority);
  const [expanded, setExpanded] = useState(false);

  /* Priority first, then others */
  const allFixes  = [...priorityFixes, ...otherFixes];
  const firstFix  = allFixes[0];
  const lockedFixes = allFixes.slice(1);

  useEffect(() => {
    if (firstFix) trackEvent('FIRST_FIX_SHOWN', {});
  }, []);

  function renderFixRow(f, i, cls = '') {
    return (
      <div
        key={i}
        className={`fix-row${f.priority ? ' fix-row--priority' : ''}${cls}`}
        style={{ padding: '9px 0' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          {f.priority && (
            <span style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 'var(--weight-semibold)',
              color: 'var(--color-cta)',
              letterSpacing: 'var(--tracking-wide)',
              textTransform: 'uppercase',
            }}>
              Fix first
            </span>
          )}
          {f.tag && (
            <span className="fix-row__tag" style={{ marginLeft: f.priority ? 4 : 0 }}>
              {f.tag}
            </span>
          )}
        </div>
        <div style={{
          fontSize: 'var(--text-sm)',
          fontWeight: 'var(--weight-semibold)',
          color: 'var(--color-text)',
          marginBottom: 3,
          lineHeight: 1.4,
        }}>
          {f.problem || 'General fix'}
        </div>
        <div style={{
          fontSize: 'var(--text-sm)',
          color: 'var(--color-text-secondary)',
          lineHeight: 1.5,
          paddingLeft: 10,
          borderLeft: '2px solid var(--color-cta)',
        }}>
          {f.fix || f.text || ''}
        </div>
      </div>
    );
  }

  const nonPriorityLocked = lockedFixes.filter(f => !f.priority);

  return (
    <div className="result-card">
      <div className="result-card__header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <CardIcon name="tool" />
        <span>Quick Fixes</span>
        <span className="result-card__count" style={{ marginLeft: 'auto' }}>
          {isPaid ? allFixes.length : `${Math.min(allFixes.length, 1)} shown`}
        </span>
      </div>

      {/* First fix — always free */}
      {firstFix && renderFixRow(firstFix, 0)}

      {/* Remaining fixes */}
      {lockedFixes.length > 0 && (
        isPaid ? (
          <>
            {lockedFixes.filter(f => f.priority).map((f, i) => renderFixRow(f, i + 1))}
            {nonPriorityLocked.length > 0 && (
              <>
                {expanded && nonPriorityLocked.map((f, i) => renderFixRow(f, i + 100))}
                <button
                  className="show-more-btn"
                  onClick={() => setExpanded(!expanded)}
                  type="button"
                >
                  {expanded
                    ? 'Show less'
                    : `+${nonPriorityLocked.length} more fix${nonPriorityLocked.length !== 1 ? 'es' : ''}`}
                </button>
              </>
            )}
          </>
        ) : (
          <div className="quick-fixes__locked">
            <div className="quick-fixes__locked-preview" aria-hidden="true">
              {lockedFixes.slice(0, 2).map((f, i) => renderFixRow(f, i + 1))}
            </div>
            <div className="quick-fixes__locked-overlay">
              <span className="quick-fixes__locked-count">
                {lockedFixes.length} more fix{lockedFixes.length !== 1 ? 'es' : ''} for this setup
              </span>
              {onUnlock && (
                <button className="quick-fixes__unlock-btn" onClick={onUnlock} type="button">
                  Unlock All Fixes
                </button>
              )}
            </div>
          </div>
        )
      )}
    </div>
  );
}
