import { useEffect, useState } from 'react';
import { useAppState, useDispatch } from '../context/AppContext';
import { ENVIRONMENTS, NON_STUDIO_ENVIRONMENTS } from '../data/environments';
import { loadKit, hasKit } from '../data/kitStore';
import { getLightDetails } from '../data/lightCatalog';
import { getModifierDetails } from '../data/modifierCatalog';

const INDOOR_CEILING = [
  { value: 'under_8', label: 'Under 8 ft' },
  { value: '8_9',     label: '8\u20139 ft' },
  { value: '10_12',   label: '10\u201312 ft' },
  { value: '12_plus', label: '12+ ft' },
];

const DEFAULT_CEILING = {
  studio_small:  'under_8',
  home_studio:   '8_9',
  studio_medium: '10_12',
  studio_large:  '12_plus',
  studio:        '10_12',
  office:        '8_9',
  small_room:    'under_8',
};

const DEFAULT_DIMS = {
  studio_small:  { l: 12, w: 10, c: 8 },
  home_studio:   { l: 15, w: 12, c: 9 },
  studio_medium: { l: 20, w: 15, c: 10 },
  studio_large:  { l: 30, w: 25, c: 12 },
};

function kitSummary() {
  const kit = loadKit();
  if (!kit) return '';
  const parts = [];
  for (const l of kit.lights.slice(0, 3)) {
    const details = getLightDetails(l.type);
    const name = details ? `${details.vendor} ${details.model}` : l.type;
    parts.push(l.qty > 1 ? `${l.qty}\u00D7 ${name}` : name);
  }
  if (kit.lights.length > 3) parts.push(`+${kit.lights.length - 3} more`);
  for (const m of kit.modifiers.slice(0, 2)) {
    const mType = typeof m === 'string' ? m : m.type;
    const mod = getModifierDetails(mType);
    parts.push(mod ? mod.label : mType);
  }
  return parts.join(', ');
}

/* ── Compact inline dimension field ── */
function DimField({ label, value, onChange }) {
  return (
    <label className="step-space__dim">
      <span className="step-space__dim-label">{label}</span>
      <div className="step-space__dim-input-wrap">
        <input
          type="number"
          className="step-space__dim-input"
          value={value}
          onChange={e => onChange(e.target.value)}
          min="6"
          max="80"
          inputMode="decimal"
        />
        <span className="step-space__dim-unit">ft</span>
      </div>
    </label>
  );
}

export default function StepTheSpace({ onNext }) {
  const { environment, ceilingHeight, roomDimensions, gearMode, wizardSteps } = useAppState();
  const dispatch = useDispatch();

  const isOutdoor = NON_STUDIO_ENVIRONMENTS.includes(environment);
  const showGearQuestion = !gearMode;

  const [lengthFt, setLengthFt] = useState(roomDimensions?.lengthFt || '');
  const [widthFt, setWidthFt] = useState(roomDimensions?.widthFt || '');
  const [ceilingFt, setCeilingFt] = useState(roomDimensions?.ceilingFt || '');

  const savedKit = hasKit();
  const envReady = environment && (isOutdoor || ceilingHeight);

  useEffect(() => {
    if (!environment) {
      dispatch({ type: 'SET_ENVIRONMENT', environment: 'studio_medium' });
    }
  }, [environment, dispatch]);

  useEffect(() => {
    if (environment && DEFAULT_DIMS[environment]) {
      const d = DEFAULT_DIMS[environment];
      setLengthFt(d.l);
      setWidthFt(d.w);
      setCeilingFt(d.c);
    } else if (environment) {
      setLengthFt('');
      setWidthFt('');
      setCeilingFt('');
    }
  }, [environment]);

  useEffect(() => {
    if (isOutdoor && ceilingHeight !== '12_plus') {
      dispatch({ type: 'SET_CEILING_HEIGHT', ceilingHeight: '12_plus' });
    }
  }, [isOutdoor, ceilingHeight, dispatch]);

  useEffect(() => {
    if (environment && !isOutdoor && DEFAULT_CEILING[environment]) {
      dispatch({ type: 'SET_CEILING_HEIGHT', ceilingHeight: DEFAULT_CEILING[environment] });
    }
  }, [environment, isOutdoor, ceilingHeight, dispatch]);

  useEffect(() => {
    const l = parseFloat(lengthFt);
    const w = parseFloat(widthFt);
    const c = parseFloat(ceilingFt);
    if (l >= 6 && w >= 6 && c >= 6) {
      dispatch({
        type: 'SET_ROOM_DIMENSIONS',
        dimensions: { lengthFt: l, widthFt: w, ceilingFt: c, source: 'manual' },
      });
    }
  }, [lengthFt, widthFt, ceilingFt, dispatch]);

  function pickGear(mode) {
    dispatch({ type: 'SET_GEAR_MODE', mode });
    if (mode === 'best_setup') {
      onNext();
    } else {
      dispatch({ type: 'WIZARD_NEXT' });
    }
  }

  function useSavedKit() {
    const kit = loadKit();
    if (!kit) return;
    dispatch({ type: 'LOAD_GEAR_KIT', gear: kit });
    dispatch({ type: 'SET_GEAR_MODE', mode: 'my_gear' });
    onNext();
  }

  return (
    <div className="step-space">
      <span className="step-shot__section-label">THE SPACE</span>
      <h2 className="step-shot__heading">Describe your{'\n'}shooting space.</h2>

      {/* ── Room dimensions (compact 3-col row) ── */}
      <div className="step-space__dims">
        <DimField label="Length" value={lengthFt} onChange={setLengthFt} />
        <DimField label="Width" value={widthFt} onChange={setWidthFt} />
        <DimField label="Ceiling" value={ceilingFt} onChange={setCeilingFt} />
      </div>

      {/* ── Environment (as pills, reusing step-shot pill styles) ── */}
      <span className="step-shot__section-label">ENVIRONMENT</span>
      <div className="step-shot__pills">
        {ENVIRONMENTS.map(opt => (
          <button
            key={opt.value}
            type="button"
            className={`step-shot__pill${environment === opt.value ? ' step-shot__pill--selected' : ''}`}
            onClick={() => dispatch({ type: 'SET_ENVIRONMENT', environment: opt.value })}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* ── Ceiling height (indoor only, as pills) ── */}
      {environment && !isOutdoor && (
        <>
          <span className="step-shot__section-label">CEILING HEIGHT</span>
          <div className="step-shot__pills">
            {INDOOR_CEILING.map(opt => (
              <button
                key={opt.value}
                type="button"
                className={`step-shot__pill${ceilingHeight === opt.value ? ' step-shot__pill--selected' : ''}`}
                onClick={() => dispatch({ type: 'SET_CEILING_HEIGHT', ceilingHeight: opt.value })}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}

      {/* ── Gear CTAs (legacy — only shown when the_gear step is not in the wizard) ── */}
      {showGearQuestion && !wizardSteps?.includes('the_gear') && (
        <div className="step-space__gear-ctas">
          {savedKit && (
            <button
              type="button"
              className="step-space__gear-cta step-space__gear-cta--secondary"
              onClick={envReady ? useSavedKit : undefined}
              disabled={!envReady}
            >
              Use Saved Kit
            </button>
          )}
          <button
            type="button"
            className="step-space__gear-cta step-space__gear-cta--primary"
            onClick={envReady ? () => pickGear('my_gear') : undefined}
            disabled={!envReady}
          >
            Use My Gear
          </button>
          <button
            type="button"
            className="step-space__gear-cta step-space__gear-cta--accent"
            onClick={envReady ? () => pickGear('best_setup') : undefined}
            disabled={!envReady}
          >
            Best Possible Setup
          </button>
        </div>
      )}
    </div>
  );
}
