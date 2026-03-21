import CardIcon from '../components/CardIcon';

export default function CameraSettingsCard({ settings }) {
  if (!settings) return null;

  return (
    <div className="result-card">
      <div className="result-card__header">
        <CardIcon name="camera" />
        <span>Camera Settings</span>
      </div>

      <div className="cam-grid">
        <div className="cam-stat">
          <div className="cam-stat__val">{settings.aperture}</div>
          <div className="cam-stat__key">Aperture</div>
        </div>
        <div className="cam-stat">
          <div className="cam-stat__val">{settings.iso}</div>
          <div className="cam-stat__key">ISO</div>
        </div>
        <div className="cam-stat">
          <div className="cam-stat__val">{settings.shutter}</div>
          <div className="cam-stat__key">Shutter</div>
        </div>
        <div className="cam-stat">
          <div className="cam-stat__val">{settings.wb}</div>
          <div className="cam-stat__key">White Bal.</div>
        </div>
      </div>

      {settings.tip && (
        <div className="cam-tip">{settings.tip}</div>
      )}
    </div>
  );
}
