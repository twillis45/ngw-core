import DistanceRefCard from './DistanceRefCard';

/**
 * ShootLightCard — large, glanceable light card for the Assistant view.
 * Designed to be readable at arm's length on a mobile device.
 *
 * Props:
 *   light        - step.data object from a light_placement step
 *   stepNumber   - which light in the sequence
 *   totalLights  - total light count
 *   warnings     - string[] from the step
 *   onPrev       - () => void, go to previous light
 *   onNext       - () => void, go to next light
 */
export default function ShootLightCard({ light, stepNumber, totalLights, warnings, onPrev, onNext }) {
  const roleColor = light.roleColor || 'var(--color-accent)';

  return (
    <div className="shoot-light-lg">
      {/* Counter */}
      <div className="shoot-light-lg__counter">
        Light {stepNumber} of {totalLights}
      </div>

      {/* Role badge */}
      <div className="shoot-light-lg__role" style={{ color: roleColor }}>
        {light.roleKey?.toUpperCase() || 'LIGHT'}
      </div>

      {/* Modifier */}
      {light.modifier && (
        <div className="shoot-light-lg__modifier">{light.modifier}</div>
      )}

      {/* Main specs — big and readable */}
      <div className="shoot-light-lg__specs">
        {light.position && (
          <div className="shoot-light-lg__spec">
            <span className="shoot-light-lg__spec-label">Position</span>
            <span className="shoot-light-lg__spec-value">{light.position}</span>
          </div>
        )}
        {light.height && (
          <div className="shoot-light-lg__spec">
            <span className="shoot-light-lg__spec-label">Height</span>
            <span className="shoot-light-lg__spec-value">{light.height}</span>
          </div>
        )}
        {light.distance && (
          <div className="shoot-light-lg__spec">
            <span className="shoot-light-lg__spec-label">Distance</span>
            <span className="shoot-light-lg__spec-value">{light.distance}</span>
          </div>
        )}
        {light.powerHint && (
          <div className="shoot-light-lg__spec">
            <span className="shoot-light-lg__spec-label">Power</span>
            <span className="shoot-light-lg__spec-value">{light.powerHint}</span>
          </div>
        )}
      </div>

      {/* Distance reference */}
      {light.distanceRef && <DistanceRefCard ref_data={light.distanceRef} />}

      {/* Warnings */}
      {warnings?.length > 0 && (
        <div className="shoot-light-lg__warnings">
          {warnings.map((w, i) => (
            <div key={i} className="shoot-light-lg__warning">
              {'\u26A0\uFE0F'} {w}
            </div>
          ))}
        </div>
      )}

      {/* Nav buttons */}
      <div className="shoot-light-lg__nav">
        <button
          className="shoot-light-lg__nav-btn"
          onClick={onPrev}
          disabled={stepNumber <= 1}
        >
          {'\u25C0'} Prev
        </button>
        <button
          className="shoot-light-lg__nav-btn"
          onClick={onNext}
          disabled={stepNumber >= totalLights}
        >
          Next {'\u25B6'}
        </button>
      </div>
    </div>
  );
}
