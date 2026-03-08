/** Transform the raw /recommend API response into photographer-friendly fields.
 *  This is the critical translation layer between the scoring engine
 *  and the UI cards. */

import { getCoaching, buildTestSteps } from './coaching';

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
    grid_spot:    'Grid Spot',
    grid:         'Honeycomb Grid',
    stripbox:     'Strip Box',
    barn_doors:   'Barn Doors',
    snoot:        'Snoot',
    bare:         'Bare Bulb',
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

function powerHint(role) {
  const hints = {
    key:  'Start at 1/4 power, adjust to taste',
    fill: '2 stops below key',
    rim:  'Match key or +1/2 stop for pop',
  };
  return hints[role] || 'Start at 1/4 power';
}

function reliabilityFromConfidence(score) {
  if (score >= 90) return { dots: 5, label: 'Excellent match \u2014 high reliability' };
  if (score >= 75) return { dots: 4, label: 'Very strong match' };
  if (score >= 55) return { dots: 3, label: 'Solid match' };
  if (score >= 35) return { dots: 2, label: 'Reasonable match \u2014 consider adding gear details' };
  return { dots: 1, label: 'Limited data \u2014 add more details for better results' };
}

/* ── space check ───────────────────────────────────────── */

function buildSpaceCheck(lights) {
  let maxDist = 0;
  let maxHeight = 0;
  for (const l of lights) {
    if (l.distance_m > maxDist) maxDist = l.distance_m;
    if (l.height_m > maxHeight) maxHeight = l.height_m;
  }

  // Camera at 2 m behind, plus farthest light, plus buffer
  const depthM = maxDist + 2.0 + 0.5;
  const widthM = maxDist * 2 + 1.0;
  const ceilingM = maxHeight + 0.5;

  const warnings = [];
  if (ceilingM > 2.6) {
    warnings.push(
      `If your ceiling is under ${metersToFeet(ceilingM)} ft: ` +
      'lower the rim/hair light to shoulder height and angle it down 30\u00b0'
    );
  }

  return {
    minWidthFt:   metersToFeet(widthM),
    minDepthFt:   metersToFeet(depthM),
    minCeilingFt: metersToFeet(ceilingM),
    warnings,
  };
}

/* ── main transform ─────────────────────────────────────── */

export function transformForUI(apiResponse, mood) {
  const sel = apiResponse.result.structured.selection;
  const winner = sel.winner;
  const picks = sel.top_picks || [];
  const spec = apiResponse.result.diagram_spec;
  const confScore = winner.confidence?.score ?? apiResponse.result.confidence ?? 0;
  const reliability = reliabilityFromConfidence(confScore);

  const coaching = getCoaching(mood);

  // Best Match card
  const bestMatch = {
    name: winner.system_name || winner.system_id,
    systemId: winner.system_id,
    reliabilityScore: confScore,
    reliabilityDots: reliability.dots,
    reliabilityLabel: reliability.label,
    rationale: buildRationale(winner, mood),
  };

  // Shoot This Setup card — one entry per light
  const setupLights = (spec.lights || []).map(l => ({
    role: l.role,
    label: l.label || l.role.charAt(0).toUpperCase() + l.role.slice(1) + ' Light',
    positionText: positionText(l),
    distanceFt: `${metersToFeet(l.distance_m)} ft`,
    distanceM: `${l.distance_m.toFixed(1)} m`,
    modifier: modifierLabel(l.modifier),
    powerHint: powerHint(l.role),
    notes: l.notes || [],
  }));

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
    testSteps: buildTestSteps((spec.lights || []).length),
    goodSigns: coaching.goodSigns,
    warnings: coaching.warnings,
    quickFixes: coaching.quickFixes,
    alternatives,
    mood,
  };
}

function buildRationale(winner, mood) {
  const name = winner.system_name || winner.system_id;
  const moodLabel = (mood || 'corporate').replace(/_/g, ' ');
  return `${name} is the strongest match for your ${moodLabel} shoot based on brightness, color accuracy, and your available gear.`;
}

/** Transform /api/shoot-match response into the shape ResultsScreen expects. */
export function transformShootMatch(apiResponse) {
  const c = apiResponse.cards;

  return {
    bestMatch: {
      name: c.bestMatch.name,
      systemId: c.diagram?.systemId,
      reliabilityScore: c.bestMatch.reliability,
      reliabilityDots: Math.max(1, Math.round(c.bestMatch.reliability / 20)),
      reliabilityLabel: c.bestMatch.reliabilityLabel,
      rationale: c.whyThisWorks.body,
      difficulty: c.bestMatch.difficulty,
      setupTime: c.bestMatch.setupTime,
    },

    setup: {
      lights: (c.shootThisSetup.lights || []).map(l => ({
        role: l.role.toLowerCase().replace(/ light$/, ''),
        label: l.role,
        positionText: `${l.position}, ${l.height}`,
        distanceFt: l.distance,
        distanceM: l.distance,
        modifier: l.modifier,
        powerHint: l.notes?.[0] || 'Start at 1/4 power',
        notes: l.notes || [],
      })),
    },

    spaceCheck: {
      minWidthFt: null,
      minDepthFt: null,
      minCeilingFt: null,
      maxDistanceFt: c.spaceCheck.maxDistanceFt,
      environment: c.spaceCheck.environment,
      warnings: [],
    },

    diagram: c.diagram,

    cameraSettings: c.cameraSettings || null,

    testSteps: [
      { step: 1, text: `This setup creates a ${c.howToTest.pattern} pattern.` },
      ...(c.howToTest.fixOrder || []).map((f, i) => ({ step: i + 2, text: f })),
    ],

    goodSigns: c.whatToLookFor.goodSigns || [],
    warnings: c.whatToLookFor.warnings || [],

    quickFixes: c.quickFixes.fixes || [],

    alternatives: (c.otherSetups || []).map(s => ({
      name: s.name,
      gap: null,
      gapLabel: '',
      tradeoff: s.reason,
    })),

    substitutions: c.substitutions?.items || [],
    catchlights: c.whatToLookFor.catchlights || {},
  };
}
