import { useState, useEffect } from 'react';
import { useDispatch } from '../context/AppContext';
import { loadSetups, deleteSetup, onSetupsChanged } from '../data/setupStore';
import { trackEvent } from '../data/analytics';
import { fmtPattern } from '../lib/formatters';

/**
 * SavedSetupsScreen — library of saved lighting setups.
 *
 * Figma: "Saved Setups — Populated (Dark)" (node 249:2),
 *        "Saved Setups — Empty (Dark)" (node 249:67)
 *
 * Each card shows: mini diagram thumbnail (left), setup name, pattern tag,
 * light count chip, date, optional note, and a ⋮ overflow menu.
 */

const LAST_USED_KEY = 'ngw_last_used_setup';

function getLastUsedId() {
  try { return localStorage.getItem(LAST_USED_KEY); } catch { return null; }
}
function setLastUsedId(id) {
  try { localStorage.setItem(LAST_USED_KEY, id); } catch {}
}

/** Tiny inline SVG diagram thumbnail — abstract representation of the setup. */
function MiniDiagram({ lights = [], starred }) {
  const count = lights.length || 1;
  return (
    <div className="ss-card__thumb">
      <svg width="72" height="72" viewBox="0 0 72 72" fill="none">
        {/* Subject — gold stroke circle */}
        <circle cx="38" cy="46" r="11" stroke="var(--color-accent)" strokeWidth="1.5" fill="var(--color-surface-elevated)" />
        {/* Key light — filled gold circle + ray */}
        <circle cx="18" cy="22" r="8" fill="var(--color-accent)" />
        <rect x="26" y="21" width="14" height="2" rx="1" fill="var(--color-accent)" />
        {/* Fill light — 2+ lights, muted outline */}
        {count >= 2 && (
          <circle cx="56" cy="22" r="7" stroke="var(--color-text-dim)" strokeWidth="1" fill="none" opacity="0.7" />
        )}
        {/* Hair/rim — 3+ lights */}
        {count >= 3 && (
          <circle cx="38" cy="12" r="5" stroke="var(--color-text-dim)" strokeWidth="1" fill="none" opacity="0.5" />
        )}
      </svg>
      {starred && (
        <span className="ss-card__star">★</span>
      )}
    </div>
  );
}

export default function SavedSetupsScreen() {
  const dispatch = useDispatch();
  const [setups, setSetups] = useState(() => loadSetups());
  const [menuId, setMenuId] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [lastUsedId, setLastUsedIdState] = useState(() => getLastUsedId());

  // Cross-tab sync — refresh when another tab saves or deletes a setup
  useEffect(() => onSetupsChanged(() => setSetups(loadSetups())), []);

  // Sort by most recent, pin last-used to top
  const sorted = lastUsedId
    ? [...setups].sort((a, b) => {
        if (a.id === lastUsedId) return -1;
        if (b.id === lastUsedId) return 1;
        return 0;
      })
    : setups;

  function markLastUsed(id) {
    setLastUsedId(id);
    setLastUsedIdState(id);
  }

  function handleLoad(setup) {
    markLastUsed(setup.id);
    dispatch({ type: 'SET_RESULT', result: setup.result, apiResponse: null });
    dispatch({ type: 'NAVIGATE', screen: 'setup_sheet' });
    trackEvent('SETUP_LOADED', { setupId: setup.id, name: setup.name });
  }

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
    setMenuId(null);
  }

  function formatDate(ts) {
    if (ts == null) return '';
    const ms = ts < 1e12 ? ts * 1000 : ts;
    const d = new Date(ms);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, {
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      month: 'short', day: 'numeric',
    });
  }

  function getLightCount(setup) {
    const lights = setup.result?.setup?.lights;
    if (!lights?.length) return null;
    return lights.length === 1 ? '1 light' : `${lights.length} lights`;
  }

  function getPatternName(setup) {
    return setup.result?.bestMatch?.name
      || setup.result?.bestMatch?.lightingPattern
      || null;
  }

  // ── Empty State ──
  if (setups.length === 0) {
    return (
      <div className="screen ss-screen">
        <div className="ss-header">
          <span className="ss-header__title">Saved Setups</span>
        </div>
        <div className="ss-header__divider" />

        <div className="ss-empty">
          <div className="ss-empty__icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="18" x2="14" y2="18" />
            </svg>
            <span className="ss-empty__icon-dot" />
          </div>
          <h3 className="ss-empty__title">No setups yet</h3>
          <p className="ss-empty__desc">
            Build a setup or analyze a photo — then save it to build your collection.
          </p>

          <div className="ss-empty__steps">
            <div className="ss-empty__step">
              <span className="ss-empty__step-num">1</span>
              <span className="ss-empty__step-text">Choose your vibe and subject</span>
            </div>
            <div className="ss-empty__step">
              <span className="ss-empty__step-num">2</span>
              <span className="ss-empty__step-text">Review your lighting blueprint</span>
            </div>
            <div className="ss-empty__step">
              <span className="ss-empty__step-num ss-empty__step-num--gold">3</span>
              <span className="ss-empty__step-text">Save — it appears here</span>
            </div>
          </div>

          <button
            className="ss-empty__cta"
            onClick={() => {
              dispatch({ type: 'SET_APP_MODE', mode: 'build' });
              dispatch({ type: 'SET_INTENT', intent: 'mood' });
              trackEvent('SAVED_SETUPS_WIZARD_CTA');
            }}
            type="button"
          >
            Build a Setup
          </button>
        </div>
      </div>
    );
  }

  // ── Populated State ──
  return (
    <div className="screen ss-screen">
      <div className="ss-header">
        <span className="ss-header__title">Saved Setups</span>
      </div>
      <div className="ss-header__divider" />

      {/* Sort Bar */}
      <div className="ss-sort-bar">
        <span className="ss-sort-bar__count">
          {setups.length} {setups.length === 1 ? 'SETUP' : 'SETUPS'}
        </span>
        <button className="ss-sort-bar__btn" type="button">
          Recent
        </button>
      </div>
      <div className="ss-sort-bar__divider" />

      {/* Setup Cards */}
      <div className="ss-cards">
        {sorted.map((setup, i) => {
          const pattern = getPatternName(setup);
          const lightCount = getLightCount(setup);
          const isStarred = i === 0 && setup.id === lastUsedId;
          const note = setup.note || null;

          return (
            <div
              key={setup.id}
              className={`ss-card${note ? ' ss-card--has-note' : ''}`}
              onClick={() => handleLoad(setup)}
            >
              <MiniDiagram
                lights={setup.result?.setup?.lights || []}
                starred={isStarred}
              />

              <div className="ss-card__body">
                <span className="ss-card__name">{setup.name}</span>
                <div className="ss-card__tags">
                  {pattern && <span className="ss-card__tag">{fmtPattern(pattern)}</span>}
                  {lightCount && <span className="ss-card__tag">{lightCount}</span>}
                </div>
                <span className="ss-card__date">
                  {formatDate(setup.timestamp ?? setup.created_at)}
                </span>
                {note && <span className="ss-card__note">{note}</span>}
              </div>

              {/* ⋮ Overflow Menu */}
              <button
                className="ss-card__overflow"
                onClick={(e) => {
                  e.stopPropagation();
                  setMenuId(menuId === setup.id ? null : setup.id);
                  setDeleteId(null);
                }}
                type="button"
                aria-label="More options"
              >
                <span className="ss-card__dot" />
                <span className="ss-card__dot" />
                <span className="ss-card__dot" />
              </button>

              {/* Dropdown Menu */}
              {menuId === setup.id && (
                <div
                  className="ss-card__menu"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    className="ss-card__menu-item"
                    onClick={() => { handleLoad(setup); setMenuId(null); }}
                    type="button"
                  >
                    Open Setup Sheet
                  </button>
                  <button
                    className="ss-card__menu-item"
                    onClick={() => { handleRecreate(setup); setMenuId(null); }}
                    type="button"
                  >
                    Run in Shoot Mode
                  </button>
                  <div className="ss-card__menu-divider" />
                  <button
                    className="ss-card__menu-item ss-card__menu-item--danger"
                    onClick={() => handleDelete(setup.id)}
                    type="button"
                  >
                    {deleteId === setup.id ? 'Confirm Delete' : 'Delete'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Tip Card */}
      <div className="ss-tip">
        <span className="ss-tip__label">Tip</span>
        <span className="ss-tip__text">Tap any setup to open its full sheet</span>
      </div>
    </div>
  );
}
