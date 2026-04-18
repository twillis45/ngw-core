/**
 * SavedSetupsScreen — Studio Matte design
 * Library of saved lighting setups with cross-tab sync.
 *
 * Two states:
 *   Empty  — centered empty state with onboarding steps + CTA
 *   Filled — sortable card grid, overflow menus, last-used pin
 *
 * Studio Matte tokens throughout — no CSS variables from the old system.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { tapHaptic, navHaptic, warnHaptic } from '../../../utils/haptics';
import { softClickSound, navSlideSound } from '../../../utils/sounds';
import { useIsDesktop } from '../../../utils/useIsDesktop';
import { steel, accent, C, FONT_SMOOTH, PANEL_SHADOW, PANEL_BEVEL, SCREEN_BG,
         CTA_BG, CTA_SHADOW, CTA_BEVEL, KEY_ACCENT } from '../../../theme/studioMatte';
import MatteBackground from '../_shared/MatteBackground';
import { loadSetups, deleteSetup, onSetupsChanged } from '../../../data/setupStore';

const LAST_USED_KEY = 'ngw_last_used_setup';

function getLastUsedId() {
  try { return localStorage.getItem(LAST_USED_KEY); } catch { return null; }
}
function setLastUsedIdLS(id) {
  try { localStorage.setItem(LAST_USED_KEY, id); } catch {}
}

/** Standard Studio Matte primary CTA — matches SetupScreen "Build This Light". */
function CTAButton({ label, onClick }) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      onClick={onClick}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      style={{
        padding: '0 32px', height: 50, borderRadius: 24,
        border: 'none', cursor: 'pointer',
        background: CTA_BG,
        boxShadow: pressed
          ? 'inset 0px 2px 4px rgba(0,0,0,0.5)'
          : `${CTA_SHADOW}, ${CTA_BEVEL}`,
        transform: pressed ? 'scale(0.98)' : 'scale(1)',
        transition: 'transform 0.1s ease, box-shadow 0.1s ease',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span style={{
        fontSize: 13, fontWeight: 700,
        color: 'rgba(245,247,250,0.92)',
        letterSpacing: '1.5px', textTransform: 'uppercase',
        pointerEvents: 'none', ...FONT_SMOOTH,
      }}>
        {label}
      </span>
    </button>
  );
}

// ─── Title Case helper ──────────────────────────────────────────────────────
function toTitleCase(str) {
  if (!str) return '';
  return String(str).replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Mini Diagram ───────────────────────────────────────────────────────────
function MiniDiagram({ lights = [], starred }) {
  const count = lights.length || 1;
  return (
    <div style={{
      position: 'relative', width: 64, height: 64, flexShrink: 0,
      borderRadius: 10,
      background: `linear-gradient(135deg, ${steel(0.08)}, ${steel(0.04)})`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <svg width="48" height="48" viewBox="0 0 72 72" fill="none">
        {/* Subject */}
        <circle cx="38" cy="46" r="11" stroke={KEY_ACCENT} strokeWidth="1.5" fill={steel(0.06)} />
        {/* Key light */}
        <circle cx="18" cy="22" r="8" fill={KEY_ACCENT} />
        <rect x="26" y="21" width="14" height="2" rx="1" fill={KEY_ACCENT} />
        {/* Fill (2+ lights) */}
        {count >= 2 && (
          <circle cx="56" cy="22" r="7" stroke={steel(0.35)} strokeWidth="1" fill="none" opacity="0.7" />
        )}
        {/* Hair/rim (3+ lights) */}
        {count >= 3 && (
          <circle cx="38" cy="12" r="5" stroke={steel(0.35)} strokeWidth="1" fill="none" opacity="0.5" />
        )}
      </svg>
      {starred && (
        <span style={{
          position: 'absolute', top: 4, right: 5,
          fontSize: 10, color: KEY_ACCENT, lineHeight: 1,
        }}>★</span>
      )}
    </div>
  );
}

// ─── Setup Card ─────────────────────────────────────────────────────────────
function SetupCard({ setup, isStarred, isMenuOpen, onTap, onMenu, onDelete, deleteConfirm, onLoad, onShoot, isDesktop }) {
  const [hover, setHover] = useState(false);
  const [pressed, setPressed] = useState(false);

  const pattern = setup.result?.bestMatch?.name
    || setup.result?.bestMatch?.lightingPattern
    || setup.result?.pattern
    || null;

  const lights = setup.result?.setup?.lights
    || (setup.result?._raw?.reconstruction?.light_roles
      ? Object.values(setup.result._raw.reconstruction.light_roles).filter(l => l.present)
      : []);
  const lightCount = lights.length || null;

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

  return (
    <div
      role="button" tabIndex={0}
      onClick={onTap}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTap(); } }}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => { setPressed(false); setHover(false); }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '14px 16px',
        transform: pressed ? 'scale(0.98)' : 'scale(1)',
        transition: 'transform 0.1s ease, background 0.15s ease',
        background: hover
          ? `linear-gradient(135deg, ${steel(0.10)}, ${steel(0.06)})`
          : `linear-gradient(135deg, ${steel(0.07)}, ${steel(0.04)})`,
        borderRadius: 14,
        border: `1px solid ${steel(0.10)}`,
        boxShadow: pressed
          ? 'inset 0 2px 4px rgba(0,0,0,0.4)'
          : `${PANEL_SHADOW}, ${PANEL_BEVEL}`,
        cursor: 'pointer',
        ...FONT_SMOOTH,
      }}
    >
      <MiniDiagram lights={lights} starred={isStarred} />

      {/* Body */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{
          fontSize: isDesktop ? 17 : 15, fontWeight: 600, color: C.textPrimary,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          letterSpacing: '-0.2px', ...FONT_SMOOTH,
        }}>
          {setup.name || 'Untitled Setup'}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {pattern && (
            <span style={{
              fontSize: 11, fontWeight: 600, color: KEY_ACCENT,
              padding: '2px 8px', borderRadius: 6,
              background: accent(0.12),
              letterSpacing: '0.3px', ...FONT_SMOOTH,
            }}>
              {toTitleCase(pattern)}
            </span>
          )}
          {lightCount && (
            <span style={{
              fontSize: 11, fontWeight: 500, color: steel(0.5), ...FONT_SMOOTH,
            }}>
              {lightCount === 1 ? '1 light' : `${lightCount} lights`}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: steel(0.35), ...FONT_SMOOTH }}>
            {formatDate(setup.timestamp ?? setup.created_at)}
          </span>
          {setup.note && (
            <span style={{
              fontSize: 11, color: steel(0.4), fontStyle: 'italic',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              maxWidth: 180, ...FONT_SMOOTH,
            }}>
              {setup.note}
            </span>
          )}
        </div>
      </div>

      {/* Overflow ⋮ */}
      <button
        onClick={(e) => { e.stopPropagation(); onMenu(); }}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: '10px 8px', display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 3, minWidth: 44, minHeight: 44,
          justifyContent: 'center',
          WebkitTapHighlightColor: 'transparent',
        }}
        aria-label="More options"
      >
        {[0,1,2].map(i => (
          <span key={i} style={{
            display: 'block', width: 3.5, height: 3.5, borderRadius: '50%',
            background: steel(0.35),
          }} />
        ))}
      </button>

      {/* Dropdown Menu */}
      {isMenuOpen && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'absolute', top: '100%', right: 12, zIndex: 20,
            marginTop: 4, minWidth: 180,
            background: C.panelBg,
            borderRadius: 14,
            boxShadow: `${PANEL_SHADOW}, ${PANEL_BEVEL}, 0 8px 20px rgba(0,0,0,0.4)`,
            overflow: 'hidden',
          }}
        >
          <MenuButton label="Shoot This Setup" onClick={() => { onShoot(); }} />
          <div style={{ height: 1, background: steel(0.10), margin: '2px 10px' }} />
          <MenuButton
            label={deleteConfirm ? 'Confirm Delete' : 'Delete'}
            danger
            onClick={() => { onDelete(); }}
          />
        </div>
      )}
    </div>
  );
}

function MenuButton({ label, danger, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'block', width: '100%', textAlign: 'left',
        background: hover ? steel(0.08) : 'transparent',
        border: 'none', cursor: 'pointer',
        padding: '10px 14px',
        fontSize: 13, fontWeight: 500,
        color: danger ? C.textDanger : C.textSub,
        ...FONT_SMOOTH,
        transition: 'background 0.12s ease',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {label}
    </button>
  );
}

// ─── Empty State ────────────────────────────────────────────────────────────
function EmptyState({ onBuild }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '40px 32px',
      textAlign: 'center',
      ...FONT_SMOOTH,
    }}>
      {/* Icon */}
      <div style={{
        position: 'relative', marginBottom: 20,
        width: 56, height: 56, borderRadius: 16,
        background: `linear-gradient(135deg, ${steel(0.08)}, ${steel(0.04)})`,
        border: `1px solid ${steel(0.10)}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={steel(0.4)} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="4" y1="6" x2="20" y2="6" />
          <line x1="4" y1="12" x2="20" y2="12" />
          <line x1="4" y1="18" x2="14" y2="18" />
        </svg>
        <span style={{
          position: 'absolute', bottom: -3, right: -3,
          width: 14, height: 14, borderRadius: '50%',
          background: KEY_ACCENT,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, color: '#000', fontWeight: 700, lineHeight: 1,
        }}>+</span>
      </div>

      <h3 style={{
        margin: '0 0 8px', fontSize: 20, fontWeight: 700,
        color: C.textPrimary, letterSpacing: '-0.3px', ...FONT_SMOOTH,
      }}>
        No setups yet
      </h3>
      <p style={{
        margin: '0 0 28px', fontSize: 13, fontWeight: 400,
        color: steel(0.45), lineHeight: 1.5, maxWidth: 280, ...FONT_SMOOTH,
      }}>
        Build a setup or analyze a photo — then save it to build your collection.
      </p>

      {/* Steps */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 12,
        marginBottom: 32, width: '100%', maxWidth: 260,
      }}>
        {[
          { num: '1', text: 'Choose your vibe and subject' },
          { num: '2', text: 'Review your lighting blueprint' },
          { num: '3', text: 'Save — it appears here', gold: true },
        ].map(step => (
          <div key={step.num} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{
              width: 24, height: 24, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, lineHeight: 1,
              background: step.gold ? accent(0.18) : steel(0.08),
              color: step.gold ? KEY_ACCENT : steel(0.5),
              border: `1px solid ${step.gold ? accent(0.25) : steel(0.12)}`,
              flexShrink: 0, ...FONT_SMOOTH,
            }}>{step.num}</span>
            <span style={{ fontSize: 13, color: steel(0.55), textAlign: 'left', ...FONT_SMOOTH }}>
              {step.text}
            </span>
          </div>
        ))}
      </div>

      {/* CTA */}
      <CTAButton
        label="BUILD A SETUP"
        onClick={() => { tapHaptic(); softClickSound(); onBuild?.(); }}
      />
    </div>
  );
}

// ─── Main Screen ────────────────────────────────────────────────────────────
export default function SavedSetupsScreen({ onSelect, onBack, onBuild, onShoot }) {
  const isDesktop = useIsDesktop();
  const [setups, setSetups] = useState(() => loadSetups());
  const [menuId, setMenuId] = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [lastUsedId, setLastUsedIdState] = useState(() => getLastUsedId());

  // Cross-tab sync
  useEffect(() => onSetupsChanged(() => setSetups(loadSetups())), []);

  // Dismiss menu on outside click
  useEffect(() => {
    if (!menuId) return;
    const dismiss = () => { setMenuId(null); setDeleteId(null); };
    const timer = setTimeout(() => document.addEventListener('click', dismiss), 0);
    return () => { clearTimeout(timer); document.removeEventListener('click', dismiss); };
  }, [menuId]);

  // Sort: last-used pinned first, then most recent
  const sorted = [...setups].sort((a, b) => {
    if (lastUsedId) {
      if (a.id === lastUsedId) return -1;
      if (b.id === lastUsedId) return 1;
    }
    return (b.timestamp || 0) - (a.timestamp || 0);
  });

  function markLastUsed(id) {
    setLastUsedIdLS(id);
    setLastUsedIdState(id);
  }

  function handleLoad(setup) {
    markLastUsed(setup.id);
    tapHaptic(); softClickSound();
    onSelect?.(setup);
  }

  function handleRecreate(setup) {
    markLastUsed(setup.id);
    tapHaptic(); softClickSound();
    onShoot?.(setup);
  }

  function handleDelete(id) {
    if (deleteId !== id) {
      setDeleteId(id);
      return;
    }
    warnHaptic();
    const updated = deleteSetup(id);
    setSetups(updated);
    setDeleteId(null);
    setMenuId(null);
  }

  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', flexDirection: 'column',
      backgroundColor: SCREEN_BG,
      overflow: 'hidden',
    }}>
      <MatteBackground />

      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: isDesktop ? '16px 40px' : '16px 22px',
        position: 'relative', zIndex: 2,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button aria-label="Back" onClick={() => { navHaptic(); navSlideSound(); onBack?.(); }} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '10px 12px 10px 0', display: 'flex', alignItems: 'center',
            WebkitTapHighlightColor: 'transparent',
            minWidth: 44, minHeight: 44,
          }}>
            <span style={{ fontSize: 22, color: C.textMeta, lineHeight: 1, ...FONT_SMOOTH }}>‹</span>
          </button>
          <p style={{
            margin: 0, fontSize: isDesktop ? 11 : 10, fontWeight: 600,
            color: steel(0.65), letterSpacing: '1.2px', ...FONT_SMOOTH,
          }}>
            SAVED SETUPS
          </p>
        </div>
        {setups.length > 0 && (
          <p style={{
            margin: 0, fontSize: isDesktop ? 13 : 11, fontWeight: 500,
            color: steel(0.4), ...FONT_SMOOTH,
          }}>
            {setups.length} {setups.length === 1 ? 'setup' : 'setups'}
          </p>
        )}
      </div>

      {/* ── Content ── */}
      {setups.length === 0 ? (
        <EmptyState onBuild={onBuild} />
      ) : (
        <div style={{
          flex: 1, overflowY: 'auto',
          padding: isDesktop ? '0 40px 40px' : '0 22px 40px',
          position: 'relative', zIndex: 1,
          display: isDesktop ? 'grid' : 'flex',
          ...(isDesktop
            ? { gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12, alignContent: 'start' }
            : { flexDirection: 'column', gap: 10 }),
        }}>
          {sorted.map((setup, i) => (
            <SetupCard
              key={setup.id}
              setup={setup}
              isDesktop={isDesktop}
              isStarred={i === 0 && setup.id === lastUsedId}
              isMenuOpen={menuId === setup.id}
              deleteConfirm={deleteId === setup.id}
              onTap={() => handleLoad(setup)}
              onMenu={() => {
                setMenuId(menuId === setup.id ? null : setup.id);
                setDeleteId(null);
              }}
              onDelete={() => handleDelete(setup.id)}
              onLoad={() => { handleLoad(setup); setMenuId(null); }}
              onShoot={() => { handleRecreate(setup); setMenuId(null); }}
            />
          ))}

          {/* Tip Card */}
          <div style={{
            padding: '12px 16px',
            background: steel(0.04),
            borderRadius: 10,
            border: `1px solid ${steel(0.08)}`,
            display: 'flex', alignItems: 'center', gap: 10,
            ...(isDesktop ? { gridColumn: '1 / -1' } : {}),
          }}>
            <span style={{
              fontSize: 9, fontWeight: 700, color: KEY_ACCENT,
              letterSpacing: '0.8px', textTransform: 'uppercase',
              ...FONT_SMOOTH,
            }}>TIP</span>
            <span style={{
              fontSize: 12, color: steel(0.4), ...FONT_SMOOTH,
            }}>
              Tap any setup to open its full blueprint
            </span>
          </div>
        </div>
      )}

      {/* iOS home indicator */}
      <div style={{ height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 1, flexShrink: 0 }}>
        <div style={{ width: 134, height: 5, borderRadius: 3, backgroundColor: C.homeBar }} />
      </div>
    </div>
  );
}
