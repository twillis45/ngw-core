import { useState } from 'react';
import { useDispatch } from '../context/AppContext';
import { register, login, resendVerification } from '../data/authApi';
import { probeAndEnableLab } from '../data/labApi';

export default function AuthScreen() {
  const dispatch = useDispatch();
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [registered, setRegistered] = useState(false); // post-register "check email" state

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'register') {
        await register(email, name, password);
        setRegistered(true); // show "check your email" → then onboarding
      } else {
        const user = await login(email, password);
        dispatch({ type: 'SET_USER', user });
        await probeAndEnableLab();
        dispatch({ type: 'NAVIGATE', screen: 'home' });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Post-registration confirmation screen
  if (registered) {
    return (
      <div className="screen auth-screen">
        <div className="auth-card">
          <div className="auth-card__check-icon">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="24" fill="rgba(34,197,94,0.15)"/>
              <path d="M16 24l6 6 10-12" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
          </div>
          <h2 className="auth-card__title">Check your email</h2>
          <p className="auth-card__subtitle">
            We sent a verification link to
          </p>
          <p style={{ textAlign: 'center', fontWeight: 600, color: 'var(--color-text)', marginBottom: 'var(--space-xl)' }}>{email}</p>
          <button
            className="auth-form__submit"
            type="button"
            style={{ background: 'var(--color-surface-elevated, #1e2028)', color: 'var(--color-text)' }}
            onClick={() => {
              dispatch({ type: 'NAVIGATE', screen: 'onboarding' });
            }}
          >
            Continue to app →
          </button>
          <div className="auth-card__footer">
            <button
              className="auth-card__link auth-card__link--forgot"
              type="button"
              onClick={async () => {
                try {
                  await resendVerification();
                  setError(null);
                } catch { /* already logged in from register token */ }
              }}
            >
              Didn't get it?  Resend verification
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="screen auth-screen">
      <div className="auth-card">
        <button
          className="auth-card__close"
          type="button"
          onClick={() => dispatch({ type: 'GO_BACK' })}
          aria-label="Close"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
        <h2 className="auth-card__title">
          {mode === 'login' ? 'Welcome back' : 'Create your account'}
        </h2>
        <p className="auth-card__subtitle">
          {mode === 'login' ? 'Log in to your NGW account' : 'Start analyzing lighting in seconds'}
        </p>

        {error && <div className="auth-card__error">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="auth-form__field">
            <label className="auth-form__label" htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              className="auth-form__input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          {mode === 'register' && (
            <div className="auth-form__field">
              <label className="auth-form__label" htmlFor="auth-name">Name</label>
              <input
                id="auth-name"
                className="auth-form__input"
                type="text"
                placeholder="Your name"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                minLength={2}
                maxLength={32}
                autoComplete="name"
              />
            </div>
          )}

          <div className="auth-form__field">
            <label className="auth-form__label" htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              className="auth-form__input"
              type="password"
              placeholder={mode === 'register' ? 'Create a password' : 'Your password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            />
          </div>

          <button className="auth-form__submit" type="submit" disabled={loading}>
            {loading ? 'Please wait...' : mode === 'login' ? 'Log In' : 'Create Account'}
          </button>
        </form>

        <div className="auth-card__divider" />

        <div className="auth-card__footer">
          {mode === 'login' ? (
            <button className="auth-card__link" type="button"
              onClick={() => { setMode('register'); setError(null); setShowReset(false); }}>
              Don't have an account?  Sign up →
            </button>
          ) : (
            <button className="auth-card__link" type="button"
              onClick={() => { setMode('login'); setError(null); }}>
              Already have an account?  Log in →
            </button>
          )}
        </div>

        {mode === 'login' && (
          <div className="auth-card__footer" style={{ marginTop: 'var(--space-xs)' }}>
            <button className="auth-card__link auth-card__link--forgot" type="button"
              onClick={() => setShowReset(!showReset)}>
              {showReset ? 'Hide reset instructions' : 'Forgot your password?'}
            </button>
            {showReset && (
              <div className="auth-card__reset-info">
                <strong>To reset your password:</strong>
                <p>Email <a href="mailto:info@noguessworksystems.com">info@noguessworksystems.com</a> from the address on your account. We'll send a reset link within a few hours.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
