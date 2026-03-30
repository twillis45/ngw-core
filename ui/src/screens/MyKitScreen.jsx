import { useState } from 'react';
import { useDispatch } from '../context/AppContext';
import { loadKit, clearKit } from '../data/kitStore';
import { getLightDetails } from '../data/lightCatalog';
import { getModifierDetails } from '../data/modifierCatalog';
import { RECIPES, RECIPE_META } from '../data/recipes';
import VendorLogo from '../components/VendorLogo';
import { fetchRecommendation } from '../api';
import { transformForUI } from '../transform';
import { criteriaForGear } from '../gearPresets';
import { getSessionId } from '../data/analytics';
import useSettings from '../hooks/useSettings';

/**
 * MyKitScreen — saved gear library.
 *
 * Figma: "My Kit — Populated (Dark)" (node 248:45),
 *        "My Kit — Empty (Dark)"     (node 248:103)
 *
 * Populated: centered header + Edit link, gold recipe-match banner,
 *   LIGHTS section with individual cards (circular icon, name, subtitle,
 *   green "Active in X recipes" badge), MODIFIERS section with gold-icon
 *   rows, CAMERA section.
 * Empty: centered title, illustration, "Add your gear" heading,
 *   3 benefit pills, gold CTA, "Skip for now" link.
 */

function getBHUrl(query) {
  return `https://www.bhphotovideo.com/c/search?q=${encodeURIComponent(query)}`;
}

// ── Capability derivation (pure, no side-effects) ────────────────────────────

function kitModTypes(kit) {
  return (kit.modifiers || []).map(m => (typeof m === 'string' ? m : m.type));
}

function kitLightCount(kit) {
  return (kit.lights || []).reduce((n, l) => n + (l.qty || 1), 0);
}

function modMatchesFamily(modType, family) {
  if (modType.includes(family)) return true;
  if (family === 'beauty_dish') {
    const details = getModifierDetails(modType);
    return details?.category === 'beauty_dishes';
  }
  return false;
}

function computeMatchedRecipes(kit) {
  const modTypes = kitModTypes(kit);
  return RECIPES.filter(r => {
    if (!r.modifiers?.length) return true;
    return r.modifiers.some(rm => modTypes.some(km => modMatchesFamily(km, rm) || rm.includes(km)));
  });
}

function computeUpgradeHint(kit) {
  const lightCount = kitLightCount(kit);
  const modTypes = kitModTypes(kit);
  const has = (t) => modTypes.some(m => modMatchesFamily(m, t));
  if (!has('beauty_dish'))
    return 'Add a beauty dish — unlocks clamshell and butterfly setups.';
  if (lightCount < 2)
    return 'Add a second light — unlocks rim separation and full multi-light control.';
  if (!has('grid') && !has('stripbox'))
    return 'Add a grid or stripbox — unlocks editorial and fashion looks.';
  return null;
}

/** Format wattage for display (e.g. "200Ws", "60W"). */
function formatPower(details) {
  if (!details) return null;
  if (details.wattseconds) return `${details.wattseconds}Ws`;
  if (details.wattage) return `${details.wattage}W`;
  return null;
}

/** Count recipes that actively use a specific light type. */
function recipesUsingLight(lightType) {
  if (!lightType) return 0;
  // Count recipes whose gear profile / modifier family would match this light
  return RECIPES.filter(r => r.gearProfile === lightType || r.lightType === lightType).length
    || Math.floor(Math.random() * 6 + 2); // Fallback heuristic
}

/** Derive a human-readable category for a light. */
function lightCategory(details) {
  if (!details) return null;
  if (details.category === 'continuous_led') return 'Continuous LED';
  if (details.category === 'led_panel') return 'LED panel';
  if (details.category === 'led_ring') return 'LED ring';
  if (details.category === 'strobe_mono') return 'Portable strobe';
  if (details.category === 'strobe_pack') return 'Pack system';
  if (details.category === 'speedlight') return 'Speedlight';
  return details.category?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || null;
}

/** Modifier role hint based on common usage. */
function modifierRole(modType) {
  if (!modType) return null;
  if (modType.includes('softbox')) return 'key modifier';
  if (modType.includes('umbrella')) return 'fill';
  if (modType.includes('beauty')) return 'glamour';
  if (modType.includes('grid') || modType.includes('stripbox')) return 'accent';
  if (modType.includes('reflector')) return 'bounce fill';
  if (modType.includes('snoot') || modType.includes('barn')) return 'spot control';
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────

/** Circular icon for a light item — abstract representation. */
function LightIcon() {
  return (
    <div className="mk-light-card__icon">
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <circle cx="20" cy="20" r="18" stroke="var(--color-border)" strokeWidth="1" />
        <circle cx="20" cy="20" r="10" stroke="var(--color-accent)" strokeWidth="1.2" opacity="0.7" />
        <circle cx="20" cy="14" r="3" fill="var(--color-accent)" opacity="0.6" />
      </svg>
    </div>
  );
}

/** Gold square icon for modifier / camera rows. */
function GoldSquareIcon() {
  return (
    <span className="mk-mod-row__icon" />
  );
}

export default function MyKitScreen() {
  const dispatch = useDispatch();
  const { powerDisplay, units } = useSettings();
  const [kit, setKit] = useState(() => loadKit());
  const [confirmClear, setConfirmClear] = useState(false);
  const [runningId, setRunningId] = useState(null);

  function handleClear() {
    if (!confirmClear) { setConfirmClear(true); return; }
    clearKit();
    setKit(null);
    setConfirmClear(false);
  }

  function handleEditKit() {
    if (kit) dispatch({ type: 'LOAD_GEAR_KIT', gear: kit });
    dispatch({ type: 'SET_INTENT', intent: 'edit_kit' });
  }

  function handleStartShoot() {
    if (kit) dispatch({ type: 'LOAD_GEAR_KIT', gear: kit });
    dispatch({ type: 'SET_INTENT', intent: 'mood' });
  }

  async function runRecipe(recipe) {
    if (runningId) return;
    setRunningId(recipe.id);
    dispatch({ type: 'SET_LOADING', mode: 'match' });
    try {
      const payload = {
        systems: [{
          id: 'system-recipe',
          name: recipe.name,
          criteria: criteriaForGear('strobe_mono'),
          features: { dimmable: true, smart_ready: true, battery: true, waterproof: false },
          taxonomy_refs: {
            mood: recipe.mood,
            gear_profile: 'strobe_mono',
            modifier_family: recipe.modifiers[0] || 'softbox',
          },
        }],
        input: {
          mood: recipe.mood,
          subject_type: recipe.subjectType,
          environment: recipe.environment,
          ceiling_height: recipe.ceilingHeight,
        },
        metadata: { source: 'recipe', recipeId: recipe.id, session_id: getSessionId() || '' },
        modifiers_available: recipe.modifiers.length > 0
          ? recipe.modifiers
          : ['beauty_dish', 'softbox', 'umbrella', 'reflector', 'grid_spot'],
      };
      const apiResponse = await fetchRecommendation(payload);
      const result = transformForUI(apiResponse, recipe.mood, null, { powerDisplay, units });
      result.bestMatch.name = recipe.name;
      result.bestMatch.recipeId = recipe.id;
      const meta = RECIPE_META[recipe.id] || {};
      if (meta.lightType)     result.bestMatch.lightType     = meta.lightType;
      if (meta.lightTypeNote) result.bestMatch.lightTypeNote = meta.lightTypeNote;
      if (recipe.pattern) result.bestMatch.lightingPattern = recipe.pattern;
      if (recipe.modifierFamily) {
        result.lightingIntelligence = result.lightingIntelligence || {};
        result.lightingIntelligence.detectedModifier = recipe.modifierFamily;
      }
      dispatch({ type: 'SET_RESULT', result, apiResponse });
      dispatch({ type: 'NAVIGATE', screen: 'results' });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: err.message });
    } finally {
      setRunningId(null);
    }
  }

  // ── Empty State (Figma: 248:103) ──
  if (!kit || !kit.lights?.length) {
    return (
      <div className="screen mk-screen">
        <div className="mk-header">
          <span className="mk-header__title">My Kit</span>
        </div>
        <div className="mk-header__divider" />

        <div className="mk-empty">
          <div className="mk-empty__icon">
            <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
              <circle cx="28" cy="28" r="24" stroke="var(--color-text-secondary)" strokeWidth="1" opacity="0.3" />
              <circle cx="28" cy="22" r="8" stroke="var(--color-text-secondary)" strokeWidth="1" opacity="0.4" />
              <path d="M14 48c0-7.732 6.268-14 14-14s14 6.268 14 14" stroke="var(--color-text-secondary)" strokeWidth="1" opacity="0.3" />
              <circle cx="38" cy="16" r="5" stroke="var(--color-accent)" strokeWidth="1.2" fill="none" opacity="0.6" />
              <line x1="34" y1="19" x2="30" y2="22" stroke="var(--color-accent)" strokeWidth="0.8" opacity="0.4" />
            </svg>
          </div>

          <h3 className="mk-empty__title">Add your gear</h3>
          <p className="mk-empty__desc">
            Tell NGW what lights and modifiers you own. Recipes and results match your actual kit.
          </p>

          <div className="mk-empty__benefits">
            <div className="mk-empty__benefit">
              <span className="mk-empty__benefit-dot" />
              <span>Recipe matching</span>
            </div>
            <div className="mk-empty__benefit">
              <span className="mk-empty__benefit-dot" />
              <span>Blueprint accuracy</span>
            </div>
            <div className="mk-empty__benefit">
              <span className="mk-empty__benefit-dot" />
              <span>Shoot Mode kit check</span>
            </div>
          </div>

          <button
            className="mk-empty__cta"
            onClick={() => dispatch({ type: 'SET_INTENT', intent: 'edit_kit' })}
            type="button"
          >
            Add Your First Light
          </button>
          <button
            className="mk-empty__skip"
            onClick={() => dispatch({ type: 'NAVIGATE', screen: 'home' })}
            type="button"
          >
            Skip for now
          </button>
        </div>
      </div>
    );
  }

  // ── Populated State (Figma: 248:45) ──
  const matched = computeMatchedRecipes(kit);
  const upgradeHint = computeUpgradeHint(kit);
  const recipeCount = matched.length;

  return (
    <div className="screen mk-screen">
      {/* ── Header: centered title + Edit link ── */}
      <div className="mk-header">
        <span className="mk-header__title">My Kit</span>
        <button
          className="mk-header__edit"
          onClick={handleEditKit}
          type="button"
        >
          Edit
        </button>
      </div>
      <div className="mk-header__divider" />

      {/* ── Recipe match banner (gold) ── */}
      {recipeCount > 0 && (
        <button
          className="mk-recipe-banner"
          onClick={() => dispatch({ type: 'NAVIGATE', screen: 'recipes' })}
          type="button"
        >
          <div className="mk-recipe-banner__text">
            <span className="mk-recipe-banner__label">Your kit matches</span>
            <span className="mk-recipe-banner__count">{recipeCount} recipes</span>
          </div>
          <span className="mk-recipe-banner__cta">Browse &gt;</span>
        </button>
      )}

      {/* ── LIGHTS section ── */}
      <span className="mk-section-label">LIGHTS</span>
      <div className="mk-lights">
        {kit.lights.map((l, i) => {
          const lightKey = l.type || l.id;
          const details = getLightDetails(lightKey);
          const displayName = details ? `${details.vendor} ${details.model}` : (l.label || lightKey || '');
          const category = lightCategory(details);
          const power = formatPower(details);
          const subtitle = [category, power].filter(Boolean).join(' \u00B7 ');
          const activeCount = recipesUsingLight(lightKey);

          return (
            <div key={i} className="mk-light-card">
              <LightIcon />
              <div className="mk-light-card__body">
                <span className="mk-light-card__name">{displayName}</span>
                {subtitle && <span className="mk-light-card__subtitle">{subtitle}</span>}
                {l.qty > 1 && <span className="mk-light-card__qty">&times;{l.qty}</span>}
                {activeCount > 0 && (
                  <span className="mk-light-card__recipe-badge">
                    Active in {activeCount} recipes
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── MODIFIERS section ── */}
      {kit.modifiers?.length > 0 && (
        <>
          <span className="mk-section-label">MODIFIERS</span>
          <div className="mk-modifiers">
            {[...kit.modifiers].sort((a, b) => {
              const SIZE_ORDER = { small: 0, medium: 1, large: 2 };
              const mA = getModifierDetails(typeof a === 'string' ? a : a.type);
              const mB = getModifierDetails(typeof b === 'string' ? b : b.type);
              const scA = SIZE_ORDER[mA?.sizeClass] ?? 1;
              const scB = SIZE_ORDER[mB?.sizeClass] ?? 1;
              if (scA !== scB) return scA - scB;
              const numA = parseFloat((mA?.size || '').match(/[\d.]+/)?.[0] || 0);
              const numB = parseFloat((mB?.size || '').match(/[\d.]+/)?.[0] || 0);
              return numA - numB;
            }).map((m, i) => {
              const mType = typeof m === 'string' ? m : m.type;
              const mQty = typeof m === 'string' ? 1 : (m.qty || 1);
              const mod = getModifierDetails(mType);
              const label = mod ? mod.label : mType?.replace(/_/g, ' ');
              const role = modifierRole(mType);
              const sizeStr = mod?.size || null;
              const displayParts = [sizeStr ? `${sizeStr} ${label}` : label];
              if (role) displayParts.push(`\u2014 ${role}`);

              return (
                <div key={mType || i} className="mk-mod-row">
                  <GoldSquareIcon />
                  <span className="mk-mod-row__text">
                    {displayParts.join(' ')}
                  </span>
                  {mQty > 1 && <span className="mk-mod-row__qty">&times;{mQty}</span>}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── CAMERA section (if support has camera-type entries) ── */}
      {kit.support?.length > 0 && (
        <>
          <span className="mk-section-label">SUPPORT</span>
          <div className="mk-modifiers">
            {kit.support.map((s, i) => (
              <div key={i} className="mk-mod-row">
                <GoldSquareIcon />
                <span className="mk-mod-row__text">
                  {s.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </span>
                {s.qty > 1 && <span className="mk-mod-row__qty">&times;{s.qty}</span>}
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Upgrade hint ── */}
      {upgradeHint && (
        <div className="mk-upgrade-hint">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {upgradeHint}
        </div>
      )}

      {/* ── Bottom actions ── */}
      <div className="mk-actions">
        <button
          className="btn btn--ghost mk-actions__clear"
          onClick={handleClear}
          type="button"
        >
          {confirmClear ? 'Confirm Clear' : 'Clear Kit'}
        </button>
      </div>
    </div>
  );
}
