import { useState, useMemo } from 'react';
import { useAppState, useDispatch } from '../context/AppContext';
import { LIGHT_CATALOG } from '../data/lightCatalog';
import { MODIFIER_CATEGORIES } from '../data/modifierCatalog';
import { getSupportByCategory } from '../data/supportCatalog';
import { saveKit } from '../data/kitStore';

/* ── Quick Kit Presets (Good / Better / Best) ──────── */
const QUICK_KITS = [
  // ── Photo: Good ──
  {
    id: 'good_one_light', tier: 'good', workflow: 'photo',
    label: '1-Light Starter',
    desc: 'Speedlight + umbrella — clean single source',
    lights: [{ type: 'godox_v860iii', qty: 1 }],
    modifiers: [{ type: 'umbrella', qty: 1 }],
    support: [{ type: 'light_stand_8', qty: 1 }],
  },
  {
    id: 'good_two_light', tier: 'good', workflow: 'photo',
    label: '2-Light Budget',
    desc: 'Two speedlights — key + fill on a budget',
    lights: [{ type: 'godox_v860iii', qty: 2 }],
    modifiers: [{ type: 'umbrella', qty: 1 }, { type: 'umbrella_reflective', qty: 1 }],
    support: [{ type: 'light_stand_8', qty: 2 }, { type: 'sandbag_15', qty: 2 }],
  },
  // ── Photo: Better ──
  {
    id: 'better_portrait', tier: 'better', workflow: 'photo',
    label: '2-Light Portrait',
    desc: 'Portable strobe + octabox — pro-quality control',
    lights: [{ type: 'godox_ad300', qty: 2 }],
    modifiers: [{ type: 'octabox', qty: 1 }, { type: 'stripbox', qty: 1 }],
    support: [{ type: 'c_stand_40', qty: 2 }, { type: 'sandbag_15', qty: 2 }],
  },
  {
    id: 'better_beauty', tier: 'better', workflow: 'photo',
    label: 'Clamshell Beauty',
    desc: 'Key above + fill below — fashion/beauty standard',
    lights: [{ type: 'godox_ad300', qty: 2 }],
    modifiers: [{ type: 'octabox', qty: 1 }, { type: 'reflector', qty: 1 }],
    support: [{ type: 'c_stand_40', qty: 1 }, { type: 'boom_arm_78', qty: 1 }, { type: 'sandbag_25', qty: 1 }],
  },
  // ── Photo: Best ──
  {
    id: 'best_three_light', tier: 'best', workflow: 'photo',
    label: '3-Light Studio',
    desc: 'Key + fill + rim — full studio control',
    lights: [{ type: 'profoto_b10x', qty: 3 }],
    modifiers: [{ type: 'profoto_softlight', qty: 1 }, { type: 'softbox_large', qty: 1 }, { type: 'stripbox', qty: 1 }],
    support: [{ type: 'c_stand_avenger', qty: 3 }, { type: 'sandbag_25', qty: 3 }, { type: 'boom_arm_78', qty: 1 }],
  },
  {
    id: 'best_cinematic', tier: 'best', workflow: 'photo',
    label: 'Cinematic / Editorial',
    desc: 'Hard key + shaped rim — dramatic editorial look',
    lights: [{ type: 'profoto_b10x', qty: 2 }],
    modifiers: [{ type: 'grid_spot', qty: 1 }, { type: 'snoot', qty: 1 }, { type: 'barn_doors', qty: 1 }],
    support: [{ type: 'c_stand_avenger', qty: 2 }, { type: 'sandbag_25', qty: 2 }, { type: 'flag_24x36', qty: 2 }],
  },
  // ── Natural ──
  {
    id: 'natural_window', tier: 'natural', workflow: 'photo',
    label: 'Natural Light + Fill',
    desc: 'Window key + reflector/scrim — no flash needed',
    lights: [],
    modifiers: [{ type: 'reflector', qty: 1 }, { type: 'scrim', qty: 1 }, { type: 'v_flat', qty: 1 }],
    support: [{ type: 'c_stand_40', qty: 1 }],
  },
  // ── Video: Good (budget continuous) ──
  {
    id: 'video_good_single', tier: 'good', workflow: 'video',
    label: 'LED Single Key',
    desc: 'Godox SL150II — reliable continuous key for interviews',
    lights: [{ type: 'godox_sl150ii', qty: 1 }],
    modifiers: [{ type: 'softbox_large', qty: 1 }],
    support: [{ type: 'light_stand_10', qty: 1 }, { type: 'sandbag_15', qty: 1 }],
  },
  {
    id: 'video_good_two', tier: 'good', workflow: 'video',
    label: 'LED 2-Light Interview',
    desc: 'Key + fill — clean talking-head setup on a budget',
    lights: [{ type: 'godox_sl150ii', qty: 1 }, { type: 'godox_lc500r', qty: 1 }],
    modifiers: [{ type: 'softbox_large', qty: 1 }, { type: 'umbrella', qty: 1 }],
    support: [{ type: 'light_stand_10', qty: 2 }, { type: 'sandbag_15', qty: 2 }],
  },
  // ── Video: Better (mid-range COB) ──
  {
    id: 'video_better_aputure', tier: 'better', workflow: 'video',
    label: 'Aputure 300D Key + Fill',
    desc: 'COB LED key + bi-color panel fill — pro video standard',
    lights: [{ type: 'aputure_300d', qty: 1 }, { type: 'aputure_p60c', qty: 1 }],
    modifiers: [{ type: 'softbox_large', qty: 1 }],
    support: [{ type: 'c_stand_40', qty: 2 }, { type: 'sandbag_15', qty: 2 }],
  },
  {
    id: 'video_better_3pt', tier: 'better', workflow: 'video',
    label: '3-Point Video',
    desc: 'Key + fill + backlight — broadcast-quality portrait',
    lights: [{ type: 'aputure_300d', qty: 1 }, { type: 'aputure_p60c', qty: 1 }, { type: 'godox_sl150ii', qty: 1 }],
    modifiers: [{ type: 'softbox_large', qty: 1 }, { type: 'octabox', qty: 1 }],
    support: [{ type: 'c_stand_40', qty: 2 }, { type: 'light_stand_10', qty: 1 }, { type: 'sandbag_15', qty: 3 }],
  },
  // ── Video: Best (high-output COB) ──
  {
    id: 'video_best_600', tier: 'best', workflow: 'video',
    label: 'Aputure 600D Pro Kit',
    desc: '600D key + 300D fill — cinematic output, hard or soft',
    lights: [{ type: 'aputure_600d', qty: 1 }, { type: 'aputure_300d', qty: 1 }],
    modifiers: [{ type: 'softbox_large', qty: 1 }, { type: 'octabox', qty: 1 }, { type: 'grid_spot', qty: 1 }],
    support: [{ type: 'c_stand_avenger', qty: 2 }, { type: 'sandbag_25', qty: 2 }, { type: 'boom_arm_78', qty: 1 }],
  },
  {
    id: 'video_best_nanlite', tier: 'best', workflow: 'video',
    label: 'Nanlite Forza 500 Kit',
    desc: 'High-CRI 500W + panel — commercial film & beauty video',
    lights: [{ type: 'nanlite_forza500ii', qty: 1 }, { type: 'nanlite_pavot16c', qty: 1 }],
    modifiers: [{ type: 'softbox_large', qty: 1 }, { type: 'octabox', qty: 1 }],
    support: [{ type: 'c_stand_avenger', qty: 2 }, { type: 'sandbag_25', qty: 2 }],
  },
];

const TIER_COLORS = {
  good:    'var(--color-text-secondary)',
  better:  'var(--color-accent)',
  best:    '#22c55e',
  natural: '#eab308',
};

const TIER_LABELS = {
  good: 'GOOD', better: 'BETTER', best: 'BEST', natural: 'NATURAL',
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

/* ── Kit mood match mapping ─────────────────────────── */
const MOOD_KIT_MAP = {
  beauty:    ['better_beauty', 'best_three_light', 'video_better_aputure', 'video_good_single'],
  cinematic: ['best_cinematic', 'better_portrait', 'video_best_600', 'video_better_3pt'],
  corporate: ['better_portrait', 'best_three_light', 'video_better_aputure', 'video_better_3pt'],
  editorial: ['best_cinematic', 'best_three_light'],
  natural:   ['natural_window'],
  high_key:  ['best_three_light', 'better_portrait'],
  low_key:   ['best_cinematic', 'better_portrait'],
};

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

/** Count lights + modifiers in a kit */
function kitCounts(kit) {
  const lights = kit.lights.reduce((s, l) => s + l.qty, 0);
  const mods = kit.modifiers.reduce((s, m) => s + m.qty, 0);
  return { lights, mods };
}

/** Get primary light name from catalog */
function getPrimaryLightName(lights) {
  if (!lights?.length) return null;
  const first = lights[0];
  for (const cat of LIGHT_CATALOG) {
    const item = cat.items.find(i => i.value === first.type);
    if (item) return `${item.vendor} ${item.model}`;
  }
  return first.type?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || null;
}

// ─────────────────────────────────────────────────────────

export default function StepGearEntry() {
  const { gear, mood, environment } = useAppState();
  const dispatch = useDispatch();

  const [activeTab, setActiveTab] = useState('photo');
  const [selectedKitId, setSelectedKitId] = useState(null);
  const [showGearBrowser, setShowGearBrowser] = useState(false);
  const [kitSaved, setKitSaved] = useState(false);
  const [gearFilter, setGearFilter] = useState('strobes');
  const [gearSearch, setGearSearch] = useState('');
  const [openVendors, setOpenVendors] = useState({});

  /* ── Recommended kit: best match for mood ─────────── */
  const recommendedKit = useMemo(() => {
    const moodMatches = mood ? (MOOD_KIT_MAP[mood] || []) : [];
    // Filter kits by current tab workflow
    const tabKits = QUICK_KITS.filter(k => k.workflow === activeTab);
    // First: mood-matched kit from current tab
    const moodKit = tabKits.find(k => moodMatches.includes(k.id));
    if (moodKit) return moodKit;
    // Fallback: first "better" tier kit from current tab
    return tabKits.find(k => k.tier === 'better') || tabKits[0] || null;
  }, [mood, activeTab]);

  /* ── Other kits: everything except recommended ────── */
  const otherKits = useMemo(() => {
    const tabKits = QUICK_KITS.filter(k => k.workflow === activeTab);
    if (!recommendedKit) return tabKits;
    // Tier sort order: better > best > good > natural
    const tierOrder = { better: 0, best: 1, good: 2, natural: 3 };
    return tabKits
      .filter(k => k.id !== recommendedKit.id)
      .sort((a, b) => (tierOrder[a.tier] ?? 9) - (tierOrder[b.tier] ?? 9));
  }, [activeTab, recommendedKit]);

  /* ── Context-aware highlighting for gear browser ──── */
  const isLightRecommended = useMemo(() => {
    if (!mood) return () => false;
    const aff = MOOD_GEAR_AFFINITY[mood];
    if (!aff) return () => false;
    return (item) => aff.profiles.includes(item.gearProfile) && item.qualityTier >= aff.minTier;
  }, [mood]);

  const isModRecommended = useMemo(() => {
    if (!mood) return () => false;
    return (item) => {
      const score = item.moodAffinity?.[mood];
      return score != null && score >= 0.7;
    };
  }, [mood]);

  const isSupportRecommended = useMemo(() => {
    if (!environment) return () => false;
    const recommended = ENV_SUPPORT_AFFINITY[environment] || [];
    return (item) => recommended.includes(item.value);
  }, [environment]);

  /* ── Gear browser: pill filter → flat vendor-grouped list ── */
  const GEAR_PILLS = [
    { key: 'strobes',      label: 'Strobes',      cats: ['portable_strobes', 'studio_strobes'] },
    { key: 'led',          label: 'LED',           cats: ['led_continuous', 'led_panels'] },
    { key: 'speedlights',  label: 'Speedlights',   cats: ['speedlights'] },
    { key: 'modifiers',    label: 'Modifiers',      cats: [] },
    { key: 'support',      label: 'Support',        cats: [] },
    { key: 'accessories',  label: 'Accessories',    cats: ['specialty', 'triggers', 'light_meters'] },
  ];

  /** Items for the currently active gear pill, grouped by vendor */
  const filteredGearGroups = useMemo(() => {
    const q = gearSearch.toLowerCase().trim();
    const pill = GEAR_PILLS.find(p => p.key === gearFilter);
    if (!pill) return [];

    let items = [];
    let itemType = 'light'; // 'light' | 'modifier' | 'support'

    if (pill.key === 'modifiers') {
      itemType = 'modifier';
      MODIFIER_CATEGORIES.forEach(cat => {
        cat.items.forEach(m => {
          items.push({ value: m.value, vendor: m.vendor || cat.label, model: m.label, subtitle: m.size || null, rec: isModRecommended(m), _type: 'modifier' });
        });
      });
    } else if (pill.key === 'support') {
      itemType = 'support';
      getSupportByCategory().forEach(cat => {
        cat.items.forEach(s => {
          items.push({ value: s.value, vendor: s.vendor || 'Generic', model: s.label, subtitle: null, rec: isSupportRecommended(s), _type: 'support' });
        });
      });
    } else {
      LIGHT_CATALOG.filter(c => pill.cats.includes(c.category)).forEach(cat => {
        cat.items.forEach(item => {
          const wattage = item.wattseconds ? `${item.wattseconds}Ws` : item.wattage ? `${item.wattage}W` : null;
          const catLabel = cat.label;
          const subtitle = [wattage, catLabel].filter(Boolean).join(' \u00B7 ');
          items.push({ value: item.value, vendor: item.vendor, model: item.model, subtitle, rec: isLightRecommended(item), _type: 'light' });
        });
      });
    }

    // Search filter
    if (q) {
      items = items.filter(i =>
        i.model.toLowerCase().includes(q) ||
        i.vendor.toLowerCase().includes(q) ||
        (i.subtitle && i.subtitle.toLowerCase().includes(q))
      );
    }

    // Group by vendor
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
  }, [gearFilter, gearSearch, mood, environment, isLightRecommended, isModRecommended, isSupportRecommended]);

  /** Counts for collapsed categories in the gear browser */
  const gearPillCounts = useMemo(() => {
    const counts = {};
    // Lights
    LIGHT_CATALOG.forEach(cat => {
      cat.items.forEach(item => {
        const qty = gear.lights.find(l => l.type === item.value)?.qty || 0;
        if (qty > 0) {
          const pill = GEAR_PILLS.find(p => p.cats.includes(cat.category));
          if (pill) counts[pill.key] = (counts[pill.key] || 0) + qty;
        }
      });
    });
    // Modifiers
    MODIFIER_CATEGORIES.forEach(cat => {
      cat.items.forEach(m => {
        const qty = gear.modifiers.find(gm => gm.type === m.value)?.qty || 0;
        if (qty > 0) counts.modifiers = (counts.modifiers || 0) + qty;
      });
    });
    // Support
    getSupportByCategory().forEach(cat => {
      cat.items.forEach(s => {
        const qty = gear.support.find(gs => gs.type === s.value)?.qty || 0;
        if (qty > 0) counts.support = (counts.support || 0) + qty;
      });
    });
    return counts;
  }, [gear]);

  /* ── Helpers ──────────────────────────────────────── */
  function lightQty(type) { return gear.lights.find(l => l.type === type)?.qty || 0; }
  function modQty(type) { return gear.modifiers.find(m => m.type === type)?.qty || 0; }
  function supportQty(type) { return gear.support.find(s => s.type === type)?.qty || 0; }

  function getItemQty(item) {
    if (item._type === 'modifier') return modQty(item.value);
    if (item._type === 'support') return supportQty(item.value);
    return lightQty(item.value);
  }

  function handleAddItem(item) {
    if (item._type === 'modifier') dispatch({ type: 'ADD_MODIFIER', modifier: item.value });
    else if (item._type === 'support') dispatch({ type: 'ADD_SUPPORT_GEAR', supportType: item.value });
    else dispatch({ type: 'ADD_GEAR_LIGHT', lightType: item.value });
  }

  function handleItemDelta(item, delta) {
    if (item._type === 'modifier') dispatch({ type: 'UPDATE_MODIFIER_QTY', modifier: item.value, delta });
    else if (item._type === 'support') dispatch({ type: 'UPDATE_SUPPORT_QTY', supportType: item.value, delta });
    else dispatch({ type: 'UPDATE_GEAR_QTY', lightType: item.value, delta });
  }

  function toggleVendor(vendor) {
    setOpenVendors(prev => ({ ...prev, [vendor]: !prev[vendor] }));
  }

  function loadQuickKit(kit) {
    setSelectedKitId(kit.id);
    dispatch({
      type: 'LOAD_GEAR_KIT',
      gear: { lights: kit.lights, modifiers: kit.modifiers, support: kit.support },
    });
  }

  function handleSaveKit() {
    saveKit(gear);
    setKitSaved(true);
    setTimeout(() => setKitSaved(false), 2000);
  }

  const totalLights = gear.lights.reduce((s, l) => s + l.qty, 0);
  const totalMods = gear.modifiers.reduce((s, m) => s + m.qty, 0);
  const totalSupport = gear.support.reduce((s, s2) => s + s2.qty, 0);
  const primaryLight = getPrimaryLightName(gear.lights);

  return (
    <>
      {/* ── Heading ── */}
      <div className="qk-heading">
        <span className="qk-heading__label">YOUR GEAR</span>
        <h2 className="qk-heading__title">With your gear,{'\n'}this becomes:</h2>
      </div>

      {/* ── Photo | Video tab bar ── */}
      <div className="qk-tabs">
        <button
          type="button"
          className={`qk-tab${activeTab === 'photo' ? ' qk-tab--active' : ''}`}
          onClick={() => setActiveTab('photo')}
        >
          Photo
        </button>
        <button
          type="button"
          className={`qk-tab${activeTab === 'video' ? ' qk-tab--active' : ''}`}
          onClick={() => setActiveTab('video')}
        >
          Video
        </button>
      </div>

      {/* ── RECOMMENDED featured card ── */}
      {recommendedKit && (() => {
        const c = kitCounts(recommendedKit);
        const isActive = selectedKitId === recommendedKit.id;
        return (
          <>
            <span className="qk-section-label qk-section-label--rec">RECOMMENDED</span>
            <button
              type="button"
              className={`qk-featured${isActive ? ' qk-featured--active' : ''}`}
              onClick={() => loadQuickKit(recommendedKit)}
            >
              <div className="qk-featured__top">
                <span className="qk-featured__star">{'\u2605'}</span>
                <span className="qk-featured__name">{recommendedKit.label}</span>
              </div>
              <span className="qk-featured__desc">{recommendedKit.desc}</span>
              <div className="qk-featured__chips">
                {c.lights > 0 && <span className="qk-chip">{c.lights} light{c.lights > 1 ? 's' : ''}</span>}
                {c.mods > 0 && <span className="qk-chip">{c.mods} mod{c.mods > 1 ? 's' : ''}</span>}
              </div>
              <div className="qk-featured__bottom">
                <span className="qk-featured__tier" style={{ color: TIER_COLORS[recommendedKit.tier] }}>
                  {TIER_LABELS[recommendedKit.tier]}
                </span>
                <span className="qk-featured__match">Best match for your kit</span>
              </div>
            </button>
          </>
        );
      })()}

      {/* ── OTHER KITS compact rows ── */}
      {otherKits.length > 0 && (
        <>
          <span className="qk-section-label">OTHER KITS</span>
          <div className="qk-rows">
            {otherKits.map(kit => {
              const c = kitCounts(kit);
              const isActive = selectedKitId === kit.id;
              const parts = [];
              if (c.lights) parts.push(`${c.lights} light${c.lights > 1 ? 's' : ''}`);
              if (c.mods) parts.push(`${c.mods} mod${c.mods > 1 ? 's' : ''}`);
              return (
                <button
                  key={kit.id}
                  type="button"
                  className={`qk-row${isActive ? ' qk-row--active' : ''}`}
                  onClick={() => loadQuickKit(kit)}
                >
                  <div className="qk-row__info">
                    <span className="qk-row__name">{kit.label}</span>
                    <span className="qk-row__counts">{parts.join(' \u00B7 ')}</span>
                  </div>
                  <span
                    className="qk-row__tier"
                    style={{
                      color: TIER_COLORS[kit.tier],
                      borderColor: TIER_COLORS[kit.tier],
                    }}
                  >
                    {TIER_LABELS[kit.tier]}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* ── Add individual gear ── */}
      <button
        type="button"
        className={`qk-browse-btn${showGearBrowser ? ' qk-browse-btn--open' : ''}`}
        onClick={() => setShowGearBrowser(!showGearBrowser)}
      >
        <span className="qk-browse-btn__icon">{showGearBrowser ? '\u2212' : '+'}</span>
        <div className="qk-browse-btn__text">
          <span className="qk-browse-btn__title">Add individual gear</span>
          <span className="qk-browse-btn__sub">Browse lights, modifiers, stands & more</span>
        </div>
      </button>

      {/* ── Gear Browser (redesigned: search + pills + flat list) ── */}
      {showGearBrowser && (
        <div className="gb">
          {/* Search */}
          <div className="gb-search">
            <svg className="gb-search__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              className="gb-search__input"
              type="text"
              placeholder="Search gear..."
              value={gearSearch}
              onChange={e => setGearSearch(e.target.value)}
            />
            {gearSearch && (
              <button type="button" className="gb-search__clear" onClick={() => setGearSearch('')}>&times;</button>
            )}
          </div>

          {/* Category pills */}
          <div className="gb-pills">
            {GEAR_PILLS.map(p => (
              <button
                key={p.key}
                type="button"
                className={`gb-pill${gearFilter === p.key ? ' gb-pill--active' : ''}`}
                onClick={() => setGearFilter(p.key)}
              >
                {p.label}
                {gearPillCounts[p.key] > 0 && gearFilter !== p.key && (
                  <span className="gb-pill__badge">{gearPillCounts[p.key]}</span>
                )}
              </button>
            ))}
          </div>

          {/* Vendor-grouped items */}
          <div className="gb-list">
            {filteredGearGroups.map(group => {
              const inKit = group.items.reduce((n, item) => n + getItemQty(item), 0);
              const isOpen = openVendors[group.vendor] !== false; // default open
              return (
                <div key={group.vendor} className={`gb-vendor${isOpen ? '' : ' gb-vendor--collapsed'}`}>
                  <button
                    type="button"
                    className="gb-vendor__header"
                    onClick={() => toggleVendor(group.vendor)}
                  >
                    <span className={`gb-vendor__chevron${isOpen ? ' gb-vendor__chevron--open' : ''}`}>{'\u25B8'}</span>
                    <span className="gb-vendor__name">{group.vendor}</span>
                    {inKit > 0 && <span className="gb-vendor__count">{inKit} in kit</span>}
                    <span className="gb-vendor__qty">{group.items.length}</span>
                  </button>
                  {isOpen && group.items.map(item => {
                    const qty = getItemQty(item);
                    return (
                      <div
                        key={item.value}
                        className={`gb-item${qty > 0 ? ' gb-item--inkit' : ''}${item.rec && qty > 0 ? ' gb-item--rec' : ''}`}
                      >
                        {item.rec && <span className="gb-item__dot" />}
                        <div className="gb-item__info">
                          <span className={`gb-item__name${qty > 0 ? ' gb-item__name--active' : ''}`}>{item.model}</span>
                          {item.subtitle && <span className="gb-item__sub">{item.subtitle}</span>}
                        </div>
                        {qty === 0 ? (
                          <button
                            type="button"
                            className="gb-item__add"
                            onClick={() => handleAddItem(item)}
                            aria-label={`Add ${item.model}`}
                          >+</button>
                        ) : (
                          <div className="gb-item__stepper">
                            <button type="button" onClick={() => handleItemDelta(item, -1)} aria-label="Remove one">&minus;</button>
                            <span>{qty}</span>
                            <button type="button" onClick={() => handleItemDelta(item, 1)} aria-label="Add one">+</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {filteredGearGroups.length === 0 && gearSearch && (
              <div className="gb-empty">No gear matching &ldquo;{gearSearch}&rdquo;</div>
            )}
          </div>

          {/* Collapsed other categories */}
          <div className="gb-others">
            {GEAR_PILLS.filter(p => p.key !== gearFilter).map(p => (
              <button
                key={p.key}
                type="button"
                className="gb-other"
                onClick={() => { setGearFilter(p.key); setGearSearch(''); }}
              >
                <span className="gb-other__name">{p.label}</span>
                {gearPillCounts[p.key] > 0 && (
                  <span className="gb-other__badge">{gearPillCounts[p.key]}</span>
                )}
                <span className="gb-other__arrow">{'\u25B8'}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── YOUR SELECTION stats row ── */}
      {(totalLights > 0 || totalMods > 0 || totalSupport > 0) && (
        <div className="qk-selection">
          <span className="qk-section-label" style={{ marginBottom: 0 }}>YOUR SELECTION</span>
          <div className="qk-selection__row">
            <div className="qk-selection__stat">
              <span className="qk-selection__num">{totalLights}</span>
              <span className="qk-selection__unit">lights</span>
            </div>
            <div className="qk-selection__stat">
              <span className="qk-selection__num">{totalMods}</span>
              <span className="qk-selection__unit">mods</span>
            </div>
            <div className="qk-selection__stat">
              <span className="qk-selection__num">{totalSupport}</span>
              <span className="qk-selection__unit">stands</span>
            </div>
            {primaryLight && (
              <div className="qk-selection__primary">
                <span className="qk-selection__primary-name">{primaryLight}</span>
                <span className="qk-selection__primary-label">primary light</span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
