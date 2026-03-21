/**
 * "The Shot" card.
 * Consumes image_read from ReferencePhotoAnalysis.
 *
 * Primary rows (genre, mood, subject, skin tones, framing) are always visible.
 * Secondary rows (pose, scene, background, style ref, visual devices) are
 * collapsed by default behind a "More" toggle.
 */
import { useState } from 'react';
import CollapsibleCard from './CollapsibleCard';
import CardIcon from '../components/CardIcon';

export default function RefImageReadCard({ imageRead }) {
  if (!imageRead) return null;

  const ir = imageRead;
  const [showMore, setShowMore] = useState(false);
  const hasDevices = ir.notable_visual_devices?.length > 0;

  // Check if there are any secondary rows to show
  const hasSecondary = ir.pose_notes
    || (ir.visual_intent && ir.visual_intent !== 'unknown')
    || ir.scene_description
    || ir.background_relationship
    || ir.lighting_style
    || ir.likely_photographer
    || ir.contrast_shadow_feel
    || hasDevices;

  return (
    <CollapsibleCard icon={<CardIcon name="camera" />} title="The Shot">
      {/* Primary rows — always visible */}
      <div className="ref-card__grid">
        {ir.genre && ir.genre !== 'unknown' && (
          <Row label="Genre" value={capitalize(ir.genre)} />
        )}
        {ir.mood && ir.mood !== 'unknown' && (
          <Row label="Mood" value={capitalize(ir.mood)} />
        )}
        {ir.subject_type && (
          <Row label="Subject" value={capitalize(ir.subject_type) + (ir.subject_count > 1 ? ` (${ir.subject_count})` : '')} />
        )}
        {ir.subject_skin_tones?.length > 0 && (
          <Row label={ir.subject_skin_tones.length > 1 ? 'Skin Tones' : 'Skin Tone'} value={ir.subject_skin_tones.map(capitalize).join(', ') + (ir.skin_tone_mixed ? ' (mixed)' : '')} />
        )}
        {ir.camera_subject_relationship && (
          <Row label="Framing" value={capitalize(ir.camera_subject_relationship)} />
        )}
      </div>

      {/* Secondary rows — collapsed by default */}
      {hasSecondary && (
        <>
          <button
            className="ref-card__more-toggle"
            onClick={() => setShowMore(!showMore)}
            type="button"
          >
            {showMore ? 'Less' : 'More'}
            <span className={`ref-card__more-chevron${showMore ? ' ref-card__more-chevron--open' : ''}`}>{'\u203A'}</span>
          </button>

          {showMore && (
            <div className="ref-card__grid">
              {ir.pose_notes && (
                <Row label="Pose" value={capitalize(ir.pose_notes)} />
              )}
              {ir.visual_intent && ir.visual_intent !== 'unknown' && (
                <Row label="Visual Intent" value={capitalize(ir.visual_intent)} />
              )}
              {ir.scene_description && (
                <Row label="Scene" value={ir.scene_description} />
              )}
              {ir.background_relationship && (
                <Row label="Background" value={ir.background_relationship} />
              )}
              {ir.lighting_style && (
                <Row label="Lighting Style" value={capitalize(ir.lighting_style)} />
              )}
              {ir.likely_photographer && (
                <Row label="Style Reference" value={ir.likely_photographer} />
              )}
              {ir.contrast_shadow_feel && (
                <Row label="Contrast & Shadows" value={ir.contrast_shadow_feel} />
              )}
              {hasDevices && (
                <Row label="Visual Devices" value={ir.notable_visual_devices.join(', ')} />
              )}
            </div>
          )}
        </>
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
