import { getToken, syncSetup as syncSetupRemote, fetchSetups as fetchSetupsRemote, deleteSetupRemote } from './authApi';

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
  const newEntry = {
    id: `setup-${Date.now()}`,
    name: entry.name,
    tag: entry.tag || 'personal',
    result: entry.result,
    timestamp: Date.now(),
  };
  all.push(newEntry);
  // Cap at 50 saved setups
  const trimmed = all.slice(-50);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));

  // Sync to server if logged in (fire-and-forget)
  if (getToken()) {
    syncSetupRemote(newEntry.name, newEntry.tag, newEntry.result).catch(() => {});
  }

  return trimmed;
}

export function deleteSetup(id) {
  const all = loadSetups().filter(s => s.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));

  // Sync deletion to server if logged in (fire-and-forget)
  if (getToken()) {
    deleteSetupRemote(id).catch(() => {});
  }

  return all;
}

export function getSetup(id) {
  return loadSetups().find(s => s.id === id) || null;
}

/**
 * Detect the dominant lighting pattern across saved setups.
 * Returns { pattern, count, total } when any pattern appears 2+ times, else null.
 * @param {Array} [setups] - pre-loaded setups; defaults to loadSetups()
 */
export function getStylePattern(setups) {
  const data = setups || loadSetups();
  if (data.length < 2) return null;
  const counts = {};
  for (const s of data) {
    const p = s.result?.bestMatch?.lightingPattern;
    if (p) counts[p] = (counts[p] || 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (sorted.length && sorted[0][1] >= 2) {
    return { pattern: sorted[0][0], count: sorted[0][1], total: data.length };
  }
  return null;
}

/**
 * Compare currentScore against the most recent saved score for the same pattern.
 * Returns { improved, delta, lastScore, currentScore } or null when no comparison is possible.
 * delta is always positive; check `improved` for direction.
 * @param {string} pattern       - lighting pattern name
 * @param {number} currentScore  - reliabilityScore from current result (0-100)
 * @param {Array}  [setups]      - pre-loaded setups; defaults to loadSetups()
 */
export function getImprovementSignal(pattern, currentScore, setups) {
  if (!pattern || currentScore == null) return null;
  const data = setups || loadSetups();
  // Find previous saves with same pattern that have a score
  const previous = data.filter(
    s => s.result?.bestMatch?.lightingPattern === pattern
      && typeof s.result?.bestMatch?.reliabilityScore === 'number'
  );
  if (!previous.length) return null;
  // Most recent previous entry (array is oldest-first, take last)
  const last = previous[previous.length - 1];
  const lastScore = last.result.bestMatch.reliabilityScore;
  const raw = currentScore - lastScore;
  if (Math.abs(raw) < 3) return null; // within noise threshold
  return {
    improved: raw > 0,
    delta: Math.round(Math.abs(raw)),
    lastScore: Math.round(lastScore),
    currentScore: Math.round(currentScore),
  };
}

/**
 * Pull setups from server and merge into localStorage.
 * Adds any server-side setups not already present locally.
 */
export async function pullSetupsFromServer() {
  if (!getToken()) return;
  try {
    const remoteSetups = await fetchSetupsRemote();
    if (!Array.isArray(remoteSetups)) return;
    const local = loadSetups();
    const localIds = new Set(local.map(s => s.id));
    let added = false;
    for (const rs of remoteSetups) {
      if (!localIds.has(rs.id)) {
        local.push(rs);
        added = true;
      }
    }
    if (added) {
      const trimmed = local.slice(-50);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    }
  } catch { /* silent */ }
}
