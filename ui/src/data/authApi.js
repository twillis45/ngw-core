const TOKEN_KEY = 'ngw_auth_token';
const USER_KEY = 'ngw_auth_user';

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function getUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveAuth(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function apiFetch(path, options = {}) {
  const res = await fetch(`/api${path}`, {
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
