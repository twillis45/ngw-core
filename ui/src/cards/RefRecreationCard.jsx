/**
 * "How To Recreate It" card.
 * Consumes recreation_setup from ReferencePhotoAnalysis.
 */
import CollapsibleCard from './CollapsibleCard';
import CardIcon from '../components/CardIcon';

export default function RefRecreationCard({ recreationSetup }) {
  if (!recreationSetup) return null;

  const rs = recreationSetup;
  const hasNotes = rs.setup_notes?.length > 0;

  const familyLabel = rs.setup_family && rs.setup_family !== 'unknown'
    ? rs.setup_family.replace(/[-_]/g, ' ')
    : null;

  return (
    <CollapsibleCard icon={<CardIcon name="wrench" />} title="How To Recreate It" className="ref-card--recreation">
      <div className="ref-card__grid">
        {familyLabel && (
          <Row label="Setup Style" value={capitalize(familyLabel)} />
        )}
        {rs.modifier_suggestion && rs.modifier_suggestion !== 'unknown' && (
          <Row label="Key Modifier" value={rs.modifier_suggestion} />
        )}
        {typeof rs.light_count === 'number' && rs.light_count > 0 && (
          <Row label="Lights Needed" value={String(rs.light_count)} />
        )}
        {rs.key_placement && (
          <Row label="Key Placement" value={rs.key_placement} />
        )}
        {rs.fill_strategy && (
          <Row label="Fill Strategy" value={rs.fill_strategy} />
        )}
        {rs.background_strategy && (
          <Row label="Background" value={rs.background_strategy} />
        )}
        {rs.camera_subject_guidance && (
          <Row label="Camera / Subject" value={rs.camera_subject_guidance} />
        )}
      </div>

      {hasNotes && (
        <div className="ref-card__setup-notes">
          <div className="ref-card__notes-heading">Setup Notes</div>
          <ul className="ref-card__notes">
            {rs.setup_notes.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
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
