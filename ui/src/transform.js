/** Transform the raw /recommend API response into photographer-friendly fields.
 *  This is the critical translation layer between the scoring engine
 *  and the UI cards. */

import { getCoaching, buildTestSteps } from './coaching';
import { getModifierDetails, recommendedSizeClass } from './data/modifierCatalog';

/* ── helpers ────────────────────────────────────────────── */

function metersToFeet(m) {
  return (m * 3.281).toFixed(1);
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
    bare:         'Bare Bulb',
    hard_source:  'Hard Source (Fresnel / Standard Reflector)',
    unknown:      'Modifier Not Detected',
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
function buildSpaceCheck(lights, roomDimensions) {
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

  const warnings = [];
  if (ceilingM > 2.6) {
    warnings.push(
      `If your ceiling is under ${metersToFeet(ceilingM)} ft: ` +
      'lower the rim/hair light to shoulder height and angle it down 30\u00b0'
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
        `Ceiling is ${roomDimensions.ceilingFt} ft but setup needs ${minCeilingFt} ft — ` +
        'lower tall lights or angle them down'
      );
    }
    if (!widthFits) {
      issues.push(
        `Room width is ${roomDimensions.widthFt} ft but setup needs ${minWidthFt} ft — ` +
        'move lights closer to subject'
      );
    }
    if (!depthFits) {
      issues.push(
        `Room depth is ${roomDimensions.lengthFt} ft but setup needs ${minDepthFt} ft — ` +
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
      exposure: '+0 to +1/3 stop — lighter skin reflects more light; meter carefully to avoid blowout',
      modifier: 'Use a large, soft modifier to minimize specular highlights',
      whiteBalance: 'Standard daylight (5500K) or slightly warm (5600-5800K)',
      fillRatio: numLights >= 2 ? 'Fill can be subtle (2:1 ratio) — skin naturally bounces light' : null,
      rimNote: hasRim ? 'Reduce rim power by 1/2 stop — rim can clip quickly on lighter skin' : null,
      keyTip: 'Watch histogram highlights — pull back power if right edge clips',
    },
    medium: {
      exposure: 'Meter at rated value — medium tones sit in the ideal exposure zone',
      modifier: 'Medium softbox or beauty dish for balanced shadow definition',
      whiteBalance: 'Daylight (5500K) or match ambient — most versatile range',
      fillRatio: numLights >= 2 ? 'Standard 2:1 to 3:1 fill ratio for natural dimension' : null,
      rimNote: hasRim ? 'Rim at standard power for clean separation' : null,
      keyTip: 'Use a grey card — auto white balance can skew with warm undertones',
    },
    dark: {
      exposure: '+2/3 to +1 stop over meter reading — camera meters underexpose dark skin',
      modifier: 'Large softbox with grid to control spill while keeping light soft and wrap-around',
      whiteBalance: 'Daylight (5500K) or slightly cool (5200-5400K) to retain richness',
      fillRatio: numLights >= 2 ? 'Lower ratio (1.5:1 to 2:1) — deep shadows lose detail quickly' : null,
      rimNote: hasRim ? 'Rim light is essential for separation — keep at standard or +1/3 power' : null,
      keyTip: 'Expose for the face, not the background — ETTR (expose to the right) is your friend',
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
  if (data.rimNote) tips.push({ label: 'Rim Light', value: data.rimNote });
  tips.push({ label: 'Key Tip', value: data.keyTip });

  return { skinTone, tips };
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

export function transformForUI(apiResponse, mood, skinTone, { powerDisplay } = {}) {
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

  // Engine confidence is the source of truth (solver-informed)
  let adjustedConf = confScore;
  const reliability = reliabilityFromConfidence(adjustedConf);

  // Best Match card
  const bestMatch = {
    name: winner.system_name || winner.system_id,
    systemId: winner.system_id,
    reliabilityScore: adjustedConf,
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
      name: bd.system_name || bd.system_id,
      gap: gap.toFixed(1),
      gapLabel: gap < 3 ? 'Close alternative' : gap < 8 ? 'Viable option' : 'Budget option',
      tradeoff: p.reason || '',
    };
  });

  return {
    bestMatch,
    setup: { lights: setupLights },
    spaceCheck: buildSpaceCheck(spec.lights || []),
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

  // Engine confidence is the source of truth (solver-informed)
  const confScore = c.bestMatch.reliability || 0;
  let adjustedConf = confScore;
  const reliability = reliabilityFromConfidence(adjustedConf);

  const keyFStopIdx = parseKeyFStop(c.cameraSettings?.aperture);

  // Derive background distance from reference analysis when available.
  // The recreation_setup.background_strategy describes the actual background
  // relationship from the reference image — use it to override coaching defaults.
  const refAnalysis = apiResponse.referenceImageAnalysis?.description?.referenceAnalysis;
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

  return {
    gearMatch: apiResponse.gearMatch || null,
    bestMatch: {
      name: c.bestMatch.name,
      systemId: c.diagram?.systemId,
      reliabilityScore: adjustedConf,
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

    setup: {
      lights: (c.shootThisSetup.lights || []).map(l => {
        const role = (l.role || 'key').toLowerCase().replace(/ light$/, '');
        // When the engine returns 'unknown' for modifier, fall back to the
        // reference analysis modifier_suggestion if available (it knows more).
        const BARE_MOD_TOKENS = ['unknown', 'bare', 'bare_bulb', 'direct', 'none', ''];
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
      }),
    },

    spaceCheck: c.diagram?.lights
      ? buildSpaceCheck(c.diagram.lights)
      : {
          minWidthFt: null,
          minDepthFt: null,
          minCeilingFt: null,
          maxDistanceFt: c.spaceCheck?.maxDistanceFt,
          environment: c.spaceCheck?.environment,
          warnings: [],
        },

    diagram: c.diagram,

    cameraSettings: c.cameraSettings || coaching.camera || null,

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
    lightingIntelligence: apiResponse.lightingIntelligence || null,

    // Perception / robustness layer (Phase 6–9)
    faceValidation: apiResponse.faceValidation || null,
    signalReliability: apiResponse.signalReliability || null,
    edgeCaseFlags: apiResponse.edgeCaseFlags || null,
  };
}
