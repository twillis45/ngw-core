import { useState } from 'react';
import { useDispatch } from '../context/AppContext';
import { loadKit, clearKit } from '../data/kitStore';
import { getLightDetails } from '../data/lightCatalog';
import { getModifierDetails } from '../data/modifierCatalog';
import { RECIPES } from '../data/recipes';
import VendorLogo from '../components/VendorLogo';

function getBHUrl(query) {
  return `https://www.bhphotovideo.com/c/search?q=${encodeURIComponent(query)}`;
}

// ── Capability derivation (pure, no side-effects) ────────────────────────────

function kitModTypes(kit) {
  return (kit.modifiers || []).map(m => (typeof m === 'string' ? m : m.type));
}

function kitLightCount(kit) {
  return (kit.lights || []).reduce((n, l) => n + (l.qty || 1), 0);
}

function computeCapabilityTiers(kit) {
  const lightCount = kitLightCount(kit);
  const modTypes = kitModTypes(kit);
  const has = (t) => modTypes.some(m => m.includes(t));

  const supported = [];
  const limited = [];

  if (has('beauty_dish')) { supported.push('beauty setups'); supported.push('butterfly / clamshell'); }
  if (has('softbox') || has('octa')) supported.push('soft portraits');
  if (has('umbrella')) supported.push('fill and group lighting');
  if (has('grid') || has('stripbox')) supported.push('dramatic editorial');
  if (lightCount >= 2) supported.push('multi-light setups');
  supported.push('clean portraits');

  if (!has('beauty_dish')) limited.push('beauty setups — add beauty dish');
  if (lightCount < 2) limited.push('multi-light looks — add second strobe');
  if (!has('grid') && !has('stripbox')) limited.push('editorial — add grid or stripbox');
  if (!has('softbox') && !has('octa')) limited.push('soft portraits — add softbox or octa');

  return {
    supported: [...new Set(supported)].slice(0, 5),
    limited: [...new Set(limited)].slice(0, 3),
  };
}

function computeMatchedRecipes(kit) {
  const modTypes = kitModTypes(kit);
  return RECIPES.filter(r => {
    if (!r.modifiers?.length) return true;
    return r.modifiers.some(rm => modTypes.some(km => km.includes(rm) || rm.includes(km)));
  }).slice(0, 4);
}

function computeUpgradeHint(kit) {
  const lightCount = kitLightCount(kit);
  const modTypes = kitModTypes(kit);
  const has = (t) => modTypes.some(m => m.includes(t));
  if (!has('beauty_dish'))
    return 'Missing a beauty dish — needed for clamshell and butterfly setups.';
  if (lightCount < 2)
    return 'Missing a second light — needed for rim separation and full control.';
  if (!has('grid') && !has('stripbox'))
    return 'Missing a grid or stripbox — needed for editorial and fashion looks.';
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function MyKitScreen() {
  const dispatch = useDispatch();
  const [kit, setKit] = useState(() => loadKit());
  const [confirmClear, setConfirmClear] = useState(false);

  function handleClear() {
    if (!confirmClear) { setConfirmClear(true); return; }
    clearKit();
    setKit(null);
    setConfirmClear(false);
  }

  function handleEditKit() {
    if (kit) dispatch({ type: 'LOAD_GEAR_KIT', gear: kit });
    dispatch({ type: 'SET_INTENT', intent: 'edit_kit' });
  }

  function handleStartShoot() {
    if (kit) dispatch({ type: 'LOAD_GEAR_KIT', gear: kit });
    dispatch({ type: 'SET_GEAR_MODE', mode: 'my_gear' });
    dispatch({ type: 'NAVIGATE', screen: 'welcome' });
  }

  if (!kit || !kit.lights?.length) {
    return (
      <div className="screen">
        <h2 className="screen-heading">My Kit</h2>
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--color-text-dim)' }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5, marginBottom: 16 }}>
            <rect x="2" y="9" width="20" height="12" rx="2"/>
            <path d="M8 9V6a4 4 0 0 1 8 0v2"/>
          </svg>
          <p>No saved kit yet.</p>
          <p style={{ fontSize: 'var(--text-sm)', marginTop: 8 }}>
            Add your gear once — get matched setups every time.
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

  const { supported, limited } = computeCapabilityTiers(kit);
  const matched = computeMatchedRecipes(kit);
  const upgradeHint = computeUpgradeHint(kit);

  return (
    <div className="screen">
      <h2 className="screen-heading">My Kit</h2>

      {/* ── Capability summary ── */}
      <div className="result-card">
        <div className="result-card__header">
          <span className="result-card__icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
          </span>
          <span>What you can shoot right now</span>
        </div>

        <ul className="kit-capability__list">
          {supported.map((c, i) => (
            <li key={i} className="kit-capability__item">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--color-accent)' }}>
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              {c}
            </li>
          ))}
        </ul>

        {limited.length > 0 && (
          <>
            <p className="kit-capability__section-label">Within reach</p>
            <ul className="kit-capability__list kit-capability__list--limited">
              {limited.map((c, i) => (
                <li key={i} className="kit-capability__item kit-capability__item--limited">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}>
                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
                  {c}
                </li>
              ))}
            </ul>
          </>
        )}

        <p className="kit-capability__count">{matched.length} setup{matched.length !== 1 ? 's' : ''} ready to run right now</p>
      </div>

      {/* ── Lights ── */}
      <div className="result-card kit-inventory-section">
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
          const displayName = details ? `${details.vendor} ${details.model}` : l.type;
          return (
            <div key={i} className="kit-item">
              <VendorLogo name={displayName} />
              <span className="kit-item__name">
                <a href={getBHUrl(displayName)} target="_blank" rel="noopener noreferrer" className="blueprint-shop-link">
                  {displayName}
                </a>
              </span>
              <span className="kit-item__qty">{l.qty > 1 ? `\u00D7${l.qty}` : ''}</span>
              {details?.qualityTier >= 4 && (
                <span className="kit-item__badge">Pro</span>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Modifiers ── */}
      {kit.modifiers?.length > 0 && (
        <div className="result-card kit-inventory-section">
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
            {kit.modifiers.map((m, i) => {
              const mType = typeof m === 'string' ? m : m.type;
              const mQty = typeof m === 'string' ? 1 : (m.qty || 1);
              const mod = getModifierDetails(mType);
              return (
                <a
                  key={mType || i}
                  href={getBHUrl(mod ? mod.label : mType)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="chip chip--selected blueprint-shop-link"
                  style={{ textDecoration: 'none' }}
                >
                  {mod ? mod.label : mType}{mQty > 1 ? ` \u00D7${mQty}` : ''}
                </a>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Support ── */}
      {kit.support?.length > 0 && (
        <div className="result-card kit-inventory-section">
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

      {/* ── Matched setups ── */}
      {matched.length > 0 && (
        <div className="result-card">
          <div className="result-card__header">
            <span className="result-card__icon">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
              </svg>
            </span>
            <span>Best Setups for Your Gear</span>
          </div>
          <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)', margin: '0 0 8px' }}>
            Using your current kit
          </p>
          <div className="recipe-list">
            {matched.map(r => (
              <button
                key={r.id}
                className={`intent-card${r.recommended ? ' intent-card--recommended' : ''}`}
                onClick={() => dispatch({ type: 'NAVIGATE', screen: 'recipes' })}
              >
                <span className="intent-card__text">
                  <strong>{r.name}</strong>
                  <small>{r.description}</small>
                  {r.patternPreview && (
                    <span className="intent-card__footer">
                      <span className="best-match__pattern">{r.patternPreview}</span>
                      {r.setupTime && <span className="recipe-setup-time">{r.setupTime}</span>}
                    </span>
                  )}
                </span>
                <span className="intent-card__arrow">›</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Start shoot CTA ── */}
      <button
        className="btn btn--primary"
        onClick={handleStartShoot}
        style={{ width: '100%', marginTop: 'var(--space-sm)' }}
      >
        Run a setup with this kit
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 6 }}><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
      </button>

      {/* ── Upgrade hook ── */}
      {upgradeHint && (
        <div className="kit-upgrade-hint">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          {upgradeHint}
        </div>
      )}

      {/* ── Actions ── */}
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
