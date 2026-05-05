/**
 * ProcessingScreen — Studio Matte design
 * Instrument Boot + Light Read Scan hybrid.
 * Recessed LCD + grid + AF brackets frame the analysis.
 * Engine-driven light pools on the photo surface — 4 max, no labels.
 * No fake progress, no anatomy diagrams, no amber.
 */
import { useState, useEffect, useRef } from 'react';
import { successHaptic } from '../../../utils/haptics';
import { loadSettings } from '../../../data/settingsStore';
import prettify from '../../../utils/prettify';
import useStableViewport from '../../../utils/useStableViewport';
import { useDeviceTilt, glassReflectionTransform } from '../../../utils/useDeviceTilt';
import { steel, C as SM_C, SCREEN_BG, GLASS_REFLECTION, LENS_VIGNETTE, VIEWFINDER_INNER_SHADOW, DITHER_STYLE } from '../../../theme/studioMatte';
import MatteBackground from '../_shared/MatteBackground';
import ViewfinderHUD from '../_shared/ViewfinderHUD';
import useLightingRead from './useLightingRead';

const C = { ...SM_C };
const FS = { WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', textRendering: 'geometricPrecision' };

export default function ProcessingScreen({ imagePreview, imageFile, analysisComplete, exifData, result, onCancel }) {
  const tilt = useDeviceTilt();
  const { canvasRef, faceDataState } = useLightingRead(imageFile || imagePreview, analysisComplete);
  const { stableVH, safeBottom, isDesktop } = useStableViewport();
  const [daylightMode] = useState(() => {
    try { const s = loadSettings(); return !!s.daylightMode; } catch { return false; }
  });
  const [reducedMotion] = useState(() =>
    typeof window !== 'undefined' &&
    Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)
  );

  // Subline copy: "Locating subject…" for first 0.5s, then "Reading the light on this photo."
  const [sublinePhase, setSublinePhase] = useState('locating');
  useEffect(() => {
    const t = setTimeout(() => setSublinePhase('reading'), 500);
    return () => clearTimeout(t);
  }, [imagePreview]);

  // Success haptic when pattern tease appears
  const teaseHapticFired = useRef(false);
  useEffect(() => {
    if (analysisComplete && result?.pattern && !teaseHapticFired.current) {
      teaseHapticFired.current = true;
      setTimeout(() => successHaptic(), 250);
    }
  }, [analysisComplete, result?.pattern]);

  const sublineCopy = analysisComplete ? null
    : faceDataState === 'none' ? 'Searching for subject — try another reference.'
    : sublinePhase === 'locating' ? 'Locating subject…'
    : 'Reading the light on this photo.';

  // Confidence color — steel/green only, no amber
  function confColor(conf) {
    if (conf >= 70) return 'rgba(140,225,180,0.88)'; // green — high
    if (conf >= 50) return steel(0.72);               // steel — moderate
    return steel(0.50);                               // steel dim — low
  }

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: SCREEN_BG, overflow: 'hidden' }}>
      <MatteBackground variant="carbon" />
    <div style={{
      position: 'relative',
      width: '100%',
      height: '100%',
      margin: '0 auto',
      overflow: isDesktop ? 'visible' : 'hidden',
      fontFamily: 'Inter, system-ui, sans-serif',
      filter: daylightMode ? 'brightness(1.15)' : undefined,
      ...(isDesktop ? { display: 'grid', gridTemplateColumns: '1fr', gridTemplateRows: '1fr', maxWidth: 1400, padding: '20px 0' } : {}),
    }}>

      {/* Cancel button */}
      {onCancel && !analysisComplete && (
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

      {/* Hero photo — desaturated during analysis */}
      <div style={{
        ...(isDesktop ? {
          position: 'relative',
          height: '100%',
          width: 'fit-content',
          margin: '0 auto',
          overflow: 'hidden',
          borderRadius: 0,
          background: 'linear-gradient(180deg, #0d0d0d 0%, #080808 40%, #060606 100%)',
          boxShadow: VIEWFINDER_INNER_SHADOW,
        } : {
          position: 'absolute', inset: 0, overflow: 'hidden',
        }),
      }}>
        {imagePreview && (
          <img key={imagePreview} src={imagePreview} alt="Analyzing" style={{
            ...(isDesktop ? {
              display: 'block', height: '100%', width: 'auto',
            } : {
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              objectFit: 'cover',
            }),
            objectPosition: isDesktop ? '50% 50%' : '50% 25%',
            opacity: analysisComplete ? 0.92 : (isDesktop ? 0.92 : 0.88),
            // On completion: lower saturation so ResultScreen heroRevealLift has more bloom to show
            filter: analysisComplete
              ? 'brightness(0.82) saturate(0.50) contrast(0.92)'
              : isDesktop
                ? 'brightness(0.82) saturate(0.40) contrast(0.95)'
                : 'brightness(0.78) saturate(0.35) contrast(0.92)',
            animation: reducedMotion ? undefined : 'heroZoomIn 8s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards',
            transformOrigin: 'center 30%',
            transition: 'opacity 0.8s ease, filter 1.2s ease',
            zIndex: 1,
          }} />
        )}

        {/* Light pools canvas */}
        <canvas ref={canvasRef} style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 2,
          pointerEvents: 'none',
        }} />

        {/* Viewfinder HUD — grid + AF brackets, dimmed for processing state */}
        <div style={{ position: 'absolute', inset: 0, zIndex: 3, pointerEvents: 'none' }}>
          <ViewfinderHUD dimmed={true} />
        </div>

        {/* Desktop: glass overlay inside the recessed panel */}
        {isDesktop && (
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 5, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', inset: 0, background: LENS_VIGNETTE }} />
          <div style={DITHER_STYLE} />
          <div style={{
            position: 'absolute', top: 0, left: 0, right: '5%', bottom: 0,
            background: GLASS_REFLECTION, opacity: 0.72,
            transform: glassReflectionTransform(tilt), willChange: 'transform',
          }} />
        </div>
        )}

        {/* Mobile: glass overlay */}
        {!isDesktop && (
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 5, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', inset: 0, background: LENS_VIGNETTE }} />
          <div style={DITHER_STYLE} />
          <div style={{
            position: 'absolute', top: 0, left: 0, right: '5%', bottom: 0,
            background: GLASS_REFLECTION, opacity: 0.62,
            transform: glassReflectionTransform(tilt), willChange: 'transform',
          }} />
        </div>
        )}

        {/* Inner shadow — machined bezel (mobile) */}
        {!isDesktop && (
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 6,
          boxShadow: VIEWFINDER_INNER_SHADOW,
        }} />
        )}

        {/* Bezel depth shadow (desktop) */}
        {isDesktop && (
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 6,
          background: [
            'linear-gradient(to bottom, rgba(0,0,0,0.80) 0%, rgba(0,0,0,0.45) 7%, rgba(0,0,0,0.14) 18%, transparent 30%)',
            'linear-gradient(to top,   rgba(0,0,0,0.60) 0%, rgba(0,0,0,0.28) 7%, rgba(0,0,0,0.08) 16%, transparent 28%)',
            'linear-gradient(to right, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.30) 7%, rgba(0,0,0,0.08) 16%, transparent 26%)',
            'linear-gradient(to left,  rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.18) 7%, transparent 20%)',
          ].join(', '),
        }} />
        )}

        {/* Chamfer edge highlights (desktop) */}
        {isDesktop && (<>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, zIndex: 7, pointerEvents: 'none',
            background: 'linear-gradient(90deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.04) 35%, rgba(255,255,255,0.01) 100%)',
          }} />
          <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 1, zIndex: 7, pointerEvents: 'none',
            background: 'linear-gradient(180deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.03) 35%, transparent 65%)',
          }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 1, zIndex: 7, pointerEvents: 'none',
            background: 'linear-gradient(90deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.18) 50%, transparent 100%)',
          }} />
          <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 1, zIndex: 7, pointerEvents: 'none',
            background: 'linear-gradient(180deg, rgba(0,0,0,0.20) 0%, rgba(0,0,0,0.10) 50%, transparent 100%)',
          }} />
        </>)}

        {/* Subline copy — engine-truthful status */}
        {sublineCopy && (
          <div style={{
            position: 'absolute',
            bottom: safeBottom + 28,
            left: 0, right: 0,
            display: 'flex', justifyContent: 'center',
            zIndex: 8, pointerEvents: 'none',
            animation: reducedMotion ? undefined : 'sublineFadeIn 0.5s ease forwards',
          }}>
            <span style={{
              fontSize: 11, fontWeight: 600, color: steel(0.55),
              letterSpacing: '0.18em', textTransform: 'uppercase',
              textShadow: '0 1px 6px rgba(0,0,0,0.80)',
              ...FS,
            }}>
              {sublineCopy}
            </span>
          </div>
        )}
      </div>

      {/* Pattern tease on completion */}
      {analysisComplete && result?.pattern && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          zIndex: 10, pointerEvents: 'none',
          animation: reducedMotion
            ? 'sublineFadeIn 0.3s ease forwards'
            : 'patternTeaseIn 0.6s cubic-bezier(0.16, 0.84, 0.32, 1.18) forwards',
        }}>
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
            padding: isDesktop ? '36px 56px' : '28px 40px',
            borderRadius: isDesktop ? 24 : 18,
            background: 'rgba(4,5,8,0.55)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            boxShadow: '0 12px 48px rgba(0,0,0,0.50), inset 0 1px 0 rgba(255,255,255,0.05)',
          }}>
            <p style={{
              margin: 0, fontSize: isDesktop ? 44 : 28, fontWeight: 700,
              color: 'rgba(245,247,250,0.95)', letterSpacing: '-0.4px', textAlign: 'center',
              // No amber glow — dark drop shadow only
              textShadow: '0 2px 12px rgba(0,0,0,0.70)',
              ...FS,
            }}>
              {prettify(result.pattern, { title: true })}
            </p>
            {result.confidence != null && (() => {
              const conf = Math.round(result.confidence);
              const label = conf >= 80 ? 'HIGH CONFIDENCE' : conf >= 60 ? 'MODERATE CONFIDENCE' : 'LOW CONFIDENCE';
              return (
                <p style={{
                  margin: 0, fontSize: isDesktop ? 14 : 13, fontWeight: 600,
                  color: confColor(conf),
                  letterSpacing: '1.5px', textTransform: 'uppercase',
                  ...FS,
                }}>
                  {label} · {conf}%
                </p>
              );
            })()}
          </div>
        </div>
      )}
    </div>

    <style>{`
      @keyframes heroZoomIn {
        0%   { transform: scale(1.00); }
        100% { transform: scale(1.06); }
      }
      @keyframes patternTeaseIn {
        from { opacity: 0; transform: scale(0.92); }
        to   { opacity: 1; transform: scale(1); }
      }
      @keyframes sublineFadeIn {
        from { opacity: 0; }
        to   { opacity: 1; }
      }
    `}</style>
    </div>
  );
}
