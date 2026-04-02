/**
 * SessionQualityCard — Engagement depth: bounce rate, reach percentages.
 */
export default function SessionQualityCard({ quality }) {
  if (!quality) return null;

  const stages = [
    { label: 'Reached Analysis', pct: quality.analysis_reach_pct, color: 'var(--color-accent)' },
    { label: 'Entered Shoot Mode', pct: quality.shoot_mode_reach_pct, color: 'var(--color-creative)' },
    { label: 'Achieved Match', pct: quality.match_reach_pct, color: 'var(--color-success)' },
  ];

  return (
    <div className="sqc">
      <div className="sqc__metrics">
        <div className="sqc__metric">
          <span className="sqc__metric-value">{quality.avg_events_per_session}</span>
          <span className="sqc__metric-label">Avg events / session</span>
        </div>
        <div className="sqc__metric">
          <span className="sqc__metric-value sqc__metric-value--warn">
            {quality.bounce_rate_pct}%
          </span>
          <span className="sqc__metric-label">Bounce rate</span>
        </div>
        <div className="sqc__metric">
          <span className="sqc__metric-value">{quality.total_sessions?.toLocaleString()}</span>
          <span className="sqc__metric-label">Total sessions</span>
        </div>
      </div>
      <div className="sqc__funnel">
        {stages.map(s => (
          <div key={s.label} className="sqc__stage">
            <div className="sqc__stage-label">{s.label}</div>
            <div className="sqc__stage-track">
              <div
                className="sqc__stage-fill"
                style={{ width: `${s.pct}%`, background: s.color }}
              />
            </div>
            <div className="sqc__stage-pct">{s.pct}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}
