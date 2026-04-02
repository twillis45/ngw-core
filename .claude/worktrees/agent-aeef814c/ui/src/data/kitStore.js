import { getToken, syncKit as syncKitRemote, fetchKit as fetchKitRemote } from './authApi';

const STORAGE_KEY = 'ngw_user_kit';

// --- Change notification (used by useKit hook) ---
let _kitVersion = 0;
const _kitListeners = new Set();

export function subscribeKit(cb) {
  _kitListeners.add(cb);
  return () => _kitListeners.delete(cb);
}

export function notifyKitChanged() {
  _kitVersion++;
  _kitListeners.forEach(cb => cb());
}

export function getKitVersion() {
  return _kitVersion;
}

export function loadKit() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const kit = JSON.parse(raw);
    if (!kit || !Array.isArray(kit.lights)) return null;
    // Normalize old string[] modifiers to {type, qty}[] format
    if (Array.isArray(kit.modifiers)) {
      kit.modifiers = kit.modifiers.map(m =>
        typeof m === 'string' ? { type: m, qty: 1 } : m
      );
    }
    return kit;
  } catch {
    return null;
  }
}

export function saveKit(gear) {
  const kit = {
    lights: gear.lights || [],
    modifiers: gear.modifiers || [],
    support: gear.support || [],
    savedAt: Date.now(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(kit));
  notifyKitChanged();

  // Sync to server if logged in (fire-and-forget)
  if (getToken()) {
    syncKitRemote(kit).catch(() => { /* silent — local is source of truth */ });
  }

  return kit;
}

export function clearKit() {
  localStorage.removeItem(STORAGE_KEY);
  notifyKitChanged();
}

export function hasKit() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const kit = JSON.parse(raw);
    return kit && Array.isArray(kit.lights) && kit.lights.length > 0;
  } catch {
    return false;
  }
}

/**
 * Pull kit from server and merge into localStorage.
 * Server wins if local kit is older or missing.
 */
export async function pullKitFromServer() {
  if (!getToken()) return;
  try {
    const remote = await fetchKitRemote();
    if (remote && remote.kit) {
      const local = loadKit();
      const remoteKit = remote.kit;
      // Server wins if local is missing or older
      if (!local || (remoteKit.savedAt && (!local.savedAt || remoteKit.savedAt > local.savedAt))) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(remoteKit));
      }
    }
  } catch { /* silent */ }
}
