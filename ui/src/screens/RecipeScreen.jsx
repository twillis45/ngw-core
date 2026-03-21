import { useState } from 'react';
import { useDispatch } from '../context/AppContext';
import { RECIPES, RECIPE_CATEGORIES } from '../data/recipes';
import { fetchRecommendation } from '../api';
import { transformForUI } from '../transform';
import { criteriaForGear } from '../gearPresets';
import { loadSettings } from '../data/settingsStore';
import { loadKit } from '../data/kitStore';

const DIFFICULTY_LABEL = { 1: 'Easy', 2: 'Moderate', 3: 'Advanced' };
const CONSISTENCY_LABEL = { high: 'Consistent', medium: 'Requires calibration' };

function checkKitMatch(recipe) {
  const kit = loadKit();
  if (!kit?.lights?.length) return null;
  const kitMods = (kit.modifiers || []).map(m => typeof m === 'string' ? m : m.type);
  const missing = recipe.modifiers.filter(rm =>
    !kitMods.some(km => km.includes(rm) || rm.includes(km))
  );
  if (missing.length === 0) return { status: 'match', label: 'Works with your kit' };
  if (missing.length === 1) return { status: 'partial', label: `Needs ${missing[0].replace(/_/g, ' ')}` };
  return { status: 'partial', label: `Missing ${missing.length} items` };
}

export default function RecipeScreen() {
  const dispatch = useDispatch();
  const [filter, setFilter] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  const filtered = filter
    ? RECIPES.filter(r => r.category === filter)
    : RECIPES;

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
      const { powerDisplay } = loadSettings();
      const result = transformForUI(apiResponse, recipe.mood, null, { powerDisplay });
      result.bestMatch.name = recipe.name;
      result.bestMatch.recipeId = recipe.id;
      if (recipe.pattern) result.bestMatch.lightingPattern = recipe.pattern;
      if (recipe.modifierFamily) {
        result.lightingIntelligence = result.lightingIntelligence || {};
        result.lightingIntelligence.detectedModifier = recipe.modifierFamily;
      }
      dispatch({ type: 'SET_RESULT', result, apiResponse });
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
          const kitMatch = checkKitMatch(recipe);
          return (
            <div
              key={recipe.id}
              className={`intent-card recipe-card${recipe.recommended ? ' intent-card--recommended' : ''}`}
            >
              {/* Main tap area — expands detail */}
              <button
                className="recipe-card__main"
                onClick={() => setExpandedId(isExpanded ? null : recipe.id)}
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
                    {kitMatch && (
                      <span className={`recipe-kit-match recipe-kit-match--${kitMatch.status}`}>
                        {kitMatch.label}
                      </span>
                    )}
                  </span>
                </span>
                <span className="intent-card__arrow">{isExpanded ? '\u2039' : '\u203A'}</span>
              </button>

              {/* Expanded detail */}
              {isExpanded && (
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
