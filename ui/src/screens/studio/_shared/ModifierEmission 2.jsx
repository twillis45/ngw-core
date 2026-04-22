/**
 * ModifierEmission — "Emission Face" modifier graphic.
 *
 * Steel-blue structural frame (strokes, inner lines, deflector rings)
 * with warm amber radial fill — the modifier glows amber through a
 * machined steel housing.
 *
 * Used by SetupScreen as the hero graphic in the KEY LIGHT panel.
 *
 * Shapes: beauty, rect, strip, oct, umbrella, parabolic, ring
 */

export default function ModifierEmission({ family, size = 108 }) {
  const f = (family || '').toLowerCase();
  const shape = f.includes('ring')      ? 'ring'
              : f.includes('strip')     ? 'strip'
              : f.includes('oct')       ? 'oct'
              : f.includes('beauty')    ? 'beauty'
              : f.includes('umbrella')  ? 'umbrella'
              : f.includes('parabolic') ? 'parabolic'
              : 'rect';

  // Square viewBox — pad 10px top/bottom so optical center aligns with
  // CatchlightEye (80×80) in the twin-instrument well.

  // Amber fill palette
  const amberHot = 'rgba(245,210,140,1)';
  const amberMid = 'rgba(200,160,72,1)';
  const amberDim = 'rgba(160,120,50,1)';

  // Steel blue frame palette (original)
  const steelHi    = 'rgba(95,124,150,0.75)';
  const steelMid   = 'rgba(95,124,150,0.50)';
  const steelLo    = 'rgba(95,124,150,0.18)';
  const steelFaint = 'rgba(95,124,150,0.12)';
  const well       = '#121316';

  return (
    <svg viewBox="0 0 108 108" width={size} height={size} style={{ display: 'block' }}>
      {/* Shift all content down 10px to vertically center within the square viewBox */}
      <g transform="translate(0, 10)">

      {shape === 'beauty' && (
        <>
          <defs>
            <radialGradient id="me-bd-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%"  stopColor={amberHot} stopOpacity="0.88"/>
              <stop offset="40%" stopColor={amberMid} stopOpacity="0.35"/>
              <stop offset="85%" stopColor={amberDim} stopOpacity="0.10"/>
              <stop offset="100%" stopColor={amberDim} stopOpacity="0"/>
            </radialGradient>
          </defs>
          <circle cx="54" cy="44" r="38" fill="url(#me-bd-glow)"/>
          <circle cx="54" cy="44" r="34" fill="none" stroke={steelMid} strokeWidth="0.8"/>
          <circle cx="54" cy="44" r="28" fill="none" stroke={steelLo} strokeWidth="0.5"/>
          <circle cx="54" cy="44" r="9" fill={well} stroke={steelMid} strokeWidth="0.9"/>
          <circle cx="54" cy="44" r="6" fill="none" stroke={steelLo} strokeWidth="0.5"/>
        </>
      )}

      {shape === 'rect' && (
        <>
          <defs>
            <radialGradient id="me-sb-glow" cx="50%" cy="50%" r="60%">
              <stop offset="0%"  stopColor={amberHot} stopOpacity="0.88"/>
              <stop offset="40%" stopColor={amberMid} stopOpacity="0.30"/>
              <stop offset="100%" stopColor={amberDim} stopOpacity="0.03"/>
            </radialGradient>
          </defs>
          <rect x="18" y="18" width="72" height="52" rx="3" fill="url(#me-sb-glow)"
                stroke={steelMid} strokeWidth="0.8"/>
          <rect x="22" y="22" width="64" height="44" rx="2" fill="none"
                stroke={steelLo} strokeWidth="0.5"/>
        </>
      )}

      {shape === 'strip' && (
        <>
          <defs>
            <radialGradient id="me-st-glow" cx="50%" cy="50%" r="65%">
              <stop offset="0%"  stopColor={amberHot} stopOpacity="0.88"/>
              <stop offset="40%" stopColor={amberMid} stopOpacity="0.32"/>
              <stop offset="100%" stopColor={amberDim} stopOpacity="0.03"/>
            </radialGradient>
          </defs>
          <rect x="42" y="10" width="24" height="68" rx="2" fill="url(#me-st-glow)"
                stroke={steelMid} strokeWidth="0.8"/>
          <rect x="45" y="14" width="18" height="60" rx="1" fill="none"
                stroke={steelLo} strokeWidth="0.5"/>
        </>
      )}

      {shape === 'oct' && (
        <>
          <defs>
            <radialGradient id="me-oct-glow" cx="50%" cy="50%" r="55%">
              <stop offset="0%"  stopColor={amberHot} stopOpacity="0.88"/>
              <stop offset="45%" stopColor={amberMid} stopOpacity="0.32"/>
              <stop offset="100%" stopColor={amberDim} stopOpacity="0.04"/>
            </radialGradient>
          </defs>
          <polygon points="54,8 78,18 88,42 88,50 78,70 54,80 30,70 20,50 20,42 30,18"
                   fill="url(#me-oct-glow)" stroke={steelMid} strokeWidth="0.8"/>
          <polygon points="54,16 72,24 80,44 80,48 72,62 54,70 36,62 28,48 28,44 36,24"
                   fill="none" stroke={steelLo} strokeWidth="0.5"/>
        </>
      )}

      {shape === 'umbrella' && (
        <>
          <defs>
            <radialGradient id="me-um-glow" cx="50%" cy="45%" r="55%">
              <stop offset="0%"  stopColor={amberHot} stopOpacity="0.88"/>
              <stop offset="45%" stopColor={amberMid} stopOpacity="0.28"/>
              <stop offset="100%" stopColor={amberDim} stopOpacity="0.03"/>
            </radialGradient>
          </defs>
          <circle cx="54" cy="44" r="34" fill="url(#me-um-glow)"
                  stroke={steelMid} strokeWidth="0.8"/>
          <g stroke="rgba(95,124,150,0.30)" strokeWidth="0.5">
            <line x1="54" y1="10" x2="54" y2="78"/>
            <line x1="20" y1="44" x2="88" y2="44"/>
            <line x1="29" y1="19" x2="79" y2="69"/>
            <line x1="79" y1="19" x2="29" y2="69"/>
          </g>
          <circle cx="54" cy="44" r="4" fill={well}
                  stroke={steelMid} strokeWidth="0.7"/>
        </>
      )}

      {shape === 'parabolic' && (
        <>
          <defs>
            <radialGradient id="me-pb-glow" cx="50%" cy="50%" r="45%">
              <stop offset="0%"  stopColor={amberHot} stopOpacity="1"/>
              <stop offset="18%" stopColor={amberHot} stopOpacity="0.85"/>
              <stop offset="50%" stopColor={amberMid} stopOpacity="0.22"/>
              <stop offset="100%" stopColor={amberDim} stopOpacity="0.02"/>
            </radialGradient>
          </defs>
          <circle cx="54" cy="44" r="38" fill="url(#me-pb-glow)"/>
          <circle cx="54" cy="44" r="34" fill="none"
                  stroke={steelHi} strokeWidth="0.8"/>
          <circle cx="54" cy="44" r="26" fill="none"
                  stroke={steelLo} strokeWidth="0.5"/>
          <circle cx="54" cy="44" r="17" fill="none"
                  stroke="rgba(95,124,150,0.15)" strokeWidth="0.5"/>
          <circle cx="54" cy="44" r="9"  fill="none"
                  stroke={steelFaint} strokeWidth="0.5"/>
        </>
      )}

      {shape === 'ring' && (
        <>
          <defs>
            <radialGradient id="me-rf-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%"  stopColor={well} stopOpacity="1"/>
              <stop offset="38%" stopColor={well} stopOpacity="1"/>
              <stop offset="48%" stopColor={amberHot} stopOpacity="0.88"/>
              <stop offset="65%" stopColor={amberMid} stopOpacity="0.30"/>
              <stop offset="100%" stopColor={amberDim} stopOpacity="0.03"/>
            </radialGradient>
          </defs>
          <circle cx="54" cy="44" r="36" fill="url(#me-rf-glow)"/>
          <circle cx="54" cy="44" r="32" fill="none"
                  stroke={steelMid} strokeWidth="0.8"/>
          <circle cx="54" cy="44" r="18" fill="none"
                  stroke={steelMid} strokeWidth="0.8"/>
          <circle cx="54" cy="44" r="11" fill={well}
                  stroke={steelMid} strokeWidth="0.9"/>
          <circle cx="54" cy="44" r="7"  fill="none"
                  stroke={steelLo} strokeWidth="0.5"/>
        </>
      )}

      </g>
    </svg>
  );
}
