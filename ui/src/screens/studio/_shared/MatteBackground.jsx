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
  // Desktop detection — boost surface treatment so texture reads on 27" monitors.
  // On mobile (< 1024px) the subtle opacities are perceptible on OLED; on desktop
  // they vanish into pure black. Desktop multiplier lifts all layers ~2× while
  // keeping the same relative hierarchy.
  const isWide = typeof window !== 'undefined' && window.innerWidth >= 1024;
  const m = isWide ? 1.8 : 1; // desktop intensity multiplier (was 2.2 — too bright)

  // Layer 1 — cool ambient key wash
  const ambientWash = subdued
    ? `radial-gradient(ellipse 75% 55% at 50% 22%, rgba(120,148,175,${(0.022 * m).toFixed(3)}) 0%, rgba(132,158,184,${(0.008 * m).toFixed(3)}) 40%, transparent 72%)`
    : `radial-gradient(ellipse 75% 55% at 50% 22%, rgba(120,148,175,${(0.028 * m).toFixed(3)}) 0%, rgba(132,158,184,${(0.010 * m).toFixed(3)}) 40%, transparent 72%)`;

  // Layer 2 — warm mid-frame lift
  const warmLift = subdued
    ? `radial-gradient(ellipse 55% 38% at 50% 58%, rgba(180,150,110,${(0.008 * m).toFixed(3)}) 0%, transparent 65%)`
    : `radial-gradient(ellipse 55% 38% at 50% 58%, rgba(180,150,110,${(0.010 * m).toFixed(3)}) 0%, transparent 65%)`;

  // Layer 3 — edge vignette — ultra-wide ellipse pushes edges off-screen.
  // 12 stops for imperceptible transition. No visible oval.
  const va = isWide ? 0.45 : 0.35;
  const vignette = `radial-gradient(ellipse 160% 130% at 50% 50%, transparent 30%, rgba(0,0,0,${(va * 0.01).toFixed(4)}) 38%, rgba(0,0,0,${(va * 0.03).toFixed(4)}) 44%, rgba(0,0,0,${(va * 0.06).toFixed(4)}) 50%, rgba(0,0,0,${(va * 0.10).toFixed(4)}) 56%, rgba(0,0,0,${(va * 0.16).toFixed(4)}) 62%, rgba(0,0,0,${(va * 0.24).toFixed(4)}) 68%, rgba(0,0,0,${(va * 0.35).toFixed(4)}) 74%, rgba(0,0,0,${(va * 0.50).toFixed(4)}) 80%, rgba(0,0,0,${(va * 0.68).toFixed(4)}) 86%, rgba(0,0,0,${(va * 0.85).toFixed(4)}) 93%, rgba(0,0,0,${va}) 100%)`;

  // Layer 4 — top specular edge (141.71° key light catch)
  const specularEdge = subdued
    ? `linear-gradient(141.71deg, rgba(255,255,255,${(0.035 * m).toFixed(3)}) 0%, rgba(255,255,255,${(0.018 * m).toFixed(3)}) 40%, transparent 80%)`
    : `linear-gradient(141.71deg, rgba(255,255,255,${(0.06 * m).toFixed(3)}) 0%, rgba(255,255,255,${(0.03 * m).toFixed(3)}) 40%, transparent 80%)`;

  // Layer 5 — grain texture on app body (desktop only — gives the matte surface
  // its characteristic tactile metal feel. NOT on panels/cards/VFs — only the body.)
  const grainUrl = `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.32' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
      {/* Cool ambient key wash — soft overhead studio light */}
      <div style={{ position: 'absolute', inset: 0, background: ambientWash }} />
      {/* Warm mid-frame lift — breaks up pure black core */}
      <div style={{ position: 'absolute', inset: 0, background: warmLift }} />
      {/* Edge vignette — anchors the frame */}
      <div style={{ position: 'absolute', inset: 0, background: vignette }} />
      {/* Anti-banding dither — full surface noise at low opacity.
          On desktop 8-bit displays, dark gradient transitions create visible
          color steps. This noise layer adds per-pixel variation that breaks
          up the quantization. Covers entire surface (not just edges) because
          banding appears wherever gradients exist. */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: grainUrl, backgroundSize: isWide ? '96px 96px' : '128px 128px',
        opacity: isWide ? 0.28 : 0.15,
        mixBlendMode: 'overlay',
        pointerEvents: 'none',
      }} />
      {/* Top specular edge — ceiling light hit at 141.71° */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: isWide ? 2 : 1, background: specularEdge }} />
      {/* Layer 5 — grain: desktop only, on body surface, never on VFs/panels.
          The grain gives the matte body its characteristic brushed-metal feel
          that Profoto/Hasselblad surfaces have. On mobile the phone pixel density
          already provides texture; on desktop monitors the surface is flat without it. */}
      {/* Dither noise — breaks gradient banding on 8-bit displays.
          Fine-grained noise at low opacity overlaid on the gradients adds
          enough per-pixel variation to eliminate visible color steps.
          Uses 'overlay' blend at very low opacity so it adds both light
          and dark noise without shifting the overall tone. */}
      <div style={{
        position: 'absolute', inset: 0,
        opacity: isWide ? 0.20 : 0.10,
        mixBlendMode: 'overlay',
        backgroundImage: grainUrl, backgroundSize: '64px 64px',
        pointerEvents: 'none',
      }} />
      {/* Tactile grain — desktop body texture (Profoto/Hasselblad surface feel) */}
      {isWide && (
        <div style={{
          position: 'absolute', inset: 0,
          opacity: 0.10, mixBlendMode: 'multiply',
          backgroundImage: grainUrl, backgroundSize: '128px 128px',
        }} />
      )}
    </div>
  );
}
