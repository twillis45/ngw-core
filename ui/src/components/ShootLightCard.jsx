import { useState } from 'react';
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
 *   mode         - 'photographer' | 'assistant' | 'learning'
 *   onPrev       - () => void, go to previous light
 *   onNext       - () => void, go to next light
 */

// ── Per-role learning context ────────────────────────────────────────────────
// Static explanations keyed to roleKey. These appear when mode === 'learning'
// and give the assistant real context about why this light exists.

const ROLE_CONTEXT = {
  key: {
    role:   'Key light',
    why:    'Defines the primary shadow pattern and drives overall exposure. All other lights are set relative to the key — it\'s the single most important placement decision.',
    effect: 'Position and height determine shadow angle and shape on the face.',
  },
  fill: {
    role:   'Fill light',
    why:    'Reduces shadow density without adding its own shadow. The fill-to-key ratio sets the contrast — a 2:1 ratio is gentle; 4:1 or higher is dramatic.',
    effect: 'Closer fill = lower contrast. Farther fill = deeper shadows.',
  },
  rim: {
    role:   'Rim light',
    why:    'Creates a bright edge that separates the subject from the background. Without separation, the subject can blend into a dark backdrop.',
    effect: 'Position behind and to the side. Feather slightly away from camera to prevent lens flare.',
  },
  hair: {
    role:   'Hair light',
    why:    'Adds dimension by lighting the top of the head and shoulders separately. Prevents the subject from looking flat.',
    effect: 'Placed above and slightly behind. Should not spill onto the face.',
  },
  background: {
    role:   'Background light',
    why:    'Controls background tone independently of the subject. Brightening it lifts apparent separation; darkening it creates depth and drama.',
    effect: 'Even coverage needs distance or a diffuser. Graduated falloff adds depth.',
  },
};

function getRoleContext(roleKey) {
  if (!roleKey) return null;
  return ROLE_CONTEXT[roleKey.toLowerCase()] || null;
}

// ── Spec explanation hints ───────────────────────────────────────────────────
// Short "why" captions shown in learning mode under each spec value.

function specHint(label, value, roleKey) {
  const role = roleKey?.toLowerCase();
  switch (label) {
    case 'Height':
      return value?.toLowerCase().includes('above')
        ? 'Raised source — catchlight appears near top of iris, shadow falls downward.'
        : value?.toLowerCase().includes('eye')
        ? 'Eye-level source — flatter light, shadow falls straight back.'
        : 'Height controls catchlight position and shadow angle on the face.';
    case 'Distance':
      return 'Closer = more light wrap + softer shadow edges. Farther = harder, more even falloff.';
    case 'Power':
      return role === 'key'
        ? 'Set this first. All other lights are dialed relative to the key.'
        : role === 'fill'
        ? 'Set 1–2 stops below key for natural contrast; more for dramatic looks.'
        : role === 'rim'
        ? 'Should be visible but not overpowering — start 0.5 stop below key.'
        : 'Set to complement the key; check balance in the histogram.';
    case 'Angle':
      return 'Angle off-axis determines which side of the face falls in shadow.';
    case 'Direction':
      return 'Camera-relative direction — determines where the shadow falls in frame.';
    case 'Feather':
      return 'Feathering rotates the modifier so the edge of the beam hits the subject — produces a gentler, more even spread.';
    case 'Aim at':
      return 'Where the center of the modifier points. Re-aiming shifts the hot spot without moving the stand.';
    default:
      return null;
  }
}

export default function ShootLightCard({ light, stepNumber, totalLights, warnings, mode = 'assistant', onPrev, onNext }) {
  const [whyOpen, setWhyOpen] = useState(false);
  const roleColor = light.roleColor || 'var(--color-accent)';
  const isLearning = mode === 'learning';
  const ctx = isLearning ? getRoleContext(light.roleKey) : null;

  function Spec({ label, value }) {
    if (!value) return null;
    const hint = isLearning ? specHint(label, value, light.roleKey) : null;
    return (
      <div className="shoot-light-lg__spec">
        <span className="shoot-light-lg__spec-label">{label}</span>
        <span className="shoot-light-lg__spec-value">{value}</span>
        {hint && (
          <span className="shoot-light-lg__spec-hint">{hint}</span>
        )}
      </div>
    );
  }

  return (
    <div className="shoot-light-lg">
      {/* Counter */}
      <div className="shoot-light-lg__counter">
        Light {stepNumber} of {totalLights}
      </div>

      {/* Role badge */}
      <div className="shoot-light-lg__role" style={{ color: roleColor }}>
        {ctx ? ctx.role.toUpperCase() : (light.roleKey?.toUpperCase() || 'LIGHT')}
      </div>

      {/* Modifier */}
      {light.modifier && (
        <div className="shoot-light-lg__modifier">{light.modifier}</div>
      )}

      {/* Start here hint */}
      {light.initialPlacement && (
        <div className="shoot-light-lg__placement-hint">
          <span className="shoot-light-lg__placement-hint-label">Start here</span>
          <span className="shoot-light-lg__placement-hint-text">{light.initialPlacement}</span>
        </div>
      )}

      {/* Main specs — big and readable */}
      <div className="shoot-light-lg__specs">
        <Spec label="Position"  value={light.position}  />
        <Spec label="Height"    value={light.height}    />
        <Spec label="Distance"  value={light.distance}  />
        <Spec label="Angle"     value={light.angle}     />
        <Spec label="Direction" value={light.direction} />
        <Spec label="Power"     value={light.powerHint} />
        <Spec label="Feather"   value={light.featherHint} />
      </div>

      {/* Aim target */}
      {light.aimTarget && (
        <div className="shoot-light-lg__placement-hint" style={{ marginTop: 8 }}>
          <span className="shoot-light-lg__placement-hint-label">Aim at</span>
          <span className="shoot-light-lg__placement-hint-text">{light.aimTarget}</span>
          {isLearning && (
            <span className="shoot-light-lg__spec-hint">
              {specHint('Aim at', light.aimTarget, light.roleKey)}
            </span>
          )}
        </div>
      )}

      {/* Distance reference */}
      {light.distanceRef && <DistanceRefCard ref_data={light.distanceRef} />}

      {/* Learning mode — "Why this light" section */}
      {isLearning && ctx && (
        <div className="shoot-light-lg__why">
          <button
            className="shoot-light-lg__why-toggle"
            onClick={() => setWhyOpen(v => !v)}
            type="button"
          >
            <span>Why this light?</span>
            <span className="shoot-light-lg__why-chevron">{whyOpen ? '▲' : '▼'}</span>
          </button>
          {whyOpen && (
            <div className="shoot-light-lg__why-body">
              <p className="shoot-light-lg__why-text">{ctx.why}</p>
              <p className="shoot-light-lg__why-effect">→ {ctx.effect}</p>
            </div>
          )}
        </div>
      )}

      {/* Learning mode nudge — shown when not in learning mode */}
      {!isLearning && (
        <div className="shoot-learn-nudge">
          <span className="shoot-learn-nudge__icon">💡</span>
          <span>
            Want to know <em>why</em> each spec matters?{' '}
            Switch to <strong>Learning mode</strong> in Settings → Feedback Depth.
          </span>
        </div>
      )}

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
