import { useState } from 'react';
import { useAppState, useDispatch } from '../context/AppContext';
import { checkRoomFit } from '../spatial/spatialEngine';
import CardIcon from '../components/CardIcon';
import useSettings from '../hooks/useSettings';
import { formatRoomDim } from '../utils/units';

/** Classify a setup's minimum floor area into a space type label. */
function spaceTypeLabel(minWidthFt, minDepthFt) {
  const area = parseFloat(minWidthFt || 0) * parseFloat(minDepthFt || 0);
  if (area < 80)  return 'Compact space';
  if (area < 200) return 'Small studio';
  if (area < 400) return 'Standard studio';
  return 'Large studio';
}

/** Per-dimension fit: 'pass' | 'tight' (≤10% margin) | 'fail' */
function dimFit(roomVal, needVal) {
  if (roomVal < needVal) return 'fail';
  const margin = (roomVal - needVal) / needVal;
  return margin <= 0.1 ? 'tight' : 'pass';
}

/** Overall fit status from three individual results. */
function overallFit(cf, wf, df) {
  if (cf === 'fail' || wf === 'fail' || df === 'fail') return 'fail';
  if (cf === 'tight' || wf === 'tight' || df === 'tight') return 'tight';
  return 'pass';
}

const FIT_LABEL = { pass: 'FITS', tight: 'TIGHT', fail: "WON'T FIT" };
const FIT_COLOR = { pass: '#22c55e', tight: '#f59e0b', fail: '#ef4444' };

export default function SpaceCheckCard({ data, defaultOpen = false }) {
  if (!data) return null;

  const { roomDimensions } = useAppState();
  const dispatch = useDispatch();
  const { units } = useSettings();
  const fmt = (ft) => ft != null ? formatRoomDim(ft, units) : '—';
  const fmtArea = (w, d) => {
    const sqFt = Math.round(parseFloat(w || 0) * parseFloat(d || 0));
    if (units === 'metric') return `${Math.round(sqFt * 0.0929)} m²`;
    return `${sqFt} sq ft`;
  };

  const roomFit = roomDimensions ? checkRoomFit(roomDimensions, data) : null;

  // Per-dimension and overall fit (only when room dims are known)
  const ceilFit = roomFit ? dimFit(roomDimensions.ceilingFt, data.minCeilingFt) : null;
  const widFit  = roomFit ? dimFit(roomDimensions.widthFt,   data.minWidthFt)   : null;
  const depFit  = roomFit ? dimFit(roomDimensions.lengthFt,  data.minDepthFt)   : null;
  const overall = roomFit ? overallFit(ceilFit, widFit, depFit) : null;

  const minArea = parseFloat(data.minWidthFt || 0) * parseFloat(data.minDepthFt || 0);
  const roomArea = roomDimensions
    ? roomDimensions.widthFt * roomDimensions.lengthFt
    : null;

  const hasWarnings = (data.warnings?.length > 0) || (roomFit?.issues?.length > 0);
  const [open, setOpen] = useState(defaultOpen || hasWarnings);

  function openRoomPlanner() {
    dispatch({ type: 'NAVIGATE', screen: 'room_planner' });
  }

  return (
    <div className="result-card">
      <button
        type="button"
        className="result-card__header result-card__header--toggle"
        onClick={() => setOpen(!open)}
      >
        <CardIcon name="ruler" />
        <span>Space Check</span>

        {/* Overall fit badge — only when room dims are known */}
        {overall && (
          <span
            className="space-check__fit-badge"
            style={{ color: FIT_COLOR[overall] }}
          >
            {FIT_LABEL[overall]}
          </span>
        )}

        {/* Room dimensions summary */}
        {roomDimensions && (
          <span className="space-check__room-badge">
            {fmt(roomDimensions.widthFt)}w × {fmt(roomDimensions.lengthFt)}d × {fmt(roomDimensions.ceilingFt)} ceil
          </span>
        )}
        {hasWarnings && !open && (
          <span className="space-check__warn-badge">{'\u26A0\uFE0F'}</span>
        )}
        <span className="result-card__chevron">{open ? '\u25BE' : '\u25B8'}</span>
      </button>

      {!open ? null : (
      <>

      {/* Space type + area summary */}
      <div className="space-check__meta">
        <div className="space-check__meta-item">
          <span className="space-check__meta-label">Setup type</span>
          <span className="space-check__meta-val">{spaceTypeLabel(data.minWidthFt, data.minDepthFt)}</span>
        </div>
        <div className="space-check__meta-item">
          <span className="space-check__meta-label">Min floor area</span>
          <span className="space-check__meta-val">{fmtArea(data.minWidthFt, data.minDepthFt)}</span>
        </div>
        {roomArea && (
          <div className="space-check__meta-item">
            <span className="space-check__meta-label">Your room</span>
            <span
              className="space-check__meta-val"
              style={{ color: roomArea >= minArea ? FIT_COLOR[overall] : FIT_COLOR.fail }}
            >
              {fmtArea(roomDimensions.widthFt, roomDimensions.lengthFt)}
            </span>
          </div>
        )}
      </div>

      {/* Room fit comparison (when dimensions are known) */}
      {roomFit && (
        <div className="room-fit room-fit--card">
          <div className="room-fit__header">Dimension Check</div>

          {/* Ceiling */}
          <div className="room-fit__row room-fit__row--detail">
            <span className="room-fit__dim-label">Ceiling</span>
            <span style={{ color: FIT_COLOR[ceilFit], fontWeight: 600 }}>
              {fmt(roomDimensions.ceilingFt)}
            </span>
            <span className="room-fit__need">min {fmt(data.minCeilingFt)}</span>
            <span className="room-fit__fit-tag" style={{ color: FIT_COLOR[ceilFit] }}>
              {FIT_LABEL[ceilFit]}
            </span>
          </div>

          {/* Width */}
          <div className="room-fit__row room-fit__row--detail">
            <span className="room-fit__dim-label">Width</span>
            <span style={{ color: FIT_COLOR[widFit], fontWeight: 600 }}>
              {fmt(roomDimensions.widthFt)}
            </span>
            <span className="room-fit__need">min {fmt(data.minWidthFt)}</span>
            <span className="room-fit__fit-tag" style={{ color: FIT_COLOR[widFit] }}>
              {FIT_LABEL[widFit]}
            </span>
          </div>

          {/* Depth */}
          <div className="room-fit__row room-fit__row--detail">
            <span className="room-fit__dim-label">Depth</span>
            <span style={{ color: FIT_COLOR[depFit], fontWeight: 600 }}>
              {fmt(roomDimensions.lengthFt)}
            </span>
            <span className="room-fit__need">min {fmt(data.minDepthFt)}</span>
            <span className="room-fit__fit-tag" style={{ color: FIT_COLOR[depFit] }}>
              {FIT_LABEL[depFit]}
            </span>
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

      {/* Standard space requirements (no room dims saved) */}
      {!roomFit && (
        <div className="space-grid">
          <div className="space-grid__item">
            <span className="space-grid__val">{fmt(data.minCeilingFt)}</span>
            <span className="space-grid__key">ceiling</span>
          </div>
          <div className="space-grid__item">
            <span className="space-grid__val">{fmt(data.minWidthFt)}</span>
            <span className="space-grid__key">width</span>
          </div>
          <div className="space-grid__item">
            <span className="space-grid__val">{fmt(data.minDepthFt)}</span>
            <span className="space-grid__key">depth</span>
          </div>
          {data.cameraToSubjectFt && (
            <div className="space-grid__item">
              <span className="space-grid__val">{fmt(parseFloat(data.cameraToSubjectFt))}</span>
              <span className="space-grid__key">cam-to-subj</span>
            </div>
          )}
        </div>
      )}

      {data.ceilingNote && (
        <div className="space-note">{data.ceilingNote}</div>
      )}

      {data.warnings.map((w, i) => (
        <div className="space-warn" key={i}>
          {w}
        </div>
      ))}

      {/* Room Planner link */}
      <button className="btn-link space-check__planner-link" onClick={openRoomPlanner}>
        {roomDimensions ? 'Edit room dims' : 'Add room dims →'}
      </button>
      </>
      )}
    </div>
  );
}
