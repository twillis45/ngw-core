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
