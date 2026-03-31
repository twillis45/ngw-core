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

/* Canon DSLR shutter — mirror-up slap + shutter blade click */
function fireCanonShutter(audioCtx, time) {
  const sr = audioCtx.sampleRate;

  // Mirror-up slap — bandpass filtered noise, mid-heavy transient
  const slapBuf  = audioCtx.createBuffer(1, sr * 0.022, sr);
  const slapData = slapBuf.getChannelData(0);
  for (let i = 0; i < slapData.length; i++) {
    slapData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.004));
  }
  const slapSrc  = audioCtx.createBufferSource();
  slapSrc.buffer = slapBuf;
  const bp = audioCtx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1600;
  bp.Q.value = 0.7;
  const slapGain = audioCtx.createGain();
  slapGain.gain.value = 0.30;
  slapSrc.connect(bp);
  bp.connect(slapGain);
  slapGain.connect(audioCtx.destination);
  slapSrc.start(time);

  // Shutter blade thwick — short, higher-pitched click
  const bladeBuf  = audioCtx.createBuffer(1, sr * 0.010, sr);
  const bladeData = bladeBuf.getChannelData(0);
  for (let i = 0; i < bladeData.length; i++) {
    bladeData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.0015));
  }
  const bladeSrc  = audioCtx.createBufferSource();
  bladeSrc.buffer = bladeBuf;
  const hpf = audioCtx.createBiquadFilter();
  hpf.type = 'highpass';
  hpf.frequency.value = 3500;
  const bladeGain = audioCtx.createGain();
  bladeGain.gain.value = 0.18;
  bladeSrc.connect(hpf);
  hpf.connect(bladeGain);
  bladeGain.connect(audioCtx.destination);
  bladeSrc.start(time + 0.005);
}

/* Profoto pack-head pop — three-layer synthesis.
 *   intensity : 0–1 scale for all gains
 *   short     : true = rapid burst pop (no tube layer, tighter thump)
 */
function fireProfotoHead(audioCtx, time, intensity = 1.0, short = false) {
  const sr = audioCtx.sampleRate;

  // Layer 1: trigger crack
  const crackBuf  = audioCtx.createBuffer(1, sr * (short ? 0.015 : 0.03), sr);
  const crackData = crackBuf.getChannelData(0);
  const crackDecay = short ? 0.0015 : 0.003;
  for (let i = 0; i < crackData.length; i++) {
    crackData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * crackDecay));
  }
  const crackSrc  = audioCtx.createBufferSource();
  crackSrc.buffer = crackBuf;
  const crackGain = audioCtx.createGain();
  crackGain.gain.value = (short ? 0.45 : 0.55) * intensity;
  crackSrc.connect(crackGain);
  crackGain.connect(audioCtx.destination);
  crackSrc.start(time);

  // Layer 2: deep capacitor thump
  const thump     = audioCtx.createOscillator();
  const thumpGain = audioCtx.createGain();
  thump.type      = 'sine';
  thump.frequency.setValueAtTime(short ? 120 : 95, time);
  thump.frequency.exponentialRampToValueAtTime(short ? 70 : 45, time + (short ? 0.06 : 0.12));
  thumpGain.gain.setValueAtTime(0, time);
  thumpGain.gain.linearRampToValueAtTime((short ? 0.28 : 0.7) * intensity, time + 0.004);
  thumpGain.gain.exponentialRampToValueAtTime(0.001, time + (short ? 0.06 : 0.18));
  thump.connect(thumpGain);
  thumpGain.connect(audioCtx.destination);
  thump.start(time);
  thump.stop(time + (short ? 0.08 : 0.2));

  if (!short) {
    // Layer 3: tube resonance — mid plunk, full pops only
    const tube     = audioCtx.createOscillator();
    const tubeGain = audioCtx.createGain();
    tube.type      = 'triangle';
    tube.frequency.setValueAtTime(350, time);
    tube.frequency.exponentialRampToValueAtTime(200, time + 0.08);
    tubeGain.gain.setValueAtTime(0, time);
    tubeGain.gain.linearRampToValueAtTime(0.22 * intensity, time + 0.003);
    tubeGain.gain.exponentialRampToValueAtTime(0.001, time + 0.10);
    tube.connect(tubeGain);
    tubeGain.connect(audioCtx.destination);
    tube.start(time);
    tube.stop(time + 0.12);
  }
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

/* Full strobe sequence: 10 rapid Profoto+shutter pops → beat → 2 full Profoto+shutter pops → ready whines
 * All fires in one continuous run (~3.5s total) */
function fireSequence(audioCtx) {
  const t = audioCtx.currentTime + 0.05;
  const interval = 0.065; // 65ms between rapid pops

  // 10 rapid short pops — Profoto short + Canon shutter each
  for (let i = 0; i < 10; i++) {
    const offset = i * interval;
    const intensity = 1.0 - i * 0.025; // slight taper 1.0 → 0.775
    fireCanonShutter(audioCtx, t + offset);
    fireProfotoHead(audioCtx, t + offset + 0.005, intensity, true);
  }

  // Beat gap after rapid pops
  const mainBase = t + 10 * interval + 0.22; // ~0.87s from start

  // Main pop 1 — full Profoto + Canon shutter + ready whine
  fireCanonShutter(audioCtx, mainBase);
  fireProfotoHead(audioCtx, mainBase + 0.005, 1.0, false);
  fireReadyWhine(audioCtx, mainBase + 0.045);

  // Main pop 2 — same, ~700ms after first
  fireCanonShutter(audioCtx, mainBase + 0.7);
  fireProfotoHead(audioCtx, mainBase + 0.705, 1.0, false);
  fireReadyWhine(audioCtx, mainBase + 0.745);
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
