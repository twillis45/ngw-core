/**
 * NailedItOverlay — Studio Matte outcome capture sheet.
 *
 * Shown after a cockpit session ends (or after analyze, on screens that opt in).
 * Three tactile tiles: Nailed It · Almost · Off. One tap fires the outcome,
 * confirms briefly, and resolves. If the user dismisses without choosing,
 * the parent should still record an "unknown" signal — every session must
 * produce one.
 */
import { useState, useCallback } from 'react';
import { steel, C, FONT_SMOOTH } from '../../../../theme/studioMatte';
import { successHaptic, tapHaptic, warnHaptic } from '../../../../utils/haptics';
import { softClickSound } from '../../../../utils/sounds';

const TROUGH_SHADOW = [
  'inset 0px 3px 6px 0px rgba(0,0,0,0.7)',
  'inset 0px 1px 3px 0px rgba(0,0,0,0.5)',
  'inset 1px 0px 2px 0px rgba(0,0,0,0.3)',
  'inset -1px 0px 2px 0px rgba(0,0,0,0.3)',
  '0px 1px 0px 0px rgba(255,255,255,0.025)',
].join(', ');

const TILE_UP = [
  '0px 4px 12px 0px rgba(0,0,0,0.7)',
  '0px 2px 4px 0px rgba(0,0,0,0.5)',
  'inset 0px 1.5px 0px 0px rgba(255,255,255,0.14)',
  'inset 0px -1.5px 0px 0px rgba(0,0,0,0.4)',
  '0px 0px 0px 0.5px rgba(0,0,0,0.5)',
].join(', ');
const TILE_DOWN = [
  'inset 0px 2px 4px 0px rgba(0,0,0,0.6)',
  'inset 0px 1px 2px 0px rgba(0,0,0,0.4)',
].join(', ');

const OUTCOMES = [
  {
    id: 'nailed_it',
    label: 'Nailed It',
    sub: 'Shot locked',
    glyph: '✓',
    accent: 'rgba(72,186,136,0.85)',
    glow: '0 0 14px rgba(72,186,136,0.18)',
    haptic: 'success',
  },
  {
    id: 'close',
    label: 'Almost',
    sub: 'Close enough',
    glyph: '~',
    accent: 'rgba(245,190,72,0.85)',
    glow: '0 0 14px rgba(245,190,72,0.18)',
    haptic: 'tap',
  },
  {
    id: 'failed',
    label: 'Off',
    sub: 'Needs work',
    glyph: '✕',
    accent: 'rgba(230,90,90,0.85)',
    glow: '0 0 14px rgba(230,90,90,0.16)',
    haptic: 'warn',
  },
];

const CONFIRM = {
  nailed_it: { headline: 'Nailed it.',          sub: 'Pattern confirmed — locked.' },
  close:     { headline: 'Almost — we\'ll tune it.', sub: 'Logged for calibration.' },
  failed:    { headline: 'Logged. We\'ll fix it.',   sub: 'Straight into the refine queue.' },
};

/**
 * @param {boolean}  isOpen
 * @param {Function} onSelect — called with outcome id ('nailed_it' | 'close' | 'failed')
 * @param {Function} onDismiss — called when user closes without choosing
 * @param {string}   [headline] — overrides default header
 */
export default function NailedItOverlay({ isOpen, onSelect, onDismiss, headline = 'Did you nail it?' }) {
  const [selected, setSelected] = useState(null);
  const [pressed, setPressed]   = useState(null);

  const handlePick = useCallback((o) => {
    if (selected) return;
    setSelected(o.id);
    if (o.haptic === 'success') successHaptic();
    else if (o.haptic === 'warn') warnHaptic();
    else tapHaptic();
    softClickSound();
    onSelect?.(o.id);
  }, [selected, onSelect]);

  if (!isOpen) return null;

  const confirm = selected ? CONFIRM[selected] : null;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && !selected) onDismiss?.(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        backgroundColor: 'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div style={{
        width: '100%', maxWidth: 430, padding: '24px 20px 28px',
        backgroundColor: '#0a0b0d',
        borderTop: `0.5px solid ${steel(0.18)}`,
        boxShadow: '0 -8px 32px rgba(0,0,0,0.6)',
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        position: 'relative',
      }}>
        {/* Drag affordance */}
        <div style={{
          width: 36, height: 4, borderRadius: 2,
          backgroundColor: steel(0.18),
          margin: '0 auto 18px',
        }} />

        {/* Headline */}
        <p style={{
          margin: '0 0 4px', fontSize: 18, fontWeight: 800,
          color: C.textPrimary, textAlign: 'center', letterSpacing: '-0.2px',
          ...FONT_SMOOTH,
        }}>
          {selected ? confirm.headline : headline}
        </p>
        <p style={{
          margin: '0 0 22px', fontSize: 12, fontWeight: 500,
          color: steel(0.55), textAlign: 'center', letterSpacing: '0.2px',
          ...FONT_SMOOTH,
        }}>
          {selected ? confirm.sub : 'One tap trains the system.'}
        </p>

        {/* Trough holding 3 tiles */}
        <div style={{
          display: 'flex', alignItems: 'stretch', gap: 8,
          padding: 6, borderRadius: 18,
          backgroundColor: '#060608',
          boxShadow: TROUGH_SHADOW,
        }}>
          {OUTCOMES.map((o) => {
            const isSel = selected === o.id;
            const isDim = selected && !isSel;
            const isDown = pressed === o.id;
            return (
              <button
                key={o.id}
                disabled={!!selected}
                onPointerDown={() => !selected && setPressed(o.id)}
                onPointerUp={() => setPressed(null)}
                onPointerLeave={() => setPressed(null)}
                onClick={() => handlePick(o)}
                style={{
                  flex: 1,
                  height: 80,
                  borderRadius: 14,
                  background: isDown
                    ? 'linear-gradient(141.71deg, #1c1e26 0%, #15171f 100%)'
                    : 'linear-gradient(141.71deg, #2a2d38 0%, #1f2129 60%, #181a22 100%)',
                  boxShadow: isSel
                    ? `${TILE_UP}, ${o.glow}`
                    : isDown ? TILE_DOWN : TILE_UP,
                  border: 'none',
                  cursor: selected ? 'default' : 'pointer',
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  gap: 4,
                  padding: '10px 6px',
                  WebkitTapHighlightColor: 'transparent',
                  opacity: isDim ? 0.35 : 1,
                  transform: isDown ? 'translateY(1px) scale(0.98)' : 'translateY(0) scale(1)',
                  transition: 'opacity 0.25s ease, transform 0.1s ease, box-shadow 0.1s ease, background 0.1s ease',
                }}
              >
                <span style={{
                  fontSize: 22, lineHeight: 1, fontWeight: 700,
                  color: o.accent,
                  textShadow: isSel ? `0 0 6px ${o.accent}` : 'none',
                  ...FONT_SMOOTH,
                }}>{o.glyph}</span>
                <span style={{
                  fontSize: 12, fontWeight: 700,
                  color: 'rgba(245,247,250,0.92)',
                  letterSpacing: '0.4px',
                  ...FONT_SMOOTH,
                }}>{o.label}</span>
                <span style={{
                  fontSize: 9, fontWeight: 500,
                  color: steel(0.5), letterSpacing: '0.3px',
                  ...FONT_SMOOTH,
                }}>{o.sub}</span>
              </button>
            );
          })}
        </div>

        {/* Skip — only before a pick */}
        {!selected && (
          <button
            onClick={() => { tapHaptic(); onDismiss?.(); }}
            style={{
              marginTop: 16, width: '100%',
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 500, color: steel(0.45),
              letterSpacing: '0.3px', padding: '8px 0',
              WebkitTapHighlightColor: 'transparent',
              ...FONT_SMOOTH,
            }}
          >
            Skip — don't record this one
          </button>
        )}
      </div>
    </div>
  );
}
