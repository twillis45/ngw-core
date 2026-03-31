/**
 * drawTopView — Top-down lighting diagram canvas renderer.
 *
 * Draws camera, subject, backdrop, light beams, markers, and distance
 * annotations from a bird's-eye perspective.
 *
 * Returns layout metadata { subjectX, subjectY, camX, camY, scale, dpr, lights }
 * for interactive hit-testing.
 */

import { FONT_STACK } from './diagramConstants';
import { getThemeColors, lightColor, fmtDist, fontScale } from './diagramUtils';

export default function drawTopView(canvas, spec, units, highlightRole, twoHostSetup, selectedItemType, showBeams = true) {
  if (!canvas || !spec) return null;

  const tc = getThemeColors();
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.parentElement?.clientWidth || 340;
  const vh = window.innerHeight || 800;
  const isMobile = W < 600;
  const isDesktop = W >= 768;
  const isLargeDesktop = W >= 1000;
  const maxCanvasH = vh - (isMobile ? 120 : isLargeDesktop ? 60 : isDesktop ? 100 : 260);
  const idealH = Math.round(W * (isMobile ? 1.15 : isLargeDesktop ? 0.85 : isDesktop ? 0.75 : 0.65));
  const H = Math.max(Math.min(idealH, maxCanvasH), isMobile ? 340 : 260);
  const fs = fontScale(W);
  const badgeFont = `bold ${Math.round(13 * fs)}px ${FONT_STACK}`;
  const badgeBg = tc.isDark ? 'rgba(15,17,23,0.85)' : 'rgba(250,250,248,0.9)';
  const badgeBorder = tc.isDark ? 'rgba(42,44,54,0.6)' : 'rgba(140,135,128,0.4)';
  const badgeText = tc.isDark ? '#f2f0eb' : '#1A1814';

  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  // Selection dim — dramatic fade for non-selected items; connected pieces stay bright
  const hasSel = !!selectedItemType;
  const DIM = 0.12;

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
  if (hasSel && selectedItemType !== 'background') ctx.globalAlpha = DIM;
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
  ctx.globalAlpha = 1;

  // ── subject(s) ────────────────────────────────────
  if (twoHostSetup) {
    if (hasSel && selectedItemType !== 'subject') ctx.globalAlpha = DIM;
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
    ctx.strokeStyle = tc.isDark ? 'rgba(138,135,133,0.45)' : 'rgba(140,135,128,0.4)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(aEdge, lineY);
    ctx.lineTo(bEdge, lineY);
    ctx.stroke();
    ctx.setLineDash([]);
    const asz = Math.round(5 * fs);
    [[aEdge, 1], [bEdge, -1]].forEach(([ax, dir]) => {
      ctx.fillStyle = tc.isDark ? 'rgba(138,135,133,0.6)' : 'rgba(140,135,128,0.55)';
      ctx.beginPath();
      ctx.moveTo(ax, lineY);
      ctx.lineTo(ax + dir * asz, lineY - asz / 2);
      ctx.lineTo(ax + dir * asz, lineY + asz / 2);
      ctx.closePath();
      ctx.fill();
    });
    drawDistBadge(ctx, (subjectAX + subjectBX) / 2, lineY, spacingLabel, fs, badgeBg, badgeBorder, badgeText, badgeFont);
    ctx.globalAlpha = 1;
  } else {
    if (hasSel && selectedItemType !== 'subject') ctx.globalAlpha = DIM;
    // Selection glow for subject
    if (selectedItemType === 'subject') {
      ctx.save();
      ctx.shadowColor = tc.isDark ? 'rgba(138,135,133,0.6)' : 'rgba(107,104,100,0.5)';
      ctx.shadowBlur = 12;
      ctx.strokeStyle = tc.isDark ? 'rgba(138,135,133,0.7)' : 'rgba(107,104,100,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(subjectX, subjectY, 13, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = selectedItemType === 'subject' ? (tc.isDark ? '#f2f0eb' : '#6B6864') : tc.subjectHead;
    ctx.beginPath();
    ctx.arc(subjectX, subjectY, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = selectedItemType === 'subject' ? tc.text : tc.textFaint;
    ctx.font = selectedItemType === 'subject'
      ? `bold ${Math.round(11 * fs)}px ${FONT_STACK}`
      : `${Math.round(11 * fs)}px ${FONT_STACK}`;
    ctx.textAlign = 'center';
    ctx.fillText('Subject', subjectX, subjectY + 24);
    ctx.globalAlpha = 1;
  }

  // ── camera ────────────────────────────────────────
  const camX = subjectX;
  const camVisualDist = Math.max(camDist * scale, H * 0.34);
  const camY = subjectY + camVisualDist;
  if (hasSel && selectedItemType !== 'camera') ctx.globalAlpha = DIM;
  if (selectedItemType === 'camera') {
    ctx.save();
    ctx.shadowColor = tc.isDark ? 'rgba(110,106,101,0.6)' : 'rgba(107,104,100,0.5)';
    ctx.shadowBlur = 12;
    ctx.strokeStyle = tc.isDark ? 'rgba(138,135,133,0.7)' : 'rgba(107,104,100,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(camX - 14, camY - 10, 28, 20, 5);
    ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = selectedItemType === 'camera' ? (tc.isDark ? '#8a8785' : '#4a4744') : tc.camera;
  ctx.beginPath();
  ctx.roundRect(camX - 10, camY - 6, 20, 12, 3);
  ctx.fill();
  ctx.fillStyle = selectedItemType === 'camera' ? (tc.isDark ? '#f2f0eb' : '#FAFAF8') : tc.cameraLens;
  ctx.beginPath();
  ctx.arc(camX, camY, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = selectedItemType === 'camera' ? tc.text : tc.textFaint;
  ctx.font = selectedItemType === 'camera'
    ? `bold ${Math.round(11 * fs)}px ${FONT_STACK}`
    : `${Math.round(11 * fs)}px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.fillText('Camera', camX, camY + 20);
  ctx.globalAlpha = 1;

  // ── distance annotations ──────────────────────────
  const bgDistM = (subjectY - bgY) / scale;
  const distFont = `${Math.round(11 * fs)}px ${FONT_STACK}`;
  ctx.font = `bold ${distFont}`;
  const camLabel = fmtDist(camDist, units);
  const bgLabel = fmtDist(bgDistM, units);
  const maxLabelW = Math.max(ctx.measureText(camLabel).width, ctx.measureText(bgLabel).width);
  const distMarginX = Math.max(18, Math.ceil(maxLabelW / 2) + 6);

  const arrowSize = Math.round(6 * fs);
  function drawArrow(x, y, dir) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - arrowSize, y - dir * arrowSize * 1.4);
    ctx.lineTo(x + arrowSize, y - dir * arrowSize * 1.4);
    ctx.closePath();
    ctx.fill();
  }

  // Camera ↔ Subject distance — bright when camera or subject is selected
  const camSubjConnected = selectedItemType === 'camera' || selectedItemType === 'subject';
  if (hasSel && !camSubjConnected) ctx.globalAlpha = DIM;
  const csTopY = subjectY;
  const csBotY = camY;
  const csMidY = (csTopY + csBotY) / 2;
  ctx.strokeStyle = tc.connector;
  ctx.fillStyle = tc.connector;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(distMarginX, csTopY); ctx.lineTo(distMarginX, csMidY - Math.round(8 * fs)); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(distMarginX, csMidY + Math.round(8 * fs)); ctx.lineTo(distMarginX, csBotY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(distMarginX - 6, csTopY); ctx.lineTo(subjectX - 14, csTopY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(distMarginX - 6, csBotY); ctx.lineTo(camX - 14, csBotY); ctx.stroke();
  ctx.setLineDash([]);
  drawArrow(distMarginX, csTopY, -1);
  drawArrow(distMarginX, csBotY, 1);
  ctx.fillStyle = tc.textDim;
  ctx.font = `bold ${distFont}`;
  ctx.textAlign = 'center';
  ctx.fillText(fmtDist(camDist, units), distMarginX, csMidY + 4);
  ctx.globalAlpha = 1;

  // Subject ↔ Background distance — bright when subject or background is selected
  const subjBgConnected = selectedItemType === 'subject' || selectedItemType === 'background';
  if (hasSel && !subjBgConnected) ctx.globalAlpha = DIM;
  const sbTopY = bgY;
  const sbBotY = subjectY;
  const sbMidY = (sbTopY + sbBotY) / 2;
  ctx.strokeStyle = tc.connector;
  ctx.fillStyle = tc.connector;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(distMarginX + 20, sbTopY); ctx.lineTo(distMarginX + 20, sbMidY - Math.round(8 * fs)); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(distMarginX + 20, sbMidY + Math.round(8 * fs)); ctx.lineTo(distMarginX + 20, sbBotY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(distMarginX + 14, sbTopY); ctx.lineTo(subjectX - bgW / 2 - 4, sbTopY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(distMarginX + 14, sbBotY); ctx.lineTo(subjectX - 14, sbBotY); ctx.stroke();
  ctx.setLineDash([]);
  drawArrow(distMarginX + 20, sbTopY, -1);
  drawArrow(distMarginX + 20, sbBotY, 1);
  ctx.fillStyle = tc.textDim;
  ctx.font = `bold ${distFont}`;
  ctx.textAlign = 'center';
  ctx.fillText(fmtDist(bgDistM, units), distMarginX + 20, sbMidY + 4);
  ctx.globalAlpha = 1;

  const distLineX = distMarginX;
  const distLineX2 = distMarginX + 20;

  // ── compute light positions (spread co-located lights) ──
  const rawLights = (spec.lights || []).map(l => {
    const angleDeg = l.angle_deg ?? l.angle ?? 0;
    const angleRad = (90 - angleDeg) * Math.PI / 180;
    const dist = l.distance_m * scale;
    return { ...l, lx: subjectX + Math.cos(angleRad) * dist, ly: subjectY + Math.sin(angleRad) * dist };
  });
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
  if (showBeams) {
    lights.forEach(({ role, lx, ly, side }) => {
      const color = lightColor(role, tc.lightColors);
      const isBackground = role === 'background';
      let targetX, targetY;
      if (isBackground) { targetX = subjectX; targetY = bgY; }
      else if (twoHostSetup && side === 'left') { targetX = subjectBX; targetY = subjectY; }
      else if (twoHostSetup && side === 'right') { targetX = subjectAX; targetY = subjectY; }
      else { targetX = subjectX; targetY = subjectY; }

      // Beam brightens if its light is highlighted, or its target is selected
      const isLightSel = highlightRole && (role === highlightRole || role.startsWith(highlightRole) || highlightRole.startsWith(role));
      const isTargetSel = isBackground ? selectedItemType === 'background' : selectedItemType === 'subject';
      const beamConnected = isLightSel || isTargetSel;
      const beamDimFactor = hasSel && !beamConnected ? DIM : 1;

      ctx.save();
      ctx.globalAlpha = (tc.isDark ? 0.12 : 0.10) * beamDimFactor;
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
      ctx.globalAlpha = 0.4 * beamDimFactor;
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(targetX, targetY); ctx.stroke();
      ctx.globalAlpha = 1;
    });
  }

  // ── light markers ─────────────────────────────────
  lights.forEach(({ role, lx, ly }) => {
    const color = lightColor(role, tc.lightColors);
    const isHighlighted = highlightRole && (
      role === highlightRole || role.startsWith(highlightRole) || highlightRole.startsWith(role)
    );
    // Light marker stays bright if highlighted, or if its target is selected
    const isLightTargetSel = role === 'background' ? selectedItemType === 'background' : selectedItemType === 'subject';
    const lightBright = isHighlighted || isLightTargetSel;
    if (hasSel && !lightBright) ctx.globalAlpha = DIM;
    if (isHighlighted) {
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 18;
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.globalAlpha = 0.75;
      ctx.beginPath(); ctx.arc(lx, ly, 16, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(lx, ly, 11, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = tc.markerDot;
    ctx.beginPath(); ctx.arc(lx, ly, 4, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
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
      if (r.x < b.x + b.w && r.x + r.w > b.x && r.y < b.y + b.h && r.y + r.h > b.y) return false;
    }
    return true;
  }

  // Reserve icon areas
  if (twoHostSetup) {
    addBox(subjectAX, subjectY, 28, 28);
    addBox(subjectAX, subjectY + 24, 60, 20);
    addBox(subjectBX, subjectY, 28, 28);
    addBox(subjectBX, subjectY + 24, 60, 20);
    addBox((subjectAX + subjectBX) / 2, subjectY - 22, subjectBX - subjectAX, 26);
  } else {
    addBox(subjectX, subjectY, 28, 28);
    addBox(subjectX, subjectY + 24, 60, 20);
  }
  addBox(camX, camY, 28, 18);
  addBox(camX, camY + 20, 60, 20);
  addBox(subjectX, bgY, bgW + 8, bgH + 8);
  const badgeReserveW = Math.round(90 * fs);
  addBox(distLineX, (subjectY + camY) / 2, badgeReserveW, Math.abs(camY - subjectY) + 20);
  addBox(distLineX2, (bgY + subjectY) / 2, badgeReserveW, Math.abs(subjectY - bgY) + 20);
  lights.forEach(({ lx, ly }) => addBox(lx, ly, 30, 30));

  const sortedLights = [...lights].sort((a, b) => {
    const minGapA = lights.reduce((min, o) => o === a ? min : Math.min(min, Math.abs((a.angle_deg ?? a.angle ?? 0) - (o.angle_deg ?? o.angle ?? 0))), 360);
    const minGapB = lights.reduce((min, o) => o === b ? min : Math.min(min, Math.abs((b.angle_deg ?? b.angle ?? 0) - (o.angle_deg ?? o.angle ?? 0))), 360);
    return minGapB - minGapA;
  });

  // ── Compact on-canvas labels ──────────────────────
  sortedLights.forEach(({ label, role, lx, ly }) => {
    const color = lightColor(role, tc.lightColors);
    const roleName = label || (role.charAt(0).toUpperCase() + role.slice(1));
    const isLabelHighlighted = highlightRole && (role === highlightRole || role.startsWith(highlightRole) || highlightRole.startsWith(role));
    const isLabelTargetSel = role === 'background' ? selectedItemType === 'background' : selectedItemType === 'subject';
    if (hasSel && !isLabelHighlighted && !isLabelTargetSel) ctx.globalAlpha = DIM;
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
      { x: nx * 28, y: ny * 28 },
      { x: hw, y: -16 }, { x: -hw, y: -16 },
      { x: hw, y: 16 }, { x: -hw, y: 16 },
      { x: 0, y: -28 }, { x: 0, y: 32 },
      { x: nx * 18 + 40, y: ny * 18 }, { x: nx * 18 - 40, y: ny * 18 },
      { x: 50, y: -24 }, { x: -50, y: -24 },
      { x: 50, y: 24 }, { x: -50, y: 24 },
      { x: nx * 50, y: ny * 50 },
    ];

    let labelX = lx + offsets[0].x;
    let labelY = ly + offsets[0].y;

    for (const off of offsets) {
      const tx = lx + off.x;
      const ty = ly + off.y;
      if (tx - boxW / 2 > 4 && tx + boxW / 2 < W - 4 && ty - boxH / 2 > 4 && ty + boxH / 2 < H - 4) {
        if (boxFits(tx, ty, boxW, boxH)) { labelX = tx; labelY = ty; break; }
      }
    }

    ctx.fillStyle = color;
    ctx.font = `bold ${Math.round(12 * fs)}px ${FONT_STACK}`;
    ctx.textAlign = 'center';
    ctx.fillText(roleName, labelX, labelY);
    ctx.globalAlpha = 1;
    addBox(labelX, labelY, boxW, boxH);
  });

  return { subjectX, subjectY, camX, camY, scale, dpr, lights, bgX: subjectX - bgW / 2, bgY: bgY - bgH / 2, bgW, bgH };
}

/* ── pill-shaped distance badge helper ───────────────── */

function drawDistBadge(ctx, x, y, label, fs, bg, border, text, font) {
  ctx.font = font;
  const tw = ctx.measureText(label).width;
  const pw = tw + Math.round(16 * fs);
  const ph = Math.round(22 * fs);
  const rx = x - pw / 2;
  const ry = y - ph / 2;
  ctx.fillStyle = bg;
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(rx, ry, pw, ph, ph / 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = text;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y);
  ctx.textBaseline = 'alphabetic';
}
