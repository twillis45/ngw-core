import ScoreBadge from './ScoreBadge';

/** ResultHeroStrip — full-bleed reference image with score + pattern name overlay.
 *  When no image, renders as a compact dark header block. */
export default function ResultHeroStrip({ imageUrl, score, patternName, loading = false }) {
  const tier = score >= 85 ? 'success' : score >= 70 ? 'warning' : 'alert';
  const scoreColor =
    tier === 'success' ? 'var(--color-score-success, #4CAF7D)' :
    tier === 'warning' ? 'var(--color-score-warning, #E8A838)' :
                         'var(--color-score-alert,   #E85C38)';
  const statusText =
    tier === 'success' ? 'You nailed it.' :
    tier === 'warning' ? "You're close."  :
                         "Something's off.";
  const fillPct = Math.min(100, Math.max(0, score));

  if (loading) {
    return (
      <div className="ngw-hero" style={{ background: 'var(--color-surface)' }}>
        <div className="ngw-skeleton" style={{ position: 'absolute', inset: 0, borderRadius: 0 }} />
      </div>
    );
  }

  return (
    <div className={`ngw-hero${imageUrl ? '' : ' ngw-hero--no-image'}`}>
      {imageUrl && (
        <>
          <img className="ngw-hero__img" src={imageUrl} alt="Reference" />
          <div className="ngw-hero__gradient" aria-hidden="true" />
        </>
      )}
      <div className="ngw-hero__overlay">
        <div className="ngw-hero__text">
          <div className="ngw-hero__pattern-name">{patternName || 'Analysis Result'}</div>
          <div className="ngw-hero__status">{statusText}</div>
        </div>
        <div className="ngw-hero__score-side">
          <ScoreBadge score={score} size="lg" />
        </div>
      </div>
      {/* Score bar — below overlay, only when image present */}
      {imageUrl && (
        <div className="ngw-hero__score-bar-row">
          <div className="ngw-hero__score-bar">
            <div
              className="ngw-hero__score-bar-fill"
              style={{ width: `${fillPct}%`, background: scoreColor }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
