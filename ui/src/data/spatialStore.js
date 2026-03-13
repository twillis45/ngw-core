/**
 * Spatial Calibration localStorage persistence.
 * Stores room dimensions and floor plan data.
 */

const ROOM_KEY = 'ngw_room_dimensions';
const PLAN_KEY = 'ngw_floor_plan';

/**
 * Save room dimensions.
 * @param {{ lengthFt: number, widthFt: number, ceilingFt: number, source: string }} dims
 */
export function saveRoomDimensions(dims) {
  try {
    localStorage.setItem(ROOM_KEY, JSON.stringify(dims));
  } catch { /* quota exceeded or private mode */ }
}

/**
 * Load saved room dimensions.
 * @returns {object|null}
 */
export function loadRoomDimensions() {
  try {
    const raw = localStorage.getItem(ROOM_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/**
 * Save floor plan (subject + camera positions).
 * @param {{ subjectPos: {x: number, y: number}, cameraPos: {x: number, y: number} }} plan
 */
export function saveFloorPlan(plan) {
  try {
    localStorage.setItem(PLAN_KEY, JSON.stringify(plan));
  } catch { /* ignore */ }
}

/**
 * Load saved floor plan.
 * @returns {object|null}
 */
export function loadFloorPlan() {
  try {
    const raw = localStorage.getItem(PLAN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

/**
 * Clear all spatial data.
 */
export function clearSpatialData() {
  try {
    localStorage.removeItem(ROOM_KEY);
    localStorage.removeItem(PLAN_KEY);
  } catch { /* ignore */ }
}
