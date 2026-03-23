/**
 * SignalQualityCard — Phase 5 perception display.
 *
 * Converts raw perception data (signalReliability, faceValidation, edgeCaseFlags)
 * into user-friendly labels: Strong / Moderate / Weak signal clarity.
 *
 * Never exposes raw field names — always human-readable.
 * Always free — no gate.
 */

import { useState } from 'react';
import CardIcon from '../components/CardIcon';
import useSettings from '../hooks/useSettings';
import { signalStrength } from '../lib/signals';

function SignalMeter({ strength }) {
  const bars = 3;
  const filled = strength === 'strong' ? 3 : strength === 'moderate' ? 2 : 1;
  return (
    <div className="signal-meter" aria-label={`${strength} signal`}>
      {Array.from({ length: bars }, (_, i) => (
        <div
          key={i}
          className={`signal-meter__bar signal-meter__bar--${strength}${i < filled ? ' signal-meter__bar--on' : ''}`}
        />
      ))}
    </div>
  );
}

function ambiguityLabel(flag) {
  const labels = {
    no_face_detected: 'No face detected — positions estimated from shadows and environment',
    multiple_patterns_close_confidence: 'Multiple similar patterns detected — result may have alternates',
    bw_limits_color_cues: 'Black & white image — colour-based signals unavailable',
    tiny_face: 'Small face in frame — position signals may be approximate',
    low_signal_count: 'Limited signal data — fewer cues available for this image',
  };
  return labels[flag] || flag.replace(/_/g, ' ');
}

function edgeCaseLabel(flag) {
  const labels = {
    blown_highlights: 'Blown highlights — contrast may exceed meter range',
    mixed_color_temperature: 'Mixed colour temperatures — warm and cool sources detected',
    outdoor_foliage_shadows: 'Dappled foliage light — irregular shadow patterns',
    window_light_gradient: 'Window light gradient — falloff-based positioning',
    extreme_low_key: 'Extreme low-key — most of the image is in shadow',
    bw_processing: 'Black & white processing — colour signals not available',
    no_face: 'No face detected — lighting inferred from scene and environment',
  };
  return labels[flag] || flag.replace(/_/g, ' ');
}

export default function SignalQualityCard({ signalReliability, faceValidation, edgeCaseFlags, perceptionExplanation }) {
  const { confidenceDisplay } = useSettings();
  // Auto-expand signal details when the user has chosen the 'detailed' view
  const [expanded, setExpanded] = useState(confidenceDisplay === 'detailed');

  // Determine overall strength
  const overallScore = signalReliability?.overallSignalStrength ?? null;
  const available = signalReliability?.signalsAvailable ?? 0;
  const total = signalReliability?.signalsTotal ?? 24;
  const faceDetected = faceValidation?.faceDetected ?? true;
  const faceQuality = faceValidation?.faceQuality ?? 'none';
  const faceYaw = faceValidation?.faceYaw ?? null;

  if (overallScore === null && !faceValidation && !edgeCaseFlags) return null;

  const strength = overallScore !== null ? signalStrength(overallScore) : 'moderate';

  const strengthLabel = {
    strong: 'Consistent — pattern confirmed across signals.',
    moderate: 'Partial — some signals ambiguous, result is reliable but may have alternates.',
    weak: 'Weak — limited signal data, result is estimated.',
  }[strength];

  const strengthSub = strength === 'weak' ? 'Use Shoot Mode to dial in and confirm.' : null;

  // Collect active ambiguity flags
  const ambiguityFlags = signalReliability?.ambiguityFlags || [];

  // Collect active edge cases
  const activeEdgeCases = edgeCaseFlags
    ? Object.entries(edgeCaseFlags)
        .filter(([, v]) => v === true)
        .map(([k]) => k)
    : [];

  // Perception explanation signals
  const supportingSignals = perceptionExplanation?.supportingSignals || [];
  const contradictingSignals = perceptionExplanation?.contradictingSignals || [];
  const hasPerceptionSignals = supportingSignals.length > 0 || contradictingSignals.length > 0;

  const hasDetails = ambiguityFlags.length > 0 || activeEdgeCases.length > 0 || !faceDetected || hasPerceptionSignals;

  const faceLabel = faceQuality === 'good'
    ? 'Face clearly detected'
    : faceQuality === 'partial'
    ? 'Face partially detected'
    : 'No face detected';

  return (
    <div className="result-card signal-quality-card">
      <div className="result-card__header">
        <CardIcon name="check" />
        <span>Signal Clarity</span>
      </div>

      <div className="signal-quality__summary">
        <SignalMeter strength={strength} />
        <div className="signal-quality__text">
          <span className={`signal-quality__label signal-quality__label--${strength}`}>
            {strengthLabel}
          </span>
          {strengthSub && (
            <span className="signal-quality__sub">{strengthSub}</span>
          )}
          {overallScore !== null && (
            <span className="signal-quality__count">
              {available}/{total} signals used
            </span>
          )}
        </div>
      </div>

      {/* Face detection */}
      <div className={`signal-quality__face signal-quality__face--${faceQuality}`}>
        <span className="signal-quality__face-icon">
          {faceDetected ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.4">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" strokeDasharray="3 2"/><circle cx="12" cy="7" r="4" strokeDasharray="3 2"/>
            </svg>
          )}
        </span>
        {faceLabel}
        {faceYaw != null && (
          <span className="signal-quality__face-yaw" title="Face turn angle — 0° is straight-on, higher values indicate a turned face">
            {Math.round(Math.abs(faceYaw))}° turn
          </span>
        )}
      </div>

      {/* Expandable detail */}
      {hasDetails && (
        <>
          <button
            className="show-more-btn"
            onClick={() => setExpanded(!expanded)}
            type="button"
          >
            {expanded ? 'Hide details' : 'Show signal details'}
          </button>

          {expanded && (
            <div className="signal-quality__details">
              {ambiguityFlags.map((flag, i) => (
                <div key={`a${i}`} className="signal-quality__flag signal-quality__flag--ambiguity">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginRight: 4 }}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  {ambiguityLabel(flag)}
                </div>
              ))}
              {activeEdgeCases.map((flag, i) => (
                <div key={`e${i}`} className="signal-quality__flag signal-quality__flag--edge">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginRight: 4 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                  {edgeCaseLabel(flag)}
                </div>
              ))}
              {hasPerceptionSignals && (
                <div className="signal-quality__perception-signals">
                  {supportingSignals.length > 0 && (
                    <div className="signal-quality__perception-group">
                      <span className="signal-quality__perception-label signal-quality__perception-label--for">Supporting</span>
                      {supportingSignals.map((s, i) => (
                        <div key={`s${i}`} className="signal-quality__flag signal-quality__flag--supporting">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginRight: 4 }}><polyline points="20 6 9 17 4 12"/></svg>
                          {s}
                        </div>
                      ))}
                    </div>
                  )}
                  {contradictingSignals.length > 0 && (
                    <div className="signal-quality__perception-group">
                      <span className="signal-quality__perception-label signal-quality__perception-label--against">Contradicting</span>
                      {contradictingSignals.map((s, i) => (
                        <div key={`c${i}`} className="signal-quality__flag signal-quality__flag--contradicting">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginRight: 4 }}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          {s}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
