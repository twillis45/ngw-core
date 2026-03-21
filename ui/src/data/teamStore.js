/**
 * Team Mode — lightweight client-side session management (beta).
 *
 * Sessions are identified by a 6-character alphanumeric ID.
 * Share URL embeds the session ID as a query param: ?session=XXXXXX
 *
 * Beta: no server-side sync — participants use the same session ID
 * to confirm they are working on the same setup.
 * A future version will poll a lightweight /api/team-session endpoint.
 */

const SESSION_KEY = 'ngw_team_session';

/**
 * Create a new team session.
 * @param {string} setupName - human-readable name of the active setup
 * @returns {{ id: string, setupName: string, createdAt: number }}
 */
export function createSession(setupName) {
  const id = [...Array(6)]
    .map(() => Math.random().toString(36).slice(2, 3))
    .join('')
    .toUpperCase();
  const session = { id, setupName: setupName || 'Shoot Session', createdAt: Date.now() };
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch {}
  return session;
}

/** Load the current session from localStorage. */
export function loadSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
}

/** Clear the current session. */
export function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch {}
}

/**
 * Build the shareable URL for a session.
 * @param {string} sessionId
 * @returns {string}
 */
export function getShareUrl(sessionId) {
  const base = window.location.origin + window.location.pathname;
  return `${base}?session=${sessionId}`;
}

/**
 * Parse session ID from the current page URL (for join flow).
 * @returns {string|null}
 */
export function getSessionFromUrl() {
  try {
    return new URLSearchParams(window.location.search).get('session') || null;
  } catch { return null; }
}
