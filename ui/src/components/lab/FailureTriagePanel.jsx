/**
 * FailureTriagePanel — LAB Build 2
 *
 * Surfaces two queues of candidate failure cases from vlm_disagreements:
 *   - Overconfident Misses:   VLM confident but disagreed with CV resolver
 *   - Underconfident Hits:    VLM agreed with CV but at low confidence
 *
 * DATA QUALITY WARNINGS (shown inline in UI):
 *   - "ground_truth_pattern" = CV-resolved value, NOT human-labeled ground truth.
 *   - No image_path is stored in vlm_disagreements — images cannot be previewed.
 *   - Dismiss is frontend-only (no dismissed column in schema v1).
 *   - These records are diagnostic candidates, not confirmed errors.
 */

import { useState, useEffect } from 'react';
import {
  fetchOverconfidentFailures,
  fetchUnderconfidentHits,
  sendToGoldSetReview,
  dismissTriageItem,
} from '../../data/labApi';

const OVERCONFIDENT_THRESHOLD = 0.65;
const UNDERCONFIDENT_THRESHOLD = 0.45;

// ── Helpers ───────────────────────────────────────────────

function confColor(conf, type) {
  // overconfident: higher = worse (more concerning)
  // underconfident: lower = worse
  if (type === 'overconfident') {
    if (conf >= 0.85) return '#F87171';   // red
    if (conf >= 0.70) return '#FB923C';   // orange
    return '#FBBF24';                     // amber
  }
  // underconfident
  if (conf <= 0.20) return '#F87171';
  if (conf <= 0.35) return '#FB923C';
  return '#FBBF24';
}

function shortPath(imagePath) {
  if (!imagePath) return '—';
  const parts = imagePath.replace(/\\/g, '/').split('/');
  // Show last 2 path segments for readability
  return parts.slice(-2).join('/');
}

function formatTs(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts * 1000).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: '2-digit',
    });
  } catch {
    return '—';
  }
}

// ── Skeleton row ──────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="ft-row ft-row--skeleton">
      {[1, 2, 3, 4, 5, 6].map(i => (
        <td key={i} className="ft-td">
          <div className="ft-skeleton" style={{ width: `${40 + i * 12}%`, height: 14 }} />
        </td>
      ))}
    </tr>
  );
}

// ── Per-row action buttons ─────────────────────────────────

function RowActions({ item, type, onQueued, onDismiss, onReplay }) {
  const [queueState, setQueueState] = useState('idle'); // idle | loading | done | error
  const [queueErr, setQueueErr]     = useState(null);

  async function handleQueue() {
    setQueueState('loading');
    setQueueErr(null);
    try {
      await sendToGoldSetReview({
        image_path:           item.image_path || `analysis:${item.analysis_id}`,
        predicted_pattern:    item.predicted_pattern,
        ground_truth_pattern: item.ground_truth_pattern,
        confidence:           item.confidence ?? 0,
        analysis_id:          item.analysis_id || null,
        notes:                `Queued from Failure Triage (${type}) — field: ${item.field_name}`,
      });
      setQueueState('done');
      if (onQueued) onQueued(item.id);
    } catch (err) {
      setQueueState('error');
      setQueueErr(err.message || 'Failed to queue');
    }
  }

  async function handleDismiss() {
    // dismiss is frontend-only in v1 — no backend call needed
    await dismissTriageItem(item.id);
    if (onDismiss) onDismiss(item.id);
  }

  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      {queueState === 'done' ? (
        <span className="ft-badge ft-badge--queued">Queued</span>
      ) : (
        <button
          className="ft-btn ft-btn--queue"
          onClick={handleQueue}
          disabled={queueState === 'loading'}
          type="button"
        >
          {queueState === 'loading' ? 'Queuing…' : 'Queue for Review'}
        </button>
      )}
      {queueState === 'error' && (
        <span className="ft-err-inline">{queueErr}</span>
      )}
      <button
        className="ft-btn ft-btn--dismiss"
        onClick={handleDismiss}
        type="button"
        title="Dismiss (local only — no backend persistence in v1)"
      >
        Dismiss
      </button>
      <button
        className="ft-btn ft-btn--ghost"
        type="button"
        onClick={() => onReplay?.(item.analysis_id)}
        disabled={!item.analysis_id}
        title={!item.analysis_id ? 'No analysis_id on this record' : undefined}
      >
        Replay
      </button>
    </div>
  );
}

// ── Triage list ───────────────────────────────────────────

function TriageList({ items, type, loading, error, onDismiss, onReplay }) {
  const [visible, setVisible] = useState([]);

  // Sync visible list with items (preserve dismiss state)
  useEffect(() => {
    setVisible(items.map(it => it.id));
  }, [items]);

  function handleDismiss(id) {
    setVisible(prev => prev.filter(v => v !== id));
    if (onDismiss) onDismiss(id);
  }

  const shownItems = items.filter(it => visible.includes(it.id));

  if (loading) {
    return (
      <div className="ft-list">
        <table className="lo-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Field</th>
              <th>VLM Predicted</th>
              <th>CV Resolved</th>
              <th>Confidence</th>
              <th>Version</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5].map(i => <SkeletonRow key={i} />)}
          </tbody>
        </table>
      </div>
    );
  }

  if (error) {
    return (
      <p className="lo-empty lo-empty--err">
        {error}
      </p>
    );
  }

  if (shownItems.length === 0) {
    return (
      <p className="lo-empty">
        No items found for this threshold. Adjust threshold or check back after more analyses run.
      </p>
    );
  }

  return (
    <div className="ft-list">
      <div style={{ overflowX: 'auto' }}>
        <table className="lo-table" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Field</th>
              <th>VLM Predicted</th>
              <th>CV Resolved *</th>
              <th>VLM Conf</th>
              <th>Version / Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {shownItems.map(item => (
              <tr key={item.id} className="ft-row">
                <td className="ft-td">
                  <span style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-text-dim)',
                    fontFamily: 'monospace',
                  }}>
                    {item.field_name || '—'}
                  </span>
                </td>
                <td className="ft-td">
                  <span className={`ft-badge ${type === 'overconfident' ? 'ft-badge--mismatch' : 'ft-badge--match'}`}>
                    {item.predicted_pattern || '—'}
                  </span>
                </td>
                <td className="ft-td">
                  {item.ground_truth_pattern ? (
                    <span className={`ft-badge ${type === 'overconfident' ? 'ft-badge--match' : 'ft-badge--match'}`}>
                      {item.ground_truth_pattern}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--color-text-dim)' }}>—</span>
                  )}
                </td>
                <td className="ft-td">
                  <span className="ft-conf" style={{
                    color: confColor(item.confidence ?? 0, type),
                    fontWeight: 'var(--weight-semibold)',
                    fontVariantNumeric: 'tabular-nums',
                    fontSize: 'var(--text-sm)',
                  }}>
                    {item.confidence != null ? `${(item.confidence * 100).toFixed(1)}%` : '—'}
                  </span>
                </td>
                <td className="ft-td" style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)' }}>
                  <div>{item.pipeline_version || '—'}</div>
                  <div>{formatTs(item.created_at)}</div>
                </td>
                <td className="ft-td">
                  <RowActions
                    item={item}
                    type={type}
                    onDismiss={handleDismiss}
                    onReplay={onReplay}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{
        fontSize: 10,
        color: 'var(--color-text-dim)',
        marginTop: 8,
        marginBottom: 0,
      }}>
        * CV Resolved = CV resolver decision, not human-labeled ground truth.
        No image_path stored in this table — image preview not available.
        Dismiss is local-only (no backend persistence in v1).
      </p>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────

export default function FailureTriagePanel({ onReplay } = {}) {
  const [tab, setTab] = useState('overconfident');

  const [overItems,  setOverItems]  = useState([]);
  const [overLoad,   setOverLoad]   = useState(true);
  const [overErr,    setOverErr]    = useState(null);
  const [overTotal,  setOverTotal]  = useState(null);

  const [underItems, setUnderItems] = useState([]);
  const [underLoad,  setUnderLoad]  = useState(true);
  const [underErr,   setUnderErr]   = useState(null);
  const [underTotal, setUnderTotal] = useState(null);

  useEffect(() => {
    // Fetch both tabs on mount in parallel
    fetchOverconfidentFailures(OVERCONFIDENT_THRESHOLD, 50)
      .then(d => {
        setOverItems(d.items ?? []);
        setOverTotal(d.total ?? 0);
        setOverErr(null);
      })
      .catch(err => setOverErr(err.message || 'Failed to load overconfident failures'))
      .finally(() => setOverLoad(false));

    fetchUnderconfidentHits(UNDERCONFIDENT_THRESHOLD, 50)
      .then(d => {
        setUnderItems(d.items ?? []);
        setUnderTotal(d.total ?? 0);
        setUnderErr(null);
      })
      .catch(err => setUnderErr(err.message || 'Failed to load underconfident hits'))
      .finally(() => setUnderLoad(false));
  }, []);

  return (
    <div className="lo-panel">
      <div className="lo-panel__header">
        <span className="lo-panel__title">Failure Triage</span>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)' }}>
          VLM disagreement candidates
        </span>
      </div>

      {/* ── Tab strip ── */}
      <div className="ft-tabs" style={{ marginBottom: 'var(--space-md)' }}>
        <button
          type="button"
          className={`ft-tab${tab === 'overconfident' ? ' ft-tab--active' : ''}`}
          onClick={() => setTab('overconfident')}
        >
          Overconfident Misses
          {overTotal != null && !overLoad && (
            <span className="ft-tab__count">{overTotal}</span>
          )}
        </button>
        <button
          type="button"
          className={`ft-tab${tab === 'underconfident' ? ' ft-tab--active' : ''}`}
          onClick={() => setTab('underconfident')}
        >
          Underconfident Hits
          {underTotal != null && !underLoad && (
            <span className="ft-tab__count">{underTotal}</span>
          )}
        </button>
      </div>

      {/* ── Threshold badge ── */}
      <div style={{ marginBottom: 'var(--space-sm)', fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)' }}>
        {tab === 'overconfident'
          ? `Threshold: vlm_confidence \u2265 ${OVERCONFIDENT_THRESHOLD}`
          : `Threshold: vlm_confidence < ${UNDERCONFIDENT_THRESHOLD}`
        }
        {' \u2014 '}
        <span style={{ fontStyle: 'italic' }}>
          {tab === 'overconfident'
            ? 'VLM confident but disagreed with CV resolver'
            : 'VLM agreed with CV but appeared uncertain'
          }
        </span>
      </div>

      {/* ── Tab content ── */}
      {tab === 'overconfident' && (
        <TriageList
          items={overItems}
          type="overconfident"
          loading={overLoad}
          error={overErr}
          onReplay={onReplay}
        />
      )}
      {tab === 'underconfident' && (
        <TriageList
          items={underItems}
          type="underconfident"
          loading={underLoad}
          error={underErr}
          onReplay={onReplay}
        />
      )}
    </div>
  );
}
