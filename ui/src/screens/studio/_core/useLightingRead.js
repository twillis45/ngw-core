/**
 * useLightingRead — canvas-based lighting analysis visualization.
 *
 * Calls /api/lab/face-preflight to get real face landmarks + catchlights,
 * then renders warm light pools that flash and breathe at each detected
 * face feature. Synced to a 12s analysis cycle with strobe-pop audio.
 *
 * Returns a ref to attach to a <canvas> element overlaying the photo.
 *
 * Usage:
 *   const { canvasRef, faceDataLoaded } = useLightingRead(imageFile, analysisComplete);
 *   <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, zIndex: 2 }} />
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

function playStrobePop(intensity) {
  if (!_audioReady || !_audioCtx) return;
  const now = _audioCtx.currentTime;
  const rate = _audioCtx.sampleRate;

  // Thump
  const thumpDur = 0.08 + intensity * 0.04;
  const thumpBuf = _audioCtx.createBuffer(1, Math.ceil(rate * thumpDur), rate);
  const td = thumpBuf.getChannelData(0);
  for (let i = 0; i < td.length; i++) {
    const t = i / rate;
    td[i] = Math.sin(t * (55 + intensity * 12) * Math.PI * 2) * Math.exp(-t * 28) * (1 - Math.exp(-t * 500)) * 0.40 * intensity;
  }
  const tSrc = _audioCtx.createBufferSource(); tSrc.buffer = thumpBuf;
  const tF = _audioCtx.createBiquadFilter(); tF.type = 'lowpass'; tF.frequency.value = 150 + intensity * 40; tF.Q.value = 1.0;
  const tG = _audioCtx.createGain(); tG.gain.value = 0.70 + intensity * 0.30;
  tSrc.connect(tF); tF.connect(tG); tG.connect(_audioCtx.destination); tSrc.start(now);

  // Click
  const clickDur = 0.03 + intensity * 0.02;
  const clickBuf = _audioCtx.createBuffer(1, Math.ceil(rate * clickDur), rate);
  const cd = clickBuf.getChannelData(0);
  for (let i = 0; i < cd.length; i++) {
    const t = i / rate;
    cd[i] = (Math.random() * 2 - 1) * Math.exp(-t * 80) * (1 - Math.exp(-t * 2000)) * 0.20 * intensity;
  }
  const cSrc = _audioCtx.createBufferSource(); cSrc.buffer = clickBuf;
  const cF = _audioCtx.createBiquadFilter(); cF.type = 'bandpass'; cF.frequency.value = 2500 + intensity * 1000; cF.Q.value = 0.4;
  const cG = _audioCtx.createGain(); cG.gain.value = 0.10 + intensity * 0.08;
  cSrc.connect(cF); cF.connect(cG); cG.connect(_audioCtx.destination); cSrc.start(now);
}

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
  // imagePreview can be a File, Blob, or object URL string
  const canvasRef = useRef(null);
  const [faceData, setFaceData] = useState(null);
  const rafRef = useRef(null);
  const t0Ref = useRef(Date.now());
  const flashTimesRef = useRef(new Set());
  const activeLabelsRef = useRef([]);
  const spRef = useRef([0, 0, 0, 0, 0]);
  const photoRef = useRef(null); // will be set externally

  // Ensure audio context on mount (user already clicked Analyze)
  useEffect(() => { _ensureAudio(); }, []);

  // Fetch face preflight on image change
  useEffect(() => {
    if (!imagePreview) return;
    let cancelled = false;

    (async () => {
      try {
        // Convert imagePreview (object URL or File) to a Blob for upload
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
        if (cancelled || !data.ok) return;

        const cls = data.catchlights || [];
        const le = cls.find(c => c.eye === 'left');
        const re = cls.find(c => c.eye === 'right');

        // Derive key light angle from catchlight clock position.
        // "10 o'clock" = upper-left, "2 o'clock" = upper-right, etc.
        const primaryCL = le && re ? (le.intensity > re.intensity ? le : re) : (le || re);
        let keyAngleRad = -Math.PI / 4; // default: upper-left (45°)
        if (primaryCL && primaryCL.position) {
          const clockMatch = primaryCL.position.match(/(\d+)/);
          if (clockMatch) {
            const hour = parseInt(clockMatch[1]);
            // Clock to radians: 12=top (-π/2), 3=right (0), 6=bottom (π/2), 9=left (π)
            keyAngleRad = ((hour - 3) / 12) * Math.PI * 2;
          }
        }

        setFaceData({
          lm: data.landmarks || {},
          cls,
          keyDir: (le && re) ? (le.intensity > re.intensity ? 'left' : 'right') : 'left',
          keyAngle: keyAngleRad, // radians, 0 = right, -π/2 = top
        });
      } catch (e) { console.warn('[useLightingRead] preflight failed:', e.message); }
    })();

    return () => { cancelled = true; };
  }, [imagePreview]);

  // Reset on new analysis
  useEffect(() => {
    t0Ref.current = Date.now();
    flashTimesRef.current.clear();
    activeLabelsRef.current.length = 0;
    spRef.current = [0, 0, 0, 0, 0];
  }, [imagePreview]);

  // Animation loop
  const tick = useCallback(() => {
    const cvs = canvasRef.current;
    const fd = faceData;
    if (!cvs || !fd) { rafRef.current = requestAnimationFrame(tick); return; }

    const ctx = cvs.getContext('2d');
    const vf = cvs.parentElement;
    if (!vf) { rafRef.current = requestAnimationFrame(tick); return; }

    try {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = cvs.width = vf.clientWidth * dpr;
      const H = cvs.height = vf.clientHeight * dpr;
      const ir = Math.min(W, H);
      const time = Date.now() / 1000;

      const CYCLE = 12000;
      const HOLD = 3000; // hold all elements visible for 3s after cycle completes
      const elapsed = Date.now() - t0Ref.current;
      const t = Math.min(1, elapsed / CYCLE);
      // 5 stages across 80% of the cycle — last 20% holds everything at full
      const stageEnd = 0.80; // stages complete at 80% of cycle
      const tStage = Math.min(1, t / stageEnd);
      const as = Math.min(4, Math.floor(tStage * 5));
      const sp = spRef.current;

      for (let i = 0; i <= 4; i++) {
        if (i <= as) sp[i] = Math.min(1, i < as ? 1 : (tStage * 5) - i);
      }

      ctx.clearRect(0, 0, W, H);

      // Fit mapping — reads the ACTUAL computed object-fit from the <img> element.
      // Works for any device, orientation, or layout mode.
      const imgEl = vf.querySelector('img');
      if (!imgEl || !imgEl.naturalWidth) { rafRef.current = requestAnimationFrame(tick); return; }
      const iw = imgEl.naturalWidth, ih = imgEl.naturalHeight;
      const canvasAR = W / H, imgAR = iw / ih;

      // Read the actual CSS object-fit + object-position from the rendered element
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
        drawX = (W - drawW) * posX;
        drawY = (H - drawH) * posY;
      } else {
        // cover (default)
        const sc = Math.max(W / iw, H / ih);
        drawW = iw * sc; drawH = ih * sc;
        drawX = -(drawW - W) * posX;
        drawY = -(drawH - H) * posY;
      }

      function srcPt(fx, fy) { return { x: drawX + fx * drawW, y: drawY + fy * drawH }; }
      function lmPt(name) { const p = fd.lm[name]; return p ? srcPt(p.x, p.y) : null; }

      const flashTimes = flashTimesRef.current;
      const activeLabels = activeLabelsRef.current;
      const isLeft = fd.keyDir === 'left';

      // ── STAGE 0: Light pools ──
      const p0 = sp[0];
      if (p0 > 0.01) {
        const ba = as === 0 ? 1.0 : 0.45;
        const T = [];
        const addT = (key, int, delay, warmth) => {
          const p = fd.lm[key]; if (p) T.push({ x: p.x, y: p.y, intensity: int, delay, warmth });
        };

        // Single primary catchlight — the brighter eye. Showing both creates
        // visual clutter on desktop where the contained image is small.
        const primaryCL = fd.cls.reduce((best, cl) => (!best || (cl.intensity || 0) > (best.intensity || 0)) ? cl : best, null);
        if (primaryCL && primaryCL.nx) T.push({ x: primaryCL.nx, y: primaryCL.ny, intensity: 0.55, delay: 0.0, warmth: 0.7 });
        addT('forehead', 0.55, 0.20, 0.8);
        addT(isLeft ? 'left_cheek' : 'right_cheek', 0.65, 0.24, 0.9);
        addT(isLeft ? 'left_brow' : 'right_brow', 0.35, 0.26, 0.75);
        addT('nose_tip', 0.50, 0.42, 0.7);
        addT('nose_bridge', 0.45, 0.46, 0.65);
        addT(isLeft ? 'right_cheek' : 'left_cheek', 0.30, 0.62, 0.3);
        addT(isLeft ? 'right_brow' : 'left_brow', 0.25, 0.65, 0.35);
        addT('chin', 0.30, 0.80, 0.4);
        addT('mouth_top', 0.25, 0.84, 0.35);

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        T.forEach((target, i) => {
          const fadeIn = Math.max(0, Math.min(1, (p0 - target.delay) * 1.8));
          if (fadeIn < 0.01) return;
          const a = fadeIn * ba * target.intensity;
          const p = srcPt(target.x, target.y);
          const rawT = Math.max(0, p0 - target.delay);
          const flashRaw = Math.max(0, 1 - rawT * 4.5);
          const flashPop = flashRaw * flashRaw;
          const holdRaw = Math.min(1, rawT * 2.8);
          const holdGlow = holdRaw * holdRaw * (3 - 2 * holdRaw);
          const breath = 0.84 + Math.sin(time * 0.8 + i * 0.7) * 0.16;
          const holdA = a * holdGlow * breath;
          const flashA = (rawT > 0 ? 1 : 0) * target.intensity * flashPop;

          const clusterKey = Math.round(target.delay * 100);
          if (rawT > 0 && rawT < 0.02 && !flashTimes.has(clusterKey)) {
            flashTimes.add(clusterKey);
            playStrobePop(target.intensity);
            const copyMap = { 0: 'catchlights', 20: 'forehead', 42: 'nose', 62: 'cheek', 80: 'chin' };
            const label = copyMap[clusterKey];
            if (label) activeLabels.push({ label, x: p.x, y: p.y, born: time, intensity: target.intensity });
          }

          const grow = 0.3 + Math.min(1, fadeIn * 1.5) * 0.7;
          const w = target.warmth;
          const rC = 255, gC = Math.round(210 + w * 25), bC = Math.round(140 + (1 - w) * 40);

          if (flashA > 0.02) {
            const rf = ir * 0.18;
            const gf = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rf);
            gf.addColorStop(0, `rgba(255,252,245,${(flashA * 0.90).toFixed(2)})`);
            gf.addColorStop(0.15, `rgba(255,248,235,${(flashA * 0.50).toFixed(2)})`);
            gf.addColorStop(0.4, `rgba(255,240,220,${(flashA * 0.15).toFixed(2)})`);
            gf.addColorStop(1, 'rgba(255,235,210,0)');
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
            g1.addColorStop(0, `rgba(${rC},${gC + 5},${bC - 10},${(holdA * 0.45).toFixed(2)})`);
            g1.addColorStop(0.35, `rgba(${rC},${gC},${bC},${(holdA * 0.20).toFixed(2)})`);
            g1.addColorStop(1, `rgba(${rC},${gC},${bC},0)`);
            ctx.fillStyle = g1; ctx.fillRect(p.x - r1, p.y - r1, r1 * 2, r1 * 2);

            const corePulse = 0.85 + Math.sin(time * 1.5 + i * 1.3) * 0.15;
            const r2 = ir * 0.016 * grow;
            const g2 = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r2);
            g2.addColorStop(0, `rgba(255,${235 + Math.round(w * 10)},${200 + Math.round(w * 15)},${(holdA * corePulse * 0.65).toFixed(2)})`);
            g2.addColorStop(1, 'rgba(255,225,190,0)');
            ctx.fillStyle = g2; ctx.fillRect(p.x - r2, p.y - r2, r2 * 2, r2 * 2);
          }
        });
        ctx.restore();
      }

      // ── LABELS ──
      if (activeLabels.length > 0) {
        ctx.save();
        activeLabels.forEach(lb => {
          const age = time - lb.born;
          if (age > 3.0) return;
          let alpha, drift;
          if (age < 0.25) { const tt = age / 0.25; alpha = tt * tt * (3 - 2 * tt); drift = (1 - alpha) * ir * 0.004; }
          else if (age < 0.75) { alpha = 1.0; drift = 0; }
          else { const tt = (age - 0.75) / 2.25; alpha = Math.max(0, 1 - tt * tt); drift = -tt * ir * 0.008; }
          if (alpha < 0.01) return;
          const isMobile = W < 1000;
          const onRight = lb.x > W * 0.52;
          const gap = ir * (isMobile ? 0.04 : 0.035);
          const fontSize = Math.round(ir * (isMobile ? 0.030 : 0.026));
          ctx.font = `300 ${fontSize}px Inter, system-ui, sans-serif`;
          ctx.textBaseline = 'middle';
          ctx.textAlign = onRight ? 'right' : 'left';
          ctx.globalCompositeOperation = 'source-over';
          ctx.shadowColor = 'rgba(0,0,0,0.55)';
          ctx.shadowBlur = 6;
          ctx.fillStyle = `rgba(242,232,210,${(alpha * 0.72).toFixed(2)})`;
          ctx.fillText(lb.label.toLowerCase(), onRight ? lb.x - gap : lb.x + gap, lb.y + drift);
          ctx.shadowBlur = 0;
        });
        ctx.restore();
        while (activeLabels.length > 0 && time - activeLabels[0].born > 3.0) activeLabels.shift();
      }

      // ── KEY WASH — centered on the key-lit cheek (the side the light hits) ──
      const p2 = sp[2];
      if (p2 > 0.01) {
        // Use the actual key-side cheek landmark — this IS where the light hits.
        // The brighter catchlight tells us which side is key-lit.
        const keyChk = lmPt(isLeft ? 'left_cheek' : 'right_cheek');
        const keyBrw = lmPt(isLeft ? 'left_brow' : 'right_brow');
        // Center between cheek and brow, pushed slightly outward toward the light source
        const keyPt = (keyChk && keyBrw) ? {
          x: (keyChk.x + keyBrw.x) / 2 + (keyChk.x > W / 2 ? ir * 0.05 : -ir * 0.05),
          y: (keyChk.y + keyBrw.y) / 2,
        } : keyChk;

        if (keyPt) {
          if (p2 > 0.05 && !flashTimes.has('key')) { flashTimes.add('key'); playStrobePop(0.7); }
          ctx.save(); ctx.globalCompositeOperation = 'lighter';
          const ease = p2 * p2 * (3 - 2 * p2);
          const kr = ir * 0.55 * ease;
          const g = ctx.createRadialGradient(keyPt.x, keyPt.y, 0, keyPt.x, keyPt.y, kr);
          g.addColorStop(0, `rgba(255,235,195,${(ease * 0.30).toFixed(3)})`);
          g.addColorStop(0.20, `rgba(255,228,180,${(ease * 0.14).toFixed(3)})`);
          g.addColorStop(0.45, `rgba(255,220,168,${(ease * 0.05).toFixed(3)})`);
          g.addColorStop(1, 'rgba(255,218,160,0)');
          ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
          ctx.restore();
        }
      }

      // ── FILL WASH — centered on the shadow-side cheek (opposite the key) ──
      const p3 = sp[3];
      if (p3 > 0.01) {
        const fillPt = lmPt(isLeft ? 'right_cheek' : 'left_cheek');
        if (fillPt) {
          if (p3 > 0.05 && !flashTimes.has('fill')) { flashTimes.add('fill'); playStrobePop(0.5); }
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

      // ── CONVERGENCE ──
      const p4 = sp[4];
      if (p4 > 0.01) {
        if (!flashTimes.has('done')) { flashTimes.add('done'); playCompletionClick(); }
        const ease = p4 * p4 * (3 - 2 * p4);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(245,232,205,${(ease * 0.10).toFixed(3)})`;
        ctx.fillRect(0, 0, W, H);
        const faceCtr = lmPt('nose_tip') || lmPt('nose_bridge');
        if (faceCtr) {
          const cr = ir * 0.35;
          const cg = ctx.createRadialGradient(faceCtr.x, faceCtr.y, 0, faceCtr.x, faceCtr.y, cr);
          cg.addColorStop(0, `rgba(255,238,200,${(ease * 0.15).toFixed(3)})`);
          cg.addColorStop(0.35, `rgba(255,230,190,${(ease * 0.07).toFixed(3)})`);
          cg.addColorStop(1, 'rgba(255,225,180,0)');
          ctx.fillStyle = cg; ctx.fillRect(0, 0, W, H);
        }
        ctx.restore();
      }

    } catch (e) { /* silent — don't break rAF */ }

    if (!analysisComplete) {
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [faceData, analysisComplete]);

  // Start/stop animation
  useEffect(() => {
    if (faceData && !analysisComplete) {
      t0Ref.current = Date.now();
      rafRef.current = requestAnimationFrame(tick);
    }
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [faceData, analysisComplete, tick]);

  return { canvasRef, faceDataLoaded: !!faceData };
}
