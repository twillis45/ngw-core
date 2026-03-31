/**
 * Diagram utilities — theme colors, unit formatting, color resolution, print.
 *
 * Colors aligned to the app's warm token palette (tokens.css).
 * Old Tailwind slate values (#334155, #475569, #64748b, etc.) replaced
 * with warm neutrals from the design system.
 */

import {
  LIGHT_COLORS_DARK, LIGHT_COLORS_LIGHT, FONT_STACK, SHORT_MOD,
} from './diagramConstants';

/* ── Theme-aware canvas palette ──────────────────────── */

/**
 * Read the current theme from <html data-theme> and return
 * a full canvas color object. Uses the app's warm tokens
 * instead of Tailwind slate.
 */
export function getThemeColors() {
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  return {
    isDark,
    lightColors: isDark ? LIGHT_COLORS_DARK : LIGHT_COLORS_LIGHT,

    // Text hierarchy — aligned to --color-text / --color-text-secondary / --color-text-dim
    text:           isDark ? '#f2f0eb' : '#1A1814',
    textDim:        isDark ? '#c8c4be' : '#6B6864',
    textFaint:      isDark ? 'rgba(242,240,235,0.55)' : 'rgba(26,24,20,0.45)',

    // Subject figure
    subjectHead:    isDark ? '#c8c4be' : '#D4CFC8',
    subjectBody:    isDark ? '#8a8785' : '#6B6864',

    // Backdrop rectangle
    backdrop:       isDark ? '#2a2c36' : '#D4CFC8',
    backdropBorder: isDark ? '#3a3c46' : '#8C8780',
    backdropText:   isDark ? '#8a8785' : '#6B6864',

    // Grid & structure lines
    gridLine:       isDark ? 'rgba(42,44,54,0.5)'    : 'rgba(140,135,128,0.2)',
    connector:      isDark ? 'rgba(138,135,133,0.3)'  : 'rgba(140,135,128,0.35)',

    // Camera icon
    camera:         isDark ? '#6e6a65' : '#8C8780',
    cameraLens:     isDark ? '#8a8785' : '#6B6864',

    // Marker center dot
    markerDot:      isDark ? '#0f1117' : '#FAFAF8',

    // Floor & eye-level indicators
    floorLine:      isDark ? 'rgba(42,44,54,0.6)'    : 'rgba(140,135,128,0.35)',
    eyeLevel:       isDark ? 'rgba(138,135,133,0.25)' : 'rgba(140,135,128,0.2)',
    eyeLevelText:   isDark ? 'rgba(138,135,133,0.45)' : 'rgba(107,104,100,0.45)',
  };
}

/* ── Color resolution for light roles ────────────────── */

/**
 * Resolve a color for any role, including multi-key variants
 * like key_left, key_right, fill_low, etc.
 */
export function lightColor(role, colors) {
  const lc = colors || LIGHT_COLORS_DARK;
  if (lc[role]) return lc[role];
  if (role.startsWith('key'))  return lc.key;
  if (role.startsWith('fill')) return lc.fill;
  if (role.startsWith('rim'))  return lc.rim;
  if (role.startsWith('hair')) return lc.hair;
  if (role === 'background')   return lc.background;
  return colors ? '#6B6864' : '#8C8780';
}

/* ── Unit formatting ─────────────────────────────────── */

export function mToFt(m) { return (m * 3.281).toFixed(0); }

/** Format a distance label respecting units setting. */
export function fmtDist(m, units) {
  if (units === 'metric') {
    return m < 1 ? `${Math.round(m * 100)} cm` : `${m.toFixed(1)} m`;
  }
  return `${mToFt(m)} ft`;
}

/** Measure pixel width of a formatted distance label at given font. */
export function distLabelWidth(ctx, m, units) {
  return ctx.measureText(fmtDist(m, units)).width;
}

/* ── Responsive font-scale factor ────────────────────── */

/** Compute a font-scale multiplier from canvas width. */
export function fontScale(W) {
  if (W >= 900) return 1.7;
  if (W >= 700) return 1.5;
  if (W >= 600) return 1.35;
  if (W >= 450) return 1.2;
  return 1.0;
}

/* ── Canvas setup helper ─────────────────────────────── */

/**
 * Size a <canvas> element to fit its parent, respecting device pixel ratio.
 * Returns { ctx, W, H, dpr, fs } for the caller to use.
 */
export function setupCanvas(canvas, { heightRatio = 0.65, minH = 260, mobileMinH = 340 } = {}) {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.parentElement?.clientWidth || 340;
  const vh = window.innerHeight || 800;
  const isMobile = W < 600;
  const isDesktop = W >= 768;
  const isLargeDesktop = W >= 1000;
  const maxCanvasH = vh - (isMobile ? 120 : isLargeDesktop ? 60 : isDesktop ? 100 : 260);
  const idealH = Math.round(W * (isMobile ? 1.15 : isLargeDesktop ? 0.85 : isDesktop ? 0.75 : heightRatio));
  const H = Math.max(Math.min(idealH, maxCanvasH), isMobile ? mobileMinH : minH);
  const fs = fontScale(W);

  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  return { ctx, W, H, dpr, fs, isMobile, isDesktop, isLargeDesktop };
}

/* ── Print / export ──────────────────────────────────── */

export function handlePrint(canvasEl, spec, title, view) {
  if (!canvasEl) return;
  const imgSrc = canvasEl.toDataURL('image/png');
  const lights = spec?.lights || [];

  const legendRows = lights.map(l => {
    const color = lightColor(l.role, LIGHT_COLORS_DARK); // always use dark palette for print
    const roleName = (l.label || l.role).replace(/_/g, ' ');
    const modText = SHORT_MOD[l.modifier] || (l.modifier || '').replace(/_/g, ' ');
    const detail = [
      modText,
      l.distance_m ? `${(l.distance_m * 3.281).toFixed(0)} ft` : '',
      `${Math.round(Math.abs(l.angle_deg ?? l.angle ?? 0))}\u00b0`,
      `${((l.height_m || 1.7) * 3.281).toFixed(0)} ft high`,
    ].filter(Boolean).join(' \u00b7 ');
    return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;font-size:13px;">
      <span style="width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0;display:inline-block;"></span>
      <span><strong style="text-transform:capitalize;">${roleName}</strong>${detail ? ' — ' + detail : ''}</span>
    </div>`;
  }).join('');

  const patternLabel = spec?.pattern
    ? spec.pattern.charAt(0).toUpperCase() + spec.pattern.slice(1).replace(/[-_]/g, ' ')
    : '';
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
