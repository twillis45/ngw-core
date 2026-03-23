/**
 * Unit conversion utilities.
 * Respects the user's `units` preference ('imperial' | 'metric').
 */

/** Convert meters to feet (rounded to nearest integer). */
export function mToFt(m) {
  return (m * 3.281).toFixed(0);
}

/** Format a distance in meters using the user's preferred unit. */
export function formatDistance(meters, units) {
  if (units === 'metric') {
    return meters < 1
      ? `${Math.round(meters * 100)} cm`
      : `${meters.toFixed(1)} m`;
  }
  return `${mToFt(meters)} ft`;
}

/** Format a height in meters using the user's preferred unit. */
export function formatHeight(meters, units) {
  if (units === 'metric') {
    return meters < 1
      ? `${Math.round(meters * 100)} cm`
      : `${meters.toFixed(1)} m`;
  }
  return `${mToFt(meters)} ft`;
}

/** Format a room dimension in feet, with metric equivalent if metric is preferred. */
export function formatRoomDim(feet, units) {
  if (units === 'metric') {
    const m = (feet * 0.3048).toFixed(1);
    return `${m} m`;
  }
  return `${feet} ft`;
}

/** Named WB preset → approximate Kelvin value. */
const WB_KELVIN_MAP = {
  flash: 5500, strobe: 5500, tungsten: 3200, incandescent: 3200,
  daylight: 5600, cloudy: 6500, shade: 7500, fluorescent: 4000,
  led: 5000, mixed: 4500,
};

/**
 * Extract a Kelvin value from a WB string.
 * Returns a number, or null if unparseable.
 */
export function wbKelvin(wb) {
  if (!wb) return null;
  const numMatch = String(wb).match(/(\d{3,5})/);
  if (numMatch) return parseInt(numMatch[1], 10);
  return WB_KELVIN_MAP[String(wb).toLowerCase()] ?? null;
}

/**
 * Return a CSS class name for colour-tinting text to match a white-balance value.
 * Accepts named WB presets (e.g. "tungsten", "daylight") or strings containing
 * a Kelvin number (e.g. "Flash (5500 K)", "3200K").
 *
 * Returns one of: 'ref-analysis__temp-warm' | 'ref-analysis__temp-cool' |
 *                 'ref-analysis__temp-neutral' | ''
 */
export function wbTempClass(wb) {
  if (!wb) return '';
  const lower = String(wb).toLowerCase();

  // Check explicit warm/cool keyword hints in the label first
  if (/\b(warm|tungsten|incandescent|golden|candle|amber)\b/.test(lower)) {
    return 'ref-analysis__temp-warm';
  }
  if (/\b(cool|shade|overcast|cloudy|hazy|blue)\b/.test(lower)) {
    return 'ref-analysis__temp-cool';
  }

  // Fall back to Kelvin value
  let k = null;
  const numMatch = lower.match(/(\d{3,5})/);
  if (numMatch) {
    k = parseInt(numMatch[1], 10);
  } else {
    k = WB_KELVIN_MAP[lower] ?? null;
  }
  if (k == null) return '';
  // Adjusted thresholds — covers the real range the backend emits
  if (k < 4800) return 'ref-analysis__temp-warm';
  if (k > 5800) return 'ref-analysis__temp-cool';
  return 'ref-analysis__temp-neutral';
}
