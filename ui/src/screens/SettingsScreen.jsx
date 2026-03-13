import { useState } from 'react';
import {
  loadSettings, saveSetting, applySettings, resetSettings,
  FONT_SIZES, FONT_FAMILIES, DENSITY_OPTIONS,
} from '../data/settingsStore';
import { loadTheme, saveTheme, applyTheme, THEMES } from '../data/themeStore';
import Toast from '../components/Toast';

/** Theme display order: lightest → darkest */
const THEME_ORDER = ['daynote', 'light', 'photoshop', 'lightroom', 'dark'];
const THEME_LABELS = {
  daynote:   { label: 'DN',   icon: '\uD83D\uDDD2\uFE0F' },
  light:     { label: 'Light', icon: '\u2600\uFE0F' },
  photoshop: { label: 'Ps',   icon: '\uD83D\uDDA5\uFE0F' },
  lightroom: { label: 'Lr',   icon: '\uD83C\uDFA8' },
  dark:      { label: 'Dark', icon: '\uD83C\uDF19' },
};

/** Each typeface button renders in its own font */
const FONT_STYLES = {
  system: { fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  inter:  { fontFamily: '"Inter", "SF Pro Display", -apple-system, sans-serif' },
  source: { fontFamily: '"Source Sans 3", "Source Sans Pro", -apple-system, sans-serif' },
  mono:   { fontFamily: '"SF Mono", "JetBrains Mono", "Fira Code", monospace' },
  serif:  { fontFamily: '"Playfair Display", Georgia, "Times New Roman", serif' },
};

/** Each size button renders at its representative font size */
const SIZE_STYLES = {
  xs:     { fontSize: '11px' },
  small:  { fontSize: '13px' },
  medium: { fontSize: '15px' },
  large:  { fontSize: '17px' },
  xl:     { fontSize: '20px' },
};

export default function SettingsScreen() {
  const [settings, setSettings] = useState(loadSettings);
  const [theme, setTheme] = useState(() => loadTheme() || 'dark');
  const [toast, setToast] = useState({ message: '', visible: false });

  function updateSetting(key, value) {
    saveSetting(key, value);
    const next = { ...settings, [key]: value };
    setSettings(next);
    applySettings(next);
  }

  function handleThemeChange(t) {
    saveTheme(t);
    applyTheme(t);
    setTheme(t);
  }

  function handleReset() {
    resetSettings();
    setSettings(loadSettings());
    saveTheme('dark');
    applyTheme('dark');
    setTheme('dark');
    setToast({ message: 'Reset to defaults', visible: true });
  }

  return (
    <div className="stg">
      <h2 className="stg__title">Settings</h2>

      {/* Theme — light to dark */}
      <div className="stg__row">
        <span className="stg__label">Theme</span>
        <div className="stg__seg">
          {THEME_ORDER.filter(t => THEMES.includes(t)).map(t => (
            <button
              key={t}
              className={`stg__seg-btn${theme === t ? ' stg__seg-btn--on' : ''}`}
              onClick={() => handleThemeChange(t)}
              title={THEME_LABELS[t]?.label}
              type="button"
            >
              {THEME_LABELS[t]?.icon}
            </button>
          ))}
        </div>
      </div>

      {/* Typeface — each button in its own font */}
      <div className="stg__row">
        <span className="stg__label">Typeface</span>
        <div className="stg__seg">
          {FONT_FAMILIES.map(ff => (
            <button
              key={ff.id}
              className={`stg__seg-btn${settings.fontFamily === ff.id ? ' stg__seg-btn--on' : ''}`}
              onClick={() => updateSetting('fontFamily', ff.id)}
              style={FONT_STYLES[ff.id]}
              type="button"
            >
              {ff.label}
            </button>
          ))}
        </div>
      </div>

      {/* Text Size — each button at its own size */}
      <div className="stg__row">
        <span className="stg__label">Size</span>
        <div className="stg__seg">
          {FONT_SIZES.map(fs => (
            <button
              key={fs.id}
              className={`stg__seg-btn${settings.fontSize === fs.id ? ' stg__seg-btn--on' : ''}`}
              onClick={() => updateSetting('fontSize', fs.id)}
              style={SIZE_STYLES[fs.id]}
              type="button"
            >
              {fs.label}
            </button>
          ))}
        </div>
      </div>

      {/* Density */}
      <div className="stg__row">
        <span className="stg__label">Density</span>
        <div className="stg__seg">
          {DENSITY_OPTIONS.map(d => (
            <button
              key={d.id}
              className={`stg__seg-btn${settings.density === d.id ? ' stg__seg-btn--on' : ''}`}
              onClick={() => updateSetting('density', d.id)}
              type="button"
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      <button className="stg__reset" onClick={handleReset} type="button">
        Reset to Defaults
      </button>

      <Toast
        message={toast.message}
        visible={toast.visible}
        onDone={() => setToast(t => ({ ...t, visible: false }))}
      />
    </div>
  );
}
