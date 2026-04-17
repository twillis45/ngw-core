/**
 * MatteBackground — 5-layer matte metal surface treatment
 *
 * Shared across HomeScreen, ProcessingScreen, ResultScreen (and any future
 * studio screens that need the carbon-black studio backdrop).
 *
 * Layers:
 *  1. Cool ambient key wash — soft overhead studio light
 *  2. Warm mid-frame lift — breaks up pure black core
 *  3. Edge vignette — anchors the frame
 *  4. Top specular edge — ceiling light hit
 *  5. Grain — tactile metal texture
 *
 * @param {'default'|'subdued'} [variant='default']
 *   - 'default'  — HomeScreen / ProcessingScreen intensities
 *   - 'subdued'  — ResultScreen (slightly dimmer wash + specular so the
 *                   result content owns visual hierarchy)
 */
export default function MatteBackground({ variant = 'default' }) {
  const subdued = variant === 'subdued';

  // Layer 1 — cool ambient key wash
  const ambientWash = subdued
    ? 'radial-gradient(ellipse 75% 55% at 50% 22%, rgba(120,148,175,0.022) 0%, rgba(132, 158, 184,0.008) 40%, transparent 72%)'
    : 'radial-gradient(ellipse 75% 55% at 50% 22%, rgba(120,148,175,0.028) 0%, rgba(132, 158, 184,0.010) 40%, transparent 72%)';

  // Layer 2 — warm mid-frame lift
  const warmLift = subdued
    ? 'radial-gradient(ellipse 55% 38% at 50% 58%, rgba(180,150,110,0.008) 0%, transparent 65%)'
    : 'radial-gradient(ellipse 55% 38% at 50% 58%, rgba(180,150,110,0.010) 0%, transparent 65%)';

  // Layer 3 — edge vignette (identical across variants)
  const vignette = 'radial-gradient(ellipse 118% 88% at 50% 50%, transparent 52%, rgba(0,0,0,0.45) 100%)';

  // Layer 4 — top specular edge
  const specularEdge = subdued
    ? 'linear-gradient(141.71deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.018) 40%, transparent 80%)'
    : 'linear-gradient(141.71deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.03) 40%, transparent 80%)';

  // Layer 5 — grain SVG (identical across variants)
  const grainUrl = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.32' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
      {/* Cool ambient key wash — soft overhead studio light */}
      <div style={{ position: 'absolute', inset: 0, background: ambientWash }} />
      {/* Warm mid-frame lift — breaks up pure black core */}
      <div style={{ position: 'absolute', inset: 0, background: warmLift }} />
      {/* Edge vignette — anchors the frame */}
      <div style={{ position: 'absolute', inset: 0, background: vignette }} />
      {/* Top specular edge — ceiling light hit */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: specularEdge }} />
      {/* Grain removed — per feedback: grain only on app background,
          never on panels/cards/overlays. Since MatteBackground renders
          at position:fixed under all content, its grain bleeds through
          glass panels and viewfinders. Removed to keep VFs clean. */}
    </div>
  );
}
