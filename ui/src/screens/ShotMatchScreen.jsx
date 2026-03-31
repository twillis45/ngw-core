import { useState, useRef, useEffect } from 'react';
import { useAppState, useDispatch } from '../context/AppContext';
import ZoomOverlay from '../cards/ZoomOverlay';
import usePaywall, { resolveUserEmail } from '../hooks/usePaywall';

/**
 * Shot Match — compare a reference image vs user's attempt.
 * Studio-tier feature: requires planTier === 'studio'.
 *
 * Entry points:
 *  - WelcomeScreen mode card (if enable_shot_match flag)
 *  - ResultsScreen CTA
 *  - ShootModeScreen "Verify" action
 */
export default function ShotMatchScreen() {
  const { referenceImage, referenceImages, result, user } = useAppState();
  const dispatch = useDispatch();
  const { isStudio, isAdmin } = usePaywall(resolveUserEmail(user));
  const attemptRef = useRef(null);
  const refUploadRef = useRef(null);

  // Reference image — use existing from state or allow upload
  const existingRefPreview = referenceImage?.preview
    || referenceImages?.[0]?.preview
    || result?.referenceImage
    || null;

  const [refPreview, setRefPreview] = useState(existingRefPreview);
  const [attemptPreview, setAttemptPreview] = useState(null);
  const [comparing, setComparing] = useState(false);
  const [comparisonResult, setComparisonResult] = useState(null);
  const [zoomSrc, setZoomSrc] = useState(null);
  const [refDragging, setRefDragging] = useState(false);
  const [attemptDragging, setAttemptDragging] = useState(false);
  const [compareError, setCompareError] = useState(null);

  function loadPreview(file, setter) {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => setter(reader.result);
    reader.readAsDataURL(file);
  }

  function handleRefUpload(e) { loadPreview(e.target.files?.[0], setRefPreview); }
  function handleAttemptUpload(e) { loadPreview(e.target.files?.[0], setAttemptPreview); }

  function handleRefDrop(e) {
    e.preventDefault(); setRefDragging(false);
    loadPreview(e.dataTransfer.files?.[0], setRefPreview);
  }
  function handleAttemptDrop(e) {
    e.preventDefault(); setAttemptDragging(false);
    loadPreview(e.dataTransfer.files?.[0], setAttemptPreview);
  }

  // Paste: fills reference first, then attempt
  useEffect(() => {
    function onPaste(e) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (!refPreview) { loadPreview(file, setRefPreview); }
          else if (!attemptPreview) { loadPreview(file, setAttemptPreview); }
          break;
        }
      }
    }
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [refPreview, attemptPreview]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Convert a base64 data-URL back to a Blob for FormData upload. */
  function dataUrlToBlob(dataUrl) {
    const [header, b64] = dataUrl.split(',');
    const mime = (header.match(/:(.*?);/) || [])[1] || 'image/jpeg';
    const bytes = atob(b64);
    const buf = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) buf[i] = bytes.charCodeAt(i);
    return new Blob([buf], { type: mime });
  }

  /** Upload one image to /api/upload-reference and return the analysis JSON. */
  async function uploadAndAnalyze(blob, filename) {
    const fd = new FormData();
    fd.append('file', blob, filename);
    const res = await fetch('/api/upload-reference', { method: 'POST', body: fd });
    if (!res.ok) throw new Error(`Analysis failed (HTTP ${res.status})`);
    return res.json();
  }

  /** Compare two upload-reference responses and produce structured match data. */
  function compareAnalyses(ref, att) {
    const ri = ref.analysis?.lightingIntelligence || {};
    const ai = att.analysis?.lightingIntelligence || {};
    const rc = ref.analysis?.classification       || {};
    const ac = att.analysis?.classification       || {};

    const rPat = ri.detectedPattern || rc.lightingPattern || null;
    const aPat = ai.detectedPattern || ac.lightingPattern || null;
    const rKey = ri.keyPosition     || null;
    const aKey = ai.keyPosition     || null;
    const rSide = ri.keySide        || null;
    const aSide = ai.keySide        || null;
    const rMod = ri.detectedModifier || null;
    const aMod = ai.detectedModifier || null;
    const rCnt = ri.lightCount != null ? String(ri.lightCount) : null;
    const aCnt = ai.lightCount != null ? String(ai.lightCount) : null;

    function dim(label, r, a) {
      const present = r && a;
      const match = present ? r === a : null;
      return { label, refValue: r || '—', attValue: a || '—', match };
    }

    const dims = [
      dim('Light Pattern',    rPat,  aPat),
      dim('Key Position',     rKey,  aKey),
      dim('Key Side',         rSide, aSide),
      dim('Modifier Type',    rMod,  aMod),
      dim('Light Count',      rCnt,  aCnt),
    ];

    const scored = dims.filter(d => d.match !== null);
    const matchCount = scored.filter(d => d.match).length;
    const matchPct = scored.length > 0 ? Math.round(matchCount / scored.length * 100) : null;

    return { matchPct, dimensions: dims };
  }

  async function handleCompare() {
    if (!refPreview || !attemptPreview) return;
    setComparing(true);
    setComparisonResult(null);
    setCompareError(null);

    try {
      const [refData, attData] = await Promise.all([
        uploadAndAnalyze(dataUrlToBlob(refPreview),   'reference.jpg'),
        uploadAndAnalyze(dataUrlToBlob(attemptPreview), 'attempt.jpg'),
      ]);
      setComparisonResult(compareAnalyses(refData, attData));
    } catch (err) {
      setCompareError(err.message || 'Comparison failed — please try again.');
    } finally {
      setComparing(false);
    }
  }

  function handleBack() {
    dispatch({ type: 'GO_BACK' });
  }

  // Studio-tier gate — admins always pass
  if (!isStudio && !isAdmin) {
    return (
      <div className="screen">
        <h2 className="screen-heading">Shot Match</h2>
        <div className="shot-match__gate">
          <div className="shot-match__gate-icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0110 0v4"/>
            </svg>
          </div>
          <h3 className="shot-match__gate-title">Studio Plan Required</h3>
          <p className="shot-match__gate-body">
            Shot Match is a Studio-tier feature. Upload your attempt alongside a reference and get a
            precise breakdown of how closely your lighting matches — pattern, key position, modifier, and more.
          </p>
          <p className="shot-match__gate-sub">
            Upgrade to Studio to unlock Shot Match and the full Creative recipe library.
          </p>
          <button
            className="btn btn--primary"
            style={{ width: '100%', marginBottom: 'var(--space-sm)' }}
            onClick={() => dispatch({ type: 'NAVIGATE', screen: 'upgrade' })}
          >
            Upgrade to Studio
          </button>
          <button
            className="btn btn--ghost"
            style={{ width: '100%' }}
            onClick={handleBack}
          >
            {'← '} Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <h2 className="screen-heading">Shot Match</h2>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)', textAlign: 'center', marginBottom: 'var(--space-md)' }}>
        Compare your attempt to a reference photo
      </p>

      {/* Zoom overlay */}
      {zoomSrc && <ZoomOverlay src={zoomSrc} alt="Photo" onClose={() => setZoomSrc(null)} />}

      {/* ── Dual Upload Area ── */}
      <div className="shot-match__compare">
        {/* Reference */}
        <div
          className={`shot-match__upload-area${refDragging ? ' shot-match__upload-area--dragging' : ''}`}
          onDragOver={e => { e.preventDefault(); setRefDragging(true); }}
          onDragLeave={() => setRefDragging(false)}
          onDrop={handleRefDrop}
        >
          <span className="shot-match__area-label">Reference</span>
          {refPreview ? (
            <div className="shot-match__image-wrap">
              <img
                src={refPreview}
                alt="Reference"
                className="shot-match__image"
                onClick={() => setZoomSrc(refPreview)}
              />
              <button
                className="shot-match__change-btn"
                onClick={() => refUploadRef.current?.click()}
              >
                Change
              </button>
            </div>
          ) : (
            <button
              className="shot-match__upload-btn"
              onClick={() => refUploadRef.current?.click()}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              <span>{refDragging ? 'Drop here' : 'Click, drop, or paste reference'}</span>
            </button>
          )}
          {!refPreview && <p className="shot-match__upload-hint">JPEG · PNG · HEIC · 10 MB max · face filling the frame gives best results</p>}
          <input
            ref={refUploadRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleRefUpload}
          />
        </div>

        {/* VS divider */}
        <div className="shot-match__vs">VS</div>

        {/* Attempt */}
        <div
          className={`shot-match__upload-area${attemptDragging ? ' shot-match__upload-area--dragging' : ''}`}
          onDragOver={e => { e.preventDefault(); setAttemptDragging(true); }}
          onDragLeave={() => setAttemptDragging(false)}
          onDrop={handleAttemptDrop}
        >
          <span className="shot-match__area-label">Your Attempt</span>
          {attemptPreview ? (
            <div className="shot-match__image-wrap">
              <img
                src={attemptPreview}
                alt="Your attempt"
                className="shot-match__image"
                onClick={() => setZoomSrc(attemptPreview)}
              />
              <button
                className="shot-match__change-btn"
                onClick={() => attemptRef.current?.click()}
              >
                Change
              </button>
            </div>
          ) : (
            <button
              className="shot-match__upload-btn"
              onClick={() => attemptRef.current?.click()}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              <span>{attemptDragging ? 'Drop here' : 'Click, drop, or paste your shot'}</span>
            </button>
          )}
          {!attemptPreview && <p className="shot-match__upload-hint">Same scene, same subject — face filling the frame matches best</p>}
          <input
            ref={attemptRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleAttemptUpload}
          />
        </div>
      </div>

      {/* ── Compare Button ── */}
      <div style={{ padding: 'var(--space-md) 0' }}>
        <button
          className="btn btn--primary"
          style={{ width: '100%' }}
          disabled={!refPreview || !attemptPreview || comparing}
          onClick={handleCompare}
        >
          {comparing ? 'Comparing\u2026' : 'Compare Shots'}
        </button>
      </div>

      {/* ── Error ── */}
      {compareError && (
        <div className="shot-match__error">{compareError}</div>
      )}

      {/* ── Comparison Results ── */}
      {comparisonResult && (
        <div className="shot-match__results">
          <h3 className="shoot-mode__section-title">Match Analysis</h3>

          {/* Overall score */}
          {comparisonResult.matchPct !== null && (
            <div className="shot-match__score">
              <div className="shot-match__score-pct">{comparisonResult.matchPct}%</div>
              <div className="shot-match__score-label">
                {comparisonResult.matchPct >= 80 ? 'Strong match — lighting looks consistent' :
                 comparisonResult.matchPct >= 50 ? 'Partial match — some differences detected' :
                 'Low match — significant lighting differences'}
              </div>
            </div>
          )}

          {/* Per-dimension breakdown */}
          {comparisonResult.dimensions.map((dim, i) => (
            <div key={i} className="shot-match__dimension">
              <span className="shot-match__dim-label">{dim.label}</span>
              <span className="shot-match__dim-values">
                <span style={{ fontWeight: 'var(--weight-medium)', color: 'var(--color-text)' }}>
                  {dim.refValue}
                  {dim.attValue !== dim.refValue && dim.refValue !== '—' && dim.attValue !== '—'
                    ? ` → ${dim.attValue}` : ''}
                </span>
                <span className={
                  dim.match === true  ? 'shot-match__dim-match' :
                  dim.match === false ? 'shot-match__dim-miss'  :
                  'shot-match__dim-na'
                }>
                  {dim.match === true ? '✓ Match' : dim.match === false ? '✗ Differs' : '—'}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Back */}
      <div style={{ padding: 'var(--space-md) 0', paddingBottom: 'calc(var(--space-xl) + env(safe-area-inset-bottom, 0px))' }}>
        <button
          className="btn btn--ghost"
          style={{ width: '100%' }}
          onClick={handleBack}
        >
          {'\u2190'} Back
        </button>
      </div>
    </div>
  );
}
