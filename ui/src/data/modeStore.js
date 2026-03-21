/**
 * Shoot Mode feedback-display mode store.
 *
 * Tracks HOW instructions are phrased — independently of the on-set role
 * (photographer / assistant / second_shooter).
 *
 * mode = "photographer" | "assistant" | "learning"
 *   photographer — conversational, includes brief reasoning  (default)
 *   assistant    — direct commands, no explanation, short sentences
 *   learning     — full text + explicit cause-and-effect framing
 */

const MODE_KEY = 'ngw_mode';
const VALID_MODES = new Set(['photographer', 'assistant', 'learning']);
const DEFAULT_MODE = 'photographer';

/**
 * Persist the selected mode.
 * @param {string} mode
 */
export function saveMode(mode) {
  try {
    if (VALID_MODES.has(mode)) localStorage.setItem(MODE_KEY, mode);
  } catch { /* quota / private mode — ignore */ }
}

/**
 * Load the persisted mode, falling back to 'photographer' if missing or invalid.
 * @returns {'photographer'|'assistant'|'learning'}
 */
export function loadMode() {
  try {
    const stored = localStorage.getItem(MODE_KEY);
    return VALID_MODES.has(stored) ? stored : DEFAULT_MODE;
  } catch {
    return DEFAULT_MODE;
  }
}
