/**
 * signals.js — Shared confidence and signal-strength thresholds.
 *
 * Single source of truth for all score → label mappings used across
 * LookSummaryCard, SignalQualityCard, and any other consumer.
 */

// ── Confidence (reliability score 0–1) ───────────────────────────────────────

export const CONFIDENCE_THRESHOLDS = {
  HIGH:     0.75,   // ≥ HIGH → "High confidence"
  MODERATE: 0.50,   // ≥ MODERATE → "Moderate confidence"
  // < MODERATE → "Low confidence"
};

/**
 * Map a 0–1 reliability score to 'high' | 'moderate' | 'low'.
 */
export function confidenceLevel(score) {
  if (score >= CONFIDENCE_THRESHOLDS.HIGH)     return 'high';
  if (score >= CONFIDENCE_THRESHOLDS.MODERATE) return 'moderate';
  return 'low';
}

export const CONFIDENCE_LABELS = {
  high:     'High confidence',
  moderate: 'Moderate confidence',
  low:      'Low confidence',
};

export const CONFIDENCE_CSS = {
  high:     'strong',
  moderate: 'moderate',
  low:      'low',
};

// ── Signal strength (overallSignalStrength 0–1) ───────────────────────────────

export const SIGNAL_THRESHOLDS = {
  STRONG:   0.65,   // ≥ STRONG → "Strong"
  MODERATE: 0.40,   // ≥ MODERATE → "Moderate"
  // < MODERATE → "Weak"
};

/**
 * Map a 0–1 signal strength score to 'strong' | 'moderate' | 'weak'.
 */
export function signalStrength(score) {
  if (score >= SIGNAL_THRESHOLDS.STRONG)   return 'strong';
  if (score >= SIGNAL_THRESHOLDS.MODERATE) return 'moderate';
  return 'weak';
}

// ── Pattern source labels ─────────────────────────────────────────────────────

const SOURCE_LABELS = {
  reference_read:      'Reference image',
  lighting_inference:  'Scene analysis',
  vlm_reconstruction:  'Visual model',
  recipe:              'Recipe',
  solver:              'Multi-signal solver',
  benchmark:           'Benchmark',
};

/**
 * Return a human-readable label for authoritative_pattern_source strings.
 * Falls back to a title-cased version of the raw value.
 */
export function patternSourceLabel(source) {
  if (!source || source === 'none' || source === 'unknown') return null;
  // Handle specialty: prefixes like "specialty:reference_read"
  const base = source.startsWith('specialty:') ? source.split(':')[1] : source;
  return SOURCE_LABELS[base] || base.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
