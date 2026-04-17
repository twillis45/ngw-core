/**
 * RecipeScreen — Studio Matte design
 * Curated lighting recipe browser.
 *
 * A photographer's cookbook: browse proven setups by workflow category,
 * preview the lighting pattern, and tap through to load a full setup.
 * Each card shows: pattern thumbnail, name, description, light count,
 * modifier, difficulty, and a "why it works" line.
 *
 * Studio Matte tokens throughout — no CSS variables from the old system.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { tapHaptic, navHaptic } from '../../../utils/haptics';
import { softClickSound, navSlideSound, segmentPressSound } from '../../../utils/sounds';
import { useIsDesktop } from '../../../utils/useIsDesktop';
import { steel, accent, C, FONT_SMOOTH, PANEL_SHADOW, PANEL_BEVEL,
         CTA_BG, CTA_SHADOW, CTA_BEVEL, SCREEN_BG, KEY_ACCENT } from '../../../theme/studioMatte';
import MatteBackground from '../_shared/MatteBackground';
import { RECIPES, RECIPE_CATEGORIES } from '../../../data/recipes';

const DIFFICULTY_LABEL = { 1: 'Easy', 2: 'Moderate', 3: 'Advanced' };
const DIFFICULTY_COLOR = {
  1: 'rgba(140,225,180,0.85)',
  2: 'rgba(245,210,140,0.85)',
  3: 'rgba(230,130,100,0.85)',
};

const MODIFIER_LABEL = {
  beauty_dish: 'Beauty Dish', softbox_rect: 'Softbox', softbox_octa: 'Octabox',
  umbrella: 'Umbrella', ring_light: 'Ring Light', grid_spot: 'Grid',
  on_camera_flash: 'Speedlight', diffusion_panel: 'Diffusion',
  softbox: 'Softbox', stripbox: 'Strip Box', led_panel: 'LED Panel',
};

function humanModifier(modFamily, modifiers) {
  const key = modFamily || modifiers?.[0];
  if (!key) return '';
  return MODIFIER_LABEL[key] || key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Pattern mini diagram (side-view style) ─────────────────────────────────
const PAT_COLOR = KEY_ACCENT;
const DIM_COLOR = steel(0.4);

function PatternDiagram({ pattern }) {
  const shapes = {
    rembrandt: (
      <>
        <circle cx="14" cy="16" r="6" fill={PAT_COLOR} opacity={0.7} />
        <line x1="19" y1="20" x2="27" y2="30" stroke={PAT_COLOR} strokeWidth="1" opacity="0.4" />
        <circle cx="32" cy="38" r="7" stroke={DIM_COLOR} strokeWidth="1.5" fill="none" />
        <circle cx="32" cy="38" r="2" fill={DIM_COLOR} />
      </>
    ),
    loop: (
      <>
        <circle cx="20" cy="14" r="6" fill={PAT_COLOR} opacity={0.7} />
        <line x1="24" y1="19" x2="29" y2="31" stroke={PAT_COLOR} strokeWidth="1" opacity="0.4" />
        <circle cx="32" cy="38" r="7" stroke={DIM_COLOR} strokeWidth="1.5" fill="none" />
        <circle cx="32" cy="38" r="2" fill={DIM_COLOR} />
      </>
    ),
    butterfly: (
      <>
        <circle cx="32" cy="12" r="6" fill={PAT_COLOR} opacity={0.7} />
        <line x1="32" y1="18" x2="32" y2="30" stroke={PAT_COLOR} strokeWidth="1" opacity="0.4" />
        <circle cx="32" cy="38" r="7" stroke={DIM_COLOR} strokeWidth="1.5" fill="none" />
        <circle cx="32" cy="38" r="2" fill={DIM_COLOR} />
        <line x1="26" y1="56" x2="38" y2="56" stroke={DIM_COLOR} strokeWidth="1.5" opacity="0.5" />
      </>
    ),
    clamshell: (
      <>
        <circle cx="32" cy="12" r="6" fill={PAT_COLOR} opacity={0.7} />
        <line x1="32" y1="18" x2="32" y2="30" stroke={PAT_COLOR} strokeWidth="1" opacity="0.4" />
        <circle cx="32" cy="38" r="7" stroke={DIM_COLOR} strokeWidth="1.5" fill="none" />
        <circle cx="32" cy="38" r="2" fill={DIM_COLOR} />
        <circle cx="32" cy="54" r="6" fill={PAT_COLOR} opacity={0.45} />
      </>
    ),
    split: (
      <>
        <circle cx="10" cy="36" r="6" fill={PAT_COLOR} opacity={0.7} />
        <line x1="16" y1="36" x2="24" y2="38" stroke={PAT_COLOR} strokeWidth="1" opacity="0.4" />
        <circle cx="32" cy="38" r="7" stroke={DIM_COLOR} strokeWidth="1.5" fill="none" />
        <circle cx="32" cy="38" r="2" fill={DIM_COLOR} />
      </>
    ),
    high_key: (
      <>
        <circle cx="16" cy="18" r="5" fill={PAT_COLOR} opacity={0.6} />
        <circle cx="48" cy="18" r="5" fill={PAT_COLOR} opacity={0.6} />
        <line x1="20" y1="22" x2="28" y2="31" stroke={PAT_COLOR} strokeWidth="1" opacity="0.3" />
        <line x1="44" y1="22" x2="36" y2="31" stroke={PAT_COLOR} strokeWidth="1" opacity="0.3" />
        <circle cx="32" cy="38" r="7" stroke={DIM_COLOR} strokeWidth="1.5" fill="none" />
        <circle cx="32" cy="38" r="2" fill={DIM_COLOR} />
      </>
    ),
  };

  return (
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
      {shapes[pattern] || shapes.rembrandt}
    </svg>
  );
}

// ─── Category pill selector ─────────────────────────────────────────────────
function CategoryPills({ categories, active, onChange }) {
  const scrollRef = useRef(null);
  return (
    <div ref={scrollRef} style={{
      display: 'flex', gap: 8,
      overflowX: 'auto', WebkitOverflowScrolling: 'touch',
      scrollbarWidth: 'none', msOverflowStyle: 'none',
      padding: '0 2px',
    }}>
      <PillButton
        label="All"
        active={!active}
        onClick={() => { onChange(null); segmentPressSound(); navHaptic(); }}
      />
      {categories.map(cat => (
        <PillButton
          key={cat.value}
          label={cat.label}
          active={active === cat.value}
          onClick={() => { onChange(cat.value); segmentPressSound(); navHaptic(); }}
        />
      ))}
    </div>
  );
}

function PillButton({ label, active, onClick }) {
  const [hover, setHover] = useState(false);
  const isDesktop = useIsDesktop();
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        flexShrink: 0,
        padding: isDesktop ? '8px 16px' : '8px 14px', minHeight: 36, borderRadius: 999,
        border: 'none', cursor: 'pointer',
        backgroundColor: active ? accent(0.15) : (hover ? steel(0.08) : C.divider),
        boxShadow: active
          ? `inset 0 0 0 1px ${accent(0.4)}, 0 1px 3px rgba(0,0,0,0.3)`
          : `inset 0 0 0 1px ${hover && !active ? steel(0.18) : steel(0.12)}, 0 1px 2px rgba(0,0,0,0.2)`,
        fontSize: isDesktop ? 12 : 11, fontWeight: active ? 700 : 600,
        color: active ? KEY_ACCENT : steel(0.65),
        letterSpacing: '0.5px',
        WebkitTapHighlightColor: 'transparent',
        transition: 'all 0.15s ease',
        ...FONT_SMOOTH,
      }}
    >
      {label}
    </button>
  );
}

// ─── Recipe card ─────────────────────────────────────────────────────────────
function RecipeCard({ recipe, onSelect, isDesktop }) {
  const [pressed, setPressed] = useState(false);
  const modLabel = humanModifier(recipe.modifierFamily, recipe.modifiers);
  const diffLabel = DIFFICULTY_LABEL[recipe.difficulty] || '';
  const diffColor = DIFFICULTY_COLOR[recipe.difficulty] || steel(0.6);
  const lightCount = recipe.setupTime?.split('·')[0]?.trim() || '';
  const metaFs = isDesktop ? 11 : 10;

  return (
    <div
      role="button" tabIndex={0}
      onClick={() => { onSelect(recipe); tapHaptic(); softClickSound(); }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(recipe); } }}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      style={{
        width: '100%', textAlign: 'left',
        borderRadius: 14, backgroundColor: C.panelBg,
        boxShadow: pressed
          ? 'inset 0 2px 4px rgba(0,0,0,0.4)'
          : `${PANEL_SHADOW}, ${PANEL_BEVEL}`,
        padding: isDesktop ? '16px 20px' : '14px 16px',
        cursor: 'pointer',
        position: 'relative',
        transform: pressed ? 'scale(0.98)' : 'scale(1)',
        transition: 'transform 0.1s ease, box-shadow 0.1s ease',
        WebkitTapHighlightColor: 'transparent',
        display: 'flex', gap: isDesktop ? 18 : 14, alignItems: 'flex-start',
      }}
    >
      {/* Bevel overlay */}
      <div style={{ position: 'absolute', inset: 0, borderRadius: 14, pointerEvents: 'none', boxShadow: PANEL_BEVEL, zIndex: 10 }} />

      {/* Pattern thumbnail */}
      <div style={{
        flexShrink: 0, width: 64, height: 64, borderRadius: 10,
        backgroundColor: C.pillBg,
        boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5), inset 0 0 6px rgba(0,0,0,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
      }}>
        <PatternDiagram pattern={recipe.pattern} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <p style={{
            margin: 0, fontSize: isDesktop ? 17 : 15, fontWeight: 700,
            color: C.textPrimary, lineHeight: 1.25, letterSpacing: '-0.1px',
            ...FONT_SMOOTH,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            {recipe.name}
          </p>
          {recipe.recommended && (
            <span style={{
              flexShrink: 0, fontSize: 8, fontWeight: 700, letterSpacing: '0.8px',
              color: KEY_ACCENT, ...FONT_SMOOTH,
            }}>★</span>
          )}
        </div>

        {/* Description */}
        <p style={{
          margin: '3px 0 0', fontSize: isDesktop ? 13 : 12, fontWeight: 400,
          color: C.textDim, lineHeight: 1.35, ...FONT_SMOOTH,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {recipe.description}
        </p>

        {/* Meta chips row */}
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {lightCount && (
            <span style={{
              fontSize: metaFs, fontWeight: 600, color: steel(0.6),
              letterSpacing: '0.3px', ...FONT_SMOOTH,
            }}>
              {lightCount}
            </span>
          )}
          {modLabel && (
            <>
              <span style={{ fontSize: metaFs, color: steel(0.25) }}>·</span>
              <span style={{
                fontSize: metaFs, fontWeight: 600, color: steel(0.6),
                letterSpacing: '0.3px', ...FONT_SMOOTH,
              }}>
                {modLabel}
              </span>
            </>
          )}
          {diffLabel && (
            <>
              <span style={{ fontSize: metaFs, color: steel(0.25) }}>·</span>
              <span style={{
                fontSize: metaFs, fontWeight: 600, color: diffColor,
                letterSpacing: '0.3px', ...FONT_SMOOTH,
              }}>
                {diffLabel}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Chevron */}
      <div style={{
        flexShrink: 0, alignSelf: 'center',
        fontSize: 16, color: steel(0.3), lineHeight: 1, ...FONT_SMOOTH,
      }}>
        ›
      </div>
    </div>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function RecipeScreen({ onSelect, onBack, onBuild }) {
  const isDesktop = useIsDesktop();
  const [activeCategory, setActiveCategory] = useState(null);

  // Filter recipes by workflow category
  const filteredRecipes = activeCategory
    ? RECIPES.filter(r => {
        // Map recipe fields to workflow categories
        if (activeCategory === 'headshot') return r.subjectType === 'headshot';
        if (activeCategory === 'event') return r.environment === 'event' || r.category === 'event';
        if (activeCategory === 'studio') return r.environment === 'studio';
        if (activeCategory === 'creative') return r.mood === 'creative' || r.category === 'editorial';
        if (activeCategory === 'video') return r.category === 'video';
        return true;
      })
    : RECIPES;

  // Sort: recommended first, then by name
  const sortedRecipes = [...filteredRecipes].sort((a, b) => {
    if (a.recommended && !b.recommended) return -1;
    if (!a.recommended && b.recommended) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      backgroundColor: SCREEN_BG,
      overflow: 'hidden',
    }}>
      <MatteBackground />

      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: isDesktop ? '16px 40px' : '16px 22px',
        position: 'relative', zIndex: 2,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button aria-label="Back" onClick={() => { tapHaptic(); navSlideSound(); onBack(); }} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: '10px 12px 10px 0', display: 'flex', alignItems: 'center',
            WebkitTapHighlightColor: 'transparent',
            minWidth: 44, minHeight: 44,
          }}>
            <span style={{ fontSize: 22, color: C.textMeta, lineHeight: 1, ...FONT_SMOOTH }}>‹</span>
          </button>
          <p style={{ margin: 0, fontSize: isDesktop ? 11 : 10, fontWeight: 600, color: steel(0.65), letterSpacing: '1.2px', ...FONT_SMOOTH }}>
            LIGHTING RECIPES
          </p>
        </div>
        <p style={{ margin: 0, fontSize: isDesktop ? 13 : 11, fontWeight: 500, color: steel(0.4), ...FONT_SMOOTH }}>
          {sortedRecipes.length} setups
        </p>
      </div>

      {/* ── Category pills ── */}
      <div style={{ padding: isDesktop ? '0 40px 14px' : '0 22px 14px', position: 'relative', zIndex: 2 }}>
        <CategoryPills
          categories={RECIPE_CATEGORIES}
          active={activeCategory}
          onChange={setActiveCategory}
        />
      </div>

      {/* ── Recipe list ── */}
      <div style={{
        flex: 1, overflowY: 'auto',
        padding: isDesktop ? '0 40px 40px' : '0 22px 40px',
        position: 'relative', zIndex: 1,
        display: isDesktop ? 'grid' : 'flex',
        ...(isDesktop
          ? { gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 12, alignContent: 'start' }
          : { flexDirection: 'column', gap: 10 }),
      }}>
        {sortedRecipes.length === 0 ? (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '40px 20px',
          }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: steel(0.4), textAlign: 'center', ...FONT_SMOOTH }}>
              No recipes in this category yet.
            </p>
          </div>
        ) : (
          <>
            {sortedRecipes.map(recipe => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                onSelect={onSelect}
                isDesktop={isDesktop}
              />
            ))}
            {/* Build-your-own escape hatch */}
            {onBuild && (
              <div
                role="button" tabIndex={0}
                onClick={() => { onBuild(); tapHaptic(); softClickSound(); }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onBuild(); } }}
                style={{
                  width: '100%', textAlign: 'center',
                  borderRadius: 14, padding: '18px 20px',
                  border: `1px dashed ${steel(0.15)}`,
                  background: steel(0.03),
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  WebkitTapHighlightColor: 'transparent',
                  ...(isDesktop ? { gridColumn: '1 / -1' } : {}),
                }}
              >
                <span style={{ fontSize: 16, color: steel(0.35), lineHeight: 1 }}>+</span>
                <span style={{
                  fontSize: isDesktop ? 13 : 12, fontWeight: 600, color: steel(0.45),
                  letterSpacing: '0.5px', ...FONT_SMOOTH,
                }}>
                  Build from Scratch
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {/* iOS home indicator */}
      <div style={{ height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 1 }}>
        <div style={{ width: 134, height: 5, borderRadius: 3, backgroundColor: C.homeBar }} />
      </div>
    </div>
  );
}
