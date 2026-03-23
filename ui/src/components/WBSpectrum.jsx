/**
 * WBSpectrum — minimal white balance temperature bar.
 *
 * Renders a 4px gradient strip (warm amber → neutral → cool blue) with a
 * small indicator marker showing where the current WB sits on the 2000–8000 K
 * scale.  Designed to fit inline under any WB label without taking space.
 */
import { wbKelvin } from '../utils/units';

const K_MIN = 2000;
const K_MAX = 8000;

/** Map a Kelvin value to a 0–100 percentage position on the bar. */
function kToPct(k) {
  const clamped = Math.max(K_MIN, Math.min(K_MAX, k));
  return ((clamped - K_MIN) / (K_MAX - K_MIN)) * 100;
}

/**
 * @param {string|number} wb       — WB preset name or K string (e.g. "tungsten", "5500K")
 * @param {string}  [className]    — extra CSS class on the root element
 * @param {boolean} [showLabel]    — show the K value below the bar (default false)
 */
export default function WBSpectrum({ wb, className = '', showLabel = false }) {
  const k = wbKelvin(wb);
  if (!k) return null;

  const pct = kToPct(k);

  return (
    <div className={`wb-spectrum ${className}`} aria-hidden="true">
      <div className="wb-spectrum__bar">
        <div
          className="wb-spectrum__marker"
          style={{ left: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <div className="wb-spectrum__label">{k} K</div>
      )}
    </div>
  );
}
