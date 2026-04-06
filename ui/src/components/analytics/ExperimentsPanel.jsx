/**
 * ExperimentsPanel — A/B test results + decision engine candidates.
 *
 * Shows per-flag metrics (sessions, CVR, ARPU) and
 * the decision engine's promote/rollback/hold candidates.
 *
 * Used inside ExecDashboard for admin/enterprise users.
 */

import { useEffect, useState } from 'react';
import { getToken } from '../../data/authApi';

const ACTION_COLOR = {
  PROMOTE: 'var(--color-success, #22c55e)',
  ROLLBACK: 'var(--color-error, #ef4444)',
  HOLD: 'var(--color-muted, #94a3b8)',
};

const ACTION_EMOJI = { PROMOTE: '🚀', ROLLBACK: '⏪', HOLD: '⏸' };

function MetricChip({ label, value, sub, accent }) {
  return (
    <div className={`exp-metric-chip${accent ? ' exp-metric-chip--accent' : ''}`}>
      <div className="exp-metric-chip__value">{value}</div>
      <div className="exp-metric-chip__label">{label}</div>
      {sub && <div className="exp-metric-chip__sub">{sub}</div>}
    </div>
  );
}

function VariantRow({ variant }) {
  const isControl = variant.variant === 'control';
  return (
    <div className={`exp-variant-row${isControl ? ' exp-variant-row--control' : ' exp-variant-row--treatment'}`}>
      <span className="exp-variant-row__name">{variant.variant}</span>
      <MetricChip label="Sessions" value={variant.sessions?.toLocaleString() ?? '—'} />
      <MetricChip
        label="CVR"
        value={`${variant.conversion_rate ?? 0}%`}
        accent={!isControl && variant.conversion_rate > 0}
      />
      <MetricChip label="ARPU" value={`$${variant.arpu_est ?? 0}`} />
      <MetricChip label="Revenue" value={`$${variant.revenue_est ?? 0}`} />
      <MetricChip label="Paywall Hits" value={variant.paywall_hits?.toLocaleString() ?? '—'} />
    </div>
  );
}

function ExperimentCard({ exp }) {
  const [open, setOpen] = useState(false);
  const variants = exp.variants || [];
  const control = variants.find(v => v.variant === 'control');
  const treatment = variants.find(v => v.variant === 'treatment');

  const cvrDelta = treatment && control
    ? (treatment.conversion_rate - control.conversion_rate).toFixed(1)
    : null;
  const arDelta = treatment && control
    ? (treatment.arpu_est - control.arpu_est).toFixed(2)
    : null;

  return (
    <div className="exp-card">
      <button
        className="exp-card__header"
        onClick={() => setOpen(o => !o)}
        type="button"
      >
        <span className="exp-card__flag">{exp.flag_name}</span>
        {cvrDelta !== null && (
          <span className={`exp-card__delta ${Number(cvrDelta) >= 0 ? 'exp-card__delta--pos' : 'exp-card__delta--neg'}`}>
            CVR {Number(cvrDelta) >= 0 ? '+' : ''}{cvrDelta}pp
          </span>
        )}
        {arDelta !== null && (
          <span className={`exp-card__delta ${Number(arDelta) >= 0 ? 'exp-card__delta--pos' : 'exp-card__delta--neg'}`}>
            ARPU {Number(arDelta) >= 0 ? '+$' : '-$'}{Math.abs(arDelta)}
          </span>
        )}
        <span className="exp-card__sessions">
          {variants.reduce((s, v) => s + (v.sessions || 0), 0).toLocaleString()} sessions
        </span>
        <span className="exp-card__chevron">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="exp-card__body">
          {variants.map(v => <VariantRow key={v.variant} variant={v} />)}
        </div>
      )}
    </div>
  );
}

function CandidateCard({ candidate }) {
  const color = ACTION_COLOR[candidate.action] || ACTION_COLOR.HOLD;
  const emoji = ACTION_EMOJI[candidate.action] || '•';

  return (
    <div className="exp-candidate" style={{ borderLeftColor: color }}>
      <div className="exp-candidate__header">
        <span className="exp-candidate__emoji">{emoji}</span>
        <span className="exp-candidate__action" style={{ color }}>
          {candidate.action}
        </span>
        <span className="exp-candidate__flag">{candidate.flag_name}</span>
      </div>
      <p className="exp-candidate__reason">{candidate.reason}</p>
      <div className="exp-candidate__metrics">
        <span>
          Control: {candidate.control?.cvr}% CVR · ${candidate.control?.arpu} ARPU
          · {candidate.control?.sessions?.toLocaleString()} sessions
        </span>
        <span>
          Treatment: {candidate.treatment?.cvr}% CVR · ${candidate.treatment?.arpu} ARPU
          · {candidate.treatment?.sessions?.toLocaleString()} sessions
        </span>
      </div>
    </div>
  );
}

export default function ExperimentsPanel({ days = 30 }) {
  const [experiments, setExperiments] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('candidates'); // 'candidates' | 'experiments'

  useEffect(() => {
    setLoading(true);
    const token = getToken();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    Promise.all([
      fetch(`/api/experiments/metrics?days=${days}`, { headers }).then(r => r.json()),
      fetch(`/api/experiments/candidates?days=${days}`, { headers }).then(r => r.json()),
    ])
      .then(([metricsData, candidatesData]) => {
        setExperiments(metricsData.experiments || []);
        setCandidates(candidatesData.candidates || []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [days]);

  if (loading) return <div className="exp-panel__loading">Loading experiments…</div>;
  if (error) return <div className="exp-panel__error">Failed to load: {error}</div>;

  const hasData = experiments.length > 0 || candidates.length > 0;

  return (
    <div className="exp-panel">
      <div className="exp-panel__tabs">
        {['candidates', 'experiments'].map(t => (
          <button
            key={t}
            className={`exp-panel__tab${tab === t ? ' exp-panel__tab--active' : ''}`}
            onClick={() => setTab(t)}
            type="button"
          >
            {t === 'candidates' ? `Decisions (${candidates.length})` : `Experiments (${experiments.length})`}
          </button>
        ))}
      </div>

      {!hasData && (
        <div className="exp-panel__empty">
          No experiment data yet. Flags are assigned as sessions start.
        </div>
      )}

      {tab === 'candidates' && (
        <div className="exp-panel__candidates">
          {candidates.length === 0 && hasData && (
            <div className="exp-panel__empty">
              No decisions yet — need ≥50 treatment sessions per flag.
            </div>
          )}
          {candidates.map(c => <CandidateCard key={c.flag_name} candidate={c} />)}
        </div>
      )}

      {tab === 'experiments' && (
        <div className="exp-panel__experiments">
          {experiments.map(e => <ExperimentCard key={e.flag_name} exp={e} />)}
        </div>
      )}
    </div>
  );
}
