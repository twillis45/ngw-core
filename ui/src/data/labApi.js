/**
 * Lab API client — mirrors authApi.js patterns.
 * All endpoints require dev-level auth (JWT + email whitelist).
 */

import { getToken } from './authApi';

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function labFetch(path, options = {}) {
  const headers = { ...authHeaders(), ...options.headers };
  // Don't set Content-Type for FormData (browser sets it with boundary)
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`/api/lab${path}`, { headers, ...options });
  const data = await res.json();
  if (!res.ok) {
    const msg = data.detail || `Lab API error (${res.status})`;
    throw new Error(msg);
  }
  return data;
}


// ── Status ───────────────────────────────────────────────

export async function checkLabAccess() {
  return labFetch('/status');
}

/**
 * Probe the server to see if the current user is a whitelisted dev.
 * If so, auto-enable the Lab feature flag — no console needed.
 * Safe to call anytime; silently no-ops if not authorized.
 */
export async function probeAndEnableLab() {
  try {
    const { setFlag } = await import('../modes/featureFlags');
    await labFetch('/status');
    // 200 means user is on the whitelist
    setFlag('enable_lab', true);
    return true;
  } catch (err) {
    // 401/403 or network error — not a dev, leave flag as-is
    console.warn('[Lab] probe failed:', err.message);
    return false;
  }
}


// ── Workbench ────────────────────────────────────────────

export async function analyzeImage(file, { debug = false } = {}) {
  const form = new FormData();
  form.append('image', file);
  const query = debug ? '?debug=true' : '';
  return labFetch(`/analyze${query}`, { method: 'POST', body: form });
}


// ── Gold Set ─────────────────────────────────────────────

export async function listGoldSet(status = null, limit = 50) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  params.set('limit', String(limit));
  return labFetch(`/gold-set?${params}`);
}

export async function getGoldSetEntry(entryId) {
  return labFetch(`/gold-set/${entryId}`);
}

export async function createGoldSetEntry(data) {
  return labFetch('/gold-set', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateGoldSetEntry(entryId, data) {
  return labFetch(`/gold-set/${entryId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteGoldSetEntry(entryId) {
  return labFetch(`/gold-set/${entryId}`, { method: 'DELETE' });
}

export async function evaluateGoldSet(limit = 50) {
  const params = new URLSearchParams();
  params.set('limit', String(limit));
  return labFetch(`/gold-set/evaluate?${params}`, { method: 'POST' });
}


// ── Rule Candidates ──────────────────────────────────────

export async function listCandidates(status = null, limit = 50) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  params.set('limit', String(limit));
  return labFetch(`/candidates?${params}`);
}

export async function getCandidate(candidateId) {
  return labFetch(`/candidates/${candidateId}`);
}

export async function createCandidate(data) {
  return labFetch('/candidates', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateCandidate(candidateId, data) {
  return labFetch(`/candidates/${candidateId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteCandidate(candidateId) {
  return labFetch(`/candidates/${candidateId}`, { method: 'DELETE' });
}


// ── Reference Dataset ───────────────────────────────────

export async function ingestReferenceImage(file, metadata, { runPipeline = true, runVlm = true, overwrite = false } = {}) {
  const form = new FormData();
  form.append('image', file);
  const params = new URLSearchParams();
  params.set('metadata_json', JSON.stringify(metadata));
  if (!runPipeline) params.set('run_pipeline', 'false');
  if (!runVlm) params.set('run_vlm', 'false');
  if (overwrite) params.set('overwrite', 'true');
  return labFetch(`/reference-dataset/ingest?${params}`, { method: 'POST', body: form });
}

export async function listReferenceDataset({ patternId = null, status = null, tier = null } = {}) {
  const params = new URLSearchParams();
  if (patternId) params.set('pattern_id', patternId);
  if (status) params.set('status', status);
  if (tier) params.set('tier', tier);
  return labFetch(`/reference-dataset?${params}`);
}

export async function getReferenceEntry(patternId, referenceId, { includeSignals = true, includeVlm = true } = {}) {
  const params = new URLSearchParams();
  if (!includeSignals) params.set('include_signals', 'false');
  if (!includeVlm) params.set('include_vlm', 'false');
  return labFetch(`/reference-dataset/${patternId}/${referenceId}?${params}`);
}

export function getReferenceImageUrl(patternId, referenceId) {
  return `/api/lab/reference-dataset/${patternId}/${referenceId}/image`;
}

export function getReferenceThumbnailUrl(patternId, referenceId) {
  return `/api/lab/reference-dataset/${patternId}/${referenceId}/thumbnail`;
}

export function getReferenceDebugOverlayUrl(patternId, referenceId) {
  return `/api/lab/reference-dataset/${patternId}/${referenceId}/debug-overlay`;
}

export async function approveReference(patternId, referenceId) {
  return labFetch(`/reference-dataset/${patternId}/${referenceId}/approve`, { method: 'POST' });
}

export async function rejectReference(patternId, referenceId, reason = '') {
  const params = new URLSearchParams();
  if (reason) params.set('reason', reason);
  return labFetch(`/reference-dataset/${patternId}/${referenceId}/reject?${params}`, { method: 'POST' });
}

export async function reprocessReference(patternId, referenceId, { runVlm = true } = {}) {
  const params = new URLSearchParams();
  if (!runVlm) params.set('run_vlm', 'false');
  return labFetch(`/reference-dataset/${patternId}/${referenceId}/reprocess?${params}`, { method: 'POST' });
}

export async function getDatasetVersion() {
  return labFetch('/reference-dataset/version');
}

export async function getDatasetManifest() {
  return labFetch('/reference-dataset/manifest');
}
