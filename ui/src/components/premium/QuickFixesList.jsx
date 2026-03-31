import SectionLabel from './SectionLabel';

/** QuickFixesList — 2–3 actionable fix bullets.
 *  fixes: array of { solution, priority, tag } or plain strings.
 *  Renders nothing if fixes is empty or undefined. */
export default function QuickFixesList({ fixes }) {
  if (!fixes || fixes.length === 0) return null;

  const displayFixes = fixes.slice(0, 3);

  return (
    <div className="ngw-quick-fixes">
      <SectionLabel>Quick Fixes</SectionLabel>
      <ul className="ngw-quick-fixes__list">
        {displayFixes.map((fix, i) => {
          const text = typeof fix === 'string' ? fix : (fix.solution || fix.text || String(fix));
          return (
            <li key={i} className="ngw-quick-fixes__item">
              <span className="ngw-quick-fixes__bullet" aria-hidden="true" />
              <span>{text}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
