/**
 * GearRecommendCard — "You Have vs. You Need" gear comparison.
 * Shows recommended gear for the detected pattern, highlights gaps.
 * Pro-gated.
 */
import { useMemo } from 'react';
import { C, steel, MACHINED_SHADOW } from '../theme/studioMatte';
import { GEAR_RECOMMENDATIONS, DEFAULT_RECOMMENDATION, ACCESSORY_LABELS, TIER_COLORS } from '../data/gearRecommendations';

function TierBadge({ tier }) {
  return (
    <span style={{
      display: 'inline-block',
      padding: '1px 6px',
      borderRadius: 4,
      fontSize: 10,
      fontWeight: 700,
      background: `${TIER_COLORS[tier] || steel(0.5)}18`,
      color: TIER_COLORS[tier] || steel(0.5),
      marginLeft: 6,
    }}>
      {tier}
    </span>
  );
}

export default function GearRecommendCard({ pattern, userKit }) {
  const patternKey = (pattern || '').toLowerCase().replace(/\s+/g, '_');
  const rec = GEAR_RECOMMENDATIONS[patternKey] || DEFAULT_RECOMMENDATION;

  // Compare user's kit to recommendation
  const comparison = useMemo(() => {
    const ownedTypes = new Set();
    const ownedModifiers = new Set();

    if (userKit) {
      (userKit.lights || []).forEach(l => {
        if (l.type) ownedTypes.add(l.type);
      });
      (userKit.modifiers || []).forEach(m => {
        ownedModifiers.add(m.toLowerCase().replace(/\s+/g, '_'));
      });
    }

    const lightResults = rec.lights.map(l => {
      const owned = l.types.some(t => ownedTypes.has(t));
      return { ...l, owned };
    });

    const modResults = rec.modifiers.map(m => {
      const owned = ownedModifiers.has(m.type);
      return { ...m, owned };
    });

    const accResults = rec.accessories.map(a => ({
      key: a,
      label: ACCESSORY_LABELS[a] || a.replace(/_/g, ' '),
      owned: false, // Accessories not tracked in kit currently
    }));

    const totalItems = lightResults.length + modResults.length;
    const ownedCount = lightResults.filter(l => l.owned).length + modResults.filter(m => m.owned).length;

    return { lights: lightResults, modifiers: modResults, accessories: accResults, totalItems, ownedCount };
  }, [rec, userKit]);

  const coveragePct = comparison.totalItems > 0
    ? Math.round((comparison.ownedCount / comparison.totalItems) * 100)
    : 0;

  return (
    <div style={{
      marginTop: 16,
      borderRadius: 14,
      background: `linear-gradient(141.71deg, ${C.panelBg} 0%, ${C.slotBg} 100%)`,
      boxShadow: MACHINED_SHADOW || '4px 4px 12px rgba(0,0,0,0.5)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: '14px 16px 10px', borderBottom: `1px solid ${steel(0.08)}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: steel(0.4), letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>
              GEAR RECOMMENDATION
            </div>
            <div style={{ fontSize: 13, color: C.textPrimary, fontWeight: 600 }}>
              {patternKey.replace(/_/g, ' ')} setup
            </div>
          </div>
          <div style={{
            padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700,
            background: coveragePct >= 80 ? 'rgba(72,186,136,0.12)' : coveragePct >= 50 ? 'rgba(245,190,72,0.12)' : 'rgba(248,113,113,0.12)',
            color: coveragePct >= 80 ? C.confHigh : coveragePct >= 50 ? C.confLow : '#f87171',
          }}>
            {coveragePct}% covered
          </div>
        </div>
      </div>

      {/* Lights */}
      <div style={{ padding: '10px 16px 6px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: steel(0.35), letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
          LIGHTS
        </div>
        {comparison.lights.map((l, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
            borderBottom: i < comparison.lights.length - 1 ? `1px solid ${steel(0.06)}` : 'none',
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
              background: l.owned ? C.confHigh : 'rgba(248,113,113,0.7)',
            }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary, textTransform: 'capitalize' }}>
                {l.role.replace(/_/g, ' ')}
                <TierBadge tier={l.idealTier} />
              </div>
              <div style={{ fontSize: 11, color: steel(0.4) }}>{l.notes}</div>
            </div>
            <span style={{ fontSize: 10, fontWeight: 600, color: l.owned ? C.confHigh : steel(0.3) }}>
              {l.owned ? 'HAVE' : 'NEED'}
            </span>
          </div>
        ))}
      </div>

      {/* Modifiers */}
      <div style={{ padding: '6px 16px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: steel(0.35), letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
          MODIFIERS
        </div>
        {comparison.modifiers.map((m, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
            borderBottom: i < comparison.modifiers.length - 1 ? `1px solid ${steel(0.06)}` : 'none',
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
              background: m.owned ? C.confHigh : 'rgba(248,113,113,0.7)',
            }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary }}>
                {m.type.replace(/_/g, ' ')} ({m.size})
                <TierBadge tier={m.tier} />
              </div>
              <div style={{ fontSize: 11, color: steel(0.4) }}>{m.notes}</div>
            </div>
            <span style={{ fontSize: 10, fontWeight: 600, color: m.owned ? C.confHigh : steel(0.3) }}>
              {m.owned ? 'HAVE' : 'NEED'}
            </span>
          </div>
        ))}
      </div>

      {/* Accessories */}
      <div style={{ padding: '6px 16px 14px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: steel(0.35), letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
          ACCESSORIES
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {comparison.accessories.map(a => (
            <span key={a.key} style={{
              padding: '3px 10px', borderRadius: 5, fontSize: 11, fontWeight: 600,
              background: C.slotBg, color: steel(0.5),
              boxShadow: 'inset 1px 1px 3px rgba(0,0,0,0.4)',
            }}>
              {a.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
