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

// ── Overview Panel ──────────────────────────────────────────────────────────

function OverviewPanel({ ops, onRefresh, onIngest, ingesting }) {
  if (!ops) return <div style={{ color: 'var(--color-text-dim)', padding: 'var(--space-lg)' }}>Loading…</div>;

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

      <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)' }}>
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
      </div>

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
  const [clusters,  setClusters]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [filter,    setFilter]    = useState('open');
  const [working,   setWorking]   = useState({});
  const [expanded,  setExpanded]  = useState(null);
  const [notice,    setNotice]    = useState(null); // { type: 'success'|'error', msg }
  const [dismissConfirm, setDismissConfirm] = useState(null); // clusterId pending dismiss

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

  const filters = ['open', 'investigating', 'resolved', 'dismissed', ''];
  const filterLabels = { '': 'All', open: 'Open', investigating: 'Investigating', resolved: 'Resolved', dismissed: 'Dismissed' };

  return (
    <div>
      <div style={{ display: 'flex', gap: 'var(--space-xs)', marginBottom: 'var(--space-md)', flexWrap: 'wrap' }}>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)', marginBottom: 'var(--space-xs)' }}>
              <div style={{ fontSize: 'var(--text-xs)', color: '#34D399' }}>
                ✓ Candidate linked: {c.candidate_id.slice(0, 8)}…
              </div>
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

// ── Main Tab ────────────────────────────────────────────────────────────────

export default function LearningOpsTab() {
  const [panel, setPanel] = useState('overview');
  const [ops, setOps] = useState(null);
  const [opsLoading, setOpsLoading] = useState(true);
  const [ingesting, setIngesting] = useState(false);

  const loadOps = useCallback(async () => {
    setOpsLoading(true);
    try {
      const data = await getLearningOps();
      setOps(data);
    } catch {
      setOps(null);
    } finally {
      setOpsLoading(false);
    }
  }, []);

  useEffect(() => { loadOps(); }, [loadOps]);

  async function handleIngest() {
    setIngesting(true);
    try {
      const result = await triggerIngestion(30);
      await loadOps();
      alert(`Ingestion complete: ${result.total_clusters} cluster(s) created/updated.`);
    } catch (err) {
      alert(`Ingestion failed: ${err.message}`);
    } finally {
      setIngesting(false);
    }
  }

  const panels = [
    { id: 'overview', label: 'Overview' },
    { id: 'clusters', label: `Clusters${ops?.open_clusters ? ` (${ops.open_clusters})` : ''}` },
    { id: 'monitoring', label: `Monitoring${ops?.active_alerts ? ` ⚠${ops.active_alerts}` : ''}` },
    { id: 'intel', label: 'Intelligence' },
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
          onRefresh={loadOps}
          onIngest={handleIngest}
          ingesting={ingesting}
        />
      )}
      {panel === 'clusters' && <ClustersPanel />}
      {panel === 'monitoring' && <MonitoringPanel />}
      {panel === 'intel' && (
        <>
          <GoldSetSuggestionsPanel />
          <VlmCorrectionsPanel />
        </>
      )}
    </div>
  );
}
