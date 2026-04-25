/**
 * ProcessingScreen — Studio Matte design
 * Clean analysis view: desaturated hero photo + engine-driven light pools.
 * No progress bars, no stage text, no chrome — the light pools ARE the feedback.
 */
import { useState, useEffect, useRef } from 'react';
import { successHaptic, tapHaptic } from '../../../utils/haptics';
import { loadSettings } from '../../../data/settingsStore';
import prettify from '../../../utils/prettify';
import useStableViewport from '../../../utils/useStableViewport';
import { useDeviceTilt, glassReflectionTransform } from '../../../utils/useDeviceTilt';
import { steel, C as SM_C, SCREEN_BG, GLASS_REFLECTION, LENS_VIGNETTE, VIEWFINDER_INNER_SHADOW } from '../../../theme/studioMatte';
import MatteBackground from '../_shared/MatteBackground';
import useLightingRead from './useLightingRead';

const C = { ...SM_C };
const FS = { WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', textRendering: 'geometricPrecision' };

export default function ProcessingScreen({ imagePreview, imageFile, analysisComplete, exifData, result, onCancel }) {
  const tilt = useDeviceTilt();
  const { canvasRef } = useLightingRead(imageFile || imagePreview, analysisComplete);
  const { stableVH, safeBottom, isDesktop } = useStableViewport();
  const [daylightMode] = useState(() => {
    try { const s = loadSettings(); return !!s.daylightMode; } catch { return false; }
  });

  // Success haptic when pattern tease appears
  const teaseHapticFired = useRef(false);
  useEffect(() => {
    if (analysisComplete && result?.pattern && !teaseHapticFired.current) {
      teaseHapticFired.current = true;
      setTimeout(() => successHaptic(), 250);
    }
  }, [analysisComplete, result?.pattern]);

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: SCREEN_BG, overflow: 'hidden' }}>
      <MatteBackground />
    <div style={{
      position: 'relative',
      width: '100%',
      height: '100%',
      margin: '0 auto',
      overflow: 'hidden',
      fontFamily: 'Inter, system-ui, sans-serif',
      filter: daylightMode ? 'brightness(1.15)' : undefined,
      ...(isDesktop ? { display: 'grid', gridTemplateColumns: '1fr', gridTemplateRows: '1fr', maxWidth: 1400 } : {}),
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

      {/* Hero photo — desaturated during analysis, lifts on completion */}
      <div style={{
        position: 'absolute', inset: 0, overflow: 'hidden',
      }}>
        {imagePreview && (
          <img key={imagePreview} src={imagePreview} alt="Analyzing" style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: isDesktop ? 'contain' : 'cover',
            objectPosition: isDesktop ? '50% 50%' : '50% 25%',
            opacity: analysisComplete ? 0.90 : 0.78,
            filter: analysisComplete
              ? 'brightness(0.90) saturate(0.85) contrast(0.95)'
              : 'brightness(0.62) saturate(0.15) contrast(0.88)',
            animation: 'heroZoomIn 12s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards',
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

        {/* Glass overlay — lens vignette + directional key reflection */}
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 5, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', inset: 0, background: LENS_VIGNETTE }} />
          <div style={{
            position: 'absolute', top: 0, left: 0, right: '5%', bottom: 0,
            background: GLASS_REFLECTION, opacity: 0.5,
            transform: glassReflectionTransform(tilt), willChange: 'transform',
          }} />
        </div>
        {/* Inner shadow — machined bezel */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 6,
          boxShadow: VIEWFINDER_INNER_SHADOW,
        }} />
      </div>

      {/* Pattern tease on completion */}
      {analysisComplete && result?.pattern && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          zIndex: 10, pointerEvents: 'none',
          animation: 'patternTeaseIn 0.6s cubic-bezier(0.16, 0.84, 0.32, 1.18) forwards',
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
              textShadow: '0 0 20px rgba(245,190,72,0.30), 0 2px 12px rgba(0,0,0,0.7)',
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
                  color: conf >= 70 ? 'rgba(140,225,180,0.85)' : 'rgba(250,210,130,0.85)',
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
    `}</style>
    </div>
  );
}
