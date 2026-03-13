const STORAGE_KEY = 'ngw_user_kit';

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
  return kit;
}

export function clearKit() {
  localStorage.removeItem(STORAGE_KEY);
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
