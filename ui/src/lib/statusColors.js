/**
 * LAB-wide status colour tokens.
 *
 * Single source of truth for green / amber / red / blue used in all
 * Lab tab components (inline styles). Import from here — never hardcode
 * the hex values directly in component files.
 *
 * Values are CSS custom properties so they respond to light/dark theme
 * switching automatically (tokens defined in theme/tokens.css).
 *
 * Usage:
 *   import { C } from '../../lib/statusColors';
 *   style={{ color: C.green }}
 *   style={{ color: C.red, background: C.redBg }}
 */

/** Core text / icon colours */
export const C = {
  green:  'var(--color-status-green)',
  amber:  'var(--color-status-amber)',
  red:    'var(--color-status-red)',
  blue:   'var(--color-status-blue)',
  muted:  'var(--color-status-muted)',

  /** Subtle background fills — badges, chips */
  greenBg: 'var(--color-status-green-bg)',
  amberBg: 'var(--color-status-amber-bg)',
  redBg:   'var(--color-status-red-bg)',
  blueBg:  'var(--color-status-blue-bg)',

  /** Slightly stronger fills — score bars, status callouts */
  greenBg2: 'var(--color-status-green-bg2)',
  amberBg2: 'var(--color-status-amber-bg2)',
  redBg2:   'var(--color-status-red-bg2)',
  blueBg2:  'var(--color-status-blue-bg2)',

  /** Border / stroke variants */
  redBorder:   'var(--color-status-red-border)',
  greenBorder: 'var(--color-status-green-border)',
  amberBorder: 'var(--color-status-amber-border)',
  blueBorder:  'var(--color-status-blue-border)',
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
