/**
 * socialCanvas.js — Canvas-based rendering for BTS cards and social export templates.
 *
 * All rendering is client-side (offscreen canvas), no server dependency.
 * Outputs are downloadable PNGs via canvas.toBlob().
 */

// ── Format constants ─────────────────────────────────────────────────────────
export const FORMATS = {
  STORY:     { w: 1080, h: 1920, label: 'Story (9:16)' },
  SQUARE:    { w: 1080, h: 1080, label: 'Square (1:1)' },
  PORTRAIT:  { w: 1080, h: 1350, label: 'Portrait (4:5)' },
  LANDSCAPE: { w: 1920, h: 1080, label: 'Landscape (16:9)' },
};

// ── Theme ────────────────────────────────────────────────────────────────────
const BG = '#0a0a0c';
const SURFACE = '#12131a';
const BORDER = 'rgba(132,158,184,0.12)';
const TEXT = 'rgba(245,247,250,0.95)';
const TEXT_DIM = 'rgba(132,158,184,0.55)';
const ACCENT = '#849eb8';
const SUCCESS = 'rgba(72,186,136,0.95)';
const WARN = 'rgba(245,190,72,0.9)';
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", sans-serif';

function confColor(c) {
  if (c >= 0.75) return SUCCESS;
  if (c >= 0.5) return WARN;
  return TEXT_DIM;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function drawBrand(ctx, x, y, branded) {
  if (!branded) return;
  ctx.font = `600 13px ${FONT}`;
  ctx.fillStyle = TEXT_DIM;
  ctx.textAlign = 'center';
  ctx.fillText('No Guesswork Lighting', x, y);
}

function drawPattern(ctx, x, y, pattern, confidence) {
  const name = (pattern || 'Unknown').replace(/_/g, ' ');
  const pct = Math.round((confidence || 0) * 100);

  ctx.font = `800 36px ${FONT}`;
  ctx.fillStyle = TEXT;
  ctx.textAlign = 'left';
  ctx.fillText(name, x, y);

  const nameW = ctx.measureText(name).width;
  ctx.font = `700 18px ${FONT}`;
  ctx.fillStyle = confColor(confidence);
  ctx.fillText(`${pct}%`, x + nameW + 14, y);
}

function drawLightRow(ctx, x, y, light, w) {
  const role = (light.label || light.role || '').replace(/_/g, ' ');
  const mod = (light.modifier || '').replace(/_/g, ' ');
  const dist = light.distance_m ? `${(light.distance_m * 3.281).toFixed(0)} ft` : '';
  const angle = light.angle_deg != null ? `${Math.round(Math.abs(light.angle_deg))}°` : '';

  ctx.font = `700 16px ${FONT}`;
  ctx.fillStyle = TEXT;
  ctx.textAlign = 'left';
  ctx.fillText(role, x, y);

  ctx.font = `400 14px ${FONT}`;
  ctx.fillStyle = TEXT_DIM;
  const detail = [mod, dist, angle].filter(Boolean).join(' · ');
  ctx.fillText(detail, x, y + 20);

  if (light.continuous_power_hint) {
    ctx.font = `400 12px ${FONT}`;
    ctx.fillStyle = 'rgba(132,158,184,0.4)';
    ctx.fillText(light.continuous_power_hint, x, y + 36);
  }
}

// ── BTS Card ─────────────────────────────────────────────────────────────────

/**
 * Render a Behind-The-Scenes card.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} opts
 * @param {HTMLImageElement|null} opts.photo — reference image
 * @param {HTMLCanvasElement|null} opts.diagramCanvas — rendered diagram
 * @param {string} opts.pattern
 * @param {number} opts.confidence — 0-1
 * @param {Array} opts.lights — LightPlacement[]
 * @param {object|null} opts.camera — {shutter, aperture, iso, focal_length}
 * @param {{w,h}} opts.format — from FORMATS
 * @param {boolean} opts.branded — true = show NGL brand
 */
export function renderBTSCard(ctx, { photo, diagramCanvas, pattern, confidence, lights = [], camera, format, branded = true }) {
  const { w, h } = format;
  const pad = 40;
  const isVertical = h > w;

  // Background
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);

  // Photo area
  const photoH = isVertical ? Math.round(h * 0.35) : Math.round(h * 0.45);
  if (photo) {
    const aspect = photo.naturalWidth / photo.naturalHeight;
    let dw = w, dh = w / aspect;
    if (dh < photoH) { dh = photoH; dw = photoH * aspect; }
    const dx = (w - dw) / 2, dy = 0;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, photoH);
    ctx.clip();
    ctx.drawImage(photo, dx, dy, dw, dh);
    ctx.restore();
  } else {
    ctx.fillStyle = SURFACE;
    ctx.fillRect(0, 0, w, photoH);
    ctx.font = `500 14px ${FONT}`;
    ctx.fillStyle = TEXT_DIM;
    ctx.textAlign = 'center';
    ctx.fillText('Reference Image', w / 2, photoH / 2);
  }

  // Gradient fade at bottom of photo
  const grad = ctx.createLinearGradient(0, photoH - 60, 0, photoH);
  grad.addColorStop(0, 'rgba(10,10,12,0)');
  grad.addColorStop(1, BG);
  ctx.fillStyle = grad;
  ctx.fillRect(0, photoH - 60, w, 60);

  let y = photoH + 10;

  // Pattern + confidence
  drawPattern(ctx, pad, y, pattern, confidence);
  y += 20;

  // Separator
  y += 16;
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, y);
  ctx.lineTo(w - pad, y);
  ctx.stroke();
  y += 20;

  // Diagram (if available)
  if (diagramCanvas) {
    const diagH = isVertical ? Math.round(h * 0.22) : Math.round(h * 0.28);
    const diagW = w - pad * 2;
    const diagAspect = diagramCanvas.width / diagramCanvas.height;
    let renderW = diagW, renderH = diagW / diagAspect;
    if (renderH > diagH) { renderH = diagH; renderW = diagH * diagAspect; }
    const dx = pad + (diagW - renderW) / 2;

    roundRect(ctx, pad, y, diagW, diagH, 10);
    ctx.fillStyle = SURFACE;
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, pad, y, diagW, diagH, 10);
    ctx.clip();
    ctx.drawImage(diagramCanvas, dx, y + (diagH - renderH) / 2, renderW, renderH);
    ctx.restore();
    y += diagH + 16;
  }

  // Lights list
  const maxLights = isVertical ? 4 : 3;
  const visibleLights = lights.slice(0, maxLights);
  visibleLights.forEach(l => {
    drawLightRow(ctx, pad, y, l, w - pad * 2);
    y += l.continuous_power_hint ? 52 : 40;
  });

  // Camera settings
  if (camera && (camera.aperture || camera.iso || camera.shutter)) {
    y += 8;
    ctx.strokeStyle = BORDER;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(w - pad, y);
    ctx.stroke();
    y += 20;

    ctx.font = `600 11px ${FONT}`;
    ctx.fillStyle = TEXT_DIM;
    ctx.textAlign = 'left';
    ctx.fillText('CAMERA', pad, y);
    y += 18;

    ctx.font = `500 15px ${FONT}`;
    ctx.fillStyle = TEXT;
    const camParts = [
      camera.aperture,
      camera.shutter,
      camera.iso ? `ISO ${camera.iso}` : null,
      camera.focal_length ? `${camera.focal_length}mm` : null,
    ].filter(Boolean);
    ctx.fillText(camParts.join('  ·  '), pad, y);
    y += 20;
  }

  // Brand
  drawBrand(ctx, w / 2, h - 20, branded);
}


// ── Instagram Story Template ─────────────────────────────────────────────────

export function renderStoryTemplate(ctx, { diagramCanvas, pattern, confidence, lights = [], setupSummary, branded = true }) {
  const w = 1080, h = 1920;
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);

  let y = 100;

  // Title
  ctx.font = `600 13px ${FONT}`;
  ctx.fillStyle = ACCENT;
  ctx.textAlign = 'center';
  ctx.letterSpacing = '2px';
  ctx.fillText('LIGHTING SETUP', w / 2, y);
  y += 50;

  // Pattern
  const name = (pattern || 'Unknown').replace(/_/g, ' ');
  ctx.font = `800 52px ${FONT}`;
  ctx.fillStyle = TEXT;
  ctx.fillText(name, w / 2, y);
  y += 24;

  const pct = Math.round((confidence || 0) * 100);
  ctx.font = `700 22px ${FONT}`;
  ctx.fillStyle = confColor(confidence);
  ctx.fillText(`${pct}% confidence`, w / 2, y);
  y += 60;

  // Diagram
  if (diagramCanvas) {
    const diagSize = 700;
    const aspect = diagramCanvas.width / diagramCanvas.height;
    let dw = diagSize, dh = diagSize / aspect;
    if (dh > diagSize) { dh = diagSize; dw = diagSize * aspect; }
    const dx = (w - dw) / 2;

    roundRect(ctx, dx - 10, y - 10, dw + 20, dh + 20, 14);
    ctx.fillStyle = SURFACE;
    ctx.fill();
    ctx.drawImage(diagramCanvas, dx, y, dw, dh);
    y += dh + 40;
  }

  // Light list
  ctx.textAlign = 'left';
  const startX = 80;
  lights.slice(0, 5).forEach(l => {
    const role = (l.label || l.role || '').replace(/_/g, ' ');
    const mod = (l.modifier || '').replace(/_/g, ' ');
    const dist = l.distance_m ? `${(l.distance_m * 3.281).toFixed(0)} ft` : '';

    ctx.font = `700 20px ${FONT}`;
    ctx.fillStyle = TEXT;
    ctx.fillText(role, startX, y);

    ctx.font = `400 17px ${FONT}`;
    ctx.fillStyle = TEXT_DIM;
    ctx.fillText([mod, dist].filter(Boolean).join(' · '), startX, y + 26);
    y += 56;
  });

  // Summary
  if (setupSummary) {
    y += 10;
    ctx.font = `400 16px ${FONT}`;
    ctx.fillStyle = TEXT_DIM;
    ctx.textAlign = 'center';
    ctx.fillText(setupSummary, w / 2, y);
  }

  drawBrand(ctx, w / 2, h - 60, branded);
}


// ── Carousel Slide ───────────────────────────────────────────────────────────

export function renderCarouselSlide(ctx, { light, index, total, pattern, branded = true }) {
  const w = 1080, h = 1080;
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);

  const role = (light.label || light.role || '').replace(/_/g, ' ');
  const mod = (light.modifier || '').replace(/_/g, ' ');
  const dist = light.distance_m ? `${(light.distance_m * 3.281).toFixed(0)} ft` : '';
  const angle = light.angle_deg != null ? `${Math.round(Math.abs(light.angle_deg))}°` : '';
  const height = light.height_m ? `${(light.height_m * 3.281).toFixed(0)} ft high` : '';

  // Slide counter
  ctx.font = `600 14px ${FONT}`;
  ctx.fillStyle = TEXT_DIM;
  ctx.textAlign = 'right';
  ctx.fillText(`${index + 1} / ${total}`, w - 50, 50);

  // Pattern label
  ctx.font = `600 14px ${FONT}`;
  ctx.fillStyle = ACCENT;
  ctx.textAlign = 'left';
  ctx.fillText((pattern || '').replace(/_/g, ' ').toUpperCase(), 50, 50);

  // Role name — big
  let y = h * 0.35;
  ctx.font = `800 64px ${FONT}`;
  ctx.fillStyle = TEXT;
  ctx.textAlign = 'center';
  ctx.fillText(role, w / 2, y);
  y += 50;

  // Modifier
  if (mod) {
    ctx.font = `500 28px ${FONT}`;
    ctx.fillStyle = ACCENT;
    ctx.fillText(mod, w / 2, y);
    y += 50;
  }

  // Stats grid
  const stats = [
    { label: 'DISTANCE', value: dist },
    { label: 'ANGLE', value: angle },
    { label: 'HEIGHT', value: height },
  ].filter(s => s.value);

  const statW = 200;
  const totalW = stats.length * statW;
  let sx = (w - totalW) / 2 + statW / 2;
  y += 20;

  stats.forEach(s => {
    ctx.font = `600 11px ${FONT}`;
    ctx.fillStyle = TEXT_DIM;
    ctx.fillText(s.label, sx, y);

    ctx.font = `700 32px ${FONT}`;
    ctx.fillStyle = TEXT;
    ctx.fillText(s.value, sx, y + 40);
    sx += statW;
  });

  // Power hints
  y += 80;
  if (light.power_hint) {
    ctx.font = `500 18px ${FONT}`;
    ctx.fillStyle = TEXT_DIM;
    ctx.fillText(light.power_hint, w / 2, y);
    y += 30;
  }
  if (light.continuous_power_hint) {
    ctx.font = `400 16px ${FONT}`;
    ctx.fillStyle = 'rgba(132,158,184,0.4)';
    ctx.fillText(light.continuous_power_hint, w / 2, y);
  }

  drawBrand(ctx, w / 2, h - 40, branded);
}


// ── BTS Summary Card ─────────────────────────────────────────────────────────

export function renderBTSSummary(ctx, { photo, diagramCanvas, pattern, confidence, lights = [], branded = true }) {
  const w = 1080, h = 1350;
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, w, h);

  // Hero image — top half
  const photoH = 540;
  if (photo) {
    const aspect = photo.naturalWidth / photo.naturalHeight;
    let dw = w, dh = w / aspect;
    if (dh < photoH) { dh = photoH; dw = photoH * aspect; }
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, photoH);
    ctx.clip();
    ctx.drawImage(photo, (w - dw) / 2, 0, dw, dh);
    ctx.restore();
  }

  // Fade
  const grad = ctx.createLinearGradient(0, photoH - 80, 0, photoH);
  grad.addColorStop(0, 'rgba(10,10,12,0)');
  grad.addColorStop(1, BG);
  ctx.fillStyle = grad;
  ctx.fillRect(0, photoH - 80, w, 80);

  let y = photoH + 10;
  const pad = 50;

  // Pattern
  drawPattern(ctx, pad, y, pattern, confidence);
  y += 30;

  // Two-column: diagram left, gear list right
  const colW = (w - pad * 3) / 2;

  if (diagramCanvas) {
    const diagH = 340;
    const aspect = diagramCanvas.width / diagramCanvas.height;
    let dw = colW, dh = colW / aspect;
    if (dh > diagH) { dh = diagH; dw = diagH * aspect; }

    roundRect(ctx, pad, y, colW, diagH, 10);
    ctx.fillStyle = SURFACE;
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, pad, y, colW, diagH, 10);
    ctx.clip();
    ctx.drawImage(diagramCanvas, pad + (colW - dw) / 2, y + (diagH - dh) / 2, dw, dh);
    ctx.restore();

    // Lights on right
    let ly = y + 10;
    const lx = pad * 2 + colW;
    lights.slice(0, 5).forEach(l => {
      drawLightRow(ctx, lx, ly, l, colW);
      ly += l.continuous_power_hint ? 50 : 38;
    });
  } else {
    // No diagram — full-width gear list
    lights.slice(0, 6).forEach(l => {
      drawLightRow(ctx, pad, y, l, w - pad * 2);
      y += l.continuous_power_hint ? 50 : 38;
    });
  }

  drawBrand(ctx, w / 2, h - 30, branded);
}


// ── Download helper ──────────────────────────────────────────────────────────

export function downloadCanvas(canvas, filename) {
  canvas.toBlob(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 'image/png');
}
