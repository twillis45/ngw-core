import { useState, useEffect, useCallback, useRef } from 'react';
import { useAppState, useDispatch } from '../context/AppContext';
import { saveSetup } from '../data/setupStore';
import { startShootMode } from '../data/shootModeApi';
import { saveShootRole, loadShootRole, saveShootProgress, loadShootProgress } from '../data/shootModeStore';
import { saveMode, loadMode } from '../data/modeStore';
import { createSession, loadSession, clearSession, getShareUrl } from '../data/teamStore';
import { trackEvent } from '../data/analytics';
import usePaywall from '../hooks/usePaywall';
import DiagramCard from '../cards/DiagramCard';
import ShootStepCard from '../components/ShootStepCard';
import ShootLightCard from '../components/ShootLightCard';
import ShootOverlay from '../components/ShootOverlay';
import ShootModePaywall from '../components/ShootModePaywall';

/**
 * ChecklistBlock — collapsible pre/post shoot checklist with local checkbox state.
 */
function ChecklistBlock({ title, icon, items, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  const [checked, setChecked] = useState(() => new Set());

  function toggle(id) {
    setChecked(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const doneCount = items.filter(item => checked.has(item.id)).length;
  const allDone = doneCount === items.length;

  return (
    <div className={`sm-checklist${allDone ? ' sm-checklist--done' : ''}`}>
      <button
        className="sm-checklist__trigger"
        onClick={() => setOpen(v => !v)}
        type="button"
        aria-expanded={open}
      >
        <span className="sm-checklist__icon">{icon}</span>
        <span className="sm-checklist__title">{title}</span>
        <span className="sm-checklist__count">{doneCount}/{items.length}</span>
        <svg
          className={`sm-checklist__chevron${open ? ' sm-checklist__chevron--open' : ''}`}
          width="13" height="13" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <ul className="sm-checklist__list">
          {items.map(item => (
            <li
              key={item.id}
              className={`sm-checklist__item${checked.has(item.id) ? ' sm-checklist__item--checked' : ''}`}
            >
              <button
                className="sm-checklist__row"
                onClick={() => toggle(item.id)}
                type="button"
              >
                <span className="sm-checklist__box" aria-hidden="true">
                  {checked.has(item.id) ? (
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  ) : null}
                </span>
                <span className="sm-checklist__label">{item.label}</span>
              </button>
              {item.note && <p className="sm-checklist__note">{item.note}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * ModeToggle — inline pill toggle for feedback presentation mode.
 * "Photographer" = conversational | "Assistant" = direct commands.
 * "Learn" is a secondary option shown as a smaller pill.
 */
function ModeToggle({ mode, onChange }) {
  return (
    <div className="shoot-mode__mode-toggle" aria-label="Feedback style">
      <button
        className={`shoot-mode__mode-btn${mode === 'photographer' ? ' shoot-mode__mode-btn--active' : ''}`}
        onClick={() => onChange('photographer')}
        title="Conversational instructions with context"
      >
        Photographer
      </button>
      <button
        className={`shoot-mode__mode-btn${mode === 'assistant' ? ' shoot-mode__mode-btn--active' : ''}`}
        onClick={() => onChange('assistant')}
        title="Direct commands only"
      >
        Assistant
      </button>
      <button
        className={`shoot-mode__mode-btn shoot-mode__mode-btn--learn${mode === 'learning' ? ' shoot-mode__mode-btn--active' : ''}`}
        onClick={() => onChange('learning')}
        title="Full explanations with cause and effect"
      >
        Learn
      </button>
    </div>
  );
}

/**
 * Shoot Mode — modular on-set lighting assistant.
 *
 * Three role-based views:
 *   - Photographer: full 6-step workflow
 *   - Assistant: large, swipeable light cards
 *   - Second Shooter: camera settings + test checklist
 */
export default function ShootModeScreen() {
  const { result, ceilingHeight, shootRole, roomDimensions, user, pendingFix } = useAppState();
  const dispatch = useDispatch();
  const userEmail = user?.email || user?.username || null;
  const { isPaid, unlock } = usePaywall(userEmail);

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

  // Phase 6: Lock state — triggered when all steps are completed
  const [matchLocked, setMatchLocked] = useState(false);

  // Phase 8: Team Mode
  const [teamSession, setTeamSession] = useState(() => loadSession());
  const [showTeamShare, setShowTeamShare] = useState(false);
  const [teamCopied, setTeamCopied] = useState(false);

  // Feedback presentation mode — how instructions are phrased
  const [mode, setMode] = useState(() => loadMode());

  // Live View overlay
  const [overlayOpen, setOverlayOpen] = useState(false);

  // Overlay tease — free users see the live view briefly, then hit paywall
  const [teaseRevealed, setTeaseRevealed] = useState(false);
  const teaseTimerRef = useRef(null);

  // Paywall modal
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallVariant, setPaywallVariant] = useState('default');

  // Struggle detection — count step un-checks
  const retryCountRef = useRef(0);
  const [struggleShown, setStruggleShown] = useState(false);

  function handleModeChange(m) {
    setMode(m);
    saveMode(m);
  }

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
      trackEvent('SHOOT_MODE_STARTED', { role: chosenRole, setupName: result?.bestMatch?.name });
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
      const wasCompleted = next.has(key);
      if (wasCompleted) {
        next.delete(key);
        // Struggle detection: user is un-doing steps → they're stuck
        if (!isPaid && !struggleShown) {
          retryCountRef.current += 1;
          if (retryCountRef.current >= 2) {
            setStruggleShown(true);
            setPaywallVariant('struggle');
            setPaywallOpen(true);
          }
        }
      } else next.add(key);

      // Auto-advance to next step when marking done (not when un-checking)
      if (!wasCompleted && currentStep < steps.length - 1) {
        const nextIdx = currentStep + 1;
        setCurrentStep(nextIdx);
        // Scroll the next step into view after a tick
        setTimeout(() => {
          const el = document.querySelector('.shoot-step--active');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
      }

      // Phase 6: Lock detection — all steps completed
      if (!wasCompleted && next.size === steps.length && steps.length > 0) {
        setMatchLocked(true);
        trackEvent('MATCH_ACHIEVED', { setupName: result?.bestMatch?.name, steps: steps.length });
        // If a fix flow is active, mark it complete now
        if (pendingFix) {
          const elapsed = pendingFix.startedAt ? Math.round((Date.now() - pendingFix.startedAt) / 1000) : null;
          trackEvent('fix_flow_completed', {
            symptom_id:   pendingFix.symptomSlug,
            fix_id:       pendingFix.fix,
            pattern_id:   pendingFix.patternId,
            confidence:   pendingFix.confidence,
            elapsed_secs: elapsed,
          });
          dispatch({ type: 'COMPLETE_FIX_FLOW' });
        }
      }

      // Persist
      if (sessionId) {
        saveShootProgress(sessionId, {
          currentStep: (!wasCompleted && currentStep < steps.length - 1) ? currentStep + 1 : currentStep,
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
    if (!isPaid) {
      setPaywallVariant('default');
      setPaywallOpen(true);
      return;
    }
    const bestMatch = result.bestMatch || result.cards?.bestMatch || {};
    saveSetup({ name: bestMatch.name || 'Shoot Mode Setup', tag: 'personal', result });
    setSaved(true);
    trackEvent('SETUP_SAVED', { name: bestMatch.name, source: 'shoot_mode', locked: matchLocked });
    setTimeout(() => setSaved(false), 2500);
  }

  // ── Live view — gated with tease for free users ──
  function handleLiveView() {
    if (!isPaid) {
      setTeaseRevealed(false);
      setOverlayOpen(true);
      // After 2.5s reveal paywall over the live view
      teaseTimerRef.current = setTimeout(() => setTeaseRevealed(true), 2500);
      return;
    }
    setOverlayOpen(true);
  }

  function handleCloseOverlay() {
    if (teaseTimerRef.current) clearTimeout(teaseTimerRef.current);
    setOverlayOpen(false);
    setTeaseRevealed(false);
  }

  function handleTeaseUnlock() {
    if (teaseTimerRef.current) clearTimeout(teaseTimerRef.current);
    setOverlayOpen(false);
    setTeaseRevealed(false);
    unlock();
    setPaywallOpen(false);
  }

  function handlePaywallUnlock() {
    unlock();
    setPaywallOpen(false);
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
    setMatchLocked(false);
  }

  // ── Team Mode ──
  function handleStartTeam() {
    const bestMatch = result?.bestMatch || result?.cards?.bestMatch || {};
    const session = createSession(bestMatch.name || 'Shoot Session');
    setTeamSession(session);
    setShowTeamShare(true);
    trackEvent('SESSION_SHARED', { sessionId: session.id, setupName: bestMatch.name });
  }

  async function handleCopyTeamUrl() {
    if (!teamSession) return;
    const text = getShareUrl(teamSession.id);
    let ok = false;
    // Modern clipboard API (requires HTTPS / localhost)
    if (navigator.clipboard && window.isSecureContext) {
      try { await navigator.clipboard.writeText(text); ok = true; } catch {}
    }
    // Fallback: execCommand (works over HTTP)
    if (!ok) {
      try {
        const el = document.createElement('textarea');
        el.value = text;
        el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
        document.body.appendChild(el);
        el.focus();
        el.select();
        ok = document.execCommand('copy');
        document.body.removeChild(el);
      } catch {}
    }
    if (ok) {
      setTeamCopied(true);
      setTimeout(() => setTeamCopied(false), 2000);
    }
  }

  function handleEndTeam() {
    clearSession();
    setTeamSession(null);
    setShowTeamShare(false);
  }

  // ── Extract data for views ──
  const bestMatch = result.bestMatch || result.cards?.bestMatch || {};
  const detectedDiagramSpec = result.referenceImageAnalysis?.detectedDiagram?.raw;
  const diagram = result.diagram || result.cards?.diagram;

  // ── Role Selector ──
  if (!role) {
    const savedMode = mode; // already loaded from modeStore
    return (
      <div className="screen">
        <div className="shoot-mode__role-selector">
          <h2 className="shoot-mode__role-title">Choose Your Role</h2>
          <p className="shoot-mode__role-subtitle">
            {savedMode === 'assistant'
              ? 'Assistant mode active — pick a view below.'
              : 'Each view is optimized for a different crew position.'}
          </p>

          <button
            className="shoot-mode__role-card"
            onClick={() => handleRoleSelect('photographer')}
          >
            <span className="shoot-mode__role-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
            </span>
            <div className="shoot-mode__role-info">
              <strong>Photographer</strong>
              <span>Full step-by-step workflow with all details</span>
            </div>
          </button>

          <button
            className="shoot-mode__role-card"
            onClick={() => handleRoleSelect('assistant')}
          >
            <span className="shoot-mode__role-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
            </span>
            <div className="shoot-mode__role-info">
              <strong>Assistant</strong>
              <span>Large light cards — one at a time, easy to read</span>
            </div>
          </button>

          <button
            className="shoot-mode__role-card"
            onClick={() => handleRoleSelect('second_shooter')}
          >
            <span className="shoot-mode__role-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
            </span>
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

    // Phase 4: active step's roleKey for diagram highlighting
    const activeStep = steps[currentStep];
    const activeHighlightRole = activeStep?.type === 'light_placement'
      ? activeStep.data?.roleKey
      : null;

    // Derive current adjustment command for overlay from active adjustments step
    const adjustStep = steps.find(s => s.type === 'adjustments');
    const firstFix = adjustStep?.data?.quickFixes?.[0];
    const overlayCommand = firstFix
      ? (typeof firstFix === 'object' && firstFix.fix
          ? { doThis: firstFix.fix, result: null }
          : typeof firstFix === 'string'
          ? { doThis: firstFix, result: null }
          : null)
      : null;

    return (
      <div className="screen shoot-mode">
        {/* Live view overlay — full-screen camera + ghost light guidance */}
        {/* During tease: show real overlay, then reveal paywall over it */}
        {overlayOpen && !teaseRevealed && (
          <ShootOverlay
            currentCommand={isPaid ? overlayCommand : null}
            onClose={handleCloseOverlay}
          />
        )}
        {overlayOpen && teaseRevealed && (
          <ShootModePaywall
            variant="overlay"
            onUnlock={handleTeaseUnlock}
            onClose={handleCloseOverlay}
          />
        )}

        {/* Paywall modal — struggle / save gate / generic */}
        {paywallOpen && (
          <ShootModePaywall
            variant={paywallVariant}
            onUnlock={handlePaywallUnlock}
            onClose={() => setPaywallOpen(false)}
          />
        )}
        {/* Phase 8: Team Mode bar */}
        {teamSession && (
          <div className="shoot-mode__team-bar">
            <span className="shoot-mode__team-badge">Team Mode Active</span>
            <span className="shoot-mode__team-id">#{teamSession.id}</span>
            <button className="shoot-mode__team-copy" onClick={handleCopyTeamUrl} type="button">
              {teamCopied ? '✓ Copied' : 'Copy Link'}
            </button>
            <button className="shoot-mode__team-end" onClick={handleEndTeam} type="button">End</button>
          </div>
        )}

        {/* Phase 8: Team share sheet */}
        {showTeamShare && teamSession && (
          <div className="shoot-mode__team-sheet">
            <div className="shoot-mode__team-sheet-title">Share with your team</div>
            <div className="shoot-mode__team-sheet-url">{getShareUrl(teamSession.id)}</div>
            <button className="btn btn--primary btn--sm" onClick={handleCopyTeamUrl} type="button">
              {teamCopied ? '✓ Copied' : 'Copy Link'}
            </button>
            <button className="btn btn--ghost btn--sm" onClick={() => setShowTeamShare(false)} type="button" style={{ marginLeft: 8 }}>
              Done
            </button>
          </div>
        )}

        {/* Phase 6: Match Lock Banner */}
        {matchLocked && (
          <div className="shoot-mode__lock-banner">
            <div className="shoot-mode__lock-icon">✓</div>
            <div className="shoot-mode__lock-text">
              <strong>Lighting locked — this will hold across shots.</strong>
              <span>{saved ? 'Saved. Reproducible on your next shoot.' : 'Save it. Same result, every time you run it.'}</span>
            </div>
            <button
              className="shoot-mode__lock-save"
              onClick={handleSave}
              disabled={saved}
              type="button"
            >
              {saved ? '✓ Locked' : 'Lock This Setup'}
            </button>
          </div>
        )}

        {/* Setup Header */}
        <div className="shoot-mode__section">
          <div className="shoot-mode__summary">
            <span className="shoot-mode__active-label">Active Setup</span>
            <h2 className="shoot-mode__setup-name">{bestMatch.name}</h2>
            {bestMatch.lightingPattern && (
              <span className="shoot-mode__pattern">{bestMatch.lightingPattern} Pattern</span>
            )}
          </div>
          <div className="shoot-mode__header-actions">
            <button
              className={`shoot-mode__liveview-btn${!isPaid ? ' shoot-mode__liveview-btn--tease' : ''}`}
              onClick={handleLiveView}
              type="button"
              title={isPaid ? 'Live View — camera overlay with light placement guidance' : 'Unlock live guidance'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M3 9a9 9 0 0118 0"/><path d="M3 15a9 9 0 0018 0"/></svg>
              Live
            </button>
            {!teamSession && (
              <button className="shoot-mode__team-btn" onClick={handleStartTeam} type="button" title="Start Team Mode">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
                Team
              </button>
            )}
            <button className="shoot-mode__role-switch" onClick={handleChangeRole}>
              Photographer
              <span className="shoot-mode__role-switch-cta">{'\u2192'} Switch</span>
            </button>
          </div>
        </div>

        {/* Feedback mode toggle */}
        <ModeToggle mode={mode} onChange={handleModeChange} />

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
          {!matchLocked && progressPct >= 75 && progressPct < 100 && (
            <div className="shoot-mode__progress-signal">Final adjustments — setup nearly complete.</div>
          )}
          {matchLocked && (
            <div className="shoot-mode__progress-signal shoot-mode__progress-signal--done">Lighting locked — this will hold across shots.</div>
          )}
        </div>

        {/* Phase 4: Diagram with active light highlighting */}
        {(detectedDiagramSpec || diagram) && (
          <div className="shoot-mode__section">
            <DiagramCard
              spec={detectedDiagramSpec || diagram}
              title="Lighting"
              highlightRole={activeHighlightRole}
            />
          </div>
        )}

        {/* Before You Start checklist */}
        <ChecklistBlock
          title="Before You Start"
          icon="✓"
          defaultOpen={true}
          items={[
            { id: 'power', label: 'Strobes powered on and test-fired' },
            { id: 'trigger', label: 'Trigger synced — test pop confirmed' },
            { id: 'modeling', label: 'Modeling lights on for rough placement' },
            { id: 'modifiers', label: 'Modifiers attached and secure' },
            { id: 'background', label: 'Background in place, no wrinkles' },
            { id: 'card', label: 'Memory card inserted / tethering active' },
            { id: 'subject', label: 'Subject briefed on mark and posing direction' },
          ]}
        />

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
              mode={mode}
            />
          ))}
        </div>

        {/* After Testing checklist */}
        <ChecklistBlock
          title="After Testing"
          icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>}
          defaultOpen={false}
          items={[
            ...(result.goodSigns?.length > 0
              ? result.goodSigns.map((s, i) => ({
                  id: `good-${i}`,
                  label: typeof s === 'string' ? s : s.text,
                }))
              : [
                  { id: 'catchlight', label: 'Catchlight shape and position look correct' },
                  { id: 'shadow', label: 'Shadow edge softness matches the reference' },
                  { id: 'highlight', label: 'Highlight placement is where you intended' },
                  { id: 'exposure', label: 'Histogram clean — no blown highlights or crushed blacks' },
                ]),
            ...(result.warnings?.length > 0
              ? result.warnings.map((w, i) => ({
                  id: `warn-${i}`,
                  label: typeof w === 'string' ? w : w.text,
                  note: 'Watch for this',
                }))
              : []),
            { id: 'spill', label: 'No unwanted spill onto background' },
            { id: 'separation', label: 'Subject separates cleanly from background' },
          ]}
        />

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
            {saved ? '\u2713 Locked' : 'Lock'}
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
            Assistant
            <span className="shoot-mode__role-switch-cta">{'\u2192'} Switch</span>
          </button>
        </div>

        {/* Feedback mode toggle */}
        <ModeToggle mode={mode} onChange={handleModeChange} />

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
            Second Shooter
            <span className="shoot-mode__role-switch-cta">{'\u2192'} Switch</span>
          </button>
        </div>

        {/* Feedback mode toggle */}
        <ModeToggle mode={mode} onChange={handleModeChange} />

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
                {cameraStep.tips[0]}
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
            mode={mode}
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
