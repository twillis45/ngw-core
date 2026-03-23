import { useState, useEffect, useCallback, useRef } from 'react';
import { useAppState, useDispatch } from '../context/AppContext';
import LearningOpsTab from '../components/lab/LearningOpsTab';
import BenchmarkTab from '../components/lab/BenchmarkTab';
import SignalsTab from '../components/lab/SignalsTab';
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
} from '../data/labApi';

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

/**
 * NGW Lab — internal dev tools.
 * Protected by enable_lab feature flag + logged-in user.
 * Tabs: Workbench, Gold Set, Candidates, Reference Dataset, Learning Ops.
 */
export default function LabScreen() {
  const { user, labPendingImage } = useAppState();
  const dispatch = useDispatch();
  const [activeTab, setActiveTab] = useState('workbench');
  const [goldSetPrefill, setGoldSetPrefill] = useState(null);
  const [candidatePrefill, setCandidatePrefill] = useState(null);
  // Track what's currently loaded in WorkbenchTab so Gold Set can mirror it
  const [workbenchSnapshot, setWorkbenchSnapshot] = useState(null);

  // Intercept all tab switches so we can auto-populate Gold Set from workbench
  function handleTabSwitch(tabId) {
    if (tabId === 'gold_set' && workbenchSnapshot && !goldSetPrefill) {
      setGoldSetPrefill({
        image_path:        workbenchSnapshot.imagePath || '',
        expected_analysis: workbenchSnapshot.result
          ? (workbenchSnapshot.result.reference_analysis || workbenchSnapshot.result.description || {})
          : {},
        notes:             workbenchSnapshot.imagePath
          ? `Workbench analysis ${new Date().toLocaleDateString()}`
          : '',
        imagePreview: workbenchSnapshot.preview,
        imageFile:    workbenchSnapshot.file,
      });
    }
    setActiveTab(tabId);
  }

  function handleSaveToGoldSet(result) {
    setGoldSetPrefill({
      image_path: result.image_path || '',
      expected_analysis: result.reference_analysis || result.description || {},
      notes: `Workbench analysis ${new Date().toLocaleDateString()}`,
      imagePreview: workbenchSnapshot?.preview || null,
      imageFile:    workbenchSnapshot?.file    || null,
    });
    setActiveTab('gold_set');
  }

  function handleProposeRule(result) {
    const analysis = result.reference_analysis || {};
    const lighting = analysis.lighting_read || {};
    const setup = analysis.recreation_setup || {};
    setCandidatePrefill({
      title: `Rule from ${setup.setup_family || lighting.lighting_family || 'analysis'}`,
      description: '',
      rationale: `Based on workbench analysis of ${result.image_path || 'uploaded image'}`,
      proposed_change: { source_analysis: analysis },
    });
    setActiveTab('candidates');
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

  const tabs = [
    { id: 'workbench',   label: 'Workbench' },
    { id: 'gold_set',    label: 'Gold Set' },
    { id: 'candidates',  label: 'Candidates' },
    { id: 'ref_dataset', label: 'Reference Dataset' },
    { id: 'signals',     label: 'Signals' },
    { id: 'learning',    label: 'Learning Ops' },
    { id: 'benchmarks',  label: 'Benchmarks' },
  ];

  return (
    <div className="screen lab-screen">
      <h2 className="screen-heading">NGW Lab</h2>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)', textAlign: 'center', marginBottom: 'var(--space-md)' }}>
        Internal development tools
      </p>

      {/* ── Tab Bar ── */}
      <div className="lab-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`lab-tab${activeTab === tab.id ? ' lab-tab--active' : ''}`}
            onClick={() => handleTabSwitch(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab Content ──
           All tabs stay mounted once the lab screen loads so:
           - Tab switches are instant (no re-fetch, no skeleton flash)
           - Workbench result is preserved when checking Signals and back
           - Data-heavy tabs (Benchmark, LearningOps) pre-load in background
      ── */}
      <div className="lab-content">
        <div style={{ display: activeTab === 'workbench' ? 'block' : 'none' }}>
          <WorkbenchTab
            onSaveToGoldSet={handleSaveToGoldSet}
            onProposeRule={handleProposeRule}
            pendingImage={labPendingImage}
            onPendingConsumed={() => dispatch({ type: 'CLEAR_LAB_PENDING_IMAGE' })}
            onWorkbenchChange={setWorkbenchSnapshot}
          />
        </div>
        <div style={{ display: activeTab === 'gold_set' ? 'block' : 'none' }}>
          <GoldSetTab
            prefill={goldSetPrefill}
            onPrefillConsumed={() => setGoldSetPrefill(null)}
          />
        </div>
        <div style={{ display: activeTab === 'candidates' ? 'block' : 'none' }}>
          <CandidatesTab
            prefill={candidatePrefill}
            onPrefillConsumed={() => setCandidatePrefill(null)}
          />
        </div>
        <div style={{ display: activeTab === 'ref_dataset' ? 'block' : 'none' }}>
          <ReferenceDatasetTab />
        </div>
        <div style={{ display: activeTab === 'signals' ? 'block' : 'none' }}>
          <SignalsTab />
        </div>
        <div style={{ display: activeTab === 'learning' ? 'block' : 'none' }}>
          <LearningOpsTab />
        </div>
        <div style={{ display: activeTab === 'benchmarks' ? 'block' : 'none' }}>
          <BenchmarkTab />
        </div>
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
  else if (typeof value === 'boolean')          valStyle = { color: '#FBBF24' };
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

function WorkbenchTab({ onSaveToGoldSet, onProposeRule, pendingImage, onPendingConsumed, onWorkbenchChange }) {
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
            <img src={preview} alt="Selected for analysis" />
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
            {result.debug_overlay_url && (
              <button
                className={`lab-tab${viewMode === 'overlay' ? ' lab-tab--active' : ''}`}
                onClick={() => setViewMode('overlay')}
              >
                Debug Overlay
              </button>
            )}
          </div>

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
              {/* Lightbox */}
              {overlayZoomed && (
                <div className="lab-overlay-lightbox" onClick={() => setOverlayZoomed(false)}>
                  <div className="lab-overlay-lightbox__inner" onClick={e => e.stopPropagation()}>
                    <button className="lab-overlay-lightbox__close" onClick={() => setOverlayZoomed(false)}>✕</button>
                    <img src={result.debug_overlay_url} alt="Debug overlay (fullscreen)" />
                  </div>
                </div>
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
   Gold Set Tab — CRUD list + detail + batch evaluation
   ═══════════════════════════════════════════════════════════ */

const GOLD_STATUSES = ['all', 'draft', 'approved', 'archived'];

function GoldSetTab({ prefill, onPrefillConsumed }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [view, setView] = useState(prefill ? 'create' : 'list');
  const [selected, setSelected] = useState(null);
  const [evalResult, setEvalResult] = useState(null);
  const [evalRunning, setEvalRunning] = useState(false);

  // Auto-open create form when prefill arrives
  useEffect(() => {
    if (prefill) setView('create');
  }, [prefill]);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
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

  async function handleRunEval() {
    setEvalRunning(true);
    setEvalResult(null);
    try {
      const data = await evaluateGoldSet();
      setEvalResult(data);
    } catch (err) {
      alert(err.message);
    } finally {
      setEvalRunning(false);
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
        <div style={{ display: 'flex', gap: 'var(--space-xs)' }}>
          <button className="btn btn--primary btn--sm" onClick={() => setView('create')}>
            + New
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

      {/* Eval result banner */}
      {evalResult && (
        <div className="lab-eval-banner">
          <div className="lab-eval-banner__header">
            <strong>Evaluation Complete</strong>
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
      {!loading && entries.map(entry => (
        <button
          key={entry.id}
          className="lab-card"
          onClick={() => { setSelected(entry); setView('detail'); }}
        >
          <div className="lab-card__top">
            <span className="lab-card__title">{entry.image_path || entry.id}</span>
            <StatusBadge status={entry.status} />
          </div>
          {entry.notes && <p className="lab-card__sub">{entry.notes}</p>}
          {entry.created_at && (
            <span className="lab-card__meta">{new Date(entry.created_at * 1000).toLocaleDateString()}</span>
          )}
        </button>
      ))}
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
          <img src={imageSrc} alt="Gold set" className="lab-detail__image" />
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
          <span className="lab-detail__value">{new Date(entry.created_at * 1000).toLocaleString()}</span>
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
            <img
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
      {!loading && items.map(item => (
        <button
          key={item.id}
          className="lab-card"
          onClick={() => { setSelected(item); setView('detail'); }}
        >
          <div className="lab-card__top">
            <span className="lab-card__title">{item.title}</span>
            <StatusBadge status={item.status} />
          </div>
          {item.description && <p className="lab-card__sub">{item.description}</p>}
          {item.created_at && (
            <span className="lab-card__meta">{new Date(item.created_at * 1000).toLocaleDateString()}</span>
          )}
        </button>
      ))}
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
  const [editJson, setEditJson] = useState('');
  const [jsonErr, setJsonErr] = useState(null);

  function startEdit() {
    setEditTitle(selected.title || '');
    setEditDesc(selected.description || '');
    setEditRationale(selected.rationale || '');
    setEditJson(selected.proposed_change ? JSON.stringify(selected.proposed_change, null, 2) : '{}');
    setJsonErr(null);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setJsonErr(null);
  }

  async function saveEdit() {
    let parsed;
    try {
      parsed = JSON.parse(editJson);
    } catch {
      setJsonErr('Invalid JSON — fix before saving.');
      return;
    }
    setSaving(true);
    try {
      const updated = await updateCandidate(selected.id, {
        title: editTitle,
        description: editDesc,
        rationale: editRationale || undefined,
        proposed_change: parsed,
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
          <>
            <textarea
              className="lab-form__textarea lab-form__textarea--code"
              value={editJson}
              onChange={e => { setEditJson(e.target.value); setJsonErr(null); }}
              rows={14}
              spellCheck={false}
            />
            {jsonErr && <div className="lab-form__error">{jsonErr}</div>}
          </>
        ) : (
          <JsonTree data={selected.proposed_change} />
        )}
      </div>

      {selected.created_at && (
        <div className="lab-detail__field">
          <span className="lab-detail__label">Created</span>
          <span className="lab-detail__value">{new Date(selected.created_at * 1000).toLocaleString()}</span>
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

      {/* Status workflow controls — hidden while editing */}
      {!editing && (
        <div className="lab-detail__controls">
          {selected.status === 'proposed' && (
            <>
              <button className="btn btn--primary btn--sm" onClick={() => onStatusChange(selected.id, 'accepted')}>
                Accept
              </button>
              <button className="btn btn--ghost btn--sm" onClick={() => onStatusChange(selected.id, 'rejected')}>
                Reject
              </button>
            </>
          )}
          {selected.status === 'accepted' && (
            <button className="btn btn--primary btn--sm" onClick={() => onStatusChange(selected.id, 'implemented')}>
              Mark Implemented
            </button>
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
  const [proposedJson, setProposedJson] = useState(
    prefill?.proposed_change ? JSON.stringify(prefill.proposed_change, null, 2) : '{}'
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      let proposed = {};
      try { proposed = JSON.parse(proposedJson); } catch { throw new Error('Proposed change must be valid JSON'); }
      await onSave({
        title,
        description,
        rationale: rationale || undefined,
        source_gold_set_id: sourceGoldSetId || undefined,
        proposed_change: proposed,
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
      </label>

      <label className="lab-form__label">
        Source Gold Set ID (optional)
        <input
          className="lab-form__input"
          value={sourceGoldSetId}
          onChange={e => setSourceGoldSetId(e.target.value)}
          placeholder="UUID of related gold set entry"
        />
      </label>

      <label className="lab-form__label">
        Proposed Change (JSON)
        <textarea
          className="lab-form__textarea"
          value={proposedJson}
          onChange={e => setProposedJson(e.target.value)}
          rows={4}
        />
      </label>

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
              {meta.ingested_at && <AnalysisRow label="Ingested" value={new Date(meta.ingested_at).toLocaleString()} />}
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
              style={{ fontSize: 'var(--text-xs)' }}
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
          <img src={preview} className="ref-import__preview" alt="Preview" />
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

  // Strip /api/lab prefix — AuthImage prepends it via labFetchBlob
  const imagePath = `/reference-dataset/${patternId}/${referenceId}/image`;
  const overlayPath = `/reference-dataset/${patternId}/${referenceId}/debug-overlay`;

  return (
    <div className="ref-detail-image">
      <AuthImage
        path={showOverlay && hasOverlay ? overlayPath : imagePath}
        alt={referenceId}
        className="ref-detail-image__img"
      />
      {hasOverlay && (
        <button
          className={`btn btn--xs ${showOverlay ? 'btn--primary' : 'btn--ghost'}`}
          style={{ position: 'absolute', top: 'var(--space-sm)', right: 'var(--space-sm)' }}
          onClick={() => setShowOverlay(!showOverlay)}
        >
          {showOverlay ? 'Original' : 'Debug Overlay'}
        </button>
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
