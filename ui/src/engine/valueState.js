/**
 * valueState — detects the user's current value state for adaptive paywall messaging.
 * Stub implementation — returns 'default' state; replace with full engine when ready.
 */

const SESSION_COUNT_KEY = 'ngw_session_count';

export function getSessionCount() {
  try {
    return parseInt(localStorage.getItem(SESSION_COUNT_KEY) || '1', 10);
  } catch {
    return 1;
  }
}

/**
 * Detect value state based on session signals.
 * Returns one of: 'nailed_it' | 'learning' | 'frustrated' | 'default'
 */
export function detectValueState({
  recentOutcome = null,
  usageCount = 0,
  sessionCount = 1,
  shootModeUsed = false,
  blueprintViews = 0,
} = {}) {
  if (recentOutcome === 'nailed_it' || blueprintViews >= 2 || shootModeUsed) {
    return { state: 'nailed_it' };
  }
  if (usageCount >= 2 || sessionCount >= 3) {
    return { state: 'learning' };
  }
  if (recentOutcome === 'missed_it') {
    return { state: 'frustrated' };
  }
  return { state: 'default' };
}
