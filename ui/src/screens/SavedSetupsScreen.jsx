import { useState } from 'react';
import { useDispatch } from '../context/AppContext';
import { loadSetups, deleteSetup } from '../data/setupStore';

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'personal', label: 'Personal' },
  { value: 'studio', label: 'Studio' },
];

export default function SavedSetupsScreen() {
  const dispatch = useDispatch();
  const [setups, setSetups] = useState(() => loadSetups());
  const [filter, setFilter] = useState('all');
  const [deleteId, setDeleteId] = useState(null);

  const filtered = filter === 'all' ? setups : setups.filter(s => s.tag === filter);

  function handleLoad(setup) {
    dispatch({ type: 'SET_RESULT', result: setup.result, apiResponse: null });
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
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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
            After getting results, tap "Save Setup" to bookmark it here.
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
        <div key={setup.id} className="result-card saved-setup-card">
          <div
            className="saved-setup-card__main"
            onClick={() => handleLoad(setup)}
            style={{ cursor: 'pointer' }}
          >
            <div className="saved-setup-card__name">{setup.name}</div>
            <div className="saved-setup-card__meta">
              {setup.result?.bestMatch?.lightingPattern && (
                <span className="saved-setup-card__pattern">
                  {setup.result.bestMatch.lightingPattern}
                </span>
              )}
              <span className="saved-setup-card__tag">{setup.tag}</span>
              <span className="saved-setup-card__date">{formatDate(setup.timestamp)}</span>
            </div>
          </div>
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
