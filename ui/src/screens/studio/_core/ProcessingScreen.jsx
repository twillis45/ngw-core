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
import { successHaptic, tapHaptic, grainHaptic } from '../../../utils/haptics';
import { processingPulseSound } from '../../../utils/sounds';
import { loadSettings }         from '../../../data/settingsStore';
import { useDeviceTilt, glassReflectionTransform } from '../../../utils/useDeviceTilt';
import prettify                 from '../../../utils/prettify';
import useStableViewport        from '../../../utils/useStableViewport';
import analyzeTrackAlive      from '../../../assets/day1/analyze-track-alive.svg';
import ellipseBg              from '../../../assets/day1/ellipse-bg.svg';

import { steel, C as SM_C, GLASS_REFLECTION, LENS_VIGNETTE, VIEWFINDER_INNER_SHADOW, SCREEN_BG } from '../../../theme/studioMatte';
import MatteBackground from '../_shared/MatteBackground';
import ViewfinderHUD from '../_shared/ViewfinderHUD';
import ExifStrip from '../_shared/ExifStrip';

const C = { ...SM_C, border: 'rgba(167,173,183,0.06)' };

// Pipeline stage labels — photographer's internal monologue.
// Each line is what a master lighter would think while studying the print.
// Not technical engine steps, not generic loading — the thought process
// of someone who actually understands light reading a portrait.
const STAGE_MESSAGES = [
  { label: 'Where is the key coming from…' },
  { label: 'Reading the catchlights…' },
  { label: 'Following the shadow edge…' },
  { label: 'Checking the fill side…' },
  { label: 'What modifier makes this wrap…' },
  { label: 'How many sources in the setup…' },
  { label: 'Building the recreation blueprint…' },
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

  const FS = { WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', textRendering: 'geometricPrecision' };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: SCREEN_BG, overflow: 'hidden' }}>
    <div
      onClick={(e) => { if (e.target === e.currentTarget) tapHaptic(); }}
      onTouchStart={(e) => { if (e.target === e.currentTarget) grainHaptic(); }}
      onTouchMove={(e) => { if (e.target === e.currentTarget) grainHaptic(); }}
      style={{
      position: 'relative',
      width: '100%',
      maxWidth: isDesktop ? undefined : 430,
      height: '100%',
      margin: '0 auto',
      backgroundColor: SCREEN_BG,
      boxShadow: isDesktop ? undefined : '2px 4px 40px rgba(0,0,0,0.6), -1px -1px 1px rgba(255,255,255,0.02)',
      overflow: 'hidden',
      fontFamily: 'Inter, system-ui, sans-serif',
      filter: daylightMode ? 'brightness(1.15)' : undefined,
      transition: 'filter 0.4s ease',
      // Desktop: single-column — photo fills viewport, status overlays centered
      ...(isDesktop ? { display: 'grid', gridTemplateColumns: '1fr', gridTemplateRows: '1fr' } : {}),
    }}>
      <MatteBackground />

      {/* Cancel — mobile only */}
      {!isDesktop && onCancel && !analysisComplete && (
        <button
          aria-label="Cancel analysis"
          onClick={onCancel}
          style={{
            position: 'absolute', top: 52, left: 8,
            width: 44, height: 44, zIndex: 30,
            background: 'none', border: 'none', cursor: 'pointer',
            overflow: 'hidden', WebkitTapHighlightColor: 'transparent',
          }}
        >
          <span style={{ position: 'absolute', left: 14, top: 8, fontSize: 22, fontWeight: 600, color: '#a7adb7', lineHeight: 1, ...FS }}>‹</span>
        </button>
      )}

      {/* ── Viewfinder — fills entire viewport on desktop ── */}
      <div style={{
        position: isDesktop ? 'relative' : 'absolute',
        top: isDesktop ? undefined : VF_TOP,
        left: isDesktop ? undefined : 0,
        right: isDesktop ? undefined : 0,
        height: isDesktop ? '100%' : VF_HEIGHT,
        gridColumn: isDesktop ? '1 / -1' : undefined,
        gridRow: isDesktop ? '1 / -1' : undefined,
        borderRadius: 0, overflow: 'hidden',
        backgroundColor: 'transparent',
      }}>
        {imagePreview && (
          <img key={imagePreview} src={imagePreview} alt="Analyzing" style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: isDesktop ? 'contain' : 'cover',
            objectPosition: isDesktop ? '50% 50%' : '50% 25%',
            opacity: analysisComplete ? 0.88 : 0.72, zIndex: 1,
            animation: 'heroZoomIn 12s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards',
            transformOrigin: 'center 30%',
            transition: 'opacity 0.8s ease',
          }} />
        )}
        <div style={{ position: 'absolute', left: '2.8%', top: -30, right: '2.8%', bottom: 10, zIndex: 1, opacity: 0.5 }}>
          <img src={ellipseBg} alt="" style={{ width: '100%', height: '100%' }} />
        </div>
        <ViewfinderHUD dimmed />

        {/* Scan line removed — clean photo analysis without visual noise */}

        {/* ── Pulsing edge glow — ambient energy showing the machine is alive ── */}
        {!analysisComplete && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none',
            boxShadow: [
              'inset 0 0 60px rgba(72,186,136,0.04)',
              'inset 0 0 120px rgba(72,186,136,0.02)',
            ].join(', '),
            animation: 'procEdgePulse 2.4s ease-in-out infinite',
          }} />
        )}

        {/* Progress — green glow at bottom edge */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, width: `${progress}%`, height: isDesktop ? 4 : 4,
          background: 'linear-gradient(90deg, rgba(72,186,136,0.0) 0%, rgba(72,186,136,0.50) 40%, rgba(72,186,136,0.85) 100%)',
          boxShadow: '0 0 16px rgba(72,186,136,0.40), 0 0 6px rgba(72,186,136,0.55)',
          transition: analysisComplete ? 'width 0.08s ease' : 'width 0.35s ease',
          zIndex: 4,
        }} />
        <ExifStrip exifData={exifData} style={{
          opacity: (analysisComplete && result?.pattern) ? 0 : 1,
          transition: 'opacity 0.4s ease',
        }} />
        {/* Glass overlay */}
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 5 }}>
          <div style={{ position: 'absolute', inset: 0, background: LENS_VIGNETTE }} />
          <div style={{ position: 'absolute', top: 0, left: 0, right: '5%', bottom: 0, background: GLASS_REFLECTION, borderRadius: 0, opacity: 0.62, transform: glassReflectionTransform(tilt), willChange: 'transform' }} />
        </div>
        <div style={{ position: 'absolute', inset: 0, borderRadius: 0, pointerEvents: 'none', boxShadow: VIEWFINDER_INNER_SHADOW, zIndex: 6 }} />

        {/* Stage narrative — mobile overlay.
             Styled as a frosted glass readout panel, not floating text.
             Stage copy is the hero, progress % is the instrument readout. */}
        {!isDesktop && !analysisComplete && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            padding: '40px 20px 20px',
            background: 'linear-gradient(to bottom, transparent 0%, rgba(4,5,8,0.50) 30%, rgba(4,5,8,0.85) 100%)',
            zIndex: 7, pointerEvents: 'none',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0,
          }}>
            {/* Frosted glass readout card */}
            <div style={{
              padding: '14px 24px 12px',
              borderRadius: 14,
              background: 'rgba(8,10,16,0.55)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(72,186,136,0.10)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              minWidth: 240,
            }}>
              {/* Stage label — the thought */}
              <p style={{
                margin: 0, fontWeight: 600, fontSize: 16, lineHeight: '22px',
                color: 'rgba(235,240,245,0.92)', letterSpacing: '0.1px', textAlign: 'center',
                textShadow: '0 0 12px rgba(72,186,136,0.20)',
                ...FS, opacity: stageFade,
                transform: stageFade === 1 ? 'translateY(0)' : 'translateY(4px)',
                transition: 'opacity 0.35s ease, transform 0.35s ease',
                minHeight: 22,
              }}>{currentStage.label}</p>
              {/* Progress readout — instrument style */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, marginTop: 2,
              }}>
                {/* Thin progress bar */}
                <div style={{
                  width: 80, height: 2, borderRadius: 1,
                  background: 'rgba(72,186,136,0.15)',
                  overflow: 'hidden',
                }}>
                  <div style={{
                    width: `${Math.round(progress)}%`, height: '100%',
                    background: 'rgba(72,186,136,0.65)',
                    borderRadius: 1,
                    transition: 'width 0.3s ease',
                  }} />
                </div>
                <p style={{
                  margin: 0, fontWeight: 700, fontSize: 11, letterSpacing: '1.5px',
                  color: 'rgba(72,186,136,0.55)', fontVariantNumeric: 'tabular-nums',
                  ...FS,
                }}>{Math.round(progress)}%</p>
              </div>
            </div>
          </div>
        )}
        {/* Pattern tease — mobile overlay */}
        {!isDesktop && analysisComplete && result?.pattern && (
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0,
            padding: '36px 20px 18px',
            background: 'linear-gradient(to bottom, transparent 0%, rgba(11,11,12,0.70) 40%, rgba(11,11,12,0.92) 100%)',
            zIndex: 7, animation: 'patternTeaseIn 0.5s cubic-bezier(0.16, 0.84, 0.32, 1.18) forwards',
          }}>
            <p style={{ margin: 0, fontSize: 24, fontWeight: 700, color: 'rgba(245,247,250,0.92)', letterSpacing: '-0.3px', textAlign: 'center', textShadow: '0 0 18px rgba(245,190,72,0.35), 0 2px 8px rgba(0,0,0,0.7)', ...FS }}>
              {prettify(result.pattern, { title: true })}
            </p>
            {result.confidence != null && (
              <p style={{ margin: '4px 0 0', fontSize: 13, fontWeight: 600, color: result.confidence >= 70 ? 'rgba(140,225,180,0.85)' : 'rgba(250,210,130,0.85)', letterSpacing: '0.8px', textAlign: 'center', textTransform: 'uppercase', ...FS }}>
                {result.confidence >= 70 ? 'STRONG READ' : 'PARTIAL READ'} · {Math.round(result.confidence)}%
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Desktop overlay — glass + bottom-anchored status ── */}
      {isDesktop && (<>
        {/* Glass overlay on the photo — same as HomeScreen loaded state */}
        <div style={{
          gridColumn: '1 / -1', gridRow: '1 / -1',
          position: 'relative', zIndex: 11, pointerEvents: 'none',
        }}>
          <div style={{ position: 'absolute', inset: 0, background: LENS_VIGNETTE }} />
          <div style={{
            position: 'absolute', top: 0, left: 0, right: '5%', bottom: 0,
            background: GLASS_REFLECTION, opacity: 0.4,
            transform: glassReflectionTransform(tilt), willChange: 'transform',
          }} />
          <div style={{ position: 'absolute', inset: 0, boxShadow: VIEWFINDER_INNER_SHADOW }} />
        </div>

        {/* Status overlay */}
        <div style={{
          gridColumn: '1 / -1', gridRow: '1 / -1',
          position: 'relative', zIndex: 12,
          display: 'flex', flexDirection: 'column',
          pointerEvents: 'none',
        }}>
          {/* Top bar — wordmark only (no cancel button on desktop — the
              hero image should be clean; cancel is available via browser back) */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '20px 36px',
            background: 'linear-gradient(180deg, rgba(6,7,10,0.75) 0%, rgba(6,7,10,0.30) 60%, transparent 100%)',
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <p style={{ margin: 0, fontWeight: 800, fontSize: 17, lineHeight: 1, color: C.textPrimary, letterSpacing: '-0.3px', ...FS }}>No Guesswork</p>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 8.5, lineHeight: 1, color: steel(0.32), letterSpacing: '3px', ...FS }}>LIGHTING</p>
            </div>
          </div>

          {/* Spacer — pushes status to bottom */}
          <div style={{ flex: 1 }} />

          {/* ── Desktop status: confident center-screen readout.
              Stage text is the hero during processing — large, centered,
              reads like a monitoring instrument. Photo + scan line show
              the engine working. Pattern tease appears centered on done. ── */}

          {/* Center stage — analyzing readout */}
          {!analysisComplete && (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none',
            }}>
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
                padding: '32px 48px', borderRadius: 20,
                background: 'rgba(4,5,8,0.55)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                boxShadow: '0 8px 40px rgba(0,0,0,0.40), inset 0 1px 0 rgba(255,255,255,0.04)',
                border: '1px solid rgba(72,186,136,0.08)',
                animation: 'procCardBorder 3.2s ease-in-out infinite',
              }}>
                {/* Status indicator removed — scan line + edge glow provide enough visual activity */}
                <p style={{
                  margin: 0, fontWeight: 600, fontSize: 22, lineHeight: '28px',
                  color: 'rgba(235,240,245,0.90)', textAlign: 'center',
                  letterSpacing: '0.3px',
                  ...FS, opacity: stageFade,
                  transform: stageFade === 1 ? 'translateY(0)' : 'translateY(6px)',
                  transition: 'opacity 0.4s ease, transform 0.4s ease',
                  minHeight: 28,
                }}>{currentStage.label}</p>
                {/* Percentage readout */}
                <p style={{
                  margin: 0, fontWeight: 700, fontSize: 13, letterSpacing: '2px',
                  color: 'rgba(72,186,136,0.65)', textTransform: 'uppercase',
                  ...FS,
                }}>{Math.round(progress)}%</p>
              </div>
            </div>
          )}

          {/* Bottom dock — EXIF + gradient */}
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '0 0 44px', pointerEvents: 'none',
            background: 'linear-gradient(to bottom, transparent 0%, rgba(11,11,12,0.30) 40%, rgba(11,11,12,0.70) 80%, rgba(11,11,12,0.85) 100%)',
          }}>
            <ExifStrip exifData={exifData} style={{
              opacity: (analysisComplete && result?.pattern) ? 0 : 0.65,
              transition: 'opacity 0.4s ease',
            }} />
          </div>

          {/* Pattern tease — centered on completion */}
          {analysisComplete && result?.pattern && (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none',
              animation: 'patternTeaseIn 0.6s cubic-bezier(0.16, 0.84, 0.32, 1.18) forwards',
            }}>
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                padding: '36px 56px', borderRadius: 24,
                background: 'rgba(4,5,8,0.60)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                boxShadow: '0 12px 48px rgba(0,0,0,0.50), inset 0 1px 0 rgba(255,255,255,0.05)',
              }}>
                <p style={{
                  margin: 0, fontSize: 44, fontWeight: 700,
                  color: 'rgba(245,247,250,0.95)', letterSpacing: '-0.6px', textAlign: 'center',
                  textShadow: '0 0 28px rgba(245,190,72,0.35), 0 4px 20px rgba(0,0,0,0.7)',
                  ...FS,
                }}>
                  {prettify(result.pattern, { title: true })}
                </p>
                {result.confidence != null && (
                  <p style={{
                    margin: 0, fontSize: 14, fontWeight: 600,
                    color: result.confidence >= 70 ? 'rgba(140,225,180,0.85)' : 'rgba(250,210,130,0.85)',
                    letterSpacing: '2px', textTransform: 'uppercase',
                    ...FS,
                  }}>
                    {result.confidence >= 70 ? 'STRONG READ' : 'PARTIAL READ'} · {Math.round(result.confidence)}%
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </>)}

      {/* ── Mobile-only: button trough, well, dome, ring, label ── */}
      {!isDesktop && <>
      {/* Button Trough */}
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

      {/* Track ring */}
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

      {/* Well */}
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
          'inset 0 0 12px rgba(72,186,136,0.10)',
          'inset 0 0 5px rgba(72,186,136,0.06)',
          'inset -2px -2px 5px rgba(255,255,255,0.018)',
          '-1px -1px 1px rgba(255,255,255,0.055)',
          '5px 7px 18px rgba(0,0,0,0.72)',
          '2px 3px 6px rgba(0,0,0,0.50)',
        ].join(', '),
      }} />

      {/* Button dome */}
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

      {/* LED ring */}
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

      {/* Dome label */}
      <p style={{
        position: 'absolute',
        top: LBL_TOP, left: '50%', width: BTN_D,
        transform: 'translateX(-50%)',
        margin: 0, fontWeight: 600, fontSize: 13, lineHeight: '16px',
        color: analysisComplete ? 'rgba(140,225,180,0.92)' : 'rgba(140,225,180,0.85)',
        letterSpacing: '3px',
        textTransform: 'uppercase',
        textShadow: analysisComplete
          ? '0 0 10px rgba(140,225,180,0.35)'
          : '0 0 8px rgba(72,186,136,0.25)',
        textAlign: 'center', whiteSpace: 'nowrap', pointerEvents: 'none',
        ...FS,
        transition: 'color 0.3s ease, text-shadow 0.3s ease',
      }}>{analysisComplete ? 'Done' : 'Analyzing'}</p>
      </>}

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
          0%   { opacity: 0; transform: translateY(12px) scale(0.96); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes procScanLine {
          0%   { top: -2%; }
          100% { top: 102%; }
        }
        @keyframes procScanGlow {
          0%   { top: -2%; }
          100% { top: 102%; }
        }
        @keyframes procEdgePulse {
          0%, 100% { opacity: 0.4; }
          50%      { opacity: 1.0; }
        }
        @keyframes procDotPulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50%      { opacity: 1.0; transform: scale(1.3); }
        }
        @keyframes procCardBorder {
          0%, 100% { border-color: rgba(72,186,136,0.06); box-shadow: 0 8px 40px rgba(0,0,0,0.40), inset 0 1px 0 rgba(255,255,255,0.04); }
          50%      { border-color: rgba(72,186,136,0.18); box-shadow: 0 8px 40px rgba(0,0,0,0.40), inset 0 1px 0 rgba(255,255,255,0.04), 0 0 20px rgba(72,186,136,0.06); }
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
