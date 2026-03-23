/**
 * ResultCTAGroup
 * ==============
 * Secondary action row after the main blueprint/shoot-mode CTA.
 * Two actions: Analyze Another Photo | Build This Setup.
 * The shoot mode action lives in ShootModeCTA above — not duplicated here.
 *
 * Props:
 *   patternId — string — current pattern identifier
 *   onAnalyze — fn() — navigate back to photo upload
 *   onBuild   — fn() — navigate to wizard with this pattern pre-loaded
 */
import { trackEvent } from '../../data/analytics';

export default function ResultCTAGroup({ patternId, onAnalyze, onBuild, analyzeLabel = 'Analyze Another Photo', buildLabel = 'Build This Setup' }) {
  function handleAnalyze() {
    trackEvent('analyze_similar_clicked', { pattern: patternId });
    if (onAnalyze) onAnalyze();
  }

  function handleBuild() {
    trackEvent('build_setup_clicked', { pattern: patternId });
    if (onBuild) onBuild();
  }

  return (
    <div className="rcg">
      <button className="rcg__btn" onClick={handleAnalyze} type="button">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
        <span className="rcg__btn-label">{analyzeLabel}</span>
      </button>

      <button className="rcg__btn" onClick={handleBuild} type="button">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
        </svg>
        <span className="rcg__btn-label">{buildLabel}</span>
      </button>
    </div>
  );
}
