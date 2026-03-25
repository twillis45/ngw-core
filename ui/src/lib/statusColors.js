/**
 * LAB-wide status colour tokens.
 *
 * Single source of truth for green / amber / red / blue used in all
 * Lab tab components (inline styles). Import from here — never hardcode
 * the hex values directly in component files.
 *
 * Usage:
 *   import { C } from '../../lib/statusColors';
 *   style={{ color: C.green }}
 *   style={{ color: C.red, background: C.redBg }}
 */

/** Core text / icon colours */
export const C = {
  green:  '#34D399',
  amber:  '#FBBF24',
  red:    '#F87171',
  blue:   '#4DA3FF',
  muted:  '#6B7280',

  /** Subtle background fills — badges, chips (12 % opacity) */
  greenBg: 'rgba(52,211,153,0.12)',
  amberBg: 'rgba(251,191,36,0.12)',
  redBg:   'rgba(248,113,113,0.12)',
  blueBg:  'rgba(77,163,255,0.12)',

  /** Slightly stronger fills — score bars, status callouts (15 % opacity) */
  greenBg2: 'rgba(52,211,153,0.15)',
  amberBg2: 'rgba(251,191,36,0.15)',
  redBg2:   'rgba(248,113,113,0.15)',
  blueBg2:  'rgba(77,163,255,0.15)',

  /** Border / stroke variants */
  redBorder:   '#F8717166',
  greenBorder: '#34D39966',
  amberBorder: '#FBBF2466',
};

/**
 * Benchmark / run status badge colours.
 * Keyed by status string returned from the API.
 */
export const STATUS_COLORS = {
  'PASS':      { color: C.green, bg: C.greenBg2 },
  'SOFT PASS': { color: C.amber, bg: C.amberBg2 },
  'FAIL':      { color: C.red,   bg: C.redBg2   },
  'ERROR':     { color: C.red,   bg: C.redBg2   },
};

/**
 * Event-type colours used in the API Key Health card event log.
 * Keyed by event_type string from the DB.
 */
export const EVENT_COLORS = {
  probe_ok:   C.green,
  '200':      C.green,
  probe_fail: C.red,
  '401_error': C.red,
};

/**
 * Convenience: return green/amber/red based on a 0–100 percentage.
 *   >= 70 → green, >= 50 → blue, >= 30 → amber, else red
 */
export function pctColor(pct) {
  if (pct >= 70) return C.green;
  if (pct >= 50) return C.blue;
  if (pct >= 30) return C.amber;
  return C.red;
}

/**
 * Convenience: return green or red based on a boolean / null.
 *   null → muted (unknown)
 */
export function okColor(ok) {
  if (ok === null || ok === undefined) return C.muted;
  return ok ? C.green : C.red;
}
