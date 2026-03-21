import { useState, useCallback } from 'react';
import { useAppState } from './context/AppContext';

import AppHeader from './components/AppHeader';
import BottomNav from './components/BottomNav';
import Toast from './components/Toast';
import WelcomeScreen from './screens/WelcomeScreen';
import HomeScreenV2 from './screens/HomeScreenV2';
import SetupWizard from './screens/SetupWizard';
import LoadingScreen from './screens/LoadingScreen';
import ResultsScreen from './screens/ResultsScreen';
import ResultsScreenV2 from './screens/ResultsScreenV2';
import RecipeScreen from './screens/RecipeScreen';
import MyKitScreen from './screens/MyKitScreen';
import SavedSetupsScreen from './screens/SavedSetupsScreen';
import AuthScreen from './screens/AuthScreen';
import ReferenceEvalScreen from './screens/ReferenceEvalScreen';
import ShootModeScreen from './screens/ShootModeScreen';
import ShotMatchScreen from './screens/ShotMatchScreen';
import LabScreen from './screens/LabScreen';
import RoomPlannerScreen from './screens/RoomPlannerScreen';
import SettingsScreen from './screens/SettingsScreen';
import WelcomeScreenV2 from './screens/WelcomeScreenV2';
import AnalyticsDashboard from './screens/AnalyticsDashboard';
import ExecDashboard from './screens/ExecDashboard';
import SymptomPage from './screens/SymptomPage';

const SCREENS = {
  welcome: HomeScreenV2,
  welcome_v1: WelcomeScreen,
  welcome_v2: WelcomeScreenV2,
  wizard:  SetupWizard,
  loading: LoadingScreen,
  results: ResultsScreenV2,
  results_v1: ResultsScreen,
  recipes: RecipeScreen,
  my_kit:  MyKitScreen,
  saved_setups: SavedSetupsScreen,
  auth: AuthScreen,
  ref_eval: ReferenceEvalScreen,
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
  const Screen = SCREENS[screen] || WelcomeScreen;
  const [toast, setToast] = useState(null);
  const dismissToast = useCallback(() => setToast(null), []);

  const [shareOpen, setShareOpen] = useState(false);

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

  const isV2 = screen === 'welcome_v2';

  return (
    <>
      {!isV2 && <AppHeader />}
      <div className="app-layout">
        {!isV2 && <BottomNav onShare={handleShare} />}
        <Screen />
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
