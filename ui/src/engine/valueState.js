/**
 * Value State Detection — Part 16.1 (client-side mirror)
 *
 * Detects which of 5 value states the user is in based on client signals.
 * Used to drive getAdaptivePricing() without a server round-trip.
 *
 * States (priority order):
 *   SUCCESS_MOMENT   — NAILED_IT just happened in this session
 *   FAILURE_TENSION  — MISSED_IT just happened in this session
 *   HIGH_INTENT      — returning user or deep shoot-mode engagement
 *   DISCOVERY        — multiple analyses or blueprint exploration
 *   LOW_VALUE        — first session, low engagement, no outcome yet
 */

export const VALUE_STATES = {
  SUCCESS_MOMENT:  'success_moment',
  FAILURE_TENSION: 'failure_tension',
  HIGH_INTENT:     'high_intent',
  DISCOVERY:       'discovery',
  LOW_VALUE:       'low_value',
};

/**
 * Detect the current user value state from available client signals.
 *
 * @param {object}       params
 * @param {string|null}  params.recentOutcome   — 'nailed_it' | 'missed_it' | null
 * @param {number}       params.usageCount      — analyses performed this session
 * @param {number}       params.sessionCount    — previous sessions (from localStorage)
 * @param {boolean}      params.shootModeUsed   — user entered Shoot Mode this session
 * @param {number}       params.blueprintViews  — blueprint detail views this session
 * @returns {{ state: string, signals: object }}
 */
export function detectValueState({
  recentOutcome  = null,
  usageCount     = 0,
  sessionCount   = 0,
  shootModeUsed  = false,
  blueprintViews = 0,
} = {}) {
  const signals = { recentOutcome, usageCount, sessionCount, shootModeUsed, blueprintViews };

  // Priority 1: outcome signals (highest conviction)
  if (recentOutcome === 'nailed_it') {
    return { state: VALUE_STATES.SUCCESS_MOMENT, signals };
  }
  if (recentOutcome === 'missed_it') {
    return { state: VALUE_STATES.FAILURE_TENSION, signals };
  }

  // Priority 2: high intent (returning + engaged)
  if (sessionCount >= 2 || (shootModeUsed && usageCount >= 2)) {
    return { state: VALUE_STATES.HIGH_INTENT, signals };
  }

  // Priority 3: discovery (exploring the system)
  if (usageCount >= 2 || blueprintViews >= 1) {
    return { state: VALUE_STATES.DISCOVERY, signals };
  }

  // Default: low value (new, unengaged)
  return { state: VALUE_STATES.LOW_VALUE, signals };
}

// ── Session counter helpers ───────────────────────────────────────────────────

const SESSION_COUNT_KEY = 'ngw_session_count';

/** Get how many sessions this user has had (from localStorage). */
export function getSessionCount() {
  try {
    return parseInt(localStorage.getItem(SESSION_COUNT_KEY) || '0', 10);
  } catch {
    return 0;
  }
}

/**
 * Increment the session counter.
 * Call once on app init (e.g. in App.jsx useEffect on mount).
 */
export function incrementSessionCount() {
  try {
    const count = parseInt(localStorage.getItem(SESSION_COUNT_KEY) || '0', 10);
    const next = count + 1;
    localStorage.setItem(SESSION_COUNT_KEY, String(next));
    return next;
  } catch {
    return 1;
  }
}
