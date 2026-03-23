/**
 * usePaywall — localStorage-backed paid/free tier state.
 *
 * isPaid     — true if user has unlocked the full product
 * unlock()   — simulate upgrade (sets localStorage; production wires to payment)
 * lock()     — revert to free tier (dev/testing only)
 *
 * Admin emails always have isPaid = true regardless of localStorage.
 */

import { useState, useCallback, useEffect } from 'react';
import { trackEvent } from '../data/analytics';

const STORAGE_KEY = 'ngw_paid';

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

export default function usePaywall(userEmail) {
  // Admin check is computed once in the initializer — avoids an extra render cycle.
  const [isPaid, setIsPaid] = useState(() => isAdminEmail(userEmail) || readPaid());

  // When userEmail changes to an admin address, sync isPaid.
  // Do NOT write to localStorage — admin access is identity-derived, not persisted,
  // so subsequent non-admin sessions in the same browser get the correct free tier.
  useEffect(() => {
    if (isAdminEmail(userEmail)) setIsPaid(true);
  }, [userEmail]);

  const unlock = useCallback(() => {
    try { localStorage.setItem(STORAGE_KEY, 'true'); } catch {}
    setIsPaid(true);
    trackEvent('UPGRADE_COMPLETED', { email: userEmail });
  }, [userEmail]);

  const lock = useCallback(() => {
    if (isAdminEmail(userEmail)) return; // admin accounts cannot be locked
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    setIsPaid(false);
  }, [userEmail]);

  return { isPaid, unlock, lock, isAdmin: isAdminEmail(userEmail) };
}
