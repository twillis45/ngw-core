import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AppProvider } from './context/AppContext';
import ErrorBoundary from './components/ErrorBoundary';
import { loadTheme, applyTheme } from './data/themeStore';
import { applySettings } from './data/settingsStore';
import { setFlag } from './modes/featureFlags';
import './theme/tokens.css';
import './styles/app.css';

/* Apply saved theme and settings before first paint */
applyTheme(loadTheme());
applySettings();

/* URL param shortcuts — dev builds only */
let _devModeUser = null;
let _pendingVerifyToken = null;
try {
  const params = new URLSearchParams(window.location.search);
  let dirty = false;
  if (params.get('lab') === '1') {
    setFlag('enable_lab', true);
    params.delete('lab');
    dirty = true;
  }
  if (import.meta.env.DEV && params.get('devmode') === '1') {
    setFlag('enable_lab', true);
    _devModeUser = { id: 'dev-mode', email: 'dev@localhost', username: 'Dev Mode' };
    localStorage.setItem('ngw_auth_user', JSON.stringify(_devModeUser));
    params.delete('devmode');
    dirty = true;
  }
  const vt = params.get('verify_token');
  if (vt) {
    _pendingVerifyToken = vt;
    params.delete('verify_token');
    dirty = true;
  }
  if (dirty) {
    const clean = params.toString();
    const url = window.location.pathname + (clean ? `?${clean}` : '');
    window.history.replaceState(null, '', url);
  }
} catch { /* ignore */ }

export { _devModeUser, _pendingVerifyToken };

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AppProvider devModeUser={_devModeUser}>
        <App />
      </AppProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
