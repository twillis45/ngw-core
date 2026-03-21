import { useDispatch, useAppState } from '../context/AppContext';

/**
 * Master mode quick-selector — bottom sheet overlay.
 * Same data as StepMasterMode but in compact overlay format
 * for changing master mode from the header badge at any time.
 */

const S = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' };

const MODES = [
  {
    id: null,
    icon: <svg {...S}><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>,
    label: 'Default',
    tagline: 'Standard NGW recommendation',
  },
  {
    id: 'hurley',
    icon: <svg {...S}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
    label: 'Hurley',
    tagline: 'Clean commercial headshot',
  },
  {
    id: 'adler',
    icon: <svg {...S}><path d="M12 2L16 8H22L17 12.5L19 19L12 15L5 19L7 12.5L2 8H8L12 2Z"/></svg>,
    label: 'Adler',
    tagline: 'Fashion/beauty sculpting',
  },
  {
    id: 'heisler',
    icon: <svg {...S}><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M3 12h12"/></svg>,
    label: 'Heisler',
    tagline: 'Narrative portrait',
  },
  {
    id: 'bryce',
    icon: <svg {...S}><path d="M12 22C17.5 22 20 17.5 20 12S17.5 2 12 2 4 6.5 4 12s2.5 10 8 10z"/><path d="M12 6c0 3.31-2.69 6-6 6"/><path d="M12 6c0 3.31 2.69 6 6 6"/></svg>,
    label: 'Bryce',
    tagline: 'Soft feminine portrait',
  },
  {
    id: 'caravaggio',
    icon: <svg {...S}><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>,
    label: 'Caravaggio',
    tagline: 'Dramatic chiaroscuro',
  },
  {
    id: 'penn',
    icon: <svg {...S}><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>,
    label: 'Penn',
    tagline: 'Editorial minimalism',
  },
  {
    id: 'karsh',
    icon: <svg {...S}><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>,
    label: 'Karsh',
    tagline: 'Heroic portraiture',
  },
  {
    id: 'leibovitz',
    icon: <svg {...S}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>,
    label: 'Leibovitz',
    tagline: 'Complex editorial narrative',
  },
];

/** Map id → display data for header badge */
export const MASTER_MODE_MAP = Object.fromEntries(
  MODES.filter(m => m.id).map(m => [m.id, m])
);

export default function MasterModeSelector({ open, onClose }) {
  const { masterMode } = useAppState();
  const dispatch = useDispatch();

  if (!open) return null;

  function handleSelect(modeId) {
    dispatch({ type: 'SET_MASTER_MODE', masterMode: modeId });
    onClose();
  }

  return (
    <div className="master-selector-overlay" onClick={onClose}>
      <div className="master-selector" onClick={e => e.stopPropagation()}>
        <div className="master-selector__title">Lighting Style</div>

        {MODES.map(mode => (
          <button
            key={mode.id || 'default'}
            className={`master-selector__option${masterMode === mode.id ? ' master-selector__option--active' : ''}`}
            onClick={() => handleSelect(mode.id)}
          >
            <span className="master-selector__option-icon">{mode.icon}</span>
            <div>
              <span className="master-selector__option-label">{mode.label}</span>
              <br />
              <span className="master-selector__option-tagline">{mode.tagline}</span>
            </div>
          </button>
        ))}

        {masterMode && (
          <button
            className="master-selector__clear"
            onClick={() => handleSelect(null)}
          >
            Clear Style Preference
          </button>
        )}
      </div>
    </div>
  );
}
