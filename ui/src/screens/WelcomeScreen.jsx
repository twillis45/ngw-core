import { useRef, useState, useCallback } from 'react';
import { useAppState, useDispatch } from '../context/AppContext';
import { hasKit } from '../data/kitStore';
import { loadSetups } from '../data/setupStore';
import { getAdminModes } from '../modes/modeRegistry';
import { isModeEnabled, isEnabled, setFlag } from '../modes/featureFlags';
import ModeCard from '../components/ModeCard';
import Toast from '../components/Toast';
import ExampleAnalysis from '../components/ExampleAnalysis';
import ExampleGallery from '../components/ExampleGallery';

const DEV_TAP_COUNT = 5;
const DEV_TAP_WINDOW = 3000; // ms

const GEAR_OPTIONS = [
  { key: 'my_gear', label: 'Use My Gear' },
  { key: 'recommend', label: 'Recommend Gear' },
  { key: 'any', label: "Doesn\u2019t Matter" },
];

export default function WelcomeScreen() {
  const { user, gearPreference } = useAppState();
  const tapTimestamps = useRef([]);
  const [toast, setToast] = useState({ message: '', visible: false });
  const dispatch = useDispatch();
  const fileRef = useRef(null);
  const kitSaved = hasKit();
  const savedCount = loadSetups().length;

  const adminModes = getAdminModes().filter(m => isModeEnabled(m) && user);

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

  /* ── Secret logo tap: 5 taps within 3s toggles Lab dev mode ── */
  const handleLogoTap = useCallback(() => {
    const now = Date.now();
    const taps = tapTimestamps.current;
    taps.push(now);
    while (taps.length && taps[0] < now - DEV_TAP_WINDOW) taps.shift();
    if (taps.length >= DEV_TAP_COUNT) {
      taps.length = 0;
      const wasEnabled = isEnabled('enable_lab');
      setFlag('enable_lab', !wasEnabled);
      setToast({ message: wasEnabled ? 'Dev mode disabled' : 'Dev mode enabled', visible: true });
    }
  }, []);

  /* ── Gear preference toggle ── */
  function handleGearSelect(key) {
    if (key === 'my_gear' && !kitSaved) {
      dispatch({ type: 'NAVIGATE', screen: 'my_kit' });
      return;
    }
    dispatch({ type: 'SET_GEAR_PREFERENCE', payload: key });
  }

  /* ── Workflow card actions ── */
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
      case 'shoot':
        dispatch({ type: 'SET_APP_MODE', mode: 'shoot' });
        dispatch({ type: 'NAVIGATE', screen: 'shoot_mode' });
        break;
    }
  }

  /* ── Admin mode select (Lab, etc.) ── */
  function handleModeSelect(mode) {
    dispatch({ type: 'SET_APP_MODE', mode: mode.id });
    switch (mode.entryAction) {
      case 'wizard':
        dispatch({ type: 'SET_INTENT', intent: 'mood' });
        break;
      case 'upload':
        triggerUpload();
        break;
      case 'screen':
        dispatch({ type: 'NAVIGATE', screen: mode.entryScreen });
        break;
    }
  }

  return (
    <div className="welcome">
      {/* Hidden file input (shared by all upload CTAs) */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* ════════════════════════════════════════════════
          SECTION 1: Hero
          ════════════════════════════════════════════════ */}
      <div className="hp-section hp-hero">
        <div className="welcome__logo" onClick={handleLogoTap} role="presentation">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="4" y="4" width="40" height="40" rx="12" stroke="currentColor" strokeWidth="2" fill="none" />
            <path d="M18 14 L24 34 L30 14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <circle cx="24" cy="14" r="3" fill="currentColor" />
          </svg>
        </div>

        <h1 className="hp-hero__headline">Know Exactly How the Shot Was Lit</h1>
        <p className="hp-hero__sub">
          Upload any reference photo. Get the complete lighting setup &mdash;
          diagram, power, position, modifier, and pattern.
        </p>

        <button
          type="button"
          className="btn btn--primary hp-hero__cta"
          onClick={triggerUpload}
        >
          Upload a Reference Photo
        </button>

        {/* Gear preference toggle */}
        <div className="hp-gear-toggle">
          {GEAR_OPTIONS.map(opt => (
            <button
              key={opt.key}
              type="button"
              className={`hp-gear-toggle__btn${gearPreference === opt.key ? ' hp-gear-toggle__btn--active' : ''}`}
              onClick={() => handleGearSelect(opt.key)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ════════════════════════════════════════════════
          SECTION 2: Example Analysis
          ════════════════════════════════════════════════ */}
      <ExampleAnalysis />

      {/* ════════════════════════════════════════════════
          SECTION 3: Example Gallery
          ════════════════════════════════════════════════ */}
      <ExampleGallery onUploadClick={triggerUpload} />

      {/* ════════════════════════════════════════════════
          SECTION 4: How Photographers Use NGW
          ════════════════════════════════════════════════ */}
      <div className="hp-section">
        <h2 className="hp-section__title">How Photographers Use NGW</h2>
        <p className="hp-section__sub">
          Three workflows for every stage of your shoot.
        </p>

        <div className="hp-workflow">
          {/* Card 1: Reverse-engineer */}
          <button
            type="button"
            className="hp-workflow__card"
            onClick={() => handleWorkflowClick('upload')}
          >
            <span className="hp-workflow__icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="m21 15-5-5L5 21" />
              </svg>
            </span>
            <span className="hp-workflow__body">
              <span className="hp-workflow__title">Reverse-Engineer Any Photo</span>
              <span className="hp-workflow__desc">Upload a reference, get the exact lighting setup</span>
            </span>
            <span className="hp-workflow__arrow">{'\u203A'}</span>
          </button>

          {/* Card 2: Plan a shoot */}
          <button
            type="button"
            className="hp-workflow__card"
            onClick={() => handleWorkflowClick('wizard')}
          >
            <span className="hp-workflow__icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
            </span>
            <span className="hp-workflow__body">
              <span className="hp-workflow__title">Plan Your Next Shoot</span>
              <span className="hp-workflow__desc">Build a lighting setup from mood + environment</span>
            </span>
            <span className="hp-workflow__arrow">{'\u203A'}</span>
          </button>

          {/* Card 3: Shoot Mode */}
          <button
            type="button"
            className="hp-workflow__card"
            onClick={() => handleWorkflowClick('shoot')}
          >
            <span className="hp-workflow__icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="6" />
                <circle cx="12" cy="12" r="2" />
              </svg>
            </span>
            <span className="hp-workflow__body">
              <span className="hp-workflow__title">Shoot Mode: On-Set Assistant</span>
              <span className="hp-workflow__desc">Step-by-step light placement, exposure checks, and troubleshooting</span>
            </span>
            <span className="hp-workflow__arrow">{'\u203A'}</span>
          </button>
        </div>
      </div>

      {/* ════════════════════════════════════════════════
          SECTION 5: Freemium Hook
          ════════════════════════════════════════════════ */}
      <div className="hp-section hp-freemium">
        <h2 className="hp-freemium__title">Your First Analysis Is Free</h2>
        <p className="hp-freemium__body">
          Upload any reference photo and get the lighting pattern, key
          direction, and modifier suggestions &mdash; on us.
        </p>
        <button
          type="button"
          className="btn btn--primary hp-freemium__cta"
          onClick={triggerUpload}
        >
          Analyze a Photo Free
        </button>
        <p className="hp-freemium__pro">
          Unlock full breakdowns, diagrams, shoot mode &amp; gear matching with <strong>NGW Pro</strong>
        </p>
      </div>

      {/* ════════════════════════════════════════════════
          Secondary links + admin modes
          ════════════════════════════════════════════════ */}
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

        {/* Admin modes (Lab, etc.) */}
        {adminModes.map(mode => (
          <ModeCard key={mode.id} mode={mode} onSelect={handleModeSelect} />
        ))}

        {/* V2 mockup link */}
        <button
          className="welcome__btn welcome__btn--secondary"
          onClick={() => dispatch({ type: 'NAVIGATE', screen: 'welcome_v2' })}
          style={{ marginTop: 12 }}
        >
          <span className="welcome__btn-icon">✨</span>
          <span className="welcome__btn-text">
            <strong>Preview V2 Homepage</strong>
            <small>Apple-inspired redesign mockup</small>
          </span>
          <span className="welcome__btn-arrow">{'\u203A'}</span>
        </button>

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
