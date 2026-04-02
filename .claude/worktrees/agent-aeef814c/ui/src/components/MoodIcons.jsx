/**
 * MoodIcons — SVG icon map for every MOOD_LIST entry.
 * Single source of truth; import wherever MoodTile is rendered.
 */

const svgProps = {
  width: 24, height: 24, viewBox: '0 0 24 24',
  fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round',
};

export const MOOD_ICONS = {
  beauty: (
    <svg {...svgProps}>
      <circle cx="12" cy="8" r="4" />
      <path d="M6 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M14.5 4.5c1 1 1.5 2.5.5 4" />
    </svg>
  ),
  cinematic: (
    <svg {...svgProps}>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M7 4V2M17 4V2M12 4V2" />
      <path d="M2 9h20" />
      <circle cx="12" cy="14.5" r="3" />
    </svg>
  ),
  corporate: (
    <svg {...svgProps}>
      <rect x="3" y="7" width="18" height="13" rx="1" />
      <circle cx="12" cy="12" r="3" />
      <path d="M8 7V5a4 4 0 018 0v2" />
    </svg>
  ),
  editorial: (
    <svg {...svgProps}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  natural: (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="5" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  ),
  high_key: (
    <svg {...svgProps}>
      <path d="M12 3v1M12 20v1M5.6 5.6l.7.7M17.7 17.7l.7.7M3 12h1M20 12h1M5.6 18.4l.7-.7M17.7 6.3l.7-.7" />
      <circle cx="12" cy="12" r="4" fill="currentColor" fillOpacity="0.15" />
      <circle cx="12" cy="12" r="7" strokeDasharray="2 2" />
    </svg>
  ),
  low_key: (
    <svg {...svgProps}>
      <path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" />
    </svg>
  ),
};
