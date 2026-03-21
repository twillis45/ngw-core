import { useAppState, useDispatch } from '../context/AppContext';
import { fetchShootMatch, uploadReferenceImage } from '../api';
import { transformShootMatch } from '../transform';
import WizardProgress from '../wizard/WizardProgress';
import StepTheShot from '../wizard/StepTheShot';
import StepTheSpace from '../wizard/StepTheSpace';
import StepGearEntry from '../wizard/StepGearEntry';
import StickyBottomBar from '../components/StickyBottomBar';
import { criteriaForGear } from '../gearPresets';
import { LIGHT_CATALOG, getGearProfile, getQualityTier } from '../data/lightCatalog';
import { saveKit } from '../data/kitStore';
import { loadSettings } from '../data/settingsStore';

const STEP_COMPONENTS = {
  the_shot: StepTheShot,
  the_space: StepTheSpace,
  gear_entry: StepGearEntry,
};

const OUTDOOR_ENVIRONMENTS = ['on_location_outdoor', 'on_location_indoor', 'event'];

const MOOD_LABELS = {
  beauty: 'Beauty', cinematic: 'Cinematic', corporate: 'Corporate',
  editorial: 'Editorial', natural: 'Natural', high_key: 'High Key', low_key: 'Low Key',
};

const MOD_LABELS = {
  beauty_dish: 'Beauty Dish', softbox: 'Softbox', umbrella: 'Umbrella',
  grid_spot: 'Grid', stripbox: 'Stripbox', barn_doors: 'Barn Doors',
  snoot: 'Snoot', reflector: 'Reflector', grid: 'Grid', bare: 'Bare Bulb',
};

function friendlyLightName(lightType) {
  for (const cat of LIGHT_CATALOG) {
    const item = cat.items.find(i => i.value === lightType);
    if (item) return `${item.vendor} ${item.model}`;
  }
  return lightType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function canAdvance(stepName, state) {
  switch (stepName) {
    case 'the_shot': return !!state.mood && !!state.subjectType;
    case 'the_space':
      // If gear question is shown (no gearMode), cards auto-advance — no Next button
      if (!state.gearMode) return false;
      // Kit flow: need environment + ceiling
      if (!state.environment) return false;
      return OUTDOOR_ENVIRONMENTS.includes(state.environment) || !!state.ceilingHeight;
    case 'gear_entry': {
      // Natural-light kits have 0 lights — allow proceeding with any gear (mods, support)
      const { lights, modifiers, support } = state.gear;
      return lights.length > 0 || modifiers.length > 0 || support.length > 0;
    }
    default: return true;
  }
}

function buildPayload(state) {
  const { gear, mood, subjectType, environment, ceilingHeight, gearMode, skinTone } = state;
  // If no lights were selected, treat as best_setup (handles React state batching)
  const isBestSetup = gearMode === 'best_setup' || (gearMode !== 'my_gear' && gear.lights.length === 0);
  const effectiveMood = mood || 'corporate';

  // Extract modifier type strings from {type, qty} objects
  const firstMod = gear.modifiers[0]?.type;
  const modTypes = gear.modifiers.map(m => m.type);

  let systems;
  if (isBestSetup) {
    const moodLabel = MOOD_LABELS[effectiveMood] || 'Studio';
    const modLabel = MOD_LABELS[firstMod] || 'Softbox';
    systems = [{
      id: 'system-best',
      name: `${moodLabel} ${modLabel} Setup`,
      criteria: { brightness: 9000, color_accuracy: 95, portability: 50, battery_life: 50, energy_efficiency: 80 },
      features: { dimmable: true, smart_ready: true, battery: true, waterproof: false },
      taxonomy_refs: {
        mood: effectiveMood,
        gear_profile: 'strobe_mono',
        modifier_family: firstMod || 'softbox',
      },
    }];
  } else {
    const moodLabel = MOOD_LABELS[effectiveMood] || 'Studio';
    const modLabel = MOD_LABELS[firstMod] || 'Softbox';
    // Sort lights by quality tier (highest first) so the best light wins as "best match"
    const sortedLights = [...gear.lights].sort((a, b) => getQualityTier(b.type) - getQualityTier(a.type));
    systems = sortedLights.map((light, i) => {
      const profile = getGearProfile(light.type);
      const tier = getQualityTier(light.type);
      return {
        id: `system-${i + 1}`,
        name: `${moodLabel} ${modLabel} Setup`,
        criteria: criteriaForGear(profile) || criteriaForGear('strobe_mono'),
        features: { dimmable: true, smart_ready: false, battery: false, waterproof: false },
        taxonomy_refs: {
          mood: effectiveMood,
          gear_profile: profile,
          modifier_family: firstMod || 'softbox',
        },
        metadata: { qualityTier: tier, lightType: light.type },
      };
    });
    // If no lights were added, fall back to one default
    if (systems.length === 0) {
      systems = [{
        id: 'system-1',
        name: 'Studio Strobe Setup',
        criteria: criteriaForGear('strobe_mono'),
        features: { dimmable: true, smart_ready: false, battery: false, waterproof: false },
        taxonomy_refs: { mood: effectiveMood, gear_profile: 'strobe_mono', modifier_family: 'softbox' },
      }];
    }
  }

  return {
    systems,
    input: { mood: effectiveMood, subject_type: subjectType, environment, ceiling_height: ceilingHeight, skin_tone: skinTone || null },
    metadata: {},
    modifiers_available: modTypes.length > 0
      ? modTypes
      : ['beauty_dish', 'softbox', 'umbrella', 'reflector', 'grid_spot', 'grid', 'stripbox', 'barn_doors', 'snoot', 'bare'],
  };
}

export default function SetupWizard() {
  const state = useAppState();
  const dispatch = useDispatch();
  const { wizardSteps, wizardStep } = state;

  const currentStepName = wizardSteps[wizardStep] || 'mood';
  const StepComponent = STEP_COMPONENTS[currentStepName];
  const isLastStep = wizardStep === wizardSteps.length - 1;
  // Hide Next when gear cards handle navigation (the_space without gearMode set)
  const showNextButton = !(currentStepName === 'the_space' && !state.gearMode);

  async function handleNext() {
    if (isLastStep) {
      // edit_kit intent: save gear and go back to my_kit
      if (state.intent === 'edit_kit') {
        saveKit(state.gear);
        dispatch({ type: 'NAVIGATE', screen: 'my_kit' });
        return;
      }

      // Submit
      dispatch({ type: 'SET_LOADING' });
      try {
        // Build payload for /api/shoot-match
        const effectiveMood = state.mood || 'corporate';
        const shootMatchPayload = {
          mood: effectiveMood,
          environment: state.environment || 'studio_large',
          subject: state.subjectType || 'headshot',
          ceiling: state.ceilingHeight || 'normal',
          gearMode: state.gearMode === 'my_gear' ? 'myGear' : 'anyGear',
          gear: (state.gear?.lights || []).map(l => l.type),
          skinTone: state.skinTone || null,
          masterMode: state.masterMode || null,
        };

        // Use already-uploaded reference image if available (from ref_eval screen)
        if (state.referenceImage?.serverPath) {
          shootMatchPayload.referenceImage = state.referenceImage.serverPath;
        } else if (state.referenceImage?.file) {
          try {
            const uploadResult = await uploadReferenceImage(state.referenceImage.file);
            shootMatchPayload.referenceImage = uploadResult.path;
          } catch {
            // Image upload is optional; continue without it
          }
        }

        // Pass pre-computed ref eval analysis so shoot-match anchors to the same
        // pattern detection instead of re-deriving it from a fresh analysis run.
        // This prevents divergence between what ref eval showed and the returned setup.
        if (state.refAnalysis) {
          shootMatchPayload.priorAnalysis = state.refAnalysis;
        }

        const apiResponse = await fetchShootMatch(shootMatchPayload);
        const { powerDisplay } = loadSettings();
        const result = transformShootMatch(apiResponse, { mood: effectiveMood, skinTone: state.skinTone, powerDisplay });

        // Attach reference image preview and full analysis from shoot-match response
        if (state.referenceImage?.preview) {
          result.referenceImage = state.referenceImage.preview;
        }
        if (apiResponse.referenceImageAnalysis) {
          result.referenceImageAnalysis = apiResponse.referenceImageAnalysis;
        }
        if (apiResponse.lightingIntelligence) {
          result.lightingIntelligence = apiResponse.lightingIntelligence;
        }

        dispatch({ type: 'SET_RESULT', result, apiResponse });
      } catch (err) {
        dispatch({ type: 'SET_ERROR', error: err.message });
      }
    } else {
      dispatch({ type: 'WIZARD_NEXT' });
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  }

  function handleBack() {
    dispatch({ type: 'WIZARD_BACK' });
  }

  if (!StepComponent) return null;

  return (
    <div className="screen">
      <WizardProgress steps={wizardSteps} currentStep={wizardStep} />
      <StepComponent onNext={handleNext} />

      {showNextButton && (
        <StickyBottomBar>
          <button
            className="btn btn--primary"
            disabled={!canAdvance(currentStepName, state)}
            onClick={handleNext}
          >
            {isLastStep ? (state.intent === 'edit_kit' ? 'Save Kit \u2192' : 'Run this setup \u2192') : 'Next \u2192'}
          </button>
        </StickyBottomBar>
      )}
    </div>
  );
}
