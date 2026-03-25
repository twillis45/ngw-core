import { useState, useEffect } from 'react';
import { useDispatch } from '../context/AppContext';
import { loadSetups, deleteSetup, onSetupsChanged } from '../data/setupStore';
import { trackEvent } from '../data/analytics';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'personal', label: 'Personal' },
  { value: 'studio', label: 'Studio' },
];

const LAST_USED_KEY = 'ngw_last_used_setup';

function getLastUsedId() {
  try { return localStorage.getItem(LAST_USED_KEY); } catch { return null; }
}

function setLastUsedId(id) {
  try { localStorage.setItem(LAST_USED_KEY, id); } catch {}
}

export default function SavedSetupsScreen() {
  const dispatch = useDispatch();
  const [setups, setSetups] = useState(() => loadSetups());
  const [filter, setFilter] = useState('all');
  const [deleteId, setDeleteId] = useState(null);
  const [lastUsedId, setLastUsedIdState] = useState(() => getLastUsedId());

  // Cross-tab sync — refresh when another tab saves or deletes a setup
  useEffect(() => onSetupsChanged(() => setSetups(loadSetups())), []);

  // Build filtered list with last-used setup pinned to top
  const base = filter === 'all' ? setups : setups.filter(s => s.tag === filter);
  const filtered = lastUsedId
    ? [...base].sort((a, b) => {
        if (a.id === lastUsedId) return -1;
        if (b.id === lastUsedId) return 1;
        return 0;
      })
    : base;

  function markLastUsed(id) {
    setLastUsedId(id);
    setLastUsedIdState(id);
  }

  function handleLoad(setup) {
    markLastUsed(setup.id);
    dispatch({ type: 'SET_RESULT', result: setup.result, apiResponse: null });
    dispatch({ type: 'NAVIGATE', screen: 'results' });
    trackEvent('SETUP_LOADED', { setupId: setup.id, name: setup.name });
  }

  // Phase 7: Recreate flow — load the saved result and enter Shoot Mode
  function handleRecreate(setup) {
    markLastUsed(setup.id);
    dispatch({ type: 'SET_RESULT', result: setup.result, apiResponse: null });
    dispatch({ type: 'SET_APP_MODE', mode: 'shoot' });
    dispatch({ type: 'NAVIGATE', screen: 'shoot_mode' });
    trackEvent('SETUP_RECREATED', { setupId: setup.id, name: setup.name });
  }

  function handleDelete(id) {
    if (deleteId !== id) {
      setDeleteId(id);
      return;
    }
    const updated = deleteSetup(id);
    setSetups(updated);
    setDeleteId(null);
  }

  function formatDate(ts) {
    if (ts == null) return '';
    // Local timestamps are ms (Date.now()); server timestamps are seconds (time.time())
    const ms = ts < 1e12 ? ts * 1000 : ts;
    const d = new Date(ms);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, {
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      month: 'short', day: 'numeric',
    });
  }

  if (setups.length === 0) {
    return (
      <div className="screen">
        <h2 className="screen-heading">Saved Setups</h2>
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-dim)' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5, marginBottom: 16 }}>
            <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/>
          </svg>
          <p>No saved setups yet.</p>
          <p style={{ fontSize: 'var(--text-sm)', marginTop: 8 }}>
            Lock a setup after dialing it in — run it again on your next shoot.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <h2 className="screen-heading">Saved Setups</h2>

      <div className="chip-grid" style={{ marginBottom: 'var(--space-md)' }}>
        {FILTERS.map(f => (
          <button
            key={f.value}
            className={`chip${filter === f.value ? ' chip--selected' : ''}`}
            onClick={() => setFilter(f.value)}
            type="button"
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.map(setup => (
        <div key={setup.id} className={`result-card saved-setup-card${setup.id === lastUsedId ? ' saved-setup-card--last-used' : ''}`}>
          <div
            className="saved-setup-card__main"
            onClick={() => handleLoad(setup)}
            style={{ cursor: 'pointer' }}
          >
            <div className="saved-setup-card__name">
              {setup.name}
              {setup.id === lastUsedId && (
                <span className="saved-setup-card__last-used-badge">Last used</span>
              )}
            </div>
            <div className="saved-setup-card__meta">
              {setup.result?.bestMatch?.lightingPattern && (
                <span className="saved-setup-card__pattern">
                  {setup.result.bestMatch.lightingPattern}
                </span>
              )}
              <span className="saved-setup-card__tag">{setup.tag}</span>
              <span className="saved-setup-card__date">{formatDate(setup.timestamp ?? setup.created_at)}</span>
            </div>
          </div>

          {/* Run again — enter Shoot Mode with this saved result */}
          <button
            className="saved-setup-card__recreate"
            onClick={(e) => { e.stopPropagation(); handleRecreate(setup); }}
            type="button"
            title="Run this setup again in Shoot Mode"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            Run again
          </button>

          <button
            className="saved-setup-card__delete"
            onClick={(e) => { e.stopPropagation(); handleDelete(setup.id); }}
            type="button"
            title="Delete setup"
          >
            {deleteId === setup.id ? (
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-danger, #ef4444)' }}>Delete?</span>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
              </svg>
            )}
          </button>
        </div>
      ))}
    </div>
  );
}
