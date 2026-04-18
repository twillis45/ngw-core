/**
 * Accessories & support gear catalog.
 * Organized by workflow role — what job does this gear do on set?
 */

export const ACCESSORY_CATALOG = [
  // ── Triggers & Remotes ──
  { value: 'godox_xpro2',     label: 'Godox XPro II',       category: 'triggers', vendor: 'Godox' },
  { value: 'godox_x2t',       label: 'Godox X2T',           category: 'triggers', vendor: 'Godox' },
  { value: 'profoto_connect',  label: 'Profoto Connect Pro', category: 'triggers', vendor: 'Profoto' },
  { value: 'profoto_air',      label: 'Profoto Air Remote',  category: 'triggers', vendor: 'Profoto' },
  { value: 'pocketwizard_plus4', label: 'PocketWizard Plus IV', category: 'triggers', vendor: 'PocketWizard' },
  { value: 'pocketwizard_flex6', label: 'PocketWizard FlexTT6', category: 'triggers', vendor: 'PocketWizard' },
  { value: 'elinchrom_skyport', label: 'Elinchrom Skyport',  category: 'triggers', vendor: 'Elinchrom' },

  // ── Light Stands ──
  { value: 'stand_compact',    label: 'Compact Stand 7\'',    category: 'stands', size: '7 ft' },
  { value: 'stand_standard',   label: 'Standard Stand 9\'',   category: 'stands', size: '9 ft' },
  { value: 'stand_heavy',      label: 'Heavy-Duty Stand 12\'', category: 'stands', size: '12 ft' },
  { value: 'cstand',           label: 'C-Stand 10.5\'',       category: 'stands', size: '10.5 ft' },
  { value: 'cstand_arm',       label: 'C-Stand + Arm',        category: 'stands', size: '10.5 ft' },
  { value: 'boom_arm',         label: 'Boom Arm',             category: 'stands' },
  { value: 'roller_stand',     label: 'Roller Stand',         category: 'stands' },

  // ── Backgrounds ──
  { value: 'bg_seamless_white', label: 'Seamless White 9\'',  category: 'backgrounds', size: '9 ft' },
  { value: 'bg_seamless_black', label: 'Seamless Black 9\'',  category: 'backgrounds', size: '9 ft' },
  { value: 'bg_seamless_gray',  label: 'Seamless Gray 9\'',   category: 'backgrounds', size: '9 ft' },
  { value: 'bg_muslin',        label: 'Muslin Backdrop',      category: 'backgrounds' },
  { value: 'bg_canvas',        label: 'Canvas Backdrop',      category: 'backgrounds' },
  { value: 'bg_collapsible',   label: 'Collapsible 5-in-1',   category: 'backgrounds' },
  { value: 'bg_vflat',         label: 'V-Flat',               category: 'backgrounds' },

  // ── Gels & Filters ──
  { value: 'gel_cto_quarter',  label: 'CTO ¼',               category: 'gels' },
  { value: 'gel_cto_half',     label: 'CTO ½',               category: 'gels' },
  { value: 'gel_cto_full',     label: 'CTO Full',            category: 'gels' },
  { value: 'gel_ctb_quarter',  label: 'CTB ¼',               category: 'gels' },
  { value: 'gel_ctb_half',     label: 'CTB ½',               category: 'gels' },
  { value: 'gel_ctb_full',     label: 'CTB Full',            category: 'gels' },
  { value: 'gel_creative_pack', label: 'Creative Color Pack', category: 'gels' },
  { value: 'nd_filter',        label: 'ND Filter for Strobe', category: 'gels' },

  // ── Meters & Tools ──
  { value: 'meter_sekonic_858', label: 'Sekonic L-858D',     category: 'meters', vendor: 'Sekonic' },
  { value: 'meter_sekonic_478', label: 'Sekonic L-478DR',    category: 'meters', vendor: 'Sekonic' },
  { value: 'meter_kenko',      label: 'Kenko KFM-1100',     category: 'meters', vendor: 'Kenko' },
  { value: 'gray_card',        label: 'Gray Card 18%',       category: 'meters' },
  { value: 'color_checker',    label: 'ColorChecker Classic', category: 'meters', vendor: 'X-Rite' },
  { value: 'color_checker_passport', label: 'ColorChecker Passport', category: 'meters', vendor: 'Calibrite' },

  // ── Clamps & Grip ──
  { value: 'aclamp',           label: 'A-Clamp',             category: 'grip' },
  { value: 'superclamp',       label: 'Super Clamp',         category: 'grip' },
  { value: 'gobo_arm',         label: 'Gobo Arm',            category: 'grip' },
  { value: 'sandbag',          label: 'Sandbag',             category: 'grip' },
  { value: 'gaffer_tape',      label: 'Gaffer Tape',         category: 'grip' },
];

export const ACCESSORY_CAT_LABEL = {
  triggers: 'Triggers & Remotes',
  stands: 'Light Stands',
  backgrounds: 'Backgrounds',
  gels: 'Gels & Filters',
  meters: 'Meters & Tools',
  grip: 'Clamps & Grip',
};

export const ACCESSORY_CATEGORIES = (() => {
  const groups = {};
  ACCESSORY_CATALOG.forEach(item => {
    const cat = item.category || 'other';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
  });
  return Object.entries(groups).map(([cat, items]) => ({
    category: cat,
    label: ACCESSORY_CAT_LABEL[cat] || cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    items,
  }));
})();
