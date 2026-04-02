/**
 * LookSummaryCard — Phase 1, first card.
 *
 * Shows the pattern identity and signal confidence badge immediately
 * after analysis. Always free — no gate.
 *
 * Data from: result.bestMatch, result.lightingIntelligence
 *
 * Respects settings:
 *   guidanceLevel       'minimal' hides coaching copy (headline, diagnosis, variability)
 *   confidenceDisplay   'numeric'/'detailed' adds % score next to badge
 *
 * Props (new):
 *   patternRiskLevel    'low' | 'medium' | 'high' | null — from knowledge base
 */

import { useState } from 'react';
import useSettings from '../hooks/useSettings';
import HelpTip from '../components/HelpTip';
import {
  confidenceLevel, CONFIDENCE_LABELS, CONFIDENCE_CSS,
  CONFIDENCE_THRESHOLDS, patternSourceLabel,
} from '../lib/signals';

const CONFIDENCE_TIP =
  'High (≥75%): multiple independent signals agree on the pattern. ' +
  'Moderate (50–74%): signals present but some ambiguity — small placement changes may affect results. ' +
  'Low (<50%): insufficient signal to confirm the setup reliably.';

function ConfidenceBadge({ score, showNumeric }) {
  const level = confidenceLevel(score);
  const label = CONFIDENCE_LABELS[level];
  const cls   = CONFIDENCE_CSS[level];

  return (
    <span className="confidence-help-row">
      <span className={`confidence-badge confidence-badge--${cls}`}>
        {label}
        {showNumeric && (
          <span className="confidence-badge__pct"> · {Math.round(score * 100)}%</span>
        )}
      </span>
      <HelpTip title="Confidence score" text={CONFIDENCE_TIP} />
    </span>
  );
}

function MetaRow({ label, muted }) {
  if (!label) return null;
  return (
    <div className="look-summary__meta-row">
      <span className={`look-summary__meta-text${muted ? ' look-summary__meta-text--muted' : ''}`}>{label}</span>
    </div>
  );
}

// Risk level badge — only shown in non-minimal mode when riskLevel is known
const RISK_LABEL = { low: 'Low risk', medium: 'Med risk', high: 'High risk' };
const RISK_TITLE = {
  low:    'Low-risk pattern — small signal threshold for engine updates',
  medium: 'Medium-risk pattern — human review required before engine updates',
  high:   'High-risk pattern — 200+ signals + human gate required before engine updates',
};

function RiskBadge({ riskLevel }) {
  if (!riskLevel || !RISK_LABEL[riskLevel]) return null;
  return (
    <span
      className={`risk-badge risk-badge--${riskLevel}`}
      title={RISK_TITLE[riskLevel]}
      aria-label={RISK_TITLE[riskLevel]}
    >
      {RISK_LABEL[riskLevel]}
    </span>
  );
}

export default function LookSummaryCard({ bestMatch, lightingIntelligence, setupLightCount, patternRiskLevel }) {
  const { guidanceLevel, confidenceDisplay } = useSettings();
  const isMinimal  = guidanceLevel === 'minimal';
  const isCoaching = guidanceLevel === 'coaching';
  // Coaching auto-expands the "Why this pattern" section
  const [reasoningOpen, setReasoningOpen] = useState(isCoaching);
  if (!bestMatch) return null;

  const isRecipe = !!bestMatch.recipeId;
  const showNumeric = confidenceDisplay === 'numeric' || confidenceDisplay === 'detailed';

  // Treat missing or canonical "unknown" as null — never render "Unknown Pattern"
  const rawPattern = bestMatch.lightingPattern;
  const patternKnown = rawPattern && rawPattern.toLowerCase() !== 'unknown';
  // Capitalise first letter so "clamshell" → "Clamshell" everywhere it appears
  const pattern = patternKnown
    ? rawPattern.charAt(0).toUpperCase() + rawPattern.slice(1)
    : null;
  const rawScore = bestMatch.reliabilityScore ?? 0.5;
  const score = rawScore > 1 ? rawScore / 100 : rawScore;
  const li = lightingIntelligence;

  // Pattern source — which classifier produced this result
  const sourceLabel = patternSourceLabel(bestMatch.patternSource);

  // Perception explanation — why the engine chose this pattern
  const pex = li?.perceptionExplanation || null;
  const patternReasoning = pex?.patternReasoning || null;
  const supportingCount = pex?.supportingSignals?.length ?? 0;
  const contradictingCount = pex?.contradictingSignals?.length ?? 0;

  // Build quick context lines
  // setupLightCount (from result.setup.lights.length) is the authoritative count —
  // it matches exactly what the blueprint and diagram show. Fall back to
  // lightingIntelligence.lightCount (detected from reference image) only when
  // no setup data is available (e.g. welcome-screen examples).
  const lightCount = setupLightCount ?? li?.lightCount;
  const keyPos = li?.keyPosition;
  const modifierFamily = li?.detectedModifier || null;
  const environment = li?.ambientConditions || li?.detectedEnvironment;
  const cct = li?.detectedCCT ? `${li.detectedCCT} K` : null;

  const metaItems = [
    lightCount && lightCount > 0 ? { text: `${lightCount} light${lightCount > 1 ? 's' : ''}` } : null,
    keyPos ? { text: `Key: ${keyPos}` } : null,
    modifierFamily ? { text: modifierFamily } : null,
    environment ? { text: environment } : null,
    cct ? { text: cct } : null,
    sourceLabel ? { text: `Via: ${sourceLabel}`, muted: true } : null,
  ].filter(Boolean);

  // Headline and diagnosis vary by guidance mode.
  // Minimal mode uses terse, technical language for experienced shooters.
  // Standard mode uses fuller coaching copy for photographers who want context.
  let headline, diagnosisLine;
  if (isMinimal) {
    if (!isRecipe) {
      if (score >= CONFIDENCE_THRESHOLDS.HIGH) {
        headline = null; // badge is sufficient — high confidence needs no verbal confirm
      } else if (score >= CONFIDENCE_THRESHOLDS.MODERATE) {
        headline = pattern ? 'Mixed signals.' : 'Insufficient read.';
      } else {
        headline = 'No reliable read.';
      }

      if (score >= CONFIDENCE_THRESHOLDS.HIGH) {
        diagnosisLine = null;
      } else if (score >= CONFIDENCE_THRESHOLDS.MODERATE) {
        diagnosisLine = 'Placement margin tight — bracket the position.';
      } else {
        diagnosisLine = 'Position critical. Lock placement before you shoot.';
      }
    }
  } else if (isCoaching) {
    if (isRecipe) {
      headline = 'Blueprint ready — set it up and shoot. Check the breakdown for positioning detail.';
      diagnosisLine = null;
    } else {
      if (score >= CONFIDENCE_THRESHOLDS.HIGH) {
        headline = patternReasoning
          ? 'Pattern confirmed. Supporting signals are strong — see the breakdown below.'
          : 'Pattern confirmed.';
      } else if (score >= CONFIDENCE_THRESHOLDS.MODERATE) {
        headline = pattern
          ? 'Pattern detected — but signals are mixed. Review the supporting and contradicting signals before committing.'
          : 'Pattern unclear — not enough consistent signals. Consider re-framing or adding fill.';
      } else {
        headline = 'Not enough signal to confirm the setup. Resolve the key position first before reading anything else.';
      }

      if (score >= CONFIDENCE_THRESHOLDS.HIGH) {
        diagnosisLine = null;
      } else if (score >= CONFIDENCE_THRESHOLDS.MODERATE) {
        diagnosisLine = 'Position sensitivity is moderate. Small shifts in key distance or angle will change the result — bracket the position ±6 inches and compare before locking in.';
      } else {
        diagnosisLine = 'Low confidence read. Focus entirely on getting the shadow pattern right first — distance, angle, and height. Everything else is premature until the key is dialled in.';
      }
    }
  } else {
    // Guided (default)
    if (isRecipe) {
      headline = 'Blueprint ready \u2014 set it up and shoot.';
      diagnosisLine = null;
    } else {
      if (score >= CONFIDENCE_THRESHOLDS.HIGH) {
        headline = 'Pattern confirmed.';
      } else if (score >= CONFIDENCE_THRESHOLDS.MODERATE) {
        headline = pattern
          ? 'Pattern detected \u2014 but signals are mixed.'
          : 'Pattern unclear \u2014 more signals needed.';
      } else {
        headline = 'Not enough signal to confirm the setup.';
      }

      if (score >= CONFIDENCE_THRESHOLDS.HIGH) {
        diagnosisLine = null;
      } else if (score >= CONFIDENCE_THRESHOLDS.MODERATE) {
        diagnosisLine = 'Small changes to your positioning may produce inconsistent results.';
      } else {
        diagnosisLine = 'This setup will fail under small changes. Dial in the light placement first.';
      }
    }
  }

  return (
    <div className="look-summary-card">
      {headline && <p className="look-summary__headline">{headline}</p>}
      <div className="look-summary__top">
        <div className="look-summary__pattern">
          {pattern && <span className="look-summary__pattern-name">{pattern}</span>}
          <ConfidenceBadge score={score} showNumeric={showNumeric} />
          {!isMinimal && <RiskBadge riskLevel={patternRiskLevel} />}
        </div>
        {bestMatch.name && bestMatch.name !== pattern && (
          <div className="look-summary__system-name">{bestMatch.name}</div>
        )}
      </div>

      {metaItems.length > 0 && (
        <div className="look-summary__meta">
          {metaItems.map((item, i) => (
            <MetaRow key={i} label={item.text} muted={item.muted} />
          ))}
        </div>
      )}

      {bestMatch.rationale && (
        <p className="look-summary__rationale">
          {isCoaching
            ? bestMatch.rationale
            : bestMatch.rationale.length > 140
              ? bestMatch.rationale.slice(0, 137) + '…'
              : bestMatch.rationale}
        </p>
      )}

      {diagnosisLine && <p className="look-summary__diagnosis">{diagnosisLine}</p>}

      {/* Why this pattern — perception explanation (non-minimal, non-recipe) */}
      {!isMinimal && !isRecipe && patternReasoning && (
        <div className="look-summary__reasoning">
          <button
            className="look-summary__reasoning-toggle"
            onClick={() => setReasoningOpen(v => !v)}
            type="button"
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            Why this pattern
            {(supportingCount > 0 || contradictingCount > 0) && (
              <span className="look-summary__signal-counts">
                {supportingCount > 0 && <span className="look-summary__signal-count look-summary__signal-count--for">{supportingCount} for</span>}
                {contradictingCount > 0 && <span className="look-summary__signal-count look-summary__signal-count--against">{contradictingCount} against</span>}
              </span>
            )}
          </button>
          {reasoningOpen && (
            <p className="look-summary__reasoning-text">{patternReasoning}</p>
          )}
        </div>
      )}

      {!isRecipe && score < 0.5 && (
        <div className="look-summary__variability-signal">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          {isMinimal
            ? 'High var — lock position.'
            : isCoaching
              ? 'High variability — position is sensitive. Bracket key distance ±6 inches and compare results before committing.'
              : 'High variability risk — nail the position before you shoot.'}
        </div>
      )}
    </div>
  );
}
