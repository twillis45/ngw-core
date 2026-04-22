/**
 * SideViewDiagram — side-view lighting setup showing elevation angle.
 *
 * Complements the top-down LightingDiagram by showing the vertical
 * relationship: how high the modifier is relative to the subject's eyes.
 *
 * Uses key_elevation_above_eye_deg from the reconstruction pass and
 * modifier distance to render a physically correct side view.
 *
 * Props:
 *   result    — analysis result (needs ._raw.reconstruction)
 *   compact   — boolean (default false)
 *   fluid     — boolean, 100% width (default false)
 */
import { steel } from '../../../../theme/studioMatte';

const KEY_COLOR = '#c89b45';
const SHADOW_COLOR = 'rgba(132,158,184,0.55)';

export default function SideViewDiagram({ result, compact = false, fluid = false }) {
  if (!result) return null;

  const raw = result._raw || {};
  const recon = raw.reconstruction || {};
  const mod = result.sections?.modifier;

  const elevDeg = recon.key_elevation_above_eye_deg;
  const heightLabel = recon.key_light_height;
  const modFamily = mod?.family || recon.modifier_type || '';
  const distFt = mod?.distRange || '';

  // If no elevation data at all, don't render
  if (elevDeg == null && !heightLabel) return null;

  // Use numeric elevation when available, else map categorical
  const _catMap = { low: -5, eye_level: 0, slightly_above_eye: 15, high: 35, overhead: 60 };
  const angle = typeof elevDeg === 'number' ? elevDeg : (_catMap[heightLabel] ?? 25);

  // Canvas
  const W = compact ? 240 : 300;
  const H = compact ? 120 : 150;

  // Subject — centered, standing figure silhouette (simplified)
  const subX = W * 0.45;
  const eyeY = H * 0.38;      // eye level line
  const headTop = eyeY - 12;
  const headR = compact ? 8 : 10;
  const bodyBottom = H * 0.85;

  // Floor line
  const floorY = bodyBottom + 4;

  // Key light — positioned at a fixed horizontal offset, vertical set by angle.
  // The modifier sits at a known X position and its Y is computed from the
  // elevation angle relative to eye level, scaled to fit the canvas.
  const kX = compact ? W * 0.78 : W * 0.80;
  const kRad = angle * Math.PI / 180;
  // Vertical range: modifier can go from near the top (high) to below eyes (low).
  // Map the angle to the available vertical space above and below eye level.
  const maxAbove = eyeY - 12;   // leave 12px top margin
  const maxBelow = floorY - eyeY - 8;
  // Scale: 75° uses full maxAbove, -15° uses full maxBelow
  const kY = angle >= 0
    ? eyeY - Math.min(maxAbove, maxAbove * (angle / 75))
    : eyeY + Math.min(maxBelow, maxBelow * (Math.abs(angle) / 20));
  const kYClamped = Math.max(10, Math.min(floorY - 6, kY));

  // Beam cone from modifier to subject eye area
  const beamSpread = compact ? 12 : 16;

  // Elevation arc — from eye level to the key direction
  const arcR = compact ? 22 : 28;

  // Steel alias
  const st = (a) => `rgba(132,158,184,${Math.min(1, Math.max(0.35, a + 0.15))})`;

  const sfx = compact ? 'sv_c' : 'sv_f';

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{
        width: fluid ? '100%' : W,
        height: fluid ? 'auto' : H,
        display: 'block',
      }}
    >
      <defs>
        <linearGradient id={`beam_${sfx}`} x1={kX} y1={kYClamped} x2={subX} y2={eyeY} gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={KEY_COLOR} stopOpacity="0.30" />
          <stop offset="100%" stopColor={KEY_COLOR} stopOpacity="0.05" />
        </linearGradient>
      </defs>

      {/* Floor line */}
      <line x1={W * 0.08} y1={floorY} x2={W * 0.92} y2={floorY}
        stroke={st(0.15)} strokeWidth={0.5} strokeDasharray="3,2" />

      {/* Eye level line — the reference datum */}
      <line x1={W * 0.12} y1={eyeY} x2={W * 0.88} y2={eyeY}
        stroke={st(0.12)} strokeWidth={0.5} strokeDasharray="2,3" />
      <text x={W * 0.10} y={eyeY - 3}
        fontSize={compact ? 6 : 7} fill={st(0.35)} fontWeight="600"
        letterSpacing="0.5" fontFamily="Inter, system-ui, sans-serif"
        textAnchor="end">
        EYE LEVEL
      </text>

      {/* Subject silhouette — head + body stick figure */}
      <circle cx={subX} cy={headTop + headR} r={headR}
        fill="#0a0a0d" stroke={st(0.50)} strokeWidth={1.2} />
      {/* Body */}
      <line x1={subX} y1={headTop + headR * 2 + 2} x2={subX} y2={bodyBottom}
        stroke={st(0.40)} strokeWidth={1.5} strokeLinecap="round" />
      {/* Shoulders */}
      <line x1={subX - 10} y1={headTop + headR * 2 + 8} x2={subX + 10} y2={headTop + headR * 2 + 8}
        stroke={st(0.35)} strokeWidth={1.2} strokeLinecap="round" />
      {/* Eye dot */}
      <circle cx={subX + 3} cy={eyeY} r={1.5} fill={st(0.55)} />

      {/* Beam cone */}
      <polygon
        points={`${kX},${kYClamped} ${subX + headR},${eyeY - beamSpread * 0.6} ${subX + headR},${eyeY + beamSpread * 0.4}`}
        fill={`url(#beam_${sfx})`} />

      {/* Key light modifier — simple rectangle facing subject */}
      <rect
        x={kX - 3} y={kYClamped - (compact ? 10 : 14)}
        width={6} height={compact ? 20 : 28}
        rx={1.5}
        fill="rgba(200,155,60,0.18)" stroke={KEY_COLOR} strokeWidth={1} strokeOpacity={0.65}
        transform={`rotate(${-angle * 0.4}, ${kX}, ${kYClamped})`}
      />
      {/* Modifier center dot */}
      <circle cx={kX} cy={kYClamped} r={compact ? 2.5 : 3.5} fill={KEY_COLOR} />
      <circle cx={kX} cy={kYClamped} r={compact ? 1 : 1.5} fill="rgba(255,250,230,0.90)" />

      {/* Elevation angle arc */}
      {angle !== 0 && (() => {
        const startRad = 0; // horizontal (eye level)
        const endRad = -kRad; // up from horizontal
        const x1 = subX + arcR * Math.cos(startRad);
        const y1 = eyeY + arcR * Math.sin(startRad);
        const x2 = subX + arcR * Math.cos(endRad);
        const y2 = eyeY + arcR * Math.sin(endRad);
        const largeArc = Math.abs(angle) > 90 ? 1 : 0;
        const sweep = angle > 0 ? 0 : 1;
        return (
          <g>
            <path
              d={`M ${x1} ${y1} A ${arcR} ${arcR} 0 ${largeArc} ${sweep} ${x2} ${y2}`}
              fill="none" stroke={KEY_COLOR} strokeWidth={0.8} strokeOpacity={0.50}
              strokeDasharray="2,1.5" />
            {/* Angle label */}
            <text
              x={subX + arcR + 6} y={eyeY - arcR * Math.sin(kRad / 2) + 3}
              fontSize={compact ? 8 : 9} fill={KEY_COLOR} fontWeight="700"
              fontFamily="Inter, system-ui, sans-serif" opacity={0.80}>
              {Math.round(angle)}°
            </text>
          </g>
        );
      })()}

      {/* Light stand — vertical line from modifier to floor */}
      <line x1={kX} y1={kYClamped + (compact ? 10 : 14)} x2={kX} y2={floorY}
        stroke={st(0.25)} strokeWidth={0.8} strokeDasharray="2,2" />
      {/* Stand base */}
      <line x1={kX - 6} y1={floorY} x2={kX + 6} y2={floorY}
        stroke={st(0.30)} strokeWidth={1} />

      {/* Labels */}
      {/* KEY label */}
      <text x={kX} y={kYClamped - (compact ? 16 : 20)}
        textAnchor="middle"
        fontSize={compact ? 7 : 8} fill={KEY_COLOR} fontWeight="700"
        letterSpacing="1" fontFamily="Inter, system-ui, sans-serif" opacity={0.75}>
        KEY
      </text>
      {/* Height label */}
      {heightLabel && (
        <text x={kX} y={kYClamped - (compact ? 10 : 13)}
          textAnchor="middle"
          fontSize={compact ? 5.5 : 6.5} fill={st(0.45)} fontWeight="600"
          fontFamily="Inter, system-ui, sans-serif">
          {heightLabel.replace(/_/g, ' ').toUpperCase()}
        </text>
      )}
      {/* Camera label */}
      <text x={W * 0.92} y={floorY - 3}
        textAnchor="end"
        fontSize={compact ? 6 : 7} fill={st(0.30)} fontWeight="600"
        letterSpacing="0.5" fontFamily="Inter, system-ui, sans-serif">
        CAM
      </text>
      {/* Camera icon */}
      <rect x={W * 0.86} y={floorY - 12} width={10} height={7} rx={1.5}
        fill="none" stroke={st(0.30)} strokeWidth={0.8} />

      {/* Distance annotation */}
      {distFt && (
        <text x={(subX + kX) / 2} y={floorY + 10}
          textAnchor="middle"
          fontSize={compact ? 6 : 7} fill={st(0.35)} fontWeight="500"
          fontFamily="Inter, system-ui, sans-serif">
          {distFt}
        </text>
      )}
    </svg>
  );
}
