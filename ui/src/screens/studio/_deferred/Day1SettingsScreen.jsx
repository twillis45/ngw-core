/**
 * Day1SettingsScreen — Studio Matte design
 * Three sub-screens: main → preferences | account
 * No AppContext dependency; accepts user/onBack/onLogout props.
 */
import { useState, useRef, useCallback } from 'react';
import { tapHaptic, selectHaptic, navHaptic } from '../../../utils/haptics';
import { softClickSound, navSlideSound, panelToggleSound } from '../../../utils/sounds';
import { saveSetting, loadSettings, resetSettings, applySettings,
         FONT_SIZES, POWER_DISPLAY_OPTIONS } from '../../../data/settingsStore';
import { loadMode, saveMode } from '../../../data/modeStore';
import { isEnabled, setFlag } from '../../../modes/featureFlags';
import useMode from '../../../hooks/useMode';
import { steel, C as SM_C, FONT_SMOOTH, PANEL_SHADOW, PANEL_BEVEL, GREEN } from '../../../theme/studioMatte';
import { Panel, Divider, SectionLabel, NavRow, ToggleRow, InfoRow, ScreenHeader, HomeIndicator }
  from '../_core/components';
import MatteBackground from '../_shared/MatteBackground';

const SUPPORT_EMAIL = 'hello@noguesswork.com';
const HELP_URL      = 'https://noguessworksystems.com/help';
const PRIVACY_URL   = 'https://noguessworksystems.com/privacy';
const TERMS_URL     = 'https://noguessworksystems.com/terms';
const APP_VERSION   = 'v1.4.0';
const DEV_TAP_COUNT  = 5;
const DEV_TAP_WINDOW = 3000;

// ─── Screen-local token extensions ───────────────────────────────────────────
const C = { ...SM_C, textDanger: 'rgba(200,70,70,0.82)' };
const FS = FONT_SMOOTH;  // shorthand alias used throughout this file

const ROLE_META = {
  photographer: { label: 'Photographer', initial: 'P', tagline: 'Full analysis — patterns, confidence, all technical detail.' },
  assistant:    { label: 'Assistant',    initial: 'A', tagline: 'Optimised for executing a setup — gear-first workflow.' },
  learning:     { label: 'Learning',     initial: 'L', tagline: 'Coaching and explanations — less noise, more guidance.' },
};

// ─── Preferences sub-screen ───────────────────────────────────────────────────
function PreferencesScreen({ settings, update, onBack, mode }) {
  function cycleOption(key, options) {
    const idx = options.findIndex(o => o.id === settings[key]);
    const next = options[(idx + 1) % options.length];
    update(key, next.id);
  }

  return (
    <div style={{ minHeight: '100dvh', backgroundColor: C.bg, fontFamily: 'Inter, system-ui, -apple-system, sans-serif', overflowY: 'auto' }}>
      <MatteBackground variant="subdued" />
      <ScreenHeader title="Preferences" onBack={onBack} />
      <div style={{ padding: '8px 20px 48px', position: 'relative', zIndex: 1 }}>

        <SectionLabel label="APPEARANCE" />
        <Panel>
          <ToggleRow label="Haptic feedback" value={settings.hapticFeedback !== false} onChange={v => update('hapticFeedback', v)} />
          <Divider />
          <ToggleRow label="Reduce motion" value={!!settings.reduceMotion} onChange={v => update('reduceMotion', v)} />
          <Divider />
          <NavRow
            label="Font size"
            value={(FONT_SIZES.find(f => f.id === settings.fontSize) || FONT_SIZES[2]).label}
            onClick={() => cycleOption('fontSize', FONT_SIZES)}
          />
          <Divider />
          <NavRow
            label="Unit system"
            value={settings.units === 'metric' ? 'Metric' : 'Imperial'}
            onClick={() => update('units', settings.units === 'metric' ? 'imperial' : 'metric')}
          />
        </Panel>

        <SectionLabel label="ANALYSIS" />
        <Panel>
          <NavRow
            label="Confidence display"
            value={settings.confidenceDisplay === 'numeric' ? 'Numeric' : settings.confidenceDisplay === 'detailed' ? 'Detailed' : 'Simple'}
            onClick={() => {
              const opts = ['simple', 'numeric', 'detailed'];
              const idx = opts.indexOf(settings.confidenceDisplay || 'simple');
              update('confidenceDisplay', opts[(idx + 1) % opts.length]);
            }}
          />
          <Divider />
          <NavRow
            label="Pattern sensitivity"
            value={settings.patternSensitivity === 'strict' ? 'Strict' : settings.patternSensitivity === 'flexible' ? 'Flexible' : 'Balanced'}
            onClick={() => {
              const opts = ['strict', 'balanced', 'flexible'];
              const idx = opts.indexOf(settings.patternSensitivity || 'balanced');
              update('patternSensitivity', opts[(idx + 1) % opts.length]);
            }}
          />
          <Divider />
          <ToggleRow
            label="Show confidence score"
            value={!!settings.showConfidenceScore}
            onChange={v => update('showConfidenceScore', v)}
          />
          <Divider />
          <NavRow
            label="Explanation depth"
            value={settings.explanationDepth === 'brief' ? 'Brief' : settings.explanationDepth === 'technical' ? 'Technical' : 'Standard'}
            onClick={() => {
              const opts = ['brief', 'standard', 'technical'];
              const idx = opts.indexOf(settings.explanationDepth || 'standard');
              update('explanationDepth', opts[(idx + 1) % opts.length]);
            }}
          />
        </Panel>

        <SectionLabel label="SHOOT MODE" />
        <Panel>
          <NavRow
            label="Comparison prompts"
            value={settings.comparisonPrompts === 'low_conf_only' ? 'Low conf' : settings.comparisonPrompts === 'off' ? 'Off' : 'Auto'}
            onClick={() => {
              const opts = ['auto', 'low_conf_only', 'off'];
              const idx = opts.indexOf(settings.comparisonPrompts || 'auto');
              update('comparisonPrompts', opts[(idx + 1) % opts.length]);
            }}
          />
          <Divider />
          <NavRow
            label="Power readout"
            value={(POWER_DISPLAY_OPTIONS.find(p => p.id === settings.powerDisplay) || POWER_DISPLAY_OPTIONS[0]).label}
            onClick={() => cycleOption('powerDisplay', POWER_DISPLAY_OPTIONS)}
          />
        </Panel>

        <SectionLabel label="PRIVACY" />
        <Panel>
          <ToggleRow
            label="Allow analytics"
            value={settings.allowAnalytics !== false}
            onChange={v => update('allowAnalytics', v)}
          />
          <Divider />
          <NavRow
            label="Image handling"
            value={settings.imageHandling === 'delete' ? 'Delete after' : 'Store'}
            onClick={() => update('imageHandling', settings.imageHandling === 'delete' ? 'store' : 'delete')}
          />
        </Panel>

        <div style={{ height: 1 }} />
        <Panel>
          <NavRow label="Reset to Defaults" danger onClick={() => {
            resetSettings(); applySettings(loadSettings());
            softClickSound();
          }} />
        </Panel>

      </div>
    </div>
  );
}

// ─── Account sub-screen ───────────────────────────────────────────────────────
function AccountScreen({ user, onBack, onLogout }) {
  const [resetSent, setResetSent] = useState(false);
  const displayEmail = user?.email || user?.username || '';

  async function handlePasswordReset() {
    if (!displayEmail) return;
    try {
      const res = await fetch('/api/auth/password-reset/request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: displayEmail }),
      });
      setResetSent(res.ok);
    } catch { setResetSent(false); }
  }

  return (
    <div style={{ minHeight: '100dvh', backgroundColor: C.bg, fontFamily: 'Inter, system-ui, -apple-system, sans-serif', overflowY: 'auto' }}>
      <MatteBackground variant="subdued" />
      <ScreenHeader title="Account" onBack={onBack} />
      <div style={{ padding: '8px 20px 48px', position: 'relative', zIndex: 1 }}>

        {/* Plan card */}
        <div style={{
          backgroundColor: '#0c0e14',
          borderRadius: 14, padding: '18px 20px',
          boxShadow: `${PANEL_SHADOW}, ${PANEL_BEVEL}`,
          border: '0.5px solid rgba(72,186,136,0.15)',
          marginTop: 8,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.textPrimary, ...FS }}>Pro Plan</p>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: steel(0.55), ...FS }}>Active subscription</p>
            </div>
            <div style={{
              backgroundColor: 'rgba(72,186,136,0.12)', border: '0.5px solid rgba(72,186,136,0.3)',
              borderRadius: 8, padding: '5px 10px',
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: GREEN, letterSpacing: '0.8px', ...FS }}>ACTIVE</span>
            </div>
          </div>
        </div>

        <SectionLabel label="ACCOUNT" />
        <Panel>
          <InfoRow label="Email" value={displayEmail || '—'} />
          <Divider />
          <NavRow
            label={resetSent ? 'Reset link sent ✓' : 'Reset Password'}
            onClick={handlePasswordReset}
          />
        </Panel>

        <SectionLabel label="BILLING" />
        <Panel>
          <NavRow
            label="Manage billing & invoices"
            onClick={() => window.open(`mailto:${SUPPORT_EMAIL}?subject=Billing%20%26%20Invoices`, '_blank')}
          />
        </Panel>

        <div style={{ height: 16 }} />
        <Panel>
          <NavRow label="Sign Out" danger onClick={onLogout} />
        </Panel>

        <div style={{ height: 8 }} />
        <Panel>
          <NavRow label="Delete Account" danger onClick={() => {}} />
        </Panel>

      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Day1SettingsScreen({ user, onBack, onLogout }) {
  const [subScreen, setSubScreen] = useState('main');
  const [settings, setSettings]   = useState(loadSettings);
  const mode = useMode();
  const tapTimestamps = useRef([]);

  function update(key, val) {
    saveSetting(key, val);
    setSettings(prev => ({ ...prev, [key]: val }));
  }

  function cycleMode() {
    const modes = ['photographer', 'assistant', 'learning'];
    const idx = modes.indexOf(mode);
    saveMode(modes[(idx + 1) % modes.length]);
    softClickSound(); tapHaptic();
  }

  const handleVersionTap = useCallback(() => {
    const now  = Date.now();
    const taps = tapTimestamps.current;
    taps.push(now);
    while (taps.length && taps[0] < now - DEV_TAP_WINDOW) taps.shift();
    if (taps.length >= DEV_TAP_COUNT) {
      taps.length = 0;
      const was = isEnabled('enable_lab');
      setFlag('enable_lab', !was);
    }
  }, []);

  const displayName  = user?.username || user?.email?.split('@')[0] || 'User';
  const displayEmail = user?.email || user?.username || '';

  if (subScreen === 'preferences') {
    return (
      <PreferencesScreen
        settings={settings}
        update={update}
        onBack={() => { navSlideSound(); setSubScreen('main'); }}
        mode={mode}
      />
    );
  }

  if (subScreen === 'account') {
    return (
      <AccountScreen
        user={user}
        onBack={() => { navSlideSound(); setSubScreen('main'); }}
        onLogout={onLogout}
      />
    );
  }

  // ── MAIN ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: '100dvh', backgroundColor: C.bg, fontFamily: 'Inter, system-ui, -apple-system, sans-serif', overflowY: 'auto' }}>
      <MatteBackground variant="subdued" />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '16px 20px 8px', position: 'sticky', top: 0, backgroundColor: 'rgba(8,9,12,0.92)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', zIndex: 10 }}>
        <button
          onClick={() => { navSlideSound(); navHaptic(); onBack?.(); }}
          style={{ backgroundColor: 'transparent', border: 'none', cursor: 'pointer', fontSize: 16, color: steel(0.65), padding: '4px 0', WebkitTapHighlightColor: 'transparent', minWidth: 64, textAlign: 'left', ...FS }}
        >‹ Back</button>
        <h1 style={{ flex: 1, textAlign: 'center', margin: 0, fontSize: 16, fontWeight: 700, color: C.textPrimary, letterSpacing: '-0.2px', ...FS }}>Settings</h1>
        <div style={{ minWidth: 64 }} />
      </div>

      <div style={{ padding: '8px 20px 48px', position: 'relative', zIndex: 1 }}>

        {/* ── User card (taps → account) ── */}
        <button
          onClick={() => { navSlideSound(); tapHaptic(); setSubScreen('account'); }}
          style={{
            width: '100%', backgroundColor: C.panelBg, border: 'none', cursor: 'pointer',
            borderRadius: 14, padding: '16px 20px',
            boxShadow: `${PANEL_SHADOW}, ${PANEL_BEVEL}`,
            display: 'flex', alignItems: 'center', gap: 14,
            WebkitTapHighlightColor: 'transparent', marginTop: 8,
          }}
        >
          {/* Avatar */}
          <div style={{
            width: 44, height: 44, borderRadius: 22, flexShrink: 0,
            backgroundColor: '#161820',
            boxShadow: '0px 2px 6px rgba(0,0,0,0.6), inset 0px 1px 0px rgba(255,255,255,0.05)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 18, color: steel(0.7), fontWeight: 600, ...FS }}>
              {displayName.charAt(0).toUpperCase()}
            </span>
          </div>
          {/* Info */}
          <div style={{ flex: 1, textAlign: 'left' }}>
            <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: C.textPrimary, ...FS }}>{displayName}</p>
            {displayEmail && displayEmail !== displayName && (
              <p style={{ margin: '3px 0 0', fontSize: 12, color: steel(0.5), ...FS }}>{displayEmail}</p>
            )}
          </div>
          {/* Pro badge + chevron */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              backgroundColor: 'rgba(72,186,136,0.1)', border: '0.5px solid rgba(72,186,136,0.2)',
              borderRadius: 6, padding: '3px 8px',
            }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: GREEN, letterSpacing: '0.8px', ...FS }}>PRO</span>
            </div>
            <span style={{ fontSize: 16, color: steel(0.45), lineHeight: 1 }}>›</span>
          </div>
        </button>

        {/* ── Role banner (taps to cycle mode) ── */}
        <button
          onClick={cycleMode}
          style={{
            width: '100%', backgroundColor: C.panelBg, border: 'none', cursor: 'pointer',
            borderRadius: 14, padding: '14px 20px', marginTop: 10,
            boxShadow: `${PANEL_SHADOW}, ${PANEL_BEVEL}`,
            display: 'flex', alignItems: 'center', gap: 12,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <div style={{
            width: 32, height: 32, borderRadius: 8, flexShrink: 0,
            backgroundColor: 'rgba(132, 158, 184,0.12)',
            boxShadow: 'inset 0px 1px 2px rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: steel(0.65), ...FS }}>
              {ROLE_META[mode]?.initial || 'P'}
            </span>
          </div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: C.textPrimary, ...FS }}>
              {ROLE_META[mode]?.label || 'Photographer'} mode
            </p>
            <p style={{ margin: '3px 0 0', fontSize: 11, color: steel(0.5), lineHeight: '14px', ...FS }}>
              {ROLE_META[mode]?.tagline}
            </p>
          </div>
          <span style={{ fontSize: 11, color: steel(0.4), flexShrink: 0, ...FS }}>Tap to change ›</span>
        </button>

        {/* ── GENERAL ── */}
        <SectionLabel label="GENERAL" />
        <Panel>
          <NavRow
            label="Units"
            value={settings.units === 'metric' ? 'Metric' : 'Imperial'}
            onClick={() => update('units', settings.units === 'metric' ? 'imperial' : 'metric')}
          />
          <Divider />
          <ToggleRow
            label="Analysis auto-save"
            value={settings.sessionStorage === 'auto'}
            onChange={v => update('sessionStorage', v ? 'auto' : 'manual')}
          />
          <Divider />
          <NavRow
            label="Preferences"
            onClick={() => { navSlideSound(); tapHaptic(); setSubScreen('preferences'); }}
          />
        </Panel>

        {/* ── SUPPORT ── */}
        <SectionLabel label="SUPPORT" />
        <Panel>
          <NavRow label="Help & FAQ" onClick={() => window.open(HELP_URL, '_blank')} />
          <Divider />
          <NavRow label="Contact support" onClick={() => window.open(`mailto:${SUPPORT_EMAIL}?subject=NGW%20Support`, '_blank')} />
          <Divider />
          <NavRow label="Rate NGW" onClick={() => {}} />
        </Panel>

        {/* ── LEGAL ── */}
        <SectionLabel label="LEGAL" />
        <Panel>
          <NavRow label="Privacy Policy" onClick={() => window.open(PRIVACY_URL, '_blank')} />
          <Divider />
          <NavRow label="Terms of Service" onClick={() => window.open(TERMS_URL, '_blank')} />
        </Panel>

        {/* ── Sign out ── */}
        {user && (
          <>
            <div style={{ height: 8 }} />
            <Panel>
              <NavRow label="Sign Out" danger onClick={onLogout} />
            </Panel>
          </>
        )}

        {/* ── Version tap (hidden dev mode trigger) ── */}
        <div
          onClick={handleVersionTap}
          style={{ textAlign: 'center', padding: '28px 0 8px', cursor: 'default' }}
        >
          <p style={{ margin: 0, fontSize: 11, color: steel(0.40), ...FS }}>No Guesswork Lighting</p>
          <p style={{ margin: '4px 0 0', fontSize: 10, color: steel(0.35), ...FS }}>{APP_VERSION}</p>
        </div>

      </div>

      <HomeIndicator />
    </div>
  );
}
