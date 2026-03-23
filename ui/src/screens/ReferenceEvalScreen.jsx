import { useState, useEffect, useRef } from 'react';
import { useAppState, useDispatch } from '../context/AppContext';
import { uploadReferenceImage } from '../api';
import { RECIPES } from '../data/recipes';
import DiagramCard from '../cards/DiagramCard';
import CollapsibleCard from '../cards/CollapsibleCard';
import ZoomOverlay from '../cards/ZoomOverlay';
import usePaywall from '../hooks/usePaywall';
import { trackEvent } from '../data/analytics';
import { getToken } from '../data/authApi';

// ── Pattern / mood option lists — fallback defaults (overridden by /api/config) ─

const DEFAULT_MOOD_OPTIONS = [
  { value: 'beauty',    label: 'Beauty' },
  { value: 'cinematic', label: 'Cinematic' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'editorial', label: 'Editorial' },
  { value: 'natural',   label: 'Natural' },
  { value: 'high_key',  label: 'High Key' },
  { value: 'low_key',   label: 'Low Key' },
];

const DEFAULT_PATTERN_OPTIONS = [
  'rembrandt', 'loop', 'butterfly', 'split', 'flat', 'broad',
  'short', 'rim_only', 'beauty_dish', 'high_key', 'low_key',
  'natural_window', 'dramatic_key', 'three_point',
];

const DEFAULT_ISSUE_TYPES = [
  { value: 'wrong_pattern',  label: 'Pattern identified incorrectly' },
  { value: 'wrong_mood',     label: 'Mood / style misidentified' },
  { value: 'no_face',        label: 'No face found / wrong subject' },
  { value: 'confidence_low', label: 'Confidence feels too high' },
  { value: 'other',          label: 'Something else is off' },
];

// ── Admin: submit ground truth ─────────────────────────────────────────────

async function submitGroundTruth({
  imagePath, expectedPattern, expectedMood, lightCount, notes,
}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const corrections = {};
  if (lightCount) corrections.light_count = parseInt(lightCount, 10);
  if (notes)      corrections.notes       = notes;
  const res = await fetch('/api/admin/image-labels', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      image_path: imagePath,
      expected_pattern: expectedPattern || null,
      expected_mood: expectedMood || null,
      corrections: Object.keys(corrections).length ? corrections : null,
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Server error (${res.status})`);
  }
  return res.json();
}

// ── Admin correction panel ─────────────────────────────────────────────────

function AdminCorrectionPanel({ analysis, imagePath, onNavigateLab, patternOptions = DEFAULT_PATTERN_OPTIONS, moodOptions = DEFAULT_MOOD_OPTIONS }) {
  const [open, setOpen]         = useState(false);
  const [pattern, setPattern]   = useState('');
  const [mood, setMood]         = useState('');
  const [lightCount, setLightCount] = useState('');
  const [notes, setNotes]       = useState('');
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [err, setErr]           = useState(null);

  const rs = analysis?.description?.referenceAnalysis?.recreation_setup;

  // Pre-fill fields with detected values when panel opens
  useEffect(() => {
    if (open) {
      setPattern(analysis?.classification?.lightingPattern || '');
      setMood(analysis?.classification?.mood || '');
      setLightCount(rs?.light_count != null ? String(rs.light_count) : '');
      setNotes('');
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave() {
    setSaving(true);
    setErr(null);
    try {
      await submitGroundTruth({
        imagePath,
        expectedPattern: pattern,
        expectedMood: mood,
        lightCount,
        notes,
      });
      setSaved(true);
      setOpen(false);
      trackEvent('admin_ground_truth_saved', { imagePath, pattern, mood });
      setTimeout(() => setSaved(false), 4000);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ref-correction ref-correction--admin">
      <div className="ref-correction__row">
        <span className="ref-correction__admin-badge">Admin</span>
        <button
          className="btn btn--ghost btn--sm"
          onClick={() => setOpen(v => !v)}
          type="button"
        >
          {open ? 'Cancel' : 'Correct This Analysis'}
        </button>
        <button
          className="btn btn--ghost btn--sm"
          onClick={onNavigateLab}
          type="button"
        >
          Open in Lab
        </button>
        {saved && (
          <span className="ref-correction__saved">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Ground truth saved
          </span>
        )}
      </div>

      {open && (
        <div className="ref-correction__form">
          <p className="ref-correction__form-intro">
            Override detected values. Pre-filled from current analysis — change only what's wrong.
          </p>

          {/* Pattern + Mood */}
          <div className="ref-correction__fields">
            <div className="ref-correction__field">
              <label className="ref-correction__label">Pattern</label>
              <select className="ref-correction__select" value={pattern} onChange={e => setPattern(e.target.value)}>
                <option value="">— as detected —</option>
                {patternOptions.map(p => (
                  <option key={p} value={p}>{p.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
            <div className="ref-correction__field">
              <label className="ref-correction__label">Mood</label>
              <select className="ref-correction__select" value={mood} onChange={e => setMood(e.target.value)}>
                <option value="">— as detected —</option>
                {moodOptions.map(m => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Light Count */}
          <div className="ref-correction__field" style={{ maxWidth: 140 }}>
            <label className="ref-correction__label">Light Count</label>
            <input
              type="number"
              className="ref-correction__select"
              min="1" max="8"
              placeholder="# of lights"
              value={lightCount}
              onChange={e => setLightCount(e.target.value)}
            />
          </div>

          <div className="ref-correction__field">
            <label className="ref-correction__label">Notes (optional)</label>
            <textarea
              className="ref-correction__textarea"
              rows={2}
              placeholder="What's wrong? What should the correct answer be?"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
          {err && <p className="ref-correction__error">{err}</p>}
          <button
            className="btn btn--primary btn--sm"
            onClick={handleSave}
            disabled={saving}
            style={{ alignSelf: 'flex-start' }}
          >
            {saving ? 'Saving…' : 'Save Ground Truth'}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Admin: all VLM data + narrative ────────────────────────────────────────

function AdminVLMPanel({ analysis }) {
  const [open, setOpen] = useState(false);
  const [rawOpen, setRawOpen] = useState(false);
  if (!analysis) return null;

  const cls = analysis.classification || {};
  const li  = analysis.lightingIntelligence || null;
  const pex = li?.perceptionExplanation || null;
  const candidates = analysis.patternCandidates || null;
  const refA = analysis.description?.referenceAnalysis || null;

  // Format 0–1 score as percentage string
  function pct(v) {
    if (v == null) return '—';
    const n = v > 1 ? v : v * 100;
    return `${Math.round(n)}%`;
  }

  const rowStyle = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: '5px 0', borderBottom: '1px solid var(--color-border-subtle)',
    gap: 8, fontSize: 'var(--text-xs)',
  };
  const labelStyle = { color: 'var(--color-text-dim)', flexShrink: 0, minWidth: 130 };
  const valueStyle = { color: 'var(--color-text)', textAlign: 'right', wordBreak: 'break-word' };

  function Section({ title, children }) {
    return (
      <div style={{ marginBottom: 'var(--space-sm)' }}>
        <div style={{
          fontSize: 'var(--text-xs)', fontWeight: 'var(--weight-semibold)',
          color: 'var(--color-accent)', textTransform: 'uppercase',
          letterSpacing: 'var(--tracking-widest)', marginBottom: 6, marginTop: 10,
        }}>{title}</div>
        {children}
      </div>
    );
  }

  function DataRow({ label, value }) {
    if (value == null || value === '' || value === 'unknown') return null;
    const display = Array.isArray(value) ? value.join(', ') : String(value);
    return (
      <div style={rowStyle}>
        <span style={labelStyle}>{label}</span>
        <span style={valueStyle}>{display}</span>
      </div>
    );
  }

  return (
    <div className="ref-correction ref-correction--admin" style={{ marginTop: 8 }}>
      <div className="ref-correction__row">
        <span className="ref-correction__admin-badge">Admin</span>
        <button
          className="btn btn--ghost btn--sm"
          onClick={() => setOpen(v => !v)}
          type="button"
        >
          {open ? 'Hide VLM Data' : 'VLM Data ↓'}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 'var(--space-sm)', fontSize: 'var(--text-xs)' }}>

          {/* ── Classification scores ── */}
          <Section title="Classification">
            <DataRow label="Pattern"         value={cls.lightingPattern} />
            <DataRow label="Reliability"     value={pct(cls.reliabilityScore ?? cls.confidence)} />
            <DataRow label="Confidence raw"  value={cls.confidence != null ? String(cls.confidence) : null} />
            <DataRow label="Pattern source"  value={cls.patternSource} />
            <DataRow label="Mood detected"   value={cls.mood} />
            <DataRow label="Light count"     value={cls.lightCount != null ? String(cls.lightCount) : null} />
            <DataRow label="Color temp"      value={cls.colorTemperature} />
            <DataRow label="CCT (K)"         value={cls.colorTemperatureKelvin != null ? `${cls.colorTemperatureKelvin} K` : null} />
            <DataRow label="Suggested recipe" value={cls.suggestedRecipe} />
          </Section>

          {/* ── Pattern candidates ── */}
          {candidates && Object.keys(candidates).length > 0 && (
            <Section title="Pattern Candidates">
              {Object.entries(candidates).map(([classifier, result]) => {
                if (!result) return null;
                const pat   = result.pattern || result.lightingPattern || '—';
                const score = result.score ?? result.confidence ?? result.reliabilityScore;
                const src   = result.source || result.patternSource || null;
                return (
                  <div key={classifier} style={rowStyle}>
                    <span style={labelStyle}>{classifier}</span>
                    <span style={valueStyle}>
                      {pat}
                      {score != null && <span style={{ color: 'var(--color-text-dim)', marginLeft: 4 }}>· {pct(score)}</span>}
                      {src && <span style={{ color: 'var(--color-text-dim)', marginLeft: 4 }}>· {src}</span>}
                    </span>
                  </div>
                );
              })}
            </Section>
          )}

          {/* ── Lighting Intelligence ── */}
          {li && (
            <Section title="Lighting Intelligence">
              <DataRow label="Light count"      value={li.lightCount != null ? String(li.lightCount) : null} />
              <DataRow label="Key position"     value={li.keyPosition} />
              <DataRow label="Detected modifier" value={li.detectedModifier} />
              <DataRow label="Ambient"          value={li.ambientConditions || li.detectedEnvironment} />
              <DataRow label="Detected CCT"     value={li.detectedCCT != null ? `${li.detectedCCT} K` : null} />
            </Section>
          )}

          {/* ── Perception Explanation ── */}
          {pex && (
            <Section title="Perception Explanation">
              {pex.patternReasoning && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ ...labelStyle, marginBottom: 4 }}>Pattern reasoning</div>
                  <div style={{ color: 'var(--color-text)', lineHeight: 1.55 }}>{pex.patternReasoning}</div>
                </div>
              )}
              {pex.supportingSignals?.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ ...labelStyle, color: 'var(--color-success)', marginBottom: 4 }}>
                    Supporting signals ({pex.supportingSignals.length})
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.6 }}>
                    {pex.supportingSignals.map((s, i) => (
                      <li key={i} style={{ color: 'var(--color-text-secondary)', marginBottom: 2 }}>
                        {typeof s === 'string' ? s : (s.signal || s.description || JSON.stringify(s))}
                        {s.weight != null && <span style={{ color: 'var(--color-text-dim)', marginLeft: 4 }}>({s.weight})</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {pex.contradictingSignals?.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ ...labelStyle, color: 'var(--color-error)', marginBottom: 4 }}>
                    Contradicting signals ({pex.contradictingSignals.length})
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.6 }}>
                    {pex.contradictingSignals.map((s, i) => (
                      <li key={i} style={{ color: 'var(--color-text-secondary)', marginBottom: 2 }}>
                        {typeof s === 'string' ? s : (s.signal || s.description || JSON.stringify(s))}
                        {s.weight != null && <span style={{ color: 'var(--color-text-dim)', marginLeft: 4 }}>({s.weight})</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Section>
          )}

          {/* ── VLM Narrative fields not shown in user cards ── */}
          {refA?.image_read && (() => {
            const ir = refA.image_read;
            const extraFields = [
              ['Full narrative',        ir.narrative],
              ['Aspect ratio',          ir.aspect_ratio],
              ['Tonal contrast',        ir.tonal_contrast],
              ['Skin tone confidence',  ir.skin_tone_confidence != null ? pct(ir.skin_tone_confidence) : null],
              ['Subject count',         ir.subject_count != null ? String(ir.subject_count) : null],
              ['Mixed skin tones',      ir.skin_tone_mixed != null ? String(ir.skin_tone_mixed) : null],
              ['All skin tones',        ir.subject_skin_tones],
              ['Shot type',             ir.shot_type],
              ['Camera angle',          ir.camera_angle],
              ['Depth of field',        ir.depth_of_field],
              ['BG texture',            ir.background_texture],
              ['Catchlight shape',      ir.catchlight_shape],
              ['Catchlight position',   ir.catchlight_position],
              ['Shadow hardness',       ir.shadow_hardness],
              ['Shadow direction',      ir.shadow_direction],
              ['Specular highlights',   ir.specular_highlights],
            ].filter(([, v]) => v != null && v !== '' && v !== 'unknown' && !(Array.isArray(v) && v.length === 0));
            if (!extraFields.length) return null;
            return (
              <Section title="Image Read — Extended">
                {extraFields.map(([label, value]) => (
                  <DataRow key={label} label={label} value={value} />
                ))}
              </Section>
            );
          })()}

          {refA?.lighting_read && (() => {
            const lr = refA.lighting_read;
            const extraFields = [
              ['Contrast ratio',         lr.contrast_ratio],
              ['Exposure latitude',      lr.exposure_latitude],
              ['Catchlight quality',     lr.catchlight_quality],
              ['Background separation', lr.background_separation],
              ['Gradient falloff',       lr.gradient_falloff],
              ['Modifier confidence',    lr.modifier_confidence != null ? pct(lr.modifier_confidence) : null],
              ['Modifier hint',          lr.modifier_hint],
              ['Setup confidence',       lr.setup_confidence != null ? pct(lr.setup_confidence) : null],
              ['Environment type',       lr.environment_type],
              ['Ambient contribution',   lr.ambient_contribution],
            ].filter(([, v]) => v != null && v !== '' && v !== 'unknown');
            if (!extraFields.length) return null;
            return (
              <Section title="Lighting Read — Extended">
                {extraFields.map(([label, value]) => (
                  <DataRow key={label} label={label} value={value} />
                ))}
              </Section>
            );
          })()}

          {/* ── Raw JSON dump ── */}
          <Section title="Raw Analysis JSON">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setRawOpen(v => !v)}
              style={{ fontSize: 'var(--text-xs)', marginBottom: rawOpen ? 8 : 0 }}
            >
              {rawOpen ? 'Hide raw JSON' : 'Show raw JSON'}
            </button>
            {rawOpen && (
              <pre style={{
                fontSize: 10, lineHeight: 1.4, overflowX: 'auto',
                background: 'var(--color-surface-elevated)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: 'var(--radius-sm)',
                padding: 10, margin: 0,
                color: 'var(--color-text-secondary)',
                maxHeight: 400, overflowY: 'auto',
              }}>
                {JSON.stringify(analysis, null, 2)}
              </pre>
            )}
          </Section>

        </div>
      )}
    </div>
  );
}

// ── User: report analysis issue ────────────────────────────────────────────

function UserCorrectionForm({ analysis, referenceImagePreview, issueTypes = DEFAULT_ISSUE_TYPES, moodOptions = DEFAULT_MOOD_OPTIONS }) {
  const [open, setOpen]     = useState(false);
  const [issue, setIssue]   = useState('');
  const [note, setNote]     = useState('');
  const [sent, setSent]     = useState(false);

  function handleSubmit() {
    trackEvent('ANALYSIS_CORRECTION_SUBMITTED', {
      issue_type: issue,
      note: note.trim() || null,
      detected_pattern: analysis?.classification?.lightingPattern,
      detected_mood: analysis?.classification?.mood,
      confidence: analysis?.classification?.confidence,
    });
    setSent(true);
    setOpen(false);
  }

  if (sent) {
    return (
      <div className="ref-correction ref-correction--thanks">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)"
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        Thanks — we'll use this to improve the engine.
      </div>
    );
  }

  return (
    <div className="ref-correction ref-correction--user">
      {!open ? (
        <button
          className="ref-correction__trigger"
          onClick={() => setOpen(true)}
          type="button"
        >
          Analysis doesn't look right?
        </button>
      ) : (
        <div className="ref-correction__form">
          <p className="ref-correction__form-intro">What seems off?</p>
          <div className="ref-correction__radio-group">
            {issueTypes.map(it => (
              <label key={it.value} className="ref-correction__radio-row">
                <input
                  type="radio"
                  name="issue_type"
                  value={it.value}
                  checked={issue === it.value}
                  onChange={() => setIssue(it.value)}
                />
                <span>{it.label}</span>
              </label>
            ))}
          </div>
          <textarea
            className="ref-correction__textarea"
            rows={2}
            placeholder="Anything to add? (optional)"
            value={note}
            onChange={e => setNote(e.target.value)}
          />
          <div className="ref-correction__form-actions">
            <button
              className="btn btn--primary btn--sm"
              onClick={handleSubmit}
              disabled={!issue}
            >
              Submit
            </button>
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => setOpen(false)}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Scan status ────────────────────────────────────────────────────────────

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
    const id = setInterval(() => setPhase(p => (p + 1) % SCAN_PHASES.length), 3200);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="ref-scan-status">
      {/* key forces remount → fade-in re-runs on each phase */}
      <span className="ref-scan-status__dot" />
      <span className="ref-scan-status__text" key={phase}>{SCAN_PHASES[phase]}</span>
    </div>
  );
}

// ── Color palette panel with harmony picker ─────────────────────────────────

const HARMONY_LABELS = {
  analogous:          'Analogous',
  complementary:      'Complementary',
  split_complementary:'Split-Complementary',
  triadic:            'Triadic',
  monochromatic:      'Monochromatic',
  neutral:            'Neutral',
  warm_cool_split:    'Warm/Cool Split',
};

function ColorPalettePanel({ colorPalette: cp }) {
  // Build the full list of available harmony views
  const primary = cp.color_harmony && cp.color_harmony !== 'unknown' ? cp.color_harmony : null;
  const alts = (cp.alternate_harmonies || []).filter(h => h && h !== 'unknown' && h !== primary);
  // warm_cool_split is also surfaced separately — include it if not already
  if (cp.warm_cool_split && !alts.includes('warm_cool_split') && primary !== 'warm_cool_split') {
    alts.push('warm_cool_split');
  }
  const allHarmonies = [primary, ...alts].filter(Boolean);
  const [activeHarmony, setActiveHarmony] = useState(primary || null);

  return (
    <div style={{ marginTop: 'var(--space-md)', borderTop: '1px solid var(--border-faint)', paddingTop: 'var(--space-md)' }}>

      {/* palette_character — headline */}
      {cp.palette_character && (
        <div style={{ marginBottom: 'var(--space-sm)' }}>
          <div className="ref-analysis__label">Color Character</div>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text)', lineHeight: 1.5 }}>
            {cp.palette_character}
          </div>
        </div>
      )}

      {/* Harmony picker — pill tabs, shown when more than one harmony exists */}
      {allHarmonies.length > 0 && (
        <div style={{ marginBottom: 'var(--space-sm)' }}>
          <div className="ref-analysis__label" style={{ marginBottom: 5 }}>Color Harmony</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {allHarmonies.map(h => (
              <button
                key={h}
                type="button"
                onClick={() => setActiveHarmony(h)}
                style={{
                  fontSize: 'var(--text-xs)',
                  fontWeight: activeHarmony === h ? 'var(--weight-semibold)' : 'var(--weight-normal)',
                  color: activeHarmony === h ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                  background: activeHarmony === h ? 'var(--color-accent-subtle)' : 'var(--color-surface-elevated)',
                  border: activeHarmony === h ? '1px solid var(--color-accent-subtle-border)' : '1px solid transparent',
                  borderRadius: 'var(--radius-full)',
                  padding: '3px 10px',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  textTransform: 'capitalize',
                  letterSpacing: 'var(--tracking-wide)',
                }}
              >
                {HARMONY_LABELS[h] || h.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Light temperature */}
      {(cp.color_temperature_key || cp.color_temperature_shadows) && (
        <div style={{ marginBottom: 'var(--space-sm)' }}>
          <div className="ref-analysis__label">Light Temperature</div>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text)', lineHeight: 1.5 }}>
            {cp.color_temperature_key && <span>Key: {cp.color_temperature_key}</span>}
            {cp.color_temperature_key && cp.color_temperature_shadows && (
              <span style={{ color: 'var(--color-text-dim)', margin: '0 6px' }}>·</span>
            )}
            {cp.color_temperature_shadows && <span>Shadows: {cp.color_temperature_shadows}</span>}
          </div>
        </div>
      )}

      {/* Color swatches — harmony-aware colored chips */}
      {(() => {
        // harmony_swatches holds hex codes for the selected harmony;
        // fall back to all dominant_colors (paired with their hexes) when no harmony data.
        const harmonyHexes = activeHarmony && cp.harmony_swatches?.[activeHarmony]?.length > 0
          ? cp.harmony_swatches[activeHarmony]
          : null;

        // Build display list: [{hex, name}] — hex may be absent for old analysis results
        let chips;
        if (harmonyHexes) {
          // Harmony mode: hexes only (from harmony_swatches). Find matching name if possible.
          const hexToName = {};
          (cp.dominant_color_hexes || []).forEach((h, i) => {
            if (h) hexToName[h.toLowerCase()] = cp.dominant_colors?.[i] || '';
          });
          chips = harmonyHexes.map(h => ({ hex: h, name: hexToName[h?.toLowerCase()] || '' }));
        } else {
          // All-colors mode: pair dominant_colors with their hexes
          chips = (cp.dominant_colors || []).map((name, i) => ({
            hex: cp.dominant_color_hexes?.[i] || null,
            name,
          }));
        }

        if (!chips.length) return null;

        const label = harmonyHexes
          ? `${HARMONY_LABELS[activeHarmony] || activeHarmony.replace(/_/g, ' ')} Palette`
          : 'Detected Colors';

        return (
          <div style={{ marginBottom: 'var(--space-sm)' }}>
            <div className="ref-analysis__label">{label}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {chips.map(({ hex, name }, i) => (
                <div key={i} title={name || hex || ''} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                }}>
                  {hex ? (
                    <div style={{
                      width: 36, height: 36,
                      borderRadius: 'var(--radius-sm)',
                      background: hex,
                      border: '1px solid rgba(255,255,255,0.10)',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.35)',
                    }} />
                  ) : (
                    /* fallback: text chip when no hex available */
                    <span style={{
                      fontSize: 'var(--text-xs)',
                      color: 'var(--color-text-secondary)',
                      background: 'var(--color-surface-elevated)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '2px 7px',
                    }}>{name}</span>
                  )}
                  {hex && name && (
                    <span style={{
                      fontSize: 10, color: 'var(--color-text-dim)',
                      maxWidth: 40, textAlign: 'center',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      lineHeight: 1.2,
                    }}>{name}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Contrasting pairs — filter to active harmony when possible */}
      {cp.contrasting_pairs?.length > 0 && (() => {
        // Each pair string typically includes a parenthetical harmony label.
        // e.g. "red vs teal (complementary)" — try to match active harmony.
        const harmonyKey = activeHarmony || '';
        const harmonyWords = harmonyKey.replace(/_/g, ' ').toLowerCase().split(' ');
        const filtered = cp.contrasting_pairs.filter(p =>
          harmonyWords.some(w => w.length > 3 && p.toLowerCase().includes(w))
        );
        // If filter yields results, show only those; otherwise fall back to all
        const pairs = filtered.length > 0 ? filtered : cp.contrasting_pairs;
        return (
          <div style={{ marginBottom: 'var(--space-sm)' }}>
            <div className="ref-analysis__label">Color Contrasts</div>
            {pairs.map((pair, i) => (
              <div key={i} style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                {pair}
              </div>
            ))}
          </div>
        );
      })()}

      {/* Color grading notes */}
      {cp.color_grading_notes && (
        <div>
          <div className="ref-analysis__label">Grading Notes</div>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
            {cp.color_grading_notes}
          </div>
        </div>
      )}
    </div>
  );
}


function ColorPalettePanelToggle({ colorPalette }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 'var(--space-sm)' }}>
      <button
        type="button"
        className="ref-analysis__expand-btn"
        onClick={() => setOpen(v => !v)}
        style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--color-text-dim)',
          background: 'none',
          border: 'none',
          padding: '4px 0',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <svg
          width="11" height="11" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
        {open ? 'Hide color analysis' : 'See detailed color analysis'}
      </button>
      {open && <ColorPalettePanel colorPalette={colorPalette} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Main screen
// ═══════════════════════════════════════════════════════════════════════════

export default function ReferenceEvalScreen() {
  const { referenceImage, referenceImages, user, refAnalysis: storedAnalysis } = useAppState();
  const dispatch = useDispatch();
  const userEmail = user?.email || user?.username || null;
  const { isAdmin } = usePaywall(userEmail);

  const imageCount = referenceImages?.length || (referenceImage ? 1 : 0);

  const fileRef = useRef(null);
  const [loading, setLoading]           = useState(true);
  const [analysis, setAnalysis]         = useState(null);
  const [selectedMood, setSelectedMood] = useState(null);
  const [error, setError]               = useState(null);
  const [zoomSrc, setZoomSrc]           = useState(null);

  // Option lists from the truth layer — fall back to defaults while loading
  const [moodOptions, setMoodOptions]       = useState(DEFAULT_MOOD_OPTIONS);
  const [patternOptions, setPatternOptions] = useState(DEFAULT_PATTERN_OPTIONS);
  const [issueTypes, setIssueTypes]         = useState(DEFAULT_ISSUE_TYPES);

  // Derived label map — stays in sync with API-fetched moodOptions
  const moodLabels = Object.fromEntries(moodOptions.map(m => [m.value, m.label]));

  useEffect(() => {
    fetch('/api/config', { headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {} })
      .then(r => r.ok ? r.json() : null)
      .then(cfg => {
        if (!cfg) return;
        if (cfg.moods?.length)       setMoodOptions(cfg.moods);
        if (cfg.patterns?.length)    setPatternOptions(cfg.patterns);
        if (cfg.issue_types?.length) setIssueTypes(cfg.issue_types);
      })
      .catch(() => { /* keep defaults on network error */ });
  }, []);

  useEffect(() => {
    if (!referenceImage?.file) {
      // Dev demo: if analysis was pre-populated in app state (e.g. via ?_demo=ref_eval),
      // hydrate local state from it instead of showing the error banner.
      if (storedAnalysis) {
        setAnalysis(storedAnalysis);
        setSelectedMood(storedAnalysis?.classification?.mood || null);
        setLoading(false);
      } else {
        setLoading(false);
        setError('No image selected');
      }
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
    // Store the full analysis so SetupWizard can pass it to shoot-match as priorAnalysis.
    // This prevents shoot-match from re-deriving a different pattern and ensures
    // the setup recommendation is anchored to what ref eval detected.
    if (analysis) {
      dispatch({ type: 'SET_REF_ANALYSIS', analysis });
    }
    dispatch({ type: 'SET_MOOD', mood });
    dispatch({ type: 'SET_INTENT', intent: 'ref_match' });
  }

  function handleBack() {
    dispatch({ type: 'CLEAR_REFERENCE_IMAGE' });
    dispatch({ type: 'GO_BACK' });
  }

  function handleAnalyzeAnother() {
    fileRef.current?.click();
  }

  async function handleFileSelected(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (fileRef.current) fileRef.current.value = '';
    const preview = URL.createObjectURL(f);
    const imageObj = { file: f, preview, serverPath: null };
    dispatch({ type: 'SET_REFERENCE_IMAGE', payload: imageObj });
    dispatch({ type: 'SET_REFERENCE_IMAGES', payload: [imageObj] });
    setAnalysis(null);
    setError(null);
    setSelectedMood(null);
    setLoading(true);
    try {
      const result = await uploadReferenceImage(f);
      dispatch({ type: 'SET_REFERENCE_IMAGE', payload: { ...imageObj, serverPath: result.path } });
      setAnalysis(result.analysis);
      setSelectedMood(result.analysis?.classification?.mood || null);
    } catch (err) {
      setError(err.message || 'Analysis failed');
    } finally {
      setLoading(false);
    }
  }

  function handleOpenLab() {
    if (referenceImage) {
      dispatch({ type: 'SET_LAB_PENDING_IMAGE', payload: referenceImage });
    }
    dispatch({ type: 'NAVIGATE', screen: 'lab' });
  }

  const classification    = analysis?.classification;
  const palette           = analysis?.palette?.overall || [];
  const recipeName        = classification?.suggestedRecipe
    ? RECIPES.find(r => r.id === classification.suggestedRecipe)?.name
    : null;
  const subject           = analysis?.description?.subject;
  const refAnalysis       = analysis?.description?.referenceAnalysis;
  const imageRead         = refAnalysis?.image_read;
  const lightingRead      = refAnalysis?.lighting_read;
  const recreationSetup   = refAnalysis?.recreation_setup;
  const colorPalette      = refAnalysis?.color_palette;

  return (
    <div className="screen ref-eval-screen">

      {/* Hidden file input for "Analyze another" */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileSelected}
      />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 var(--space-md)', marginBottom: 'var(--space-xs)' }}>
        <h2 className="screen-heading" style={{ margin: 0 }}>Reference Evaluation</h2>
        {(analysis || error) && !loading && (
          <button
            className="btn btn--ghost btn--sm"
            onClick={handleAnalyzeAnother}
            style={{ flexShrink: 0 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 4 }}>
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            Analyze another
          </button>
        )}
      </div>

      {/* Zoom overlay */}
      {zoomSrc && <ZoomOverlay src={zoomSrc} alt="Reference photo" onClose={() => setZoomSrc(null)} />}

      {/* ── Floating image preview ───────────────────────────────────────── */}
      {referenceImage?.preview && (
        <div className={`ref-eval__preview-wrap${loading ? ' ref-eval__preview-wrap--analyzing' : ''}`}>
          {imageCount > 1 ? (
            /* Gallery: grid layout, no individual float */
            <div className={`ref-eval__gallery${loading ? ' ref-eval__gallery--scanning' : ''}`}>
              {referenceImages.map((img, i) => (
                <img
                  key={i}
                  src={img.preview}
                  alt={`Reference photo ${i + 1}`}
                  onClick={() => !loading && setZoomSrc(img.preview)}
                />
              ))}
              {loading && <div className="ref-scan-overlay"><div className="ref-scan-overlay__line" /></div>}
            </div>
          ) : (
            /* Single image: dramatic float */
            <div
              className={`lab-workbench__img-shell${
                loading
                  ? ' lab-workbench__img-shell--analyzing'
                  : ' lab-workbench__img-shell--settled'
              }`}
              onClick={() => !loading && setZoomSrc(referenceImage.preview)}
            >
              <img
                src={referenceImage.preview}
                alt="Reference photo"
                className="ref-eval__img"
              />
              {loading && <div className="ref-scan-overlay"><div className="ref-scan-overlay__line" /></div>}
            </div>
          )}
          {/* Scan status lives inside the preview wrap so it's always
              visible directly below the image without scrolling */}
          {loading && <ScanStatus />}
        </div>
      )}

      {/* Narrative — directly under image */}
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
      {!loading && analysis && imageCount > 0 && (
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
          <div style={{ display: 'flex', gap: 'var(--space-sm)', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn--ghost btn--sm" onClick={handleAnalyzeAnother}>
              Try another image
            </button>
            <button className="btn btn--primary btn--sm" onClick={handleBack}>
              Go Back
            </button>
          </div>
        </div>
      )}

      {/* Analysis results */}
      {!loading && analysis && (
        <>
          {/* ── The Light ── */}
          {lightingRead && (
            <CollapsibleCard
              icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>}
              title="The Light"
            >
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
                    <span className={`ref-analysis__label ref-analysis__temp-${classification.colorTemperature}`}>Color Temp</span>
                    <span className={`ref-analysis__value ref-analysis__temp-${classification.colorTemperature}`}>
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
                  <span className="ref-card__warning-icon">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  </span>
                  <div>
                    {lightingRead.ambiguity_notes.map((n, i) => <p key={i}>{n}</p>)}
                  </div>
                </div>
              )}
            </CollapsibleCard>
          )}

          {/* ── Lighting Diagram ── */}
          {analysis?.detectedDiagram?.raw && (
            <CollapsibleCard
              icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="5" r="3"/><path d="M7 9L4 22h16L17 9"/></svg>}
              title="Lighting"
            >
              <DiagramCard spec={analysis.detectedDiagram.raw} title="" inline />
            </CollapsibleCard>
          )}

          {/* ── The Shot ── */}
          {(subject || imageRead || classification) && (
            <CollapsibleCard
              icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>}
              title="The Shot"
            >
              <div className="ref-analysis">
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
                      {moodLabels[classification.mood] || classification.mood}
                    </span>
                  </div>
                )}
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
                {imageRead?.notable_visual_devices?.length > 0 && (
                  <div className="ref-analysis__row">
                    <span className="ref-analysis__label">Visual Devices</span>
                    <span className="ref-analysis__value">{imageRead.notable_visual_devices.join(', ')}</span>
                  </div>
                )}
              </div>
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

              {/* VLM color palette — richer character analysis, collapsed by default */}
              {colorPalette && (colorPalette.palette_character || colorPalette.dominant_colors?.length > 0) && (
                <ColorPalettePanelToggle colorPalette={colorPalette} />
              )}
            </CollapsibleCard>
          )}

          {/* ── How To Recreate It ── */}
          {recreationSetup && (
            <CollapsibleCard
              icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>}
              title="How To Recreate It"
            >
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

          {/* ── Confirm vibe ── */}
          <div className="result-card">
            <div className="result-card__header">
              <span className="result-card__icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
              </span>
              <span>Confirm Vibe</span>
            </div>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-dim)', marginBottom: 'var(--space-sm)' }}>
              {classification?.mood
                ? `We detected a ${moodLabels[classification.mood] || classification.mood} vibe. Tap to override.`
                : 'Select the vibe you want to achieve.'}
            </p>
            <div className="chip-grid">
              {moodOptions.map(m => (
                <button
                  key={m.value}
                  className={`chip${selectedMood === m.value ? ' chip--selected' : ''}`}
                  onClick={() => setSelectedMood(m.value)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Correction panel (admin) / report issue (user) ── */}
          {isAdmin ? (
            <>
              <AdminCorrectionPanel
                analysis={analysis}
                imagePath={referenceImage?.serverPath || referenceImage?.file?.name || ''}
                onNavigateLab={handleOpenLab}
                patternOptions={patternOptions}
                moodOptions={moodOptions}
              />
              <AdminVLMPanel analysis={analysis} />
            </>
          ) : (
            <UserCorrectionForm
              analysis={analysis}
              referenceImagePreview={referenceImage?.preview}
              issueTypes={issueTypes}
              moodOptions={moodOptions}
            />
          )}

          {/* ── Confirm button ── */}
          <div style={{ padding: 'var(--space-md) 0', paddingBottom: 'calc(var(--space-xl) + env(safe-area-inset-bottom, 0px))' }}>
            <button
              className="btn btn--primary"
              style={{ width: '100%' }}
              disabled={!selectedMood}
              onClick={handleConfirm}
            >
              Confirm &amp; Get Setup →
            </button>
          </div>
        </>
      )}

      {/* Fallback: no analysis, not loading */}
      {!loading && !analysis && !error && (
        <div style={{ textAlign: 'center', padding: 'var(--space-xl)', color: 'var(--color-text-dim)' }}>
          <p>Could not analyze this image. You can still continue.</p>
          <div className="chip-grid" style={{ marginTop: 'var(--space-md)' }}>
            {moodOptions.map(m => (
              <button
                key={m.value}
                className={`chip${selectedMood === m.value ? ' chip--selected' : ''}`}
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
            Continue →
          </button>
        </div>
      )}
    </div>
  );
}
