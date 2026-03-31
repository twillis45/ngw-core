/**
 * LearningOpsTab — Closed-loop learning surface inside NGW Lab.
 *
 * Surfaces:
 *   Overview     — ops summary: cluster counts, alerts, pending evals
 *   Clusters     — failure cluster list with generate-candidate action
 *   Monitoring   — post-release windows and alerts
 */
import { useState, useEffect, useCallback, useRef, forwardRef } from 'react';
import {
  getLearningOps,
  triggerIngestion,
  listFailureClusters,
  generateCandidateFromCluster,
  updateClusterStatus,
  evaluateCandidate,
  getCandidateEvaluations,
  updateCandidate,
  getCandidate,
  getMonitoringSummary,
  getMonitoringReport,
  triggerMonitoringSweep,
  triggerSweepAll,
  applyCandidate,
  getVlmCorrections,
  getGoldSetSuggestions,
  getSchedulerStatus,
  startScheduler,
  stopScheduler,
  configureScheduler,
  runSchedulerNow,
  getKnowledgeBase,
  getKnowledgeEntry,
  runCIGate,
  aggregatePatternSignals,
  simulateRevenue,
  getSimulationHistory,
  getLatestSimulation,
  getIntelligenceScore,
} from '../../data/labApi';
import { C, pctColor, okColor } from '../../lib/statusColors';

/** Device timezone — resolved once at module load for all date formatting. */
const _TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

const SEVERITY_COLOR = {
  critical: C.red,
  high: C.amber,
  medium: C.blue,
  low: 'var(--color-text-dim)',
};

const VERDICT_COLOR = {
  safe: C.green,
  risky: C.amber,
  blocked: C.red,
};

const ALERT_COLOR = {
  rollback_review: C.red,
  candidate_regression: C.amber,
  nominal: C.green,
};

function Badge({ label, color }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px',
      background: color + '22', color,
      borderRadius: 'var(--radius-full)', fontSize: 'var(--text-xs)',
      fontWeight: 'var(--weight-semibold)', border: `1px solid ${color}44`,
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

const Card = forwardRef(function Card({ children, style }, ref) {
  return (
    <div ref={ref} style={{
      background: 'var(--color-surface)',
      border: '0.5px solid var(--color-border)',
      borderRadius: 12,
      padding: 14,
      marginBottom: 10,
      ...style,
    }}>
      {children}
    </div>
  );
});

function SectionTitle({ children }) {
  return (
    <div style={{
      fontSize: 9, textTransform: 'uppercase',
      letterSpacing: '0.08em', color: 'var(--color-text-secondary)',
      fontWeight: 700, marginBottom: 8,
    }}>
      {children}
    </div>
  );
}

// ── Scheduler Control ─────────────────────────────────────────────────────────

function SchedulerControl({ status, onStatusChange }) {
  const [working,     setWorking]     = useState(false);
  const [expanded,    setExpanded]    = useState(false);
  const [intervalVal, setIntervalVal] = useState(status?.interval_hours ?? 24);
  const [windowVal,   setWindowVal]   = useState(status?.window_days    ?? 30);
  const [notice,      setNotice]      = useState(null);

  // Keep fields in sync when status changes from outside
  useEffect(() => {
    if (!expanded && status) {
      setIntervalVal(status.interval_hours ?? 24);
      setWindowVal(status.window_days ?? 30);
    }
  }, [status, expanded]);

  function showNotice(type, msg) {
    setNotice({ type, msg });
    setTimeout(() => setNotice(null), 4000);
  }

  async function act(fn, successMsg) {
    setWorking(true);
    try {
      const result = await fn();
      onStatusChange(result);
      if (successMsg) showNotice('ok', successMsg);
    } catch (err) {
      showNotice('err', err.message || 'Request failed');
    } finally {
      setWorking(false);
    }
  }

  async function handleToggle() {
    if (status?.enabled) {
      await act(() => stopScheduler(), 'Scheduler stopped');
    } else {
      await act(
        () => startScheduler({ intervalHours: intervalVal, windowDays: windowVal }),
        'Scheduler started'
      );
    }
  }

  async function handleSaveConfig() {
    await act(
      () => configureScheduler({ intervalHours: intervalVal, windowDays: windowVal }),
      `Config saved${status?.enabled ? ' — restarted' : ''}`
    );
    setExpanded(false);
  }

  async function handleRunNow() {
    await act(() => runSchedulerNow(), 'Run triggered');
  }

  function fmtTime(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString(undefined, {
        timeZone: _TZ,
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch { return iso; }
  }

  const enabled   = status?.enabled ?? false;
  const dotColor  = enabled ? C.green : 'var(--color-text-dim)';
  const inputBase = {
    background: 'var(--color-bg)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--color-text)',
    fontSize: 'var(--text-sm)', padding: '3px 6px', width: 60,
  };

  return (
    <div style={{
      background: 'var(--color-surface-elevated)',
      border: `1px solid ${enabled ? '#34D39933' : 'var(--color-border)'}`,
      borderRadius: 'var(--radius-md)',
      marginBottom: 'var(--space-md)',
      overflow: 'hidden',
    }}>
      {/* ── Header row ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 'var(--space-sm)',
        padding: 'var(--space-xs) var(--space-sm)', flexWrap: 'wrap',
      }}>
        {/* Dot + label */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
            background: dotColor,
            boxShadow: enabled ? `0 0 6px ${dotColor}88` : 'none',
            animation: enabled ? 'pulse 2s ease-in-out infinite' : 'none',
          }} />
          <span style={{ fontSize: 'var(--text-xs)', color: dotColor, fontWeight: 'var(--weight-semibold)', whiteSpace: 'nowrap' }}>
            {enabled ? 'Scheduler active' : 'Scheduler off'}
          </span>
          {enabled && (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)', whiteSpace: 'nowrap' }}>
              every {status.interval_hours}h · {status.window_days}d window
            </span>
          )}
          {!enabled && (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)', whiteSpace: 'nowrap' }}>
              Set <code style={{ fontSize: 'inherit' }}>ENABLE_SCHEDULER=1</code> to auto-start on boot
            </span>
          )}
        </div>

        {/* Run history */}
        <div style={{ display: 'flex', gap: 'var(--space-sm)', marginLeft: 'auto', alignItems: 'center', flexWrap: 'wrap' }}>
          {status?.last_run_at && (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)', whiteSpace: 'nowrap' }}>
              Last{' '}
              <span style={{ color: status.last_run_error ? C.red : 'var(--color-text)' }}>
                {fmtTime(status.last_run_at)}
              </span>
              {status.last_run_error && <span style={{ color: C.red }}> ✕</span>}
              {status.last_run_result && !status.last_run_error && (
                <span style={{ color: C.green }}>
                  {' '}+{status.last_run_result.clusters_created ?? 0} / ~{status.last_run_result.clusters_updated ?? 0}
                </span>
              )}
            </span>
          )}
          {enabled && status?.next_run_at && (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)', whiteSpace: 'nowrap' }}>
              Next <span style={{ color: 'var(--color-text)' }}>{fmtTime(status.next_run_at)}</span>
            </span>
          )}
          {status?.run_count > 0 && (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)' }}>
              {status.run_count} run{status.run_count !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 'var(--space-xs)', alignItems: 'center', flexShrink: 0 }}>
          {enabled && (
            <button
              className="btn btn--ghost btn--sm"
              onClick={handleRunNow}
              disabled={working}
              title="Trigger an ingestion run now and reset the timer"
              style={{ fontSize: 'var(--text-xs)', padding: '2px 8px' }}
            >
              ↻ Now
            </button>
          )}
          <button
            className={`btn btn--sm ${enabled ? 'btn--ghost' : 'btn--primary'}`}
            onClick={handleToggle}
            disabled={working}
            style={{ fontSize: 'var(--text-xs)', padding: '2px 8px', minWidth: 52 }}
          >
            {working ? '…' : enabled ? 'Stop' : 'Start'}
          </button>
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => setExpanded(e => !e)}
            title="Configure interval and window"
            style={{ fontSize: 'var(--text-xs)', padding: '2px 6px' }}
          >
            {expanded ? '▲' : '⚙'}
          </button>
        </div>
      </div>

      {/* ── Config panel (expanded) ── */}
      {expanded && (
        <div style={{
          borderTop: '1px solid var(--color-border)',
          padding: 'var(--space-sm)',
          display: 'flex', gap: 'var(--space-md)', alignItems: 'flex-end', flexWrap: 'wrap',
        }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)' }}>
              Interval (hours)
            </span>
            <input
              type="number" min={1} max={168} step={1}
              value={intervalVal}
              onChange={e => setIntervalVal(Number(e.target.value))}
              style={inputBase}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)' }}>
              Window (days)
            </span>
            <input
              type="number" min={7} max={90} step={1}
              value={windowVal}
              onChange={e => setWindowVal(Number(e.target.value))}
              style={inputBase}
            />
          </label>
          <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
            <button
              className="btn btn--primary btn--sm"
              onClick={handleSaveConfig}
              disabled={working}
              style={{ fontSize: 'var(--text-xs)' }}
            >
              {working ? 'Saving…' : 'Save'}
            </button>
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => { setExpanded(false); setIntervalVal(status?.interval_hours ?? 24); setWindowVal(status?.window_days ?? 30); }}
              style={{ fontSize: 'var(--text-xs)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Inline notice ── */}
      {notice && (
        <div style={{
          borderTop: '1px solid var(--color-border)',
          padding: '4px var(--space-sm)',
          fontSize: 'var(--text-xs)',
          color: notice.type === 'ok' ? C.green : C.red,
        }}>
          {notice.type === 'ok' ? '✓' : '✕'} {notice.msg}
        </div>
      )}
    </div>
  );
}


// ── Panel description banner ─────────────────────────────────────────────────

function PanelDesc({ text }) {
  return (
    <p style={{
      fontSize: 12,
      color: 'var(--color-text-secondary)',
      background: 'var(--color-surface)',
      border: '0.5px solid var(--color-border)',
      borderRadius: 10,
      padding: '8px 12px',
      lineHeight: 1.5,
      margin: '0 0 12px',
    }}>
      {text}
    </p>
  );
}

// ── Overview Panel ──────────────────────────────────────────────────────────

function OverviewPanel({ ops, scheduler, onRefresh, onIngest, ingesting, devMode, onDevModeChange, onSchedulerChange, ingestResult, onGoToClusters }) {
  if (!ops) return <div style={{ color: 'var(--color-text-dim)', padding: 'var(--space-lg)' }}>Loading…</div>;

  return (
    <div>
      <PanelDesc text="Pipeline health summary. Shows open failure clusters, pending candidate evaluations, active monitoring windows, and alerts. Use Ingestion to pull fresh signals from production into the analysis engine." />
      <SchedulerControl status={scheduler} onStatusChange={onSchedulerChange} />
      <OverviewBody
        ops={ops}
        onRefresh={onRefresh}
        onIngest={onIngest}
        ingesting={ingesting}
        devMode={devMode}
        onDevModeChange={onDevModeChange}
        ingestResult={ingestResult}
        onGoToClusters={onGoToClusters}
      />
    </div>
  );
}

function OverviewBody({ ops, onRefresh, onIngest, ingesting, devMode, onDevModeChange, ingestResult, onGoToClusters }) {
  // Stat tiles — each can navigate to clusters with a specific filter
  const statItems = [
    {
      label: 'Open Clusters',
      value: ops.open_clusters,
      color: ops.open_clusters > 0 ? 'var(--color-text)' : C.green,
      nav: ops.open_clusters > 0 ? { status: 'open' } : null,
      hint: ops.open_clusters > 0 ? 'Click to review →' : null,
    },
    {
      label: 'Critical / High',
      value: ops.critical_clusters,
      color: ops.critical_clusters > 0 ? C.red : C.green,
      nav: ops.critical_clusters > 0 ? { status: 'open', severity: 'critical' } : null,
      hint: ops.critical_clusters > 0 ? 'Needs attention →' : '✓ None',
      urgent: ops.critical_clusters > 0,
    },
    {
      label: 'Investigating',
      value: ops.investigating_clusters,
      color: ops.investigating_clusters > 0 ? C.amber : 'var(--color-text-dim)',
      nav: ops.investigating_clusters > 0 ? { status: 'investigating' } : null,
      hint: ops.investigating_clusters > 0 ? 'In progress →' : null,
    },
    {
      label: 'Need Eval',
      value: ops.candidates_needing_eval,
      color: ops.candidates_needing_eval > 0 ? C.blue : C.green,
      nav: null, // navigates to Clusters panel but shows unevaluated candidates context
      hint: ops.candidates_needing_eval > 0 ? 'Awaiting eval' : '✓ All evaled',
    },
    {
      label: 'Active Alerts',
      value: ops.active_alerts,
      color: ops.active_alerts > 0 ? C.red : C.green,
      nav: null,
      hint: ops.active_alerts > 0 ? '→ Monitoring' : '✓ Clear',
      urgent: ops.active_alerts > 0,
    },
  ];

  return (
    <div>
      {/* ── Stat tiles — first 4 in a row, alerts full-width below ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
        {statItems.slice(0, 4).map(s => (
          <div
            key={s.label}
            role={s.nav ? 'button' : undefined}
            tabIndex={s.nav ? 0 : undefined}
            onClick={s.nav ? () => onGoToClusters(s.nav) : undefined}
            onKeyDown={s.nav ? e => e.key === 'Enter' && onGoToClusters(s.nav) : undefined}
            style={{
              textAlign: 'center',
              background: s.urgent
                ? 'color-mix(in srgb, var(--color-error) 8%, var(--color-surface-elevated))'
                : 'var(--color-surface-elevated)',
              border: s.urgent ? '0.5px solid #F8717166' : '0.5px solid var(--color-border)',
              borderRadius: 10,
              padding: '10px 6px',
              cursor: s.nav ? 'pointer' : 'default',
              transition: 'border-color 0.15s, background 0.15s',
            }}
            onMouseEnter={s.nav ? e => { e.currentTarget.style.borderColor = s.color; e.currentTarget.style.background = `color-mix(in srgb, ${s.color} 10%, var(--color-surface-elevated))`; } : undefined}
            onMouseLeave={s.nav ? e => { e.currentTarget.style.borderColor = s.urgent ? C.redBorder : 'var(--color-border)'; e.currentTarget.style.background = s.urgent ? 'color-mix(in srgb, var(--color-error) 8%, var(--color-surface-elevated))' : 'var(--color-surface-elevated)'; } : undefined}
          >
            <div style={{ fontSize: 22, fontWeight: 900, color: s.color, fontFamily: 'var(--font-mono, monospace)' }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2, whiteSpace: 'nowrap' }}>{s.label}</div>
            {s.hint && (
              <div style={{ fontSize: 9, color: s.nav ? s.color : 'var(--color-text-secondary)', marginTop: 3, opacity: 0.8, whiteSpace: 'nowrap' }}>
                {s.hint}
              </div>
            )}
          </div>
        ))}
      </div>
      {/* Active Alerts — full-width card */}
      {statItems[4] && (() => {
        const s = statItems[4];
        return (
          <div
            key={s.label}
            style={{
              textAlign: 'center',
              background: s.urgent ? 'color-mix(in srgb, var(--color-error) 8%, var(--color-surface-elevated))' : 'var(--color-surface-elevated)',
              border: s.urgent ? '0.5px solid #F8717166' : '0.5px solid var(--color-border)',
              borderRadius: 10, padding: '10px 6px', marginBottom: 12,
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 900, color: s.color, fontFamily: 'var(--font-mono, monospace)' }}>{s.value}</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>{s.label}</div>
            {s.hint && <div style={{ fontSize: 9, color: 'var(--color-text-secondary)', marginTop: 3, opacity: 0.8 }}>{s.hint}</div>}
          </div>
        );
      })()}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'center', overflowX: 'auto', whiteSpace: 'nowrap' }}>
        <button
          className="btn btn--primary btn--sm"
          onClick={onIngest}
          disabled={ingesting}
          style={{ flex: '1 0 auto' }}
        >
          {ingesting ? 'Ingesting…' : '↻ Run Ingestion'}
        </button>
        <button className="btn btn--ghost btn--sm" onClick={onRefresh} style={{ flex: '1 0 auto' }}>
          Refresh
        </button>
        {/* Dev mode toggle — bypasses production filter to include internal sessions */}
        <label
          title="Include internal/dev sessions — use when no production traffic exists yet"
          style={{
            display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer',
            fontSize: 'var(--text-xs)', color: devMode ? C.amber : 'var(--color-text-dim)',
            userSelect: 'none', whiteSpace: 'nowrap',
          }}
        >
          <input
            type="checkbox"
            checked={devMode}
            onChange={e => onDevModeChange(e.target.checked)}
            style={{ accentColor: C.amber, cursor: 'pointer' }}
          />
          Dev mode
        </label>
      </div>
      {devMode && (
        <div style={{
          fontSize: 'var(--text-xs)', color: C.amber,
          background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)',
          borderRadius: 'var(--radius-sm)', padding: '4px 8px',
          marginBottom: 'var(--space-md)',
        }}>
          Dev mode on — ingestion includes internal sessions. Scheduler always uses production only.
        </div>
      )}

      {/* ── Post-ingestion result + workflow guide ── */}
      {ingestResult && (
        <div style={{
          borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-md)',
          border: `1px solid ${ingestResult.error ? '#F8717144' : '#34D39944'}`,
          background: ingestResult.error
            ? 'color-mix(in srgb, #F87171 8%, transparent)'
            : 'color-mix(in srgb, #34D399 8%, transparent)',
          overflow: 'hidden',
        }}>
          {/* Result header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', padding: 'var(--space-xs) var(--space-sm)' }}>
            {ingestResult.error ? (
              <span style={{ fontSize: 'var(--text-xs)', color: C.red }}>⚠ Ingestion failed: {ingestResult.error}</span>
            ) : (
              <>
                <span style={{ fontSize: 'var(--text-xs)', color: C.green }}>
                  ✓ {ingestResult.total_clusters} cluster{ingestResult.total_clusters !== 1 ? 's' : ''} created/updated
                  {ingestResult.mode === 'dev' && <span style={{ color: C.amber, marginLeft: 4 }}>(dev mode)</span>}
                </span>
                {ingestResult.total_clusters > 0 && (
                  <button
                    className="btn btn--primary btn--sm"
                    onClick={onGoToClusters}
                    style={{ fontSize: 'var(--text-xs)', padding: '2px 8px', marginLeft: 'auto' }}
                  >
                    → Clusters
                  </button>
                )}
              </>
            )}
          </div>

          {/* Breakdown by failure mode */}
          {!ingestResult.error && ingestResult.by_failure_mode && (
            <div style={{
              padding: '0 var(--space-sm) var(--space-xs)',
              display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap',
            }}>
              {Object.entries(ingestResult.by_failure_mode)
                .filter(([, n]) => n > 0)
                .map(([mode, n]) => (
                  <span key={mode} style={{
                    fontSize: 'var(--text-xs)', padding: '1px 6px', borderRadius: 'var(--radius-sm)',
                    background: 'var(--color-surface-elevated)', color: 'var(--color-text-secondary)',
                    border: '1px solid var(--color-border)',
                  }}>
                    {mode.replace(/_/g, ' ')} ×{n}
                  </span>
                ))}
            </div>
          )}

          {/* Workflow guide */}
          {!ingestResult.error && ingestResult.total_clusters > 0 && (
            <div style={{
              borderTop: '1px solid var(--color-border)',
              padding: 'var(--space-xs) var(--space-sm)',
            }}>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)', fontWeight: 'var(--weight-semibold)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                What next
              </div>
              {[
                ['1', 'Open Clusters tab', 'Review open clusters by severity — critical/high first.'],
                ['2', '+ Generate Candidate', 'For each cluster you understand, generate a rule candidate.'],
                ['3', 'Eval', 'Run sandbox evaluation against the Gold Set (safe / risky / blocked).'],
                ['4', 'Accept or dismiss', '"Auto-accept if safe" skips review. Risky candidates need manual accept. Dismiss false positives.'],
                ['5', 'Apply to Engine', 'For confidence_mismatch candidates: click Apply to Engine to write the recalibration.'],
              ].map(([num, title, desc]) => (
                <div key={num} style={{ display: 'flex', gap: 8, marginBottom: 4, alignItems: 'flex-start' }}>
                  <span style={{
                    flexShrink: 0, width: 16, height: 16, borderRadius: '50%', lineHeight: '16px',
                    textAlign: 'center', fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-bold)',
                    background: 'var(--color-surface-elevated)', color: 'var(--color-text-secondary)',
                    border: '1px solid var(--color-border)',
                  }}>{num}</span>
                  <div style={{ fontSize: 'var(--text-xs)', lineHeight: 1.5 }}>
                    <span style={{ color: 'var(--color-text)', fontWeight: 'var(--weight-semibold)' }}>{title}</span>
                    <span style={{ color: 'var(--color-text-dim)', marginLeft: 4 }}>{desc}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Priority cluster drill-down ── */}
      {ops.top_clusters?.length > 0 && (
        <div style={{ marginTop: 'var(--space-lg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-sm)' }}>
            <SectionTitle style={{ margin: 0 }}>
              {ops.critical_clusters > 0 ? '🔴 Critical Clusters — Action Required' : 'Priority Clusters'}
            </SectionTitle>
            <button
              className="btn btn--ghost btn--sm"
              style={{ fontSize: 'var(--text-xs)', color: C.red, borderColor: C.redBorder }}
              onClick={() => onGoToClusters({ status: 'open', severity: ops.critical_clusters > 0 ? 'critical' : undefined })}
            >
              View All {ops.critical_clusters > 0 ? 'Critical' : 'Open'} →
            </button>
          </div>
          {ops.top_clusters.map((c, idx) => {
            const sColor = SEVERITY_COLOR[c.severity] || 'var(--color-text-dim)';
            const isCritical = c.severity === 'critical' || c.severity === 'high';
            return (
              <div key={c.id} style={{
                borderRadius: 'var(--radius-md)',
                border: `1px solid ${isCritical ? sColor + '55' : 'var(--color-border)'}`,
                background: isCritical
                  ? `color-mix(in srgb, ${sColor} 6%, var(--color-surface-elevated))`
                  : 'var(--color-surface-elevated)',
                padding: 'var(--space-sm)',
                marginBottom: 'var(--space-xs)',
              }}>
                {/* Header row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', flexWrap: 'wrap', marginBottom: 4 }}>
                  <Badge label={c.severity} color={sColor} />
                  <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text)' }}>
                    {c.failure_mode?.replace(/_/g, ' ')}
                  </span>
                  {c.pattern_id && (
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-accent)', background: 'var(--color-surface)', padding: '1px 6px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                      {c.pattern_id}
                    </span>
                  )}
                  <span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)' }}>
                    {c.frequency} session{c.frequency !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Status + action row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', flexWrap: 'wrap' }}>
                  {c.candidate_id ? (
                    <span style={{ fontSize: 'var(--text-xs)', color: C.green }}>✓ Candidate generated</span>
                  ) : (
                    <span style={{ fontSize: 'var(--text-xs)', color: C.red, fontStyle: 'italic' }}>
                      No candidate yet
                    </span>
                  )}
                  <button
                    className="btn btn--ghost btn--sm"
                    style={{ fontSize: 'var(--text-xs)', color: sColor, borderColor: sColor + '44', marginLeft: 'auto' }}
                    onClick={() => onGoToClusters({ status: c.status || 'open', severity: c.severity, clusterId: c.id })}
                  >
                    Open in Clusters →
                  </button>
                </div>

                {/* What to do */}
                {!c.candidate_id && isCritical && (
                  <div style={{
                    marginTop: 6, padding: '4px 8px', borderRadius: 'var(--radius-sm)',
                    background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)',
                    fontSize: 'var(--text-xs)', color: C.red, lineHeight: 1.5,
                  }}>
                    Action: Go to Clusters → select this cluster → <strong>+ Generate Candidate</strong> → Eval → accept or dismiss
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Active monitoring alerts ── */}
      {ops.alerts?.length > 0 && (
        <div style={{ marginTop: 'var(--space-md)' }}>
          <SectionTitle>⚠ Active Monitoring Alerts</SectionTitle>
          {ops.alerts.map(a => (
            <div key={a.id} style={{
              display: 'flex', alignItems: 'center', gap: 'var(--space-sm)',
              padding: 'var(--space-xs) var(--space-sm)',
              borderRadius: 'var(--radius-sm)',
              background: 'color-mix(in srgb, #F87171 6%, var(--color-surface-elevated))',
              border: '1px solid #F8717133',
              marginBottom: 'var(--space-xs)',
            }}>
              <Badge label={a.alert_type?.replace(/_/g, ' ')} color={ALERT_COLOR[a.alert_type] || C.amber} />
              <div style={{ flex: 1, fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                {a.window_days}d window
                {a.success_rate_delta != null && <span> · match Δ <strong>{a.success_rate_delta}</strong></span>}
                {a.conversion_delta   != null && <span> · cvr Δ <strong>{a.conversion_delta}</strong></span>}
              </div>
            </div>
          ))}
          <button
            className="btn btn--ghost btn--sm"
            style={{ fontSize: 'var(--text-xs)', color: C.amber, borderColor: '#FBBF2444', marginTop: 4 }}
            onClick={() => onGoToClusters({ status: 'open' })}
          >
            Review in Monitoring tab →
          </button>
        </div>
      )}
    </div>
  );
}

// ── Cluster Evidence Breakdown ───────────────────────────────────────────────

/** Stat tile for evidence metrics */
function EvidStat({ label, value, sub, color }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 2,
      padding: '7px 12px',
      background: color ? `color-mix(in srgb, ${color} 8%, var(--color-surface))` : 'var(--color-surface)',
      border: `0.5px solid ${color ? color + '33' : 'var(--color-border)'}`,
      borderRadius: 10, minWidth: 0, flex: '1 0 auto',
    }}>
      <span style={{ fontSize: 18, fontWeight: 800, color: color ?? 'var(--color-text)', lineHeight: 1, fontFamily: 'var(--font-mono, monospace)' }}>{value ?? '—'}</span>
      <span style={{ fontSize: 9, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{label}</span>
      {sub != null && <span style={{ fontSize: 10, color: color ?? 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>{sub}</span>}
    </div>
  );
}

/**
 * Smart evidence breakdown — parses known field sets and renders structured UI.
 * Falls back to a key-value table for unknown field shapes.
 */
function EvidenceBreakdown({ evidence, failureMode }) {
  if (!evidence) return null;

  const { description, analysis_count, upgrade_count, conversion_rate_pct,
          threshold_used, confidence_error, avg_predicted, avg_expected,
          session_count, avg_confidence, dominant_issue, ...rest } = evidence;

  // ── CVR / conversion evidence ──
  const hasCvr = analysis_count != null && conversion_rate_pct != null && threshold_used != null;
  // ── Confidence mismatch evidence ──
  const hasConf = confidence_error != null || avg_predicted != null;

  const cvrColor = hasCvr
    ? (conversion_rate_pct >= threshold_used ? C.green : C.red)
    : null;

  return (
    <div>
      {/* ── CVR breakdown ── */}
      {hasCvr && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8, overflowX: 'auto' }}>
            <EvidStat label="Analyses" value={analysis_count} />
            <EvidStat label="Upgrades" value={upgrade_count ?? 0} />
            <EvidStat
              label="CVR"
              value={`${Number(conversion_rate_pct).toFixed(1)}%`}
              sub={`threshold ${Number(threshold_used).toFixed(1)}%`}
              color={cvrColor}
            />
            {session_count != null && <EvidStat label="Sessions" value={session_count} />}
          </div>

          {/* CVR vs threshold bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)', width: 28, textAlign: 'right', flexShrink: 0 }}>CVR</span>
            <div style={{ flex: 1, height: 7, background: 'var(--color-border)', borderRadius: 4, overflow: 'visible', position: 'relative' }}>
              {/* Threshold marker */}
              <div style={{
                position: 'absolute', top: -3, bottom: -3,
                left: `${Math.min(threshold_used * 10, 100)}%`,
                width: 2, background: C.amber, borderRadius: 1,
                zIndex: 1,
              }} title={`Threshold: ${threshold_used}%`} />
              {/* CVR fill */}
              <div style={{
                width: `${Math.min(conversion_rate_pct * 10, 100)}%`,
                height: '100%', background: cvrColor, borderRadius: 4,
                transition: 'width 0.4s',
                minWidth: conversion_rate_pct > 0 ? 3 : 0,
              }} />
            </div>
            <span style={{ fontSize: 'var(--text-xs)', color: cvrColor, minWidth: 38, textAlign: 'right', fontWeight: 700 }}>
              {Number(conversion_rate_pct).toFixed(1)}% / {Number(threshold_used).toFixed(1)}%
            </span>
          </div>

          <div style={{ marginTop: 6, fontSize: 'var(--text-xs)', color: cvrColor }}>
            {conversion_rate_pct >= threshold_used
              ? '✓ CVR meets threshold'
              : `✗ ${(threshold_used - conversion_rate_pct).toFixed(1)}pp below threshold — not enough upgrades to justify pattern promotion`}
          </div>
        </div>
      )}

      {/* ── Confidence mismatch breakdown ── */}
      {hasConf && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 6, overflowX: 'auto' }}>
            {confidence_error   != null && <EvidStat label="Conf error"   value={Number(confidence_error).toFixed(3)}   color={C.red} />}
            {avg_predicted      != null && <EvidStat label="Avg predicted" value={Number(avg_predicted).toFixed(2)} />}
            {avg_expected       != null && <EvidStat label="Avg expected"  value={Number(avg_expected).toFixed(2)} />}
            {avg_confidence     != null && <EvidStat label="Avg confidence" value={`${(avg_confidence * 100).toFixed(0)}%`} />}
          </div>
        </div>
      )}

      {/* ── Dominant issue tag ── */}
      {dominant_issue && (
        <div style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)' }}>Dominant issue: </span>
          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: C.amber }}>
            {String(dominant_issue).replace(/_/g, ' ')}
          </span>
        </div>
      )}

      {/* ── Remaining unknown fields (not already shown above) ── */}
      {Object.keys(rest).filter(k => !['samples', 'session_ids'].includes(k)).length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 8 }}>
          {Object.entries(rest)
            .filter(([k]) => !['samples', 'session_ids'].includes(k))
            .map(([k, v]) => (
              <div key={k} style={{ display: 'flex', gap: 10, padding: '3px 0', borderBottom: '1px solid var(--color-border)', fontSize: 'var(--text-xs)' }}>
                <span style={{ color: 'var(--color-text-dim)', minWidth: 130, flexShrink: 0, textTransform: 'capitalize' }}>
                  {k.replace(/_/g, ' ')}
                </span>
                <span style={{ color: 'var(--color-text)', wordBreak: 'break-word', fontFamily: typeof v === 'number' ? 'var(--font-mono)' : undefined }}>
                  {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                </span>
              </div>
            ))}
        </div>
      )}

      {/* ── Sample session IDs ── */}
      {evidence.session_ids?.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 9, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Sample Session IDs</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {evidence.session_ids.slice(0, 8).map(sid => (
              <code key={sid} style={{ fontSize: 9, padding: '1px 5px', background: 'var(--color-surface-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', color: 'var(--color-text-dim)' }}>
                {String(sid).slice(0, 12)}…
              </code>
            ))}
            {evidence.session_ids.length > 8 && (
              <span style={{ fontSize: 9, color: 'var(--color-text-dim)' }}>+{evidence.session_ids.length - 8} more</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Clusters Panel ──────────────────────────────────────────────────────────

function ClustersPanel({ initialStatus = 'open', initialSeverity = null, initialClusterId = null, initialPatternFilter = null, onPatternFilterConsumed }) {
  const [clusters,        setClusters]        = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [filter,          setFilter]          = useState(initialStatus);
  const [severityFilter,  setSeverityFilter]  = useState(initialSeverity);
  const [patternFilter,   setPatternFilter]   = useState(initialPatternFilter);
  const [working,         setWorking]         = useState({});
  const [expanded,        setExpanded]        = useState(null);
  const [notice,          setNotice]          = useState(null); // { type: 'success'|'error', msg }
  const [dismissConfirm,  setDismissConfirm]  = useState(null); // clusterId pending dismiss
  const [autoRelease,     setAutoRelease]     = useState(false); // auto-accept on safe eval
  const [verdicts,        setVerdicts]        = useState({});   // candidateId → 'safe'|'risky'|'blocked'
  const [selectedIds,     setSelectedIds]     = useState(new Set()); // selected cluster IDs
  const [bulkWorking,     setBulkWorking]     = useState(false);
  const clusterRefs = useRef({});
  const [editingCandidateId, setEditingCandidateId] = useState(null);
  const [editFields,         setEditFields]         = useState({ title: '', description: '', rationale: '' });
  const [editJson,           setEditJson]           = useState('{}');
  const [jsonError,          setJsonError]          = useState(null);
  const [editSaving,         setEditSaving]         = useState(false);
  const [editLoading,        setEditLoading]        = useState(false);
  const [rawMode,            setRawMode]            = useState(false);
  const [kvPairs,            setKvPairs]            = useState([]);  // [{key, val}]

  function showNotice(type, msg) {
    setNotice({ type, msg });
    setTimeout(() => setNotice(null), 5000);
  }

  // Consume pattern filter from nav request
  useEffect(() => {
    if (initialPatternFilter) {
      setPatternFilter(initialPatternFilter);
      onPatternFilterConsumed?.();
    }
  }, [initialPatternFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listFailureClusters({ status: filter || undefined, severity: severityFilter || undefined });
      const clusterList = Array.isArray(data) ? data : [];
      setClusters(clusterList);

      // Pre-fetch latest verdict for every linked candidate
      const candidateIds = [...new Set(clusterList.map(c => c.candidate_id).filter(Boolean))];
      const verdictMap = {};
      await Promise.allSettled(
        candidateIds.map(async (cid) => {
          try {
            const result = await getCandidateEvaluations(cid);
            const evals = result?.evaluations ?? (Array.isArray(result) ? result : []);
            if (evals.length > 0) verdictMap[cid] = evals[0].verdict;
          } catch { /* ignore — candidate may have no evals yet */ }
        })
      );
      setVerdicts(v => ({ ...v, ...verdictMap }));
    } catch {
      setClusters([]);
    } finally {
      setLoading(false);
    }
  }, [filter, severityFilter]);

  useEffect(() => { load(); setSelectedIds(new Set()); }, [load]);

  // Auto-expand and scroll to a specific cluster when navigated from Overview
  useEffect(() => {
    if (!initialClusterId || loading || clusters.length === 0) return;
    const exists = clusters.some(c => c.id === initialClusterId);
    if (!exists) return;
    setExpanded(initialClusterId);
    // Small delay to let render settle before scrolling
    const t = setTimeout(() => {
      const el = clusterRefs.current[initialClusterId];
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
    return () => clearTimeout(t);
  }, [initialClusterId, loading, clusters]);

  async function handleGenerateCandidate(clusterId) {
    setWorking(w => ({ ...w, [clusterId]: 'generating' }));
    try {
      const result = await generateCandidateFromCluster(clusterId);
      await load();
      if (result?.candidate) {
        showNotice('success', `Candidate created: ${result.candidate.id.slice(0, 8)}… — "${result.candidate.title}"`);
      }
    } catch (err) {
      showNotice('error', `Failed: ${err.message}`);
    } finally {
      setWorking(w => ({ ...w, [clusterId]: null }));
    }
  }

  async function handleDismissConfirmed(clusterId) {
    setDismissConfirm(null);
    setWorking(w => ({ ...w, [clusterId]: 'dismissing' }));
    try {
      await updateClusterStatus(clusterId, 'dismissed');
      await load();
    } catch (err) {
      showNotice('error', `Dismiss failed: ${err.message}`);
    } finally {
      setWorking(w => ({ ...w, [clusterId]: null }));
    }
  }

  async function handleApplyCandidate(candidateId) {
    setWorking(w => ({ ...w, [candidateId]: 'applying' }));
    try {
      const r = await applyCandidate(candidateId, 'Applied from Lab UI');
      const result = await r.json();
      if (!r.ok) throw new Error(result.detail || 'Apply failed');
      showNotice('success', `Applied: ${result.message}`);
      await load();
    } catch (err) {
      showNotice('error', `Apply failed: ${err.message}`);
    } finally {
      setWorking(w => ({ ...w, [candidateId]: null }));
    }
  }

  async function handleEvalCandidate(candidateId) {
    setWorking(w => ({ ...w, [candidateId]: 'evaluating' }));
    try {
      const result = await evaluateCandidate(candidateId, { autoReleaseOnSafe: autoRelease });
      const verdict  = result.verdict;
      const newStatus = result.new_status || 'review_ready';
      const color = verdict === 'safe' ? 'success' : verdict === 'blocked' ? 'error' : 'success';
      const statusLabel = newStatus === 'accepted' ? ' → auto-accepted' : ` → ${newStatus}`;
      showNotice(color, `Eval: ${verdict}${statusLabel}`);
      // Persist verdict badge immediately — don't wait for full reload
      setVerdicts(v => ({ ...v, [candidateId]: verdict }));
      await load();
    } catch (err) {
      showNotice('error', `Eval failed: ${err.message}`);
    } finally {
      setWorking(w => ({ ...w, [candidateId]: null }));
    }
  }

  // ── Selection helpers ──────────────────────────────────────────────────────
  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(clusters.map(c => c.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  // ── Bulk actions ───────────────────────────────────────────────────────────
  async function handleBulkGenerateCandidates() {
    const targets = clusters.filter(c => selectedIds.has(c.id) && !c.candidate_id && c.status === 'open');
    if (!targets.length) return;
    setBulkWorking(true);
    let ok = 0, fail = 0;
    await Promise.allSettled(targets.map(async c => {
      try { await generateCandidateFromCluster(c.id); ok++; }
      catch { fail++; }
    }));
    await load();
    clearSelection();
    setBulkWorking(false);
    showNotice('success', `Generated ${ok} candidate${ok !== 1 ? 's' : ''}${fail ? ` (${fail} failed)` : ''}`);
  }

  async function handleBulkMarkInvestigating() {
    const targets = clusters.filter(c => selectedIds.has(c.id) && c.status === 'open');
    if (!targets.length) return;
    setBulkWorking(true);
    await Promise.allSettled(targets.map(c => updateClusterStatus(c.id, 'investigating').catch(() => {})));
    await load();
    clearSelection();
    setBulkWorking(false);
    showNotice('success', `Marked ${targets.length} cluster${targets.length !== 1 ? 's' : ''} as investigating`);
  }

  async function handleBulkDismiss() {
    const targets = clusters.filter(c => selectedIds.has(c.id) && c.status === 'open');
    if (!targets.length) return;
    setBulkWorking(true);
    await Promise.allSettled(targets.map(c => updateClusterStatus(c.id, 'dismissed').catch(() => {})));
    await load();
    clearSelection();
    setBulkWorking(false);
    showNotice('success', `Dismissed ${targets.length} cluster${targets.length !== 1 ? 's' : ''}`);
  }

  async function handleBulkEvalCandidates() {
    const targets = clusters.filter(c => selectedIds.has(c.id) && c.candidate_id);
    if (!targets.length) return;
    setBulkWorking(true);
    let ok = 0, fail = 0;
    await Promise.allSettled(targets.map(async c => {
      try {
        const result = await evaluateCandidate(c.candidate_id, { autoReleaseOnSafe: autoRelease });
        setVerdicts(v => ({ ...v, [c.candidate_id]: result.verdict }));
        ok++;
      } catch { fail++; }
    }));
    await load();
    clearSelection();
    setBulkWorking(false);
    showNotice('success', `Evaluated ${ok} candidate${ok !== 1 ? 's' : ''}${fail ? ` (${fail} failed)` : ''}`);
  }

  function jsonToKvPairs(obj) {
    return Object.entries(obj).map(([key, val]) => ({
      key,
      val: typeof val === 'string' ? val : JSON.stringify(val),
    }));
  }

  function kvPairsToObj(pairs) {
    const obj = {};
    for (const { key, val } of pairs) {
      if (!key.trim()) continue;
      try { obj[key.trim()] = JSON.parse(val); }
      catch { obj[key.trim()] = val; }
    }
    return obj;
  }

  async function handleEditOpen(candidateId) {
    if (editingCandidateId === candidateId) {
      setEditingCandidateId(null);
      return;
    }
    setEditLoading(true);
    setEditingCandidateId(candidateId);
    setJsonError(null);
    setRawMode(false);
    try {
      const data = await getCandidate(candidateId);
      const change = data.proposed_change ?? {};
      setEditFields({ title: data.title || '', description: data.description || '', rationale: data.rationale || '' });
      setEditJson(JSON.stringify(change, null, 2));
      setKvPairs(jsonToKvPairs(change));
    } catch (err) {
      showNotice('error', `Could not load candidate: ${err.message}`);
      setEditingCandidateId(null);
    } finally {
      setEditLoading(false);
    }
  }

  function handleToggleRawMode() {
    if (!rawMode) {
      // entering raw — serialize current kvPairs
      setEditJson(JSON.stringify(kvPairsToObj(kvPairs), null, 2));
      setJsonError(null);
    } else {
      // leaving raw — parse editJson back to kvPairs
      try {
        setKvPairs(jsonToKvPairs(JSON.parse(editJson)));
        setJsonError(null);
      } catch {
        setJsonError('Fix JSON before switching to structured view');
        return;
      }
    }
    setRawMode(v => !v);
  }

  async function handleSaveCandidate(candidateId) {
    let parsed;
    if (rawMode) {
      try { parsed = JSON.parse(editJson); }
      catch { setJsonError('Invalid JSON — fix before saving'); return; }
    } else {
      parsed = kvPairsToObj(kvPairs);
    }
    setEditSaving(true);
    try {
      await updateCandidate(candidateId, { ...editFields, proposed_change: parsed });
      showNotice('success', 'Candidate saved');
      setEditingCandidateId(null);
      await load();
    } catch (err) {
      showNotice('error', `Save failed: ${err.message}`);
    } finally {
      setEditSaving(false);
    }
  }

  // Derived bulk capabilities from current selection
  const selectedList = clusters.filter(c => selectedIds.has(c.id));
  const bulkCanGenerate    = selectedList.some(c => !c.candidate_id && c.status === 'open');
  const bulkCanInvestigate = selectedList.some(c => c.status === 'open');
  const bulkCanDismiss     = selectedList.some(c => c.status === 'open');
  const bulkCanEval        = selectedList.some(c => !!c.candidate_id);

  const filters = ['open', 'investigating', 'resolved', 'dismissed', ''];
  const filterLabels = { '': 'All', open: 'Open', investigating: 'Investigating', resolved: 'Resolved', dismissed: 'Dismissed' };
  const severities = [null, 'critical', 'high', 'medium', 'low'];
  const severityLabels = { null: 'All Severity', critical: '🔴 Critical', high: '🟠 High', medium: '🟡 Medium', low: '⚪ Low' };

  return (
    <div>
      <PanelDesc text="Failure clusters grouped by pattern and error type. Each cluster summarizes repeated analysis failures from real user signals. Click any cluster to see symptoms and generate a targeted Candidate rule change." />

      {/* Status filters */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 6, overflowX: 'auto', alignItems: 'center' }}>
        {filters.map(f => (
          <button
            key={f || 'all'}
            className={`adb__range-btn${filter === f ? ' adb__range-btn--on' : ''}`}
            style={{ whiteSpace: 'nowrap' }}
            onClick={() => setFilter(f)}
            type="button"
          >
            {filterLabels[f]}
          </button>
        ))}
        <button className="adb__refresh" onClick={load} type="button" title="Refresh" style={{ flexShrink: 0 }}>↻</button>
      </div>

      {/* Severity filters */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto', alignItems: 'center' }}>
        {severities.map(s => (
          <button
            key={s ?? 'all'}
            className={`adb__range-btn${severityFilter === s ? ' adb__range-btn--on' : ''}`}
            style={{
              whiteSpace: 'nowrap',
              ...(s === 'critical' && severityFilter === 'critical' ? { background: C.red, borderColor: C.red, color: '#fff' }
                 : s === 'high'     && severityFilter === 'high'     ? { background: '#FB923C', borderColor: '#FB923C', color: '#fff' }
                 : s === 'critical' ? { borderColor: C.redBorder, color: C.red }
                 : s === 'high'     ? { borderColor: '#FB923C66', color: '#FB923C' }
                 : {}),
            }}
            onClick={() => setSeverityFilter(s)}
            type="button"
          >
            {severityLabels[s]}
          </button>
        ))}
        <label
          title="When enabled, candidates that evaluate as 'safe' are automatically accepted — no manual review step"
          style={{
            display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', marginLeft: 'auto',
            fontSize: 11, flexShrink: 0,
            color: autoRelease ? C.green : 'var(--color-text-secondary)',
            userSelect: 'none', whiteSpace: 'nowrap',
          }}
        >
          <input
            type="checkbox"
            checked={autoRelease}
            onChange={e => setAutoRelease(e.target.checked)}
            style={{ accentColor: C.green, cursor: 'pointer' }}
          />
          Auto-accept if safe
        </label>
      </div>

      {/* Inline notice (replaces alert/confirm) */}
      {notice && (
        <div style={{
          padding: 'var(--space-xs) var(--space-sm)',
          marginBottom: 'var(--space-sm)',
          borderRadius: 'var(--radius-md)',
          fontSize: 'var(--text-xs)',
          background: notice.type === 'success'
            ? 'color-mix(in srgb, #34D399 12%, transparent)'
            : 'color-mix(in srgb, #F87171 12%, transparent)',
          border: `1px solid ${notice.type === 'success' ? '#34D39944' : '#F8717144'}`,
          color: notice.type === 'success' ? C.green : C.red,
        }}>
          {notice.type === 'success' ? '✓ ' : '⚠ '}{notice.msg}
        </div>
      )}

      {/* Bulk selection bar */}
      {selectedIds.size > 0 && (
        <div className="lab-bulk-bar" style={{ marginBottom: 'var(--space-sm)' }}>
          <span className="lab-bulk-bar__count">{selectedIds.size} selected</span>
          <div className="lab-bulk-bar__actions">
            {bulkCanGenerate && (
              <button className="btn btn--primary btn--sm" onClick={handleBulkGenerateCandidates} disabled={bulkWorking}>
                {bulkWorking ? '…' : '+ Generate Candidates'}
              </button>
            )}
            {bulkCanInvestigate && (
              <button className="btn btn--ghost btn--sm" style={{ color: C.amber, borderColor: '#FBBF2444' }} onClick={handleBulkMarkInvestigating} disabled={bulkWorking}>
                🔍 Mark Investigating
              </button>
            )}
            {bulkCanEval && (
              <button className="btn btn--ghost btn--sm" style={{ color: C.blue, borderColor: '#4DA3FF44' }} onClick={handleBulkEvalCandidates} disabled={bulkWorking}>
                {bulkWorking ? 'Evaluating…' : '▶ Eval Candidates'}
              </button>
            )}
            {bulkCanDismiss && (
              <button className="btn btn--ghost btn--sm" style={{ color: C.red, borderColor: '#F8717144' }} onClick={handleBulkDismiss} disabled={bulkWorking}>
                Dismiss
              </button>
            )}
            <button className="btn btn--ghost btn--sm" style={{ marginLeft: 'auto' }} onClick={clearSelection}>✕</button>
          </div>
        </div>
      )}

      {/* Select all toggle */}
      {!loading && clusters.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', marginBottom: 'var(--space-xs)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
          <button
            className="btn btn--ghost btn--sm"
            style={{ fontSize: 'var(--text-xs)', padding: '2px 6px' }}
            onClick={selectedIds.size === clusters.length ? clearSelection : selectAll}
          >
            {selectedIds.size === clusters.length ? '☑ Deselect All' : '☐ Select All'}
          </button>
          {selectedIds.size > 0 && <span style={{ color: 'var(--color-text-dim)' }}>{selectedIds.size} / {clusters.length}</span>}
        </div>
      )}

      {/* Pattern filter pill — shown when navigated from Intelligence → per-pattern */}
      {patternFilter && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 'var(--space-sm)', flexWrap: 'wrap' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px',
            background: '#4DA3FF22', border: '1px solid #4DA3FF55',
            borderRadius: 999, fontSize: 'var(--text-xs)', color: C.blue,
          }}>
            Pattern: <strong>{patternFilter}</strong>
            <button
              type="button"
              onClick={() => setPatternFilter(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.blue, padding: 0, lineHeight: 1, fontSize: 12 }}
              title="Clear pattern filter"
            >✕</button>
          </span>
        </div>
      )}

      {loading && <div style={{ color: 'var(--color-text-dim)' }}>Loading…</div>}
      {!loading && clusters.length === 0 && (
        <div style={{ color: 'var(--color-text-dim)', fontSize: 'var(--text-sm)', padding: 'var(--space-lg) 0' }}>
          No clusters. Run ingestion to detect failure patterns.
        </div>
      )}

      {(patternFilter ? clusters.filter(c => c.pattern_id === patternFilter || c.pattern === patternFilter) : clusters).map(c => (
        <Card
          key={c.id}
          ref={el => { clusterRefs.current[c.id] = el; }}
          style={{
            ...(selectedIds.has(c.id) ? { borderColor: 'var(--color-accent)', background: 'color-mix(in srgb, var(--color-accent) 5%, var(--color-surface))' } : {}),
            ...(c.id === initialClusterId ? { outline: '2px solid #4DA3FF88', outlineOffset: 2 } : {}),
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, overflowX: 'auto' }}>
            {/* Row checkbox */}
            <input
              type="checkbox"
              checked={selectedIds.has(c.id)}
              onChange={() => toggleSelect(c.id)}
              onClick={e => e.stopPropagation()}
              style={{ marginTop: 0, flexShrink: 0, accentColor: '#c8a96e', cursor: 'pointer' }}
            />
            <Badge label={c.severity} color={SEVERITY_COLOR[c.severity] || 'var(--color-text-secondary)'} />
            <Badge label={c.failure_mode?.replace(/_/g, ' ')} color="var(--color-text-secondary)" />
            {c.pattern_id && <Badge label={c.pattern_id} color="#c8a96e" />}
            <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
              {c.frequency} sessions
            </div>
          </div>

          {/* Inline CVR / confidence metrics — shown directly on card (no expand needed) */}
          {c.evidence && (c.evidence.analysis_count != null || c.evidence.confidence_error != null) ? (
            <div style={{ marginBottom: 'var(--space-sm)' }}>
              <EvidenceBreakdown evidence={c.evidence} failureMode={c.failure_mode} />
            </div>
          ) : (
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-sm)', lineHeight: 1.5 }}>
              {c.evidence?.description || 'No description.'}
            </div>
          )}

          {c.candidate_id && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, overflowX: 'auto' }}>
              <div style={{ fontSize: 11, color: C.green, whiteSpace: 'nowrap' }}>
                ✓ Candidate: {c.candidate_id.slice(0, 8)}…
              </div>
              {verdicts[c.candidate_id] ? (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: 'var(--text-xs)', fontWeight: 700,
                  padding: '2px 8px', borderRadius: 'var(--radius-full)',
                  background: (VERDICT_COLOR[verdicts[c.candidate_id]] ?? 'var(--color-text-dim)') + '22',
                  color: VERDICT_COLOR[verdicts[c.candidate_id]] ?? 'var(--color-text-dim)',
                  border: `1px solid ${(VERDICT_COLOR[verdicts[c.candidate_id]] ?? 'var(--color-text-dim)')}44`,
                  textTransform: 'uppercase', letterSpacing: '0.04em',
                }}>
                  {verdicts[c.candidate_id] === 'safe' ? '✓' : verdicts[c.candidate_id] === 'blocked' ? '✕' : '⚠'}
                  {' '}{verdicts[c.candidate_id]}
                </span>
              ) : (
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)', fontStyle: 'italic' }}>
                  unevaluated
                </span>
              )}
              <button
                className="btn btn--ghost btn--sm"
                style={{ fontSize: 'var(--text-xs)', color: C.blue, borderColor: '#4DA3FF44' }}
                onClick={() => handleEvalCandidate(c.candidate_id)}
                disabled={!!working[c.candidate_id]}
                title={autoRelease
                  ? "Evaluate candidate — auto-accept if safe"
                  : "Evaluate candidate against Gold Set"}
              >
                {working[c.candidate_id] === 'evaluating'
                  ? 'Evaluating…'
                  : verdicts[c.candidate_id] ? '↺ Re-eval' : autoRelease ? '✓ Eval + auto-accept' : 'Eval'}
              </button>
              {c.failure_mode === 'confidence_mismatch' && (
                <button
                  className="btn btn--ghost btn--sm"
                  style={{ fontSize: 'var(--text-xs)', color: C.amber, borderColor: '#FBBF2444' }}
                  onClick={() => handleApplyCandidate(c.candidate_id)}
                  disabled={!!working[c.candidate_id]}
                  title="Apply confidence recalibration to engine (writes confidence_overrides.json)"
                >
                  {working[c.candidate_id] === 'applying' ? 'Applying…' : 'Apply to Engine'}
                </button>
              )}
              <button
                className="btn btn--ghost btn--sm"
                style={{
                  fontSize: 'var(--text-xs)',
                  color: editingCandidateId === c.candidate_id ? 'var(--color-text)' : 'var(--color-text-dim)',
                  borderColor: editingCandidateId === c.candidate_id ? 'var(--color-border)' : 'transparent',
                  marginLeft: 'auto',
                }}
                onClick={() => handleEditOpen(c.candidate_id)}
                title="Edit candidate fields and proposed_change JSON"
              >
                {editingCandidateId === c.candidate_id ? '✕ Close' : '✎ Edit'}
              </button>
            </div>
          )}

          {c.candidate_id && editingCandidateId === c.candidate_id && (
            <div style={{
              marginTop: 8, padding: '12px 14px',
              background: 'var(--color-surface-elevated)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
            }}>
              {editLoading ? (
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)' }}>Loading…</div>
              ) : (
                <>
                  <div style={{ display: 'grid', gap: 10, marginBottom: 10 }}>
                    <label style={{ display: 'grid', gap: 3, fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                      Title
                      <input
                        value={editFields.title}
                        onChange={e => setEditFields(f => ({ ...f, title: e.target.value }))}
                        style={{
                          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                          borderRadius: 'var(--radius-sm)', padding: '4px 8px',
                          fontSize: 'var(--text-sm)', color: 'var(--color-text)',
                          outline: 'none', width: '100%', boxSizing: 'border-box',
                        }}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: 3, fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                      Description
                      <textarea
                        rows={2}
                        value={editFields.description}
                        onChange={e => setEditFields(f => ({ ...f, description: e.target.value }))}
                        style={{
                          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                          borderRadius: 'var(--radius-sm)', padding: '4px 8px',
                          fontSize: 'var(--text-sm)', color: 'var(--color-text)',
                          outline: 'none', width: '100%', boxSizing: 'border-box', resize: 'vertical',
                        }}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: 3, fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                      Rationale
                      <textarea
                        rows={2}
                        value={editFields.rationale}
                        onChange={e => setEditFields(f => ({ ...f, rationale: e.target.value }))}
                        style={{
                          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                          borderRadius: 'var(--radius-sm)', padding: '4px 8px',
                          fontSize: 'var(--text-sm)', color: 'var(--color-text)',
                          outline: 'none', width: '100%', boxSizing: 'border-box', resize: 'vertical',
                        }}
                      />
                    </label>
                    {/* proposed_change editor — structured KV or raw JSON */}
                    <div style={{ display: 'grid', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                          proposed_change
                        </span>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={handleToggleRawMode}
                          style={{ fontSize: 10, padding: '1px 7px', color: rawMode ? C.amber : 'var(--color-text-dim)', borderColor: rawMode ? '#FBBF2444' : 'transparent' }}
                          title={rawMode ? 'Switch to structured field editor' : 'Switch to raw JSON editor'}
                        >
                          {rawMode ? '⊞ Structured' : '{ } Raw'}
                        </button>
                      </div>

                      {rawMode ? (
                        /* ── Raw JSON textarea ── */
                        <>
                          <textarea
                            rows={10}
                            value={editJson}
                            onChange={e => { setEditJson(e.target.value); setJsonError(null); }}
                            onBlur={() => {
                              try {
                                setEditJson(JSON.stringify(JSON.parse(editJson), null, 2));
                                setJsonError(null);
                              } catch {
                                setJsonError('Invalid JSON');
                              }
                            }}
                            spellCheck={false}
                            style={{
                              background: 'var(--color-surface)',
                              border: `1px solid ${jsonError ? C.red : 'var(--color-border)'}`,
                              borderRadius: 'var(--radius-sm)', padding: '6px 8px',
                              fontFamily: 'var(--font-mono, "Fira Mono", monospace)',
                              fontSize: 11, color: 'var(--color-text)',
                              outline: 'none', width: '100%', boxSizing: 'border-box',
                              resize: 'vertical', lineHeight: 1.6,
                            }}
                          />
                          {jsonError && (
                            <div style={{ fontSize: 'var(--text-xs)', color: C.red }}>{jsonError}</div>
                          )}
                        </>
                      ) : (
                        /* ── Structured KV editor ── */
                        <>
                          <div style={{ display: 'grid', gap: 4 }}>
                            {kvPairs.map((pair, i) => (
                              <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                <input
                                  value={pair.key}
                                  onChange={e => setKvPairs(p => p.map((r, j) => j === i ? { ...r, key: e.target.value } : r))}
                                  placeholder="field"
                                  style={{
                                    background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                                    borderRadius: 'var(--radius-sm)', padding: '3px 7px',
                                    fontFamily: 'var(--font-mono, monospace)', fontSize: 11,
                                    color: C.blue, outline: 'none',
                                    width: 130, flexShrink: 0, boxSizing: 'border-box',
                                  }}
                                />
                                <input
                                  value={pair.val}
                                  onChange={e => setKvPairs(p => p.map((r, j) => j === i ? { ...r, val: e.target.value } : r))}
                                  placeholder="value"
                                  style={{
                                    background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                                    borderRadius: 'var(--radius-sm)', padding: '3px 7px',
                                    fontFamily: 'var(--font-mono, monospace)', fontSize: 11,
                                    color: 'var(--color-text)', outline: 'none',
                                    flex: 1, boxSizing: 'border-box',
                                  }}
                                />
                                <button
                                  type="button"
                                  onClick={() => setKvPairs(p => p.filter((_, j) => j !== i))}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.red, fontSize: 13, padding: '0 4px', flexShrink: 0, lineHeight: 1 }}
                                  title="Remove field"
                                >✕</button>
                              </div>
                            ))}
                            <button
                              type="button"
                              className="btn btn--ghost btn--sm"
                              onClick={() => setKvPairs(p => [...p, { key: '', val: '' }])}
                              style={{ fontSize: 'var(--text-xs)', color: C.blue, borderColor: '#4DA3FF44', alignSelf: 'flex-start', marginTop: 2 }}
                            >+ Add field</button>
                          </div>

                          {/* Live JSON preview */}
                          <div>
                            <div style={{ fontSize: 9, color: 'var(--color-text-dim)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                              JSON preview
                            </div>
                            <pre style={{
                              background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                              borderRadius: 'var(--radius-sm)', padding: '6px 8px',
                              fontFamily: 'var(--font-mono, monospace)', fontSize: 10,
                              color: 'var(--color-text-secondary)', margin: 0,
                              maxHeight: 110, overflowY: 'auto', overflowX: 'auto', lineHeight: 1.5,
                            }}>
                              {JSON.stringify(kvPairsToObj(kvPairs), null, 2)}
                            </pre>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      className="btn btn--primary btn--sm"
                      onClick={() => handleSaveCandidate(c.candidate_id)}
                      disabled={editSaving || !!jsonError}
                    >
                      {editSaving ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      className="btn btn--ghost btn--sm"
                      onClick={() => setEditingCandidateId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Inline dismiss confirmation */}
          {dismissConfirm === c.id ? (
            <div style={{ display: 'flex', gap: 'var(--space-xs)', alignItems: 'center', marginBottom: 'var(--space-xs)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
              <span>Dismiss this cluster?</span>
              <button className="btn btn--ghost btn--sm" style={{ color: C.red }} onClick={() => handleDismissConfirmed(c.id)}>Yes, dismiss</button>
              <button className="btn btn--ghost btn--sm" onClick={() => setDismissConfirm(null)}>Cancel</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', whiteSpace: 'nowrap' }}>
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => setExpanded(expanded === c.id ? null : c.id)}
              >
                {expanded === c.id ? 'Hide' : 'Evidence'}
              </button>
              {!c.candidate_id && c.status === 'open' && (
                <button
                  className="btn btn--primary btn--sm"
                  onClick={() => handleGenerateCandidate(c.id)}
                  disabled={!!working[c.id]}
                >
                  {working[c.id] === 'generating' ? '…' : '+ Generate Candidate'}
                </button>
              )}
              {c.status === 'open' && (
                <button
                  className="btn btn--ghost btn--sm"
                  style={{ color: 'var(--color-text-dim)' }}
                  onClick={() => setDismissConfirm(c.id)}
                  disabled={!!working[c.id]}
                >
                  Dismiss
                </button>
              )}
            </div>
          )}

          {expanded === c.id && c.evidence && (
            <div style={{ marginTop: 'var(--space-sm)', borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-sm)' }}>
              {/* Description note (shown here if not already shown as metrics above) */}
              {c.evidence.description && (c.evidence.analysis_count == null && c.evidence.confidence_error == null) && (
                <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.6, marginBottom: 8 }}>
                  {c.evidence.description}
                </p>
              )}

              {/* Full evidence breakdown — reuses EvidenceBreakdown; shows all remaining fields */}
              <EvidenceBreakdown evidence={c.evidence} failureMode={c.failure_mode} />

              {/* Cluster metadata */}
              <div style={{ display: 'flex', gap: 16, marginTop: 8, flexWrap: 'wrap' }}>
                {c.created_at && (
                  <span style={{ fontSize: 9, color: 'var(--color-text-dim)' }}>
                    Created: {new Date(c.created_at * 1000).toLocaleDateString(undefined, { timeZone: _TZ })}
                  </span>
                )}
                {c.updated_at && (
                  <span style={{ fontSize: 9, color: 'var(--color-text-dim)' }}>
                    Updated: {new Date(c.updated_at * 1000).toLocaleDateString(undefined, { timeZone: _TZ })}
                  </span>
                )}
                <span style={{ fontSize: 9, color: 'var(--color-text-dim)', fontFamily: 'var(--font-mono)' }}>
                  id: {c.id?.slice(0, 16)}…
                </span>
              </div>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

// ── Monitoring Panel ────────────────────────────────────────────────────────

// ── Helpers scoped to MonitoringPanel ─────────────────────────────────────

function daysLive(releaseDate) {
  if (!releaseDate) return null;
  return Math.floor((Date.now() / 1000 - releaseDate) / 86400);
}

function daysUntilWindow(releaseDate, windowDays) {
  if (!releaseDate) return null;
  const elapsed = (Date.now() / 1000 - releaseDate) / 86400;
  const remaining = windowDays - elapsed;
  return remaining > 0 ? Math.ceil(remaining) : 0;
}

function fmtDelta(val, unit = 'pp') {
  if (val == null) return '—';
  const sign = val > 0 ? '+' : '';
  return `${sign}${val}${unit}`;
}

function deltaColor(val, neutral = 0) {
  if (val == null) return 'var(--color-text-dim)';
  if (val > neutral) return C.green;
  if (val < neutral) return C.red;
  return C.amber;
}

const ALERT_LABELS = {
  rollback_review:      { label: 'Rollback Review', color: C.red,   bg: C.redBg },
  candidate_regression: { label: 'Regression',      color: C.amber, bg: C.amberBg },
  nominal:              { label: 'Nominal',          color: C.green, bg: C.greenBg },
};

function alertMeta(status) {
  return ALERT_LABELS[status] || ALERT_LABELS.nominal;
}

// Per-card detail panel loaded lazily on expand
function MonitoringDetail({ attributionId }) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true); setErr(null);
    getMonitoringReport(attributionId)
      .then(r => { if (active) setReport(r); })
      .catch(e => { if (active) setErr(e.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attributionId]);

  if (loading) return (
    <div style={{ padding: 'var(--space-sm) 0', color: 'var(--color-text-dim)', fontSize: 'var(--text-xs)' }}>
      Loading detail…
    </div>
  );
  if (err) return (
    <div style={{ padding: 'var(--space-sm) 0', color: C.red, fontSize: 'var(--text-xs)' }}>
      {err}
    </div>
  );
  if (!report) return null;

  const { snapshots = [], expected_lift = {}, windows_pending = [] } = report;

  // Alert threshold explanation
  const thresholdNote = {
    rollback_review:      'CVR Δ ≤ −3pp, or lift Δ ≤ −15pp, or match rate Δ ≤ −10pp',
    candidate_regression: 'Match rate Δ ≤ −5pp',
    nominal:              'All metrics within healthy thresholds',
  }[report.alert_status] || '';

  return (
    <div style={{ marginTop: 'var(--space-sm)' }}>

      {/* Alert explanation */}
      {report.alert_status !== 'nominal' && (
        <div style={{
          marginBottom: 'var(--space-sm)',
          padding: 'var(--space-xs) var(--space-sm)',
          borderRadius: 'var(--radius-sm)',
          background: alertMeta(report.alert_status).bg,
          border: `1px solid ${alertMeta(report.alert_status).color}44`,
          fontSize: 'var(--text-xs)',
          color: alertMeta(report.alert_status).color,
        }}>
          <strong>{alertMeta(report.alert_status).label}:</strong> {thresholdNote}
        </div>
      )}

      {/* Expected lift baseline */}
      {(expected_lift.match_rate_pct != null || expected_lift.conversion_rate_pct != null) && (
        <div style={{
          marginBottom: 'var(--space-sm)',
          padding: 'var(--space-xs) var(--space-sm)',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          fontSize: 'var(--text-xs)',
          display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap',
        }}>
          <div style={{ color: 'var(--color-text-secondary)' }}>
            Pre-release baseline:
          </div>
          {expected_lift.match_rate_pct != null && (
            <div>
              <span style={{ color: 'var(--color-text-dim)' }}>Match rate </span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text)' }}>
                {expected_lift.match_rate_pct}%
              </span>
            </div>
          )}
          {expected_lift.conversion_rate_pct != null && (
            <div>
              <span style={{ color: 'var(--color-text-dim)' }}>CVR </span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text)' }}>
                {expected_lift.conversion_rate_pct}%
              </span>
            </div>
          )}
          {expected_lift.lift_pct != null && (
            <div>
              <span style={{ color: 'var(--color-text-dim)' }}>Lift </span>
              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text)' }}>
                {expected_lift.lift_pct}%
              </span>
            </div>
          )}
        </div>
      )}

      {/* Snapshot history table */}
      {snapshots.length > 0 ? (
        <div style={{ overflowX: 'auto', marginBottom: 'var(--space-sm)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                {['Window', 'Match Δ', 'CVR Δ', 'Lift Δ', 'Alert', 'Measured'].map(h => (
                  <th key={h} style={{
                    padding: '4px 8px', textAlign: 'left',
                    color: 'var(--color-text-secondary)', fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {snapshots.map((snap, i) => {
                const meta = alertMeta(snap.alert_type || 'nominal');
                const measuredAt = snap.snapshot?.measured_at_iso || snap.created_at;
                return (
                  <tr key={i} style={{
                    borderBottom: '1px solid var(--color-border)',
                    background: snap.alert_type ? meta.bg : 'transparent',
                  }}>
                    <td style={{ padding: '5px 8px', fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--color-text)' }}>
                      {snap.window_days}d
                    </td>
                    <td style={{ padding: '5px 8px', fontFamily: 'var(--font-mono)', color: deltaColor(snap.success_rate_delta) }}>
                      {fmtDelta(snap.success_rate_delta)}
                    </td>
                    <td style={{ padding: '5px 8px', fontFamily: 'var(--font-mono)', color: deltaColor(snap.conversion_delta) }}>
                      {fmtDelta(snap.conversion_delta)}
                    </td>
                    <td style={{ padding: '5px 8px', fontFamily: 'var(--font-mono)', color: deltaColor(snap.trust_delta) }}>
                      {fmtDelta(snap.trust_delta)}
                    </td>
                    <td style={{ padding: '5px 8px', color: meta.color }}>
                      {snap.alert_type ? snap.alert_type.replace(/_/g, ' ') : '—'}
                    </td>
                    <td style={{ padding: '5px 8px', color: 'var(--color-text-dim)' }}>
                      {measuredAt
                        ? typeof measuredAt === 'string'
                          ? measuredAt.slice(0, 10)
                          : new Date(measuredAt * 1000).toLocaleDateString(undefined, { timeZone: _TZ })
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ color: 'var(--color-text-dim)', fontSize: 'var(--text-xs)', padding: '4px 0 8px' }}>
          No snapshots yet — run a sweep once the window has elapsed.
        </div>
      )}

      {/* Pending windows */}
      {windows_pending.length > 0 && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)', display: 'flex', gap: 'var(--space-xs)', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--color-text-secondary)', marginRight: 2 }}>Pending:</span>
          {windows_pending.map(w => {
            const daysLeft = daysUntilWindow(report.release_date, w);
            return (
              <span key={w} style={{
                fontFamily: 'var(--font-mono)',
                padding: '1px 6px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--color-surface-elevated)',
                border: '1px solid var(--color-border)',
              }}>
                {w}d {daysLeft != null && daysLeft > 0 ? `(${daysLeft}d away)` : '(eligible — sweep now)'}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MonitoringPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sweeping, setSweeping] = useState(null); // null | 7 | 14 | 30 | 'all'
  const [sweepResult, setSweepResult] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getMonitoringSummary();
      setData(result);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSweep(windowDays) {
    setSweeping(windowDays);
    setSweepResult(null);
    try {
      const result = await triggerMonitoringSweep(windowDays);
      setSweepResult({ ok: true, msg: `${windowDays}d sweep: ${result.snapshots_created ?? 0} snapshot(s), ${result.alerts?.length ?? 0} alert(s)` });
      await load();
    } catch (e) {
      setSweepResult({ ok: false, msg: e.message });
    } finally {
      setSweeping(null);
    }
  }

  async function handleSweepAll() {
    setSweeping('all');
    setSweepResult(null);
    try {
      const result = await triggerSweepAll();
      setSweepResult({ ok: true, msg: `All windows swept: ${result.total_snapshots ?? 0} snapshot(s), ${result.total_alerts ?? 0} alert(s)` });
      await load();
    } catch (e) {
      setSweepResult({ ok: false, msg: e.message });
    } finally {
      setSweeping(null);
    }
  }

  if (loading) return <div style={{ color: 'var(--color-text-dim)' }}>Loading…</div>;
  if (!data) return <div style={{ color: 'var(--color-text-dim)' }}>No monitoring data.</div>;

  const totalReleases = data.attributions?.length ?? 0;
  const activeAlerts = data.active_alerts ?? 0;
  const withSnapshots = data.attributions?.filter(a => a.windows_measured?.length > 0).length ?? 0;
  const pendingWindows = data.attributions?.reduce((acc, a) => acc + (3 - (a.windows_measured?.length ?? 0)), 0) ?? 0;

  return (
    <div>
      {/* Summary row */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-sm)',
        marginBottom: 'var(--space-md)',
        padding: 'var(--space-sm) var(--space-md)',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
      }}>
        {[
          { val: totalReleases,  label: 'releases tracked',   color: 'var(--color-text)' },
          { val: activeAlerts,   label: 'active alerts',      color: activeAlerts > 0 ? C.red : C.green },
          { val: withSnapshots,  label: 'with snapshots',     color: 'var(--color-text)' },
          { val: pendingWindows, label: 'windows pending',    color: pendingWindows > 0 ? C.amber : C.green },
        ].map(({ val, label, color }) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color, fontFamily: 'var(--font-mono)' }}>{val}</span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Alert summary banner */}
      {activeAlerts > 0 && (
        <div style={{
          background: C.redBg, border: `1px solid ${C.redBorder}`,
          borderRadius: 'var(--radius-md)', padding: 'var(--space-sm) var(--space-md)',
          marginBottom: 'var(--space-md)', color: C.red, fontSize: 'var(--text-sm)',
        }}>
          <div style={{ fontWeight: 600, marginBottom: data.alert_summary?.length > 0 ? 'var(--space-xs)' : 0 }}>
            ⚠ {activeAlerts} active alert{activeAlerts !== 1 ? 's' : ''} — run a sweep to collect updated snapshots
          </div>
          {data.alert_summary?.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {data.alert_summary.map((a, i) => {
                const meta = alertMeta(a.alert_type || a.status || 'nominal');
                return (
                  <div key={i} style={{ fontSize: 'var(--text-xs)', display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
                    <span style={{
                      padding: '1px 6px', borderRadius: 'var(--radius-sm)',
                      background: meta.bg, color: meta.color, fontWeight: 600,
                    }}>
                      {(a.alert_type || a.status || 'alert').replace(/_/g,' ')}
                    </span>
                    <span style={{ color: '#FCA5A5' }}>
                      {a.release_version || a.attribution_id?.slice(0,8) || 'Release'}
                      {a.window_days ? ` · ${a.window_days}d window` : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Sweep controls */}
      <div style={{ marginBottom: 'var(--space-md)' }}>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-xs)', fontWeight: 600 }}>
          Run Sweep Window
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-xs)', flexWrap: 'wrap' }}>
          {[7, 14, 30].map(w => (
            <button
              key={w}
              className="btn btn--ghost btn--sm"
              onClick={() => handleSweep(w)}
              disabled={sweeping !== null}
            >
              {sweeping === w ? 'Sweeping…' : `${w}d Sweep`}
            </button>
          ))}
          <button
            className="btn btn--primary btn--sm"
            onClick={handleSweepAll}
            disabled={sweeping !== null}
          >
            {sweeping === 'all' ? 'Sweeping…' : 'Sweep All'}
          </button>
          <button className="btn btn--ghost btn--sm" onClick={load} disabled={loading}>
            Refresh
          </button>
        </div>
      </div>

      {/* Sweep result chip */}
      {sweepResult && (
        <div style={{
          padding: 'var(--space-xs) var(--space-sm)', marginBottom: 'var(--space-sm)',
          borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)',
          background: sweepResult.ok ? C.greenBg : C.redBg,
          border: `1px solid ${sweepResult.ok ? C.greenBorder : C.redBorder}`,
          color: sweepResult.ok ? C.green : C.red,
        }}>
          {sweepResult.ok ? '✓' : '⚠'} {sweepResult.msg}
        </div>
      )}

      {/* No releases yet */}
      {totalReleases === 0 && (
        <div style={{ color: 'var(--color-text-dim)', fontSize: 'var(--text-sm)', padding: 'var(--space-lg) 0', textAlign: 'center' }}>
          <div style={{ marginBottom: 'var(--space-xs)' }}>No releases tracked yet.</div>
          <div style={{ fontSize: 'var(--text-xs)', maxWidth: 320, margin: '0 auto', lineHeight: 1.5 }}>
            Promote a Candidate from the Clusters panel and record a release to start monitoring accuracy and conversion drift over 7, 14, and 30-day windows.
          </div>
        </div>
      )}

      {/* Release cards */}
      {data.attributions?.map(attr => {
        const live = daysLive(attr.release_date);
        const meta = alertMeta(attr.alert_status);
        const isExpanded = expandedId === attr.attribution_id;
        const latestSnap = attr.latest_snapshot;

        return (
          <Card key={attr.attribution_id} style={{ marginBottom: 'var(--space-sm)' }}>
            {/* Card header — click to expand */}
            <div
              onClick={() => setExpandedId(isExpanded ? null : attr.attribution_id)}
              style={{ cursor: 'pointer', userSelect: 'none' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-xs)' }}>
                {/* Alert badge */}
                <span style={{
                  fontSize: 'var(--text-xs)', padding: '2px 8px',
                  borderRadius: 'var(--radius-sm)',
                  background: meta.bg, color: meta.color,
                  fontWeight: 600, flexShrink: 0,
                }}>
                  {meta.label}
                </span>

                {/* Version */}
                <div style={{ flex: 1, fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text)' }}>
                  {attr.release_version || 'Unversioned release'}
                </div>

                {/* Days live chip */}
                {live != null && (
                  <span style={{
                    fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)',
                    padding: '1px 6px', borderRadius: 'var(--radius-sm)',
                    background: 'var(--color-surface-elevated)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text-secondary)',
                    flexShrink: 0,
                  }}>
                    {live}d live
                  </span>
                )}

                {/* Release date */}
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)', flexShrink: 0 }}>
                  {attr.release_date ? new Date(attr.release_date * 1000).toLocaleDateString(undefined, { timeZone: _TZ }) : '—'}
                </div>

                {/* Expand chevron */}
                <span style={{ color: 'var(--color-text-dim)', fontSize: 'var(--text-xs)', flexShrink: 0 }}>
                  {isExpanded ? '▲' : '▼'}
                </span>
              </div>

              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-sm)' }}>
                Candidate: <span style={{ fontFamily: 'var(--font-mono)' }}>{attr.candidate_id?.slice(0, 12)}…</span>
              </div>

              {/* Window progress chips */}
              <div style={{ display: 'flex', gap: 'var(--space-xs)', flexWrap: 'wrap', marginBottom: latestSnap ? 'var(--space-sm)' : 0 }}>
                {[7, 14, 30].map(w => {
                  const measured = attr.windows_measured?.includes(w);
                  const daysLeft = measured ? 0 : daysUntilWindow(attr.release_date, w);
                  return (
                    <span key={w} style={{
                      fontSize: 'var(--text-xs)', padding: '2px 8px',
                      borderRadius: 'var(--radius-sm)',
                      background: measured ? C.greenBg : 'var(--color-surface-elevated)',
                      color: measured ? C.green : 'var(--color-text-dim)',
                      border: `1px solid ${measured ? C.greenBorder : 'var(--color-border)'}`,
                      fontFamily: 'var(--font-mono)',
                    }}>
                      {w}d {measured ? '✓' : daysLeft > 0 ? `⏳ ${daysLeft}d` : '⏳'}
                    </span>
                  );
                })}
              </div>

              {/* Latest snapshot — compact delta row */}
              {latestSnap && (
                <div style={{
                  display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap',
                  padding: 'var(--space-xs) var(--space-sm)',
                  background: 'var(--color-surface)',
                  borderRadius: 'var(--radius-sm)',
                  marginTop: 'var(--space-xs)',
                  fontSize: 'var(--text-xs)',
                }}>
                  <div>
                    <span style={{ color: 'var(--color-text-secondary)' }}>Match Δ </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: deltaColor(latestSnap.success_rate_delta) }}>
                      {fmtDelta(latestSnap.success_rate_delta)}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-text-secondary)' }}>CVR Δ </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: deltaColor(latestSnap.conversion_delta) }}>
                      {fmtDelta(latestSnap.conversion_delta)}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--color-text-secondary)' }}>Lift Δ </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: deltaColor(latestSnap.trust_delta) }}>
                      {fmtDelta(latestSnap.trust_delta)}
                    </span>
                  </div>
                  <div style={{ marginLeft: 'auto', color: 'var(--color-text-dim)' }}>
                    {latestSnap.window_days}d window
                  </div>
                </div>
              )}
            </div>

            {/* Expanded detail */}
            {isExpanded && (
              <div style={{ borderTop: '1px solid var(--color-border)', marginTop: 'var(--space-sm)', paddingTop: 'var(--space-sm)' }}>
                <MonitoringDetail attributionId={attr.attribution_id} />
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ── Gold Set Suggestions Panel ──────────────────────────────────────────────

// ── Intelligence Score Card ──────────────────────────────────────────────────

const SCORE_COMPONENTS = [
  { key: 'signal_volume',      label: 'Signal Volume',       desc: 'Volume of analysis sessions recorded in the window. More signals = more reliable pattern detection.' },
  { key: 'pattern_coverage',   label: 'Pattern Coverage',    desc: 'Fraction of known patterns with sufficient signal data. Low coverage means some patterns are flying blind.' },
  { key: 'benchmark_pass_rate',label: 'Benchmark Pass Rate', desc: 'Accuracy of the VLM pipeline measured against gold-standard test cases. Target ≥90%.' },
  { key: 'vlm_correction_rate',label: 'VLM Correction Rate', desc: 'How often the VLM overrides CV outputs. High rate = CV is under-contributing; low rate = healthy CV/VLM balance.' },
];

function IntelligenceScoreCard() {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getIntelligenceScore(30, false)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const score = data?.score ?? null;
  const components = data?.components ?? {};
  const interp = data?.interpretation ?? null;

  const scoreColor = score == null ? 'var(--color-text-dim)'
    : score >= 70 ? C.green : score >= 50 ? C.amber : C.red;
  const statusLabel = score == null ? '—'
    : score >= 70 ? 'Healthy' : score >= 50 ? 'Needs Attention' : 'Critical';

  return (
    <div className="lo-panel" style={{ marginBottom: 'var(--space-md)' }}>
      <div className="lo-panel__header">
        <span className="lo-panel__title">Intelligence Score</span>
        {!loading && score != null && (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)' }}>30-day window · cached</span>
        )}
      </div>

      {loading && <p className="lo-empty">Loading score…</p>}

      {!loading && score != null && (
        <>
          {/* Score hero */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-lg)', marginBottom: 'var(--space-md)' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 48, fontWeight: 800, fontFamily: 'var(--font-mono)', color: scoreColor, lineHeight: 1 }}>
                {Math.round(score)}
              </div>
              <div style={{ fontSize: 'var(--text-xs)', color: scoreColor, fontWeight: 600, marginTop: 4 }}>{statusLabel}</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.5, marginBottom: 'var(--space-xs)' }}>
                Composite signal health score (0–100). Combines signal volume, pattern coverage, benchmark accuracy, and VLM/CV correction balance over the last 30 days.
              </div>
              <div style={{ display: 'flex', gap: 8, fontSize: 'var(--text-xs)', flexWrap: 'wrap' }}>
                <span style={{ color: C.green }}>≥70 Healthy</span>
                <span style={{ color: 'var(--color-text-dim)' }}>·</span>
                <span style={{ color: C.amber }}>50–69 Needs attention</span>
                <span style={{ color: 'var(--color-text-dim)' }}>·</span>
                <span style={{ color: C.red }}>&lt;50 Critical</span>
              </div>
            </div>
          </div>

          {/* Component breakdown */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {SCORE_COMPONENTS.map(({ key, label, desc }) => {
              const val = components[key] ?? null;
              const pct = val != null ? Math.round(val * 100) : null;
              const color = pct == null ? 'var(--color-border)'
                : pct >= 70 ? C.green : pct >= 50 ? C.amber : C.red;
              return (
                <div key={key}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text)', fontWeight: 600, width: 150, flexShrink: 0 }}>{label}</span>
                    <div style={{ flex: 1, height: 6, background: 'var(--color-border)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${pct ?? 0}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.4s' }} />
                    </div>
                    <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color, minWidth: 34, textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {pct != null ? `${pct}%` : '—'}
                    </span>
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)', marginLeft: 158, lineHeight: 1.4, marginBottom: 2 }}>
                    {desc}
                  </div>
                </div>
              );
            })}
          </div>

          {interp && (
            <div style={{ marginTop: 'var(--space-sm)', padding: '6px 10px', background: `${scoreColor}11`, borderRadius: 'var(--radius-sm)', border: `1px solid ${scoreColor}33` }}>
              <span style={{ fontSize: 'var(--text-xs)', color: scoreColor, fontWeight: 600 }}>{interp}</span>
            </div>
          )}
        </>
      )}

      {!loading && score == null && (
        <p className="lo-empty">No intelligence score computed yet. Run Ingestion first to populate signals.</p>
      )}
    </div>
  );
}

function GoldSetSuggestionsPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const result = await getGoldSetSuggestions();
      setData(result);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div className="lo-panel"><p className="lo-empty">Loading gold set suggestions…</p></div>;
  if (err) return <div className="lo-panel"><p className="lo-empty lo-empty--err">{err}</p></div>;
  if (!data) return null;

  const { suggestions } = data;

  return (
    <div className="lo-panel">
      <div className="lo-panel__header">
        <span className="lo-panel__title">Gold Set Suggestions</span>
        <button className="lo-btn lo-btn--ghost" onClick={load}>Refresh</button>
      </div>
      {!suggestions || suggestions.length === 0 ? (
        <p className="lo-empty">No gold set candidates yet. Suggestions appear when high-confidence nailed_it reference photo sessions are recorded.</p>
      ) : (
        <table className="lo-table">
          <thead>
            <tr>
              <th>Pattern</th>
              <th>Confidence</th>
              <th>Environment</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {suggestions.map((s, i) => (
              <tr key={i}>
                <td><code>{s.pattern_id}</code></td>
                <td style={{ color: C.green }}>{s.confidence != null ? `${(s.confidence * 100).toFixed(1)}%` : '—'}</td>
                <td>{s.environment || '—'}</td>
                <td style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)' }}>
                  {s.created_at ? new Date(s.created_at * 1000).toLocaleDateString(undefined, { timeZone: _TZ }) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── VLM Corrections Panel ──────────────────────────────────────────────────

function VlmCorrectionsPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const result = await getVlmCorrections();
      setData(result);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <div className="lo-panel"><p className="lo-empty">Loading VLM corrections…</p></div>;
  if (err) return <div className="lo-panel"><p className="lo-empty lo-empty--err">{err}</p></div>;
  if (!data) return null;

  const { total_corrections, by_field, by_type, cv_learning_items } = data;
  const topFields = Object.entries(by_field || {}).slice(0, 8);

  return (
    <div className="lo-panel">
      <div className="lo-panel__header">
        <span className="lo-panel__title">VLM → CV Corrections</span>
        <button className="lo-btn lo-btn--ghost" onClick={load}>Refresh</button>
      </div>
      {total_corrections === 0 ? (
        <p className="lo-empty">No VLM corrections logged yet. Corrections appear when VLM overrides CV during reference photo analysis.</p>
      ) : (
        <>
          <div className="sig-kpi-row" style={{ marginBottom: 12 }}>
            <div className="sig-kpi"><span className="sig-kpi__val">{total_corrections}</span><span className="sig-kpi__label">Total corrections</span></div>
            <div className="sig-kpi"><span className="sig-kpi__val">{by_type?.override || 0}</span><span className="sig-kpi__label">Overrides</span></div>
            <div className="sig-kpi"><span className="sig-kpi__val">{by_type?.enrichment || 0}</span><span className="sig-kpi__label">Enrichments</span></div>
            <div className="sig-kpi"><span className="sig-kpi__val">{topFields.length}</span><span className="sig-kpi__label">CV fields affected</span></div>
          </div>
          {topFields.length > 0 && (
            <table className="lo-table" style={{ marginBottom: 10 }}>
              <thead><tr><th>CV Field</th><th>Corrections</th><th>Share</th></tr></thead>
              <tbody>
                {topFields.map(([field, count]) => (
                  <tr key={field}>
                    <td><code>{field || 'untagged'}</code></td>
                    <td>{count}</td>
                    <td>{total_corrections ? `${((count / total_corrections) * 100).toFixed(0)}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {cv_learning_items?.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div className="lo-section-label">CV Learning Insights</div>
              {cv_learning_items.slice(0, 5).map((item, i) => (
                <div key={i} className="lo-cluster-card lo-cluster-card--low" style={{ marginBottom: 4, padding: '6px 10px' }}>
                  <span style={{ fontSize: 12 }}>{item}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Knowledge Base Panel ─────────────────────────────────────────────────────

const RISK_COLOR = { low: '#4ade80', medium: C.amber, high: C.red };
const RISK_BG    = { low: 'rgba(74,222,128,0.10)', medium: 'rgba(251,191,36,0.10)', high: 'rgba(248,113,113,0.08)' };

function SignalGauge({ value, max, color = C.blue }) {
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 120 }}>
      <div style={{
        flex: 1, height: 5, background: 'var(--color-border)',
        borderRadius: 3, overflow: 'hidden',
      }}>
        <div style={{
          width: `${(pct * 100).toFixed(1)}%`, height: '100%',
          background: color, borderRadius: 3,
          transition: 'width 0.4s ease',
        }} />
      </div>
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)', minWidth: 30, textAlign: 'right' }}>
        {value}/{max}
      </span>
    </div>
  );
}

const FAMILY_LABEL = {
  portrait:   'Portrait',
  editorial:  'Editorial',
  commercial: 'Commercial',
  tabletop:   'Tabletop',
  other:      'Other',
};

function SignalReadinessBar({ sig, minSig }) {
  if (!sig) return null;
  const raw     = sig.raw_signal_count ?? 0;
  const success = sig.weighted_success_rate ?? 0;
  const fail    = sig.weighted_fail_rate    ?? 0;
  const label   = sig.signal_quality_label ?? null;
  const pct     = minSig > 0 ? Math.min(raw / minSig, 1) : 0;
  const meetsHigh   = sig.meets_high_threshold;
  const meetsMed    = sig.meets_medium_threshold;
  const meetsLow    = sig.meets_low_threshold;
  const readyColor  = meetsHigh ? C.green : meetsMed ? '#a3e635' : meetsLow ? C.amber : C.red;
  const readyLabel  = meetsHigh ? '✓ Ready (HIGH)' : meetsMed ? '✓ Ready (MED)' : meetsLow ? '~ Marginal (LOW)' : '✗ Insufficient';

  return (
    <div style={{ marginTop: 10 }}>
      {/* Signal count gauge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)', width: 90 }}>Signal fill</span>
        <div style={{ flex: 1, height: 6, background: 'var(--color-border)', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ width: `${(pct * 100).toFixed(1)}%`, height: '100%', background: readyColor, borderRadius: 4, transition: 'width 0.4s' }} />
        </div>
        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: readyColor, minWidth: 50, textAlign: 'right' }}>
          {raw} / {minSig}
        </span>
      </div>

      {/* Success / fail rate bars */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)', width: 90 }}>Win rate</span>
        <div style={{ flex: 1, height: 5, background: 'var(--color-border)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: `${(success * 100).toFixed(1)}%`, height: '100%', background: C.green, borderRadius: 3, transition: 'width 0.4s' }} />
        </div>
        <span style={{ fontSize: 'var(--text-xs)', color: C.green, minWidth: 36, textAlign: 'right' }}>
          {(success * 100).toFixed(0)}%
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)', width: 90 }}>Fail rate</span>
        <div style={{ flex: 1, height: 5, background: 'var(--color-border)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: `${(fail * 100).toFixed(1)}%`, height: '100%', background: C.red, borderRadius: 3, transition: 'width 0.4s' }} />
        </div>
        <span style={{ fontSize: 'var(--text-xs)', color: C.red, minWidth: 36, textAlign: 'right' }}>
          {(fail * 100).toFixed(0)}%
        </span>
      </div>

      {/* Readiness verdict + quality label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: readyColor }}>{readyLabel}</span>
        {label && (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)', marginLeft: 4 }}>{label}</span>
        )}
        {sig.dominant_failure_mode && (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)', marginLeft: 'auto' }}>
            Dominant: <strong>{sig.dominant_failure_mode.replace(/_/g, ' ')}</strong>
          </span>
        )}
      </div>
    </div>
  );
}

function KnowledgePanel({ onGoToClusters, initialPatternId = null, onInitialConsumed }) {
  const [patterns,    setPatterns]    = useState([]);
  const [summary,     setSummary]     = useState(null);
  const [signals,     setSignals]     = useState({});      // patternId → AggregatedInsight
  const [fullEntries, setFullEntries] = useState({});      // patternId → full PatternEntry
  const [ciResults,   setCiResults]   = useState({});      // patternId → CI gate result
  const [loading,     setLoading]     = useState(true);
  const [err,         setErr]         = useState(null);
  const [filter,      setFilter]      = useState('all');   // all | low | medium | high | family:X
  const [expanded,    setExpanded]    = useState(null);
  const [fetching,    setFetching]    = useState({});      // patternId → 'detail'|'ci'|null
  const patternRefs = useRef({});

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const data = await getKnowledgeBase();
      const list = Array.isArray(data) ? data : (data?.entries ?? data?.patterns ?? []);
      const sum  = !Array.isArray(data) && typeof data === 'object' ? data : null;
      setPatterns(list);
      setSummary(sum);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Auto-expand and scroll to a specific pattern when navigated from Intelligence
  useEffect(() => {
    if (!initialPatternId || loading || patterns.length === 0) return;
    setExpanded(initialPatternId);
    fetchDetail(initialPatternId);
    onInitialConsumed?.();
    const t = setTimeout(() => {
      const el = patternRefs.current[initialPatternId];
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 200);
    return () => clearTimeout(t);
  }, [initialPatternId, loading, patterns]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchDetail(patternId) {
    if (fetching[patternId] || (fullEntries[patternId] && signals[patternId])) return;
    setFetching(f => ({ ...f, [patternId]: 'detail' }));
    try {
      const [entry, sig] = await Promise.allSettled([
        fullEntries[patternId] ? Promise.resolve(fullEntries[patternId]) : getKnowledgeEntry(patternId),
        signals[patternId]     ? Promise.resolve(signals[patternId])     : aggregatePatternSignals(patternId, 30),
      ]);
      if (entry.status === 'fulfilled') setFullEntries(e => ({ ...e, [patternId]: entry.value }));
      if (sig.status   === 'fulfilled') setSignals(s => ({ ...s, [patternId]: sig.value }));
    } catch { /* non-fatal */ }
    finally { setFetching(f => ({ ...f, [patternId]: null })); }
  }

  async function fetchCiGate(patternId) {
    if (fetching[patternId]) return;
    setFetching(f => ({ ...f, [patternId]: 'ci' }));
    try {
      // CI gate needs a candidate dict — use the full entry's pattern rules as a proxy
      const entry = fullEntries[patternId] ?? (await getKnowledgeEntry(patternId));
      setFullEntries(e => ({ ...e, [patternId]: entry }));
      const result = await runCIGate(patternId, entry?.rules ?? {});
      setCiResults(r => ({ ...r, [patternId]: result }));
    } catch (e) {
      setCiResults(r => ({ ...r, [patternId]: { error: e.message } }));
    } finally {
      setFetching(f => ({ ...f, [patternId]: null }));
    }
  }

  function handleExpand(id) {
    const next = expanded === id ? null : id;
    setExpanded(next);
    if (next) fetchDetail(next);
  }

  // ── Filter + group ──────────────────────────────────────────────────────────
  const isFamily = filter.startsWith('family:');
  const familyFilter = isFamily ? filter.slice(7) : null;
  const visible = patterns.filter(p => {
    if (filter === 'all')    return true;
    if (isFamily)             return (p.family || 'other') === familyFilter;
    return p.risk_level === filter;
  });

  const families = [...new Set(visible.map(p => p.family || 'other'))].sort();
  const byFamily = {};
  families.forEach(f => { byFamily[f] = visible.filter(p => (p.family || 'other') === f); });

  // ── Summary counts ──────────────────────────────────────────────────────────
  const byRisk = summary?.by_risk ?? {};

  if (loading) return <div className="lo-panel"><p className="lo-empty">Loading knowledge base…</p></div>;
  if (err)     return <div className="lo-panel"><p className="lo-empty lo-empty--err">{err}</p></div>;

  return (
    <div className="lo-panel">
      <PanelDesc text="Per-pattern knowledge base. Shows signal readiness, win/fail rates, and minimum thresholds for auto-deploy. Expand any pattern to see description, symptoms, fix steps, and run a CI gate check before promoting a candidate." />

      {/* ── Summary strip ── */}
      {summary && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 'var(--space-md)', flexWrap: 'wrap' }}>
          <div style={{ padding: '6px 12px', background: 'var(--color-surface-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: 'var(--text-xs)' }}>
            <span style={{ color: 'var(--color-text-dim)' }}>Total patterns: </span>
            <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>{summary.total_patterns ?? patterns.length}</span>
          </div>
          {Object.entries(byRisk).map(([risk, cnt]) => cnt > 0 && (
            <div key={risk} style={{ padding: '6px 12px', background: RISK_BG[risk] ?? 'var(--color-surface-elevated)', borderRadius: 'var(--radius-md)', border: `1px solid ${(RISK_COLOR[risk] ?? 'var(--color-border)') + '44'}`, fontSize: 'var(--text-xs)' }}>
              <span style={{ color: RISK_COLOR[risk] ?? 'var(--color-text-dim)', fontWeight: 700, textTransform: 'uppercase' }}>{risk}</span>
              <span style={{ color: 'var(--color-text-dim)', marginLeft: 4 }}>{cnt}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Filter bar ── */}
      <div className="lo-panel__header" style={{ marginBottom: 'var(--space-md)' }}>
        <span className="lo-panel__title">Pattern Knowledge Base</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {['all', 'low', 'medium', 'high'].map(f => (
            <button key={f} className={`adb__range-btn${filter === f ? ' adb__range-btn--on' : ''}`}
              onClick={() => setFilter(f)} type="button"
              style={{ fontSize: 'var(--text-xs)', padding: '2px 10px' }}>
              {f}
            </button>
          ))}
          {[...new Set(patterns.map(p => p.family || 'other'))].sort().map(fam => (
            <button key={fam}
              className={`adb__range-btn${filter === `family:${fam}` ? ' adb__range-btn--on' : ''}`}
              onClick={() => setFilter(`family:${fam}`)} type="button"
              style={{ fontSize: 'var(--text-xs)', padding: '2px 10px', textTransform: 'capitalize' }}>
              {FAMILY_LABEL[fam] ?? fam}
            </button>
          ))}
          <button className="lo-btn lo-btn--ghost" onClick={load} style={{ marginLeft: 4 }}>↺</button>
        </div>
      </div>

      {visible.length === 0 && (
        <p className="lo-empty">No patterns for this filter.</p>
      )}

      {/* ── Family sections ── */}
      {families.map(fam => (
        <div key={fam} style={{ marginBottom: 'var(--space-lg)' }}>
          {/* Family header (only show when not filtered to a single family) */}
          {!isFamily && (
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 'var(--space-xs)', paddingBottom: 4, borderBottom: '1px solid var(--color-border)' }}>
              {FAMILY_LABEL[fam] ?? fam}
            </div>
          )}

          {byFamily[fam].map(p => {
            const riskColor  = RISK_COLOR[p.risk_level] ?? 'var(--color-text-dim)';
            const riskBg     = RISK_BG[p.risk_level]    ?? 'transparent';
            const sig        = signals[p.pattern_id];
            const entry      = fullEntries[p.pattern_id];
            const ci         = ciResults[p.pattern_id];
            const minSig     = p.min_signals_for_change ?? (p.risk_level === 'high' ? 200 : p.risk_level === 'medium' ? 75 : 25);
            const rawCount   = sig?.raw_signal_count ?? 0;
            const gaugeColor = rawCount >= minSig ? C.green : rawCount >= minSig * 0.5 ? C.amber : C.blue;
            const isOpen     = expanded === p.pattern_id;

            return (
              <div key={p.pattern_id} ref={el => { patternRefs.current[p.pattern_id] = el; }} style={{ marginBottom: 'var(--space-xs)', borderRadius: 'var(--radius-md)', border: `1px solid ${isOpen ? (riskColor + '55') : (p.pattern_id === initialPatternId ? '#4DA3FF88' : 'var(--color-border)')}`, overflow: 'hidden', background: isOpen ? RISK_BG[p.risk_level] : 'var(--color-surface-elevated)', transition: 'border-color 0.15s, background 0.15s' }}>

                {/* ── Pattern row (click to expand) ── */}
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', flexWrap: 'wrap' }}
                  onClick={() => handleExpand(p.pattern_id)}
                >
                  {/* Risk badge */}
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, padding: '2px 7px', background: riskBg, color: riskColor, borderRadius: 'var(--radius-full)', border: `1px solid ${riskColor}44`, textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>
                    {p.risk_level ?? '—'}
                  </span>

                  {/* Pattern ID + display name */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <code style={{ fontSize: 12, color: 'var(--color-accent)' }}>{p.pattern_id}</code>
                    {p.display_name && p.display_name !== p.pattern_id && (
                      <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-xs)', marginLeft: 8 }}>{p.display_name}</span>
                    )}
                  </div>

                  {/* Signal mini-gauge (only if loaded) */}
                  {sig ? (
                    <div style={{ width: 100, flexShrink: 0 }}>
                      <SignalGauge value={rawCount} max={minSig} color={gaugeColor} />
                    </div>
                  ) : (
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)', flexShrink: 0 }}>
                      {fetching[p.pattern_id] ? '…' : `min ${minSig} signals`}
                    </span>
                  )}

                  {/* Tags */}
                  {p.tags?.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      {p.tags.slice(0, 3).map(t => (
                        <span key={t} style={{ fontSize: 9, padding: '1px 5px', borderRadius: 'var(--radius-sm)', background: 'var(--color-border)', color: 'var(--color-text-dim)' }}>{t}</span>
                      ))}
                    </div>
                  )}

                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)', flexShrink: 0 }}>{isOpen ? '▲' : '▼'}</span>
                </div>

                {/* ── Expanded detail ── */}
                {isOpen && (
                  <div style={{ borderTop: '1px solid var(--color-border)', padding: '14px 16px', fontSize: 'var(--text-xs)' }}>

                    {/* Action buttons row */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                      <button
                        className="btn btn--ghost btn--sm"
                        style={{ fontSize: 'var(--text-xs)' }}
                        onClick={() => fetchDetail(p.pattern_id)}
                        disabled={!!fetching[p.pattern_id]}
                      >
                        {fetching[p.pattern_id] === 'detail' ? '…' : '↺ Refresh Signals'}
                      </button>
                      {onGoToClusters && (
                        <button
                          className="btn btn--ghost btn--sm"
                          style={{ fontSize: 'var(--text-xs)', color: C.blue, borderColor: '#4DA3FF44' }}
                          onClick={() => onGoToClusters({ status: 'open' })}
                        >
                          View Clusters →
                        </button>
                      )}
                      <button
                        className="btn btn--ghost btn--sm"
                        style={{ fontSize: 'var(--text-xs)', color: C.amber, borderColor: '#fbbf2444' }}
                        onClick={() => fetchCiGate(p.pattern_id)}
                        disabled={!!fetching[p.pattern_id]}
                      >
                        {fetching[p.pattern_id] === 'ci' ? 'Running CI…' : '▶ Run CI Gate'}
                      </button>
                    </div>

                    {/* Description */}
                    {(entry?.description || p.description) && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontWeight: 700, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Description</div>
                        <p style={{ color: 'var(--color-text-secondary)', lineHeight: 1.6, margin: 0 }}>
                          {entry?.description ?? p.description}
                        </p>
                      </div>
                    )}

                    {/* Signal readiness */}
                    {sig && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontWeight: 700, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Signal Readiness</div>
                        <SignalReadinessBar sig={sig} minSig={minSig} />
                      </div>
                    )}

                    {/* Symptoms + fix steps */}
                    {(entry?.symptoms ?? p.symptoms)?.length > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontWeight: 700, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                          Symptoms ({(entry?.symptoms ?? p.symptoms).length})
                        </div>
                        {(entry?.symptoms ?? p.symptoms).map((s, si) => (
                          <div key={s.symptom_id ?? si} style={{ marginBottom: 8, padding: '8px 10px', background: 'var(--color-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: s.fix_steps?.length ? 6 : 0 }}>
                              <code style={{ fontSize: 11, color: 'var(--color-accent)' }}>{s.symptom_id ?? s.id}</code>
                              {s.severity && (
                                <span style={{ fontSize: 9, fontWeight: 700, color: SEVERITY_COLOR[s.severity], textTransform: 'uppercase' }}>{s.severity}</span>
                              )}
                              {s.description && (
                                <span style={{ color: 'var(--color-text-secondary)', fontSize: 11 }}>{s.description}</span>
                              )}
                            </div>
                            {s.fix_steps?.length > 0 && (
                              <div style={{ paddingLeft: 8, borderLeft: '2px solid var(--color-border)' }}>
                                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Fix Steps</div>
                                {s.fix_steps.map((step, fi) => (
                                  <div key={fi} style={{ display: 'flex', gap: 6, marginBottom: 3 }}>
                                    <span style={{ flexShrink: 0, fontSize: 9, color: 'var(--color-text-dim)', minWidth: 12, textAlign: 'right' }}>{fi + 1}.</span>
                                    <span style={{ color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                                      {typeof step === 'string' ? step : (step.action ?? JSON.stringify(step))}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* CI gate result */}
                    {ci && (
                      <div style={{ padding: '8px 10px', borderRadius: 'var(--radius-sm)', border: `1px solid ${ci.error ? '#f8717144' : ci.overall_verdict === 'pass' ? '#34D39944' : '#fbbf2444'}`, background: ci.error ? 'rgba(248,113,113,0.06)' : ci.overall_verdict === 'pass' ? 'rgba(52,211,153,0.06)' : 'rgba(251,191,36,0.06)', marginBottom: 8 }}>
                        {ci.error ? (
                          <span style={{ color: C.red, fontSize: 'var(--text-xs)' }}>CI Gate error: {ci.error}</span>
                        ) : (
                          <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                              <span style={{ fontWeight: 700, color: ci.overall_verdict === 'pass' ? C.green : C.amber, fontSize: 'var(--text-xs)', textTransform: 'uppercase' }}>
                                {ci.overall_verdict === 'pass' ? '✓ CI Pass' : `⚠ ${ci.disposition?.replace(/_/g, ' ')}`}
                              </span>
                              {ci.blocking_reason && (
                                <span style={{ color: C.red, fontSize: 'var(--text-xs)' }}>{ci.blocking_reason}</span>
                              )}
                            </div>
                            {ci.gates?.length > 0 && (
                              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {ci.gates.map((g, gi) => (
                                  <span key={gi} style={{ fontSize: 9, padding: '1px 6px', borderRadius: 'var(--radius-sm)', background: g.passed ? C.greenBg : C.redBg, color: g.passed ? C.green : C.red, border: `1px solid ${g.passed ? '#34D39933' : '#f8717133'}` }}>
                                    {g.name ?? g.gate}: {g.passed ? '✓' : '✗'}
                                  </span>
                                ))}
                              </div>
                            )}
                            {ci.summary && (
                              <p style={{ color: 'var(--color-text-dim)', lineHeight: 1.5, margin: '6px 0 0', fontSize: 'var(--text-xs)' }}>{ci.summary}</p>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {/* Loading state when no detail yet */}
                    {fetching[p.pattern_id] === 'detail' && (
                      <p style={{ color: 'var(--color-text-dim)', fontSize: 'var(--text-xs)' }}>Loading signals and entry…</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── Revenue Simulation Panel ──────────────────────────────────────────────────

const DEFAULT_SCENARIOS = [
  { name: 'Conservative',        description: 'High-confidence patterns only', pattern_id: 'rembrandt',  risk_level: 'low',    sessions_per_day: 500, baseline_cvr: 0.08, target_cvr: 0.10, arpu: 49 },
  { name: 'Moderate',            description: 'Balanced risk and coverage',    pattern_id: 'loop',       risk_level: 'medium', sessions_per_day: 500, baseline_cvr: 0.08, target_cvr: 0.11, arpu: 49 },
  { name: 'Controlled Autonomy', description: 'Broader pattern deployment',    pattern_id: 'clamshell',  risk_level: 'high',   sessions_per_day: 500, baseline_cvr: 0.08, target_cvr: 0.13, arpu: 49 },
];

function RevenuePanel() {
  const [projections, setProjections] = useState(null);
  const [summary,     setSummary]     = useState(null);
  const [runAt,       setRunAt]       = useState(null);
  const [simHistory,  setSimHistory]  = useState([]);
  const [loading,     setLoading]     = useState(true);  // true while loading latest on mount
  const [err,         setErr]         = useState(null);
  const [activeScen,  setActiveScen]  = useState(0);
  const [showHistory, setShowHistory] = useState(false);

  // Alias so existing {results} references still work
  const results = projections;

  // Load latest run + history from backend on mount (survives logout/cache-clear)
  useEffect(() => {
    let cancelled = false;
    async function loadFromBackend() {
      try {
        const [latest, histData] = await Promise.all([
          getLatestSimulation(),
          getSimulationHistory(20),
        ]);
        if (cancelled) return;
        if (latest) {
          setProjections(latest.projections || null);
          setSummary(latest.summary || null);
          setRunAt(latest.run_at ? new Date(latest.run_at * 1000).toLocaleString(undefined, { timeZone: _TZ }) : null);
        }
        setSimHistory(histData?.runs || []);
      } catch (e) {
        if (!cancelled) setErr(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadFromBackend();
    return () => { cancelled = true; };
  }, []);

  function applyRun(run) {
    setProjections(run.projections || null);
    setSummary(run.summary || null);
    setRunAt(run.run_at ? new Date(run.run_at * 1000).toLocaleString(undefined, { timeZone: _TZ }) : null);
    setActiveScen(0);
  }

  async function run() {
    setLoading(true); setErr(null);
    try {
      // simulate — backend now auto-saves and returns id + run_at
      const data = await simulateRevenue(DEFAULT_SCENARIOS);
      const projs = Array.isArray(data) ? data : (data?.projections ?? []);
      const sum   = data?.summary ?? null;
      const ts    = data?.run_at ? new Date(data.run_at * 1000).toLocaleString(undefined, { timeZone: _TZ }) : new Date().toLocaleString(undefined, { timeZone: _TZ });
      setProjections(projs);
      setSummary(sum);
      setRunAt(ts);
      setActiveScen(0);
      // Refresh history from backend (it now includes the new run)
      const histData = await getSimulationHistory(20);
      setSimHistory(histData?.runs || []);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }

  const scen = results?.[activeScen];

  function fmtDelta(v) {
    if (v == null) return '—';
    const sign = v >= 0 ? '+' : '';
    return `${sign}$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function fmtDollars(v) {
    if (v == null) return '—';
    return `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function fmtN(v) {
    if (v == null) return '—';
    return Number(v).toLocaleString();
  }

  const ROW = { padding: '10px 0', borderBottom: '1px solid var(--color-border)' };
  const LABEL_STYLE = { fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 };
  const VAL_STYLE   = { fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--color-text)' };

  return (
    <div className="lo-panel">
      <PanelDesc text="Simulate 30-day revenue impact of deploying pattern ruleset updates. Three risk scenarios (Conservative/Moderate/Aggressive) show projected conversion lift, annualised delta, and per-pattern gate-unlock day. Run before promoting any high-risk candidate." />
      <div className="lo-panel__header">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="lo-panel__title">30-Day Revenue Simulation</span>
          {runAt && (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)', fontFamily: 'var(--font-mono)' }}>
              Last run: {runAt}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
          {simHistory.length > 0 && (
            <button className="lo-btn lo-btn--ghost" onClick={() => setShowHistory(h => !h)}>
              {showHistory ? 'Hide History' : `History (${simHistory.length})`}
            </button>
          )}
          <button className="lo-btn lo-btn--primary" onClick={run} disabled={loading}>
            {loading ? 'Running…' : results ? '↺ Re-run' : '▶ Run Simulation'}
          </button>
        </div>
      </div>

      {err && <p className="lo-empty lo-empty--err">{err}</p>}

      {/* History drawer */}
      {showHistory && simHistory.length > 0 && (
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-sm)', marginBottom: 'var(--space-md)', display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
          <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Previous Runs</span>
          {simHistory.map((h, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', padding: '6px 0', borderBottom: i < simHistory.length - 1 ? '1px solid var(--color-border)' : 'none' }}>
              <span style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--color-text-dim)', flex: 1 }}>
                {h.run_at ? new Date(h.run_at * 1000).toLocaleString(undefined, { timeZone: _TZ }) : 'Unknown time'}
                {h.run_by && <span style={{ opacity: 0.6 }}> · {h.run_by}</span>}
              </span>
              {h.summary?.total_revenue_delta_30d != null && (
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: (h.summary.total_revenue_delta_30d ?? 0) >= 0 ? C.green : C.red }}>
                  {fmtDelta(h.summary.total_revenue_delta_30d)} 30d
                </span>
              )}
              <button
                className="lo-btn lo-btn--ghost"
                style={{ fontSize: 'var(--text-xs)', padding: '2px 8px' }}
                onClick={() => { applyRun(h); setShowHistory(false); }}
              >
                Restore
              </button>
            </div>
          ))}
        </div>
      )}

      {!results && !loading && (
        <p className="lo-empty" style={{ padding: '24px 0' }}>
          Simulate revenue impact of deploying pattern updates under three risk scenarios.
        </p>
      )}

      {results && (
        <>
          {/* Aggregate summary strip */}
          {summary && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 'var(--space-md)', padding: '10px 14px', background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 'var(--radius-md)' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)', flex: 1 }}>
                All scenarios combined:
              </span>
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: C.green }}>
                {summary.total_revenue_delta_30d != null ? `${fmtDelta(summary.total_revenue_delta_30d)} 30d` : ''}
              </span>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)' }}>·</span>
              <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: C.green }}>
                {summary.total_annualised_delta != null ? `${fmtDelta(summary.total_annualised_delta)} / yr` : ''}
              </span>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)' }}>·</span>
              <span style={{ fontSize: 'var(--text-xs)', color: C.amber }}>
                Fastest deploy: Day {summary.fastest_deploy_day ?? '—'}
              </span>
            </div>
          )}

          {/* Scenario tabs */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 'var(--space-lg)', flexWrap: 'wrap' }}>
            {results.map((r, i) => (
              <button
                key={i}
                className={`adb__range-btn${activeScen === i ? ' adb__range-btn--on' : ''}`}
                onClick={() => setActiveScen(i)}
                type="button"
              >
                {r.scenario_name ?? `Scenario ${i + 1}`}
              </button>
            ))}
          </div>

          {scen && (
            <>
              {/* KPI strip — 4 plain cards, no 9px labels */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 'var(--space-lg)' }}>
                {[
                  { label: '30-day delta',  val: fmtDelta(scen.revenue_delta_30d),   color: (scen.revenue_delta_30d ?? 0) >= 0 ? C.green : C.red },
                  { label: 'Annualised',     val: fmtDelta(scen.annualised_delta),    color: (scen.annualised_delta ?? 0) >= 0 ? C.green : C.red },
                  { label: 'CVR lift',       val: scen.cvr_lift != null ? `+${(scen.cvr_lift * 100).toFixed(1)}%` : '—', color: C.blue },
                  { label: 'Gate day',       val: scen.gate_unlock_day != null ? `Day ${scen.gate_unlock_day}` : '—', color: C.amber },
                ].map(({ label, val, color }) => (
                  <div key={label} style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    padding: '10px 14px',
                    display: 'flex', flexDirection: 'column', gap: 4,
                  }}>
                    <span style={{ ...VAL_STYLE, color }}>{val}</span>
                    <span style={LABEL_STYLE}>{label}</span>
                  </div>
                ))}
              </div>

              {/* Pattern row — one per scenario */}
              <div style={{ marginBottom: 'var(--space-md)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 90px 90px 90px', gap: 12, padding: '0 4px 6px', borderBottom: '1px solid var(--color-border)' }}>
                  {['Pattern', 'Risk', 'Gate day', 'Deploy', '30d Δ'].map(h => (
                    <span key={h} style={LABEL_STYLE}>{h}</span>
                  ))}
                </div>
                {(() => {
                  const riskColor  = RISK_COLOR[scen.risk_level] ?? 'var(--color-text-dim)';
                  const riskBg     = RISK_BG[scen.risk_level]    ?? 'transparent';
                  const deltaColor = (scen.revenue_delta_30d ?? 0) >= 0 ? C.green : C.red;
                  return (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 90px 90px 90px', gap: 12, alignItems: 'center', ...ROW, padding: '10px 4px' }}>
                      <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text)', fontFamily: 'var(--font-mono, monospace)' }}>
                        {scen.pattern_id ?? '—'}
                      </span>
                      <span style={{
                        display: 'inline-block',
                        fontSize: 'var(--text-xs)', fontWeight: 700,
                        padding: '2px 8px', borderRadius: 'var(--radius-full)',
                        background: riskBg, color: riskColor,
                        border: `1px solid ${riskColor}44`,
                        textTransform: 'uppercase', letterSpacing: '0.04em',
                        width: 'fit-content',
                      }}>
                        {scen.risk_level ?? '—'}
                      </span>
                      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                        {scen.gate_unlock_day != null ? `Day ${scen.gate_unlock_day}` : '—'}
                      </span>
                      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                        {scen.deploy_day != null ? `Day ${scen.deploy_day}` : '—'}
                      </span>
                      <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: deltaColor }}>
                        {fmtDelta(scen.revenue_delta_30d)}
                      </span>
                    </div>
                  );
                })()}
              </div>

              {/* Day-by-day CVR ramp — mini table for first 10 days */}
              {scen.day_snapshots?.length > 0 && (
                <div style={{ marginTop: 'var(--space-md)' }}>
                  <span style={{ ...LABEL_STYLE, display: 'block', marginBottom: 6 }}>CVR Ramp — first 10 days</span>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {scen.day_snapshots.slice(0, 10).map(snap => {
                      const isDeployed = snap.gate_status === 'deployed';
                      return (
                        <div key={snap.day} style={{
                          minWidth: 52, padding: '6px 8px',
                          background: isDeployed ? 'rgba(52,211,153,0.08)' : 'var(--color-surface)',
                          border: `1px solid ${isDeployed ? '#34D39944' : 'var(--color-border)'}`,
                          borderRadius: 'var(--radius-sm)',
                          textAlign: 'center',
                        }}>
                          <div style={{ fontSize: 10, color: 'var(--color-text-dim)', marginBottom: 2 }}>D{snap.day}</div>
                          <div style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: isDeployed ? C.green : 'var(--color-text-secondary)' }}>
                            {(snap.cvr * 100).toFixed(1)}%
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {scen.notes && (
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', marginTop: 4 }}>
                  {scen.notes}
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

// ── Main Tab ────────────────────────────────────────────────────────────────

export default function LearningOpsTab({ navRequest = null, onNavConsumed = null }) {
  const [panel, setPanel]           = useState('overview');
  const [clusterNavStatus,   setClusterNavStatus]   = useState('open');
  const [clusterNavSeverity, setClusterNavSeverity] = useState(null);
  const [clusterNavId,       setClusterNavId]       = useState(null);
  const [clusterNavPattern,  setClusterNavPattern]  = useState(null);
  const [knowledgeNavId,     setKnowledgeNavId]     = useState(null);

  // Consume incoming nav requests from LabScreen (e.g. from ControlCenterTab)
  useEffect(() => {
    if (!navRequest) return;
    if (navRequest.panel) setPanel(navRequest.panel);
    if (navRequest.status)   setClusterNavStatus(navRequest.status);
    if (navRequest.severity !== undefined) setClusterNavSeverity(navRequest.severity);
    if (navRequest.clusterId !== undefined) setClusterNavId(navRequest.clusterId);
    if (navRequest.patternId !== undefined) {
      // "clusters" nav with patternId → filter clusters by pattern
      // "knowledge" nav with patternId → expand that pattern
      if (navRequest.panel === 'clusters') setClusterNavPattern(navRequest.patternId);
      if (navRequest.panel === 'knowledge') setKnowledgeNavId(navRequest.patternId);
    }
    onNavConsumed?.();
  }, [navRequest]); // eslint-disable-line react-hooks/exhaustive-deps
  const [ops, setOps] = useState(null);
  const [opsLoading, setOpsLoading] = useState(true);
  const [ingesting, setIngesting] = useState(false);
  const [ingestDevMode, setIngestDevMode] = useState(false);
  const [scheduler, setScheduler] = useState(null);
  const [ingestResult, setIngestResult] = useState(null); // { total_clusters, mode, error? }

  const loadOps = useCallback(async () => {
    setOpsLoading(true);
    try {
      const [data, sched] = await Promise.allSettled([
        getLearningOps(),
        getSchedulerStatus(),
      ]);
      if (data.status === 'fulfilled') setOps(data.value);
      if (sched.status === 'fulfilled') setScheduler(sched.value);
    } catch {
      setOps(null);
    } finally {
      setOpsLoading(false);
    }
  }, []);

  useEffect(() => { loadOps(); }, [loadOps]);

  async function handleIngest() {
    setIngesting(true);
    setIngestResult(null);
    try {
      const mode = ingestDevMode ? 'dev' : 'production';
      const result = await triggerIngestion(30, mode);
      await loadOps();
      setIngestResult({ total_clusters: result.total_clusters, by_failure_mode: result.by_failure_mode, mode });
    } catch (err) {
      setIngestResult({ error: err.message });
    } finally {
      setIngesting(false);
    }
  }

  const panels = [
    { id: 'overview',   label: 'Overview' },
    { id: 'clusters',   label: `Clusters${ops?.open_clusters ? ` (${ops.open_clusters})` : ''}` },
    { id: 'monitoring', label: `Monitoring${ops?.active_alerts ? ` ⚠${ops.active_alerts}` : ''}` },
    { id: 'intel',      label: 'Intelligence' },
    { id: 'knowledge',  label: 'Knowledge' },
    { id: 'revenue',    label: 'Revenue' },
  ];

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 'var(--space-md)',
      }}>
        <h3 style={{ margin: 0, fontSize: 'var(--text-base)', fontWeight: 'var(--weight-bold)' }}>
          Learning Ops
        </h3>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)' }}>
          Production → LAB closed loop
        </span>
      </div>

      <div className="lab-tabs" style={{ marginBottom: 'var(--space-lg)' }}>
        {panels.map(p => (
          <button
            key={p.id}
            className={`lab-tab${panel === p.id ? ' lab-tab--active' : ''}`}
            onClick={() => setPanel(p.id)}
            type="button"
          >
            {p.label}
          </button>
        ))}
      </div>

      {panel === 'overview' && (
        <OverviewPanel
          ops={ops}
          scheduler={scheduler}
          onRefresh={loadOps}
          onIngest={handleIngest}
          ingesting={ingesting}
          devMode={ingestDevMode}
          onDevModeChange={setIngestDevMode}
          onSchedulerChange={setScheduler}
          ingestResult={ingestResult}
          onGoToClusters={({ status = 'open', severity = null, clusterId = null } = {}) => {
            setClusterNavStatus(status);
            setClusterNavSeverity(severity);
            setClusterNavId(clusterId);
            setPanel('clusters');
          }}
        />
      )}
      {panel === 'clusters' && (
        <ClustersPanel
          initialStatus={clusterNavStatus}
          initialSeverity={clusterNavSeverity}
          initialClusterId={clusterNavId}
          initialPatternFilter={clusterNavPattern}
          onPatternFilterConsumed={() => setClusterNavPattern(null)}
        />
      )}
      {panel === 'monitoring' && <MonitoringPanel />}
      {panel === 'intel'      && (
        <>
          <GoldSetSuggestionsPanel />
          <VlmCorrectionsPanel />
        </>
      )}
      {panel === 'knowledge'  && (
        <KnowledgePanel
          initialPatternId={knowledgeNavId}
          onInitialConsumed={() => setKnowledgeNavId(null)}
          onGoToClusters={({ status = 'open', severity = null, clusterId = null } = {}) => {
            setClusterNavStatus(status);
            setClusterNavSeverity(severity);
            setClusterNavId(clusterId);
            setPanel('clusters');
          }}
        />
      )}
      {panel === 'revenue'    && <RevenuePanel />}
    </div>
  );
}
