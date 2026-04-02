import { RECIPES } from '../data/recipes';
import CardIcon from '../components/CardIcon';

const MOOD_LABELS = {
  beauty: 'Beauty', cinematic: 'Cinematic', corporate: 'Corporate',
  editorial: 'Editorial', natural: 'Natural', high_key: 'High Key', low_key: 'Low Key',
};

/* ── Three-Layer Read sub-components ────────────────────── */

function ThreeLayerRead({ refAnalysis }) {
  if (!refAnalysis?.ok) return null;

  const ir = refAnalysis.image_read;
  const lr = refAnalysis.lighting_read;
  const rs = refAnalysis.recreation_setup;

  return (
    <div className="three-layer-read">
      {/* Image Read — what's happening in the photo */}
      {ir && (
        <div className="three-layer-read__section">
          <div className="three-layer-read__heading">Image Read</div>
          {ir.narrative && (
            <p className="three-layer-read__narrative">{ir.narrative}</p>
          )}
          <div className="ref-analysis">
            {ir.genre && ir.genre !== 'unknown' && (
              <div className="ref-analysis__row ref-analysis__row--inline">
                <span className="ref-analysis__label">Genre</span>
                <span className="ref-analysis__value" style={{ textTransform: 'capitalize' }}>{ir.genre}</span>
              </div>
            )}
            {ir.visual_intent && (
              <div className="ref-analysis__row">
                <span className="ref-analysis__label">Visual Intent</span>
                <span className="ref-analysis__value">{ir.visual_intent}</span>
              </div>
            )}
            {ir.camera_subject_relationship && (
              <div className="ref-analysis__row">
                <span className="ref-analysis__label">Camera / Subject</span>
                <span className="ref-analysis__value">{ir.camera_subject_relationship}</span>
              </div>
            )}
            {ir.background_relationship && (
              <div className="ref-analysis__row">
                <span className="ref-analysis__label">Background</span>
                <span className="ref-analysis__value">{ir.background_relationship}</span>
              </div>
            )}
            {ir.contrast_shadow_feel && (
              <div className="ref-analysis__row">
                <span className="ref-analysis__label">Contrast / Shadows</span>
                <span className="ref-analysis__value">{ir.contrast_shadow_feel}</span>
              </div>
            )}
            {ir.notable_visual_devices?.length > 0 && (
              <div className="ref-analysis__row">
                <span className="ref-analysis__label">Visual Devices</span>
                <span className="ref-analysis__value">{ir.notable_visual_devices.join(', ')}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lighting Read — what the light is doing */}
      {lr && (
        <div className="three-layer-read__section">
          <div className="three-layer-read__heading">Lighting Read</div>
          <div className="ref-analysis">
            {lr.lighting_family && lr.lighting_family !== 'unknown' && (
              <div className="ref-analysis__row">
                <span className="ref-analysis__label">Lighting Family</span>
                <span className="ref-analysis__value">{lr.lighting_family.replace(/[-_]/g, ' ')}</span>
              </div>
            )}
            {lr.source_quality && lr.source_quality !== 'unknown' && (
              <div className="ref-analysis__row ref-analysis__row--inline">
                <span className="ref-analysis__label">Source Quality</span>
                <span className="ref-analysis__value" style={{ textTransform: 'capitalize' }}>{lr.source_quality}</span>
              </div>
            )}
            {lr.source_direction && lr.source_direction !== 'unknown' && (
              <div className="ref-analysis__row">
                <span className="ref-analysis__label">Source Direction</span>
                <span className="ref-analysis__value">{lr.source_direction}</span>
              </div>
            )}
            {lr.shadow_pattern && lr.shadow_pattern !== 'unknown' && (
              <div className="ref-analysis__row ref-analysis__row--inline">
                <span className="ref-analysis__label">Shadow Pattern</span>
                <span className="ref-analysis__value" style={{ textTransform: 'capitalize' }}>{lr.shadow_pattern}</span>
              </div>
            )}
            {lr.fill_presence && lr.fill_presence !== 'unknown' && (
              <div className="ref-analysis__row ref-analysis__row--inline">
                <span className="ref-analysis__label">Fill</span>
                <span className="ref-analysis__value" style={{ textTransform: 'capitalize' }}>{lr.fill_presence}</span>
              </div>
            )}
            {lr.rim_presence && lr.rim_presence !== 'unknown' && (
              <div className="ref-analysis__row ref-analysis__row--inline">
                <span className="ref-analysis__label">Rim</span>
                <span className="ref-analysis__value" style={{ textTransform: 'capitalize' }}>{lr.rim_presence}</span>
              </div>
            )}
            {lr.tonal_processing_notes && (
              <div className="ref-analysis__row">
                <span className="ref-analysis__label">Processing</span>
                <span className="ref-analysis__value">{lr.tonal_processing_notes}</span>
              </div>
            )}
          </div>
          {lr.key_observations?.length > 0 && (
            <ul className="three-layer-read__notes">
              {lr.key_observations.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          )}
          {lr.ambiguity_notes?.length > 0 && (
            <div className="three-layer-read__ambiguity">
              {lr.ambiguity_notes.map((n, i) => <p key={i}>{n}</p>)}
            </div>
          )}
        </div>
      )}

      {/* Recreation Setup — how to build it */}
      {rs && (
        <div className="three-layer-read__section">
          <div className="three-layer-read__heading">Recreation Setup</div>
          <div className="ref-analysis">
            {rs.setup_family && rs.setup_family !== 'unknown' && (
              <div className="ref-analysis__row ref-analysis__row--inline">
                <span className="ref-analysis__label">Setup Family</span>
                <span className="ref-analysis__value" style={{ textTransform: 'capitalize' }}>{rs.setup_family.replace(/[-_]/g, ' ')}</span>
              </div>
            )}
            {rs.modifier_suggestion && rs.modifier_suggestion !== 'unknown' && (
              <div className="ref-analysis__row">
                <span className="ref-analysis__label">Modifier</span>
                <span className="ref-analysis__value">{rs.modifier_suggestion}</span>
              </div>
            )}
            {rs.light_count > 0 && (
              <div className="ref-analysis__row ref-analysis__row--inline">
                <span className="ref-analysis__label">Lights</span>
                <span className="ref-analysis__value">{rs.light_count}</span>
              </div>
            )}
            {rs.key_placement && (
              <div className="ref-analysis__row">
                <span className="ref-analysis__label">Key Placement</span>
                <span className="ref-analysis__value">{rs.key_placement}</span>
              </div>
            )}
            {rs.fill_strategy && (
              <div className="ref-analysis__row">
                <span className="ref-analysis__label">Fill Strategy</span>
                <span className="ref-analysis__value">{rs.fill_strategy}</span>
              </div>
            )}
            {rs.background_strategy && (
              <div className="ref-analysis__row">
                <span className="ref-analysis__label">Background</span>
                <span className="ref-analysis__value">{rs.background_strategy}</span>
              </div>
            )}
            {rs.camera_subject_guidance && (
              <div className="ref-analysis__row">
                <span className="ref-analysis__label">Framing</span>
                <span className="ref-analysis__value">{rs.camera_subject_guidance}</span>
              </div>
            )}
            {(rs.focal_length || rs.aperture) && (
              <div className="ref-analysis__row ref-analysis__row--inline">
                <span className="ref-analysis__label">Camera</span>
                <span className="ref-analysis__value">
                  {[rs.focal_length, rs.aperture].filter(Boolean).join('  ·  ')}
                </span>
              </div>
            )}
          </div>
          {rs.setup_notes?.length > 0 && (
            <ul className="three-layer-read__notes">
              {rs.setup_notes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export { ThreeLayerRead };

export default function ReferenceImageCard({ imageUrl, analysis, mood, lightingIntelligence, compact }) {
  if (!compact && !imageUrl) return null;

  const palette = analysis?.palette?.overall || [];
  const orientation = analysis?.orientation;
  const isGrayscale = analysis?.isGrayscale;
  const moodLabel = MOOD_LABELS[mood] || mood;
  const catchlights = analysis?.catchlights;

  // Classification data from image analysis
  const classification = analysis?.classification;
  const detectedMood = classification?.mood;
  const confidence = classification?.confidence;
  const suggestedRecipe = classification?.suggestedRecipe;
  const lightQuality = classification?.lightQuality;
  const colorTemp = classification?.colorTemperature;
  const brightness = classification?.brightness;
  const recipeName = suggestedRecipe
    ? RECIPES.find(r => r.id === suggestedRecipe)?.name
    : null;

  // Background & lighting intelligence
  const background = analysis?.background;
  const bgLightDetected = background?.lightDetected;
  const bgLightConf = background?.lightConfidence;
  const detectedDiagram = analysis?.detectedDiagram;
  const descBgLight = analysis?.description?.background?.backgroundLight;
  const intel = lightingIntelligence || analysis?.lightingIntelligence;
  const subject = analysis?.description?.subject;
  const refAnalysis = analysis?.description?.referenceAnalysis;

  const analysisContent = (
      <div className="ref-analysis">
        {moodLabel && (
          <div className="ref-analysis__row ref-analysis__row--inline">
            <span className="ref-analysis__label">Vibe</span>
            <span className="ref-analysis__value">{moodLabel}</span>
          </div>
        )}
        {detectedMood && (
          <div className="ref-analysis__row ref-analysis__row--inline">
            <span className="ref-analysis__label">Detected Mood</span>
            <span className="ref-analysis__value">
              {MOOD_LABELS[detectedMood] || detectedMood}
              {confidence != null && (
                <span className="ref-analysis__confidence">
                  <span
                    className="ref-analysis__confidence-bar"
                    style={{ width: `${Math.round(confidence * 100)}%` }}
                  />
                </span>
              )}
            </span>
          </div>
        )}
        {recipeName && (
          <div className="ref-analysis__row ref-analysis__row--inline">
            <span className="ref-analysis__label">Suggested Recipe</span>
            <span className="ref-analysis__value">{recipeName}</span>
          </div>
        )}
        {lightQuality && (
          <div className="ref-analysis__row ref-analysis__row--inline">
            <span className="ref-analysis__label">Light Quality</span>
            <span className="ref-analysis__value" style={{ textTransform: 'capitalize' }}>
              {lightQuality}
            </span>
          </div>
        )}
        {colorTemp && (
          <div className="ref-analysis__row ref-analysis__row--inline">
            <span className={`ref-analysis__label ref-analysis__temp-${colorTemp}`}>Color Temp</span>
            <span className={`ref-analysis__value ref-analysis__temp-${colorTemp}`}>
              <span className={`ref-analysis__temp-dot ref-analysis__temp-dot--${colorTemp}`} />
              {colorTemp.charAt(0).toUpperCase() + colorTemp.slice(1)}
              {classification?.colorTemperatureKelvin ? ` (${classification.colorTemperatureKelvin.toLocaleString()} K)` : ''}
            </span>
          </div>
        )}
        {brightness && (
          <div className="ref-analysis__row ref-analysis__row--inline">
            <span className="ref-analysis__label">Brightness</span>
            <span className="ref-analysis__value" style={{ textTransform: 'capitalize' }}>
              {brightness}
            </span>
          </div>
        )}
        {catchlights?.ok && catchlights.count > 0 && (
          <>
            <div className="ref-analysis__row ref-analysis__row--inline">
              <span className="ref-analysis__label">Key Light</span>
              <span className="ref-analysis__value">
                {intel?.keyPosition || catchlights.inferred.keyLightPosition}
              </span>
            </div>
            <div className="ref-analysis__row ref-analysis__row--inline">
              <span className="ref-analysis__label">Modifier</span>
              <span className="ref-analysis__value">
                {intel?.detectedModifier
                  ? intel.detectedModifier.replace(/_/g, ' ')
                  : catchlights.inferred.likelyModifier}
              </span>
            </div>
            <div className="ref-analysis__row ref-analysis__row--inline">
              <span className="ref-analysis__label">Lights Detected</span>
              <span className="ref-analysis__value">
                {intel?.lightCount ?? catchlights.inferred.lightCount}
                {intel?.backgroundLight && ' (incl. background)'}
              </span>
            </div>
            {intel?.detectedPattern && (
              <div className="ref-analysis__row ref-analysis__row--inline">
                <span className="ref-analysis__label">Pattern</span>
                <span className="ref-analysis__value" style={{ textTransform: 'capitalize' }}>
                  {intel.detectedPattern}
                </span>
              </div>
            )}
          </>
        )}
        {/* Subject & Pose — prefer image_read over raw subject */}
        {(subject || refAnalysis?.image_read) && (() => {
          const ir = refAnalysis?.image_read;
          const framingVal = ir?.camera_subject_relationship || subject?.framing;
          const poseVal = ir?.pose_notes
            ? ir.pose_notes.split(',')[0].trim()
            : (subject?.pose !== 'unknown' ? subject?.pose : null);
          const angleVal = subject?.angle !== 'unknown' ? subject?.angle : null;
          return (
            <>
              {framingVal && (
                <div className="ref-analysis__row">
                  <span className="ref-analysis__label">Framing</span>
                  <span className="ref-analysis__value">{framingVal}</span>
                </div>
              )}
              {angleVal && (
                <div className="ref-analysis__row ref-analysis__row--inline">
                  <span className="ref-analysis__label">Subject Angle</span>
                  <span className="ref-analysis__value" style={{ textTransform: 'capitalize' }}>{angleVal}</span>
                </div>
              )}
              {poseVal && (
                <div className="ref-analysis__row">
                  <span className="ref-analysis__label">Pose</span>
                  <span className="ref-analysis__value">{poseVal}</span>
                </div>
              )}
            </>
          );
        })()}
        {orientation && (
          <div className="ref-analysis__row ref-analysis__row--inline">
            <span className="ref-analysis__label">Orientation</span>
            <span className="ref-analysis__value" style={{ textTransform: 'capitalize' }}>{orientation}</span>
          </div>
        )}
        {isGrayscale && (
          <div className="ref-analysis__row ref-analysis__row--inline">
            <span className="ref-analysis__label">Tone</span>
            <span className="ref-analysis__value">Black & White / Desaturated</span>
          </div>
        )}
        {palette.length > 0 && (
          <>
            <div className="ref-analysis__label" style={{ marginTop: 'var(--space-sm)' }}>
              Color Palette
            </div>
            <div className="ref-palette">
              {palette.slice(0, 6).map((c, i) => (
                <div className="ref-palette__swatch" key={i}>
                  <div
                    className="ref-palette__color"
                    style={{ background: c.hex }}
                    title={`${c.name} (${c.hex})`}
                  />
                  <span className="ref-palette__name">{c.name}</span>
                  <span className="ref-palette__pct">{Math.round(c.pct)}%</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Three-Layer Reference Read */}
        <ThreeLayerRead refAnalysis={refAnalysis} />
      </div>
  );

  if (compact) return analysisContent;

  return (
    <div className="result-card">
      <div className="result-card__header">
        <CardIcon name="camera" />
        <span>Your Reference</span>
      </div>
      <div style={{
        borderRadius: 'var(--radius-sm)',
        overflow: 'hidden',
        background: 'var(--color-bg)',
      }}>
        <img
          src={imageUrl}
          alt="Reference photo"
          style={{ width: '100%', display: 'block', borderRadius: 'var(--radius-sm)' }}
        />
      </div>

      {analysisContent}

      <p style={{
        fontSize: 'var(--text-sm)',
        color: 'var(--text-dim)',
        marginTop: 'var(--space-sm)',
        lineHeight: 1.4,
      }}>
        {analysis
          ? `We analyzed your reference photo${detectedMood ? ` and detected a ${MOOD_LABELS[detectedMood] || detectedMood} vibe` : ''}. The setup below is designed to recreate this look.`
          : 'Your uploaded reference. The setup below is designed to achieve a similar look.'}
      </p>
    </div>
  );
}
