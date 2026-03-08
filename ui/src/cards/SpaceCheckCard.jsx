export default function SpaceCheckCard({ data }) {
  if (!data) return null;

  return (
    <div className="result-card">
      <div className="result-card__header">
        <span className="result-card__icon">{'\u{1F4D0}'}</span>
        <span>Space Check</span>
      </div>

      <div className="space-stat">
        <span className="space-stat__key">Minimum width</span>
        <span className="space-stat__val">{data.minWidthFt} ft</span>
      </div>
      <div className="space-stat">
        <span className="space-stat__key">Minimum depth</span>
        <span className="space-stat__val">{data.minDepthFt} ft</span>
      </div>
      <div className="space-stat">
        <span className="space-stat__key">Ceiling height</span>
        <span className="space-stat__val">at least {data.minCeilingFt} ft</span>
      </div>

      {data.warnings.map((w, i) => (
        <div className="space-warn" key={i}>
          {'\u26A0\uFE0F'} {w}
        </div>
      ))}
    </div>
  );
}
