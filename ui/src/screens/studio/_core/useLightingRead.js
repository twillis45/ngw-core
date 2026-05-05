/**
 * useLightingRead — canvas-based lighting analysis visualization.
 *
 * Calls /api/lab/face-preflight to get real face landmarks + catchlights,
 * then renders warm light pools that breathe at each detected face feature.
 *
 * Design constraints:
 * - Max 4 pools simultaneously (primary catchlight, key cheek, nose, fill cheek)
 * - Flash peak alpha capped at 0.55 to avoid blow-out
 * - 2 audio events max per analysis: one start tick, one completion click
 * - No anatomy labels
 * - 6s cycle ceiling with analysis-driven fast-forward
 * - No pools rendered before real preflight data arrives (no DEFAULT_FACE fake signal)
 * - prefers-reduced-motion: skip strobe/breath, show static held glow only
 *
 * Returns { canvasRef, faceDataState }
 *   faceDataState: 'loading' | 'real' | 'none'
 */
import { useRef, useEffect, useCallback, useState } from 'react';

// ── Audio ──
let _audioCtx = null;
let _audioReady = false;

function _ensureAudio() {
  if (_audioCtx) return;
  try {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    _audioCtx.resume().then(() => { _audioReady = true; });
  } catch (e) { /* browser blocked */ }
}

// Soft start tick — fires once at cycle start
function playStartTick() {
  if (!_audioReady || !_audioCtx) return;
  const now = _audioCtx.currentTime;
  const rate = _audioCtx.sampleRate;
  const buf = _audioCtx.createBuffer(1, Math.ceil(rate * 0.04), rate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    const t = i / rate;
    d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 120) * (1 - Math.exp(-t * 1200)) * 0.12;
  }
  const src = _audioCtx.createBufferSource(); src.buffer = buf;
  const f = _audioCtx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.6;
  const g = _audioCtx.createGain(); g.gain.value = 0.35;
  src.connect(f); f.connect(g); g.connect(_audioCtx.destination); src.start(now);
}

// Completion click — fires once when cycle converges
function playCompletionClick() {
  if (!_audioReady || !_audioCtx) return;
  const now = _audioCtx.currentTime;
  const rate = _audioCtx.sampleRate;
  const buf = _audioCtx.createBuffer(1, Math.ceil(rate * 0.05), rate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    const t = i / rate;
    d[i] = ((Math.random() * 2 - 1) * 0.5 + Math.sin(t * 800 * Math.PI * 2) * 0.3) * Math.exp(-t * 120);
  }
  const src = _audioCtx.createBufferSource(); src.buffer = buf;
  const f = _audioCtx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1200; f.Q.value = 0.5;
  const g = _audioCtx.createGain(); g.gain.value = 0.55;
  src.connect(f); f.connect(g); g.connect(_audioCtx.destination); src.start(now);
}

// ── Hook ──
export default function useLightingRead(imagePreview, analysisComplete) {
  const canvasRef = useRef(null);

  // faceDataState: 'loading' → 'real' or 'none' after preflight returns
  const [faceDataState, setFaceDataState] = useState('loading');
  const [faceData, setFaceData] = useState(null); // null until real data arrives

  const rafRef = useRef(null);
  const t0Ref = useRef(Date.now());
  const flashTimesRef = useRef(new Set());
  const completionStartRef = useRef(null);   // timestamp when analysisComplete first fired
  const completionStartTRef = useRef(null);  // cycle t value at that moment
  const startTickFiredRef = useRef(false);
  const completionClickFiredRef = useRef(false);
  const reducedMotionRef = useRef(
    typeof window !== 'undefined' &&
    Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches)
  );

  // Ensure audio context on mount (user already interacted via Analyze button)
  useEffect(() => { _ensureAudio(); }, []);

  // Fetch face preflight on image change
  useEffect(() => {
    if (!imagePreview) return;
    let cancelled = false;

    setFaceDataState('loading');
    setFaceData(null);
    startTickFiredRef.current = false;
    completionClickFiredRef.current = false;

    (async () => {
      try {
        let blob;
        if (imagePreview instanceof File || imagePreview instanceof Blob) {
          blob = imagePreview;
        } else if (typeof imagePreview === 'string') {
          const r = await fetch(imagePreview);
          blob = await r.blob();
        } else return;

        const form = new FormData();
        form.append('image', blob, 'photo.jpg');
        const resp = await fetch('/api/lab/face-preflight', { method: 'POST', body: form });
        const data = await resp.json();
        if (cancelled) return;

        if (!data.ok || !data.landmarks || Object.keys(data.landmarks).length === 0) {
          setFaceDataState('none');
          return;
        }

        const cls = data.catchlights || [];
        const le = cls.find(c => c.eye === 'left');
        const re = cls.find(c => c.eye === 'right');

        const primaryCL = le && re ? (le.intensity > re.intensity ? le : re) : (le || re);
        let keyAngleRad = -Math.PI / 4;
        if (primaryCL && primaryCL.position) {
          const clockMatch = primaryCL.position.match(/(\d+)/);
          if (clockMatch) {
            const hour = parseInt(clockMatch[1]);
            keyAngleRad = ((hour - 3) / 12) * Math.PI * 2;
          }
        }

        // Reset cycle timing so pools re-emerge at accurate face positions
        t0Ref.current = Date.now();
        flashTimesRef.current = new Set();
        startTickFiredRef.current = false;
        completionClickFiredRef.current = false;

        setFaceDataState('real');
        setFaceData({
          lm: data.landmarks || {},
          cls,
          keyDir: (le && re) ? (le.intensity > re.intensity ? 'left' : 'right') : 'left',
          keyAngle: keyAngleRad,
        });
      } catch (e) {
        if (!cancelled) {
          console.warn('[useLightingRead] preflight failed:', e.message);
          setFaceDataState('none');
        }
      }
    })();

    return () => { cancelled = true; };
  }, [imagePreview]);

  // Reset cycle timing on new image
  useEffect(() => {
    t0Ref.current = Date.now();
    flashTimesRef.current.clear();
    completionStartRef.current = null;
    completionStartTRef.current = null;
    startTickFiredRef.current = false;
    completionClickFiredRef.current = false;
  }, [imagePreview]);

  const tick = useCallback(() => {
    const cvs = canvasRef.current;
    const fd = faceData;

    // No real face data yet — clear canvas and wait
    if (!fd || !cvs) {
      if (cvs) { try { const ctx2 = cvs.getContext('2d'); ctx2.clearRect(0, 0, cvs.width, cvs.height); } catch {} }
      rafRef.current = requestAnimationFrame(tick);
      return;
    }

    const ctx = cvs.getContext('2d');
    const vf = cvs.parentElement;
    if (!vf) { rafRef.current = requestAnimationFrame(tick); return; }

    try {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = cvs.width = vf.clientWidth * dpr;
      const H = cvs.height = vf.clientHeight * dpr;
      const ir = Math.min(W, H);
      const time = Date.now() / 1000;
      const rm = reducedMotionRef.current;

      const CYCLE = 6000;
      const elapsed = Date.now() - t0Ref.current;

      // Fast-forward when analysis completes mid-cycle
      let t;
      if (analysisComplete) {
        if (!completionStartRef.current) {
          completionStartRef.current = Date.now();
          completionStartTRef.current = Math.min(1, elapsed / CYCLE);
        }
        const fastElapsed = Date.now() - completionStartRef.current;
        const fastP = Math.min(1, fastElapsed / 400);
        const base = completionStartTRef.current || 0;
        t = base + (1 - base) * fastP;
      } else {
        t = Math.min(1, elapsed / CYCLE);
      }

      // 5 stages across 80% of the cycle — last 20% holds everything at full
      const stageEnd = 0.80;
      const tStage = Math.min(1, t / stageEnd);
      const as = Math.min(4, Math.floor(tStage * 5));
      const sp = [0, 0, 0, 0, 0];
      for (let i = 0; i <= 4; i++) {
        if (i <= as) sp[i] = Math.min(1, i < as ? 1 : (tStage * 5) - i);
      }

      ctx.clearRect(0, 0, W, H);

      const imgEl = vf.querySelector('img');
      if (!imgEl || !imgEl.naturalWidth) { rafRef.current = requestAnimationFrame(tick); return; }
      const iw = imgEl.naturalWidth, ih = imgEl.naturalHeight;

      const computedStyle = window.getComputedStyle(imgEl);
      const fitMode = computedStyle.objectFit || 'cover';
      const posStr = computedStyle.objectPosition || '50% 50%';
      const posParts = posStr.split(/\s+/);
      const posX = parseFloat(posParts[0] || '50') / 100;
      const posY = parseFloat(posParts[1] || posParts[0] || '50') / 100;

      let drawW, drawH, drawX, drawY;
      if (fitMode === 'contain') {
        const sc = Math.min(W / iw, H / ih);
        drawW = iw * sc; drawH = ih * sc;
        drawX = (W - drawW) * posX; drawY = (H - drawH) * posY;
      } else {
        const sc = Math.max(W / iw, H / ih);
        drawW = iw * sc; drawH = ih * sc;
        drawX = -(drawW - W) * posX; drawY = -(drawH - H) * posY;
      }

      function srcPt(fx, fy) { return { x: drawX + fx * drawW, y: drawY + fy * drawH }; }
      function lmPt(name) { const p = fd.lm[name]; return p ? srcPt(p.x, p.y) : null; }

      const flashTimes = flashTimesRef.current;
      const isLeft = fd.keyDir === 'left';

      // ── STAGE 0: 4 light pools only ──
      const p0 = sp[0];
      if (p0 > 0.01) {
        // Fire start tick once when pools first appear
        if (!startTickFiredRef.current && !rm) {
          startTickFiredRef.current = true;
          playStartTick();
        }

        const ba = as === 0 ? 1.0 : 0.45;
        const T = [];

        // Pool 1: primary catchlight
        const primaryCL = fd.cls.reduce((best, cl) =>
          (!best || (cl.intensity || 0) > (best.intensity || 0)) ? cl : best, null);
        if (primaryCL && primaryCL.nx != null) {
          T.push({ x: primaryCL.nx, y: primaryCL.ny, intensity: 0.55, delay: 0.0, warmth: 0.6 });
        }

        // Pool 2: key-side cheek
        T.push({ key: isLeft ? 'left_cheek' : 'right_cheek', intensity: 0.58, delay: 0.22, warmth: 0.65 });
        // Pool 3: nose bridge (the light reads across the nose)
        T.push({ key: 'nose_tip', intensity: 0.45, delay: 0.40, warmth: 0.55 });
        // Pool 4: fill-side cheek (cooler)
        T.push({ key: isLeft ? 'right_cheek' : 'left_cheek', intensity: 0.28, delay: 0.58, warmth: 0.25 });

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        T.forEach((target, i) => {
          // Resolve position — either direct x/y (normalized, for catchlights) or landmark key
          let p;
          if (target.key) {
            const lm = fd.lm[target.key];
            if (!lm) return;
            p = srcPt(lm.x, lm.y);
          } else if (target.x != null) {
            p = srcPt(target.x, target.y);
          } else {
            return;
          }

          const fadeIn = Math.max(0, Math.min(1, (p0 - target.delay) * 1.8));
          if (fadeIn < 0.01) return;
          const a = fadeIn * ba * target.intensity;
          const rawT = Math.max(0, p0 - target.delay);
          const flashRaw = Math.max(0, 1 - rawT * 4.5);
          const flashPop = rm ? 0 : flashRaw * flashRaw; // no flash on reduced motion
          const holdRaw = Math.min(1, rawT * 2.8);
          const holdGlow = holdRaw * holdRaw * (3 - 2 * holdRaw);
          const breath = rm ? 1.0 : (0.84 + Math.sin(time * 0.8 + i * 0.7) * 0.16);
          const holdA = a * holdGlow * breath;
          // Cap flash at 0.55 to prevent blow-out
          const flashA = Math.min(0.55, target.intensity * flashPop);

          const grow = 0.3 + Math.min(1, fadeIn * 1.5) * 0.7;
          const w = target.warmth;
          // Toned-down warm: less amber, more neutral warm
          const rC = 240, gC = Math.round(200 + w * 18), bC = Math.round(160 + (1 - w) * 30);

          if (flashA > 0.02) {
            const rf = ir * 0.18;
            const gf = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rf);
            gf.addColorStop(0, `rgba(245,242,235,${(flashA).toFixed(2)})`);
            gf.addColorStop(0.15, `rgba(240,235,225,${(flashA * 0.45).toFixed(2)})`);
            gf.addColorStop(0.4, `rgba(235,228,215,${(flashA * 0.12).toFixed(2)})`);
            gf.addColorStop(1, 'rgba(230,225,210,0)');
            ctx.fillStyle = gf; ctx.fillRect(p.x - rf, p.y - rf, rf * 2, rf * 2);
          }

          if (holdA > 0.02) {
            const r0 = ir * 0.10 * grow * (0.7 + target.intensity * 0.3);
            const g0 = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r0);
            g0.addColorStop(0, `rgba(${rC},${gC},${bC},${(holdA * 0.16).toFixed(3)})`);
            g0.addColorStop(0.45, `rgba(${rC},${gC},${bC},${(holdA * 0.05).toFixed(3)})`);
            g0.addColorStop(1, `rgba(${rC},${gC},${bC},0)`);
            ctx.fillStyle = g0; ctx.fillRect(p.x - r0, p.y - r0, r0 * 2, r0 * 2);

            const r1 = ir * 0.048 * grow * (0.7 + target.intensity * 0.3);
            const g1 = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r1);
            g1.addColorStop(0, `rgba(${rC},${gC + 5},${bC - 8},${(holdA * 0.38).toFixed(2)})`);
            g1.addColorStop(0.35, `rgba(${rC},${gC},${bC},${(holdA * 0.16).toFixed(2)})`);
            g1.addColorStop(1, `rgba(${rC},${gC},${bC},0)`);
            ctx.fillStyle = g1; ctx.fillRect(p.x - r1, p.y - r1, r1 * 2, r1 * 2);

            const corePulse = rm ? 0.85 : (0.85 + Math.sin(time * 1.5 + i * 1.3) * 0.15);
            const r2 = ir * 0.016 * grow;
            const g2 = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r2);
            g2.addColorStop(0, `rgba(245,${225 + Math.round(w * 8)},${195 + Math.round(w * 12)},${(holdA * corePulse * 0.55).toFixed(2)})`);
            g2.addColorStop(1, 'rgba(235,215,185,0)');
            ctx.fillStyle = g2; ctx.fillRect(p.x - r2, p.y - r2, r2 * 2, r2 * 2);
          }
        });
        ctx.restore();
      }

      // ── KEY WASH — centered on key-lit cheek ──
      const p2 = sp[2];
      if (p2 > 0.01) {
        const keyChk = lmPt(isLeft ? 'left_cheek' : 'right_cheek');
        const keyBrw = lmPt(isLeft ? 'left_brow' : 'right_brow');
        const keyPt = (keyChk && keyBrw) ? {
          x: (keyChk.x + keyBrw.x) / 2 + (keyChk.x > W / 2 ? ir * 0.05 : -ir * 0.05),
          y: (keyChk.y + keyBrw.y) / 2,
        } : keyChk;

        if (keyPt) {
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          const ease = p2 * p2 * (3 - 2 * p2);
          const kr = ir * 0.55 * ease;
          const g = ctx.createRadialGradient(keyPt.x, keyPt.y, 0, keyPt.x, keyPt.y, kr);
          // Neutral warm wash — not amber
          g.addColorStop(0, `rgba(235,222,205,${(ease * 0.22).toFixed(3)})`);
          g.addColorStop(0.20, `rgba(228,215,198,${(ease * 0.10).toFixed(3)})`);
          g.addColorStop(0.45, `rgba(220,208,192,${(ease * 0.04).toFixed(3)})`);
          g.addColorStop(1, 'rgba(215,205,188,0)');
          ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
          ctx.restore();
        }
      }

      // ── FILL WASH — shadow-side cheek ──
      const p3 = sp[3];
      if (p3 > 0.01) {
        const fillPt = lmPt(isLeft ? 'right_cheek' : 'left_cheek');
        if (fillPt) {
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          const ease = p3 * p3 * (3 - 2 * p3);
          const fr = ir * 0.50 * ease;
          const g = ctx.createRadialGradient(fillPt.x, fillPt.y, 0, fillPt.x, fillPt.y, fr);
          g.addColorStop(0, `rgba(120,160,220,${(ease * 0.22).toFixed(3)})`);
          g.addColorStop(0.22, `rgba(112,152,215,${(ease * 0.10).toFixed(3)})`);
          g.addColorStop(0.50, `rgba(105,148,210,${(ease * 0.03).toFixed(3)})`);
          g.addColorStop(1, 'rgba(105,148,210,0)');
          ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
          ctx.restore();
        }
      }

      // ── CONVERGENCE — completion beat ──
      const p4 = sp[4];
      if (p4 > 0.01) {
        if (!completionClickFiredRef.current && !rm) {
          completionClickFiredRef.current = true;
          playCompletionClick();
        }
        const ease = p4 * p4 * (3 - 2 * p4);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        // Neutral warm lift — not amber
        ctx.fillStyle = `rgba(225,218,208,${(ease * 0.08).toFixed(3)})`;
        ctx.fillRect(0, 0, W, H);
        const faceCtr = lmPt('nose_tip') || lmPt('nose_bridge');
        if (faceCtr) {
          const cr = ir * 0.35;
          const cg = ctx.createRadialGradient(faceCtr.x, faceCtr.y, 0, faceCtr.x, faceCtr.y, cr);
          cg.addColorStop(0, `rgba(232,222,208,${(ease * 0.12).toFixed(3)})`);
          cg.addColorStop(0.35, `rgba(225,215,200,${(ease * 0.05).toFixed(3)})`);
          cg.addColorStop(1, 'rgba(218,210,195,0)');
          ctx.fillStyle = cg; ctx.fillRect(0, 0, W, H);
        }
        ctx.restore();
      }

    } catch (e) { /* silent — don't break rAF */ }

    // Keep running until fully settled (fast-forward complete) or still in cycle
    const allSettled = analysisComplete &&
      completionStartRef.current != null &&
      (Date.now() - completionStartRef.current) >= 400;

    if (!allSettled) {
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [faceData, analysisComplete]);

  // Start/restart animation when face data or completion state changes
  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    // Run if: we have face data and analysis is still running,
    // OR we have face data and analysis just completed (need to fast-forward to settle)
    if (faceData) {
      rafRef.current = requestAnimationFrame(tick);
    }
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [faceData, analysisComplete, tick]);

  return { canvasRef, faceDataState };
}
