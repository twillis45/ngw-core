import { useRef, useState } from 'react';
import { useAppState, useDispatch } from '../context/AppContext';
import { hasKit } from '../data/kitStore';
import { loadSetups } from '../data/setupStore';
import Toast from '../components/Toast';

export default function WelcomeScreen() {
  const { user } = useAppState();
  const [toast, setToast] = useState({ message: '', visible: false });
  const dispatch = useDispatch();
  const fileRef = useRef(null);
  const kitSaved = hasKit();
  const savedCount = loadSetups().length;

  /* ── File upload handler (shared by hero CTA, gallery, freemium) ── */
  function handleFileChange(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const reads = files.map(file => new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve({ file, preview: reader.result, serverPath: null });
      reader.readAsDataURL(file);
    }));

    Promise.all(reads).then(images => {
      dispatch({ type: 'SET_APP_MODE', mode: 'match' });
      dispatch({ type: 'SET_REFERENCE_IMAGES', payload: images });
      dispatch({ type: 'NAVIGATE', screen: 'ref_eval' });
    });
  }

  function triggerUpload() {
    fileRef.current?.click();
  }

  /* ── Workflow actions ── */
  function handleWorkflowClick(action) {
    switch (action) {
      case 'upload':
        dispatch({ type: 'SET_APP_MODE', mode: 'match' });
        triggerUpload();
        break;
      case 'wizard':
        dispatch({ type: 'SET_APP_MODE', mode: 'build' });
        dispatch({ type: 'SET_INTENT', intent: 'mood' });
        break;
    }
  }

  /* ══════════════════════════════════════════════════════
     APP HOME: Clean, tool-focused layout (all screen sizes)
     ══════════════════════════════════════════════════════ */
  return (
    <div className="welcome welcome--app">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* Primary action: Reverse-engineer a reference photo */}
      <button
        type="button"
        className="btn btn--primary mobile-tool__upload"
        onClick={triggerUpload}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="m21 15-5-5L5 21" />
        </svg>
        Reverse-Engineer a Photo
      </button>

      {/* Secondary actions row */}
      <div className="welcome__secondary-row">
        <button
          type="button"
          className="mobile-tool__action"
          onClick={() => dispatch({ type: 'NAVIGATE', screen: 'recipes' })}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 016.5 17H20"/>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>
          </svg>
          <div className="mobile-tool__action__text">
            <span>Browse Recipes</span>
            <small className="mobile-tool__hint">Pick a look, get the full setup</small>
          </div>
        </button>

        <button
          type="button"
          className="mobile-tool__action mobile-tool__action--tertiary"
          onClick={() => handleWorkflowClick('wizard')}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
          <div className="mobile-tool__action__text">
            <span>Build from Scratch</span>
            <small className="mobile-tool__hint">Describe the mood &amp; gear you have</small>
          </div>
        </button>
      </div>

      {/* Quick-access links */}
      <div className="app-home__links">
        {savedCount > 0 && (
          <button
            className="app-home__link"
            onClick={() => dispatch({ type: 'NAVIGATE', screen: 'saved_setups' })}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/>
            </svg>
            Saved ({savedCount})
          </button>
        )}

        {kitSaved && (
          <button
            className="app-home__link"
            onClick={() => dispatch({ type: 'NAVIGATE', screen: 'my_kit' })}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
            </svg>
            My Kit
          </button>
        )}
      </div>

      <Toast
        message={toast.message}
        visible={toast.visible}
        onDone={() => setToast(t => ({ ...t, visible: false }))}
      />
    </div>
  );
}
