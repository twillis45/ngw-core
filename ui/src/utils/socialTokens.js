/**
 * socialTokens.js — Design token source of truth for social card exports.
 *
 * Mirrored in Figma: file YQgGd8KZyZoXzZwJV7p4b6, collection "Social Card Tokens".
 * When colors change here, update the Figma Variables collection to match.
 * When colors change in Figma, update this file.
 */
export const TOKENS = {
  role: {
    key:  '#d4a054',  // Warm amber — key light / strobe / tungsten warmth
    fill: '#7da3c8',  // Steel blue — fill light quality
    rim:  '#48ba88',  // Green — rim / hair / kicker / separation
    bg:   '#d47240',  // Orange — background light / scene depth
  },
  confidence: {
    high: '#48ba88',                 // ≥75% — green (cool; positive signal)
    mid:  'rgba(132,158,184,0.90)', // ≥50% — steel 90% (Studio Matte; no warm amber)
    low:  'rgba(132,158,184,0.50)', // <50% — dim steel 50% (calibrated uncertainty)
    // Studio Matte doctrine: warm amber/gold is NOT a confidence hierarchy accent.
    // Warm tones are reserved for semantic roles only: key-light identity and Kelvin/color-temperature.
  },
  surface: {
    base:     '#09090b',  // Card background
    elevated: '#111218',  // Surface panels
    premium:  '#191b24',  // Diagram zones, inset surfaces
  },
  text: {
    primary: '#f8f9fc',  // White text (used at 0.96 opacity in canvas)
    steel:   '#849eb8',  // Steel blue — labels, brand, micro text
  },
};
