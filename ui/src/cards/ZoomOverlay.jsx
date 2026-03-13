import { useEffect } from 'react';

/**
 * Full-screen zoom overlay for images and diagrams.
 * Tap backdrop or press Escape to dismiss.
 */
export default function ZoomOverlay({ src, alt, onClose }) {
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  if (!src) return null;

  return (
    <div className="zoom-overlay" onClick={onClose}>
      <button className="zoom-overlay__close" aria-label="Close" type="button">{'\u2715'}</button>
      <img
        src={src}
        alt={alt || ''}
        className="zoom-overlay__img"
        onClick={e => e.stopPropagation()}
      />
    </div>
  );
}
