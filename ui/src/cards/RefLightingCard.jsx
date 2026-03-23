/**
 * "The Light" card.
 * Consumes lighting_read from ReferencePhotoAnalysis.
 */
import CollapsibleCard from './CollapsibleCard';
import CardIcon from '../components/CardIcon';
import HelpTip from '../components/HelpTip';

const FIELD_TIPS = {
  'Lighting Family': 'Broad category of the lighting approach — e.g. portrait, beauty, editorial, available light. Drives modifier and position recommendations.',
  'Source Quality':  'Hard sources (bare bulb, grid spot) produce crisp shadow edges. Soft sources (large softbox, umbrella) wrap light around the subject and produce gradual shadow transitions.',
  'Direction':       'Where the key light is coming from relative to the camera. Off-axis (45°) creates shadows; on-axis (direct) flattens them.',
  'Shadow Pattern':  'The shape cast by the subject\'s nose and face. Rembrandt = triangle under eye. Loop = small shadow below nose. Butterfly = symmetrical shadow under nose. Clamshell = shadow-free beauty look.',
  'Fill':            'A fill light or reflector reduces shadow depth. None = deep natural shadows. Subtle = slight lift. Moderate = even skin. Strong = very low contrast.',
  'Rim Light':       'A light behind and to the side of the subject creates a bright edge that separates them from the background. Important for depth when background is dark.',
  'Light Count':     'Estimated number of artificial light sources. Single-source setups rely on modifiers for quality; multi-light setups control each zone independently.',
  'Color Temperature': 'Measured in Kelvin. Daylight ≈ 5500K (neutral). Tungsten ≈ 3200K (warm/amber). Flash ≈ 5600K. Mismatched sources produce mixed-colour casts.',
  'Environment':     'Detected shooting context — affects expected ambient light behaviour and recommended settings.',
  'Processing':      'Post-processing or tonal treatment detected — e.g. high contrast, matte, desaturated. May indicate a deliberate stylistic choice vs. in-camera exposure.',
};

export default function RefLightingCard({ lightingRead, lightingIntelligence }) {
  if (!lightingRead) return null;

  const lr = lightingRead;
  const li = lightingIntelligence || {};
  const hasObs = lr.key_observations?.length > 0;
  const hasAmbiguity = lr.ambiguity_notes?.length > 0;

  const familyLabel = lr.lighting_family && lr.lighting_family !== 'unknown'
    ? lr.lighting_family.replace(/[-_]/g, ' ')
    : null;

  return (
    <CollapsibleCard icon={<CardIcon name="light" />} title="The Light">
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
        {li.detectedCCT && (
          <Row label="Color Temperature" value={`~${li.detectedCCT}K`} />
        )}
        {li.detectedEnvironment && (
          <Row label="Environment" value={capitalize(li.detectedEnvironment.replace(/[-_]/g, ' '))} />
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
  const tip = FIELD_TIPS[label];
  return (
    <div className="ref-card__row">
      <span className="ref-card__label">
        {label}
        {tip && <HelpTip text={tip} side="above" />}
      </span>
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
