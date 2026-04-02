import CardIcon from '../components/CardIcon';
import WBSpectrum from '../components/WBSpectrum';
import { wbTempClass } from '../utils/units';

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
          <div className={`cam-stat__val ${wbTempClass(settings.wb)}`}>{settings.wb}</div>
          <div className="cam-stat__key">White Bal.</div>
          <WBSpectrum wb={settings.wb} />
        </div>
      </div>

      {settings.tip && (
        <div className="cam-tip">{settings.tip}</div>
      )}
    </div>
  );
}
