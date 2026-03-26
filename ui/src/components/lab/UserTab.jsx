/**
 * UserTab — Local Data Inspector for the Lab screen.
 *
 * Shows every piece of client-side state for the current device:
 *   - Auth (token presence, decoded JWT payload, user object)
 *   - Subscription / Paywall (paid flag, plan tier, analysis count)
 *   - Feature Flags (ngw_feature_flags)
 *   - Session state (preview mode, QA free, post-payment, adaptive price)
 *   - Lab preferences (tab order)
 *   - Raw dump of all ngw_* keys in localStorage + sessionStorage
 *
 * Dev actions: clear individual keys, reset flags, force-unlock.
 */
import { useState, useCallback } from 'react';
import { C } from '../../lib/statusColors';

// ── Storage helpers ────────────────────────────────────────────────────────────

function safeGet(storage, key) {
  try { return storage.getItem(key); } catch { return null; }
}

function safeParse(raw) {
  if (raw === null || raw === undefined) return null;
  try { return JSON.parse(raw); } catch { return raw; }
}

/** Decode a JWT payload without verifying the signature. Returns null on failure. */
function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(b64.padEnd(b64.length + (4 - b64.length % 4) % 4, '='));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** Collect all ngw_* keys from a given storage object. */
function collectNgwKeys(storage) {
  const out = {};
  try {
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && k.startsWith('ngw_')) {
        out[k] = safeParse(storage.getItem(k));
      }
    }
  } catch { /* storage unavailable */ }
  return out;
}

/** Format Unix timestamp or ISO string. */
function fmtTs(v) {
  if (!v) return '—';
  const n = typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : Date.parse(v);
  if (isNaN(n)) return String(v);
  return new Date(n).toLocaleString(undefined, {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-text-primary)', letterSpacing: '0.03em' }}>
        {title}
      </div>
      {subtitle && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)', marginTop: 1 }}>{subtitle}</div>
      )}
    </div>
  );
}

function KvRow({ label, value, mono, badge, badgeColor, action, actionLabel, actionTitle }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8,
      padding: '4px 0', borderBottom: '1px solid var(--color-border)',
      fontSize: 'var(--text-xs)',
    }}>
      <span style={{ color: 'var(--color-text-secondary)', minWidth: 160, flexShrink: 0 }}>{label}</span>
      <span style={{
        flex: 1,
        color: value === '—' || value === null ? 'var(--color-text-dim)' : 'var(--color-text-primary)',
        fontFamily: mono ? 'var(--font-mono)' : undefined,
        wordBreak: 'break-all',
      }}>
        {badge ? (
          <span style={{
            display: 'inline-block', padding: '0 6px', borderRadius: 3,
            background: badgeColor || C.muted, color: '#fff',
            fontWeight: 600, fontSize: '0.7rem',
          }}>{badge}</span>
        ) : (
          String(value ?? '—')
        )}
      </span>
      {action && (
        <button
          onClick={action}
          title={actionTitle}
          style={{
            flexShrink: 0, fontSize: '0.65rem', padding: '1px 6px',
            background: 'var(--color-surface-elevated)', border: '1px solid var(--color-border)',
            borderRadius: 3, cursor: 'pointer', color: 'var(--color-text-secondary)',
          }}
        >
          {actionLabel || 'Clear'}
        </button>
      )}
    </div>
  );
}

function Card({ children, style }) {
  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 8,
      padding: 'var(--space-sm) var(--space-md)',
      marginBottom: 'var(--space-md)',
      ...style,
    }}>
      {children}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function UserTab() {
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick(t => t + 1), []);

  // ── Collect all state ──────────────────────────────────────────────────────

  const token     = safeGet(localStorage, 'ngw_auth_token') || safeGet(localStorage, 'ngw_token');
  const userRaw   = safeGet(localStorage, 'ngw_auth_user');
  const user      = safeParse(userRaw);
  const jwtClaims = decodeJwtPayload(token);

  const isPaid     = safeGet(localStorage, 'ngw_paid') === 'true';
  const planTier   = safeGet(localStorage, 'ngw_subscription_plan') || null;
  const stripeSession = safeGet(localStorage, 'ngw_stripe_session');

  const analysisCount   = safeParse(safeGet(sessionStorage, 'ngw_analysis_count')) ?? 0;
  const qaFree          = safeGet(sessionStorage, 'ngw_qa_free') === '1';
  const postPayment     = safeGet(sessionStorage, 'ngw_post_payment') === '1';
  const previewAccess   = safeGet(sessionStorage, 'ngw_preview_access');
  const previewRole     = safeGet(sessionStorage, 'ngw_preview_role');
  const maxPriceSeen    = safeParse(safeGet(sessionStorage, 'ngw_max_price_seen'));

  const featureFlags = safeParse(safeGet(localStorage, 'ngw_feature_flags')) || {};
  const tabOrder     = safeParse(safeGet(localStorage, 'ngw_lab_tab_order'));

  // All ngw_* keys raw
  const lsKeys = collectNgwKeys(localStorage);
  const ssKeys = collectNgwKeys(sessionStorage);

  // ── Actions ────────────────────────────────────────────────────────────────

  function clearKey(storage, key) {
    try { storage.removeItem(key); } catch { /* ignore */ }
    refresh();
  }

  function resetFlags() {
    try { localStorage.removeItem('ngw_feature_flags'); } catch { /* ignore */ }
    refresh();
  }

  function setFlag(key, value) {
    try {
      const stored = safeParse(safeGet(localStorage, 'ngw_feature_flags')) || {};
      stored[key] = value;
      localStorage.setItem('ngw_feature_flags', JSON.stringify(stored));
    } catch { /* ignore */ }
    refresh();
  }

  function forceUnlock() {
    try { localStorage.setItem('ngw_paid', 'true'); } catch { /* ignore */ }
    refresh();
  }

  function forceLock() {
    try {
      localStorage.removeItem('ngw_paid');
      localStorage.removeItem('ngw_subscription_plan');
    } catch { /* ignore */ }
    refresh();
  }

  // ── Flag defaults (mirror featureFlags.js) ────────────────────────────────
  const FLAG_DEFAULTS = {
    enable_lab: false,
    enable_shot_match: true,
    enable_master_mode: true,
    enable_reference_compare: false,
    enable_taxonomy_editor: false,
    enable_rule_editor: false,
  };
  const mergedFlags = { ...FLAG_DEFAULTS, ...featureFlags };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', paddingBottom: 40 }}>

      {/* ── Auth ────────────────────────────────────────────────────────── */}
      <Card>
        <SectionHeader
          title="Auth"
          subtitle="ngw_auth_token + ngw_auth_user in localStorage"
        />
        <KvRow label="Logged in"
          badge={token ? 'YES' : 'NO'}
          badgeColor={token ? C.green : C.red}
        />
        <KvRow label="Email"         value={user?.email ?? '—'} />
        <KvRow label="Name"          value={user?.name ?? '—'} />
        <KvRow label="User ID"       value={user?.id ?? '—'} mono />
        <KvRow label="Token (first 20 chars)"
          value={token ? token.slice(0, 20) + '…' : '—'} mono
          action={token ? () => clearKey(localStorage, 'ngw_auth_token') : undefined}
          actionLabel="Clear"
          actionTitle="Remove stored JWT — you will be logged out"
        />
        {jwtClaims && (
          <>
            <KvRow label="JWT subject"   value={jwtClaims.sub ?? '—'} mono />
            <KvRow label="JWT issued"    value={fmtTs(jwtClaims.iat)} />
            <KvRow label="JWT expires"   value={fmtTs(jwtClaims.exp)} />
            <KvRow label="JWT expired"
              badge={jwtClaims.exp && Date.now() / 1000 > jwtClaims.exp ? 'EXPIRED' : 'VALID'}
              badgeColor={jwtClaims.exp && Date.now() / 1000 > jwtClaims.exp ? C.red : C.green}
            />
          </>
        )}
      </Card>

      {/* ── Subscription / Paywall ──────────────────────────────────────── */}
      <Card>
        <SectionHeader
          title="Subscription / Paywall"
          subtitle="ngw_paid + ngw_subscription_plan in localStorage; ngw_analysis_count in sessionStorage"
        />
        <KvRow label="Paid"
          badge={isPaid ? 'PAID' : 'FREE'}
          badgeColor={isPaid ? C.green : C.amber}
          action={isPaid ? forceLock : forceUnlock}
          actionLabel={isPaid ? 'Force Lock' : 'Force Unlock'}
          actionTitle={isPaid ? 'Remove ngw_paid from localStorage' : 'Set ngw_paid=true in localStorage'}
        />
        <KvRow label="Plan tier"       value={planTier ?? '—'} />
        <KvRow label="Analysis count"  value={String(analysisCount)} />
        <KvRow label="Stripe session"  value={stripeSession ?? '—'} mono
          action={stripeSession ? () => clearKey(localStorage, 'ngw_stripe_session') : undefined}
          actionTitle="Clear pending Stripe session"
        />
        <KvRow label="QA free mode"
          badge={qaFree ? 'ON' : 'off'}
          badgeColor={qaFree ? C.amber : C.muted}
        />
        <KvRow label="Post-payment"
          badge={postPayment ? 'YES' : 'no'}
          badgeColor={postPayment ? C.blue : C.muted}
        />
      </Card>

      {/* ── Feature Flags ───────────────────────────────────────────────── */}
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <SectionHeader
            title="Feature Flags"
            subtitle="ngw_feature_flags in localStorage (merged with defaults)"
          />
          <button
            onClick={resetFlags}
            style={{
              fontSize: '0.65rem', padding: '2px 8px',
              background: 'var(--color-surface-elevated)', border: '1px solid var(--color-border)',
              borderRadius: 3, cursor: 'pointer', color: 'var(--color-text-secondary)',
            }}
          >
            Reset All
          </button>
        </div>
        {Object.entries(mergedFlags).map(([key, val]) => {
          const isOverridden = key in featureFlags;
          return (
            <div key={key} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '4px 0', borderBottom: '1px solid var(--color-border)',
              fontSize: 'var(--text-xs)',
            }}>
              <span style={{
                color: 'var(--color-text-secondary)', minWidth: 220, flexShrink: 0,
                fontFamily: 'var(--font-mono)',
              }}>
                {key}
                {isOverridden && (
                  <span style={{ marginLeft: 4, fontSize: '0.6rem', color: C.amber, fontFamily: 'inherit' }}>
                    overridden
                  </span>
                )}
              </span>
              {/* Toggle */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={!!val}
                  onChange={e => setFlag(key, e.target.checked)}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ color: val ? C.green : 'var(--color-text-dim)', fontWeight: 600 }}>
                  {val ? 'enabled' : 'disabled'}
                </span>
              </label>
            </div>
          );
        })}
      </Card>

      {/* ── Session State ───────────────────────────────────────────────── */}
      <Card>
        <SectionHeader
          title="Session State"
          subtitle="sessionStorage keys — reset on tab close"
        />
        <KvRow label="Preview access"  value={previewAccess ?? '—'}
          action={previewAccess ? () => clearKey(sessionStorage, 'ngw_preview_access') : undefined}
        />
        <KvRow label="Preview role"    value={previewRole ?? '—'}
          action={previewRole ? () => clearKey(sessionStorage, 'ngw_preview_role') : undefined}
        />
        <KvRow label="Max price seen"  value={maxPriceSeen != null ? `$${maxPriceSeen}` : '—'}
          action={maxPriceSeen != null ? () => clearKey(sessionStorage, 'ngw_max_price_seen') : undefined}
        />
        <KvRow label="QA free mode"    value={qaFree ? 'active (set via ?qa_free=1)' : 'inactive'} />
        <KvRow label="Post-payment"    value={postPayment ? 'pending flush' : 'none'}
          action={postPayment ? () => clearKey(sessionStorage, 'ngw_post_payment') : undefined}
        />
      </Card>

      {/* ── Lab Preferences ─────────────────────────────────────────────── */}
      <Card>
        <SectionHeader
          title="Lab Preferences"
          subtitle="Persisted lab UI state in localStorage"
        />
        <KvRow label="Tab order"
          value={tabOrder ? tabOrder.join(' → ') : 'default'}
          action={tabOrder ? () => clearKey(localStorage, 'ngw_lab_tab_order') : undefined}
          actionLabel="Reset"
          actionTitle="Clear saved tab order — reverts to default"
        />
      </Card>

      {/* ── Raw Storage Dump ────────────────────────────────────────────── */}
      <Card>
        <SectionHeader
          title="Raw ngw_* Storage"
          subtitle="All ngw_ keys found in localStorage (LS) and sessionStorage (SS)"
        />
        {Object.keys(lsKeys).length === 0 && Object.keys(ssKeys).length === 0 && (
          <div style={{ color: 'var(--color-text-dim)', fontSize: 'var(--text-xs)', padding: '4px 0' }}>
            No ngw_* keys found.
          </div>
        )}
        {Object.entries(lsKeys).map(([key, val]) => (
          <KvRow
            key={key}
            label={`LS · ${key}`}
            value={typeof val === 'object' ? JSON.stringify(val) : String(val ?? '—')}
            mono
            action={() => clearKey(localStorage, key)}
            actionTitle={`Remove ${key} from localStorage`}
          />
        ))}
        {Object.entries(ssKeys).map(([key, val]) => (
          <KvRow
            key={key}
            label={`SS · ${key}`}
            value={typeof val === 'object' ? JSON.stringify(val) : String(val ?? '—')}
            mono
            action={() => clearKey(sessionStorage, key)}
            actionTitle={`Remove ${key} from sessionStorage`}
          />
        ))}
      </Card>

      <div style={{ textAlign: 'right', fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)' }}>
        <button
          onClick={refresh}
          style={{
            fontSize: 'var(--text-xs)', padding: '2px 10px',
            background: 'var(--color-surface-elevated)', border: '1px solid var(--color-border)',
            borderRadius: 3, cursor: 'pointer', color: 'var(--color-text-secondary)',
          }}
        >
          ↻ Refresh
        </button>
      </div>
    </div>
  );
}
