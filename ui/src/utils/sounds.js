/**
 * sounds.js — Synthesized UI sounds via Web Audio API
 *
 * No external audio files — all sounds are procedurally generated.
 * Aesthetic: precision lab equipment, luxury camera mechanisms.
 * Every sound is muted, warm, mechanical — never shrill or celebratory.
 */

let ctx = null;

/** Check if sounds are enabled via settings */
function isSoundEnabled() {
  try {
    const raw = localStorage.getItem('ngw_settings');
    if (!raw) return true;
    const s = JSON.parse(raw);
    return s.soundEnabled !== false;
  } catch { return true; }
}

function getCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  // Resume if suspended (autoplay policy)
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
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
// Analyze button — warm resonant confirmation.
// Two-note micro-chord + harmonic shimmer + filtered noise transient.
// Like a luxury camera shutter + focus-lock chime.
// ─────────────────────────────────────────────────────────────────────────────
export function analyzeClickSound() {
  try {
    if (!isSoundEnabled()) return;
    const ac = getCtx();
    const now = ac.currentTime;

    const master = ac.createGain();
    master.gain.setValueAtTime(0.9, now);
    master.gain.linearRampToValueAtTime(0.75, now + 0.08);
    master.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    master.connect(ac.destination);

    // Fundamental: G5 (784 Hz) — focus lock
    const fund = ac.createOscillator();
    const fundGain = ac.createGain();
    fund.type = 'sine';
    fund.frequency.setValueAtTime(784, now);
    fund.frequency.linearRampToValueAtTime(788, now + 0.3);
    fundGain.gain.setValueAtTime(0.85, now);
    fundGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    fund.connect(fundGain).connect(master);
    fund.start(now);
    fund.stop(now + 0.45);

    // Fifth above: D6 (1175 Hz) — harmonic sweetener
    const fifth = ac.createOscillator();
    const fifthGain = ac.createGain();
    fifth.type = 'sine';
    fifth.frequency.setValueAtTime(1175, now + 0.015);
    fifthGain.gain.setValueAtTime(0, now);
    fifthGain.gain.linearRampToValueAtTime(0.6, now + 0.02);
    fifthGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    fifth.connect(fifthGain).connect(master);
    fifth.start(now + 0.015);
    fifth.stop(now + 0.4);

    // Sub-octave body: G4 (392 Hz) — warmth
    const sub = ac.createOscillator();
    const subGain = ac.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(392, now);
    subGain.gain.setValueAtTime(0.5, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    sub.connect(subGain).connect(master);
    sub.start(now);
    sub.stop(now + 0.3);

    // Soft attack transient — filtered noise click
    const bufferSize = Math.floor(ac.sampleRate * 0.015);
    const noiseBuf = ac.createBuffer(1, bufferSize, ac.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
    const noise = ac.createBufferSource();
    const noiseGain = ac.createGain();
    const noiseFilter = ac.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = 6000;
    noiseFilter.Q.value = 0.5;
    noise.buffer = noiseBuf;
    noiseGain.gain.setValueAtTime(0.3, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
    noise.connect(noiseFilter).connect(noiseGain).connect(master);
    noise.start(now);
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
// Result reveal — understated ascending acknowledgement.
// Two pitches rising by a minor third, sine only, brief filtered tail.
// Confident but reserved. Like a precision instrument confirming calibration.
// ─────────────────────────────────────────────────────────────────────────────
export function resultRevealSound() {
  try {
    if (!isSoundEnabled()) return;
    const ac = getCtx();
    const now = ac.currentTime;

    const master = ac.createGain();
    master.gain.setValueAtTime(0.5, now);
    master.gain.linearRampToValueAtTime(0.4, now + 0.15);
    master.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    master.connect(ac.destination);

    // Note 1: E5 (659 Hz) — grounded opening
    const n1 = ac.createOscillator();
    const n1g = ac.createGain();
    n1.type = 'sine';
    n1.frequency.setValueAtTime(659, now);
    n1g.gain.setValueAtTime(0.6, now);
    n1g.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    n1.connect(n1g).connect(master);
    n1.start(now);
    n1.stop(now + 0.25);

    // Note 2: G5 (784 Hz) — minor third up, delayed entry
    const n2 = ac.createOscillator();
    const n2g = ac.createGain();
    n2.type = 'sine';
    n2.frequency.setValueAtTime(784, now + 0.09);
    n2g.gain.setValueAtTime(0, now);
    n2g.gain.linearRampToValueAtTime(0.55, now + 0.1);
    n2g.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    n2.connect(n2g).connect(master);
    n2.start(now + 0.09);
    n2.stop(now + 0.45);

    // Sub warmth: E4 (330 Hz) — body underneath
    const sub = ac.createOscillator();
    const subg = ac.createGain();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(330, now);
    subg.gain.setValueAtTime(0.35, now);
    subg.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    sub.connect(subg).connect(master);
    sub.start(now);
    sub.stop(now + 0.2);

    // Breath — filtered noise exit
    const brSrc = ac.createBufferSource();
    const brFlt = ac.createBiquadFilter();
    const brGain = ac.createGain();
    brFlt.type = 'bandpass';
    brFlt.frequency.value = 3000;
    brFlt.Q.value = 0.6;
    brGain.gain.setValueAtTime(0.08, now + 0.08);
    brGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    brSrc.buffer = noiseBuffer(ac);
    brSrc.connect(brFlt).connect(brGain).connect(master);
    brSrc.start(now + 0.08);
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

    // Micro-resonance — very brief damped ring at body frequency
    const ring = ac.createOscillator();
    const ringGain = ac.createGain();
    ring.type = 'sine';
    ring.frequency.setValueAtTime(480, now);
    ring.frequency.exponentialRampToValueAtTime(380, now + 0.035);
    ringGain.gain.setValueAtTime(0.3, now + 0.003);
    ringGain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
    ring.connect(ringGain).connect(master);
    ring.start(now + 0.003);
    ring.stop(now + 0.04);
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
    master.gain.setValueAtTime(0.3, now);
    master.gain.linearRampToValueAtTime(0.2, now + 0.03);
    master.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    master.connect(ac.destination);

    const src = ac.createBufferSource();
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(1800, now);
    bp.frequency.exponentialRampToValueAtTime(800, now + 0.06);
    bp.Q.value = 0.8;
    src.buffer = noiseBuffer(ac);
    src.connect(bp).connect(master);
    src.start(now);
  } catch { /* silent */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Processing pulse — low ambient capacitor hum.
// Returns a stop() function. Barely audible sine with slow amplitude
// modulation, like high-voltage equipment idling.
// ─────────────────────────────────────────────────────────────────────────────
export function processingPulseSound() {
  try {
    if (!isSoundEnabled()) return () => {};
    const ac = getCtx();
    const now = ac.currentTime;

    const master = ac.createGain();
    master.gain.setValueAtTime(0, now);
    master.gain.linearRampToValueAtTime(0.18, now + 0.8);
    master.connect(ac.destination);

    // Low drone — 55 Hz (A1)
    const drone = ac.createOscillator();
    drone.type = 'sine';
    drone.frequency.value = 55;
    drone.connect(master);
    drone.start(now);

    // Amplitude modulation — slow breathe at 0.4 Hz
    const lfo = ac.createOscillator();
    const lfoGain = ac.createGain();
    lfo.type = 'sine';
    lfo.frequency.value = 0.4;
    lfoGain.gain.value = 0.06;
    lfo.connect(lfoGain).connect(master.gain);
    lfo.start(now);

    // Harmonic shimmer — octave above
    const harmonic = ac.createOscillator();
    const hGain = ac.createGain();
    harmonic.type = 'sine';
    harmonic.frequency.value = 110;
    hGain.gain.setValueAtTime(0, now);
    hGain.gain.linearRampToValueAtTime(0.06, now + 1.2);
    harmonic.connect(hGain).connect(master);
    harmonic.start(now);

    return function stop() {
      const t = ac.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0, t + 0.4);
      drone.stop(t + 0.5);
      lfo.stop(t + 0.5);
      harmonic.stop(t + 0.5);
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

    // Ready ping — high tone confirming boot
    const ping = ac.createOscillator();
    const pingGain = ac.createGain();
    ping.type = 'sine';
    ping.frequency.setValueAtTime(880, now + 0.35);
    ping.frequency.linearRampToValueAtTime(886, now + 0.7);
    pingGain.gain.setValueAtTime(0, now);
    pingGain.gain.linearRampToValueAtTime(0.35, now + 0.37);
    pingGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    ping.connect(pingGain).connect(master);
    ping.start(now + 0.35);
    ping.stop(now + 0.75);
  } catch { /* silent */ }
}
