/**
 * LoadingScreen — Studio Matte shim for edge-path loading states.
 * Used only on rare routes: magic-link return, post-payment redirect.
 * No sci-fi corner sweep. No amber. Recessed panel + subline only.
 */
import { steel, SCREEN_BG, VIEWFINDER_INNER_SHADOW } from '../theme/studioMatte';
import MatteBackground from './studio/_shared/MatteBackground';
import ViewfinderHUD from './studio/_shared/ViewfinderHUD';

const FS = { WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' };

export default function LoadingScreen() {
  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: SCREEN_BG, overflow: 'hidden' }}>
      <MatteBackground variant="carbon" />
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}>
        {/* Recessed instrument panel — same as ProcessingScreen empty state */}
        <div style={{
          position: 'relative',
          width: '100%',
          maxWidth: 480,
          height: 320,
          background: 'linear-gradient(180deg, #0d0d0d 0%, #080808 40%, #060606 100%)',
          boxShadow: VIEWFINDER_INNER_SHADOW,
          overflow: 'hidden',
        }}>
          <ViewfinderHUD dimmed={true} />
        </div>

        {/* Subline */}
        <p style={{
          marginTop: 28,
          fontSize: 11, fontWeight: 600,
          color: steel(0.50),
          letterSpacing: '0.18em', textTransform: 'uppercase',
          textAlign: 'center',
          ...FS,
        }}>
          Reading the light on this photo.
        </p>
      </div>
    </div>
  );
}
