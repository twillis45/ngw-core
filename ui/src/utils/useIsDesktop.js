/**
 * useIsDesktop — viewport width breakpoint hook for Studio Matte screens.
 *
 * Returns true when viewport width is >= 1024px. Used by ResultScreen and
 * SetupScreen to swap from their mobile stacked layout into a two-column
 * desktop composition while preserving all Studio Matte visual language and
 * Bucket A flow behavior.
 */
import { useEffect, useState } from 'react';

const DESKTOP_MIN_WIDTH = 1024;

export function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(`(min-width: ${DESKTOP_MIN_WIDTH}px)`).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia(`(min-width: ${DESKTOP_MIN_WIDTH}px)`);
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
