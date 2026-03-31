import { useState, useCallback, useEffect } from 'react';
import { useAppState, useDispatch } from './context/AppContext';

import AppHeader from './components/AppHeader';
import PreviewBanner from './components/PreviewBanner';
import BottomNav from './components/BottomNav';
import Toast from './components/Toast';
import HomeScreen from './screens/HomeScreenV2';
import SetupWizard from './screens/SetupWizard';
import LoadingScreen from './screens/LoadingScreen';
import ResultsScreenV2 from './screens/ResultsScreenV2';
// ResultsScreen (v1) — deprecated. File kept for reference; route removed. Use ResultsScreenV2.
import RecipeScreen from './screens/RecipeScreen';
import MyKitScreen from './screens/MyKitScreen';
import SavedSetupsScreen from './screens/SavedSetupsScreen';
import AuthScreen from './screens/AuthScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import ReferenceEvalScreen from './screens/ReferenceEvalScreen';
import SetupSheetScreen from './screens/SetupSheetScreen';
import ShootModeScreen from './screens/ShootModeScreen';
import ShotMatchScreen from './screens/ShotMatchScreen';
import LabScreen from './screens/LabScreen';
import RoomPlannerScreen from './screens/RoomPlannerScreen';
import SettingsScreen from './screens/SettingsScreen';
// WelcomeScreenV2 (marketing landing) — removed from in-app shell.
// File kept for potential standalone marketing route.
import AnalyticsDashboard from './screens/AnalyticsDashboard';
import ExecDashboard from './screens/ExecDashboard';
import SymptomPage from './screens/SymptomPage';

const SCREENS = {
  home:    HomeScreen,
  wizard:  SetupWizard,
  loading: LoadingScreen,
  results: ResultsScreenV2,
  recipes: RecipeScreen,
  my_kit:  MyKitScreen,
  saved_setups: SavedSetupsScreen,
  auth: AuthScreen,
  onboarding: OnboardingScreen,
  ref_eval: ReferenceEvalScreen,
  setup_sheet: SetupSheetScreen,
  shoot_mode: ShootModeScreen,
  shot_match: ShotMatchScreen,
  lab: LabScreen,
  room_planner: RoomPlannerScreen,
  settings: SettingsScreen,
  analytics: AnalyticsDashboard,
  exec: ExecDashboard,
  symptom: SymptomPage,
};

function buildShareText(result) {
  if (!result) return '';
  const div = '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500';
  const lines = [];

  lines.push(div);
  lines.push(`  ${result.bestMatch.name}`);
  if (result.bestMatch.lightingPattern) {
    lines.push(`  ${result.bestMatch.lightingPattern} Pattern`);
  }
  lines.push(div);
  lines.push('');

  lines.push('SETUP');
  result.setup.lights.forEach(l => {
    lines.push(`  ${l.label}`);
    lines.push(`    ${l.modifier} \u2022 ${l.positionText}`);
    lines.push(`    ${l.distanceFt} \u2022 ${l.powerHint}`);
  });

  if (result.cameraSettings) {
    lines.push('');
    lines.push('CAMERA');
    lines.push(`  ${result.cameraSettings.aperture} \u2022 ISO ${result.cameraSettings.iso} \u2022 ${result.cameraSettings.shutter}`);
    lines.push(`  WB: ${result.cameraSettings.wb}`);
  }

  lines.push('');
  lines.push(div);
  lines.push('Built with No Guesswork Lighting');
  return lines.join('\n');
}

export default function App() {
  const { screen, result } = useAppState();
  const dispatch = useDispatch();
  const Screen = SCREENS[screen] || HomeScreen;
  const [toast, setToast] = useState(null);
  const dismissToast = useCallback(() => setToast(null), []);

  const [shareOpen, setShareOpen] = useState(false);

  // Magic link return — verify token and authenticate before anything else renders.
  useEffect(() => {
    const mt = (() => { try { return sessionStorage.getItem('ngw_magic_token'); } catch { return null; } })();
    if (!mt) return;
    try { sessionStorage.removeItem('ngw_magic_token'); } catch { /* ignore */ }
    fetch('/api/auth/magic-link/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: mt }),
    }).then(async r => {
      if (!r.ok) return;
      const data = await r.json();
      const { saveAuth } = await import('./data/authApi');
      const { probeAndEnableLab } = await import('./data/labApi');
      saveAuth(data.token, data.user);
      dispatch({ type: 'SET_USER', user: data.user });
      await probeAndEnableLab().catch(() => {});
      // Restore upgrade intent if present
      try {
        const raw = sessionStorage.getItem('ngw_upgrade_intent');
        if (raw) {
          // Intent will be picked up by PricingScreen on next open
          dispatch({ type: 'NAVIGATE', screen: 'home' });
        }
      } catch { /* ignore */ }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Post-payment redirect — fires once on mount when returning from Stripe checkout.
  // main.jsx sets ngw_post_payment=1 in sessionStorage before React mounts.
  // sessionStorage resets on tab close so this only fires once per checkout.
  useEffect(() => {
    try {
      if (sessionStorage.getItem('ngw_post_payment') === '1') {
        sessionStorage.removeItem('ngw_post_payment');
        dispatch({ type: 'NAVIGATE', screen: 'shoot_mode' });
      }
    } catch { /* ignore — sessionStorage unavailable */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally runs once on mount only

  function handleShare() {
    if (!result) return;
    setShareOpen(true);
  }

  async function shareVia(method) {
    setShareOpen(false);
    const text = buildShareText(result);
    if (!text) return;
    const title = `No Guesswork: ${result.bestMatch.name}`;

    switch (method) {
      case 'native':
        try { await navigator.share({ title, text }); } catch {}
        break;
      case 'sms':
        window.open(`sms:?&body=${encodeURIComponent(text)}`);
        break;
      case 'email':
        window.open(`mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text)}`);
        break;
      case 'copy':
        try {
          await navigator.clipboard.writeText(text);
          setToast('Copied to clipboard');
        } catch {
          setToast('Could not copy');
        }
        break;
    }
  }

  /* Bottom nav visible only on hub / browse screens */
  // 'welcome' is the initialState key that falls back to HomeScreen — treat it as 'home'
  const HUB_SCREENS = new Set(['home', 'welcome', 'recipes', 'my_kit', 'saved_setups']);
  const showBottomNav = HUB_SCREENS.has(screen);

  /* AppHeader only on screens that don't have their own standalone header chrome */
  const HEADER_SCREENS = new Set(['home', 'welcome', 'results', 'shoot_mode', 'loading']);
  const showAppHeader = HEADER_SCREENS.has(screen);

  return (
    <>
      {showAppHeader && <AppHeader />}
      <PreviewBanner />
      <div className="app-layout">
        {showBottomNav && <BottomNav />}
        <Screen onShare={handleShare} />
      </div>
      <Toast message={toast} visible={!!toast} onDone={dismissToast} />

      {shareOpen && (
        <div className="share-sheet-overlay" onClick={() => setShareOpen(false)}>
          <div className="share-sheet" onClick={e => e.stopPropagation()}>
            <div className="share-sheet__title">Share Setup</div>
            {navigator.share && (
              <button className="share-sheet__option" onClick={() => shareVia('native')}>
                <span className="share-sheet__icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7"/>
                    <polyline points="16 6 12 2 8 6"/>
                    <line x1="12" y1="2" x2="12" y2="15"/>
                  </svg>
                </span>
                More Options...
              </button>
            )}
            <button className="share-sheet__option" onClick={() => shareVia('sms')}>
              <span className="share-sheet__icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
                </svg>
              </span>
              Text Message
            </button>
            <button className="share-sheet__option" onClick={() => shareVia('email')}>
              <span className="share-sheet__icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2"/>
                  <path d="M22 4L12 13 2 4"/>
                </svg>
              </span>
              Email
            </button>
            <button className="share-sheet__option" onClick={() => shareVia('copy')}>
              <span className="share-sheet__icon">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2"/>
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                </svg>
              </span>
              Copy to Clipboard
            </button>
            <button className="share-sheet__cancel" onClick={() => setShareOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
    </>
  );
}
