/**
 * SetupScreen — Studio Matte design
 * Save a lighting setup after analysis.
 * Flow: Result → SetupScreen → Home (on save) or Result (on cancel)
 */
import { useState, useRef, useCallback } from 'react';
import { tapHaptic, successHaptic, navHaptic } from '../utils/haptics';
import { softClickSound, navSlideSound } from '../utils/sounds';

// ─── Studio Matte Token Palette (mirrors ResultScreen) ───────────────────────
const steel = (a) => `rgba(95,124,150,${a})`;

const C = {
  bg:          '#000001',
  slotBg:      '#08080a',
  panelBg:     '#0f1013',
  fieldBg:     '#0a0b0d',
  ctaFrom:     '#3d404d',
  ctaMid:      '#292b36',
  ctaTo:       '#1c1d24',
  textPrimary: 'rgba(245,247,250,0.95)',
  textSub:     'rgba(184,191,199,0.65)',
  textMeta:    '#a7adb7',
  textDim:     'rgba(184,191,199,0.5)',
  confHigh:    'rgba(72,186,136,0.95)',
  confLow:     'rgba(245,190,72,0.9)',
  divider:     'rgba(255,255,255,0.04)',
};

const CTA_BG     = `linear-gradient(141.71deg, ${C.ctaFrom} 0%, ${C.ctaMid} 50%, ${C.ctaTo} 100%)`;
const CTA_SHADOW = `0px 0px 6px 1px ${steel(0.08)}, 1px 2px 4px 0px rgba(0,0,0,0.45), 2px 5px 12px 0px rgba(0,0,0,0.7)`;
const CTA_BEVEL  = 'inset -1px -1px 2px 0px rgba(0,0,0,0.3), inset 1px 1px 0px 0px rgba(255,255,255,0.2)';

const PANEL_SHADOW = '1px 2px 4px 0px rgba(0,0,0,0.2), 2px 4px 12px 0px rgba(0,0,0,0.4)';
const PANEL_BEVEL  = 'inset -1px -1px 2px 0px rgba(0,0,0,0.12), inset 1px 1px 0px 0px rgba(255,255,255,0.05)';

// Inset field — recessed into surface
const FIELD_SHADOW = 'inset 0px 1px 3px 0px rgba(0,0,0,0.6), inset 0px 0px 8px 0px rgba(0,0,0,0.3), inset 1px 1px 2px 0px rgba(0,0,0,0.4)';
const FIELD_SHADOW_FOCUS = `inset 0px 1px 3px 0px rgba(0,0,0,0.6), inset 0px 0px 8px 0px rgba(0,0,0,0.3), inset 1px 1px 2px 0px rgba(0,0,0,0.4), 0px 0px 0px 1px ${steel(0.35)}`;

const FONT_SMOOTH = {
  WebkitFontSmoothing: 'antialiased',
  MozOsxFontSmoothing: 'grayscale',
  textRendering: 'geometricPrecision',
};

// ─── Row label used inside panels ────────────────────────────────────────────
function RowLabel({ children }) {
  return (
    <p style={{ margin: 0, fontSize: 10, fontWeight: 600, color: steel(0.65), letterSpacing: '1px', ...FONT_SMOOTH }}>
      {children}
    </p>
  );
}

// ─── Inset text field ─────────────────────────────────────────────────────────
function InsetField({ label, value, onChange, placeholder, multiline }) {
  const [focused, setFocused] = useState(false);
  const Tag = multiline ? 'textarea' : 'input';

  return (
    <div style={{ marginBottom: 20 }}>
      <RowLabel>{label}</RowLabel>
      <Tag
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={multiline ? 3 : undefined}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          display: 'block',
          width: '100%',
          marginTop: 8,
          padding: '12px 14px',
          backgroundColor: C.fieldBg,
          border: 'none',
          borderRadius: 10,
          boxShadow: focused ? FIELD_SHADOW_FOCUS : FIELD_SHADOW,
          color: C.textPrimary,
          fontSize: 14,
          fontWeight: 500,
          fontFamily: 'inherit',
          resize: multiline ? 'none' : undefined,
          outline: 'none',
          boxSizing: 'border-box',
          transition: 'box-shadow 0.18s ease',
          ...FONT_SMOOTH,
        }}
      />
    </div>
  );
}

function ModRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <span style={{ fontSize: 10, fontWeight: 600, color: steel(0.5), letterSpacing: '0.8px', ...FONT_SMOOTH }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 500, color: C.textSub, textAlign: 'right', maxWidth: '60%', ...FONT_SMOOTH }}>{value}</span>
    </div>
  );
}

export default function SetupScreen({ result, imagePreview, onSave, onCancel }) {
  const [setupName, setSetupName] = useState('');
  const [notes, setNotes] = useState('');
  const [savePressed, setSavePressed] = useState(false);

  const isHighConf = result && result.confidence >= 70;
  const confColor  = isHighConf ? C.confHigh : C.confLow;
  const defaultName = result?.pattern ? `${result.pattern} Setup` : 'Untitled Setup';

  const handleSave = useCallback(() => {
    softClickSound();
    successHaptic();
    onSave({
      name: setupName.trim() || defaultName,
      notes,
      timestamp: new Date().toISOString(),
      pattern: result?.pattern,
      confidence: result?.confidence,
      modifier: result?.sections?.catchlightModifier,
    });
  }, [setupName, notes, defaultName, result, onSave]);

  const handleCancel = useCallback(() => {
    navHaptic();
    navSlideSound();
    onCancel();
  }, [onCancel]);

  return (
    <div style={{
      minHeight: '100dvh',
      backgroundColor: C.bg,
      display: 'flex',
      flexDirection: 'column',
      overflowY: 'auto',
    }}>

      {/* ─── Nav bar ─── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '56px 20px 0',
        gap: 12,
      }}>
        <button
          onClick={handleCancel}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: 0, display: 'flex', alignItems: 'center',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <span style={{
            fontSize: 22, color: C.textMeta, lineHeight: 1,
            ...FONT_SMOOTH,
          }}>‹</span>
        </button>
        <p style={{
          margin: 0, fontSize: 10, fontWeight: 600,
          color: steel(0.65), letterSpacing: '1.2px',
          ...FONT_SMOOTH,
        }}>SAVE SETUP</p>
      </div>

      {/* ─── Content ─── */}
      <div style={{ padding: '20px 25px 40px', flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Result summary panel */}
        {result && (
          <div style={{
            borderRadius: 14,
            backgroundColor: C.panelBg,
            boxShadow: `${PANEL_SHADOW}, ${PANEL_BEVEL}`,
            overflow: 'hidden',
            position: 'relative',
          }}>
            {/* Panel inner highlight */}
            <div style={{
              position: 'absolute', inset: 0, borderRadius: 14,
              pointerEvents: 'none', boxShadow: PANEL_BEVEL, zIndex: 10,
            }} />

            {/* Thumbnail + headline */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '16px 20px', gap: 16 }}>
              {imagePreview && (
                <div style={{
                  width: 56, height: 56, borderRadius: 8, flexShrink: 0,
                  overflow: 'hidden',
                  boxShadow: '0px 2px 6px rgba(0,0,0,0.5)',
                }}>
                  <img src={imagePreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: C.textPrimary, lineHeight: 1.1, ...FONT_SMOOTH }}>
                  {result.pattern}
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 13, fontWeight: 600, color: confColor, ...FONT_SMOOTH }}>
                  {result.confidence}%
                </p>
              </div>
            </div>

            {/* Divider */}
            <div style={{ height: 1, backgroundColor: C.divider, marginLeft: 20 }} />

            {/* Meta row */}
            {result.meta && result.meta.length > 0 && (
              <div style={{
                padding: '12px 20px',
                display: 'flex', gap: 6, flexWrap: 'wrap',
              }}>
                {result.meta.map((m, i) => (
                  <span key={i} style={{
                    fontSize: 10, fontWeight: 600, color: C.textMeta,
                    backgroundColor: '#070709',
                    padding: '4px 8px',
                    borderRadius: 5,
                    boxShadow: 'inset 1px 1px 2px 0px rgba(0,0,0,0.2), inset 1px 2px 4px 0px rgba(0,0,0,0.4)',
                    ...FONT_SMOOTH,
                  }}>{m}</span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Analysis details panel */}
        {result?.sections && (
          <div style={{
            borderRadius: 14,
            backgroundColor: C.panelBg,
            boxShadow: `${PANEL_SHADOW}, ${PANEL_BEVEL}`,
            overflow: 'hidden',
            position: 'relative',
          }}>
            <div style={{
              position: 'absolute', inset: 0, borderRadius: 14,
              pointerEvents: 'none', boxShadow: PANEL_BEVEL, zIndex: 10,
            }} />

            {/* Pattern candidates */}
            {result.sections.patternCandidates?.length > 0 && (
              <>
                <div style={{ padding: '14px 20px 12px' }}>
                  <RowLabel>PATTERN CANDIDATES</RowLabel>
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {result.sections.patternCandidates.map((c, i) => (
                      <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{
                          fontSize: 13, fontWeight: i === 0 ? 600 : 500,
                          color: i === 0 ? C.textPrimary : C.textSub,
                          width: 90, flexShrink: 0,
                          ...FONT_SMOOTH,
                        }}>{c.name}</span>
                        <div style={{
                          flex: 1, height: 3, borderRadius: 1.5,
                          backgroundColor: 'rgba(184,191,199,0.08)',
                          position: 'relative',
                        }}>
                          <div style={{
                            position: 'absolute', left: 0, top: 0, height: '100%',
                            width: `${c.score}%`, borderRadius: 1.5,
                            backgroundColor: i === 0
                              ? (isHighConf ? 'rgba(72,186,136,0.7)' : 'rgba(245,190,72,0.7)')
                              : 'rgba(184,191,199,0.2)',
                          }} />
                        </div>
                        <span style={{
                          fontSize: 12, fontWeight: 600, width: 32, textAlign: 'right',
                          color: i === 0 ? confColor : C.textDim,
                          ...FONT_SMOOTH,
                        }}>{c.score}%</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ height: 1, backgroundColor: C.divider, marginLeft: 20 }} />
              </>
            )}

            {/* Shadow analysis */}
            {result.sections.shadowAnalysis && (
              <>
                <div style={{ padding: '14px 20px 12px' }}>
                  <RowLabel>SHADOW ANALYSIS</RowLabel>
                  <p style={{
                    margin: '8px 0 0', fontSize: 13, fontWeight: 400,
                    color: C.textSub, lineHeight: 1.5,
                    ...FONT_SMOOTH,
                  }}>{result.sections.shadowAnalysis}</p>
                </div>
                <div style={{ height: 1, backgroundColor: C.divider, marginLeft: 20 }} />
              </>
            )}

            {/* Catchlight & modifier — structured */}
            {(result.sections.modifier || result.sections.catchlightModifier) && (
              <div style={{ padding: '14px 20px 14px' }}>
                <RowLabel>MODIFIER</RowLabel>
                {result.sections.modifier ? (
                  <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {/* Family + size */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: C.textPrimary, ...FONT_SMOOTH }}>
                        {result.sections.modifier.sizeLabel ? `${result.sections.modifier.sizeLabel} ` : ''}{result.sections.modifier.family}
                      </span>
                      {result.sections.modifier.sizeRange && (
                        <span style={{ fontSize: 11, fontWeight: 500, color: C.textMeta, ...FONT_SMOOTH }}>
                          {result.sections.modifier.sizeRange}
                        </span>
                      )}
                    </div>
                    {/* Key details grid */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {result.sections.modifier.position && (
                        <ModRow label="KEY POSITION" value={result.sections.modifier.position} />
                      )}
                      {result.sections.modifier.shape && result.sections.modifier.shape !== 'unclear' && (
                        <ModRow label="CATCHLIGHT SHAPE" value={result.sections.modifier.shape} />
                      )}
                      {result.sections.modifier.lightCount && (
                        <ModRow label="LIGHT COUNT" value={`${result.sections.modifier.lightCount} light${result.sections.modifier.lightCount !== 1 ? 's' : ''}`} />
                      )}
                      {result.sections.modifier.angularArea && (
                        <ModRow label="ANGULAR AREA" value={result.sections.modifier.angularArea} />
                      )}
                    </div>
                    {/* Distance guidance */}
                    {result.sections.modifier.distRange && (
                      <div style={{
                        marginTop: 12,
                        backgroundColor: '#070709',
                        borderRadius: 8,
                        padding: '10px 12px',
                        boxShadow: 'inset 0px 1px 3px rgba(0,0,0,0.5), inset 0px 0px 6px rgba(0,0,0,0.3)',
                      }}>
                        <RowLabel>WORKING DISTANCE</RowLabel>
                        <div style={{ marginTop: 8, display: 'flex', gap: 16 }}>
                          <div>
                            <p style={{ margin: 0, fontSize: 10, color: C.textDim, ...FONT_SMOOTH }}>RANGE</p>
                            <p style={{ margin: '3px 0 0', fontSize: 15, fontWeight: 700, color: C.textPrimary, ...FONT_SMOOTH }}>
                              {result.sections.modifier.distRange}
                            </p>
                          </div>
                          <div style={{ width: 1, backgroundColor: C.divider }} />
                          <div>
                            <p style={{ margin: 0, fontSize: 10, color: C.textDim, ...FONT_SMOOTH }}>OPTIMAL</p>
                            <p style={{ margin: '3px 0 0', fontSize: 15, fontWeight: 700, color: isHighConf ? C.confHigh : C.confLow, ...FONT_SMOOTH }}>
                              {result.sections.modifier.optDist}
                            </p>
                          </div>
                        </div>
                        <p style={{ margin: '8px 0 0', fontSize: 11, color: C.textDim, lineHeight: 1.5, ...FONT_SMOOTH }}>
                          Closer = softer, more wrapping. Farther = harder, more directional. Optimal range balances wrap with contrast for portrait work.
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p style={{ margin: '8px 0 0', fontSize: 13, fontWeight: 400, color: C.textSub, lineHeight: 1.5, ...FONT_SMOOTH }}>
                    {result.sections.catchlightModifier}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Form panel */}
        <div style={{
          borderRadius: 14,
          backgroundColor: C.panelBg,
          boxShadow: `${PANEL_SHADOW}, ${PANEL_BEVEL}`,
          padding: '20px 20px 4px',
          position: 'relative',
        }}>
          {/* Panel inner highlight */}
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 14,
            pointerEvents: 'none', boxShadow: PANEL_BEVEL, zIndex: 10,
          }} />
          <InsetField
            label="SETUP NAME"
            value={setupName}
            onChange={setSetupName}
            placeholder={defaultName}
          />
          <InsetField
            label="NOTES"
            value={notes}
            onChange={setNotes}
            placeholder="Any details about this setup…"
            multiline
          />
        </div>

        {/* Spacer to push CTA down */}
        <div style={{ flex: 1 }} />

        {/* Save CTA */}
        <button
          onClick={handleSave}
          onPointerDown={() => setSavePressed(true)}
          onPointerUp={() => setSavePressed(false)}
          onPointerLeave={() => setSavePressed(false)}
          style={{
            width: '100%', height: 52,
            borderRadius: 24,
            background: CTA_BG,
            boxShadow: savePressed
              ? 'inset 0px 2px 4px rgba(0,0,0,0.5)'
              : `${CTA_SHADOW}, ${CTA_BEVEL}`,
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            WebkitTapHighlightColor: 'transparent',
            transform: savePressed ? 'scale(0.98)' : 'scale(1)',
            transition: 'transform 0.1s ease, box-shadow 0.1s ease',
          }}
        >
          <span style={{
            fontSize: 13, fontWeight: 600,
            color: 'rgba(245,247,250,0.9)',
            letterSpacing: '0.5px',
            pointerEvents: 'none',
            ...FONT_SMOOTH,
          }}>Save Setup</span>
        </button>

        {/* Cancel link */}
        <button
          onClick={handleCancel}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 12, fontWeight: 500, color: C.textMeta,
            padding: '8px 0 0',
            display: 'block', width: '100%', textAlign: 'center',
            WebkitTapHighlightColor: 'transparent',
            ...FONT_SMOOTH,
          }}
        >Cancel</button>

      </div>

      {/* iOS home indicator */}
      <div style={{ height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 134, height: 5, borderRadius: 3, backgroundColor: 'rgba(245,247,250,0.06)' }} />
      </div>
    </div>
  );
}
