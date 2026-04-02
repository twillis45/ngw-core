import { useAppState, useDispatch } from '../context/AppContext';

export default function GearModeToggle() {
  const { gearMode } = useAppState();
  const dispatch = useDispatch();

  function set(mode) {
    dispatch({ type: 'SET_GEAR_MODE', mode });
  }

  return (
    <div className="gear-toggle">
      <button
        className={`gear-toggle__btn${gearMode === 'my_gear' ? ' gear-toggle__btn--active' : ''}`}
        onClick={() => set('my_gear')}
        type="button"
      >
        My Gear
      </button>
      <button
        className={`gear-toggle__btn${gearMode === 'best_setup' ? ' gear-toggle__btn--active' : ''}`}
        onClick={() => set('best_setup')}
        type="button"
      >
        Best Setup
      </button>
    </div>
  );
}
