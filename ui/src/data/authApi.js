import { apiFetch as baseApiFetch } from '../lib/apiClient';

const TOKEN_KEY = 'ngw_auth_token';
const USER_KEY = 'ngw_auth_user';
// Legacy key used before the auth refactor — migrate on first read.
const LEGACY_TOKEN_KEY = 'ngw_token';

// One-time migration: move ngw_token → ngw_auth_token so existing sessions
// survive the key rename without forcing a re-login.
(function migrateToken() {
  try {
    if (!localStorage.getItem(TOKEN_KEY)) {
      const old = localStorage.getItem(LEGACY_TOKEN_KEY);
      if (old) localStorage.setItem(TOKEN_KEY, old);
    }
  } catch { /* ignore storage errors */ }
})();

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function getUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function saveAuth(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch(path, options = {}) {
  const res = await baseApiFetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...options.headers },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || 'Request failed');
  return data;
}

// ── Auth ──────────────────────────────────────────────────

export async function register(email, username, password) {
  const data = await apiFetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, username, password }),
  });
  saveAuth(data.token, data.user);
  return data.user;
}

export async function login(email, password) {
  const data = await apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  saveAuth(data.token, data.user);
  return data.user;
}

export async function verifyEmail(token) {
  const data = await apiFetch('/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
  saveAuth(data.token, data.user);
  return data.user;
}

export async function resendVerification() {
  return apiFetch('/auth/resend-verification', { method: 'POST' });
}

export async function fetchMe() {
  return apiFetch('/auth/me');
}

export function logout() {
  clearAuth();
}

// ── Kit sync ──────────────────────────────────────────────

export async function syncKit(kit) {
  return apiFetch('/user/kit', { method: 'PUT', body: JSON.stringify(kit) });
}

export async function fetchKit() {
  return apiFetch('/user/kit');
}

// ── Setups sync ───────────────────────────────────────────

export async function syncSetup(name, tag, result) {
  return apiFetch('/user/setups', {
    method: 'POST',
    body: JSON.stringify({ name, tag, result }),
  });
}

export async function fetchSetups() {
  const data = await apiFetch('/user/setups');
  return data.setups;
}

export async function deleteSetupRemote(setupId) {
  return apiFetch(`/user/setups/${setupId}`, { method: 'DELETE' });
}

// ── Feedback sync ─────────────────────────────────────────

export async function syncFeedback(setupId, mood, pattern, rating, comment) {
  return apiFetch('/user/feedback', {
    method: 'POST',
    body: JSON.stringify({ setup_id: setupId, mood, pattern, rating, comment }),
  });
}

// ── Full sync ─────────────────────────────────────────────

export async function fetchAllUserData() {
  return apiFetch('/user/sync');
}

// ── User Preferences ──────────────────────────────────────
// Syncs arbitrary UI preferences (tab order, layout, etc.) to the server
// so they persist across devices and sessions.

export async function savePreference(key, value) {
  return apiFetch(`/user/preferences/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: JSON.stringify({ value }),
  });
}

export async function loadPreferences() {
  const data = await apiFetch('/user/preferences');
  return data.preferences || {};
}
