/**
 * FitToViewport — uniform scale wrapper for Studio Matte screens.
 *
 * Each Studio Matte screen is authored at a fixed design width (430 for the
 * mobile-authored Home/Processing, 1180 for the desktop-adapted Setup/Result).
 * On viewports larger than the design size we want the whole composition —
 * diagrams, components, text — to scale up together so it fills the screen
 * instead of floating as a small island. On viewports smaller than the
 * design we want the normal mobile behavior (no scaling).
 *
 * Implementation: wrap children in an inner box at exact designWidth, apply
 * a CSS transform: scale(N) centered via transform-origin. All internal
 * layout, absolute positioning, and pixel math stays untouched.
 *
 * Scale math:
 *   scaleX = viewportW / designWidth
 *   scaleY = designHeight ? viewportH / designHeight : Infinity
 *   scale  = clamp(minScale, maxScale, min(scaleX, scaleY) * tightness)
 *
 * The inner box uses width=designWidth and minHeight=100vh/scale so the
 * screen always fills the viewport and scrolls naturally for taller content.
 */
import { useEffect, useState } from 'react';
import { C } from '../../../theme/studioMatte';

export default function FitToViewport({
  designWidth,
  designHeight,        // optional — if set, scale also constrained by vh
  minScale = 1,
  maxScale = 1.8,
  tightness = 0.96,    // leave ~4% breathing room
  fitMode = 'both',    // 'both' = aspect-preserving contain; 'width' = fill
                       // horizontally and let content scroll vertically
  children,
  background = C.bg,
}) {
  const [vp, setVp] = useState(() => ({
    w: typeof window === 'undefined' ? designWidth : window.innerWidth,
    h: typeof window === 'undefined' ? 900 : window.innerHeight,
  }));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const scaleX = vp.w / designWidth;
  const scaleY = designHeight ? vp.h / designHeight : Infinity;
  // 'both' = aspect-preserving contain (smaller of X and Y).
  // 'width' = fill horizontally. Content may be taller than the viewport,
  //           which the outer overflow:auto container handles via scroll.
  const raw = (fitMode === 'width' ? scaleX : Math.min(scaleX, scaleY)) * tightness;
  const scale = Math.max(minScale, Math.min(maxScale, raw));

  // When viewport matches design width exactly, skip the transform.
  // Children with `position: fixed; inset: 0` still need the ambient
  // viewport containing block, which only exists when we don't transform.
  if (scale === 1 && vp.w <= designWidth + 8) {
    return <>{children}</>;
  }

  // Inner box has an explicit designWidth × designHeight so that
  // `position: fixed; inset: 0` children (common across Studio Matte
  // screens) get a sized containing block when the transform creates a
  // new containing context. Without an explicit height the fixed child
  // collapses to 0×0.
  //
  // In 'both' mode the box is absolutely centered and the transform
  // scales around its center. In 'width' mode we anchor at top and
  // scale from top-center so taller-than-viewport content can scroll
  // down naturally in the outer container.
  const innerH = designHeight || Math.round(vp.h / scale);
  if (fitMode === 'width') {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        overflow: 'auto',
        background,
      }}>
        <div style={{
          width: designWidth,
          height: innerH,
          margin: '0 auto',
          transform: `scale(${scale})`,
          transformOrigin: 'top center',
        }}>
          {children}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      overflow: 'auto',
      background,
    }}>
      <div style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: designWidth,
        height: innerH,
        transform: `translate(-50%, -50%) scale(${scale})`,
        transformOrigin: 'center center',
      }}>
        {children}
      </div>
    </div>
  );
}
