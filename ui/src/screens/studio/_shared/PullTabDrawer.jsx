/**
 * PullTabDrawer — shared tactile pullout used by SetupScreen and ResultScreen.
 *
 * Single source of truth for the Studio Matte drawer styling so that any
 * future tweak (handle look, open/close glow, animation) lands in both
 * screens at once.  Tokens come from `theme/studioMatte` so the entire
 * pullout vocabulary is design-system-driven.
 *
 * Behaviour:
 *   • Closed state shows the label in muted steel; open state lifts to a
 *     warm amber glow + appends "· CLOSE" so the affordance is unambiguous.
 *   • Open state expands to fit ALL of its content — no inner clipping or
 *     scrollbar.  `maxH` / `sharedMaxH` are kept as props for backwards
 *     compatibility but only act as a generous animation ceiling so the
 *     max-height transition has a value to interpolate to; the drawer body
 *     itself uses `overflow: visible` so unusually tall content (long color
 *     palettes, dense modifier specs) flows naturally without cropping.
 *   • Closed content collapses to zero height with a smooth max-height +
 *     opacity transition.
 *
 * Open/close polish ("sexy feel"):
 *   • Spring-eased max-height curve (custom cubic-bezier) so the drawer
 *     glides open with a tiny overshoot rather than a flat lerp.
 *   • Handle pills brighten + glow amber when open, hairline pulse on the
 *     hover/press of the handle row.
 *   • Body content fades + slides up from a 6-px offset on open so the
 *     content "rises into" the drawer instead of popping in.
 *   • Pressing the handle row drops a tiny 1-px scale on the pills so the
 *     pull feels physically tactile.
 */
import { useState } from 'react';
import {
  C,
  steel,
  FONT_SMOOTH,
  PANEL_SHADOW,
  PANEL_BEVEL,
  DRAWER_HANDLE_SHADOW,
  DRAWER_HANDLE_BG,
  DRAWER_RADIUS,
  DRAWER_LABEL_FG_OPEN,
  DRAWER_LABEL_FG_CLOSED,
} from '../../../theme/studioMatte';

// Spring-easing curves — custom cubic-beziers tuned for a tactile pull.
//   OPEN  starts fast, decelerates, slight overshoot at the tail
//   CLOSE starts gentle, accelerates into a hard close
const EASE_OPEN  = 'cubic-bezier(0.16, 0.84, 0.32, 1.18)';
const EASE_CLOSE = 'cubic-bezier(0.55, 0.06, 0.68, 0.19)';

// Handle pill — slightly thicker + brighter when the drawer is open so the
// affordance reads as armed.
function HandlePill({ open, pressed }) {
  return (
    <div style={{
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: open ? 'rgba(245,210,140,0.32)' : DRAWER_HANDLE_BG,
      boxShadow: open
        ? 'inset 0px 1px 2px rgba(0,0,0,0.55), inset 0px 0px 4px rgba(0,0,0,0.25), 0 0 8px rgba(245,190,72,0.45), 0 0 1px rgba(245,210,140,0.6)'
        : DRAWER_HANDLE_SHADOW,
      transform: pressed ? 'scaleY(0.7)' : 'scaleY(1)',
      transition: 'background-color 0.4s ease, box-shadow 0.4s ease, transform 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
    }} />
  );
}

export default function PullTabDrawer({
  label,
  summary,     // optional one-line preview shown when closed
  open,
  onToggle,
  children,
  // Kept for backwards compat — drawer now sizes itself to its content.
  // eslint-disable-next-line no-unused-vars
  maxH = 4000,
  // eslint-disable-next-line no-unused-vars
  sharedMaxH = null,
}) {
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);

  // Easing flips with state — open uses the springy curve, close snaps shut.
  const ease = open ? EASE_OPEN : EASE_CLOSE;

  return (
    <div style={{
      borderRadius: DRAWER_RADIUS,
      backgroundColor: C.panelBg,
      boxShadow: open
        ? `${PANEL_SHADOW}, ${PANEL_BEVEL}, 0 0 0 0.5px rgba(245,190,72,0.10), 0 0 18px rgba(245,190,72,0.06)`
        : `${PANEL_SHADOW}, ${PANEL_BEVEL}`,
      overflow: 'hidden',
      position: 'relative',
      transition: 'box-shadow 0.5s ease',
    }}>
      {/* Bevel overlay so the inner radius reads as machined */}
      <div style={{
        position: 'absolute', inset: 0,
        borderRadius: DRAWER_RADIUS,
        pointerEvents: 'none',
        boxShadow: PANEL_BEVEL,
        zIndex: 10,
      }} />

      {/* Handle row */}
      <div
        onClick={onToggle}
        onPointerDown={() => setPressed(true)}
        onPointerUp={() => setPressed(false)}
        onPointerLeave={() => { setPressed(false); setHovered(false); }}
        onPointerEnter={() => setHovered(true)}
        style={{
          padding: '10px 20px',
          cursor: 'pointer',
          WebkitTapHighlightColor: 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          backgroundColor: pressed ? 'rgba(255,255,255,0.025)' : hovered ? 'rgba(255,255,255,0.012)' : 'transparent',
          transition: 'background-color 0.18s ease',
        }}
      >
        <HandlePill open={open} pressed={pressed} />
        <span style={{
          fontSize: 10,
          fontWeight: 700,
          color: open ? DRAWER_LABEL_FG_OPEN : DRAWER_LABEL_FG_CLOSED,
          letterSpacing: '1px',
          textShadow: open ? '0 0 6px rgba(245,190,72,0.35), 0 1px 0 rgba(0,0,0,0.6)' : '0 1px 0 rgba(0,0,0,0.4)',
          transform: pressed ? 'translateY(0.5px)' : 'translateY(0)',
          transition: 'color 0.4s ease, text-shadow 0.4s ease, transform 0.18s ease',
          ...FONT_SMOOTH,
        }}>
          {open ? `${label} · CLOSE` : label}
        </span>
        <HandlePill open={open} pressed={pressed} />
      </div>

      {/* Summary preview — visible when closed, fades out when opening */}
      {summary && (
        <p style={{
          margin: 0,
          padding: '0 20px 8px',
          fontSize: 10, fontWeight: 500, lineHeight: '14px',
          color: steel(0.55),
          letterSpacing: '0.15px',
          textAlign: 'center',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          opacity: open ? 0 : 1,
          maxHeight: open ? 0 : 22,
          transition: `opacity 0.25s ease, max-height 0.25s ${EASE_CLOSE}`,
          pointerEvents: 'none',
          ...FONT_SMOOTH,
        }}>{summary}</p>
      )}

      {/* Collapsing body — uses the grid-template-rows: 0fr→1fr trick so the
          drawer animates from 0 to its NATURAL content height (no max-height
          ceiling, no clipping, no overlap with the next drawer below).  The
          inner row stays overflow: hidden during the transition so content
          never escapes the drawer's own bounds while it's interpolating. */}
      <div style={{
        display: 'grid',
        gridTemplateRows: open ? '1fr' : '0fr',
        opacity: open ? 1 : 0,
        transition: open
          ? `grid-template-rows 0.55s ${EASE_OPEN}, opacity 0.32s ease 0.08s`
          : `grid-template-rows 0.32s ${EASE_CLOSE}, opacity 0.18s ease`,
      }}>
        <div style={{ minHeight: 0, overflow: 'hidden' }}>
          <div style={{
            padding: '4px 20px 14px',
            transform: open ? 'translateY(0)' : 'translateY(-6px)',
            transition: open
              ? `transform 0.5s ${EASE_OPEN} 0.04s`
              : `transform 0.22s ${EASE_CLOSE}`,
          }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
