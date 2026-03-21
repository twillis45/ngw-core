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
];

function isAdminEmail(email) {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

function readPaid() {
  try { return localStorage.getItem(STORAGE_KEY) === 'true'; } catch { return false; }
}

export default function usePaywall(userEmail) {
  const admin = isAdminEmail(userEmail);
  const [isPaid, setIsPaid] = useState(() => admin || readPaid());

  // Whenever an admin email is detected, stamp localStorage so other checks stay consistent
  useEffect(() => {
    if (admin) {
      try { localStorage.setItem(STORAGE_KEY, 'true'); } catch {}
      setIsPaid(true);
    }
  }, [admin]);

  const unlock = useCallback(() => {
    try { localStorage.setItem(STORAGE_KEY, 'true'); } catch {}
    setIsPaid(true);
    trackEvent('UPGRADE_COMPLETED', { email: userEmail });
  }, [userEmail]);

  const lock = useCallback(() => {
    if (admin) return; // admin accounts cannot be locked
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
    setIsPaid(false);
  }, [admin]);

  return { isPaid, unlock, lock, isAdmin: admin };
}
