/** Gear type → default scoring criteria mapping.
 *  When a photographer picks "Strobe" we auto-fill the engine criteria
 *  so they never see raw numbers. */

export const GEAR_TYPES = [
  { value: 'strobe_mono',    label: 'Studio Strobe / Monolight' },
  { value: 'strobe_pack',    label: 'Pack & Head Strobe' },
  { value: 'speedlight',     label: 'Speedlight / Cobra Flash' },
  { value: 'led_panel',      label: 'LED Panel' },
  { value: 'led_cob',        label: 'LED COB (Aputure, etc.)' },
  { value: 'led_tube',       label: 'LED Tube (Pavotube, etc.)' },
  { value: 'fresnel',        label: 'Fresnel / Dedolight' },
  { value: 'ring_light',     label: 'Ring Light' },
  { value: 'natural_window', label: 'Window / Natural Light' },
  { value: 'reflector_only', label: 'Reflector Only' },
];

export const GEAR_CRITERIA = {
  strobe_mono:    { brightness: 8000, color_accuracy: 92, portability: 40, battery_life: 30, energy_efficiency: 60 },
  strobe_pack:    { brightness: 9500, color_accuracy: 95, portability: 15, battery_life: 10, energy_efficiency: 40 },
  speedlight:     { brightness: 3000, color_accuracy: 80, portability: 90, battery_life: 80, energy_efficiency: 70 },
  led_panel:      { brightness: 2000, color_accuracy: 88, portability: 70, battery_life: 60, energy_efficiency: 90 },
  led_cob:        { brightness: 6000, color_accuracy: 95, portability: 30, battery_life: 20, energy_efficiency: 80 },
  led_tube:       { brightness: 1500, color_accuracy: 85, portability: 85, battery_life: 70, energy_efficiency: 95 },
  fresnel:        { brightness: 4000, color_accuracy: 90, portability: 25, battery_life: 10, energy_efficiency: 50 },
  ring_light:     { brightness: 2500, color_accuracy: 82, portability: 60, battery_life: 40, energy_efficiency: 75 },
  natural_window: { brightness: 3500, color_accuracy: 98, portability: 0,  battery_life: 100, energy_efficiency: 100 },
  reflector_only: { brightness: 1000, color_accuracy: 98, portability: 95, battery_life: 100, energy_efficiency: 100 },
};

export const MODIFIER_OPTIONS = [
  { value: 'softbox',     label: 'Softbox' },
  { value: 'umbrella',    label: 'Umbrella' },
  { value: 'beauty_dish', label: 'Beauty Dish' },
  { value: 'grid_spot',   label: 'Grid / Spot' },
  { value: 'stripbox',    label: 'Strip Box' },
  { value: 'barn_doors',  label: 'Barn Doors' },
  { value: 'snoot',       label: 'Snoot' },
];

/** Short photographer-friendly names for payload / diagram labels. */
export const GEAR_SHORT_NAMES = {
  strobe_mono:    'Strobe',
  strobe_pack:    'Pack & Head',
  speedlight:     'Speedlight',
  led_panel:      'LED Panel',
  led_cob:        'LED COB',
  led_tube:       'LED Tube',
  fresnel:        'Fresnel',
  ring_light:     'Ring Light',
  natural_window: 'Window Light',
  reflector_only: 'Reflector',
};

export function criteriaForGear(gearType) {
  return { ...(GEAR_CRITERIA[gearType] || GEAR_CRITERIA.strobe_mono) };
}
