/**
 * Shoot Mode localStorage persistence
 * Tracks setup progress, completed steps, and role selection.
 */

const PREFIX = 'ngw_shoot_';
const ROLE_KEY = 'ngw_shoot_role';

/**
 * Save progress for a shoot mode session.
 * @param {string} sessionId
 * @param {{ currentStep: number, completedSteps: string[], role: string, startedAt: string }} progress
 */
export function saveShootProgress(sessionId, progress) {
  try {
    const key = `${PREFIX}${sessionId}`;
    localStorage.setItem(key, JSON.stringify({
      ...progress,
      updatedAt: new Date().toISOString(),
    }));
  } catch { /* quota exceeded or private mode */ }
}

/**
 * Load progress for a shoot mode session.
 * @param {string} sessionId
 * @returns {object|null}
 */
export function loadShootProgress(sessionId) {
  try {
    const key = `${PREFIX}${sessionId}`;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/**
 * Clear progress for a session (e.g. when done or starting fresh).
 * @param {string} sessionId
 */
export function clearShootProgress(sessionId) {
  try {
    localStorage.removeItem(`${PREFIX}${sessionId}`);
  } catch { /* ignore */ }
}

/**
 * Save the user's preferred shoot mode role.
 * @param {string} role - "photographer" | "assistant" | "learning"
 */
export function saveShootRole(role) {
  try {
    localStorage.setItem(ROLE_KEY, role);
  } catch { /* ignore */ }
}

/**
 * Load the user's last-used shoot mode role.
 * @returns {string|null}
 */
export function loadShootRole() {
  try {
    return localStorage.getItem(ROLE_KEY);
  } catch { return null; }
}

/**
 * Get the most recently active session (for resume prompts).
 * Scans all ngw_shoot_* keys and returns the one with the latest updatedAt.
 * @returns {{ sessionId: string, progress: object }|null}
 */
export function getActiveSession() {
  try {
    let latest = null;
    let latestTime = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(PREFIX) && key !== ROLE_KEY) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const data = JSON.parse(raw);
          const t = new Date(data.updatedAt || 0).getTime();
          if (t > latestTime) {
            latestTime = t;
            latest = { sessionId: key.slice(PREFIX.length), progress: data };
          }
        }
      }
    }
    return latest;
  } catch { return null; }
}
