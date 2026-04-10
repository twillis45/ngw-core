/**
 * ProcessingScreen — Studio Matte design
 * Pixel-exact match to Figma: YQgGd8KZyZoXzZwJV7p4b6 / Studio Matte Theme / Processing → HC (1441:2)
 */
import { useState, useEffect, useRef } from 'react';
import { tapHaptic, grainHaptic }          from '../../../utils/haptics';
import { processingPulseSound } from '../../../utils/sounds';
import analyzeTrackAlive      from '../../../assets/day1/analyze-track-alive.svg';
import analyzeButtonAlive     from '../../../assets/day1/analyze-button-alive.svg';

import illuminationWellAlive  from '../../../assets/day1/illumination-well-alive.svg';
import illuminationLampOn     from '../../../assets/day1/illumination-lamp-on.svg';

import { steel, C as SM_C, GLASS_REFLECTION, LENS_VIGNETTE, TEXT_SHADOW_ENGRAVED } from '../../../theme/studioMatte';

// ─── Screen-local token extensions ───────────────────────────────────────────
const C = { ...SM_C, border: 'rgba(167,173,183,0.06)' };

// Processing-state viewfinder shadow — heavy directional inset from 141.71°
// (light from upper-left), reading as a deep sunken well under the grain.
const VIEWFINDER_INNER_SHADOW = [
  'inset 6px 7px 18px 0px rgba(0,0,0,0.88)',
  'inset 4px 5px 10px 0px rgba(0,0,0,0.72)',
  'inset 2px 3px 5px 0px rgba(0,0,0,0.58)',
  'inset 1px 1px 2px 0px rgba(0,0,0,0.50)',
  'inset -1px -1px 1px 0px rgba(255,255,255,0.05)',
  'inset -2px -2px 5px 0px rgba(132, 158, 184,0.07)',
  'inset 0px 0px 24px 0px rgba(132, 158, 184,0.05)',
  'inset 0px 0px 12px 0px rgba(132, 158, 184,0.07)',
].join(', ');

export default function ProcessingScreen({ imagePreview, analysisComplete }) {
  const [progress, setProgress] = useState(0);
  const pulseStopRef = useRef(null);

  // Start ambient pulse on mount, stop on unmount or completion
  useEffect(() => {
    pulseStopRef.current = processingPulseSound();
    return () => { if (pulseStopRef.current) pulseStopRef.current(); };
  }, []);

  // Animate progress toward 90% while analysis is running
  useEffect(() => {
    if (analysisComplete) return;
    const interval = setInterval(() => {
      setProgress(p => Math.min(p + Math.random() * 8 + 3, 90));
    }, 400);
    return () => clearInterval(interval);
  }, [analysisComplete]);

  // When analysis completes, snap to 100% and stop pulse
  useEffect(() => {
    if (analysisComplete) {
      setProgress(100);
      if (pulseStopRef.current) { pulseStopRef.current(); pulseStopRef.current = null; }
    }
  }, [analysisComplete]);

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: '#000', overflow: 'hidden' }}>
    <div
      onClick={(e) => { if (e.target === e.currentTarget) tapHaptic(); }}
      onTouchStart={(e) => { if (e.target === e.currentTarget) grainHaptic(); }}
      onTouchMove={(e) => { if (e.target === e.currentTarget) grainHaptic(); }}
      style={{
      position: 'relative',
      width: '100%',
      maxWidth: 430,
      height: '100%',
      minHeight: 600,
      margin: '0 auto',
      backgroundColor: C.bg,
      boxShadow: '2px 4px 40px rgba(0,0,0,0.6), -1px -1px 1px rgba(255,255,255,0.02)',
      overflow: 'hidden',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      {/* ── Matte metal surface — layered ambient wash, vignette, specular edge, grain ── */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 75% 55% at 50% 22%, rgba(120,148,175,0.022) 0%, rgba(132, 158, 184,0.008) 40%, transparent 72%)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 55% 38% at 50% 58%, rgba(180,150,110,0.008) 0%, transparent 65%)' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 118% 88% at 50% 50%, transparent 52%, rgba(0,0,0,0.45) 100%)' }} />
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(141.71deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.018) 40%, transparent 80%)' }} />
        <div style={{ position: 'absolute', inset: 0, opacity: 0.16, mixBlendMode: 'multiply', backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.32' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`, backgroundSize: '128px 128px' }} />
      </div>

      {/* ── Wordmark (dimmed during processing per Figma 1441:3) ── */}
      <p style={{
        position: 'absolute', top: 30, left: 28, margin: 0,
        fontWeight: 800, fontSize: 18, lineHeight: '22px',
        color: 'rgba(245,247,250,0.6)', letterSpacing: '-0.3px',
        WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', textRendering: 'geometricPrecision',
        textShadow: '0 0 1px rgba(245,247,250,0.08)',
      }}>No Guesswork</p>
      <p style={{
        position: 'absolute', top: 54, left: 29, margin: 0,
        fontWeight: 800, fontSize: 9.5, lineHeight: '12px',
        color: 'rgba(130,155,178,0.85)', letterSpacing: '3.2px',
        WebkitFontSmoothing: 'antialiased',
        MozOsxFontSmoothing: 'grayscale',
        textRendering: 'geometricPrecision',
        textShadow: `0 0 3px ${steel(0.12)}`,
      }}>LIGHTING</p>

      {/* ── Illumination Well (analyzing state — green LED) ── */}
      <div style={{ position: 'absolute', top: 30, right: 24, width: 40, height: 40 }}>
        <img src={illuminationWellAlive} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
        <div style={{ position: 'absolute', top: 4, left: 4, width: 32, height: 32, overflow: 'visible' }}>
          <img src={illuminationLampOn} alt="" style={{
            position: 'absolute',
            top: '-15.63%', left: '-25%',
            width: '150%', height: '150%',
          }} />
        </div>
        {/* Green LED dot — replaces default LED during analysis */}
        <div style={{
          position: 'absolute', top: 15, left: 15, width: 10, height: 10,
          borderRadius: '50%',
          backgroundColor: 'rgba(72,186,136,0.95)',
          boxShadow: '0 0 4px rgba(72,186,136,0.8), 0 0 10px rgba(72,186,136,0.4)',
        }} />
      </div>

      {/* ── Viewfinder — analyzing state ── */}
      <div style={{
        position: 'absolute',
        top: 140, left: 24, right: 24, height: 360,
        borderRadius: 8,
        border: `0.5px solid rgba(0,0,0,0.45)`,
        overflow: 'hidden',
        backgroundColor: C.slotBg,
        // Outer rim bevel — sunken well carved into the matte surface
        boxShadow: '0 -1px 0 rgba(0,0,0,0.5), -1px 0 0 rgba(0,0,0,0.4), 1px 1px 0 rgba(255,255,255,0.05)',
      }}>
        {/* User's photo, dimmed for analysis */}
        {imagePreview && (
          <img key={imagePreview} src={imagePreview} alt="Analyzing" style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', objectPosition: '50% 25%', opacity: 0.45, zIndex: 1,
            animation: 'heroZoomIn 2.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards',
            transformOrigin: 'center 30%',
          }} />
        )}

        {/* Progress — subtle bottom edge glow, no visible bar */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, width: `${progress}%`, height: 1,
          background: 'rgba(255,255,255,0.06)',
          boxShadow: '0 0 6px rgba(255,255,255,0.03)',
          transition: 'width 0.35s ease',
          zIndex: 4,
        }} />

        {/* Glass overlay: natural lens vignette + reflection */}
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 5 }}>
          <div style={{ position: 'absolute', inset: 0, background: LENS_VIGNETTE }} />
          <div style={{ position: 'absolute', top: -3, left: 0, right: '40%', bottom: 0, background: GLASS_REFLECTION }} />
        </div>

        {/* Inner shadow (top of stack) */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 8,
          pointerEvents: 'none', boxShadow: VIEWFINDER_INNER_SHADOW, zIndex: 6,
        }} />
      </div>

      <style>{`
        /* Sexy two-layer breathing pulse:
           - ledBreathe drives the inset core LED.  Asymmetric timing — quick
             inhale (0→32%), slow exhale (32→100%).  Color drifts from base
             green at rest to a cooler 110/235/175 cyan-tinged green at peak,
             which reads as "lit harder."  Inset well rim stays constant.
           - haloBreathe drives a separate soft halo layer behind the LED on
             the analyze button.  Larger radius, lower opacity, phase-shifted
             so the halo lags the core (the bloom keeps spreading after the
             core has already started to dim — that's the "sexy" part). */
        /* The inset rim shadow values below are STRONGER than the static rim
           because transform: scale shrinks the shadow's perceived sharpness
           at peak.  Boosting the rim depth keeps the well looking recessed
           even when the LED has bloomed to 2× its rest size. */
        /* Ragged breath — engine is working hard.
           Fast inhale → stutter/catch mid-exhale → small re-bloom → long exhale.
           The stutter (35%→44%) breaks the perfect sinusoid: LED drops sharply
           then catches itself, the halo lags and desynchronises, which reads
           as organic effort rather than idle glow. */
        @keyframes ledBreathe {
          0%   { transform: translateX(-50%) scale(1.00); opacity: 0.93;
                 box-shadow: inset 0 1.2px 2.2px rgba(0,0,0,0.95), inset 1px 0 1.4px rgba(0,0,0,0.7), inset -0.6px -0.6px 1px rgba(255,255,255,0.14), 0 0 1.6px rgba(72,186,136,0.20), 0 0 3.5px rgba(72,186,136,0.07);
                 animation-timing-function: cubic-bezier(0.38, 0, 0.62, 1); }
          25%  { transform: translateX(-50%) scale(3.00); opacity: 1.00;
                 box-shadow: inset 0 1.2px 2.2px rgba(0,0,0,0.95), inset 1px 0 1.4px rgba(0,0,0,0.7), inset -0.6px -0.6px 1px rgba(255,255,255,0.14), 0 0 5px rgba(140,245,190,0.72), 0 0 14px rgba(110,235,175,0.44), 0 0 28px rgba(72,186,136,0.20);
                 animation-timing-function: cubic-bezier(0.7, 0, 0.3, 1); }
          35%  { transform: translateX(-50%) scale(1.90); opacity: 0.97;
                 box-shadow: inset 0 1.2px 2.2px rgba(0,0,0,0.95), inset 1px 0 1.4px rgba(0,0,0,0.7), inset -0.6px -0.6px 1px rgba(255,255,255,0.14), 0 0 3px rgba(110,235,175,0.45), 0 0 7px rgba(72,186,136,0.20);
                 animation-timing-function: cubic-bezier(0.2, 0, 0.8, 1); }
          44%  { transform: translateX(-50%) scale(2.50); opacity: 0.99;
                 box-shadow: inset 0 1.2px 2.2px rgba(0,0,0,0.95), inset 1px 0 1.4px rgba(0,0,0,0.7), inset -0.6px -0.6px 1px rgba(255,255,255,0.14), 0 0 4px rgba(130,240,185,0.58), 0 0 10px rgba(110,235,175,0.30), 0 0 20px rgba(72,186,136,0.14);
                 animation-timing-function: cubic-bezier(0.42, 0, 0.58, 1); }
          72%  { transform: translateX(-50%) scale(1.06); opacity: 0.94;
                 box-shadow: inset 0 1.2px 2.2px rgba(0,0,0,0.95), inset 1px 0 1.4px rgba(0,0,0,0.7), inset -0.6px -0.6px 1px rgba(255,255,255,0.14), 0 0 1.8px rgba(72,186,136,0.22), 0 0 4px rgba(72,186,136,0.08);
                 animation-timing-function: cubic-bezier(0.42, 0, 0.58, 1); }
          90%  { transform: translateX(-50%) scale(0.93); opacity: 0.91;
                 box-shadow: inset 0 1.2px 2.2px rgba(0,0,0,0.95), inset 1px 0 1.4px rgba(0,0,0,0.7), inset -0.6px -0.6px 1px rgba(255,255,255,0.14), 0 0 1.4px rgba(72,186,136,0.16), 0 0 3px rgba(72,186,136,0.05);
                 animation-timing-function: cubic-bezier(0.42, 0, 0.58, 1); }
          100% { transform: translateX(-50%) scale(1.00); opacity: 0.93;
                 box-shadow: inset 0 1.2px 2.2px rgba(0,0,0,0.95), inset 1px 0 1.4px rgba(0,0,0,0.7), inset -0.6px -0.6px 1px rgba(255,255,255,0.14), 0 0 1.6px rgba(72,186,136,0.20), 0 0 3.5px rgba(72,186,136,0.07); }
        }
        /* Halo — lags the LED and has a more dramatic stutter drop,
           so it desynchronises from the LED during the catch.  The halo
           is still spreading when the LED has already started to recover,
           which amplifies the "ragged" read. */
        @keyframes haloBreathe {
          0%   { opacity: 0.04; transform: translateX(-50%) scale(0.50);
                 animation-timing-function: cubic-bezier(0.38, 0, 0.62, 1); }
          30%  { opacity: 0.95; transform: translateX(-50%) scale(2.95);
                 animation-timing-function: cubic-bezier(0.7, 0, 0.3, 1); }
          42%  { opacity: 0.28; transform: translateX(-50%) scale(1.40);
                 animation-timing-function: cubic-bezier(0.2, 0, 0.8, 1); }
          52%  { opacity: 0.65; transform: translateX(-50%) scale(2.20);
                 animation-timing-function: cubic-bezier(0.42, 0, 0.58, 1); }
          76%  { opacity: 0.07; transform: translateX(-50%) scale(0.60);
                 animation-timing-function: cubic-bezier(0.42, 0, 0.58, 1); }
          100% { opacity: 0.04; transform: translateX(-50%) scale(0.50); }
        }
      `}</style>

      {/* ── Analyze Track (static) ── */}
      <div style={{ position: 'absolute', left: '50%', top: 540, width: 96, height: 96, transform: 'translateX(-50%)' }}>
        <img src={analyzeTrackAlive} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%', pointerEvents: 'none',
          background: 'linear-gradient(141.71deg, rgba(255,255,255,0.07) 0%, transparent 35%, transparent 65%, rgba(0,0,0,0.12) 100%)',
        }} />
      </div>

      {/* ── Analyze Button (static) ── */}
      <div style={{
        position: 'absolute', left: '50%', top: 548, width: 80, height: 80, transform: 'translateX(-50%)',
        overflow: 'visible',
      }}>
        <div style={{ position: 'absolute', top: '-10%', left: '-15%', right: '-15%', bottom: '-20%' }}>
          <img src={analyzeButtonAlive} alt="" style={{ width: '100%', height: '100%' }} />
        </div>
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%', pointerEvents: 'none',
          background: 'linear-gradient(141.71deg, rgba(255,255,255,0.06) 0%, transparent 30%, transparent 70%, rgba(0,0,0,0.10) 100%)',
        }} />
      </div>

      {/* ── Big halo bloom — phase-lagged glow that grows large as the core
             LED breathes.  Sits behind the LED and over the analyze button
             surface; mix-blend-mode: screen lights the matte metal instead
             of pasting flat colour on top.  Carries the "large pulse" feel
             while the LED stays a tight recessed point. ── */}
      <div style={{
        position: 'absolute', left: '50%', top: 564, width: 48, height: 48,
        transform: 'translateX(-50%)', pointerEvents: 'none', zIndex: 2,
        borderRadius: '50%',
        background: 'radial-gradient(circle at 50% 50%, rgba(140,245,190,0.78) 0%, rgba(110,235,175,0.55) 18%, rgba(72,186,136,0.32) 42%, rgba(72,186,136,0.12) 68%, transparent 88%)',
        filter: 'blur(3px)',
        mixBlendMode: 'screen',
        animation: 'haloBreathe 4s linear infinite',
      }} />

      {/* ── Green LED — INSET well that breathes; rim stays recessed ── */}
      <div style={{
        position: 'absolute', left: '50%', top: 584, width: 8, height: 8,
        transform: 'translateX(-50%)', pointerEvents: 'none', zIndex: 3,
        borderRadius: '50%',
        // Same radial-gradient well as HomeScreen — bright center → dark rim.
        background: 'radial-gradient(circle at 50% 55%, rgba(140,235,180,1) 0%, rgba(60,180,130,0.9) 55%, rgba(28,105,75,0.6) 100%)',
        animation: 'ledBreathe 4s linear infinite',
      }} />

      {/* ── ANALYZING label ── */}
      <p style={{
        position: 'absolute', top: 638, left: '50%', transform: 'translateX(-50%)', margin: 0,
        fontWeight: 800, fontSize: 13.5, lineHeight: '16px',
        color: steel(0.90), letterSpacing: '4.5px',
        whiteSpace: 'nowrap', pointerEvents: 'none',
        WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale',
        textRendering: 'geometricPrecision',
        textShadow: `${TEXT_SHADOW_ENGRAVED}, 0 0 8px ${steel(0.25)}`,
      }}>ANALYZING</p>

      {/* ── Home Indicator (green while analyzing) ── */}
      <div style={{
        position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
        width: 134, height: 5, borderRadius: 3,
        backgroundColor: 'rgba(72,186,136,0.95)',
        boxShadow: [
          'inset 0px 1px 1px 0px rgba(255,255,255,0.15)',
          'inset 0px -0.5px 0.5px 0px rgba(0,0,0,0.15)',
          '0px 0.5px 0px 0px rgba(255,255,255,0.03)',
          '0px -0.5px 1px 0px rgba(0,0,0,0.25)',
          '0 0 6px rgba(72,186,136,0.5)',
        ].join(', '),
      }} />
    </div>
    </div>
  );
}
