/**
 * useIsDesktop — viewport width breakpoint hook for Studio Matte screens.
 *
 * Returns true when viewport width is >= 1024px. Used by ResultScreen and
 * SetupScreen to swap from their mobile stacked layout into a two-column
 * desktop composition while preserving all Studio Matte visual language and
 * Bucket A flow behavior.
 */
import { useEffect, useState } from 'react';

export const LAYOUT_DESKTOP_MIN = 1024;

export function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(`(min-width: ${LAYOUT_DESKTOP_MIN}px)`).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(`(min-width: ${LAYOUT_DESKTOP_MIN}px)`);
    const handler = (e) => setIsDesktop(e.matches);
    // Safari < 14 uses addListener/removeListener
    if (mq.addEventListener) mq.addEventListener('change', handler);
    else mq.addListener(handler);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', handler);
      else mq.removeListener(handler);
    };
  }, []);

  return isDesktop;
}

/**
 * useViewportWidth — live viewport width in px. Used for fluid sizing on
 * wide screens (e.g. scaling the Result hero column above 1180px). Returns 0
 * during SSR.
 */
export function useViewportWidth() {
  const [w, setW] = useState(() => (typeof window === 'undefined' ? 0 : window.innerWidth));
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => setW(window.innerWidth);
    window.addEventListener('resize', handler);
    // Orientation change fires on device rotation — delayed to let viewport settle.
    const orientHandler = () => setTimeout(handler, 150);
    window.addEventListener('orientationchange', orientHandler);
    const soApi = window.screen?.orientation;
    if (soApi) soApi.addEventListener('change', handler);
    return () => {
      window.removeEventListener('resize', handler);
      window.removeEventListener('orientationchange', orientHandler);
      if (soApi) soApi.removeEventListener('change', handler);
    };
  }, []);
  return w;
}
