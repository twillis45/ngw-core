import { useAppState, useDispatch } from '../context/AppContext';
import { MODIFIER_OPTIONS } from '../gearPresets';

export default function ModifierChips() {
  const { modifiers } = useAppState();
  const dispatch = useDispatch();

  function toggle(val) {
    dispatch({ type: 'TOGGLE_MODIFIER', modifier: val });
  }

  return (
    <div>
      <div className="section-label">What modifiers do you have?</div>
      <div className="chip-grid">
        {MODIFIER_OPTIONS.map(m => (
          <button
            key={m.value}
            className={`chip${modifiers.includes(m.value) ? ' chip--selected' : ''}`}
            onClick={() => toggle(m.value)}
            type="button"
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  );
}
