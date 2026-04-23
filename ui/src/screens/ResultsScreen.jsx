import { useState, useMemo, useEffect, useRef } from 'react';
import { useAppState, useDispatch } from '../context/AppContext';
import { saveSetup, getImprovementSignal } from '../data/setupStore';
import { trackEvent } from '../data/analytics';
import { buildRefTestSteps, buildRefQuickFixes } from '../transform';
import useSettings from '../hooks/useSettings';
import usePaywall from '../hooks/usePaywall';
import usePreviewMode from '../hooks/usePreviewMode';
import useMode from '../hooks/useMode';
import { getPattern } from '../knowledge';
import { getActivePricing } from '../data/pricingStore';

// Gate / upgrade components
import PaywallGate from '../components/PaywallGate';
import ExitIntercept from '../components/ExitIntercept';

// Cards
import ZoomOverlay from '../cards/ZoomOverlay';
import LookSummaryCard from '../cards/LookSummaryCard';
import BlueprintCard from '../cards/BlueprintCard';
import RecommendedKitsCard from '../cards/RecommendedKitsCard';
import SignalQualityCard from '../cards/SignalQualityCard';

import ReferenceImageCard from '../cards/ReferenceImageCard';
import RefImageReadCard from '../cards/RefImageReadCard';
import RefLightingCard from '../cards/RefLightingCard';
import RefRecreationCard from '../cards/RefRecreationCard';
import RefInterpretationsCard from '../cards/RefInterpretationsCard';
import CameraSettingsCard from '../cards/CameraSettingsCard';
import DiagramCard from '../cards/DiagramCard';
import SpaceCheckCard from '../cards/SpaceCheckCard';
import CameraSubjectCard from '../cards/CameraSubjectCard';
import HowToTestCard from '../cards/HowToTestCard';
import WhatToLookForCard from '../cards/WhatToLookForCard';
import QuickFixesCard from '../cards/QuickFixesCard';
import OtherSetupsCard from '../cards/OtherSetupsCard';
import SkinToneCard from '../cards/SkinToneCard';
import OutcomeCapture from '../components/OutcomeCapture';
import TestShotCard from '../cards/TestShotCard';
import MySetupsCard from '../cards/MySetupsCard';

// ── SVG icons for CollapsibleSection triggers (no emoji) ────────────────────
const ICON = {
  map:      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>,
  wrench:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>,
  image:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
  target:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
  search:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  zap:      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  camera:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>,
  palette:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22C6.49 22 2 17.52 2 12C2 6.48 6.49 2 12 2c5.52 0 10 4.48 10 10 0 2.21-1.79 4-4 4h-2a2 2 0 00-2 2c0 1.11.89 2 2 2z"/><circle cx="7" cy="13" r="1"/><circle cx="9" cy="8" r="1"/><circle cx="14" cy="7" r="1"/><circle cx="17" cy="11" r="1"/></svg>,
  aperture: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="14.31" y1="8" x2="20.05" y2="17.94"/><line x1="9.69" y1="8" x2="21.17" y2="8"/><line x1="7.38" y1="12" x2="13.12" y2="2.06"/><line x1="9.69" y1="16" x2="3.95" y2="6.06"/><line x1="14.31" y1="16" x2="2.83" y2="16"/><line x1="16.62" y1="12" x2="10.88" y2="21.94"/></svg>,
  list:     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
  eye:      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  bag:      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>,
  refresh:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>,
  activity: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  message:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
  lighting: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>,
};

function PhaseLabel({ label, first }) {
  return (
    <div className={`results-phase${first ? '' : ' results-phase--border'}`}>
      <span className="results-phase__label">{label}</span>
    </div>
  );
}

/** Collapsible wrapper for secondary cards — collapsed by default. */
function CollapsibleSection({ title, icon, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`collapsible-section${open ? ' collapsible-section--open' : ''}`}>
      <button
        className="collapsible-section__trigger"
        onClick={() => setOpen(v => !v)}
        type="button"
        aria-expanded={open}
      >
        {icon && <span className="collapsible-section__icon">{icon}</span>}
        <span className="collapsible-section__title">{title}</span>
        <svg
          className="collapsible-section__chevron"
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <div className="collapsible-section__body">
          {children}
        </div>
      )}
    </div>
  );
}

/** Drag-to-reorder wrapper for result card blocks.
 *  Shows a subtle grip handle on hover.  Calls onDragStart/onDragOver/onDrop
 *  from the parent drag-order hook. */
function DraggableCardBlock({ id, dragSrc, onDragStart, onDragOver, onDrop, onDragEnd, children }) {
  const isDragging = dragSrc === id;
  return (
    <div
      className={`results-draggable-block${isDragging ? ' results-draggable-block--dragging' : ''}`}
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart(id); }}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; onDragOver(id); }}
      onDrop={e => { e.preventDefault(); onDrop(id); }}
      onDragEnd={onDragEnd}
    >
      <span className="results-draggable-block__grip" aria-hidden="true" title="Drag to reorder">
        {/* 6-dot grip */}
        <svg width="10" height="14" viewBox="0 0 10 14" fill="none">
          {[0,4,8].map(y => [1,6].map(x => (
            <circle key={`${x}-${y}`} cx={x} cy={y+3} r="1.3" fill="currentColor" />
          )))}
        </svg>
      </span>
      {children}
    </div>
  );
}

/** Hook: manage drag order for a named set of card IDs.  Persists to localStorage. */
function useDragCardOrder(storageKey, defaultIds) {
  const [order, setOrder] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (Array.isArray(saved) && saved.length) return saved;
    } catch {}
    return defaultIds;
  });
  const [dragSrc, setDragSrc] = useState(null);
  const dragOver = useRef(null);

  function onDragStart(id) { setDragSrc(id); }
  function onDragOver(id) { dragOver.current = id; }
  function onDrop(targetId) {
    if (!dragSrc || dragSrc === targetId) { setDragSrc(null); return; }
    setOrder(prev => {
      const ids = [...prev];
      const from = ids.indexOf(dragSrc);
      const to   = ids.indexOf(targetId);
      if (from === -1 || to === -1) return prev;
      ids.splice(from, 1);
      ids.splice(to, 0, dragSrc);
      try { localStorage.setItem(storageKey, JSON.stringify(ids)); } catch {}
      return ids;
    });
    setDragSrc(null);
  }
  function onDragEnd() { setDragSrc(null); }

  return { order, dragSrc, onDragStart, onDragOver, onDrop, onDragEnd };
}

// ── Shoot Mode CTA (Phase 4) ────────────────────────────────────────────────

function ShootModeCTA({ isPaid, onUnlock, mode }) {
  const dispatch = useDispatch();

  function handleClick() {
    if (!isPaid) onUnlock();
    dispatch({ type: 'SET_APP_MODE', mode: 'shoot' });
    dispatch({ type: 'NAVIGATE', screen: 'shoot_mode' });
  }

  const isAssistant = mode === 'assistant';

  return (
    <div className="shoot-mode-cta-block">
      <button
        className={`shoot-mode-cta-btn${!isPaid ? ' shoot-mode-cta-btn--locked' : ''}`}
        onClick={handleClick}
        type="button"
      >
        {!isPaid && (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6, flexShrink: 0 }}>
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0110 0v4"/>
          </svg>
        )}
        {isPaid ? (
          <>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8, flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10"/>
              <circle cx="12" cy="12" r="6"/>
              <circle cx="12" cy="12" r="2"/>
            </svg>
            {isAssistant ? 'Start Shoot Mode' : 'Match the shot live.'}
          </>
        ) : 'Fix This Shot Live'}
      </button>
      {isPaid ? (
        <p className="shoot-mode-cta-hint">
          {isAssistant
            ? 'Step-by-step instructions — position each light, dial in power, lock it.'
            : 'See exactly what to change while you shoot.'}
        </p>
      ) : (
        <p className="shoot-mode-cta-hint">
          Compare your shot to the target — correct on set.
        </p>
      )}
    </div>
  );
}

// ── Save bar ────────────────────────────────────────────────────────────────

function SaveBar({ result }) {
  const { autoSaveSetups, viewMode } = useSettings();
  const isQuickMode = viewMode === 'quick';
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveTag, setSaveTag] = useState('personal');
  const [saved, setSaved] = useState(false);
  const [improvement, setImprovement] = useState(null);
  const autoSavedRef = useRef(null);

  const pattern = result?.bestMatch?.lightingPattern;
  const score = result?.bestMatch?.reliabilityScore;

  function handleSave() {
    if (!saveName.trim()) return;
    const signal = getImprovementSignal(pattern, score);
    saveSetup({ name: saveName.trim(), tag: saveTag, result });
    setSaveOpen(false);
    setSaveName('');
    setSaved(true);
    setImprovement(signal);
    trackEvent('SETUP_SAVED', { pattern, score, tag: saveTag, manual: true });
    setTimeout(() => { setSaved(false); setImprovement(null); }, 3500);
  }

  useEffect(() => {
    if (!autoSaveSetups || !result?.bestMatch?.name) return;
    const key = `${result.bestMatch.name}_${result.mood || ''}`;
    if (autoSavedRef.current === key) return;
    autoSavedRef.current = key;
    const signal = getImprovementSignal(pattern, score);
    saveSetup({ name: result.bestMatch.name, tag: 'auto', result });
    setSaved(true);
    setImprovement(signal);
    trackEvent('SETUP_SAVED', { pattern, score, tag: 'auto', manual: false });
    setTimeout(() => { setSaved(false); setImprovement(null); }, 3500);
  }, [autoSaveSetups, result]);

  return (
    <>
      <div className="save-setup-bar">
        {saved ? (
          <span className="save-setup-bar__saved">
            ✓ Setup Saved
            {improvement && (
              <span className={`save-setup-bar__improvement save-setup-bar__improvement--${improvement.improved ? 'up' : 'down'}`}>
                {improvement.improved ? '↑' : '↓'} {improvement.improved ? 'Improved' : 'Score dropped'} by {improvement.delta} pts
              </span>
            )}
          </span>
        ) : (
          <>
            <span className="save-setup-bar__warning">You&rsquo;ll lose this setup when you leave.</span>
            <button className="btn btn--ghost btn--sm" onClick={() => setSaveOpen(!saveOpen)} type="button">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
                <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/>
              </svg>
              Save This Setup
            </button>
          </>
        )}
      </div>

      {saveOpen && (
        <div className="save-setup-form">
          <input
            className="save-setup-form__input"
            type="text"
            placeholder="Setup name..."
            value={saveName}
            onChange={e => setSaveName(e.target.value)}
            autoFocus
          />
          <div className="save-setup-form__tags">
            {['personal', 'studio'].map(tag => (
              <button
                key={tag}
                className={`chip${saveTag === tag ? ' chip--selected' : ''}`}
                onClick={() => setSaveTag(tag)}
                type="button"
              >
                {tag.charAt(0).toUpperCase() + tag.slice(1)}
              </button>
            ))}
          </div>
          <button
            className="btn btn--primary btn--sm"
            onClick={handleSave}
            disabled={!saveName.trim()}
            style={{ width: '100%' }}
          >
            Save
          </button>
        </div>
      )}
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Main screen
// ═══════════════════════════════════════════════════════════════════════════

export default function ResultsScreen() {
  const { result, error, roomDimensions, user } = useAppState();
  const dispatch = useDispatch();
  const userEmail = user?.email || user?.username || null;
  const { isPaid, unlock, isAdmin: isAdminEmail, incrementCount } = usePaywall(userEmail);
  const { access: previewAccess } = usePreviewMode();
  const { viewMode } = useSettings();
  const isQuickMode = viewMode === 'quick';
  const isAdmin = previewAccess === 'admin' || isAdminEmail;
  // Preview As overrides the actual plan — 'paid'/'admin' = unlocked, 'guest'/'free' = locked
  const effectiveIsPaid = previewAccess !== null
    ? (previewAccess === 'paid' || previewAccess === 'admin')
    : isPaid;
  const [zoomSrc, setZoomSrc] = useState(null);
  const [tab, setTab] = useState('blueprint');
  const appMode = useMode();
  // Drag-to-reorder for blueprint secondary cards
  const blueprintDrag = useDragCardOrder('ngw_blueprint_card_order', ['diagram', 'space_check', 'ref_analysis']);
  const activePricing = getActivePricing();

  useEffect(() => {
    if (result) {
      trackEvent('ANALYSIS_COMPLETE', {
        pattern: result.bestMatch?.lightingPattern,
        score: result.bestMatch?.reliabilityScore,
      });
      incrementCount();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // One-time post-analysis upgrade nudge
  const [nudgeDismissed, setNudgeDismissed] = useState(() => {
    try { return localStorage.getItem('ngw_nudge_dismissed') === 'true'; } catch { return false; }
  });
  function dismissNudge() {
    try { localStorage.setItem('ngw_nudge_dismissed', 'true'); } catch {}
    setNudgeDismissed(true);
  }

  /* Extract reference analysis layers */
  const refAnalysis = result?.referenceImageAnalysis?.description?.referenceAnalysis;
  const hasRefAnalysis = refAnalysis?.ok === true;
  const imageRead = hasRefAnalysis ? refAnalysis.image_read : null;
  const lightingRead = hasRefAnalysis ? refAnalysis.lighting_read : null;
  const recreationSetup = hasRefAnalysis ? refAnalysis.recreation_setup : null;

  const refTestSteps = useMemo(
    () => hasRefAnalysis ? buildRefTestSteps(lightingRead, recreationSetup) : [],
    [hasRefAnalysis, lightingRead, recreationSetup],
  );
  const refQuickFixes = useMemo(
    () => hasRefAnalysis ? buildRefQuickFixes(lightingRead, recreationSetup) : [],
    [hasRefAnalysis, lightingRead, recreationSetup],
  );

  const patternRiskLevel = useMemo(() => {
    const patternId = result?.bestMatch?.lightingPattern;
    if (!patternId) return null;
    return getPattern(patternId)?.metadata?.riskLevel ?? null;
  }, [result?.bestMatch?.lightingPattern]);

  if (error) {
    return (
      <div className="screen">
        <div className="error-box">
          <div className="error-box__msg">{error}</div>
          <button className="btn btn--primary btn--sm" onClick={() => dispatch({ type: 'GO_BACK' })}>
            Back to Setup
          </button>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="screen">
        <p style={{ color: 'var(--text-dim)', textAlign: 'center', marginTop: 40 }}>
          No results yet. Go back and run a recommendation.
        </p>
      </div>
    );
  }

  const testSteps = refTestSteps.length > 0 ? refTestSteps : result.testSteps;
  const quickFixes = refQuickFixes.length > 0
    ? [...refQuickFixes, ...(result.quickFixes || [])]
    : result.quickFixes;

  const detectedDiagramSpec = result.referenceImageAnalysis?.detectedDiagram?.raw;
  const modifierFamily = result.lightingIntelligence?.detectedModifier || null;

  // Synthesize a lightweight lightingRead from lightingIntelligence for wizard-flow results
  // (no reference image uploaded — RefLightingCard still shows engine-derived data)
  const li = result.lightingIntelligence || {};
  const syntheticLightingRead = !hasRefAnalysis && (li.lightCount || li.keyPosition || result.bestMatch?.lightingPattern)
    ? {
        lighting_family:       li.lightingFamily   || null,
        source_quality:        li.sourceQuality    || null,
        source_direction:      li.keyPosition      || null,
        shadow_pattern:        result.bestMatch?.lightingPattern || null,
        fill_presence:         li.fillPresence     || null,
        rim_presence:          null,
        light_count:           li.lightCount       || null,
        tonal_processing_notes: null,
        key_observations:      [],
        ambiguity_notes:       [],
      }
    : null;

  // Title: pattern name if known, otherwise fallback
  const rawPattern = result.bestMatch?.lightingPattern;
  const patternKnown = rawPattern && rawPattern.toLowerCase() !== 'unknown';
  const screenTitle = patternKnown
    ? `${rawPattern.charAt(0).toUpperCase() + rawPattern.slice(1)} Setup`
    : result.referenceImage
      ? 'Reference Analysis'
      : 'Your Setup';

  return (
    <div className="screen">
      {zoomSrc && <ZoomOverlay src={zoomSrc} alt="Reference photo" onClose={() => setZoomSrc(null)} />}
      {!effectiveIsPaid && <ExitIntercept onUnlock={unlock} />}

      {/* Screen title */}
      <h2 className="screen-heading results-screen-heading">{screenTitle}</h2>

      {/* Reference hero image */}
      {result.referenceImage && (
        <div className="ref-hero">
          <div className="ref-hero__image">
            <img src={result.referenceImage} alt="Reference" onClick={() => setZoomSrc(result.referenceImage)} />
          </div>
        </div>
      )}

      {/* Narrative under image */}
      {imageRead?.narrative && (
        <div className="ref-hero__narrative">
          <span className="ref-hero__narrative-label">At a Glance</span>
          <p className="ref-hero__narrative-text">{imageRead.narrative}</p>
          {(imageRead.pose_notes || imageRead.scene_description) && (
            <p className="ref-hero__narrative-action">
              {imageRead.pose_notes || imageRead.scene_description}
            </p>
          )}
        </div>
      )}

      {/* Compact ref card when no three-layer analysis */}
      {result.referenceImage && !hasRefAnalysis && (
        <div className="result-card">
          <ReferenceImageCard
            imageUrl={null}
            analysis={result.referenceImageAnalysis}
            mood={result.mood}
            lightingIntelligence={result.lightingIntelligence}
            compact
          />
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────
          PHASE 1 — Look Summary (always free)
          ──────────────────────────────────────────────────────────────── */}
      <LookSummaryCard
        bestMatch={result.bestMatch}
        lightingIntelligence={result.lightingIntelligence}
        patternRiskLevel={patternRiskLevel}
      />

      {/* ─────────────────────────────────────────────────────────────────
          PHASE 6 — Upgrade nudge (post-analysis, before blueprint)
          ──────────────────────────────────────────────────────────────── */}
      {!effectiveIsPaid && !nudgeDismissed && (
        <div className="upgrade-nudge">
          <button className="upgrade-nudge__dismiss" onClick={dismissNudge} aria-label="Dismiss">×</button>
          {result.bestMatch?.recipeId ? (
            <p className="upgrade-nudge__text">
              <strong>Get it right on the first shot.</strong>{' '}
              Dial in exact positions, power settings, and compare live on set.
            </p>
          ) : (
            <p className="upgrade-nudge__text">
              <strong>You&rsquo;re 2–3 changes from nailing this.</strong>{' '}
              Fix the positions, lock in the ratios, compare live on set.
            </p>
          )}
          <button className="upgrade-nudge__cta" onClick={unlock} type="button">
            Fix This Shot — ${activePricing.price_monthly}/mo
          </button>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────
          TAB BAR — hidden in quick mode (Blueprint only)
          ──────────────────────────────────────────────────────────────── */}
      {(!isQuickMode || isAdmin) && (
        <div className="results-tabs">
          <button
            className={`results-tab${tab === 'blueprint' ? ' results-tab--active' : ''}`}
            onClick={() => setTab('blueprint')}
            type="button"
          >
            Blueprint
          </button>
          <button
            className={`results-tab${tab === 'fix' ? ' results-tab--active' : ''}`}
            onClick={() => setTab('fix')}
            type="button"
          >
            Fix It
          </button>
          <button
            className={`results-tab${tab === 'gear' ? ' results-tab--active' : ''}`}
            onClick={() => setTab('gear')}
            type="button"
          >
            Gear
          </button>
          {isAdmin && (
            <button
              className={`results-tab results-tab--debug${tab === 'debug' ? ' results-tab--active' : ''}`}
              onClick={() => setTab('debug')}
              type="button"
            >
              Debug
            </button>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────
          TAB 1 — Blueprint
          Always mounted — CSS hides inactive panel to preserve state.
          ──────────────────────────────────────────────────────────────── */}
      <div className={`results-tab-panel results-tab-panel--blueprint${tab !== 'blueprint' ? ' results-tab-panel--hidden' : ''}`}>
        {/* Blueprint — shown directly (no double "Blueprint" wrapper) */}
        <PaywallGate
          isPaid={effectiveIsPaid}
          onUnlock={unlock}
          headline="Build this exactly — positions, modifiers, power ratios."
          bullets={[
            'Precise light positions and angles for this pattern',
            'Power ratios dialled in — stop adjusting between takes',
            'Modifier specs and distance callouts',
            'Full access to every pattern, setup, and blueprint.',
          ]}
        >
          <BlueprintCard
            lights={result.setup.lights}
            lightingIntelligence={result.lightingIntelligence}
            cameraSettings={result.cameraSettings}
            lightType={result.bestMatch?.lightType}
            lightTypeNote={result.bestMatch?.lightTypeNote}
            mode={appMode}
          />
          {result.cameraSettings && (
            <CameraSettingsCard settings={result.cameraSettings} />
          )}
        </PaywallGate>

        {/* Shoot Mode CTA */}
        <ShootModeCTA isPaid={effectiveIsPaid} onUnlock={unlock} mode={appMode} />

        {/* ── Reorderable secondary cards ── drag the grip handle to reorder ── */}
        {blueprintDrag.order.map(cardId => {
          const dragProps = {
            key: cardId, id: cardId, dragSrc: blueprintDrag.dragSrc,
            onDragStart: blueprintDrag.onDragStart,
            onDragOver:  blueprintDrag.onDragOver,
            onDrop:      blueprintDrag.onDrop,
            onDragEnd:   blueprintDrag.onDragEnd,
          };
          if (cardId === 'diagram') {
            if (!(detectedDiagramSpec || result.diagram)) return null;
            return (
              <DraggableCardBlock {...dragProps}>
                <CollapsibleSection title="Lighting Diagram" icon={ICON.map} defaultOpen={!hasRefAnalysis}>
                  <DiagramCard
                    spec={detectedDiagramSpec || result.diagram}
                    title="Lighting"
                    cameraSettings={result.cameraSettings}
                    spaceCheck={result.spaceCheck}
                    roomDimensions={roomDimensions}
                  />
                </CollapsibleSection>
              </DraggableCardBlock>
            );
          }
          if (cardId === 'space_check') {
            return (
              <DraggableCardBlock {...dragProps}>
                <SpaceCheckCard
                  data={result.spaceCheck}
                  defaultOpen={result.spaceCheck?.warnings?.length > 0}
                />
              </DraggableCardBlock>
            );
          }
          if (cardId === 'ref_analysis') {
            if (!(hasRefAnalysis || syntheticLightingRead)) return null;
            return (
              <DraggableCardBlock {...dragProps}>
                <div className="results-section">
                  <PhaseLabel label={hasRefAnalysis ? 'Reference Analysis' : 'Lighting Analysis'} first />
                  <div className="results-section__cards">
                    <CollapsibleSection title="Lighting Analysis" icon={ICON.lighting} defaultOpen={!hasRefAnalysis}>
                      <RefLightingCard
                        lightingRead={lightingRead || syntheticLightingRead}
                        lightingIntelligence={result.lightingIntelligence}
                      />
                      {hasRefAnalysis && (
                        <RefInterpretationsCard lightingRead={lightingRead} recreationSetup={recreationSetup} />
                      )}
                    </CollapsibleSection>
                    {hasRefAnalysis && (
                      <CollapsibleSection title="Scene & Setup" icon={ICON.image}>
                        <RefImageReadCard imageRead={imageRead} />
                        <RefRecreationCard recreationSetup={recreationSetup} />
                      </CollapsibleSection>
                    )}
                  </div>
                </div>
              </DraggableCardBlock>
            );
          }
          return null;
        })}
      </div>

      {/* ─────────────────────────────────────────────────────────────────
          TAB 2 — Fix It
          ──────────────────────────────────────────────────────────────── */}
      <div className={`results-tab-panel results-tab-panel--fix${tab !== 'fix' ? ' results-tab-panel--hidden' : ''}`}>
        {/* Quick fixes — primary content, shown directly */}
        <QuickFixesCard fixes={quickFixes} isPaid={effectiveIsPaid} onUnlock={unlock} />

        {/* Camera + subject — gated */}
        <CollapsibleSection title="Camera & Subject" icon={ICON.camera}>
          <PaywallGate
            isPaid={effectiveIsPaid}
            onUnlock={unlock}
            headline="Dial in the camera — re-test and it holds."
            bullets={[
              'Camera settings locked to this exact setup',
              'Subject and background positions to stabilize the result',
            ]}
            preview={false}
          >
            <CameraSubjectCard
              camera={result.cameraSettings}
              subject={result.subject}
              background={result.background}
            />
          </PaywallGate>
        </CollapsibleSection>

        {result.skinToneAdjustments && (
          <CollapsibleSection title="Skin Tone Adjustments" icon={ICON.palette}>
            <SkinToneCard data={result.skinToneAdjustments} />
          </CollapsibleSection>
        )}

        <CollapsibleSection title="Test Shot" icon={ICON.aperture}>
          <TestShotCard
            setupName={result.bestMatch.name}
            refAnalysis={result.referenceImageAnalysis}
          />
        </CollapsibleSection>

        {(effectiveIsPaid || isAdmin) && (
          <CollapsibleSection title="How to Test" icon={ICON.list}>
            <HowToTestCard steps={testSteps} />
          </CollapsibleSection>
        )}
        {(effectiveIsPaid || isAdmin) && (
          <CollapsibleSection title="What to Look For" icon={ICON.eye}>
            <WhatToLookForCard goodSigns={result.goodSigns} warnings={result.warnings} />
          </CollapsibleSection>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────────
          TAB 3 — Gear
          ──────────────────────────────────────────────────────────────── */}
      <div className={`results-tab-panel results-tab-panel--gear${tab !== 'gear' ? ' results-tab-panel--hidden' : ''}`}>
        {/* Gear match banner — tier compatibility (belongs here, not in Blueprint) */}
        {result.gearMatch && !result.gearMatch.isExact && (
          <div className={`gear-match-banner gear-match-banner--${result.gearMatch.tier}`}>
            <span className="gear-match-banner__label">{result.gearMatch.label}</span>
            {result.gearMatch.adaptNote && (
              <p className="gear-match-banner__note">{result.gearMatch.adaptNote}</p>
            )}
          </div>
        )}

        {/* Recommended gear — primary content, shown directly */}
        <PaywallGate
          isPaid={effectiveIsPaid}
          onUnlock={unlock}
          headline="Get the gear to recreate this look."
          preview={false}
        >
          <RecommendedKitsCard modifierFamily={modifierFamily} setupLights={result.setup?.lights} />
        </PaywallGate>

        {(result.alternatives?.length > 0 || result.substitutions?.length > 0) && (
          <CollapsibleSection title="Other Setups" icon={ICON.refresh}>
            <OtherSetupsCard
              alternatives={result.alternatives}
              substitutions={result.substitutions}
            />
          </CollapsibleSection>
        )}

        <CollapsibleSection title="Signal Quality" icon={ICON.activity}>
          <SignalQualityCard
            signalReliability={result.signalReliability}
            faceValidation={result.faceValidation}
            edgeCaseFlags={result.edgeCaseFlags}
            perceptionExplanation={result.lightingIntelligence?.perceptionExplanation}
          />
        </CollapsibleSection>

        <MySetupsCard />

        <OutcomeCapture
          setupId={result.bestMatch.systemId || result.bestMatch.name}
          mood={result.mood}
          pattern={result.bestMatch.lightingPattern}
        />
      </div>

      {/* ─────────────────────────────────────────────────────────────────
          TAB 4 — Debug (admin only)
          Full VLM pipeline output, lighting intelligence, raw signals.
          ──────────────────────────────────────────────────────────────── */}
      {isAdmin && (
        <div className={`results-tab-panel results-tab-panel--debug${tab !== 'debug' ? ' results-tab-panel--hidden' : ''}`}>

          {/* Lighting Read — full VLM lighting analysis */}
          {lightingRead && (
            <CollapsibleSection title="Lighting Read (VLM)" icon={ICON.lighting} defaultOpen>
              <RefLightingCard
                lightingRead={lightingRead}
                lightingIntelligence={result.lightingIntelligence}
              />
            </CollapsibleSection>
          )}

          {/* Interpretations — VLM recreation interpretations */}
          {lightingRead && recreationSetup && (
            <CollapsibleSection title="Interpretations" icon={ICON.search} defaultOpen>
              <RefInterpretationsCard lightingRead={lightingRead} recreationSetup={recreationSetup} />
            </CollapsibleSection>
          )}

          {/* Image Read — VLM scene description */}
          {imageRead && (
            <CollapsibleSection title="Image Read (VLM)" icon={ICON.image} defaultOpen>
              <RefImageReadCard imageRead={imageRead} />
            </CollapsibleSection>
          )}

          {/* Recreation Setup — VLM-derived recreation plan */}
          {recreationSetup && (
            <CollapsibleSection title="Recreation Setup (VLM)" icon={ICON.target} defaultOpen>
              <RefRecreationCard recreationSetup={recreationSetup} />
            </CollapsibleSection>
          )}

          {/* Lighting Intelligence — full engine output */}
          {result.lightingIntelligence && (
            <CollapsibleSection title="Lighting Intelligence" icon={ICON.activity} defaultOpen>
              <RefLightingCard
                lightingRead={syntheticLightingRead}
                lightingIntelligence={result.lightingIntelligence}
              />
            </CollapsibleSection>
          )}

          {/* Signal Quality — full debug view */}
          <CollapsibleSection title="Signal Quality (full)" icon={ICON.activity} defaultOpen>
            <SignalQualityCard
              signalReliability={result.signalReliability}
              faceValidation={result.faceValidation}
              edgeCaseFlags={result.edgeCaseFlags}
              perceptionExplanation={result.lightingIntelligence?.perceptionExplanation}
            />
          </CollapsibleSection>

          {/* VLM Narratives */}
          {result.vlmDescription && (
            <CollapsibleSection title="VLM Description" icon={ICON.eye} defaultOpen>
              <pre className="debug-json">{typeof result.vlmDescription === 'string' ? result.vlmDescription : JSON.stringify(result.vlmDescription, null, 2)}</pre>
            </CollapsibleSection>
          )}
          {result.vlmReconstruction && (
            <CollapsibleSection title="VLM Reconstruction" icon={ICON.eye} defaultOpen>
              <pre className="debug-json">{JSON.stringify(result.vlmReconstruction, null, 2)}</pre>
            </CollapsibleSection>
          )}

          {/* Raw JSON dump — lightingIntelligence */}
          {result.lightingIntelligence && (
            <CollapsibleSection title="Raw: lightingIntelligence" icon={ICON.wrench}>
              <pre className="debug-json">{JSON.stringify(result.lightingIntelligence, null, 2)}</pre>
            </CollapsibleSection>
          )}

          {/* Raw JSON dump — bestMatch */}
          <CollapsibleSection title="Raw: bestMatch + setup" icon={ICON.wrench}>
            <pre className="debug-json">{JSON.stringify({ bestMatch: result.bestMatch, setup: result.setup, signalReliability: result.signalReliability }, null, 2)}</pre>
          </CollapsibleSection>

        </div>
      )}

      {/* Save setup — sticky bottom bar, always visible */}
      <SaveBar result={result} />

    </div>
  );
}
