/**
 * haptics.js — Tactile feedback utility
 *
 * Reads `hapticFeedback` from localStorage (settingsStore key).
 * Falls back silently on browsers without navigator.vibrate support.
 *
 * Usage:
 *   import { tapHaptic, successHaptic, warnHaptic, dragStartHaptic, dropHaptic } from '../utils/haptics';
 *   tapHaptic();       // generic button tap
 *   selectHaptic();    // selection change (mood, subject, gear, etc.)
 *   successHaptic();   // save / confirm / complete
 *   warnHaptic();      // error or destructive action
 *   dragStartHaptic(); // drag handle grabbed
 *   dropHaptic();      // drag node released
 *   longPressHaptic(); // long-press action triggered
 *   navHaptic();       // screen navigation (handled by AppContext dispatch wrapper)
 */

function enabled() {
  try {
    const raw = localStorage.getItem('ngw_settings');
    if (!raw) return true; // default on
    const s = JSON.parse(raw);
    return s.hapticFeedback !== false;
  } catch {
    return true;
  }
}

function vibrate(pattern) {
  if (!enabled()) return;
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try { navigator.vibrate(pattern); } catch { /* ignore */ }
  }
}

/** Generic button tap — light single pulse */
export function tapHaptic()       { vibrate(8); }

/** Selection change (chip, mood, gear) — slightly longer */
export function selectHaptic()    { vibrate(12); }

/** Success / save / confirm — double pulse */
export function successHaptic()   { vibrate([10, 40, 10]); }

/** Error / warning / destructive — firm single */
export function warnHaptic()      { vibrate(30); }

/** Drag start — short buzz to confirm grab */
export function dragStartHaptic() { vibrate(15); }

/** Drop / release — confirmation tap */
export function dropHaptic()      { vibrate([8, 20, 8]); }

/** Long-press action — medium pulse */
export function longPressHaptic() { vibrate(20); }

/** Screen navigation — subtle tick */
export function navHaptic()       { vibrate(6); }
