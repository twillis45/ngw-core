/**
 * LearningInsightsCard — Shows how the engine is learning:
 * top patterns by volume, confidence distribution, and setup save rate.
 */
export default function LearningInsightsCard({ patterns, retention, shootMode }) {
  if (!patterns && !retention) return null;

  const byPattern = patterns?.by_pattern?.slice(0, 5) ?? [];
  const byConf = patterns?.by_confidence ?? [];
  const maxPattern = byPattern[0]?.count || 1;

  const confOrder = { strong: 0, partial: 1, weak: 2 };
  const sortedConf = [...byConf].sort((a, b) => (confOrder[a.level] ?? 9) - (confOrder[b.level] ?? 9));
  const maxConf = Math.max(...sortedConf.map(c => c.count), 1);

  const saveRate = retention?.setups_saved && retention?.total_sessions
    ? Math.round(retention.setups_saved / retention.total_sessions * 100)
    : null;

  // Use CSS variables so colors adapt across all themes
  const confColors = {
    strong:  'var(--color-success)',
    partial: 'var(--color-warning)',
    weak:    'var(--color-error)',
  };

  return (
    <div className="lic">
      <div className="lic__two-col">
        <div>
          <div className="lic__sub-head">Top Patterns Seen</div>
          {byPattern.map(p => (
            <div key={p.pattern} className="lic__bar-row">
              <span className="lic__bar-label">{p.pattern}</span>
              <div className="lic__bar-track">
                <div
                  className="lic__bar-fill"
                  style={{ width: `${Math.round(p.count / maxPattern * 100)}%` }}
                />
              </div>
              <span className="lic__bar-count">{p.count}</span>
            </div>
          ))}
        </div>
        <div>
          <div className="lic__sub-head">Signal Confidence</div>
          {sortedConf.map(c => (
            <div key={c.level} className="lic__bar-row">
              <span className="lic__bar-label">{c.level}</span>
              <div className="lic__bar-track">
                <div
                  className="lic__bar-fill"
                  style={{
                    width: `${Math.round(c.count / maxConf * 100)}%`,
                    background: confColors[c.level] || 'var(--color-accent)',
                  }}
                />
              </div>
              <span className="lic__bar-count">{c.count}</span>
            </div>
          ))}
          {saveRate != null && (
            <div className="lic__save-rate">
              <span className="lic__save-rate-val">{saveRate}%</span>
              <span className="lic__save-rate-label">sessions save a setup</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
