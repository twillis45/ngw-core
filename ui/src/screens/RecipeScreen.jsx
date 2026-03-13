import { useState } from 'react';
import { useDispatch } from '../context/AppContext';
import { RECIPES, RECIPE_CATEGORIES } from '../data/recipes';
import { fetchRecommendation } from '../api';
import { transformForUI } from '../transform';
import { criteriaForGear } from '../gearPresets';

export default function RecipeScreen() {
  const dispatch = useDispatch();
  const [filter, setFilter] = useState(null);

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
      const result = transformForUI(apiResponse, recipe.mood);
      result.bestMatch.name = recipe.name;
      result.bestMatch.recipeId = recipe.id;
      dispatch({ type: 'SET_RESULT', result, apiResponse });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: err.message });
    }
  }

  return (
    <div className="screen">
      <h2 className="screen-heading">Lighting Recipes</h2>

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
        {filtered.map(recipe => (
          <button
            key={recipe.id}
            className="intent-card"
            onClick={() => selectRecipe(recipe)}
          >
            <span className="intent-card__text">
              <strong>{recipe.name}</strong>
              <small>{recipe.description}</small>
              {recipe.patternPreview && (
                <span className="best-match__pattern" style={{ marginTop: 4, alignSelf: 'flex-start' }}>
                  {recipe.patternPreview}
                </span>
              )}
            </span>
            <span className="intent-card__arrow">{'\u203A'}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
