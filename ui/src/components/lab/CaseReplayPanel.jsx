/**
 * CaseReplayPanel — LAB Build 3 + 3.1
 *
 * Read-only replay viewer for a past analysis run.
 * Fetches stored blob from Build 3A persistence layer.
 * All sections show honest empty states — never fake data.
 *
 * Build 3.1 additions:
 *   - Image preview via safe /analysis/{id}/image endpoint
 *   - Open in Workbench handoff via SET_LAB_PENDING_IMAGE dispatch
 *
 * Props:
 *   analysisId       {string}    — analysis_id to load
 *   onBack           {function}  — called when user clicks Back
 *   onOpenWorkbench  {function}  — called to switch to Workbench tab (optional)
 */

import { useState, useEffect } from 'react';
import { fetchAnalysisReplay, replayImageUrl } from '../../data/labApi';

// ── Helpers ────────────────────────────────────────────────

function fmt(val) {
  return val != null && val !== '' ? val : '—';
}

function fmtPct(val) {
  if (val == null) return '—';
  return `${(val * 100).toFixed(1)}%`;
}

function confColor(conf) {
  if (conf == null) return 'var(--color-text-dim)';
  if (conf >= 0.65) return '#4ADE80';   // green
  if (conf >= 0.45) return '#FBBF24';   // amber
  return '#F87171';                     // red
}

function fmtTs(ts) {
  if (!ts) return '—';
  try {
    // ts may be a unix epoch float (seconds) or ISO string
    const d = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts);
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return String(ts);
  }
}

function shortId(id) {
  if (!id) return '—';
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

function truncatePath(p) {
  if (!p) return '—';
  const parts = p.replace(/\\/g, '/').split('/');
  return parts.length > 3 ? `…/${parts.slice(-2).join('/')}` : p;
}

// ── Section wrapper ────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div className="crp-section">
      <div className="crp-section__title">{title}</div>
      {children}
    </div>
  );
}

// ── Pre-3A notice ──────────────────────────────────────────

function Pre3ANotice() {
  return (
    <div className="crp-notice">
      This analysis was run before Build 3A (2026-04-02). The full replay blob is not
      available. Joined records (VLM disagreements, corrections, feedback) may still
      be shown below if they exist.
    </div>
  );
}

// ── Case header card ───────────────────────────────────────

function CaseHeaderCard({ result, analysisId }) {
  const [imgErr, setImgErr] = useState(false);
  const imgUrl = analysisId ? replayImageUrl(analysisId) : null;

  if (!result) return null;
  return (
    <Section title="Case Header">
      {/* Image preview — Build 3.1 */}
      {imgUrl && !imgErr && (
        <div className="crp-image-preview">
          <img
            src={imgUrl}
            alt="Replay analysis image"
            className="crp-image-preview__img"
            onError={() => setImgErr(true)}
          />
        </div>
      )}
      {imgUrl && imgErr && (
        <div className="crp-image-preview crp-image-preview--unavailable">
          <span>Image unavailable — file may have been moved or deleted</span>
        </div>
      )}
      <div className="crp-meta-grid">
        <div className="crp-meta-row">
          <span className="crp-meta-label">Timestamp</span>
          <span className="crp-meta-value">{fmtTs(result.created_at)}</span>
        </div>
        <div className="crp-meta-row">
          <span className="crp-meta-label">System version</span>
          <span className="crp-meta-value">{fmt(result.system_version)}</span>
        </div>
        <div className="crp-meta-row">
          <span className="crp-meta-label">Image path</span>
          <span
            className="crp-meta crp-meta--mono"
            title={result.image_path || undefined}
          >
            {truncatePath(result.image_path)}
          </span>
        </div>
      </div>
    </Section>
  );
}

// ── Prediction summary ─────────────────────────────────────

function PredictionSummary({ payload }) {
  if (!payload) {
    return (
      <Section title="Prediction Summary">
        <p className="lo-empty">No replay payload available for this analysis.</p>
      </Section>
    );
  }

  const conf = payload.pattern_confidence;

  return (
    <Section title="Prediction Summary">
      <div className="crp-meta-grid">
        <div className="crp-meta-row">
          <span className="crp-meta-label">Authoritative pattern</span>
          <span>
            {payload.authoritative_pattern
              ? <span className="crp-badge">{payload.authoritative_pattern}</span>
              : <span className="crp-meta-dim">—</span>
            }
          </span>
        </div>
        <div className="crp-meta-row">
          <span className="crp-meta-label">Confidence</span>
          <span className="crp-conf" style={{ color: confColor(conf) }}>
            {conf != null ? fmtPct(conf) : '—'}
            {payload.pattern_confidence_label
              ? ` (${payload.pattern_confidence_label})`
              : null
            }
          </span>
        </div>
        <div className="crp-meta-row">
          <span className="crp-meta-label">Source</span>
          <span className="crp-meta-value">{fmt(payload.authoritative_pattern_source)}</span>
        </div>
        <div className="crp-meta-row">
          <span className="crp-meta-label">Status</span>
          <span className="crp-meta-value">{fmt(payload.pattern_status)}</span>
        </div>
      </div>
    </Section>
  );
}

// ── Pattern candidates ─────────────────────────────────────

function PatternCandidates({ payload }) {
  const candidates = payload?.pattern_candidates;

  return (
    <Section title="Pattern Candidates">
      {!candidates ? (
        <p className="lo-empty">No pattern candidates in replay record.</p>
      ) : (
        <div className="crp-meta-grid">
          {candidates.primary && (
            <div className="crp-meta-row">
              <span className="crp-meta-label">Primary</span>
              <span>
                <span className="crp-badge">{candidates.primary.pattern}</span>
                {candidates.primary.score != null
                  ? <span className="crp-meta-dim" style={{ marginLeft: 6 }}>
                      {fmtPct(candidates.primary.score)}
                    </span>
                  : null
                }
              </span>
            </div>
          )}
          {Array.isArray(candidates.alternates) && candidates.alternates.length > 0 && (
            <div className="crp-meta-row">
              <span className="crp-meta-label">Alternates</span>
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {candidates.alternates.map((alt, i) => (
                  <span key={i} className="crp-badge crp-badge--alt">
                    {typeof alt === 'string' ? alt : (alt.pattern ?? JSON.stringify(alt))}
                    {alt.score != null ? ` ${fmtPct(alt.score)}` : ''}
                  </span>
                ))}
              </span>
            </div>
          )}
          {Array.isArray(candidates.contradictions) && candidates.contradictions.length > 0 && (
            <div className="crp-meta-row">
              <span className="crp-meta-label">Contradictions</span>
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {candidates.contradictions.map((c, i) => (
                  <span key={i} className="crp-badge crp-badge--contra">
                    {typeof c === 'string' ? c : JSON.stringify(c)}
                  </span>
                ))}
              </span>
            </div>
          )}
          {!candidates.primary && !candidates.alternates?.length && (
            <p className="lo-empty">Pattern candidates object present but empty.</p>
          )}
        </div>
      )}
    </Section>
  );
}

// ── VLM section ────────────────────────────────────────────

function VlmSection({ payload, disagreements }) {
  const hint = payload?.vlm_semantic_hint;
  const hasDis = Array.isArray(disagreements) && disagreements.length > 0;
  const hasHint = hint && Object.keys(hint).length > 0;

  if (!hasHint && !hasDis) {
    return (
      <Section title="VLM Analysis">
        <p className="lo-empty">No VLM data in replay record.</p>
      </Section>
    );
  }

  return (
    <Section title="VLM Analysis">
      {hasHint && (
        <div className="crp-meta-grid" style={{ marginBottom: 'var(--space-sm)' }}>
          {Object.entries(hint).map(([k, v]) => (
            <div key={k} className="crp-meta-row">
              <span className="crp-meta-label">{k}</span>
              <span className="crp-meta-value">
                {v == null ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v)}
              </span>
            </div>
          ))}
        </div>
      )}
      {hasDis && (
        <>
          <div className="crp-section__title" style={{ fontSize: 'var(--text-xs)', marginTop: 'var(--space-sm)' }}>
            VLM Disagreements ({disagreements.length})
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="lo-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Field</th>
                  <th>VLM Value</th>
                  <th>Resolved *</th>
                  <th>Agreement</th>
                  <th>Confidence</th>
                </tr>
              </thead>
              <tbody>
                {disagreements.map((d, i) => (
                  <tr key={d.id ?? i}>
                    <td className="crp-meta--mono" style={{ fontSize: 'var(--text-xs)' }}>
                      {fmt(d.field_name)}
                    </td>
                    <td>{fmt(d.vlm_value)}</td>
                    <td>{fmt(d.resolved_value)}</td>
                    <td>{d.agreement != null ? String(d.agreement) : '—'}</td>
                    <td>
                      {d.vlm_confidence != null
                        ? <span style={{ color: confColor(d.vlm_confidence) }}>
                            {fmtPct(d.vlm_confidence)}
                          </span>
                        : '—'
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ fontSize: 10, color: 'var(--color-text-dim)', marginTop: 6, marginBottom: 0 }}>
            * resolved_value = CV resolver decision, not human-labeled ground truth.
          </p>
        </>
      )}
    </Section>
  );
}

// ── Signal quality ─────────────────────────────────────────

function SignalQuality({ payload }) {
  const face = payload?.face_validation;
  const reliability = payload?.signal_reliability;
  const flags = payload?.edge_case_flags;

  // Collect active (truthy) flags
  const activeFlags = flags
    ? Object.entries(flags).filter(([, v]) => Boolean(v)).map(([k]) => k)
    : [];

  const hasContent = face || reliability || activeFlags.length > 0;

  if (!hasContent) {
    return (
      <Section title="Signal Quality">
        <p className="lo-empty">No signal quality data in replay record.</p>
      </Section>
    );
  }

  return (
    <Section title="Signal Quality">
      <div className="crp-meta-grid">
        {face && (
          <>
            <div className="crp-meta-row">
              <span className="crp-meta-label">Face detected</span>
              <span className="crp-meta-value">
                {face.face_detected != null ? String(face.face_detected) : '—'}
              </span>
            </div>
            {face.confidence != null && (
              <div className="crp-meta-row">
                <span className="crp-meta-label">Face confidence</span>
                <span className="crp-meta-value">{fmtPct(face.confidence)}</span>
              </div>
            )}
          </>
        )}
        {reliability?.overall_strength != null && (
          <div className="crp-meta-row">
            <span className="crp-meta-label">Signal strength</span>
            <span className="crp-meta-value">{fmt(reliability.overall_strength)}</span>
          </div>
        )}
        {activeFlags.length > 0 && (
          <div className="crp-meta-row">
            <span className="crp-meta-label">Active flags</span>
            <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {activeFlags.map(f => (
                <span key={f} className="crp-badge crp-badge--flag">{f}</span>
              ))}
            </span>
          </div>
        )}
      </div>
    </Section>
  );
}

// ── Feedback & corrections ─────────────────────────────────

function FeedbackCorrections({ feedback, corrections }) {
  const hasFeedback = Array.isArray(feedback) && feedback.length > 0;
  const hasCorrections = Array.isArray(corrections) && corrections.length > 0;

  if (!hasFeedback && !hasCorrections) {
    return (
      <Section title="Feedback & Corrections">
        <p className="lo-empty">No feedback or corrections recorded for this analysis.</p>
      </Section>
    );
  }

  return (
    <Section title="Feedback & Corrections">
      {hasFeedback && (
        <>
          <div className="crp-section__title" style={{ fontSize: 'var(--text-xs)', marginBottom: 6 }}>
            User Feedback ({feedback.length})
          </div>
          <div style={{ overflowX: 'auto', marginBottom: 'var(--space-sm)' }}>
            <table className="lo-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Pattern</th>
                  <th>Rating</th>
                  <th>Comment</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {feedback.map((f, i) => (
                  <tr key={f.id ?? i}>
                    <td>{fmt(f.pattern ?? f.predicted_pattern)}</td>
                    <td>{fmt(f.rating)}</td>
                    <td style={{ maxWidth: 200, wordBreak: 'break-word' }}>
                      {fmt(f.comment)}
                    </td>
                    <td style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)' }}>
                      {fmtTs(f.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {hasCorrections && (
        <>
          <div className="crp-section__title" style={{ fontSize: 'var(--text-xs)', marginBottom: 6 }}>
            Corrections ({corrections.length})
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="lo-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Old value</th>
                  <th>New value</th>
                  <th>By</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {corrections.map((c, i) => (
                  <tr key={c.id ?? i}>
                    <td className="crp-meta--mono" style={{ fontSize: 'var(--text-xs)' }}>
                      {fmt(c.field_name)}
                    </td>
                    <td>{fmt(c.old_value)}</td>
                    <td>{fmt(c.new_value)}</td>
                    <td style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)' }}>
                      {fmt(c.corrected_by)}
                    </td>
                    <td style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-dim)' }}>
                      {fmtTs(c.corrected_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Section>
  );
}

// ── Data quality footer ────────────────────────────────────

function DataQualityFooter({ found, vlmDisagreements, corrections, feedback }) {
  const disCount  = Array.isArray(vlmDisagreements) ? vlmDisagreements.length : 0;
  const corrCount = Array.isArray(corrections) ? corrections.length : 0;
  const fbCount   = Array.isArray(feedback) ? feedback.length : 0;

  return (
    <div className="crp-footer">
      <span>Replay available: {found ? 'Yes' : 'No — pre-3A'}</span>
      <span>VLM disagreements: {disCount} records</span>
      <span>Corrections: {corrCount} records</span>
      <span>Feedback: {fbCount} records</span>
      <span style={{ fontStyle: 'italic' }}>
        Note: session outcome is synthetic. resolved_value is CV-resolved, not human ground truth.
      </span>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────

export default function CaseReplayPanel({ analysisId, onBack, onOpenWorkbench }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [err,     setErr]     = useState(null);

  useEffect(() => {
    if (!analysisId) return;
    setLoading(true);
    setErr(null);
    setData(null);

    fetchAnalysisReplay(analysisId)
      .then(d => setData(d))
      .catch(e => setErr(e.message || 'Failed to load replay'))
      .finally(() => setLoading(false));
  }, [analysisId]);

  const result  = data?.result;           // null if pre-3A
  const found   = data?.found ?? false;
  const payload = result?.replay_payload ?? null;

  // "Open in Workbench" — no authenticated image-serving endpoint exists for
  // uploaded lab images (only reference-dataset and gold-set have /image routes).
  // Show button disabled with tooltip so user knows the path.
  const imagePath = result?.image_path ?? null;

  return (
    <div className="lo-panel">
      {/* ── Header bar ── */}
      <div className="crp-back-bar">
        <button
          type="button"
          className="lo-btn lo-btn--ghost"
          onClick={onBack}
          style={{ marginRight: 'var(--space-sm)' }}
        >
          ← Back
        </button>
        <span className="lo-panel__title">Case Replay</span>
        <span
          className="crp-meta crp-meta--mono"
          title={analysisId}
          style={{ marginLeft: 'var(--space-sm)', opacity: 0.6 }}
        >
          {shortId(analysisId)}
        </span>
      </div>

      {/* ── Loading / error states ── */}
      {loading && (
        <p className="lo-empty" style={{ marginTop: 'var(--space-md)' }}>Loading replay…</p>
      )}
      {err && (
        <p className="lo-empty lo-empty--err" style={{ marginTop: 'var(--space-md)' }}>
          {err}
        </p>
      )}

      {/* ── Content (only after load) ── */}
      {!loading && !err && data && (
        <>
          {/* Pre-3A notice */}
          {!found && <Pre3ANotice />}

          {/* Case header */}
          <CaseHeaderCard result={result} analysisId={analysisId} />

          {/* Prediction summary */}
          <PredictionSummary payload={payload} />

          {/* Pattern candidates */}
          <PatternCandidates payload={payload} />

          {/* VLM section */}
          <VlmSection
            payload={payload}
            disagreements={data.vlm_disagreements}
          />

          {/* Signal quality */}
          <SignalQuality payload={payload} />

          {/* Feedback & corrections */}
          <FeedbackCorrections
            feedback={data.user_feedback}
            corrections={data.corrections}
          />

          {/* Open in Workbench — Build 3.1: enabled when image is servable */}
          <div style={{ marginTop: 'var(--space-md)' }}>
            <button
              type="button"
              className="lo-btn lo-btn--primary"
              disabled={!imagePath || !onOpenWorkbench}
              onClick={() => {
                if (!analysisId || !onOpenWorkbench) return;
                const imgUrl = replayImageUrl(analysisId);
                onOpenWorkbench({ preview: imgUrl, serverPath: imagePath });
              }}
              title={
                !imagePath
                  ? 'Image path not available for this analysis'
                  : !onOpenWorkbench
                  ? 'Workbench handoff not available'
                  : 'Open this image in Workbench for re-analysis'
              }
            >
              Open in Workbench
            </button>
            <span style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--color-text-dim)',
              marginLeft: 'var(--space-xs)',
            }}>
              {!imagePath
                ? '— image path unavailable'
                : '— opens image in Workbench for re-analysis'
              }
            </span>
          </div>

          {/* Data quality footer */}
          <DataQualityFooter
            found={found}
            vlmDisagreements={data.vlm_disagreements}
            corrections={data.corrections}
            feedback={data.user_feedback}
          />
        </>
      )}
    </div>
  );
}
