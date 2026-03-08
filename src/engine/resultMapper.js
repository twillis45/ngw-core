// Modifier family → photographer-friendly name
const MODIFIER_LABELS = {
  softbox_octa: "Octabox",
  softbox_rect: "Rectangular Softbox",
  softbox_strip: "Strip Box",
  beauty_dish: "Beauty Dish",
  umbrella_shoot_through: "Shoot-Through Umbrella",
  umbrella_reflective: "Reflective Umbrella",
  diffusion_panel: "Diffusion Panel / Scrim",
  grid_spot: "Grid / Snoot",
  bare_bulb: "Bare Bulb",
  gel_cto: "CTO Gel",
};

// Role → display name
const ROLE_LABELS = {
  key: "Key Light",
  fill: "Fill Light",
  rim: "Rim Light",
  hair: "Hair Light",
  background: "Background Light",
};

function reliabilityLabel(score) {
  if (score >= 90) return "Very Reliable";
  if (score >= 75) return "Reliable";
  if (score >= 60) return "Good Option";
  if (score >= 40) return "Experimental";
  return "Not Ideal";
}

function metersToFeetIn(m) {
  const totalInches = Math.round(m * 39.3701);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return inches ? `${feet}'${inches}"` : `${feet}'`;
}

function angleDescription(deg) {
  const abs = Math.abs(deg);
  const side = deg >= 0 ? "camera left" : "camera right";
  if (abs < 5) return "on axis (centered)";
  return `${Math.round(abs)}° ${side}`;
}

function heightRelativeToSubject(heightM) {
  const subjectEyeM = 1.6;
  const diff = heightM - subjectEyeM;
  const desc = metersToFeetIn(heightM);
  if (Math.abs(diff) < 0.1) return `${desc} (eye level)`;
  if (diff > 0) return `${desc} (${metersToFeetIn(diff)} above eye level)`;
  return `${desc} (${metersToFeetIn(Math.abs(diff))} below eye level)`;
}

function mapLightPlacement(light) {
  return {
    role: ROLE_LABELS[light.role] || light.label || light.role,
    modifier: MODIFIER_LABELS[light.modifier] || light.modifier,
    position: angleDescription(light.angle_deg),
    height: heightRelativeToSubject(light.height_m),
    distance: metersToFeetIn(light.distance_m),
    notes: light.notes || [],
  };
}

/**
 * Map engine output + source system data → UI card schemas.
 *
 * @param {Object} engineResult  - SelectionResult from the engine
 * @param {Object} sourceSystem  - Original system object from lighting_systems.json
 * @param {Object} diagramSpec   - DiagramSpec from the engine
 * @param {Object} patternData   - { pattern, shadows, catchlights }
 * @returns {Object} UI-ready card data
 */
export function mapResultToCards(
  engineResult,
  sourceSystem,
  diagramSpec,
  patternData
) {
  const confidence = engineResult.winner?.confidence || {};
  const score = Math.round((confidence.score || 0) * 100);

  return {
    bestMatch: {
      name: sourceSystem.name,
      reliability: score,
      reliabilityLabel: reliabilityLabel(score),
      difficulty: sourceSystem.difficulty,
      setupTime: sourceSystem.setup_time_minutes,
    },

    shootThisSetup: {
      lights: (diagramSpec.lights || []).map(mapLightPlacement),
    },

    spaceCheck: {
      environment: sourceSystem.taxonomy_refs?.environment,
      maxDistance: Math.max(
        ...(diagramSpec.lights || []).map((l) => l.distance_m)
      ),
      maxDistanceFt: metersToFeetIn(
        Math.max(...(diagramSpec.lights || []).map((l) => l.distance_m))
      ),
    },

    diagram: {
      systemId: diagramSpec.system_id,
      lights: diagramSpec.lights,
      subject: diagramSpec.subject,
      camera: diagramSpec.camera,
    },

    howToTest: {
      pattern: patternData.pattern,
      fixOrder: patternData.shadows?.fix_order || [],
    },

    whatToLookFor: {
      goodSigns: patternData.shadows?.what_you_should_see || [],
      warnings: [
        ...(patternData.shadows?.what_means_it_is_wrong || []),
        ...(sourceSystem.failure_modes || []),
      ],
      catchlights: patternData.catchlights || {},
    },

    whyThisWorks: {
      body: sourceSystem.why_this_works || "",
    },

    quickFixes: {
      fixes: patternData.catchlights?.quick_fixes || [],
      fixOrder: patternData.shadows?.fix_order || [],
    },

    substitutions: {
      items: (sourceSystem.substitutions || []).map((s) => ({
        ifMissing: MODIFIER_LABELS[s.if_missing] || s.if_missing,
        use: MODIFIER_LABELS[s.use] || s.use,
        tradeoff: s.tradeoff,
      })),
    },

    otherSetups: (engineResult.top_picks || []).slice(1, 4).map((pick) => ({
      name: pick.breakdown?.system_name || "",
      score: Math.round((pick.breakdown?.final_score || 0) * 100),
      reason: pick.reason || "",
    })),
  };
}

export { reliabilityLabel, metersToFeetIn, MODIFIER_LABELS, ROLE_LABELS };
