/**
 * CorrectionSheet — "Teach the Engine" structured correction prompt.
 *
 * Renders as a bottom-sheet overlay after the user selects Missed It
 * (or taps Teach the Engine directly). Posts to /api/failures/feedback.
 *
 * Design rules:
 * - SM inline styles only — no CSS class dependencies
 * - One tap, no required text (skip is valid partial signal)
 * - Never blames the photographer
 * - Errors must not crash the UI
 */
import { useState } from 'react';
import { steel, C } from '../../../../theme/studioMatte';
import { getToken } from '../../../../data/authApi';

const FONT_SMOOTH = { WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' };

const REASONS = [
  {
    id:    'wrong_pattern',
    label: 'Wrong lighting type',
    sub:   'The pattern doesn\'t match my shot at all',
  },
  {
    id:    'blueprint_didnt_work',
    label: 'Setup didn\'t work',
    sub:   'Pattern seemed right, but following the steps failed',
  },
  {
    id:    'couldnt_understand',
    label: 'Couldn\'t follow it',
    sub:   'Instructions were unclear or too hard to execute',
  },
  {
    id:    'low_confidence_confirmed',
    label: 'System seemed unsure',
    sub:   'Weak read — I tried anyway',
  },
];

/**
 * @param {string|null} failureEventId — ID returned by POST /api/failures/event
 * @param {Function}    onClose        — called when user submits, skips, or cancels
 */
export default function CorrectionSheet({ failureEventId, onClose }) {
  const [selected, setSelected] = useState(null);
  const [status, setStatus] = useState('idle'); // 'idle' | 'submitting' | 'saved' | 'error'

  async function handleSubmit(reasonId) {
    if (status !== 'idle') return;
    setSelected(reasonId);
    setStatus('submitting');
    try {
      const authHdr = getToken() ? { Authorization: `Bearer ${getToken()}` } : {};
      await fetch('/api/failures/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHdr },
        credentials: 'include',
        body: JSON.stringify({
          failure_event_id: failureEventId || null,
          reason: reasonId,
        }),
      });
      setStatus('saved');
      setTimeout(() => onClose?.(), 1200);
    } catch {
      setStatus('error');
    }
  }

  function handleSkip() {
    onClose?.();
  }

  const overlayStyle = {
    position: 'fixed', inset: 0, zIndex: 9999,
    background: 'rgba(8,10,12,0.88)',
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
  };

  const sheetStyle = {
    width: '100%', maxWidth: 540,
    borderRadius: '16px 16px 0 0',
    background: 'rgb(22,24,28)',
    boxShadow: '0 -4px 40px rgba(0,0,0,0.7), 0 0 0 0.5px rgba(255,255,255,0.05)',
    padding: '24px 20px 36px',
  };

  if (status === 'saved') {
    return (
      <div style={overlayStyle}>
        <div style={{ ...sheetStyle, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '32px 20px 40px' }}>
          <span style={{ fontSize: 18, color: C.confHigh, ...FONT_SMOOTH }}>✓</span>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: steel(0.72), ...FONT_SMOOTH }}>
            Correction saved.
          </p>
          <p style={{ margin: 0, fontSize: 11, color: steel(0.35), textAlign: 'center', ...FONT_SMOOTH }}>
            This feeds the learning engine.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div style={sheetStyle}>
        {/* Handle */}
        <div style={{ width: 36, height: 3, borderRadius: 2, background: steel(0.18), margin: '0 auto 20px' }} />

        {/* Header */}
        <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: steel(0.80), letterSpacing: '0.02em', ...FONT_SMOOTH }}>
          Teach the Engine
        </p>
        <p style={{ margin: '0 0 18px', fontSize: 11, color: steel(0.38), lineHeight: 1.5, ...FONT_SMOOTH }}>
          Tell NGW what it missed so future reads improve.
        </p>

        {/* Reason options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
          {REASONS.map(r => {
            const isSel = selected === r.id && status === 'submitting';
            return (
              <button
                key={r.id}
                onClick={() => handleSubmit(r.id)}
                disabled={status !== 'idle'}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                  width: '100%', padding: '12px 14px',
                  borderRadius: 10,
                  border: `1px solid ${isSel ? steel(0.28) : steel(0.10)}`,
                  background: isSel ? steel(0.08) : 'rgba(255,255,255,0.025)',
                  cursor: status === 'idle' ? 'pointer' : 'default',
                  textAlign: 'left',
                  WebkitTapHighlightColor: 'transparent',
                  transition: 'all 0.12s',
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 600, color: steel(0.72), ...FONT_SMOOTH }}>
                  {r.label}
                </span>
                <span style={{ fontSize: 11, color: steel(0.38), marginTop: 2, ...FONT_SMOOTH }}>
                  {r.sub}
                </span>
              </button>
            );
          })}
        </div>

        {/* Error state */}
        {status === 'error' && (
          <p style={{ margin: '0 0 10px', fontSize: 11, color: C.textDanger, textAlign: 'center', ...FONT_SMOOTH }}>
            Couldn't save correction. Try again.
          </p>
        )}

        {/* Skip */}
        <button
          onClick={handleSkip}
          style={{
            background: 'none', border: 'none', width: '100%',
            padding: '8px 0', cursor: 'pointer',
            fontSize: 11, color: steel(0.32), letterSpacing: '0.03em',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          Skip
        </button>
      </div>
    </div>
  );
}
