/**
 * Gear recommendations per lighting pattern.
 *
 * Each pattern maps to recommended lights, modifiers, and accessories
 * with cost tier indicators: $ (budget), $$ (mid-range), $$$ (professional).
 *
 * This data drives the "You Have vs. You Need" comparison on the result screen.
 */

export const GEAR_RECOMMENDATIONS = {
  rembrandt: {
    lights: [
      { role: 'key', types: ['strobe_mono', 'led_cob'], minTier: '$', idealTier: '$$', notes: 'One strobe or LED COB, 200W+' },
    ],
    modifiers: [
      { type: 'softbox_octa', size: '3–5 ft', tier: '$$', notes: 'Octabox for soft, round catchlight' },
      { type: 'grid', size: '40°', tier: '$', notes: 'Grid controls spill for dramatic falloff' },
    ],
    accessories: ['light_stand', 'trigger'],
  },
  loop: {
    lights: [
      { role: 'key', types: ['strobe_mono', 'led_cob', 'speedlight'], minTier: '$', idealTier: '$$', notes: 'Any single key light' },
    ],
    modifiers: [
      { type: 'umbrella', size: '43–60"', tier: '$', notes: 'Shoot-through or reflective umbrella' },
    ],
    accessories: ['light_stand', 'reflector'],
  },
  butterfly: {
    lights: [
      { role: 'key', types: ['strobe_mono', 'led_cob'], minTier: '$$', idealTier: '$$$', notes: 'Centered above camera, 300W+' },
    ],
    modifiers: [
      { type: 'beauty_dish', size: '22"', tier: '$$', notes: 'White beauty dish for signature catchlight' },
      { type: 'reflector', size: '42"', tier: '$', notes: 'Silver reflector below for fill' },
    ],
    accessories: ['c_stand', 'boom_arm', 'trigger'],
  },
  split: {
    lights: [
      { role: 'key', types: ['strobe_mono', 'led_cob', 'fresnel'], minTier: '$', idealTier: '$$', notes: 'Hard source at 90° for maximum drama' },
    ],
    modifiers: [
      { type: 'bare_bulb', size: 'n/a', tier: '$', notes: 'No modifier or small reflector for hard light' },
      { type: 'grid', size: '20°', tier: '$', notes: 'Tight grid for controlled spill' },
    ],
    accessories: ['light_stand', 'flag'],
  },
  clamshell: {
    lights: [
      { role: 'key', types: ['strobe_mono', 'ring_light'], minTier: '$$', idealTier: '$$$', notes: 'Key above camera axis' },
      { role: 'fill', types: ['strobe_mono', 'led_panel'], minTier: '$', idealTier: '$$', notes: 'Fill below camera axis' },
    ],
    modifiers: [
      { type: 'beauty_dish', size: '22"', tier: '$$', notes: 'Key: beauty dish or softbox above' },
      { type: 'softbox_rect', size: '2×3 ft', tier: '$$', notes: 'Fill: small softbox below' },
    ],
    accessories: ['two_light_stands', 'trigger', 'boom_arm'],
  },
  broad: {
    lights: [
      { role: 'key', types: ['strobe_mono', 'led_cob'], minTier: '$', idealTier: '$$', notes: 'Key on the broad side (closest to camera)' },
    ],
    modifiers: [
      { type: 'softbox_rect', size: '3×4 ft', tier: '$$', notes: 'Large softbox for soft wrap' },
    ],
    accessories: ['light_stand', 'reflector'],
  },
  short: {
    lights: [
      { role: 'key', types: ['strobe_mono', 'led_cob'], minTier: '$', idealTier: '$$', notes: 'Key on the short side (far from camera)' },
    ],
    modifiers: [
      { type: 'softbox_rect', size: '3×4 ft', tier: '$$', notes: 'Large softbox for controlled wrap' },
    ],
    accessories: ['light_stand', 'reflector'],
  },
  high_key: {
    lights: [
      { role: 'key', types: ['strobe_mono'], minTier: '$$', idealTier: '$$$', notes: 'Main key light' },
      { role: 'fill', types: ['strobe_mono'], minTier: '$$', idealTier: '$$$', notes: 'Fill near camera axis' },
      { role: 'background', types: ['strobe_mono'], minTier: '$', idealTier: '$$', notes: '1–2 background lights to blow white' },
    ],
    modifiers: [
      { type: 'softbox_rect', size: '3×4 ft', tier: '$$', notes: 'Key: large softbox' },
      { type: 'umbrella', size: '60"', tier: '$', notes: 'Fill: shoot-through umbrella' },
    ],
    accessories: ['three_light_stands', 'white_backdrop', 'trigger'],
  },
};

// Fallback for patterns not in the map
export const DEFAULT_RECOMMENDATION = {
  lights: [
    { role: 'key', types: ['strobe_mono', 'led_cob'], minTier: '$', idealTier: '$$', notes: 'Single key light' },
  ],
  modifiers: [
    { type: 'softbox_octa', size: '3–5 ft', tier: '$$', notes: 'Versatile octabox' },
  ],
  accessories: ['light_stand', 'trigger'],
};

/** Friendly names for accessories */
export const ACCESSORY_LABELS = {
  light_stand: 'Light Stand',
  two_light_stands: '2× Light Stands',
  three_light_stands: '3× Light Stands',
  trigger: 'Wireless Trigger',
  reflector: 'Reflector (42")',
  c_stand: 'C-Stand',
  boom_arm: 'Boom Arm',
  flag: 'Black Flag',
  white_backdrop: 'White Backdrop',
};

/** Cost tier color mapping */
export const TIER_COLORS = {
  '$':   'rgba(72,186,136,0.9)',   // budget — green
  '$$':  'rgba(132,158,184,0.75)', // mid — steel
  '$$$': 'rgba(200,155,69,0.85)',  // pro — amber
};
