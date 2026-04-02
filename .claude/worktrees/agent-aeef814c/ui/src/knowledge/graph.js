/**
 * NGW Knowledge Graph
 *
 * Builds the relationship graph between patterns and symptoms.
 * Used for:
 *   - getRelatedPatterns(id)   → patterns that confuse with or complement each other
 *   - getSymptomsForPattern(id) → symptoms most likely for a given pattern
 *   - getAlternativePatterns(id) → comparison candidates when confidence is low
 *
 * The graph is computed once and cached.
 */

/**
 * buildGraph
 *
 * @param {object} patterns  — PATTERNS map
 * @param {object} symptoms  — SYMPTOMS map
 *
 * @returns {KnowledgeGraph}
 */
export function buildGraph(patterns, symptoms) {
  const patternToPatterns = {};   // id → string[] (confusionWith + structural neighbors)
  const patternToSymptoms = {};   // id → string[] (symptoms relevant to this pattern)
  const symptomToPatterns = {};   // id → string[] (patterns that trigger this symptom)

  // ── Build pattern ↔ pattern edges ─────────────────────────────────────────
  for (const [id, pattern] of Object.entries(patterns)) {
    const neighbors = new Set();

    // confusionWith edges (bidirectional)
    for (const otherId of (pattern.detection?.confusionWith || [])) {
      if (patterns[otherId]) {
        neighbors.add(otherId);
        // Ensure reverse edge
        if (!patternToPatterns[otherId]) patternToPatterns[otherId] = new Set();
        patternToPatterns[otherId].add(id);
      }
    }

    // Same category patterns (weak association)
    for (const [otherId, other] of Object.entries(patterns)) {
      if (otherId !== id && other.metadata?.category === pattern.metadata?.category) {
        neighbors.add(otherId);
      }
    }

    if (!patternToPatterns[id]) patternToPatterns[id] = new Set();
    for (const n of neighbors) patternToPatterns[id].add(n);
  }

  // ── Build pattern ↔ symptom edges ─────────────────────────────────────────
  for (const [sid, symptom] of Object.entries(symptoms)) {
    const relatedPatterns = symptom.relatedPatterns || [];

    if (!symptomToPatterns[sid]) symptomToPatterns[sid] = new Set();

    for (const pid of relatedPatterns) {
      if (patterns[pid]) {
        symptomToPatterns[sid].add(pid);

        if (!patternToSymptoms[pid]) patternToSymptoms[pid] = new Set();
        patternToSymptoms[pid].add(sid);
      }
    }
  }

  // Convert Sets → arrays for easy consumption
  return {
    patternToPatterns: mapValues(patternToPatterns, s => [...s]),
    patternToSymptoms: mapValues(patternToSymptoms, s => [...s]),
    symptomToPatterns: mapValues(symptomToPatterns, s => [...s]),
  };
}

/**
 * getComparisonPairs
 *
 * Returns structured comparison data between a primary pattern and its
 * confusionWith alternatives — used by ResultPatternComparePrompt.
 *
 * @param {string}  primaryId
 * @param {object}  patterns
 * @returns {ComparisonPair[]}
 */
export function getComparisonPairs(primaryId, patterns) {
  const primary = patterns[primaryId];
  if (!primary) return [];

  return (primary.detection?.confusionWith || [])
    .map(altId => {
      const alt = patterns[altId];
      if (!alt) return null;

      return {
        primaryId,
        alternativeId: altId,
        primary: {
          name:          primary.name,
          tagline:       primary.summary.tagline,
          keySignals:    primary.detection.signals,
          keyPosition:   primary.blueprint.keyLight.position,
        },
        alternative: {
          name:          alt.name,
          tagline:       alt.summary.tagline,
          keySignals:    alt.detection.signals,
          keyPosition:   alt.blueprint.keyLight.position,
        },
        howToTell: buildDifferentiator(primary, alt),
      };
    })
    .filter(Boolean);
}

// ── Internal ──────────────────────────────────────────────────────────────────

function buildDifferentiator(primary, alt) {
  const DIFFERENTIATORS = {
    'rembrandt-loop': {
      key:     'Cheek triangle',
      primary: 'Rembrandt has an isolated triangle of light on the shadow-side cheek',
      alt:     'Loop has no triangle — nose shadow has a clear gap from the cheek shadow',
    },
    'rembrandt-split': {
      key:     'Shadow-side eye',
      primary: 'Rembrandt: shadow-side eye is partially lit via the cheek triangle',
      alt:     'Split: shadow-side eye is fully in shadow with no secondary light',
    },
    'loop-butterfly': {
      key:     'Nose shadow direction',
      primary: 'Loop: nose shadow points downward and to the side — asymmetrical',
      alt:     'Butterfly: nose shadow points straight down — perfectly symmetrical',
    },
    'butterfly-flat': {
      key:     'Nose shadow presence',
      primary: 'Butterfly has a visible butterfly-shaped shadow below the nose',
      alt:     'Flat has no nose shadow at all — completely even illumination',
    },
    'loop-rembrandt': {
      key:     'Nose shadow merge',
      primary: 'Loop: nose shadow tip has a clear gap before the cheek shadow',
      alt:     'Rembrandt: nose shadow merges with cheek shadow — no gap',
    },
    'split-rembrandt': {
      key:     'Shadow coverage',
      primary: 'Split: approximately 50% of face in shadow — vertical dividing line',
      alt:     'Rembrandt: shadow covers less than half — triangle of light on shadow cheek',
    },
    'flat-butterfly': {
      key:     'Nose shadow',
      primary: 'Flat: no directional nose shadow at all',
      alt:     'Butterfly: always has a visible butterfly shadow below the nose',
    },
  };

  const key  = `${primary.id}-${alt.id}`;
  const rKey = `${alt.id}-${primary.id}`;
  const diff = DIFFERENTIATORS[key] || DIFFERENTIATORS[rKey];

  if (diff) return diff;

  // Fallback: generate from signal lists
  return {
    key:     'Key diagnostic signal',
    primary: primary.detection.signals[0] || 'See pattern details',
    alt:     alt.detection.signals[0]     || 'See pattern details',
  };
}

function mapValues(obj, fn) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, fn(v)]));
}
