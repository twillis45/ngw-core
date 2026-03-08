import { useAppState, useDispatch } from '../context/AppContext';
import StickyBottomBar from '../components/StickyBottomBar';

const ENVIRONMENTS = [
  { value: 'Small Room',    label: 'Small Room',    desc: 'Bedroom, office, tight space' },
  { value: 'Home Studio',   label: 'Home Studio',   desc: 'Garage, spare room with backdrop' },
  { value: 'Medium Studio', label: 'Medium Studio',  desc: 'Shared studio or rental' },
  { value: 'Large Studio',  label: 'Large Studio',   desc: 'Full commercial studio' },
  { value: 'Outdoor',       label: 'Outdoor',        desc: 'Park, street, rooftop' },
  { value: 'Window Light',  label: 'Window Light',   desc: 'Natural light from a window' },
  { value: 'Office',        label: 'Office',          desc: 'Corporate headshot on-location' },
];

const SKIN_TONES = [
  { value: 'light',  label: 'Light',  swatch: '#FDDBB4' },
  { value: 'medium', label: 'Medium', swatch: '#C68642' },
  { value: 'dark',   label: 'Dark',   swatch: '#8D5524' },
];

export default function EnvironmentScreen() {
  const { environment, skinTone } = useAppState();
  const dispatch = useDispatch();

  function selectEnv(value) {
    dispatch({ type: 'SET_ENVIRONMENT', environment: value });
  }

  function selectTone(value) {
    dispatch({ type: 'SET_SKIN_TONE', skinTone: value });
  }

  function next() {
    if (!environment) return;
    dispatch({ type: 'NAVIGATE', screen: 'gear' });
  }

  return (
    <div className="screen">
      <h2 className="screen-heading">Where are you shooting?</h2>

      <div className="env-grid">
        {ENVIRONMENTS.map(e => (
          <button
            key={e.value}
            className={`env-tile${environment === e.value ? ' env-tile--selected' : ''}`}
            onClick={() => selectEnv(e.value)}
            type="button"
          >
            <span className="env-tile__label">{e.label}</span>
            <span className="env-tile__desc">{e.desc}</span>
          </button>
        ))}
      </div>

      <h3 className="section-label" style={{ marginTop: 24 }}>Subject skin tone (optional)</h3>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginBottom: 12 }}>
        Helps fine-tune exposure and modifier recommendations.
      </p>

      <div className="tone-row">
        {SKIN_TONES.map(t => (
          <button
            key={t.value}
            className={`tone-chip${skinTone === t.value ? ' tone-chip--selected' : ''}`}
            onClick={() => selectTone(t.value)}
            type="button"
          >
            <span className="tone-chip__swatch" style={{ backgroundColor: t.swatch }} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      <StickyBottomBar>
        <button
          className="btn btn--primary"
          disabled={!environment}
          onClick={next}
        >
          Next: Your Gear &rarr;
        </button>
      </StickyBottomBar>
    </div>
  );
}
