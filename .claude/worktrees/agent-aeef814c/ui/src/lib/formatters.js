/**
 * Shared formatter utilities — used across SignalsTab, BenchmarkTab, ExecDashboard, etc.
 * Single source of truth for display formatting.
 */

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

/** Format a Unix timestamp as a locale date/time string. */
export function ts(unix) {
  if (!unix) return '—';
  return new Date(unix * 1000).toLocaleString();
}
