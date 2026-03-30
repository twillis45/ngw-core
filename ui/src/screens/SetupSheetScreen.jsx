import { useAppState, useDispatch } from '../context/AppContext';
import DiagramCard from '../cards/DiagramCard';
import { getRoleColor, ROLE_LABELS } from '../lib/lightRoleColors';
import { saveSetup } from '../data/setupStore';
import { saveShootRole } from '../data/shootModeStore';
import { useState } from 'react';
import { trackEvent } from '../data/analytics';
import usePaywall, { resolveUserEmail } from '../hooks/usePaywall';
import { getActivePricing } from '../data/pricingStore';
import PricingScreen from '../components/PricingScreen';

/**
 * SetupSheetScreen — intermediate detail view between Results and Cockpit.
 *
 * Shows the full setup at a glance: diagram, camera settings, and individual
 * light cards — so the photographer can review before committing to Shoot Mode.
 *
 * Tapping "Start Setup" opens a bottom-sheet mode picker (Photographer /
 * Assistant / Learning).  "Start Cockpit" commits the role and navigates.
 *
 * When the user is on the free tier (!isPaid), shows a locked variant:
 * first light visible, remaining dimmed at 15% opacity with a paywall scrim
 * overlay, "PREMIUM" badge, and CTA to open PricingScreen.
 *
 * Figma: "SetupSheet -- Dark" (node 112:2), "SetupSheet -- Locked" (node 115:2),
 *         "Cockpit -- Entry" (node 151:2)
 */
export default function SetupSheetScreen() {
  const { result, user } = useAppState();
  const dispatch = useDispatch();
  const userEmail = resolveUserEmail(user);
  const { isPaid, unlock } = usePaywall(userEmail);
  const [saved, setSaved] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedMode, setSelectedMode] = useState('photographer');
  const [pricingOpen, setPricingOpen] = useState(false);
  const locked = !isPaid;

  if (!result) {
    dispatch({ type: 'NAVIGATE', screen: 'home' });
    return null;
  }

  const bestMatch = result.bestMatch || result.cards?.bestMatch || {};
  const diagram = result.diagram || result.cards?.diagram;
  const lights = result.setup?.lights || [];
  const cam = result.cameraSettings || {};
  const patternName = bestMatch.name || 'Setup';

  function handleBack() {
    dispatch({ type: 'GO_BACK' });
  }

  function handleStartSetup() {
    if (locked) {
      setPricingOpen(true);
      trackEvent('SETUP_SHEET_PAYWALL_CTA', { setupName: patternName });
      return;
    }
    setSheetOpen(true);
    trackEvent('SETUP_SHEET_MODE_PICKER_OPENED', { setupName: patternName });
  }

  function handleStartCockpit() {
    saveShootRole(selectedMode);
    dispatch({ type: 'SET_SHOOT_ROLE', role: selectedMode });
    dispatch({ type: 'SET_APP_MODE', mode: 'shoot' });
    dispatch({ type: 'NAVIGATE', screen: 'shoot_mode' });
    trackEvent('SETUP_SHEET_START', { setupName: patternName, mode: selectedMode });
  }

  function handleShare() {
    trackEvent('SETUP_SHEET_SHARE', { setupName: patternName });
  }

  function handleSave() {
    if (saved || locked) return;
    saveSetup({ name: patternName, tag: 'personal', result });
    setSaved(true);
    trackEvent('SETUP_SAVED', { name: patternName, source: 'setup_sheet' });
    setTimeout(() => setSaved(false), 2500);
  }

  const pricing = locked ? getActivePricing() : null;
  const displayPrice = pricing ? `$${pricing.price_monthly}` : '$39';

  const MODES = [
    { key: 'photographer', label: 'Photographer', desc: 'Full details' },
    { key: 'assistant',    label: 'Assistant',    desc: 'Commands only' },
    { key: 'learning',     label: 'Learning',     desc: 'Explains why' },
  ];

  return (
    <div className="screen setup-sheet">
      {/* ── Header ── */}
      <div className="setup-sheet__header">
        <button
          className="setup-sheet__back"
          onClick={handleBack}
          type="button"
          aria-label="Go back"
        >
          &larr;
        </button>
        <span className="setup-sheet__title">{patternName}</span>
        <div className="setup-sheet__actions">
          {locked ? (
            <span className="setup-sheet__premium-badge">PREMIUM</span>
          ) : (
            <>
              <button
                className="setup-sheet__action-btn"
                onClick={handleShare}
                type="button"
                aria-label="Share"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7"/>
                  <polyline points="16 6 12 2 8 6"/>
                  <line x1="12" y1="2" x2="12" y2="15"/>
                </svg>
              </button>
              <button
                className={`setup-sheet__action-btn${saved ? ' setup-sheet__action-btn--saved' : ''}`}
                onClick={handleSave}
                type="button"
                aria-label={saved ? 'Saved' : 'Save setup'}
              >
                {saved ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5">
                    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 000-7.78z"/>
                  </svg>
                )}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Setup Diagram ── */}
      {diagram && (
        <div className="setup-sheet__diagram">
          <DiagramCard spec={diagram} title="Setup Diagram" inline legendCollapsed />
        </div>
      )}

      {/* ── Camera Settings Bar ── */}
      {(cam.aperture || cam.iso) && (
        <div className={`setup-sheet__camera-bar${locked ? ' setup-sheet__camera-bar--locked' : ''}`}>
          {cam.aperture && <span className="setup-sheet__cam-aperture">{cam.aperture}</span>}
          {cam.iso && (
            <>
              <span className="setup-sheet__cam-divider" />
              <span className="setup-sheet__cam-value">ISO {cam.iso}</span>
            </>
          )}
          {cam.shutter && (
            <>
              <span className="setup-sheet__cam-divider" />
              <span className="setup-sheet__cam-value">{cam.shutter}</span>
            </>
          )}
          {cam.wb && (
            <>
              <span className="setup-sheet__cam-divider" />
              <span className="setup-sheet__cam-wb">
                <span className="setup-sheet__cam-wb-dot" />
                {cam.wb}
              </span>
            </>
          )}
        </div>
      )}

      {/* ── Light Cards ── */}
      <div className="setup-sheet__lights-wrapper">
        <div className="setup-sheet__lights">
          {lights.map((light, i) => {
            const roleKey = (light._role || light.role || '').toLowerCase();
            const roleColor = getRoleColor(roleKey);
            const roleLabel = ROLE_LABELS[roleKey] || light.label || 'Light';
            const dimmed = locked && i > 0;

            return (
              <div
                className={`setup-sheet__light-card${dimmed ? ' setup-sheet__light-card--dimmed' : ''}`}
                key={i}
              >
                <div className="setup-sheet__light-header">
                  <span
                    className="setup-sheet__light-dot"
                    style={{ background: roleColor }}
                  />
                  <span
                    className="setup-sheet__light-role"
                    style={{ color: roleColor }}
                  >
                    {roleLabel.toUpperCase()}
                  </span>
                </div>
                <div className="setup-sheet__light-name">
                  {light.modifier}
                </div>
                <div className="setup-sheet__light-meta">
                  {light.distanceFt}
                  {light.positionText ? ` · ${light.positionText}` : ''}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Paywall Scrim Overlay ── */}
        {locked && lights.length > 1 && (
          <div className="setup-sheet__lock-scrim">
            <span className="setup-sheet__lock-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2"/>
                <path d="M7 11V7a5 5 0 0110 0v4"/>
              </svg>
            </span>
          </div>
        )}
      </div>

      {/* ── Setup Details Link (locked) ── */}
      {locked && (
        <button
          className="setup-sheet__details-link"
          onClick={() => {
            setPricingOpen(true);
            trackEvent('SETUP_SHEET_DETAILS_LINK', { setupName: patternName });
          }}
          type="button"
        >
          Setup Details &#x203A;
        </button>
      )}

      {/* ── Room Planner link ── */}
      {!locked && (
        <button
          className="setup-sheet__room-planner-link"
          onClick={() => dispatch({ type: 'NAVIGATE', screen: 'room_planner' })}
          type="button"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <line x1="3" y1="9" x2="21" y2="9"/>
            <line x1="9" y1="3" x2="9" y2="21"/>
          </svg>
          Room Planner
        </button>
      )}

      {/* ── Bottom CTA ── */}
      <div className="setup-sheet__bottom-bar">
        <button
          className={`setup-sheet__cta${locked ? ' setup-sheet__cta--locked' : ''}`}
          onClick={handleStartSetup}
          type="button"
        >
          {locked ? `Unlock Full Blueprint \u2014 ${displayPrice}/mo` : 'Start Setup'}
        </button>
      </div>

      {/* ── Mode Picker Bottom Sheet ── */}
      {sheetOpen && (
        <div className="mode-sheet__scrim" onClick={() => setSheetOpen(false)}>
          <div className="mode-sheet" onClick={e => e.stopPropagation()}>
            <div className="mode-sheet__handle" />
            <h3 className="mode-sheet__title">Choose your mode</h3>
            <p className="mode-sheet__subtitle">Each mode adapts the cockpit to your role.</p>

            <div className="mode-sheet__pills">
              {MODES.map(m => (
                <button
                  key={m.key}
                  className={`mode-sheet__pill${selectedMode === m.key ? ' mode-sheet__pill--active' : ''}`}
                  onClick={() => setSelectedMode(m.key)}
                  type="button"
                >
                  <span className="mode-sheet__pill-label">{m.label}</span>
                  <span className="mode-sheet__pill-desc">{m.desc}</span>
                </button>
              ))}
            </div>

            <button
              className="mode-sheet__cta"
              onClick={handleStartCockpit}
              type="button"
            >
              Start Cockpit
            </button>
          </div>
        </div>
      )}

      {/* ── Pricing Overlay ── */}
      {pricingOpen && (
        <PricingScreen
          onClose={() => setPricingOpen(false)}
          onUnlock={() => { unlock(); setPricingOpen(false); }}
          trigger="setup_sheet_locked"
          source="setup_sheet"
        />
      )}
    </div>
  );
}
