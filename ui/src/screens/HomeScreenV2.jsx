import { useRef, useState, useEffect } from 'react';
import { useDispatch, useAppState } from '../context/AppContext';
import { loadSetups, onSetupsChanged } from '../data/setupStore';
import usePlan from '../hooks/usePlan';

/* ─── Derive stage card data from last result / saved setup ─────────── */
// Words that should never appear as a pattern name or chip on the home screen
const STAGE_BARE = new Set(['none', 'bare', 'direct', 'ambient', 'split', 'build']);
const FILTERED_WORDS = ['split', 'build'];

function isFiltered(str) {
  if (!str) return true;
  const lower = str.toLowerCase().trim();
  return FILTERED_WORDS.some(w => lower === w || lower.startsWith(w + ' ') || lower.endsWith(' ' + w));
}

function stageCardData(result, lastSetup) {
  const bm = result?.bestMatch || lastSetup?.result?.bestMatch;
  if (!bm) return null;
  const rawName = bm.lightingPattern || bm.name || null;
  // Show the card but omit the name text if it's a filtered term
  const name = rawName && !isFiltered(rawName) ? rawName : null;
  const raw  = bm.reliabilityScore ?? bm.confidence ?? null;
  const pct  = raw != null ? (raw <= 1 ? Math.round(raw * 100) : Math.round(raw)) : null;
  const li   = result?.lightingIntelligence || lastSetup?.result?.lightingIntelligence || {};
  const chips = [];
  if (li.keyPosition && !isFiltered(li.keyPosition)) chips.push(li.keyPosition);
  if (bm.lightingGeometry && !isFiltered(bm.lightingGeometry)) chips.push(bm.lightingGeometry);
  if (li.catchlightDetected) chips.push('Catchlight');
  const mod = li.detectedModifier;
  if (mod && !STAGE_BARE.has(mod.toLowerCase().trim()) && !isFiltered(mod)) chips.push(mod);
  return { name, pct, chips: chips.slice(0, 4) };
}

/* ─── Free home ─────────────────────────────────────────────────────── */
function FreeHomeContent({ triggerUpload, handleWizard, lastSetup, dispatch, user }) {
  const stage = stageCardData(null, lastSetup);
  return (
    <>
      <div className="home-v2__hero">
        <h1 className="home-v2__headline">See your light.</h1>
        <p className="home-v2__sub">Professional lighting analysis from any photo.</p>
      </div>

      {/* Stage area — always visible; shows camera icon placeholder until analysis exists */}
      <div className="home-v2__stage">
        <div className="home-v2__stage-photo">
          <div className="home-v2__stage-photo-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="3" y="7" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.5"/>
              <circle cx="12" cy="13.5" r="3.5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M8 7V6a1 1 0 011-1h6a1 1 0 011 1v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
        </div>
        {stage ? (
          <>
            <div className="home-v2__stage-result">
              <span className="home-v2__stage-pattern">{stage.name}</span>
              {stage.pct > 0 && (
                <span className="home-v2__stage-confidence">{stage.pct}%</span>
              )}
            </div>
            {stage.chips.length > 0 && (
              <div className="home-v2__stage-chips">
                {stage.chips.map((chip, i) => (
                  <span key={i} className="home-v2__stage-chip">{chip}</span>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="home-v2__stage-result">
            <span className="home-v2__stage-pattern home-v2__stage-pattern--empty">Analyze a photo to see your lighting</span>
          </div>
        )}
      </div>

      <div className="home-v2__cta-wrap">
        <button
          type="button"
          className="ngw-primary-btn home-v2__primary-cta"
          onClick={triggerUpload}
        >
          Analyze a Photo
        </button>
        <span className="home-v2__cta-hint">Trusted by photographers who care about light</span>
      </div>

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

      </div>

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

    </>
  );
}

/* ─── Paid home ─────────────────────────────────────────────────────── */
function PaidHomeContent({ result, lastSetup, recentSetups, triggerUpload, handleWizard, dispatch }) {
  const hasResult  = !!result;
  const hasSaved   = !!lastSetup;
  const continueTarget = hasResult ? 'results' : hasSaved ? 'saved_setups' : null;
  const continueName   = hasResult ? (result.bestMatch?.name || 'View result') : (lastSetup?.name || 'Last setup');
  const continueLabel  = hasResult ? 'Resume last analysis' : 'Continue last setup';
  const stage = stageCardData(result, lastSetup);

  return (
    <>
      <div className="home-v2__hero">
        <h1 className="home-v2__headline">See your light.</h1>
        <p className="home-v2__sub">Professional lighting analysis from any photo.</p>
      </div>

      {/* ── Continue card (elevated) — only when there's something to resume ── */}
      {continueTarget && (
        <div className="home-v2__continue-card">
          <button
            type="button"
            className="home-v2__continue-card-btn"
            onClick={() => dispatch({ type: 'NAVIGATE', screen: continueTarget })}
          >
            <div className="home-v2__continue-card-icon">
              {hasResult ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="m21 15-5-5L5 21" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/>
                </svg>
              )}
            </div>
            <div className="home-v2__continue-card-text">
              <span className="home-v2__continue-card-label">{continueLabel}</span>
              <span className="home-v2__continue-card-name">{continueName}</span>
            </div>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="home-v2__continue-card-chevron">
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </button>
        </div>
      )}

      {/* Stage area — always visible */}
      <div className="home-v2__stage">
        <div className="home-v2__stage-photo">
          <div className="home-v2__stage-photo-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="3" y="7" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.5"/>
              <circle cx="12" cy="13.5" r="3.5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M8 7V6a1 1 0 011-1h6a1 1 0 011 1v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
        </div>
        {stage ? (
          <>
            <div className="home-v2__stage-result">
              <span className="home-v2__stage-pattern">{stage.name}</span>
              {stage.pct > 0 && (
                <span className="home-v2__stage-confidence">{stage.pct}%</span>
              )}
            </div>
            {stage.chips.length > 0 && (
              <div className="home-v2__stage-chips">
                {stage.chips.map((chip, i) => (
                  <span key={i} className="home-v2__stage-chip">{chip}</span>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="home-v2__stage-result">
            <span className="home-v2__stage-pattern home-v2__stage-pattern--empty">Analyze a photo to see your lighting</span>
          </div>
        )}
      </div>

      <div className="home-v2__cta-wrap">
        <button
          type="button"
          className="ngw-primary-btn home-v2__primary-cta"
          onClick={triggerUpload}
        >
          Analyze a Photo
        </button>
        <span className="home-v2__cta-hint">Trusted by photographers who care about light</span>
      </div>

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

      </div>

      {/* ── Recent setups ── */}
      {recentSetups.length > 0 && (
        <div className="home-v2__recents">
          <div className="home-v2__recents-header">
            <span className="home-v2__recents-title">Recent setups</span>
            <button
              type="button"
              className="home-v2__recents-all"
              onClick={() => dispatch({ type: 'NAVIGATE', screen: 'saved_setups' })}
            >
              See all
            </button>
          </div>
          {recentSetups.map((setup, i) => (
            <button
              key={setup.id || i}
              type="button"
              className="home-v2__recent-row"
              onClick={() => dispatch({ type: 'NAVIGATE', screen: 'saved_setups' })}
            >
              <span className="home-v2__recent-name">{setup.name || 'Untitled setup'}</span>
              {setup.subject && <span className="home-v2__recent-meta">{setup.subject}</span>}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/* ─── Screen ─────────────────────────────────────────────────────────── */
export default function HomeScreenV2() {
  const dispatch = useDispatch();
  const { user, result } = useAppState();
  const { isPaid } = usePlan(user?.email);
  const fileRef = useRef(null);

  const [setups, setSetups] = useState(() => loadSetups());
  useEffect(() => onSetupsChanged(() => setSetups(loadSetups())), []);

  const savedSetups   = setups;
  const lastSetup     = savedSetups.length > 0 ? savedSetups[savedSetups.length - 1] : null;
  // Up to 3 most-recent setups excluding the very last (shown in continue card)
  const recentSetups  = savedSetups.length > 1
    ? savedSetups.slice(0, -1).slice(-3).reverse()
    : [];

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

  function triggerUpload() { fileRef.current?.click(); }

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
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {isPaid ? (
        <PaidHomeContent
          result={result}
          lastSetup={lastSetup}
          recentSetups={recentSetups}
          triggerUpload={triggerUpload}
          handleWizard={handleWizard}
          dispatch={dispatch}
        />
      ) : (
        <FreeHomeContent
          triggerUpload={triggerUpload}
          handleWizard={handleWizard}
          lastSetup={lastSetup}
          dispatch={dispatch}
          user={user}
        />
      )}
    </div>
  );
}
