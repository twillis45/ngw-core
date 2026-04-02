import { useAppState, useDispatch } from '../context/AppContext';
import MoodTile from '../components/MoodTile';
import { MOOD_LIST } from '../coaching';
import { MOOD_ICONS } from '../components/MoodIcons';

export default function StepMood() {
  const { mood } = useAppState();
  const dispatch = useDispatch();

  return (
    <>
      <h2 className="screen-heading">What's the vibe?</h2>
      <div className="mood-grid">
        {MOOD_LIST.map(m => (
          <MoodTile
            key={m.value}
            icon={MOOD_ICONS[m.value]}
            label={m.label}
            desc={m.desc}
            selected={mood === m.value}
            onClick={() => dispatch({ type: 'SET_MOOD', mood: m.value })}
          />
        ))}
      </div>
    </>
  );
}
