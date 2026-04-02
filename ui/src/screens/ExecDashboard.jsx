/**
 * Executive Dashboard — top-level screen.
 *
 * Sections:
 *   1. KPI Bar          — success_rate, conversion_rate, revenue_per_session,
 *                          benchmark_score, confidence_error  (+Δ vs prev period)
 *   2. Trend Charts     — 7d / 30d sparklines for all KPIs
 *   3. Pattern Table    — cross-section: analytics + benchmark per pattern
 *   4. Failure Insights — top-5 open issues (severity + frequency)
 *   5. Benchmark Status — last run card + regression list
 *   6. Revenue          — by product + by outcome
 *   7. Experiment Impact — released candidates with before/after monitoring
 *
 * Auto-refreshes every 60 s. Mobile-first, dark-theme consistent.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useDispatch } from '../context/AppContext';
import { getExecDashboard, getExecTrends, getAllFlags, updateFlagRollout } from '../data/execApi';
import { pct, usd, relTime, fmtPattern } from '../lib/formatters';
import ExperimentsPanel from '../components/analytics/ExperimentsPanel';

// ── Constants ─────────────────────────────────────────────────────────────────

const DAY_OPTIONS = [
  { label: '7d',  value: 7 },
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
];

const REFRESH_MS = 60_000;

// ── Local helpers (not shared) ─────────────────────────────────────────────────

function num(v, decimals = 2) {
  if (v == null) return '—';
  return typeof v === 'number' ? v.toFixed(decimals) : v;
}
function deltaClass(d) {
  if (d == null) return '';
  if (d > 0) return 'ed-delta--up';
  if (d < 0) return 'ed-delta--down';
  return 'ed-delta--flat';
}
function deltaStr(d, format = 'pct') {
  if (d == null) return null;
  const sign = d > 0 ? '+' : '';
  if (format === 'pct') return `${sign}${(d * 100).toFixed(1)}%`;
  if (format === 'usd') return `${sign}$${Math.abs(d).toFixed(2)}`;
  return `${sign}${d.toFixed(3)}`;
}
function severityClass(s) {
  if (s === 'critical') return 'ed-sev--critical';
  if (s === 'high')     return 'ed-sev--high';
  if (s === 'medium')   return 'ed-sev--medium';
  return 'ed-sev--low';
}

// ── Sparkline ─────────────────────────────────────────────────────────────────

function Sparkline({ data, color = 'var(--color-accent)', height = 36, width = 120 }) {
  if (!data || data.length < 2) {
    return <svg width={width} height={height} className="ed-spark" />;
  }
  const vals = data.map(Number).filter(isFinite);
  const min  = Math.min(...vals);
  const max  = Math.max(...vals);
  const range = max - min || 1;
  const pad   = 3;
  const W = width - pad * 2;
  const H = height - pad * 2;
  const pts = vals.map((v, i) => {
    const x = pad + (i / (vals.length - 1)) * W;
    const y = pad + H - ((v - min) / range) * H;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={width} height={height} className="ed-spark">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── TrendChart ────────────────────────────────────────────────────────────────

function TrendChart({ data, metrics, title }) {
  if (!data || data.length === 0) {
    return (
      <div className="ed-trend-empty">No trend data yet</div>
    );
  }

  const colors = {
    analysis: 'var(--color-accent)',
    upgrades: 'var(--color-success)',
    matches:  'var(--color-warning)',
  };

  const labels = data.map(d => d.day || d.date || '');
  const width  = 320;
  const height = 120;
  const pad    = { top: 10, right: 10, bottom: 24, left: 32 };
  const W = width  - pad.left - pad.right;
  const H = height - pad.top  - pad.bottom;

  const series = (metrics || ['analysis', 'upgrades', 'matches']).map(key => {
    const vals = data.map(d => d[key] ?? 0);
    return { key, vals };
  });

  const allVals = series.flatMap(s => s.vals);
  const gmax    = Math.max(...allVals, 1);

  function polyPts(vals) {
    return vals.map((v, i) => {
      const x = pad.left + (i / Math.max(vals.length - 1, 1)) * W;
      const y = pad.top  + H - (v / gmax) * H;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }

  // X-axis labels (first, middle, last)
  const labelIdxs = [...new Set([0, Math.floor(labels.length / 2), labels.length - 1])];

  return (
    <div className="ed-trend-chart">
      {title && <div className="ed-trend-title">{title}</div>}
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" className="ed-trend-svg">
        {/* Grid lines */}
        {[0.25, 0.5, 0.75, 1].map(f => {
          const y = pad.top + H - f * H;
          return (
            <g key={`grid-${f}`}>
              <line x1={pad.left} y1={y} x2={pad.left + W} y2={y}
                stroke="var(--color-border)" strokeWidth="0.5" />
              <text x={pad.left - 4} y={y + 3} textAnchor="end"
                fontSize="7" fill="var(--color-text-dim)">
                {Math.round(gmax * f)}
              </text>
            </g>
          );
        })}

        {/* Series lines */}
        {series.map(({ key, vals }) => (
          <polyline key={key} points={polyPts(vals)}
            fill="none" stroke={colors[key] || 'var(--color-text-dim)'}
            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        ))}

        {/* X-axis labels */}
        {labelIdxs.map(i => {
          if (i >= labels.length) return null;
          const x = pad.left + (i / Math.max(labels.length - 1, 1)) * W;
          return (
            <text key={`label-${i}`} x={x} y={height - 4} textAnchor="middle"
              fontSize="7" fill="var(--color-text-dim)">
              {(labels[i] || '').slice(5)}
            </text>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="ed-trend-legend">
        {series.map(({ key }) => (
          <span key={key} className="ed-trend-leg-item">
            <span className="ed-trend-leg-dot" style={{ background: colors[key] || '#999' }} />
            {key}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KPICard({ label, value, delta, deltaFmt, suffix, trend }) {
  const dc = deltaClass(delta);
  return (
    <div className="ed-kpi">
      <div className="ed-kpi__value">
        {value}
        {suffix && <span className="ed-kpi__suffix">{suffix}</span>}
      </div>
      <div className="ed-kpi__label">{label}</div>
      {delta != null && (
        <div className={`ed-kpi__delta ${dc}`}>
          {deltaStr(delta, deltaFmt)}
        </div>
      )}
      {trend && trend.length > 1 && (
        <Sparkline data={trend} width={100} height={28}
          color={delta != null && delta < 0 ? 'var(--color-error)' : 'var(--color-success)'} />
      )}
    </div>
  );
}

// ── KPI Bar ───────────────────────────────────────────────────────────────────

function KPIBar({ kpis, kpiPrev, benchStatus, trends }) {
  const k  = kpis || {};
  const kp = kpiPrev || {};
  const bs = benchStatus || {};

  // Compute deltas (current vs prev period)
  const deltaSucc  = k.success_rate != null && kp.success_rate != null
    ? k.success_rate - kp.success_rate : null;
  const deltaConv  = k.conversion_rate != null && kp.conversion_rate != null
    ? k.conversion_rate - kp.conversion_rate : null;
  const deltaRev   = k.revenue_per_session != null && kp.revenue_per_session != null
    ? k.revenue_per_session - kp.revenue_per_session : null;

  // Benchmark trend from last N runs
  const bmTrend = (trends?.['7d'] || []).map(d => d.upgrades || 0);

  return (
    <div className="ed-kpi-bar">
      <KPICard
        label="Success Rate"
        value={pct(k.success_rate)}
        delta={deltaSucc}
        deltaFmt="pct"
        trend={bmTrend}
      />
      <KPICard
        label="Conversion Rate"
        value={pct(k.conversion_rate)}
        delta={deltaConv}
        deltaFmt="pct"
      />
      <KPICard
        label="Rev / Session"
        value={usd(k.revenue_per_session)}
        delta={deltaRev}
        deltaFmt="usd"
      />
      <KPICard
        label="Benchmark Score"
        value={bs.overall_score != null ? (bs.overall_score * 100).toFixed(1) : '—'}
        delta={bs.baseline_delta}
        deltaFmt="raw"
      />
      <KPICard
        label="Conf. Error"
        value={bs.confidence_error != null ? `${(bs.confidence_error * 100).toFixed(1)}%` : '—'}
      />
    </div>
  );
}

// ── Pattern Table ─────────────────────────────────────────────────────────────

const PAT_COLS = [
  { key: 'pattern_id',          label: 'Pattern',        fmt: v => v || '—' },
  { key: 'benchmark_score',     label: 'BM Score',       fmt: v => v != null ? (v * 100).toFixed(1) : '—' },
  { key: 'conversion_rate_pct', label: 'Conv %',         fmt: v => v != null ? `${v}%` : '—' },
  { key: 'revenue_per_session', label: 'Rev/Session',    fmt: v => v != null ? `$${v}` : '—' },
  { key: 'live_success_rate',   label: 'Live Success',   fmt: v => v != null ? pct(v) : '—' },
  { key: 'delta_change',        label: 'Δ BM',           fmt: null }, // handled specially
  { key: 'analysis_count',      label: 'Analysis',       fmt: v => v ?? '—' },
];

function PatternTable({ patterns }) {
  const [sortKey,  setSortKey]  = useState('benchmark_score');
  const [sortDir,  setSortDir]  = useState('desc');

  if (!patterns || patterns.length === 0) {
    return (
      <div className="ed-card ed-card--wide">
        <div className="ed-card__hdr">
          <span className="ed-card__title">Pattern Performance</span>
        </div>
        <div className="ed-empty">No pattern data yet</div>
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

  return (
    <div className="ed-card ed-card--wide">
      <div className="ed-card__hdr">
        <span className="ed-card__title">Pattern Performance</span>
        <span className="ed-card__sub">{patterns.length} patterns</span>
      </div>
      <div className="ed-table-wrap">
        <table className="ed-table">
          <thead>
            <tr>
              {PAT_COLS.map(c => (
                <th key={c.key} className="ed-table__th"
                  onClick={() => toggleSort(c.key)}>
                  {c.label}
                  {sortKey === c.key && (
                    <span className="ed-sort-icon">{sortDir === 'asc' ? '↑' : '↓'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((p, i) => (
              <tr key={`${p.pattern_id}-${i}`} className="ed-table__row">
                {PAT_COLS.map(c => {
                  if (c.key === 'delta_change') {
                    const d = p.delta_change;
                    return (
                      <td key={c.key} className="ed-table__td">
                        {d != null
                          ? <span className={`ed-delta ${deltaClass(d)}`}>{deltaStr(d, 'raw')}</span>
                          : <span className="ed-dim">—</span>}
                      </td>
                    );
                  }
                  return (
                    <td key={c.key} className="ed-table__td">
                      {c.fmt ? c.fmt(p[c.key]) : (p[c.key] ?? '—')}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Failure Insights ──────────────────────────────────────────────────────────

function FailureInsights({ insights }) {
  if (!insights || insights.length === 0) {
    return (
      <div className="ed-card">
        <div className="ed-card__hdr">
          <span className="ed-card__title">Failure Insights</span>
        </div>
        <div className="ed-empty">No open issues — system healthy</div>
      </div>
    );
  }
  return (
    <div className="ed-card">
      <div className="ed-card__hdr">
        <span className="ed-card__title">Top Issues</span>
        <span className="ed-badge ed-badge--warn">{insights.length} open</span>
      </div>
      <div className="ed-insight-list">
        {insights.map((ins, i) => (
          <div key={ins.id || i} className="ed-insight">
            <div className="ed-insight__top">
              <span className={`ed-sev ${severityClass(ins.severity)}`}>
                {ins.severity || 'low'}
              </span>
              <span className="ed-insight__mode">{ins.mode || ins.failure_mode || '—'}</span>
              {ins.pattern && (
                <span className="ed-insight__pattern">{fmtPattern(ins.pattern)}</span>
              )}
            </div>
            <div className="ed-insight__meta">
              {ins.frequency > 1 && <span>{ins.frequency}× occurrences</span>}
              {ins.affected_sessions > 0 && (
                <span>{ins.affected_sessions} sessions affected</span>
              )}
              {ins.source === 'benchmark_regression' && (
                <span className="ed-dim">benchmark regression</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Benchmark Status ──────────────────────────────────────────────────────────

function BenchmarkStatus({ status }) {
  const bs = status || {};
  if (!bs.has_runs) {
    return (
      <div className="ed-card">
        <div className="ed-card__hdr">
          <span className="ed-card__title">Benchmark</span>
        </div>
        <div className="ed-empty">No runs yet</div>
      </div>
    );
  }

  const statusColor = bs.blocked
    ? 'var(--color-error)'
    : bs.regression_count > 0
      ? 'var(--color-warning)'
      : 'var(--color-success)';

  const scoreVal = bs.overall_score != null ? (bs.overall_score * 100).toFixed(1) : '—';

  return (
    <div className="ed-card">
      <div className="ed-card__hdr">
        <span className="ed-card__title">Benchmark</span>
        <span className={`ed-badge ${bs.blocked ? 'ed-badge--bad' : bs.regression_count > 0 ? 'ed-badge--warn' : 'ed-badge--good'}`}>
          {bs.blocked ? 'BLOCKED' : bs.regression_count > 0 ? `${bs.regression_count} regressions` : 'PASS'}
        </span>
      </div>

      <div className="ed-bm-score-row">
        <div className="ed-bm-score" style={{ color: statusColor }}>{scoreVal}</div>
        <div className="ed-bm-score-label">overall score</div>
        {bs.baseline_delta != null && (
          <span className={`ed-delta ${deltaClass(bs.baseline_delta)}`}>
            {deltaStr(bs.baseline_delta, 'raw')} vs baseline
          </span>
        )}
      </div>

      <div className="ed-bm-meta">
        <span>{bs.passed_cases}/{bs.total_cases} cases</span>
        <span>{relTime(bs.completed_at)}</span>
      </div>

      {/* Trend sparkline */}
      {bs.trend && bs.trend.length > 1 && (
        <div className="ed-bm-trend">
          <Sparkline
            data={bs.trend.map(t => (typeof t === 'object' ? t.overall_score : t))}
            width={200} height={40}
            color={statusColor}
          />
        </div>
      )}

      {/* Sub-scores */}
      <div className="ed-bm-subs">
        <div className="ed-bm-sub">
          <span className="ed-bm-sub__label">Pattern</span>
          <span className="ed-bm-sub__val">{bs.pattern_accuracy != null ? pct(bs.pattern_accuracy) : '—'}</span>
        </div>
        <div className="ed-bm-sub">
          <span className="ed-bm-sub__label">Blueprint</span>
          <span className="ed-bm-sub__val">{bs.blueprint_score != null ? (bs.blueprint_score * 100).toFixed(1) : '—'}</span>
        </div>
        <div className="ed-bm-sub">
          <span className="ed-bm-sub__label">Conf. Err</span>
          <span className="ed-bm-sub__val">{bs.confidence_error != null ? `${(bs.confidence_error * 100).toFixed(1)}%` : '—'}</span>
        </div>
      </div>

      {/* Top regressions */}
      {bs.top_regressions && bs.top_regressions.length > 0 && (
        <div className="ed-bm-regs">
          <div className="ed-bm-regs__title">Regressions</div>
          {bs.top_regressions.map((r, i) => (
            <div key={i} className="ed-bm-reg">
              <span className="ed-bm-reg__pat">{r.pattern_id || '—'}</span>
              <span className="ed-bm-reg__score">{r.final_score != null ? (r.final_score * 100).toFixed(1) : '—'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Revenue Breakdown ─────────────────────────────────────────────────────────

function RevenueBar({ label, count, total, color }) {
  const pctW = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="ed-rev-row">
      <span className="ed-rev-label">{label}</span>
      <div className="ed-rev-track">
        <div className="ed-rev-fill" style={{ width: `${pctW}%`, background: color }} />
      </div>
      <span className="ed-rev-count">{count}</span>
    </div>
  );
}

const PRODUCT_COLORS = {
  Pro:     'var(--color-accent)',
  Studio:  'var(--color-creative)',
  Core:    'var(--color-success)',
  Presets: 'var(--color-warning)',
  Other:   'var(--color-text-dim)',
};
const OUTCOME_COLORS = {
  nailed_it: 'var(--color-success)',
  close:     'var(--color-warning)',
  failed:    'var(--color-error)',
  unknown:   'var(--color-text-dim)',
};

function RevenueBreakdown({ revenue }) {
  const r = revenue || {};
  const total = r.total_upgrades || 0;

  return (
    <div className="ed-card">
      <div className="ed-card__hdr">
        <span className="ed-card__title">Revenue</span>
        <span className="ed-card__sub">{total} upgrades · {usd(r.estimated_revenue)}</span>
      </div>

      {total === 0 ? (
        <div className="ed-empty">No upgrades in period</div>
      ) : (
        <>
          <div className="ed-rev-section">
            <div className="ed-rev-section__title">By Product</div>
            {Object.entries(r.by_product || {}).map(([prod, cnt]) => (
              cnt > 0 && (
                <RevenueBar key={prod} label={prod} count={cnt} total={total}
                  color={PRODUCT_COLORS[prod] || 'var(--color-text-dim)'} />
              )
            ))}
          </div>

          <div className="ed-rev-section">
            <div className="ed-rev-section__title">By Outcome</div>
            {Object.entries(r.by_outcome || {}).map(([outcome, cnt]) => (
              cnt > 0 && (
                <RevenueBar key={outcome} label={outcome.replace('_', ' ')} count={cnt} total={total}
                  color={OUTCOME_COLORS[outcome] || 'var(--color-text-dim)'} />
              )
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Experiment Impact ─────────────────────────────────────────────────────────

function ExperimentCard({ exp }) {
  const mon = exp.monitoring || {};
  const alertClass = {
    positive: 'ed-exp--positive',
    negative: 'ed-exp--negative',
    neutral:  '',
    critical: 'ed-exp--negative',
  }[mon.alert_type] || '';

  const daysAgo = exp.release_date
    ? Math.round((Date.now() / 1000 - exp.release_date) / 86400)
    : null;

  return (
    <div className={`ed-exp ${alertClass}`}>
      <div className="ed-exp__title">{exp.title}</div>
      {daysAgo != null && (
        <div className="ed-exp__meta">{daysAgo}d ago · {exp.release_version || ''}</div>
      )}

      {mon.has_data ? (
        <div className="ed-exp__metrics">
          {mon.success_rate_delta != null && (
            <div className="ed-exp__metric">
              <span className="ed-exp__metric-label">Success</span>
              <span className={`ed-delta ${deltaClass(mon.success_rate_delta)}`}>
                {deltaStr(mon.success_rate_delta, 'pct')}
              </span>
            </div>
          )}
          {mon.conversion_delta != null && (
            <div className="ed-exp__metric">
              <span className="ed-exp__metric-label">Conv</span>
              <span className={`ed-delta ${deltaClass(mon.conversion_delta)}`}>
                {deltaStr(mon.conversion_delta, 'pct')}
              </span>
            </div>
          )}
          {mon.confidence_delta != null && (
            <div className="ed-exp__metric">
              <span className="ed-exp__metric-label">Conf Err</span>
              <span className={`ed-delta ${deltaClass(-mon.confidence_delta)}`}>
                {deltaStr(mon.confidence_delta, 'raw')}
              </span>
            </div>
          )}
          {mon.latest_window && (
            <div className="ed-exp__window">{mon.latest_window}d window</div>
          )}
        </div>
      ) : (
        <div className="ed-exp__pending">Monitoring pending</div>
      )}
    </div>
  );
}

function ExperimentImpact({ experiments }) {
  if (!experiments || experiments.length === 0) {
    return (
      <div className="ed-card">
        <div className="ed-card__hdr">
          <span className="ed-card__title">Experiment Impact</span>
        </div>
        <div className="ed-empty">No deployed experiments yet</div>
      </div>
    );
  }
  return (
    <div className="ed-card ed-card--wide">
      <div className="ed-card__hdr">
        <span className="ed-card__title">Experiment Impact</span>
        <span className="ed-card__sub">{experiments.length} releases</span>
      </div>
      <div className="ed-exp-list">
        {experiments.map(exp => (
          <ExperimentCard key={exp.id} exp={exp} />
        ))}
      </div>
    </div>
  );
}

// ── Flag Rollout Panel ────────────────────────────────────────────────────────

const GROUP_COLORS = {
  pricing:        'var(--color-accent)',
  paywall_timing: '#f5b041',
  cta_messaging:  '#9b7cff',
  yearly_discount:'#39d98a',
  paywall_value:  '#ff5d5d',
};

function FlagRolloutPanel() {
  const [flags,   setFlags]   = useState(null);
  const [saving,  setSaving]  = useState({});   // { [flagName]: true }
  const [pending, setPending] = useState({});   // { [flagName]: { pct, enabled } }
  const [error,   setError]   = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await getAllFlags();
      setFlags(data.flags || data);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function getPending(name, key, fallback) {
    return pending[name]?.[key] ?? fallback;
  }

  function setPct(name, val) {
    const clamped = Math.max(0, Math.min(100, Number(val)));
    setPending(p => ({ ...p, [name]: { ...p[name], pct: clamped } }));
  }

  function setEnabled(name, val) {
    setPending(p => ({ ...p, [name]: { ...p[name], enabled: val } }));
  }

  async function save(name, currentPct, currentEnabled) {
    const pctVal     = getPending(name, 'pct',     currentPct);
    const enabledVal = getPending(name, 'enabled', currentEnabled);
    setSaving(s => ({ ...s, [name]: true }));
    try {
      await updateFlagRollout(name, pctVal, enabledVal);
      // Reflect saved values back into flags state
      setFlags(f => ({
        ...f,
        [name]: { ...f[name], rollout_pct: pctVal, enabled: enabledVal },
      }));
      setPending(p => { const n = { ...p }; delete n[name]; return n; });
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(s => ({ ...s, [name]: false }));
    }
  }

  if (!flags && !error) {
    return (
      <div className="ed-card ed-card--wide">
        <div className="ed-card__hdr"><span className="ed-card__title">Feature Flags</span></div>
        <div className="ed-flag-loading">Loading flags…</div>
      </div>
    );
  }

  const entries = flags ? Object.entries(flags) : [];
  // Group by group field
  const grouped = entries.reduce((acc, [name, def]) => {
    const g = def.group || 'other';
    if (!acc[g]) acc[g] = [];
    acc[g].push([name, def]);
    return acc;
  }, {});

  return (
    <div className="ed-card ed-card--wide">
      <div className="ed-card__hdr">
        <span className="ed-card__title">Feature Flags</span>
        <span className="ed-card__sub">{entries.length} flags</span>
        <button className="ed-flag-refresh" onClick={load} title="Refresh flags">↻</button>
      </div>

      {error && (
        <div className="ed-flag-error">⚠ {error}</div>
      )}

      <div className="ed-flag-groups">
        {Object.entries(grouped).map(([group, groupFlags]) => (
          <div key={group} className="ed-flag-group">
            <div
              className="ed-flag-group__label"
              style={{ color: GROUP_COLORS[group] || 'var(--color-text-dim)' }}
            >
              {group.replace(/_/g, ' ')}
            </div>

            {groupFlags.map(([name, def]) => {
              const currentPct     = def.rollout_pct ?? 0;
              const currentEnabled = def.enabled ?? false;
              const pctVal         = getPending(name, 'pct',     currentPct);
              const enabledVal     = getPending(name, 'enabled', currentEnabled);
              const isDirty        = pctVal !== currentPct || enabledVal !== currentEnabled;
              const isSaving       = saving[name];

              return (
                <div key={name} className={`ed-flag-row${isDirty ? ' ed-flag-row--dirty' : ''}`}>
                  <div className="ed-flag-row__name" title={name}>{name}</div>

                  {/* Enable/disable toggle */}
                  <button
                    className={`ed-flag-toggle${enabledVal ? ' ed-flag-toggle--on' : ''}`}
                    onClick={() => setEnabled(name, !enabledVal)}
                    title={enabledVal ? 'Disable flag' : 'Enable flag'}
                    type="button"
                  >
                    {enabledVal ? 'ON' : 'OFF'}
                  </button>

                  {/* Rollout % slider */}
                  <div className="ed-flag-slider-wrap">
                    <input
                      className="ed-flag-slider"
                      type="range"
                      min={0} max={100} step={5}
                      value={pctVal}
                      onChange={e => setPct(name, e.target.value)}
                    />
                    <input
                      className="ed-flag-pct-input"
                      type="number"
                      min={0} max={100}
                      value={pctVal}
                      onChange={e => setPct(name, e.target.value)}
                    />
                    <span className="ed-flag-pct-sym">%</span>
                  </div>

                  {/* Save button — only shown when dirty */}
                  <button
                    className={`ed-flag-save${isDirty ? ' ed-flag-save--visible' : ''}`}
                    onClick={() => save(name, currentPct, currentEnabled)}
                    disabled={isSaving || !isDirty}
                    type="button"
                  >
                    {isSaving ? '…' : 'Save'}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton({ h = 20, w = '100%', mb = 8 }) {
  return (
    <div className="ed-skel" style={{ height: h, width: w, marginBottom: mb }} />
  );
}

function SkeletonDashboard() {
  return (
    <div className="ed-skeleton">
      <div className="ed-kpi-bar">
        {[1,2,3,4,5].map(i => (
          <div key={i} className="ed-kpi">
            <Skeleton h={12} w="60%" />
            <Skeleton h={28} w="80%" mb={4} />
            <Skeleton h={10} w="40%" />
          </div>
        ))}
      </div>
      <div className="ed-grid">
        <div className="ed-card"><Skeleton h={160} /></div>
        <div className="ed-card"><Skeleton h={160} /></div>
      </div>
      <div className="ed-card ed-card--wide"><Skeleton h={200} /></div>
    </div>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function ExecDashboard() {
  const dispatch = useDispatch();
  const [days,        setDays]       = useState(7);
  const [origin,      setOrigin]     = useState('all');
  const [data,        setData]       = useState(null);
  const [trends,      setTrends]     = useState(null);
  const [loading,     setLoading]    = useState(true);
  const [error,       setError]      = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [trendDays,   setTrendDays]  = useState(7);
  const timerRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const [dash, tr] = await Promise.all([
        getExecDashboard(days, origin),
        getExecTrends(),
      ]);
      setData(dash);
      setTrends(tr);
      setLastRefresh(Date.now());
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [days, origin]);

  useEffect(() => {
    setLoading(true);
    load();
    timerRef.current = setInterval(load, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [load]);

  const trendData = trends?.[trendDays === 7 ? '7d' : '30d'] || [];

  return (
    <div className="screen ed-screen">
      {/* Header */}
      <div className="ed-header">
        <div className="ed-header__left">
          <button
            className="adb__back-btn"
            type="button"
            onClick={() => dispatch({ type: 'GO_BACK' })}
            title="Back to Settings"
          >← Settings</button>
          <h2 className="ed-title">Executive Dashboard</h2>
          <div className="adb__view-tabs">
            <button
              className="adb__view-tab"
              type="button"
              onClick={() => dispatch({ type: 'NAVIGATE', screen: 'analytics' })}
            >Analytics</button>
            <button className="adb__view-tab adb__view-tab--on" type="button">Executive</button>
          </div>
        </div>
        <div className="ed-header__right">
          <div className="adb__origin-group" title="Filter sessions by origin">
            {[{ id: 'all', label: 'All' }, { id: 'production', label: 'Prod' }, { id: 'internal', label: 'Dev' }].map(o => (
              <button
                key={o.id}
                className={`adb__origin-btn${origin === o.id ? ' adb__origin-btn--on' : ''}`}
                type="button"
                onClick={() => setOrigin(o.id)}
              >{o.label}</button>
            ))}
          </div>
          <div className="adb__controls-sep" />
          <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
            {DAY_OPTIONS.map(o => (
              <button key={o.value}
                className={`adb__range-btn${days === o.value ? ' adb__range-btn--on' : ''}`}
                type="button"
                onClick={() => setDays(o.value)}>
                {o.label}
              </button>
            ))}
          </div>
          {lastRefresh && (
            <span className="ed-refresh-badge">
              Updated {relTime(lastRefresh / 1000)}
            </span>
          )}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="ed-error">
          <span>⚠ {error}</span>
          <button className="ed-error__retry" onClick={load}>Retry</button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !data && <SkeletonDashboard />}

      {/* Dashboard content */}
      {data && (
        <>
          {/* 1. KPI Bar */}
          <KPIBar
            kpis={data.kpis}
            kpiPrev={data.kpi_prev}
            benchStatus={data.benchmark_status}
            trends={trends}
          />

          {/* 2. Trend Charts */}
          <div className="ed-card ed-card--wide">
            <div className="ed-card__hdr">
              <span className="ed-card__title">Trends</span>
              <div className="ed-day-selector ed-day-selector--sm">
                {[7, 30].map(d => (
                  <button key={d}
                    className={`ed-day-btn ed-day-btn--sm ${trendDays === d ? 'ed-day-btn--active' : ''}`}
                    onClick={() => setTrendDays(d)}>
                    {d}d
                  </button>
                ))}
              </div>
            </div>
            <TrendChart
              data={trendData}
              metrics={['analysis', 'upgrades', 'matches']}
            />
          </div>

          {/* 3 + 4. Pattern Table & Failure Insights */}
          <div className="ed-grid">
            <FailureInsights insights={data.failure_insights} />
            <BenchmarkStatus status={data.benchmark_status} />
          </div>

          {/* Pattern Table (full width) */}
          <PatternTable patterns={data.patterns} />

          {/* 5 + 6. Revenue + Experiments */}
          <div className="ed-grid">
            <RevenueBreakdown revenue={data.revenue} />
            <div className="ed-card">
              <div className="ed-card__hdr">
                <span className="ed-card__title">Session Quality</span>
              </div>
              <div className="ed-sq-grid">
                <div className="ed-sq-item">
                  <div className="ed-sq-val">{data.kpis?.total_sessions ?? '—'}</div>
                  <div className="ed-sq-label">Sessions</div>
                </div>
                <div className="ed-sq-item">
                  <div className="ed-sq-val">{data.kpis?.total_analysis ?? '—'}</div>
                  <div className="ed-sq-label">Analysis</div>
                </div>
                <div className="ed-sq-item">
                  <div className="ed-sq-val">{pct(data.kpis?.success_rate)}</div>
                  <div className="ed-sq-label">Match Rate</div>
                </div>
                <div className="ed-sq-item">
                  <div className="ed-sq-val">{data.kpis?.total_upgrades ?? '—'}</div>
                  <div className="ed-sq-label">Upgrades</div>
                </div>
                <div className="ed-sq-item">
                  <div className="ed-sq-val">{pct(data.kpis?.shoot_match_rate != null ? data.kpis.shoot_match_rate / 100 : null)}</div>
                  <div className="ed-sq-label">Shoot Match</div>
                </div>
                <div className="ed-sq-item">
                  <div className="ed-sq-val">{data.kpis?.avg_steps_to_match != null ? data.kpis.avg_steps_to_match.toFixed(1) : '—'}</div>
                  <div className="ed-sq-label">Avg Steps</div>
                </div>
              </div>
            </div>
          </div>

          {/* 7. Experiment Impact (legacy) */}
          <ExperimentImpact experiments={data.experiments} />

          {/* 8. Live A/B Experiments */}
          <div className="ed-section">
            <h2 className="ed-section-title">A/B Experiments</h2>
            <ExperimentsPanel days={days} />
          </div>

          {/* 9. Feature Flag Rollout */}
          <div className="ed-section">
            <h2 className="ed-section-title">Feature Flags</h2>
            <FlagRolloutPanel />
          </div>
        </>
      )}
    </div>
  );
}
