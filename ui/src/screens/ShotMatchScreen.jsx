import { useState, useRef } from 'react';
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

  function handleRefUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setRefPreview(reader.result);
    reader.readAsDataURL(file);
  }

  function handleAttemptUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setAttemptPreview(reader.result);
    reader.readAsDataURL(file);
  }

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
        <div className="shot-match__upload-area">
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
              <span>Upload Reference</span>
            </button>
          )}
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
        <div className="shot-match__upload-area">
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
              <span>Upload Your Shot</span>
            </button>
          )}
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
