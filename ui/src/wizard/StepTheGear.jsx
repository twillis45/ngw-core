import { useAppState, useDispatch } from '../context/AppContext';
import { loadKit, hasKit } from '../data/kitStore';
import { getLightDetails } from '../data/lightCatalog';
import { getModifierDetails } from '../data/modifierCatalog';

function kitSummary() {
  const kit = loadKit();
  if (!kit) return '';
  const parts = [];
  for (const l of kit.lights.slice(0, 3)) {
    const details = getLightDetails(l.type);
    const name = details ? `${details.vendor} ${details.model}` : l.type;
    parts.push(l.qty > 1 ? `${l.qty}\u00D7 ${name}` : name);
  }
  if (kit.lights.length > 3) parts.push(`+${kit.lights.length - 3} more`);
  for (const m of kit.modifiers.slice(0, 2)) {
    const mType = typeof m === 'string' ? m : m.type;
    const mod = getModifierDetails(mType);
    parts.push(mod ? mod.label : mType);
  }
  return parts.join(', ');
}

export default function StepTheGear({ onNext }) {
  const { gearMode } = useAppState();
  const dispatch = useDispatch();
  const savedKit = hasKit();

  function pickGear(mode) {
    dispatch({ type: 'SET_GEAR_MODE', mode });
    if (mode === 'best_setup') {
      // Skip gear_entry — submit directly
      onNext();
    }
    // 'my_gear' adds gear_entry to steps via reducer, Next button advances to it
  }

  function useSavedKit() {
    const kit = loadKit();
    if (!kit) return;
    dispatch({ type: 'LOAD_GEAR_KIT', gear: kit });
    dispatch({ type: 'SET_GEAR_MODE', mode: 'my_gear' });
    onNext();
  }

  return (
    <div className="step-gear">
      <span className="step-shot__section-label">YOUR GEAR</span>
      <h2 className="step-shot__heading">How do you want{'\n'}to build?</h2>
      <p className="step-gear__hint">
        Choose your own gear or let us design the ideal setup.
      </p>

      <div className="step-gear__options">
        {savedKit && (
          <button
            type="button"
            className={`step-gear__option${gearMode === 'saved_kit' ? ' step-gear__option--selected' : ''}`}
            onClick={useSavedKit}
          >
            <div className="step-gear__option-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z"/>
              </svg>
            </div>
            <div className="step-gear__option-text">
              <span className="step-gear__option-label">Use Saved Kit</span>
              <span className="step-gear__option-sub">{kitSummary()}</span>
            </div>
          </button>
        )}

        <button
          type="button"
          className={`step-gear__option${gearMode === 'my_gear' ? ' step-gear__option--selected' : ''}`}
          onClick={() => pickGear('my_gear')}
        >
          <div className="step-gear__option-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="7" width="20" height="14" rx="2"/>
              <path d="M16 7V5a4 4 0 00-8 0v2"/>
            </svg>
          </div>
          <div className="step-gear__option-text">
            <span className="step-gear__option-label">Use My Gear</span>
            <span className="step-gear__option-sub">Select from your lights and modifiers</span>
          </div>
        </button>

        <button
          type="button"
          className={`step-gear__option step-gear__option--accent${gearMode === 'best_setup' ? ' step-gear__option--selected' : ''}`}
          onClick={() => pickGear('best_setup')}
        >
          <div className="step-gear__option-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
          </div>
          <div className="step-gear__option-text">
            <span className="step-gear__option-label">Best Possible Setup</span>
            <span className="step-gear__option-sub">We design the ideal kit for your shot</span>
          </div>
        </button>
      </div>
    </div>
  );
}
