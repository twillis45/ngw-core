/**
 * ZoomableHeroOverlay — fullscreen pinch/pan zoom modal for hero photos.
 *
 * Mounts as a fixed-position overlay covering the viewport.  Tap to exit.
 * Pinch with two fingers to zoom (1×–5×).  Drag with one finger to pan.
 *
 * Designed to be wrapped by any screen that wants long-press → zoom on a
 * hero image (ResultScreen, Day1ShootScreen).  The trigger logic — long
 * press detection, opening the overlay — lives in the parent screen.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { tapHaptic } from '../../../../utils/haptics';

export default function ZoomableHeroOverlay({ src, isOpen, onClose }) {
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const pinchStartDist = useRef(null);
  const pinchStartScale = useRef(1);
  const panStart = useRef(null);
  const panStartOffset = useRef({ x: 0, y: 0 });
  const tapCandidate = useRef(false);
  const tapStart = useRef({ x: 0, y: 0, t: 0 });

  // Reset zoom state every time the overlay opens.
  useEffect(() => {
    if (isOpen) {
      setScale(1);
      setPan({ x: 0, y: 0 });
      pinchStartDist.current = null;
      panStart.current = null;
    }
  }, [isOpen]);

  const handleTouchStart = useCallback((e) => {
    e.stopPropagation();
    if (e.touches.length === 2) {
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      pinchStartDist.current = Math.hypot(dx, dy);
      pinchStartScale.current = scale;
      panStart.current = null;
      tapCandidate.current = false;
    } else if (e.touches.length === 1) {
      panStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      panStartOffset.current = { ...pan };
      tapCandidate.current = true;
      tapStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() };
    }
  }, [scale, pan]);

  const handleTouchMove = useCallback((e) => {
    e.stopPropagation();
    if (e.touches.length === 2 && pinchStartDist.current) {
      const dx = e.touches[1].clientX - e.touches[0].clientX;
      const dy = e.touches[1].clientY - e.touches[0].clientY;
      const dist = Math.hypot(dx, dy);
      const newScale = Math.min(5, Math.max(1, pinchStartScale.current * (dist / pinchStartDist.current)));
      setScale(newScale);
      tapCandidate.current = false;
    } else if (e.touches.length === 1 && panStart.current) {
      const dx = e.touches[0].clientX - panStart.current.x;
      const dy = e.touches[0].clientY - panStart.current.y;
      setPan({ x: panStartOffset.current.x + dx, y: panStartOffset.current.y + dy });
      if (tapCandidate.current && Math.hypot(dx, dy) > 8) {
        tapCandidate.current = false;
      }
    }
  }, []);

  const handleTouchEnd = useCallback((e) => {
    e.stopPropagation();
    const wasTap = tapCandidate.current && (Date.now() - tapStart.current.t) < 300;
    if (e.touches.length < 2) pinchStartDist.current = null;
    if (e.touches.length === 0) panStart.current = null;
    setScale((s) => Math.max(1, s));
    tapCandidate.current = false;
    if (wasTap && e.touches.length === 0) {
      if (e.cancelable) e.preventDefault();
      tapHaptic();
      onClose?.();
    }
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClick={(e) => {
        // Desktop: click anywhere on the overlay exits.
        e.stopPropagation();
        tapHaptic();
        onClose?.();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        backgroundColor: '#000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'grab',
        touchAction: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <img
        src={src}
        alt="Hero zoom"
        style={{
          maxWidth: '100%',
          maxHeight: '100%',
          objectFit: 'contain',
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
          transformOrigin: 'center center',
          willChange: 'transform',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          pointerEvents: 'none',
        }}
        draggable={false}
      />
    </div>
  );
}
