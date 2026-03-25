/**
 * Lab API client — mirrors authApi.js patterns.
 * All endpoints require dev-level auth (JWT + email whitelist).
 */

import { getToken } from './authApi';
import { apiFetch } from '../lib/apiClient';

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
  const res = await apiFetch(`/api/lab${path}`, { headers, ...options });
  const data = await res.json();
  if (!res.ok) {
    // FastAPI validation errors return detail as an array of {loc, msg, type} objects
    let msg;
    if (Array.isArray(data.detail)) {
      msg = data.detail.map(e => `${e.loc?.slice(-1)[0] ?? 'field'}: ${e.msg}`).join('; ');
    } else {
      msg = data.detail || `Lab API error (${res.status})`;
    }
    throw new Error(`[${res.status}] ${msg}`);
  }
  return data;
}

/** Fetch from top-level /api routes (intelligence, paywall, etc — not under /api/lab). */
async function coreFetch(path, options = {}) {
  const headers = { ...authHeaders(), ...options.headers };
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await apiFetch(`/api${path}`, { headers, ...options });
  const data = await res.json();
  if (!res.ok) {
    let msg;
    if (Array.isArray(data.detail)) {
      msg = data.detail.map(e => `${e.loc?.slice(-1)[0] ?? 'field'}: ${e.msg}`).join('; ');
    } else {
      msg = data.detail || `API error (${res.status})`;
    }
    throw new Error(`[${res.status}] ${msg}`);
  }
  return data;
}

/**
 * Fetch a binary resource (image) from a lab endpoint with auth headers.
 * Returns a blob URL suitable for use in <img src>.
 * Caller is responsible for revoking the URL via URL.revokeObjectURL when done.
 */
export async function labFetchBlob(path) {
  const headers = authHeaders();
  const res = await apiFetch(`/api/lab${path}`, { headers });
  if (!res.ok) throw new Error(`Lab image fetch failed (${res.status})`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
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

export async function getGoldSetImageUrl(entryId) {
  return labFetchBlob(`/gold-set/${entryId}/image`);
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

/**
 * Bulk-seed the Gold Set from reference dataset entries.
 * @param {Object} opts
 * @param {string} [opts.tier='gold']       - dataset_tier to import
 * @param {string} [opts.patternId]         - limit to one pattern (optional)
 * @param {boolean} [opts.dryRun=false]     - preview without writing
 */
export async function seedGoldSetFromReference({ tier = 'gold', patternId = null, imagePaths = null, force = false, dryRun = false } = {}) {
  return labFetch('/learning/gold-set/seed-from-reference', {
    method: 'POST',
    body: JSON.stringify({
      tier,
      pattern_id:  patternId || null,
      image_paths: imagePaths || null,
      force,
      dry_run:     dryRun,
    }),
  });
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

export async function updateReferenceMetadata(patternId, referenceId, updates) {
  return labFetch(`/reference-dataset/${patternId}/${referenceId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
}

export async function getDatasetVersion() {
  return labFetch('/reference-dataset/version');
}


// ── Learning Ops ─────────────────────────────────────

export async function getLearningOps() {
  return labFetch('/learning/ops');
}

export async function getSchedulerStatus() {
  return labFetch('/learning/scheduler');
}

export async function startScheduler({ intervalHours, windowDays } = {}) {
  return labFetch('/learning/scheduler/start', {
    method: 'POST',
    body: JSON.stringify({
      interval_hours: intervalHours ?? null,
      window_days:    windowDays    ?? null,
    }),
  });
}

export async function stopScheduler() {
  return labFetch('/learning/scheduler/stop', { method: 'POST' });
}

export async function configureScheduler({ intervalHours, windowDays }) {
  return labFetch('/learning/scheduler', {
    method: 'PATCH',
    body: JSON.stringify({
      interval_hours: intervalHours ?? null,
      window_days:    windowDays    ?? null,
    }),
  });
}

export async function runSchedulerNow() {
  return labFetch('/learning/scheduler/run-now', { method: 'POST' });
}

export async function triggerIngestion(days = 30, mode = 'production') {
  return labFetch('/learning/ingest', {
    method: 'POST',
    body: JSON.stringify({ days, mode }),
  });
}

export async function listFailureClusters({ status, severity, limit = 50 } = {}) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (severity) params.set('severity', severity);
  params.set('limit', limit);
  return labFetch(`/learning/clusters?${params}`);
}

export async function getFailureCluster(clusterId) {
  return labFetch(`/learning/clusters/${clusterId}`);
}

export async function updateClusterStatus(clusterId, status, notes = '') {
  return labFetch(`/learning/clusters/${clusterId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status, notes }),
  });
}

export async function generateCandidateFromCluster(clusterId) {
  return labFetch(`/learning/clusters/${clusterId}/generate-candidate`, {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function evaluateCandidate(candidateId, { autoReleaseOnSafe = false } = {}) {
  return labFetch(`/learning/candidates/${candidateId}/evaluate`, {
    method: 'POST',
    body: JSON.stringify({ auto_release_on_safe: autoReleaseOnSafe }),
  });
}

export async function getCandidateEvaluations(candidateId) {
  return labFetch(`/learning/candidates/${candidateId}/evaluations`);
}

export async function recordRelease(candidateId, { releaseVersion, expectedLift = {} } = {}) {
  return labFetch(`/learning/candidates/${candidateId}/release`, {
    method: 'POST',
    body: JSON.stringify({ release_version: releaseVersion, expected_lift: expectedLift }),
  });
}

export async function getMonitoringSummary() {
  return labFetch('/learning/monitoring');
}

export async function getMonitoringReport(attributionId) {
  return labFetch(`/learning/monitoring/${attributionId}`);
}

export async function triggerMonitoringSweep(windowDays = 30) {
  return labFetch('/learning/monitoring/sweep', {
    method: 'POST',
    body: JSON.stringify({ window_days: windowDays }),
  });
}

export async function getDatasetManifest() {
  return labFetch('/reference-dataset/manifest');
}

// ── Benchmark System v2 ────────────────────────────────────────────────────

/** List all benchmark cases. */
export async function listBenchmarkCases({ patternId, difficulty, limit = 100 } = {}) {
  const params = new URLSearchParams();
  if (patternId)  params.set('pattern_id', patternId);
  if (difficulty) params.set('difficulty',  difficulty);
  params.set('limit', String(limit));
  return labFetch(`/benchmarks/cases?${params}`);
}

/** Get a single benchmark case by ID. */
export async function getBenchmarkCase(caseId) {
  return labFetch(`/benchmarks/cases/${caseId}`);
}

/** Create a benchmark case. */
export async function createBenchmarkCase(data) {
  return labFetch('/benchmarks/cases', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

/** Update a benchmark case. */
export async function updateBenchmarkCase(caseId, data) {
  return labFetch(`/benchmarks/cases/${caseId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

/** Delete a benchmark case. */
export async function deleteBenchmarkCase(caseId) {
  return labFetch(`/benchmarks/cases/${caseId}`, { method: 'DELETE' });
}

/** Promote a gold set entry to a benchmark case. */
export async function promoteGoldSetToBenchmark(entryId, difficulty = 'medium') {
  return labFetch(`/benchmarks/cases/from-gold-set/${entryId}?difficulty=${difficulty}`, {
    method: 'POST',
  });
}

/** Score history for a single case across runs. */
export async function getBenchmarkCaseHistory(caseId, limit = 10) {
  return labFetch(`/benchmarks/cases/${caseId}/history?limit=${limit}`);
}

/** List benchmark runs. */
export async function listBenchmarkRuns(limit = 20) {
  return labFetch(`/benchmarks/runs?limit=${limit}`);
}

/** Get a single benchmark run. */
export async function getBenchmarkRun(runId) {
  return labFetch(`/benchmarks/runs/${runId}`);
}

/** Get all per-case results for a run. */
export async function getBenchmarkRunResults(runId) {
  return labFetch(`/benchmarks/runs/${runId}/results`);
}

/**
 * Trigger a benchmark run.
 * @param {object} opts
 * @param {string} [opts.runType='manual']
 * @param {string} [opts.trigger='manual']
 * @param {number|null} [opts.caseLimit]
 * @param {string|null} [opts.notes]
 */
export async function triggerBenchmarkRun({ runType = 'manual', trigger = 'manual', caseLimit = null, notes = null } = {}) {
  return labFetch('/benchmarks/run', {
    method: 'POST',
    body: JSON.stringify({
      run_type:   runType,
      trigger,
      case_limit: caseLimit,
      notes,
    }),
  });
}

/** Pattern-level performance metrics with delta vs previous run. */
export async function getBenchmarkPatternMetrics(patternId) {
  const params = patternId ? `?pattern_id=${encodeURIComponent(patternId)}` : '';
  return labFetch(`/benchmarks/pattern-metrics${params}`);
}

/** Compact latest-run summary for the dashboard header. */
export async function getBenchmarkSummary() {
  return labFetch('/benchmarks/summary');
}

/** Trigger a nightly-style drift detection run from the Lab UI. */
export async function triggerDriftCheck() {
  return labFetch('/benchmarks/drift-check', { method: 'POST' });
}

/** Return current drift check schedule and threshold configuration. */
export async function getDriftConfig() {
  return labFetch('/benchmarks/drift-config');
}

// ── Intelligence / Learning Insights ─────────────────────

/** VLM correction summary — which CV fields VLM overrides most. */
export async function getVlmCorrections() {
  return labFetch('/vlm-corrections');
}

/** Gold set suggestions from high-confidence live nailed_it signals. */
export async function getGoldSetSuggestions(days = 90, limit = 20) {
  return labFetch(`/signals/gold-set-suggestions?days=${days}&limit=${limit}`);
}

/** Concrete per-pattern recalibration hints (reduce X by Ypp). */
export async function getRecalibrationHints(days = 30) {
  return labFetch(`/signals/recalibration-hints?days=${days}`);
}

/** Per-(pattern, environment) calibration breakdown. */
export async function getCalibrationByEnvironment(days = 30) {
  return labFetch(`/signals/calibration-env?days=${days}`);
}

/** Sweep monitoring across all three windows (7d, 14d, 30d). */
export async function triggerSweepAll() {
  return labFetch('/learning/monitoring/sweep-all', { method: 'POST' });
}

/** Apply an accepted confidence_recalibration candidate to the engine. */
export async function applyCandidate(candidateId, notes = '') {
  return labFetch(`/learning/candidates/${candidateId}/apply`, {
    method: 'POST',
    body: JSON.stringify({ notes }),
  });
}

// ── Knowledge Base ────────────────────────────────────────

/** Full pattern knowledge base — all 27 entries with risk levels and signal thresholds. */
export async function getKnowledgeBase() {
  return labFetch('/learning/knowledge');
}

/** Single pattern knowledge entry with symptoms and fix steps. */
export async function getKnowledgeEntry(patternId) {
  return labFetch(`/learning/knowledge/${patternId}`);
}

/** Aggregate weighted signals for a pattern — returns AggregatedInsight. */
export async function aggregatePatternSignals(patternId, days = 30) {
  return labFetch(`/learning/knowledge/${patternId}/signals`, {
    method: 'POST',
    body: JSON.stringify({ days }),
  });
}

/** Run 3-gate CI evaluation for a pattern candidate. */
export async function runCIGate(patternId, candidateDict) {
  return labFetch(`/learning/knowledge/${patternId}/ci-gate`, {
    method: 'POST',
    body: JSON.stringify({ candidate_dict: candidateDict }),
  });
}

// ── Revenue Simulation ────────────────────────────────────

/** Compute revenue impact from a CVR delta for a pattern. */
export async function computeRevenueImpact(patternId, { sessionsPerDay = 500, beforeCvr = 0.035, cvrDelta = 0.003, arpu = 49, days = 30 } = {}) {
  return labFetch('/learning/revenue/impact', {
    method: 'POST',
    body: JSON.stringify({
      pattern_id: patternId,
      sessions_per_day: sessionsPerDay,
      before_cvr: beforeCvr,
      cvr_delta: cvrDelta,
      arpu,
      days,
    }),
  });
}

/** Run 30-day simulation for a list of scenarios. */
export async function simulateRevenue(scenarios) {
  return labFetch('/learning/revenue/simulate', {
    method: 'POST',
    body: JSON.stringify({ scenarios }),
  });
}

/** Fetch simulation run history from the backend (survives logout/cache-clear). */
export async function getSimulationHistory(limit = 20) {
  return labFetch(`/learning/revenue/simulate/history?limit=${limit}`);
}

/** Fetch the latest simulation run from the backend, or null if none. */
export async function getLatestSimulation() {
  try {
    return await labFetch('/learning/revenue/simulate/latest');
  } catch (err) {
    if (err.message?.includes('[404]')) return null;
    throw err;
  }
}

// ── Intelligence & Autonomy API ───────────────────────────────────────────────

/** Get current global intelligence score (cached by default). */
export async function getIntelligenceScore(days = 30, force = false) {
  return coreFetch(`/intelligence/score?days=${days}&force=${force}`);
}

/** Get intelligence score trend history. */
export async function getIntelligenceScoreHistory(days = 30, limit = 30) {
  return coreFetch(`/intelligence/score/history?days=${days}&limit=${limit}`);
}

/** Get per-pattern intelligence scores. */
export async function getIntelligencePatterns(days = 30, force = false) {
  return coreFetch(`/intelligence/patterns?days=${days}&force=${force}`);
}

/** Get intelligence cluster report (failure + success clusters). */
export async function getIntelligenceClusters(days = 30) {
  return coreFetch(`/intelligence/clusters?days=${days}`);
}

/** Force-recompute global + pattern intelligence scores. */
export async function forceComputeIntelligence(days = 30) {
  return coreFetch(`/intelligence/compute?days=${days}`, { method: 'POST' });
}

/** Get nailed-it event stats. */
export async function getNailedItStats(days = 30) {
  return coreFetch(`/intelligence/nailed-it/stats?days=${days}`);
}

/** Get autonomy action queue (pending MEDIUM/HIGH risk actions). */
export async function getAutonomyQueue() {
  return coreFetch('/intelligence/autonomy/queue');
}

/** Get full autonomy audit log. */
export async function getAutonomyLog({ limit = 50, riskTier = null, status = null } = {}) {
  const params = new URLSearchParams({ limit });
  if (riskTier) params.set('risk_tier', riskTier);
  if (status) params.set('status', status);
  return coreFetch(`/intelligence/autonomy/log?${params}`);
}

/** Get autonomy dashboard summary (active actions, rollbacks, guardrail status). */
export async function getAutonomyDashboard(days = 7) {
  return coreFetch(`/intelligence/autonomy/dashboard?days=${days}`);
}

/** Run one pass of the autonomous optimization loop manually. */
export async function runAutonomyLoop(days = 30) {
  return coreFetch(`/intelligence/autonomy/run?days=${days}`, { method: 'POST' });
}

/** Approve a queued MEDIUM/HIGH risk autonomy action. */
export async function approveAutonomyAction(actionId, approvedBy) {
  return coreFetch(`/intelligence/autonomy/approve/${actionId}`, {
    method: 'POST',
    body: JSON.stringify({ approved_by: approvedBy }),
  });
}

/** Reject a queued autonomy action. */
export async function rejectAutonomyAction(actionId, rejectedBy, reason = '') {
  return coreFetch(`/intelligence/autonomy/reject/${actionId}`, {
    method: 'POST',
    body: JSON.stringify({ rejected_by: rejectedBy, reason }),
  });
}

/** Get intelligence feature flags (thresholds, guardrails). */
export async function getIntelligenceFlags() {
  return coreFetch('/intelligence/flags');
}

/** Fetch API key health status (admin only). */
export async function getApiKeyHealth() {
  return coreFetch('/health/api-keys');
}

/** Force a live API key probe (admin only). */
export async function probeApiKey() {
  return coreFetch('/health/api-keys/probe', { method: 'POST' });
}

/** Return aggregated VLM call metrics for the last N hours. */
export async function getApiMetrics(hours = 24) {
  return labFetch(`/api-metrics?hours=${hours}`);
}
