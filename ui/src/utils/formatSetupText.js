/**
 * formatSetupText — plain-text lighting brief for clipboard / share sheet.
 *
 * Produces a compact, textable spec a photographer can send to an assistant
 * or paste into a call sheet.  Works with the saved result shape (same object
 * stored by setupStore and returned by the analysis API).
 *
 * Output example:
 *   Rembrandt · 87% Confident
 *   Geometry: Loop shadow
 *
 *   Key: Upper-left · Large softbox
 *   Fill: Camera-right
 *
 *   Camera: f/8 · 1/250s · ISO 100 · Canon EOS R5
 *
 *   — NGW
 */
import prettify from './prettify';

function compact(arr) {
  return arr.filter(Boolean).join(' · ');
}

export function formatSetupText(result) {
  if (!result) return '';
  const lines = [];
  const sections = result.sections || {};

  // ── Headline ──────────────────────────────────────────────────────────────
  const pattern = result.pattern || result.authoritative_pattern || 'Unknown Setup';
  const confidence = Math.round(result.confidence ?? result.match_confidence ?? 0);
  const confLabel = confidence >= 80 ? 'Confident' : confidence >= 60 ? 'Tentative' : 'Uncertain';
  lines.push(`${prettify(pattern, { title: true })} · ${confidence}% ${confLabel}`);

  const geo = result.geometric_base;
  if (geo) lines.push(`Geometry: ${prettify(geo, { title: true })} shadow`);

  // ── Per-light breakdown ───────────────────────────────────────────────────
  const lights = result._raw?.diagram_spec?.lights || result._raw?.reconstruction?.lights || [];
  if (lights.length > 0) {
    lines.push('');
    lights.forEach(light => {
      const role = prettify(light.role || 'Light', { title: true });
      const detail = compact([
        light.position_label || light.position,
        light.modifier_label || light.modifier,
        light.power_stop ? `Guide ${light.power_stop}` : null,
      ]);
      lines.push(`${role}: ${detail || '—'}`);
    });
  } else {
    // Fallback — modifier data when diagram lights aren't populated
    const mod = sections.modifier;
    if (mod?.family) {
      lines.push('');
      lines.push(`Key modifier: ${compact([mod.sizeLabel, mod.family])}`);
      if (mod.position) lines.push(`Key position: ${mod.position}`);
    }
    if (sections.catchlightModifier && !mod?.family) {
      lines.push('');
      lines.push(`Modifier: ${sections.catchlightModifier}`);
    }
  }

  // ── Camera settings ───────────────────────────────────────────────────────
  const cam = result.cameraSettings;
  if (cam) {
    const exposure = compact([cam.aperture, cam.shutter, cam.iso ? `ISO ${cam.iso}` : null]);
    if (exposure || cam.model) {
      lines.push('');
      if (exposure) lines.push(`Camera: ${compact([exposure, cam.model])}`);
    }
  }

  lines.push('');
  lines.push('— NGW');
  return lines.join('\n');
}
