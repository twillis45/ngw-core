/**
 * LearningOpsTab — Closed-loop learning surface inside NGW Lab.
 *
 * Surfaces:
 *   Overview     — ops summary: cluster counts, alerts, pending evals
 *   Clusters     — failure cluster list with generate-candidate action
 *   Monitoring   — post-release windows and alerts
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getLearningOps,
  triggerIngestion,
  listFailureClusters,
  generateCandidateFromCluster,
  updateClusterStatus,
  evaluateCandidate,
  getCandidateEvaluations,
  getMonitoringSummary,
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
  aggregatePatternSignals,
  simulateRevenue,
} from '../../data/labApi';

const SEVERITY_COLOR = {
  critical: '#F87171',
  high: '#FBBF24',
  medium: '#4DA3FF',
  low: 'var(--color-text-dim)',
};

const VERDICT_COLOR = {
  safe: '#34D399',
  risky: '#FBBF24',
  blocked: '#F87171',
};

const ALERT_COLOR = {
  rollback_review: '#F87171',
  candidate_regression: '#FBBF24',
  nominal: '#34D399',
};

function Badge({ label, color }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px',
      background: color + '22', color,
      borderRadius: 'var(--radius-full)', fontSize: 'var(--text-xs)',
      fontWeight: 'var(--weight-semibold)', border: `1px solid ${color}44`,
    }}>
      {label}
    </span>
  );
}

function Card({ children, style }) {
  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      padding: 'var(--space-md)',
      marginBottom: 'var(--space-md)',
      ...style,
    }}>
      {children}
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{
      fontSize: 'var(--text-xs)', textTransform: 'uppercase',
      letterSpacing: '0.06em', color: 'var(--color-text-dim)',
      fontWeight: 'var(--weight-semibold)', marginBottom: 'var(--space-sm)',
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
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch { return iso; }
  }

  const enabled   = status?.enabled ?? false;
  const dotColor  = enabled ? '#34D399' : 'var(--color-text-dim)';
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
              <span style={{ color: status.last_run_error ? '#F87171' : 'var(--color-text)' }}>
                {fmtTime(status.last_run_at)}
              </span>
              {status.last_run_error && <span style={{ color: '#F87171' }}> ✕</span>}
              {status.last_run_result && !status.last_run_error && (
                <span style={{ color: '#34D399' }}>
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
          color: notice.type === 'ok' ? '#34D399' : '#F87171',
        }}>
          {notice.type === 'ok' ? '✓' : '✕'} {notice.msg}
        </div>
      )}
    </div>
  );
}


// ── Overview Panel ──────────────────────────────────────────────────────────

function OverviewPanel({ ops, scheduler, onRefresh, onIngest, ingesting, devMode, onDevModeChange, onSchedulerChange, ingestResult, onGoToClusters }) {
  if (!ops) return <div style={{ color: 'var(--color-text-dim)', padding: 'var(--space-lg)' }}>Loading…</div>;

  return (
    <div>
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
  const statItems = [
    { label: 'Open Clusters', value: ops.open_clusters, color: 'var(--color-text)' },
    { label: 'Critical/High', value: ops.critical_clusters, color: ops.critical_clusters > 0 ? '#F87171' : 'var(--color-text)' },
    { label: 'Investigating', value: ops.investigating_clusters, color: '#FBBF24' },
    { label: 'Need Eval', value: ops.candidates_needing_eval, color: ops.candidates_needing_eval > 0 ? '#4DA3FF' : 'var(--color-text)' },
    { label: 'Active Alerts', value: ops.active_alerts, color: ops.active_alerts > 0 ? '#F87171' : '#34D399' },
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)', flexWrap: 'wrap' }}>
        {statItems.map(s => (
          <div key={s.label} style={{
            flex: 1, minWidth: 80, textAlign: 'center',
            background: 'var(--color-surface-elevated)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-sm)',
          }}>
            <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--weight-black)', color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)', alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          className="btn btn--primary btn--sm"
          onClick={onIngest}
          disabled={ingesting}
          style={{ flex: 1 }}
        >
          {ingesting ? 'Ingesting…' : '↻ Run Ingestion'}
        </button>
        <button className="btn btn--ghost btn--sm" onClick={onRefresh} style={{ flex: 1 }}>
          Refresh
        </button>
        {/* Dev mode toggle — bypasses production filter to include internal sessions */}
        <label
          title="Include internal/dev sessions — use when no production traffic exists yet"
          style={{
            display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer',
            fontSize: 'var(--text-xs)', color: devMode ? '#FBBF24' : 'var(--color-text-dim)',
            userSelect: 'none', whiteSpace: 'nowrap',
          }}
        >
          <input
            type="checkbox"
            checked={devMode}
            onChange={e => onDevModeChange(e.target.checked)}
            style={{ accentColor: '#FBBF24', cursor: 'pointer' }}
          />
          Dev mode
        </label>
      </div>
      {devMode && (
        <div style={{
          fontSize: 'var(--text-xs)', color: '#FBBF24',
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
              <span style={{ fontSize: 'var(--text-xs)', color: '#F87171' }}>⚠ Ingestion failed: {ingestResult.error}</span>
            ) : (
              <>
                <span style={{ fontSize: 'var(--text-xs)', color: '#34D399' }}>
                  ✓ {ingestResult.total_clusters} cluster{ingestResult.total_clusters !== 1 ? 's' : ''} created/updated
                  {ingestResult.mode === 'dev' && <span style={{ color: '#FBBF24', marginLeft: 4 }}>(dev mode)</span>}
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
                    fontSize: 10, padding: '1px 6px', borderRadius: 'var(--radius-sm)',
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
              <div style={{ fontSize: 10, color: 'var(--color-text-dim)', fontWeight: 'var(--weight-semibold)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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
                    textAlign: 'center', fontSize: 9, fontWeight: 'var(--weight-bold)',
                    background: 'var(--color-surface-elevated)', color: 'var(--color-text-secondary)',
                    border: '1px solid var(--color-border)',
                  }}>{num}</span>
                  <div style={{ fontSize: 10, lineHeight: 1.5 }}>
                    <span style={{ color: 'var(--color-text)', fontWeight: 'var(--weight-semibold)' }}>{title}</span>
                    <span style={{ color: 'var(--color-text-dim)', marginLeft: 4 }}>{desc}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {ops.top_clusters?.length > 0 && (
        <>
          <SectionTitle>Top Clusters</SectionTitle>
          {ops.top_clusters.map(c => (
            <div key={c.id} style={{
              display: 'flex', alignItems: 'center', gap: 'var(--space-sm)',
              padding: 'var(--space-sm) 0',
              borderBottom: '1px solid var(--color-border)',
            }}>
              <Badge label={c.severity} color={SEVERITY_COLOR[c.severity] || 'var(--color-text-dim)'} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text)', fontWeight: 'var(--weight-semibold)' }}>
                  {c.failure_mode?.replace(/_/g, ' ')}
                  {c.pattern_id && <span style={{ color: 'var(--color-accent)', marginLeft: 6 }}>{c.pattern_id}</span>}
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)' }}>
                  {c.frequency} occurrences
                  {c.candidate_id && <span style={{ color: '#34D399', marginLeft: 6 }}>✓ candidate generated</span>}
                </div>
              </div>
            </div>
          ))}
        </>
      )}

      {ops.alerts?.length > 0 && (
        <div style={{ marginTop: 'var(--space-md)' }}>
          <SectionTitle>Active Alerts</SectionTitle>
          {ops.alerts.map(a => (
            <div key={a.id} style={{
              display: 'flex', alignItems: 'center', gap: 'var(--space-sm)',
              padding: 'var(--space-xs) 0',
              borderBottom: '1px solid var(--color-border)',
            }}>
              <Badge label={a.alert_type?.replace(/_/g, ' ')} color={ALERT_COLOR[a.alert_type] || '#FBBF24'} />
              <div style={{ flex: 1, fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                {a.window_days}d window · match Δ {a.success_rate_delta ?? '—'} · cvr Δ {a.conversion_delta ?? '—'}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Clusters Panel ──────────────────────────────────────────────────────────

function ClustersPanel() {
  const [clusters,        setClusters]        = useState([]);
  const [loading,         setLoading]         = useState(true);
  const [filter,          setFilter]          = useState('open');
  const [working,         setWorking]         = useState({});
  const [expanded,        setExpanded]        = useState(null);
  const [notice,          setNotice]          = useState(null); // { type: 'success'|'error', msg }
  const [dismissConfirm,  setDismissConfirm]  = useState(null); // clusterId pending dismiss
  const [autoRelease,     setAutoRelease]     = useState(false); // auto-accept on safe eval

  function showNotice(type, msg) {
    setNotice({ type, msg });
    setTimeout(() => setNotice(null), 5000);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listFailureClusters({ status: filter || undefined });
      setClusters(Array.isArray(data) ? data : []);
    } catch {
      setClusters([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

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
      await load();
    } catch (err) {
      showNotice('error', `Eval failed: ${err.message}`);
    } finally {
      setWorking(w => ({ ...w, [candidateId]: null }));
    }
  }

  const filters = ['open', 'investigating', 'resolved', 'dismissed', ''];
  const filterLabels = { '': 'All', open: 'Open', investigating: 'Investigating', resolved: 'Resolved', dismissed: 'Dismissed' };

  return (
    <div>
      <div style={{ display: 'flex', gap: 'var(--space-xs)', marginBottom: 'var(--space-md)', flexWrap: 'wrap', alignItems: 'center' }}>
        {filters.map(f => (
          <button
            key={f || 'all'}
            className={`adb__range-btn${filter === f ? ' adb__range-btn--on' : ''}`}
            onClick={() => setFilter(f)}
            type="button"
          >
            {filterLabels[f]}
          </button>
        ))}
        <button className="adb__refresh" onClick={load} type="button" title="Refresh">↻</button>
        <label
          title="When enabled, candidates that evaluate as 'safe' are automatically accepted — no manual review step"
          style={{
            display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', marginLeft: 'auto',
            fontSize: 'var(--text-xs)',
            color: autoRelease ? '#34D399' : 'var(--color-text-dim)',
            userSelect: 'none', whiteSpace: 'nowrap',
          }}
        >
          <input
            type="checkbox"
            checked={autoRelease}
            onChange={e => setAutoRelease(e.target.checked)}
            style={{ accentColor: '#34D399', cursor: 'pointer' }}
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
          color: notice.type === 'success' ? '#34D399' : '#F87171',
        }}>
          {notice.type === 'success' ? '✓ ' : '⚠ '}{notice.msg}
        </div>
      )}

      {loading && <div style={{ color: 'var(--color-text-dim)' }}>Loading…</div>}
      {!loading && clusters.length === 0 && (
        <div style={{ color: 'var(--color-text-dim)', fontSize: 'var(--text-sm)', padding: 'var(--space-lg) 0' }}>
          No clusters. Run ingestion to detect failure patterns.
        </div>
      )}

      {clusters.map(c => (
        <Card key={c.id}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-sm)', marginBottom: 'var(--space-xs)' }}>
            <Badge label={c.severity} color={SEVERITY_COLOR[c.severity] || 'var(--color-text-dim)'} />
            <Badge label={c.failure_mode?.replace(/_/g, ' ')} color="var(--color-text-dim)" />
            {c.pattern_id && <Badge label={c.pattern_id} color="var(--color-accent)" />}
            <div style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)' }}>
              {c.frequency} sessions
            </div>
          </div>

          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text)', marginBottom: 'var(--space-sm)', lineHeight: 1.5 }}>
            {c.evidence?.description || 'No description.'}
          </div>

          {c.candidate_id && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', marginBottom: 'var(--space-xs)', flexWrap: 'wrap' }}>
              <div style={{ fontSize: 'var(--text-xs)', color: '#34D399' }}>
                ✓ Candidate linked: {c.candidate_id.slice(0, 8)}…
              </div>
              <button
                className="btn btn--ghost btn--sm"
                style={{ fontSize: 10, color: '#4DA3FF', borderColor: '#4DA3FF44' }}
                onClick={() => handleEvalCandidate(c.candidate_id)}
                disabled={!!working[c.candidate_id]}
                title={autoRelease
                  ? "Evaluate candidate — auto-accept if safe"
                  : "Evaluate candidate against Gold Set"}
              >
                {working[c.candidate_id] === 'evaluating'
                  ? 'Evaluating…'
                  : autoRelease ? '✓ Eval + auto-accept' : 'Eval'}
              </button>
              {c.failure_mode === 'confidence_mismatch' && (
                <button
                  className="btn btn--ghost btn--sm"
                  style={{ fontSize: 10, color: '#FBBF24', borderColor: '#FBBF2444' }}
                  onClick={() => handleApplyCandidate(c.candidate_id)}
                  disabled={!!working[c.candidate_id]}
                  title="Apply confidence recalibration to engine (writes confidence_overrides.json)"
                >
                  {working[c.candidate_id] === 'applying' ? 'Applying…' : 'Apply to Engine'}
                </button>
              )}
            </div>
          )}

          {/* Inline dismiss confirmation */}
          {dismissConfirm === c.id ? (
            <div style={{ display: 'flex', gap: 'var(--space-xs)', alignItems: 'center', marginBottom: 'var(--space-xs)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
              <span>Dismiss this cluster?</span>
              <button className="btn btn--ghost btn--sm" style={{ color: '#F87171' }} onClick={() => handleDismissConfirmed(c.id)}>Yes, dismiss</button>
              <button className="btn btn--ghost btn--sm" onClick={() => setDismissConfirm(null)}>Cancel</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 'var(--space-xs)', flexWrap: 'wrap' }}>
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

          {expanded === c.id && (
            <div style={{ marginTop: 'var(--space-sm)' }}>
              {/* Evidence summary rows */}
              {c.evidence && Object.entries(c.evidence).map(([k, v]) => {
                if (k === 'description') return null;
                const display = typeof v === 'object' ? JSON.stringify(v) : String(v);
                return (
                  <div key={k} style={{ display: 'flex', gap: 8, padding: '4px 0', borderBottom: '1px solid var(--color-border)', fontSize: 'var(--text-xs)' }}>
                    <span style={{ color: 'var(--color-text-secondary)', minWidth: 140, flexShrink: 0 }}>{k.replace(/_/g, ' ')}</span>
                    <span style={{ color: 'var(--color-text)', wordBreak: 'break-word' }}>{display}</span>
                  </div>
                );
              })}
              {/* Raw JSON toggle */}
              <pre style={{
                marginTop: 'var(--space-xs)', fontSize: 'var(--text-xs)',
                color: 'var(--color-text-secondary)',
                background: 'var(--color-surface-elevated)',
                padding: 'var(--space-sm)', borderRadius: 'var(--radius-sm)',
                overflow: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                maxHeight: 240, lineHeight: 1.6,
              }}>
                {JSON.stringify(c.evidence, null, 2)}
              </pre>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

// ── Monitoring Panel ────────────────────────────────────────────────────────

function MonitoringPanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sweeping, setSweeping] = useState(false);
  const [sweepAllResult, setSweepAllResult] = useState(null);

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

  async function handleSweep() {
    setSweeping(true);
    try {
      const result = await triggerMonitoringSweep(30);
      alert(`Sweep complete: ${result.snapshots_created} snapshot(s), ${result.alerts?.length || 0} alert(s)`);
      await load();
    } finally {
      setSweeping(false);
    }
  }

  async function handleSweepAll() {
    setSweeping(true);
    setSweepAllResult(null);
    try {
      const result = await triggerSweepAll();
      setSweepAllResult(result);
      await load();
    } catch (e) {
      setSweepAllResult({ error: e.message });
    } finally {
      setSweeping(false);
    }
  }

  if (loading) return <div style={{ color: 'var(--color-text-dim)' }}>Loading…</div>;
  if (!data) return <div style={{ color: 'var(--color-text-dim)' }}>No monitoring data.</div>;

  return (
    <div>
      <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-sm)', flexWrap: 'wrap' }}>
        <button
          className="btn btn--primary btn--sm"
          onClick={handleSweep}
          disabled={sweeping}
          style={{ flex: 1 }}
        >
          {sweeping ? 'Sweeping…' : '↻ Run 30-day Sweep'}
        </button>
        <button
          className="btn btn--ghost btn--sm"
          onClick={handleSweepAll}
          disabled={sweeping}
          style={{ flex: 1 }}
        >
          Sweep All Windows
        </button>
        <button className="btn btn--ghost btn--sm" onClick={load} style={{ flex: 1 }}>
          Refresh
        </button>
      </div>
      {sweepAllResult && (
        <div style={{
          padding: 'var(--space-xs) var(--space-sm)', marginBottom: 'var(--space-sm)',
          borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)',
          background: sweepAllResult.error
            ? 'color-mix(in srgb, #F87171 12%, transparent)'
            : 'color-mix(in srgb, #34D399 12%, transparent)',
          border: `1px solid ${sweepAllResult.error ? '#F8717144' : '#34D39944'}`,
          color: sweepAllResult.error ? '#F87171' : '#34D399',
        }}>
          {sweepAllResult.error
            ? `⚠ ${sweepAllResult.error}`
            : `✓ All windows swept: ${sweepAllResult.total_snapshots} snapshot(s), ${sweepAllResult.total_alerts} alert(s)`}
        </div>
      )}
      <div style={{ marginBottom: 'var(--space-lg)' }}></div>

      {data.active_alerts > 0 && (
        <div style={{
          background: 'rgba(248, 113, 113, 0.1)', border: '1px solid rgba(248, 113, 113, 0.3)',
          borderRadius: 'var(--radius-md)', padding: 'var(--space-md)', marginBottom: 'var(--space-md)',
          color: '#F87171', fontSize: 'var(--text-sm)',
        }}>
          ⚠ {data.active_alerts} active alert(s) require review
        </div>
      )}

      {data.attributions?.length === 0 && (
        <div style={{ color: 'var(--color-text-dim)', fontSize: 'var(--text-sm)', padding: 'var(--space-lg) 0' }}>
          No releases recorded yet. Accept a candidate and record a release to start monitoring.
        </div>
      )}

      {data.attributions?.map(attr => (
        <Card key={attr.attribution_id}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)', marginBottom: 'var(--space-xs)' }}>
            <Badge
              label={attr.alert_status?.replace(/_/g, ' ')}
              color={ALERT_COLOR[attr.alert_status] || '#34D399'}
            />
            <div style={{ flex: 1, fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)' }}>
              {attr.release_version || 'Unversioned release'}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)' }}>
              {attr.release_date ? new Date(attr.release_date * 1000).toLocaleDateString() : '—'}
            </div>
          </div>

          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-xs)' }}>
            Candidate: {attr.candidate_id?.slice(0, 8)}…
          </div>

          <div style={{ display: 'flex', gap: 'var(--space-xs)', flexWrap: 'wrap' }}>
            {[7, 14, 30].map(w => {
              const measured = attr.windows_measured?.includes(w);
              return (
                <span key={w} style={{
                  fontSize: 'var(--text-xs)',
                  padding: '2px 6px',
                  borderRadius: 'var(--radius-sm)',
                  background: measured ? 'rgba(52, 211, 153, 0.15)' : 'var(--color-surface-elevated)',
                  color: measured ? '#34D399' : 'var(--color-text-dim)',
                  border: `1px solid ${measured ? 'rgba(52, 211, 153, 0.3)' : 'var(--color-border)'}`,
                }}>
                  {w}d {measured ? '✓' : '⏳'}
                </span>
              );
            })}
          </div>

          {attr.latest_snapshot && (
            <div style={{ marginTop: 'var(--space-sm)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
              Match rate Δ: {attr.latest_snapshot.success_rate_delta ?? '—'}pp ·
              CVR Δ: {attr.latest_snapshot.conversion_delta ?? '—'}pp
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

// ── Gold Set Suggestions Panel ──────────────────────────────────────────────

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
                <td style={{ color: '#34D399' }}>{s.confidence != null ? `${(s.confidence * 100).toFixed(1)}%` : '—'}</td>
                <td>{s.environment || '—'}</td>
                <td style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>
                  {s.created_at ? new Date(s.created_at * 1000).toLocaleDateString() : '—'}
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

const RISK_COLOR = { low: '#4ade80', medium: '#fbbf24', high: '#f87171' };
const RISK_BG    = { low: 'rgba(74,222,128,0.10)', medium: 'rgba(251,191,36,0.10)', high: 'rgba(248,113,113,0.08)' };

function SignalGauge({ value, max, color = '#4DA3FF' }) {
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
      <span style={{ fontSize: 10, color: 'var(--color-text-dim)', minWidth: 30, textAlign: 'right' }}>
        {value}/{max}
      </span>
    </div>
  );
}

function KnowledgePanel() {
  const [patterns, setPatterns]       = useState([]);
  const [signals,  setSignals]        = useState({});       // patternId → AggregatedInsight
  const [loading,  setLoading]        = useState(true);
  const [err,      setErr]            = useState(null);
  const [filter,   setFilter]         = useState('all');    // all | low | medium | high
  const [expanded, setExpanded]       = useState(null);
  const [fetching, setFetching]       = useState({});       // patternId → bool

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const data = await getKnowledgeBase();
      const list = Array.isArray(data) ? data : (data?.patterns ?? []);
      setPatterns(list);
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function fetchSignals(patternId) {
    if (signals[patternId] || fetching[patternId]) return;
    setFetching(f => ({ ...f, [patternId]: true }));
    try {
      const data = await aggregatePatternSignals(patternId, 30);
      setSignals(s => ({ ...s, [patternId]: data }));
    } catch { /* non-fatal */ }
    finally { setFetching(f => ({ ...f, [patternId]: false })); }
  }

  function handleExpand(id) {
    const next = expanded === id ? null : id;
    setExpanded(next);
    if (next) fetchSignals(next);
  }

  const visible = filter === 'all'
    ? patterns
    : patterns.filter(p => p.risk_level === filter);

  if (loading) return <div className="lo-panel"><p className="lo-empty">Loading knowledge base…</p></div>;
  if (err)     return <div className="lo-panel"><p className="lo-empty lo-empty--err">{err}</p></div>;

  return (
    <div className="lo-panel">
      <div className="lo-panel__header">
        <span className="lo-panel__title">Pattern Knowledge Base</span>
        <div style={{ display: 'flex', gap: 6 }}>
          {['all', 'low', 'medium', 'high'].map(f => (
            <button
              key={f}
              className={`adb__range-btn${filter === f ? ' adb__range-btn--on' : ''}`}
              onClick={() => setFilter(f)}
              type="button"
              style={{ fontSize: 11, padding: '2px 10px' }}
            >
              {f}
            </button>
          ))}
          <button className="lo-btn lo-btn--ghost" onClick={load} style={{ marginLeft: 4 }}>↺</button>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="lo-empty">No patterns for filter "{filter}".</p>
      ) : (
        <table className="lo-table" style={{ marginBottom: 0 }}>
          <thead>
            <tr>
              <th>Pattern</th>
              <th>Risk</th>
              <th>Min signals</th>
              <th>30d signals</th>
              <th>Dominant failure</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.map(p => {
              const riskColor = RISK_COLOR[p.risk_level] ?? 'var(--color-text-dim)';
              const riskBg    = RISK_BG[p.risk_level]    ?? 'transparent';
              const sig       = signals[p.pattern_id];
              const minSig    = p.min_signals_for_change ?? (p.risk_level === 'high' ? 200 : p.risk_level === 'medium' ? 75 : 25);
              const sigCount  = sig?.total_signals ?? 0;
              const gaugeColor = sigCount >= minSig ? '#34D399' : sigCount >= minSig * 0.5 ? '#fbbf24' : '#4DA3FF';

              return (
                <>
                  <tr key={p.pattern_id} style={{ cursor: 'pointer' }} onClick={() => handleExpand(p.pattern_id)}>
                    <td>
                      <code style={{ fontSize: 12 }}>{p.pattern_id}</code>
                      {p.name && p.name !== p.pattern_id && (
                        <span style={{ color: 'var(--color-text-dim)', fontSize: 11, marginLeft: 6 }}>{p.name}</span>
                      )}
                    </td>
                    <td>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 7px',
                        background: riskBg, color: riskColor,
                        borderRadius: 'var(--radius-full)',
                        border: `1px solid ${riskColor}44`,
                        textTransform: 'uppercase', letterSpacing: '0.04em',
                      }}>
                        {p.risk_level ?? '—'}
                      </span>
                    </td>
                    <td style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>{minSig}</td>
                    <td>
                      {fetching[p.pattern_id]
                        ? <span style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>…</span>
                        : sig
                          ? <SignalGauge value={sigCount} max={minSig} color={gaugeColor} />
                          : <span style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>—</span>
                      }
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--color-text-dim)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {sig?.dominant_failure_mode
                        ? sig.dominant_failure_mode.replace(/_/g, ' ')
                        : '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>
                        {expanded === p.pattern_id ? '▲' : '▼'}
                      </span>
                    </td>
                  </tr>

                  {expanded === p.pattern_id && (
                    <tr key={`${p.pattern_id}-detail`}>
                      <td colSpan={6} style={{ padding: '0 0 12px 8px' }}>
                        <div style={{
                          background: 'var(--color-surface-elevated)',
                          borderRadius: 'var(--radius-sm)',
                          padding: '10px 14px',
                          fontSize: 12,
                        }}>
                          {/* Symptoms */}
                          {p.symptoms?.length > 0 && (
                            <div style={{ marginBottom: 8 }}>
                              <span style={{ color: 'var(--color-text-dim)', fontSize: 11, fontWeight: 600 }}>
                                SYMPTOMS ({p.symptoms.length})
                              </span>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                                {p.symptoms.map(s => (
                                  <span key={s.symptom_id} style={{
                                    background: 'var(--color-border)', color: 'var(--color-text-secondary)',
                                    borderRadius: 'var(--radius-sm)', padding: '2px 6px', fontSize: 11,
                                  }}>
                                    {s.symptom_id}
                                    {s.severity && <span style={{ marginLeft: 4, color: SEVERITY_COLOR[s.severity] }}>·{s.severity}</span>}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Aggregated insight */}
                          {sig && (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginTop: 4 }}>
                              {[
                                ['Total signals', sig.total_signals],
                                ['Weighted signals', sig.weighted_signal_count?.toFixed(1)],
                                ['Avg confidence', sig.avg_confidence != null ? `${(sig.avg_confidence * 100).toFixed(1)}%` : '—'],
                                ['Avg weight', sig.avg_weight?.toFixed(2)],
                                ['Ready to deploy?', sig.total_signals >= minSig ? '✓ Yes' : `✗ ${minSig - sig.total_signals} more needed`],
                                ['Failure mode', sig.dominant_failure_mode?.replace(/_/g, ' ') ?? '—'],
                              ].map(([label, val]) => (
                                <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                  <span style={{ fontSize: 10, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
                                  <span style={{ fontSize: 13, color: 'var(--color-text)', fontWeight: 600 }}>{val ?? '—'}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {!sig && !fetching[p.pattern_id] && (
                            <button
                              className="lo-btn lo-btn--ghost"
                              onClick={() => fetchSignals(p.pattern_id)}
                              style={{ marginTop: 4 }}
                            >
                              Load 30d signals
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      )}
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
  const [results,    setResults]    = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [err,        setErr]        = useState(null);
  const [activeScen, setActiveScen] = useState(0);

  async function run() {
    setLoading(true); setErr(null);
    try {
      const data = await simulateRevenue(DEFAULT_SCENARIOS);
      setResults(Array.isArray(data) ? data : (data?.projections ?? []));
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }

  const scen = results?.[activeScen];

  function fmtDelta(v) {
    if (v == null) return '—';
    const sign = v >= 0 ? '+' : '';
    return `${sign}$${Math.abs(v).toFixed(2)}`;
  }

  const ROW = { padding: '10px 0', borderBottom: '1px solid var(--color-border)' };
  const LABEL_STYLE = { fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 };
  const VAL_STYLE   = { fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--color-text)' };

  return (
    <div className="lo-panel">
      <div className="lo-panel__header">
        <span className="lo-panel__title">30-Day Revenue Simulation</span>
        <button className="lo-btn lo-btn--primary" onClick={run} disabled={loading}>
          {loading ? 'Running…' : results ? '↺ Re-run' : '▶ Run Simulation'}
        </button>
      </div>

      {err && <p className="lo-empty lo-empty--err">{err}</p>}

      {!results && !loading && (
        <p className="lo-empty" style={{ padding: '24px 0' }}>
          Simulate revenue impact of deploying pattern updates under three risk scenarios.
        </p>
      )}

      {results && (
        <>
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
                  { label: '30-day delta',  val: fmtDelta(scen.total_revenue_delta_30d), color: scen.total_revenue_delta_30d >= 0 ? '#34D399' : '#F87171' },
                  { label: 'Annualised',     val: fmtDelta(scen.annualised_delta),        color: scen.annualised_delta >= 0 ? '#34D399' : '#F87171' },
                  { label: 'Patterns',       val: scen.pattern_count ?? DEFAULT_SCENARIOS[activeScen].patterns.length, color: '#4DA3FF' },
                  { label: 'Gate unlocks',   val: scen.gate_unlock_count ?? '—',           color: '#fbbf24' },
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

              {/* Per-pattern rows */}
              {scen.pattern_projections?.length > 0 && (
                <div style={{ marginBottom: 'var(--space-md)' }}>
                  {/* Header row */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 90px 90px 90px', gap: 12, padding: '0 4px 6px', borderBottom: '1px solid var(--color-border)' }}>
                    {['Pattern', 'Risk', 'Gate day', 'Deploy', '30d Δ'].map(h => (
                      <span key={h} style={LABEL_STYLE}>{h}</span>
                    ))}
                  </div>

                  {scen.pattern_projections.map(pp => {
                    const riskColor = RISK_COLOR[pp.risk_level] ?? 'var(--color-text-dim)';
                    const riskBg    = RISK_BG[pp.risk_level]    ?? 'transparent';
                    const deltaColor = (pp.revenue_delta_30d ?? 0) >= 0 ? '#34D399' : '#F87171';
                    return (
                      <div key={pp.pattern_id} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 90px 90px 90px', gap: 12, alignItems: 'center', ...ROW, padding: '10px 4px' }}>
                        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-text)', fontFamily: 'var(--font-mono, monospace)' }}>
                          {pp.pattern_id}
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
                          {pp.risk_level ?? '—'}
                        </span>
                        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                          {pp.gate_unlock_day != null ? `Day ${pp.gate_unlock_day}` : '—'}
                        </span>
                        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                          {pp.deploy_day != null ? `Day ${pp.deploy_day}` : '—'}
                        </span>
                        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: deltaColor }}>
                          {fmtDelta(pp.revenue_delta_30d)}
                        </span>
                      </div>
                    );
                  })}
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

export default function LearningOpsTab() {
  const [panel, setPanel] = useState('overview');
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

      <div style={{ display: 'flex', gap: 'var(--space-xs)', marginBottom: 'var(--space-lg)', flexWrap: 'wrap' }}>
        {panels.map(p => (
          <button
            key={p.id}
            className={`adb__range-btn${panel === p.id ? ' adb__range-btn--on' : ''}`}
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
          onGoToClusters={() => setPanel('clusters')}
        />
      )}
      {panel === 'clusters'   && <ClustersPanel />}
      {panel === 'monitoring' && <MonitoringPanel />}
      {panel === 'intel'      && (
        <>
          <GoldSetSuggestionsPanel />
          <VlmCorrectionsPanel />
        </>
      )}
      {panel === 'knowledge'  && <KnowledgePanel />}
      {panel === 'revenue'    && <RevenuePanel />}
    </div>
  );
}
