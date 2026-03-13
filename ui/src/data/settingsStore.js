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

/** Default settings */
const DEFAULTS = {
  fontSize: 'medium',      // 'small' | 'medium' | 'large'
  fontFamily: 'system',    // 'system' | 'inter' | 'source' | 'mono' | 'serif'
  density: 'comfortable',  // 'compact' | 'comfortable' | 'spacious'
  showBuildInfo: true,      // show version in welcome screen
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

/** Save a single setting. */
export function saveSetting(key, value) {
  const settings = loadSettings();
  settings[key] = value;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

/** Save all settings at once. */
export function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULTS, ...settings }));
}

/** Reset to defaults. */
export function resetSettings() {
  localStorage.removeItem(STORAGE_KEY);
  applySettings(DEFAULTS);
}

/**
 * Apply settings to the DOM so CSS can respond.
 * Sets data-font-size, data-font-family, and data-density on <html>.
 */
export function applySettings(settings) {
  const s = settings || loadSettings();
  document.documentElement.setAttribute('data-font-size', s.fontSize || 'medium');
  document.documentElement.setAttribute('data-font-family', s.fontFamily || 'system');
  document.documentElement.setAttribute('data-density', s.density || 'comfortable');
}
