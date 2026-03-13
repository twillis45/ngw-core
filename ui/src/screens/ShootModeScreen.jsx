import { useState, useEffect, useCallback } from 'react';
import { useAppState, useDispatch } from '../context/AppContext';
import { saveSetup } from '../data/setupStore';
import { startShootMode } from '../data/shootModeApi';
import { saveShootRole, loadShootRole, saveShootProgress, loadShootProgress } from '../data/shootModeStore';
import DiagramCard from '../cards/DiagramCard';
import ShootStepCard from '../components/ShootStepCard';
import ShootLightCard from '../components/ShootLightCard';

/**
 * Shoot Mode — modular on-set lighting assistant.
 *
 * Three role-based views:
 *   - Photographer: full 6-step workflow
 *   - Assistant: large, swipeable light cards
 *   - Second Shooter: camera settings + test checklist
 */
export default function ShootModeScreen() {
  const { result, ceilingHeight, shootRole, roomDimensions } = useAppState();
  const dispatch = useDispatch();

  // Local state
  const [role, setRole] = useState(shootRole || loadShootRole() || null);
  const [steps, setSteps] = useState([]);
  const [metadata, setMetadata] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  // Assistant view: current light index
  const [lightIdx, setLightIdx] = useState(0);

  // ── No result guard ──
  if (!result) {
    return (
      <div className="screen">
        <div className="shoot-mode__empty">
          <p>No setup loaded.</p>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
            Run a recommendation first, then open Shoot Mode from the results.
          </p>
          <button
            className="btn btn--primary btn--sm"
            onClick={() => dispatch({ type: 'GO_BACK' })}
            style={{ marginTop: 'var(--space-md)' }}
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  // ── Fetch steps when role is chosen ──
  const fetchSteps = useCallback(async (chosenRole) => {
    setLoading(true);
    setError(null);
    try {
      const resp = await startShootMode(result, ceilingHeight, chosenRole, roomDimensions);
      setSteps(resp.steps || []);
      setMetadata(resp.metadata || {});
      setSessionId(resp.sessionId);

      // Restore progress if available
      if (resp.sessionId) {
        const saved = loadShootProgress(resp.sessionId);
        if (saved) {
          setCurrentStep(saved.currentStep || 0);
          setCompletedSteps(new Set(saved.completedSteps || []));
        }
      }
    } catch (e) {
      setError(e.message || 'Failed to load shoot mode');
    } finally {
      setLoading(false);
    }
  }, [result, ceilingHeight, roomDimensions]);

  useEffect(() => {
    if (role) {
      fetchSteps(role);
    }
  }, [role, fetchSteps]);

  // ── Role selection handler ──
  function handleRoleSelect(r) {
    setRole(r);
    saveShootRole(r);
    dispatch({ type: 'SET_SHOOT_ROLE', role: r });
  }

  // Guaranteed-unique step key (guards against duplicate/missing step IDs)
  function stepKey(step, idx) {
    return step.id != null ? `${step.id}` : `step-${idx}`;
  }

  // ── Step completion toggle ──
  function toggleStepComplete(key) {
    setCompletedSteps(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);

      // Persist
      if (sessionId) {
        saveShootProgress(sessionId, {
          currentStep,
          completedSteps: [...next],
          role,
          startedAt: new Date().toISOString(),
        });
      }
      return next;
    });
  }

  // ── Navigate steps ──
  function goToStep(idx) {
    if (idx >= 0 && idx < steps.length) {
      setCurrentStep(idx);
      if (sessionId) {
        saveShootProgress(sessionId, {
          currentStep: idx,
          completedSteps: [...completedSteps],
          role,
          startedAt: new Date().toISOString(),
        });
      }
    }
  }

  // ── Save setup ──
  function handleSave() {
    const bestMatch = result.bestMatch || result.cards?.bestMatch || {};
    saveSetup({ name: bestMatch.name || 'Shoot Mode Setup', tag: 'personal', result });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  // ── Shot Match navigation ──
  function handleShotMatch() {
    dispatch({ type: 'SET_APP_MODE', mode: 'shot_match' });
    dispatch({ type: 'NAVIGATE', screen: 'shot_match' });
  }

  // ── Change role ──
  function handleChangeRole() {
    setRole(null);
    setSteps([]);
    setMetadata(null);
    setCurrentStep(0);
    setCompletedSteps(new Set());
  }

  // ── Extract data for views ──
  const bestMatch = result.bestMatch || result.cards?.bestMatch || {};
  const detectedDiagramSpec = result.referenceImageAnalysis?.detectedDiagram?.raw;
  const diagram = result.diagram || result.cards?.diagram;

  // ── Role Selector ──
  if (!role) {
    return (
      <div className="screen">
        <div className="shoot-mode__role-selector">
          <h2 className="shoot-mode__role-title">Choose Your Role</h2>
          <p className="shoot-mode__role-subtitle">
            Each view is optimized for a different crew position.
          </p>

          <button
            className="shoot-mode__role-card"
            onClick={() => handleRoleSelect('photographer')}
          >
            <span className="shoot-mode__role-icon">{'\uD83D\uDCF7'}</span>
            <div className="shoot-mode__role-info">
              <strong>Photographer</strong>
              <span>Full step-by-step workflow with all details</span>
            </div>
          </button>

          <button
            className="shoot-mode__role-card"
            onClick={() => handleRoleSelect('assistant')}
          >
            <span className="shoot-mode__role-icon">{'\uD83D\uDCA1'}</span>
            <div className="shoot-mode__role-info">
              <strong>Assistant</strong>
              <span>Large light cards — one at a time, easy to read</span>
            </div>
          </button>

          <button
            className="shoot-mode__role-card"
            onClick={() => handleRoleSelect('second_shooter')}
          >
            <span className="shoot-mode__role-icon">{'\uD83C\uDFAC'}</span>
            <div className="shoot-mode__role-info">
              <strong>Second Shooter</strong>
              <span>Camera settings and framing guide</span>
            </div>
          </button>
        </div>
      </div>
    );
  }

  // ── Loading state ──
  if (loading) {
    return (
      <div className="screen">
        <div className="shoot-mode__empty">
          <p>Preparing your setup...</p>
        </div>
      </div>
    );
  }

  // ── Error state ──
  if (error) {
    return (
      <div className="screen">
        <div className="shoot-mode__empty">
          <p>Error: {error}</p>
          <button
            className="btn btn--primary btn--sm"
            onClick={() => fetchSteps(role)}
            style={{ marginTop: 'var(--space-md)' }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ── PHOTOGRAPHER VIEW ──
  if (role === 'photographer') {
    const completedCount = completedSteps.size;
    const totalCount = steps.length;
    const progressPct = totalCount > 0
      ? Math.min(100, Math.round((completedCount / totalCount) * 100))
      : 0;

    return (
      <div className="screen shoot-mode">
        {/* Setup Header */}
        <div className="shoot-mode__section">
          <div className="shoot-mode__summary">
            <h2 className="shoot-mode__setup-name">{bestMatch.name}</h2>
            {bestMatch.lightingPattern && (
              <span className="shoot-mode__pattern">{bestMatch.lightingPattern} Pattern</span>
            )}
          </div>
          <button className="shoot-mode__role-switch" onClick={handleChangeRole}>
            {'\uD83D\uDCF7'} Photographer &middot; Change
          </button>
        </div>

        {/* Progress Bar */}
        <div className="shoot-mode__progress">
          <div className="shoot-mode__progress-text">
            Step {currentStep + 1} of {totalCount} &middot; {progressPct}% complete
          </div>
          <div className="shoot-mode__progress-track">
            <div
              className="shoot-mode__progress-fill"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          {metadata?.estimatedMinutes && (
            <div className="shoot-mode__progress-time">
              ~{metadata.estimatedMinutes} min estimated
            </div>
          )}
        </div>

        {/* Diagram (collapsible) */}
        {(detectedDiagramSpec || diagram) && (
          <div className="shoot-mode__section">
            <DiagramCard spec={detectedDiagramSpec || diagram} title="Lighting" />
          </div>
        )}

        {/* Step Cards */}
        <div className="shoot-mode__steps">
          {steps.map((step, idx) => (
            <ShootStepCard
              key={stepKey(step, idx)}
              step={step}
              isActive={idx === currentStep}
              isCompleted={completedSteps.has(stepKey(step, idx))}
              onComplete={() => toggleStepComplete(stepKey(step, idx))}
              totalSteps={totalCount}
            />
          ))}
        </div>

        {/* Sticky Action Bar */}
        <div className="shoot-mode__actions">
          <button
            className="shoot-mode__action-btn"
            onClick={() => goToStep(currentStep - 1)}
            disabled={currentStep <= 0}
          >
            {'\u25C0'} Prev
          </button>
          <button
            className="shoot-mode__action-btn"
            onClick={handleSave}
            disabled={saved}
          >
            {saved ? '\u2713 Saved' : 'Save'}
          </button>
          <button
            className="shoot-mode__action-btn shoot-mode__action-btn--primary"
            disabled={loading || steps.length === 0}
            onClick={() => {
              if (steps.length === 0) return;
              if (currentStep < steps.length - 1) {
                goToStep(currentStep + 1);
              } else {
                handleShotMatch();
              }
            }}
          >
            {currentStep < steps.length - 1 ? 'Next \u25B6' : 'Verify'}
          </button>
        </div>

        {/* Bottom spacer for sticky bar */}
        <div style={{ height: 80 }} />
      </div>
    );
  }

  // ── ASSISTANT VIEW ──
  if (role === 'assistant') {
    const lightSteps = steps.filter(s => s.type === 'light_placement');
    const totalLights = lightSteps.length;
    const currentLight = lightSteps[lightIdx] || null;

    if (!currentLight) {
      return (
        <div className="screen">
          <div className="shoot-mode__empty">
            <p>No lights in this setup.</p>
            <button className="btn btn--primary btn--sm" onClick={handleChangeRole}>
              Change Role
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="screen shoot-mode">
        {/* Header */}
        <div className="shoot-mode__section">
          <div className="shoot-mode__summary">
            <h2 className="shoot-mode__setup-name">{bestMatch.name}</h2>
          </div>
          <button className="shoot-mode__role-switch" onClick={handleChangeRole}>
            {'\uD83D\uDCA1'} Assistant &middot; Change
          </button>
        </div>

        {/* Large Light Card */}
        <ShootLightCard
          light={currentLight.data}
          stepNumber={lightIdx + 1}
          totalLights={totalLights}
          warnings={currentLight.warnings}
          onPrev={() => setLightIdx(i => Math.max(0, i - 1))}
          onNext={() => setLightIdx(i => Math.min(totalLights - 1, i + 1))}
        />

        {/* Done indicator */}
        <div className="shoot-mode__actions">
          <button
            className="shoot-mode__action-btn"
            onClick={handleChangeRole}
          >
            Change Role
          </button>
          <button
            className="shoot-mode__action-btn shoot-mode__action-btn--primary"
            onClick={() => dispatch({ type: 'GO_BACK' })}
          >
            Done
          </button>
        </div>
        <div style={{ height: 80 }} />
      </div>
    );
  }

  // ── SECOND SHOOTER VIEW ──
  if (role === 'second_shooter') {
    const cameraStep = steps.find(s => s.type === 'camera_setup');
    const testStep = steps.find(s => s.type === 'test_exposure');

    return (
      <div className="screen shoot-mode">
        {/* Header */}
        <div className="shoot-mode__section">
          <div className="shoot-mode__summary">
            <h2 className="shoot-mode__setup-name">{bestMatch.name}</h2>
          </div>
          <button className="shoot-mode__role-switch" onClick={handleChangeRole}>
            {'\uD83C\uDFAC'} Second Shooter &middot; Change
          </button>
        </div>

        {/* Camera Settings — large */}
        {cameraStep && (
          <div className="shoot-mode__section">
            <h3 className="shoot-mode__section-title">Camera Settings</h3>
            <div className="shoot-mode__camera-grid shoot-mode__camera-grid--large">
              {cameraStep.data.aperture && (
                <div className="shoot-mode__camera-item">
                  <span className="shoot-mode__camera-label">Aperture</span>
                  <span className="shoot-mode__camera-value shoot-mode__camera-value--large">
                    {cameraStep.data.aperture}
                  </span>
                </div>
              )}
              {cameraStep.data.iso && (
                <div className="shoot-mode__camera-item">
                  <span className="shoot-mode__camera-label">ISO</span>
                  <span className="shoot-mode__camera-value shoot-mode__camera-value--large">
                    {cameraStep.data.iso}
                  </span>
                </div>
              )}
              {cameraStep.data.shutter && (
                <div className="shoot-mode__camera-item">
                  <span className="shoot-mode__camera-label">Shutter</span>
                  <span className="shoot-mode__camera-value shoot-mode__camera-value--large">
                    {cameraStep.data.shutter}
                  </span>
                </div>
              )}
              {cameraStep.data.wb && (
                <div className="shoot-mode__camera-item">
                  <span className="shoot-mode__camera-label">White Balance</span>
                  <span className="shoot-mode__camera-value shoot-mode__camera-value--large">
                    {cameraStep.data.wb}
                  </span>
                </div>
              )}
            </div>
            {cameraStep.tips?.length > 0 && (
              <div className="shoot-mode__tip-line">
                {'\uD83D\uDCA1'} {cameraStep.tips[0]}
              </div>
            )}
          </div>
        )}

        {/* Test Checklist */}
        {testStep && (
          <ShootStepCard
            step={testStep}
            isActive={true}
            isCompleted={completedSteps.has(stepKey(testStep, steps.indexOf(testStep)))}
            onComplete={() => toggleStepComplete(stepKey(testStep, steps.indexOf(testStep)))}
            totalSteps={steps.length}
          />
        )}

        {/* Action Bar */}
        <div className="shoot-mode__actions">
          <button
            className="shoot-mode__action-btn"
            onClick={handleChangeRole}
          >
            Change Role
          </button>
          <button
            className="shoot-mode__action-btn shoot-mode__action-btn--primary"
            onClick={handleShotMatch}
          >
            Verify
          </button>
        </div>
        <div style={{ height: 80 }} />
      </div>
    );
  }

  // Fallback
  return null;
}
