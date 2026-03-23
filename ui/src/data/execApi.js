/**
 * Executive Dashboard API — client functions for /api/exec/* endpoints.
 */
import { getToken } from './authApi';
import { apiFetch } from '../lib/apiClient';

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function execFetch(path, options = {}) {
  const headers = { ...authHeaders(), ...options.headers };
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await apiFetch(`/api/exec${path}`, { headers, ...options });
  const data = await res.json();
  if (!res.ok) {
    const msg = data.detail || `Exec API error (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

/** Full dashboard payload. days = 7 | 30 | 90, origin = 'all' | 'production' | 'internal' */
export async function getExecDashboard(days = 7, origin = 'all') {
  return execFetch(`/dashboard?days=${days}&origin=${origin}`);
}

/** Extended trend data — 7d and 30d daily series. */
export async function getExecTrends() {
  return execFetch('/dashboard/trends');
}
