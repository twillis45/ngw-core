import { useEffect } from 'react';

/**
 * NGWLogo — inline SVG logo lockup.
 *
 * Renders the symbol mark (analysis diagram) + "NO GUESSWORK / LIGHTING"
 * wordmark as a single component. All colours use CSS variables so it
 * automatically adapts to dark/light theme without any extra props.
 *
 * Sizes:
 *   sm  — 20px symbol, text 13/9px   (header default)
 *   md  — 28px symbol, text 16/11px  (splash / landing)
 *   lg  — 40px symbol, text 22/14px  (marketing)
 */

const SIZES = {
  sm: { sym: 20, main: 13, sub: 9,  gap: 6 },
  md: { sym: 28, main: 16, sub: 11, gap: 8 },
  lg: { sym: 40, main: 22, sub: 14, gap: 10 },
};

/* Profoto pack-head pop — three-layer synthesis */
function fireProfotoHead(audioCtx, time) {
  const sr = audioCtx.sampleRate;

  // Layer 1: trigger crack
  const crackBuf  = audioCtx.createBuffer(1, sr * 0.03, sr);
  const crackData = crackBuf.getChannelData(0);
  for (let i = 0; i < crackData.length; i++) {
    crackData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.003));
  }
  const crackSrc  = audioCtx.createBufferSource();
  crackSrc.buffer = crackBuf;
  const crackGain = audioCtx.createGain();
  crackGain.gain.value = 0.55;
  crackSrc.connect(crackGain);
  crackGain.connect(audioCtx.destination);
  crackSrc.start(time);

  // Layer 2: deep capacitor thump
  const thump     = audioCtx.createOscillator();
  const thumpGain = audioCtx.createGain();
  thump.type      = 'sine';
  thump.frequency.setValueAtTime(75, time);
  thump.frequency.exponentialRampToValueAtTime(30, time + 0.16);
  thumpGain.gain.setValueAtTime(0, time);
  thumpGain.gain.linearRampToValueAtTime(0.85, time + 0.004);
  thumpGain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);
  thump.connect(thumpGain);
  thumpGain.connect(audioCtx.destination);
  thump.start(time);
  thump.stop(time + 0.25);

  // Layer 3: tube resonance — deep body thud
  const tube     = audioCtx.createOscillator();
  const tubeGain = audioCtx.createGain();
  tube.type      = 'triangle';
  tube.frequency.setValueAtTime(120, time);
  tube.frequency.exponentialRampToValueAtTime(35, time + 0.26);
  tubeGain.gain.setValueAtTime(0, time);
  tubeGain.gain.linearRampToValueAtTime(0.75, time + 0.005);
  tubeGain.gain.exponentialRampToValueAtTime(0.001, time + 0.30);
  tube.connect(tubeGain);
  tubeGain.connect(audioCtx.destination);
  tube.start(time);
  tube.stop(time + 0.32);
}

/* Two full Profoto pack-head pops, ~700ms apart */
function fireSequence(audioCtx) {
  const t = audioCtx.currentTime + 0.05;

  fireProfotoHead(audioCtx, t, 1.0, false);
  fireProfotoHead(audioCtx, t + 0.7, 1.0, false);
}

export default function NGWLogo({ size = 'sm', className = '', loading = false }) {
  const s     = SIZES[size] ?? SIZES.sm;

  /* Fire strobe sequence on home arrival — 10 rapid pops + 2 main pops (~3.5s total).
   *
   * Autoplay policy: browsers block AudioContext until user gesture.
   * On first load / refresh: context starts suspended → we wait for first
   * pointerdown/keydown. Once unlockTriggered, we NEVER close the context in
   * cleanup — the resume().then(fire) chain must survive component unmount
   * (e.g. user taps "Analyze a Photo" which both triggers audio AND navigates away).
   * The context auto-closes 5s after fire() via setTimeout. */
  useEffect(() => {
    if (loading) return;
    let ctx;
    let fired          = false;
    let unlockTriggered = false;
    let closeTimer;

    function fire() {
      if (fired || !ctx) return;
      fired = true;
      fireSequence(ctx);
      closeTimer = setTimeout(() => { try { ctx?.close(); } catch (_) {} }, 5000);
    }

    function unlock() {
      unlockTriggered = true; // prevent cleanup from closing ctx before fire() runs
      ctx?.resume().then(fire);
    }

    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      ctx.resume().then(() => {
        if (ctx.state === 'running') {
          fire();
        } else {
          window.addEventListener('pointerdown', unlock, { once: true });
          window.addEventListener('keydown',     unlock, { once: true });
        }
      });
    } catch (_) { /* AudioContext not available — silent fallback */ }

    return () => {
      clearTimeout(closeTimer);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown',     unlock);
      // Only close if unlock was never triggered — otherwise let the 5s timer handle it
      if (!unlockTriggered && !fired) {
        try { ctx?.close(); } catch (_) {}
      }
    };
  }, [loading]);
  const r     = s.sym * 0.375;           // ring radius = 37.5% of symbol box
  const cx    = s.sym / 2;
  const cy    = s.sym / 2;

  // Key light at -135° (upper-left, classic portrait position)
  const angle = -135 * (Math.PI / 180);
  const lx    = cx + Math.cos(angle) * r; // ≈ cx - 0.707*r
  const ly    = cy + Math.sin(angle) * r;

  // Glow bloom radius — greatly oversized to bleed well beyond ring
  const bloomR  = r * 2.2;
  const coronaR = r * 0.55;
  const dotR    = r * 0.16;
  const subR    = r * 0.09;

  const glowId   = `ngw-glow-${size}`;
  const coreId   = `ngw-core-${size}`;

  return (
    <span
      className={`ngw-logo ngw-logo--${size}${loading ? ' ngw-logo--loading' : ''}${className ? ` ${className}` : ''}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: s.gap, lineHeight: 1 }}
    >
      {/* ── Symbol mark ──────────────────────────────────────────── */}
      <svg
        width={s.sym}
        height={s.sym}
        viewBox={`0 0 ${s.sym} ${s.sym}`}
        fill="none"
        aria-hidden="true"
        overflow="visible"
        style={{ flexShrink: 0, overflow: 'visible' }}
      >
        <defs>
          {/* Outer bloom — wide gold radial glow */}
          <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="var(--color-accent)" stopOpacity="0.75" />
            <stop offset="30%"  stopColor="var(--color-accent)" stopOpacity="0.45" />
            <stop offset="65%"  stopColor="var(--color-accent)" stopOpacity="0.15" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0"    />
          </radialGradient>
          {/* Hot core — blazing warm-white centre */}
          <radialGradient id={coreId} cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor="#FFFFFF"             stopOpacity="1.0" />
            <stop offset="20%"  stopColor="#FFF8EE"             stopOpacity="0.95" />
            <stop offset="55%"  stopColor="var(--color-accent)" stopOpacity="0.65" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0"    />
          </radialGradient>
        </defs>

        {/* Ring — fades in during warm-up */}
        <circle
          cx={cx} cy={cy} r={r}
          stroke="var(--color-accent)"
          strokeWidth={s.sym * 0.06}
          className="ngw-logo__ring"
        />
        {/* Beam — appears with the glow */}
        <line
          x1={lx} y1={ly} x2={cx} y2={cy}
          stroke="var(--color-accent)"
          strokeWidth={s.sym * 0.04}
          strokeOpacity="0.45"
          className="ngw-logo__beam"
        />
        {/* Bloom + corona group — the main glow animation */}
        <g className="ngw-logo__glow-group">
          <ellipse cx={lx} cy={ly} rx={bloomR} ry={bloomR} fill={`url(#${glowId})`} />
          <ellipse cx={lx} cy={ly} rx={coronaR} ry={coronaR} fill={`url(#${coreId})`} />
        </g>
        {/* Light source dot — the "filament" pop */}
        <circle cx={lx} cy={ly} r={dotR} fill="var(--color-accent)" className="ngw-logo__dot" />
        {/* Subject dot (centre) */}
        <circle cx={cx} cy={cy} r={subR} fill="var(--color-accent)" />
      </svg>

      {/* ── Wordmark ──────────────────────────────────────────────── */}
      <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span
          className="ngw-logo__main"
          style={{
            fontSize: s.main,
            fontWeight: 800,
            letterSpacing: '0.02em',
            lineHeight: 1,
            color: 'var(--color-text-primary)',
          }}
        >
          NO GUESSWORK
        </span>
        <span
          className="ngw-logo__sub"
          style={{
            fontSize: s.sub,
            fontWeight: 600,
            letterSpacing: '0.18em',
            lineHeight: 1,
            color: 'var(--color-accent)',
          }}
        >
          LIGHTING
        </span>
      </span>
    </span>
  );
}
