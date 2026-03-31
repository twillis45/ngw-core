/**
 * drawSideView — Side-profile lighting diagram canvas renderer.
 *
 * Depth axis (horizontal): background ← subject → camera
 * Height axis (vertical):  floor → ceiling
 *
 * Each light's horizontal position uses its depth component:
 *   depthM = distance_m × cos(angle_deg)
 *   positive = toward camera, negative = behind subject
 */

import { FONT_STACK } from './diagramConstants';
import { getThemeColors, lightColor, fmtDist, fontScale } from './diagramUtils';

export default function drawSideView(canvas, spec, units, highlightRole, showBeams = true, showAngles = true) {
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
  const fs = fontScale(W);

  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  // Compute left margin for height labels
  const sideDistFont = `${Math.round(12 * fs)}px ${FONT_STACK}`;
  ctx.font = sideDistFont;
  const sampleHeightLabel = fmtDist(2.5, units);
  const heightLabelW = ctx.measureText(sampleHeightLabel).width;
  const marginL = Math.max(50, Math.ceil(heightLabelW) + 14);
  const marginR = 50;
  const marginT = 20;
  const marginB = Math.round((units === 'metric' ? 56 : 50) * fs);
  const plotW = W - marginL - marginR;
  const plotH = H - marginT - marginB;

  const lights = spec.lights || [];
  const cam = spec.camera || {};
  const camDist = cam.distance_m || 2;
  const bgDistM = 2.2;

  // Compute depth for each light
  const lightsWithDepth = lights.map(l => {
    const angleRad = (l.angle_deg ?? l.angle ?? 0) * Math.PI / 180;
    const depthM = l.distance_m * Math.cos(angleRad);
    return { ...l, depthM };
  });

  // Determine depth axis range
  let maxBehind = bgDistM;
  let maxFront = camDist;
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

  const scaleDepth = plotW / totalDepth;
  const scaleY = plotH / maxHeight;

  const subjectX = marginL + maxBehind * scaleDepth;
  const floorY = marginT + plotH;

  function depthToX(depthM) { return subjectX + depthM * scaleDepth; }

  // ── Floor line ──
  ctx.strokeStyle = tc.floorLine;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(marginL, floorY); ctx.lineTo(W - marginR, floorY); ctx.stroke();

  // ── Height grid lines ──
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = tc.gridLine;
  const heightStepM = maxHeight <= 3 ? 0.5 : 1;
  for (let h = heightStepM; h <= maxHeight; h += heightStepM) {
    const y = floorY - h * scaleY;
    ctx.beginPath(); ctx.moveTo(marginL, y); ctx.lineTo(W - marginR, y); ctx.stroke();
    ctx.fillStyle = tc.textFaint;
    ctx.font = `${Math.round(12 * fs)}px ${FONT_STACK}`;
    ctx.textAlign = 'right';
    ctx.fillText(fmtDist(h, units), marginL - 6, y + 4);
  }
  ctx.setLineDash([]);

  // ── Background ──
  const bgX = depthToX(-bgDistM);
  const bgRectW = 14;
  const bgRectH = Math.min(plotH * 0.7, 2.5 * scaleY);
  const bgRectTop = floorY - bgRectH;
  ctx.fillStyle = tc.backdrop;
  ctx.strokeStyle = tc.backdropBorder;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(bgX - bgRectW / 2, bgRectTop, bgRectW, bgRectH, 3); ctx.fill(); ctx.stroke();
  ctx.save();
  ctx.translate(bgX, bgRectTop + bgRectH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = tc.backdropText;
  ctx.font = `${Math.round(12 * fs)}px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.fillText('Background', 0, 4);
  ctx.restore();

  // ── Subject figure ──
  const subjectHeadY = floorY - 1.7 * scaleY;
  const subjectBodyY = floorY - 0.9 * scaleY;

  ctx.strokeStyle = tc.subjectBody;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(subjectX, floorY); ctx.lineTo(subjectX, subjectHeadY + 8); ctx.stroke();

  ctx.fillStyle = tc.subjectHead;
  ctx.beginPath(); ctx.arc(subjectX, subjectHeadY, 8, 0, Math.PI * 2); ctx.fill();

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

  // ── Camera ──
  const camX = depthToX(camDist);
  const camFloorY = floorY;
  ctx.fillStyle = tc.camera;
  ctx.beginPath(); ctx.roundRect(camX - 10, camFloorY - 1.3 * scaleY - 6, 20, 12, 3); ctx.fill();
  ctx.fillStyle = tc.cameraLens;
  ctx.beginPath(); ctx.arc(camX, camFloorY - 1.3 * scaleY, 4, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = tc.connector;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(camX, camFloorY); ctx.lineTo(camX, camFloorY - 1.3 * scaleY + 6); ctx.stroke();
  ctx.fillStyle = tc.textDim;
  ctx.font = `${Math.round(14 * fs)}px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.fillText('Camera', camX, floorY + 18);

  // ── Eye level indicator ──
  const eyeY = floorY - 1.6 * scaleY;
  ctx.strokeStyle = tc.eyeLevel;
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 4]);
  ctx.beginPath(); ctx.moveTo(subjectX + 12, eyeY); ctx.lineTo(W - marginR, eyeY); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = tc.eyeLevelText;
  ctx.font = `${Math.round(11 * fs)}px ${FONT_STACK}`;
  ctx.textAlign = 'right';
  ctx.fillText('eye level', W - marginR - 4, eyeY - 5);

  // ── Distance annotations ──
  const annY = floorY + Math.round(28 * fs);
  const annFont = `${Math.round(12 * fs)}px ${FONT_STACK}`;
  const sideArrowW = Math.round(5 * fs);

  function drawHArrow(x, y, dir) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - dir * sideArrowW * 1.4, y - sideArrowW);
    ctx.lineTo(x - dir * sideArrowW * 1.4, y + sideArrowW);
    ctx.closePath();
    ctx.fill();
  }

  // Subject → Camera
  const scMidX = (subjectX + camX) / 2;
  ctx.strokeStyle = tc.connector;
  ctx.fillStyle = tc.connector;
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 3]);
  ctx.beginPath(); ctx.moveTo(subjectX, floorY + 4); ctx.lineTo(subjectX, annY + Math.round(8 * fs)); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(camX, floorY + 4); ctx.lineTo(camX, annY + Math.round(8 * fs)); ctx.stroke();
  ctx.setLineDash([]);
  ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(subjectX + Math.round(8 * fs), annY); ctx.lineTo(camX - Math.round(8 * fs), annY); ctx.stroke();
  ctx.setLineDash([]);
  drawHArrow(subjectX + 2, annY, -1);
  drawHArrow(camX - 2, annY, 1);
  ctx.fillStyle = tc.textDim;
  ctx.font = `bold ${annFont}`;
  ctx.textAlign = 'center';
  ctx.fillText(fmtDist(camDist, units), scMidX, annY - Math.round(6 * fs));

  // Subject → Background
  const sbMidX = (bgX + subjectX) / 2;
  ctx.strokeStyle = tc.connector;
  ctx.fillStyle = tc.connector;
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 3]);
  ctx.beginPath(); ctx.moveTo(bgX, floorY + 4); ctx.lineTo(bgX, annY + Math.round(8 * fs)); ctx.stroke();
  ctx.setLineDash([]);
  ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(bgX + Math.round(8 * fs), annY); ctx.lineTo(subjectX - Math.round(8 * fs), annY); ctx.stroke();
  ctx.setLineDash([]);
  drawHArrow(bgX + 2, annY, -1);
  drawHArrow(subjectX - 2, annY, 1);
  ctx.fillStyle = tc.textDim;
  ctx.font = `bold ${annFont}`;
  ctx.textAlign = 'center';
  ctx.fillText(fmtDist(bgDistM, units), sbMidX, annY - Math.round(6 * fs));

  // ── collision-aware label placement ──
  const labelBoxes = [];
  const LPAD = 4;
  function addBox(cx, cy, w, h) {
    labelBoxes.push({ x: cx - w / 2 - LPAD, y: cy - h / 2 - LPAD, w: w + LPAD * 2, h: h + LPAD * 2 });
  }
  function boxFits(cx, cy, w, h) {
    const r = { x: cx - w / 2 - LPAD, y: cy - h / 2 - LPAD, w: w + LPAD * 2, h: h + LPAD * 2 };
    for (const b of labelBoxes) {
      if (r.x < b.x + b.w && r.x + r.w > b.x && r.y < b.y + b.h && r.y + r.h > b.y) return false;
    }
    return true;
  }

  // Reserve icon areas
  addBox(subjectX, (subjectHeadY + floorY) / 2, 30, floorY - subjectHeadY + 16);
  addBox(subjectX, floorY + 18, 70, 22);
  const camIconY = camFloorY - 1.3 * scaleY;
  addBox(camX, camIconY, 28, 20);
  addBox(camX, (camIconY + camFloorY) / 2, 8, camFloorY - camIconY);
  addBox(camX, floorY + 18, 70, 22);
  addBox(bgX, bgRectTop + bgRectH / 2, bgRectW + 20, bgRectH + 10);
  addBox((subjectX + camX) / 2, annY, camX - subjectX + 20, Math.round(24 * fs));
  addBox((bgX + subjectX) / 2, annY, subjectX - bgX + 20, Math.round(24 * fs));
  addBox(W - marginR - 30, eyeY - 5, 60, 16);

  // Precompute light positions
  const lightPos = lightsWithDepth.map(l => ({
    ...l,
    lx: depthToX(l.depthM),
    ly: floorY - (l.height_m || 1.7) * scaleY,
  }));

  // Draw stands, beams, markers
  lightPos.forEach(l => {
    const color = lightColor(l.role, tc.lightColors);
    const { lx, ly } = l;

    // Stand
    ctx.strokeStyle = tc.connector;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(lx, floorY); ctx.lineTo(lx, ly); ctx.stroke();

    // Beam
    const isBg = l.role === 'background';
    const beamTargetX = isBg ? bgX : subjectX;
    const beamTargetY = isBg ? bgRectTop + bgRectH / 2 : subjectHeadY;

    if (showBeams) {
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
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(beamTargetX, beamTargetY); ctx.stroke();
      ctx.globalAlpha = 1;
    }

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
      ctx.beginPath(); ctx.arc(lx, ly, 12, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(lx, ly, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = tc.markerDot;
    ctx.beginPath(); ctx.arc(lx, ly, 2.5, 0, Math.PI * 2); ctx.fill();
  });

  // Reserve light marker circles
  lightPos.forEach(l => addBox(l.lx, l.ly, 20, 20));

  // ── Compact on-canvas labels ──
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
      { x: nameW / 2 + 16, y: -10 }, { x: -(nameW / 2 + 16), y: -10 },
      { x: 0, y: 24 },
      { x: nameW / 2 + 24, y: 0 }, { x: -(nameW / 2 + 24), y: 0 },
      { x: 28, y: -18 }, { x: -28, y: -18 },
      { x: 28, y: 16 }, { x: -28, y: 16 },
    ];

    let labelX = lx;
    let labelY = ly - 18;

    for (const off of offsets) {
      const tx = lx + off.x;
      const ty = ly + off.y;
      if (tx - boxW / 2 > 4 && tx + boxW / 2 < W - 4 && ty - boxH / 2 > 4 && ty + boxH / 2 < H - 4) {
        if (boxFits(tx, ty, boxW, boxH)) { labelX = tx; labelY = ty; break; }
      }
    }

    ctx.fillStyle = color;
    ctx.font = `bold ${Math.round(13 * fs)}px ${FONT_STACK}`;
    ctx.textAlign = 'center';
    ctx.fillText(roleName, labelX, labelY);
    addBox(labelX, labelY, boxW, boxH);
  });

  // ── Angle annotations (height from floor) ──
  if (showAngles) {
    lightPos.forEach(l => {
      const color = lightColor(l.role, tc.lightColors);
      const { lx, ly } = l;
      const heightLabel = fmtDist(l.height_m || 1.7, units);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.55;
      ctx.font = `${Math.round(10 * fs)}px ${FONT_STACK}`;
      ctx.textAlign = 'center';
      ctx.fillText(heightLabel, lx, ly - 12);
      ctx.globalAlpha = 1;
    });
  }

  return { subjectX, subjectY: floorY - 1.4 * scaleY, camX: depthToX(camDist), camY: floorY - 1.3 * scaleY, lights: lightPos, bgX: bgX - bgRectW / 2, bgY: bgRectTop, bgW: bgRectW, bgH: bgRectH };
}
