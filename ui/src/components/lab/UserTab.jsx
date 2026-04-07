/**
 * UserTab — User & Local Data inspector for the Lab screen.
 *
 * Sections:
 *   1. Identity       — server-verified user (GET /api/auth/me)
 *   2. Photographer Profile — saved onboarding preferences
 *   3. Subscription   — server + localStorage paywall state
 *   4. Saved Data     — setups count, kit items
 *   5. Feature Flags  — ngw_feature_flags with live toggles
 *   6. Session State  — sessionStorage keys
 *   7. Lab Prefs      — tab order, layout
 *   8. Local Storage  — full ngw_* dump with clear actions
 */
import { useState, useEffect, useCallback } from 'react';
import { C } from '../../lib/statusColors';
import {
  fetchMe,
  loadPreferences,
  fetchSetups,
  fetchKit,
  getToken,
} from '../../data/authApi';

// ── Storage helpers ────────────────────────────────────────────────────────────

function safeGet(storage, key) {
  try { return storage.getItem(key); } catch { return null; }
}
function safeParse(raw) {
  if (raw === null || raw === undefined) return null;
  try { return JSON.parse(raw); } catch { return raw; }
}

function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') return null;
  if (token === 'dev' || token.length < 20) return null; // dev mode sentinel
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(b64.padEnd(b64.length + (4 - b64.length % 4) % 4, '='));
    return JSON.parse(json);
  } catch { return null; }
}

function collectNgwKeys(storage) {
  const out = {};
  try {
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && k.startsWith('ngw_')) out[k] = safeParse(storage.getItem(k));
    }
  } catch { /* unavailable */ }
  return out;
}

const _TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

function fmtTs(v) {
  if (!v) return '—';
  const n = typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : Date.parse(v);
  if (isNaN(n)) return String(v);
  return new Date(n).toLocaleString(undefined, { timeZone: _TZ });
}

// ── UI primitives ──────────────────────────────────────────────────────────────

function Card({ title, subtitle, action, children }) {
  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-sm)',
      padding: 'var(--space-sm) var(--space-md)',
      marginBottom: 'var(--space-md)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-text-primary)', letterSpacing: '0.03em' }}>{title}</div>
          {subtitle && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)', marginTop: 1 }}>{subtitle}</div>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value, mono, badge, badgeColor, action, actionLabel, actionTitle, dim }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8,
      padding: '4px 0', borderBottom: '1px solid var(--color-border)',
      fontSize: 'var(--text-xs)',
    }}>
      <span style={{ color: 'var(--color-text-secondary)', minWidth: 170, flexShrink: 0 }}>{label}</span>
      <span style={{
        flex: 1,
        color: dim || value === '—' || value === null ? 'var(--color-text-dim)' : 'var(--color-text-primary)',
        fontFamily: mono ? 'var(--font-mono)' : undefined,
        wordBreak: 'break-all',
      }}>
        {badge ? (
          <span style={{
            display: 'inline-block', padding: '0 6px', borderRadius: 'var(--radius-xs)',
            background: badgeColor || C.muted, color: '#fff',
            fontWeight: 600, fontSize: '0.7rem',
          }}>{badge}</span>
        ) : String(value ?? '—')}
      </span>
      {action && (
        <button onClick={action} title={actionTitle} style={{
          flexShrink: 0, fontSize: '0.65rem', padding: '1px 6px',
          background: 'var(--color-surface-elevated)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-xs)', cursor: 'pointer', color: 'var(--color-text-secondary)',
        }}>{actionLabel || 'Clear'}</button>
      )}
    </div>
  );
}

function SmallBtn({ onClick, title, children }) {
  return (
    <button onClick={onClick} title={title} style={{
      fontSize: '0.65rem', padding: '2px 8px',
      background: 'var(--color-surface-elevated)', border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-xs)', cursor: 'pointer', color: 'var(--color-text-secondary)',
    }}>{children}</button>
  );
}

function ServerStatus({ loading, error }) {
  if (loading) return <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)' }}>fetching…</span>;
  if (error)   return <span style={{ fontSize: 'var(--text-xs)', color: C.red }}>⚠ {error}</span>;
  return null;
}

// ── Flag defaults (mirrors featureFlags.js) ───────────────────────────────────

const FLAG_DEFAULTS = {
  enable_lab: false,
  enable_shot_match: true,
  enable_master_mode: true,
  enable_reference_compare: false,
  enable_taxonomy_editor: false,
  enable_rule_editor: false,
};

// ── Main ──────────────────────────────────────────────────────────────────────

export default function UserTab() {
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick(t => t + 1), []);

  // Server-fetched state
  const [serverUser,  setServerUser]  = useState(null);
  const [prefs,       setPrefs]       = useState(null);
  const [setups,      setSetups]      = useState(null);
  const [kit,         setKit]         = useState(null);
  const [serverErr,   setServerErr]   = useState(null);
  const [serverLoad,  setServerLoad]  = useState(false);

  // Load server data once on mount (and when tick changes via manual refresh)
  useEffect(() => {
    let cancelled = false;
    setServerLoad(true);
    setServerErr(null);
    Promise.all([
      fetchMe().catch(() => null),
      loadPreferences().catch(() => null),
      fetchSetups().catch(() => null),
      fetchKit().catch(() => null),
    ]).then(([me, p, s, k]) => {
      if (cancelled) return;
      setServerUser(me);
      setPrefs(p);
      setSetups(s);
      setKit(k);
      setServerLoad(false);
    }).catch(e => {
      if (!cancelled) { setServerErr(e.message); setServerLoad(false); }
    });
    return () => { cancelled = true; };
  }, [tick]);

  // ── Local state reads ──────────────────────────────────────────────────────
  const token     = safeGet(localStorage, 'ngw_auth_token') || safeGet(localStorage, 'ngw_token');
  const isDevMode = safeGet(localStorage, 'ngw_dev_mode') === '1';
  const userRaw   = safeGet(localStorage, 'ngw_auth_user');
  const localUser = safeParse(userRaw);
  const jwtClaims = decodeJwtPayload(token);

  const isPaid     = safeGet(localStorage, 'ngw_paid') === 'true';
  const planTier   = safeGet(localStorage, 'ngw_subscription_plan');
  const stripeSession = safeGet(localStorage, 'ngw_stripe_session');
  const analysisCount = safeParse(safeGet(sessionStorage, 'ngw_analysis_count')) ?? 0;
  const qaFree        = safeGet(sessionStorage, 'ngw_qa_free') === '1';
  const postPayment   = safeGet(sessionStorage, 'ngw_post_payment') === '1';
  const previewAccess = safeGet(sessionStorage, 'ngw_preview_access');
  const previewRole   = safeGet(sessionStorage, 'ngw_preview_role');
  const maxPriceSeen  = safeParse(safeGet(sessionStorage, 'ngw_max_price_seen'));

  const featureFlags = safeParse(safeGet(localStorage, 'ngw_feature_flags')) || {};
  const tabOrder     = safeParse(safeGet(localStorage, 'ngw_lab_tab_order'));
  const mergedFlags  = { ...FLAG_DEFAULTS, ...featureFlags };

  const lsKeys = collectNgwKeys(localStorage);
  const ssKeys = collectNgwKeys(sessionStorage);

  // ── Actions ────────────────────────────────────────────────────────────────
  function clearKey(storage, key) { try { storage.removeItem(key); } catch {} refresh(); }
  function resetFlags() { try { localStorage.removeItem('ngw_feature_flags'); } catch {} refresh(); }
  function setFlag(key, value) {
    try {
      const stored = safeParse(safeGet(localStorage, 'ngw_feature_flags')) || {};
      stored[key] = value;
      localStorage.setItem('ngw_feature_flags', JSON.stringify(stored));
    } catch {}
    refresh();
  }

  // ── Photographer profile (from preferences) ────────────────────────────────
  const profile = prefs?.photographer_profile || null;

  // ── Saved setups ───────────────────────────────────────────────────────────
  const setupCount  = Array.isArray(setups) ? setups.length : null;
  const kitItems    = Array.isArray(kit?.lights) ? kit.lights.length :
                      (kit && typeof kit === 'object' ? Object.keys(kit).length : null);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 780, margin: '0 auto', paddingBottom: 40 }}>

      {/* ── 1. Identity ─────────────────────────────────────────────────── */}
      <Card
        title="Identity"
        subtitle="Server-verified user (GET /api/auth/me)"
        action={<ServerStatus loading={serverLoad} error={serverErr} />}
      >
        <Row label="Token"
          badge={isDevMode ? 'DEV MODE' : token ? 'PRESENT' : 'NONE'}
          badgeColor={isDevMode ? C.amber : token ? C.green : C.red}
        />
        {isDevMode && (
          <Row label="" value="Dev mode active — token is a sentinel, not a real JWT" dim />
        )}
        {serverUser ? (
          <>
            <Row label="Email (server)"  value={serverUser.email} />
            <Row label="Name (server)"   value={serverUser.name || serverUser.username || '—'} />
            <Row label="User ID"         value={serverUser.id} mono />
            <Row label="Email verified"
              badge={serverUser.email_verified ? 'YES' : 'NO'}
              badgeColor={serverUser.email_verified ? C.green : C.amber}
            />
          </>
        ) : !serverLoad && (
          <Row label="Server user" value="Not available (not logged in or server unreachable)" dim />
        )}
        {!isDevMode && jwtClaims && (
          <>
            <Row label="JWT subject"   value={jwtClaims.sub} mono />
            <Row label="JWT issued"    value={fmtTs(jwtClaims.iat)} />
            <Row label="JWT expires"   value={fmtTs(jwtClaims.exp)} />
            <Row label="JWT status"
              badge={jwtClaims.exp && Date.now() / 1000 > jwtClaims.exp ? 'EXPIRED' : 'VALID'}
              badgeColor={jwtClaims.exp && Date.now() / 1000 > jwtClaims.exp ? C.red : C.green}
            />
          </>
        )}
        {localUser && (
          <Row label="Cached name (localStorage)" value={localUser.name || localUser.email || '—'} />
        )}
      </Card>

      {/* ── 2. Photographer Profile ──────────────────────────────────────── */}
      <Card
        title="Photographer Profile"
        subtitle="Saved during onboarding — GET /api/user/preferences → photographer_profile"
        action={<ServerStatus loading={serverLoad} error={null} />}
      >
        {profile ? (
          <>
            <Row label="Display name"     value={profile.display_name || profile.name || '—'} />
            <Row label="Experience"       value={profile.experience || '—'} />
            <Row label="Primary genre"    value={profile.genre || '—'} />
            <Row label="Typical setting"  value={profile.setting || '—'} />
            <Row label="Primary modifier" value={profile.modifier || '—'} />
          </>
        ) : !serverLoad ? (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)', padding: '4px 0' }}>
            No profile saved — complete onboarding to set these values.
          </div>
        ) : (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)', padding: '4px 0' }}>Loading…</div>
        )}
        {prefs && Object.keys(prefs).filter(k => k !== 'photographer_profile').length > 0 && (
          <>
            <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-secondary)', margin: '8px 0 4px' }}>
              Other saved preferences
            </div>
            {Object.entries(prefs)
              .filter(([k]) => k !== 'photographer_profile')
              .map(([k, v]) => (
                <Row key={k} label={k} value={typeof v === 'object' ? JSON.stringify(v) : String(v ?? '—')} mono />
              ))}
          </>
        )}
      </Card>

      {/* ── 3. Subscription ─────────────────────────────────────────────── */}
      <Card
        title="Subscription / Paywall"
        subtitle="localStorage flags + server subscription status"
      >
        <Row label="Paid (localStorage)"
          badge={isPaid ? 'PAID' : 'FREE'}
          badgeColor={isPaid ? C.green : C.amber}
          action={isPaid
            ? () => { try { localStorage.removeItem('ngw_paid'); localStorage.removeItem('ngw_subscription_plan'); } catch {} refresh(); }
            : () => { try { localStorage.setItem('ngw_paid', 'true'); } catch {} refresh(); }
          }
          actionLabel={isPaid ? 'Force Lock' : 'Force Unlock'}
          actionTitle={isPaid ? 'Remove ngw_paid' : 'Set ngw_paid=true'}
        />
        <Row label="Plan tier"        value={planTier || '—'} />
        <Row label="Analysis count"   value={String(analysisCount)} />
        <Row label="QA free mode"
          badge={qaFree ? 'ON' : 'off'}
          badgeColor={qaFree ? C.amber : C.muted}
        />
        <Row label="Post-payment"
          badge={postPayment ? 'YES' : 'no'}
          badgeColor={postPayment ? C.blue : C.muted}
        />
        {stripeSession && (
          <Row label="Pending Stripe session" value={stripeSession} mono
            action={() => clearKey(localStorage, 'ngw_stripe_session')}
            actionTitle="Clear pending Stripe session"
          />
        )}
      </Card>

      {/* ── 4. Saved Data ────────────────────────────────────────────────── */}
      <Card
        title="Saved Data"
        subtitle="Server-synced setups and kit (GET /api/user/setups, /api/user/kit)"
        action={<ServerStatus loading={serverLoad} error={null} />}
      >
        {/* Summary row */}
        <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)', flexWrap: 'wrap' }}>
          {[
            { label: 'Saved Setups', value: setupCount != null ? setupCount : serverLoad ? '…' : '—', color: C.blue },
            { label: 'Kit Items',    value: kitItems   != null ? kitItems   : serverLoad ? '…' : '—', color: C.green },
          ].map(stat => (
            <div key={stat.label} style={{
              background: 'var(--color-surface-elevated)',
              border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-xs) var(--space-md)',
              textAlign: 'center', minWidth: 90,
            }}>
              <div style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: stat.color }}>{stat.value}</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)', marginTop: 2 }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Setup cards */}
        {serverLoad && !Array.isArray(setups) && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)', padding: '8px 0' }}>Loading setups…</div>
        )}
        {Array.isArray(setups) && setups.length === 0 && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)', padding: '8px 0' }}>No setups saved yet.</div>
        )}
        {Array.isArray(setups) && setups.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {setups.map((s, i) => {
              const result  = s.result || {};
              const pattern = result.pattern || result.lighting_pattern || result.look || null;
              const env     = result.environment || result.space || null;
              const created = s.created_at ? new Date(s.created_at * 1000).toLocaleDateString() : null;
              const TAG_COLOR = { personal: C.blue, client: C.green, test: C.amber };
              const tagColor  = TAG_COLOR[s.tag] || 'var(--color-text-dim)';
              return (
                <div key={s.id || i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                  padding: '8px 10px',
                  background: 'var(--color-surface-elevated)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                }}>
                  {/* Index badge */}
                  <span style={{
                    flexShrink: 0, width: 20, height: 20,
                    borderRadius: '50%',
                    background: 'var(--color-border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 9, fontWeight: 700, color: 'var(--color-text-dim)',
                    marginTop: 1,
                  }}>{i + 1}</span>

                  {/* Main content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text)', marginBottom: 3 }}>
                      {s.name || '(unnamed)'}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                      {pattern && (
                        <span style={{
                          fontSize: 9, padding: '1px 6px',
                          borderRadius: 'var(--radius-full)',
                          background: C.blue + '22', color: C.blue,
                          border: `1px solid ${C.blue}33`, fontWeight: 600,
                        }}>{pattern}</span>
                      )}
                      {env && (
                        <span style={{
                          fontSize: 9, padding: '1px 6px',
                          borderRadius: 'var(--radius-full)',
                          background: 'var(--color-border)',
                          color: 'var(--color-text-secondary)',
                        }}>{env}</span>
                      )}
                      {s.tag && (
                        <span style={{
                          fontSize: 9, padding: '1px 6px',
                          borderRadius: 'var(--radius-full)',
                          background: tagColor + '22', color: tagColor,
                          border: `1px solid ${tagColor}33`, fontWeight: 600,
                        }}>{s.tag}</span>
                      )}
                    </div>
                  </div>

                  {/* Date */}
                  {created && (
                    <span style={{ flexShrink: 0, fontSize: 9, color: 'var(--color-text-dim)', marginTop: 3 }}>
                      {created}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ── 5. Feature Flags ─────────────────────────────────────────────── */}
      <Card
        title="Feature Flags"
        subtitle="ngw_feature_flags in localStorage — merged with defaults"
        action={<SmallBtn onClick={resetFlags}>Reset All</SmallBtn>}
      >
        {Object.entries(mergedFlags).map(([key, val]) => {
          const isOverridden = key in featureFlags;
          return (
            <div key={key} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '4px 0', borderBottom: '1px solid var(--color-border)',
              fontSize: 'var(--text-xs)',
            }}>
              <span style={{ color: 'var(--color-text-secondary)', minWidth: 230, flexShrink: 0, fontFamily: 'var(--font-mono)' }}>
                {key}
                {isOverridden && (
                  <span style={{ marginLeft: 4, fontSize: '0.6rem', color: C.amber }}>overridden</span>
                )}
              </span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', userSelect: 'none' }}>
                <input type="checkbox" checked={!!val} onChange={e => setFlag(key, e.target.checked)} style={{ cursor: 'pointer' }} />
                <span style={{ color: val ? C.green : 'var(--color-text-dim)', fontWeight: 600 }}>
                  {val ? 'enabled' : 'disabled'}
                </span>
              </label>
            </div>
          );
        })}
      </Card>

      {/* ── 6. Session State ─────────────────────────────────────────────── */}
      <Card
        title="Session State"
        subtitle="sessionStorage keys — cleared on tab close"
      >
        <Row label="Analysis count (session)" value={String(analysisCount)} />
        <Row label="QA free mode"             value={qaFree ? 'active (?qa_free=1)' : 'inactive'} />
        <Row label="Post-payment"             value={postPayment ? 'pending flush' : 'none'}
          action={postPayment ? () => clearKey(sessionStorage, 'ngw_post_payment') : undefined}
        />
        <Row label="Preview access"  value={previewAccess ?? '—'}
          action={previewAccess ? () => clearKey(sessionStorage, 'ngw_preview_access') : undefined}
        />
        <Row label="Preview role"    value={previewRole ?? '—'}
          action={previewRole ? () => clearKey(sessionStorage, 'ngw_preview_role') : undefined}
        />
        <Row label="Max price seen"  value={maxPriceSeen != null ? `$${maxPriceSeen}` : '—'}
          action={maxPriceSeen != null ? () => clearKey(sessionStorage, 'ngw_max_price_seen') : undefined}
        />
      </Card>

      {/* ── 7. Lab Preferences ───────────────────────────────────────────── */}
      <Card
        title="Lab Preferences"
        subtitle="Persisted lab UI state (synced to server when logged in)"
      >
        <Row label="Tab order"
          value={tabOrder ? tabOrder.join(' → ') : 'default (not customized)'}
          action={tabOrder ? () => clearKey(localStorage, 'ngw_lab_tab_order') : undefined}
          actionLabel="Reset"
          actionTitle="Revert to default tab order"
        />
      </Card>

      {/* ── 8. Local Storage Dump ────────────────────────────────────────── */}
      <Card
        title="Local Storage — All ngw_* Keys"
        subtitle={`${Object.keys(lsKeys).length} localStorage + ${Object.keys(ssKeys).length} sessionStorage keys`}
      >
        {Object.keys(lsKeys).length === 0 && Object.keys(ssKeys).length === 0 ? (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)', padding: '4px 0' }}>
            No ngw_* keys found in localStorage or sessionStorage.
          </div>
        ) : (
          <>
            {Object.entries(lsKeys).map(([key, val]) => (
              <Row key={key}
                label={`LS · ${key}`}
                value={typeof val === 'object' ? JSON.stringify(val) : String(val ?? '—')}
                mono
                action={() => clearKey(localStorage, key)}
                actionTitle={`Remove ${key} from localStorage`}
              />
            ))}
            {Object.entries(ssKeys).map(([key, val]) => (
              <Row key={key}
                label={`SS · ${key}`}
                value={typeof val === 'object' ? JSON.stringify(val) : String(val ?? '—')}
                mono
                action={() => clearKey(sessionStorage, key)}
                actionTitle={`Remove ${key} from sessionStorage`}
              />
            ))}
          </>
        )}
      </Card>

      <div style={{ textAlign: 'right', fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)' }}>
        <SmallBtn onClick={refresh}>↻ Refresh all</SmallBtn>
      </div>
    </div>
  );
}
