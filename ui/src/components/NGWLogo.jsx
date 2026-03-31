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

/* Single capacitor discharge click — the base strobe pop */
function fireClick(audioCtx, time, intensity = 1) {
  const dur  = audioCtx.sampleRate * 0.04;
  const buf  = audioCtx.createBuffer(1, dur, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (audioCtx.sampleRate * 0.006)) * intensity;
  }
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  const gain = audioCtx.createGain();
  gain.gain.value = 0.38;
  src.connect(gain);
  gain.connect(audioCtx.destination);
  src.start(time);
}

/* Canon HSS flash — rapid stutter of 3 micro-clicks ~2ms apart (hi-speed sync pulsing) */
function fireHSS(audioCtx, time, intensity = 1) {
  fireClick(audioCtx, time,          intensity);
  fireClick(audioCtx, time + 0.002,  intensity * 0.65);
  fireClick(audioCtx, time + 0.004,  intensity * 0.45);
}

/* Profoto pack-head pop — three-layer synthesis:
 *   1. Sharp high-freq crack  (trigger circuit)
 *   2. Deep capacitor thump   (~90Hz body, the "chest weight")
 *   3. Tube resonance plunk   (~350Hz mid, flash-tube character)
 */
function fireProfotoHead(audioCtx, time) {
  const sr = audioCtx.sampleRate;

  // Layer 1: trigger crack — short noise burst, harder transient than HSS
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

  // Layer 2: deep capacitor thump — low-freq sine, fast attack, punchy decay
  const thump      = audioCtx.createOscillator();
  const thumpGain  = audioCtx.createGain();
  thump.type       = 'sine';
  thump.frequency.setValueAtTime(95, time);
  thump.frequency.exponentialRampToValueAtTime(45, time + 0.12);
  thumpGain.gain.setValueAtTime(0, time);
  thumpGain.gain.linearRampToValueAtTime(0.7, time + 0.004);   // sharp attack
  thumpGain.gain.exponentialRampToValueAtTime(0.001, time + 0.18); // punchy decay
  thump.connect(thumpGain);
  thumpGain.connect(audioCtx.destination);
  thump.start(time);
  thump.stop(time + 0.2);

  // Layer 3: tube resonance — mid plunk, adds "body" above the thump
  const tube      = audioCtx.createOscillator();
  const tubeGain  = audioCtx.createGain();
  tube.type       = 'triangle';
  tube.frequency.setValueAtTime(350, time);
  tube.frequency.exponentialRampToValueAtTime(200, time + 0.08);
  tubeGain.gain.setValueAtTime(0, time);
  tubeGain.gain.linearRampToValueAtTime(0.22, time + 0.003);
  tubeGain.gain.exponentialRampToValueAtTime(0.001, time + 0.10);
  tube.connect(tubeGain);
  tubeGain.connect(audioCtx.destination);
  tube.start(time);
  tube.stop(time + 0.12);
}

/* Capacitor recycling whine — "ready" signal after main pop */
function fireReadyWhine(audioCtx, time) {
  const osc   = audioCtx.createOscillator();
  const ogain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(3800, time);
  osc.frequency.exponentialRampToValueAtTime(1200, time + 1.1);
  ogain.gain.setValueAtTime(0.055, time);
  ogain.gain.exponentialRampToValueAtTime(0.001, time + 1.1);
  osc.connect(ogain);
  ogain.connect(audioCtx.destination);
  osc.start(time);
  osc.stop(time + 1.1);
}

/* One complete strobe sequence: 5 HSS flashes → beat → 1 main pop → ready whine */
function fireSequence(audioCtx, base) {
  const t = audioCtx.currentTime + base;
  // 5 Canon HSS sync flashes — matching CSS F1–F5 (0/80/160/240/300ms)
  fireHSS(audioCtx, t + 0.005, 1.0);
  fireHSS(audioCtx, t + 0.080, 0.9);
  fireHSS(audioCtx, t + 0.160, 0.85);
  fireHSS(audioCtx, t + 0.240, 0.80);
  fireHSS(audioCtx, t + 0.300, 0.75);
  // Main flash — Profoto pack-head: trigger crack + deep thump + tube resonance
  fireProfotoHead(audioCtx, t + 0.700);
  // Capacitor ready whine immediately after main pop
  fireReadyWhine(audioCtx, t + 0.740);
}

export default function NGWLogo({ size = 'sm', className = '', loading = false }) {
  const s     = SIZES[size] ?? SIZES.sm;

  /* Fire strobe sounds when not in loading mode — one complete sequence per animation cycle */
  useEffect(() => {
    if (loading) return;
    let ctx;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      // Cycle 1 at 0s, cycle 2 at 5s — matches the CSS animation-iteration-count: 2
      fireSequence(ctx, 0);
      fireSequence(ctx, 5.0);
    } catch (_) { /* AudioContext blocked — silent fallback */ }
    return () => { try { ctx?.close(); } catch (_) {} };
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
