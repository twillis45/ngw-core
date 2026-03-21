import { useState, useRef, useCallback } from 'react';
import { useAppState, useDispatch } from '../context/AppContext';
import usePaywall from '../hooks/usePaywall';
import usePlan from '../hooks/usePlan';
import { PLAN_LABELS } from '../data/planStore';
import {
  loadSettings, saveSetting, applySettings, resetSettings,
  FONT_SIZES, FONT_FAMILIES, DENSITY_OPTIONS,
  UNIT_OPTIONS, POWER_DISPLAY_OPTIONS,
} from '../data/settingsStore';
import { loadTheme, saveTheme, applyTheme, THEMES } from '../data/themeStore';
import { loadMode, saveMode } from '../data/modeStore';
import { isEnabled, setFlag } from '../modes/featureFlags';
import Toast from '../components/Toast';

const DEV_TAP_COUNT = 5;
const DEV_TAP_WINDOW = 3000;

const APP_VERSION = 'v1.4.0';

/** Theme display order: lightest to darkest */
const THEME_ORDER = ['daynote', 'light', 'photoshop', 'lightroom', 'dark'];
const THEME_LABELS = {
  daynote:   { label: 'Daynote',   name: 'Daynote' },
  light:     { label: 'Light',     name: 'Light' },
  photoshop: { label: 'Ps',        name: 'Photoshop' },
  lightroom: { label: 'Lr',        name: 'Lightroom' },
  dark:      { label: 'Dark',      name: 'Dark' },
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
  const { user } = useAppState();
  const dispatch = useDispatch();
  const userEmail = user?.email || user?.username || null;
  const { isPaid, unlock, lock, isAdmin } = usePaywall(userEmail);
  const { plan, setPlan } = usePlan(userEmail);
  const [settings, setSettings] = useState(loadSettings);
  const [theme, setTheme] = useState(() => loadTheme() || 'dark');
  const [roleMode, setRoleMode] = useState(() => loadMode());
  const [toast, setToast] = useState({ message: '', visible: false });
  const tapTimestamps = useRef([]);

  /* Secret version tap: 5 taps within 3s toggles Lab dev mode */
  const handleVersionTap = useCallback(() => {
    const now = Date.now();
    const taps = tapTimestamps.current;
    taps.push(now);
    while (taps.length && taps[0] < now - DEV_TAP_WINDOW) taps.shift();
    if (taps.length >= DEV_TAP_COUNT) {
      taps.length = 0;
      const wasEnabled = isEnabled('enable_lab');
      setFlag('enable_lab', !wasEnabled);
      setToast({ message: wasEnabled ? 'Dev mode disabled' : 'Dev mode enabled', visible: true });
    }
  }, []);

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

      {/* ── Appearance ── */}
      <div className="stg__section-label">Appearance</div>

      <div className="stg__row">
        <span className="stg__label">Theme</span>
        <div className="stg__seg">
          {THEME_ORDER.filter(t => THEMES.includes(t)).map(t => (
            <button
              key={t}
              className={`stg__seg-btn${theme === t ? ' stg__seg-btn--on' : ''}`}
              onClick={() => handleThemeChange(t)}
              title={THEME_LABELS[t]?.name}
              type="button"
            >
              {THEME_LABELS[t]?.label}
            </button>
          ))}
        </div>
      </div>

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

      {/* ── Shooting Preferences ── */}
      <div className="stg__section-label">Shooting Preferences</div>

      <div className="stg__row">
        <div className="stg__row-label">
          <span>Role Mode</span>
          <span className="stg__row-hint">
            {roleMode === 'assistant'
              ? 'Direct commands — short, no explanation'
              : 'Outcome context — results and reasoning'}
          </span>
        </div>
        <div className="stg__seg">
          {[
            { id: 'photographer', label: 'Photographer' },
            { id: 'assistant', label: 'Assistant' },
          ].map(m => (
            <button
              key={m.id}
              className={`stg__seg-btn${roleMode === m.id ? ' stg__seg-btn--on' : ''}`}
              onClick={() => { saveMode(m.id); setRoleMode(m.id); }}
              type="button"
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="stg__row">
        <span className="stg__label">Units</span>
        <div className="stg__seg">
          {UNIT_OPTIONS.map(u => (
            <button
              key={u.id}
              className={`stg__seg-btn${settings.units === u.id ? ' stg__seg-btn--on' : ''}`}
              onClick={() => updateSetting('units', u.id)}
              type="button"
            >
              {u.label}
            </button>
          ))}
        </div>
      </div>

      <div className="stg__row">
        <span className="stg__label">Power Readout</span>
        <div className="stg__seg">
          {POWER_DISPLAY_OPTIONS.map(p => (
            <button
              key={p.id}
              className={`stg__seg-btn${settings.powerDisplay === p.id ? ' stg__seg-btn--on' : ''}`}
              onClick={() => updateSetting('powerDisplay', p.id)}
              type="button"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="stg__row stg__row--toggle">
        <span className="stg__label">Show Confidence Scores</span>
        <button
          className={`stg__toggle${settings.showConfidenceScore ? ' stg__toggle--on' : ''}`}
          onClick={() => updateSetting('showConfidenceScore', !settings.showConfidenceScore)}
          type="button"
          aria-label="Toggle confidence scores"
        >
          <span className="stg__toggle-knob" />
        </button>
      </div>

      <div className="stg__row stg__row--toggle">
        <span className="stg__label">Auto-Save Setups</span>
        <button
          className={`stg__toggle${settings.autoSaveSetups ? ' stg__toggle--on' : ''}`}
          onClick={() => updateSetting('autoSaveSetups', !settings.autoSaveSetups)}
          type="button"
          aria-label="Toggle auto-save"
        >
          <span className="stg__toggle-knob" />
        </button>
      </div>

      {/* ── Account ── */}
      <div className="stg__section-label">Account</div>

      {user ? (
        <div className="stg__row">
          <span className="stg__label">Signed in as</span>
          <span className="stg__value">{user.username}</span>
        </div>
      ) : (
        <div className="stg__row">
          <span className="stg__label">Account</span>
          <span className="stg__value stg__value--dim">Not signed in</span>
        </div>
      )}

      {/* ── Reset ── */}
      <button className="stg__reset" onClick={handleReset} type="button">
        Reset to Defaults
      </button>

      {/* ── Dev Tools (only visible when Lab mode is enabled) ── */}
      {isEnabled('enable_lab') && (
        <div className="stg__dev-section">
          <div className="stg__section-label">Dev Tools</div>

          {/* Analytics dashboard */}
          <div className="stg__row">
            <span className="stg__label">Analytics</span>
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => dispatch({ type: 'NAVIGATE', screen: 'analytics' })}
              type="button"
            >
              View Analytics
            </button>
          </div>

          {/* Executive dashboard (admin only) */}
          {isAdmin && (
            <div className="stg__row">
              <span className="stg__label">Exec Dashboard</span>
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => dispatch({ type: 'NAVIGATE', screen: 'exec' })}
                type="button"
              >
                View Dashboard
              </button>
            </div>
          )}

          {/* Plan tier switcher */}
          <div className="stg__row">
            <div className="stg__row-label">
              <span>Plan Tier</span>
              <span className="stg__row-hint">
                {isAdmin ? 'Admin — always Enterprise' : 'Simulate plan tier for testing'}
              </span>
            </div>
            <div className="stg__seg stg__seg--plan">
              {['free', 'paid', 'pro', 'enterprise'].map(p => (
                <button
                  key={p}
                  className={`stg__seg-btn${plan === p ? ' stg__seg-btn--on' : ''}`}
                  onClick={() => {
                    if (isAdmin) { setToast({ message: 'Admin is always Enterprise', visible: true }); return; }
                    setPlan(p);
                    if (p !== 'free') unlock(); else lock();
                    setToast({ message: `Plan set to ${PLAN_LABELS[p]}`, visible: true });
                  }}
                  type="button"
                >
                  {PLAN_LABELS[p]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── About ── */}
      <div className="stg__about" onClick={handleVersionTap} role="presentation">
        <span className="stg__about-name">No Guesswork Lighting</span>
        <span className="stg__about-version">{APP_VERSION}</span>
      </div>

      <Toast
        message={toast.message}
        visible={toast.visible}
        onDone={() => setToast(t => ({ ...t, visible: false }))}
      />
    </div>
  );
}
