/**
 * CohortChart — Daily trend sparkline for analyses, matches, and upgrades.
 * Uses inline SVG polyline — no chart library needed.
 */
export default function CohortChart({ trend }) {
  if (!trend?.length) return <div className="cohort__empty">No trend data yet.</div>;

  const H = 80;
  const W = 400;
  const PAD = 8;
  const innerW = W - PAD * 2;
  const innerH = H - PAD * 2;

  const maxVal = Math.max(...trend.flatMap(d => [d.analyses, d.matches, d.upgrades]), 1);

  function points(key) {
    return trend.map((d, i) => {
      const x = PAD + (i / Math.max(trend.length - 1, 1)) * innerW;
      const y = PAD + innerH - (d[key] / maxVal) * innerH;
      return `${x},${y}`;
    }).join(' ');
  }

  const lastDay = trend[trend.length - 1];

  return (
    <div className="cohort">
      <div className="cohort__legend">
        <span className="cohort__dot cohort__dot--analyses" />Analyses
        <span className="cohort__dot cohort__dot--matches" />Matches
        <span className="cohort__dot cohort__dot--upgrades" />Upgrades
      </div>
      <svg
        className="cohort__svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <polyline points={points('analyses')} className="cohort__line cohort__line--analyses" />
        <polyline points={points('matches')} className="cohort__line cohort__line--matches" />
        <polyline points={points('upgrades')} className="cohort__line cohort__line--upgrades" />
      </svg>
      <div className="cohort__axis">
        <span>{trend[0]?.day}</span>
        <span>{lastDay?.day}</span>
      </div>
      {lastDay && (
        <div className="cohort__today">
          Today — Analyses: {lastDay.analyses} · Matches: {lastDay.matches} · Upgrades: {lastDay.upgrades}
        </div>
      )}
    </div>
  );
}
