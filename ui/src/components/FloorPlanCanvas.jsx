import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import {
  computeAbsolutePositions,
  validateConstraints,
  formatRoomGuidance,
  autoPlaceSubject,
} from '../spatial/spatialEngine';

/* ── Theme + constants (matching DiagramCard) ────────── */

const LIGHT_COLORS_DARK = { key: '#f59e0b', fill: '#3b82f6', rim: '#a855f7', background: '#10b981', hair: '#a855f7' };
const LIGHT_COLORS_LIGHT = { key: '#b45309', fill: '#1d4ed8', rim: '#7c3aed', background: '#059669', hair: '#7c3aed' };

/** Theme-aware palette for canvas drawing (matches DiagramCard). */
function getTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  return {
    isDark,
    lightColors: isDark ? LIGHT_COLORS_DARK : LIGHT_COLORS_LIGHT,
    bg:             isDark ? '#1e293b' : '#f8fafc',
    wall:           isDark ? '#475569' : '#94a3b8',
    wallFill:       isDark ? '#0f172a' : '#ffffff',
    grid:           isDark ? 'rgba(71,85,105,0.2)' : 'rgba(100,116,139,0.15)',
    text:           isDark ? '#cbd5e1' : '#334155',
    textDim:        isDark ? '#b0bec5' : '#64748b',
    textFaint:      isDark ? 'rgba(176,190,197,0.55)' : 'rgba(71,85,105,0.5)',
    subject:        isDark ? '#f1f5f9' : '#e2e8f0',
    subjectBody:    isDark ? '#cbd5e1' : '#475569',
    camera:         isDark ? '#64748b' : '#94a3b8',
    cameraLens:     isDark ? '#94a3b8' : '#64748b',
    markerDot:      isDark ? '#0f172a' : '#ffffff',
    connector:      isDark ? 'rgba(148,163,184,0.3)' : 'rgba(71,85,105,0.35)',
    distLine:       isDark ? 'rgba(148,163,184,0.3)' : 'rgba(71,85,105,0.3)',
    backdrop:       isDark ? '#334155' : '#cbd5e1',
    backdropBorder: isDark ? '#475569' : '#94a3b8',
    backdropText:   isDark ? '#b0bec5' : '#475569',
    warnBg:         'rgba(239,68,68,0.15)',
  };
}

/** Resolve color for any role, including multi-key variants. */
function lightColor(role, colors) {
  const lc = colors || LIGHT_COLORS_DARK;
  if (lc[role]) return lc[role];
  if (role?.startsWith('key')) return lc.key;
  if (role?.startsWith('fill')) return lc.fill;
  if (role?.startsWith('rim') || role?.startsWith('hair')) return lc.rim;
  if (role === 'background') return lc.background;
  return colors ? '#64748b' : '#94a3b8';
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
 * FloorPlanCanvas — interactive bird's-eye room layout.
 *
 * Props:
 *   roomDims     - { lengthFt, widthFt, ceilingFt }
 *   diagramSpec  - { lights[], camera? } from result.diagram
 *   subjectPos   - { x, y } or null (auto-placed)
 *   cameraPos    - { x, y } or null (auto-placed)
 *   onSubjectMove - ({ x, y }) => void
 *   onCameraMove  - ({ x, y }) => void
 *   onWarnings    - (warnings[]) => void
 */
export default function FloorPlanCanvas({
  roomDims,
  diagramSpec,
  subjectPos: subjectPosOverride,
  cameraPos: cameraPosOverride,
  onSubjectMove,
  onCameraMove,
  onWarnings,
}) {
  const canvasRef = useRef(null);
  const [dragging, setDragging] = useState(null); // 'subject' | 'camera' | null
  const [positions, setPositions] = useState(null);
  const [localSubject, setLocalSubject] = useState(null);
  const [localCamera, setLocalCamera] = useState(null);

  // Stable ref for onWarnings to avoid triggering re-render cycles
  const onWarningsRef = useRef(onWarnings);
  onWarningsRef.current = onWarnings;

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

    setPositions(pos);

    const { warnings, errors } = validateConstraints(roomDims, pos);
    onWarningsRef.current?.([ ...errors, ...warnings ]);
  }, [roomDims, diagramSpec, subjectPos, cameraPosOverride, localCamera]);

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
    const bgX = pad + drawW / 2;
    const bgY = pad + drawH - Math.round(12 * fs);
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

    const sx = toCanvasX(positions.subject.x);
    const sy = toCanvasY(positions.subject.y);

    // ── Light beams (triangular spread — matching DiagramCard) ──
    for (const light of positions.lights) {
      const lx = toCanvasX(light.x);
      const ly = toCanvasY(light.y);
      const color = lightColor(light.role, tc.lightColors);
      const isBackground = light.role === 'background';
      const targetX = isBackground ? bgX : sx;
      const targetY = isBackground ? bgY : sy;

      // Beam spread triangle
      ctx.save();
      ctx.globalAlpha = tc.isDark ? 0.10 : 0.08;
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
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.moveTo(lx, ly);
      ctx.lineTo(targetX, targetY);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // ── Distance labels on connectors ──
    for (const light of positions.lights) {
      const lx = toCanvasX(light.x);
      const ly = toCanvasY(light.y);
      const dist = Math.sqrt(
        Math.pow(light.x - positions.subject.x, 2) +
        Math.pow(light.y - positions.subject.y, 2)
      );
      const midX = (sx + lx) / 2;
      const midY = (sy + ly) / 2;
      ctx.fillStyle = tc.textDim;
      ctx.font = `${Math.round(10 * fs)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(`${dist.toFixed(1)}'`, midX, midY - 4);
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
    for (const light of positions.lights) {
      const lx = toCanvasX(light.x);
      const ly = toCanvasY(light.y);
      const color = lightColor(light.role, tc.lightColors);

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

      // Marker circle (matching DiagramCard style — colored circle + inner dot)
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(lx, ly, MARKER_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = tc.markerDot;
      ctx.beginPath();
      ctx.arc(lx, ly, 3, 0, Math.PI * 2);
      ctx.fill();
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
      const modText = SHORT_MOD[light.modifier] || (light.modifier || '').replace(/_/g, ' ');
      const roleName = light.label || (light.role?.charAt(0).toUpperCase() + light.role?.slice(1));
      const heightText = light.heightFt ? `${light.heightFt}'h` : '';
      const ceilWarn = light.heightFt > roomDims.ceilingFt ? ' \u26A0' : '';
      const detailParts = [modText, heightText + ceilWarn].filter(Boolean);
      const line2 = detailParts.join(' \u00b7 ');

      ctx.font = `bold ${Math.round(11 * fs)}px ${FONT}`;
      const nameW = ctx.measureText(roleName).width;
      ctx.font = `${Math.round(10 * fs)}px ${FONT}`;
      const detailW = line2 ? ctx.measureText(line2).width : 0;
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

    // ── Camera marker ──
    if (positions.camera) {
      const cx = toCanvasX(positions.camera.x);
      const cy = toCanvasY(positions.camera.y);
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
    }

    // Store transform for hit testing
    canvas._spatialTransform = { toCanvasX, toCanvasY, scaleX, scaleY, pad };
  }, [roomDims, positions]);

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
    return null;
  }

  function handlePointerDown(e) {
    const roomPt = canvasToRoom(e);
    if (!roomPt) return;
    const target = hitTest(roomPt);
    if (target) {
      setDragging(target);
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  }

  function handlePointerMove(e) {
    if (!dragging) return;
    const roomPt = canvasToRoom(e);
    if (!roomPt) return;

    // Clamp to room bounds
    const x = Math.max(0.5, Math.min(roomDims.widthFt - 0.5, roomPt.x));
    const y = Math.max(0.5, Math.min(roomDims.lengthFt - 0.5, roomPt.y));

    if (dragging === 'subject') {
      setLocalSubject({ x, y });
      onSubjectMove?.({ x, y });
    } else if (dragging === 'camera') {
      setLocalCamera({ x, y });
      onCameraMove?.({ x, y });
    }
  }

  function handlePointerUp() {
    setDragging(null);
  }

  /* ── Guard ──────────────────────────────────────────── */

  if (!roomDims) return null;

  /* ── Legend (matching DiagramCard format) ───────────── */

  const tc = getTheme();
  const lightRoles = positions?.lights?.map(l => l.role) || [];
  const uniqueRoles = [...new Set(lightRoles)];

  return (
    <div className="floor-plan">
      <canvas
        ref={canvasRef}
        className="floor-plan__canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{ touchAction: 'none', cursor: dragging ? 'grabbing' : 'default' }}
      />
      {/* Legend — matching DiagramCard structure */}
      <div className="floor-plan__legend">
        {uniqueRoles.map(role => (
          <span key={role} className="floor-plan__legend-item">
            <span className="floor-plan__legend-dot" style={{ background: lightColor(role, tc.lightColors) }} />
            {(role || '').charAt(0).toUpperCase() + (role || '').slice(1).replace(/_/g, ' ')}
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
          Backdrop
        </span>
      </div>
    </div>
  );
}
