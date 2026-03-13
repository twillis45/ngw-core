import { useAppState, useDispatch } from '../context/AppContext';
import { checkRoomFit } from '../spatial/spatialEngine';

export default function SpaceCheckCard({ data }) {
  if (!data) return null;

  const { roomDimensions } = useAppState();
  const dispatch = useDispatch();

  const roomFit = roomDimensions
    ? checkRoomFit(roomDimensions, data)
    : null;

  function openRoomPlanner() {
    dispatch({ type: 'NAVIGATE', screen: 'room_planner' });
  }

  return (
    <div className="result-card">
      <div className="result-card__header">
        <span className="result-card__icon">{'\u{1F4D0}'}</span>
        <span>Space Check</span>
      </div>

      {/* Room fit comparison (when dimensions are known) */}
      {roomFit && (
        <div className="room-fit room-fit--card">
          <div className="room-fit__header">Your Room vs. Setup Needs</div>
          <div className={`room-fit__row ${roomFit.ceilingFits ? 'room-fit__row--pass' : 'room-fit__row--fail'}`}>
            <span>{roomFit.ceilingFits ? '\u2705' : '\u274C'}</span>
            <span>Ceiling: {roomDimensions.ceilingFt} ft</span>
            <span className="room-fit__need">needs {data.minCeilingFt} ft</span>
          </div>
          <div className={`room-fit__row ${roomFit.widthFits ? 'room-fit__row--pass' : 'room-fit__row--fail'}`}>
            <span>{roomFit.widthFits ? '\u2705' : '\u274C'}</span>
            <span>Width: {roomDimensions.widthFt} ft</span>
            <span className="room-fit__need">needs {data.minWidthFt} ft</span>
          </div>
          <div className={`room-fit__row ${roomFit.depthFits ? 'room-fit__row--pass' : 'room-fit__row--fail'}`}>
            <span>{roomFit.depthFits ? '\u2705' : '\u274C'}</span>
            <span>Depth: {roomDimensions.lengthFt} ft</span>
            <span className="room-fit__need">needs {data.minDepthFt} ft</span>
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
        <>
          <div className="space-stat">
            <span className="space-stat__key">Minimum ceiling</span>
            <span className="space-stat__val">{data.minCeilingFt} ft</span>
          </div>
          {data.recommendedCeilingFt && (
            <div className="space-stat">
              <span className="space-stat__key">Recommended ceiling</span>
              <span className="space-stat__val">{data.recommendedCeilingFt} ft</span>
            </div>
          )}
          <div className="space-stat">
            <span className="space-stat__key">Working area (width)</span>
            <span className="space-stat__val">{data.minWidthFt} ft</span>
          </div>
          <div className="space-stat">
            <span className="space-stat__key">Working area (depth)</span>
            <span className="space-stat__val">{data.minDepthFt} ft</span>
          </div>
        </>
      )}

      {data.cameraToSubjectFt && (
        <div className="space-stat">
          <span className="space-stat__key">Camera to subject</span>
          <span className="space-stat__val">{data.cameraToSubjectFt}</span>
        </div>
      )}
      {data.subjectToBackgroundFt && (
        <div className="space-stat">
          <span className="space-stat__key">Subject to background</span>
          <span className="space-stat__val">{data.subjectToBackgroundFt}</span>
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

      {/* Room Planner button */}
      <button className="btn btn--secondary space-check__planner-btn" onClick={openRoomPlanner}>
        {'\uD83D\uDCCF'} {roomDimensions ? 'Edit Room Dimensions' : 'Room Planner'}
      </button>
    </div>
  );
}
