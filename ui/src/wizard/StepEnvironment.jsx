import { useEffect, useState } from 'react';
import { useAppState, useDispatch } from '../context/AppContext';
import ChipSelect from '../components/ChipSelect';
import { ENVIRONMENTS, NON_STUDIO_ENVIRONMENTS } from '../data/environments';
import { ROOM_PRESETS } from '../data/roomPresets';
import CameraMeasure from '../components/CameraMeasure';

const INDOOR_CEILING = [
  { value: 'under_8', label: 'Under 8 ft' },
  { value: '8_9',     label: '8\u20139 ft' },
  { value: '10_12',   label: '10\u201312 ft' },
  { value: '12_plus', label: '12+ ft' },
];

/** Sensible ceiling defaults per environment so users can click through faster. */
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

export default function StepEnvironment() {
  const { environment, ceilingHeight, roomDimensions } = useAppState();
  const dispatch = useDispatch();

  const isOutdoor = NON_STUDIO_ENVIRONMENTS.includes(environment);

  const [showRoomDims, setShowRoomDims] = useState(!!roomDimensions);
  const [lengthFt, setLengthFt] = useState(roomDimensions?.lengthFt || '');
  const [widthFt, setWidthFt] = useState(roomDimensions?.widthFt || '');
  const [ceilingFt, setCeilingFt] = useState(roomDimensions?.ceilingFt || '');
  const [showCamera, setShowCamera] = useState(false);

  // Auto-set ceiling for outdoor environments
  useEffect(() => {
    if (isOutdoor && ceilingHeight !== '12_plus') {
      dispatch({ type: 'SET_CEILING_HEIGHT', ceilingHeight: '12_plus' });
    }
  }, [isOutdoor, ceilingHeight, dispatch]);

  // Auto-default ceiling height for indoor environments (user can still change it)
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

  return (
    <>
      <h2 className="screen-heading">Where's the shoot?</h2>
      <ChipSelect
        options={ENVIRONMENTS}
        selected={environment}
        onSelect={v => dispatch({ type: 'SET_ENVIRONMENT', environment: v })}
      />

      {environment && !isOutdoor && (
        <div className="ceiling-section">
          <div className="ceiling-section__label">How high's the ceiling?</div>
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
              <div className="room-dims__section-label">Room Dimensions</div>

              {/* Quick presets */}
              <div className="room-dims__presets room-dims__presets--compact">
                {ROOM_PRESETS.slice(0, 4).map((p, i) => (
                  <button key={i} className="chip chip--small" onClick={() => handlePreset(p)}>
                    {p.label}
                  </button>
                ))}
              </div>

              {/* L x W x H inputs */}
              <div className="room-dims__row">
                <label className="room-dims__inline-label">
                  L
                  <input
                    type="number"
                    className="room-dims__input room-dims__input--compact"
                    value={lengthFt}
                    onChange={e => setLengthFt(e.target.value)}
                    placeholder="20"
                    min="6"
                    max="80"
                    inputMode="decimal"
                  />
                  <span className="room-dims__unit--inline">ft</span>
                </label>
                <span className="room-dims__x">{'\u00D7'}</span>
                <label className="room-dims__inline-label">
                  W
                  <input
                    type="number"
                    className="room-dims__input room-dims__input--compact"
                    value={widthFt}
                    onChange={e => setWidthFt(e.target.value)}
                    placeholder="15"
                    min="6"
                    max="80"
                    inputMode="decimal"
                  />
                  <span className="room-dims__unit--inline">ft</span>
                </label>
                <span className="room-dims__x">{'\u00D7'}</span>
                <label className="room-dims__inline-label">
                  H
                  <input
                    type="number"
                    className="room-dims__input room-dims__input--compact"
                    value={ceilingFt}
                    onChange={e => setCeilingFt(e.target.value)}
                    placeholder="10"
                    min="6"
                    max="30"
                    inputMode="decimal"
                  />
                  <span className="room-dims__unit--inline">ft</span>
                </label>
              </div>

              {/* Camera measure button */}
              <button
                className="room-dims__camera-btn"
                onClick={() => setShowCamera(true)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6, verticalAlign: 'text-bottom' }}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>Use Camera to Measure
              </button>

              {showCamera && (
                <div className="room-dims__camera-overlay">
                  <CameraMeasure
                    onEstimate={handleCameraEstimate}
                    onClose={() => setShowCamera(false)}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}
