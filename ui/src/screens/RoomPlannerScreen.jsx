import { useState, useEffect, useMemo } from 'react';
import { useAppState, useDispatch } from '../context/AppContext';
import FloorPlanCanvas from '../components/FloorPlanCanvas';
import CameraMeasure from '../components/CameraMeasure';
import { ROOM_PRESETS } from '../data/roomPresets';
import { checkRoomFit } from '../spatial/spatialEngine';

/**
 * RoomPlannerScreen — three-tab spatial calibration screen.
 *
 * Tab 1: Dimensions (manual entry + presets)
 * Tab 2: Camera Measure
 * Tab 3: Floor Plan (interactive canvas)
 */
export default function RoomPlannerScreen() {
  const { roomDimensions, result } = useAppState();
  const dispatch = useDispatch();

  const [tab, setTab] = useState('dims');  // 'dims' | 'camera' | 'plan'
  const [lengthFt, setLengthFt] = useState(roomDimensions?.lengthFt || '');
  const [widthFt, setWidthFt] = useState(roomDimensions?.widthFt || '');
  const [ceilingFt, setCeilingFt] = useState(roomDimensions?.ceilingFt || '');
  const [warnings, setWarnings] = useState([]);
  const [subjectPos, setSubjectPos] = useState(null);
  const [cameraPos, setCameraPos] = useState(null);
  const [showCamera, setShowCamera] = useState(false);

  const parsedLength = parseFloat(lengthFt) || 0;
  const parsedWidth = parseFloat(widthFt) || 0;
  const parsedCeiling = parseFloat(ceilingFt) || 0;
  const dims = useMemo(
    () => ({ lengthFt: parsedLength, widthFt: parsedWidth, ceilingFt: parsedCeiling }),
    [parsedLength, parsedWidth, parsedCeiling]
  );
  const dimsValid = dims.lengthFt >= 6 && dims.widthFt >= 6 && dims.ceilingFt >= 6;

  // Space needs from current result
  const spaceNeeds = result?.spaceCheck;

  // Room fit comparison
  const roomFit = dimsValid && spaceNeeds
    ? checkRoomFit(dims, spaceNeeds)
    : null;

  // Diagram spec from result (result.diagram has { lights, subject, camera })
  const diagramSpec = result?.diagram || null;

  /* ── Save dimensions to AppContext ──────────────────── */

  function saveDimensions() {
    if (!dimsValid) return;
    dispatch({
      type: 'SET_ROOM_DIMENSIONS',
      dimensions: { ...dims, source: 'manual' },
    });
  }

  // Auto-save when dimensions change and are valid
  useEffect(() => {
    if (dimsValid) saveDimensions();
  }, [lengthFt, widthFt, ceilingFt]);

  /* ── Camera estimate callback ───────────────────────── */

  function handleCameraEstimate(est) {
    setLengthFt(String(est.lengthFt));
    setWidthFt(String(est.widthFt));
    setCeilingFt(String(est.ceilingFt));
    dispatch({
      type: 'SET_ROOM_DIMENSIONS',
      dimensions: {
        lengthFt: est.lengthFt,
        widthFt: est.widthFt,
        ceilingFt: est.ceilingFt,
        source: 'camera',
      },
    });
    setShowCamera(false);
    setTab('dims');
  }

  /* ── Apply and navigate back ────────────────────────── */

  function handleApply() {
    if (dimsValid) {
      saveDimensions();
      if (subjectPos) {
        dispatch({ type: 'SET_FLOOR_PLAN', plan: { subjectPos, cameraPos } });
      }
    }
    dispatch({ type: 'GO_BACK' });
  }

  function handleBack() {
    dispatch({ type: 'GO_BACK' });
  }

  /* ── Stepper input helper ───────────────────────────── */

  function StepperInput({ label, value, onChange, min = 6, max = 80, step = 1, unit = 'ft' }) {
    const numVal = parseFloat(value) || 0;
    return (
      <div className="room-dims__field">
        <label className="room-dims__label">{label}</label>
        <div className="room-dims__stepper">
          <button
            className="room-dims__step-btn"
            onClick={() => onChange(String(Math.max(min, numVal - step)))}
            disabled={numVal <= min}
          >
            {'\u2212'}
          </button>
          <input
            type="number"
            className="room-dims__input"
            value={value}
            onChange={e => onChange(e.target.value)}
            min={min}
            max={max}
            step={step}
            inputMode="decimal"
          />
          <span className="room-dims__unit">{unit}</span>
          <button
            className="room-dims__step-btn"
            onClick={() => onChange(String(Math.min(max, numVal + step)))}
            disabled={numVal >= max}
          >
            +
          </button>
        </div>
      </div>
    );
  }

  /* ── Render ─────────────────────────────────────────── */

  return (
    <div className="screen room-planner">
      {/* Header */}
      <div className="room-planner__header">
        <button className="room-planner__back" onClick={handleBack}>{'\u25C0'} Back</button>
        <h2 className="room-planner__title">{'\uD83D\uDCD0'} Room Planner</h2>
      </div>

      {/* Tabs */}
      <div className="room-planner__tabs">
        <button
          className={`room-planner__tab ${tab === 'dims' ? 'room-planner__tab--active' : ''}`}
          onClick={() => { setTab('dims'); setShowCamera(false); }}
        >
          Dimensions
        </button>
        <button
          className={`room-planner__tab ${tab === 'camera' ? 'room-planner__tab--active' : ''}`}
          onClick={() => setTab('camera')}
        >
          {'\uD83D\uDCF7'} Camera
        </button>
        <button
          className={`room-planner__tab ${tab === 'plan' ? 'room-planner__tab--active' : ''}`}
          onClick={() => setTab('plan')}
          disabled={!dimsValid}
        >
          Floor Plan
        </button>
      </div>

      {/* ── Tab: Dimensions ── */}
      {tab === 'dims' && !showCamera && (
        <div className="room-planner__content">
          {/* Presets */}
          <div className="room-dims__presets">
            {ROOM_PRESETS.map((p, i) => (
              <button
                key={i}
                className="chip"
                onClick={() => {
                  setLengthFt(String(p.lengthFt));
                  setWidthFt(String(p.widthFt));
                  setCeilingFt(String(p.ceilingFt));
                }}
              >
                {p.icon} {p.label}
              </button>
            ))}
          </div>

          {/* Inputs */}
          <div className="room-dims">
            <StepperInput label="Room Length (depth)" value={lengthFt} onChange={setLengthFt} />
            <StepperInput label="Room Width" value={widthFt} onChange={setWidthFt} />
            <StepperInput label="Ceiling Height" value={ceilingFt} onChange={setCeilingFt} min={6} max={30} />
          </div>

          {/* Camera measure button */}
          <button
            className="btn btn--secondary room-planner__camera-btn"
            onClick={() => setShowCamera(true)}
          >
            {'\uD83D\uDCF7'} Use Camera to Estimate
          </button>

          {/* Room fit comparison */}
          {roomFit && (
            <div className="room-fit">
              <div className="room-fit__header">Your Room vs. Setup Needs</div>
              <div className={`room-fit__row ${roomFit.ceilingFits ? 'room-fit__row--pass' : 'room-fit__row--fail'}`}>
                <span>{roomFit.ceilingFits ? '\u2705' : '\u274C'}</span>
                <span>Ceiling: {dims.ceilingFt} ft</span>
                <span className="room-fit__need">needs {spaceNeeds.minCeilingFt} ft</span>
              </div>
              <div className={`room-fit__row ${roomFit.widthFits ? 'room-fit__row--pass' : 'room-fit__row--fail'}`}>
                <span>{roomFit.widthFits ? '\u2705' : '\u274C'}</span>
                <span>Width: {dims.widthFt} ft</span>
                <span className="room-fit__need">needs {spaceNeeds.minWidthFt} ft</span>
              </div>
              <div className={`room-fit__row ${roomFit.depthFits ? 'room-fit__row--pass' : 'room-fit__row--fail'}`}>
                <span>{roomFit.depthFits ? '\u2705' : '\u274C'}</span>
                <span>Depth: {dims.lengthFt} ft</span>
                <span className="room-fit__need">needs {spaceNeeds.minDepthFt} ft</span>
              </div>
              {roomFit.issues.length > 0 && (
                <div className="room-fit__issues">
                  {roomFit.issues.map((issue, i) => (
                    <div key={i} className="room-fit__issue">{'\u26A0\uFE0F'} {issue}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* View floor plan button */}
          {dimsValid && diagramSpec && (
            <button
              className="btn btn--primary room-planner__plan-btn"
              onClick={() => setTab('plan')}
            >
              View Floor Plan {'\u2192'}
            </button>
          )}
        </div>
      )}

      {/* Camera measure overlay */}
      {(tab === 'dims' && showCamera) && (
        <CameraMeasure
          onEstimate={handleCameraEstimate}
          onClose={() => setShowCamera(false)}
        />
      )}

      {/* ── Tab: Camera ── */}
      {tab === 'camera' && (
        <div className="room-planner__content">
          <CameraMeasure
            onEstimate={handleCameraEstimate}
            onClose={() => setTab('dims')}
          />
        </div>
      )}

      {/* ── Tab: Floor Plan ── */}
      {tab === 'plan' && dimsValid && (
        <div className="room-planner__content">
          {diagramSpec ? (
            <FloorPlanCanvas
              roomDims={dims}
              diagramSpec={diagramSpec}
              subjectPos={subjectPos}
              cameraPos={cameraPos}
              onSubjectMove={setSubjectPos}
              onCameraMove={setCameraPos}
              onWarnings={setWarnings}
            />
          ) : (
            <div className="room-planner__no-setup">
              <p>Run a lighting recommendation first to see your setup on the floor plan.</p>
              <button className="btn btn--secondary" onClick={handleBack}>Go Back</button>
            </div>
          )}

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="floor-plan__warnings">
              {warnings.map((w, i) => (
                <div key={i} className="floor-plan__warning">
                  {'\u26A0\uFE0F'} {w}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sticky apply bar */}
      {dimsValid && (
        <div className="room-planner__action-bar">
          <button className="btn btn--primary" onClick={handleApply}>
            {'\u2713'} Apply & Close
          </button>
        </div>
      )}
    </div>
  );
}
