/**
 * NGW Mode Registry
 *
 * Central definitions for all app modes, their metadata, access rules,
 * and enablement strategy. Import helpers to query available modes
 * without scattering mode logic across the codebase.
 */

// ── App Modes ────────────────────────────────────────────

export const APP_MODES = {
  build: {
    id: 'build',
    label: 'Build From Scratch',
    tagline: 'Pick the vibe, we build the setup',
    icon: 'lightbulb',
    access: 'public',
    featureFlag: null,
    entryAction: 'wizard',
    entryScreen: null,
    wizardSteps: ['mood', 'subject', 'environment', 'gear_question'],
    resultCTAs: ['shoot'],
    requiresResult: false,
  },
  match: {
    id: 'match',
    label: 'Match a Look',
    tagline: 'Upload a photo, we decode the light',
    icon: 'camera',
    access: 'public',
    featureFlag: null,
    entryAction: 'upload',
    entryScreen: 'ref_eval',
    wizardSteps: ['subject', 'environment', 'gear_question'],
    resultCTAs: ['shoot', 'shot_match'],
    requiresResult: false,
  },
  shot_match: {
    id: 'shot_match',
    label: 'Shot Match',
    tagline: 'Compare your attempt to the reference',
    icon: 'compare',
    access: 'public',
    featureFlag: 'enable_shot_match',
    entryAction: 'screen',
    entryScreen: 'shot_match',
    wizardSteps: [],
    resultCTAs: [],
    requiresResult: false,
  },
  shoot: {
    id: 'shoot',
    label: 'Shoot Mode',
    tagline: 'On-set assistant for your session',
    icon: 'target',
    access: 'public',
    featureFlag: null,
    entryAction: 'screen',
    entryScreen: 'shoot_mode',
    wizardSteps: [],
    resultCTAs: ['shot_match'],
    requiresResult: true,
  },
  lab: {
    id: 'lab',
    label: 'NGW Lab',
    tagline: 'Internal dev tools',
    icon: 'beaker',
    access: 'admin',
    featureFlag: 'enable_lab',
    entryAction: 'screen',
    entryScreen: 'lab',
    wizardSteps: [],
    resultCTAs: [],
    requiresResult: false,
  },
};

// ── Master Mode IDs (cross-cutting) ─────────────────────

export const MASTER_MODE_IDS = [
  'hurley',
  'adler',
  'heisler',
  'bryce',
  'caravaggio',
  'penn',
  'karsh',
  'leibovitz',
];

// ── Helpers ──────────────────────────────────────────────

/** All modes visible on the home screen (public + not result-gated). */
export function getHomeModes() {
  return Object.values(APP_MODES).filter(
    m => m.access === 'public' && !m.requiresResult,
  );
}

/** Modes requiring admin/dev access. */
export function getAdminModes() {
  return Object.values(APP_MODES).filter(m => m.access === 'admin');
}

/** Look up a single mode by id. */
export function getMode(id) {
  return APP_MODES[id] || null;
}

/** CTA mode ids available from a given mode's results screen. */
export function getModeResultCTAs(modeId) {
  return APP_MODES[modeId]?.resultCTAs || [];
}

/** All mode ids. */
export function getAllModeIds() {
  return Object.keys(APP_MODES);
}
