import { useRef, useEffect, useState, useCallback } from 'react';
import {
  computeAbsolutePositions,
  validateConstraints,
  formatRoomGuidance,
  autoPlaceSubject,
} from '../spatial/spatialEngine';

/* ── Theme + constants ────────────────────────────────── */

const LIGHT_COLORS = {
  key: '#f59e0b', fill: '#3b82f6', rim: '#a855f7',
  background: '#10b981', hair: '#a855f7',
};
function lightColor(role) {
  if (LIGHT_COLORS[role]) return LIGHT_COLORS[role];
  if (role?.startsWith('key')) return LIGHT_COLORS.key;
  if (role?.startsWith('fill')) return LIGHT_COLORS.fill;
  if (role?.startsWith('rim') || role?.startsWith('hair')) return LIGHT_COLORS.rim;
  if (role === 'background') return LIGHT_COLORS.background;
  return '#94a3b8';
}

function getTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  return {
    isDark,
    bg:        isDark ? '#1e293b' : '#f8fafc',
    wall:      isDark ? '#475569' : '#94a3b8',
    wallFill:  isDark ? '#0f172a' : '#ffffff',
    grid:      isDark ? 'rgba(71,85,105,0.2)' : 'rgba(100,116,139,0.15)',
    text:      isDark ? '#cbd5e1' : '#334155',
    textDim:   isDark ? '#94a3b8' : '#64748b',
    subject:   isDark ? '#f1f5f9' : '#475569',
    camera:    isDark ? '#64748b' : '#94a3b8',
    distLine:  isDark ? 'rgba(148,163,184,0.3)' : 'rgba(71,85,105,0.3)',
    warnBg:    'rgba(239,68,68,0.15)',
  };
}

const FONT = `"Inter", -apple-system, BlinkMacSystemFont, sans-serif`;
const MARKER_RADIUS = 14;
const HIT_RADIUS = 28; // touch target

/**
 * FloorPlanCanvas — interactive bird's-eye room layout.
 *
 * Props:
 *   roomDims     - { lengthFt, widthFt, ceilingFt }
 *   diagramSpec  - { lights[], camera? } from result.diagram.spec
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

  if (!roomDims) return null;

  const subjectPos = subjectPosOverride || localSubject || autoPlaceSubject(roomDims);
  const cameraDistM = diagramSpec?.camera?.distance_m || 2.0;

  /* ── Compute positions and validate ─────────────────── */

  useEffect(() => {
    if (!roomDims || !diagramSpec) return;

    const pos = computeAbsolutePositions(roomDims, diagramSpec, subjectPos);
    if (cameraPosOverride) pos.camera = cameraPosOverride;
    else if (localCamera) pos.camera = localCamera;

    setPositions(pos);

    const { warnings, errors } = validateConstraints(roomDims, pos);
    onWarnings?.([ ...errors, ...warnings ]);
  }, [roomDims, diagramSpec, subjectPos, cameraPosOverride, localCamera]);

  /* ── Canvas drawing ─────────────────────────────────── */

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !roomDims || !positions) return;

    const tc = getTheme();
    const dpr = window.devicePixelRatio || 1;
    const containerW = canvas.parentElement?.clientWidth || 340;
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
    // Y is inverted: room Y=0 (back wall) maps to top of canvas
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
    ctx.font = `11px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(`${roomDims.widthFt} ft`, pad + drawW / 2, pad - 8);
    ctx.save();
    ctx.translate(pad - 12, pad + drawH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`${roomDims.lengthFt} ft`, 0, 0);
    ctx.restore();
    // Label walls
    ctx.fillStyle = tc.textDim;
    ctx.font = `10px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('BACK WALL', pad + drawW / 2, pad + drawH + 14);
    ctx.fillText('FRONT', pad + drawW / 2, pad - 18);

    // ── Distance lines (subject ↔ lights) ──
    for (const light of positions.lights) {
      const lx = toCanvasX(light.x);
      const ly = toCanvasY(light.y);
      const sx = toCanvasX(positions.subject.x);
      const sy = toCanvasY(positions.subject.y);

      // Distance line
      ctx.strokeStyle = tc.distLine;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(lx, ly);
      ctx.stroke();
      ctx.setLineDash([]);

      // Distance label
      const dist = Math.sqrt(
        Math.pow(light.x - positions.subject.x, 2) +
        Math.pow(light.y - positions.subject.y, 2)
      );
      const midX = (sx + lx) / 2;
      const midY = (sy + ly) / 2;
      ctx.fillStyle = tc.textDim;
      ctx.font = `10px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(`${dist.toFixed(1)}'`, midX, midY - 4);
    }

    // ── Light markers ──
    for (const light of positions.lights) {
      const lx = toCanvasX(light.x);
      const ly = toCanvasY(light.y);
      const color = lightColor(light.role);

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

      // Marker circle
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(lx, ly, MARKER_RADIUS, 0, Math.PI * 2);
      ctx.fill();

      // Role label
      ctx.fillStyle = '#fff';
      ctx.font = `bold 9px ${FONT}`;
      ctx.textAlign = 'center';
      const roleText = (light.role || '').substring(0, 3).toUpperCase();
      ctx.fillText(roleText, lx, ly + 3);

      // Height label below marker
      if (light.heightFt) {
        ctx.fillStyle = tc.textDim;
        ctx.font = `9px ${FONT}`;
        const heightLabel = `${light.heightFt}'h`;
        const ceilWarn = light.heightFt > roomDims.ceilingFt ? ' \u26A0' : '';
        ctx.fillText(heightLabel + ceilWarn, lx, ly + MARKER_RADIUS + 12);
      }
    }

    // ── Subject marker ──
    const sx = toCanvasX(positions.subject.x);
    const sy = toCanvasY(positions.subject.y);
    ctx.fillStyle = tc.subject;
    ctx.beginPath();
    ctx.arc(sx, sy, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = tc.isDark ? '#0f172a' : '#ffffff';
    ctx.font = `bold 8px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('S', sx, sy + 3);
    // Label
    ctx.fillStyle = tc.text;
    ctx.font = `10px ${FONT}`;
    ctx.fillText('Subject', sx, sy - 16);

    // ── Camera marker ──
    if (positions.camera) {
      const cx = toCanvasX(positions.camera.x);
      const cy = toCanvasY(positions.camera.y);
      // Triangle pointing toward subject
      ctx.fillStyle = tc.camera;
      ctx.beginPath();
      ctx.moveTo(cx, cy - 10);
      ctx.lineTo(cx - 8, cy + 6);
      ctx.lineTo(cx + 8, cy + 6);
      ctx.closePath();
      ctx.fill();
      // Label
      ctx.fillStyle = tc.text;
      ctx.font = `10px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('Camera', cx, cy + 22);
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
    const dpr = window.devicePixelRatio || 1;
    const cx = (e.clientX - rect.left);
    const cy = (e.clientY - rect.top);
    const t = canvas._spatialTransform;
    // Invert: canvasX = pad + roomX * scaleX → roomX = (canvasX - pad) / scaleX
    const roomX = (cx - t.pad) / t.scaleX;
    // canvasY = pad + (lengthFt - roomY) * scaleY → roomY = lengthFt - (canvasY - pad) / scaleY
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

  /* ── Legend ──────────────────────────────────────────── */

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
      {/* Legend */}
      <div className="floor-plan__legend">
        <span className="floor-plan__legend-item">
          <span className="floor-plan__legend-dot" style={{ background: getTheme().subject }} /> Subject (drag)
        </span>
        <span className="floor-plan__legend-item">
          <span className="floor-plan__legend-dot floor-plan__legend-dot--tri" style={{ background: getTheme().camera }} /> Camera (drag)
        </span>
        {uniqueRoles.map(role => (
          <span key={role} className="floor-plan__legend-item">
            <span className="floor-plan__legend-dot" style={{ background: lightColor(role) }} />
            {(role || '').charAt(0).toUpperCase() + (role || '').slice(1)}
          </span>
        ))}
      </div>
    </div>
  );
}
