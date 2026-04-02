/**
 * NGW Feature Flags
 *
 * Simple localStorage-backed feature flag system.
 * Flags control mode availability and optional features.
 *
 * Defaults are baked in — override per-device via localStorage
 * or at runtime via setFlag().
 */

const DEFAULTS = {
  enable_lab: false,
  enable_shot_match: true,
  enable_master_mode: true,
  enable_reference_compare: false,
  enable_taxonomy_editor: false,
  enable_rule_editor: false,
};

const STORAGE_KEY = 'ngw_feature_flags';

/** Return merged default + stored flags. */
export function getFlags() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { ...DEFAULTS, ...stored };
  } catch {
    return { ...DEFAULTS };
  }
}

/** Persist a single flag value. */
export function setFlag(key, value) {
  const flags = getFlags();
  flags[key] = value;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(flags));
}

/** Check if a specific flag is enabled. */
export function isEnabled(flagKey) {
  return getFlags()[flagKey] ?? false;
}

/**
 * Check if a mode (from modeRegistry) is enabled.
 * Modes with no featureFlag are always enabled.
 */
export function isModeEnabled(mode) {
  if (!mode.featureFlag) return true;
  return isEnabled(mode.featureFlag);
}

/** Reset all flags to defaults (useful for testing). */
export function resetFlags() {
  localStorage.removeItem(STORAGE_KEY);
}
