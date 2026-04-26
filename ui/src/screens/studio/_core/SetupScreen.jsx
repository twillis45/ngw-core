/**
 * SetupScreen — Studio Matte design
 * Save a lighting setup after analysis.
 *
 * Final UI patterns:
 *   1. Flip card hero — 3D card flip between specs ↔ diagram
 *   2. Long-press reveal — secondary spec values on hold
 *   3. Lens-ring selector — rotary tabs for analysis sections
 *   4. Inset chip-strip — horizontal scrolling meta readout
 *   5. Pull-tab drawer — form fields behind metallic drawer handle
 *   6. Viewfinder overlay — glass panel with diagram + specs (nav icon)
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { tapHaptic, successHaptic, navHaptic, longPressHaptic, grainHaptic } from '../../../utils/haptics';
import { getFaceCropPosition } from '../../../utils/faceCrop';
import { useIsDesktop } from '../../../utils/useIsDesktop';
import { softClickSound, navSlideSound, segmentPressSound, panelToggleSound } from '../../../utils/sounds';
import { steel, C as SM_C, FONT_SMOOTH, PANEL_SHADOW, PANEL_BEVEL,
         CTA_BG, CTA_SHADOW, CTA_BEVEL,
         VIEWFINDER_INNER_SHADOW, GLASS_REFLECTION, LENS_VIGNETTE,
         KEY_ACCENT } from '../../../theme/studioMatte';
import MatteBackground from '../_shared/MatteBackground';
import LightingDiagram from './components/LightingDiagram';
import SideViewDiagram from './components/SideViewDiagram';
import {
  OtherSetupsCard, SubstitutionsCard, QuickFixesCard, WhatToLookForCard,
} from './components/ResultCards';
import Chip, { sevToVariant } from '../_shared/Chip';
import ModifierEmission from '../_shared/ModifierEmission';
import PullTabDrawer from '../_shared/PullTabDrawer';
import { saveSetup as persistSetup } from '../../../data/setupStore';
import { saveShootRole, loadShootRole } from '../../../data/shootModeStore';
import { trackEvent } from '../../../data/analytics';

// ─── Tokens ──────────────────────────────────────────────────────────────────
// `textDim` is intentionally lifted from the global 0.5 alpha to 0.66 here
// so the SetupScreen's secondary metadata reads on bright/calibrated
// displays. Anywhere this screen wants whisper-quiet text it can still
// reach for steel(0.42) directly.
const C = {
  ...SM_C,
  fieldBg: SM_C.slotBg,
  textDim:  'rgba(184,191,199,0.66)',
  textMeta: '#b8bec7',
};

const FIELD_SHADOW       = 'inset 0px 1px 3px 0px rgba(0,0,0,0.6), inset 0px 0px 8px 0px rgba(0,0,0,0.3), inset 1px 1px 2px 0px rgba(0,0,0,0.4)';
const FIELD_SHADOW_FOCUS = `inset 0px 1px 3px 0px rgba(0,0,0,0.6), inset 0px 0px 8px 0px rgba(0,0,0,0.3), inset 1px 1px 2px 0px rgba(0,0,0,0.4), 0px 0px 0px 1px ${steel(0.35)}`;

const RING_TRACK_SHADOW  = 'inset 0px 2px 5px 0px rgba(0,0,0,0.7), inset 0px 1px 2px 0px rgba(0,0,0,0.5), inset 1px 0px 2px 0px rgba(0,0,0,0.3), inset -1px 0px 2px 0px rgba(0,0,0,0.3)';
const RING_ACTIVE_SHADOW = '0px 2px 6px 0px rgba(0,0,0,0.6), 0px 1px 2px 0px rgba(0,0,0,0.4), inset 0px 0.5px 0px 0px rgba(255,255,255,0.08), inset 0px -0.5px 0px 0px rgba(0,0,0,0.3)';

// Drawer handle shadow now lives in theme/studioMatte and is consumed by the
// shared PullTabDrawer component imported above.

// Display-string normalizer — Studio Matte rule: never show raw engine
// snake_case / kebab-case keys in the UI. Swap _ and - for spaces and
// optionally uppercase for caps display copy.
function prettify(str, { upper = false } = {}) {
  if (str == null) return '';
  // Replace underscores with spaces but preserve hyphens — they appear
  // in numeric ranges ("3-4x"), compound terms ("camera-right"), and
  // ratio notation ("2:1") that should stay intact.
  const cleaned = String(str).replace(/_+/g, ' ').trim();
  return upper ? cleaned.toUpperCase() : cleaned;
}

// ─── Role colors (per-light role accent) ────────────────────────────────────
const ROLE_COLORS = {
  key:         KEY_ACCENT,  // amber
  fill:        '#6fa8dc',  // steel blue
  rim:         '#d67b4e',  // coral
  kicker:      '#e8b05f',  // warm gold
  background:  '#8a6fb5',  // violet
  bounce:      '#9ec17c',  // sage green
  negative_fill: '#7b7b82',// neutral grey
  unknown_secondary: '#5f7c96',
};
const ROLE_LABELS = {
  key: 'KEY', fill: 'FILL', rim: 'RIM', kicker: 'KICKER',
  background: 'BG', bounce: 'BOUNCE', negative_fill: 'NEG FILL',
  unknown_secondary: 'SECONDARY',
};

// ─── Warning tokens ──────────────────────────────────────────────────────────
// Chip styling now lives in _shared/Chip.jsx (variant palette). Only the
// edge-case label map remains below.

// Edge-case flag → label + severity ('danger' | 'warn' | 'info')
const EDGE_CASE_LABELS = {
  blown_highlights:                { label: 'BLOWN HIGHLIGHTS',   sev: 'warn' },
  earring_catchlight_contamination:{ label: 'EARRING IN CATCHLIGHT', sev: 'danger' },
  mixed_color_temperature:         { label: 'MIXED CCT',          sev: 'warn' },
  no_face:                         { label: 'NO FACE FOUND — use a clear headshot', sev: 'danger' },
  outdoor_foliage_shadows:         { label: 'FOLIAGE SHADOWS',    sev: 'warn' },
  window_light_gradient:           { label: 'WINDOW GRADIENT',    sev: 'info' },
  bw_processing:                   { label: 'B&W PROCESSING',     sev: 'info' },
  extreme_low_key:                 { label: 'EXTREME LOW KEY',    sev: 'info' },
};

const SPEC_UP   = '0px 1px 3px 0px rgba(0,0,0,0.35), inset 0px 0.5px 0px 0px rgba(255,255,255,0.03)';
const SPEC_DOWN = 'inset 0px 2px 4px rgba(0,0,0,0.5), inset 0px 1px 2px rgba(0,0,0,0.3)';

// ─── Distance range → midpoint (ft) ──────────────────────────────────────────
// Parses strings like "4-8 ft" / "4–8 ft" / "6 ft" / "< 2 ft" into a numeric
// midpoint in feet. Returns null when no number can be extracted.
function parseDistanceMid(distRange) {
  if (distRange == null) return null;
  // Normalize en-dash/em-dash to hyphen, strip non-numeric/dot/hyphen
  const s = String(distRange).replace(/[\u2013\u2014]/g, '-').toLowerCase();
  const nums = s.match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length === 0) return null;
  const n = nums.map(Number).filter(Number.isFinite);
  if (n.length === 0) return null;
  if (n.length === 1) return n[0];
  return (n[0] + n[1]) / 2;
}

// ─── Key-light height measurement estimate ───────────────────────────────────
// Combines the engine's height *class* with the measured subject distance to
// produce an approximate vertical height range in feet. Physics:
//   height_above_eyeline = distance_ft × tan(elevation_deg)
// Assumes an average subject eye height of 5.5 ft. The elevation angle per
// class is the traditional studio midpoint; tolerance ±0.6 ft expresses the
// inherent uncertainty in a categorical → numeric conversion.
const HEIGHT_CLASS_ELEV_DEG = {
  low:                -10,
  eye_level:            0,
  slightly_above_eye:  15,
  high:                30,
  overhead:            55,
};
function estimateKeyHeightFt(heightClass, distanceFt, elevationDeg) {
  if (distanceFt == null) return null;
  const d = Number(distanceFt);
  if (!Number.isFinite(d) || d <= 0) return null;
  // Prefer numeric elevation from catchlight (direct measurement) over
  // categorical height class (bucketed from shadow length).
  let elev = null;
  if (typeof elevationDeg === 'number' && Number.isFinite(elevationDeg)) {
    elev = elevationDeg;
  } else if (heightClass) {
    const key = String(heightClass).trim().toLowerCase();
    elev = HEIGHT_CLASS_ELEV_DEG[key] ?? null;
  }
  if (elev == null) return null;
  const subjectEyeFt = 5.5;
  const deltaFt = d * Math.tan(elev * Math.PI / 180);
  const totalFt = subjectEyeFt + deltaFt;
  if (!Number.isFinite(totalFt)) return null;
  // Tighter tolerance when using catchlight-derived angle (±0.3 ft)
  // vs categorical class (±0.6 ft)
  const tol = typeof elevationDeg === 'number' ? 0.3 : 0.6;
  const lo = Math.max(1, totalFt - tol);
  const hi = totalFt + tol;
  return `~${lo.toFixed(1)}–${hi.toFixed(1)} ft`;
}

// ─── Row label ───────────────────────────────────────────────────────────────
function RowLabel({ children }) {
  return (
    <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: steel(0.65), letterSpacing: '1px', ...FONT_SMOOTH }}>
      {children}
    </p>
  );
}

// ─── Inset text field ────────────────────────────────────────────────────────
function InsetField({ label, value, onChange, placeholder, multiline }) {
  const [focused, setFocused] = useState(false);
  const Tag = multiline ? 'textarea' : 'input';
  return (
    <div style={{ marginBottom: 20 }}>
      <RowLabel>{label}</RowLabel>
      <Tag
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={multiline ? 3 : undefined}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          display: 'block', width: '100%', marginTop: 8,
          padding: '12px 14px', backgroundColor: C.fieldBg,
          border: 'none', borderRadius: 10,
          boxShadow: focused ? FIELD_SHADOW_FOCUS : FIELD_SHADOW,
          color: C.textPrimary, fontSize: 14, fontWeight: 500,
          fontFamily: 'inherit', resize: multiline ? 'none' : undefined,
          outline: 'none', boxSizing: 'border-box',
          transition: 'box-shadow 0.18s ease', ...FONT_SMOOTH,
        }}
      />
    </div>
  );
}

// ─── Spec value with optional long-press reveal ──────────────────────────────
// When `alwaysRevealed` is true, the secondary line is shown immediately and
// the long-press gesture is disabled (used for specs where hiding the sub
// behind a HOLD would bury important data, e.g. optimal distance, off-axis
// angle, estimated key-light height).
function LongPressSpec({ label, value, secondary, secondaryColor, alwaysRevealed = false }) {
  const [revealed, setRevealed] = useState(false);
  const [pressed, setPressed] = useState(false);
  const timerRef = useRef(null);
  const hasSecret = !!secondary;
  const interactive = hasSecret && !alwaysRevealed;
  const showSecondary = hasSecret && (alwaysRevealed || revealed);

  const start = useCallback(() => {
    setPressed(true);
    if (interactive) {
      timerRef.current = setTimeout(() => {
        setRevealed(true);
        longPressHaptic();
      }, 500);
    }
  }, [interactive]);

  const end = useCallback(() => {
    setPressed(false);
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <div
      onPointerDown={interactive ? start : undefined}
      onPointerUp={interactive ? end : undefined}
      onPointerLeave={interactive ? end : undefined}
      onContextMenu={interactive ? (e) => e.preventDefault() : undefined}
      style={{
        flex: 1, minWidth: 0, borderRadius: 8,
        padding: '10px 12px',
        backgroundColor: pressed ? 'rgba(0,0,0,0.25)' : hasSecret ? 'rgba(0,0,0,0.08)' : 'transparent',
        boxShadow: pressed ? SPEC_DOWN : hasSecret ? SPEC_UP : 'none',
        transition: 'all 0.15s ease',
        cursor: interactive ? 'pointer' : 'default',
        WebkitTapHighlightColor: 'transparent',
        WebkitUserSelect: 'none', userSelect: 'none',
      }}
    >
      <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: steel(0.55), letterSpacing: '1px', ...FONT_SMOOTH }}>{label}</p>
      <p style={{ margin: '4px 0 0', fontSize: 16, fontWeight: 700, color: C.textPrimary, lineHeight: 1.2, ...FONT_SMOOTH, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{value}</p>
      {showSecondary && (
        <p style={{ margin: '3px 0 0', fontSize: 13, fontWeight: 600, color: secondaryColor || C.confHigh, ...FONT_SMOOTH }}>
          {secondary}
        </p>
      )}
      {interactive && !revealed && (
        <p style={{ margin: '3px 0 0', fontSize: 10, fontWeight: 500, color: steel(0.50), letterSpacing: '0.5px', ...FONT_SMOOTH }}>
          HOLD
        </p>
      )}
    </div>
  );
}

// ─── Viewfinder icon ─────────────────────────────────────────────────────────
function ViewfinderIcon({ color }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M1 5V1.5C1 1.22 1.22 1 1.5 1H5M13 1h3.5c.28 0 .5.22.5.5V5M17 13v3.5a.5.5 0 01-.5.5H13M5 17H1.5a.5.5 0 01-.5-.5V13"
        stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="9" cy="9" r="1.5" fill={color} />
    </svg>
  );
}

// ─── Light role card (per-light mini card for multi-light setups) ───────────
function LightRoleCard({ roleKey, role }) {
  const color = ROLE_COLORS[roleKey] || steel(0.6);
  const label = ROLE_LABELS[roleKey] || roleKey.toUpperCase();
  const conf  = Math.round((role.confidence || 0) * 100);
  const primaryEvidence = Array.isArray(role.evidence) && role.evidence.length > 0
    ? role.evidence[0] : null;
  return (
    <div style={{
      flexShrink: 0, minWidth: 140, maxWidth: 180,
      borderRadius: 10, backgroundColor: C.panelBg,
      boxShadow: `${PANEL_SHADOW}, ${PANEL_BEVEL}`,
      padding: '10px 12px 12px 14px', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', left: 0, top: 6, bottom: 6, width: 2.5,
        borderRadius: 1.5, backgroundColor: color,
      }} />
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color, letterSpacing: '1px', ...FONT_SMOOTH }}>
          {label}
        </span>
        <span style={{ fontSize: 11, fontWeight: 600, color: steel(0.55), letterSpacing: '0.5px', ...FONT_SMOOTH }}>
          {conf}%
        </span>
      </div>
      {primaryEvidence && (
        <p style={{
          margin: '4px 0 0', fontSize: 12, fontWeight: 500, lineHeight: 1.35,
          color: C.textSubBold, ...FONT_SMOOTH,
        }}>
          {primaryEvidence}
        </p>
      )}
    </div>
  );
}

function LightRoleStrip({ roles }) {
  if (!roles || roles.length === 0) return null;
  return (
    <div style={{
      borderRadius: 8, padding: '6px 6px',
      backgroundColor: C.wellBg, boxShadow: RING_TRACK_SHADOW,
      position: 'relative',
    }}>
      <div style={{
        display: 'flex', gap: 8, overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none', msOverflowStyle: 'none',
      }}>
        {roles.map(r => <LightRoleCard key={r.roleKey} roleKey={r.roleKey} role={r.role} />)}
      </div>
      <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 24, borderRadius: '0 10px 10px 0', background: 'linear-gradient(to right, transparent, #050507)', pointerEvents: 'none' }} />
    </div>
  );
}

// ─── Warning strip ───────────────────────────────────────────────────────────
// Chip itself now lives in _shared/Chip.jsx. Keep a thin WarningChip alias so
// the existing call sites read naturally.
function WarningChip({ label, sev }) {
  return <Chip label={label} variant={sevToVariant(sev)} size="sm" />;
}

function WarningStrip({ warnings }) {
  if (!warnings || warnings.length === 0) return null;
  return (
    <div style={{
      borderRadius: 10, padding: '8px 10px',
      backgroundColor: C.wellBg, boxShadow: RING_TRACK_SHADOW,
      position: 'relative',
    }}>
      <div style={{
        display: 'flex', gap: 6, overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none', msOverflowStyle: 'none',
      }}>
        {warnings.map((w, i) => (
          <WarningChip key={i} label={w.label} sev={w.sev} />
        ))}
      </div>
      <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 20, borderRadius: '0 10px 10px 0', background: 'linear-gradient(to right, transparent, #050507)', pointerEvents: 'none' }} />
    </div>
  );
}

// ─── Desktop spec cell ───────────────────────────────────────────────────────
// Engraved inset pill used exclusively by the desktop KEY LIGHT hero panel.
// Larger typography and generous padding compared with mobile LongPressSpec
// because desktop readers sit further from the screen and nothing here needs
// to be tappable. No long-press / hover reveals — all values are primary.
function DesktopSpec({ label, value, hint, hintColor }) {
  return (
    <div style={{
      padding: '12px 14px',
      borderRadius: 10,
      backgroundColor: C.trackBg,
      boxShadow: 'inset 1px 1px 3px 0px rgba(0,0,0,0.55), inset -0.5px -0.5px 0.5px 0px rgba(255,255,255,0.035)',
      minWidth: 0,
    }}>
      <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: steel(0.55), letterSpacing: '1.1px', ...FONT_SMOOTH }}>
        {label}
      </p>
      <p style={{ margin: '5px 0 0', fontSize: 15, fontWeight: 700, color: SM_C.textPrimary, lineHeight: 1.2, textShadow: '0 1px 0 rgba(0,0,0,0.5)', ...FONT_SMOOTH }}>
        {value}
      </p>
      {hint && (
        <p style={{ margin: '3px 0 0', fontSize: 12, fontWeight: 500, color: hintColor || steel(0.55), letterSpacing: '0.3px', ...FONT_SMOOTH }}>
          {hint}
        </p>
      )}
    </div>
  );
}

// PullTabDrawer is imported from `_shared/PullTabDrawer` so SetupScreen +
// ResultScreen share the same tactile pullout vocabulary.  Tokens live in
// theme/studioMatte under the DRAWER_* exports.

// ─── IrisCoverageScale ──────────────────────────────────────────────────────────
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

  // Map % iris (0–400+) to a 0–1 ruler position — supports 72"+ XL modifiers
  const RULER_MAX = 400;
  const ruler = Math.max(0, Math.min(1, pct / RULER_MAX));

  const bands = [
    { label: 'TINY',   start: 0,   end: 25,  color: 'rgba(245,190,72,0.20)' },
    { label: 'SMALL',  start: 25,  end: 50,  color: 'rgba(245,190,72,0.32)' },
    { label: 'MEDIUM', start: 50,  end: 100, color: 'rgba(245,190,72,0.48)' },
    { label: 'LARGE',  start: 100, end: 200, color: 'rgba(245,190,72,0.65)' },
    { label: 'HUGE',   start: 200, end: 350, color: 'rgba(245,190,72,0.82)' },
    { label: 'XL',     start: 350, end: 400, color: 'rgba(245,190,72,0.92)' },
  ];

  const bandFor = (v) => bands.find((b) => v >= b.start && v < b.end) || bands[bands.length - 1];
  const activeBand = bandFor(pct);

  return (
    <div style={{
      marginTop: 10, marginBottom: 10,
      padding: '10px 12px 8px',
      borderRadius: 10,
      backgroundColor: C.pillBg,
      boxShadow: 'inset 1px 1px 3px rgba(0,0,0,0.55), inset -0.5px -0.5px 0.5px rgba(255,255,255,0.035)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: steel(0.58), letterSpacing: '0.9px', ...FONT_SMOOTH }}>
          IRIS COVERAGE
        </p>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(245,210,140,0.85)', letterSpacing: '0.4px', ...FONT_SMOOTH }}>
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
        <span style={{ fontSize: 16, fontWeight: 800, color: 'rgba(245,210,140,0.95)', textShadow: '0 1px 3px rgba(0,0,0,0.6)', letterSpacing: '0.4px', ...FONT_SMOOTH }}>
          {pct.toFixed(1)}<span style={{ fontSize: 11, fontWeight: 700, color: steel(0.62), marginLeft: 3 }}>% iris</span>
        </span>
        {angularArea && (
          <span style={{ fontSize: 12, fontWeight: 600, color: steel(0.55), letterSpacing: '0.3px', ...FONT_SMOOTH }}>
            {angularArea}
          </span>
        )}
      </div>
    </div>
  );
}

export default function SetupScreen({ result, imagePreview, onSave, onCancel, onStartCockpit, onRoomPlanner, isPaid = false, plan = 'free' }) {
  const isDesktop = useIsDesktop();
  const [setupName, setSetupName] = useState('');
  const [notes, setNotes] = useState('');
  const [savePressed, setSavePressed] = useState(false);
  const [drawers, setDrawers] = useState(() =>
    isDesktop ? { setupGuide: true, save: true } : {}
  );
  const [viewfinderOpen, setViewfinderOpen] = useState(false);
  const [heroFlipped, setHeroFlipped] = useState(false);
  const [thumbZoomed, setThumbZoomed] = useState(false);
  const [modeSheetOpen, setModeSheetOpen] = useState(false);
  const [selectedMode, setSelectedMode] = useState('photographer');
  const [saved, setSaved] = useState(false);
  const [diagramView, setDiagramView] = useState('top'); // 'top' | 'side'
  const [diagramZoomed, setDiagramZoomed] = useState(false);

  const flipHero = () => { setHeroFlipped(p => !p); softClickSound(); tapHaptic(); };
  const openThumb = () => { setThumbZoomed(true); panelToggleSound(); tapHaptic(); };
  const closeThumb = () => { setThumbZoomed(false); softClickSound(); };
  const toggleDrawer = (id) => { setDrawers(p => ({ ...p, [id]: !p[id] })); panelToggleSound(); tapHaptic(); };
  const openViewfinder = () => { setViewfinderOpen(true); panelToggleSound(); tapHaptic(); };
  const closeViewfinder = () => { setViewfinderOpen(false); softClickSound(); };

  const isHighConf = result && result.confidence >= 70;
  const confColor  = isHighConf ? C.confHigh : C.confLow;
  const defaultName = result?.pattern ? `${result.pattern} Setup` : 'Untitled Setup';
  const mod = result?.sections?.modifier;
  const raw = result?._raw || {};
  const li  = raw.lighting_inference || {};
  const faceCrop = getFaceCropPosition(raw);

  // Recreation setup — practical placement + camera guidance from the engine's
  // Layer 7 blueprint synthesis.  These are the actionable "how to build it"
  // instructions: key placement angle, fill strategy, camera settings.
  const rs           = raw.reference_analysis?.recreation_setup || {};
  // Engine values arrive as natural-language phrases but occasionally leak
  // snake_case tokens (e.g. "camera_left"). Run every display value through
  // prettify so the UI never shows underscores. Hyphenated ranges like
  // "85-135mm" and "f/2.8-5.6" stay untouched — those are numeric ranges
  // that must keep their hyphen, so we apply prettify only to fields that
  // are narrative strings.
  const rsPlacement  = prettify(rs.key_placement)     || null;
  const rsFill       = prettify(rs.fill_strategy)     || null;
  const rsBg         = prettify(rs.background_strategy) || null;
  const rsFocal      = rs.focal_length    || null;  // keep "85-135mm"
  const rsAperture   = rs.aperture        || null;  // keep "f/2.8-5.6"
  const rsCamGuide   = prettify(rs.camera_subject_guidance) || null;
  const rsNotes      = Array.isArray(rs.setup_notes)
    ? rs.setup_notes.map(n => prettify(n)).filter(Boolean)
    : [];

  // Avoid "Large Large Octabox" — skip sizeLabel when family already includes it
  const modFamily = prettify(mod?.family) || 'Modifier';
  const modName = mod
    ? (mod.sizeLabel && !modFamily.toLowerCase().startsWith(mod.sizeLabel.toLowerCase())
        ? `${mod.sizeLabel} ${modFamily}` : modFamily)
    : null;
  const positionDisplay = prettify(mod?.position || li.key_position_text) || null;
  const keySide = li.key_side;
  // Engine sends keySide as snake_case tokens like "upper_right" — run through
  // prettify so the UI never shows underscores and each word is Title Cased.
  const directionDisplay = keySide && keySide !== 'unknown'
    ? (keySide || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    : null;
  const elevation = li.key_elevation;
  const elevDisplay = (() => {
    if (!elevation) return null;
    if (typeof elevation === 'string') {
      const s = elevation.trim().toLowerCase();
      if (['high', 'medium', 'low'].includes(s)) return s.charAt(0).toUpperCase() + s.slice(1);
      return elevation;
    }
    if (typeof elevation === 'number') {
      if (elevation >= 0.66) return 'High';
      if (elevation >= 0.33) return 'Medium';
      return 'Low';
    }
    return null;
  })();


  const compactSummary = [modName, positionDisplay, mod?.distRange].filter(Boolean).join(' · ');

  // ── Multi-light roles (present lights only, ordered: key, fill, rim, kicker, bounce, bg, neg) ──
  const ROLE_ORDER = ['key', 'fill', 'rim', 'kicker', 'bounce', 'background', 'negative_fill', 'unknown_secondary'];
  const presentRoles = (() => {
    const rolesObj = raw.reconstruction?.light_roles || {};
    const out = [];
    ROLE_ORDER.forEach(k => {
      const r = rolesObj[k];
      if (r && r.present) out.push({ roleKey: k, role: r });
    });
    return out;
  })();

  // ── Key light numerics ──
  const keyAngleDeg = raw.reconstruction?.key_light_angle_deg;
  const keyAngleDisplay = (typeof keyAngleDeg === 'number')
    ? `${keyAngleDeg.toFixed(0)}° off-axis` : null;
  const keyHeight = raw.reconstruction?.key_light_height;
  const _keyElevAbove = raw.reconstruction?.key_elevation_above_eye_deg;
  const keyHeightDisplay = (() => {
    // Prefer numeric elevation from catchlight when available
    if (typeof _keyElevAbove === 'number' && Number.isFinite(_keyElevAbove)) {
      if (_keyElevAbove > 45) return 'High';
      if (_keyElevAbove > 20) return 'Medium-High';
      if (_keyElevAbove > 5) return 'Slightly Above Eye';
      if (_keyElevAbove > -5) return 'Eye Level';
      return 'Low';
    }
    if (!keyHeight) return null;
    return typeof keyHeight === 'string'
      ? keyHeight.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      : String(keyHeight);
  })();

  // Height measurement estimate — combines height class with measured distance.
  // Prefers engine-computed numeric distance (modifier_distance_ft) over the
  // range-string midpoint so the estimate tracks the solver's actual value.
  const distanceFtNumeric = (typeof raw.reconstruction?.modifier_distance_ft === 'number')
    ? raw.reconstruction.modifier_distance_ft
    : (typeof raw.reconstruction?.estimated_source_distance_ft === 'number')
      ? raw.reconstruction.estimated_source_distance_ft
      : parseDistanceMid(mod?.distRange);
  const keyElevDeg = raw.reconstruction?.key_elevation_above_eye_deg;
  const keyHeightMeasurement = estimateKeyHeightFt(keyHeight, distanceFtNumeric, keyElevDeg);

  // ── CCT / color temperature ──
  const cctDetected = li.detected_cct_kelvin;
  const cctDominant = raw.reconstruction?.dominant_cct_kelvin;
  const cctDisplay  = cctDetected ? `${cctDetected}K` : cctDominant ? `${cctDominant}K` : null;
  const cctMixed    = !!raw.reconstruction?.mixed_lighting;

  // ── Fill method + background light ──
  const fillMethod  = (li.fill_method_text || '').trim();
  const bgDetected  = !!li.background_light_detected;
  const bgDistance  = raw.reconstruction?.background_distance_ft;

  // ── Warnings: edge-case flags + solver physics violations ──
  const warnings = (() => {
    const out = [];
    const flags = raw.edge_case_flags || {};
    Object.keys(EDGE_CASE_LABELS).forEach(k => {
      if (flags[k]) out.push(EDGE_CASE_LABELS[k]);
    });
    const phys = raw.solver?.physics_violations;
    if (Array.isArray(phys)) {
      phys.forEach(v => {
        const text = typeof v === 'string' ? v : v?.message || v?.type;
        if (text) out.push({ label: String(text).toUpperCase().slice(0, 28), sev: 'warn' });
      });
    }
    const nrr = raw.solver?.needs_review_reasons;
    if (Array.isArray(nrr)) {
      nrr.forEach(r => {
        const text = typeof r === 'string' ? r : r?.reason || r?.type;
        if (text) out.push({ label: `REVIEW: ${String(text).toUpperCase().slice(0, 22)}`, sev: 'warn' });
      });
    }
    // Setup only surfaces blocking warnings — Result owns the full set.
    // Filter to danger severity only so Setup stays focused on actionable issues.
    // Normalize 'warning' → 'warn' (engine emits both forms).
    return out
      .map(w => w.sev === 'warning' ? { ...w, sev: 'warn' } : w)
      .filter(w => w.sev === 'danger');
  })();

  const handleSave = useCallback(() => {
    if (saved) return;
    const name = setupName.trim() || defaultName;
    softClickSound(); successHaptic();
    // Persist locally (syncs to server when signed in)
    try {
      persistSetup({ name, tag: 'personal', result });
    } catch { /* quota or private mode — still fire onSave */ }
    trackEvent('SETUP_SAVED', { name, pattern: result?.pattern, confidence: result?.confidence });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    // Notify parent (keeps existing save payload shape for compatibility)
    onSave?.({ name, notes, timestamp: new Date().toISOString(),
      pattern: result?.pattern, confidence: result?.confidence,
      modifier: result?.sections?.catchlightModifier });
  }, [saved, setupName, notes, defaultName, result, onSave]);

  const [cockpitLaunchedThisSetup, setCockpitLaunchedThisSetup] = useState(false);
  const handleStartCockpit = useCallback(() => {
    softClickSound(); tapHaptic();
    // First tap on this setup: always show the role picker so the
    // photographer can choose their cockpit mode. Subsequent taps
    // (e.g. after returning from cockpit) skip it using the saved role.
    const savedRole = loadShootRole();
    if (savedRole && cockpitLaunchedThisSetup) {
      setSelectedMode(savedRole);
      trackEvent('SETUP_START_COCKPIT', {
        pattern: result?.pattern, mode: savedRole, skippedPicker: true,
      });
      onStartCockpit?.(savedRole);
      return;
    }
    if (savedRole) setSelectedMode(savedRole);
    trackEvent('SETUP_MODE_PICKER_OPENED', {
      pattern: result?.pattern, confidence: result?.confidence,
    });
    setModeSheetOpen(true);
  }, [result, onStartCockpit, cockpitLaunchedThisSetup]);

  const handleConfirmMode = useCallback(() => {
    successHaptic(); softClickSound();
    setCockpitLaunchedThisSetup(true);
    saveShootRole(selectedMode);
    trackEvent('SETUP_START_COCKPIT', {
      pattern: result?.pattern, mode: selectedMode,
    });
    setModeSheetOpen(false);
    onStartCockpit?.(selectedMode);
  }, [selectedMode, result, onStartCockpit]);

  const handleCloseSheet = useCallback(() => {
    navHaptic(); softClickSound();
    setModeSheetOpen(false);
  }, []);

  const handleCancel = useCallback(() => { navHaptic(); navSlideSound(); onCancel(); }, [onCancel]);

  // ── Swipe-back gesture — swipe from left edge navigates back to Results ──
  // Same pattern as ResultScreen: touch starting within 24px of left edge,
  // rightward drag > 80px fires onCancel() to go back.
  const swipeBackStartX = useRef(null);
  const swipeBackStartY = useRef(null);
  const [swipeBackProgress, setSwipeBackProgress] = useState(0);
  const handleSwipeBackStart = useCallback((e) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    if (t.clientX < 24) {
      swipeBackStartX.current = t.clientX;
      swipeBackStartY.current = t.clientY;
    }
  }, []);
  const handleSwipeBackMove = useCallback((e) => {
    if (swipeBackStartX.current == null || e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - swipeBackStartX.current;
    const dy = Math.abs(t.clientY - swipeBackStartY.current);
    if (dy > dx) { swipeBackStartX.current = null; setSwipeBackProgress(0); return; }
    setSwipeBackProgress(Math.min(1, dx / 100));
  }, []);
  const handleSwipeBackEnd = useCallback(() => {
    if (swipeBackProgress > 0.8) {
      navHaptic(); navSlideSound();
      onCancel();
    }
    swipeBackStartX.current = null;
    swipeBackStartY.current = null;
    setSwipeBackProgress(0);
  }, [swipeBackProgress, onCancel]);

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: '#000', overflow: 'hidden' }}>
    {/* Swipe-back edge hint — left edge glow (matches ResultScreen) */}
    {swipeBackProgress > 0 && (
      <div style={{
        position: 'fixed', top: 0, bottom: 0, left: 0,
        width: 24,
        background: `radial-gradient(circle at 0px 50%, rgba(245,247,250,${0.22 * swipeBackProgress}) 0%, rgba(245,247,250,${0.06 * swipeBackProgress}) 120px, transparent 240px)`,
        zIndex: 200,
        pointerEvents: 'none',
        transition: 'opacity 0.1s ease',
      }} />
    )}
    <div
      onTouchStart={(e) => { handleSwipeBackStart(e); if (e.target === e.currentTarget) grainHaptic(); }}
      onTouchMove={handleSwipeBackMove}
      onTouchEnd={handleSwipeBackEnd}
      style={{
      width: '100%', maxWidth: isDesktop ? 'min(96vw, 1400px)' : undefined, height: '100%', margin: '0 auto',
      backgroundColor: C.bg,
      display: 'flex', flexDirection: 'column', overflowY: 'auto',
      position: 'relative', fontFamily: 'Inter, system-ui, sans-serif',
    }}>

      <MatteBackground variant="subdued" />

      {/* ─── Full-bleed photo hero — matches Home/Processing/Result ─── */}
      {!isDesktop && imagePreview && (
        <div style={{
          position: 'relative', width: '100%',
          height: Math.round((typeof window !== 'undefined' ? window.innerHeight : 844) * 0.55),
          overflow: 'hidden', flexShrink: 0,
        }}>
          <img src={imagePreview} alt="" style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', objectPosition: faceCrop || '50% 25%',
            opacity: 0.85,
          }} />
          {/* Bottom gradient */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: 120,
            background: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.60) 40%, rgba(0,0,0,0.95) 100%)',
          }} />
          {/* Back chevron on hero */}
          <button aria-label="Back" onClick={handleCancel} style={{
            position: 'absolute', top: 48, left: 8, width: 44, height: 44, zIndex: 10,
            background: 'none', border: 'none', cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
          }}>
            <span style={{ fontSize: 22, color: C.textMeta, lineHeight: 1, ...FONT_SMOOTH }}>‹</span>
          </button>
          {/* Pattern name + confidence overlaid on hero */}
          {result && (
            <div style={{ position: 'absolute', bottom: 16, left: 24, right: 24, zIndex: 5 }}>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: steel(0.55), letterSpacing: '1.2px', ...FONT_SMOOTH }}>
                LIGHTING PATTERN
              </p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                <p style={{ margin: '2px 0 0', fontSize: 26, fontWeight: 800, color: C.textPrimary, letterSpacing: '-0.3px', ...FONT_SMOOTH }}>
                  {result.pattern}
                </p>
                {result.confidence != null && (
                  <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: result.confidence >= 70 ? C.confHigh : C.confLow, ...FONT_SMOOTH }}>
                    {Math.round(result.confidence)}%
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Nav bar — desktop or no image fallback ─── */}
      {(isDesktop || !imagePreview) && (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: isDesktop ? '56px 40px 0' : '56px 20px 0', position: 'relative', zIndex: 1,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button aria-label="Back" onClick={handleCancel} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '10px 12px 10px 0', display: 'flex', alignItems: 'center',
            WebkitTapHighlightColor: 'transparent',
            minWidth: 44, minHeight: 44,
          }}>
            <span style={{ fontSize: 22, color: C.textMeta, lineHeight: 1, ...FONT_SMOOTH }}>‹</span>
          </button>
          <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: steel(0.65), letterSpacing: '1.2px', ...FONT_SMOOTH }}>
            LIGHTING SETUP
          </p>
        </div>
        {result?._raw && (
          <button onClick={openViewfinder} aria-label="View original photo" style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: 6, borderRadius: 6, display: 'flex', alignItems: 'center',
            WebkitTapHighlightColor: 'transparent',
            transition: 'background-color 0.15s ease',
          }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
          >
            <ViewfinderIcon color={steel(0.5)} />
          </button>
        )}
      </div>
      )}

      {/* ─── Content ─── */}
      <div style={{
        padding: isDesktop ? '16px 40px 40px' : '16px 22px 40px',
        flex: 1,
        display: 'flex', flexDirection: 'column',
        gap: 14,
        position: 'relative', zIndex: 1,
      }}>

        {/* ── Result header — hidden on mobile when full-bleed hero is showing ── */}
        {result && (isDesktop || !imagePreview) && (
          <div style={{
            borderRadius: 14, backgroundColor: C.panelBg,
            boxShadow: `${PANEL_SHADOW}, ${PANEL_BEVEL}`,
            padding: isDesktop ? '16px 24px' : '10px 16px',
            display: 'flex', alignItems: 'center', gap: isDesktop ? 18 : 12,
            position: 'relative',
            width: '100%',
          }}>
            <div style={{ position: 'absolute', inset: 0, borderRadius: 14, pointerEvents: 'none', boxShadow: PANEL_BEVEL, zIndex: 10 }} />
            {imagePreview && (
              <button
                type="button"
                onClick={openThumb}
                aria-label="Zoom photo"
                style={{
                  width: 42, height: 42, borderRadius: 8, flexShrink: 0,
                  overflow: 'hidden', boxShadow: '0px 2px 6px rgba(0,0,0,0.5)',
                  padding: 0, border: 'none', background: 'none', cursor: 'zoom-in',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <img src={imagePreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: faceCrop, display: 'block' }} />
              </button>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 20, fontWeight: 800, color: C.textPrimary, lineHeight: 1.1, letterSpacing: '-0.3px', ...FONT_SMOOTH }}>
                {result.pattern}
              </p>
              {result.sections?.sceneDescription && (
                <p style={{
                  margin: '4px 0 0', fontSize: 11, fontWeight: 400, color: C.textDim,
                  lineHeight: 1.3, ...FONT_SMOOTH,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {result.sections.sceneDescription}
                </p>
              )}
            </div>
            <div style={{
              padding: '4px 10px', borderRadius: 8, flexShrink: 0,
              backgroundColor: isHighConf ? 'rgba(72,186,136,0.10)' : 'rgba(245,190,72,0.10)',
              boxShadow: 'inset 1px 1px 2px 0px rgba(0,0,0,0.15)',
            }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: confColor, ...FONT_SMOOTH }}>
                {result.confidence}%
              </span>
            </div>
          </div>
        )}

        {/* ── Desktop two-column wrapper ─────────────────────────────
            On desktop the flip-card hero sits in a fixed 540px left column
            while the supporting panels (roles, camera, chips, checklist,
            drawers) fill a flexible right column. On mobile both wrappers
            use `display: contents` so their children flatten back into the
            single flex column and mobile rendering is byte-identical. */}
        <div style={isDesktop ? {
          display: 'grid',
          // Hero column widened from 540 → 620 so the LCD lighting diagram
          // reads at a real diagnostic size rather than a thumbnail.  The
          // right column stays fluid (1180 − 620 − 20 gap = 540 min).
          gridTemplateColumns: 'minmax(420px, 0.40fr) minmax(0, 1fr)',
          gap: 28,
          alignItems: 'start',
        } : { display: 'contents' }}>
        <div style={isDesktop ? {
          // Hero column cap — raised from 540 → 620 to let the diagram well
          // breathe.  FitToViewport scales down if the full stack exceeds
          // the 920 design viewport, so a slightly taller hero panel is
          // safe and gives us much more room for the zoomed diagram.
          display: 'flex', flexDirection: 'column', gap: 12,
          paddingRight: 6,
        } : { display: 'contents' }}>

        {/* ── Warning strip — blocking only (Result owns the full set) ── */}
        {warnings && warnings.length > 0 && (
          <WarningStrip warnings={warnings} />
        )}

        {/* ── Key Light hero — flip card (specs ↔ diagram) — MOBILE ONLY ──
            Desktop renders a static hero panel below instead, so specs and
            diagram are visible simultaneously. The flip metaphor exists to
            compress both faces into phone-sized real estate; on desktop
            that compression is a handicap, not a feature. */}
        {result && !isDesktop && (modName || positionDisplay || result._raw) && (
          <div style={{ perspective: 1200 }} role="button" aria-label="Flip card to view diagram" tabIndex={0} onClick={flipHero} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flipHero(); } }}>
            <div style={{
              transformStyle: 'preserve-3d',
              transform: heroFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
              transition: 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
              position: 'relative',
            }}>
              {/* ── FRONT — specs ── */}
              <div style={{
                backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden',
                borderRadius: 14, backgroundColor: C.panelBg,
                boxShadow: `${PANEL_SHADOW}, ${PANEL_BEVEL}`,
                overflow: 'hidden', position: 'relative',
              }}>
                <div style={{ position: 'absolute', inset: 0, borderRadius: 14, pointerEvents: 'none', boxShadow: PANEL_BEVEL, zIndex: 10 }} />
                <div style={{ position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, borderRadius: 1.5, backgroundColor: KEY_ACCENT, zIndex: 5 }} />

                <div style={{ padding: '12px 18px 0' }}>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: KEY_ACCENT, letterSpacing: '1.4px', ...FONT_SMOOTH }}>
                    KEY LIGHT
                  </p>
                </div>

                {/* Hero modifier emission — sized for visual impact */}
                {mod?.family && (
                  <div style={{ display: 'flex', justifyContent: 'center', margin: '10px 0 4px' }}>
                    <ModifierEmission family={mod.family} size={88} />
                  </div>
                )}

                {modName ? (
                  <div style={{ padding: '4px 18px 0', textAlign: mod?.family ? 'center' : 'left' }}>
                    <p style={{ margin: 0, fontSize: 19, fontWeight: 700, color: C.textPrimary, lineHeight: 1.15, letterSpacing: '-0.2px', ...FONT_SMOOTH }}>{modName}</p>
                    {mod?.sizeRange && (
                      <p style={{ margin: '3px 0 0', fontSize: 13, fontWeight: 500, color: C.textDim, ...FONT_SMOOTH }}>{mod.sizeRange}</p>
                    )}
                  </div>
                ) : result.sections?.catchlightModifier ? (
                  <div style={{ padding: '6px 20px 0' }}>
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: C.textPrimary, lineHeight: 1.3, ...FONT_SMOOTH }}>
                      {result.sections.catchlightModifier}
                    </p>
                  </div>
                ) : null}

                {/* L-4: Simplified 2×2 recipe grid — Distance, Direction, Height, Fill.
                    Only the photographer's essential "where to put it" specs.
                    Everything else (position, placement, iris coverage, guidance)
                    lives on the back face or SETUP GUIDE drawer. */}
                <div onClick={(e) => e.stopPropagation()} style={{ padding: '10px 16px 12px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {mod?.distRange && (
                      <LongPressSpec
                        label="DISTANCE"
                        value={mod.distRange}
                        alwaysRevealed
                      />
                    )}
                    {(directionDisplay || positionDisplay) && (
                      <LongPressSpec
                        label="DIRECTION"
                        value={directionDisplay || positionDisplay}
                        secondary={keyAngleDisplay}
                        secondaryColor={KEY_ACCENT}
                        alwaysRevealed
                      />
                    )}
                    {keyHeightDisplay && (
                      <LongPressSpec
                        label="HEIGHT"
                        value={keyHeightDisplay}
                        alwaysRevealed
                      />
                    )}
                    {rsFill && (
                      <LongPressSpec
                        label="FILL"
                        value={rsFill}
                        alwaysRevealed
                      />
                    )}
                  </div>
                </div>

                {/* Flip hint */}
                <div style={{
                  padding: '4px 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                }}>
                  <span style={{ fontSize: 11, opacity: 0.4, lineHeight: 1 }}>&#x21BB;</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: steel(0.5), letterSpacing: '1px', ...FONT_SMOOTH }}>
                    TAP FOR DIAGRAM
                  </span>
                </div>
              </div>

              {/* ── BACK — diagram + compact summary ── */}
              <div style={{
                backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden',
                transform: 'rotateY(180deg)',
                position: 'absolute', inset: 0,
                borderRadius: 14, backgroundColor: C.panelBg,
                boxShadow: `${PANEL_SHADOW}, ${PANEL_BEVEL}`,
                overflow: 'hidden',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{ position: 'absolute', inset: 0, borderRadius: 14, pointerEvents: 'none', boxShadow: PANEL_BEVEL, zIndex: 10 }} />
                <div style={{ position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, borderRadius: 1.5, backgroundColor: KEY_ACCENT, zIndex: 5 }} />

                <div style={{ padding: '10px 20px 0', alignSelf: 'stretch' }}>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: KEY_ACCENT, letterSpacing: '1.2px', ...FONT_SMOOTH }}>
                    SETUP DIAGRAM
                  </p>
                </div>

                <LightingDiagram result={result} compact />

                {compactSummary && (
                  <p style={{
                    margin: '2px 0 0', fontSize: 12, fontWeight: 500, color: C.textSub,
                    textAlign: 'center', ...FONT_SMOOTH,
                  }}>
                    {compactSummary}
                  </p>
                )}

                <div style={{ padding: '4px 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                  <span style={{ fontSize: 11, opacity: 0.4, lineHeight: 1 }}>&#x21BB;</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: steel(0.5), letterSpacing: '1px', ...FONT_SMOOTH }}>
                    TAP FOR SPECS
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Key Light hero — DESKTOP static panel ──
            Replaces the flip card on wide viewports with a single tall
            panel that shows the modifier identity, the full-size lighting
            diagram, and the complete spec grid simultaneously. Typography
            and padding are intentionally heavier than mobile — 15px spec
            values, 28px modifier title, 24px internal padding — so the
            panel reads natively at desktop viewing distances rather than
            looking like a stretched phone card. */}
        {/* ── Key Light hero — DESKTOP — diagram-dominant layout ──
            The diagram is the hero visual at desktop. Modifier identity sits
            in a compact header above it, and the spec grid sits below.
            Total height target: ~450px so the right column has room for
            coaching cards and the CTA stays in viewport at 1080p. */}
        {result && isDesktop && (modName || positionDisplay || result._raw) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Modifier identity bar — compact */}
            <div style={{
              borderRadius: 14, backgroundColor: C.panelBg,
              boxShadow: `${PANEL_SHADOW}, ${PANEL_BEVEL}`,
              padding: '12px 20px',
              position: 'relative', overflow: 'hidden',
              display: 'flex', alignItems: 'center', gap: 16,
            }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: 14, pointerEvents: 'none', boxShadow: PANEL_BEVEL, zIndex: 10 }} />
              <div style={{ position: 'absolute', left: 0, top: 8, bottom: 8, width: 3, borderRadius: 1.5, backgroundColor: KEY_ACCENT, zIndex: 5 }} />
              {mod?.family && (
                <div style={{
                  width: 56, height: 48, flexShrink: 0,
                  borderRadius: 10, backgroundColor: C.panelBg,
                  boxShadow: 'inset 0 -1px 2px rgba(0,0,0,0.2), inset 0 1px 2px rgba(255,255,255,0.04)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  overflow: 'hidden',
                }}>
                  <ModifierEmission family={mod.family} size={56} />
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: KEY_ACCENT, letterSpacing: '1.4px', ...FONT_SMOOTH }}>
                  KEY LIGHT
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 18, fontWeight: 700, color: C.textPrimary, lineHeight: 1.15, letterSpacing: '-0.2px', ...FONT_SMOOTH }}>
                  {modName || result.sections?.catchlightModifier || 'Modifier'}
                </p>
                {mod?.sizeRange && (
                  <p style={{ margin: '2px 0 0', fontSize: 11, fontWeight: 500, color: C.textDim, ...FONT_SMOOTH }}>{mod.sizeRange}</p>
                )}
              </div>
            </div>

            {/* Diagram well — LARGE, fills the column width. Click to zoom. */}
            {result._raw && (
              <div
                onClick={() => { setDiagramZoomed(true); tapHaptic(); }}
                style={{
                position: 'relative', width: '100%',
                aspectRatio: '16 / 9', maxHeight: 280,
                borderRadius: 14, backgroundColor: C.pillBg,
                boxShadow: 'inset 0px 2px 6px 0px rgba(0,0,0,0.55), inset 0px 1px 2px 0px rgba(0,0,0,0.4), inset 1px 0px 2px 0px rgba(0,0,0,0.3), inset -1px 0px 2px 0px rgba(0,0,0,0.3)',
                overflow: 'hidden', cursor: 'zoom-in',
              }}>
                <div style={{ position: 'absolute', inset: 0, padding: '16px 20px', display: 'flex', justifyContent: 'center', alignItems: 'stretch', zIndex: 1 }}>
                  {diagramView === 'top' ? (
                    <LightingDiagram result={result} fluid />
                  ) : (
                    <SideViewDiagram result={result} fluid />
                  )}
                </div>
                {/* View toggle — machined pill in top-right corner */}
                <div style={{ position: 'absolute', top: 10, right: 12, zIndex: 11, display: 'flex', pointerEvents: 'auto' }}>
                  {['top', 'side'].map(v => (
                    <button key={v} onClick={() => { setDiagramView(v); tapHaptic(); softClickSound(); }} style={{
                      padding: '4px 10px', border: 'none', cursor: 'pointer',
                      background: diagramView === v
                        ? 'linear-gradient(141.71deg, #2a2218 0%, #1c1810 100%)'
                        : 'linear-gradient(141.71deg, #14161c 0%, #0c0d10 100%)',
                      borderRadius: v === 'top' ? '6px 0 0 6px' : '0 6px 6px 0',
                      boxShadow: diagramView === v
                        ? `inset 0 1px 0 rgba(200,155,60,0.10), 0 0 0 0.5px rgba(200,155,60,0.20)`
                        : 'inset 0 1px 0 rgba(255,255,255,0.03)',
                      fontSize: 11, fontWeight: 700, letterSpacing: '0.8px',
                      color: diagramView === v ? KEY_ACCENT : steel(0.35),
                      WebkitTapHighlightColor: 'transparent', ...FONT_SMOOTH,
                    }}>{v === 'top' ? 'TOP' : 'SIDE'}</button>
                  ))}
                </div>
                <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: 14, pointerEvents: 'none', zIndex: 9 }}>
                  <div style={{ position: 'absolute', inset: 0, background: LENS_VIGNETTE }} />
                  <div style={{ position: 'absolute', top: 0, left: 0, right: '5%', bottom: 0, background: GLASS_REFLECTION, borderRadius: 14, opacity: 0.35 }} />
                </div>
                <div style={{ position: 'absolute', inset: 0, borderRadius: 14, pointerEvents: 'none', boxShadow: VIEWFINDER_INNER_SHADOW, zIndex: 10 }} />
              </div>
            )}

            {/* Spec grid — 3-column for density */}
            <div style={{
              borderRadius: 14, backgroundColor: C.panelBg,
              boxShadow: `${PANEL_SHADOW}, ${PANEL_BEVEL}`,
              padding: '12px 16px', position: 'relative', overflow: 'hidden',
            }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: 14, pointerEvents: 'none', boxShadow: PANEL_BEVEL, zIndex: 10 }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {mod?.distRange && (
                  <DesktopSpec label="DISTANCE" value={mod.distRange} hint={mod.optDist ? `typical: ${mod.optDist}` : null} hintColor={C.confHigh} />
                )}
                {(directionDisplay || positionDisplay) && (
                  <DesktopSpec label="DIRECTION" value={directionDisplay || positionDisplay} hint={keyAngleDisplay} hintColor={KEY_ACCENT} />
                )}
                {keyHeightDisplay && (
                  <DesktopSpec label="HEIGHT" value={keyHeightDisplay} hint={keyHeightMeasurement} hintColor={C.confHigh} />
                )}
                {rsFill && (
                  <DesktopSpec label="FILL" value={rsFill} />
                )}
                {rsPlacement && (
                  <DesktopSpec label="PLACEMENT" value={rsPlacement} />
                )}
                {positionDisplay && directionDisplay && (
                  <DesktopSpec label="POSITION" value={positionDisplay} />
                )}
              </div>
            </div>
          </div>
        )}

        </div>
        {/* ── Right column (desktop) — secondary panels ── */}
        <div style={isDesktop ? {
          display: 'flex', flexDirection: 'column', gap: 12,
        } : { display: 'contents' }}>

        {/* ── Multi-light roles strip ── */}
        {presentRoles && presentRoles.length > 0 && (
          <LightRoleStrip roles={presentRoles} />
        )}

        {/* Camera guidance from recreation_setup — focal_length, aperture, subject guidance */}
        {(rsFocal || rsAperture || rsCamGuide) && (
          <div style={{
            borderRadius: 10, backgroundColor: C.panelBg,
            boxShadow: `${PANEL_SHADOW}, ${PANEL_BEVEL}`,
            padding: '10px 16px', position: 'relative',
          }}>
            <div style={{ position: 'absolute', inset: 0, borderRadius: 10, pointerEvents: 'none', boxShadow: PANEL_BEVEL, zIndex: 10 }} />
            <p style={{ margin: '0 0 5px', fontSize: 12, fontWeight: 700, color: steel(0.55), letterSpacing: '1px', ...FONT_SMOOTH }}>
              CAMERA
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              {rsFocal && (
                <span style={{ fontSize: 14, fontWeight: 700, color: C.textPrimary, ...FONT_SMOOTH }}>
                  {rsFocal}
                </span>
              )}
              {rsAperture && (
                <span style={{ fontSize: 14, fontWeight: 700, color: C.textPrimary, ...FONT_SMOOTH }}>
                  {rsAperture}
                </span>
              )}
              {rsCamGuide && !rsFocal && !rsAperture && (
                <span style={{ fontSize: 12, fontWeight: 400, color: C.textSub, ...FONT_SMOOTH }}>
                  {rsCamGuide}
                </span>
              )}
            </div>
            {rsCamGuide && (rsFocal || rsAperture) && (
              <p style={{ margin: '4px 0 0', fontSize: 13, fontWeight: 400, color: C.textDim, lineHeight: 1.4, ...FONT_SMOOTH }}>
                {rsCamGuide}
              </p>
            )}
          </div>
        )}

        {/* ── Inset chip-strip — meta + CCT + fill + bg ── */}
        {(() => {
          const chips = [...(result?.meta || [])].map(m => prettify(m));
          if (cctDisplay) chips.push(cctMixed ? `${cctDisplay} · MIXED` : cctDisplay);
          if (fillMethod)  chips.push(prettify(fillMethod, { upper: true }));
          if (bgDetected)  chips.push(bgDistance ? `BG LIGHT ~${bgDistance}FT` : 'BG LIGHT (likely)');
          if (chips.length === 0) return null;
          return (
            <div style={{
              borderRadius: 8, backgroundColor: C.wellBg,
              boxShadow: RING_TRACK_SHADOW, padding: '5px 4px',
              overflow: 'hidden',
            }}>
              <div style={{
                display: 'flex', gap: 6,
                overflowX: 'auto', WebkitOverflowScrolling: 'touch',
                scrollbarWidth: 'none', msOverflowStyle: 'none',
              }}>
                {chips.map((m, i) => (
                  <Chip key={i} label={m} variant="neutral" size="sm" />
                ))}
              </div>
            </div>
          );
        })()}

        {/* Pre-shoot checklist stub */}
        {result?._raw?.shoot_checklist && (() => {
          const items = result._raw.shoot_checklist;
          return (
            <div style={{
              borderRadius: 14, backgroundColor: C.panelBg,
              boxShadow: `${PANEL_SHADOW}, ${PANEL_BEVEL}`,
              overflow: 'hidden', position: 'relative',
            }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: 14, pointerEvents: 'none', boxShadow: PANEL_BEVEL, zIndex: 10 }} />
              <div style={{ padding: '10px 16px' }}>
                <RowLabel>PRE-SHOOT CHECK</RowLabel>
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {items.map((item, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, border: `1.5px solid ${steel(0.50)}` }} />
                      <span style={{ fontSize: 12, fontWeight: 400, color: C.textSub, ...FONT_SMOOTH }}>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Engine-built result cards (from /api/shoot-match) ──
            Rendered only when `result.cards` is populated. Each card is
            self-gating (returns null on empty data) so we can drop them
            unconditionally. Wizard flow populates `cards` via
            Day1DemoApp.handleBuildComplete → shootMatch(). Other entry
            paths (analyze, recipe) currently leave `cards` unset — cards
            silently do not render until those flows are wired too. */}
        {result?.cards && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <WhatToLookForCard
              goodSigns={result.cards.whatToLookFor?.goodSigns}
              warnings={result.cards.whatToLookFor?.warnings}
            />
            <QuickFixesCard
              items={result.cards.quickFixes?.fixes}
              fixOrder={result.cards.quickFixes?.fixOrder}
            />
            <SubstitutionsCard items={result.cards.substitutions?.items} />
            <OtherSetupsCard items={result.cards.otherSetups} />
          </div>
        )}

        {/* ── Pull-tab: Setup Guide — recreation_setup notes + bg strategy ── */}
        {(rsNotes.length > 0 || rsBg) && (
          <PullTabDrawer label="SETUP GUIDE" open={!!drawers.setupGuide} onToggle={() => toggleDrawer('setupGuide')} maxH={400}>
            {rsBg && (
              <div style={{ marginBottom: rsNotes.length > 0 ? 10 : 0 }}>
                <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 700, color: steel(0.55), letterSpacing: '1px', ...FONT_SMOOTH }}>
                  BACKGROUND
                </p>
                <p style={{ margin: 0, fontSize: 14, fontWeight: 400, color: C.textSub, lineHeight: 1.5, ...FONT_SMOOTH }}>
                  {rsBg}
                </p>
              </div>
            )}
            {rsNotes.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {rsNotes.map((note, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{
                      width: 4, height: 4, borderRadius: 2, flexShrink: 0, marginTop: 7,
                      backgroundColor: steel(0.4),
                    }} />
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 400, color: C.textSub, lineHeight: 1.5, ...FONT_SMOOTH }}>
                      {note}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </PullTabDrawer>
        )}

        {/* ── Pull-tab: Save Details ── */}
        <PullTabDrawer label="SAVE DETAILS" open={!!drawers.save} onToggle={() => toggleDrawer('save')}>
          <InsetField label="SETUP NAME" value={setupName} onChange={setSetupName} placeholder={defaultName} />
          <InsetField label="NOTES" value={notes} onChange={setNotes} placeholder="Any details about this setup…" multiline />
        </PullTabDrawer>

        </div>{/* end rightCol */}
        </div>{/* end middleWrap */}

        {!isDesktop && <div style={{ flex: 1 }} />}

        {/* ── CTA dock — sticky at bottom on desktop so it's always in viewport ── */}
        <div style={isDesktop ? {
          position: 'sticky', bottom: 0, zIndex: 20,
          padding: '16px 40px 20px',
          background: `linear-gradient(transparent, ${C.bg} 24%)`,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        } : { display: 'contents' }}>
        <button
          onClick={handleStartCockpit}
          onPointerDown={() => setSavePressed(true)}
          onPointerUp={() => setSavePressed(false)}
          onPointerLeave={() => setSavePressed(false)}
          style={{
            width: '100%', maxWidth: isDesktop ? 640 : undefined,
            alignSelf: isDesktop ? 'center' : undefined,
            height: isDesktop ? 58 : 52, borderRadius: isDesktop ? 29 : 24,
            background: CTA_BG,
            boxShadow: savePressed ? 'inset 0px 2px 4px rgba(0,0,0,0.5)' : `${CTA_SHADOW}, ${CTA_BEVEL}`,
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            WebkitTapHighlightColor: 'transparent',
            transform: savePressed ? 'scale(0.98)' : 'scale(1)',
            transition: 'transform 0.1s ease, box-shadow 0.1s ease',
          }}
        >
          <span style={{ fontSize: isDesktop ? 15 : 14, fontWeight: 700, color: 'rgba(245,247,250,0.92)', letterSpacing: '1.5px', textTransform: 'uppercase', pointerEvents: 'none', ...FONT_SMOOTH }}>
            Start Shooting
          </span>
        </button>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: isDesktop ? '0' : '10px 4px 0',
          width: '100%', maxWidth: isDesktop ? 640 : undefined,
          alignSelf: isDesktop ? 'center' : undefined,
        }}>
          <button onClick={handleCancel} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 11, fontWeight: 600, color: steel(0.40),
            letterSpacing: '0.05em', padding: 0,
            WebkitTapHighlightColor: 'transparent', ...FONT_SMOOTH,
          }}>Cancel</button>

          <button
            onClick={handleSave}
            disabled={saved}
            style={{
              background: 'none', border: 'none',
              cursor: saved ? 'default' : 'pointer',
              fontSize: 11, fontWeight: 600,
              color: saved ? C.confHigh : steel(0.40),
              letterSpacing: '0.05em', padding: 0,
              display: 'flex', alignItems: 'center', gap: 5,
              WebkitTapHighlightColor: 'transparent',
              transition: 'color 0.2s ease',
              ...FONT_SMOOTH,
            }}
          >
            {saved ? (
              <>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Saved
              </>
            ) : (
              <>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                  <polyline points="17 21 17 13 7 13 7 21"/>
                  <polyline points="7 3 7 8 15 8"/>
                </svg>
                Save
              </>
            )}
          </button>

          {onRoomPlanner && (
            <button onClick={() => { onRoomPlanner(); softClickSound(); tapHaptic(); }} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 11, fontWeight: 600, color: steel(0.40),
              letterSpacing: '0.05em', padding: 0,
              display: 'flex', alignItems: 'center', gap: 5,
              WebkitTapHighlightColor: 'transparent', ...FONT_SMOOTH,
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 12h18M12 3v18"/>
              </svg>
              Plan Room
            </button>
          )}
        </div>
        </div>{/* end CTA dock */}
      </div>

      {/* iOS home indicator — mobile only */}
      {!isDesktop && (
        <div style={{ height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 1 }}>
          <div style={{ width: 134, height: 5, borderRadius: 3, backgroundColor: 'rgba(245,247,250,0.06)' }} />
        </div>
      )}
    </div>

    {/* ── Viewfinder overlay ── */}
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      opacity: viewfinderOpen ? 1 : 0,
      pointerEvents: viewfinderOpen ? 'auto' : 'none',
      transition: 'opacity 0.3s ease',
    }}>
      <div onClick={closeViewfinder} style={{
        position: 'absolute', inset: 0,
        backgroundColor: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
      }} />
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: viewfinderOpen ? 'translate(-50%, -50%) scale(1)' : 'translate(-50%, -45%) scale(0.95)',
        transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
        width: 'calc(100% - 40px)', maxWidth: 380,
        borderRadius: 20,
        backgroundColor: 'rgba(15,16,19,0.92)',
        boxShadow: `${VIEWFINDER_INNER_SHADOW}, 0px 8px 32px rgba(0,0,0,0.8), 0px 2px 8px rgba(0,0,0,0.5)`,
        overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: 20, backgroundImage: GLASS_REFLECTION, pointerEvents: 'none', zIndex: 2 }} />
        <div style={{ position: 'absolute', inset: 0, borderRadius: 20, backgroundImage: LENS_VIGNETTE, pointerEvents: 'none', zIndex: 3 }} />

        <div style={{ position: 'relative', zIndex: 1, padding: '20px 20px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: KEY_ACCENT, letterSpacing: '1.2px', ...FONT_SMOOTH }}>
              KEY LIGHT — VIEWFINDER
            </p>
            <button onClick={closeViewfinder} style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 4,
              WebkitTapHighlightColor: 'transparent',
            }}>
              <span style={{ fontSize: 18, color: steel(0.5), lineHeight: 1, ...FONT_SMOOTH }}>×</span>
            </button>
          </div>

          <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
            {modName && (
              <div>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: steel(0.62), letterSpacing: '0.6px', ...FONT_SMOOTH }}>MODIFIER</p>
                <p style={{ margin: '2px 0 0', fontSize: 14, fontWeight: 700, color: C.textPrimary, ...FONT_SMOOTH }}>{modName}</p>
              </div>
            )}
            {positionDisplay && (
              <div>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: steel(0.62), letterSpacing: '0.6px', ...FONT_SMOOTH }}>POSITION</p>
                <p style={{ margin: '2px 0 0', fontSize: 14, fontWeight: 700, color: C.textPrimary, ...FONT_SMOOTH }}>{positionDisplay}</p>
              </div>
            )}
            {mod?.distRange && (
              <div>
                <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: steel(0.62), letterSpacing: '0.6px', ...FONT_SMOOTH }}>DISTANCE</p>
                <p style={{ margin: '2px 0 0', fontSize: 14, fontWeight: 700, color: C.textPrimary, ...FONT_SMOOTH }}>{mod.distRange}</p>
              </div>
            )}
          </div>

          <div style={{ height: 1, backgroundColor: 'rgba(132, 158, 184,0.1)', marginBottom: 8 }} />

          {result?._raw && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 8px' }}>
              <LightingDiagram result={result} />
            </div>
          )}

          {(directionDisplay || elevDisplay) && (
            <div style={{ display: 'flex', gap: 20, justifyContent: 'center', paddingTop: 4 }}>
              {directionDisplay && <span style={{ fontSize: 12, fontWeight: 600, color: steel(0.55), ...FONT_SMOOTH }}>{directionDisplay}</span>}
              {elevDisplay && <span style={{ fontSize: 12, fontWeight: 600, color: steel(0.55), ...FONT_SMOOTH }}>{elevDisplay} height</span>}
            </div>
          )}
        </div>
      </div>
    </div>

    {/* ── Thumb zoom lightbox ── */}
    {imagePreview && (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 110,
        opacity: thumbZoomed ? 1 : 0,
        pointerEvents: thumbZoomed ? 'auto' : 'none',
        transition: 'opacity 0.25s ease',
      }}>
        <div onClick={closeThumb} style={{
          position: 'absolute', inset: 0,
          backgroundColor: 'rgba(0,0,0,0.88)',
          backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
          cursor: 'zoom-out',
        }} />
        <div
          onClick={closeThumb}
          style={{
            position: 'absolute', top: '50%', left: '50%',
            transform: thumbZoomed ? 'translate(-50%, -50%) scale(1)' : 'translate(-50%, -50%) scale(0.85)',
            transition: 'transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            width: 'calc(100% - 40px)', maxWidth: 430,
            borderRadius: 16,
            overflow: 'hidden',
            boxShadow: '0px 20px 60px rgba(0,0,0,0.85), 0px 4px 16px rgba(0,0,0,0.6)',
            cursor: 'zoom-out',
          }}
        >
          <img src={imagePreview} alt="" style={{ width: '100%', height: 'auto', display: 'block' }} />
        </div>
        <button
          onClick={closeThumb}
          aria-label="Close zoom"
          style={{
            position: 'absolute', top: 20, right: 20,
            width: 44, height: 44, borderRadius: 22,
            background: 'none', border: 'none', padding: 0,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <span style={{
            width: 36, height: 36, borderRadius: 18,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(15,16,19,0.72)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: steel(0.7), fontSize: 20, lineHeight: 1,
            ...FONT_SMOOTH,
          }}>×</span>
        </button>
      </div>
    )}

    {/* ── Mode picker bottom sheet ── */}
    {/* Diagram zoom overlay — fullscreen portal */}
    {diagramZoomed && result._raw && createPortal(
      <div
        onClick={() => setDiagramZoomed(false)}
        style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          backgroundColor: 'rgba(11,11,12,0.92)',
          backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          cursor: 'zoom-out', padding: 40,
        }}
      >
        {/* Toggle in zoomed view */}
        <div style={{ display: 'flex', marginBottom: 16 }} onClick={e => e.stopPropagation()}>
          {['top', 'side'].map(v => (
            <button key={v} onClick={() => { setDiagramView(v); tapHaptic(); }} style={{
              padding: '6px 18px', border: 'none', cursor: 'pointer',
              background: diagramView === v
                ? 'linear-gradient(141.71deg, #2a2218 0%, #1c1810 100%)'
                : 'linear-gradient(141.71deg, #16181e 0%, #0e1014 100%)',
              borderRadius: v === 'top' ? '8px 0 0 8px' : '0 8px 8px 0',
              boxShadow: diagramView === v
                ? `3px 3px 8px rgba(0,0,0,0.45), 0 0 0 0.5px rgba(200,155,60,0.25), inset 0 1px 0 rgba(200,155,60,0.10)`
                : '2px 2px 5px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.03)',
              fontSize: 11, fontWeight: 700, letterSpacing: '1px',
              color: diagramView === v ? KEY_ACCENT : steel(0.35),
              ...FONT_SMOOTH,
            }}>{v === 'top' ? 'TOP DOWN' : 'SIDE VIEW'}</button>
          ))}
        </div>
        {/* Diagram — large */}
        <div style={{ width: '100%', maxWidth: 800, maxHeight: '70vh', aspectRatio: diagramView === 'top' ? '300/220' : '300/150' }} onClick={e => e.stopPropagation()}>
          {diagramView === 'top' ? (
            <LightingDiagram result={result} fluid />
          ) : (
            <SideViewDiagram result={result} fluid />
          )}
        </div>
        <p style={{ marginTop: 16, fontSize: 11, color: steel(0.30), ...FONT_SMOOTH }}>Tap anywhere to close</p>
      </div>,
      document.body
    )}

    <ModePickerSheet
      open={modeSheetOpen}
      selectedMode={selectedMode}
      onSelectMode={(m) => { setSelectedMode(m); tapHaptic(); segmentPressSound(); }}
      onConfirm={handleConfirmMode}
      onClose={handleCloseSheet}
    />
    </div>
  );
}

// ─── Mode picker bottom sheet ────────────────────────────────────────────────
const SHOOT_MODES = [
  { key: 'photographer', label: 'Photographer', desc: 'Full details, every spec visible.' },
  { key: 'assistant',    label: 'Assistant',    desc: 'Commands only — hands-free calls.' },
  { key: 'learning',     label: 'Learning',     desc: 'Explains why, step-by-step coaching.' },
];

function ModePickerSheet({ open, selectedMode, onSelectMode, onConfirm, onClose }) {
  const [ctaPressed, setCtaPressed] = useState(false);
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 120,
        opacity: open ? 1 : 0,
        pointerEvents: open ? 'auto' : 'none',
        transition: 'opacity 0.25s ease',
      }}
    >
      {/* Scrim */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0,
          backgroundColor: 'rgba(0,0,0,0.72)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
        }}
      />

      {/* Sheet */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          maxWidth: 430, margin: '0 auto',
          backgroundColor: C.panelBg,
          borderTopLeftRadius: 24, borderTopRightRadius: 24,
          boxShadow: `${PANEL_SHADOW}, ${PANEL_BEVEL}`,
          padding: '10px 20px 24px',
          transform: open ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.32s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Drawer handle */}
        <div style={{
          width: 40, height: 4, borderRadius: 2,
          backgroundColor: 'rgba(255,255,255,0.08)',
          margin: '6px auto 14px',
          boxShadow: 'inset 0px 1px 2px rgba(0,0,0,0.4)',
        }} />

        <p style={{
          margin: 0, fontSize: 12, fontWeight: 700,
          color: '#c89b45', letterSpacing: '1.4px',
          textAlign: 'center', ...FONT_SMOOTH,
        }}>
          CHOOSE YOUR MODE
        </p>
        <p style={{
          margin: '4px 0 16px', fontSize: 12, fontWeight: 500,
          color: C.textSub, textAlign: 'center',
          ...FONT_SMOOTH,
        }}>
          Each mode adapts the cockpit to your role.
        </p>

        {/* Mode pills */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
          {SHOOT_MODES.map((m) => {
            const active = selectedMode === m.key;
            return (
              <button
                key={m.key}
                onClick={() => onSelectMode(m.key)}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                  padding: '12px 16px',
                  borderRadius: 14,
                  backgroundColor: active ? 'rgba(200,155,69,0.08)' : C.pillBg,
                  boxShadow: active
                    ? `0px 0px 0px 1px rgba(200,155,69,0.35), ${PANEL_BEVEL}`
                    : 'inset 0px 1px 2px rgba(0,0,0,0.5), inset 0px 0px 6px rgba(0,0,0,0.3)',
                  border: 'none', cursor: 'pointer',
                  WebkitTapHighlightColor: 'transparent',
                  textAlign: 'left',
                  transition: 'background-color 0.2s ease, box-shadow 0.2s ease',
                }}
              >
                <span style={{
                  fontSize: 13, fontWeight: 700,
                  color: active ? '#c89b45' : C.textPrimary,
                  letterSpacing: '0.2px', ...FONT_SMOOTH,
                }}>
                  {m.label}
                </span>
                <span style={{
                  marginTop: 2,
                  fontSize: 11, fontWeight: 500,
                  color: C.textSub, ...FONT_SMOOTH,
                }}>
                  {m.desc}
                </span>
              </button>
            );
          })}
        </div>

        {/* Confirm CTA */}
        <button
          onClick={onConfirm}
          onPointerDown={() => setCtaPressed(true)}
          onPointerUp={() => setCtaPressed(false)}
          onPointerLeave={() => setCtaPressed(false)}
          style={{
            width: '100%', height: 52, borderRadius: 24,
            background: CTA_BG,
            boxShadow: ctaPressed
              ? 'inset 0px 2px 4px rgba(0,0,0,0.5)'
              : `${CTA_SHADOW}, ${CTA_BEVEL}`,
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            WebkitTapHighlightColor: 'transparent',
            transform: ctaPressed ? 'scale(0.98)' : 'scale(1)',
            transition: 'transform 0.1s ease, box-shadow 0.1s ease',
          }}
        >
          <span style={{
            fontSize: 13, fontWeight: 600,
            color: 'rgba(245,247,250,0.9)', letterSpacing: '0.5px',
            pointerEvents: 'none', ...FONT_SMOOTH,
          }}>
            Enter Cockpit
          </span>
        </button>

        {/* iOS home indicator */}
        <div style={{
          height: 24, display: 'flex', alignItems: 'center',
          justifyContent: 'center', marginTop: 8,
        }}>
          <div style={{
            width: 134, height: 5, borderRadius: 3,
            backgroundColor: 'rgba(245,247,250,0.06)',
          }} />
        </div>
      </div>
    </div>
  );
}
