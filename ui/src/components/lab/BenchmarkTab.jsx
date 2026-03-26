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
  updateBenchmarkCase,
  deleteBenchmarkCase,
  getBenchmarkCaseHistory,
  promoteGoldSetToBenchmark,
  listGoldSet,
  triggerDriftCheck,
  getDriftConfig,
  getGoldSetImageUrl,
  labFetchBlob,
} from '../../data/labApi';
import { pct, ts, relTime } from '../../lib/formatters';
import { C, STATUS_COLORS, pctColor } from '../../lib/statusColors';

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
// Uses overall_score to determine pass/fail when run completed.
// "completed" just means the run finished — quality is determined by score vs ≥80% threshold.

function StatusChip({ status, overallScore }) {
  if (status === 'completed') {
    if (overallScore == null) return <span className="bm-chip bm-chip--neutral">Completed</span>;
    if (overallScore >= 0.8)  return <span className="bm-chip bm-chip--good">✓ Pass</span>;
    if (overallScore >= 0.6)  return <span className="bm-chip bm-chip--warn">Soft Pass</span>;
    return <span className="bm-chip bm-chip--bad">✗ Fail</span>;
  }
  const map = {
    blocked:         { label: 'Blocked',  cls: 'bad'     },
    running:         { label: 'Running…', cls: 'warn'    },
    failed:          { label: 'Error',    cls: 'bad'     },
    completed_empty: { label: 'No Cases', cls: 'neutral' },
  };
  const { label, cls } = map[status] || { label: status, cls: 'neutral' };
  return <span className={`bm-chip bm-chip--${cls}`}>{label}</span>;
}

// ── Sparkline ─────────────────────────────────────────────────────────────────

// Sparkline expects values oldest-first (left = past, right = recent).
// Normalise at the call site — never reverse here.
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
  // Green if most recent (rightmost) >= oldest (leftmost), red if declining.
  const color = values[values.length - 1] >= values[0] ? '#22c55e' : '#ef4444';
  const [lastX, lastY] = pts[pts.length - 1].split(',');
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
      {/* Dot on the most recent value (rightmost = newest) */}
      <circle cx={lastX} cy={lastY} r="2.5" fill={color} />
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

function RunModeToggle({ runMode, onChange, runLabel, estLabel, disabled }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
        {['quick', 'full'].map(m => (
          <button
            key={m}
            type="button"
            disabled={disabled}
            onClick={() => onChange(m)}
            style={{
              padding: '3px 10px', fontSize: 'var(--text-xs)', cursor: 'pointer',
              background: runMode === m ? 'var(--color-accent)' : 'var(--color-surface-elevated)',
              color: runMode === m ? '#fff' : 'var(--color-text-secondary)',
              border: 'none', fontWeight: runMode === m ? 600 : 400,
            }}
          >
            {m === 'quick' ? 'Quick' : 'Full'}
          </button>
        ))}
      </div>
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)' }}>
        {runLabel} · est. {estLabel}
      </span>
    </div>
  );
}

function GlobalMetrics({ summary, trend, onRun, running, runElapsed, runMode, onRunModeChange, runLabel, estLabel }) {
  if (!summary?.has_runs) {
    return (
      <div className="bm-empty-state">
        <p className="bm-empty-state__title">No benchmark runs yet</p>
        <p className="bm-empty-state__sub">
          Add benchmark cases, then trigger a run to measure pipeline performance.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <RunModeToggle runMode={runMode} onChange={onRunModeChange} runLabel={runLabel} estLabel={estLabel} disabled={running} />
          <button
            className="btn btn--primary btn--sm"
            onClick={onRun}
            disabled={running}
            type="button"
          >
            {running ? `Running… ${runElapsed}s` : 'Run First Benchmark'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bm-global">
      <div className="bm-global__left">
        <div className="bm-global__score-row">
          <ScoreBadge value={summary.overall_score} large />
          <StatusChip status={summary.status} overallScore={summary.overall_score} />
          {trend && trend.length >= 2 && <Sparkline values={trend} />}
        </div>
        <p className="bm-global__sub">
          {summary.passed_cases}/{summary.total_cases} cases passed ·{' '}
          {relTime(summary.completed_at)}
        </p>
        {summary.total_cases > 0 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.green, background: C.greenBg, padding: '1px 7px', borderRadius: 10 }}>PASS {summary.passed_cases ?? 0}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.red,   background: C.redBg,   padding: '1px 7px', borderRadius: 10 }}>FAIL {(summary.total_cases ?? 0) - (summary.passed_cases ?? 0)}</span>
            {(summary.regression_count ?? 0) > 0 && (
              <span style={{ fontSize: 11, fontWeight: 700, color: C.red, background: C.redBg, padding: '1px 7px', borderRadius: 10 }}>⚠ {summary.regression_count} REGRESSION{summary.regression_count !== 1 ? 'S' : ''}</span>
            )}
          </div>
        )}
        <p className="bm-metric__hint" style={{ marginTop: 4 }}>
          PASS ≥80% · SOFT PASS ≥60% · FAIL &lt;60% — expand a run for full breakdown
        </p>
      </div>

      <div className="bm-global__metrics">
        <div className="bm-metric">
          <span className="bm-metric__label">Pattern Accuracy</span>
          <span className="bm-metric__val">{pct(summary.pattern_accuracy)}</span>
          <span className="bm-metric__hint">target ≥80%</span>
        </div>
        <div className="bm-metric">
          <span className="bm-metric__label">Blueprint Score</span>
          <span className="bm-metric__val">{pct(summary.avg_blueprint_score)}</span>
          <span className="bm-metric__hint">good ≥80%</span>
        </div>
        <div className="bm-metric">
          <span className="bm-metric__label">Confidence Error</span>
          <span className={`bm-metric__val ${
            Math.abs(summary.confidence_error || 0) > 0.2 ? 'bm-metric__val--bad' :
            Math.abs(summary.confidence_error || 0) > 0.04 ? 'bm-metric__val--warn' : ''
          }`}>
            {summary.confidence_error != null ? `±${Number(summary.confidence_error).toFixed(3)}` : '—'}
          </span>
          <span className="bm-metric__hint">target &lt;±0.04</span>
        </div>
        {summary.regression_count > 0 && (
          <div className="bm-metric">
            <span className="bm-metric__label">Regressions</span>
            <span className="bm-metric__val bm-metric__val--bad">{summary.regression_count}</span>
            <span className="bm-metric__hint">0 is ideal</span>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
        <RunModeToggle runMode={runMode} onChange={onRunModeChange} runLabel={runLabel} estLabel={estLabel} disabled={running} />
        <button
          className="btn btn--ghost btn--sm bm-run-btn"
          onClick={onRun}
          disabled={running}
          type="button"
        >
          {running ? `Running… ${runElapsed}s` : 'Re-run Benchmark'}
        </button>
      </div>
    </div>
  );
}

// ── Pattern table ─────────────────────────────────────────────────────────────

function PatternTable({ metrics, onNavigateTo }) {
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
    { key: 'pattern_id',       label: 'Pattern',           title: 'Lighting pattern ID',                                           fmt: v => v },
    { key: 'benchmark_score',  label: 'Benchmark Score',   title: 'Composite score for this pattern — target ≥80% (green)',        fmt: pct },
    { key: 'delta_change',     label: 'Δ vs Prev',         title: 'Change vs previous benchmark run',                             fmt: v => <Delta value={v} /> },
    { key: 'live_success_rate',label: 'Live Success',      title: 'Real-world production success rate — target ≥80%',             fmt: pct },
    { key: 'confidence_error', label: 'Conf. Error',       title: 'Confidence prediction error — target <±0.04; >±0.2 is poor',
      fmt: v => {
        if (v == null) return '—';
        const abs = Math.abs(Number(v));
        const color = abs > 0.2 ? '#ef4444' : abs > 0.04 ? '#f59e0b' : '#22c55e';
        return <span style={{ color, fontVariantNumeric: 'tabular-nums' }}>±{Number(v).toFixed(3)}</span>;
      },
    },
    { key: 'run_count',        label: 'Runs',              title: 'Number of benchmark runs for this pattern',                    fmt: v => v ?? '—' },
    { key: '_kb',              label: 'KB',                title: 'Open Knowledge Base entry for this pattern',                   fmt: null },
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
                title={c.title || `Sort by ${c.label}`}
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
                  ) : c.key === '_kb' ? (
                    onNavigateTo ? (
                      <button
                        type="button"
                        onClick={() => onNavigateTo({ tab: 'learning', panel: 'knowledge', patternId: m.pattern_id })}
                        title={`Open KB for ${m.pattern_id}`}
                        style={{
                          fontSize: 'var(--text-xs)', padding: '2px 6px',
                          background: 'transparent', color: 'var(--color-text-dim)',
                          border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
                          cursor: 'pointer', lineHeight: 1,
                        }}
                      >
                        📖
                      </button>
                    ) : null
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

// ── Verdict helpers ───────────────────────────────────────────────────────────

/** Derive PASS / SOFT PASS / FAIL / ERROR from a result row */
function caseVerdict(r) {
  if (r.error_msg) return 'ERROR';
  if (r.final_score == null) return 'FAIL';
  if (r.final_score >= 0.8) return 'PASS';
  if (r.final_score >= 0.6) return 'SOFT PASS';
  return 'FAIL';
}

const VERDICT_STYLE = STATUS_COLORS;

function VerdictChip({ verdict }) {
  const st = VERDICT_STYLE[verdict] || VERDICT_STYLE.FAIL;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '1px 7px', borderRadius: 10,
      fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
      background: st.bg, color: st.color, whiteSpace: 'nowrap',
    }}>
      {verdict}
    </span>
  );
}

// ── Benchmark case thumbnail (fetches image with auth — gold-set or case ID) ───

function BmCaseThumb({ goldSetId, caseId }) {
  const [src, setSrc] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let url = null;
    const path = goldSetId
      ? `/gold-set/${goldSetId}/image`
      : caseId ? `/benchmarks/cases/${caseId}/image` : null;
    if (!path) return;
    labFetchBlob(path)
      .then(u => { url = u; setSrc(u); })
      .catch(() => setErr(true));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [goldSetId, caseId]);

  const style = {
    width: 52, height: 52, flexShrink: 0,
    borderRadius: 4, objectFit: 'cover',
    background: 'var(--color-surface-elevated)',
    border: '1px solid var(--color-border)',
  };
  if (err || (!goldSetId && !caseId)) return null;
  if (!src) return <div style={style} />;
  return <CaseThumbImg src={src} style={style} />;
}

/** Inline-zoomable thumbnail — click for fullscreen lightbox */
function CaseThumbImg({ src, style }) {
  const [zoomed, setZoomed] = useState(false);
  return (
    <>
      <img src={src} alt="" style={{ ...style, cursor: 'zoom-in' }} onClick={() => setZoomed(true)} />
      {zoomed && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setZoomed(false)}
        >
          <img src={src} alt="" style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8, display: 'block' }} />
          <button
            onClick={() => setZoomed(false)}
            style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '50%', width: 36, height: 36, cursor: 'pointer', color: '#fff', fontSize: 18 }}
          >✕</button>
        </div>
      )}
    </>
  );
}

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

  // Verdict summary counts
  const verdictCounts = results.reduce((acc, r) => {
    const v = caseVerdict(r);
    acc[v] = (acc[v] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="bm-cases">
      {/* Verdict summary bar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        {['PASS', 'SOFT PASS', 'FAIL', 'ERROR'].filter(v => verdictCounts[v]).map(v => (
          <span key={v} style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '3px 10px', borderRadius: 12,
            fontSize: 11, fontWeight: 700,
            background: VERDICT_STYLE[v].bg, color: VERDICT_STYLE[v].color,
            border: `1px solid ${VERDICT_STYLE[v].color}44`,
          }}>
            {v} <span style={{ fontVariantNumeric: 'tabular-nums', opacity: 0.85 }}>{verdictCounts[v]}</span>
          </span>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-dim)', alignSelf: 'center' }}>
          {results.length} total
        </span>
      </div>

      {results.map(r => {
        const open = expanded === r.id;
        const verdict = caseVerdict(r);
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
              style={{ alignItems: 'center' }}
            >
              {/* Thumbnail — gold-set image preferred, falls back to case image */}
              <BmCaseThumb goldSetId={r.source_gold_set_id} caseId={!r.source_gold_set_id ? r.case_id || r.id : undefined} />
              <span className="bm-case__pattern">{r.pattern_id}</span>
              <span className="bm-case__image" style={{ fontSize: 10, opacity: 0.6, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.image_path?.split('/').pop()}
              </span>
              <VerdictChip verdict={verdict} />
              <ScoreBadge value={r.final_score} />
              {r.regression_flag && <span className="bm-case__flag">REGRESSION</span>}
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
                      { label: 'Blueprint',  v: r.blueprint_score,
                        note: r.blueprint_score != null && r.blueprint_score < 0.8 ? 'below 0.8 target' : null },
                      { label: 'Fix Eff.',   v: r.fix_score        },
                      { label: 'Confidence', v: r.confidence_score,
                        note: r.confidence_error != null
                          ? `err ${r.confidence_error > 0 ? '+' : ''}${r.confidence_error?.toFixed(3)}${Math.abs(r.confidence_error) > 0.04 ? ' ⚠ >±0.04' : ' ✓'}`
                          : null },
                      { label: 'Final',      v: r.final_score, bold: true,
                        note: r.final_score != null && r.final_score < 0.8 ? 'below 0.8 target' : null },
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
            <StatusChip status={r.status} overallScore={r.overall_score} />
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

function CaseList({ cases, onRefresh }) {
  const [deleting,    setDeleting]    = useState(null);
  const [diffFilter,  setDiffFilter]  = useState('all');
  const [expanded,    setExpanded]    = useState(null);   // case id
  const [editing,     setEditing]     = useState(null);   // case id
  const [editForm,    setEditForm]    = useState({});
  const [saving,      setSaving]      = useState(false);
  const [history,     setHistory]     = useState({});     // caseId → entries[]
  const [histLoading, setHistLoading] = useState(null);

  if (!cases || cases.length === 0) {
    return (
      <p className="bm-dim">
        No benchmark cases yet. Create one below or promote from the Gold Set.
      </p>
    );
  }

  const patternSet = new Set(cases.map(c => c.pattern_id));
  const diffCount  = { easy: 0, medium: 0, hard: 0 };
  cases.forEach(c => { if (c.difficulty in diffCount) diffCount[c.difficulty]++; });
  const filtered = diffFilter === 'all' ? cases : cases.filter(c => c.difficulty === diffFilter);

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

  function startEdit(c) {
    setEditing(c.id);
    setEditForm({
      pattern_id:         c.pattern_id || '',
      difficulty:         c.difficulty || 'medium',
      expected_analysis:  { lighting_family: c.expected_analysis?.lighting_family || '' },
      expected_blueprint: {
        key:  { position: c.expected_blueprint?.key?.position  || '',
                modifier: c.expected_blueprint?.key?.modifier  || '' },
        fill: { ratio:    c.expected_blueprint?.fill?.ratio    || '' },
      },
      notes: c.notes || '',
    });
  }

  async function handleSave(id) {
    setSaving(true);
    try {
      await updateBenchmarkCase(id, editForm);
      setEditing(null);
      onRefresh();
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function loadHistory(id) {
    if (history[id] !== undefined) return; // already loaded
    setHistLoading(id);
    try {
      const d = await getBenchmarkCaseHistory(id, 6);
      setHistory(h => ({ ...h, [id]: d.history || d }));
    } catch {
      setHistory(h => ({ ...h, [id]: [] }));
    } finally {
      setHistLoading(null);
    }
  }

  function toggleExpand(id) {
    setExpanded(e => e === id ? null : id);
  }

  return (
    <div className="bm-case-list">
      {/* Filter bar */}
      <div className="bm-case-summary">
        <button
          className={`bm-case-summary__filter${diffFilter === 'all' ? ' bm-case-summary__filter--active' : ''}`}
          onClick={() => setDiffFilter('all')}
          type="button"
        >
          All {cases.length}
        </button>
        {['easy', 'medium', 'hard'].map(d => diffCount[d] > 0 && (
          <button key={d}
            className={`bm-case-summary__filter bm-diff--${d}${diffFilter === d ? ' bm-case-summary__filter--active' : ''}`}
            onClick={() => setDiffFilter(diffFilter === d ? 'all' : d)}
            type="button"
          >
            {d[0].toUpperCase() + d.slice(1)} {diffCount[d]}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)' }}>
          {patternSet.size} pattern{patternSet.size !== 1 ? 's' : ''}
        </span>
      </div>

      {filtered.length === 0 && (
        <p className="bm-dim">No {diffFilter} cases.</p>
      )}

      {filtered.map(c => {
        const isExpanded     = expanded === c.id;
        const isEditing      = editing  === c.id;
        const expectedPattern = c.expected_analysis?.lighting_family;
        const caseHistory    = history[c.id];

        return (
          <div key={c.id} className={`bm-case-item${isExpanded ? ' bm-case-item--expanded' : ''}`}>

            {/* ── Row ── */}
            <div className="bm-case-item__row">
              <button className="bm-case-item__expand" onClick={() => toggleExpand(c.id)}
                type="button" aria-label={isExpanded ? 'Collapse' : 'Expand'}>
                <svg className={`bm-case__chevron${isExpanded ? ' bm-case__chevron--open' : ''}`}
                  width="10" height="10" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>

              <div className="bm-case-item__meta">
                <span className="bm-case-item__pattern">{c.pattern_id}</span>
                <span className={`bm-case-item__diff bm-diff--${c.difficulty}`}>{c.difficulty}</span>
                {expectedPattern ? (
                  <span className="bm-case-item__expected" title="Expected pattern the engine must return">
                    expects: {expectedPattern}
                  </span>
                ) : (
                  <span className="bm-case-item__expected bm-case-item__expected--missing"
                    title="No expected pattern set — pattern accuracy will always be 0 for this case">
                    ⚠ no expected pattern
                  </span>
                )}
                <span className="bm-case-item__path">{c.image_path?.split('/').pop()}</span>
              </div>

              <div className="bm-case-item__actions">
                <button className="btn btn--xs btn--ghost" type="button"
                  title="Edit expected outputs"
                  onClick={() => {
                    if (!isExpanded) setExpanded(c.id);
                    if (isEditing) setEditing(null); else startEdit(c);
                  }}>
                  Edit
                </button>
                <button className="btn btn--xs btn--ghost" type="button"
                  title="View score history for this case"
                  onClick={() => { if (!isExpanded) setExpanded(c.id); loadHistory(c.id); }}>
                  History
                </button>
                <button className="bm-case-item__del" type="button"
                  onClick={() => handleDelete(c.id)} disabled={deleting === c.id}
                  aria-label="Delete case">
                  ✕
                </button>
              </div>
            </div>

            {/* ── Expanded body ── */}
            {isExpanded && (
              <div className="bm-case-item__body">

                {isEditing ? (
                  /* Edit form */
                  <>
                    <p className="bm-field__section">Edit Expected Outputs</p>
                    <div className="bm-case-item__edit-grid" style={{ marginTop: 'var(--space-xs)' }}>
                      <label className="bm-field">
                        <span className="bm-field__label">Pattern ID (case label)</span>
                        <input className="bm-field__input" value={editForm.pattern_id}
                          onChange={e => setEditForm(f => ({ ...f, pattern_id: e.target.value }))} />
                      </label>
                      <label className="bm-field">
                        <span className="bm-field__label">
                          Expected pattern — must match engine output exactly
                        </span>
                        <input className="bm-field__input" value={editForm.expected_analysis.lighting_family}
                          placeholder="e.g. rembrandt_short"
                          onChange={e => setEditForm(f => ({
                            ...f, expected_analysis: { ...f.expected_analysis, lighting_family: e.target.value },
                          }))} />
                      </label>
                      <label className="bm-field">
                        <span className="bm-field__label">Difficulty</span>
                        <select className="bm-field__input" value={editForm.difficulty}
                          onChange={e => setEditForm(f => ({ ...f, difficulty: e.target.value }))}>
                          <option value="easy">Easy</option>
                          <option value="medium">Medium</option>
                          <option value="hard">Hard</option>
                        </select>
                      </label>
                      <label className="bm-field">
                        <span className="bm-field__label">Key Position</span>
                        <input className="bm-field__input" value={editForm.expected_blueprint.key.position}
                          placeholder="e.g. 45-degree"
                          onChange={e => setEditForm(f => ({
                            ...f, expected_blueprint: {
                              ...f.expected_blueprint,
                              key: { ...f.expected_blueprint.key, position: e.target.value },
                            },
                          }))} />
                      </label>
                      <label className="bm-field">
                        <span className="bm-field__label">Key Modifier</span>
                        <input className="bm-field__input" value={editForm.expected_blueprint.key.modifier}
                          placeholder="e.g. softbox"
                          onChange={e => setEditForm(f => ({
                            ...f, expected_blueprint: {
                              ...f.expected_blueprint,
                              key: { ...f.expected_blueprint.key, modifier: e.target.value },
                            },
                          }))} />
                      </label>
                      <label className="bm-field">
                        <span className="bm-field__label">Fill Ratio</span>
                        <input className="bm-field__input" value={editForm.expected_blueprint.fill.ratio}
                          placeholder="e.g. 2:1"
                          onChange={e => setEditForm(f => ({
                            ...f, expected_blueprint: {
                              ...f.expected_blueprint,
                              fill: { ratio: e.target.value },
                            },
                          }))} />
                      </label>
                    </div>
                    <label className="bm-field" style={{ marginTop: 'var(--space-xs)' }}>
                      <span className="bm-field__label">Notes</span>
                      <input className="bm-field__input" value={editForm.notes}
                        placeholder="Optional notes about this case"
                        onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
                    </label>
                    <div className="bm-creator-actions" style={{ marginTop: 'var(--space-sm)' }}>
                      <button className="btn btn--primary btn--sm" type="button"
                        disabled={saving} onClick={() => handleSave(c.id)}>
                        {saving ? 'Saving…' : 'Save'}
                      </button>
                      <button className="btn btn--ghost btn--sm" type="button"
                        onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  /* Detail view */
                  <div className="bm-case-item__detail-grid">
                    <div>
                      <span className="bm-field__label">Expected pattern</span>
                      <span className={`bm-case-item__detail-val${!expectedPattern ? ' bm-case-item__expected--missing' : ''}`}>
                        {expectedPattern || '⚠ not set'}
                      </span>
                    </div>
                    {c.expected_blueprint?.key?.position && (
                      <div>
                        <span className="bm-field__label">Key position</span>
                        <span className="bm-case-item__detail-val">{c.expected_blueprint.key.position}</span>
                      </div>
                    )}
                    {c.expected_blueprint?.key?.modifier && (
                      <div>
                        <span className="bm-field__label">Key modifier</span>
                        <span className="bm-case-item__detail-val">{c.expected_blueprint.key.modifier}</span>
                      </div>
                    )}
                    {c.expected_blueprint?.fill?.ratio && (
                      <div>
                        <span className="bm-field__label">Fill ratio</span>
                        <span className="bm-case-item__detail-val">{c.expected_blueprint.fill.ratio}</span>
                      </div>
                    )}
                    {c.notes && (
                      <div>
                        <span className="bm-field__label">Notes</span>
                        <span className="bm-case-item__detail-val">{c.notes}</span>
                      </div>
                    )}
                    {c.created_at && (
                      <div>
                        <span className="bm-field__label">Created</span>
                        <span className="bm-case-item__detail-val">
                          {new Date(c.created_at * 1000).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Score history */}
                {(caseHistory !== undefined || histLoading === c.id) && (
                  <div className="bm-case-item__history">
                    <p className="bm-field__section">Score History</p>
                    {histLoading === c.id && <p className="bm-dim">Loading…</p>}
                    {caseHistory && caseHistory.length === 0 && (
                      <p className="bm-dim">No runs recorded for this case yet.</p>
                    )}
                    {caseHistory && caseHistory.length > 0 && (
                      <div className="bm-table-wrap">
                        <table className="bm-table">
                          <thead>
                            <tr>
                              <th className="bm-table__th">Date</th>
                              <th className="bm-table__th">Pattern ✓</th>
                              <th className="bm-table__th">Blueprint</th>
                              <th className="bm-table__th">Conf. err</th>
                              <th className="bm-table__th">Final</th>
                            </tr>
                          </thead>
                          <tbody>
                            {caseHistory.map(h => (
                              <tr key={h.id}
                                className={`bm-table__row${h.regression_flag ? ' bm-case--regression' : ''}`}>
                                <td className="bm-table__td">
                                  {h.run_started_at
                                    ? new Date(h.run_started_at * 1000).toLocaleDateString()
                                    : '—'}
                                </td>
                                <td className="bm-table__td">
                                  <ScoreBadge value={h.pattern_correct ? 1.0 : 0.0} />
                                  {h.predicted_pattern && (
                                    <span className="bm-case__score-note">{h.predicted_pattern}</span>
                                  )}
                                </td>
                                <td className="bm-table__td">
                                  <ScoreBadge value={h.blueprint_score} />
                                </td>
                                <td className="bm-table__td">
                                  {h.confidence_error != null ? (
                                    <span style={{
                                      color: Math.abs(h.confidence_error) > 0.04 ? '#f59e0b' : '#22c55e',
                                      fontVariantNumeric: 'tabular-nums',
                                    }}>
                                      {h.confidence_error > 0 ? '+' : ''}{h.confidence_error.toFixed(3)}
                                    </span>
                                  ) : '—'}
                                </td>
                                <td className="bm-table__td">
                                  <ScoreBadge value={h.final_score} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main BenchmarkTab component ───────────────────────────────────────────────

export default function BenchmarkTab({ onNavigateTo }) {
  const [summary,   setSummary]   = useState(null);
  const [metrics,   setMetrics]   = useState(null);
  const [runs,      setRuns]      = useState([]);
  const [cases,     setCases]     = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [lastResult,  setLastResult]  = useState(null); // from most recent run trigger
  const [running,   setRunning]   = useState(false);
  const [runElapsed, setRunElapsed] = useState(0);
  const runTimerRef = useRef(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [section,   setSection]   = useState('overview'); // overview | cases
  const [driftRunning, setDriftRunning] = useState(false);
  const [driftResult,  setDriftResult]  = useState(null);
  const [driftConfig,  setDriftConfig]  = useState(null);
  // Quick mode = cap at 25 cases; Full = all (up to 500). Default quick for manual runs.
  const [runMode,  setRunMode]  = useState('quick'); // 'quick' | 'full'

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

  const caseCount   = cases.length;
  const quickLimit  = 25;
  const runCaseLimit = runMode === 'quick' ? quickLimit : null;
  const runLabel     = runMode === 'quick'
    ? `Quick (${Math.min(quickLimit, caseCount)} cases)`
    : `Full (${caseCount} cases)`;
  const estSeconds   = runMode === 'quick'
    ? Math.min(quickLimit, caseCount) * 1.5
    : caseCount * 1.5;
  const estLabel     = estSeconds < 60
    ? `~${Math.round(estSeconds)}s`
    : `~${Math.round(estSeconds / 60)}m`;

  async function handleRun() {
    setRunning(true);
    setRunElapsed(0);
    setError(null);
    setLastResult(null);
    const start = Date.now();
    runTimerRef.current = setInterval(() => {
      setRunElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    try {
      const result = await triggerBenchmarkRun({
        runType: 'manual',
        trigger: 'manual',
        caseLimit: runCaseLimit,
      });
      setLastResult(result);
      await loadAll();
      if (result.run_id) setSelectedRun(result.run_id);
    } catch (e) {
      setError(`Run failed: ${e.message}`);
    } finally {
      clearInterval(runTimerRef.current);
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
            trend={(() => {
              // Primary: backend-filtered scores (completed only, no nulls). Newest-first → reverse to oldest-first.
              const fromSummary = (summary?.trend ?? []).filter(v => v != null);
              if (fromSummary.length >= 2) return [...fromSummary].reverse();
              // Fallback: filter out null (failed/in-progress) runs before mapping. Newest-first → oldest-first.
              const fromRuns = runs
                .filter(r => r.overall_score != null)
                .map(r => r.overall_score)
                .reverse();
              return fromRuns.length >= 2 ? fromRuns : null;
            })()}
            onRun={handleRun}
            running={running}
            runElapsed={runElapsed}
            runMode={runMode}
            onRunModeChange={setRunMode}
            runLabel={runLabel}
            estLabel={estLabel}
          />

          {/* Score color legend */}
          {summary?.has_runs && (
            <div className="bm-score-legend">
              <span>
                <span className="bm-score-legend__dot" style={{ background: '#22c55e' }} />
                ≥80% good
              </span>
              <span>
                <span className="bm-score-legend__dot" style={{ background: '#f59e0b' }} />
                ≥60% warn
              </span>
              <span>
                <span className="bm-score-legend__dot" style={{ background: '#ef4444' }} />
                &lt;60% needs work
              </span>
              <span style={{ marginLeft: 8, borderLeft: '1px solid var(--color-border)', paddingLeft: 12 }}>
                Conf. error: &lt;±0.04 target · &gt;±0.04 <span style={{ color: '#f59e0b' }}>warn</span> · &gt;±0.20 <span style={{ color: '#ef4444' }}>poor</span>
              </span>
            </div>
          )}

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
                {
                  label: 'Overall threshold',
                  value: `${(driftConfig.thresholds.overall * 100).toFixed(0)}%`,
                  desc:  'overall score drop that triggers a regression alert',
                },
                {
                  label: 'Pattern threshold',
                  value: `${(driftConfig.thresholds.pattern * 100).toFixed(0)}%`,
                  desc:  'per-pattern accuracy drop that triggers a warning',
                },
                {
                  label: 'Confidence δ',
                  value: `±${driftConfig.thresholds.confidence.toFixed(2)}`,
                  desc:  'max acceptable confidence prediction error — lower is better',
                },
              ].map(t => (
                <span key={t.label} title={t.desc}
                  style={{ fontSize: 'var(--text-xs)', color: 'var(--color-muted)', cursor: 'help' }}>
                  <span style={{ color: 'var(--color-fg-muted)', fontWeight: 500 }}>{t.label}:</span>
                  {' '}{t.value}
                  {' '}<span style={{ opacity: 0.5, fontSize: 9 }}>ⓘ</span>
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
              <PatternTable metrics={metrics} onNavigateTo={onNavigateTo} />
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
                {running ? `Running… ${runElapsed}s` : 'Run Benchmark'}
              </button>
            </div>
          )}
        </>
      )}

      {/* ───────────── CASES ───────────── */}
      {section === 'cases' && (
        <>
          {/* Cases explainer */}
          <div className="bm-cases-explainer">
            <p className="bm-cases-explainer__intro">
              A benchmark case is a ground-truth pair: an image and the expected outputs
              the analysis engine should produce for it (pattern ID, blueprint fields,
              confidence). Each time you run a benchmark, every case is re-analyzed and
              scored — producing per-pattern accuracy, blueprint quality, and confidence
              alignment metrics.
            </p>
            <div className="bm-cases-explainer__grid">
              <div>
                <p className="bm-field__section">Adding Cases</p>
                <ul className="bm-cases-explainer__list">
                  <li>
                    <strong>Promote from Gold Set</strong> — fastest path. Pulls
                    approved Gold Set entries directly into the benchmark suite with
                    their labeled pattern and blueprint already filled in.
                  </li>
                  <li>
                    <strong>Manual Case</strong> — use when you want to add a specific
                    image that isn't in the Gold Set, or to test a known edge case or
                    regression scenario.
                  </li>
                </ul>
              </div>
              <div>
                <p className="bm-field__section">Difficulty Levels</p>
                <ul className="bm-cases-explainer__list">
                  <li>
                    <strong>Easy</strong> — clean studio, strong single key light,
                    no ambiguity. Engine should score near 1.0 on these.
                  </li>
                  <li>
                    <strong>Medium</strong> — mixed modifiers, subtle pattern,
                    or real-world production shot. Typical benchmark case.
                  </li>
                  <li>
                    <strong>Hard</strong> — edge case: split patterns, unusual ratios,
                    challenging scene. A lower score here is expected and acceptable.
                  </li>
                </ul>
              </div>
              <div>
                <p className="bm-field__section">Coverage Target</p>
                <ul className="bm-cases-explainer__list">
                  <li>
                    Aim for <strong>2–5 cases per pattern</strong>. Fewer than 2
                    makes per-pattern scores unreliable.
                  </li>
                  <li>
                    Mix difficulty: 1–2 easy + 1–2 medium + 1 hard per pattern gives
                    the best signal about where the engine breaks.
                  </li>
                  <li>
                    At least one case per active pattern is required before benchmark
                    scores are meaningful across the full suite.
                  </li>
                </ul>
              </div>
            </div>
          </div>

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
