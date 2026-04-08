/**
 * ProcessingScreen — Studio Matte design
 * Pixel-exact match to Figma: YQgGd8KZyZoXzZwJV7p4b6 / Studio Matte Theme / Processing → HC (1441:2)
 */
import { useState, useEffect, useRef } from 'react';
import { tapHaptic }          from '../utils/haptics';
import { processingPulseSound } from '../utils/sounds';
import analyzeTrackAlive      from '../assets/day1/analyze-track-alive.svg';
import analyzeButtonAlive     from '../assets/day1/analyze-button-alive.svg';

import illuminationWellAlive  from '../assets/day1/illumination-well-alive.svg';
import illuminationLampOn     from '../assets/day1/illumination-lamp-on.svg';

const steel = (a) => `rgba(95,124,150,${a})`;
const C = {
  bg:      '#000001',
  slotBg:  '#08080a',
  border:  'rgba(167,173,183,0.06)',
  homeBar: 'rgba(245,247,250,0.06)',
};

const VIEWFINDER_INNER_SHADOW = [
  'inset 2px 3px 8px 0px rgba(0,0,0,0.5)',
  'inset 1px 1px 2px 0px rgba(0,0,0,0.4)',
  'inset -1px -1px 0px 0px rgba(255,255,255,0.04)',
  'inset 0px 0px 20px 0px rgba(95,124,150,0.04)',
  'inset 0px 0px 8px 0px rgba(95,124,150,0.06)',
].join(', ');

const GLASS_REFLECTION = [
  'linear-gradient(141.71deg,',
  'rgba(255,255,255,0.36) 0%,',
  'rgba(255,255,255,0.30) 2%,',
  'rgba(255,255,255,0.24) 4%,',
  'rgba(255,255,255,0.19) 6.5%,',
  'rgba(255,255,255,0.15) 9%,',
  'rgba(255,255,255,0.12) 12%,',
  'rgba(255,255,255,0.095) 16%,',
  'rgba(255,255,255,0.075) 20%,',
  'rgba(255,255,255,0.058) 25%,',
  'rgba(255,255,255,0.044) 30%,',
  'rgba(255,255,255,0.034) 36%,',
  'rgba(255,255,255,0.025) 42%,',
  'rgba(255,255,255,0.018) 48%,',
  'rgba(255,255,255,0.013) 54%,',
  'rgba(255,255,255,0.015) 62%,',
  'rgba(255,255,255,0.020) 68%,',
  'rgba(255,255,255,0.015) 74%,',
  'rgba(255,255,255,0.006) 80%,',
  'rgba(255,255,255,0) 86%)',
].join(' ');
const LENS_VIGNETTE = 'radial-gradient(ellipse 100% 90% at center, transparent 52%, rgba(0,0,0,0.08) 76%, rgba(0,0,0,0.22) 100%)';

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
    <div onClick={(e) => { if (e.target === e.currentTarget) tapHaptic(); }} style={{
      position: 'relative',
      width: '100%',
      maxWidth: 430,
      height: '100%',
      minHeight: 600,
      margin: '0 auto',
      backgroundColor: C.bg,
      backgroundImage: 'radial-gradient(ellipse 80% 60% at 50% 30%, rgba(95,124,150,0.003) 0%, transparent 70%)',
      boxShadow: '2px 4px 40px rgba(0,0,0,0.6), -1px -1px 1px rgba(255,255,255,0.02)',
      overflow: 'hidden',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      {/* ── Matte surface: top highlight + noise grain ── */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(141.71deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.015) 40%, transparent 80%)' }} />
        <div style={{ position: 'absolute', inset: 0, opacity: 0.18, mixBlendMode: 'multiply', backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='3.5' numOctaves='6' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`, backgroundSize: '128px 128px' }} />
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
        border: `0.5px solid ${C.border}`,
        overflow: 'hidden',
        backgroundColor: C.slotBg,
      }}>
        {/* User's photo, dimmed for analysis */}
        {imagePreview && (
          <img src={imagePreview} alt="Analyzing" style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', opacity: 0.45, zIndex: 1,
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

      <style>{`@keyframes ledBreathe {
        0%,100% { transform: translateX(-50%) scale(1); opacity: 0.5; box-shadow: 0 0 2px rgba(72,186,136,0.4), 0 0 4px rgba(72,186,136,0.15); }
        40%     { transform: translateX(-50%) scale(2.8); opacity: 1; box-shadow: 0 0 10px rgba(100,220,160,1), 0 0 28px rgba(72,186,136,0.7), 0 0 56px rgba(72,186,136,0.25); }
        55%     { transform: translateX(-50%) scale(2.4); opacity: 0.95; box-shadow: 0 0 8px rgba(72,186,136,0.9), 0 0 22px rgba(72,186,136,0.5), 0 0 44px rgba(72,186,136,0.18); }
      }`}</style>

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

      {/* ── Green LED — breathes from small to large with glow bloom ── */}
      <div style={{
        position: 'absolute', left: '50%', top: 584, width: 8, height: 8,
        transform: 'translateX(-50%)', pointerEvents: 'none', zIndex: 3,
        borderRadius: '50%',
        backgroundColor: 'rgba(72,186,136,0.95)',
        animation: 'ledBreathe 2s ease-in-out infinite',
      }} />

      {/* ── ANALYZING label ── */}
      <p style={{
        position: 'absolute', top: 638, left: '50%', transform: 'translateX(-50%)', margin: 0,
        fontWeight: 800, fontSize: 13.5, lineHeight: '16px',
        color: steel(0.90), letterSpacing: '4.5px',
        whiteSpace: 'nowrap', pointerEvents: 'none',
        WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale',
        textRendering: 'geometricPrecision',
        textShadow: `0 0 8px ${steel(0.25)}`,
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
