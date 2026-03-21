import { useState, useEffect } from 'react';
import DistanceRefCard from './DistanceRefCard';
import { formatFeedback, formatTips, formatFixes, formatDiagFixes } from '../lib/formatFeedback';

/**
 * ShootStepCard — renders a single step in the Shoot Mode workflow.
 *
 * Props:
 *   step         - { id, stepNumber, title, subtitle, type, data, warnings, tips }
 *   isActive     - boolean, is this the current step?
 *   isCompleted  - boolean, has the user marked this step done?
 *   onComplete   - () => void, toggle completion
 *   totalSteps   - number, total steps for progress display
 *   mode         - 'photographer' | 'assistant' | 'learning'  (default: 'photographer')
 */
export default function ShootStepCard({ step, isActive, isCompleted, onComplete, totalSteps, mode = 'photographer' }) {
  const [expanded, setExpanded] = useState(isActive);

  // Follow active step — expand when active, collapse when done/pending
  useEffect(() => {
    setExpanded(isActive);
  }, [isActive]);

  // Apply mode-based formatting to display text (source data unchanged)
  const displaySubtitle = formatFeedback(step.subtitle, mode, 'subtitle');
  const displayTips     = formatTips(step.tips, mode);

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
          {displaySubtitle && (
            <span className="shoot-step__subtitle">{displaySubtitle}</span>
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
          {/* Type-specific rendering — pass mode so they can format their own text */}
          {step.type === 'camera_setup' && <CameraSetupContent data={step.data} />}
          {step.type === 'light_placement' && <LightPlacementContent data={step.data} mode={mode} />}
          {step.type === 'test_exposure' && <TestExposureContent data={step.data} mode={mode} />}
          {step.type === 'adjustments' && <AdjustmentsContent data={step.data} mode={mode} />}

          {/* Tips — hidden in assistant mode, prefixed in learning mode */}
          {displayTips?.length > 0 && (
            <div className="shoot-step__tips">
              <div className="shoot-step__tips-label">
                {mode === 'learning' ? 'Why This Matters' : 'Pro Tips'}
              </div>
              {displayTips.map((tip, i) => (
                <div key={i} className="shoot-step__tip">
                  <span className="shoot-step__tip-icon">{'\u2022'}</span>
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

const BARE_TOKENS = new Set(['bare', 'bare_bulb', 'bare bulb', 'direct', 'none', 'unknown', 'modifier not detected', '']);
function cleanModifier(mod) {
  if (!mod) return null;
  return BARE_TOKENS.has(mod.toLowerCase().trim()) ? null : mod;
}

function LightPlacementContent({ data, mode = 'photographer' }) {
  const modifier = cleanModifier(data.modifier);
  const isAssistant = mode === 'assistant';
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

      {modifier && (
        <div className="shoot-step__light-modifier">{modifier}</div>
      )}

      {/* Initial placement hint — simple starting position */}
      {data.initialPlacement && (
        <div className="shoot-step__placement-hint">
          <span className="shoot-step__placement-hint-label">Start here</span>
          <span className="shoot-step__placement-hint-text">{data.initialPlacement}</span>
        </div>
      )}

      <div className="shoot-step__light-specs">
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
        {/* Angle — shown for assistant so they know the geometry */}
        {data.angle && (
          <div className="shoot-step__spec">
            <span className="shoot-step__spec-label">Angle</span>
            <span className="shoot-step__spec-value">{data.angle}</span>
          </div>
        )}
        {data.direction && (
          <div className="shoot-step__spec">
            <span className="shoot-step__spec-label">Direction</span>
            <span className="shoot-step__spec-value">{data.direction}</span>
          </div>
        )}
        {data.powerHint && (
          <div className="shoot-step__spec">
            <span className="shoot-step__spec-label">Power</span>
            <span className="shoot-step__spec-value">{data.powerHint}</span>
          </div>
        )}
        {/* Feather hint — assistant needs to know if and where to feather */}
        {isAssistant && data.featherHint && (
          <div className="shoot-step__spec" style={{ gridColumn: '1 / -1' }}>
            <span className="shoot-step__spec-label">Feather</span>
            <span className="shoot-step__spec-value">{data.featherHint}</span>
          </div>
        )}
      </div>

      {data.distanceRef && <DistanceRefCard ref_data={data.distanceRef} />}

      {/* Aim target — where the modifier should be aimed, for assistant */}
      {isAssistant && data.aimTarget && (
        <div className="shoot-step__placement-hint" style={{ marginTop: 8 }}>
          <span className="shoot-step__placement-hint-label">Aim at</span>
          <span className="shoot-step__placement-hint-text">{data.aimTarget}</span>
        </div>
      )}
    </div>
  );
}

function TestExposureContent({ data, mode = 'photographer' }) {
  const [checks, setChecks] = useState({});
  const isAssistant = mode === 'assistant';

  function toggleCheck(idx) {
    setChecks(prev => ({ ...prev, [idx]: !prev[idx] }));
  }

  /* In assistant mode, show only level-1 (priority) signs/warnings */
  function filterItems(items) {
    if (!items) return [];
    const normalized = items.map(i => typeof i === 'string' ? { text: i, level: 1 } : i);
    if (!isAssistant) return normalized;
    const priority = normalized.filter(i => i.level === 1);
    return priority.length > 0 ? priority : normalized;
  }

  const goodItems = filterItems(data.goodSigns);
  const warnItems = filterItems(data.warnings);

  return (
    <div className="shoot-step__test-content">
      {/* Checklist */}
      {data.checklist?.length > 0 && (
        <div className="shoot-step__checklist">
          <span className="shoot-step__checklist-label">
            {isAssistant ? 'Check these' : 'Test Checklist'}
          </span>
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
      {goodItems.length > 0 && (
        <div className="shoot-step__signs">
          <span className="shoot-step__signs-label">
            {'\u2705'} {isAssistant ? 'Confirms correct' : 'Good Signs'}
          </span>
          <ul>
            {goodItems.map((s, i) => (
              <li key={i}>{s.text}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Warnings */}
      {warnItems.length > 0 && (
        <div className="shoot-step__signs">
          <span className="shoot-step__signs-label">
            {'\u26A0\uFE0F'} {isAssistant ? 'Flag to photographer if' : 'Watch Out'}
          </span>
          <ul>
            {warnItems.map((w, i) => (
              <li key={i}>{w.text}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function FixCommand({ fix, mode }) {
  // Assistant mode: structured { doThis, result } — clean, command-forward layout
  if (mode === 'assistant') {
    const doThis = fix.doThis || fix.text || '';
    const result = fix.result || null;
    return (
      <div className="shoot-step__cmd-item">
        <span className="shoot-step__cmd-action">{doThis}</span>
        {result && (
          <span className="shoot-step__cmd-effect">{result}</span>
        )}
      </div>
    );
  }

  // Photographer / learning mode: problem → fix format
  if (typeof fix === 'string') return <div className="shoot-step__fix-item">{fix}</div>;
  if (fix.problem && fix.fix) {
    return (
      <div className="shoot-step__fix-item">
        <span className="shoot-step__fix-problem">{fix.problem}</span>
        <span className="shoot-step__fix-solution">{fix.fix}</span>
      </div>
    );
  }
  return <div className="shoot-step__fix-item">{fix.text || fix.label || fix.fix || ''}</div>;
}

function AdjustmentsContent({ data, mode = 'photographer' }) {
  const displayFixes = formatFixes(data.quickFixes, mode);
  const isAssistant = mode === 'assistant';

  return (
    <div className="shoot-step__adjustments-content">
      {/* Quick fixes */}
      {displayFixes?.length > 0 && (
        <div className="shoot-step__fixes-section">
          <span className="shoot-step__fixes-label">
            {'\uD83D\uDD27'} {isAssistant ? 'Adjustments' : 'Quick Fixes'}
          </span>
          <div className="shoot-step__fixes-list">
            {displayFixes.map((fix, i) => (
              <FixCommand key={i} fix={fix} mode={mode} />
            ))}
          </div>
        </div>
      )}

      {/* Substitutions */}
      {data.substitutions?.length > 0 && (
        <div className="shoot-step__subs-section">
          <span className="shoot-step__fixes-label">
            {'\uD83D\uDD04'} {isAssistant ? 'If you don\u2019t have it' : 'Substitutions'}
          </span>
          {data.substitutions.map((sub, i) => (
            <div key={i} className="shoot-step__sub-item">
              {sub.ifMissing && sub.ifMissing !== '\u2014' && (
                <span className="shoot-step__sub-if">Missing: {sub.ifMissing}</span>
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
          <span className="shoot-step__fixes-label">
            {'\uD83E\uDE7A'} {isAssistant ? 'Looks wrong? Flag it' : 'If Something Looks Off'}
          </span>
          {data.diagnostics.map((d, i) => (
            <div key={i} className="shoot-step__diag-item">
              <div className="shoot-step__diag-symptoms">
                {d.symptoms?.map((s, j) => <span key={j} className="shoot-step__diag-tag">{s}</span>)}
              </div>
              {d.fixes?.length > 0 && (
                <div className="shoot-step__diag-fixes">
                  {formatDiagFixes(d.fixes, mode).map((f, j) => (
                    <FixCommand key={j} fix={f} mode={mode} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
