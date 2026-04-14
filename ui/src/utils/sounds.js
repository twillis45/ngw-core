/**
 * sounds.js — Synthesized UI sounds via Web Audio API
 *
 * No external audio files — all sounds are procedurally generated.
 * Aesthetic: precision lab equipment, luxury camera mechanisms.
 * Every sound is muted, warm, mechanical — never shrill or celebratory.
 */

let ctx = null;
// Cache the enabled flag — settings reads happened on every sound call,
// adding ~0.1ms each time and preventing rapid sequences from staying tight.
// Re-read on storage events so toggles still take effect immediately.
let _enabledCache = null;
function isSoundEnabled() {
  if (_enabledCache !== null) return _enabledCache;
  try {
    const raw = localStorage.getItem('ngw_settings');
    if (!raw) return (_enabledCache = true);
    const s = JSON.parse(raw);
    _enabledCache = s.soundEnabled !== false;
    return _enabledCache;
  } catch { return (_enabledCache = true); }
}
if (typeof window !== 'undefined') {
  window.addEventListener('storage', () => { _enabledCache = null; });
}

function getCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  // Resume if suspended (autoplay policy).  We do NOT await here — sounds
  // pre-warm via primeAudio() on the first user gesture, so by the time any
  // sound function is called, the context is already running.  Calling
  // resume() on an already-running context is a cheap no-op.
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}


/**
 * Pre-warm the AudioContext on the first user gesture.  Mobile browsers start
 * the context suspended; the first call to `ctx.resume()` after a real
 * gesture takes 50–200ms on iOS and is what makes the *first* sound feel
 * delayed.  Calling primeAudio() from a top-level pointerdown handler at app
 * mount moves that cost off the click→sound critical path.
 *
 * Idempotent — safe to call multiple times.
 */
let _primed = false;
export function primeAudio() {
  if (_primed) return;
  _primed = true;
  try {
    const ac = getCtx();
    if (ac.state === 'suspended') {
      // Resume + play a single zero-volume tick so iOS unlocks the context.
      ac.resume().catch(() => {});
      const g = ac.createGain();
      g.gain.value = 0;
      g.connect(ac.destination);
      const o = ac.createOscillator();
      o.frequency.value = 1;
      o.connect(g);
      o.start();
      o.stop(ac.currentTime + 0.001);
    }
  } catch { /* ignore */ }
}
// Auto-prime on first pointer/touch/key gesture anywhere in the app.  This is
// the cheapest way to guarantee the AudioContext is running before any sound
// function is invoked, without requiring every screen to call primeAudio().
if (typeof window !== 'undefined') {
  const _prime = () => {
    primeAudio();
    window.removeEventListener('pointerdown', _prime);
    window.removeEventListener('touchstart', _prime);
    window.removeEventListener('keydown', _prime);
  };
  window.addEventListener('pointerdown', _prime, { once: false, passive: true });
  window.addEventListener('touchstart', _prime, { once: false, passive: true });
  window.addEventListener('keydown', _prime, { once: false });
}

/** Shared noise buffer — avoids re-allocating per call */
let _noiseCache = null;
function noiseBuffer(ac, seconds = 0.05) {
  const len = Math.floor(ac.sampleRate * seconds);
  if (_noiseCache && _noiseCache.length >= len) return _noiseCache;
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  _noiseCache = buf;
  return buf;
}

// ─────────────────────────────────────────────────────────────────────────────
// Analyze button — dramatic medium-format shutter mechanism.
//
// MOBILE-TUNED — phone speakers have effectively zero output below ~250 Hz
// and peak sensitivity around 1.5–3.5 kHz.  The previous version put most of
// its energy at 42–180 Hz (body thud + charge sweep), which sounded great on
// desktop but disappeared completely on mobile.  This redesign moves all
// fundamentals into the 220 Hz – 5 kHz band where mobile speakers actually
// live, while preserving the shutter character via overtones and transients.
//
// 5 stages: tension flare → body impact (mid-pitched) → punch crack →
// blade snap → mid-band settle + bright shimmer tail.
// ─────────────────────────────────────────────────────────────────────────────
export function analyzeClickSound() {
  try {
    if (!isSoundEnabled()) return;
    const ac = getCtx();
    // Context should already be running — primeAudio() runs on the first
    // user gesture at app mount.  If for some reason it isn't, fire-and-forget
    // resume() and proceed; the scheduled nodes still fire on iOS as long as
    // the call originates from a user gesture.
    if (ac.state !== 'running') ac.resume();
    const now = ac.currentTime;

    // Master gain pushed to 4.0 (was 2.5).  The aggressive limiter below holds
    // the peak at -6 dBFS — perceived loudness comes from sustained density,
    // not peak amplitude, which is what survives mobile speaker compression.
    const master = ac.createGain();
    master.gain.setValueAtTime(4.0, now);
    master.gain.setValueAtTime(4.0, now + 0.40);
    master.gain.exponentialRampToValueAtTime(0.001, now + 1.05);

    // Hard limiter — pushed harder for mobile.  Threshold -6, ratio 20, fast
    // attack: this is what gives the sound its "loudness density" so it
    // survives both phone speaker compression and Bluetooth codec dithering.
    const limiter = ac.createDynamicsCompressor();
    limiter.threshold.setValueAtTime(-6, now);
    limiter.knee.setValueAtTime(0, now);
    limiter.ratio.setValueAtTime(20, now);
    limiter.attack.setValueAtTime(0.001, now);
    limiter.release.setValueAtTime(0.08, now);
    master.connect(limiter);
    limiter.connect(ac.destination);

    // ── Stage 1: tension flare (0–25ms) ──
    // Triangle wave 165 → 380 Hz (lowered from 220 → 520).  Triangle harmonics
    // carry the perceived pitch sweep on mobile even when the fundamental
    // rolls off below the speaker's response curve.
    const charge = ac.createOscillator();
    const chargeGain = ac.createGain();
    charge.type = 'triangle';
    charge.frequency.setValueAtTime(165, now);
    charge.frequency.exponentialRampToValueAtTime(380, now + 0.022);
    chargeGain.gain.setValueAtTime(0.95, now);
    chargeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.026);
    charge.connect(chargeGain).connect(master);
    charge.start(now);
    charge.stop(now + 0.03);

    // Tension hiss — bandpass dropped 1500 → 1050 Hz for a warmer, lower
    // pre-flare than the previous mid-treble hiss.
    const tensionSrc = ac.createBufferSource();
    const tensionFlt = ac.createBiquadFilter();
    const tensionGain = ac.createGain();
    tensionFlt.type = 'bandpass';
    tensionFlt.frequency.value = 1050;
    tensionFlt.Q.value = 0.6;
    tensionGain.gain.setValueAtTime(0.25, now);
    tensionGain.gain.linearRampToValueAtTime(0.6, now + 0.022);
    tensionGain.gain.exponentialRampToValueAtTime(0.001, now + 0.030);
    tensionSrc.buffer = noiseBuffer(ac, 0.06);
    tensionSrc.connect(tensionFlt).connect(tensionGain).connect(master);
    tensionSrc.start(now);

    // ── Stage 2: body impact (28ms) ──
    // Body thud sweeps 180 → 95 Hz (was 220 → 110).  95 Hz is below most phone
    // speakers, but the missing-fundamental harmonic stack below carries the
    // perceived weight while the lowered fundamental warms the desktop tone.
    const thud = ac.createOscillator();
    const thudGain = ac.createGain();
    thud.type = 'sine';
    thud.frequency.setValueAtTime(180, now + 0.028);
    thud.frequency.exponentialRampToValueAtTime(95, now + 0.13);
    thudGain.gain.setValueAtTime(0, now);
    thudGain.gain.setValueAtTime(2.6, now + 0.028);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    thud.connect(thudGain).connect(master);
    thud.start(now + 0.026);
    thud.stop(now + 0.20);

    // Octave-up harmonic of the body — 360 → 190 Hz triangle (was 440 → 220).
    // Pairing fundamental + 2nd harmonic makes the ear infer a missing
    // fundamental an octave below what the speaker actually produces, so a
    // lower harmonic stack reads as a deeper body without losing audibility.
    const sub = ac.createOscillator();
    const subGain = ac.createGain();
    sub.type = 'triangle';
    sub.frequency.setValueAtTime(360, now + 0.028);
    sub.frequency.exponentialRampToValueAtTime(190, now + 0.13);
    subGain.gain.setValueAtTime(0, now);
    subGain.gain.setValueAtTime(1.1, now + 0.028);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    sub.connect(subGain).connect(master);
    sub.start(now + 0.028);
    sub.stop(now + 0.18);

    // Impact crack — bandpass dropped 2200 → 1500 Hz.  Still in the mobile
    // sweet spot but the burst now sits a third lower in pitch and reads as
    // a heavier mechanical contact, not a bright snap.
    const crackLen = Math.floor(ac.sampleRate * 0.06);
    const crackBuf = ac.createBuffer(1, crackLen, ac.sampleRate);
    const crackD = crackBuf.getChannelData(0);
    for (let i = 0; i < crackLen; i++) {
      const env = Math.exp(-i / (ac.sampleRate * 0.008));
      crackD[i] = (Math.random() * 2 - 1) * env;
    }
    const crack = ac.createBufferSource();
    const crackBp = ac.createBiquadFilter();
    const crackGain = ac.createGain();
    crackBp.type = 'bandpass';
    crackBp.frequency.value = 1500;
    crackBp.Q.value = 0.9;
    crackGain.gain.setValueAtTime(2.4, now + 0.028);
    crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.10);
    crack.buffer = crackBuf;
    crack.connect(crackBp).connect(crackGain).connect(master);
    crack.start(now + 0.028);

    // ── Stage 3: shutter blade snap (80ms) ──
    // Bandpass dropped 3800 → 2600 Hz — still bright enough to read as a
    // metallic snap on mobile, but warmer and less needle-like than before.
    const snapLen = Math.floor(ac.sampleRate * 0.025);
    const snapBuf = ac.createBuffer(1, snapLen, ac.sampleRate);
    const snapD = snapBuf.getChannelData(0);
    for (let i = 0; i < snapLen; i++) {
      const env = Math.exp(-i / (ac.sampleRate * 0.0025));
      snapD[i] = (Math.random() * 2 - 1) * env;
    }
    const snap = ac.createBufferSource();
    const snapBp = ac.createBiquadFilter();
    const snapGain = ac.createGain();
    snapBp.type = 'bandpass';
    snapBp.frequency.value = 2600;
    snapBp.Q.value = 2.0;
    snapGain.gain.setValueAtTime(2.0, now + 0.080);
    snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    snap.buffer = snapBuf;
    snap.connect(snapBp).connect(snapGain).connect(master);
    snap.start(now + 0.080);

    // ── Stage 4: mid-band settle (110ms) ──
    // Bandpass dropped 900 → 620 Hz.  Still in the band the phone can deliver,
    // but warmer — feels like heavier internal mass settling.
    const settleLen = Math.floor(ac.sampleRate * 0.22);
    const settleBuf = ac.createBuffer(1, settleLen, ac.sampleRate);
    const settleD = settleBuf.getChannelData(0);
    for (let i = 0; i < settleLen; i++) {
      settleD[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * 0.05));
    }
    const settle = ac.createBufferSource();
    const settleBp = ac.createBiquadFilter();
    const settleGain = ac.createGain();
    settleBp.type = 'bandpass';
    settleBp.frequency.value = 620;
    settleBp.Q.value = 0.6;
    settleGain.gain.setValueAtTime(0.85, now + 0.11);
    settleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
    settle.buffer = settleBuf;
    settle.connect(settleBp).connect(settleGain).connect(master);
    settle.start(now + 0.11);

    // ── Stage 5: shimmer tail (140ms) ──
    // Bandpass dropped 5500 → 3800 Hz.  Still survives mobile speaker
    // rolloff but the high sparkle sits a fourth lower for a warmer overall
    // tone instead of the previous bright top end.
    const shimmerLen = Math.floor(ac.sampleRate * 0.18);
    const shimmerBuf = ac.createBuffer(1, shimmerLen, ac.sampleRate);
    const shimmerD = shimmerBuf.getChannelData(0);
    for (let i = 0; i < shimmerLen; i++) {
      shimmerD[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * 0.04));
    }
    const shimmer = ac.createBufferSource();
    const shimmerBp = ac.createBiquadFilter();
    const shimmerGain = ac.createGain();
    shimmerBp.type = 'bandpass';
    shimmerBp.frequency.value = 3800;
    shimmerBp.Q.value = 1.5;
    shimmerGain.gain.setValueAtTime(0.55, now + 0.14);
    shimmerGain.gain.exponentialRampToValueAtTime(0.001, now + 0.30);
    shimmer.buffer = shimmerBuf;
    shimmer.connect(shimmerBp).connect(shimmerGain).connect(master);
    shimmer.start(now + 0.14);
  } catch { /* silent */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Soft click — single quiet pop, like a fingertip on a precision switch.
// Pure impulse, no tone, no ring. 3ms air pop.
// ─────────────────────────────────────────────────────────────────────────────
export function softClickSound() {
  try {
    if (!isSoundEnabled()) return;
    const ac = getCtx();
    const now = ac.currentTime;

    const len = Math.floor(ac.sampleRate * 0.004);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    d[0] = 1.0;
    d[1] = -0.6;
    d[2] = 0.3;
    for (let i = 3; i < len; i++) d[i] = 0;

    const src = ac.createBufferSource();
    const flt = ac.createBiquadFilter();
    const gain = ac.createGain();
    flt.type = 'lowpass';
    flt.frequency.value = 1400;
    flt.Q.value = 0.5;
    gain.gain.setValueAtTime(0.4, now);
    src.buffer = buf;
    src.connect(flt).connect(gain).connect(ac.destination);
    src.start(now);
  } catch { /* silent */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Image drop — precision mechanism engaging.
// Two-stage: filtered impulse (physical contact) + brief low resonance
// (latch seating). Like a Leica film back closing.
// ─────────────────────────────────────────────────────────────────────────────
export function imageDropSound() {
  try {
    if (!isSoundEnabled()) return;
    const ac = getCtx();
    const now = ac.currentTime;

    const master = ac.createGain();
    master.gain.setValueAtTime(0.55, now);
    master.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    master.connect(ac.destination);

    // Stage 1: mechanical contact — bandpassed noise impulse
    const impSrc = ac.createBufferSource();
    const impFilter = ac.createBiquadFilter();
    const impGain = ac.createGain();
    impFilter.type = 'bandpass';
    impFilter.frequency.value = 2200;
    impFilter.Q.value = 1.8;
    impGain.gain.setValueAtTime(0.8, now);
    impGain.gain.exponentialRampToValueAtTime(0.001, now + 0.015);
    impSrc.buffer = noiseBuffer(ac);
    impSrc.connect(impFilter).connect(impGain).connect(master);
    impSrc.start(now);

    // Stage 2: latch resonance — damped low tone
    const res = ac.createOscillator();
    const resGain = ac.createGain();
    res.type = 'sine';
    res.frequency.setValueAtTime(220, now + 0.008);
    res.frequency.exponentialRampToValueAtTime(160, now + 0.12);
    resGain.gain.setValueAtTime(0, now);
    resGain.gain.linearRampToValueAtTime(0.55, now + 0.01);
    resGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    res.connect(resGain).connect(master);
    res.start(now + 0.008);
    res.stop(now + 0.18);

    // Stage 3: air release — highpassed noise tail
    const airSrc = ac.createBufferSource();
    const airFilter = ac.createBiquadFilter();
    const airGain = ac.createGain();
    airFilter.type = 'highpass';
    airFilter.frequency.value = 4000;
    airFilter.Q.value = 0.3;
    airGain.gain.setValueAtTime(0.12, now + 0.01);
    airGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    airSrc.buffer = noiseBuffer(ac);
    airSrc.connect(airFilter).connect(airGain).connect(master);
    airSrc.start(now + 0.01);
  } catch { /* silent */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Result reveal — precision latch engaging.
//
// Two-stage mechanical impact: a heavy body thud (like a quality camera back
// seating) followed 120ms later by a sharp metallic click (the latch point).
// No tones, no arpeggios, no music.  The sound is read as "locked in" —
// the analysis result is now confirmed and ready.
//
// Character reference: Leica rangefinder film advance stop.  Medium format
// Hasselblad back locking. Not celebratory — authoritative.
// ─────────────────────────────────────────────────────────────────────────────
export function resultRevealSound() {
  try {
    if (!isSoundEnabled()) return;
    const ac = getCtx();
    const now = ac.currentTime;

    // Master bus — moderate level, fast transient response
    const master = ac.createGain();
    master.gain.setValueAtTime(0.75, now);
    master.connect(ac.destination);

    // ── Stage 1: body impact (0ms) ────────────────────────────────────
    // Low-mid bandpass noise with fast exponential decay — the physical
    // mass of a mechanism seating.  600–900 Hz sits in the phone-speaker
    // passband so it lands on mobile.
    const impLen = Math.floor(ac.sampleRate * 0.12);
    const impBuf = ac.createBuffer(1, impLen, ac.sampleRate);
    const impD = impBuf.getChannelData(0);
    for (let i = 0; i < impLen; i++) {
      impD[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * 0.018));
    }
    const imp = ac.createBufferSource();
    const impBp = ac.createBiquadFilter();
    impBp.type = 'bandpass';
    impBp.frequency.value = 720;
    impBp.Q.value = 0.8;
    const impG = ac.createGain();
    impG.gain.setValueAtTime(1.0, now);
    impG.gain.exponentialRampToValueAtTime(0.001, now + 0.10);
    imp.buffer = impBuf;
    imp.connect(impBp).connect(impG).connect(master);
    imp.start(now);

    // Low sub-body — adds felt weight on desktop/headphones without
    // muddying the mobile mix (phones can't reproduce it anyway)
    const subOsc = ac.createOscillator();
    const subG = ac.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(160, now);
    subOsc.frequency.exponentialRampToValueAtTime(90, now + 0.08);
    subG.gain.setValueAtTime(0.55, now);
    subG.gain.exponentialRampToValueAtTime(0.001, now + 0.10);
    subOsc.connect(subG).connect(master);
    subOsc.start(now);
    subOsc.stop(now + 0.12);

    // ── Stage 2: latch click (120ms) ─────────────────────────────────
    // Narrow bandpass impulse at 2800 Hz — the metallic contact point of
    // the latch.  Very short (25ms) so it reads as a precise click, not
    // a rattle.  The 120ms offset puts it clearly after the body impact
    // so the two events are perceptually distinct.
    const clickLen = Math.floor(ac.sampleRate * 0.04);
    const clickBuf = ac.createBuffer(1, clickLen, ac.sampleRate);
    const clickD = clickBuf.getChannelData(0);
    for (let i = 0; i < clickLen; i++) {
      clickD[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * 0.004));
    }
    const click = ac.createBufferSource();
    const clickBp = ac.createBiquadFilter();
    clickBp.type = 'bandpass';
    clickBp.frequency.value = 2800;
    clickBp.Q.value = 3.5;
    const clickG = ac.createGain();
    clickG.gain.setValueAtTime(0.85, now + 0.12);
    clickG.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
    click.buffer = clickBuf;
    click.connect(clickBp).connect(clickG).connect(master);
    click.start(now + 0.12);

    // Micro tail — very brief high-frequency ring confirming the latch
    // point. 5500 Hz, 30ms, barely perceptible — adds the sense of
    // precision without becoming a "ding".
    const tailOsc = ac.createOscillator();
    const tailG = ac.createGain();
    tailOsc.type = 'sine';
    tailOsc.frequency.value = 5500;
    tailG.gain.setValueAtTime(0.055, now + 0.12);
    tailG.gain.exponentialRampToValueAtTime(0.001, now + 0.17);
    tailOsc.connect(tailG).connect(master);
    tailOsc.start(now + 0.12);
    tailOsc.stop(now + 0.20);
  } catch { /* silent */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Panel toggle — rotary detent click.
// Tight bandpassed impulse with micro-resonance, like a precision dial notch.
// ─────────────────────────────────────────────────────────────────────────────
export function panelToggleSound() {
  try {
    if (!isSoundEnabled()) return;
    const ac = getCtx();
    const now = ac.currentTime;

    const master = ac.createGain();
    master.gain.setValueAtTime(0.45, now);
    master.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    master.connect(ac.destination);

    // Detent impulse — narrow bandpass for that mechanical "tick"
    const src = ac.createBufferSource();
    const bp = ac.createBiquadFilter();
    const impGain = ac.createGain();
    bp.type = 'bandpass';
    bp.frequency.value = 3200;
    bp.Q.value = 3.5;
    impGain.gain.setValueAtTime(0.85, now);
    impGain.gain.exponentialRampToValueAtTime(0.001, now + 0.01);
    src.buffer = noiseBuffer(ac);
    src.connect(bp).connect(impGain).connect(master);
    src.start(now);

    // Micro-body thud — lowpassed noise, no tonal ring
    const thudLen = Math.floor(ac.sampleRate * 0.025);
    const thudBuf = ac.createBuffer(1, thudLen, ac.sampleRate);
    const thudD = thudBuf.getChannelData(0);
    for (let i = 0; i < thudLen; i++) thudD[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * 0.007));
    const thudSrc = ac.createBufferSource();
    const thudLp = ac.createBiquadFilter();
    thudLp.type = 'lowpass';
    thudLp.frequency.value = 400;
    const thudG = ac.createGain();
    thudG.gain.setValueAtTime(0.35, now + 0.003);
    thudSrc.buffer = thudBuf;
    thudSrc.connect(thudLp).connect(thudG).connect(master);
    thudSrc.start(now + 0.003);
  } catch { /* silent */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Nav slide — pneumatic air displacement.
// Filtered noise sweep, ~60ms, like air moving through precision channels.
// ─────────────────────────────────────────────────────────────────────────────
export function navSlideSound() {
  try {
    if (!isSoundEnabled()) return;
    const ac = getCtx();
    const now = ac.currentTime;

    const master = ac.createGain();
    // Start at 0 — avoids onset crack from noise source jumping to amplitude instantly
    master.gain.setValueAtTime(0.0, now);
    master.gain.linearRampToValueAtTime(0.3, now + 0.005);
    master.gain.linearRampToValueAtTime(0.2, now + 0.03);
    master.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    master.connect(ac.destination);

    // Dedicated 120ms buffer — longer than the 100ms envelope so the buffer
    // never ends while gain is non-zero (avoids end-of-buffer crack)
    const len = Math.floor(ac.sampleRate * 0.12);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    const src = ac.createBufferSource();
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1800, now);
    bp.frequency.exponentialRampToValueAtTime(800, now + 0.06);
    bp.Q.value = 0.8;
    src.buffer = buf;
    src.connect(bp).connect(master);
    src.start(now);
  } catch { /* silent */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Processing pulse — precision scan character.
//
// Sparse periodic clicks, like a high-end camera body processing a file or
// a film scanner stepping through frames.  No music, no chord, no drone.
// Two layers:
//   1. A near-silent steady-state texture: very narrow bandpass noise at ~95 Hz,
//      just enough to sense that equipment is running — subliminal presence.
//   2. A scan click every 1.8s: brief bandpassed noise burst at ~1800 Hz with
//      a fast attack and exponential decay (~70ms total).  Pitch drifts up
//      subtly over the first several clicks (1800 → 2400 Hz) so the sound
//      conveys "progressing" without any musical content.
//
// Total master level is quiet (0.055 texture, 0.13 per click).  The idea is
// that you hear it more than you notice it — it confirms work is happening
// without demanding attention.
// ─────────────────────────────────────────────────────────────────────────────
export function processingPulseSound() {
  try {
    if (!isSoundEnabled()) return () => {};
    const ac = getCtx();
    const now = ac.currentTime;
    let stopped = false;

    // ── Steady-state texture — barely-audible low hum ────────────────────
    // Very narrow bandpass around 95 Hz.  On phone speakers this is at or
    // below the speaker floor, so it adds nothing on mobile and a subliminal
    // "system on" presence on desktop/headphones.
    const texLen = Math.floor(ac.sampleRate * 0.6);
    const texBuf = ac.createBuffer(1, texLen, ac.sampleRate);
    const texD = texBuf.getChannelData(0);
    for (let i = 0; i < texLen; i++) texD[i] = Math.random() * 2 - 1;

    const texBp = ac.createBiquadFilter();
    texBp.type = 'bandpass';
    texBp.frequency.value = 95;
    texBp.Q.value = 3.5;

    const texGain = ac.createGain();
    texGain.gain.setValueAtTime(0, now);
    texGain.gain.linearRampToValueAtTime(0.055, now + 1.6);

    const texSrc = ac.createBufferSource();
    texSrc.buffer = texBuf;
    texSrc.loop = true;
    texSrc.connect(texBp).connect(texGain).connect(ac.destination);
    texSrc.start(now);

    // ── Scan click — sparse periodic impulse ─────────────────────────────
    // Noise burst shaped by a very fast exponential decay so it reads as a
    // precise mechanical contact, not a swoosh.  Bandpass centered at
    // baseFreq — sits solidly in the phone speaker passband (1–4 kHz).
    // Pitch drifts from 1800 → 2400 Hz over ~10 clicks to convey progress.
    let clickCount = 0;
    let _interval = null;

    const fireClick = () => {
      if (stopped) return;
      const t = ac.currentTime;
      clickCount++;

      const baseFreq = Math.min(1800 + clickCount * 55, 2400);

      // Main click — bandpassed decaying noise
      const pLen = Math.floor(ac.sampleRate * 0.09);
      const pBuf = ac.createBuffer(1, pLen, ac.sampleRate);
      const pD = pBuf.getChannelData(0);
      for (let i = 0; i < pLen; i++) {
        pD[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * 0.011));
      }
      const pSrc = ac.createBufferSource();
      const pBp = ac.createBiquadFilter();
      const pGain = ac.createGain();
      pBp.type = 'bandpass';
      pBp.frequency.value = baseFreq;
      pBp.Q.value = 2.8;
      pGain.gain.setValueAtTime(0.13, t);
      pGain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
      pSrc.buffer = pBuf;
      pSrc.connect(pBp).connect(pGain).connect(ac.destination);
      pSrc.start(t);

      // Micro tail — second bandpass at half frequency, lower gain.
      // Gives the click a tiny "body" without making it musical.
      const tailSrc = ac.createBufferSource();
      const tailBp = ac.createBiquadFilter();
      const tailGain = ac.createGain();
      tailBp.type = 'bandpass';
      tailBp.frequency.value = baseFreq * 0.48;
      tailBp.Q.value = 1.8;
      tailGain.gain.setValueAtTime(0.045, t + 0.003);
      tailGain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      tailSrc.buffer = pBuf;
      tailSrc.connect(tailBp).connect(tailGain).connect(ac.destination);
      tailSrc.start(t);
    };

    // First click after a brief pause, then every 1.8s
    const _firstTimeout = setTimeout(fireClick, 500);
    _interval = setInterval(fireClick, 1800);

    return function stop() {
      stopped = true;
      clearTimeout(_firstTimeout);
      clearInterval(_interval);
      const t = ac.currentTime;
      texGain.gain.cancelScheduledValues(t);
      texGain.gain.setValueAtTime(texGain.gain.value, t);
      texGain.gain.linearRampToValueAtTime(0, t + 0.35);
      try { texSrc.stop(t + 0.4); } catch {}
    };
  } catch {
    return () => {};
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Segment press — tactile detent for segmented pill controls.
// Slightly deeper than panelToggle, with a hint of mechanical body.
// ─────────────────────────────────────────────────────────────────────────────
export function segmentPressSound() {
  try {
    if (!isSoundEnabled()) return;
    const ac = getCtx();
    const now = ac.currentTime;

    const master = ac.createGain();
    master.gain.setValueAtTime(0.4, now);
    master.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    master.connect(ac.destination);

    // Contact thud
    const src = ac.createBufferSource();
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    lp.Q.value = 1.2;
    const impGain = ac.createGain();
    impGain.gain.setValueAtTime(0.7, now);
    impGain.gain.exponentialRampToValueAtTime(0.001, now + 0.012);
    src.buffer = noiseBuffer(ac);
    src.connect(lp).connect(impGain).connect(master);
    src.start(now);

    // Body — very brief low resonance
    const body = ac.createOscillator();
    const bodyGain = ac.createGain();
    body.type = 'sine';
    body.frequency.setValueAtTime(280, now);
    body.frequency.exponentialRampToValueAtTime(200, now + 0.04);
    bodyGain.gain.setValueAtTime(0.4, now + 0.003);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    body.connect(bodyGain).connect(master);
    body.start(now + 0.003);
    body.stop(now + 0.05);
  } catch { /* silent */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Power on — equipment boot sequence.
// Low-frequency sweep rising into a faint ready ping.
// Like a capacitor bank charging then a relay clicking into place.
// ─────────────────────────────────────────────────────────────────────────────
export function powerOnSound() {
  try {
    if (!isSoundEnabled()) return;
    const ac = getCtx();
    const now = ac.currentTime;

    const master = ac.createGain();
    master.gain.setValueAtTime(0.3, now);
    master.gain.linearRampToValueAtTime(0.45, now + 0.3);
    master.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
    master.connect(ac.destination);

    // Capacitor charge — low sine sweeping up
    const charge = ac.createOscillator();
    const chargeGain = ac.createGain();
    charge.type = 'sine';
    charge.frequency.setValueAtTime(40, now);
    charge.frequency.exponentialRampToValueAtTime(120, now + 0.35);
    charge.frequency.exponentialRampToValueAtTime(80, now + 0.5);
    chargeGain.gain.setValueAtTime(0.6, now);
    chargeGain.gain.linearRampToValueAtTime(0.45, now + 0.25);
    chargeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    charge.connect(chargeGain).connect(master);
    charge.start(now);
    charge.stop(now + 0.55);

    // Relay click — bandpassed noise at the end of charge
    const relaySrc = ac.createBufferSource();
    const relayBp = ac.createBiquadFilter();
    const relayGain = ac.createGain();
    relayBp.type = 'bandpass';
    relayBp.frequency.value = 2800;
    relayBp.Q.value = 2.0;
    relayGain.gain.setValueAtTime(0, now);
    relayGain.gain.setValueAtTime(0.5, now + 0.32);
    relayGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    relaySrc.buffer = noiseBuffer(ac);
    relaySrc.connect(relayBp).connect(relayGain).connect(master);
    relaySrc.start(now + 0.32);

    // Ready click — bandpassed noise snap confirming boot, no tonal ring
    const snapLen = Math.floor(ac.sampleRate * 0.02);
    const snapBuf = ac.createBuffer(1, snapLen, ac.sampleRate);
    const snapD = snapBuf.getChannelData(0);
    for (let i = 0; i < snapLen; i++) snapD[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * 0.004));
    const snapSrc = ac.createBufferSource();
    const snapBp = ac.createBiquadFilter();
    snapBp.type = 'bandpass';
    snapBp.frequency.value = 2600;
    snapBp.Q.value = 1.8;
    const snapG = ac.createGain();
    snapG.gain.setValueAtTime(0, now);
    snapG.gain.setValueAtTime(0.45, now + 0.35);
    snapSrc.buffer = snapBuf;
    snapSrc.connect(snapBp).connect(snapG).connect(master);
    snapSrc.start(now + 0.35);
  } catch { /* silent */ }
}
