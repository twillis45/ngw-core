/**
 * "Other Reads" card.
 * Shows alternate hypotheses and ambiguity notes from the reference analysis.
 * Only renders when there is meaningful ambiguity to display.
 */
import CollapsibleCard from './CollapsibleCard';

export default function RefInterpretationsCard({ lightingRead, recreationSetup }) {
  const ambiguity = lightingRead?.ambiguity_notes || [];
  const alternates = recreationSetup?.alternate_hypotheses || [];

  // Don't render if there's nothing to show
  if (ambiguity.length === 0 && alternates.length === 0) return null;

  return (
    <CollapsibleCard icon={'\uD83E\uDD14'} title="Other Reads" className="ref-card--interpretations">
      <p className="ref-card__intro">
        Every reference image has more than one plausible lighting read.
        Here are the alternatives worth considering.
      </p>

      {alternates.length > 0 && (
        <div className="ref-card__alternates">
          {alternates.map((alt, i) => (
            <div className="ref-card__alternate" key={i}>
              <span className="ref-card__alternate-name">
                {typeof alt === 'string'
                  ? alt
                  : (alt.hypothesis || alt.name || 'Alternative').replace(/[-_]/g, ' ')}
              </span>
              {alt.confidence != null && (
                <span className="ref-card__alternate-conf">
                  {Math.round(alt.confidence * 100)}% likely
                </span>
              )}
              {alt.notes && (
                <p className="ref-card__alternate-note">{alt.notes}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {ambiguity.length > 0 && (
        <div className="ref-card__ambiguity-list">
          {ambiguity.map((note, i) => (
            <div className="ref-card__ambiguity-item" key={i}>
              <span className="ref-card__ambiguity-icon">{'\u25B8'}</span>
              <span>{note}</span>
            </div>
          ))}
        </div>
      )}
    </CollapsibleCard>
  );
}
