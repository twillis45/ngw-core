const STORAGE_KEY = 'ngw_setup_feedback';

export function loadFeedback() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

export function saveFeedback(entry) {
  const all = loadFeedback();
  all.push({ ...entry, timestamp: Date.now() });
  // Keep max 200 entries
  const trimmed = all.slice(-200);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  return trimmed;
}

export function getFeedbackStats() {
  const all = loadFeedback();
  const stats = { total: all.length, perfect: 0, tweaks: 0, didntWork: 0 };
  for (const entry of all) {
    if (entry.rating === 'perfect') stats.perfect++;
    else if (entry.rating === 'tweaks') stats.tweaks++;
    else if (entry.rating === 'didnt_work') stats.didntWork++;
  }
  return stats;
}
