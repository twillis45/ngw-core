/**
 * Analytics — tracks events locally and forwards to /api/track.
 * Fire-and-forget: never blocks, never throws.
 */

const EVENTS_KEY = 'ngw_analytics_events';
const SESSION_KEY = 'ngw_session_id';
const MAX_EVENTS = 200;

/** Persistent session ID for this browser session. */
function getSessionId() {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = Math.random().toString(36).slice(2, 10).toUpperCase();
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

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
    const session_id = getSessionId();
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
