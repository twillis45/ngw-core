/** SectionLabel — uppercase muted label above a content section. */
export default function SectionLabel({ children, className = '' }) {
  return (
    <span className={`ngw-section-label${className ? ` ${className}` : ''}`}>
      {children}
    </span>
  );
}
