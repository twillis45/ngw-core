import { useRef, useState, useEffect } from 'react';
import { useDispatch, useAppState } from '../context/AppContext';
import { loadSetups, onSetupsChanged } from '../data/setupStore';
import usePlan from '../hooks/usePlan';

/* Static floor-plan SVG shown in the proof preview — no data dependency */
function DiagramPlaceholder() {
  return (
    <svg
      className="home-v2__proof-diagram"
      viewBox="0 0 280 160"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {/* Room floor outline */}
      <rect x="20" y="10" width="240" height="140" rx="6" stroke="var(--color-border)" strokeWidth="1.5" strokeDasharray="4 3" />

      {/* Subject (circle at center) */}
      <circle cx="140" cy="95" r="10" fill="var(--color-surface-raised)" stroke="var(--color-text-secondary)" strokeWidth="1.5" />
      <text x="140" y="118" textAnchor="middle" fontSize="9" fill="var(--color-text-dim)" fontFamily="system-ui, sans-serif">subject</text>

      {/* Camera (bottom center) */}
      <rect x="128" y="132" width="24" height="14" rx="3" fill="var(--color-surface-raised)" stroke="var(--color-text-secondary)" strokeWidth="1.2" />
      <text x="140" y="156" textAnchor="middle" fontSize="9" fill="var(--color-text-dim)" fontFamily="system-ui, sans-serif">camera</text>

      {/* Key light (top-left) */}
      <circle cx="68" cy="38" r="11" fill="var(--color-key, #60a5fa)" fillOpacity="0.18" stroke="var(--color-key, #60a5fa)" strokeWidth="1.5" />
      <text x="68" y="22" textAnchor="middle" fontSize="8" fill="var(--color-key, #60a5fa)" fontFamily="system-ui, sans-serif" fontWeight="600">KEY</text>
      {/* Key → subject line */}
      <line x1="78" y1="46" x2="132" y2="86" stroke="var(--color-key, #60a5fa)" strokeWidth="1" strokeOpacity="0.5" strokeDasharray="3 3" />

      {/* Fill light (top-right) */}
      <circle cx="212" cy="38" r="11" fill="var(--color-fill, #34d399)" fillOpacity="0.18" stroke="var(--color-fill, #34d399)" strokeWidth="1.5" />
      <text x="212" y="22" textAnchor="middle" fontSize="8" fill="var(--color-fill, #34d399)" fontFamily="system-ui, sans-serif" fontWeight="600">FILL</text>
      {/* Fill → subject line */}
      <line x1="202" y1="46" x2="148" y2="86" stroke="var(--color-fill, #34d399)" strokeWidth="1" strokeOpacity="0.5" strokeDasharray="3 3" />

      {/* Hair / rim light (top center-ish, behind subject) */}
      <circle cx="140" cy="28" r="9" fill="var(--color-rim, #f59e0b)" fillOpacity="0.18" stroke="var(--color-rim, #f59e0b)" strokeWidth="1.4" />
      <text x="140" y="15" textAnchor="middle" fontSize="8" fill="var(--color-rim, #f59e0b)" fontFamily="system-ui, sans-serif" fontWeight="600">RIM</text>
      {/* Rim → subject line */}
      <line x1="140" y1="37" x2="140" y2="85" stroke="var(--color-rim, #f59e0b)" strokeWidth="1" strokeOpacity="0.5" strokeDasharray="3 3" />
    </svg>
  );
}

export default function HomeScreenV2() {
  const dispatch = useDispatch();
  const { user } = useAppState();
  const { isPaid } = usePlan(user?.email);
  const fileRef = useRef(null);

  const [setups, setSetups] = useState(() => loadSetups());

  // Cross-tab sync — refresh when another tab saves or deletes a setup
  useEffect(() => onSetupsChanged(() => setSetups(loadSetups())), []);

  const savedSetups = setups;
  const lastSetup = savedSetups.length > 0 ? savedSetups[savedSetups.length - 1] : null;

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

  function handleWizard() {
    dispatch({ type: 'SET_APP_MODE', mode: 'build' });
    dispatch({ type: 'SET_INTENT', intent: 'mood' });
  }

  return (
    <div className="home-v2">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* ── Hero ── */}
      <div className="home-v2__hero">
        {isPaid ? (
          <>
            <h1 className="home-v2__headline">What are you shooting?</h1>
            <p className="home-v2__sub">Upload a reference or build from scratch.</p>
          </>
        ) : (
          <>
            <h1 className="home-v2__headline">Get this shot right —<br />first try.</h1>
            <p className="home-v2__sub">Upload any photo. Get the exact lighting setup in seconds.</p>
          </>
        )}
      </div>

      {/* ── Primary CTA ── */}
      <div className="home-v2__cta-wrap">
        <button
          type="button"
          className="home-v2__primary-cta"
          onClick={triggerUpload}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="m21 15-5-5L5 21" />
          </svg>
          {isPaid ? 'Analyze a photo' : 'Try it now'}
        </button>
        {!isPaid && <span className="home-v2__cta-hint">Free — no account needed</span>}
      </div>

      {/* ── Visual proof — free users only ── */}
      {!isPaid && (
        <div className="home-v2__proof-block">
          <span className="home-v2__proof-label">Setup Preview</span>
          <DiagramPlaceholder />
          <p className="home-v2__trust-line">Exact positions. Power ratios. Tested setups that hold across shots.</p>
          <div className="home-v2__proof-chips">
            <span className="home-v2__proof-chip">Beauty Clamshell</span>
            <span className="home-v2__proof-chip">Rembrandt</span>
            <span className="home-v2__proof-chip">Window Light</span>
          </div>
        </div>
      )}

      {/* ── Secondary actions ── */}
      <div className="home-v2__secondary">
        <button
          type="button"
          className="home-v2__secondary-btn"
          onClick={() => dispatch({ type: 'NAVIGATE', screen: 'recipes' })}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 19.5A2.5 2.5 0 016.5 17H20"/>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>
          </svg>
          <div className="home-v2__secondary-text">
            <span className="home-v2__secondary-label">Browse Proven Setups</span>
            <span className="home-v2__secondary-hint">Pick a look — run it today</span>
          </div>
        </button>

        <button
          type="button"
          className="home-v2__secondary-btn"
          onClick={handleWizard}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
          </svg>
          <div className="home-v2__secondary-text">
            <span className="home-v2__secondary-label">Build from Scratch</span>
            <span className="home-v2__secondary-hint">Describe your subject and space</span>
          </div>
        </button>
      </div>

      {/* ── Continue / Saved (conditional) ── */}
      {lastSetup && (
        <button
          type="button"
          className="home-v2__continue"
          onClick={() => dispatch({ type: 'NAVIGATE', screen: 'saved_setups' })}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/>
          </svg>
          <span className="home-v2__continue-label">Continue your last setup</span>
          <span className="home-v2__continue-name">{lastSetup.name || 'Last setup'}</span>
        </button>
      )}
    </div>
  );
}
