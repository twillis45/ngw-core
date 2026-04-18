/**
 * prettify — Display-string normalizer for engine keys.
 *
 * Engine keys like "soft_key_dominant" or "split-complementary" must never
 * leak into the UI as-is — Studio Matte rules forbid underscores/hyphens
 * in visible text. `prettify` swaps them for spaces and (optionally)
 * uppercases or title-cases the result so chip pills, labels, and headings
 * read as clean display copy.
 *
 * Single canonical location — imported by ProcessingScreen, ResultScreen,
 * and anywhere else engine strings need humanizing.
 */

const SMALLS = new Set([
  'a','an','the','of','in','with','on','to','by',
  'and','but','or','for','from','at','as',
]);

export default function prettify(str, { upper = false, title = false } = {}) {
  if (str == null) return '';
  // Replace underscores with spaces but preserve hyphens — they appear
  // in numeric ranges ("3-4x"), compound terms ("camera-right"), and
  // ratio notation that should stay intact for photographers.
  const cleaned = String(str).replace(/_+/g, ' ').trim();
  if (upper) return cleaned.toUpperCase();
  if (title) {
    return cleaned.split(/\s+/).map((w, i) => {
      if (i > 0 && SMALLS.has(w.toLowerCase())) return w.toLowerCase();
      if (/^[A-Z0-9]{2,}$/.test(w)) return w; // keep abbreviations
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    }).join(' ');
  }
  return cleaned;
}
