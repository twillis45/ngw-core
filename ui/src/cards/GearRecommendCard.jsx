/**
 * GearRecommendCard — Gear Substitution + Readiness Assessment.
 *
 * Compares user's kit against the recommended setup, showing:
 * - items they own (green)
 * - viable substitutions with honest compromise notes (amber)
 * - missing items with no substitute (red)
 *
 * Uses the substitution engine (gearSubstitution.js) which pulls from
 * masterLighting.js pattern-specific substitution data + modifier family logic.
 *
 * HONESTY: Substitutions are "closest available option" with explicit tradeoffs.
 * Never presented as equivalent.
 *
 * Pro-gated.
 */
import { useMemo, useState } from 'react';
import { C, steel, MACHINED_SHADOW } from '../theme/studioMatte';
import { analyzeGearReadiness } from '../utils/gearSubstitution';

const STATUS_COLORS = {
  owned:       'rgba(72,186,136,0.95)',   // green
  substituted: 'rgba(245,190,72,0.9)',    // amber
  missing:     'rgba(248,113,113,0.8)',   // red
};

const STATUS_LABELS = {
  owned:       'HAVE',
  substituted: 'SUBSTITUTE',
  missing:     'NEED',
};

const COMPROMISE_LABELS = {
  none:        '',
  minor:       'Minor compromise',
  moderate:    'Moderate compromise',
  significant: 'Significant compromise',
};

function StatusDot({ status }) {
  return (
    <span style={{
      width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
      background: STATUS_COLORS[status] || steel(0.3),
    }} />
  );
}

export default function GearRecommendCard({ pattern, userKit, diagramLights = [] }) {
  const [expanded, setExpanded] = useState(false);

  const analysis = useMemo(() => {
    return analyzeGearReadiness(pattern, userKit, diagramLights);
  }, [pattern, userKit, diagramLights]);

  const allItems = [...analysis.modifiers, ...analysis.lights];
  const hasSubstitutions = allItems.some(r => r.status === 'substituted');
  const hasMissing = allItems.some(r => r.status === 'missing');

  return (
    <div style={{
      marginTop: 16,
      borderRadius: 14,
      background: `linear-gradient(141.71deg, ${C.panelBg} 0%, ${C.slotBg} 100%)`,
      boxShadow: MACHINED_SHADOW || '4px 4px 12px rgba(0,0,0,0.5)',
      overflow: 'hidden',
    }}>
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%', padding: '14px 16px',
          borderBottom: expanded ? `1px solid ${steel(0.08)}` : 'none',
          background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          textAlign: 'left',
        }}
      >
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: steel(0.4), letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>
            GEAR READINESS
          </div>
          <div style={{ fontSize: 14, color: C.textPrimary, fontWeight: 600 }}>
            {analysis.readiness}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700,
            background: analysis.readinessScore >= 80 ? 'rgba(72,186,136,0.12)'
              : analysis.readinessScore >= 50 ? 'rgba(245,190,72,0.12)'
              : 'rgba(248,113,113,0.12)',
            color: analysis.readinessScore >= 80 ? C.confHigh
              : analysis.readinessScore >= 50 ? C.confLow
              : '#f87171',
          }}>
            {analysis.readinessScore}%
          </div>
          <span style={{ fontSize: 14, color: steel(0.3), transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'none' }}>
            ▾
          </span>
        </div>
      </button>

      {expanded && (
        <>
          {/* Modifier substitutions */}
          {analysis.modifiers.length > 0 && (
            <div style={{ padding: '10px 16px 6px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: steel(0.35), letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                MODIFIERS
              </div>
              {analysis.modifiers.map((r, i) => (
                <div key={i} style={{
                  padding: '8px 0',
                  borderBottom: i < analysis.modifiers.length - 1 ? `1px solid ${steel(0.06)}` : 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <StatusDot status={r.status} />
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary, textTransform: 'capitalize' }}>
                        {(r.recommended || '').replace(/_/g, ' ')}
                      </span>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: STATUS_COLORS[r.status] }}>
                      {STATUS_LABELS[r.status]}
                    </span>
                  </div>
                  {r.status === 'substituted' && (
                    <div style={{ marginLeft: 15, marginTop: 4 }}>
                      <div style={{ fontSize: 13, color: STATUS_COLORS.substituted }}>
                        Use: <strong>{(r.substitute || '').replace(/_/g, ' ')}</strong>
                        {r.compromiseLevel && r.compromiseLevel !== 'none' && (
                          <span style={{ marginLeft: 8, fontSize: 10, color: steel(0.4) }}>
                            ({COMPROMISE_LABELS[r.compromiseLevel]})
                          </span>
                        )}
                      </div>
                      {r.tradeoff && (
                        <div style={{ fontSize: 11, color: steel(0.4), marginTop: 2, lineHeight: 1.4 }}>
                          {r.tradeoff}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Light substitutions */}
          {analysis.lights.length > 0 && (
            <div style={{ padding: '6px 16px 14px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: steel(0.35), letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                LIGHTS
              </div>
              {analysis.lights.map((r, i) => (
                <div key={i} style={{
                  padding: '8px 0',
                  borderBottom: i < analysis.lights.length - 1 ? `1px solid ${steel(0.06)}` : 'none',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <StatusDot status={r.status} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary, flex: 1, textTransform: 'capitalize' }}>
                      {(r.recommended || '').replace(/_/g, ' ')}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: STATUS_COLORS[r.status] }}>
                      {STATUS_LABELS[r.status]}
                    </span>
                  </div>
                  {r.status === 'substituted' && r.tradeoff && (
                    <div style={{ marginLeft: 15, marginTop: 4, fontSize: 11, color: steel(0.4), lineHeight: 1.4 }}>
                      Use <strong style={{ color: STATUS_COLORS.substituted }}>{(r.substitute || '').replace(/_/g, ' ')}</strong> — {r.tradeoff}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Summary note */}
          {(hasSubstitutions || hasMissing) && (
            <div style={{
              padding: '10px 16px 14px',
              borderTop: `1px solid ${steel(0.06)}`,
              fontSize: 11, color: steel(0.35), lineHeight: 1.5,
            }}>
              {hasSubstitutions && !hasMissing && 'All gear available with substitutions. Test your setup before the shoot — compromises may require distance or power adjustments.'}
              {hasMissing && !hasSubstitutions && 'Some gear is missing with no viable substitute. Consider renting or purchasing before the shoot.'}
              {hasSubstitutions && hasMissing && 'Some items have substitutions; others are missing entirely. Prioritize acquiring the missing items; substitutions will work with adjustments.'}
            </div>
          )}
        </>
      )}
    </div>
  );
}
