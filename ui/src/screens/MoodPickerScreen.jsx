import { useAppState, useDispatch } from '../context/AppContext';
import MoodTile from '../components/MoodTile';
import StickyBottomBar from '../components/StickyBottomBar';
import { MOOD_LIST } from '../coaching';

export default function MoodPickerScreen() {
  const { mood } = useAppState();
  const dispatch = useDispatch();

  function selectMood(value) {
    dispatch({ type: 'SET_MOOD', mood: value });
  }

  function next() {
    if (!mood) return;
    dispatch({ type: 'NAVIGATE', screen: 'environment' });
  }

  return (
    <div className="screen">
      <h2 className="screen-heading">What's the vibe?</h2>

      <div className="mood-grid">
        {MOOD_LIST.map(m => (
          <MoodTile
            key={m.value}
            emoji={m.emoji}
            label={m.label}
            desc={m.desc}
            selected={mood === m.value}
            onClick={() => selectMood(m.value)}
          />
        ))}
      </div>

      <StickyBottomBar>
        <button
          className="btn btn--primary"
          disabled={!mood}
          onClick={next}
        >
          Next: Location &rarr;
        </button>
      </StickyBottomBar>
    </div>
  );
}
