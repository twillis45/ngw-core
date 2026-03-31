import { useEffect } from 'react';
import { useAppState, useDispatch } from '../context/AppContext';
import { SUBJECT_TYPES } from '../data/subjectTypes';

const PEOPLE_SUBJECTS = ['headshot', 'half_body', 'full_body', 'couple', 'small_group'];
const MULTI_SUBJECTS = ['couple', 'small_group'];
const SKIN_TONES = [
  { value: 'light',  label: 'Light',  swatch: '#FDDBB4' },
  { value: 'medium', label: 'Medium', swatch: '#C68642' },
  { value: 'dark',   label: 'Dark',   swatch: '#8D5524' },
  { value: 'mixed',  label: 'Mixed',  swatch: 'linear-gradient(135deg, #FDDBB4 33%, #C68642 66%, #8D5524 100%)', multiOnly: true },
];

/* ── Subject type cards (Figma: 2x2 grid, using real data) ── */
const CARD_ICONS = {
  headshot:    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="13" r="6"/><path d="M6 32c0-6.627 5.373-12 12-12s12 5.373 12 12"/></svg>,
  half_body:   <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="10" r="5"/><path d="M10 32V24a8 8 0 0116 0v8"/></svg>,
  full_body:   <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="8" r="4"/><path d="M18 14v10M14 34l4-10 4 10M10 20h16"/></svg>,
  couple:      <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="13" cy="12" r="5"/><circle cx="23" cy="12" r="5"/><path d="M4 32c0-5 4-9 9-9s9 4 9 9M23 23c5 0 9 4 9 9"/></svg>,
  small_group: <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="10" r="4"/><circle cx="10" cy="14" r="3"/><circle cx="26" cy="14" r="3"/><path d="M6 32c0-4 3-7 7-7h10c4 0 7 3 7 7"/></svg>,
  product:     <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="10" width="24" height="18" rx="2"/><path d="M14 10V8a4 4 0 018 0v2"/></svg>,
  food:        <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="18" r="10"/><ellipse cx="18" cy="18" rx="6" ry="4"/></svg>,
  interior:    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="6" width="28" height="24" rx="2"/><path d="M4 18h28M18 6v24"/></svg>,
};

export default function StepTheShot() {
  const { subjectType, skinTone } = useAppState();
  const dispatch = useDispatch();

  useEffect(() => {
    if (!subjectType) dispatch({ type: 'SET_SUBJECT_TYPE', subjectType: 'headshot' });
  }, [subjectType, dispatch]);

  // Clear "mixed" skin tone if user switches to a single-person subject
  useEffect(() => {
    if (skinTone === 'mixed' && subjectType && !MULTI_SUBJECTS.includes(subjectType)) {
      dispatch({ type: 'SET_SKIN_TONE', skinTone: null });
    }
  }, [subjectType, skinTone, dispatch]);

  return (
    <div className="step-shot">
      <span className="step-shot__section-label">THE SHOT</span>
      <h2 className="step-shot__heading">What are you{'\n'}shooting?</h2>

      {/* ── Subject type grid (from subjectTypes.js) ── */}
      <div className="step-shot__grid">
        {SUBJECT_TYPES.map(card => {
          const sel = subjectType === card.value;
          return (
            <button
              key={card.value}
              type="button"
              className={`step-shot__card${sel ? ' step-shot__card--selected' : ''}`}
              onClick={() => dispatch({ type: 'SET_SUBJECT_TYPE', subjectType: card.value })}
            >
              {sel && <div className="step-shot__card-bar" />}
              <div className="step-shot__card-icon">{CARD_ICONS[card.value]}</div>
              <div className="step-shot__card-text">
                <span className="step-shot__card-label">{card.label}</span>
                <span className="step-shot__card-sub">{card.hint}</span>
                {sel && <span className="step-shot__card-badge">Set</span>}
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Skin tone (people subjects only) ── */}
      {PEOPLE_SUBJECTS.includes(subjectType) && (
        <>
          <span className="step-shot__section-label">SKIN TONE</span>
          <div className="step-shot__pills">
            {SKIN_TONES.filter(t => !t.multiOnly || MULTI_SUBJECTS.includes(subjectType)).map(t => (
              <button
                key={t.value}
                className={`step-shot__pill step-shot__pill--tone${skinTone === t.value ? ' step-shot__pill--selected' : ''}`}
                onClick={() => dispatch({
                  type: 'SET_SKIN_TONE',
                  skinTone: skinTone === t.value ? null : t.value,
                })}
                type="button"
              >
                <span className="step-shot__pill-swatch" style={{ background: t.swatch }} />
                {t.label}
              </button>
            ))}
          </div>
        </>
      )}

    </div>
  );
}
