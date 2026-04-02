/**
 * ExitIntercept — shows a sticky bottom sheet when the user is about to leave the results screen.
 *
 * Triggers on any of:
 *   - browser back navigation (popstate)
 *   - upward scroll past threshold after scrolling down
 *   - idle for IDLE_MS ms without interaction
 *
 * Dismisses after the user taps CTA (calls onUnlock) or taps dismiss (×).
 * Shows once per session (sessionStorage flag).
 *
 * Props:
 *   onUnlock  — called when user taps the primary CTA
 */

import { useEffect, useRef, useState } from 'react';

const IDLE_MS = 45_000;       // 45 s idle → show intercept
const SCROLL_THRESHOLD = 80;  // px scrolled up before showing
const SESSION_KEY = 'ngw_exit_intercept_shown';

export default function ExitIntercept({ onUnlock }) {
  const [visible, setVisible] = useState(false);
  const dismissed = useRef(
    typeof sessionStorage !== 'undefined'
      ? sessionStorage.getItem(SESSION_KEY) === 'true'
      : false,
  );
  const idleTimer = useRef(null);
  const lastScrollY = useRef(0);
  const maxScrollY = useRef(0);

  function show() {
    if (dismissed.current) return;
    dismissed.current = true;
    try { sessionStorage.setItem(SESSION_KEY, 'true'); } catch {}
    setVisible(true);
  }

  function dismiss() {
    setVisible(false);
  }

  function handleUnlock() {
    setVisible(false);
    onUnlock?.();
  }

  function resetIdle() {
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(show, IDLE_MS);
  }

  useEffect(() => {
    if (dismissed.current) return;

    // Idle timer
    resetIdle();
    const idleEvents = ['mousemove', 'keydown', 'touchstart', 'click', 'scroll'];
    idleEvents.forEach(e => window.addEventListener(e, resetIdle, { passive: true }));

    // Scroll-away detection
    function handleScroll() {
      const y = window.scrollY;
      if (y > maxScrollY.current) maxScrollY.current = y;
      if (maxScrollY.current > 200 && lastScrollY.current - y > SCROLL_THRESHOLD) {
        show();
      }
      lastScrollY.current = y;
    }
    window.addEventListener('scroll', handleScroll, { passive: true });

    // Back navigation
    function handlePopState() { show(); }
    window.addEventListener('popstate', handlePopState);

    return () => {
      clearTimeout(idleTimer.current);
      idleEvents.forEach(e => window.removeEventListener(e, resetIdle));
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className="exit-intercept" role="dialog" aria-modal="true" aria-label="Don't leave yet">
      <div className="exit-intercept__sheet">
        <button className="exit-intercept__dismiss" onClick={dismiss} aria-label="Dismiss" type="button">×</button>
        <p className="exit-intercept__message">
          You&rsquo;re 2 adjustments away from getting this right.
        </p>
        <button className="exit-intercept__cta" onClick={handleUnlock} type="button">
          Fix My Setup
        </button>
      </div>
      <div className="exit-intercept__backdrop" onClick={dismiss} aria-hidden="true" />
    </div>
  );
}
