/**
 * usePaywall — localStorage-backed paid/free tier state.
 *
 * isPaid         — true if user has unlocked the full product
 * unlock()       — simulate upgrade (sets localStorage; production wires to payment)
 * lock()         — revert to free tier (dev/testing only)
 * isAdmin        — true for admin emails (always paid, cannot be locked)
 *
 * Admin emails always have isPaid = true regardless of localStorage,
 * UNLESS ?qa_free=1 was passed — which forces free-tier for QA testing.
 * QA mode is stored in sessionStorage and resets on tab close.
 */

import { useState, useCallback, useEffect } from 'react';
import { trackEvent } from '../data/analytics';
import { getPaywallConfig } from '../data/pricingStore';

const STORAGE_KEY = 'ngw_paid';
const COUNT_KEY = 'ngw_analysis_count';
const QA_FREE_KEY = 'ngw_qa_free';

function readCount() {
  try { return parseInt(sessionStorage.getItem(COUNT_KEY) || '0', 10); } catch { return 0; }
}
function writeCount(n) {
  try { sessionStorage.setItem(COUNT_KEY, String(n)); } catch {}
}

/** Returns true if QA free-mode is active (?qa_free=1 was used this session). */
function isQaFreeMode() {
  try { return sessionStorage.getItem(QA_FREE_KEY) === '1'; } catch { return false; }
}

/** These accounts always have full access — no paywall, no prompts. */
const ADMIN_EMAILS = [
  'todd@toddwillisphoto.com',
  'dev@localhost',
];

function isAdminEmail(email) {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

function readPaid() {
  try { return localStorage.getItem(STORAGE_KEY) === 'true'; } catch { return false; }
}

/** Read the subscription plan tier stored after server verification ('pro' | 'studio' | null). */
function readPlanTier() {
  try { return localStorage.getItem('ngw_subscription_plan') || null; } catch { return null; }
}

export default function usePaywall(userEmail) {
  const qaFree = isQaFreeMode(); // computed once — stable for the lifetime of this render

  // QA free-mode overrides both admin and localStorage paid state so paywall
  // flows can be tested without clearing storage after every session.
  const [isPaid, setIsPaid] = useState(() =>
    qaFree ? false : (isAdminEmail(userEmail) || readPaid())
  );
  const [analysisCount, setAnalysisCount] = useState(readCount);
  // planTier is set after server verification: 'pro' | 'studio' | null
  const [planTier, setPlanTier] = useState(() => qaFree ? null : readPlanTier());
  const paywallCfg = getPaywallConfig();
  const threshold = paywallCfg.threshold ?? 3;
  // In QA free-mode: treat admin as a regular free user so all paywall triggers fire.
  // isAdmin still returns true (informational) but doesn't suppress limit or paywall.
  const effectiveAdmin = !qaFree && isAdminEmail(userEmail);
  const isAtLimit = !effectiveAdmin && !isPaid && analysisCount >= threshold;

  // When userEmail changes to an admin address, sync isPaid — unless QA free-mode
  // is active, in which case keep the free-tier state so testing is uninterrupted.
  useEffect(() => {
    if (!qaFree && isAdminEmail(userEmail)) setIsPaid(true);
  }, [userEmail, qaFree]);

  // Server verification — runs once on mount.
  // If there is a pending Stripe session ID in localStorage, validate it against
  // /api/auth/subscription-status and promote isPaid to true if the server confirms.
  // Clears ngw_stripe_session after verification so it only runs once per checkout.
  useEffect(() => {
    if (qaFree) return; // skip in QA free-mode — keep free-tier state for testing
    let stripeSession = null;
    try { stripeSession = localStorage.getItem('ngw_stripe_session'); } catch { /* ignore */ }
    if (!stripeSession) return;

    let cancelled = false;
    (async () => {
      try {
        const params = new URLSearchParams({ stripe_session: stripeSession });
        if (userEmail) params.set('email', userEmail);
        const res = await fetch(`/api/auth/subscription-status?${params}`, {
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.is_paid) {
          try { localStorage.setItem(STORAGE_KEY, 'true'); } catch { /* ignore */ }
          // Persist plan tier so isStudio stays correct across page loads
          if (data.plan) {
            try { localStorage.setItem('ngw_subscription_plan', data.plan); } catch { /* ignore */ }
            setPlanTier(data.plan);
          }
          setIsPaid(true);
          // Session ID consumed — remove so we don't re-verify on every mount
          try { localStorage.removeItem('ngw_stripe_session'); } catch { /* ignore */ }
        }
      } catch { /* network error — localStorage paid state stands as fallback */ }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally runs once on mount only

  const unlock = useCallback(() => {
    try { localStorage.setItem(STORAGE_KEY, 'true'); } catch {}
    setIsPaid(true);
    trackEvent('UPGRADE_COMPLETED', { email: userEmail });
  }, [userEmail]);

  const lock = useCallback(() => {
    // In QA free-mode allow lock even on admin accounts (so full reset is possible).
    if (!qaFree && isAdminEmail(userEmail)) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    setIsPaid(false);
  }, [userEmail, qaFree]);

  const incrementCount = useCallback(() => {
    setAnalysisCount(prev => {
      const next = prev + 1;
      writeCount(next);
      trackEvent('ANALYSIS_COUNT_HIT', { count: next, threshold });
      return next;
    });
  }, [threshold]);

  const isStudio = !qaFree && isPaid && planTier === 'studio';

  return {
    isPaid, unlock, lock,
    isAdmin: isAdminEmail(userEmail),
    analysisCount, threshold, isAtLimit, incrementCount,
    planTier,    // 'pro' | 'studio' | null — set after server verification
    isStudio,    // true only when subscription plan is 'studio'
  };
}
