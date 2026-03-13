const STORAGE_KEY = 'ngw_saved_setups';

export function loadSetups() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

export function saveSetup(entry) {
  const all = loadSetups();
  all.push({
    id: `setup-${Date.now()}`,
    name: entry.name,
    tag: entry.tag || 'personal',
    result: entry.result,
    timestamp: Date.now(),
  });
  // Cap at 50 saved setups
  const trimmed = all.slice(-50);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  return trimmed;
}

export function deleteSetup(id) {
  const all = loadSetups().filter(s => s.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  return all;
}

export function getSetup(id) {
  return loadSetups().find(s => s.id === id) || null;
}
