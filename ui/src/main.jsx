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
  // QA free-mode — forces free-tier regardless of admin email or ngw_paid localStorage.
  // Use ?qa_free=1 to test paywall flows without manually clearing storage each session.
  // Stored in sessionStorage so it resets on tab close — never persists accidentally.
  if (params.get('qa_free') === '1') {
    try { sessionStorage.setItem('ngw_qa_free', '1'); } catch { /* ignore */ }
    params.delete('qa_free');
    dirty = true;
  }
  const vt = params.get('verify_token');
  if (vt) {
    _pendingVerifyToken = vt;
    params.delete('verify_token');
    dirty = true;
  }
  // Stripe checkout return — set paid flag before React mounts so usePaywall
  // initialises with isPaid=true without needing a re-render or extra state sync.
  // Also stash the session_id so usePaywall can verify server-side on first render.
  if (params.get('checkout_success') === '1') {
    try { localStorage.setItem('ngw_paid', 'true'); } catch { /* ignore */ }
    const sid = params.get('session_id');
    if (sid) {
      try { localStorage.setItem('ngw_stripe_session', sid); } catch { /* ignore */ }
    }
    // Signal App.jsx to redirect into Shoot Mode (post-payment UX).
    // Stored in sessionStorage so it fires once and resets on tab close.
    try { sessionStorage.setItem('ngw_post_payment', '1'); } catch { /* ignore */ }
    params.delete('checkout_success');
    params.delete('session_id');
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
