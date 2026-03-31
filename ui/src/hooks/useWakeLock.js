/**
 * useWakeLock — prevents the screen from sleeping while active.
 * Falls back gracefully on browsers that don't support the Wake Lock API.
 */
import { useEffect, useRef, useState } from 'react';

export default function useWakeLock(enabled = false) {
  const lockRef = useRef(null);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    if (!enabled) {
      lockRef.current?.release?.().catch(() => {});
      lockRef.current = null;
      setIsActive(false);
      return;
    }

    if (!('wakeLock' in navigator)) return;

    let cancelled = false;
    navigator.wakeLock.request('screen').then((lock) => {
      if (cancelled) { lock.release(); return; }
      lockRef.current = lock;
      setIsActive(true);
      lock.addEventListener('release', () => setIsActive(false));
    }).catch(() => {});

    return () => {
      cancelled = true;
      lockRef.current?.release?.().catch(() => {});
      lockRef.current = null;
    };
  }, [enabled]);

  return { isActive };
}
