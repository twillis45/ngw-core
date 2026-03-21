import { useState, useRef, useEffect } from 'react';
import { useAppState, useDispatch } from '../context/AppContext';
import ZoomOverlay from '../cards/ZoomOverlay';

/**
 * Shot Match — compare a reference image vs user's attempt.
 * Scaffold: dual upload + comparison placeholder.
 *
 * Entry points:
 *  - WelcomeScreen mode card (if enable_shot_match flag)
 *  - ResultsScreen CTA
 *  - ShootModeScreen "Verify" action
 */
export default function ShotMatchScreen() {
  const { referenceImage, referenceImages, result } = useAppState();
  const dispatch = useDispatch();
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

  function handleCompare() {
    if (!refPreview || !attemptPreview) return;
    setComparing(true);

    // Scaffold: simulate comparison delay, then show placeholder
    setTimeout(() => {
      setComparing(false);
      setComparisonResult({
        overall: 'Comparison coming soon',
        dimensions: [
          { label: 'Light Direction', status: 'pending' },
          { label: 'Source Hardness', status: 'pending' },
          { label: 'Contrast', status: 'pending' },
          { label: 'Background Separation', status: 'pending' },
          { label: 'Shadow Pattern', status: 'pending' },
          { label: 'Specular Behavior', status: 'pending' },
        ],
      });
    }, 1200);
  }

  function handleBack() {
    dispatch({ type: 'GO_BACK' });
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

      {/* ── Comparison Results (scaffold) ── */}
      {comparisonResult && (
        <div className="shot-match__results">
          <h3 className="shoot-mode__section-title">Match Analysis</h3>
          <div className="shot-match__placeholder">
            <p style={{ color: 'var(--color-text-secondary)', textAlign: 'center', marginBottom: 'var(--space-md)' }}>
              Full comparison engine coming soon. Dimensions that will be analyzed:
            </p>
            {comparisonResult.dimensions.map((dim, i) => (
              <div key={i} className="shot-match__dimension">
                <span className="shot-match__dim-label">{dim.label}</span>
                <span className="shot-match__dim-status">{'\u2013'}</span>
              </div>
            ))}
          </div>
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
