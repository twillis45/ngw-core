import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import {
  computeAbsolutePositions,
  validateConstraints,
  formatRoomGuidance,
  autoPlaceSubject,
} from '../spatial/spatialEngine';
import { selectHaptic } from '../utils/haptics';
import ZoomOverlay from '../cards/ZoomOverlay';

/* ── Theme + constants (matching DiagramCard) ────────── */

// Distinct per-role colors — warm palette, readable on both dark and light canvas
const LIGHT_COLORS_DARK  = { key: '#D4A843', fill: '#6BA4D4', rim: '#A87ED4', background: '#5BBF8A', hair: '#D47EA8' };
const LIGHT_COLORS_LIGHT = { key: '#A07C2E', fill: '#3D7AAE', rim: '#7A52AE', background: '#3A9B66', hair: '#AE527A' };

/** Theme-aware palette for canvas drawing (Figma-aligned). */
function getTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const accent     = isDark ? '#C8A96E' : '#6B5A32';
  const accentDim  = isDark ? 'rgba(200,169,110,0.7)' : 'rgba(90,75,42,0.65)';
  const accentFaint = isDark ? 'rgba(200,169,110,0.15)' : 'rgba(90,75,42,0.15)';
  return {
    isDark,
    lightColors: isDark ? LIGHT_COLORS_DARK : LIGHT_COLORS_LIGHT,
    bg:             isDark ? '#0f1117' : '#FAFAF8',
    wall:           isDark ? '#2a2c36' : '#B0A99E',
    wallFill:       isDark ? '#0f1117' : '#FAFAF8',
    grid:           isDark ? 'rgba(200,169,110,0.06)' : 'rgba(158,132,85,0.08)',
    text:           accent,
    textDim:        accentDim,
    textFaint:      accentFaint,
    subject:        isDark ? '#f1f5f9' : '#6B6864',
    subjectBody:    isDark ? '#cbd5e1' : '#8C8780',
    camera:         isDark ? '#8A8C96' : '#8C8780',
    cameraLens:     isDark ? '#A0A2AC' : '#6B6864',
    markerDot:      isDark ? '#0f1117' : '#FAFAF8',
    connector:      accentDim,
    distLine:       accentDim,
    backdrop:       isDark ? '#1a1c24' : '#E8E4DE',
    backdropBorder: isDark ? '#2a2c36' : '#D4CFC8',
    backdropText:   accentDim,
    warnBg:         'rgba(239,68,68,0.15)',
  };
}

/** Resolve color for any role, including multi-key variants. */
function lightColor(role, colors) {
  const lc = colors || LIGHT_COLORS_DARK;
  if (lc[role]) return lc[role];
  if (role?.startsWith('key')) return lc.key;
  if (role?.startsWith('fill')) return lc.fill;
  if (role?.startsWith('rim')) return lc.rim;
  if (role?.startsWith('hair')) return lc.hair;
  if (role === 'background') return lc.background;
  return colors ? '#6B6864' : '#8C8780';
}

const SHORT_MOD = {
  softbox: 'Softbox', softbox_rect: 'Rect Softbox', umbrella: 'Umbrella',
  beauty_dish: 'Beauty Dish', grid_spot: 'Grid', grid: 'Grid',
  stripbox: 'Strip', barn_doors: 'Barndoors', snoot: 'Snoot', bare: 'Bare',
};

const FONT = `"Inter", "SF Pro Display", -apple-system, BlinkMacSystemFont, sans-serif`;
const MARKER_RADIUS = 12;
const HIT_RADIUS = 28; // touch target

/**
 * Describe what a key/fill angle shift means for the lighting setup.
 *
 * Angles follow convention: 0° = toward camera, ±45° = Rembrandt zone,
 * ±90° = side/split, ±135° = rim territory, 180° = directly behind.
 */
function describeAngleShift(role, origAngle, currentAngle, delta) {
  const absAngle = Math.abs(currentAngle);
  const wasAbs = Math.abs(origAngle);
  const roleName = role === 'key' ? 'Key' : 'Fill';

  // Name the current position
  let posName;
  if (absAngle < 15)       posName = 'near on-axis (flat, front-lit)';
  else if (absAngle < 35)  posName = 'loop lighting position';
  else if (absAngle < 55)  posName = 'Rembrandt position';
  else if (absAngle < 75)  posName = 'short/broad transition zone';
  else if (absAngle < 100) posName = 'split lighting position';
  else if (absAngle < 135) posName = 'rim/kicker territory';
  else                      posName = 'behind the subject';

  // Describe the change impact
  if (role === 'key') {
    if (absAngle < 15 && wasAbs >= 30)
      return `${roleName} moved to front — flat light, minimal shadow. This changes the pattern significantly.`;
    if (absAngle >= 35 && absAngle < 55 && (wasAbs < 35 || wasAbs >= 55))
      return `${roleName} now at ${posName} — classic portrait triangle shadow on the cheek.`;
    if (absAngle >= 75 && absAngle < 100 && wasAbs < 75)
      return `${roleName} moved to ${posName} — dramatic half-face shadow, strong mood shift.`;
    if (absAngle >= 100)
      return `${roleName} moved to ${posName} — acts more like a rim light than a key. Consider swapping roles.`;
  }

  if (role === 'fill') {
    if (absAngle >= 75)
      return `${roleName} moved to ${posName} — won't fill shadows effectively from here. Ratio will be very high.`;
    if (absAngle < 15)
      return `${roleName} at ${posName} — maximum shadow fill, very low contrast look.`;
  }

  // Generic description
  if (delta > 30)
    return `${roleName} shifted ${delta}° to ${posName}. This substantially changes the lighting pattern.`;
  return `${roleName} moved to ${posName} — subtle angle adjustment, ${delta}° from the original setup.`;
}

/**
 * FloorPlanCanvas — interactive bird's-eye room layout.
 *
 * Props:
 *   roomDims     - { lengthFt, widthFt, ceilingFt }
 *   diagramSpec  - { lights[], camera? } from result.diagram
 *   subjectPos   - { x, y } or null (auto-placed)
 *   cameraPos    - { x, y } or null (auto-placed)
 *   onSubjectMove - ({ x, y }) => void
 *   onCameraMove  - ({ x, y }) => void
 *   onLightMove   - (index, { x, y }) => void
 *   onWarnings    - (warnings[]) => void
 */
export default function FloorPlanCanvas({
  roomDims,
  diagramSpec,
  subjectPos: subjectPosOverride,
  cameraPos: cameraPosOverride,
  onSubjectMove,
  onCameraMove,
  onLightMove,
  onWarnings,
  onGuidance,
  onItemSelect,
}) {
  const canvasRef = useRef(null);
  const [dragging, setDragging] = useState(null); // 'subject' | 'camera' | 'light:N' | 'background' | null
  const [positions, setPositions] = useState(null);
  const [localSubject, setLocalSubject] = useState(null);
  const [localCamera, setLocalCamera] = useState(null);
  const [localLightOverrides, setLocalLightOverrides] = useState({});
  const [localBgOffset, setLocalBgOffset] = useState(null); // { x } offset from center
  const initialLightPositionsRef = useRef(null); // snapshot of light room coords on first compute
  const [selectedItem, setSelectedItem] = useState(null); // { type, role?, index? }
  const [zoomSrc, setZoomSrc] = useState(null);
  const [showBeams, setShowBeams] = useState(true);
  const [showAngles, setShowAngles] = useState(true);
  const dragStartRef = useRef(null); // track drag vs click

  // Track theme changes to trigger canvas redraw
  const [themeKey, setThemeKey] = useState(() =>
    document.documentElement.getAttribute('data-theme') || 'dark'
  );
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setThemeKey(document.documentElement.getAttribute('data-theme') || 'dark');
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  // Stable refs to avoid triggering re-render cycles
  const onWarningsRef = useRef(onWarnings);
  onWarningsRef.current = onWarnings;
  const onGuidanceRef = useRef(onGuidance);
  onGuidanceRef.current = onGuidance;
  const onItemSelectRef = useRef(onItemSelect);
  onItemSelectRef.current = onItemSelect;

  // Memoize subject position to avoid new object every render (prevents infinite useEffect loop)
  const subjectPos = useMemo(
    () => subjectPosOverride || localSubject || (roomDims ? autoPlaceSubject(roomDims) : null),
    [subjectPosOverride, localSubject, roomDims?.widthFt, roomDims?.lengthFt]
  );
  const cameraDistM = diagramSpec?.camera?.distance_m || 2.0;

  /* ── Compute positions and validate ─────────────────── */

  useEffect(() => {
    if (!roomDims || !diagramSpec) return;

    const pos = computeAbsolutePositions(roomDims, diagramSpec, subjectPos);
    if (cameraPosOverride) pos.camera = cameraPosOverride;
    else if (localCamera) pos.camera = localCamera;

    // Snapshot initial light positions on first compute — lights stay fixed
    // in the room when subject is dragged (subject movement is independent)
    if (!initialLightPositionsRef.current) {
      initialLightPositionsRef.current = pos.lights.map(l => ({ x: l.x, y: l.y }));
    }

    // Use frozen initial positions for lights (independent of subject movement)
    pos.lights = pos.lights.map((l, i) => {
      const frozen = initialLightPositionsRef.current[i];
      return frozen ? { ...l, x: frozen.x, y: frozen.y } : l;
    });

    // Apply local light position overrides from dragging
    for (const [idx, override] of Object.entries(localLightOverrides)) {
      if (pos.lights[idx]) {
        pos.lights[idx] = { ...pos.lights[idx], ...override };
      }
    }

    setPositions(pos);

    const { warnings, errors } = validateConstraints(roomDims, pos);
    onWarningsRef.current?.([ ...errors, ...warnings ]);

    // ── Spatial guidance — explain how distances affect the image ──
    const guidance = [];
    if (pos.camera && pos.subject) {
      const camDist = Math.sqrt(
        Math.pow(pos.camera.x - pos.subject.x, 2) +
        Math.pow(pos.camera.y - pos.subject.y, 2)
      );
      if (camDist < 4) {
        guidance.push({ label: 'Camera → Subject', value: `${camDist.toFixed(1)} ft`, note: 'Very close — tight headshot framing, strong background blur.' });
      } else if (camDist < 7) {
        guidance.push({ label: 'Camera → Subject', value: `${camDist.toFixed(1)} ft`, note: 'Medium distance — waist-up framing, moderate background blur.' });
      } else if (camDist < 12) {
        guidance.push({ label: 'Camera → Subject', value: `${camDist.toFixed(1)} ft`, note: 'Good working distance — full body with natural perspective.' });
      } else {
        guidance.push({ label: 'Camera → Subject', value: `${camDist.toFixed(1)} ft`, note: 'Far — environmental framing, background will be more in focus.' });
      }
    }
    if (pos.subject) {
      const bgDist = pos.subject.y; // distance to back wall / background
      if (bgDist < 3) {
        guidance.push({ label: 'Subject → Background', value: `${bgDist.toFixed(1)} ft`, note: 'Very close to background — shadows may fall on it, less separation.' });
      } else if (bgDist < 6) {
        guidance.push({ label: 'Subject → Background', value: `${bgDist.toFixed(1)} ft`, note: 'Good separation — background shadows fall off, some blur.' });
      } else {
        guidance.push({ label: 'Subject → Background', value: `${bgDist.toFixed(1)} ft`, note: 'Strong separation — clean background blur, no spill shadows.' });
      }
    }
    for (const light of pos.lights) {
      const dx = light.x - pos.subject.x;
      const dy = light.y - pos.subject.y;
      const ld = Math.sqrt(dx * dx + dy * dy);
      const name = (light.role || '').charAt(0).toUpperCase() + (light.role || '').slice(1);

      if (light.role === 'key' || light.role === 'fill') {
        // Distance guidance
        if (ld < 3) {
          guidance.push({ label: `${name} → Subject`, value: `${ld.toFixed(1)} ft`, note: 'Very close — soft wrap but rapid falloff, may need lower power.' });
        } else if (ld < 6) {
          guidance.push({ label: `${name} → Subject`, value: `${ld.toFixed(1)} ft`, note: 'Sweet spot — even coverage with good falloff control.' });
        } else if (ld < 10) {
          guidance.push({ label: `${name} → Subject`, value: `${ld.toFixed(1)} ft`, note: 'Standard distance — harder light quality, even spread.' });
        } else {
          guidance.push({ label: `${name} → Subject`, value: `${ld.toFixed(1)} ft`, note: 'Far — harder light, will need more power. Consider moving closer.' });
        }

        // Angle guidance — compute current angle from dragged position vs original spec
        // Convention: 0° = toward camera (+Y from subject), +angle = camera-right (+X)
        const currentAngle = Math.round((Math.atan2(dx, dy) * 180) / Math.PI);
        const origAngle = light.angleDeg || 0;
        const angleDelta = Math.abs(currentAngle - origAngle);

        if (angleDelta > 5) {
          const angleNote = describeAngleShift(light.role, origAngle, currentAngle, angleDelta);
          // Determine if the pattern name actually changed (warning level)
          const absC = Math.abs(currentAngle);
          const absO = Math.abs(origAngle);
          const patC = absC < 15 ? 'flat' : absC < 35 ? 'loop' : absC < 55 ? 'rembrandt' : absC < 75 ? 'short' : absC < 100 ? 'split' : 'rim';
          const patO = absO < 15 ? 'flat' : absO < 35 ? 'loop' : absO < 55 ? 'rembrandt' : absO < 75 ? 'short' : absO < 100 ? 'split' : 'rim';
          const patternChanged = patC !== patO;
          guidance.push({
            label: `${name} Angle`,
            value: `${currentAngle}° (was ${origAngle}°)`,
            note: angleNote,
            changed: true,
            warn: patternChanged,
          });
        }
      }
    }
    onGuidanceRef.current?.(guidance);
  }, [roomDims, diagramSpec, subjectPos, cameraPosOverride, localCamera, localLightOverrides]);

  /* ── Canvas drawing ─────────────────────────────────── */

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !roomDims || !positions) return;

    const tc = getTheme();
    const dpr = window.devicePixelRatio || 1;
    const containerW = canvas.parentElement?.clientWidth || 340;
    const fs = containerW >= 600 ? 1.2 : containerW >= 450 ? 1.1 : 1.0;

    // Scale room to fit canvas with padding
    const pad = 40;
    const availW = containerW - pad * 2;
    const aspect = roomDims.widthFt / roomDims.lengthFt;
    let drawW, drawH;
    if (aspect > 1) {
      drawW = availW;
      drawH = availW / aspect;
    } else {
      drawH = Math.min(availW / aspect, containerW * 1.2);
      drawW = drawH * aspect;
    }
    const canvasW = drawW + pad * 2;
    const canvasH = drawH + pad * 2;

    canvas.width = canvasW * dpr;
    canvas.height = canvasH * dpr;
    canvas.style.width = canvasW + 'px';
    canvas.style.height = canvasH + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, canvasW, canvasH);

    // Room → canvas coordinate transform
    const scaleX = drawW / roomDims.widthFt;
    const scaleY = drawH / roomDims.lengthFt;
    const toCanvasX = (roomX) => pad + roomX * scaleX;
    // Y is inverted: room Y=0 (back wall) maps to bottom of canvas
    const toCanvasY = (roomY) => pad + (roomDims.lengthFt - roomY) * scaleY;

    // Selection dim — when something is selected, non-selected items draw at reduced alpha
    const hasSel = !!selectedItem;
    const DIM = 0.12; // alpha for non-selected items when something is selected (dramatic)

    // ── Room background ──
    ctx.fillStyle = tc.wallFill;
    ctx.strokeStyle = tc.wall;
    ctx.lineWidth = 2;
    ctx.fillRect(pad, pad, drawW, drawH);
    ctx.strokeRect(pad, pad, drawW, drawH);

    // ── Grid ──
    ctx.strokeStyle = tc.grid;
    ctx.lineWidth = 0.5;
    const gridStep = roomDims.widthFt > 30 || roomDims.lengthFt > 30 ? 5 : roomDims.widthFt > 15 ? 2 : 1;
    for (let x = gridStep; x < roomDims.widthFt; x += gridStep) {
      const cx = toCanvasX(x);
      ctx.beginPath();
      ctx.moveTo(cx, pad);
      ctx.lineTo(cx, pad + drawH);
      ctx.stroke();
    }
    for (let y = gridStep; y < roomDims.lengthFt; y += gridStep) {
      const cy = toCanvasY(y);
      ctx.beginPath();
      ctx.moveTo(pad, cy);
      ctx.lineTo(pad + drawW, cy);
      ctx.stroke();
    }

    // ── Wall labels ──
    ctx.fillStyle = tc.textDim;
    ctx.font = `${Math.round(11 * fs)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(`${roomDims.widthFt} ft`, pad + drawW / 2, pad - 8);
    ctx.save();
    ctx.translate(pad - 12, pad + drawH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`${roomDims.lengthFt} ft`, 0, 0);
    ctx.restore();
    ctx.fillStyle = tc.textDim;
    ctx.font = `${Math.round(10 * fs)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('BACK WALL', pad + drawW / 2, pad + drawH + 14);
    ctx.fillText('FRONT', pad + drawW / 2, pad - 18);

    // ── Background/backdrop bar (matching DiagramCard) ──
    const bgW = drawW * 0.6;
    const bgH = Math.round(14 * fs);
    const bgXBase = pad + drawW / 2;
    const bgXOff = localBgOffset ? localBgOffset.x * scaleX : 0;
    const bgX = bgXBase + bgXOff;
    const bgY = pad + drawH - Math.round(12 * fs);

    // Dim background bar if not selected
    if (hasSel && selectedItem?.type !== 'background') ctx.globalAlpha = DIM;

    // Selection glow for background
    if (selectedItem?.type === 'background') {
      ctx.save();
      ctx.shadowColor = tc.isDark ? 'rgba(90,191,138,0.5)' : 'rgba(58,155,102,0.4)';
      ctx.shadowBlur = 14;
      ctx.strokeStyle = tc.isDark ? 'rgba(90,191,138,0.7)' : 'rgba(58,155,102,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(bgX - bgW / 2 - 3, bgY - bgH / 2 - 3, bgW + 6, bgH + 6, 5);
      ctx.stroke();
      ctx.restore();
    }

    ctx.fillStyle = tc.backdrop;
    ctx.strokeStyle = tc.backdropBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(bgX - bgW / 2, bgY - bgH / 2, bgW, bgH, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = tc.backdropText;
    ctx.font = `${Math.round(10 * fs)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('Background', bgX, bgY + Math.round(3 * fs));
    ctx.globalAlpha = 1; // reset after background

    const sx = toCanvasX(positions.subject.x);
    const sy = toCanvasY(positions.subject.y);

    // ── Light beams (triangular spread — matching DiagramCard) ──
    if (showBeams) {
      for (let bi = 0; bi < positions.lights.length; bi++) {
        const light = positions.lights[bi];
        const isThisSelected = selectedItem?.type === 'light' && selectedItem?.index === bi;
        // Beam stays bright if its own light is selected, OR if its target is selected
        const isBackground = light.role === 'background';
        const targetIsSelected = isBackground
          ? selectedItem?.type === 'background'
          : selectedItem?.type === 'subject';
        const beamConnected = isThisSelected || targetIsSelected;
        const beamDim = hasSel && !beamConnected ? DIM : 1;
        const lx = toCanvasX(light.x);
        const ly = toCanvasY(light.y);
        const color = lightColor(light.role, tc.lightColors);
        const targetX = isBackground ? bgX : sx;
        const targetY = isBackground ? bgY : sy;

        // Beam spread triangle
        ctx.save();
        ctx.globalAlpha = (tc.isDark ? 0.10 : 0.08) * beamDim;
        ctx.fillStyle = color;
        const dx = targetX - lx;
        const dy = targetY - ly;
        const angle = Math.atan2(dy, dx);
        const spread = isBackground ? 0.35 : 0.22;
        const beamLen = Math.sqrt(dx * dx + dy * dy) + 20;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(lx + Math.cos(angle - spread) * beamLen, ly + Math.sin(angle - spread) * beamLen);
        ctx.lineTo(lx + Math.cos(angle + spread) * beamLen, ly + Math.sin(angle + spread) * beamLen);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // Connector line
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.35 * beamDim;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo(targetX, targetY);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // ── Distance labels on light connectors ──
    for (let dli = 0; dli < positions.lights.length; dli++) {
      const light = positions.lights[dli];
      const lx = toCanvasX(light.x);
      const ly = toCanvasY(light.y);
      const dist = Math.sqrt(
        Math.pow(light.x - positions.subject.x, 2) +
        Math.pow(light.y - positions.subject.y, 2)
      );
      const midX = (sx + lx) / 2;
      const midY = (sy + ly) / 2;
      // Dim distance label unless its light or target is selected
      const dlSel = selectedItem?.type === 'light' && selectedItem?.index === dli;
      const dlTargetSel = light.role === 'background'
        ? selectedItem?.type === 'background'
        : selectedItem?.type === 'subject';
      if (hasSel && !dlSel && !dlTargetSel) ctx.globalAlpha = DIM;
      ctx.fillStyle = tc.textDim;
      ctx.font = `${Math.round(10 * fs)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(`${dist.toFixed(1)}'`, midX, midY - 4);
      ctx.globalAlpha = 1;
    }

    // ── Camera-to-Subject distance ──
    if (positions.camera) {
      const camX = toCanvasX(positions.camera.x);
      const camY = toCanvasY(positions.camera.y);
      const camDist = Math.sqrt(
        Math.pow(positions.camera.x - positions.subject.x, 2) +
        Math.pow(positions.camera.y - positions.subject.y, 2)
      );
      // Dashed connector line
      ctx.strokeStyle = tc.camera;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.4;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(camX, camY);
      ctx.lineTo(sx, sy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      // Distance label
      const camMidX = (camX + sx) / 2 + 14;
      const camMidY = (camY + sy) / 2;
      ctx.fillStyle = tc.textDim;
      ctx.font = `${Math.round(10 * fs)}px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillText(`${camDist.toFixed(1)}'`, camMidX, camMidY);
    }

    // ── Subject-to-Background distance ──
    {
      // Background is at the back wall (y ≈ 0 in room coords)
      const bgDist = positions.subject.y;
      // Dashed connector line from subject down to background bar
      ctx.strokeStyle = tc.backdropBorder;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.4;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx, bgY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      // Distance label offset to the right
      const bgMidY = (sy + bgY) / 2;
      ctx.fillStyle = tc.textDim;
      ctx.font = `${Math.round(10 * fs)}px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillText(`${bgDist.toFixed(1)}'`, sx + 10, bgMidY);
    }

    // ── Collision-aware label placement (matching DiagramCard) ──
    const labelBoxes = [];
    const LPAD = 4;

    function addBox(cx, cy, w, h) {
      labelBoxes.push({ x: cx - w / 2 - LPAD, y: cy - h / 2 - LPAD, w: w + LPAD * 2, h: h + LPAD * 2 });
    }
    function boxFits(cx, cy, w, h) {
      const r = { x: cx - w / 2 - LPAD, y: cy - h / 2 - LPAD, w: w + LPAD * 2, h: h + LPAD * 2 };
      for (const b of labelBoxes) {
        if (r.x < b.x + b.w && r.x + r.w > b.x && r.y < b.y + b.h && r.y + r.h > b.y) {
          return false;
        }
      }
      return true;
    }

    // Reserve subject and camera label areas
    addBox(sx, sy - 16, 50, 14);
    addBox(bgX, bgY, 70, 14);

    // ── Light markers ──
    for (let li = 0; li < positions.lights.length; li++) {
      const light = positions.lights[li];
      const lx = toCanvasX(light.x);
      const ly = toCanvasY(light.y);
      const color = lightColor(light.role, tc.lightColors);
      const isSelected = selectedItem?.type === 'light' && selectedItem?.index === li;
      // Light markers brighten if selected, or if their target (subject/bg) is selected
      const isTargetSelected = light.role === 'background'
        ? selectedItem?.type === 'background'
        : selectedItem?.type === 'subject';
      const markerDim = hasSel && !isSelected && !isTargetSelected ? DIM : 1;
      ctx.globalAlpha = markerDim;

      // Warning glow if near wall or out of room
      const nearWall =
        light.x < 1.5 || light.x > roomDims.widthFt - 1.5 ||
        light.y < 1.5 || light.y > roomDims.lengthFt - 1.5;
      const outOfRoom =
        light.x < 0 || light.x > roomDims.widthFt ||
        light.y < 0 || light.y > roomDims.lengthFt;

      if (outOfRoom || nearWall) {
        ctx.fillStyle = tc.warnBg;
        ctx.beginPath();
        ctx.arc(lx, ly, MARKER_RADIUS + 6, 0, Math.PI * 2);
        ctx.fill();
      }

      // Selection glow (matching DiagramCard — 16px ring, 18px shadowBlur)
      if (isSelected) {
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 18;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.globalAlpha = 0.75;
        ctx.beginPath();
        ctx.arc(lx, ly, 16, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Marker circle (matching DiagramCard style — colored circle + inner dot)
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(lx, ly, MARKER_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = tc.markerDot;
      ctx.beginPath();
      ctx.arc(lx, ly, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1; // reset after each marker
    }

    // ── Light labels (collision-aware, matching DiagramCard) ──
    const sortedLights = [...positions.lights].sort((a, b) => {
      const others = positions.lights;
      const minGapA = others.reduce((min, o) => o === a ? min : Math.min(min, Math.abs(a.angleDeg - o.angleDeg)), 360);
      const minGapB = others.reduce((min, o) => o === b ? min : Math.min(min, Math.abs(b.angleDeg - o.angleDeg)), 360);
      return minGapB - minGapA;
    });

    sortedLights.forEach(light => {
      const lx = toCanvasX(light.x);
      const ly = toCanvasY(light.y);
      const color = lightColor(light.role, tc.lightColors);
      // Canvas label: just the role name — details are in the light list below
      const roleName = (light.role || '').toUpperCase();
      const line2 = '';

      ctx.font = `bold ${Math.round(11 * fs)}px ${FONT}`;
      const nameW = ctx.measureText(roleName).width;
      const detailW = 0;
      const boxW = Math.max(nameW, detailW);
      const boxH = Math.round(24 * fs);

      // Candidate positions for label placement
      const dx = lx - sx;
      const dy = ly - sy;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = dx / len;
      const ny = dy / len;
      const px = -ny;
      const py = nx;

      const offsets = [
        { x: nx * 28,  y: ny * 28 },
        { x: nx * 16 + px * (boxW / 2 + 24), y: ny * 16 + py * (boxW / 2 + 24) },
        { x: nx * 16 - px * (boxW / 2 + 24), y: ny * 16 - py * (boxW / 2 + 24) },
        { x: nx * 48,  y: ny * 48 },
        { x: 0, y: -28 },
        { x: 0, y: 34 },
        { x: boxW / 2 + 30, y: 0 },
        { x: -(boxW / 2 + 30), y: 0 },
      ];

      let labelX = lx + offsets[0].x;
      let labelY = ly + offsets[0].y;

      for (const off of offsets) {
        const tx = lx + off.x;
        const ty = ly + off.y;
        const cy = ty + 5;
        if (tx - boxW / 2 > 4 && tx + boxW / 2 < canvasW - 4 && ty - 4 > 4 && ty + boxH < canvasH - 4) {
          if (boxFits(tx, cy, boxW, boxH)) {
            labelX = tx;
            labelY = ty;
            break;
          }
        }
      }

      // Connector line from marker to label
      ctx.strokeStyle = tc.connector;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(labelX, labelY + 5);
      ctx.stroke();

      // Role name
      ctx.fillStyle = color;
      ctx.font = `bold ${Math.round(11 * fs)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(roleName, labelX, labelY);

      // Detail line (modifier · height)
      if (line2) {
        ctx.fillStyle = tc.textDim;
        ctx.font = `${Math.round(10 * fs)}px ${FONT}`;
        ctx.fillText(line2, labelX, labelY + Math.round(12 * fs));
      }

      addBox(labelX, labelY + 5, boxW, boxH);
    });

    // ── Subject marker ──
    if (hasSel && selectedItem?.type !== 'subject') ctx.globalAlpha = DIM;
    if (selectedItem?.type === 'subject') {
      ctx.save();
      ctx.shadowColor = tc.isDark ? 'rgba(138,135,133,0.6)' : 'rgba(107,104,100,0.5)';
      ctx.shadowBlur = 12;
      ctx.strokeStyle = tc.isDark ? 'rgba(138,135,133,0.7)' : 'rgba(107,104,100,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, 13, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = tc.subject;
    ctx.beginPath();
    ctx.arc(sx, sy, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = tc.markerDot;
    ctx.beginPath();
    ctx.arc(sx, sy, 3, 0, Math.PI * 2);
    ctx.fill();
    // Label
    ctx.fillStyle = tc.text;
    ctx.font = `bold ${Math.round(11 * fs)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('Subject', sx, sy - 16);
    ctx.globalAlpha = 1; // reset after subject

    // ── Camera marker ──
    if (positions.camera) {
      if (hasSel && selectedItem?.type !== 'camera') ctx.globalAlpha = DIM;
      const cx = toCanvasX(positions.camera.x);
      const cy = toCanvasY(positions.camera.y);
      // Selection glow
      if (selectedItem?.type === 'camera') {
        ctx.save();
        ctx.shadowColor = tc.isDark ? 'rgba(110,106,101,0.6)' : 'rgba(107,104,100,0.5)';
        ctx.shadowBlur = 12;
        ctx.strokeStyle = tc.isDark ? 'rgba(138,135,133,0.7)' : 'rgba(107,104,100,0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(cx - 14, cy - 10, 28, 20, 5);
        ctx.stroke();
        ctx.restore();
      }
      // Rectangle with lens circle (matching DiagramCard)
      ctx.fillStyle = tc.camera;
      ctx.beginPath();
      ctx.roundRect(cx - 10, cy - 6, 20, 12, 3);
      ctx.fill();
      ctx.fillStyle = tc.cameraLens;
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fill();
      // Label
      ctx.fillStyle = tc.textDim;
      ctx.font = `${Math.round(11 * fs)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('Camera', cx, cy + 22);

      addBox(cx, cy + 22, 50, 14);
      ctx.globalAlpha = 1; // reset after camera
    }

    // ── Key / Fill angle arcs from subject ──────────── ──
    // Bold, high-contrast angle indicators — warning/callout style
    // Convention: 0° = toward camera (+Y in room = up on canvas)
    if (showAngles && positions.camera) {
      const camAngle = Math.atan2(
        toCanvasX(positions.camera.x) - sx,
        -(toCanvasY(positions.camera.y) - sy)
      ); // canvas angle where camera is (reference 0°)

      const arcRadius = Math.round(38 * fs);
      const arcLabelRadius = arcRadius + Math.round(18 * fs);
      const angleLabelBoxes = []; // collision avoidance for angle labels

      for (let li = 0; li < positions.lights.length; li++) {
        const light = positions.lights[li];
        if (light.role !== 'key' && light.role !== 'fill') continue;

        const color = lightColor(light.role, tc.lightColors);
        const lx = toCanvasX(light.x);
        const ly = toCanvasY(light.y);

        // Compute current angle in room coords (0° = toward camera / +Y)
        const dx = light.x - positions.subject.x;
        const dy = light.y - positions.subject.y;
        const currentAngleDeg = Math.round((Math.atan2(dx, dy) * 180) / Math.PI);
        const absAngle = Math.abs(currentAngleDeg);

        // Determine severity — dramatic angles get warning treatment
        const isCritical = absAngle >= 75;  // split/rim territory
        const isNotable = absAngle >= 35;   // Rembrandt+

        // Canvas angle of this light (for arc drawing)
        const lightCanvasAngle = Math.atan2(lx - sx, -(ly - sy));

        // Reference direction: toward camera = 0°
        const refCanvasAngle = -Math.PI / 2 + camAngle;
        const lightArcAngle = -Math.PI / 2 + lightCanvasAngle;

        // Draw the arc — thicker, more prominent
        ctx.save();
        ctx.strokeStyle = isCritical
          ? (tc.isDark ? '#ef4444' : '#dc2626')
          : color;
        ctx.lineWidth = isCritical ? 2.5 : 2;
        ctx.globalAlpha = isCritical ? 0.85 : 0.65;
        ctx.setLineDash(isCritical ? [5, 3] : [4, 3]);
        ctx.beginPath();

        // Determine sweep direction
        let startA = refCanvasAngle;
        let endA = lightArcAngle;
        let diff = endA - startA;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const ccw = diff < 0;

        ctx.arc(sx, sy, arcRadius, startA, endA, ccw);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // Filled arc wedge for critical angles — danger zone shading
        if (isCritical) {
          ctx.save();
          ctx.fillStyle = tc.isDark ? 'rgba(239,68,68,0.08)' : 'rgba(220,38,38,0.06)';
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.arc(sx, sy, arcRadius, startA, endA, ccw);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        }

        // Angle label — positioned at midpoint of arc
        const midAngle = startA + diff / 2;
        let labelX = sx + Math.cos(midAngle) * arcLabelRadius;
        let labelY = sy + Math.sin(midAngle) * arcLabelRadius;

        const roleName = light.role.charAt(0).toUpperCase() + light.role.slice(1);
        const degStr = `${absAngle}°`;

        // Pattern name based on angle
        let patternName;
        if (absAngle < 15)       patternName = 'Flat';
        else if (absAngle < 35)  patternName = 'Loop';
        else if (absAngle < 55)  patternName = 'Rembrandt';
        else if (absAngle < 75)  patternName = 'Short/Broad';
        else if (absAngle < 100) patternName = 'Split';
        else if (absAngle < 135) patternName = 'Rim';
        else                      patternName = 'Back';

        // Measure text for badge background
        const roleFont = `bold ${Math.round(10 * fs)}px ${FONT}`;
        const degFont = `bold ${Math.round(13 * fs)}px ${FONT}`;
        const patFont = `${Math.round(9 * fs)}px ${FONT}`;
        ctx.font = roleFont;
        const roleW = ctx.measureText(roleName).width;
        ctx.font = degFont;
        const degW = ctx.measureText(degStr).width;
        ctx.font = patFont;
        const patW = ctx.measureText(patternName).width;
        const badgeW = Math.max(roleW, degW, patW) + Math.round(20 * fs);
        const badgeH = Math.round(42 * fs);

        // Robust collision avoidance — check against both angle labels AND light labels
        const checkCollision = (cx, cy) => {
          const allBoxes = [...angleLabelBoxes, ...labelBoxes];
          for (const b of allBoxes) {
            if (
              cx - badgeW / 2 < b.x + b.w && cx + badgeW / 2 > b.x &&
              cy - badgeH / 2 < b.y + b.h && cy + badgeH / 2 > b.y
            ) return true;
          }
          return false;
        };

        // Perpendicular offset direction (clockwise 90°)
        const perpX = -Math.sin(midAngle);
        const perpY = Math.cos(midAngle);
        const nudge = Math.round(22 * fs);

        const candidates = [
          // Default: at midpoint of arc, at label radius
          { x: sx + Math.cos(midAngle) * arcLabelRadius, y: sy + Math.sin(midAngle) * arcLabelRadius },
          // Further out along same angle
          { x: sx + Math.cos(midAngle) * (arcLabelRadius + nudge), y: sy + Math.sin(midAngle) * (arcLabelRadius + nudge) },
          // Offset perpendicular (both sides)
          { x: sx + Math.cos(midAngle) * arcLabelRadius + perpX * nudge, y: sy + Math.sin(midAngle) * arcLabelRadius + perpY * nudge },
          { x: sx + Math.cos(midAngle) * arcLabelRadius - perpX * nudge, y: sy + Math.sin(midAngle) * arcLabelRadius - perpY * nudge },
          // Even further out
          { x: sx + Math.cos(midAngle) * (arcLabelRadius + nudge * 2), y: sy + Math.sin(midAngle) * (arcLabelRadius + nudge * 2) },
          // Perpendicular + further
          { x: sx + Math.cos(midAngle) * (arcLabelRadius + nudge) + perpX * nudge, y: sy + Math.sin(midAngle) * (arcLabelRadius + nudge) + perpY * nudge },
          { x: sx + Math.cos(midAngle) * (arcLabelRadius + nudge) - perpX * nudge, y: sy + Math.sin(midAngle) * (arcLabelRadius + nudge) - perpY * nudge },
        ];

        let placed = false;
        for (const c of candidates) {
          if (c.x - badgeW / 2 > pad && c.x + badgeW / 2 < pad + drawW &&
              c.y - badgeH / 2 > pad && c.y + badgeH / 2 < pad + drawH &&
              !checkCollision(c.x, c.y)) {
            labelX = c.x;
            labelY = c.y;
            placed = true;
            break;
          }
        }
        if (!placed) {
          // Last resort: use furthest candidate even if it clips
          labelX = candidates[4].x;
          labelY = candidates[4].y;
        }

        angleLabelBoxes.push({ x: labelX - badgeW / 2, y: labelY - badgeH / 2, w: badgeW, h: badgeH });

        // Badge background — pill shape with severity coloring
        ctx.save();
        const badgeBg = isCritical
          ? (tc.isDark ? 'rgba(239,68,68,0.18)' : 'rgba(220,38,38,0.12)')
          : isNotable
            ? (tc.isDark ? 'rgba(200,169,110,0.14)' : 'rgba(90,75,42,0.10)')
            : (tc.isDark ? 'rgba(200,169,110,0.08)' : 'rgba(90,75,42,0.06)');
        const badgeBorder = isCritical
          ? (tc.isDark ? 'rgba(239,68,68,0.4)' : 'rgba(220,38,38,0.3)')
          : (tc.isDark ? 'rgba(200,169,110,0.2)' : 'rgba(90,75,42,0.15)');
        ctx.fillStyle = badgeBg;
        ctx.strokeStyle = badgeBorder;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(labelX - badgeW / 2, labelY - badgeH / 2, badgeW, badgeH, Math.round(6 * fs));
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // Role name (smaller, top)
        const labelColor = isCritical
          ? (tc.isDark ? '#f87171' : '#dc2626')
          : color;
        ctx.fillStyle = labelColor;
        ctx.font = roleFont;
        ctx.globalAlpha = 0.9;
        ctx.textAlign = 'center';
        ctx.fillText(roleName, labelX, labelY - Math.round(8 * fs));

        // Degree value (larger, bold, middle)
        ctx.fillStyle = isCritical
          ? (tc.isDark ? '#fca5a5' : '#b91c1c')
          : (tc.isDark ? '#f1f5f9' : '#1e293b');
        ctx.font = degFont;
        ctx.globalAlpha = 1;
        ctx.fillText(degStr, labelX, labelY + Math.round(6 * fs));

        // Pattern name (small, bottom — identifies the lighting style)
        ctx.fillStyle = isCritical
          ? (tc.isDark ? '#f87171' : '#dc2626')
          : (tc.isDark ? 'rgba(200,169,110,0.75)' : 'rgba(90,75,42,0.7)');
        ctx.font = patFont;
        ctx.globalAlpha = 0.85;
        ctx.fillText(patternName, labelX, labelY + Math.round(18 * fs));
        ctx.globalAlpha = 1;
      }
    }

    // Store transform for hit testing
    canvas._spatialTransform = { toCanvasX, toCanvasY, scaleX, scaleY, pad };
  }, [roomDims, positions, themeKey, selectedItem, localBgOffset, showBeams, showAngles]);

  useEffect(() => { draw(); }, [draw]);

  // Resize observer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => draw());
    observer.observe(canvas.parentElement);
    return () => observer.disconnect();
  }, [draw]);

  /* ── Pointer interaction (drag subject/camera) ──────── */

  function canvasToRoom(e) {
    const canvas = canvasRef.current;
    if (!canvas || !canvas._spatialTransform) return null;
    const rect = canvas.getBoundingClientRect();
    const cx = (e.clientX - rect.left);
    const cy = (e.clientY - rect.top);
    const t = canvas._spatialTransform;
    const roomX = (cx - t.pad) / t.scaleX;
    const roomY = roomDims.lengthFt - (cy - t.pad) / t.scaleY;
    return { x: roomX, y: roomY };
  }

  function hitTest(roomPt) {
    if (!positions) return null;
    const hitFt = HIT_RADIUS / ((canvasRef.current?._spatialTransform?.scaleX) || 10);
    // Check lights first (topmost visual layer)
    if (positions.lights) {
      for (let i = positions.lights.length - 1; i >= 0; i--) {
        const light = positions.lights[i];
        const ld = Math.sqrt(
          Math.pow(roomPt.x - light.x, 2) +
          Math.pow(roomPt.y - light.y, 2)
        );
        if (ld < hitFt) return `light:${i}`;
      }
    }
    // Check subject
    const sd = Math.sqrt(
      Math.pow(roomPt.x - positions.subject.x, 2) +
      Math.pow(roomPt.y - positions.subject.y, 2)
    );
    if (sd < hitFt) return 'subject';
    // Check camera
    if (positions.camera) {
      const cd = Math.sqrt(
        Math.pow(roomPt.x - positions.camera.x, 2) +
        Math.pow(roomPt.y - positions.camera.y, 2)
      );
      if (cd < hitFt) return 'camera';
    }
    // Check background bar — horizontal bar near back wall (y ≈ 0)
    {
      const bgCenterX = roomDims.widthFt / 2;
      const bgHalfW = roomDims.widthFt * 0.3; // 60% of room width, half
      const bgY = 0.5; // approximate room-coord Y of the background bar
      if (
        roomPt.x > bgCenterX - bgHalfW - 1 &&
        roomPt.x < bgCenterX + bgHalfW + 1 &&
        roomPt.y < bgY + hitFt * 0.7
      ) {
        return 'background';
      }
    }
    return null;
  }

  function handlePointerDown(e) {
    const roomPt = canvasToRoom(e);
    if (!roomPt) return;
    const target = hitTest(roomPt);
    // Store start position for click-vs-drag detection
    dragStartRef.current = { x: e.clientX, y: e.clientY, target, moved: false };
    if (target) {
      setDragging(target);
      selectHaptic(); // haptic on grab
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  }

  function handlePointerMove(e) {
    if (!dragging) return;
    const roomPt = canvasToRoom(e);
    if (!roomPt) return;

    // Mark as moved if pointer traveled > 6px (distinguishes tap from drag)
    if (dragStartRef.current && !dragStartRef.current.moved) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > 6) {
        dragStartRef.current.moved = true;
      } else {
        return; // not enough movement yet, don't drag
      }
    }

    // Clamp to room bounds, snap to nearest inch (1/12 ft)
    const snap = (v) => Math.round(v * 12) / 12;
    const x = snap(Math.max(0.5, Math.min(roomDims.widthFt - 0.5, roomPt.x)));
    const y = snap(Math.max(0.5, Math.min(roomDims.lengthFt - 0.5, roomPt.y)));

    if (dragging === 'subject') {
      setLocalSubject({ x, y });
      onSubjectMove?.({ x, y });
    } else if (dragging === 'camera') {
      setLocalCamera({ x, y });
      onCameraMove?.({ x, y });
    } else if (dragging === 'background') {
      setLocalBgOffset({ x: x - roomDims.widthFt / 2 });
    } else if (dragging.startsWith('light:')) {
      const idx = parseInt(dragging.split(':')[1], 10);
      setLocalLightOverrides(prev => ({ ...prev, [idx]: { x, y } }));
      onLightMove?.(idx, { x, y });
    }
  }

  function handlePointerUp() {
    // Click (not drag) → toggle selection
    if (dragStartRef.current && !dragStartRef.current.moved) {
      const target = dragStartRef.current.target;
      if (target) {
        selectHaptic(); // haptic on select
        const newSel = buildSelectionInfo(target);
        // Toggle: if same item is already selected, deselect
        if (selectedItem && selectionKey(selectedItem) === selectionKey(newSel)) {
          setSelectedItem(null);
          onItemSelectRef.current?.(null);
        } else {
          setSelectedItem(newSel);
          onItemSelectRef.current?.(newSel);
        }
      } else {
        // Tapped empty space → deselect
        if (selectedItem) {
          setSelectedItem(null);
          onItemSelectRef.current?.(null);
        }
      }
    }
    dragStartRef.current = null;
    setDragging(null);
  }

  /** Build a selection info object from a hitTest target string. */
  function buildSelectionInfo(target) {
    if (target === 'subject') return { type: 'subject' };
    if (target === 'camera') return { type: 'camera' };
    if (target === 'background') return { type: 'background' };
    if (target?.startsWith('light:')) {
      const idx = parseInt(target.split(':')[1], 10);
      const light = positions?.lights?.[idx];
      return { type: 'light', index: idx, role: light?.role };
    }
    return null;
  }

  /** Stable key for selection comparison. */
  function selectionKey(sel) {
    if (!sel) return '';
    if (sel.type === 'light') return `light:${sel.index}`;
    return sel.type;
  }

  /* ── Guard ──────────────────────────────────────────── */

  if (!roomDims) return null;

  /* ── Legend (matching DiagramCard format) ───────────── */

  const tc = getTheme();
  const lightRoles = positions?.lights?.map(l => l.role) || [];
  const uniqueRoles = [...new Set(lightRoles)];

  function handleCanvasZoom() {
    if (canvasRef.current) {
      setZoomSrc(canvasRef.current.toDataURL('image/png'));
    }
  }

  return (
    <div className="floor-plan">
      <div className="floor-plan__canvas-wrap">
        <canvas
          ref={canvasRef}
          className="floor-plan__canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={{ touchAction: 'none', cursor: dragging ? 'grabbing' : 'default' }}
        />
        {/* Canvas toolbar — beam toggle + zoom */}
        <div className="floor-plan__toolbar">
          <button
            className={`floor-plan__toolbar-btn${showBeams ? '' : ' floor-plan__toolbar-btn--off'}`}
            onClick={() => setShowBeams(b => !b)}
            type="button"
            title={showBeams ? 'Hide beams' : 'Show beams'}
            aria-label={showBeams ? 'Hide beams' : 'Show beams'}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="12,2 2,22 22,22" />
            </svg>
            <span className="floor-plan__toolbar-label">Beams</span>
          </button>
          <button
            className={`floor-plan__toolbar-btn${showAngles ? '' : ' floor-plan__toolbar-btn--off'}`}
            onClick={() => setShowAngles(a => !a)}
            type="button"
            title={showAngles ? 'Hide angles' : 'Show angles'}
            aria-label={showAngles ? 'Hide angles' : 'Show angles'}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="4,20 4,4 20,20" /><path d="M4 15 A11 11 0 0 1 9.5 20" />
            </svg>
            <span className="floor-plan__toolbar-label">Angles</span>
          </button>
          <button
            className="floor-plan__toolbar-btn"
            onClick={handleCanvasZoom}
            type="button"
            title="Zoom floor plan"
            aria-label="Zoom floor plan"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>
            </svg>
            <span className="floor-plan__toolbar-label">Zoom</span>
          </button>
        </div>
      </div>
      {/* Legend — matching DiagramCard structure */}
      <div className="floor-plan__legend">
        {uniqueRoles.map(role => (
          <span key={role} className="floor-plan__legend-item">
            <span className="floor-plan__legend-dot" style={{ background: lightColor(role, tc.lightColors) }} />
            {(role || '').charAt(0).toUpperCase() + (role || '').slice(1).replace(/_/g, ' ')} (drag)
          </span>
        ))}
        <span className="floor-plan__legend-item">
          <span className="floor-plan__legend-dot" style={{ background: tc.camera }} />
          Camera (drag)
        </span>
        <span className="floor-plan__legend-item">
          <span className="floor-plan__legend-dot" style={{ background: tc.subject, border: `1px solid ${tc.subjectBody}` }} />
          Subject (drag)
        </span>
        <span className="floor-plan__legend-item">
          <span className="floor-plan__legend-dot" style={{ background: tc.backdrop, border: `1px solid ${tc.backdropBorder}` }} />
          Backdrop (drag)
        </span>
      </div>
      {/* Zoom overlay */}
      {zoomSrc && <ZoomOverlay src={zoomSrc} alt="Floor plan" onClose={() => setZoomSrc(null)} />}
    </div>
  );
}
