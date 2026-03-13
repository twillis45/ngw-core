import { useRef, useState, useCallback } from 'react';
import { useAppState, useDispatch } from '../context/AppContext';
import { hasKit } from '../data/kitStore';
import { loadSetups } from '../data/setupStore';
import { getHomeModes, getAdminModes } from '../modes/modeRegistry';
import { isModeEnabled, isEnabled, setFlag } from '../modes/featureFlags';
import ModeCard from '../components/ModeCard';
import Toast from '../components/Toast';

const DEV_TAP_COUNT = 5;
const DEV_TAP_WINDOW = 3000; // ms

export default function WelcomeScreen() {
  const { user } = useAppState();
  const tapTimestamps = useRef([]);
  const [toast, setToast] = useState({ message: '', visible: false });
  const dispatch = useDispatch();
  const fileRef = useRef(null);
  const kitSaved = hasKit();
  const savedCount = loadSetups().length;

  // Build mode lists from registry
  const publicModes = getHomeModes().filter(isModeEnabled);
  const adminModes = getAdminModes().filter(m => isModeEnabled(m) && user);

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

  // Secret logo tap: 5 taps within 3s toggles Lab dev mode
  const handleLogoTap = useCallback(() => {
    const now = Date.now();
    const taps = tapTimestamps.current;
    taps.push(now);
    // Keep only taps within the window
    while (taps.length && taps[0] < now - DEV_TAP_WINDOW) taps.shift();
    if (taps.length >= DEV_TAP_COUNT) {
      taps.length = 0;
      const wasEnabled = isEnabled('enable_lab');
      setFlag('enable_lab', !wasEnabled);
      setToast({ message: wasEnabled ? 'Dev mode disabled' : 'Dev mode enabled', visible: true });
    }
  }, []);

  function handleModeSelect(mode) {
    dispatch({ type: 'SET_APP_MODE', mode: mode.id });

    switch (mode.entryAction) {
      case 'wizard':
        dispatch({ type: 'SET_INTENT', intent: 'mood' });
        break;
      case 'upload':
        fileRef.current?.click();
        break;
      case 'screen':
        dispatch({ type: 'NAVIGATE', screen: mode.entryScreen });
        break;
    }
  }

  return (
    <div className="welcome">
      <div className="welcome__hero">
        <div className="welcome__logo" onClick={handleLogoTap} role="presentation">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="4" y="4" width="40" height="40" rx="12" stroke="currentColor" strokeWidth="2" fill="none" />
            <path d="M18 14 L24 34 L30 14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <circle cx="24" cy="14" r="3" fill="currentColor" />
          </svg>
        </div>
        <h1 className="welcome__title">No Guesswork Lighting</h1>
        <p className="welcome__sub">No guesswork. Just light.</p>
      </div>

      {/* Hidden file input for Match a Look */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* ── Primary mode cards ── */}
      <div className="welcome__actions mode-grid">
        {publicModes.map(mode => (
          <ModeCard key={mode.id} mode={mode} onSelect={handleModeSelect} />
        ))}
      </div>

      {/* ── Secondary links ── */}
      <div className="welcome__secondary">
        <button
          className="welcome__btn welcome__btn--secondary"
          onClick={() => dispatch({ type: 'NAVIGATE', screen: 'recipes' })}
        >
          <span className="welcome__btn-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 016.5 17H20"/>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>
            </svg>
          </span>
          <span className="welcome__btn-text">
            <strong>Lighting Recipes</strong>
            <small>Browse proven setups for any look</small>
          </span>
          <span className="welcome__btn-arrow">{'\u203A'}</span>
        </button>

        {kitSaved && (
          <button
            className="welcome__btn welcome__btn--secondary"
            onClick={() => dispatch({ type: 'NAVIGATE', screen: 'my_kit' })}
          >
            <span className="welcome__btn-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
              </svg>
            </span>
            <span className="welcome__btn-text">
              <strong>My Kit</strong>
              <small>View and manage your saved gear</small>
            </span>
            <span className="welcome__btn-arrow">{'\u203A'}</span>
          </button>
        )}

        {savedCount > 0 && (
          <button
            className="welcome__btn welcome__btn--secondary"
            onClick={() => dispatch({ type: 'NAVIGATE', screen: 'saved_setups' })}
          >
            <span className="welcome__btn-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/>
              </svg>
            </span>
            <span className="welcome__btn-text">
              <strong>Saved Setups</strong>
              <small>{savedCount} saved setup{savedCount !== 1 ? 's' : ''}</small>
            </span>
            <span className="welcome__btn-arrow">{'\u203A'}</span>
          </button>
        )}

        {/* ── Admin modes (Lab, etc.) ── */}
        {adminModes.map(mode => (
          <ModeCard key={mode.id} mode={mode} onSelect={handleModeSelect} />
        ))}

        {/* Build version */}
        <div className="welcome__build">v1.4.0</div>
      </div>
      <Toast
        message={toast.message}
        visible={toast.visible}
        onDone={() => setToast(t => ({ ...t, visible: false }))}
      />
    </div>
  );
}
