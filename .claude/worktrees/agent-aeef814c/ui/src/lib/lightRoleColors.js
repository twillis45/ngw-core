/**
 * lightRoleColors — single source of truth for light-role color identity.
 *
 * These values match the CSS tokens (--color-key, --color-fill, etc.) and the
 * diagram canvas LIGHT_COLORS_DARK constants. Whenever a component needs to
 * color a role label, icon, or badge in JS/inline-style context, import from
 * here rather than hard-coding hex strings.
 *
 * For CSS-only contexts, prefer the token variables directly:
 *   color: var(--color-key);
 */

export const ROLE_COLORS_DARK = {
  key:        '#f59e0b',
  fill:       '#3b82f6',
  rim:        '#a855f7',
  hair:       '#ec4899',
  background: '#10b981',
  accent:     '#a855f7',
};

export const ROLE_COLORS_LIGHT = {
  key:        '#b45309',
  fill:       '#1d4ed8',
  rim:        '#7c3aed',
  hair:       '#be185d',
  background: '#059669',
  accent:     '#7c3aed',
};

export const ROLE_LABELS = {
  key:        'Key Light',
  fill:       'Fill Light',
  rim:        'Rim Light',
  hair:       'Hair Light',
  background: 'Background Light',
  accent:     'Accent Light',
};

/**
 * Resolve a role to its canonical color (dark theme default).
 * Handles compound roles like "key_left", "fill_low", etc.
 */
export function getRoleColor(role, theme = 'dark') {
  if (!role) return theme === 'dark' ? '#64748b' : '#94a3b8';
  const lc = role.toLowerCase();
  const colors = theme === 'dark' ? ROLE_COLORS_DARK : ROLE_COLORS_LIGHT;
  if (colors[lc]) return colors[lc];
  if (lc.startsWith('key'))  return colors.key;
  if (lc.startsWith('fill')) return colors.fill;
  if (lc.startsWith('rim'))  return colors.rim;
  if (lc.startsWith('hair')) return colors.hair;
  if (lc === 'background')   return colors.background;
  return theme === 'dark' ? '#64748b' : '#94a3b8';
}

/** CSS class modifier for a role (for class-based coloring). */
export function getRoleClass(role) {
  if (!role) return '';
  const lc = role.toLowerCase();
  if (lc.startsWith('key'))  return 'key';
  if (lc.startsWith('fill')) return 'fill';
  if (lc.startsWith('rim'))  return 'rim';
  if (lc.startsWith('hair')) return 'hair';
  if (lc === 'background')   return 'bg';
  if (lc === 'accent')       return 'rim'; // accent shares rim color
  return '';
}
