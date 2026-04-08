/**
 * haptics.js — Tactile feedback utility
 *
 * Three haptic profiles:
 *   A — Weighted Mechanical (Leica shutter)
 *   B — Heavy Detent (high-end rotary switch)
 *   C — Pneumatic Latch (air-dampened mechanism)
 *
 * Profile stored in localStorage via settingsStore key `hapticProfile`.
 * Falls back silently on browsers without navigator.vibrate support.
 */

const PROFILES = {
  A: {
    tap:       18,
    select:    25,
    success:   [20, 30, 25],
    warn:      [15, 10, 45],
    dragStart: 30,
    drop:      [15, 15, 20],
    longPress: [12, 8, 35],
    nav:       15,
  },
  B: {
    tap:       22,
    select:    28,
    success:   [25, 25, 15, 25, 25],
    warn:      55,
    dragStart: 35,
    drop:      [30, 20, 15],
    longPress: 45,
    nav:       18,
  },
  C: {
    tap:       20,
    select:    30,
    success:   [18, 50, 12, 50, 18],
    warn:      [10, 5, 50],
    dragStart: [10, 8, 25],
    drop:      [25, 40, 12],
    longPress: [8, 10, 40],
    nav:       14,
  },
};

function enabled() {
  try {
    const raw = localStorage.getItem('ngw_settings');
    if (!raw) return true;
    const s = JSON.parse(raw);
    return s.hapticFeedback !== false;
  } catch {
    return true;
  }
}

function getProfile() {
  try {
    const raw = localStorage.getItem('ngw_settings');
    if (!raw) return PROFILES.A;
    const s = JSON.parse(raw);
    const key = s.hapticProfile || 'A';
    return PROFILES[key] || PROFILES.A;
  } catch {
    return PROFILES.A;
  }
}

/** Returns current profile letter (A, B, or C) */
export function getProfileKey() {
  try {
    const raw = localStorage.getItem('ngw_settings');
    if (!raw) return 'A';
    const s = JSON.parse(raw);
    return s.hapticProfile || 'A';
  } catch {
    return 'A';
  }
}

function vibrate(patternKey) {
  if (!enabled()) return;
  const pattern = getProfile()[patternKey];
  if (!pattern) return;
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch { /* ignore */ }
  }
}

/** Generic button tap — light single pulse */
export function tapHaptic()       { vibrate('tap'); }

/** Selection change (chip, mood, gear) — slightly longer */
export function selectHaptic()    { vibrate('select'); }

/** Success / save / confirm — double pulse */
export function successHaptic()   { vibrate('success'); }

/** Error / warning / destructive — firm single */
export function warnHaptic()      { vibrate('warn'); }

/** Drag start — short buzz to confirm grab */
export function dragStartHaptic() { vibrate('dragStart'); }

/** Drop / release — confirmation tap */
export function dropHaptic()      { vibrate('drop'); }

/** Long-press action — medium pulse */
export function longPressHaptic() { vibrate('longPress'); }

/** Screen navigation — subtle tick */
export function navHaptic()       { vibrate('nav'); }
