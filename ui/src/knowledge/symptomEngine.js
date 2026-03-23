/**
 * NGW Symptom Engine
 *
 * Dynamically generates a ranked symptom list from analysis signals.
 * No hardcoded symptom lists per result — symptoms are computed from signal state.
 *
 * Input:  Analysis signals from the API response
 * Output: Ordered array of SymptomEntry objects, most likely first
 *
 * Signal sources:
 *   edgeCaseFlags   — string[] from EdgeCaseFlags dataclass
 *   ambiguityFlags  — string[] from SignalReliability / PatternCandidates
 *   reliabilityScore — 0.0–1.0 from SignalReliability
 *   confidence       — 0.0–1.0 top pattern confidence
 *   detectedPattern  — string slug of the top match
 *   signalStrength   — 0.0–1.0 overall signal quality
 */

import { SYMPTOMS } from './symptoms';

// ── Confidence Thresholds ─────────────────────────────────────────────────────

const CONFIDENCE_LOW     = 0.55;  // Below this → ambiguous-pattern likely
const RELIABILITY_LOW    = 0.40;  // Below this → unclear-setup likely
const SIGNAL_WEAK        = 0.45;  // Below this → unclear-setup candidate
const MAX_SYMPTOMS       = 4;     // Never return more than 4 symptoms

// ── Signal → Symptom Map ──────────────────────────────────────────────────────
//
// Each entry: { symptomId, priority (1=highest), test: fn(signals) → bool }
// Evaluated in order; first N that pass become the symptom list.

const SIGNAL_RULES = [

  // ── Critical / blocking issues (priority 1) ──────────────────────────────

  {
    symptomId: 'unclear-setup',
    priority: 1,
    test: ({ reliabilityScore, signalStrength, edgeCaseFlags }) =>
      (reliabilityScore != null && reliabilityScore < RELIABILITY_LOW) ||
      (signalStrength   != null && signalStrength   < SIGNAL_WEAK)    ||
      edgeCaseFlags.includes('no_face')                               ||
      edgeCaseFlags.includes('extreme_angle')                         ||
      edgeCaseFlags.includes('low_resolution'),
  },

  // ── Overexposure / technical issues (priority 2) ─────────────────────────

  {
    symptomId: 'blown-highlights',
    priority: 2,
    test: ({ edgeCaseFlags }) =>
      edgeCaseFlags.includes('blown_highlights') ||
      edgeCaseFlags.includes('overexposure'),
  },

  {
    symptomId: 'mixed-temperature',
    priority: 2,
    test: ({ edgeCaseFlags }) =>
      edgeCaseFlags.includes('mixed_temperature') ||
      edgeCaseFlags.includes('color_cast')        ||
      edgeCaseFlags.includes('cct_mismatch'),
  },

  // ── Pattern confidence issues (priority 3) ───────────────────────────────

  {
    symptomId: 'ambiguous-pattern',
    priority: 3,
    test: ({ confidence, ambiguityFlags }) =>
      (confidence != null && confidence < CONFIDENCE_LOW) ||
      ambiguityFlags.includes('multiple_patterns')        ||
      ambiguityFlags.includes('low_confidence'),
  },

  // ── Pattern-specific symptoms (priority 4) ───────────────────────────────
  // Only fire when the detected pattern makes them relevant

  {
    symptomId: 'no-triangle',
    priority: 4,
    test: ({ detectedPattern, ambiguityFlags, edgeCaseFlags, dominantFailureMode }) =>
      detectedPattern === 'rembrandt' &&
      (ambiguityFlags.includes('rembrandt_no_triangle')       ||
       edgeCaseFlags.includes('missing_cheek_triangle')       ||
       // From Python knowledge base — SymptomEntry 'rembrandt_triangle_missed'
       edgeCaseFlags.includes('rembrandt_triangle_missed')    ||
       dominantFailureMode === 'rembrandt_triangle_missed'),
  },

  // Clamshell second-source (chin fill) not detected — surfaces as missing catchlight
  {
    symptomId: 'no-catchlight',
    priority: 4,
    test: ({ detectedPattern, edgeCaseFlags, dominantFailureMode }) =>
      detectedPattern === 'clamshell' &&
      (edgeCaseFlags.includes('clamshell_fill_undetected') ||
       edgeCaseFlags.includes('chin_fill_missing')         ||
       dominantFailureMode === 'clamshell_fill_undetected'),
  },

  // Loop misclassified as Rembrandt — surfaces as ambiguous pattern
  {
    symptomId: 'ambiguous-pattern',
    priority: 4,
    test: ({ detectedPattern, ambiguityFlags, dominantFailureMode }) =>
      detectedPattern === 'loop' &&
      (ambiguityFlags.includes('loop_misclassified_rembrandt') ||
       dominantFailureMode === 'loop_misclassified_rembrandt'),
  },

  // ── Shadow / dimension issues (priority 5) ──────────────────────────────

  {
    symptomId: 'too-flat',
    priority: 5,
    test: ({ edgeCaseFlags, ambiguityFlags, detectedPattern }) =>
      edgeCaseFlags.includes('flat_face_detected') ||
      edgeCaseFlags.includes('low_ratio')          ||
      edgeCaseFlags.includes('on_axis_key')        ||
      // If detected as flat but the user may not have intended flat
      (detectedPattern === 'flat' && ambiguityFlags.includes('possible_intent_mismatch')),
  },

  {
    symptomId: 'shadow-too-strong',
    priority: 5,
    test: ({ edgeCaseFlags }) =>
      edgeCaseFlags.includes('deep_shadow') ||
      edgeCaseFlags.includes('high_ratio_excessive'),
  },

  {
    symptomId: 'too-dramatic',
    priority: 5,
    test: ({ edgeCaseFlags, detectedPattern }) =>
      edgeCaseFlags.includes('high_ratio') &&
      ['rembrandt', 'split'].includes(detectedPattern),
  },

  // ── Lighting quality issues (priority 6) ────────────────────────────────

  {
    symptomId: 'too-harsh',
    priority: 6,
    test: ({ edgeCaseFlags }) =>
      edgeCaseFlags.includes('hard_edge_detected') ||
      edgeCaseFlags.includes('high_contrast')      ||
      edgeCaseFlags.includes('small_modifier'),
  },

  {
    symptomId: 'no-catchlight',
    priority: 6,
    test: ({ edgeCaseFlags }) =>
      edgeCaseFlags.includes('no_catchlight_detected') ||
      edgeCaseFlags.includes('flat_eyes'),
  },
];

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * generateSymptoms
 *
 * @param {object} signals
 * @param {string[]} signals.edgeCaseFlags   — flags from EdgeCaseFlags dataclass
 * @param {string[]} signals.ambiguityFlags  — flags from PatternCandidates / SignalReliability
 * @param {number}   signals.reliabilityScore — 0.0–1.0
 * @param {number}   signals.confidence       — 0.0–1.0 top match confidence
 * @param {string}   signals.detectedPattern  — top pattern slug
 * @param {number}   signals.signalStrength   — 0.0–1.0
 * @param {object}   symptoms                — SYMPTOMS map (injected for testability)
 *
 * @returns {SymptomEntry[]} ordered list of matching symptoms, most critical first
 */
export function generateSymptoms(signals, symptoms = SYMPTOMS) {
  const normalized = normalizeSignals(signals);

  const matches = SIGNAL_RULES
    .filter(rule => {
      try { return rule.test(normalized); }
      catch { return false; }
    })
    .sort((a, b) => a.priority - b.priority)
    .slice(0, MAX_SYMPTOMS)
    .map(rule => symptoms[rule.symptomId])
    .filter(Boolean);

  return matches;
}

/**
 * generateSymptomSlugs
 * Same as generateSymptoms but returns string slugs only.
 * Useful for the existing symptoms.js getSymptomsFromSignals signature.
 */
export function generateSymptomSlugs(signals) {
  return generateSymptoms(signals).map(s => s.slug);
}

/**
 * getSignalSummary
 * Returns a human-readable summary of active signal flags for the
 * confidence explainer component.
 *
 * @returns {{ strong: string[], uncertain: string[], blocked: string[] }}
 */
export function getSignalSummary(signals) {
  const normalized = normalizeSignals(signals);

  const strong    = [];
  const uncertain = [];
  const blocked   = [];

  const { edgeCaseFlags, ambiguityFlags, confidence, reliabilityScore } = normalized;

  // Strong positive signals
  if (confidence >= 0.80)             strong.push('High pattern confidence');
  if (reliabilityScore >= 0.70)       strong.push('Strong signal quality');
  if (!edgeCaseFlags.includes('no_catchlight_detected')) strong.push('Catchlight detected');
  if (!ambiguityFlags.includes('multiple_patterns'))     strong.push('Single dominant pattern');

  // Uncertain signals
  if (confidence >= CONFIDENCE_LOW && confidence < 0.80)
    uncertain.push('Moderate confidence — pattern visible but not definitive');
  if (reliabilityScore >= RELIABILITY_LOW && reliabilityScore < 0.70)
    uncertain.push('Signal quality is moderate — some diagnostic features unclear');
  if (edgeCaseFlags.includes('hard_edge_detected'))
    uncertain.push('Hard shadow edges detected — modifier may be small or bare');
  if (edgeCaseFlags.includes('mixed_temperature'))
    uncertain.push('Mixed color temperature detected — may affect signal accuracy');

  // Blocking signals
  if (edgeCaseFlags.includes('blown_highlights'))
    blocked.push('Blown highlights — exposure data lost in bright areas');
  if (edgeCaseFlags.includes('no_face'))
    blocked.push('No face detected — cannot classify without facial landmarks');
  if (edgeCaseFlags.includes('low_resolution'))
    blocked.push('Low resolution — shadow detail insufficient for classification');
  if (edgeCaseFlags.includes('extreme_angle'))
    blocked.push('Extreme face angle — diagnostic features obscured');
  if (ambiguityFlags.includes('multiple_patterns'))
    blocked.push('Multiple competing pattern signals present');

  return { strong, uncertain, blocked };
}

// ── Internal ──────────────────────────────────────────────────────────────────

function normalizeSignals(signals = {}) {
  return {
    edgeCaseFlags:       Array.isArray(signals.edgeCaseFlags)  ? signals.edgeCaseFlags  : [],
    ambiguityFlags:      Array.isArray(signals.ambiguityFlags) ? signals.ambiguityFlags : [],
    reliabilityScore:    signals.reliabilityScore    ?? 1.0,
    confidence:          signals.confidence          ?? 1.0,
    detectedPattern:     signals.detectedPattern     ?? '',
    signalStrength:      signals.signalStrength      ?? 1.0,
    // Backend-derived dominant failure mode from AggregatedInsight.
    // Passed through so knowledge-base symptoms can fire on server-side signals.
    dominantFailureMode: signals.dominantFailureMode ?? null,
  };
}

// ── Confidence Display ────────────────────────────────────────────────────────

/**
 * getConfidenceLevel
 * Maps a 0–1 confidence score to a display level with label and tone.
 */
export function getConfidenceLevel(confidence) {
  if (confidence >= 0.85) return { level: 'high',    label: 'High Confidence',    tone: 'success'  };
  if (confidence >= 0.65) return { level: 'medium',  label: 'Good Confidence',    tone: 'neutral'  };
  if (confidence >= 0.45) return { level: 'low',     label: 'Low Confidence',     tone: 'warning'  };
  return                           { level: 'unclear', label: 'Very Uncertain',    tone: 'error'    };
}

/**
 * shouldAutoExpandConfidence
 * Returns true if the confidence section should auto-open (low confidence case).
 */
export function shouldAutoExpandConfidence(confidence) {
  return confidence < CONFIDENCE_LOW;
}
