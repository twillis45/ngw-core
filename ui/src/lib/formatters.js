/**
 * Shared formatter utilities — used across SignalsTab, BenchmarkTab, ExecDashboard, etc.
 * Single source of truth for display formatting.
 *
 * All date/time functions explicitly pass the device timezone so output always
 * matches the user's local clock, regardless of the browser's default behaviour
 * or any server-side rendering context.
 */

/** Device timezone — resolved once at module load. */
const DEVICE_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Format a 0–1 fraction as a percentage string. */
export function pct(v, d = 1) {
  if (v == null) return '—';
  return `${(v * 100).toFixed(d)}%`;
}

/** Format a number as a USD dollar string. Zero returns '—'. */
export function usd(v) {
  if (v == null || v === 0) return '—';
  return `$${Number(v).toFixed(2)}`;
}

/** Format a Unix timestamp as a human-readable relative time string. */
export function relTime(ts) {
  if (!ts) return '—';
  const d = Date.now() / 1000 - ts;
  if (d < 60)    return 'just now';
  if (d < 3600)  return `${Math.round(d / 60)}m ago`;
  if (d < 86400) return `${Math.round(d / 3600)}h ago`;
  return `${Math.round(d / 86400)}d ago`;
}

/** Format a Unix timestamp as a locale date/time string (device timezone). */
export function ts(unix) {
  if (!unix) return '—';
  return new Date(unix * 1000).toLocaleString(undefined, { timeZone: DEVICE_TZ });
}

/**
 * Format a Unix timestamp or ISO string as "Jan 5, 2:30 PM" (device timezone).
 * Pass { dateOnly: true } to omit the time portion.
 */
export function fmtDateTime(value, { dateOnly = false } = {}) {
  if (!value) return '—';
  const d = typeof value === 'number'
    ? new Date(value < 1e12 ? value * 1000 : value)
    : new Date(value);
  if (isNaN(d.getTime())) return String(value);
  if (dateOnly) {
    return d.toLocaleDateString(undefined, {
      timeZone: DEVICE_TZ,
      month: 'short', day: 'numeric', year: 'numeric',
    });
  }
  return d.toLocaleString(undefined, {
    timeZone: DEVICE_TZ,
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/** Format a Unix timestamp or ISO string as "Jan 5" (device timezone, no year). */
export function fmtDate(value) {
  if (!value) return '—';
  const d = typeof value === 'number'
    ? new Date(value < 1e12 ? value * 1000 : value)
    : new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, {
    timeZone: DEVICE_TZ,
    month: 'short', day: 'numeric',
  });
}

/** Format a Unix timestamp or ISO string as "2:30 PM" (device timezone). */
export function fmtTime(value) {
  if (!value) return '—';
  const d = typeof value === 'number'
    ? new Date(value < 1e12 ? value * 1000 : value)
    : new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleTimeString(undefined, {
    timeZone: DEVICE_TZ,
    hour: '2-digit', minute: '2-digit',
  });
}
