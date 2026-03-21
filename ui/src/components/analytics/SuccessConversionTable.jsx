/**
 * SuccessConversionTable — Does achieving a match drive conversions?
 * Compares upgrade rate for sessions with vs without MATCH_ACHIEVED.
 */
export default function SuccessConversionTable({ data }) {
  if (!data) return null;

  const { matched_sessions, not_matched_sessions,
          matched_converted, not_matched_converted,
          matched_conversion_rate_pct, not_matched_conversion_rate_pct,
          lift_pct } = data;

  const rows = [
    {
      label: 'Reached Match',
      sessions: matched_sessions,
      conversions: matched_converted,
      rate: matched_conversion_rate_pct,
      highlight: true,
    },
    {
      label: 'No Match',
      sessions: not_matched_sessions,
      conversions: not_matched_converted,
      rate: not_matched_conversion_rate_pct,
      highlight: false,
    },
  ];

  const maxRate = Math.max(matched_conversion_rate_pct, not_matched_conversion_rate_pct, 1);
  const liftPositive = lift_pct > 0;

  return (
    <div className="sct">
      <table className="sct__table">
        <thead>
          <tr>
            <th>Cohort</th>
            <th>Sessions</th>
            <th>Upgrades</th>
            <th>CVR</th>
            <th className="sct__bar-col"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.label} className={r.highlight ? 'sct__row--highlight' : ''}>
              <td>{r.label}</td>
              <td>{(r.sessions || 0).toLocaleString()}</td>
              <td>{(r.conversions || 0).toLocaleString()}</td>
              <td className="sct__rate">{r.rate ?? 0}%</td>
              <td className="sct__bar-col">
                <div className="sct__bar-track">
                  <div
                    className="sct__bar-fill"
                    style={{ width: `${Math.round((r.rate ?? 0) / maxRate * 100)}%` }}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {lift_pct != null && (
        <div className={`sct__lift ${liftPositive ? 'sct__lift--pos' : 'sct__lift--neg'}`}>
          {liftPositive ? '▲' : '▼'} {Math.abs(lift_pct)}pp lift from match-to-conversion
          {liftPositive
            ? ' — success drives upgrades'
            : ' — match not yet correlated with upgrade'}
        </div>
      )}
    </div>
  );
}
