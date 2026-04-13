import { useState, useEffect, useRef } from 'react';
import HomeScreen from './studio/_core/HomeScreen';
import ProcessingScreen from './studio/_core/ProcessingScreen';
import ResultScreen from './studio/_core/ResultScreen';
import SetupScreen from './studio/_core/SetupScreen';
import Day1ShootScreen from './studio/_adjacent/Day1ShootScreen';
import StudioLoginScreen from './studio/_adjacent/StudioLoginScreen';
import FitToViewport from './studio/_shared/FitToViewport';
import Day1SettingsScreen from './studio/_deferred/Day1SettingsScreen';
import { analyzeImage } from '../data/labApi';
import { getUser, clearAuth } from '../data/authApi';
import { steel, C, FONT_SMOOTH as FS, VIEWFINDER_INNER_SHADOW, GLASS_REFLECTION, LENS_VIGNETTE } from '../theme/studioMatte';
import { Panel, CtaButton, HomeIndicator } from './studio/_core/components';
import { tapHaptic, warnHaptic } from '../utils/haptics';
import { softClickSound } from '../utils/sounds';
import { LAYOUT_DESKTOP_MIN } from '../utils/useIsDesktop';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

/** Downsample an image file via canvas if it exceeds the size limit. */
function downsampleImage(file, maxBytes) {
  return new Promise((resolve) => {
    if (file.size <= maxBytes) return resolve(file);
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      // Scale factor to roughly hit target size (JPEG ~8:1 from raw pixels)
      const ratio = Math.sqrt(maxBytes / file.size);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) return resolve(file);
          const smaller = new File([blob], file.name, { type: 'image/jpeg' });
          // If still too big, recurse with lower quality
          if (smaller.size > maxBytes) {
            canvas.toBlob(
              (blob2) => resolve(blob2 ? new File([blob2], file.name, { type: 'image/jpeg' }) : smaller),
              'image/jpeg', 0.6
            );
          } else {
            resolve(smaller);
          }
        },
        'image/jpeg', 0.82
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

/**
 * Day 1 Demo App
 * Studio Matte design — matches Figma prototype (file: YQgGd8KZyZoXzZwJV7p4b6, Studio Matte Theme page)
 * Flow: Home → Processing → Result (High/Low confidence) → Save Setup
 *
 * Wired to real analysis engine: POST /api/lab/analyze
 */

/**
 * Display rule for lighting patterns + modifiers: capital first letter on
 * each word, no underscores (Title Case — e.g. "ring_light" → "Ring Light",
 * "beauty_dish" → "Beauty Dish", "softbox_rect" → "Softbox Rect").
 */
function toTitleCase(str) {
  if (!str) return '';
  return String(str)
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase());
}

// Engine modifier slugs → photographer-friendly display names.
// Used so result UIs never show raw tokens like "softbox_rect" or
// the awkward title-cased "Softbox Rect".
const MODIFIER_DISPLAY = {
  softbox_rect:    'Rectangular Softbox',
  softbox_oct:     'Octa Softbox',
  octabox:         'Octa Softbox',
  beauty_dish:     'Beauty Dish',
  ring_light:      'Ring Light',
  strip_box:       'Strip Box',
  stripbox:        'Strip Box',
  umbrella:        'Umbrella',
  umbrella_shoot:  'Shoot-Through Umbrella',
  umbrella_bounce: 'Bounce Umbrella',
  parabolic:       'Parabolic Reflector',
  hard_source:     'Bare Hard Source',
  bare_bulb:       'Bare Bulb',
  bare_strobe:     'Bare Strobe',
  reflector:       'Reflector',
  scrim:           'Scrim / Diffuser',
  window:          'Window Light',
};

function prettyModifierLabel(raw) {
  if (!raw) return '';
  const key = String(raw).toLowerCase().trim().replace(/\s+/g, '_');
  if (MODIFIER_DISPLAY[key]) return MODIFIER_DISPLAY[key];
  // Fallback: cleanup engine slug heuristically.
  // "softbox rect" / "rect softbox" → "Rectangular Softbox"
  const lc = String(raw).toLowerCase();
  if (lc.includes('softbox') && lc.includes('rect')) return 'Rectangular Softbox';
  if (lc.includes('softbox') && (lc.includes('oct') || lc.includes('octa'))) return 'Octa Softbox';
  if (lc.includes('softbox') && lc.includes('strip')) return 'Strip Box';
  return toTitleCase(raw);
}

function displayPattern(name) {
  if (!name) return 'Unknown';
  return toTitleCase(name);
}

/** Map API response → ResultScreen prop shape */
function mapApiResult(data) {
  const li = data.lighting_inference || {};
  const ci = li.catchlight_intelligence || {};
  const sd = data.signal_diagnostics || {};
  const signals = sd.signals || {};

  // Confidence: API returns 0–1 float → display as 0–100 int
  const confidence = Math.round((data.authoritative_confidence || 0) * 100);
  const pattern = displayPattern(data.authoritative_pattern);

  // Meta pills — short descriptors from lighting inference.  Pattern/modifier
  // display rule: Title Case, no underscores.
  const fillPill = (() => {
    const f = li.fill_method_text || '';
    if (!f || f === 'none') return null;
    const label = f === 'bilateral' ? 'Bilateral Fill'
      : f === 'unilateral' ? 'Unilateral Fill'
      : f === 'bounce'     ? 'Bounce Fill'
      : null;
    return label;
  })();
  const meta = [
    li.key_position_text ? toTitleCase(li.key_position_text) : null,
    li.modifier_family   ? prettyModifierLabel(li.modifier_family) : null,
    li.light_count ? `${li.light_count} light${li.light_count !== 1 ? 's' : ''}` : null,
    fillPill,
    // Environment only if non-studio (studio is assumed, not informative as a pill)
    li.detected_environment && li.detected_environment !== 'studio'
      ? toTitleCase(li.detected_environment) : null,
  ].filter(Boolean);

  // Pattern candidates — use real resolver output from engine.
  // API returns data.pattern_candidates with primary_candidate + alternate_candidates,
  // each carrying an actual confidence value from the resolver stack.
  // Fall back to legacy signal_diagnostics proxies only when resolver data is absent.
  const pc = data.pattern_candidates || {};
  const pcAlternates = pc.alternate_candidates || [];
  const candidates = [{ name: pattern, score: confidence }];

  for (const alt of pcAlternates.slice(0, 2)) {
    const altName = displayPattern(alt.pattern);
    if (!altName) continue;
    if (altName.toLowerCase() === candidates[0].name.toLowerCase()) continue;
    const altScore = Math.round((alt.confidence || 0) * 100);
    // Only show alternate if it has a meaningfully different score (avoid near-dupes)
    if (altScore > 0 && altScore < confidence) {
      candidates.push({ name: altName, score: altScore });
    }
  }

  // Legacy fallbacks if resolver gave no alternates.
  // Guard against junk placeholders (empty / "unknown" / "none") — we'd rather
  // show a single real candidate than a fake alternate labelled "Unknown".
  const isJunkPattern = (p) => {
    const s = (p || '').toLowerCase().trim();
    return !s || s === 'unknown' || s === 'none' || s === 'n/a';
  };
  if (candidates.length < 2) {
    const sdFinal = sd.final_pattern || '';
    if (!isJunkPattern(sdFinal) && sdFinal !== data.authoritative_pattern) {
      candidates.push({ name: displayPattern(sdFinal), score: Math.round(confidence * 0.65) });
    }
  }
  if (candidates.length < 2) {
    const shadowPassPattern = signals.shadow_pass_pattern || '';
    const existingNames = candidates.map(c => c.name.toLowerCase());
    if (!isJunkPattern(shadowPassPattern) && !existingNames.includes(displayPattern(shadowPassPattern).toLowerCase())) {
      candidates.push({ name: displayPattern(shadowPassPattern), score: Math.round(confidence * 0.5) });
    }
  }

  // Shadow analysis — build from reference_analysis.lighting_read which carries structured
  // human-readable fields: source_quality, shadow_pattern, fill_presence, rim_presence,
  // key_observations.  This is the authoritative physical read of the light.
  // Fall back to li.notes (engine debug notes) then to raw signal metrics.
  const lightingRead = data.reference_analysis?.lighting_read || {};
  let shadowAnalysis = '';
  // Structured fields extracted from lighting_read so the ResultScreen can
  // render them as graphics (component chips, directional compass, multi-dot
  // catchlight eye) instead of dumping the raw narrative as a wall of text.
  let shadowComponents = null;   // { source, fill, rim, pattern }
  let shadowDirection  = null;   // { shadowQuadrant, keyQuadrant, keyIntensity }
  let catchlightPositions = null; // string[] — clock hours parsed from observations
  let shadowEdgeNote   = null;    // "Soft shadow edges → large/diffused source"

  // Parse a "key_observations" string to pull directional cues + catchlight
  // arrays OUT of the narrative so they can be rendered visually.
  const DIR_QUADRANTS = ['upper_left','upper_right','lower_left','lower_right','left','right','above','below','front','back'];
  const parseDirectionalObs = (obs) => {
    const m = /shadow(?:s)?\s+fall[s]?\s+([a-z_]+)\s*(?:→|->|to)\s*key\s*light\s*at\s+([a-z_]+)(?:\s*\(([-\d.]+)\))?/i.exec(obs);
    if (!m) return null;
    return {
      shadowQuadrant: m[1].replace(/_/g,' '),
      keyQuadrant:    m[2].replace(/_/g,' '),
      keyIntensity:   m[3] ? parseFloat(m[3]) : null,
    };
  };
  const parseCatchlightObs = (obs) => {
    const m = /catchlight\s+positions?\s*:?\s*\[([^\]]+)\]/i.exec(obs);
    if (!m) return null;
    return m[1].split(',').map(s => s.replace(/['"]/g,'').trim()).filter(Boolean);
  };
  const isEdgeObs = (obs) => /shadow\s+edge/i.test(obs);

  if (lightingRead.shadow_pattern || lightingRead.source_quality) {
    // Lead sentence — the physical headline.
    const lead = (() => {
      if (lightingRead.source_quality && lightingRead.shadow_pattern) {
        return `${toTitleCase(lightingRead.source_quality)} source with ${toTitleCase(lightingRead.shadow_pattern)} shadow pattern`;
      }
      if (lightingRead.shadow_pattern) return `${toTitleCase(lightingRead.shadow_pattern)} shadow pattern`;
      if (lightingRead.source_quality) return `${toTitleCase(lightingRead.source_quality)} source`;
      return null;
    })();

    // Structured components — these render as chips so they get pulled OUT of
    // the narrative string below.
    shadowComponents = {
      source:  lightingRead.source_quality ? toTitleCase(lightingRead.source_quality) : null,
      pattern: lightingRead.shadow_pattern ? toTitleCase(lightingRead.shadow_pattern) : null,
      fill:    (lightingRead.fill_presence && !['none','unknown'].includes(lightingRead.fill_presence))
        ? lightingRead.fill_presence : null,
      rim:     (lightingRead.rim_presence && !['none','unknown'].includes(lightingRead.rim_presence))
        ? lightingRead.rim_presence : null,
    };

    // Observations — triage into directional / catchlight / edge / other so
    // each one lands in the right visual home.
    const rawObs = (lightingRead.key_observations || []).filter(o => o && o.length < 200);
    const otherObs = [];
    // The engine emits a vertical prefix on shadow direction by comparing
    // upper-vs-lower face brightness, but that test only fires when the
    // bottom of the face is dramatically brighter (>25 luma diff).  In every
    // other case it defaults to "upper_*" — which is misleading because the
    // shadow physically falls on the LOWER side of the face whenever the
    // key is above the subject (which is the dominant case).  We post-fix
    // the parsed quadrant against the engine's `key_elevation` so the
    // DirectionalCompass shows the physically correct cell.
    // Determine whether the key sits ABOVE or BELOW the subject.  Prefer the
    // engine's explicit key_elevation; when it's absent (common — the engine
    // frequently leaves it blank), assume "above" because ~95% of real-world
    // lighting setups put the key at or above eye level.  The only case this
    // assumption is wrong is intentional uplighting / horror lighting, which
    // the engine normally flags via the shadow_pattern narrative anyway.
    const _keyElevRaw = (li.key_elevation || li.key_height || '').toLowerCase();
    const _keyAbove =
      _keyElevRaw === 'high' || _keyElevRaw === 'medium' || _keyElevRaw === ''
        ? true
        : _keyElevRaw === 'low' ? false : true;
    for (const o of rawObs) {
      const dir = parseDirectionalObs(o);
      if (dir) {
        // Physics rule: the shadow's vertical band is OPPOSITE the key's
        // vertical band — high key → shadow falls low, low key → shadow
        // falls high.  The horizontal axis is unchanged.  The engine often
        // emits "shadow falls upper_* → key light at upper_*" for a
        // loop-standard test image because its vertical inference only
        // flips when the bottom of the face is dramatically brighter
        // (>25 luma diff).  Post-fix here so the DirectionalCompass cell
        // lands in the physically correct quadrant.
        if (_keyAbove) {
          dir.shadowQuadrant = (dir.shadowQuadrant || '').replace(/^upper /, 'lower ');
          dir.keyQuadrant    = (dir.keyQuadrant    || '').replace(/^lower /, 'upper ');
        } else {
          dir.shadowQuadrant = (dir.shadowQuadrant || '').replace(/^lower /, 'upper ');
          dir.keyQuadrant    = (dir.keyQuadrant    || '').replace(/^upper /, 'lower ');
        }
        shadowDirection = dir;
        continue;
      }
      const cl = parseCatchlightObs(o);
      if (cl) { catchlightPositions = cl; continue; }
      if (isEdgeObs(o)) { shadowEdgeNote = o; continue; }
      if (/shadow_pattern_detail|loop|rembrandt|split/i.test(o) && o.length < 40) continue; // noise
      otherObs.push(o);
    }

    // Detail line — only attach shadow_pattern_detail if it adds information
    // beyond the lead pattern name.
    const detailLine = (lightingRead.shadow_pattern_detail && lightingRead.shadow_pattern_detail.toLowerCase() !== (lightingRead.shadow_pattern || '').toLowerCase())
      ? lightingRead.shadow_pattern_detail : null;

    // Ambiguity — surface uncertainty when present, but cap at one.
    const amb = (lightingRead.ambiguity_notes || []).filter(o => o && !o.startsWith('[VLW'));

    const parts = [];
    if (lead) parts.push(lead);
    if (detailLine) parts.push(detailLine);
    parts.push(...otherObs.slice(0, 2));
    if (amb.length > 0 && parts.length < 3) parts.push(amb[0]);

    shadowAnalysis = parts.join('. ').trim();
    if (shadowAnalysis && !shadowAnalysis.endsWith('.')) shadowAnalysis += '.';
  }

  if (!shadowAnalysis && li.notes && li.notes.length > 0) {
    shadowAnalysis = li.notes.join('. ');
  }

  if (!shadowAnalysis) {
    const parts = [];
    if (signals.shadow_pass_pattern) parts.push(`Shadow: ${toTitleCase(signals.shadow_pass_pattern)}`);
    if (signals.nose_shadow_angle_deg != null) parts.push(`nose shadow at ${signals.nose_shadow_angle_deg}°`);
    if (signals.left_right_asymmetry != null) parts.push(`L/R asymmetry ${(signals.left_right_asymmetry * 100).toFixed(0)}%`);
    shadowAnalysis = parts.join('. ') || 'Shadow analysis complete.';
  }

  // Catchlight & modifier — build from catchlight intelligence.  Modifier
  // family/shape names follow the Title Case display rule.
  let catchlightModifier = '';
  if (ci && ci.modifier) {
    const mod = ci.modifier;
    const modName = prettyModifierLabel(mod.type || mod.family || li.modifier_family || mod.label || 'Unknown');
    catchlightModifier = `${modName} ${mod.size_estimate || mod.size_label || ''}`.trim();
    if (ci.primary_key) {
      const pk = ci.primary_key;
      catchlightModifier += `. Key catchlight at ${pk.position || 'unknown'}, ${toTitleCase(pk.shape || '') || 'unknown'} shape`;
    }
  } else if (li.modifier_family) {
    catchlightModifier = prettyModifierLabel(li.modifier_family);
    if (sd.catchlights && sd.catchlights.length > 0) {
      const first = sd.catchlights[0];
      if (first.position) catchlightModifier += ` — catchlight at ${first.position}`;
      if (first.shape) catchlightModifier += `, ${toTitleCase(first.shape)} shape`;
    }
  } else {
    catchlightModifier = 'Modifier analysis complete.';
  }

  // Structured modifier data — size range + distance guidance derived from size class.
  // Columns: oct (octabox), rect (rectangular softbox), strip (strip box), bd (beauty dish).
  // Distances are shared across modifier types at a given size class.
  const SIZE_RANGES = {
    'small':  { oct: '24"–36"',   rect: '12"×16" – 16"×22"', strip: '9"×24" – 12"×36"', bd: '16"–18"',  dist: '3–6 ft',  optimal: '4–5 ft' },
    'medium': { oct: '36"–48"',   rect: '24"×30" – 24"×36"', strip: '12"×48" – 16"×60"', bd: '20"–22"', dist: '4–8 ft',  optimal: '5–7 ft' },
    'large':  { oct: '48"–60"',   rect: '36"×48" – 36"×60"', strip: '20"×60" – 36"×90"', bd: '27"–32"', dist: '5–10 ft', optimal: '6–8 ft' },
    'xl':     { oct: '60"–80"',   rect: '36"×72" – 48"×72"', strip: '36"×90"+',            bd: '32"+',    dist: '6–12 ft', optimal: '8–10 ft' },
    'xxl':    { oct: '60"–80"+',  rect: '48"×80" – 60"×84"', strip: '36"×90"+',            bd: null,      dist: '8–14 ft', optimal: '10–12 ft' },
  };

  // Resolve which SIZE_RANGES column to use based on modifier family slug.
  function modSizeCol(slug) {
    const s = (slug || '').toLowerCase();
    if (s.includes('strip'))           return 'strip';
    if (s.includes('beauty') || s.includes('beauty_dish')) return 'bd';
    if (s.includes('oct'))             return 'oct';
    return 'rect'; // softbox, umbrella, parabolic, unknown → rect as best proxy
  }

  let modifierData = null;
  const ciMod = ci?.modifier || {};
  // API returns: type, label, size_class, size_estimate, distance_est_ft, distance_class
  // Also check legacy field names: family, size_label
  const modFamily = (ciMod.type || ciMod.family || li.modifier_family || '').toLowerCase();
  const modSizeClass = (ciMod.size_class || '').toLowerCase();
  const modSizeRaw = (ciMod.size_label || ciMod.label || '').toLowerCase().replace(/\s+/g, '');
  // Penumbra apparent source size — fallback when no catchlight size info.
  // Maps shadow-edge width to modifier size class (independent of eye visibility).
  const PENUMBRA_SIZE_MAP = { small: 'small', medium: 'medium', large: 'large', very_large: 'xl' };
  const penumbraSize = li.penumbra_source_size ? PENUMBRA_SIZE_MAP[li.penumbra_source_size] || null : null;
  const sizeKey = modSizeClass || ['xxl','xl','large','medium','small'].find(k => modSizeRaw.includes(k)) || penumbraSize || null;
  if (modFamily || sizeKey) {
    const col    = modSizeCol(modFamily);
    const ranges = sizeKey ? SIZE_RANGES[sizeKey] : null;
    // Prefer engine-computed distance over lookup table
    const engineDist = ciMod.distance_est_ft || null;
    // family  = human-readable label ("Small Softbox") — shown as hero text
    // sizeRange = dimensional estimate shown as sub-line; pick type-specific column
    const _slug  = ciMod.type || ciMod.family || li.modifier_family || '';
    const _label = _slug
      ? prettyModifierLabel(_slug)
      : (ciMod.label ? toTitleCase(ciMod.label) : 'Unknown Modifier');
    const _pk = ci?.primary_key || {};
    modifierData = {
      family:     _label,
      sizeLabel:  null,
      sizeRange:  ciMod.size_estimate || (ranges ? (ranges[col] ?? ranges.rect) : null),
      position:   _pk.position || null,
      positionQuad: _pk.quad ? _pk.quad.replace(/_/g, ' ') : null,
      positionIntensity: _pk.intensity != null ? `${Math.round(_pk.intensity * 100)}% intensity` : null,
      shape:      toTitleCase(_pk.shape || ciMod.shape || '') || null,
      catchlightSize: _pk.size_ratio != null ? `${(_pk.size_ratio * 100).toFixed(1)}% iris` : null,
      distRange:  engineDist || ranges?.dist || null,
      optDist:    ranges?.optimal || null,
      distQuality: ciMod.distance_quality || null,
      lightCount: li.light_count || null,
      angularArea: ciMod.total_relative_area != null
        ? `${ciMod.total_relative_area.toFixed(3)} ir²` : null,
      physicalMeaning: ciMod.physical_meaning || null,
    };
  }

  // Modifier fallback — when catchlight intelligence is absent (e.g. closed eyes,
  // obscured face) but lighting inference has useful data, build a partial block
  // so the modifier panel always shows something actionable.
  if (!modifierData) {
    const hasLiData = li.light_count || li.key_position_text || li.modifier_family || li.source_quality;
    if (hasLiData) {
      const fallbackSlug = li.modifier_family || '';
      const fallbackSizeKey = penumbraSize;
      const fallbackRanges = fallbackSizeKey ? SIZE_RANGES[fallbackSizeKey] : null;
      const fallbackCol = modSizeCol(fallbackSlug);
      modifierData = {
        family:          fallbackSlug ? prettyModifierLabel(fallbackSlug) : 'Modifier Unresolved',
        sizeLabel:       null,
        sizeRange:       fallbackRanges ? (fallbackRanges[fallbackCol] ?? fallbackRanges.rect) : null,
        position:        li.key_position_text ? toTitleCase(li.key_position_text) : null,
        shape:           null,
        distRange:       fallbackRanges?.dist || null,
        optDist:         fallbackRanges?.optimal || null,
        distQuality:     null,
        lightCount:      li.light_count || null,
        angularArea:     null,
        physicalMeaning: 'Catchlight obscured — modifier estimated from shadow and source analysis only.',
      };
    }
  }

  // Scene description — from reference_analysis.image_read.
  // Prefer a pre-composed narrative.  If absent, compose from structured fields
  // so the SCENE panel always has something meaningful.
  const imageRead = data.reference_analysis?.image_read || {};
  let sceneDescription = (
    imageRead.narrative ||
    imageRead.scene_description ||
    ''
  ).trim();

  if (!sceneDescription) {
    const parts = [];
    if (imageRead.subject_type) parts.push(toTitleCase(imageRead.subject_type));
    if (imageRead.genre && imageRead.genre !== imageRead.subject_type)
      parts.push(toTitleCase(imageRead.genre));
    if (imageRead.mood) parts.push(`${imageRead.mood} mood`);
    if (imageRead.contrast_shadow_feel) parts.push(imageRead.contrast_shadow_feel);
    if (imageRead.pose_notes) parts.push(imageRead.pose_notes);
    sceneDescription = parts.join(', ').trim();
  }

  // ── Pattern source attribution ──────────────────────────────────────────────
  // Tells the photographer how the authoritative pattern was resolved —
  // i.e. which layer of the engine stack "won".
  const SOURCE_LABELS = {
    reference_read:     'full analysis',
    lighting_inference: 'catchlight analysis',
    definitive_sig:     'definitive signal',
    cue_inference:      'shadow analysis',
    light_structure:    'geometry analysis',
  };
  const patternSource    = SOURCE_LABELS[data.authoritative_pattern_source] || null;
  const confidenceLabel  = data.authoritative_confidence_label || null; // "strong" | "partial" | "weak"

  // ── Edge case warnings ───────────────────────────────────────────────────────
  // Surfaces analysis caveats before the photographer commits to "Set Up This Light".
  const EDGE_FLAGS = {
    blown_highlights:               { label: 'Blown Highlights',    sev: 'warn',
      detail: 'Specular highlights are clipped to pure white. The engine cannot recover catchlight position or modifier shape from those pixels — diagram angles are estimated from shadows alone.' },
    mixed_color_temperature:        { label: 'Mixed CCT',           sev: 'info',
      detail: 'Key and fill (or ambient) light have different color temperatures. Pattern detection is unaffected, but white balance and palette readouts will reflect the dominant source.' },
    outdoor_foliage_shadows:        { label: 'Foliage Shadows',     sev: 'info',
      detail: 'Dappled light from tree cover creates broken shadow edges that are not from the key light. The shadow analyzer compensates, but density readouts may run high.' },
    window_light_gradient:          { label: 'Window Gradient',     sev: 'info',
      detail: 'Light falls off across the subject because the source is large and close. Treat the diagram distance as a guide, not literal — the inverse-square slope is steep here.' },
    extreme_low_key:                { label: 'Extreme Low Key',     sev: 'info',
      detail: 'Most of the frame sits in deep shadow. Pattern confidence is lower because the engine has fewer mid-tone pixels to triangulate the key direction from.' },
    bw_processing:                  { label: 'B&W Detected',        sev: 'info',
      detail: 'Image is monochrome, so the color palette panel is suppressed. Shadow density and direction still read normally.' },
    earring_catchlight_contamination: { label: 'Catchlight Noise',  sev: 'warn',
      detail: 'Reflective jewelry near the eye is producing false catchlights that confuse modifier detection. Trust the shadow-derived light angle over the catchlight-derived one.' },
  };
  const edgeCaseWarnings = [];
  const rawFlags = data.edge_case_flags || {};
  Object.entries(EDGE_FLAGS).forEach(([k, v]) => {
    if (rawFlags[k]) edgeCaseWarnings.push(v);
  });

  // ── Color palette ────────────────────────────────────────────────────────────
  // Dominant colors, harmony, warm/cool CCT split from reference_analysis.
  const cpRaw = data.reference_analysis?.color_palette || null;
  const colorPalette = cpRaw ? {
    colors:       (cpRaw.dominant_colors   || []).slice(0, 5),
    hexes:        (cpRaw.dominant_color_hexes || []).slice(0, 5),
    harmony:      cpRaw.color_harmony     || null,
    warmCool:     !!cpRaw.warm_cool_split,
    cctKey:       cpRaw.color_temperature_key    || null,
    cctShadows:   cpRaw.color_temperature_shadows || null,
    character:    cpRaw.palette_character  || null,
  } : null;

  // ── Signal quality / confidence detail ──────────────────────────────────────
  // signal_coverage lives at data.observability.signal_coverage in the real API.
  // perception_explanation / signal_reliability are legacy top-level keys kept for compat.
  const sc = data.observability?.signal_coverage || data.signal_reliability || {};
  const pe = data.perception_explanation || {};
  const passSummaries = data.solver?.signal_reliability?.pass_summaries || null;
  const signalQuality = (sc.signals_available != null || pe.pattern_reasoning) ? {
    strength:      sc.overall_strength ?? sc.overall_signal_strength ?? null,
    available:     sc.signals_available ?? null,
    total:         sc.signals_total ?? null,
    supporting:    (pe.supporting_signals    || sc.weak_signals || []).slice(0, 4),
    contradicting: (pe.contradicting_signals || []).slice(0, 3),
    reasoning:     pe.pattern_reasoning || null,
    passSummaries: passSummaries || null,
  } : null;

  const lightQuality = (data.classification?.lightQuality || '').toLowerCase() || null;

  const mood = (imageRead.mood || '').trim() || null;

  // ── VLM Narrative — structured VLM description fields ────────────────────────
  // data.vlm is a VLMDescription: lighting_style, overall_mood, pose, expression,
  // framing, likely_photographer, derivation (reasoning dict), etc.
  const vlmRaw = data.vlm || null;
  let vlmNarrative = null;
  if (vlmRaw && vlmRaw.ok !== false) {
    const fields = [];
    if (vlmRaw.lighting_style) fields.push({ label: 'Lighting', value: vlmRaw.lighting_style });
    if (vlmRaw.overall_mood)   fields.push({ label: 'Mood',     value: vlmRaw.overall_mood });
    if (vlmRaw.framing)        fields.push({ label: 'Framing',  value: vlmRaw.framing });
    if (vlmRaw.pose)           fields.push({ label: 'Pose',     value: vlmRaw.pose });
    if (vlmRaw.expression)     fields.push({ label: 'Expression', value: vlmRaw.expression });
    if (vlmRaw.likely_photographer && vlmRaw.likely_photographer !== 'unknown')
      fields.push({ label: 'Style reference', value: vlmRaw.likely_photographer });
    // Derivation — VLM reasoning per conclusion
    const derivEntries = Object.entries(vlmRaw.derivation || {}).filter(([, v]) => v);
    if (fields.length > 0 || derivEntries.length > 0) {
      vlmNarrative = {
        fields,
        derivation: derivEntries.slice(0, 6),
        summary: vlmRaw.lighting_style || vlmRaw.overall_mood || null,
      };
    }
  }

  return {
    pattern,
    confidence,
    meta,
    mood,
    sections: {
      patternCandidates: candidates,
      patternSource,
      confidenceLabel,
      edgeCaseWarnings,
      shadowAnalysis,
      shadowComponents,
      shadowDirection,
      shadowEdgeNote,
      catchlightPositions,
      lightQuality,
      catchlightModifier,
      modifier: modifierData,
      sceneDescription,
      colorPalette,
      signalQuality,
      vlmNarrative,
    },
    _raw: data,
  };
}

// Dev hook — lets browser testing call the real mapApiResult after a background fetch
if (typeof window !== 'undefined') window.__ngwMapResult = mapApiResult;

export default function Day1DemoApp() {
  const [screen, setScreen] = useState('home');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [result, setResult] = useState(null);
  const [analysisError, setAnalysisError] = useState(null);
  const [analysisReady, setAnalysisReady] = useState(false);
  const [user, setUser] = useState(() => getUser());
  const [lastAnalysisTime, setLastAnalysisTime] = useState(null);
  const [shootMode, setShootMode] = useState('photographer');
  const abortRef = useRef(null);
  const wakeLockRef = useRef(null);

  // ── Dev: ?day1_error=<key> jumps straight to the error screen with a
  // canned message so each scenario can be reviewed without going through
  // the full analyze flow.  Harmless in prod (no-op without the param).
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const key = params.get('day1_error');
      if (!key) return;
      const canned = {
        noface:  'No face detected in the image',
        quota:   'API quota exceeded (429)',
        timeout: 'Request timeout — server took too long',
        offline: 'Failed to fetch — network unreachable',
        server:  'Server returned 503',
        upload:  'Upload failed — file rejected',
        unknown: 'Unexpected internal error',
      };
      setAnalysisError(canned[key] || canned.unknown);
      setScreen('error');
    } catch { /* ignore */ }
  }, []);

  // Keep screen awake while app is active
  useEffect(() => {
    async function requestWakeLock() {
      try {
        if ('wakeLock' in navigator) {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
        }
      } catch { /* user denied or not supported */ }
    }
    requestWakeLock();
    // Re-acquire on visibility change (browser releases on tab switch)
    const reacquire = () => { if (document.visibilityState === 'visible') requestWakeLock(); };
    document.addEventListener('visibilitychange', reacquire);
    return () => {
      document.removeEventListener('visibilitychange', reacquire);
      if (wakeLockRef.current) wakeLockRef.current.release().catch(() => {});
    };
  }, []);

  const [exifData, setExifData] = useState(null);

  const handleAnalyze = (file, preview, exif) => {
    setImageFile(file);
    setImagePreview(preview);
    setExifData(exif || null);
    setResult(null);
    setAnalysisError(null);
    setAnalysisReady(false);
    setScreen('processing');

    const controller = new AbortController();
    abortRef.current = controller;

    // Downsample if over 10 MB, then analyze
    downsampleImage(file, MAX_UPLOAD_BYTES)
      .then(readyFile => analyzeImage(readyFile, { signal: controller.signal }))
      .then(data => {
        setResult(mapApiResult(data));
        setAnalysisReady(true);
      })
      .catch(err => {
        if (err.name !== 'AbortError') {
          console.error('[Day1] Analysis failed:', err);
          setAnalysisError(err.message);
          setAnalysisReady(true);
        }
      });
  };

  // Dev hook: window.__ngwLoadImage('/test-benchmark.jpg') drives the full analyze flow
  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.__ngwLoadImage = async (url) => {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const file = new File([blob], url.split('/').pop(), { type: blob.type || 'image/jpeg' });
      const preview = URL.createObjectURL(blob);
      handleAnalyze(file, preview);
    };
    return () => { delete window.__ngwLoadImage; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist last result for quick recall from home screen
  const [lastResult, setLastResult] = useState(() => {
    try { const r = sessionStorage.getItem('ngw_last_result'); return r ? JSON.parse(r) : null; } catch { return null; }
  });
  const [lastPreview, setLastPreview] = useState(() => sessionStorage.getItem('ngw_last_preview') || null);

  // Transition to result when analysis finishes.  A brief 1.2s dwell lets
  // the pattern tease flash on the ProcessingScreen photo before we switch —
  // the "reveal moment" that makes the user feel the analysis landed.
  useEffect(() => {
    if (screen === 'processing' && analysisReady) {
      if (result) {
        // Cache immediately (don't wait for the dwell timer)
        setLastResult(result);
        setLastPreview(imagePreview);
        setLastAnalysisTime(Date.now());
        try {
          sessionStorage.setItem('ngw_last_result', JSON.stringify(result));
          if (imagePreview && imagePreview.startsWith('blob:')) {
            fetch(imagePreview).then(r => r.blob()).then(blob => {
              const reader = new FileReader();
              reader.onloadend = () => {
                const dataUrl = reader.result;
                sessionStorage.setItem('ngw_last_preview', dataUrl);
                setLastPreview(dataUrl);
              };
              reader.readAsDataURL(blob);
            }).catch(() => {});
          } else if (imagePreview) {
            sessionStorage.setItem('ngw_last_preview', imagePreview);
          }
        } catch { /* quota */ }
        // 1.2s dwell — pattern tease shows on the processing photo
        const timer = setTimeout(() => setScreen('result'), 1200);
        return () => clearTimeout(timer);
      } else if (analysisError) {
        setScreen('error');
      }
    }
  }, [screen, analysisReady, result, analysisError, imagePreview]);

  const handleViewLastResult = () => {
    if (lastResult) {
      setResult(lastResult);
      setImagePreview(lastPreview);
      setScreen('result');
    }
  };

  const handleSetup = () => setScreen('setup');
  const handleSettings = () => setScreen('settings');

  const handleSetupSave = () => {
    // Persistence happens inside SetupScreen; stay on setup so the user can
    // see the "Saved" confirmation before deciding to Start Cockpit.
  };

  // Bucket B runtime gate — cockpit unlock comes from ?studio=1&cockpit=1
  // (Checkpoint 2 flag plumbing). Without it, all nav paths into Day1ShootScreen
  // redirect cleanly to Studio Home.
  const isCockpitUnlocked = () => {
    try { return sessionStorage.getItem('ngw_studio_cockpit') === '1'; }
    catch { return false; }
  };

  const handleStartCockpit = (mode) => {
    if (!isCockpitUnlocked()) {
      // Bucket B locked in this build — return to Home cleanly.
      setScreen('home');
      return;
    }
    setShootMode(mode || 'photographer');
    setScreen('shoot');
  };

  const handleExitShoot = () => {
    setScreen('home');
    setImageFile(null);
    setImagePreview(null);
    setResult(null);
  };

  const handleSetupCancel = () => setScreen('result');

  const handleRetry = () => {
    // Abort any in-flight analysis
    if (abortRef.current) abortRef.current.abort();
    setScreen('home');
    setImageFile(null);
    setImagePreview(null);
    setResult(null);
    setAnalysisError(null);
    setAnalysisReady(false);
  };

  // Login gate — StudioLoginScreen is Bucket B, gated behind cockpit unlock.
  // Without cockpit, an unauthenticated tester exits studio cleanly to prod auth
  // (clears studio session flags so they don't yo-yo back before authenticating).
  if (!user) {
    if (!isCockpitUnlocked()) {
      try {
        sessionStorage.removeItem('ngw_studio_active');
        sessionStorage.removeItem('ngw_goto_day1_demo');
      } catch { /* ignore */ }
      if (typeof window !== 'undefined') {
        window.location.replace('/?login=1');
      }
      return null;
    }
    return <StudioLoginScreen onLogin={(u) => setUser(u)} />;
  }

  // ── Screen crossfade — each screen fades in on mount (200ms) ──
  const screenContent = (() => {
    switch (screen) {
    case 'home': {
      // Mobile: 430×932 aspect-preserving contain.
      // Desktop: 430×designH at tightness=1 so the scaled inner box
      // exactly matches the viewport height — no clipping. stableVH
      // (= innerHeight on desktop) will match the inner box height.
      const homeMobile = typeof window !== 'undefined' && window.innerWidth < LAYOUT_DESKTOP_MIN;
      const desktopVH = typeof window !== 'undefined' ? window.innerHeight : 800;
      return (
        <FitToViewport
          designWidth={430}
          designHeight={homeMobile ? 932 : desktopVH}
          maxScale={1.9}
          tightness={homeMobile ? 0.96 : 1}
        >
          <HomeScreen
            onAnalyze={handleAnalyze}
            hasLastResult={!!lastResult}
            onViewLastResult={handleViewLastResult}
            user={user}
            onLogout={() => { clearAuth(); setUser(null); }}
            onSettings={handleSettings}
            lastAnalysisTime={lastAnalysisTime}
          />
        </FitToViewport>
      );
    }
    case 'processing': {
      const procMobile = typeof window !== 'undefined' && window.innerWidth < LAYOUT_DESKTOP_MIN;
      const desktopVH = typeof window !== 'undefined' ? window.innerHeight : 800;
      return (
        <FitToViewport
          designWidth={430}
          designHeight={procMobile ? 932 : desktopVH}
          maxScale={1.9}
          tightness={procMobile ? 0.96 : 1}
        >
          <ProcessingScreen imagePreview={imagePreview} analysisComplete={analysisReady} exifData={exifData} result={result} onCancel={handleRetry} />
        </FitToViewport>
      );
    }
    case 'result': {
      // Mobile: use 430-wide design with width-only scaling so the result
      // scrolls vertically at near-native size instead of scaling 1300px
      // down to 50%. Desktop: use innerHeight so scaled box matches viewport.
      const resultMobile = typeof window !== 'undefined' && window.innerWidth < LAYOUT_DESKTOP_MIN;
      const resultDesktopVH = typeof window !== 'undefined' ? window.innerHeight : 800;
      return (
        <FitToViewport
          designWidth={resultMobile ? 430 : 1300}
          designHeight={resultMobile ? undefined : resultDesktopVH}
          fitMode={resultMobile ? 'width' : 'both'}
          minScale={resultMobile ? 1 : 0.5}
          maxScale={resultMobile ? 1.3 : 2.0}
          tightness={resultMobile ? 0.96 : 1}
        >
          <ResultScreen
            result={result}
            imagePreview={imagePreview}
            onSetup={handleSetup}
            onRetry={handleRetry}
          />
        </FitToViewport>
      );
    }
    case 'setup': {
      const setupMobile = typeof window !== 'undefined' && window.innerWidth < LAYOUT_DESKTOP_MIN;
      const setupDesktopVH = typeof window !== 'undefined' ? window.innerHeight : 800;
      return (
        <FitToViewport
          designWidth={setupMobile ? 430 : 1180}
          designHeight={setupMobile ? 932 : setupDesktopVH}
          minScale={setupMobile ? 0.8 : 0.5}
          maxScale={setupMobile ? 1.9 : 2.0}
          tightness={setupMobile ? 0.96 : 1}
        >
          <SetupScreen
            result={result}
            imagePreview={imagePreview}
            onSave={handleSetupSave}
            onCancel={handleSetupCancel}
            onStartCockpit={handleStartCockpit}
          />
        </FitToViewport>
      );
    }
    case 'shoot': {
      const shootMobile = typeof window !== 'undefined' && window.innerWidth < LAYOUT_DESKTOP_MIN;
      const shootDesktopVH = typeof window !== 'undefined' ? window.innerHeight : 800;
      return (
        <FitToViewport
          designWidth={shootMobile ? 430 : 1180}
          designHeight={shootMobile ? 932 : shootDesktopVH}
          minScale={shootMobile ? 0.8 : 0.5}
          maxScale={shootMobile ? 1.9 : 2.0}
          tightness={shootMobile ? 0.96 : 1}
        >
          <Day1ShootScreen
            result={result}
            imagePreview={imagePreview}
            mode={shootMode}
            onExit={handleExitShoot}
          />
        </FitToViewport>
      );
    }
    case 'settings':
      return (
        <FitToViewport designWidth={430} designHeight={932} maxScale={1.9}>
          <Day1SettingsScreen
            user={user}
            onBack={() => setScreen('home')}
            onLogout={() => { clearAuth(); setUser(null); setScreen('home'); }}
          />
        </FitToViewport>
      );
    case 'error':
      return (
        <FallbackReveal
          message={analysisError}
          onRetry={handleRetry}
          onHome={handleRetry}
        />
      );
    default:
      return (
        <FitToViewport designWidth={430} designHeight={932} maxScale={1.9}>
          <HomeScreen
            onAnalyze={handleAnalyze}
            hasLastResult={!!lastResult}
            onViewLastResult={handleViewLastResult}
            user={user}
            onLogout={() => { clearAuth(); setUser(null); }}
            onSettings={handleSettings}
            lastAnalysisTime={lastAnalysisTime}
          />
        </FitToViewport>
      );
    }
  })();

  return (
    <div key={screen} style={{ animation: 'screenFadeIn 0.2s ease both' }}>
      {screenContent}
      <style>{`@keyframes screenFadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
    </div>
  );
}

// ─── Fallback Reveal ─────────────────────────────────────────────────────────
/**
 * Shown when analysis errors out.
 * Pixel-matched to Figma node 1317:2 (Studio Matte → Analysis Failed).
 *
 * Layout mirrors HomeScreen so the user stays in the same shell:
 *   • Wordmark top-left + sensor well top-right
 *   • Glass viewfinder showing the failure label / headline / subtext
 *   • Recessed indicator well + "TRY AGAIN" label as the retry affordance
 */
function FallbackReveal({ message, onRetry }) {
  // Run mount sound + warn haptic so the user feels something landed
  useEffect(() => { warnHaptic(); }, []);

  // Parse the error and pick the right framing for each scenario.
  // Each error type has its own small-caps label, headline, and detail copy
  // — the layout stays the same but the content adapts to the failure mode.
  const lc = (message || '').toLowerCase();
  const isNoFace  = lc.includes('face') || lc.includes('no_face') || lc.includes('not detect');
  const isQuota   = lc.includes('quota') || lc.includes('429') || lc.includes('rate');
  const isTimeout = lc.includes('timeout') || lc.includes('econnreset') || lc.includes('aborted');
  // "Failed to fetch" = network layer error but NOT necessarily offline.
  // Check navigator.onLine: if the device is online, it's a CORS/access/blocked-URL issue, not offline.
  const isFetchFailed = lc.includes('failed to fetch') || lc.includes('networkerror') || lc.includes('network request failed');
  const isActuallyOffline = isFetchFailed && (typeof navigator !== 'undefined' ? !navigator.onLine : false);
  const isAccessBlocked   = isFetchFailed && !isActuallyOffline;
  const isNetwork = isActuallyOffline || lc.includes('offline');
  const isAccess  = isAccessBlocked || lc.includes('cors') || lc.includes('couldn\'t fetch') || lc.includes('could not fetch');
  const isServer  = lc.includes('500') || lc.includes('502') || lc.includes('503') || lc.includes('server');
  const isUpload  = lc.includes('upload') || lc.includes('file') || lc.includes('image');

  // ── Studio Matte signal palette — three "tones" the design system uses
  // for status colors.  Each scenario picks one based on the failure mode
  // so the kicker, sensor LED, retry indicator, and glow all sing the same
  // color story without breaking the language. ────────────────────────
  const TONE = {
    danger: {
      // Engine/analysis problems — coral/red.  Matches confLow on results.
      kicker:    'rgba(225,95,95,0.92)',
      kickerGlow:'rgba(225,95,95,0.20)',
      ledHi:     'rgba(235,100,100,0.98)',
      ledMid:    'rgba(170,55,55,0.85)',
      ledLo:     'rgba(85,22,22,0.6)',
      ledHalo1:  'rgba(225,90,90,0.50)',
      ledHalo2:  'rgba(225,90,90,0.18)',
      sensorBg:  'rgba(225,90,90,0.85)',
      sensorMid: 'rgba(140,40,40,0.65)',
      sensorLo:  'rgba(70,18,18,0.5)',
      sensorHalo:'rgba(180,60,60,0.30)',
    },
    caution: {
      // Quota / timeout / upload — amber.  Matches confLow on results.
      kicker:    'rgba(245,190,72,0.92)',
      kickerGlow:'rgba(245,190,72,0.22)',
      ledHi:     'rgba(255,215,120,0.98)',
      ledMid:    'rgba(200,150,55,0.85)',
      ledLo:     'rgba(115,80,28,0.6)',
      ledHalo1:  'rgba(245,190,72,0.50)',
      ledHalo2:  'rgba(245,190,72,0.18)',
      sensorBg:  'rgba(245,190,72,0.80)',
      sensorMid: 'rgba(160,115,40,0.65)',
      sensorLo:  'rgba(80,55,18,0.5)',
      sensorHalo:'rgba(200,150,55,0.30)',
    },
    info: {
      // Network / server — steel-blue.  Reads as "infrastructure", not user.
      kicker:    'rgba(150,180,210,0.92)',
      kickerGlow:`${steel(0.22)}`,
      ledHi:     'rgba(180,210,235,0.98)',
      ledMid:    'rgba(132, 158, 184,0.85)',
      ledLo:     'rgba(40,60,80,0.6)',
      ledHalo1:  `${steel(0.45)}`,
      ledHalo2:  `${steel(0.16)}`,
      sensorBg:  'rgba(150,180,210,0.80)',
      sensorMid: `${steel(0.55)}`,
      sensorLo:  'rgba(40,60,80,0.5)',
      sensorHalo:`${steel(0.30)}`,
    },
  };

  // Each scenario gets: kicker text, headline, detail, retry label, and a tone.
  // The tone drives every color signal in the layout — kicker, sensor LED,
  // retry indicator dot, glows.  Layout stays consistent; signaling adapts.
  const scenario =
    isNoFace  ? { kicker: 'Analysis Failed', headline: 'No face detected',       detail: "Make sure the subject's face is visible.",                                       retry: 'Try Again', tone: TONE.danger }
  : isQuota   ? { kicker: 'Limit Reached',   headline: 'Daily quota exceeded',   detail: 'Usage limit reached. Try again in a moment.',                                    retry: 'Retry',     tone: TONE.caution }
  : isTimeout ? { kicker: 'Timed Out',       headline: 'Server is slow',         detail: 'The analysis took too long. Check your connection and try again.',               retry: 'Retry',     tone: TONE.caution }
  : isNetwork ? { kicker: 'No Connection',   headline: 'Offline',                detail: "Can't reach the server. Check your connection.",                                  retry: 'Retry',     tone: TONE.danger }
  : isAccess  ? { kicker: 'Connection Refused', headline: "Request blocked",       detail: "The connection was blocked. If you loaded from a cloud link, save to your device first.", retry: 'New Photo', tone: TONE.caution }
  : isServer  ? { kicker: 'Server Error',    headline: 'Engine unavailable',     detail: 'The analysis engine is temporarily down. Please try again.',                     retry: 'Retry',     tone: TONE.danger }
  : isUpload  ? { kicker: 'Upload Failed',   headline: 'Image not accepted',     detail: 'The photo could not be processed. Try a different shot.',                        retry: 'New Photo', tone: TONE.caution }
  :             { kicker: 'Analysis Failed', headline: 'Something went wrong',   detail: message || 'An unexpected error occurred.',                                       retry: 'Try Again', tone: TONE.danger };

  const { kicker, headline, detail, retry: retryLabel, tone } = scenario;

  const handleRetryClick = () => {
    softClickSound();
    tapHaptic();
    onRetry?.();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: '#000', overflow: 'hidden' }}>
      <div style={{
        position: 'relative',
        width: '100%', maxWidth: 430, height: '100%', minHeight: 600,
        margin: '0 auto', backgroundColor: C.bg,
        boxShadow: '2px 4px 40px rgba(0,0,0,0.6), -1px -1px 1px rgba(255,255,255,0.02)',
        overflow: 'hidden',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}>
        {/* Matte metal surface — same ambient/vignette/grain stack as HomeScreen */}
        <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 75% 55% at 50% 22%, rgba(120,148,175,0.028) 0%, rgba(132, 158, 184,0.010) 40%, transparent 72%)' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 55% 38% at 50% 58%, rgba(180,150,110,0.010) 0%, transparent 65%)' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 118% 88% at 50% 50%, transparent 52%, rgba(0,0,0,0.45) 100%)' }} />
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(141.71deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.03) 40%, transparent 80%)' }} />
          <div style={{ position: 'absolute', inset: 0, opacity: 0.16, mixBlendMode: 'multiply', backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.32' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`, backgroundSize: '128px 128px' }} />
        </div>

        {/* ── Wordmark (top-left) — static, not interactive on this screen ── */}
        <div style={{ position: 'absolute', top: 24, left: 22, padding: 6, zIndex: 15, userSelect: 'none' }}>
          <p style={{
            margin: 0, fontWeight: 800, fontSize: 18, lineHeight: '22px',
            color: C.textPrimary, letterSpacing: '-0.3px',
            textShadow: '0 0 1px rgba(245,247,250,0.12)',
            ...FS,
          }}>No Guesswork</p>
          <p style={{
            margin: '2px 0 0 1px', fontWeight: 800, fontSize: 9.5, lineHeight: '12px',
            color: 'rgba(145,168,190,0.95)', letterSpacing: '3.2px',
            textShadow: `0 0 3px ${steel(0.15)}`,
            ...FS,
          }}>LIGHTING</p>
        </div>

        {/* ── Sensor well (top-right) — quiet, dim red dot ── */}
        <div style={{
          position: 'absolute', top: 30, right: 24, width: 40, height: 40,
          borderRadius: 20, backgroundColor: C.slotBg,
          boxShadow: [
            'inset 2px 3px 6px 0px rgba(0,0,0,0.85)',
            'inset 1px 2px 3px 0px rgba(0,0,0,0.65)',
            'inset -0.5px -0.5px 1px 0px rgba(255,255,255,0.04)',
            `inset 0px 0px 8px 0px ${steel(0.05)}`,
          ].join(', '),
        }}>
          <div style={{
            position: 'absolute', top: 17, left: 17, width: 6, height: 6, borderRadius: '50%',
            background: `radial-gradient(circle at 50% 55%, ${tone.sensorBg} 0%, ${tone.sensorMid} 65%, ${tone.sensorLo} 100%)`,
            boxShadow: [
              'inset 0 1px 1.5px rgba(0,0,0,0.9)',
              'inset 1px 0 1px rgba(0,0,0,0.55)',
              'inset -0.5px -0.5px 0.6px rgba(255,255,255,0.10)',
              `0 0 1.5px ${tone.sensorHalo}`,
            ].join(', '),
          }} />
        </div>

        {/* ── Glass viewfinder — error message lives inside ── */}
        <div style={{
          position: 'absolute', top: 140, left: 24, right: 24, height: 360,
          borderRadius: 8, overflow: 'hidden',
          backgroundColor: C.slotBg,
          border: '0.5px solid rgba(0,0,0,0.45)',
          boxShadow: '0 -1px 0 rgba(0,0,0,0.5), -1px 0 0 rgba(0,0,0,0.4), 1px 1px 0 rgba(255,255,255,0.05)',
        }}>
          {/* Centered error copy */}
          <div style={{
            position: 'absolute', inset: 0, zIndex: 7,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '0 32px', textAlign: 'center',
          }}>
            <p style={{
              margin: '0 0 14px',
              fontSize: 11, fontWeight: 700,
              color: tone.kicker, letterSpacing: '2.2px',
              textTransform: 'uppercase',
              textShadow: `0 0 8px ${tone.kickerGlow}`,
              ...FS,
            }}>
              {kicker}
            </p>
            <p style={{
              margin: '0 0 10px',
              fontSize: 22, fontWeight: 700,
              color: C.textPrimary, letterSpacing: '-0.4px',
              lineHeight: 1.2,
              ...FS,
            }}>
              {headline}
            </p>
            <p style={{
              margin: 0,
              fontSize: 14, fontWeight: 400,
              color: steel(0.6), lineHeight: 1.5,
              ...FS,
            }}>
              {detail}
            </p>
          </div>

          {/* Glass overlay: lens vignette + upper-left key reflection */}
          <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 9 }}>
            <div style={{ position: 'absolute', inset: 0, background: LENS_VIGNETTE }} />
            <div style={{ position: 'absolute', top: 0, left: 0, right: '5%', bottom: 0, background: GLASS_REFLECTION, borderRadius: 8, opacity: 0.48 }} />
          </div>

          {/* Inner shadow — matches HomeScreen viewfinder bevel */}
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 8,
            pointerEvents: 'none', boxShadow: VIEWFINDER_INNER_SHADOW, zIndex: 10,
          }} />
        </div>

        {/* ── Retry indicator — recessed well with red dot ── */}
        <div
          role="button"
          aria-label="Try again"
          onClick={handleRetryClick}
          style={{
            position: 'absolute',
            left: '50%', top: 580,
            transform: 'translateX(-50%)',
            width: 100, height: 100, borderRadius: 50,
            backgroundColor: C.slotBg,
            cursor: 'pointer',
            WebkitTapHighlightColor: 'transparent',
            boxShadow: [
              'inset 4px 5px 14px 0px rgba(0,0,0,0.88)',
              'inset 2px 3px 7px 0px rgba(0,0,0,0.68)',
              'inset 1px 1px 3px 0px rgba(0,0,0,0.55)',
              'inset -1px -1px 1.5px 0px rgba(255,255,255,0.05)',
              `inset -2px -2px 6px 0px ${steel(0.07)}`,
              `inset 0px 0px 22px 0px ${steel(0.05)}`,
            ].join(', '),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {/* Center indicator dot — recessed-LED treatment, tone-adaptive */}
          <div style={{
            width: 10, height: 10, borderRadius: '50%',
            background: `radial-gradient(circle at 50% 55%, ${tone.ledHi} 0%, ${tone.ledMid} 60%, ${tone.ledLo} 100%)`,
            boxShadow: [
              'inset 0 1.2px 2.2px rgba(0,0,0,0.95)',
              'inset 1px 0 1.4px rgba(0,0,0,0.7)',
              'inset -0.6px -0.6px 1px rgba(255,255,255,0.14)',
              `0 0 2.2px ${tone.ledHalo1}`,
              `0 0 6px ${tone.ledHalo2}`,
            ].join(', '),
          }} />
        </div>

        {/* ── TRY AGAIN label ── */}
        <button
          type="button"
          onClick={handleRetryClick}
          style={{
            position: 'absolute',
            left: '50%', top: 700,
            transform: 'translateX(-50%)',
            background: 'transparent', border: 'none', cursor: 'pointer',
            padding: '6px 14px',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <span style={{
            fontSize: 11, fontWeight: 700,
            color: steel(0.75), letterSpacing: '3.2px',
            textShadow: `0 0 6px ${steel(0.18)}`,
            ...FS,
          }}>
            {retryLabel.toUpperCase()}
          </span>
        </button>

        {/* ── Home indicator ── */}
        <div style={{
          position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)',
          width: 134, height: 5, borderRadius: 3,
          backgroundColor: 'rgba(89,94,107,0.55)',
          boxShadow: 'inset 0px 1px 1px 0px rgba(255,255,255,0.12), inset 0px -0.5px 0.5px 0px rgba(0,0,0,0.2)',
          zIndex: 50, pointerEvents: 'none',
        }} />
      </div>
    </div>
  );
}
