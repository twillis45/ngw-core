import { useAppState, useDispatch } from '../context/AppContext';
import { fetchShootMatch, uploadReferenceImage } from '../api';
import { transformShootMatch } from '../transform';
import WizardProgress from '../wizard/WizardProgress';
import StepMood from '../wizard/StepMood';
import StepTheShot from '../wizard/StepTheShot';
import StepTheSpace from '../wizard/StepTheSpace';
import StepTheGear from '../wizard/StepTheGear';
import StepGearEntry from '../wizard/StepGearEntry';
import StickyBottomBar from '../components/StickyBottomBar';
import { criteriaForGear } from '../gearPresets';
import { LIGHT_CATALOG, getGearProfile, getQualityTier } from '../data/lightCatalog';
import { saveKit } from '../data/kitStore';
import useSettings from '../hooks/useSettings';

const STEP_COMPONENTS = {
  mood: StepMood,
  the_shot: StepTheShot,
  the_space: StepTheSpace,
  the_gear: StepTheGear,
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
    case 'mood': return !!state.mood;
    case 'the_shot': return !!state.subjectType;
    case 'the_space': {
      if (!state.environment) return false;
      const envOk = OUTDOOR_ENVIRONMENTS.includes(state.environment) || !!state.ceilingHeight;
      // When the_gear is a separate step, space just needs env + ceiling
      if (state.wizardSteps?.includes('the_gear')) return envOk;
      // Legacy: gear question embedded — need gearMode to advance
      if (!state.gearMode) return false;
      return envOk;
    }
    case 'the_gear': return !!state.gearMode;
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
  const { powerDisplay, units } = useSettings();
  const { wizardSteps, wizardStep } = state;

  const currentStepName = wizardSteps[wizardStep] || 'mood';
  const StepComponent = STEP_COMPONENTS[currentStepName];
  const isLastStep = wizardStep === wizardSteps.length - 1;
  // Hide Next when gear cards handle navigation
  const showNextButton = !(currentStepName === 'the_space' && !state.gearMode && !state.wizardSteps?.includes('the_gear'))
    && !(currentStepName === 'the_gear' && !state.gearMode);

  async function handleNext() {
    // best_setup from gear step: always treat as final (skip gear_entry)
    const effectiveLastStep = isLastStep
      || (currentStepName === 'the_gear' && state.gearMode === 'best_setup');
    if (effectiveLastStep) {
      // edit_kit intent: save gear and go back to my_kit
      if (state.intent === 'edit_kit') {
        saveKit(state.gear);
        dispatch({ type: 'NAVIGATE', screen: 'my_kit' });
        return;
      }

      // Submit
      dispatch({ type: 'SET_LOADING', mode: 'match' });
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
        const result = transformShootMatch(apiResponse, { mood: effectiveMood, skinTone: state.skinTone, powerDisplay, units });

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

  const STEP_LABELS = ['The Vibe', 'The Shot', 'The Space', 'Your Gear'];
  const stepLabel = STEP_LABELS[wizardStep] || '';
  const nextLabel = (() => {
    if (state.intent === 'edit_kit') return 'Save Kit';
    if (isLastStep) {
      // gear_entry is about confirming your kit — not the analyze action
      if (currentStepName === 'gear_entry') return 'Confirm Gear';
      return 'Analyze Now';
    }
    return `Next  \u2014  ${STEP_LABELS[wizardStep + 1] || ''}`;
  })();

  return (
    <div className={`screen${showNextButton ? ' screen--has-footer' : ''}`}>
      {/* ── Figma: Cancel + STEP x OF y header ── */}
      <div className="wizard-header">
        <button
          type="button"
          className="wizard-header__back"
          onClick={wizardStep === 0
            ? () => dispatch({ type: 'NAVIGATE', screen: 'home' })
            : handleBack}
        >
          {wizardStep === 0 ? 'Cancel' : '< Back'}
        </button>
        <span className="wizard-header__step">
          STEP {wizardStep + 1} OF {wizardSteps.length}
        </span>
        <span className="wizard-header__spacer" />
      </div>
      <WizardProgress steps={wizardSteps} currentStep={wizardStep} />
      <StepComponent onNext={handleNext} />

      {showNextButton && (
        <StickyBottomBar>
          <button
            className="wizard-cta"
            disabled={!canAdvance(currentStepName, state)}
            onClick={handleNext}
          >
            {nextLabel}
          </button>
        </StickyBottomBar>
      )}
    </div>
  );
}
