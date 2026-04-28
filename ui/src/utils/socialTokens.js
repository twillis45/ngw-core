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
    high: '#48ba88',  // ≥75% — green glow
    mid:  '#f0bc44',  // ≥50% — amber
    low:  '#e08c38',  // <50% — warm orange floor (never muted gray)
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
