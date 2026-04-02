/**
 * Perspective Estimator — estimates room dimensions from a single photo
 * with a known reference object.
 *
 * Uses the thin-lens approximation:
 *   distance = (realHeight × imageHeight) / (pixelHeight × 2 × tan(FOV/2))
 *
 * The camera's vertical field of view (FOV) is either:
 *   1. Derived from EXIF FocalLengthIn35mmFilm
 *   2. Defaulted to 70° (typical smartphone rear camera)
 */

const DEFAULT_VFOV_DEG = 52;  // Vertical FOV for ~28mm equiv on 3:4 sensor
const DEFAULT_HFOV_DEG = 70;  // Horizontal FOV for typical smartphone

/* ── EXIF helpers ─────────────────────────────────────── */

/**
 * Attempt to read basic EXIF focal length from an image blob.
 * Returns FocalLengthIn35mmFilm if available, else null.
 *
 * Uses a minimal binary parser — no external library needed.
 * Only reads the first 64KB of JPEG EXIF data.
 *
 * @param {Blob} blob
 * @returns {Promise<number|null>}
 */
export async function readFocalLength35mm(blob) {
  try {
    const buf = await blob.slice(0, 65536).arrayBuffer();
    const view = new DataView(buf);

    // Check JPEG SOI marker
    if (view.getUint16(0) !== 0xFFD8) return null;

    let offset = 2;
    while (offset < view.byteLength - 4) {
      const marker = view.getUint16(offset);
      if (marker === 0xFFE1) {
        // APP1 — EXIF
        const length = view.getUint16(offset + 2);
        const exifStart = offset + 4;

        // Check "Exif\0\0"
        const exifHeader = view.getUint32(exifStart);
        if (exifHeader !== 0x45786966) return null;

        const tiffStart = exifStart + 6;
        const byteOrder = view.getUint16(tiffStart);
        const isLE = byteOrder === 0x4949;

        const getU16 = (o) => view.getUint16(o, isLE);
        const getU32 = (o) => view.getUint32(o, isLE);

        // IFD0
        const ifd0Offset = tiffStart + getU32(tiffStart + 4);
        const ifd0Count = getU16(ifd0Offset);

        // Search IFD0 for ExifIFDPointer (tag 0x8769)
        let exifIFDOffset = 0;
        for (let i = 0; i < ifd0Count; i++) {
          const entryOff = ifd0Offset + 2 + i * 12;
          if (getU16(entryOff) === 0x8769) {
            exifIFDOffset = tiffStart + getU32(entryOff + 8);
            break;
          }
        }
        if (!exifIFDOffset) return null;

        // Search ExifIFD for FocalLengthIn35mmFilm (tag 0xA405)
        const exifCount = getU16(exifIFDOffset);
        for (let i = 0; i < exifCount; i++) {
          const entryOff = exifIFDOffset + 2 + i * 12;
          if (entryOff + 12 > view.byteLength) break;
          if (getU16(entryOff) === 0xA405) {
            return getU16(entryOff + 8);
          }
        }
        return null;
      }

      // Skip non-EXIF APP segments
      const segLen = view.getUint16(offset + 2);
      offset += 2 + segLen;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Convert 35mm equivalent focal length to vertical FOV.
 * Assumes 3:2 sensor aspect ratio (36×24mm).
 *
 * @param {number} focalLength35mm - in mm
 * @returns {number} vertical FOV in degrees
 */
export function focalLengthToVFOV(focalLength35mm) {
  // Sensor height = 24mm for 35mm film
  const sensorHeight = 24;
  const vfov = 2 * Math.atan(sensorHeight / (2 * focalLength35mm)) * (180 / Math.PI);
  return vfov;
}

/* ── Core estimation ──────────────────────────────────── */

/**
 * Estimate distance to a reference object from its apparent size in the image.
 *
 * @param {number} imageHeight    - total image height in pixels
 * @param {number} refPixelHeight - reference object height in pixels
 * @param {number} refRealHeightFt - reference object real height in feet
 * @param {number} vfovDeg        - vertical field of view in degrees
 * @returns {number} estimated distance in feet
 */
export function estimateDistance(imageHeight, refPixelHeight, refRealHeightFt, vfovDeg) {
  if (refPixelHeight <= 0 || refRealHeightFt <= 0) return 0;
  const vfovRad = (vfovDeg * Math.PI) / 180;
  // What real-world height does the full image represent at the object's distance?
  // fullRealHeight = 2 * dist * tan(vfov/2)
  // refPixelHeight / imageHeight = refRealHeightFt / fullRealHeight
  // => dist = (refRealHeightFt * imageHeight) / (refPixelHeight * 2 * tan(vfov/2))
  const distance = (refRealHeightFt * imageHeight) / (refPixelHeight * 2 * Math.tan(vfovRad / 2));
  return distance;
}

/**
 * Estimate room dimensions from a single photo with a reference object.
 *
 * The user photographs the room from one corner looking diagonally.
 * They mark a reference object (door frame, person) by tapping top and bottom points.
 *
 * @param {object} params
 * @param {number} params.imageWidth       - image width in pixels
 * @param {number} params.imageHeight      - image height in pixels
 * @param {number} params.refPixelHeight   - reference object height in pixels (top-to-bottom)
 * @param {number} params.refRealHeightFt  - reference object real height in feet
 * @param {number} params.refCenterX       - X position of reference center (0–1 normalized)
 * @param {number} params.refBottomY       - Y position of reference bottom (0–1 normalized)
 * @param {number|null} params.focalLength35mm - from EXIF (null to use default)
 * @returns {{ estimatedDepthFt, estimatedWidthFt, estimatedCeilingFt, distanceToRefFt, confidence }}
 */
export function estimateRoomFromReference({
  imageWidth,
  imageHeight,
  refPixelHeight,
  refRealHeightFt,
  refCenterX = 0.5,
  refBottomY = 0.8,
  focalLength35mm = null,
}) {
  // Determine vertical FOV
  const vfovDeg = focalLength35mm
    ? focalLengthToVFOV(focalLength35mm)
    : DEFAULT_VFOV_DEG;

  // Horizontal FOV (approximate, assuming 4:3 aspect)
  const aspect = imageWidth / imageHeight;
  const hfovDeg = focalLength35mm
    ? 2 * Math.atan(Math.tan((vfovDeg * Math.PI / 180) / 2) * aspect) * (180 / Math.PI)
    : DEFAULT_HFOV_DEG;

  // Estimate distance to the reference object
  const distanceToRefFt = estimateDistance(imageHeight, refPixelHeight, refRealHeightFt, vfovDeg);

  // Estimate room depth: the reference object is typically on the far wall,
  // so distance-to-ref approximates room depth. Add the camera's offset from
  // the corner (~2 ft diagonal).
  const estimatedDepthFt = Math.round(distanceToRefFt + 2);

  // Estimate room width from horizontal FOV and distance
  // The visible width at the reference distance = 2 * dist * tan(hfov/2)
  // If the camera can see wall-to-wall, this gives the room width
  const hfovRad = (hfovDeg * Math.PI) / 180;
  const visibleWidthFt = 2 * distanceToRefFt * Math.tan(hfovRad / 2);
  // From a corner, we see roughly 60-80% of the room width
  const estimatedWidthFt = Math.round(visibleWidthFt * 0.8);

  // Estimate ceiling: if reference bottom is at ~80% of frame height,
  // the ceiling line is at ~10% of frame height. Use proportional estimation.
  // The reference object sits on the floor; the ceiling is above it.
  const ceilingPixels = refBottomY * imageHeight * 0.15;  // approximate ceiling portion
  const floorToFrameTop = refPixelHeight / (refBottomY - 0.05);
  const estimatedCeilingFt = Math.round(refRealHeightFt * (floorToFrameTop / refPixelHeight));

  // Clamp to reasonable ranges
  const depth = Math.max(6, Math.min(80, estimatedDepthFt));
  const width = Math.max(6, Math.min(60, estimatedWidthFt));
  const ceiling = Math.max(7, Math.min(25, estimatedCeilingFt || 9));

  // Confidence score
  let confidence = 0.5;
  if (focalLength35mm) confidence += 0.2;            // EXIF data available
  if (refPixelHeight > imageHeight * 0.2) confidence += 0.15;  // Large reference = more accurate
  if (refPixelHeight > imageHeight * 0.4) confidence += 0.1;   // Very large
  confidence = Math.min(1.0, confidence);

  return {
    estimatedDepthFt: depth,
    estimatedWidthFt: width,
    estimatedCeilingFt: ceiling,
    distanceToRefFt: +distanceToRefFt.toFixed(1),
    confidence: +confidence.toFixed(2),
  };
}
