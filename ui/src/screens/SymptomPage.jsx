/**
 * SymptomPage
 * ===========
 * Full-page view for a single lighting symptom.
 * Shows: causes, fixes, related patterns, shoot-mode hint, and quick actions.
 * Fires: symptom_page_viewed on mount, symptom_fix_applied on action click.
 *
 * Reads symptomSlug from AppContext state.
 */
import { useEffect } from 'react';
import { useAppState, useDispatch } from '../context/AppContext';
import { getSymptomBySlug, SYMPTOMS } from '../data/symptoms';
import { trackEvent } from '../data/analytics';
import usePaywall, { resolveUserEmail } from '../hooks/usePaywall';

function BackButton() {
  const dispatch = useDispatch();
  return (
    <button
      className="symptom-back"
      onClick={() => dispatch({ type: 'GO_BACK' })}
      type="button"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
      Back to Results
    </button>
  );
}

function SectionHead({ title }) {
  return (
    <h3 className="symptom-section-head">{title}</h3>
  );
}

function CausesList({ causes }) {
  return (
    <ul className="symptom-list">
      {causes.map((c, i) => (
        <li key={i} className="symptom-list__item">
          <span className="symptom-list__dot symptom-list__dot--cause" />
          {c}
        </li>
      ))}
    </ul>
  );
}

function FixesList({ fixes, slug, patternId, onApplyFix }) {
  return (
    <ul className="symptom-list">
      {fixes.map((f, i) => (
        <li key={i} className="symptom-list__item symptom-list__item--fix">
          <span className="symptom-list__dot symptom-list__dot--fix" />
          <span className="symptom-list__fix-text">{f}</span>
          <button
            className="symptom-list__apply-btn"
            type="button"
            onClick={() => onApplyFix(f)}
            title="Apply this fix in Shoot Mode"
          >
            Apply →
          </button>
        </li>
      ))}
    </ul>
  );
}

function RelatedPatterns({ patterns }) {
  if (!patterns || patterns.length === 0) return null;
  return (
    <div className="symptom-patterns">
      {patterns.map(p => (
        <span key={p} className="symptom-pattern-chip">
          {p.replace(/_/g, ' ')}
        </span>
      ))}
    </div>
  );
}

function ShootModeHint({ hint, isPaid, onOpenShootMode }) {
  return (
    <div className="symptom-shoot-hint">
      <div className="symptom-shoot-hint__icon">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
        </svg>
      </div>
      <div className="symptom-shoot-hint__body">
        <p className="symptom-shoot-hint__text">{hint}</p>
        <button
          className={`symptom-shoot-hint__btn${!isPaid ? ' symptom-shoot-hint__btn--locked' : ''}`}
          onClick={onOpenShootMode}
          type="button"
        >
          {!isPaid && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ marginRight: 5 }}>
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0110 0v4"/>
            </svg>
          )}
          {isPaid ? 'Open Shoot Mode' : 'Unlock Shoot Mode'}
        </button>
      </div>
    </div>
  );
}

function OtherSymptomsRow({ currentSlug, onSymptom }) {
  const others = SYMPTOMS.filter(s => s.slug !== currentSlug).slice(0, 4);
  if (others.length === 0) return null;
  return (
    <div className="symptom-others">
      <p className="symptom-others__label">Other symptoms</p>
      <div className="symptom-others__chips">
        {others.map(s => (
          <button
            key={s.slug}
            className="symptom-others__chip"
            onClick={() => onSymptom(s.slug)}
            type="button"
          >
            <span>{s.icon}</span>
            <span>{s.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function SymptomPage() {
  const { symptomSlug, result, user } = useAppState();
  const dispatch = useDispatch();
  const userEmail = resolveUserEmail(user);
  const { isPaid, unlock } = usePaywall(userEmail);

  const slug      = symptomSlug || '';
  const symptom   = getSymptomBySlug(slug);
  const patternId = result?.bestMatch?.lightingPattern || null;
  const confidence = result?.bestMatch?.reliabilityScore ?? null;

  useEffect(() => {
    if (slug) {
      trackEvent('symptom_page_viewed', {
        symptom: slug,
        pattern: patternId,
      });
    }
  }, [slug]);

  function handleOpenShootMode() {
    if (!isPaid) {
      unlock();
      return;
    }
    dispatch({ type: 'SET_APP_MODE', mode: 'shoot' });
    dispatch({ type: 'NAVIGATE', screen: 'shoot_mode' });
  }

  function handleApplyFix(fix) {
    // Record the fix was tapped (existing event)
    trackEvent('symptom_fix_applied', { symptom: slug, fix, pattern: patternId });
    // Start the fix flow — fires new event + stores in state so Shoot Mode can display it
    trackEvent('fix_flow_started', {
      symptom_id:  slug,
      fix_id:      fix,
      pattern_id:  patternId,
      confidence:  confidence,
    });
    dispatch({
      type: 'START_FIX_FLOW',
      payload: {
        symptomSlug: slug,
        fix,
        patternId,
        confidence,
        startedAt: Date.now(),
      },
    });
    if (!isPaid) {
      unlock();
      return;
    }
    dispatch({ type: 'SET_APP_MODE', mode: 'shoot' });
    dispatch({ type: 'NAVIGATE', screen: 'shoot_mode' });
  }

  function handleNavigateSymptom(newSlug) {
    trackEvent('symptom_clicked', { from: slug, to: newSlug, pattern: patternId });
    dispatch({ type: 'NAVIGATE_SYMPTOM', slug: newSlug });
  }

  if (!symptom) {
    return (
      <div className="screen symptom-screen">
        <BackButton />
        <div className="symptom-not-found">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
            className="symptom-not-found__icon"
          >
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <p className="symptom-not-found__title">Symptom not found</p>
          <p className="symptom-not-found__sub">
            This symptom couldn't be located. Browse other symptoms below or go back to your results.
          </p>
        </div>
        <OtherSymptomsRow currentSlug={slug} onSymptom={handleNavigateSymptom} />
      </div>
    );
  }

  return (
    <div className="screen symptom-screen">
      <BackButton />

      {/* ── Hero ─────────────────────────────────────────────────── */}
      <div className="symptom-hero">
        <span className="symptom-hero__icon">{symptom.icon}</span>
        <div className="symptom-hero__text">
          <h2 className="symptom-hero__title">{symptom.title}</h2>
          <p className="symptom-hero__tagline">{symptom.tagline}</p>
        </div>
      </div>

      <p className="symptom-description">{symptom.description}</p>

      {/* ── Causes ───────────────────────────────────────────────── */}
      <div className="symptom-section">
        <SectionHead title="Common Causes" />
        <CausesList causes={symptom.causes} />
      </div>

      {/* ── Fixes ────────────────────────────────────────────────── */}
      <div className="symptom-section">
        <SectionHead title="How to Fix It" />
        <FixesList fixes={symptom.fixes} slug={slug} patternId={patternId} onApplyFix={handleApplyFix} />
      </div>

      {/* ── Related patterns ─────────────────────────────────────── */}
      <div className="symptom-section">
        <SectionHead title="Works well with these patterns" />
        <RelatedPatterns patterns={symptom.patterns} />
      </div>

      {/* ── Shoot Mode hint ──────────────────────────────────────── */}
      <ShootModeHint
        hint={symptom.shootModeHint}
        isPaid={isPaid}
        onOpenShootMode={handleOpenShootMode}
      />

      {/* ── Other symptoms ───────────────────────────────────────── */}
      <OtherSymptomsRow currentSlug={slug} onSymptom={handleNavigateSymptom} />

      {/* ── Bottom padding ───────────────────────────────────────── */}
      <div style={{ height: 32 }} />
    </div>
  );
}
