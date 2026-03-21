import { useState, useMemo } from 'react';
import { useAppState, useDispatch } from '../context/AppContext';
import ChipStepper from '../components/ChipStepper';
import { LIGHT_CATALOG } from '../data/lightCatalog';
import { MODIFIER_CATEGORIES } from '../data/modifierCatalog';
import { getSupportByCategory } from '../data/supportCatalog';
import { saveKit } from '../data/kitStore';
import VendorLogo from '../components/VendorLogo';

/* ── Quick Kit Presets (Good / Better / Best) ──────── */
const QUICK_KITS = [
  // ── Good (budget-friendly, gets the job done) ──
  {
    id: 'good_one_light',
    tier: 'good',
    label: '1-Light Starter',
    desc: 'Speedlight + umbrella — clean single source',
    lights: [{ type: 'godox_v860iii', qty: 1 }],
    modifiers: [{ type: 'umbrella', qty: 1 }],
    support: [{ type: 'light_stand_8', qty: 1 }],
  },
  {
    id: 'good_two_light',
    tier: 'good',
    label: '2-Light Budget Kit',
    desc: 'Two speedlights — key + fill on a budget',
    lights: [{ type: 'godox_v860iii', qty: 2 }],
    modifiers: [{ type: 'umbrella', qty: 1 }, { type: 'umbrella_reflective', qty: 1 }],
    support: [{ type: 'light_stand_8', qty: 2 }, { type: 'sandbag_15', qty: 2 }],
  },
  // ── Better (solid pro-am / working photographer) ──
  {
    id: 'better_portrait',
    tier: 'better',
    label: '2-Light Portrait',
    desc: 'Portable strobe + octabox — pro-quality one or two light',
    lights: [{ type: 'godox_ad300', qty: 2 }],
    modifiers: [{ type: 'octabox', qty: 1 }, { type: 'stripbox', qty: 1 }],
    support: [{ type: 'c_stand_40', qty: 2 }, { type: 'sandbag_15', qty: 2 }],
  },
  {
    id: 'better_beauty',
    tier: 'better',
    label: 'Clamshell Beauty',
    desc: 'Key above + fill below — fashion/beauty standard',
    lights: [{ type: 'godox_ad300', qty: 2 }],
    modifiers: [{ type: 'octabox', qty: 1 }, { type: 'reflector', qty: 1 }],
    support: [{ type: 'c_stand_40', qty: 1 }, { type: 'boom_arm_78', qty: 1 }, { type: 'sandbag_25', qty: 1 }],
  },
  // ── Best (studio pro / commercial) ──
  {
    id: 'best_three_light',
    tier: 'best',
    label: '3-Light Studio',
    desc: 'Key + fill + rim — full studio control',
    lights: [{ type: 'profoto_b10x', qty: 3 }],
    modifiers: [{ type: 'profoto_softlight', qty: 1 }, { type: 'softbox_large', qty: 1 }, { type: 'stripbox', qty: 1 }],
    support: [{ type: 'c_stand_avenger', qty: 3 }, { type: 'sandbag_25', qty: 3 }, { type: 'boom_arm_78', qty: 1 }],
  },
  {
    id: 'best_cinematic',
    tier: 'best',
    label: 'Cinematic / Editorial',
    desc: 'Hard key + shaped rim — dramatic editorial look',
    lights: [{ type: 'profoto_b10x', qty: 2 }],
    modifiers: [{ type: 'grid_spot', qty: 1 }, { type: 'snoot', qty: 1 }, { type: 'barn_doors', qty: 1 }],
    support: [{ type: 'c_stand_avenger', qty: 2 }, { type: 'sandbag_25', qty: 2 }, { type: 'flag_24x36', qty: 2 }],
  },
  // ── Natural (ambient / no artificial light) ──
  {
    id: 'natural_window',
    tier: 'natural',
    label: 'Natural Light + Fill',
    desc: 'Window key + reflector/scrim — no flash needed',
    lights: [],
    modifiers: [{ type: 'reflector', qty: 1 }, { type: 'scrim', qty: 1 }, { type: 'v_flat', qty: 1 }],
    support: [{ type: 'c_stand_40', qty: 1 }],
  },
];

const TIER_LABELS = {
  good: { label: 'Good', color: 'var(--color-text-secondary)' },
  better: { label: 'Better', color: 'var(--color-accent)' },
  best: { label: 'Best', color: '#22c55e' },
  natural: { label: 'Natural', color: '#eab308' },
};

/* ── Gear profile recommendations by mood ──────────── */
const MOOD_GEAR_AFFINITY = {
  beauty:     { profiles: ['strobe_mono', 'strobe_pack'], minTier: 2 },
  cinematic:  { profiles: ['strobe_mono', 'strobe_pack', 'led_cob'], minTier: 2 },
  corporate:  { profiles: ['strobe_mono', 'speedlight', 'led_cob'], minTier: 1 },
  editorial:  { profiles: ['strobe_mono', 'strobe_pack'], minTier: 3 },
  natural:    { profiles: ['led_cob', 'led_panel'], minTier: 1 },
  high_key:   { profiles: ['strobe_mono', 'strobe_pack'], minTier: 2 },
  low_key:    { profiles: ['strobe_mono', 'strobe_pack', 'led_cob'], minTier: 2 },
};

/* ── Environment recommendations for support gear ──── */
const ENV_SUPPORT_AFFINITY = {
  studio:      ['c_stand_40', 'c_stand_avenger', 'boom_arm_78', 'sandbag_25', 'flag_24x36', 'v_flat_black', 'v_flat_white', 'seamless_white', 'seamless_gray', 'power_strip'],
  home_studio: ['c_stand_20', 'light_stand_8', 'sandbag_15', 'reflector', 'collapsible_bg'],
  office:      ['light_stand_8', 'light_stand_10', 'sandbag_15', 'collapsible_bg', 'gaffer_tape'],
  small_room:  ['light_stand_8', 'sandbag_15', 'collapsible_bg'],
  outdoors:    ['light_stand_10', 'sandbag_25', 'scrim', 'reflector'],
  on_location: ['c_stand_20', 'light_stand_10', 'sandbag_15', 'collapsible_bg', 'gaffer_tape', 'extension_25ft'],
};

/* ── Vendor recommendation reasons ──────────────────── */
/** Short reason why this light works for the given mood / environment */
const LIGHT_REASONS = {
  // Speedlights
  godox_v860iii: { beauty: 'reliable TTL, pairs well with octabox', corporate: 'portable, consistent output', cinematic: 'quick recycle for dramatic setups' },
  godox_v1:      { beauty: 'round head for natural catchlights' },
  profoto_a10:   { beauty: 'Profoto quality in a speedlight, precise control', editorial: 'reliable for on-location', corporate: 'professional color accuracy' },
  profoto_a2:    { beauty: 'compact with Profoto color consistency' },
  // Portable strobes
  godox_ad300:   { beauty: 'consistent power for close-up work', corporate: 'portable studio quality', cinematic: 'enough output for dramatic ratios', editorial: 'reliable on location' },
  godox_ad600:   { beauty: 'high output for large modifiers', editorial: 'overpowers ambient outdoors', cinematic: 'powers large modifiers for drama', high_key: 'enough power for white blowout' },
  godox_ad400:   { beauty: 'flexible power range for fine-tuning', cinematic: 'versatile for key/fill ratios' },
  profoto_b10x:  { beauty: 'industry standard for beauty, precise', editorial: 'portable pro quality', corporate: 'consistent skin tones', cinematic: 'reliable control for moody ratios' },
  profoto_b10:   { beauty: 'compact precision, ideal for beauty', corporate: 'consistent output shoot to shoot' },
  profoto_b1x:   { editorial: 'powerful on location', cinematic: 'reliable power for dramatic setups', high_key: 'high output for full white' },
  elinchrom_five: { beauty: 'FIVE captures fast movement, great for beauty', cinematic: 'freeze motion without blur', editorial: 'crisp for action portraits' },
  elinchrom_three: { beauty: 'compact with precise color temperature', corporate: 'consistent color across shots' },
  westcott_fj400: { beauty: 'budget-friendly Bowens mount', corporate: 'reliable wireless TTL' },
  // Studio strobes
  profoto_d2:    { beauty: 'fastest flash duration for freeze skin', editorial: 'precise power for any ratio', cinematic: 'pro studio control' },
  profoto_d3:    { beauty: 'best color accuracy, freeze motion', editorial: 'precise control at any power' },
  // LED
  godox_sl200ii: { natural: 'bicolor for window-matching, continuous', cinematic: 'adjustable CCT for mood' },
  godox_sl150ii: { natural: 'daylight LED matches window light', corporate: 'no flicker for video-hybrid' },
  aputure_600d:  { cinematic: 'cinema-quality output, precise', natural: 'daylight accurate for window looks' },
  aputure_300d:  { cinematic: 'cinematic output, clean shadow control', natural: 'matches natural daylight' },
};

/** Get a reason string for why this item suits the current mood */
function getLightReason(item, mood) {
  const reasons = LIGHT_REASONS[item.value];
  if (!reasons || !mood) return null;
  return reasons[mood] || reasons['corporate'] || null; // fallback to corporate as generic
}

/** Group items within a category by vendor */
function groupByVendor(items) {
  const groups = [];
  const seen = {};
  for (const item of items) {
    if (!seen[item.vendor]) {
      seen[item.vendor] = { vendor: item.vendor, items: [] };
      groups.push(seen[item.vendor]);
    }
    seen[item.vendor].items.push(item);
  }
  return groups;
}

export default function StepGearEntry() {
  const { gear, mood, environment } = useAppState();
  const dispatch = useDispatch();
  const [openCats, setOpenCats] = useState({});
  const [openVendors, setOpenVendors] = useState({});
  const [openModCats, setOpenModCats] = useState({});
  const [kitSaved, setKitSaved] = useState(false);
  const [kitsExpanded, setKitsExpanded] = useState(true);

  /* ── Context-aware highlighting ────────────────────── */

  /** Is this light a good match for the current mood? */
  const isLightRecommended = useMemo(() => {
    if (!mood) return () => false;
    const aff = MOOD_GEAR_AFFINITY[mood];
    if (!aff) return () => false;
    return (item) => aff.profiles.includes(item.gearProfile) && item.qualityTier >= aff.minTier;
  }, [mood]);

  /** Is this modifier a good match for the current mood? */
  const isModRecommended = useMemo(() => {
    if (!mood) return () => false;
    return (item) => {
      const score = item.moodAffinity?.[mood];
      return score != null && score >= 0.7;
    };
  }, [mood]);

  /** Is this support item recommended for the environment? */
  const isSupportRecommended = useMemo(() => {
    if (!environment) return () => false;
    const recommended = ENV_SUPPORT_AFFINITY[environment] || [];
    return (item) => recommended.includes(item.value);
  }, [environment]);

  /* ── Kit match: derive tier from owned lights ──────── */
  const gearMatchSummary = useMemo(() => {
    if (gear.lights.length === 0) return null;
    // Build a flat lookup map of all catalogued lights by value
    const lightMap = {};
    LIGHT_CATALOG.forEach(cat => {
      cat.items.forEach(item => { lightMap[item.value] = item; });
    });
    let bestTier = 0;
    let moodMatched = false;
    const aff = mood ? MOOD_GEAR_AFFINITY[mood] : null;
    gear.lights.forEach(l => {
      const info = lightMap[l.type];
      if (!info) return;
      if ((info.qualityTier || 0) > bestTier) bestTier = info.qualityTier || 0;
      if (aff && aff.profiles.includes(info.gearProfile) && (info.qualityTier || 0) >= aff.minTier) {
        moodMatched = true;
      }
    });
    let tier, label, color;
    if (bestTier >= 4) { tier = 'best';   label = 'Best';    color = '#22c55e'; }
    else if (bestTier >= 2) { tier = 'better'; label = 'Better'; color = 'var(--color-accent)'; }
    else              { tier = 'good';   label = 'Good';    color = 'var(--color-text-secondary)'; }
    const n = gear.lights.reduce((sum, l) => sum + l.qty, 0);
    const moodLabel = mood ? mood.replace(/_/g, ' ') : null;
    const sublabel = moodMatched && moodLabel
      ? `${n} light${n > 1 ? 's' : ''} — ideal for ${moodLabel}`
      : moodLabel
        ? `${n} light${n > 1 ? 's' : ''} — try a matching kit for ${moodLabel}`
        : `${n} light${n > 1 ? 's' : ''} owned`;
    return { tier, label, color, sublabel };
  }, [gear.lights, mood]);

  /* ── Quick kit relevance: highlight kits matching mood ── */
  const kitMoodMatch = useMemo(() => {
    if (!mood) return {};
    const map = {
      beauty:    ['better_beauty', 'best_three_light', 'good_two_light'],
      cinematic: ['best_cinematic', 'better_portrait'],
      corporate: ['better_portrait', 'best_three_light', 'good_two_light'],
      editorial: ['best_cinematic', 'best_three_light'],
      natural:   ['natural_window'],
      high_key:  ['best_three_light', 'better_portrait'],
      low_key:   ['best_cinematic', 'better_portrait'],
    };
    const matches = map[mood] || [];
    const out = {};
    matches.forEach(id => { out[id] = true; });
    return out;
  }, [mood]);

  /* ── Standard helpers ──────────────────────────────── */

  function toggleCat(cat) {
    setOpenCats(prev => ({ ...prev, [cat]: !prev[cat] }));
  }

  function toggleVendor(key) {
    setOpenVendors(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleModCat(key) {
    setOpenModCats(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function lightQty(type) {
    const item = gear.lights.find(l => l.type === type);
    return item ? item.qty : 0;
  }

  function catCount(category) {
    return category.items.reduce((sum, item) => sum + lightQty(item.value), 0);
  }

  function vendorCount(items) {
    return items.reduce((sum, item) => sum + lightQty(item.value), 0);
  }

  function supportQty(type) {
    const item = gear.support.find(s => s.type === type);
    return item ? item.qty : 0;
  }

  function modQty(type) {
    const item = gear.modifiers.find(m => m.type === type);
    return item ? item.qty : 0;
  }

  function modCatCount(catItems) {
    return catItems.reduce((sum, m) => sum + modQty(m.value), 0);
  }

  function handleSaveKit() {
    saveKit(gear);
    setKitSaved(true);
    setTimeout(() => setKitSaved(false), 2000);
  }

  function loadQuickKit(kit) {
    dispatch({
      type: 'LOAD_GEAR_KIT',
      gear: { lights: kit.lights, modifiers: kit.modifiers, support: kit.support },
    });
  }

  const totalLights = gear.lights.reduce((s, l) => s + l.qty, 0);
  const totalMods = gear.modifiers.reduce((s, m) => s + m.qty, 0);
  const totalSupport = gear.support.reduce((s, s2) => s + s2.qty, 0);

  const lightCats = LIGHT_CATALOG.filter(c => c.section !== 'accessories');
  const accessoryCats = LIGHT_CATALOG.filter(c => c.section === 'accessories');

  // Group kits by tier
  // Best shown first — users scan top to bottom
  const kitTiers = ['best', 'better', 'good', 'natural'];

  return (
    <>
      <h2 className="screen-heading">With your gear, this becomes:</h2>

      {/* ── Kit Match indicator ──────────────────── */}
      {gearMatchSummary && (
        <div className="kit-match-bar" style={{ borderLeftColor: gearMatchSummary.color }}>
          <span className="kit-match-bar__tier" style={{ color: gearMatchSummary.color }}>
            {gearMatchSummary.label}
          </span>
          <span className="kit-match-bar__label">{gearMatchSummary.sublabel}</span>
        </div>
      )}

      {/* ── Quick Kits — Good / Better / Best ────── */}
      <div className="gear-section">
        <button
          type="button"
          className="gear-section__label gear-section__label--toggle"
          onClick={() => setKitsExpanded(!kitsExpanded)}
        >
          Quick Kits
          <span className="gear-section__hint">Ready to shoot with what you have</span>
          <span className={`gear-category__arrow${kitsExpanded ? ' gear-category__arrow--open' : ''}`}>
            {'\u25BC'}
          </span>
        </button>
        {kitsExpanded && (
          <div className="quick-kits-tiers">
            {kitTiers.map(tier => {
              const tierKits = QUICK_KITS.filter(k => k.tier === tier);
              if (!tierKits.length) return null;
              const t = TIER_LABELS[tier];
              return (
                <div className="quick-kits-tier" key={tier}>
                  <div className="quick-kits-tier__label" style={{ color: t.color }}>
                    {t.label}
                  </div>
                  <div className="quick-kits">
                    {tierKits.map(kit => {
                      const matched = kitMoodMatch[kit.id];
                      const kitParts = [];
                      const lCount = kit.lights.reduce((s, l) => s + l.qty, 0);
                      const mCount = kit.modifiers.reduce((s, m) => s + m.qty, 0);
                      const sCount = kit.support.reduce((s, s2) => s + s2.qty, 0);
                      if (lCount) kitParts.push(`${lCount} light${lCount > 1 ? 's' : ''}`);
                      if (mCount) kitParts.push(`${mCount} mod${mCount > 1 ? 's' : ''}`);
                      if (sCount) kitParts.push(`${sCount} support`);
                      return (
                        <button
                          key={kit.id}
                          type="button"
                          className={`quick-kit quick-kit--${kit.tier}${matched ? ' quick-kit--recommended' : ''}`}
                          onClick={() => loadQuickKit(kit)}
                        >
                          <span className="quick-kit__name">
                            {kit.label}
                            {matched && <span className="quick-kit__match-dot" title="Matches your vibe">{'\u2605'}</span>}
                          </span>
                          <span className="quick-kit__desc">{kit.desc}</span>
                          <span className="quick-kit__counts">{kitParts.join(' · ')}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Summary bar ─────────────────────────────── */}
      {(totalLights > 0 || totalMods > 0 || totalSupport > 0) && (
        <div className="gear-summary-bar">
          {totalLights > 0 && <span className="gear-summary-bar__item">{totalLights} light{totalLights !== 1 ? 's' : ''}</span>}
          {totalMods > 0 && <span className="gear-summary-bar__item">{totalMods} modifier{totalMods !== 1 ? 's' : ''}</span>}
          {totalSupport > 0 && <span className="gear-summary-bar__item">{totalSupport} support</span>}
        </div>
      )}

      {/* ── Lights ──────────────────────────────────── */}
      <div className="gear-section">
        <div className="gear-section__label">
          Lights
          {mood && <span className="gear-section__context">for {mood.replace(/_/g, ' ')}</span>}
        </div>
        {lightCats.map(cat => {
          const isOpen = !!openCats[cat.category];
          const count = catCount(cat);
          const vendorGroups = groupByVendor(cat.items);
          return (
            <div className="gear-category" key={cat.category}>
              <button
                type="button"
                className="gear-category__header"
                onClick={() => toggleCat(cat.category)}
              >
                <span className="gear-category__icon">{cat.icon}</span>
                <span className="gear-category__label">{cat.label}</span>
                {count > 0 && <span className="gear-category__count">{count}</span>}
                <span className={`gear-category__arrow${isOpen ? ' gear-category__arrow--open' : ''}`}>
                  {'\u25BC'}
                </span>
              </button>
              {isOpen && (
                <div className="gear-category__items">
                  {vendorGroups.map(group => {
                    const vKey = `${cat.category}:${group.vendor}`;
                    const vOpen = !!openVendors[vKey];
                    const vCount = vendorCount(group.items);
                    return (
                      <div className="vendor-group" key={group.vendor}>
                        <button
                          type="button"
                          className="vendor-group__header"
                          onClick={() => toggleVendor(vKey)}
                        >
                          <VendorLogo name={group.vendor} />
                          <span className="vendor-group__name">{group.vendor}</span>
                          {vCount > 0 && <span className="vendor-group__count">{vCount}</span>}
                          <span className={`vendor-group__arrow${vOpen ? ' vendor-group__arrow--open' : ''}`}>
                            {'\u203A'}
                          </span>
                        </button>
                        {vOpen && (
                          <div className="vendor-group__models">
                            {group.items.map(item => (
                              <ChipStepper
                                key={item.value}
                                label={item.model}
                                qty={lightQty(item.value)}
                                highlighted={isLightRecommended(item)}
                                reason={getLightReason(item, mood)}
                                onAdd={() => dispatch({ type: 'ADD_GEAR_LIGHT', lightType: item.value })}
                                onIncrement={() => dispatch({ type: 'UPDATE_GEAR_QTY', lightType: item.value, delta: 1 })}
                                onDecrement={() => dispatch({ type: 'UPDATE_GEAR_QTY', lightType: item.value, delta: -1 })}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Modifiers (shapes the light) ────────────── */}
      <div className="gear-section">
        <div className="gear-section__label">
          Modifiers
          {mood && <span className="gear-section__context">for {mood.replace(/_/g, ' ')}</span>}
        </div>
        {MODIFIER_CATEGORIES.map(cat => {
          const isOpen = !!openModCats[cat.key];
          const count = modCatCount(cat.items);
          return (
            <div className="gear-category" key={cat.key}>
              <button
                type="button"
                className="gear-category__header"
                onClick={() => toggleModCat(cat.key)}
              >
                <span className="gear-category__label">{cat.label}</span>
                {count > 0 && <span className="gear-category__count">{count}</span>}
                <span className={`gear-category__arrow${isOpen ? ' gear-category__arrow--open' : ''}`}>
                  {'\u25BC'}
                </span>
              </button>
              {isOpen && (() => {
                // Check if this category has vendor sub-groups
                const hasVendors = cat.items.some(item => item.vendor);
                if (!hasVendors) {
                  return (
                    <div className="gear-category__items" style={{ padding: '4px 0 8px' }}>
                      <div className="chip-grid">
                        {cat.items.map(item => (
                          <ChipStepper
                            key={item.value}
                            label={item.label}
                            qty={modQty(item.value)}
                            highlighted={isModRecommended(item)}
                            onAdd={() => dispatch({ type: 'ADD_MODIFIER', modifier: item.value })}
                            onIncrement={() => dispatch({ type: 'UPDATE_MODIFIER_QTY', modifier: item.value, delta: 1 })}
                            onDecrement={() => dispatch({ type: 'UPDATE_MODIFIER_QTY', modifier: item.value, delta: -1 })}
                          />
                        ))}
                      </div>
                    </div>
                  );
                }
                // Group items by vendor
                const vendorGroups = [];
                const vendorSeen = {};
                for (const item of cat.items) {
                  const v = item.vendor || 'Generic';
                  if (!vendorSeen[v]) { vendorSeen[v] = []; vendorGroups.push(v); }
                  vendorSeen[v].push(item);
                }
                return (
                  <div className="gear-category__items" style={{ padding: '4px 0 8px' }}>
                    {vendorGroups.map(v => (
                      <div key={v} style={{ marginBottom: 6 }}>
                        <div className="gear-vendor-label">{v}</div>
                        <div className="chip-grid">
                          {vendorSeen[v].map(item => (
                            <ChipStepper
                              key={item.value}
                              label={item.label}
                              qty={modQty(item.value)}
                              highlighted={isModRecommended(item)}
                              onAdd={() => dispatch({ type: 'ADD_MODIFIER', modifier: item.value })}
                              onIncrement={() => dispatch({ type: 'UPDATE_MODIFIER_QTY', modifier: item.value, delta: 1 })}
                              onDecrement={() => dispatch({ type: 'UPDATE_MODIFIER_QTY', modifier: item.value, delta: -1 })}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>

      {/* ── Support & Grip ──────────────────────────── */}
      <div className="gear-section">
        <div className="gear-section__label">
          Support & Grip
          {environment && <span className="gear-section__context">for {environment.replace(/_/g, ' ')}</span>}
        </div>
        {getSupportByCategory().map(cat => {
          const isOpen = !!openCats[`support_${cat.key}`];
          const count = cat.items.reduce((sum, item) => sum + supportQty(item.value), 0);
          // Only use vendor sub-groups for categories with 3+ distinct branded vendors
          const uniqueVendors = new Set(cat.items.map(i => i.vendor));
          const brandedVendors = [...uniqueVendors].filter(v => v !== 'Generic');
          const useVendorGroups = brandedVendors.length >= 3;

          return (
            <div className="gear-category" key={cat.key}>
              <button
                type="button"
                className="gear-category__header"
                onClick={() => toggleCat(`support_${cat.key}`)}
              >
                <span className="gear-category__label">{cat.label}</span>
                {count > 0 && <span className="gear-category__count">{count}</span>}
                <span className={`gear-category__arrow${isOpen ? ' gear-category__arrow--open' : ''}`}>
                  {'\u25BC'}
                </span>
              </button>
              {isOpen && !useVendorGroups && (
                <div className="gear-category__items" style={{ padding: '4px 0 8px' }}>
                  <div className="chip-grid">
                    {cat.items.map(item => (
                      <ChipStepper
                        key={item.value}
                        label={item.label}
                        qty={supportQty(item.value)}
                        highlighted={isSupportRecommended(item)}
                        onAdd={() => dispatch({ type: 'ADD_SUPPORT_GEAR', supportType: item.value })}
                        onIncrement={() => dispatch({ type: 'UPDATE_SUPPORT_QTY', supportType: item.value, delta: 1 })}
                        onDecrement={() => dispatch({ type: 'UPDATE_SUPPORT_QTY', supportType: item.value, delta: -1 })}
                      />
                    ))}
                  </div>
                </div>
              )}
              {isOpen && useVendorGroups && (() => {
                const vendorGroups = [];
                const vendorSeen = {};
                for (const item of cat.items) {
                  if (!vendorSeen[item.vendor]) {
                    vendorSeen[item.vendor] = { vendor: item.vendor, items: [] };
                    vendorGroups.push(vendorSeen[item.vendor]);
                  }
                  vendorSeen[item.vendor].items.push(item);
                }
                return (
                <div className="gear-category__items">
                  {vendorGroups.map(group => {
                    const vKey = `support_${cat.key}:${group.vendor}`;
                    const vOpen = vendorGroups.length === 1 || !!openVendors[vKey];
                    const vCount = group.items.reduce((sum, item) => sum + supportQty(item.value), 0);
                    return (
                      <div className="vendor-group" key={group.vendor}>
                        {vendorGroups.length > 1 && (
                          <button
                            type="button"
                            className="vendor-group__header"
                            onClick={() => toggleVendor(vKey)}
                          >
                            <VendorLogo name={group.vendor} />
                          <span className="vendor-group__name">{group.vendor}</span>
                            {vCount > 0 && <span className="vendor-group__count">{vCount}</span>}
                            <span className={`vendor-group__arrow${vOpen ? ' vendor-group__arrow--open' : ''}`}>
                              {'\u203A'}
                            </span>
                          </button>
                        )}
                        {vOpen && (
                          <div className="vendor-group__models">
                            {group.items.map(item => (
                              <ChipStepper
                                key={item.value}
                                label={item.label}
                                qty={supportQty(item.value)}
                                highlighted={isSupportRecommended(item)}
                                onAdd={() => dispatch({ type: 'ADD_SUPPORT_GEAR', supportType: item.value })}
                                onIncrement={() => dispatch({ type: 'UPDATE_SUPPORT_QTY', supportType: item.value, delta: 1 })}
                                onDecrement={() => dispatch({ type: 'UPDATE_SUPPORT_QTY', supportType: item.value, delta: -1 })}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
              })()}
            </div>
          );
        })}
      </div>

      {/* ── Accessories ─────────────────────────────── */}
      {accessoryCats.length > 0 && (
        <div className="gear-section">
          <div className="gear-section__label">Accessories</div>
          {accessoryCats.map(cat => {
            const isOpen = !!openCats[cat.category];
            const count = catCount(cat);
            const vendorGroups = groupByVendor(cat.items);
            return (
              <div className="gear-category" key={cat.category}>
                <button
                  type="button"
                  className="gear-category__header"
                  onClick={() => toggleCat(cat.category)}
                >
                  <span className="gear-category__icon">{cat.icon}</span>
                  <span className="gear-category__label">{cat.label}</span>
                  {count > 0 && <span className="gear-category__count">{count}</span>}
                  <span className={`gear-category__arrow${isOpen ? ' gear-category__arrow--open' : ''}`}>
                    {'\u25BC'}
                  </span>
                </button>
                {isOpen && (
                  <div className="gear-category__items">
                    {vendorGroups.map(group => {
                      const vKey = `${cat.category}:${group.vendor}`;
                      const vOpen = !!openVendors[vKey];
                      const vCount = vendorCount(group.items);
                      return (
                        <div className="vendor-group" key={group.vendor}>
                          <button
                            type="button"
                            className="vendor-group__header"
                            onClick={() => toggleVendor(vKey)}
                          >
                            <VendorLogo name={group.vendor} />
                          <span className="vendor-group__name">{group.vendor}</span>
                            {vCount > 0 && <span className="vendor-group__count">{vCount}</span>}
                            <span className={`vendor-group__arrow${vOpen ? ' vendor-group__arrow--open' : ''}`}>
                              {'\u203A'}
                            </span>
                          </button>
                          {vOpen && (
                            <div className="vendor-group__models">
                              {group.items.map(item => (
                                <ChipStepper
                                  key={item.value}
                                  label={item.model}
                                  qty={lightQty(item.value)}
                                  onAdd={() => dispatch({ type: 'ADD_GEAR_LIGHT', lightType: item.value })}
                                  onIncrement={() => dispatch({ type: 'UPDATE_GEAR_QTY', lightType: item.value, delta: 1 })}
                                  onDecrement={() => dispatch({ type: 'UPDATE_GEAR_QTY', lightType: item.value, delta: -1 })}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Save My Kit button consolidated into the sticky bottom bar "Save Kit →" */}
    </>
  );
}
