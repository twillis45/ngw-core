/**
 * PatternPerformanceTable — Per lighting pattern: analysis, upgrades, CVR.
 * Sorted by conversion rate (highest first).
 */
export default function PatternPerformanceTable({ patterns }) {
  if (!patterns?.length) return (
    <div className="ppt__empty">No pattern data yet.</div>
  );

  const maxCVR = Math.max(...patterns.map(p => p.conversion_rate_pct), 1);
  const maxAC = Math.max(...patterns.map(p => p.analysis_count), 1);

  return (
    <div className="ppt">
      <table className="ppt__table">
        <thead>
          <tr>
            <th>Pattern</th>
            <th title="Times this pattern was detected in an analysis">Analysis</th>
            <th title="Upgrades by users who saw this pattern">Upgrades</th>
            <th title="Upgrades ÷ Analysis">CVR</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {patterns.map((p, i) => {
            const cvrW = Math.max(2, Math.round(p.conversion_rate_pct / maxCVR * 100));
            const acW = Math.max(2, Math.round(p.analysis_count / maxAC * 100));
            const isTopCVR = p.conversion_rate_pct === maxCVR;
            return (
              <tr key={`${p.pattern}-${i}`} className={isTopCVR ? 'ppt__row--top' : ''}>
                <td className="ppt__pattern">{p.pattern}</td>
                <td>
                  <div className="ppt__inline-bar">
                    <div className="ppt__inline-fill ppt__inline-fill--dim" style={{ width: `${acW}%` }} />
                    <span>{p.analysis_count.toLocaleString()}</span>
                  </div>
                </td>
                <td>{p.upgrade_count}</td>
                <td className={`ppt__cvr ${p.conversion_rate_pct > 0 ? 'ppt__cvr--pos' : ''}`}>
                  {p.conversion_rate_pct}%
                </td>
                <td className="ppt__bar-col">
                  <div className="ppt__bar-track">
                    <div className="ppt__bar-fill" style={{ width: `${cvrW}%` }} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
