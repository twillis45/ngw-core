import { useAppState, useDispatch } from '../context/AppContext';
import { fetchRecommendation, fetchShootMatch } from '../api';
import { transformForUI, transformShootMatch } from '../transform';
import { criteriaForGear, GEAR_CRITERIA, GEAR_SHORT_NAMES } from '../gearPresets';

import GearModeToggle from '../components/GearModeToggle';
import LightEntry from '../components/LightEntry';
import ModifierChips from '../components/ModifierChips';
import StickyBottomBar from '../components/StickyBottomBar';

/** Build a photographer-friendly name for each light system.
 *  Priority: user-entered brand → gear-type short name.
 *  When multiple lights share a type, append a number (e.g. "Strobe 1"). */
function lightName(light, lights) {
  if (light.brand) return light.brand;

  const shortName = GEAR_SHORT_NAMES[light.type] || 'Light';
  const sameType = lights.filter((l) => l.type === light.type);
  if (sameType.length <= 1) return shortName;

  return `${shortName} ${sameType.indexOf(light) + 1}`;
}

/** Build the /recommend payload from current UI state. */
function buildPayload(state) {
  const { lights, modifiers, mood, gearMode } = state;

  const isBestSetup = gearMode === 'best_setup';
  const effectiveMood = mood || 'corporate';

  const systems = lights.map((light, i) => {
    const criteria = isBestSetup
      ? { brightness: 9000, color_accuracy: 95, portability: 50, battery_life: 50, energy_efficiency: 80 }
      : criteriaForGear(light.type);

    const features = isBestSetup
      ? { dimmable: true, smart_ready: true, battery: true, waterproof: false }
      : { ...light.features };

    return {
      id: light.id || `system-${i + 1}`,
      name: lightName(light, lights),
      criteria,
      features,
      taxonomy_refs: {
        mood: effectiveMood,
        gear_profile: light.type,
        modifier_family: modifiers[0] || 'softbox',
      },
    };
  });

  return {
    systems,
    input: { mood: effectiveMood },
    metadata: {},
    modifiers_available: modifiers.length > 0 ? modifiers : ['softbox', 'umbrella'],
  };
}

export default function GearInputScreen() {
  const state = useAppState();
  const dispatch = useDispatch();
  const { lights, gearMode } = state;
  const isBest = gearMode === 'best_setup';

  async function submit() {
    dispatch({ type: 'SET_LOADING' });

    try {
      // Use Shoot Match API when mood is set (wizard flow)
      if (state.mood && state.environment) {
        const wizardState = {
          subject: state.subject || 'headshot',
          mood: state.mood,
          environment: state.environment,
          ceiling: state.ceiling || 'normal',
          gearMode: gearMode === 'best_setup' ? 'anyGear' : 'myGear',
          gear: lights.map(l => l.type),
          ...(state.skinTone && { skinTone: state.skinTone }),
        };
        const apiResponse = await fetchShootMatch(wizardState);
        const result = transformShootMatch(apiResponse);
        dispatch({ type: 'SET_RESULT', result, apiResponse });
      } else {
        // Fallback: legacy /recommend flow
        const payload = buildPayload(state);
        const apiResponse = await fetchRecommendation(payload);
        const result = transformForUI(apiResponse, state.mood || 'corporate');
        dispatch({ type: 'SET_RESULT', result, apiResponse });
      }
    } catch (err) {
      dispatch({ type: 'SET_ERROR', error: err.message });
    }
  }

  return (
    <div className="screen">
      <h2 className="screen-heading">Your Gear</h2>

      <GearModeToggle />

      {!isBest && (
        <>
          <div className="section-label">What lights do you own?</div>
          {lights.map((light, i) => (
            <LightEntry
              key={light.id}
              light={light}
              index={i}
              canRemove={lights.length > 1}
              totalLights={lights.length}
            />
          ))}

          <button
            className="btn btn--ghost"
            onClick={() => dispatch({ type: 'ADD_LIGHT' })}
            style={{ marginTop: 12, marginBottom: 20 }}
            type="button"
          >
            + Add Another Light
          </button>
        </>
      )}

      {isBest && (
        <div className="result-card" style={{ marginBottom: 20 }}>
          <div className="result-card__header">
            <span className="result-card__icon">{'\u2728'}</span>
            <span>Best Possible Setup</span>
          </div>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-dim)', lineHeight: 1.5 }}>
            We'll calculate the ideal lighting using top-tier gear with all
            features enabled. Great for seeing what's possible before you
            compromise on budget.
          </p>
        </div>
      )}

      <ModifierChips />

      <StickyBottomBar>
        <button className="btn btn--primary" onClick={submit}>
          {isBest ? 'Show Me the Best \u2192' : 'Get My Setup \u2192'}
        </button>
      </StickyBottomBar>
    </div>
  );
}
