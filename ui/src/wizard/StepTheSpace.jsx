import { useEffect, useState } from 'react';
import { useAppState, useDispatch } from '../context/AppContext';
import ChipSelect from '../components/ChipSelect';
import IntentCard from '../components/IntentCard';
import { ENVIRONMENTS, NON_STUDIO_ENVIRONMENTS } from '../data/environments';
import { ROOM_PRESETS } from '../data/roomPresets';
import CameraMeasure from '../components/CameraMeasure';
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
  // legacy
  studio:        '10_12',
  office:        '8_9',
  small_room:    'under_8',
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

/**
 * Consolidated Step 2: "Where and with what?"
 * Combines: Environment + Ceiling + Room Dims + Gear Question
 *
 * If gearMode is already set (kit flow), gear question is hidden and
 * the standard Next button is used. Otherwise gear cards auto-advance.
 */
export default function StepTheSpace({ onNext }) {
  const { environment, ceilingHeight, roomDimensions, gearMode } = useAppState();
  const dispatch = useDispatch();

  const isOutdoor = NON_STUDIO_ENVIRONMENTS.includes(environment);
  const showGearQuestion = !gearMode; // hide if kit flow already set gear

  const [showRoomDims, setShowRoomDims] = useState(!!roomDimensions);
  const [lengthFt, setLengthFt] = useState(roomDimensions?.lengthFt || '');
  const [widthFt, setWidthFt] = useState(roomDimensions?.widthFt || '');
  const [ceilingFt, setCeilingFt] = useState(roomDimensions?.ceilingFt || '');
  const [showCamera, setShowCamera] = useState(false);

  const savedKit = hasKit();

  /* Environment is required before gear cards are active */
  const envReady = environment && (isOutdoor || ceilingHeight);

  // Auto-set ceiling for outdoor environments
  useEffect(() => {
    if (isOutdoor && ceilingHeight !== '12_plus') {
      dispatch({ type: 'SET_CEILING_HEIGHT', ceilingHeight: '12_plus' });
    }
  }, [isOutdoor, ceilingHeight, dispatch]);

  // Auto-default ceiling height for indoor environments
  useEffect(() => {
    if (environment && !isOutdoor && !ceilingHeight && DEFAULT_CEILING[environment]) {
      dispatch({ type: 'SET_CEILING_HEIGHT', ceilingHeight: DEFAULT_CEILING[environment] });
    }
  }, [environment, isOutdoor, ceilingHeight, dispatch]);

  // Save exact room dimensions when all three are valid
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

  function handlePreset(preset) {
    setLengthFt(String(preset.lengthFt));
    setWidthFt(String(preset.widthFt));
    setCeilingFt(String(preset.ceilingFt));
  }

  function handleCameraEstimate(est) {
    setLengthFt(String(est.lengthFt));
    setWidthFt(String(est.widthFt));
    setCeilingFt(String(est.ceilingFt));
    setShowCamera(false);
  }

  /* ── Gear question handlers ── */
  function pickGear(mode) {
    dispatch({ type: 'SET_GEAR_MODE', mode });
    if (mode === 'best_setup') {
      onNext(); // submit — this is the last step
    } else {
      dispatch({ type: 'WIZARD_NEXT' }); // go to gear_entry
    }
  }

  function useSavedKit() {
    const kit = loadKit();
    if (!kit) return;
    dispatch({ type: 'LOAD_GEAR_KIT', gear: kit });
    dispatch({ type: 'SET_GEAR_MODE', mode: 'my_gear' });
    onNext(); // submit with saved kit
  }

  return (
    <div className="consolidated-step">
      <h2 className="screen-heading">Where are you shooting?</h2>

      {/* ── Environment — grouped into Controlled / Natural ── */}
      <div className="consolidated-step__section">
        <div className="consolidated-step__label">Space</div>
        <div className="env-groups">
          <div className="env-group">
            <div className="env-group__label">Controlled</div>
            <div className="chip-grid">
              {ENVIRONMENTS.filter(e => ['studio_small','home_studio','studio_medium','studio_large'].includes(e.value)).map(opt => (
                <button
                  key={opt.value}
                  className={`chip${environment === opt.value ? ' chip--selected' : ''}`}
                  onClick={() => dispatch({ type: 'SET_ENVIRONMENT', environment: opt.value })}
                  type="button"
                >{opt.label}</button>
              ))}
            </div>
          </div>
          <div className="env-group">
            <div className="env-group__label">On Location</div>
            <div className="chip-grid">
              {ENVIRONMENTS.filter(e => ['on_location_indoor','on_location_outdoor','event'].includes(e.value)).map(opt => (
                <button
                  key={opt.value}
                  className={`chip${environment === opt.value ? ' chip--selected' : ''}`}
                  onClick={() => dispatch({ type: 'SET_ENVIRONMENT', environment: opt.value })}
                  type="button"
                >{opt.label}</button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Ceiling (indoor only) ── */}
      {environment && !isOutdoor && (
        <div className="consolidated-step__section">
          <div className="consolidated-step__label">Ceiling height</div>
          <ChipSelect
            options={INDOOR_CEILING}
            selected={ceilingHeight}
            onSelect={v => dispatch({ type: 'SET_CEILING_HEIGHT', ceilingHeight: v })}
          />

          {/* Expandable room dimensions */}
          {!showRoomDims ? (
            <button
              className="room-dims__toggle"
              onClick={() => setShowRoomDims(true)}
            >
              Set exact room dimensions
            </button>
          ) : (
            <div className="room-dims room-dims--wizard">
              <div className="room-dims__presets room-dims__presets--compact">
                {(typeof ROOM_PRESETS !== 'undefined' ? ROOM_PRESETS : []).slice(0, 4).map((p, i) => (
                  <button key={i} className="chip chip--small" onClick={() => handlePreset(p)}>
                    {p.icon} {p.label}
                  </button>
                ))}
              </div>
              <div className="room-dims__row">
                <label className="room-dims__inline-label">
                  L
                  <input type="number" className="room-dims__input room-dims__input--compact" value={lengthFt} onChange={e => setLengthFt(e.target.value)} placeholder="20" min="6" max="80" inputMode="decimal" />
                  <span className="room-dims__unit--inline">ft</span>
                </label>
                <span className="room-dims__x">{'\u00D7'}</span>
                <label className="room-dims__inline-label">
                  W
                  <input type="number" className="room-dims__input room-dims__input--compact" value={widthFt} onChange={e => setWidthFt(e.target.value)} placeholder="15" min="6" max="80" inputMode="decimal" />
                  <span className="room-dims__unit--inline">ft</span>
                </label>
                <span className="room-dims__x">{'\u00D7'}</span>
                <label className="room-dims__inline-label">
                  H
                  <input type="number" className="room-dims__input room-dims__input--compact" value={ceilingFt} onChange={e => setCeilingFt(e.target.value)} placeholder="10" min="6" max="30" inputMode="decimal" />
                  <span className="room-dims__unit--inline">ft</span>
                </label>
              </div>
              <button className="room-dims__camera-btn" onClick={() => setShowCamera(true)}>
                Use Camera to Measure
              </button>
              {showCamera && (
                <div className="room-dims__camera-overlay">
                  <CameraMeasure onEstimate={handleCameraEstimate} onClose={() => setShowCamera(false)} />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Gear question (only if gear not already set) ── */}
      {showGearQuestion && (
        <div className={`consolidated-step__section consolidated-step__gear${envReady ? '' : ' consolidated-step__gear--disabled'}`}>
          <div className="consolidated-step__label">Your gear — shapes the result</div>

          {savedKit && (
            <IntentCard
              icon={
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 11l3 3L22 4"/>
                  <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
                </svg>
              }
              label="Use Saved Kit"
              desc={kitSummary() || 'Your saved gear'}
              onClick={envReady ? useSavedKit : undefined}
            />
          )}

          <IntentCard
            icon={
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="9" width="20" height="12" rx="2"/>
                <path d="M8 9V6a4 4 0 0 1 8 0v2"/>
              </svg>
            }
            label="Use My Gear"
            desc="Build from what you own — adapted to this look"
            onClick={envReady ? () => pickGear('my_gear') : undefined}
          />
          <IntentCard
            icon={
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12,2 15,9 22,9 17,14 19,21 12,17 5,21 7,14 2,9 9,9"/>
              </svg>
            }
            label="Best Possible Setup"
            desc="Show me the ideal rig for this look"
            onClick={envReady ? () => pickGear('best_setup') : undefined}
          />
        </div>
      )}
    </div>
  );
}
