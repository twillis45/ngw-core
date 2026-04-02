/**
 * Support & Grip equipment catalog for pro photographers.
 * Organized by category, with vendor/brand attribution where relevant.
 *
 * Used by StepGearEntry for selection and by shoot mode for setup checklists.
 */

export const SUPPORT_CATALOG = [
  // ── Stands ──────────────────────────────────────────
  { value: 'c_stand_20',        label: 'C-Stand 20"',           category: 'stands', vendor: 'Generic',    weight: 'heavy', maxHeight: '10.5 ft', notes: 'Industry standard for studio' },
  { value: 'c_stand_40',        label: 'C-Stand 40"',           category: 'stands', vendor: 'Generic',    weight: 'heavy', maxHeight: '10.5 ft', notes: 'Taller riser for overhead work' },
  { value: 'c_stand_avenger',   label: 'Avenger C-Stand',       category: 'stands', vendor: 'Avenger',    weight: 'heavy', maxHeight: '10.75 ft', notes: 'Chrome, turtle base' },
  { value: 'c_stand_kupo',      label: 'Kupo Master C-Stand',   category: 'stands', vendor: 'Kupo',       weight: 'heavy', maxHeight: '10.7 ft', notes: 'Spring-loaded' },
  { value: 'c_stand_matthews',  label: 'Matthews C-Stand',      category: 'stands', vendor: 'Matthews',   weight: 'heavy', maxHeight: '10.5 ft', notes: 'Hollywood standard' },
  { value: 'light_stand_8',     label: 'Light Stand 8\'',       category: 'stands', vendor: 'Generic',    weight: 'light', maxHeight: '8 ft',    notes: 'Compact, fits small studios' },
  { value: 'light_stand_10',    label: 'Light Stand 10\'',      category: 'stands', vendor: 'Generic',    weight: 'light', maxHeight: '10 ft',   notes: 'Standard studio height' },
  { value: 'light_stand_13',    label: 'Light Stand 13\'',      category: 'stands', vendor: 'Generic',    weight: 'medium', maxHeight: '13 ft',  notes: 'Heavy-duty for large modifiers' },
  { value: 'manfrotto_1004bac', label: 'Manfrotto 1004BAC',     category: 'stands', vendor: 'Manfrotto',  weight: 'medium', maxHeight: '12 ft',  notes: 'Air-cushioned, reliable' },
  { value: 'manfrotto_1052bac', label: 'Manfrotto 1052BAC',     category: 'stands', vendor: 'Manfrotto',  weight: 'light', maxHeight: '7.7 ft',  notes: 'Compact backlight stand' },
  { value: 'avenger_combo',     label: 'Avenger Combo Stand',   category: 'stands', vendor: 'Avenger',    weight: 'heavy', maxHeight: '14.7 ft', notes: 'Steel, double-riser for high work' },
  { value: 'bg_stand',          label: 'Background Stand Set',  category: 'stands', vendor: 'Generic',    weight: 'medium', maxHeight: '10 ft',  notes: 'Crossbar + 2 stands' },
  { value: 'bg_stand_heavy',    label: 'Heavy-Duty BG Stand',   category: 'stands', vendor: 'Generic',    weight: 'heavy',  maxHeight: '13 ft',  notes: 'For wide seamless / heavy drapes' },
  { value: 'roller_stand',      label: 'Roller Stand',          category: 'stands', vendor: 'Generic',    weight: 'medium', maxHeight: '12 ft',  notes: 'Wheeled base for easy repositioning' },

  // ── Boom Arms & Overhead ────────────────────────────
  { value: 'boom_arm_40',       label: 'Boom Arm 40"',          category: 'booms', vendor: 'Generic',     weight: 'medium', notes: 'Short reach, hair/accent lights' },
  { value: 'boom_arm_78',       label: 'Boom Arm 78"',          category: 'booms', vendor: 'Generic',     weight: 'heavy',  notes: 'Full overhead reach for beauty dish' },
  { value: 'boom_arm_kupo',     label: 'Kupo Boom Arm',         category: 'booms', vendor: 'Kupo',        weight: 'heavy',  notes: 'Heavy-duty with counterweight' },
  { value: 'boom_avenger_d600', label: 'Avenger D600 Boom',     category: 'booms', vendor: 'Avenger',     weight: 'heavy',  notes: 'Pro cinema standard, 5\'–12\'' },
  { value: 'overhead_frame_4x4',label: '4\'x4\' Overhead Frame', category: 'booms', vendor: 'Generic',     weight: 'heavy',  notes: 'For large diffusion/butterfly' },
  { value: 'overhead_frame_6x6',label: '6\'x6\' Overhead Frame', category: 'booms', vendor: 'Generic',     weight: 'heavy',  notes: 'Large overhead silk/scrim' },
  { value: 'scissor_mount',     label: 'Scissor / Pantograph',  category: 'booms', vendor: 'Generic',     weight: 'medium', notes: 'Ceiling-mounted, height-adjustable' },

  // ── Clamps & Grips ──────────────────────────────────
  { value: 'grip_head',         label: 'Grip Head (Gobo Head)', category: 'clamps', vendor: 'Generic',    notes: '2.5" jaw, mounts flags/scrims to C-stand arm' },
  { value: 'super_clamp',       label: 'Super Clamp',           category: 'clamps', vendor: 'Manfrotto',  notes: 'Attaches lights to pipes, doors, shelves' },
  { value: 'mafer_clamp',       label: 'Mafer Clamp',           category: 'clamps', vendor: 'Matthews',   notes: 'Jaw clamp for round/flat surfaces' },
  { value: 'a_clamp_spring',    label: 'Spring Clamp (A-Clamp)', category: 'clamps', vendor: 'Generic',   notes: 'Quick grip for gels, fabrics, BG' },
  { value: 'cardellini',        label: 'Cardellini Clamp',      category: 'clamps', vendor: 'Matthews',   notes: 'Center jaw for irregular shapes' },
  { value: 'baby_plate',        label: 'Baby Wall Plate',       category: 'clamps', vendor: 'Generic',    notes: 'Mounts baby pin to wall/floor/apple box' },
  { value: 'spigot_adapter',    label: 'Spigot / Stud Adapter', category: 'clamps', vendor: 'Generic',    notes: '1/4" to 3/8" or 5/8" adapters' },
  { value: 'magic_arm',         label: 'Magic Arm (Variable Friction)', category: 'clamps', vendor: 'Manfrotto', notes: 'Articulating arm for monitors/lights' },
  { value: 'autopole',          label: 'Autopole / Poly Pole',  category: 'clamps', vendor: 'Manfrotto',  notes: 'Spring-loaded ceiling-to-floor pole' },

  // ── Counterweights & Stabilization ──────────────────
  { value: 'sandbag_15',        label: 'Sandbag 15 lb',         category: 'weights', vendor: 'Generic',   notes: 'Standard C-stand counterweight' },
  { value: 'sandbag_25',        label: 'Sandbag 25 lb',         category: 'weights', vendor: 'Generic',   notes: 'Heavy-duty for booms/combo stands' },
  { value: 'shot_bag_5',        label: 'Shot Bag 5 lb',         category: 'weights', vendor: 'Generic',   notes: 'Compact weight for light stands' },
  { value: 'counterweight_boom',label: 'Boom Counterweight',    category: 'weights', vendor: 'Generic',   notes: 'Slide-on weight for boom arms' },
  { value: 'furniture_pad',     label: 'Furniture Pad / Blanket', category: 'weights', vendor: 'Generic', notes: 'Sound dampening + surface protection' },

  // ── Flags, Cutters & Diffusion Frames ───────────────
  { value: 'flag_18x24',        label: 'Solid Flag 18×24"',     category: 'flags', vendor: 'Generic',     notes: 'Black, blocks light / creates negative fill' },
  { value: 'flag_24x36',        label: 'Solid Flag 24×36"',     category: 'flags', vendor: 'Generic',     notes: 'Standard studio cutter' },
  { value: 'flag_4x4_floppy',   label: '4\'x4\' Floppy',       category: 'flags', vendor: 'Generic',     notes: 'Folds to 4\'x8\' for large negative fill' },
  { value: 'cutter_24x72',      label: 'Cutter 24×72"',         category: 'flags', vendor: 'Generic',     notes: 'Narrow flag for edge control' },
  { value: 'silk_frame_4x4',    label: '4\'x4\' Silk (1 stop)',  category: 'flags', vendor: 'Generic',    notes: 'Diffusion on frame, ~1 stop reduction' },
  { value: 'silk_frame_6x6',    label: '6\'x6\' Silk (1 stop)',  category: 'flags', vendor: 'Generic',    notes: 'Large overhead diffusion' },
  { value: 'net_single',        label: 'Single Net (1 stop)',   category: 'flags', vendor: 'Generic',     notes: 'Reduces light 1 stop without diffusion' },
  { value: 'net_double',        label: 'Double Net (2 stops)',  category: 'flags', vendor: 'Generic',     notes: 'Reduces light 2 stops without diffusion' },
  { value: 'v_flat_white',      label: 'V-Flat (White)',        category: 'flags', vendor: 'V-Flat World', notes: '4\'x8\' foam board, bounce fill' },
  { value: 'v_flat_black',      label: 'V-Flat (Black)',        category: 'flags', vendor: 'V-Flat World', notes: '4\'x8\' foam board, negative fill' },

  // ── Gels & Diffusion ────────────────────────────────
  { value: 'gel_cto_full',      label: 'Full CTO Gel',          category: 'gels', vendor: 'Rosco',        notes: 'Warms flash to tungsten (3200K)' },
  { value: 'gel_cto_half',      label: '½ CTO Gel',             category: 'gels', vendor: 'Rosco',        notes: 'Subtle warm shift (~3800K)' },
  { value: 'gel_cto_quarter',   label: '¼ CTO Gel',             category: 'gels', vendor: 'Rosco',        notes: 'Light warmth (~4500K)' },
  { value: 'gel_ctb_full',      label: 'Full CTB Gel',          category: 'gels', vendor: 'Rosco',        notes: 'Cools tungsten to daylight (5500K)' },
  { value: 'gel_ctb_half',      label: '½ CTB Gel',             category: 'gels', vendor: 'Rosco',        notes: 'Partial cooling' },
  { value: 'gel_nd_1stop',      label: 'ND Gel (1 stop)',       category: 'gels', vendor: 'Lee',          notes: 'Neutral density, reduces output' },
  { value: 'gel_nd_2stop',      label: 'ND Gel (2 stops)',      category: 'gels', vendor: 'Lee',          notes: 'Stronger neutral density' },
  { value: 'gel_diffusion_full',label: 'Full Diffusion Gel',    category: 'gels', vendor: 'Lee',          notes: 'Heavy diffusion (Lee 216)' },
  { value: 'gel_diffusion_lite',label: 'Light Diffusion Gel',   category: 'gels', vendor: 'Lee',          notes: 'Subtle softening (Lee 250)' },
  { value: 'gel_color_pack',    label: 'Creative Color Pack',   category: 'gels', vendor: 'MagMod',       notes: 'Assorted creative colors' },

  // ── Backgrounds ─────────────────────────────────────
  { value: 'seamless_white',    label: 'Seamless Paper — White',     category: 'backgrounds', vendor: 'Savage', notes: '53" or 107" wide roll' },
  { value: 'seamless_black',    label: 'Seamless Paper — Black',     category: 'backgrounds', vendor: 'Savage', notes: '53" or 107" wide roll' },
  { value: 'seamless_gray',     label: 'Seamless Paper — Gray',      category: 'backgrounds', vendor: 'Savage', notes: '53" or 107" wide roll' },
  { value: 'muslin_white',      label: 'Muslin Backdrop — White',    category: 'backgrounds', vendor: 'Generic', notes: '10\'x12\' washable cloth' },
  { value: 'muslin_gray',       label: 'Muslin Backdrop — Gray',     category: 'backgrounds', vendor: 'Generic', notes: '10\'x12\' washable cloth' },
  { value: 'canvas_painted',    label: 'Canvas — Painted/Mottled',   category: 'backgrounds', vendor: 'Oliphant', notes: 'Hand-painted texture' },
  { value: 'collapsible_bg',    label: 'Collapsible BG (5-in-1)',    category: 'backgrounds', vendor: 'Westcott', notes: 'Portable, reversible' },

  // ── Power & Cables ──────────────────────────────────
  { value: 'power_strip',       label: 'Power Strip (6-outlet)',     category: 'power', vendor: 'Generic',  notes: 'Grounded, with surge protection' },
  { value: 'extension_25ft',    label: 'Extension Cord 25\'',       category: 'power', vendor: 'Generic',  notes: '12-gauge for strobes' },
  { value: 'extension_50ft',    label: 'Extension Cord 50\'',       category: 'power', vendor: 'Generic',  notes: '12-gauge for longer runs' },
  { value: 'gaffer_tape',       label: 'Gaffer Tape (2")',          category: 'power', vendor: 'Pro Gaff',  notes: 'Cable management, no residue' },
  { value: 'cable_ramp',        label: 'Cable Ramp / Protector',    category: 'power', vendor: 'Generic',  notes: 'Trip prevention over cables' },

  // ── Tethering & Monitor ─────────────────────────────
  { value: 'tether_cable_usb',  label: 'Tether Cable USB-C 15\'',   category: 'tethering', vendor: 'Tether Tools', notes: 'Active extension for tethered shooting' },
  { value: 'tether_table',      label: 'Tether Table / Platform',   category: 'tethering', vendor: 'Tether Tools', notes: 'Mounts to stand for laptop' },
  { value: 'color_checker',     label: 'ColorChecker Passport',     category: 'tethering', vendor: 'Calibrite',    notes: 'White balance + color profile target' },
  { value: 'gray_card',         label: '18% Gray Card',             category: 'tethering', vendor: 'Generic',      notes: 'Exposure + WB reference' },
  { value: 'apple_box_set',     label: 'Apple Box Set (4-pc)',      category: 'tethering', vendor: 'Generic',      notes: 'Full, half, quarter, pancake' },
];

/** Category groups for display */
export const SUPPORT_CATEGORIES = [
  { key: 'stands',      label: 'Stands',                       icon: 'stand' },
  { key: 'booms',       label: 'Boom Arms & Overhead',         icon: 'boom' },
  { key: 'clamps',      label: 'Clamps & Grips',               icon: 'clamp' },
  { key: 'weights',     label: 'Counterweights & Stabilization', icon: 'weight' },
  { key: 'flags',       label: 'Flags, Cutters & Diffusion',   icon: 'flag' },
  { key: 'gels',        label: 'Gels & Diffusion',             icon: 'gel' },
  { key: 'backgrounds', label: 'Backgrounds',                  icon: 'backdrop' },
  { key: 'power',       label: 'Power & Cables',               icon: 'power' },
  { key: 'tethering',   label: 'Tethering & Reference',        icon: 'monitor' },
];

/** Build categorized groups with vendor sub-groups */
export function getSupportByCategory() {
  return SUPPORT_CATEGORIES.map(cat => ({
    ...cat,
    items: SUPPORT_CATALOG.filter(s => s.category === cat.key),
  }));
}

/** Reverse-lookup map */
const SUPPORT_MAP = {};
SUPPORT_CATALOG.forEach(s => { SUPPORT_MAP[s.value] = s; });

/** Look up support item details by value */
export function getSupportDetails(value) {
  return SUPPORT_MAP[value] || null;
}
