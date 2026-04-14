/**
 * ProcessingScreen — Studio Matte design
 * Layout-identical to HomeScreen: full-width fluid viewfinder, bottom-anchored
 * button with well + trough, same matte surface. State differences:
 *   - Photo dimmed to 0.78 with slow zoom (pros can clearly see their image during analysis)
 *   - Green ring glow replaces blue-steel idle ring
 *   - LED breathing green + halo bloom on button
 *   - "ANALYZING" engraved label on dome (matches HomeScreen typography)
 *   - Pipeline stage sub-label rotates below the dome label
 *   - Scan line sweeps across viewfinder
 *   - Green progress bar in home indicator
 *   - EXIF strip persists from HomeScreen (continuity)
 */
import { useState, useEffect, useRef } from 'react';
import { successHaptic }        from '../../../utils/haptics';
import { processingPulseSound } from '../../../utils/sounds';
import { loadSettings }         from '../../../data/settingsStore';
import { useDeviceTilt, glassReflectionTransform } from '../../../utils/useDeviceTilt';
import prettify                 from '../../../utils/prettify';
import useStableViewport        from '../../../utils/useStableViewport';
import analyzeTrackAlive      from '../../../assets/day1/analyze-track-alive.svg';
import ellipseBg              from '../../../assets/day1/ellipse-bg.svg';

import { steel, C as SM_C, GLASS_REFLECTION, LENS_VIGNETTE, VIEWFINDER_INNER_SHADOW, VF_DITHER_NOISE } from '../../../theme/studioMatte';
import MatteBackground from '../_shared/MatteBackground';
import ViewfinderHUD from '../_shared/ViewfinderHUD';
import ExifStrip from '../_shared/ExifStrip';

const C = { ...SM_C, border: 'rgba(167,173,183,0.06)' };

// Pipeline stage descriptions — real engine steps in photographer-friendly language.
// Timed to roughly track actual analysis cadence (~6–8s total).
// Pipeline stage labels — short enough to read in <2s at glance speed.
// Detail line removed; the label alone carries the narrative.
const STAGE_MESSAGES = [
  { label: 'Reading the light…' },
  { label: 'Mapping catchlights…' },
  { label: 'Tracing shadows…' },
  { label: 'Identifying pattern…' },
  { label: 'Analyzing modifier…' },
  { label: 'Counting sources…' },
  { label: 'Building blueprint…' },
];

export default function ProcessingScreen({ imagePreview, analysisComplete, exifData, result, onCancel }) {
  const tilt = useDeviceTilt();
  const [progress, setProgress] = useState(0);
  const pulseStopRef = useRef(null);
  const [stageIdx, setStageIdx] = useState(0);
  const [stageFade, setStageFade] = useState(1);
  // Daylight brightness boost — read from persisted settings so the boost
  // carries through from HomeScreen without a prop dependency.
  const [daylightMode] = useState(() => {
    try { const s = loadSettings(); return !!s.daylightMode; } catch { return false; }
  });

  useEffect(() => {
    pulseStopRef.current = processingPulseSound();
    return () => { if (pulseStopRef.current) pulseStopRef.current(); };
  }, []);

  useEffect(() => {
    if (analysisComplete) return;
    const interval = setInterval(() => {
      setProgress(p => Math.min(p + Math.random() * 8 + 3, 90));
    }, 400);
    return () => clearInterval(interval);
  }, [analysisComplete]);

  useEffect(() => {
    if (analysisComplete) {
      // Animate progress to 100% with a brief deceleration instead of snapping
      const steps = [92, 95, 97, 99, 100];
      steps.forEach((v, i) => setTimeout(() => setProgress(v), i * 80));
      if (pulseStopRef.current) { pulseStopRef.current(); pulseStopRef.current = null; }
    }
  }, [analysisComplete]);

  // ── Success haptic — fires when the pattern tease appears, not on raw
  //    completion. The haptic confirms the *answer*, not the state change. ──
  const teaseHapticFired = useRef(false);
  useEffect(() => {
    if (analysisComplete && result?.pattern && !teaseHapticFired.current) {
      teaseHapticFired.current = true;
      // Slight delay so haptic lands at the peak of the tease-in animation
      setTimeout(() => successHaptic(), 250);
    }
  }, [analysisComplete, result?.pattern]);

  // ── Stage message rotation ──
  useEffect(() => {
    if (analysisComplete) return;
    const interval = setInterval(() => {
      setStageFade(0);
      setTimeout(() => {
        setStageIdx(i => (i + 1) % STAGE_MESSAGES.length);
        setStageFade(1);
      }, 300);
    }, 2200);
    return () => clearInterval(interval);
  }, [analysisComplete]);

  const currentStage = STAGE_MESSAGES[stageIdx];


  // ── Layout geometry (shared hook — identical to HomeScreen) ──
  const { stableVH, safeBottom, isDesktop } = useStableViewport();
  const BTN_D   = isDesktop ? 168 : 136;
  const WELL_D  = isDesktop ? 180 : 146;
  const TRK_D   = isDesktop ? 174 : 142;
  const LBL_FONT = isDesktop ? 14 : 13;

  const BTN_OFFSET_FROM_BOTTOM = 48;
  const BTN_CY = stableVH - safeBottom - BTN_OFFSET_FROM_BOTTOM - Math.round(BTN_D / 2);
  const BTN_TOP  = BTN_CY - BTN_D  / 2;
  const WELL_TOP = BTN_CY - WELL_D / 2;
  const TRK_TOP  = BTN_CY - TRK_D  / 2;
  const LBL_TOP  = BTN_CY - 9;

  const VF_TOP = 100;
  const VF_GAP = 16;
  const VF_HEIGHT = Math.max(280, WELL_TOP - VF_GAP - VF_TOP);
  const VF_BOTTOM = VF_TOP + VF_HEIGHT;

  // Green ring color for analyzing state
  const greenRing = 'rgba(72,186,136,0.55)';
  const greenGlow = 'rgba(72,186,136,0.25)';

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: '#000', overflow: 'hidden' }}>
    <div
      style={{
      position: 'relative',
      width: '100%',
      maxWidth: isDesktop ? 680 : undefined,
      height: '100%',
      backgroundColor: C.bg,
      overflow: 'hidden',
      fontFamily: 'Inter, system-ui, sans-serif',
      margin: isDesktop ? '0 auto' : undefined,
      boxShadow: isDesktop ? '2px 4px 40px rgba(0,0,0,0.6)' : undefined,
      filter: daylightMode ? 'brightness(1.15)' : undefined,
      transition: 'filter 0.4s ease',
    }}>
      <MatteBackground />

      {/* Cancel — abort analysis and return to HomeScreen. Uses the same
          back-chevron glyph and position as ResultScreen so the navigation
          affordance is identical across all screens (Apple consistency rule). */}
      {onCancel && !analysisComplete && (
        <button
          aria-label="Cancel analysis"
          onClick={onCancel}
          style={{
            position: 'absolute', top: 52, left: 8,
            width: 44, height: 44, zIndex: 30,
            background: 'none', border: 'none', cursor: 'pointer',
            overflow: 'hidden',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <span style={{
            position: 'absolute', left: 14, top: 8,
            fontSize: 22, fontWeight: 600, color: '#a7adb7', lineHeight: 1,
            WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', textRendering: 'geometricPrecision',
          }}>‹</span>
        </button>
      )}

      {/* ── Viewfinder — full-width, fluid, edge-to-edge (identical to HomeScreen) ── */}
      <div style={{
        position: 'absolute',
        top: VF_TOP,
        left: 0,
        right: 0,
        height: VF_HEIGHT,
        borderRadius: 0,
        overflow: 'hidden',
        backgroundColor: 'transparent',
        WebkitTapHighlightColor: 'transparent',
      }}>
        {/* User's photo — dimmed for analysis, slow dramatic zoom */}
        {imagePreview && (
          <img key={imagePreview} src={imagePreview} alt="Analyzing" style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', objectPosition: '50% 25%', opacity: 0.78, zIndex: 1,
            animation: 'heroZoomIn 12s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards',
            transformOrigin: 'center 30%',
          }} />
        )}

        {/* Ellipse depth oval (same as HomeScreen) */}
        <div style={{ position: 'absolute', left: '2.8%', top: -30, right: '2.8%', bottom: 10, zIndex: 1, opacity: 0.5 }}>
          <img src={ellipseBg} alt="" style={{ width: '100%', height: '100%' }} />
        </div>

        <ViewfinderHUD dimmed />

        {/* Progress — green glow at VF bottom edge */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, width: `${progress}%`, height: 4,
          background: 'linear-gradient(90deg, rgba(72,186,136,0.0) 0%, rgba(72,186,136,0.40) 50%, rgba(72,186,136,0.75) 100%)',
          boxShadow: '0 0 12px rgba(72,186,136,0.30), 0 0 4px rgba(72,186,136,0.45)',
          transition: analysisComplete ? 'width 0.08s ease' : 'width 0.35s ease',
          zIndex: 4,
        }} />

        {/* EXIF readout strip — persists from HomeScreen for continuity.
            Fades out when pattern tease appears (EXIF is no longer relevant
            once the answer has landed). */}
        <ExifStrip exifData={exifData} style={{
          opacity: (analysisComplete && result?.pattern) ? 0 : 1,
          transition: 'opacity 0.4s ease',
        }} />

        {/* Glass overlay (identical to HomeScreen) */}
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 5 }}>
          <div style={{ position: 'absolute', inset: 0, background: LENS_VIGNETTE }} />
          <div style={{ position: 'absolute', top: 0, left: 0, right: '5%', bottom: 0, background: GLASS_REFLECTION, borderRadius: 0, opacity: 0.62, transform: glassReflectionTransform(tilt), willChange: 'transform' }} />
          <div style={{ position: 'absolute', inset: 0, backgroundImage: VF_DITHER_NOISE, backgroundSize: '200px 200px', opacity: 0.28, mixBlendMode: 'overlay', pointerEvents: 'none' }} />
        </div>

        {/* Inner shadow (identical to HomeScreen) */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 0,
          pointerEvents: 'none', boxShadow: VIEWFINDER_INNER_SHADOW, zIndex: 6,
        }} />

        {/* ── Stage narrative — centered inside the viewfinder, the hero
            text element during analysis. Each stage fades in/out on a gentle
            vertical slide so the progression feels alive. Gradient scrim at
            the bottom keeps legibility over any photo content. ── */}
        {!analysisComplete && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            padding: '48px 24px 22px',
            background: 'linear-gradient(to bottom, transparent 0%, rgba(4,5,7,0.55) 40%, rgba(4,5,7,0.88) 100%)',
            zIndex: 7, pointerEvents: 'none',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
          }}>
            <p style={{
              margin: 0,
              fontFamily: 'Inter, system-ui, sans-serif',
              fontWeight: 500, fontSize: isDesktop ? 16 : 14, lineHeight: '20px',
              color: 'rgba(235,240,245,0.88)',
              letterSpacing: '0.2px',
              textAlign: 'center',
              textShadow: '0 1px 4px rgba(0,0,0,0.6), 0 0 16px rgba(72,186,136,0.15)',
              WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale',
              opacity: stageFade,
              transform: stageFade === 1 ? 'translateY(0)' : 'translateY(6px)',
              transition: 'opacity 0.35s ease, transform 0.35s ease',
            }}>{currentStage.label}</p>
          </div>
        )}

        {/* ── Pattern tease — flashes the identified pattern on the photo
            when analysis completes, before the screen transitions to results.
            1.2s dwell in Day1DemoApp gives this time to register. Fades in
            from the bottom with a warm glow so it reads as a "reveal". */}
        {analysisComplete && result?.pattern && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            padding: '36px 20px 18px',
            background: 'linear-gradient(to bottom, transparent 0%, rgba(4,5,7,0.70) 40%, rgba(4,5,7,0.92) 100%)',
            zIndex: 7,
            animation: 'patternTeaseIn 0.5s cubic-bezier(0.16, 0.84, 0.32, 1.18) forwards',
          }}>
            <p style={{
              margin: 0,
              fontSize: 24, fontWeight: 700,
              color: 'rgba(245,247,250,0.92)',
              letterSpacing: '-0.3px',
              textAlign: 'center',
              textShadow: '0 0 18px rgba(245,190,72,0.35), 0 2px 8px rgba(0,0,0,0.7)',
              WebkitFontSmoothing: 'antialiased',
              MozOsxFontSmoothing: 'grayscale',
            }}>
              {prettify(result.pattern, { title: true })}
            </p>
            {result.confidence != null && (
              <p style={{
                margin: '4px 0 0',
                fontSize: 11, fontWeight: 600,
                color: result.confidence >= 70 ? 'rgba(140,225,180,0.85)' : 'rgba(250,210,130,0.85)',
                letterSpacing: '0.8px',
                textAlign: 'center',
                textTransform: 'uppercase',
                WebkitFontSmoothing: 'antialiased',
                MozOsxFontSmoothing: 'grayscale',
              }}>
                {result.confidence >= 70 ? 'STRONG READ' : 'PARTIAL READ'} · {Math.round(result.confidence)}%
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Button Trough (identical to HomeScreen) ── */}
      <div style={{
        position: 'absolute', left: 0, right: 0,
        top: VF_BOTTOM + 10,
        height: Math.max(stableVH - (VF_BOTTOM + 10), BTN_D + 80),
        pointerEvents: 'none',
        background: 'linear-gradient(180deg, rgba(0,0,0,0.42) 0%, rgba(0,0,0,0.18) 18%, rgba(0,0,0,0.10) 55%, rgba(0,0,0,0.22) 100%)',
        boxShadow: [
          'inset 0 2px 4px rgba(0,0,0,0.78)',
          'inset 0 1px 1px rgba(0,0,0,0.55)',
          'inset 0 3px 0 rgba(255,255,255,0.025)',
          'inset 6px 0 12px rgba(0,0,0,0.30)',
          'inset -6px 0 12px rgba(0,0,0,0.20)',
          'inset 0 -2px 4px rgba(132,158,184,0.04)',
        ].join(', '),
      }} />

      {/* ── Track ring (identical to HomeScreen — alive state) ── */}
      <div style={{
        position: 'absolute', left: '50%', top: TRK_TOP, width: TRK_D, height: TRK_D,
        transform: 'translateX(-50%)', pointerEvents: 'none',
      }}>
        <img src={analyzeTrackAlive} alt="" style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          animation: 'ringAnalyzePulse 2.0s linear infinite',
        }} />
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%', pointerEvents: 'none',
          background: 'linear-gradient(141.71deg, rgba(255,255,255,0.10) 0%, transparent 35%, transparent 65%, rgba(0,0,0,0.15) 100%)',
        }} />
      </div>

      {/* ── Well (identical to HomeScreen — green-tinted for analyzing) ── */}
      <div style={{
        position: 'absolute', left: '50%', top: WELL_TOP, width: WELL_D, height: WELL_D,
        transform: 'translateX(-50%)', pointerEvents: 'none',
        borderRadius: '50%',
        background: 'radial-gradient(circle at 50% 44%, #010102 0%, #040508 32%, #09090d00 68%, transparent 100%), linear-gradient(141.71deg, #04050610 0%, #0a0b0f08 100%)',
        boxShadow: [
          'inset 12px 12px 24px rgba(0,0,0,0.97)',
          'inset 7px 7px 14px rgba(0,0,0,0.90)',
          'inset 3px 3px 6px rgba(0,0,0,0.78)',
          'inset 1px 1px 2px rgba(0,0,0,0.60)',
          // Green LED light trapped inside
          'inset 0 0 12px rgba(72,186,136,0.10)',
          'inset 0 0 5px rgba(72,186,136,0.06)',
          'inset -2px -2px 5px rgba(255,255,255,0.018)',
          '-1px -1px 1px rgba(255,255,255,0.055)',
          '5px 7px 18px rgba(0,0,0,0.72)',
          '2px 3px 6px rgba(0,0,0,0.50)',
        ].join(', '),
      }} />

      {/* ── Button dome (identical to HomeScreen alive state — CSS, not SVG) ── */}
      <div style={{
        position: 'absolute', left: '50%', top: BTN_TOP, width: BTN_D, height: BTN_D,
        transform: 'translateX(-50%)',
        pointerEvents: 'none',
        borderRadius: '50%', willChange: 'transform',
        background: 'linear-gradient(141.71deg, #2e3444 0%, #171c28 50%, #07080c 100%)',
        boxShadow: [
          '14px 14px 36px rgba(0,0,0,0.98)',
          '7px 7px 18px rgba(0,0,0,0.86)',
          '3px 3px 7px rgba(0,0,0,0.65)',
          '-2px -2px 4px rgba(255,255,255,0.11)',
          'inset 0 2px 0 rgba(255,255,255,0.22)',
          'inset 2px 0 0 rgba(255,255,255,0.13)',
          'inset -1px -1px 0 rgba(0,0,0,0.55)',
        ].join(', '),
        animation: analysisComplete ? 'completePulse 0.6s ease-out' : undefined,
      }} />

      {/* ── LED ring — green analyzing glow (replaces blue-steel idle) ── */}
      <div style={{
        position: 'absolute', left: '50%', top: BTN_TOP, width: BTN_D, height: BTN_D,
        transform: 'translateX(-50%)', borderRadius: '50%', pointerEvents: 'none',
        willChange: 'transform',
        boxShadow: [
          `0 0 0 1px ${greenRing}`,
          `-1px -1px 0 0 rgba(72,186,136,0.70)`,
          `1px 1px 0 0 rgba(0,0,0,0.28)`,
          `0 0 12px ${greenGlow}`,
          `0 0 24px rgba(72,186,136,0.12)`,
        ].join(', '),
        animation: 'ringAnalyzeGlow 2.0s linear infinite',
      }} />


      {/* ── Primary dome label — engraved instrument lettering matching HomeScreen.
           "ANALYZING" during analysis, "DONE" on completion. Same typography as
           HomeScreen's "See the Light": Inter 600, 12px, 3px tracking, all-caps,
           centered on the button dome. Green-tinted for the processing state. ── */}
      <p style={{
        position: 'absolute',
        top: LBL_TOP, left: '50%', width: BTN_D,
        transform: 'translateX(-50%)',
        margin: 0, fontWeight: 600, fontSize: isDesktop ? 13 : 12, lineHeight: '16px',
        color: analysisComplete ? 'rgba(140,225,180,0.92)' : 'rgba(140,225,180,0.85)',
        letterSpacing: '3px',
        textTransform: 'uppercase',
        textShadow: analysisComplete
          ? '0 0 10px rgba(140,225,180,0.35)'
          : '0 0 8px rgba(72,186,136,0.25)',
        textAlign: 'center', whiteSpace: 'nowrap', pointerEvents: 'none',
        WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale',
        transition: 'color 0.3s ease, text-shadow 0.3s ease',
      }}>{analysisComplete ? 'Done' : 'Analyzing'}</p>

      {/* Stage label moved to viewfinder overlay — see "Stage narrative" above. */}

      {/* Home indicator removed — transient state, no nav bar needed.
           Progress is shown via the VF bottom green line + stage messages. */}

      <style>{`
        @keyframes heroZoomIn {
          0%   { transform: scale(1.00); }
          100% { transform: scale(1.06); }
        }
        @keyframes ringAnalyzePulse {
          0%   { filter: brightness(0.9); }
          50%  { filter: brightness(1.25); }
          100% { filter: brightness(0.9); }
        }
        @keyframes ringAnalyzeGlow {
          0%   { opacity: 0.7; }
          50%  { opacity: 1.0; }
          100% { opacity: 0.7; }
        }
        @keyframes patternTeaseIn {
          0%   { opacity: 0; transform: translateY(12px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes completePulse {
          0%   { filter: brightness(1.0); }
          40%  { filter: brightness(1.35); }
          100% { filter: brightness(1.0); }
        }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after {
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </div>
    </div>
  );
}
