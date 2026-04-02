/**
 * SVG icon component for app modes.
 * Maps icon keys from modeRegistry to inline SVGs.
 */
const ICONS = {
  lightbulb: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="3"/>
      <path d="M7 9L4 22h16L17 9"/>
    </svg>
  ),
  camera: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <polyline points="21 15 16 10 5 21"/>
    </svg>
  ),
  compare: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="8" height="18" rx="2"/>
      <rect x="14" y="3" width="8" height="18" rx="2"/>
      <path d="M12 8v8"/>
      <path d="M9 12h6"/>
    </svg>
  ),
  target: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <circle cx="12" cy="12" r="6"/>
      <circle cx="12" cy="12" r="2"/>
    </svg>
  ),
  beaker: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3h6"/>
      <path d="M10 3v7.4a2 2 0 01-.6 1.4L4 17.2A2 2 0 005.4 21h13.2A2 2 0 0020 17.2l-5.4-5.4a2 2 0 01-.6-1.4V3"/>
    </svg>
  ),
};

export default function ModeIcon({ name, size = 24 }) {
  const icon = ICONS[name];
  if (!icon) return null;
  return <span className="mode-icon" style={{ width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>;
}
