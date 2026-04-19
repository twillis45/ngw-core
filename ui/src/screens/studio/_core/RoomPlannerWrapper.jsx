/**
 * RoomPlannerWrapper — Studio Matte shell around the legacy Room Planner.
 *
 * Lazy-loads the existing RoomPlannerScreen to avoid duplicating 1,900 lines
 * of spatial engine + canvas code. Applies MatteBackground and Studio Matte
 * chrome (header, back button) while the legacy internals handle the floor
 * plan, camera measurement, and light placement.
 */
import { lazy, Suspense } from 'react';
import { steel, C, FONT_SMOOTH, SCREEN_BG, MACHINED_BG, MACHINED_SHADOW } from '../../../theme/studioMatte';
import MatteBackground from '../_shared/MatteBackground';
import { tapHaptic, navHaptic } from '../../../utils/haptics';
import { softClickSound } from '../../../utils/sounds';

const LegacyRoomPlanner = lazy(() => import('../../RoomPlannerScreen'));

export default function RoomPlannerWrapper({ result, onBack }) {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      backgroundColor: SCREEN_BG,
      fontFamily: 'Inter, system-ui, sans-serif',
      overflow: 'hidden',
    }}>
      <MatteBackground variant="subdued" />

      {/* Back button */}
      <button
        onClick={() => { onBack?.(); softClickSound(); navHaptic(); }}
        style={{
          position: 'fixed', top: 12, left: 12, zIndex: 100,
          background: MACHINED_BG,
          border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer',
          boxShadow: MACHINED_SHADOW,
          WebkitTapHighlightColor: 'transparent',
          ...FONT_SMOOTH,
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, color: steel(0.45), letterSpacing: '0.3px' }}>← Back</span>
      </button>

      {/* Legacy Room Planner */}
      <div style={{ position: 'relative', zIndex: 1, height: '100%', overflow: 'auto' }}>
        <Suspense fallback={
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: steel(0.40), fontSize: 13, ...FONT_SMOOTH,
          }}>
            Loading Room Planner...
          </div>
        }>
          <LegacyRoomPlanner />
        </Suspense>
      </div>

      {/* Studio theme override for rp-* classes */}
      <style>{`
        [data-theme="studio"] .rp-header {
          background: linear-gradient(180deg, rgba(8,9,12,0.85) 0%, rgba(6,7,10,0.50) 70%, transparent 100%) !important;
          border-bottom-color: rgba(132,158,184,0.06) !important;
        }
        [data-theme="studio"] .rp-header__title {
          color: rgba(245,247,250,0.90) !important;
        }
        [data-theme="studio"] .rp-header__back,
        [data-theme="studio"] .rp-header__reset {
          color: rgba(132,158,184,0.55) !important;
        }
      `}</style>
    </div>
  );
}
