/**
 * LookSummaryCard — Phase 1, first card.
 *
 * Shows the pattern identity and signal confidence badge immediately
 * after analysis. Always free — no gate.
 *
 * Data from: result.bestMatch, result.lightingIntelligence
 */

function ConfidenceBadge({ score }) {
  let label, cls;
  if (score >= 0.75) { label = 'High confidence'; cls = 'strong'; }
  else if (score >= 0.50) { label = 'Moderate confidence'; cls = 'moderate'; }
  else { label = 'Low confidence'; cls = 'low'; }

  return (
    <span className={`confidence-badge confidence-badge--${cls}`}>{label}</span>
  );
}

function MetaRow({ label }) {
  if (!label) return null;
  return (
    <div className="look-summary__meta-row">
      <span className="look-summary__meta-text">{label}</span>
    </div>
  );
}

export default function LookSummaryCard({ bestMatch, lightingIntelligence }) {
  if (!bestMatch) return null;

  const isRecipe = !!bestMatch.recipeId;

  // Treat missing or canonical "unknown" as null — never render "Unknown Pattern"
  const rawPattern = bestMatch.lightingPattern;
  const patternKnown = rawPattern && rawPattern.toLowerCase() !== 'unknown';
  // Capitalise first letter so "clamshell" → "Clamshell" everywhere it appears
  const pattern = patternKnown
    ? rawPattern.charAt(0).toUpperCase() + rawPattern.slice(1)
    : null;
  const score = bestMatch.reliabilityScore ?? 0.5;
  const li = lightingIntelligence;

  // Build quick context lines
  const lightCount = li?.lightCount;
  const keyPos = li?.keyPosition;
  const environment = li?.ambientConditions || li?.detectedEnvironment;
  const cct = li?.detectedCCT ? `${li.detectedCCT} K` : null;

  const metaItems = [
    lightCount && lightCount > 0 ? { text: `${lightCount} light${lightCount > 1 ? 's' : ''}` } : null,
    keyPos ? { text: `Key: ${keyPos}` } : null,
    environment ? { text: environment } : null,
    cct ? { text: cct } : null,
  ].filter(Boolean);

  // Headline and diagnosis are context-dependent on flow
  let headline, diagnosisLine;
  if (isRecipe) {
    // Pattern is the large title below — headline just confirms readiness
    headline = 'Blueprint ready \u2014 set it up and shoot.';
    diagnosisLine = null;
  } else {
    // Headline gives confidence verdict — pattern name is shown as the large title below,
    // so we don't repeat it here.
    if (score >= 0.75) {
      headline = 'Pattern confirmed.';
    } else if (score >= 0.5) {
      headline = pattern
        ? 'Pattern detected \u2014 but signals are mixed.'
        : 'Pattern unclear \u2014 more signals needed.';
    } else {
      headline = 'Not enough signal to confirm the setup.';
    }

    // Diagnosis adds only what isn't already said by the headline + badge
    if (score >= 0.75) {
      diagnosisLine = null; // badge says "Consistent pattern" — no repeat needed
    } else if (score >= 0.5) {
      diagnosisLine = 'Small changes to your positioning may produce inconsistent results.';
    } else {
      diagnosisLine = 'This setup will fail under small changes. Dial in the light placement first.';
    }
  }

  return (
    <div className="look-summary-card">
      <p className="look-summary__headline">{headline}</p>
      <div className="look-summary__top">
        <div className="look-summary__pattern">
          {pattern && <span className="look-summary__pattern-name">{pattern}</span>}
          <ConfidenceBadge score={pattern ? score : 0} />
        </div>
        {bestMatch.name && bestMatch.name !== pattern && (
          <div className="look-summary__system-name">{bestMatch.name}</div>
        )}
      </div>

      {metaItems.length > 0 && (
        <div className="look-summary__meta">
          {metaItems.map((item, i) => (
            <MetaRow key={i} label={item.text} />
          ))}
        </div>
      )}

      {bestMatch.rationale && (
        <p className="look-summary__rationale">
          {bestMatch.rationale.length > 140
            ? bestMatch.rationale.slice(0, 137) + '…'
            : bestMatch.rationale}
        </p>
      )}

      {diagnosisLine && <p className="look-summary__diagnosis">{diagnosisLine}</p>}

      {!isRecipe && score < 0.5 && (
        <div className="look-summary__variability-signal">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          High variability risk — nail the position before you shoot.
        </div>
      )}
    </div>
  );
}
