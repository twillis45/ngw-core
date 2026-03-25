/**
 * OnboardingScreen — shown once after first registration.
 *
 * Captures photographer profile: display name, experience level,
 * primary genre, typical setting, primary modifier.
 *
 * Data saved to user_preferences under key 'photographer_profile'.
 * Navigates to 'welcome' on save or skip.
 */

import { useState, useEffect } from 'react';
import { useDispatch } from '../context/AppContext';
import { savePreference, loadPreferences, getUser } from '../data/authApi';

// ── Option sets ────────────────────────────────────────────────────────────────

const EXPERIENCE = [
  { value: 'hobbyist',   label: 'Hobbyist',   desc: 'Learning the craft' },
  { value: 'enthusiast', label: 'Enthusiast', desc: 'Serious about it' },
  { value: 'semi_pro',   label: 'Semi-pro',   desc: 'Paid work sometimes' },
  { value: 'pro',        label: 'Professional', desc: 'Full-time photographer' },
];

const GENRE = [
  { value: 'portrait',   label: 'Portrait' },
  { value: 'wedding',    label: 'Wedding' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'editorial',  label: 'Editorial / Fashion' },
  { value: 'event',      label: 'Event' },
  { value: 'other',      label: 'Other' },
];

const SETTING = [
  { value: 'studio',    label: 'Studio',      icon: '🏢' },
  { value: 'location',  label: 'On-location', icon: '🌤' },
  { value: 'mixed',     label: 'Both',        icon: '↔' },
];

const MODIFIER = [
  { value: 'softbox',     label: 'Softbox' },
  { value: 'octobox',     label: 'Octobox' },
  { value: 'beauty_dish', label: 'Beauty dish' },
  { value: 'umbrella',    label: 'Umbrella' },
  { value: 'natural',     label: 'Natural light' },
  { value: 'varies',      label: 'Varies' },
];

// ── Sub-components ─────────────────────────────────────────────────────────────

function FieldLabel({ children, hint }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{
        fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)',
        color: 'var(--color-text)', marginBottom: hint ? 2 : 0,
      }}>{children}</div>
      {hint && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{hint}</div>
      )}
    </div>
  );
}

function PillGroup({ options, value, onChange, multi = false }) {
  function toggle(v) {
    if (!multi) { onChange(v); return; }
    const cur = Array.isArray(value) ? value : [];
    onChange(cur.includes(v) ? cur.filter(x => x !== v) : [...cur, v]);
  }
  function isSelected(v) {
    return multi ? (Array.isArray(value) && value.includes(v)) : value === v;
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {options.map(opt => {
        const sel = isSelected(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => toggle(opt.value)}
            style={{
              padding: '7px 14px',
              borderRadius: 999,
              border: `1.5px solid ${sel ? 'var(--color-accent)' : 'var(--color-border)'}`,
              background: sel ? 'var(--color-accent)' : 'var(--color-surface-elevated)',
              color: sel ? '#fff' : 'var(--color-text)',
              fontSize: 'var(--text-sm)',
              fontWeight: sel ? 'var(--weight-semibold)' : 'var(--weight-normal)',
              cursor: 'pointer',
              transition: 'border-color 0.15s, background 0.15s',
              lineHeight: 1.3,
            }}
          >
            {opt.icon && <span style={{ marginRight: 5 }}>{opt.icon}</span>}
            {opt.label}
            {opt.desc && (
              <span style={{
                display: 'block', fontSize: 'var(--text-xs)',
                opacity: sel ? 0.85 : 0.6, fontWeight: 'var(--weight-normal)',
              }}>{opt.desc}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const dispatch = useDispatch();

  // Pre-fill display name from the registered user object
  const storedUser = getUser();
  const [displayName, setDisplayName] = useState(storedUser?.username || '');
  const [experience, setExperience]   = useState(null);
  const [genre, setGenre]             = useState([]);   // multi-select
  const [setting, setSetting]         = useState(null);
  const [modifier, setModifier]       = useState(null);
  const [saving, setSaving]           = useState(false);
  const [isEdit, setIsEdit]           = useState(false); // true when editing existing profile

  // Load existing profile if one was saved previously
  useEffect(() => {
    loadPreferences()
      .then(prefs => {
        const p = prefs?.photographer_profile;
        if (!p || p.skipped) return;
        setIsEdit(true);
        if (p.display_name) setDisplayName(p.display_name);
        if (p.experience)   setExperience(p.experience);
        if (p.genre)        setGenre(Array.isArray(p.genre) ? p.genre : [p.genre]);
        if (p.setting)      setSetting(p.setting);
        if (p.modifier)     setModifier(p.modifier);
      })
      .catch(() => { /* non-fatal */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const profile = {
        display_name: displayName.trim() || null,
        experience:   experience,
        genre:        genre.length > 0 ? genre : null,
        setting:      setting,
        modifier:     modifier,
        completed_at: Date.now(),
      };
      await savePreference('photographer_profile', profile);
    } catch {
      // Non-fatal — profile is nice-to-have, not required
    } finally {
      setSaving(false);
    }
    dispatch({ type: 'NAVIGATE', screen: 'welcome' });
  }

  function handleSkip() {
    // Mark as seen so we don't show again
    savePreference('photographer_profile', { skipped: true, completed_at: Date.now() }).catch(() => {});
    dispatch({ type: 'NAVIGATE', screen: 'welcome' });
  }

  return (
    <div className="screen" style={{ paddingBottom: 'calc(var(--space-xl) * 2)' }}>
      <div style={{
        maxWidth: 520,
        margin: '0 auto',
        padding: '0 var(--space-md)',
      }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 'var(--space-xl)', paddingTop: 'var(--space-lg)' }}>
          <div style={{
            width: 48, height: 48,
            borderRadius: '50%',
            background: 'var(--color-accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto var(--space-md)',
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
              stroke="#fff" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          </div>
          <h2 style={{
            fontSize: 'var(--text-xl)', fontWeight: 'var(--weight-bold)',
            color: 'var(--color-text)', margin: '0 0 var(--space-xs)',
          }}>{isEdit ? 'Your photographer profile' : 'Tell us about your photography'}</h2>
          <p style={{
            fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)',
            margin: 0, lineHeight: 1.5,
          }}>
            {isEdit
              ? 'Update your profile at any time. Changes take effect immediately.'
              : 'This helps personalise lighting guidance and recommendations. You can update this in Settings at any time.'}
          </p>
        </div>

        {/* Form */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>

          {/* Display name */}
          <div>
            <FieldLabel hint="How you'll appear in the app">Your name</FieldLabel>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Display name"
              maxLength={48}
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '10px 14px',
                background: 'var(--color-surface-elevated)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--color-text)',
                fontSize: 'var(--text-sm)',
              }}
            />
          </div>

          {/* Experience */}
          <div>
            <FieldLabel>Experience level</FieldLabel>
            <PillGroup options={EXPERIENCE} value={experience} onChange={setExperience} />
          </div>

          {/* Genre */}
          <div>
            <FieldLabel hint="Pick all that apply">Primary genre</FieldLabel>
            <PillGroup options={GENRE} value={genre} onChange={setGenre} multi />
          </div>

          {/* Setting */}
          <div>
            <FieldLabel>Typical shooting environment</FieldLabel>
            <PillGroup options={SETTING} value={setting} onChange={setSetting} />
          </div>

          {/* Modifier */}
          <div>
            <FieldLabel hint="What you reach for most often">Favourite light modifier</FieldLabel>
            <PillGroup options={MODIFIER} value={modifier} onChange={setModifier} />
          </div>

        </div>

        {/* Actions */}
        <div style={{
          marginTop: 'var(--space-xl)',
          display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)',
        }}>
          <button
            className="btn btn--primary"
            style={{ width: '100%' }}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Get started →'}
          </button>
          <button
            className="btn btn--ghost"
            style={{ width: '100%' }}
            onClick={handleSkip}
            disabled={saving}
          >
            Skip for now
          </button>
        </div>

      </div>
    </div>
  );
}
