/**
 * useStableViewport — shared viewport measurement hook.
 *
 * Returns { stableVH, safeBottom, isDesktop } — the three values that
 * HomeScreen, ProcessingScreen, and ResultScreen all need for layout
 * geometry. Captured once at mount so the layout never jumps when mobile
 * browser chrome shows/hides.
 *
 * stableVH   — uses screen.height on mobile (equals CSS viewport in
 *              fullscreen) with a desktop fallback to innerHeight.
 * safeBottom — env(safe-area-inset-bottom) probed via a DOM element.
 * isDesktop  — true when viewport width >= 500px (reactive via matchMedia).
 */
import { useState, useEffect } from 'react';

/** Shared desktop breakpoint — viewport width at or above this is "desktop". */
export const DESKTOP_MIN_WIDTH = 500;

export default function useStableViewport() {
  const [stableVH] = useState(() => {
    if (typeof window === 'undefined') return 932;
    const ih = window.innerHeight;
    const iw = window.innerWidth;
    // Desktop: always use innerHeight — no virtual keyboard, no browser chrome issues.
    if (ih >= DESKTOP_MIN_WIDTH && iw >= DESKTOP_MIN_WIDTH) return ih;

    // Mobile: use innerHeight (actual visible viewport) NOT screen.height.
    // screen.height includes status bars, browser chrome, and system UI that
    // the app cannot draw into — using it causes the analyze button to be
    // positioned past the visible area on phones with browser chrome visible.
    //
    // Captured once at mount so the layout never jumps when mobile browser
    // chrome shows/hides. The button stays anchored to where it was when
    // the page loaded, which is always a visible position.
    //
    // On PWA / fullscreen (where chrome is hidden), innerHeight already
    // matches the full screen — no loss vs screen.height.
    return ih;
  });

  const [safeBottom, setSafeBottom] = useState(0);
  useEffect(() => {
    const probe = document.createElement('div');
    probe.style.cssText =
      'position:fixed;bottom:0;height:env(safe-area-inset-bottom, 0px);visibility:hidden;pointer-events:none;';
    document.body.appendChild(probe);
    const h = probe.getBoundingClientRect().height || 0;
    document.body.removeChild(probe);
    setSafeBottom(h);
  }, []);

  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= DESKTOP_MIN_WIDTH,
  );
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${DESKTOP_MIN_WIDTH}px)`);
    const handler = (e) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return { stableVH, safeBottom, isDesktop };
}
