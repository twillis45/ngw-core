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
  }).slice(0, 4);
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

function buildKitSummary(kit) {
  const lights = kit.lights || [];
  const mods = kit.modifiers || [];
  const support = kit.support || [];
  const lightCount = lights.reduce((n, l) => n + (l.qty || 1), 0);
  const modCount = mods.length;
  const standCount = support.reduce((n, s) => n + (s.qty || 1), 0);
  const parts = [];
  parts.push(`${lightCount} light${lightCount !== 1 ? 's' : ''}`);
  if (modCount > 0) parts.push(`${modCount} modifier${modCount !== 1 ? 's' : ''}`);
  if (standCount > 0) parts.push(`${standCount} stand${standCount !== 1 ? 's' : ''}`);
  return parts.join(' · ');
}

// ─────────────────────────────────────────────────────────────────────────────

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
    dispatch({ type: 'SET_LOADING' });
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

  if (!kit || !kit.lights?.length) {
    return (
      <div className="screen">
        <h2 className="screen-heading">My Kit</h2>
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-text-dim)' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5, marginBottom: 16 }}>
            <rect x="2" y="9" width="20" height="12" rx="2"/>
            <path d="M8 9V6a4 4 0 0 1 8 0v2"/>
          </svg>
          <p>No saved kit yet.</p>
          <p style={{ fontSize: 'var(--text-sm)', marginTop: 8 }}>
            Add your gear once — get matched setups every time.
          </p>
          <button
            className="btn btn--primary btn--sm"
            onClick={() => dispatch({ type: 'SET_INTENT', intent: 'edit_kit' })}
            style={{ marginTop: 20 }}
          >
            Add Equipment
          </button>
        </div>
      </div>
    );
  }

  const matched = computeMatchedRecipes(kit);
  const upgradeHint = computeUpgradeHint(kit);
  const kitSummary = buildKitSummary(kit);

  return (
    <div className="screen">
      <div className="my-kit-header">
        <h2 className="screen-heading" style={{ marginBottom: 2 }}>My Kit</h2>
        <span className="my-kit-summary">{kitSummary}</span>
      </div>

      {/* ── Primary CTA ── */}
      <button
        className="btn btn--primary my-kit-cta"
        onClick={handleStartShoot}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
        Start a Shoot
      </button>

      {/* ── Matched setups ── */}
      {matched.length > 0 && (
        <div className="result-card my-kit-setups">
          <div className="result-card__header">
            <span className="result-card__icon">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
              </svg>
            </span>
            <span>Ready to run with your kit</span>
          </div>
          <div className="my-kit-setups__list">
            {matched.map(r => (
              <div key={r.id} className="my-kit-setup-row">
                <div className="my-kit-setup-row__info">
                  <strong className="my-kit-setup-row__name">{r.name}</strong>
                  <span className="my-kit-setup-row__meta">
                    {r.patternPreview && <span className="best-match__pattern">{r.patternPreview}</span>}
                    {r.setupTime && <span className="recipe-setup-time">{r.setupTime}</span>}
                  </span>
                </div>
                <button
                  className="btn btn--primary btn--sm my-kit-setup-row__run"
                  onClick={() => runRecipe(r)}
                  disabled={!!runningId}
                  type="button"
                >
                  {runningId === r.id ? (
                    <span className="my-kit-setup-row__spinner" />
                  ) : (
                    <>
                      Run
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 4 }}><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                    </>
                  )}
                </button>
              </div>
            ))}
          </div>
          <button
            className="my-kit-setups__browse"
            onClick={() => dispatch({ type: 'NAVIGATE', screen: 'recipes' })}
            type="button"
          >
            Browse all setups →
          </button>
        </div>
      )}

      {/* ── Upgrade hint ── */}
      {upgradeHint && (
        <div className="kit-upgrade-hint">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {upgradeHint}
        </div>
      )}

      {/* ── Gear inventory ── */}
      <div className="result-card my-kit-gear">
        <div className="result-card__header">
          <span className="result-card__icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="9" width="20" height="12" rx="2"/>
              <path d="M8 9V6a4 4 0 0 1 8 0v2"/>
            </svg>
          </span>
          <span>Your gear</span>
        </div>

        <div className="my-kit-gear__sections">
          {/* Lights section */}
          <div className="my-kit-gear__section">
            <span className="my-kit-gear__section-label">Lights</span>
            {kit.lights.map((l, i) => {
              const lightKey = l.type || l.id;
              const details = getLightDetails(lightKey);
              const displayName = details ? `${details.vendor} ${details.model}` : (l.label || lightKey || '');
              return (
                <div key={i} className="my-kit-gear__row">
                  <VendorLogo name={displayName} />
                  <a href={getBHUrl(displayName)} target="_blank" rel="noopener noreferrer" className="my-kit-gear__row-name blueprint-shop-link">
                    {displayName}
                  </a>
                  {l.qty > 1 && <span className="my-kit-gear__row-qty">&times;{l.qty}</span>}
                  {details?.qualityTier >= 4 && <span className="kit-item__badge">Pro</span>}
                </div>
              );
            })}
          </div>

          {/* Modifiers section — sorted small → large */}
          {kit.modifiers?.length > 0 && (
            <div className="my-kit-gear__section">
              <span className="my-kit-gear__section-label">Modifiers</span>
              {[...kit.modifiers].sort((a, b) => {
                const SIZE_ORDER = { small: 0, medium: 1, large: 2 };
                const mA = getModifierDetails(typeof a === 'string' ? a : a.type);
                const mB = getModifierDetails(typeof b === 'string' ? b : b.type);
                const scA = SIZE_ORDER[mA?.sizeClass] ?? 1;
                const scB = SIZE_ORDER[mB?.sizeClass] ?? 1;
                if (scA !== scB) return scA - scB;
                // Within same class, sort by first numeric dimension
                const numA = parseFloat((mA?.size || '').match(/[\d.]+/)?.[0] || 0);
                const numB = parseFloat((mB?.size || '').match(/[\d.]+/)?.[0] || 0);
                return numA - numB;
              }).map((m, i) => {
                const mType = typeof m === 'string' ? m : m.type;
                const mQty = typeof m === 'string' ? 1 : (m.qty || 1);
                const mod = getModifierDetails(mType);
                const label = mod ? mod.label : mType?.replace(/_/g, ' ');
                return (
                  <div key={mType || i} className="my-kit-gear__row">
                    <a href={getBHUrl(label)} target="_blank" rel="noopener noreferrer" className="my-kit-gear__row-name blueprint-shop-link">
                      {label}
                    </a>
                    {mQty > 1 && <span className="my-kit-gear__row-qty">&times;{mQty}</span>}
                  </div>
                );
              })}
            </div>
          )}

          {/* Support section */}
          {kit.support?.length > 0 && (
            <div className="my-kit-gear__section">
              <span className="my-kit-gear__section-label">Support</span>
              {kit.support.map((s, i) => (
                <div key={i} className="my-kit-gear__row">
                  <span className="my-kit-gear__row-name">{s.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</span>
                  {s.qty > 1 && <span className="my-kit-gear__row-qty">&times;{s.qty}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Secondary actions ── */}
      <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-md)' }}>
        <button className="btn btn--primary" onClick={handleEditKit} style={{ flex: 1 }}>
          Edit Equipment
        </button>
        <button
          className="btn btn--ghost"
          onClick={handleClear}
          style={{ flex: 1, color: confirmClear ? 'var(--color-danger, #ef4444)' : undefined }}
        >
          {confirmClear ? 'Confirm Clear' : 'Clear Kit'}
        </button>
      </div>
    </div>
  );
}
