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

// ─── Pulse seed loader ───────────────────────────────────────────────────────
// User-recorded tone (ui/public/sounds/pulse-seed.m4a) used as the fundamental
// color of processingPulseSound.  Cached after first decode so we only fetch
// + decode once per session.  The decode is async, so callers may receive
// either the resolved buffer or a promise — processingPulseSound handles both.
let _pulseSeedBuffer = null;
let _pulseSeedPromise = null;
function loadPulseSeed() {
  if (_pulseSeedBuffer) return Promise.resolve(_pulseSeedBuffer);
  if (_pulseSeedPromise) return _pulseSeedPromise;
  const base = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.BASE_URL) || '/static/ui/';
  const url = `${base}sounds/pulse-seed.m4a`;
  _pulseSeedPromise = fetch(url)
    .then(r => {
      if (!r.ok) throw new Error(`pulse-seed ${r.status}`);
      return r.arrayBuffer();
    })
    .then(ab => getCtx().decodeAudioData(ab))
    .then(buf => { _pulseSeedBuffer = buf; return buf; })
    .catch(err => {
      console.warn('[sounds] pulse seed load failed:', err);
      _pulseSeedPromise = null;   // allow retry next call
      return null;
    });
  return _pulseSeedPromise;
}
// Kick off the load eagerly at module evaluation so the buffer is usually
// ready by the time the user navigates to ProcessingScreen.
if (typeof window !== 'undefined') {
  // Defer to next tick so we don't block module init or compete with first
  // paint — but still warm before any pulse plays.
  setTimeout(() => { loadPulseSeed(); }, 0);
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
// Result reveal — two mechanical impacts, like a precision latch engaging.
// No tones. Two filtered noise impulses with a brief low-body resonance.
// ─────────────────────────────────────────────────────────────────────────────
export function resultRevealSound() {
  try {
    if (!isSoundEnabled()) return;
    const ac = getCtx();
    const now = ac.currentTime;

    // ── Master + bus compressor ────────────────────────────────────────
    // Glue compressor pumps perceived loudness on phone speakers (which
    // can't reproduce dynamics in the same way as larger drivers).  The
    // master rides hot — phones roll off below ~200 Hz, so we accept
    // potential clipping headroom in exchange for being clearly audible.
    const master = ac.createGain();
    master.gain.setValueAtTime(0.95, now);
    master.gain.linearRampToValueAtTime(0.95, now + 1.0);
    master.gain.exponentialRampToValueAtTime(0.001, now + 1.8);

    const comp = ac.createDynamicsCompressor();
    comp.threshold.setValueAtTime(-14, now);
    comp.knee.setValueAtTime(6, now);
    comp.ratio.setValueAtTime(5, now);
    comp.attack.setValueAtTime(0.003, now);
    comp.release.setValueAtTime(0.15, now);

    // Presence shelf — phones project best in 1–4 kHz, so push that band
    // to make the sound carry through small drivers.
    const presence = ac.createBiquadFilter();
    presence.type = 'peaking';
    presence.frequency.value = 2400;
    presence.Q.value = 0.9;
    presence.gain.value = 4.0;

    master.connect(comp).connect(presence).connect(ac.destination);

    // ── Punch transient — heavy lowpass thud ──────────────────────────
    const punchLen = Math.floor(ac.sampleRate * 0.05);
    const punchBuf = ac.createBuffer(1, punchLen, ac.sampleRate);
    const punchD = punchBuf.getChannelData(0);
    for (let i = 0; i < punchLen; i++) punchD[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * 0.010));
    const punch = ac.createBufferSource();
    const punchLp = ac.createBiquadFilter();
    punchLp.type = 'lowpass';
    punchLp.frequency.value = 800;
    punchLp.Q.value = 0.7;
    const punchG = ac.createGain();
    punchG.gain.setValueAtTime(1.0, now);
    punch.buffer = punchBuf;
    punch.connect(punchLp).connect(punchG).connect(master);
    punch.start(now);

    // ── Ascending arpeggio — A4 → C#5 → E5 — staccato sine pings ─────
    // Each note is a short, punchy sine with a quick attack and short
    // release.  Sine waves so there's no metallic harmonic content (no
    // bell character), but the rapid pitch climb + tight envelope reads
    // unmistakably as "DONE".  Sits in the 440–660 Hz range — solidly
    // within the phone-speaker passband.
    const playPing = (freq, startOffset, peak, duration = 0.18) => {
      const t0 = now + startOffset;
      const osc = ac.createOscillator();
      const g   = ac.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(peak, t0 + 0.008);   // fast pluck
      g.gain.setValueAtTime(peak, t0 + 0.04);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
      osc.connect(g).connect(master);
      osc.start(t0);
      osc.stop(t0 + duration + 0.05);
    };

    playPing(440.00, 0.04, 0.55);  // A4
    playPing(554.37, 0.13, 0.55);  // C#5
    playPing(659.25, 0.22, 0.55);  // E5

    // ── Sustained A major triad chord — held under the arpeggio ───────
    // Hits at the same moment as the third arpeggio note, holds for
    // ~1.0 s.  Mild detuning between voices creates a slight chorus
    // thickness so it sounds like a chord, not three identical sines.
    // The chord is the resolution that the arpeggio "lands" on.
    const chordStart = now + 0.22;
    const playChordVoice = (freq, peak, detune = 0) => {
      const osc = ac.createOscillator();
      const g   = ac.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.detune.value = detune;
      g.gain.setValueAtTime(0, chordStart);
      g.gain.linearRampToValueAtTime(peak, chordStart + 0.020);
      g.gain.setValueAtTime(peak, chordStart + 0.30);
      g.gain.exponentialRampToValueAtTime(0.001, chordStart + 1.30);
      osc.connect(g).connect(master);
      osc.start(chordStart);
      osc.stop(chordStart + 1.40);
    };

    playChordVoice(440.00, 0.50, -3);  // A4 root
    playChordVoice(554.37, 0.38, +2);  // C#5 third
    playChordVoice(659.25, 0.32, -2);  // E5 fifth
    playChordVoice(880.00, 0.22, +3);  // A5 octave glow

    // ── Sub-body thud — long lowpass tail underneath ──────────────────
    const bodyLen = Math.floor(ac.sampleRate * 0.18);
    const bodyBuf = ac.createBuffer(1, bodyLen, ac.sampleRate);
    const bodyD = bodyBuf.getChannelData(0);
    for (let i = 0; i < bodyLen; i++) bodyD[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * 0.030));
    const body = ac.createBufferSource();
    const bodyLp = ac.createBiquadFilter();
    bodyLp.type = 'lowpass';
    bodyLp.frequency.value = 220;
    const bodyG = ac.createGain();
    bodyG.gain.setValueAtTime(0.8, now);
    body.buffer = bodyBuf;
    body.connect(bodyLp).connect(bodyG).connect(master);
    body.start(now);
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
// Processing pulse — User's recorded tone (looped) as the fundamental color,
// layered with synth sub voices for chest pressure on phone speakers, fed
// through chest-shelf / throat formant / breathing bandpass / tube-warmth
// chain.  Slow LFO breathes the whole drone in and out.
//
// First call before the seed buffer decodes falls back to the all-synth
// version so there's never silence.  The buffer is warm-loaded at module
// init so this fallback path almost never fires in practice.
// ─────────────────────────────────────────────────────────────────────────────
export function processingPulseSound() {
  try {
    if (!isSoundEnabled()) return () => {};
    const ac = getCtx();
    const now = ac.currentTime;
    const haveSeed = !!_pulseSeedBuffer;
    if (!haveSeed) loadPulseSeed();   // kick off load if not yet started

    // ── Master chain — open, warm, MUSICAL pulse (polish pass) ───────────
    // Lifted sustain so the trough is no longer a creepy whisper, but
    // headroom is reserved for the LFO swell.  Longer attack = polish.
    const master = ac.createGain();
    master.gain.setValueAtTime(0, now);
    master.gain.linearRampToValueAtTime(0.22, now + 1.8); // gentler fade-in

    // Subtle low-shelf — JUST enough body to anchor the seed tone on a phone
    // speaker.  Pulled back from +3 dB → +1.5 dB so the bottom doesn't sound
    // ominous on big speakers / headphones.
    const chestShelf = ac.createBiquadFilter();
    chestShelf.type = 'lowshelf';
    chestShelf.frequency.value = 200;
    chestShelf.gain.value = 1.5;

    // High-shelf air — opens the top end so the tone reads as "warm and
    // calm" rather than "muffled and lurking".  +2 dB above 3.5 kHz.
    const airShelf = ac.createBiquadFilter();
    airShelf.type = 'highshelf';
    airShelf.frequency.value = 3500;
    airShelf.gain.value = 2.0;

    // Gentle presence peak around 1.4 kHz — adds clarity without the
    // formant-y "vocal" character of the old bandpass.  Low-Q peaking
    // filter = clean lift, no resonant ring.
    const presence = ac.createBiquadFilter();
    presence.type = 'peaking';
    presence.frequency.value = 1400;
    presence.Q.value = 0.8;
    presence.gain.value = 1.5;

    // Veil opened all the way to 6 kHz — barely a filter, just rolls off
    // the harshest top.  Cleaner / less muffled than 5 kHz.
    const veil = ac.createBiquadFilter();
    veil.type = 'lowpass';
    veil.frequency.value = 6000;
    veil.Q.value = 0.5;

    // Softer limiter — gentler ratio + softer knee = polish, no audible
    // pumping when the LFO swells.
    const limiter = ac.createDynamicsCompressor();
    limiter.threshold.setValueAtTime(-6, now);
    limiter.knee.setValueAtTime(8, now);
    limiter.ratio.setValueAtTime(5, now);
    limiter.attack.setValueAtTime(0.012, now);
    limiter.release.setValueAtTime(0.30, now);

    // Stage chain (polish):
    //   voices → master → chestShelf → presence → airShelf → veil → limiter → speakers
    // No more bandpass (was the formant that made it sound "vocal").
    master
      .connect(chestShelf)
      .connect(presence)
      .connect(airShelf)
      .connect(veil)
      .connect(limiter)
      .connect(ac.destination);

    // ── Voice 0 — USER'S RECORDED TONE, seamlessly looped ──────────────
    // Two phased BufferSources with constant-sum crossfade.  Each source
    // loops the same region, but srcB is offset by half the loop length.
    // A cosine LFO drives gA and gB so that whenever one source crosses
    // its loop seam, the other is at full volume — the seam is completely
    // masked.  gA + gB sums to a constant 0.70 at every instant, so the
    // perceived seed level is steady.
    //
    // Reference: standard double-buffered seamless looping technique used
    // in game audio engines to hide loop points in arbitrary recordings.
    let seedSrcA = null, seedSrcB = null;
    let seedGainA = null, seedGainB = null;
    let seedXfade = null;
    if (haveSeed) {
      const dur = _pulseSeedBuffer.duration;
      const loopStart = dur * 0.20;     // skip more head/tail to land on cleaner sustain
      const loopEnd   = dur * 0.80;
      const loopLen   = loopEnd - loopStart;
      const halfLoop  = loopLen / 2;
      const SEED_PEAK = 0.70;
      const HALF_PEAK = SEED_PEAK / 2;  // 0.35 — midpoint of crossfade range

      // Layer A — playhead at the loop start, seam happens at multiples of loopLen.
      seedSrcA = ac.createBufferSource();
      seedSrcA.buffer = _pulseSeedBuffer;
      seedSrcA.loop = true;
      seedSrcA.loopStart = loopStart;
      seedSrcA.loopEnd   = loopEnd;
      seedGainA = ac.createGain();
      seedGainA.gain.setValueAtTime(0, now);
      // Fade-in to midpoint over 2.4s — fade-in is layered over the
      // crossfade modulation so the seam masking is always active.
      seedGainA.gain.linearRampToValueAtTime(HALF_PEAK, now + 2.4);
      seedSrcA.connect(seedGainA).connect(master);
      seedSrcA.start(now, loopStart);

      // Layer B — playhead offset half a loop, seam happens between A's seams.
      seedSrcB = ac.createBufferSource();
      seedSrcB.buffer = _pulseSeedBuffer;
      seedSrcB.loop = true;
      seedSrcB.loopStart = loopStart;
      seedSrcB.loopEnd   = loopEnd;
      seedGainB = ac.createGain();
      seedGainB.gain.setValueAtTime(0, now);
      seedGainB.gain.linearRampToValueAtTime(HALF_PEAK, now + 2.4);
      seedSrcB.connect(seedGainB).connect(master);
      seedSrcB.start(now, loopStart + halfLoop);

      // Cosine crossfade LFO at 1/loopLen Hz — drives both layers with
      // opposite signs so they sum to a constant.  Web Audio doesn't
      // expose a cosine oscillator natively, so we build one with
      // PeriodicWave (DC=0, first cosine harmonic=1, no sine terms).
      const cosReal = new Float32Array([0, 1]);
      const cosImag = new Float32Array([0, 0]);
      const cosWave = ac.createPeriodicWave(cosReal, cosImag, { disableNormalization: true });

      seedXfade = ac.createOscillator();
      seedXfade.setPeriodicWave(cosWave);
      seedXfade.frequency.value = 1 / loopLen;

      // Layer A modulation — −cos.  At t=0 (seam): gA = 0.35 − 0.35 = 0.
      // At t=halfLoop: gA = 0.35 + 0.35 = 0.70.  At t=loopLen (seam again): 0.
      const xfadeAGain = ac.createGain();
      xfadeAGain.gain.value = -HALF_PEAK;
      seedXfade.connect(xfadeAGain).connect(seedGainA.gain);

      // Layer B modulation — +cos.  Inverted relative to A so the seams
      // never align.  Sum gA + gB stays constant at SEED_PEAK.
      const xfadeBGain = ac.createGain();
      xfadeBGain.gain.value = +HALF_PEAK;
      seedXfade.connect(xfadeBGain).connect(seedGainB.gain);

      seedXfade.start(now);
    }

    // ── Synth pad — A major triad: A3 / C#4 / E4 / A4 ──────────────────
    // Lifted everything by an octave from the old voicing.  Major thirds
    // (the old chord was bare fifths — open and hollow, which can read as
    // ominous).  Major triad = warm, hopeful, calm.
    //
    // Voice A1 — A3 (220 Hz), the root.  Was 110 Hz before — too low and
    // murky for "calm and friendly".
    const sub = ac.createOscillator();
    const subGain = ac.createGain();
    sub.type = 'sine';
    sub.frequency.value = 220;
    subGain.gain.setValueAtTime(0, now);
    subGain.gain.linearRampToValueAtTime(0.10, now + 2.0);
    sub.connect(subGain).connect(master);
    sub.start(now);

    // Voice A2 — C#4 (277.18 Hz), the major third.  Adds the "happy"
    // colour the old bare-fifth voicing was missing.
    const sub2 = ac.createOscillator();
    const sub2Gain = ac.createGain();
    sub2.type = 'sine';
    sub2.frequency.value = 277.18;
    sub2Gain.gain.setValueAtTime(0, now);
    sub2Gain.gain.linearRampToValueAtTime(0.07, now + 2.2);
    sub2.connect(sub2Gain).connect(master);
    sub2.start(now);

    // Voice A3 — E4 (329.63 Hz), the perfect fifth.  Anchors the chord.
    const sub3 = ac.createOscillator();
    const sub3Gain = ac.createGain();
    sub3.type = 'sine';
    sub3.frequency.value = 329.63;
    sub3Gain.gain.setValueAtTime(0, now);
    sub3Gain.gain.linearRampToValueAtTime(0.06, now + 2.4);
    sub3.connect(sub3Gain).connect(master);
    sub3.start(now);

    // Voice A4 — A4 (440 Hz), octave shimmer.  Quiet glow on top of the
    // chord — only audible at peaks.  Adds the "lit" quality.
    const sparkle = ac.createOscillator();
    const sparkleGain = ac.createGain();
    sparkle.type = 'sine';
    sparkle.frequency.value = 440;
    sparkleGain.gain.setValueAtTime(0, now);
    sparkleGain.gain.linearRampToValueAtTime(0.035, now + 2.8);
    sparkle.connect(sparkleGain).connect(master);
    sparkle.start(now);


    // ─── FALLBACK BODY VOICES — only spun up when the seed buffer hasn't
    // decoded yet on the first call.  Once the seed is loaded these are
    // silent and the user's tone fully replaces them. ──────────────────
    let drone, droneGain, droneB, droneBGain, droneC, droneCGain;
    let fifthLow, fifthLowGain, oct, octGain, fifth, fifthGain;
    let vibrato, vibratoGain, vibrato2, vibrato2Gain;
    if (!haveSeed) {
      drone = ac.createOscillator();
      droneGain = ac.createGain();
      drone.type = 'triangle';
      drone.frequency.value = 55;
      droneGain.gain.setValueAtTime(0, now);
      droneGain.gain.linearRampToValueAtTime(0.42, now + 2.0);
      drone.connect(droneGain).connect(master);
      drone.start(now);

      droneB = ac.createOscillator();
      droneBGain = ac.createGain();
      droneB.type = 'sine';
      droneB.frequency.value = 55;
      droneB.detune.value = +4;
      droneBGain.gain.setValueAtTime(0, now);
      droneBGain.gain.linearRampToValueAtTime(0.28, now + 2.1);
      droneB.connect(droneBGain).connect(master);
      droneB.start(now);

      droneC = ac.createOscillator();
      droneCGain = ac.createGain();
      droneC.type = 'sine';
      droneC.frequency.value = 55;
      droneC.detune.value = -4;
      droneCGain.gain.setValueAtTime(0, now);
      droneCGain.gain.linearRampToValueAtTime(0.24, now + 2.2);
      droneC.connect(droneCGain).connect(master);
      droneC.start(now);

      fifthLow = ac.createOscillator();
      fifthLowGain = ac.createGain();
      fifthLow.type = 'sine';
      fifthLow.frequency.value = 82.4;
      fifthLowGain.gain.setValueAtTime(0, now);
      fifthLowGain.gain.linearRampToValueAtTime(0.20, now + 2.3);
      fifthLow.connect(fifthLowGain).connect(master);
      fifthLow.start(now);

      oct = ac.createOscillator();
      octGain = ac.createGain();
      oct.type = 'sine';
      oct.frequency.value = 110;
      oct.detune.value = -3;
      octGain.gain.setValueAtTime(0, now);
      octGain.gain.linearRampToValueAtTime(0.16, now + 2.4);
      oct.connect(octGain).connect(master);
      oct.start(now);

      fifth = ac.createOscillator();
      fifthGain = ac.createGain();
      fifth.type = 'sine';
      fifth.frequency.value = 165;
      fifthGain.gain.setValueAtTime(0, now);
      fifthGain.gain.linearRampToValueAtTime(0.06, now + 2.6);
      fifth.connect(fifthGain).connect(master);
      fifth.start(now);

      vibrato = ac.createOscillator();
      vibratoGain = ac.createGain();
      vibrato.type = 'sine';
      vibrato.frequency.value = 2.8;
      vibratoGain.gain.value = 4;
      vibrato.connect(vibratoGain).connect(droneB.detune);
      vibrato.start(now);

      vibrato2 = ac.createOscillator();
      vibrato2Gain = ac.createGain();
      vibrato2.type = 'sine';
      vibrato2.frequency.value = 2.4;
      vibrato2Gain.gain.value = 3;
      vibrato2.connect(vibrato2Gain).connect(droneC.detune);
      vibrato2.start(now);
    }

    // ── PULSE LFO — synced to the LED's 4-second breath cycle (0.25 Hz).
    // Depth pulled back from 0.32 → 0.18 so the pulses still read clearly
    // but no longer feel like something's breathing in the dark.  Master
    // sits at 0.22 sustain, swells to ~0.40 at peak, drops to ~0.04 at
    // trough — clearly audible rhythm without being predatory. ─────────
    const lfo = ac.createOscillator();
    const lfoGain = ac.createGain();
    lfo.type = 'sine';
    lfo.frequency.value = 1 / 4;
    lfoGain.gain.value = 0.18;          // gentler depth — calm pulse
    lfo.connect(lfoGain).connect(master.gain);
    lfo.start(now);

    // Same LFO opens the air shelf on each pulse — peaks lift +1 dB
    // brighter, troughs sit -1 dB darker.  Adds "lit" quality at peak
    // without modulating any vocal-formant frequencies.
    const airLfoGain = ac.createGain();
    airLfoGain.gain.value = 1.0;
    lfo.connect(airLfoGain).connect(airShelf.gain);

    // Same LFO modulates the presence peak gain ±0.8 dB — clarity
    // breathes with the pulse so it feels musical, not mechanical.
    const presenceLfoGain = ac.createGain();
    presenceLfoGain.gain.value = 0.8;
    lfo.connect(presenceLfoGain).connect(presence.gain);

    // Polish — no filter sweeps in vocal-formant range.  No throat
    // formant.  No tube warmth.  Just a clean, breathing major chord.

    return function stop() {
      const t = ac.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0, t + 0.8); // gentler release for polish
      try { if (seedSrcA) seedSrcA.stop(t + 0.9); } catch {}
      try { if (seedSrcB) seedSrcB.stop(t + 0.9); } catch {}
      try { if (seedXfade) seedXfade.stop(t + 0.9); } catch {}
      sub.stop(t + 0.9);
      sub2.stop(t + 0.9);
      sub3.stop(t + 0.9);
      sparkle.stop(t + 0.9);
      if (drone) {
        drone.stop(t + 0.9);
        droneB.stop(t + 0.9);
        droneC.stop(t + 0.9);
        fifthLow.stop(t + 0.9);
        oct.stop(t + 0.9);
        fifth.stop(t + 0.9);
        vibrato.stop(t + 0.9);
        vibrato2.stop(t + 0.9);
      }
      lfo.stop(t + 0.9);
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
