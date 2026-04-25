/**
 * Team Session store — backend-backed shoot session sharing.
 *
 * A photographer creates a session from the cockpit. The session stores
 * the lighting setup context behind a short share token. An assistant
 * opens the token URL on their device and sees the setup.
 *
 * Sessions expire after 24 hours. No real-time sync — this is a
 * persistent "here's what we're shooting" handoff.
 *
 * API:
 *   POST   /api/team-sessions          — create (authenticated)
 *   GET    /api/team-sessions/{token}   — view (no auth)
 *   PUT    /api/team-sessions/{token}   — update (creator only)
 */
import { getToken } from './authApi';

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function sessionFetch(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...authHeaders(),
    ...options.headers,
  };
  const res = await fetch(`/api/team-sessions${path}`, { ...options, headers });
  const text = await res.text().catch(() => '');
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* ignore */ }

  if (!res.ok) {
    const err = new Error(data?.detail || `Session error (${res.status})`);
    err.status = res.status;
    err.detail = data?.detail;
    throw err;
  }
  return data;
}

/**
 * Create a new shared shoot session.
 * @param {string} setupName — human-readable name (e.g. pattern name)
 * @param {object} setupData — the result/analysis payload to share
 * @returns {Promise<{ id, share_token, share_url, setup_name, created_at, expires_at }>}
 */
export async function createSession(setupName, setupData) {
  return sessionFetch('', {
    method: 'POST',
    body: JSON.stringify({
      setup_name: setupName || 'Shoot Session',
      setup_data: setupData || {},
    }),
  });
}

/**
 * Fetch a session by its share token. No auth required.
 * @param {string} shareToken
 * @returns {Promise<{ id, share_token, setup_name, setup_data, creator_email, created_at, expires_at }>}
 * @throws {Error} with .status 404 (not found) or 410 (expired)
 */
export async function getSession(shareToken) {
  return sessionFetch(`/${shareToken}`, { method: 'GET' });
}

/**
 * Update a session (creator only).
 * @param {string} shareToken
 * @param {{ setup_name?: string, setup_data?: object }} updates
 */
export async function updateSession(shareToken, updates) {
  return sessionFetch(`/${shareToken}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  });
}

/**
 * Build the shareable URL for a session token.
 * @param {string} shareToken
 * @returns {string}
 */
export function getShareUrl(shareToken) {
  const base = window.location.origin + window.location.pathname;
  return `${base}?session=${shareToken}`;
}

/**
 * Parse session token from the current page URL.
 * @returns {string|null}
 */
export function getSessionFromUrl() {
  try {
    return new URLSearchParams(window.location.search).get('session') || null;
  } catch { return null; }
}

// ── Legacy backward-compat shims ────────────────────────────────────────────
// ShootModeScreen (legacy) imports these synchronous functions.
// They now read/write localStorage as a local cache only — the real
// session lives on the backend.
const _LOCAL_KEY = 'ngw_team_session';

/** @deprecated Use getSession(token) instead. */
export function loadSession() {
  try { return JSON.parse(localStorage.getItem(_LOCAL_KEY)); } catch { return null; }
}

/** @deprecated Sessions expire server-side. */
export function clearSession() {
  try { localStorage.removeItem(_LOCAL_KEY); } catch {}
}
