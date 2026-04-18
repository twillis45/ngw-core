/**
 * MyKitScreen — Studio Matte design
 * Photographer's gear inventory with smart recipe intelligence.
 *
 * Three modes:
 *   Empty     — inviting onboarding with value prop + CTA
 *   Populated — premium gear-case view: lights, modifiers, recipe coverage
 *   Editing   — full-screen catalog picker to add/remove gear
 *
 * Self-contained state — reads/writes kitStore directly.
 * Studio Matte tokens throughout — no CSS variables from the old system.
 */
import { useState, useCallback, useMemo, useEffect } from 'react';
import { tapHaptic, navHaptic, warnHaptic } from '../../../utils/haptics';
import { softClickSound, navSlideSound, segmentPressSound } from '../../../utils/sounds';
import { useIsDesktop } from '../../../utils/useIsDesktop';
import { steel, accent, C, FONT_SMOOTH, PANEL_SHADOW, PANEL_BEVEL,
         CTA_BG, CTA_SHADOW, CTA_BEVEL, SCREEN_BG, KEY_ACCENT } from '../../../theme/studioMatte';
import MatteBackground from '../_shared/MatteBackground';
import { loadKit, saveKit, clearKit, subscribeKit } from '../../../data/kitStore';
import { LIGHT_CATALOG, getLightDetails } from '../../../data/lightCatalog';
import { MODIFIER_CATALOG, getModifierDetails } from '../../../data/modifierCatalog';
import { ACCESSORY_CATALOG, ACCESSORY_CATEGORIES } from '../../../data/accessoryCatalog';
import { RECIPES } from '../../../data/recipes';

// ─── Category labels ────────────────────────────────────────────────────────
const LIGHT_CAT_LABEL = {
  speedlights: 'Speedlights',
  portable_strobes: 'Portable Strobes',
  studio_strobes: 'Studio Strobes',
  led_continuous: 'LED Continuous',
  led_panels: 'LED Panels',
  specialty: 'Specialty',
};

const MOD_CAT_LABEL = {
  softboxes: 'Softboxes',
  stripboxes: 'Strip Boxes',
  umbrellas: 'Umbrellas',
  beauty_dishes: 'Beauty Dishes',
  grids: 'Grids & Spots',
  reflectors: 'Reflectors',
  diffusion: 'Diffusion & Scrims',
  ring_lights: 'Ring Lights',
  parabolic: 'Parabolic',
  snoots: 'Snoots & Barn Doors',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function modifierRole(modType) {
  if (!modType) return null;
  if (modType.includes('softbox') || modType.includes('octabox')) return 'key / fill';
  if (modType.includes('umbrella')) return 'fill / wrap';
  if (modType.includes('beauty')) return 'glamour key';
  if (modType.includes('grid') || modType.includes('stripbox')) return 'accent / rim';
  if (modType.includes('reflector')) return 'bounce fill';
  if (modType.includes('snoot') || modType.includes('barn')) return 'spot control';
  if (modType.includes('ring')) return 'axis fill';
  if (modType.includes('parabolic')) return 'deep key';
  if (modType.includes('diffusion') || modType.includes('scrim')) return 'diffusion';
  return null;
}

function gearProfileLabel(gp) {
  const map = {
    speedlight: 'Speedlight', strobe_mono: 'Monolight', strobe_pack: 'Pack & Head',
    led_cob: 'LED COB', led_panel: 'LED Panel', ring_light: 'Ring Light',
    continuous: 'Continuous',
  };
  return map[gp] || gp?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || '';
}

function computeMatchedRecipes(kit) {
  if (!kit?.lights?.length) return [];
  const modTypes = (kit.modifiers || []).map(m => typeof m === 'string' ? m : m.type);
  return RECIPES.filter(r => {
    if (!r.modifiers?.length) return true;
    return r.modifiers.some(rm => modTypes.some(km =>
      km.includes(rm) || rm.includes(km)
    ));
  });
}

function computeUpgradeHint(kit) {
  const lightCount = (kit.lights || []).length;
  const modTypes = (kit.modifiers || []).map(m => typeof m === 'string' ? m : m.type);
  const has = (t) => modTypes.some(m => m.includes(t));
  if (lightCount === 0)
    return { text: 'Add a light source — recipes and blueprints need at least one.', icon: '◎' };
  if (!has('beauty') && !has('softbox') && !has('umbrella'))
    return { text: 'Add a modifier (softbox, dish, or umbrella) to shape your light.', icon: '✦' };
  if (!has('beauty'))
    return { text: 'Add a beauty dish to unlock clamshell and butterfly setups.', icon: '✦' };
  if (lightCount < 2)
    return { text: 'Add a second light for rim separation and multi-light control.', icon: '◐' };
  if (!has('grid') && !has('stripbox'))
    return { text: 'Add a grid or stripbox for editorial and fashion looks.', icon: '◈' };
  return null;
}

// Filter light catalog to only real lights (not triggers/meters)
const LIGHT_CATEGORIES = LIGHT_CATALOG.filter(c =>
  !['triggers', 'light_meters'].includes(c.category)
);

// Group modifiers by category (computed once at module load)
const MOD_CATEGORIES = (() => {
  const groups = {};
  MODIFIER_CATALOG.forEach(m => {
    const cat = m.category || 'other';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(m);
  });
  return Object.entries(groups).map(([cat, items]) => ({
    category: cat,
    label: MOD_CAT_LABEL[cat] || cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    items,
  }));
})();


// ─── Shared Components ──────────────────────────────────────────────────────

function CTA({ label, disabled, onClick, isDesktop, variant }) {
  const [pressed, setPressed] = useState(false);
  const isGhost = variant === 'ghost';
  return (
    <button
      onClick={() => { if (!disabled) { tapHaptic(); softClickSound(); onClick?.(); } }}
      disabled={disabled}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      style={{
        width: '100%',
        height: isDesktop ? 56 : 50, borderRadius: isDesktop ? 28 : 24,
        border: isGhost ? `1px solid ${steel(0.15)}` : 'none',
        background: isGhost ? 'transparent' : (disabled ? steel(0.08) : CTA_BG),
        boxShadow: isGhost || disabled
          ? 'none'
          : pressed
            ? 'inset 0px 2px 4px rgba(0,0,0,0.5)'
            : `${CTA_SHADOW}, ${CTA_BEVEL}`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transform: pressed && !disabled ? 'scale(0.98)' : 'scale(1)',
        transition: 'transform 0.1s ease, box-shadow 0.1s ease',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span style={{
        fontSize: isDesktop ? 14 : 13, fontWeight: 700,
        color: isGhost ? steel(0.55) : (disabled ? steel(0.3) : 'rgba(245,247,250,0.92)'),
        letterSpacing: '1.5px', textTransform: 'uppercase',
        pointerEvents: 'none', ...FONT_SMOOTH,
      }}>
        {label}
      </span>
    </button>
  );
}

function SectionLabel({ children, isDesktop }) {
  return (
    <p style={{
      margin: '0 0 10px', fontSize: isDesktop ? 11 : 10, fontWeight: 600,
      color: steel(0.55), letterSpacing: '1.2px',
      textTransform: 'uppercase', ...FONT_SMOOTH,
    }}>
      {children}
    </p>
  );
}

// ─── Light Card ─────────────────────────────────────────────────────────────

function LightCard({ light, isDesktop }) {
  const details = getLightDetails(light.type || light.id);
  const vendor = details?.vendor || '';
  const model = details?.model || light.label || light.type || 'Unknown';
  const category = gearProfileLabel(details?.gearProfile);
  const qty = light.qty || 1;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: isDesktop ? 16 : 14,
      padding: isDesktop ? '14px 18px' : '12px 14px',
      borderRadius: 12,
      background: 'linear-gradient(141.71deg, #1a1c22 0%, #131518 50%, #0e0f14 100%)',
      border: 'none',
      boxShadow: [
        '6px 6px 16px rgba(0,0,0,0.60)',
        '3px 3px 7px rgba(0,0,0,0.45)',
        '1px 1px 3px rgba(0,0,0,0.30)',
        '-0.5px -0.5px 1px rgba(255,255,255,0.04)',
        'inset 0 1px 0 rgba(255,255,255,0.06)',
        'inset -1px -1px 0 rgba(0,0,0,0.25)',
      ].join(', '),
      ...FONT_SMOOTH,
    }}>
      {/* Icon */}
      <div style={{
        width: 44, height: 44, borderRadius: 22, flexShrink: 0,
        background: `radial-gradient(circle at 50% 40%, ${accent(0.15)}, ${steel(0.06)})`,
        border: `1px solid ${steel(0.12)}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="10" r="4" stroke={KEY_ACCENT} strokeWidth="1.3" fill={accent(0.15)} />
          <line x1="12" y1="14" x2="12" y2="20" stroke={steel(0.35)} strokeWidth="1.2" />
          <line x1="8" y1="20" x2="16" y2="20" stroke={steel(0.35)} strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </div>

      {/* Body */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{
            fontSize: isDesktop ? 15 : 14, fontWeight: 700, color: C.textPrimary,
            letterSpacing: '-0.1px', ...FONT_SMOOTH,
          }}>
            {vendor && <span style={{ color: steel(0.7) }}>{vendor} </span>}
            {model}
          </span>
          {qty > 1 && (
            <span style={{
              fontSize: 11, fontWeight: 600, color: KEY_ACCENT,
              padding: '1px 6px', borderRadius: 4,
              background: accent(0.12), ...FONT_SMOOTH,
            }}>
              &times;{qty}
            </span>
          )}
        </div>
        {category && (
          <span style={{
            fontSize: isDesktop ? 12 : 11, fontWeight: 500, color: steel(0.45),
            ...FONT_SMOOTH,
          }}>
            {category}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Modifier Card ──────────────────────────────────────────────────────────

function ModifierCard({ mod, isDesktop }) {
  const mType = typeof mod === 'string' ? mod : mod.type;
  const mQty = typeof mod === 'string' ? 1 : (mod.qty || 1);
  const details = getModifierDetails(mType);
  const label = details?.label || mType?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const role = modifierRole(mType);
  const size = details?.size || null;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: isDesktop ? 14 : 12,
      padding: isDesktop ? '12px 18px' : '10px 14px',
      borderRadius: 10,
      background: 'linear-gradient(141.71deg, #18191f 0%, #121316 50%, #0c0d10 100%)',
      border: 'none',
      boxShadow: [
        '5px 5px 14px rgba(0,0,0,0.55)',
        '2px 2px 6px rgba(0,0,0,0.40)',
        '-0.5px -0.5px 1px rgba(255,255,255,0.035)',
        'inset 0 1px 0 rgba(255,255,255,0.05)',
        'inset -1px -1px 0 rgba(0,0,0,0.22)',
      ].join(', '),
      ...FONT_SMOOTH,
    }}>
      {/* Gold LED dot in mini well */}
      <div style={{
        width: 10, height: 10, borderRadius: 5, flexShrink: 0,
        background: `radial-gradient(circle at 35% 30%, rgba(255,220,140,0.95) 0%, ${KEY_ACCENT} 60%, rgba(140,100,30,0.70) 100%)`,
        boxShadow: `0 0 5px ${accent(0.35)}, 0 0 2px ${accent(0.20)}`,
      }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          fontSize: isDesktop ? 14 : 13, fontWeight: 600, color: C.textPrimary,
          ...FONT_SMOOTH,
        }}>
          {size ? `${size} ` : ''}{label}
        </span>
        {role && (
          <span style={{
            fontSize: isDesktop ? 11 : 10, color: steel(0.4), marginLeft: 8,
            fontWeight: 500, ...FONT_SMOOTH,
          }}>
            {role}
          </span>
        )}
      </div>

      {mQty > 1 && (
        <span style={{
          fontSize: 11, fontWeight: 600, color: KEY_ACCENT,
          padding: '1px 6px', borderRadius: 4,
          background: accent(0.12), ...FONT_SMOOTH,
        }}>
          &times;{mQty}
        </span>
      )}
    </div>
  );
}

// ─── Recipe Coverage Bar ────────────────────────────────────────────────────

function RecipeCoverage({ matched, total, onBrowse, isDesktop }) {
  const pct = total > 0 ? Math.round((matched / total) * 100) : 0;
  return (
    <div
      role="button" tabIndex={0}
      onClick={() => { tapHaptic(); softClickSound(); onBrowse?.(); }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onBrowse?.(); } }}
      style={{
        padding: isDesktop ? '16px 20px' : '14px 16px',
        borderRadius: 14,
        background: `linear-gradient(135deg, ${accent(0.08)}, ${accent(0.04)})`,
        border: `1px solid ${accent(0.18)}`,
        cursor: 'pointer',
        WebkitTapHighlightColor: 'transparent',
        ...FONT_SMOOTH,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div>
          <span style={{ fontSize: isDesktop ? 13 : 12, fontWeight: 600, color: KEY_ACCENT, ...FONT_SMOOTH }}>
            Your kit matches
          </span>
          <span style={{ fontSize: isDesktop ? 20 : 18, fontWeight: 700, color: C.textPrimary, marginLeft: 8, letterSpacing: '-0.3px', ...FONT_SMOOTH }}>
            {matched}/{total}
          </span>
          <span style={{ fontSize: isDesktop ? 13 : 12, fontWeight: 500, color: steel(0.45), marginLeft: 6, ...FONT_SMOOTH }}>
            recipes
          </span>
        </div>
        <span style={{ fontSize: 14, color: KEY_ACCENT, ...FONT_SMOOTH }}>Browse &rsaquo;</span>
      </div>
      {/* Progress bar */}
      <div style={{
        height: 4, borderRadius: 2, background: steel(0.08),
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%', borderRadius: 2,
          width: `${pct}%`,
          background: `linear-gradient(90deg, ${KEY_ACCENT}, ${accent(0.6)})`,
          transition: 'width 0.4s ease',
        }} />
      </div>
    </div>
  );
}

// ─── Upgrade Hint ───────────────────────────────────────────────────────────

function UpgradeHint({ hint, isDesktop }) {
  if (!hint) return null;
  return (
    <div style={{
      padding: isDesktop ? '14px 18px' : '12px 14px',
      borderRadius: 10,
      background: steel(0.04),
      border: `1px solid ${steel(0.08)}`,
      display: 'flex', alignItems: 'flex-start', gap: 10,
      ...FONT_SMOOTH,
    }}>
      <span style={{ fontSize: 16, lineHeight: 1, flexShrink: 0, opacity: 0.7 }}>{hint.icon}</span>
      <span style={{ fontSize: isDesktop ? 13 : 12, color: steel(0.5), lineHeight: 1.45, ...FONT_SMOOTH }}>
        {hint.text}
      </span>
    </div>
  );
}


// ─── Gear Picker (edit mode) ────────────────────────────────────────────────

function GearPicker({ kit, onSave, onCancel, isDesktop }) {
  // Qty maps: { value: count }. Tap adds/increments, minus decrements, remove clears.
  const [lightQty, setLightQty] = useState(() => {
    const m = {};
    (kit?.lights || []).forEach(l => { const k = l.type || l.id; m[k] = (m[k] || 0) + (l.qty || 1); });
    return m;
  });
  const [modQty, setModQty] = useState(() => {
    const m = {};
    (kit?.modifiers || []).forEach(mod => { const k = typeof mod === 'string' ? mod : mod.type; m[k] = (m[k] || 0) + ((typeof mod === 'object' ? mod.qty : null) || 1); });
    return m;
  });
  const [accQty, setAccQty] = useState(() => {
    const m = {};
    (kit?.support || []).forEach(s => { const k = typeof s === 'string' ? s : s.type; m[k] = (m[k] || 0) + ((typeof s === 'object' ? s.qty : null) || 1); });
    return m;
  });
  const [tab, setTab] = useState('lights');
  const [search, setSearch] = useState('');

  function addItem(setFn, value) {
    segmentPressSound(); tapHaptic();
    setFn(prev => ({ ...prev, [value]: (prev[value] || 0) + 1 }));
  }
  function decItem(setFn, value) {
    segmentPressSound(); tapHaptic();
    setFn(prev => {
      const cur = prev[value] || 0;
      if (cur <= 1) { const n = { ...prev }; delete n[value]; return n; }
      return { ...prev, [value]: cur - 1 };
    });
  }
  function removeItem(setFn, value) {
    segmentPressSound(); tapHaptic();
    setFn(prev => { const n = { ...prev }; delete n[value]; return n; });
  }

  const selectedLights = Object.keys(lightQty);
  const selectedMods = Object.keys(modQty);
  const selectedAccessories = Object.keys(accQty);

  function handleSave() {
    const newKit = {
      lights: Object.entries(lightQty).map(([type, qty]) => ({ type, qty })),
      modifiers: Object.entries(modQty).map(([type, qty]) => ({ type, qty })),
      support: Object.entries(accQty).map(([type, qty]) => ({ type, qty })),
    };
    onSave(newKit);
  }

  const totalSelected = selectedLights.length + selectedMods.length + selectedAccessories.length;
  const totalItems = Object.values(lightQty).reduce((s, n) => s + n, 0)
    + Object.values(modQty).reduce((s, n) => s + n, 0)
    + Object.values(accQty).reduce((s, n) => s + n, 0);

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 20,
      display: 'flex', flexDirection: 'column',
      backgroundColor: SCREEN_BG,
    }}>
      <MatteBackground />

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: isDesktop ? '16px 40px' : '16px 22px',
        position: 'relative', zIndex: 2,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button aria-label="Cancel" onClick={() => { navHaptic(); navSlideSound(); onCancel(); }} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '10px 12px 10px 0', display: 'flex', alignItems: 'center',
            WebkitTapHighlightColor: 'transparent',
            minWidth: 44, minHeight: 44,
          }}>
            <span style={{ fontSize: 22, color: C.textMeta, lineHeight: 1, ...FONT_SMOOTH }}>&lsaquo;</span>
          </button>
          <p style={{
            margin: 0, fontSize: isDesktop ? 11 : 10, fontWeight: 600,
            color: steel(0.65), letterSpacing: '1.2px', ...FONT_SMOOTH,
          }}>
            EDIT KIT
          </p>
        </div>
        <span style={{
          fontSize: isDesktop ? 13 : 11, fontWeight: 500, color: steel(0.4), ...FONT_SMOOTH,
        }}>
          {totalSelected} selected
        </span>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: 8,
        padding: isDesktop ? '0 40px 14px' : '0 22px 14px',
        position: 'relative', zIndex: 2,
      }}>
        {[
          { key: 'lights', label: 'Lights', count: selectedLights.length },
          { key: 'modifiers', label: 'Modifiers', count: selectedMods.length },
          { key: 'accessories', label: 'Accessories', count: selectedAccessories.length },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setSearch(''); segmentPressSound(); tapHaptic(); }}
            style={{
              flex: 1, padding: '9px 0', borderRadius: 8,
              border: 'none',
              background: tab === t.key
                ? 'linear-gradient(141.71deg, #2a2218 0%, #1c1810 100%)'
                : 'linear-gradient(141.71deg, #16181e 0%, #0e1014 100%)',
              cursor: 'pointer',
              fontSize: isDesktop ? 12 : 11, fontWeight: tab === t.key ? 700 : 600,
              color: tab === t.key ? KEY_ACCENT : steel(0.45),
              letterSpacing: '0.3px',
              boxShadow: tab === t.key
                ? [
                    '4px 4px 10px rgba(0,0,0,0.50)',
                    `0 0 0 0.5px ${accent(0.25)}`,
                    `inset 0 1px 0 ${accent(0.10)}`,
                    'inset -1px -1px 0 rgba(0,0,0,0.22)',
                  ].join(', ')
                : [
                    '2px 2px 6px rgba(0,0,0,0.40)',
                    'inset 0 1px 0 rgba(255,255,255,0.03)',
                    'inset -1px -1px 0 rgba(0,0,0,0.18)',
                  ].join(', '),
              transition: 'all 0.15s ease',
              WebkitTapHighlightColor: 'transparent',
              ...FONT_SMOOTH,
            }}
          >
            {t.label}{t.count > 0 ? ` (${t.count})` : ''}
          </button>
        ))}
      </div>

      {/* Search bar */}
      <div style={{
        padding: isDesktop ? '0 40px 12px' : '0 22px 12px',
        position: 'relative', zIndex: 2,
      }}>
        <input
          type="text"
          placeholder={
            tab === 'lights' ? 'Search lights — Profoto, Godox, Canon...'
            : tab === 'modifiers' ? 'Search modifiers — softbox, beauty dish, umbrella...'
            : 'Search accessories — C-stand, trigger, gel, meter...'
          }
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 10,
            border: 'none',
            background: 'linear-gradient(141.71deg, #12141a 0%, #0c0d12 100%)',
            boxShadow: [
              'inset 3px 3px 8px rgba(0,0,0,0.60)',
              'inset 1px 1px 3px rgba(0,0,0,0.40)',
              'inset -1px -1px 2px rgba(255,255,255,0.015)',
              '-0.5px -0.5px 1px rgba(255,255,255,0.03)',
              '1px 1px 3px rgba(0,0,0,0.30)',
            ].join(', '),
            fontSize: 13, fontWeight: 500, color: C.textPrimary,
            outline: 'none', WebkitAppearance: 'none',
            ...FONT_SMOOTH,
          }}
        />
      </div>

      {/* Catalog list */}
      <div style={{
        flex: 1, overflowY: 'auto',
        padding: isDesktop ? '0 40px 120px' : '0 22px 120px',
        position: 'relative', zIndex: 1,
      }}>
        {/* Selected items pinned at top */}
        {((tab === 'lights' && selectedLights.length > 0) || (tab === 'modifiers' && selectedMods.length > 0) || (tab === 'accessories' && selectedAccessories.length > 0)) && (
          <div style={{ marginBottom: 20 }}>
            <p style={{
              margin: '0 0 8px', fontSize: isDesktop ? 11 : 10, fontWeight: 700,
              color: KEY_ACCENT, letterSpacing: '1.2px', textTransform: 'uppercase',
              ...FONT_SMOOTH,
            }}>
              YOUR {tab === 'lights' ? 'LIGHTS' : tab === 'modifiers' ? 'MODIFIERS' : 'ACCESSORIES'}
            </p>
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 6,
            }}>
              {tab === 'lights'
                ? selectedLights.map(v => {
                    const cat = LIGHT_CATEGORIES.flatMap(c => c.items).find(i => i.value === v);
                    return <CatalogChip key={v} label={cat ? `${cat.vendor} ${cat.model}` : v} selected qty={lightQty[v]} onAdd={() => addItem(setLightQty, v)} onMinus={() => decItem(setLightQty, v)} onRemove={() => removeItem(setLightQty, v)} />;
                  })
                : tab === 'modifiers'
                ? selectedMods.map(v => {
                    const item = MODIFIER_CATALOG.find(m => m.value === v);
                    return <CatalogChip key={v} label={item?.label || v} selected qty={modQty[v]} onAdd={() => addItem(setModQty, v)} onMinus={() => decItem(setModQty, v)} onRemove={() => removeItem(setModQty, v)} />;
                  })
                : selectedAccessories.map(v => {
                    const item = ACCESSORY_CATALOG.find(a => a.value === v);
                    return <CatalogChip key={v} label={item?.label || v} selected qty={accQty[v]} onAdd={() => addItem(setAccQty, v)} onMinus={() => decItem(setAccQty, v)} onRemove={() => removeItem(setAccQty, v)} />;
                  })
              }
            </div>
          </div>
        )}

        {tab === 'lights' ? (
          LIGHT_CATEGORIES.map(cat => {
            const q = search.toLowerCase().trim();
            const filtered = q ? cat.items.filter(i =>
              `${i.vendor} ${i.model}`.toLowerCase().includes(q)
            ) : cat.items;
            if (!filtered.length) return null;
            return (
              <div key={cat.category} style={{ marginBottom: 18 }}>
                <p style={{
                  margin: '0 0 8px', fontSize: isDesktop ? 11 : 10, fontWeight: 600,
                  color: steel(0.50), letterSpacing: '1.2px', textTransform: 'uppercase',
                  ...FONT_SMOOTH,
                }}>
                  {LIGHT_CAT_LABEL[cat.category] || cat.label}
                </p>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isDesktop ? 'repeat(auto-fill, minmax(200px, 1fr))' : 'repeat(2, 1fr)',
                  gap: 6,
                }}>
                  {filtered.map(item => (
                    <CatalogChip
                      key={item.value}
                      label={`${item.vendor} ${item.model}`}
                      selected={!!lightQty[item.value]}
                      qty={lightQty[item.value] || 0}
                      onAdd={() => addItem(setLightQty, item.value)}
                      onMinus={() => decItem(setLightQty, item.value)}
                      onRemove={() => removeItem(setLightQty, item.value)}
                    />
                  ))}
                </div>
              </div>
            );
          })
        ) : tab === 'modifiers' ? (
          MOD_CATEGORIES.map(cat => {
            const q = search.toLowerCase().trim();
            const filtered = q ? cat.items.filter(i =>
              i.label.toLowerCase().includes(q) || (i.value || '').toLowerCase().includes(q)
            ) : cat.items;
            if (!filtered.length) return null;
            return (
              <div key={cat.category} style={{ marginBottom: 18 }}>
                <p style={{
                  margin: '0 0 8px', fontSize: isDesktop ? 11 : 10, fontWeight: 600,
                  color: steel(0.50), letterSpacing: '1.2px', textTransform: 'uppercase',
                  ...FONT_SMOOTH,
                }}>
                  {cat.label}
                </p>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isDesktop ? 'repeat(auto-fill, minmax(180px, 1fr))' : 'repeat(2, 1fr)',
                  gap: 6,
                }}>
                  {filtered.map(item => (
                    <CatalogChip key={item.value} label={item.label} selected={!!modQty[item.value]} qty={modQty[item.value] || 0} onAdd={() => addItem(setModQty, item.value)} onMinus={() => decItem(setModQty, item.value)} onRemove={() => removeItem(setModQty, item.value)} />
                  ))}
                </div>
              </div>
            );
          })
        ) : (
          ACCESSORY_CATEGORIES.map(cat => {
            const q = search.toLowerCase().trim();
            const filtered = q ? cat.items.filter(i =>
              i.label.toLowerCase().includes(q) || (i.vendor || '').toLowerCase().includes(q) || (i.value || '').toLowerCase().includes(q)
            ) : cat.items;
            if (!filtered.length) return null;
            return (
              <div key={cat.category} style={{ marginBottom: 18 }}>
                <p style={{
                  margin: '0 0 8px', fontSize: isDesktop ? 11 : 10, fontWeight: 600,
                  color: steel(0.50), letterSpacing: '1.2px', textTransform: 'uppercase',
                  ...FONT_SMOOTH,
                }}>
                  {cat.label}
                </p>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isDesktop ? 'repeat(auto-fill, minmax(170px, 1fr))' : 'repeat(2, 1fr)',
                  gap: 6,
                }}>
                  {filtered.map(item => (
                    <CatalogChip key={item.value} label={item.label} selected={!!accQty[item.value]} qty={accQty[item.value] || 0} onAdd={() => addItem(setAccQty, item.value)} onMinus={() => decItem(setAccQty, item.value)} onRemove={() => removeItem(setAccQty, item.value)} />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Sticky save bar */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: isDesktop ? '16px 40px 24px' : '16px 22px 34px',
        background: `linear-gradient(transparent, ${SCREEN_BG}f2 30%)`,
        zIndex: 10,
      }}>
        <CTA
          label={`SAVE KIT (${totalItems} items)`}
          disabled={totalSelected === 0}
          onClick={handleSave}
          isDesktop={isDesktop}
        />
      </div>
    </div>
  );
}

function CatalogChip({ label, selected, qty = 0, onAdd, onMinus, onRemove, onClick }) {
  const handleClick = onAdd || onClick;
  return (
    <div
      onClick={handleClick}
      onContextMenu={onRemove ? (e) => { e.preventDefault(); onRemove(); } : undefined}
      style={{
        padding: '8px 12px', minHeight: 40,
        borderRadius: 8, border: 'none', cursor: 'pointer',
        position: 'relative',
        // Studio Matte depth — machined chip with amber LED when selected
        background: selected
          ? 'linear-gradient(141.71deg, #2a2218 0%, #1c1810 100%)'
          : 'linear-gradient(141.71deg, #16181e 0%, #0e1014 100%)',
        boxShadow: selected
          ? [
              '4px 4px 10px rgba(0,0,0,0.50)',
              `0 0 0 0.5px ${accent(0.30)}`,
              `0 0 6px ${accent(0.08)}`,
              `inset 0 1px 0 ${accent(0.10)}`,
              'inset -1px -1px 0 rgba(0,0,0,0.22)',
            ].join(', ')
          : [
              '3px 3px 8px rgba(0,0,0,0.40)',
              '1px 1px 3px rgba(0,0,0,0.28)',
              'inset 0 1px 0 rgba(255,255,255,0.04)',
              'inset -1px -1px 0 rgba(0,0,0,0.18)',
            ].join(', '),
        cursor: 'pointer',
        fontSize: 11, fontWeight: selected ? 700 : 500,
        color: selected ? KEY_ACCENT : steel(0.55),
        letterSpacing: '0.1px',
        textAlign: 'left',
        transition: 'all 0.15s ease',
        WebkitTapHighlightColor: 'transparent',
        ...FONT_SMOOTH,
      }}
    >
      <span style={{ flex: 1 }}>{label}</span>
      {/* Qty badge — shows count when > 0 */}
      {qty > 0 && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            display: 'flex', alignItems: 'center', gap: 2,
            marginLeft: 6, flexShrink: 0,
          }}
        >
          {/* Minus button */}
          <button
            onClick={(e) => { e.stopPropagation(); onMinus?.(); }}
            style={{
              width: 18, height: 18, borderRadius: 4, border: 'none',
              background: 'rgba(0,0,0,0.35)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, color: steel(0.55), lineHeight: 1,
              boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.4)',
              WebkitTapHighlightColor: 'transparent',
            }}
          >−</button>
          {/* Count */}
          <span style={{
            minWidth: 18, textAlign: 'center',
            fontSize: 11, fontWeight: 700, color: KEY_ACCENT,
          }}>{qty}</span>
          {/* Plus button */}
          <button
            onClick={(e) => { e.stopPropagation(); onAdd?.(); }}
            style={{
              width: 18, height: 18, borderRadius: 4, border: 'none',
              background: 'rgba(0,0,0,0.35)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, color: steel(0.55), lineHeight: 1,
              boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.4)',
              WebkitTapHighlightColor: 'transparent',
            }}
          >+</button>
        </div>
      )}
    </div>
  );
}


// ─── Empty State ────────────────────────────────────────────────────────────

function EmptyState({ onAdd, isDesktop }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '40px 32px',
      textAlign: 'center',
      ...FONT_SMOOTH,
    }}>
      {/* Gear case icon */}
      <div style={{
        position: 'relative', marginBottom: 24,
        width: 72, height: 72, borderRadius: 20,
        background: `linear-gradient(135deg, ${steel(0.08)}, ${steel(0.04)})`,
        border: `1px solid ${steel(0.10)}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
          {/* Light head */}
          <circle cx="18" cy="12" r="5" stroke={KEY_ACCENT} strokeWidth="1.3" fill={accent(0.12)} />
          <circle cx="18" cy="12" r="2" fill={KEY_ACCENT} opacity="0.5" />
          {/* Stand */}
          <line x1="18" y1="17" x2="18" y2="28" stroke={steel(0.35)} strokeWidth="1.2" />
          <line x1="12" y1="28" x2="24" y2="28" stroke={steel(0.35)} strokeWidth="1.2" strokeLinecap="round" />
          {/* Modifier hint */}
          <rect x="24" y="8" width="8" height="8" rx="2" stroke={steel(0.25)} strokeWidth="0.8" fill="none" opacity="0.6" />
        </svg>
        <span style={{
          position: 'absolute', bottom: -4, right: -4,
          width: 18, height: 18, borderRadius: '50%',
          background: KEY_ACCENT,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, color: '#000', fontWeight: 700, lineHeight: 1,
        }}>+</span>
      </div>

      <h3 style={{
        margin: '0 0 8px', fontSize: 20, fontWeight: 700,
        color: C.textPrimary, letterSpacing: '-0.3px', ...FONT_SMOOTH,
      }}>
        Tell us what you shoot with
      </h3>
      <p style={{
        margin: '0 0 32px', fontSize: 13, fontWeight: 400,
        color: steel(0.45), lineHeight: 1.5, maxWidth: 300, ...FONT_SMOOTH,
      }}>
        Add your lights and modifiers. NGW matches recipes to your actual gear and adapts every blueprint.
      </p>

      {/* Value props */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 14,
        marginBottom: 36, width: '100%', maxWidth: 280,
      }}>
        {[
          { icon: '★', text: 'Recipes filtered to what you own' },
          { icon: '◎', text: 'Blueprints adapted to your gear' },
          { icon: '⚙', text: 'Smart upgrade suggestions' },
        ].map(item => (
          <div key={item.text} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{
              width: 28, height: 28, borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, lineHeight: 1,
              background: accent(0.10), color: KEY_ACCENT,
              border: `1px solid ${accent(0.18)}`,
              flexShrink: 0, ...FONT_SMOOTH,
            }}>{item.icon}</span>
            <span style={{ fontSize: 13, color: steel(0.55), textAlign: 'left', ...FONT_SMOOTH }}>
              {item.text}
            </span>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div style={{ width: '100%', maxWidth: 280 }}>
        <CTA
          label="ADD YOUR GEAR"
          onClick={onAdd}
          isDesktop={isDesktop}
        />
      </div>
    </div>
  );
}


// ─── Main Screen ────────────────────────────────────────────────────────────

export default function MyKitScreen({ onBack, onRecipes }) {
  const isDesktop = useIsDesktop();
  const [kit, setKit] = useState(() => loadKit());
  const [editing, setEditing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  // Cross-tab sync
  useEffect(() => subscribeKit(() => setKit(loadKit())), []);

  // Reset confirm-clear if user opens editor or navigates
  useEffect(() => { if (editing) setConfirmClear(false); }, [editing]);

  const hasGear = kit && (kit.lights?.length > 0 || kit.modifiers?.length > 0);
  const lightCount = kit?.lights?.length || 0;
  const modCount = kit?.modifiers?.length || 0;
  const matched = useMemo(() => hasGear ? computeMatchedRecipes(kit) : [], [kit, hasGear]);
  const upgradeHint = useMemo(() => hasGear ? computeUpgradeHint(kit) : null, [kit, hasGear]);

  const handleSaveKit = useCallback((newKit) => {
    const saved = saveKit(newKit);
    setKit(saved);
    setEditing(false);
    tapHaptic(); softClickSound();
  }, []);

  function handleClear() {
    if (!confirmClear) { setConfirmClear(true); warnHaptic(); return; }
    clearKit();
    setKit(null);
    setConfirmClear(false);
    warnHaptic();
  }

  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      backgroundColor: SCREEN_BG,
      overflow: 'hidden',
    }}>
      <MatteBackground />

      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: isDesktop ? '16px 40px' : '16px 22px',
        position: 'relative', zIndex: 2,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button aria-label="Back" onClick={() => { navHaptic(); navSlideSound(); onBack?.(); }} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '10px 12px 10px 0', display: 'flex', alignItems: 'center',
            WebkitTapHighlightColor: 'transparent',
            minWidth: 44, minHeight: 44,
          }}>
            <span style={{ fontSize: 22, color: C.textMeta, lineHeight: 1, ...FONT_SMOOTH }}>&lsaquo;</span>
          </button>
          <p style={{
            margin: 0, fontSize: isDesktop ? 11 : 10, fontWeight: 600,
            color: steel(0.65), letterSpacing: '1.2px', ...FONT_SMOOTH,
          }}>
            MY KIT
          </p>
        </div>
        {hasGear && (
          <button
            onClick={() => { setEditing(true); tapHaptic(); softClickSound(); }}
            style={{
              background: 'linear-gradient(141.71deg, #1e2028 0%, #151720 50%, #0e0f14 100%)',
              border: 'none', borderRadius: 8, padding: '7px 16px', cursor: 'pointer',
              fontSize: isDesktop ? 12 : 11, fontWeight: 700,
              color: KEY_ACCENT, letterSpacing: '0.5px',
              boxShadow: [
                '4px 4px 12px rgba(0,0,0,0.55)',
                '2px 2px 5px rgba(0,0,0,0.40)',
                '-0.5px -0.5px 1px rgba(255,255,255,0.04)',
                'inset 0 1px 0 rgba(255,255,255,0.07)',
                'inset -1px -1px 0 rgba(0,0,0,0.25)',
              ].join(', '),
              WebkitTapHighlightColor: 'transparent',
              ...FONT_SMOOTH,
            }}
          >
            Edit Kit
          </button>
        )}
      </div>

      {/* ── Content ── */}
      {!hasGear ? (
        <EmptyState onAdd={() => setEditing(true)} isDesktop={isDesktop} />
      ) : (
        <div style={{
          flex: 1, overflowY: 'auto',
          padding: isDesktop ? '0 40px 40px' : '0 22px 40px',
          position: 'relative', zIndex: 1,
          display: 'flex', flexDirection: 'column', gap: 20,
        }}>
          {/* Summary stat bar */}
          <div style={{
            display: 'flex', gap: 12,
            padding: '0 2px',
          }}>
            {[
              { n: lightCount, label: lightCount === 1 ? 'Light' : 'Lights' },
              { n: modCount, label: modCount === 1 ? 'Modifier' : 'Modifiers' },
            ].filter(s => s.n > 0).map(s => (
              <div key={s.label} style={{
                display: 'flex', alignItems: 'baseline', gap: 5,
              }}>
                <span style={{
                  fontSize: isDesktop ? 24 : 20, fontWeight: 700, color: C.textPrimary,
                  letterSpacing: '-0.5px', ...FONT_SMOOTH,
                }}>
                  {s.n}
                </span>
                <span style={{
                  fontSize: isDesktop ? 13 : 12, fontWeight: 500, color: steel(0.45),
                  ...FONT_SMOOTH,
                }}>
                  {s.label}
                </span>
              </div>
            ))}
          </div>

          {/* Recipe coverage */}
          <RecipeCoverage
            matched={matched.length}
            total={RECIPES.length}
            onBrowse={onRecipes}
            isDesktop={isDesktop}
          />

          {/* Lights */}
          {lightCount > 0 && (
            <div>
              <SectionLabel isDesktop={isDesktop}>LIGHTS</SectionLabel>
              <div style={{
                display: isDesktop ? 'grid' : 'flex',
                ...(isDesktop
                  ? { gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 8 }
                  : { flexDirection: 'column', gap: 8 }),
              }}>
                {kit.lights.map((l, i) => (
                  <LightCard key={l.type || l.id || i} light={l} isDesktop={isDesktop} />
                ))}
              </div>
            </div>
          )}

          {/* Modifiers */}
          {modCount > 0 && (
            <div>
              <SectionLabel isDesktop={isDesktop}>MODIFIERS</SectionLabel>
              <div style={{
                display: isDesktop ? 'grid' : 'flex',
                ...(isDesktop
                  ? { gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 6 }
                  : { flexDirection: 'column', gap: 6 }),
              }}>
                {kit.modifiers.map((m, i) => (
                  <ModifierCard key={(typeof m === 'string' ? m : m.type) || i} mod={m} isDesktop={isDesktop} />
                ))}
              </div>
            </div>
          )}

          {/* Support */}
          {kit.support?.length > 0 && (
            <div>
              <SectionLabel isDesktop={isDesktop}>SUPPORT</SectionLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {kit.support.map((s, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 14px', borderRadius: 10,
                    background: steel(0.04), border: `1px solid ${steel(0.08)}`,
                    ...FONT_SMOOTH,
                  }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: 4, flexShrink: 0,
                      background: steel(0.35),
                    }} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary, ...FONT_SMOOTH }}>
                      {(s.type || s).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </span>
                    {s.qty > 1 && (
                      <span style={{ fontSize: 11, color: steel(0.4), ...FONT_SMOOTH }}>&times;{s.qty}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upgrade hint */}
          <UpgradeHint hint={upgradeHint} isDesktop={isDesktop} />

          {/* Clear kit */}
          <div style={{ paddingTop: 8 }}>
            <button
              onClick={handleClear}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                padding: '8px 0',
                fontSize: 12, fontWeight: 500,
                color: confirmClear ? C.textDanger : steel(0.35),
                WebkitTapHighlightColor: 'transparent',
                ...FONT_SMOOTH,
              }}
            >
              {confirmClear ? 'Tap again to confirm clear' : 'Clear Kit'}
            </button>
          </div>
        </div>
      )}

      {/* iOS home indicator — hidden on desktop */}
      {!isDesktop && (
        <div style={{ height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 1, flexShrink: 0 }}>
          <div style={{ width: 134, height: 5, borderRadius: 3, backgroundColor: C.homeBar }} />
        </div>
      )}

      {/* ── Gear Picker Overlay ── */}
      {editing && (
        <GearPicker
          kit={kit}
          onSave={handleSaveKit}
          onCancel={() => setEditing(false)}
          isDesktop={isDesktop}
        />
      )}
    </div>
  );
}
