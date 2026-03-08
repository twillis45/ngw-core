import { MOOD_MAP, ENVIRONMENT_MAP, GEAR_MAP } from "./systemFilter.js";

// Maps UI gear selections to modifier families the user likely owns
const GEAR_TO_MODIFIERS = {
  speedlight: ["umbrella_shoot_through", "umbrella_reflective", "gel_cto"],
  "two speedlights": [
    "umbrella_shoot_through",
    "umbrella_reflective",
    "gel_cto",
  ],
  strobe: [
    "softbox_octa",
    "softbox_rect",
    "beauty_dish",
    "grid_spot",
    "bare_bulb",
  ],
  "strobe pack": [
    "softbox_octa",
    "softbox_rect",
    "softbox_strip",
    "beauty_dish",
    "diffusion_panel",
    "grid_spot",
    "bare_bulb",
  ],
  "led panel": ["diffusion_panel", "gel_cto"],
  "led tube": ["gel_cto"],
  "led cob": ["softbox_octa", "softbox_rect", "diffusion_panel"],
  "ring light": [],
  fresnel: ["grid_spot", "gel_cto"],
  "continuous lights": ["softbox_rect", "umbrella_shoot_through"],
  "natural light": ["diffusion_panel"],
  "reflector only": [],
};

/**
 * Map wizard state into the engine's LightingSystemsPayload format.
 *
 * @param {Object} wizardState - UI wizard selections
 * @param {Object[]} filteredSystems - Systems already filtered by systemFilter
 * @returns {Object} Engine-ready payload
 */
export function buildEnginePayload(wizardState, filteredSystems) {
  const { mood, environment, gearMode, gear } = wizardState;

  const taxonomyMood = MOOD_MAP[mood] || "natural";
  const taxonomyEnv = ENVIRONMENT_MAP[environment] || "studio_small";

  // Determine gear_profile from the first gear item (primary light source)
  let gearProfile = "strobe_mono";
  if (gearMode === "myGear" && Array.isArray(gear) && gear.length > 0) {
    gearProfile = GEAR_MAP[gear[0].toLowerCase()] || "strobe_mono";
  }

  // Collect modifier families the user has access to
  let modifiersAvailable = [];
  if (gearMode === "myGear" && Array.isArray(gear)) {
    const modSet = new Set();
    for (const g of gear) {
      const mods = GEAR_TO_MODIFIERS[g.toLowerCase()] || [];
      mods.forEach((m) => modSet.add(m));
    }
    modifiersAvailable = [...modSet];
  }

  // Strip fields the engine doesn't accept (it uses extra="forbid")
  const systems = filteredSystems.map((s) => ({
    id: s.id,
    name: s.name,
    taxonomy_refs: s.taxonomy_refs,
    criteria: s.criteria,
    features: s.features,
    modifier: s.modifier,
  }));

  return {
    systems,
    input: {
      mood: taxonomyMood,
      environment: taxonomyEnv,
      gear_profile: gearProfile,
      modifiers_available: modifiersAvailable,
    },
    metadata: {},
    modifiers_available: modifiersAvailable,
  };
}
