import { useState, useRef } from 'react';
import { uploadReferenceImage } from '../api';

function comparePalettes(testPalette, refPalette) {
  if (!testPalette?.length || !refPalette?.length) return null;
  // Simple hue-distance comparison between dominant colors
  const testHexes = testPalette.slice(0, 4).map(c => c.hex);
  const refHexes = refPalette.slice(0, 4).map(c => c.hex);
  let matches = 0;
  for (const th of testHexes) {
    for (const rh of refHexes) {
      if (hexDistance(th, rh) < 80) { matches++; break; }
    }
  }
  return Math.round((matches / testHexes.length) * 100);
}

function hexDistance(a, b) {
  const pa = hexToRgb(a);
  const pb = hexToRgb(b);
  if (!pa || !pb) return 999;
  return Math.sqrt((pa.r - pb.r) ** 2 + (pa.g - pb.g) ** 2 + (pa.b - pb.b) ** 2);
}

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
}

export default function TestShotCard({ setupName, refAnalysis }) {
  const [preview, setPreview] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => setPreview(ev.target.result);
    reader.readAsDataURL(file);

    setLoading(true);
    setError(null);
    try {
      const result = await uploadReferenceImage(file);
      setAnalysis(result.analysis);
    } catch {
      setError('Could not analyze image');
    }
    setLoading(false);
  }

  function handleClear() {
    setPreview(null);
    setAnalysis(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  const testPalette = analysis?.palette?.overall || [];
  const refPalette = refAnalysis?.palette?.overall || [];
  const paletteMatch = comparePalettes(testPalette, refPalette);

  const checks = [];
  if (analysis) {
    if (analysis.isGrayscale) {
      checks.push({ ok: true, text: 'Image is desaturated / B&W' });
    }
    if (analysis.orientation) {
      checks.push({ ok: true, text: `Orientation: ${analysis.orientation}` });
    }
    if (paletteMatch != null) {
      checks.push({
        ok: paletteMatch >= 50,
        text: paletteMatch >= 75
          ? `Color palette is a strong match (${paletteMatch}%)`
          : paletteMatch >= 50
            ? `Color palette is a partial match (${paletteMatch}%)`
            : `Color palette differs from reference (${paletteMatch}% match)`,
      });
    }
  }

  return (
    <div className="result-card">
      <div className="result-card__header">
        <span className="result-card__icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        </span>
        <span>Check Your Shot</span>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFile}
        style={{ display: 'none' }}
      />

      {!preview ? (
        <button
          className="btn btn--ghost"
          onClick={() => inputRef.current?.click()}
          style={{ width: '100%', marginTop: 'var(--space-sm)' }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8 }}>
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Upload a test shot from your camera
        </button>
      ) : (
        <>
          <div style={{
            borderRadius: 'var(--radius-sm)',
            overflow: 'hidden',
            background: 'var(--color-bg)',
            marginTop: 'var(--space-sm)',
          }}>
            <img
              src={preview}
              alt="Test shot"
              style={{ width: '100%', display: 'block', borderRadius: 'var(--radius-sm)', maxHeight: 280, objectFit: 'cover' }}
            />
          </div>

          {loading && (
            <p style={{ color: 'var(--text-dim)', fontSize: 'var(--text-sm)', marginTop: 'var(--space-sm)' }}>
              Analyzing your test shot...
            </p>
          )}

          {error && (
            <p style={{ color: 'var(--color-danger, #ef4444)', fontSize: 'var(--text-sm)', marginTop: 'var(--space-sm)' }}>
              {error}
            </p>
          )}

          {checks.length > 0 && (
            <div className="test-shot-checks" style={{ marginTop: 'var(--space-sm)' }}>
              {checks.map((c, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 0',
                  fontSize: 'var(--text-sm)',
                  color: c.ok ? 'var(--color-success, #22c55e)' : 'var(--color-warning, #f59e0b)',
                }}>
                  <span>{c.ok ? '\u2713' : '\u26A0'}</span>
                  <span style={{ color: 'var(--color-text)' }}>{c.text}</span>
                </div>
              ))}
            </div>
          )}

          {testPalette.length > 0 && (
            <div style={{ marginTop: 'var(--space-sm)' }}>
              <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-dim)', marginBottom: 6 }}>
                Test Shot Palette
              </div>
              <div className="ref-palette">
                {testPalette.slice(0, 6).map((c, i) => (
                  <div className="ref-palette__swatch" key={i}>
                    <div
                      className="ref-palette__color"
                      style={{ background: c.hex }}
                      title={`${c.name} (${c.hex})`}
                    />
                    <span className="ref-palette__name">{c.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            className="btn btn--ghost btn--sm"
            onClick={handleClear}
            style={{ marginTop: 'var(--space-sm)' }}
          >
            Upload a different shot
          </button>
        </>
      )}

      <p style={{
        fontSize: 'var(--text-sm)',
        color: 'var(--text-dim)',
        marginTop: 'var(--space-sm)',
        lineHeight: 1.4,
      }}>
        Upload a test shot to compare against {setupName ? `your ${setupName} setup` : 'this setup'}.
      </p>
    </div>
  );
}
