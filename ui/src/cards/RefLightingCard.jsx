/**
 * "The Light" card.
 * Consumes lighting_read from ReferencePhotoAnalysis.
 */
import CollapsibleCard from './CollapsibleCard';

export default function RefLightingCard({ lightingRead }) {
  if (!lightingRead) return null;

  const lr = lightingRead;
  const hasObs = lr.key_observations?.length > 0;
  const hasAmbiguity = lr.ambiguity_notes?.length > 0;

  // Build a readable lighting family label
  const familyLabel = lr.lighting_family && lr.lighting_family !== 'unknown'
    ? lr.lighting_family.replace(/[-_]/g, ' ')
    : null;

  return (
    <CollapsibleCard icon={'\uD83D\uDCA1'} title="The Light">
      <div className="ref-card__grid">
        {familyLabel && (
          <Row label="Lighting Family" value={capitalize(familyLabel)} />
        )}
        {lr.source_quality && lr.source_quality !== 'unknown' && (
          <Row label="Source Quality" value={capitalize(lr.source_quality)} />
        )}
        {lr.source_direction && lr.source_direction !== 'unknown' && (
          <Row label="Direction" value={lr.source_direction} />
        )}
        {lr.shadow_pattern && lr.shadow_pattern !== 'unknown' && (
          <Row label="Shadow Pattern" value={capitalize(lr.shadow_pattern)} />
        )}
        {lr.fill_presence && lr.fill_presence !== 'unknown' && (
          <Row label="Fill" value={fillLabel(lr.fill_presence)} />
        )}
        {lr.rim_presence && lr.rim_presence !== 'unknown' && (
          <Row label="Rim Light" value={capitalize(lr.rim_presence)} />
        )}
        {typeof lr.light_count === 'number' && lr.light_count > 0 && (
          <Row label="Light Count" value={lightCountLabel(lr.light_count)} />
        )}
        {lr.tonal_processing_notes && (
          <Row label="Processing" value={lr.tonal_processing_notes} />
        )}
      </div>

      {hasObs && (
        <ul className="ref-card__notes">
          {lr.key_observations.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      )}

      {hasAmbiguity && (
        <div className="ref-card__warning">
          <span className="ref-card__warning-icon">{'\u26A0\uFE0F'}</span>
          <div>
            {lr.ambiguity_notes.map((n, i) => <p key={i}>{n}</p>)}
          </div>
        </div>
      )}
    </CollapsibleCard>
  );
}

function Row({ label, value }) {
  return (
    <div className="ref-card__row">
      <span className="ref-card__label">{label}</span>
      <span className="ref-card__value">{value}</span>
    </div>
  );
}

function capitalize(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function fillLabel(fill) {
  if (fill === 'none') return 'None \u2014 shadows fall naturally';
  if (fill === 'subtle') return 'Subtle fill present';
  if (fill === 'moderate') return 'Moderate fill';
  if (fill === 'strong') return 'Strong fill \u2014 low contrast';
  return capitalize(fill);
}

function lightCountLabel(count) {
  if (count === 1) return '1 light (key only)';
  if (count === 2) return '2 lights (key + one accent or background)';
  return `${count} lights`;
}
