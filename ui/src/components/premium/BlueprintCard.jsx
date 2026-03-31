import SectionLabel from './SectionLabel';
import PrimaryButton from './PrimaryButton';

/** BlueprintCard (Premium) — conversion surface on the Result Screen.
 *  Free state: partial blur on premium fields. Entire card is tappable → onUnlockTap.
 *  Pro state: full values, no overlay, no CTA.
 *
 *  lights: array of { label, role, modifier, modifierSize, positionText, distanceFt, distanceM, power }
 *  isPro: boolean
 *  onUnlockTap: () => void
 *  loading: boolean
 */
export default function BlueprintCard({ lights = [], isPro = false, onUnlockTap, loading = false }) {
  if (loading) {
    return (
      <div className="ngw-blueprint-card ngw-blueprint-card--loading">
        <div className="ngw-skeleton" style={{ position: 'absolute', inset: 0, borderRadius: 20 }} />
      </div>
    );
  }

  const visibleLights = lights.slice(0, 4); // cap at 4 for display

  return (
    <div
      className={`ngw-blueprint-card${isPro ? '' : ' ngw-blueprint-card--free'}`}
      onClick={isPro ? undefined : onUnlockTap}
      role={isPro ? undefined : 'button'}
      tabIndex={isPro ? undefined : 0}
      onKeyDown={isPro ? undefined : (e) => { if (e.key === 'Enter' || e.key === ' ') onUnlockTap?.(); }}
      aria-label={isPro ? undefined : 'Tap to unlock full blueprint'}
    >
      {/* Header */}
      <div className="ngw-blueprint-card__header">
        <SectionLabel>Blueprint</SectionLabel>
        {isPro && <span className="ngw-blueprint-card__pro-chip">Pro</span>}
      </div>

      {/* Light rows */}
      <div className="ngw-blueprint-card__lights">
        {visibleLights.map((light, i) => {
          const label = light.label || light.role || `Light ${i + 1}`;
          const modifier = [light.modifier, light.modifierSize].filter(Boolean).join(' ') || null;
          const distFt = light.distanceFt || light.distance_ft || null;
          const distM  = light.distanceM  || light.distance_m  || null;
          const distDisplay = distFt ? `${distFt}` : distM ? `${distM}m` : null;
          const powerDisplay = light.power ? `${light.power}` : null;

          return (
            <div className="ngw-blueprint-card__light" key={i}>
              <div className="ngw-blueprint-card__light-role">{label}</div>
              {/* Always visible */}
              <div className="ngw-blueprint-card__light-visible">
                {modifier && (
                  <span className="ngw-blueprint-card__light-field">{modifier}</span>
                )}
                {light.positionText && !isPro && (
                  <span className="ngw-blueprint-card__light-field">{light.positionText}</span>
                )}
                {isPro && light.positionText && (
                  <span className="ngw-blueprint-card__light-field">{light.positionText}</span>
                )}
              </div>
              {/* Locked fields — blurred for free, visible for pro */}
              {(distDisplay || powerDisplay) && (
                <div className="ngw-blueprint-card__light-locked">
                  {distDisplay && (
                    isPro
                      ? <span className="ngw-blueprint-card__light-field">{distDisplay}</span>
                      : <span className="ngw-blueprint-card__field-blurred">{distDisplay}</span>
                  )}
                  {powerDisplay && (
                    isPro
                      ? <span className="ngw-blueprint-card__light-field">{powerDisplay}</span>
                      : <span className="ngw-blueprint-card__field-blurred">{powerDisplay}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {lights.length === 0 && (
          <div className="ngw-blueprint-card__no-data">
            No light data available.
          </div>
        )}
      </div>

      {/* Free: lock banner + CTA */}
      {!isPro && (
        <>
          <div className="ngw-blueprint-card__lock-banner">
            <span className="ngw-blueprint-card__lock-text">
              Unlock exact setup — positions, distances, full control
            </span>
          </div>
          <div className="ngw-blueprint-card__cta-wrap" onClick={e => e.stopPropagation()}>
            <PrimaryButton
              label="Get the full blueprint"
              onClick={onUnlockTap}
            />
          </div>
        </>
      )}
    </div>
  );
}
