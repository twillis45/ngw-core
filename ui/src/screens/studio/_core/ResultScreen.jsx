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

// Pill inset shadow — exact from Figma pill nodes
const PILL_SHADOW = 'inset 1px 1px 2px 0px rgba(0,0,0,0.2), inset 1px 2px 4px 0px rgba(0,0,0,0.4)';

// Drawer handle shadow — matches SetupScreen
const DRAWER_HANDLE_SHADOW = 'inset 0px 1px 3px 0px rgba(0,0,0,0.6), inset 0px 0px 6px 0px rgba(0,0,0,0.3)';

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
  const faceCrop = getFaceCropPosition(result?._raw);
  const isHighConf  = confidence >= 70;
  const confColor   = isHighConf ? C.confHigh : C.confLow;
  const panelTop    = isHighConf ? 497 : 478;
  const leadMargin  = confidence - (sections.patternCandidates[1]?.score ?? 0);

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

  // Warning severity colors
  const SEV_COLOR = { warn: C.confLow, info: steel(0.55), danger: C.textDanger };
  const SEV_BG    = {
    warn:   'rgba(245,190,72,0.08)',
    info:   'rgba(95,124,150,0.07)',
    danger: 'rgba(200,70,70,0.08)',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: '#000', overflow: 'hidden' }}>
    <div
      onClick={(e) => { if (e.target === e.currentTarget) tapHaptic(); }}
      onTouchStart={(e) => { if (e.target === e.currentTarget) grainHaptic(); }}
      onTouchMove={(e) => { if (e.target === e.currentTarget) grainHaptic(); }}
      style={{
      width: '100%',
      maxWidth: isDesktop ? 1180 : 430,
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
        gridTemplateColumns: '430px minmax(0, 1fr)',
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
      <div style={{ position: 'relative', height: panelTop, width: isDesktop ? 430 : undefined, ...(isDesktop ? { gridArea: 'hero' } : null) }}>

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
            top: isZoomed ? 0 : (infoVisible ? 100 : 60),
            left: isZoomed ? 0 : 25,
            right: isZoomed ? 0 : 25,
            height: isZoomed ? '100dvh' : (infoVisible ? 180 : 340),
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
              objectFit: isZoomed ? 'contain' : 'cover',
              objectPosition: isZoomed ? '50% 50%' : faceCrop,
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
            position: 'absolute', top: 290, left: 0, right: 0,
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
            position: 'absolute', top: 415, left: 25, right: 25,
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

        {/* High confidence: scroll affordance */}
        {isHighConf && (
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
      </div>
      {/* ─── end top section ─── */}

      {/* ─── Analytical Panel (pull-tab drawers) ─── */}
      <div style={{
        marginLeft: isDesktop ? 0 : 25,
        marginRight: isDesktop ? 0 : 25,
        marginTop: isDesktop ? 96 : 0,
        maxWidth: isDesktop ? 620 : undefined,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        opacity: infoVisible ? 1 : 0,
        transform: infoVisible ? 'translateY(0)' : 'translateY(60px)',
        transition: isDragging ? 'none' : 'opacity 0.3s ease 0.05s, transform 0.4s cubic-bezier(0.4, 0, 0.2, 1) 0.05s',
        pointerEvents: infoVisible ? 'auto' : 'none',
        ...(isDesktop ? { gridArea: 'panel', alignSelf: 'start' } : null),
      }}>
        {/* Warning chips — compact strip above drawers */}
        {sections.edgeCaseWarnings?.length > 0 && (
          <div style={{
            padding: '2px 4px',
            display: 'flex', flexWrap: 'wrap', gap: 6,
          }}>
            {sections.edgeCaseWarnings.map((w, i) => (
              <div key={i} style={{
                height: 24, paddingLeft: 8, paddingRight: 8,
                borderRadius: 5, display: 'flex', alignItems: 'center',
                backgroundColor: SEV_BG[w.sev] || SEV_BG.info,
                boxShadow: 'inset 1px 1px 2px 0px rgba(0,0,0,0.2)',
              }}>
                <span style={{
                  fontSize: 10, fontWeight: 600,
                  color: SEV_COLOR[w.sev] || steel(0.55),
                  letterSpacing: '0.4px',
                  WebkitFontSmoothing: 'antialiased',
                }}>{w.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* PATTERN CANDIDATES */}
        <PullTabDrawer label="PATTERN CANDIDATES" open={!!drawers.patterns} onToggle={() => toggle('patterns')} maxH={600}>
          <PatternBars candidates={sections.patternCandidates} isHighConf={isHighConf} />
        </PullTabDrawer>

        {/* SHADOW ANALYSIS */}
        <PullTabDrawer label="SHADOW ANALYSIS" open={!!drawers.shadow} onToggle={() => toggle('shadow')} maxH={800}>
          <LightingDiagram result={result} />
          <p style={{ margin: '12px 0 0', fontSize: 13, fontWeight: 400, lineHeight: '19px', color: C.textSub, ...FONT_SMOOTH }}>
            {sections.shadowAnalysis}
          </p>
        </PullTabDrawer>

        {/* SCENE */}
        {(sections.sceneDescription || sections.vlmNarrative) && (
          <PullTabDrawer label="SCENE" open={!!drawers.scene} onToggle={() => toggle('scene')} maxH={800}>
            {sections.sceneDescription && (
              <p style={{ margin: 0, fontSize: 13, fontWeight: 400, lineHeight: '18px', color: C.textSub, ...FONT_SMOOTH }}>
                {sections.sceneDescription}
              </p>
            )}
            {sections.vlmNarrative?.fields?.length > 0 && (
              <div style={{ marginTop: sections.sceneDescription ? 10 : 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {sections.vlmNarrative.fields.map(({ label, value }) => (
                  <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontSize: 9, fontWeight: 600, color: steel(0.50), letterSpacing: '0.6px', ...FONT_SMOOTH }}>
                      {label.toUpperCase()}
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 400, lineHeight: '17px', color: C.textSub, ...FONT_SMOOTH }}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </PullTabDrawer>
        )}

        {/* CATCHLIGHT & MODIFIER */}
        <PullTabDrawer label="CATCHLIGHT & MODIFIER" open={!!drawers.catchlight} onToggle={() => toggle('catchlight')} maxH={700}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 400, lineHeight: '19px', color: C.textSub, ...FONT_SMOOTH }}>
            {sections.catchlightModifier}
          </p>
          <ModifierDetail modifier={sections.modifier} />
          {sections.modifier?.physicalMeaning && (
            <p style={{ margin: '10px 0 0', fontSize: 12, fontWeight: 400, lineHeight: '17px', color: steel(0.45), fontStyle: 'italic', ...FONT_SMOOTH }}>
              {sections.modifier.physicalMeaning}
            </p>
          )}
        </PullTabDrawer>

        {/* COLOR PALETTE */}
        {sections.colorPalette && (
          <PullTabDrawer label="COLOR PALETTE" open={!!drawers.colors} onToggle={() => toggle('colors')} maxH={600}>
            {sections.colorPalette.hexes.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                {sections.colorPalette.hexes.map((hex, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8,
                      backgroundColor: hex,
                      boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.2), 0 1px 3px rgba(0,0,0,0.4)',
                    }} />
                    {sections.colorPalette.colors[i] && (
                      <span style={{ fontSize: 9, color: steel(0.45), textAlign: 'center', maxWidth: 40, lineHeight: 1.2, ...FONT_SMOOTH }}>
                        {sections.colorPalette.colors[i]}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {sections.colorPalette.harmony && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: steel(0.55), letterSpacing: '0.5px', ...FONT_SMOOTH }}>HARMONY</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: C.textSub, ...FONT_SMOOTH }}>
                    {sections.colorPalette.harmony}{sections.colorPalette.warmCool ? ' · warm/cool' : ''}
                  </span>
                </div>
              )}
              {sections.colorPalette.cctKey && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: steel(0.55), letterSpacing: '0.5px', ...FONT_SMOOTH }}>KEY CCT</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: C.textSub, ...FONT_SMOOTH }}>{sections.colorPalette.cctKey}</span>
                </div>
              )}
              {sections.colorPalette.cctShadows && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: steel(0.55), letterSpacing: '0.5px', ...FONT_SMOOTH }}>SHADOW CCT</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: C.textSub, ...FONT_SMOOTH }}>{sections.colorPalette.cctShadows}</span>
                </div>
              )}
              {sections.colorPalette.character && (
                <p style={{ margin: '4px 0 0', fontSize: 12, fontWeight: 400, lineHeight: '17px', color: steel(0.45), fontStyle: 'italic', ...FONT_SMOOTH }}>
                  {sections.colorPalette.character}
                </p>
              )}
            </div>
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
            {sections.signalQuality.passSummaries && Object.keys(sections.signalQuality.passSummaries).length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 600, color: steel(0.55), letterSpacing: '0.5px', ...FONT_SMOOTH }}>
                  PASS RELIABILITY
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {Object.entries(sections.signalQuality.passSummaries).map(([pass, level]) => {
                    const color = level === 'high' ? C.confHigh : level === 'moderate' ? steel(0.6) : C.confLow;
                    const label = pass.replace(/_pass$/, '').replace(/_/g, ' ');
                    return (
                      <div key={pass} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 11, fontWeight: 400, color: steel(0.45), ...FONT_SMOOTH }}>{label}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color, ...FONT_SMOOTH }}>{level}</span>
                      </div>
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
