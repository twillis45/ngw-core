import { useState, useEffect } from 'react';
import { useDispatch } from '../context/AppContext';
import { register, login, resendVerification, saveAuth } from '../data/authApi';
import { probeAndEnableLab } from '../data/labApi';

export default function AuthScreen() {
  const dispatch = useDispatch();
  // modes: 'login' | 'register' | 'forgot' | 'reset'
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false); // post-register "check email" state
  const [forgotSent, setForgotSent] = useState(false); // post-forgot "check email" state
  const [resetToken, setResetToken] = useState(null);  // from sessionStorage on URL return

  // On mount — check if we're returning from a password-reset email link
  useEffect(() => {
    try {
      const token = sessionStorage.getItem('ngw_reset_token');
      if (token) {
        sessionStorage.removeItem('ngw_reset_token');
        setResetToken(token);
        setMode('reset');
      }
    } catch { /* ignore */ }
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'register') {
        await register(email, name, password);
        setRegistered(true);
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

  async function handleForgotSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/password-reset/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Request failed');
      setForgotSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResetSubmit(e) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, new_password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Reset failed');
      saveAuth(data.token, data.user);
      dispatch({ type: 'SET_USER', user: data.user });
      await probeAndEnableLab().catch(() => {});
      dispatch({ type: 'NAVIGATE', screen: 'home' });
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

  // ── Password reset mode (returning from email link) ──
  if (mode === 'reset') {
    return (
      <div className="screen auth-screen">
        <div className="auth-card">
          <h2 className="auth-card__title">Set a new password</h2>
          <p className="auth-card__subtitle">Choose a new password for your account.</p>
          {error && <div className="auth-card__error">{error}</div>}
          <form onSubmit={handleResetSubmit} className="auth-form">
            <div className="auth-form__field">
              <label className="auth-form__label" htmlFor="auth-new-pw">New password</label>
              <input
                id="auth-new-pw"
                className="auth-form__input"
                type="password"
                placeholder="At least 6 characters"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
                minLength={6}
                autoFocus
                autoComplete="new-password"
              />
            </div>
            <div className="auth-form__field">
              <label className="auth-form__label" htmlFor="auth-confirm-pw">Confirm password</label>
              <input
                id="auth-confirm-pw"
                className="auth-form__input"
                type="password"
                placeholder="Same password again"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
            <button className="auth-form__submit" type="submit" disabled={loading}>
              {loading ? 'Saving…' : 'Set New Password & Sign In'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Forgot password mode ──
  if (mode === 'forgot') {
    if (forgotSent) {
      return (
        <div className="screen auth-screen">
          <div className="auth-card">
            <div className="auth-card__check-icon">
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <circle cx="24" cy="24" r="24" fill="rgba(200,169,110,0.15)"/>
                <path d="M16 24l6 6 10-12" stroke="#C8A96E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              </svg>
            </div>
            <h2 className="auth-card__title">Check your email</h2>
            <p className="auth-card__subtitle">
              If <strong>{email}</strong> has a password-based account, a reset link was sent.
            </p>
            <p className="auth-card__subtitle" style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
              The link expires in 1 hour. Check your spam folder if you don't see it.
            </p>
            <div className="auth-card__footer">
              <button className="auth-card__link" type="button"
                onClick={() => { setMode('login'); setForgotSent(false); setError(null); }}>
                Back to sign in
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
            onClick={() => { setMode('login'); setError(null); }}
            aria-label="Back to sign in"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
          <h2 className="auth-card__title">Reset your password</h2>
          <p className="auth-card__subtitle">Enter the email on your account and we'll send a reset link.</p>
          {error && <div className="auth-card__error">{error}</div>}
          <form onSubmit={handleForgotSubmit} className="auth-form">
            <div className="auth-form__field">
              <label className="auth-form__label" htmlFor="auth-forgot-email">Email</label>
              <input
                id="auth-forgot-email"
                className="auth-form__input"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                autoComplete="email"
              />
            </div>
            <button className="auth-form__submit" type="submit" disabled={loading}>
              {loading ? 'Sending…' : 'Send Reset Link'}
            </button>
          </form>
          <div className="auth-card__footer">
            <button className="auth-card__link" type="button"
              onClick={() => { setMode('login'); setError(null); }}>
              Back to sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Login / Register ──
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
          {mode === 'login' ? 'Sign in' : 'Create your account'}
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
            {loading ? 'Please wait…' : mode === 'login' ? 'Log In' : 'Create Account'}
          </button>
        </form>

        <div className="auth-card__divider" />

        <div className="auth-card__footer">
          {mode === 'login' ? (
            <button className="auth-card__link" type="button"
              onClick={() => { setMode('register'); setError(null); }}>
              Don't have an account? Sign up →
            </button>
          ) : (
            <button className="auth-card__link" type="button"
              onClick={() => { setMode('login'); setError(null); }}>
              Already have an account? Log in →
            </button>
          )}
        </div>

        {mode === 'login' && (
          <div className="auth-card__footer" style={{ marginTop: 'var(--space-xs)' }}>
            <button
              className="auth-card__link auth-card__link--forgot"
              type="button"
              onClick={() => { setMode('forgot'); setError(null); }}
            >
              Forgot your password?
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
