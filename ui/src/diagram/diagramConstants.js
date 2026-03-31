/**
 * Diagram constants — color palettes, modifier labels, role descriptions.
 *
 * Colors are aligned to the app's warm token palette (tokens.css),
 * not the old Tailwind slate/blue-grey values.
 */

/* ── Light-role colors (per-role, per-theme) ─────────── */

/** Dark theme — vibrant on dark warm backgrounds */
export const LIGHT_COLORS_DARK  = {
  key:        '#f59e0b',  // --color-key (amber)
  fill:       '#3b82f6',  // --color-fill (blue)
  rim:        '#a855f7',  // --color-rim (purple)
  background: '#10b981',  // --color-bg-light (emerald)
  hair:       '#ec4899',  // --color-hair (pink)
};

/** Light theme — deeper, higher-contrast versions */
export const LIGHT_COLORS_LIGHT = {
  key:        '#b45309',
  fill:       '#1d4ed8',
  rim:        '#7c3aed',
  background: '#059669',
  hair:       '#be185d',
};

/* ── Font stack (matches tokens.css --font-family) ────── */

export const FONT_STACK = `"Geist", -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, sans-serif`;

/* ── Modifier abbreviations for legend ──────────────── */

export const SHORT_MOD = {
  softbox: 'Softbox', softbox_rect: 'Rect Softbox', umbrella: 'Umbrella',
  beauty_dish: 'Beauty Dish', grid_spot: 'Grid', grid: 'Grid',
  stripbox: 'Strip', barn_doors: 'Barndoors', snoot: 'Snoot',
  bare: 'Bare', bare_bulb: 'Bare', strobe_bare: 'Bare',
  ring_flash: 'Ring Flash', ring_light: 'Ring Light', macro_ring_flash: 'Macro Ring Flash',
};

/* ── One-line role descriptions for the legend ──────── */

export const ROLE_DESC = {
  key:        'primary source — shapes the face',
  fill:       'lifts shadow contrast',
  rim:        'separates subject from background',
  hair:       'adds crown separation',
  background: 'exposes the backdrop',
  accent:     'adds edge or depth detail',
};
