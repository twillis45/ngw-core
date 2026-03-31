import { useState, useEffect, useRef } from 'react';
import { useAppState } from '../context/AppContext';

/* ── Analysis-specific stages (image pipeline) ── */
const ANALYSIS_STAGES = [
  'Reading the light\u2026',
  'Analyzing shadows\u2026',
  'Resolving shadow geometry\u2026',
  'Identifying setup\u2026',
  'Evaluating mood\u2026',
  'Checking modifiers\u2026',
];

/* ── Generic stages (wizard / recipe / gear matching) ── */
const MATCH_STAGES = [
  'Matching lighting pattern\u2026',
  'Selecting modifiers\u2026',
  'Calculating distances\u2026',
  'Optimizing power levels\u2026',
  'Finalizing setup\u2026',
];

const STAGE_INTERVAL = 3200;

export default function LoadingScreen() {
  const { referenceImage, loadingMode } = useAppState();
  // Explicit mode wins; fall back to auto-detect from referenceImage
  const isAnalysis = loadingMode === 'analysis' || (loadingMode !== 'match' && !!referenceImage);
  const STAGES = isAnalysis ? ANALYSIS_STAGES : MATCH_STAGES;

  const [stageIdx, setStageIdx] = useState(0);
  const timer = useRef(null);

  useEffect(() => {
    setStageIdx(0);
    timer.current = setInterval(() => {
      setStageIdx(i => (i + 1) % STAGES.length);
    }, STAGE_INTERVAL);
    return () => clearInterval(timer.current);
  }, [isAnalysis]);

  /* Which progress dot is "active" — maps to stage thirds */
  const dotCount = 3;
  const segSize = Math.ceil(STAGES.length / dotCount);
  const activeDot = Math.min(Math.floor(stageIdx / segSize), dotCount - 1);

  if (isAnalysis) {
    /* ── Full analysis loading — image scan theme ── */
    return (
      <div className="screen analyze-loading">
        <p className="analyze-loading__brand">NGW</p>

        <div className="analyze-loading__stage">
          <div className="analyze-loading__stage-bg" />
          <div className="analyze-loading__scan-line" />
          <div className="analyze-loading__scan-accent" />
          <div className="analyze-loading__stage-fade" />
          <span className="analyze-loading__stage-label">ANALYZING</span>
        </div>

        <h1 className="analyze-loading__title">Analyzing your light.</h1>
        <p className="analyze-loading__status" key={stageIdx}>{STAGES[stageIdx]}</p>

        <div className="analyze-loading__dots">
          {[0, 1, 2].map(i => (
            <span
              key={i}
              className={`analyze-loading__dot${i === activeDot ? ' analyze-loading__dot--active' : ''}`}
            />
          ))}
        </div>

        <div className="analyze-loading__glimpse">
          <span className="analyze-loading__glimpse-label">PATTERN EMERGING</span>
          <span className="analyze-loading__glimpse-placeholder">&mdash; &mdash; &mdash; &mdash; &mdash;</span>
        </div>

        <p className="analyze-loading__footer">Result arrives in seconds</p>
      </div>
    );
  }

  /* ── Generic matching loading — minimal theme ── */
  return (
    <div className="screen match-loading">
      <p className="match-loading__brand">NGW</p>

      <div className="match-loading__icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" className="match-loading__ring" />
          <path d="M12 6v6l4 2" />
        </svg>
      </div>

      <h1 className="match-loading__title">Building your setup.</h1>
      <p className="match-loading__status" key={stageIdx}>{STAGES[stageIdx]}</p>

      <div className="match-loading__dots">
        {[0, 1, 2].map(i => (
          <span
            key={i}
            className={`match-loading__dot${i === activeDot ? ' match-loading__dot--active' : ''}`}
          />
        ))}
      </div>

      <p className="match-loading__footer">Your setup is almost ready</p>
    </div>
  );
}
