/**
 * Gear Substitution Engine
 *
 * Takes a user's kit (from kitStore) and a recommended setup (from masterLighting
 * or DiagramSpec), and produces:
 * - which recommended items the user already owns
 * - which items need substitution, with compromise notes
 * - which items are completely missing (no viable substitute)
 *
 * HONESTY RULE: Substitutions are framed as "closest available option" with
 * explicit compromise notes. Never present a substitute as equivalent.
 */

import { MASTER_LIGHTING } from '../data/masterLighting';

// ── Modifier family grouping ─────────────────────────────────────────────────
// Groups modifiers by light quality similarity (soft → softer → hard).
// Within a group, substitution is reasonable. Across groups, the tradeoff is real.

const MODIFIER_FAMILIES = {
  // Soft, large-source modifiers
  soft_large: ['softbox_rect', 'softbox_octa', 'softbox', 'umbrella_shoot_through', 'umbrella', 'umbrella_reflective', 'diffusion_panel'],
  // Medium / directional soft
  soft_medium: ['stripbox', 'beauty_dish', 'octa'],
  // Hard / small source
  hard: ['grid', 'grid_spot', 'bare', 'bare_bulb', 'fresnel', 'snoot'],
  // Specialty
  ring: ['ring_light', 'ring_flash'],
  // Natural / passive
  passive: ['reflector', 'white_foam_board', 'v_flat'],
};

function getModifierFamily(mod) {
  if (!mod) return null;
  const key = mod.toLowerCase().replace(/\s+/g, '_');
  for (const [family, members] of Object.entries(MODIFIER_FAMILIES)) {
    if (members.includes(key)) return family;
  }
  return null;
}

function isSameFamily(a, b) {
  const fa = getModifierFamily(a);
  const fb = getModifierFamily(b);
  return fa && fb && fa === fb;
}

// ── Light type grouping ──────────────────────────────────────────────────────

const LIGHT_FAMILIES = {
  strobe: ['strobe_mono', 'strobe_pack', 'speedlight'],
  continuous: ['led_panel', 'led_cob', 'led_tube', 'ring_light', 'fresnel'],
  natural: ['natural_window', 'reflector_only'],
};

function getLightFamily(type) {
  if (!type) return null;
  const key = type.toLowerCase().replace(/\s+/g, '_');
  for (const [family, members] of Object.entries(LIGHT_FAMILIES)) {
    if (members.includes(key)) return family;
  }
  return null;
}

// ── Core substitution logic ──────────────────────────────────────────────────

/**
 * @typedef {Object} SubstitutionResult
 * @property {'owned'|'substituted'|'missing'} status
 * @property {string} recommended — what the setup calls for
 * @property {string|null} substitute — what the user can use instead
 * @property {string|null} tradeoff — honest compromise description
 * @property {'none'|'minor'|'moderate'|'significant'} compromiseLevel
 */

/**
 * Find the best available substitute for a needed modifier.
 *
 * @param {string} needed — modifier type from recipe/diagram
 * @param {string[]} owned — user's owned modifiers
 * @param {Array} patternSubs — gearSubstitutions from masterLighting
 * @returns {SubstitutionResult}
 */
export function findModifierSubstitute(needed, owned = [], patternSubs = []) {
  const neededKey = (needed || '').toLowerCase().replace(/\s+/g, '_');

  // 1. User owns exactly what's needed
  if (owned.some(o => o.toLowerCase().replace(/\s+/g, '_') === neededKey)) {
    return { status: 'owned', recommended: needed, substitute: null, tradeoff: null, compromiseLevel: 'none' };
  }

  // 2. Check pattern-specific substitution data first (most trustworthy)
  for (const sub of patternSubs) {
    if ((sub.ifMissing || '').toLowerCase().replace(/\s+/g, '_') === neededKey) {
      const subKey = (sub.use || '').toLowerCase().replace(/\s+/g, '_');
      if (owned.some(o => o.toLowerCase().replace(/\s+/g, '_') === subKey)) {
        const sameFamily = isSameFamily(neededKey, subKey);
        return {
          status: 'substituted',
          recommended: needed,
          substitute: sub.use,
          tradeoff: sub.tradeoff,
          compromiseLevel: sameFamily ? 'minor' : 'moderate',
        };
      }
    }
  }

  // 3. Same-family fallback (no specific tradeoff data, but same quality category)
  for (const o of owned) {
    if (isSameFamily(neededKey, o)) {
      return {
        status: 'substituted',
        recommended: needed,
        substitute: o,
        tradeoff: `Same light quality family — should produce similar results. Test and adjust distance/power.`,
        compromiseLevel: 'minor',
      };
    }
  }

  // 4. Cross-family fallback (real compromise)
  for (const o of owned) {
    const oFamily = getModifierFamily(o);
    const nFamily = getModifierFamily(neededKey);
    if (oFamily && nFamily && oFamily !== nFamily) {
      return {
        status: 'substituted',
        recommended: needed,
        substitute: o,
        tradeoff: `Different modifier family (${nFamily} → ${oFamily}). Light quality will differ — harder or softer than intended. Review results carefully.`,
        compromiseLevel: 'significant',
      };
    }
  }

  // 5. No viable substitute
  return { status: 'missing', recommended: needed, substitute: null, tradeoff: null, compromiseLevel: 'none' };
}


/**
 * Find the best available substitute for a needed light type.
 */
export function findLightSubstitute(needed, ownedLights = [], patternSubs = []) {
  const neededKey = (needed || '').toLowerCase().replace(/\s+/g, '_');

  // User owns this type
  if (ownedLights.some(l => (l.type || '').toLowerCase().replace(/\s+/g, '_') === neededKey)) {
    return { status: 'owned', recommended: needed, substitute: null, tradeoff: null, compromiseLevel: 'none' };
  }

  // Pattern-specific substitution
  for (const sub of patternSubs) {
    if ((sub.ifMissing || '').toLowerCase().replace(/\s+/g, '_') === neededKey) {
      const subKey = (sub.use || '').toLowerCase().replace(/\s+/g, '_');
      if (ownedLights.some(l => (l.type || '').toLowerCase().replace(/\s+/g, '_') === subKey)) {
        return {
          status: 'substituted',
          recommended: needed,
          substitute: sub.use,
          tradeoff: sub.tradeoff,
          compromiseLevel: 'moderate',
        };
      }
    }
  }

  // Same family (strobe ↔ strobe, continuous ↔ continuous)
  const neededFamily = getLightFamily(neededKey);
  for (const l of ownedLights) {
    if (getLightFamily(l.type) === neededFamily) {
      return {
        status: 'substituted',
        recommended: needed,
        substitute: l.type,
        tradeoff: `Same light family. Power output may differ — adjust distance to compensate.`,
        compromiseLevel: 'minor',
      };
    }
  }

  // Cross-family (strobe → continuous or vice versa)
  if (ownedLights.length > 0) {
    const best = ownedLights[0];
    return {
      status: 'substituted',
      recommended: needed,
      substitute: best.type,
      tradeoff: `Different light type (${neededFamily || 'unknown'} → ${getLightFamily(best.type) || 'unknown'}). Significant workflow difference — adjust technique accordingly.`,
      compromiseLevel: 'significant',
    };
  }

  return { status: 'missing', recommended: needed, substitute: null, tradeoff: null, compromiseLevel: 'none' };
}


/**
 * Run full gear substitution analysis for a pattern + user kit.
 *
 * @param {string} pattern — detected pattern (e.g. 'rembrandt')
 * @param {object} kit — { lights: [{type, ...}], modifiers: [string], support: [string] }
 * @param {Array} [diagramLights] — lights from DiagramSpec if available
 * @returns {{ modifiers: SubstitutionResult[], lights: SubstitutionResult[], readiness: string, readinessScore: number }}
 */
export function analyzeGearReadiness(pattern, kit, diagramLights = []) {
  // Find the matching master lighting style for substitution data
  const patternKey = (pattern || '').toLowerCase().replace(/[^a-z_]/g, '');
  const masterStyle = MASTER_LIGHTING.find(m =>
    m.id?.toLowerCase().includes(patternKey) ||
    m.lights?.[0]?.pattern?.toLowerCase() === patternKey
  );
  const patternSubs = masterStyle?.gearSubstitutions || [];

  const ownedModifiers = (kit?.modifiers || []).map(m => typeof m === 'string' ? m : m?.type || '');
  const ownedLights = (kit?.lights || []).map(l => typeof l === 'string' ? { type: l } : l);

  // Analyze modifiers needed from diagram
  const neededModifiers = [...new Set(
    diagramLights.map(l => l.modifier).filter(Boolean)
  )];

  const modResults = neededModifiers.map(mod =>
    findModifierSubstitute(mod, ownedModifiers, patternSubs)
  );

  // Analyze light types needed
  const neededLightTypes = [...new Set(
    diagramLights.map(l => {
      // Infer light type from modifier if not explicit
      if (l.lightType) return l.lightType;
      if (['ring_light', 'ring_flash'].includes(l.modifier)) return 'ring_light';
      return 'strobe_mono'; // default assumption
    }).filter(Boolean)
  )];

  const lightResults = neededLightTypes.map(type =>
    findLightSubstitute(type, ownedLights, patternSubs)
  );

  // Calculate readiness
  const allResults = [...modResults, ...lightResults];
  const total = allResults.length || 1;
  const ownedCount = allResults.filter(r => r.status === 'owned').length;
  const subCount = allResults.filter(r => r.status === 'substituted').length;
  const missingCount = allResults.filter(r => r.status === 'missing').length;

  const score = Math.round(((ownedCount + subCount * 0.6) / total) * 100);

  let readiness;
  if (score >= 90) readiness = 'Ready to shoot';
  else if (score >= 70) readiness = 'Workable with substitutions';
  else if (score >= 40) readiness = 'Significant compromises needed';
  else readiness = 'Major gear gaps';

  return {
    modifiers: modResults,
    lights: lightResults,
    readiness,
    readinessScore: score,
    patternSubstitutions: patternSubs,
  };
}
