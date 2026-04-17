/**
 * Day1 Atomic Components — Studio Matte design system
 * Single source of truth for shared UI primitives across all Day1 screens.
 * Import: import { Panel, Divider, NavRow, ToggleRow, ... } from '../components/day1';
 */
import { useState } from 'react';
import { tapHaptic, selectHaptic, navHaptic } from '../../../../utils/haptics';
import { softClickSound, navSlideSound } from '../../../../utils/sounds';
import { steel, C, FONT_SMOOTH as FS, PANEL_SHADOW, PANEL_BEVEL,
         CTA_BG, CTA_SHADOW, CTA_BEVEL, GREEN, GREEN_DIM } from '../../../../theme/studioMatte';

// ─── Shared keyframes (injected once) ─────────────────────────────────────────
const _stylesInjected = { current: false };
function InjectStyles() {
  if (_stylesInjected.current) return null;
  _stylesInjected.current = true;
  return <style>{`
    @keyframes tooltipIn {
      from { opacity: 0; transform: translateX(-50%) translateY(4px) scale(0.97); }
      to   { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
    }
  `}</style>;
}

// ─── Layout ───────────────────────────────────────────────────────────────────

/** Dark panel with neumorphic shadow + bevel. */
export function Panel({ children, style }) {
  return (
    <div style={{
      backgroundColor: C.panelBg,
      borderRadius: 14,
      boxShadow: `${PANEL_SHADOW}, ${PANEL_BEVEL}`,
      // overflow visible so tooltips can escape the panel bounds
      overflow: 'visible',
      ...style,
    }}>
      {children}
    </div>
  );
}

/** 1px horizontal divider, indented 20px from left. */
export function Divider() {
  return <div style={{ height: 1, backgroundColor: C.divider, marginLeft: 20 }} />;
}

/** Uppercase section label (10px, steel-tinted). */
export function SectionLabel({ label }) {
  return (
    <p style={{
      margin: '24px 0 8px 2px',
      fontSize: 10, fontWeight: 700,
      color: steel(0.5),
      letterSpacing: '1.2px',
      ...FS,
    }}>
      {label}
    </p>
  );
}

// ─── Info dot + tooltip ──────────────────────────────────────────────────────

/** Catchlight-ring info indicator with Apple Sequoia glass tooltip.
 *  Renders as a tiny ring (like a catchlight reflection in an iris).
 *  Hover/tap shows a frosted glass card with the explanation. */
function InfoDot({ text }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return (
    <div
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
      style={{
        width: 14, height: 14, borderRadius: '50%', cursor: 'pointer',
        flexShrink: 0, position: 'relative',
        background: `radial-gradient(circle at 40% 35%, ${steel(0.35)} 0%, ${steel(0.18)} 45%, transparent 70%)`,
        boxShadow: `0 0 0 1px ${steel(0.15)}, inset 0 0 2px ${steel(0.10)}`,
      }}
    >
      <div style={{
        position: 'absolute', top: 5, left: 5, width: 4, height: 4, borderRadius: '50%',
        background: `radial-gradient(circle, ${steel(0.55)} 0%, ${steel(0.30)} 100%)`,
      }} />
      {open && (
        <div style={{
          position: 'absolute', bottom: '100%', left: '50%',
          transform: 'translateX(-50%)',
          marginBottom: 10, width: 240, padding: '10px 14px',
          borderRadius: 12,
          // Apple Sequoia glass — more transparent, heavier blur
          backgroundColor: 'rgba(20,20,24,0.45)',
          backdropFilter: 'blur(48px) saturate(2.0)',
          WebkitBackdropFilter: 'blur(48px) saturate(2.0)',
          border: '0.5px solid rgba(255,255,255,0.14)',
          boxShadow: [
            '0 12px 40px rgba(0,0,0,0.50)',
            '0 4px 12px rgba(0,0,0,0.35)',
            'inset 0 0.5px 0 rgba(255,255,255,0.18)',
            'inset 0 -0.5px 0 rgba(0,0,0,0.08)',
          ].join(', '),
          zIndex: 20, pointerEvents: 'none',
          animation: 'tooltipIn 0.18s ease-out both',
        }}>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 500, lineHeight: '16px', color: 'rgba(255,255,255,0.85)', letterSpacing: '0.05px', ...FS }}>{text}</p>
          <div style={{
            position: 'absolute', bottom: -5, left: '50%',
            transform: 'translateX(-50%) rotate(45deg)',
            width: 10, height: 10,
            backgroundColor: 'rgba(20,20,24,0.45)',
            backdropFilter: 'blur(48px) saturate(2.0)',
            WebkitBackdropFilter: 'blur(48px) saturate(2.0)',
            borderRight: '0.5px solid rgba(255,255,255,0.14)',
            borderBottom: '0.5px solid rgba(255,255,255,0.14)',
            boxShadow: '3px 3px 6px rgba(0,0,0,0.25)',
          }} />
        </div>
      )}
    </div>
  );
}

// ─── Rows ─────────────────────────────────────────────────────────────────────

/**
 * Tappable row with label, optional value, and chevron.
 * Uses pointer events for press-state feedback.
 */
export function NavRow({ label, value, onClick, danger = false, chevron = true, tooltip }) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => { setPressed(false); softClickSound(); tapHaptic(); onClick?.(); }}
      onPointerLeave={() => setPressed(false)}
      style={{
        width: '100%',
        backgroundColor: pressed ? 'rgba(255,255,255,0.025)' : 'transparent',
        border: 'none', cursor: 'pointer',
        padding: '14px 20px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        WebkitTapHighlightColor: 'transparent',
        transition: 'background-color 0.1s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: danger ? 'rgba(200,70,70,0.82)' : C.textPrimary, ...FS }}>
          {label}
        </span>
        <InfoDot text={tooltip} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {value && <span style={{ fontSize: 13, color: steel(0.55), ...FS }}>{value}</span>}
        {chevron && !danger && <span style={{ fontSize: 16, color: steel(0.58), lineHeight: 1 }}>›</span>}
      </div>
    </button>
  );
}

/** Toggle switch row with optional sub-label. */
export function ToggleRow({ label, sub, value, onChange, tooltip }) {
  // Track: 48×28. Knob: 24×24 (fills height minus 2px border each side).
  // Full travel: left:2 → left:22.
  const knobX = value ? 22 : 2;
  return (
    <div style={{ padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      {tooltip && <InjectStyles />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: C.textPrimary, ...FS }}>{label}</p>
          <InfoDot text={tooltip} />
        </div>
        {sub && <p style={{ margin: '2px 0 0', fontSize: 11, color: steel(0.62), ...FS }}>{sub}</p>}
      </div>
      <div
        onClick={() => { softClickSound(); selectHaptic(); onChange(!value); }}
        style={{
          width: 48, height: 28, borderRadius: 14, cursor: 'pointer', flexShrink: 0,
          position: 'relative',
          // Track cavity — deep machined slot
          background: value
            ? 'linear-gradient(141.71deg, rgba(30,70,55,0.95) 0%, rgba(22,55,42,0.92) 100%)'
            : 'linear-gradient(141.71deg, #0a0b0e 0%, #070809 100%)',
          boxShadow: [
            // Carved interior — directional inset from 141.71°
            'inset 4px 4px 8px rgba(0,0,0,0.80)',
            'inset 2px 2px 4px rgba(0,0,0,0.60)',
            'inset 1px 1px 2px rgba(0,0,0,0.45)',
            // Perimeter ring — hard edge definition
            'inset 0 0 0 0.5px rgba(0,0,0,0.50)',
            // Fill bounce — bottom-right
            'inset -1px -1px 2px rgba(255,255,255,0.018)',
            // Outer rim chamfer
            '-0.5px -0.5px 1px rgba(255,255,255,0.035)',
            '1px 2px 4px rgba(0,0,0,0.40)',
            // Green LED glow in the well when active
            value ? 'inset 0 0 10px rgba(72,186,136,0.20)' : '',
            value ? 'inset 0 0 4px rgba(72,186,136,0.12)' : '',
          ].filter(Boolean).join(', '),
          transition: 'background 0.25s ease, box-shadow 0.3s ease',
        }}
      >
        {/* Knob — chrome ball bearing with specular highlight */}
        <div style={{
          position: 'absolute', top: 2, left: knobX,
          width: 24, height: 24, borderRadius: '50%',
          // Radial gradient — top-left hot-spot simulates spherical key catch
          background: value
            ? 'radial-gradient(circle at 35% 30%, rgba(180,255,220,0.95) 0%, rgba(120,220,170,0.88) 25%, rgba(72,186,136,0.82) 55%, rgba(40,120,85,0.78) 100%)'
            : `radial-gradient(circle at 35% 30%, ${steel(0.85)} 0%, ${steel(0.55)} 30%, ${steel(0.35)} 65%, ${steel(0.22)} 100%)`,
          boxShadow: [
            // Contact shadow — knob sits on track floor
            '3px 3px 8px rgba(0,0,0,0.65)',
            '1px 1px 3px rgba(0,0,0,0.45)',
            // Perimeter edge ring — separates knob from shadow
            '0 0 0 0.5px rgba(0,0,0,0.30)',
            // Top-left rim catch — chamfer from 141.71° key
            '-0.5px -0.5px 1px rgba(255,255,255,0.22)',
            // Inner dome bevel — machined edge
            'inset 0 1.5px 0 rgba(255,255,255,0.30)',
            'inset 1px 0.5px 0 rgba(255,255,255,0.15)',
            'inset -1px -1px 1px rgba(0,0,0,0.25)',
            // Active glow — green LED halo around the knob
            value ? '0 0 8px rgba(72,186,136,0.35)' : '',
            value ? '0 0 3px rgba(140,230,190,0.20)' : '',
          ].filter(Boolean).join(', '),
          // Spring overshoot on travel — the knob overshoots slightly then settles
          transition: 'left 0.28s cubic-bezier(0.34,1.56,0.64,1), background 0.2s ease, box-shadow 0.25s ease',
        }}>
          {/* Specular dot — pinpoint chrome reflection on dome surface */}
          <div style={{
            position: 'absolute', top: 4, left: 5,
            width: 4, height: 3, borderRadius: '50%',
            background: value
              ? 'radial-gradient(circle, rgba(255,255,255,0.65) 0%, rgba(200,255,230,0.25) 60%, transparent 100%)'
              : 'radial-gradient(circle, rgba(255,255,255,0.45) 0%, rgba(200,210,220,0.15) 60%, transparent 100%)',
            transform: 'rotate(-48deg)',
            pointerEvents: 'none',
          }} />
        </div>
      </div>
    </div>
  );
}

/** Read-only label / value row. */
export function InfoRow({ label, value }) {
  return (
    <div style={{ padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 14, fontWeight: 500, color: C.textSub, ...FS }}>{label}</span>
      <span style={{ fontSize: 13, color: steel(0.5), ...FS }}>{value}</span>
    </div>
  );
}

// ─── Navigation ───────────────────────────────────────────────────────────────

/**
 * Sticky screen header with back button and centered title.
 * backLabel defaults to "Back".
 */
export function ScreenHeader({ title, onBack, backLabel = 'Back' }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      padding: '16px 20px 8px',
      position: 'sticky', top: 0,
      backgroundColor: 'rgba(8,9,12,0.92)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      zIndex: 10,
    }}>
      <button
        onClick={() => { navSlideSound(); navHaptic(); onBack?.(); }}
        style={{
          backgroundColor: 'transparent', border: 'none', cursor: 'pointer',
          fontSize: 16, color: steel(0.65),
          padding: '4px 0',
          WebkitTapHighlightColor: 'transparent',
          minWidth: 64, textAlign: 'left',
          ...FS,
        }}
      >
        ‹ {backLabel}
      </button>
      <h1 style={{
        flex: 1, textAlign: 'center',
        margin: 0, fontSize: 16, fontWeight: 700,
        color: C.textPrimary, letterSpacing: '-0.2px',
        ...FS,
      }}>
        {title}
      </h1>
      <div style={{ minWidth: 64 }} />
    </div>
  );
}

// ─── Buttons ──────────────────────────────────────────────────────────────────

/**
 * Primary CTA button — metallic gradient + shadow system.
 * Used for Save, Confirm, primary actions.
 */
export function CtaButton({ label, onClick, style }) {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      onClick={onClick}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      style={{
        width: '100%', height: 52,
        borderRadius: 24,
        background: CTA_BG,
        boxShadow: pressed
          ? 'inset 0px 2px 4px rgba(0,0,0,0.5)'
          : `${CTA_SHADOW}, ${CTA_BEVEL}`,
        border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        WebkitTapHighlightColor: 'transparent',
        transform: pressed ? 'scale(0.98)' : 'scale(1)',
        transition: 'transform 0.1s ease, box-shadow 0.1s ease',
        ...style,
      }}
    >
      <span style={{
        fontSize: 13, fontWeight: 600,
        color: 'rgba(245,247,250,0.9)',
        letterSpacing: '0.5px',
        pointerEvents: 'none',
        ...FS,
      }}>
        {label}
      </span>
    </button>
  );
}

// ─── Chrome ───────────────────────────────────────────────────────────────────

/** iOS-style home indicator bar. */
export function HomeIndicator({ color = 'rgba(89,94,107,0.55)' }) {
  return (
    <div style={{
      position: 'fixed', bottom: 8, left: '50%', transform: 'translateX(-50%)',
      width: 134, height: 5, borderRadius: 3,
      backgroundColor: color,
      boxShadow: 'inset 0px 1px 1px 0px rgba(255,255,255,0.12), inset 0px -0.5px 0.5px 0px rgba(0,0,0,0.2)',
      zIndex: 50, pointerEvents: 'none',
    }} />
  );
}
