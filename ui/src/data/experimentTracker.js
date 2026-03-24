/**
 * NGW Experiment Tracker
 *
 * Records experiment exposures and conversion events to /api/experiments/event.
 * Deduplicates exposures per session (only fires once per flag per session).
 *
 * Usage:
 *   import { trackExposure, trackConversion } from './experimentTracker';
 *   trackExposure('paywall_after_3_analyses', 'treatment');
 *   trackConversion('paywall_after_3_analyses', 'treatment', 'UPGRADE_CLICKED', { price: 39 });
 */

import { getSessionId, getAllFlags } from './flagsStore';
import { trackEvent } from './analytics';

const _exposed = new Set();

function post(body) {
  // Fire-and-forget — never block the UI
  fetch('/api/experiments/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => {});
}

/**
 * Track an experiment exposure (once per session per flag).
 * Call this when a user sees a UI element controlled by a flag.
 */
export function trackExposure(flagName, variant) {
  const key = `${flagName}:${variant}`;
  if (_exposed.has(key)) return;
  _exposed.add(key);

  post({
    session_id: getSessionId(),
    flag_name: flagName,
    variant,
    event_name: 'EXPERIMENT_EXPOSED',
    data: {},
  });
}

/**
 * Track a conversion event within an experiment.
 * eventName should match existing analytics event names (UPGRADE_CLICKED, PAYWALL_TRIGGERED, etc.)
 */
export function trackConversion(flagName, variant, eventName, data = {}) {
  post({
    session_id: getSessionId(),
    flag_name: flagName,
    variant,
    event_name: eventName,
    data,
  });
}

/**
 * Broadcast a conversion event to ALL active experiments that touch the same group.
 * Use for shared events like UPGRADE_CLICKED that should attribute to pricing + paywall flags.
 */
export function broadcastConversion(eventName, data = {}) {
  const flags = getAllFlags();
  const sid = getSessionId();

  for (const [flagName, def] of Object.entries(flags)) {
    if (!def.enabled) continue;
    post({
      session_id: sid,
      flag_name: flagName,
      variant: def.variant,
      event_name: eventName,
      data,
    });
  }

  // Also fire regular analytics event for the existing dashboard
  trackEvent(eventName, { ...data, _experiment: true });
}
