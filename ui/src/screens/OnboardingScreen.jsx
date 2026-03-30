/**
 * OnboardingScreen — shown once after first registration.
 *
 * Multi-step wizard: Step 1 (experience + genre), Step 2 (setting + modifier),
 * then a completion summary. Matches Figma "Onboarding — Step (Dark)" and
 * "Onboarding — Complete (Dark)" designs.
 *
 * Data saved to user_preferences under key 'photographer_profile'.
 * Navigates to 'home' on save or skip.
 */

import { useState, useEffect } from 'react';
import { useDispatch } from '../context/AppContext';
import { savePreference, loadPreferences, getUser } from '../data/authApi';

// ── Option sets (labels match Figma) ─────────────────────────────────────────

const EXPERIENCE = [
  { value: 'beginner',   label: 'Beginner' },
  { value: 'hobbyist',   label: 'Hobbyist' },
  { value: 'semi_pro',   label: 'Semi-pro' },
  { value: 'working_pro', label: 'Working pro' },
  { value: 'educator',   label: 'Educator' },
];

const GENRE = [
  { value: 'portrait',    label: 'Portrait' },
  { value: 'wedding',     label: 'Wedding' },
  { value: 'commercial',  label: 'Commercial' },
  { value: 'headshots',   label: 'Headshots' },
  { value: 'fashion',     label: 'Fashion' },
  { value: 'events',      label: 'Events' },
  { value: 'product',     label: 'Product' },
  { value: 'other',       label: 'Other' },
];

const SETTING = [
  { value: 'studio',   label: 'Studio' },
  { value: 'location', label: 'On-location' },
  { value: 'mixed',    label: 'Both' },
];

const MODIFIER = [
  { value: 'softbox',     label: 'Softbox' },
  { value: 'octobox',     label: 'Octobox' },
  { value: 'beauty_dish', label: 'Beauty dish' },
  { value: 'umbrella',    label: 'Umbrella' },
  { value: 'natural',     label: 'Natural light' },
  { value: 'varies',      label: 'Varies' },
];

const TOTAL_STEPS = 2;

// ── Steps config ─────────────────────────────────────────────────────────────

const STEPS = [
  {
    title: 'How do you describe\nyour experience?',
    subtitle: 'This helps us tune the guidance to your level',
    sections: [
      { key: 'experience', label: 'EXPERIENCE LEVEL', options: EXPERIENCE, multi: false },
      { key: 'genre',      label: 'YOUR GENRE',       options: GENRE,      multi: true },
    ],
  },
  {
    title: 'Where and how\ndo you shoot?',
    subtitle: 'We\'ll tailor setups and gear suggestions',
    sections: [
      { key: 'setting',  label: 'SHOOTING ENVIRONMENT', options: SETTING,  multi: false },
      { key: 'modifier', label: 'GO-TO MODIFIER',       options: MODIFIER, multi: false },
    ],
  },
];

// ── Sub-components ───────────────────────────────────────────────────────────

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
    <div className="ob-pills">
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          className={`ob-pill${isSelected(opt.value) ? ' ob-pill--selected' : ''}`}
          onClick={() => toggle(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function ProgressDots({ current, total }) {
  return (
    <div className="ob-dots">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className={`ob-dots__dot${i === current ? ' ob-dots__dot--active' : ''}`} />
      ))}
    </div>
  );
}

function SummaryChip({ label }) {
  return <span className="ob-summary-chip">{label}</span>;
}

// ── Main screen ──────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const dispatch = useDispatch();
  const storedUser = getUser();

  const [step, setStep] = useState(0); // 0..TOTAL_STEPS-1, then TOTAL_STEPS = complete
  const [experience, setExperience] = useState(null);
  const [genre, setGenre]           = useState([]);
  const [setting, setSetting]       = useState(null);
  const [modifier, setModifier]     = useState(null);
  const [saving, setSaving]         = useState(false);
  const [isEdit, setIsEdit]         = useState(false);

  const values = { experience, genre, setting, modifier };
  const setters = {
    experience: setExperience,
    genre: setGenre,
    setting: setSetting,
    modifier: setModifier,
  };

  // Load existing profile if editing
  useEffect(() => {
    loadPreferences()
      .then(prefs => {
        const p = prefs?.photographer_profile;
        if (!p || p.skipped) return;
        setIsEdit(true);
        if (p.experience) setExperience(p.experience);
        if (p.genre)      setGenre(Array.isArray(p.genre) ? p.genre : [p.genre]);
        if (p.setting)    setSetting(p.setting);
        if (p.modifier)   setModifier(p.modifier);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const profile = {
        display_name: storedUser?.username || null,
        experience,
        genre: genre.length > 0 ? genre : null,
        setting,
        modifier,
        completed_at: Date.now(),
      };
      await savePreference('photographer_profile', profile);
    } catch {
      // Non-fatal
    } finally {
      setSaving(false);
    }
    dispatch({ type: 'NAVIGATE', screen: 'home' });
  }

  function handleSkip() {
    savePreference('photographer_profile', { skipped: true, completed_at: Date.now() }).catch(() => {});
    dispatch({ type: 'NAVIGATE', screen: 'home' });
  }

  function handleNext() {
    if (step < TOTAL_STEPS - 1) {
      setStep(step + 1);
    } else {
      setStep(TOTAL_STEPS); // go to complete
    }
  }

  // ── Complete screen ──
  if (step === TOTAL_STEPS) {
    const chips = [];
    if (experience) {
      const exp = EXPERIENCE.find(e => e.value === experience);
      if (exp) chips.push(exp.label);
    }
    if (genre.length > 0) {
      const g = GENRE.find(g => g.value === genre[0]);
      if (g) chips.push(g.label);
    }
    if (modifier) {
      const m = MODIFIER.find(m => m.value === modifier);
      if (m) chips.push(m.label);
    }

    return (
      <div className="screen ob-screen ob-screen--complete">
        <div className="ob-complete">
          <div className="ob-complete__icon">
            <span className="ob-complete__sparkle">✦</span>
          </div>
          <h2 className="ob-complete__title">You're all set.</h2>
          <p className="ob-complete__subtitle">
            Your profile is saved. Start your first analysis whenever you're ready.
          </p>
          {chips.length > 0 && (
            <div className="ob-complete__chips">
              {chips.map(c => <SummaryChip key={c} label={c} />)}
            </div>
          )}
          <button
            className="ob-cta"
            type="button"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Start analyzing  →'}
          </button>
        </div>
      </div>
    );
  }

  // ── Step screen ──
  const currentStep = STEPS[step];

  return (
    <div className="screen ob-screen">
      {/* Top bar */}
      <div className="ob-topbar">
        <span className="ob-topbar__title">
          {isEdit ? 'Edit your profile' : 'Set up your profile'}
        </span>
        <button className="ob-topbar__skip" type="button" onClick={handleSkip}>
          Skip
        </button>
      </div>

      {/* Progress dots */}
      <ProgressDots current={step} total={TOTAL_STEPS} />

      {/* Content */}
      <div className="ob-content">
        <div className="ob-step-header">
          <h2 className="ob-step-header__title">
            {currentStep.title.split('\n').map((line, i) => (
              <span key={i}>{line}{i < currentStep.title.split('\n').length - 1 && <br />}</span>
            ))}
          </h2>
          <p className="ob-step-header__sub">{currentStep.subtitle}</p>
        </div>

        {currentStep.sections.map(section => (
          <div key={section.key} className="ob-section">
            <span className="ob-section__label">{section.label}</span>
            <PillGroup
              options={section.options}
              value={values[section.key]}
              onChange={setters[section.key]}
              multi={section.multi}
            />
          </div>
        ))}
      </div>

      {/* Bottom sticky bar */}
      <div className="ob-bottom-bar">
        <button
          className="ob-cta"
          type="button"
          onClick={handleNext}
        >
          Next  →
        </button>
      </div>
    </div>
  );
}
