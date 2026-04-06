import { useEffect } from 'react';

// ─── Shared AudioContext — primed on any gesture app-wide ─────────────────────
// This ensures the context is already in `running` state when HomeScreen mounts
// after a nav tap, not just on refresh/direct load.
let _sharedCtx = null;

function _ensureCtx() {
  if (_sharedCtx && _sharedCtx.state !== 'closed') return _sharedCtx;
  try { _sharedCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (_) { return null; }
  return _sharedCtx;
}

if (typeof window !== 'undefined') {
  // Prime on ANY gesture so context is ready when HomeScreen mounts post-navigation
  window.addEventListener('pointerdown', () => { _ensureCtx()?.resume(); }, { passive: true });
  window.addEventListener('keydown',     () => { _ensureCtx()?.resume(); }, { passive: true });
}

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

/* ── Profoto pack-head — all five layers ─────────────────────────────── */

// Layer 1: Sync trigger crack — the sharp transient at the moment of firing
function fireTriggerCrack(ctx, t) {
  const sr  = ctx.sampleRate;
  const buf = ctx.createBuffer(1, Math.ceil(sr * 0.012), sr);
  const d   = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.0018));
  const src  = ctx.createBufferSource();
  src.buffer = buf;
  const hp   = ctx.createBiquadFilter();
  hp.type    = 'highpass';
  hp.frequency.value = 2400;
  const g    = ctx.createGain();
  g.gain.value = 0.45;
  src.connect(hp); hp.connect(g); g.connect(ctx.destination);
  src.start(t);
}

// Layer 2: Xenon tube pop — bright mid-range flash of the tube itself
function fireXenonPop(ctx, t) {
  const sr  = ctx.sampleRate;
  const buf = ctx.createBuffer(1, Math.ceil(sr * 0.028), sr);
  const d   = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.006));
  const src  = ctx.createBufferSource();
  src.buffer = buf;
  const bp   = ctx.createBiquadFilter();
  bp.type    = 'bandpass';
  bp.frequency.value = 3200;
  bp.Q.value = 0.7;
  const g    = ctx.createGain();
  g.gain.value = 0.60;
  src.connect(bp); bp.connect(g); g.connect(ctx.destination);
  src.start(t);
}

// Layer 3: Capacitor thump — deep sub-bass capacitor discharge
function fireCapThump(ctx, t) {
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type   = 'sine';
  osc.frequency.setValueAtTime(62, t);
  osc.frequency.exponentialRampToValueAtTime(20, t + 0.18);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(1.0, t + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start(t); osc.stop(t + 0.30);
}

// Layer 4: Tube resonance — the head housing resonating, long heavy tail
function fireTubeResonance(ctx, t) {
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type   = 'triangle';
  osc.frequency.setValueAtTime(88, t);
  osc.frequency.exponentialRampToValueAtTime(22, t + 0.42);
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.95, t + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.52);
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start(t); osc.stop(t + 0.54);
}

// Layer 5: Recycle whine — capacitors charging back up after the pop
function fireRecycleWhine(ctx, t) {
  const osc  = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type   = 'sine';
  osc.frequency.setValueAtTime(550, t + 0.06);
  osc.frequency.exponentialRampToValueAtTime(1600, t + 0.55);
  osc.frequency.exponentialRampToValueAtTime(2100, t + 1.1);
  gain.gain.setValueAtTime(0, t + 0.06);
  gain.gain.linearRampToValueAtTime(0.10, t + 0.18);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
  osc.connect(gain); gain.connect(ctx.destination);
  osc.start(t + 0.06); osc.stop(t + 1.25);
}

// All five layers together
function fireProfotoHead(ctx, t) {
  fireTriggerCrack(ctx, t);
  fireXenonPop(ctx, t + 0.002);
  fireCapThump(ctx, t);
  fireTubeResonance(ctx, t + 0.001);
  fireRecycleWhine(ctx, t);
}

/* Single flash pop with light */
function fireSequence(audioCtx) {
  const t = audioCtx.currentTime + 0.05;
  fireProfotoHead(audioCtx, t);
}

export default function NGWLogo({ size = 'sm', className = '', loading = false }) {
  const s     = SIZES[size] ?? SIZES.sm;

  /* Fire single strobe pop on home arrival.
   *
   * Uses a module-level _sharedCtx primed by any gesture app-wide (including
   * the nav tap that brought us here). If it's already running → fire instantly.
   * If still suspended (refresh / direct load) → wait for next gesture. */
  useEffect(() => {
    if (loading) return;
    let fired      = false;
    let closeTimer;

    function fire(ctx) {
      if (fired) return;
      fired = true;
      fireSequence(ctx);
      // Reset shared ctx after sequence so next home visit gets a fresh one
      closeTimer = setTimeout(() => {
        try { _sharedCtx?.close(); } catch (_) {}
        _sharedCtx = null;
      }, 5500);
    }

    const ctx = _ensureCtx();
    if (!ctx) return;

    if (ctx.state === 'running') {
      // Navigation case: context already unlocked by the nav tap
      fire(ctx);
      return () => clearTimeout(closeTimer);
    }

    // Refresh / direct load: context suspended — wait for first gesture
    function unlock() { ctx.resume().then(() => { if (ctx.state === 'running') fire(ctx); }); }
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown',     unlock, { once: true });

    return () => {
      clearTimeout(closeTimer);
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown',     unlock);
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
