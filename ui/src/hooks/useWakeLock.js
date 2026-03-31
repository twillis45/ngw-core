import { useEffect, useRef, useState } from 'react';

/**
 * useWakeLock — keeps the screen awake while the hook is mounted.
 * Uses the Screen Wake Lock API; fails silently on unsupported browsers.
 *
 * Returns { isActive } so callers can show an indicator.
 */
export default function useWakeLock(enabled = true) {
  const lockRef = useRef(null);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    if (!enabled || !('wakeLock' in navigator)) return;

    let released = false;

    async function acquire() {
      try {
        lockRef.current = await navigator.wakeLock.request('screen');
        if (!released) setIsActive(true);
        lockRef.current.addEventListener('release', () => {
          setIsActive(false);
          lockRef.current = null;
        });
      } catch {
        // Permission denied or low battery — fail silently
      }
    }

    acquire();

    // Re-acquire on visibility change (lock is released when tab is hidden)
    function handleVisibility() {
      if (document.visibilityState === 'visible' && !lockRef.current && !released) {
        acquire();
      }
    }
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      released = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      if (lockRef.current) {
        lockRef.current.release().catch(() => {});
        lockRef.current = null;
      }
      setIsActive(false);
    };
  }, [enabled]);

  return { isActive };
}
