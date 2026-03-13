import { useRef, useEffect, useState, useCallback } from 'react';
import ZoomOverlay from './ZoomOverlay';

const LIGHT_COLORS_DARK = { key: '#f59e0b', fill: '#3b82f6', rim: '#a855f7', background: '#10b981', hair: '#a855f7' };
const LIGHT_COLORS_LIGHT = { key: '#b45309', fill: '#1d4ed8', rim: '#7c3aed', background: '#059669', hair: '#7c3aed' };

/** Theme-aware palette for canvas drawing. */
function getThemeColors() {
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  return {
    isDark,
    lightColors: isDark ? LIGHT_COLORS_DARK : LIGHT_COLORS_LIGHT,
    text:           isDark ? '#cbd5e1' : '#334155',
    textDim:        isDark ? '#94a3b8' : '#64748b',
    textFaint:      isDark ? 'rgba(148,163,184,0.35)' : 'rgba(71,85,105,0.5)',
    subjectHead:    isDark ? '#f1f5f9' : '#e2e8f0',
    subjectBody:    isDark ? '#cbd5e1' : '#475569',
    backdrop:       isDark ? '#334155' : '#cbd5e1',
    backdropBorder: isDark ? '#475569' : '#94a3b8',
    backdropText:   isDark ? '#94a3b8' : '#475569',
    gridLine:       isDark ? 'rgba(71,85,105,0.25)' : 'rgba(100,116,139,0.2)',
    connector:      isDark ? 'rgba(148,163,184,0.3)' : 'rgba(71,85,105,0.35)',
    camera:         isDark ? '#64748b' : '#94a3b8',
    cameraLens:     isDark ? '#94a3b8' : '#64748b',
    markerDot:      isDark ? '#0f172a' : '#ffffff',
    floorLine:      isDark ? 'rgba(71,85,105,0.4)' : 'rgba(100,116,139,0.35)',
    eyeLevel:       isDark ? 'rgba(148,163,184,0.25)' : 'rgba(100,116,139,0.2)',
    eyeLevelText:   isDark ? 'rgba(148,163,184,0.3)' : 'rgba(71,85,105,0.45)',
  };
}

/** Resolve color for any role, including multi-key variants like key_left, key_right, fill_low, etc. */
function lightColor(role, colors) {
  const lc = colors || LIGHT_COLORS_DARK;
  if (lc[role]) return lc[role];
  if (role.startsWith('key')) return lc.key;
  if (role.startsWith('fill')) return lc.fill;
  if (role.startsWith('rim') || role.startsWith('hair')) return lc.rim;
  if (role === 'background') return lc.background;
  return colors ? '#64748b' : '#94a3b8';
}
const SHORT_MOD = {
  softbox: 'Softbox', softbox_rect: 'Rect Softbox', umbrella: 'Umbrella',
  beauty_dish: 'Beauty Dish', grid_spot: 'Grid', grid: 'Grid',
  stripbox: 'Strip', barn_doors: 'Barndoors', snoot: 'Snoot', bare: 'Bare',
};
const FONT_STACK = `"Inter", "SF Pro Display", -apple-system, BlinkMacSystemFont, sans-serif`;

function mToFt(m) { return (m * 3.281).toFixed(0); }

/* ── Top-down view (existing) ────────────────────── */

function drawTopView(canvas, spec) {
  if (!canvas || !spec) return;

  const tc = getThemeColors();
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.parentElement?.clientWidth || 340;
  const H = Math.round(W * 1.05);
  const fs = W >= 600 ? 1.2 : W >= 450 ? 1.1 : 1.0;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const subjectY = H * 0.40;
  const subjectX = W / 2;
  const scale = Math.min(W, H) * 0.16;
  const cam = spec.camera || {};
  const camDist = cam.distance_m || 2;

  // ── background / backdrop rectangle ───────────────
  const bgW = W * 0.52;
  const bgH = 18;
  const bgY = subjectY - scale * 2.2;
  ctx.fillStyle = tc.backdrop;
  ctx.strokeStyle = tc.backdropBorder;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(subjectX - bgW / 2, bgY - bgH / 2, bgW, bgH, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = tc.backdropText;
  ctx.font = `${Math.round(11 * fs)}px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.fillText('Background', subjectX, bgY + 3);

  // ── grid rings (in feet) ─────────────────────────
  ctx.strokeStyle = tc.gridLine;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  for (let r = 1; r <= 3; r++) {
    const ft = Math.round(r * 3.281);
    ctx.beginPath();
    ctx.arc(subjectX, subjectY, r * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = tc.textFaint;
    ctx.font = `${Math.round(10 * fs)}px ${FONT_STACK}`;
    ctx.textAlign = 'left';
    ctx.fillText(`${ft} ft`, subjectX + r * scale + 3, subjectY - 3);
  }
  ctx.setLineDash([]);

  // ── subject ───────────────────────────────────────
  ctx.fillStyle = tc.subjectHead;
  ctx.beginPath();
  ctx.arc(subjectX, subjectY, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = tc.text;
  ctx.font = `bold ${Math.round(12 * fs)}px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.fillText('Subject', subjectX, subjectY + 24);

  // ── camera ────────────────────────────────────────
  const camX = subjectX;
  const camY = subjectY + camDist * scale;
  ctx.fillStyle = tc.camera;
  ctx.beginPath();
  ctx.roundRect(camX - 10, camY - 6, 20, 12, 3);
  ctx.fill();
  ctx.fillStyle = tc.cameraLens;
  ctx.beginPath();
  ctx.arc(camX, camY, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = tc.textDim;
  ctx.font = `${Math.round(11 * fs)}px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.fillText('Camera', camX, camY + 20);

  // ── compute light positions ───────────────────────
  const lights = (spec.lights || []).map(l => {
    const angleRad = (90 - l.angle_deg) * Math.PI / 180;
    const dist = l.distance_m * scale;
    return {
      ...l,
      lx: subjectX + Math.cos(angleRad) * dist,
      ly: subjectY + Math.sin(angleRad) * dist,
    };
  });

  // ── beams (light → target) ───────────────────────
  lights.forEach(({ role, lx, ly }) => {
    const color = lightColor(role, tc.lightColors);
    const isBackground = role === 'background';
    const targetX = isBackground ? subjectX : subjectX;
    const targetY = isBackground ? bgY : subjectY;

    ctx.save();
    ctx.globalAlpha = tc.isDark ? 0.12 : 0.10;
    ctx.fillStyle = color;
    const dx = targetX - lx;
    const dy = targetY - ly;
    const angle = Math.atan2(dy, dx);
    const spread = isBackground ? 0.4 : 0.25;
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(lx + Math.cos(angle - spread) * 200, ly + Math.sin(angle - spread) * 200);
    ctx.lineTo(lx + Math.cos(angle + spread) * 200, ly + Math.sin(angle + spread) * 200);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(targetX, targetY);
    ctx.stroke();
    ctx.globalAlpha = 1;
  });

  // ── light markers ─────────────────────────────────
  lights.forEach(({ role, lx, ly }) => {
    const color = lightColor(role, tc.lightColors);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(lx, ly, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = tc.markerDot;
    ctx.beginPath();
    ctx.arc(lx, ly, 2.5, 0, Math.PI * 2);
    ctx.fill();
  });

  // ── labels (collision-aware) ──────────────────────
  const labelBoxes = [];
  const PAD = 4;

  function addBox(cx, cy, w, h) {
    labelBoxes.push({ x: cx - w / 2 - PAD, y: cy - h / 2 - PAD, w: w + PAD * 2, h: h + PAD * 2 });
  }

  function boxFits(cx, cy, w, h) {
    const r = { x: cx - w / 2 - PAD, y: cy - h / 2 - PAD, w: w + PAD * 2, h: h + PAD * 2 };
    for (const b of labelBoxes) {
      if (r.x < b.x + b.w && r.x + r.w > b.x && r.y < b.y + b.h && r.y + r.h > b.y) {
        return false;
      }
    }
    return true;
  }

  addBox(subjectX, subjectY + 24, 50, 14);
  addBox(camX, camY + 20, 50, 14);
  addBox(subjectX, bgY + 3, 70, 12);

  const sortedLights = [...lights].sort((a, b) => {
    const minGapA = lights.reduce((min, o) => o === a ? min : Math.min(min, Math.abs(a.angle_deg - o.angle_deg)), 360);
    const minGapB = lights.reduce((min, o) => o === b ? min : Math.min(min, Math.abs(b.angle_deg - o.angle_deg)), 360);
    return minGapB - minGapA;
  });

  sortedLights.forEach(({ label, role, modifier, lx, ly, distance_m, angle_deg }) => {
    const color = lightColor(role, tc.lightColors);
    const modText = SHORT_MOD[modifier] || (modifier || '').replace(/_/g, ' ');
    const roleName = label || (role.charAt(0).toUpperCase() + role.slice(1));
    const degText = `${Math.round(Math.abs(angle_deg))}\u00b0`;
    const ftText = `${mToFt(distance_m)} ft`;
    const line2 = `${modText} \u00b7 ${ftText} \u00b7 ${degText}`;

    ctx.font = `bold ${Math.round(12 * fs)}px ${FONT_STACK}`;
    const nameW = ctx.measureText(roleName).width;
    ctx.font = `${Math.round(10 * fs)}px ${FONT_STACK}`;
    const detailW = ctx.measureText(line2).width;
    const boxW = Math.max(nameW, detailW);
    const boxH = Math.round(26 * fs);

    const dx = lx - subjectX;
    const dy = ly - subjectY;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / len;
    const ny = dy / len;
    const px = -ny;
    const py = nx;

    const offsets = [
      { x: nx * 36,  y: ny * 36 },
      { x: nx * 18 + px * (boxW / 2 + 30), y: ny * 18 + py * (boxW / 2 + 30) },
      { x: nx * 18 - px * (boxW / 2 + 30), y: ny * 18 - py * (boxW / 2 + 30) },
      { x: nx * 60,  y: ny * 60 },
      { x: px * (boxW / 2 + 50), y: py * (boxW / 2 + 50) },
      { x: -px * (boxW / 2 + 50), y: -py * (boxW / 2 + 50) },
      { x: 0, y: -42 },
      { x: 0, y: 48 },
      { x: boxW / 2 + 40, y: 0 },
      { x: -(boxW / 2 + 40), y: 0 },
      { x: 55, y: -35 },
      { x: -55, y: -35 },
      { x: 55, y: 35 },
      { x: -55, y: 35 },
    ];

    let labelX = lx + offsets[0].x;
    let labelY = ly + offsets[0].y;

    for (const off of offsets) {
      const tx = lx + off.x;
      const ty = ly + off.y;
      const centerY = ty + 6;
      if (tx - boxW / 2 > 4 && tx + boxW / 2 < W - 4 && ty - 4 > 4 && ty + boxH < H - 4) {
        if (boxFits(tx, centerY, boxW, boxH)) {
          labelX = tx;
          labelY = ty;
          break;
        }
      }
    }

    ctx.strokeStyle = tc.connector;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(labelX, labelY + 6);
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.font = `bold ${Math.round(12 * fs)}px ${FONT_STACK}`;
    ctx.textAlign = 'center';
    ctx.fillText(roleName, labelX, labelY);

    ctx.fillStyle = tc.textDim;
    ctx.font = `${Math.round(10 * fs)}px ${FONT_STACK}`;
    ctx.fillText(line2, labelX, labelY + Math.round(13 * fs));

    addBox(labelX, labelY + 6, boxW, boxH);
  });
}

/* ── Side view ───────────────────────────────────── */

function drawSideView(canvas, spec) {
  if (!canvas || !spec) return;

  const tc = getThemeColors();
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.parentElement?.clientWidth || 340;
  const H = Math.round(W * 0.7);
  const fs = W >= 600 ? 1.2 : W >= 450 ? 1.1 : 1.0;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const marginL = 45;
  const marginR = 15;
  const marginT = 20;
  const marginB = 30;
  const plotW = W - marginL - marginR;
  const plotH = H - marginT - marginB;

  // Find max distance and height for scaling
  const lights = spec.lights || [];
  let maxDist = 2;
  let maxHeight = 2;
  for (const l of lights) {
    if (l.distance_m > maxDist) maxDist = l.distance_m;
    if (l.height_m > maxHeight) maxHeight = l.height_m;
  }
  maxDist = Math.max(maxDist + 0.5, 2.5);
  maxHeight = Math.max(maxHeight + 0.5, 2.5);

  const scaleX = plotW / maxDist;
  const scaleY = plotH / maxHeight;

  // Floor line
  const floorY = marginT + plotH;
  ctx.strokeStyle = tc.floorLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(marginL, floorY);
  ctx.lineTo(W - marginR, floorY);
  ctx.stroke();

  // Floor label
  ctx.fillStyle = tc.textFaint;
  ctx.font = `${Math.round(10 * fs)}px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.fillText('Floor', marginL + plotW / 2, floorY + 14);

  // Height grid lines
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = tc.gridLine;
  const heightStepM = maxHeight <= 3 ? 0.5 : 1;
  for (let h = heightStepM; h <= maxHeight; h += heightStepM) {
    const y = floorY - h * scaleY;
    ctx.beginPath();
    ctx.moveTo(marginL, y);
    ctx.lineTo(W - marginR, y);
    ctx.stroke();
    ctx.fillStyle = tc.textFaint;
    ctx.font = `${Math.round(10 * fs)}px ${FONT_STACK}`;
    ctx.textAlign = 'right';
    ctx.fillText(`${mToFt(h)} ft`, marginL - 6, y + 3);
  }
  ctx.setLineDash([]);

  // Subject figure
  const subjectX = marginL;
  const subjectHeadY = floorY - 1.7 * scaleY;
  const subjectBodyY = floorY - 0.9 * scaleY;

  // Body line
  ctx.strokeStyle = tc.subjectBody;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(subjectX, floorY);
  ctx.lineTo(subjectX, subjectHeadY + 8);
  ctx.stroke();

  // Head
  ctx.fillStyle = tc.subjectHead;
  ctx.beginPath();
  ctx.arc(subjectX, subjectHeadY, 8, 0, Math.PI * 2);
  ctx.fill();

  // Arms
  ctx.strokeStyle = tc.subjectBody;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(subjectX - 10, subjectBodyY + 10);
  ctx.lineTo(subjectX, subjectBodyY);
  ctx.lineTo(subjectX + 10, subjectBodyY + 10);
  ctx.stroke();

  ctx.fillStyle = tc.textDim;
  ctx.font = `bold ${Math.round(11 * fs)}px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.fillText('Subject', subjectX, floorY + 14);

  // Eye level indicator
  const eyeY = floorY - 1.6 * scaleY;
  ctx.strokeStyle = tc.eyeLevel;
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 4]);
  ctx.beginPath();
  ctx.moveTo(subjectX + 12, eyeY);
  ctx.lineTo(W - marginR, eyeY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = tc.eyeLevelText;
  ctx.font = `${Math.round(9 * fs)}px ${FONT_STACK}`;
  ctx.textAlign = 'right';
  ctx.fillText('eye level', W - marginR - 4, eyeY - 4);

  // ── collision-aware label placement ─────────────
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

  // Reserve subject label area
  addBox(subjectX, floorY + 14, 50, 14);

  // Precompute light positions
  const lightPos = lights.map(l => ({
    ...l,
    lx: marginL + l.distance_m * scaleX,
    ly: floorY - (l.height_m || 1.7) * scaleY,
  }));

  // Draw stands, beams, markers for all lights first
  lightPos.forEach(l => {
    const color = lightColor(l.role, tc.lightColors);
    const { lx, ly } = l;

    // Stand
    ctx.strokeStyle = tc.connector;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(lx, floorY);
    ctx.lineTo(lx, ly);
    ctx.stroke();

    // Beam
    const isBg = l.role === 'background';
    const beamTargetX = isBg ? subjectX - 10 : subjectX;
    const beamTargetY = isBg ? floorY - 1.0 * scaleY : subjectHeadY;

    ctx.save();
    ctx.globalAlpha = tc.isDark ? 0.10 : 0.08;
    ctx.fillStyle = color;
    const dx = beamTargetX - lx;
    const dy = beamTargetY - ly;
    const angle = Math.atan2(dy, dx);
    const spread = isBg ? 0.3 : 0.18;
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(lx + Math.cos(angle - spread) * 200, ly + Math.sin(angle - spread) * 200);
    ctx.lineTo(lx + Math.cos(angle + spread) * 200, ly + Math.sin(angle + spread) * 200);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(beamTargetX, beamTargetY);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Marker
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(lx, ly, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = tc.markerDot;
    ctx.beginPath();
    ctx.arc(lx, ly, 2, 0, Math.PI * 2);
    ctx.fill();
  });

  // Labels with collision avoidance
  lightPos.forEach(l => {
    const color = lightColor(l.role, tc.lightColors);
    const { lx, ly } = l;
    const modText = SHORT_MOD[l.modifier] || (l.modifier || '').replace(/_/g, ' ');
    const roleName = l.label || (l.role.charAt(0).toUpperCase() + l.role.slice(1));
    const detailLine = `${modText} \u00b7 ${mToFt(l.height_m || 1.7)} ft high`;

    ctx.font = `bold ${Math.round(11 * fs)}px ${FONT_STACK}`;
    const nameW = ctx.measureText(roleName).width;
    ctx.font = `${Math.round(10 * fs)}px ${FONT_STACK}`;
    const detailW = ctx.measureText(detailLine).width;
    const boxW = Math.max(nameW, detailW);
    const boxH = Math.round(24 * fs);

    // Candidate positions: above, above-left, above-right, below, far above
    const offsets = [
      { x: 0, y: -20 },
      { x: boxW / 2 + 16, y: -14 },
      { x: -(boxW / 2 + 16), y: -14 },
      { x: 0, y: 30 },
      { x: 0, y: -38 },
      { x: boxW / 2 + 30, y: 0 },
      { x: -(boxW / 2 + 30), y: 0 },
      { x: boxW / 2 + 16, y: -30 },
      { x: -(boxW / 2 + 16), y: -30 },
    ];

    let labelX = lx;
    let labelY = ly - 20;

    for (const off of offsets) {
      const tx = lx + off.x;
      const ty = ly + off.y;
      const cy = ty + 5;
      if (tx - boxW / 2 > 4 && tx + boxW / 2 < W - 4 && ty - 4 > 4 && ty + boxH < H - 4) {
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

    ctx.fillStyle = color;
    ctx.font = `bold ${Math.round(11 * fs)}px ${FONT_STACK}`;
    ctx.textAlign = 'center';
    ctx.fillText(roleName, labelX, labelY);

    ctx.fillStyle = tc.textDim;
    ctx.font = `${Math.round(10 * fs)}px ${FONT_STACK}`;
    ctx.fillText(detailLine, labelX, labelY + Math.round(12 * fs));

    addBox(labelX, labelY + 5, boxW, boxH);
  });
}

export default function DiagramCard({ spec, title, inline }) {
  const canvasRef = useRef(null);
  const [view, setView] = useState('top');
  const [zoomSrc, setZoomSrc] = useState(null);

  useEffect(() => {
    const draw = view === 'side' ? drawSideView : drawTopView;
    draw(canvasRef.current, spec);

    function onResize() { draw(canvasRef.current, spec); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [spec, view]);

  const handleCanvasZoom = useCallback(() => {
    if (canvasRef.current) {
      setZoomSrc(canvasRef.current.toDataURL('image/png'));
    }
  }, []);

  if (!spec) return null;

  const lights = spec.lights || [];
  const tc = getThemeColors();

  const inner = (
    <>
      {zoomSrc && <ZoomOverlay src={zoomSrc} alt="Lighting diagram" onClose={() => setZoomSrc(null)} />}
      <div className="diagram-view-toggle" style={inline ? { marginBottom: 4 } : undefined}>
        <button
          className={`diagram-view-btn${view === 'top' ? ' diagram-view-btn--active' : ''}`}
          onClick={() => setView('top')}
          type="button"
        >Top</button>
        <button
          className={`diagram-view-btn${view === 'side' ? ' diagram-view-btn--active' : ''}`}
          onClick={() => setView('side')}
          type="button"
        >Side</button>
      </div>
      <div className="diagram-wrap">
        <canvas ref={canvasRef} className="diagram-canvas" onClick={handleCanvasZoom} />
        <div className="diagram-legend">
          {lights.map((l, i) => (
            <span className="diagram-legend__item" key={`${l.role}-${i}`}>
              <span
                className="diagram-legend__dot"
                style={{ background: lightColor(l.role, tc.lightColors) }}
              />
              {l.label || l.role.replace(/_/g, ' ')}
            </span>
          ))}
          <span className="diagram-legend__item">
            <span className="diagram-legend__dot" style={{ background: tc.camera }} />
            Camera
          </span>
          <span className="diagram-legend__item">
            <span className="diagram-legend__dot" style={{ background: tc.subjectHead, border: `1px solid ${tc.subjectBody}` }} />
            Subject
          </span>
          <span className="diagram-legend__item">
            <span className="diagram-legend__dot" style={{ background: tc.backdrop, border: `1px solid ${tc.backdropBorder}` }} />
            Backdrop
          </span>
        </div>
      </div>
    </>
  );

  if (inline) return inner;

  return (
    <div className="result-card">
      <div className="result-card__header">
        <span className="result-card__icon">{'\u{1F5FA}\uFE0F'}</span>
        <span>{title || 'Lighting Diagram'}</span>
      </div>
      {inner}
    </div>
  );
}
