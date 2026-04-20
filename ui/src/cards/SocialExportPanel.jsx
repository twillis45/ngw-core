/**
 * SocialExportPanel — BTS card + social template generator.
 * Renders on ResultScreen. Pro users get branded, Studio gets white-label.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { C, steel, MACHINED_SHADOW } from '../theme/studioMatte';
import {
  FORMATS,
  renderBTSCard,
  renderStoryTemplate,
  renderCarouselSlide,
  renderBTSSummary,
  downloadCanvas,
} from '../utils/socialCanvas';

const TEMPLATES = [
  { id: 'bts',     label: 'BTS Card',  desc: 'Behind-the-scenes breakdown' },
  { id: 'story',   label: 'Story',     desc: '9:16 for Instagram/TikTok' },
  { id: 'summary', label: 'Summary',   desc: '4:5 hero + diagram + gear' },
  { id: 'carousel',label: 'Carousel',  desc: '1:1 slides — one per light' },
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
}) {
  const [template, setTemplate] = useState('bts');
  const [carouselIdx, setCarouselIdx] = useState(0);
  const canvasRef = useRef(null);
  const photoRef = useRef(null);
  const [photoLoaded, setPhotoLoaded] = useState(false);

  const branded = !(isStudio || isAdmin);
  const pattern = result?.pattern || result?.authoritative_pattern || 'unknown';
  const confidence = (result?.confidence ?? result?.authoritative_confidence ?? 0) / 100;
  const lights = result?.diagram?.lights || result?.sections?.lights || [];
  const camera = result?.camera_settings || result?.cameraSettings || null;

  // Load photo image element
  useEffect(() => {
    if (!imagePreview) { setPhotoLoaded(false); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { photoRef.current = img; setPhotoLoaded(true); };
    img.onerror = () => setPhotoLoaded(false);
    img.src = typeof imagePreview === 'string' ? imagePreview : URL.createObjectURL(imagePreview);
    return () => { if (typeof imagePreview !== 'string') URL.revokeObjectURL(img.src); };
  }, [imagePreview]);

  // Render preview
  const renderPreview = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const fmt = FORMAT_MAP[template] || FORMATS.PORTRAIT;
    canvas.width = fmt.w;
    canvas.height = fmt.h;
    const ctx = canvas.getContext('2d');

    const opts = {
      photo: photoRef.current,
      diagramCanvas,
      pattern,
      confidence,
      lights,
      camera,
      format: fmt,
      branded,
    };

    if (template === 'bts') {
      renderBTSCard(ctx, opts);
    } else if (template === 'story') {
      renderStoryTemplate(ctx, { ...opts, setupSummary: result?.mood ? `${result.mood} lighting` : '' });
    } else if (template === 'summary') {
      renderBTSSummary(ctx, opts);
    } else if (template === 'carousel' && lights.length > 0) {
      const idx = Math.min(carouselIdx, lights.length - 1);
      renderCarouselSlide(ctx, {
        light: lights[idx],
        index: idx,
        total: lights.length,
        pattern,
        branded,
      });
    }
  }, [template, photoLoaded, diagramCanvas, pattern, confidence, lights, camera, branded, carouselIdx, result?.mood]);

  useEffect(() => { renderPreview(); }, [renderPreview]);

  const handleDownload = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (template === 'carousel' && lights.length > 1) {
      // Download all slides
      const tmpCanvas = document.createElement('canvas');
      const fmt = FORMATS.SQUARE;
      tmpCanvas.width = fmt.w;
      tmpCanvas.height = fmt.h;
      const tmpCtx = tmpCanvas.getContext('2d');
      lights.forEach((l, i) => {
        renderCarouselSlide(tmpCtx, { light: l, index: i, total: lights.length, pattern, branded });
        downloadCanvas(tmpCanvas, `${pattern}_light_${i + 1}_${l.role}.png`);
      });
    } else {
      downloadCanvas(canvas, `${pattern}_${template}.png`);
    }
  }, [template, lights, pattern, branded]);

  return (
    <div style={{
      marginTop: 16,
      borderRadius: 14,
      background: `linear-gradient(141.71deg, ${C.panelBg} 0%, ${C.slotBg} 100%)`,
      boxShadow: MACHINED_SHADOW || '4px 4px 12px rgba(0,0,0,0.5)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px 10px',
        borderBottom: `1px solid ${steel(0.08)}`,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: steel(0.4), letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
          SOCIAL EXPORT
        </div>
        <div style={{ fontSize: 13, color: steel(0.55) }}>
          {branded ? 'Pro — branded export' : 'Studio — white-label export'}
        </div>
      </div>

      {/* Template picker */}
      <div style={{
        display: 'flex', gap: 6, padding: '10px 16px',
        overflowX: 'auto', WebkitOverflowScrolling: 'touch',
      }}>
        {TEMPLATES.map(t => (
          <button
            key={t.id}
            onClick={() => { setTemplate(t.id); setCarouselIdx(0); }}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: 'none',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              background: template === t.id
                ? `linear-gradient(141.71deg, ${C.ctaFrom} 0%, ${C.ctaMid} 100%)`
                : C.slotBg,
              color: template === t.id ? steel(0.9) : steel(0.4),
              boxShadow: template === t.id
                ? `2px 2px 6px rgba(0,0,0,0.4), 0 0 0 0.5px ${steel(0.2)}`
                : 'inset 1px 1px 3px rgba(0,0,0,0.4)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Carousel nav */}
      {template === 'carousel' && lights.length > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '4px 16px 8px' }}>
          {lights.map((l, i) => (
            <button
              key={i}
              onClick={() => setCarouselIdx(i)}
              style={{
                width: 8, height: 8, borderRadius: '50%', border: 'none', cursor: 'pointer',
                background: i === carouselIdx ? steel(0.7) : steel(0.2),
              }}
            />
          ))}
        </div>
      )}

      {/* Canvas preview */}
      <div style={{ padding: '0 16px', display: 'flex', justifyContent: 'center' }}>
        <canvas
          ref={canvasRef}
          style={{
            width: '100%',
            maxWidth: 320,
            height: 'auto',
            borderRadius: 8,
            border: `1px solid ${steel(0.08)}`,
          }}
        />
      </div>

      {/* Download */}
      <div style={{ padding: '12px 16px 14px', display: 'flex', gap: 8 }}>
        <button
          onClick={handleDownload}
          style={{
            flex: 1,
            padding: '10px 16px',
            borderRadius: 8,
            border: 'none',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.06em',
            cursor: 'pointer',
            background: `linear-gradient(141.71deg, ${C.ctaFrom} 0%, ${C.ctaMid} 50%, ${C.ctaTo} 100%)`,
            color: steel(0.8),
            boxShadow: `3px 3px 8px rgba(0,0,0,0.5), 0 0 0 0.5px ${steel(0.2)}`,
          }}
        >
          {template === 'carousel' && lights.length > 1
            ? `Download All ${lights.length} Slides`
            : 'Download PNG'}
        </button>
      </div>
    </div>
  );
}
