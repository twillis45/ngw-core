/**
 * RecommendedKitsCard — Phase 2 gated, Phase 10 display.
 *
 * Shows good/better/best gear tiers based on the detected modifier.
 * Derives kit suggestions from existing result data — no extra API call.
 * Reads My Kit from localStorage to detect the user's current tier and
 * personalise the note accordingly.
 */

import { useState, useEffect, useRef } from 'react';
import CardIcon from '../components/CardIcon';
import useKit from '../hooks/useKit';
import { getModifierDetails } from '../data/modifierCatalog';
import VendorLogo from '../components/VendorLogo';
import { getRoleColor } from '../lib/lightRoleColors';

// ── B&H shop search link ─────────────────────────────────────────────────────
const EXTERNAL_LINK_ICON = (
  <svg className="shop-link__icon" width="10" height="10" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
    <polyline points="15 3 21 3 21 9"/>
    <line x1="10" y1="14" x2="21" y2="3"/>
  </svg>
);

function getShopUrl(itemName) {
  // Strip embedded price like "(~$280)" or "(~$1,800)" then search B&H
  const query = (itemName || '').replace(/\s*\(~?\$[\d,]+\+?\)\s*/g, '').trim();
  return `https://www.bhphotovideo.com/c/search?q=${encodeURIComponent(query)}`;
}

function ShopLink({ name, children }) {
  return (
    <a
      href={getShopUrl(name)}
      target="_blank"
      rel="noopener noreferrer"
      className="shop-link"
      title={`Search B&H for ${name.replace(/\s*\(~?\$[\d,]+\+?\)\s*/g, '').trim()}`}
    >
      {children}
      {EXTERNAL_LINK_ICON}
    </a>
  );
}
// ── Collapsible kit section (for blueprint light roles) ──────────────────────
function CollapsibleKitSection({ label, role, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const roleColor = role ? getRoleColor(role) : null;
  return (
    <div className={`kits-card__blueprint-section kits-card__blueprint-section--collapsible${open ? ' kits-card__blueprint-section--open' : ''}`}>
      <button
        className="kits-card__blueprint-role-btn"
        onClick={() => setOpen(v => !v)}
        type="button"
        style={roleColor ? { '--kit-role-color': roleColor } : undefined}
      >
        {roleColor && (
          <span className="kits-card__blueprint-role-dot" style={{ background: roleColor }} />
        )}
        <span className="kits-card__blueprint-role-label">{label}</span>
        <svg
          className="kits-card__blueprint-chevron"
          width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && <div className="kits-card__blueprint-body">{children}</div>}
    </div>
  );
}
// ───────────────────────────────────────────────────────────────────────────

// Modifiers that don't require a strobe — reflectors, panels, flags, foam core
const PASSIVE_MODIFIERS = ['reflector', 'reflector panel', 'mirror', 'foam core', 'whiteboard', 'silver panel', 'white panel', 'v-flat', 'gobo'];

function isPassiveModifier(modName) {
  if (!modName) return false;
  const lower = modName.toLowerCase();
  return PASSIVE_MODIFIERS.some(p => lower.includes(p));
}

/** Gear for secondary active lights (fill strobe, rim/hair light) per tier. */
const SECONDARY_LIGHT_GEAR = {
  fill_strobe: {
    good:   [{ name: 'Godox AD200Pro (~$280)', qty: 1 }, { name: 'Godox 60×90 cm Softbox (~$60)', qty: 1 }],
    better: [{ name: 'Profoto B10 Plus (~$1,800)', qty: 1 }, { name: 'Profoto RFi 2×3 ft Softbox (~$280)', qty: 1 }],
    best:   [{ name: 'Broncolor Siros L 400 (~$1,800)', qty: 1 }, { name: 'Broncolor Softbox (~$400)', qty: 1 }],
  },
  hair_rim: {
    good:   [{ name: 'Godox AD200Pro (~$280)', qty: 1 }, { name: 'Stripbox 12×36" (~$50)', qty: 1 }],
    better: [{ name: 'Profoto B10 Plus (~$1,800)', qty: 1 }, { name: 'Profoto 1×3 ft Stripbox (~$280)', qty: 1 }],
    best:   [{ name: 'Broncolor Siros L 400 (~$1,800)', qty: 1 }, { name: 'Broncolor 30×120 Softbox (~$680)', qty: 1 }],
  },
  background: {
    good:   [{ name: 'Godox SK300II (~$185)', qty: 1 }],
    better: [{ name: 'Elinchrom D-Lite 2 (~$280)', qty: 1 }],
    best:   [{ name: 'Broncolor Siros L 400 (~$1,800)', qty: 1 }],
  },
};

const ROLE_LABELS_GEAR = {
  key: 'Key Light', fill: 'Fill Light', rim: 'Rim Light',
  hair: 'Hair Light', background: 'Background Light', accent: 'Accent Light',
};

/**
 * Build a full labeled gear list from blueprint lights at a given tier.
 * Each section: { roleLabel, items: [{name, qty}], alt?: string }
 */
function buildBlueprintGear(setupLights, tier, primaryFamily) {
  if (!setupLights || setupLights.length === 0) return null;
  const sections = [];
  for (const light of setupLights) {
    const role = (light.role || 'key').toLowerCase();
    const modName = light.modifier || '';
    const roleLabel = ROLE_LABELS_GEAR[role] || 'Light';

    if (role === 'key') {
      const tierKit = (MODIFIER_KITS[primaryFamily] || FALLBACK_KIT)[tier] || [];
      if (tierKit.length) sections.push({ roleLabel, roleKey: 'key', items: tierKit });
    } else if (role === 'fill') {
      // Always show fill strobe as primary; reflector is always the budget alternative
      const items = SECONDARY_LIGHT_GEAR.fill_strobe[tier] || [];
      if (items.length) sections.push({
        roleLabel,
        roleKey: 'fill',
        items,
        alt: 'Alternative: 5-in-1 Reflector 43–48" (silver/white panel) — no strobe needed, works well for clamshell',
      });
    } else if (role === 'hair' || role === 'rim') {
      const items = SECONDARY_LIGHT_GEAR.hair_rim[tier] || [];
      if (items.length) sections.push({ roleLabel, roleKey: role, items });
    } else if (role === 'background') {
      const items = SECONDARY_LIGHT_GEAR.background[tier] || [];
      if (items.length) sections.push({ roleLabel, roleKey: 'background', items });
    }
  }
  return sections.length ? sections : null;
}

// Each item: { name, qty } — light first, then modifier
const MODIFIER_KITS = {
  softbox_rect: {
    good:   [{ name: 'Godox AD200Pro strobe (~$280)', qty: 1 }, { name: 'Godox 60×90 cm Softbox (~$60)', qty: 1 }],
    better: [{ name: 'Profoto B10 Plus (~$1,800)', qty: 1 }, { name: 'Profoto RFi 2×3 ft Softbox (~$280)', qty: 1 }],
    best:   [{ name: 'Broncolor Siros L 800 (~$2,400)', qty: 1 }, { name: 'Broncolor Hazy Light 60×80 (~$980)', qty: 1 }],
  },
  softbox_octa: {
    good:   [{ name: 'Godox SK400II studio strobe (~$180)', qty: 1 }, { name: 'Neewer 47" Octa Softbox (~$70)', qty: 1 }],
    better: [{ name: 'Profoto B10 (~$1,550)', qty: 1 }, { name: 'Godox Octa 120 cm (~$150)', qty: 1 }],
    best:   [{ name: 'Profoto Pro-10 pack (~$5,800)', qty: 1 }, { name: 'Profoto OCF Octa 3ft (~$340)', qty: 1 }],
  },
  beauty_dish: {
    good:   [{ name: 'Godox AD200Pro (~$280)', qty: 1 }, { name: 'Godox 16" Beauty Dish (~$55)', qty: 1 }],
    better: [{ name: 'Profoto B10 Plus (~$1,800)', qty: 1 }, { name: 'Profoto Beauty Dish 22" (~$380)', qty: 1 }],
    best:   [{ name: 'Broncolor Siros L (~$2,400)', qty: 1 }, { name: 'Broncolor 65 cm Focus dish (~$720)', qty: 1 }],
  },
  umbrella_shoot: {
    good:   [{ name: 'Godox SL60W LED (~$130)', qty: 1 }, { name: '43" Silver Shoot-Through Umbrella (~$25)', qty: 1 }],
    better: [{ name: 'Godox AD300Pro (~$380)', qty: 1 }, { name: 'Westcott 43" Optical White Satin (~$55)', qty: 1 }],
    best:   [{ name: 'Profoto B10 Plus (~$1,800)', qty: 1 }, { name: 'Profoto Umbrella XL (~$220)', qty: 1 }],
  },
  ring_flash: {
    good:   [{ name: 'Godox AR400 Ring Flash (~$280)', qty: 1 }],
    better: [{ name: 'Profoto B10 + RingFlash adapter (~$800)', qty: 1 }],
    best:   [{ name: 'Broncolor Ringflash (~$3,200)', qty: 1 }],
  },
};

const FALLBACK_KIT = {
  good:   [{ name: 'Godox AD200Pro strobe (~$280)', qty: 1 }, { name: 'Medium Softbox (~$60)', qty: 1 }],
  better: [{ name: 'Profoto B10 Plus (~$1,800)', qty: 1 }, { name: 'Profoto modifier of choice (~$200+)', qty: 1 }],
  best:   [{ name: 'Broncolor Siros L 800 (~$2,400)', qty: 1 }, { name: 'Broncolor modifier system (~$700+)', qty: 1 }],
};

// Recommended support per modifier family — stands, grips, sandbags specific to the setup.
// Applies across all tiers (support doesn't change with strobe brand).
const SETUP_SUPPORT = {
  beauty_dish: {
    items: [
      { name: 'C-Stand', qty: 1 },
      { name: 'Boom Arm', qty: 1 },
      { name: 'Sandbags', qty: 2 },
    ],
    note: 'Beauty dishes are heavy and tip-prone — always sandbag any stand carrying one. Boom arm needed for clamshell position.',
  },
  softbox_rect: {
    items: [
      { name: 'Heavy-duty Light Stand', qty: 1 },
      { name: 'Sandbags', qty: 1 },
    ],
    note: 'A sturdy stand rated for the softbox weight. Sandbag the base, especially if the stand is extended.',
  },
  softbox_octa: {
    items: [
      { name: 'C-Stand or Heavy-duty Stand', qty: 1 },
      { name: 'Sandbags', qty: 2 },
    ],
    note: 'Large octaboxes are wind-sensitive and shift the center of gravity high — double-sandbag and keep the footprint wide.',
  },
  umbrella_shoot: {
    items: [
      { name: 'Light Stand', qty: 2 },
      { name: 'Sandbags', qty: 1 },
    ],
    note: 'Two stands typical for key + fill/reflector. Umbrella acts as a sail in any air movement — sandbag if not tethered.',
  },
  ring_flash: {
    items: [
      { name: 'Ring Flash Bracket / Lens Mount', qty: 1 },
      { name: 'Light Stand (optional)', qty: 1 },
    ],
    note: 'Most ring flashes mount directly around the lens on-camera. A stand is optional for off-camera ring technique.',
  },
};

const TIER_LABELS = {
  good:   { label: 'Good',   sub: 'Entry-level / Godox ecosystem', color: '#6ee7b7', price: '~$300' },
  better: { label: 'Better', sub: 'Prosumer / Profoto',            color: '#67e8f9', price: '~$1.8k' },
  best:   { label: 'Best',   sub: 'Professional / Broncolor',      color: '#c4b5fd', price: '~$5k+' },
};

// What you actually gain by choosing this tier over the one below it.
const TIER_ADVANTAGES = {
  good: {
    headline: 'Great starting point',
    points: [
      'Bowens mount — works with the widest range of third-party modifiers',
      'Adequate recycle for controlled studio pace (one shot at a time)',
      'Good colour consistency for portraits and social content',
    ],
  },
  better: {
    headline: 'Where most pros shoot',
    points: [
      'Tighter colour temperature variance (±75 K vs ±200 K at entry) — skin tones stay consistent across a full shoot',
      'Faster recycle lets you shoot bursts without waiting between frames',
      'Built for location — more durable, better battery life, Profoto\u2019s modifier ecosystem is the commercial industry standard',
      'Finer power increments (1/10 stop on most units) for precise ratio control',
    ],
  },
  best: {
    headline: 'When consistency is non-negotiable',
    points: [
      'Industry-leading colour accuracy — critical for commercial campaigns where colour-matching across shots and sessions matters',
      'Pack-and-head systems deliver the fastest recycle and highest output for high-volume sequences',
      'Built for daily professional use — service contracts, rental compatibility, and the most precise metering available',
    ],
  },
};

// Human-readable display names for stored light type keys
const LIGHT_DISPLAY_NAMES = {
  godox_ad200: 'Godox AD200', godox_ad200pro: 'Godox AD200Pro', godox_v1: 'Godox V1',
  godox_sk400: 'Godox SK400II', godox_sl60: 'Godox SL60W', godox_ad300: 'Godox AD300Pro',
  neewer: 'Neewer', yongnuo: 'Yongnuo', flashpoint: 'Flashpoint',
  profoto_b10: 'Profoto B10', profoto_b10x: 'Profoto B10X', profoto_b1: 'Profoto B1',
  profoto_b2: 'Profoto B2', profoto_a1: 'Profoto A1', profoto_d2: 'Profoto D2',
  elinchrom_elc: 'Elinchrom ELC', elinchrom_d_lite: 'Elinchrom D-Lite', elinchrom: 'Elinchrom',
  broncolor_siros: 'Broncolor Siros', broncolor_move: 'Broncolor Move',
  broncolor_scoro: 'Broncolor Scoro', broncolor_siros_l: 'Broncolor Siros L',
  profoto_pro10: 'Profoto Pro-10', profoto_d1: 'Profoto D1',
};

const MODIFIER_DISPLAY_NAMES = {
  beauty_dish: 'Beauty Dish', softbox: 'Softbox', softbox_rect: 'Rect Softbox',
  softbox_octa: 'Octa Softbox', umbrella: 'Umbrella', umbrella_shoot: 'Shoot-Through Umbrella',
  reflector: 'Reflector', grid: 'Grid', grid_spot: 'Grid Spot',
  stripbox: 'Strip Box', ring_flash: 'Ring Flash', diffusion_panel: 'Diffusion Panel',
  bare: 'Bare Flash',
  // Mola
  mola_setti: 'Mola Setti', mola_demi: 'Mola Demi', mola_euro: 'Mola Euro',
  mola_rayo: 'Mola Rayo', mola_beauty_dish: 'Mola Beauty Dish', mola: 'Mola Dish',
  // Chimera
  chimera: 'Chimera Softbox', chimera_strip: 'Chimera Strip', chimera_octa: 'Chimera Octa',
  // Westcott
  westcott_softbox: 'Westcott Softbox', westcott_octa: 'Westcott Octa',
  westcott_umbrella: 'Westcott Umbrella', westcott_beauty_dish: 'Westcott Beauty Dish',
  // Elinchrom
  elinchrom_rotalux_octa: 'Elinchrom Rotalux Octa', elinchrom_rotalux_rect: 'Elinchrom Rotalux Rect',
  elinchrom_beauty_dish: 'Elinchrom Beauty Dish',
  // Profoto
  profoto_softbox: 'Profoto Softbox', profoto_octa: 'Profoto Octa',
  profoto_beauty_dish: 'Profoto Beauty Dish', profoto_umbrella: 'Profoto Umbrella',
  // Broncolor
  broncolor_softbox: 'Broncolor Softbox', broncolor_octa: 'Broncolor Octa',
  broncolor_beauty_dish: 'Broncolor Beauty Dish',
  // Godox
  godox_softbox: 'Godox Softbox', godox_octa: 'Godox Octa',
  godox_beauty_dish: 'Godox Beauty Dish', godox_umbrella: 'Godox Umbrella',
};

/**
 * Maps brand-specific modifier type strings to their canonical modifier family.
 * This lets kit items stored as e.g. "mola_setti" resolve to "beauty_dish"
 * for matching against modifier family recommendations.
 */
const MODIFIER_BRAND_FAMILIES = {
  // Mola — all are beauty dishes
  mola_setti: 'beauty_dish', mola_demi: 'beauty_dish', mola_euro: 'beauty_dish',
  mola_rayo: 'beauty_dish', mola_beauty_dish: 'beauty_dish', mola: 'beauty_dish',
  // Chimera
  chimera: 'softbox_rect', chimera_strip: 'softbox_rect', chimera_octa: 'softbox_octa',
  // Westcott
  westcott_softbox: 'softbox_rect', westcott_octa: 'softbox_octa',
  westcott_umbrella: 'umbrella_shoot', westcott_beauty_dish: 'beauty_dish',
  // Elinchrom
  elinchrom_rotalux_octa: 'softbox_octa', elinchrom_rotalux_rect: 'softbox_rect',
  elinchrom_beauty_dish: 'beauty_dish',
  // Profoto
  profoto_softbox: 'softbox_rect', profoto_octa: 'softbox_octa',
  profoto_beauty_dish: 'beauty_dish', profoto_umbrella: 'umbrella_shoot',
  // Broncolor
  broncolor_softbox: 'softbox_rect', broncolor_octa: 'softbox_octa',
  broncolor_beauty_dish: 'beauty_dish',
  // Godox
  godox_softbox: 'softbox_rect', godox_octa: 'softbox_octa',
  godox_beauty_dish: 'beauty_dish', godox_umbrella: 'umbrella_shoot',
};

/** Resolve a stored modifier type to its canonical modifier family. */
function resolveModifierFamily(type) {
  // 1. Catalog lookup — covers all types from modifierCatalog.js (primary path)
  const catalogEntry = getModifierDetails(type);
  if (catalogEntry) {
    switch (catalogEntry.category) {
      case 'beauty_dishes': return 'beauty_dish';
      case 'softboxes':     return catalogEntry.shape === 'octagonal' ? 'softbox_octa' : 'softbox_rect';
      case 'stripboxes':    return 'softbox_rect';
      case 'umbrellas':     return 'umbrella_shoot';
      default:              break;
    }
  }
  // 2. Legacy brand map (for types not in catalog)
  if (MODIFIER_BRAND_FAMILIES[type]) return MODIFIER_BRAND_FAMILIES[type];
  // 3. Direct family key (e.g. "softbox_rect")
  if (MODIFIER_FAMILY_TYPES[type]) return type;
  // 4. MODIFIER_FAMILY_TYPES reverse lookup (e.g. bare "softbox" → softbox_rect)
  for (const [family, types] of Object.entries(MODIFIER_FAMILY_TYPES)) {
    if (types.includes(type)) return family;
  }
  // 5. Brand-prefix fallback for unknown variants
  const brand = type.split('_')[0];
  for (const [key, family] of Object.entries(MODIFIER_BRAND_FAMILIES)) {
    if (key === brand || key.startsWith(brand + '_')) return family;
  }
  return null;
}

/** Get human-readable display name for a modifier type — prefers catalog label. */
function modifierDisplayName(type) {
  const entry = getModifierDetails(type);
  if (entry) {
    // Include vendor prefix for branded items so "Demi 22"" shows as "Mola Demi 22""
    return entry.vendor ? `${entry.vendor} ${entry.label}` : entry.label;
  }
  if (MODIFIER_DISPLAY_NAMES[type]) return MODIFIER_DISPLAY_NAMES[type];
  return type.split('_').map(seg =>
    /\d/.test(seg) ? seg.toUpperCase() : seg.charAt(0).toUpperCase() + seg.slice(1)
  ).join(' ');
}

const SUPPORT_DISPLAY_NAMES = {
  light_stand: 'Light Stand', c_stand: 'C-Stand', boom_stand: 'Boom Stand',
  tripod: 'Tripod', monopod: 'Monopod', sandbag: 'Sandbag',
  magic_arm: 'Magic Arm', super_clamp: 'Super Clamp',
  background_stand: 'Background Stand', reflector_holder: 'Reflector Holder',
  gobo_arm: 'Gobo Arm', boom_arm: 'Boom Arm',
};

function formatItemType(type, nameMap) {
  if (nameMap[type]) return nameMap[type];
  // Fallback: title-case, uppercase segments that contain digits (model numbers)
  return type.split('_').map(seg =>
    /\d/.test(seg) ? seg.toUpperCase() : seg.charAt(0).toUpperCase() + seg.slice(1)
  ).join(' ');
}

// Exact modifier type matches for each modifier family
const MODIFIER_FAMILY_TYPES = {
  softbox_rect:  ['softbox', 'softbox_rect'],
  softbox_octa:  ['softbox', 'softbox_octa'],
  beauty_dish:   ['beauty_dish'],
  umbrella_shoot:['umbrella', 'umbrella_shoot'],
  ring_flash:    ['ring_flash'],
};

// Close alternatives: modifier types that can approximate the family but aren't ideal.
// Shown in "From your kit" with a caution label.
const MODIFIER_FAMILY_ALTERNATIVES = {
  beauty_dish:    { types: ['softbox', 'softbox_rect', 'softbox_octa'], note: 'Not a beauty dish — produces softer, less sculpted light. The dish\'s characteristic hard-edge gradient and crisp specular pop won\'t be replicated.' },
  ring_flash:     { types: ['beauty_dish'], note: 'Not a ring flash — won\'t produce the ring-shaped catchlight or flat wrap-around shadow. Usable for beauty but a distinctly different look.' },
  umbrella_shoot: { types: ['softbox', 'softbox_rect'], note: 'Softbox will work — slightly more directional than an umbrella shoot-through. A solid substitute at portrait pace.' },
};

// Why the exact modifier family is ideal for this pattern/setup.
// Shown as a positive rationale under exact kit matches.
const MODIFIER_FAMILY_RATIONALE = {
  beauty_dish:    'Beauty dishes produce the crisp, contrasty gradient and tight specular pop this pattern depends on — softboxes will wrap and flatten the light too much.',
  softbox_rect:   'A rectangular softbox delivers the broad, even field of soft light that wraps cleanly around the face for this setup.',
  softbox_octa:   'An octabox mimics a large window source with a natural, round catchlight — ideal for the even, dimensional quality this look requires.',
  umbrella_shoot: 'A shoot-through umbrella gives the wide, feathered spread this pattern needs — natural falloff and a large apparent source size.',
  ring_flash:     'A ring flash is the only modifier that produces the flat, shadow-free wrap-around light and signature ring-shaped catchlight this setup is built around.',
};

/**
 * Per-modifier fit scores and rationale for each modifier family.
 * score 1.0 = purpose-built for this setup; 0.0 = does not work.
 * Covers exact matches AND known alternatives so every kit item gets a note.
 */
const MODIFIER_FIT = {
  beauty_dish: {
    // — Purpose-built dishes, ranked by output quality —
    mola_setti:            { score: 1.00, note: 'Deep parabolic — exceptional specular pop and crisp hard-edge gradient. The benchmark for sculpted beauty light.' },
    mola_demi:             { score: 0.97, note: 'Smaller 22" Mola — same parabolic crispness as the Setti with tighter throw. Ideal in close-quarters beauty.' },
    mola_euro:             { score: 0.88, note: '33.5" Mola — slightly softer falloff at this size but retains the dish\'s hard-edge character. Excellent for commercial beauty.' },
    mola_mantti:           { score: 0.76, note: 'Large 40" Mola — approaching octa softness. Dish look is more forgiving; loses some of the classic sculpted edge.' },
    elinchrom_softlite_27: { score: 0.92, note: '27" Softlite — one of the smoothest, most even dish fields at this size. Top choice for flawless skin.' },
    elinchrom_softlite_17: { score: 0.72, note: 'Small 17" dish — punchy but can create hotspots on close subjects. Better for dramatic editorial than flattering beauty.' },
    profoto_softlight:     { score: 0.91, note: 'Flat-interior dish — medium contrast, very even field. Commercial beauty standard with consistent results.' },
    profoto_ocf_beauty:    { score: 0.85, note: 'Shallower dish than Softlight — slightly more spread and less specular pop. Still excellent, more versatile.' },
    broncolor_beauty:      { score: 0.91, note: 'Classic 20" dish — punchy, high-contrast output with tight specular. Professional benchmark.' },
    broncolor_beautybox:   { score: 0.80, note: 'Hybrid dish/softbox — softer than a standard dish. More forgiving but loses some of the sculpted hard-edge gradient.' },
    buff_beauty_22:        { score: 0.86, note: 'Classic 22" dish — reliable, high-contrast dish output. Proven standard for portrait and beauty work.' },
    godox_beauty_21:       { score: 0.80, note: 'Mid-size 21" dish — decent output for the price. Slightly uneven field vs premium options but workable.' },
    godox_beauty_16:       { score: 0.68, note: 'Compact 16.5" dish — harder, spottier output than larger dishes. Dramatic but less flattering for smooth beauty.' },
    westcott_beauty_24:    { score: 0.83, note: 'Convertible 24" — versatile and even field. Solid for commercial beauty and corporate headshots.' },
    westcott_beauty_36:    { score: 0.70, note: 'Large 36" convertible — at this size light softens considerably. Loses dish character; gains flattering wrap.' },
    // — Softbox alternatives (lower scores — different light quality) —
    softbox:               { score: 0.42, note: 'Soft, wrapping light — loses the dish\'s hard-edge gradient and specular pop entirely. Different look, not the sculpted dish quality.' },
    softbox_large:         { score: 0.38, note: 'Large softbox produces very flat, even light — opposite of what the beauty dish achieves. Expect minimal shadow sculpting.' },
    softbox_small:         { score: 0.30, note: 'Small softbox — too soft and too small for this setup. Will create flat light without the dish\'s dimensional quality.' },
    octabox:               { score: 0.40, note: 'Natural round catchlight but no hard-edge gradient. Produces pleasing, flattering light — just not dish-quality sculpting.' },
    octabox_large:         { score: 0.35, note: 'Very soft and wrapping — flattering but the opposite of dish light character. Shadow detail will be minimal.' },
    octabox_small:         { score: 0.38, note: 'Rounder catchlight than a rect box, still too soft to replicate the dish\'s specular crispness.' },
    stripbox:              { score: 0.28, note: 'Narrow and directional — creates harsh shadows without the dish\'s elegant gradient. Not suitable as a substitute here.' },
  },

  softbox_rect: {
    // — Purpose-built rectangular softboxes —
    softbox:               { score: 0.95, note: 'Medium 36×48" — the workhorse of studio lighting. Broad, even field with natural falloff. Ideal for this setup.' },
    softbox_large:         { score: 0.90, note: 'Large 48×72" — beautiful broad source. Slightly harder to position but exceptional wrap and even coverage for groups.' },
    softbox_small:         { score: 0.72, note: 'Compact 24×24" — works but the smaller source produces slightly harder light. Best in tight spaces or for smaller subjects.' },
    // — Strip boxes — more directional, can work but limited as key —
    stripbox_medium:       { score: 0.65, note: 'Medium strip — more directional than a standard softbox. Better as an accent or rim light than as the main key for this setup.' },
    stripbox:              { score: 0.60, note: 'Narrow strip — too directional for a broad-key setup. Good for hair/rim but underpowered for key light duty here.' },
    stripbox_narrow:       { score: 0.48, note: 'Very narrow — creates hard-edged soft light. Not ideal as a key; will produce more contrast than this setup intends.' },
    // — Umbrellas as alternatives —
    umbrella_large:        { score: 0.65, note: 'Large umbrella approaches softbox coverage but with more light spill. Less directional control; good in a pinch.' },
    umbrella:              { score: 0.58, note: 'Umbrella produces similar spread but with more spill and less controlled falloff. Looser, more open light than a softbox.' },
    umbrella_reflective_large: { score: 0.55, note: 'Reflective umbrella adds more specular pop than a softbox. Output is harder and more directional than this setup calls for.' },
    umbrella_reflective:   { score: 0.50, note: 'Reflective umbrella — slightly harder quality, less wrapping. Will produce slightly more contrast than a softbox key.' },
    // — Beauty dishes as alternatives —
    westcott_beauty_36:    { score: 0.55, note: 'Large 36" dish is soft enough to approximate a small softbox. Expect slightly more mid-tone contrast and a harder shadow edge.' },
    mola_euro:             { score: 0.45, note: 'Mola\'s output is harder and more directional than this setup calls for. Expect more shadow definition and specular pop.' },
    profoto_softlight:     { score: 0.48, note: 'Dish quality is harder than this setup\'s softbox intent. Produces more sculpted, contrasty light.' },
  },

  softbox_octa: {
    // — Purpose-built octaboxes —
    octabox:               { score: 1.00, note: '47" octabox — ideal size. Natural round catchlight, even coverage, beautiful dimensional wrap. Perfect for this setup.' },
    octabox_large:         { score: 0.92, note: '60" octabox — beautifully soft and wrapping. Slightly harder to control but exceptional light quality and coverage.' },
    octabox_small:         { score: 0.80, note: '32" octabox — works well in tighter spaces. Slightly harder light than the larger version but retains the round-source quality.' },
    // — Rect softboxes as alternatives —
    softbox_large:         { score: 0.68, note: 'Large rect softbox approximates octa coverage but produces a rectangular catchlight. Similar softness, different shape character.' },
    softbox:               { score: 0.60, note: 'Medium softbox will work but the round catchlight and omnidirectional wrap of the octa won\'t be replicated.' },
    softbox_small:         { score: 0.45, note: 'Too small to approximate the broad, wrapping source an octabox provides. Will produce noticeably harder, less flattering light.' },
    // — Umbrellas —
    umbrella_large:        { score: 0.62, note: 'Large umbrella produces similar softness and coverage to an octa with a rounder catchlight. Decent substitute with more spill.' },
    umbrella:              { score: 0.55, note: 'Shoot-through umbrella approaches the round-source quality. Softer control and more spill than an octabox.' },
  },

  umbrella_shoot: {
    // — Purpose-built umbrellas —
    umbrella_large:        { score: 1.00, note: '45" shoot-through — ideal. Larger source means even softer, more wrapping light. Excellent for groups and environmental portraits.' },
    umbrella:              { score: 0.95, note: '33" shoot-through — classic choice. Wide, feathered spread with natural, even falloff. Exactly what this setup calls for.' },
    umbrella_reflective_large: { score: 0.65, note: 'Reflective umbrella adds specular pop and more directional output than a shoot-through. Punchier but less natural and open.' },
    umbrella_reflective:   { score: 0.60, note: 'Reflective umbrella — harder and more directional than shoot-through. Useful when more output or contrast is needed.' },
    // — Softboxes as alternatives —
    softbox_large:         { score: 0.62, note: 'Large softbox approximates the coverage and softness of an umbrella but with more controlled, directional light. Less of the open-air feel.' },
    softbox:               { score: 0.56, note: 'Softbox is more contained and directional. Can substitute but loses the natural, open-light quality that an umbrella provides.' },
    softbox_small:         { score: 0.40, note: 'Too small and directional to replicate the broad, feathered spread an umbrella produces.' },
  },
};

/** Look up fit score and note for a kit modifier against the current setup family. */
function getModifierFit(type, modifierFamily) {
  const familyFits = MODIFIER_FIT[modifierFamily];
  if (!familyFits) return { score: 0.5, note: null };
  // Direct type lookup
  if (familyFits[type]) return familyFits[type];
  // Try catalog category fallback for unmapped types
  const entry = getModifierDetails(type);
  if (entry) {
    // Same category as the target family → decent default score
    const sameFamily = resolveModifierFamily(type) === modifierFamily;
    if (sameFamily) return { score: 0.75, note: null };
  }
  return { score: 0.5, note: null };
}

// Recommended strobe mount system per modifier family + tier.
// Used to generate a speed ring compatibility note for cross-brand modifiers.
const STROBE_MOUNT = {
  softbox_rect:   { good: 'Godox (Bowens mount)',    better: 'Profoto (OCF/RFi mount)', best: 'Broncolor (proprietary)' },
  softbox_octa:   { good: 'Godox (Bowens mount)',    better: 'Profoto (OCF mount)',     best: 'Broncolor (proprietary)' },
  beauty_dish:    { good: 'Godox (Bowens mount)',    better: 'Profoto (proprietary)',   best: 'Broncolor (proprietary)' },
  umbrella_shoot: { good: 'Godox (Bowens mount)',    better: 'Godox (Bowens mount)',    best: 'Profoto (proprietary)'   },
  ring_flash:     { good: 'Godox (proprietary)',     better: 'Profoto (proprietary)',   best: 'Broncolor (proprietary)' },
};

// Support items that are always relevant to a lit studio setup
const RELEVANT_SUPPORT = new Set([
  'light_stand', 'c_stand', 'boom_stand', 'boom_arm', 'gobo_arm',
  'magic_arm', 'super_clamp', 'sandbag',
]);

/**
 * Returns kit items that match both the active tier AND the modifier family.
 * - Lights: must map to `tier`
 * - Modifiers: must relate to `modifierFamily`; flagged needsAdapterCheck when
 *   the stored type is generic (no brand prefix) — may need a speed ring adapter
 * - Support: only stands/grips that are universally needed on set
 *
 * Returns { matches, adapterNote } where adapterNote is a string or null.
 */
function getKitMatches(kit, tier, modifierFamily, setupLights) {
  if (!kit) return { matches: [], adapterNote: null };
  const matches = [];
  let hasModifierMatch = false;

  // Lights — must match the active tier
  for (const light of (kit.lights || [])) {
    const type = (light.type || '').toLowerCase();
    let lightTier = LIGHT_TIER[type];
    if (!lightTier) {
      for (const [key, t] of Object.entries(LIGHT_TIER)) {
        if (type.startsWith(key) || key.startsWith(type.split('_')[0])) {
          lightTier = t;
          break;
        }
      }
    }
    if (lightTier === tier) {
      matches.push({ name: formatItemType(type, LIGHT_DISPLAY_NAMES), qty: light.qty || 1, kind: 'light' });
    }
  }

  // Modifiers — resolve each kit modifier to its family, score fit, match exactly or as alternative.
  // Use index tracking to prevent the same kit item from matching multiple roles.
  const altEntry = MODIFIER_FAMILY_ALTERNATIVES[modifierFamily];
  let exactModifierFound = false;
  let alternativeNote = null;
  const usedModIdx = new Set();

  for (let i = 0; i < (kit.modifiers || []).length; i++) {
    const mod = kit.modifiers[i];
    const type = (mod.type || '').toLowerCase();
    const resolvedFamily = resolveModifierFamily(type);

    if (resolvedFamily === modifierFamily) {
      exactModifierFound = true;
      hasModifierMatch = true;
      usedModIdx.add(i);
      const { score, note: fitNote } = getModifierFit(type, modifierFamily);
      matches.push({ name: modifierDisplayName(type), qty: mod.qty || 1, kind: 'modifier', fitScore: score, fitNote });
    }
  }

  // If no exact match, check for close alternatives using resolved families
  if (!exactModifierFound && altEntry) {
    for (let i = 0; i < (kit.modifiers || []).length; i++) {
      if (usedModIdx.has(i)) continue;
      const mod = kit.modifiers[i];
      const type = (mod.type || '').toLowerCase();
      const resolvedFamily = resolveModifierFamily(type);
      if (resolvedFamily && altEntry.types.includes(resolvedFamily)) {
        hasModifierMatch = true;
        usedModIdx.add(i);
        const { score, note: fitNote } = getModifierFit(type, modifierFamily);
        matches.push({ name: modifierDisplayName(type), qty: mod.qty || 1, kind: 'modifier', isAlternative: true, fitScore: score, fitNote });
        alternativeNote = altEntry.note;
      }
    }
  }

  // Secondary modifiers — fill light needs a softbox; rim/hair needs a softbox or strip.
  // Only consume kit items not already matched to the primary role.
  const secondaryRoles = (setupLights || [])
    .map(l => (l.role || '').toLowerCase())
    .filter(r => r === 'fill' || r === 'hair' || r === 'rim');

  for (const role of secondaryRoles) {
    const roleLabel = role === 'fill' ? 'Fill' : 'Rim';
    for (let i = 0; i < (kit.modifiers || []).length; i++) {
      if (usedModIdx.has(i)) continue;
      const mod = kit.modifiers[i];
      const type = (mod.type || '').toLowerCase();
      const resolvedFamily = resolveModifierFamily(type);
      // Fill and rim/hair both work with any softbox family
      if (resolvedFamily === 'softbox_rect' || resolvedFamily === 'softbox_octa') {
        usedModIdx.add(i);
        const { score, note: fitNote } = getModifierFit(type, 'softbox_rect');
        matches.push({
          name: modifierDisplayName(type),
          qty: mod.qty || 1,
          kind: 'modifier',
          roleLabel,
          fitScore: score,
          fitNote: fitNote || `Works as ${roleLabel.toLowerCase()} light softbox`,
        });
        break; // one match per secondary role
      }
    }
  }

  // Support — only on-set essentials (stands, grips, sandbags)
  for (const sup of (kit.support || [])) {
    const type = (sup.type || '').toLowerCase();
    if (RELEVANT_SUPPORT.has(type)) {
      matches.push({ name: formatItemType(type, SUPPORT_DISPLAY_NAMES), qty: sup.qty || 1, kind: 'support' });
    }
  }

  // Speed ring adapter note: shown when the user has a modifier that matches
  // but may not be native to the recommended strobe's mount system.
  const mountInfo = modifierFamily && STROBE_MOUNT[modifierFamily]?.[tier];
  const adapterNote = hasModifierMatch && mountInfo && !alternativeNote
    ? `⚠ Confirm your modifier fits ${mountInfo} — a speed ring adapter may be required.`
    : null;

  return { matches, adapterNote, alternativeNote };
}

// Map kit light types to gear tier
const LIGHT_TIER = {
  // Entry-level / Godox
  godox_ad200: 'good', godox_ad200pro: 'good', godox_v1: 'good',
  godox_sk400: 'good', godox_sl60: 'good', godox_ad300: 'good',
  neewer: 'good', yongnuo: 'good', flashpoint: 'good',
  // Prosumer / Profoto / Elinchrom
  profoto_b10: 'better', profoto_b10x: 'better', profoto_b1: 'better',
  profoto_b2: 'better', profoto_a1: 'better', profoto_d2: 'better',
  elinchrom_elc: 'better', elinchrom_d_lite: 'better', elinchrom: 'better',
  broncolor_siros: 'better',
  // Professional / Broncolor
  broncolor_move: 'best', broncolor_scoro: 'best', broncolor_siros_l: 'best',
  profoto_pro10: 'best', profoto_d1: 'best',
};

function inferKitTier(kit) {
  if (!kit || !Array.isArray(kit.lights) || kit.lights.length === 0) return null;
  const tiers = { good: 0, better: 0, best: 0 };
  for (const light of kit.lights) {
    const type = (light.type || '').toLowerCase();
    // Match by prefix — e.g. profoto_b10x → profoto_b10x or profoto_b10
    let matched = LIGHT_TIER[type];
    if (!matched) {
      // Partial prefix match
      for (const [key, tier] of Object.entries(LIGHT_TIER)) {
        if (type.startsWith(key) || key.startsWith(type.split('_')[0])) {
          matched = tier;
          break;
        }
      }
    }
    if (matched) tiers[matched]++;
  }
  // Return highest tier found
  if (tiers.best > 0) return 'best';
  if (tiers.better > 0) return 'better';
  if (tiers.good > 0) return 'good';
  return null;
}

export default function RecommendedKitsCard({ modifierFamily, setupLights }) {
  const userKit = useKit();
  const userTier = inferKitTier(userKit);
  const [activeTier, setActiveTier] = useState(userTier || 'good');
  const [showAdvantages, setShowAdvantages] = useState(false);
  const [yourGearOpen, setYourGearOpen] = useState(false);

  // When the user edits their kit, follow their new tier automatically —
  // but only if they haven't manually selected a different tab this session.
  const userPickedRef = useRef(false);
  useEffect(() => {
    if (!userPickedRef.current && userTier) {
      setActiveTier(userTier);
    }
  }, [userTier]);

  // Reset advantages panel when tab changes
  useEffect(() => { setShowAdvantages(false); }, [activeTier]);

  function handleTabClick(tier) {
    userPickedRef.current = true;
    setActiveTier(tier);
  }

  const kit = MODIFIER_KITS[modifierFamily] || FALLBACK_KIT;
  const items = kit[activeTier] || kit.good || [];
  // Blueprint-derived full rig gear (used when Blueprint lights are passed in)
  const blueprintGear = buildBlueprintGear(setupLights, activeTier, modifierFamily);
  const secondaryLightCount = (setupLights || []).filter(l => {
    const r = (l.role || '').toLowerCase();
    return r === 'fill' || r === 'hair' || r === 'rim';
  }).length;
  const { matches: kitMatches, adapterNote, alternativeNote } = getKitMatches(userKit, activeTier, modifierFamily, setupLights);

  // Contextual note based on whether user's kit tier matches
  let kitNote;
  if (!userKit) {
    kitNote = 'Your current gear may not produce this look consistently.';
  } else if (userTier === activeTier) {
    kitNote = 'Your kit matches this tier — use the gear listed in your blueprint above.';
  } else if (userTier === 'better' && activeTier === 'good') {
    kitNote = 'Your kit exceeds this tier — stick to the blueprint, you\u2019re already set.';
  } else if (userTier === 'best' && (activeTier === 'good' || activeTier === 'better')) {
    kitNote = 'Your kit exceeds this tier — stick to the blueprint, you\u2019re already set.';
  } else {
    kitNote = 'Your current kit is below this tier — upgrades here will improve consistency.';
  }

  return (
    <div className="result-card kits-card">
      <div className="result-card__header">
        <CardIcon name="camera" />
        <span>Gear That Gets This Result</span>
      </div>

      {/* Tier selector + kit status row */}
      <div className="kits-card__header-row">
        <div className="kits-card__tabs">
          {Object.entries(TIER_LABELS).map(([tier, meta]) => (
            <button
              key={tier}
              className={`kits-card__tab${activeTier === tier ? ' kits-card__tab--active' : ''}${userTier === tier ? ' kits-card__tab--your-tier' : ''}`}
              onClick={() => handleTabClick(tier)}
              type="button"
              style={activeTier === tier ? { borderColor: meta.color, color: meta.color } : {}}
            >
              <span className="kits-card__tab-label">{meta.label}</span>
              <span className="kits-card__tab-price">{meta.price}</span>
              {userTier === tier && <span className="kits-card__tab-yours"> ✓</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Compact note */}
      <p className="kits-card__consistency-note">{kitNote}</p>
      <button
        className="kits-card__why-btn"
        onClick={() => setShowAdvantages(v => !v)}
        type="button"
      >
        {showAdvantages ? '− Hide details' : 'Why this tier?'}
      </button>

      {showAdvantages && TIER_ADVANTAGES[activeTier] && (
        <div className="kits-card__advantages">
          <p className="kits-card__advantages-headline">{TIER_ADVANTAGES[activeTier].headline}</p>
          <ul className="kits-card__advantages-list">
            {TIER_ADVANTAGES[activeTier].points.map((pt, i) => (
              <li key={i}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                {pt}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(() => {
        const supportItems = SETUP_SUPPORT[modifierFamily]?.items || [];
        const supportNote = SETUP_SUPPORT[modifierFamily]?.note;
        // Use blueprint-derived labeled sections when available, fall back to flat list
        if (blueprintGear) {
          return (
            <>
              {blueprintGear.map((section, si) => (
                <CollapsibleKitSection key={si} label={section.roleLabel} role={section.roleKey} defaultOpen={si === 0}>
                  <ul className="kits-card__items">
                    {section.items.map((item, i) => (
                      <li key={i}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        <span className="kits-card__item-qty">{item.qty}×</span>
                        <VendorLogo name={item.name} />
                        <ShopLink name={item.name}>{item.name}</ShopLink>
                      </li>
                    ))}
                  </ul>
                  {section.alt && (
                    <p className="kits-card__fill-alt">{section.alt}</p>
                  )}
                </CollapsibleKitSection>
              ))}
              {(() => {
                // Augment support with extra stands for secondary lights
                const extraStands = secondaryLightCount > 0
                  ? [{ name: 'Light Stand', qty: secondaryLightCount }]
                  : [];
                const allSupportItems = [...supportItems, ...extraStands];
                return allSupportItems.length > 0 ? (
                  <CollapsibleKitSection label="Support" defaultOpen={false}>
                    <ul className="kits-card__items">
                      {allSupportItems.map((item, i) => (
                        <li key={i} className="kits-card__item--support">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                          <span className="kits-card__item-qty">{item.qty}×</span>
                          <VendorLogo name={item.name} />
                          <ShopLink name={item.name}>{item.name}</ShopLink>
                        </li>
                      ))}
                    </ul>
                    {supportNote && <p className="kits-card__support-note">{supportNote}</p>}
                  </CollapsibleKitSection>
                ) : null;
              })()}
              {!SETUP_SUPPORT[modifierFamily]?.items?.length && supportNote && (
                <p className="kits-card__support-note">{supportNote}</p>
              )}
            </>
          );
        }
        // Fallback: flat list (no blueprint lights)
        return (
          <>
            <ul className="kits-card__items">
              {items.map((item, i) => (
                <li key={`gear-${i}`}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  <span className="kits-card__item-qty">{item.qty}×</span>
                  <VendorLogo name={item.name} />
                  <ShopLink name={item.name}>{item.name}</ShopLink>
                </li>
              ))}
              {supportItems.map((item, i) => (
                <li key={`sup-${i}`} className="kits-card__item--support">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  <span className="kits-card__item-qty">{item.qty}×</span>
                  <VendorLogo name={item.name} />
                  <ShopLink name={item.name}>{item.name}</ShopLink>
                </li>
              ))}
            </ul>
            {supportNote && <p className="kits-card__support-note">{supportNote}</p>}
          </>
        );
      })()}

      {kitMatches.length > 0 && (() => {
        // Sort: lights first, then modifiers by fitScore desc (best match first), then support
        const KIND_ORDER = { light: 0, modifier: 1, support: 2 };
        const sorted = [...kitMatches].sort((a, b) => {
          const ko = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
          if (ko !== 0) return ko;
          if (a.kind === 'modifier' && b.kind === 'modifier') {
            return (b.fitScore ?? 0.5) - (a.fitScore ?? 0.5);
          }
          return 0;
        });
        const hasExactModifier = kitMatches.some(m => m.kind === 'modifier' && !m.isAlternative);
        const hasAltOnly = !hasExactModifier && kitMatches.some(m => m.isAlternative);
        return (
          <div className={`kits-card__your-gear${yourGearOpen ? ' kits-card__your-gear--open' : ''}`}>
            <button
              type="button"
              className="kits-card__your-gear-header kits-card__your-gear-toggle"
              onClick={() => setYourGearOpen(v => !v)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className="kits-card__your-gear-icon">
                <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
                <line x1="3" y1="6" x2="21" y2="6"/>
                <path d="M16 10a4 4 0 01-8 0"/>
              </svg>
              <div className="kits-card__your-gear-text">
                <p className="kits-card__your-gear-label">
                  {hasAltOnly ? 'Closest gear you already own' : 'Gear you already own'}
                  {!yourGearOpen && sorted.length > 0 && (
                    <span className="kits-card__your-gear-count"> ({sorted.length})</span>
                  )}
                </p>
                <p className="kits-card__your-gear-sub">
                  {hasAltOnly
                    ? 'No exact match — these from your kit can substitute'
                    : 'These items from your saved kit work for this setup'}
                </p>
              </div>
              <svg
                className="kits-card__your-gear-chevron"
                width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                style={{ transform: yourGearOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease', flexShrink: 0, opacity: 0.5 }}
              >
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            {yourGearOpen && <ul className="kits-card__your-gear-list">
              {sorted.map((match, i) => (
                <li key={i} className={`kits-card__your-gear-item${match.isAlternative ? ' kits-card__your-gear-alternative' : ''}`}>
                  <div className="kits-card__your-gear-item-row">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                      style={{ flexShrink: 0, color: match.isAlternative ? '#f59e0b' : '#6ee7b7' }}>
                      {match.isAlternative
                        ? <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                        : <polyline points="20 6 9 17 4 12"/>}
                    </svg>
                    <VendorLogo name={match.name} />
                    <span className="kits-card__your-gear-name">
                      <ShopLink name={match.name}>{match.name}</ShopLink>
                      {' '}×{match.qty}
                    </span>
                    <span className={`kits-card__kind-tag kits-card__kind-tag--${match.kind}`}>{match.kind}</span>
                    {match.roleLabel && (
                      <span className={`kits-card__role-tag kits-card__role-tag--${match.roleLabel.toLowerCase()}`}>
                        {match.roleLabel}
                      </span>
                    )}
                    {match.isAlternative && <span className="kits-card__alt-tag">alt</span>}
                  </div>
                  {match.fitNote && match.kind === 'modifier' && (
                    <p className="kits-card__fit-note">{match.fitNote}</p>
                  )}
                </li>
              ))}
            </ul>}
            {yourGearOpen && hasExactModifier && MODIFIER_FAMILY_RATIONALE[modifierFamily] && (
              <p className="kits-card__match-rationale">{MODIFIER_FAMILY_RATIONALE[modifierFamily]}</p>
            )}
            {yourGearOpen && alternativeNote && (
              <p className="kits-card__alternative-note">{alternativeNote}</p>
            )}
            {yourGearOpen && adapterNote && (
              <p className="kits-card__adapter-note">{adapterNote}</p>
            )}
          </div>
        );
      })()}
    </div>
  );
}
