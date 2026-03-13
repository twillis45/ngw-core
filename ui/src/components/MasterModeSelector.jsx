import { useDispatch, useAppState } from '../context/AppContext';

/**
 * Master mode quick-selector — bottom sheet overlay.
 * Same data as StepMasterMode but in compact overlay format
 * for changing master mode from the header badge at any time.
 */

const MODES = [
  {
    id: null,
    icon: '\u2728',
    label: 'Default',
    tagline: 'Standard NGW recommendation',
  },
  {
    id: 'hurley',
    icon: '\uD83D\uDCA1',
    label: 'Hurley',
    tagline: 'Clean commercial headshot',
  },
  {
    id: 'adler',
    icon: '\uD83D\uDC8E',
    label: 'Adler',
    tagline: 'Fashion/beauty sculpting',
  },
  {
    id: 'heisler',
    icon: '\uD83C\uDFAD',
    label: 'Heisler',
    tagline: 'Narrative portrait',
  },
  {
    id: 'bryce',
    icon: '\uD83C\uDF38',
    label: 'Bryce',
    tagline: 'Soft feminine portrait',
  },
  {
    id: 'caravaggio',
    icon: '\uD83D\uDD25',
    label: 'Caravaggio',
    tagline: 'Dramatic chiaroscuro',
  },
  {
    id: 'penn',
    icon: '\uD83D\uDDBC\uFE0F',
    label: 'Penn',
    tagline: 'Editorial minimalism',
  },
  {
    id: 'karsh',
    icon: '\uD83D\uDC51',
    label: 'Karsh',
    tagline: 'Heroic portraiture',
  },
  {
    id: 'leibovitz',
    icon: '\uD83C\uDF0D',
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
