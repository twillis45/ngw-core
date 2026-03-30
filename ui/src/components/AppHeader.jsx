import { useState, useCallback, useEffect } from 'react';
import { useAppState, useDispatch } from '../context/AppContext';
import { loadTheme, saveTheme, applyTheme, getSystemTheme, THEMES } from '../data/themeStore';
import { getUser, getToken, fetchMe, saveAuth, logout as apiLogout, verifyEmail } from '../data/authApi';
import { probeAndEnableLab } from '../data/labApi';
import { isEnabled } from '../modes/featureFlags';
import { pullKitFromServer } from '../data/kitStore';
import { pullSetupsFromServer } from '../data/setupStore';
import MasterModeSelector, { MASTER_MODE_MAP } from './MasterModeSelector';
import { _pendingVerifyToken } from '../main';

function resolvedTheme() {
  return loadTheme() || getSystemTheme();
}

export default function AppHeader() {
  const { screen, history, wizardStep, user, masterMode } = useAppState();
  const isCockpit = screen === 'shoot_mode';
  const dispatch = useDispatch();
  const canGoBack = screen !== 'home' && screen !== 'loading';
  const [theme, setTheme] = useState(resolvedTheme);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const masterEnabled = isEnabled('enable_master_mode');
  const activeMaster = masterMode && MASTER_MODE_MAP[masterMode];

  // Hydrate user from localStorage on mount, auto-probe Lab access.
  // Falls back to fetchMe() when a valid token exists but no cached user
  // object — covers users whose session survived a storage key rename.
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    // Handle email verification token from URL (?verify_token=...)
    if (_pendingVerifyToken) {
      verifyEmail(_pendingVerifyToken)
        .then(me => {
          dispatch({ type: 'SET_USER', user: me });
          probeAndEnableLab().then(() => forceUpdate(n => n + 1));
          pullKitFromServer();
          pullSetupsFromServer();
          dispatch({ type: 'NAVIGATE', screen: 'home' });
        })
        .catch(() => { /* invalid/expired — user can request resend */ });
      return;
    }

    const saved = getUser();
    if (saved && !user) {
      dispatch({ type: 'SET_USER', user: saved });
      probeAndEnableLab().then(() => forceUpdate(n => n + 1));
      pullKitFromServer();
      pullSetupsFromServer();
    } else if (!saved && !user && getToken()) {
      fetchMe()
        .then(me => {
          saveAuth(getToken(), me);
          dispatch({ type: 'SET_USER', user: me });
          probeAndEnableLab().then(() => forceUpdate(n => n + 1));
          pullKitFromServer();
          pullSetupsFromServer();
        })
        .catch(() => { /* token is invalid/expired — leave logged out */ });
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
    <header className={`app-header${isCockpit ? ' app-header--cockpit' : ''}`}>
      {canGoBack && (
        <button
          type="button"
          className="app-header__back"
          onClick={handleBack}
          aria-label="Go back"
        >
          &larr;
        </button>
      )}
      <button
        className="app-header__title"
        onClick={() => dispatch({ type: 'NAVIGATE', screen: 'home' })}
        type="button"
      >
        <span className="app-header__title-main">NO GUESSWORK </span>
        <span className="app-header__title-sub">LIGHTING</span>
      </button>
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
        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        type="button"
      >
        {theme === 'dark' ? (
          /* Sun icon — dark mode, click → light */
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5"/>
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
          </svg>
        ) : (
          /* Moon icon — light mode, click → dark */
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
          </svg>
        )}
      </button>
      {isEnabled('enable_lab') && (
        <button
          className="app-header__lab-btn"
          onClick={() => {
            dispatch({ type: 'SET_APP_MODE', mode: 'lab' });
            dispatch({ type: 'NAVIGATE', screen: 'lab' });
          }}
          aria-label="NGW Lab"
          title="NGW Lab"
          type="button"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 3h6M12 3v7M5.2 21h13.6c1 0 1.7-1 1.2-1.9L14 12V3h-4v9L3.9 19.1c-.5.9.2 1.9 1.3 1.9z"/>
          </svg>
        </button>
      )}
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
          title={`${user.username || user.email || 'User'} — tap to sign out`}
          type="button"
        >
          <span className="app-header__avatar">{(user.username || user.email || '?')[0].toUpperCase()}</span>
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
