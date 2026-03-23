import { useState, useEffect, useMemo } from 'react';
import { useAppState, useDispatch } from '../context/AppContext';
import MoodTile from '../components/MoodTile';
import ChipSelect from '../components/ChipSelect';
import { MOOD_LIST } from '../coaching';
import { SUBJECT_TYPES } from '../data/subjectTypes';
import { MOOD_SUBJECTS } from '../coaching';

import { MOOD_ICONS } from '../components/MoodIcons';

/* ── Skin tone options ── */
const SKIN_TONES = [
  { value: 'light',  label: 'Light',  swatch: '#FDDBB4' },
  { value: 'medium', label: 'Medium', swatch: '#C68642' },
  { value: 'dark',   label: 'Dark',   swatch: '#8D5524' },
  { value: 'mixed',  label: 'Mixed',  swatch: 'linear-gradient(135deg, #FDDBB4 33%, #C68642 66%, #8D5524 100%)' },
];

/* ── SVG icons for master modes — consistent with app icon style ── */
const ModeIcons = {
  default:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>,
  hurley:     <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
  adler:      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L16 8H22L17 12.5L19 19L12 15L5 19L7 12.5L2 8H8L12 2Z"/></svg>,
  heisler:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 012 2v14a2 2 0 01-2 2h-4M10 17l5-5-5-5M3 12h12"/></svg>,
  bryce:      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22C17.5 22 20 17.5 20 12S17.5 2 12 2 4 6.5 4 12s2.5 10 8 10z"/><path d="M12 6c0 3.31-2.69 6-6 6"/><path d="M12 6c0 3.31 2.69 6 6 6"/></svg>,
  caravaggio: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>,
  penn:       <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>,
  karsh:      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>,
  leibovitz:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>,
};

/* ── Master mode options ── */
const MODES = [
  { id: null,          icon: ModeIcons.default,    label: 'Default',    tagline: 'Standard NGW recommendation' },
  { id: 'hurley',      icon: ModeIcons.hurley,     label: 'Hurley',     tagline: 'Clean commercial headshot' },
  { id: 'adler',       icon: ModeIcons.adler,      label: 'Adler',      tagline: 'Fashion/beauty sculpting' },
  { id: 'heisler',     icon: ModeIcons.heisler,    label: 'Heisler',    tagline: 'Narrative portrait' },
  { id: 'bryce',       icon: ModeIcons.bryce,      label: 'Bryce',      tagline: 'Soft feminine portrait' },
  { id: 'caravaggio',  icon: ModeIcons.caravaggio, label: 'Caravaggio', tagline: 'Dramatic chiaroscuro' },
  { id: 'penn',        icon: ModeIcons.penn,       label: 'Penn',       tagline: 'Hard light minimalism' },
  { id: 'karsh',       icon: ModeIcons.karsh,      label: 'Karsh',      tagline: 'Heroic portraiture' },
  { id: 'leibovitz',   icon: ModeIcons.leibovitz,  label: 'Leibovitz',  tagline: 'Complex editorial narrative' },
];

/**
 * Consolidated Step 1: "What are we shooting?"
 * Combines: Mood + Subject + Skin Tone + Master Mode (collapsed)
 */
export default function StepTheShot() {
  const { mood, subjectType, skinTone, masterMode } = useAppState();
  const dispatch = useDispatch();
  const [styleOpen, setStyleOpen] = useState(!!masterMode);

  /* Subject options filtered by mood */
  const filteredSubjects = useMemo(() => {
    const allowed = mood && MOOD_SUBJECTS[mood];
    if (!allowed) return SUBJECT_TYPES;
    return SUBJECT_TYPES.filter(s => allowed.includes(s.value));
  }, [mood]);

  /* Clear subject if no longer valid for this mood */
  useEffect(() => {
    if (subjectType && filteredSubjects.length > 0) {
      const still = filteredSubjects.some(s => s.value === subjectType);
      if (!still) dispatch({ type: 'SET_SUBJECT_TYPE', subjectType: '' });
    }
  }, [filteredSubjects, subjectType, dispatch]);

  return (
    <div className="consolidated-step">
      <h2 className="screen-heading">What's the look?</h2>

      {/* ── Look (mood) ── */}
      <div className="consolidated-step__section">
        <div className="consolidated-step__label">Look</div>
        <div className="mood-grid mood-grid--compact">
          {MOOD_LIST.map(m => (
            <MoodTile
              key={m.value}
              icon={MOOD_ICONS[m.value]}
              label={m.label}
              desc={m.desc}
              selected={mood === m.value}
              onClick={() => dispatch({ type: 'SET_MOOD', mood: m.value })}
            />
          ))}
        </div>
      </div>

      {/* ── Subject ── */}
      <div className="consolidated-step__section">
        <div className="consolidated-step__label">Subject</div>
        <div className="subject-chip-grid">
          {filteredSubjects.map(s => (
            <button
              key={s.value}
              type="button"
              className={`subject-chip${subjectType === s.value ? ' subject-chip--selected' : ''}`}
              onClick={() => dispatch({ type: 'SET_SUBJECT_TYPE', subjectType: s.value })}
            >
              <span className="subject-chip__label">{s.label}</span>
              {s.hint && <span className="subject-chip__hint">{s.hint}</span>}
            </button>
          ))}
        </div>

        {/* Skin tone inline */}
        <div className="skin-tone-inline">
          <span className="skin-tone-inline__label">Skin tone</span>
          <span className="skin-tone-inline__optional">optional</span>
          <div className="tone-row tone-row--compact">
            {SKIN_TONES.map(t => (
              <button
                key={t.value}
                className={`tone-chip tone-chip--small${skinTone === t.value ? ' tone-chip--selected' : ''}`}
                onClick={() => dispatch({
                  type: 'SET_SKIN_TONE',
                  skinTone: skinTone === t.value ? null : t.value,
                })}
                type="button"
              >
                <span className="tone-chip__swatch" style={{ background: t.swatch }} />
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Style bias (master mode, collapsed — advanced option) ── */}
      <div className="consolidated-step__section">
        <button
          type="button"
          className="consolidated-step__toggle"
          onClick={() => setStyleOpen(o => !o)}
        >
          <span>Style reference</span>
          <span className="consolidated-step__toggle-hint">
            {masterMode ? MODES.find(m => m.id === masterMode)?.label || 'Custom' : 'optional'}
          </span>
          <span className={`gear-category__arrow${styleOpen ? ' gear-category__arrow--open' : ''}`}>
            {'\u25BC'}
          </span>
        </button>
        {styleOpen && (
          <div className="master-mode-compact">
            {MODES.map(mode => (
              <button
                key={mode.id || 'default'}
                className={`master-mode-chip${masterMode === mode.id ? ' master-mode-chip--selected' : ''}`}
                onClick={() => dispatch({ type: 'SET_MASTER_MODE', masterMode: mode.id })}
              >
                <span className="master-mode-chip__icon">{mode.icon}</span>
                <span className="master-mode-chip__text">
                  <strong>{mode.label}</strong>
                  <small>{mode.tagline}</small>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
