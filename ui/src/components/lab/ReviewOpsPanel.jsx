/**
 * ReviewOpsPanel — LAB Build 1: Review Ops Dashboard
 *
 * Shows 6 queue stat cards and a priority table for all pending review items.
 * Visibility only — no approve/reject/modify actions.
 */
import { useState, useEffect, useCallback } from 'react';
import { fetchReviewOpsCounts } from '../../data/labApi';
import { C } from '../../lib/statusColors';

// ── Queue definitions ─────────────────────────────────────────────────────────

const QUEUES = [
  {
    id: 'goldSet',
    label: 'Gold Set Queue',
    hint: 'awaiting human review',
    dest: 'overview',   // LearningOpsTab panel id — closest existing panel
    urgencyColor: C.amber,
  },
  {
    id: 'distillation',
    label: 'Distillation Queue',
    hint: 'candidate signals to review',
    dest: 'intel',
    urgencyColor: C.blue,
  },
  {
    id: 'vlmCorrections',
    label: 'Correction Queue',
    hint: 'VLM correction log entries',
    dest: 'monitoring',
    urgencyColor: C.amber,
  },
  {
    id: 'referenceBacklog',
    label: 'Reference Backlog',
    hint: 'items need reprocessing',
    dest: 'overview',
    urgencyColor: C.red,
  },
  {
    id: 'correctionLog',
    label: 'Flagged Corrections',
    hint: 'correction log total',
    dest: 'monitoring',
    urgencyColor: 'var(--color-text-secondary)',
  },
  {
    id: 'groundTruth',
    label: 'Ground Truth Queue',
    hint: 'image labels recorded',
    dest: 'intel',
    urgencyColor: 'var(--color-text-secondary)',
  },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="rop-card rop-card--skeleton">
      <div className="rop-card__count rop-skeleton" style={{ width: 40, height: 28, marginBottom: 6 }} />
      <div className="rop-skeleton" style={{ width: '70%', height: 12, marginBottom: 4 }} />
      <div className="rop-skeleton" style={{ width: '50%', height: 10 }} />
    </div>
  );
}

function QueueCard({ queue, result, onNavigate }) {
  const { label, hint, dest, urgencyColor } = queue;
  const count  = result?.count;
  const error  = result?.error;
  const hasVal = count !== null && count !== undefined;

  const countColor = hasVal && count > 0 ? urgencyColor : 'var(--color-text-dim)';

  return (
    <div className="rop-card">
      <div className="rop-card__count" style={{ color: countColor }}>
        {error ? '—' : hasVal ? count : '—'}
      </div>
      <div className="rop-card__label">{label}</div>
      <div className="rop-card__hint">{error ? 'fetch failed' : hint}</div>
      <button
        className="lo-btn lo-btn--ghost rop-card__cta"
        onClick={() => onNavigate(dest)}
        type="button"
        disabled={!dest}
      >
        View panel
      </button>
    </div>
  );
}

function PriorityTable({ queues, counts, onNavigate }) {
  const rows = queues
    .map(q => ({ ...q, count: counts[q.id]?.count ?? 0, error: counts[q.id]?.error }))
    .filter(r => !r.error)
    .sort((a, b) => {
      // Non-zero first, then descending count
      if ((a.count > 0) !== (b.count > 0)) return a.count > 0 ? -1 : 1;
      return b.count - a.count;
    });

  if (rows.length === 0) return null;

  return (
    <div className="rop-table-wrap">
      <div className="lo-panel__header" style={{ marginBottom: 'var(--space-sm)' }}>
        <span className="lo-panel__title" style={{ fontSize: 'var(--text-sm)' }}>
          Priority Order
        </span>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)' }}>
          non-zero queues first
        </span>
      </div>
      <table className="lo-table">
        <thead>
          <tr>
            <th>Queue</th>
            <th style={{ textAlign: 'right' }}>Count</th>
            <th>Hint</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.id}>
              <td style={{ fontWeight: 'var(--weight-semibold)' }}>{r.label}</td>
              <td style={{
                textAlign: 'right',
                fontWeight: 'var(--weight-bold)',
                color: r.count > 0 ? r.urgencyColor : 'var(--color-text-dim)',
              }}>
                {r.count}
              </td>
              <td style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-xs)' }}>{r.hint}</td>
              <td style={{ textAlign: 'right' }}>
                <button
                  className="lo-btn lo-btn--ghost"
                  style={{ fontSize: 'var(--text-xs)', padding: '2px 8px' }}
                  onClick={() => onNavigate(r.dest)}
                  type="button"
                >
                  Go
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────

export default function ReviewOpsPanel({ onNavigate }) {
  const [counts,  setCounts]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchReviewOpsCounts();
      setCounts(data);
    } catch (err) {
      setError(err.message || 'Failed to load review ops counts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleNavigate(dest) {
    onNavigate?.(dest);
  }

  return (
    <div className="lo-panel">
      {/* Header */}
      <div className="lo-panel__header">
        <span className="lo-panel__title">Review Ops</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)' }}>
            6 queues · visibility only
          </span>
          {!loading && (
            <button className="lo-btn lo-btn--ghost" onClick={load} type="button">
              Refresh
            </button>
          )}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <p className="lo-empty lo-empty--err" style={{ marginBottom: 'var(--space-md)' }}>
          {error}
        </p>
      )}

      {/* Cards grid */}
      <div className="rop-grid">
        {loading
          ? QUEUES.map(q => <SkeletonCard key={q.id} />)
          : QUEUES.map(q => (
              <QueueCard
                key={q.id}
                queue={q}
                result={counts?.[q.id]}
                onNavigate={handleNavigate}
              />
            ))
        }
      </div>

      {/* Priority table */}
      {!loading && counts && (
        <PriorityTable
          queues={QUEUES}
          counts={counts}
          onNavigate={handleNavigate}
        />
      )}
    </div>
  );
}
