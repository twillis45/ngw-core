/**
 * ControlCenterTab — Maintenance, Control Center & Support Dashboard
 *
 * Four sections:
 *   System       — scheduler status/control, manual ingestion, health overview
 *   Intelligence — global score gauge, autonomy queue, cluster review, per-pattern scores
 *   Paywall      — adaptive pricing state map, live impression log, flags
 *   Support      — recalibration hints, VLM corrections, gold-set suggestions
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAppState } from '../../context/AppContext';
import { getUser, getToken } from '../../data/authApi';
import { getSessionId, fetchFlags } from '../../data/flagsStore';
import {
  getSchedulerStatus,
  startScheduler,
  stopScheduler,
  configureScheduler,
  runSchedulerNow,
  getLearningOps,
  triggerIngestion,
  getIntelligenceScore,
  getIntelligencePatterns,
  getIntelligenceClusters,
  getAutonomyQueue,
  getAutonomyLog,
  getAutonomyDashboard,
  runAutonomyLoop,
  approveAutonomyAction,
  rejectAutonomyAction,
  forceComputeIntelligence,
  getVlmCorrections,
  getGoldSetSuggestions,
  getRecalibrationHints,
  listFailureClusters,
  getApiKeyHealth,
  probeApiKey,
  getIntelligenceScoreHistory,
  getApiMetrics,
  createGoldSetEntry,
} from '../../data/labApi';
import { C, EVENT_COLORS, okColor, pctColor } from '../../lib/statusColors';

// ── SVG Icons (Lucide-style, 24×24 grid, strokeWidth 1.5) ────────────────────

function Icon({ d, size = 16, paths, children }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true"
    >
      {d && <path d={d} />}
      {paths && paths.map((p, i) => <path key={i} d={p} />)}
      {children}
    </svg>
  );
}

const Icons = {
  // Section nav
  system: (
    <Icon size={14}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.07 4.93l-1.41 1.41M4.93 4.93l1.41 1.41M12 2v2M12 20v2M20 12h2M2 12h2M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41" />
    </Icon>
  ),
  intelligence: (
    <Icon size={14}>
      <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
      <circle cx="12" cy="12" r="10" />
    </Icon>
  ),
  paywall: (
    <Icon size={14}>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </Icon>
  ),
  support: (
    <Icon size={14}>
      <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
    </Icon>
  ),
  // Actions
  play: <Icon size={14}><polygon points="5 3 19 12 5 21 5 3" /></Icon>,
  stop: <Icon size={14}><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /></Icon>,
  refresh: (
    <Icon size={14}>
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
    </Icon>
  ),
  zap: (
    <Icon size={14}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </Icon>
  ),
  check: (
    <Icon size={14}>
      <polyline points="20 6 9 17 4 12" />
    </Icon>
  ),
  x: (
    <Icon size={14}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </Icon>
  ),
  chevronDown: (
    <Icon size={12}>
      <polyline points="6 9 12 15 18 9" />
    </Icon>
  ),
  chevronUp: (
    <Icon size={12}>
      <polyline points="18 15 12 9 6 15" />
    </Icon>
  ),
};

// ── Shared UI primitives ──────────────────────────────────────────────────────

function Badge({ label, color = C.blue }) {
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

function Card({ title, description, children, action, noPad }) {
  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      marginBottom: 'var(--space-md)',
      overflow: 'hidden',
    }}>
      {(title || action) && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          padding: 'var(--space-sm) var(--space-md)',
          borderBottom: '1px solid var(--color-border)',
          gap: 'var(--space-sm)',
        }}>
          <div style={{ minWidth: 0 }}>
            {title && (
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text)' }}>
                {title}
              </div>
            )}
            {description && (
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                {description}
              </div>
            )}
          </div>
          {action && <div style={{ flexShrink: 0 }}>{action}</div>}
        </div>
      )}
      <div style={noPad ? {} : { padding: 'var(--space-md)' }}>
        {children}
      </div>
    </div>
  );
}

function Stat({ label, value, color = 'var(--color-text)' }) {
  return (
    <div style={{
      background: 'var(--color-surface-elevated)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      padding: 'var(--space-sm) var(--space-md)',
      textAlign: 'center', minWidth: 80,
    }}>
      <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--weight-bold)', color }}>
        {value ?? '—'}
      </div>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)', marginTop: 2 }}>
        {label}
      </div>
    </div>
  );
}

/** Clickable stat tile — same look as Stat but with hover state and optional urgent styling. */
function ClickStat({ label, value, color = 'var(--color-text)', hint, urgent, onClick }) {
  const isClickable = !!onClick;
  return (
    <div
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={isClickable ? onClick : undefined}
      onKeyDown={isClickable ? e => e.key === 'Enter' && onClick() : undefined}
      style={{
        background: urgent
          ? `color-mix(in srgb, ${C.red} 8%, var(--color-surface-elevated))`
          : 'var(--color-surface-elevated)',
        border: urgent ? `1px solid ${C.redBorder}` : '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-sm) var(--space-md)',
        textAlign: 'center', minWidth: 80,
        cursor: isClickable ? 'pointer' : 'default',
        transition: 'border-color 0.15s, background 0.15s',
        position: 'relative',
      }}
      onMouseEnter={isClickable ? e => { e.currentTarget.style.borderColor = color === 'var(--color-text)' ? 'var(--color-accent)' : color; e.currentTarget.style.background = `color-mix(in srgb, ${color === 'var(--color-text)' ? C.blue : color} 10%, var(--color-surface-elevated))`; } : undefined}
      onMouseLeave={isClickable ? e => { e.currentTarget.style.borderColor = urgent ? C.redBorder : 'var(--color-border)'; e.currentTarget.style.background = urgent ? `color-mix(in srgb, ${C.red} 8%, var(--color-surface-elevated))` : 'var(--color-surface-elevated)'; } : undefined}
    >
      <div style={{ fontSize: 'var(--text-xl)', fontWeight: 'var(--weight-bold)', color }}>
        {value ?? '—'}
      </div>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)', marginTop: 2 }}>
        {label}
      </div>
      {hint && isClickable && (
        <div style={{ fontSize: 9, color, opacity: 0.8, marginTop: 2 }}>{hint}</div>
      )}
    </div>
  );
}

function Notice({ message, type = 'info' }) {
  const COLOR = { info: C.blue, ok: C.green, warn: C.amber, err: C.red };
  const c = COLOR[type] || COLOR.info;
  return (
    <div style={{
      background: c + '18', border: `1px solid ${c}44`, borderRadius: 'var(--radius-md)',
      padding: '8px var(--space-md)', fontSize: 'var(--text-xs)', color: c,
      marginBottom: 'var(--space-sm)',
    }}>
      {message}
    </div>
  );
}

function StatusDot({ ok, label }) {
  const color = okColor(ok);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%', background: color,
        display: 'inline-block', flexShrink: 0,
        boxShadow: ok ? `0 0 5px ${color}88` : 'none',
      }} />
      {label}
    </div>
  );
}

function InlineBtn({ onClick, loading, children, variant = 'ghost' }) {
  return (
    <button
      className={`btn btn--${variant} btn--sm`}
      onClick={onClick}
      disabled={loading}
      type="button"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
    >
      {loading ? <span style={{ opacity: 0.5 }}>…</span> : children}
    </button>
  );
}

function EmptyState({ message }) {
  return (
    <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--color-text-dim)', fontSize: 'var(--text-xs)' }}>
      {message}
    </div>
  );
}

const _DEVICE_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

function fmtTime(iso) {
  if (!iso) return '—';
  try {
    // Accept both Unix timestamps (seconds, number < 1e12) and ISO strings / ms timestamps
    const ms = typeof iso === 'number' && iso < 1e12 ? iso * 1000 : iso;
    return new Date(ms).toLocaleString(undefined, {
      timeZone: _DEVICE_TZ,
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch { return String(iso); }
}

// ── Score Gauge ───────────────────────────────────────────────────────────────

function ScoreGauge({ score, interpretation, insufficient }) {
  const pct = Math.max(0, Math.min(100, score ?? 0));
  const color = pctColor(pct);
  const r = 40, circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <svg width={100} height={100} viewBox="0 0 100 100">
        <circle cx={50} cy={50} r={r} fill="none" stroke="var(--color-border)" strokeWidth={8} />
        <circle
          cx={50} cy={50} r={r} fill="none"
          stroke={color} strokeWidth={8}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
        <text x={50} y={50} textAnchor="middle" dominantBaseline="central"
          fill={color} fontSize={20} fontWeight="bold">
          {score != null ? Math.round(score) : '—'}
        </text>
      </svg>
      {insufficient
        ? <Badge label="Insufficient data" color={C.muted} />
        : <Badge label={interpretation || 'No data'} color={color} />
      }
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM SECTION
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// VLM API KEY HEALTH CARD
// ─────────────────────────────────────────────────────────────────────────────

function ApiKeyHealthCard() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [probing, setProbing] = useState(false);
  const [notice, setNotice]   = useState(null);

  function showNotice(type, msg) { setNotice({ type, msg }); setTimeout(() => setNotice(null), 5000); }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getApiKeyHealth();
      setData(res);
    } catch (e) {
      // Admin-only — silently hide if auth fails
      if (e.status === 403 || e.message?.includes('403')) { setData(null); setLoading(false); return; }
      showNotice('err', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleProbe() {
    setProbing(true);
    try {
      const res = await probeApiKey();
      showNotice(res.ok ? 'ok' : 'err', res.ok ? `Key probe OK — ${res.model || data?.model || ''}` : `Probe failed: ${res.detail || res.error || 'unknown'}`);
      load();
    } catch (e) {
      showNotice('err', e.message);
    } finally {
      setProbing(false);
    }
  }

  if (!loading && !data) return null; // Admin-only; not shown to non-admins

  const hasErrors = data?.has_errors;
  const vlmOk    = data?.vlm_available;
  const events   = data?.recent_events || [];
  const latest   = data?.latest_event;

  const EV_COLORS = { ...EVENT_COLORS, timeout: C.amber };

  return (
    <Card
      title={
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          VLM API Key Health
          {!loading && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '2px 8px', borderRadius: 999,
              fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-medium)',
              background: hasErrors ? '#F8717122' : vlmOk ? '#34D39922' : '#6B728022',
              color: hasErrors ? C.red : vlmOk ? C.green : 'var(--color-text-dim)',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
              {hasErrors ? 'errors detected' : vlmOk ? 'healthy' : 'unavailable'}
            </span>
          )}
        </span>
      }
      description="Live status of the configured VLM provider API key. Errors here mean the analysis pipeline cannot call the VLM and will fall back to CV-only mode."
      action={
        <div style={{ display: 'flex', gap: 4 }}>
          <InlineBtn onClick={load} loading={loading}>{Icons.refresh} Refresh</InlineBtn>
          <InlineBtn variant={hasErrors ? 'primary' : 'ghost'} onClick={handleProbe} loading={probing}>
            {Icons.zap} Probe Now
          </InlineBtn>
        </div>
      }
    >
      {notice && <Notice message={notice.msg} type={notice.type} />}
      {loading && <EmptyState message="Checking API key status…" />}
      {!loading && data && (
        <div>
          {/* Key metadata row */}
          <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap', marginBottom: 'var(--space-md)' }}>
            <Stat label="Provider"  value={data.provider || '—'} />
            <Stat label="Model"     value={data.model    || '—'} />
            <Stat
              label="VLM available"
              value={vlmOk ? 'yes' : 'no'}
              color={vlmOk ? C.green : C.red}
            />
            {latest && (
              <Stat
                label="Last probe"
                value={fmtTime(latest.created_at || latest.ts)}
                color={latest.event_type?.includes('fail') || latest.event_type?.includes('401') ? C.red : C.green}
              />
            )}
          </div>

          {/* Error banner */}
          {hasErrors && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 12px', marginBottom: 'var(--space-md)',
              background: '#F8717115', border: '1px solid #F8717133',
              borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)',
              color: C.red,
            }}>
              <span>⚠</span>
              <span>Recent key errors detected — VLM calls may be failing. Check the event log below or click Probe Now.</span>
            </div>
          )}

          {/* Recent events */}
          {events.length > 0 && (
            <div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)', marginBottom: 4 }}>Recent events</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {events.slice(0, 8).map((e, i) => {
                  const evColor = EV_COLORS[e.event_type] || 'var(--color-text-secondary)';
                  return (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '4px 8px', background: 'var(--color-surface-elevated)',
                      borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-xs)',
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: evColor, flexShrink: 0 }} />
                      <span style={{ color: evColor, fontWeight: 'var(--weight-medium)', minWidth: 90 }}>
                        {e.event_type}
                      </span>
                      <span style={{ color: 'var(--color-text-dim)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {e.detail || e.message || ''}
                      </span>
                      <span style={{ color: 'var(--color-text-dim)', flexShrink: 0 }}>
                        {fmtTime(e.created_at || e.ts)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {events.length === 0 && !hasErrors && (
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)' }}>
              No recent events — key appears healthy. Run Probe Now to force a live check.
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function SystemSection({ onNavigateTo }) {
  const [scheduler, setScheduler]   = useState(null);
  const [opsData, setOpsData]       = useState(null);
  const [loading, setLoading]       = useState(true);
  const [notice, setNotice]         = useState(null);
  const [busy, setBusy]             = useState(null);
  const [intervalHours, setInterval] = useState(24);
  const [windowDays, setWindowDays]  = useState(30);
  const [configOpen, setConfigOpen] = useState(false);
  const [ingesting, setIngesting]   = useState(false);

  function showNotice(type, msg) {
    setNotice({ type, msg });
    setTimeout(() => setNotice(null), 4000);
  }

  const load = useCallback(async () => {
    try {
      const [s, ops] = await Promise.all([getSchedulerStatus(), getLearningOps()]);
      setScheduler(s);
      setOpsData(ops);
      setInterval(s.interval_hours || 24);
      setWindowDays(s.window_days || 30);
    } catch (e) {
      showNotice('err', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function act(key, fn, successMsg) {
    setBusy(key);
    try {
      const res = await fn();
      if (res?.enabled !== undefined) setScheduler(res);
      if (successMsg) showNotice('ok', successMsg);
    } catch (e) {
      showNotice('err', e.message);
    } finally {
      setBusy(null);
    }
  }

  async function handleIngest() {
    setIngesting(true);
    try {
      await triggerIngestion(windowDays, 'production');
      showNotice('ok', 'Ingestion triggered — check Learning Ops tab for results.');
    } catch (e) {
      showNotice('err', e.message);
    } finally {
      setIngesting(false);
    }
  }

  if (loading) return <EmptyState message="Loading system status…" />;

  const s   = scheduler || {};
  const ops = opsData   || {};
  const enabled = s.enabled ?? false;
  const dotColor = enabled ? C.green : 'var(--color-text-dim)';

  return (
    <div>
      {notice && <Notice message={notice.msg} type={notice.type} />}

      {/* Health Overview */}
      <Card
        title="System Health"
        description="Live counts from the learning pipeline. Clusters and alerts update after each ingestion cycle."
        action={<InlineBtn onClick={load} loading={loading}>{Icons.refresh} Refresh</InlineBtn>}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>
          <ClickStat
            label="Open Clusters"
            value={ops.open_clusters ?? ops.cluster_count ?? 0}
            hint={ops.open_clusters > 0 ? 'View →' : null}
            onClick={ops.open_clusters > 0 && onNavigateTo
              ? () => onNavigateTo({ tab: 'learning', panel: 'clusters', status: 'open' })
              : null}
          />
          <ClickStat
            label="Critical"
            value={ops.critical_clusters ?? 0}
            color={ops.critical_clusters > 0 ? C.red : undefined}
            hint={ops.critical_clusters > 0 ? 'View →' : null}
            urgent={ops.critical_clusters > 0}
            onClick={ops.critical_clusters > 0 && onNavigateTo
              ? () => onNavigateTo({ tab: 'learning', panel: 'clusters', status: 'open', severity: 'critical' })
              : null}
          />
          <ClickStat
            label="Pending Evals"
            value={ops.candidates_needing_eval ?? ops.pending_evaluations ?? 0}
            hint={ops.candidates_needing_eval > 0 ? 'View →' : null}
            onClick={ops.candidates_needing_eval > 0 && onNavigateTo
              ? () => onNavigateTo({ tab: 'learning', panel: 'clusters', status: 'open' })
              : null}
          />
          <Stat label="Active Monitors"  value={ops.active_monitoring_windows ?? 0} />
          <ClickStat
            label="Alerts"
            value={ops.active_alerts?.length ?? ops.alert_count ?? 0}
            color={(ops.active_alerts?.length || ops.alert_count || 0) > 0 ? C.red : C.green}
            hint={(ops.active_alerts?.length || ops.alert_count || 0) > 0 ? 'View →' : null}
            urgent={(ops.active_alerts?.length || ops.alert_count || 0) > 0}
            onClick={(ops.active_alerts?.length || ops.alert_count || 0) > 0 && onNavigateTo
              ? () => onNavigateTo({ tab: 'learning', panel: 'monitoring' })
              : null}
          />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-md)' }}>
          <StatusDot ok={enabled} label={`Scheduler: ${enabled ? 'running' : 'stopped'}`} />
          <StatusDot ok={(ops.open_clusters ?? 0) === 0} label={`${ops.open_clusters ?? 0} open failure clusters`} />
          <StatusDot ok={(ops.active_alerts?.length ?? 0) === 0} label="Monitoring alerts" />
        </div>
      </Card>

      {/* Scheduler Control */}
      <Card
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%', background: dotColor, display: 'inline-block', flexShrink: 0,
              boxShadow: enabled ? `0 0 6px ${dotColor}88` : 'none',
              animation: enabled ? 'pulse 2s ease-in-out infinite' : 'none',
            }} />
            Ingestion Scheduler
          </span>
        }
        description="Controls the background analytics ingestion loop. Ingestion feeds failure clusters, pattern signals, and the intelligence score. Runs automatically at the configured interval."
        action={
          <div style={{ display: 'flex', gap: 4 }}>
            <InlineBtn
              variant={enabled ? 'ghost' : 'primary'}
              onClick={() => enabled
                ? act('stop', stopScheduler, 'Scheduler stopped.')
                : act('start', () => startScheduler({ intervalHours, windowDays }), 'Scheduler started.')}
              loading={busy === 'stop' || busy === 'start'}
            >
              {enabled ? <>{Icons.stop} Stop</> : <>{Icons.play} Start</>}
            </InlineBtn>
            <InlineBtn
              onClick={() => act('run_now', runSchedulerNow, 'Run triggered — next cycle starting.')}
              loading={busy === 'run_now'}
            >
              {Icons.zap} Run Now
            </InlineBtn>
            <InlineBtn onClick={() => setConfigOpen(o => !o)}>
              Configure {configOpen ? Icons.chevronUp : Icons.chevronDown}
            </InlineBtn>
          </div>
        }
      >
        {/* Status row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-xs)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: configOpen ? 'var(--space-md)' : 0 }}>
          <div><span style={{ color: 'var(--color-text-dim)' }}>Interval:</span> {s.interval_hours ?? '—'}h</div>
          <div><span style={{ color: 'var(--color-text-dim)' }}>Window:</span> {s.window_days ?? '—'}d</div>
          <div><span style={{ color: 'var(--color-text-dim)' }}>Runs:</span> {s.run_count ?? 0}</div>
          <div><span style={{ color: 'var(--color-text-dim)' }}>Started by:</span> {s.started_by || '—'}</div>
          {s.last_run_at && (
            <div style={{ gridColumn: '1/-1' }}>
              <span style={{ color: 'var(--color-text-dim)' }}>Last run:</span>{' '}
              <span style={{ color: s.last_run_error ? C.red : C.green }}>{fmtTime(s.last_run_at)}</span>
              {s.last_run_error && <span style={{ color: C.red }}> — {s.last_run_error}</span>}
            </div>
          )}
          {s.next_run_at && (
            <div style={{ gridColumn: '1/-1' }}>
              <span style={{ color: 'var(--color-text-dim)' }}>Next run:</span> {fmtTime(s.next_run_at)}
            </div>
          )}
        </div>

        {/* Config panel */}
        {configOpen && (
          <div style={{
            background: 'var(--color-surface-elevated)', borderRadius: 'var(--radius-md)',
            padding: 'var(--space-sm) var(--space-md)', display: 'flex',
            gap: 'var(--space-md)', alignItems: 'center', flexWrap: 'wrap',
          }}>
            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
              Interval (h):
              <input type="number" min={1} max={168} value={intervalHours}
                onChange={e => setInterval(Number(e.target.value))}
                style={{ width: 60, padding: '3px 6px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 'var(--text-xs)' }}
              />
            </label>
            <label style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: 4 }}>
              Window (d):
              <input type="number" min={7} max={90} value={windowDays}
                onChange={e => setWindowDays(Number(e.target.value))}
                style={{ width: 60, padding: '3px 6px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)', fontSize: 'var(--text-xs)' }}
              />
            </label>
            <InlineBtn
              variant="primary"
              onClick={() => act('configure', () => configureScheduler({ intervalHours, windowDays }), 'Config saved.')}
              loading={busy === 'configure'}
            >
              {Icons.check} Apply
            </InlineBtn>
          </div>
        )}
      </Card>

      {/* Manual Ingestion */}
      <Card
        title="Manual Ingestion"
        description="Trigger a one-off analytics pass outside the scheduler cycle. Use this after seeding test data or when you need immediate cluster updates. Results appear in Learning Ops → Clusters."
      >
        <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center', flexWrap: 'wrap' }}>
          <InlineBtn variant="primary" onClick={handleIngest} loading={ingesting}>
            {Icons.play} Trigger Ingestion ({windowDays}d window)
          </InlineBtn>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)' }}>
            Runs ingestion → autonomy loop in sequence
          </span>
        </div>
      </Card>

      {/* VLM API Key Health */}
      <ApiKeyHealthCard />

      {/* VLM Call Metrics */}
      <VlmMetricsCard />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VLM CALL METRICS CARD
// ─────────────────────────────────────────────────────────────────────────────

function VlmMetricsCard() {
  const [hours, setHours] = useState(24);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [expandedCall, setExpandedCall] = useState(null);

  const fetchData = useCallback(() => {
    setLoading(true);
    setErr(null);
    getApiMetrics(hours)
      .then(d => { setData(d); setLastRefresh(new Date()); })
      .catch(e => setErr(e.message))
      .finally(() => setLoading(false));
  }, [hours]);

  useEffect(() => {
    fetchData();
    const timer = setInterval(fetchData, 30000); // auto-refresh every 30s
    return () => clearInterval(timer);
  }, [fetchData]);

  const errRate = data ? (data.error_rate * 100).toFixed(1) : null;
  const errColor = data
    ? data.errors === 0 ? C.green
      : data.error_rate < 0.05 ? C.amber
      : C.red
    : C.blue;

  return (
    <Card
      title="VLM Call Metrics"
      description={`Every image analysis calls the vision model (VLM). This card tracks call volume, latency, and errors. Auto-refreshes every 30s.`}
      action={
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {lastRefresh && (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)' }}>
              {lastRefresh.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          <button
            onClick={fetchData}
            disabled={loading}
            style={{
              fontSize: 'var(--text-xs)', padding: '2px 8px',
              background: 'var(--color-surface-elevated)',
              color: 'var(--color-text)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)', cursor: loading ? 'default' : 'pointer',
              opacity: loading ? 0.5 : 1,
            }}
          >
            {loading ? '…' : '↻ Refresh'}
          </button>
          <select
            value={hours}
            onChange={e => setHours(Number(e.target.value))}
            style={{
              fontSize: 'var(--text-xs)', padding: '2px 6px',
              background: 'var(--color-surface-elevated)',
              color: 'var(--color-text)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)', cursor: 'pointer',
            }}
          >
            {[6, 24, 48, 168].map(h => (
              <option key={h} value={h}>{h === 168 ? '7 days' : `${h}h`}</option>
            ))}
          </select>
        </div>
      }
    >
      {loading && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)' }}>Loading…</div>}
      {err && <div style={{ fontSize: 'var(--text-xs)', color: C.red }}>{err}</div>}
      {data && !loading && !data.vlm_configured && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 8,
          padding: '8px 12px', marginBottom: 'var(--space-sm)',
          background: '#6B728015', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)',
          color: 'var(--color-text-secondary)',
        }}>
          <span style={{ flexShrink: 0, marginTop: 1 }}>⚙</span>
          <span>
            VLM provider not configured — set <code style={{ fontFamily: 'var(--font-mono)' }}>VLM_PROVIDER</code> and an
            API key in <code style={{ fontFamily: 'var(--font-mono)' }}>.env</code> to enable call tracking.
            Analyses currently run in CV-only mode.
          </span>
        </div>
      )}
      {data && !loading && (
        <>
          {/* Key metrics row */}
          <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)', flexWrap: 'wrap' }}>
            {data.vlm_configured && data.vlm_provider && (
              <Stat label="Provider" value={data.vlm_model ? `${data.vlm_provider} / ${data.vlm_model}` : data.vlm_provider} />
            )}
            <Stat label="Total calls" value={data.total} />
            <Stat label="Errors" value={data.errors} color={data.errors > 0 ? C.red : C.green} />
            <Stat label="Error rate" value={errRate != null ? `${errRate}%` : '—'} color={errColor} />
            <Stat label="Avg latency" value={data.avg_latency_ms != null ? `${Math.round(data.avg_latency_ms)}ms` : '—'} />
            <Stat label="p95 latency" value={data.p95_latency_ms != null ? `${Math.round(data.p95_latency_ms)}ms` : '—'}
              color={data.p95_latency_ms > 10000 ? C.amber : 'var(--color-text)'} />
          </div>

          {/* Hourly sparkline (mini bar chart) */}
          {data.hourly && data.hourly.length > 0 && (() => {
            const max = Math.max(...data.hourly.map(b => b.count), 1);
            const bars = [...data.hourly].reverse(); // oldest first
            return (
              <div style={{ marginBottom: 'var(--space-md)' }}>
                <SectionTitle>Calls per hour (oldest → newest)</SectionTitle>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 40 }}>
                  {bars.map((b, i) => (
                    <div key={i} title={`${b.hours_ago}h ago: ${b.count}`} style={{
                      flex: 1, height: `${Math.max(2, (b.count / max) * 40)}px`,
                      background: b.count > 0 ? C.blue + 'aa' : 'var(--color-border)',
                      borderRadius: 1, transition: 'height 0.2s',
                    }} />
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Recent calls */}
          {data.total === 0 ? (
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)' }}>
              No VLM calls recorded in this window. Run an analysis to generate data.
            </div>
          ) : data.recent && data.recent.length > 0 && (
            <>
              <SectionTitle>Recent calls</SectionTitle>
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', fontSize: 'var(--text-xs)', borderCollapse: 'collapse', minWidth: 280 }}>
                <thead>
                  <tr style={{ color: 'var(--color-text-dim)', borderBottom: '1px solid var(--color-border)' }}>
                    <th style={{ textAlign: 'left', padding: '4px 6px', fontWeight: 'var(--weight-medium)' }}>Time</th>
                    <th style={{ textAlign: 'left', padding: '4px 6px', fontWeight: 'var(--weight-medium)' }}>Provider</th>
                    <th style={{ textAlign: 'right', padding: '4px 6px', fontWeight: 'var(--weight-medium)' }}>Latency</th>
                    <th style={{ textAlign: 'center', padding: '4px 6px', fontWeight: 'var(--weight-medium)' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent.map(c => {
                    const isExpanded = expandedCall === c.id;
                    return (
                      <>
                        <tr
                          key={c.id}
                          onClick={() => setExpandedCall(isExpanded ? null : c.id)}
                          style={{
                            borderBottom: isExpanded ? 'none' : '1px solid var(--color-border)',
                            cursor: 'pointer',
                            background: isExpanded ? 'var(--color-surface-elevated)' : undefined,
                          }}
                          title="Click to expand details"
                        >
                          <td style={{ padding: '4px 6px', color: 'var(--color-text-dim)' }}>
                            {new Date(c.called_at * 1000).toLocaleTimeString(undefined, { timeZone: _DEVICE_TZ, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </td>
                          <td style={{ padding: '4px 6px', fontFamily: 'var(--font-mono)' }}>
                            {c.provider}{c.model ? `/${c.model}` : ''}
                          </td>
                          <td style={{ padding: '4px 6px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                            {c.latency_ms != null ? `${Math.round(c.latency_ms)}ms` : '—'}
                          </td>
                          <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                            {c.ok ? (
                              <span style={{ color: C.green }}>✓</span>
                            ) : (
                              <span style={{ color: C.red }}>✗</span>
                            )}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr key={`${c.id}-detail`} style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface-elevated)' }}>
                            <td colSpan={4} style={{ padding: '4px 12px 8px', fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)' }}>
                              <span><strong>Time:</strong> {new Date(c.called_at * 1000).toLocaleString(undefined, { timeZone: _DEVICE_TZ })}</span>
                              {c.caller && <span style={{ marginLeft: 12 }}><strong>Caller:</strong> {c.caller}</span>}
                              {!c.ok && c.error && (
                                <div style={{ marginTop: 4, color: C.red, fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
                                  <strong>Error:</strong> {c.error}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </>
          )}
        </>
      )}
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INTELLIGENCE SECTION
// ─────────────────────────────────────────────────────────────────────────────

function IntelligenceSection({ user, onNavigateTo }) {
  const [scoreData, setScoreData]     = useState(null);
  const [scoreHistory, setScoreHistory] = useState([]);
  const [autoDash, setAutoDash]       = useState(null);
  const [autoQueue, setAutoQueue]     = useState(null);
  const [autoLog, setAutoLog]         = useState(null);
  const [clusters, setClusters]       = useState(null);
  const [clusterFilter, setClusterFilter] = useState('all');
  const [patterns, setPatterns]       = useState(null);
  const [loading, setLoading]         = useState(true);
  const [notice, setNotice]           = useState(null);
  const [busy, setBusy]               = useState(null);
  const [subTab, setSubTab]           = useState('score');
  const [authRequired, setAuthRequired] = useState(false);
  const [expandedPat, setExpandedPat] = useState(null);

  function showNotice(type, msg) {
    setNotice({ type, msg });
    setTimeout(() => setNotice(null), 5000);
  }

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Fire all 7 calls in parallel — admin-only endpoints degrade gracefully on 401.
      // Previously two sequential Promise.all() tiers; now one round-trip saves ~200-400ms.
      const [scoreR, patsR, histR, dashR, queueR, logR, clustR] = await Promise.allSettled([
        getIntelligenceScore(30, false),
        getIntelligencePatterns(30, false),
        getIntelligenceScoreHistory(30, 30),
        getAutonomyDashboard(7),
        getAutonomyQueue(),
        getAutonomyLog({ limit: 30 }),
        getIntelligenceClusters(30),
      ]);

      // Public endpoints — errors here are real failures
      if (scoreR.status === 'fulfilled') setScoreData(scoreR.value);
      else showNotice('err', scoreR.reason?.message ?? 'Score load failed');
      if (patsR.status === 'fulfilled') setPatterns(patsR.value?.patterns || []);
      if (histR.status === 'fulfilled') setScoreHistory((histR.value?.history || histR.value || []).slice(-20));

      // Admin-only endpoints — 401 = not authorized (graceful degrade)
      const adminOk = [dashR, queueR, logR, clustR].every(r => r.status === 'fulfilled');
      if (adminOk) {
        setAutoDash(dashR.value);
        setAutoQueue(queueR.value);
        setAutoLog(logR.value);
        setClusters(clustR.value);
        setAuthRequired(false);
      } else {
        setAuthRequired(true);
      }
    } catch (e) {
      showNotice('err', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleForceCompute() {
    setBusy('compute');
    try {
      const [res, hist] = await Promise.all([
        forceComputeIntelligence(30),
        getIntelligenceScoreHistory(30, 30),
      ]);
      setScoreData(res.global_score);
      setPatterns(res.patterns || []);
      setScoreHistory((hist?.history || hist || []).slice(-20));
      showNotice('ok', `Score recomputed: ${Math.round(res.global_score?.score ?? 0)} — ${res.pattern_count} patterns.`);
    } catch (e) {
      showNotice('err', e.message);
    } finally {
      setBusy(null);
    }
  }

  async function handleRunAutonomy() {
    setBusy('autonomy');
    try {
      const res = await runAutonomyLoop(30);
      showNotice('ok', `Autonomy pass complete — auto-applied: ${res.auto_applied ?? 0}, queued: ${res.queued_for_review ?? 0}`);
      const q = await getAutonomyQueue();
      setAutoQueue(q);
    } catch (e) {
      showNotice('err', e.message);
    } finally {
      setBusy(null);
    }
  }

  async function handleApprove(actionId) {
    setBusy('approve_' + actionId);
    try {
      await approveAutonomyAction(actionId, user?.email || 'admin');
      showNotice('ok', 'Action approved and applied.');
      const q = await getAutonomyQueue();
      setAutoQueue(q);
    } catch (e) {
      showNotice('err', e.message);
    } finally {
      setBusy(null);
    }
  }

  async function handleReject(actionId) {
    setBusy('reject_' + actionId);
    try {
      await rejectAutonomyAction(actionId, user?.email || 'admin', 'Rejected via Control Center');
      showNotice('ok', 'Action rejected.');
      const q = await getAutonomyQueue();
      setAutoQueue(q);
    } catch (e) {
      showNotice('err', e.message);
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <EmptyState message="Loading intelligence data…" />;

  const score    = scoreData;
  const queue    = autoQueue?.queue || [];
  const log      = autoLog?.log    || [];
  const dash     = autoDash         || {};

  const SUB_TABS = [
    { id: 'score',     label: 'Score' },
    { id: 'autonomy',  label: `Autonomy${queue.length > 0 ? ` (${queue.length})` : ''}` },
    { id: 'clusters',  label: 'Clusters' },
    { id: 'patterns',  label: 'Patterns' },
  ];

  return (
    <div>
      {notice && <Notice message={notice.msg} type={notice.type} />}

      {/* Sub-tab nav */}
      <div className="lab-tabs" style={{ marginBottom: 'var(--space-md)' }}>
        {SUB_TABS.map(t => (
          <button key={t.id} type="button"
            className={`lab-tab${subTab === t.id ? ' lab-tab--active' : ''}`}
            onClick={() => setSubTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Score ── */}
      {subTab === 'score' && (
        <div>
          <Card
            title="Global Intelligence Score"
            description="Composite metric from live user outcomes. Formula: (nailed_it × 40) − (missed_it × 30) − (high_conf_miss × 20) + confidence_alignment + signal_quality. Target ≥ 70. Score of 50 = insufficient data."
            action={
              <InlineBtn variant="primary" onClick={handleForceCompute} loading={busy === 'compute'}>
                {Icons.refresh} Recompute
              </InlineBtn>
            }
          >
            <div style={{ display: 'flex', gap: 'var(--space-xl)', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <ScoreGauge
                score={score?.score}
                interpretation={score?.interpretation}
                insufficient={score?.components?.insufficient_data}
              />
              <div style={{ flex: 1, minWidth: 220 }}>
                {/* Component breakdown with labeled bars */}
                {score?.components ? (() => {
                  const COMP_META = {
                    nailed_it_rate:        { label: 'Nailed-it rate',        dir: 'good',  weight: 40 },
                    missed_it_rate:        { label: 'Missed-it rate',         dir: 'bad',   weight: 30 },
                    high_conf_missed_rate: { label: 'High-conf miss rate',    dir: 'bad',   weight: 20 },
                    confidence_alignment:  { label: 'Confidence alignment',   dir: 'good',  weight: 10 },
                    signal_quality_avg:    { label: 'Signal quality avg',     dir: 'good',  weight: null },
                    total_outcomes:        { label: 'Total outcomes',         dir: null,    weight: null },
                    total_nailed_it:       { label: 'Nailed-it count',        dir: null,    weight: null },
                    total_missed_it:       { label: 'Missed-it count',        dir: null,    weight: null },
                  };
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {Object.entries(score.components)
                        .filter(([k]) => k !== 'insufficient_data' && COMP_META[k])
                        .map(([k, v]) => {
                          const meta = COMP_META[k] || {};
                          const isRate = typeof v === 'number' && v <= 1 && v >= 0 && meta.weight != null;
                          const barPct = isRate ? Math.round(v * 100) : null;
                          const barColor = !meta.dir ? C.blue
                            : meta.dir === 'good' ? (barPct >= 60 ? C.green : barPct >= 30 ? C.amber : C.red)
                            : (barPct <= 20 ? C.green : barPct <= 40 ? C.amber : C.red);
                          return (
                            <div key={k} style={{ fontSize: 'var(--text-xs)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                                <span style={{ color: 'var(--color-text-dim)' }}>
                                  {meta.label || k.replace(/_/g, ' ')}
                                  {meta.weight != null && <span style={{ color: 'var(--color-text-secondary)', marginLeft: 4 }}>×{meta.weight}</span>}
                                </span>
                                <span style={{ fontWeight: 'var(--weight-semibold)', color: barColor || 'var(--color-text)' }}>
                                  {isRate ? `${barPct}%` : typeof v === 'number' ? v : String(v)}
                                </span>
                              </div>
                              {barPct != null && (
                                <div style={{ height: 4, background: 'var(--color-surface-elevated)', borderRadius: 2, overflow: 'hidden' }}>
                                  <div style={{ width: `${barPct}%`, height: '100%', background: barColor, borderRadius: 2, transition: 'width 0.3s' }} />
                                </div>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  );
                })() : (
                  <EmptyState message="No component data yet" />
                )}
                {score?.computed_at && (
                  <div style={{ marginTop: 'var(--space-sm)', fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)' }}>
                    Computed {fmtTime(score.computed_at)}{score.cached ? ' · cached' : ''}
                    {score.components?.total_outcomes != null && ` · ${score.components.total_outcomes} outcomes`}
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Score trend sparkline */}
          {scoreHistory.length > 1 && (
            <Card title="Score Trend (last 30 days)">
              {(() => {
                const W = 360, H = 56, PAD = 8;
                const scores = scoreHistory.map(h => h.score ?? 50);
                const mn = Math.min(...scores, 0), mx = Math.max(...scores, 100);
                const range = mx - mn || 1;
                const pts = scores.map((s, i) => {
                  const x = PAD + (i / (scores.length - 1)) * (W - PAD * 2);
                  const y = PAD + (1 - (s - mn) / range) * (H - PAD * 2);
                  return `${x.toFixed(1)},${y.toFixed(1)}`;
                }).join(' ');
                const latest = scores[scores.length - 1];
                const lineColor = pctColor(latest);
                return (
                  <div style={{ overflowX: 'auto' }}>
                    <svg width={W} height={H} style={{ display: 'block' }}>
                      {/* 70-target line */}
                      {(() => { const ty = PAD + (1 - (70 - mn) / range) * (H - PAD * 2); return (
                        <line x1={PAD} y1={ty} x2={W - PAD} y2={ty}
                          stroke={C.green} strokeWidth={0.5} strokeDasharray="3,3" opacity={0.4} />
                      ); })()}
                      <polyline points={pts} fill="none" stroke={lineColor} strokeWidth={2} strokeLinejoin="round" />
                      {/* Latest dot */}
                      {(() => {
                        const [lx, ly] = pts.split(' ').at(-1).split(',').map(Number);
                        return <circle cx={lx} cy={ly} r={3} fill={lineColor} />;
                      })()}
                    </svg>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--color-text-dim)', padding: `0 ${PAD}px` }}>
                      <span>{scoreHistory[0]?.computed_at ? new Date(scoreHistory[0].computed_at * 1000).toLocaleDateString(undefined, { timeZone: _DEVICE_TZ, month: 'short', day: 'numeric' }) : '30d ago'}</span>
                      <span style={{ color: lineColor, fontWeight: 700 }}>{latest.toFixed(1)} now</span>
                    </div>
                  </div>
                );
              })()}
            </Card>
          )}

          {/* 7-day autonomy summary */}
          {!authRequired ? (
            <Card
              title="Autonomy Activity (7 days)"
              description="Summary of the autonomous optimization loop. LOW-risk decisions are auto-applied; MEDIUM/HIGH risk are queued for review in the Autonomy tab."
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-sm)' }}>
                <Stat label="Auto-applied"   value={dash.auto_applied   ?? 0} color={C.green} />
                <Stat label="Queued"         value={dash.queued         ?? 0} color={C.amber} />
                <Stat label="Rejected"       value={dash.rejected       ?? 0} color={C.red} />
                <Stat label="Rollbacks"      value={dash.rollbacks      ?? 0} color={C.red} />
                <Stat label="Guardrail Hits" value={dash.guardrail_trips ?? 0} color={C.amber} />
              </div>
            </Card>
          ) : (
            <Notice message="Autonomy dashboard requires admin authentication. Sign in with a whitelisted dev email." type="info" />
          )}
        </div>
      )}

      {/* ── Autonomy ── */}
      {subTab === 'autonomy' && (
        <div>
          {authRequired ? (
            <Notice message="Autonomy queue requires admin authentication (NGW_DEV_EMAILS). Sign in to approve or reject queued actions." type="info" />
          ) : (
            <>
              <Card
                title={`Pending Review Queue (${queue.length})`}
                description="MEDIUM and HIGH risk autonomy decisions awaiting human review. These are changes that exceed the auto-apply confidence threshold and require explicit approval before being applied to the system."
                action={
                  <div style={{ display: 'flex', gap: 4 }}>
                    <InlineBtn variant="primary" onClick={handleRunAutonomy} loading={busy === 'autonomy'}>
                      {Icons.zap} Run Loop
                    </InlineBtn>
                    <InlineBtn onClick={load}>{Icons.refresh}</InlineBtn>
                  </div>
                }
              >
                {queue.length === 0 ? (
                  <EmptyState message="Queue is clear — no pending actions." />
                ) : (
                  queue.map(action => {
                    const id = action.id || action.action_id;
                    const isHigh = (action.risk_tier || '').toUpperCase() === 'HIGH';
                    return (
                      <div key={id} style={{
                        background: 'var(--color-surface-elevated)', borderRadius: 'var(--radius-md)',
                        padding: 'var(--space-sm) var(--space-md)', marginBottom: 'var(--space-xs)',
                        border: `1px solid ${isHigh ? C.red + '22' : C.amber + '22'}`,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                          <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text)' }}>
                            {action.action_type || action.type}
                          </div>
                          <Badge label={action.risk_tier || 'MEDIUM'} color={isHigh ? C.red : C.amber} />
                        </div>
                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginBottom: 6 }}>
                          {action.description || action.rationale || '—'}
                        </div>
                        {action.pattern_id && (
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)', marginBottom: 6 }}>
                            Pattern: <code>{action.pattern_id}</code>
                          </div>
                        )}
                        <div style={{ display: 'flex', gap: 4 }}>
                          <InlineBtn variant="primary" onClick={() => handleApprove(id)} loading={busy === 'approve_' + id}>
                            {Icons.check} Approve
                          </InlineBtn>
                          <InlineBtn onClick={() => handleReject(id)} loading={busy === 'reject_' + id}>
                            {Icons.x} Reject
                          </InlineBtn>
                        </div>
                      </div>
                    );
                  })
                )}
              </Card>

              <Card
                title="Audit Log (last 30)"
                description="Complete record of all autonomy decisions — auto-applied, queued, approved, and rejected."
              >
                {log.length === 0 ? (
                  <EmptyState message="No audit entries yet." />
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-dim)', textAlign: 'left' }}>
                          <th style={{ padding: '4px 8px' }}>Action</th>
                          <th style={{ padding: '4px 8px' }}>Risk</th>
                          <th style={{ padding: '4px 8px' }}>Status</th>
                          <th style={{ padding: '4px 8px' }}>Pattern</th>
                          <th style={{ padding: '4px 8px' }}>When</th>
                        </tr>
                      </thead>
                      <tbody>
                        {log.map((e, i) => {
                          const sc = e.status === 'applied' ? C.green : e.status === 'rejected' ? C.red : C.amber;
                          const rc = (e.risk_tier || '').toUpperCase() === 'HIGH' ? C.red : (e.risk_tier || '').toUpperCase() === 'MEDIUM' ? C.amber : C.green;
                          return (
                            <tr key={i} style={{ borderBottom: '1px solid var(--color-border)' }}>
                              <td style={{ padding: '4px 8px', color: 'var(--color-text)' }}>{e.action_type || e.type || '—'}</td>
                              <td style={{ padding: '4px 8px' }}><Badge label={e.risk_tier || '?'} color={rc} /></td>
                              <td style={{ padding: '4px 8px' }}><Badge label={e.status || '?'} color={sc} /></td>
                              <td style={{ padding: '4px 8px', color: 'var(--color-text-secondary)' }}>{e.pattern_id || '—'}</td>
                              <td style={{ padding: '4px 8px', color: 'var(--color-text-dim)' }}>{fmtTime(e.created_at)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      )}

      {/* ── Clusters ── */}
      {subTab === 'clusters' && (
        <Card
          title="Failure & Success Clusters (30d)"
          description="Clusters are groups of similar outcome signals detected by the ingestion pipeline. Failure clusters (repeated missed-it patterns) generate rule candidates. Each cluster shows a safety indicator based on severity and event count."
        >
          {authRequired ? (
            <Notice message="Cluster report requires admin authentication. Sign in with a whitelisted dev email to view." type="info" />
          ) : !clusters ? (
            <EmptyState message="No cluster data." />
          ) : (
            (() => {
              const fail = (clusters.failure_clusters || []).map(c => ({ ...c, _type: 'failure' }));
              const succ = (clusters.success_clusters || []).map(c => ({ ...c, _type: 'success' }));
              const allClusters = [...fail, ...succ];
              if (allClusters.length === 0) return <EmptyState message="No clusters in the last 30 days." />;
              const visible = clusterFilter === 'failure' ? fail
                : clusterFilter === 'success' ? succ
                : allClusters;
              return (
                <div>
                  {/* Summary stats + filter */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-md)', flexWrap: 'wrap', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
                      <Stat label="Failure" value={fail.length} color={C.red} />
                      <Stat label="Success" value={succ.length} color={C.green} />
                      <Stat label="Patterns" value={clusters.pattern_count ?? '—'} />
                    </div>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {['all', 'failure', 'success'].map(f => (
                        <button key={f} type="button"
                          style={{
                            padding: '3px 10px', borderRadius: 'var(--radius-sm)',
                            fontSize: 'var(--text-xs)', cursor: 'pointer',
                            fontWeight: clusterFilter === f ? 700 : 400,
                            background: clusterFilter === f ? (f === 'failure' ? C.redBg : f === 'success' ? C.greenBg : 'var(--color-surface-elevated)') : 'transparent',
                            color: clusterFilter === f ? (f === 'failure' ? C.red : f === 'success' ? C.green : 'var(--color-text)') : 'var(--color-text-secondary)',
                            border: `1px solid ${clusterFilter === f ? (f === 'failure' ? C.red + '55' : f === 'success' ? C.green + '55' : 'var(--color-border)') : 'var(--color-border)'}`,
                          }}
                          onClick={() => setClusterFilter(f)}
                        >{f.charAt(0).toUpperCase() + f.slice(1)}</button>
                      ))}
                    </div>
                  </div>

                  {visible.length === 0 ? (
                    <EmptyState message={`No ${clusterFilter} clusters.`} />
                  ) : visible.map((c, i) => {
                    const safeColor = c.safe === true ? C.green : c.safe === false ? C.red : C.muted;
                    const safeLabel = c.safe === true ? 'Safe' : c.safe === false ? 'At risk' : 'No data';
                    const sevPct = c.severity != null ? Math.min(100, Math.round(c.severity * 100)) : null;
                    return (
                      <div key={i} style={{
                        background: 'var(--color-surface-elevated)', borderRadius: 'var(--radius-md)',
                        padding: 'var(--space-sm) var(--space-md)', marginBottom: 6,
                        borderLeft: `3px solid ${safeColor}`,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text)' }}>
                            {c.pattern_id || c.cluster_key || `Cluster ${i + 1}`}
                          </span>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <Badge label={c._type === 'failure' ? 'Failure' : 'Success'} color={c._type === 'failure' ? C.red : C.green} />
                            <Badge label={safeLabel} color={safeColor} />
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 'var(--space-md)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', flexWrap: 'wrap', marginBottom: 6 }}>
                          {c.event_count != null && <span>Events: <strong style={{ color: 'var(--color-text)' }}>{c.event_count}</strong></span>}
                          {c.count != null && <span>Count: <strong style={{ color: 'var(--color-text)' }}>{c.count}</strong></span>}
                          {c.high_conf_rate != null && <span>High-conf: <strong style={{ color: c.high_conf_rate >= 0.3 ? C.red : 'var(--color-text)' }}>{(c.high_conf_rate * 100).toFixed(0)}%</strong></span>}
                          {c.status && <span>Status: <strong style={{ color: 'var(--color-text)' }}>{c.status}</strong></span>}
                        </div>
                        {/* Severity bar */}
                        {sevPct != null && (
                          <div style={{ marginBottom: 6 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--color-text-dim)', marginBottom: 2 }}>
                              <span>Severity</span><span>{typeof c.severity === 'number' ? c.severity.toFixed(2) : c.severity}</span>
                            </div>
                            <div style={{ height: 3, background: 'var(--color-surface)', borderRadius: 2, overflow: 'hidden' }}>
                              <div style={{ width: `${sevPct}%`, height: '100%', background: sevPct >= 60 ? C.red : sevPct >= 30 ? C.amber : C.green, borderRadius: 2 }} />
                            </div>
                          </div>
                        )}
                        {/* Actions */}
                        {onNavigateTo && (c.pattern_id || c.cluster_key) && (
                          <InlineBtn
                            onClick={() => onNavigateTo({ tab: 'learning', panel: 'clusters', patternId: c.pattern_id || c.cluster_key })}
                            style={{ marginTop: 2 }}
                          >
                            View in Learning →
                          </InlineBtn>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()
          )}
        </Card>
      )}

      {/* ── Patterns ── */}
      {subTab === 'patterns' && (
        <Card
          title="Per-Pattern Intelligence Scores"
          description="Scores computed per lighting pattern from live nailed-it / missed-it outcomes. Patterns below the 10-outcome threshold are flagged as insufficient. Sorted worst-first — p1_critical patterns appear at top."
          action={
            <InlineBtn onClick={handleForceCompute} loading={busy === 'compute'}>
              {Icons.refresh} Recompute
            </InlineBtn>
          }
        >
          {!patterns || patterns.length === 0 ? (
            <EmptyState message="No pattern scores yet — run an ingestion pass first." />
          ) : (() => {
            const sorted = [...patterns].sort((a, b) => {
              const prioOrder = { p1_critical: 0, p2_high: 1, p3_medium: 2, p4_monitor: 3 };
              const pa = prioOrder[a.priority_level || a.priority] ?? 4;
              const pb = prioOrder[b.priority_level || b.priority] ?? 4;
              return pa !== pb ? pa - pb : (a.score ?? 50) - (b.score ?? 50);
            });

            // Tier summary banner
            const tierCounts = { critical: 0, high: 0, monitor: 0, healthy: 0 };
            sorted.forEach(p => {
              const pl = p.priority_level || '';
              if (pl === 'p1_critical') tierCounts.critical++;
              else if (pl === 'p2_high') tierCounts.high++;
              else if (pl === 'p3_medium') tierCounts.monitor++;
              else tierCounts.healthy++;
            });

            return (
              <div>
                {/* Tier summary */}
                <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)', flexWrap: 'wrap' }}>
                  {tierCounts.critical > 0 && <Stat label="P1 Critical" value={tierCounts.critical} color={C.red} />}
                  {tierCounts.high > 0     && <Stat label="P2 High"     value={tierCounts.high}     color={C.amber} />}
                  {tierCounts.monitor > 0  && <Stat label="P3 Medium"   value={tierCounts.monitor}  color={C.blue} />}
                  <Stat label="Healthy" value={tierCounts.healthy} color={C.green} />
                  <Stat label="Total" value={sorted.length} />
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-dim)', textAlign: 'left' }}>
                        <th style={{ padding: '4px 8px' }}>Pattern</th>
                        <th style={{ padding: '4px 8px', minWidth: 100 }}>Score</th>
                        <th style={{ padding: '4px 8px', textAlign: 'right' }}>✓ Nailed</th>
                        <th style={{ padding: '4px 8px', textAlign: 'right' }}>✗ Missed</th>
                        <th style={{ padding: '4px 8px', textAlign: 'right' }}>Uses</th>
                        <th style={{ padding: '4px 8px' }}>Priority</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((p, i) => {
                        const sc   = p.score ?? 50;
                        const color = pctColor(sc);
                        const key  = p.pattern_id || p.pattern || i;
                        const isExpanded = expandedPat === key;
                        const priLabel = (p.priority_level || p.priority || '').replace('_', ' ').toUpperCase();
                        const priColor = (p.priority_level || '').startsWith('p1') ? C.red
                          : (p.priority_level || '').startsWith('p2') ? C.amber
                          : (p.priority_level || '').startsWith('p3') ? C.blue : C.green;
                        const nailedPct = p.nailed_it_rate != null ? Math.round(p.nailed_it_rate * 100) : null;
                        const missedPct = p.missed_it_rate != null ? Math.round(p.missed_it_rate * 100) : null;
                        const uses = p.usage_count ?? p.event_count;

                        return (
                          <>
                            <tr key={key}
                              style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer',
                                background: isExpanded ? 'var(--color-surface-elevated)' : 'transparent' }}
                              onClick={() => setExpandedPat(e => e === key ? null : key)}
                            >
                              <td style={{ padding: '5px 8px', color: 'var(--color-text)', fontWeight: 'var(--weight-semibold)' }}>
                                <span style={{ marginRight: 4, color: 'var(--color-text-dim)', fontSize: 10 }}>{isExpanded ? '▾' : '▸'}</span>
                                {key}
                                {(p.insufficient_data || !p.sufficient_data) && (
                                  <span style={{ marginLeft: 5, color: C.amber, fontSize: 9 }}>low data</span>
                                )}
                              </td>
                              <td style={{ padding: '5px 8px', minWidth: 100 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ color, fontWeight: 'var(--weight-bold)', minWidth: 30 }}>{sc.toFixed(1)}</span>
                                  <div style={{ flex: 1, height: 4, background: 'var(--color-surface-elevated)', borderRadius: 2, overflow: 'hidden' }}>
                                    <div style={{ width: `${Math.min(100, sc)}%`, height: '100%', background: color, borderRadius: 2 }} />
                                  </div>
                                </div>
                              </td>
                              <td style={{ padding: '5px 8px', textAlign: 'right', color: nailedPct != null ? (nailedPct >= 60 ? C.green : nailedPct >= 40 ? C.amber : C.red) : 'var(--color-text-dim)' }}>
                                {nailedPct != null ? `${nailedPct}%` : '—'}
                              </td>
                              <td style={{ padding: '5px 8px', textAlign: 'right', color: missedPct != null ? (missedPct <= 20 ? C.green : missedPct <= 40 ? C.amber : C.red) : 'var(--color-text-dim)' }}>
                                {missedPct != null ? `${missedPct}%` : '—'}
                              </td>
                              <td style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--color-text-secondary)' }}>
                                {uses ?? '—'}
                              </td>
                              <td style={{ padding: '5px 8px' }}>
                                {priLabel && <Badge label={priLabel} color={priColor} />}
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr key={`${key}__expand`}>
                                <td colSpan={6} style={{ padding: 0 }}>
                                  <div style={{
                                    background: 'var(--color-surface)', borderTop: '1px solid var(--color-border)',
                                    padding: 'var(--space-sm) var(--space-md)', fontSize: 'var(--text-xs)',
                                  }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '6px 16px', marginBottom: 8 }}>
                                      {p.interpretation && (
                                        <div><span style={{ color: 'var(--color-text-dim)', display: 'block' }}>Interpretation</span>
                                          <span style={{ color, fontWeight: 600 }}>{p.interpretation}</span></div>
                                      )}
                                      {p.high_conf_missed_rate != null && (
                                        <div><span style={{ color: 'var(--color-text-dim)', display: 'block' }}>High-conf miss</span>
                                          <span style={{ color: p.high_conf_missed_rate >= 0.2 ? C.red : C.amber }}>
                                            {(p.high_conf_missed_rate * 100).toFixed(0)}%
                                          </span></div>
                                      )}
                                      {p.confidence_alignment != null && (
                                        <div><span style={{ color: 'var(--color-text-dim)', display: 'block' }}>Conf alignment</span>
                                          <span style={{ color: 'var(--color-text)' }}>{(p.confidence_alignment * 100).toFixed(0)}%</span></div>
                                      )}
                                      {p.signal_quality_avg != null && (
                                        <div><span style={{ color: 'var(--color-text-dim)', display: 'block' }}>Signal quality</span>
                                          <span style={{ color: 'var(--color-text)' }}>{(p.signal_quality_avg * 100).toFixed(0)}%</span></div>
                                      )}
                                      {uses != null && uses < 10 && (
                                        <div style={{ gridColumn: '1 / -1' }}>
                                          <span style={{ color: C.amber }}>⚠ Only {uses} outcomes — score may be unreliable (need ≥10)</span>
                                        </div>
                                      )}
                                      {(p.priority_level || '').startsWith('p1') && (
                                        <div style={{ gridColumn: '1 / -1' }}>
                                          <span style={{ color: C.red }}>P1 Critical — high-volume pattern with low accuracy. Needs immediate attention.</span>
                                        </div>
                                      )}
                                    </div>
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                      {onNavigateTo && (
                                        <InlineBtn onClick={() => onNavigateTo({ tab: 'learning', panel: 'clusters', patternId: p.pattern_id || p.pattern })}>
                                          Clusters →
                                        </InlineBtn>
                                      )}
                                      <InlineBtn
                                        loading={busy === `compute_${key}`}
                                        onClick={async () => {
                                          setBusy(`compute_${key}`);
                                          try { await forceComputeIntelligence(30); showNotice('ok', `Recomputed ${key}`); load(); }
                                          catch (e) { showNotice('err', e.message); }
                                          finally { setBusy(null); }
                                        }}
                                      >Force Compute</InlineBtn>
                                      {onNavigateTo && (
                                        <InlineBtn onClick={() => onNavigateTo({ tab: 'learning', panel: 'knowledge', patternId: p.pattern_id || p.pattern })}>
                                          Knowledge →
                                        </InlineBtn>
                                      )}
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
              </div>
            );
          })()}
        </Card>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAYWALL SECTION
// ─────────────────────────────────────────────────────────────────────────────

const VALUE_STATES = [
  { key: 'success_moment',  price: 59, label: 'Success Moment',  color: C.green, signals: 'recent_outcome=nailed_it',   desc: 'User confirmed a great result. Highest intent — outcome-anchor CTA, urgency line, $59.' },
  { key: 'failure_tension', price: 39, label: 'Failure Tension',  color: C.red, signals: 'recent_outcome=missed_it',   desc: 'User got a bad result. Fix-focused urgency messaging, $39.' },
  { key: 'high_intent',     price: 59, label: 'High Intent',      color: C.blue, signals: 'shoot_mode=true OR usage≥5', desc: 'User attempted Shoot Mode or has 5+ analyses. Workflow value frame, $59.' },
  { key: 'discovery',       price: 39, label: 'Discovery',        color: C.amber, signals: 'usage≥3, session≥2',         desc: '3+ analyses, 2+ sessions. Learning progress frame, $39.' },
  { key: 'low_value',       price: 39, label: 'Low Value',        color: C.muted, signals: 'fallback',                   desc: 'Default state. Exploration frame, $39. Anti-discount guardrail holds session max.' },
];

const PAYWALL_TYPES = [
  { type: 'hard',           desc: 'Full blur + block. No bypass. Fires when analysis count ≥ threshold (default 3).' },
  { type: 'soft',           desc: 'Blur + "Continue without upgrading" once. Lower friction for exploration.' },
  { type: 'value_triggered', desc: 'Fires on success/failure moments. No blur — celebratory, not blocking.' },
  { type: 'nudge',           desc: 'Non-blocking inline prompt. Shows gated content beneath. Fires at analysis ≥ 2.' },
];

function PaywallSection() {
  const [liveTest, setLiveTest]   = useState(null);
  const [testState, setTestState] = useState('success_moment');
  const [testing, setTesting]     = useState(false);
  const [notice, setNotice]       = useState(null);
  const [subTab, setSubTab]       = useState('states');

  function showNotice(type, msg) {
    setNotice({ type, msg });
    setTimeout(() => setNotice(null), 5000);
  }

  const SIGNAL_MAP = {
    success_moment:  { recent_outcome: 'nailed_it', usage_count: 8, session_count: 3 },
    failure_tension: { recent_outcome: 'missed_it', usage_count: 4 },
    high_intent:     { shoot_mode_used: true, usage_count: 6, session_count: 4 },
    discovery:       { usage_count: 3, session_count: 2 },
    low_value:       { usage_count: 1 },
  };

  async function handleLiveTest() {
    setTesting(true);
    setLiveTest(null);
    try {
      const { apiFetch } = await import('../../lib/apiClient');
      const { getToken }  = await import('../../data/authApi');
      const token = getToken();
      const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
      const body = SIGNAL_MAP[testState] || {};
      const res  = await apiFetch('/api/paywall/adaptive-pricing', { method: 'POST', headers, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Request failed');
      setLiveTest(data);
    } catch (e) {
      showNotice('err', e.message);
    } finally {
      setTesting(false);
    }
  }

  const SUB_TABS = [
    { id: 'states', label: 'Value States' },
    { id: 'types',  label: 'Paywall Types' },
    { id: 'test',   label: 'Live Test' },
  ];

  return (
    <div>
      {notice && <Notice message={notice.msg} type={notice.type} />}

      <div className="lab-tabs" style={{ marginBottom: 'var(--space-md)' }}>
        {SUB_TABS.map(t => (
          <button key={t.id} type="button"
            className={`lab-tab${subTab === t.id ? ' lab-tab--active' : ''}`}
            onClick={() => setSubTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Value States ── */}
      {subTab === 'states' && (
        <Card
          title="Value State Map"
          description="The adaptive paywall detects a user's value state from session signals and selects price + messaging accordingly. The anti-discount guardrail ensures the session price never drops once shown — preventing anchoring down."
        >
          {VALUE_STATES.map(s => (
            <div key={s.key} style={{
              borderLeft: `3px solid ${s.color}`,
              background: 'var(--color-surface-elevated)',
              borderRadius: `0 var(--radius-md) var(--radius-md) 0`,
              padding: 'var(--space-sm) var(--space-md)',
              marginBottom: 4,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <span style={{ fontWeight: 'var(--weight-semibold)', fontSize: 'var(--text-sm)', color: s.color }}>
                    {s.label}
                  </span>
                  <code style={{ marginLeft: 8, fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)' }}>
                    {s.key}
                  </code>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                    {s.desc}
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)', marginTop: 2 }}>
                    Signals: <code>{s.signals}</code>
                  </div>
                </div>
                <Badge label={`$${s.price}/mo`} color={s.color} />
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* ── Types ── */}
      {subTab === 'types' && (
        <Card
          title="Paywall Types"
          description="Type is selected per trigger event. The type controls the visual treatment — blur, blocking, and bypass availability. Copy and price always come from the value state, independent of type."
        >
          {PAYWALL_TYPES.map(t => (
            <div key={t.type} style={{
              display: 'flex', gap: 'var(--space-md)', alignItems: 'flex-start',
              padding: '10px 0', borderBottom: '1px solid var(--color-border)',
              fontSize: 'var(--text-xs)',
            }}>
              <code style={{ color: C.blue, flexShrink: 0, minWidth: 120 }}>{t.type}</code>
              <span style={{ color: 'var(--color-text-secondary)' }}>{t.desc}</span>
            </div>
          ))}
          <div style={{ marginTop: 'var(--space-md)', fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)' }}>
            Priority order: success_moment → failure_tension → shoot_mode → analysis_limit → passive_nudge
          </div>
        </Card>
      )}

      {/* ── Live Test ── */}
      {subTab === 'test' && (
        <div>
          <Card
            title="Live Adaptive Pricing Test"
            description="Simulate a user session by selecting a value state and sending the corresponding signals to the backend. The engine re-detects the state from the signals — it does not trust the label you choose. Verify the returned price and messaging match the expected values."
          >
            <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center', marginBottom: 'var(--space-md)', flexWrap: 'wrap' }}>
              <select
                value={testState}
                onChange={e => { setTestState(e.target.value); setLiveTest(null); }}
                style={{
                  padding: '5px 10px', borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-surface-elevated)', color: 'var(--color-text)',
                  fontSize: 'var(--text-sm)', cursor: 'pointer',
                }}
              >
                {VALUE_STATES.map(s => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
              <InlineBtn variant="primary" onClick={handleLiveTest} loading={testing}>
                {Icons.zap} Send Test Request
              </InlineBtn>
            </div>

            {/* Signal preview */}
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)', marginBottom: 'var(--space-md)' }}>
              Sending signals: <code>{JSON.stringify(SIGNAL_MAP[testState] || {})}</code>
            </div>

            {/* Result */}
            {liveTest && (
              <div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>
                  <Stat label="Detected state" value={
                    <span style={{ fontSize: 'var(--text-sm)' }}>{liveTest.value_state || liveTest.state}</span>
                  } color={VALUE_STATES.find(s => s.key === (liveTest.value_state || liveTest.state))?.color} />
                  <Stat label="Monthly price" value={`$${liveTest.price_monthly}`} color={C.green} />
                  <Stat label="Yearly price" value={liveTest.price_yearly ? `$${liveTest.price_yearly}` : '—'} />
                  {liveTest.guardrail_applied !== undefined && (
                    <Stat label="Guardrail" value={liveTest.guardrail_applied ? 'Applied' : 'Clear'} color={liveTest.guardrail_applied ? C.amber : C.green} />
                  )}
                </div>

                {liveTest.messaging && (
                  <div style={{ background: 'var(--color-surface-elevated)', borderRadius: 'var(--radius-md)', padding: 'var(--space-md)', fontSize: 'var(--text-xs)' }}>
                    <SectionTitle>Messaging</SectionTitle>
                    {[['Headline', 'headline'], ['Subheadline', 'subheadline'], ['CTA', 'cta'], ['Urgency', 'urgency'], ['Value frame', 'value_frame'], ['Proof', 'proof']].map(([label, key]) =>
                      liveTest.messaging[key] ? (
                        <div key={key} style={{ marginBottom: 4, display: 'flex', gap: 8 }}>
                          <span style={{ color: 'var(--color-text-dim)', flexShrink: 0, width: 90 }}>{label}:</span>
                          <span style={{ color: 'var(--color-text)' }}>{liveTest.messaging[key]}</span>
                        </div>
                      ) : null
                    )}
                  </div>
                )}

                {liveTest.state_signals && (
                  <div style={{ marginTop: 'var(--space-sm)', fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)' }}>
                    Signals used: <code>{JSON.stringify(liveTest.state_signals)}</code>
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUPPORT SECTION
// ─────────────────────────────────────────────────────────────────────────────

function SupportSection({ onNavigateTo }) {
  const [recalib, setRecalib]       = useState(null);
  const [goldSugg, setGoldSugg]     = useState(null);
  const [vlm, setVlm]               = useState(null);
  const [loading, setLoading]       = useState({ recalib: false, gold: false, vlm: false });
  const [loaded, setLoaded]         = useState({ recalib: false, gold: false, vlm: false });
  const [notice, setNotice]         = useState(null);
  const [expandedHint, setExpandedHint] = useState(null);
  const [expandedSugg, setExpandedSugg] = useState(null);
  const [expandedVlm, setExpandedVlm]   = useState(null);
  const [promotingIdx, setPromotingIdx] = useState(null);  // index being promoted

  function showNotice(type, msg) { setNotice({ type, msg }); setTimeout(() => setNotice(null), 4000); }

  async function loadSection(key, fn, setter) {
    setLoading(l => ({ ...l, [key]: true }));
    try {
      const data = await fn();
      setter(data);
      setLoaded(l => ({ ...l, [key]: true }));
    } catch (e) {
      showNotice('err', e.message);
    } finally {
      setLoading(l => ({ ...l, [key]: false }));
    }
  }

  useEffect(() => {
    loadSection('recalib', () => getRecalibrationHints(30), setRecalib);
  }, []);

  const hintList = (() => {
    if (!recalib) return [];
    const h = recalib.hints || recalib;
    return Array.isArray(h) ? h : Object.entries(h).map(([k, v]) => ({ pattern_id: k, ...v }));
  })();

  const suggList = (() => {
    if (!goldSugg) return [];
    const s = goldSugg.suggestions || goldSugg;
    return Array.isArray(s) ? s : [];
  })();

  const vlmList = (() => {
    if (!vlm) return [];
    const r = vlm.recent || vlm.corrections || vlm;
    return Array.isArray(r) ? r : [];
  })();

  return (
    <div>
      {notice && <Notice message={notice.msg} type={notice.type} />}

      {/* Recalibration Hints */}
      <Card
        title="Recalibration Hints"
        description="Patterns where the model's confidence threshold is misaligned with actual outcomes. A large calibration gap means the model is overconfident (high confidence, low success rate). The suggested floor is a revised minimum confidence below which results should be treated as uncertain."
        action={
          <InlineBtn
            onClick={() => { setLoaded(l => ({ ...l, recalib: false })); loadSection('recalib', () => getRecalibrationHints(30), setRecalib); }}
            loading={loading.recalib}
          >
            {Icons.refresh} Refresh
          </InlineBtn>
        }
      >
        {loading.recalib && <EmptyState message="Loading…" />}
        {!loading.recalib && hintList.length === 0 && (
          <EmptyState message="No recalibration needed — all patterns are well-calibrated." />
        )}
        {hintList.length > 0 && (
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)', minWidth: 400 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-dim)', textAlign: 'left' }}>
                <th style={{ padding: '4px 8px' }}>Pattern</th>
                <th style={{ padding: '4px 8px', textAlign: 'right' }}>Avg confidence</th>
                <th style={{ padding: '4px 8px', textAlign: 'right' }}>Success rate</th>
                <th style={{ padding: '4px 8px', textAlign: 'right' }}>Gap</th>
                <th style={{ padding: '4px 8px', textAlign: 'right' }}>Suggested floor</th>
              </tr>
            </thead>
            <tbody>
              {hintList.map((h, i) => {
                const gap = h.calibration_gap ?? 0;
                const gapColor = gap > 0.3 ? C.red : gap > 0.15 ? C.amber : C.green;
                const isExpanded = expandedHint === i;
                return (
                  <>
                    <tr
                      key={i}
                      style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer' }}
                      onClick={() => setExpandedHint(e => e === i ? null : i)}
                    >
                      <td style={{ padding: '5px 8px', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text)' }}>
                        <span style={{ marginRight: 4, color: 'var(--color-text-dim)', fontSize: 10 }}>
                          {isExpanded ? '▾' : '▸'}
                        </span>
                        {h.pattern_id}
                      </td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--color-text-secondary)' }}>
                        {h.avg_confidence != null ? (h.avg_confidence * 100).toFixed(0) + '%' : '—'}
                      </td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--color-text-secondary)' }}>
                        {h.success_rate != null ? (h.success_rate * 100).toFixed(0) + '%' : '—'}
                      </td>
                      <td style={{ padding: '5px 8px', textAlign: 'right' }}>
                        <span style={{ color: gapColor, fontWeight: 'var(--weight-semibold)' }}>
                          {gap.toFixed(3)}
                        </span>
                      </td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', color: 'var(--color-text-secondary)' }}>
                        {h.suggested_floor != null ? (h.suggested_floor * 100).toFixed(0) + '%' : '—'}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`hint_${i}__expand`}>
                        <td colSpan={5} style={{ padding: 0 }}>
                          <div style={{
                            background: 'var(--color-surface)',
                            borderTop: '1px solid var(--color-border)',
                            padding: 'var(--space-sm) var(--space-md)',
                            fontSize: 'var(--text-xs)',
                          }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '4px 16px' }}>
                              {/* Action */}
                              <div style={{ gridColumn: '1 / -1' }}>
                                <span style={{ color: 'var(--color-text-dim)', display: 'block' }}>Recommended action</span>
                                <span style={{ color: 'var(--color-text)' }}>
                                  {h.action || 'Lower confidence threshold to match actual success rate'}
                                </span>
                              </div>

                              {/* Sessions analyzed */}
                              <div>
                                <span style={{ color: 'var(--color-text-dim)', display: 'block' }}>Sessions analyzed</span>
                                <span style={{ color: 'var(--color-text)', fontFamily: 'var(--font-mono)' }}>
                                  {h.sessions ?? '—'}
                                </span>
                              </div>

                              {/* Recommended floor explanation */}
                              <div style={{ gridColumn: '1 / -1' }}>
                                <span style={{ color: 'var(--color-text-dim)', display: 'block' }}>Recommended floor</span>
                                <span style={{ color: 'var(--color-text)' }}>
                                  Set confidence floor to{' '}
                                  <strong>{h.suggested_floor != null ? (h.suggested_floor * 100).toFixed(0) + '%' : '—'}</strong>
                                  {' '}— the engine is predicting confidence{' '}
                                  <strong>{h.avg_confidence != null ? (h.avg_confidence * 100).toFixed(0) + '%' : '—'}</strong>
                                  {' '}but actual success rate is only{' '}
                                  <strong>{h.success_rate != null ? (h.success_rate * 100).toFixed(0) + '%' : '—'}</strong>
                                </span>
                              </div>

                              {/* Next step note */}
                              <div style={{ gridColumn: '1 / -1' }}>
                                <span style={{ color: 'var(--color-text-dim)' }}>
                                  Go to Control Center &gt; System to trigger ingestion after adjusting confidence_overrides.json
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
        )}
      </Card>

      {/* Gold Set Suggestions */}
      <Card
        title="Gold Set Suggestions"
        description="High-quality live signals that are strong candidates for promotion to the gold set. These are sessions where the user confirmed a good result with high model confidence — reliable ground truth for future benchmark cases."
        action={
          loaded.gold
            ? <InlineBtn onClick={() => { setLoaded(l => ({ ...l, gold: false })); loadSection('gold', () => getGoldSetSuggestions(90, 20), setGoldSugg); }} loading={loading.gold}>{Icons.refresh}</InlineBtn>
            : <InlineBtn variant="primary" onClick={() => loadSection('gold', () => getGoldSetSuggestions(90, 20), setGoldSugg)} loading={loading.gold}>{Icons.play} Load</InlineBtn>
        }
      >
        {!loaded.gold && !loading.gold && (
          <EmptyState message="Click Load to surface high-quality live signals as gold set candidates." />
        )}
        {loading.gold && <EmptyState message="Loading…" />}
        {loaded.gold && suggList.length === 0 && (
          <EmptyState message="No suggestions yet — seed more live signals first." />
        )}
        {suggList.length > 0 && (
          <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)', minWidth: 360 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-dim)', textAlign: 'left' }}>
                <th style={{ padding: '4px 8px' }}>Pattern</th>
                <th style={{ padding: '4px 8px' }}>Environment</th>
                <th style={{ padding: '4px 8px', textAlign: 'right' }}>Confidence</th>
                <th style={{ padding: '4px 8px' }}>Session ID</th>
              </tr>
            </thead>
            <tbody>
              {suggList.slice(0, 20).map((s, i) => {
                const isExpanded = expandedSugg === i;
                const conf = s.confidence ?? s.quality_score ?? s.score;
                return (
                  <>
                    <tr
                      key={i}
                      style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer' }}
                      onClick={() => setExpandedSugg(e => e === i ? null : i)}
                    >
                      <td style={{ padding: '5px 8px', fontWeight: 'var(--weight-semibold)', color: 'var(--color-text)' }}>
                        <span style={{ marginRight: 4, color: 'var(--color-text-dim)', fontSize: 10 }}>
                          {isExpanded ? '▾' : '▸'}
                        </span>
                        {s.pattern_id || s.pattern || '—'}
                      </td>
                      <td style={{ padding: '5px 8px', color: 'var(--color-text-secondary)' }}>
                        {s.environment || '—'}
                        {s.subject_type ? <span style={{ color: 'var(--color-text-dim)', marginLeft: 4 }}>· {s.subject_type}</span> : null}
                      </td>
                      <td style={{ padding: '5px 8px', textAlign: 'right', color: C.green, fontWeight: 'var(--weight-semibold)' }}>
                        {conf != null ? (conf * 100).toFixed(1) + '%' : '—'}
                      </td>
                      <td style={{ padding: '5px 8px', color: 'var(--color-text-dim)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>
                        {(s.session_id || '—').slice(0, 16)}{s.session_id?.length > 16 ? '…' : ''}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`sugg_${i}__expand`}>
                        <td colSpan={4} style={{ padding: 0 }}>
                          <div style={{
                            background: 'var(--color-surface)',
                            borderTop: '1px solid var(--color-border)',
                            padding: 'var(--space-sm) var(--space-md)',
                            fontSize: 'var(--text-xs)',
                          }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '4px 16px', marginBottom: 8 }}>
                              {Object.entries(s)
                                .filter(([, v]) => v != null)
                                .map(([k, v]) => {
                                  const isConfField = k === 'confidence' || k === 'quality_score' || k === 'score';
                                  const isMono = k === 'session_id' || k === 'signal_id';
                                  const isTimestamp = k === 'created_at' && typeof v === 'number';
                                  let display;
                                  if (isConfField) display = (v * 100).toFixed(1) + '%';
                                  else if (isTimestamp) display = new Date(v * 1000).toLocaleDateString(undefined, { timeZone: _DEVICE_TZ });
                                  else display = String(v);
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
                                        {display}
                                      </span>
                                    </div>
                                  );
                                })}
                            </div>
                            {s.reason && (
                              <div style={{ color: 'var(--color-text-secondary)', marginBottom: 6, fontStyle: 'italic' }}>
                                {s.reason}
                              </div>
                            )}
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', borderTop: '1px solid var(--color-border)', paddingTop: 8, flexWrap: 'wrap' }}>
                              <button
                                className="btn btn--primary btn--sm"
                                disabled={promotingIdx === i}
                                onClick={async () => {
                                  setPromotingIdx(i);
                                  try {
                                    await createGoldSetEntry({
                                      image_path: s.session_id ? `signal://${s.session_id}` : 'pending',
                                      expected_analysis: {
                                        pattern_id: s.pattern_id || s.pattern,
                                        confidence: s.confidence ?? s.confidence_score ?? s.quality_score,
                                        environment: s.environment,
                                        subject_type: s.subject_type,
                                        signal_id: s.id,
                                        session_id: s.session_id,
                                      },
                                      notes: `Promoted from live signal. Pattern: ${s.pattern_id || s.pattern}. Signal ID: ${s.id || '—'}. Replace image_path before approving.`,
                                      status: 'draft',
                                    });
                                    showNotice('success', `Draft created for ${s.pattern_id || s.pattern} — update the image in Gold Set tab.`);
                                    // Remove from suggestions list so it doesn't appear again this session
                                    setGoldSugg(prev => {
                                      const arr = Array.isArray(prev?.suggestions) ? prev.suggestions : Array.isArray(prev) ? prev : [];
                                      const filtered = arr.filter((_, idx) => idx !== i);
                                      return Array.isArray(prev) ? filtered : { ...prev, suggestions: filtered };
                                    });
                                    setExpandedSugg(null);
                                  } catch (err) {
                                    showNotice('error', `Failed: ${err.message}`);
                                  } finally {
                                    setPromotingIdx(null);
                                  }
                                }}
                              >
                                {promotingIdx === i ? 'Creating…' : '+ Create Draft'}
                              </button>
                              {onNavigateTo && (
                                <button
                                  className="btn btn--ghost btn--sm"
                                  onClick={() => onNavigateTo({ tab: 'gold_set' })}
                                >
                                  Open Gold Set →
                                </button>
                              )}
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
        )}
      </Card>

      {/* VLM Corrections */}
      <Card
        title="VLM Correction Log"
        description="Records where the VLM prediction was overridden by a CV signal or expert correction. High correction volume on a pattern indicates the VLM may need additional reference examples or prompting adjustments for that pattern."
        action={
          loaded.vlm
            ? <InlineBtn onClick={() => { setLoaded(l => ({ ...l, vlm: false })); loadSection('vlm', getVlmCorrections, setVlm); }} loading={loading.vlm}>{Icons.refresh}</InlineBtn>
            : <InlineBtn variant="primary" onClick={() => loadSection('vlm', getVlmCorrections, setVlm)} loading={loading.vlm}>{Icons.play} Load</InlineBtn>
        }
      >
        {!loaded.vlm && !loading.vlm && (
          <EmptyState message="Click Load to view VLM prediction corrections." />
        )}
        {loading.vlm && <EmptyState message="Loading…" />}
        {loaded.vlm && (() => {
          const total = vlm?.total_corrections ?? vlmList.length;
          const byType = vlm?.by_type || {};
          return (
            <div>
              <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)', flexWrap: 'wrap' }}>
                <Stat label="Total corrections" value={total} />
                {Object.entries(byType).map(([k, v]) => (
                  <Stat key={k} label={k} value={v} />
                ))}
              </div>
              {vlmList.length === 0 ? (
                <EmptyState message="No corrections recorded yet." />
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-dim)', textAlign: 'left' }}>
                      <th style={{ padding: '4px 8px' }}>Pattern</th>
                      <th style={{ padding: '4px 8px' }}>Field</th>
                      <th style={{ padding: '4px 8px' }}>Type</th>
                      <th style={{ padding: '4px 8px' }}>When</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vlmList.slice(0, 40).map((c, i) => {
                      const isExpanded = expandedVlm === i;
                      const corrField = c.field || c.correction_field;
                      const corrType  = c.correction_type || c.type;
                      const vlmVal    = c.vlm_value ?? c.predicted_value ?? c.original_value;
                      const corrVal   = c.corrected_value ?? c.cv_value ?? c.expert_value;
                      return (
                        <>
                          <tr
                            key={i}
                            style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer' }}
                            onClick={() => setExpandedVlm(e => e === i ? null : i)}
                          >
                            <td style={{ padding: '4px 8px', color: 'var(--color-text)' }}>
                              <span style={{ marginRight: 4, color: 'var(--color-text-dim)', fontSize: 10 }}>
                                {isExpanded ? '▾' : '▸'}
                              </span>
                              {c.pattern_id || '—'}
                            </td>
                            <td style={{ padding: '4px 8px', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>{corrField || '—'}</td>
                            <td style={{ padding: '4px 8px' }}><Badge label={corrType || '—'} color={C.blue} /></td>
                            <td style={{ padding: '4px 8px', color: 'var(--color-text-dim)' }}>{fmtTime(c.created_at)}</td>
                          </tr>
                          {isExpanded && (
                            <tr key={`vlm_${i}__expand`}>
                              <td colSpan={4} style={{ padding: 0 }}>
                                <div style={{
                                  background: 'var(--color-surface)',
                                  borderTop: '1px solid var(--color-border)',
                                  padding: 'var(--space-sm) var(--space-md)',
                                  fontSize: 'var(--text-xs)',
                                }}>
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '4px 16px', marginBottom: 8 }}>
                                    {Object.entries(c)
                                      .filter(([, v]) => v != null)
                                      .map(([k, v]) => (
                                        <div key={k}>
                                          <span style={{ color: 'var(--color-text-dim)', display: 'block' }}>
                                            {k.replace(/_/g, ' ')}
                                          </span>
                                          <span style={{ color: 'var(--color-text)', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
                                            {String(v)}
                                          </span>
                                        </div>
                                      ))}
                                  </div>
                                  {/* Correction explanation */}
                                  {(vlmVal != null || corrVal != null) && (
                                    <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 6, color: 'var(--color-text-secondary)' }}>
                                      The VLM predicted{' '}
                                      <strong style={{ color: 'var(--color-text)' }}>{vlmVal != null ? String(vlmVal) : '(unknown)'}</strong>
                                      {' '}but CV/expert analysis determined{' '}
                                      <strong style={{ color: 'var(--color-text)' }}>{corrVal != null ? String(corrVal) : '(unknown)'}</strong>
                                      {' '}— this is logged for retraining signals.
                                    </div>
                                  )}
                                  {vlmVal == null && corrVal == null && (
                                    <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 6, color: 'var(--color-text-dim)' }}>
                                      VLM correction logged for retraining signals — check raw record for predicted vs corrected values.
                                    </div>
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
        })()}
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// USER SECTION — account, session, flags, local data diagnostic
// ─────────────────────────────────────────────────────────────────────────────

function CopyBtn({ value, label }) {
  const [copied, setCopied] = useState(false);
  const t = useRef(null);
  function handleCopy() {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      clearTimeout(t.current);
      t.current = setTimeout(() => setCopied(false), 1800);
    });
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      style={{
        fontSize: 'var(--text-xs)', padding: '2px 8px',
        background: copied ? C.green + '22' : 'var(--color-surface-elevated)',
        color: copied ? C.green : 'var(--color-text-secondary)',
        border: `1px solid ${copied ? C.green + '55' : 'var(--color-border)'}`,
        borderRadius: 'var(--radius-sm)', cursor: 'pointer',
        transition: 'all 0.15s', fontFamily: 'var(--font-mono)',
        flexShrink: 0,
      }}
    >
      {copied ? '✓ copied' : (label || 'copy')}
    </button>
  );
}

function DiagRow({ label, value, mono, copy, dim, badge, badgeColor }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '6px 0', borderBottom: '1px solid var(--color-border)',
      gap: 'var(--space-sm)', minHeight: 32,
    }}>
      <span style={{
        fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)',
        flexShrink: 0, minWidth: 130,
      }}>{label}</span>
      <span style={{
        fontSize: 'var(--text-xs)',
        fontFamily: mono ? 'var(--font-mono)' : undefined,
        color: dim ? 'var(--color-text-dim)' : 'var(--color-text)',
        flex: 1, textAlign: 'right', wordBreak: 'break-all',
      }}>
        {badge ? (
          <span style={{
            display: 'inline-block', padding: '1px 7px',
            background: (badgeColor || C.blue) + '22',
            color: badgeColor || C.blue,
            border: `1px solid ${(badgeColor || C.blue)}44`,
            borderRadius: 'var(--radius-full)',
          }}>{value}</span>
        ) : value ?? <span style={{ color: 'var(--color-text-dim)', fontStyle: 'italic' }}>—</span>}
      </span>
      {copy && value && <CopyBtn value={String(value)} />}
    </div>
  );
}

function UserSection() {
  const [sub, setSub] = useState(null);
  const [flags, setFlags] = useState(null);
  const [syncResult, setSyncResult] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [cleared, setCleared] = useState(false);

  // Use reactive context user so this section re-renders on login/profile changes.
  // Fall back to localStorage for cases where context user hasn't hydrated yet.
  const { user: ctxUser } = useAppState();
  const authUser = ctxUser || getUser();
  const sessionId = getSessionId();
  const token = authUser ? getToken() : null;

  // Subscription status — re-fetches whenever the authenticated user changes
  useEffect(() => {
    if (!token) { setSub(null); return; }
    setSub(null); // clear stale data while refetching
    fetch('/api/auth/subscription-status', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => setSub(d))
      .catch(() => {});
  }, [token, authUser?.id]); // re-fetch when user ID changes (login/logout)

  // Feature flags — re-fetch when user changes (different session = different flags)
  useEffect(() => {
    fetchFlags().then(f => setFlags(f)).catch(() => {});
  }, [authUser?.id]);

  // Local storage stats
  const lsStats = (() => {
    try {
      const kit = localStorage.getItem('ngw_kit');
      const events = localStorage.getItem('ngw_track_events');
      const lastSetup = localStorage.getItem('ngw_last_used_setup');
      const eventsArr = events ? JSON.parse(events) : [];
      const kitParsed = kit ? JSON.parse(kit) : null;
      const cameraCount = kitParsed?.cameras?.length ?? 0;
      const lightCount = kitParsed?.lights?.length ?? 0;
      return {
        kitItems: cameraCount + lightCount,
        eventCount: eventsArr.length,
        lastSetup: lastSetup || null,
        lastEventAt: eventsArr.length ? eventsArr[eventsArr.length - 1]?.ts : null,
      };
    } catch { return {}; }
  })();

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const r = await fetch('/api/user/sync', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = r.ok ? await r.json() : { error: 'Failed' };
      setSyncResult(d.ok !== false ? '✓ Synced' : ('✗ ' + (d.detail || 'Error')));
    } catch (e) {
      setSyncResult('✗ Network error');
    } finally {
      setSyncing(false);
    }
  }

  function handleClearEvents() {
    try { localStorage.removeItem('ngw_track_events'); } catch {}
    setCleared(true);
    setTimeout(() => setCleared(false), 2000);
  }

  // sub.is_paid is the correct field — has_active_subscription does not exist
  const isPaid = sub?.is_paid;
  const isAdminUser = authUser?.is_admin;
  const tierLabel = isAdminUser
    ? 'Enterprise (admin)'
    : sub?.plan
      ? (sub.plan.charAt(0).toUpperCase() + sub.plan.slice(1))
      : isPaid ? 'Paid' : 'Free';
  const tierColor = (isPaid || isAdminUser) ? C.green : C.amber;

  const flagEntries = flags ? Object.entries(flags) : [];
  const activeFlags = flagEntries.filter(([, f]) => f.enabled || f.variant === 'treatment');
  const inactiveFlags = flagEntries.filter(([, f]) => !f.enabled && f.variant !== 'treatment');

  return (
    <div>
      {/* Account */}
      <Card title="Account" description="Auth identity from JWT + localStorage">
        <DiagRow label="Email" value={authUser?.email} copy />
        <DiagRow label="Username" value={authUser?.username} />
        <DiagRow label="User ID" value={authUser?.id} mono copy />
        <DiagRow label="Email verified" value={authUser?.email_verified ? 'Yes' : 'No'}
          badge badgeColor={authUser?.email_verified ? C.green : C.amber} />
        <DiagRow label="Dev access" value={authUser?.is_admin ? 'Yes — NGW_DEV_EMAILS' : 'No'}
          badge badgeColor={authUser?.is_admin ? C.blue : 'var(--color-text-dim)'} />
      </Card>

      {/* Subscription */}
      <Card title="Subscription" description="Stripe subscription status from /auth/subscription-status">
        {sub === null ? (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)' }}>
            {token ? 'Loading…' : 'Not authenticated'}
          </div>
        ) : (
          <>
            <DiagRow label="Tier" value={tierLabel} badge badgeColor={tierColor} />
            <DiagRow label="Plan" value={sub.plan || '—'} />
            <DiagRow label="Status" value={sub.status || (isPaid ? 'active' : 'none')} />
            <DiagRow label="Billing period" value={sub.billing_period || '—'} />
            <DiagRow label="Stripe customer" value={sub.stripe_customer_id} mono copy />
            <DiagRow label="Subscription ID" value={sub.stripe_subscription_id} mono copy />
          </>
        )}
      </Card>

      {/* Session */}
      <Card title="Session" description="sessionStorage ngw_session_id — resets on tab close">
        <DiagRow label="Session ID" value={sessionId} mono copy />
        <DiagRow label="Token (first 32)" value={token ? token.slice(0, 32) + '…' : null} mono />
        <DiagRow label="Token (full)" value={token} copy />
      </Card>

      {/* Feature flags */}
      <Card title="Feature Flags" description={`${flagEntries.length} flags loaded for this session`}>
        {flags === null ? (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)' }}>Loading…</div>
        ) : flagEntries.length === 0 ? (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)' }}>No flags returned.</div>
        ) : (
          <>
            {activeFlags.map(([key, f]) => (
              <DiagRow key={key} label={key}
                value={f.variant === 'treatment' ? 'treatment' : 'enabled'}
                badge badgeColor={C.green} />
            ))}
            {inactiveFlags.map(([key]) => (
              <DiagRow key={key} label={key} value="off" badge badgeColor="var(--color-text-dim)" />
            ))}
          </>
        )}
      </Card>

      {/* Local data */}
      <Card title="Local Data" description="localStorage diagnostics — kit, events, last-used setup">
        <DiagRow label="Kit items" value={lsStats.kitItems ?? 0} />
        <DiagRow label="Queued events" value={lsStats.eventCount ?? 0} />
        <DiagRow label="Last-used setup ID" value={lsStats.lastSetup} mono copy />
        <DiagRow label="Last event at"
          value={lsStats.lastEventAt ? new Date(lsStats.lastEventAt).toLocaleString(undefined, { timeZone: _DEVICE_TZ }) : null} dim />
      </Card>

      {/* Actions */}
      <Card title="Actions">
        <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing || !token}
            style={{
              fontSize: 'var(--text-xs)', padding: '5px 12px',
              background: 'var(--color-surface-elevated)',
              color: 'var(--color-text)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)', cursor: syncing ? 'wait' : 'pointer',
            }}
          >
            {syncing ? 'Syncing…' : '↑ Force sync'}
          </button>
          <button
            type="button"
            onClick={handleClearEvents}
            style={{
              fontSize: 'var(--text-xs)', padding: '5px 12px',
              background: 'var(--color-surface-elevated)',
              color: cleared ? C.green : 'var(--color-text)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)', cursor: 'pointer',
            }}
          >
            {cleared ? '✓ Cleared' : 'Clear event queue'}
          </button>
          <CopyBtn
            value={JSON.stringify({ userId: authUser?.id, email: authUser?.email, sessionId, tier: tierLabel }, null, 2)}
            label="Copy all IDs"
          />
          {syncResult && (
            <span style={{
              fontSize: 'var(--text-xs)', color: syncResult.startsWith('✓') ? C.green : C.red,
            }}>{syncResult}</span>
          )}
        </div>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN TAB
// ─────────────────────────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'system',       label: 'System',       icon: Icons.system },
  { id: 'intelligence', label: 'Intelligence',  icon: Icons.intelligence },
  { id: 'paywall',      label: 'Paywall',       icon: Icons.paywall },
  { id: 'support',      label: 'Support',       icon: Icons.support },
  { id: 'user',         label: 'User',          icon: (
    <Icon size={14}>
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </Icon>
  )},
];

const SECTION_DESC = {
  system:       'Scheduler control, system health, and manual ingestion triggers.',
  intelligence: 'Global intelligence score, per-pattern breakdown, autonomy queue, and cluster review.',
  paywall:      'Adaptive pricing value state map, paywall type reference, and live pricing test.',
  support:      'Recalibration hints, VLM correction audit, and gold-set promotion suggestions.',
  user:         'Account identity, subscription status, session diagnostics, feature flags, and local data — for prod support and debugging.',
};

export default function ControlCenterTab({ user, onNavigateTo }) {
  const [section, setSection] = useState('system');

  return (
    <div style={{ paddingBottom: 'var(--space-2xl)' }}>

      {/* Section nav — uses lab-tab class to match all other inner tab bars */}
      <div style={{ marginBottom: 'var(--space-lg)' }}>
        <div className="lab-tabs">
          {SECTIONS.map(s => (
            <button
              key={s.id}
              type="button"
              className={`lab-tab${section === s.id ? ' lab-tab--active' : ''}`}
              onClick={() => setSection(s.id)}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                {s.icon}
                {s.label}
              </span>
            </button>
          ))}
        </div>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)', margin: 'var(--space-xs) 0 0 2px' }}>
          {SECTION_DESC[section]}
        </p>
      </div>

      {section === 'system'       && <SystemSection onNavigateTo={onNavigateTo} />}
      {section === 'intelligence' && <IntelligenceSection user={user} onNavigateTo={onNavigateTo} />}
      {section === 'paywall'      && <PaywallSection />}
      {section === 'support'      && <SupportSection onNavigateTo={onNavigateTo} />}
      {section === 'user'         && <UserSection />}
    </div>
  );
}
