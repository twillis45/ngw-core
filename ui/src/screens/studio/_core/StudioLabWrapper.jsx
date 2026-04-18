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
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <MatteBackground variant="subdued" />

      {/* ── Studio Matte top bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 24px',
        position: 'relative', zIndex: 10,
        background: 'linear-gradient(180deg, rgba(6,7,10,0.80) 0%, rgba(6,7,10,0.40) 60%, transparent 100%)',
        borderBottom: `1px solid ${steel(0.05)}`,
        flexShrink: 0,
      }}>
        {/* Back button — machined */}
        <button
          onClick={() => { onBack?.(); navSlideSound(); navHaptic(); }}
          style={{
            background: 'linear-gradient(141.71deg, #1a1c22 0%, #131518 50%, #0c0d10 100%)',
            border: 'none', borderRadius: 8, padding: '6px 16px', cursor: 'pointer',
            boxShadow: [
              '4px 4px 12px rgba(0,0,0,0.55)',
              '2px 2px 5px rgba(0,0,0,0.40)',
              '-0.5px -0.5px 1px rgba(255,255,255,0.04)',
              'inset 0 1px 0 rgba(255,255,255,0.07)',
              'inset -1px -1px 0 rgba(0,0,0,0.25)',
            ].join(', '),
            WebkitTapHighlightColor: 'transparent',
            ...FS,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 600, color: steel(0.45), letterSpacing: '0.3px' }}>← Back</span>
        </button>

        {/* Title */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: C.textPrimary, letterSpacing: '-0.3px', ...FS }}>Lab</span>
          <span style={{ fontSize: 8.5, fontWeight: 700, color: steel(0.30), letterSpacing: '3px', ...FS }}>WORKBENCH</span>
        </div>

        {/* Spacer to balance back button */}
        <div style={{ width: 80 }} />
      </div>

      {/* ── Legacy Lab content — fills remaining space ── */}
      <div style={{
        flex: 1, overflow: 'hidden',
        position: 'relative', zIndex: 1,
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
          <div style={{ height: '100%', overflow: 'auto' }}>
            <LegacyLab />
          </div>
        </Suspense>
      </div>
    </div>
  );
}
