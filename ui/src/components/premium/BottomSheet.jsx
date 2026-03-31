import { useEffect, useRef } from 'react';

const FOCUSABLE_SEL = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** BottomSheet — dismissible bottom sheet with backdrop.
 *  All dismiss paths (X, backdrop, drag, Escape) call onDismiss.
 *  Body scroll is locked while open. Focus is returned to the invoking element on close.
 *  labelId: optional id of the heading inside children for aria-labelledby. */
export default function BottomSheet({ isOpen, onDismiss, children, labelId }) {
  const sheetRef  = useRef(null);
  const startYRef = useRef(null);
  const triggerRef = useRef(null); // element that had focus before sheet opened

  // Lock body scroll while open
  useEffect(() => {
    if (isOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [isOpen]);

  // Capture trigger element on open; focus first focusable; restore trigger on close
  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement;
      const focusables = Array.from(sheetRef.current?.querySelectorAll(FOCUSABLE_SEL) || []);
      focusables[0]?.focus();
    } else if (triggerRef.current) {
      triggerRef.current.focus();
      triggerRef.current = null;
    }
  }, [isOpen]);

  // Keyboard: Escape dismiss + Tab focus trap (separate from focus capture)
  useEffect(() => {
    if (!isOpen || !sheetRef.current) return;
    function onKey(e) {
      if (e.key === 'Escape') { onDismiss('escape'); return; }
      if (e.key !== 'Tab') return;
      const els = Array.from(sheetRef.current.querySelectorAll(FOCUSABLE_SEL));
      if (els.length === 0) return;
      const first = els[0];
      const last  = els[els.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onDismiss]);

  // Drag-down to dismiss with rubber-band feedback
  function handleTouchStart(e) {
    startYRef.current = e.touches[0].clientY;
  }
  function handleTouchMove(e) {
    if (startYRef.current == null || !sheetRef.current) return;
    const deltaY = e.touches[0].clientY - startYRef.current;
    if (deltaY <= 0) return; // upward drag — ignore
    sheetRef.current.style.transition = 'none';
    const centered = window.innerWidth >= 768;
    sheetRef.current.style.transform = centered
      ? `translateX(-50%) translateY(${deltaY}px)`
      : `translateY(${deltaY}px)`;
  }
  function handleTouchEnd(e) {
    if (startYRef.current == null || !sheetRef.current) return;
    const deltaY = e.changedTouches[0].clientY - startYRef.current;
    startYRef.current = null;
    const el = sheetRef.current;
    if (deltaY > 80) {
      // Animate from dragged position to off-screen, then call onDismiss
      el.style.transition = 'transform 280ms cubic-bezier(0.32,0.72,0,1)';
      const centered = window.innerWidth >= 768;
      el.style.transform = centered
        ? 'translateX(-50%) translateY(100%)'
        : 'translateY(100%)';
      setTimeout(() => {
        if (el) { el.style.transition = ''; el.style.transform = ''; }
        onDismiss('drag');
      }, 280);
    } else {
      // Spring back with elastic feel — slight overshoot and settle
      el.style.transition = 'transform 320ms cubic-bezier(0.34, 1.12, 0.64, 1)';
      el.style.transform = '';
      el.addEventListener('transitionend', () => { el.style.transition = ''; }, { once: true });
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`ngw-sheet-backdrop${isOpen ? ' ngw-sheet-backdrop--open' : ''}`}
        onClick={() => onDismiss('backdrop')}
        aria-hidden="true"
      />
      {/* Sheet */}
      <div
        ref={sheetRef}
        className={`ngw-bottom-sheet${isOpen ? ' ngw-bottom-sheet--open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId || undefined}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="ngw-bottom-sheet__handle-bar" aria-hidden="true" />
        <button
          className="ngw-bottom-sheet__close"
          onClick={() => onDismiss('close_button')}
          type="button"
          aria-label="Close"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
        <div className="ngw-bottom-sheet__inner">
          {children}
        </div>
      </div>
    </>
  );
}
