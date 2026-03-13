/**
 * Spatial Engine — pure functions for room-aware lighting placement.
 *
 * Coordinate system (feet, bird's-eye view):
 *   Origin = back-left corner of room.
 *   X axis = room width (left → right).
 *   Y axis = room length/depth (back wall → front, toward camera).
 *
 * Diagram spec angles (degrees, relative to subject):
 *   0°   = directly in front (camera axis)
 *   +90° = camera-right
 *   -90° = camera-left
 *   180° = directly behind subject
 */

const M_TO_FT = 3.28084;
const FT_TO_M = 1 / M_TO_FT;
const MIN_WALL_CLEARANCE_FT = 1.5;

/* ── Unit conversion ──────────────────────────────────── */

export function metersToFeet(m) {
  return +(m * M_TO_FT).toFixed(1);
}

export function feetToMeters(ft) {
  return +(ft * FT_TO_M).toFixed(2);
}

/* ── Auto-placement helpers ───────────────────────────── */

/**
 * Default subject position: center of room, slightly toward the back
 * to leave more depth in front for camera + working space.
 */
export function autoPlaceSubject(roomDims) {
  return {
    x: roomDims.widthFt / 2,
    y: roomDims.lengthFt * 0.4,  // 40% from back wall
  };
}

/**
 * Default camera position: directly in front of subject along the
 * depth axis, at the given distance (in meters, converted to feet).
 */
export function autoPlaceCamera(roomDims, cameraDistM = 2.0) {
  const subject = autoPlaceSubject(roomDims);
  const distFt = metersToFeet(cameraDistM);
  return {
    x: subject.x,
    y: Math.min(subject.y + distFt, roomDims.lengthFt - 1),
  };
}

/* ── Absolute position computation ────────────────────── */

/**
 * Convert a diagram light's angle/distance (relative to subject)
 * into absolute room coordinates (feet from back-left corner).
 *
 * Camera faces toward negative Y (from front of room toward back).
 * Angle 0° = toward camera = positive Y direction.
 * Angle +90° = camera-right = positive X direction.
 *
 * @param {object} light - { angle_deg, distance_m, height_m, role, ... }
 * @param {{ x: number, y: number }} subjectPos - subject position in room coords
 * @returns {{ x: number, y: number, heightFt: number }}
 */
export function lightToRoomCoords(light, subjectPos) {
  const angleDeg = light.angle_deg || 0;
  const distFt = metersToFeet(light.distance_m || 1.5);
  const heightFt = metersToFeet(light.height_m || 1.7);

  // Convert: 0° = toward camera (+Y), +angle = camera-right (+X)
  const angleRad = (angleDeg * Math.PI) / 180;
  const dx = Math.sin(angleRad) * distFt;
  const dy = Math.cos(angleRad) * distFt;

  return {
    x: subjectPos.x + dx,
    y: subjectPos.y + dy,
    heightFt,
    role: light.role,
    label: light.label || light.role,
    angleDeg,
    distanceFt: distFt,
  };
}

/**
 * Compute absolute room positions for all lights in a diagram spec.
 *
 * @param {{ lengthFt, widthFt, ceilingFt }} roomDims
 * @param {{ lights: object[], camera?: object }} diagramSpec
 * @param {{ x, y }|null} subjectPos - custom subject position (or auto-place)
 * @returns {{ subject, camera, lights: object[] }}
 */
export function computeAbsolutePositions(roomDims, diagramSpec, subjectPos = null) {
  const subject = subjectPos || autoPlaceSubject(roomDims);
  const camDistM = diagramSpec?.camera?.distance_m || 2.0;
  const camera = autoPlaceCamera(roomDims, camDistM);
  // Adjust camera X to match subject X
  camera.x = subject.x;
  camera.y = subject.y + metersToFeet(camDistM);

  const lights = (diagramSpec?.lights || []).map(light =>
    lightToRoomCoords(light, subject)
  );

  return { subject, camera, lights };
}

/* ── Constraint validation ────────────────────────────── */

/**
 * Validate all positions against room constraints.
 *
 * @param {{ lengthFt, widthFt, ceilingFt }} roomDims
 * @param {{ subject, camera, lights }} positions - from computeAbsolutePositions
 * @returns {{ warnings: string[], errors: string[] }}
 */
export function validateConstraints(roomDims, positions) {
  const warnings = [];
  const errors = [];
  const { lengthFt, widthFt, ceilingFt } = roomDims;

  for (const light of positions.lights) {
    const name = (light.label || light.role || 'Light').toUpperCase();

    // Ceiling check
    if (light.heightFt > ceilingFt) {
      errors.push(
        `${name}: Recommended height (${light.heightFt} ft) exceeds your ceiling (${ceilingFt} ft). ` +
        `Lower to ${(ceilingFt - 0.5).toFixed(1)} ft and increase power slightly.`
      );
    } else if (light.heightFt > ceilingFt - 1) {
      warnings.push(
        `${name}: Light is within 1 ft of the ceiling. Consider angling downward more steeply.`
      );
    }

    // Wall proximity — left
    if (light.x < MIN_WALL_CLEARANCE_FT) {
      warnings.push(
        `${name}: Only ${light.x.toFixed(1)} ft from the left wall (need ${MIN_WALL_CLEARANCE_FT} ft clearance).`
      );
    }
    // Wall proximity — right
    if (light.x > widthFt - MIN_WALL_CLEARANCE_FT) {
      warnings.push(
        `${name}: Only ${(widthFt - light.x).toFixed(1)} ft from the right wall.`
      );
    }
    // Wall proximity — back
    if (light.y < MIN_WALL_CLEARANCE_FT) {
      warnings.push(
        `${name}: Only ${light.y.toFixed(1)} ft from the back wall.`
      );
    }
    // Wall proximity — front
    if (light.y > lengthFt - MIN_WALL_CLEARANCE_FT) {
      warnings.push(
        `${name}: Only ${(lengthFt - light.y).toFixed(1)} ft from the front wall.`
      );
    }

    // Out of room entirely
    if (light.x < 0 || light.x > widthFt || light.y < 0 || light.y > lengthFt) {
      errors.push(
        `${name}: Light position is outside the room! Reduce distance or adjust angle.`
      );
    }
  }

  // Camera depth check
  if (positions.camera) {
    if (positions.camera.y > lengthFt) {
      errors.push(
        `Camera position is beyond the front wall. Room is too short for the recommended camera distance.`
      );
    } else if (positions.camera.y > lengthFt - 1) {
      warnings.push(
        `Camera is within 1 ft of the front wall. Consider moving the subject closer to the back.`
      );
    }
  }

  // Subject position check
  if (positions.subject) {
    if (positions.subject.x < 2 || positions.subject.x > widthFt - 2) {
      warnings.push(
        `Subject is very close to a side wall. Move toward center for more even lighting.`
      );
    }
  }

  return { warnings, errors };
}

/* ── Room guidance text ───────────────────────────────── */

/**
 * Generate human-readable room-relative placement text for each light.
 *
 * @param {{ lengthFt, widthFt, ceilingFt }} roomDims
 * @param {{ subject, camera, lights }} positions
 * @returns {{ [role]: string }}
 */
export function formatRoomGuidance(roomDims, positions) {
  const guidance = {};

  for (const light of positions.lights) {
    const role = light.role || 'light';
    const fromLeft = light.x.toFixed(1);
    const fromRight = (roomDims.widthFt - light.x).toFixed(1);
    const fromBack = light.y.toFixed(1);
    const fromFront = (roomDims.lengthFt - light.y).toFixed(1);

    // Use the nearest walls for the most helpful reference
    const nearestX = light.x <= roomDims.widthFt / 2
      ? `${fromLeft} ft from the left wall`
      : `${fromRight} ft from the right wall`;
    const nearestY = light.y <= roomDims.lengthFt / 2
      ? `${fromBack} ft from the back wall`
      : `${fromFront} ft from the front wall`;

    guidance[role] = `${nearestX}, ${nearestY}`;
  }

  return guidance;
}

/* ── Space fit check ──────────────────────────────────── */

/**
 * Check if a lighting setup fits in the given room.
 *
 * @param {{ lengthFt, widthFt, ceilingFt }} roomDims
 * @param {{ minWidthFt, minDepthFt, minCeilingFt }} spaceNeeds - from buildSpaceCheck()
 * @returns {{ fits: boolean, ceilingFits, widthFits, depthFits, issues: string[] }}
 */
export function checkRoomFit(roomDims, spaceNeeds) {
  const ceilingFits = roomDims.ceilingFt >= parseFloat(spaceNeeds.minCeilingFt);
  const widthFits = roomDims.widthFt >= parseFloat(spaceNeeds.minWidthFt);
  const depthFits = roomDims.lengthFt >= parseFloat(spaceNeeds.minDepthFt);
  const fits = ceilingFits && widthFits && depthFits;

  const issues = [];
  if (!ceilingFits) {
    issues.push(
      `Ceiling is ${roomDims.ceilingFt} ft but setup needs ${spaceNeeds.minCeilingFt} ft. ` +
      'Lower lights and increase power.'
    );
  }
  if (!widthFits) {
    issues.push(
      `Room is ${roomDims.widthFt} ft wide but setup needs ${spaceNeeds.minWidthFt} ft. ` +
      'Bring side lights closer or use narrower angles.'
    );
  }
  if (!depthFits) {
    issues.push(
      `Room is ${roomDims.lengthFt} ft deep but setup needs ${spaceNeeds.minDepthFt} ft. ` +
      'Move subject closer to the back wall or shorten camera distance.'
    );
  }

  return { fits, ceilingFits, widthFits, depthFits, issues };
}

/* ── Ceiling category derivation ──────────────────────── */

/**
 * Convert exact ceiling height to the legacy 4-tier category.
 * @param {number} ceilingFt
 * @returns {string}
 */
export function ceilingFtToCategory(ceilingFt) {
  if (ceilingFt < 8) return 'under_8';
  if (ceilingFt < 10) return '8_9';
  if (ceilingFt < 12) return '10_12';
  return '12_plus';
}
