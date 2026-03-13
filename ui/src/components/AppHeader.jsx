import { useState, useCallback, useEffect } from 'react';
import { useAppState, useDispatch } from '../context/AppContext';
import { loadTheme, saveTheme, applyTheme, getSystemTheme, THEMES } from '../data/themeStore';
import { getUser, logout as apiLogout } from '../data/authApi';
import { probeAndEnableLab } from '../data/labApi';
import { isEnabled } from '../modes/featureFlags';
import MasterModeSelector, { MASTER_MODE_MAP } from './MasterModeSelector';

function resolvedTheme() {
  return loadTheme() || getSystemTheme();
}

export default function AppHeader() {
  const { screen, history, wizardStep, user, masterMode } = useAppState();
  const dispatch = useDispatch();
  const canGoBack = screen !== 'welcome' && screen !== 'loading';
  const [theme, setTheme] = useState(resolvedTheme);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const masterEnabled = isEnabled('enable_master_mode');
  const activeMaster = masterMode && MASTER_MODE_MAP[masterMode];

  // Hydrate user from localStorage on mount, auto-probe Lab access
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const saved = getUser();
    if (saved && !user) {
      dispatch({ type: 'SET_USER', user: saved });
      probeAndEnableLab().then(() => forceUpdate(n => n + 1));
    }
  }, []);

  const toggleTheme = useCallback(() => {
    const idx = THEMES.indexOf(theme);
    const next = THEMES[(idx + 1) % THEMES.length];
    saveTheme(next);
    applyTheme(next);
    setTheme(next);
  }, [theme]);

  function handleBack() {
    if (screen === 'wizard') {
      dispatch({ type: 'WIZARD_BACK' });
    } else {
      dispatch({ type: 'GO_BACK' });
    }
  }

  return (
    <header className="app-header">
      {canGoBack && (
        <button
          className="app-header__back"
          onClick={handleBack}
          aria-label="Go back"
        >
          &larr;
        </button>
      )}
      <button
        className="app-header__title"
        onClick={() => dispatch({ type: 'NAVIGATE', screen: 'welcome' })}
        type="button"
      >No Guesswork Lighting</button>
      {masterEnabled && activeMaster && (
        <button
          className="header__master-badge"
          onClick={() => setSelectorOpen(true)}
          type="button"
          title={`${activeMaster.label} active — tap to change`}
        >
          {activeMaster.icon} {activeMaster.label}
        </button>
      )}
      <button
        className="app-header__theme-toggle"
        onClick={toggleTheme}
        aria-label={`Switch to ${THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]} mode`}
        title={theme === 'photoshop' ? 'Ps' : theme === 'lightroom' ? 'Lr' : theme === 'daynote' ? 'DN' : undefined}
        type="button"
      >
        {theme === 'dark' ? (
          /* Sun icon — shown in dark mode, click → light */
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5"/>
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
          </svg>
        ) : theme === 'light' ? (
          /* Grid/panels icon — shown in light mode, click → photoshop */
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="9" rx="1"/>
            <rect x="14" y="3" width="7" height="5" rx="1"/>
            <rect x="14" y="12" width="7" height="9" rx="1"/>
            <rect x="3" y="16" width="7" height="5" rx="1"/>
          </svg>
        ) : theme === 'photoshop' ? (
          /* Sliders icon — shown in photoshop mode, click → lightroom */
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="21" x2="4" y2="14"/>
            <line x1="4" y1="10" x2="4" y2="3"/>
            <line x1="12" y1="21" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12" y2="3"/>
            <line x1="20" y1="21" x2="20" y2="16"/>
            <line x1="20" y1="12" x2="20" y2="3"/>
            <line x1="1" y1="14" x2="7" y2="14"/>
            <line x1="9" y1="8" x2="15" y2="8"/>
            <line x1="17" y1="16" x2="23" y2="16"/>
          </svg>
        ) : theme === 'lightroom' ? (
          /* Notepad icon — shown in lightroom mode, click → daynote */
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9"/>
            <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
        ) : (
          /* Moon icon — shown in daynote mode, click → dark */
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
          </svg>
        )}
      </button>
      <button
        className="app-header__settings-btn"
        onClick={() => dispatch({ type: 'NAVIGATE', screen: 'settings' })}
        aria-label="Settings"
        type="button"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
        </svg>
      </button>

      {user ? (
        <button
          className="app-header__user-btn"
          onClick={() => {
            apiLogout();
            dispatch({ type: 'LOGOUT' });
          }}
          title={`${user.username} — tap to sign out`}
          type="button"
        >
          <span className="app-header__avatar">{user.username[0].toUpperCase()}</span>
        </button>
      ) : (
        <button
          className="app-header__user-btn"
          onClick={() => dispatch({ type: 'NAVIGATE', screen: 'auth' })}
          aria-label="Sign in"
          type="button"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        </button>
      )}
      {masterEnabled && (
        <MasterModeSelector open={selectorOpen} onClose={() => setSelectorOpen(false)} />
      )}
    </header>
  );
}
