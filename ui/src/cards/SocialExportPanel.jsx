/**
 * SocialExportPanel — BTS card + social template generator.
 * Renders on ResultScreen. Pro users get branded, Studio gets white-label.
 */
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { C, steel, MACHINED_SHADOW } from '../theme/studioMatte';
import {
  FORMATS,
  renderStoryTemplate,
  renderCarouselSlide,
  drawSignalCard,
  drawBlueprintCard,
  downloadCanvas,
  downloadReel,
} from '../utils/socialCanvas';
import prettify from '../utils/prettify';

const FONT_SMOOTH = { WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' };

// Mirrors ResultScreen parseClockHour — returns true if str encodes a valid 1–12 hour.
function parseCatchlightPresence(str) {
  if (str == null) return false;
  if (typeof str === 'number') return !isNaN(str) && str >= 1 && str <= 12;
  const s = String(str).trim();
  const m = s.match(/(\d+)\s*o.?clock/i);
  if (m) { const h = parseInt(m[1], 10); return h >= 1 && h <= 12; }
  const h = parseInt(s, 10);
  return !isNaN(h) && h >= 1 && h <= 12 && String(h) === s.replace(/\.0$/, '');
}

/**
 * Build a lights array from real engine inference fields when diagram_spec is absent.
 *
 * The lab API (/api/lab/analyze) does not return diagram_spec. It does return
 * lighting_inference and reconstruction which carry the same underlying data in
 * different keys. This function assembles the shape that socialCanvas render
 * functions expect. Only truthful omission — no invented values.
 */
function buildLightsFromInference(raw, sections) {
  const li      = raw?.lighting_inference          || {};
  const recon   = raw?.reconstruction              || {};
  const roles   = recon.light_roles                || {};
  const setup   = raw?.reference_analysis?.recreation_setup || {};
  const mod     = sections?.modifier               || {};
  const built   = [];

  // Key light — include when any key position or modifier inference exists
  const hasKey = !!(li.key_position_text || li.modifier_family || mod.family || setup.key_placement);
  if (hasKey) {
    // Modifier label: prefer sections.modifier.family (already prettified by mapApiResult),
    // then reconstruct from size_class + family, then bare family.
    const sizeClass = recon.modifier_size_class;
    const rawFamily = li.modifier_family || '';
    const modLabel = mod.family
      || (sizeClass && rawFamily
          ? `${sizeClass.charAt(0).toUpperCase() + sizeClass.slice(1)} ${rawFamily}`
          : rawFamily
            ? (li.modifier_size
                ? `${li.modifier_size.charAt(0).toUpperCase() + li.modifier_size.slice(1)} ${rawFamily}`
                : rawFamily)
            : '')
      || '';

    // Position label: prefer existing mapped values, then recreation_setup.key_placement
    // (human-readable, e.g. "camera-right, ~45°, elevated"), then derive from angle+height.
    let posLabel = mod.position || li.key_position_text || '';
    if (!posLabel && setup.key_placement) {
      // Capitalize first letter of the human-readable placement string
      posLabel = setup.key_placement.charAt(0).toUpperCase() + setup.key_placement.slice(1);
    }
    if (!posLabel && recon.key_light_angle_deg != null) {
      const deg = recon.key_light_angle_deg;
      const side = deg > 90 ? 'Camera-Right' : deg < 90 ? 'Camera-Left' : 'On-Axis';
      const heightMap = { high: 'High', eye_level: 'Eye Level', low: 'Low' };
      const heightStr = heightMap[recon.key_light_height] || '';
      posLabel = heightStr ? `${side} · ${heightStr}` : side;
    }

    const distM = recon.modifier_distance_ft != null
      ? recon.modifier_distance_ft / 3.281
      : null;

    // CCT: reconstruction dominant_cct_kelvin is physics-grounded; fall back to image read
    const kelvin = recon.dominant_cct_kelvin ?? li.detected_cct_kelvin ?? null;

    // Catchlight-inferred modifier shape — only present when catchlights are cleanly detected.
    // modifier is an object {label, ...}; extract label string for canvas rendering.
    const catchlightModifier = li.catchlight_intelligence?.modifier?.label
      ?? (typeof li.catchlight_intelligence?.modifier === 'string' ? li.catchlight_intelligence.modifier : null)
      ?? null;

    built.push({
      role: 'key',
      position_label: posLabel,
      modifier_label: modLabel,
      distance_m: distM,
      angle_deg: recon.key_light_angle_deg ?? null,
      kelvin,
      catchlight_modifier: catchlightModifier,
    });
  }

  // Fill — check fill_method_text first, then bounce role, then fill_strategy text
  const fillMethod = (li.fill_method_text || '').toLowerCase();
  let fillAdded = false;
  if (fillMethod && fillMethod !== 'none') {
    const fillMod = fillMethod === 'bounce'    ? 'Bounce reflector'
      : fillMethod === 'bilateral'             ? 'Bilateral fill'
      : fillMethod === 'unilateral'            ? 'Reflector fill'
      : null;
    if (fillMod) {
      built.push({ role: 'fill', position_label: '', modifier_label: fillMod });
      fillAdded = true;
    }
  }

  // Also add fill if bounce role was detected with high confidence and not already added
  if (!fillAdded && roles.bounce?.present === true) {
    built.push({ role: 'fill', position_label: '', modifier_label: 'Bounce reflector' });
  }

  return built;
}

// Returns 'signal' or 'blueprint' based on analysis strength and photo availability.
// Pure function — no side effects.
function recommendExportFormat(result, hasPhoto) {
  const rawConf = result?.authoritative_confidence ?? result?.confidence;
  const conf = rawConf != null ? (rawConf > 1 ? rawConf / 100 : rawConf) : 0;
  // Signal Card is the default recommendation when confidence ≥ 50% or photo is available
  // Blueprint is recommended for high-confidence analytical results without a photo
  if (!hasPhoto && conf >= 0.75) return 'blueprint';
  return 'signal';
}

const TEMPLATES = [
  {
    id: 'bts',
    label: 'Signal',
    desc: 'Pattern · confidence · the signal read',
    formatLabel: '1080×1350 · 4:5',
    platformHint: 'Feed',
  },
  {
    id: 'story',
    label: 'Tall',
    desc: '9:16 tall plate',
    formatLabel: '1080×1920 · 9:16',
    platformHint: 'Stories · Reels',
  },
  {
    id: 'summary',
    label: 'Build',
    desc: 'Lighting blueprint — setup diagram + breakdown',
    formatLabel: '1080×1350 · 4:5',
    platformHint: 'Feed',
  },
  {
    id: 'carousel',
    label: 'Light-by-Light',
    desc: '1:1 plates — one per light source',
    formatLabel: '1080×1080 · 1:1',
    platformHint: 'Carousel',
  },
];

const FORMAT_MAP = {
  bts: FORMATS.PORTRAIT,
  story: FORMATS.STORY,
  summary: FORMATS.PORTRAIT,
  carousel: FORMATS.SQUARE,
};

export default function SocialExportPanel({
  result,
  imagePreview,
  diagramCanvas,
  isStudio = false,
  isAdmin = false,
  layout = 'compact',
}) {
  // Initialize to system recommendation; user can override after mount
  const [template, setTemplate] = useState(() => {
    const rec = recommendExportFormat(result, !!imagePreview);
    return rec === 'blueprint' ? 'summary' : 'bts';
  });
  const [carouselIdx, setCarouselIdx] = useState(0);
  const canvasRef = useRef(null);
  const photoRef = useRef(null);
  const miniCanvasRefs = useRef([null, null, null, null]);
  const [photoLoaded, setPhotoLoaded] = useState(false);
  const [animProgress, setAnimProgress] = useState(1);
  const animRafRef  = useRef(null);
  const animStartRef = useRef(null);
  const [reelRecording, setReelRecording] = useState(false);

  const branded = !(isStudio || isAdmin);
  const pattern = result?.pattern || result?.authoritative_pattern || 'unknown';
  // authoritative_confidence is 0-1; fall back to confidence / 100 if it's 0-100
  const rawConf = result?.authoritative_confidence ?? result?.confidence;
  const confidence = rawConf != null
    ? (rawConf > 1 ? rawConf / 100 : rawConf)
    : 0;
  const lights = (() => {
    const fromDiag = result?._raw?.diagram_spec?.lights;
    if (Array.isArray(fromDiag) && fromDiag.length > 0) return fromDiag;
    const fromLeg = result?.diagram?.lights;
    if (Array.isArray(fromLeg) && fromLeg.length > 0) return fromLeg;
    return buildLightsFromInference(result?._raw, result?.sections);
  })();
  const camera = result?.cameraSettings || result?._raw?.camera_settings || null;
  const environment = result?._raw?.lighting_inference?.detected_environment || null;

  const hasPhoto = !!imagePreview;
  const hasCamera = !!(camera && (camera.aperture || camera.iso || camera.shutter));
  const lightCount = lights.length;

  // Same signal path as ResultScreen confEvidence — only real fired signals, no fallback bluff.
  const confEvidence = useMemo(() => {
    const raw = result?._raw || {};
    const sigs = raw.signal_diagnostics?.signals || {};
    const clStr =
      result?.sections?.catchlightPositions?.[0]
      || raw.lighting_inference?.catchlight_intelligence?.primary_key?.position
      || null;
    const parts = [];
    if (parseCatchlightPresence(clStr)) parts.push('catchlights');
    if (sigs.nose_shadow_angle_deg != null) parts.push('shadow geometry');
    return parts.join(' + ');
  }, [result]);

  useEffect(() => {
    if (!imagePreview) { setPhotoLoaded(false); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { photoRef.current = img; setPhotoLoaded(true); };
    img.onerror = () => setPhotoLoaded(false);
    img.src = typeof imagePreview === 'string' ? imagePreview : URL.createObjectURL(imagePreview);
    return () => { if (typeof imagePreview !== 'string') URL.revokeObjectURL(img.src); };
  }, [imagePreview]);

  // Drive preview animation — retriggers on template or result change
  useEffect(() => {
    cancelAnimationFrame(animRafRef.current);
    animStartRef.current = null;
    setAnimProgress(0);
    const ANIM_MS = 1800;
    const tick = (ts) => {
      if (!animStartRef.current) animStartRef.current = ts;
      const p = Math.min(1, (ts - animStartRef.current) / ANIM_MS);
      setAnimProgress(p);
      if (p < 1) animRafRef.current = requestAnimationFrame(tick);
    };
    animRafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRafRef.current);
  }, [template, result, photoLoaded]);

  const renderPreview = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const fullFmt = FORMAT_MAP[template] || FORMATS.PORTRAIT;
    // Render natively at half-res — no ctx.scale; render functions scale proportionally via S = w/1080
    const previewFmt = { w: Math.round(fullFmt.w / 2), h: Math.round(fullFmt.h / 2) };
    canvas.width = previewFmt.w;
    canvas.height = previewFmt.h;
    const ctx = canvas.getContext('2d');
    const opts = { photo: photoRef.current, diagramCanvas, pattern, confidence, lights, camera, format: previewFmt, branded, environment, progress: animProgress };

    if (template === 'bts') {
      const S = canvas.width / 1080;
      const patternReasoning = result?.sections?.pattern?.reasoning
        || result?._raw?.reconstruction?.reconstruction_narrative
        || '';
      drawSignalCard(ctx, { ...opts, imageEl: photoRef.current, patternReasoning, confEvidence, progress: animProgress }, S);
    } else if (template === 'story') {
      renderStoryTemplate(ctx, { ...opts, setupSummary: result?.mood ? `${result.mood} lighting` : '' });
    } else if (template === 'summary') {
      const S = canvas.width / 1080;
      drawBlueprintCard(ctx, { ...opts, imageEl: photoRef.current, diagramCanvas, confEvidence, progress: animProgress }, S);
    } else if (template === 'carousel' && lights.length > 0) {
      const idx = Math.min(carouselIdx, lights.length - 1);
      renderCarouselSlide(ctx, { light: lights[idx], index: idx, total: lights.length, pattern, format: previewFmt, branded, progress: animProgress });
    }
  }, [template, photoLoaded, diagramCanvas, pattern, confidence, lights, camera, branded, carouselIdx, environment, result?.mood, animProgress, confEvidence]);

  useEffect(() => { renderPreview(); }, [renderPreview]);

  const renderMiniPreviews = useCallback(() => {
    TEMPLATES.forEach((t, idx) => {
      const mc = miniCanvasRefs.current[idx];
      if (!mc) return;
      const dims = MINI_DIMS[t.id];
      mc.width  = dims.cw;
      mc.height = dims.ch;
      const ctx = mc.getContext('2d');
      const miniFmt = { w: dims.cw, h: dims.ch };
      const miniOpts = { photo: photoRef.current, diagramCanvas, pattern, confidence, lights, camera, format: miniFmt, branded, environment, progress: 1 };
      if (t.id === 'bts') {
        const patternReasoning = result?.sections?.pattern?.reasoning || result?._raw?.reconstruction?.reconstruction_narrative || '';
        drawSignalCard(ctx, { ...miniOpts, imageEl: photoRef.current, patternReasoning, confEvidence, progress: 1 }, dims.cw / 1080);
      } else if (t.id === 'story') {
        renderStoryTemplate(ctx, { ...miniOpts, setupSummary: result?.mood ? `${result.mood} lighting` : '' });
      } else if (t.id === 'summary') {
        drawBlueprintCard(ctx, { ...miniOpts, imageEl: photoRef.current, diagramCanvas, confEvidence, progress: 1 }, dims.cw / 1080);
      } else if (t.id === 'carousel' && lights.length > 0) {
        renderCarouselSlide(ctx, { light: lights[0], index: 0, total: lights.length, pattern, format: miniFmt, branded, progress: 1 });
      }
    });
  }, [photoLoaded, diagramCanvas, pattern, confidence, lights, camera, branded, environment, result?.mood, confEvidence, result?.sections?.pattern?.reasoning, result?._raw?.reconstruction?.reconstruction_narrative]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (layout === 'workbench') renderMiniPreviews(); }, [layout, renderMiniPreviews]);

  const handleDownload = useCallback(() => {
    const fmt = FORMAT_MAP[template] || FORMATS.PORTRAIT;
    const opts = { photo: photoRef.current, diagramCanvas, pattern, confidence, lights, camera, format: fmt, branded, environment };

    const patSlug = (pattern || 'unknown').replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-');
    const Pat     = patSlug.charAt(0).toUpperCase() + patSlug.slice(1);
    const TEMPLATE_LABEL = { bts: 'Signal-Card', story: 'Story', summary: 'Blueprint', carousel: 'Carousel' };
    const FORMAT_LABEL   = { PORTRAIT: '4x5', STORY: '9x16', SQUARE: '1x1', LANDSCAPE: '16x9' };
    const fmtKey  = Object.keys(FORMATS).find(k => FORMATS[k].w === fmt.w && FORMATS[k].h === fmt.h) || 'PORTRAIT';
    const tplLabel = TEMPLATE_LABEL[template] || template;
    const fmtLabel = FORMAT_LABEL[fmtKey] || `${fmt.w}x${fmt.h}`;

    if (template === 'carousel' && lights.length > 1) {
      const tmp = document.createElement('canvas');
      const sqFmt = FORMATS.SQUARE;
      tmp.width = sqFmt.w; tmp.height = sqFmt.h;
      const tCtx = tmp.getContext('2d');
      lights.forEach((l, i) => {
        renderCarouselSlide(tCtx, { light: l, index: i, total: lights.length, pattern, format: sqFmt, branded });
        const roleSlug = (l.role || `light-${i+1}`).charAt(0).toUpperCase() + (l.role || `light-${i+1}`).slice(1);
        downloadCanvas(tmp, `NGW_${Pat}_Carousel-${roleSlug}_1x1.png`);
      });
    } else {
      // Render at full resolution for download
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = fmt.w; exportCanvas.height = fmt.h;
      const eCtx = exportCanvas.getContext('2d');
      if (template === 'bts') {
        const S = fmt.w / 1080;
        const patternReasoning = result?.sections?.pattern?.reasoning
          || result?._raw?.reconstruction?.reconstruction_narrative
          || '';
        drawSignalCard(eCtx, { ...opts, imageEl: photoRef.current, patternReasoning, confEvidence }, S);
      } else if (template === 'story') renderStoryTemplate(eCtx, { ...opts, setupSummary: result?.mood ? `${result.mood} lighting` : '' });
      else if (template === 'summary') {
        const S = fmt.w / 1080;
        drawBlueprintCard(eCtx, { ...opts, imageEl: photoRef.current, diagramCanvas, confEvidence }, S);
      }
      else if (template === 'carousel') {
        const idx = Math.min(carouselIdx, lights.length - 1);
        renderCarouselSlide(eCtx, { light: lights[idx], index: idx, total: lights.length, pattern, format: fmt, branded });
      }
      downloadCanvas(exportCanvas, `NGW_${Pat}_${tplLabel}_${fmtLabel}.png`);
    }
  }, [template, lights, pattern, branded, confidence, camera, diagramCanvas, result?.mood, carouselIdx, environment, confEvidence]);

  const handleDownloadReel = useCallback(async () => {
    setReelRecording(true);
    const reelOpts = { photo: photoRef.current, diagramCanvas, pattern, confidence, lights, camera, branded, environment, setupSummary: result?.mood ? `${result.mood} lighting` : '', confEvidence };
    const reelTemplate = template === 'carousel' ? 'carousel' : template;
    const reelLight = template === 'carousel' ? lights[Math.min(carouselIdx, lights.length - 1)] : undefined;
    try {
      await downloadReel(reelTemplate, { ...reelOpts, light: reelLight, index: carouselIdx, total: lights.length });
    } finally {
      setReelRecording(false);
    }
  }, [template, lights, pattern, branded, confidence, camera, diagramCanvas, result?.mood, carouselIdx, environment, confEvidence]);

  // Reactive recommendation — updates if result changes; template state does not auto-reset
  const recommended = useMemo(() => {
    const rec = recommendExportFormat(result, !!imagePreview);
    return rec === 'blueprint' ? 'summary' : 'bts';
  }, [result, imagePreview]);

  const activeTpl = TEMPLATES.find(t => t.id === template);
  const confPct = Math.round(confidence * 100);
  const confLabel = confPct >= 80 ? 'High' : confPct >= 60 ? 'Moderate' : 'Low';
  const confColorStr = confPct >= 75 ? '#48ba88' : confPct >= 50 ? 'rgba(132,158,184,0.90)' : 'rgba(132,158,184,0.50)';

  // ── Aspect-ratio shape dimensions for ExportFormatStrip chips
  const CHIP_ASP = {
    bts:      { w: 22, h: 28 },  // 4:5 portrait
    story:    { w: 16, h: 28 },  // 9:16 tall
    summary:  { w: 22, h: 28 },  // 4:5 portrait
    carousel: { w: 26, h: 26 },  // 1:1 square
  };

  // ── Workbench mini-canvas pixel dimensions (canvas attrs) + CSS display width
  const MINI_DIMS = {
    bts:      { cw: 108, ch: 135, dw: 44 },
    story:    { cw:  81, ch: 144, dw: 33 },
    summary:  { cw: 108, ch: 135, dw: 44 },
    carousel: { cw: 108, ch: 108, dw: 44 },
  };

  if (layout === 'workbench') {
    return (
      <div style={{
        marginTop: 16,
        borderRadius: 14,
        background: `linear-gradient(160deg, ${C.panelBg} 0%, #0d0d11 100%)`,
        boxShadow: MACHINED_SHADOW,
        overflow: 'hidden',
        ...FONT_SMOOTH,
      }}>

        {/* ── WORKBENCH MASTHEAD ── */}
        <div style={{
          padding: '15px 20px 13px',
          borderBottom: `1px solid ${steel(0.07)}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 7 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: steel(0.30), letterSpacing: '0.14em', textTransform: 'uppercase' }}>
              Dispatch
            </div>
            <div style={{ fontSize: 9, color: steel(0.36), letterSpacing: '0.03em' }}>
              {confPct >= 75 ? 'Plate ready to issue.' : confPct >= 50 ? 'Close read — review before issuing.' : 'Review result before issuing.'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 21, fontWeight: 700, color: steel(0.88), letterSpacing: '-0.4px', lineHeight: 1.1 }}>
              {prettify(pattern, { title: true })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
              <span style={{ color: confColorStr, fontWeight: 700, fontSize: 13 }}>{confPct}%</span>
              <span style={{ color: steel(0.28), fontSize: 12 }}>·</span>
              <span style={{ color: steel(0.40), fontSize: 12 }}>{confLabel}</span>
              {lightCount > 0 && (
                <>
                  <span style={{ color: steel(0.28), fontSize: 12 }}>·</span>
                  <span style={{ color: steel(0.36), fontSize: 12 }}>{lightCount} light{lightCount !== 1 ? 's' : ''}</span>
                </>
              )}
              <span style={{ marginLeft: 8, fontSize: 9, fontWeight: 700, color: steel(0.24), letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                {branded ? 'Pro' : 'Studio'}
              </span>
            </div>
          </div>
        </div>

        {/* ── WORKBENCH TWO-ZONE BODY ── */}
        <div style={{ display: 'flex' }}>

          {/* Left: format rail */}
          <div style={{
            width: 158,
            flexShrink: 0,
            borderRight: `1px solid ${steel(0.06)}`,
            padding: '13px 10px 15px',
            display: 'flex',
            flexDirection: 'column',
            gap: 7,
          }}>
            {TEMPLATES.map((t, idx) => {
              const isSel = template === t.id;
              const isRec = recommended === t.id;
              const dims  = MINI_DIMS[t.id];
              return (
                <button
                  key={t.id}
                  onClick={() => { setTemplate(t.id); setCarouselIdx(0); }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 9,
                    width: '100%',
                    padding: '8px 9px',
                    borderRadius: 8,
                    border: isSel ? `1.5px solid ${steel(0.26)}` : `1px solid ${steel(0.08)}`,
                    cursor: 'pointer',
                    background: isSel
                      ? `linear-gradient(141.71deg, ${C.ctaFrom} 0%, ${C.ctaMid} 100%)`
                      : C.slotBg,
                    boxShadow: isSel
                      ? `2px 2px 6px rgba(0,0,0,0.38), 0 0 0 0.5px ${steel(0.14)}`
                      : 'inset 1px 1px 2px rgba(0,0,0,0.32)',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <div style={{ flexShrink: 0, borderRadius: 3, overflow: 'hidden', boxShadow: `0 0 0 1px ${steel(isSel ? 0.18 : 0.12)}` }}>
                    <canvas
                      ref={el => { miniCanvasRefs.current[idx] = el; }}
                      style={{ width: dims.dw, height: 'auto', display: 'block' }}
                    />
                  </div>
                  <div style={{ textAlign: 'left', minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: isSel ? steel(0.90) : steel(0.50), letterSpacing: '0.02em', lineHeight: 1, display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                      {t.label}
                      {isRec && (
                        <span title="Engine recommendation" style={{ fontSize: 7, fontWeight: 600, color: steel(0.38), letterSpacing: '0.04em', lineHeight: 1 }}>
                          ★ Best fit
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 9, color: isSel ? steel(0.36) : steel(0.22), marginTop: 3, lineHeight: 1 }}>
                      {t.platformHint}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Right: preview + actions */}
          <div style={{
            flex: 1,
            minWidth: 0,
            padding: '13px 16px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 11,
          }}>

            {/* Preview stage */}
            {!(template === 'carousel' && lights.length === 0) ? (
              <div style={{
                background: 'rgba(0,0,0,0.32)',
                borderRadius: 10,
                padding: 6,
                boxShadow: `0 0 0 1px ${steel(0.09)}, 0 10px 28px rgba(0,0,0,0.55)`,
                display: 'flex',
                justifyContent: 'center',
              }}>
                <canvas ref={canvasRef} style={{
                  width: '100%',
                  maxWidth: template === 'story' ? 320 : template === 'carousel' ? 420 : 460,
                  height: 'auto',
                  borderRadius: 6,
                  display: 'block',
                }} />
              </div>
            ) : (
              <div style={{ padding: '36px 16px', textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: 13, color: steel(0.32) }}>
                  Carousel requires light placement data from the engine.
                </p>
              </div>
            )}

            {template === 'carousel' && lights.length > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
                {lights.map((l, i) => (
                  <button key={i} onClick={() => setCarouselIdx(i)}
                    style={{ width: 7, height: 7, borderRadius: '50%', border: 'none', cursor: 'pointer', padding: 0,
                      background: i === carouselIdx ? steel(0.65) : steel(0.18) }} />
                ))}
              </div>
            )}

            {/* Format context */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, fontSize: 10 }}>
              <span style={{ color: steel(0.40) }}>{activeTpl?.desc}</span>
              <span style={{ color: steel(0.20) }}>·</span>
              <span style={{ fontWeight: 600, color: steel(0.28), letterSpacing: '0.04em' }}>{activeTpl?.formatLabel}</span>
            </div>

            {/* Download actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <button onClick={handleDownload} style={{
                width: '100%',
                padding: '12px 16px',
                borderRadius: 9,
                border: 'none',
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.07em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                background: `linear-gradient(141.71deg, ${C.ctaFrom} 0%, ${C.ctaMid} 50%, ${C.ctaTo} 100%)`,
                color: steel(0.88),
                boxShadow: `3px 3px 8px rgba(0,0,0,0.5), 0 0 0 0.5px ${steel(0.18)}`,
                WebkitTapHighlightColor: 'transparent',
              }}>
                {template === 'carousel' && lights.length > 1
                  ? `Issue ${lights.length} Plates`
                  : 'Issue Plate'}
              </button>
              <button onClick={handleDownloadReel} disabled={reelRecording} style={{
                width: '100%',
                padding: '9px 16px',
                borderRadius: 9,
                border: `1px solid ${reelRecording ? 'rgba(212,160,84,0.14)' : 'rgba(212,160,84,0.22)'}`,
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                cursor: reelRecording ? 'default' : 'pointer',
                background: reelRecording ? 'rgba(212,160,84,0.06)' : 'rgba(212,160,84,0.04)',
                color: reelRecording ? 'rgba(212,160,84,0.42)' : 'rgba(212,160,84,0.72)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                transition: 'color 0.18s, border-color 0.18s',
                WebkitTapHighlightColor: 'transparent',
              }}>
                {reelRecording ? (
                  <>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(212,160,84,0.55)', flexShrink: 0 }} />
                    Recording…
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: 10, lineHeight: 1 }}>▸</span>
                    Issue Reel →
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      marginTop: 16,
      borderRadius: 16,
      background: `linear-gradient(160deg, ${C.panelBg} 0%, #0d0d11 100%)`,
      boxShadow: MACHINED_SHADOW,
      overflow: 'hidden',
      ...FONT_SMOOTH,
    }}>

      {/* ── HEADER — compact, no wasted vertical space ── */}
      <div style={{
        padding: '13px 16px 11px',
        borderBottom: `1px solid ${steel(0.07)}`,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: steel(0.32), letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 5 }}>
            Dispatch
          </div>
          <div style={{ fontSize: 17, fontWeight: 700, color: steel(0.88), letterSpacing: '-0.3px', lineHeight: 1.2 }}>
            {prettify(pattern, { title: true })}
          </div>
          <div style={{ marginTop: 4, fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            <span style={{ color: confColorStr, fontWeight: 700 }}>{confPct}%</span>
            <span style={{ color: steel(0.28) }}>·</span>
            <span style={{ color: steel(0.42) }}>{confLabel}</span>
            {lightCount > 0 && (
              <>
                <span style={{ color: steel(0.28) }}>·</span>
                <span style={{ color: steel(0.38) }}>{lightCount} light{lightCount !== 1 ? 's' : ''}</span>
              </>
            )}
          </div>
        </div>
        <div style={{ fontSize: 9, fontWeight: 700, color: steel(0.25), letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 1, flexShrink: 0 }}>
          {branded ? 'Pro' : 'Studio'}
        </div>
      </div>

      {/* ── CANVAS PREVIEW — first and largest element ── */}
      {!(template === 'carousel' && lights.length === 0) && (
        <div style={{ padding: '14px 12px 10px' }}>
          <div style={{
            background: 'rgba(0,0,0,0.32)',
            borderRadius: 12,
            padding: 7,
            boxShadow: `0 0 0 1px ${steel(0.09)}, 0 10px 30px rgba(0,0,0,0.58)`,
            display: 'flex',
            justifyContent: 'center',
          }}>
            <canvas
              ref={canvasRef}
              style={{
                width: '100%',
                maxWidth: template === 'story' ? 252 : 300,
                height: 'auto',
                borderRadius: 7,
                display: 'block',
              }}
            />
          </div>
        </div>
      )}

      {/* ── EMPTY CAROUSEL STATE ── */}
      {template === 'carousel' && lights.length === 0 && (
        <div style={{ padding: '36px 16px', textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 13, color: steel(0.32) }}>
            Carousel requires light placement data from the engine.
          </p>
        </div>
      )}

      {/* ── CAROUSEL SLIDE NAV ── */}
      {template === 'carousel' && lights.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '6px 16px 2px' }}>
          {lights.map((l, i) => (
            <button
              key={i}
              onClick={() => setCarouselIdx(i)}
              style={{
                width: 7, height: 7, borderRadius: '50%', border: 'none', cursor: 'pointer', padding: 0,
                background: i === carouselIdx ? steel(0.65) : steel(0.18),
              }}
            />
          ))}
        </div>
      )}

      {/* ── EXPORT FORMAT STRIP — visual chip selector ── */}
      <div style={{ padding: '12px 12px 0', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div style={{ display: 'inline-flex', gap: 8, paddingBottom: 4, minWidth: 'max-content' }}>
          {TEMPLATES.map(t => {
            const isSel = template === t.id;
            const isRec = recommended === t.id;
            const asp   = CHIP_ASP[t.id] || { w: 22, h: 28 };
            return (
              <button
                key={t.id}
                onClick={() => { setTemplate(t.id); setCarouselIdx(0); }}
                style={{
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 5,
                  minWidth: 70,
                  padding: '10px 10px 9px',
                  borderRadius: 10,
                  border: isSel
                    ? `1.5px solid ${steel(0.28)}`
                    : isRec
                      ? '1.5px solid rgba(240,188,68,0.20)'
                      : `1px solid ${steel(0.09)}`,
                  background: isSel
                    ? `linear-gradient(141.71deg, ${C.ctaFrom} 0%, ${C.ctaMid} 100%)`
                    : isRec
                      ? 'rgba(240,188,68,0.035)'
                      : C.slotBg,
                  cursor: 'pointer',
                  flexShrink: 0,
                  boxShadow: isSel
                    ? `2px 2px 8px rgba(0,0,0,0.4), 0 0 0 0.5px ${steel(0.16)}`
                    : 'inset 1px 1px 3px rgba(0,0,0,0.38)',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                {/* Recommended badge */}
                {isRec && (
                  <span style={{
                    position: 'absolute',
                    top: 5,
                    right: 5,
                    fontSize: 7,
                    fontWeight: 800,
                    letterSpacing: '0.07em',
                    color: 'rgba(240,188,68,0.85)',
                    background: 'rgba(240,188,68,0.12)',
                    border: '1px solid rgba(240,188,68,0.22)',
                    borderRadius: 3,
                    padding: '1px 3px',
                    lineHeight: 1.5,
                  }}>REC</span>
                )}
                {/* Aspect ratio shape */}
                <div style={{
                  width: asp.w,
                  height: asp.h,
                  borderRadius: 2,
                  background: isSel ? 'rgba(255,255,255,0.12)' : steel(0.08),
                  border: `1px solid ${isSel ? steel(0.32) : steel(0.13)}`,
                  flexShrink: 0,
                }} />
                <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.02em', color: isSel ? steel(0.92) : steel(0.48), lineHeight: 1 }}>
                  {t.label}
                </span>
                <span style={{ fontSize: 9, letterSpacing: '0.04em', color: isSel ? steel(0.40) : steel(0.22), lineHeight: 1 }}>
                  {t.id === 'story' ? '9:16' : t.id === 'carousel' ? '1:1' : '4:5'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── ACTIVE FORMAT CONTEXT ── single line, desc + dimensions */}
      <div style={{
        padding: '8px 14px 12px',
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        borderBottom: `1px solid ${steel(0.06)}`,
      }}>
        <span style={{ fontSize: 12, color: steel(0.44) }}>
          {activeTpl?.desc}
        </span>
        <span style={{ fontSize: 10, fontWeight: 600, color: steel(0.26), letterSpacing: '0.05em', flexShrink: 0, marginLeft: 12 }}>
          {activeTpl?.formatLabel}
        </span>
      </div>

      {/* ── DOWNLOAD ACTIONS ── primary PNG + secondary reel */}
      <div style={{ padding: '12px 12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>

        {/* Primary: PNG download with format name */}
        <button
          onClick={handleDownload}
          style={{
            width: '100%',
            padding: '13px 16px',
            borderRadius: 10,
            border: 'none',
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            background: `linear-gradient(141.71deg, ${C.ctaFrom} 0%, ${C.ctaMid} 50%, ${C.ctaTo} 100%)`,
            color: steel(0.88),
            boxShadow: `3px 3px 8px rgba(0,0,0,0.5), 0 0 0 0.5px ${steel(0.18)}`,
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {template === 'carousel' && lights.length > 1
            ? `Issue ${lights.length} Plates`
            : 'Issue Plate'}
        </button>

        {/* Secondary: animated reel */}
        <button
          onClick={handleDownloadReel}
          disabled={reelRecording}
          style={{
            width: '100%',
            padding: '10px 16px',
            borderRadius: 10,
            border: `1px solid ${reelRecording ? 'rgba(212,160,84,0.14)' : 'rgba(212,160,84,0.22)'}`,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            cursor: reelRecording ? 'default' : 'pointer',
            background: reelRecording ? 'rgba(212,160,84,0.06)' : 'rgba(212,160,84,0.04)',
            color: reelRecording ? 'rgba(212,160,84,0.42)' : 'rgba(212,160,84,0.72)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            transition: 'color 0.18s, border-color 0.18s',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {reelRecording ? (
            <>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: 'rgba(212,160,84,0.55)', flexShrink: 0,
              }} />
              Recording…
            </>
          ) : (
            <>
              <span style={{ fontSize: 10, lineHeight: 1 }}>▸</span>
              Issue Reel →
            </>
          )}
        </button>

      </div>
    </div>
  );
}
