/**
 * SettingsScreen — NGW Settings v2
 *
 * Four top-level sections: Experience · Intelligence · Data & Privacy · Advanced
 *
 * All existing functionality preserved:
 *   - Appearance (theme, typeface, size, density) inside Experience
 *   - Units, power readout, confidence scores inside Experience
 *   - Role mode inside Experience
 *   - Dev tools gated by enable_lab feature flag
 *   - Secret version tap to toggle dev mode
 *   - Account display
 *   - Reset to defaults
 */
import { useState, useRef, useCallback } from 'react';
import { useAppState, useDispatch } from '../context/AppContext';
import usePreviewMode from '../hooks/usePreviewMode';
import usePaywall from '../hooks/usePaywall';
import usePlan from '../hooks/usePlan';
import { PLAN_LABELS } from '../data/planStore';
import {
  loadSettings, saveSetting, applySettings, resetSettings,
  FONT_SIZES, FONT_FAMILIES, DENSITY_OPTIONS,
  UNIT_OPTIONS, POWER_DISPLAY_OPTIONS,
} from '../data/settingsStore';
import { loadTheme, saveTheme, applyTheme, THEMES } from '../data/themeStore';
import { saveMode } from '../data/modeStore';
import useMode from '../hooks/useMode';
import { isEnabled, setFlag } from '../modes/featureFlags';
import { excludeCurrentSession } from '../data/analytics';
import Toast from '../components/Toast';
import SettingsSection    from '../components/settings/SettingsSection';
import SettingsCard       from '../components/settings/SettingsCard';
import SegmentedSetting   from '../components/settings/SegmentedSetting';
import ToggleSetting      from '../components/settings/ToggleSetting';
import ActionSetting      from '../components/settings/ActionSetting';
import ConfirmActionModal from '../components/settings/ConfirmActionModal';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEV_TAP_COUNT  = 5;
const DEV_TAP_WINDOW = 3000;
const APP_VERSION    = 'v1.4.0';

const THEME_ORDER  = ['daynote', 'light', 'photoshop', 'dark'];
const THEME_LABELS = {
  daynote:   { label: 'Daynote',   name: 'Daynote' },
  light:     { label: 'Light',     name: 'Light' },
  photoshop: { label: 'Ps',        name: 'Photoshop' },
  dark:      { label: 'Dark',      name: 'Dark' },
};
const FONT_STYLES = {
  system: { fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  inter:  { fontFamily: '"Inter", "SF Pro Display", -apple-system, sans-serif' },
  source: { fontFamily: '"Source Sans 3", "Source Sans Pro", -apple-system, sans-serif' },
  mono:   { fontFamily: '"SF Mono", "JetBrains Mono", "Fira Code", monospace' },
  serif:  { fontFamily: '"Playfair Display", Georgia, "Times New Roman", serif' },
};
const SIZE_STYLES = {
  xs: { fontSize: '11px' }, small: { fontSize: '13px' },
  medium: { fontSize: '15px' }, large: { fontSize: '17px' }, xl: { fontSize: '20px' },
};

// ─── Option sets ──────────────────────────────────────────────────────────────

const ROLE_OPTIONS = [
  { id: 'photographer', label: 'Photographer' },
  { id: 'assistant',    label: 'Assistant' },
];
const VIEW_MODE_OPTIONS = [
  { id: 'quick', label: 'Quick',    title: 'Quick Reference' },
  { id: 'full',  label: 'Full',     title: 'Full Analysis' },
];
const GUIDANCE_OPTIONS = [
  { id: 'minimal', label: 'Minimal' },
  { id: 'guided',  label: 'Guided' },
  { id: 'full',    label: 'Coaching' },
];
const CONFIDENCE_DISPLAY_OPTIONS = [
  { id: 'simple',   label: 'Simple' },
  { id: 'numeric',  label: 'Numeric' },
  { id: 'detailed', label: 'Detailed' },
];
const COMPARISON_PROMPTS_OPTIONS = [
  { id: 'auto',          label: 'Auto' },
  { id: 'low_conf_only', label: 'Low conf' },
  { id: 'off',           label: 'Off' },
];
const SHOOT_MODE_STYLE_OPTIONS = [
  { id: 'step',      label: 'Step-by-step' },
  { id: 'checklist', label: 'Checklist' },
];
const AUTONOMY_OPTIONS = [
  { id: 'manual',   label: 'Manual' },
  { id: 'assisted', label: 'Assisted' },
  { id: 'adaptive', label: 'Adaptive' },
];
const FIX_GUIDANCE_OPTIONS = [
  { id: 'quick',    label: 'Quick' },
  { id: 'balanced', label: 'Balanced' },
  { id: 'detailed', label: 'Detailed' },
];
const PATTERN_SENSITIVITY_OPTIONS = [
  { id: 'strict',   label: 'Strict' },
  { id: 'balanced', label: 'Balanced' },
  { id: 'flexible', label: 'Flexible' },
];
const EXPLANATION_DEPTH_OPTIONS = [
  { id: 'brief',     label: 'Brief' },
  { id: 'standard',  label: 'Standard' },
  { id: 'technical', label: 'Technical' },
];
const SESSION_STORAGE_OPTIONS = [
  { id: 'auto',   label: 'Auto' },
  { id: 'manual', label: 'Manual' },
  { id: 'off',    label: 'Off' },
];
const IMAGE_HANDLING_OPTIONS = [
  { id: 'store',  label: 'Store' },
  { id: 'delete', label: 'Delete after' },
];

// ─── Tab config ───────────────────────────────────────────────────────────────

const TABS = [
  { id: 'experience',  label: 'Experience' },
  { id: 'intelligence', label: 'Intelligence' },
  { id: 'privacy',     label: 'Privacy' },
  { id: 'advanced',    label: 'Advanced' },
];

// ─── View-as options (Dev Tools preview) ──────────────────────────────────────

const VIEW_AS_ACCESS = [
  { id: null,    label: 'Actual',  quota: null },
  { id: 'guest', label: 'Guest',   quota: '0 / mo' },
  { id: 'free',  label: 'Free',    quota: '5 / mo' },
  { id: 'paid',  label: 'Paid',    quota: '50 / mo' },
  { id: 'admin', label: 'Admin',   quota: 'Unlimited' },
];
const VIEW_AS_ROLE = [
  { id: null,          label: 'Actual' },
  { id: 'photographer', label: 'Photographer' },
  { id: 'assistant',    label: 'Assistant' },
];

// ─── Main component ───────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const { user }   = useAppState();
  const dispatch   = useDispatch();
  const userEmail  = user?.email || user?.username || null;
  const { isPaid, unlock, lock, isAdmin } = usePaywall(userEmail);
  const { plan, setPlan }                 = usePlan(userEmail);

  const [activeTab, setActiveTab]     = useState('experience');
  const [settings, setSettings]       = useState(loadSettings);
  const [theme, setTheme]             = useState(() => loadTheme() || 'dark');
  const roleMode = useMode();
  const [toast, setToast]             = useState({ message: '', visible: false });
  const [confirm, setConfirm]         = useState(null);

  // View As — shared global hook (syncs banner on every screen)
  const { access: viewAsAccess, role: viewAsRole, setAccess: setViewAsAccess, setRole: setViewAsRole, clear: clearPreview, isPreviewing } = usePreviewMode();

  // Derive effective values from the view-as overrides
  const effectiveIsAdmin = viewAsAccess !== null ? viewAsAccess === 'admin' : isAdmin;
  const effectiveIsPaid  = viewAsAccess !== null ? (viewAsAccess === 'paid' || viewAsAccess === 'admin') : isPaid;
  const effectiveIsGuest = viewAsAccess !== null ? viewAsAccess === 'guest' : !user;
  const effectiveRole    = viewAsRole   !== null ? viewAsRole : roleMode;
  const [isTestSession, setIsTestSession] = useState(() => {
    try { return sessionStorage.getItem('ngw_test_session') === '1'; } catch { return false; }
  });

  const tapTimestamps = useRef([]);

  function showToast(message) {
    setToast({ message, visible: true });
  }

  function update(key, value) {
    saveSetting(key, value);
    const next = { ...settings, [key]: value };
    setSettings(next);
    applySettings(next);
  }

  function handleThemeChange(t) {
    saveTheme(t); applyTheme(t); setTheme(t);
  }

  function handleReset() {
    setConfirm({
      title: 'Reset to Defaults',
      message: 'All settings will return to their defaults. This cannot be undone.',
      confirmText: 'Reset',
      destructive: true,
      onConfirm: () => {
        resetSettings();
        setSettings(loadSettings());
        saveTheme('dark'); applyTheme('dark'); setTheme('dark');
        setConfirm(null);
        showToast('Reset to defaults');
      },
    });
  }

  function handleSystemReset() {
    setConfirm({
      title: 'Reset System State',
      message: 'Clears locally stored learning data, session state, and cached results. Your account is not affected.',
      confirmText: 'Reset System',
      destructive: true,
      onConfirm: () => {
        try {
          Object.keys(localStorage).forEach(k => {
            if (k.startsWith('ngw_session_') || k.startsWith('ngw_learn_')) {
              localStorage.removeItem(k);
            }
          });
          sessionStorage.clear();
        } catch (_) {}
        setConfirm(null);
        showToast('System state cleared');
      },
    });
  }

  function handleRollback() {
    setConfirm({
      title: 'Rollback Last Adjustment',
      message: 'The most recent autonomous system adjustment will be reversed.',
      confirmText: 'Rollback',
      destructive: true,
      onConfirm: () => {
        setConfirm(null);
        showToast('No recent adjustment to roll back');
      },
    });
  }

  async function handleTestSessionToggle(v) {
    const ok = await excludeCurrentSession(v);
    if (ok) {
      try { sessionStorage.setItem('ngw_test_session', v ? '1' : '0'); } catch {}
      setIsTestSession(v);
      showToast(v ? 'Session excluded from analytics' : 'Session restored to analytics');
    } else {
      showToast(user ? 'Could not update session — try again' : 'Sign in to exclude sessions');
    }
  }

  function handleSimulateLowConf() {
    try { sessionStorage.setItem('ngw_sim_low_conf', '1'); } catch (_) {}
    showToast('Low confidence simulation active — reload results to see effect');
  }

  const handleVersionTap = useCallback(() => {
    const now  = Date.now();
    const taps = tapTimestamps.current;
    taps.push(now);
    while (taps.length && taps[0] < now - DEV_TAP_WINDOW) taps.shift();
    if (taps.length >= DEV_TAP_COUNT) {
      taps.length = 0;
      const wasEnabled = isEnabled('enable_lab');
      setFlag('enable_lab', !wasEnabled);
      showToast(wasEnabled ? 'Dev mode disabled' : 'Dev mode enabled');
    }
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="stg">
      <h2 className="stg__title">Settings</h2>

      {/* ── Tab bar ───────────────────────────────────────────────────── */}
      <div className="stg__tabs">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`stg__tab${activeTab === tab.id ? ' stg__tab--on' : ''}`}
            onClick={() => setActiveTab(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── 1. EXPERIENCE ─────────────────────────────────────────────── */}
      {activeTab === 'experience' && (
        <>
          <SettingsCard label="Results">
            <SegmentedSetting
              label="View Mode"
              description="Quick Reference shows key outputs only. Full Analysis shows all cards and reasoning."
              options={VIEW_MODE_OPTIONS}
              value={settings.viewMode}
              onChange={v => update('viewMode', v)}
            />
            <SegmentedSetting
              label="Guidance Level"
              description="How much coaching language appears in results and fix suggestions."
              options={GUIDANCE_OPTIONS}
              value={settings.guidanceLevel}
              onChange={v => update('guidanceLevel', v)}
            />
            <SegmentedSetting
              label="Confidence Display"
              description="Simple shows pass/fail only. Numeric shows scores. Detailed shows per-signal breakdown."
              options={CONFIDENCE_DISPLAY_OPTIONS}
              value={settings.confidenceDisplay}
              onChange={v => {
                update('confidenceDisplay', v);
                update('showConfidenceScore', v !== 'simple');
              }}
            />
            <SegmentedSetting
              label="Comparison Prompts"
              description="When to suggest comparing your setup to a reference image."
              options={COMPARISON_PROMPTS_OPTIONS}
              value={settings.comparisonPrompts}
              onChange={v => update('comparisonPrompts', v)}
            />
          </SettingsCard>

          <SettingsCard label="Shoot Mode">
            <SegmentedSetting
              label="Style"
              description="Step-by-step guides one action at a time. Checklist shows all steps at once."
              options={SHOOT_MODE_STYLE_OPTIONS}
              value={settings.shootModeStyle}
              onChange={v => update('shootModeStyle', v)}
            />
            <SegmentedSetting
              label="Role Mode"
              description={effectiveRole === 'assistant'
                ? 'Direct commands — short, no explanation.'
                : 'Outcome context — results and reasoning.'}
              options={ROLE_OPTIONS}
              value={effectiveRole}
              onChange={v => { if (!isPreviewing) saveMode(v); }}
            />
          </SettingsCard>

          <SettingsCard label="Measurement">
            <SegmentedSetting
              label="Units"
              options={UNIT_OPTIONS}
              value={settings.units}
              onChange={v => update('units', v)}
            />
            <SegmentedSetting
              label="Power Readout"
              description="How strobe power levels appear in diagrams and cards."
              options={POWER_DISPLAY_OPTIONS}
              value={settings.powerDisplay}
              onChange={v => update('powerDisplay', v)}
            />
          </SettingsCard>

          <SettingsCard label="Appearance">
            <div className="stg-row">
              <div className="stg-row__meta"><span className="stg-row__label">Theme</span></div>
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
            <div className="stg-row">
              <div className="stg-row__meta"><span className="stg-row__label">Typeface</span></div>
              <div className="stg__seg">
                {FONT_FAMILIES.map(ff => (
                  <button
                    key={ff.id}
                    className={`stg__seg-btn${settings.fontFamily === ff.id ? ' stg__seg-btn--on' : ''}`}
                    onClick={() => update('fontFamily', ff.id)}
                    style={FONT_STYLES[ff.id]}
                    type="button"
                  >
                    {ff.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="stg-row">
              <div className="stg-row__meta"><span className="stg-row__label">Size</span></div>
              <div className="stg__seg">
                {FONT_SIZES.map(fs => (
                  <button
                    key={fs.id}
                    className={`stg__seg-btn${settings.fontSize === fs.id ? ' stg__seg-btn--on' : ''}`}
                    onClick={() => update('fontSize', fs.id)}
                    style={SIZE_STYLES[fs.id]}
                    type="button"
                  >
                    {fs.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="stg-row">
              <div className="stg-row__meta"><span className="stg-row__label">Density</span></div>
              <div className="stg__seg">
                {DENSITY_OPTIONS.map(d => (
                  <button
                    key={d.id}
                    className={`stg__seg-btn${settings.density === d.id ? ' stg__seg-btn--on' : ''}`}
                    onClick={() => update('density', d.id)}
                    type="button"
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          </SettingsCard>
        </>
      )}

      {/* ── 2. INTELLIGENCE ───────────────────────────────────────────── */}
      {activeTab === 'intelligence' && (
        <SettingsCard>
          {!effectiveIsPaid && (
            <div className="stg-upsell">
              <span className="stg-upsell__text">Intelligence settings require a paid plan.</span>
              {!isPreviewing && (
                <button className="stg-upsell__btn" type="button" onClick={unlock}>Upgrade</button>
              )}
            </div>
          )}
          <SegmentedSetting
            label="Autonomy Level"
            description="Manual: you decide everything. Assisted: system flags issues. Adaptive: suggestions improve over time."
            options={AUTONOMY_OPTIONS}
            value={settings.autonomyLevel}
            onChange={v => update('autonomyLevel', v)}
          />
          <SegmentedSetting
            label="Fix Guidance Style"
            description="How quick-fix suggestions are ordered and presented."
            options={FIX_GUIDANCE_OPTIONS}
            value={settings.fixGuidanceStyle}
            onChange={v => update('fixGuidanceStyle', v)}
          />
          <SegmentedSetting
            label="Pattern Sensitivity"
            description="Strict requires strong signal agreement. Flexible accepts partial matches."
            options={PATTERN_SENSITIVITY_OPTIONS}
            value={settings.patternSensitivity}
            onChange={v => update('patternSensitivity', v)}
          />
          <SegmentedSetting
            label="Explanation Depth"
            description="How much technical reasoning appears in results and fix cards."
            options={EXPLANATION_DEPTH_OPTIONS}
            value={settings.explanationDepth}
            onChange={v => update('explanationDepth', v)}
          />
        </SettingsCard>
      )}

      {/* ── 3. PRIVACY ────────────────────────────────────────────────── */}
      {activeTab === 'privacy' && (
        <>
          <SettingsCard label="Learning & Analytics">
            <ToggleSetting
              label="Allow Learning from Sessions"
              description="Outcome signals improve pattern detection. Never linked to your identity."
              value={settings.allowLearning}
              onChange={v => update('allowLearning', v)}
            />
            <ToggleSetting
              label="Allow Analytics Tracking"
              description="Anonymous usage data helps improve the app. No images or results included."
              value={settings.allowAnalytics}
              onChange={v => update('allowAnalytics', v)}
            />
            <ToggleSetting
              label="This is a test session"
              description="Excludes this browser session from usage metrics and dashboards."
              value={isTestSession}
              onChange={handleTestSessionToggle}
            />
          </SettingsCard>

          <SettingsCard label="Storage">
            <SegmentedSetting
              label="Session Storage"
              description="Auto saves sessions automatically. Manual requires you to save. Off stores nothing."
              options={SESSION_STORAGE_OPTIONS}
              value={settings.sessionStorage}
              onChange={v => update('sessionStorage', v)}
            />
            <SegmentedSetting
              label="Image Handling"
              description="Store keeps reference images for future sessions. Delete after analysis removes them immediately."
              options={IMAGE_HANDLING_OPTIONS}
              value={settings.imageHandling}
              onChange={v => update('imageHandling', v)}
            />
          </SettingsCard>

          <SettingsCard label="Analytics">
            {effectiveIsGuest ? (
              <div className="stg-row">
                <div className="stg-row__meta">
                  <span className="stg-row__label">Analytics unavailable</span>
                  <span className="stg-row__desc">Sign in to access session history and usage data.</span>
                </div>
              </div>
            ) : (
              <ActionSetting
                label="Usage Analytics"
                description="View your session history, pattern detection stats, and usage trends."
                buttonText="View Analytics"
                onClick={() => { if (!isPreviewing) dispatch({ type: 'NAVIGATE', screen: 'analytics' }); }}
              />
            )}
            {effectiveIsAdmin && (
              <ActionSetting
                label="Exec Dashboard"
                description="Executive metrics and aggregate system statistics (admin only)."
                buttonText="View Dashboard"
                onClick={() => { if (!isPreviewing) dispatch({ type: 'NAVIGATE', screen: 'exec' }); }}
              />
            )}
          </SettingsCard>
        </>
      )}

      {/* ── 4. ADVANCED ───────────────────────────────────────────────── */}
      {activeTab === 'advanced' && (
        <>
          <SettingsCard label="Autonomy Controls">
            <ToggleSetting
              label="UI Self-Tuning"
              description="Allows the interface to adjust card order and layout based on your usage patterns."
              value={settings.uiSelfTuning}
              onChange={v => update('uiSelfTuning', v)}
            />
            <ToggleSetting
              label="Experiment Participation"
              description="Opt in to receive early-access features and A/B test variants."
              value={settings.experimentParticipation}
              onChange={v => update('experimentParticipation', v)}
            />
          </SettingsCard>

          <SettingsCard label="Debug & Diagnostics">
            <ToggleSetting
              label="Show Debug Signals"
              description="Overlays raw vision signals and confidence scores on results cards."
              value={settings.showDebugSignals}
              onChange={v => update('showDebugSignals', v)}
            />
            <ActionSetting
              label="View Event Logs"
              description="Browse recent system events and analysis logs."
              buttonText="View Logs"
              onClick={() => dispatch({ type: 'NAVIGATE', screen: 'analytics' })}
            />
            <ActionSetting
              label="Simulate Low Confidence"
              description="Forces a low-confidence state in the next analysis run."
              buttonText="Simulate"
              onClick={handleSimulateLowConf}
            />
            <ActionSetting
              label="Reset System State"
              description="Clears locally stored learning data, session state, and cached results."
              buttonText="Reset State"
              destructive
              onClick={handleSystemReset}
            />
          </SettingsCard>

          <SettingsCard label="System Safety">
            <ToggleSetting
              label="Stability Mode"
              description="Prevents autonomous adjustments from stacking. Recommended while learning the system."
              value={settings.stabilityMode}
              onChange={v => update('stabilityMode', v)}
            />
            <ActionSetting
              label="Recent System Adjustments"
              description="View a log of recent autonomous changes."
              buttonText="View Log"
              onClick={() => dispatch({ type: 'NAVIGATE', screen: 'analytics' })}
            />
            <ActionSetting
              label="Rollback Last Adjustment"
              description="Reverse the most recent autonomous system adjustment."
              buttonText="Rollback"
              destructive
              onClick={handleRollback}
            />
          </SettingsCard>

          {/* Preview As — available to all users */}
          <SettingsCard label="Preview As">
            <div className="stg-row stg-row--action stg-row--view-as">
              <div className="stg-row__meta">
                <span className="stg-row__label">Access Level</span>
                <span className="stg-row__desc">See the app as a different account type — paywalls, feature access, and cards adapt to the selection.</span>
              </div>
              <div className="stg__view-as-group">
                <div className="stg__view-as-row">
                  <span className="stg__view-as-sublabel">Access</span>
                  <div className="stg__seg stg__seg--quota">
                    {VIEW_AS_ACCESS.map(o => (
                      <button
                        key={String(o.id)}
                        className={`stg__seg-btn stg__seg-btn--quota${viewAsAccess === o.id ? ' stg__seg-btn--on' : ''}`}
                        onClick={() => setViewAsAccess(o.id)}
                        type="button"
                      >
                        <span className="stg__seg-btn-label">{o.label}</span>
                        {o.quota && <span className="stg__seg-btn-quota">{o.quota}</span>}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="stg__view-as-row">
                  <span className="stg__view-as-sublabel">Role</span>
                  <div className="stg__seg">
                    {VIEW_AS_ROLE.map(o => (
                      <button
                        key={String(o.id)}
                        className={`stg__seg-btn${viewAsRole === o.id ? ' stg__seg-btn--on' : ''}`}
                        onClick={() => setViewAsRole(o.id)}
                        type="button"
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </SettingsCard>

          {isEnabled('enable_lab') && isAdmin && (
            <SettingsCard label="Dev Tools">
              {/* Plan tier (actual — not preview) */}
              <div className="stg-row stg-row--action">
                <div className="stg-row__meta">
                  <span className="stg-row__label">Plan Tier</span>
                  <span className="stg-row__desc">
                    {isAdmin ? 'Admin — always Enterprise' : 'Simulate plan tier for testing'}
                  </span>
                </div>
                <div className="stg__seg stg__seg--plan">
                  {['free', 'paid', 'pro', 'enterprise'].map(p => (
                    <button
                      key={p}
                      className={`stg__seg-btn${plan === p ? ' stg__seg-btn--on' : ''}`}
                      onClick={() => {
                        if (isAdmin) { showToast('Admin is always Enterprise'); return; }
                        setPlan(p);
                        if (p !== 'free') unlock(); else lock();
                        showToast(`Plan set to ${PLAN_LABELS[p]}`);
                      }}
                      type="button"
                    >
                      {PLAN_LABELS[p]}
                    </button>
                  ))}
                </div>
              </div>
            </SettingsCard>
          )}
        </>
      )}

      {/* ── Account ─────────────────────────────────────────────────────── */}
      <div className="stg-account">
        {user ? (
          <>
            <div className="stg-account__row">
              <span className="stg-account__label">Signed in as</span>
              <span className="stg-account__value">{user.username}</span>
            </div>
            <div className="stg-account__row" style={{ marginTop: 'var(--space-xs)' }}>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                style={{ fontSize: 'var(--text-xs)' }}
                onClick={() => dispatch({ type: 'NAVIGATE', screen: 'onboarding' })}
              >
                Edit photographer profile
              </button>
            </div>
          </>
        ) : (
          <div className="stg-account__row">
            <span className="stg-account__label">Account</span>
            <span className="stg-account__value stg-account__value--dim">Not signed in</span>
          </div>
        )}
      </div>

      {/* ── Reset ───────────────────────────────────────────────────────── */}
      <button className="stg__reset" onClick={handleReset} type="button">
        Reset to Defaults
      </button>

      {/* ── About (5× tap toggles dev mode) ─────────────────────────────── */}
      <div className="stg__about" onClick={handleVersionTap} role="presentation">
        <span className="stg__about-name">No Guesswork Lighting</span>
        <span className="stg__about-version">{APP_VERSION}</span>
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────── */}
      <ConfirmActionModal
        open={!!confirm}
        title={confirm?.title}
        message={confirm?.message}
        confirmText={confirm?.confirmText}
        destructive={confirm?.destructive}
        onConfirm={confirm?.onConfirm}
        onCancel={() => setConfirm(null)}
      />

      <Toast
        message={toast.message}
        visible={toast.visible}
        onDone={() => setToast(t => ({ ...t, visible: false }))}
      />
    </div>
  );
}
