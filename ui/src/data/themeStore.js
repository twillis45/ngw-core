const STORAGE_KEY = 'ngw_theme';

/** All available themes in toggle-cycle order. */
export const THEMES = ['dark', 'light'];

export function loadTheme() {
  try {
    return localStorage.getItem(STORAGE_KEY); // 'light' | 'dark' | null
  } catch {
    return null;
  }
}

export function saveTheme(theme) {
  try {
    if (theme) {
      localStorage.setItem(STORAGE_KEY, theme);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch { /* ignore */ }
}

export function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function applyTheme(theme) {
  // Migrate removed themes to their nearest replacement
  const REMOVED = { lightroom: 'dark', photoshop: 'dark', daynote: 'light' };
  const resolved = REMOVED[theme] || theme || getSystemTheme();
  document.documentElement.setAttribute('data-theme', resolved);
}
