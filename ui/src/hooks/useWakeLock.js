/**
 * useWakeLock — prevents the screen from sleeping while active.
 *
 * Uses NoSleep.js — the battle-tested library (100k+ weekly downloads) that
 * works on Android Chrome, Samsung Internet, iOS Safari, and desktop browsers.
 * On HTTPS it uses the Wake Lock API; on HTTP it falls back to a silent video.
 *
 * NoSleep requires a user gesture to enable. We listen for the first
 * touch/click and enable then.
 */
import { useEffect, useRef, useState } from 'react';
import NoSleep from 'nosleep.js';

export default function useWakeLock(enabled = false) {
  const noSleepRef = useRef(null);
  const [isActive, setIsActive] = useState(false);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    if (!enabled) {
      if (noSleepRef.current) {
        noSleepRef.current.disable();
        setIsActive(false);
      }
      return;
    }

    if (!noSleepRef.current) {
      noSleepRef.current = new NoSleep();
    }

    const ns = noSleepRef.current;

    // Try enabling immediately (works if Wake Lock API is available on HTTPS)
    ns.enable().then(() => setIsActive(true)).catch(() => {});

    // On HTTP / Android Chrome, enable requires a user gesture.
    // Listen for the first touch/click and enable then.
    const gestureHandler = () => {
      if (!enabledRef.current) return;
      ns.enable().then(() => setIsActive(true)).catch(() => {});
      document.removeEventListener('touchstart', gestureHandler, true);
      document.removeEventListener('click', gestureHandler, true);
    };
    document.addEventListener('touchstart', gestureHandler, true);
    document.addEventListener('click', gestureHandler, true);

    // Re-enable after tab switch (Android releases on background)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && enabledRef.current) {
        ns.enable().then(() => setIsActive(true)).catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      document.removeEventListener('touchstart', gestureHandler, true);
      document.removeEventListener('click', gestureHandler, true);
      ns.disable();
      setIsActive(false);
    };
  }, [enabled]);

  return { isActive };
}
