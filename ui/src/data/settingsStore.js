/**
 * NGW Settings Store
 *
 * localStorage-backed settings for adjustable UI preferences.
 * Settings are applied via data-attributes on <html> so CSS can react.
 */

const STORAGE_KEY = 'ngw_settings';

/** Available font-size presets — label + CSS class suffix */
export const FONT_SIZES = [
  { id: 'xs',     label: 'XS' },
  { id: 'small',  label: 'S' },
  { id: 'medium', label: 'M' },
  { id: 'large',  label: 'L' },
  { id: 'xl',     label: 'XL' },
];

/** Available density presets */
export const DENSITY_OPTIONS = [
  { id: 'compact',     label: 'Compact',     description: 'More content, tighter spacing' },
  { id: 'comfortable', label: 'Comfortable', description: 'Default spacing' },
  { id: 'spacious',    label: 'Spacious',    description: 'More breathing room' },
];

/**
 * Photographer-friendly font families.
 * Each maps to a CSS font-stack via [data-font-family] in tokens.css.
 */
export const FONT_FAMILIES = [
  { id: 'system', label: 'System' },
  { id: 'inter',  label: 'Sans' },
  { id: 'source', label: 'Source' },
  { id: 'mono',   label: 'Mono' },
  { id: 'serif',  label: 'Serif' },
];

/** Available unit systems */
export const UNIT_OPTIONS = [
  { id: 'imperial', label: 'Feet / Inches' },
  { id: 'metric',   label: 'Meters / cm' },
];

/** Available diagram style options */
export const DIAGRAM_STYLE_OPTIONS = [
  { id: 'standard', label: 'Standard' },
  { id: 'minimal',  label: 'Minimal' },
];

/** Available power display options */
export const POWER_DISPLAY_OPTIONS = [
  { id: 'fraction', label: '1/4, 1/2' },
  { id: 'stops',    label: 'Stops' },
  { id: 'percent',  label: 'Percent' },
];

/** Bottom nav display style */
export const NAV_STYLE_OPTIONS = [
  { id: 'both',       label: 'Icons + Labels' },
  { id: 'icons',      label: 'Icons Only' },
  { id: 'labels',     label: 'Labels Only' },
];

/** Default settings */
const DEFAULTS = {
  // ── Appearance (applied via data-attributes on <html> for CSS) ──────────
  fontSize: 'medium',             // 'xs' | 'small' | 'medium' | 'large' | 'xl'
  fontFamily: 'system',           // 'system' | 'inter' | 'source' | 'mono' | 'serif'
  density: 'comfortable',         // 'compact' | 'comfortable' | 'spacious'

  // ── Shooting preferences (legacy, preserved for hook consumers) ──────────
  units: 'imperial',              // 'imperial' | 'metric'
  powerDisplay: 'fraction',       // 'fraction' | 'stops' | 'percent'
  showConfidenceScore: true,      // legacy: show numeric confidence in results
  autoSaveSetups: false,          // legacy: auto-save after every recommendation

  // ── Experience ───────────────────────────────────────────────────────────
  viewMode: 'full',               // 'quick' | 'full'
  guidanceLevel: 'guided',        // 'minimal' | 'guided' | 'full'
  confidenceDisplay: 'simple',    // 'simple' | 'numeric' | 'detailed'
  comparisonPrompts: 'auto',      // 'auto' | 'low_conf_only' | 'off'
  shootModeStyle: 'step',         // 'checklist' | 'step'

  // ── Intelligence ─────────────────────────────────────────────────────────
  autonomyLevel: 'manual',        // 'manual' | 'assisted' | 'adaptive'
  fixGuidanceStyle: 'balanced',   // 'quick' | 'balanced' | 'detailed'
  patternSensitivity: 'balanced', // 'strict' | 'balanced' | 'flexible'
  explanationDepth: 'standard',   // 'brief' | 'standard' | 'technical'

  // ── Privacy ──────────────────────────────────────────────────────────────
  allowLearning: true,            // contribute session data to improvement
  allowAnalytics: true,           // allow anonymous usage analytics
  sessionStorage: 'auto',         // 'auto' | 'manual' | 'off'
  imageHandling: 'store',         // 'store' | 'delete'

  // ── Interaction ──────────────────────────────────────────────────────
  hapticFeedback: true,           // vibrate on key interactions (mobile)
  navStyle: 'both',               // 'both' | 'icons' | 'labels'

  // ── Advanced ─────────────────────────────────────────────────────────────
  uiSelfTuning: false,            // allow UI to adjust layout/flow automatically
  experimentParticipation: false, // opt in to A/B experiments
  showDebugSignals: false,        // show vision signal debug overlay
  stabilityMode: true,            // prevent auto-adjustments from stacking
};

/** Load all settings, merged with defaults. */
export function loadSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { ...DEFAULTS, ...stored };
  } catch {
    return { ...DEFAULTS };
  }
}

/** Notify hook subscribers — lazy-imported to avoid circular deps. */
let _notifyFn = null;
function _notify() {
  if (_notifyFn) { _notifyFn(); return; }
  import('../hooks/useSettings.js').then(m => {
    _notifyFn = m.notifySettingsChanged;
    _notifyFn();
  }).catch(() => {});
}

/** Save a single setting. Immediately applies DOM data-attributes so CSS responds. */
export function saveSetting(key, value) {
  const settings = loadSettings();
  settings[key] = value;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  applySettings(settings);
  _notify();
}

/** Save all settings at once. Immediately applies DOM data-attributes. */
export function saveSettings(settings) {
  const merged = { ...DEFAULTS, ...settings };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  applySettings(merged);
  _notify();
}

/** Reset to defaults. */
export function resetSettings() {
  localStorage.removeItem(STORAGE_KEY);
  applySettings(DEFAULTS);
  _notify();
}

/** Font-size → scale multiplier for Studio Matte screens (px-based).
 *  Legacy screens use CSS variables; Studio Matte uses inline px so we
 *  set a CSS custom property that components can multiply against. */
const FONT_SCALE = { xs: 0.85, small: 0.92, medium: 1.0, large: 1.08, xl: 1.16 };

/**
 * Apply settings to the DOM so CSS can respond.
 * Sets data-font-size, data-font-family, data-density on <html>.
 * Also sets --font-scale CSS property for Studio Matte px-based scaling.
 */
export function applySettings(settings) {
  const s = settings || loadSettings();
  document.documentElement.setAttribute('data-font-size', s.fontSize || 'medium');
  document.documentElement.setAttribute('data-font-family', s.fontFamily || 'system');
  document.documentElement.setAttribute('data-density', s.density || 'comfortable');
  // Reduce motion — disables animations globally via CSS
  if (s.reduceMotion) {
    document.documentElement.setAttribute('data-reduce-motion', '');
  } else {
    document.documentElement.removeAttribute('data-reduce-motion');
  }
  // Font scale for Studio Matte (px-based screens).
  // Set as CSS custom property — components read it via getFontScale()
  // or CSS var(--font-scale). NOT applied as global zoom because that
  // breaks fixed-viewport layout (HomeScreen uses stableVH + position:fixed).
  const scale = FONT_SCALE[s.fontSize] || 1;
  document.documentElement.style.setProperty('--font-scale', String(scale));
}

/** Get the current font scale multiplier. */
export function getFontScale() {
  const s = loadSettings();
  return FONT_SCALE[s.fontSize] || 1;
}
