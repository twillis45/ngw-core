/**
 * DashboardLayout — Outer wrapper with header, date range controls, origin filter, and grid.
 */
import { useDispatch } from '../../context/AppContext';

const _TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

const ORIGIN_OPTS = [
  { id: 'all',        label: 'All' },
  { id: 'production', label: 'Prod' },
  { id: 'internal',   label: 'Dev' },
];

export default function DashboardLayout({
  days, onDaysChange,
  origin, onOriginChange,
  onRefresh, loading, error, children, lastRefresh,
}) {
  const dispatch = useDispatch();
  return (
    <div className="adb screen">
      <div className="adb__header">
        <div className="adb__title-group">
          <button
            className="adb__back-btn"
            type="button"
            onClick={() => dispatch({ type: 'GO_BACK' })}
            title="Back to Settings"
          >← Settings</button>
          <h2 className="adb__title">Analytics</h2>
          <div className="adb__view-tabs">
            <button className="adb__view-tab adb__view-tab--on" type="button">Analytics</button>
            <button
              className="adb__view-tab"
              type="button"
              onClick={() => dispatch({ type: 'NAVIGATE', screen: 'exec' })}
            >Executive</button>
          </div>
        </div>
        <div className="adb__controls">
          {/* Origin filter */}
          <div className="adb__origin-group" title="Filter sessions by origin">
            {ORIGIN_OPTS.map(o => (
              <button
                key={o.id}
                className={`adb__origin-btn${origin === o.id ? ' adb__origin-btn--on' : ''}`}
                onClick={() => onOriginChange(o.id)}
                type="button"
              >
                {o.label}
              </button>
            ))}
          </div>
          <div className="adb__controls-sep" />
          {/* Day range */}
          {[7, 30, 90].map(d => (
            <button
              key={d}
              className={`adb__range-btn${days === d ? ' adb__range-btn--on' : ''}`}
              onClick={() => onDaysChange(d)}
              type="button"
            >
              {d}d
            </button>
          ))}
          {lastRefresh && (
            <span className="adb__last-refresh" title={new Date(lastRefresh).toLocaleTimeString(undefined, { timeZone: _TZ })}>
              {new Date(lastRefresh).toLocaleTimeString(undefined, { timeZone: _TZ, hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button
            className={`adb__refresh${loading ? ' adb__refresh--spin' : ''}`}
            onClick={onRefresh}
            type="button"
            title="Refresh"
            disabled={loading}
          >
            ↻
          </button>
        </div>
      </div>

      {origin !== 'all' && (
        <div className="adb__origin-banner">
          Showing <strong>{origin === 'production' ? 'production' : 'internal / dev'}</strong> sessions only
        </div>
      )}

      {loading && <div className="adb__loading">Loading…</div>}
      {error && <div className="adb__error">{error}</div>}
      {!loading && !error && children}
    </div>
  );
}
