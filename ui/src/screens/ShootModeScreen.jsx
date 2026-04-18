import { useState, useEffect, useCallback, useRef } from 'react';
import { useAppState, useDispatch } from '../context/AppContext';
import { saveSetup } from '../data/setupStore';
import { startShootMode } from '../data/shootModeApi';
import { saveShootRole, loadShootRole, saveShootProgress, loadShootProgress } from '../data/shootModeStore';
import { saveMode } from '../data/modeStore';
import useMode from '../hooks/useMode';
import { createSession, loadSession, clearSession, getShareUrl } from '../data/teamStore';
import { trackEvent } from '../data/analytics';
import usePaywall, { resolveUserEmail } from '../hooks/usePaywall';
import usePreviewMode from '../hooks/usePreviewMode';
import useSettings from '../hooks/useSettings';
import useWakeLock from '../hooks/useWakeLock';
import DiagramCard from '../cards/DiagramCard';
import ShootStepCard from '../components/ShootStepCard';
import ShootLightCard from '../components/ShootLightCard';
import ShootOverlay from '../components/ShootOverlay';
import ShootModePaywall from '../components/ShootModePaywall';
import OutcomeCapture from '../components/OutcomeCapture';

/**
 * ChecklistBlock — collapsible pre/post shoot checklist with local checkbox state.
 */
function ChecklistBlock({ title, icon, items, defaultOpen = true, mode = 'photographer', storageKey = null }) {
  const [open, setOpen] = useState(defaultOpen);
  const [checked, setChecked] = useState(() => {
    if (!storageKey) return new Set();
    try {
      const raw = sessionStorage.getItem(`ngw_checklist_${storageKey}`);
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch { return new Set(); }
  });

  function toggle(id) {
    setChecked(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      if (storageKey) {
        try { sessionStorage.setItem(`ngw_checklist_${storageKey}`, JSON.stringify([...next])); } catch {}
      }
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
              {item.note && <p className={`sm-checklist__note${mode === 'learning' ? ' sm-checklist__note--learn' : ''}`}>{item.note}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── Mode-aware checklist item sets ── */
const PRE_SHOOT_ITEMS = {
  photographer: [
    { id: 'power',      label: 'Strobes powered on and test-fired' },
    { id: 'trigger',    label: 'Trigger synced — test pop confirmed' },
    { id: 'modeling',   label: 'Modeling lights on for rough placement' },
    { id: 'modifiers',  label: 'Modifiers attached and secure' },
    { id: 'background', label: 'Background in place, no wrinkles' },
    { id: 'card',       label: 'Memory card inserted / tethering active' },
    { id: 'subject',    label: 'Subject briefed on mark and posing direction' },
  ],
  assistant: [
    { id: 'power',      label: 'Strobes on, test fired' },
    { id: 'trigger',    label: 'Trigger synced' },
    { id: 'modifiers',  label: 'Modifiers on' },
    { id: 'background', label: 'Background set' },
    { id: 'card',       label: 'Card in / tethered' },
    { id: 'subject',    label: 'Subject on mark' },
  ],
  learning: [
    { id: 'power',      label: 'Strobes powered on and test-fired', note: 'Test firing recycles the capacitors and confirms TTL/manual settings are active before you burn a frame.' },
    { id: 'trigger',    label: 'Trigger synced — test pop confirmed', note: 'A missed sync means a black frame at fast shutter speeds — verify before the subject arrives.' },
    { id: 'modeling',   label: 'Modeling lights on for rough placement', note: 'Modeling lights preview the shadow direction and modifier spread so you can rough-position without test frames.' },
    { id: 'modifiers',  label: 'Modifiers attached and secure', note: 'Loose speedrings or grids shift quality and direction mid-shoot without a visible cue.' },
    { id: 'background', label: 'Background in place, no wrinkles', note: 'Wrinkles catch specular from the key light and read as distracting highlights in the final image.' },
    { id: 'card',       label: 'Memory card inserted / tethering active', note: 'Shooting without a card is a silent failure — confirm before the subject is under lights.' },
    { id: 'subject',    label: 'Subject briefed on mark and posing direction', note: 'A defined mark keeps the subject within the zone of correct exposure and focus distance.' },
  ],
};

function getSkinToneCheckItems(skinToneAdj, mode) {
  if (!skinToneAdj) return [];
  const tone = skinToneAdj.skinTone;

  const items = [];

  if (tone === 'dark') {
    items.push(
      { id: 'st-exposure', label: mode === 'assistant' ? 'Exposure +2/3–1 stop set' : 'Exposure set +2/3 to +1 stop over meter — dark skin is routinely underexposed by cameras',
        ...(mode === 'learning' ? { note: 'Camera meters assume 18% grey — dark skin absorbs more light so it falls below that target. Add exposure before you shoot, not after.' } : {}) },
      { id: 'st-histogram', label: mode === 'assistant' ? 'Histogram right-third (not clipping)' : 'Histogram: skin data sits in right third, no clipping — ETTR for dark skin',
        ...(mode === 'learning' ? { note: 'Expose to the right (ETTR) — dark skin detail lives in the shadow-to-midtone transition. Clipped highlights are recoverable; crushed shadows are not.' } : {}) },
      { id: 'st-shadow-detail', label: mode === 'assistant' ? 'Shadow detail visible (zoom in)' : 'Zoom in: shadow-side skin shows detail, not crushed black',
        ...(mode === 'learning' ? { note: 'Deep shadows on dark skin lose texture fast. Lower fill ratio (1.5:1 to 2:1) is more forgiving — increase fill before reducing exposure.' } : {}) },
      { id: 'st-wb', label: mode === 'assistant' ? 'WB locked — daylight 5500K' : 'White balance locked to Daylight (5500K) — not Auto',
        ...(mode === 'learning' ? { note: 'AWB drifts across a session. Lock to Daylight (5500K) or slightly cool (5200–5400K) to preserve the natural richness of dark skin tones.' } : {}) },
    );
  } else if (tone === 'light') {
    items.push(
      { id: 'st-highlight', label: mode === 'assistant' ? 'Highlight specular check' : 'No blown specular highlights on skin — light skin clips fast',
        ...(mode === 'learning' ? { note: 'Light skin reflects more — back off key power 1/3 stop if the right histogram edge clips. Specular on skin reads as overexposed even at zero histogram warning.' } : {}) },
    );
  } else if (tone === 'mixed') {
    items.push(
      { id: 'st-darkest', label: mode === 'assistant' ? 'Exposed for darkest subject' : 'Exposure locked to darkest subject — lighter subjects will hold',
        ...(mode === 'learning' ? { note: 'Underexposing dark skin cannot be fixed in post. Lock exposure to the darkest subject; lighter subjects will have recoverable highlights.' } : {}) },
      { id: 'st-mixed-wb', label: mode === 'assistant' ? 'WB locked — not Auto' : 'White balance locked (5500K) — never Auto across a multi-subject run',
        ...(mode === 'learning' ? { note: 'AWB shifts between subjects, changing apparent skin tone consistency. Set once on your lightest subject, lock, and do not touch.' } : {}) },
    );
  }

  return items;
}

function getPostShootItems(mode, goodSigns, warnings, skinToneAdj = null) {
  const skinItems = getSkinToneCheckItems(skinToneAdj, mode);
  const evalItems = [
    ...(goodSigns?.length > 0
      ? goodSigns.map((s, i) => ({ id: `good-${i}`, label: typeof s === 'string' ? s : s.text }))
      : [
          { id: 'catchlight', label: mode === 'assistant' ? 'Catchlight correct' : 'Catchlight shape and position look correct' },
          { id: 'shadow',     label: mode === 'assistant' ? 'Shadow edge matches ref' : 'Shadow edge softness matches the reference' },
          { id: 'highlight',  label: mode === 'assistant' ? 'Highlights where intended' : 'Highlight placement is where you intended' },
          { id: 'exposure',   label: mode === 'assistant' ? 'Histogram clean' : 'Histogram clean — no blown highlights or crushed blacks' },
        ]),
    ...(warnings?.length > 0
      ? warnings.map((w, i) => ({ id: `warn-${i}`, label: typeof w === 'string' ? w : w.text, note: 'Watch for this' }))
      : []),
    { id: 'spill',      label: mode === 'assistant' ? 'No background spill' : 'No unwanted spill onto background',
      ...(mode === 'learning' ? { note: 'Spill from the key or fill washing the background reduces separation and can blow out a white background unevenly.' } : {}) },
    { id: 'separation', label: mode === 'assistant' ? 'Subject separates cleanly' : 'Subject separates cleanly from background',
      ...(mode === 'learning' ? { note: 'Separation is driven by the ratio between background light and rim/hair light — adjust independently if this fails.' } : {}) },
    ...skinItems,
  ];
  return evalItems;
}

const MODE_META = {
  photographer: {
    label: 'Photographer',
    tagline: 'Full context — placement, rationale, pro tips',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
      </svg>
    ),
  },
  assistant: {
    label: 'Assistant',
    tagline: 'Commands only — no context, faster scanning',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
      </svg>
    ),
  },
  learning: {
    label: 'Learning',
    tagline: 'Cause & effect — explains why each step works',
    icon: (
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/>
      </svg>
    ),
  },
};

/**
 * ModeToggle — inline pill toggle for feedback presentation mode.
 */
function ModeToggle({ mode, onChange }) {
  const active = MODE_META[mode] || MODE_META.photographer;
  return (
    <div className="shoot-mode__mode-toggle" aria-label="Feedback style">
      <div className="shoot-mode__mode-pills">
        {Object.entries(MODE_META).map(([key, meta]) => (
          <button
            key={key}
            className={`shoot-mode__mode-btn shoot-mode__mode-btn--${key}${mode === key ? ` shoot-mode__mode-btn--active shoot-mode__mode-btn--active-${key}` : ''}`}
            onClick={() => onChange(key)}
            title={meta.tagline}
          >
            <span className="shoot-mode__mode-icon">{meta.icon}</span>
            {meta.label}
          </button>
        ))}
      </div>
      <div className="shoot-mode__mode-tagline">{active.tagline}</div>
    </div>
  );
}

/**
 * Shoot Mode — modular on-set lighting assistant.
 *
 * Three role-based views:
 *   - Photographer: full 6-step workflow
 *   - Assistant: large, swipeable light cards
 *   - Learning: cause & effect — explains why each step works
 */
export default function ShootModeScreen() {
  const { result, ceilingHeight, shootRole, roomDimensions, user, pendingFix } = useAppState();
  const dispatch = useDispatch();
  const userEmail = resolveUserEmail(user);
  const { isPaid, unlock } = usePaywall(userEmail);
  const { access: previewAccess } = usePreviewMode();
  const effectiveIsPaid = previewAccess !== null
    ? (previewAccess === 'paid' || previewAccess === 'admin')
    : isPaid;
  const { shootModeStyle } = useSettings();
  const isChecklistMode = shootModeStyle === 'checklist';
  const { isActive: wakeLockActive } = useWakeLock(!!result);

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

  // SM-1: "More" menu — surfaces Team, Role Switch, Save from ••• button
  const [moreOpen, setMoreOpen] = useState(false);

  // Feedback presentation mode — reactive to Settings changes
  const _persistedMode = useMode();
  const [modeOverride, setModeOverride] = useState(null);
  const mode = modeOverride ?? _persistedMode;

  // Live View overlay
  const [overlayOpen, setOverlayOpen] = useState(false);

  // Overlay tease — free users see the live view briefly, then hit paywall
  const [teaseRevealed, setTeaseRevealed] = useState(false);
  const teaseTimerRef = useRef(null);

  // Paywall modal
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [paywallVariant, setPaywallVariant] = useState('default');

  // Test Shot verification mode (Figma: Cockpit -- Test Shot)
  const [testShotMode, setTestShotMode] = useState(false);
  const [testShotChecks, setTestShotChecks] = useState(new Set());

  // Struggle detection — count step un-checks
  const retryCountRef = useRef(0);
  const [struggleShown, setStruggleShown] = useState(false);

  function handleModeChange(m) {
    setModeOverride(m);
    saveMode(m);
  }

  // Assistant view: current light index
  const [lightIdx, setLightIdx] = useState(0);

  // ── No result guard ──
  if (!result) {
    return (
      <div className="screen">
        <div className="shoot-mode__empty">
          <p style={{ fontWeight: 600, marginBottom: 6 }}>No setup loaded</p>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 16 }}>
            Load a saved setup or run a new analysis to get your step-by-step shoot guide.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              className="btn btn--primary btn--sm"
              onClick={() => dispatch({ type: 'NAVIGATE', screen: 'saved_setups' })}
            >
              Load Saved Setup
            </button>
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => dispatch({ type: 'NAVIGATE', screen: 'home' })}
            >
              Run New Analysis
            </button>
          </div>
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
        if (!effectiveIsPaid && !struggleShown) {
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
    if (!effectiveIsPaid) {
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
    if (!effectiveIsPaid) {
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
    // Enter test shot verification mode instead of navigating away
    setTestShotMode(true);
    setTestShotChecks(new Set());
    trackEvent('TEST_SHOT_STARTED', { setupName: (result?.bestMatch || {}).name });
  }

  function handleTestShotRetest() {
    setTestShotChecks(new Set());
    trackEvent('TEST_SHOT_RETEST');
  }

  function toggleTestShotCheck(id) {
    setTestShotChecks(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
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

  // ── Role fallback ──
  // Role selection now happens via bottom sheet on SetupSheetScreen.
  // If somehow no role is set (e.g. direct nav), default to photographer.
  if (!role) {
    handleRoleSelect('photographer');
    return null;
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
            currentCommand={effectiveIsPaid ? overlayCommand : null}
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

        {/* Phase 6: Match Lock — Figma "Cockpit -- Locked" panel */}
        {matchLocked && (
          <div className="sm-locked">
            <div className="sm-locked__check">✓</div>
            <h3 className="sm-locked__title">Setup Locked</h3>
            <p className="sm-locked__subtitle">This lighting will hold across shots.</p>
            <button
              className="sm-locked__save-cta"
              onClick={handleSave}
              disabled={saved}
              type="button"
            >
              {saved ? '✓ Saved' : 'Save This Setup'}
            </button>
            <button
              className="sm-locked__share-btn"
              onClick={handleStartTeam}
              type="button"
            >
              Share with Team
            </button>
            <button
              className="sm-locked__feedback-link"
              onClick={() => {
                trackEvent('SHOOT_MODE_FEEDBACK_PROMPT');
              }}
              type="button"
            >
              How did it go?
            </button>
          </div>
        )}

        {/* Setup Header — clean hero: setup name + pattern only.
            SM-1+SM-2: Live (already in bottom bar), Team, and Role Switch
            moved out of header. Team/Role accessible via ••• bottom bar button. */}
        <div className="shoot-mode__cockpit-header">
          <div className="shoot-mode__summary">
            <h2 className="shoot-mode__setup-name">{bestMatch.name}</h2>
            <span className="shoot-mode__pattern">
              {bestMatch.lightingPattern ? `${bestMatch.lightingPattern} Pattern` : ''}
              {wakeLockActive && ' · Screen Awake'}
            </span>
          </div>
        </div>

        {/* ── Tablet split layout ──────────────────────────────────────
            sm-split__diagram (left): diagram + light specs
            sm-split__panel  (right): mode toggle, progress, checklists
            On mobile both divs are flex-ordered: panel first, diagram second
            so the current mobile hierarchy is preserved.
            ──────────────────────────────────────────────────────────── */}
        <div className="sm-split">

          {/* LEFT: diagram + per-light specs (order: 2 on mobile, col 1 on tablet) */}
          <div className="sm-split__diagram">
            {/* Phase 4: Diagram with active light highlighting */}
            {(detectedDiagramSpec || diagram) && (
              <div className="shoot-mode__section">
                <DiagramCard
                  spec={detectedDiagramSpec || diagram}
                  title="Lighting"
                  highlightRole={activeHighlightRole}
                  cameraSettings={result.cameraSettings}
                  spaceCheck={result.spaceCheck}
                  roomDimensions={roomDimensions}
                />
              </div>
            )}

            {/* Per-light props grid — compact at-a-glance reference */}
            {steps.filter(s => s.type === 'light_placement').length > 0 && (() => {
              const lightSteps = steps.filter(s => s.type === 'light_placement');
              return (
                <div className="shoot-mode__light-specs">
                  <span className="shoot-mode__section-title">Light Specs</span>
                  <div className="shoot-mode__light-specs-grid">
                    {lightSteps.map((step, i) => {
                      const l = step.data;
                      const rows = [
                        l.height      && { label: 'Height',    value: l.height },
                        l.distance    && { label: 'Distance',  value: l.distance },
                        l.angle       && { label: 'Angle',     value: l.angle },
                        l.direction   && { label: 'Direction', value: l.direction },
                        l.powerHint   && { label: 'Power',     value: l.powerHint },
                        l.featherHint && { label: 'Feather',   value: l.featherHint },
                      ].filter(Boolean);
                      return (
                        <div key={i} className="shoot-mode__light-spec-card">
                          <div
                            className="shoot-mode__light-spec-role"
                            style={{ color: l.roleColor || 'var(--color-accent)' }}
                          >
                            {l.roleKey?.toUpperCase() || `LIGHT ${i + 1}`}
                          </div>
                          {l.modifier && (
                            <div className="shoot-mode__light-spec-modifier">{l.modifier}</div>
                          )}
                          <div className="shoot-mode__light-spec-rows">
                            {rows.map(row => (
                              <div key={row.label} className="shoot-mode__light-spec-row">
                                <span className="shoot-mode__light-spec-label">{row.label}</span>
                                <span className="shoot-mode__light-spec-value">{row.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>{/* end sm-split__diagram */}

          {/* RIGHT: mode toggle, progress bar, checklists, steps (order: 1 on mobile) */}
          <div className="sm-split__panel">
            {/* Feedback mode toggle */}
            <ModeToggle mode={mode} onChange={handleModeChange} />

            {/* SM-4: Minimal progress — step fraction + thin bar only */}
            <div className="shoot-mode__progress">
              <div className="shoot-mode__progress-text">
                Step {currentStep + 1} of {totalCount}
                {matchLocked && <span className="shoot-mode__progress-signal shoot-mode__progress-signal--done"> · Locked</span>}
              </div>
              <div className="shoot-mode__progress-track">
                <div
                  className="shoot-mode__progress-fill"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

        {/* Before You Start checklist */}
        <ChecklistBlock
          title="Before You Start"
          icon="✓"
          defaultOpen={true}
          mode={mode}
          items={PRE_SHOOT_ITEMS[mode] || PRE_SHOOT_ITEMS.photographer}
          storageKey="pre_shoot"
        />

        {/* Step Cards — checklist mode: all expanded; step mode: one active */}
        <div className={`shoot-mode__steps${isChecklistMode ? ' shoot-mode__steps--checklist' : ''}`}>
          {steps.map((step, idx) => (
            <ShootStepCard
              key={stepKey(step, idx)}
              step={step}
              isActive={isChecklistMode ? true : idx === currentStep}
              isCompleted={completedSteps.has(stepKey(step, idx))}
              onComplete={() => toggleStepComplete(stepKey(step, idx))}
              totalSteps={totalCount}
              mode={mode}
            />
          ))}
        </div>

        {/* Test Shot Verification Panel — Figma "Cockpit -- Test Shot" */}
        {testShotMode && !matchLocked && (() => {
          const testItems = getPostShootItems(mode, result.goodSigns, result.warnings, result.skinToneAdjustments);
          return (
            <div className="sm-test-shot">
              <span className="sm-test-shot__label">TEST SHOT</span>
              <h3 className="sm-test-shot__title">Verify your setup</h3>
              <div className="sm-test-shot__divider" />
              <ul className="sm-test-shot__list">
                {testItems.map(item => {
                  const checked = testShotChecks.has(item.id);
                  return (
                    <li key={item.id} className="sm-test-shot__item">
                      <button
                        className={`sm-test-shot__check${checked ? ' sm-test-shot__check--done' : ''}`}
                        onClick={() => toggleTestShotCheck(item.id)}
                        type="button"
                        aria-label={checked ? `${item.label} — done` : item.label}
                      >
                        {checked && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        )}
                      </button>
                      <span className={`sm-test-shot__label-text${checked ? ' sm-test-shot__label-text--done' : ''}`}>
                        {item.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="sm-test-shot__hint">Tap each item after checking your test frame</p>
            </div>
          );
        })()}

        {/* After Testing checklist (shown when not in test-shot mode) */}
        {!testShotMode && (
          <ChecklistBlock
            title="After Testing"
            icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>}
            defaultOpen={false}
            mode={mode}
            items={getPostShootItems(mode, result.goodSigns, result.warnings, result.skinToneAdjustments)}
            storageKey="post_shoot"
          />
        )}
          </div>{/* end sm-split__panel */}
        </div>{/* end sm-split */}

        {/* SM-3: Context-specific bottom bars — each state gets its own
            clear layout instead of one button with 4 swapping labels. */}
        {testShotMode && !matchLocked && (
          <div className="sm-bottom-bar sm-bottom-bar--test">
            <button className="sm-bottom-bar__secondary" onClick={() => { setTestShotMode(false); setTestShotChecks(new Set()); }} type="button">
              Cancel
            </button>
            <button className="sm-bottom-bar__center" onClick={handleTestShotRetest} type="button">
              Retest
            </button>
            <div style={{ width: 48 }} />
          </div>
        )}
        {matchLocked && (
          <div className="sm-bottom-bar sm-bottom-bar--locked">
            <button className="sm-bottom-bar__center sm-bottom-bar__center--done" onClick={() => dispatch({ type: 'GO_BACK' })} type="button">
              Done
            </button>
          </div>
        )}
        {!testShotMode && !matchLocked && (
          <div className="sm-bottom-bar">
            <button className="sm-bottom-bar__live" onClick={handleLiveView} type="button">
              Live
            </button>
            <button
              className="sm-bottom-bar__center"
              onClick={() => {
                if (isChecklistMode || currentStep >= steps.length - 1) {
                  handleShotMatch();
                } else {
                  goToStep(currentStep + 1);
                }
              }}
              disabled={loading || steps.length === 0}
              type="button"
            >
              {(!isChecklistMode && currentStep < steps.length - 1) ? 'Next Step' : 'Test Shot'}
            </button>
            <button className="sm-bottom-bar__more" onClick={() => setMoreOpen(o => !o)} type="button" aria-label="More options">
              •••
            </button>
          </div>
        )}

        {/* SM-1: More menu — Team, Role Switch, Save actions */}
        {moreOpen && (
          <div className="sm-more-menu" onClick={() => setMoreOpen(false)}>
            <div className="sm-more-menu__sheet" onClick={e => e.stopPropagation()}>
              <button className="sm-more-menu__item" onClick={() => { handleSave(); setMoreOpen(false); }} type="button">
                {saved ? '✓ Saved' : 'Save Setup'}
              </button>
              {!teamSession && (
                <button className="sm-more-menu__item" onClick={() => { handleStartTeam(); setMoreOpen(false); }} type="button">
                  Start Team Mode
                </button>
              )}
              {teamSession && (
                <button className="sm-more-menu__item" onClick={() => { handleEndTeam(); setMoreOpen(false); }} type="button">
                  End Team Mode
                </button>
              )}
              <button className="sm-more-menu__item" onClick={() => { handleChangeRole(); setMoreOpen(false); }} type="button">
                Switch Role
              </button>
              <button className="sm-more-menu__item sm-more-menu__item--cancel" onClick={() => setMoreOpen(false)} type="button">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Bottom spacer for bottom bar */}
        <div style={{ height: 72 }} />
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
        {/* Header — cockpit header zone, not a content card */}
        <div className="shoot-mode__cockpit-header">
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
          mode={mode}
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

  // ── LEARNING VIEW ──
  if (role === 'learning') {
    const cameraStep = steps.find(s => s.type === 'camera_setup');
    const testStep = steps.find(s => s.type === 'test_exposure');

    return (
      <div className="screen shoot-mode">
        {/* Header — cockpit header zone, not a content card */}
        <div className="shoot-mode__cockpit-header">
          <div className="shoot-mode__summary">
            <h2 className="shoot-mode__setup-name">{bestMatch.name}</h2>
          </div>
          <button className="shoot-mode__role-switch" onClick={handleChangeRole}>
            Learning
            <span className="shoot-mode__role-switch-cta">{'\u2192'} Switch</span>
          </button>
        </div>

        {/* Feedback mode toggle */}
        <ModeToggle mode={mode} onChange={handleModeChange} />

        {/* Camera Settings */}
        {cameraStep && (() => {
          const cameraIdx = steps.indexOf(cameraStep);
          const cameraKey = stepKey(cameraStep, cameraIdx);
          const cameraDone = completedSteps.has(cameraKey);
          return (
            <ShootStepCard
              step={cameraStep}
              isActive={!cameraDone}
              isCompleted={cameraDone}
              onComplete={() => toggleStepComplete(cameraKey)}
              totalSteps={steps.length}
              mode={mode}
            />
          );
        })()}

        {/* Test Checklist */}
        {testStep && (() => {
          const testIdx = steps.indexOf(testStep);
          const testKey = stepKey(testStep, testIdx);
          const cameraKey = cameraStep ? stepKey(cameraStep, steps.indexOf(cameraStep)) : null;
          const cameraDone = cameraKey ? completedSteps.has(cameraKey) : true;
          return (
            <ShootStepCard
              step={testStep}
              isActive={cameraDone && !completedSteps.has(testKey)}
              isCompleted={completedSteps.has(testKey)}
              onComplete={() => toggleStepComplete(testKey)}
              totalSteps={steps.length}
              mode={mode}
            />
          );
        })()}

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
