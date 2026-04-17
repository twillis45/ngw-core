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
    // Mobile: screen.height is the stable CSS viewport height that doesn't
    // jump when browser chrome or the virtual keyboard shows/hides.
    // Desktop: screen.height can be much larger than the browser window
    // (e.g. 982 for a 1440p display with a browser viewport of 800),
    // so always use innerHeight — no virtual keyboard to worry about.
    if (ih >= DESKTOP_MIN_WIDTH && window.innerWidth >= DESKTOP_MIN_WIDTH) return ih; // desktop
    const sh = window.screen?.height || 0;
    return sh > 0 && sh <= ih * 1.4 ? sh : ih;
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
