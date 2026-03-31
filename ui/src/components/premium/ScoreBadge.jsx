/** ScoreBadge — displays match score value with color-coded tier.
 *  score: 0–100 integer. showStatus adds the tier status line. */
export default function ScoreBadge({ score, showStatus = false, size = 'lg' }) {
  const tier = score >= 85 ? 'success' : score >= 70 ? 'warning' : 'alert';
  const color =
    tier === 'success' ? 'var(--color-score-success, #4CAF7D)' :
    tier === 'warning' ? 'var(--color-score-warning, #E8A838)' :
                         'var(--color-score-alert,   #E85C38)';
  const statusText =
    tier === 'success' ? 'You nailed it.' :
    tier === 'warning' ? "You're close."  :
                         "Something's off.";

  return (
    <div className={`ngw-score-badge ngw-score-badge--${size}`}>
      <span className="ngw-score-badge__value" style={{ color }}>
        {Math.round(score)}
      </span>
      {showStatus && (
        <span className="ngw-score-badge__status">{statusText}</span>
      )}
    </div>
  );
}
