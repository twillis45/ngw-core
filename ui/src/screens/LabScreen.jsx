import { useState, useEffect, useCallback, useRef } from 'react';
import { useAppState, useDispatch } from '../context/AppContext';
import { savePreference, loadPreferences } from '../data/authApi';
import LearningOpsTab from '../components/lab/LearningOpsTab';
import BenchmarkTab from '../components/lab/BenchmarkTab';
import SignalsTab from '../components/lab/SignalsTab';
import ControlCenterTab from '../components/lab/ControlCenterTab';
import UserTab from '../components/lab/UserTab';
import { C } from '../lib/statusColors';
import {
  analyzeImage,
  listGoldSet,
  createGoldSetEntry,
  updateGoldSetEntry,
  deleteGoldSetEntry,
  evaluateGoldSet,
  getGoldSetImageUrl,
  listCandidates,
  createCandidate,
  updateCandidate,
  deleteCandidate,
  ingestReferenceImage,
  listReferenceDataset,
  getReferenceEntry,
  getReferenceThumbnailUrl,
  getReferenceImageUrl,
  getReferenceDebugOverlayUrl,
  approveReference,
  rejectReference,
  reprocessReference,
  updateReferenceMetadata,
  labFetchBlob,
  evaluateCandidate,
  getCandidateEvaluations,
  applyCandidate,
  seedGoldSetFromReference,
  getMonitoringSummary,
  getBenchmarkSummary,
  getIntelligenceScore,
  getApiKeyHealth,
} from '../data/labApi';

/** Device timezone — explicit in all date formatting calls. */
const _TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Format a Unix timestamp or ISO string as a short date+time in device timezone. */
const fmtDT = v => {
  if (!v) return '—';
  const d = typeof v === 'number' ? new Date(v < 1e12 ? v * 1000 : v) : new Date(v);
  if (isNaN(d.getTime())) return String(v);
  return d.toLocaleString(undefined, { timeZone: _TZ, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

/** Format a number with locale comma separators. Returns '—' for null/undefined. */
const fmtN = n => (n == null ? '—' : Number(n).toLocaleString());

/**
 * AuthImage — fetches a lab image endpoint with Bearer auth and renders it.
 * Handles object URL lifecycle (create on mount, revoke on unmount/change).
 */
function AuthImage({ path, alt, className, style }) {
  const [src, setSrc] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!path) return;
    let objectUrl = null;
    setError(false);
    setSrc(null);
    labFetchBlob(path)
      .then(url => { objectUrl = url; setSrc(url); })
      .catch(() => setError(true));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [path]);

  if (error) {
    return (
      <div className={className} style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-surface)', color: 'var(--color-text-secondary)', fontSize: 'var(--text-xs)' }}>
        Image unavailable
      </div>
    );
  }
  if (!src) {
    return (
      <div className={className} style={{ ...style, background: 'var(--color-surface-elevated)', animation: 'pulse 1.5s ease-in-out infinite' }} />
    );
  }
  return <img src={src} alt={alt} className={className} style={style} />;
}

// ── Zoomable lightbox (shared by Workbench overlay + RefDetailImage) ──────────
/**
 * Full-screen lightbox with scroll-to-zoom and drag-to-pan.
 * Pass the image/content as children; handles all pointer events.
 */
function ZoomableLightbox({ onClose, children }) {
  const [scale, setScale] = useState(1);
  const [pan, setPan]     = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef      = useRef(null);
  const scaleRef     = useRef(1);
  const panRef       = useRef({ x: 0, y: 0 });
  const containerRef = useRef(null);

  scaleRef.current = scale;
  panRef.current   = pan;

  // Wheel zoom — non-passive so we can preventDefault
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      const next = Math.min(Math.max(scaleRef.current * factor, 0.5), 8);
      scaleRef.current = next;
      setScale(next);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Escape key closes the lightbox
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function onPointerDown(e) {
    // Don't capture pointer when clicking buttons/controls — they need their own click events
    if (e.target.closest('button')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    dragRef.current = { sx: e.clientX, sy: e.clientY, px: panRef.current.x, py: panRef.current.y };
  }
  function onPointerMove(e) {
    if (!dragRef.current) return;
    const next = {
      x: dragRef.current.px + e.clientX - dragRef.current.sx,
      y: dragRef.current.py + e.clientY - dragRef.current.sy,
    };
    panRef.current = next;
    setPan(next);
  }
  function onPointerUp() { dragRef.current = null; setDragging(false); }
  function onDoubleClick(e) {
    if (e.target.closest('button')) return;
    if (scaleRef.current > 1.2) { setScale(1); setPan({ x: 0, y: 0 }); }
    else { setScale(2.5); }
  }
  const zoomIn    = () => setScale(s => Math.min(s * 1.3, 8));
  const zoomOut   = () => setScale(s => Math.max(s / 1.3, 0.5));
  const zoomReset = () => { setScale(1); setPan({ x: 0, y: 0 }); };

  const cursor = dragging ? 'grabbing' : (scale > 1.05 ? 'grab' : 'zoom-in');

  return (
    // Outer backdrop — click anywhere outside the controls to close
    <div className="lab-overlay-lightbox" onClick={onClose}>
      {/* Inner container — stopPropagation only on the drag area, not buttons */}
      <div
        ref={containerRef}
        className="lab-overlay-lightbox__inner"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onDoubleClick}
        style={{ cursor, touchAction: 'none', overflow: 'hidden' }}
      >
        {/* Close button — stopPropagation so backdrop onClick doesn't also fire */}
        <button
          className="lab-overlay-lightbox__close"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
        >
          ✕
        </button>

        {/* Transformed image layer — pointer-events none so drag goes to container */}
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
            transformOrigin: 'center center',
            transition: dragging ? 'none' : 'transform 0.12s ease',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none',
            width: '100%', height: '100%',
          }}
          onClick={e => e.stopPropagation()}
        >
          {children}
        </div>

        {/* Zoom controls strip — stopPropagation so clicking them doesn't close */}
        <div
          className="lab-overlay-lightbox__zoom-controls"
          onClick={e => e.stopPropagation()}
        >
          <button onClick={zoomOut} title="Zoom out">−</button>
          <span>{Math.round(scale * 100)}%</span>
          <button onClick={zoomIn} title="Zoom in">+</button>
          <button onClick={zoomReset} title="Fit to screen">Fit</button>
        </div>
        <p className="lab-overlay-lightbox__hint">Scroll to zoom · drag to pan · double-click to fit · Esc to close</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LAB HELP CONTENT  (one entry per tab)
// ─────────────────────────────────────────────────────────────────────────────
const LAB_HELP = {
  workbench: {
    title: 'Workbench',
    what: 'Run the full 7-stage VLM analysis pipeline on any photo. Upload an image, trigger analysis, and inspect every output field — pattern, modifiers, confidence, scene read, recreation setup, and optional debug overlays.',
    features: [
      { label: 'Upload & Analyze', desc: 'Drag-drop or pick any photo. Hit Analyze to run the full pipeline against the current ruleset.' },
      { label: 'Result Inspector', desc: 'Expand any result field — lighting read, pattern candidates, recreation setup, signal quality flags.' },
      { label: 'Save to Gold Set', desc: 'Good result? Push it directly to the Gold Set as a labeled training example.' },
      { label: 'Propose Rule', desc: 'Disagreement with the output? Open a Candidate rule change pre-filled with this analysis.' },
      { label: 'Debug Overlays', desc: 'Toggle face-box, shadow arrows, catchlight dots, and region annotations for visual inspection.' },
    ],
    tips: [
      'Workbench always runs against the live ruleset — not a snapshot. Re-run after promoting a candidate to see the delta.',
      'Switch to Gold Set tab immediately after a good analysis — your result pre-fills the form.',
    ],
  },
  gold_set: {
    title: 'Gold Set',
    what: 'The labeled ground-truth library used to evaluate the analysis engine. Each entry pairs an image with its expected analysis output. The Gold Set drives benchmark scoring and catches regressions.',
    features: [
      { label: 'Entry List', desc: 'Browse all labeled examples. Filter by pattern, confidence tier, or date added.' },
      { label: 'Add Entry', desc: 'Create a new labeled example manually or accept a pre-fill from Workbench.' },
      { label: 'Edit / Delete', desc: 'Correct wrong labels, update expected outputs, or remove stale examples.' },
      { label: 'Run Evaluation', desc: 'Score the current engine against the entire Gold Set. Results feed the Benchmarks tab.' },
      { label: 'Image Preview', desc: 'View the gold-set image alongside its expected vs. actual analysis.' },
    ],
    tips: [
      'Aim for ≥10 entries per pattern for reliable benchmark coverage.',
      'After promoting a Candidate, run a Gold Set evaluation to confirm no regressions before shipping.',
    ],
  },
  candidates: {
    title: 'Candidates',
    what: 'Proposed ruleset changes waiting for evaluation. A Candidate describes a targeted adjustment — scoring weight, confidence threshold, modifier mapping — with rationale and evidence. Candidates move through Draft → Evaluated → Promoted lifecycle.',
    features: [
      { label: 'Candidate List', desc: 'All open proposals. Filter by status (draft, evaluated, promoted, rejected).' },
      { label: 'Create Candidate', desc: 'Write a new rule change with title, description, rationale, and proposed JSON delta.' },
      { label: 'Evaluate', desc: 'Run the candidate against the Gold Set to measure impact on accuracy and confidence.' },
      { label: 'Promote', desc: 'Apply an evaluated candidate to the live ruleset. Creates a monitoring window automatically.' },
      { label: 'Release / Rollback', desc: 'Close the monitoring window or roll back a promoted candidate that caused a regression.' },
    ],
    tips: [
      'Always evaluate against the Gold Set before promoting — check the accuracy delta.',
      'Use Learning Ops → Clusters to find failure patterns before writing candidates.',
    ],
  },
  ref_dataset: {
    title: 'Reference Dataset',
    what: 'Curated photographer reference images organized by lighting pattern. Each entry is a multi-stage processed image: ingested → VLM-analyzed → approved/rejected. Approved entries become the embedding index for shoot-match similarity search.',
    features: [
      { label: 'Browse by Pattern', desc: 'View all reference images grouped by the 28 lighting patterns.' },
      { label: 'Ingest', desc: 'Add new reference images. Triggers VLM analysis and embedding generation automatically.' },
      { label: 'Approve / Reject', desc: 'Review auto-ingested images. Approved images join the active shoot-match index.' },
      { label: 'Reprocess', desc: 'Re-run VLM analysis on a reference image (e.g. after a ruleset update).' },
      { label: 'Debug Overlay', desc: 'View face-box and lighting annotation overlays on any reference image.' },
    ],
    tips: [
      'Reject blurry, over-cropped, or ambiguous images — they degrade shoot-match quality.',
      'Target 5–15 approved images per pattern for a balanced embedding index.',
    ],
  },
  signals: {
    title: 'Signals',
    what: 'Live user outcome events — nailed-it, missed-it, and outcome-unknown — that drive intelligence scoring, calibration hints, and the autonomy loop. Signals are the ground-truth feedback channel from real shoots.',
    features: [
      { label: 'Signal List', desc: 'Browse all recent outcome events with pattern, confidence, and outcome type.' },
      { label: 'Hygiene Check', desc: 'Audit signal health: count, freshness, balance, and seeded vs. real split.' },
      { label: 'Seed Signals', desc: 'Inject synthetic signals for testing. Use for dev-mode calibration.' },
      { label: 'Calibration View', desc: 'Per-environment calibration breakdown — confidence vs. actual outcome agreement.' },
      { label: 'Recalibration Hints', desc: 'Patterns where confidence is mis-calibrated. Surfaced in Control Center → Support.' },
    ],
    tips: [
      'A signal imbalance (all nailed-it, no missed-it) inflates the intelligence score artificially. Use Seed Signals to balance if needed.',
      'Gold Set Suggestions (Control Center → Support) surface patterns with low signal coverage.',
    ],
  },
  learning: {
    title: 'Learning Ops',
    what: 'The closed-loop learning pipeline. Surfaces failure clusters, manages pattern knowledge, runs the ingestion scheduler, monitors post-release regressions, and simulates revenue impact of proposed changes.',
    features: [
      { label: 'Overview', desc: 'Ops summary: open clusters, pending evaluations, active monitoring windows, alerts.' },
      { label: 'Clusters', desc: 'Failure clusters grouped by pattern and error type. Generate a Candidate directly from any cluster.' },
      { label: 'Monitoring', desc: 'Post-release monitoring windows. View drift alerts and trigger sweep to check live performance.' },
      { label: 'Knowledge Base', desc: 'Per-pattern ruleset knowledge: signal counts by risk tier, required thresholds, current risk level.' },
      { label: 'Revenue', desc: 'Simulate 30-day revenue delta under Conservative / Moderate / Aggressive deployment scenarios.' },
      { label: 'Scheduler', desc: 'Background ingestion scheduler: enable/disable, configure interval, trigger a manual run.' },
    ],
    tips: [
      'Revenue simulation uses real pattern signal data — run it before promoting any high-risk candidate.',
      'Set the scheduler to run every 24h in production. Use "Run Now" for immediate cluster updates after bulk signal ingestion.',
    ],
  },
  benchmarks: {
    title: 'Benchmarks',
    what: 'Automated accuracy scoring of the analysis engine against the Gold Set. Tracks score history, pattern-level metrics, and drift. Use before and after promoting Candidates to measure real impact.',
    features: [
      { label: 'Run Benchmark', desc: 'Score the current engine against all Gold Set entries. Produces accuracy, precision, recall, and F1 per pattern.' },
      { label: 'Baseline', desc: 'Lock a snapshot as the performance baseline. Future runs compare against it.' },
      { label: 'Score History', desc: 'Trend chart of benchmark scores over time. Spot regressions quickly.' },
      { label: 'Pattern Metrics', desc: 'Drill into per-pattern accuracy, miss rate, and confidence alignment.' },
      { label: 'Drift Check', desc: 'Compare current performance to the locked baseline. Flags patterns with significant drift.' },
      { label: 'CI Gate', desc: 'Run a CI-mode benchmark to enforce minimum accuracy thresholds. Fails fast on regressions.' },
    ],
    tips: [
      'Overall score target: ≥80% (green). ≥60% is marginal (amber). <60% is a regression — investigate before promoting any Candidate.',
      'Pattern Accuracy target: ≥80%. If a single pattern falls below 65%, open a Cluster review for that pattern.',
      'Blueprint Score target: ≥80%. Low blueprint scores mean the VLM is correctly naming the pattern but predicting the wrong key position or fill ratio.',
      'Confidence Error target: <±0.04. Values above ±0.04 mean the engine is over- or under-confident relative to real outcomes — miscalibration.',
      'Drift thresholds in the auto-check: overall >2% drop triggers an alert; per-pattern >4% drop triggers a warning; conf. error >±0.04 triggers review.',
      'Set a baseline immediately after each successful Candidate promotion. Future drift checks compare against that snapshot.',
    ],
  },
  control_center: {
    title: 'Control Center',
    what: 'Central maintenance and operations dashboard. Six sub-sections cover the scheduler, intelligence score, paywall, support signals, live monitoring, and account inspection.',
    features: [
      { label: 'System', desc: 'Scheduler on/off, interval config, manual ingestion trigger, health overview (clusters, alerts, pending evals).' },
      { label: 'Intelligence', desc: 'Global intelligence score (target ≥70), per-pattern breakdown, autonomy queue review, failure cluster map.' },
      { label: 'Paywall', desc: 'Value state map, paywall type reference, live pricing test with real signal simulation.' },
      { label: 'Support', desc: 'Recalibration hints (mis-calibrated patterns), gold set coverage gaps, and VLM correction log.' },
      { label: 'Monitoring', desc: 'Alert engine (VLM error rate, volume, latency rules), VLM call sparkline, analysis funnel, Stripe webhook health, and frontend error console.' },
      { label: 'User', desc: 'Account identity, subscription status, session diagnostics, feature flags, and local storage inspector for prod support.' },
    ],
    tips: [
      'Intelligence score of 50 means insufficient data — seed signals or run a benchmark pass first.',
      'Live Paywall Test lets you verify each value state detects correctly before pushing to production.',
      'Monitoring auto-refreshes every 60s. Alert Engine turns red when VLM error rate exceeds 20% or call volume drops to zero.',
      'Sub-sections are draggable — reorder them to match your workflow. ↺ resets to default.',
    ],
  },
  user: {
    title: 'User',
    what: 'Local data inspector for the currently loaded session. Shows auth state, subscription tier, feature flags, server-loaded account identity, and raw ngw_* localStorage entries.',
    features: [
      { label: 'Identity', desc: 'Server-verified email, user ID, and account flags from /api/auth/me.' },
      { label: 'Subscription', desc: 'Current plan tier, billing period, and status from the backend subscription record.' },
      { label: 'Feature Flags', desc: 'All active flags with live toggle switches. Changes persist to localStorage immediately.' },
      { label: 'Saved Data', desc: 'Count of saved setups and kit items from the server.' },
      { label: 'Local Storage', desc: 'Full dump of all ngw_* localStorage keys. Useful for diagnosing auth or flag issues.' },
    ],
    tips: [
      'Feature flag toggles write directly to localStorage — useful for testing flag-gated features without a backend config change.',
      'If Identity shows "Dev Mode" instead of an email, the backend is running with NGW_DEV_MODE=1.',
      'Use the refresh button (↺) to re-fetch all server data without reloading the page.',
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// GLOSSARY  (shown at bottom of every help panel)
// ─────────────────────────────────────────────────────────────────────────────
const LAB_GLOSSARY = [
  { term: 'VLM',    def: 'Vision Language Model — the AI that reads a photo and outputs pattern, confidence, modifiers, and scene description.' },
  { term: 'CV',     def: 'Computer Vision — traditional image analysis (face detection, region segmentation) that runs before and alongside VLM.' },
  { term: 'CVR',    def: 'Conversion Rate — % of active users who subscribe. Primary revenue metric driving autonomy and paywall decisions.' },
  { term: 'ARPU',   def: 'Average Revenue Per User — monthly subscription revenue ÷ active users. Used in revenue simulation.' },
  { term: 'Conf.',  def: 'Confidence — 0–1 score for engine certainty about a pattern ID. Good: ≥0.65. Mismatch vs. outcome = miscalibration.' },
  { term: 'δ / Δ',  def: 'Delta — change in a metric between two runs or time periods (e.g. benchmark score delta vs. previous run).' },
  { term: 'GS',     def: 'Gold Set — labeled ground-truth image library used to benchmark the engine. Aim for ≥10 entries per pattern.' },
  { term: 'LO',     def: 'Learning Ops — closed-loop pipeline: ingests signals, clusters failures, generates candidates, monitors releases.' },
  { term: 'BM',     def: 'Benchmark — automated accuracy scoring of the analysis engine against the Gold Set. Target overall: ≥80%.' },
  { term: 'Sig.',   def: 'Signal — a user outcome event (nailed-it / missed-it / unknown) from a real shoot. Drives intelligence scoring.' },
  { term: 'NGW',    def: 'No Guesswork — the product and system name.' },
  { term: 'Conf. δ',def: 'Confidence Delta — how much the engine\'s confidence score shifted vs. baseline. Threshold: ≤±0.04.' },
];

// ─────────────────────────────────────────────────────────────────────────────
// ZOOM IMG — drop-in <img> replacement with click-to-lightbox
// ─────────────────────────────────────────────────────────────────────────────
function ZoomImg({ src, alt = '', className, style, onError }) {
  const [zoomed, setZoomed] = useState(false);
  if (!src) return null;
  return (
    <>
      <img
        src={src}
        alt={alt}
        className={className}
        style={{ ...style, cursor: 'zoom-in' }}
        onError={onError}
        onClick={() => setZoomed(true)}
      />
      {zoomed && (
        <ZoomableLightbox onClose={() => setZoomed(false)}>
          <img
            src={src}
            alt={alt}
            style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8, display: 'block' }}
          />
        </ZoomableLightbox>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HELP PANEL
// ─────────────────────────────────────────────────────────────────────────────
function LabHelpPanel({ tabId, onClose }) {
  const h = LAB_HELP[tabId];
  const [glossaryOpen, setGlossaryOpen] = useState(false);
  if (!h) return null;
  return (
    <div style={{
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-lg)',
      padding: 'var(--space-md)',
      marginBottom: 'var(--space-md)',
      position: 'relative',
    }}>
      {/* Close button */}
      <button
        onClick={onClose}
        aria-label="Close help"
        style={{
          position: 'absolute', top: 'var(--space-sm)', right: 'var(--space-sm)',
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--color-text-secondary)', padding: '2px 6px',
          fontSize: 'var(--text-base)', lineHeight: 1,
          borderRadius: 'var(--radius-sm)',
        }}
      >✕</button>

      {/* Header */}
      <div style={{ marginBottom: 'var(--space-sm)', paddingRight: 'var(--space-xl)' }}>
        <span style={{
          fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.08em',
          color: 'var(--color-accent)', textTransform: 'uppercase',
        }}>Help — {h.title}</span>
        <p style={{
          margin: 'var(--space-xs) 0 0',
          fontSize: 'var(--text-sm)',
          color: 'var(--color-text-secondary)',
          lineHeight: 1.5,
        }}>{h.what}</p>
      </div>

      {/* Features */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
        gap: 'var(--space-xs)',
        marginBottom: 'var(--space-sm)',
      }}>
        {h.features.map(f => (
          <div key={f.label} style={{
            background: 'var(--color-surface-elevated)',
            border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-xs) var(--space-sm)',
          }}>
            <div style={{
              fontSize: 'var(--text-xs)', fontWeight: 600,
              color: 'var(--color-text)', marginBottom: 2,
            }}>{f.label}</div>
            <div style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-secondary)',
              lineHeight: 1.4,
            }}>{f.desc}</div>
          </div>
        ))}
      </div>

      {/* Tips */}
      {h.tips?.length > 0 && (
        <div style={{
          borderTop: '1px solid var(--color-border)',
          paddingTop: 'var(--space-xs)',
          display: 'flex', flexDirection: 'column', gap: 4,
          marginBottom: 'var(--space-xs)',
        }}>
          {h.tips.map((tip, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 'var(--space-xs)',
              fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)',
            }}>
              <span style={{ color: 'var(--color-accent)', flexShrink: 0, marginTop: 1 }}>→</span>
              <span>{tip}</span>
            </div>
          ))}
        </div>
      )}

      {/* Glossary — collapsible, global across all tabs */}
      <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-xs)' }}>
        <button
          onClick={() => setGlossaryOpen(o => !o)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0',
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 'var(--text-xs)', fontWeight: 600,
            color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em',
          }}
        >
          <span style={{ fontSize: 'var(--text-xs)', opacity: 0.7 }}>{glossaryOpen ? '▾' : '▸'}</span>
          LAB Glossary
        </button>
        {glossaryOpen && (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 4, marginTop: 'var(--space-xs)',
          }}>
            {LAB_GLOSSARY.map(({ term, def }) => (
              <div key={term} style={{
                fontSize: 'var(--text-xs)', lineHeight: 1.4,
                padding: '3px 0',
              }}>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontWeight: 700,
                  color: 'var(--color-accent)', marginRight: 6,
                }}>{term}</span>
                <span style={{ color: 'var(--color-text-secondary)' }}>{def}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * NGW Lab — internal dev tools.
 * Protected by enable_lab feature flag + logged-in user.
 * Tabs: Workbench, Gold Set, Candidates, Reference Dataset, Learning Ops.
 */
export default function LabScreen() {
  const { user, labPendingImage } = useAppState();
  const dispatch = useDispatch();
  const [activeTab, setActiveTab] = useState('workbench');
  // Lazy-mount: only mount a tab on first visit, then keep it alive.
  // This prevents all 8 tabs from firing their useEffect API calls simultaneously
  // on LabScreen load — only the initial active tab (workbench) loads up front.
  const [mountedTabs, setMountedTabs] = useState(() => new Set(['workbench']));

  /** Switch to a tab, mounting it on first visit. */
  function switchTab(tabId) {
    setMountedTabs(prev => {
      if (prev.has(tabId)) return prev;
      const next = new Set(prev);
      next.add(tabId);
      return next;
    });
    setActiveTab(tabId);
  }

  const [goldSetPrefill, setGoldSetPrefill] = useState(null);
  const [candidatePrefill, setCandidatePrefill] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  // Track what's currently loaded in WorkbenchTab so Gold Set can mirror it
  const [workbenchSnapshot, setWorkbenchSnapshot] = useState(null);
  // Tab header metric pills — loaded once on mount
  const [tabMetrics, setTabMetrics] = useState({});
  // Cross-tab navigation — set by ControlCenterTab, consumed by LearningOpsTab
  const [learningNavRequest, setLearningNavRequest] = useState(null);
  // Drag-to-reorder tabs
  const [dragSrc, setDragSrc] = useState(null);
  const [tabOrder, setTabOrder] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ngw_lab_tab_order') || 'null'); } catch { return null; }
  });

  // Sync tab order from server on mount (when logged in) — server wins over
  // localStorage so the layout follows the user across devices.
  useEffect(() => {
    if (!user) return;
    loadPreferences()
      .then(prefs => {
        const serverOrder = prefs['lab_tab_order'];
        if (Array.isArray(serverOrder) && serverOrder.length > 0) {
          setTabOrder(serverOrder);
          try { localStorage.setItem('ngw_lab_tab_order', JSON.stringify(serverOrder)); } catch {}
        }
      })
      .catch(() => { /* network error — keep localStorage value */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]); // re-run only when the logged-in user changes

  /** Navigate to a specific tab+panel, optionally with filter state. */
  function handleNavigateTo({ tab, panel, status, severity, clusterId } = {}) {
    if (tab) switchTab(tab);
    if (panel || status || severity || clusterId) {
      setLearningNavRequest({ panel, status, severity, clusterId });
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function loadTabMetrics() {
      const next = {};
      await Promise.allSettled([
        // Gold Set: approved count
        listGoldSet('approved', 500)
          .then(r => { next.gold_set = { value: fmtN(r.length), color: r.length > 0 ? 'green' : 'muted' }; })
          .catch(() => {}),
        // Candidates: pending count
        listCandidates('pending', 200)
          .then(r => { next.candidates = { value: fmtN(r.length), color: r.length > 0 ? 'amber' : 'muted' }; })
          .catch(() => {}),
        // Reference Dataset: total gold entries
        listReferenceDataset({ tier: 'gold' })
          .then(r => { next.ref_dataset = { value: fmtN(r.length), color: 'muted' }; })
          .catch(() => {}),
        // Signals: active monitoring alerts
        getMonitoringSummary()
          .then(r => {
            const n = r?.active_alerts ?? 0;
            next.signals = { value: n > 0 ? `${n} alert${n !== 1 ? 's' : ''}` : '✓ clear', color: n > 0 ? 'red' : 'green' };
          })
          .catch(() => {}),
        // Learning Ops: intelligence score (0–100 scale, cached, fast)
        getIntelligenceScore(30, false)
          .then(r => {
            if (r?.score != null) {
              const pct = Math.round(r.score); // score is already 0–100
              next.learning = { value: `${pct}%`, color: pct >= 70 ? 'green' : pct >= 50 ? 'amber' : 'red' };
            }
          })
          .catch(() => {}),
        // Benchmarks: pass rate from latest run
        getBenchmarkSummary()
          .then(r => {
            if (r?.has_runs) {
              if (r.passed_cases != null && r.total_cases > 0) {
                const pct = Math.round((r.passed_cases / r.total_cases) * 100);
                next.benchmarks = { value: `${pct}% pass`, color: pct >= 90 ? 'green' : pct >= 70 ? 'amber' : 'red' };
              } else if (r.overall_score != null) {
                const pct = Math.round(r.overall_score * 100);
                next.benchmarks = { value: `${pct}%`, color: pct >= 90 ? 'green' : pct >= 70 ? 'amber' : 'red' };
              }
            }
          })
          .catch(() => {}),
        // Control Center: API key health
        getApiKeyHealth()
          .then(r => {
            const hasErr = r?.has_errors === true || r?.latest_event?.event_type === '401_error';
            const available = r?.vlm_available !== false;
            next.control_center = {
              value: !available ? '✗ no VLM' : hasErr ? '✗ key err' : '✓ healthy',
              color: (!available || hasErr) ? 'red' : 'green',
            };
          })
          .catch(() => {}),
      ]);
      if (!cancelled) setTabMetrics(next);
    }
    loadTabMetrics();
    return () => { cancelled = true; };
  }, []);

  // Intercept all tab switches so we can auto-populate Gold Set from workbench
  function handleTabSwitch(tabId) {
    if (tabId === 'gold_set' && workbenchSnapshot && !goldSetPrefill) {
      setGoldSetPrefill({
        image_path:        workbenchSnapshot.imagePath || '',
        expected_analysis: workbenchSnapshot.result
          ? (workbenchSnapshot.result.reference_analysis || workbenchSnapshot.result.description || {})
          : {},
        notes:             workbenchSnapshot.imagePath
          ? `Workbench analysis ${new Date().toLocaleDateString(undefined, { timeZone: _TZ })}`
          : '',
        imagePreview: workbenchSnapshot.preview,
        imageFile:    workbenchSnapshot.file,
      });
    }
    switchTab(tabId);
  }

  function handleSaveToGoldSet(result) {
    setGoldSetPrefill({
      image_path: result.image_path || '',
      expected_analysis: result.reference_analysis || result.description || {},
      notes: `Workbench analysis ${new Date().toLocaleDateString(undefined, { timeZone: _TZ })}`,
      imagePreview: workbenchSnapshot?.preview || null,
      imageFile:    workbenchSnapshot?.file    || null,
    });
    switchTab('gold_set');
  }

  function handleProposeRule(result, prefill) {
    const imagePreview = workbenchSnapshot?.preview || null;
    const imagePath    = result?.image_path || workbenchSnapshot?.imagePath || null;
    if (prefill) {
      setCandidatePrefill({ ...prefill, imagePreview, source_image_path: imagePath });
    } else {
      const analysis = result.reference_analysis || {};
      const lighting = analysis.lighting_read || {};
      const setup = analysis.recreation_setup || {};
      setCandidatePrefill({
        title: `Rule from ${setup.setup_family || lighting.lighting_family || 'analysis'}`,
        description: '',
        rationale: `Based on workbench analysis of ${imagePath || 'uploaded image'}`,
        proposed_change: { source_analysis: analysis },
        imagePreview,
        source_image_path: imagePath,
      });
    }
    switchTab('candidates');
  }

  if (!user) {
    return (
      <div className="screen">
        <div className="shoot-mode__empty">
          <p>Sign in required</p>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
            NGW Lab requires authentication.
          </p>
          <button
            className="btn btn--primary btn--sm"
            onClick={() => dispatch({ type: 'NAVIGATE', screen: 'auth' })}
            style={{ marginTop: 'var(--space-md)' }}
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  const TAB_DEFS = [
    // ── Analysis ──
    { id: 'workbench',      label: 'Workbench',          group: 'Analysis' },
    { id: 'gold_set',       label: 'Gold Set',           group: 'Analysis',   metricKey: 'gold_set',       metricLabel: 'Approved gold set images' },
    { id: 'candidates',     label: 'Candidates',          group: 'Analysis',   metricKey: 'candidates',     metricLabel: 'Pending candidates awaiting review' },
    { id: 'ref_dataset',    label: 'Reference Dataset',   group: 'Analysis',   metricKey: 'ref_dataset',    metricLabel: 'Gold-tier reference dataset entries' },
    // ── Intelligence ──
    { id: 'signals',        label: 'Signals',             group: 'Intelligence', metricKey: 'signals',      metricLabel: 'Active monitoring alerts' },
    { id: 'learning',       label: 'Learning Ops',        group: 'Intelligence', metricKey: 'learning',     metricLabel: 'Intelligence score (0–100): composite of signal volume, pattern coverage, benchmark pass rate, and VLM correction rate over 30 days. ≥70 = healthy, 50–69 = needs attention, <50 = insufficient data.' },
    { id: 'benchmarks',     label: 'Benchmarks',          group: 'Intelligence', metricKey: 'benchmarks',   metricLabel: 'Benchmark pass rate — latest run' },
    // ── System ──
    { id: 'control_center', label: '⚙ Control Center',   group: 'System',     metricKey: 'control_center', metricLabel: 'API / VLM health status' },
    { id: 'user',           label: '👤 User',             group: 'System',                                  metricLabel: 'Local auth, paywall, feature flags, and storage inspector' },
  ];

  // Apply saved drag order (falls back to default order above)
  const tabs = tabOrder
    ? tabOrder.map(id => TAB_DEFS.find(t => t.id === id)).filter(Boolean)
    : TAB_DEFS;

  function handleDragStart(e, id) {
    setDragSrc(id);
    e.dataTransfer.effectAllowed = 'move';
  }
  function handleDragOver(e, id) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }
  function handleDrop(e, targetId) {
    e.preventDefault();
    if (!dragSrc || dragSrc === targetId) return;
    const ids = tabs.map(t => t.id);
    const from = ids.indexOf(dragSrc);
    const to   = ids.indexOf(targetId);
    if (from === -1 || to === -1) return;
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, dragSrc);
    setTabOrder(next);
    // Persist locally for instant restore on next visit
    try { localStorage.setItem('ngw_lab_tab_order', JSON.stringify(next)); } catch {}
    // Persist to server so it syncs across devices when logged in (fire-and-forget)
    if (user) {
      savePreference('lab_tab_order', next).catch(() => {});
    }
    setDragSrc(null);
  }
  function handleDragEnd() { setDragSrc(null); }

  return (
    <div className="screen lab-screen">
      <h2 className="screen-heading">NGW Lab</h2>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)', textAlign: 'center', marginBottom: 'var(--space-md)' }}>
        Internal development tools
      </p>

      {/* ── Tab Bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-xs)' }}>
        <div className="lab-tabs" style={{ flex: 1, marginBottom: 0 }}>
          {tabs.flatMap((tab, idx) => {
            const metric     = tab.metricKey ? tabMetrics[tab.metricKey] : null;
            const hasError   = metric?.color === 'red';
            const isDragging = dragSrc === tab.id;
            const prevGroup  = idx > 0 ? tabs[idx - 1].group : null;
            const showDivider = tab.group && prevGroup && tab.group !== prevGroup;
            const elems = [];
            if (showDivider) {
              elems.push(
                <span
                  key={`div-${tab.id}`}
                  aria-hidden="true"
                  style={{
                    display: 'inline-flex', alignSelf: 'center',
                    width: 1, height: 20,
                    background: 'var(--color-border)',
                    margin: '0 4px', flexShrink: 0,
                  }}
                />
              );
            }
            elems.push(
              <button
                key={tab.id}
                className={`lab-tab${activeTab === tab.id ? ' lab-tab--active' : ''}${isDragging ? ' lab-tab--dragging' : ''}`}
                onClick={() => handleTabSwitch(tab.id)}
                draggable
                onDragStart={e => handleDragStart(e, tab.id)}
                onDragOver={e => handleDragOver(e, tab.id)}
                onDrop={e => handleDrop(e, tab.id)}
                onDragEnd={handleDragEnd}
                style={{ position: 'relative', cursor: isDragging ? 'grabbing' : 'grab' }}
                title={tab.group ? `${tab.group}: ${tab.label}` : tab.label}
              >
                {hasError && activeTab !== tab.id && (
                  <span style={{
                    position: 'absolute', top: 3, right: 3,
                    width: 6, height: 6, borderRadius: '50%',
                    background: C.red,
                    boxShadow: '0 0 5px #f8717199',
                  }} />
                )}
                {tab.label}
                {metric && (
                  <span className={`lab-tab__metric lab-tab__metric--${metric.color}`}>
                    {metric.value}
                    {tab.metricLabel && (
                      <span className="lab-tab__metric-info" title={`${tab.metricLabel}: ${metric.value}`}>ⓘ</span>
                    )}
                  </span>
                )}
              </button>
            );
            return elems;
          })}
        </div>
        {/* Reset order — only shown when a custom order is active */}
        {tabOrder && (
          <button
            className="lab-tab"
            onClick={() => {
              setTabOrder(null);
              try { localStorage.removeItem('ngw_lab_tab_order'); } catch {}
              if (user) savePreference('lab_tab_order', null).catch(() => {});
            }}
            title="Reset tab order to default"
            aria-label="Reset tab order"
            style={{ flexShrink: 0, marginTop: 'var(--space-sm)', marginBottom: 0, opacity: 0.7 }}
          >↺</button>
        )}
        <button
          className={`lab-tab${showHelp ? ' lab-tab--active' : ''}`}
          onClick={() => setShowHelp(v => !v)}
          title="Toggle tab help"
          aria-label="Toggle help"
          style={{ flexShrink: 0, fontWeight: 600, marginTop: 'var(--space-sm)', marginBottom: 0 }}
        >?</button>
      </div>

      {/* ── Help Panel ── */}
      {showHelp && (
        <LabHelpPanel tabId={activeTab} onClose={() => setShowHelp(false)} />
      )}

      {/* ── Tab Content ──
           Lazy-mount strategy: a tab is mounted only on first visit, then kept alive.
           - Initial load fires only the active tab's API calls (not all 8 at once)
           - Subsequent visits to an already-mounted tab are instant (no re-fetch, no flash)
           - Workbench result is preserved when checking Signals and back
      ── */}
      <div className="lab-content">
        {mountedTabs.has('workbench') && (
          <div style={{ display: activeTab === 'workbench' ? 'block' : 'none' }}>
            <WorkbenchTab
              onSaveToGoldSet={handleSaveToGoldSet}
              onProposeRule={handleProposeRule}
              pendingImage={labPendingImage}
              onPendingConsumed={() => dispatch({ type: 'CLEAR_LAB_PENDING_IMAGE' })}
              onWorkbenchChange={setWorkbenchSnapshot}
              onNavigateTo={handleNavigateTo}
            />
          </div>
        )}
        {mountedTabs.has('gold_set') && (
          <div style={{ display: activeTab === 'gold_set' ? 'block' : 'none' }}>
            <GoldSetTab
              prefill={goldSetPrefill}
              onPrefillConsumed={() => setGoldSetPrefill(null)}
            />
          </div>
        )}
        {mountedTabs.has('candidates') && (
          <div style={{ display: activeTab === 'candidates' ? 'block' : 'none' }}>
            <CandidatesTab
              prefill={candidatePrefill}
              onPrefillConsumed={() => setCandidatePrefill(null)}
            />
          </div>
        )}
        {mountedTabs.has('ref_dataset') && (
          <div style={{ display: activeTab === 'ref_dataset' ? 'block' : 'none' }}>
            <ReferenceDatasetTab />
          </div>
        )}
        {mountedTabs.has('signals') && (
          <div style={{ display: activeTab === 'signals' ? 'block' : 'none' }}>
            <SignalsTab />
          </div>
        )}
        {mountedTabs.has('learning') && (
          <div style={{ display: activeTab === 'learning' ? 'block' : 'none' }}>
            <LearningOpsTab navRequest={learningNavRequest} onNavConsumed={() => setLearningNavRequest(null)} />
          </div>
        )}
        {mountedTabs.has('benchmarks') && (
          <div style={{ display: activeTab === 'benchmarks' ? 'block' : 'none' }}>
            <BenchmarkTab onNavigateTo={handleNavigateTo} />
          </div>
        )}
        {mountedTabs.has('control_center') && (
          <div style={{ display: activeTab === 'control_center' ? 'block' : 'none' }}>
            <ControlCenterTab user={user} onNavigateTo={handleNavigateTo} />
          </div>
        )}
        {mountedTabs.has('user') && (
          <div style={{ display: activeTab === 'user' ? 'block' : 'none' }}>
            <UserTab />
          </div>
        )}
      </div>

      {/* Back */}
      <div style={{ padding: 'var(--space-md) 0', paddingBottom: 'calc(var(--space-xl) + env(safe-area-inset-bottom, 0px))' }}>
        <button
          className="btn btn--ghost"
          style={{ width: '100%' }}
          onClick={() => dispatch({ type: 'GO_BACK' })}
        >
          {'\u2190'} Back to Home
        </button>
      </div>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════
   JsonTree — collapsible JSON explorer
   ═══════════════════════════════════════════════════════════ */

const JsonTree_INDENT = 16; // px per level

function JsonNode({ k, value, depth, defaultOpen }) {
  const isObj = value !== null && typeof value === 'object';
  const isArr = Array.isArray(value);
  const childCount = isObj ? Object.keys(value).length : 0;
  const [open, setOpen] = useState(defaultOpen ?? depth < 2);

  const keyStyle = { color: 'var(--color-text-secondary)', userSelect: 'text' };
  const bracket = isArr ? ['[', `] (${childCount})`] : ['{', `} (${childCount})`];

  if (isObj && childCount === 0) {
    return (
      <div style={{ paddingLeft: depth * JsonTree_INDENT }}>
        {k !== null && <span style={keyStyle}>{k}: </span>}
        <span style={{ color: 'var(--color-text-secondary)' }}>{isArr ? '[]' : '{}'}</span>
      </div>
    );
  }

  if (isObj) {
    return (
      <div style={{ paddingLeft: depth * JsonTree_INDENT }}>
        <button
          onClick={() => setOpen(o => !o)}
          style={{ background: 'none', border: 'none', padding: '1px 0', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit', fontSize: 'inherit', color: 'inherit', width: '100%', textAlign: 'left' }}
        >
          <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', width: 10, flexShrink: 0 }}>{open ? '▾' : '▸'}</span>
          {k !== null && <span style={keyStyle}>{k}:&nbsp;</span>}
          <span style={{ color: 'var(--color-text-secondary)' }}>
            {open ? bracket[0] : `${bracket[0]}…${bracket[1]}`}
          </span>
        </button>
        {open && (
          <>
            {(isArr ? value : Object.entries(value)).map((item, i) => {
              const [ck, cv] = isArr ? [i, item] : item;
              return <JsonNode key={ck} k={ck} value={cv} depth={depth + 1} />;
            })}
            <div style={{ paddingLeft: 14, color: 'var(--color-text-secondary)' }}>{isArr ? ']' : '}'}</div>
          </>
        )}
      </div>
    );
  }

  // Primitive
  let valStyle;
  if (value === null || value === undefined)   valStyle = { color: 'var(--color-text-secondary)' };
  else if (typeof value === 'boolean')          valStyle = { color: C.amber };
  else if (typeof value === 'number')           valStyle = { color: '#60A5FA' };
  else                                          valStyle = { color: '#4ADE80' };

  const display = value === null ? 'null'
    : typeof value === 'string' ? `"${value}"`
    : String(value);

  return (
    <div style={{ paddingLeft: depth * JsonTree_INDENT, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {k !== null && <span style={keyStyle}>{k}:&nbsp;</span>}
      <span style={{ ...valStyle, wordBreak: 'break-all', userSelect: 'text' }}>{display}</span>
    </div>
  );
}

function JsonTree({ data, defaultOpen }) {
  return (
    <div style={{
      fontFamily: 'var(--font-mono, monospace)',
      fontSize: 'var(--text-xs)',
      lineHeight: 1.7,
      padding: 'var(--space-sm)',
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      overflow: 'auto',
    }}>
      <JsonNode k={null} value={data} depth={0} defaultOpen={defaultOpen} />
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════
   Workbench Tab — image upload + full pipeline analysis
   ═══════════════════════════════════════════════════════════ */

function WorkbenchTab({ onSaveToGoldSet, onProposeRule, pendingImage, onPendingConsumed, onWorkbenchChange, onNavigateTo }) {
  const fileRef = useRef(null);
  const [file,      setFile]      = useState(null);
  const [preview,   setPreview]   = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [result,    setResult]    = useState(null);
  const [error,     setError]     = useState(null);
  const [viewMode,       setViewMode]       = useState('formatted'); // 'formatted' | 'compare' | 'json' | 'overlay'
  const [vlmDirty,       setVlmDirty]       = useState(false);       // true after any VLM accept
  const [debugMode,      setDebugMode]      = useState(false);        // generate debug overlay
  const [dragging,       setDragging]       = useState(false);
  const [overlayZoomed,  setOverlayZoomed]  = useState(false);        // fullscreen overlay lightbox

  // Revoke object URL when preview changes or component unmounts
  useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview); };
  }, [preview]);

  // Consume a pending image forwarded from "Open in Lab" on ReferenceEvalScreen
  useEffect(() => {
    if (!pendingImage) return;
    onPendingConsumed?.();
    if (pendingImage.file) {
      // Real File object — load directly
      applyFile(pendingImage.file);
    } else if (pendingImage.preview) {
      // URL-only (demo or Unsplash preview) — fetch as blob, create a File
      fetch(pendingImage.preview)
        .then(r => r.blob())
        .then(blob => {
          const ext  = blob.type.includes('png') ? 'png' : 'jpg';
          const name = pendingImage.serverPath
            ? pendingImage.serverPath.split('/').pop()
            : `reference.${ext}`;
          applyFile(new File([blob], name, { type: blob.type || 'image/jpeg' }));
        })
        .catch(() => {
          // Network blocked — at minimum show the preview URL so user sees the image
          setPreview(pendingImage.preview);
        });
    }
  }, [pendingImage]); // eslint-disable-line react-hooks/exhaustive-deps

  function applyFile(f) {
    if (!f) return;
    setFile(f);
    const url = URL.createObjectURL(f);
    setPreview(url);
    setResult(null);
    setError(null);
    setVlmDirty(false);
    onWorkbenchChange?.({ file: f, preview: url, imagePath: null, result: null });
  }

  function handleFileInput(e) {
    applyFile(e.target.files?.[0]);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f && f.type.startsWith('image/')) applyFile(f);
  }

  // Paste support — pick up clipboard images
  useEffect(() => {
    function onPaste(e) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          applyFile(item.getAsFile());
          break;
        }
      }
    }
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAnalyze() {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const data = await analyzeImage(file, { debug: debugMode });
      setResult(data);
      onWorkbenchChange?.({ file, preview, imagePath: data.image_path || null, result: data });
    } catch (err) {
      setError(err.message || 'Analysis failed');
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setFile(null);
    setPreview(null); // triggers useEffect revoke
    setResult(null);
    setError(null);
    setVlmDirty(false);
    if (fileRef.current) fileRef.current.value = '';
    onWorkbenchChange?.(null);
  }

  // No file selected — upload prompt (supports click + drag-and-drop)
  if (!file) {
    return (
      <div
        className={`lab-content__placeholder${dragging ? ' lab-content__placeholder--dragging' : ''}`}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5, marginBottom: 'var(--space-md)' }}>
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <h3>Analysis Workbench</h3>
        <p>{dragging ? 'Drop to analyze' : 'Drop, paste, or click to select an image.'}</p>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)', marginTop: 'var(--space-xs)' }}>
          JPEG · PNG · WebP · HEIC · up to 10 MB · best results when the face fills the frame
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={handleFileInput}
          style={{ display: 'none' }}
        />
        <button
          className="btn btn--primary"
          onClick={() => fileRef.current?.click()}
          style={{ marginTop: 'var(--space-md)' }}
        >
          Select Image
        </button>
      </div>
    );
  }

  return (
    <div className="lab-workbench">
      {/* Image preview */}
      {preview && (
        <div className="lab-workbench__preview">
          <div className={`lab-workbench__img-shell${loading ? ' lab-workbench__img-shell--analyzing' : ''}`}>
            <ZoomImg src={preview} alt="Selected for analysis" />
            {loading && (
              <div className="ref-scan-overlay">
                <div className="ref-scan-overlay__line" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* File info + actions */}
      <div className="lab-workbench__actions">
        <span className="lab-workbench__filename">{file.name}</span>
        <div style={{ display: 'flex', gap: 'var(--space-xs)', alignItems: 'center' }}>
          {!loading && (
            <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={debugMode} onChange={e => setDebugMode(e.target.checked)} />
              Debug Overlay
            </label>
          )}
          {!loading && !result && (
            <button className="btn btn--primary btn--sm" onClick={handleAnalyze}>
              Analyze
            </button>
          )}
          {!loading && result && (
            <button className="btn btn--sm btn--ghost" onClick={handleAnalyze} title="Re-run analysis with current settings">
              ↻ Re-analyze
            </button>
          )}
          <button className="btn btn--ghost btn--sm" onClick={handleReset} disabled={loading}>
            {result ? 'New Image' : 'Clear'}
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading && <WorkbenchScanStatus />}

      {/* Error */}
      {error && (
        <div className="lab-workbench__error">
          <p>{error}</p>
        </div>
      )}

      {/* Results */}
      {result && !loading && (
        <div className="lab-workbench__results">
          {/* View toggle */}
          <div className="lab-view-toggle">
            <button
              className={`lab-tab${viewMode === 'formatted' ? ' lab-tab--active' : ''}`}
              onClick={() => setViewMode('formatted')}
            >
              Formatted
            </button>
            {result.vlm ? (
              <button
                className={`lab-tab${viewMode === 'compare' ? ' lab-tab--active' : ''}`}
                onClick={() => setViewMode('compare')}
              >
                VLM vs CV
              </button>
            ) : (
              <button
                className="lab-tab lab-tab--disabled"
                disabled
                title={
                  result.vlm_available === false
                    ? 'VLM not configured — set OPENAI_API_KEY or ANTHROPIC_API_KEY in .env'
                    : result.vlm_error
                    ? `VLM error: ${result.vlm_error}`
                    : 'VLM analysis did not return data for this image'
                }
              >
                VLM vs CV
              </button>
            )}
            <button
              className={`lab-tab${viewMode === 'json' ? ' lab-tab--active' : ''}`}
              onClick={() => setViewMode('json')}
            >
              Raw JSON
            </button>
            <button
              className={`lab-tab${viewMode === 'signals' ? ' lab-tab--active' : ''}`}
              onClick={() => setViewMode('signals')}
            >
              Signal Diagnostics
            </button>
            {result.debug_overlay_url && (
              <button
                className={`lab-tab${viewMode === 'overlay' ? ' lab-tab--active' : ''}`}
                onClick={() => setViewMode('overlay')}
              >
                Debug Overlay
              </button>
            )}
          </div>

          {/* VLM error banner — shown when VLM was available but call failed */}
          {!result.vlm && result.vlm_available !== false && result.vlm_error && (
            <div style={{
              margin: '0 0 var(--space-sm)',
              padding: '8px 12px',
              background: 'color-mix(in srgb, var(--color-amber) 12%, transparent)',
              border: '1px solid color-mix(in srgb, var(--color-amber) 30%, transparent)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 'var(--text-xs)',
              color: 'var(--color-amber)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 6,
            }}>
              <span style={{ flexShrink: 0 }}>⚠</span>
              <span>
                <strong>VLM analysis failed</strong> — CV-only results shown.{' '}
                <code style={{ fontSize: '0.9em', opacity: 0.85 }}>{result.vlm_error}</code>
              </span>
            </div>
          )}

          {/* Color legend — only on the overlay tab */}
          {viewMode === 'overlay' && result.debug_overlay_url && (
            <div className="lab-overlay-legend">
              {[
                { color: '#0064ff', label: 'Shadow direction' },
                { color: '#00ff00', label: 'Catchlights' },
                { color: '#ffff00', label: 'Highlights' },
                { color: '#ffa500', label: 'Shoulder / pose axis' },
                { color: '#800080', label: 'Hip axis' },
                { color: '#80ff00', label: 'Corrected key light' },
                { color: '#ff0000', label: 'Self-shadow (tint)' },
                { color: '#3296c8', label: 'Surface classes' },
                { color: '#96c832', label: 'Light roles' },
              ].map(({ color, label }) => (
                <span key={label} className="lab-overlay-legend__item">
                  <span className="lab-overlay-legend__swatch" style={{ background: color }} />
                  {label}
                </span>
              ))}
            </div>
          )}

          {viewMode === 'overlay' && result.debug_overlay_url ? (
            <div className="lab-workbench__overlay">
              <div className="lab-overlay-hint">
                Original above · <span className="lab-overlay-zoom-hint">click overlay to zoom</span>
              </div>
              <img
                src={result.debug_overlay_url}
                alt="Debug overlay"
                className="lab-overlay-img lab-overlay-img--clickable"
                onClick={() => setOverlayZoomed(true)}
              />
              {/* Zoomable lightbox */}
              {overlayZoomed && (
                <ZoomableLightbox onClose={() => setOverlayZoomed(false)}>
                  <img
                    src={result.debug_overlay_url}
                    alt="Debug overlay (fullscreen)"
                    style={{ maxWidth: '95vw', maxHeight: '90dvh', width: 'auto', height: 'auto', display: 'block', objectFit: 'contain', userSelect: 'none' }}
                    draggable={false}
                  />
                </ZoomableLightbox>
              )}

              {/* ── Solver values legend ── */}
              <OverlaySolverLegend result={result} />

              {/* ── Warnings / edge-case flags ── */}
              <OverlayWarnings result={result} />
            </div>
          ) : viewMode === 'json' ? (
            <JsonTree data={result} defaultOpen={1} />
          ) : viewMode === 'compare' ? (
            <VlmCvCompare data={result} onAccept={(updated) => { setResult(updated); setVlmDirty(true); }} />
          ) : viewMode === 'signals' ? (
            <SignalDiagnosticsPanel
              data={result}
              onPropose={(prefill) => onProposeRule(result, prefill)}
            />
          ) : (
            <WorkbenchFormatted data={result} />
          )}

          {/* Post-analysis actions */}
          <div className="lab-workbench__post-actions">
            <button
              className={`btn btn--sm ${vlmDirty ? 'btn--success' : 'btn--primary'}`}
              onClick={() => onSaveToGoldSet(result)}
            >
              {vlmDirty ? '\u2714 Commit to Gold Set' : 'Save to Gold Set'}
            </button>
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => onProposeRule(result)}
            >
              Propose Rule
            </button>
            {(() => {
              const patternSlug = result?.reference_analysis?.lighting_read?.shadow_pattern
                || result?.cv?.lighting_read?.shadow_pattern;
              if (!patternSlug || patternSlug === 'unknown' || !onNavigateTo) return null;
              return (
                <button
                  className="btn btn--ghost btn--sm"
                  onClick={() => onNavigateTo({ tab: 'learning', panel: 'knowledge', patternId: patternSlug })}
                  title={`Open KB entry for "${patternSlug}"`}
                >
                  📖 Pattern KB
                </button>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Solver values legend (shown under overlay image) ─────────────────────

const SOLVER_VALUE_GLOSSARY = [
  {
    key: 'key_light_angle_deg_pose_corrected',
    label: 'Key light angle (corrected)',
    explain: 'Compass direction the main light comes FROM, after adjusting for how the subject is turned. 0° = directly above, 90° = from camera-right, 180° = from below.',
  },
  {
    key: 'key_light_angle_deg_raw',
    label: 'Key light angle (raw)',
    explain: 'Same angle without pose correction. Compare with corrected to see how much the subject\'s pose skewed the apparent shadow direction.',
  },
  {
    key: 'key_light_height',
    label: 'Key light height',
    explain: '"raised" = light above eye level creating downward shadows (most common). "neutral" = at eye level. "low" = below eye level (horror look).',
  },
  {
    key: 'modifier_size_class',
    label: 'Modifier size (corrected)',
    explain: 'Estimated softbox/modifier size after pose adjustment: "small" = hard/specular (bare bulb, small reflector), "medium" = beauty dish / mid-size softbox, "large" = large softbox / natural window.',
  },
  {
    key: 'modifier_certainty',
    label: 'Modifier certainty',
    explain: '"high" = clear shadow-edge falloff, strong signal. "medium" = some ambiguity. "low" = inconclusive (often due to pose angle, reflective surfaces, or blown highlights).',
  },
  {
    key: 'pose_complexity_score',
    label: 'Pose complexity',
    explain: '0–1 scale. Low (<0.2) = subject facing camera, shoulders level, minimal correction needed. High (>0.6) = strong rotation, tilts, or occlusions — angle estimates are less reliable.',
  },
  {
    key: 'likely_light_count',
    label: 'Likely light count',
    explain: 'Estimated number of distinct light sources in the scene. 1 = single key only. 2 = key + fill or rim. 3+ = multi-light setup. May under-count when lights are similar in quality/direction.',
  },
];

function OverlaySolverLegend({ result }) {
  const [open, setOpen] = useState(false);
  const recon = result?.reconstruction || result?.cv?.reconstruction || {};
  const entries = SOLVER_VALUE_GLOSSARY.filter(g => recon[g.key] != null);
  if (entries.length === 0) return null;

  return (
    <div className="lab-overlay-glossary">
      <button
        className="lab-overlay-glossary__toggle"
        onClick={() => setOpen(o => !o)}
        type="button"
      >
        <span>{open ? '▼' : '▶'}</span>
        <span>Solver values explained</span>
      </button>
      {open && (
        <div className="lab-overlay-glossary__body">
          {entries.map(g => (
            <div key={g.key} className="lab-overlay-glossary__row">
              <div className="lab-overlay-glossary__head">
                <code className="lab-overlay-glossary__key">{g.key}</code>
                <span className="lab-overlay-glossary__val">
                  {String(recon[g.key])}
                </span>
              </div>
              <p className="lab-overlay-glossary__desc">{g.explain}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Warnings / edge-case flags ────────────────────────────────────────────

const EDGE_CASE_EXPLAIN = {
  blown_highlights:         'Clipped highlights — bright areas have lost detail. Catchlight shape and shadow edge signals are less reliable.',
  mixed_color_temperature:  'Mixed color temps detected — likely two different light sources (e.g. daylight window + tungsten). Lighting-family classification may be ambiguous.',
  outdoor_foliage_shadows:  'Dappled leaf shadows detected — the irregular pattern can confuse the shadow-vector direction. Take the angle reading with caution.',
  window_light_gradient:    'Window-light gradient — broad soft gradient from a large window. Modifier size is harder to estimate; expect "large" with lower certainty.',
  extreme_low_key:          'Extremely dark scene — most signal extractors have less to work with. Confidence scores across the board are reduced.',
  bw_processing:            'Black & white image — color temperature, color-graded warmth, and color-cast signals are unavailable.',
  no_face:                  'No face detected — all face-dependent signals (catchlight position, shadow direction relative to face, eye specular) are missing.',
};

function OverlayWarnings({ result }) {
  const flags = result?.edge_case_flags || result?.cv?.edge_case_flags || {};
  const activeFlags = Object.entries(EDGE_CASE_EXPLAIN).filter(([k]) => flags[k] === true);
  if (activeFlags.length === 0) return null;

  return (
    <div className="lab-overlay-warnings">
      <div className="lab-overlay-warnings__title">
        ⚠ {activeFlags.length} signal warning{activeFlags.length > 1 ? 's' : ''}
      </div>
      {activeFlags.map(([key, explain]) => (
        <div key={key} className="lab-overlay-warnings__item">
          <code className="lab-overlay-warnings__flag">{key.replace(/_/g, ' ')}</code>
          <span className="lab-overlay-warnings__text">{explain}</span>
        </div>
      ))}
    </div>
  );
}

/** Formatted view of workbench analysis result */
// ── Signal Diagnostics Panel ────────────────────────────────────────────────
// Shows catchlight clock positions, key signal values, and gate decisions
// for every analysis run — makes it easy to diagnose misclassifications.
// When the user flags a parameter as wrong and enters the correct value,
// it auto-generates a pre-filled rule candidate of the appropriate type.

// Derive a rule candidate prefill from a flagged parameter correction.
function _buildRulePrefill(param, detectedValue, correctValue, note, data) {
  const diag = data?.signal_diagnostics || {};
  const signals = diag.signals || {};
  const catchlights = diag.catchlights || [];
  const lightInf = data?.lighting_inference || {};
  const lra = signals.left_right_asymmetry ?? null;
  const sd = signals.shadow_density ?? null;
  const ti = signals.triangle_isolation ?? null;
  const detectedPattern = lightInf.pattern || '';
  const hasHardCatchlight = catchlights.some(
    c => c.quad === 'hard_left' || c.quad === 'hard_right'
  );
  const signalSummary = Object.entries(signals)
    .filter(([, v]) => v != null && v !== 0)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');
  const clSummary = catchlights
    .map(c => `${c.eye} ${c.position} (${c.quad})`)
    .join('; ') || 'none';

  // ── Pattern is wrong ────────────────────────────────────────────────────
  if (param === 'pattern') {
    const detected = String(detectedValue);
    const correct = String(correctValue).trim();

    // Split false-positive from jewellery / reflective surface
    if (detected === 'split' && hasHardCatchlight && lra != null && lra < 0.20) {
      return {
        title: `[split] Jewellery false-positive — lr_asymmetry=${lra} contradicts 90° key`,
        description:
          `System returned split (90° key) because a catchlight landed at 3 or 9 o'clock, ` +
          `but left_right_asymmetry=${lra} shows the face is nearly evenly lit. ` +
          `Correct pattern is ${correct || 'loop'}. Catchlight is from jewellery or a ` +
          `reflective surface, not the key light.`,
        rationale:
          `Observed: lr_asymmetry=${lra} (<0.12 threshold). Hard catchlight at 3/9 o'clock ` +
          `(${clSummary}). Real split lighting produces asymmetry 0.25–0.45.` +
          (note ? ` — ${note}` : ''),
        proposed_change: {
          type: 'signal_override',
          signal: 'lr_asymmetry',
          condition: '< 0.12',
          overrides: ['split'],
          confidence_penalty: 1.0,
          notes:
            `Jewellery/reflective-surface false positive. Catchlight at hard position ` +
            `when face asymmetry < 0.12 → demote split to ${correct || 'loop'}.`,
        },
      };
    }

    // Generic pattern confusion
    return {
      title: `[${detected}/${correct || '?'}] Pattern confusion — detected ${detected}, should be ${correct || '?'}`,
      description:
        `System classified as ${detected} but the correct pattern is ${correct || '(see rationale)'}. ` +
        (note || 'Signals do not clearly separate these two patterns.'),
      rationale:
        `Observed signals: ${signalSummary || 'n/a'}. Catchlights: ${clSummary}.` +
        (note ? ` — ${note}` : ''),
      proposed_change: {
        type: 'pattern_confusion',
        pattern_a: correct || '',
        pattern_b: detected,
        confusion_rate: 0.5,
        action: 'review_classifier_boundaries',
        key_signals: signalSummary,
        notes: note || '',
      },
    };
  }

  // ── Key position is wrong ───────────────────────────────────────────────
  if (param === 'key_position') {
    const detected = String(detectedValue);
    const correct = String(correctValue).trim();
    // 90° position driven by split — same jewellery gate logic
    if (detected === '90' && hasHardCatchlight && lra != null && lra < 0.20) {
      return {
        title: `[split] Key position 90° wrong — lr_asymmetry=${lra} contradicts side key`,
        description:
          `Key position reported as 90° but the face is evenly lit (lr_asymmetry=${lra}). ` +
          `Correct position should be ${correct || '30-45 off-axis'}. ` +
          `Catchlight at 3/9 o'clock is from jewellery, not the key.`,
        rationale:
          `Signals: ${signalSummary || 'n/a'}. Catchlights: ${clSummary}.` +
          (note ? ` — ${note}` : ''),
        proposed_change: {
          type: 'signal_override',
          signal: 'lr_asymmetry',
          condition: '< 0.12',
          overrides: ['split'],
          confidence_penalty: 1.0,
          notes: note || '',
        },
      };
    }
    return {
      title: `[${detectedPattern}] Key position incorrect — detected ${detected}, should be ${correct || '?'}`,
      description:
        `Key position was reported as ${detected} but should be ${correct || '(see rationale)'}. ` +
        (note || ''),
      rationale:
        `Signals: ${signalSummary || 'n/a'}. Catchlights: ${clSummary}.` +
        (note ? ` — ${note}` : ''),
      proposed_change: {
        type: 'blueprint_correction',
        pattern_id: detectedPattern,
        action: 'review_detection_threshold',
        current_cvr: lightInf.pattern_confidence ?? null,
        notes: `Key position: detected=${detected}, expected=${correct}. ${note || ''}`,
      },
    };
  }

  // ── Confidence is wrong ─────────────────────────────────────────────────
  if (param === 'confidence') {
    const detected = Number(detectedValue);
    const correct = parseFloat(correctValue) || 0;
    const tooHigh = detected > correct;
    return {
      title: `[${detectedPattern}] Confidence ${tooHigh ? 'too high' : 'too low'} — ${(detected * 100).toFixed(0)}%, should be ~${(correct * 100).toFixed(0)}%`,
      description:
        `Confidence of ${(detected * 100).toFixed(0)}% does not reflect actual pattern reliability ` +
        `for this case. Correct confidence should be ~${(correct * 100).toFixed(0)}%.`,
      rationale:
        `Signals: ${signalSummary || 'n/a'}.` + (note ? ` — ${note}` : ''),
      proposed_change: {
        type: 'confidence_recalibration',
        pattern_id: detectedPattern,
        action: 'reduce_confidence_floor',
        current_cvr: detected,
        fleet_mean_cvr: correct,
        notes: note || '',
      },
    };
  }

  // ── Modifier / light count / other ──────────────────────────────────────
  return {
    title: `[${detectedPattern}] ${param} incorrect — detected "${detectedValue}", should be "${correctValue}"`,
    description:
      `${param} was detected as "${detectedValue}" but should be "${correctValue}". ` +
      (note || ''),
    rationale: `Signals: ${signalSummary || 'n/a'}. Catchlights: ${clSummary}.` + (note ? ` — ${note}` : ''),
    proposed_change: {
      type: 'needs_investigation',
      pattern_id: detectedPattern,
      reason: `${param}: detected="${detectedValue}", expected="${correctValue}". ${note || ''}`,
    },
  };
}

function SignalDiagnosticsPanel({ data, onPropose }) {
  const diag = data?.signal_diagnostics || {};
  const catchlights = diag.catchlights || [];
  const signals = diag.signals || {};
  const gates = diag.gates || [];
  const finalPattern = diag.final_pattern || data?.lighting_inference?.pattern || '—';
  const lightInf = data?.lighting_inference || {};

  // Correction state — tracks which parameter the user has flagged as wrong
  const [correction, setCorrection] = useState({ param: null, correctValue: '', note: '' });
  const isFlagging = correction.param !== null;

  const C = {
    green: '#4ade80', amber: '#FBBF24', red: '#f87171',
    blue: '#60a5fa', muted: 'var(--color-text-dim)',
    border: 'var(--color-border)', surface: 'var(--color-surface)',
    text: 'var(--color-text)', textSec: 'var(--color-text-secondary)',
  };

  const _th = {
    padding: '4px 10px', fontSize: 11, fontWeight: 700,
    color: C.textSec, textAlign: 'left', borderBottom: `1px solid ${C.border}`,
    background: 'var(--color-surface-raised, #1e293b)',
  };
  const _td = {
    padding: '4px 10px', fontSize: 12, color: C.text,
    borderBottom: `1px solid ${C.border}`,
  };

  // Map quad to a human direction
  const quadLabel = { upper_left: '↖ upper-left', upper_right: '↗ upper-right',
    top_center: '↑ top-center', hard_left: '← hard left (9 o\'clock)',
    hard_right: '→ hard right (3 o\'clock)', lower: '↓ lower' };

  // Colour a signal value against a threshold
  function sigColor(val, threshLow, threshHigh) {
    if (typeof val !== 'number') return C.muted;
    if (val < threshLow) return C.amber;
    if (threshHigh && val > threshHigh) return C.red;
    return C.green;
  }

  const section = (title, children) => (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '0.07em', color: C.textSec, marginBottom: 8 }}>
        {title}
      </div>
      {children}
    </div>
  );

  return (
    <div style={{ padding: '16px 4px', display: 'grid', gap: 20 }}>

      {/* ── Pattern Decision ── */}
      {section('Pattern Decision — flag any value that is wrong', (() => {
        // Parameters the user can flag as incorrect
        const params = [
          { id: 'pattern',      label: 'Final Pattern',  val: finalPattern,
            inputType: 'pattern' },
          { id: 'key_position', label: 'Key Position',   val: lightInf.key_position_text || '—',
            inputType: 'text' },
          { id: 'confidence',   label: 'Confidence',
            val: lightInf.pattern_confidence != null
              ? lightInf.pattern_confidence : null,
            display: lightInf.pattern_confidence != null
              ? `${(lightInf.pattern_confidence * 100).toFixed(0)}%` : '—',
            inputType: 'number' },
          { id: 'modifier',     label: 'Modifier',       val: lightInf.modifier_family || '—',
            inputType: 'text' },
          { id: 'light_count',  label: 'Light Count',    val: lightInf.light_count ?? '—',
            inputType: 'number' },
        ];
        return (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              {params.map(({ id, label, val, display }) => {
                const isFlagged = correction.param === id;
                return (
                  <div key={id} style={{
                    background: isFlagged ? '#7c2d1220' : C.surface,
                    border: `1px solid ${isFlagged ? C.amber : C.border}`,
                    borderRadius: 6, padding: '8px 12px', minWidth: 90,
                  }}>
                    <div style={{ fontSize: 10, color: C.textSec, marginBottom: 3 }}>{label}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: isFlagged ? C.amber : C.text }}>
                      {String(display ?? val)}
                    </div>
                    <button
                      type="button"
                      style={{
                        marginTop: 6, fontSize: 10, padding: '2px 6px',
                        background: 'transparent', border: `1px solid ${isFlagged ? C.amber : C.border}`,
                        borderRadius: 4, color: isFlagged ? C.amber : C.textSec, cursor: 'pointer',
                      }}
                      onClick={() => setCorrection(
                        isFlagged
                          ? { param: null, correctValue: '', note: '' }
                          : { param: id, detectedValue: val, correctValue: '', note: '' }
                      )}
                    >
                      {isFlagged ? '✕ cancel' : '⚑ flag as wrong'}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* ── Correction form — shown when a parameter is flagged ── */}
            {isFlagging && (() => {
              const flaggedParam = params.find(p => p.id === correction.param);
              return (
                <div style={{
                  background: '#7c2d1210',
                  border: `1px solid ${C.amber}`, borderRadius: 8, padding: '14px 16px',
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.amber, marginBottom: 10 }}>
                    ⚑ Correcting: <strong>{flaggedParam?.label}</strong>
                    &nbsp;·&nbsp;
                    <span style={{ fontWeight: 400, color: C.textSec }}>
                      Detected: <code style={{ fontFamily: 'var(--font-mono)' }}>
                        {String(correction.detectedValue)}
                      </code>
                    </span>
                  </div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    <label style={{ fontSize: 11, color: C.textSec }}>
                      Correct value should be:
                      {flaggedParam?.inputType === 'pattern' ? (
                        <select
                          value={correction.correctValue}
                          onChange={e => setCorrection(p => ({ ...p, correctValue: e.target.value }))}
                          style={{
                            display: 'block', marginTop: 4, width: '100%',
                            background: 'var(--color-surface)', border: `1px solid ${C.border}`,
                            borderRadius: 4, padding: '4px 8px', fontSize: 12,
                            color: 'var(--color-text)',
                          }}
                        >
                          <option value="">— select correct pattern —</option>
                          {_PC_PATTERNS.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      ) : (
                        <input
                          type={flaggedParam?.inputType === 'number' ? 'number' : 'text'}
                          step={flaggedParam?.inputType === 'number' ? 0.01 : undefined}
                          min={flaggedParam?.inputType === 'number' ? 0 : undefined}
                          max={flaggedParam?.inputType === 'number' ? 1 : undefined}
                          value={correction.correctValue}
                          onChange={e => setCorrection(p => ({ ...p, correctValue: e.target.value }))}
                          placeholder={flaggedParam?.inputType === 'number' ? '0.00–1.00' : 'enter correct value'}
                          style={{
                            display: 'block', marginTop: 4, width: '100%',
                            background: 'var(--color-surface)', border: `1px solid ${C.border}`,
                            borderRadius: 4, padding: '4px 8px', fontSize: 12,
                            color: 'var(--color-text)', boxSizing: 'border-box',
                          }}
                        />
                      )}
                    </label>
                    <label style={{ fontSize: 11, color: C.textSec }}>
                      Why is this wrong? (optional)
                      <input
                        type="text"
                        value={correction.note}
                        onChange={e => setCorrection(p => ({ ...p, note: e.target.value }))}
                        placeholder="e.g. large hoop earrings at 3 o'clock triggering side-key detection"
                        style={{
                          display: 'block', marginTop: 4, width: '100%',
                          background: 'var(--color-surface)', border: `1px solid ${C.border}`,
                          borderRadius: 4, padding: '4px 8px', fontSize: 12,
                          color: 'var(--color-text)', boxSizing: 'border-box',
                        }}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={!correction.correctValue}
                      onClick={() => {
                        const prefill = _buildRulePrefill(
                          correction.param,
                          correction.detectedValue,
                          correction.correctValue,
                          correction.note,
                          data,
                        );
                        setCorrection({ param: null, correctValue: '', note: '' });
                        onPropose && onPropose(prefill);
                      }}
                      style={{
                        marginTop: 4, padding: '6px 14px', fontSize: 12, fontWeight: 700,
                        background: correction.correctValue ? C.amber : 'transparent',
                        color: correction.correctValue ? '#000' : C.muted,
                        border: `1px solid ${correction.correctValue ? C.amber : C.border}`,
                        borderRadius: 6, cursor: correction.correctValue ? 'pointer' : 'default',
                        transition: 'all 0.15s',
                      }}
                    >
                      Generate Rule →
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        );
      })())}

      {/* ── Catchlight Clock Positions ── */}
      {section(`Catchlights (${catchlights.length} detected)`, (
        catchlights.length === 0
          ? <p style={{ fontSize: 12, color: C.muted }}>No catchlights detected.</p>
          : (
            <table style={{ width: '100%', borderCollapse: 'collapse',
              border: `1px solid ${C.border}`, borderRadius: 4, overflow: 'hidden' }}>
              <thead>
                <tr>
                  {['Eye', 'Position', 'Hour', 'Quad → Direction', 'Shape', 'Size'].map(h => (
                    <th key={h} style={_th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {catchlights.map((cl, i) => {
                  const isProblematic = cl.quad === 'hard_left' || cl.quad === 'hard_right';
                  return (
                    <tr key={i} style={{ background: isProblematic ? '#7c2d1220' : 'transparent' }}>
                      <td style={_td}>{cl.eye || '—'}</td>
                      <td style={{ ..._td, fontFamily: 'var(--font-mono)', fontWeight: 700,
                        color: isProblematic ? C.amber : C.text }}>
                        {cl.position || '—'}
                      </td>
                      <td style={{ ..._td, fontFamily: 'var(--font-mono)' }}>{cl.hour ?? '—'}</td>
                      <td style={{ ..._td, color: isProblematic ? C.amber : C.text }}>
                        {quadLabel[cl.quad] || cl.quad || '—'}
                        {isProblematic && (
                          <span style={{ fontSize: 10, color: C.amber, marginLeft: 6 }}>
                            ⚠ jewellery / reflection risk
                          </span>
                        )}
                      </td>
                      <td style={_td}>{cl.shape || '—'}</td>
                      <td style={_td}>{cl.size || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
      ))}

      {/* ── Key Signals ── */}
      {section('Key Signals', (
        <table style={{ width: '100%', borderCollapse: 'collapse',
          border: `1px solid ${C.border}` }}>
          <thead>
            <tr>
              {['Signal', 'Value', 'What it measures'].map(h => (
                <th key={h} style={_th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              ['left_right_asymmetry', signals.left_right_asymmetry,
                'Face shadow imbalance L vs R — <0.12 = near-flat lighting; >0.25 = clear side key',
                0.12, 0.8],
              ['shadow_density', signals.shadow_density,
                'Shadow pixel ratio in nose region — higher = harder/deeper shadows',
                0.05, 0.7],
              ['triangle_isolation', signals.triangle_isolation,
                'Rembrandt triangle contrast vs surround — >0.15 = genuine triangle',
                0.15, null],
              ['highlight_width_ratio', signals.highlight_width_ratio,
                'Fraction of face width in highlight — >0.5 = broad; <0.3 = short/narrow',
                0.1, null],
              ['nose_shadow_angle_deg', signals.nose_shadow_angle_deg,
                'Nose shadow direction 0–360° — indicates key light angle',
                null, null],
              ['nose_shadow_distance', signals.nose_shadow_distance,
                'Normalised nose shadow throw — 0=under nose, 1=far cheek',
                null, null],
            ].map(([key, val, desc, tLow, tHigh]) => (
              <tr key={key}>
                <td style={{ ..._td, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{key}</td>
                <td style={{ ..._td, fontFamily: 'var(--font-mono)',
                  color: tLow != null ? sigColor(val, tLow, tHigh) : C.text, fontWeight: 700 }}>
                  {val != null ? val : '—'}
                </td>
                <td style={{ ..._td, color: C.textSec, fontSize: 11 }}>{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ))}

      {/* ── Gate Decisions ── */}
      {section('Pattern Gates', (
        <div style={{ display: 'grid', gap: 8 }}>
          {gates.length === 0
            ? <p style={{ fontSize: 12, color: C.muted }}>No gate data available — re-analyse to see gates.</p>
            : gates.map((g, i) => (
              <div key={i} style={{
                background: C.surface, border: `1px solid ${g.triggered ? C.amber : C.border}`,
                borderRadius: 6, padding: '10px 14px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <span style={{ fontSize: 16 }}>{g.triggered ? '⚡' : '✓'}</span>
                  <span style={{ fontWeight: 700, fontSize: 12, fontFamily: 'var(--font-mono)',
                    color: g.triggered ? C.amber : C.green }}>
                    {g.name}
                  </span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700,
                    color: g.triggered ? C.amber : C.green }}>
                    {g.result}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: C.textSec, marginBottom: 6 }}>{g.description}</div>
                <div style={{ display: 'flex', gap: 16, fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                  <span style={{ color: C.textSec }}>value: <strong style={{ color: C.text }}>{String(g.value)}</strong></span>
                  <span style={{ color: C.textSec }}>threshold: <strong style={{ color: C.text }}>{String(g.threshold)}</strong></span>
                </div>
              </div>
            ))
          }
        </div>
      ))}

      {/* ── Inference Notes ── */}
      {lightInf.notes && lightInf.notes.length > 0 && section('Inference Notes', (
        <ul style={{ margin: 0, padding: '0 0 0 16px', display: 'grid', gap: 4 }}>
          {lightInf.notes.map((n, i) => (
            <li key={i} style={{ fontSize: 12, color: C.textSec }}>{n}</li>
          ))}
        </ul>
      ))}

      {diag.error && (
        <div style={{ fontSize: 11, color: C.red, fontFamily: 'var(--font-mono)' }}>
          Diagnostics error: {diag.error}
        </div>
      )}
    </div>
  );
}


function WorkbenchFormatted({ data }) {
  const desc = data.description || {};
  const analysis = data.reference_analysis || data.analysis || {};
  const imageRead = analysis.image_read || desc.referenceAnalysis?.image_read || {};
  const lightingRead = analysis.lighting_read || desc.referenceAnalysis?.lighting_read || {};
  const recreationSetup = analysis.recreation_setup || desc.referenceAnalysis?.recreation_setup || {};

  return (
    <div className="lab-formatted">
      {/* Description */}
      {desc.subject && (
        <div className="lab-section">
          <h4 className="lab-section__title">Description</h4>
          {typeof desc.subject === 'string' ? (
            <p className="lab-section__text">{desc.subject}</p>
          ) : (
            <div className="ref-analysis">
              {desc.subject.framing && <AnalysisRow label="Framing" value={desc.subject.framing} />}
              {desc.subject.pose && <AnalysisRow label="Pose" value={desc.subject.pose} />}
            </div>
          )}
        </div>
      )}

      {/* Narrative */}
      {imageRead.narrative && (
        <div className="lab-section">
          <h4 className="lab-section__title">Narrative</h4>
          <p className="lab-section__text">{imageRead.narrative}</p>
        </div>
      )}

      {/* Lighting */}
      {Object.keys(lightingRead).length > 0 && (
        <div className="lab-section">
          <h4 className="lab-section__title">Lighting</h4>
          <div className="ref-analysis">
            {lightingRead.lighting_family && lightingRead.lighting_family !== 'unknown' && (
              <AnalysisRow label="Family" value={lightingRead.lighting_family.replace(/[-_]/g, ' ')} />
            )}
            {lightingRead.source_quality && lightingRead.source_quality !== 'unknown' && (
              <AnalysisRow label="Quality" value={lightingRead.source_quality} capitalize />
            )}
            {lightingRead.source_direction && lightingRead.source_direction !== 'unknown' && (
              <AnalysisRow label="Direction" value={lightingRead.source_direction} />
            )}
            {lightingRead.shadow_pattern && lightingRead.shadow_pattern !== 'unknown' && (
              <AnalysisRow label="Shadow" value={lightingRead.shadow_pattern} capitalize />
            )}
            {lightingRead.fill_presence && lightingRead.fill_presence !== 'unknown' && (
              <AnalysisRow label="Fill" value={lightingRead.fill_presence} capitalize />
            )}
            {lightingRead.rim_presence && lightingRead.rim_presence !== 'unknown' && (
              <AnalysisRow label="Rim" value={lightingRead.rim_presence} capitalize />
            )}
            {typeof lightingRead.light_count === 'number' && lightingRead.light_count > 0 && (
              <AnalysisRow label="Lights" value={String(lightingRead.light_count)} />
            )}
          </div>
          {lightingRead.key_observations?.length > 0 && (
            <ul className="lab-section__notes">
              {lightingRead.key_observations.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* Recreation Setup */}
      {Object.keys(recreationSetup).length > 0 && (
        <div className="lab-section">
          <h4 className="lab-section__title">Recreation Setup</h4>
          <div className="ref-analysis">
            {recreationSetup.setup_family && recreationSetup.setup_family !== 'unknown' && (
              <AnalysisRow label="Style" value={recreationSetup.setup_family.replace(/[-_]/g, ' ')} capitalize />
            )}
            {recreationSetup.modifier_suggestion && recreationSetup.modifier_suggestion !== 'unknown' && (
              <AnalysisRow label="Modifier" value={recreationSetup.modifier_suggestion} />
            )}
            {recreationSetup.key_placement && (
              <AnalysisRow label="Key Placement" value={recreationSetup.key_placement} />
            )}
            {recreationSetup.fill_strategy && (
              <AnalysisRow label="Fill Strategy" value={recreationSetup.fill_strategy} />
            )}
            {recreationSetup.background_strategy && (
              <AnalysisRow label="Background" value={recreationSetup.background_strategy} />
            )}
          </div>
          {recreationSetup.setup_notes?.length > 0 && (
            <ul className="lab-section__notes">
              {recreationSetup.setup_notes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          )}
        </div>
      )}

      {/* Full analysis fallback if nothing structured */}
      {!desc.subject && Object.keys(lightingRead).length === 0 && Object.keys(recreationSetup).length === 0 && (
        <div className="lab-section">
          <h4 className="lab-section__title">Analysis Output</h4>
          <JsonTree data={data} />
        </div>
      )}
    </div>
  );
}

/** Reusable analysis row */
function AnalysisRow({ label, value, capitalize }) {
  return (
    <div className="ref-analysis__row ref-analysis__row--inline">
      <span className="ref-analysis__label">{label}</span>
      <span className="ref-analysis__value" style={capitalize ? { textTransform: 'capitalize' } : undefined}>
        {value}
      </span>
    </div>
  );
}

/**
 * VLM vs CV comparison view.
 * Shows overlapping fields side-by-side with "Accept VLM" buttons.
 * Accepting VLM overrides the corresponding value in reference_analysis.
 */
function VlmCvCompare({ data, onAccept }) {
  const vlm = data.vlm || {};
  const cv = data.cv || {};
  const classification = data.classification || {};
  const analysis = data.reference_analysis || {};
  const imageRead = analysis.image_read || {};
  const lightingRead = analysis.lighting_read || {};
  const recreationSetup = analysis.recreation_setup || {};
  const lightingInf = data.lighting_inference || {};

  // Track which rows are selected for VLM override (toggleable)
  const [selected, setSelected] = useState(new Set());
  // Track manual edits: { [rowLabel]: editedValue }
  const [edits, setEdits] = useState({});
  // Track which cell is being edited: "cv:Label" or "vlm:Label"
  const [editingCell, setEditingCell] = useState(null);

  // Helper: format value for display (handles arrays, objects, booleans)
  function fmt(val) {
    if (val == null || val === '') return '';
    if (Array.isArray(val)) return val.length ? val.join(', ') : '';
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    if (typeof val === 'object') return JSON.stringify(val);
    return String(val);
  }

  // Build comprehensive comparison rows
  // Each: { label, cv, vlm, path (dot-path in reference_analysis to override), section }
  const rows = [];

  // ── Subject & Scene ──
  const cvSubject = fmt(cv.subject?.type || imageRead.subject_type);
  const vlmSubject = fmt(vlm.subject_type);
  if (cvSubject || vlmSubject)
    rows.push({ section: 'Subject & Scene', label: 'Subject Type', cv: cvSubject, vlm: vlmSubject, path: 'image_read.subject_type' });

  const cvSubjectCount = fmt(imageRead.subject_count);
  const vlmSubjectCount = fmt(vlm.subject_count);
  if (cvSubjectCount || vlmSubjectCount)
    rows.push({ section: 'Subject & Scene', label: 'Subject Count', cv: cvSubjectCount, vlm: vlmSubjectCount, path: 'image_read.subject_count' });

  const cvGenre = fmt(imageRead.genre);
  if (cvGenre)
    rows.push({ section: 'Subject & Scene', label: 'Genre', cv: cvGenre, vlm: '', path: 'image_read.genre' });

  const cvFraming = fmt(cv.subject?.framing || cv.pose?.framing || imageRead.camera_subject_relationship);
  const vlmFraming = fmt(vlm.framing);
  if (cvFraming || vlmFraming)
    rows.push({ section: 'Subject & Scene', label: 'Framing', cv: cvFraming, vlm: vlmFraming, path: 'image_read.camera_subject_relationship',
      options: ['close_up', 'medium_close_up', 'medium', 'medium_full', 'full_length', 'environmental'] });

  const cvPose = fmt(cv.subject?.pose || cv.pose?.pose || imageRead.pose_notes);
  const vlmPose = fmt(vlm.pose);
  if (cvPose || vlmPose)
    rows.push({ section: 'Subject & Scene', label: 'Pose', cv: cvPose, vlm: vlmPose, path: 'image_read.pose_notes' });

  const vlmExpression = fmt(vlm.expression);
  if (vlmExpression)
    rows.push({ section: 'Subject & Scene', label: 'Expression', cv: '', vlm: vlmExpression, path: 'image_read.expression' });

  const cvMood = fmt(classification.mood || imageRead.mood);
  const vlmMood = fmt(vlm.overall_mood);
  if (cvMood || vlmMood)
    rows.push({ section: 'Subject & Scene', label: 'Mood', cv: cvMood, vlm: vlmMood, path: 'image_read.mood' });

  const cvScene = fmt(imageRead.scene_description);
  if (cvScene)
    rows.push({ section: 'Subject & Scene', label: 'Scene Description', cv: cvScene, vlm: '', path: 'image_read.scene_description' });

  const cvIntent = fmt(imageRead.visual_intent);
  if (cvIntent)
    rows.push({ section: 'Subject & Scene', label: 'Visual Intent', cv: cvIntent, vlm: '', path: 'image_read.visual_intent' });

  // ── Appearance ──
  const cvSkin = fmt(cv.skin_tone?.skin_tone_guess || (imageRead.subject_skin_tones || []).join(', '));
  const vlmSkin = fmt((vlm.apparent_skin_tones || []).join(', '));
  if (cvSkin || vlmSkin)
    rows.push({ section: 'Appearance', label: 'Skin Tone', cv: cvSkin, vlm: vlmSkin, path: 'image_read.subject_skin_tones' });

  const cvSkinMixed = fmt(imageRead.skin_tone_mixed);
  const vlmSkinMixed = fmt(vlm.skin_tone_mixed);
  if (cvSkinMixed || vlmSkinMixed)
    rows.push({ section: 'Appearance', label: 'Mixed Skin Tones', cv: cvSkinMixed, vlm: vlmSkinMixed, path: 'image_read.skin_tone_mixed' });

  const vlmStyling = fmt((vlm.styling_details || []).join(', '));
  if (vlmStyling)
    rows.push({ section: 'Appearance', label: 'Styling Details', cv: '', vlm: vlmStyling, path: 'image_read.styling_details' });

  const vlmClothing = fmt(vlm.clothing_accessories);
  if (vlmClothing)
    rows.push({ section: 'Appearance', label: 'Clothing / Accessories', cv: '', vlm: vlmClothing, path: 'image_read.clothing_accessories' });

  const vlmFeatures = fmt((vlm.notable_features || []).join(', '));
  if (vlmFeatures)
    rows.push({ section: 'Appearance', label: 'Notable Features', cv: '', vlm: vlmFeatures, path: 'image_read.notable_features' });

  // ── Background & Environment ──
  const cvBg = fmt(cv.background_environment?.environment || imageRead.background_relationship);
  const vlmBg = fmt(vlm.background_context);
  if (cvBg || vlmBg)
    rows.push({ section: 'Background', label: 'Background', cv: cvBg, vlm: vlmBg, path: 'image_read.background_relationship' });

  const cvContrast = fmt(imageRead.contrast_shadow_feel);
  if (cvContrast)
    rows.push({ section: 'Background', label: 'Contrast / Shadow Feel', cv: cvContrast, vlm: '', path: 'image_read.contrast_shadow_feel' });

  const cvDevices = fmt((imageRead.notable_visual_devices || []).join(', '));
  if (cvDevices)
    rows.push({ section: 'Background', label: 'Visual Devices', cv: cvDevices, vlm: '', path: 'image_read.notable_visual_devices' });

  // ── Lighting ──
  const cvLightFamily = fmt(lightingRead.lighting_family);
  const vlmLighting = fmt(vlm.lighting_style);
  if (cvLightFamily || vlmLighting)
    rows.push({ section: 'Lighting', label: 'Lighting Family', cv: cvLightFamily, vlm: vlmLighting, path: 'lighting_read.lighting_family',
      options: KNOWN_PATTERNS });

  const cvShadowPattern = fmt(lightingRead.shadow_pattern);
  if (cvShadowPattern)
    rows.push({ section: 'Lighting', label: 'Shadow Pattern', cv: cvShadowPattern, vlm: '', path: 'lighting_read.shadow_pattern' });

  const cvSourceQuality = fmt(lightingRead.source_quality);
  if (cvSourceQuality)
    rows.push({ section: 'Lighting', label: 'Source Quality', cv: cvSourceQuality, vlm: '', path: 'lighting_read.source_quality' });

  const cvSourceDir = fmt(lightingRead.source_direction);
  if (cvSourceDir)
    rows.push({ section: 'Lighting', label: 'Source Direction', cv: cvSourceDir, vlm: '', path: 'lighting_read.source_direction' });

  const cvFill = fmt(lightingRead.fill_presence);
  if (cvFill)
    rows.push({ section: 'Lighting', label: 'Fill Presence', cv: cvFill, vlm: '', path: 'lighting_read.fill_presence' });

  const cvRim = fmt(lightingRead.rim_presence);
  if (cvRim)
    rows.push({ section: 'Lighting', label: 'Rim Presence', cv: cvRim, vlm: '', path: 'lighting_read.rim_presence' });

  const cvLightCount = fmt(lightingRead.light_count);
  if (cvLightCount)
    rows.push({ section: 'Lighting', label: 'Light Count', cv: cvLightCount, vlm: '', path: 'lighting_read.light_count' });

  const cvKeyObs = fmt((lightingRead.key_observations || []).join(', '));
  if (cvKeyObs)
    rows.push({ section: 'Lighting', label: 'Key Observations', cv: cvKeyObs, vlm: '', path: 'lighting_read.key_observations' });

  // ── Classification ──
  if (classification.confidence)
    rows.push({ section: 'Classification', label: 'Confidence', cv: fmt(classification.confidence), vlm: '', path: '_cls.confidence',
      options: ['very_high', 'high', 'medium', 'low', 'very_low'] });
  if (classification.lightQuality)
    rows.push({ section: 'Classification', label: 'Light Quality', cv: fmt(classification.lightQuality), vlm: '', path: '_cls.lightQuality',
      options: ['hard', 'soft', 'mixed'] });
  if (classification.colorTemperature)
    rows.push({ section: 'Classification', label: 'Color Temperature', cv: fmt(classification.colorTemperature), vlm: '', path: '_cls.colorTemperature',
      options: ['warm', 'cool', 'neutral', 'mixed'] });
  if (classification.brightness)
    rows.push({ section: 'Classification', label: 'Brightness', cv: fmt(classification.brightness), vlm: '', path: '_cls.brightness',
      options: ['high_key', 'normal', 'low_key', 'silhouette'] });

  // ── Recreation Setup (CV only) ──
  if (recreationSetup.setup_family)
    rows.push({ section: 'Recreation', label: 'Setup Family', cv: fmt(recreationSetup.setup_family), vlm: '', path: 'recreation_setup.setup_family' });
  if (recreationSetup.modifier_suggestion)
    rows.push({ section: 'Recreation', label: 'Modifier', cv: fmt(recreationSetup.modifier_suggestion), vlm: '', path: 'recreation_setup.modifier_suggestion' });
  if (recreationSetup.key_placement)
    rows.push({ section: 'Recreation', label: 'Key Placement', cv: fmt(recreationSetup.key_placement), vlm: '', path: 'recreation_setup.key_placement' });
  if (recreationSetup.fill_strategy)
    rows.push({ section: 'Recreation', label: 'Fill Strategy', cv: fmt(recreationSetup.fill_strategy), vlm: '', path: 'recreation_setup.fill_strategy' });

  // ── Attribution ──
  const cvPhotographer = fmt(imageRead.likely_photographer);
  const vlmPhotographer = fmt(vlm.likely_photographer !== 'unknown' ? vlm.likely_photographer : '');
  if (cvPhotographer || vlmPhotographer)
    rows.push({ section: 'Attribution', label: 'Photographer', cv: cvPhotographer, vlm: vlmPhotographer, path: 'image_read.likely_photographer' });

  // Rows that can be toggled (have a path and VLM value)
  const toggleableRows = rows.filter(r => r.path && r.vlm);

  // Write a value into reference_analysis at a dot-path
  function setAtPath(obj, dotPath, value) {
    const parts = dotPath.split('.');
    let target = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!target[parts[i]]) target[parts[i]] = {};
      target = target[parts[i]];
    }
    const key = parts[parts.length - 1];
    // Coerce types for known paths
    if (dotPath === 'image_read.subject_skin_tones') {
      target[key] = String(value).split(', ').filter(Boolean);
    } else if (dotPath === 'image_read.subject_count') {
      target[key] = parseInt(value, 10) || 1;
    } else if (dotPath === 'image_read.skin_tone_mixed') {
      target[key] = value === 'Yes' || value === true;
    } else {
      target[key] = value;
    }
  }

  // Resolve a path to the correct root object in `updated`
  function resolveRoot(updated, path) {
    if (path.startsWith('_cls.')) {
      if (!updated.classification) updated.classification = {};
      return { root: updated.classification, subPath: path.slice(5) };
    }
    if (!updated.reference_analysis) updated.reference_analysis = {};
    return { root: updated.reference_analysis, subPath: path };
  }

  // Apply VLM selections + manual edits to data and notify parent
  function applyChanges(newSelected, newEdits) {
    const updated = JSON.parse(JSON.stringify(data));
    // 1. Apply VLM selections
    for (const row of rows) {
      if (!row.path || !row.vlm) continue;
      if (newSelected.has(row.label)) {
        const { root, subPath } = resolveRoot(updated, row.path);
        setAtPath(root, subPath, row.vlm);
      }
    }
    // 2. Apply manual edits (override VLM selections if both exist)
    for (const row of rows) {
      if (!row.path) continue;
      if (newEdits[row.label] !== undefined) {
        const { root, subPath } = resolveRoot(updated, row.path);
        setAtPath(root, subPath, newEdits[row.label]);
      }
    }
    onAccept(updated);
  }

  function handleToggle(row) {
    const next = new Set(selected);
    if (next.has(row.label)) {
      next.delete(row.label);
    } else {
      next.add(row.label);
    }
    // Clear manual edit when toggling VLM accept
    const nextEdits = { ...edits };
    delete nextEdits[row.label];
    setSelected(next);
    setEdits(nextEdits);
    applyChanges(next, nextEdits);
  }

  function handleAcceptAll() {
    const next = new Set(toggleableRows.map(r => r.label));
    setSelected(next);
    setEdits({});
    applyChanges(next, {});
  }

  function handleDeselectAll() {
    setSelected(new Set());
    setEdits({});
    onAccept(JSON.parse(JSON.stringify(data)));
  }

  // Inline editing: commit an edited value for a row
  function handleEditCommit(row, value) {
    setEditingCell(null);
    if (value === row.cv || value === row.vlm) {
      // No change — remove edit override
      const nextEdits = { ...edits };
      delete nextEdits[row.label];
      setEdits(nextEdits);
      applyChanges(selected, nextEdits);
      return;
    }
    const nextEdits = { ...edits, [row.label]: value };
    // Deselect VLM for this row since we have a manual edit
    const nextSelected = new Set(selected);
    nextSelected.delete(row.label);
    setSelected(nextSelected);
    setEdits(nextEdits);
    applyChanges(nextSelected, nextEdits);
  }

  if (rows.length === 0) {
    return (
      <div className="lab-section">
        <p className="lab-section__text">No comparison data available.</p>
      </div>
    );
  }

  const selectedCount = selected.size;
  const editCount = Object.keys(edits).length;
  const changedCount = selectedCount + editCount;
  const allSelected = selectedCount === toggleableRows.length && toggleableRows.length > 0;

  // Group rows by section
  let lastSection = '';

  return (
    <div className="lab-compare">
      {/* Confirmation banner */}
      {changedCount > 0 && (
        <div className="lab-compare__banner">
          <span className="lab-compare__banner-icon">{'\u2714'}</span>
          {changedCount} value{changedCount > 1 ? 's' : ''} changed
          {selectedCount > 0 && editCount > 0
            ? ` (${selectedCount} VLM, ${editCount} manual)`
            : selectedCount > 0 ? ' (VLM)' : ' (manual)'
          }
          {' \u2014 use Commit to Gold Set below to save'}
        </div>
      )}

      <div className="lab-compare__header">
        <span />
        <span className="lab-compare__col-label">CV Pipeline</span>
        <span className="lab-compare__col-label">VLM</span>
        <span />
      </div>

      {rows.map((row, i) => {
        const isSelected = selected.has(row.label);
        const hasEdit = edits[row.label] !== undefined;
        const canToggle = row.path && row.vlm;
        const differs = row.cv && row.vlm && row.cv !== row.vlm;
        const showSection = row.section !== lastSection;
        lastSection = row.section;

        const rowClass = hasEdit
          ? 'lab-compare__row lab-compare__row--edited'
          : isSelected
            ? 'lab-compare__row lab-compare__row--accepted'
            : (differs && canToggle)
              ? 'lab-compare__row lab-compare__row--diff'
              : 'lab-compare__row';

        const isCvEditing = editingCell === `cv:${row.label}`;
        const isVlmEditing = editingCell === `vlm:${row.label}`;

        return (
          <div key={i}>
            {showSection && (
              <div className="lab-compare__section-header">{row.section}</div>
            )}
            <div className={rowClass}>
              <span className="lab-compare__label">
                {(isSelected || hasEdit) && <span className="lab-compare__check">{hasEdit ? '\u270E' : '\u2714'}</span>}
                {row.label}
              </span>

              {/* CV cell — click to edit */}
              <span className="lab-compare__cv" style={isSelected ? { textDecoration: 'line-through', opacity: 0.5 } : undefined}>
                {isCvEditing ? (
                  <EditableCell
                    initial={hasEdit ? edits[row.label] : row.cv}
                    onCommit={(val) => handleEditCommit(row, val)}
                    onCancel={() => setEditingCell(null)}
                    options={row.options}
                  />
                ) : (
                  <span
                    className="lab-compare__editable"
                    onClick={() => setEditingCell(`cv:${row.label}`)}
                    title="Click to edit"
                  >
                    {hasEdit ? edits[row.label] : (row.cv || '\u2014')}
                    {hasEdit && <span className="lab-compare__edited-tag">edited</span>}
                  </span>
                )}
              </span>

              {/* VLM cell — click to edit */}
              <span className="lab-compare__vlm" style={isSelected ? { fontWeight: 600 } : undefined}>
                {isVlmEditing ? (
                  <EditableCell
                    initial={row.vlm}
                    onCommit={(val) => handleEditCommit(row, val)}
                    onCancel={() => setEditingCell(null)}
                    options={row.options}
                  />
                ) : (
                  <span
                    className="lab-compare__editable"
                    onClick={() => setEditingCell(`vlm:${row.label}`)}
                    title="Click to edit"
                  >
                    {row.vlm || '\u2014'}
                  </span>
                )}
              </span>

              <span className="lab-compare__action">
                {hasEdit ? (
                  <button
                    className="btn btn--xs btn--ghost"
                    onClick={() => {
                      const nextEdits = { ...edits };
                      delete nextEdits[row.label];
                      setEdits(nextEdits);
                      applyChanges(selected, nextEdits);
                    }}
                    title="Clear manual edit"
                  >
                    Undo
                  </button>
                ) : canToggle ? (
                  <button
                    className={`btn btn--xs ${isSelected ? 'btn--success' : 'btn--ghost'}`}
                    onClick={() => handleToggle(row)}
                    title={isSelected ? 'Deselect VLM value' : 'Accept VLM value'}
                  >
                    {isSelected ? 'VLM \u2714' : 'Accept'}
                  </button>
                ) : null}
              </span>
            </div>
          </div>
        );
      })}

      <div className="lab-compare__footer">
        {!allSelected ? (
          <button className="btn btn--primary btn--sm" onClick={handleAcceptAll}>
            Accept All VLM
          </button>
        ) : (
          <button className="btn btn--ghost btn--sm" onClick={handleDeselectAll}>
            Deselect All
          </button>
        )}
        <span className="lab-compare__hint">
          {changedCount > 0
            ? `${changedCount} of ${rows.length} changed`
            : `${toggleableRows.length} VLM overrides available \u2022 click any value to edit`
          }
        </span>
      </div>
    </div>
  );
}


/** Inline editable cell — shows input or select, commits on Enter/blur, cancels on Escape */
function EditableCell({ initial, onCommit, onCancel, options }) {
  const [value, setValue] = useState(initial || '');
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  function commit() { onCommit(value.trim()); }

  if (options?.length) {
    return (
      <select
        ref={inputRef}
        className="lab-compare__edit-input"
        value={value}
        onChange={e => { setValue(e.target.value); onCommit(e.target.value); }}
        onKeyDown={e => { if (e.key === 'Escape') onCancel(); }}
        onBlur={() => onCommit(value)}
      >
        {value && !options.includes(value) && <option value={value}>{value}</option>}
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }

  return (
    <input
      ref={inputRef}
      className="lab-compare__edit-input"
      value={value}
      onChange={e => setValue(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') onCancel(); }}
      onBlur={commit}
    />
  );
}


const WORKBENCH_PHASES = [
  'Reading the light\u2026',
  'Analyzing shadows\u2026',
  'Identifying setup\u2026',
  'Evaluating mood\u2026',
  'Running pipeline\u2026',
];

function WorkbenchScanStatus() {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPhase(p => (p + 1) % WORKBENCH_PHASES.length), 2400);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="ref-scan-status">
      <span className="ref-scan-status__dot" />
      <span className="ref-scan-status__text">{WORKBENCH_PHASES[phase]}</span>
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════
   Reference Queue Panel — pending reference images to review
   before seeding into the Gold Set
   ═══════════════════════════════════════════════════════════ */

function ReferenceQueuePanel({ onSeeded }) {
  const [refEntries, setRefEntries]     = useState([]);
  const [goldPaths, setGoldPaths]       = useState(new Set());
  const [selectedIds, setSelectedIds]   = useState(new Set());
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);
  const [seedRunning, setSeedRunning]   = useState(false);
  const [seedResult, setSeedResult]     = useState(null);
  const [justSeeded, setJustSeeded]     = useState(new Set()); // paths seeded this session

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [refData, goldData] = await Promise.all([
        listReferenceDataset({ tier: 'gold' }),
        listGoldSet(),
      ]);
      const gs = goldData.entries || goldData || [];
      setGoldPaths(new Set(gs.map(e => e.image_path)));
      setRefEntries(refData.entries || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Compute pending: gold-tier reference entries not yet in Gold Set
  const pending = refEntries.filter(ref => {
    const pid = ref.pattern_id;
    const rid = ref.reference_id;
    if (!pid || !rid) return false;
    const relPath = `data/reference_dataset/${pid}/${rid}/image.jpg`;
    return !goldPaths.has(relPath) && !justSeeded.has(relPath);
  });

  // Already seeded (in goldPaths) — shown in "Seeded" section
  const seeded = refEntries.filter(ref => {
    const pid = ref.pattern_id;
    const rid = ref.reference_id;
    if (!pid || !rid) return false;
    const relPath = `data/reference_dataset/${pid}/${rid}/image.jpg`;
    return goldPaths.has(relPath);
  });

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === pending.length && pending.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pending.map(r => r.reference_id)));
    }
  }

  async function handleSeed() {
    const hasSelection = selectedIds.size > 0;
    const targets = hasSelection ? pending.filter(r => selectedIds.has(r.reference_id)) : pending;
    const imagePaths = targets.map(r =>
      `data/reference_dataset/${r.pattern_id}/${r.reference_id}/image.jpg`
    );
    if (imagePaths.length === 0) return;

    setSeedRunning(true);
    setSeedResult(null);
    try {
      const data = await seedGoldSetFromReference({ tier: 'gold', imagePaths });
      const actionAt = new Date().toLocaleTimeString(undefined, { timeZone: _TZ, hour: '2-digit', minute: '2-digit' });
      setSeedResult({ ...data, actionAt });
      if (data.created > 0) {
        // Mark seeded paths so they move immediately
        const newPaths = new Set(data.entries.map(e => e.image_path));
        setJustSeeded(prev => new Set([...prev, ...newPaths]));
        setGoldPaths(prev => new Set([...prev, ...newPaths]));
        setSelectedIds(new Set());
        onSeeded(); // refresh Gold Set list
      }
    } catch (err) {
      setSeedResult({ error: err.message, actionAt: new Date().toLocaleTimeString(undefined, { timeZone: _TZ, hour: '2-digit', minute: '2-digit' }) });
    } finally {
      setSeedRunning(false);
    }
  }

  if (loading) return <p className="lab-list__status">Loading queue…</p>;
  if (error)   return <p className="lab-list__status lab-list__status--error">{error}</p>;

  return (
    <div className="lab-list">
      {/* Toolbar */}
      <div className="lab-list__toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
          <span style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)' }}>
            {pending.length} pending
          </span>
          {pending.length > 0 && (
            <button className="btn btn--ghost btn--sm" onClick={toggleSelectAll}>
              {selectedIds.size === pending.length && pending.length > 0 ? '☑ All' : '☐ All'}
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
          <button
            className="btn btn--primary btn--sm"
            onClick={handleSeed}
            disabled={seedRunning || pending.length === 0}
          >
            {seedRunning
              ? 'Seeding…'
              : selectedIds.size > 0
                ? `⬆ Seed ${selectedIds.size} Selected`
                : `⬆ Seed All (${pending.length})`}
          </button>
          <button className="btn btn--ghost btn--sm" onClick={load} disabled={loading}>
            ↺
          </button>
        </div>
      </div>

      {/* Seed result banner */}
      {seedResult && (
        <div className="lab-eval-banner" style={{ borderColor: seedResult.error ? 'var(--color-error)' : 'var(--color-success)' }}>
          <div className="lab-eval-banner__header">
            <span style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
              <strong>{seedResult.error ? 'Seed Failed' : 'Seeded'}</strong>
              {seedResult.actionAt && (
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)', fontFamily: 'var(--font-mono)' }}>
                  {seedResult.actionAt}
                </span>
              )}
            </span>
            <button className="lab-eval-banner__close" onClick={() => setSeedResult(null)}>×</button>
          </div>
          {seedResult.error ? (
            <div style={{ color: 'var(--color-error)', fontSize: 'var(--text-sm)' }}>{seedResult.error}</div>
          ) : (
            <div className="lab-eval-banner__stats">
              <span style={{ color: 'var(--color-success)' }}>Created: {seedResult.created}</span>
              <span style={{ color: 'var(--color-text-dim)' }}>Skipped: {seedResult.skipped}</span>
              {seedResult.entries?.length > 0 && (
                <span style={{ color: 'var(--color-text-dim)' }}>
                  — {seedResult.entries.map(e => e.pattern).filter((v, i, a) => v && a.indexOf(v) === i).join(', ')}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Pending cards */}
      {pending.length === 0 && seeded.length > 0 && (
        <div className="lab-content__placeholder" style={{ paddingTop: 'var(--space-lg)' }}>
          <span style={{ fontSize: 'var(--text-2xl)' }}>✓</span>
          <h3>All seeded</h3>
          <p>All {seeded.length} gold-tier references are in the Gold Set.</p>
        </div>
      )}
      {pending.length === 0 && seeded.length === 0 && (
        <div className="lab-content__placeholder">
          <h3>No gold-tier references</h3>
          <p>Upload and approve reference images to populate this queue.</p>
        </div>
      )}

      {pending.length > 0 && (
        <>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)', margin: '0 0 var(--space-xs)' }}>
            PENDING — not yet in Gold Set
          </p>
          {pending.map(ref => {
            const isChecked = selectedIds.has(ref.reference_id);
            const meta = ref.metadata || {};
            const gt = meta.ground_truth || {};
            const thumbUrl = getReferenceThumbnailUrl(ref.pattern_id, ref.reference_id);
            return (
              <div
                key={ref.reference_id}
                className={`lab-card lab-card--selectable${isChecked ? ' lab-card--selected' : ''}`}
                onClick={() => toggleSelect(ref.reference_id)}
              >
                <label className="lab-card__checkbox" onClick={e => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleSelect(ref.reference_id)}
                    style={{ cursor: 'pointer' }}
                  />
                </label>
                {ref.has_thumbnail && (
                  <ZoomImg
                    src={thumbUrl}
                    alt={ref.reference_id}
                    className="lab-queue-thumb"
                    onError={e => { e.target.style.display = 'none'; }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="lab-card__top">
                    <span className="lab-card__title">{gt.expected_pattern || ref.pattern_id}</span>
                    <span className="lab-badge lab-badge--amber">{meta.dataset_tier || 'gold'}</span>
                  </div>
                  <p className="lab-card__sub">{ref.reference_id}</p>
                  {meta.approval_status && (
                    <span className="lab-card__meta">{meta.approval_status}</span>
                  )}
                </div>
              </div>
            );
          })}
        </>
      )}

      {/* Seeded section */}
      {seeded.length > 0 && (
        <>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)', margin: 'var(--space-md) 0 var(--space-xs)' }}>
            SEEDED — {seeded.length} already in Gold Set
          </p>
          {seeded.map(ref => {
            const meta = ref.metadata || {};
            const gt = meta.ground_truth || {};
            const thumbUrl = getReferenceThumbnailUrl(ref.pattern_id, ref.reference_id);
            const isNew = justSeeded.has(`data/reference_dataset/${ref.pattern_id}/${ref.reference_id}/image.jpg`);
            return (
              <div key={ref.reference_id} className="lab-card" style={{ opacity: 0.6 }}>
                {ref.has_thumbnail && (
                  <ZoomImg
                    src={thumbUrl}
                    alt={ref.reference_id}
                    className="lab-queue-thumb"
                    onError={e => { e.target.style.display = 'none'; }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="lab-card__top">
                    <span className="lab-card__title">{gt.expected_pattern || ref.pattern_id}</span>
                    <span className="lab-badge lab-badge--green">{isNew ? '✓ just seeded' : '✓ seeded'}</span>
                  </div>
                  <p className="lab-card__sub">{ref.reference_id}</p>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════
   Gold Set Tab — CRUD list + detail + batch evaluation
   ═══════════════════════════════════════════════════════════ */

const GOLD_STATUSES = ['all', 'draft', 'approved', 'archived'];

function GoldSetTab({ prefill, onPrefillConsumed }) {
  const [activeTab, setActiveTab]       = useState('goldset'); // 'queue' | 'goldset'
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [view, setView] = useState(prefill ? 'create' : 'list');
  const [selected, setSelected] = useState(null);
  const [evalResult, setEvalResult] = useState(null);
  const [evalRunning, setEvalRunning] = useState(false);
  const [seedRunning, setSeedRunning] = useState(false);
  const [seedResult, setSeedResult] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);

  // Auto-open create form when prefill arrives
  useEffect(() => {
    if (prefill) setView('create');
  }, [prefill]);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelectedIds(new Set());
    try {
      const data = await listGoldSet(statusFilter === 'all' ? null : statusFilter);
      setEntries(data.entries || data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  async function handleDelete(id) {
    if (!confirm('Delete this gold set entry?')) return;
    try {
      await deleteGoldSetEntry(id);
      setView('list');
      setSelected(null);
      fetchEntries();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleStatusChange(id, newStatus) {
    try {
      await updateGoldSetEntry(id, { status: newStatus });
      fetchEntries();
      if (selected?.id === id) {
        setSelected({ ...selected, status: newStatus });
      }
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleSeedFromReference() {
    setSeedRunning(true);
    setSeedResult(null);
    try {
      // If entries are selected, seed only those specific image paths (force-refresh)
      // If nothing selected, seed all gold-tier reference entries (new ones only)
      const hasSelection = selectedIds.size > 0;
      const imagePaths = hasSelection
        ? entries.filter(e => selectedIds.has(e.id)).map(e => e.image_path).filter(Boolean)
        : null;
      const data = await seedGoldSetFromReference({
        tier:       'gold',
        imagePaths: imagePaths,
        force:      hasSelection,   // force-refresh when targeting selected entries
      });
      const actionAt = new Date().toLocaleTimeString(undefined, { timeZone: _TZ, hour: '2-digit', minute: '2-digit' });
      setSeedResult({ ...data, targeted: hasSelection, targetCount: imagePaths?.length, actionAt });
      if (data.created > 0 || (hasSelection && data.entries?.length > 0)) fetchEntries();
    } catch (err) {
      setSeedResult({ error: err.message, actionAt: new Date().toLocaleTimeString(undefined, { timeZone: _TZ, hour: '2-digit', minute: '2-digit' }) });
    } finally {
      setSeedRunning(false);
    }
  }

  async function handleRunEval() {
    setEvalRunning(true);
    setEvalResult(null);
    try {
      const data = await evaluateGoldSet();
      setEvalResult({ ...data, actionAt: new Date().toLocaleTimeString(undefined, { timeZone: _TZ, hour: '2-digit', minute: '2-digit' }) });
    } catch (err) {
      alert(err.message);
    } finally {
      setEvalRunning(false);
    }
  }

  function toggleSelect(id, e) {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === entries.length && entries.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(entries.map(e => e.id)));
    }
  }

  async function handleBulkStatus(newStatus) {
    if (selectedIds.size === 0) return;
    setBulkRunning(true);
    try {
      await Promise.all([...selectedIds].map(id => updateGoldSetEntry(id, { status: newStatus })));
      setSelectedIds(new Set());
      fetchEntries();
    } catch (err) {
      alert(err.message);
    } finally {
      setBulkRunning(false);
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} selected entries? This cannot be undone.`)) return;
    setBulkRunning(true);
    try {
      await Promise.all([...selectedIds].map(id => deleteGoldSetEntry(id)));
      setSelectedIds(new Set());
      fetchEntries();
    } catch (err) {
      alert(err.message);
    } finally {
      setBulkRunning(false);
    }
  }

  // ── Create / Edit form ──
  if (view === 'create') {
    return (
      <GoldSetForm
        prefill={prefill}
        onSave={async (data) => {
          await createGoldSetEntry(data);
          if (onPrefillConsumed) onPrefillConsumed();
          setView('list');
          fetchEntries();
        }}
        onCancel={() => {
          if (onPrefillConsumed) onPrefillConsumed();
          setView('list');
        }}
      />
    );
  }

  // ── Detail view ──
  if (view === 'detail' && selected) {
    return (
      <GoldSetDetail
        entry={selected}
        onBack={() => { setView('list'); setSelected(null); }}
        onStatusChange={handleStatusChange}
        onDelete={handleDelete}
        onUpdated={(updated) => { setSelected(updated); fetchEntries(); }}
      />
    );
  }

  // ── List view ──
  return (
    <div className="lab-list">
      {/* Top-level tab switcher: Queue / Gold Set */}
      <div className="lab-list__tab-switcher">
        <button
          className={`lab-tab${activeTab === 'queue' ? ' lab-tab--active' : ''}`}
          onClick={() => setActiveTab('queue')}
        >
          ⏳ Queue
        </button>
        <button
          className={`lab-tab${activeTab === 'goldset' ? ' lab-tab--active' : ''}`}
          onClick={() => setActiveTab('goldset')}
        >
          ★ Gold Set
        </button>
      </div>

      {/* Queue view — reference images pending seeding */}
      {activeTab === 'queue' && (
        <ReferenceQueuePanel onSeeded={() => { fetchEntries(); setActiveTab('goldset'); }} />
      )}

      {/* Gold Set view */}
      {activeTab === 'goldset' && <>
      {/* Toolbar */}
      <div className="lab-list__toolbar">
        <div className="lab-list__filters">
          {GOLD_STATUSES.map(s => (
            <button
              key={s}
              className={`lab-tab${statusFilter === s ? ' lab-tab--active' : ''}`}
              onClick={() => setStatusFilter(s)}
            >
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-xs)', alignItems: 'center' }}>
          {entries.length > 0 && (
            <button
              className="btn btn--ghost btn--sm"
              onClick={toggleSelectAll}
              title={selectedIds.size === entries.length ? 'Deselect all' : 'Select all'}
            >
              {selectedIds.size === entries.length && entries.length > 0 ? '☑ All' : '☐ All'}
            </button>
          )}
          <button className="btn btn--primary btn--sm" onClick={() => setView('create')}>
            + New
          </button>
          <button
            className="btn btn--ghost btn--sm"
            onClick={handleSeedFromReference}
            disabled={seedRunning}
            title={selectedIds.size > 0
              ? `Re-seed ${selectedIds.size} selected entries from Reference Dataset (force-refresh)`
              : 'Import all Gold-tier reference dataset images into the Gold Set as approved entries'}
          >
            {seedRunning
              ? 'Seeding\u2026'
              : selectedIds.size > 0
                ? `\u2B06 Re-seed ${selectedIds.size} Selected`
                : '\u2B06 Seed from Reference'}
          </button>
          <button
            className="btn btn--ghost btn--sm"
            onClick={handleRunEval}
            disabled={evalRunning}
          >
            {evalRunning ? 'Running\u2026' : 'Run Eval'}
          </button>
        </div>
      </div>

      {/* Bulk action bar — visible when entries are selected */}
      {selectedIds.size > 0 && (
        <div className="lab-bulk-bar">
          <span className="lab-bulk-bar__count">{selectedIds.size} selected</span>
          <div className="lab-bulk-bar__actions">
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => handleBulkStatus('approved')}
              disabled={bulkRunning}
              title="Approve selected entries (activate for eval)"
            >
              ✓ Approve
            </button>
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => handleBulkStatus('archived')}
              disabled={bulkRunning}
            >
              Archive
            </button>
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => handleBulkStatus('draft')}
              disabled={bulkRunning}
            >
              → Draft
            </button>
            <button
              className="btn btn--ghost btn--sm"
              style={{ color: 'var(--color-error)' }}
              onClick={handleBulkDelete}
              disabled={bulkRunning}
            >
              Delete
            </button>
          </div>
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => setSelectedIds(new Set())}
            style={{ marginLeft: 'auto', opacity: 0.6 }}
          >
            ✕ Clear
          </button>
        </div>
      )}

      {/* Seed result banner */}
      {seedResult && (
        <div className="lab-eval-banner" style={{ borderColor: seedResult.error ? 'var(--color-error)' : 'var(--color-success)' }}>
          <div className="lab-eval-banner__header">
            <span style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
              <strong>
                {seedResult.error
                  ? 'Seed Failed'
                  : seedResult.targeted
                    ? `Re-seeded ${seedResult.targetCount} selected`
                    : 'Seed Complete'}
              </strong>
              {seedResult.actionAt && (
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)', fontFamily: 'var(--font-mono)' }}>
                  {seedResult.actionAt}
                </span>
              )}
            </span>
            <button className="lab-eval-banner__close" onClick={() => setSeedResult(null)}>{'\u00D7'}</button>
          </div>
          {seedResult.error ? (
            <div style={{ color: 'var(--color-error)', fontSize: 'var(--text-sm)' }}>{seedResult.error}</div>
          ) : (
            <div className="lab-eval-banner__stats">
              {seedResult.targeted ? (
                <span style={{ color: 'var(--color-success)' }}>
                  Updated: {seedResult.entries?.filter(e => e.action === 'updated').length || 0}
                  {' '}· Created: {seedResult.entries?.filter(e => e.action === 'created').length || 0}
                </span>
              ) : (
                <span style={{ color: 'var(--color-success)' }}>Created: {seedResult.created}</span>
              )}
              <span style={{ color: 'var(--color-text-dim)' }}>Skipped: {seedResult.skipped}</span>
              {seedResult.entries?.length > 0 && (
                <span style={{ color: 'var(--color-text-dim)' }}>
                  — {seedResult.entries.map(e => e.pattern).filter((v, i, a) => v && a.indexOf(v) === i).join(', ')}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Eval result banner */}
      {evalResult && (
        <div className="lab-eval-banner">
          <div className="lab-eval-banner__header">
            <span style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
              <strong>Evaluation Complete</strong>
              {evalResult.actionAt && (
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)', fontFamily: 'var(--font-mono)' }}>
                  {evalResult.actionAt}
                </span>
              )}
            </span>
            <button className="lab-eval-banner__close" onClick={() => setEvalResult(null)}>{'\u00D7'}</button>
          </div>
          {evalResult.summary && (
            <div className="lab-eval-banner__stats">
              <span>Total: {evalResult.summary.total || 0}</span>
              <span style={{ color: 'var(--color-success)' }}>Pass: {evalResult.summary.passed || 0}</span>
              <span style={{ color: 'var(--color-error)' }}>Fail: {evalResult.summary.failed || 0}</span>
            </div>
          )}
          {evalResult.results && (
            <JsonTree data={evalResult.results} />
          )}
        </div>
      )}

      {/* Loading / Error */}
      {loading && <p className="lab-list__status">Loading entries\u2026</p>}
      {error && <p className="lab-list__status lab-list__status--error">{error}</p>}

      {/* Empty state */}
      {!loading && !error && entries.length === 0 && (
        <div className="lab-content__placeholder">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5, marginBottom: 'var(--space-md)' }}>
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
          <h3>No Entries</h3>
          <p>Create your first gold set entry to start building ground truth.</p>
        </div>
      )}

      {/* Entry cards */}
      {!loading && entries.map(entry => {
        const isChecked = selectedIds.has(entry.id);
        return (
          <div
            key={entry.id}
            className={`lab-card lab-card--selectable${isChecked ? ' lab-card--selected' : ''}`}
            onClick={() => { setSelected(entry); setView('detail'); }}
          >
            <label
              className="lab-card__checkbox"
              onClick={e => toggleSelect(entry.id, e)}
              title={isChecked ? 'Deselect' : 'Select'}
            >
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => {}}
                onClick={e => toggleSelect(entry.id, e)}
                style={{ cursor: 'pointer' }}
              />
            </label>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="lab-card__top">
                <span className="lab-card__title">{entry.image_path || entry.id}</span>
                <StatusBadge status={entry.status} />
              </div>
              {entry.notes && <p className="lab-card__sub">{entry.notes}</p>}
              {entry.created_at && (
                <span className="lab-card__meta">{new Date(entry.created_at * 1000).toLocaleDateString(undefined, { timeZone: _TZ })}</span>
              )}
            </div>
          </div>
        );
      })}
      </>}
    </div>
  );
}

/** Gold Set detail with inline editing */
function GoldSetDetail({ entry, onBack, onStatusChange, onDelete, onUpdated }) {
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(entry.notes || '');
  const [expectedJson, setExpectedJson] = useState(
    entry.expected_analysis ? JSON.stringify(entry.expected_analysis, null, 2) : '{}'
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [imageSrc, setImageSrc] = useState(null);

  useEffect(() => {
    let objectUrl = null;
    getGoldSetImageUrl(entry.id)
      .then(url => { objectUrl = url; setImageSrc(url); })
      .catch(() => {}); // image may not exist for older entries
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [entry.id]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      let expected;
      try { expected = JSON.parse(expectedJson); } catch { throw new Error('Expected analysis must be valid JSON'); }
      const updated = await updateGoldSetEntry(entry.id, {
        notes: notes || null,
        expected_analysis: expected,
      });
      onUpdated(updated);
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setNotes(entry.notes || '');
    setExpectedJson(entry.expected_analysis ? JSON.stringify(entry.expected_analysis, null, 2) : '{}');
    setError(null);
    setEditing(false);
  }

  return (
    <div className="lab-detail">
      <button className="btn btn--ghost btn--sm" onClick={onBack}>
        {'\u2190'} Back to list
      </button>

      <div className="lab-detail__header">
        <h4>Gold Set Entry</h4>
        <div style={{ display: 'flex', gap: 'var(--space-xs)', alignItems: 'center' }}>
          <StatusBadge status={entry.status} />
          {!editing && (
            <button className="btn btn--ghost btn--xs" onClick={() => setEditing(true)}>
              Edit
            </button>
          )}
        </div>
      </div>

      <div className="lab-detail__field">
        <span className="lab-detail__label">ID</span>
        <span className="lab-detail__value lab-detail__value--mono">{entry.id}</span>
      </div>
      {/* Image preview */}
      {imageSrc ? (
        <div className="lab-detail__image-box">
          <ZoomImg src={imageSrc} alt="Gold set" className="lab-detail__image" />
        </div>
      ) : (
        <div className="lab-detail__field">
          <span className="lab-detail__label">Image Path</span>
          <span className="lab-detail__value lab-detail__value--dim">{entry.image_path || '—'}</span>
        </div>
      )}

      {/* Notes — editable */}
      <div className="lab-detail__field">
        <span className="lab-detail__label">Notes</span>
        {editing ? (
          <input
            className="lab-form__input"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Notes about this entry"
          />
        ) : (
          <span className="lab-detail__value">{entry.notes || '\u2014'}</span>
        )}
      </div>

      {entry.created_at && (
        <div className="lab-detail__field">
          <span className="lab-detail__label">Created</span>
          <span className="lab-detail__value">{new Date(entry.created_at * 1000).toLocaleString(undefined, { timeZone: _TZ })}</span>
        </div>
      )}

      {/* Expected Analysis — editable */}
      <div className="lab-detail__field">
        <span className="lab-detail__label">Expected Analysis</span>
        {editing ? (
          <textarea
            className="lab-form__textarea"
            value={expectedJson}
            onChange={e => setExpectedJson(e.target.value)}
            rows={8}
          />
        ) : (
          <JsonTree data={entry.expected_analysis || {}} />
        )}
      </div>

      {error && <div className="lab-form__error">{error}</div>}

      {/* Edit save/cancel */}
      {editing && (
        <div className="lab-detail__controls">
          <button className="btn btn--primary btn--sm" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving\u2026' : 'Save Changes'}
          </button>
          <button className="btn btn--ghost btn--sm" onClick={handleCancel} disabled={saving}>
            Cancel
          </button>
        </div>
      )}

      {/* Status controls (when not editing) */}
      {!editing && (
        <div className="lab-detail__controls">
          {entry.status === 'draft' && (
            <button className="btn btn--primary btn--sm" onClick={() => onStatusChange(entry.id, 'approved')}>
              Approve
            </button>
          )}
          {entry.status === 'approved' && (
            <button className="btn btn--ghost btn--sm" onClick={() => onStatusChange(entry.id, 'archived')}>
              Archive
            </button>
          )}
          {entry.status === 'archived' && (
            <button className="btn btn--ghost btn--sm" onClick={() => onStatusChange(entry.id, 'draft')}>
              Reopen as Draft
            </button>
          )}
          <button className="btn btn--ghost btn--sm" style={{ color: 'var(--color-error)' }} onClick={() => onDelete(entry.id)}>
            Delete
          </button>
        </div>
      )}
    </div>
  );
}


/** Gold Set create form */
function GoldSetForm({ onSave, onCancel, prefill }) {
  const fileRef = useRef(null);
  const [imagePath, setImagePath] = useState(prefill?.image_path || '');
  const [imagePreview, setImagePreview] = useState(prefill?.imagePreview || null);
  const [notes, setNotes] = useState(prefill?.notes || '');
  const [expectedJson, setExpectedJson] = useState(
    prefill?.expected_analysis ? JSON.stringify(prefill.expected_analysis, null, 2) : '{}'
  );
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);

  async function handleFileSelect(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    // Show local preview immediately
    const url = URL.createObjectURL(f);
    setImagePreview(url);
    // Upload via analyze endpoint to get server-side path
    setUploading(true);
    setError(null);
    try {
      const result = await analyzeImage(f, { debug: false });
      setImagePath(result.image_path || '');
      // Pre-fill expected analysis if not already set from prefill
      if (result.reference_analysis && expectedJson === '{}') {
        setExpectedJson(JSON.stringify(result.reference_analysis, null, 2));
      }
    } catch (err) {
      setError(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      let expected = {};
      try { expected = JSON.parse(expectedJson); } catch { throw new Error('Expected analysis must be valid JSON'); }
      await onSave({
        image_path: imagePath,
        expected_analysis: expected,
        notes: notes || undefined,
        status: 'draft',
      });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <form className="lab-form" onSubmit={handleSubmit}>
      <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel}>
        {'\u2190'} Cancel
      </button>
      <h4 className="lab-form__title">New Gold Set Entry</h4>

      {error && <div className="lab-form__error">{error}</div>}

      <div className="lab-form__label">
        Image
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFileSelect}
        />
        {imagePreview ? (
          <div style={{ position: 'relative', marginTop: 'var(--space-xs)' }}>
            <ZoomImg
              src={imagePreview}
              alt="Selected"
              style={{ width: '100%', maxHeight: 200, objectFit: 'contain', borderRadius: 'var(--radius-sm)', display: 'block', background: 'var(--color-bg)' }}
            />
            {uploading && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)' }}>
                <span style={{ color: '#fff', fontSize: 'var(--text-sm)' }}>Uploading…</span>
              </div>
            )}
            <button
              type="button"
              className="btn btn--xs btn--ghost"
              onClick={() => fileRef.current?.click()}
              style={{ marginTop: 'var(--space-xs)' }}
            >
              Change image
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => fileRef.current?.click()}
            style={{ width: '100%', marginTop: 'var(--space-xs)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8 }}>
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Browse image file
          </button>
        )}
        {/* Editable path for manual override or confirmation */}
        <input
          className="lab-form__input"
          value={imagePath}
          onChange={e => setImagePath(e.target.value)}
          placeholder="Server path auto-filled after upload"
          required
          style={{ marginTop: 'var(--space-xs)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}
        />
      </div>

      <label className="lab-form__label">
        Notes
        <input
          className="lab-form__input"
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Optional notes about this entry"
        />
      </label>

      <label className="lab-form__label">
        Expected Analysis (JSON)
        <textarea
          className="lab-form__textarea"
          value={expectedJson}
          onChange={e => setExpectedJson(e.target.value)}
          rows={6}
        />
      </label>

      <button className="btn btn--primary" type="submit" disabled={saving || !imagePath}>
        {saving ? 'Saving\u2026' : 'Create Entry'}
      </button>
    </form>
  );
}


/* ═══════════════════════════════════════════════════════════
   Candidates Tab — CRUD list + detail + status workflow
   ═══════════════════════════════════════════════════════════ */

const CANDIDATE_STATUSES = ['all', 'proposed', 'accepted', 'rejected', 'implemented'];

function CandidatesTab({ prefill, onPrefillConsumed }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [view, setView] = useState(prefill ? 'create' : 'list');
  const [selected, setSelected] = useState(null);

  // Auto-open create form when prefill arrives
  useEffect(() => {
    if (prefill) setView('create');
  }, [prefill]);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listCandidates(statusFilter === 'all' ? null : statusFilter);
      setItems(data.candidates || data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  async function handleDelete(id) {
    if (!confirm('Delete this candidate?')) return;
    try {
      await deleteCandidate(id);
      setView('list');
      setSelected(null);
      fetchItems();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleStatusChange(id, newStatus) {
    try {
      await updateCandidate(id, { status: newStatus });
      fetchItems();
      if (selected?.id === id) {
        setSelected({ ...selected, status: newStatus });
      }
    } catch (err) {
      alert(err.message);
    }
  }

  // ── Create form ──
  if (view === 'create') {
    return (
      <CandidateForm
        prefill={prefill}
        onSave={async (data) => {
          await createCandidate(data);
          if (onPrefillConsumed) onPrefillConsumed();
          setView('list');
          fetchItems();
        }}
        onCancel={() => {
          if (onPrefillConsumed) onPrefillConsumed();
          setView('list');
        }}
      />
    );
  }

  // ── Detail view (with inline edit mode) ──
  if (view === 'detail' && selected) {
    return (
      <CandidateDetailView
        selected={selected}
        onBack={() => { setView('list'); setSelected(null); }}
        onStatusChange={handleStatusChange}
        onDelete={handleDelete}
        onUpdated={(updated) => { setSelected(updated); fetchItems(); }}
      />
    );
  }

  // ── List view ──
  return (
    <div className="lab-list">
      {/* Toolbar */}
      <div className="lab-list__toolbar">
        <div className="lab-list__filters">
          {CANDIDATE_STATUSES.map(s => (
            <button
              key={s}
              className={`lab-tab${statusFilter === s ? ' lab-tab--active' : ''}`}
              onClick={() => setStatusFilter(s)}
            >
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <button className="btn btn--primary btn--sm" onClick={() => setView('create')}>
          + New
        </button>
      </div>

      {/* Loading / Error */}
      {loading && <p className="lab-list__status">Loading candidates\u2026</p>}
      {error && <p className="lab-list__status lab-list__status--error">{error}</p>}

      {/* Empty state */}
      {!loading && !error && items.length === 0 && (
        <div className="lab-content__placeholder">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5, marginBottom: 'var(--space-md)' }}>
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
          <h3>No Candidates</h3>
          <p>Create your first rule candidate to start tracking proposed changes.</p>
        </div>
      )}

      {/* Candidate cards */}
      {!loading && items.map(item => {
        // Parse source_image_path → thumbnail URL
        // Path shape: data/reference_dataset/{pattern_id}/{reference_id}/image.jpg
        let thumbUrl = null;
        if (item.source_image_path) {
          const parts = item.source_image_path.replace(/\\/g, '/').split('/');
          // parts: ['data', 'reference_dataset', pattern_id, reference_id, 'image.jpg']
          if (parts.length >= 5 && parts[1] === 'reference_dataset') {
            thumbUrl = getReferenceThumbnailUrl(parts[2], parts[3]);
          }
        }
        return (
          <button
            key={item.id}
            className="lab-card lab-card--with-thumb"
            onClick={() => { setSelected(item); setView('detail'); }}
          >
            {thumbUrl && (
              <ZoomImg
                src={thumbUrl}
                alt=""
                className="lab-queue-thumb"
                onError={e => { e.target.style.display = 'none'; }}
              />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="lab-card__top">
                <span className="lab-card__title">{item.title}</span>
                <StatusBadge status={item.status} />
              </div>
              {item.description && <p className="lab-card__sub">{item.description}</p>}
              {item.created_at && (
                <span className="lab-card__meta">{new Date(item.created_at * 1000).toLocaleDateString(undefined, { timeZone: _TZ })}</span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── Proposed Change Editor — schema-aware dropdown form ──────────────────

const _PC_PATTERNS = [
  'rembrandt','clamshell','loop','split','butterfly','broad','short',
  'rim_only','high_key','low_key','flat_fashion','window_portrait',
  'golden_hour','overcast_natural','ring_light','bare_bulb_editorial',
  'strip_dramatic','short_fashion_key','soft_editorial_key',
  'editorial_rim_key','tabletop_soft_product','bottle_backlight',
  'athletic_rim_sculpt','window_negative_fill',
];

const _PC_SIGNALS = [
  'triangle_isolation','shadow_density','highlight_width_ratio',
  'lr_asymmetry','shadow_continuity','nose_shadow_centroid_distance',
  'catchlight_position','environmental_shadow_continuity',
];

const _PC_TYPES = [
  { value: 'blueprint_correction',     label: 'Blueprint Correction',
    desc: "A pattern's recommended lighting setup needs updated gear, modifier, or step sequence — e.g. wrong softbox size, missing fill step." },
  { value: 'confidence_recalibration', label: 'Confidence Recalibration',
    desc: "A pattern is being over- or under-estimated by the classifier. Adjusts the confidence floor/ceiling for a specific pattern." },
  { value: 'shoot_mode_step_fix',      label: 'Shoot Mode Step Fix',
    desc: "A step in the Shoot Mode checklist is wrong, missing, or out of order for a specific pattern." },
  { value: 'dataset_promotion',        label: 'Dataset Promotion',
    desc: "Promote an image from the community set to the gold set, or flag an existing gold set entry for removal." },
  { value: 'signal_override',          label: 'Signal Override',
    desc: "When a specific computed signal (e.g. triangle_isolation) exceeds a threshold, force or block a pattern match regardless of classifier output." },
  { value: 'pattern_confusion',        label: 'Pattern Confusion',
    desc: "Two patterns are routinely mistaken for each other. Propose a disambiguating signal or classifier boundary change." },
  { value: 'reference_correction',     label: 'Reference Correction',
    desc: "A reference dataset entry has the wrong label. Propose a relabel, removal, or replacement image." },
  { value: 'vlm_prompt_fix',           label: 'VLM Prompt Fix',
    desc: "The VLM system prompt or few-shot examples produce wrong output for a pattern. Propose a specific prompt edit." },
  { value: 'edge_case_handling',       label: 'Edge Case Handling',
    desc: "Add a guard for unusual input conditions: B&W photos, blown highlights, no face detected, multiple subjects, etc." },
  { value: 'new_pattern_proposal',     label: 'New Pattern Proposal',
    desc: "Propose a lighting pattern that doesn't exist in the current 28-pattern taxonomy. Requires signal spec and example images." },
  { value: 'trust_safety',             label: 'Trust & Safety',
    desc: "Track post-match conversion quality or user safety improvements — framing, harm avoidance, confidence floor." },
  { value: 'needs_investigation',      label: 'Needs Investigation',
    desc: "Flag an anomaly for triage without a specific fix yet — benchmark regression, unexpected output, or unexplained drop in accuracy." },
];

const _PC_ACTIONS = {
  blueprint_correction:     ['review_detection_threshold','review_pattern_boundary'],
  confidence_recalibration: ['reduce_confidence_floor'],
  shoot_mode_step_fix:      ['audit_step_instructions'],
  dataset_promotion:        ['promote_recent_sessions_to_reference'],
  signal_override:          [],
  pattern_confusion:        ['review_classifier_boundaries','add_disambiguating_signal'],
  reference_correction:     ['relabel','remove','replace'],
  vlm_prompt_fix:           ['update_system_prompt','add_few_shot_example'],
  edge_case_handling:       ['add_guard','add_fallback','flag_for_review'],
  new_pattern_proposal:     ['prototype','defer','reject'],
  trust_safety:             ['improve_post_match_conversion'],
  needs_investigation:      ['investigate','triage','escalate'],
};

// Field schema per type — each entry: { key, label, kind, ...opts }
// kinds: 'select', 'pattern', 'signal', 'number', 'text', 'multi_pattern'
const _PC_SCHEMA = {
  blueprint_correction: [
    { key: 'pattern_id',   label: 'Pattern',        kind: 'pattern' },
    { key: 'action',       label: 'Action',          kind: 'action' },
    { key: 'current_cvr',  label: 'Current CVR',     kind: 'number', step: 0.01, min: 0, max: 1, placeholder: '0.00',
      hint: 'CVR = Classifier Validation Rate — fraction of gold set images correctly identified for this pattern. Range 0–1.' },
    { key: 'target_cvr_min', label: 'Target CVR Min',kind: 'number', step: 0.01, min: 0, max: 1, placeholder: '0.00',
      hint: 'Minimum CVR the proposed change must achieve to be accepted. Sets the review acceptance threshold.' },
  ],
  confidence_recalibration: [
    { key: 'pattern_id',    label: 'Pattern',        kind: 'pattern' },
    { key: 'action',        label: 'Action',          kind: 'action' },
    { key: 'current_cvr',   label: 'Current CVR',     kind: 'number', step: 0.01, min: 0, max: 1,
      hint: 'CVR = Classifier Validation Rate — current correct-identification rate on the gold set. Range 0–1.' },
    { key: 'fleet_mean_cvr',label: 'Fleet Mean CVR',  kind: 'number', step: 0.01, min: 0, max: 1,
      hint: 'Average CVR across all 28 patterns — used as a baseline to judge whether this pattern is an outlier.' },
  ],
  shoot_mode_step_fix: [
    { key: 'pattern_id', label: 'Pattern', kind: 'pattern' },
    { key: 'action',     label: 'Action',  kind: 'action' },
  ],
  dataset_promotion: [
    { key: 'pattern_id', label: 'Pattern', kind: 'pattern' },
    { key: 'action',     label: 'Action',  kind: 'action' },
  ],
  signal_override: [
    { key: 'signal',             label: 'Signal',            kind: 'signal',
      hint: 'The computed pixel/geometry signal that triggers this override. Signals are extracted by the CV pipeline from each image.' },
    { key: 'condition',          label: 'Condition',         kind: 'text', placeholder: 'e.g. > 0.12 or between 9.5 and 11.5',
      hint: 'Numeric condition on the signal value. Use Python-style comparisons: > 0.12, < 0.5, between 9.5 and 11.5.' },
    { key: 'override',           label: 'Override → Pattern',kind: 'pattern',
      hint: 'When the condition is true, force the classifier to return this pattern instead of its normal output.' },
    { key: 'overrides',          label: 'Overrides (csv)',   kind: 'multi_pattern', placeholder: 'split, loop',
      hint: 'Comma-separated list of patterns that this signal should block — e.g. prevent "loop" when the signal is too high.' },
    { key: 'confidence_penalty', label: 'Confidence Penalty',kind: 'number', step: 0.01, min: 0, max: 1, placeholder: '0.15',
      hint: 'Amount subtracted from the pattern confidence score when the condition is met. Use to down-rank ambiguous detections.' },
  ],
  pattern_confusion: [
    { key: 'pattern_a',      label: 'Pattern A (being confused)',  kind: 'pattern',
      hint: 'The pattern the classifier is incorrectly identifying — the "real" pattern in the image.' },
    { key: 'pattern_b',      label: 'Pattern B (wrongly returned)', kind: 'pattern',
      hint: 'The pattern the classifier is returning instead — the wrong answer.' },
    { key: 'confusion_rate', label: 'Confusion Rate',        kind: 'number', step: 0.01, min: 0, max: 1, placeholder: '0.40',
      hint: 'Estimated fraction of pattern_a images that are mis-classified as pattern_b. 0.40 = wrong 40% of the time.' },
    { key: 'action',         label: 'Action',                kind: 'action' },
    { key: 'key_signals',    label: 'Key Disambiguating Signals (csv)', kind: 'text', placeholder: 'shadow_density, lr_asymmetry',
      hint: 'Signals that differ between pattern_a and pattern_b and could be used to separate them. Comma-separated.' },
  ],
  reference_correction: [
    { key: 'reference_id',   label: 'Reference ID (UUID)',  kind: 'text', placeholder: 'UUID from Reference Dataset',
      hint: 'Find this in the Reference Dataset tab — click an entry to copy its UUID.' },
    { key: 'current_label',  label: 'Current Label',        kind: 'pattern',
      hint: 'The pattern currently assigned to this reference image (the incorrect one).' },
    { key: 'correct_label',  label: 'Correct Label',        kind: 'pattern',
      hint: 'The pattern that should be assigned to this image.' },
    { key: 'action',         label: 'Action',               kind: 'action' },
  ],
  vlm_prompt_fix: [
    { key: 'pattern_id',           label: 'Affected Pattern',       kind: 'pattern',
      hint: 'The pattern whose VLM description or detection is being improved.' },
    { key: 'action',               label: 'Action',                 kind: 'action' },
    { key: 'current_instruction',  label: 'Current Instruction',    kind: 'text', placeholder: 'Quote the problematic instruction',
      hint: 'Copy the exact sentence or clause from the VLM system prompt that is producing wrong output.' },
    { key: 'suggested_instruction',label: 'Suggested Instruction',  kind: 'text', placeholder: 'Proposed replacement text',
      hint: 'The replacement text. Keep the same voice and format as the existing prompt.' },
  ],
  edge_case_handling: [
    { key: 'edge_case',          label: 'Edge Case',          kind: 'select',
      options: ['bw_photo','blown_highlights','no_face','multiple_subjects','extreme_backlight','low_key_face','mixed_lighting','heavy_grain','motion_blur','other'],
      hint: 'The input condition that causes the pipeline to fail or produce poor output.' },
    { key: 'affected_patterns',  label: 'Affected Patterns (csv)', kind: 'text', placeholder: 'rembrandt, loop',
      hint: 'Patterns whose detection is degraded by this edge case. Leave blank if all patterns are affected.' },
    { key: 'action',             label: 'Action',             kind: 'action' },
    { key: 'proposed_handling',  label: 'Proposed Handling',  kind: 'text', placeholder: 'e.g. Return low_signal instead of guessing',
      hint: 'What should the pipeline do when this condition is detected? E.g. lower confidence, skip pattern match, return a special code.' },
  ],
  new_pattern_proposal: [
    { key: 'proposed_name',    label: 'Proposed Pattern Name', kind: 'text', placeholder: 'e.g. halo_light',
      hint: 'Use snake_case. Should be descriptive and distinct from existing pattern names.' },
    { key: 'action',           label: 'Action',                kind: 'action' },
    { key: 'closest_existing', label: 'Closest Existing Pattern', kind: 'pattern',
      hint: 'The most similar pattern already in the taxonomy — helps reviewers understand the distinction.' },
    { key: 'key_signals',      label: 'Key Identifying Signals', kind: 'text', placeholder: 'catchlight_position > 11, triangle_isolation < 0.3',
      hint: 'Measurable CV signals that uniquely identify this pattern. Use the same signal names as the signal_override type.' },
    { key: 'example_count',    label: 'Example Images Available', kind: 'number', step: 1, min: 0, placeholder: '0',
      hint: 'Number of labeled example images you can provide. Proposals with 0 examples are hard to prototype.' },
  ],
  trust_safety: [
    { key: 'pattern_id', label: 'Pattern', kind: 'pattern' },
    { key: 'action',     label: 'Action',  kind: 'action' },
  ],
  needs_investigation: [
    { key: 'pattern_id', label: 'Pattern', kind: 'pattern' },
    { key: 'reason',     label: 'Reason',  kind: 'text', placeholder: 'e.g. benchmark_regression',
      hint: 'Brief description of what you observed. Include numbers if you have them — e.g. "CVR dropped from 0.82 to 0.61 after last deploy".' },
    { key: 'status',     label: 'Status',  kind: 'select',
      options: ['needs_investigation','deferred','acknowledged'],
      hint: 'needs_investigation = not yet looked at · deferred = low priority for now · acknowledged = seen, root cause unknown' },
  ],
};

/**
 * Schema-aware proposed_change editor.
 * Renders typed dropdowns for known fields; raw JSON escape hatch always available.
 */
function KvJsonEditor({ value = {}, onChange }) {
  const [rawMode,   setRawMode]   = useState(false);
  const [rawJson,   setRawJson]   = useState(() => JSON.stringify(value, null, 2));
  const [jsonError, setJsonError] = useState(null);

  const pcType    = value.type || '';
  const schema    = _PC_SCHEMA[pcType] || [];
  const schemaKeys = new Set(['type', ...schema.map(f => f.key)]);

  // Extra keys not in schema (from auto-generated candidates, _meta, etc.)
  const extraKeys = Object.keys(value).filter(k => !schemaKeys.has(k));

  function set(key, val) {
    onChange({ ...value, [key]: val });
  }
  function setType(t) {
    // Preserve pattern_id and notes when switching types
    const next = { type: t };
    if (value.pattern_id) next.pattern_id = value.pattern_id;
    if (value.notes) next.notes = value.notes;
    onChange(next);
  }

  function handleToggleRaw() {
    if (!rawMode) {
      setRawJson(JSON.stringify(value, null, 2));
      setJsonError(null);
    } else {
      try {
        const parsed = JSON.parse(rawJson);
        onChange(parsed);
        setJsonError(null);
      } catch {
        setJsonError('Fix JSON before switching to structured view');
        return;
      }
    }
    setRawMode(v => !v);
  }

  // Keep rawJson in sync when external value changes (e.g. parent reset)
  // but only when not actively editing raw mode
  const rawJsonRef = useRef(rawJson);
  if (!rawMode) rawJsonRef.current = JSON.stringify(value, null, 2);

  const _base = {
    background: 'var(--color-surface)', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)', padding: '4px 8px',
    fontSize: 12, color: 'var(--color-text)', outline: 'none',
    boxSizing: 'border-box', width: '100%',
  };
  const _label = {
    fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)',
    fontWeight: 600, marginBottom: 2, display: 'block',
  };
  const _hint = {
    fontSize: 10, color: 'var(--color-text-dim)', lineHeight: 1.4,
    marginTop: 2, display: 'block',
  };
  const _row = { display: 'grid', gap: 4, marginBottom: 6 };

  function renderField(f) {
    const v = value[f.key];
    const actions = _PC_ACTIONS[pcType] || [];

    if (f.kind === 'pattern') {
      return (
        <div key={f.key} style={_row}>
          <label style={_label}>{f.label}</label>
          <select value={v || ''} onChange={e => set(f.key, e.target.value)} style={_base}>
            <option value="">— select —</option>
            {_PC_PATTERNS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          {f.hint && <span style={_hint}>{f.hint}</span>}
        </div>
      );
    }
    if (f.kind === 'signal') {
      return (
        <div key={f.key} style={_row}>
          <label style={_label}>{f.label}</label>
          <select value={v || ''} onChange={e => set(f.key, e.target.value)} style={_base}>
            <option value="">— select —</option>
            {_PC_SIGNALS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {f.hint && <span style={_hint}>{f.hint}</span>}
        </div>
      );
    }
    if (f.kind === 'action') {
      return (
        <div key={f.key} style={_row}>
          <label style={_label}>{f.label}</label>
          <select value={v || ''} onChange={e => set(f.key, e.target.value)} style={_base}>
            <option value="">— select —</option>
            {actions.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          {f.hint && <span style={_hint}>{f.hint}</span>}
        </div>
      );
    }
    if (f.kind === 'select') {
      return (
        <div key={f.key} style={_row}>
          <label style={_label}>{f.label}</label>
          <select value={v || ''} onChange={e => set(f.key, e.target.value)} style={_base}>
            <option value="">— select —</option>
            {f.options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          {f.hint && <span style={_hint}>{f.hint}</span>}
        </div>
      );
    }
    if (f.kind === 'number') {
      return (
        <div key={f.key} style={_row}>
          <label style={_label}>{f.label}</label>
          <input
            type="number"
            value={v ?? ''}
            step={f.step}
            min={f.min}
            max={f.max}
            placeholder={f.placeholder}
            onChange={e => set(f.key, e.target.value === '' ? undefined : parseFloat(e.target.value))}
            style={_base}
          />
          {f.hint && <span style={_hint}>{f.hint}</span>}
        </div>
      );
    }
    if (f.kind === 'multi_pattern') {
      // stored as array, edited as csv string
      const csv = Array.isArray(v) ? v.join(', ') : (v || '');
      return (
        <div key={f.key} style={_row}>
          <label style={_label}>{f.label}</label>
          <input
            type="text"
            value={csv}
            placeholder={f.placeholder}
            onChange={e => {
              const arr = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
              set(f.key, arr.length ? arr : undefined);
            }}
            list={`pc-patterns-list`}
            style={_base}
          />
          {f.hint && <span style={_hint}>{f.hint}</span>}
        </div>
      );
    }
    // text
    return (
      <div key={f.key} style={_row}>
        <label style={_label}>{f.label}</label>
        <input
          type="text"
          value={v || ''}
          placeholder={f.placeholder}
          onChange={e => set(f.key, e.target.value || undefined)}
          style={_base}
        />
        {f.hint && <span style={_hint}>{f.hint}</span>}
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 4, marginTop: 4 }}>
      <datalist id="pc-patterns-list">
        {_PC_PATTERNS.map(p => <option key={p} value={p} />)}
      </datalist>

      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
          proposed_change
        </span>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={handleToggleRaw}
          style={{
            fontSize: 10, padding: '1px 7px',
            color: rawMode ? C.amber : 'var(--color-text-dim)',
            borderColor: rawMode ? '#FBBF2444' : 'transparent',
          }}
          title={rawMode ? 'Switch to structured editor' : 'Edit raw JSON'}
        >
          {rawMode ? '⊞ Structured' : '{ } Raw'}
        </button>
      </div>

      {rawMode ? (
        <>
          <textarea
            rows={10}
            value={rawJson}
            onChange={e => { setRawJson(e.target.value); setJsonError(null); }}
            onBlur={() => {
              try {
                const pretty = JSON.stringify(JSON.parse(rawJson), null, 2);
                setRawJson(pretty);
                onChange(JSON.parse(pretty));
                setJsonError(null);
              } catch {
                setJsonError('Invalid JSON');
              }
            }}
            spellCheck={false}
            style={{
              background: 'var(--color-surface)', border: `1px solid ${jsonError ? C.red : 'var(--color-border)'}`,
              borderRadius: 'var(--radius-sm)', padding: '6px 8px', width: '100%',
              fontFamily: 'var(--font-mono, monospace)', fontSize: 11,
              color: 'var(--color-text)', outline: 'none', resize: 'vertical', lineHeight: 1.6,
              boxSizing: 'border-box',
            }}
          />
          {jsonError && <div style={{ fontSize: 'var(--text-xs)', color: C.red }}>{jsonError}</div>}
        </>
      ) : (
        <div style={{
          background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-sm)', padding: '10px 12px',
        }}>
          {/* type selector — always first */}
          <div style={_row}>
            <label style={_label}>type</label>
            <select value={pcType} onChange={e => setType(e.target.value)} style={_base}>
              <option value="">— select type —</option>
              {_PC_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            {pcType && (() => {
              const td = _PC_TYPES.find(t => t.value === pcType);
              return td?.desc ? <span style={_hint}>{td.desc}</span> : null;
            })()}
          </div>

          {/* schema fields for selected type */}
          {schema.map(f => renderField(f))}

          {/* extra keys (auto-generated fields like _meta, delta, etc.) */}
          {extraKeys.length > 0 && (
            <div style={{ borderTop: '1px solid var(--color-border)', marginTop: 6, paddingTop: 6 }}>
              <div style={{ fontSize: 9, color: 'var(--color-text-dim)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Additional fields
              </div>
              {extraKeys.map(k => (
                <div key={k} style={_row}>
                  <label style={{ ..._label, color: C.amber }}>{k}</label>
                  <input
                    type="text"
                    value={typeof value[k] === 'object' ? JSON.stringify(value[k]) : String(value[k] ?? '')}
                    onChange={e => {
                      let parsed;
                      try { parsed = JSON.parse(e.target.value); } catch { parsed = e.target.value; }
                      set(k, parsed);
                    }}
                    style={_base}
                  />
                </div>
              ))}
            </div>
          )}

          {/* notes — optional free-text for all types */}
          <div style={{ borderTop: '1px solid var(--color-border)', marginTop: 6, paddingTop: 6 }}>
            <label style={_label}>notes (optional)</label>
            <input
              type="text"
              value={value.notes || ''}
              onChange={e => set('notes', e.target.value || undefined)}
              placeholder="Additional context for reviewers"
              style={_base}
            />
          </div>

          {/* JSON preview */}
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 9, color: 'var(--color-text-dim)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              JSON preview
            </div>
            <pre style={{
              background: 'rgba(0,0,0,0.2)', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)', padding: '6px 8px',
              fontFamily: 'var(--font-mono, monospace)', fontSize: 10,
              color: 'var(--color-text-secondary)', margin: 0,
              maxHeight: 110, overflowY: 'auto', lineHeight: 1.5,
            }}>
              {JSON.stringify(value, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

/** Candidate detail view with inline edit mode */
function CandidateDetailView({ selected, onBack, onStatusChange, onDelete, onUpdated }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editRationale, setEditRationale] = useState('');
  const [editChange, setEditChange] = useState({});
  const [evalResult, setEvalResult] = useState(null);
  const [evaluations, setEvaluations] = useState(null);
  const [pipelineAction, setPipelineAction] = useState(null); // 'evaluating'|'applying'|null
  const [pipelineMsg, setPipelineMsg] = useState(null); // {ok, msg}

  function startEdit() {
    setEditTitle(selected.title || '');
    setEditDesc(selected.description || '');
    setEditRationale(selected.rationale || '');
    setEditChange(selected.proposed_change || {});
    setEditing(true);
  }

  async function handleEvaluate() {
    setPipelineAction('evaluating');
    setPipelineMsg(null);
    try {
      const res = await evaluateCandidate(selected.id, { auto_release_on_safe: false });
      setEvalResult(res);
      const evals = await getCandidateEvaluations(selected.id);
      setEvaluations(evals);
      setPipelineMsg({ ok: true, msg: `Evaluation complete — risk: ${res.risk_tier || '?'}, score: ${res.accuracy_score != null ? res.accuracy_score.toFixed(2) : '?'}` });
    } catch (e) {
      setPipelineMsg({ ok: false, msg: e.message });
    } finally {
      setPipelineAction(null);
    }
  }

  async function handleApply() {
    if (!confirm('Apply this candidate to the live ruleset? This will update pattern weights and trigger a monitoring window.')) return;
    setPipelineAction('applying');
    setPipelineMsg(null);
    try {
      await applyCandidate(selected.id, 'Applied via Candidates tab');
      await onStatusChange(selected.id, 'implemented');
      setPipelineMsg({ ok: true, msg: 'Candidate applied to live ruleset. Check Monitoring in Learning Ops.' });
    } catch (e) {
      setPipelineMsg({ ok: false, msg: e.message });
    } finally {
      setPipelineAction(null);
    }
  }

  async function loadEvaluations() {
    try {
      const evals = await getCandidateEvaluations(selected.id);
      setEvaluations(evals);
    } catch { /* silent */ }
  }

  // Load evaluations on mount if candidate has been evaluated
  useEffect(() => {
    if (selected.status === 'accepted' || selected.status === 'implemented') {
      loadEvaluations();
    }
  }, [selected.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function cancelEdit() {
    setEditing(false);
  }

  async function saveEdit() {
    setSaving(true);
    try {
      const updated = await updateCandidate(selected.id, {
        title: editTitle,
        description: editDesc,
        rationale: editRationale || undefined,
        proposed_change: editChange,
      });
      setEditing(false);
      onUpdated(updated);
    } catch (err) {
      setJsonErr(err.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="lab-detail">
      <button className="btn btn--ghost btn--sm" onClick={onBack}>
        {'\u2190'} Back to list
      </button>

      <div className="lab-detail__header">
        {editing ? (
          <input
            className="lab-form__input"
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
            placeholder="Candidate title"
            style={{ flex: 1 }}
          />
        ) : (
          <h4 style={{ flex: 1 }}>{selected.title}</h4>
        )}
        <StatusBadge status={selected.status} />
        {!editing && (
          <button className="btn btn--ghost btn--sm" onClick={startEdit} title="Edit candidate">
            ✎ Edit
          </button>
        )}
      </div>

      {/* Source image — shown when candidate was generated from a workbench analysis */}
      {selected.source_image_path && (() => {
        const p = selected.source_image_path.replace(/\\/g, '/');
        // Uploads path: static/uploads/lab_*.jpg → serve as /static/uploads/...
        const imgUrl = p.startsWith('static/')
          ? `/${p}`
          : p.startsWith('data/reference_dataset/')
            ? (() => {
                const parts = p.split('/');
                return parts.length >= 5 ? getReferenceThumbnailUrl(parts[2], parts[3]) : null;
              })()
            : null;
        if (!imgUrl) return null;
        return (
          <div style={{ marginBottom: 12 }}>
            <div className="lab-detail__label" style={{ marginBottom: 6 }}>Source Image</div>
            <img
              src={imgUrl}
              alt="Source image for this rule candidate"
              style={{
                width: '100%', maxHeight: 260, objectFit: 'cover',
                borderRadius: 6, border: '1px solid var(--color-border)', display: 'block',
              }}
              onError={e => { e.target.style.display = 'none'; }}
            />
            <div style={{ fontSize: 10, color: 'var(--color-text-dim)',
              fontFamily: 'var(--font-mono)', marginTop: 4 }}>{p}</div>
          </div>
        );
      })()}

      <div className="lab-detail__field">
        <span className="lab-detail__label">ID</span>
        <span className="lab-detail__value lab-detail__value--mono">{selected.id}</span>
      </div>

      <div className="lab-detail__field">
        <span className="lab-detail__label">Description</span>
        {editing ? (
          <textarea
            className="lab-form__textarea"
            value={editDesc}
            onChange={e => setEditDesc(e.target.value)}
            rows={4}
          />
        ) : (
          <span className="lab-detail__value">{selected.description}</span>
        )}
      </div>

      <div className="lab-detail__field">
        <span className="lab-detail__label">Rationale</span>
        {editing ? (
          <textarea
            className="lab-form__textarea"
            value={editRationale}
            onChange={e => setEditRationale(e.target.value)}
            rows={3}
            placeholder="Why this change? (optional)"
          />
        ) : (
          <span className="lab-detail__value">{selected.rationale || '—'}</span>
        )}
      </div>

      {selected.source_gold_set_id && (
        <div className="lab-detail__field">
          <span className="lab-detail__label">Source Gold Set</span>
          <span className="lab-detail__value lab-detail__value--mono">{selected.source_gold_set_id}</span>
        </div>
      )}

      <div className="lab-detail__field">
        <span className="lab-detail__label">Proposed Change</span>
        {editing ? (
          <KvJsonEditor value={editChange} onChange={setEditChange} />
        ) : (
          <JsonTree data={selected.proposed_change} />
        )}
      </div>

      {selected.created_at && (
        <div className="lab-detail__field">
          <span className="lab-detail__label">Created</span>
          <span className="lab-detail__value">{new Date(selected.created_at * 1000).toLocaleString(undefined, { timeZone: _TZ })}</span>
        </div>
      )}

      {/* Edit save / cancel */}
      {editing && (
        <div className="lab-detail__controls">
          <button className="btn btn--primary btn--sm" onClick={saveEdit} disabled={saving}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
          <button className="btn btn--ghost btn--sm" onClick={cancelEdit} disabled={saving}>
            Cancel
          </button>
        </div>
      )}

      {/* Pipeline message */}
      {pipelineMsg && (
        <div style={{
          padding: 'var(--space-xs) var(--space-sm)', marginTop: 'var(--space-sm)',
          borderRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)',
          background: pipelineMsg.ok ? 'color-mix(in srgb, #34D399 12%, transparent)' : 'color-mix(in srgb, #F87171 12%, transparent)',
          border: `1px solid ${pipelineMsg.ok ? '#34D39944' : '#F8717144'}`,
          color: pipelineMsg.ok ? C.green : C.red,
        }}>
          {pipelineMsg.ok ? '✓' : '⚠'} {pipelineMsg.msg}
        </div>
      )}

      {/* Evaluation results */}
      {evalResult && (
        <div style={{
          marginTop: 'var(--space-sm)',
          padding: 'var(--space-sm)',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          fontSize: 'var(--text-xs)',
        }}>
          <div style={{ fontWeight: 600, marginBottom: 'var(--space-xs)', color: 'var(--color-text)' }}>Evaluation Result</div>
          <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
            {evalResult.risk_tier && (
              <div>
                <span style={{ color: 'var(--color-text-secondary)' }}>Risk: </span>
                <span style={{
                  fontWeight: 700, fontFamily: 'var(--font-mono)',
                  color: evalResult.risk_tier === 'LOW' ? C.green : evalResult.risk_tier === 'HIGH' ? C.red : '#FCD34D',
                }}>{evalResult.risk_tier}</span>
              </div>
            )}
            {evalResult.accuracy_score != null && (
              <div>
                <span style={{ color: 'var(--color-text-secondary)' }}>Score: </span>
                <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{evalResult.accuracy_score.toFixed(3)}</span>
              </div>
            )}
            {evalResult.approved != null && (
              <div>
                <span style={{ color: 'var(--color-text-secondary)' }}>Gate: </span>
                <span style={{ color: evalResult.approved ? C.green : C.red, fontWeight: 600 }}>
                  {evalResult.approved ? '✓ Approved' : '✗ Blocked'}
                </span>
              </div>
            )}
          </div>
          {evalResult.notes && (
            <div style={{ marginTop: 'var(--space-xs)', color: 'var(--color-text-secondary)' }}>{evalResult.notes}</div>
          )}
        </div>
      )}

      {/* Status workflow controls — hidden while editing */}
      {!editing && (
        <div className="lab-detail__controls" style={{ flexWrap: 'wrap', gap: 'var(--space-xs)' }}>
          {/* Learning pipeline actions */}
          {(selected.status === 'proposed' || selected.status === 'accepted') && (
            <button
              className="btn btn--primary btn--sm"
              onClick={handleEvaluate}
              disabled={pipelineAction !== null}
            >
              {pipelineAction === 'evaluating' ? 'Evaluating…' : '▶ Evaluate'}
            </button>
          )}
          {selected.status === 'accepted' && evalResult?.approved && (
            <button
              className="btn btn--primary btn--sm"
              onClick={handleApply}
              disabled={pipelineAction !== null}
              style={{ background: '#059669', borderColor: '#059669' }}
            >
              {pipelineAction === 'applying' ? 'Applying…' : '⬆ Apply to Ruleset'}
            </button>
          )}

          {/* Simple status transitions */}
          {selected.status === 'proposed' && (
            <>
              <button className="btn btn--ghost btn--sm" onClick={() => onStatusChange(selected.id, 'accepted')}>
                Accept
              </button>
              <button className="btn btn--ghost btn--sm" onClick={() => onStatusChange(selected.id, 'rejected')}>
                Reject
              </button>
            </>
          )}
          {selected.status === 'rejected' && (
            <button className="btn btn--ghost btn--sm" onClick={() => onStatusChange(selected.id, 'proposed')}>
              Reopen
            </button>
          )}
          <button className="btn btn--ghost btn--sm" style={{ color: 'var(--color-error)' }} onClick={() => onDelete(selected.id)}>
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

/** Candidate create form */
function CandidateForm({ onSave, onCancel, prefill }) {
  const [title, setTitle] = useState(prefill?.title || '');
  const [description, setDescription] = useState(prefill?.description || '');
  const [rationale, setRationale] = useState(prefill?.rationale || '');
  const [sourceGoldSetId, setSourceGoldSetId] = useState('');
  const [proposedChange, setProposedChange] = useState(prefill?.proposed_change || {});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const imagePreview = prefill?.imagePreview || null;
  const sourceImagePath = prefill?.source_image_path || null;

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave({
        title,
        description,
        rationale: rationale || undefined,
        source_gold_set_id: sourceGoldSetId || undefined,
        source_image_path: sourceImagePath || undefined,
        proposed_change: proposedChange,
        status: 'proposed',
      });
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <form className="lab-form" onSubmit={handleSubmit}>
      <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel}>
        {'\u2190'} Cancel
      </button>
      <h4 className="lab-form__title">New Rule Candidate</h4>

      {/* Source image — shown when the candidate was generated from a workbench analysis */}
      {imagePreview && (
        <div style={{ marginBottom: 16 }}>
          <div className="lab-form__label" style={{ marginBottom: 6 }}>Source Image</div>
          <img
            src={imagePreview}
            alt="Source image for this rule candidate"
            style={{
              width: '100%', maxHeight: 240, objectFit: 'cover',
              borderRadius: 6, border: '1px solid var(--color-border)',
              display: 'block',
            }}
          />
          {sourceImagePath && (
            <div style={{ fontSize: 10, color: 'var(--color-text-dim)',
              fontFamily: 'var(--font-mono)', marginTop: 4 }}>
              {sourceImagePath}
            </div>
          )}
        </div>
      )}

      {error && <div className="lab-form__error">{error}</div>}

      <label className="lab-form__label">
        Title
        <input
          className="lab-form__input"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="[pattern_id] action — brief context"
          required
        />
        <span className="lab-form__hint">
          Format: <code>[pattern_id] action — brief context</code>
          {' · '}e.g. <code>[rembrandt] Raise threshold — studio portrait edge case</code>
        </span>
      </label>

      <label className="lab-form__label">
        Description
        <textarea
          className="lab-form__textarea"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="What does this rule change do?"
          rows={3}
          required
        />
        <span className="lab-form__hint">
          One or two sentences summarising what this rule changes — shown in the candidate list and detail view.
        </span>
      </label>

      <label className="lab-form__label">
        Rationale
        <textarea
          className="lab-form__textarea"
          value={rationale}
          onChange={e => setRationale(e.target.value)}
          placeholder="Why is this change needed?"
          rows={2}
        />
        <span className="lab-form__hint">
          Evidence for the change: benchmark data, observed failure rate, session count, or a specific photo example.
          Optional but highly recommended — candidates without rationale are harder to review.
        </span>
      </label>

      <label className="lab-form__label">
        Source Gold Set ID (optional)
        <input
          className="lab-form__input"
          value={sourceGoldSetId}
          onChange={e => setSourceGoldSetId(e.target.value)}
          placeholder="UUID of related gold set entry"
        />
        <span className="lab-form__hint">
          If this candidate was triggered by a specific gold set image, paste its UUID here.
          Find UUIDs in the Gold Set tab — click an entry to see its ID.
        </span>
      </label>

      <div className="lab-form__label">Proposed Change</div>
      <KvJsonEditor value={proposedChange} onChange={setProposedChange} />

      <button className="btn btn--primary" type="submit" disabled={saving || !title || !description}>
        {saving ? 'Saving\u2026' : 'Create Candidate'}
      </button>
    </form>
  );
}


/* ═══════════════════════════════════════════════════════════
   Reference Dataset Tab — image-backed references with pipeline signals
   ═══════════════════════════════════════════════════════════ */

const REF_STATUS_FILTERS = ['all', 'draft', 'approved', 'rejected'];
const REF_TIER_FILTERS = ['all', 'gold', 'community', 'synthetic'];

// Known pattern IDs for the import form dropdown
const KNOWN_PATTERNS = [
  'rembrandt', 'clamshell', 'loop', 'split', 'butterfly', 'broad', 'short',
  'rim_only', 'high_key', 'low_key', 'flat_fashion', 'window_portrait',
  'golden_hour', 'overcast_natural', 'ring_light', 'bare_bulb_editorial',
  'strip_dramatic', 'short_fashion_key', 'soft_editorial_key',
  'window_soft_side', 'window_negative_fill', 'athletic_rim_sculpt',
  'bottle_backlight', 'tabletop_soft_product', 'editorial_rim_key',
];

function ReferenceDatasetTab() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [tierFilter, setTierFilter] = useState('all');
  const [view, setView] = useState('list'); // list | import | detail
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [selectedDetail, setSelectedDetail] = useState(null);
  const [selectedIndex, setSelectedIndex] = useState(null);
  const [reprocessing, setReprocessing] = useState(false);
  const [editingMeta, setEditingMeta] = useState(false);
  const [editFields, setEditFields] = useState({});
  const [saveError, setSaveError] = useState(null);
  const [saving, setSaving] = useState(false);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listReferenceDataset({
        status: statusFilter === 'all' ? null : statusFilter,
        tier: tierFilter === 'all' ? null : tierFilter,
      });
      setEntries(data.entries || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, tierFilter]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  async function handleSelectEntry(entry, index) {
    setSelectedEntry(entry);
    setSelectedDetail(null);
    setSelectedIndex(index ?? entries.indexOf(entry));
    setView('detail');
    try {
      const detail = await getReferenceEntry(entry.pattern_id, entry.reference_id);
      setSelectedDetail(detail);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleNavigate(delta) {
    const nextIndex = selectedIndex + delta;
    if (nextIndex < 0 || nextIndex >= entries.length) return;
    await handleSelectEntry(entries[nextIndex], nextIndex);
  }

  async function handleApprove(patternId, refId) {
    try {
      await approveReference(patternId, refId);
      fetchEntries();
      // Refresh detail
      const detail = await getReferenceEntry(patternId, refId);
      setSelectedDetail(detail);
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleReject(patternId, refId) {
    const reason = prompt('Rejection reason (optional):');
    if (reason === null) return;
    try {
      await rejectReference(patternId, refId, reason);
      fetchEntries();
      const detail = await getReferenceEntry(patternId, refId);
      setSelectedDetail(detail);
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleReprocess(patternId, refId) {
    setReprocessing(true);
    try {
      await reprocessReference(patternId, refId);
      const detail = await getReferenceEntry(patternId, refId);
      setSelectedDetail(detail);
      fetchEntries();
    } catch (err) {
      alert(err.message);
    } finally {
      setReprocessing(false);
    }
  }

  function handleStartEdit(meta) {
    setEditFields({
      photographer: meta.photographer || '',
      title: meta.title || '',
      dataset_tier: meta.dataset_tier || 'community',
      entry_trust_score: meta.entry_trust_score ?? 0.5,
      source_type: meta.source_type || '',
      source_url: meta.source_url || '',
      environment: meta.environment || '',
      light_count: meta.light_count ?? '',
      key_direction_deg: meta.key_direction_deg ?? '',
      key_height_relative: meta.key_height_relative || '',
      shadow_pattern: meta.shadow_pattern || '',
      modifier_family: meta.modifier_family || '',
      estimated_distance_ft: meta.estimated_distance_ft ?? '',
      notes: meta.notes || '',
      tags: (meta.tags || []).join(', '),
      style_family: meta.style_family || '',
      catchlight_pattern: meta.catchlight_pattern || '',
      underfill_ev: meta.underfill_ev ?? '',
      separation_light_type: meta.separation_light_type || '',
      light_technology: meta.light_technology || '',
      master_profile_id: meta.master_profile_id || '',
    });
    setSaveError(null);
    setEditingMeta(true);
  }

  async function handleSaveMeta(patternId, refId) {
    setSaving(true);
    setSaveError(null);
    // Build update payload — only non-empty strings / valid numbers
    const raw = editFields;
    const updates = {};
    const strFields = ['photographer', 'title', 'source_url', 'shadow_pattern', 'modifier_family', 'notes', 'master_profile_id'];
    strFields.forEach(f => { if (raw[f] !== '') updates[f] = raw[f]; });
    const enumFields = ['dataset_tier', 'source_type', 'environment', 'key_height_relative', 'style_family', 'catchlight_pattern', 'separation_light_type', 'light_technology'];
    enumFields.forEach(f => { if (raw[f] !== '') updates[f] = raw[f]; });
    const numFields = ['entry_trust_score', 'key_direction_deg', 'estimated_distance_ft', 'underfill_ev'];
    numFields.forEach(f => { if (raw[f] !== '') { const n = Number(raw[f]); if (!isNaN(n)) updates[f] = n; } });
    if (raw.light_count !== '') { const n = parseInt(raw.light_count, 10); if (!isNaN(n)) updates.light_count = n; }
    if (raw.tags !== '') updates.tags = raw.tags.split(',').map(t => t.trim()).filter(Boolean);
    try {
      const res = await updateReferenceMetadata(patternId, refId, updates);
      setSelectedDetail(prev => prev ? { ...prev, metadata: res.metadata } : prev);
      setSelectedEntry(prev => prev ? { ...prev, metadata: res.metadata } : prev);
      setEditingMeta(false);
      fetchEntries();
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // ── Import View ──
  if (view === 'import') {
    return (
      <RefDatasetImportForm
        onComplete={() => { setView('list'); fetchEntries(); }}
        onCancel={() => setView('list')}
      />
    );
  }

  // ── Detail View ──
  if (view === 'detail' && selectedEntry) {
    const meta = selectedDetail?.metadata || selectedEntry.metadata || {};
    const patternId = selectedEntry.pattern_id;
    const refId = selectedEntry.reference_id;

    return (
      <div className="lab-detail">
        <div className="lab-detail__nav">
          <button className="btn btn--ghost btn--sm" onClick={() => { setView('list'); setSelectedEntry(null); setSelectedDetail(null); }}>
            {'\u2190'} List
          </button>
          <div className="lab-detail__nav-pager">
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => handleNavigate(-1)}
              disabled={selectedIndex <= 0}
              aria-label="Previous image"
            >
              {'\u2190'}
            </button>
            <span className="lab-detail__nav-count">
              {selectedIndex + 1} / {entries.length}
            </span>
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => handleNavigate(1)}
              disabled={selectedIndex >= entries.length - 1}
              aria-label="Next image"
            >
              {'\u2192'}
            </button>
          </div>
        </div>

        <div className="lab-detail__header">
          <h4>{meta.reference_id || refId}</h4>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
            <StatusBadge status={meta.approval_status || 'draft'} />
            {!editingMeta && (
              <button className="btn btn--ghost btn--sm" onClick={() => handleStartEdit(meta)}>
                ✎ Edit
              </button>
            )}
          </div>
        </div>

        {/* Image + overlay toggle */}
        <RefDetailImage patternId={patternId} referenceId={refId} hasOverlay={selectedDetail?.has_debug_overlay} />

        {/* Metadata — read or edit */}
        <div className="lab-section">
          <h4 className="lab-section__title">Metadata</h4>

          {editingMeta ? (
            <div className="ref-meta-edit">
              {saveError && <p className="lab-form__error">{saveError}</p>}

              <div className="ref-meta-edit__grid">
                {/* Free-text fields */}
                <label className="ref-meta-edit__label">Photographer
                  <input className="lab-form__input" value={editFields.photographer} onChange={e => setEditFields(p => ({ ...p, photographer: e.target.value }))} />
                </label>
                <label className="ref-meta-edit__label">Title
                  <input className="lab-form__input" value={editFields.title} onChange={e => setEditFields(p => ({ ...p, title: e.target.value }))} />
                </label>

                {/* Enum fields — dropdowns prevent invalid values */}
                <label className="ref-meta-edit__label">Tier
                  <select className="lab-form__select" value={editFields.dataset_tier} onChange={e => setEditFields(p => ({ ...p, dataset_tier: e.target.value }))}>
                    {['gold','community','synthetic'].map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </label>
                <label className="ref-meta-edit__label">Environment
                  <select className="lab-form__select" value={editFields.environment} onChange={e => setEditFields(p => ({ ...p, environment: e.target.value }))}>
                    <option value="">— none —</option>
                    {['studio','natural','window_light','outdoor','mixed','unknown'].map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </label>
                <label className="ref-meta-edit__label">Source Type
                  <select className="lab-form__select" value={editFields.source_type} onChange={e => setEditFields(p => ({ ...p, source_type: e.target.value }))}>
                    <option value="">— none —</option>
                    {['original_photo','screenshot','studio_test','found_online','book_scan','ai_generated'].map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </label>
                <label className="ref-meta-edit__label">Key Height
                  <select className="lab-form__select" value={editFields.key_height_relative} onChange={e => setEditFields(p => ({ ...p, key_height_relative: e.target.value }))}>
                    <option value="">— none —</option>
                    {['below_eye_level','eye_level','above_eye_level','high','overhead'].map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </label>
                <label className="ref-meta-edit__label">Style Family
                  <select className="lab-form__select" value={editFields.style_family} onChange={e => setEditFields(p => ({ ...p, style_family: e.target.value }))}>
                    <option value="">— none —</option>
                    {['beauty','editorial','dramatic','natural','high_key','low_key'].map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </label>
                <label className="ref-meta-edit__label">Catchlight Pattern
                  <select className="lab-form__select" value={editFields.catchlight_pattern} onChange={e => setEditFields(p => ({ ...p, catchlight_pattern: e.target.value }))}>
                    <option value="">— none —</option>
                    {['single','dual','triangular','strip','ring'].map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </label>
                <label className="ref-meta-edit__label">Separation Light
                  <select className="lab-form__select" value={editFields.separation_light_type} onChange={e => setEditFields(p => ({ ...p, separation_light_type: e.target.value }))}>
                    <option value="">— none —</option>
                    {['hair','rim','kicker','none'].map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </label>
                <label className="ref-meta-edit__label">Light Technology
                  <select className="lab-form__select" value={editFields.light_technology} onChange={e => setEditFields(p => ({ ...p, light_technology: e.target.value }))}>
                    <option value="">— none —</option>
                    {['continuous_led','continuous_panel','strobe','flash','mixed'].map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </label>

                {/* Numeric fields */}
                <label className="ref-meta-edit__label">Trust Score (0–1)
                  <input className="lab-form__input" type="number" min="0" max="1" step="0.05" value={editFields.entry_trust_score} onChange={e => setEditFields(p => ({ ...p, entry_trust_score: e.target.value }))} />
                </label>
                <label className="ref-meta-edit__label">Light Count
                  <input className="lab-form__input" type="number" min="0" step="1" value={editFields.light_count} onChange={e => setEditFields(p => ({ ...p, light_count: e.target.value }))} />
                </label>
                <label className="ref-meta-edit__label">Key Direction (deg)
                  <input className="lab-form__input" type="number" min="0" max="360" value={editFields.key_direction_deg} onChange={e => setEditFields(p => ({ ...p, key_direction_deg: e.target.value }))} />
                </label>
                <label className="ref-meta-edit__label">Distance (ft)
                  <input className="lab-form__input" type="number" min="0" step="0.5" value={editFields.estimated_distance_ft} onChange={e => setEditFields(p => ({ ...p, estimated_distance_ft: e.target.value }))} />
                </label>
                <label className="ref-meta-edit__label">Underfill EV
                  <input className="lab-form__input" type="number" step="0.25" value={editFields.underfill_ev} onChange={e => setEditFields(p => ({ ...p, underfill_ev: e.target.value }))} />
                </label>

                {/* Remaining free-text */}
                <label className="ref-meta-edit__label">Shadow Pattern
                  <input className="lab-form__input" value={editFields.shadow_pattern} onChange={e => setEditFields(p => ({ ...p, shadow_pattern: e.target.value }))} />
                </label>
                <label className="ref-meta-edit__label">Modifier Family
                  <input className="lab-form__input" value={editFields.modifier_family} onChange={e => setEditFields(p => ({ ...p, modifier_family: e.target.value }))} />
                </label>
                <label className="ref-meta-edit__label">Master Profile ID
                  <input className="lab-form__input" value={editFields.master_profile_id} onChange={e => setEditFields(p => ({ ...p, master_profile_id: e.target.value }))} />
                </label>
                <label className="ref-meta-edit__label">Source URL
                  <input className="lab-form__input" value={editFields.source_url} onChange={e => setEditFields(p => ({ ...p, source_url: e.target.value }))} />
                </label>
                <label className="ref-meta-edit__label ref-meta-edit__label--full">Tags (comma-separated)
                  <input className="lab-form__input" value={editFields.tags} onChange={e => setEditFields(p => ({ ...p, tags: e.target.value }))} placeholder="e.g. dramatic, low-key, editorial" />
                </label>
                <label className="ref-meta-edit__label ref-meta-edit__label--full">Notes
                  <textarea className="lab-form__textarea" rows={3} value={editFields.notes} onChange={e => setEditFields(p => ({ ...p, notes: e.target.value }))} />
                </label>
              </div>

              <div className="ref-meta-edit__actions">
                <button className="btn btn--primary btn--sm" onClick={() => handleSaveMeta(patternId, refId)} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button className="btn btn--ghost btn--sm" onClick={() => { setEditingMeta(false); setSaveError(null); }} disabled={saving}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="lab-section__grid">
              <AnalysisRow label="Pattern" value={meta.pattern_id} />
              <AnalysisRow label="Photographer" value={meta.photographer} />
              <AnalysisRow label="Tier" value={meta.dataset_tier} />
              <AnalysisRow label="Trust Score" value={meta.entry_trust_score} />
              {meta.title && <AnalysisRow label="Title" value={meta.title} />}
              {meta.environment && <AnalysisRow label="Environment" value={meta.environment} />}
              {meta.light_count != null && <AnalysisRow label="Light Count" value={meta.light_count} />}
              {meta.key_direction_deg != null && <AnalysisRow label="Key Direction" value={`${meta.key_direction_deg}\u00B0`} />}
              {meta.key_height_relative && <AnalysisRow label="Key Height" value={meta.key_height_relative} />}
              {meta.modifier_family && <AnalysisRow label="Modifier" value={meta.modifier_family} />}
              {meta.shadow_pattern && <AnalysisRow label="Shadow Pattern" value={meta.shadow_pattern} />}
              {meta.style_family && <AnalysisRow label="Style Family" value={meta.style_family} />}
              {meta.catchlight_pattern && <AnalysisRow label="Catchlight" value={meta.catchlight_pattern} />}
              {meta.separation_light_type && <AnalysisRow label="Separation Light" value={meta.separation_light_type} />}
              {meta.light_technology && <AnalysisRow label="Technology" value={meta.light_technology} />}
              {meta.underfill_ev != null && <AnalysisRow label="Underfill EV" value={meta.underfill_ev} />}
              {meta.master_profile_id && <AnalysisRow label="Master Profile" value={meta.master_profile_id} />}
              {meta.source_type && <AnalysisRow label="Source Type" value={meta.source_type} />}
              {meta.notes && <AnalysisRow label="Notes" value={meta.notes} />}
              {meta.tags?.length > 0 && <AnalysisRow label="Tags" value={meta.tags.join(', ')} />}
              {meta.ingested_at && <AnalysisRow label="Ingested" value={new Date(meta.ingested_at).toLocaleString(undefined, { timeZone: _TZ })} />}
              {meta.approved_by && <AnalysisRow label="Approved By" value={meta.approved_by} />}
            </div>
          )}
        </div>

        {/* Loading indicator while detail fetches */}
        {!selectedDetail && (
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', textAlign: 'center', padding: 'var(--space-md)' }}>
            Loading analysis{'\u2026'}
          </p>
        )}

        {/* Reference Analysis (collapsible, open by default) */}
        {selectedDetail?.reference_analysis && (
          <RefCollapsibleJson title="Reference Analysis" data={selectedDetail.reference_analysis} defaultOpen />
        )}

        {/* Pipeline Signals (collapsible) */}
        {selectedDetail?.signals && (
          <RefCollapsibleJson title="Pipeline Signals" data={selectedDetail.signals} />
        )}

        {/* VLM Reconstruction (collapsible) */}
        {selectedDetail?.vlm_reconstruction && (
          <RefCollapsibleJson title="VLM Reconstruction" data={selectedDetail.vlm_reconstruction} />
        )}

        {/* Actions */}
        <div className="lab-detail__controls">
          {meta.approval_status !== 'approved' && (
            <button className="btn btn--primary btn--sm" onClick={() => handleApprove(patternId, refId)}>
              Approve
            </button>
          )}
          {meta.approval_status !== 'rejected' && (
            <button className="btn btn--ghost btn--sm" onClick={() => handleReject(patternId, refId)}>
              Reject
            </button>
          )}
          <button className="btn btn--ghost btn--sm" onClick={() => handleReprocess(patternId, refId)} disabled={reprocessing}>
            {reprocessing ? 'Reprocessing\u2026' : 'Reprocess'}
          </button>
        </div>
      </div>
    );
  }

  // ── List View ──
  return (
    <div className="lab-list">
      {/* Toolbar */}
      <div className="lab-list__toolbar">
        <div className="lab-list__filters">
          {REF_STATUS_FILTERS.map(s => (
            <button
              key={s}
              className={`lab-tab${statusFilter === s ? ' lab-tab--active' : ''}`}
              onClick={() => setStatusFilter(s)}
            >
              {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
          <span style={{ width: 1, background: 'var(--color-border)', margin: '0 var(--space-xs)' }} />
          {REF_TIER_FILTERS.map(t => (
            <button
              key={t}
              className={`lab-tab${tierFilter === t ? ' lab-tab--active' : ''}`}
              onClick={() => setTierFilter(t)}
            >
              {t === 'all' ? 'All Tiers' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <button className="btn btn--primary btn--sm" onClick={() => setView('import')}>
          + Import
        </button>
      </div>

      {/* Loading / Error */}
      {loading && <p className="lab-list__status">Loading entries{'\u2026'}</p>}
      {error && <p className="lab-list__status lab-list__status--error">{error}</p>}

      {/* Empty state */}
      {!loading && !error && entries.length === 0 && (
        <div className="lab-content__placeholder">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5, marginBottom: 'var(--space-md)' }}>
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          <h3>No References</h3>
          <p>Import your first reference image to build the dataset.</p>
        </div>
      )}

      {/* Entry cards (thumbnail grid) */}
      {!loading && entries.length > 0 && (
        <div className="ref-grid">
          {entries.map((entry, i) => {
            const meta = entry.metadata || {};
            return (
              <button
                key={`${entry.pattern_id}/${entry.reference_id}-${i}`}
                className="ref-grid__card"
                onClick={() => handleSelectEntry(entry, i)}
              >
                {entry.has_thumbnail ? (
                  <AuthImage
                    path={`/reference-dataset/${entry.pattern_id}/${entry.reference_id}/thumbnail`}
                    alt={entry.reference_id}
                    className="ref-grid__thumb"
                  />
                ) : (
                  <div className="ref-grid__thumb ref-grid__thumb--empty">
                    <span>No image</span>
                  </div>
                )}
                <div className="ref-grid__info">
                  <span className="ref-grid__id">{entry.reference_id}</span>
                  <span className="ref-grid__meta">
                    {meta.photographer || 'Unknown'}
                    {' \u2022 '}
                    {entry.pattern_id}
                  </span>
                  <div className="ref-grid__badges">
                    <StatusBadge status={meta.approval_status || 'draft'} />
                    {entry.has_signals && <span className="ref-grid__badge ref-grid__badge--signals">Signals</span>}
                    {entry.has_vlm_reconstruction && <span className="ref-grid__badge ref-grid__badge--vlm">VLM</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}


/** Reference Dataset import form */
function RefDatasetImportForm({ onComplete, onCancel }) {
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [refId, setRefId] = useState('');
  const [patternId, setPatternId] = useState('rembrandt');
  const [photographer, setPhotographer] = useState('');
  const [tier, setTier] = useState('community');
  const [environment, setEnvironment] = useState('');
  const [notes, setNotes] = useState('');
  const [ingesting, setIngesting] = useState(false);
  const [dropzoneActive, setDropzoneActive] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState(null);

  function applyRefFile(f) {
    if (!f || !f.type.startsWith('image/')) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result);
    reader.readAsDataURL(f);
    if (!refId) {
      const name = f.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '_');
      setRefId(name);
    }
  }

  function handleFile(e) { applyRefFile(e.target.files?.[0]); }

  // Paste support for ref image
  useEffect(() => {
    function onPaste(e) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          applyRefFile(item.getAsFile());
          break;
        }
      }
    }
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleDropzoneDrop(e) {
    e.preventDefault();
    setDropzoneActive(false);
    applyRefFile(e.dataTransfer.files?.[0]);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!file || !refId || !patternId || !photographer) return;
    setIngesting(true);
    setError(null);
    setProgress('Uploading image\u2026');

    try {
      const metadata = {
        reference_id: refId,
        pattern_id: patternId,
        photographer,
        dataset_tier: tier,
      };
      if (environment) metadata.environment = environment;
      if (notes) metadata.notes = notes;

      setProgress('Running pipeline & VLM reconstruction\u2026');
      await ingestReferenceImage(file, metadata);
      setProgress('Done!');
      setTimeout(onComplete, 500);
    } catch (err) {
      setError(err.message);
      setIngesting(false);
    }
  }

  return (
    <form className="lab-form" onSubmit={handleSubmit}>
      <button type="button" className="btn btn--ghost btn--sm" onClick={onCancel}>
        {'\u2190'} Cancel
      </button>
      <h4 className="lab-form__title">Import Reference Image</h4>
      {error && <div className="lab-form__error">{error}</div>}

      {/* Image upload */}
      <div
        className={`ref-import__dropzone${dropzoneActive ? ' ref-import__dropzone--active' : ''}`}
        onClick={() => fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDropzoneActive(true); }}
        onDragLeave={() => setDropzoneActive(false)}
        onDrop={handleDropzoneDrop}
      >
        {preview ? (
          <ZoomImg src={preview} className="ref-import__preview" alt="Preview" />
        ) : (
          <div className="ref-import__placeholder">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <span>{dropzoneActive ? 'Drop to import' : 'Click or drop image here'}</span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)', marginTop: 4 }}>
              JPEG · PNG · WebP · HEIC · up to 10 MB · face filling the frame gives best results
            </span>
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
      </div>

      {/* Metadata fields */}
      <label className="lab-form__label">
        Reference ID
        <input className="lab-form__input" value={refId} onChange={e => setRefId(e.target.value)} placeholder="e.g. karsh_rembrandt_001" required />
      </label>

      <label className="lab-form__label">
        Pattern
        <select className="lab-form__input" value={patternId} onChange={e => setPatternId(e.target.value)} required>
          {KNOWN_PATTERNS.map(p => <option key={p} value={p}>{p.replace(/_/g, ' ')}</option>)}
        </select>
      </label>

      <label className="lab-form__label">
        Photographer
        <input className="lab-form__input" value={photographer} onChange={e => setPhotographer(e.target.value)} placeholder="e.g. Yousuf Karsh" required />
      </label>

      <label className="lab-form__label">
        Dataset Tier
        <select className="lab-form__input" value={tier} onChange={e => setTier(e.target.value)}>
          <option value="gold">Gold</option>
          <option value="community">Community</option>
          <option value="synthetic">Synthetic</option>
        </select>
      </label>

      <label className="lab-form__label">
        Environment
        <select className="lab-form__input" value={environment} onChange={e => setEnvironment(e.target.value)}>
          <option value="">Not specified</option>
          <option value="studio">Studio</option>
          <option value="natural">Natural</option>
          <option value="window_light">Window Light</option>
          <option value="outdoor">Outdoor</option>
          <option value="mixed">Mixed</option>
        </select>
      </label>

      <label className="lab-form__label">
        Notes
        <textarea className="lab-form__textarea" value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Optional notes about this reference" />
      </label>

      {/* Progress */}
      {ingesting && (
        <div className="ref-import__progress">
          <div className="ref-scan-status__bar"><div className="ref-scan-status__fill" /></div>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>{progress}</p>
        </div>
      )}

      <button className="btn btn--primary" type="submit" disabled={ingesting || !file || !refId || !photographer}>
        {ingesting ? 'Processing\u2026' : 'Import & Process'}
      </button>
    </form>
  );
}


/** Image viewer with debug overlay toggle — uses AuthImage for JWT-gated endpoints */
function RefDetailImage({ patternId, referenceId, hasOverlay }) {
  const [showOverlay, setShowOverlay] = useState(false);
  const [zoomed, setZoomed] = useState(false);

  // Strip /api/lab prefix — AuthImage prepends it via labFetchBlob
  const imagePath   = `/reference-dataset/${patternId}/${referenceId}/image`;
  const overlayPath = `/reference-dataset/${patternId}/${referenceId}/debug-overlay`;
  const activePath  = showOverlay && hasOverlay ? overlayPath : imagePath;

  return (
    <div className="ref-detail-image">
      <AuthImage
        path={activePath}
        alt={referenceId}
        className="ref-detail-image__img"
      />

      {/* Controls row */}
      <div style={{ position: 'absolute', top: 'var(--space-sm)', right: 'var(--space-sm)', display: 'flex', gap: 4 }}>
        {hasOverlay && (
          <button
            className={`btn btn--xs ${showOverlay ? 'btn--primary' : 'btn--ghost'}`}
            onClick={() => setShowOverlay(!showOverlay)}
          >
            {showOverlay ? 'Original' : 'Debug Overlay'}
          </button>
        )}
        <button
          className="btn btn--xs btn--ghost"
          onClick={() => setZoomed(true)}
          title="Open zoomable view"
        >
          ⊕ Zoom
        </button>
      </div>

      {/* Zoomable lightbox */}
      {zoomed && (
        <ZoomableLightbox onClose={() => setZoomed(false)}>
          <AuthImage
            path={activePath}
            alt={`${referenceId} (zoomed)`}
            style={{ maxWidth: '95vw', maxHeight: '90dvh', width: 'auto', height: 'auto', display: 'block', objectFit: 'contain', userSelect: 'none' }}
          />
        </ZoomableLightbox>
      )}
    </div>
  );
}


/** Collapsible nested group for formatted JSON views */
function CollapsibleGroup({ label, children }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="lab-formatted__group">
      <button
        className="lab-formatted__heading lab-formatted__heading--toggle"
        onClick={() => setOpen(o => !o)}
        type="button"
      >
        <span className="lab-formatted__chevron">{open ? '\u25BC' : '\u25B6'}</span>
        {label}
      </button>
      {open && <div className="lab-formatted__group-body">{children}</div>}
    </div>
  );
}

/** Collapsible panel — defaults to formatted view, toggle to raw JSON */
function RefCollapsibleJson({ title, data, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const [raw, setRaw] = useState(false);

  /** Recursively render nested objects as labeled rows; nested groups are collapsible */
  function renderFormatted(obj, prefix) {
    if (!obj || typeof obj !== 'object') return null;
    return Object.entries(obj).map(([key, val]) => {
      const label = prefix ? `${prefix}.${key}` : key;
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        return (
          <CollapsibleGroup key={label} label={key}>
            {renderFormatted(val, label)}
          </CollapsibleGroup>
        );
      }
      let display;
      if (val == null) display = '\u2014';
      else if (typeof val === 'boolean') display = val ? 'Yes' : 'No';
      else if (Array.isArray(val)) {
        if (!val.length) display = '\u2014';
        else if (val.some(v => v !== null && typeof v === 'object')) display = JSON.stringify(val, null, 2);
        else display = val.join(', ');
      }
      else display = String(val);
      return (
        <div key={label} className="ref-analysis__row ref-analysis__row--inline">
          <span className="ref-analysis__label">{key}</span>
          <span className="ref-analysis__value">{display}</span>
        </div>
      );
    });
  }

  return (
    <div className="lab-section">
      <div className="lab-section__header">
        <button className="lab-section__title lab-section__title--toggle" onClick={() => setOpen(!open)}>
          {open ? '\u25BC' : '\u25B6'} {title}
        </button>
        {open && (
          <button
            className="lab-section__view-toggle"
            onClick={() => setRaw(!raw)}
            type="button"
          >
            {raw ? 'Formatted' : 'JSON'}
          </button>
        )}
      </div>
      {open && (
        raw ? (
          <JsonTree data={data} />
        ) : (
          <div className="lab-section__grid lab-formatted">
            {renderFormatted(data, '')}
          </div>
        )
      )}
    </div>
  );
}


/* ═══════════════════════════════════════════════════════════
   Shared Components
   ═══════════════════════════════════════════════════════════ */

const STATUS_COLORS = {
  draft: 'var(--color-warning)',
  approved: 'var(--color-success)',
  archived: 'var(--color-text-secondary)',
  proposed: 'var(--color-accent)',
  accepted: 'var(--color-success)',
  rejected: 'var(--color-error)',
  implemented: 'var(--color-creative)',
};

function StatusBadge({ status }) {
  return (
    <span
      className="lab-status-badge"
      style={{ '--badge-color': STATUS_COLORS[status] || 'var(--color-text-secondary)' }}
    >
      {status}
    </span>
  );
}
