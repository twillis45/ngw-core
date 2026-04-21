/**
 * ResultCards — Studio Matte renderers for engine-built result cards.
 *
 * Consumes the `cards` dict produced by
 * engine.services.shoot_match_service._build_cards() and surfaces four
 * sections that Studio Matte did not previously render:
 *
 *   1. OtherSetupsCard     — cards.otherSetups           (top_picks[1:4])
 *   2. SubstitutionsCard   — cards.substitutions.items   (if_missing/use/tradeoff)
 *   3. QuickFixesCard      — cards.quickFixes.fixes      (catchlight fixes)
 *   4. WhatToLookForCard   — cards.whatToLookFor         (goodSigns + warnings)
 *
 * Every card bails out with `null` when its data slot is empty, so callers
 * can drop them unconditionally next to existing panels.
 *
 * Visual language mirrors SetupScreen's panel idiom:
 *   - borderRadius 14 + PANEL_SHADOW + PANEL_BEVEL overlay
 *   - RowLabel at top (10px, steel(0.65), 1px tracking, uppercase)
 *   - C.panelBg background, C.textPrimary / C.textSub body copy
 *   - WARM_PRIMARY accent used sparingly for warning markers only
 */
import {
  C, steel, FONT_SMOOTH, PANEL_SHADOW, PANEL_BEVEL, WARM_PRIMARY,
} from '../../../../theme/studioMatte';

// ─── Local primitives ───────────────────────────────────────────────────────
function RowLabel({ children }) {
  return (
    <p style={{
      margin: 0, fontSize: 11, fontWeight: 600,
      color: steel(0.65), letterSpacing: '1px',
      textTransform: 'uppercase', ...FONT_SMOOTH,
    }}>
      {children}
    </p>
  );
}

function CardPanel({ label, children }) {
  return (
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
      <div style={{ padding: '12px 16px' }}>
        <RowLabel>{label}</RowLabel>
        <div style={{ marginTop: 10 }}>{children}</div>
      </div>
    </div>
  );
}

// ─── 1. Other Setups ────────────────────────────────────────────────────────
// Props: { items: [{ name, score, reason }] }
export function OtherSetupsCard({ items }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <CardPanel label="OTHER SETUPS YOU COULD TRY">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map((it, i) => (
          <div key={i} style={{
            display: 'flex', flexDirection: 'column', gap: 4,
            paddingBottom: i < items.length - 1 ? 10 : 0,
            borderBottom: i < items.length - 1 ? `1px solid ${steel(0.08)}` : 'none',
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{
                flex: 1, fontSize: 14, fontWeight: 600,
                color: C.textPrimary, ...FONT_SMOOTH,
              }}>
                {it.name}
              </span>
              {/* Raw engine `score` intentionally NOT surfaced — it is the
                  selector's absolute scoring output (thousands-range), not a
                  0-100 reliability. `it.reason` carries the photographer-
                  meaningful relative signal (e.g. "behind by 2.6 points"). */}
            </div>
            {it.reason && (
              <span style={{
                fontSize: 12, fontWeight: 400, color: C.textSub,
                lineHeight: 1.45, ...FONT_SMOOTH,
              }}>
                {it.reason}
              </span>
            )}
          </div>
        ))}
      </div>
    </CardPanel>
  );
}

// ─── 2. Substitutions ───────────────────────────────────────────────────────
// Props: { items: [{ ifMissing, use, tradeoff }] }
export function SubstitutionsCard({ items }) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <CardPanel label="IF YOU DON'T HAVE…">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {items.map((sub, i) => (
          <div key={i} style={{
            display: 'flex', flexDirection: 'column', gap: 4,
            paddingBottom: i < items.length - 1 ? 12 : 0,
            borderBottom: i < items.length - 1 ? `1px solid ${steel(0.08)}` : 'none',
          }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
              <span style={{
                fontSize: 11, fontWeight: 700,
                color: steel(0.55), letterSpacing: '0.8px',
                minWidth: 48, ...FONT_SMOOTH,
              }}>
                MISSING
              </span>
              <span style={{
                flex: 1, fontSize: 14, fontWeight: 500,
                color: C.textPrimary, ...FONT_SMOOTH,
              }}>
                {sub.ifMissing}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
              <span style={{
                fontSize: 11, fontWeight: 700,
                color: steel(0.55), letterSpacing: '0.8px',
                minWidth: 48, ...FONT_SMOOTH,
              }}>
                USE
              </span>
              <span style={{
                flex: 1, fontSize: 14, fontWeight: 500,
                color: C.textPrimary, ...FONT_SMOOTH,
              }}>
                {sub.use}
              </span>
            </div>
            {sub.tradeoff && (
              <p style={{
                margin: '4px 0 0 58px',
                fontSize: 12, fontWeight: 400,
                color: C.textSub, lineHeight: 1.45,
                ...FONT_SMOOTH,
              }}>
                {sub.tradeoff}
              </p>
            )}
          </div>
        ))}
      </div>
    </CardPanel>
  );
}

// ─── 3. Quick Fixes ─────────────────────────────────────────────────────────
// Props: { items: string[], fixOrder?: string[] }
export function QuickFixesCard({ items, fixOrder }) {
  const fixes = Array.isArray(items) ? items : [];
  const order = Array.isArray(fixOrder) ? fixOrder : [];
  if (fixes.length === 0 && order.length === 0) return null;
  return (
    <CardPanel label="QUICK FIXES">
      {fixes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {fixes.map((fix, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{
                width: 6, height: 6, borderRadius: 3,
                backgroundColor: WARM_PRIMARY, flexShrink: 0,
                marginTop: 6, opacity: 0.85,
              }} />
              <span style={{
                flex: 1, fontSize: 14, fontWeight: 400,
                color: C.textSub, lineHeight: 1.5, ...FONT_SMOOTH,
              }}>
                {fix}
              </span>
            </div>
          ))}
        </div>
      )}
      {order.length > 0 && (
        <div style={{
          marginTop: fixes.length > 0 ? 14 : 0,
          paddingTop: fixes.length > 0 ? 12 : 0,
          borderTop: fixes.length > 0 ? `1px solid ${steel(0.08)}` : 'none',
        }}>
          <p style={{
            margin: '0 0 8px', fontSize: 11, fontWeight: 700,
            color: steel(0.55), letterSpacing: '0.8px', ...FONT_SMOOTH,
          }}>
            FIX ORDER
          </p>
          <ol style={{
            margin: 0, paddingLeft: 18,
            display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            {order.map((step, i) => (
              <li key={i} style={{
                fontSize: 14, fontWeight: 400, color: C.textSub,
                lineHeight: 1.5, ...FONT_SMOOTH,
              }}>
                {step}
              </li>
            ))}
          </ol>
        </div>
      )}
    </CardPanel>
  );
}

// ─── 4. What to Look For ────────────────────────────────────────────────────
// Props: { goodSigns: string[], warnings: string[] }
export function WhatToLookForCard({ goodSigns, warnings }) {
  const good = Array.isArray(goodSigns) ? goodSigns : [];
  const warn = Array.isArray(warnings) ? warnings : [];
  if (good.length === 0 && warn.length === 0) return null;
  return (
    <CardPanel label="WHAT TO LOOK FOR">
      {good.length > 0 && (
        <div>
          <p style={{
            margin: '0 0 8px', fontSize: 11, fontWeight: 700,
            color: steel(0.55), letterSpacing: '0.8px', ...FONT_SMOOTH,
          }}>
            GOOD SIGNS
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {good.map((sign, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{
                  fontSize: 11, color: steel(0.75), flexShrink: 0,
                  marginTop: 1, ...FONT_SMOOTH,
                }}>
                  ✓
                </span>
                <span style={{
                  flex: 1, fontSize: 13, fontWeight: 400,
                  color: C.textSub, lineHeight: 1.45, ...FONT_SMOOTH,
                }}>
                  {sign}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      {warn.length > 0 && (
        <div style={{
          marginTop: good.length > 0 ? 14 : 0,
          paddingTop: good.length > 0 ? 12 : 0,
          borderTop: good.length > 0 ? `1px solid ${steel(0.08)}` : 'none',
        }}>
          <p style={{
            margin: '0 0 8px', fontSize: 11, fontWeight: 700,
            color: steel(0.55), letterSpacing: '0.8px', ...FONT_SMOOTH,
          }}>
            WATCH FOR
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {warn.map((w, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{
                  fontSize: 11, color: WARM_PRIMARY, flexShrink: 0,
                  marginTop: 1, fontWeight: 700, ...FONT_SMOOTH,
                }}>
                  !
                </span>
                <span style={{
                  flex: 1, fontSize: 13, fontWeight: 400,
                  color: C.textSub, lineHeight: 1.45, ...FONT_SMOOTH,
                }}>
                  {w}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </CardPanel>
  );
}
