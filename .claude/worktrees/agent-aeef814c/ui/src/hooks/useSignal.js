/**
 * useSignal — hook for capturing and sending session outcome signals.
 *
 * Builds the full signal payload from the analysis result + shoot mode state,
 * then fires a single write when the user declares their outcome.
 *
 * Rule: Every session must produce a signal. If the user leaves without tapping
 * an outcome button, call sendSignal(null) on unmount to record 'unknown'.
 *
 * Usage:
 *   const { sendSignal, sent, outcome } = useSignal(result, { sessionId, userId });
 *   <button onClick={() => sendSignal('nailed_it')}>Nailed It</button>
 */
import { useState, useCallback, useRef } from 'react';
import { postSignal } from '../data/signalsApi';

/**
 * @param {object} result           — full analysis result from AppContext
 * @param {object} [opts]
 * @param {string} [opts.sessionId] — browser session identifier
 * @param {string} [opts.userId]    — logged-in user id
 * @param {string} [opts.inputMethod] — 'wizard' | 'reference_photo' | 'manual'
 * @param {object} [opts.shootData]  — { entered, stepsCompleted, stepsTotal, deviations }
 * @param {boolean}[opts.savedSetup]
 * @param {boolean}[opts.upgraded]
 * @param {number} [opts.revenueValue]
 */
export function useSignal(result, opts = {}) {
  const [sent,    setSent]    = useState(false);
  const [outcome, setOutcome] = useState(null);
  const [loading, setLoading] = useState(false);
  const sentRef = useRef(false); // guard against double-sends

  const sendSignal = useCallback(async (outcomeValue) => {
    if (sentRef.current) return; // already sent
    if (!result?.bestMatch?.lightingPattern) return;

    sentRef.current = true;
    setLoading(true);

    const shootData = opts.shootData || {};

    const payload = {
      pattern_id:        result.bestMatch.lightingPattern,
      confidence_score:  result.bestMatch?.reliabilityScore ?? null,
      outcome:           outcomeValue,    // null → server infers 'unknown'

      // Session context
      session_id:        opts.sessionId  || null,
      user_id:           opts.userId     || null,
      input_method:      opts.inputMethod || 'wizard',
      subject_type:      result.subject?.type || null,
      environment:       result.environment   || null,
      mood:              result.mood          || null,

      // Shoot mode
      shoot_mode_entered: shootData.entered        ?? false,
      steps_completed:    shootData.stepsCompleted ?? 0,
      steps_total:        shootData.stepsTotal     ?? 0,
      deviation_count:    shootData.deviations     ?? 0,

      // Revenue / conversion
      saved_setup:    opts.savedSetup   ?? false,
      upgraded:       opts.upgraded     ?? false,
      revenue_value:  opts.revenueValue ?? 0,
    };

    await postSignal(payload); // fire-and-forget; errors swallowed in postSignal

    setOutcome(outcomeValue);
    setSent(true);
    setLoading(false);
  }, [result, opts]);

  return { sendSignal, sent, outcome, loading };
}

export default useSignal;
