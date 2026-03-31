import { useRef, useEffect, useState, useCallback } from 'react';
import ZoomOverlay from './ZoomOverlay';
import CardIcon from '../components/CardIcon';
import WBSpectrum from '../components/WBSpectrum';
import { wbTempClass } from '../utils/units';
import { dragStartHaptic, dropHaptic, selectHaptic } from '../utils/haptics';

/**
 * Compute elevation angle (degrees above horizontal) from height and distance.
 * Key light optimal range: 25–55°. Outside that → warning.
 */
function elevationAngle(height_m, distance_m) {
  const h = height_m || 1.7;
  const d = distance_m || 2;
  return Math.atan2(h - 1.6, d) * 180 / Math.PI; // 1.6m = avg eye level
}
function angleWarning(light) {
  if (!['key', 'fill'].includes(light.role)) return null;
  const elev = elevationAngle(light.height_m, light.distance_m);
  if (elev < 20) return { msg: 'too flat — low shadow definition', level: 'warn' };
  if (elev > 60) return { msg: 'too steep — harsh eye shadows', level: 'warn' };
  return null;
}

const LIGHT_COLORS_DARK  = { key: '#f59e0b', fill: '#3b82f6', rim: '#a855f7', background: '#10b981', hair: '#ec4899' };
const LIGHT_COLORS_LIGHT = { key: '#b45309', fill: '#1d4ed8', rim: '#7c3aed', background: '#059669', hair: '#be185d' };

/** Theme-aware palette for canvas drawing. */
function getThemeColors() {
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  return {
    isDark,
    lightColors: isDark ? LIGHT_COLORS_DARK : LIGHT_COLORS_LIGHT,
    text:           isDark ? '#e2e8f0' : '#1e293b',
    textDim:        isDark ? '#f1f5f9' : '#334155',
    textFaint:      isDark ? 'rgba(226,232,240,0.75)' : 'rgba(30,41,59,0.65)',
    subjectHead:    isDark ? '#f1f5f9' : '#e2e8f0',
    subjectBody:    isDark ? '#cbd5e1' : '#475569',
    backdrop:       isDark ? '#334155' : '#cbd5e1',
    backdropBorder: isDark ? '#475569' : '#94a3b8',
    backdropText:   isDark ? '#b0bec5' : '#475569',
    gridLine:       isDark ? 'rgba(71,85,105,0.25)' : 'rgba(100,116,139,0.2)',
    connector:      isDark ? 'rgba(148,163,184,0.3)' : 'rgba(71,85,105,0.35)',
    camera:         isDark ? '#64748b' : '#94a3b8',
    cameraLens:     isDark ? '#94a3b8' : '#64748b',
    markerDot:      isDark ? '#0f172a' : '#ffffff',
    floorLine:      isDark ? 'rgba(71,85,105,0.4)' : 'rgba(100,116,139,0.35)',
    eyeLevel:       isDark ? 'rgba(148,163,184,0.25)' : 'rgba(100,116,139,0.2)',
    eyeLevelText:   isDark ? 'rgba(176,190,197,0.45)' : 'rgba(71,85,105,0.45)',
  };
}

/** Resolve color for any role, including multi-key variants like key_left, key_right, fill_low, etc. */
function lightColor(role, colors) {
  const lc = colors || LIGHT_COLORS_DARK;
  if (lc[role]) return lc[role];
  if (role.startsWith('key')) return lc.key;
  if (role.startsWith('fill')) return lc.fill;
  if (role.startsWith('rim')) return lc.rim;
  if (role.startsWith('hair')) return lc.hair;
  if (role === 'background') return lc.background;
  return colors ? '#64748b' : '#94a3b8';
}
const SHORT_MOD = {
  softbox: 'Softbox', softbox_rect: 'Rect Softbox', umbrella: 'Umbrella',
  beauty_dish: 'Beauty Dish', grid_spot: 'Grid', grid: 'Grid',
  stripbox: 'Strip', barn_doors: 'Barndoors', snoot: 'Snoot',
  bare: 'Bare', bare_bulb: 'Bare', strobe_bare: 'Bare',
  ring_flash: 'Ring Flash', ring_light: 'Ring Light', macro_ring_flash: 'Macro Ring Flash',
};

/** One-line role descriptions shown in the legend. */
const ROLE_DESC = {
  key:        'primary source — shapes the face',
  fill:       'lifts shadow contrast',
  rim:        'separates subject from background',
  hair:       'adds crown separation',
  background: 'exposes the backdrop',
  accent:     'adds edge or depth detail',
};
const FONT_STACK = `"Inter", "SF Pro Display", -apple-system, BlinkMacSystemFont, sans-serif`;

/** Map named WB presets to Kelvin so diagrams always show the color temp. */
const WB_KELVIN = {
  flash: '5500 K', strobe: '5500 K', tungsten: '3200 K', incandescent: '3200 K',
  daylight: '5600 K', cloudy: '6500 K', shade: '7500 K', fluorescent: '4000 K',
  led: '5000 K', mixed: '~4500 K',
};
function formatWB(wb) {
  if (!wb) return '';
  // Already has Kelvin
  if (/\d/.test(wb)) return wb;
  const k = WB_KELVIN[wb.toLowerCase()];
  return k ? `${wb.charAt(0).toUpperCase() + wb.slice(1)} (${k})` : wb;
}


function mToFt(m) { return (m * 3.281).toFixed(0); }
/** Format a distance label respecting units setting. */
function fmtDist(m, units) {
  if (units === 'metric') {
    return m < 1 ? `${Math.round(m * 100)} cm` : `${m.toFixed(1)} m`;
  }
  return `${mToFt(m)} ft`;
}
/** Measure pixel width of a formatted distance label at given font. */
function distLabelWidth(ctx, m, units) {
  const label = fmtDist(m, units);
  return ctx.measureText(label).width;
}

/* ── Top-down view (existing) ────────────────────── */

function drawTopView(canvas, spec, units, highlightRole, twoHostSetup) {
  if (!canvas || !spec) return;

  const tc = getThemeColors();
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.parentElement?.clientWidth || 340;
  // Cap height to fit card in viewport but give diagram breathing room.
  // Large desktop gets more vertical real estate — smaller vh penalty + taller aspect.
  const vh = window.innerHeight || 800;
  const isMobile = W < 600;
  const isDesktop = W >= 768;
  const isLargeDesktop = W >= 1000;
  const maxCanvasH = vh - (isMobile ? 120 : isLargeDesktop ? 60 : isDesktop ? 100 : 260);
  const idealH = Math.round(W * (isMobile ? 1.15 : isLargeDesktop ? 0.85 : isDesktop ? 0.75 : 0.65));
  const H = Math.max(Math.min(idealH, maxCanvasH), isMobile ? 340 : 260);
  const fs = W >= 900 ? 1.7 : W >= 700 ? 1.5 : W >= 600 ? 1.35 : W >= 450 ? 1.2 : 1.0;
  const badgeFont = `bold ${Math.round(13 * fs)}px ${FONT_STACK}`;
  const badgeBg = tc.isDark ? 'rgba(30,41,59,0.85)' : 'rgba(241,245,249,0.9)';
  const badgeBorder = tc.isDark ? 'rgba(100,116,139,0.5)' : 'rgba(100,116,139,0.4)';
  const badgeText = tc.isDark ? '#e2e8f0' : '#1e293b';
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const subjectY = H * 0.48;
  const subjectX = W / 2;
  const hostSep = W * 0.13;
  const subjectAX = twoHostSetup ? subjectX - hostSep : subjectX;
  const subjectBX = twoHostSetup ? subjectX + hostSep : subjectX;
  const scale = Math.min(W, H) * 0.175;
  const cam = spec.camera || {};
  const camDist = cam.distance_m || 2;

  // ── background / backdrop rectangle ───────────────
  const bgW = W * 0.52;
  const bgH = 18;
  const bgY = Math.max(subjectY - scale * 2.0, 20);
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
  ctx.fillText('BG', subjectX, bgY + 4);

  // ── subject(s) ────────────────────────────────────
  if (twoHostSetup) {
    [{ x: subjectAX, label: 'Host A' }, { x: subjectBX, label: 'Host B' }].forEach(({ x, label }) => {
      ctx.fillStyle = tc.subjectHead;
      ctx.beginPath();
      ctx.arc(x, subjectY, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = tc.textFaint;
      ctx.font = `${Math.round(11 * fs)}px ${FONT_STACK}`;
      ctx.textAlign = 'center';
      ctx.fillText(label, x, subjectY + 24);
    });

    // ── inter-subject distance indicator ─────────────────
    const spacing = spec.subject_spacing_m || 1.2;
    const spacingLabel = fmtDist(spacing, units);
    const lineY = subjectY - 22;
    const aEdge = subjectAX + 12;
    const bEdge = subjectBX - 12;
    ctx.strokeStyle = tc.isDark ? 'rgba(148,163,184,0.45)' : 'rgba(100,116,139,0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(aEdge, lineY);
    ctx.lineTo(bEdge, lineY);
    ctx.stroke();
    ctx.setLineDash([]);
    // arrowheads
    const asz = Math.round(5 * fs);
    [[aEdge, 1], [bEdge, -1]].forEach(([ax, dir]) => {
      ctx.fillStyle = tc.isDark ? 'rgba(148,163,184,0.6)' : 'rgba(100,116,139,0.55)';
      ctx.beginPath();
      ctx.moveTo(ax, lineY);
      ctx.lineTo(ax + dir * asz, lineY - asz / 2);
      ctx.lineTo(ax + dir * asz, lineY + asz / 2);
      ctx.closePath();
      ctx.fill();
    });
    drawDistBadge((subjectAX + subjectBX) / 2, lineY, spacingLabel);
  } else {
    ctx.fillStyle = tc.subjectHead;
    ctx.beginPath();
    ctx.arc(subjectX, subjectY, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = tc.textFaint;
    ctx.font = `${Math.round(11 * fs)}px ${FONT_STACK}`;
    ctx.textAlign = 'center';
    ctx.fillText('Subject', subjectX, subjectY + 24);
  }

  // ── camera ────────────────────────────────────────
  const camX = subjectX;
  const camVisualDist = Math.max(camDist * scale, H * 0.34); // ensure minimum visual separation
  const camY = subjectY + camVisualDist;
  ctx.fillStyle = tc.camera;
  ctx.beginPath();
  ctx.roundRect(camX - 10, camY - 6, 20, 12, 3);
  ctx.fill();
  ctx.fillStyle = tc.cameraLens;
  ctx.beginPath();
  ctx.arc(camX, camY, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = tc.textFaint;
  ctx.font = `${Math.round(11 * fs)}px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.fillText('Camera', camX, camY + 20);

  // ── distance badges (camera↔subject, subject↔background) ──
  // Pill-shaped badges centered on the line between elements
  const bgDistM = (subjectY - bgY) / scale;  // actual distance based on rendered positions

  function drawDistBadge(x, y, label) {
    ctx.font = badgeFont;
    const tw = ctx.measureText(label).width;
    const pw = tw + Math.round(16 * fs);
    const ph = Math.round(22 * fs);
    const rx = x - pw / 2;
    const ry = y - ph / 2;
    ctx.fillStyle = badgeBg;
    ctx.strokeStyle = badgeBorder;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(rx, ry, pw, ph, ph / 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = badgeText;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y);
    ctx.textBaseline = 'alphabetic';
  }

  // Helper: draw arrowhead pointing up or down
  const arrowSize = Math.round(6 * fs);
  function drawArrow(x, y, dir) { // dir: 1 = down, -1 = up
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - arrowSize, y - dir * arrowSize * 1.4);
    ctx.lineTo(x + arrowSize, y - dir * arrowSize * 1.4);
    ctx.closePath();
    ctx.fill();
  }

  // Distance annotations along left margin with lead lines to object edges
  // Compute margin dynamically so metric labels don't spill offscreen
  const distFont = `${Math.round(11 * fs)}px ${FONT_STACK}`;
  ctx.font = `bold ${distFont}`;
  const camLabel = fmtDist(camDist, units);
  const bgLabel = fmtDist(bgDistM, units);
  const maxLabelW = Math.max(ctx.measureText(camLabel).width, ctx.measureText(bgLabel).width);
  const distMarginX = Math.max(18, Math.ceil(maxLabelW / 2) + 6);

  // Camera ↔ Subject distance (left margin)
  const csTopY = subjectY;
  const csBotY = camY;
  const csMidY = (csTopY + csBotY) / 2;
  ctx.strokeStyle = tc.connector;
  ctx.fillStyle = tc.connector;
  ctx.lineWidth = 1;
  // Vertical dashed line with gap for label
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(distMarginX, csTopY);
  ctx.lineTo(distMarginX, csMidY - Math.round(8 * fs));
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(distMarginX, csMidY + Math.round(8 * fs));
  ctx.lineTo(distMarginX, csBotY);
  ctx.stroke();
  // Horizontal lead lines from dimension to objects
  ctx.beginPath();
  ctx.moveTo(distMarginX - 6, csTopY);
  ctx.lineTo(subjectX - 14, csTopY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(distMarginX - 6, csBotY);
  ctx.lineTo(camX - 14, csBotY);
  ctx.stroke();
  ctx.setLineDash([]);
  drawArrow(distMarginX, csTopY, -1);
  drawArrow(distMarginX, csBotY, 1);
  ctx.fillStyle = tc.textDim;
  ctx.font = `bold ${distFont}`;
  ctx.textAlign = 'center';
  ctx.fillText(fmtDist(camDist, units), distMarginX, csMidY + 4);

  // Subject ↔ Background distance (left margin, offset 20px)
  const sbTopY = bgY;
  const sbBotY = subjectY;
  const sbMidY = (sbTopY + sbBotY) / 2;
  ctx.strokeStyle = tc.connector;
  ctx.fillStyle = tc.connector;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(distMarginX + 20, sbTopY);
  ctx.lineTo(distMarginX + 20, sbMidY - Math.round(8 * fs));
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(distMarginX + 20, sbMidY + Math.round(8 * fs));
  ctx.lineTo(distMarginX + 20, sbBotY);
  ctx.stroke();
  // Horizontal lead lines from dimension to objects
  ctx.beginPath();
  ctx.moveTo(distMarginX + 14, sbTopY);
  ctx.lineTo(subjectX - bgW / 2 - 4, sbTopY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(distMarginX + 14, sbBotY);
  ctx.lineTo(subjectX - 14, sbBotY);
  ctx.stroke();
  ctx.setLineDash([]);
  drawArrow(distMarginX + 20, sbTopY, -1);
  drawArrow(distMarginX + 20, sbBotY, 1);
  ctx.fillStyle = tc.textDim;
  ctx.font = `bold ${distFont}`;
  ctx.textAlign = 'center';
  ctx.fillText(fmtDist(bgDistM, units), distMarginX + 20, sbMidY + 4);

  // Keep distLineX/distLineX2 defined for reserved areas (set to margin positions)
  const distLineX = distMarginX;
  const distLineX2 = distMarginX + 20;

  // ── compute light positions (spread co-located lights) ──
  const rawLights = (spec.lights || []).map(l => {
    const angleRad = (90 - l.angle_deg) * Math.PI / 180;
    const dist = l.distance_m * scale;
    return {
      ...l,
      lx: subjectX + Math.cos(angleRad) * dist,
      ly: subjectY + Math.sin(angleRad) * dist,
    };
  });
  // Nudge markers apart when they overlap (e.g. key + fill both at 0°)
  const lights = rawLights.map((l, i) => {
    let nudgeX = 0;
    for (let j = 0; j < i; j++) {
      const dx = Math.abs(l.lx - rawLights[j].lx);
      const dy = Math.abs(l.ly - rawLights[j].ly);
      if (dx < 20 && dy < 20) {
        nudgeX = (i % 2 === 0 ? 1 : -1) * 18 * Math.ceil(i / 2);
      }
    }
    return { ...l, lx: l.lx + nudgeX };
  });

  // ── beams (light → target) ───────────────────────
  lights.forEach(({ role, lx, ly, side }) => {
    const color = lightColor(role, tc.lightColors);
    const isBackground = role === 'background';
    let targetX, targetY;
    if (isBackground) {
      targetX = subjectX; targetY = bgY;
    } else if (twoHostSetup && side === 'left') {
      targetX = subjectBX; targetY = subjectY; // left light crosses to Host B
    } else if (twoHostSetup && side === 'right') {
      targetX = subjectAX; targetY = subjectY; // right light crosses to Host A
    } else {
      targetX = subjectX; targetY = subjectY;
    }

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
    const isHighlighted = highlightRole && (
      role === highlightRole || role.startsWith(highlightRole) || highlightRole.startsWith(role)
    );
    if (isHighlighted) {
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
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(lx, ly, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = tc.markerDot;
    ctx.beginPath();
    ctx.arc(lx, ly, 4, 0, Math.PI * 2);
    ctx.fill();
  });

  // ── labels (collision-aware) ──────────────────────
  const labelBoxes = [];
  const PAD = 6;

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

  // Reserve ICON areas (not just labels) so light labels don't overlap them
  // Subject circle(s) + label(s)
  if (twoHostSetup) {
    addBox(subjectAX, subjectY, 28, 28);
    addBox(subjectAX, subjectY + 24, 60, 20);
    addBox(subjectBX, subjectY, 28, 28);
    addBox(subjectBX, subjectY + 24, 60, 20);
    addBox((subjectAX + subjectBX) / 2, subjectY - 22, subjectBX - subjectAX, 26); // spacing badge
  } else {
    addBox(subjectX, subjectY, 28, 28);              // subject circle
    addBox(subjectX, subjectY + 24, 60, 20);         // "Subject" label
  }
  // Camera icon + label
  addBox(camX, camY, 28, 18);                        // camera rectangle
  addBox(camX, camY + 20, 60, 20);                   // "Camera" label
  // Backdrop rectangle + label
  addBox(subjectX, bgY, bgW + 8, bgH + 8);           // backdrop bar
  // Reserve distance badge corridors (offset from center)
  const badgeReserveW = Math.round(90 * fs);
  const csBadgeReserveH = Math.abs(camY - subjectY) + 20;
  addBox(distLineX, (subjectY + camY) / 2, badgeReserveW, csBadgeReserveH);
  const sbBadgeReserveH = Math.abs(subjectY - bgY) + 20;
  addBox(distLineX2, (bgY + subjectY) / 2, badgeReserveW, sbBadgeReserveH);
  // Reserve light marker circles
  lights.forEach(({ lx, ly }) => {
    addBox(lx, ly, 30, 30);
  });

  const sortedLights = [...lights].sort((a, b) => {
    const minGapA = lights.reduce((min, o) => o === a ? min : Math.min(min, Math.abs(a.angle_deg - o.angle_deg)), 360);
    const minGapB = lights.reduce((min, o) => o === b ? min : Math.min(min, Math.abs(b.angle_deg - o.angle_deg)), 360);
    return minGapB - minGapA;
  });

  // ── Compact on-canvas labels: role name only ──────
  sortedLights.forEach(({ label, role, lx, ly }) => {
    const color = lightColor(role, tc.lightColors);
    const roleName = label || (role.charAt(0).toUpperCase() + role.slice(1));

    ctx.font = `bold ${Math.round(12 * fs)}px ${FONT_STACK}`;
    const nameW = ctx.measureText(roleName).width;
    const boxW = nameW + 4;
    const boxH = Math.round(16 * fs);

    const dx = lx - subjectX;
    const dy = ly - subjectY;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / len;
    const ny = dy / len;
    const hw = nameW / 2 + 16;

    const offsets = [
      { x: nx * 28,  y: ny * 28 },
      { x: hw, y: -16 },
      { x: -hw, y: -16 },
      { x: hw, y: 16 },
      { x: -hw, y: 16 },
      { x: 0, y: -28 },
      { x: 0, y: 32 },
      { x: nx * 18 + 40, y: ny * 18 },
      { x: nx * 18 - 40, y: ny * 18 },
      { x: 50, y: -24 },
      { x: -50, y: -24 },
      { x: 50, y: 24 },
      { x: -50, y: 24 },
      { x: nx * 50,  y: ny * 50 },
    ];

    let labelX = lx + offsets[0].x;
    let labelY = ly + offsets[0].y;

    for (const off of offsets) {
      const tx = lx + off.x;
      const ty = ly + off.y;
      if (tx - boxW / 2 > 4 && tx + boxW / 2 < W - 4 && ty - boxH / 2 > 4 && ty + boxH / 2 < H - 4) {
        if (boxFits(tx, ty, boxW, boxH)) {
          labelX = tx;
          labelY = ty;
          break;
        }
      }
    }

    ctx.fillStyle = color;
    ctx.font = `bold ${Math.round(12 * fs)}px ${FONT_STACK}`;
    ctx.textAlign = 'center';
    ctx.fillText(roleName, labelX, labelY);

    addBox(labelX, labelY, boxW, boxH);
  });
}

/* ── Floor Plan view (bird's-eye room layout) ───── */

function drawFloorPlan(canvas, spec, units, spaceCheck, roomDimensions, highlightRole) {
  if (!canvas || !spec) return;

  const tc = getThemeColors();
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.parentElement?.clientWidth || 340;
  const isMobile = W < 600;
  const isDesktop = W >= 768;
  const isLargeDesktop = W >= 1000;
  const vh = window.innerHeight || 800;
  const maxCanvasH = vh - (isMobile ? 120 : isLargeDesktop ? 60 : isDesktop ? 100 : 280);
  const idealH = Math.round(W * (isMobile ? 1.25 : isLargeDesktop ? 0.9 : isDesktop ? 0.8 : 0.7));
  const H = Math.max(Math.min(idealH, maxCanvasH), isMobile ? 380 : 280);
  const fs = W >= 900 ? 1.7 : W >= 700 ? 1.5 : W >= 600 ? 1.35 : W >= 450 ? 1.2 : 1.0;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  // Room dimensions in feet (from spaceCheck minimums or user room)
  const roomWFt = roomDimensions?.widthFt ? parseFloat(roomDimensions.widthFt) : (spaceCheck?.minWidthFt ? parseFloat(spaceCheck.minWidthFt) : 14);
  const roomDFt = roomDimensions?.lengthFt ? parseFloat(roomDimensions.lengthFt) : (spaceCheck?.minDepthFt ? parseFloat(spaceCheck.minDepthFt) : 16);
  const roomWM = roomWFt * 0.3048;
  const roomDM = roomDFt * 0.3048;

  // Margins for labels
  const margin = { top: 36, bottom: 36, left: 36, right: 36 };
  const drawW = W - margin.left - margin.right;
  const drawH = H - margin.top - margin.bottom;

  // Scale to fit room in draw area
  const scaleX = drawW / roomWM;
  const scaleY = drawH / roomDM;
  const roomScale = Math.min(scaleX, scaleY) * 0.85;

  const roomPxW = roomWM * roomScale;
  const roomPxH = roomDM * roomScale;
  const roomX = margin.left + (drawW - roomPxW) / 2;
  const roomY = margin.top + (drawH - roomPxH) / 2;

  // Convert scene position (meters from center) to pixel coordinates
  // In room coords: subject is centered, camera is toward bottom, BG at top
  const cam = spec.camera || {};
  const camDist = cam.distance_m || 2;
  // Subject at center of room
  const subjectSceneX = 0;
  const subjectSceneZ = 0; // depth axis: negative = toward BG, positive = toward camera
  function sceneToPixel(sx, sz) {
    // sx: left-right (negative = left), sz: front-back (negative = toward BG wall)
    const px = roomX + roomPxW / 2 + sx * roomScale;
    const py = roomY + roomPxH / 2 + sz * roomScale;
    return [px, py];
  }

  // ── Room outline ──
  const hasWarnings = spaceCheck?.warnings?.length > 0;
  const wFail = roomDimensions && spaceCheck?.minWidthFt && parseFloat(roomDimensions.widthFt) < parseFloat(spaceCheck.minWidthFt);
  const dFail = roomDimensions && spaceCheck?.minDepthFt && parseFloat(roomDimensions.lengthFt) < parseFloat(spaceCheck.minDepthFt);

  ctx.strokeStyle = hasWarnings ? 'rgba(234,179,8,0.5)' : tc.backdropBorder;
  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  ctx.strokeRect(roomX, roomY, roomPxW, roomPxH);

  // Room fill
  ctx.fillStyle = tc.isDark ? 'rgba(30,41,59,0.3)' : 'rgba(241,245,249,0.5)';
  ctx.fillRect(roomX, roomY, roomPxW, roomPxH);

  // ── Dimension labels on edges ──
  const dimFont = `${Math.round(11 * fs)}px ${FONT_STACK}`;
  ctx.font = dimFont;
  ctx.textAlign = 'center';

  // Width (top edge)
  const widthLabel = (units === 'metric' ? `${roomWM.toFixed(1)} m` : `${roomWFt.toFixed(0)} ft`) + ' wide';
  ctx.fillStyle = wFail ? '#ef4444' : tc.textDim;
  ctx.fillText(widthLabel, roomX + roomPxW / 2, roomY - 10);

  // Depth (right edge, rotated)
  const depthLabel = (units === 'metric' ? `${roomDM.toFixed(1)} m` : `${roomDFt.toFixed(0)} ft`) + ' deep';
  ctx.save();
  ctx.translate(roomX + roomPxW + 14, roomY + roomPxH / 2);
  ctx.rotate(Math.PI / 2);
  ctx.fillStyle = dFail ? '#ef4444' : tc.textDim;
  ctx.textAlign = 'center';
  ctx.fillText(depthLabel, 0, 0);
  ctx.restore();

  // ── "DOOR" indicator at bottom center ──
  const doorW = Math.min(40 * fs, roomPxW * 0.2);
  const doorX = roomX + roomPxW / 2 - doorW / 2;
  ctx.fillStyle = tc.isDark ? 'rgba(100,116,139,0.6)' : 'rgba(148,163,184,0.6)';
  ctx.fillRect(doorX, roomY + roomPxH - 1, doorW, 3);

  // ── Background wall (top) ──
  const bgWallW = roomPxW * 0.6;
  const bgWallX = roomX + (roomPxW - bgWallW) / 2;
  const bgWallY = roomY + roomPxH * 0.08;
  ctx.fillStyle = tc.backdrop;
  ctx.strokeStyle = tc.backdropBorder;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(bgWallX, bgWallY, bgWallW, 14, 3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = tc.backdropText;
  ctx.font = `${Math.round(10 * fs)}px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.fillText('Backdrop', bgWallX + bgWallW / 2, bgWallY + 11);

  // ── Subject ──
  const [sx, sy] = sceneToPixel(0, -roomDM * 0.08); // slightly toward BG
  ctx.fillStyle = tc.subjectHead;
  ctx.beginPath();
  ctx.arc(sx, sy, 9 * Math.min(fs, 1.3), 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = tc.textFaint;
  ctx.font = `${Math.round(10 * fs)}px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.fillText('Subject', sx, sy + 20);

  // ── Camera ──
  const [cx, cy] = sceneToPixel(0, camDist * 0.8);
  ctx.fillStyle = tc.camera;
  ctx.beginPath();
  ctx.roundRect(cx - 9, cy - 5, 18, 10, 3);
  ctx.fill();
  ctx.fillStyle = tc.cameraLens;
  ctx.beginPath();
  ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = tc.textFaint;
  ctx.font = `${Math.round(10 * fs)}px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.fillText('Camera', cx, cy + 18);

  // ── Lights ──
  const lights = (spec.lights || []).map(l => {
    const angleRad = (90 - l.angle_deg) * Math.PI / 180;
    const dist = l.distance_m;
    const lsx = Math.cos(angleRad) * dist;  // scene x
    const lsz = Math.sin(angleRad) * dist;  // scene z (positive = toward camera)
    const [lx, ly] = sceneToPixel(lsx, lsz - roomDM * 0.08);
    return { ...l, lx, ly };
  });

  // Beams
  lights.forEach(({ role, lx, ly }) => {
    const color = lightColor(role, tc.lightColors);
    const isBackground = role === 'background';
    const targetX = isBackground ? bgWallX + bgWallW / 2 : sx;
    const targetY = isBackground ? bgWallY : sy;

    ctx.save();
    ctx.globalAlpha = tc.isDark ? 0.10 : 0.08;
    ctx.fillStyle = color;
    const dx = targetX - lx;
    const dy = targetY - ly;
    const angle = Math.atan2(dy, dx);
    const spread = isBackground ? 0.35 : 0.2;
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(lx + Math.cos(angle - spread) * 180, ly + Math.sin(angle - spread) * 180);
    ctx.lineTo(lx + Math.cos(angle + spread) * 180, ly + Math.sin(angle + spread) * 180);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(targetX, targetY);
    ctx.stroke();
    ctx.globalAlpha = 1;
  });

  // Light markers
  lights.forEach(({ role, lx, ly }) => {
    const color = lightColor(role, tc.lightColors);
    const isHighlighted = highlightRole && (
      role === highlightRole || role.startsWith(highlightRole) || highlightRole.startsWith(role)
    );
    if (isHighlighted) {
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 16;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.arc(lx, ly, 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(lx, ly, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = tc.markerDot;
    ctx.beginPath();
    ctx.arc(lx, ly, 3.5, 0, Math.PI * 2);
    ctx.fill();
  });

  // Light labels
  lights.forEach(({ role, label, lx, ly }) => {
    const color = lightColor(role, tc.lightColors);
    const roleName = label || role.replace(/_/g, ' ');
    ctx.fillStyle = color;
    ctx.font = `bold ${Math.round(11 * fs)}px ${FONT_STACK}`;
    ctx.textAlign = 'center';
    ctx.fillText(roleName, lx, ly - 14);
  });

  // ── Min. requirement outline (dashed) if user room is bigger ──
  if (roomDimensions && spaceCheck?.minWidthFt && spaceCheck?.minDepthFt) {
    const minWM = parseFloat(spaceCheck.minWidthFt) * 0.3048;
    const minDM = parseFloat(spaceCheck.minDepthFt) * 0.3048;
    const minPxW = minWM * roomScale;
    const minPxH = minDM * roomScale;
    if (minPxW < roomPxW - 4 || minPxH < roomPxH - 4) {
      const minX = roomX + (roomPxW - minPxW) / 2;
      const minY = roomY + (roomPxH - minPxH) / 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = tc.isDark ? 'rgba(148,163,184,0.3)' : 'rgba(100,116,139,0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(minX, minY, minPxW, minPxH);
      ctx.setLineDash([]);
      ctx.fillStyle = tc.textFaint;
      ctx.font = `${Math.round(9 * fs)}px ${FONT_STACK}`;
      ctx.textAlign = 'left';
      ctx.fillText('min required', minX + 4, minY - 4);
    }
  }
}

/* ── Side view ───────────────────────────────────── */
/*
 * Depth axis (horizontal): background ← subject → camera
 * Height axis (vertical): floor → ceiling
 * Each light's horizontal position uses its depth component:
 *   depthM = distance_m × cos(angle_deg)
 *   positive = toward camera, negative = behind subject
 */

function drawSideView(canvas, spec, units, highlightRole) {
  if (!canvas || !spec) return;

  const tc = getThemeColors();
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.parentElement?.clientWidth || 340;
  const isMobile = W < 600;
  const isDesktop = W >= 768;
  const isLargeDesktop = W >= 1000;
  const vh = window.innerHeight || 800;
  const maxCanvasH = vh - (isMobile ? 120 : isLargeDesktop ? 60 : isDesktop ? 100 : 320);
  const idealH = Math.round(W * (isMobile ? 0.95 : isLargeDesktop ? 0.7 : isDesktop ? 0.65 : 0.55));
  const H = Math.max(Math.min(idealH, maxCanvasH), isMobile ? 320 : 220);
  const fs = W >= 900 ? 1.7 : W >= 700 ? 1.5 : W >= 600 ? 1.35 : W >= 450 ? 1.2 : 1.05;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  // Compute left margin dynamically for metric height labels (e.g. "2.5 m")
  const sideDistFont = `${Math.round(12 * fs)}px ${FONT_STACK}`;
  ctx.font = sideDistFont;
  const sampleHeightLabel = fmtDist(2.5, units);
  const heightLabelW = ctx.measureText(sampleHeightLabel).width;
  const marginL = Math.max(50, Math.ceil(heightLabelW) + 14);
  const marginR = 50;
  const marginT = 20;
  // Extra bottom margin for distance annotations — metric labels are wider
  const marginB = Math.round((units === 'metric' ? 56 : 50) * fs);
  const plotW = W - marginL - marginR;
  const plotH = H - marginT - marginB;

  const lights = spec.lights || [];
  const cam = spec.camera || {};
  const camDist = cam.distance_m || 2;
  const bgDistM = 2.2;

  // Compute depth for each light: positive = toward camera, negative = behind subject
  const lightsWithDepth = lights.map(l => {
    const angleRad = l.angle_deg * Math.PI / 180;
    // angle_deg 0 = toward camera, 90 = right, 180 = behind
    const depthM = l.distance_m * Math.cos(angleRad);
    return { ...l, depthM };
  });

  // Determine depth axis range: behind (negative) ← subject (0) → in front (positive)
  let maxBehind = bgDistM;  // backdrop is behind subject
  let maxFront = camDist;   // camera is in front
  for (const l of lightsWithDepth) {
    if (l.depthM < 0) maxBehind = Math.max(maxBehind, Math.abs(l.depthM) + 0.3);
    else maxFront = Math.max(maxFront, l.depthM + 0.3);
  }
  maxBehind = Math.max(maxBehind + 0.3, 1.8);
  maxFront = Math.max(maxFront + 0.3, 2.3);
  const totalDepth = maxBehind + maxFront;

  // Height axis
  let maxHeight = 2;
  for (const l of lights) {
    if (l.height_m > maxHeight) maxHeight = l.height_m;
  }
  maxHeight = Math.max(maxHeight + 0.5, 2.5);

  // Scales: depth maps to horizontal, height maps to vertical
  const scaleDepth = plotW / totalDepth;
  const scaleY = plotH / maxHeight;

  // Subject X is at the split point between behind and front
  const subjectX = marginL + maxBehind * scaleDepth;
  const floorY = marginT + plotH;

  // Helper: depth in meters to canvas X (negative = left of subject, positive = right)
  function depthToX(depthM) { return subjectX + depthM * scaleDepth; }

  // ── Floor line ──────────────────────────────────
  ctx.strokeStyle = tc.floorLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(marginL, floorY);
  ctx.lineTo(W - marginR, floorY);
  ctx.stroke();

  // ── Height grid lines ──────────────────────────
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
    ctx.font = `${Math.round(12 * fs)}px ${FONT_STACK}`;
    ctx.textAlign = 'right';
    ctx.fillText(fmtDist(h, units), marginL - 6, y + 4);
  }
  ctx.setLineDash([]);

  // ── Background (behind subject, left side) ─────
  const bgX = depthToX(-bgDistM);
  const bgRectW = 14;
  const bgRectH = Math.min(plotH * 0.7, 2.5 * scaleY);
  const bgRectTop = floorY - bgRectH;
  ctx.fillStyle = tc.backdrop;
  ctx.strokeStyle = tc.backdropBorder;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(bgX - bgRectW / 2, bgRectTop, bgRectW, bgRectH, 3);
  ctx.fill();
  ctx.stroke();
  ctx.save();
  ctx.translate(bgX, bgRectTop + bgRectH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = tc.backdropText;
  ctx.font = `${Math.round(12 * fs)}px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.fillText('Background', 0, 4);
  ctx.restore();

  // ── Subject figure ──────────────────────────────
  const subjectHeadY = floorY - 1.7 * scaleY;
  const subjectBodyY = floorY - 0.9 * scaleY;

  ctx.strokeStyle = tc.subjectBody;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(subjectX, floorY);
  ctx.lineTo(subjectX, subjectHeadY + 8);
  ctx.stroke();

  ctx.fillStyle = tc.subjectHead;
  ctx.beginPath();
  ctx.arc(subjectX, subjectHeadY, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = tc.subjectBody;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(subjectX - 10, subjectBodyY + 10);
  ctx.lineTo(subjectX, subjectBodyY);
  ctx.lineTo(subjectX + 10, subjectBodyY + 10);
  ctx.stroke();

  ctx.fillStyle = tc.textDim;
  ctx.font = `bold ${Math.round(15 * fs)}px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.fillText('Subject', subjectX, floorY + 18);

  // ── Camera (in front of subject, right side) ───
  const camX = depthToX(camDist);
  const camFloorY = floorY;
  ctx.fillStyle = tc.camera;
  ctx.beginPath();
  ctx.roundRect(camX - 10, camFloorY - 1.3 * scaleY - 6, 20, 12, 3);
  ctx.fill();
  ctx.fillStyle = tc.cameraLens;
  ctx.beginPath();
  ctx.arc(camX, camFloorY - 1.3 * scaleY, 4, 0, Math.PI * 2);
  ctx.fill();
  // Camera stand
  ctx.strokeStyle = tc.connector;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(camX, camFloorY);
  ctx.lineTo(camX, camFloorY - 1.3 * scaleY + 6);
  ctx.stroke();
  ctx.fillStyle = tc.textDim;
  ctx.font = `${Math.round(14 * fs)}px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.fillText('Camera', camX, floorY + 18);

  // ── Eye level indicator ─────────────────────────
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
  ctx.font = `${Math.round(11 * fs)}px ${FONT_STACK}`;
  ctx.textAlign = 'right';
  ctx.fillText('eye level', W - marginR - 4, eyeY - 5);

  // ── Distance annotations with arrows ─────────────
  const annY = floorY + Math.round(28 * fs);
  const annFont = `${Math.round(12 * fs)}px ${FONT_STACK}`;
  const sideArrowW = Math.round(5 * fs);

  // Horizontal arrowhead helper (dir: 1 = right, -1 = left)
  function drawHArrow(x, y, dir) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - dir * sideArrowW * 1.4, y - sideArrowW);
    ctx.lineTo(x - dir * sideArrowW * 1.4, y + sideArrowW);
    ctx.closePath();
    ctx.fill();
  }

  // Subject → Camera distance
  const scMidX = (subjectX + camX) / 2;
  ctx.strokeStyle = tc.connector;
  ctx.fillStyle = tc.connector;
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 3]);
  // Vertical lead lines from elements down to annotation line
  ctx.beginPath(); ctx.moveTo(subjectX, floorY + 4); ctx.lineTo(subjectX, annY + Math.round(8 * fs)); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(camX, floorY + 4); ctx.lineTo(camX, annY + Math.round(8 * fs)); ctx.stroke();
  ctx.setLineDash([]);
  // Horizontal dashed line
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(subjectX + Math.round(8 * fs), annY);
  ctx.lineTo(camX - Math.round(8 * fs), annY);
  ctx.stroke();
  ctx.setLineDash([]);
  // Arrowheads
  drawHArrow(subjectX + 2, annY, -1); // points left toward subject
  drawHArrow(camX - 2, annY, 1);      // points right toward camera
  ctx.fillStyle = tc.textDim;
  ctx.font = `bold ${annFont}`;
  ctx.textAlign = 'center';
  ctx.fillText(fmtDist(camDist, units), scMidX, annY - Math.round(6 * fs));

  // Subject → Background distance
  const sbMidX = (bgX + subjectX) / 2;
  ctx.strokeStyle = tc.connector;
  ctx.fillStyle = tc.connector;
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 3]);
  // Vertical lead line from bg element down
  ctx.beginPath(); ctx.moveTo(bgX, floorY + 4); ctx.lineTo(bgX, annY + Math.round(8 * fs)); ctx.stroke();
  ctx.setLineDash([]);
  // Horizontal dashed line
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(bgX + Math.round(8 * fs), annY);
  ctx.lineTo(subjectX - Math.round(8 * fs), annY);
  ctx.stroke();
  ctx.setLineDash([]);
  // Arrowheads
  drawHArrow(bgX + 2, annY, -1);      // points left toward bg
  drawHArrow(subjectX - 2, annY, 1);   // points right toward subject
  ctx.fillStyle = tc.textDim;
  ctx.font = `bold ${annFont}`;
  ctx.textAlign = 'center';
  ctx.fillText(fmtDist(bgDistM, units), sbMidX, annY - Math.round(6 * fs));

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

  // Reserve ICON areas + labels so light labels don't overlap them
  // Subject figure (head + body stick figure spans from floor to head)
  addBox(subjectX, (subjectHeadY + floorY) / 2, 30, floorY - subjectHeadY + 16);
  addBox(subjectX, floorY + 18, 70, 22);              // "Subject" label
  // Camera icon + stand + label
  const camIconY = camFloorY - 1.3 * scaleY;
  addBox(camX, camIconY, 28, 20);                     // camera rectangle
  addBox(camX, (camIconY + camFloorY) / 2, 8, camFloorY - camIconY); // stand
  addBox(camX, floorY + 18, 70, 22);                  // "Camera" label
  // Backdrop rectangle
  addBox(bgX, bgRectTop + bgRectH / 2, bgRectW + 20, bgRectH + 10);
  // Distance annotation area along bottom
  addBox((subjectX + camX) / 2, annY, camX - subjectX + 20, Math.round(24 * fs));
  addBox((bgX + subjectX) / 2, annY, subjectX - bgX + 20, Math.round(24 * fs));
  // Eye level label
  addBox(W - marginR - 30, eyeY - 5, 60, 16);

  // Precompute light positions using depth
  const lightPos = lightsWithDepth.map(l => ({
    ...l,
    lx: depthToX(l.depthM),
    ly: floorY - (l.height_m || 1.7) * scaleY,
  }));

  // Draw stands, beams, markers for all lights
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

    // Beam toward subject (or background)
    const isBg = l.role === 'background';
    const beamTargetX = isBg ? bgX : subjectX;
    const beamTargetY = isBg ? bgRectTop + bgRectH / 2 : subjectHeadY;

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
    const isHighlighted = highlightRole && (
      l.role === highlightRole || l.role.startsWith(highlightRole) || highlightRole.startsWith(l.role)
    );
    if (isHighlighted) {
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 16;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.arc(lx, ly, 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(lx, ly, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = tc.markerDot;
    ctx.beginPath();
    ctx.arc(lx, ly, 2.5, 0, Math.PI * 2);
    ctx.fill();
  });

  // Reserve light marker circles
  lightPos.forEach(l => {
    addBox(l.lx, l.ly, 20, 20);
  });

  // ── Compact on-canvas labels: role name only ──────
  lightPos.forEach(l => {
    const color = lightColor(l.role, tc.lightColors);
    const { lx, ly } = l;
    const roleName = l.label || (l.role.charAt(0).toUpperCase() + l.role.slice(1));

    ctx.font = `bold ${Math.round(13 * fs)}px ${FONT_STACK}`;
    const nameW = ctx.measureText(roleName).width;
    const boxW = nameW;
    const boxH = Math.round(16 * fs);

    const offsets = [
      { x: 0, y: -18 },
      { x: nameW / 2 + 16, y: -10 },
      { x: -(nameW / 2 + 16), y: -10 },
      { x: 0, y: 24 },
      { x: nameW / 2 + 24, y: 0 },
      { x: -(nameW / 2 + 24), y: 0 },
      { x: 28, y: -18 },
      { x: -28, y: -18 },
      { x: 28, y: 16 },
      { x: -28, y: 16 },
    ];

    let labelX = lx;
    let labelY = ly - 18;

    for (const off of offsets) {
      const tx = lx + off.x;
      const ty = ly + off.y;
      if (tx - boxW / 2 > 4 && tx + boxW / 2 < W - 4 && ty - boxH / 2 > 4 && ty + boxH / 2 < H - 4) {
        if (boxFits(tx, ty, boxW, boxH)) {
          labelX = tx;
          labelY = ty;
          break;
        }
      }
    }

    ctx.fillStyle = color;
    ctx.font = `bold ${Math.round(13 * fs)}px ${FONT_STACK}`;
    ctx.textAlign = 'center';
    ctx.fillText(roleName, labelX, labelY);

    addBox(labelX, labelY, boxW, boxH);
  });
}

import useSettings from '../hooks/useSettings';
import { formatRoomDim } from '../utils/units';
import { formatEnginePowerHint } from '../transform';

function handlePrint(canvasEl, spec, title, view) {
  if (!canvasEl) return;
  const imgSrc = canvasEl.toDataURL('image/png');
  const lights = spec?.lights || [];
  const tc = getThemeColors();

  const legendRows = lights.map(l => {
    const color = lightColor(l.role, LIGHT_COLORS_DARK); // always use dark palette for print
    const roleName = (l.label || l.role).replace(/_/g, ' ');
    const modText = SHORT_MOD[l.modifier] || (l.modifier || '').replace(/_/g, ' ');
    const detail = [modText, l.distance_m ? `${(l.distance_m * 3.281).toFixed(0)} ft` : '', `${Math.round(Math.abs(l.angle_deg || 0))}\u00b0`, `${((l.height_m || 1.7) * 3.281).toFixed(0)} ft high`].filter(Boolean).join(' \u00b7 ');
    return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;font-size:13px;">
      <span style="width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0;display:inline-block;"></span>
      <span><strong style="text-transform:capitalize;">${roleName}</strong>${detail ? ' — ' + detail : ''}</span>
    </div>`;
  }).join('');

  const patternLabel = spec?.pattern ? spec.pattern.charAt(0).toUpperCase() + spec.pattern.slice(1).replace(/[-_]/g, ' ') : '';
  const heading = title || 'Lighting Diagram';

  const win = window.open('', '_blank', 'width=800,height=700');
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><title>${heading}</title>
    <style>
      body { margin: 0; padding: 24px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #fff; color: #1e293b; }
      h1 { font-size: 16px; margin: 0 0 4px; }
      p { font-size: 12px; color: #64748b; margin: 0 0 14px; }
      img { max-width: 100%; border: 1px solid #e2e8f0; border-radius: 6px; display: block; margin-bottom: 16px; }
      .legend { border-top: 1px solid #e2e8f0; padding-top: 12px; }
      @media print { @page { margin: 12mm; } }
    </style>
  </head><body>
    <h1>${heading}${patternLabel ? ' \u2014 ' + patternLabel : ''}</h1>
    <p>${view === 'side' ? 'Side view' : view === 'space' ? 'Floor plan view' : 'Top-down view'}</p>
    <img src="${imgSrc}" />
    ${legendRows ? `<div class="legend">${legendRows}</div>` : ''}
    <script>window.onload = function(){ window.print(); }<\/script>
  </body></html>`);
  win.document.close();
}

export default function DiagramCard({ spec, title, inline, cameraSettings, spaceCheck, roomDimensions, highlightRole, twoHostSetup, onItemSelect }) {
  const canvasRef = useRef(null);
  const [view, setView] = useState('top');
  const [zoomSrc, setZoomSrc] = useState(null);
  const [activeLight, setActiveLight] = useState(null); // role of selected/dragged light
  const [lightOverrides, setLightOverrides] = useState({}); // { [role]: { distance_m, height_m } } — live drag state
  const dragRef = useRef(null); // { role, startX, startY, scaleX, scaleY, origDistM, origHeightM }
  const { units, powerDisplay } = useSettings();

  const handleCanvasZoom = useCallback(() => {
    if (canvasRef.current) {
      setZoomSrc(canvasRef.current.toDataURL('image/png'));
    }
  }, []);

  // Hit-test: find light near canvas pointer position (top view only)
  const hitTestLight = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas || !spec?.lights?.length) return null;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const px = (e.clientX - rect.left) * (canvas.width / rect.width);
    const py = (e.clientY - rect.top) * (canvas.height / rect.height);
    const lights = spec.lights;
    const W = canvas.width / dpr;
    const H = canvas.height / dpr;
    const margin = 20;
    const scaleX = (W - margin * 2) / 6;
    const scaleY = (H - margin * 2) / 4;
    const subjectX = W * 0.5;
    const floorY = H - margin - 20;
    for (const l of lights) {
      const angleRad = (l.angle_deg || 0) * Math.PI / 180;
      const depthM = (l.distance_m || 2) * Math.cos(angleRad);
      const lx = subjectX - depthM * scaleX;
      const ly = floorY - (l.height_m || 1.7) * scaleY;
      const dx = px / dpr - lx;
      const dy = py / dpr - ly;
      if (Math.sqrt(dx * dx + dy * dy) < 18) return l.role;
    }
    return null;
  }, [spec]);

  const handlePointerDown = useCallback((e) => {
    if (view !== 'top') return;
    const role = hitTestLight(e);
    if (!role) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    const W = canvas ? canvas.width / (window.devicePixelRatio || 1) : 300;
    const H = canvas ? canvas.height / (window.devicePixelRatio || 1) : 300;
    const margin = 20;
    const scaleX = (W - margin * 2) / 6;
    const scaleY = (H - margin * 2) / 4;
    const light = spec?.lights?.find(l => l.role === role);
    dragRef.current = {
      role,
      startX: e.clientX,
      startY: e.clientY,
      scaleX,
      scaleY,
      origDistM: light?.distance_m ?? 2,
      origHeightM: light?.height_m ?? 1.7,
    };
    setActiveLight(role);
    dragStartHaptic();
    canvasRef.current?.setPointerCapture(e.pointerId);
  }, [view, hitTestLight, spec]);

  const handlePointerMove = useCallback((e) => {
    const dr = dragRef.current;
    if (!dr) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dpr = window.devicePixelRatio || 1;
    // Convert client delta → canvas pixels → meters
    const dxPx = (e.clientX - dr.startX) * (canvasRef.current.width / rect.width) / dpr;
    const dyPx = (e.clientY - dr.startY) * (canvasRef.current.height / rect.height) / dpr;
    // In top view: right = closer to subject (less distance), up = taller
    const newDist   = Math.max(0.3, dr.origDistM   - dxPx / dr.scaleX);
    const newHeight = Math.max(0.3, dr.origHeightM  - dyPx / dr.scaleY);
    setLightOverrides(prev => ({
      ...prev,
      [dr.role]: { distance_m: newDist, height_m: newHeight },
    }));
  }, []);

  const handlePointerUp = useCallback((e) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    dropHaptic();
    canvasRef.current?.releasePointerCapture(e.pointerId);
  }, []);

  const handleCanvasClick = useCallback((e) => {
    if (view !== 'top') { handleCanvasZoom(); return; }
    const role = hitTestLight(e);
    if (role) {
      setActiveLight(r => r === role ? null : role);
      onItemSelect?.(role);
      selectHaptic();
    } else {
      handleCanvasZoom();
    }
  }, [view, hitTestLight, onItemSelect]); // eslint-disable-line react-hooks/exhaustive-deps

  // Merge drag overrides into spec for live re-render
  const effectiveSpec = Object.keys(lightOverrides).length === 0 ? spec : {
    ...spec,
    lights: (spec?.lights || []).map(l =>
      lightOverrides[l.role] ? { ...l, ...lightOverrides[l.role] } : l
    ),
  };

  useEffect(() => {
    const draw = view === 'space'
      ? (c) => drawFloorPlan(c, effectiveSpec, units, spaceCheck, roomDimensions, highlightRole)
      : view === 'side' ? (c) => drawSideView(c, effectiveSpec, units, highlightRole) : (c) => drawTopView(c, effectiveSpec, units, highlightRole, twoHostSetup);
    draw(canvasRef.current);

    function onResize() { draw(canvasRef.current); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [effectiveSpec, view, units, spaceCheck, roomDimensions, highlightRole]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!spec) return null;

  const lights = effectiveSpec.lights || [];
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
        {spaceCheck && (spaceCheck.minCeilingFt || spaceCheck.minWidthFt) && (
          <button
            className={`diagram-view-btn${view === 'space' ? ' diagram-view-btn--active' : ''}`}
            onClick={() => setView('space')}
            type="button"
          >Floor Plan</button>
        )}
        <button
          className="diagram-print-btn"
          onClick={() => handlePrint(canvasRef.current, spec, title, view)}
          type="button"
          title="Print / Save diagram"
          aria-label="Print diagram"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="6 9 6 2 18 2 18 9"/>
            <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
            <rect x="6" y="14" width="12" height="8"/>
          </svg>
          Print
        </button>
      </div>
      <div className="diagram-layout">
        <div className="diagram-layout__canvas">
          <canvas
            ref={canvasRef}
            className="diagram-canvas"
            onClick={handleCanvasClick}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{ cursor: view === 'top' ? 'crosshair' : 'zoom-in', touchAction: 'none' }}
            title={view === 'top' ? 'Tap a light to select · drag to explore' : undefined}
          />
          {cameraSettings && (
            <>
              <div className="diagram-camera-bar">
                {cameraSettings.aperture && <span className="diagram-camera-bar__item"><strong>{cameraSettings.aperture}</strong></span>}
                {cameraSettings.iso && <span className="diagram-camera-bar__item">ISO {cameraSettings.iso}</span>}
                {cameraSettings.shutter && <span className="diagram-camera-bar__item">{cameraSettings.shutter}</span>}
              </div>
              {cameraSettings.wb && (
                <div className="diagram-wb-row">
                  <span className={`diagram-camera-bar__item diagram-wb-row__label ${wbTempClass(cameraSettings.wb)}`}>WB {formatWB(cameraSettings.wb)}</span>
                  <WBSpectrum wb={cameraSettings.wb} className="diagram-wb-spectrum" />
                </div>
              )}
            </>
          )}
        </div>
        <div className="diagram-layout__sidebar">
          <div className="diagram-legend diagram-legend--detailed">
            {lights.map((l, i) => {
              const modText = SHORT_MOD[l.modifier] || (l.modifier || '').replace(/_/g, ' ');
              const roleName = l.label || l.role.replace(/_/g, ' ');
              const role = l.role.toLowerCase();
              const extra = formatEnginePowerHint(l.power_hint, powerDisplay) || l.ratio_hint || '';
              const isHighlightedLegend = highlightRole && (
                l.role === highlightRole || l.role.startsWith(highlightRole) || highlightRole.startsWith(l.role)
              );
              return (
                <div className={`diagram-legend__row${isHighlightedLegend ? ' diagram-legend__row--highlighted' : ''}`} key={`${l.role}-${i}`}>
                  <span
                    className="diagram-legend__dot"
                    style={{ background: lightColor(l.role, tc.lightColors) }}
                  />
                  <span className="diagram-legend__info">
                    <div className="diagram-legend__header">
                      <span className="diagram-legend__name">{roleName}</span>
                    </div>
                    {ROLE_DESC[role] && (
                      <span className="diagram-legend__role-desc">{ROLE_DESC[role]}</span>
                    )}
                    <div className="diagram-legend__fields">
                      {modText && (
                        <span className="diagram-legend__field">
                          <span className="diagram-legend__field-key">Mod</span>{modText}
                        </span>
                      )}
                      <span className="diagram-legend__field">
                        <span className="diagram-legend__field-key">Pos</span>
                        {Math.round(Math.abs(l.angle_deg))}&deg;&nbsp;&middot;&nbsp;
                        {fmtDist(l.distance_m, units)}&nbsp;&middot;&nbsp;
                        {fmtDist(l.height_m || 1.7, units)} high
                      </span>
                      {(() => { const w = angleWarning(l); return w ? (
                        <span className="diagram-legend__field diagram-legend__field--warn" title={w.msg}>
                          ⚠ {w.msg}
                        </span>
                      ) : null; })()}
                      {extra && (
                        <span className="diagram-legend__field">
                          <span className="diagram-legend__field-key">Pwr</span>{extra}
                        </span>
                      )}
                    </div>
                  </span>
                </div>
              );
            })}
            <div className="diagram-legend__row">
              <span className="diagram-legend__dot" style={{ background: tc.camera }} />
              <span className="diagram-legend__info">
                <div className="diagram-legend__header">
                  <span className="diagram-legend__name">Camera</span>
                </div>
                {spec.camera?.distance_m && (
                  <span className="diagram-legend__role-desc">{fmtDist(spec.camera.distance_m, units)} from subject</span>
                )}
              </span>
            </div>
          </div>
          {spaceCheck && (spaceCheck.minCeilingFt || spaceCheck.minWidthFt) && (() => {
            const ceilFail = roomDimensions && parseFloat(roomDimensions.ceilingFt) < parseFloat(spaceCheck.minCeilingFt);
            const wFail = roomDimensions && parseFloat(roomDimensions.widthFt) < parseFloat(spaceCheck.minWidthFt);
            const dFail = roomDimensions && parseFloat(roomDimensions.lengthFt) < parseFloat(spaceCheck.minDepthFt);
            const hasRoom = !!roomDimensions;
            const anyFail = ceilFail || wFail || dFail;
            const allPass = hasRoom && !anyFail;

            // Compute floor area from min dimensions
            const wFt = parseFloat(spaceCheck.minWidthFt) || 0;
            const dFt = parseFloat(spaceCheck.minDepthFt) || 0;
            const hasArea = wFt > 0 && dFt > 0;
            const areaLabel = hasArea
              ? units === 'metric'
                ? `${((wFt * 0.3048) * (dFt * 0.3048)).toFixed(1)} m²`
                : `${Math.round(wFt * dFt)} sq ft`
              : null;

            return (
              <div className={`diagram-space-footer${anyFail ? ' diagram-space-footer--fail' : allPass ? ' diagram-space-footer--pass' : ''}`}>
                <div className="diagram-space-footer__heading">
                  <span className="diagram-space-footer__dot" />
                  <span className="diagram-space-footer__label">Space needed for this setup</span>
                  {anyFail && <span className="diagram-space-footer__warn-badge">⚠ too small</span>}
                  {allPass && <span className="diagram-space-footer__pass-badge">✓ fits</span>}
                </div>
                <div className="diagram-space-footer__rows">
                  {spaceCheck.minCeilingFt && (
                    <div className={`diagram-space-footer__row${hasRoom ? (ceilFail ? ' diagram-space-footer__dim--fail' : ' diagram-space-footer__dim--pass') : ''}`}>
                      <span className="diagram-space-footer__row-label">Ceiling height</span>
                      <span className="diagram-space-footer__row-val">≥ {formatRoomDim(spaceCheck.minCeilingFt, units)}</span>
                    </div>
                  )}
                  {(spaceCheck.minWidthFt || spaceCheck.minDepthFt) && (
                    <div className={`diagram-space-footer__row${hasRoom ? ((wFail || dFail) ? ' diagram-space-footer__dim--fail' : ' diagram-space-footer__dim--pass') : ''}`}>
                      <span className="diagram-space-footer__row-label">Floor space</span>
                      <span className="diagram-space-footer__row-val">
                        {spaceCheck.minWidthFt && formatRoomDim(spaceCheck.minWidthFt, units)}
                        {spaceCheck.minWidthFt && spaceCheck.minDepthFt && ' × '}
                        {spaceCheck.minDepthFt && formatRoomDim(spaceCheck.minDepthFt, units)}
                        {areaLabel && <span className="diagram-space-footer__area"> — {areaLabel}</span>}
                      </span>
                    </div>
                  )}
                </div>
                {spaceCheck?.warnings?.length > 0 && (
                  <div className="diagram-space-footer__warn-hint">⚠ {spaceCheck.warnings[0]}</div>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    </>
  );

  if (inline) return inner;

  const patternLabel = spec.pattern
    ? spec.pattern.charAt(0).toUpperCase() + spec.pattern.slice(1).replace(/[-_]/g, ' ')
    : null;

  return (
    <div className="result-card">
      <div className="result-card__header">
        <CardIcon name="map" />
        <span>{title || 'Lighting Diagram'}{patternLabel ? ` \u2014 ${patternLabel}` : ''}</span>
      </div>
      {inner}
    </div>
  );
}
