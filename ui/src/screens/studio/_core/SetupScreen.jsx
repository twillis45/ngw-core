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
import { tapHaptic, successHaptic, navHaptic, longPressHaptic, grainHaptic } from '../../../utils/haptics';
import { getFaceCropPosition } from '../../../utils/faceCrop';
import { useIsDesktop } from '../../../utils/useIsDesktop';
import { softClickSound, navSlideSound, segmentPressSound, panelToggleSound } from '../../../utils/sounds';
import { steel, C as SM_C, FONT_SMOOTH, PANEL_SHADOW, PANEL_BEVEL,
         CTA_BG, CTA_SHADOW, CTA_BEVEL,
         VIEWFINDER_INNER_SHADOW, GLASS_REFLECTION, LENS_VIGNETTE } from '../../../theme/studioMatte';
import LightingDiagram from './components/LightingDiagram';
import { saveSetup as persistSetup } from '../../../data/setupStore';
import { saveShootRole } from '../../../data/shootModeStore';
import { trackEvent } from '../../../data/analytics';

// ─── Tokens ──────────────────────────────────────────────────────────────────
const C = { ...SM_C, fieldBg: '#0a0b0d' };

const FIELD_SHADOW       = 'inset 0px 1px 3px 0px rgba(0,0,0,0.6), inset 0px 0px 8px 0px rgba(0,0,0,0.3), inset 1px 1px 2px 0px rgba(0,0,0,0.4)';
const FIELD_SHADOW_FOCUS = `inset 0px 1px 3px 0px rgba(0,0,0,0.6), inset 0px 0px 8px 0px rgba(0,0,0,0.3), inset 1px 1px 2px 0px rgba(0,0,0,0.4), 0px 0px 0px 1px ${steel(0.35)}`;

const KEY_ACCENT = '#c89b45';

const RING_TRACK_SHADOW  = 'inset 0px 2px 5px 0px rgba(0,0,0,0.7), inset 0px 1px 2px 0px rgba(0,0,0,0.5), inset 1px 0px 2px 0px rgba(0,0,0,0.3), inset -1px 0px 2px 0px rgba(0,0,0,0.3)';
const RING_ACTIVE_SHADOW = '0px 2px 6px 0px rgba(0,0,0,0.6), 0px 1px 2px 0px rgba(0,0,0,0.4), inset 0px 0.5px 0px 0px rgba(255,255,255,0.08), inset 0px -0.5px 0px 0px rgba(0,0,0,0.3)';

const DRAWER_HANDLE_SHADOW = 'inset 0px 1px 3px 0px rgba(0,0,0,0.6), inset 0px 0px 6px 0px rgba(0,0,0,0.3)';

// ─── Role colors (per-light role accent) ────────────────────────────────────
const ROLE_COLORS = {
  key:         '#c89b45',  // amber
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
const WARN_BG       = 'rgba(245,190,72,0.08)';
const WARN_BEVEL    = 'inset 1px 1px 2px 0px rgba(0,0,0,0.3), inset -0.5px -0.5px 0.5px 0px rgba(255,255,255,0.03)';
const DANGER_BG     = 'rgba(200,70,70,0.10)';
const DANGER_BORDER = 'rgba(200,70,70,0.25)';
const WARN_BORDER   = 'rgba(245,190,72,0.22)';
const INFO_BG       = 'rgba(95,124,150,0.08)';
const INFO_BORDER   = 'rgba(95,124,150,0.22)';

// Edge-case flag → label + severity ('danger' | 'warn' | 'info')
const EDGE_CASE_LABELS = {
  blown_highlights:                { label: 'BLOWN HIGHLIGHTS',   sev: 'warn' },
  earring_catchlight_contamination:{ label: 'EARRING IN CATCHLIGHT', sev: 'danger' },
  mixed_color_temperature:         { label: 'MIXED CCT',          sev: 'warn' },
  no_face:                         { label: 'NO FACE DETECTED',   sev: 'danger' },
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
  const s = String(distRange).toLowerCase();
  const nums = s.match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length === 0) return null;
  const n = nums.map(Number);
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
function estimateKeyHeightFt(heightClass, distanceFt) {
  if (!heightClass || distanceFt == null) return null;
  const key = String(heightClass).trim().toLowerCase();
  const elev = HEIGHT_CLASS_ELEV_DEG[key];
  if (elev == null) return null;
  const subjectEyeFt = 5.5;
  const deltaFt = distanceFt * Math.tan(elev * Math.PI / 180);
  const totalFt = subjectEyeFt + deltaFt;
  const lo = Math.max(1, totalFt - 0.6);
  const hi = totalFt + 0.6;
  return `~${lo.toFixed(1)}–${hi.toFixed(1)} ft`;
}

// ─── Row label ───────────────────────────────────────────────────────────────
function RowLabel({ children }) {
  return (
    <p style={{ margin: 0, fontSize: 10, fontWeight: 600, color: steel(0.65), letterSpacing: '1px', ...FONT_SMOOTH }}>
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
        padding: '8px 10px',
        backgroundColor: pressed ? 'rgba(0,0,0,0.25)' : hasSecret ? 'rgba(0,0,0,0.08)' : 'transparent',
        boxShadow: pressed ? SPEC_DOWN : hasSecret ? SPEC_UP : 'none',
        transition: 'all 0.15s ease',
        cursor: interactive ? 'pointer' : 'default',
        WebkitTapHighlightColor: 'transparent',
        WebkitUserSelect: 'none', userSelect: 'none',
      }}
    >
      <p style={{ margin: 0, fontSize: 9, fontWeight: 600, color: steel(0.5), letterSpacing: '0.8px', ...FONT_SMOOTH }}>{label}</p>
      <p style={{ margin: '4px 0 0', fontSize: 18, fontWeight: 700, color: C.textPrimary, lineHeight: 1.2, ...FONT_SMOOTH }}>{value}</p>
      {showSecondary && (
        <p style={{ margin: '3px 0 0', fontSize: 11, fontWeight: 600, color: secondaryColor || C.confHigh, ...FONT_SMOOTH }}>
          {secondary}
        </p>
      )}
      {interactive && !revealed && (
        <p style={{ margin: '3px 0 0', fontSize: 8, fontWeight: 500, color: steel(0.2), letterSpacing: '0.5px', ...FONT_SMOOTH }}>
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
        <span style={{ fontSize: 10, fontWeight: 700, color, letterSpacing: '1px', ...FONT_SMOOTH }}>
          {label}
        </span>
        <span style={{ fontSize: 9, fontWeight: 600, color: steel(0.55), letterSpacing: '0.5px', ...FONT_SMOOTH }}>
          {conf}%
        </span>
      </div>
      {primaryEvidence && (
        <p style={{
          margin: '4px 0 0', fontSize: 10, fontWeight: 500, lineHeight: 1.35,
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
      borderRadius: 10, padding: '8px 8px',
      backgroundColor: '#050507', boxShadow: RING_TRACK_SHADOW,
    }}>
      <div style={{
        display: 'flex', gap: 8, overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none', msOverflowStyle: 'none',
      }}>
        {roles.map(r => <LightRoleCard key={r.roleKey} roleKey={r.roleKey} role={r.role} />)}
      </div>
    </div>
  );
}

// ─── Warning chip + strip ────────────────────────────────────────────────────
function WarningChip({ label, sev }) {
  const bg     = sev === 'danger' ? DANGER_BG : sev === 'info' ? INFO_BG : WARN_BG;
  const border = sev === 'danger' ? DANGER_BORDER : sev === 'info' ? INFO_BORDER : WARN_BORDER;
  const color  = sev === 'danger' ? 'rgba(240,140,140,0.95)'
                : sev === 'info' ? steel(0.8)
                : 'rgba(245,200,110,0.95)';
  const dot    = sev === 'danger' ? 'rgba(240,120,120,0.95)'
                : sev === 'info' ? steel(0.55)
                : 'rgba(245,190,72,0.95)';
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
      padding: '5px 10px 5px 8px', borderRadius: 6,
      backgroundColor: bg,
      boxShadow: `${WARN_BEVEL}, 0 0 0 0.5px ${border}`,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: dot, boxShadow: `0 0 4px ${dot}` }} />
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.8px', color, whiteSpace: 'nowrap', ...FONT_SMOOTH }}>
        {label}
      </span>
    </div>
  );
}

function WarningStrip({ warnings }) {
  if (!warnings || warnings.length === 0) return null;
  return (
    <div style={{
      borderRadius: 10, padding: '8px 10px',
      backgroundColor: '#050507', boxShadow: RING_TRACK_SHADOW,
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
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ─── Pull-tab drawer ────────────────────────────────────────────────────────
function PullTabDrawer({ label, open, onToggle, children, maxH = 300 }) {
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

export default function SetupScreen({ result, imagePreview, onSave, onCancel, onStartCockpit }) {
  const isDesktop = useIsDesktop();
  const [setupName, setSetupName] = useState('');
  const [notes, setNotes] = useState('');
  const [savePressed, setSavePressed] = useState(false);
  const [ringSection, setRingSection] = useState('pattern');
  const [drawers, setDrawers] = useState({});
  const [viewfinderOpen, setViewfinderOpen] = useState(false);
  const [heroFlipped, setHeroFlipped] = useState(false);
  const [thumbZoomed, setThumbZoomed] = useState(false);
  const [modeSheetOpen, setModeSheetOpen] = useState(false);
  const [selectedMode, setSelectedMode] = useState('photographer');
  const [saved, setSaved] = useState(false);

  const flipHero = () => { setHeroFlipped(p => !p); softClickSound(); tapHaptic(); };
  const openThumb = () => { setThumbZoomed(true); panelToggleSound(); tapHaptic(); };
  const closeThumb = () => { setThumbZoomed(false); softClickSound(); };
  const selectRing = (k) => { if (k !== ringSection) { setRingSection(k); segmentPressSound(); tapHaptic(); } };
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
  const rsPlacement  = rs.key_placement   || null;  // "45° camera-left, high"
  const rsFill       = rs.fill_strategy   || null;  // "1:2 ratio unilateral fill"
  const rsBg         = rs.background_strategy || null;
  const rsFocal      = rs.focal_length    || null;  // "85-135mm"
  const rsAperture   = rs.aperture        || null;  // "f/2.8-5.6"
  const rsCamGuide   = rs.camera_subject_guidance || null;
  const rsNotes      = Array.isArray(rs.setup_notes) ? rs.setup_notes.filter(Boolean) : [];

  const modName = mod ? `${mod.sizeLabel ? mod.sizeLabel + ' ' : ''}${mod.family || 'Modifier'}` : null;
  const positionDisplay = mod?.position || li.key_position_text || null;
  const keySide = li.key_side;
  const directionDisplay = keySide && keySide !== 'unknown'
    ? keySide.charAt(0).toUpperCase() + keySide.slice(1) : null;
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

  const ringSections = [];
  if (result?.sections?.patternCandidates?.length > 0) ringSections.push({ key: 'pattern', label: 'PATTERN' });
  if (result?.sections?.shadowAnalysis) ringSections.push({ key: 'shadow', label: 'SHADOW' });
  if (result?.sections?.sceneDescription) ringSections.push({ key: 'scene', label: 'SCENE' });
  if (result?.sections?.catchlightModifier) ringSections.push({ key: 'catchlight', label: 'MODIFIER' });
  const activeRing = ringSections.some(s => s.key === ringSection) ? ringSection : ringSections[0]?.key;

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
  const keyHeightDisplay = keyHeight
    ? (typeof keyHeight === 'string'
        ? keyHeight.charAt(0).toUpperCase() + keyHeight.slice(1)
        : String(keyHeight))
    : null;

  // Height measurement estimate — combines height class with measured distance.
  // Prefers engine-computed numeric distance (modifier_distance_ft) over the
  // range-string midpoint so the estimate tracks the solver's actual value.
  const distanceFtNumeric = (typeof raw.reconstruction?.modifier_distance_ft === 'number')
    ? raw.reconstruction.modifier_distance_ft
    : (typeof raw.reconstruction?.estimated_source_distance_ft === 'number')
      ? raw.reconstruction.estimated_source_distance_ft
      : parseDistanceMid(mod?.distRange);
  const keyHeightMeasurement = estimateKeyHeightFt(keyHeight, distanceFtNumeric);

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
    // Sort: danger first, then warn, then info
    const order = { danger: 0, warn: 1, info: 2 };
    out.sort((a, b) => (order[a.sev] ?? 3) - (order[b.sev] ?? 3));
    return out;
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

  const handleStartCockpit = useCallback(() => {
    softClickSound(); tapHaptic();
    trackEvent('SETUP_MODE_PICKER_OPENED', {
      pattern: result?.pattern, confidence: result?.confidence,
    });
    setModeSheetOpen(true);
  }, [result]);

  const handleConfirmMode = useCallback(() => {
    successHaptic(); softClickSound();
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

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: '#000', overflow: 'hidden' }}>
    <div
      onTouchStart={(e) => { if (e.target === e.currentTarget) grainHaptic(); }}
      onTouchMove={(e) => { if (e.target === e.currentTarget) grainHaptic(); }}
      style={{
      width: '100%', maxWidth: isDesktop ? 1180 : 430, height: '100%', margin: '0 auto',
      backgroundColor: C.bg,
      display: 'flex', flexDirection: 'column', overflowY: 'auto',
      position: 'relative', fontFamily: 'Inter, system-ui, sans-serif',
    }}>

      {/* ── Matte metal surface — layered ambient wash, vignette, specular edge, grain ── */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 75% 55% at 50% 22%, rgba(120,148,175,0.022) 0%, rgba(95,124,150,0.008) 40%, transparent 72%)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 55% 38% at 50% 58%, rgba(180,150,110,0.008) 0%, transparent 65%)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 118% 88% at 50% 50%, transparent 52%, rgba(0,0,0,0.45) 100%)' }} />
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(141.71deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.018) 40%, transparent 80%)' }} />
        <div style={{ position: 'absolute', inset: 0, opacity: 0.16, mixBlendMode: 'multiply', backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.32' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`, backgroundSize: '128px 128px' }} />
      </div>

      {/* ─── Nav bar ─── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: isDesktop ? '56px 40px 0' : '56px 20px 0', position: 'relative', zIndex: 1,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={handleCancel} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: 0, display: 'flex', alignItems: 'center',
            WebkitTapHighlightColor: 'transparent',
          }}>
            <span style={{ fontSize: 22, color: C.textMeta, lineHeight: 1, ...FONT_SMOOTH }}>‹</span>
          </button>
          <p style={{ margin: 0, fontSize: 10, fontWeight: 600, color: steel(0.65), letterSpacing: '1.2px', ...FONT_SMOOTH }}>
            LIGHTING SETUP
          </p>
        </div>
        {result?._raw && (
          <button onClick={openViewfinder} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: 6, borderRadius: 6, display: 'flex', alignItems: 'center',
            WebkitTapHighlightColor: 'transparent',
          }}>
            <ViewfinderIcon color={steel(0.5)} />
          </button>
        )}
      </div>

      {/* ─── Content ─── */}
      <div style={{
        padding: isDesktop ? '20px 40px 40px' : '20px 25px 40px',
        flex: 1,
        display: isDesktop ? 'grid' : 'flex',
        flexDirection: isDesktop ? undefined : 'column',
        gap: 16,
        // Desktop: two-column grid. Full-width banner rows (result header,
        // warnings, CTA/save row). Left column = "what is the setup" (hero
        // flip card, roles, camera, chips, lens ring, pre-shoot check).
        // Right column = "secondary detail drawers" (pull-tabs).
        ...(isDesktop ? {
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
          gridAutoFlow: 'row dense',
          columnGap: 20,
          rowGap: 16,
          alignContent: 'start',
        } : null),
        position: 'relative', zIndex: 1,
      }}>

        {/* ── Result header — always expanded ── */}
        {result && (
          <div style={{
            borderRadius: 14, backgroundColor: C.panelBg,
            boxShadow: `${PANEL_SHADOW}, ${PANEL_BEVEL}`,
            padding: '14px 20px',
            display: 'flex', alignItems: 'center', gap: 14,
            position: 'relative',
            ...(isDesktop ? { gridColumn: '1 / -1' } : null),
          }}>
            <div style={{ position: 'absolute', inset: 0, borderRadius: 14, pointerEvents: 'none', boxShadow: PANEL_BEVEL, zIndex: 10 }} />
            {imagePreview && (
              <button
                type="button"
                onClick={openThumb}
                aria-label="Zoom photo"
                style={{
                  width: 48, height: 48, borderRadius: 8, flexShrink: 0,
                  overflow: 'hidden', boxShadow: '0px 2px 6px rgba(0,0,0,0.5)',
                  padding: 0, border: 'none', background: 'none', cursor: 'zoom-in',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                <img src={imagePreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: faceCrop, display: 'block' }} />
              </button>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.textPrimary, lineHeight: 1.1, ...FONT_SMOOTH }}>
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

        {/* ── Warning strip — edge cases + physics violations ── */}
        {warnings && warnings.length > 0 && (
          <div style={isDesktop ? { gridColumn: '1 / -1' } : undefined}>
            <WarningStrip warnings={warnings} />
          </div>
        )}

        {/* ── Key Light hero — flip card (specs ↔ diagram) ── */}
        {result && (modName || positionDisplay || result._raw) && (
          <div style={{ perspective: 1200, ...(isDesktop ? { gridColumn: 1 } : null) }} onClick={flipHero}>
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

                <div style={{ padding: '14px 16px 0' }}>
                  <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: KEY_ACCENT, letterSpacing: '1.2px', ...FONT_SMOOTH }}>
                    KEY LIGHT
                  </p>
                </div>

                {modName ? (
                  <div style={{ padding: '10px 20px 0' }}>
                    <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: C.textPrimary, lineHeight: 1.2, ...FONT_SMOOTH }}>{modName}</p>
                    {mod?.sizeRange && (
                      <p style={{ margin: '3px 0 0', fontSize: 11, fontWeight: 500, color: C.textDim, ...FONT_SMOOTH }}>{mod.sizeRange}</p>
                    )}
                  </div>
                ) : result.sections?.catchlightModifier ? (
                  <div style={{ padding: '10px 20px 0' }}>
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: C.textPrimary, lineHeight: 1.3, ...FONT_SMOOTH }}>
                      {result.sections.catchlightModifier}
                    </p>
                  </div>
                ) : null}

                {/* Spec grid — critical values (distance optimal, off-axis
                    angle, estimated height) are always visible. Remaining
                    specs still use the long-press reveal pattern. */}
                <div onClick={(e) => e.stopPropagation()}>
                  {(mod?.distRange || positionDisplay) && (
                    <div style={{ padding: '12px 16px 0', display: 'flex', gap: 8 }}>
                      {mod?.distRange && (
                        <LongPressSpec
                          label="DISTANCE"
                          value={mod.distRange}
                          secondary={mod.optDist ? `optimal ${mod.optDist}` : null}
                          secondaryColor={C.confHigh}
                          alwaysRevealed
                        />
                      )}
                      {positionDisplay && (
                        <LongPressSpec
                          label="POSITION"
                          value={positionDisplay}
                          alwaysRevealed
                        />
                      )}
                    </div>
                  )}

                  {(directionDisplay || keyHeightDisplay) && (
                    <div style={{ padding: '8px 16px 0', display: 'flex', gap: 8 }}>
                      {directionDisplay && (
                        <LongPressSpec
                          label="DIRECTION"
                          value={directionDisplay}
                          secondary={keyAngleDisplay}
                          secondaryColor={KEY_ACCENT}
                          alwaysRevealed
                        />
                      )}
                      {keyHeightDisplay && (
                        <LongPressSpec
                          label="HEIGHT"
                          value={keyHeightDisplay}
                          secondary={keyHeightMeasurement}
                          secondaryColor={C.confHigh}
                          alwaysRevealed
                        />
                      )}
                    </div>
                  )}
                </div>

                {/* Key placement + fill strategy from recreation_setup */}
                {(rsPlacement || rsFill) && (
                  <div style={{ padding: '8px 16px 0', display: 'flex', gap: 8 }} onClick={(e) => e.stopPropagation()}>
                    {rsPlacement && (
                      <LongPressSpec label="PLACEMENT" value={rsPlacement} alwaysRevealed />
                    )}
                    {rsFill && (
                      <LongPressSpec label="FILL" value={rsFill} alwaysRevealed />
                    )}
                  </div>
                )}

                {mod?.distRange && (
                  <div style={{ padding: '10px 20px 14px' }}>
                    <p style={{ margin: 0, fontSize: 10, fontWeight: 400, color: steel(0.35), lineHeight: 1.5, ...FONT_SMOOTH }}>
                      Closer = softer wrap · Farther = harder, more directional
                    </p>
                  </div>
                )}
                {!mod?.distRange && <div style={{ height: 14 }} />}

                {/* Flip hint */}
                <div style={{
                  padding: '0 20px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                }}>
                  <span style={{ fontSize: 9, fontWeight: 600, color: steel(0.25), letterSpacing: '0.8px', ...FONT_SMOOTH }}>
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
                  <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: KEY_ACCENT, letterSpacing: '1.2px', ...FONT_SMOOTH }}>
                    SETUP DIAGRAM
                  </p>
                </div>

                <LightingDiagram result={result} compact />

                {compactSummary && (
                  <p style={{
                    margin: '2px 0 0', fontSize: 11, fontWeight: 500, color: C.textSub,
                    textAlign: 'center', ...FONT_SMOOTH,
                  }}>
                    {compactSummary}
                  </p>
                )}

                <div style={{ padding: '6px 20px 10px' }}>
                  <span style={{ fontSize: 9, fontWeight: 600, color: steel(0.25), letterSpacing: '0.8px', ...FONT_SMOOTH }}>
                    TAP FOR SPECS
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Multi-light roles strip ── */}
        {presentRoles && presentRoles.length > 0 && (
          <div style={isDesktop ? { gridColumn: 1 } : undefined}>
            <LightRoleStrip roles={presentRoles} />
          </div>
        )}

        {/* Camera guidance from recreation_setup — focal_length, aperture, subject guidance */}
        {(rsFocal || rsAperture || rsCamGuide) && (
          <div style={{
            borderRadius: 10, backgroundColor: C.panelBg,
            boxShadow: `${PANEL_SHADOW}, ${PANEL_BEVEL}`,
            padding: '10px 16px', position: 'relative',
            ...(isDesktop ? { gridColumn: 1 } : null),
          }}>
            <div style={{ position: 'absolute', inset: 0, borderRadius: 10, pointerEvents: 'none', boxShadow: PANEL_BEVEL, zIndex: 10 }} />
            <p style={{ margin: '0 0 6px', fontSize: 9, fontWeight: 700, color: steel(0.55), letterSpacing: '1px', ...FONT_SMOOTH }}>
              CAMERA
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              {rsFocal && (
                <span style={{ fontSize: 12, fontWeight: 600, color: C.textSubBold, ...FONT_SMOOTH }}>
                  {rsFocal}
                </span>
              )}
              {rsAperture && (
                <span style={{ fontSize: 12, fontWeight: 600, color: C.textSubBold, ...FONT_SMOOTH }}>
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
              <p style={{ margin: '4px 0 0', fontSize: 11, fontWeight: 400, color: C.textDim, lineHeight: 1.4, ...FONT_SMOOTH }}>
                {rsCamGuide}
              </p>
            )}
          </div>
        )}

        {/* ── Inset chip-strip — meta + CCT + fill + bg ── */}
        {(() => {
          const chips = [...(result?.meta || [])];
          if (cctDisplay) chips.push(cctMixed ? `${cctDisplay} · MIXED` : cctDisplay);
          if (fillMethod)  chips.push(fillMethod.toUpperCase());
          if (bgDetected)  chips.push(bgDistance ? `BG LIGHT ${bgDistance}FT` : 'BG LIGHT');
          if (chips.length === 0) return null;
          return (
            <div style={{
              borderRadius: 8, backgroundColor: '#050507',
              boxShadow: RING_TRACK_SHADOW, padding: '6px 4px',
              overflow: 'hidden',
              ...(isDesktop ? { gridColumn: 1 } : null),
            }}>
              <div style={{
                display: 'flex', gap: 6,
                overflowX: 'auto', WebkitOverflowScrolling: 'touch',
                scrollbarWidth: 'none', msOverflowStyle: 'none',
              }}>
                {chips.map((m, i) => (
                  <span key={i} style={{
                    fontSize: 9, fontWeight: 700, color: steel(0.7),
                    backgroundColor: 'rgba(95,124,150,0.06)',
                    padding: '5px 10px', borderRadius: 5,
                    boxShadow: 'inset 1px 1px 2px 0px rgba(0,0,0,0.25), inset 0px 2px 4px 0px rgba(0,0,0,0.3)',
                    letterSpacing: '0.5px', whiteSpace: 'nowrap', flexShrink: 0,
                    ...FONT_SMOOTH,
                  }}>{m}</span>
                ))}
              </div>
            </div>
          );
        })()}

        {/* ── Lens ring ── */}
        {ringSections.length > 0 && (
          <div style={{
            borderRadius: 14, backgroundColor: C.panelBg,
            boxShadow: `${PANEL_SHADOW}, ${PANEL_BEVEL}`,
            overflow: 'hidden', position: 'relative',
            ...(isDesktop ? { gridColumn: 1 } : null),
          }}>
            <div style={{ position: 'absolute', inset: 0, borderRadius: 14, pointerEvents: 'none', boxShadow: PANEL_BEVEL, zIndex: 10 }} />

            <div style={{
              margin: '12px 14px 0', display: 'flex', borderRadius: 8,
              backgroundColor: '#050507', boxShadow: RING_TRACK_SHADOW, padding: 3,
            }}>
              {ringSections.flatMap((s, i) => {
                const active = activeRing === s.key;
                const prevActive = i > 0 && activeRing === ringSections[i - 1].key;
                const els = [];
                if (i > 0) {
                  els.push(
                    <div key={`n-${s.key}`} style={{
                      width: 1, alignSelf: 'stretch', margin: '5px 0', flexShrink: 0,
                      background: active || prevActive ? 'transparent'
                        : 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, rgba(255,255,255,0.04) 50%, rgba(0,0,0,0.6) 100%)',
                    }} />
                  );
                }
                els.push(
                  <button key={s.key} onClick={() => selectRing(s.key)}
                    style={{
                      flex: 1, height: 30, borderRadius: 6,
                      backgroundColor: active ? 'rgba(95,124,150,0.10)' : 'transparent',
                      boxShadow: active ? RING_ACTIVE_SHADOW : 'none',
                      border: 'none', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                      transition: 'all 0.15s ease', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                    }}>
                    <span style={{
                      fontSize: 9, fontWeight: 700, letterSpacing: '0.8px',
                      color: active ? steel(0.85) : steel(0.35),
                      transition: 'color 0.15s ease', ...FONT_SMOOTH,
                    }}>{s.label}</span>
                  </button>
                );
                return els;
              })}
            </div>

            <div style={{ padding: '14px 20px', minHeight: 60 }}>
              {activeRing === 'pattern' && result?.sections?.patternCandidates && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {result.sections.patternCandidates.map((c, i) => (
                    <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: i === 0 ? 600 : 400, color: i === 0 ? C.textPrimary : C.textDim, width: 80, flexShrink: 0, ...FONT_SMOOTH }}>{c.name}</span>
                      <div style={{ flex: 1, height: 3, borderRadius: 1.5, backgroundColor: C.barTrack, position: 'relative' }}>
                        <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${c.score}%`, borderRadius: 1.5,
                          backgroundColor: i === 0 ? (isHighConf ? C.confHighBar : C.confLowBar) : 'rgba(184,191,199,0.15)' }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {activeRing === 'shadow' && result?.sections?.shadowAnalysis && (
                <p style={{ margin: 0, fontSize: 13, fontWeight: 400, color: C.textSub, lineHeight: 1.5, ...FONT_SMOOTH }}>{result.sections.shadowAnalysis}</p>
              )}
              {activeRing === 'scene' && result?.sections?.sceneDescription && (
                <p style={{ margin: 0, fontSize: 13, fontWeight: 400, color: C.textSub, lineHeight: 1.5, ...FONT_SMOOTH }}>{result.sections.sceneDescription}</p>
              )}
              {activeRing === 'catchlight' && result?.sections?.catchlightModifier && (
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 400, color: C.textSub, lineHeight: 1.5, ...FONT_SMOOTH }}>{result.sections.catchlightModifier}</p>
                  {mod?.distQuality && (
                    <p style={{ margin: '8px 0 0', fontSize: 11, fontWeight: 400, color: steel(0.4), lineHeight: 1.5, fontStyle: 'italic', ...FONT_SMOOTH }}>{mod.distQuality}</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Pre-shoot checklist stub */}
        {result?._raw?.shoot_checklist && (() => {
          const items = result._raw.shoot_checklist;
          return (
            <div style={{
              borderRadius: 14, backgroundColor: C.panelBg,
              boxShadow: `${PANEL_SHADOW}, ${PANEL_BEVEL}`,
              overflow: 'hidden', position: 'relative',
              ...(isDesktop ? { gridColumn: 2 } : null),
            }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: 14, pointerEvents: 'none', boxShadow: PANEL_BEVEL, zIndex: 10 }} />
              <div style={{ padding: '14px 20px' }}>
                <RowLabel>PRE-SHOOT CHECK</RowLabel>
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {items.map((item, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 18, height: 18, borderRadius: 4, flexShrink: 0, border: `1.5px solid ${steel(0.3)}` }} />
                      <span style={{ fontSize: 12, fontWeight: 400, color: C.textSub, ...FONT_SMOOTH }}>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── Pull-tab: Catchlight & Modifier detail ── */}
        {result?.sections?.catchlightModifier && (
          <div style={isDesktop ? { gridColumn: 2 } : undefined}>
          <PullTabDrawer label="CATCHLIGHT & MODIFIER" open={!!drawers.modifier} onToggle={() => toggleDrawer('modifier')}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: C.textSubBold, lineHeight: 1.6, ...FONT_SMOOTH }}>
              {result.sections.catchlightModifier}
            </p>
            {mod?.angularArea && (
              <p style={{ margin: '10px 0 0', fontSize: 12, fontWeight: 600, color: C.textSub, ...FONT_SMOOTH }}>
                Angular area: <span style={{ color: C.textPrimary }}>{mod.angularArea}</span>
              </p>
            )}
            {mod?.distQuality && (
              <p style={{ margin: '6px 0 0', fontSize: 12, fontWeight: 400, color: C.textSub, fontStyle: 'italic', lineHeight: 1.5, ...FONT_SMOOTH }}>
                {mod.distQuality}
              </p>
            )}
          </PullTabDrawer>
          </div>
        )}

        {/* ── Pull-tab: Shadow Analysis ── */}
        {result?.sections?.shadowAnalysis && (
          <div style={isDesktop ? { gridColumn: 2 } : undefined}>
          <PullTabDrawer label="SHADOW ANALYSIS" open={!!drawers.shadow} onToggle={() => toggleDrawer('shadow')} maxH={400}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: C.textSubBold, lineHeight: 1.7, ...FONT_SMOOTH }}>
              {result.sections.shadowAnalysis}
            </p>
          </PullTabDrawer>
          </div>
        )}

        {/* ── Pull-tab: Setup Guide — recreation_setup notes + bg strategy ── */}
        {(rsNotes.length > 0 || rsBg) && (
          <div style={isDesktop ? { gridColumn: 2 } : undefined}>
          <PullTabDrawer label="SETUP GUIDE" open={!!drawers.setupGuide} onToggle={() => toggleDrawer('setupGuide')} maxH={400}>
            {rsBg && (
              <div style={{ marginBottom: rsNotes.length > 0 ? 10 : 0 }}>
                <p style={{ margin: '0 0 4px', fontSize: 9, fontWeight: 700, color: steel(0.55), letterSpacing: '1px', ...FONT_SMOOTH }}>
                  BACKGROUND
                </p>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 400, color: C.textSub, lineHeight: 1.5, ...FONT_SMOOTH }}>
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
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 400, color: C.textSub, lineHeight: 1.5, ...FONT_SMOOTH }}>
                      {note}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </PullTabDrawer>
          </div>
        )}

        {/* ── Pull-tab: Signal Diagnostics ── */}
        {(() => {
          const sd = raw.signal_diagnostics || {};
          const signals = sd.signals || {};
          const hasSignals = signals.nose_shadow_angle_deg != null || signals.left_right_asymmetry != null || signals.triangle_isolation != null;
          if (!hasSignals) return null;
          const wrap = (node) => isDesktop ? <div style={{ gridColumn: 2 }}>{node}</div> : node;
          const cellStyle = {
            flex: '1 1 45%', minWidth: 120, padding: '10px 12px', borderRadius: 10,
            backgroundColor: C.fieldBg,
            boxShadow: FIELD_SHADOW,
          };
          const cellLabel = { margin: 0, fontSize: 10, fontWeight: 700, color: steel(0.65), letterSpacing: '0.8px', ...FONT_SMOOTH };
          const cellValue = { margin: '4px 0 0', fontSize: 16, fontWeight: 700, color: C.textPrimary, ...FONT_SMOOTH };
          return wrap(
            <PullTabDrawer label="SIGNAL DIAGNOSTICS" open={!!drawers.signals} onToggle={() => toggleDrawer('signals')}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                {signals.nose_shadow_angle_deg != null && (
                  <div style={cellStyle}>
                    <p style={cellLabel}>NOSE SHADOW</p>
                    <p style={cellValue}>{signals.nose_shadow_angle_deg.toFixed(0)}°</p>
                  </div>
                )}
                {signals.left_right_asymmetry != null && (
                  <div style={cellStyle}>
                    <p style={cellLabel}>L/R ASYMMETRY</p>
                    <p style={cellValue}>{(signals.left_right_asymmetry * 100).toFixed(1)}%</p>
                  </div>
                )}
                {signals.shadow_density != null && (
                  <div style={cellStyle}>
                    <p style={cellLabel}>SHADOW DENSITY</p>
                    <p style={cellValue}>{(signals.shadow_density * 100).toFixed(1)}%</p>
                  </div>
                )}
                {signals.highlight_width_ratio != null && (
                  <div style={cellStyle}>
                    <p style={cellLabel}>HIGHLIGHT WIDTH</p>
                    <p style={cellValue}>{(signals.highlight_width_ratio * 100).toFixed(0)}%</p>
                  </div>
                )}
              </div>
              {sd.final_pattern && (
                <p style={{ margin: '12px 0 0', fontSize: 12, fontWeight: 500, color: C.textSub, ...FONT_SMOOTH }}>
                  Final signal pattern: <span style={{ color: C.textPrimary, fontWeight: 700 }}>{sd.final_pattern.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</span>
                </p>
              )}
            </PullTabDrawer>
          );
        })()}

        {/* ── Pull-tab: Save Details ── */}
        <div style={isDesktop ? { gridColumn: 2 } : undefined}>
        <PullTabDrawer label="SAVE DETAILS" open={!!drawers.save} onToggle={() => toggleDrawer('save')}>
          <InsetField label="SETUP NAME" value={setupName} onChange={setSetupName} placeholder={defaultName} />
          <InsetField label="NOTES" value={notes} onChange={setNotes} placeholder="Any details about this setup…" multiline />
        </PullTabDrawer>
        </div>

        {!isDesktop && <div style={{ flex: 1 }} />}

        {/* ── Start Cockpit CTA (primary) ── */}
        <button
          onClick={handleStartCockpit}
          onPointerDown={() => setSavePressed(true)}
          onPointerUp={() => setSavePressed(false)}
          onPointerLeave={() => setSavePressed(false)}
          style={{
            width: '100%', height: 52, borderRadius: 24,
            background: CTA_BG,
            boxShadow: savePressed ? 'inset 0px 2px 4px rgba(0,0,0,0.5)' : `${CTA_SHADOW}, ${CTA_BEVEL}`,
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            WebkitTapHighlightColor: 'transparent',
            transform: savePressed ? 'scale(0.98)' : 'scale(1)',
            transition: 'transform 0.1s ease, box-shadow 0.1s ease',
            ...(isDesktop ? { gridColumn: '1 / -1', marginTop: 8, maxWidth: 520, justifySelf: 'center' } : null),
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(245,247,250,0.9)', letterSpacing: '0.5px', pointerEvents: 'none', ...FONT_SMOOTH }}>
            Start Cockpit
          </span>
        </button>

        {/* ── Save Setup secondary + Cancel row ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 4px 0',
          ...(isDesktop ? { gridColumn: '1 / -1', maxWidth: 520, width: '100%', justifySelf: 'center' } : null),
        }}>
          <button onClick={handleCancel} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: 500, color: C.textMeta,
            padding: 0,
            WebkitTapHighlightColor: 'transparent', ...FONT_SMOOTH,
          }}>Cancel</button>

          <button
            onClick={handleSave}
            disabled={saved}
            style={{
              background: 'none', border: 'none',
              cursor: saved ? 'default' : 'pointer',
              fontSize: 12, fontWeight: 600,
              color: saved ? C.confHigh : steel(0.75),
              padding: 0,
              display: 'flex', alignItems: 'center', gap: 6,
              WebkitTapHighlightColor: 'transparent',
              transition: 'color 0.2s ease',
              ...FONT_SMOOTH,
            }}
          >
            {saved ? (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                Saved
              </>
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                  <polyline points="17 21 17 13 7 13 7 21"/>
                  <polyline points="7 3 7 8 15 8"/>
                </svg>
                Save Setup
              </>
            )}
          </button>
        </div>
      </div>

      {/* iOS home indicator */}
      <div style={{ height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 1 }}>
        <div style={{ width: 134, height: 5, borderRadius: 3, backgroundColor: 'rgba(245,247,250,0.06)' }} />
      </div>
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
            <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: KEY_ACCENT, letterSpacing: '1.2px', ...FONT_SMOOTH }}>
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
                <p style={{ margin: 0, fontSize: 9, fontWeight: 600, color: steel(0.45), letterSpacing: '0.6px', ...FONT_SMOOTH }}>MODIFIER</p>
                <p style={{ margin: '2px 0 0', fontSize: 14, fontWeight: 700, color: C.textPrimary, ...FONT_SMOOTH }}>{modName}</p>
              </div>
            )}
            {positionDisplay && (
              <div>
                <p style={{ margin: 0, fontSize: 9, fontWeight: 600, color: steel(0.45), letterSpacing: '0.6px', ...FONT_SMOOTH }}>POSITION</p>
                <p style={{ margin: '2px 0 0', fontSize: 14, fontWeight: 700, color: C.textPrimary, ...FONT_SMOOTH }}>{positionDisplay}</p>
              </div>
            )}
            {mod?.distRange && (
              <div>
                <p style={{ margin: 0, fontSize: 9, fontWeight: 600, color: steel(0.45), letterSpacing: '0.6px', ...FONT_SMOOTH }}>DISTANCE</p>
                <p style={{ margin: '2px 0 0', fontSize: 14, fontWeight: 700, color: C.textPrimary, ...FONT_SMOOTH }}>{mod.distRange}</p>
              </div>
            )}
          </div>

          <div style={{ height: 1, backgroundColor: 'rgba(95,124,150,0.1)', marginBottom: 8 }} />

          {result?._raw && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 8px' }}>
              <LightingDiagram result={result} />
            </div>
          )}

          {(directionDisplay || elevDisplay) && (
            <div style={{ display: 'flex', gap: 20, justifyContent: 'center', paddingTop: 4 }}>
              {directionDisplay && <span style={{ fontSize: 10, fontWeight: 600, color: steel(0.55), ...FONT_SMOOTH }}>{directionDisplay}</span>}
              {elevDisplay && <span style={{ fontSize: 10, fontWeight: 600, color: steel(0.55), ...FONT_SMOOTH }}>{elevDisplay} height</span>}
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
            position: 'absolute', top: 24, right: 24,
            width: 36, height: 36, borderRadius: 18,
            background: 'rgba(15,16,19,0.72)',
            border: '1px solid rgba(255,255,255,0.08)',
            color: steel(0.7), fontSize: 20, lineHeight: 1,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            WebkitTapHighlightColor: 'transparent', ...FONT_SMOOTH,
          }}
        >
          ×
        </button>
      </div>
    )}

    {/* ── Mode picker bottom sheet ── */}
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
          margin: 0, fontSize: 10, fontWeight: 700,
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
