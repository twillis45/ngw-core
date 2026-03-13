import { useState } from 'react';
import { useDispatch } from '../context/AppContext';
import { register, login } from '../data/authApi';
import { probeAndEnableLab } from '../data/labApi';

export default function AuthScreen() {
  const dispatch = useDispatch();
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      let user;
      if (mode === 'register') {
        user = await register(email, username, password);
      } else {
        user = await login(email, password);
      }
      dispatch({ type: 'SET_USER', user });
      // Auto-enable Lab if this user is on the dev whitelist
      await probeAndEnableLab();
      // Force re-render so welcome screen picks up the flag
      dispatch({ type: 'NAVIGATE', screen: 'welcome' });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="screen auth-screen">
      <div className="auth-card">
        <h2 className="auth-card__title">
          {mode === 'login' ? 'Sign In' : 'Create Account'}
        </h2>

        {error && <div className="auth-card__error">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <input
            className="auth-form__input"
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
          />

          {mode === 'register' && (
            <input
              className="auth-form__input"
              type="text"
              placeholder="Username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
              minLength={2}
              maxLength={32}
              autoComplete="username"
            />
          )}

          <input
            className="auth-form__input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          />

          <button
            className="btn btn--primary"
            type="submit"
            disabled={loading}
            style={{ width: '100%' }}
          >
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <button
          className="auth-card__toggle"
          onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}
          type="button"
        >
          {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  );
}
