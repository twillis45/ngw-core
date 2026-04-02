import CardIcon from '../components/CardIcon';
import useSettings from '../hooks/useSettings';
import { formatDistance, wbTempClass } from '../utils/units';

/** Convert a pre-formatted distance string (e.g. "7 ft") to metric if needed. */
function convertDist(val, units) {
  if (!val || units !== 'metric') return val;
  // Try to extract a numeric feet value and convert
  const match = val.match(/^([\d.]+)\s*(?:ft|feet|')/i);
  if (match) {
    const m = parseFloat(match[1]) * 0.3048;
    return formatDistance(m, 'metric');
  }
  return val;
}

export default function CameraSubjectCard({ camera, subject, background }) {
  const { units } = useSettings();
  if (!camera) return null;

  return (
    <div className="result-card">
      <div className="result-card__header">
        <CardIcon name="camera" />
        <span>Camera & Subject</span>
      </div>

      {/* Camera section */}
      <div className="cam-subject-section">
        <div className="cam-subject-section__title">Camera</div>
        <div className="cam-grid">
          <div className="cam-stat">
            <div className="cam-stat__val">{camera.aperture}</div>
            <div className="cam-stat__key">Aperture</div>
          </div>
          <div className="cam-stat">
            <div className="cam-stat__val">{camera.iso}</div>
            <div className="cam-stat__key">ISO</div>
          </div>
          <div className="cam-stat">
            <div className="cam-stat__val">{camera.shutter}</div>
            <div className="cam-stat__key">Shutter</div>
          </div>
          <div className="cam-stat">
            <div className={`cam-stat__val ${wbTempClass(camera.wb)}`}>{camera.wb}</div>
            <div className="cam-stat__key">White Bal.</div>
          </div>
        </div>

        {camera.lens && (
          <div className="setup-light__row" style={{ marginTop: 8 }}>
            <span className="setup-light__key">Lens</span>
            <span className="setup-light__val">{camera.lens}</span>
          </div>
        )}
        {camera.height && (
          <div className="setup-light__row">
            <span className="setup-light__key">Camera Height</span>
            <span className="setup-light__val">{camera.height}</span>
          </div>
        )}
        {camera.angle && (
          <div className="setup-light__row">
            <span className="setup-light__key">Camera Angle</span>
            <span className="setup-light__val">{camera.angle}</span>
          </div>
        )}
        {camera.distanceFromSubject && (
          <div className="setup-light__row">
            <span className="setup-light__key">Distance</span>
            <span className="setup-light__val">{convertDist(camera.distanceFromSubject, units)}</span>
          </div>
        )}

        {camera.tip && <div className="cam-tip">{camera.tip}</div>}
      </div>

      {/* Subject section */}
      {subject && (
        <div className="cam-subject-section">
          <div className="cam-subject-section__title">Subject</div>
          {subject.distanceFromBackground && (
            <div className="setup-light__row">
              <span className="setup-light__key">Distance from Background</span>
              <span className="setup-light__val">{convertDist(subject.distanceFromBackground, units)}</span>
            </div>
          )}
          {subject.poseNote && (
            <div className="setup-light__row">
              <span className="setup-light__key">Pose / Orientation</span>
              <span className="setup-light__val">{subject.poseNote}</span>
            </div>
          )}
        </div>
      )}

      {/* Background section */}
      {background && (
        <div className="cam-subject-section">
          <div className="cam-subject-section__title">Background</div>
          {background.lightDistance && (
            <div className="setup-light__row">
              <span className="setup-light__key">Light Distance</span>
              <span className="setup-light__val">{convertDist(background.lightDistance, units)}</span>
            </div>
          )}
          {background.intendedLook && (
            <div className="setup-light__row">
              <span className="setup-light__key">Intended Look</span>
              <span className="setup-light__val">{background.intendedLook}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
