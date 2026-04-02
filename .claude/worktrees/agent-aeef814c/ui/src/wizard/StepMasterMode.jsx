import { useAppState, useDispatch } from '../context/AppContext';

const S = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' };

const MODES = [
  {
    id: null,
    icon: <svg {...S}><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>,
    label: 'Default',
    tagline: 'Standard NGW recommendation — no creative bias',
  },
  {
    id: 'hurley',
    icon: <svg {...S}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
    label: 'Hurley Mode',
    tagline: 'Clean commercial headshot — triangle catchlights, centered, repeatable',
  },
  {
    id: 'adler',
    icon: <svg {...S}><path d="M12 2L16 8H22L17 12.5L19 19L12 15L5 19L7 12.5L2 8H8L12 2Z"/></svg>,
    label: 'Adler Mode',
    tagline: 'Fashion/beauty sculpting — beauty dish, strip rims, editorial precision',
  },
  {
    id: 'heisler',
    icon: <svg {...S}><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M3 12h12"/></svg>,
    label: 'Heisler Mode',
    tagline: 'Analytical narrative portrait — motivated light, environment-aware, multi-light',
  },
  {
    id: 'bryce',
    icon: <svg {...S}><path d="M12 22C17.5 22 20 17.5 20 12S17.5 2 12 2 4 6.5 4 12s2.5 10 8 10z"/><path d="M12 6c0 3.31-2.69 6-6 6"/><path d="M12 6c0 3.31 2.69 6 6 6"/></svg>,
    label: 'Bryce Mode',
    tagline: 'Soft feminine portrait — window light, wrap, gentle fill, emotional',
  },
  {
    id: 'caravaggio',
    icon: <svg {...S}><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>,
    label: 'Caravaggio Mode',
    tagline: 'Dramatic chiaroscuro — single-source, deep shadow, minimal fill',
  },
  {
    id: 'penn',
    icon: <svg {...S}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>,
    label: 'Penn Mode',
    tagline: 'Editorial minimalism — hard light, stark shadows, graphic precision',
  },
  {
    id: 'karsh',
    icon: <svg {...S}><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>,
    label: 'Karsh Mode',
    tagline: 'Heroic portraiture — powerful key, Rembrandt triangle, deliberate separation',
  },
  {
    id: 'leibovitz',
    icon: <svg {...S}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>,
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
