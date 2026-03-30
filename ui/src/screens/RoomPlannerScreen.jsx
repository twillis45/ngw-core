import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useAppState, useDispatch } from '../context/AppContext';
import FloorPlanCanvas from '../components/FloorPlanCanvas';
import CameraMeasure from '../components/CameraMeasure';
import { ROOM_PRESETS } from '../data/roomPresets';
import { checkRoomFit } from '../spatial/spatialEngine';
import useSettings from '../hooks/useSettings';
import { formatRoomDim } from '../utils/units';

/**
 * Name the lighting pattern based on key light angle.
 * Returns a short, photographer-friendly label.
 */
function getPatternName(absAngle) {
  if (absAngle < 15)       return 'Flat / Front';
  if (absAngle < 35)  return 'Loop';
  if (absAngle < 55)  return 'Rembrandt';
  if (absAngle < 75)  return 'Short / Broad';
  if (absAngle < 100) return 'Split';
  if (absAngle < 135) return 'Rim';
  return 'Back';
}

/**
 * RoomPlannerScreen — Figma-aligned single-view layout.
 *
 * Structure:
 *   Header  →  dim-bar (compact)  →  floor-plan canvas  →  light list  →  CTA
 *
 * When no setup is loaded the canvas shows an empty room with dim editing
 * and preset selection. When a setup exists, lights are plotted and the
 * room-fit check becomes available.
 */
export default function RoomPlannerScreen() {
  const { roomDimensions, result } = useAppState();
  const dispatch = useDispatch();
  const { units } = useSettings();
  const isMetric = units === 'metric';

  // Conversion helpers — internal state is always in feet
  const toDisplay = (ft) => isMetric ? String((parseFloat(ft) * 0.3048).toFixed(1)) : String(ft || '');
  const fromDisplay = (v) => isMetric ? String(parseFloat(v) / 0.3048) : v;
  const stepUnit = isMetric ? 'm' : 'ft';
  const dimStep = isMetric ? 0.5 : 1;
  const dimMin  = isMetric ? 2   : 6;
  const dimMax  = isMetric ? 24  : 80;
  const ceilMax = isMetric ? 9   : 30;
  const fmt = (ft) => formatRoomDim(ft, units);

  const [editing, setEditing] = useState(false);
  const [lengthFt, setLengthFt] = useState(roomDimensions?.lengthFt || '');
  const [widthFt, setWidthFt] = useState(roomDimensions?.widthFt || '');
  const [ceilingFt, setCeilingFt] = useState(roomDimensions?.ceilingFt || '');
  const [showCamera, setShowCamera] = useState(false);
  const [showFitResult, setShowFitResult] = useState(false);
  const [subjectPos, setSubjectPos] = useState(null);
  const [cameraPos, setCameraPos] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [guidance, setGuidance] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [guidanceFlash, setGuidanceFlash] = useState(false);
  const prevGuidanceRef = useRef(null);
  const [patternChange, setPatternChange] = useState(null); // { from, to, role }
  const prevPatternRef = useRef(null); // { key: patternName, fill: patternName }

  const parsedLength = parseFloat(lengthFt) || 0;
  const parsedWidth = parseFloat(widthFt) || 0;
  const parsedCeiling = parseFloat(ceilingFt) || 0;
  const dims = useMemo(
    () => ({ lengthFt: parsedLength, widthFt: parsedWidth, ceilingFt: parsedCeiling }),
    [parsedLength, parsedWidth, parsedCeiling]
  );
  const dimsValid = dims.lengthFt >= 6 && dims.widthFt >= 6 && dims.ceilingFt >= 6;

  // If no dims at all, start in editing mode
  useEffect(() => {
    if (!dimsValid) setEditing(true);
  }, []);

  // Flash the guidance section when values change (component was dragged)
  useEffect(() => {
    if (!guidance.length) return;
    const key = guidance.map(g => g.value).join('|');
    if (prevGuidanceRef.current && prevGuidanceRef.current !== key) {
      setGuidanceFlash(true);
      const t = setTimeout(() => setGuidanceFlash(false), 600);
      return () => clearTimeout(t);
    }
    prevGuidanceRef.current = key;
  }, [guidance]);

  // ── Pattern change detection — watch angle guidance for named threshold crossings ──
  // Banner stays visible until the light is dragged back to its original pattern.
  useEffect(() => {
    if (!guidance.length) return;
    // Extract angle rows for key and fill
    const angleRows = guidance.filter(g => g.label?.endsWith('Angle') && g.changed);
    if (!angleRows.length) {
      // No angle changes — light is back to original, dismiss any banner
      if (patternChange) setPatternChange(null);
      prevPatternRef.current = null;
      return;
    }
    for (const row of angleRows) {
      const isKey = row.label.startsWith('Key');
      const isFill = row.label.startsWith('Fill');
      const role = isKey ? 'key' : isFill ? 'fill' : null;
      if (!role) continue;

      // Parse current angle from value like "45° (was 30°)"
      const match = row.value?.match(/^(-?\d+)°\s*\(was\s*(-?\d+)°\)/);
      if (!match) continue;
      const currentAbs = Math.abs(parseInt(match[1], 10));
      const origAbs = Math.abs(parseInt(match[2], 10));

      const currentPattern = getPatternName(currentAbs);
      const origPattern = getPatternName(origAbs);

      // If light returned to its original pattern, dismiss the banner
      if (currentPattern === origPattern) {
        if (patternChange && patternChange.role === (role === 'key' ? 'Key' : 'Fill')) {
          setPatternChange(null);
          prevPatternRef.current = { ...prevPatternRef.current, [role]: null };
        }
        continue;
      }

      const prev = prevPatternRef.current?.[role] || origPattern;

      if (currentPattern !== prev) {
        // Pattern crossed a boundary — show / update banner
        prevPatternRef.current = { ...prevPatternRef.current, [role]: currentPattern };

        setPatternChange({
          from: origPattern,
          to: currentPattern,
          role: role === 'key' ? 'Key' : 'Fill',
        });
      }
    }
  }, [guidance]);

  // Setup data from result
  const diagramSpec = result?.diagram || null;
  const setupLights = result?.setup?.lights || [];
  const spaceNeeds = result?.spaceCheck;

  // Room fit comparison
  const roomFit = dimsValid && spaceNeeds ? checkRoomFit(dims, spaceNeeds) : null;

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
        lengthFt: est.lengthFt, widthFt: est.widthFt, ceilingFt: est.ceilingFt,
        source: 'camera',
      },
    });
    setShowCamera(false);
    setEditing(false);
  }

  /* ── Reset ──────────────────────────────────────────── */

  function handleReset() {
    setLengthFt('');
    setWidthFt('');
    setCeilingFt('');
    setEditing(true);
    setShowFitResult(false);
    setSubjectPos(null);
    setCameraPos(null);
  }

  /* ── Navigation ─────────────────────────────────────── */

  function handleBack() {
    dispatch({ type: 'GO_BACK' });
  }

  function handleApply() {
    if (dimsValid) {
      saveDimensions();
      dispatch({ type: 'SET_FLOOR_PLAN', plan: { subjectPos, cameraPos } });
    }
    // Navigate to setup sheet (apply the room data to the setup context)
    if (result) {
      dispatch({ type: 'NAVIGATE', screen: 'setup_sheet' });
    } else {
      dispatch({ type: 'GO_BACK' });
    }
  }

  function handleCheckFit() {
    setShowFitResult(true);
  }

  /* ── Light role colors ─────────────────────────────── */

  const ROLE_COLORS = {
    key:        '#D4A843',
    fill:       '#6BA4D4',
    rim:        '#A87ED4',
    hair:       '#D47EA8',
    background: '#5BBF8A',
  };

  function fitColor(lightRole) {
    if (!roomFit) return null;
    // Overall fit — green if room fits, amber if tight
    return roomFit.fits ? '#48ba88' : '#f59e34';
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
          >{'\u2212'}</button>
          <input
            type="number"
            className="room-dims__input"
            value={value}
            onChange={e => onChange(e.target.value)}
            min={min} max={max} step={step}
            inputMode="decimal"
          />
          <span className="room-dims__unit">{unit}</span>
          <button
            className="room-dims__step-btn"
            onClick={() => onChange(String(Math.min(max, numVal + step)))}
            disabled={numVal >= max}
          >+</button>
        </div>
      </div>
    );
  }

  /* ── Render ─────────────────────────────────────────── */

  // Camera measure overlay
  if (showCamera) {
    return (
      <div className="screen room-planner">
        <CameraMeasure
          onEstimate={handleCameraEstimate}
          onClose={() => setShowCamera(false)}
        />
      </div>
    );
  }

  const lightCount = setupLights.length;
  const dimSummary = dimsValid
    ? `${fmt(dims.lengthFt)}  ×  ${fmt(dims.widthFt)}  ×  ${fmt(dims.ceilingFt)}`
    : 'No dimensions set';

  return (
    <div className="screen room-planner">

      {/* ── Header ─────────────────────────────────── */}
      <div className="rp-header">
        <button className="rp-header__back" onClick={handleBack}>{'< Back'}</button>
        <h2 className="rp-header__title">Room Planner</h2>
        <button className="rp-header__reset" onClick={handleReset}>Reset</button>
      </div>

      {/* ── Dim bar (compact) ──────────────────────── */}
      <div className="rp-dimbar">
        {dimsValid && !editing && !showFitResult && (
          <span className="rp-dimbar__depth">{fmt(dims.lengthFt)}</span>
        )}
        {dimsValid && !editing && (
          <span className="rp-dimbar__summary">{dimSummary}</span>
        )}
        {!dimsValid && !editing && (
          <span className="rp-dimbar__summary rp-dimbar__summary--empty">Set room dimensions</span>
        )}
        <button className="rp-dimbar__edit" onClick={() => setEditing(!editing)}>
          {editing ? 'Done' : 'Edit'}
        </button>
      </div>

      {/* ── Dim editor (collapsible) ───────────────── */}
      {editing && (
        <div className="rp-dim-editor">
          {/* Presets */}
          <div className="rp-dim-editor__presets">
            {ROOM_PRESETS.map((p, i) => {
              const isActive = parsedLength === p.lengthFt && parsedWidth === p.widthFt && parsedCeiling === p.ceilingFt;
              return (
                <button
                  key={i}
                  className={`rp-preset${isActive ? ' rp-preset--active' : ''}`}
                  onClick={() => {
                    setLengthFt(String(p.lengthFt));
                    setWidthFt(String(p.widthFt));
                    setCeilingFt(String(p.ceilingFt));
                  }}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Manual steppers */}
          <div className="room-dims">
            <StepperInput
              label="Room Length (depth)"
              value={toDisplay(lengthFt)}
              onChange={v => setLengthFt(fromDisplay(v))}
              unit={stepUnit} step={dimStep} min={dimMin} max={dimMax}
            />
            <StepperInput
              label="Room Width"
              value={toDisplay(widthFt)}
              onChange={v => setWidthFt(fromDisplay(v))}
              unit={stepUnit} step={dimStep} min={dimMin} max={dimMax}
            />
            <StepperInput
              label="Ceiling Height"
              value={toDisplay(ceilingFt)}
              onChange={v => setCeilingFt(fromDisplay(v))}
              unit={stepUnit} step={dimStep} min={dimMin} max={ceilMax}
            />
          </div>

          <button className="rp-dim-editor__camera" onClick={() => setShowCamera(true)}>
            Use Camera to Estimate
          </button>
        </div>
      )}

      {/* ── Canvas ─────────────────────────────────── */}
      {dimsValid && !editing && (
        <div className="rp-canvas-wrap">
          <FloorPlanCanvas
            roomDims={dims}
            diagramSpec={diagramSpec}
            subjectPos={subjectPos}
            cameraPos={cameraPos}
            onSubjectMove={setSubjectPos}
            onCameraMove={setCameraPos}
            onLightMove={(idx, pos) => {}}
            onWarnings={setWarnings}
            onGuidance={setGuidance}
            onItemSelect={setSelectedItem}
            fitColors={showFitResult && roomFit ? roomFit : null}
          />
        </div>
      )}

      {/* ── Empty canvas placeholder ───────────────── */}
      {!dimsValid && !editing && (
        <div className="rp-canvas-wrap rp-canvas-wrap--empty">
          <p className="rp-canvas-wrap__hint">Enter room dimensions to see the floor plan.</p>
        </div>
      )}

      {/* ── Pattern change banner ────────────────────── */}
      {patternChange && (
        <div className="rp-pattern-banner" onClick={() => setPatternChange(null)}>
          <div className="rp-pattern-banner__icon">⚡</div>
          <div className="rp-pattern-banner__body">
            <span className="rp-pattern-banner__title">Lighting Pattern Changed</span>
            <span className="rp-pattern-banner__detail">
              {patternChange.role} light moved from <strong>{patternChange.from}</strong> to <strong>{patternChange.to}</strong>
            </span>
          </div>
          <button className="rp-pattern-banner__dismiss" type="button" aria-label="Dismiss">×</button>
        </div>
      )}

      {/* ── Cockpit panel (replaces light list when selected) ── */}
      {selectedItem && !editing && dimsValid && !showFitResult && (
        <div className="cockpit-panel">
          <div className="cockpit-panel__card">
            {selectedItem.type === 'light' && (() => {
              const light = setupLights[selectedItem.index];
              if (!light) return null;
              const role = light._role || light.role || '';
              const color = ROLE_COLORS[role] || 'var(--color-text-secondary)';
              return (
                <>
                  <div className="cockpit-panel__role-row">
                    <span className="cockpit-panel__dot" style={{ background: color }} />
                    <span className="cockpit-panel__role" style={{ color }}>{role}</span>
                  </div>
                  <div className="cockpit-panel__title">
                    {light.label || role.charAt(0).toUpperCase() + role.slice(1) + ' Light'}
                  </div>
                  <div className="cockpit-panel__divider" />
                  <div className="cockpit-panel__grid">
                    {light.modifier && (
                      <div className="cockpit-panel__spec">
                        <span className="cockpit-panel__spec-label">Modifier</span>
                        <span className="cockpit-panel__spec-value">{light.modifier}</span>
                      </div>
                    )}
                    {light.distanceFt && (
                      <div className="cockpit-panel__spec">
                        <span className="cockpit-panel__spec-label">Distance</span>
                        <span className="cockpit-panel__spec-value">{fmt(light.distanceFt)}</span>
                      </div>
                    )}
                    {light.heightFt && (
                      <div className="cockpit-panel__spec">
                        <span className="cockpit-panel__spec-label">Height</span>
                        <span className="cockpit-panel__spec-value">{fmt(light.heightFt)}</span>
                      </div>
                    )}
                    {light.angleDeg != null && (
                      <div className="cockpit-panel__spec">
                        <span className="cockpit-panel__spec-label">Angle</span>
                        <span className="cockpit-panel__spec-value">{light.angleDeg}°</span>
                      </div>
                    )}
                    {light.power && (
                      <div className="cockpit-panel__spec">
                        <span className="cockpit-panel__spec-label">Power</span>
                        <span className="cockpit-panel__spec-value">{light.power}</span>
                      </div>
                    )}
                    {light.positionText && (
                      <div className="cockpit-panel__spec">
                        <span className="cockpit-panel__spec-label">Position</span>
                        <span className="cockpit-panel__spec-value">{light.positionText}</span>
                      </div>
                    )}
                  </div>
                  {light.notes && (
                    <div className="cockpit-panel__notes">
                      <p className="cockpit-panel__note">{light.notes}</p>
                    </div>
                  )}
                </>
              );
            })()}
            {selectedItem.type === 'subject' && (
              <>
                <div className="cockpit-panel__role-row">
                  <span className="cockpit-panel__dot" style={{ background: 'var(--color-text)' }} />
                  <span className="cockpit-panel__role">SUBJECT</span>
                </div>
                <div className="cockpit-panel__title">Subject Position</div>
                <div className="cockpit-panel__divider" />
                <div className="cockpit-panel__grid">
                  <div className="cockpit-panel__spec">
                    <span className="cockpit-panel__spec-label">From Left Wall</span>
                    <span className="cockpit-panel__spec-value">{fmt(Math.round((subjectPos?.x || 0) * 10) / 10)}</span>
                  </div>
                  <div className="cockpit-panel__spec">
                    <span className="cockpit-panel__spec-label">From Back Wall</span>
                    <span className="cockpit-panel__spec-value">{fmt(Math.round((subjectPos?.y || 0) * 10) / 10)}</span>
                  </div>
                </div>
                <div className="cockpit-panel__hint">
                  <span className="cockpit-panel__hint-label">Tip</span>
                  <span className="cockpit-panel__hint-body">Drag the subject to adjust distance from background and lights.</span>
                </div>
              </>
            )}
            {selectedItem.type === 'camera' && (
              <>
                <div className="cockpit-panel__role-row">
                  <span className="cockpit-panel__dot" style={{ background: 'var(--color-text-secondary)' }} />
                  <span className="cockpit-panel__role">CAMERA</span>
                </div>
                <div className="cockpit-panel__title">Camera Position</div>
                <div className="cockpit-panel__divider" />
                <div className="cockpit-panel__grid">
                  <div className="cockpit-panel__spec">
                    <span className="cockpit-panel__spec-label">From Left Wall</span>
                    <span className="cockpit-panel__spec-value">{fmt(Math.round((cameraPos?.x || dims.widthFt / 2) * 10) / 10)}</span>
                  </div>
                  <div className="cockpit-panel__spec">
                    <span className="cockpit-panel__spec-label">From Back Wall</span>
                    <span className="cockpit-panel__spec-value">{fmt(Math.round((cameraPos?.y || dims.lengthFt) * 10) / 10)}</span>
                  </div>
                  {diagramSpec?.camera?.height_m && (
                    <div className="cockpit-panel__spec">
                      <span className="cockpit-panel__spec-label">Height</span>
                      <span className="cockpit-panel__spec-value">
                        {isMetric
                          ? `${diagramSpec.camera.height_m.toFixed(1)} m`
                          : `${(diagramSpec.camera.height_m * 3.281).toFixed(1)} ft`}
                      </span>
                    </div>
                  )}
                </div>
                <div className="cockpit-panel__hint">
                  <span className="cockpit-panel__hint-label">Tip</span>
                  <span className="cockpit-panel__hint-body">Moving the camera closer tightens framing and increases background blur.</span>
                </div>
              </>
            )}
            {selectedItem.type === 'background' && (
              <>
                <div className="cockpit-panel__role-row">
                  <span className="cockpit-panel__dot" style={{ background: '#5BBF8A' }} />
                  <span className="cockpit-panel__role">BACKGROUND</span>
                </div>
                <div className="cockpit-panel__title">Backdrop</div>
                <div className="cockpit-panel__divider" />
                <div className="cockpit-panel__hint">
                  <span className="cockpit-panel__hint-label">Tip</span>
                  <span className="cockpit-panel__hint-body">Drag the backdrop horizontally to shift it. Move the subject away from the background for more separation and blur.</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Room Fit Result banner ─────────────────── */}
      {showFitResult && roomFit && (
        <div className={`rp-fit-badge ${roomFit.fits ? 'rp-fit-badge--pass' : 'rp-fit-badge--warn'}`}>
          <div className="rp-fit-badge__text">
            <span className="rp-fit-badge__title">
              {roomFit.fits ? 'Kit fits this space' : 'Space is tight'}
            </span>
            <span className="rp-fit-badge__sub">
              {roomFit.issues?.length
                ? `${roomFit.issues.length} constraint${roomFit.issues.length > 1 ? 's' : ''} flagged`
                : `${lightCount} light${lightCount !== 1 ? 's' : ''} within optimal range`
              }
            </span>
          </div>
          <button className="rp-fit-badge__ok" onClick={() => setShowFitResult(false)}>OK</button>
        </div>
      )}

      {/* ── Light list (hidden when cockpit panel is showing) ── */}
      {!editing && dimsValid && !selectedItem && (
        <div className="rp-lights">
          {lightCount > 0 && !showFitResult && (
            <p className="rp-lights__count">{lightCount} LIGHT{lightCount !== 1 ? 'S' : ''} PLACED</p>
          )}

          {setupLights.map((light, i) => {
            const color = showFitResult ? fitColor(light._role || light.role) : (ROLE_COLORS[light._role || light.role] || 'var(--color-text-secondary)');
            const rowClass = showFitResult ? 'rp-light-row rp-light-row--result' : 'rp-light-row';
            return (
              <div key={i} className={rowClass}>
                <span
                  className={`rp-light-row__dot${showFitResult ? '' : ' rp-light-row__dot--lg'}`}
                  style={{ background: color || 'var(--color-accent)' }}
                />
                <div className="rp-light-row__info">
                  <span className="rp-light-row__name">
                    {showFitResult
                      ? (light.label || light.role?.charAt(0).toUpperCase() + light.role?.slice(1) + ' light')
                      : `${light.label || light.role?.charAt(0).toUpperCase() + light.role?.slice(1)} — ${light.modifier || ''}`
                    }
                  </span>
                  <span className="rp-light-row__meta">
                    {`${light.distanceFt || ''}  ·  ${light.positionText || ''}`}
                  </span>
                </div>
                {!showFitResult && (
                  <span className="rp-light-row__dismiss">&times;</span>
                )}
              </div>
            );
          })}

          {lightCount === 0 && !showFitResult && (
            <p className="rp-lights__empty">Run an analysis to see lights plotted on the floor plan.</p>
          )}
        </div>
      )}

      {/* ── Warnings ───────────────────────────────── */}
      {warnings.length > 0 && (
        <div className="rp-warnings">
          {warnings.map((w, i) => (
            <div key={i} className="rp-warnings__item">⚠ {w}</div>
          ))}
        </div>
      )}

      {/* ── Spatial guidance ─────────────────────────── */}
      {!editing && dimsValid && guidance.length > 0 && !showFitResult && (
        <div className={`rp-guidance${guidanceFlash ? ' rp-guidance--flash' : ''}`}>
          <p className="rp-guidance__title">HOW THIS AFFECTS YOUR IMAGE</p>
          {guidance.map((g, i) => {
            const rowClass = g.warn
              ? 'rp-guidance__row rp-guidance__row--warn'
              : g.changed
                ? 'rp-guidance__row rp-guidance__row--changed'
                : 'rp-guidance__row';
            return (
              <div key={i} className={rowClass}>
                <div className="rp-guidance__header">
                  <span className="rp-guidance__label">
                    {g.warn && <span className="rp-guidance__warn-icon">⚠</span>}
                    {g.label}
                  </span>
                  <span className="rp-guidance__value">{g.value}</span>
                </div>
                <p className="rp-guidance__note">{g.note}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* ── CTAs ───────────────────────────────────── */}
      {dimsValid && !editing && (
        <div className="rp-actions">
          {!showFitResult && lightCount > 0 && (
            <>
              <button className="rp-cta rp-cta--outline">+ Add Light</button>
              <button className="rp-cta rp-cta--primary" onClick={handleCheckFit}>
                Check Room Fit
              </button>
            </>
          )}
          {showFitResult && (
            <>
              <button className="rp-cta rp-cta--primary" onClick={handleApply}>
                Apply to Setup
              </button>
              <button className="rp-cta rp-cta--ghost" onClick={() => setShowFitResult(false)}>
                Adjust light positions
              </button>
            </>
          )}
          {lightCount === 0 && (
            <button className="rp-cta rp-cta--primary" onClick={handleApply}>
              Apply & Close
            </button>
          )}
        </div>
      )}
    </div>
  );
}
