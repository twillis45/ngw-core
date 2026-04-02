/**
 * NGW Fix Flow
 *
 * Builds ordered, context-aware fix step sequences from a SymptomEntry
 * optionally scoped to a detected PatternEntry.
 *
 * Fix flow principles:
 *   1. Quick fix always comes first (60-second actionable move)
 *   2. Pattern-scoped fixes are prioritized over generic fixes
 *   3. Easy fixes before hard fixes within the same priority band
 *   4. Each step is a concrete, numbered, on-set instruction
 *
 * Used by: ResultFixCTA, SymptomPage, Shoot Mode step guidance
 */

import { SYMPTOMS } from './symptoms';
import { PATTERNS } from './patterns';

const DIFFICULTY_ORDER = { easy: 0, medium: 1, hard: 2 };

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * buildFixFlow
 *
 * Returns a structured fix flow for a symptom, optionally
 * prioritized toward a specific detected pattern.
 *
 * @param {string} symptomId
 * @param {string} [patternId]   — detected pattern slug for context-aware prioritization
 * @param {object} [symptoms]    — injectable for testing
 * @param {object} [patterns]    — injectable for testing
 *
 * @returns {FixFlow | null}
 */
export function buildFixFlow(symptomId, patternId = null, symptoms = SYMPTOMS, patterns = PATTERNS) {
  const symptom = symptoms[symptomId];
  if (!symptom) return null;

  const pattern = patternId ? patterns[patternId] : null;

  // 1. Build quick fix card (always first)
  const quickFix = symptom.quickFix
    ? {
        id:            `${symptomId}-quick`,
        type:          'quick',
        title:         symptom.quickFix.title,
        steps:         symptom.quickFix.steps,
        timeEstimate:  symptom.quickFix.timeEstimate,
        isQuick:       true,
      }
    : null;

  // 2. Build ordered fix cards
  const fixes = (symptom.fixes || [])
    .map(fix => ({
      ...fix,
      isPatternRelevant: fix.targetPatterns
        ? fix.targetPatterns.includes(patternId)
        : false,
    }))
    .sort((a, b) => {
      // Pattern-relevant fixes first
      if (a.isPatternRelevant !== b.isPatternRelevant) {
        return a.isPatternRelevant ? -1 : 1;
      }
      // Then by difficulty
      return (DIFFICULTY_ORDER[a.difficulty] || 0) - (DIFFICULTY_ORDER[b.difficulty] || 0);
    });

  // 3. Extract blueprint anchor (links fix steps to setup corrections)
  const blueprintAnchor = pattern
    ? buildBlueprintAnchor(symptom, pattern)
    : null;

  return {
    symptomId,
    patternId,
    symptom: {
      title:       symptom.title,
      tagline:     symptom.tagline,
      description: symptom.description,
      causes:      symptom.causes,
    },
    quickFix,
    fixes,
    blueprintAnchor,
    relatedSymptoms: symptom.relatedSymptoms || [],
  };
}

/**
 * getFixStepsForSymptom
 *
 * Returns a flat, ordered array of step strings for a symptom,
 * combining quick fix steps + first detailed fix steps.
 * Used for quick on-set reference (no UI chrome needed).
 *
 * @returns {string[]}
 */
export function getFixStepsForSymptom(symptomId, patternId = null) {
  const flow = buildFixFlow(symptomId, patternId);
  if (!flow) return [];

  const steps = [];

  if (flow.quickFix) {
    steps.push(...flow.quickFix.steps);
  }

  const first = flow.fixes[0];
  if (first && first.steps) {
    // Add steps that don't duplicate the quick fix
    const quickSet = new Set(flow.quickFix?.steps || []);
    const additional = first.steps.filter(s => !quickSet.has(s));
    if (additional.length) steps.push(...additional);
  }

  return steps;
}

/**
 * getRelatedFixes
 *
 * Returns fixes from related symptoms — surfaces secondary fixes when the
 * primary symptom is resolved but the result is still not right.
 *
 * @returns {FixCard[]}
 */
export function getRelatedFixes(symptomId, symptoms = SYMPTOMS) {
  const symptom = symptoms[symptomId];
  if (!symptom) return [];

  return (symptom.relatedSymptoms || [])
    .flatMap(relatedId => {
      const related = symptoms[relatedId];
      return related?.fixes || [];
    });
}

// ── Blueprint Anchor ──────────────────────────────────────────────────────────
//
// Links the fix back to specific blueprint fields —
// tells the user which part of the setup to correct.

function buildBlueprintAnchor(symptom, pattern) {
  const blueprint = pattern?.blueprint;
  if (!blueprint) return null;

  const anchor = {};

  // Map symptom to relevant blueprint fields
  switch (symptom.slug) {
    case 'too-flat':
      anchor.fields = ['keyLight.position', 'fill.ratio'];
      anchor.hint   = `Move key to ${blueprint.keyLight?.position || 'off-axis'}, reduce fill to ${blueprint.fill?.ratio || '3:1'}`;
      break;

    case 'too-harsh':
      anchor.fields = ['keyLight.modifier', 'fill.ratio'];
      anchor.hint   = `Use ${(blueprint.keyLight?.modifier || [])[0] || 'a soft modifier'} and add fill at ${blueprint.fill?.ratio || '2:1'}`;
      break;

    case 'no-catchlight':
      anchor.fields = ['keyLight.height', 'keyLight.angle'];
      anchor.hint   = `Key light should be at ${blueprint.keyLight?.height || 'just above eye level'}`;
      break;

    case 'blown-highlights':
      anchor.fields = ['keyLight.position'];
      anchor.hint   = 'Move key light back or reduce power — recheck exposure';
      break;

    case 'no-triangle':
      anchor.fields = ['keyLight.position', 'keyLight.angle', 'keyLight.height'];
      anchor.hint   = `Key at ${blueprint.keyLight?.position}, ${blueprint.keyLight?.angle}, ${blueprint.keyLight?.height}`;
      break;

    case 'shadow-too-strong':
      anchor.fields = ['fill.ratio', 'fill.type'];
      anchor.hint   = `Add ${blueprint.fill?.type || 'a reflector'} targeting ${blueprint.fill?.ratio || '3:1'} ratio`;
      break;

    case 'ambiguous-pattern':
      anchor.fields = ['keyLight.position', 'keyLight.angle'];
      anchor.hint   = `Commit key to ${blueprint.keyLight?.position} at ${blueprint.keyLight?.angle}`;
      break;

    default:
      anchor.fields = [];
      anchor.hint   = null;
  }

  anchor.setupNotes = blueprint.setupNotes || [];
  return anchor;
}

// ── Fix Comparison ────────────────────────────────────────────────────────────

// ── Knowledge API Integration ─────────────────────────────────────────────────

/**
 * buildFixFlowFromKnowledgeAPI
 *
 * Async companion to buildFixFlow — fetches FixStep[] from the Python knowledge
 * base via GET /lab/learning/knowledge/{patternId} and converts them into the
 * FixCard[] shape expected by QuickFixesCard and SymptomPage.
 *
 * Falls back to an empty array on any fetch error (non-blocking enrichment).
 *
 * FixStep → FixCard mapping:
 *   action         → fix text (the instructional sentence)
 *   notes          → problem statement (what was wrong)
 *   expected_delta → priority flag when delta > 0.05 (high expected lift)
 *   module         → tag (e.g. "cue_extraction", "reference_read")
 *   order          → used for sort order within the flow
 *
 * @param {string}  patternId     — pattern slug, e.g. "rembrandt"
 * @param {string}  [apiBase]     — API base URL (default: '')
 * @returns {Promise<FixCard[]>}
 */
export async function buildFixFlowFromKnowledgeAPI(patternId, apiBase = '') {
  if (!patternId) return [];

  let entry;
  try {
    const res = await fetch(`${apiBase}/lab/learning/knowledge/${patternId}`, {
      credentials: 'include',
    });
    if (!res.ok) return [];
    entry = await res.json();
  } catch {
    return [];
  }

  const symptoms = entry?.symptoms ?? [];
  const cards = [];

  for (const symptom of symptoms) {
    for (const step of (symptom.fix_steps ?? [])) {
      cards.push({
        id:       `kb-${patternId}-${step.order}`,
        // QuickFixesCard shape
        problem:  step.notes || `Improve ${(step.parameter || step.module || 'detection').replace(/_/g, ' ')}`,
        fix:      step.action,
        priority: step.expected_delta > 0.05,
        level:    step.order === 1 ? 'quick' : 'detailed',
        tag:      step.module || null,
        // Metadata passthrough for FixFlow consumers
        sourceSymptomId:  symptom.symptom_id,
        isPatternRelevant: true,
        difficulty:       step.expected_delta > 0.06 ? 'easy' : 'medium',
        steps:            [step.action],
        targetPatterns:   [patternId],
      });
    }
  }

  // Sort by order (already inherent) then by priority desc
  return cards.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority ? -1 : 1;
    return 0;
  });
}

/**
 * rankFixesByContext
 *
 * Returns a ranked list of fixes across multiple symptoms,
 * de-duplicated and sorted by: pattern relevance → difficulty → priority.
 *
 * Used when displaying "all possible fixes" from multiple active symptoms.
 */
export function rankFixesByContext(symptomIds, patternId, symptoms = SYMPTOMS) {
  const seen = new Set();
  const allFixes = [];

  for (const sid of symptomIds) {
    const symptom = symptoms[sid];
    if (!symptom) continue;

    for (const fix of (symptom.fixes || [])) {
      if (seen.has(fix.id)) continue;
      seen.add(fix.id);

      allFixes.push({
        ...fix,
        sourceSymptomId:   sid,
        isPatternRelevant: fix.targetPatterns?.includes(patternId) ?? false,
      });
    }
  }

  return allFixes.sort((a, b) => {
    if (a.isPatternRelevant !== b.isPatternRelevant) return a.isPatternRelevant ? -1 : 1;
    return (DIFFICULTY_ORDER[a.difficulty] || 0) - (DIFFICULTY_ORDER[b.difficulty] || 0);
  });
}
