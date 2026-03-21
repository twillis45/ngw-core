import { useState, useMemo } from 'react';
import { useAppState, useDispatch } from '../context/AppContext';
import { checkRoomFit } from '../spatial/spatialEngine';
import CardIcon from '../components/CardIcon';
import useSettings from '../hooks/useSettings';
import { formatRoomDim } from '../utils/units';

export default function SpaceCheckCard({ data, defaultOpen = false }) {
  if (!data) return null;

  const { roomDimensions } = useAppState();
  const dispatch = useDispatch();
  const { units } = useSettings();
  const fmt = (ft) => formatRoomDim(ft, units);

  const roomFit = roomDimensions
    ? checkRoomFit(roomDimensions, data)
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

      {/* Room fit comparison (when dimensions are known) */}
      {roomFit && (
        <div className="room-fit room-fit--card">
          <div className="room-fit__header">Your Room vs. Setup Needs</div>
          <div className={`room-fit__row ${roomFit.ceilingFits ? 'room-fit__row--pass' : 'room-fit__row--fail'}`}>
            <span>{roomFit.ceilingFits ? '\u2705' : '\u274C'}</span>
            <span>Ceiling: {fmt(roomDimensions.ceilingFt)}</span>
            <span className="room-fit__need">needs {fmt(data.minCeilingFt)}</span>
          </div>
          <div className={`room-fit__row ${roomFit.widthFits ? 'room-fit__row--pass' : 'room-fit__row--fail'}`}>
            <span>{roomFit.widthFits ? '\u2705' : '\u274C'}</span>
            <span>Width: {fmt(roomDimensions.widthFt)}</span>
            <span className="room-fit__need">needs {fmt(data.minWidthFt)}</span>
          </div>
          <div className={`room-fit__row ${roomFit.depthFits ? 'room-fit__row--pass' : 'room-fit__row--fail'}`}>
            <span>{roomFit.depthFits ? '\u2705' : '\u274C'}</span>
            <span>Depth: {fmt(roomDimensions.lengthFt)}</span>
            <span className="room-fit__need">needs {fmt(data.minDepthFt)}</span>
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

      {/* Standard space requirements (always shown) */}
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
        {roomDimensions ? 'Edit room dims' : 'Room Planner'}
      </button>
      </>
      )}
    </div>
  );
}
