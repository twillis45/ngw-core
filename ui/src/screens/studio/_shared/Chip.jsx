/**
 * Chip — tactile Studio Matte pill with personality.
 *
 * Replaces the ad-hoc flat pills previously inlined in ResultScreen and
 * SetupScreen. A Chip is a small raised capsule with:
 *   • dual-edge bevel (top-left highlight + bottom-right inset shadow)
 *   • subtle vertical gradient tinted by variant
 *   • 0.5px colored rim matching the variant
 *   • a luminous leading dot with a soft halo glow
 *   • engraved, letter-spaced uppercase text
 *
 * Variants: warn · danger · info · success · neutral · accent
 * Sizes:    sm (compact) · md (default)
 *
 * Use the `showDot={false}` escape hatch for dense meta readouts where the
 * dot would feel repetitive, but prefer keeping it for visual rhythm.
 */
import { C, steel, FONT_SMOOTH } from '../../../theme/studioMatte';

// ─── Variant palette ─────────────────────────────────────────────────────────
// Each variant contributes: foreground text, dot, rim border, and a two-stop
// gradient (top → bottom) so the pill catches an ambient top highlight.
const VARIANTS = {
  warn: {
    fg:  'rgba(250,210,130,0.95)',
    dot: 'rgba(245,190,72,1)',
    rim: 'rgba(245,190,72,0.32)',
    bg1: 'rgba(245,190,72,0.16)',
    bg2: 'rgba(245,190,72,0.03)',
  },
  danger: {
    fg:  'rgba(245,150,150,0.95)',
    dot: 'rgba(240,110,110,1)',
    rim: 'rgba(220,80,80,0.34)',
    bg1: 'rgba(210,70,70,0.18)',
    bg2: 'rgba(180,50,50,0.03)',
  },
  info: {
    fg:  steel(0.85),
    dot: steel(0.75),
    rim: steel(0.30),
    bg1: steel(0.12),
    bg2: steel(0.02),
  },
  success: {
    fg:  'rgba(140,225,180,0.95)',
    dot: 'rgba(72,186,136,1)',
    rim: 'rgba(72,186,136,0.32)',
    bg1: 'rgba(72,186,136,0.14)',
    bg2: 'rgba(72,186,136,0.02)',
  },
  neutral: {
    fg:  steel(0.78),
    dot: steel(0.55),
    rim: 'rgba(255,255,255,0.05)',
    bg1: 'rgba(184,191,199,0.07)',
    bg2: 'rgba(0,0,0,0.25)',
  },
  accent: {
    fg:  'rgba(180,205,235,0.95)',
    dot: 'rgba(130,170,220,1)',
    rim: 'rgba(130,170,220,0.30)',
    bg1: 'rgba(130,170,220,0.14)',
    bg2: 'rgba(130,170,220,0.02)',
  },
};

// ─── Size presets ────────────────────────────────────────────────────────────
const SIZES = {
  sm: {
    height: 20, padLeft: 7, padRight: 9,
    fontSize: 9, letterSpacing: '0.7px',
    gap: 5, dot: 4, radius: 5,
  },
  md: {
    height: 24, padLeft: 9, padRight: 11,
    fontSize: 10, letterSpacing: '0.8px',
    gap: 6, dot: 5, radius: 6,
  },
};

// Shared bevel + drop: hairline top-left highlight, deeper inset at bottom-right,
// plus a soft 1px drop shadow so each chip reads as a small raised token. The
// rim colour is appended per-variant in the inline style below.
const CHIP_BEVEL = [
  'inset 1px 1px 0px 0px rgba(255,255,255,0.08)',
  'inset -1px -1px 1px 0px rgba(0,0,0,0.35)',
  '0px 1px 2px 0px rgba(0,0,0,0.45)',
].join(', ');

export default function Chip({
  label,
  variant = 'neutral',
  size = 'sm',
  showDot = true,
  icon = null,       // optional leading glyph; replaces dot when provided
  title,             // optional tooltip
  style,
}) {
  const v = VARIANTS[variant] || VARIANTS.neutral;
  const s = SIZES[size] || SIZES.sm;

  return (
    <div
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: s.gap,
        flexShrink: 0,
        height: s.height,
        paddingLeft: s.padLeft,
        paddingRight: s.padRight,
        borderRadius: s.radius,
        background: `linear-gradient(180deg, ${v.bg1} 0%, ${v.bg2} 100%)`,
        boxShadow: `${CHIP_BEVEL}, 0 0 0 0.5px ${v.rim}`,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {icon ? (
        <span style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: s.dot + 2, height: s.dot + 2, color: v.fg,
        }}>{icon}</span>
      ) : showDot ? (
        <span style={{
          width: s.dot, height: s.dot, borderRadius: s.dot,
          backgroundColor: v.dot,
          boxShadow: `0 0 6px ${v.dot}, 0 0 1px rgba(255,255,255,0.25), inset 0 0.5px 0.5px rgba(255,255,255,0.4)`,
          flexShrink: 0,
        }} />
      ) : null}
      <span style={{
        fontSize: s.fontSize,
        fontWeight: 700,
        color: v.fg,
        letterSpacing: s.letterSpacing,
        textShadow: '0 1px 0 rgba(0,0,0,0.55)',
        ...FONT_SMOOTH,
      }}>
        {label}
      </span>
    </div>
  );
}

// Helper for mapping engine `sev` strings to Chip variants so call sites
// don't have to repeat the ternary ladder.
export function sevToVariant(sev) {
  if (sev === 'danger') return 'danger';
  if (sev === 'warn')   return 'warn';
  if (sev === 'info')   return 'info';
  return 'neutral';
}
