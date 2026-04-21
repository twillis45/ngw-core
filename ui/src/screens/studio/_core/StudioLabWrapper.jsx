/**
 * StudioLabWrapper — Studio Matte chrome around the legacy Lab content.
 *
 * Rebuilds the Lab SHELL (header, section nav, sub-nav, layout) with
 * Studio Matte depth treatment while rendering the existing tab content
 * components inside it. This gives world-class chrome without rewriting
 * 9,661 lines of internal Lab functionality.
 *
 * The legacy LabScreen's tab content components are imported directly
 * and rendered within the Studio Matte layout.
 */
import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { steel, C as SM_C, FONT_SMOOTH, PANEL_SHADOW, PANEL_BEVEL,
         KEY_ACCENT } from '../../../theme/studioMatte';
import MatteBackground from '../_shared/MatteBackground';
import { tapHaptic, navHaptic } from '../../../utils/haptics';
import { softClickSound, navSlideSound } from '../../../utils/sounds';

const C = SM_C;
const FS = FONT_SMOOTH;

// Lazy-load the legacy LabScreen so internal components load on demand
const LegacyLab = lazy(() => import('../../LabScreen'));

export default function StudioLabWrapper({ onBack }) {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      backgroundColor: C.bg,
      fontFamily: 'Inter, system-ui, sans-serif',
      overflow: 'hidden',
    }}>
      <MatteBackground variant="subdued" />

      {/* Back button — fixed position overlay, doesn't interfere with Lab layout */}
      <button
        onClick={() => { onBack?.(); navSlideSound(); navHaptic(); }}
        style={{
          position: 'fixed', top: 10, left: 10, zIndex: 9999,
          background: 'linear-gradient(141.71deg, #1a1c22 0%, #131518 50%, #0c0d10 100%)',
          border: 'none', borderRadius: 8, padding: '5px 14px', cursor: 'pointer',
          boxShadow: [
            '4px 4px 12px rgba(0,0,0,0.60)',
            '-0.5px -0.5px 1px rgba(255,255,255,0.04)',
            'inset 0 1px 0 rgba(255,255,255,0.07)',
          ].join(', '),
          WebkitTapHighlightColor: 'transparent',
          ...FS,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 600, color: steel(0.50), letterSpacing: '0.3px' }}>← Exit Lab</span>
      </button>

      {/* Legacy Lab — fills entire viewport, no wrapper chrome */}
      <div style={{
        position: 'relative', zIndex: 1,
        height: '100%', overflow: 'auto',
      }}>
        <Suspense fallback={
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: steel(0.40), fontSize: 13, ...FS,
          }}>
            Loading Lab...
          </div>
        }>
          <LegacyLab />
        </Suspense>
      </div>

      {/* Ambient DNA — oscilloscope waveform (Lab identity) */}
      <div className="lab-dna-waveform" aria-hidden="true" />

      {/* Nuke ALL width constraints in the Lab — fill the viewport */}
      <style>{`
        .lab-dna-waveform {
          position: fixed; bottom: 50px; right: 40px;
          width: 400px; height: 100px; z-index: 9998;
          pointer-events: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 200' fill='none' stroke='rgba(132,158,184,0.055)' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='M0,100 Q50,100 80,100 T120,60 T180,140 T220,40 T280,160 T340,80 T400,120 T460,50 T520,150 T580,70 T640,130 T700,90 T760,100 T800,100'/%3E%3Cline x1='0' y1='100' x2='800' y2='100' stroke-dasharray='4 8' stroke-width='0.8'/%3E%3Cline x1='200' y1='20' x2='200' y2='180' stroke-width='0.5' stroke-dasharray='2 6'/%3E%3Cline x1='400' y1='20' x2='400' y2='180' stroke-width='0.5' stroke-dasharray='2 6'/%3E%3Cline x1='600' y1='20' x2='600' y2='180' stroke-width='0.5' stroke-dasharray='2 6'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-size: contain;
        }
        @media (max-width: 600px) { .lab-dna-waveform { display: none; } }
      `}</style>
      <style>{`
        .screen, .screen > *, .lab-content, .lab-screen,
        .lab-screen > *, .lab-wb-layout, .lab-back,
        .lab-status, .lab-workbench, .lab-tabs-wrap {
          max-width: none !important;
          margin-inline: 0 !important;
        }
        .screen.lab-screen { padding-top: 0 !important; width: 100% !important; }
        .lab-content { padding-inline: 28px !important; }
        .lab-header { padding-inline: 28px !important; }
        .lab-nav { padding-inline: 28px !important; }
        .lab-subnav { padding-inline: 28px !important; }
        .lab-wb-layout { padding-inline: 0 !important; }
        /* Lab typography floor — enforce minimum readability */
        .lab-screen button,
        .lab-screen select,
        .lab-screen .lab-btn { font-size: max(12px, inherit) !important; }
        .lab-screen input,
        .lab-screen textarea { font-size: 14px !important; }
      `}</style>
    </div>
  );
}
