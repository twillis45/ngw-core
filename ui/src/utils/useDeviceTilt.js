/**
 * useDeviceTilt — normalized device orientation hook for the Studio Matte
 * glass viewfinder reflection.
 *
 * Returns `{ x, y }` in the range [-1, +1], smoothed via a one-pole IIR
 * filter so the reflection slides instead of jittering. The values describe
 * how the device is being held relative to "flat, facing user":
 *   x = +1  → tilted right    (rotate around Y axis, gamma +)
 *   x = -1  → tilted left     (gamma -)
 *   y = +1  → tilted forward  (rotate around X axis, beta +, top edge away)
 *   y = -1  → tilted backward (beta -)
 *
 * On iOS 13+ DeviceOrientationEvent requires an explicit permission grant
 * triggered by a user gesture — call the returned `requestPermission()` from
 * a tap handler. Until permission is granted (or on devices without
 * orientation sensors) the hook returns a calm `{ x: 0, y: 0 }` so reflection
 * layers stay in their resting Figma position.
 *
 * On non-touch desktop, the hook falls back to mouse position relative to the
 * window center — same value range — so the gyro reflection effect stays
 * legible during preview and design review without needing a phone.
 *
 * Used by Studio Matte glass overlays in HomeScreen, SetupScreen,
 * ResultScreen, and ProcessingScreen. Pair with `glassReflectionTransform()`
 * to convert the tilt vector into a CSS transform string.
 */
import { useEffect, useRef, useState, useCallback } from 'react';

// Range of physical tilt (degrees) we map to the full [-1, +1] reflection
// travel.  ~25° in either direction reaches the limit — the same gentle wrist
// movement a photographer makes when checking a screen-side reflection.
const TILT_RANGE_DEG = 25;

// One-pole IIR smoothing factor.  Higher = snappier but jitterier; lower =
// silkier but laggier.  0.18 lands close to the visual inertia of mercury in
// a spirit level, which is exactly the read we want.
const SMOOTH = 0.18;

// Clamp helper.
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export function useDeviceTilt({ enabled = true } = {}) {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [permission, setPermission] = useState(() => {
    if (typeof window === 'undefined') return 'unsupported';
    const Ev = window.DeviceOrientationEvent;
    if (!Ev) return 'unsupported';
    // iOS 13+ exposes requestPermission as a static fn.
    if (typeof Ev.requestPermission === 'function') return 'prompt';
    // Android / older iOS: granted by default.
    return 'granted';
  });

  // Smoothed values held in a ref so the rAF loop doesn't trigger renders.
  const smoothed = useRef({ x: 0, y: 0 });
  // Latest raw values from the most recent event, also held in a ref.
  const target = useRef({ x: 0, y: 0 });
  const rafId = useRef(0);

  // Drive the IIR filter from a single rAF loop so we publish at most one
  // setState per frame regardless of how chatty the sensor is.
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;
    let alive = true;
    const tick = () => {
      if (!alive) return;
      const s = smoothed.current;
      const t = target.current;
      s.x += (t.x - s.x) * SMOOTH;
      s.y += (t.y - s.y) * SMOOTH;
      // Only commit when the change is meaningful — saves React work.
      setTilt(prev => {
        const dx = Math.abs(prev.x - s.x);
        const dy = Math.abs(prev.y - s.y);
        if (dx < 0.005 && dy < 0.005) return prev;
        return { x: s.x, y: s.y };
      });
      rafId.current = window.requestAnimationFrame(tick);
    };
    rafId.current = window.requestAnimationFrame(tick);
    return () => {
      alive = false;
      if (rafId.current) window.cancelAnimationFrame(rafId.current);
    };
  }, [enabled]);

  // Subscribe to DeviceOrientationEvent once permission is granted.
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;
    if (permission !== 'granted') return;
    const handler = (e) => {
      // gamma = left/right tilt in degrees, beta = front/back.  Both may be
      // null on devices with no sensor (e.g. desktop browsers that fire
      // deviceorientation as a no-op) or briefly after enabling — when they
      // are, leave the target axis at its current value rather than treating
      // a missing reading as 0° (which, after the 45° resting-tilt offset,
      // would yank the reflection to a hard -1 y-tilt).
      if (typeof e.gamma === 'number') {
        target.current.x = clamp(e.gamma / TILT_RANGE_DEG, -1, 1);
      }
      if (typeof e.beta === 'number') {
        // Normalize beta around the natural "screen toward face" resting tilt
        // (~45°) so a phone held upright reads as 0, not as a hard +1.
        const bRel = e.beta - 45;
        target.current.y = clamp(bRel / TILT_RANGE_DEG, -1, 1);
      }
    };
    window.addEventListener('deviceorientation', handler, true);
    return () => window.removeEventListener('deviceorientation', handler, true);
  }, [enabled, permission]);

  // Desktop fallback — mouse position relative to viewport center.  Engages
  // whenever the device has a fine pointer; harmless on touch devices since
  // they never fire mousemove.  We can't gate this on `permission !==
  // 'granted'` because desktop browsers report 'granted' even though they
  // have no real sensor (DeviceOrientationEvent fires as a no-op).
  useEffect(() => {
    if (!enabled) return;
    if (typeof window === 'undefined') return;
    const fine = window.matchMedia && window.matchMedia('(pointer: fine)').matches;
    if (!fine) return;
    const handler = (e) => {
      const cx = window.innerWidth  / 2;
      const cy = window.innerHeight / 2;
      target.current.x = clamp((e.clientX - cx) / cx, -1, 1);
      target.current.y = clamp((e.clientY - cy) / cy, -1, 1);
    };
    window.addEventListener('mousemove', handler, { passive: true });
    return () => window.removeEventListener('mousemove', handler);
  }, [enabled]);

  // iOS 13+ permission request — must be called from a user gesture.  Returns
  // a promise that resolves to the new permission state.
  const requestPermission = useCallback(async () => {
    if (typeof window === 'undefined') return 'unsupported';
    const Ev = window.DeviceOrientationEvent;
    if (!Ev || typeof Ev.requestPermission !== 'function') {
      // Already granted (Android / desktop) or unsupported.
      setPermission(prev => (prev === 'unsupported' ? 'unsupported' : 'granted'));
      return permission === 'unsupported' ? 'unsupported' : 'granted';
    }
    try {
      const res = await Ev.requestPermission();
      const next = res === 'granted' ? 'granted' : 'denied';
      setPermission(next);
      return next;
    } catch {
      setPermission('denied');
      return 'denied';
    }
  }, [permission]);

  return { x: tilt.x, y: tilt.y, permission, requestPermission };
}

/**
 * glassReflectionTransform — convert a tilt vector into a CSS transform for
 * the GLASS_REFLECTION inner layer.
 *
 * The reflection slides AGAINST the tilt direction (a photo of the studio
 * lights would shift opposite the way you tilt the phone), and we apply a
 * gentle scale so the gradient never reveals an unfilled edge as it travels.
 *
 * @param {{x:number,y:number}} tilt — normalized [-1, +1] vector
 * @param {number} amountPx — peak travel in px (default 14)
 */
export function glassReflectionTransform(tilt, amountPx = 14) {
  const x = (tilt && typeof tilt.x === 'number') ? tilt.x : 0;
  const y = (tilt && typeof tilt.y === 'number') ? tilt.y : 0;
  const tx = (-x * amountPx).toFixed(2);
  const ty = (-y * amountPx).toFixed(2);
  return `translate3d(${tx}px, ${ty}px, 0) scale(1.08)`;
}
