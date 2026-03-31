/**
 * drawFloorPlan — Bird's-eye room layout canvas renderer.
 *
 * Draws the room outline, backdrop, subject, camera, lights, and
 * optional minimum-requirement overlay from spaceCheck data.
 */

import { FONT_STACK } from './diagramConstants';
import { getThemeColors, lightColor, fmtDist, fontScale } from './diagramUtils';

export default function drawFloorPlan(canvas, spec, units, spaceCheck, roomDimensions, highlightRole, showBeams = true, showAngles = true) {
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
  const fs = fontScale(W);

  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  // Room dimensions in feet
  const roomWFt = roomDimensions?.widthFt ? parseFloat(roomDimensions.widthFt) : (spaceCheck?.minWidthFt ? parseFloat(spaceCheck.minWidthFt) : 14);
  const roomDFt = roomDimensions?.lengthFt ? parseFloat(roomDimensions.lengthFt) : (spaceCheck?.minDepthFt ? parseFloat(spaceCheck.minDepthFt) : 16);
  const roomWM = roomWFt * 0.3048;
  const roomDM = roomDFt * 0.3048;

  const margin = { top: 36, bottom: 36, left: 36, right: 36 };
  const drawW = W - margin.left - margin.right;
  const drawH = H - margin.top - margin.bottom;

  const scaleX = drawW / roomWM;
  const scaleY = drawH / roomDM;
  const roomScale = Math.min(scaleX, scaleY) * 0.85;

  const roomPxW = roomWM * roomScale;
  const roomPxH = roomDM * roomScale;
  const roomX = margin.left + (drawW - roomPxW) / 2;
  const roomY = margin.top + (drawH - roomPxH) / 2;

  const cam = spec.camera || {};
  const camDist = cam.distance_m || 2;

  function sceneToPixel(sx, sz) {
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

  ctx.fillStyle = tc.isDark ? 'rgba(15,17,23,0.3)' : 'rgba(250,250,248,0.5)';
  ctx.fillRect(roomX, roomY, roomPxW, roomPxH);

  // ── Dimension labels ──
  const dimFont = `${Math.round(11 * fs)}px ${FONT_STACK}`;
  ctx.font = dimFont;
  ctx.textAlign = 'center';

  const widthLabel = (units === 'metric' ? `${roomWM.toFixed(1)} m` : `${roomWFt.toFixed(0)} ft`) + ' wide';
  ctx.fillStyle = wFail ? '#ef4444' : tc.textDim;
  ctx.fillText(widthLabel, roomX + roomPxW / 2, roomY - 10);

  const depthLabel = (units === 'metric' ? `${roomDM.toFixed(1)} m` : `${roomDFt.toFixed(0)} ft`) + ' deep';
  ctx.save();
  ctx.translate(roomX + roomPxW + 14, roomY + roomPxH / 2);
  ctx.rotate(Math.PI / 2);
  ctx.fillStyle = dFail ? '#ef4444' : tc.textDim;
  ctx.textAlign = 'center';
  ctx.fillText(depthLabel, 0, 0);
  ctx.restore();

  // ── "DOOR" indicator ──
  const doorW = Math.min(40 * fs, roomPxW * 0.2);
  const doorX = roomX + roomPxW / 2 - doorW / 2;
  ctx.fillStyle = tc.isDark ? 'rgba(110,106,101,0.6)' : 'rgba(140,135,128,0.6)';
  ctx.fillRect(doorX, roomY + roomPxH - 1, doorW, 3);

  // ── Background wall ──
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
  const [sx, sy] = sceneToPixel(0, -roomDM * 0.08);
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
    const angleRad = (90 - (l.angle_deg ?? l.angle ?? 0)) * Math.PI / 180;
    const dist = l.distance_m;
    const lsx = Math.cos(angleRad) * dist;
    const lsz = Math.sin(angleRad) * dist;
    const [lx, ly] = sceneToPixel(lsx, lsz - roomDM * 0.08);
    return { ...l, lx, ly };
  });

  // Beams
  if (showBeams) {
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
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(targetX, targetY); ctx.stroke();
      ctx.globalAlpha = 1;
    });
  }

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
      ctx.beginPath(); ctx.arc(lx, ly, 14, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(lx, ly, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = tc.markerDot;
    ctx.beginPath(); ctx.arc(lx, ly, 3.5, 0, Math.PI * 2); ctx.fill();
  });

  // Light labels + angle annotations
  lights.forEach(({ role, label, lx, ly, angle_deg, angle, distance_m }) => {
    const color = lightColor(role, tc.lightColors);
    const roleName = label || role.replace(/_/g, ' ');
    ctx.fillStyle = color;
    ctx.font = `bold ${Math.round(11 * fs)}px ${FONT_STACK}`;
    ctx.textAlign = 'center';
    ctx.fillText(roleName, lx, ly - 14);

    if (showAngles) {
      const deg = Math.round(Math.abs(angle_deg ?? angle ?? 0));
      const distLabel = fmtDist(distance_m, units);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.55;
      ctx.font = `${Math.round(9 * fs)}px ${FONT_STACK}`;
      ctx.fillText(`${deg}\u00b0 \u00b7 ${distLabel}`, lx, ly + 16);
      ctx.globalAlpha = 1;
    }
  });

  // ── Min. requirement outline ──
  if (roomDimensions && spaceCheck?.minWidthFt && spaceCheck?.minDepthFt) {
    const minWM = parseFloat(spaceCheck.minWidthFt) * 0.3048;
    const minDM = parseFloat(spaceCheck.minDepthFt) * 0.3048;
    const minPxW = minWM * roomScale;
    const minPxH = minDM * roomScale;
    if (minPxW < roomPxW - 4 || minPxH < roomPxH - 4) {
      const minX = roomX + (roomPxW - minPxW) / 2;
      const minY = roomY + (roomPxH - minPxH) / 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = tc.isDark ? 'rgba(138,135,133,0.3)' : 'rgba(140,135,128,0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(minX, minY, minPxW, minPxH);
      ctx.setLineDash([]);
      ctx.fillStyle = tc.textFaint;
      ctx.font = `${Math.round(9 * fs)}px ${FONT_STACK}`;
      ctx.textAlign = 'left';
      ctx.fillText('min required', minX + 4, minY - 4);
    }
  }

  return { subjectX: sx, subjectY: sy, camX: cx, camY: cy, lights, bgX: bgWallX, bgY: bgWallY, bgW: bgWallW, bgH: 14 };
}
