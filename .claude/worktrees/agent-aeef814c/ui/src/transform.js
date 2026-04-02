/** Transform the raw /recommend API response into photographer-friendly fields.
 *  This is the critical translation layer between the scoring engine
 *  and the UI cards. */

import { getCoaching, buildTestSteps } from './coaching';
import { getModifierDetails, recommendedSizeClass } from './data/modifierCatalog';
import { formatRoomDim } from './utils/units';

/* ── helpers ────────────────────────────────────────────── */

function metersToFeet(m) {
  return (m * 3.281).toFixed(1);
}

/**
 * Convert the metric area suffix that lighting system names carry in the
 * database (e.g. "Large Studio (>40 m²)") to imperial sq ft when the user
 * has chosen imperial units.  The m² token can appear as-is or inside a
 * nested parenthetical like "(Small Studio (<40 m²))".
 *
 * Leaves the string unchanged for metric users.
 */
function adaptSystemName(name, units, skinTone) {
  if (!name) return name;
  let out = name;
  // When skin tone is mixed (multiple subjects), replace the single-person
  // skin tone parenthetical with "Multiple Subjects" so the title is accurate.
  if (skinTone === 'mixed') {
    out = out.replace(/\s*\((Light|Medium|Dark)\s+Skin\)/gi, ' (Multiple Subjects)');
  }
  if (units !== 'imperial') return out;
  return out.replace(/([<>≤≥]?)(\d+(?:\.\d+)?)\s*m²/g, (_, op, num) => {
    const sqFt = Math.round(parseFloat(num) * 10.764);
    return `${op}${sqFt} sq ft`;
  });
}

function modifierLabel(token) {
  const map = {
    beauty_dish:  'Beauty Dish',
    softbox:      'Softbox',
    softbox_rect: 'Rectangular Softbox',
    umbrella:     'Shoot-Through Umbrella',
    reflector:    'Reflector',
    grid_spot:    'Grid Spot',
    grid:         'Honeycomb Grid',
    stripbox:     'Strip Box',
    barn_doors:   'Barn Doors',
    snoot:        'Snoot',
    bare:             'Bare Bulb',
    hard_source:      'Hard Source (Fresnel / Standard Reflector)',
    ring_flash:       'Ring Flash',
    ring_light:       'Ring Light',
    macro_ring_flash: 'Macro Ring Flash',
    unknown:          'Modifier Not Detected',
  };
  return map[token] || token.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function positionText(light) {
  const deg = light.angle_deg;
  let side = 'directly ahead of subject';
  if (deg > 5) side = `${Math.round(deg)}\u00b0 camera-right`;
  else if (deg < -5) side = `${Math.round(Math.abs(deg))}\u00b0 camera-left`;

  let height = 'at eye level';
  if (light.height_m > 1.9) height = 'above head height';
  else if (light.height_m > 1.7) height = 'slightly above eye level';
  else if (light.height_m < 1.4) height = 'below eye level';

  return `${side}, ${height}`;
}

/**
 * Power hint data keyed by role + pattern.
 * Each returns { fraction, stops, percent, tip }.
 * The `tip` is extra context appended in all modes.
 */
function powerHintData(role, pattern) {
  if (role === 'key') {
    // Key is the reference — "stops" means stops below full (strobe) power, not below exposure
    return { fraction: '1/4 power', stops: '\u20132 stops from full', percent: '25%', tip: 'adjust to taste' };
  }
  if (role === 'fill') {
    if (pattern === 'Clamshell' || pattern === 'Butterfly')
      return { fraction: '1/8\u20131/16', stops: '1\u20132 stops below key', percent: '12\u201306%', tip: 'ratio control' };
    if (pattern === 'Split')
      return { fraction: '1/32', stops: '3 stops below key', percent: '3%', tip: 'deep shadow (or none)' };
    return { fraction: '1/16', stops: '2 stops below key', percent: '6%', tip: '' };
  }
  if (role === 'rim' || role === 'hair') {
    if (pattern === 'Clamshell' || pattern === 'Butterfly')
      return { fraction: '1/8\u20131/16', stops: '1\u20132 stops below key', percent: '12\u201306%', tip: 'subtle separation' };
    if (pattern === 'Split')
      return { fraction: 'match key or \u00BD stop below', stops: 'match key or \u00BD stop below', percent: 'match key or \u00BD stop below', tip: 'crisp edge' };
    if (pattern === 'Rembrandt' || pattern === 'Loop')
      return { fraction: '1/8', stops: '1 stop below key', percent: '12%', tip: 'edge separation' };
    return { fraction: '1/8', stops: '1 stop below key', percent: '12%', tip: 'adjust for separation' };
  }
  return { fraction: '1/4 power', stops: '\u20132 stops from full', percent: '25%', tip: '' };
}

/**
 * Format a power hint for the selected display mode.
 * Exported so cards can call it reactively with useSettings().
 * @param {string} role - light role
 * @param {string} pattern - lighting pattern name
 * @param {'fraction'|'stops'|'percent'} [mode='fraction']
 * @returns {string}
 */
export function powerHint(role, pattern, mode, fStop) {
  const d = powerHintData(role, pattern);
  const display = mode || 'fraction';

  // In stops mode with a meter-reading f-stop, show the concrete aperture value
  // as the primary reference — far more actionable than abstract strobe fractions.
  if (display === 'stops' && fStop) {
    if (role === 'key') return `${fStop} target · adjust to taste`;
    const stopsText = d.stops; // e.g. "2 stops below key"
    return d.tip ? `${fStop} · ${stopsText} for ${d.tip}` : `${fStop} · ${stopsText}`;
  }

  let base;
  if (display === 'stops') base = d.stops;
  else if (display === 'percent') base = d.percent;
  else base = d.fraction;

  if (role === 'key') return `Start at ${base}, ${d.tip}`;
  return d.tip ? `${base} for ${d.tip}` : base;
}

/**
 * Convert an engine-generated power_hint string to the user's preferred display format.
 * Used for diagram spec power_hint values that come from the backend.
 * @param {string} hint - raw power hint text (e.g. "f/8 · match right key", "½ key power")
 * @param {'fraction'|'stops'|'percent'} mode
 * @returns {string}
 */
export function formatEnginePowerHint(hint, mode) {
  if (!hint || !mode || mode === 'fraction') return hint;
  // Engine hints use fraction notation — convert common patterns
  const conversions = [
    { re: /1\/1\b/g, stops: 'full (0 stops)', percent: '100%' },
    { re: /1\/2\b/g, stops: '\u20131 stop', percent: '50%' },
    { re: /½/g,      stops: '\u20131 stop', percent: '50%' },
    { re: /1\/4\b/g, stops: '\u20132 stops', percent: '25%' },
    { re: /¼/g,      stops: '\u20132 stops', percent: '25%' },
    { re: /1\/8\b/g, stops: '\u20133 stops', percent: '12%' },
    { re: /1\/16\b/g, stops: '\u20134 stops', percent: '6%' },
    { re: /1\/32\b/g, stops: '\u20135 stops', percent: '3%' },
    { re: /1\/64\b/g, stops: '\u20136 stops', percent: '1.5%' },
    { re: /1\/128\b/g, stops: '\u20137 stops', percent: '0.8%' },
  ];
  let out = hint;
  for (const c of conversions) {
    out = out.replace(c.re, mode === 'stops' ? c.stops : c.percent);
  }
  return out;
}

const F_STOPS = ['f/1.4', 'f/2', 'f/2.8', 'f/4', 'f/5.6', 'f/8', 'f/11', 'f/16', 'f/22'];

function parseKeyFStop(apertureStr) {
  // Extract the first f-stop value from a range like "f/2.8 – f/5.6"
  const match = (apertureStr || '').match(/f\/([\d.]+)/);
  if (!match) return null;
  const val = parseFloat(match[1]);
  // Find closest standard f-stop index
  const stops = [1.4, 2, 2.8, 4, 5.6, 8, 11, 16, 22];
  let best = 0;
  for (let i = 1; i < stops.length; i++) {
    if (Math.abs(stops[i] - val) < Math.abs(stops[best] - val)) best = i;
  }
  return best;
}

function meterReading(role, pattern, keyFStopIdx) {
  if (keyFStopIdx == null) return null;
  if (role === 'key') return F_STOPS[keyFStopIdx];

  let stopsBelow = 1; // default
  if (role === 'fill') {
    if (pattern === 'Clamshell' || pattern === 'Butterfly') stopsBelow = 1;
    else if (pattern === 'Split') stopsBelow = 3;
    else stopsBelow = 2;
  } else if (role === 'rim' || role === 'hair') {
    if (pattern === 'Clamshell' || pattern === 'Butterfly') stopsBelow = 2;
    else if (pattern === 'Split') stopsBelow = 0;
    else stopsBelow = 1;
  }

  const idx = keyFStopIdx - stopsBelow;
  if (idx < 0) return F_STOPS[0] + ' or wider';
  if (idx >= F_STOPS.length) return F_STOPS[F_STOPS.length - 1];
  return F_STOPS[idx];
}

function reliabilityFromConfidence(score) {
  if (score >= 90) return { dots: 5, label: 'Consistent' };
  if (score >= 75) return { dots: 4, label: 'Consistent' };
  if (score >= 55) return { dots: 3, label: 'Partial' };
  if (score >= 35) return { dots: 2, label: 'Weak' };
  return { dots: 1, label: 'Weak' };
}

/* ── ceiling category conversion ───────────────────────── */

/**
 * Convert exact ceiling height in feet to the categorical value
 * used by the legacy ceiling picker.
 * @param {number} ceilingFt
 * @returns {string} 'under_8' | '8_9' | '10_12' | '12_plus'
 */
export function ceilingFtToCategory(ceilingFt) {
  if (ceilingFt < 8) return 'under_8';
  if (ceilingFt < 10) return '8_9';
  if (ceilingFt < 12) return '10_12';
  return '12_plus';
}

/* ── space check ───────────────────────────────────────── */

/**
 * Build space requirements from lights, optionally comparing to actual room.
 * @param {Array} lights - light specs with distance_m and height_m
 * @param {{ lengthFt: number, widthFt: number, ceilingFt: number }} [roomDimensions]
 * @returns {object}
 */
function buildSpaceCheck(lights, roomDimensions, units = 'imperial') {
  let maxDist = 0;
  let maxHeight = 0;
  for (const l of lights) {
    if (l.distance_m > maxDist) maxDist = l.distance_m;
    if (l.height_m > maxHeight) maxHeight = l.height_m;
  }

  const depthM = maxDist + 2.0 + 0.5;
  const widthM = maxDist * 2 + 1.0;
  const ceilingM = maxHeight + 0.5;

  const minWidthFt = parseFloat(metersToFeet(widthM));
  const minDepthFt = parseFloat(metersToFeet(depthM));
  const minCeilingFt = parseFloat(metersToFeet(ceilingM));

  // Format a feet value for display in the user's preferred units
  const fmtFt = (ft) => formatRoomDim(ft, units);

  const warnings = [];
  if (ceilingM > 2.6) {
    warnings.push(
      `If your ceiling is under ${fmtFt(parseFloat(metersToFeet(ceilingM)))}: ` +
      'lower tall lights or angle them down 30\u00b0'
    );
  }

  const result = {
    minWidthFt:   String(minWidthFt),
    minDepthFt:   String(minDepthFt),
    minCeilingFt: String(minCeilingFt),
    warnings,
  };

  // Room-fit comparison when actual dimensions are available
  if (roomDimensions && roomDimensions.lengthFt && roomDimensions.widthFt && roomDimensions.ceilingFt) {
    const ceilingFits = roomDimensions.ceilingFt >= minCeilingFt;
    const widthFits = roomDimensions.widthFt >= minWidthFt;
    const depthFits = roomDimensions.lengthFt >= minDepthFt;
    const fits = ceilingFits && widthFits && depthFits;

    const issues = [];
    if (!ceilingFits) {
      issues.push(
        `Ceiling is ${fmtFt(roomDimensions.ceilingFt)} but setup needs ${fmtFt(minCeilingFt)} — ` +
        'lower tall lights or angle them down'
      );
    }
    if (!widthFits) {
      issues.push(
        `Room width is ${fmtFt(roomDimensions.widthFt)} but setup needs ${fmtFt(minWidthFt)} — ` +
        'move lights closer to subject'
      );
    }
    if (!depthFits) {
      issues.push(
        `Room depth is ${fmtFt(roomDimensions.lengthFt)} but setup needs ${fmtFt(minDepthFt)} — ` +
        'move camera closer or use a longer lens'
      );
    }

    result.roomFit = { fits, ceilingFits, widthFits, depthFits, issues };
  }

  return result;
}

/* ── key distances ─────────────────────────────────────── */

function buildKeyDistances(coaching, specLights) {
  const distances = {};

  if (coaching?.subject?.distanceFromBackground) {
    distances.subjectToBackground = coaching.subject.distanceFromBackground;
  }

  const keyLight = (specLights || []).find(l => l.role === 'key');
  if (keyLight) {
    distances.keyLightToSubject = `${metersToFeet(keyLight.distance_m)} ft`;
  }

  if (coaching?.camera?.distanceFromSubject) {
    distances.cameraToSubject = coaching.camera.distanceFromSubject;
  }

  return Object.keys(distances).length > 0 ? distances : null;
}

/* ── photographer-friendly rationale ───────────────────── */

const MOOD_RATIONALE = {
  beauty: {
    single:    '{name} gives you that clean, even wrap you need for beauty work. {modifier} on the key keeps skin smooth and catchlights natural.{pattern}',
    two_light: '{name} nails the classic beauty setup \u2014 {modifier} on the key for flawless skin, fill to open the shadows just enough to keep dimension.{pattern}',
    full:      '{name} is your go-to beauty rig. {modifier} on the key wraps the face, fill controls the ratio, and a rim separates hair from the background.{pattern}',
    default:   '{name} delivers the soft, even light that beauty work demands. {modifier} is the modifier that makes this look work.{pattern}',
  },
  cinematic: {
    single:    '{name} gives you that dramatic one-light look \u2014 {modifier} shapes the shadows for maximum mood.{pattern}',
    two_light: '{name} creates classic cinematic contrast. {modifier} on the key carves the face while the rim gives you edge separation.{pattern}',
    full:      '{name} is a full cinematic rig \u2014 {modifier} on the key for dramatic sculpting, controlled fill, and a rim that pops the subject.{pattern}',
    default:   '{name} delivers the bold, contrasty light that makes portraits feel like film stills. {modifier} is what shapes the look.{pattern}',
  },
  corporate: {
    single:    '{name} keeps it clean and professional. {modifier} on one well-placed light gives you an approachable headshot.{pattern}',
    two_light: '{name} is a reliable two-light corporate setup \u2014 {modifier} on the key for even illumination, fill to kill harsh shadows.{pattern}',
    full:      '{name} gives you the full professional treatment. {modifier} on the key, gentle fill, and a hair light for separation.{pattern}',
    default:   '{name} delivers clean, professional light. {modifier} is the modifier that keeps everyone looking their best.{pattern}',
  },
  editorial: {
    single:    '{name} keeps it bold and graphic. {modifier} creates the strong shadows and clean edges that make editorial work pop.{pattern}',
    two_light: '{name} gives you striking editorial contrast \u2014 {modifier} on the key for graphic shadows, plus a rim for that fashion-forward edge.{pattern}',
    full:      '{name} is a complete editorial setup. {modifier} on the key for bold shadows, clean highlights, and enough dimension to make the styling sing.{pattern}',
    default:   '{name} creates the bold, stylized look editorial demands. {modifier} shapes the shadows that define this style.{pattern}',
  },
  natural: {
    single:    '{name} gives you that beautiful window-light feel. {modifier} positioned right looks like the sun is doing all the work.{pattern}',
    two_light: '{name} mimics natural light perfectly \u2014 {modifier} on the key feels like a window, plus a subtle fill to keep shadows open.{pattern}',
    full:      '{name} builds a convincing natural-light scene. {modifier} on the key feels like a window, fill bounces like a wall.{pattern}',
    default:   '{name} creates that organic, window-lit quality. {modifier} is what sells the natural look.{pattern}',
  },
  high_key: {
    single:    '{name} gives you a clean high-key starting point. {modifier} for big, even light plus a bright background.{pattern}',
    two_light: '{name} delivers that classic high-key look \u2014 {modifier} on the key for even coverage, background blown 1\u20132 stops over.{pattern}',
    full:      '{name} is the full high-key treatment. {modifier} on the key for even front light, blown background, accurate skin tones.{pattern}',
    default:   '{name} creates bright, airy results. {modifier} is the key to even, wraparound coverage.{pattern}',
  },
  low_key: {
    single:    '{name} is all about that single dramatic source \u2014 {modifier} carves the subject out of darkness.{pattern}',
    two_light: '{name} creates moody, controlled low-key light. {modifier} on the key sculpts the face while the rim barely separates from the dark background.{pattern}',
    full:      '{name} builds a complete low-key scene \u2014 {modifier} on the key for dramatic sculpting, surgical rim, background falls to black.{pattern}',
    default:   '{name} delivers dark, moody portraits. {modifier} controls exactly where the light falls.{pattern}',
  },
};

function buildRationale(winner, mood, spec, pattern) {
  const name = winner.system_name || winner.system_id;
  const moodKey = mood || 'corporate';
  const templates = MOOD_RATIONALE[moodKey] || MOOD_RATIONALE.corporate;

  const lights = spec?.lights || [];
  const hasRim = lights.some(l => l.role === 'rim' || l.role === 'hair');
  const keyLight = lights.find(l => l.role === 'key');
  const keyMod = keyLight ? modifierLabel(keyLight.modifier) : 'Softbox';

  let variant = 'default';
  if (lights.length === 1) variant = 'single';
  else if (lights.length === 2) variant = 'two_light';
  else if (lights.length >= 3 && hasRim) variant = 'full';

  // Pattern comes from the backend — frontend does not classify
  const patternText = pattern ? ` This is a ${pattern} lighting pattern.` : '';

  const template = templates[variant] || templates.default;
  return template
    .replace(/\{name\}/g, name)
    .replace(/\{modifier\}/g, keyMod)
    .replace(/\{pattern\}/g, patternText);
}

/* ── skin-tone light adjustments ────────────────────────── */

function buildSkinToneAdjustments(skinTone, mood, lights) {
  if (!skinTone) return null;

  const numLights = (lights || []).length;
  const hasRim = (lights || []).some(l => l.role === 'rim' || l.role === 'hair');

  const adjustments = {
    light: {
      exposure: '+0 to +1/3 stop — lighter skin reflects more; meter carefully to avoid blowout',
      modifier: 'Large, soft modifier to minimize specular highlights',
      whiteBalance: 'Standard daylight (5500K) or slightly warm (5600–5800K)',
      fillRatio: numLights >= 2 ? 'Subtle fill (2:1 ratio) — skin naturally bounces light' : null,
      rimNote: hasRim ? 'Reduce rim by 1/2 stop — rim can clip quickly on lighter skin' : null,
      keyTip: 'Watch histogram highlights — pull back power if right edge clips',
    },
    medium: {
      exposure: 'Meter at rated value — medium tones sit in the ideal exposure zone',
      modifier: 'Medium softbox or beauty dish for balanced shadow definition',
      whiteBalance: 'Daylight (5500K) or match ambient — most versatile range',
      fillRatio: numLights >= 2 ? 'Standard 2:1 to 3:1 fill ratio for natural dimension' : null,
      rimNote: hasRim ? 'Rim at standard power for clean separation' : null,
      keyTip: 'Grey card recommended — AWB can skew warm with golden undertones',
    },
    dark: {
      exposure: '+2/3 to +1 stop over meter reading — cameras routinely underexpose dark skin',
      modifier: 'Large softbox with grid — soft and wrap-around, controlled spill',
      whiteBalance: 'Daylight (5500K) or slightly cool (5200–5400K) to retain skin richness',
      fillRatio: numLights >= 2 ? 'Lower ratio (1.5:1 to 2:1) — deep shadows lose detail fast' : null,
      rimNote: hasRim ? 'Rim light critical for separation — keep at standard or +1/3 stop' : null,
      keyTip: 'Expose for the face — ETTR (expose to the right) is your friend',
    },
    mixed: {
      exposure: 'Expose for the darkest subject (+2/3 to +1 stop) — lighter subjects will be fine; underexposing dark skin cannot be fixed in post',
      modifier: 'Largest soft modifier available (>100cm) — maximizes wrap and even coverage across all subjects',
      whiteBalance: 'Lock WB to daylight (5500K) before the first frame — never use AWB across a multi-subject session',
      fillRatio: numLights >= 2 ? 'Generous fill (1.5:1 to 2:1) — compresses the tonal range between subjects without flattening shape' : null,
      rimNote: hasRim ? 'Set rim for darkest subject; pull lighter subjects back 1/2–1 stop if rim clips their skin' : null,
      keyTip: 'Position darkest subject closest to the key (or largest modifier) — use distance to manage relative brightness across subjects without power changes',
    },
  };

  const data = adjustments[skinTone];
  if (!data) return null;

  const tips = [
    { label: 'Exposure', value: data.exposure },
    { label: 'Modifier', value: data.modifier },
    { label: 'White Balance', value: data.whiteBalance },
  ];
  if (data.fillRatio) tips.push({ label: 'Fill Ratio', value: data.fillRatio });
  if (data.rimNote)  tips.push({ label: 'Rim Light', value: data.rimNote });
  if (data.keyTip)   tips.push({ label: 'Subject Position', value: data.keyTip });

  // Mixed-tone: add multi-subject workflow notes
  const mixedNote = skinTone === 'mixed'
    ? 'Flag or gobo lighter subjects if they\'re reading hot after you lock exposure for the darkest — a small negative flag is faster than a power change. For sequential headshots: dial in on the darkest subject first, chimp after each subsequent subject, and adjust via distance or flag before touching power. Keep WB locked for the entire run.'
    : null;

  return { skinTone, tips, mixedNote };
}

/* ── quick-fix priority ranking ─────────────────────────── */

/**
 * Rank quick fixes by relevance to the current setup.
 * Returns the same array shape but with `priority` (1-3 = top, null = normal)
 * and `tag` (short reason it's prioritised).
 */
function rankQuickFixes(fixes, ctx) {
  if (!fixes || !fixes.length) return [];
  const { numLights = 1, pattern = null, mood = null, hasRim = false } = ctx || {};

  // keyword → relevance condition
  const rules = [
    { kw: /fill/i,       test: () => numLights >= 2, tag: 'Multi-light setup' },
    { kw: /rim|hair/i,   test: () => hasRim,         tag: 'Rim light active' },
    { kw: /separation/i, test: () => numLights === 1, tag: 'Single-light setup' },
    { kw: /harsh/i,      test: () => mood === 'beauty' || mood === 'corporate', tag: `${mood} priority` },
    { kw: /flat/i,       test: () => mood === 'beauty' || mood === 'corporate', tag: `${mood} priority` },
    { kw: /dramatic/i,   test: () => mood === 'dramatic' || mood === 'editorial', tag: `${mood} priority` },
    { kw: /glare|glass/i,test: () => mood === 'corporate', tag: 'Corporate priority' },
    { kw: /background/i, test: () => mood === 'high_key' || mood === 'low_key', tag: `${mood} priority` },
    { kw: /spill/i,      test: () => mood === 'low_key',  tag: 'Low-key priority' },
    { kw: /natural|window/i, test: () => mood === 'natural', tag: 'Natural priority' },
    { kw: /color|gel/i,  test: () => mood === 'natural',  tag: 'Mixed-light priority' },
  ];

  let priorityCount = 0;
  return fixes.map(f => {
    const text = f.problem + ' ' + f.fix;
    const matched = rules.find(r => r.kw.test(text) && r.test());
    if (matched && priorityCount < 3) {
      priorityCount++;
      return { ...f, priority: priorityCount, tag: matched.tag };
    }
    return { ...f, priority: null, tag: null };
  });
}

/* ── reference-analysis coaching ────────────────────────── */

/**
 * Build test steps derived from the reference photo analysis.
 * These supplement (or replace) the generic mood-based test steps.
 */
export function buildRefTestSteps(lightingRead, recreationSetup) {
  if (!lightingRead && !recreationSetup) return [];
  const lr = lightingRead || {};
  const rs = recreationSetup || {};
  const steps = [];

  steps.push('Key only \u2014 all other lights off');

  if (lr.source_quality === 'hard') {
    steps.push('Shadows should be sharp \u2014 move source back or use smaller modifier if soft');
  } else if (lr.source_quality === 'soft') {
    steps.push('Shadows should be gradual \u2014 bring source closer or use larger modifier if harsh');
  }

  if (lr.shadow_pattern && lr.shadow_pattern !== 'unknown') {
    const pat = lr.shadow_pattern.replace(/[-_]/g, ' ');
    steps.push(`Match ${pat} pattern \u2014 adjust key position until shadows match ref`);
  }

  if (lr.fill_presence === 'none') {
    steps.push('No fill \u2014 shadow side should go dark like ref');
  } else if (lr.fill_presence === 'subtle' || lr.fill_presence === 'moderate') {
    steps.push('Add fill \u2014 match shadow depth to ref, adjust distance for ratio');
  }

  if (typeof lr.light_count === 'number' && lr.light_count >= 2) {
    steps.push('Add accent lights one at a time, check each against ref');
  }

  if (rs.background_strategy) {
    steps.push(`Background: ${rs.background_strategy}`);
  }

  steps.push('Test shot \u2014 compare shadow shape, contrast & mood to ref');

  return steps;
}

/**
 * Build quick-fix suggestions derived from the reference photo analysis.
 * These are appended to the mood-based fixes.
 */
export function buildRefQuickFixes(lightingRead, recreationSetup) {
  if (!lightingRead && !recreationSetup) return [];
  const lr = lightingRead || {};
  const rs = recreationSetup || {};
  const fixes = [];

  if (lr.source_quality === 'hard') {
    fixes.push({
      problem: 'Shadow edges are too soft',
      fix: 'Use a smaller source, move it further from the subject, or remove diffusion',
    });
    fixes.push({
      problem: 'Shadows are too sharp or unflattering',
      fix: 'Add a thin diffusion panel between the source and subject, or increase source size slightly',
    });
  }

  if (lr.source_quality === 'soft') {
    fixes.push({
      problem: 'Light looks too flat or shapeless',
      fix: 'Move the key light further to the side or add a grid to control spill',
    });
  }

  if (lr.fill_presence === 'none') {
    fixes.push({
      problem: 'Shadows are too deep for your taste',
      fix: 'Add a white bounce card opposite the key \u2014 start far away and bring it closer until you like the fill level',
    });
  }

  if (lr.shadow_pattern === 'gobo') {
    fixes.push({
      problem: 'Projected pattern is too broad or diffuse',
      fix: 'Narrow the gobo opening, or move the source further from the gobo and closer to the subject',
    });
    fixes.push({
      problem: 'Pattern edges are too sharp',
      fix: 'Move the gobo further from the light source, or add a subtle diffusion behind the gobo',
    });
  }

  if (lr.tonal_processing_notes?.toLowerCase().includes('b&w')) {
    fixes.push({
      problem: 'Hard to judge exposure without color',
      fix: 'Shoot in color first, then convert to B&W in post. This gives you more editing latitude and control',
    });
  }

  if (rs.fill_strategy?.includes('negative fill')) {
    fixes.push({
      problem: 'Background is lifting too much',
      fix: 'Increase subject-to-background distance, flag the key to prevent spill, or reduce ambient light in the room',
    });
  }

  return fixes.map(f => ({ ...f, priority: null, tag: null }));
}

/* ── main transform ─────────────────────────────────────── */

export function transformForUI(apiResponse, mood, skinTone, { powerDisplay, units = 'imperial' } = {}) {
  const sel = apiResponse.result.structured.selection;
  const winner = sel.winner;
  const picks = sel.top_picks || [];
  const spec = apiResponse.result.diagram_spec;
  const confScore = winner.confidence?.score ?? apiResponse.result.confidence ?? 0;

  const coaching = getCoaching(mood);
  const keyDistances = buildKeyDistances(coaching, spec.lights);

  // Pattern comes from the backend — no frontend inference fallback
  const lightingPattern = apiResponse.result?.authoritative_pattern || null;

  // Build modifier summary for each light
  const modifierSummary = (spec.lights || []).map(l => ({
    role: l.role.charAt(0).toUpperCase() + l.role.slice(1),
    modifier: modifierLabel(l.modifier),
  }));

  // Engine confidence is the source of truth (solver-informed).
  // reliabilityFromConfidence uses 0–100 internally; reliabilityScore is
  // normalized to 0–1 so all display components (LookSummaryCard, confidence
  // explainer, symptom engine, etc.) use a consistent fractional scale.
  const reliability = reliabilityFromConfidence(confScore);

  // Best Match card
  const bestMatch = {
    name: adaptSystemName(winner.system_name || winner.system_id, units, skinTone),
    systemId: winner.system_id,
    reliabilityScore: confScore / 100,
    reliabilityDots: reliability.dots,
    reliabilityLabel: reliability.label,
    rationale: buildRationale(winner, mood, spec, lightingPattern),
    keyDistances,
    lightingPattern,
    modifierSummary,
  };

  // Shoot This Setup card — one entry per light
  const keyFStopIdx = parseKeyFStop(coaching.camera?.aperture);
  const setupLights = (spec.lights || []).map(l => {
    const modDetails = getModifierDetails(l.modifier);
    const distFt = parseFloat(metersToFeet(l.distance_m));
    const recSize = recommendedSizeClass(distFt);
    let modifierSizeNote = null;
    if (modDetails?.sizeClass && modDetails.sizeClass !== recSize) {
      const sizeLabels = { small: 'a small', medium: 'a medium', large: 'a large' };
      modifierSizeNote = `Consider ${sizeLabels[recSize] || 'a medium'} modifier at this distance for best coverage`;
    }
    return {
      role: l.role,
      label: l.label || l.role.charAt(0).toUpperCase() + l.role.slice(1) + ' Light',
      positionText: positionText(l),
      distanceFt: `${metersToFeet(l.distance_m)} ft`,
      distanceM: `${l.distance_m.toFixed(1)} m`,
      modifier: modDetails ? modDetails.label : modifierLabel(l.modifier),
      modifierSize: modDetails?.size || null,
      modifierSizeNote,
      powerHint: powerHint(l.role, lightingPattern, powerDisplay),
      _role: l.role,                 // kept for reactive re-render in cards
      _modifierType: l.modifier,     // raw API modifier key — used by RecommendedKitsCard
      _lightingPattern: lightingPattern, // kept for reactive re-render in cards
      meterReading: meterReading(l.role, lightingPattern, keyFStopIdx),
      notes: l.notes || [],
    };
  });

  // Alternatives
  const alternatives = picks.slice(1).map(p => {
    const bd = p.breakdown;
    const gap = winner.final_score - bd.final_score;
    return {
      name: adaptSystemName(bd.system_name || bd.system_id, units, skinTone),
      gap: gap.toFixed(1),
      gapLabel: gap < 3 ? 'Close alternative' : gap < 8 ? 'Viable option' : 'Budget option',
      tradeoff: p.reason || '',
    };
  });

  return {
    bestMatch,
    setup: { lights: setupLights },
    spaceCheck: buildSpaceCheck(spec.lights || [], undefined, units),
    diagram: spec,
    cameraSettings: coaching.camera,
    subject: coaching.subject || null,
    background: coaching.background || null,
    testSteps: buildTestSteps((spec.lights || []).length),
    goodSigns: coaching.goodSigns,
    warnings: coaching.warnings,
    quickFixes: rankQuickFixes(coaching.quickFixes, {
      numLights: (spec.lights || []).length,
      pattern: lightingPattern,
      mood,
      hasRim: (spec.lights || []).some(l => l.role === 'rim' || l.role === 'hair'),
    }),
    alternatives,
    mood,
    skinToneAdjustments: buildSkinToneAdjustments(skinTone, mood, spec.lights),
  };
}

/** Transform /api/shoot-match response into the shape ResultsScreen expects.
 *  @param {Object} apiResponse – raw response from POST /api/shoot-match
 *  @param {Object} [ctx]       – extra context from the wizard (mood, skinTone)
 */
export function transformShootMatch(apiResponse, ctx = {}) {
  const c = apiResponse.cards;
  const mood = ctx.mood || 'corporate';
  const skinTone = ctx.skinTone || null;
  const powerDisplay = ctx.powerDisplay || 'fraction';
  const units = ctx.units || 'imperial';

  // Re-use coaching data for subject/background/camera guidance
  const coaching = getCoaching(mood);

  // Pattern comes from the backend — no frontend inference fallback
  const lightingPattern = apiResponse.authoritative_pattern
    || c.howToTest?.pattern
    || null;

  // Modifier summary for each light
  const modifierSummary = (c.diagram?.lights || []).map(l => ({
    role: l.role.charAt(0).toUpperCase() + l.role.slice(1),
    modifier: modifierLabel(l.modifier),
  }));

  // Engine confidence is the source of truth (solver-informed).
  // reliabilityFromConfidence uses 0–100 internally; reliabilityScore is
  // normalized to 0–1 so all display components use a consistent fractional scale.
  const confScore = c.bestMatch.reliability || 0;
  const reliability = reliabilityFromConfidence(confScore);

  // Derive reference analysis data early — used both for aperture override
  // (which drives keyFStopIdx + power hints) and background distance.
  // referenceImageAnalysis in the shoot-match response is the _build_reference_analysis()
  // summary dict (keys: palette, classification, referenceRead, ...).  It does NOT have
  // the "description.referenceAnalysis" wrapper that the /upload-reference endpoint uses.
  // Geometry-inferred camera settings live at referenceRead.recreation.{aperture,setupFamily}.
  const _refImg = apiResponse.referenceImageAnalysis;
  // Legacy path kept for ReferenceEvalScreen / any cached responses that still carry the
  // upload-reference model_dump structure.
  const refAnalysis = _refImg?.description?.referenceAnalysis ?? null;

  // Geometry-inferred aperture from reference analysis overrides the mood-based
  // default when a reference image was analysed.  A full-body frame returns
  // "f/8–11" while the cinematic/natural mood tables would otherwise give "f/2–f/4",
  // producing nonsensical power-hint math.  WB is overridden with the detected
  // colour temperature so the blueprint stays grounded in the actual reference.
  // Geometry-inferred aperture and setup family come from referenceRead.recreation
  // in the shoot-match response (serialized by _build_reference_read_summary()).
  // Fall back to the legacy model_dump path for upload-reference cached responses.
  const _recRec     = _refImg?.referenceRead?.recreation;
  const refAperture    = _recRec?.aperture    || refAnalysis?.recreation_setup?.aperture    || null;
  const refSetupFamily = _recRec?.setupFamily || refAnalysis?.recreation_setup?.setup_family || null;
  // CCT source priority:
  //   1. lightingIntelligence.detectedCCT — engine path via lighting_inference.py
  //   2. vlmReconstruction dominant_cct_kelvin — numeric, always computed by vision pipeline
  // Both are numeric Kelvin values from the same analysis run.
  const _vlmCCT = apiResponse.vlmReconstruction?.primary_reconstruction?.dominant_cct_kelvin
               || apiResponse.vlmReconstruction?.primary?.dominant_cct_kelvin
               || apiResponse.vlmReconstruction?.dominant_cct_kelvin
               || null;
  const detectedCCT = apiResponse.lightingIntelligence?.detectedCCT || _vlmCCT || null;
  const effectiveAperture = refAperture || c.cameraSettings?.aperture;

  const keyFStopIdx = parseKeyFStop(effectiveAperture);

  // WB derivation — three-tier priority:
  //   1. detectedCCT from engine (numeric Kelvin, most accurate)
  //   2. setup_family fallback (when CCT classifier returned a string and was
  //      silently dropped — derive a sensible default from light source type)
  //   3. Leave as mood-based default (no reference image, or unknown family)
  const _SETUP_FAMILY_WB = {
    // Strobe / flash families → 5500 K
    beauty_clamshell:       '5500 K',
    beauty_dish_strobe:     '5500 K',
    strobe_softbox:         '5500 K',
    strobe_umbrella:        '5500 K',
    strobe_beauty:          '5500 K',
    ring_light:             '5500 K',
    gobo_projection:        '5500 K',
    slit_flag_projection:   '5500 K',
    projected_shadow_pattern: '5500 K',
    dramatic_chiaroscuro:   '5500 K',
    // Natural / window light → daylight-ish but cooler
    natural_window_key:     '5500–6500 K (match window)',
    natural_window_light:   '5500–6500 K (match window)',
    natural_ambient:        '5500–6500 K (available light)',
    window_portrait:        '5500–6500 K (match window)',
    // Outdoor
    outdoor_natural:        '5600–6200 K (daylight)',
    golden_hour:            '3500–4500 K (warm)',
    overcast_natural:       '6000–7000 K (overcast)',
    // Continuous / tungsten-leaning sources
    continuous_soft:        '3200–5600 K (match source)',
    tungsten_hard:          '3200 K',
  };
  const familyWB = refSetupFamily ? (_SETUP_FAMILY_WB[refSetupFamily] || null) : null;

  // Effective WB for blueprint — engine CCT wins, family fallback when engine has none.
  const effectiveWB = detectedCCT ? `${detectedCCT} K` : familyWB;

  // Build final cameraSettings — start from the pattern/mood base, then overlay
  // any reference-analysis overrides so the blueprint is always reference-aware.
  const _baseCam = c.cameraSettings || coaching.camera || null;
  const effectiveCameraSettings = _baseCam ? {
    ..._baseCam,
    // Normalize backend's white_balance key → wb for DiagramCard / WBSpectrum
    ...(_baseCam.white_balance && !_baseCam.wb ? { wb: _baseCam.white_balance } : {}),
    ...(refAperture  ? { aperture: refAperture }         : {}),
    ...(effectiveWB  ? { wb: effectiveWB }               : {}),
  } : null;

  // Derive background distance from reference analysis when available.
  // The recreation_setup.background_strategy describes the actual background
  // relationship from the reference image — use it to override coaching defaults.
  const bgStrategy = refAnalysis?.recreation_setup?.background_strategy || '';
  const bgRelationship = refAnalysis?.image_read?.background_relationship || '';
  const bgHint = (bgStrategy + ' ' + bgRelationship).toLowerCase();
  // VLM background_distance_category: "close" | "moderate" | "far" | "infinity"
  const vlmBgDist = apiResponse.vlmReconstruction?.primary?.background_distance_category
    || apiResponse.vlmReconstruction?.background_distance_category || '';
  let subjectToBackground = c.spaceCheck?.subjectToBackground || (coaching.subject?.distanceFromBackground || null);
  if (bgHint.includes('against') || bgHint.includes('directly behind') || bgHint.includes('flush')
      || bgHint.includes('touching') || bgHint.includes('zero distance') || bgHint.includes('on the wall')
      || vlmBgDist === 'close') {
    subjectToBackground = '0–2 ft (subject against background)';
  } else if (bgHint.includes('close behind') || bgHint.includes('near the background') || bgHint.includes('close to')) {
    subjectToBackground = '1–3 ft (close to background)';
  } else if (vlmBgDist === 'moderate') {
    subjectToBackground = '4–8 ft';
  } else if (vlmBgDist === 'far' || vlmBgDist === 'infinity') {
    subjectToBackground = '10+ ft (far background)';
  }

  // Compute setup lights up-front so we can reconcile diagram.lights modifiers below.
  const BARE_MOD_TOKENS = ['unknown', 'bare', 'bare_bulb', 'direct', 'none', ''];
  const setupLights = (c.shootThisSetup.lights || []).map(l => {
    const role = (l.role || 'key').toLowerCase().replace(/ light$/, '');
    const rawMod = (l.modifier || '').toLowerCase().trim();
    const modifier = BARE_MOD_TOKENS.includes(rawMod) && role === 'key'
      ? (refAnalysis?.recreation_setup?.modifier_suggestion || l.modifier || '')
      : l.modifier;
    return {
      role,
      label: l.role,
      positionText: `${l.position}, ${l.height}`,
      distanceFt: l.distance,
      distanceM: l.distance,
      modifier,
      powerHint: l.notes?.[0] || powerHint(role, lightingPattern, powerDisplay),
      _role: role,
      _lightingPattern: lightingPattern,
      meterReading: meterReading(role, lightingPattern, keyFStopIdx),
      notes: l.notes || [],
    };
  });

  // Keep diagram.lights in sync with setup.lights so both cards always reflect the
  // same physical setup. When the engine returns a bare/unknown modifier for the key
  // light we substitute the reference-analysis suggestion in setup.lights; patch the
  // same index in diagram so the diagram icon matches.
  const reconciledDiagram = (() => {
    const d = c.diagram;
    if (!d?.lights?.length) return d;
    const lights = d.lights.map((dl, i) => {
      const sl = setupLights[i];
      if (!sl) return dl;
      const rawMod = (dl.modifier || '').toLowerCase().trim();
      if (BARE_MOD_TOKENS.includes(rawMod) && sl.role === 'key') {
        return { ...dl, modifier: sl.modifier };
      }
      return dl;
    });
    return { ...d, lights };
  })();

  return {
    gearMatch: apiResponse.gearMatch || null,
    bestMatch: {
      name: adaptSystemName(c.bestMatch.name, units, skinTone),
      systemId: c.diagram?.systemId,
      reliabilityScore: confScore / 100,
      reliabilityDots: reliability.dots,
      reliabilityLabel: reliability.label,
      rationale: c.whyThisWorks.body,
      difficulty: c.bestMatch.difficulty,
      setupTime: c.bestMatch.setupTime,
      lightingPattern,
      modifierSummary,
      masterMode: c.bestMatch.masterMode || null,
      masterModeLabel: c.bestMatch.masterModeLabel || null,
      masterModeIcon: c.bestMatch.masterModeIcon || null,
      lightsGuide: c.bestMatch.lightsGuide || null,
      keyDistances: {
        subjectToBackground,
        keyLightToSubject: c.spaceCheck?.maxDistanceFt ? `${c.spaceCheck.maxDistanceFt} ft` : null,
        cameraToSubject: coaching.camera?.distanceFromSubject || null,
      },
    },

    setup: { lights: setupLights },

    spaceCheck: c.diagram?.lights
      ? buildSpaceCheck(c.diagram.lights, undefined, units)
      : {
          minWidthFt: null,
          minDepthFt: null,
          minCeilingFt: null,
          maxDistanceFt: c.spaceCheck?.maxDistanceFt,
          environment: c.spaceCheck?.environment,
          warnings: [],
        },

    diagram: reconciledDiagram,

    cameraSettings: effectiveCameraSettings,

    subject: coaching.subject || null,
    background: coaching.background || null,

    skinToneAdjustments: buildSkinToneAdjustments(skinTone, mood, c.diagram?.lights),

    testSteps: [
      `This setup creates a ${(c.howToTest?.pattern && c.howToTest.pattern !== 'Unknown' ? c.howToTest.pattern : null) || lightingPattern || 'studio'} pattern.`,
      ...(c.howToTest?.fixOrder || []),
    ],

    goodSigns: c.whatToLookFor?.goodSigns || coaching.goodSigns || [],
    warnings: c.whatToLookFor?.warnings || coaching.warnings || [],

    quickFixes: rankQuickFixes(c.quickFixes?.fixes || [], {
      numLights: (c.shootThisSetup.lights || []).length,
      pattern: lightingPattern,
      mood,
      hasRim: (c.shootThisSetup.lights || []).some(l => /rim|hair/i.test(l.role || '')),
    }),

    alternatives: (c.otherSetups || []).map(s => ({
      name: s.name,
      gap: null,
      gapLabel: '',
      tradeoff: s.reason,
    })),

    substitutions: (c.substitutions?.items || []).map(s =>
      `If you don't have ${s.ifMissing}, use ${s.use}${s.tradeoff ? ` — ${s.tradeoff}` : ''}`
    ),
    catchlights: c.whatToLookFor?.catchlights || {},
    mood,

    // VLM enrichment — surface when available
    vlmDescription: apiResponse.vlmDescription || null,
    vlmReconstruction: apiResponse.vlmReconstruction || null,
    referenceImageAnalysis: apiResponse.referenceImageAnalysis || null,
    // Merge vlmReconstruction dominant_cct_kelvin into lightingIntelligence when the
    // engine path (detected_cct_kelvin) is absent — ensures the blueprint CCT badge
    // and DiagramCard WB bar both reflect the reference image colour temperature.
    lightingIntelligence: apiResponse.lightingIntelligence
      ? {
          ...apiResponse.lightingIntelligence,
          ...(!apiResponse.lightingIntelligence.detectedCCT && _vlmCCT
            ? { detectedCCT: _vlmCCT }
            : {}),
        }
      : null,

    // Perception / robustness layer (Phase 6–9)
    faceValidation: apiResponse.faceValidation || null,
    signalReliability: apiResponse.signalReliability || null,
    edgeCaseFlags: apiResponse.edgeCaseFlags || null,
  };
}
