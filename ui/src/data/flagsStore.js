/**
 * NGW Feature Flags Store
 *
 * Fetches evaluated flags from /api/flags once per session.
 * Caches in sessionStorage for 5 minutes.
 * Falls back to empty (all control) if the request fails.
 *
 * Usage:
 *   import { fetchFlags, isEnabled, getFlagConfig } from './flagsStore';
 *   await fetchFlags();
 *   if (isEnabled('pricing_v2_59_monthly')) { ... }
 */

const CACHE_KEY = 'ngw_flags';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let _flags = null;
let _sessionId = null;
let _fetchPromise = null;

// ── Session ID ──────────────────────────────────────────────────────────────

export function getSessionId() {
  if (_sessionId) return _sessionId;
  try {
    let id = sessionStorage.getItem('ngw_session_id');
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
      sessionStorage.setItem('ngw_session_id', id);
    }
    _sessionId = id;
  } catch {
    _sessionId = 'anon';
  }
  return _sessionId;
}

// ── Cache ───────────────────────────────────────────────────────────────────

function loadCached() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { flags, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) return null;
    return flags;
  } catch {
    return null;
  }
}

function saveCache(flags) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ flags, ts: Date.now() }));
  } catch { /* quota / private mode */ }
}

// ── Fetch ───────────────────────────────────────────────────────────────────

export async function fetchFlags() {
  if (_flags) return _flags;

  const cached = loadCached();
  if (cached) {
    _flags = cached;
    return _flags;
  }

  // Deduplicate concurrent calls
  if (_fetchPromise) return _fetchPromise;

  _fetchPromise = (async () => {
    try {
      const sid = getSessionId();
      const res = await fetch(`/api/flags?session_id=${encodeURIComponent(sid)}`);
      if (!res.ok) throw new Error(`flags fetch ${res.status}`);
      const data = await res.json();
      _flags = data.flags || {};
      saveCache(_flags);
      return _flags;
    } catch {
      _flags = {};  // Fail open — all control
      return _flags;
    } finally {
      _fetchPromise = null;
    }
  })();

  return _fetchPromise;
}

// ── Evaluation ──────────────────────────────────────────────────────────────

/** Is this flag active (enabled + treatment variant) for this session? */
export function isEnabled(flagName) {
  if (!_flags) return false;
  const f = _flags[flagName];
  return !!(f?.enabled && f?.variant === 'treatment');
}

/** Get the config for a treatment flag, or null if control/disabled. */
export function getFlagConfig(flagName) {
  if (!_flags) return null;
  const f = _flags[flagName];
  if (!f || f.variant !== 'treatment' || !f.enabled) return null;
  return f.config || null;
}

/**
 * Get the active flag in a mutually exclusive group.
 * Returns { name, config, variant } for the first treatment flag in that group,
 * or null if none is active (→ use defaults).
 */
export function getActiveInGroup(group) {
  if (!_flags) return null;
  for (const [name, def] of Object.entries(_flags)) {
    if (def.group === group && def.variant === 'treatment' && def.enabled) {
      return { name, config: def.config || {}, variant: def.variant };
    }
  }
  return null;
}

/** Return the raw flags map (for debugging / dashboard). */
export function getAllFlags() {
  return _flags || {};
}

/** Clear cache and in-memory state (e.g. after login). */
export function invalidateFlags() {
  _flags = null;
  try { sessionStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
}
