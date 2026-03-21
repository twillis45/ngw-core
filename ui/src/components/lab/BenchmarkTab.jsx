/**
 * BenchmarkTab — Benchmark System v2 dashboard.
 *
 * Sections:
 *   GlobalMetrics    — overall score, trend sparkline, pass/fail badge
 *   RegressionAlerts — critical / warning / alert banners
 *   PatternTable     — per-pattern score, delta, live success, confidence error
 *   FailureInsights  — auto-generated plain-language findings
 *   CaseExplorer     — expandable per-case results with blueprint diff
 *   CaseCreator      — form to create or promote a benchmark case
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  triggerBenchmarkRun,
  listBenchmarkRuns,
  getBenchmarkRunResults,
  getBenchmarkPatternMetrics,
  getBenchmarkSummary,
  listBenchmarkCases,
  createBenchmarkCase,
  deleteBenchmarkCase,
  promoteGoldSetToBenchmark,
  listGoldSet,
  triggerDriftCheck,
  getDriftConfig,
} from '../../data/labApi';
import { pct, ts, relTime } from '../../lib/formatters';

// ── Local helpers (not shared) ─────────────────────────────────────────────────

function score(v, decimals = 3) {
  if (v == null) return '—';
  return Number(v).toFixed(decimals);
}

// ── Score badge ───────────────────────────────────────────────────────────────

function ScoreBadge({ value, large }) {
  if (value == null) return <span className="bm-badge bm-badge--neutral">—</span>;
  const cls = value >= 0.8 ? 'good' : value >= 0.6 ? 'warn' : 'bad';
  return (
    <span className={`bm-badge bm-badge--${cls}${large ? ' bm-badge--lg' : ''}`}>
      {pct(value)}
    </span>
  );
}

// ── Status chip ───────────────────────────────────────────────────────────────

function StatusChip({ status }) {
  const map = {
    completed:       { label: 'Passed',   cls: 'good' },
    blocked:         { label: 'Blocked',  cls: 'bad'  },
    running:         { label: 'Running',  cls: 'warn' },
    failed:          { label: 'Failed',   cls: 'bad'  },
    completed_empty: { label: 'No Cases', cls: 'neutral' },
  };
  const { label, cls } = map[status] || { label: status, cls: 'neutral' };
  return <span className={`bm-chip bm-chip--${cls}`}>{label}</span>;
}

// ── Sparkline ─────────────────────────────────────────────────────────────────

function Sparkline({ values }) {
  if (!values || values.length < 2) return null;
  const w = 80, h = 28, pad = 3;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const color = values[0] >= values[values.length - 1] ? '#ef4444' : '#22c55e';
  return (
    <svg width={w} height={h} className="bm-sparkline" aria-hidden="true">
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Latest value dot */}
      <circle cx={pts[0].split(',')[0]} cy={pts[0].split(',')[1]} r="2.5" fill={color} />
    </svg>
  );
}

// ── Delta chip ────────────────────────────────────────────────────────────────

function Delta({ value }) {
  if (value == null) return <span className="bm-delta bm-delta--neutral">—</span>;
  const positive = value >= 0;
  const cls = Math.abs(value) < 0.005 ? 'neutral' : positive ? 'up' : 'down';
  return (
    <span className={`bm-delta bm-delta--${cls}`}>
      {positive ? '+' : ''}{pct(value)}
    </span>
  );
}

// ── Regression alerts ─────────────────────────────────────────────────────────

function RegressionAlerts({ regressions }) {
  if (!regressions || regressions.length === 0) return null;

  const severityOrder = { critical: 0, warning: 1, alert: 2 };
  const sorted = [...regressions].sort(
    (a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9)
  );

  return (
    <div className="bm-alerts">
      {sorted.map((r, i) => (
        <div key={i} className={`bm-alert bm-alert--${r.severity}`}>
          <span className="bm-alert__icon">
            {r.severity === 'critical' ? '🚫' : r.severity === 'warning' ? '⚠️' : 'ℹ️'}
          </span>
          <div className="bm-alert__body">
            <span className="bm-alert__tag">
              {r.severity === 'critical' ? 'BLOCKED' : r.severity.toUpperCase()}
            </span>
            <span className="bm-alert__msg">{r.message}</span>
            {r.pattern_id && (
              <span className="bm-alert__detail">Pattern: {r.pattern_id}</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Global metrics header ─────────────────────────────────────────────────────

function GlobalMetrics({ summary, trend, onRun, running }) {
  if (!summary?.has_runs) {
    return (
      <div className="bm-empty-state">
        <p className="bm-empty-state__title">No benchmark runs yet</p>
        <p className="bm-empty-state__sub">
          Add benchmark cases, then trigger a run to measure pipeline performance.
        </p>
        <button
          className="btn btn--primary btn--sm"
          onClick={onRun}
          disabled={running}
          type="button"
        >
          {running ? 'Running…' : 'Run First Benchmark'}
        </button>
      </div>
    );
  }

  return (
    <div className="bm-global">
      <div className="bm-global__left">
        <div className="bm-global__score-row">
          <ScoreBadge value={summary.overall_score} large />
          <StatusChip status={summary.status} />
          {trend && trend.length >= 2 && <Sparkline values={trend} />}
        </div>
        <p className="bm-global__sub">
          {summary.passed_cases}/{summary.total_cases} cases passed ·{' '}
          {relTime(summary.completed_at)}
        </p>
      </div>

      <div className="bm-global__metrics">
        <div className="bm-metric">
          <span className="bm-metric__label">Pattern Accuracy</span>
          <span className="bm-metric__val">{pct(summary.pattern_accuracy)}</span>
        </div>
        <div className="bm-metric">
          <span className="bm-metric__label">Blueprint Score</span>
          <span className="bm-metric__val">{pct(summary.avg_blueprint_score)}</span>
        </div>
        <div className="bm-metric">
          <span className="bm-metric__label">Confidence Error</span>
          <span className={`bm-metric__val ${Math.abs(summary.confidence_error || 0) > 0.2 ? 'bm-metric__val--warn' : ''}`}>
            {summary.confidence_error != null ? `±${Number(summary.confidence_error).toFixed(3)}` : '—'}
          </span>
        </div>
        {summary.regression_count > 0 && (
          <div className="bm-metric">
            <span className="bm-metric__label">Regressions</span>
            <span className="bm-metric__val bm-metric__val--bad">{summary.regression_count}</span>
          </div>
        )}
      </div>

      <button
        className="btn btn--ghost btn--sm bm-run-btn"
        onClick={onRun}
        disabled={running}
        type="button"
      >
        {running ? 'Running…' : 'Re-run Benchmark'}
      </button>
    </div>
  );
}

// ── Pattern table ─────────────────────────────────────────────────────────────

function PatternTable({ metrics }) {
  const [sort, setSort] = useState({ key: 'benchmark_score', dir: 'desc' });

  if (!metrics || metrics.length === 0) {
    return (
      <p className="bm-table-empty">
        No pattern data yet. Run a benchmark to populate this table.
      </p>
    );
  }

  function toggleSort(key) {
    setSort(s => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));
  }

  const sorted = [...metrics].sort((a, b) => {
    const av = a[sort.key] ?? -Infinity;
    const bv = b[sort.key] ?? -Infinity;
    return sort.dir === 'desc' ? bv - av : av - bv;
  });

  const COLS = [
    { key: 'pattern_id',       label: 'Pattern',           fmt: v => v },
    { key: 'benchmark_score',  label: 'Benchmark Score',   fmt: pct },
    { key: 'delta_change',     label: 'Δ vs Prev',         fmt: v => <Delta value={v} /> },
    { key: 'live_success_rate',label: 'Live Success',      fmt: pct },
    { key: 'confidence_error', label: 'Conf. Error',       fmt: v => v != null ? `±${Number(v).toFixed(3)}` : '—' },
    { key: 'run_count',        label: 'Runs',              fmt: v => v ?? '—' },
  ];

  return (
    <div className="bm-table-wrap">
      <table className="bm-table">
        <thead>
          <tr>
            {COLS.map(c => (
              <th
                key={c.key}
                className={`bm-table__th${sort.key === c.key ? ' bm-table__th--active' : ''}`}
                onClick={() => toggleSort(c.key)}
                title={`Sort by ${c.label}`}
              >
                {c.label}
                {sort.key === c.key && (
                  <span className="bm-sort-arrow">{sort.dir === 'desc' ? ' ↓' : ' ↑'}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map(m => (
            <tr key={m.pattern_id} className="bm-table__row">
              {COLS.map(c => (
                <td key={c.key} className="bm-table__td">
                  {c.key === 'benchmark_score' ? (
                    <ScoreBadge value={m[c.key]} />
                  ) : (
                    c.fmt(m[c.key])
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Failure insights ──────────────────────────────────────────────────────────

function FailureInsights({ insights }) {
  if (!insights || insights.length === 0) return null;

  return (
    <div className="bm-insights">
      <p className="bm-insights__heading">Auto-detected Issues</p>
      <ul className="bm-insights__list">
        {insights.map((line, i) => (
          <li key={i} className="bm-insights__item">
            <span className="bm-insights__bullet">›</span>
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Case explorer ─────────────────────────────────────────────────────────────

function CaseExplorer({ runId }) {
  const [results, setResults]   = useState(null);
  const [loading, setLoading]   = useState(false);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    if (!runId) return;
    setLoading(true);
    getBenchmarkRunResults(runId)
      .then(d => setResults(d.results || []))
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, [runId]);

  if (!runId)     return <p className="bm-dim">Select a run above to explore cases.</p>;
  if (loading)    return <p className="bm-dim">Loading results…</p>;
  if (!results)   return null;
  if (results.length === 0) return <p className="bm-dim">No results in this run.</p>;

  return (
    <div className="bm-cases">
      {results.map(r => {
        const open = expanded === r.id;
        const rowCls = [
          'bm-case',
          r.regression_flag ? 'bm-case--regression' : '',
          r.error_msg       ? 'bm-case--error'      : '',
        ].filter(Boolean).join(' ');

        return (
          <div key={r.id} className={rowCls}>
            <button
              className="bm-case__header"
              onClick={() => setExpanded(open ? null : r.id)}
              type="button"
            >
              <span className="bm-case__pattern">{r.pattern_id}</span>
              <span className="bm-case__image">{r.image_path?.split('/').pop()}</span>
              <ScoreBadge value={r.final_score} />
              {r.regression_flag && <span className="bm-case__flag">REGRESSION</span>}
              {r.error_msg && <span className="bm-case__flag bm-case__flag--error">ERROR</span>}
              <svg className={`bm-case__chevron${open ? ' bm-case__chevron--open' : ''}`}
                width="12" height="12" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2.5"
                strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>

            {open && (
              <div className="bm-case__body">
                {r.error_msg ? (
                  <div className="bm-case__error-msg">
                    <strong>Error:</strong> {r.error_msg}
                  </div>
                ) : (
                  <div className="bm-case__scores">
                    {[
                      { label: 'Pattern',    v: r.pattern_correct ? 1.0 : 0.0, note: r.predicted_pattern || '—' },
                      { label: 'Blueprint',  v: r.blueprint_score  },
                      { label: 'Fix Eff.',   v: r.fix_score        },
                      { label: 'Confidence', v: r.confidence_score,
                        note: r.confidence_error != null ? `err ${r.confidence_error > 0 ? '+' : ''}${r.confidence_error?.toFixed(3)}` : null },
                      { label: 'Final',      v: r.final_score, bold: true },
                    ].map(item => (
                      <div key={item.label} className={`bm-case__score-row${item.bold ? ' bm-case__score-row--bold' : ''}`}>
                        <span className="bm-case__score-label">{item.label}</span>
                        <ScoreBadge value={item.v} />
                        {item.note && <span className="bm-case__score-note">{item.note}</span>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Blueprint diff */}
                {r.expected_blueprint && r.analysis_snapshot?.predicted_blueprint && (
                  <BlueprintDiff
                    expected={r.expected_blueprint}
                    predicted={r.analysis_snapshot.predicted_blueprint}
                  />
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function BlueprintDiff({ expected, predicted }) {
  const fields = [
    ['Key position',  expected?.key?.position,   predicted?.key?.position],
    ['Key modifier',  expected?.key?.modifier,    predicted?.key?.modifier],
    ['Fill ratio',    expected?.fill?.ratio,       predicted?.fill?.ratio],
  ];

  return (
    <div className="bm-bp-diff">
      <p className="bm-bp-diff__heading">Blueprint Diff</p>
      <table className="bm-bp-diff__table">
        <thead>
          <tr>
            <th>Field</th>
            <th>Expected</th>
            <th>Predicted</th>
          </tr>
        </thead>
        <tbody>
          {fields.map(([label, exp, pred]) => {
            const match = exp && pred && String(exp).toLowerCase() === String(pred).toLowerCase();
            return (
              <tr key={label} className={match ? '' : 'bm-bp-diff__row--mismatch'}>
                <td>{label}</td>
                <td>{exp ?? '—'}</td>
                <td className={match ? '' : 'bm-bp-diff__cell--bad'}>{pred ?? '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Run history ───────────────────────────────────────────────────────────────

function RunHistory({ runs, selectedId, onSelect }) {
  if (!runs || runs.length === 0) return null;

  return (
    <div className="bm-run-history">
      <p className="bm-section-label">Run History</p>
      <div className="bm-run-list">
        {runs.slice(0, 10).map(r => (
          <button
            key={r.id}
            className={`bm-run-item${r.id === selectedId ? ' bm-run-item--active' : ''}`}
            onClick={() => onSelect(r.id)}
            type="button"
          >
            <StatusChip status={r.status} />
            <span className="bm-run-item__score">{pct(r.overall_score)}</span>
            <span className="bm-run-item__cases">
              {r.passed_cases}/{r.total_cases}
            </span>
            <span className="bm-run-item__time">{relTime(r.started_at)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Case creator ──────────────────────────────────────────────────────────────

function CaseCreator({ onCreated }) {
  const [mode, setMode]       = useState(null); // null | 'manual' | 'promote'
  const [goldSet, setGoldSet] = useState(null);
  const [form, setForm]       = useState({
    pattern_id: '', image_path: '', difficulty: 'medium',
    expected_pattern: '', key_position: '', key_modifier: '', fill_ratio: '',
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState(null);

  async function loadGoldSet() {
    try {
      const d = await listGoldSet('approved', 100);
      setGoldSet(d.entries || d);
    } catch {
      setGoldSet([]);
    }
  }

  async function handlePromote(entryId) {
    setLoading(true);
    setErr(null);
    try {
      await promoteGoldSetToBenchmark(entryId, form.difficulty);
      onCreated();
      setMode(null);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleManualCreate(e) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      await createBenchmarkCase({
        pattern_id:         form.pattern_id,
        image_path:         form.image_path,
        difficulty:         form.difficulty,
        expected_analysis:  { lighting_family: form.expected_pattern },
        expected_blueprint: {
          key:  { position: form.key_position, modifier: form.key_modifier },
          fill: { ratio: form.fill_ratio },
        },
      });
      onCreated();
      setMode(null);
      setForm({ pattern_id: '', image_path: '', difficulty: 'medium',
                expected_pattern: '', key_position: '', key_modifier: '', fill_ratio: '' });
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  if (!mode) {
    return (
      <div className="bm-add-case-btns">
        <button className="btn btn--ghost btn--sm" type="button"
          onClick={() => { setMode('manual'); }}>
          + Manual Case
        </button>
        <button className="btn btn--ghost btn--sm" type="button"
          onClick={() => { setMode('promote'); loadGoldSet(); }}>
          + Promote from Gold Set
        </button>
      </div>
    );
  }

  if (mode === 'promote') {
    return (
      <div className="bm-case-creator">
        <p className="bm-section-label">Promote Gold Set Entry</p>
        {err && <p className="bm-error">{err}</p>}
        {!goldSet ? (
          <p className="bm-dim">Loading gold set…</p>
        ) : goldSet.length === 0 ? (
          <p className="bm-dim">No approved gold set entries found.</p>
        ) : (
          <div className="bm-promote-list">
            {goldSet.map(e => (
              <div key={e.id} className="bm-promote-item">
                <span className="bm-promote-item__path">{e.image_path}</span>
                <button
                  className="btn btn--primary btn--sm"
                  disabled={loading}
                  onClick={() => handlePromote(e.id)}
                  type="button"
                >
                  Promote
                </button>
              </div>
            ))}
          </div>
        )}
        <button className="btn btn--ghost btn--sm" onClick={() => setMode(null)} type="button">
          Cancel
        </button>
      </div>
    );
  }

  // Manual form
  const F = (label, field, placeholder, required) => (
    <label className="bm-field" key={field}>
      <span className="bm-field__label">{label}{required && ' *'}</span>
      <input
        className="bm-field__input"
        value={form[field]}
        onChange={ev => setForm(f => ({ ...f, [field]: ev.target.value }))}
        placeholder={placeholder}
        required={required}
      />
    </label>
  );

  return (
    <form className="bm-case-creator" onSubmit={handleManualCreate}>
      <p className="bm-section-label">New Benchmark Case</p>
      {err && <p className="bm-error">{err}</p>}
      {F('Pattern ID', 'pattern_id', 'e.g. rembrandt', true)}
      {F('Image Path', 'image_path', 'data/uploads/lab/image.jpg', true)}
      <label className="bm-field">
        <span className="bm-field__label">Difficulty</span>
        <select
          className="bm-field__input"
          value={form.difficulty}
          onChange={e => setForm(f => ({ ...f, difficulty: e.target.value }))}
        >
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
      </label>
      <p className="bm-field__section">Expected Analysis</p>
      {F('Lighting Family', 'expected_pattern', 'e.g. rembrandt', false)}
      <p className="bm-field__section">Expected Blueprint</p>
      {F('Key Position', 'key_position', 'e.g. 45-degree', false)}
      {F('Key Modifier', 'key_modifier', 'e.g. softbox', false)}
      {F('Fill Ratio', 'fill_ratio', 'e.g. 2:1', false)}
      <div className="bm-creator-actions">
        <button className="btn btn--primary btn--sm" disabled={loading} type="submit">
          {loading ? 'Creating…' : 'Create Case'}
        </button>
        <button className="btn btn--ghost btn--sm" type="button" onClick={() => setMode(null)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Case list ─────────────────────────────────────────────────────────────────

function CaseList({ cases, onDelete, onRefresh }) {
  const [deleting, setDeleting] = useState(null);

  async function handleDelete(id) {
    if (!window.confirm('Delete this benchmark case?')) return;
    setDeleting(id);
    try {
      await deleteBenchmarkCase(id);
      onRefresh();
    } catch (e) {
      alert(e.message);
    } finally {
      setDeleting(null);
    }
  }

  if (!cases || cases.length === 0) {
    return (
      <p className="bm-dim">
        No benchmark cases yet. Create one below or promote from the Gold Set.
      </p>
    );
  }

  return (
    <div className="bm-case-list">
      {cases.map(c => (
        <div key={c.id} className="bm-case-item">
          <div className="bm-case-item__meta">
            <span className="bm-case-item__pattern">{c.pattern_id}</span>
            <span className={`bm-case-item__diff bm-diff--${c.difficulty}`}>{c.difficulty}</span>
            <span className="bm-case-item__path">{c.image_path?.split('/').pop()}</span>
          </div>
          <button
            className="bm-case-item__del"
            onClick={() => handleDelete(c.id)}
            disabled={deleting === c.id}
            type="button"
            aria-label="Delete case"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Main BenchmarkTab component ───────────────────────────────────────────────

export default function BenchmarkTab() {
  const [summary,   setSummary]   = useState(null);
  const [metrics,   setMetrics]   = useState(null);
  const [runs,      setRuns]      = useState([]);
  const [cases,     setCases]     = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [lastResult,  setLastResult]  = useState(null); // from most recent run trigger
  const [running,   setRunning]   = useState(false);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [section,   setSection]   = useState('overview'); // overview | cases
  const [driftRunning, setDriftRunning] = useState(false);
  const [driftResult,  setDriftResult]  = useState(null);
  const [driftConfig,  setDriftConfig]  = useState(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sum, met, runList, caseList, cfg] = await Promise.all([
        getBenchmarkSummary().catch(() => ({ has_runs: false })),
        getBenchmarkPatternMetrics().catch(() => ({ metrics: [] })),
        listBenchmarkRuns(15).catch(() => ({ runs: [] })),
        listBenchmarkCases({ limit: 200 }).catch(() => ({ cases: [] })),
        getDriftConfig().catch(() => null),
      ]);
      setSummary(sum);
      setMetrics(met.metrics || []);
      const runArr = runList.runs || [];
      setRuns(runArr);
      if (!selectedRun && runArr.length > 0) {
        setSelectedRun(runArr[0].id);
      }
      setCases(caseList.cases || []);
      if (cfg) setDriftConfig(cfg);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);  // eslint-disable-line

  useEffect(() => { loadAll(); }, [loadAll]);

  async function handleRun() {
    setRunning(true);
    setError(null);
    setLastResult(null);
    try {
      const result = await triggerBenchmarkRun({ runType: 'manual', trigger: 'manual' });
      setLastResult(result);
      await loadAll();
      if (result.run_id) setSelectedRun(result.run_id);
    } catch (e) {
      setError(`Run failed: ${e.message}`);
    } finally {
      setRunning(false);
    }
  }

  async function runDriftCheck() {
    setDriftRunning(true);
    setDriftResult(null);
    try {
      const result = await triggerDriftCheck();
      setDriftResult(result);
      await loadAll();
    } catch (e) {
      setDriftResult({ error: e.message });
    } finally {
      setDriftRunning(false);
    }
  }

  if (loading) {
    return <div className="bm-loading">Loading benchmark system…</div>;
  }

  return (
    <div className="bm-tab">
      {/* ── Section selector ── */}
      <div className="bm-sections">
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'cases',    label: `Cases (${cases.length})` },
        ].map(s => (
          <button
            key={s.id}
            className={`bm-section-btn${section === s.id ? ' bm-section-btn--active' : ''}`}
            onClick={() => setSection(s.id)}
            type="button"
          >
            {s.label}
          </button>
        ))}
      </div>

      {error && <div className="bm-error-banner">{error}</div>}

      {/* ───────────── OVERVIEW ───────────── */}
      {section === 'overview' && (
        <>
          {/* Global metrics + run button */}
          <GlobalMetrics
            summary={summary}
            trend={summary?.trend || (runs.length >= 2 ? runs.map(r => r.overall_score).reverse() : null)}
            onRun={handleRun}
            running={running}
          />

          {/* Drift check button + schedule info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--space-md)', flexWrap: 'wrap' }}>
            <button
              className="btn btn--ghost btn--sm"
              onClick={runDriftCheck}
              disabled={driftRunning}
              type="button"
            >
              {driftRunning ? 'Checking drift…' : '↻ Run Drift Check'}
            </button>
            {driftConfig?.schedule && (
              <span style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--color-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}>
                <span style={{
                  display: 'inline-block',
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: 'var(--color-success)',
                  flexShrink: 0,
                }} />
                Auto: {driftConfig.schedule.description}
              </span>
            )}
            {driftResult && !driftResult.error && (
              <span style={{
                fontSize: 'var(--text-xs)',
                color: driftResult.status === 'clean' ? 'var(--color-success)' : 'var(--color-warning)',
              }}>
                {driftResult.status === 'clean'
                  ? '✓ No drift detected'
                  : `⚠ ${driftResult.drift_items ?? 0} drift item(s) — ${driftResult.candidates_created ?? 0} candidate(s) created`}
              </span>
            )}
            {driftResult?.error && (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-error)' }}>
                ⚠ {driftResult.error}
              </span>
            )}
          </div>
          {driftConfig?.thresholds && (
            <div style={{
              display: 'flex',
              gap: 16,
              marginBottom: 'var(--space-md)',
              flexWrap: 'wrap',
            }}>
              {[
                { label: 'Overall threshold', value: `${(driftConfig.thresholds.overall * 100).toFixed(0)}%` },
                { label: 'Pattern threshold',  value: `${(driftConfig.thresholds.pattern * 100).toFixed(0)}%` },
                { label: 'Confidence δ',       value: `±${driftConfig.thresholds.confidence.toFixed(2)}` },
              ].map(t => (
                <span key={t.label} style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>
                  <span style={{ color: 'var(--color-fg-muted)', fontWeight: 500 }}>{t.label}:</span>
                  {' '}{t.value}
                </span>
              ))}
            </div>
          )}

          {/* Regression alerts from most recent run */}
          {lastResult?.regressions && lastResult.regressions.length > 0 && (
            <RegressionAlerts regressions={lastResult.regressions} />
          )}

          {/* Failure insights */}
          {lastResult?.insights && lastResult.insights.length > 0 && (
            <>
              <p className="bm-section-label" style={{ marginTop: 'var(--space-lg)' }}>
                Insights
              </p>
              <FailureInsights insights={lastResult.insights} />
            </>
          )}

          {/* Pattern table */}
          {metrics && metrics.length > 0 && (
            <>
              <p className="bm-section-label" style={{ marginTop: 'var(--space-lg)' }}>
                Pattern Performance
              </p>
              <PatternTable metrics={metrics} />
            </>
          )}

          {/* Run history + case explorer */}
          {runs.length > 0 && (
            <>
              <p className="bm-section-label" style={{ marginTop: 'var(--space-lg)' }}>
                Run History
              </p>
              <RunHistory
                runs={runs}
                selectedId={selectedRun}
                onSelect={id => setSelectedRun(id)}
              />

              <p className="bm-section-label" style={{ marginTop: 'var(--space-md)' }}>
                Case Explorer
                {selectedRun && (
                  <span className="bm-section-label__sub">
                    — run {selectedRun.slice(0, 8)}
                  </span>
                )}
              </p>
              <CaseExplorer runId={selectedRun} />
            </>
          )}

          {/* No-run CTA when no runs and no summary */}
          {!summary?.has_runs && runs.length === 0 && (
            <div className="bm-empty-state" style={{ marginTop: 'var(--space-lg)' }}>
              <button
                className="btn btn--primary btn--sm"
                onClick={handleRun}
                disabled={running}
                type="button"
              >
                {running ? 'Running…' : 'Run Benchmark'}
              </button>
            </div>
          )}
        </>
      )}

      {/* ───────────── CASES ───────────── */}
      {section === 'cases' && (
        <>
          <CaseList
            cases={cases}
            onRefresh={loadAll}
          />
          <div style={{ marginTop: 'var(--space-lg)' }}>
            <CaseCreator onCreated={loadAll} />
          </div>
        </>
      )}
    </div>
  );
}
