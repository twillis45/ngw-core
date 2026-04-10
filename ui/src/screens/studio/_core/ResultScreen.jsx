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
import { createPortal } from 'react-dom';
import { tapHaptic, selectHaptic, successHaptic, navHaptic, grainHaptic } from '../../../utils/haptics';
import { getFaceCropPosition } from '../../../utils/faceCrop';
import { useIsDesktop } from '../../../utils/useIsDesktop';
import { resultRevealSound, panelToggleSound, segmentPressSound, navSlideSound, softClickSound } from '../../../utils/sounds';
import scrollAffordance from '../../../assets/day1/scroll-affordance.svg';
import { steel, C, FONT_SMOOTH, VIEWFINDER_INNER_SHADOW, GLASS_REFLECTION, LENS_VIGNETTE,
         CTA_BG, CTA_SHADOW, CTA_BEVEL, PANEL_SHADOW, PANEL_BEVEL,
         TEXT_SHADOW_ENGRAVED,
         READOUT_FG, READOUT_GLOW, READOUT_LABEL,
         BTN_RAISED_UP, BTN_RAISED_DOWN, BTN_RECESSED_UP, BTN_RECESSED_DOWN } from '../../../theme/studioMatte';
import LightingDiagram from './components/LightingDiagram';
import Chip, { sevToVariant } from '../_shared/Chip';
import PullTabDrawer from '../_shared/PullTabDrawer';
import ModifierSilhouette from '../_shared/ModifierSilhouette';

// Pill inset shadow — exact from Figma pill nodes
const PILL_SHADOW = 'inset 1px 1px 2px 0px rgba(0,0,0,0.2), inset 1px 2px 4px 0px rgba(0,0,0,0.4)';

// Display-string normalizer. Engine keys like "soft_key_dominant" or
// "split-complementary" must never leak into the UI as-is — Studio Matte
// rules forbid underscores/hyphens in visible text. `prettify` swaps them
// for spaces and (optionally) uppercases the result so chip pills, labels,
// and headings read as clean caps display copy.
function prettify(str, { upper = false, title = false } = {}) {
  if (str == null) return '';
  const cleaned = String(str).replace(/[_-]+/g, ' ').trim();
  if (upper) return cleaned.toUpperCase();
  if (title) {
    // Sentence-style title case: capitalize the first letter of every word
    // unless it's a small connector (a, an, the, of, in, with, on, to, by,
    // and, but, or, for).  Words already SCREAMING (e.g. "RGB", "VLM") are
    // left untouched so abbreviations don't get watered down.
    const SMALLS = new Set(['a','an','the','of','in','with','on','to','by','and','but','or','for','from','at','as']);
    return cleaned.split(/\s+/).map((w, i) => {
      if (i > 0 && SMALLS.has(w.toLowerCase())) return w.toLowerCase();
      if (/^[A-Z0-9]{2,}$/.test(w)) return w; // keep abbreviations
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    }).join(' ');
  }
  return cleaned;
}

// ─── SubLabel ───────────────────────────────────────────────────────────────
// 9px engraved uppercase label used to demarcate sub-sections inside a pull-
// out drawer. Sits flush-left with a hairline of letter-spacing so multiple
// blocks of content (signal · components · direction · read) read as
// discrete groups instead of a soup of widgets stacked together.
function SubLabel({ children }) {
  return (
    <p style={{
      margin: '14px 0 6px',
      fontSize: 9, fontWeight: 700,
      color: 'rgba(132, 158, 184,0.55)',
      letterSpacing: '1.4px',
      textTransform: 'uppercase',
      ...FONT_SMOOTH,
    }}>
      {children}
    </p>
  );
}

// ─── BlownHighlightsCanvas ──────────────────────────────────────────────────
// Client-side luminance scanner. When the Blown Highlights chip is tapped,
// this canvas overlays the hero photo and tints any pixel whose RGB exceeds
// the clipping threshold so the user can see exactly WHERE the engine flagged
// the blown regions. No engine roundtrip required — the analysis runs on the
// already-loaded image bitmap. We sample at quarter resolution for speed and
// render two passes: a hot red core for fully-clipped pixels and a softer
// orange wash for near-clipped (warning) pixels. The canvas mirrors the same
// objectFit / objectPosition the hero <img> uses so the overlay tracks the
// visible photo area exactly.
function BlownHighlightsCanvas({ src, objectFit, objectPosition }) {
  const canvasRef = useRef(null);
  const [stats, setStats] = useState(null); // { clippedPct, warnPct } | null

  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      const cvs = canvasRef.current;
      if (!cvs) return;
      const rect = cvs.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cvs.width  = Math.max(1, Math.floor(rect.width  * dpr));
      cvs.height = Math.max(1, Math.floor(rect.height * dpr));
      const ctx = cvs.getContext('2d');
      ctx.scale(dpr, dpr);
      // Mirror objectFit math: object-fit:contain → letterbox; cover → crop.
      const cw = rect.width, ch = rect.height;
      const ir = img.naturalWidth / img.naturalHeight;
      const cr = cw / ch;
      let dx, dy, dw, dh;
      if (objectFit === 'contain') {
        if (ir > cr) { dw = cw; dh = cw / ir; dx = 0; dy = (ch - dh) / 2; }
        else         { dh = ch; dw = ch * ir; dx = (cw - dw) / 2; dy = 0; }
      } else { // cover
        if (ir > cr) { dh = ch; dw = ch * ir; dx = (cw - dw) / 2; dy = 0; }
        else         { dw = cw; dh = cw / ir; dx = 0; dy = (ch - dh) / 2; }
        // Honor objectPosition string like "50% 30%" for cover mode.
        if (typeof objectPosition === 'string') {
          const m = objectPosition.match(/(-?\d+(?:\.\d+)?)%\s+(-?\d+(?:\.\d+)?)%/);
          if (m) {
            const px = parseFloat(m[1]) / 100;
            const py = parseFloat(m[2]) / 100;
            dx = (cw - dw) * px;
            dy = (ch - dh) * py;
          }
        }
      }
      ctx.drawImage(img, dx, dy, dw, dh);
      // Read back, threshold, paint highlight tint.
      try {
        const data = ctx.getImageData(0, 0, Math.floor(cw), Math.floor(ch));
        const px = data.data;
        let clipped = 0, warn = 0, total = 0;
        const HOT  = [255, 64, 64, 200];
        const WARN = [255, 180, 60, 130];
        for (let i = 0; i < px.length; i += 4) {
          const r = px[i], g = px[i+1], b = px[i+2], a = px[i+3];
          if (a < 8) continue;
          total++;
          const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          if (r >= 252 && g >= 252 && b >= 252) {
            px[i]=HOT[0]; px[i+1]=HOT[1]; px[i+2]=HOT[2]; px[i+3]=HOT[3];
            clipped++;
          } else if (lum >= 240) {
            px[i]=WARN[0]; px[i+1]=WARN[1]; px[i+2]=WARN[2]; px[i+3]=WARN[3];
            warn++;
          } else {
            px[i+3] = 0;
          }
        }
        ctx.putImageData(data, 0, 0);
        setStats({
          clippedPct: total ? (clipped / total) * 100 : 0,
          warnPct:    total ? (warn    / total) * 100 : 0,
        });
      } catch (e) {
        // Likely a tainted canvas (CORS) — give a soft fallback message.
        console.warn('BlownHighlightsCanvas: unable to read pixels', e);
        setStats({ error: true });
      }
    };
    img.src = src;
    return () => { cancelled = true; };
  }, [src, objectFit, objectPosition]);

  return (
    <div style={{
      position: 'absolute', inset: 0, pointerEvents: 'none',
      mixBlendMode: 'screen',
    }}>
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />
      {stats && !stats.error && (
        <div style={{
          position: 'absolute', top: 10, left: 10,
          padding: '6px 10px', borderRadius: 8,
          backgroundColor: 'rgba(8,9,12,0.78)',
          boxShadow: '0 1px 2px rgba(0,0,0,0.5), inset 0 0 0 0.5px rgba(255,255,255,0.06)',
          fontSize: 10, fontWeight: 700,
          color: 'rgba(245,180,90,0.95)',
          letterSpacing: '0.6px',
          mixBlendMode: 'normal',
          ...FONT_SMOOTH,
        }}>
          {stats.clippedPct.toFixed(1)}% CLIPPED · {stats.warnPct.toFixed(1)}% NEAR
        </div>
      )}
    </div>
  );
}

// PullTabDrawer is now imported from `_shared/PullTabDrawer` so any future
// styling tweak (handle, glow, animation) lands in both ResultScreen and
// SetupScreen at the same time.

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
  const [zoomed, setZoomed] = useState(false);
  if (angleDeg == null && density == null) return null;

  // Engine convention: 0°=up, 90°=right, 180°=straight down, 270°=left.
  // The dial reads as a "how far does the shadow swing from straight down"
  // bias, so we subtract 180° to re-center on down, then normalize into
  // (-180, 180] and clamp to the visible ±60° sweep.
  let bias = null;
  if (angleDeg != null) {
    let b = angleDeg - 180;
    if (b > 180) b -= 360;
    if (b < -180) b += 360;
    bias = Math.max(-60, Math.min(60, b));
  }
  const rad = bias != null ? (bias * Math.PI) / 180 : 0;
  // Needle tail pivots at (50, 14) — just above face/nose — and extends 46px
  // down and sideways. Positive bias → needle swings right (shadow leans to
  // subject's right → key light from subject's upper-left).
  const needleX = 50 + 46 * Math.sin(rad);
  const needleY = 14 + 46 * Math.cos(rad);

  return (
    <div style={{
      display: 'flex', gap: 10, marginBottom: 14, alignItems: 'stretch',
    }}>
      {/* Angle dial card — click anywhere on the well to zoom into a
          fullscreen overlay (portaled to document.body so it escapes
          FitToViewport's transform ancestor on desktop). */}
      {angleDeg != null && (
        <div
          onClick={() => { tapHaptic(); setZoomed(true); }}
          title="Tap to zoom"
          style={{
            flex: '0 0 auto', width: 140,
            padding: '10px 10px 8px',
            borderRadius: 10,
            backgroundColor: '#070709',
            boxShadow: 'inset 1px 1px 3px rgba(0,0,0,0.55), inset -0.5px -0.5px 0.5px rgba(255,255,255,0.035)',
            cursor: 'zoom-in',
          }}
        >
          <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: READOUT_LABEL, letterSpacing: '0.9px', ...FONT_SMOOTH }}>
            NOSE SHADOW
          </p>
          <svg viewBox="0 0 100 72" width="120" height="86" style={{ display: 'block', margin: '2px auto 0' }}>
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
          <p style={{
            margin: '2px 0 0',
            fontSize: 18,
            fontWeight: 800,
            color: READOUT_FG,
            textAlign: 'center',
            letterSpacing: '0.4px',
            textShadow: READOUT_GLOW,
            ...FONT_SMOOTH,
          }}>
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
            <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: READOUT_LABEL, letterSpacing: '0.9px', ...FONT_SMOOTH }}>
              SHADOW DENSITY
            </p>
            <p style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 800,
              color: READOUT_FG,
              letterSpacing: '0.4px',
              textShadow: READOUT_GLOW,
              ...FONT_SMOOTH,
            }}>
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
            <span style={{ fontSize: 8, fontWeight: 600, color: steel(0.58), letterSpacing: '0.5px', ...FONT_SMOOTH }}>OPEN</span>
            <span style={{ fontSize: 8, fontWeight: 600, color: steel(0.58), letterSpacing: '0.5px', ...FONT_SMOOTH }}>DEEP</span>
          </div>
        </div>
      )}

      {/* Fullscreen NOSE SHADOW overlay — portaled to document.body so it
          escapes FitToViewport's transform ancestor on desktop. The dial
          here is rendered at viewport scale so the angle reads at a glance
          and the numeric label is enormous. */}
      {zoomed && angleDeg != null && createPortal(
        <div
          onClick={() => setZoomed(false)}
          style={{
            position: 'fixed', inset: 0,
            backgroundColor: 'rgba(0,0,0,0.92)',
            zIndex: 99,
            cursor: 'zoom-out',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
        >
          <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: steel(0.55), letterSpacing: '1.4px', ...FONT_SMOOTH }}>
            NOSE SHADOW ANGLE
          </p>
          <svg viewBox="0 0 100 72" width="min(80vw, 540px)" height="min(60vh, 380px)" style={{ display: 'block', margin: '12px auto' }}>
            {/* arc */}
            <path
              d={`M ${50 - 50 * Math.sin(Math.PI / 3)} ${14 + 50 * Math.cos(Math.PI / 3)} A 50 50 0 0 1 ${50 + 50 * Math.sin(Math.PI / 3)} ${14 + 50 * Math.cos(Math.PI / 3)}`}
              fill="none" stroke="rgba(184,191,199,0.22)" strokeWidth="0.8"
            />
            {/* ticks */}
            {[-60, -30, 0, 30, 60].map((deg) => {
              const r = (deg * Math.PI) / 180;
              const x1 = 50 + 44 * Math.sin(r);
              const y1 = 14 + 44 * Math.cos(r);
              const x2 = 50 + 50 * Math.sin(r);
              const y2 = 14 + 50 * Math.cos(r);
              return (
                <g key={deg}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(184,191,199,0.5)" strokeWidth="0.8" />
                  <text x={50 + 56 * Math.sin(r)} y={14 + 56 * Math.cos(r) + 2} textAnchor="middle"
                    fontSize="4.2" fill="rgba(184,191,199,0.65)" fontFamily="Inter, system-ui, sans-serif">
                    {deg > 0 ? `+${deg}°` : `${deg}°`}
                  </text>
                </g>
              );
            })}
            {/* pivot */}
            <circle cx={50} cy={14} r={2.6} fill="rgba(184,191,199,0.7)" />
            {/* needle */}
            <line x1={50} y1={14} x2={needleX} y2={needleY}
              stroke="rgba(245,190,72,1)" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx={needleX} cy={needleY} r={2.4} fill="rgba(245,190,72,1)" />
          </svg>
          <p style={{
            margin: '8px 0 0',
            fontSize: 56,
            fontWeight: 800,
            color: 'rgba(245,210,140,0.95)',
            letterSpacing: '1px',
            textShadow: '0 1px 0 rgba(0,0,0,0.7)',
            ...FONT_SMOOTH,
          }}>
            {angleDeg > 0 ? '+' : ''}{angleDeg.toFixed(0)}°
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 11, color: steel(0.55), letterSpacing: '0.8px', ...FONT_SMOOTH }}>
            TAP TO CLOSE
          </p>
        </div>,
        document.body
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
        {prettify(value, { title: true })}
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

// ModifierSilhouette is now imported from `_shared/ModifierSilhouette`. The
// shared component supports an optional `dimensions` engraving so the
// silhouette doubles as the size readout — used by both Result + Setup.


// ─── CatchlightEye ──────────────────────────────────────────────────────────
// Stylized eye outline with one or more catchlight dots positioned at clock
// hours.  Accepts either `clockHours` (array of clock-hour strings/ints — one
// per detected catchlight, used when the engine reports multi-light setups)
// OR a single `clockHour` for backward-compat, OR falls back to mapping the
// nose-shadow angle.  Clock convention is from the VIEWER's perspective:
// 12=top, 3=right (subject's LEFT cheek), 6=bottom, 9=left (subject's RIGHT).
function parseClockHour(str) {
  if (str == null) return null;
  if (typeof str === 'number') {
    if (isNaN(str) || str < 1 || str > 12) return null;
    return Math.round(str);
  }
  const m = String(str).match(/(\d+)\s*o.?clock/i);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  if (isNaN(h) || h < 1 || h > 12) return null;
  return h;
}
function CatchlightEye({ clockHour, clockHours, angleDeg }) {
  // Resolve the dot-list:  clockHours[] → array, else clockHour → [hour], else
  // angleDeg fallback → synthetic single entry.
  let hours = null;
  if (Array.isArray(clockHours) && clockHours.length > 0) {
    hours = clockHours.map(parseClockHour).filter(h => h != null);
  } else if (clockHour != null) {
    const h = parseClockHour(clockHour);
    if (h != null) hours = [h];
  }

  // Deduplicate and count so repeated positions read as a brighter/larger dot.
  const counts = new Map();
  if (hours && hours.length > 0) {
    for (const h of hours) counts.set(h, (counts.get(h) || 0) + 1);
  }

  // Angle fallback — only when we have no clock data at all.
  let fallbackPos = null;
  if ((!hours || hours.length === 0) && angleDeg != null) {
    const clamped = Math.max(-60, Math.min(60, angleDeg));
    const clockDeg = -clamped;
    fallbackPos = {
      cx: 50 + 18 * Math.sin((clockDeg * Math.PI) / 180),
      cy: 44 - 14 * Math.cos((clockDeg * Math.PI) / 180),
    };
  }

  const stroke = steel(0.58);
  const maxCount = Math.max(1, ...Array.from(counts.values()));

  // Resolve a primary hour for the readout label so the user sees the
  // engine's clock position spelled out (e.g. "10 o'clock") in addition to
  // the dot. The most-frequent hour wins; ties prefer the smaller hour so
  // the readout is deterministic.
  let primaryHour = null;
  if (counts.size > 0) {
    let bestN = -1;
    for (const [h, n] of counts.entries()) {
      if (n > bestN) { bestN = n; primaryHour = h; }
    }
  }

  // Tick mark geometry — 12 spokes around the iris ring so the clock face
  // is implied without overpowering the catchlight dots.  The hour-marks at
  // 12 / 3 / 6 / 9 are drawn slightly longer.
  const ticks = Array.from({ length: 12 }, (_, i) => {
    const deg = i * 30;
    const r = (deg * Math.PI) / 180;
    const inner = (i % 3 === 0) ? 22 : 22.5;
    const outer = (i % 3 === 0) ? 26 : 24.5;
    return {
      hour: i === 0 ? 12 : i,
      x1: 50 + inner * Math.sin(r),
      y1: 44 - inner * Math.cos(r),
      x2: 50 + outer * Math.sin(r),
      y2: 44 - outer * Math.cos(r),
    };
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
      <svg viewBox="0 0 100 100" width="92" height="92" style={{ display: 'block' }}>
        {/* almond eye shape */}
        <path d="M12 44 Q50 12 88 44 Q50 76 12 44 Z" fill="rgba(184,191,199,0.06)" stroke={stroke} strokeWidth={1.3} />
        {/* clock-face tick ring around the iris — engraved guide so the
            user reads the dot position as a clock hour, not a free angle. */}
        {ticks.map((t) => (
          <line
            key={t.hour}
            x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
            stroke={stroke}
            strokeWidth={t.hour % 3 === 0 ? 1.1 : 0.6}
            opacity={t.hour % 3 === 0 ? 0.85 : 0.5}
            strokeLinecap="round"
          />
        ))}
        {/* iris */}
        <circle cx={50} cy={44} r={20} fill="rgba(60,70,85,0.55)" stroke={stroke} strokeWidth={1} />
        {/* pupil */}
        <circle cx={50} cy={44} r={8} fill="#05060a" />
        {/* Multi-dot catchlights — one per reported clock hour.  Dots on the
            same clock position stack into a single brighter dot whose radius
            grows with the count, so repeated hits read as "strongest light". */}
        {Array.from(counts.entries()).map(([h, n]) => {
          const clockDeg = (h % 12) * 30;
          const cx = 50 + 16 * Math.sin((clockDeg * Math.PI) / 180);
          const cy = 44 - 16 * Math.cos((clockDeg * Math.PI) / 180);
          const r = 3.4 + 1.5 * (n / maxCount);
          const alpha = 0.6 + 0.4 * (n / maxCount);
          const isPrimary = h === primaryHour;
          return (
            <g key={`${h}-${n}`}>
              {/* outer halo — bigger + warmer for the primary dot */}
              <circle cx={cx} cy={cy} r={r + (isPrimary ? 4 : 2)}
                fill={isPrimary ? 'rgba(255,210,140,0.18)' : 'rgba(255,255,255,0.10)'} />
              <circle cx={cx} cy={cy} r={r + (isPrimary ? 2 : 1)}
                fill={isPrimary ? 'rgba(255,225,170,0.32)' : 'rgba(255,255,255,0.18)'} />
              <circle cx={cx} cy={cy} r={r} fill={`rgba(255,255,255,${alpha})`} />
              <circle cx={cx - 0.9} cy={cy - 0.9} r={Math.max(0.8, r * 0.4)} fill="#ffffff" />
            </g>
          );
        })}
        {/* Fallback single dot from nose-shadow angle */}
        {fallbackPos && (
          <>
            <circle cx={fallbackPos.cx} cy={fallbackPos.cy} r={6.5} fill="rgba(255,210,140,0.18)" />
            <circle cx={fallbackPos.cx} cy={fallbackPos.cy} r={4.5} fill="rgba(255,255,255,0.92)" />
            <circle cx={fallbackPos.cx - 1.2} cy={fallbackPos.cy - 1.2} r={1.8} fill="#ffffff" />
          </>
        )}
        {/* subtle upper lash line */}
        <path d="M14 42 Q50 16 86 42" fill="none" stroke={stroke} strokeWidth={0.6} opacity={0.5} />
      </svg>
      {/* Position readout — explicit "10 O'CLOCK" label so the dot's clock
          hour is spelled out in copy as well as plotted in the eye. */}
      {primaryHour != null && (
        <span style={{
          fontSize: 9, fontWeight: 700,
          color: 'rgba(245,210,140,0.92)',
          letterSpacing: '1px',
          ...FONT_SMOOTH,
        }}>
          {primaryHour} O&apos;CLOCK
        </span>
      )}
    </div>
  );
}

// ─── LightComponentChips ────────────────────────────────────────────────────
// Key / Fill / Rim / Source quality presented as a tactile 3-4 cell strip
// so the components — which previously lived as raw "subtle fill. subtle rim
// light." prose inside the shadow narrative — get a proper visual anchor.
// Each cell shows a colored dot whose opacity encodes presence strength.
function LightComponentChips({ components }) {
  if (!components) return null;
  const { source, fill, rim } = components;
  if (!source && !fill && !rim) return null;

  const strengthAlpha = (s) => {
    const v = String(s || '').toLowerCase();
    if (v === 'strong' || v === 'heavy' || v === 'dominant') return 0.95;
    if (v === 'moderate' || v === 'medium') return 0.75;
    if (v === 'subtle' || v === 'soft' || v === 'light') return 0.5;
    return 0.8;
  };

  // Match the diagram's presence gate (LightingDiagram presenceAlpha):
  // subtle/soft/none/unknown are NOT plotted as fill/rim markers, so they
  // shouldn't show up as cells here either — otherwise the panel claims
  // contributors the diagram silently dropped.
  const qualifies = (p) => {
    const v = String(p || '').toLowerCase();
    if (!v || v === 'none' || v === 'unknown' || v === 'subtle' || v === 'soft' || v === 'light') return false;
    return true;
  };
  const fillQualifies = qualifies(fill);
  const rimQualifies  = qualifies(rim);
  // If neither secondary contributor qualifies, suppress the entire row —
  // SOURCE alone (always "key") is redundant with the rest of the panel.
  if (!fillQualifies && !rimQualifies) return null;

  const Cell = ({ label, value, color }) => (
    <div style={{
      flex: 1, minWidth: 0,
      padding: '8px 10px',
      borderRadius: 10,
      backgroundColor: '#070709',
      boxShadow: 'inset 1px 1px 3px rgba(0,0,0,0.55), inset -0.5px -0.5px 0.5px rgba(255,255,255,0.035)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{
          width: 6, height: 6, borderRadius: 3,
          backgroundColor: color,
          boxShadow: `0 0 5px ${color}`,
          flexShrink: 0,
        }} />
        <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: steel(0.58), letterSpacing: '0.9px', ...FONT_SMOOTH }}>
          {label}
        </p>
      </div>
      <p style={{ margin: '4px 0 0', fontSize: 12, fontWeight: 700, color: C.textSubBold, textTransform: 'capitalize', lineHeight: 1.2, ...FONT_SMOOTH }}>
        {value || '—'}
      </p>
    </div>
  );

  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
      {source && (
        <Cell label="SOURCE" value={source} color={`rgba(245,190,72,${strengthAlpha(source)})`} />
      )}
      <Cell label="FILL" value={fill || 'None'} color={`rgba(130,170,220,${fill ? strengthAlpha(fill) : 0.2})`} />
      <Cell label="RIM" value={rim || 'None'} color={`rgba(200,160,240,${rim ? strengthAlpha(rim) : 0.2})`} />
    </div>
  );
}

// ─── DirectionalCompass ─────────────────────────────────────────────────────
// Pull "Shadow falls upper_left → key light at upper_right (0.90)" out of the
// narrative and render it as a 3×3 compass grid with glowing cells for the
// key-light quadrant and the shadow quadrant.  The intensity number renders
// as a sub-line below the grid so the directional relationship is instantly
// readable without parsing prose.
function DirectionalCompass({ direction }) {
  if (!direction) return null;
  const { shadowQuadrant, keyQuadrant, keyIntensity } = direction;
  if (!shadowQuadrant && !keyQuadrant) return null;

  // Map a quadrant label ("upper left", "right", etc.) onto a 3×3 grid index.
  const quadToCell = (q) => {
    if (!q) return null;
    const s = String(q).toLowerCase();
    const row = s.includes('upper') || s.includes('top') || s.includes('above') ? 0
              : s.includes('lower') || s.includes('bottom') || s.includes('below') ? 2
              : 1;
    const col = s.includes('left') ? 0
              : s.includes('right') ? 2
              : 1;
    return row * 3 + col;
  };

  const keyCell    = quadToCell(keyQuadrant);
  const shadowCell = quadToCell(shadowQuadrant);

  const cells = Array.from({ length: 9 }, (_, i) => {
    const isKey    = i === keyCell;
    const isShadow = i === shadowCell;
    return (
      <div key={i} style={{
        aspectRatio: '1 / 1',
        borderRadius: 4,
        backgroundColor: isKey
          ? 'rgba(245,190,72,0.85)'
          : isShadow
            ? 'rgba(60,70,85,0.85)'
            : 'rgba(255,255,255,0.03)',
        boxShadow: isKey
          ? '0 0 8px rgba(245,190,72,0.55), inset 0 1px 0 rgba(255,255,255,0.25)'
          : isShadow
            ? 'inset 0 1px 2px rgba(0,0,0,0.7)'
            : 'inset 0 0.5px 1px rgba(0,0,0,0.4)',
      }} />
    );
  });

  const title = (s) => String(s || '').replace(/\b\w/g, c => c.toUpperCase());

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '10px 12px',
      borderRadius: 10,
      backgroundColor: '#070709',
      boxShadow: 'inset 1px 1px 3px rgba(0,0,0,0.55), inset -0.5px -0.5px 0.5px rgba(255,255,255,0.035)',
      marginBottom: 12,
    }}>
      <div style={{
        width: 62, height: 62,
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
        gap: 3, flexShrink: 0,
      }}>
        {cells}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: steel(0.58), letterSpacing: '0.9px', ...FONT_SMOOTH }}>
          LIGHT DIRECTION
        </p>
        {keyQuadrant && (
          <p style={{ margin: '4px 0 0', fontSize: 12, fontWeight: 600, color: C.textSubBold, lineHeight: 1.3, ...FONT_SMOOTH }}>
            <span style={{ color: 'rgba(245,190,72,0.95)' }}>Key</span> {title(keyQuadrant)}
            {keyIntensity != null && (
              <span style={{ color: steel(0.62), fontWeight: 500 }}> · {(keyIntensity * 100).toFixed(0)}%</span>
            )}
          </p>
        )}
        {shadowQuadrant && (
          <p style={{ margin: '2px 0 0', fontSize: 11, fontWeight: 500, color: steel(0.62), lineHeight: 1.3, ...FONT_SMOOTH }}>
            Shadow falls {title(shadowQuadrant)}
          </p>
        )}
      </div>
    </div>
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
        <span style={{ fontSize: 9, fontWeight: 600, color: steel(0.58), letterSpacing: '0.3px', ...FONT_SMOOTH }}>
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
        {/* Key marker with Kelvin label above */}
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
            <span style={{
              position: 'absolute', top: -13, fontSize: 9, fontWeight: 700,
              color: 'rgba(245,190,72,0.95)', letterSpacing: '0.2px',
              textShadow: '0 0 4px rgba(0,0,0,0.8)',
              whiteSpace: 'nowrap', ...FONT_SMOOTH,
            }}>{keyK}K</span>
          </div>
        )}
        {/* Shadow marker with Kelvin label below */}
        {shadowK != null && (
          <div style={{
            position: 'absolute', top: 4, left: pct(shadowK), transform: 'translateX(-50%)',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
          }}>
            <div style={{
              width: 7, height: 14, borderRadius: 2,
              backgroundColor: 'rgba(168,200,240,0.9)',
              boxShadow: '0 0 4px rgba(168,200,240,0.55), inset 0 1px 0 rgba(255,255,255,0.5), inset 0 -1px 1px rgba(0,0,0,0.4)',
            }} />
            <span style={{
              position: 'absolute', top: 15, fontSize: 9, fontWeight: 700,
              color: 'rgba(168,200,240,0.95)', letterSpacing: '0.2px',
              textShadow: '0 0 4px rgba(0,0,0,0.8)',
              whiteSpace: 'nowrap', ...FONT_SMOOTH,
            }}>{shadowK}K</span>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        <span style={{ fontSize: 8, fontWeight: 600, color: steel(0.58), letterSpacing: '0.4px', ...FONT_SMOOTH }}>2500K · TUNGSTEN</span>
        <span style={{ fontSize: 8, fontWeight: 600, color: steel(0.58), letterSpacing: '0.4px', ...FONT_SMOOTH }}>5500K · DAYLIGHT</span>
        <span style={{ fontSize: 8, fontWeight: 600, color: steel(0.58), letterSpacing: '0.4px', ...FONT_SMOOTH }}>8500K · SHADE</span>
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

// ─── Pattern definitions + face silhouettes ─────────────────────────────────
// One-line shadow definitions for each canonical portrait pattern.  These are
// pure presentation (no engine plumbing required) so the pattern candidate
// rows give the user the *what* alongside the score.
const PATTERN_DEFINITIONS = {
  loop:       'Small triangular shadow off the nose, just touching the cheek.',
  rembrandt:  'Triangle of light on the shadow-side cheek, isolated under the eye.',
  butterfly:  'Symmetric shadow under the nose — light dead-center, slightly above.',
  paramount:  'Symmetric shadow under the nose — light dead-center, slightly above.',
  split:      'Vertical hard split — half the face fully lit, half in shadow.',
  broad:      'Lit side of the face is the side turned toward camera.',
  short:      'Lit side of the face is the side turned away from camera.',
  rim:        'Backlight wraps the contour, separating subject from background.',
  flat:       'Even, near-shadowless illumination across the whole face.',
};

// Stylized portrait silhouette per pattern.  Drawn at viewBox 100×100 so the
// shading geometry has room to read at small sizes without going mushy.  The
// face oval is the same in every variant; the SHADING path is what changes —
// that's the visual cue for the pattern shape.
function PatternFaceIcon({ name, size = 64, lit, shadowSide }) {
  const key = String(name || '').toLowerCase().split(/\s+/)[0]; // "loop" from "Loop"
  const skin    = lit ? 'rgba(245,210,140,0.26)' : 'rgba(184,191,199,0.14)';
  const stroke  = lit ? 'rgba(245,210,140,0.95)' : 'rgba(184,191,199,0.55)';
  const shadow  = 'rgba(0,0,0,0.88)';
  const hi      = lit ? 'rgba(245,210,140,0.70)' : 'rgba(184,191,199,0.40)';
  const noseCol = lit ? 'rgba(245,210,140,0.85)' : 'rgba(184,191,199,0.50)';

  // Default artwork has the shadow on the RIGHT side of the face for loop,
  // rembrandt, broad; on the LEFT for split, short. When the caller tells us
  // which side the shadow actually falls in THIS photo, we flip the whole
  // glyph horizontally so every candidate mirrors the real result.
  // `shadowSide` = 'left' | 'right' | undefined (undefined = no flip).
  const defaultRightSide = new Set(['loop', 'rembrandt', 'broad']);
  const defaultLeftSide  = new Set(['split', 'short']);
  let flip = false;
  if (shadowSide === 'left'  && defaultRightSide.has(key)) flip = true;
  if (shadowSide === 'right' && defaultLeftSide.has(key))  flip = true;

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} style={{ display: 'block', flexShrink: 0 }}>
      <g transform={flip ? 'translate(100,0) scale(-1,1)' : undefined}>
      {/* Face oval — anchor for every pattern */}
      <ellipse cx={50} cy={52} rx={28} ry={34} fill={skin} stroke={stroke} strokeWidth={2} />

      {/* Shading per pattern */}
      {key === 'loop' && (
        // small triangular nose-shadow cast from the nose toward the shadow cheek
        <path d="M50 52 L62 58 L60 66 L52 60 Z" fill={shadow} />
      )}
      {key === 'rembrandt' && (
        <>
          {/* shadow-side cheek fills dark, leaving a small triangle of light isolated under the eye */}
          <path d="M50 18 Q78 22 80 52 Q78 82 50 86 L50 18 Z" fill={shadow} opacity={0.68} />
          <polygon points="54,42 64,46 58,54" fill={hi} />
        </>
      )}
      {(key === 'butterfly' || key === 'paramount') && (
        // symmetric ellipse shadow directly under the nose
        <ellipse cx={50} cy={62} rx={8} ry={4} fill={shadow} />
      )}
      {key === 'split' && (
        // hard vertical split — half the face in total shadow
        <path d="M50 18 Q22 22 22 52 Q22 82 50 86 L50 18 Z" fill={shadow} opacity={0.82} />
      )}
      {key === 'broad' && (
        // shadow on the FAR (turned-away) side — face turned camera-right
        <path d="M68 26 Q84 52 68 78 Q60 82 56 76 L56 30 Q60 22 68 26 Z" fill={shadow} opacity={0.68} />
      )}
      {key === 'short' && (
        // shadow on the NEAR (turned-toward) side — face turned camera-right
        <path d="M32 26 Q16 52 32 78 Q40 82 44 76 L44 30 Q40 22 32 26 Z" fill={shadow} opacity={0.68} />
      )}
      {key === 'rim' && (
        // face fully dark, bright outline wraps the contour
        <>
          <ellipse cx={50} cy={52} rx={28} ry={34} fill="rgba(0,0,0,0.72)" />
          <ellipse cx={50} cy={52} rx={28} ry={34} fill="none" stroke={hi} strokeWidth={4} />
        </>
      )}
      {/* 'flat' draws nothing extra — even illumination */}

      {/* Nose dot for orientation (omit on rim/flat where it adds clutter) */}
      {key !== 'rim' && key !== 'flat' && (
        <circle cx={50} cy={56} r={2} fill={noseCol} />
      )}
      </g>
    </svg>
  );
}

function PatternBars({ candidates, isHighConf, shadowSide }) {
  const scoreColor  = isHighConf ? C.confHigh     : C.confLowScore;
  const barFill     = isHighConf ? C.confHighBar  : C.confLowBar;

  // Tapping a pattern silhouette portals a fullscreen overlay showing the
  // same drawing at ~240px along with the pattern name + definition, so the
  // photographer can actually READ the shape (36-px inline icon is too small
  // to resolve the loop triangle / rembrandt cheek).
  const [zoomedPattern, setZoomedPattern] = useState(null); // { name, score, def, lit } | null

  // `shadowSide` is 'left' or 'right' meaning "which side of the face the
  // shadow actually falls on in THIS photo".  We mirror asymmetric pattern
  // glyphs (loop, rembrandt, broad, short, split) so the candidate drawings
  // match the real DirectionalCompass read instead of defaulting to a
  // cast-right nose shadow on every photo.

  const defFor = (name) => {
    const key = String(name || '').toLowerCase().split(/\s+/)[0];
    return PATTERN_DEFINITIONS[key] || null;
  };

  return (
    <div style={{ padding: '0 20px 16px' }}>
      {candidates.map((c, i) => {
        const def = defFor(c.name);
        const isLeader = i === 0;
        return (
          <div key={c.name} style={{
            marginTop: i === 0 ? 4 : 18,
            display: 'grid',
            gridTemplateColumns: 'auto minmax(0, 1fr) auto',
            columnGap: 14,
            alignItems: 'center',
          }}>
            {/* Silhouette card — clickable; opens fullscreen portal.  Wrapped
                in a tactile inset well so the icon has a machined frame and
                the tap target is obvious. */}
            <div
              onClick={() => { tapHaptic(); setZoomedPattern({ name: c.name, score: c.score, def, lit: isLeader }); }}
              title="Tap to zoom"
              style={{
                width: 72, height: 72,
                borderRadius: 12,
                backgroundColor: '#070709',
                boxShadow: 'inset 1px 1px 3px rgba(0,0,0,0.55), inset -0.5px -0.5px 0.5px rgba(255,255,255,0.035)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'zoom-in',
                WebkitTapHighlightColor: 'transparent',
                flexShrink: 0,
              }}
            >
              <PatternFaceIcon name={c.name} size={60} lit={isLeader} shadowSide={shadowSide} />
            </div>

            {/* Name + definition + bar */}
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{
                  fontSize: 14,
                  fontWeight: isLeader ? 700 : 500,
                  color: isLeader ? C.textSubBold : C.textSub,
                  ...FONT_SMOOTH,
                }}>{c.name}</span>
              </div>
              {def && (
                <p style={{
                  margin: '2px 0 6px', fontSize: 11, lineHeight: 1.4,
                  color: isLeader ? steel(0.78) : steel(0.60),
                  fontWeight: 400,
                  ...FONT_SMOOTH,
                }}>{def}</p>
              )}
              {/* Bar track + fill */}
              <div style={{
                width: '100%', height: 3, borderRadius: 1.5,
                backgroundColor: C.barTrack,
                position: 'relative',
              }}>
                <div style={{
                  position: 'absolute', left: 0, top: 0,
                  width: `${c.score}%`, height: '100%',
                  borderRadius: 1.5,
                  backgroundColor: isLeader ? barFill : C.barAlt,
                  transition: 'width 0.4s ease',
                }} />
              </div>
            </div>

            {/* Score */}
            <span style={{
              fontSize: 14, fontWeight: 700,
              color: isLeader ? scoreColor : C.textSub,
              alignSelf: 'center',
              ...FONT_SMOOTH,
            }}>{c.score}%</span>
          </div>
        );
      })}
      {!isHighConf && (
        <p style={{
          margin: '14px 0 0', fontSize: 11,
          color: C.textWarn, lineHeight: 1.4,
          ...FONT_SMOOTH,
        }}>Close match — try a sharper photo for higher confidence</p>
      )}

      {/* Fullscreen zoom portal — large silhouette + name + score + definition.
          Click anywhere to dismiss (matches the diagram zoom convention).
          PORTALED to document.body so it escapes the FitToViewport scale. */}
      {zoomedPattern && createPortal(
        <div
          onClick={() => setZoomedPattern(null)}
          style={{
            position: 'fixed', inset: 0,
            backgroundColor: 'rgba(4,5,7,0.94)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            zIndex: 100,
            cursor: 'zoom-out',
            padding: 32,
            gap: 18,
          }}
        >
          <p style={{
            margin: 0, fontSize: 10, fontWeight: 700,
            letterSpacing: '2px', color: steel(0.6), ...FONT_SMOOTH,
          }}>PATTERN · {zoomedPattern.score}% MATCH</p>

          {/* Large silhouette in a viewfinder-style well */}
          <div style={{
            width: 'min(72vw, 320px)', height: 'min(72vw, 320px)',
            borderRadius: 24,
            backgroundColor: '#070709',
            boxShadow: 'inset 0px 3px 10px 0px rgba(0,0,0,0.7), inset 0px 1px 3px 0px rgba(0,0,0,0.5), 0 18px 60px rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}>
            <PatternFaceIcon name={zoomedPattern.name} size={260} lit={zoomedPattern.lit} shadowSide={shadowSide} />
          </div>

          <p style={{
            margin: 0, fontSize: 24, fontWeight: 800,
            color: 'rgba(245,247,250,0.95)', letterSpacing: '0.5px',
            ...FONT_SMOOTH,
          }}>{zoomedPattern.name}</p>

          {zoomedPattern.def && (
            <p style={{
              margin: 0, maxWidth: 420,
              fontSize: 14, lineHeight: 1.5,
              color: steel(0.78), textAlign: 'center',
              ...FONT_SMOOTH,
            }}>{zoomedPattern.def}</p>
          )}

          <p style={{
            margin: '6px 0 0', fontSize: 9, fontWeight: 700,
            letterSpacing: '1.5px', color: steel(0.45), ...FONT_SMOOTH,
          }}>TAP TO CLOSE</p>
        </div>,
        document.body
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

// BottomActions (trough with "New Photo | Save") was removed — its "Save"
// button duplicated the hero "Set Up This Light" CTA (both called onSetup),
// and "New Photo" duplicated the top-left back chevron (both call onRetry).
// Keeping the file free of dead code; see ResultScreen bottom row comment.

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
// ─── IrisCoverageScale ──────────────────────────────────────────────────────
// Visual scale showing where the catchlight lands on the small→XL spectrum,
// expressed as % iris diameter (the engine's native unit for catchlight
// size).  Reads as a banded ruler with a glowing marker so the modifier's
// apparent source size has spatial context, not just a raw number.
//
// Bands (Apparent source size relative to iris diameter):
//   < 25%   tiny    (bare bulb / hard light)
//   25–50%  small   (small softbox / strip)
//   50–100% medium  (mid softbox / oct)
//   100–200% large  (large oct / parabolic / window)
//   > 200%  huge    (sky / large diffuser overhead)
function IrisCoverageScale({ catchlightSize, angularArea }) {
  // Parse "12.3% iris" → 12.3
  let pct = null;
  if (catchlightSize) {
    const m = String(catchlightSize).match(/([\d.]+)\s*%/);
    if (m) pct = parseFloat(m[1]);
  }
  if (pct == null) return null;

  // Map % iris (0–250+) to a 0–1 ruler position with a soft compress at top
  const RULER_MAX = 250;
  const ruler = Math.max(0, Math.min(1, pct / RULER_MAX));

  const bands = [
    { label: 'TINY',   start: 0,   end: 25,  color: 'rgba(245,190,72,0.20)' },
    { label: 'SMALL',  start: 25,  end: 50,  color: 'rgba(245,190,72,0.32)' },
    { label: 'MEDIUM', start: 50,  end: 100, color: 'rgba(245,190,72,0.48)' },
    { label: 'LARGE',  start: 100, end: 200, color: 'rgba(245,190,72,0.65)' },
    { label: 'HUGE',   start: 200, end: 250, color: 'rgba(245,190,72,0.82)' },
  ];

  const bandFor = (v) => bands.find((b) => v >= b.start && v < b.end) || bands[bands.length - 1];
  const activeBand = bandFor(pct);

  return (
    <div style={{
      marginTop: 10, marginBottom: 10,
      padding: '10px 12px 8px',
      borderRadius: 10,
      backgroundColor: '#070709',
      boxShadow: 'inset 1px 1px 3px rgba(0,0,0,0.55), inset -0.5px -0.5px 0.5px rgba(255,255,255,0.035)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <p style={{ margin: 0, fontSize: 9, fontWeight: 700, color: steel(0.58), letterSpacing: '0.9px', ...FONT_SMOOTH }}>
          IRIS COVERAGE
        </p>
        <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(245,210,140,0.85)', letterSpacing: '0.4px', ...FONT_SMOOTH }}>
          {activeBand.label}
        </span>
      </div>

      {/* Banded ruler */}
      <div style={{ position: 'relative', height: 18 }}>
        <div style={{
          position: 'absolute', left: 0, right: 0, top: 6, height: 8,
          borderRadius: 4,
          display: 'flex',
          overflow: 'hidden',
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.65), inset 0 -0.5px 0 rgba(255,255,255,0.06)',
        }}>
          {bands.map((b) => (
            <div key={b.label} style={{
              flex: (b.end - b.start),
              backgroundColor: b.color,
              borderRight: '1px solid rgba(0,0,0,0.45)',
            }} />
          ))}
        </div>
        {/* Marker — vertical pin with engraved % readout */}
        <div style={{
          position: 'absolute', top: 0, left: `${ruler * 100}%`,
          transform: 'translateX(-50%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center',
        }}>
          <div style={{
            width: 9, height: 18, borderRadius: 2,
            backgroundColor: 'rgba(245,210,140,0.95)',
            boxShadow: '0 0 6px rgba(245,190,72,0.7), inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -1px 1px rgba(0,0,0,0.45)',
          }} />
        </div>
      </div>

      {/* Band ticks below the ruler */}
      <div style={{ display: 'flex', marginTop: 4 }}>
        {bands.map((b) => (
          <div key={b.label} style={{
            flex: (b.end - b.start),
            fontSize: 7.5, fontWeight: 700, letterSpacing: '0.4px',
            color: steel(0.55), textAlign: 'center', ...FONT_SMOOTH,
          }}>{b.label}</div>
        ))}
      </div>

      {/* Numeric readout */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 6 }}>
        <span style={{ fontSize: 16, fontWeight: 800, color: READOUT_FG, textShadow: READOUT_GLOW, letterSpacing: '0.4px', ...FONT_SMOOTH }}>
          {pct.toFixed(1)}<span style={{ fontSize: 11, fontWeight: 700, color: steel(0.62), marginLeft: 3 }}>% iris</span>
        </span>
        {angularArea && (
          <span style={{ fontSize: 10, fontWeight: 600, color: steel(0.55), letterSpacing: '0.3px', ...FONT_SMOOTH }}>
            {angularArea}
          </span>
        )}
      </div>
    </div>
  );
}

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
    // SHAPE and COVERAGE moved into the CATCHLIGHT half of the combined
    // CATCHLIGHT & MODIFIER drawer — they describe what's *reflected in
    // the eye*, not the modifier itself, so they belong with the catchlight
    // chips alongside the iris coverage scale.
    modifier.lightCount && (
      <SpecCell key="lights" label="LIGHTS" value={String(modifier.lightCount)} />
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
            <p style={{ margin: '3px 0 0', fontSize: 11, fontWeight: 500, color: steel(0.62), ...FONT_SMOOTH }}>
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
  // Tracks whether the in-flight hero gesture moved enough to count as a
  // drag (info-panel toggle).  Set in moveDrag past the 8px slop, reset on
  // every fresh handleHeroStart.  Used by the hero onClick to distinguish
  // a real tap (→ enter zoom) from the synthesized click that follows a
  // vertical info-panel drag.
  const heroDidDrag = useRef(false);
  // Diagram fullscreen modal — click any LightingDiagram instance to open
  // a viewport-filling overlay with the same graphic.
  const [diagramFullscreen, setDiagramFullscreen] = useState(false);
  useEffect(() => {
    if (!diagramFullscreen) return;
    const onKey = (e) => { if (e.key === 'Escape') setDiagramFullscreen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [diagramFullscreen]);

  // Chip detail overlay — clicking a warning chip opens a translucent card
  // pinned over the hero photo with the chip label, severity, and detail
  // explanation. Tapping the photo or pressing Escape dismisses it.
  const [chipDetail, setChipDetail] = useState(null); // { label, sev, detail } | null
  useEffect(() => {
    if (!chipDetail) return;
    const onKey = (e) => { if (e.key === 'Escape') setChipDetail(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chipDetail]);

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
    // Cancel long press if user is dragging — and remember that this gesture
    // turned into a real drag so the trailing click doesn't fire fullscreen.
    if (Math.abs(dy) > 8) {
      heroDidDrag.current = true;
      if (longPressTimer.current) {
        clearTimeout(longPressTimer.current);
        longPressTimer.current = null;
      }
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
    heroDidDrag.current = false;
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
  // Convention conversion — see LightingDiagram.jsx for the long comment.
  // The engine emits `nose_shadow_angle_deg` in CENTROID convention
  //   (0° = shadow centroid below nose, 90° = right, 180° = above, 270° = left)
  // but every UI consumer (ShadowSignature, CatchlightEye, LightingDiagram,
  // raw-signal chips) was written against SHADOW_PASS convention
  //   (0° = up/back-of-head, 90° = right, 180° = down, 270° = left).
  // The two are 180° apart, so we normalize once at the source so every
  // downstream widget shows the physically-correct direction.  When the
  // engine standardizes its convention this is the only line to revert.
  const _rawSignalsRaw = signalDiag.signals || {};
  const rawSignals = _rawSignalsRaw.nose_shadow_angle_deg != null
    ? { ..._rawSignalsRaw, nose_shadow_angle_deg: ((_rawSignalsRaw.nose_shadow_angle_deg + 180) % 360) }
    : _rawSignalsRaw;
  // Catchlight clock position — prefer the same value the modifier spec-cell
  // displays (sections.modifier.position) so the eye graphic and the visible
  // POSITION readout never disagree.  Only fall back to the deeper engine
  // field when the surface section omits it.
  const catchlightClockStr = sections?.modifier?.position
    || raw.lighting_inference?.catchlight_intelligence?.primary_key?.position
    || null;
  const catchlightClockHour = parseClockHour(catchlightClockStr);
  const hasRawSignals = rawSignals.nose_shadow_angle_deg != null
    || rawSignals.left_right_asymmetry != null
    || rawSignals.shadow_density != null
    || rawSignals.highlight_width_ratio != null;
  const faceCrop = getFaceCropPosition(result?._raw);
  const isHighConf  = confidence >= 70;
  const confColor   = isHighConf ? C.confHigh : C.confLow;
  // Desktop uses a taller hero block so the photo can show its full aspect
  // (object-fit: contain) and a LightingDiagram can sit inline below the CTA.
  // Desktop hero column height — bumped from 920 → 980 so the LightingDiagram
  // well at the bottom has a usable >250px instead of being clipped at 165px.
  // The actions row still fits within the 1040 design viewport (980 + 60 ≈ 1040).
  const panelTop    = isDesktop ? 980 : (isHighConf ? 497 : 478);
  const leadMargin  = confidence - (sections.patternCandidates[1]?.score ?? 0);
  // Desktop hero position constants — photo / info / CTA / diagram stacked
  // top-to-bottom inside the 980px hero column. Photo height shaved 40px and
  // every downstream constant lifted 40px to give the diagram its own real
  // estate (well height = 980 − 680 − 25 = 275px, padded = 247px).
  const D_PHOTO_TOP    = 100;
  const D_PHOTO_HEIGHT = 380;   // portrait-capable box (was 420)
  const D_INFO_TOP     = 500;   // photo bottom + 20 gap
  const D_CTA_TOP      = 620;   // info (pattern+pills) ~ 80 tall + 40 gap
  const D_DIAGRAM_TOP  = 680;   // CTA (48) + 12 gap → diagram well

  const toggle = (key) => { setDrawers(prev => ({ ...prev, [key]: !prev[key] })); panelToggleSound(); tapHaptic(); };

  // Drawer sharing — when more than one drawer is open in the right column we
  // divide the available content height (column max 872 minus ~46px header per
  // drawer × 6 drawers minus inter-drawer gaps) so opened drawers fit instead
  // of pushing each other off-screen. Mobile lets the page scroll naturally.
  const openDrawerCount = Object.values(drawers).filter(Boolean).length;
  const sharedDrawerMaxH = isDesktop && openDrawerCount > 1
    ? Math.max(180, Math.floor((872 - 6 * 46 - 5 * 12) / openDrawerCount))
    : null;

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
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 75% 55% at 50% 22%, rgba(120,148,175,0.022) 0%, rgba(132, 158, 184,0.008) 40%, transparent 72%)' }} />
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
            // can't re-enter zoom or re-arm the long-press timer.
            if (recentlyExitedZoom.current) return;
            if (longPressFired.current) { longPressFired.current = false; return; }
            // If a chip-detail overlay is showing on the hero, a click should
            // dismiss it instead of toggling fullscreen.
            if (chipDetail) { setChipDetail(null); return; }
            if (isZoomed) {
              // Single click on zoomed hero → exit fullscreen.
              exitZoom();
              return;
            }
            // If the gesture turned into a vertical info-panel drag, this
            // trailing click is not a tap — bail out and reset the flag.
            if (heroDidDrag.current) { heroDidDrag.current = false; return; }
            // Plain click → fill viewport.  Cancel any pending long-press
            // timer so it doesn't toggle us back out 500ms later.
            if (longPressTimer.current) {
              clearTimeout(longPressTimer.current);
              longPressTimer.current = null;
            }
            tapHaptic();
            setIsZoomed(true);
          }}
          style={{
            // When zoomed we hide the inline hero and let the portaled
            // fullscreen overlay (rendered below, escapes FitToViewport)
            // own the visual.  Keeping the inline node mounted preserves
            // the position/size CSS so exit transitions still feel right.
            position: 'absolute',
            top: (isDesktop ? D_PHOTO_TOP : (infoVisible ? 100 : 60)),
            left: 25,
            right: 25,
            height: (isDesktop ? D_PHOTO_HEIGHT : (infoVisible ? 180 : 340)),
            borderRadius: 14,
            visibility: isZoomed ? 'hidden' : 'visible',
            overflow: 'hidden',
            backgroundColor: '#000',
            // Outer rim bevel — sunken well carved into the matte surface
            boxShadow: '0 -1px 0 rgba(0,0,0,0.5), -1px 0 0 rgba(0,0,0,0.4), 1px 1px 0 rgba(255,255,255,0.05)',
            cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
            transition: isDragging ? 'none' : 'height 0.35s cubic-bezier(0.4, 0, 0.2, 1), top 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
            touchAction: 'none',
            zIndex: 1,
          }}
        >
          {imagePreview && (
            <img key={imagePreview} src={imagePreview} alt="Result" style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              // Desktop shows the whole photo (contain) since we have room;
              // mobile stays on the tight face-crop (cover).
              objectFit: isDesktop ? 'contain' : 'cover',
              objectPosition: isDesktop ? '50% 50%' : faceCrop,
              opacity: infoVisible ? 0.8 : 1,
              transition: 'opacity 0.35s ease',
              animation: 'heroZoomInSlow 1.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards',
              transformOrigin: 'center center',
            }} />
          )}
          {/* Blown-highlights region overlay — appears only when the user
              taps the Blown Highlights warning chip. Sampled client-side from
              the loaded hero bitmap; tints clipped pixels red and near-clipped
              pixels orange so the user can see WHERE the engine flagged. */}
          {imagePreview && chipDetail?.label === 'Blown Highlights' && (
            <BlownHighlightsCanvas
              src={imagePreview}
              objectFit={isDesktop ? 'contain' : 'cover'}
              objectPosition={isDesktop ? '50% 50%' : faceCrop}
            />
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
          {/* Chip detail overlay — slides up over the hero when a warning chip
              is tapped. Sits above the inner-shadow bevel so the rim still
              reads behind it. */}
          {chipDetail && (
            <div
              onClick={(e) => { e.stopPropagation(); setChipDetail(null); }}
              style={{
                position: 'absolute', inset: 0, zIndex: 4,
                // Blown Highlights leaves the backdrop transparent so the
                // tinted-pixel overlay underneath stays visible.  Other chip
                // details still wash the photo so the explanation reads.
                background: chipDetail.label === 'Blown Highlights'
                  ? 'transparent'
                  : 'linear-gradient(180deg, rgba(4,5,7,0.35) 0%, rgba(4,5,7,0.78) 55%, rgba(4,5,7,0.92) 100%)',
                backdropFilter: chipDetail.label === 'Blown Highlights' ? undefined : 'blur(4px)',
                WebkitBackdropFilter: chipDetail.label === 'Blown Highlights' ? undefined : 'blur(4px)',
                display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                padding: 22,
                cursor: 'pointer',
                animation: 'chipDetailIn 0.28s cubic-bezier(0.4,0,0.2,1)',
              }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: '100%', maxWidth: 460,
                  borderRadius: 14,
                  backgroundColor: 'rgba(14,16,20,0.92)',
                  boxShadow: `${PANEL_SHADOW}, ${PANEL_BEVEL}`,
                  padding: '16px 18px 14px',
                  cursor: 'default',
                  position: 'relative',
                }}
              >
                <button
                  onClick={() => setChipDetail(null)}
                  aria-label="Close"
                  style={{
                    position: 'absolute', top: 8, right: 10,
                    width: 26, height: 26, borderRadius: 13,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    color: 'rgba(245,247,250,0.7)',
                    fontSize: 16, lineHeight: '22px',
                    cursor: 'pointer',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >×</button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Chip label={chipDetail.label} variant={sevToVariant(chipDetail.sev)} size="md" />
                  <span style={{
                    fontSize: 9, fontWeight: 700, color: steel(0.5),
                    letterSpacing: '1px', textTransform: 'uppercase', ...FONT_SMOOTH,
                  }}>
                    {chipDetail.sev === 'danger' ? 'Critical' : chipDetail.sev === 'warn' ? 'Warning' : 'Note'}
                  </span>
                </div>
                <p style={{
                  margin: 0,
                  fontSize: 13, lineHeight: '19px',
                  color: 'rgba(225,228,234,0.92)',
                  ...FONT_SMOOTH,
                }}>
                  {chipDetail.detail || 'No additional detail available for this flag.'}
                </p>
              </div>
            </div>
          )}
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
              color: steel(0.62),
              letterSpacing: '0.1px',
              WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', textRendering: 'geometricPrecision',
            }}>{mood}</p>
          ) : null}

          {/* Source attribution — dim sub-line: "strong · reference read" */}
          {sourceAttribution ? (
            <p style={{
              position: 'absolute', top: 38, right: 25, margin: 0,
              fontSize: 10, fontWeight: 500,
              color: steel(0.58),
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
            stands alone on wide viewports.  Wrapped in the canonical glass
            viewfinder treatment (well + vignette + reflection + bevel) so
            it reads as the same machined viewport as the home screen and
            the hero photo above it.  The diagram itself fills the well
            fluidly so it zooms with the hero column width instead of
            sitting at a fixed 300px in an oversized area. */}
        {isDesktop && (
          <div
            onClick={() => { tapHaptic(); setDiagramFullscreen(true); }}
            style={{
              position: 'absolute',
              top: D_DIAGRAM_TOP,
              left: 25, right: 25,
              bottom: 25,
              opacity: infoVisible ? 1 : 0,
              transition: 'opacity 0.3s ease',
              cursor: 'zoom-in',
              borderRadius: 14,
              backgroundColor: '#070709',
              boxShadow: 'inset 0px 2px 6px 0px rgba(0,0,0,0.55), inset 0px 1px 2px 0px rgba(0,0,0,0.4), inset 1px 0px 2px 0px rgba(0,0,0,0.3), inset -1px 0px 2px 0px rgba(0,0,0,0.3)',
              overflow: 'hidden',
            }}
            title="Click to expand diagram"
          >
            {/* Diagram fills the viewfinder well */}
            <div style={{
              position: 'absolute', inset: 0,
              padding: '18px 20px',
              display: 'flex', justifyContent: 'center', alignItems: 'stretch',
              zIndex: 1,
            }}>
              <LightingDiagram result={result} fluid />
            </div>
            {/* Glass reflection + lens vignette overlay */}
            <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: 14, pointerEvents: 'none', zIndex: 9 }}>
              <div style={{ position: 'absolute', inset: 0, background: LENS_VIGNETTE }} />
              <div style={{ position: 'absolute', top: 0, left: 0, right: '5%', bottom: 0, background: GLASS_REFLECTION, borderRadius: 14, opacity: 0.42 }} />
            </div>
            {/* Inner-shadow bevel ring */}
            <div style={{
              position: 'absolute', inset: 0, borderRadius: 14,
              pointerEvents: 'none', boxShadow: VIEWFINDER_INNER_SHADOW, zIndex: 10,
            }} />
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
              <Chip
                key={i}
                label={w.label}
                variant={sevToVariant(w.sev)}
                size="md"
                onClick={() => { tapHaptic(); setChipDetail(w); }}
                title={w.detail || 'Tap for details'}
              />
            ))}
          </div>
        )}

        {/* PATTERN CANDIDATES */}
        <PullTabDrawer label="PATTERN CANDIDATES" open={!!drawers.patterns} onToggle={() => toggle('patterns')} maxH={600} sharedMaxH={sharedDrawerMaxH}>
          <PatternBars
            candidates={sections.patternCandidates}
            isHighConf={isHighConf}
            shadowSide={(() => {
              const q = (sections.shadowDirection && sections.shadowDirection.shadowQuadrant) || '';
              if (/left$/.test(q)) return 'left';
              if (/right$/.test(q)) return 'right';
              return undefined;
            })()}
          />
        </PullTabDrawer>

        {/* SHADOW ANALYSIS — LightingDiagram moved to the hero column on
            desktop, so this drawer shows a compact ShadowSignature (angle
            dial + density bar), the structured LightComponentChips, and a
            DirectionalCompass above the narrative.  Each graphic pulls the
            matching piece OUT of the raw engine narrative so the paragraph
            at the bottom stays short and human. */}
        <PullTabDrawer label="SHADOW ANALYSIS" open={!!drawers.shadow} onToggle={() => toggle('shadow')} maxH={900} sharedMaxH={sharedDrawerMaxH}>
          {/* ── SIGNAL row ────────────────────────────────────────────────
              Compact dashboard of the two raw shadow signals (angle dial +
              density bar on desktop; full LightingDiagram on mobile so the
              top-down map stays accessible without leaving the drawer). */}
          <SubLabel>Signal</SubLabel>
          {!isDesktop ? (
            <div
              onClick={() => { tapHaptic(); setDiagramFullscreen(true); }}
              style={{
                cursor: 'zoom-in',
                marginBottom: 8,
                position: 'relative',
                width: '100%',
                aspectRatio: '300 / 220',
                borderRadius: 12,
                backgroundColor: '#070709',
                boxShadow: 'inset 0px 2px 6px 0px rgba(0,0,0,0.55), inset 0px 1px 2px 0px rgba(0,0,0,0.4), inset 1px 0px 2px 0px rgba(0,0,0,0.3), inset -1px 0px 2px 0px rgba(0,0,0,0.3)',
                overflow: 'hidden',
              }}
              title="Tap to expand diagram"
            >
              <div style={{
                position: 'absolute', inset: 0,
                padding: '14px 16px',
                display: 'flex', justifyContent: 'center', alignItems: 'stretch',
                zIndex: 1,
              }}>
                <LightingDiagram result={result} fluid compact />
              </div>
              <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: 12, pointerEvents: 'none', zIndex: 9 }}>
                <div style={{ position: 'absolute', inset: 0, background: LENS_VIGNETTE }} />
                <div style={{ position: 'absolute', top: 0, left: 0, right: '5%', bottom: 0, background: GLASS_REFLECTION, borderRadius: 12, opacity: 0.42 }} />
              </div>
              <div style={{
                position: 'absolute', inset: 0, borderRadius: 12,
                pointerEvents: 'none', boxShadow: VIEWFINDER_INNER_SHADOW, zIndex: 10,
              }} />
            </div>
          ) : (
            <ShadowSignature
              angleDeg={rawSignals.nose_shadow_angle_deg}
              density={rawSignals.shadow_density}
            />
          )}

          {/* ── COMPONENTS row ────────────────────────────────────────────
              Key/Fill/Ambient breakdown chips, isolated under their own
              header so the shadow contributors read as a discrete group. */}
          {sections.shadowComponents && (
            <>
              <SubLabel>Components</SubLabel>
              <LightComponentChips components={sections.shadowComponents} />
            </>
          )}

          {/* ── DIRECTION row ─────────────────────────────────────────────
              Compass widget with engraved label so the directional read is
              the most prominent secondary signal. */}
          {sections.shadowDirection && (
            <>
              <SubLabel>Direction</SubLabel>
              <DirectionalCompass direction={sections.shadowDirection} />
            </>
          )}

          {/* ── NARRATIVE block ───────────────────────────────────────────
              Engine paragraph + optional edge-case italic note grouped
              under a single subhead so the read flows top-to-bottom. */}
          {(sections.shadowAnalysis || sections.shadowEdgeNote) && (
            <>
              <SubLabel>Read</SubLabel>
              {sections.shadowAnalysis && (
                <p style={{ margin: 0, fontSize: 13, fontWeight: 400, lineHeight: '19px', color: C.textSub, ...FONT_SMOOTH }}>
                  {sections.shadowAnalysis}
                </p>
              )}
              {sections.shadowEdgeNote && (
                <p style={{ margin: '8px 0 0', fontSize: 12, fontWeight: 400, lineHeight: '17px', color: steel(0.62), fontStyle: 'italic', ...FONT_SMOOTH }}>
                  {sections.shadowEdgeNote}
                </p>
              )}
            </>
          )}
        </PullTabDrawer>

        {/* SCENE — narrative paragraph + chip-card grid of VLM fields */}
        {(sections.sceneDescription || sections.vlmNarrative) && (
          <PullTabDrawer label="SCENE" open={!!drawers.scene} onToggle={() => toggle('scene')} maxH={800} sharedMaxH={sharedDrawerMaxH}>
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

        {/* CATCHLIGHT & MODIFIER — combined drawer.  Catchlight context (eye
            widget + position chips + iris coverage scale) reads on top so
            the *what's reflected in the eye* story comes first; a hairline
            divider separates that from the modifier silhouette + spec grid
            + physical meaning below.  The iris coverage scale gives the
            modifier numbers spatial context — small/medium/large/huge band
            with a glowing marker on the actual % iris. */}
        {(sections.modifier?.family || rawSignals.nose_shadow_angle_deg != null || catchlightClockHour != null || sections.catchlightModifier) && (
          <PullTabDrawer label="CATCHLIGHT & MODIFIER" open={!!drawers.catchlight} onToggle={() => toggle('catchlight')} maxH={900} sharedMaxH={sharedDrawerMaxH}>
            {/* ── CATCHLIGHT row ───────────────────────────────────────── */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'auto minmax(0, 1fr)',
              gap: 12,
              alignItems: 'stretch',
            }}>
              <div style={{
                padding: '8px 10px 6px',
                borderRadius: 10,
                backgroundColor: '#070709',
                boxShadow: 'inset 1px 1px 3px rgba(0,0,0,0.55), inset -0.5px -0.5px 0.5px rgba(255,255,255,0.035)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              }}>
                <CatchlightEye
                  clockHour={catchlightClockHour}
                  angleDeg={rawSignals.nose_shadow_angle_deg}
                />
                <span style={{ fontSize: 9, fontWeight: 700, color: steel(0.55), letterSpacing: '0.8px', ...FONT_SMOOTH }}>
                  CATCHLIGHT
                </span>
              </div>
              <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6 }}>
                {catchlightClockStr && (
                  <Chip label={`POSITION · ${prettify(catchlightClockStr, { upper: true })}`} variant="warn" size="sm" />
                )}
                {sections.modifier?.shape && (
                  <Chip label={`SHAPE · ${String(sections.modifier.shape).toUpperCase()}`} variant="warn" size="sm" />
                )}
                {sections.modifier?.angularArea && (
                  <Chip label={`COVERAGE · ${sections.modifier.angularArea.toUpperCase()}`} variant="info" size="sm" />
                )}
                {rawSignals.nose_shadow_angle_deg != null && (
                  <Chip label={`SHADOW ${rawSignals.nose_shadow_angle_deg.toFixed(0)}°`} variant="info" size="sm" />
                )}
              </div>
            </div>

            {/* Iris coverage scale — sits between catchlight context and the
                modifier spec grid so the % iris number lands with size-band
                context (tiny/small/medium/large/huge). */}
            {sections.modifier?.catchlightSize && (
              <IrisCoverageScale
                catchlightSize={sections.modifier.catchlightSize}
                angularArea={sections.modifier.angularArea}
              />
            )}

            {/* Hairline divider */}
            {sections.modifier?.family && (
              <div style={{
                margin: sections.modifier?.catchlightSize ? '4px 0 12px' : '14px 0 12px',
                height: 1,
                background: 'linear-gradient(to right, transparent 0%, rgba(255,255,255,0.06) 50%, transparent 100%)',
                boxShadow: '0 0.5px 0 rgba(0,0,0,0.5)',
              }} />
            )}

            {/* ── MODIFIER row ─────────────────────────────────────────── */}
            {sections.modifier?.family && (
              <>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto minmax(0, 1fr)',
                  gap: 14,
                  alignItems: 'start',
                  marginBottom: 10,
                }}>
                  <div style={{
                    padding: '8px 10px 6px',
                    borderRadius: 10,
                    backgroundColor: '#070709',
                    boxShadow: 'inset 1px 1px 3px rgba(0,0,0,0.55), inset -0.5px -0.5px 0.5px rgba(255,255,255,0.035)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  }}>
                    <ModifierSilhouette family={sections.modifier.family} dimensions={sections.modifier.sizeRange} />
                    <span style={{ fontSize: 9, fontWeight: 700, color: steel(0.55), letterSpacing: '0.8px', ...FONT_SMOOTH }}>
                      MODIFIER
                    </span>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <ModifierDetail modifier={sections.modifier} />
                  </div>
                </div>
                {sections.modifier?.physicalMeaning && (
                  <p style={{ margin: '4px 0 0', fontSize: 12, fontWeight: 400, lineHeight: '17px', color: steel(0.62), fontStyle: 'italic', ...FONT_SMOOTH }}>
                    {sections.modifier.physicalMeaning}
                  </p>
                )}
              </>
            )}

            {/* Combined narrative — engine writes this from the catchlight
                intelligence pass; lives at the bottom so it summarizes both
                halves of the panel. */}
            {sections.catchlightModifier && !sections.modifier?.family && (
              <p style={{
                margin: '10px 0 0',
                fontSize: 12,
                fontWeight: 400,
                lineHeight: '18px',
                color: C.textSub,
                overflowWrap: 'anywhere',
                ...FONT_SMOOTH,
              }}>
                {sections.catchlightModifier}
              </p>
            )}
          </PullTabDrawer>
        )}

        {/* COLOR PALETTE — wider swatches, CCTAxis under, harmony chip,
            then italic character note. */}
        {sections.colorPalette && (
          <PullTabDrawer label="COLOR PALETTE" open={!!drawers.colors} onToggle={() => toggle('colors')} maxH={700} sharedMaxH={sharedDrawerMaxH}>
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
          <PullTabDrawer label="CONFIDENCE" open={!!drawers.confidence} onToggle={() => toggle('confidence')} maxH={1200} sharedMaxH={sharedDrawerMaxH}>
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
              <p style={{ margin: '10px 0 0', fontSize: 12, fontWeight: 400, lineHeight: '17px', color: steel(0.62), fontStyle: 'italic', ...FONT_SMOOTH }}>
                {sections.signalQuality.reasoning}
              </p>
            )}
          </PullTabDrawer>
        )}
      </div>

      {/* ─── Bottom row: single spacer ───
          The BottomActions "New Photo | Save" trough was removed because its
          Save button called the same `onSetup()` as the hero "Set Up This Light"
          CTA, and New Photo duplicated the top-left back chevron (which already
          fires `onRetry`).  A single flat spacer keeps the grid row reserved so
          the panel column alignment stays put. */}
      <div style={{ height: 40, ...(isDesktop ? { gridArea: 'actions' } : null) }} />

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

      {/* ─── Hero fullscreen overlay ───
          PORTALED to document.body — same reason as the diagram modal: the
          FitToViewport transform creates a new containing block for any
          fixed-position descendant, so without the portal a "fullscreen"
          overlay only fills the design viewport, not the real screen.  This
          overlay owns the zoom/pinch/pan handlers while it's active; the
          inline hero stays mounted but visibility-hidden so info-panel
          state is preserved across the round trip. */}
      {isZoomed && imagePreview && createPortal(
        <div
          onClick={() => exitZoom()}
          onTouchStart={handleZoomTouchStart}
          onTouchMove={handleZoomTouchMove}
          onTouchEnd={handleZoomTouchEnd}
          style={{
            position: 'fixed', inset: 0,
            backgroundColor: '#000',
            zIndex: 99,
            cursor: 'zoom-out',
            touchAction: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          <img
            src={imagePreview}
            alt="Result fullscreen"
            style={{
              maxWidth: '100vw',
              maxHeight: '100dvh',
              width: 'auto',
              height: 'auto',
              objectFit: 'contain',
              transform: `translate(${zoomPan.x}px, ${zoomPan.y}px) scale(${zoomScale})`,
              transformOrigin: 'center center',
              willChange: 'transform',
              userSelect: 'none',
              pointerEvents: 'none',
            }}
          />
          <button
            onClick={(e) => { e.stopPropagation(); exitZoom(); }}
            aria-label="Close"
            style={{
              position: 'absolute', top: 24, right: 28,
              width: 44, height: 44, borderRadius: 22,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(245,247,250,0.85)',
              fontSize: 22, fontWeight: 400, lineHeight: 1,
              cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              ...FONT_SMOOTH,
            }}
          >×</button>
        </div>,
        document.body
      )}

      {/* ─── Diagram fullscreen modal ───
          Renders the LightingDiagram filling the viewport with a backdrop.
          Click the backdrop or the × to dismiss; Escape also closes.
          PORTALED to document.body so it escapes the FitToViewport
          `transform: scale()` ancestor — without the portal, `position:
          fixed` resolves to the scaled design viewport (1180-wide), not the
          actual screen, and the modal renders inside the design column
          instead of filling the visual viewport. */}
      {diagramFullscreen && createPortal(
        <div
          onClick={() => setDiagramFullscreen(false)}
          style={{
            position: 'fixed', inset: 0,
            backgroundColor: 'rgba(4,5,7,0.92)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 100,
            cursor: 'zoom-out',
          }}
        >
          {/* Close chevron */}
          <button
            onClick={(e) => { e.stopPropagation(); setDiagramFullscreen(false); }}
            style={{
              position: 'absolute', top: 24, right: 28,
              width: 44, height: 44, borderRadius: 22,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'rgba(245,247,250,0.85)',
              fontSize: 22, fontWeight: 400, lineHeight: 1,
              cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              ...FONT_SMOOTH,
            }}
            aria-label="Close diagram"
          >×</button>
          {/* Fluid diagram — claims up to 92vw × 88vh preserving aspect.
              Wrapped in the canonical glass viewfinder layered stack (well +
              vignette + reflection + bevel) so the fullscreen zoom reads as
              the same machined viewport as the inline hero diagram, just at
              max scale.  Clicks on the viewfinder itself dismiss the zoom
              (no stopPropagation) so tapping anywhere minimizes. */}
          <div
            style={{
              position: 'relative',
              width: 'min(92vw, calc(88vh * 300/220))',
              height: 'min(88vh, calc(92vw * 220/300))',
              borderRadius: 20,
              backgroundColor: '#070709',
              boxShadow: 'inset 0px 3px 10px 0px rgba(0,0,0,0.7), inset 0px 1px 3px 0px rgba(0,0,0,0.5), inset 1px 0px 3px 0px rgba(0,0,0,0.4), inset -1px 0px 3px 0px rgba(0,0,0,0.4), 0 24px 80px rgba(0,0,0,0.7)',
              overflow: 'hidden',
              cursor: 'zoom-out',
            }}
          >
            <div style={{
              position: 'absolute', inset: 0,
              padding: '32px 36px',
              display: 'flex', justifyContent: 'center', alignItems: 'stretch',
              zIndex: 1,
            }}>
              <LightingDiagram result={result} fluid />
            </div>
            {/* Glass reflection + lens vignette overlay */}
            <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: 20, pointerEvents: 'none', zIndex: 9 }}>
              <div style={{ position: 'absolute', inset: 0, background: LENS_VIGNETTE }} />
              <div style={{ position: 'absolute', top: 0, left: 0, right: '5%', bottom: 0, background: GLASS_REFLECTION, borderRadius: 20, opacity: 0.42 }} />
            </div>
            {/* Inner-shadow bevel ring */}
            <div style={{
              position: 'absolute', inset: 0, borderRadius: 20,
              pointerEvents: 'none', boxShadow: VIEWFINDER_INNER_SHADOW, zIndex: 10,
            }} />
          </div>
        </div>,
        document.body
      )}

    </div>
    </div>
  );
}
