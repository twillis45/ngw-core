/**
 * KPIStrip — Row of headline KPI chips at the top of the dashboard.
 */
export default function KPIStrip({ kpi, shootMode, paywall }) {
  const chips = [
    {
      label: 'Sessions',
      value: fmt(kpi?.total_sessions),
      sub: kpi?.total_users ? `${fmt(kpi.total_users)} users` : null,
    },
    {
      label: 'Analyses',
      value: fmt(kpi?.total_analyses),
      sub: kpi?.analyses_per_session ? `${kpi.analyses_per_session}/session` : null,
    },
    {
      label: 'Match Rate',
      value: pct(kpi?.match_rate_pct),
      sub: `${fmt(shootMode?.matched)} matches`,
      accent: kpi?.match_rate_pct >= 50,
    },
    {
      label: 'Conversions',
      value: fmt(kpi?.upgrades),
      sub: kpi?.conversion_rate_pct ? `${kpi.conversion_rate_pct}% CVR` : null,
      accent: (kpi?.conversion_rate_pct ?? 0) >= 5,
    },
    {
      label: 'Paywall CTR',
      value: pct(paywall?.ctr_pct),
      sub: `${fmt(paywall?.views)} views`,
    },
  ];

  return (
    <div className="kpi-strip">
      {chips.map(c => (
        <div key={c.label} className={`kpi-chip${c.accent ? ' kpi-chip--accent' : ''}`}>
          <div className="kpi-chip__value">{c.value}</div>
          <div className="kpi-chip__label">{c.label}</div>
          {c.sub && <div className="kpi-chip__sub">{c.sub}</div>}
        </div>
      ))}
    </div>
  );
}

function fmt(n) { return n != null ? Number(n).toLocaleString() : '—'; }
function pct(n) { return n != null ? `${n}%` : '—'; }
