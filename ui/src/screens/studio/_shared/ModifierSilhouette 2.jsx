/**
 * ModifierSilhouette — tiny SVG token of a classified modifier shape.
 *
 * Accepts the raw `family` string from the engine (e.g. "Rectangular
 * Softbox", "Octabox", "Beauty Dish", "Strip Light", "Ring Flash",
 * "Umbrella", "Parabolic") and renders a schematic silhouette so the
 * reader can instantly see WHAT the light shaper looks like next to the
 * spec numbers. Deliberately not photoreal — reads as an icon at 60–90px.
 *
 * Optional `dimensions` (e.g. "36×48 in", "60 cm Ø") is engraved on the
 * silhouette face so the visual token doubles as the size readout — no
 * separate label row needed. Pass `showDimensions={false}` to suppress.
 *
 * Used by ResultScreen (CATCHLIGHT & MODIFIER drawer) and SetupScreen
 * (KEY LIGHT desktop hero header). Size prop controls the rendered px;
 * viewBox stays at 100×100 so every shape scales uniformly.
 */
import { steel } from '../../../theme/studioMatte';

export default function ModifierSilhouette({
  family,
  size = 90,
  dimensions = null,
  showDimensions = true,
}) {
  const f = (family || '').toLowerCase();
  const shape = f.includes('ring')     ? 'ring'
              : f.includes('strip')    ? 'strip'
              : f.includes('oct')      ? 'oct'
              : f.includes('beauty')   ? 'beauty'
              : f.includes('umbrella') ? 'umbrella'
              : f.includes('parabolic')? 'parabolic'
              : 'rect';

  const stroke = steel(0.55);
  const glow   = 'rgba(245,190,72,0.18)';
  const hi     = 'rgba(245,190,72,0.55)';

  // Dimensions text — rendered as a dimension pill BELOW the silhouette
  // (never overlaid on the icon face) so the modifier graphic stays
  // un-cluttered and the spec reads at a glance.  Caller can suppress with
  // showDimensions={false}.
  const dimText = (showDimensions && dimensions) ? String(dimensions).trim() : null;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 4,
    }}>
    <svg viewBox="0 0 100 100" width={size} height={size} style={{ display: 'block' }}>
      <defs>
        <radialGradient id={`mod-glow-${shape}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={glow} />
          <stop offset="70%" stopColor="rgba(245,190,72,0)" />
        </radialGradient>
      </defs>
      <rect x={0} y={0} width={100} height={100} fill={`url(#mod-glow-${shape})`} />
      {shape === 'rect' && (
        <>
          <rect x={22} y={26} width={56} height={42} rx={3} fill="none" stroke={stroke} strokeWidth={1.5} />
          <rect x={26} y={30} width={48} height={34} rx={2} fill="rgba(245,190,72,0.10)" stroke={hi} strokeWidth={0.8} />
          <line x1={26} y1={47} x2={74} y2={47} stroke={stroke} strokeWidth={0.6} />
          <line x1={50} y1={30} x2={50} y2={64} stroke={stroke} strokeWidth={0.6} />
          <line x1={78} y1={68} x2={92} y2={82} stroke={stroke} strokeWidth={1.2} />
          <circle cx={92} cy={82} r={2.2} fill={stroke} />
        </>
      )}
      {shape === 'strip' && (
        <>
          <rect x={38} y={16} width={24} height={70} rx={3} fill="none" stroke={stroke} strokeWidth={1.5} />
          <rect x={41} y={19} width={18} height={64} rx={2} fill="rgba(245,190,72,0.10)" stroke={hi} strokeWidth={0.8} />
          <line x1={41} y1={50} x2={59} y2={50} stroke={stroke} strokeWidth={0.5} />
          <line x1={62} y1={84} x2={76} y2={92} stroke={stroke} strokeWidth={1.2} />
        </>
      )}
      {shape === 'oct' && (
        <>
          <polygon points="36,22 64,22 80,38 80,62 64,78 36,78 20,62 20,38"
                   fill="none" stroke={stroke} strokeWidth={1.5} />
          <polygon points="39,26 61,26 74,39 74,61 61,74 39,74 26,61 26,39"
                   fill="rgba(245,190,72,0.10)" stroke={hi} strokeWidth={0.8} />
          <circle cx={50} cy={50} r={3} fill={hi} opacity={0.6} />
          <line x1={74} y1={74} x2={86} y2={86} stroke={stroke} strokeWidth={1.2} />
        </>
      )}
      {shape === 'beauty' && (
        <>
          <ellipse cx={50} cy={48} rx={32} ry={12} fill="none" stroke={stroke} strokeWidth={1.5} />
          <ellipse cx={50} cy={48} rx={28} ry={10} fill="rgba(245,190,72,0.10)" stroke={hi} strokeWidth={0.7} />
          <circle cx={50} cy={48} r={6} fill="#0a0b0d" stroke={stroke} strokeWidth={0.8} />
          <path d="M18 48 L30 72 L70 72 L82 48" fill="none" stroke={stroke} strokeWidth={1} />
          <line x1={72} y1={72} x2={84} y2={84} stroke={stroke} strokeWidth={1.2} />
        </>
      )}
      {shape === 'ring' && (
        <>
          <circle cx={50} cy={50} r={30} fill="none" stroke={stroke} strokeWidth={1.5} />
          <circle cx={50} cy={50} r={26} fill="rgba(245,190,72,0.08)" stroke={hi} strokeWidth={0.8} />
          <circle cx={50} cy={50} r={13} fill="#0a0b0d" stroke={stroke} strokeWidth={1} />
        </>
      )}
      {shape === 'umbrella' && (
        <>
          <path d="M18 56 Q50 14 82 56 Z" fill="rgba(245,190,72,0.10)" stroke={stroke} strokeWidth={1.4} />
          <path d="M18 56 Q50 14 82 56" fill="none" stroke={hi} strokeWidth={0.8} />
          <line x1={50} y1={14} x2={50} y2={56} stroke={stroke} strokeWidth={0.6} />
          <line x1={34} y1={20} x2={50} y2={56} stroke={stroke} strokeWidth={0.5} />
          <line x1={66} y1={20} x2={50} y2={56} stroke={stroke} strokeWidth={0.5} />
          <line x1={50} y1={56} x2={50} y2={88} stroke={stroke} strokeWidth={1.2} />
        </>
      )}
      {shape === 'parabolic' && (
        <>
          <path d="M14 72 Q50 8 86 72" fill="none" stroke={stroke} strokeWidth={1.6} />
          <path d="M20 70 Q50 18 80 70" fill="rgba(245,190,72,0.10)" stroke={hi} strokeWidth={0.8} />
          <circle cx={50} cy={72} r={2} fill={stroke} />
        </>
      )}

    </svg>
    {dimText && (
      <div style={{
        // Tactile dimension pill — engraved well + amber engraving so the
        // modifier size lands on its own readable surface instead of fighting
        // with the silhouette graphic.
        padding: '2px 8px',
        borderRadius: 999,
        backgroundColor: '#070709',
        boxShadow: 'inset 0px 1px 2px rgba(0,0,0,0.6), inset 0px 0px 4px rgba(0,0,0,0.35), 0 0.5px 0 rgba(255,255,255,0.04)',
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '0.4px',
        color: 'rgba(245,210,140,0.95)',
        fontFamily: 'Inter, system-ui, sans-serif',
        textShadow: '0 1px 0 rgba(0,0,0,0.6)',
        WebkitFontSmoothing: 'antialiased',
        whiteSpace: 'nowrap',
      }}>{dimText}</div>
    )}
    </div>
  );
}
