import { useDispatch } from '../context/AppContext';
import IntentCard from '../components/IntentCard';
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
    const mod = getModifierDetails(m);
    parts.push(mod ? mod.label : m);
  }
  return parts.join(', ');
}

export default function StepGearQuestion({ onNext }) {
  const dispatch = useDispatch();
  const savedKit = hasKit();

  function pick(mode) {
    dispatch({ type: 'SET_GEAR_MODE', mode });
    if (mode === 'best_setup') {
      onNext();
    } else {
      dispatch({ type: 'WIZARD_NEXT' });
    }
  }

  function useSavedKit() {
    const kit = loadKit();
    if (!kit) return;
    dispatch({ type: 'LOAD_GEAR_KIT', gear: kit });
    dispatch({ type: 'SET_GEAR_MODE', mode: 'my_gear' });
    onNext();
  }

  return (
    <>
      <h2 className="screen-heading">Building around your gear?</h2>

      {savedKit && (
        <IntentCard
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11l3 3L22 4"/>
              <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
            </svg>
          }
          label="Use Saved Kit"
          desc={kitSummary() || 'Your saved gear'}
          onClick={useSavedKit}
        />
      )}

      <IntentCard
        icon={
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="9" width="20" height="12" rx="2"/>
            <path d="M8 9V6a4 4 0 0 1 8 0v2"/>
          </svg>
        }
        label="Use My Gear"
        desc="We'll work with what you have"
        onClick={() => pick('my_gear')}
      />
      <IntentCard
        icon={
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12,2 15,9 22,9 17,14 19,21 12,17 5,21 7,14 2,9 9,9"/>
          </svg>
        }
        label="Best Possible Setup"
        desc="Show me the ideal rig"
        onClick={() => pick('best_setup')}
      />
    </>
  );
}
