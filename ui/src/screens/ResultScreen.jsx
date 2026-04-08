/**
 * ResultScreen — Studio Matte design
 * Pixel-exact match to Figma:
 *   High confidence: YQgGd8KZyZoXzZwJV7p4b6 / 1493:2
 *   Low confidence:  YQgGd8KZyZoXzZwJV7p4b6 / 1498:2
 *
 * Layout: absolute-positioned top section (hero, pattern, pills, CTA)
 *         + flow analytical panel that expands in-place
 * All data from props — no hardcoded sample values.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { tapHaptic, selectHaptic, successHaptic, navHaptic } from '../utils/haptics';
import { resultRevealSound, panelToggleSound, segmentPressSound, navSlideSound, softClickSound } from '../utils/sounds';
import scrollAffordance from '../assets/day1/scroll-affordance.svg';

// ─── Studio Matte Token Palette ──────────────────────────────────────────────
// Exact values from Figma YQgGd8KZyZoXzZwJV7p4b6 / Studio Matte Theme
// NOTE: confHigh rgb matches --color-success (#48ba88) in tokens.css exactly.
//       confLow  rgb is golden-amber, distinct from --color-warning (#f59e34).

const steel = (a) => `rgba(95,124,150,${a})`;   // Studio Matte steel-blue tint

const C = {
  // ── Surface ──
  bg:          '#000001',           // main background
  slotBg:      '#08080a',           // viewfinder / slot background
  panelBg:     '#0f1013',           // analytical panel background
  pillBg:      '#070709',           // meta pill background
  ctaFrom:     '#3d404d',           // CTA gradient top
  ctaMid:      '#292b36',           // CTA gradient mid
  ctaTo:       '#1c1d24',           // CTA gradient bottom

  // ── Text ──
  textPrimary: 'rgba(245,247,250,0.95)',   // pattern name
  textSub:     'rgba(184,191,199,0.65)',   // panel summaries (collapsed)
  textSubBold: 'rgba(184,191,199,0.85)',   // leading candidate name (expanded)
  textMeta:    '#a7adb7',                  // pills, back nav, retake/save
  textDim:     'rgba(184,191,199,0.5)',    // panel chevrons, secondary scores
  textWarn:    'rgba(245,190,71,0.65)',    // "close match" warning (low conf)

  // ── Confidence colors — mapped to nearest token ──
  // High: rgb(72,186,136) = var(--color-success) in tokens.css → use directly
  confHigh:    'rgba(72,186,136,0.95)',    // --color-success at 95% opacity
  confHighBar: 'rgba(72,186,136,0.8)',     // success bar fill
  // Low: golden-amber, distinct from --color-warning (#f59e34 = more orange)
  confLow:     'rgba(245,190,72,0.9)',     // Studio Matte amber
  confLowBar:  'rgba(245,190,71,0.8)',     // amber bar fill
  confLowScore:'rgba(245,190,71,0.9)',     // amber score text (expanded)

  // ── Structural ──
  homeBar:     'rgba(245,247,250,0.06)',   // iOS home indicator
  divider:     'rgba(255,255,255,0.04)',   // panel row dividers
  barTrack:    'rgba(184,191,199,0.08)',   // score bar track
  barAlt:      'rgba(184,191,199,0.25)',   // secondary bar fill
};

// ─── Glossy embossed icon treatment — dark glass with highlight catch ────────
const METALLIC_CHEVRON = {
  backgroundImage: 'linear-gradient(141.71deg, rgba(40,44,52,0.95) 0%, rgba(70,78,90,0.90) 30%, rgba(25,28,34,0.85) 55%, rgba(55,62,72,0.80) 75%, rgba(20,22,28,0.90) 100%)',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
  WebkitFontSmoothing: 'antialiased',
  MozOsxFontSmoothing: 'grayscale',
  textRendering: 'geometricPrecision',
  filter: 'drop-shadow(0px 1px 1px rgba(0,0,0,0.6)) drop-shadow(0px -1px 0px rgba(255,255,255,0.10)) drop-shadow(0px 0px 2px rgba(95,124,150,0.12))',
};

// ─── Viewfinder layer styles — kept in sync with HomeScreen ─────────────────
const VIEWFINDER_INNER_SHADOW = [
  'inset 0px 1px 1px 0px rgba(0,0,0,0.05)',
  'inset 0px 0px 24px 0px rgba(95,124,150,0.09)',
  'inset 0px 0px 14px 0px rgba(95,124,150,0.11)',
].join(', ');

const GLASS_REFLECTION = [
  'linear-gradient(141.71deg,',
  'rgba(255,255,255,0.36) 0%,',
  'rgba(255,255,255,0.30) 2%,',
  'rgba(255,255,255,0.24) 4%,',
  'rgba(255,255,255,0.19) 6.5%,',
  'rgba(255,255,255,0.15) 9%,',
  'rgba(255,255,255,0.12) 12%,',
  'rgba(255,255,255,0.095) 16%,',
  'rgba(255,255,255,0.075) 20%,',
  'rgba(255,255,255,0.058) 25%,',
  'rgba(255,255,255,0.044) 30%,',
  'rgba(255,255,255,0.034) 36%,',
  'rgba(255,255,255,0.025) 42%,',
  'rgba(255,255,255,0.018) 48%,',
  'rgba(255,255,255,0.013) 54%,',
  'rgba(255,255,255,0.015) 62%,',
  'rgba(255,255,255,0.020) 68%,',
  'rgba(255,255,255,0.015) 74%,',
  'rgba(255,255,255,0.006) 80%,',
  'rgba(255,255,255,0) 86%)',
].join(' ');

const LENS_VIGNETTE = 'radial-gradient(ellipse 100% 90% at center, transparent 52%, rgba(0,0,0,0.08) 76%, rgba(0,0,0,0.22) 100%)';

// ─── Shadow + gradient constants ────────────────────────────────────────────
// CTA button — exact from Figma 1494:12
const CTA_BG     = `linear-gradient(141.71deg, ${C.ctaFrom} 0%, ${C.ctaMid} 50%, ${C.ctaTo} 100%)`;
const CTA_SHADOW = `0px 0px 6px 1px ${steel(0.08)}, 1px 2px 4px 0px rgba(0,0,0,0.45), 2px 5px 12px 0px rgba(0,0,0,0.7)`;
const CTA_BEVEL  = 'inset -1px -1px 2px 0px rgba(0,0,0,0.3), inset 1px 1px 0px 0px rgba(255,255,255,0.2)';

// Pill inset shadow — exact from Figma pill nodes
const PILL_SHADOW = 'inset 1px 1px 2px 0px rgba(0,0,0,0.2), inset 1px 2px 4px 0px rgba(0,0,0,0.4)';

// Analytical panel — exact from Figma 1515:2
const PANEL_SHADOW = '1px 2px 4px 0px rgba(0,0,0,0.2), 2px 4px 12px 0px rgba(0,0,0,0.4)';
const PANEL_BEVEL  = 'inset -1px -1px 2px 0px rgba(0,0,0,0.12), inset 1px 1px 0px 0px rgba(255,255,255,0.05)';

function Pill({ label }) {
  return (
    <div style={{
      height: 28,
      paddingLeft: 10, paddingRight: 10,
      backgroundColor: C.pillBg,
      borderRadius: 6,
      display: 'flex', alignItems: 'center',
      boxShadow: PILL_SHADOW,
      flexShrink: 0,
    }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: C.textMeta, whiteSpace: 'nowrap', WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', textRendering: 'geometricPrecision' }}>{label}</span>
    </div>
  );
}

function PatternBars({ candidates, isHighConf }) {
  const scoreColor  = isHighConf ? C.confHigh     : C.confLowScore;
  const barFill     = isHighConf ? C.confHighBar  : C.confLowBar;
  const TRACK_W     = 270;

  return (
    <div style={{ padding: '0 20px 16px' }}>
      {candidates.map((c, i) => (
        <div key={c.name} style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{
              fontSize: 13,
              fontWeight: i === 0 ? 600 : 500,
              color: i === 0 ? C.textSubBold : C.textSub,
              WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', textRendering: 'geometricPrecision',
            }}>{c.name}</span>
            <span style={{
              fontSize: 13, fontWeight: 600,
              color: i === 0 ? scoreColor : C.textSub,
              WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', textRendering: 'geometricPrecision',
            }}>{c.score}%</span>
          </div>
          {/* Bar track + fill */}
          <div style={{
            width: TRACK_W, height: 3, borderRadius: 1.5,
            backgroundColor: C.barTrack,
            position: 'relative',
          }}>
            <div style={{
              position: 'absolute', left: 0, top: 0,
              width: `${(c.score / 100) * TRACK_W}px`, height: '100%',
              borderRadius: 1.5,
              backgroundColor: i === 0 ? barFill : C.barAlt,
              transition: 'width 0.4s ease',
            }} />
          </div>
        </div>
      ))}
      {!isHighConf && (
        <p style={{
          margin: '12px 0 0', fontSize: 11,
          color: C.textWarn, lineHeight: 1.4,
          WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', textRendering: 'geometricPrecision',
        }}>Close match — retake for higher confidence</p>
      )}
    </div>
  );
}

export default function ResultScreen({ result, imagePreview, onSetup, onRetry }) {
  const [expandedSection, setExpandedSection] = useState(() =>
    result && result.confidence < 70 ? 'patterns' : null
  );
  const [infoVisible, setInfoVisible] = useState(true);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(null);
  const dragThreshold = 40; // px to commit show/hide

  // Result reveal sound + haptic on mount
  useEffect(() => {
    resultRevealSound();
    successHaptic();
  }, []);

  const startDrag = useCallback((clientY) => {
    dragStartY.current = clientY;
    setIsDragging(true);
  }, []);

  const moveDrag = useCallback((clientY) => {
    if (dragStartY.current === null) return;
    const dy = clientY - dragStartY.current;
    if (infoVisible) {
      setDragOffset(Math.max(0, dy));
    } else {
      setDragOffset(Math.min(0, dy));
    }
  }, [infoVisible]);

  const endDrag = useCallback(() => {
    if (infoVisible && dragOffset > dragThreshold) {
      setInfoVisible(false);
      selectHaptic();
    } else if (!infoVisible && dragOffset < -dragThreshold) {
      setInfoVisible(true);
      selectHaptic();
    }
    setDragOffset(0);
    setIsDragging(false);
    dragStartY.current = null;
  }, [infoVisible, dragOffset]);

  // Touch handlers
  const onTouchStart = useCallback((e) => startDrag(e.touches[0].clientY), [startDrag]);
  const onTouchMove = useCallback((e) => moveDrag(e.touches[0].clientY), [moveDrag]);
  const onTouchEnd = useCallback(() => endDrag(), [endDrag]);

  // Mouse handlers (desktop drag)
  const onMouseDown = useCallback((e) => { e.preventDefault(); startDrag(e.clientY); }, [startDrag]);
  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e) => moveDrag(e.clientY);
    const onUp = () => endDrag();
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isDragging, moveDrag, endDrag]);

  if (!result) return null;

  const { pattern, confidence, meta, sections } = result;
  const isHighConf  = confidence >= 70;
  const confColor   = isHighConf ? C.confHigh : C.confLow;
  const panelTop    = isHighConf ? 473 : 478;
  const leadMargin  = confidence - (sections.patternCandidates[1]?.score ?? 0);

  const toggle = (key) => { setExpandedSection(prev => prev === key ? null : key); panelToggleSound(); tapHaptic(); };

  // Summary lines for collapsed rows
  const summaries = {
    patterns: isHighConf
      ? `${pattern} leads by ${leadMargin} pts`
      : `${sections.patternCandidates.length} close matches`,
    shadow: sections.shadowAnalysis.split('.')[0],  // first sentence only
    catchlight: sections.catchlightModifier.split(',')[0],
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: '#000', overflow: 'hidden' }}>
    <div onClick={(e) => { if (e.target === e.currentTarget) tapHaptic(); }} style={{
      width: '100%',
      maxWidth: 430,
      minHeight: '100%',
      backgroundColor: C.bg,
      backgroundImage: 'radial-gradient(ellipse 80% 60% at 50% 30%, rgba(95,124,150,0.003) 0%, transparent 70%)',
      boxShadow: '2px 4px 40px rgba(0,0,0,0.6), -1px -1px 1px rgba(255,255,255,0.02)',
      margin: '0 auto',
      fontFamily: 'Inter, system-ui, sans-serif',
      overflowX: 'hidden',
      overflowY: 'auto',
      position: 'relative',
    }}>
      {/* ── Matte surface: top highlight + noise grain ── */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(141.71deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.015) 40%, transparent 80%)' }} />
        <div style={{ position: 'absolute', inset: 0, opacity: 0.18, mixBlendMode: 'multiply', backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='3.5' numOctaves='6' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`, backgroundSize: '128px 128px' }} />
      </div>

      {/* ─── Top section — absolute positioned within fixed-height container ─── */}
      <div style={{ position: 'relative', height: panelTop }}>

        {/* Back nav */}
        <button
          onClick={() => { navSlideSound(); navHaptic(); onRetry(); }}
          style={{
            position: 'absolute', top: 48, left: 8,
            width: 44, height: 44,
            background: 'none', border: 'none', cursor: 'pointer',
            overflow: 'hidden', WebkitTapHighlightColor: 'transparent',
            display: 'flex', alignItems: 'center',
          }}
        >
          <span style={{
            position: 'absolute', left: 14, top: 8,
            fontSize: 22, fontWeight: 600, color: '#a7adb7', lineHeight: 1,
            WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', textRendering: 'geometricPrecision',
          }}>‹</span>
        </button>

        {/* Hero — user's photo with glass treatment (Figma 1493:5) */}
        <div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onMouseDown={onMouseDown}
          onClick={() => { if (!isDragging) { setInfoVisible(v => !v); tapHaptic(); } }}
          style={{
            position: 'absolute', top: infoVisible ? 100 : 60, left: 25, right: 25,
            height: infoVisible ? 180 : 340,
            borderRadius: 14, overflow: 'hidden',
            backgroundColor: '#080809',
            boxShadow: '0px 2px 8px rgba(0,0,0,0.5), 0px 1px 0px rgba(255,255,255,0.04)',
            cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            transition: isDragging ? 'none' : 'height 0.35s cubic-bezier(0.4, 0, 0.2, 1), top 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
            touchAction: 'none',
          }}
        >
          {imagePreview && (
            <img src={imagePreview} alt="Result" style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              objectFit: 'cover', objectPosition: 'center 30%',
              opacity: infoVisible ? 0.8 : 1,
              transition: 'opacity 0.35s ease',
            }} />
          )}
          {/* Bottom vignette — fades photo into dark bg */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(to bottom, transparent 35%, rgba(9,9,11,0.55) 72%, rgba(9,9,11,0.88) 100%)',
            opacity: infoVisible ? 1 : 0.3,
            transition: 'opacity 0.35s ease',
          }} />
          {/* Glass panel — lens vignette + upper-left key light reflection (matches HomeScreen) */}
          <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', borderRadius: 14, zIndex: 2, pointerEvents: 'none' }}>
            <div style={{ position: 'absolute', inset: 0, background: LENS_VIGNETTE }} />
            <div style={{ position: 'absolute', top: 0, left: 0, right: '5%', bottom: 0, background: GLASS_REFLECTION, opacity: 0.48 }} />
          </div>
          {/* Inner shadow — Figma-exact bevel (matches HomeScreen) */}
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 14,
            pointerEvents: 'none', zIndex: 3,
            boxShadow: VIEWFINDER_INNER_SHADOW,
          }} />
        </div>

        {/* ── Info overlay — drag to dismiss, drag up to restore ── */}
        <div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onMouseDown={onMouseDown}
          style={{
            position: 'absolute', top: 290, left: 0, right: 0,
            transform: infoVisible
              ? `translateY(${isDragging ? dragOffset : 0}px)`
              : `translateY(${isDragging ? 120 + dragOffset : 120}px)`,
            opacity: infoVisible
              ? Math.max(0, 1 - dragOffset / 120)
              : Math.min(1, Math.abs(dragOffset) / 80),
            transition: isDragging ? 'none' : 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease',
            pointerEvents: infoVisible ? 'auto' : 'none',
            touchAction: 'none',
          }}
        >
          {/* Pattern name */}
          <p style={{
            position: 'absolute', top: 6, left: 25, margin: 0,
            fontWeight: 800, fontSize: 26, lineHeight: '32px',
            color: C.textPrimary,
            letterSpacing: '-0.3px',
            WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', textRendering: 'geometricPrecision',
            textShadow: '0 0 1px rgba(245,247,250,0.15)',
          }}>{pattern}</p>

          {/* Confidence % */}
          <p style={{
            position: 'absolute', top: 4, right: 25, margin: 0,
            fontWeight: 800, fontSize: 28, lineHeight: '34px',
            color: confColor,
            WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', textRendering: 'geometricPrecision',
            textShadow: `0 0 2px ${confColor}`,
          }}>{confidence}%</p>

          {/* Meta pills */}
          <div style={{
            position: 'absolute', top: 53, left: 25,
            display: 'flex', flexWrap: 'wrap', gap: 8,
            right: 25,
          }}>
            {meta.map(m => <Pill key={m} label={m} />)}
          </div>
        </div>

        {/* CTA Button — gradient bg + outer drop shadows + inset bevel (Figma 1494:12) */}
        <button
          onClick={() => { segmentPressSound(); tapHaptic(); (isHighConf ? onSetup : onRetry)(); }}
          style={{
            position: 'absolute', top: 391, left: 25, right: 25,
            height: 48,
            borderRadius: 24,
            background: CTA_BG,
            boxShadow: `${CTA_SHADOW}, ${CTA_BEVEL}`,
            border: 'none', cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
            overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: infoVisible ? 1 : 0,
            transform: infoVisible ? 'translateY(0)' : 'translateY(40px)',
            transition: isDragging ? 'none' : 'opacity 0.3s ease, transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
            pointerEvents: infoVisible ? 'auto' : 'none',
          }}
        >
          <span style={{
            fontSize: 13, fontWeight: 600,
            color: 'rgba(245,247,250,0.9)',
            letterSpacing: '0.5px',
            pointerEvents: 'none',
            WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', textRendering: 'geometricPrecision',
          }}>
            {isHighConf ? 'Set Up This Light' : 'Retake for Better Result'}
          </span>
        </button>

        {/* Low confidence: "Set up anyway →" */}
        {!isHighConf && (
          <button
            onClick={() => { softClickSound(); tapHaptic(); onSetup(); }}
            style={{
              position: 'absolute', top: 447, left: '50%', transform: `translateX(-50%)${infoVisible ? '' : ' translateY(40px)'}`,
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 500, color: C.textMeta,
              WebkitTapHighlightColor: 'transparent',
              WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', textRendering: 'geometricPrecision',
              opacity: infoVisible ? 1 : 0,
              transition: isDragging ? 'none' : 'opacity 0.3s ease, transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
              pointerEvents: infoVisible ? 'auto' : 'none',
            }}
          >Set up anyway →</button>
        )}

        {/* High confidence: scroll affordance */}
        {isHighConf && (
          <div style={{
            position: 'absolute', top: 455, left: '50%', transform: 'translateX(-50%)', width: 100, height: 0,
            opacity: infoVisible ? 1 : 0,
            transition: 'opacity 0.3s ease',
          }}>
            <div style={{ position: 'absolute', top: -1, left: 0, right: 0, bottom: 0 }}>
              <img src={scrollAffordance} alt="" style={{ display: 'block', width: '100%' }} />
            </div>
          </div>
        )}
      </div>
      {/* ─── end top section ─── */}

      {/* ─── Analytical Panel ─── */}
      <div style={{
        marginLeft: 25, marginRight: 25,
        borderRadius: 14,
        backgroundColor: C.panelBg,
        boxShadow: `${PANEL_SHADOW}, ${PANEL_BEVEL}`,
        overflow: 'hidden',
        position: 'relative',
        opacity: infoVisible ? 1 : 0,
        transform: infoVisible ? 'translateY(0)' : 'translateY(60px)',
        transition: isDragging ? 'none' : 'opacity 0.3s ease 0.05s, transform 0.4s cubic-bezier(0.4, 0, 0.2, 1) 0.05s',
        pointerEvents: infoVisible ? 'auto' : 'none',
      }}>
        {/* Inner highlight */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 14,
          pointerEvents: 'none',
          boxShadow: PANEL_BEVEL,
          zIndex: 10,
        }} />

        {/* Row 1 — PATTERN CANDIDATES */}
        <button
          onClick={() => toggle('patterns')}
          style={{
            width: '100%', backgroundColor: 'transparent', border: 'none', cursor: 'pointer',
            textAlign: 'left', WebkitTapHighlightColor: 'transparent',
          }}
        >
          <div style={{ padding: '14px 20px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p style={{ margin: 0, fontSize: 10, fontWeight: 600, color: steel(0.65), letterSpacing: '1px', WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', textRendering: 'geometricPrecision' }}>
                PATTERN CANDIDATES
              </p>
              {expandedSection !== 'patterns' && (
                <p style={{ margin: '6px 0 0', fontSize: 13, fontWeight: 500, color: C.textSub, WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', textRendering: 'geometricPrecision' }}>
                  {summaries.patterns}
                </p>
              )}
            </div>
            <span style={{
              fontSize: 14, fontWeight: 600, marginLeft: 12, flexShrink: 0,
              marginTop: expandedSection === 'patterns' ? 0 : 5,
              display: 'inline-block',
              transform: expandedSection === 'patterns' ? 'rotate(90deg)' : 'none',
              transition: 'transform 0.2s ease',
              ...METALLIC_CHEVRON,
            }}>›</span>
          </div>
        </button>

        {expandedSection === 'patterns' && (
          <PatternBars candidates={sections.patternCandidates} isHighConf={isHighConf} />
        )}

        {/* Divider 1 */}
        <div style={{ height: 1, backgroundColor: C.divider, marginLeft: 20 }} />

        {/* Row 2 — SHADOW ANALYSIS */}
        <button
          onClick={() => toggle('shadow')}
          style={{
            width: '100%', backgroundColor: 'transparent', border: 'none', cursor: 'pointer',
            textAlign: 'left', WebkitTapHighlightColor: 'transparent',
          }}
        >
          <div style={{ padding: '14px 20px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, marginRight: 12 }}>
              <p style={{ margin: 0, fontSize: 10, fontWeight: 600, color: steel(0.65), letterSpacing: '1px', WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', textRendering: 'geometricPrecision' }}>
                SHADOW ANALYSIS
              </p>
              <p style={{ margin: '6px 0 0', fontSize: 13, fontWeight: 500, color: C.textSub, WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', textRendering: 'geometricPrecision' }}>
                {expandedSection === 'shadow' ? sections.shadowAnalysis : summaries.shadow}
              </p>
            </div>
            <span style={{
              fontSize: 14, fontWeight: 600, flexShrink: 0,
              marginTop: 4,
              display: 'inline-block',
              transform: expandedSection === 'shadow' ? 'rotate(90deg)' : 'none',
              transition: 'transform 0.2s ease',
              ...METALLIC_CHEVRON,
            }}>›</span>
          </div>
        </button>

        {/* Divider 2 */}
        <div style={{ height: 1, backgroundColor: C.divider, marginLeft: 20 }} />

        {/* Row 3 — CATCHLIGHT & MODIFIER */}
        <button
          onClick={() => toggle('catchlight')}
          style={{
            width: '100%', backgroundColor: 'transparent', border: 'none', cursor: 'pointer',
            textAlign: 'left', WebkitTapHighlightColor: 'transparent',
          }}
        >
          <div style={{ padding: '14px 20px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, marginRight: 12 }}>
              <p style={{ margin: 0, fontSize: 10, fontWeight: 600, color: steel(0.65), letterSpacing: '1px', WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', textRendering: 'geometricPrecision' }}>
                CATCHLIGHT & MODIFIER
              </p>
              <p style={{ margin: '6px 0 0', fontSize: 13, fontWeight: 500, color: C.textSub, WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', textRendering: 'geometricPrecision' }}>
                {expandedSection === 'catchlight' ? sections.catchlightModifier : summaries.catchlight}
              </p>
            </div>
            <span style={{
              fontSize: 14, fontWeight: 600, flexShrink: 0,
              marginTop: 4,
              display: 'inline-block',
              transform: expandedSection === 'catchlight' ? 'rotate(90deg)' : 'none',
              transition: 'transform 0.2s ease',
              ...METALLIC_CHEVRON,
            }}>›</span>
          </div>
        </button>
      </div>

      {/* ─── Bottom row: segmented pill — Retake | Save (high confidence only) ─── */}
      {isHighConf && (
        <div style={{
          display: 'flex', justifyContent: 'center',
          padding: '16px 25px 20px',
          opacity: infoVisible ? 1 : 0,
          transform: infoVisible ? 'translateY(0)' : 'translateY(40px)',
          transition: isDragging ? 'none' : 'opacity 0.25s ease 0.1s, transform 0.35s cubic-bezier(0.4, 0, 0.2, 1) 0.1s',
          pointerEvents: infoVisible ? 'auto' : 'none',
        }}>
          {/* Pill track — dark inset trough */}
          <div style={{
            display: 'flex', alignItems: 'center',
            height: 44, borderRadius: 12,
            backgroundColor: '#0a0a0e',
            boxShadow: [
              'inset 1px 2px 4px 0px rgba(0,0,0,0.5)',
              'inset 0px 1px 2px 0px rgba(0,0,0,0.3)',
              'inset -1px -1px 0px 0px rgba(255,255,255,0.03)',
              '0px 0.5px 0px 0px rgba(255,255,255,0.02)',
            ].join(', '),
            padding: 3,
            gap: 1,
          }}>
            {/* RETAKE — flush/recessed segment */}
            <button
              onClick={() => { segmentPressSound(); navHaptic(); onRetry(); }}
              style={{
                height: 38, paddingLeft: 28, paddingRight: 28,
                borderRadius: 10,
                backgroundColor: 'transparent',
                border: 'none', cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <span style={{
                fontSize: 13, fontWeight: 500, letterSpacing: '0.3px',
                color: 'rgba(167,173,183,0.7)',
                WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', textRendering: 'geometricPrecision',
              }}>Retake</span>
            </button>

            {/* Subtle divider */}
            <div style={{ width: 1, height: 20, backgroundColor: 'rgba(255,255,255,0.06)', flexShrink: 0 }} />

            {/* SAVE — raised/active segment */}
            <button
              onClick={() => { segmentPressSound(); tapHaptic(); onSetup(); }}
              style={{
                height: 38, paddingLeft: 32, paddingRight: 32,
                borderRadius: 10,
                backgroundColor: '#1a1b20',
                boxShadow: [
                  '0px 1px 3px 0px rgba(0,0,0,0.4)',
                  '0px 0.5px 1px 0px rgba(0,0,0,0.3)',
                  'inset 0px 1px 0px 0px rgba(255,255,255,0.06)',
                  'inset 0px -0.5px 0px 0px rgba(0,0,0,0.2)',
                ].join(', '),
                border: 'none', cursor: 'pointer',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <span style={{
                fontSize: 13, fontWeight: 600, letterSpacing: '0.3px',
                color: 'rgba(245,247,250,0.9)',
                WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale', textRendering: 'geometricPrecision',
              }}>Save</span>
            </button>
          </div>
        </div>
      )}

      {/* ─── Low confidence: spacer ─── */}
      {!isHighConf && <div style={{ height: 40 }} />}

      {/* ─── Home Indicator — pinned to viewport bottom ─── */}
      <div style={{
        position: 'fixed', bottom: 8, left: '50%', transform: 'translateX(-50%)',
        width: 134, height: 5, borderRadius: 3,
        backgroundColor: 'rgba(89,94,107,0.55)',
        boxShadow: [
          'inset 0px 1px 1px 0px rgba(255,255,255,0.12)',
          'inset 0px -0.5px 0.5px 0px rgba(0,0,0,0.2)',
          '0px 0.5px 0px 0px rgba(255,255,255,0.03)',
          '0px -0.5px 1px 0px rgba(0,0,0,0.25)',
        ].join(', '),
        zIndex: 50,
      }} />

    </div>
    </div>
  );
}
