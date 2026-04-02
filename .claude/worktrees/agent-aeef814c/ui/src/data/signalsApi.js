/**
 * Session Signals API — client-side functions.
 *
 * Core loop: Prediction → Action → Outcome → Signal → Learning → Improvement
 *
 * POST /api/lab/signals              — no auth required (public write endpoint)
 * GET  /api/lab/signals/summary      — headline KPIs (requires dev auth)
 * GET  /api/lab/signals/patterns     — per-pattern breakdown (requires dev auth)
 * GET  /api/lab/signals/calibration  — confidence vs outcome (requires dev auth)
 * GET  /api/lab/signals/recent       — latest N signals (requires dev auth)
 * GET  /api/lab/signals/hygiene      — hygiene summary card (requires dev auth)
 *
 * source param values: 'live' | 'seeded' | 'internal' | 'expert_review' | 'all'
 * When source is omitted the backend defaults to analytics-eligible rows only.
 */
import { getToken } from './authApi';
import { apiFetch } from '../lib/apiClient';

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Post one session signal.
 * Called when user taps "Nailed It / Close / Didn't Work".
 * No auth required — fires and forgets from the client.
 *
 * @param {Object} payload
 * @param {string} payload.pattern_id          — required
 * @param {number} [payload.confidence_score]  — 0–1
 * @param {string} [payload.outcome]           — 'nailed_it' | 'close' | 'failed'
 * @param {string} [payload.session_id]
 * @param {string} [payload.user_id]
 * @param {string} [payload.input_method]      — 'wizard' | 'reference_photo' | 'manual'
 * @param {string} [payload.subject_type]
 * @param {string} [payload.environment]
 * @param {string} [payload.mood]
 * @param {boolean}[payload.shoot_mode_entered]
 * @param {number} [payload.steps_completed]
 * @param {number} [payload.steps_total]
 * @param {number} [payload.deviation_count]
 * @param {boolean}[payload.saved_setup]
 * @param {boolean}[payload.upgraded]
 * @param {number} [payload.revenue_value]
 * @param {string} [payload.signal_source]     — 'live' (default) | 'internal' | 'expert_review'
 */
export async function postSignal(payload) {
  try {
    const res = await apiFetch('/api/lab/signals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signal_source: 'live', ...payload }),
    });
    return await res.json();
  } catch (err) {
    // Signal failures must NEVER break the UI flow — swallow silently
    console.warn('[signals] write failed:', err.message);
    return null;
  }
}

/**
 * Headline KPIs.
 * @param {number} days
 * @param {string} [source] — 'live'|'seeded'|'internal'|'expert_review'|'all'
 *   Omit to use the backend default (metrics-eligible / include_in_metrics=1).
 */
export async function getSignalSummary(days = 30, source = null) {
  const params = new URLSearchParams({ days });
  if (source) params.set('source', source);
  const res = await apiFetch(`/api/lab/signals/summary?${params}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Signals summary error (${res.status})`);
  return res.json();
}

/**
 * Per-pattern breakdown.
 * @param {number} days
 * @param {string} [source] — see getSignalSummary
 */
export async function getSignalPatterns(days = 30, source = null) {
  const params = new URLSearchParams({ days });
  if (source) params.set('source', source);
  const res = await apiFetch(`/api/lab/signals/patterns?${params}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Signals patterns error (${res.status})`);
  return res.json();
}

/**
 * Confidence vs outcome mismatch per pattern.
 * @param {number} days
 * @param {string} [source]
 */
export async function getSignalCalibration(days = 30, source = null) {
  const params = new URLSearchParams({ days });
  if (source) params.set('source', source);
  const res = await apiFetch(`/api/lab/signals/calibration?${params}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Signals calibration error (${res.status})`);
  return res.json();
}

/**
 * Latest N signals.
 * @param {number} limit
 * @param {string|null} patternId
 * @param {string} [source] — defaults to 'live' (show real sessions)
 */
export async function getRecentSignals(limit = 50, patternId = null, source = 'live') {
  const params = new URLSearchParams({ limit, source });
  if (patternId) params.set('pattern_id', patternId);
  const res = await apiFetch(`/api/lab/signals/recent?${params}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Recent signals error (${res.status})`);
  return res.json();
}

/**
 * Signal Hygiene summary — counts by source and by analytics eligibility.
 * Returns: { total, live, seeded, internal, expert_review,
 *             learning_eligible, metrics_eligible, conversion_eligible, cohorts_eligible }
 */
export async function getSignalHygiene() {
  const res = await apiFetch('/api/lab/signals/hygiene', {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error(`Hygiene summary error (${res.status})`);
  return res.json();
}

/** Trigger seed (dev/lab only) */
export async function seedSignals(force = false) {
  const res = await apiFetch(`/api/lab/signals/seed?force=${force}`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Seed error (${res.status})`);
  return res.json();
}
