/**
 * Analytics — tracks events locally and forwards to /api/track.
 * Fire-and-forget: never blocks, never throws.
 */

import { getSessionId as _getSessionId } from './flagsStore';

/** Re-exported from flagsStore — single source of truth for session ID. */
export { _getSessionId as getSessionId };

const EVENTS_KEY = 'ngw_analytics_events';
const MAX_EVENTS = 200;

/**
 * Track a named event with optional payload.
 * Writes to localStorage AND posts to /api/track (fire-and-forget).
 * @param {string} name  - e.g. 'SETUP_SAVED', 'UPGRADE_CLICKED'
 * @param {object} [data] - additional context
 */
export function trackEvent(name, data = {}) {
  try {
    if (import.meta.env?.DEV) {
      console.debug('[NGW]', name, data);
    }
    const events = (() => {
      try { return JSON.parse(localStorage.getItem(EVENTS_KEY)) || []; } catch { return []; }
    })();
    events.push({ name, data, ts: Date.now() });
    if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
    localStorage.setItem(EVENTS_KEY, JSON.stringify(events));
  } catch { /* never throw */ }

  // Fire-and-forget to server
  try {
    const session_id = _getSessionId();
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, session_id, data }),
      keepalive: true,
    }).catch(() => {});
  } catch { /* never throw */ }
}

/** Read stored events — useful for debugging. */
export function getStoredEvents() {
  try {
    return JSON.parse(localStorage.getItem(EVENTS_KEY)) || [];
  } catch { return []; }
}

/** Clear stored events. */
export function clearEvents() {
  try { localStorage.removeItem(EVENTS_KEY); } catch {}
}

/**
 * Mark or unmark the current session as a test/dev session.
 * Excluded sessions are removed from all analytics metrics and dashboards.
 * Requires the user to be authenticated (token from authApi).
 *
 * @param {boolean} [exclude=true]  true = mark as test, false = restore to production
 * @returns {Promise<boolean>}      true on success
 */
export async function excludeCurrentSession(exclude = true) {
  const sessionId = _getSessionId();
  if (!sessionId) return false;
  try {
    const { getToken } = await import('./authApi');
    const token = getToken();
    if (!token) return false;
    const res = await fetch(`/api/analytics/sessions/${sessionId}/exclude`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ exclude }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
