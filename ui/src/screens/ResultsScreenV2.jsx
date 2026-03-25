import { useState, useMemo, useEffect, useRef } from 'react';
import { useAppState, useDispatch } from '../context/AppContext';
import { saveSetup, getImprovementSignal } from '../data/setupStore';
import { trackEvent } from '../data/analytics';
import { buildRefTestSteps, buildRefQuickFixes } from '../transform';
import useSettings from '../hooks/useSettings';
import usePaywall from '../hooks/usePaywall';
import useSignal from '../hooks/useSignal';
import useMode from '../hooks/useMode';
import usePaywallTrigger from '../hooks/usePaywallTrigger';
import OutcomeCapture from '../components/OutcomeCapture';
import OutcomeFeedback from '../components/OutcomeFeedback';
import SuccessMomentPaywall from '../components/SuccessMomentPaywall';
import ResultConfidenceExplainer from '../components/results/ResultConfidenceExplainer';
import ResultPatternComparePrompt from '../components/results/ResultPatternComparePrompt';
import ResultSymptomSuggestions from '../components/results/ResultSymptomSuggestions';
import ResultCTAGroup from '../components/results/ResultCTAGroup';
import { getSymptomsFromSignals } from '../data/symptoms';
import { BLUEPRINT_BULLETS, CAMERA_BULLETS } from '../data/paywallBullets';
import { getSessionId } from '../data/flagsStore';

// Gate / upgrade components
import PaywallGate from '../components/PaywallGate';
import ExitIntercept from '../components/ExitIntercept';
import ShootModePaywall from '../components/ShootModePaywall';

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
import DiagramCard from '../cards/DiagramCard';
import SpaceCheckCard from '../cards/SpaceCheckCard';
import CameraSubjectCard from '../cards/CameraSubjectCard';
import QuickFixesCard from '../cards/QuickFixesCard';
import SkinToneCard from '../cards/SkinToneCard';
import OtherSetupsCard from '../cards/OtherSetupsCard';
import MySetupsCard from '../cards/MySetupsCard';

// ── PaywallGate bullet lists (shared — edit in data/paywallBullets.js) ───────

// ── Icons ────────────────────────────────────────────────────────────────────
const ICON = {
  map:      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>,
  target:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
  camera:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>,
  bag:      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/></svg>,
  activity: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  message:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
  refresh:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>,
  wrench:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/></svg>,
  image:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
  search:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  lighting: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>,
  list:     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
  eye:      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  palette:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22C6.49 22 2 17.52 2 12C2 6.48 6.49 2 12 2c5.52 0 10 4.48 10 10 0 2.21-1.79 4-4 4h-2a2 2 0 00-2 2c0 1.11.89 2 2 2z"/><circle cx="7" cy="13" r="1"/><circle cx="9" cy="8" r="1"/><circle cx="14" cy="7" r="1"/><circle cx="17" cy="11" r="1"/></svg>,
  aperture: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="14.31" y1="8" x2="20.05" y2="17.94"/><line x1="9.69" y1="8" x2="21.17" y2="8"/><line x1="7.38" y1="12" x2="13.12" y2="2.06"/><line x1="9.69" y1="16" x2="3.95" y2="6.06"/><line x1="14.31" y1="16" x2="2.83" y2="16"/><line x1="16.62" y1="12" x2="10.88" y2="21.94"/></svg>,
};

// ── Debug block with copy button ─────────────────────────────────────────────
function DebugBlock({ content }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={copy}
        style={{
          position: 'absolute', top: 8, right: 8,
          fontSize: '11px', padding: '3px 8px',
          background: copied ? 'var(--color-success, #22c55e)' : 'var(--color-surface-raised, #2a2a2a)',
          color: copied ? '#fff' : 'var(--color-text-secondary)',
          border: '1px solid var(--color-border)',
          borderRadius: 4, cursor: 'pointer', zIndex: 1,
        }}
      >
        {copied ? 'Copied!' : 'Copy'}
      </button>
      <pre className="debug-json">{content}</pre>
    </div>
  );
}

// ── Collapsible section (identical to V1) ────────────────────────────────────
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

// ── Recreate This Shot card (free, execution-first) ──────────────────────────
const BARE_TOKENS = new Set(['bare', 'bare_bulb', 'bare bulb', 'direct', 'none', 'unknown', 'modifier not detected', '']);
function cleanMod(mod) {
  if (!mod) return null;
  return BARE_TOKENS.has(mod.toLowerCase().trim()) ? null : mod;
}

function getBHUrl(query) {
  return `https://www.bhphotovideo.com/c/search?q=${encodeURIComponent(query)}`;
}

function RecreateCard({ lights, cameraSettings }) {
  const { units } = useSettings();
  if (!lights || lights.length === 0) return null;

  return (
    <div className="recreate-card result-card">
      <div className="recreate-card__header result-card__header">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
        </svg>
        <span>Recreate This Shot</span>
      </div>

      <div className="recreate-card__lights">
        {lights.map((l, i) => {
          const dist = units === 'metric' ? l.distanceM : l.distanceFt;
          const rawMod = cleanMod(l.modifier);
          const mod  = rawMod ? rawMod + (l.modifierSize ? ` (${l.modifierSize})` : '') : null;
          return (
            <div className={`recreate-light recreate-light--${l.role}`} key={i}>
              <div className="recreate-light__role">{l.label}</div>
              <div className="recreate-light__specs">
                {mod && (
                  <a href={getBHUrl(mod)} target="_blank" rel="noopener noreferrer" className="recreate-light__spec blueprint-shop-link">{mod}</a>
                )}
                {l.positionText && <span className="recreate-light__spec">{l.positionText}</span>}
                {dist && <span className="recreate-light__spec">{dist}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {cameraSettings && (
        <div className="recreate-card__camera">
          {[
            cameraSettings.aperture,
            cameraSettings.iso && `ISO ${cameraSettings.iso}`,
            cameraSettings.shutter,
            cameraSettings.wb && `${cameraSettings.wb} WB`,
          ].filter(Boolean).join(' · ')}
        </div>
      )}

      <div className="recreate-card__instruction">
        Set it up. Take a test shot. Adjust and retest.
      </div>
    </div>
  );
}

// ── Shoot Mode CTA ────────────────────────────────────────────────────────────
// onOpenPaywall — open the ShootModePaywall modal (free path)
function ShootModeCTA({ isPaid, onUnlock, onOpenPaywall }) {
  const dispatch = useDispatch();

  function handleClick() {
    if (!isPaid) {
      onOpenPaywall('first_attempt');
      return;
    }
    dispatch({ type: 'SET_APP_MODE', mode: 'shoot' });
    dispatch({ type: 'NAVIGATE', screen: 'shoot_mode' });
  }

  return (
    <div className="shoot-mode-cta-block">
      <button
        className={`shoot-mode-cta-btn${!isPaid ? ' shoot-mode-cta-btn--locked' : ''}`}
        onClick={handleClick}
        type="button"
      >
        {!isPaid && (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ marginRight: 6, flexShrink: 0 }}>
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0110 0v4"/>
          </svg>
        )}
        {isPaid ? (
          <>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ marginRight: 8, flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
            </svg>
            Start Shoot Mode
          </>
        ) : (
          'Recreate This Shot'
        )}
      </button>
      <p className="shoot-mode-cta-hint">
        {isPaid
          ? 'Position each light. Dial in power. Verify against the target.'
          : "You've got the pattern. Now place your light exactly."}
      </p>
    </div>
  );
}

// ── First-attempt friction banner (free users, once per session) ──────────────
// Shows after 3 seconds on the results page. Surfaces Trigger 1 copy.
function FirstAttemptBanner({ onOpenPaywall }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only once per session
    if (sessionStorage.getItem('ngw_attempt_banner_shown')) return;
    const t = setTimeout(() => {
      setVisible(true);
      sessionStorage.setItem('ngw_attempt_banner_shown', '1');
      trackEvent('TRIGGER_SHOWN', { trigger: 'first_attempt' });
    }, 3000);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  return (
    <div className="attempt-banner">
      <p className="attempt-banner__line">
        You&rsquo;re 2–3 adjustments away from nailing this.
      </p>
      <button
        className="attempt-banner__cta"
        onClick={() => onOpenPaywall('first_attempt')}
        type="button"
      >
        Recreate This Shot
      </button>
    </div>
  );
}

// ── Refine section header ────────────────────────────────────────────────────
function RefineSection({ children }) {
  return (
    <div className="refine-section">
      <div className="refine-section__header">
        <span className="section-label">Refine Your Shot</span>
        <p className="refine-section__intro">Not quite there? Make these adjustments and re-test.</p>
      </div>
      {children}
    </div>
  );
}

// ── Save bar (identical to V1) ───────────────────────────────────────────────
const SAVE_INIT = { open: false, name: '', tag: 'personal', saved: false, improvement: null };

function SaveBar({ result }) {
  const { autoSaveSetups } = useSettings();
  const [form, setForm] = useState(SAVE_INIT);
  const autoSavedRef = useRef(null);

  const pattern = result?.bestMatch?.lightingPattern;
  const score   = result?.bestMatch?.reliabilityScore;

  function handleSave() {
    if (!form.name.trim()) return;
    const signal = getImprovementSignal(pattern, score);
    saveSetup({ name: form.name.trim(), tag: form.tag, result });
    setForm(f => ({ ...f, open: false, name: '', saved: true, improvement: signal }));
    trackEvent('SETUP_SAVED', { pattern, score, tag: form.tag, manual: true });
    setTimeout(() => setForm(f => ({ ...f, saved: false, improvement: null })), 3500);
  }

  useEffect(() => {
    if (!autoSaveSetups || !result?.bestMatch?.name) return;
    const key = `${result.bestMatch.name}_${result.mood || ''}`;
    if (autoSavedRef.current === key) return;
    autoSavedRef.current = key;
    const signal = getImprovementSignal(pattern, score);
    saveSetup({ name: result.bestMatch.name, tag: 'auto', result });
    setForm(f => ({ ...f, saved: true, improvement: signal }));
    trackEvent('SETUP_SAVED', { pattern, score, tag: 'auto', manual: false });
    setTimeout(() => setForm(f => ({ ...f, saved: false, improvement: null })), 3500);
  }, [autoSaveSetups, result]);

  return (
    <>
      <div className="save-setup-bar">
        {form.saved ? (
          <span className="save-setup-bar__saved">
            ✓ Locked — use this setup anytime.
            {form.improvement && (
              <span className={`save-setup-bar__improvement save-setup-bar__improvement--${form.improvement.improved ? 'up' : 'down'}`}>
                {form.improvement.improved ? '↑' : '↓'} {form.improvement.improved ? 'Improved' : 'Score dropped'} by {form.improvement.delta} pts
              </span>
            )}
          </span>
        ) : (
          <>
            <span className="save-setup-bar__warning">You&rsquo;ll lose this setup when you leave.</span>
            <button className="btn btn--ghost btn--sm" onClick={() => setForm(f => ({ ...f, open: !f.open }))} type="button">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
                <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/>
              </svg>
              Lock This Setup
            </button>
          </>
        )}
      </div>
      {form.open && (
        <div className="save-setup-form">
          <input
            className="save-setup-form__input"
            type="text"
            placeholder="Setup name..."
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            autoFocus
          />
          <div className="save-setup-form__tags">
            {['personal', 'studio'].map(tag => (
              <button
                key={tag}
                className={`chip${form.tag === tag ? ' chip--selected' : ''}`}
                onClick={() => setForm(f => ({ ...f, tag }))}
                type="button"
              >
                {tag.charAt(0).toUpperCase() + tag.slice(1)}
              </button>
            ))}
          </div>
          <button
            className="btn btn--primary btn--sm"
            onClick={handleSave}
            disabled={!form.name.trim()}
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

export default function ResultsScreenV2() {
  const { result, error, roomDimensions, user } = useAppState();
  const dispatch = useDispatch();
  const userEmail = user?.email || user?.username || null;
  const { isPaid, unlock, isAdmin, analysisCount, incrementCount } = usePaywall(userEmail);
  const { activeGate, fireGate, dismissGate } = usePaywallTrigger({ isPaid, analysisCount });
  const [zoomSrc, setZoomSrc] = useState(null);
  const appMode = useMode();

  // Session signal — outcome capture (did they get the shot?)
  const { sendSignal, sent: signalSent, outcome: signalOutcome, loading: signalLoading } = useSignal(
    result,
    {
      userId:      user?.id || null,
      inputMethod: result?.referenceImage ? 'reference_photo' : 'wizard',
    }
  );

  // MISSED_IT — failure event tracking
  const [failureEventId, setFailureEventId] = useState(null);
  const [showFailureFeedback, setShowFailureFeedback] = useState(false);

  // Shoot Mode paywall modal — shared by ShootModeCTA and FirstAttemptBanner
  const [shootPaywallOpen, setShootPaywallOpen] = useState(false);
  const [shootPaywallVariant, setShootPaywallVariant] = useState('default');

  function openShootPaywall(variant = 'default') {
    setShootPaywallVariant(variant);
    setShootPaywallOpen(true);
  }

  function handleShootPaywallUnlock() {
    unlock();
    setShootPaywallOpen(false);
    // Navigate into Shoot Mode immediately after unlocking
    dispatch({ type: 'SET_APP_MODE', mode: 'shoot' });
    dispatch({ type: 'NAVIGATE', screen: 'shoot_mode' });
  }

  useEffect(() => {
    if (result) {
      const score = result.bestMatch?.reliabilityScore;
      trackEvent('result_viewed', {
        pattern: result.bestMatch?.lightingPattern,
        score,
        input_method: result.referenceImage ? 'reference_photo' : 'wizard',
      });
      trackEvent('ANALYSIS_COMPLETE', {
        pattern: result.bestMatch?.lightingPattern,
        score,
      });
      incrementCount();
      if (score != null && score < 0.65) {
        trackEvent('low_confidence_detected', {
          pattern: result.bestMatch?.lightingPattern,
          score,
          flags: Object.entries(result.edgeCaseFlags || {}).filter(([, v]) => v).map(([k]) => k),
        });
      }
    }
  }, []);

  /* Reference analysis layers */
  const refAnalysis     = result?.referenceImageAnalysis?.description?.referenceAnalysis;
  const hasRefAnalysis  = refAnalysis?.ok === true;
  const imageRead       = hasRefAnalysis ? refAnalysis.image_read       : null;
  const lightingRead    = hasRefAnalysis ? refAnalysis.lighting_read    : null;
  const recreationSetup = hasRefAnalysis ? refAnalysis.recreation_setup : null;

  const refTestSteps  = useMemo(() => hasRefAnalysis ? buildRefTestSteps(lightingRead, recreationSetup)  : [], [hasRefAnalysis, lightingRead, recreationSetup]);
  const refQuickFixes = useMemo(() => hasRefAnalysis ? buildRefQuickFixes(lightingRead, recreationSetup) : [], [hasRefAnalysis, lightingRead, recreationSetup]);

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
        <p style={{ color: 'var(--color-text-dim)', textAlign: 'center', marginTop: 40 }}>
          No results yet. Go back and run a recommendation.
        </p>
      </div>
    );
  }

  const quickFixes = refQuickFixes.length > 0
    ? [...refQuickFixes, ...(result.quickFixes || [])]
    : result.quickFixes;

  const modifierFamily      = result.lightingIntelligence?.detectedModifier || null;
  const hasDiagram          = !!result.diagram;

  // Symptom detection from signal flags — memoised so getSymptomsFromSignals
  // doesn't re-run on every render that doesn't change signal data.
  const detectedSymptoms = useMemo(() => getSymptomsFromSignals({
    ambiguityFlags:   result.signalReliability?.ambiguityFlags           || {},
    edgeCaseFlags:    result.edgeCaseFlags                               || {},
    reliabilityScore: result.bestMatch?.reliabilityScore                 ?? 1,
    signalStrength:   result.signalReliability?.overallSignalStrength    ?? 1,
  }), [
    result.signalReliability,
    result.edgeCaseFlags,
    result.bestMatch?.reliabilityScore,
  ]);

  function handleSymptomNavigate(slug) {
    dispatch({ type: 'NAVIGATE_SYMPTOM', slug });
  }

  function handleAnalyzeAnother() {
    dispatch({ type: 'RESET' });
  }

  function handleBuildSetup() {
    // SET_INTENT initializes wizardSteps — avoids blank wizard screen
    dispatch({ type: 'SET_INTENT', intent: 'mood' });
  }

  // "Analyze Another Photo" only makes sense when the source was a photo upload
  const isPhotoSource = !!result.referenceImage;
  const analyzeLabel = isPhotoSource ? 'Analyze Another Photo' : 'New Setup';
  const buildLabel   = isPhotoSource ? 'Build This Setup'      : 'Start Over';

  return (
    <div className="screen">
      <h2 className="screen-heading">
        {result.referenceImage ? 'Reference Analysis' : (result.bestMatch?.name || 'Your Results')}
      </h2>
      {zoomSrc && <ZoomOverlay src={zoomSrc} alt="Reference photo" onClose={() => setZoomSrc(null)} />}
      {!isPaid && <ExitIntercept onUnlock={unlock} />}

      {/* Shoot Mode paywall — triggered from CTA and first-attempt banner */}
      {shootPaywallOpen && (
        <ShootModePaywall
          variant={shootPaywallVariant}
          onUnlock={handleShootPaywallUnlock}
          onClose={() => setShootPaywallOpen(false)}
        />
      )}

      {/* Success-moment paywall — fires after "Nailed it" outcome */}
      {activeGate?.trigger === 'success_moment' && (
        <SuccessMomentPaywall
          onUnlock={() => { unlock(); dismissGate(); }}
          onDismiss={dismissGate}
          pattern={result.bestMatch?.lightingPattern}
        />
      )}

      {/* ── Reference hero image ─────────────────────────────────────────── */}
      {result.referenceImage && (
        <div className="ref-hero">
          <div className="ref-hero__image">
            <img
              src={result.referenceImage}
              alt="Reference"
              onClick={() => setZoomSrc(result.referenceImage)}
            />
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

      {/* ────────────────────────────────────────────────────────────────────
          1. LOOK SUMMARY
          Always free — pattern name, confidence, rationale.
          ──────────────────────────────────────────────────────────────── */}
      <LookSummaryCard
        bestMatch={result.bestMatch}
        lightingIntelligence={result.lightingIntelligence}
        setupLightCount={result.setup?.lights?.length ?? null}
      />

      {/* ────────────────────────────────────────────────────────────────────
          1b. CONFIDENCE EXPLAINER + SYMPTOM SIGNALS
          Inline below the look summary — tells users what drove the result
          and surfaces any detected issues with the image.
          ──────────────────────────────────────────────────────────────── */}
      <ResultConfidenceExplainer
        bestMatch={result.bestMatch}
        signalReliability={result.signalReliability}
        edgeCaseFlags={result.edgeCaseFlags}
      />

      {detectedSymptoms.length > 0 && (
        <ResultSymptomSuggestions
          symptoms={detectedSymptoms}
          patternId={result.bestMatch?.lightingPattern}
          onSymptom={handleSymptomNavigate}
        />
      )}

      {/* Low-confidence compare prompt */}
      {result.alternatives?.length > 0 && (
        <ResultPatternComparePrompt
          bestMatch={result.bestMatch}
          alternatives={result.alternatives}
          onCompare={() => openShootPaywall('compare_patterns')}
        />
      )}

      {/* ════════════════════════════════════════════════════════════════════
          TWO-COLUMN LAYOUT  (1080px+ desktop)
          Primary  = setup / blueprint / CTA flow  (left)
          Secondary = details / gear / analysis     (right)
          Mobile: primary stacks first, secondary follows — correct order.
          ════════════════════════════════════════════════════════════════ */}
      <div className="results-two-col">
      <div className="results-two-col__primary">

      {/* ────────────────────────────────────────────────────────────────────
          2. DIAGRAM PREVIEW
          Surfaced immediately — not buried in a collapsible.
          ──────────────────────────────────────────────────────────────── */}
      {hasDiagram && (
        <DiagramCard
          spec={result.diagram}
          title="Lighting Diagram"
          cameraSettings={result.cameraSettings}
          spaceCheck={result.spaceCheck}
          roomDimensions={roomDimensions}
          twoHostSetup={result.twoHostSetup}
        />
      )}

      {/* ────────────────────────────────────────────────────────────────────
          3. RECREATE THIS SHOT  (free only — teaser before the paywall)
          Paid users go directly to Blueprint — no duplicate card.
          ──────────────────────────────────────────────────────────────── */}
      {!isPaid && (
        <RecreateCard
          lights={result.setup.lights}
          cameraSettings={result.cameraSettings}
        />
      )}

      {/* ────────────────────────────────────────────────────────────────────
          4. BLUEPRINT PREVIEW + MAIN PAYWALL GATE
          Single paywall moment. Outcome-driven CTA.
          ──────────────────────────────────────────────────────────────── */}
      <PaywallGate
        isPaid={isPaid}
        onUnlock={unlock}
        headline="Build this exactly — positions, modifiers, power ratios."
        bullets={BLUEPRINT_BULLETS}
      >
        <BlueprintCard
          lights={result.setup.lights}
          lightingIntelligence={result.lightingIntelligence}
          cameraSettings={result.cameraSettings}
          lightType={result.bestMatch?.lightType}
          lightTypeNote={result.bestMatch?.lightTypeNote}
          mode={appMode}
          twoHostSetup={result.twoHostSetup}
        />
      </PaywallGate>

      {/* ────────────────────────────────────────────────────────────────────
          5. SHOOT MODE CTA
          Placed directly after Blueprint. "Match This Lighting Live."
          Free users: "Recreate This Shot" → ShootModePaywall modal.
          ──────────────────────────────────────────────────────────────── */}
      <ShootModeCTA isPaid={isPaid} onUnlock={unlock} onOpenPaywall={openShootPaywall} />

      {/* Trigger 1: first-attempt friction banner (free, once per session) */}
      {!isPaid && <FirstAttemptBanner onOpenPaywall={openShootPaywall} />}

      {/* ────────────────────────────────────────────────────────────────────
          5b. ACTION CTA GROUP — secondary actions below the main CTA
          ──────────────────────────────────────────────────────────────── */}
      <ResultCTAGroup
        patternId={result.bestMatch?.lightingPattern}
        onAnalyze={handleAnalyzeAnother}
        onBuild={handleBuildSetup}
        analyzeLabel={analyzeLabel}
        buildLabel={buildLabel}
      />

      {/* ────────────────────────────────────────────────────────────────────
          6. REFINE YOUR SHOT  (secondary — appears after the attempt)
          1 free correction + locked adjustments.
          ──────────────────────────────────────────────────────────────── */}
      {quickFixes && quickFixes.length > 0 && (
        <RefineSection>
          <QuickFixesCard fixes={quickFixes} isPaid={isPaid} onUnlock={unlock} />
        </RefineSection>
      )}

      {/* ────────────────────────────────────────────────────────────────────
          7a. DID YOU GET THE SHOT? — outcome capture
          Appears after the setup has been shown. Feeds the learning engine.
          Signal rule: every session must produce a signal.
          ──────────────────────────────────────────────────────────────── */}
      <OutcomeCapture
        onOutcome={(outcome) => {
          sendSignal(outcome);
          if (outcome === 'nailed_it') {
            fireGate('NAILED_IT');
            // Attribute NAILED_IT to experiment variants
            fetch('/api/paywall/event', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                session_id: getSessionId(),
                event_name: 'OUTCOME_NAILED_IT',
                trigger: 'success_moment',
                type: 'value_triggered',
                analysis_count: analysisCount,
                active_flags: [],
              }),
            }).catch(() => {});
            // Record enriched NAILED_IT event for the intelligence system
            // Symmetric with MISSED_IT → /api/failures/event
            {
              const _sr = result?.signalReliability || {};
              const _sq = typeof _sr.overallSignalStrength === 'number' ? _sr.overallSignalStrength : null;
              fetch('/api/intelligence/nailed-it', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                  session_id: getSessionId(),
                  user_id: user?.id || null,
                  predicted_pattern: result?.bestMatch?.lightingPattern || 'unknown',
                  confidence: result?.bestMatch?.reliabilityScore ?? null,
                  signal_quality: _sq,
                  blueprint_id: result?.bestMatch?.systemId || null,
                  image_hash: result?.imageHash || null,
                  subject_type: result?.subjectType || null,
                  environment: result?.environment || null,
                  shadow_density: result?.shadowDensity ?? null,
                  lighting_geometry: result?.bestMatch?.lightingGeometry || null,
                  edge_case_flags: result?.edgeCaseFlags || {},
                }),
              }).catch(() => {});
            }
          }
          if (outcome === 'failed') {
            // Fire MISSED_IT — enriched failure event for the learning pipeline
            const edgeCaseFlags = result?.edgeCaseFlags || {};
            const signalReliability = result?.signalReliability || {};
            const signalQuality = typeof signalReliability.overallSignalStrength === 'number'
              ? signalReliability.overallSignalStrength
              : null;
            fetch('/api/failures/event', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                session_id: getSessionId(),
                user_id: user?.id || null,
                predicted_pattern: result?.bestMatch?.lightingPattern || 'unknown',
                confidence: result?.bestMatch?.reliabilityScore ?? null,
                signal_quality: signalQuality,
                blueprint_id: result?.bestMatch?.systemId || null,
                image_hash: result?.imageHash || null,
                edge_case_flags: edgeCaseFlags,
              }),
            })
              .then(r => r.ok ? r.json() : null)
              .then(data => {
                if (data?.id) {
                  setFailureEventId(data.id);
                  // Show structured feedback prompt after a short delay
                  setTimeout(() => setShowFailureFeedback(true), 600);
                }
              })
              .catch(() => {});
            trackEvent('OUTCOME_MISSED_IT', {
              pattern: result?.bestMatch?.lightingPattern,
              confidence: result?.bestMatch?.reliabilityScore,
            });
          }
        }}
        loading={signalLoading}
        sent={signalOutcome}
        setupId={result.bestMatch?.systemId || result.bestMatch?.name}
        mood={result.mood}
        pattern={result.bestMatch?.lightingPattern}
      />

      {/* MISSED_IT structured feedback — appears after 'Off' is confirmed */}
      {showFailureFeedback && failureEventId && (
        <OutcomeFeedback
          failureEventId={failureEventId}
          sessionId={getSessionId()}
          onDone={() => setShowFailureFeedback(false)}
        />
      )}

      </div>{/* end results-two-col__primary */}
      <div className="results-two-col__secondary">

      {/* ────────────────────────────────────────────────────────────────────
          7. SECONDARY CONTENT
          All collapsible. Gear, details, signal, feedback below the fold.
          ──────────────────────────────────────────────────────────────── */}

      <SpaceCheckCard
        data={result.spaceCheck}
        defaultOpen={result.spaceCheck?.warnings?.length > 0}
      />

      {result.skinToneAdjustments && (
        <CollapsibleSection title="Skin Tone" icon={ICON.palette}>
          <SkinToneCard data={result.skinToneAdjustments} />
        </CollapsibleSection>
      )}

      <CollapsibleSection title="Camera & Subject" icon={ICON.camera}>
        <PaywallGate
          isPaid={isPaid}
          onUnlock={unlock}
          headline="Camera settings for this exact setup."
          bullets={CAMERA_BULLETS}
          preview={false}
        >
          <CameraSubjectCard
            camera={result.cameraSettings}
            subject={result.subject}
            background={result.background}
          />
        </PaywallGate>
      </CollapsibleSection>

      <CollapsibleSection title="Gear" icon={ICON.bag}>
        {result.gearMatch && !result.gearMatch.isExact && (
          <div className={`gear-match-banner gear-match-banner--${result.gearMatch.tier}`}>
            <span className="gear-match-banner__label">{result.gearMatch.label}</span>
            {result.gearMatch.adaptNote && (
              <p className="gear-match-banner__note">{result.gearMatch.adaptNote}</p>
            )}
          </div>
        )}
        <PaywallGate
          isPaid={isPaid}
          onUnlock={unlock}
          headline="Gear that gets this result every time."
          preview={false}
        >
          <RecommendedKitsCard modifierFamily={modifierFamily} setupLights={result.setup?.lights} lightType={result.bestMatch?.lightType} />
        </PaywallGate>
        {(result.alternatives?.length > 0 || result.substitutions?.length > 0) && (
          <OtherSetupsCard
            alternatives={result.alternatives}
            substitutions={result.substitutions}
          />
        )}
      </CollapsibleSection>

      {/* Reference Analysis — only when photo was uploaded */}
      {hasRefAnalysis && (
        <>
          <CollapsibleSection title="Lighting Read" icon={ICON.lighting}>
            <RefLightingCard
              lightingRead={lightingRead}
              lightingIntelligence={result.lightingIntelligence}
            />
          </CollapsibleSection>
          <CollapsibleSection title="Image Read" icon={ICON.image}>
            <RefImageReadCard imageRead={imageRead} />
          </CollapsibleSection>
          <CollapsibleSection title="Recreation Setup" icon={ICON.target}>
            <RefRecreationCard recreationSetup={recreationSetup} />
          </CollapsibleSection>
          <CollapsibleSection title="Interpretations" icon={ICON.search}>
            <RefInterpretationsCard lightingRead={lightingRead} recreationSetup={recreationSetup} />
          </CollapsibleSection>
        </>
      )}

      <CollapsibleSection title="Signal Quality" icon={ICON.activity}>
        <SignalQualityCard
          signalReliability={result.signalReliability}
          faceValidation={result.faceValidation}
          edgeCaseFlags={result.edgeCaseFlags}
        />
      </CollapsibleSection>

      </div>{/* end results-two-col__secondary */}
      </div>{/* end results-two-col */}

      <MySetupsCard />

      {/* ── Admin debug section ───────────────────────────────────────────── */}
      {isAdmin && (
        <>
          {result.vlmDescription && (
            <CollapsibleSection title="VLM Description" icon={ICON.eye}>
              <DebugBlock content={typeof result.vlmDescription === 'string' ? result.vlmDescription : JSON.stringify(result.vlmDescription, null, 2)} />
            </CollapsibleSection>
          )}
          {result.vlmReconstruction && (
            <CollapsibleSection title="VLM Reconstruction" icon={ICON.eye}>
              <DebugBlock content={JSON.stringify(result.vlmReconstruction, null, 2)} />
            </CollapsibleSection>
          )}
          <CollapsibleSection title="Lighting Intelligence" icon={ICON.eye}>
            <DebugBlock content={JSON.stringify(result.lightingIntelligence, null, 2)} />
          </CollapsibleSection>
          <CollapsibleSection title="Match Data" icon={ICON.eye}>
            <DebugBlock content={JSON.stringify({ bestMatch: result.bestMatch, setup: result.setup, signalReliability: result.signalReliability }, null, 2)} />
          </CollapsibleSection>
        </>
      )}

      {/* ── Save setup — sticky bottom bar ───────────────────────────────── */}
      <SaveBar result={result} />

    </div>
  );
}
