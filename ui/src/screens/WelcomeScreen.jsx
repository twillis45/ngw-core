import { useDispatch } from '../context/AppContext';
import IntentCard from '../components/IntentCard';

export default function WelcomeScreen() {
  const dispatch = useDispatch();

  function pickMatch() {
    dispatch({ type: 'SET_INTENT', intent: 'match' });
    dispatch({ type: 'NAVIGATE', screen: 'mood' });
  }

  function pickBuild() {
    dispatch({ type: 'SET_INTENT', intent: 'build' });
    dispatch({ type: 'NAVIGATE', screen: 'gear' });
  }

  return (
    <div className="screen">
      <h2 className="screen-heading">How are we shooting?</h2>

      <IntentCard
        emoji={'\u{1F3A8}'}
        label="Light a Mood"
        desc="Pick the vibe, we build the setup"
        onClick={pickMatch}
      />
      <IntentCard
        emoji={'\u{1F4F7}'}
        label="Use My Kit"
        desc="Tell us your gear, we dial it in"
        onClick={pickBuild}
      />
    </div>
  );
}
