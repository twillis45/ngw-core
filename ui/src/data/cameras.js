/**
 * Camera bodies database — sourced from data/cameras.json
 * Used for kit camera selection (CameraSelect component).
 *
 * Key fields surfaced to the UI:
 *   id, brand, model, sensor_size, form_factor,
 *   max_sync_speed, has_hss, price_tier
 */

export const CAMERAS = [
  // ── Sony ──────────────────────────────────────────────────────────────────
  { id: 'sony-a7r-v',  brand: 'Sony', model: 'α7R V',  sensor_size: 'full_frame',        form_factor: 'mirrorless',    max_sync_speed: 250,   has_hss: true,  price_tier: 'ultra_pro' },
  { id: 'sony-a7-iv',  brand: 'Sony', model: 'α7 IV',  sensor_size: 'full_frame',        form_factor: 'mirrorless',    max_sync_speed: 250,   has_hss: true,  price_tier: 'pro' },
  { id: 'sony-a7-iii', brand: 'Sony', model: 'α7 III', sensor_size: 'full_frame',        form_factor: 'mirrorless',    max_sync_speed: 250,   has_hss: true,  price_tier: 'prosumer' },
  { id: 'sony-a9-iii', brand: 'Sony', model: 'α9 III', sensor_size: 'full_frame',        form_factor: 'mirrorless',    max_sync_speed: 40000, has_hss: false, price_tier: 'ultra_pro' },
  { id: 'sony-fx3',    brand: 'Sony', model: 'FX3',    sensor_size: 'full_frame',        form_factor: 'mirrorless',    max_sync_speed: 250,   has_hss: true,  price_tier: 'ultra_pro' },
  { id: 'sony-a6700',  brand: 'Sony', model: 'α6700',  sensor_size: 'aps_c',             form_factor: 'mirrorless',    max_sync_speed: 250,   has_hss: true,  price_tier: 'prosumer' },

  // ── Canon ─────────────────────────────────────────────────────────────────
  { id: 'canon-r5-ii', brand: 'Canon', model: 'EOS R5 Mark II', sensor_size: 'full_frame', form_factor: 'mirrorless', max_sync_speed: 250, has_hss: true,  price_tier: 'ultra_pro' },
  { id: 'canon-r6-ii', brand: 'Canon', model: 'EOS R6 Mark II', sensor_size: 'full_frame', form_factor: 'mirrorless', max_sync_speed: 250, has_hss: true,  price_tier: 'pro' },
  { id: 'canon-r3',    brand: 'Canon', model: 'EOS R3',          sensor_size: 'full_frame', form_factor: 'mirrorless', max_sync_speed: 250, has_hss: true,  price_tier: 'ultra_pro' },
  { id: 'canon-r8',    brand: 'Canon', model: 'EOS R8',          sensor_size: 'full_frame', form_factor: 'mirrorless', max_sync_speed: 200, has_hss: true,  price_tier: 'prosumer' },
  { id: 'canon-r50',   brand: 'Canon', model: 'EOS R50',         sensor_size: 'aps_c',      form_factor: 'mirrorless', max_sync_speed: 200, has_hss: true,  price_tier: 'entry' },
  { id: 'canon-5d-iv', brand: 'Canon', model: 'EOS 5D Mark IV',  sensor_size: 'full_frame', form_factor: 'dslr',       max_sync_speed: 200, has_hss: true,  price_tier: 'pro' },

  // ── Nikon ─────────────────────────────────────────────────────────────────
  { id: 'nikon-z8',     brand: 'Nikon', model: 'Z8',     sensor_size: 'full_frame', form_factor: 'mirrorless', max_sync_speed: 250, has_hss: true, price_tier: 'ultra_pro' },
  { id: 'nikon-z9',     brand: 'Nikon', model: 'Z9',     sensor_size: 'full_frame', form_factor: 'mirrorless', max_sync_speed: 250, has_hss: true, price_tier: 'ultra_pro' },
  { id: 'nikon-z6-iii', brand: 'Nikon', model: 'Z6 III', sensor_size: 'full_frame', form_factor: 'mirrorless', max_sync_speed: 250, has_hss: true, price_tier: 'pro' },
  { id: 'nikon-zf',     brand: 'Nikon', model: 'Zf',     sensor_size: 'full_frame', form_factor: 'mirrorless', max_sync_speed: 250, has_hss: true, price_tier: 'pro' },
  { id: 'nikon-z50-ii', brand: 'Nikon', model: 'Z50 II', sensor_size: 'aps_c',      form_factor: 'mirrorless', max_sync_speed: 250, has_hss: true, price_tier: 'prosumer' },
  { id: 'nikon-d850',   brand: 'Nikon', model: 'D850',   sensor_size: 'full_frame', form_factor: 'dslr',       max_sync_speed: 250, has_hss: true, price_tier: 'pro' },

  // ── Fujifilm ──────────────────────────────────────────────────────────────
  { id: 'fujifilm-xt5',       brand: 'Fujifilm', model: 'X-T5',      sensor_size: 'aps_c',         form_factor: 'mirrorless',     max_sync_speed: 250,  has_hss: true,  price_tier: 'pro' },
  { id: 'fujifilm-xh2',       brand: 'Fujifilm', model: 'X-H2',      sensor_size: 'aps_c',         form_factor: 'mirrorless',     max_sync_speed: 250,  has_hss: true,  price_tier: 'pro' },
  { id: 'fujifilm-xs20',      brand: 'Fujifilm', model: 'X-S20',     sensor_size: 'aps_c',         form_factor: 'mirrorless',     max_sync_speed: 250,  has_hss: true,  price_tier: 'prosumer' },
  { id: 'fujifilm-x100vi',    brand: 'Fujifilm', model: 'X100VI',    sensor_size: 'aps_c',         form_factor: 'mirrorless',     max_sync_speed: 4000, has_hss: false, price_tier: 'prosumer' },
  { id: 'fujifilm-gfx-100s-ii', brand: 'Fujifilm', model: 'GFX 100S II', sensor_size: 'medium_format', form_factor: 'medium_format', max_sync_speed: 125, has_hss: false, price_tier: 'medium_format' },
  { id: 'fujifilm-gfx-50s-ii',  brand: 'Fujifilm', model: 'GFX 50S II',  sensor_size: 'medium_format', form_factor: 'medium_format', max_sync_speed: 125, has_hss: false, price_tier: 'medium_format' },

  // ── Panasonic ─────────────────────────────────────────────────────────────
  { id: 'panasonic-s5-ii', brand: 'Panasonic', model: 'Lumix S5 II', sensor_size: 'full_frame', form_factor: 'mirrorless', max_sync_speed: 250, has_hss: true, price_tier: 'pro' },

  // ── OM System ─────────────────────────────────────────────────────────────
  { id: 'om-system-om1-ii', brand: 'OM System', model: 'OM-1 Mark II', sensor_size: 'micro_four_thirds', form_factor: 'mirrorless', max_sync_speed: 200, has_hss: true, price_tier: 'pro' },

  // ── Leica ─────────────────────────────────────────────────────────────────
  { id: 'leica-sl3', brand: 'Leica', model: 'SL3',  sensor_size: 'full_frame', form_factor: 'mirrorless', max_sync_speed: 250,  has_hss: true,  price_tier: 'ultra_pro' },
  { id: 'leica-q3',  brand: 'Leica', model: 'Q3',   sensor_size: 'full_frame', form_factor: 'mirrorless', max_sync_speed: 2000, has_hss: false, price_tier: 'ultra_pro' },

  // ── Hasselblad ────────────────────────────────────────────────────────────
  { id: 'hasselblad-x2d', brand: 'Hasselblad', model: 'X2D 100C', sensor_size: 'medium_format', form_factor: 'medium_format', max_sync_speed: 125, has_hss: false, price_tier: 'medium_format' },

  // ── Phase One ─────────────────────────────────────────────────────────────
  { id: 'phase-one-iq4-150mp', brand: 'Phase One', model: 'IQ4 150MP', sensor_size: 'medium_format', form_factor: 'medium_format', max_sync_speed: 1600, has_hss: false, price_tier: 'medium_format' },
];

/** Camera bodies grouped by brand for select rendering. */
export const CAMERAS_BY_BRAND = CAMERAS.reduce((acc, cam) => {
  if (!acc[cam.brand]) acc[cam.brand] = [];
  acc[cam.brand].push(cam);
  return acc;
}, {});

/** Look up a camera by id. */
export function cameraById(id) {
  return CAMERAS.find(c => c.id === id) ?? null;
}

/** Human-readable sensor size label. */
export const SENSOR_LABELS = {
  full_frame: 'Full Frame',
  aps_c: 'APS-C',
  medium_format: 'Medium Format',
  micro_four_thirds: 'MFT',
};
