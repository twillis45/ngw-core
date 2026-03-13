import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AppProvider } from './context/AppContext';
import { loadTheme, applyTheme } from './data/themeStore';
import { applySettings } from './data/settingsStore';
import { setFlag } from './modes/featureFlags';
import './theme/tokens.css';
import './styles/app.css';

/* Apply saved theme and settings before first paint */
applyTheme(loadTheme());
applySettings();

/* URL param shortcuts for dev testing:
   ?lab=1      — enables Lab feature flag only
   ?devmode=1  — enables Lab + injects mock dev user (full bypass) */
let _devModeUser = null;
try {
  const params = new URLSearchParams(window.location.search);
  let dirty = false;
  if (params.get('lab') === '1') {
    setFlag('enable_lab', true);
    params.delete('lab');
    dirty = true;
  }
  if (params.get('devmode') === '1') {
    setFlag('enable_lab', true);
    _devModeUser = { id: 'dev-mode', email: 'dev@localhost', username: 'Dev Mode' };
    // Persist so AppHeader hydration picks it up on re-renders
    localStorage.setItem('ngw_auth_user', JSON.stringify(_devModeUser));
    params.delete('devmode');
    dirty = true;
  }
  if (dirty) {
    const clean = params.toString();
    const url = window.location.pathname + (clean ? `?${clean}` : '');
    window.history.replaceState(null, '', url);
  }
} catch { /* ignore */ }

export { _devModeUser };

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppProvider devModeUser={_devModeUser}>
      <App />
    </AppProvider>
  </React.StrictMode>
);
