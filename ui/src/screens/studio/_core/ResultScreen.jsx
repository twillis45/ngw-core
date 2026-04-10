/**
 * ResultScreen — Studio Matte design
 * Pixel-exact match to Figma:
 *   High confidence: YQgGd8KZyZoXzZwJV7p4b6 / 1493:2
 *   Low confidence:  YQgGd8KZyZoXzZwJV7p4b6 / 1498:2
 *
 * Layout: absolute-positioned top section (hero, pattern, pills, CTA)
 *         + flow analytical panel that expands in-place
 * All data from props — no hardcoded sample values.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { tapHaptic, selectHaptic, successHaptic, navHaptic, grainHaptic } from '../../../utils/haptics';
import { getFaceCropPosition } from '../../../utils/faceCrop';
import { useIsDesktop } from '../../../utils/useIsDesktop';
import { resultRevealSound, panelToggleSound, segmentPressSound, navSlideSound, softClickSound } from '../../../utils/sounds';
import scrollAffordance from '../../../assets/day1/scroll-affordance.svg';
import { steel, C, FONT_SMOOTH, VIEWFINDER_INNER_SHADOW, GLASS_REFLECTION, LENS_VIGNETTE,
         CTA_BG, CTA_SHADOW, CTA_BEVEL, PANEL_SHADOW, PANEL_BEVEL,
         TEXT_SHADOW_ENGRAVED,
         BTN_RAISED_UP, BTN_RAISED_DOWN, BTN_RECESSED_UP, BTN_RECESSED_DOWN } from '../../../theme/studioMatte';
import LightingDiagram from './components/LightingDiagram';
import Chip, { sevToVariant } from '../_shared/Chip';

// Pill inset shadow — exact from Figma pill nodes
const PILL_SHADOW = 'inset 1px 1px 2px 0px rgba(0,0,0,0.2), inset 1px 2px 4px 0px rgba(0,0,0,0.4)';

// Drawer handle shadow — matches SetupScreen
const DRAWER_HANDLE_SHADOW = 'inset 0px 1px 3px 0px rgba(0,0,0,0.6), inset 0px 0px 6px 0px rgba(0,0,0,0.3)';

// Display-string normalizer. Engine keys like "soft_key_dominant" or
// "split-complementary" must never leak into the UI as-is — Studio Matte
// rules forbid underscores/hyphens in visible text. `prettify` swaps them
// for spaces and (optionally) uppercases the result so chip pills, labels,
// and headings read as clean caps display copy.
function prettify(str, { upper = false } = {}) {
  if (str == null) return '';
  const cleaned = String(str).replace(/[_-]+/g, ' ').trim();
  return upper ? cleaned.toUpperCase() : cleaned;
}

// ─── Pull-tab drawer (mirrors SetupScreen's PullTabDrawer) ───────────────────
function PullTabDrawer({ label, open, onToggle, children, maxH = 600 }) {
  return (
    <div style={{
      borderRadius: 14, backgroundColor: C.panelBg,
      boxShadow: `${PANEL_SHADOW}, ${PANEL_BEVEL}`,
      overflow: 'hidden', position: 'relative',
    }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: 14, pointerEvents: 'none', boxShadow: PANEL_BEVEL, zIndex: 10 }} />
      <div onClick={onToggle} style={{
        padding: '10px 20px', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
      }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#0a0b0d', boxShadow: DRAWER_HANDLE_SHADOW }} />
        <span style={{ fontSize: 10, fontWeight: 700, color: steel(0.75), letterSpacing: '1px', ...FONT_SMOOTH }}>
          {open ? 'CLOSE' : label}
        </span>
        <div style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#0a0b0d', boxShadow: DRAWER_HANDLE_SHADOW }} />
      </div>
      <div style={{
        maxHeight: open ? maxH : 0,
        opacity: open ? 1 : 0,
        overflow: 'hidden',
        transition: 'max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease',
      }}>
        <div style={{ padding: '4px 20px 14px' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ─── ShadowSignature ─────────────────────────────────────────────────────────
// Tiny dashboard sitting inside the SHADOW ANALYSIS drawer on desktop. Turns
// the two raw engine values (nose_shadow_angle_deg, shadow_density) into a
// readable-at-a-glance graphic so the narrative below doesn't feel stranded
// after the full LightingDiagram was moved up to the hero column.
//
//   • Angle dial  — vertical reference + needle rotating from 0° (straight
//                   down) through ±60°. Reads as "which side is the light
//                   coming from" in a single image.
//   • Density bar — horizontal gradient (light → deep shadow) with a tick
//                   marker at the current density ratio.
//
// Both widgets live in engraved inset cards so they feel built into the
// Studio Matte surface rather than stamped on top. If neither signal is
// present the component renders null.
function ShadowSignature({ angleDeg, density }) {
  if (angleDeg == null && density == null) return null;

  const clampedAngle = angleDeg != null ? Math.max(-60, Math.min(60, angleDeg)) : null;
  const rad = clampedAngle != null ? (clampedAngle * Math.PI) / 180 : 0;
  // Needle tail pivots at (50, 14) — just above face/nose — and extends 46px
  // down and sideways. Positive angle → needle swings right, matching the
  // convention "nose shadow leans to subject's right when key light is to
  // subject's left".
  const needleX = 50 + 46 * Math.sin(rad);
  const needleY = 14 + 46 * Math.cos(rad);

  return (
    <div style={{
      display: 'flex', gap: 10, marginBottom: 14, alignItems: 'stretch',
    }}>
      {/* Angle dial card */}
      {angleDeg != null && (
        <div style={{
          flex: '0 0 auto', width: 116,
          padding: '10px 10px 8px',
          borderRadius: 10,
          backgroundColor: '#070709',
          boxShadow: 'inset 1px 1px 3px rgba(0,0,0,0.55), inset -0.5px -0.5px 0.5px rgba(255,255,255,0.035)',
        }}>
          <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: steel(0.55), letterSpacing: '0.9px', ...FONT_SMOOTH }}>
            NOSE SHADOW
          </p>
          <svg viewBox="0 0 100 72" width="96" height="72" style={{ display: 'block', margin: '2px auto 0' }}>
            {/* ±60° arc */}
            <path
              d={`M ${50 - 50 * Math.sin(Math.PI / 3)} ${14 + 50 * Math.cos(Math.PI / 3)} A 50 50 0 0 1 ${50 + 50 * Math.sin(Math.PI / 3)} ${14 + 50 * Math.cos(Math.PI / 3)}`}
              fill="none" stroke="rgba(184,191,199,0.12)" strokeWidth="1"
            />
            {/* tick marks at -60, -30, 0, 30, 60 */}
            {[-60, -30, 0, 30, 60].map((deg) => {
              const r = (deg * Math.PI) / 180;
              const x1 = 50 + 46 * Math.sin(r);
              const y1 = 14 + 46 * Math.cos(r);
              const x2 = 50 + 50 * Math.sin(r);
              const y2 = 14 + 50 * Math.cos(r);
              return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(184,191,199,0.25)" strokeWidth="1" />;
            })}
            {/* pivot dot (nose tip) */}
            <circle cx={50} cy={14} r={2.2} fill="rgba(184,191,199,0.55)" />
            {/* needle */}
            <line
              x1={50} y1={14} x2={needleX} y2={needleY}
              stroke="rgba(245,190,72,0.95)" strokeWidth="2" strokeLinecap="round"
            />
            <circle cx={needleX} cy={needleY} r={1.8} fill="rgba(245,190,72,1)" />
          </svg>
          <p style={{ margin: '2px 0 0', fontSize: 13, fontWeight: 700, color: C.textSub, textAlign: 'center', ...FONT_SMOOTH }}>
            {angleDeg > 0 ? '+' : ''}{angleDeg.toFixed(0)}°
          </p>
        </div>
      )}

      {/* Density bar card */}
      {density != null && (
        <div style={{
          flex: 1, minWidth: 0,
          padding: '10px 14px 10px',
          borderRadius: 10,
          backgroundColor: '#070709',
          boxShadow: 'inset 1px 1px 3px rgba(0,0,0,0.55), inset -0.5px -0.5px 0.5px rgba(255,255,255,0.035)',
          display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: steel(0.55), letterSpacing: '0.9px', ...FONT_SMOOTH }}>
              SHADOW DENSITY
            </p>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: C.textSub, ...FONT_SMOOTH }}>
              {(density * 100).toFixed(0)}%
            </p>
          </div>
          <div style={{ position: 'relative', marginTop: 14 }}>
            {/* Gradient track — midtone steel → deep black */}
            <div style={{
              height: 6, borderRadius: 3,
              background: 'linear-gradient(90deg, rgba(184,191,199,0.35) 0%, rgba(184,191,199,0.18) 40%, rgba(0,0,0,0.9) 100%)',
              boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.6), inset 0 -0.5px 0 rgba(255,255,255,0.03)',
            }} />
            {/* Marker */}
            <div style={{
              position: 'absolute', top: -3, left: `calc(${Math.max(0, Math.min(1, density)) * 100}% - 4px)`,
              width: 8, height: 12, borderRadius: 2,
              backgroundColor: 'rgba(245,190,72,0.95)',
              boxShadow: '0 0 6px rgba(245,190,72,0.6), inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 1px rgba(0,0,0,0.4)',
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontSize: 8, fontWeight: 600, color: steel(0.35), letterSpacing: '0.5px', ...FONT_SMOOTH }}>OPEN</span>
            <span style={{ fontSize: 8, fontWeight: 600, color: steel(0.35), letterSpacing: '0.5px', ...FONT_SMOOTH }}>DEEP</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SceneField ─────────────────────────────────────────────────────────────
// Engraved inset tile for VLM narrative fields (Lighting, Mood, Framing,
// Pose, Expression, Style reference). Used by the SCENE drawer — swaps the
// previous flat label/value list for proper chip-card personality so the
// drawer has rhythm and doesn't read like a debug dump.
function SceneField({ label, value }) {
  return (
    <div style={{
      padding: '10px 12px',
      borderRadius: 10,
      backgroundColor: '#08090c',
      boxShadow: 'inset 1px 1px 3px rgba(0,0,0,0.55), inset -0.5px -0.5px 0.5px rgba(255,255,255,0.035)',
      minWidth: 0,
    }}>
      <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: steel(0.55), letterSpacing: '0.9px', ...FONT_SMOOTH }}>
        {prettify(label, { upper: true })}
      </p>
      <p style={{ margin: '4px 0 0', fontSize: 12, fontWeight: 500, color: C.textSubBold, lineHeight: '16px', textShadow: '0 1px 0 rgba(0,0,0,0.45)', ...FONT_SMOOTH }}>
        {prettify(value)}
      </p>
    </div>
  );
}

// ─── SignalGauge ────────────────────────────────────────────────────────────
// One row of the CONFIDENCE drawer's RAW SIGNALS readout. Replaces the old
// flat numeric pill with: label, big value, and a tactile mini bar that
// shows the value's position within an expected range. For percentage
// signals the bar grows from the left; for the signed nose-shadow angle the
// bar is center-anchored so positive/negative is visually obvious.
function SignalGauge({ label, value, display, mode, accentColor }) {
  // mode: 'pct'   → 0..1 normalized, bar grows left→right
  //       'signed'→ value in degrees, range -60..+60, bar center-anchored
  let leftPct = 0, widthPct = 0;
  if (mode === 'pct') {
    const v = Math.max(0, Math.min(1, value));
    leftPct = 0;
    widthPct = v * 100;
  } else if (mode === 'signed') {
    const v = Math.max(-60, Math.min(60, value));
    if (v >= 0) {
      leftPct = 50;
      widthPct = (v / 60) * 50;
    } else {
      leftPct = 50 + (v / 60) * 50;
      widthPct = -(v / 60) * 50;
    }
  }
  return (
    <div style={{
      flex: '1 1 calc(50% - 5px)', minWidth: 130,
      padding: '10px 12px',
      borderRadius: 10,
      backgroundColor: '#070709',
      boxShadow: 'inset 1px 1px 3px rgba(0,0,0,0.55), inset -0.5px -0.5px 0.5px rgba(255,255,255,0.035)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: steel(0.55), letterSpacing: '0.9px', ...FONT_SMOOTH }}>
          {label}
        </p>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: C.textSub, ...FONT_SMOOTH }}>
          {display}
        </p>
      </div>
      <div style={{
        position: 'relative', marginTop: 9, height: 5, borderRadius: 2.5,
        backgroundColor: 'rgba(184,191,199,0.08)',
        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.5)',
      }}>
        {/* Center tick for signed mode so the zero line is visible */}
        {mode === 'signed' && (
          <div style={{ position: 'absolute', left: '50%', top: -1, width: 1, height: 7, backgroundColor: steel(0.35) }} />
        )}
        <div style={{
          position: 'absolute', top: 0, height: '100%', borderRadius: 2.5,
          left: `${leftPct}%`, width: `${widthPct}%`,
          backgroundColor: accentColor || 'rgba(245,190,72,0.85)',
          boxShadow: `0 0 4px ${accentColor || 'rgba(245,190,72,0.6)'}, inset 0 0.5px 0 rgba(255,255,255,0.4)`,
          transition: 'width 0.4s ease, left 0.4s ease',
        }} />
      </div>
    </div>
  );
}

// ─── ModifierSilhouette ─────────────────────────────────────────────────────
// Tiny SVG silhouette of the classified modifier shape (rectangular softbox,
// octabox, strip, beauty dish, ring, umbrella, parabolic, or generic). Sits
// at the top of the CATCHLIGHT & MODIFIER drawer so the reader sees WHAT the
// gear looks like alongside the spec grid. The actual physical dimensions
// live in the ModifierDetail spec cells below.
function ModifierSilhouette({ family }) {
  const f = (family || '').toLowerCase();
  const shape = f.includes('ring')     ? 'ring'
              : f.includes('strip')    ? 'strip'
              : f.includes('oct')      ? 'oct'
              : f.includes('beauty')   ? 'beauty'
              : f.includes('umbrella') ? 'umbrella'
              : f.includes('parabolic')? 'parabolic'
              : 'rect';

  const stroke = steel(0.55);
  const glow   = 'rgba(245,190,72,0.18)';
  const hi     = 'rgba(245,190,72,0.55)';

  return (
    <svg viewBox="0 0 100 100" width="90" height="90" style={{ display: 'block' }}>
      {/* front glow behind everything to suggest the modifier is emitting */}
      <defs>
        <radialGradient id="mod-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={glow} />
          <stop offset="70%" stopColor="rgba(245,190,72,0)" />
        </radialGradient>
      </defs>
      <rect x={0} y={0} width={100} height={100} fill="url(#mod-glow)" />
      {shape === 'rect' && (
        <>
          <rect x={22} y={26} width={56} height={42} rx={3} fill="none" stroke={stroke} strokeWidth={1.5} />
          <rect x={26} y={30} width={48} height={34} rx={2} fill="rgba(245,190,72,0.10)" stroke={hi} strokeWidth={0.8} />
          <line x1={26} y1={47} x2={74} y2={47} stroke={stroke} strokeWidth={0.6} />
          <line x1={50} y1={30} x2={50} y2={64} stroke={stroke} strokeWidth={0.6} />
          <line x1={78} y1={68} x2={92} y2={82} stroke={stroke} strokeWidth={1.2} />
          <circle cx={92} cy={82} r={2.2} fill={stroke} />
        </>
      )}
      {shape === 'strip' && (
        <>
          <rect x={38} y={16} width={24} height={70} rx={3} fill="none" stroke={stroke} strokeWidth={1.5} />
          <rect x={41} y={19} width={18} height={64} rx={2} fill="rgba(245,190,72,0.10)" stroke={hi} strokeWidth={0.8} />
          <line x1={41} y1={50} x2={59} y2={50} stroke={stroke} strokeWidth={0.5} />
          <line x1={62} y1={84} x2={76} y2={92} stroke={stroke} strokeWidth={1.2} />
        </>
      )}
      {shape === 'oct' && (
        <>
          <polygon points="36,22 64,22 80,38 80,62 64,78 36,78 20,62 20,38"
                   fill="none" stroke={stroke} strokeWidth={1.5} />
          <polygon points="39,26 61,26 74,39 74,61 61,74 39,74 26,61 26,39"
                   fill="rgba(245,190,72,0.10)" stroke={hi} strokeWidth={0.8} />
          <circle cx={50} cy={50} r={3} fill={hi} opacity={0.6} />
          <line x1={74} y1={74} x2={86} y2={86} stroke={stroke} strokeWidth={1.2} />
        </>
      )}
      {shape === 'beauty' && (
        <>
          <ellipse cx={50} cy={48} rx={32} ry={12} fill="none" stroke={stroke} strokeWidth={1.5} />
          <ellipse cx={50} cy={48} rx={28} ry={10} fill="rgba(245,190,72,0.10)" stroke={hi} strokeWidth={0.7} />
          {/* deflector */}
          <circle cx={50} cy={48} r={6} fill="#0a0b0d" stroke={stroke} strokeWidth={0.8} />
          {/* depth */}
          <path d="M18 48 L30 72 L70 72 L82 48" fill="none" stroke={stroke} strokeWidth={1} />
          <line x1={72} y1={72} x2={84} y2={84} stroke={stroke} strokeWidth={1.2} />
        </>
      )}
      {shape === 'ring' && (
        <>
          <circle cx={50} cy={50} r={30} fill="none" stroke={stroke} strokeWidth={1.5} />
          <circle cx={50} cy={50} r={26} fill="rgba(245,190,72,0.08)" stroke={hi} strokeWidth={0.8} />
          <circle cx={50} cy={50} r={13} fill="#0a0b0d" stroke={stroke} strokeWidth={1} />
        </>
      )}
      {shape === 'umbrella' && (
        <>
          <path d="M18 56 Q50 14 82 56 Z" fill="rgba(245,190,72,0.10)" stroke={stroke} strokeWidth={1.4} />
          <path d="M18 56 Q50 14 82 56" fill="none" stroke={hi} strokeWidth={0.8} />
          {/* ribs */}
          <line x1={50} y1={14} x2={50} y2={56} stroke={stroke} strokeWidth={0.6} />
          <line x1={34} y1={20} x2={50} y2={56} stroke={stroke} strokeWidth={0.5} />
          <line x1={66} y1={20} x2={50} y2={56} stroke={stroke} strokeWidth={0.5} />
          {/* shaft */}
          <line x1={50} y1={56} x2={50} y2={88} stroke={stroke} strokeWidth={1.2} />
        </>
      )}
      {shape === 'parabolic' && (
        <>
          <path d="M14 72 Q50 8 86 72" fill="none" stroke={stroke} strokeWidth={1.6} />
          <path d="M20 70 Q50 18 80 70" fill="rgba(245,190,72,0.10)" stroke={hi} strokeWidth={0.8} />
          {/* subject line */}
          <circle cx={50} cy={72} r={2} fill={stroke} />
        </>
      )}
    </svg>
  );
}

// ─── CatchlightEye ──────────────────────────────────────────────────────────
// Stylized eye outline with a catchlight dot positioned at the clock hour
// implied by nose shadow angle. Positive nose-shadow angle (shadow leans to
// subject's right → light from subject's upper-left) maps to a catchlight on
// the subject's upper-left side of the iris. The shape is intentionally
// schematic, not anatomical, so it reads at ~90px wide.
function CatchlightEye({ angleDeg }) {
  const clamped = angleDeg != null ? Math.max(-60, Math.min(60, angleDeg)) : 0;
  // Catchlight sits on the opposite side of the iris from the shadow direction.
  // Map angle to clock position around an ellipse of radius rx=18, ry=14.
  const rad = ((-clamped - 90) * Math.PI) / 180; // -90 = top; rotate by -angle
  const cx = 50 + 18 * Math.cos(rad);
  const cy = 44 + 14 * Math.sin(rad);
  const stroke = steel(0.55);

  return (
    <svg viewBox="0 0 100 90" width="90" height="80" style={{ display: 'block' }}>
      {/* almond eye shape */}
      <path d="M12 44 Q50 12 88 44 Q50 76 12 44 Z" fill="rgba(184,191,199,0.06)" stroke={stroke} strokeWidth={1.3} />
      {/* iris */}
      <circle cx={50} cy={44} r={20} fill="rgba(60,70,85,0.55)" stroke={stroke} strokeWidth={1} />
      {/* pupil */}
      <circle cx={50} cy={44} r={8} fill="#05060a" />
      {/* catchlight — only if we had a valid angle */}
      {angleDeg != null && (
        <>
          <circle cx={cx} cy={cy} r={4.5} fill="rgba(255,255,255,0.92)" />
          <circle cx={cx - 1.2} cy={cy - 1.2} r={1.8} fill="#ffffff" />
        </>
      )}
      {/* subtle upper lash line */}
      <path d="M14 42 Q50 16 86 42" fill="none" stroke={stroke} strokeWidth={0.6} opacity={0.5} />
    </svg>
  );
}

// ─── CCTAxis ────────────────────────────────────────────────────────────────
// Horizontal Kelvin axis for the COLOR PALETTE drawer. Maps a 2500K–8500K
// range onto a tungsten→daylight→shade gradient and plants a glowing marker
// at the parsed key CCT and a smaller marker at the shadow CCT, so the
// palette's color story has a graphic anchor instead of two abstract
// "5400K" rows.
function parseKelvin(str) {
  if (!str) return null;
  const m = String(str).match(/(\d{3,5})/);
  if (!m) return null;
  const k = parseInt(m[1], 10);
  if (isNaN(k) || k < 1500 || k > 12000) return null;
  return k;
}
function CCTAxis({ keyKStr, shadowKStr }) {
  const keyK = parseKelvin(keyKStr);
  const shadowK = parseKelvin(shadowKStr);
  if (keyK == null && shadowK == null) return null;

  const MIN = 2500, MAX = 8500;
  const pct = (k) => `${Math.max(0, Math.min(1, (k - MIN) / (MAX - MIN))) * 100}%`;

  return (
    <div style={{
      marginTop: 6, marginBottom: 14,
      padding: '12px 14px 10px',
      borderRadius: 10,
      backgroundColor: '#070709',
      boxShadow: 'inset 1px 1px 3px rgba(0,0,0,0.55), inset -0.5px -0.5px 0.5px rgba(255,255,255,0.035)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: steel(0.55), letterSpacing: '0.9px', ...FONT_SMOOTH }}>
          COLOR TEMPERATURE
        </p>
        <span style={{ fontSize: 9, fontWeight: 600, color: steel(0.40), letterSpacing: '0.3px', ...FONT_SMOOTH }}>
          KELVIN
        </span>
      </div>
      <div style={{ position: 'relative', height: 22 }}>
        {/* Gradient track */}
        <div style={{
          position: 'absolute', left: 0, right: 0, top: 8, height: 8,
          borderRadius: 4,
          background: 'linear-gradient(90deg, #ff9c3a 0%, #ffb56a 18%, #fff0d8 38%, #ffffff 50%, #d8ecff 62%, #a8c8f0 82%, #6f9bd6 100%)',
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.6), inset 0 -0.5px 0 rgba(255,255,255,0.1)',
        }} />
        {/* Key marker */}
        {keyK != null && (
          <div style={{
            position: 'absolute', top: 0, left: pct(keyK), transform: 'translateX(-50%)',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
          }}>
            <div style={{
              width: 11, height: 22, borderRadius: 3,
              backgroundColor: 'rgba(245,190,72,0.95)',
              boxShadow: '0 0 8px rgba(245,190,72,0.65), inset 0 1px 0 rgba(255,255,255,0.4), inset 0 -1px 1px rgba(0,0,0,0.4)',
            }} />
          </div>
        )}
        {/* Shadow marker (smaller, cooler accent) */}
        {shadowK != null && (
          <div style={{
            position: 'absolute', top: 4, left: pct(shadowK), transform: 'translateX(-50%)',
          }}>
            <div style={{
              width: 7, height: 14, borderRadius: 2,
              backgroundColor: 'rgba(168,200,240,0.9)',
              boxShadow: '0 0 4px rgba(168,200,240,0.55), inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -1px 1px rgba(0,0,0,0.4)',
            }} />
          </div>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        <span style={{ fontSize: 8, fontWeight: 600, color: steel(0.35), letterSpacing: '0.4px', ...FONT_SMOOTH }}>2500K · TUNGSTEN</span>
        <span style={{ fontSize: 8, fontWeight: 600, color: steel(0.35), letterSpacing: '0.4px', ...FONT_SMOOTH }}>5500K · DAYLIGHT</span>
        <span style={{ fontSize: 8, fontWeight: 600, color: steel(0.35), letterSpacing: '0.4px', ...FONT_SMOOTH }}>8500K · SHADE</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 8 }}>
        {keyK != null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 7, height: 10, borderRadius: 2, backgroundColor: 'rgba(245,190,72,0.95)', boxShadow: '0 0 4px rgba(245,190,72,0.5)' }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: C.textSub, ...FONT_SMOOTH }}>KEY {keyK}K</span>
          </div>
        )}
        {shadowK != null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{ width: 5, height: 8, borderRadius: 2, backgroundColor: 'rgba(168,200,240,0.9)', boxShadow: '0 0 4px rgba(168,200,240,0.5)' }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: C.textSub, ...FONT_SMOOTH }}>SHADOW {shadowK}K</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Pill({ label }) {
  return (
    <div style={{
      height: 28,
      paddingLeft: 10, paddingRight: 10,
      backgroundColor: C.pillBg,
      borderRadius: 6,
      display: 'flex', alignItems: 'center',
      boxShadow: PILL_SHADOW,
      flexShrink: 0,
    }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: C.textMeta, whiteSpace: 'nowrap', WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', textRendering: 'geometricPrecision' }}>{label}</span>
    </div>
  );
}

function PatternBars({ candidates, isHighConf }) {
  const scoreColor  = isHighConf ? C.confHigh     : C.confLowScore;
  const barFill     = isHighConf ? C.confHighBar  : C.confLowBar;
  const TRACK_W     = 270;

  return (
    <div style={{ padding: '0 20px 16px' }}>
      {candidates.map((c, i) => (
        <div key={c.name} style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{
              fontSize: 13,
              fontWeight: i === 0 ? 600 : 500,
              color: i === 0 ? C.textSubBold : C.textSub,
              WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', textRendering: 'geometricPrecision',
            }}>{c.name}</span>
            <span style={{
              fontSize: 13, fontWeight: 600,
              color: i === 0 ? scoreColor : C.textSub,
              WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', textRendering: 'geometricPrecision',
            }}>{c.score}%</span>
          </div>
          {/* Bar track + fill */}
          <div style={{
            width: TRACK_W, height: 3, borderRadius: 1.5,
            backgroundColor: C.barTrack,
            position: 'relative',
          }}>
            <div style={{
              position: 'absolute', left: 0, top: 0,
              width: `${(c.score / 100) * TRACK_W}px`, height: '100%',
              borderRadius: 1.5,
              backgroundColor: i === 0 ? barFill : C.barAlt,
              transition: 'width 0.4s ease',
            }} />
          </div>
        </div>
      ))}
      {!isHighConf && (
        <p style={{
          margin: '12px 0 0', fontSize: 11,
          color: C.textWarn, lineHeight: 1.4,
          WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', textRendering: 'geometricPrecision',
        }}>Close match — try a sharper photo for higher confidence</p>
      )}
    </div>
  );
}

// ─── LC bottom actions: Retake (raised) | Set up anyway (recessed) ───────────
function LCBottomActions({ onRetry, onSetup, infoVisible, isDragging, top }) {
  const [retakePressed, setRetakePressed] = useState(false);
  const [setupPressed, setSetupPressed]   = useState(false);

  const TROUGH_SHADOW = [
    'inset 0px 3px 6px 0px rgba(0,0,0,0.7)',
    'inset 0px 1px 3px 0px rgba(0,0,0,0.5)',
    'inset 1px 0px 2px 0px rgba(0,0,0,0.3)',
    'inset -1px 0px 2px 0px rgba(0,0,0,0.3)',
    '0px 1px 0px 0px rgba(255,255,255,0.025)',
  ].join(', ');

  // New Photo — inset/recessed secondary
  const RETAKE_UP   = BTN_RECESSED_UP;
  const RETAKE_DOWN = BTN_RECESSED_DOWN;

  // Build Closest Match — raised primary CTA
  const SETUP_UP   = BTN_RAISED_UP;
  const SETUP_DOWN = BTN_RAISED_DOWN;

  return (
    <div style={{
      position: 'absolute', top, left: '50%',
      transform: `translateX(-50%)${infoVisible ? '' : ' translateY(40px)'}`,
      opacity: infoVisible ? 1 : 0,
      transition: isDragging ? 'none' : 'opacity 0.3s ease, transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
      pointerEvents: infoVisible ? 'auto' : 'none',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center',
        height: 52, borderRadius: 16,
        backgroundColor: '#060608',
        boxShadow: TROUGH_SHADOW,
        padding: 4, gap: 0,
        minWidth: 260,
      }}>
        {/* NEW PHOTO — inset secondary */}
        <button
          onPointerDown={() => setRetakePressed(true)}
          onPointerUp={() => { setRetakePressed(false); segmentPressSound(); navHaptic(); onRetry(); }}
          onPointerLeave={() => setRetakePressed(false)}
          style={{
            flex: 1, height: 44, borderRadius: 12,
            backgroundColor: retakePressed ? 'rgba(255,255,255,0.02)' : 'transparent',
            boxShadow: retakePressed ? RETAKE_DOWN : RETAKE_UP,
            border: 'none', cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
            transition: 'box-shadow 0.1s ease, background-color 0.1s ease',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <span style={{
            fontSize: 13, fontWeight: 500, letterSpacing: '0.3px',
            color: retakePressed ? 'rgba(167,173,183,0.4)' : 'rgba(167,173,183,0.6)',
            transition: 'color 0.1s ease',
            ...FONT_SMOOTH,
          }}>New Photo</span>
        </button>

        {/* Separator */}
        <div style={{
          width: 1, height: 24, flexShrink: 0,
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, rgba(255,255,255,0.05) 50%, rgba(0,0,0,0.5) 100%)',
          boxShadow: '1px 0px 0px 0px rgba(255,255,255,0.04)',
        }} />

        {/* BUILD CLOSEST MATCH — raised primary CTA */}
        <button
          onPointerDown={() => setSetupPressed(true)}
          onPointerUp={() => { setSetupPressed(false); softClickSound(); tapHaptic(); onSetup(); }}
          onPointerLeave={() => setSetupPressed(false)}
          style={{
            flex: 1, height: 44, borderRadius: 12,
            background: setupPressed
              ? 'linear-gradient(141.71deg, #242730 0%, #1d1f28 50%, #181a22 100%)'
              : 'linear-gradient(141.71deg, #383c4a 0%, #2c303c 40%, #222535 100%)',
            boxShadow: setupPressed ? SETUP_DOWN : SETUP_UP,
            border: 'none', cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
            transition: 'box-shadow 0.1s ease, background 0.1s ease',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <span style={{
            fontSize: 12, fontWeight: 700, letterSpacing: '0.3px',
            color: setupPressed ? 'rgba(245,247,250,0.75)' : 'rgba(245,247,250,0.95)',
            textShadow: setupPressed ? 'none' : '0px 1px 2px rgba(0,0,0,0.5)',
            transition: 'color 0.1s ease',
            ...FONT_SMOOTH,
          }}>Build Closest Match</span>
        </button>
      </div>
    </div>
  );
}

// ─── Bottom action row with tactile press states ─────────────────────────────
function BottomActions({ onRetry, onSetup, infoVisible, isDragging }) {
  const [retakePressed, setRetakePressed] = useState(false);
  const [savePressed, setSavePressed]     = useState(false);

  // Trough: deep inset moat the buttons sit in
  const TROUGH_SHADOW = [
    'inset 0px 3px 6px 0px rgba(0,0,0,0.7)',
    'inset 0px 1px 3px 0px rgba(0,0,0,0.5)',
    'inset 1px 0px 2px 0px rgba(0,0,0,0.3)',
    'inset -1px 0px 2px 0px rgba(0,0,0,0.3)',
    '0px 1px 0px 0px rgba(255,255,255,0.025)',
  ].join(', ');

  // New Photo: inset secondary — recessed into trough
  const RETAKE_UP   = BTN_RECESSED_UP;
  const RETAKE_DOWN = BTN_RECESSED_DOWN;

  // Save: raised primary CTA — pops off the surface
  const SAVE_UP   = BTN_RAISED_UP;
  const SAVE_DOWN = BTN_RAISED_DOWN;

  return (
    <div style={{
      display: 'flex', justifyContent: 'center',
      padding: '16px 25px 20px',
      opacity: infoVisible ? 1 : 0,
      transform: infoVisible ? 'translateY(0)' : 'translateY(40px)',
      transition: isDragging ? 'none' : 'opacity 0.25s ease 0.1s, transform 0.35s cubic-bezier(0.4, 0, 0.2, 1) 0.1s',
      pointerEvents: infoVisible ? 'auto' : 'none',
    }}>
      {/* Deep trough */}
      <div style={{
        display: 'flex', alignItems: 'center',
        height: 52, borderRadius: 16,
        backgroundColor: '#060608',
        boxShadow: TROUGH_SHADOW,
        padding: 4,
        gap: 0,
        minWidth: 240,
      }}>

        {/* NEW PHOTO — inset secondary */}
        <button
          onPointerDown={() => setRetakePressed(true)}
          onPointerUp={() => { setRetakePressed(false); segmentPressSound(); navHaptic(); onRetry(); }}
          onPointerLeave={() => setRetakePressed(false)}
          style={{
            flex: 1, height: 44,
            borderRadius: 12,
            backgroundColor: retakePressed ? 'rgba(255,255,255,0.02)' : 'transparent',
            boxShadow: retakePressed ? RETAKE_DOWN : RETAKE_UP,
            border: 'none', cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
            transition: 'box-shadow 0.1s ease, background-color 0.1s ease',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <span style={{
            fontSize: 13, fontWeight: 500, letterSpacing: '0.3px',
            color: retakePressed ? 'rgba(167,173,183,0.4)' : 'rgba(167,173,183,0.6)',
            transition: 'color 0.1s ease',
            ...FONT_SMOOTH,
          }}>New Photo</span>
        </button>

        {/* Separator — engraved groove */}
        <div style={{
          width: 1, height: 24, flexShrink: 0,
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, rgba(255,255,255,0.05) 50%, rgba(0,0,0,0.5) 100%)',
          boxShadow: '1px 0px 0px 0px rgba(255,255,255,0.04)',
        }} />

        {/* SAVE — raised primary CTA */}
        <button
          onPointerDown={() => setSavePressed(true)}
          onPointerUp={() => { setSavePressed(false); segmentPressSound(); tapHaptic(); onSetup(); }}
          onPointerLeave={() => setSavePressed(false)}
          style={{
            flex: 1, height: 44,
            borderRadius: 12,
            background: savePressed
              ? 'linear-gradient(141.71deg, #242730 0%, #1d1f28 50%, #181a22 100%)'
              : 'linear-gradient(141.71deg, #383c4a 0%, #2c303c 40%, #222535 100%)',
            boxShadow: savePressed ? SAVE_DOWN : SAVE_UP,
            border: 'none', cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
            transition: 'box-shadow 0.1s ease, background 0.1s ease',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <span style={{
            fontSize: 13, fontWeight: 700, letterSpacing: '0.5px',
            color: savePressed ? 'rgba(245,247,250,0.75)' : 'rgba(245,247,250,0.95)',
            textShadow: savePressed ? 'none' : '0px 1px 2px rgba(0,0,0,0.5)',
            transition: 'color 0.1s ease',
            ...FONT_SMOOTH,
          }}>Save</span>
        </button>
      </div>
    </div>
  );
}

// FONT_SMOOTH imported from studioMatte

// ─── Spec cell — matches SetupScreen Studio Matte spec card style ─────────
const SPEC_CELL_BG     = 'rgba(0,0,0,0.08)';
const SPEC_CELL_SHADOW = 'inset 0px 1px 2px 0px rgba(0,0,0,0.45), inset 0px 0px 4px 0px rgba(0,0,0,0.25)';

function SpecCell({ label, value, secondary, secondaryColor }) {
  return (
    <div style={{
      flex: 1, minWidth: 0, borderRadius: 8,
      padding: '8px 10px',
      backgroundColor: SPEC_CELL_BG,
      boxShadow: SPEC_CELL_SHADOW,
    }}>
      <p style={{ margin: 0, fontSize: 9, fontWeight: 600, color: steel(0.5), letterSpacing: '0.8px', ...FONT_SMOOTH }}>{label}</p>
      <p style={{ margin: '4px 0 0', fontSize: 16, fontWeight: 700, color: C.textPrimary, lineHeight: 1.2, ...FONT_SMOOTH, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</p>
      {secondary && (
        <p style={{ margin: '3px 0 0', fontSize: 11, fontWeight: 600, color: secondaryColor || C.confHigh, ...FONT_SMOOTH }}>
          {secondary}
        </p>
      )}
    </div>
  );
}

// ─── Modifier detail card — Studio Matte hero + spec grid ─────────────────
function ModifierDetail({ modifier }) {
  if (!modifier) return null;

  const heroName = modifier.sizeLabel
    ? `${modifier.sizeLabel} ${modifier.family || 'Modifier'}`
    : (modifier.family || null);

  const cells = [
    modifier.distRange && (
      <SpecCell
        key="dist"
        label="DISTANCE"
        value={modifier.distRange}
        secondary={modifier.optDist ? `optimal ${modifier.optDist}` : null}
        secondaryColor={C.confHigh}
      />
    ),
    modifier.position && (
      <SpecCell
        key="pos"
        label="POSITION"
        value={modifier.position}
        secondary={[modifier.positionQuad, modifier.positionIntensity].filter(Boolean).join(' · ') || null}
      />
    ),
    modifier.shape && (
      <SpecCell
        key="shape"
        label="SHAPE"
        value={modifier.shape}
        secondary={modifier.catchlightSize || null}
      />
    ),
    modifier.lightCount && (
      <SpecCell key="lights" label="LIGHTS" value={String(modifier.lightCount)} />
    ),
    modifier.angularArea && (
      <SpecCell key="cov" label="COVERAGE" value={modifier.angularArea} />
    ),
  ].filter(Boolean);

  if (!heroName && !cells.length) return null;

  // Pair cells into rows of 2 for the spec grid layout
  const rows = [];
  for (let i = 0; i < cells.length; i += 2) {
    rows.push(cells.slice(i, i + 2));
  }

  return (
    <div style={{ marginTop: 12 }}>
      {heroName && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.textPrimary, lineHeight: 1.2, ...FONT_SMOOTH }}>
            {heroName}
          </p>
          {modifier.sizeRange && (
            <p style={{ margin: '3px 0 0', fontSize: 11, fontWeight: 500, color: steel(0.45), ...FONT_SMOOTH }}>
              {modifier.sizeRange}
            </p>
          )}
        </div>
      )}
      {rows.map((row, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginTop: i === 0 ? 0 : 8 }}>
          {row}
          {row.length === 1 && <div style={{ flex: 1 }} />}
        </div>
      ))}
    </div>
  );
}

export default function ResultScreen({ result, imagePreview, onSetup, onRetry }) {
  const isDesktop = useIsDesktop();
  // Hero column: 430 on mobile, 540 on desktop — the wider column lets the
  // photo breathe (less aggressive face crop) and makes room for a taller
  // hero block alongside the analytical panel. FitToViewport handles the
  // uniform scale on wide screens at the app shell.
  const heroWidth = isDesktop ? 540 : 430;
  const [drawers, setDrawers] = useState(() =>
    result && result.confidence < 70 ? { patterns: true } : {}
  );
  const [infoVisible, setInfoVisible] = useState(true);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(null);
  const dragThreshold = 40; // px to commit show/hide
  const longPressTimer = useRef(null);
  const longPressFired = useRef(false);
  const [isZoomed, setIsZoomed] = useState(false);

  // Zoom pan + pinch state
  const [zoomScale, setZoomScale] = useState(1);
  const [zoomPan, setZoomPan] = useState({ x: 0, y: 0 });
  const pinchStartDist = useRef(null);
  const pinchStartScale = useRef(1);
  const panStart = useRef(null);
  const panStartOffset = useRef({ x: 0, y: 0 });
  // Tap-to-exit-zoom: tracks whether the in-flight touch is still tap-eligible
  // (single finger, no significant movement, hasn't pinched).  Cleared as soon
  // as the user pans, pinches, or lifts.
  const zoomTapCandidate = useRef(false);
  const zoomTapStart = useRef({ x: 0, y: 0, t: 0 });
  // Brief lockout after exiting zoom — prevents the synthesized click that
  // fires after touchend from re-triggering long-press logic and bouncing
  // straight back into zoom.  Set true in exitZoom(), cleared after 600ms.
  const recentlyExitedZoom = useRef(false);

  // Result reveal sound + haptic on mount
  useEffect(() => {
    resultRevealSound();
    successHaptic();
  }, []);

  const startDrag = useCallback((clientY) => {
    dragStartY.current = clientY;
    setIsDragging(true);
  }, []);

  const moveDrag = useCallback((clientY) => {
    if (dragStartY.current === null) return;
    const dy = clientY - dragStartY.current;
    // Cancel long press if user is dragging
    if (Math.abs(dy) > 8 && longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (infoVisible) {
      setDragOffset(Math.max(0, dy));
    } else {
      setDragOffset(Math.min(0, dy));
    }
  }, [infoVisible]);

  const endDrag = useCallback(() => {
    if (infoVisible && dragOffset > dragThreshold) {
      setInfoVisible(false);
      selectHaptic();
    } else if (!infoVisible && dragOffset < -dragThreshold) {
      setInfoVisible(true);
      selectHaptic();
    }
    setDragOffset(0);
    setIsDragging(false);
    dragStartY.current = null;
  }, [infoVisible, dragOffset]);

  // Long-press zoom handler for hero
  const handleHeroStart = useCallback((clientY) => {
    // Lockout window after exiting zoom: ignore the touchstart from the same
    // gesture that just exited so we don't immediately re-arm a long-press
    // timer that would re-zoom.
    if (recentlyExitedZoom.current) return;
    longPressFired.current = false;
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    startDrag(clientY);
    longPressTimer.current = setTimeout(() => {
      longPressTimer.current = null;
      longPressFired.current = true;
      setIsZoomed(z => {
        if (z) {
          // Exiting zoom — reset pan/scale
          setZoomScale(1);
          setZoomPan({ x: 0, y: 0 });
        }
        return !z;
      });
      tapHaptic();
      setIsDragging(false);
      dragStartY.current = null;
      setDragOffset(0);
    }, 500);
  }, [startDrag]);

  // Exit zoom mode + reset all zoom state.
  // Also restores the info panels — exiting zoom should always bring the
  // analysis cards back into view, regardless of whether the user had toggled
  // them off before zooming.
  const exitZoom = useCallback(() => {
    setIsZoomed(false);
    setZoomScale(1);
    setZoomPan({ x: 0, y: 0 });
    setInfoVisible(true);
    pinchStartDist.current = null;
    panStart.current = null;
    // Cancel any pending long-press timer that could re-zoom us
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    longPressFired.current = false;
    // Suppress synthesized click + next-touch re-arm for 600ms — long enough
    // to swallow the iOS click-after-touchend (~300ms) and any double-tap.
    recentlyExitedZoom.current = true;
    setTimeout(() => { recentlyExitedZoom.current = false; }, 600);
    tapHaptic();
  }, []);

  // Zoomed touch handlers — pan + pinch (and tap-to-exit)
  const handleZoomTouchStart = useCallback((e) => {
    e.stopPropagation();
    if (e.touches.length === 2) {
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      pinchStartDist.current = Math.hypot(dx, dy);
      pinchStartScale.current = zoomScale;
      panStart.current = null;
      // Pinch is not a tap
      zoomTapCandidate.current = false;
    } else if (e.touches.length === 1) {
      panStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      panStartOffset.current = { ...zoomPan };
      // Single touch starts as a tap candidate; cleared on movement/pinch
      zoomTapCandidate.current = true;
      zoomTapStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
    }
  }, [zoomScale, zoomPan]);

  const handleZoomTouchMove = useCallback((e) => {
    e.stopPropagation();
    if (e.touches.length === 2 && pinchStartDist.current) {
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      const dist = Math.hypot(dx, dy);
      const newScale = Math.min(5, Math.max(1, pinchStartScale.current * (dist / pinchStartDist.current)));
      setZoomScale(newScale);
      zoomTapCandidate.current = false;
    } else if (e.touches.length === 1 && panStart.current) {
      const dx = e.touches[0].clientX - panStart.current.x;
      const dy = e.touches[0].clientY - panStart.current.y;
      setZoomPan({ x: panStartOffset.current.x + dx, y: panStartOffset.current.y + dy });
      // Cancel the tap if the finger has moved beyond the slop radius
      if (zoomTapCandidate.current && Math.hypot(dx, dy) > 8) {
        zoomTapCandidate.current = false;
      }
    }
  }, []);

  const handleZoomTouchEnd = useCallback((e) => {
    e.stopPropagation();
    const wasTap = zoomTapCandidate.current && (Date.now() - zoomTapStart.current.t) < 300;
    if (e.touches.length < 2) pinchStartDist.current = null;
    if (e.touches.length === 0) panStart.current = null;
    // Snap scale back to 1 if pinched below 1
    setZoomScale(s => Math.max(1, s));
    zoomTapCandidate.current = false;
    if (wasTap && e.touches.length === 0) {
      // Single tap on the zoomed hero → exit zoom.  preventDefault on the
      // touchend suppresses the synthesized click that would otherwise fire
      // ~300ms later and run the panel-toggle / re-zoom branches.
      if (e.cancelable) e.preventDefault();
      exitZoom();
    }
  }, [exitZoom]);

  // Touch handlers
  const onTouchStart = useCallback((e) => startDrag(e.touches[0].clientY), [startDrag]);
  const onTouchMove = useCallback((e) => moveDrag(e.touches[0].clientY), [moveDrag]);
  const onTouchEnd = useCallback(() => endDrag(), [endDrag]);

  // Mouse handlers (desktop drag)
  const onMouseDown = useCallback((e) => { e.preventDefault(); startDrag(e.clientY); }, [startDrag]);
  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e) => moveDrag(e.clientY);
    const onUp = () => endDrag();
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isDragging, moveDrag, endDrag]);

  if (!result) return null;

  const { pattern, confidence, meta, mood, sections } = result;
  const raw = result?._raw || {};
  const signalDiag = raw.signal_diagnostics || {};
  const rawSignals = signalDiag.signals || {};
  const hasRawSignals = rawSignals.nose_shadow_angle_deg != null
    || rawSignals.left_right_asymmetry != null
    || rawSignals.shadow_density != null
    || rawSignals.highlight_width_ratio != null;
  const faceCrop = getFaceCropPosition(result?._raw);
  const isHighConf  = confidence >= 70;
  const confColor   = isHighConf ? C.confHigh : C.confLow;
  // Desktop uses a taller hero block so the photo can show its full aspect
  // (object-fit: contain) and a LightingDiagram can sit inline below the CTA.
  const panelTop    = isDesktop ? 920 : (isHighConf ? 497 : 478);
  const leadMargin  = confidence - (sections.patternCandidates[1]?.score ?? 0);
  // Desktop hero position constants — photo + info overlay + CTA + diagram
  // stack further down to give the photo more room.
  const D_PHOTO_TOP    = 100;
  const D_PHOTO_HEIGHT = 420;   // generous portrait-capable box
  const D_INFO_TOP     = 540;   // photo bottom + 20 gap
  const D_CTA_TOP      = 660;   // info (pattern+pills) ~ 80 tall + 40 gap
  const D_DIAGRAM_TOP  = 730;   // CTA (48) + 22 gap

  const toggle = (key) => { setDrawers(prev => ({ ...prev, [key]: !prev[key] })); panelToggleSound(); tapHaptic(); };

  // Summary lines for collapsed rows
  const summaries = {
    patterns: isHighConf
      ? `${pattern} leads by ${leadMargin} pts`
      : `${sections.patternCandidates.length} close matches`,
    shadow:     [(sections.lightQuality ? sections.lightQuality + ' light' : null), (sections.shadowAnalysis || '').split('.')[0]].filter(Boolean).join(' · '),
    catchlight: (sections.catchlightModifier || '').split(',')[0],
    colors: sections.colorPalette
      ? (sections.colorPalette.harmony
          ? `${sections.colorPalette.harmony}${sections.colorPalette.warmCool ? ' · warm/cool split' : ''}`
          : sections.colorPalette.colors.slice(0, 2).join(', '))
      : '',
    scene: sections.vlmNarrative?.fields?.[0]?.value || sections.sceneDescription?.split('.')[0] || '',
    confidence: sections.signalQuality
      ? (sections.signalQuality.available != null
          ? `${sections.signalQuality.available}/${sections.signalQuality.total} signals`
          : sections.confidenceLabel || '')
      : (sections.confidenceLabel || ''),
  };

  // Source + confidence attribution — dim sub-line below pattern/confidence
  const sourceAttribution = (() => {
    const parts = [];
    if (sections.confidenceLabel) parts.push(sections.confidenceLabel);
    if (sections.patternSource)   parts.push(sections.patternSource.toLowerCase());
    return parts.join(' · ');
  })();

  // Warning chip styling now lives in _shared/Chip.jsx.

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: '#000', overflow: 'hidden' }}>
    <div
      onClick={(e) => { if (e.target === e.currentTarget) tapHaptic(); }}
      onTouchStart={(e) => { if (e.target === e.currentTarget) grainHaptic(); }}
      onTouchMove={(e) => { if (e.target === e.currentTarget) grainHaptic(); }}
      style={{
      width: '100%',
      maxWidth: isDesktop ? 1300 : 430,
      height: '100%',
      backgroundColor: C.bg,
      boxShadow: '2px 4px 40px rgba(0,0,0,0.6), -1px -1px 1px rgba(255,255,255,0.02)',
      margin: '0 auto',
      fontFamily: 'Inter, system-ui, sans-serif',
      overflowX: 'hidden',
      overflowY: 'auto',
      position: 'relative',
      paddingBottom: 40,
      // Desktop: two-column grid. Left = hero/pattern/CTA (the 430px instrument
      // column, untouched internally). Right = analytical panel, moved
      // alongside the hero so the screen reads native on wide viewports.
      ...(isDesktop ? {
        display: 'grid',
        gridTemplateColumns: `${heroWidth}px minmax(0, 1fr)`,
        gridTemplateRows: 'auto auto',
        gridTemplateAreas: '"hero panel" "actions panel"',
        columnGap: 36,
        rowGap: 0,
        paddingLeft: 40, paddingRight: 40,
        alignItems: 'start',
        justifyContent: 'center',
      } : null),
    }}>
      {/* ── Matte metal surface — layered ambient wash, vignette, specular edge, grain ── */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 75% 55% at 50% 22%, rgba(120,148,175,0.022) 0%, rgba(95,124,150,0.008) 40%, transparent 72%)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 55% 38% at 50% 58%, rgba(180,150,110,0.008) 0%, transparent 65%)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 118% 88% at 50% 50%, transparent 52%, rgba(0,0,0,0.45) 100%)' }} />
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(141.71deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.018) 40%, transparent 80%)' }} />
        <div style={{ position: 'absolute', inset: 0, opacity: 0.16, mixBlendMode: 'multiply', backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.32' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`, backgroundSize: '128px 128px' }} />
      </div>

      {/* ─── Top section — absolute positioned within fixed-height container ─── */}
      <div style={{
        position: 'relative',
        width: isDesktop ? heroWidth : undefined,
        height: panelTop,
        ...(isDesktop ? { gridArea: 'hero' } : null),
      }}>
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>

        {/* Back nav */}
        <button
          onClick={() => { navSlideSound(); navHaptic(); onRetry(); }}
          style={{
            position: 'absolute', top: 48, left: 8,
            width: 44, height: 44,
            zIndex: 30,
            background: 'none', border: 'none', cursor: 'pointer',
            overflow: 'hidden', WebkitTapHighlightColor: 'transparent',
            display: 'flex', alignItems: 'center',
          }}
        >
          <span style={{
            position: 'absolute', left: 14, top: 8,
            fontSize: 22, fontWeight: 600, color: '#a7adb7', lineHeight: 1,
            WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', textRendering: 'geometricPrecision',
          }}>‹</span>
        </button>

        {/* Hero — user's photo with glass treatment (Figma 1493:5) */}
        {/* Long press = full-screen zoom; in zoom: single-finger pan, two-finger pinch */}
        <div
          onTouchStart={isZoomed ? handleZoomTouchStart : (e) => handleHeroStart(e.touches[0].clientY)}
          onTouchMove={isZoomed ? handleZoomTouchMove : (e) => { moveDrag(e.touches[0].clientY); }}
          onTouchEnd={isZoomed ? handleZoomTouchEnd : () => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; } endDrag(); }}
          onMouseDown={isZoomed ? undefined : (e) => { e.preventDefault(); handleHeroStart(e.clientY); }}
          onClick={() => {
            // Lockout window after exiting zoom — swallow the synthesized
            // click that fires after the tap-to-exit touch sequence so it
            // can't toggle infoVisible or re-arm the long-press timer.
            if (recentlyExitedZoom.current) return;
            if (longPressFired.current) { longPressFired.current = false; return; }
            if (isZoomed) {
              // Single click on zoomed hero (desktop) → exit zoom.  Touch path
              // already handled in handleZoomTouchEnd via zoomTapCandidate.
              exitZoom();
              return;
            }
            if (!isDragging) { setInfoVisible(v => !v); tapHaptic(); }
          }}
          style={{
            position: 'absolute',
            top: isZoomed ? 0 : (isDesktop ? D_PHOTO_TOP : (infoVisible ? 100 : 60)),
            left: isZoomed ? 0 : 25,
            right: isZoomed ? 0 : 25,
            height: isZoomed ? '100dvh' : (isDesktop ? D_PHOTO_HEIGHT : (infoVisible ? 180 : 340)),
            borderRadius: isZoomed ? 0 : 14,
            overflow: 'hidden',
            backgroundColor: '#000',
            // Outer rim bevel — sunken well carved into the matte surface
            boxShadow: isZoomed ? 'none' : '0 -1px 0 rgba(0,0,0,0.5), -1px 0 0 rgba(0,0,0,0.4), 1px 1px 0 rgba(255,255,255,0.05)',
            cursor: isZoomed ? 'grab' : 'pointer',
            WebkitTapHighlightColor: 'transparent',
            transition: isDragging ? 'none' : 'height 0.35s cubic-bezier(0.4, 0, 0.2, 1), top 0.35s cubic-bezier(0.4, 0, 0.2, 1), left 0.35s cubic-bezier(0.4, 0, 0.2, 1), right 0.35s cubic-bezier(0.4, 0, 0.2, 1), border-radius 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
            touchAction: 'none',
            zIndex: isZoomed ? 20 : 1,
          }}
        >
          {imagePreview && (
            <img key={imagePreview} src={imagePreview} alt="Result" style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              // Desktop shows the whole photo (contain) since we have room;
              // mobile stays on the tight face-crop (cover).
              objectFit: isZoomed ? 'contain' : (isDesktop ? 'contain' : 'cover'),
              objectPosition: isZoomed ? '50% 50%' : (isDesktop ? '50% 50%' : faceCrop),
              opacity: infoVisible ? 0.8 : 1,
              transition: isZoomed ? 'none' : 'opacity 0.35s ease',
              animation: isZoomed ? 'none' : 'heroZoomInSlow 1.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards',
              transformOrigin: 'center center',
              transform: isZoomed ? `translate(${zoomPan.x}px, ${zoomPan.y}px) scale(${zoomScale})` : undefined,
              willChange: isZoomed ? 'transform' : undefined,
            }} />
          )}
          {/* Bottom vignette — fades photo into dark bg */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(to bottom, transparent 35%, rgba(9,9,11,0.55) 72%, rgba(9,9,11,0.88) 100%)',
            opacity: infoVisible ? 1 : 0.3,
            transition: 'opacity 0.35s ease',
          }} />
          {/* Glass panel — lens vignette + upper-left key light reflection (matches HomeScreen) */}
          <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: 14, zIndex: 2, pointerEvents: 'none' }}>
            <div style={{ position: 'absolute', inset: 0, background: LENS_VIGNETTE }} />
            <div style={{ position: 'absolute', top: 0, left: 0, right: '5%', bottom: 0, background: GLASS_REFLECTION, opacity: 0.48 }} />
          </div>
          {/* Inner shadow — Figma-exact bevel (matches HomeScreen) */}
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 14,
            pointerEvents: 'none', zIndex: 3,
            boxShadow: VIEWFINDER_INNER_SHADOW,
          }} />
        </div>

        {/* ── Info overlay — drag to dismiss, drag up to restore ── */}
        <div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onMouseDown={onMouseDown}
          style={{
            position: 'absolute', top: isDesktop ? D_INFO_TOP : 290, left: 0, right: 0,
            transform: infoVisible
              ? `translateY(${isDragging ? dragOffset : 0}px)`
              : `translateY(${isDragging ? 120 + dragOffset : 120}px)`,
            opacity: infoVisible
              ? Math.max(0, 1 - dragOffset / 120)
              : Math.min(1, Math.abs(dragOffset) / 80),
            transition: isDragging ? 'none' : 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease',
            pointerEvents: infoVisible ? 'auto' : 'none',
            touchAction: 'none',
          }}
        >
          {/* Pattern name */}
          <p style={{
            position: 'absolute', top: 6, left: 25, margin: 0,
            fontWeight: 800, fontSize: 26, lineHeight: '32px',
            color: C.textPrimary,
            letterSpacing: '-0.3px',
            WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', textRendering: 'geometricPrecision',
            textShadow: '0 0 1px rgba(245,247,250,0.15)',
          }}>{pattern}</p>

          {/* Confidence % */}
          <p style={{
            position: 'absolute', top: 4, right: 25, margin: 0,
            fontWeight: 800, fontSize: 28, lineHeight: '34px',
            color: confColor,
            WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', textRendering: 'geometricPrecision',
            textShadow: `0 0 2px ${confColor}`,
          }}>{confidence}%</p>

          {/* Mood — VLM image_read.mood, italic sub-line below pattern name */}
          {mood ? (
            <p style={{
              position: 'absolute', top: 38, left: 25, margin: 0,
              fontSize: 10, fontWeight: 400, fontStyle: 'italic',
              color: steel(0.45),
              letterSpacing: '0.1px',
              WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', textRendering: 'geometricPrecision',
            }}>{mood}</p>
          ) : null}

          {/* Source attribution — dim sub-line: "strong · reference read" */}
          {sourceAttribution ? (
            <p style={{
              position: 'absolute', top: 38, right: 25, margin: 0,
              fontSize: 10, fontWeight: 500,
              color: steel(0.4),
              letterSpacing: '0.2px',
              WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', textRendering: 'geometricPrecision',
            }}>{sourceAttribution}</p>
          ) : null}

          {/* Meta pills */}
          <div style={{
            position: 'absolute', top: 53, left: 25,
            display: 'flex', flexWrap: 'wrap', gap: 8,
            right: 25,
          }}>
            {meta.map(m => <Pill key={m} label={m} />)}
          </div>
        </div>

        {/* CTA Button — HC only (Figma 1494:12) */}
        <button
          onClick={() => { segmentPressSound(); tapHaptic(); onSetup(); }}
          style={{
            position: 'absolute', top: isDesktop ? D_CTA_TOP : 415, left: 25, right: 25,
            display: isHighConf ? 'flex' : 'none',
            alignItems: 'center', justifyContent: 'center',
            height: 48,
            borderRadius: 24,
            background: CTA_BG,
            boxShadow: `${CTA_SHADOW}, ${CTA_BEVEL}`,
            border: 'none', cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
            overflow: 'hidden',
            opacity: infoVisible ? 1 : 0,
            transform: infoVisible ? 'translateY(0)' : 'translateY(40px)',
            transition: isDragging ? 'none' : 'opacity 0.3s ease, transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
            pointerEvents: infoVisible ? 'auto' : 'none',
          }}
        >
          <span style={{
            fontSize: 13, fontWeight: 600,
            color: 'rgba(245,247,250,0.9)',
            letterSpacing: '0.5px',
            pointerEvents: 'none',
            WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', textRendering: 'geometricPrecision',
          }}>
            Set Up This Light
          </span>
        </button>

        {/* Low confidence: "Set up anyway" — same trough treatment as HC Retake/Save */}
        {!isHighConf && (
          <LCBottomActions
            onRetry={onRetry}
            onSetup={onSetup}
            infoVisible={infoVisible}
            isDragging={isDragging}
            top={415}
          />
        )}

        {/* High confidence: scroll affordance (mobile only — desktop has the
            drawers visible alongside the hero, no scroll cue needed) */}
        {isHighConf && !isDesktop && (
          <div style={{
            position: 'absolute', top: 479, left: '50%', transform: 'translateX(-50%)', width: 100, height: 0,
            opacity: infoVisible ? 1 : 0,
            transition: 'opacity 0.3s ease',
          }}>
            <div style={{ position: 'absolute', top: -1, left: 0, right: 0, bottom: 0 }}>
              <img src={scrollAffordance} alt="" style={{ display: 'block', width: '100%' }} />
            </div>
          </div>
        )}

        {/* Desktop-only: LightingDiagram as an accompanying hero graphic —
            pulled out of the SHADOW drawer so the hero image no longer
            stands alone on wide viewports. */}
        {isDesktop && (
          <div style={{
            position: 'absolute', top: D_DIAGRAM_TOP, left: 25, right: 25,
            opacity: infoVisible ? 1 : 0,
            transition: 'opacity 0.3s ease',
            display: 'flex', justifyContent: 'center',
          }}>
            <LightingDiagram result={result} />
          </div>
        )}
      </div>
      </div>
      {/* ─── end top section ─── */}

      {/* ─── Analytical Panel (pull-tab drawers) ───
          Desktop: the panel column lives in the right grid cell. We cap its
          height to the design viewport (1040) minus top/bottom chrome so
          opened drawers scroll inside the column instead of pushing the CTA
          off-screen. FitToViewport handles the outer uniform scale. */}
      <div style={{
        marginLeft: isDesktop ? 0 : 25,
        marginRight: isDesktop ? 0 : 25,
        marginTop: isDesktop ? 96 : 0,
        maxWidth: isDesktop ? 680 : undefined,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        opacity: infoVisible ? 1 : 0,
        transform: infoVisible ? 'translateY(0)' : 'translateY(60px)',
        transition: isDragging ? 'none' : 'opacity 0.3s ease 0.05s, transform 0.4s cubic-bezier(0.4, 0, 0.2, 1) 0.05s',
        pointerEvents: infoVisible ? 'auto' : 'none',
        ...(isDesktop ? {
          gridArea: 'panel',
          alignSelf: 'start',
          // Hard-capped to fit within the 1040 design viewport:
          //   1040 (designHeight) − 96 (panel marginTop) − 72 (actions row)
          // = 872 of usable height. Drawers scroll within this column so
          // the hero + CTA stay anchored and visible at all times.
          maxHeight: 872,
          overflowY: 'auto',
          paddingRight: 6,
          paddingBottom: 24,
        } : null),
      }}>
        {/* Warning chips — compact strip above drawers */}
        {sections.edgeCaseWarnings?.length > 0 && (
          <div style={{
            padding: '2px 4px',
            display: 'flex', flexWrap: 'wrap', gap: 6,
          }}>
            {sections.edgeCaseWarnings.map((w, i) => (
              <Chip key={i} label={w.label} variant={sevToVariant(w.sev)} size="md" />
            ))}
          </div>
        )}

        {/* PATTERN CANDIDATES */}
        <PullTabDrawer label="PATTERN CANDIDATES" open={!!drawers.patterns} onToggle={() => toggle('patterns')} maxH={600}>
          <PatternBars candidates={sections.patternCandidates} isHighConf={isHighConf} />
        </PullTabDrawer>

        {/* SHADOW ANALYSIS — LightingDiagram moved to the hero column on
            desktop, so this drawer shows a compact ShadowSignature (angle
            dial + density bar) above the narrative so the analysis has a
            visual anchor. Mobile still renders the full LightingDiagram. */}
        <PullTabDrawer label="SHADOW ANALYSIS" open={!!drawers.shadow} onToggle={() => toggle('shadow')} maxH={800}>
          {!isDesktop && <LightingDiagram result={result} />}
          {isDesktop && (
            <ShadowSignature
              angleDeg={rawSignals.nose_shadow_angle_deg}
              density={rawSignals.shadow_density}
            />
          )}
          <p style={{ margin: isDesktop ? 0 : '12px 0 0', fontSize: 13, fontWeight: 400, lineHeight: '19px', color: C.textSub, ...FONT_SMOOTH }}>
            {sections.shadowAnalysis}
          </p>
        </PullTabDrawer>

        {/* SCENE — narrative paragraph + chip-card grid of VLM fields */}
        {(sections.sceneDescription || sections.vlmNarrative) && (
          <PullTabDrawer label="SCENE" open={!!drawers.scene} onToggle={() => toggle('scene')} maxH={800}>
            {sections.sceneDescription && (
              <p style={{ margin: 0, fontSize: 13, fontWeight: 400, lineHeight: '19px', color: C.textSub, ...FONT_SMOOTH }}>
                {sections.sceneDescription}
              </p>
            )}
            {sections.vlmNarrative?.fields?.length > 0 && (
              <div style={{
                marginTop: sections.sceneDescription ? 12 : 0,
                display: 'grid',
                gridTemplateColumns: isDesktop ? '1fr 1fr' : '1fr',
                gap: 8,
              }}>
                {sections.vlmNarrative.fields.map(({ label, value }) => (
                  <SceneField key={label} label={label} value={value} />
                ))}
              </div>
            )}
          </PullTabDrawer>
        )}

        {/* CATCHLIGHT & MODIFIER — silhouette + catchlight eye header row,
            then narrative, then spec grid, then physical-meaning italic. */}
        <PullTabDrawer label="CATCHLIGHT & MODIFIER" open={!!drawers.catchlight} onToggle={() => toggle('catchlight')} maxH={800}>
          {(sections.modifier?.family || rawSignals.nose_shadow_angle_deg != null) && (
            <div style={{
              display: 'flex', gap: 12, alignItems: 'stretch',
              marginBottom: 12,
            }}>
              {sections.modifier?.family && (
                <div style={{
                  flex: '0 0 auto',
                  padding: '8px 10px 6px',
                  borderRadius: 10,
                  backgroundColor: '#070709',
                  boxShadow: 'inset 1px 1px 3px rgba(0,0,0,0.55), inset -0.5px -0.5px 0.5px rgba(255,255,255,0.035)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                }}>
                  <ModifierSilhouette family={sections.modifier.family} />
                  <span style={{ fontSize: 9, fontWeight: 700, color: steel(0.55), letterSpacing: '0.8px', ...FONT_SMOOTH }}>
                    MODIFIER
                  </span>
                </div>
              )}
              <div style={{
                flex: '0 0 auto',
                padding: '8px 10px 6px',
                borderRadius: 10,
                backgroundColor: '#070709',
                boxShadow: 'inset 1px 1px 3px rgba(0,0,0,0.55), inset -0.5px -0.5px 0.5px rgba(255,255,255,0.035)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              }}>
                <CatchlightEye angleDeg={rawSignals.nose_shadow_angle_deg} />
                <span style={{ fontSize: 9, fontWeight: 700, color: steel(0.55), letterSpacing: '0.8px', ...FONT_SMOOTH }}>
                  CATCHLIGHT
                </span>
              </div>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center' }}>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 400, lineHeight: '18px', color: C.textSub, ...FONT_SMOOTH }}>
                  {sections.catchlightModifier}
                </p>
              </div>
            </div>
          )}
          {/* Fallback narrative when neither silhouette nor eye rendered */}
          {!(sections.modifier?.family || rawSignals.nose_shadow_angle_deg != null) && (
            <p style={{ margin: 0, fontSize: 13, fontWeight: 400, lineHeight: '19px', color: C.textSub, ...FONT_SMOOTH }}>
              {sections.catchlightModifier}
            </p>
          )}
          <ModifierDetail modifier={sections.modifier} />
          {sections.modifier?.physicalMeaning && (
            <p style={{ margin: '10px 0 0', fontSize: 12, fontWeight: 400, lineHeight: '17px', color: steel(0.45), fontStyle: 'italic', ...FONT_SMOOTH }}>
              {sections.modifier.physicalMeaning}
            </p>
          )}
        </PullTabDrawer>

        {/* COLOR PALETTE — wider swatches, CCTAxis under, harmony chip,
            then italic character note. */}
        {sections.colorPalette && (
          <PullTabDrawer label="COLOR PALETTE" open={!!drawers.colors} onToggle={() => toggle('colors')} maxH={700}>
            {sections.colorPalette.hexes.length > 0 && (
              <div style={{ display: 'flex', gap: 10, marginBottom: 4 }}>
                {sections.colorPalette.hexes.map((hex, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, flex: 1 }}>
                    <div style={{
                      width: '100%', maxWidth: 56, aspectRatio: '1 / 1', borderRadius: 10,
                      backgroundColor: hex,
                      boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.18), 0 2px 6px rgba(0,0,0,0.5)',
                    }} />
                    {sections.colorPalette.colors[i] && (
                      <span style={{ fontSize: 9, fontWeight: 600, color: steel(0.55), textAlign: 'center', lineHeight: 1.2, letterSpacing: '0.2px', ...FONT_SMOOTH }}>
                        {sections.colorPalette.colors[i]}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
            <CCTAxis keyKStr={sections.colorPalette.cctKey} shadowKStr={sections.colorPalette.cctShadows} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: sections.colorPalette.character ? 8 : 0 }}>
              {sections.colorPalette.harmony && (
                <Chip
                  label={`HARMONY · ${prettify(sections.colorPalette.harmony, { upper: true })}${sections.colorPalette.warmCool ? ' · WARM/COOL' : ''}`}
                  variant="accent"
                  size="sm"
                />
              )}
              {sections.colorPalette.cctKey && (
                <Chip label={`KEY ${prettify(sections.colorPalette.cctKey, { upper: true })}`} variant="warn" size="sm" />
              )}
              {sections.colorPalette.cctShadows && (
                <Chip label={`SHADOW ${prettify(sections.colorPalette.cctShadows, { upper: true })}`} variant="info" size="sm" />
              )}
            </div>
            {sections.colorPalette.character && (
              <p style={{ margin: '4px 0 0', fontSize: 12, fontWeight: 400, lineHeight: '17px', color: steel(0.50), fontStyle: 'italic', ...FONT_SMOOTH }}>
                {sections.colorPalette.character}
              </p>
            )}
          </PullTabDrawer>
        )}

        {/* CONFIDENCE */}
        {sections.signalQuality && (
          <PullTabDrawer label="CONFIDENCE" open={!!drawers.confidence} onToggle={() => toggle('confidence')} maxH={1200}>
            {sections.signalQuality.strength != null && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: steel(0.55), letterSpacing: '0.5px', ...FONT_SMOOTH }}>SIGNAL STRENGTH</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: isHighConf ? C.confHigh : C.confLow, ...FONT_SMOOTH }}>
                    {sections.signalQuality.available != null
                      ? `${sections.signalQuality.available}/${sections.signalQuality.total}`
                      : `${Math.round(sections.signalQuality.strength * 100)}%`}
                  </span>
                </div>
                <div style={{ height: 3, borderRadius: 1.5, backgroundColor: C.barTrack }}>
                  <div style={{
                    height: '100%', borderRadius: 1.5,
                    width: `${Math.round(sections.signalQuality.strength * 100)}%`,
                    backgroundColor: isHighConf ? C.confHighBar : C.confLowBar,
                    transition: 'width 0.4s ease',
                  }} />
                </div>
              </div>
            )}
            {hasRawSignals && (
              <div style={{ marginBottom: 12 }}>
                <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 600, color: steel(0.55), letterSpacing: '0.5px', ...FONT_SMOOTH }}>
                  RAW SIGNALS
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {rawSignals.nose_shadow_angle_deg != null && (
                    <SignalGauge
                      label="NOSE SHADOW"
                      value={rawSignals.nose_shadow_angle_deg}
                      display={`${rawSignals.nose_shadow_angle_deg > 0 ? '+' : ''}${rawSignals.nose_shadow_angle_deg.toFixed(0)}°`}
                      mode="signed"
                    />
                  )}
                  {rawSignals.left_right_asymmetry != null && (
                    <SignalGauge
                      label="L/R ASYMMETRY"
                      value={Math.abs(rawSignals.left_right_asymmetry)}
                      display={`${(rawSignals.left_right_asymmetry * 100).toFixed(1)}%`}
                      mode="pct"
                      accentColor="rgba(130,170,220,0.85)"
                    />
                  )}
                  {rawSignals.shadow_density != null && (
                    <SignalGauge
                      label="SHADOW DENSITY"
                      value={rawSignals.shadow_density}
                      display={`${(rawSignals.shadow_density * 100).toFixed(1)}%`}
                      mode="pct"
                    />
                  )}
                  {rawSignals.highlight_width_ratio != null && (
                    <SignalGauge
                      label="HIGHLIGHT WIDTH"
                      value={rawSignals.highlight_width_ratio}
                      display={`${(rawSignals.highlight_width_ratio * 100).toFixed(0)}%`}
                      mode="pct"
                      accentColor="rgba(140,225,180,0.85)"
                    />
                  )}
                </div>
                {signalDiag.final_pattern && (
                  <div style={{ marginTop: 10 }}>
                    <Chip
                      label={`PATTERN · ${prettify(signalDiag.final_pattern, { upper: true })}`}
                      variant="accent"
                      size="sm"
                    />
                  </div>
                )}
              </div>
            )}
            {sections.signalQuality.passSummaries && Object.keys(sections.signalQuality.passSummaries).length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 600, color: steel(0.55), letterSpacing: '0.5px', ...FONT_SMOOTH }}>
                  PASS RELIABILITY
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {Object.entries(sections.signalQuality.passSummaries).map(([pass, level]) => {
                    const variant = level === 'high' ? 'success' : level === 'moderate' ? 'info' : 'warn';
                    const passLabel = prettify(pass.replace(/_pass$/, ''), { upper: true });
                    return (
                      <Chip
                        key={pass}
                        label={`${passLabel} · ${String(level).toUpperCase()}`}
                        variant={variant}
                        size="sm"
                      />
                    );
                  })}
                </div>
              </div>
            )}
            {sections.signalQuality.supporting.length > 0 && (
              <div style={{ marginBottom: sections.signalQuality.contradicting.length > 0 ? 10 : 0 }}>
                <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 600, color: C.confHigh, letterSpacing: '0.5px', ...FONT_SMOOTH }}>
                  SUPPORTING
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {sections.signalQuality.supporting.map((s, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
                      <div style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: C.confHigh, marginTop: 6, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontWeight: 400, color: C.textSub, lineHeight: 1.4, ...FONT_SMOOTH }}>{s}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {sections.signalQuality.contradicting.length > 0 && (
              <div>
                <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 600, color: C.confLow, letterSpacing: '0.5px', ...FONT_SMOOTH }}>
                  CONTRADICTING
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {sections.signalQuality.contradicting.map((s, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 7 }}>
                      <div style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: C.confLow, marginTop: 6, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontWeight: 400, color: C.textSub, lineHeight: 1.4, ...FONT_SMOOTH }}>{s}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {sections.signalQuality.reasoning && (
              <p style={{ margin: '10px 0 0', fontSize: 12, fontWeight: 400, lineHeight: '17px', color: steel(0.45), fontStyle: 'italic', ...FONT_SMOOTH }}>
                {sections.signalQuality.reasoning}
              </p>
            )}
          </PullTabDrawer>
        )}
      </div>

      {/* ─── Bottom row: Retake | Save (high confidence only) ─── */}
      {isHighConf && (
        <div style={isDesktop ? { gridArea: 'actions' } : undefined}>
          <BottomActions onRetry={onRetry} onSetup={onSetup} infoVisible={infoVisible} isDragging={isDragging} />
        </div>
      )}

      {/* ─── Low confidence: spacer ─── */}
      {!isHighConf && <div style={{ height: 40, ...(isDesktop ? { gridArea: 'actions' } : null) }} />}

      {/* ─── Home Indicator — pinned to viewport bottom ─── */}
      <div style={{
        position: 'fixed', bottom: 8, left: '50%', transform: 'translateX(-50%)',
        width: 134, height: 5, borderRadius: 3,
        backgroundColor: 'rgba(89,94,107,0.55)',
        boxShadow: [
          'inset 0px 1px 1px 0px rgba(255,255,255,0.12)',
          'inset 0px -0.5px 0.5px 0px rgba(0,0,0,0.2)',
          '0px 0.5px 0px 0px rgba(255,255,255,0.03)',
          '0px -0.5px 1px 0px rgba(0,0,0,0.25)',
        ].join(', '),
        zIndex: 50,
      }} />

    </div>
    </div>
  );
}
