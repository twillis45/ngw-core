/**
 * Categorized modifier catalog with size, shape, and mood affinity metadata.
 * Used by StepGearEntry for selection and by transform.js for size recommendations.
 */

export const MODIFIER_CATALOG = [
  // ── Softboxes ──
  { value: 'softbox_small',  label: 'Softbox 24×24"',    category: 'softboxes', size: '24×24"',  shape: 'rectangular', qualityTag: 'soft', sizeClass: 'small',
    moodAffinity: { beauty: 0.5, cinematic: 0.4, corporate: 0.5, editorial: 0.3, natural: 0.4, high_key: 0.4, low_key: 0.3 } },
  { value: 'softbox',        label: 'Softbox 36×48"',    category: 'softboxes', size: '36×48"',  shape: 'rectangular', qualityTag: 'soft', sizeClass: 'medium',
    moodAffinity: { beauty: 0.8, cinematic: 0.6, corporate: 0.9, editorial: 0.4, natural: 0.8, high_key: 0.7, low_key: 0.5 } },
  { value: 'softbox_large',  label: 'Softbox 48×72"',    category: 'softboxes', size: '48×72"',  shape: 'rectangular', qualityTag: 'soft', sizeClass: 'large',
    moodAffinity: { beauty: 0.9, cinematic: 0.5, corporate: 0.8, editorial: 0.3, natural: 0.9, high_key: 0.9, low_key: 0.4 } },
  { value: 'octabox_small',  label: 'Octabox 32"',       category: 'softboxes', size: '32"',     shape: 'octagonal',   qualityTag: 'soft', sizeClass: 'small',
    moodAffinity: { beauty: 0.7, cinematic: 0.5, corporate: 0.6, editorial: 0.4, natural: 0.6, high_key: 0.5, low_key: 0.4 } },
  { value: 'octabox',        label: 'Octabox 47"',       category: 'softboxes', size: '47"',     shape: 'octagonal',   qualityTag: 'soft', sizeClass: 'medium',
    moodAffinity: { beauty: 0.9, cinematic: 0.6, corporate: 0.8, editorial: 0.4, natural: 0.8, high_key: 0.7, low_key: 0.5 } },
  { value: 'octabox_large',  label: 'Octabox 60"',       category: 'softboxes', size: '60"',     shape: 'octagonal',   qualityTag: 'soft', sizeClass: 'large',
    moodAffinity: { beauty: 0.9, cinematic: 0.5, corporate: 0.7, editorial: 0.3, natural: 0.9, high_key: 0.9, low_key: 0.4 } },

  // ── Stripboxes ──
  { value: 'stripbox',       label: 'Stripbox 12×36"',   category: 'stripboxes', size: '12×36"', shape: 'rectangular', qualityTag: 'medium', sizeClass: 'small',
    moodAffinity: { beauty: 0.7, cinematic: 0.8, corporate: 0.4, editorial: 0.7, natural: 0.3, high_key: 0.3, low_key: 0.8 } },
  { value: 'stripbox_medium',label: 'Stripbox 12×48"',   category: 'stripboxes', size: '12×48"', shape: 'rectangular', qualityTag: 'medium', sizeClass: 'medium',
    moodAffinity: { beauty: 0.7, cinematic: 0.8, corporate: 0.5, editorial: 0.7, natural: 0.3, high_key: 0.3, low_key: 0.8 } },
  { value: 'stripbox_narrow',label: 'Stripbox 9×36"',    category: 'stripboxes', size: '9×36"',  shape: 'rectangular', qualityTag: 'medium', sizeClass: 'small',
    moodAffinity: { beauty: 0.5, cinematic: 0.9, corporate: 0.3, editorial: 0.8, natural: 0.2, high_key: 0.2, low_key: 0.9 } },

  // ── Umbrellas ──
  { value: 'umbrella',            label: 'Shoot-Through 33"',  category: 'umbrellas', size: '33"', shape: 'round', qualityTag: 'soft', sizeClass: 'small',
    moodAffinity: { beauty: 0.5, cinematic: 0.3, corporate: 0.7, editorial: 0.2, natural: 0.7, high_key: 0.6, low_key: 0.2 } },
  { value: 'umbrella_large',     label: 'Shoot-Through 45"',  category: 'umbrellas', size: '45"', shape: 'round', qualityTag: 'soft', sizeClass: 'medium',
    moodAffinity: { beauty: 0.6, cinematic: 0.3, corporate: 0.8, editorial: 0.2, natural: 0.8, high_key: 0.7, low_key: 0.2 } },
  { value: 'umbrella_reflective', label: 'Reflective 43"',    category: 'umbrellas', size: '43"', shape: 'round', qualityTag: 'medium', sizeClass: 'medium',
    moodAffinity: { beauty: 0.6, cinematic: 0.5, corporate: 0.7, editorial: 0.4, natural: 0.5, high_key: 0.5, low_key: 0.4 } },
  { value: 'umbrella_reflective_large', label: 'Reflective 60"', category: 'umbrellas', size: '60"', shape: 'round', qualityTag: 'soft', sizeClass: 'large',
    moodAffinity: { beauty: 0.7, cinematic: 0.4, corporate: 0.7, editorial: 0.3, natural: 0.8, high_key: 0.8, low_key: 0.3 } },

  // ── Beauty Dishes — Profoto ──
  { value: 'profoto_softlight',     label: 'Softlight 20.5"',     category: 'beauty_dishes', vendor: 'Profoto',      size: '20.5"', shape: 'round', qualityTag: 'medium', sizeClass: 'medium',
    moodAffinity: { beauty: 0.9, cinematic: 0.7, corporate: 0.6, editorial: 0.7, natural: 0.4, high_key: 0.5, low_key: 0.5 } },
  { value: 'profoto_ocf_beauty',    label: 'OCF Beauty 24"',      category: 'beauty_dishes', vendor: 'Profoto',      size: '24"',   shape: 'round', qualityTag: 'medium', sizeClass: 'medium',
    moodAffinity: { beauty: 0.9, cinematic: 0.7, corporate: 0.6, editorial: 0.6, natural: 0.5, high_key: 0.5, low_key: 0.5 } },
  // ── Beauty Dishes — Broncolor ──
  { value: 'broncolor_beauty',      label: 'Beauty Dish 20"',     category: 'beauty_dishes', vendor: 'Broncolor',    size: '20"',   shape: 'round', qualityTag: 'medium', sizeClass: 'medium',
    moodAffinity: { beauty: 0.9, cinematic: 0.7, corporate: 0.6, editorial: 0.7, natural: 0.4, high_key: 0.5, low_key: 0.5 } },
  { value: 'broncolor_beautybox',   label: 'Beautybox 65',        category: 'beauty_dishes', vendor: 'Broncolor',    size: '25.6"', shape: 'round', qualityTag: 'soft',   sizeClass: 'medium',
    moodAffinity: { beauty: 0.9, cinematic: 0.6, corporate: 0.7, editorial: 0.5, natural: 0.5, high_key: 0.6, low_key: 0.4 } },
  // ── Beauty Dishes — Paul C. Buff ──
  { value: 'buff_beauty_22',        label: 'Beauty Dish 22"',     category: 'beauty_dishes', vendor: 'Paul C. Buff', size: '22"',   shape: 'round', qualityTag: 'medium', sizeClass: 'medium',
    moodAffinity: { beauty: 0.8, cinematic: 0.6, corporate: 0.5, editorial: 0.6, natural: 0.3, high_key: 0.4, low_key: 0.5 } },
  // ── Beauty Dishes — Godox ──
  { value: 'godox_beauty_16',       label: 'BDR 16.5"',           category: 'beauty_dishes', vendor: 'Godox',        size: '16.5"', shape: 'round', qualityTag: 'medium', sizeClass: 'small',
    moodAffinity: { beauty: 0.8, cinematic: 0.6, corporate: 0.5, editorial: 0.7, natural: 0.3, high_key: 0.4, low_key: 0.5 } },
  { value: 'godox_beauty_21',       label: 'BDR Pro 21"',         category: 'beauty_dishes', vendor: 'Godox',        size: '21"',   shape: 'round', qualityTag: 'medium', sizeClass: 'medium',
    moodAffinity: { beauty: 0.9, cinematic: 0.7, corporate: 0.5, editorial: 0.6, natural: 0.4, high_key: 0.5, low_key: 0.5 } },
  // ── Beauty Dishes — Westcott ──
  { value: 'westcott_beauty_24',    label: 'Switch 24"',          category: 'beauty_dishes', vendor: 'Westcott',     size: '24"',   shape: 'round', qualityTag: 'medium', sizeClass: 'medium',
    moodAffinity: { beauty: 0.9, cinematic: 0.6, corporate: 0.6, editorial: 0.5, natural: 0.5, high_key: 0.5, low_key: 0.4 } },
  { value: 'westcott_beauty_36',    label: 'Switch 36"',          category: 'beauty_dishes', vendor: 'Westcott',     size: '36"',   shape: 'round', qualityTag: 'soft',   sizeClass: 'large',
    moodAffinity: { beauty: 0.8, cinematic: 0.5, corporate: 0.6, editorial: 0.4, natural: 0.6, high_key: 0.6, low_key: 0.3 } },
  // ── Beauty Dishes — Elinchrom ──
  { value: 'elinchrom_softlite_17', label: 'Softlite 17"',        category: 'beauty_dishes', vendor: 'Elinchrom',    size: '17"',   shape: 'round', qualityTag: 'medium', sizeClass: 'small',
    moodAffinity: { beauty: 0.8, cinematic: 0.6, corporate: 0.5, editorial: 0.7, natural: 0.3, high_key: 0.4, low_key: 0.5 } },
  { value: 'elinchrom_softlite_27', label: 'Softlite 27"',        category: 'beauty_dishes', vendor: 'Elinchrom',    size: '27"',   shape: 'round', qualityTag: 'medium', sizeClass: 'medium',
    moodAffinity: { beauty: 0.9, cinematic: 0.7, corporate: 0.6, editorial: 0.6, natural: 0.4, high_key: 0.5, low_key: 0.5 } },
  // ── Beauty Dishes — Mola (deep parabolic) ──
  { value: 'mola_demi',             label: 'Demi 22"',            category: 'beauty_dishes', vendor: 'Mola',         size: '22"',   shape: 'round', qualityTag: 'medium', sizeClass: 'small',
    moodAffinity: { beauty: 0.9, cinematic: 0.7, corporate: 0.5, editorial: 0.8, natural: 0.3, high_key: 0.4, low_key: 0.6 } },
  { value: 'mola_setti',            label: 'Setti 28"',           category: 'beauty_dishes', vendor: 'Mola',         size: '28"',   shape: 'round', qualityTag: 'medium', sizeClass: 'medium',
    moodAffinity: { beauty: 0.9, cinematic: 0.8, corporate: 0.5, editorial: 0.8, natural: 0.4, high_key: 0.5, low_key: 0.6 } },
  { value: 'mola_euro',             label: 'Euro 33.5"',          category: 'beauty_dishes', vendor: 'Mola',         size: '33.5"', shape: 'round', qualityTag: 'soft',   sizeClass: 'medium',
    moodAffinity: { beauty: 0.9, cinematic: 0.7, corporate: 0.6, editorial: 0.7, natural: 0.5, high_key: 0.6, low_key: 0.5 } },
  { value: 'mola_mantti',           label: 'Mantti 40"',          category: 'beauty_dishes', vendor: 'Mola',         size: '40"',   shape: 'round', qualityTag: 'soft',   sizeClass: 'large',
    moodAffinity: { beauty: 0.8, cinematic: 0.6, corporate: 0.7, editorial: 0.6, natural: 0.6, high_key: 0.7, low_key: 0.4 } },

  // ── Control ──
  { value: 'grid_spot',  label: 'Grid / Spot',   category: 'control', size: null, shape: 'conical',  qualityTag: 'hard', sizeClass: null,
    moodAffinity: { beauty: 0.3, cinematic: 0.9, corporate: 0.2, editorial: 0.9, natural: 0.1, high_key: 0.2, low_key: 0.9 } },
  { value: 'grid',       label: 'Honeycomb Grid', category: 'control', size: null, shape: null,       qualityTag: 'hard', sizeClass: null,
    moodAffinity: { beauty: 0.4, cinematic: 0.8, corporate: 0.3, editorial: 0.8, natural: 0.2, high_key: 0.3, low_key: 0.8 } },
  { value: 'snoot',      label: 'Snoot',          category: 'control', size: null, shape: 'conical',  qualityTag: 'hard', sizeClass: null,
    moodAffinity: { beauty: 0.2, cinematic: 0.8, corporate: 0.1, editorial: 0.9, natural: 0.1, high_key: 0.1, low_key: 0.9 } },
  { value: 'barn_doors', label: 'Barn Doors',     category: 'control', size: null, shape: null,       qualityTag: 'hard', sizeClass: null,
    moodAffinity: { beauty: 0.3, cinematic: 0.7, corporate: 0.3, editorial: 0.7, natural: 0.2, high_key: 0.2, low_key: 0.7 } },
  { value: 'gobo',       label: 'Gobo / Pattern',  category: 'control', size: null, shape: null,       qualityTag: 'hard', sizeClass: null,
    moodAffinity: { beauty: 0.4, cinematic: 0.9, corporate: 0.1, editorial: 0.9, natural: 0.1, high_key: 0.1, low_key: 0.9 } },
  { value: 'optical_snoot', label: 'Optical Snoot', category: 'control', size: null, shape: 'conical', qualityTag: 'hard', sizeClass: null,
    moodAffinity: { beauty: 0.3, cinematic: 0.9, corporate: 0.1, editorial: 0.9, natural: 0.1, high_key: 0.1, low_key: 0.9 } },

  // ── Bounce / Diffusion ──
  { value: 'reflector',  label: 'Reflector',  category: 'bounce', size: null, shape: 'round',  qualityTag: 'bounce', sizeClass: null,
    moodAffinity: { beauty: 0.8, cinematic: 0.3, corporate: 0.6, editorial: 0.3, natural: 0.9, high_key: 0.5, low_key: 0.2 } },
  { value: 'v_flat',     label: 'V-Flat',     category: 'bounce', size: null, shape: null,      qualityTag: 'bounce', sizeClass: null,
    moodAffinity: { beauty: 0.6, cinematic: 0.4, corporate: 0.5, editorial: 0.3, natural: 0.7, high_key: 0.6, low_key: 0.3 } },
  { value: 'scrim',      label: 'Scrim',      category: 'bounce', size: null, shape: null,      qualityTag: 'bounce', sizeClass: null,
    moodAffinity: { beauty: 0.5, cinematic: 0.3, corporate: 0.4, editorial: 0.3, natural: 0.8, high_key: 0.5, low_key: 0.2 } },
];

/** Category groups for display */
export const MODIFIER_CATEGORIES = [
  { key: 'softboxes',     label: 'Softboxes',      items: MODIFIER_CATALOG.filter(m => m.category === 'softboxes') },
  { key: 'stripboxes',    label: 'Stripboxes',      items: MODIFIER_CATALOG.filter(m => m.category === 'stripboxes') },
  { key: 'umbrellas',     label: 'Umbrellas',       items: MODIFIER_CATALOG.filter(m => m.category === 'umbrellas') },
  { key: 'beauty_dishes', label: 'Beauty Dishes & Reflectors', items: MODIFIER_CATALOG.filter(m => m.category === 'beauty_dishes') },
  { key: 'control',       label: 'Light Control',   items: MODIFIER_CATALOG.filter(m => m.category === 'control') },
  { key: 'bounce',        label: 'Bounce / Diffusion', items: MODIFIER_CATALOG.filter(m => m.category === 'bounce') },
];

/** Reverse-lookup map */
const MOD_MAP = {};
MODIFIER_CATALOG.forEach(m => { MOD_MAP[m.value] = m; });

/** Legacy aliases so engine tokens still resolve to a concrete model */
const LEGACY_ALIASES = {
  beauty_dish:       'godox_beauty_16',
  beauty_dish_large: 'buff_beauty_22',
};
Object.entries(LEGACY_ALIASES).forEach(([old, cur]) => {
  if (!MOD_MAP[old] && MOD_MAP[cur]) MOD_MAP[old] = MOD_MAP[cur];
});

/** Look up full modifier details by value token */
export function getModifierDetails(value) {
  if (!value) return null;
  // Direct match first (includes legacy aliases)
  if (MOD_MAP[value]) return MOD_MAP[value];
  // Fuzzy: if engine returns bare token like "softbox", match the base (medium) version
  const fuzzy = MODIFIER_CATALOG.find(m => m.value === value || m.value.startsWith(value + '_') || value.startsWith(m.value));
  return fuzzy || null;
}

/** Return the best modifier for a mood from the user's available list */
export function bestModifierForMood(mood, available) {
  if (!available?.length || !mood) return null;
  let best = null;
  let bestScore = -1;
  for (const val of available) {
    const mod = MOD_MAP[val];
    if (!mod) continue;
    const score = mod.moodAffinity?.[mood] ?? 0;
    if (score > bestScore) {
      bestScore = score;
      best = mod;
    }
  }
  return best;
}

/** Recommend a modifier size class based on light-to-subject distance in feet */
export function recommendedSizeClass(distanceFt) {
  if (distanceFt == null) return 'medium';
  if (distanceFt < 3) return 'small';
  if (distanceFt <= 5) return 'medium';
  return 'large';
}
