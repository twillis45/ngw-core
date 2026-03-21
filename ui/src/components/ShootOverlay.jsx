/**
 * ShootOverlay — real-time visual guidance overlay for Shoot Mode.
 *
 * Phases:
 *   1. Ghost light marker  — semi-transparent target position anchored to face
 *   2. Directional arrows  — left/right/up/down/closer/further from the active command
 *   3. Alignment indicator — green/amber/red ring showing how close we are
 *
 * Technical approach:
 *   - getUserMedia → camera feed in <video>
 *   - Shape Detection API FaceDetector (Chrome) → face bounding box
 *   - requestAnimationFrame → 60fps canvas render, face detect every 5 frames
 *   - Graceful fallback: hide overlay + show text card if detection unavailable
 *
 * Props:
 *   currentCommand  — { doThis: string, result: string|null } — from current step
 *   onClose         — () => void
 */

import { useRef, useEffect, useState, useCallback } from 'react';

// ── Constants ────────────────────────────────────────────────────────────────

// Target light position relative to face (normalized, -1…1 from face center)
// Slightly camera-left and above eye level
const TARGET_H_OFFSET = -0.5;   // camera-left of subject face center
const TARGET_V_OFFSET = -0.9;   // above the eye line (eye line ≈ face top + 30%)

const DETECT_EVERY_N_FRAMES = 5; // run FaceDetector every N animation frames

// ── Arrow parsing ─────────────────────────────────────────────────────────────

const DIRECTION_PATTERNS = {
  left:    /camera[\s-]?left|\bto\s+the\s+left|\bleft\b/i,
  right:   /camera[\s-]?right|\bto\s+the\s+right|\bright\b/i,
  up:      /\braise\b|\blift\b|\bhigher\b|\bup\b/i,
  down:    /\blower\b|\bdrop\b|\bdown\b/i,
  closer:  /\bcloser\b|\bnearer\b|\bmove\s+in\b/i,
  back:    /\bback\b|\bfarther\b|\bfurther\b|\baway\b/i,
};

function parseDirection(doThis) {
  if (!doThis) return null;
  for (const [dir, re] of Object.entries(DIRECTION_PATTERNS)) {
    if (re.test(doThis)) return dir;
  }
  return null;
}

function alignmentStatus(direction) {
  // If there's an active directional correction, we're not yet aligned
  if (!direction) return 'green';   // no adjustment needed
  return 'amber';                   // one move needed
}

// ── Canvas drawing ────────────────────────────────────────────────────────────

const STATUS_COLORS = {
  green: { ring: 'rgba(34, 197, 94, 0.85)',  fill: 'rgba(34, 197, 94, 0.12)' },
  amber: { ring: 'rgba(251, 191, 36, 0.85)', fill: 'rgba(251, 191, 36, 0.10)' },
  red:   { ring: 'rgba(239, 68, 68, 0.85)',  fill: 'rgba(239, 68, 68, 0.10)' },
};

function drawGhostLight(ctx, x, y, radius, status) {
  const { ring, fill } = STATUS_COLORS[status] || STATUS_COLORS.amber;

  // Outer glow
  const glow = ctx.createRadialGradient(x, y, radius * 0.3, x, y, radius * 1.6);
  glow.addColorStop(0, fill);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.beginPath();
  ctx.arc(x, y, radius * 1.6, 0, Math.PI * 2);
  ctx.fillStyle = glow;
  ctx.fill();

  // Main circle
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = ring;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Beam direction indicator — small wedge pointing toward subject center
  ctx.save();
  ctx.translate(x, y);
  // Beam angle: pointing down-right (toward subject below and to the right of the key)
  const beamAngle = Math.PI * 0.3;
  ctx.rotate(beamAngle);
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(radius + 14, -6);
  ctx.lineTo(radius + 14, 6);
  ctx.closePath();
  ctx.fillStyle = ring;
  ctx.fill();
  ctx.restore();

  // Center dot
  ctx.beginPath();
  ctx.arc(x, y, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = ring;
  ctx.fill();
}

function drawDirectionArrow(ctx, cw, ch, direction, color) {
  const cx = cw / 2;
  const cy = ch / 2;
  const arrowLen = Math.min(cw, ch) * 0.08;
  const pad = Math.min(cw, ch) * 0.12;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  let sx, sy, ex, ey;
  if (direction === 'left') {
    ex = pad; ey = cy;
    sx = pad + arrowLen; sy = cy;
  } else if (direction === 'right') {
    ex = cw - pad; ey = cy;
    sx = cw - pad - arrowLen; sy = cy;
  } else if (direction === 'up') {
    ex = cx; ey = pad;
    sx = cx; sy = pad + arrowLen;
  } else if (direction === 'down') {
    ex = cx; ey = ch - pad;
    sx = cx; sy = ch - pad - arrowLen;
  } else if (direction === 'closer') {
    // Concentric shrinking rings
    [32, 22, 13].forEach((r, i) => {
      ctx.globalAlpha = 0.3 + i * 0.2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.restore();
    return;
  } else if (direction === 'back') {
    [12, 22, 32].forEach((r, i) => {
      ctx.globalAlpha = 0.3 + i * 0.2;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.restore();
    return;
  } else {
    ctx.restore();
    return;
  }

  // Shaft
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.stroke();

  // Arrowhead
  const angle = Math.atan2(ey - sy, ex - sx);
  const hs = 10;
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex - hs * Math.cos(angle - 0.4), ey - hs * Math.sin(angle - 0.4));
  ctx.lineTo(ex - hs * Math.cos(angle + 0.4), ey - hs * Math.sin(angle + 0.4));
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawFaceOutline(ctx, face, cw, ch) {
  const sx = face.x * cw;
  const sy = face.y * ch;
  const sw = face.w * cw;
  const sh = face.h * ch;
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(sx, sy, sw, sh);
  ctx.restore();
}

// ── Main component ────────────────────────────────────────────────────────────

// ── Permission gate ───────────────────────────────────────────────────────
//
// Check the Permissions API for camera state before mounting the live view.
// Returns: 'unknown' | 'prompt' | 'granted' | 'denied'
async function queryCameraPermission() {
  try {
    if (navigator.permissions) {
      const status = await navigator.permissions.query({ name: 'camera' });
      return status.state; // 'granted' | 'prompt' | 'denied'
    }
  } catch { /* Permissions API not available */ }
  return 'unknown';
}

export default function ShootOverlay({ currentCommand, onClose }) {
  const videoRef    = useRef(null);
  const canvasRef   = useRef(null);
  const streamRef   = useRef(null);
  const animRef     = useRef(null);
  const detectorRef = useRef(null);
  const faceRef     = useRef(null);          // latest face { x,y,w,h } in [0,1] coords
  const frameCount  = useRef(0);

  const [cameraError, setCameraError]         = useState(null);
  const [faceDetected, setFaceDetected]       = useState(false);
  const [detectorAvail, setDetectorAvail]     = useState(true);
  // 'check' → querying permission, 'prompt' → show explain screen,
  // 'live'  → camera running,      'denied' → show recovery instructions
  const [permState, setPermState]             = useState('check');

  const doThis   = currentCommand?.doThis || null;
  const result   = currentCommand?.result || null;
  const direction = parseDirection(doThis);
  const status   = alignmentStatus(direction);

  // ── Permission pre-check ──────────────────────────────────────────────────
  useEffect(() => {
    queryCameraPermission().then(state => {
      if (state === 'granted') setPermState('live');   // already allowed — go straight to camera
      else if (state === 'denied') setPermState('denied'); // blocked — show recovery
      else setPermState('prompt');                     // 'prompt' or 'unknown' — show explain screen
    });
  }, []);

  // ── Start camera ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (permState !== 'live') return;  // only run when permission gate passed
    let active = true;

    async function startCamera() {
      // Try progressively simpler constraints — some Android devices reject
      // facingMode:'environment' when combined with resolution hints, or reject
      // exact facingMode constraints entirely.
      const attempts = [
        { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } },
        { video: { facingMode: { ideal: 'environment' } } },
        { video: true },
      ];

      let stream = null;
      let lastErr = null;
      for (const constraints of attempts) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ ...constraints, audio: false });
          break;
        } catch (err) {
          lastErr = err;
          if (err.name === 'NotAllowedError') break; // no point retrying — user blocked
        }
      }

      if (!active) { stream?.getTracks().forEach(t => t.stop()); return; }

      if (!stream) {
        if (lastErr?.name === 'NotAllowedError') setPermState('denied');
        else setCameraError('Camera not available.');
        return;
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    }

    startCamera();

    return () => {
      active = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
    };
  }, [permState]);

  // ── Init face detector ────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window !== 'undefined' && 'FaceDetector' in window) {
      detectorRef.current = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
    } else {
      setDetectorAvail(false);
    }
  }, []);

  // ── Render loop ───────────────────────────────────────────────────────────
  const renderLoop = useCallback(() => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!canvas || !video || video.readyState < 2) {
      animRef.current = requestAnimationFrame(renderLoop);
      return;
    }

    const cw = canvas.width  = video.videoWidth  || canvas.offsetWidth;
    const ch = canvas.height = video.videoHeight || canvas.offsetHeight;
    const ctx = canvas.getContext('2d');

    // Draw video frame
    ctx.clearRect(0, 0, cw, ch);
    ctx.drawImage(video, 0, 0, cw, ch);

    // Dark vignette to improve overlay legibility
    const vignette = ctx.createRadialGradient(cw/2, ch/2, ch*0.3, cw/2, ch/2, ch*0.8);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, cw, ch);

    frameCount.current++;

    // Run face detection every N frames
    if (frameCount.current % DETECT_EVERY_N_FRAMES === 0 && detectorRef.current) {
      detectorRef.current.detect(video).then(faces => {
        if (faces && faces.length > 0) {
          const b = faces[0].boundingBox;
          faceRef.current = {
            x: b.x / cw,
            y: b.y / ch,
            w: b.width / cw,
            h: b.height / ch,
          };
          setFaceDetected(true);
        } else {
          faceRef.current = null;
          setFaceDetected(false);
        }
      }).catch(() => {});
    }

    const face = faceRef.current;
    const radius = Math.min(cw, ch) * 0.045;

    if (face) {
      // Draw face outline
      drawFaceOutline(ctx, face, cw, ch);

      // Compute target light position anchored to detected face
      const faceCenterX = (face.x + face.w / 2) * cw;
      const eyeLineY    = (face.y + face.h * 0.28) * ch;  // eye line ~28% down the face box
      const lightX      = faceCenterX + cw * (TARGET_H_OFFSET * face.w);
      const lightY      = eyeLineY    + ch * (TARGET_V_OFFSET * face.h);
      const clampedX    = Math.max(24, Math.min(cw - 24, lightX));
      const clampedY    = Math.max(24, Math.min(ch - 24, lightY));

      drawGhostLight(ctx, clampedX, clampedY, radius, status);

      // Draw adjustment arrow if there's an active direction
      if (direction) {
        const arrowColor = STATUS_COLORS.amber.ring;
        drawDirectionArrow(ctx, cw, ch, direction, arrowColor);
      }
    } else {
      // Fallback: no face detected (or FaceDetector unavailable).
      // Draw ghost light at the canonical key-light position — slightly
      // camera-left and above center, matching where the key should go.
      const defaultX = cw * 0.33;
      const defaultY = ch * 0.30;
      drawGhostLight(ctx, defaultX, defaultY, radius, 'amber');

      if (direction) {
        drawDirectionArrow(ctx, cw, ch, direction, STATUS_COLORS.amber.ring);
      }
    }

    animRef.current = requestAnimationFrame(renderLoop);
  }, [direction, status]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(renderLoop);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [renderLoop]);

  // ── Render ────────────────────────────────────────────────────────────────

  // ── Permission prompt screen ──────────────────────────────────────────────
  if (permState === 'check') {
    return (
      <div className="shoot-overlay shoot-overlay--gate">
        <button className="shoot-overlay__close" onClick={onClose} type="button" aria-label="Close overlay">✕</button>
        <div className="shoot-overlay__gate-body">
          <div className="shoot-overlay__gate-icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
            </svg>
          </div>
          <p className="shoot-overlay__gate-text">Checking camera…</p>
        </div>
      </div>
    );
  }

  if (permState === 'prompt') {
    return (
      <div className="shoot-overlay shoot-overlay--gate">
        <button className="shoot-overlay__close" onClick={onClose} type="button" aria-label="Close overlay">✕</button>
        <div className="shoot-overlay__gate-body">
          <div className="shoot-overlay__gate-icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
            </svg>
          </div>
          <h2 className="shoot-overlay__gate-title">Camera access needed</h2>
          <p className="shoot-overlay__gate-text">
            Live View uses your camera to show a ghost-light overlay on your subject.
            Your footage stays on-device and is never uploaded.
          </p>
          <button
            className="shoot-overlay__gate-btn"
            onClick={() => setPermState('live')}
            type="button"
          >
            Allow Camera
          </button>
          <button className="shoot-overlay__gate-skip" onClick={onClose} type="button">
            Not now
          </button>
        </div>
      </div>
    );
  }

  if (permState === 'denied') {
    return (
      <div className="shoot-overlay shoot-overlay--gate">
        <button className="shoot-overlay__close" onClick={onClose} type="button" aria-label="Close overlay">✕</button>
        <div className="shoot-overlay__gate-body">
          <div className="shoot-overlay__gate-icon shoot-overlay__gate-icon--warn">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <h2 className="shoot-overlay__gate-title">Camera blocked</h2>
          <p className="shoot-overlay__gate-text">
            Tap the button below — Chrome will ask again.
          </p>
          <button
            className="shoot-overlay__gate-btn"
            onClick={() => setPermState('live')}
            type="button"
          >
            Ask for camera access
          </button>
          <p className="shoot-overlay__gate-text" style={{ fontSize: '0.75rem', marginTop: 0 }}>
            If that doesn&apos;t work: <strong>⋮</strong> → Settings → Site settings → Camera → allow this site
          </p>
          <button className="shoot-overlay__gate-skip" onClick={onClose} type="button">
            Close
          </button>
        </div>
      </div>
    );
  }

  // ── Live view ─────────────────────────────────────────────────────────────
  return (
    <div className="shoot-overlay">
      {/* Close button */}
      <button className="shoot-overlay__close" onClick={onClose} type="button" aria-label="Close overlay">
        ✕
      </button>

      {/* Camera feed (hidden — canvas renders it) */}
      <video
        ref={videoRef}
        className="shoot-overlay__video"
        muted
        playsInline
        autoPlay
      />

      {/* Canvas overlay */}
      <canvas ref={canvasRef} className="shoot-overlay__canvas" />

      {/* Status indicators */}
      <div className="shoot-overlay__hud">
        {!detectorAvail && (
          <div className="shoot-overlay__hud-badge shoot-overlay__hud-badge--info">
            Light position is approximate — point camera at your subject
          </div>
        )}
        {detectorAvail && !faceDetected && !cameraError && (
          <div className="shoot-overlay__hud-badge">
            Point camera at subject to activate guidance
          </div>
        )}
        {faceDetected && (
          <div className={`shoot-overlay__alignment shoot-overlay__alignment--${status}`}>
            <span className="shoot-overlay__alignment-dot" />
            {status === 'green' ? 'Position looks good' : 'Adjustment needed'}
          </div>
        )}
        {cameraError && (
          <div className="shoot-overlay__hud-badge shoot-overlay__hud-badge--error">
            {cameraError}
          </div>
        )}
      </div>

      {/* Bottom command card — always shown */}
      <div className="shoot-overlay__card">
        {doThis ? (
          <>
            <div className="shoot-overlay__card-do">
              <span className="shoot-overlay__card-label">Do this</span>
              <span className="shoot-overlay__card-action">{doThis}</span>
            </div>
            {result && (
              <div className="shoot-overlay__card-result">
                <span className="shoot-overlay__card-label">Result</span>
                <span className="shoot-overlay__card-effect">{result}</span>
              </div>
            )}
          </>
        ) : (
          <div className="shoot-overlay__card-do">
            <span className="shoot-overlay__card-label">Start here</span>
            <span className="shoot-overlay__card-action">Place key slightly left and above eye level</span>
          </div>
        )}
      </div>
    </div>
  );
}
