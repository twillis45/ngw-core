/**
 * ClientBriefScreen — Upload 3-5 mood board images, get common thread synthesis.
 *
 * Studio-tier feature. Uses POST /api/brief/analyze (already built).
 * Shows: individual results + synthesis (common pattern, modifier, position, recommendation).
 */
import { useState, useRef } from 'react';
import { C, steel, SCREEN_BG, MACHINED_SHADOW, KEY_ACCENT, FONT_SMOOTH } from '../../../theme/studioMatte';
import MatteBackground from '../_shared/MatteBackground';
import { authHeaders } from '../../../data/authApi';

const MAX_IMAGES = 5;
const MIN_IMAGES = 2;

function confidenceColor(c) {
  if (c >= 0.75) return C.confHigh;
  if (c >= 0.5) return C.confLow;
  return steel(0.5);
}

export default function ClientBriefScreen({ onBack }) {
  const [files, setFiles] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  const handleFiles = (e) => {
    const selected = Array.from(e.target.files || []).slice(0, MAX_IMAGES);
    setFiles(selected);
    setPreviews(selected.map(f => URL.createObjectURL(f)));
    setResult(null);
    setError(null);
  };

  const handleAnalyze = async () => {
    if (files.length < MIN_IMAGES) return;
    setAnalyzing(true);
    setError(null);
    setProgress(`Analyzing ${files.length} images…`);

    try {
      const form = new FormData();
      files.forEach(f => form.append('images', f));

      const res = await fetch('/api/brief/analyze', {
        method: 'POST',
        headers: { ...authHeaders() },
        body: form,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || `Analysis failed (${res.status})`);
      }

      const data = await res.json();
      setResult(data);
      setProgress('');
    } catch (err) {
      setError(err.message);
      setProgress('');
    } finally {
      setAnalyzing(false);
    }
  };

  const synthesis = result?.synthesis;
  const individual = result?.individual_results || [];

  return (
    <div style={{ background: SCREEN_BG, minHeight: '100vh', position: 'relative' }}>
      <MatteBackground />
      <div style={{ position: 'relative', zIndex: 1, padding: '20px 16px', maxWidth: 720, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          {onBack && (
            <button onClick={onBack} style={{ background: 'none', border: 'none', color: steel(0.5), cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              {'<'} Back
            </button>
          )}
          <h1 style={{ fontSize: 18, fontWeight: 800, color: C.textPrimary, letterSpacing: '-0.02em', margin: 0 }}>
            Client Brief
          </h1>
        </div>

        {/* Description */}
        <p style={{ margin: '0 0 16px', fontSize: 14, color: steel(0.45), lineHeight: 1.5, ...FONT_SMOOTH }}>
          Upload 2–5 mood board images from a client brief. We'll analyze each one and find the common lighting thread — so you can build one setup that covers all of them.
        </p>

        {/* File picker */}
        <div style={{
          padding: 20, borderRadius: 14, textAlign: 'center',
          background: `linear-gradient(141.71deg, ${C.panelBg} 0%, ${C.slotBg} 100%)`,
          boxShadow: MACHINED_SHADOW,
          border: `1px dashed ${steel(0.12)}`,
          cursor: 'pointer',
          marginBottom: 16,
        }} onClick={() => inputRef.current?.click()}>
          <input ref={inputRef} type="file" accept="image/*" multiple onChange={handleFiles} style={{ display: 'none' }} />
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: steel(0.5), ...FONT_SMOOTH }}>
            {files.length > 0 ? `${files.length} image${files.length > 1 ? 's' : ''} selected` : 'Tap to select images'}
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: steel(0.3), ...FONT_SMOOTH }}>
            JPG or PNG · 2–5 images · 20 MB max each
          </p>
        </div>

        {/* Thumbnails */}
        {previews.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto' }}>
            {previews.map((p, i) => (
              <img key={i} src={p} alt="" style={{
                width: 72, height: 72, objectFit: 'cover', borderRadius: 8,
                border: `1px solid ${steel(0.10)}`,
              }} />
            ))}
          </div>
        )}

        {/* Analyze button */}
        {files.length >= MIN_IMAGES && !result && (
          <button
            onClick={handleAnalyze}
            disabled={analyzing}
            style={{
              width: '100%', padding: '12px 20px', borderRadius: 10, border: 'none',
              fontSize: 14, fontWeight: 700, cursor: analyzing ? 'wait' : 'pointer',
              background: `linear-gradient(141.71deg, ${C.ctaFrom} 0%, ${C.ctaMid} 50%, ${C.ctaTo} 100%)`,
              color: steel(0.8),
              boxShadow: `4px 4px 12px rgba(0,0,0,0.5), 0 0 0 0.5px ${steel(0.2)}`,
              opacity: analyzing ? 0.6 : 1,
              marginBottom: 16,
              ...FONT_SMOOTH,
            }}
          >
            {analyzing ? progress || 'Analyzing…' : `Analyze ${files.length} Images`}
          </button>
        )}

        {/* Error */}
        {error && (
          <div style={{
            padding: '12px 16px', borderRadius: 10, marginBottom: 16,
            background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)',
            color: '#f87171', fontSize: 13, ...FONT_SMOOTH,
          }}>{error}</div>
        )}

        {/* ── RESULTS ── */}
        {synthesis && (
          <>
            {/* Synthesis card — the common thread */}
            <div style={{
              padding: 20, borderRadius: 14, marginBottom: 20,
              background: `linear-gradient(141.71deg, ${C.panelBg} 0%, ${C.slotBg} 100%)`,
              boxShadow: MACHINED_SHADOW,
              border: `1px solid rgba(72,186,136,0.12)`,
            }}>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: '1.2px', color: steel(0.5), textTransform: 'uppercase', ...FONT_SMOOTH }}>
                COMMON THREAD
              </p>
              <p style={{
                margin: '8px 0 0', fontSize: 22, fontWeight: 800, letterSpacing: '-0.3px',
                color: C.textPrimary, ...FONT_SMOOTH,
                textTransform: 'capitalize',
              }}>
                {(synthesis.common_pattern || 'Mixed').replace(/_/g, ' ')}
              </p>

              {/* Consensus strength badge */}
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 8,
                padding: '4px 10px', borderRadius: 6,
                background: synthesis.consensus_strength === 'strong' ? 'rgba(72,186,136,0.12)'
                  : synthesis.consensus_strength === 'moderate' ? 'rgba(245,190,72,0.12)'
                  : 'rgba(248,113,113,0.12)',
              }}>
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  color: synthesis.consensus_strength === 'strong' ? C.confHigh
                    : synthesis.consensus_strength === 'moderate' ? C.confLow
                    : '#f87171',
                }}>
                  {synthesis.consensus_strength?.toUpperCase()} CONSENSUS
                </span>
                <span style={{ fontSize: 11, color: steel(0.4) }}>
                  {Math.round((synthesis.pattern_agreement || 0) * 100)}% agreement
                </span>
              </div>

              {/* Details */}
              <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {synthesis.common_modifier && (
                  <div>
                    <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: steel(0.4), letterSpacing: '0.8px', ...FONT_SMOOTH }}>MODIFIER</p>
                    <p style={{ margin: '2px 0 0', fontSize: 14, fontWeight: 600, color: C.textPrimary, textTransform: 'capitalize', ...FONT_SMOOTH }}>
                      {(synthesis.common_modifier || '').replace(/_/g, ' ')}
                    </p>
                  </div>
                )}
                {synthesis.key_position && (
                  <div>
                    <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: steel(0.4), letterSpacing: '0.8px', ...FONT_SMOOTH }}>KEY POSITION</p>
                    <p style={{ margin: '2px 0 0', fontSize: 14, fontWeight: 600, color: C.textPrimary, textTransform: 'capitalize', ...FONT_SMOOTH }}>
                      {synthesis.key_position}
                    </p>
                  </div>
                )}
              </div>

              {/* Recommendation */}
              {synthesis.recommendation && (
                <p style={{
                  margin: '14px 0 0', fontSize: 14, fontWeight: 500, color: steel(0.55),
                  lineHeight: 1.5, ...FONT_SMOOTH,
                  borderTop: `1px solid ${steel(0.08)}`, paddingTop: 12,
                }}>
                  {synthesis.recommendation}
                </p>
              )}
            </div>

            {/* Individual results */}
            <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, letterSpacing: '1px', color: steel(0.4), textTransform: 'uppercase', ...FONT_SMOOTH }}>
              INDIVIDUAL ANALYSES
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {individual.map((r, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                  borderRadius: 10,
                  background: `linear-gradient(141.71deg, ${C.panelBg} 0%, ${C.slotBg} 100%)`,
                  boxShadow: '3px 3px 8px rgba(0,0,0,0.4)',
                }}>
                  {previews[i] && (
                    <img src={previews[i]} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6 }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{
                      margin: 0, fontSize: 14, fontWeight: 700, color: C.textPrimary,
                      textTransform: 'capitalize', ...FONT_SMOOTH,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {r.status === 'ok' ? (r.pattern || 'unknown').replace(/_/g, ' ') : 'Error'}
                    </p>
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: steel(0.4), ...FONT_SMOOTH }}>
                      {r.filename}
                    </p>
                  </div>
                  {r.status === 'ok' && r.confidence != null && (
                    <span style={{
                      fontSize: 12, fontWeight: 700,
                      color: confidenceColor(r.confidence),
                      ...FONT_SMOOTH,
                    }}>
                      {Math.round(r.confidence * 100)}%
                    </span>
                  )}
                  {r.status === 'error' && (
                    <span style={{ fontSize: 11, color: '#f87171', ...FONT_SMOOTH }}>Failed</span>
                  )}
                </div>
              ))}
            </div>

            {/* Reset */}
            <button
              onClick={() => { setResult(null); setFiles([]); setPreviews([]); }}
              style={{
                marginTop: 20, width: '100%', padding: '10px 16px', borderRadius: 8,
                border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                background: C.slotBg, color: steel(0.5),
                boxShadow: 'inset 1px 1px 3px rgba(0,0,0,0.4)',
                ...FONT_SMOOTH,
              }}
            >
              Start New Brief
            </button>
          </>
        )}
      </div>
    </div>
  );
}
