import { useState } from 'react';
import { useDispatch } from '../context/AppContext';
import { loadKit, clearKit, hasKit } from '../data/kitStore';
import { getLightDetails } from '../data/lightCatalog';
import { getModifierDetails } from '../data/modifierCatalog';

export default function MyKitScreen() {
  const dispatch = useDispatch();
  const [kit, setKit] = useState(() => loadKit());
  const [confirmClear, setConfirmClear] = useState(false);

  function handleClear() {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    clearKit();
    setKit(null);
    setConfirmClear(false);
  }

  function handleEditKit() {
    if (kit) {
      dispatch({ type: 'LOAD_GEAR_KIT', gear: kit });
    }
    dispatch({ type: 'SET_INTENT', intent: 'edit_kit' });
  }

  if (!kit || !kit.lights?.length) {
    return (
      <div className="screen">
        <h2 className="screen-heading">My Kit</h2>
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-dim)' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5, marginBottom: 16 }}>
            <rect x="2" y="9" width="20" height="12" rx="2"/>
            <path d="M8 9V6a4 4 0 0 1 8 0v2"/>
          </svg>
          <p>No saved kit yet.</p>
          <p style={{ fontSize: 'var(--text-sm)', marginTop: 8 }}>
            Start a setup with "Use My Kit" and save your gear for next time.
          </p>
          <button
            className="btn btn--primary btn--sm"
            onClick={() => dispatch({ type: 'SET_INTENT', intent: 'edit_kit' })}
            style={{ marginTop: 20 }}
          >
            Add Equipment
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <h2 className="screen-heading">My Kit</h2>

      <div className="result-card">
        <div className="result-card__header">
          <span className="result-card__icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="5" r="3"/>
              <path d="M7 9L4 22h16L17 9"/>
            </svg>
          </span>
          <span>Lights</span>
        </div>
        {kit.lights.map((l, i) => {
          const details = getLightDetails(l.type);
          return (
            <div key={i} className="kit-item">
              <span className="kit-item__name">
                {details ? `${details.vendor} ${details.model}` : l.type}
              </span>
              <span className="kit-item__qty">{l.qty > 1 ? `\u00D7${l.qty}` : ''}</span>
              {details?.qualityTier >= 4 && (
                <span className="kit-item__badge">Pro</span>
              )}
            </div>
          );
        })}
      </div>

      {kit.modifiers?.length > 0 && (
        <div className="result-card">
          <div className="result-card__header">
            <span className="result-card__icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>
              </svg>
            </span>
            <span>Modifiers</span>
          </div>
          <div className="chip-grid" style={{ marginTop: 8 }}>
            {kit.modifiers.map(m => {
              const mod = getModifierDetails(m);
              return (
                <span key={m} className="chip chip--selected" style={{ cursor: 'default' }}>
                  {mod ? mod.label : m}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {kit.support?.length > 0 && (
        <div className="result-card">
          <div className="result-card__header">
            <span className="result-card__icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v20M2 12h20"/>
              </svg>
            </span>
            <span>Support</span>
          </div>
          {kit.support.map((s, i) => (
            <div key={i} className="kit-item">
              <span className="kit-item__name">{s.type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</span>
              <span className="kit-item__qty">{s.qty > 1 ? `\u00D7${s.qty}` : ''}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-md)' }}>
        <button className="btn btn--primary" onClick={handleEditKit} style={{ flex: 1 }}>
          Add / Edit Equipment
        </button>
        <button
          className="btn btn--ghost"
          onClick={handleClear}
          style={{ flex: 1, color: confirmClear ? 'var(--color-danger, #ef4444)' : undefined }}
        >
          {confirmClear ? 'Confirm Clear' : 'Clear Kit'}
        </button>
      </div>
    </div>
  );
}
