/**
 * Shoot Mode API client
 * Calls the /api/shoot-mode/* endpoints.
 */

import { apiFetch } from '../lib/apiClient';

const BASE = '/api';

/**
 * Start a shoot mode session — transforms the shoot-match result
 * into structured step-by-step instructions for the given role.
 *
 * @param {object} result  - Full result from shoot-match (from AppContext)
 * @param {string} [ceilingHeight] - Ceiling key: "low"/"normal"/"high"/"very_high"
 * @param {string} [role]  - "photographer" | "assistant" | "learning"
 * @param {{ lengthFt: number, widthFt: number, ceilingFt: number }} [roomDimensions]
 * @returns {Promise<object>} { status, sessionId, metadata, steps[] }
 */
export async function startShootMode(result, ceilingHeight = null, role = 'photographer', roomDimensions = null) {
  const body = { result, ceilingHeight, role };
  if (roomDimensions) {
    body.roomDimensionsFt = {
      lengthFt: roomDimensions.lengthFt,
      widthFt: roomDimensions.widthFt,
      ceilingFt: roomDimensions.ceilingFt,
    };
  }
  const res = await apiFetch(`${BASE}/shoot-mode/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Failed to start shoot mode');
  }
  return res.json();
}

/**
 * Evaluate a test shot against the current setup.
 *
 * @param {string} testShotPath - Server path to the uploaded test shot
 * @param {string} [setupId]    - Optional session/setup identifier
 * @returns {Promise<object>} { status, notes[], ... }
 */
export async function evaluateTestShot(testShotPath, setupId = null) {
  const res = await apiFetch(`${BASE}/shoot-mode/evaluate-test-shot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ testShotPath, setupId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Failed to evaluate test shot');
  }
  return res.json();
}
