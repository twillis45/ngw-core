/**
 * StudioLabScreen — Studio Matte engine workbench.
 *
 * A photographer-facing diagnostic view with Studio Matte depth treatment.
 * Shows the last analysis result with detailed signal breakdown,
 * engine diagnostics, and raw data inspection.
 *
 * NOT the full engineering Lab (9,661 lines) — this is a focused view
 * for power users who want to see what the engine saw.
 *
 * Accessed via Settings → dev tap 5x → Open Lab.
 */
import { useState } from 'react';
import { tapHaptic, navHaptic } from '../../../utils/haptics';
import { softClickSound, navSlideSound } from '../../../utils/sounds';
import { steel, C as SM_C, FONT_SMOOTH, PANEL_SHADOW, PANEL_BEVEL,
         KEY_ACCENT, GREEN } from '../../../theme/studioMatte';
import MatteBackground from '../_shared/MatteBackground';
import { Panel, Divider, SectionLabel, NavRow, InfoRow, ScreenHeader }
  from './components';

const C = SM_C;
const FS = FONT_SMOOTH;

export default function StudioLabScreen({ onBack, lastResult }) {
  const [activeTab, setActiveTab] = useState('signals');
  const raw = lastResult?._raw || {};
  const sd = raw.signal_diagnostics || {};
  const sigs = sd.signals || {};
  const li = raw.lighting_inference || {};
  const recon = raw.reconstruction || {};

  const tabs = [
    { key: 'signals', label: 'Signals' },
    { key: 'engine', label: 'Engine' },
    { key: 'raw', label: 'Raw Data' },
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: C.bg, overflow: 'hidden', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <MatteBackground variant="subdued" />
      <div style={{ position: 'relative', zIndex: 1, height: '100%', overflowY: 'auto', maxWidth: 800, margin: '0 auto' }}>

        <ScreenHeader title="Studio Lab" onBack={onBack} />

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 6, padding: '0 20px 12px' }}>
          {tabs.map(t => (
            <button key={t.key}
              onClick={() => { setActiveTab(t.key); tapHaptic(); softClickSound(); }}
              style={{
                flex: 1, padding: '9px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: activeTab === t.key
                  ? 'linear-gradient(141.71deg, #2a2218 0%, #1c1810 100%)'
                  : 'linear-gradient(141.71deg, #15171d 0%, #0d0e12 100%)',
                fontSize: 12, fontWeight: activeTab === t.key ? 700 : 600,
                color: activeTab === t.key ? KEY_ACCENT : steel(0.40),
                letterSpacing: '0.3px',
                boxShadow: activeTab === t.key
                  ? `3px 3px 8px rgba(0,0,0,0.45), 0 0 0 0.5px rgba(200,155,69,0.22), inset 0 1px 0 rgba(200,155,69,0.08)`
                  : '2px 2px 5px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.02)',
                ...FS,
              }}
            >{t.label}</button>
          ))}
        </div>

        <div style={{ padding: '0 20px 48px' }}>

          {/* No result state */}
          {!lastResult && (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <p style={{ fontSize: 14, color: steel(0.40), ...FS }}>No analysis result to inspect.</p>
              <p style={{ fontSize: 12, color: steel(0.28), marginTop: 8, ...FS }}>Analyze a photo first, then come back here.</p>
            </div>
          )}

          {/* Signals tab */}
          {lastResult && activeTab === 'signals' && (
            <>
              <SectionLabel label="PATTERN" />
              <Panel>
                <InfoRow label="Authoritative" value={lastResult.pattern || '—'} />
                <Divider />
                <InfoRow label="Confidence" value={lastResult.confidence != null ? `${lastResult.confidence}%` : '—'} />
                <Divider />
                <InfoRow label="Shadow pass" value={sigs.shadow_pass_pattern || '—'} />
              </Panel>

              <SectionLabel label="LIGHT STRUCTURE" />
              <Panel>
                <InfoRow label="Triangle isolation" value={sigs.triangle_isolation?.toFixed(3) || '—'} />
                <Divider />
                <InfoRow label="L/R asymmetry" value={sigs.left_right_asymmetry?.toFixed(3) || '—'} />
                <Divider />
                <InfoRow label="Shadow density" value={sigs.shadow_density?.toFixed(3) || '—'} />
                <Divider />
                <InfoRow label="Highlight width" value={sigs.highlight_width_ratio?.toFixed(3) || '—'} />
                <Divider />
                <InfoRow label="Nose shadow angle" value={sigs.nose_shadow_angle_deg != null ? `${sigs.nose_shadow_angle_deg}°` : '—'} />
              </Panel>

              <SectionLabel label="KEY LIGHT" />
              <Panel>
                <InfoRow label="Side" value={li.key_side || '—'} />
                <Divider />
                <InfoRow label="Elevation" value={recon.key_light_height || '—'} />
                <Divider />
                <InfoRow label="Elevation angle" value={recon.key_elevation_above_eye_deg != null ? `${recon.key_elevation_above_eye_deg}°` : '—'} />
                <Divider />
                <InfoRow label="Angle (pose corrected)" value={recon.key_light_angle_deg_pose_corrected != null ? `${recon.key_light_angle_deg_pose_corrected}°` : '—'} />
                <Divider />
                <InfoRow label="Modifier" value={li.modifier_family || recon.modifier_type || '—'} />
                <Divider />
                <InfoRow label="Distance" value={recon.modifier_distance_ft != null ? `${recon.modifier_distance_ft} ft` : '—'} />
                <Divider />
                <InfoRow label="Light count" value={li.light_count || '—'} />
              </Panel>

              <SectionLabel label="CATCHLIGHTS" />
              <Panel>
                {(() => {
                  const cls = raw.vision?.catchlights?.catchlights || raw.cv?.catchlights?.catchlights || [];
                  if (!cls.length) return <InfoRow label="Detected" value="None" />;
                  return cls.map((c, i) => (
                    <div key={i}>
                      {i > 0 && <Divider />}
                      <InfoRow label={`#${i + 1} position`} value={c.position || '—'} />
                      <Divider />
                      <InfoRow label={`#${i + 1} intensity`} value={c.intensity?.toFixed(2) || '—'} />
                      <Divider />
                      <InfoRow label={`#${i + 1} size ratio`} value={c.size_ratio?.toFixed(3) || '—'} />
                      <Divider />
                      <InfoRow label={`#${i + 1} shape`} value={c.shape || '—'} />
                    </div>
                  ));
                })()}
              </Panel>
            </>
          )}

          {/* Engine tab */}
          {lastResult && activeTab === 'engine' && (
            <>
              <SectionLabel label="CONTRADICTIONS" />
              <Panel>
                {(() => {
                  const contras = sd.contradictions || [];
                  if (!contras.length) return <InfoRow label="None" value="—" />;
                  return contras.map((c, i) => (
                    <div key={i}>
                      {i > 0 && <Divider />}
                      <div style={{ padding: '10px 20px' }}>
                        <p style={{ margin: 0, fontSize: 12, color: C.textPrimary, lineHeight: '16px', ...FS }}>{c}</p>
                      </div>
                    </div>
                  ));
                })()}
              </Panel>

              <SectionLabel label="RECONSTRUCTION" />
              <Panel>
                <InfoRow label="Fill present" value={recon.fill_present != null ? String(recon.fill_present) : '—'} />
                <Divider />
                <InfoRow label="Negative fill" value={recon.negative_fill != null ? String(recon.negative_fill) : '—'} />
                <Divider />
                <InfoRow label="Background light" value={recon.background_light != null ? String(recon.background_light) : '—'} />
                <Divider />
                <InfoRow label="BG distance" value={recon.background_distance_ft != null ? `${recon.background_distance_ft} ft` : '—'} />
                <Divider />
                <InfoRow label="Camera height" value={recon.camera_height_relative_to_subject || '—'} />
              </Panel>

              <SectionLabel label="VLM" />
              <Panel>
                {(() => {
                  const vlm = raw.vlm || {};
                  return (
                    <>
                      <InfoRow label="Lighting style" value={vlm.lighting_style || '—'} />
                      <Divider />
                      <InfoRow label="Mood" value={vlm.overall_mood || '—'} />
                      <Divider />
                      <InfoRow label="Framing" value={vlm.framing || '—'} />
                    </>
                  );
                })()}
              </Panel>
            </>
          )}

          {/* Raw data tab */}
          {lastResult && activeTab === 'raw' && (
            <>
              <SectionLabel label="RAW API RESPONSE" />
              <Panel>
                <div style={{ padding: '12px 16px', maxHeight: 500, overflowY: 'auto' }}>
                  <pre style={{
                    margin: 0, fontSize: 10, lineHeight: '14px',
                    color: steel(0.50), whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                    fontFamily: 'GeistMono, SF Mono, Menlo, monospace',
                    ...FS,
                  }}>
                    {JSON.stringify(raw, null, 2)}
                  </pre>
                </div>
              </Panel>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
