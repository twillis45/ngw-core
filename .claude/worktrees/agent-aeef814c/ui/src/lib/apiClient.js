/**
 * Centralized API client for NGW.
 *
 * In development (Vite dev server), VITE_API_BASE_URL is typically empty
 * and all calls go through the Vite proxy to localhost:8000.
 *
 * In production (Vercel → Render), set VITE_API_BASE_URL to the full
 * Render backend URL, e.g. https://ngw-api.onrender.com
 */

const _rawBase = import.meta.env.VITE_API_BASE_URL ?? '';

// Trim trailing slash so callers can always write apiUrl('/api/...')
export const API_BASE = _rawBase.replace(/\/$/, '');

// Warn once in production if the env var is missing
if (!_rawBase && import.meta.env.PROD) {
  console.warn(
    '[NGW] VITE_API_BASE_URL is not set. ' +
    'API calls will use relative paths which will fail on Vercel → Render. ' +
    'Set VITE_API_BASE_URL in your Vercel environment variables.'
  );
}

/**
 * Build a full API URL from a path.
 * @param {string} path - e.g. '/api/shoot-match' or '/recommend'
 * @returns {string}
 */
export function apiUrl(path) {
  return `${API_BASE}${path}`;
}

/**
 * Fetch wrapper that prepends the API base URL and logs failures.
 * Behaves exactly like fetch() but with base URL prefixing.
 *
 * @param {string} path - API path (e.g. '/api/shoot-match')
 * @param {RequestInit} [options] - standard fetch options
 * @returns {Promise<Response>}
 */
export async function apiFetch(path, options = {}) {
  const url = apiUrl(path);
  try {
    return await fetch(url, options);
  } catch (err) {
    console.error(`[NGW] Network error on ${options.method || 'GET'} ${url}:`, err.message);
    throw err;
  }
}
