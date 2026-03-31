import { useState, useRef, useEffect } from 'react';
import { useAppState, useDispatch } from '../context/AppContext';
import { RECIPES, RECIPE_CATEGORIES, RECIPE_META } from '../data/recipes';
import { fetchRecommendation } from '../api';
import { getSessionId } from '../data/analytics';
import { transformForUI } from '../transform';
import { criteriaForGear } from '../gearPresets';
import useSettings from '../hooks/useSettings';
import { loadKit } from '../data/kitStore';
import { getGearProfile } from '../data/lightCatalog';
import usePaywall, { resolveUserEmail } from '../hooks/usePaywall';
import usePreviewMode from '../hooks/usePreviewMode';
import { meetsPlan } from '../data/planStore';
import PricingScreen from '../components/PricingScreen';

const DIFFICULTY_LABEL = { 1: 'Easy', 2: 'Moderate', 3: 'Advanced' };
const CONSISTENCY_LABEL = { high: 'Consistent', medium: 'Requires calibration' };

// ── Card meta helpers ──────────────────────────────────────────────────────

const CATEGORY_LABEL = {
  portrait: 'Portrait', commercial: 'Commercial', editorial: 'Editorial',
  product: 'Product', video: 'Video',
};
const MODIFIER_LABEL = {
  beauty_dish: 'Beauty dish', softbox_rect: 'Softbox', softbox_octa: 'Octa',
  umbrella: 'Umbrella', ring_light: 'Ring light', grid_spot: 'Grid',
  on_camera_flash: 'On-camera flash', diffusion_panel: 'Diffusion',
  softbox: 'Softbox', stripbox: 'Stripbox', led_panel: 'LED panel',
};

function humanCategory(cat) {
  return CATEGORY_LABEL[cat] || (cat || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
function humanModifier(modFamily, modifiers) {
  const key = modFamily || modifiers?.[0];
  if (!key) return '';
  return MODIFIER_LABEL[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
function lightCountChip(setupTime) {
  if (!setupTime) return null;
  const m = setupTime.match(/^(\d+\s+lights?)/i);
  return m ? m[1] : setupTime.split(' · ')[0];
}

// ── Pattern-specific top-down lighting thumbnails ──────────────────────────

const A = 'var(--color-accent)';
const DIM = 'var(--color-text-dim)';
const SURF = 'var(--color-surface-elevated)';

/** Subject circle — same for every pattern */
function Subj() {
  return <circle cx="32" cy="38" r="8" stroke={A} strokeWidth="1.5" fill={SURF} />;
}

const PATTERN_SVG = {
  rembrandt: (
    <>
      <circle cx="12" cy="14" r="7" fill={A} />
      <line x1="18" y1="19" x2="26" y2="31" stroke={A} strokeWidth="1.2" opacity="0.5" />
      <circle cx="52" cy="22" r="5" stroke={DIM} strokeWidth="1" fill="none" opacity="0.55" />
      <Subj />
    </>
  ),
  loop: (
    <>
      <circle cx="14" cy="16" r="7" fill={A} />
      <line x1="20" y1="21" x2="28" y2="31" stroke={A} strokeWidth="1.2" opacity="0.5" />
      <circle cx="52" cy="18" r="5" stroke={DIM} strokeWidth="1" fill="none" opacity="0.55" />
      <Subj />
    </>
  ),
  butterfly: (
    <>
      <circle cx="32" cy="10" r="7" fill={A} />
      <line x1="32" y1="17" x2="32" y2="30" stroke={A} strokeWidth="1.2" opacity="0.5" />
      <circle cx="32" cy="57" r="5" stroke={DIM} strokeWidth="1" fill="none" opacity="0.45" />
      <Subj />
    </>
  ),
  clamshell: (
    <>
      <circle cx="32" cy="10" r="7" fill={A} />
      <line x1="32" y1="17" x2="32" y2="30" stroke={A} strokeWidth="1.2" opacity="0.5" />
      <circle cx="32" cy="56" r="6" fill={A} opacity="0.65" />
      <line x1="32" y1="50" x2="32" y2="46" stroke={A} strokeWidth="1.2" opacity="0.4" />
      <Subj />
    </>
  ),
  split: (
    <>
      <circle cx="8" cy="34" r="7" fill={A} />
      <line x1="15" y1="34" x2="24" y2="36" stroke={A} strokeWidth="1.2" opacity="0.5" />
      <Subj />
    </>
  ),
  high_key: (
    <>
      <circle cx="16" cy="16" r="6" fill={A} />
      <circle cx="48" cy="16" r="6" fill={A} />
      <line x1="21" y1="20" x2="28" y2="31" stroke={A} strokeWidth="1" opacity="0.4" />
      <line x1="43" y1="20" x2="36" y2="31" stroke={A} strokeWidth="1" opacity="0.4" />
      <Subj />
    </>
  ),
};

/** Top-down lighting diagram thumbnail — pattern-specific */
function RecipeThumb({ pattern }) {
  const shapes = PATTERN_SVG[pattern] || (
    <>
      <circle cx="14" cy="16" r="7" fill={A} />
      <rect x="22" y="15" width="12" height="2" rx="1" fill={A} />
      <Subj />
    </>
  );
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">{shapes}</svg>
  );
}

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
  const { isPaid, isStudio } = usePaywall(resolveUserEmail(user));
  const { access: previewAccess } = usePreviewMode();

  // Effective plan: preview overrides actual
  const effectiveIsPaid = previewAccess !== null
    ? (previewAccess === 'paid' || previewAccess === 'admin')
    : isPaid;
  const effectiveIsStudio = previewAccess === 'admin' || isStudio;
  const effectiveIsGuest = previewAccess !== null ? previewAccess === 'guest' : !user;

  function canRunRecipe(meta) {
    if (effectiveIsGuest) return false;          // must sign in
    const required = meta?.minPlan || 'free';
    if (required === 'free') return true;
    if (required === 'studio') return effectiveIsStudio;
    return effectiveIsPaid;                       // 'paid' requires paid plan
  }
  const [filter, setFilter] = useState(null);
  const [showPricing, setShowPricing] = useState(false);
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
        const card = cardRefs.current[next];
        if (!card) return;
        const detailCol = card.closest('.recipe-screen__body')
          ?.querySelector('.recipe-screen__detail-col');
        const atTablet = detailCol && detailCol.offsetWidth > 0;
        if (atTablet) {
          // Scroll the .screen container directly so the card top aligns with
          // the sticky detail panel (top: 8px). scrollIntoView can misfire on
          // inner scroll containers — direct scrollTo is reliable.
          const screen = card.closest('.screen');
          if (screen) {
            const screenRect = screen.getBoundingClientRect();
            const cardRect   = card.getBoundingClientRect();
            const offset     = cardRect.top - screenRect.top + screen.scrollTop - 8;
            screen.scrollTo({ top: Math.max(0, offset), behavior: 'smooth' });
          }
        } else {
          card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
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
    dispatch({ type: 'SET_LOADING', mode: 'match' });
    try {
      const gearProfile = recipe.gearProfile || 'strobe_mono';
      const payload = {
        systems: [{
          id: 'system-recipe',
          name: recipe.name,
          criteria: criteriaForGear(gearProfile),
          features: { dimmable: true, smart_ready: true, battery: true, waterproof: false },
          taxonomy_refs: {
            mood: recipe.mood,
            gear_profile: gearProfile,
            modifier_family: recipe.modifierFamily || recipe.modifiers[0] || 'softbox',
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
      // Two-host recipes: expand to crossed-key layout for both diagram and blueprint
      const finalResult = recipe.numSubjects === 2 ? expandForTwoHosts(result) : result;
      dispatch({ type: 'SET_RESULT', result: finalResult, apiResponse });
      dispatch({ type: 'NAVIGATE', screen: 'results' });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: err.message });
    }
  }

  // Detail content shared between inline (mobile) and panel (tablet+)
  function RecipeDetailContent({ recipe }) {
    return (
      <>
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
        {recipe.whyItWorks && (
          <div className="recipe-card__why">{recipe.whyItWorks}</div>
        )}
        {recipe.warning && (
          <div className="recipe-card__warning">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            {recipe.warning}
          </div>
        )}
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
        <button
          className="btn btn--primary btn--sm recipe-card__run-btn"
          onClick={() => selectRecipe(recipe)}
          type="button"
        >
          Run this setup
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 6 }}><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </button>
      </>
    );
  }

  // Resolved expanded recipe for right-panel rendering at tablet+
  const panelRecipe = expandedId ? filtered.find(r => r.id === expandedId) : null;
  const panelMeta   = panelRecipe ? (RECIPE_META[panelRecipe.id] || {}) : null;
  const panelUnlocked = panelRecipe ? canRunRecipe(panelMeta) : false;

  return (
    <div className="screen recipe-screen">
      <h2 className="screen-heading">Recipes</h2>

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

      <div className="recipe-screen__body">
        {/* ── List column ─────────────────────────────── */}
        <div className="recipe-screen__list-col">
          <div className="recipe-list">
            {filtered.length === 0 && (
              <div className="recipe-empty-state">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                  style={{ color: 'var(--color-text-dim)', flexShrink: 0 }}
                >
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <p className="recipe-empty-state__title">
                  No setups in{' '}
                  {filter
                    ? `"${RECIPE_CATEGORIES.find(c => c.value === filter)?.label ?? filter}"`
                    : 'this category'}
                </p>
                <p className="recipe-empty-state__sub">
                  Try a different category or browse all setups.
                </p>
                {filter && (
                  <button
                    className="btn btn--ghost btn--sm"
                    onClick={() => setFilter(null)}
                    type="button"
                  >
                    Browse all setups
                  </button>
                )}
              </div>
            )}
            {filtered.map(recipe => {
              const isExpanded = expandedId === recipe.id;
              const kitMatch     = checkKitMatch(recipe);
              const meta         = RECIPE_META[recipe.id] || {};
              const lightType    = meta.lightType;
              const unlocked     = canRunRecipe(meta);
              const isPaidOnly   = (meta.minPlan === 'paid') && !unlocked;
              const isStudioOnly = (meta.minPlan === 'studio') && !unlocked;
              return (
                <div
                  key={recipe.id}
                  ref={el => { cardRefs.current[recipe.id] = el; }}
                  className={`intent-card recipe-card${recipe.recommended ? ' intent-card--recommended' : ''}${isExpanded ? ' recipe-card--expanded' : ''}${!unlocked ? ' recipe-card--locked' : ''}`}
                >
                  <button
                    className="recipe-card__main"
                    onClick={() => unlocked ? handleExpand(recipe.id) : setShowPricing(true)}
                    type="button"
                  >
                    {/* Thumb icon — pattern-specific lighting diagram */}
                    <span className={`recipe-card__thumb${unlocked ? '' : ' recipe-card__thumb--locked'}`}>
                      {unlocked ? (
                        <RecipeThumb pattern={recipe.pattern} />
                      ) : (
                        <span className="recipe-card__thumb-pro">PRO<br />Only</span>
                      )}
                    </span>
                    <span className="intent-card__text">
                      <strong>{recipe.name}</strong>
                      <span className="recipe-card__meta">
                        {humanCategory(recipe.category)}
                        {humanModifier(recipe.modifierFamily, recipe.modifiers) && (
                          <> &middot; {humanModifier(recipe.modifierFamily, recipe.modifiers)}</>
                        )}
                      </span>
                      <span className="intent-card__footer">
                        {lightCountChip(recipe.setupTime) && (
                          <span className="recipe-card__gear-badge">
                            {lightCountChip(recipe.setupTime)}
                          </span>
                        )}
                        {unlocked && recipe.recommended && (
                          <span className="recipe-card__popular-badge">Popular</span>
                        )}
                        {unlocked && kitMatch && (
                          <span className={`recipe-kit-match recipe-kit-match--${kitMatch.status}`}>
                            {kitMatch.label}
                          </span>
                        )}
                        {!unlocked && isStudioOnly && (
                          <span className="recipe-lock-badge recipe-lock-badge--studio">Studio</span>
                        )}
                        {!unlocked && isPaidOnly && !isStudioOnly && (
                          <span className="recipe-lock-badge">Pro</span>
                        )}
                        {!unlocked && effectiveIsGuest && (
                          <span className="recipe-lock-badge recipe-lock-badge--signin">Sign in</span>
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

                  {/* Inline detail — mobile only (hidden at 820px+ via CSS) */}
                  {isExpanded && unlocked && (
                    <div className="recipe-card__detail recipe-card__detail--inline">
                      <RecipeDetailContent recipe={recipe} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Detail panel — tablet+ only (hidden on mobile via CSS) ── */}
        <div className="recipe-screen__detail-col">
          {panelRecipe && panelUnlocked ? (
            <div className="recipe-screen__detail-panel">
              <strong className="recipe-screen__detail-name">{panelRecipe.name}</strong>
              <p className="recipe-screen__detail-desc">{panelRecipe.description}</p>
              <RecipeDetailContent recipe={panelRecipe} />
            </div>
          ) : (
            <div className="recipe-screen__detail-empty">
              {panelRecipe && !panelUnlocked
                ? <button className="btn btn--primary btn--sm" onClick={() => setShowPricing(true)} type="button">View Plans</button>
                : <span>Select a setup to see details</span>
              }
            </div>
          )}
        </div>
      </div>

      {showPricing && (
        <PricingScreen
          trigger="recipe_locked"
          source="RecipeScreen"
          onClose={() => setShowPricing(false)}
          onUnlock={() => setShowPricing(false)}
        />
      )}
    </div>
  );
}
