/**
 * Studio Matte — shared design tokens for Day1DemoApp screens.
 *
 * Single source of truth for all inline-style values.
 * CSS-variable equivalents live in tokens.css under "Studio Matte" block.
 *
 * Figma source: YQgGd8KZyZoXzZwJV7p4b6 / Studio Matte Theme
 */

// ─── Steel-blue tint helper ───────────────────────────────────────────────────
// Base RGB: 95, 124, 150  →  var(--sm-steel-r/g/b) in CSS
export const steel = (a) => `rgba(95,124,150,${a})`;

// ─── Color palette ────────────────────────────────────────────────────────────
export const C = {
  // ── Surface ──
  bg:          '#000001',           // --sm-bg
  slotBg:      '#08080a',           // --sm-surface-slot
  panelBg:     '#0f1013',           // --sm-surface
  pillBg:      '#070709',           // --sm-surface-pill
  ctaFrom:     '#3d404d',           // --sm-surface-cta-from
  ctaMid:      '#292b36',
  ctaTo:       '#1c1d24',           // --sm-surface-cta-to

  // ── Text ──
  textPrimary: 'rgba(245,247,250,0.95)',  // --sm-text-primary
  textSub:     'rgba(184,191,199,0.65)',  // --sm-text-sub
  textSubBold: 'rgba(184,191,199,0.85)',  // --sm-text-sub-bold
  textMeta:    '#a7adb7',                 // --sm-text-meta
  textDim:     'rgba(184,191,199,0.5)',   // --sm-text-dim
  textWarn:    'rgba(245,190,71,0.65)',

  // ── Confidence ──
  confHigh:    'rgba(72,186,136,0.95)',   // --sm-conf-high  (= --color-success)
  confHighBar: 'rgba(72,186,136,0.8)',
  confLow:     'rgba(245,190,72,0.9)',    // --sm-conf-low
  confLowBar:  'rgba(245,190,71,0.8)',
  confLowScore:'rgba(245,190,71,0.9)',

  // ── Structural ──
  homeBar:     'rgba(245,247,250,0.06)',
  divider:     'rgba(255,255,255,0.04)',  // --sm-divider
  barTrack:    'rgba(184,191,199,0.08)',  // --sm-bar-track
  barAlt:      'rgba(184,191,199,0.25)',

  // ── Danger ──
  textDanger:  'rgba(200,70,70,0.82)',
};

// ─── Typography ───────────────────────────────────────────────────────────────
export const FONT_SMOOTH = {
  WebkitFontSmoothing: 'antialiased',
  MozOsxFontSmoothing: 'grayscale',
  textRendering:       'geometricPrecision',
};

// ─── Panel shadow + bevel (Figma 1515:2) ─────────────────────────────────────
export const PANEL_SHADOW = '1px 2px 4px 0px rgba(0,0,0,0.2), 2px 4px 12px 0px rgba(0,0,0,0.4)';
export const PANEL_BEVEL  = 'inset -1px -1px 2px 0px rgba(0,0,0,0.12), inset 1px 1px 0px 0px rgba(255,255,255,0.05)';

// ─── Engraved label text shadow ───────────────────────────────────────────────
// Dark top-edge shadow (light source above) + faint bottom reflection = pressed
// into surface. Use on LIGHTING, ANALYZE, ANALYZING, and any all-caps engraved label.
// CSS-variable equivalent: --sm-text-shadow-engraved in tokens.css
export const TEXT_SHADOW_ENGRAVED = '0 -1px 1px rgba(0,0,0,0.75), 0 1px 0 rgba(255,255,255,0.05), 0 0 2px rgba(0,0,0,0.35)';

// ─── CTA button (Figma 1494:12) ───────────────────────────────────────────────
export const CTA_BG     = `linear-gradient(141.71deg, ${C.ctaFrom} 0%, ${C.ctaMid} 50%, ${C.ctaTo} 100%)`;
export const CTA_SHADOW = `0px 0px 6px 1px ${steel(0.08)}, 1px 2px 4px 0px rgba(0,0,0,0.45), 2px 5px 12px 0px rgba(0,0,0,0.7)`;
export const CTA_BEVEL  = 'inset -1px -1px 2px 0px rgba(0,0,0,0.3), inset 1px 1px 0px 0px rgba(255,255,255,0.2)';

// ─── Viewfinder layers (shared HomeScreen ↔ ResultScreen) ────────────────────
// Directional inset — light comes from 141.71° (upper-left), so the near rim
// (upper-left) casts a hard dark shadow into the well while the far rim
// (lower-right) picks up a faint steel-blue bounce. Reads as a recessed well
// machined into the matte metal surface.
export const VIEWFINDER_INNER_SHADOW = [
  'inset 5px 6px 16px 0px rgba(0,0,0,0.88)',
  'inset 3px 4px 9px 0px rgba(0,0,0,0.70)',
  'inset 2px 2px 4px 0px rgba(0,0,0,0.55)',
  'inset 1px 1px 2px 0px rgba(0,0,0,0.50)',
  'inset -1px -1px 1px 0px rgba(255,255,255,0.05)',
  'inset -2px -2px 5px 0px rgba(95,124,150,0.07)',
  'inset 0px 0px 24px 0px rgba(95,124,150,0.05)',
  'inset 0px 0px 12px 0px rgba(95,124,150,0.07)',
].join(', ');

export const GLASS_REFLECTION = [
  'linear-gradient(141.71deg,',
  'rgba(255,255,255,0.36) 0%,',
  'rgba(255,255,255,0.30) 2%,',
  'rgba(255,255,255,0.24) 4%,',
  'rgba(255,255,255,0.19) 6.5%,',
  'rgba(255,255,255,0.15) 9%,',
  'rgba(255,255,255,0.12) 12%,',
  'rgba(255,255,255,0.095) 16%,',
  'rgba(255,255,255,0.075) 20%,',
  'rgba(255,255,255,0.058) 25%,',
  'rgba(255,255,255,0.044) 30%,',
  'rgba(255,255,255,0.034) 36%,',
  'rgba(255,255,255,0.025) 42%,',
  'rgba(255,255,255,0.018) 48%,',
  'rgba(255,255,255,0.013) 54%,',
  'rgba(255,255,255,0.015) 62%,',
  'rgba(255,255,255,0.020) 68%,',
  'rgba(255,255,255,0.015) 74%,',
  'rgba(255,255,255,0.006) 80%,',
  'rgba(255,255,255,0) 86%)',
].join(' ');

export const LENS_VIGNETTE = 'radial-gradient(ellipse 100% 90% at center, transparent 52%, rgba(0,0,0,0.08) 76%, rgba(0,0,0,0.22) 100%)';

// ─── Metallic chevron (glossy embossed icon treatment) ────────────────────────
export const METALLIC_CHEVRON = {
  backgroundImage: 'linear-gradient(141.71deg, rgba(40,44,52,0.95) 0%, rgba(70,78,90,0.90) 30%, rgba(25,28,34,0.85) 55%, rgba(55,62,72,0.80) 75%, rgba(20,22,28,0.90) 100%)',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
  ...FONT_SMOOTH,
  filter: 'drop-shadow(0px 1px 1px rgba(0,0,0,0.6)) drop-shadow(0px -1px 0px rgba(255,255,255,0.10)) drop-shadow(0px 0px 2px rgba(95,124,150,0.12))',
};

// ─── Neumorphic button states ─────────────────────────────────────────────────
// Raised tile — primary action (New Photo / Retake). Use on the dominant button
// in a bottom-actions trough. Two variants: neutral steel and amber-warm tint.
export const BTN_RAISED_UP = [
  '0px 6px 16px 0px rgba(0,0,0,0.8)',
  '0px 3px 6px 0px rgba(0,0,0,0.6)',
  '0px 1px 2px 0px rgba(0,0,0,0.4)',
  `inset 0px 1.5px 0px 0px rgba(255,255,255,0.18)`,
  'inset 0px -1.5px 0px 0px rgba(0,0,0,0.45)',
  `inset 0px 0px 16px 0px rgba(95,124,150,0.07)`,
  '0px 0px 0px 0.5px rgba(0,0,0,0.5)',
].join(', ');

export const BTN_RAISED_DOWN = [
  '0px 0px 2px 0px rgba(0,0,0,0.5)',
  'inset 0px 2px 4px 0px rgba(0,0,0,0.6)',
  'inset 0px 1px 2px 0px rgba(0,0,0,0.4)',
  'inset 0px -0.5px 0px 0px rgba(255,255,255,0.04)',
].join(', ');

// Recessed tile — secondary action (Save / Set up anyway). Resting state must
// show visible inset shadow so it reads as "sunk" next to the raised button.
export const BTN_RECESSED_UP = [
  'inset 0px 2px 5px 0px rgba(0,0,0,0.55)',
  'inset 0px 1px 2px 0px rgba(0,0,0,0.35)',
  'inset 0px -0.5px 0px 0px rgba(255,255,255,0.03)',
].join(', ');

export const BTN_RECESSED_DOWN = [
  'inset 0px 3px 7px 0px rgba(0,0,0,0.7)',
  'inset 0px 1px 3px 0px rgba(0,0,0,0.5)',
].join(', ');

// ─── Green toggle (settings toggles) ─────────────────────────────────────────
export const GREEN        = 'rgba(72,186,136,0.9)';
export const GREEN_DIM    = 'rgba(72,186,136,0.18)';
export const GREEN_BORDER = 'rgba(72,186,136,0.2)';
