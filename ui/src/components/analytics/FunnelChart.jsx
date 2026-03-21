/**
 * FunnelChart — Visual horizontal funnel with step widths and drop-off labels.
 */
const EVENT_LABELS = {
  LANDING_VIEW: 'Landing',
  IMAGE_UPLOADED: 'Image Upload',
  ANALYSIS_COMPLETE: 'Analysis',
  FIRST_FIX_SHOWN: 'Fix Shown',
  PAYWALL_TRIGGERED: 'Paywall',
  UPGRADE_CLICKED: 'Clicked Upgrade',
  UPGRADE_COMPLETED: 'Upgraded',
  SHOOT_MODE_STARTED: 'Shoot Mode',
  MATCH_ACHIEVED: 'Match',
  SETUP_SAVED: 'Setup Saved',
};

export default function FunnelChart({ funnel }) {
  if (!funnel?.length) return null;
  const top = funnel[0]?.count || 1;

  return (
    <div className="funnel-chart">
      {funnel.map((step, i) => {
        const prev = i > 0 ? funnel[i - 1] : null;
        const drop = prev && prev.count > 0
          ? Math.round((1 - step.count / prev.count) * 100)
          : null;
        const barW = Math.max(4, Math.round(step.count / top * 100));
        return (
          <div key={step.event} className="funnel-step">
            <div className="funnel-step__meta">
              <span className="funnel-step__name">{EVENT_LABELS[step.event] || step.event}</span>
              <span className="funnel-step__count">{step.count.toLocaleString()}</span>
            </div>
            <div className="funnel-step__track">
              <div className="funnel-step__bar" style={{ width: `${barW}%` }} />
              <span className="funnel-step__pct">{step.conversion_pct}%</span>
            </div>
            {drop != null && drop > 0 && (
              <div className="funnel-step__drop">▼ {drop}% drop-off</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
