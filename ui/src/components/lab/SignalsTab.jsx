/**
 * SignalsTab — Session Signals panel for the Lab screen.
 *
 * Displays:
 *   - Signal Hygiene card (live / seeded / internal / learning eligible / metrics eligible)
 *   - Source filter: Live | Seeded | Internal | All  (default: Live)
 *   - Headline KPIs (total sessions, success rate, top/worst pattern)
 *   - Per-pattern breakdown table (sortable)
 *   - Confidence calibration flags
 *   - Recent signals feed
 *   - Seed data trigger (dev only)
 *
 * Daily checks:
 *   - Total sessions increasing? → if not, ingestion is broken
 *   - Success rate stable?       → if dropping, check model
 *   - Any pattern collapsing?    → check worst_pattern in summary
 *
 * Weekly checks:
 *   - Pattern success rate
 *   - Conversion per pattern
 *   - Revenue per pattern
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getSignalSummary,
  getSignalPatterns,
  getSignalCalibration,
  getRecentSignals,
  getSignalHygiene,
  seedSignals,
} from '../../data/signalsApi';
import {
  getRecalibrationHints,
  getCalibrationByEnvironment,
} from '../../data/labApi';
import { pct, usd, relTime, fmtDateTime } from '../../lib/formatters';
import { C } from '../../lib/statusColors';
function outcomeClass(o) {
  if (o === 'nailed_it') return 'sig-outcome--success';
  if (o === 'close')     return 'sig-outcome--close';
  if (o === 'failed')    return 'sig-outcome--fail';
  return 'sig-outcome--unknown';
}
function outcomeLabel(o) {
  if (o === 'nailed_it') return 'Nailed It';
  if (o === 'close')     return 'Close';
  if (o === 'failed')    return 'Failed';
  return 'Unknown';
}
function sourceLabel(s) {
  if (s === 'live')          return 'Live';
  if (s === 'seeded')        return 'Seeded';
  if (s === 'internal')      return 'Internal';
  if (s === 'expert_review') return 'Expert';
  return s || '—';
}
function sourceBadgeClass(s) {
  if (s === 'live')          return 'sig-src--live';
  if (s === 'seeded')        return 'sig-src--seeded';
  if (s === 'internal')      return 'sig-src--internal';
  if (s === 'expert_review') return 'sig-src--expert';
  return '';
}

// ── Source Filter Bar ─────────────────────────────────────────────────────────

const SOURCE_OPTIONS = [
  { value: 'live',          label: 'Live' },
  { value: 'seeded',        label: 'Seeded' },
  { value: 'internal',      label: 'Internal' },
  { value: 'expert_review', label: 'Expert' },
  { value: 'all',           label: 'All' },
];

function SourceFilter({ source, onChange }) {
  return (
    <div className="sig-source-filter">
      <span className="sig-source-filter__label">Source</span>
      {SOURCE_OPTIONS.map(opt => (
        <button
          key={opt.value}
          className={`sig-source-btn ${source === opt.value ? 'sig-source-btn--active' : ''}`}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Hygiene Summary Card ──────────────────────────────────────────────────────

function HygieneCard({ hygiene, loading }) {
  if (loading) return <div className="sig-skel" style={{ height: 72 }} />;
  if (!hygiene) return null;

  const items = [
    { label: 'Live Sessions',     value: hygiene.live,               highlight: true },
    { label: 'Seeded',            value: hygiene.seeded,             highlight: false },
    { label: 'Internal',          value: hygiene.internal,           highlight: false },
    { label: 'Learning Eligible', value: hygiene.learning_eligible,  highlight: true },
    { label: 'Metrics Eligible',  value: hygiene.metrics_eligible,   highlight: true },
  ];

  return (
    <div className="sig-hygiene-card">
      <div className="sig-hygiene-card__title">Signal Hygiene</div>
      <div className="sig-hygiene-card__row">
        {items.map(item => (
          <div key={item.label}
            className={`sig-hygiene-kpi ${item.highlight ? 'sig-hygiene-kpi--hi' : ''}`}>
            <span className="sig-hygiene-kpi__val">{item.value ?? '—'}</span>
            <span className="sig-hygiene-kpi__label">{item.label}</span>
          </div>
        ))}
        <div className="sig-hygiene-kpi sig-hygiene-kpi--total">
          <span className="sig-hygiene-kpi__val">{hygiene.total ?? '—'}</span>
          <span className="sig-hygiene-kpi__label">Total</span>
        </div>
      </div>
      {hygiene.unknown_count > 0 && hygiene.live > 0 && (hygiene.unknown_count / hygiene.live) > 0.30 && (
        <div className="sig-error" style={{ marginTop: 8 }}>
          ⚠ {hygiene.unknown_count} unknown outcomes ({Math.round(hygiene.unknown_count / hygiene.live * 100)}% of live signals). High unknown rate degrades learning quality — consider adding outcome prompts.
        </div>
      )}
    </div>
  );
}

// ── Summary KPI Bar ───────────────────────────────────────────────────────────

function SummaryBar({ summary }) {
  if (!summary) return <div className="sig-skel" style={{ height: 80 }} />;

  const successColor = summary.success_rate > 0.65 ? 'var(--color-success)'
    : summary.success_rate > 0.40 ? 'var(--color-warning)'
    : 'var(--color-error)';

  return (
    <div className="sig-summary-bar">
      <div className="sig-kpi">
        <span className="sig-kpi__val" style={{ color: successColor }}>
          {pct(summary.success_rate)}
        </span>
        <span className="sig-kpi__label">Success Rate</span>
      </div>
      <div className="sig-kpi">
        <span className="sig-kpi__val">{summary.total_sessions ?? '—'}</span>
        <span className="sig-kpi__label">Sessions</span>
      </div>
      <div className="sig-kpi">
        <span className="sig-kpi__val">{pct(summary.conversion_rate)}</span>
        <span className="sig-kpi__label">Conversion</span>
      </div>
      <div className="sig-kpi">
        <span className="sig-kpi__val">{usd(summary.revenue_total)}</span>
        <span className="sig-kpi__label">Revenue</span>
      </div>
      <div className="sig-kpi sig-kpi--highlight">
        <span className="sig-kpi__tag sig-kpi__tag--top">↑ best</span>
        <span className="sig-kpi__val sig-kpi__val--sm">
          {summary.top_pattern || '—'}
        </span>
        <span className="sig-kpi__label">Top Pattern</span>
      </div>
      <div className="sig-kpi sig-kpi--warn">
        <span className="sig-kpi__tag sig-kpi__tag--worst">↓ worst</span>
        <span className="sig-kpi__val sig-kpi__val--sm">
          {summary.worst_pattern || '—'}
        </span>
        <span className="sig-kpi__label">Worst Pattern</span>
      </div>
    </div>
  );
}

// ── Pattern Table ─────────────────────────────────────────────────────────────

const PAT_COLS = [
  { key: 'pattern_id',       label: 'Pattern',    fmt: v => v },
  { key: 'sessions',         label: 'Sessions',   fmt: v => v },
  { key: 'success_rate',     label: 'Success',    fmt: v => pct(v) },
  { key: 'close_rate',       label: 'Close',      fmt: v => pct(v) },
  { key: 'fail_rate',        label: 'Failed',     fmt: v => pct(v) },
  { key: 'avg_confidence',   label: 'Avg Conf',   fmt: v => pct(v) },
  { key: 'conversions',      label: 'Conv',       fmt: v => v },
  { key: 'revenue',          label: 'Revenue',    fmt: v => usd(v) },
  { key: 'avg_deviations',   label: 'Deviations', fmt: v => v?.toFixed(1) ?? '—' },
];

function PatternTable({ patterns, loading }) {
  const [sortKey, setSortKey] = useState('success_rate');
  const [sortDir, setSortDir] = useState('desc');
  const [expandedPat, setExpandedPat] = useState(null);

  if (loading) return <div className="sig-skel" style={{ height: 160 }} />;
  if (!patterns || patterns.length === 0) {
    return (
      <div className="sig-empty">
        No pattern data yet.{' '}
        <span className="sig-empty__hint">Try seeding the database below.</span>
      </div>
    );
  }

  const sorted = [...patterns].sort((a, b) => {
    const av = a[sortKey] ?? -Infinity;
    const bv = b[sortKey] ?? -Infinity;
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  // Total columns = PAT_COLS.length + 1 (expand indicator column)
  const totalCols = PAT_COLS.length + 1;

  return (
    <div className="sig-table-wrap">
      <table className="sig-table">
        <thead>
          <tr>
            {/* Expand indicator column — no sort */}
            <th className="sig-table__th" style={{ width: 20, padding: '4px 6px', cursor: 'default' }} />
            {PAT_COLS.map(c => (
              <th key={c.key} className="sig-table__th"
                onClick={() => toggleSort(c.key)}>
                {c.label}
                {sortKey === c.key && (
                  <span className="sig-sort">{sortDir === 'asc' ? '↑' : '↓'}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map(p => {
            const rowClass = p.success_rate > 0.70 ? 'sig-row--good'
              : p.success_rate < 0.35 ? 'sig-row--bad' : '';
            const isExpanded = expandedPat === p.pattern_id;

            // Derived values for expanded panel
            const successVal  = p.success_rate  ?? 0;
            const closeVal    = p.close_rate    ?? 0;
            const failVal     = p.fail_rate     ?? 0;
            const avgConf     = p.avg_confidence ?? 0;
            const gap         = avgConf - successVal;
            const gapColor    = gap > 0.30 ? C.red : gap > 0.15 ? C.amber : C.green;
            const gapLabel    = gap <= 0.10 ? 'calibrated ✓' : gap > 0.30 ? 'severely overconfident' : 'overconfident';
            const revPerSess  = p.sessions > 0 ? ((p.revenue ?? 0) / p.sessions).toFixed(2) : '—';
            const cvr         = p.sessions > 0 ? pct((p.conversions ?? 0) / p.sessions) : '—';
            const devVal      = p.avg_deviations ?? 0;
            const devColor    = devVal <= 2 ? C.green : devVal <= 4 ? C.amber : C.red;

            return (
              <>
                <tr
                  key={p.pattern_id}
                  className={`sig-table__row ${rowClass}`}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setExpandedPat(e => e === p.pattern_id ? null : p.pattern_id)}
                >
                  <td className="sig-table__td" style={{ width: 20, padding: '4px 6px', color: 'var(--color-text-dim)', fontSize: 11 }}>
                    {isExpanded ? '▾' : '▸'}
                  </td>
                  {PAT_COLS.map(c => (
                    <td key={c.key} className="sig-table__td">
                      {c.fmt ? c.fmt(p[c.key]) : (p[c.key] ?? '—')}
                    </td>
                  ))}
                </tr>
                {isExpanded && (
                  <tr key={`${p.pattern_id}__expand`}>
                    <td colSpan={totalCols} style={{ padding: 0 }}>
                      <div style={{
                        background: 'var(--color-surface)',
                        borderTop: '1px solid var(--color-border)',
                        padding: 'var(--space-sm) var(--space-md)',
                        fontSize: 'var(--text-xs)',
                      }}>
                        {/* Outcome breakdown bar */}
                        <div style={{ marginBottom: 10 }}>
                          <div style={{ color: 'var(--color-text-dim)', marginBottom: 4, fontWeight: 'var(--weight-semibold)' }}>
                            Outcome Breakdown
                          </div>
                          <div style={{ display: 'flex', height: 18, borderRadius: 4, overflow: 'hidden', marginBottom: 4 }}>
                            <div style={{ width: `${successVal * 100}%`, background: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff', fontWeight: 600 }}>
                              {successVal > 0.1 && pct(successVal)}
                            </div>
                            <div style={{ width: `${closeVal * 100}%`, background: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff', fontWeight: 600 }}>
                              {closeVal > 0.1 && pct(closeVal)}
                            </div>
                            <div style={{ width: `${failVal * 100}%`, background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff', fontWeight: 600 }}>
                              {failVal > 0.1 && pct(failVal)}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 12, fontSize: 10, color: 'var(--color-text-dim)' }}>
                            <span><span style={{ color: '#22c55e' }}>■</span> Nailed It {pct(successVal)}</span>
                            <span><span style={{ color: '#f59e0b' }}>■</span> Close {pct(closeVal)}</span>
                            <span><span style={{ color: '#ef4444' }}>■</span> Failed {pct(failVal)}</span>
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '8px 20px' }}>
                          {/* Calibration status */}
                          <div>
                            <span style={{ color: 'var(--color-text-dim)', display: 'block', marginBottom: 2 }}>Calibration</span>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              <span>Conf <strong>{pct(avgConf)}</strong></span>
                              <span style={{ color: 'var(--color-text-dim)' }}>vs</span>
                              <span>Success <strong>{pct(successVal)}</strong></span>
                            </div>
                            <div style={{ marginTop: 2 }}>
                              <span style={{ color: gapColor, fontWeight: 'var(--weight-semibold)' }}>
                                Gap {gap > 0 ? '+' : ''}{pct(gap)} — {gapLabel}
                              </span>
                            </div>
                          </div>

                          {/* Economics */}
                          <div>
                            <span style={{ color: 'var(--color-text-dim)', display: 'block', marginBottom: 2 }}>Economics</span>
                            <div style={{ display: 'flex', gap: 12 }}>
                              <div>
                                <span style={{ color: 'var(--color-text-dim)', display: 'block' }}>Rev / Session</span>
                                <span style={{ color: 'var(--color-text)', fontFamily: 'var(--font-mono)' }}>${revPerSess}</span>
                              </div>
                              <div>
                                <span style={{ color: 'var(--color-text-dim)', display: 'block' }}>CVR</span>
                                <span style={{ color: 'var(--color-text)', fontFamily: 'var(--font-mono)' }}>{cvr}</span>
                              </div>
                            </div>
                          </div>

                          {/* Deviations */}
                          <div>
                            <span style={{ color: 'var(--color-text-dim)', display: 'block', marginBottom: 2 }}>Avg Deviations</span>
                            <span style={{ color: devColor, fontWeight: 'var(--weight-semibold)' }}>
                              {devVal?.toFixed(1) ?? '—'}
                            </span>
                            <span style={{ color: 'var(--color-text-dim)', marginLeft: 6 }}>
                              (good: &lt;2)
                            </span>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Calibration Panel ─────────────────────────────────────────────────────────

function CalibrationPanel({ calibration, days }) {
  const [calView, setCalView] = useState('by_pattern'); // by_pattern | by_env
  const [hints, setHints] = useState(null);
  const [hintsLoading, setHintsLoading] = useState(false);
  const [envCal, setEnvCal] = useState(null);
  const [envCalLoading, setEnvCalLoading] = useState(false);

  useEffect(() => {
    setHintsLoading(true);
    getRecalibrationHints(days || 30)
      .then(d => setHints(d.hints || []))
      .catch(() => setHints([]))
      .finally(() => setHintsLoading(false));
  }, [days]);

  useEffect(() => {
    if (calView !== 'by_env') return;
    setEnvCalLoading(true);
    getCalibrationByEnvironment(days || 30)
      .then(d => setEnvCal(d.calibration || []))
      .catch(() => setEnvCal([]))
      .finally(() => setEnvCalLoading(false));
  }, [calView, days]);

  if (!calibration || calibration.length === 0) return null;

  const flags = calibration.filter(c => c.flag !== 'calibrated');

  return (
    <div>
      {/* Toggle */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {['by_pattern', 'by_env'].map(v => (
          <button
            key={v}
            className={`sig-tab-btn ${calView === v ? 'sig-tab-btn--active' : ''}`}
            onClick={() => setCalView(v)}
          >
            {v === 'by_pattern' ? 'By Pattern' : 'By Environment'}
          </button>
        ))}
      </div>

      {calView === 'by_pattern' && (
        <>
          {flags.length === 0 ? (
            <div className="sig-cal-ok">All patterns calibrated — confidence matches outcomes.</div>
          ) : (
            <div className="sig-cal-list">
              {flags.map(c => (
                <div key={c.pattern_id}
                  className={`sig-cal-item ${c.flag === 'overconfident' ? 'sig-cal-item--over' : 'sig-cal-item--under'}`}>
                  <span className="sig-cal-pat">{c.pattern_id}</span>
                  <span className="sig-cal-flag">
                    {c.flag === 'overconfident' ? '⚠ Overconfident' : '↓ Underconfident'}
                  </span>
                  <span className="sig-cal-detail">
                    conf {pct(c.avg_confidence)} vs success {pct(c.success_rate)}
                    {' '}(gap {c.calibration_gap > 0 ? '+' : ''}{pct(c.calibration_gap)})
                  </span>
                  <span className="sig-cal-sessions">{c.sessions} sessions</span>
                </div>
              ))}
            </div>
          )}

          {/* Recalibration hints */}
          {!hintsLoading && hints && hints.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div className="sig-section__title" style={{ marginBottom: 6 }}>Recalibration Suggestions</div>
              {hints.map(h => (
                <div key={h.pattern_id} style={{
                  padding: '6px 10px', marginBottom: 4,
                  background: 'var(--color-warning-subtle)',
                  border: '1px solid color-mix(in srgb, var(--color-warning) 25%, transparent)',
                  borderRadius: 6, fontSize: 'var(--text-xs)',
                  color: 'var(--color-warning)',
                }}>
                  → {h.action}
                  <span style={{ color: 'var(--color-text-dim)', marginLeft: 8 }}>
                    ({h.sessions} sessions, gap {pct(h.calibration_gap)})
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {calView === 'by_env' && (
        <>
          {envCalLoading ? (
            <div className="sig-skel" style={{ height: 100 }} />
          ) : !envCal || envCal.length === 0 ? (
            <div className="sig-empty">No environment-segmented calibration data yet (need ≥3 sessions per pattern+env).</div>
          ) : (
            <div className="sig-table-wrap">
              <table className="sig-table">
                <thead>
                  <tr>
                    <th className="sig-table__th">Pattern</th>
                    <th className="sig-table__th">Environment</th>
                    <th className="sig-table__th">Confidence</th>
                    <th className="sig-table__th">Success Rate</th>
                    <th className="sig-table__th">Gap</th>
                    <th className="sig-table__th">Flag</th>
                  </tr>
                </thead>
                <tbody>
                  {envCal.map((r, i) => (
                    <tr key={i} className="sig-table__row">
                      <td className="sig-table__td">{r.pattern_id}</td>
                      <td className="sig-table__td">{r.environment}</td>
                      <td className="sig-table__td">{pct(r.avg_confidence)}</td>
                      <td className="sig-table__td">{pct(r.success_rate)}</td>
                      <td className="sig-table__td" style={{
                        color: r.flag === 'overconfident' ? 'var(--color-warning)' : r.flag === 'underconfident' ? 'var(--color-accent)' : 'inherit',
                      }}>
                        {r.calibration_gap != null ? (r.calibration_gap > 0 ? '+' : '') + pct(r.calibration_gap) : '—'}
                      </td>
                      <td className="sig-table__td">{r.flag}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Recent Feed ───────────────────────────────────────────────────────────────

function RecentFeed({ recent }) {
  const [expandedSig, setExpandedSig] = useState(null);

  if (!recent || recent.length === 0) {
    return <div className="sig-empty">No signals recorded yet.</div>;
  }

  function fmtFieldValue(key, val) {
    if (val == null) return null;
    if (key === 'confidence_score') return pct(val);
    if (key === 'revenue_value')    return usd(val);
    if (key === 'created_at')       return fmtDateTime(val);
    return String(val);
  }

  const ID_KEYS = new Set(['id', 'session_id', 'user_id', 'pattern_id']);

  return (
    <div className="sig-feed">
      {recent.slice(0, 20).map(s => {
        const isExpanded = expandedSig === s.id;
        return (
          <div key={s.id}>
            <div
              className="sig-feed-row"
              style={{ cursor: 'pointer' }}
              onClick={() => setExpandedSig(e => e === s.id ? null : s.id)}
            >
              <span className={`sig-outcome ${outcomeClass(s.outcome)}`}>
                {outcomeLabel(s.outcome)}
              </span>
              <span className="sig-feed-pat">{s.pattern_id}</span>
              {s.confidence_score != null && (
                <span className="sig-feed-conf">{pct(s.confidence_score)}</span>
              )}
              {s.signal_source && s.signal_source !== 'live' && (
                <span className={`sig-src-badge ${sourceBadgeClass(s.signal_source)}`}>
                  {sourceLabel(s.signal_source)}
                </span>
              )}
              {s.environment && (
                <span className="sig-feed-env">{s.environment}</span>
              )}
              {s.revenue_value > 0 && (
                <span className="sig-feed-rev">{usd(s.revenue_value)}</span>
              )}
              <span className="sig-feed-time">{relTime(s.created_at)}</span>
              <span style={{ marginLeft: 'auto', color: 'var(--color-text-dim)', fontSize: 11 }}>
                {isExpanded ? '▾' : '▸'}
              </span>
            </div>
            {isExpanded && (
              <div style={{
                background: 'var(--color-surface)',
                borderTop: '1px solid var(--color-border)',
                padding: 'var(--space-sm) var(--space-md)',
                fontSize: 'var(--text-xs)',
                marginBottom: 2,
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '4px 16px' }}>
                  {Object.entries(s)
                    .filter(([, v]) => v != null)
                    .map(([k, v]) => {
                      const formatted = fmtFieldValue(k, v);
                      if (formatted == null) return null;
                      const isMono = ID_KEYS.has(k);
                      return (
                        <div key={k}>
                          <span style={{ color: 'var(--color-text-dim)', display: 'block' }}>
                            {k.replace(/_/g, ' ')}
                          </span>
                          <span style={{
                            color: 'var(--color-text)',
                            fontFamily: isMono ? 'var(--font-mono)' : undefined,
                            wordBreak: 'break-all',
                          }}>
                            {formatted}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Seed Control ──────────────────────────────────────────────────────────────

function SeedControl({ onSeeded }) {
  const [loading,   setLoading]   = useState(false);
  const [result,    setResult]    = useState(null);
  const clearTimer = useRef(null);

  function showResult(r) {
    setResult(r);
    clearTimeout(clearTimer.current);
    clearTimer.current = setTimeout(() => setResult(null), 5000);
  }

  async function handleSeed(force) {
    if (force && !window.confirm(
      'Force reseed will delete all existing seeded rows and insert 45 fresh ones.\n\nContinue?'
    )) return;
    setLoading(true);
    try {
      const r = await seedSignals(force);
      showResult(r);
      onSeeded();
    } catch (e) {
      showResult({ error: e.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="sig-seed">
      <div className="sig-seed__title">Bootstrap Seed Data</div>
      <div className="sig-seed__desc">
        Insert 45 synthetic rows across 5 patterns for immediate testing.
        All seeded rows have <code>signal_source=&apos;seeded&apos;</code> and
        are excluded from production analytics, learning, and conversion metrics.
      </div>
      <div className="sig-seed__btns">
        <button className="btn btn--secondary btn--sm" onClick={() => handleSeed(false)}
          disabled={loading}>
          {loading ? 'Seeding…' : 'Seed (if empty)'}
        </button>
        <button className="btn btn--ghost btn--sm" onClick={() => handleSeed(true)}
          disabled={loading}>
          Force reseed
        </button>
      </div>
      {result && (
        <div className={`sig-seed__result ${result.error ? 'sig-seed__result--err' : ''}`}>
          {result.error
            ? `Error: ${result.error}`
            : `✓ ${result.message || `Inserted ${result.inserted} rows`}`}
        </div>
      )}
    </div>
  );
}

// ── Main Tab ──────────────────────────────────────────────────────────────────

export default function SignalsTab() {
  const [days,        setDays]        = useState(30);
  const [source,      setSource]      = useState('live');   // default: live only
  const [hygiene,     setHygiene]     = useState(null);
  const [hygieneLoad, setHygieneLoad] = useState(true);
  const [hygieneErr,  setHygieneErr]  = useState(null);
  const [summary,     setSummary]     = useState(null);
  const [patterns,    setPatterns]    = useState([]);
  const [calibration, setCalibration] = useState([]);
  const [recent,      setRecent]      = useState([]);
  const [patLoading,  setPatLoading]  = useState(true);
  const [patError,    setPatError]    = useState(null);
  const [view,        setView]        = useState('patterns'); // patterns | calibration | recent

  // Hygiene is source-independent — always fetch all rows
  const loadHygiene = useCallback(async (signal) => {
    setHygieneLoad(true);
    setHygieneErr(null);
    try {
      setHygiene(await getSignalHygiene());
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error('[SignalsTab] hygiene load failed', e);
        setHygieneErr(e.message || 'Failed to load hygiene');
      }
    } finally {
      setHygieneLoad(false);
    }
  }, []);

  const loadAll = useCallback(async (signal) => {
    setPatLoading(true);
    setPatError(null);
    try {
      const [sum, pats, cal, rec] = await Promise.all([
        getSignalSummary(days, source),
        getSignalPatterns(days, source),
        getSignalCalibration(days, source),
        getRecentSignals(20, null, source),
      ]);
      if (signal?.aborted) return;
      setSummary(sum);
      setPatterns(pats);
      setCalibration(cal);
      setRecent(rec);
    } catch (e) {
      if (e.name !== 'AbortError') {
        console.error('[SignalsTab] load failed', e);
        setPatError(e.message || 'Failed to load signals');
      }
    } finally {
      if (!signal?.aborted) setPatLoading(false);
    }
  }, [days, source]);

  useEffect(() => {
    const ctrl = new AbortController();
    loadHygiene(ctrl.signal);
    return () => ctrl.abort();
  }, [loadHygiene]);

  useEffect(() => {
    const ctrl = new AbortController();
    loadAll(ctrl.signal);
    return () => ctrl.abort();
  }, [loadAll]);

  function handleSeeded() {
    loadHygiene();
    loadAll();
  }

  return (
    <div className="sig-tab">
      {/* Header */}
      <div className="sig-header">
        <div className="sig-header__left">
          <h3 className="sig-title">Session Signals</h3>
          <span className="sig-tagline">Did they get the shot?</span>
        </div>
        <div className="sig-header__right">
          <select className="sig-day-select"
            value={days} onChange={e => setDays(Number(e.target.value))}>
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
          </select>
          <button className="btn btn--ghost btn--sm" onClick={() => { loadHygiene(); loadAll(); }}>
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Hygiene Card */}
      <HygieneCard hygiene={hygiene} loading={hygieneLoad} />
      {hygieneErr && (
        <div className="sig-error">⚠ Hygiene: {hygieneErr}</div>
      )}

      {/* Source Filter */}
      <SourceFilter source={source} onChange={val => { setSource(val); }} />

      {/* KPI Bar */}
      {patError ? (
        <div className="sig-error">⚠ {patError} — <button className="sig-error__retry" onClick={() => loadAll()}>Retry</button></div>
      ) : (
        <SummaryBar summary={summary} />
      )}

      {/* View toggle */}
      <div className="sig-tabs">
        {['patterns', 'calibration', 'recent'].map(v => (
          <button key={v}
            className={`sig-tab-btn ${view === v ? 'sig-tab-btn--active' : ''}`}
            onClick={() => setView(v)}>
            {v === 'patterns'    ? 'Pattern Table' :
             v === 'calibration' ? 'Calibration'   : 'Recent Feed'}
          </button>
        ))}
      </div>

      {/* Content */}
      {view === 'patterns' && (
        <PatternTable patterns={patterns} loading={patLoading} />
      )}
      {view === 'calibration' && (
        <div className="sig-section">
          <div className="sig-section__title">Confidence Calibration</div>
          <div className="sig-section__sub">
            Overconfident patterns = model says high probability, users fail.
            These flag for confidence recalibration.
          </div>
          <CalibrationPanel calibration={calibration} days={days} />
        </div>
      )}
      {view === 'recent' && (
        <RecentFeed recent={recent} />
      )}

      {/* Operation Manual */}
      <details className="sig-manual">
        <summary className="sig-manual__toggle">Operation Manual</summary>
        <div className="sig-manual__body">
          <div className="sig-manual__section">
            <div className="sig-manual__title">Signal Sources</div>
            <ul>
              <li><strong>Live</strong> — real user sessions. Included in all analytics.</li>
              <li><strong>Seeded</strong> — bootstrap/synthetic data. Excluded from all analytics.</li>
              <li><strong>Internal</strong> — developer/admin sessions. Excluded from all analytics.</li>
              <li><strong>Expert Review</strong> — curator sessions. Excluded from all analytics.</li>
            </ul>
          </div>
          <div className="sig-manual__section">
            <div className="sig-manual__title">Daily Checks</div>
            <ul>
              <li>Total live sessions increasing? → if not, ingestion is broken</li>
              <li>Success rate stable? → if dropping, check model accuracy</li>
              <li>Any pattern collapsing? → see worst_pattern above</li>
            </ul>
          </div>
          <div className="sig-manual__section">
            <div className="sig-manual__title">Weekly Checks</div>
            <ul>
              <li>Hygiene card: live vs seeded counts healthy?</li>
              <li>Pattern success rates — which are improving?</li>
              <li>Conversion per pattern — what pattern converts best?</li>
              <li>Revenue per pattern — where is monetization landing?</li>
            </ul>
          </div>
          <div className="sig-manual__section">
            <div className="sig-manual__title">🚩 Red Flags</div>
            <ul>
              <li><strong>Zero live sessions</strong> → ingestion is broken</li>
              <li><strong>Live count = Total</strong> → no seeded baseline (run Seed below)</li>
              <li><strong>All outcomes identical</strong> → outcome capture UI is broken</li>
              <li><strong>High confidence + failure</strong> → model is miscalibrated</li>
            </ul>
          </div>
        </div>
      </details>

      {/* Bootstrap */}
      <SeedControl onSeeded={handleSeeded} />
    </div>
  );
}
