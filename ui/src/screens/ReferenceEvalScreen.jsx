import { useState, useEffect } from 'react';
import { useAppState, useDispatch } from '../context/AppContext';
import { uploadReferenceImage } from '../api';
import { RECIPES } from '../data/recipes';
import DiagramCard from '../cards/DiagramCard';
import CollapsibleCard from '../cards/CollapsibleCard';
import ZoomOverlay from '../cards/ZoomOverlay';

const MOOD_OPTIONS = [
  { value: 'beauty', label: 'Beauty' },
  { value: 'cinematic', label: 'Cinematic' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'editorial', label: 'Editorial' },
  { value: 'natural', label: 'Natural' },
  { value: 'high_key', label: 'High Key' },
  { value: 'low_key', label: 'Low Key' },
];

const MOOD_LABELS = Object.fromEntries(MOOD_OPTIONS.map(m => [m.value, m.label]));

export default function ReferenceEvalScreen() {
  const { referenceImage, referenceImages } = useAppState();
  const imageCount = referenceImages?.length || (referenceImage ? 1 : 0);
  const dispatch = useDispatch();
  const [loading, setLoading] = useState(true);
  const [analysis, setAnalysis] = useState(null);
  const [selectedMood, setSelectedMood] = useState(null);
  const [error, setError] = useState(null);
  const [zoomSrc, setZoomSrc] = useState(null);

  useEffect(() => {
    if (!referenceImage?.file) {
      setLoading(false);
      setError('No image selected');
      return;
    }

    let cancelled = false;
    uploadReferenceImage(referenceImage.file)
      .then(result => {
        if (cancelled) return;
        setAnalysis(result.analysis);
        setSelectedMood(result.analysis?.classification?.mood || null);
        dispatch({
          type: 'SET_REFERENCE_IMAGE',
          payload: { ...referenceImage, serverPath: result.path },
        });
        dispatch({ type: 'SET_REF_ANALYSIS', analysis: result.analysis });
      })
      .catch(() => {
        if (cancelled) return;
        setError('Could not analyze image');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleConfirm() {
    const mood = selectedMood || 'natural';
    dispatch({ type: 'SET_MOOD', mood });
    dispatch({ type: 'SET_INTENT', intent: 'ref_match' });
  }

  function handleBack() {
    dispatch({ type: 'CLEAR_REFERENCE_IMAGE' });
    dispatch({ type: 'GO_BACK' });
  }

  const classification = analysis?.classification;
  const palette = analysis?.palette?.overall || [];
  const recipeName = classification?.suggestedRecipe
    ? RECIPES.find(r => r.id === classification.suggestedRecipe)?.name
    : null;
  const subject = analysis?.description?.subject;
  const refAnalysis = analysis?.description?.referenceAnalysis;
  const imageRead = refAnalysis?.image_read;
  const lightingRead = refAnalysis?.lighting_read;
  const recreationSetup = refAnalysis?.recreation_setup;

  return (
    <div className="screen">
      <h2 className="screen-heading">Reference Evaluation</h2>

      {/* Zoom overlay */}
      {zoomSrc && <ZoomOverlay src={zoomSrc} alt="Reference photo" onClose={() => setZoomSrc(null)} />}

      {/* Reference image(s) with scan overlay during analysis */}
      {referenceImage?.preview && (
        <div className="ref-hero">
          <div className={`ref-hero__image${loading ? ' ref-hero__image--scanning' : ''}`}>
            {imageCount > 1 ? (
              <div className="ref-hero__gallery">
                {referenceImages.map((img, i) => (
                  <img key={i} src={img.preview} alt={`Reference photo ${i + 1}`} onClick={() => !loading && setZoomSrc(img.preview)} />
                ))}
              </div>
            ) : (
              <img src={referenceImage.preview} alt="Reference photo" onClick={() => !loading && setZoomSrc(referenceImage.preview)} />
            )}
            {loading && <div className="ref-scan-overlay"><div className="ref-scan-overlay__line" /></div>}
          </div>
        </div>
      )}

      {/* Scanning status — rotates through analysis phases */}
      {loading && <ScanStatus />}

      {/* Narrative — directly under image for immediate context */}
      {!loading && imageRead?.narrative && (
        <div className="ref-hero__narrative">
          <span className="ref-hero__narrative-label">At a Glance</span>
          <p className="ref-hero__narrative-text">{imageRead.narrative}</p>
          {(imageRead.pose_notes || imageRead.scene_description) && (
            <p className="ref-hero__narrative-action">
              {imageRead.pose_notes || imageRead.scene_description}
            </p>
          )}
        </div>
      )}

      {/* Image count badge */}
      {!loading && analysis && (
        <div className="ref-image-count">
          <span className="ref-image-count__badge">
            {imageCount} reference image{imageCount !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="ref-eval__error">
          <p>{error}</p>
          <button className="btn btn--primary btn--sm" onClick={handleBack}>
            Go Back
          </button>
        </div>
      )}

      {/* Analysis results */}
      {!loading && analysis && (
        <>
          {/* ── The Light ── */}
          {lightingRead && (
            <CollapsibleCard icon={'\uD83D\uDCA1'} title="The Light">
              <div className="ref-analysis">
                {lightingRead.lighting_family && lightingRead.lighting_family !== 'unknown' && (
                  <div className="ref-analysis__row">
                    <span className="ref-analysis__label">Lighting Family</span>
                    <span className="ref-analysis__value">{lightingRead.lighting_family.replace(/[-_]/g, ' ')}</span>
                  </div>
                )}
                {lightingRead.source_quality && lightingRead.source_quality !== 'unknown' && (
                  <div className="ref-analysis__row ref-analysis__row--inline">
                    <span className="ref-analysis__label">Source Quality</span>
                    <span className="ref-analysis__value" style={{ textTransform: 'capitalize' }}>{lightingRead.source_quality}</span>
                  </div>
                )}
                {lightingRead.source_direction && lightingRead.source_direction !== 'unknown' && (
                  <div className="ref-analysis__row">
                    <span className="ref-analysis__label">Direction</span>
                    <span className="ref-analysis__value">{lightingRead.source_direction}</span>
                  </div>
                )}
                {lightingRead.shadow_pattern && lightingRead.shadow_pattern !== 'unknown' && (
                  <div className="ref-analysis__row ref-analysis__row--inline">
                    <span className="ref-analysis__label">Shadow Pattern</span>
                    <span className="ref-analysis__value" style={{ textTransform: 'capitalize' }}>{lightingRead.shadow_pattern}</span>
                  </div>
                )}
                {lightingRead.fill_presence && lightingRead.fill_presence !== 'unknown' && (
                  <div className="ref-analysis__row ref-analysis__row--inline">
                    <span className="ref-analysis__label">Fill</span>
                    <span className="ref-analysis__value" style={{ textTransform: 'capitalize' }}>{lightingRead.fill_presence}</span>
                  </div>
                )}
                {lightingRead.rim_presence && lightingRead.rim_presence !== 'unknown' && (
                  <div className="ref-analysis__row ref-analysis__row--inline">
                    <span className="ref-analysis__label">Rim Light</span>
                    <span className="ref-analysis__value" style={{ textTransform: 'capitalize' }}>{lightingRead.rim_presence}</span>
                  </div>
                )}
                {typeof lightingRead.light_count === 'number' && lightingRead.light_count > 0 && (
                  <div className="ref-analysis__row ref-analysis__row--inline">
                    <span className="ref-analysis__label">Light Count</span>
                    <span className="ref-analysis__value">{lightingRead.light_count}</span>
                  </div>
                )}
                {classification?.colorTemperature && (
                  <div className="ref-analysis__row ref-analysis__row--inline">
                    <span className="ref-analysis__label">Color Temp</span>
                    <span className="ref-analysis__value">
                      <span className={`ref-analysis__temp-dot ref-analysis__temp-dot--${classification.colorTemperature}`} />
                      {classification.colorTemperature.charAt(0).toUpperCase() + classification.colorTemperature.slice(1)}
                      {classification.colorTemperatureKelvin ? ` (${classification.colorTemperatureKelvin.toLocaleString()} K)` : ''}
                    </span>
                  </div>
                )}
                {lightingRead.tonal_processing_notes && (
                  <div className="ref-analysis__row">
                    <span className="ref-analysis__label">Processing</span>
                    <span className="ref-analysis__value">{lightingRead.tonal_processing_notes}</span>
                  </div>
                )}
              </div>
              {lightingRead.key_observations?.length > 0 && (
                <ul className="three-layer-read__notes">
                  {lightingRead.key_observations.map((n, i) => <li key={i}>{n}</li>)}
                </ul>
              )}
              {lightingRead.ambiguity_notes?.length > 0 && (
                <div className="ref-card__warning">
                  <span className="ref-card__warning-icon">{'\u26A0\uFE0F'}</span>
                  <div>
                    {lightingRead.ambiguity_notes.map((n, i) => <p key={i}>{n}</p>)}
                  </div>
                </div>
              )}
            </CollapsibleCard>
          )}

          {/* ── Lighting Diagram ── */}
          {analysis?.detectedDiagram?.raw && (
            <CollapsibleCard icon={'\uD83D\uDDA5'} title="Lighting">
              <DiagramCard spec={analysis.detectedDiagram.raw} title="" inline />
            </CollapsibleCard>
          )}

          {/* ── The Shot ─────────────────────────── */}
          {(subject || imageRead || classification) && (
            <CollapsibleCard icon={'\uD83D\uDCF8'} title="The Shot">
              <div className="ref-analysis">
                {/* What kind of shot */}
                {imageRead?.genre && imageRead.genre !== 'unknown' && (
                  <div className="ref-analysis__row ref-analysis__row--inline">
                    <span className="ref-analysis__label">Genre</span>
                    <span className="ref-analysis__value" style={{ textTransform: 'capitalize' }}>{imageRead.genre}</span>
                  </div>
                )}
                {classification?.mood && (
                  <div className="ref-analysis__row ref-analysis__row--inline">
                    <span className="ref-analysis__label">Mood</span>
                    <span className="ref-analysis__value">
                      {MOOD_LABELS[classification.mood] || classification.mood}
                    </span>
                  </div>
                )}
                {/* Who's in it */}
                {imageRead?.subject_type && (
                  <div className="ref-analysis__row ref-analysis__row--inline">
                    <span className="ref-analysis__label">Subject</span>
                    <span className="ref-analysis__value" style={{ textTransform: 'capitalize' }}>
                      {imageRead.subject_type}
                      {imageRead.subject_count > 1 ? ` (${imageRead.subject_count})` : ''}
                    </span>
                  </div>
                )}
                {imageRead?.subject_skin_tones?.length > 0 && (
                  <div className="ref-analysis__row ref-analysis__row--inline">
                    <span className="ref-analysis__label">Skin Tone{imageRead.subject_skin_tones.length > 1 ? 's' : ''}</span>
                    <span className="ref-analysis__value" style={{ textTransform: 'capitalize' }}>
                      {imageRead.subject_skin_tones.join(', ')}
                      {imageRead.skin_tone_mixed ? ' (mixed)' : ''}
                    </span>
                  </div>
                )}
                {/* Composition */}
                {(imageRead?.camera_subject_relationship || subject?.framing) && (
                  <div className="ref-analysis__row">
                    <span className="ref-analysis__label">Framing</span>
                    <span className="ref-analysis__value">
                      {imageRead?.camera_subject_relationship || subject?.framing}
                    </span>
                  </div>
                )}
                {imageRead?.pose_notes ? (
                  <div className="ref-analysis__row">
                    <span className="ref-analysis__label">Pose</span>
                    <span className="ref-analysis__value">{imageRead.pose_notes}</span>
                  </div>
                ) : !imageRead && subject?.pose && subject.pose !== 'unknown' ? (
                  <div className="ref-analysis__row ref-analysis__row--inline">
                    <span className="ref-analysis__label">Pose</span>
                    <span className="ref-analysis__value" style={{ textTransform: 'capitalize' }}>{subject.pose}</span>
                  </div>
                ) : null}
                {/* Scene context */}
                {imageRead?.visual_intent && (
                  <div className="ref-analysis__row">
                    <span className="ref-analysis__label">Visual Intent</span>
                    <span className="ref-analysis__value">{imageRead.visual_intent}</span>
                  </div>
                )}
                {imageRead?.scene_description && (
                  <div className="ref-analysis__row">
                    <span className="ref-analysis__label">Scene</span>
                    <span className="ref-analysis__value">{imageRead.scene_description}</span>
                  </div>
                )}
                {imageRead?.background_relationship && (
                  <div className="ref-analysis__row">
                    <span className="ref-analysis__label">Background</span>
                    <span className="ref-analysis__value">{imageRead.background_relationship}</span>
                  </div>
                )}
                {/* Style & reference */}
                {imageRead?.lighting_style && (
                  <div className="ref-analysis__row ref-analysis__row--inline">
                    <span className="ref-analysis__label">Lighting Style</span>
                    <span className="ref-analysis__value" style={{ textTransform: 'capitalize' }}>{imageRead.lighting_style}</span>
                  </div>
                )}
                {imageRead?.likely_photographer && (
                  <div className="ref-analysis__row ref-analysis__row--inline">
                    <span className="ref-analysis__label">Style Reference</span>
                    <span className="ref-analysis__value">{imageRead.likely_photographer}</span>
                  </div>
                )}
                {recipeName && (
                  <div className="ref-analysis__row ref-analysis__row--inline">
                    <span className="ref-analysis__label">Suggested Recipe</span>
                    <span className="ref-analysis__value">{recipeName}</span>
                  </div>
                )}
                {/* Technical */}
                {imageRead?.notable_visual_devices?.length > 0 && (
                  <div className="ref-analysis__row">
                    <span className="ref-analysis__label">Visual Devices</span>
                    <span className="ref-analysis__value">{imageRead.notable_visual_devices.join(', ')}</span>
                  </div>
                )}
              </div>
              {/* Inline palette */}
              {palette.length > 0 && (
                <>
                  <div className="ref-analysis__label" style={{ marginTop: 'var(--space-sm)' }}>Palette</div>
                  <div className="ref-palette">
                    {palette.slice(0, 6).map((c, i) => (
                      <div className="ref-palette__swatch" key={i}>
                        <div className="ref-palette__color" style={{ background: c.hex }} title={`${c.name} (${c.hex})`} />
                        <span className="ref-palette__name">{c.name}</span>
                        <span className="ref-palette__pct">{Math.round(c.pct)}%</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CollapsibleCard>
          )}

          {/* ── How To Recreate It ───────────────────── */}
          {recreationSetup && (
            <CollapsibleCard icon={'\uD83D\uDD27'} title="How To Recreate It">
              <div className="ref-analysis">
                {recreationSetup.setup_family && recreationSetup.setup_family !== 'unknown' && (
                  <div className="ref-analysis__row ref-analysis__row--inline">
                    <span className="ref-analysis__label">Setup Style</span>
                    <span className="ref-analysis__value" style={{ textTransform: 'capitalize' }}>{recreationSetup.setup_family.replace(/[-_]/g, ' ')}</span>
                  </div>
                )}
                {recreationSetup.modifier_suggestion && recreationSetup.modifier_suggestion !== 'unknown' && (
                  <div className="ref-analysis__row">
                    <span className="ref-analysis__label">Key Modifier</span>
                    <span className="ref-analysis__value">{recreationSetup.modifier_suggestion}</span>
                  </div>
                )}
                {recreationSetup.light_count > 0 && (
                  <div className="ref-analysis__row ref-analysis__row--inline">
                    <span className="ref-analysis__label">Lights Needed</span>
                    <span className="ref-analysis__value">{recreationSetup.light_count}</span>
                  </div>
                )}
                {recreationSetup.key_placement && (
                  <div className="ref-analysis__row">
                    <span className="ref-analysis__label">Key Placement</span>
                    <span className="ref-analysis__value">{recreationSetup.key_placement}</span>
                  </div>
                )}
                {recreationSetup.fill_strategy && (
                  <div className="ref-analysis__row">
                    <span className="ref-analysis__label">Fill Strategy</span>
                    <span className="ref-analysis__value">{recreationSetup.fill_strategy}</span>
                  </div>
                )}
                {recreationSetup.background_strategy && (
                  <div className="ref-analysis__row">
                    <span className="ref-analysis__label">Background</span>
                    <span className="ref-analysis__value">{recreationSetup.background_strategy}</span>
                  </div>
                )}
                {(recreationSetup.focal_length || recreationSetup.aperture) && (
                  <div className="ref-analysis__row ref-analysis__row--inline">
                    <span className="ref-analysis__label">Camera</span>
                    <span className="ref-analysis__value">
                      {[recreationSetup.focal_length, recreationSetup.aperture].filter(Boolean).join('  ·  ')}
                    </span>
                  </div>
                )}
              </div>
              {recreationSetup.setup_notes?.length > 0 && (
                <ul className="three-layer-read__notes">
                  {recreationSetup.setup_notes.map((n, i) => <li key={i}>{n}</li>)}
                </ul>
              )}
            </CollapsibleCard>
          )}

          {/* Mood selector */}
          <div className="result-card">
            <div className="result-card__header">
              <span className="result-card__icon">{'\u2728'}</span>
              <span>Confirm Vibe</span>
            </div>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-dim)', marginBottom: 'var(--space-sm)' }}>
              {classification?.mood
                ? `We detected a ${MOOD_LABELS[classification.mood] || classification.mood} vibe. Tap a different option to override.`
                : 'Select the vibe you want to achieve.'}
            </p>
            <div className="chip-grid">
              {MOOD_OPTIONS.map(m => (
                <button
                  key={m.value}
                  className={`chip ${selectedMood === m.value ? 'chip--selected' : ''}`}
                  onClick={() => setSelectedMood(m.value)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Confirm button */}
          <div style={{ padding: 'var(--space-md) 0', paddingBottom: 'calc(var(--space-xl) + env(safe-area-inset-bottom, 0px))' }}>
            <button
              className="btn btn--primary"
              style={{ width: '100%' }}
              disabled={!selectedMood}
              onClick={handleConfirm}
            >
              Confirm & Get Setup {'\u2192'}
            </button>
          </div>
        </>
      )}

      {/* Fallback: no analysis but not loading */}
      {!loading && !analysis && !error && (
        <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--text-dim)' }}>
          <p>Could not analyze this image. You can still continue.</p>
          <div className="chip-grid" style={{ marginTop: 'var(--space-md)' }}>
            {MOOD_OPTIONS.map(m => (
              <button
                key={m.value}
                className={`chip ${selectedMood === m.value ? 'chip--selected' : ''}`}
                onClick={() => setSelectedMood(m.value)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <button
            className="btn btn--primary"
            style={{ width: '100%', marginTop: 'var(--space-md)' }}
            disabled={!selectedMood}
            onClick={handleConfirm}
          >
            Continue {'\u2192'}
          </button>
        </div>
      )}
    </div>
  );
}

const SCAN_PHASES = [
  'Reading the light\u2026',
  'Analyzing shadows\u2026',
  'Identifying setup\u2026',
  'Evaluating mood\u2026',
  'Checking modifiers\u2026',
];

function ScanStatus() {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setPhase(p => (p + 1) % SCAN_PHASES.length), 2400);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="ref-scan-status">
      <div className="ref-scan-status__bar"><div className="ref-scan-status__fill" /></div>
      <p className="ref-scan-status__text">{SCAN_PHASES[phase]}</p>
    </div>
  );
}
