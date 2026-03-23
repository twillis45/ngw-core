import { useEffect, useMemo } from 'react';
import { useAppState, useDispatch } from '../context/AppContext';
import ChipSelect from '../components/ChipSelect';
import { SUBJECT_TYPES } from '../data/subjectTypes';
import { MOOD_SUBJECTS } from '../coaching';

const SKIN_TONES = [
  { value: 'light',  label: 'Light',  swatch: '#FDDBB4' },
  { value: 'medium', label: 'Medium', swatch: '#C68642' },
  { value: 'dark',   label: 'Dark',   swatch: '#8D5524' },
  { value: 'mixed',  label: 'Mixed',  swatch: 'linear-gradient(135deg, #FDDBB4 33%, #C68642 66%, #8D5524 100%)' },
];

export default function StepSubject() {
  const { subjectType, mood, skinTone } = useAppState();
  const dispatch = useDispatch();

  const filteredSubjects = useMemo(() => {
    const allowed = mood && MOOD_SUBJECTS[mood];
    if (!allowed) return SUBJECT_TYPES;
    return SUBJECT_TYPES.filter(s => allowed.includes(s.value));
  }, [mood]);

  // Clear selection if current subject is not valid for this mood
  useEffect(() => {
    if (subjectType && filteredSubjects.length > 0) {
      const still = filteredSubjects.some(s => s.value === subjectType);
      if (!still) dispatch({ type: 'SET_SUBJECT_TYPE', subjectType: '' });
    }
  }, [filteredSubjects, subjectType, dispatch]);

  return (
    <>
      <h2 className="screen-heading">Who's the subject?</h2>
      <ChipSelect
        options={filteredSubjects}
        selected={subjectType}
        onSelect={v => dispatch({ type: 'SET_SUBJECT_TYPE', subjectType: v })}
      />

      <div className="skin-tone-section">
        <div className="skin-tone-section__label">
          Skin tone
          <span className="skin-tone-section__optional">optional</span>
        </div>
        <p className="skin-tone-section__hint">
          Helps dial in exposure and modifier choice.
        </p>
        <div className="tone-row">
          {SKIN_TONES.map(t => (
            <button
              key={t.value}
              className={`tone-chip${skinTone === t.value ? ' tone-chip--selected' : ''}`}
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
    </>
  );
}
