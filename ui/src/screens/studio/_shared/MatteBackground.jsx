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
  const m = 0.35; // perceptible surface treatment — warm ambient + specular give the machined metal feel

  // Layer 1 — cool ambient key wash (10 stops for smooth fade)
  const a = subdued ? 0.022 * m : 0.028 * m;
  const ambientWash = `radial-gradient(ellipse 75% 55% at 50% 22%, rgba(120,148,175,${a.toFixed(4)}) 0%, rgba(120,148,175,${(a*0.90).toFixed(4)}) 8%, rgba(120,148,175,${(a*0.75).toFixed(4)}) 16%, rgba(120,148,175,${(a*0.58).toFixed(4)}) 24%, rgba(125,153,180,${(a*0.42).toFixed(4)}) 32%, rgba(132,158,184,${(a*0.28).toFixed(4)}) 40%, rgba(132,158,184,${(a*0.18).toFixed(4)}) 48%, rgba(132,158,184,${(a*0.10).toFixed(4)}) 56%, rgba(132,158,184,${(a*0.04).toFixed(4)}) 64%, transparent 72%)`;

  // Layer 2 — warm mid-frame lift (8 stops)
  const w = subdued ? 0.008 * m : 0.010 * m;
  const warmLift = `radial-gradient(ellipse 55% 38% at 50% 58%, rgba(180,150,110,${w.toFixed(4)}) 0%, rgba(180,150,110,${(w*0.80).toFixed(4)}) 12%, rgba(180,150,110,${(w*0.55).toFixed(4)}) 25%, rgba(180,150,110,${(w*0.35).toFixed(4)}) 36%, rgba(180,150,110,${(w*0.20).toFixed(4)}) 45%, rgba(180,150,110,${(w*0.10).toFixed(4)}) 52%, rgba(180,150,110,${(w*0.04).toFixed(4)}) 58%, transparent 65%)`;

  // Layer 3 — edge vignette — 20 stops for imperceptible transition
  const va = 0.08;
  const vignette = `radial-gradient(ellipse 160% 130% at 50% 50%, transparent 25%, rgba(0,0,0,${(va*0.003).toFixed(5)}) 30%, rgba(0,0,0,${(va*0.006).toFixed(5)}) 34%, rgba(0,0,0,${(va*0.01).toFixed(5)}) 38%, rgba(0,0,0,${(va*0.016).toFixed(5)}) 42%, rgba(0,0,0,${(va*0.024).toFixed(5)}) 46%, rgba(0,0,0,${(va*0.035).toFixed(5)}) 50%, rgba(0,0,0,${(va*0.05).toFixed(5)}) 54%, rgba(0,0,0,${(va*0.07).toFixed(5)}) 58%, rgba(0,0,0,${(va*0.095).toFixed(5)}) 62%, rgba(0,0,0,${(va*0.13).toFixed(5)}) 66%, rgba(0,0,0,${(va*0.17).toFixed(5)}) 70%, rgba(0,0,0,${(va*0.22).toFixed(5)}) 74%, rgba(0,0,0,${(va*0.30).toFixed(5)}) 78%, rgba(0,0,0,${(va*0.40).toFixed(5)}) 82%, rgba(0,0,0,${(va*0.52).toFixed(5)}) 86%, rgba(0,0,0,${(va*0.66).toFixed(5)}) 90%, rgba(0,0,0,${(va*0.82).toFixed(5)}) 94%, rgba(0,0,0,${(va*0.94).toFixed(5)}) 97%, rgba(0,0,0,${va}) 100%)`;

  // Layer 4 — top specular edge (141.71° key light catch)
  // Layer 4 — top specular edge (10 stops)
  const s = subdued ? 0.035 * m : 0.06 * m;
  const specularEdge = `linear-gradient(141.71deg, rgba(255,255,255,${s.toFixed(4)}) 0%, rgba(255,255,255,${(s*0.85).toFixed(4)}) 8%, rgba(255,255,255,${(s*0.68).toFixed(4)}) 16%, rgba(255,255,255,${(s*0.50).toFixed(4)}) 24%, rgba(255,255,255,${(s*0.36).toFixed(4)}) 32%, rgba(255,255,255,${(s*0.24).toFixed(4)}) 40%, rgba(255,255,255,${(s*0.14).toFixed(4)}) 50%, rgba(255,255,255,${(s*0.07).toFixed(4)}) 60%, rgba(255,255,255,${(s*0.02).toFixed(4)}) 70%, transparent 80%)`;

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
      {/* Anti-banding: 3 dither layers at different frequencies.
          Uses soft-light blend to add variation without brightening.
          Different tile sizes prevent moire patterns. */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: grainUrl, backgroundSize: '200px 200px',
        opacity: 0.06, mixBlendMode: 'soft-light',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: grainUrl, backgroundSize: '64px 64px',
        opacity: 0.04, mixBlendMode: 'soft-light',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: grainUrl, backgroundSize: '128px 128px',
        opacity: 0.03, mixBlendMode: 'multiply',
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
      {/* Tactile grain — desktop only, very subtle */}
      {isWide && (
        <div style={{
          position: 'absolute', inset: 0,
          opacity: 0.02, mixBlendMode: 'soft-light',
          backgroundImage: grainUrl, backgroundSize: '256px 256px',
        }} />
      )}
    </div>
  );
}
