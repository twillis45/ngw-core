import { useAppState, useDispatch } from '../context/AppContext';

const MODES = [
  {
    id: null,
    icon: '\u2728',
    label: 'Default',
    tagline: 'Standard NGW recommendation — no creative bias',
  },
  {
    id: 'hurley',
    icon: '\uD83D\uDCA1',
    label: 'Hurley Mode',
    tagline: 'Clean commercial headshot — triangle catchlights, centered, repeatable',
  },
  {
    id: 'adler',
    icon: '\uD83D\uDC8E',
    label: 'Adler Mode',
    tagline: 'Fashion/beauty sculpting — beauty dish, strip rims, editorial precision',
  },
  {
    id: 'heisler',
    icon: '\uD83C\uDFAD',
    label: 'Heisler Mode',
    tagline: 'Analytical narrative portrait — motivated light, environment-aware, multi-light',
  },
  {
    id: 'bryce',
    icon: '\uD83C\uDF38',
    label: 'Bryce Mode',
    tagline: 'Soft feminine portrait — window light, wrap, gentle fill, emotional',
  },
  {
    id: 'caravaggio',
    icon: '\uD83D\uDD25',
    label: 'Caravaggio Mode',
    tagline: 'Dramatic chiaroscuro — single-source, deep shadow, minimal fill',
  },
  {
    id: 'penn',
    icon: '\uD83D\uDDBC\uFE0F',
    label: 'Penn Mode',
    tagline: 'Editorial minimalism — hard light, stark shadows, graphic precision',
  },
  {
    id: 'karsh',
    icon: '\uD83D\uDC51',
    label: 'Karsh Mode',
    tagline: 'Heroic portraiture — powerful key, Rembrandt triangle, deliberate separation',
  },
  {
    id: 'leibovitz',
    icon: '\uD83C\uDF0D',
    label: 'Leibovitz Mode',
    tagline: 'Complex editorial narrative — multi-light, environmental, emotionally layered',
  },
];

export default function StepMasterMode() {
  const { masterMode } = useAppState();
  const dispatch = useDispatch();

  return (
    <>
      <h2 className="screen-heading">Choose a Style</h2>
      <p className="step-subtitle">
        Optional: bias your setup toward a master photographer's approach.
      </p>
      <div className="master-mode-grid">
        {MODES.map(mode => (
          <button
            key={mode.id || 'default'}
            className={`master-mode-card${masterMode === mode.id ? ' master-mode-card--selected' : ''}`}
            onClick={() => dispatch({ type: 'SET_MASTER_MODE', masterMode: mode.id })}
          >
            <span className="master-mode-card__icon">{mode.icon}</span>
            <span className="master-mode-card__text">
              <strong>{mode.label}</strong>
              <small>{mode.tagline}</small>
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
