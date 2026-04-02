/**
 * NGW Knowledge System — Public API
 *
 * Single import point for all knowledge queries.
 * Powers: Results Screen, Symptom Engine, Fix Flow, Comparison System,
 *         Web SEO pages, PDF exports, ML pipelines.
 *
 * Usage:
 *   import { getPattern, getSymptomsFromSignals, buildFixFlow } from '../knowledge';
 *
 * ANTI-DUPLICATION: All content is defined once here. Never copy PatternEntry
 * or SymptomEntry data into component files — always query through this API.
 */

import { PATTERNS }                                              from './patterns';
import { SYMPTOMS }                                              from './symptoms';
import { buildGraph, getComparisonPairs }                        from './graph';
import { generateSymptoms, generateSymptomSlugs,
         getSignalSummary, getConfidenceLevel,
         shouldAutoExpandConfidence }                            from './symptomEngine';
import { buildFixFlow, getFixStepsForSymptom,
         getRelatedFixes, rankFixesByContext,
         buildFixFlowFromKnowledgeAPI }                          from './fixFlow';

// ── Graph (computed once, cached) ────────────────────────────────────────────

let _graph = null;
function graph() {
  if (!_graph) _graph = buildGraph(PATTERNS, SYMPTOMS);
  return _graph;
}

// ── Pattern API ───────────────────────────────────────────────────────────────

/**
 * Get a single pattern by slug.
 * @param {string} slug — pattern id/slug (e.g. 'rembrandt', 'loop')
 * @returns {PatternEntry | null}
 */
export function getPattern(slug) {
  return PATTERNS[slug] || null;
}

/**
 * Get all patterns as an ordered array.
 * Default order: starters first, then by category, then alphabetical.
 */
export function getAllPatterns() {
  return Object.values(PATTERNS).sort((a, b) => {
    if (a.metadata.starter !== b.metadata.starter) return a.metadata.starter ? -1 : 1;
    if (a.metadata.category !== b.metadata.category)
      return a.metadata.category.localeCompare(b.metadata.category);
    return a.name.localeCompare(b.name);
  });
}

/**
 * Get patterns that are commonly confused with or related to the given pattern.
 * Includes confusionWith entries + same-category patterns.
 */
export function getRelatedPatterns(patternId) {
  const ids = graph().patternToPatterns[patternId] || [];
  return ids.map(id => PATTERNS[id]).filter(Boolean);
}

/**
 * Get patterns listed in confusionWith for the given pattern.
 * These are the direct comparison candidates for the comparison prompt.
 */
export function getAlternativePatterns(patternId) {
  const pattern = PATTERNS[patternId];
  if (!pattern) return [];
  return (pattern.detection?.confusionWith || [])
    .map(id => PATTERNS[id])
    .filter(Boolean);
}

/**
 * Get structured comparison pairs between a pattern and its alternatives.
 * Used by ResultPatternComparePrompt.
 */
export function getPatternComparisons(patternId) {
  return getComparisonPairs(patternId, PATTERNS);
}

// ── Symptom API ───────────────────────────────────────────────────────────────

/**
 * Get a single symptom by slug.
 */
export function getSymptom(slug) {
  return SYMPTOMS[slug] || null;
}

/**
 * Get all symptoms relevant to a detected pattern.
 */
export function getSymptomsForPattern(patternId) {
  const ids = graph().patternToSymptoms[patternId] || [];
  return ids.map(id => SYMPTOMS[id]).filter(Boolean);
}

/**
 * Generate a ranked symptom list from analysis signals.
 *
 * This is the primary entry point for the Results Screen symptom section.
 *
 * @param {object} signals — from analysis API response:
 *   {
 *     edgeCaseFlags:   string[],   // e.g. ['blown_highlights', 'no_catchlight_detected']
 *     ambiguityFlags:  string[],   // e.g. ['multiple_patterns']
 *     reliabilityScore: number,    // 0.0–1.0
 *     confidence:       number,    // 0.0–1.0 top pattern confidence
 *     detectedPattern:  string,    // e.g. 'rembrandt'
 *     signalStrength:   number,    // 0.0–1.0
 *   }
 *
 * @returns {SymptomEntry[]} ordered by severity, most critical first
 */
export function getSymptomsFromSignals(signals) {
  return generateSymptoms(signals, SYMPTOMS);
}

/**
 * Returns slug strings only — drop-in replacement for legacy symptoms.js
 * getSymptomsFromSignals signature.
 */
export function getSymptomsFromSignalSlugs(signals) {
  return generateSymptomSlugs(signals);
}

// ── Fix API ───────────────────────────────────────────────────────────────────

/**
 * Get all fixes for a symptom as a structured fix flow.
 * Context-aware: pattern-relevant fixes are ranked first.
 *
 * @param {string} symptomId
 * @param {string} [patternId]
 * @returns {FixFlow | null}
 */
export function getFixFlow(symptomId, patternId = null) {
  return buildFixFlow(symptomId, patternId, SYMPTOMS, PATTERNS);
}

/**
 * Get a flat list of ordered fix steps for quick on-set reference.
 */
export function getFixSteps(symptomId, patternId = null) {
  return getFixStepsForSymptom(symptomId, patternId);
}

/**
 * getKnowledgeFixSteps
 *
 * Async — fetches FixStep[] from the Python knowledge base for a pattern
 * and returns them as FixCard[] objects ready for QuickFixesCard.
 *
 * Use this to enrich the static fix data with server-side knowledge.
 *
 * @param {string} patternId
 * @param {string} [apiBase]
 * @returns {Promise<FixCard[]>}
 */
export function getKnowledgeFixSteps(patternId, apiBase = '') {
  return buildFixFlowFromKnowledgeAPI(patternId, apiBase);
}

/**
 * Get fixes from related symptoms — secondary fix candidates.
 */
export function getRelatedFixSuggestions(symptomId) {
  return getRelatedFixes(symptomId, SYMPTOMS);
}

/**
 * Rank fixes across multiple active symptoms.
 * Used when showing a consolidated "all fixes" view.
 */
export function getRankedFixes(symptomIds, patternId) {
  return rankFixesByContext(symptomIds, patternId, SYMPTOMS);
}

// ── Signal Analysis API ───────────────────────────────────────────────────────

/**
 * Get a structured signal summary for the confidence explainer.
 * Returns { strong[], uncertain[], blocked[] }
 */
export function getSignalAnalysis(signals) {
  return getSignalSummary(signals);
}

/**
 * Get a confidence level object for display.
 * Returns { level, label, tone }
 */
export function getConfidenceDisplay(confidence) {
  return getConfidenceLevel(confidence);
}

/**
 * Returns true if the confidence section should auto-expand.
 */
export function confidenceNeedsExpanding(confidence) {
  return shouldAutoExpandConfidence(confidence);
}

// ── Results Screen Data Assembly ──────────────────────────────────────────────

/**
 * buildResultsData
 *
 * The primary assembly function for the Results Screen.
 * Takes the raw API analysis result and returns everything the UI needs,
 * pre-assembled and ready to render.
 *
 * Call this once per result — memoize or cache in component state.
 *
 * @param {object} analysisResult — raw API response from /recommend or /shoot-match
 * @returns {ResultsData}
 */
export function buildResultsData(analysisResult) {
  const {
    bestMatch,
    signalReliability,
    edgeCaseFlags = [],
    lightingIntelligence = {},
    alternatives = [],
  } = analysisResult || {};

  const patternId = bestMatch?.lightingPattern || bestMatch?.pattern_id;
  const confidence = bestMatch?.reliabilityScore ?? bestMatch?.confidence ?? 0;

  // Core pattern entry
  const pattern = patternId ? getPattern(patternId) : null;

  // Signal normalization for engine.
  // reliabilityScore and signalStrength are both 0–1 (overallSignalStrength).
  // confidence is 0–1 (reliabilityScore normalized in transform).
  const signals = {
    edgeCaseFlags:       edgeCaseFlags,
    ambiguityFlags:      extractAmbiguityFlags(analysisResult),
    reliabilityScore:    signalReliability?.overallSignalStrength ?? 1.0,
    confidence,
    detectedPattern:     patternId,
    signalStrength:      signalReliability?.overallSignalStrength ?? 1.0,
    // Backend-derived dominant failure mode from AggregatedInsight
    // (present when /knowledge/{id}/signals was pre-fetched and attached to the result)
    dominantFailureMode: analysisResult?.dominantFailureMode ?? null,
  };

  // Symptom generation
  const symptoms = getSymptomsFromSignals(signals);

  // Confidence display
  const confidenceDisplay = getConfidenceDisplay(confidence);
  const signalSummary     = getSignalAnalysis(signals);
  const autoExpandConf    = confidenceNeedsExpanding(confidence);

  // Comparison data (only when alternatives exist and confidence is low)
  const showComparison = confidence < 0.72 && alternatives.length > 0;
  const comparisons    = showComparison ? getPatternComparisons(patternId) : [];

  // Related patterns for footer
  const relatedPatterns = patternId ? getRelatedPatterns(patternId) : [];

  return {
    pattern,
    patternId,
    confidence,
    confidenceDisplay,
    signalSummary,
    autoExpandConf,
    symptoms,
    comparisons,
    showComparison,
    relatedPatterns,
    signals,
    // Risk level from pattern knowledge base — 'low' | 'medium' | 'high' | null
    patternRiskLevel:     pattern?.metadata?.riskLevel         ?? null,
    patternMinSignals:    pattern?.metadata?.minSignalsForChange ?? null,
    // Pass-through raw fields for existing card components
    raw: analysisResult,
  };
}

// ── Rendering Helpers ─────────────────────────────────────────────────────────

/**
 * getPatternForRenderTarget
 *
 * Returns a reduced PatternEntry shaped for a specific render target.
 * Avoids sending unnecessary data to lightweight render contexts (web, PDF).
 *
 * @param {string} patternId
 * @param {'app'|'web'|'pdf'} target
 */
export function getPatternForRenderTarget(patternId, target = 'app') {
  const pattern = getPattern(patternId);
  if (!pattern) return null;

  switch (target) {
    case 'web':
      // SEO page — needs summary, recognition, metadata; not full fix list
      return {
        id:          pattern.id,
        name:        pattern.name,
        category:    pattern.category,
        summary:     pattern.summary,
        recognition: pattern.recognition,
        detection:   pattern.detection,
        metadata:    pattern.metadata,
        assets:      pattern.assets,
      };

    case 'pdf':
      // PDF export — compact reference; summary, blueprint, quickFix only
      return {
        id:          pattern.id,
        name:        pattern.name,
        summary:     { tagline: pattern.summary.tagline },
        blueprint:   pattern.blueprint,
        mistakes:    pattern.mistakes,
        quickFixes:  pattern.fixes.slice(0, 2),
        metadata:    {
          ...pattern.metadata,
          // Ensure risk level is always present in PDF exports
          riskLevel:            pattern.metadata?.riskLevel            ?? null,
          minSignalsForChange:  pattern.metadata?.minSignalsForChange  ?? null,
        },
      };

    case 'app':
    default:
      return pattern;
  }
}

// ── Internal Helpers ──────────────────────────────────────────────────────────

function extractAmbiguityFlags(analysisResult) {
  const flags = [];
  const { bestMatch, alternatives = [] } = analysisResult || {};

  // Multiple competing patterns (scores are 0–1 after transform normalization)
  if (alternatives.length >= 2) {
    const topScore = bestMatch?.reliabilityScore ?? 0;
    const secondScore = alternatives[0]?.reliabilityScore ?? 0;
    if (topScore - secondScore < 0.15) flags.push('multiple_patterns');
  }

  // Low confidence (0–1 scale)
  if ((bestMatch?.reliabilityScore ?? 1) < 0.55) flags.push('low_confidence');

  // Add any flags already on the result
  const existing = analysisResult?.ambiguityFlags || [];
  return [...new Set([...flags, ...existing])];
}

// Re-export raw data maps for tools that need direct access
export { PATTERNS, SYMPTOMS };
