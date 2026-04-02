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
        setRegistered(true); // show "check your email" screen
      } else {
        const user = await login(email, password);
        dispatch({ type: 'SET_USER', user });
        await probeAndEnableLab();
        dispatch({ type: 'NAVIGATE', screen: 'welcome' });
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
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
          </div>
          <h2 className="auth-card__title">Check your email</h2>
          <p className="auth-card__subtitle">
            We sent a verification link to <strong style={{ color: 'var(--color-text)' }}>{email}</strong>.
            Click it to activate your account.
          </p>
          <p className="auth-card__hint">
            Didn't get it? Check spam or{' '}
            <button
              className="auth-card__link"
              type="button"
              onClick={async () => {
                try {
                  await resendVerification();
                  setError(null);
                } catch { /* already logged in from register token */ }
              }}
            >
              resend the email
            </button>.
          </p>
          <button
            className="btn btn--ghost auth-form__submit"
            type="button"
            onClick={() => {
              dispatch({ type: 'NAVIGATE', screen: 'welcome' });
            }}
          >
            Continue to app
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen auth-screen">
      <div className="auth-card">
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

          <button className="btn btn--primary auth-form__submit" type="submit" disabled={loading}>
            {loading ? 'Please wait...' : mode === 'login' ? 'Log In' : 'Create Account'}
          </button>
        </form>

        <div className="auth-card__footer">
          {mode === 'login' ? (
            <>
              Don't have an account?{' '}
              <button className="auth-card__link" type="button"
                onClick={() => { setMode('register'); setError(null); setShowReset(false); }}>
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button className="auth-card__link" type="button"
                onClick={() => { setMode('login'); setError(null); }}>
                Log in
              </button>
            </>
          )}
        </div>

        {mode === 'login' && (
          <div className="auth-card__footer">
            <button className="auth-card__link" type="button"
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
