import lightingData from "../../data/lighting_systems.json" assert { type: "json" };

const MOOD_MAP = {
  "Clean & Classic": "corporate",
  "Moody & Dramatic": "cinematic",
  "Soft & Ethereal": "beauty",
  "Bold & Edgy": "editorial",
  "High Fashion": "beauty",
  "Natural & Available": "natural",
  Cinematic: "cinematic",
};

const ENVIRONMENT_MAP = {
  "Small Room": "studio_small",
  "Home Studio": "studio_small",
  "Medium Studio": "studio_large",
  "Large Studio": "studio_large",
  Outdoor: "on_location_outdoor",
  "Window Light": "on_location_indoor",
  Office: "studio_small",
};

// Maps user-facing gear names to taxonomy gear_profile values
const GEAR_MAP = {
  speedlight: "speedlight",
  "two speedlights": "speedlight_2_light",
  strobe: "strobe_mono",
  "strobe pack": "strobe_pack",
  "led panel": "led_panel",
  "led tube": "led_tube",
  "led cob": "led_cob",
  "ring light": "ring_light",
  fresnel: "fresnel",
  "continuous lights": "continuous_2_light",
  "natural light": "natural_window",
  "reflector only": "reflector_only",
};

/**
 * Filter lighting systems by wizard selections.
 *
 * @param {Object} selections - Wizard state
 * @param {string} selections.subject - Subject type (headshot, half, full, group)
 * @param {string} selections.mood - UI mood string
 * @param {string} selections.environment - UI environment string
 * @param {string} selections.ceiling - Ceiling height (low, normal, high)
 * @param {string} selections.gearMode - "anyGear" or "myGear"
 * @param {string[]} [selections.gear] - User's gear list (when gearMode is "myGear")
 * @returns {Object[]} Filtered lighting system objects
 */
export function filterSystems(selections) {
  const { mood, environment, gearMode, gear } = selections;

  const taxonomyMood = MOOD_MAP[mood];
  const taxonomyEnv = ENVIRONMENT_MAP[environment];

  let systems = lightingData.systems;

  // Filter by mood when we have a mapping
  if (taxonomyMood) {
    systems = systems.filter((s) => s.taxonomy_refs.mood === taxonomyMood);
  }

  // Filter by environment when we have a mapping
  if (taxonomyEnv) {
    systems = systems.filter(
      (s) => s.taxonomy_refs.environment === taxonomyEnv
    );
  }

  // In "myGear" mode, only keep systems the user can actually build
  if (gearMode === "myGear" && Array.isArray(gear) && gear.length > 0) {
    const ownedProfiles = new Set(
      gear.map((g) => GEAR_MAP[g.toLowerCase()]).filter(Boolean)
    );
    systems = systems.filter((s) =>
      ownedProfiles.has(s.taxonomy_refs.gear_profile)
    );
  }

  return systems;
}

export { MOOD_MAP, ENVIRONMENT_MAP, GEAR_MAP };
