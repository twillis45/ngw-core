/**
 * faceCrop.js — derive a CSS object-position string that focuses a thumb crop
 * on the subject's face/eyes.
 *
 * Reads the face_geometry the engine already produces (left_eye_center +
 * right_eye_center) and the image_dimensions, then returns a string like
 * "50% 32%" suitable for the `objectPosition` style on an <img> using
 * objectFit:cover.  Falls back to "50% 25%" (a sensible portrait default
 * favouring the upper third) when face data is unavailable.
 */

const FALLBACK = '50% 25%';

/**
 * @param {object} rawResult — the raw analyze response (`result._raw`)
 * @returns {string} object-position css value
 */
export function getFaceCropPosition(rawResult) {
  if (!rawResult) return FALLBACK;

  const dims = rawResult.image_dimensions
    || rawResult.description?.size
    || null;
  const W = dims?.width;
  const H = dims?.height;
  if (!W || !H) return FALLBACK;

  const fg = rawResult.cv?.catchlights?.face_geometry
    || rawResult.description?.vision?.catchlights?.face_geometry
    || null;
  const le = fg?.left_eye_center;
  const re = fg?.right_eye_center;
  if (!Array.isArray(le) || !Array.isArray(re)) return FALLBACK;

  const eyeMidX = (le[0] + re[0]) / 2;
  const eyeMidY = (le[1] + re[1]) / 2;
  // Bias the focal point a touch below the eye line so the crop frames
  // eyes-through-mid-cheek rather than parking eyes at dead center.
  const focusY = eyeMidY + (H * 0.02);

  // Clamp to portrait-safe ranges: x 20-80% keeps the face centered in
  // the crop even with noisy face detection; y 15-55% keeps the face in the
  // upper portion where photographers expect it.
  const xPct = Math.max(20, Math.min(80, (eyeMidX / W) * 100));
  const yPct = Math.max(15, Math.min(55, (focusY  / H) * 100));
  return `${xPct.toFixed(1)}% ${yPct.toFixed(1)}%`;
}
