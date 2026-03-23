import { useState, useRef, useEffect } from 'react';
import { useAppState, useDispatch } from '../context/AppContext';
import { RECIPES, RECIPE_CATEGORIES, RECIPE_META } from '../data/recipes';
import { fetchRecommendation } from '../api';
import { transformForUI } from '../transform';
import { criteriaForGear } from '../gearPresets';
import useSettings from '../hooks/useSettings';
import { loadKit } from '../data/kitStore';
import { getGearProfile } from '../data/lightCatalog';
import usePaywall from '../hooks/usePaywall';
import usePreviewMode from '../hooks/usePreviewMode';
import { meetsPlan } from '../data/planStore';

const DIFFICULTY_LABEL = { 1: 'Easy', 2: 'Moderate', 3: 'Advanced' };
const CONSISTENCY_LABEL = { high: 'Consistent', medium: 'Requires calibration' };

/**
 * Expand a single-subject result into a two-host crossed-key layout.
 * Replaces any key + fill combo with symmetrical keys — one per host.
 */
function expandForTwoHosts(result) {
  const diagramLights = result.diagram?.lights || [];
  const keyLight = diagramLights.find(l => l.role === 'key') || diagramLights[0];
  const rimLight  = diagramLights.find(l => l.role === 'rim' || l.role === 'hair');

  const crossedDiagramLights = [
    {
      ...(keyLight || {}),
      role: 'key',
      label: 'Host A Key',
      position: 'camera-left',
      angle_deg: -45,
      side: 'left',
    },
    {
      ...(keyLight || {}),
      role: 'key',
      label: 'Host B Key',
      position: 'camera-right',
      angle_deg: 45,
      side: 'right',
    },
    ...(rimLight ? [{ ...rimLight, label: 'Rim / Separation', position: 'behind-center' }] : []),
  ];

  const setupLights = result.setup?.lights || [];
  const keySetupLight = setupLights.find(l => l._role === 'key' || l.role === 'key') || setupLights[0];
  const crossedSetupLights = [
    {
      ...(keySetupLight || {}),
      role: 'key', _role: 'key',
      label: 'Host A Key — camera-left 45°',
      positionText: 'Camera-left, 45° — aimed at Host B (crossed fill)',
    },
    {
      ...(keySetupLight || {}),
      role: 'key', _role: 'key',
      label: 'Host B Key — camera-right 45°',
      positionText: 'Camera-right, 45° — aimed at Host A (crossed fill)',
    },
  ];

  return {
    ...result,
    diagram: { ...(result.diagram || {}), lights: crossedDiagramLights, subject_spacing_m: 1.2 },
    setup: { ...(result.setup || {}), lights: crossedSetupLights },
    twoHostSetup: true,
  };
}

// Gear profiles that are continuous (LED/HMI/tungsten) vs strobe
const CONTINUOUS_PROFILES = new Set(['led_cob', 'led_panel', 'led_tube', 'ring_light', 'ellipsoidal']);
const STROBE_PROFILES     = new Set(['strobe_mono', 'strobe_pack', 'speedlight']);

/** Returns 'continuous' | 'strobe' | 'mixed' | null based on lights in kit. */
function getKitLightType(lights) {
  if (!lights?.length) return null;
  let hasCont = false, hasStrobe = false;
  lights.forEach(l => {
    const profile = getGearProfile(typeof l === 'string' ? l : l.type) || '';
    if (CONTINUOUS_PROFILES.has(profile)) hasCont = true;
    if (STROBE_PROFILES.has(profile))     hasStrobe = true;
  });
  if (hasCont && hasStrobe) return 'mixed';
  if (hasCont)  return 'continuous';
  if (hasStrobe) return 'strobe';
  return null;
}

// Stand-type support item prefixes — any of these count as a stand for matching
const STAND_PREFIXES = ['c_stand', 'light_stand', 'manfrotto_', 'avenger_combo', 'roller_stand'];

function countKitStands(support) {
  if (!support?.length) return 0;
  return support.reduce((total, s) => {
    const type = typeof s === 'string' ? s : (s.type || '');
    const qty  = typeof s === 'object' && s.qty ? s.qty : 1;
    if (type === 'bg_stand' || type === 'bg_stand_heavy') return total + qty * 2; // set includes 2 stands
    if (STAND_PREFIXES.some(p => type.startsWith(p))) return total + qty;
    return total;
  }, 0);
}

function parseLightCount(setupTime) {
  if (!setupTime) return 1;
  const m = setupTime.match(/^(\d+)\s+light/);
  return m ? parseInt(m[1], 10) : 1;
}

function checkKitMatch(recipe) {
  const kit = loadKit();
  if (!kit?.lights?.length) return null;

  const issues = [];
  const meta         = RECIPE_META[recipe.id] || {};
  const recipeType   = meta.lightType || 'both';
  const kitType      = getKitLightType(kit.lights);
  const lightsNeeded = parseLightCount(recipe.setupTime);
  const isOnCamera   = recipe.modifiers.includes('on_camera_flash');

  // Light type mismatch — highest priority check
  if (recipeType !== 'both' && kitType && kitType !== 'mixed' && kitType !== recipeType) {
    if (recipeType === 'continuous') {
      issues.push('Best with continuous LED');
    } else {
      issues.push('Requires flash/strobe');
    }
  }

  // Light count check
  if (kit.lights.length < lightsNeeded) {
    const diff = lightsNeeded - kit.lights.length;
    issues.push(`Need ${diff} more light${diff > 1 ? 's' : ''}`);
  }

  // Stand count check (on-camera flash mounts to hot shoe — no stand required)
  if (!isOnCamera) {
    const standsOwned  = countKitStands(kit.support);
    const standsNeeded = lightsNeeded;
    if (standsOwned < standsNeeded) {
      const diff = standsNeeded - standsOwned;
      issues.push(`Need ${diff} more stand${diff > 1 ? 's' : ''}`);
    }
  }

  // Modifier check (skip on_camera_flash — it's a light type, not a modifier)
  const kitMods    = (kit.modifiers || []).map(m => typeof m === 'string' ? m : m.type);
  const missingMods = recipe.modifiers.filter(rm =>
    rm !== 'on_camera_flash' &&
    !kitMods.some(km => km.includes(rm) || rm.includes(km))
  );

  if (issues.length === 0 && missingMods.length === 0) {
    return { status: 'match', label: 'Works with your kit' };
  }
  if (issues.length > 0) return { status: 'partial', label: issues[0] };
  if (missingMods.length === 1) return { status: 'partial', label: `Needs ${missingMods[0].replace(/_/g, ' ')}` };
  return { status: 'partial', label: `Missing ${missingMods.length} modifiers` };
}

export default function RecipeScreen() {
  const { user } = useAppState();
  const dispatch = useDispatch();
  const { powerDisplay, units } = useSettings();
  const { isPaid } = usePaywall(user?.email || user?.username || null);
  const { access: previewAccess } = usePreviewMode();

  // Effective plan: preview overrides actual
  const effectiveIsPaid = previewAccess !== null
    ? (previewAccess === 'paid' || previewAccess === 'admin')
    : isPaid;
  const effectiveIsGuest = previewAccess !== null ? previewAccess === 'guest' : !user;

  function canRunRecipe(meta) {
    if (effectiveIsGuest) return false;          // must sign in
    const required = meta?.minPlan || 'free';
    if (required === 'free') return true;
    return effectiveIsPaid;                       // 'paid' requires paid plan
  }
  const [filter, setFilter] = useState(null);
  const EXPANDED_KEY = 'ngw_recipe_expanded';
  const [expandedId, setExpandedId] = useState(() => {
    try { return sessionStorage.getItem(EXPANDED_KEY) || null; } catch { return null; }
  });
  const cardRefs = useRef({});
  const didRestoreScroll = useRef(false);

  // On mount: if restoring an expanded card, scroll to it so it's visible
  useEffect(() => {
    if (expandedId && !didRestoreScroll.current) {
      didRestoreScroll.current = true;
      setTimeout(() => {
        cardRefs.current[expandedId]?.scrollIntoView({ block: 'center' });
      }, 80);
    }
  }, []);

  function handleExpand(id) {
    const next = expandedId === id ? null : id;
    setExpandedId(next);
    try {
      if (next) sessionStorage.setItem(EXPANDED_KEY, next);
      else sessionStorage.removeItem(EXPANDED_KEY);
    } catch { /* ignore */ }
    if (next) {
      setTimeout(() => {
        cardRefs.current[next]?.scrollIntoView({ block: 'nearest' });
      }, 60);
    }
  }

  // Sort by revenue rank; filter by workflow group
  const sorted = [...RECIPES].sort((a, b) => {
    const ra = RECIPE_META[a.id]?.revenueRank ?? 99;
    const rb = RECIPE_META[b.id]?.revenueRank ?? 99;
    return ra - rb;
  });
  const filtered = filter
    ? sorted.filter(r => RECIPE_META[r.id]?.workflow === filter)
    : sorted;

  async function selectRecipe(recipe) {
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
        metadata: { source: 'recipe', recipeId: recipe.id },
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
      // Two-host recipes: expand to crossed-key layout for both diagram and blueprint
      const finalResult = recipe.numSubjects === 2 ? expandForTwoHosts(result) : result;
      dispatch({ type: 'SET_RESULT', result: finalResult, apiResponse });
      dispatch({ type: 'NAVIGATE', screen: 'results' });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: err.message });
    }
  }

  return (
    <div className="screen">
      <h2 className="screen-heading">Lighting Setups</h2>

      <div className="chip-grid" style={{ marginBottom: 16 }}>
        <button
          className={`chip${!filter ? ' chip--selected' : ''}`}
          onClick={() => setFilter(null)}
        >All</button>
        {RECIPE_CATEGORIES.map(c => (
          <button
            key={c.value}
            className={`chip${filter === c.value ? ' chip--selected' : ''}`}
            onClick={() => setFilter(c.value)}
          >{c.label}</button>
        ))}
      </div>

      <div className="recipe-list">
        {filtered.map(recipe => {
          const isExpanded = expandedId === recipe.id;
          const kitMatch   = checkKitMatch(recipe);
          const meta       = RECIPE_META[recipe.id] || {};
          const lightType  = meta.lightType;
          const unlocked   = canRunRecipe(meta);
          const isPaidOnly = (meta.minPlan === 'paid') && !unlocked;
          return (
            <div
              key={recipe.id}
              ref={el => { cardRefs.current[recipe.id] = el; }}
              className={`intent-card recipe-card${recipe.recommended ? ' intent-card--recommended' : ''}${isExpanded ? ' recipe-card--expanded' : ''}${!unlocked ? ' recipe-card--locked' : ''}`}
            >
              {/* Main tap area — expands detail */}
              <button
                className="recipe-card__main"
                onClick={() => unlocked && handleExpand(recipe.id)}
                type="button"
              >
                <span className="intent-card__text">
                  <strong>{recipe.name}</strong>
                  <small>{recipe.description}</small>
                  <span className="intent-card__footer">
                    {recipe.patternPreview && (
                      <span className="best-match__pattern">{recipe.patternPreview}</span>
                    )}
                    {recipe.setupTime && (
                      <span className="recipe-setup-time">{recipe.setupTime}</span>
                    )}
                    {recipe.consistency && (
                      <span className={`recipe-consistency recipe-consistency--${recipe.consistency}`}>
                        {CONSISTENCY_LABEL[recipe.consistency]}
                      </span>
                    )}
                    {lightType === 'continuous' && (
                      <span className="recipe-light-type recipe-light-type--continuous">Video-ready</span>
                    )}
                    {lightType === 'strobe' && (
                      <span className="recipe-light-type recipe-light-type--strobe">Flash only</span>
                    )}
                    {!unlocked && isPaidOnly && (
                      <span className="recipe-lock-badge">Paid</span>
                    )}
                    {!unlocked && effectiveIsGuest && (
                      <span className="recipe-lock-badge recipe-lock-badge--signin">Sign in</span>
                    )}
                    {unlocked && kitMatch && (
                      <span className={`recipe-kit-match recipe-kit-match--${kitMatch.status}`}>
                        {kitMatch.label}
                      </span>
                    )}
                  </span>
                </span>
                {unlocked
                  ? <span className="intent-card__arrow">{isExpanded ? '\u2039' : '\u203A'}</span>
                  : <span className="recipe-card__lock-icon">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                        <path d="M7 11V7a5 5 0 0110 0v4"/>
                      </svg>
                    </span>
                }
              </button>

              {/* Expanded detail */}
              {isExpanded && unlocked && (
                <div className="recipe-card__detail">
                  {/* Confidence signals */}
                  <div className="recipe-card__signals">
                    <span className="recipe-signal">
                      <span className="recipe-signal__label">Difficulty</span>
                      <span className="recipe-signal__value">{DIFFICULTY_LABEL[recipe.difficulty] || recipe.difficulty}</span>
                    </span>
                    {recipe.useCase && (
                      <span className="recipe-signal">
                        <span className="recipe-signal__label">Use case</span>
                        <span className="recipe-signal__value">{recipe.useCase}</span>
                      </span>
                    )}
                    {recipe.gearFlexibility && (
                      <span className="recipe-signal">
                        <span className="recipe-signal__label">Gear</span>
                        <span className="recipe-signal__value">{recipe.gearFlexibility}</span>
                      </span>
                    )}
                  </div>

                  {/* Why it works */}
                  {recipe.whyItWorks && (
                    <div className="recipe-card__why">{recipe.whyItWorks}</div>
                  )}

                  {/* Warning */}
                  {recipe.warning && (
                    <div className="recipe-card__warning">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                      {recipe.warning}
                    </div>
                  )}

                  {/* Variations */}
                  {recipe.variations?.length > 0 && (
                    <div className="recipe-card__variations">
                      <span className="recipe-card__variations-label">Variations</span>
                      {recipe.variations.map((v, i) => (
                        <div key={i} className="recipe-card__variation">
                          <strong>{v.label}:</strong> {v.mod}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* CTA */}
                  <button
                    className="btn btn--primary btn--sm recipe-card__run-btn"
                    onClick={() => selectRecipe(recipe)}
                    type="button"
                  >
                    Run this setup
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 6 }}><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
