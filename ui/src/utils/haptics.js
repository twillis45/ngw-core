/**
 * Haptic feedback utility — wraps navigator.vibrate with
 * named patterns for meaningful interaction moments.
 *
 * Reads the `hapticFeedback` setting from localStorage.
 * Falls back silently on devices / browsers that don't support vibration.
 */

const CAN_VIBRATE = typeof navigator !== 'undefined' && 'vibrate' in navigator;

function isEnabled() {
  try {
    const raw = localStorage.getItem('ngw_settings');
    if (!raw) return true; // default on
    const s = JSON.parse(raw);
    return s.hapticFeedback !== false;
  } catch { return true; }
}

function vibrate(pattern) {
  if (CAN_VIBRATE && isEnabled()) navigator.vibrate(pattern);
}

/** Light tap — button press, toggle, chip select */
export function tapHaptic() { vibrate(10); }

/** Medium — confirming an action, selecting a light, completing a step */
export function selectHaptic() { vibrate(18); }

/** Success — analysis complete, save confirmed, recipe applied */
export function successHaptic() { vibrate([12, 60, 12]); }

/** Warning / error — validation fail, destructive confirm */
export function warnHaptic() { vibrate([30, 40, 30]); }

/** Drag start — picking up a light in the diagram */
export function dragStartHaptic() { vibrate(25); }

/** Drag end / drop — releasing a dragged element */
export function dropHaptic() { vibrate([10, 30, 15]); }

/** Long press — entering edit mode, hold actions */
export function longPressHaptic() { vibrate(40); }

/** Navigation — screen transition */
export function navHaptic() { vibrate(8); }
