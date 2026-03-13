import { useState, useEffect } from 'react';
import DistanceRefCard from './DistanceRefCard';

/**
 * ShootStepCard — renders a single step in the Shoot Mode workflow.
 *
 * Props:
 *   step         - { id, stepNumber, title, subtitle, type, data, warnings, tips }
 *   isActive     - boolean, is this the current step?
 *   isCompleted  - boolean, has the user marked this step done?
 *   onComplete   - () => void, toggle completion
 *   totalSteps   - number, total steps for progress display
 */
export default function ShootStepCard({ step, isActive, isCompleted, onComplete, totalSteps }) {
  const [expanded, setExpanded] = useState(isActive);

  // Auto-expand active step (in useEffect, not during render)
  useEffect(() => {
    if (isActive) setExpanded(true);
  }, [isActive]);

  const stateClass = isCompleted
    ? 'shoot-step--done'
    : isActive
    ? 'shoot-step--active'
    : 'shoot-step--pending';

  return (
    <div className={`shoot-step ${stateClass}`}>
      {/* Header — always visible */}
      <button
        className="shoot-step__header"
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
      >
        <span className={`shoot-step__badge ${isCompleted ? 'shoot-step__badge--done' : ''}`}>
          {isCompleted ? '\u2713' : step.stepNumber}
        </span>
        <div className="shoot-step__header-text">
          <span className="shoot-step__title">{step.title}</span>
          {step.subtitle && (
            <span className="shoot-step__subtitle">{step.subtitle}</span>
          )}
        </div>
        <span className={`shoot-step__chevron ${expanded ? 'shoot-step__chevron--open' : ''}`}>
          &#x25B8;
        </span>
      </button>

      {/* Warnings — always visible when present */}
      {step.warnings?.length > 0 && (
        <div className="shoot-step__warnings">
          {step.warnings.map((w, i) => (
            <div key={i} className="shoot-step__warning">
              <span className="shoot-step__warning-icon">{'\u26A0\uFE0F'}</span>
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* Expandable content */}
      {expanded && (
        <div className="shoot-step__body">
          {/* Type-specific rendering */}
          {step.type === 'camera_setup' && <CameraSetupContent data={step.data} />}
          {step.type === 'light_placement' && <LightPlacementContent data={step.data} />}
          {step.type === 'test_exposure' && <TestExposureContent data={step.data} />}
          {step.type === 'adjustments' && <AdjustmentsContent data={step.data} />}

          {/* Tips */}
          {step.tips?.length > 0 && (
            <div className="shoot-step__tips">
              {step.tips.map((tip, i) => (
                <div key={i} className="shoot-step__tip">
                  <span className="shoot-step__tip-icon">{'\uD83D\uDCA1'}</span>
                  <span>{tip}</span>
                </div>
              ))}
            </div>
          )}

          {/* Done button */}
          <button
            className={`shoot-step__done-btn ${isCompleted ? 'shoot-step__done-btn--completed' : ''}`}
            onClick={(e) => { e.stopPropagation(); onComplete(); }}
          >
            {isCompleted ? '\u2713 Done' : 'Mark Done'}
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Type-specific content renderers ── */

function CameraSetupContent({ data }) {
  return (
    <div className="shoot-step__camera-grid">
      {data.aperture && (
        <div className="shoot-step__metric">
          <span className="shoot-step__metric-label">Aperture</span>
          <span className="shoot-step__metric-value">{data.aperture}</span>
        </div>
      )}
      {data.iso && (
        <div className="shoot-step__metric">
          <span className="shoot-step__metric-label">ISO</span>
          <span className="shoot-step__metric-value">{data.iso}</span>
        </div>
      )}
      {data.shutter && (
        <div className="shoot-step__metric">
          <span className="shoot-step__metric-label">Shutter</span>
          <span className="shoot-step__metric-value">{data.shutter}</span>
        </div>
      )}
      {data.wb && (
        <div className="shoot-step__metric">
          <span className="shoot-step__metric-label">White Balance</span>
          <span className="shoot-step__metric-value">{data.wb}</span>
        </div>
      )}
    </div>
  );
}

function LightPlacementContent({ data }) {
  return (
    <div className="shoot-step__light-content">
      <div
        className="shoot-step__light-role-badge"
        style={{ borderColor: data.roleColor || 'var(--color-accent)' }}
      >
        <span style={{ color: data.roleColor || 'var(--color-accent)' }}>
          {data.roleKey?.toUpperCase() || 'LIGHT'}
        </span>
      </div>

      {data.modifier && (
        <div className="shoot-step__light-modifier">{data.modifier}</div>
      )}

      <div className="shoot-step__light-specs">
        {data.position && (
          <div className="shoot-step__spec">
            <span className="shoot-step__spec-label">Position</span>
            <span className="shoot-step__spec-value">{data.position}</span>
          </div>
        )}
        {data.height && (
          <div className="shoot-step__spec">
            <span className="shoot-step__spec-label">Height</span>
            <span className="shoot-step__spec-value">{data.height}</span>
          </div>
        )}
        {data.distance && (
          <div className="shoot-step__spec">
            <span className="shoot-step__spec-label">Distance</span>
            <span className="shoot-step__spec-value">{data.distance}</span>
          </div>
        )}
        {data.powerHint && (
          <div className="shoot-step__spec">
            <span className="shoot-step__spec-label">Power</span>
            <span className="shoot-step__spec-value">{data.powerHint}</span>
          </div>
        )}
      </div>

      {data.distanceRef && <DistanceRefCard ref_data={data.distanceRef} />}
    </div>
  );
}

function TestExposureContent({ data }) {
  const [checks, setChecks] = useState({});

  function toggleCheck(idx) {
    setChecks(prev => ({ ...prev, [idx]: !prev[idx] }));
  }

  return (
    <div className="shoot-step__test-content">
      {/* Checklist */}
      {data.checklist?.length > 0 && (
        <div className="shoot-step__checklist">
          <span className="shoot-step__checklist-label">Test Checklist</span>
          {data.checklist.map((item, i) => (
            <label key={i} className="shoot-step__check-item">
              <input
                type="checkbox"
                checked={!!checks[i]}
                onChange={() => toggleCheck(i)}
              />
              <span className={checks[i] ? 'shoot-step__check-done' : ''}>
                {typeof item === 'string' ? item : item.text || item.label || ''}
              </span>
            </label>
          ))}
        </div>
      )}

      {/* Good signs */}
      {data.goodSigns?.length > 0 && (
        <div className="shoot-step__signs">
          <span className="shoot-step__signs-label">{'\u2705'} Good Signs</span>
          <ul>
            {data.goodSigns.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}

      {/* Warnings */}
      {data.warnings?.length > 0 && (
        <div className="shoot-step__signs">
          <span className="shoot-step__signs-label">{'\u26A0\uFE0F'} Watch Out</span>
          <ul>
            {data.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function AdjustmentsContent({ data }) {
  return (
    <div className="shoot-step__adjustments-content">
      {/* Quick fixes */}
      {data.quickFixes?.length > 0 && (
        <div className="shoot-step__fixes-section">
          <span className="shoot-step__fixes-label">{'\uD83D\uDD27'} Quick Fixes</span>
          <div className="shoot-step__fixes-list">
            {data.quickFixes.map((fix, i) => {
              if (typeof fix === 'string') {
                return <div key={i} className="shoot-step__fix-item">{fix}</div>;
              }
              if (fix.problem && fix.fix) {
                return (
                  <div key={i} className="shoot-step__fix-item">
                    <span className="shoot-step__fix-problem">If {fix.problem.toLowerCase()}:</span>
                    <span className="shoot-step__fix-solution">{fix.fix}</span>
                  </div>
                );
              }
              return <div key={i} className="shoot-step__fix-item">{fix.text || fix.label || fix.fix || ''}</div>;
            })}
          </div>
        </div>
      )}

      {/* Substitutions */}
      {data.substitutions?.length > 0 && (
        <div className="shoot-step__subs-section">
          <span className="shoot-step__fixes-label">{'\uD83D\uDD04'} Substitutions</span>
          {data.substitutions.map((sub, i) => (
            <div key={i} className="shoot-step__sub-item">
              {sub.ifMissing && sub.ifMissing !== '\u2014' && (
                <span className="shoot-step__sub-if">If missing: {sub.ifMissing}</span>
              )}
              <span className="shoot-step__sub-use">Use: {sub.use}</span>
              {sub.tradeoff && (
                <span className="shoot-step__sub-tradeoff">{sub.tradeoff}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Diagnostics */}
      {data.diagnostics?.length > 0 && (
        <div className="shoot-step__diag-section">
          <span className="shoot-step__fixes-label">{'\uD83E\uDE7A'} If Something Looks Off</span>
          {data.diagnostics.map((d, i) => (
            <div key={i} className="shoot-step__diag-item">
              <div className="shoot-step__diag-symptoms">
                {d.symptoms?.map((s, j) => <span key={j} className="shoot-step__diag-tag">{s}</span>)}
              </div>
              {d.fixes?.length > 0 && (
                <ul className="shoot-step__diag-fixes">
                  {d.fixes.map((f, j) => <li key={j}>{f}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
