/**
 * Master Lighting Knowledge Base
 *
 * Structured lighting intelligence derived from master photographers,
 * cinematographers, and classical painters. Each entry is a complete,
 * engine-ready lighting system specification with decision rules,
 * reference image analysis signatures, and troubleshooting data.
 *
 * Ordered by business utility — what working photographers bill most for.
 *
 * Sources of lighting philosophy:
 *   Portrait:       Annie Leibovitz, Gregory Heisler, Irving Penn, Richard Avedon
 *   Beauty:         Tamara Williams, Lindsay Adler
 *   Fashion:        Steven Meisel, Patrick Demarchelier, Greg Kadel, Peter Lindbergh
 *   Commercial:     Karl Taylor, Tim Tadder
 *   Cinematography: John Alton, Blain Brown
 *   Classical art:  Caravaggio, Rembrandt van Rijn, Johannes Vermeer
 */

// ─── 1. REMBRANDT PORTRAIT ──────────────────────────────────────────
// The universal portrait pattern. Named for the Dutch master's signature
// triangle of light on the shadow-side cheek. Rembrandt van Rijn used
// north-facing studio windows; Gregory Heisler and Annie Leibovitz
// both cite this as their default starting position.
// Business use: corporate headshots, actor headshots, editorial portraits,
// character studies. The single most-booked pattern in portrait studios.

export const REMBRANDT_PORTRAIT = {
  id: 'master-rembrandt-portrait',
  styleName: 'Rembrandt Portrait',
  masters: ['Rembrandt van Rijn', 'Gregory Heisler', 'Annie Leibovitz'],
  category: 'portrait',
  moods: ['corporate', 'cinematic', 'low_key', 'editorial'],
  businessPriority: 1,

  creativeIntent: {
    goal: 'dimensional character portrait with controlled drama',
    emotion: 'authority, depth, approachability with gravitas',
    use: 'headshots, actor comp cards, executive portraits, editorial profiles',
  },

  lightGeometry: {
    key: {
      angle_deg: 45,
      height: 'slightly above forehead, angled down 30-40 degrees',
      height_m: 1.9,
      distance_m: 1.2,
      distance_ft: '3.5-5',
      modifier: ['softbox_rect', 'softbox_octa', 'umbrella_reflective'],
      preferredModifier: 'softbox_rect',
      notes: 'Key at 45 degrees camera-left or camera-right. The triangle of light on the shadow cheek is the diagnostic. If using a softbox, feather the near edge past the subject for even falloff.',
    },
    fill: {
      position: 'opposite side of key, at camera axis or slightly behind',
      angle_deg: -15,
      height_m: 1.5,
      distance_m: 1.8,
      modifier: ['reflector', 'softbox_rect'],
      preferredModifier: 'reflector',
      ratio: '-1.5 to -2 stops from key',
      notes: 'For corporate: fill at -1.5 stops (approachable). For dramatic: fill at -3 stops or no fill (Heisler approach). A white reflector at 4 ft gives natural fill without a second light.',
    },
    rim: {
      position: 'behind subject, opposite key, aimed at shoulder/hair',
      angle_deg: 135,
      height_m: 2.1,
      distance_m: 1.8,
      modifier: ['grid_spot', 'stripbox', 'bare_bulb'],
      preferredModifier: 'grid_spot',
      ratio: '-0.5 to 0 stops from key',
      notes: 'Rim separates subject from background. Grid prevents spill. Aim at the ear/shoulder, not the face.',
    },
    background: null,
  },

  cameraPosition: {
    lens: '85-135mm',
    distance_ft: '8-10',
    distance_m: 2.5,
    height: 'at subject eye level',
    angle: 'straight-on or slight 3/4 to shadow side',
    notes: '85mm minimum to avoid perspective distortion on faces. 105mm is the classic headshot lens.',
  },

  subjectPosition: {
    distanceFromBackground_ft: '5-8',
    distanceFromBackground_m: 2.0,
    pose: 'turned 30-45 degrees toward the key light, chin slightly down',
    notes: 'The subject turns INTO the key light. The shadow-side cheek faces camera. This creates the triangle.',
  },

  environmentConstraints: {
    minCeilingHeight_ft: 9,
    minRoomWidth_ft: 10,
    minDepth_ft: 14,
    backgroundNeeds: 'dark grey, charcoal, or black preferred; any solid works',
    notes: 'Works in smaller rooms by bringing key closer (3 ft) and removing rim. Ceiling must clear the key light on boom.',
  },

  expectedShadowPatterns: [
    'Triangle of light on shadow-side cheek (the Rembrandt triangle)',
    'Nose shadow connects to cheek shadow on far side',
    'Shadow-side eye has light in the triangle',
    'Jawline definition on key side',
    'Gradual falloff across nose bridge',
    'Catchlight at 10-11 o\'clock (key-left) or 1-2 o\'clock (key-right)',
  ],

  failureModes: [
    { problem: 'No triangle on shadow cheek', cause: 'Key too far forward (toward camera axis)', fix: 'Move key further to the side until triangle appears — typically 40-50 degrees' },
    { problem: 'Triangle too large / face half-lit', cause: 'Key too far to the side (>60 degrees)', fix: 'Move key forward 10-15 degrees toward camera axis' },
    { problem: 'Nose shadow disconnected from cheek shadow', cause: 'Key too high or subject chin too far up', fix: 'Lower key or ask subject to drop chin slightly' },
    { problem: 'Raccoon eyes (dark eye sockets)', cause: 'Key too high', fix: 'Lower key to forehead level, not overhead' },
    { problem: 'Flat face, no dimension', cause: 'Fill too strong', fix: 'Pull fill back 2 ft or power down 1 stop' },
    { problem: 'Rim too bright, blowing out ear/hair', cause: 'Rim too close or too powerful', fix: 'Move rim back 1 ft or flag lower edge' },
    { problem: 'Double nose shadow', cause: 'Fill is too strong and too far to the side', fix: 'Move fill to camera axis and reduce power' },
    { problem: 'Background too bright for mood', cause: 'Key spill hitting background', fix: 'Move subject 2+ ft from background or flag the key' },
  ],

  gearSubstitutions: [
    { ifMissing: 'softbox_rect', use: 'umbrella_reflective', tradeoff: 'Less directional control, slightly more spill; grid the umbrella if possible' },
    { ifMissing: 'softbox_rect', use: 'softbox_octa', tradeoff: 'Rounder catchlights, slightly softer shadow edge; works well' },
    { ifMissing: 'grid_spot', use: 'stripbox', tradeoff: 'Wider rim coverage; good for half-body; harder to control spill' },
    { ifMissing: 'strobe_mono', use: 'speedlight', tradeoff: 'Less power, slower recycle; use at 1/4 power with umbrella for faster recycle' },
    { ifMissing: 'reflector', use: 'white foam board', tradeoff: 'Same quality fill, less adjustable angle; tape to a light stand' },
  ],

  distanceTable: {
    keyToSubject_ft: 4,
    fillToSubject_ft: 5,
    rimToSubject_ft: 6,
    cameraToSubject_ft: 8,
    subjectToBackground_ft: 6,
  },

  reliability: {
    score: 92,
    label: 'Very Reliable',
    notes: 'Works in nearly every portrait studio. The most forgiving dramatic pattern — small errors still produce a professional result.',
  },

  ruleEngineInsights: [
    { condition: 'mood IN (corporate, cinematic, low_key) AND subject = headshot', action: 'recommend Rembrandt as primary option' },
    { condition: 'ceiling_height < 8ft', action: 'reduce key height to 1.7m; warn about limited overhead clearance' },
    { condition: 'fill_ratio > -1 stop', action: 'warn: fill too strong for Rembrandt — triangle will disappear' },
    { condition: 'subject_to_background < 3ft', action: 'warn: background spill; move subject forward or flag the key' },
    { condition: 'key_angle < 30deg', action: 'warn: key too front-on for Rembrandt; triangle will not form' },
    { condition: 'key_angle > 65deg', action: 'warn: approaching split lighting; pull key forward for Rembrandt' },
    { condition: 'skin_tone = dark', action: 'increase fill ratio by 0.5 stop; switch to larger modifier for softer wrap' },
  ],

  referenceImageSignature: {
    pattern: 'rembrandt-ish',
    diagnosticFeatures: [
      'Triangle of light on shadow cheek',
      'Single dominant catchlight at 10-11 or 1-2 o\'clock',
      'Shadow-to-highlight ratio 2:1 to 4:1',
      'Nose shadow connected to cheek shadow',
    ],
    catchlightExpected: { count: 1, position: '10-11 o\'clock or 1-2 o\'clock', shape: 'rectangular or octagonal' },
    shadowMap: { noseShadow: 'connected to cheek shadow, angled 45 degrees', cheekShadow: 'triangle of light visible', jawShadow: 'defined on key side' },
    lightCount: { min: 1, typical: 2, max: 3 },
    keyPosition: '45 degrees camera-left or camera-right',
    backgroundExpected: 'dark, even, no visible spill pattern',
  },
};


// ─── 2. LOOP LIGHTING ───────────────────────────────────────────────
// The safest, most universally flattering portrait pattern. Key light
// at 25-35 degrees creates a small loop-shaped shadow beside the nose
// without crossing to the far cheek. Preferred by corporate headshot
// studios (Peter Hurley workflow), real estate agent headshots, and
// any high-volume session where consistency matters.
// Irving Penn used a refined version; Avedon's early editorial work
// often started from a loop position before moving to frontal.

export const LOOP_LIGHTING = {
  id: 'master-loop-lighting',
  styleName: 'Loop Lighting',
  masters: ['Irving Penn', 'Richard Avedon', 'Peter Hurley', 'Patrick Demarchelier'],
  category: 'commercial',
  moods: ['corporate', 'natural', 'beauty'],
  businessPriority: 2,

  creativeIntent: {
    goal: 'universally flattering portrait with gentle dimension',
    emotion: 'approachable, professional, trustworthy',
    use: 'corporate headshots, LinkedIn photos, team pages, real estate agents, actors',
  },

  lightGeometry: {
    key: {
      angle_deg: 30,
      height: 'slightly above eye level, angled down 20-25 degrees',
      height_m: 1.85,
      distance_m: 1.0,
      distance_ft: '3-4',
      modifier: ['softbox_rect', 'softbox_octa', 'umbrella_shoot_through'],
      preferredModifier: 'softbox_octa',
      notes: 'Key at 25-35 degrees. The nose shadow should be a small loop that does NOT touch the cheek shadow. This is the key diagnostic — if the shadow touches, you have Rembrandt, not Loop.',
    },
    fill: {
      position: 'at or near camera axis, slightly below key height',
      angle_deg: -10,
      height_m: 1.5,
      distance_m: 1.4,
      modifier: ['reflector', 'softbox_rect'],
      preferredModifier: 'reflector',
      ratio: '-1 to -1.5 stops from key',
      notes: 'Fill should be stronger than Rembrandt. For corporate work, aim for -1 stop ratio (3:2 key-to-fill). The goal is dimension without drama.',
    },
    rim: {
      position: 'behind subject, opposite key',
      angle_deg: 140,
      height_m: 2.0,
      distance_m: 1.6,
      modifier: ['stripbox', 'grid_spot'],
      preferredModifier: 'stripbox',
      ratio: '-1 stop from key',
      notes: 'Optional but recommended for corporate. Separates dark hair from dark background. Keep subtle — this is not a dramatic setup.',
    },
    background: {
      position: 'aimed at background, centered behind subject',
      angle_deg: 180,
      height_m: 1.0,
      distance_m: 1.5,
      modifier: ['grid_spot', 'bare_bulb'],
      preferredModifier: 'grid_spot',
      ratio: '-1 to -2 stops from key',
      notes: 'Optional. Creates a gentle gradient on background for depth. Grid keeps the pool centered behind the head.',
    },
  },

  cameraPosition: {
    lens: '85-105mm',
    distance_ft: '8-10',
    distance_m: 2.5,
    height: 'at subject eye level',
    angle: 'straight-on',
    notes: '105mm is optimal for headshots. At 8 ft with 105mm, you get head-and-shoulders framing with flattering compression.',
  },

  subjectPosition: {
    distanceFromBackground_ft: '5-8',
    distanceFromBackground_m: 2.0,
    pose: 'square to camera or slight turn, chin slightly down, eyes to lens',
    notes: 'Subject faces camera more directly than Rembrandt. The 30-degree key creates dimension without requiring a body turn.',
  },

  environmentConstraints: {
    minCeilingHeight_ft: 8,
    minRoomWidth_ft: 8,
    minDepth_ft: 12,
    backgroundNeeds: 'grey, white, or colored seamless; any solid works well',
    notes: 'The most adaptable pattern. Works in offices, conference rooms, small studios. Key can be as close as 2.5 ft in tight spaces.',
  },

  expectedShadowPatterns: [
    'Small loop-shaped nose shadow on far cheek — does NOT connect to cheek shadow',
    'Slight shadow under nose angled 20-30 degrees to one side',
    'Both eyes fully illuminated with clean catchlights',
    'Gentle shadow under chin on far side',
    'Even skin illumination with subtle modeling',
    'Catchlight at 10-11 o\'clock or 1-2 o\'clock',
  ],

  failureModes: [
    { problem: 'Nose shadow touching cheek shadow', cause: 'Key too far to the side (>40 degrees)', fix: 'Move key 10 degrees toward camera axis — you have Rembrandt, not Loop' },
    { problem: 'No nose shadow at all', cause: 'Key too centered (< 15 degrees)', fix: 'Move key further to the side — you have Butterfly, not Loop' },
    { problem: 'Face looks flat', cause: 'Fill too strong, key too centered, or both', fix: 'Pull fill back 1-2 ft or move key to 35 degrees' },
    { problem: 'Glasses glare', cause: 'Key reflection hitting lens surface', fix: 'Raise key 6 inches, or angle subject chin down 5 degrees, or move key 5 degrees wider' },
    { problem: 'Hot spot on forehead', cause: 'Key too close or not feathered', fix: 'Feather key so the near edge of the modifier passes just above the forehead' },
    { problem: 'Uneven illumination left to right', cause: 'Key too far to one side for this modifier size', fix: 'Use a larger modifier or move key closer to center' },
  ],

  gearSubstitutions: [
    { ifMissing: 'softbox_octa', use: 'umbrella_shoot_through', tradeoff: 'More spill, less directional control; works fine in small spaces' },
    { ifMissing: 'softbox_octa', use: 'softbox_rect', tradeoff: 'Rectangular catchlights instead of round; no quality difference' },
    { ifMissing: 'strobe_mono', use: 'led_panel', tradeoff: 'Continuous light; WYSIWYG preview; lower power; watch for 60Hz flicker at fast shutters' },
    { ifMissing: 'stripbox', use: 'bare_bulb', tradeoff: 'Harder rim; reduce power and move further back' },
  ],

  distanceTable: {
    keyToSubject_ft: 3.5,
    fillToSubject_ft: 4.5,
    rimToSubject_ft: 5,
    cameraToSubject_ft: 8,
    subjectToBackground_ft: 6,
    backgroundLightToBackground_ft: 4,
  },

  reliability: {
    score: 96,
    label: 'Very Reliable',
    notes: 'The highest-reliability pattern. Flatters nearly every face shape and skin tone. Difficult to get catastrophically wrong.',
  },

  ruleEngineInsights: [
    { condition: 'mood = corporate AND subject = headshot', action: 'recommend Loop as primary; highest reliability for volume work' },
    { condition: 'glasses = true', action: 'prefer Loop over Rembrandt; raise key 6 inches; add note about chin-down adjustment' },
    { condition: 'subject_count > 1', action: 'recommend Loop; safest for groups where individual light direction varies' },
    { condition: 'environment = office', action: 'recommend Loop; works in low ceilings and tight spaces' },
    { condition: 'experience_level = beginner', action: 'recommend Loop; most forgiving pattern' },
    { condition: 'skin_tone = dark', action: 'increase fill to -0.5 stop ratio for richer shadow detail' },
  ],

  referenceImageSignature: {
    pattern: 'loop',
    diagnosticFeatures: [
      'Small nose shadow that does NOT touch cheek shadow',
      'Both eyes illuminated with catchlights',
      'Gentle modeling without strong drama',
      'Even skin illumination across the face',
    ],
    catchlightExpected: { count: 1, position: '10-11 o\'clock or 1-2 o\'clock', shape: 'octagonal or rectangular' },
    shadowMap: { noseShadow: 'small loop, 20-30 degrees, not touching cheek', cheekShadow: 'minimal', jawShadow: 'gentle on far side' },
    lightCount: { min: 1, typical: 2, max: 4 },
    keyPosition: '25-35 degrees camera-left or camera-right',
    backgroundExpected: 'even or with gentle gradient',
  },
};


// ─── 3. BUTTERFLY / PARAMOUNT BEAUTY ────────────────────────────────
// Centered key directly above the camera axis creates a symmetrical
// butterfly-shaped shadow under the nose. Named for the Hollywood
// Paramount studio system of the 1930s. Irving Penn's precise
// beauty work and modern beauty/cosmetics photography depend on this.
// The clamshell variant (with under-fill) is the beauty industry standard.

export const BUTTERFLY_BEAUTY = {
  id: 'master-butterfly-beauty',
  styleName: 'Butterfly / Paramount Beauty',
  masters: ['Irving Penn', 'George Hurrell', 'Peter Lindbergh', 'Tamara Williams'],
  category: 'portrait',
  moods: ['beauty', 'high_key'],
  businessPriority: 3,

  creativeIntent: {
    goal: 'flawless, symmetrical beauty lighting with sculpted cheekbones',
    emotion: 'elegance, glamour, polished beauty',
    use: 'beauty campaigns, cosmetics, skin care, glamour headshots, actor beauty shots',
  },

  lightGeometry: {
    key: {
      angle_deg: 0,
      height: 'directly above camera, 1-2 ft higher than subject forehead',
      height_m: 2.0,
      distance_m: 1.0,
      distance_ft: '3-4',
      modifier: ['beauty_dish', 'softbox_octa'],
      preferredModifier: 'beauty_dish',
      notes: 'Key must be on the camera axis (0 degrees left/right). Height is critical: too high makes raccoon eyes, too low kills the butterfly shadow. The butterfly shadow should be small and symmetrical directly under the nose.',
    },
    fill: {
      position: 'directly below key, at chin level or just below',
      angle_deg: 0,
      height_m: 1.2,
      distance_m: 0.8,
      modifier: ['reflector'],
      preferredModifier: 'reflector',
      ratio: '-1 to -1.5 stops from key',
      notes: 'The clamshell fill. A silver or white reflector on the subject\'s lap or a stand at waist height. This opens shadows under chin, nose, and eye sockets without killing dimension.',
    },
    rim: {
      position: 'behind and above subject, aimed at hair',
      angle_deg: 135,
      height_m: 2.2,
      distance_m: 1.5,
      modifier: ['stripbox', 'grid_spot'],
      preferredModifier: 'stripbox',
      ratio: '-0.5 to 0 stops from key',
      notes: 'Hair light, not rim light. Aimed at the crown of the head for shine and separation. In beauty work, this is labeled "hair light" not "rim".',
    },
    background: null,
  },

  cameraPosition: {
    lens: '85-105mm',
    distance_ft: '6-8',
    distance_m: 2.0,
    height: 'at subject eye level',
    angle: 'straight-on, slight downward for beauty',
    notes: 'Camera at or very slightly above eye level. Shooting from slightly above elongates the neck and slims the face — the beauty photographer\'s secret.',
  },

  subjectPosition: {
    distanceFromBackground_ft: '6-8',
    distanceFromBackground_m: 2.0,
    pose: 'chin slightly down, eyes up to camera, shoulders square or slight turn',
    notes: 'Subject faces camera directly. The symmetry of butterfly lighting demands frontal posing. Chin-down is critical to keep the butterfly shadow small.',
  },

  environmentConstraints: {
    minCeilingHeight_ft: 9,
    minRoomWidth_ft: 8,
    minDepth_ft: 12,
    backgroundNeeds: 'white, light grey, or clean solid for beauty; dark for drama',
    notes: 'Ceiling height matters — the key must be above the subject with room for a boom arm. In low-ceiling rooms, have the subject sit on a low stool.',
  },

  expectedShadowPatterns: [
    'Symmetrical butterfly-shaped shadow directly under the nose',
    'Shadow under chin, lifted by clamshell fill',
    'Cheekbone highlights are pronounced and symmetrical',
    'Eye sockets gently shadowed, opened by fill',
    'No shadow on either cheek (pattern is symmetrical)',
    'Catchlight centered at 12 o\'clock',
  ],

  failureModes: [
    { problem: 'Butterfly shadow too long (covers upper lip)', cause: 'Key too high', fix: 'Lower key until butterfly shadow is 1/3 the distance between nose and lip' },
    { problem: 'Raccoon eyes (dark eye sockets)', cause: 'Key too high, no clamshell fill', fix: 'Add reflector below chin and lower key 6 inches' },
    { problem: 'No butterfly shadow', cause: 'Key too low (at eye level or below)', fix: 'Raise key to 1-2 ft above forehead' },
    { problem: 'Asymmetric shadows', cause: 'Key not centered on camera axis', fix: 'Move key to directly above the lens — use a boom arm if needed' },
    { problem: 'Flat, dimensionless face', cause: 'Fill too strong or key too soft', fix: 'Pull reflector back 6 inches; consider switching from softbox to beauty dish for more contrast' },
    { problem: 'Hot spot on forehead', cause: 'Key too close', fix: 'Move key back 6 inches or feather it past the forehead' },
  ],

  gearSubstitutions: [
    { ifMissing: 'beauty_dish', use: 'softbox_octa', tradeoff: 'Softer, less contrasty; loses the signature beauty-dish "pop"; still works for beauty' },
    { ifMissing: 'beauty_dish', use: 'umbrella_reflective', tradeoff: 'More spill, less controlled; silver umbrella at 3 ft approximates the contrast' },
    { ifMissing: 'reflector', use: 'white foam board', tradeoff: 'Same quality; tape to a small light stand at waist height' },
    { ifMissing: 'stripbox', use: 'bare_bulb', tradeoff: 'Harder hair light; lower power and move back to compensate' },
  ],

  distanceTable: {
    keyToSubject_ft: 3.5,
    fillToSubject_ft: 2.5,
    hairLightToSubject_ft: 4,
    cameraToSubject_ft: 7,
    subjectToBackground_ft: 6,
  },

  reliability: {
    score: 88,
    label: 'Reliable',
    notes: 'Very reliable for beauty and glamour. Requires more precision than Loop or Rembrandt — key height is critical. Works best with subjects who can hold still with chin-down posing.',
  },

  ruleEngineInsights: [
    { condition: 'mood = beauty AND subject = headshot', action: 'recommend Butterfly/Clamshell as primary option' },
    { condition: 'mood = beauty AND modifier_available INCLUDES beauty_dish', action: 'prefer beauty_dish over softbox for key' },
    { condition: 'ceiling_height < 9ft', action: 'suggest seated subject to create clearance for overhead key' },
    { condition: 'skin_tone = dark', action: 'switch fill to silver reflector for stronger bounce; increase key distance by 6 inches' },
    { condition: 'glasses = true', action: 'avoid Butterfly; switch to Loop — overhead centered key guarantees glasses glare' },
  ],

  referenceImageSignature: {
    pattern: 'clamshell',
    diagnosticFeatures: [
      'Symmetrical butterfly shadow under nose',
      'Centered catchlight at 12 o\'clock',
      'Pronounced cheekbone highlights, symmetrical',
      'Minimal or no shadow on cheeks',
    ],
    catchlightExpected: { count: 1, position: '11-1 o\'clock (centered)', shape: 'round (beauty dish) or octagonal' },
    shadowMap: { noseShadow: 'small butterfly directly under nose, symmetrical', cheekShadow: 'none — symmetrical illumination', jawShadow: 'gentle under chin, opened by fill' },
    lightCount: { min: 1, typical: 2, max: 3 },
    keyPosition: 'centered, directly above camera axis',
    backgroundExpected: 'white or light grey for beauty; clean and even',
  },
};


// ─── 4. CARAVAGGIO CHIAROSCURO ──────────────────────────────────────
// Extreme contrast from a single directional source. Caravaggio painted
// with a single skylight in his Roman studio; John Alton codified this
// for cinema as "painting with light." Modern cinematic portraiture
// (Gregory Heisler, Annie Leibovitz character work) draws directly from
// this tradition. The key is the ONLY source — fill is ambient spill only.

export const CARAVAGGIO_CHIAROSCURO = {
  id: 'master-caravaggio-chiaroscuro',
  styleName: 'Caravaggio Chiaroscuro',
  masters: ['Caravaggio', 'John Alton', 'Gregory Heisler'],
  category: 'portrait',
  moods: ['low_key', 'cinematic'],
  businessPriority: 4,

  creativeIntent: {
    goal: 'extreme dramatic contrast with subject emerging from darkness',
    emotion: 'intensity, mystery, psychological depth, cinematic gravitas',
    use: 'character portraits, book covers, film posters, dramatic editorial, fine art',
  },

  lightGeometry: {
    key: {
      angle_deg: 60,
      height: 'slightly above subject forehead, angled steeply down 40-50 degrees',
      height_m: 2.0,
      distance_m: 1.4,
      distance_ft: '4-6',
      modifier: ['grid_spot', 'bare_bulb', 'grid'],
      preferredModifier: 'grid_spot',
      notes: 'Hard, directional source. Caravaggio used a single overhead skylight; we replicate with a gridded strobe or bare bulb at 60 degrees. The grid prevents spill onto the background. This is NOT soft light — the shadow edges should be sharp and defined.',
    },
    fill: null,
    rim: null,
    background: null,
  },

  cameraPosition: {
    lens: '85-135mm',
    distance_ft: '8-12',
    distance_m: 3.0,
    height: 'at or slightly below subject eye level',
    angle: 'straight-on or slight upward (heroic angle)',
    notes: 'Longer lens compresses features and keeps the photographer out of the light pool. Slight upward angle adds authority. Camera below eye level is Alton\'s "mystery shot."',
  },

  subjectPosition: {
    distanceFromBackground_ft: '8-12',
    distanceFromBackground_m: 3.0,
    pose: 'turned 30-45 degrees toward key, or looking away from key for mystery',
    notes: 'Maximum distance from background to let it fall to pure black. No background light. The subject must be isolated in a pool of light surrounded by darkness.',
  },

  environmentConstraints: {
    minCeilingHeight_ft: 9,
    minRoomWidth_ft: 10,
    minDepth_ft: 18,
    backgroundNeeds: 'black preferred; any dark surface at 8+ ft distance works',
    notes: 'Room depth matters most — the background must fall to black via inverse square law. Painted walls should be dark. Use v-flats (black side) to prevent bounce fill if walls are light.',
  },

  expectedShadowPatterns: [
    'Half or more of the face in deep shadow',
    'Sharp shadow edges (hard light source)',
    'Background falls to pure or near-pure black',
    'Strong highlight-to-shadow contrast (4:1 to 8:1 ratio)',
    'Visible texture and dimension in the lit areas',
    'Catchlight in key-side eye only, small and defined',
    'Shadow side of face merges with background',
  ],

  failureModes: [
    { problem: 'Shadows not dark enough', cause: 'Ambient light or wall bounce filling shadows', fix: 'Block ambient: close blinds, turn off room lights, add black v-flats beside subject' },
    { problem: 'Background not black', cause: 'Subject too close to background or key spilling', fix: 'Move subject to 8+ ft from background; grid the key; flag the bottom edge' },
    { problem: 'Shadows too deep, no detail at all', cause: 'Key too contrasty for the sensor', fix: 'Add a very subtle reflector at 3+ stops below key, 6+ ft away on shadow side' },
    { problem: 'Face looks harsh, every pore visible', cause: 'Hard light at close range', fix: 'Move key 1-2 ft further back; this is the style — but soften slightly with light diffusion if needed for skin' },
    { problem: 'Spill on background creating hot spot', cause: 'No grid on key', fix: 'Add 20-degree grid to strobe, or use barn doors to flag bottom spill' },
  ],

  gearSubstitutions: [
    { ifMissing: 'grid_spot', use: 'bare_bulb', tradeoff: 'More spill; will need black flags on both sides of key; more dramatic point-source quality' },
    { ifMissing: 'grid_spot', use: 'snoot', tradeoff: 'Very tight beam; less coverage; may need to increase distance' },
    { ifMissing: 'strobe_mono', use: 'fresnel', tradeoff: 'Continuous light with WYSIWYG preview; perfect for this style; lower power requires ISO adjustment' },
    { ifMissing: 'strobe_mono', use: 'speedlight', tradeoff: 'Bare speedlight at distance gives hard point-source quality; lower power limits working distance' },
  ],

  distanceTable: {
    keyToSubject_ft: 5,
    cameraToSubject_ft: 10,
    subjectToBackground_ft: 10,
  },

  reliability: {
    score: 78,
    label: 'Reliable',
    notes: 'Highly reliable when the room is properly controlled. The main risk is ambient contamination — light bouncing off walls and ceiling. Dark environments perform best.',
  },

  ruleEngineInsights: [
    { condition: 'mood = low_key AND subject = headshot', action: 'recommend Caravaggio as primary option' },
    { condition: 'mood = cinematic AND key_angle > 50deg', action: 'suggest Caravaggio variant' },
    { condition: 'environment = office OR environment = home_studio', action: 'warn: ambient control difficult; add v-flats or black cloth' },
    { condition: 'wall_color = light', action: 'warn: wall bounce will fill shadows; add negative fill' },
    { condition: 'skin_tone = dark', action: 'increase key power for skin luminance; consider slight fill at 3+ stops for shadow detail' },
    { condition: 'subject_to_background < 6ft', action: 'warn: background will not fall to black; increase distance or flag the key' },
  ],

  referenceImageSignature: {
    pattern: 'split/short',
    diagnosticFeatures: [
      'Half or more of face in deep shadow',
      'Sharp shadow edges (hard light)',
      'Background falls to black or near-black',
      'High contrast ratio (4:1 to 8:1)',
      'Shadow side merges with background',
    ],
    catchlightExpected: { count: 1, position: '10-11 o\'clock or 1-2 o\'clock', shape: 'small, defined point or grid pattern' },
    shadowMap: { noseShadow: 'strong, sharp-edged, connected to deep cheek shadow', cheekShadow: 'deep shadow covering half the face', jawShadow: 'extreme contrast' },
    lightCount: { min: 1, typical: 1, max: 2 },
    keyPosition: '55-70 degrees, high and angled down steeply',
    backgroundExpected: 'black or near-black, no visible spill',
  },
};


// ─── 5. VERMEER WINDOW LIGHT ────────────────────────────────────────
// Johannes Vermeer painted almost exclusively with north-facing window
// light in his Delft studio. The large, soft, directional source at
// 60-90 degrees creates luminous skin with gentle, rolling shadows.
// This is the foundation of "natural light" portraiture and the look
// that lifestyle/branding photographers replicate with large softboxes.

export const VERMEER_WINDOW = {
  id: 'master-vermeer-window',
  styleName: 'Vermeer Window Light',
  masters: ['Johannes Vermeer', 'Annie Leibovitz', 'Peter Lindbergh'],
  category: 'portrait',
  moods: ['natural', 'editorial'],
  businessPriority: 5,

  creativeIntent: {
    goal: 'luminous, painterly portrait with soft directional light',
    emotion: 'intimacy, warmth, quiet beauty, timelessness',
    use: 'lifestyle branding, author portraits, engagement sessions, fine art, maternity',
  },

  lightGeometry: {
    key: {
      angle_deg: 75,
      height: 'large source spanning subject head to waist',
      height_m: 1.8,
      distance_m: 0.8,
      distance_ft: '2-3',
      modifier: ['softbox_rect', 'diffusion_panel'],
      preferredModifier: 'softbox_rect',
      notes: 'Very large source (4x6 ft softbox or larger) placed at 60-90 degrees, as close to the subject as framing allows. The size-to-distance ratio is what creates the Vermeer quality — the modifier should appear as large as or larger than the subject. A diffusion panel with a strobe behind it is the closest to actual window light.',
    },
    fill: {
      position: 'white reflector or wall on opposite side',
      angle_deg: -75,
      height_m: 1.5,
      distance_m: 1.2,
      modifier: ['reflector'],
      preferredModifier: 'reflector',
      ratio: '-1.5 to -2 stops from key',
      notes: 'A white wall, white foam board, or large white reflector on the shadow side. This replicates the way Vermeer\'s studio walls bounced light back into the shadows. Do not use a second strobe for fill — it kills the natural quality.',
    },
    rim: null,
    background: null,
  },

  cameraPosition: {
    lens: '50-85mm',
    distance_ft: '6-10',
    distance_m: 2.5,
    height: 'at subject eye level',
    angle: 'straight-on or 3/4 from shadow side',
    notes: 'Wider lenses (50mm) are common for environmental framing that includes the window or room context. For tighter portraits, 85mm maintains the intimate quality.',
  },

  subjectPosition: {
    distanceFromBackground_ft: '3-6',
    distanceFromBackground_m: 1.5,
    pose: 'turned toward the light source, face catching the window light',
    notes: 'Subject can be close to background for environmental context. The background gets its own quality of light from the same source. This is not about isolating the subject — it is about placing them within a lit environment.',
  },

  environmentConstraints: {
    minCeilingHeight_ft: 8,
    minRoomWidth_ft: 10,
    minDepth_ft: 12,
    backgroundNeeds: 'any — room walls, simple backdrop, environmental setting',
    notes: 'For actual window light: north-facing window is ideal (no direct sun). For replication: place a 4x6 ft softbox or diffusion panel at 60-90 degrees. The room itself becomes part of the image.',
  },

  expectedShadowPatterns: [
    'Soft, rolling shadow transitions across the face',
    'Gradual light falloff from key side to shadow side',
    'Luminous skin quality with visible but gentle shadows',
    'No hard shadow edges anywhere',
    'Background receives some of the same light (environmental)',
    'Catchlight is large, rectangular (window-shaped)',
  ],

  failureModes: [
    { problem: 'Shadows too deep, not luminous', cause: 'Source too far away or too small', fix: 'Move softbox closer (2-3 ft from subject); use a larger modifier' },
    { problem: 'Light looks artificial, not like window light', cause: 'Source too hard or too direct', fix: 'Add a layer of diffusion; bounce into a white wall instead of direct softbox' },
    { problem: 'Color mismatch (warm ambient, cool strobe)', cause: 'Mixed color temperatures', fix: 'Gel strobe with 1/4 CTO to match warm interior; or set WB to match the strobe and let ambient go warm' },
    { problem: 'Background too dark', cause: 'Subject too far from background', fix: 'Move subject closer to background; allow light to wrap into the scene' },
    { problem: 'Flat, no dimension', cause: 'Source too large relative to angle', fix: 'Move source further to the side (closer to 90 degrees) for more wrap and shadow' },
  ],

  gearSubstitutions: [
    { ifMissing: 'softbox_rect', use: 'diffusion_panel', tradeoff: 'Better quality — closer to real window light; requires a strobe behind the panel' },
    { ifMissing: 'softbox_rect', use: 'umbrella_shoot_through', tradeoff: 'Wider spill; less directional; works if placed very close to subject' },
    { ifMissing: 'strobe_mono', use: 'led_panel', tradeoff: 'Continuous light is actually ideal for this style — WYSIWYG, no harsh pops' },
    { ifMissing: 'reflector', use: 'white wall', tradeoff: 'Place subject 3-4 ft from a white wall on the shadow side; perfect fill' },
  ],

  distanceTable: {
    keyToSubject_ft: 2.5,
    fillToSubject_ft: 4,
    cameraToSubject_ft: 8,
    subjectToBackground_ft: 4,
  },

  reliability: {
    score: 90,
    label: 'Very Reliable',
    notes: 'Extremely reliable when using a large enough source. The softness forgives posing errors. The main risk is the light looking "artificial" if the modifier is too small or too far.',
  },

  ruleEngineInsights: [
    { condition: 'mood = natural AND subject IN (headshot, half_body)', action: 'recommend Vermeer Window as primary option' },
    { condition: 'environment = home_studio OR environment = on_location_indoor', action: 'recommend Vermeer; use actual window if available' },
    { condition: 'modifier_available INCLUDES diffusion_panel', action: 'prefer diffusion_panel over softbox for Vermeer' },
    { condition: 'skin_tone = dark', action: 'move source 6 inches closer for more wrap; use silver reflector for fill instead of white' },
    { condition: 'modifier_size < 3ft', action: 'warn: modifier too small for Vermeer quality; move much closer or switch to larger source' },
  ],

  referenceImageSignature: {
    pattern: 'loop',
    diagnosticFeatures: [
      'Very soft, rolling shadow transitions',
      'Large rectangular catchlight (window-shaped)',
      'Luminous skin quality',
      'Environmental background lit by same source',
    ],
    catchlightExpected: { count: 1, position: '9-10 o\'clock or 2-3 o\'clock (window angle)', shape: 'large rectangular' },
    shadowMap: { noseShadow: 'very soft, gradual transition', cheekShadow: 'gentle rolling falloff', jawShadow: 'soft, minimal' },
    lightCount: { min: 1, typical: 1, max: 2 },
    keyPosition: '60-90 degrees, very close, large source',
    backgroundExpected: 'environmental, receiving light from same source',
  },
};


// ─── 6. AVEDON HIGH-KEY CLEAN ───────────────────────────────────────
// Richard Avedon's white-background portraits strip away context to
// focus entirely on the person. The pure white background requires
// background lights at +1 to +2 stops over key. Clean, even illumination
// on the subject with minimal shadow. Karl Taylor's commercial workflow
// builds on this foundation for product and corporate photography.

export const AVEDON_HIGH_KEY = {
  id: 'master-avedon-high-key',
  styleName: 'Avedon High-Key Clean',
  masters: ['Richard Avedon', 'Karl Taylor', 'Martin Schoeller'],
  category: 'commercial',
  moods: ['high_key', 'corporate'],
  businessPriority: 6,

  creativeIntent: {
    goal: 'pure white background with clean, even subject illumination',
    emotion: 'clarity, directness, professionalism, modernity',
    use: 'corporate headshots, e-commerce, team pages, white-background portraits, casting cards',
  },

  lightGeometry: {
    key: {
      angle_deg: 15,
      height: 'slightly above eye level',
      height_m: 1.85,
      distance_m: 1.0,
      distance_ft: '3-4',
      modifier: ['softbox_rect', 'softbox_octa', 'beauty_dish'],
      preferredModifier: 'softbox_rect',
      notes: 'Key nearly on-axis (10-20 degrees) for even illumination. The goal is flattering but not flat — just enough angle for modeling. Large softbox or octa at 3-4 ft.',
    },
    fill: {
      position: 'opposite side at camera axis',
      angle_deg: -15,
      height_m: 1.6,
      distance_m: 1.2,
      modifier: ['softbox_rect', 'reflector'],
      preferredModifier: 'softbox_rect',
      ratio: '-0.5 to -1 stop from key',
      notes: 'Strong fill (3:2 ratio or less). The goal is low contrast on the face. For corporate volume work, some photographers use two equal lights at 45 degrees each.',
    },
    rim: {
      position: 'behind subject from above or both sides',
      angle_deg: 150,
      height_m: 2.2,
      distance_m: 1.5,
      modifier: ['stripbox'],
      preferredModifier: 'stripbox',
      ratio: '-0.5 stops from key',
      notes: 'Separates the subject from the white background. Without rim/hair light, blonde hair disappears into white. Use strip boxes from behind on both sides for editorial volume work.',
    },
    background: {
      position: 'two lights aimed at white seamless, evenly',
      angle_deg: 180,
      height_m: 1.2,
      distance_m: 0.5,
      modifier: ['bare_bulb', 'umbrella_reflective'],
      preferredModifier: 'bare_bulb',
      ratio: '+1 to +2 stops over key reading',
      notes: 'Background lights must blow the white seamless to pure white (250-255 RGB) without spilling onto the subject. Two lights at 45 degrees to the background, evenly metered. Subject must be 6+ ft from background to prevent backlight wrapping onto the subject.',
    },
  },

  cameraPosition: {
    lens: '85-105mm',
    distance_ft: '8-10',
    distance_m: 2.5,
    height: 'at subject eye level',
    angle: 'straight-on',
    notes: 'Avedon shot on medium format at eye level. The frontal, direct gaze was his signature. For commercial work, 105mm at 8-10 ft gives headshot framing.',
  },

  subjectPosition: {
    distanceFromBackground_ft: '6-10',
    distanceFromBackground_m: 2.5,
    pose: 'square to camera, direct gaze, minimal expression',
    notes: 'Avedon famously kept subjects still and direct. For commercial: square shoulders, direct gaze, approachable expression. The subject MUST be far enough from the background to prevent wrap-around spill.',
  },

  environmentConstraints: {
    minCeilingHeight_ft: 9,
    minRoomWidth_ft: 12,
    minDepth_ft: 18,
    backgroundNeeds: 'white seamless paper or white cyclorama wall, minimum 9 ft wide',
    notes: 'Requires space. Need room for 2 background lights + 6-10 ft gap + subject + key light + camera. Total depth 18+ ft. Width must accommodate seamless and both background lights.',
  },

  expectedShadowPatterns: [
    'Minimal shadows on face (low-contrast ratio)',
    'Pure white background (250-255 RGB)',
    'Clean edge separation via hair/rim light',
    'Even illumination across subject',
    'No background shadows or spill patterns',
    'Catchlights at 10 and 2 o\'clock (from two-light setup)',
  ],

  failureModes: [
    { problem: 'Background not pure white (appears grey)', cause: 'Background lights too weak', fix: 'Increase background lights to +1.5 stops over key metered at the background surface' },
    { problem: 'Subject has light wrap / halo on edges', cause: 'Subject too close to overlit background', fix: 'Move subject to 8+ ft from background; add black flags behind subject to block backlight spill' },
    { problem: 'Lens flare from background', cause: 'Background lights visible to lens', fix: 'Flag background lights from camera; use a lens hood; ensure no direct line of sight from bg lights to lens' },
    { problem: 'Subject disappears into white background', cause: 'No rim/hair light separation', fix: 'Add strip boxes from behind subject on both sides at -0.5 stops from key' },
    { problem: 'Uneven background (hot spots)', cause: 'Background lights not evenly aimed', fix: 'Meter across the background at 5 points; adjust aim and power until readings are within 1/3 stop' },
  ],

  gearSubstitutions: [
    { ifMissing: 'bare_bulb', use: 'umbrella_reflective', tradeoff: 'Wider, more even coverage on background; slightly harder to control spill' },
    { ifMissing: 'stripbox', use: 'grid_spot', tradeoff: 'Tighter rim; works for headshot but less coverage for half-body' },
    { ifMissing: 'softbox_rect', use: 'umbrella_shoot_through', tradeoff: 'More spill; harder to keep off the background; add a flag if needed' },
  ],

  distanceTable: {
    keyToSubject_ft: 4,
    fillToSubject_ft: 4,
    rimToSubject_ft: 5,
    backgroundLightToBackground_ft: 4,
    cameraToSubject_ft: 9,
    subjectToBackground_ft: 8,
  },

  reliability: {
    score: 82,
    label: 'Reliable',
    notes: 'Reliable when properly metered. The main complexity is the 4-5 light setup and precise background metering. Once dialed in, it is repeatable for high-volume sessions.',
  },

  ruleEngineInsights: [
    { condition: 'mood = high_key', action: 'recommend Avedon High-Key as primary option' },
    { condition: 'mood = corporate AND background = white', action: 'recommend Avedon High-Key variant' },
    { condition: 'room_depth < 16ft', action: 'warn: insufficient depth for proper high-key separation; subject will have background spill' },
    { condition: 'light_count < 4', action: 'warn: high-key requires 4+ lights (key, fill, 2x background); suggest 2-light variant with white wall close-up' },
    { condition: 'subject_to_background < 6ft', action: 'critical: background wrap will contaminate subject; increase distance immediately' },
  ],

  referenceImageSignature: {
    pattern: 'loop',
    diagnosticFeatures: [
      'Pure white background (250+ RGB)',
      'Low contrast on subject face',
      'Even illumination, minimal shadows',
      'Clean edge separation from background',
    ],
    catchlightExpected: { count: 2, position: '10 and 2 o\'clock', shape: 'rectangular or octagonal' },
    shadowMap: { noseShadow: 'minimal, very short', cheekShadow: 'nearly absent', jawShadow: 'gentle, filled' },
    lightCount: { min: 3, typical: 4, max: 5 },
    keyPosition: '10-20 degrees, near camera axis',
    backgroundExpected: 'pure white, 250-255 RGB, no gradient',
  },
};


// ─── 7. MEISEL FASHION FLASH ─────────────────────────────────────────
// Steven Meisel's signature: on-camera flash or controlled frontal
// flash creating harsh, editorial shadows. Also known for the "black
// booth" subtractive technique — placing the subject in a black-draped
// booth and controlling a single overhead octabox with flags. Every
// Italian Vogue cover from 1988 onward, every Prada campaign since 2004.
// Gear: Pentax 67 (later digital), on-camera flash, octabox.

export const MEISEL_FASHION_FLASH = {
  id: 'master-meisel-fashion-flash',
  styleName: 'Meisel Fashion Flash',
  masters: ['Steven Meisel', 'Terry Richardson'],
  category: 'fashion',
  moods: ['editorial', 'high_key'],
  businessPriority: 7,

  creativeIntent: {
    goal: 'raw, editorial energy — the anti-studio look',
    emotion: 'provocative, immediate, confrontational, modern',
    use: 'fashion editorial, magazine covers, campaign imagery, social commentary',
  },

  lightGeometry: {
    key: {
      angle_deg: 0,
      height: 'at camera (on-camera flash) or slightly above',
      height_m: 1.7,
      distance_m: 0.0,
      distance_ft: '0 (on-camera)',
      modifier: ['bare_bulb'],
      preferredModifier: 'bare_bulb',
      notes: 'On-camera flash aimed directly at the subject. The point is NOT to flatter — it is to create raw, immediate energy. Hard shadows fall directly behind the subject. For the "black booth" variant, use a controlled octabox overhead instead.',
    },
  },

  cameraPosition: {
    lens: '50-105mm (Pentax 67 standard to short tele)',
    distance_ft: '4-8',
    distance_m: 2.0,
    height: 'at eye level',
    angle: 'direct, confrontational',
    notes: 'Meisel shot on Pentax 67 medium format. The direct, head-on framing is intentional — the camera is an active participant, not a passive observer.',
  },

  subjectPosition: {
    distanceFromBackground_ft: '2-4 (close, hard shadow visible) or 10+ (black booth)',
    distanceFromBackground_m: 1.0,
    pose: 'dynamic, theatrical, often mid-motion',
    notes: 'Models display theatrical presence and powerful gestures. The energy comes from the subject as much as the light.',
  },

  referenceImageSignature: {
    pattern: 'flat',
    diagnosticFeatures: [
      'Hard flash shadow directly behind subject',
      'Flat, even illumination on face (axis light)',
      'High contrast between lit subject and shadow',
      'Red-eye potential (on-camera flash near lens axis)',
    ],
    catchlightExpected: { count: 1, position: 'centered', shape: 'round (from flash head)' },
    shadowMap: { noseShadow: 'directly behind, hard', cheekShadow: 'minimal (flat light)', jawShadow: 'hard shadow cast on background' },
    lightCount: { min: 1, typical: 1, max: 3 },
    keyPosition: 'at camera position (0 degrees)',
    backgroundExpected: 'hard shadow silhouette or black (booth technique)',
  },
};


// ─── 8. DEMARCHELIER NATURAL FASHION ─────────────────────────────────
// Patrick Demarchelier's deceptively simple approach: one light, near
// the camera axis, expertly balanced with ambient. The resulting images
// feel natural and effortless, but the ambient/strobe balance requires
// masterful metering. Elinchrom octabox + reflector is his standard kit.
// Cameras: Hasselblad 553ELX, Mamiya RZ67, Nikon F5, Linhof 4x5.

export const DEMARCHELIER_NATURAL = {
  id: 'master-demarchelier-natural',
  styleName: 'Demarchelier Natural Fashion',
  masters: ['Patrick Demarchelier'],
  category: 'fashion',
  moods: ['natural', 'beauty', 'editorial'],
  businessPriority: 8,

  creativeIntent: {
    goal: 'effortless elegance — light serves the person, not the photographer',
    emotion: 'approachable, relaxed, casually beautiful, modern classic',
    use: 'fashion editorial, beauty campaigns, celebrity portraits, lifestyle luxury',
  },

  lightGeometry: {
    key: {
      angle_deg: 5,
      height: 'slightly above eye level',
      height_m: 1.85,
      distance_m: 1.2,
      distance_ft: '3-4',
      modifier: ['softbox_octa'],
      preferredModifier: 'softbox_octa',
      notes: 'Single Elinchrom 39" octabox positioned very near the camera axis. The cast shadow should be barely visible to the lens. Balance strobe output 1-2 stops below ambient for the signature natural feel.',
    },
    fill: {
      position: 'opposite key, close to subject',
      angle_deg: -5,
      height_m: 1.5,
      distance_m: 0.8,
      modifier: ['reflector'],
      preferredModifier: 'reflector',
      ratio: '-1.5 to -2 stops from key',
      notes: 'White reflector or foam core. Passive fill only — no powered fill. The reflector opens shadows just enough to retain detail without flattening the image.',
    },
  },

  cameraPosition: {
    lens: '85-135mm (Hasselblad or Mamiya standard portrait lenses)',
    distance_ft: '6-10',
    distance_m: 2.5,
    height: 'at eye level',
    angle: 'direct but relaxed',
    notes: 'Demarchelier chose his camera format based on mood each morning — Hasselblad, Mamiya RZ67, Pentax 67, Nikon F5, or even a Linhof 4x5. The camera serves the vision, never the reverse.',
  },

  subjectPosition: {
    distanceFromBackground_ft: 'varies (studio or location)',
    distanceFromBackground_m: 2.0,
    pose: 'relaxed, natural, often mid-motion',
    notes: 'Demarchelier preferred "large, atmospheric spaces" and natural environments. His subjects appear casual and relaxed — the lighting never dominates.',
  },

  referenceImageSignature: {
    pattern: 'loop',
    diagnosticFeatures: [
      'Minimal visible flash shadow (axis light near camera)',
      'Expert ambient/strobe balance — flash barely noticeable',
      'Soft, natural skin rendering',
      'Clean, simple catchlights',
    ],
    catchlightExpected: { count: 1, position: '12 o\'clock', shape: 'octagonal' },
    shadowMap: { noseShadow: 'tiny loop, barely visible', cheekShadow: 'very soft, open', jawShadow: 'gentle, natural' },
    lightCount: { min: 1, typical: 1, max: 2 },
    keyPosition: 'near camera axis, slightly above',
    backgroundExpected: 'natural environment or clean studio',
  },
};


// ─── 9. WILLIAMS BEAUTY PRECISION ────────────────────────────────────
// Tamara Williams's signature clean beauty lighting: precise, controlled
// illumination that reveals skin texture and cosmetic detail without
// harshness. The focus is on perfection — every highlight and shadow is
// intentional, designed to translate seamlessly from capture to her
// signature high-end retouching workflow. 22 years of beauty expertise.

export const WILLIAMS_BEAUTY = {
  id: 'master-williams-beauty',
  styleName: 'Williams Beauty Precision',
  masters: ['Tamara Williams', 'Lindsay Adler'],
  category: 'beauty',
  moods: ['beauty', 'editorial'],
  businessPriority: 9,

  creativeIntent: {
    goal: 'precision beauty — every highlight and shadow is intentional',
    emotion: 'polished, clean, aspirational, perfected',
    use: 'beauty campaigns, cosmetics, skincare, hair, magazine beauty editorials',
  },

  lightGeometry: {
    key: {
      angle_deg: 10,
      height: 'above eye level, aimed slightly down',
      height_m: 2.0,
      distance_m: 0.8,
      distance_ft: '2.5-3',
      modifier: ['beauty_dish', 'softbox_octa'],
      preferredModifier: 'beauty_dish',
      notes: 'Beauty dish (22" white) or medium octa very close to the subject. The proximity creates wrap with controlled specular highlights that define facial structure. For skincare campaigns, a larger softbox (36x48) at similar distance gives softer specular for smoother skin rendering.',
    },
    fill: {
      position: 'below chin, white reflector or foam core',
      angle_deg: 0,
      height_m: 0.8,
      distance_m: 0.3,
      modifier: ['reflector'],
      preferredModifier: 'reflector',
      ratio: '-1 stop from key (bright fill)',
      notes: 'White reflector or silver reflector positioned just below chin creates the classic clamshell fill. For cosmetic detail, the fill must be strong enough to see product texture in the shadows.',
    },
  },

  cameraPosition: {
    lens: '100mm macro or 85mm',
    distance_ft: '3-5',
    distance_m: 1.2,
    height: 'at eye level to slightly above',
    angle: 'straight-on or very slight angle',
    notes: 'Beauty work demands macro-level sharpness. Williams emphasises a precise, clear workflow — consistent framing allows her signature retouching process to work efficiently.',
  },

  subjectPosition: {
    distanceFromBackground_ft: '4-6',
    distanceFromBackground_m: 1.5,
    pose: 'direct to camera, chin slightly lifted, eyes to lens',
    notes: 'Beauty photography demands precise head position relative to the key light. Small movements shift specular highlights dramatically on cosmetic products and skin.',
  },

  referenceImageSignature: {
    pattern: 'butterfly',
    diagnosticFeatures: [
      'Butterfly shadow under nose (centered key above)',
      'Visible skin texture with controlled specular highlights',
      'Clean, bright catchlights',
      'Even illumination across both sides of the face',
      'Clamshell fill visible in shadow areas',
    ],
    catchlightExpected: { count: 1, position: '12 o\'clock', shape: 'round (beauty dish) or octagonal' },
    shadowMap: { noseShadow: 'butterfly shape below nose', cheekShadow: 'soft, sculpted', jawShadow: 'filled by reflector below' },
    lightCount: { min: 1, typical: 2, max: 3 },
    keyPosition: 'centered above, 0-10 degrees off-axis, high',
    backgroundExpected: 'clean white, grey, or solid color',
  },
};


// ─── 10. KADEL EDITORIAL DRAMA ───────────────────────────────────────
// Greg Kadel's theatrical approach to fashion: classical imagery with
// a modern edge. Powerful gestures, dramatic environments, and lighting
// that serves the narrative. Prefers location over studio — hallways,
// hotel corridors, and street scenes are his stage. When in studio,
// the lighting is cinematic rather than commercial.

export const KADEL_EDITORIAL = {
  id: 'master-kadel-editorial',
  styleName: 'Kadel Editorial Drama',
  masters: ['Greg Kadel', 'Peter Lindbergh'],
  category: 'fashion',
  moods: ['editorial', 'cinematic', 'low_key'],
  businessPriority: 10,

  creativeIntent: {
    goal: 'theatrical fashion imagery — classical composition with modern intensity',
    emotion: 'dramatic, powerful, narrative, cinematic',
    use: 'fashion editorial, luxury campaigns, brand imagery, artistic commissions',
  },

  lightGeometry: {
    key: {
      angle_deg: 45,
      height: 'above eye level, dramatic elevation',
      height_m: 2.2,
      distance_m: 1.5,
      distance_ft: '4-6',
      modifier: ['softbox_rect', 'grid_spot'],
      preferredModifier: 'softbox_rect',
      notes: 'Kadel blends natural light with controlled studio sources. On location, the environment provides the key and strobes fill or accent. In studio, a large softbox at 45 degrees creates cinematic dimension while maintaining enough detail for fashion work.',
    },
    fill: {
      position: 'negative fill or minimal active fill',
      angle_deg: -45,
      height_m: 1.6,
      distance_m: 2.0,
      modifier: ['v_flat'],
      preferredModifier: 'v_flat',
      ratio: '-2 to -3 stops from key',
      notes: 'Kadel embraces shadow as a compositional element. Black V-flat for negative fill on the shadow side. When fill is needed, it is subtle and motivated by the environment.',
    },
  },

  cameraPosition: {
    lens: '50-85mm',
    distance_ft: '6-12',
    distance_m: 3.0,
    height: 'at eye level to slightly low',
    angle: 'dynamic, often angled',
    notes: 'Kadel frames for gesture and environment — the model interacts with the space. Wider lenses when the location is the story, tighter when the face is.',
  },

  subjectPosition: {
    distanceFromBackground_ft: 'integrated with environment',
    distanceFromBackground_m: 2.0,
    pose: 'theatrical, powerful gestures, often full-body',
    notes: 'Models display theatrical presence. Hallways, hotel corridors, and architectural spaces are preferred backdrops. The subject inhabits the space rather than posing in front of it.',
  },

  referenceImageSignature: {
    pattern: 'rembrandt',
    diagnosticFeatures: [
      'Strong directional light creating dramatic shadows',
      'Environmental integration — light feels motivated by the space',
      'High contrast with retained shadow detail',
      'Fashion garments visible and well-lit despite dramatic mood',
    ],
    catchlightExpected: { count: 1, position: '10 o\'clock (camera left) or 2 o\'clock', shape: 'rectangular or environmental' },
    shadowMap: { noseShadow: 'loop to rembrandt', cheekShadow: 'dramatic with detail', jawShadow: 'sculpted, defining' },
    lightCount: { min: 1, typical: 2, max: 4 },
    keyPosition: '45 degrees off-axis, elevated, dramatic',
    backgroundExpected: 'environmental — architectural, urban, or studio with narrative backdrop',
  },
};


// ─── MASTER INDEX ────────────────────────────────────────────────────

export const MASTER_LIGHTING = [
  REMBRANDT_PORTRAIT,
  LOOP_LIGHTING,
  BUTTERFLY_BEAUTY,
  CARAVAGGIO_CHIAROSCURO,
  VERMEER_WINDOW,
  AVEDON_HIGH_KEY,
  MEISEL_FASHION_FLASH,
  DEMARCHELIER_NATURAL,
  WILLIAMS_BEAUTY,
  KADEL_EDITORIAL,
];

/** Look up a master lighting style by id */
export function getMasterStyle(id) {
  return MASTER_LIGHTING.find(m => m.id === id) || null;
}

/** Find master styles that match a mood */
export function getMasterStylesForMood(mood) {
  return MASTER_LIGHTING.filter(m => m.moods.includes(mood))
    .sort((a, b) => a.businessPriority - b.businessPriority);
}

/** Find the best master reference image signature for a detected pattern */
export function matchMasterToDetectedPattern(pattern) {
  return MASTER_LIGHTING.filter(m => m.referenceImageSignature.pattern === pattern)
    .sort((a, b) => a.businessPriority - b.businessPriority);
}

/**
 * Decision rules: given a context, return the recommended master style.
 * Follows the priority order of what working photographers bill most for.
 */
export function recommendMasterStyle({ mood, subject, environment, glasses }) {
  // Glasses override: avoid Butterfly (guaranteed glare from overhead centered key)
  if (glasses && mood === 'beauty') {
    return LOOP_LIGHTING;
  }

  const moodMap = {
    corporate: LOOP_LIGHTING,
    beauty: BUTTERFLY_BEAUTY,
    cinematic: REMBRANDT_PORTRAIT,
    low_key: CARAVAGGIO_CHIAROSCURO,
    natural: VERMEER_WINDOW,
    high_key: AVEDON_HIGH_KEY,
    editorial: REMBRANDT_PORTRAIT,
  };

  return moodMap[mood] || LOOP_LIGHTING;
}
