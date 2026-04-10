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
    grain:     [3, 5, 3, 5, 3],   // 5-pulse stutter — coarse grain crunch
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
    grain:     [4, 6, 4, 6, 4, 6, 4],   // 7-pulse stutter — fine grain
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
    grain:     [2, 3, 2, 3, 2, 3, 2, 3, 2],   // 9-pulse rapid micro-texture
  },
};

// Cache the enabled flag + selected profile.  Reading localStorage twice on
// every haptic call (once for enabled, once for profile) was adding a few ms
// of jitter relative to the simultaneous sound call — enough to feel a
// "stagger" between the click sound and the buzz on rapid taps.  Cache stays
// fresh via the storage event so settings toggles still take effect live.
let _hapticEnabledCache = null;
let _hapticProfileCache = null;

function enabled() {
  if (_hapticEnabledCache !== null) return _hapticEnabledCache;
  try {
    const raw = localStorage.getItem('ngw_settings');
    if (!raw) return (_hapticEnabledCache = true);
    const s = JSON.parse(raw);
    _hapticEnabledCache = s.hapticFeedback !== false;
    return _hapticEnabledCache;
  } catch {
    return (_hapticEnabledCache = true);
  }
}

function getProfile() {
  if (_hapticProfileCache) return _hapticProfileCache;
  try {
    const raw = localStorage.getItem('ngw_settings');
    if (!raw) return (_hapticProfileCache = PROFILES.A);
    const s = JSON.parse(raw);
    const key = s.hapticProfile || 'A';
    _hapticProfileCache = PROFILES[key] || PROFILES.A;
    return _hapticProfileCache;
  } catch {
    return (_hapticProfileCache = PROFILES.A);
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', () => {
    _hapticEnabledCache = null;
    _hapticProfileCache = null;
  });
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

/**
 * Background grain — very short pulse meant to feel like the matte surface
 * has texture under your finger.  Throttled to once every ~120ms so dragging
 * across the screen produces a stuttering grain feel rather than a single
 * continuous buzz.  Android Chrome supports this via navigator.vibrate;
 * iOS Safari silently no-ops.
 */
let _grainLastTs = 0;
const GRAIN_THROTTLE_MS = 60;  // tight throttle so dragging crunches
export function grainHaptic() {
  const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  if (now - _grainLastTs < GRAIN_THROTTLE_MS) return;
  _grainLastTs = now;
  vibrate('grain');
}
