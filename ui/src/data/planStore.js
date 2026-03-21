/**
 * Plan tier store.
 * ngw_plan = "free" | "paid" | "pro" | "enterprise"
 *
 * Backward compatible: if ngw_plan is not set but ngw_paid=true, treats as "paid".
 * Admin emails always get "enterprise" via usePlan hook.
 */

const PLAN_KEY = 'ngw_plan';
const LEGACY_PAID_KEY = 'ngw_paid';
const VALID_PLANS = ['free', 'paid', 'pro', 'enterprise'];

export const PLAN_ORDER = { free: 0, paid: 1, pro: 2, enterprise: 3 };

export const PLAN_LABELS = {
  free: 'Free',
  paid: 'Paid',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

export function loadPlan() {
  try {
    const plan = localStorage.getItem(PLAN_KEY);
    if (VALID_PLANS.includes(plan)) return plan;
    // Legacy backward compat: ngw_paid=true → 'paid'
    if (localStorage.getItem(LEGACY_PAID_KEY) === 'true') return 'paid';
    return 'free';
  } catch {
    return 'free';
  }
}

export function savePlan(plan) {
  try {
    if (!VALID_PLANS.includes(plan)) return;
    localStorage.setItem(PLAN_KEY, plan);
    // Keep legacy key in sync for backward compat with usePaywall
    localStorage.setItem(LEGACY_PAID_KEY, plan !== 'free' ? 'true' : 'false');
  } catch { /* quota / private mode */ }
}

/**
 * Check if a plan meets the required tier.
 * @param {string} userPlan  - current user plan
 * @param {string} required  - minimum required plan
 */
export function meetsPlan(userPlan, required) {
  return (PLAN_ORDER[userPlan] ?? 0) >= (PLAN_ORDER[required] ?? 0);
}
