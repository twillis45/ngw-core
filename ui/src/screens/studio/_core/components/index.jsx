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

// ─── Layout ───────────────────────────────────────────────────────────────────

/** Dark panel with neumorphic shadow + bevel. */
export function Panel({ children, style }) {
  return (
    <div style={{
      backgroundColor: C.panelBg,
      borderRadius: 14,
      boxShadow: `${PANEL_SHADOW}, ${PANEL_BEVEL}`,
      overflow: 'hidden',
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

// ─── Rows ─────────────────────────────────────────────────────────────────────

/**
 * Tappable row with label, optional value, and chevron.
 * Uses pointer events for press-state feedback.
 */
export function NavRow({ label, value, onClick, danger = false, chevron = true }) {
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
      <span style={{ fontSize: 14, fontWeight: 500, color: danger ? 'rgba(200,70,70,0.82)' : C.textPrimary, ...FS }}>
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {value && <span style={{ fontSize: 13, color: steel(0.55), ...FS }}>{value}</span>}
        {chevron && !danger && <span style={{ fontSize: 16, color: steel(0.35), lineHeight: 1 }}>›</span>}
      </div>
    </button>
  );
}

/** Toggle switch row with optional sub-label. */
export function ToggleRow({ label, sub, value, onChange }) {
  const knobX = value ? 16 : 2;
  return (
    <div style={{ padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: C.textPrimary, ...FS }}>{label}</p>
        {sub && <p style={{ margin: '2px 0 0', fontSize: 11, color: steel(0.45), ...FS }}>{sub}</p>}
      </div>
      <div
        onClick={() => { softClickSound(); selectHaptic(); onChange(!value); }}
        style={{
          width: 44, height: 26, borderRadius: 13, cursor: 'pointer', flexShrink: 0,
          backgroundColor: value ? GREEN_DIM : 'rgba(255,255,255,0.06)',
          boxShadow: 'inset 0px 1px 3px 0px rgba(0,0,0,0.5), inset 0px 0px 0px 0.5px rgba(0,0,0,0.4)',
          position: 'relative', transition: 'background-color 0.2s ease',
        }}
      >
        <div style={{
          position: 'absolute', top: 3, left: knobX,
          width: 20, height: 20, borderRadius: 10,
          backgroundColor: value ? GREEN : steel(0.5),
          boxShadow: '0px 1px 3px 0px rgba(0,0,0,0.5)',
          transition: 'left 0.2s cubic-bezier(0.4,0,0.2,1), background-color 0.2s ease',
        }} />
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
      backgroundColor: C.bg,
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
