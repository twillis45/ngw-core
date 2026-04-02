/**
 * usePlan — tier-aware plan state hook.
 *
 * plan = "free" | "paid" | "pro" | "enterprise"
 *   isPaid       — plan >= "paid"
 *   isPro        — plan >= "pro"
 *   isEnterprise — plan >= "enterprise"
 *
 * Admin emails always get "enterprise".
 * Compatible with existing usePaywall consumers — exposes unlock/lock shortcuts.
 */

import { useState, useCallback, useEffect } from 'react';
import { loadPlan, savePlan, meetsPlan } from '../data/planStore';

const ADMIN_EMAILS = ['todd@toddwillisphoto.com'];

function isAdminEmail(email) {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

export default function usePlan(userEmail) {
  const isAdmin = isAdminEmail(userEmail);
  const [plan, setPlanState] = useState(() => isAdmin ? 'enterprise' : loadPlan());

  useEffect(() => {
    if (isAdmin) {
      savePlan('enterprise');
      setPlanState('enterprise');
    }
  }, [isAdmin]);

  const setPlan = useCallback((p) => {
    if (isAdmin) return; // admin cannot be downgraded
    savePlan(p);
    setPlanState(p);
  }, [isAdmin]);

  const isPaid       = meetsPlan(plan, 'paid');
  const isPro        = meetsPlan(plan, 'pro');
  const isEnterprise = meetsPlan(plan, 'enterprise');

  // Backward-compat shortcuts (mirrors usePaywall API)
  const unlock = useCallback(() => setPlan('paid'), [setPlan]);
  const lock   = useCallback(() => setPlan('free'), [setPlan]);

  return { plan, setPlan, isPaid, isPro, isEnterprise, isAdmin, unlock, lock };
}
