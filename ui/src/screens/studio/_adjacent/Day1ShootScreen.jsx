/**
 * Day1ShootScreen — cockpit for Studio Matte Day 1 demo flow.
 *
 * Entered from SetupScreen's mode picker after the photographer chooses a
 * role (photographer / assistant / learning). Each role renders a distinctly
 * different cockpit philosophy:
 *
 *   Photographer — data-dense, terse leads, full numeric specs visible
 *   Assistant    — oversized single-command type, no prose, no reference
 *                  photo; readable across a studio for hands-free ops
 *   Learning     — narrative leads + "WHY" callout with lighting theory
 *                  pulled from signal diagnostics; reference photo is large
 *
 * Capture semantics: Capture is a gesture meaning "I fired a frame on my
 * camera". It increments a session-scoped frame counter. After the first
 * frame, a DONE action appears that exits back to home.
 *
 * Props:
 *   result        — mapped result from Day1DemoApp (pattern, confidence, sections, _raw)
 *   imagePreview  — analyzed photo data URL (for reference)
 *   mode          — 'photographer' | 'assistant' | 'learning'
 *   onExit        — exit cockpit and return to home
 */
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { navHaptic, tapHaptic, successHaptic, grainHaptic, longPressHaptic } from '../../../utils/haptics';
import { softClickSound, navSlideSound } from '../../../utils/sounds';
import { steel, C, FONT_SMOOTH, PANEL_SHADOW, PANEL_BEVEL,
         CTA_BG, CTA_SHADOW, CTA_BEVEL } from '../../../theme/studioMatte';
import { trackEvent, getSessionId } from '../../../data/analytics';
import { postSignal } from '../../../data/signalsApi';
import { getUser } from '../../../data/authApi';
import ZoomableHeroOverlay from './components/ZoomableHeroOverlay';
import NailedItOverlay from './components/NailedItOverlay';

const KEY_ACCENT = '#c89b45';

const MODE_LABELS = {
  photographer: { label: 'Photographer', tag: 'FULL DETAILS' },
  assistant:    { label: 'Assistant',    tag: 'COMMANDS ONLY' },
  learning:     { label: 'Learning',     tag: 'EXPLAINS WHY' },
};

// Traditional off-axis angle ranges for classical portrait lighting patterns.
// These are the *target* ranges — the angle the key light should sit at
// relative to the camera-subject axis to produce the named pattern.
const PATTERN_TARGET_ANGLES = {
  BUTTERFLY: [0, 15],    // Paramount / glamour — on-axis, high above
  LOOP:      [30, 45],   // Classic portrait — loop/triangle under nose
  REMBRANDT: [45, 60],   // Shadow triangle on cheek bounded by nose + eye
  SPLIT:     [85, 95],   // Half-lit, half-shadow — key at 3 or 9 o'clock
  BROAD:     [30, 60],   // Broad side of face lit
  SHORT:     [30, 60],   // Short (shadow) side of face toward camera
  CLAMSHELL: [0, 15],    // Butterfly above + fill below — beauty standard
  RING_LIGHT:[0, 5],     // On-axis; donut catchlights
};
function targetRangeFor(pattern) {
  if (!pattern) return null;
  const range = PATTERN_TARGET_ANGLES[pattern.toUpperCase()];
  return range ? `${range[0]}–${range[1]}°` : null;
}

// Per-step coaching: what visual cues confirm the pattern is landing,
// and what to adjust when it isn't. Keyed by pattern then step.
const PATTERN_COACHING = {
  LOOP: {
    position: {
      lookFor: [
        'Small loop/triangle shadow under the nose, on the shadow side',
        'Catchlight sits around 1 o\'clock (or 11) in the iris',
        'Shadow does NOT touch the cheek shadow',
      ],
      fixes: [
        ['Shadow touches cheek', 'Move key closer to camera axis (lower angle)'],
        ['No loop visible', 'Move key further off-axis'],
        ['Catchlight off-center', 'Rotate subject\'s head toward the light'],
      ],
    },
    distance: {
      lookFor: [
        'Smooth wrap from forehead into shadow — no hard edge',
        'Skin highlights soft but not blown',
        'Catchlight is a readable shape, not a pinpoint',
      ],
      fixes: [
        ['Shadow edge too hard', 'Pull light closer (larger apparent size)'],
        ['Light too flat / no falloff', 'Back the light off'],
        ['Catchlight tiny/dim', 'Move closer for more eye presence'],
      ],
    },
    height: {
      lookFor: [
        'Catchlight lands in the UPPER half of the iris (~10–11 o\'clock)',
        'Nose shadow ~½ length of the nose',
        'Small shadow triangle visible under the shadow-side eye',
      ],
      fixes: [
        ['No catchlights in eyes', 'Drop the light — too high'],
        ['Pattern flattens to butterfly', 'Raise the light'],
        ['Nose shadow reaches lip', 'Lower the light slightly'],
      ],
    },
    capture: {
      lookFor: [
        'Loop/triangle shape matches the reference',
        'Both catchlights similar in size & clock position',
        'Shadow-side cheek has definition, not mud',
      ],
      fixes: [
        ['Asymmetric catchlights', 'Fix head angle before touching the light'],
        ['Pattern drifted since setup', 'Re-check angle FIRST, then height'],
        ['Flat/low contrast', 'Verify fill ratio and ambient spill'],
      ],
    },
  },

  BUTTERFLY: {
    position: {
      lookFor: [
        'Symmetric shadow directly under the nose (butterfly wings)',
        'Catchlight dead-center at 12 o\'clock in both irises',
        'Equal fall-off on both cheeks — no lateral bias',
      ],
      fixes: [
        ['Nose shadow pulls to one side', 'Re-center the key on the lens axis'],
        ['Catchlight off to 10 or 2', 'Light is drifting off-axis — pull back to 0°'],
        ['One cheek brighter than the other', 'Subject is off-axis, not the light — square them up'],
      ],
    },
    distance: {
      lookFor: [
        'Soft, readable wings shadow — no hard edge',
        'Cheekbones carved but not crunchy',
        'Clean specular across the forehead, no hot spot',
      ],
      fixes: [
        ['Wings shadow razor-sharp', 'Pull the light closer — apparent size too small'],
        ['Face looks flat, no modeling', 'Back the light off slightly'],
        ['Forehead blowing out', 'Ease distance or feather the modifier upward'],
      ],
    },
    height: {
      lookFor: [
        'Nose shadow stops SHORT of the upper lip',
        'Catchlight in the UPPER third of the iris',
        'Clear triangle of light on the chin',
      ],
      fixes: [
        ['Shadow runs into the lip', 'Drop the light a hair — you\'re too high'],
        ['No shadow under nose at all', 'Raise the light — it\'s too low, becoming flat'],
        ['Eye sockets going dark', 'Lower the light or add chin fill'],
      ],
    },
    capture: {
      lookFor: [
        'Perfectly symmetric butterfly wings under the nose',
        'Glamour-style sculpt on cheekbones',
        'Even catchlights, dead center, matching size',
      ],
      fixes: [
        ['Asymmetry creeping in', 'Check subject head tilt FIRST'],
        ['Under-eye circles reading dark', 'Add a reflector/clamshell below'],
        ['Looks like a loop instead', 'Key drifted off-axis — pull back to 0°'],
      ],
    },
  },

  REMBRANDT: {
    position: {
      lookFor: [
        'Defined triangle of light on the shadow-side cheek',
        'Triangle bounded by nose shadow and cheek shadow',
        'Catchlight at ~1 or 11 o\'clock, key-side eye only',
      ],
      fixes: [
        ['Triangle closed (shadows meet)', 'Raise the light OR pull angle inward'],
        ['Triangle runs off the face', 'Lower the light OR reduce off-axis angle'],
        ['No triangle forming at all', 'Push key further off-axis — you\'re stuck in loop'],
      ],
    },
    distance: {
      lookFor: [
        'Painterly falloff — chiaroscuro, not harsh',
        'Triangle has soft edges, readable at a glance',
        'Shadow side retains texture, not crushed black',
      ],
      fixes: [
        ['Shadow side crushed to black', 'Pull closer or add negative-less fill'],
        ['Triangle edge jagged/digital', 'Pull light in — need larger apparent size'],
        ['Whole face too evenly lit', 'Back light off — you\'re killing the drama'],
      ],
    },
    height: {
      lookFor: [
        'Triangle sits on the cheek, NOT on the jawline',
        'Nose shadow angled down toward the corner of the mouth',
        'Key-side eye has a clear catchlight; shadow-side dim',
      ],
      fixes: [
        ['Triangle slid down to jaw', 'Raise the light'],
        ['Triangle collapsed onto nose', 'Lower the light'],
        ['Both eyes bright equally', 'Key is too frontal — push off-axis further'],
      ],
    },
    capture: {
      lookFor: [
        'Classical triangle anchored on the cheek',
        'Dramatic shadow-to-light ratio, cinematic mood',
        'Nose shadow flows smoothly into cheek shadow',
      ],
      fixes: [
        ['Triangle breaking apart', 'Usually height — raise or lower 2 inches'],
        ['Shadow looks muddy', 'Tighten modifier or flag spill off shadow side'],
        ['Lost the mood', 'Kill ambient fill — Rembrandt lives on contrast'],
      ],
    },
  },

  SPLIT: {
    position: {
      lookFor: [
        'Light exactly bisects the face — one side lit, one dark',
        'Key light 90° off-axis, parallel to the subject\'s face plane',
        'Catchlight only in the key-side eye',
      ],
      fixes: [
        ['Light bleeds across the nose bridge', 'Push the key further back — past 90°'],
        ['Both eyes have catchlights', 'Key still too frontal — rotate further off-axis'],
        ['Shadow side totally invisible', 'Bring negative fill or let ambient breathe a hair'],
      ],
    },
    distance: {
      lookFor: [
        'Clean vertical shadow line down the center of the face',
        'Lit side has skin texture, not blown',
        'Shadow side has a faint rim of ambient definition',
      ],
      fixes: [
        ['Lit side blowing out', 'Back the light off'],
        ['Shadow line ragged/soft', 'Tighten the modifier or pull closer'],
        ['Shadow side pure black', 'Acceptable for split, but add rim if you need separation'],
      ],
    },
    height: {
      lookFor: [
        'Shadow line falls vertically, straight down the nose',
        'Catchlight at 3 or 9 o\'clock position',
        'No light spill onto the shadow-side cheek',
      ],
      fixes: [
        ['Shadow line tilted', 'Level the light to subject\'s eyeline'],
        ['Light spills onto shadow cheek', 'Subject head is rotated — square them to the light'],
        ['Eye socket key-side is dark', 'Raise the light slightly, add minor tilt down'],
      ],
    },
    capture: {
      lookFor: [
        'Dead-perfect vertical split down the face',
        'One catchlight only, key-side',
        'High-contrast mood, gender-neutral drama',
      ],
      fixes: [
        ['Split drifting to a rembrandt', 'Key has crept forward — reset to 90°'],
        ['Too harsh for the look', 'Feather modifier or add subtle fill on shadow side'],
        ['Lost the knife edge', 'Flag any ambient bounce hitting shadow side'],
      ],
    },
  },

  BROAD: {
    position: {
      lookFor: [
        'Subject face turned AWAY from camera slightly',
        'Key lighting the side of the face TOWARD camera (the broad side)',
        'Loop or triangle pattern visible on the broad cheek',
      ],
      fixes: [
        ['Face looks wide/heavy', 'Correct — broad lighting widens; if unwanted, switch to short'],
        ['Pattern on wrong side of face', 'Subject turned wrong way — flip head direction'],
        ['Pattern gone flat', 'Push key further off-axis on the broad side'],
      ],
    },
    distance: {
      lookFor: [
        'Smooth wrap across the broad cheek',
        'Far (narrow) side reads as shadow without falling to black',
        'Highlights on broad side open and luminous',
      ],
      fixes: [
        ['Broad side blown', 'Back light off'],
        ['Face looks 2D/poster-like', 'Pull in for more wrap'],
        ['Narrow side pure black', 'Add fill — broad lighting benefits from some shadow detail'],
      ],
    },
    height: {
      lookFor: [
        'Catchlight in upper half of broad-side eye',
        'Nose shadow falls onto the broad cheek',
        'No deep under-eye shadow',
      ],
      fixes: [
        ['Heavy under-eye shadow', 'Lower the light'],
        ['Pattern lost to flat light', 'Raise the light'],
        ['Nose shadow crossing onto narrow side', 'Angle is wrong — pull key back toward broad side'],
      ],
    },
    capture: {
      lookFor: [
        'Broad cheek lit, narrow cheek in shadow',
        'Face appears fuller, open, approachable',
        'Good for thin or angular faces',
      ],
      fixes: [
        ['Subject looks heavier than desired', 'Switch to short lighting instead'],
        ['Pattern drifting to loop', 'That\'s fine — broad loop is the common case'],
        ['Flat/dimensionless', 'Verify subject actually turned AWAY from camera'],
      ],
    },
  },

  SHORT: {
    position: {
      lookFor: [
        'Subject face turned TOWARD camera slightly',
        'Key lighting the side of the face AWAY from camera (the short side)',
        'Near (camera-side) cheek is the shadow side',
      ],
      fixes: [
        ['Pattern on wrong cheek', 'Subject turned wrong way — flip head direction'],
        ['Face looks wide', 'Not short — key is on broad side, swap sides'],
        ['Pattern gone flat', 'Push key further off-axis on the far side'],
      ],
    },
    distance: {
      lookFor: [
        'Short (far) side lit, near side falling to shadow',
        'Smooth falloff across the bridge of the nose',
        'Cheekbone on camera-side carved and dimensional',
      ],
      fixes: [
        ['Short-side highlight too small', 'Pull light closer or reposition subject head'],
        ['Near side crushed black', 'Lift ambient or add low fill'],
        ['Loss of modeling', 'Pull closer for more wrap'],
      ],
    },
    height: {
      lookFor: [
        'Catchlight in far (short-side) eye primary',
        'Near eye may have small/dim catchlight',
        'Nose shadow angles across the bridge toward the near cheek',
      ],
      fixes: [
        ['Nose shadow too long', 'Lower the light'],
        ['Pattern flattening toward butterfly', 'Raise the light slightly or increase off-axis'],
        ['Near side eye totally dark', 'Raise light or add fill — avoid dead socket'],
      ],
    },
    capture: {
      lookFor: [
        'Short side lit, near side in shadow — slimming effect',
        'Face reads narrower, sculpted',
        'Best for round or wide faces',
      ],
      fixes: [
        ['Lost the slimming effect', 'Verify near side is actually shadowed'],
        ['Too severe/unflattering', 'Add fill on the camera side to open shadows'],
        ['Drifted to split', 'Reduce off-axis angle back toward 30–60°'],
      ],
    },
  },

  CLAMSHELL: {
    position: {
      lookFor: [
        'Butterfly pattern above — symmetric nose shadow',
        'Fill source (reflector/second light) directly below chin',
        'Two catchlights per eye: one at 12, one at 6',
      ],
      fixes: [
        ['Only one catchlight (top)', 'Add fill below — that\'s the second jaw of the clam'],
        ['Nose shadow offset', 'Top light has drifted off-axis — recenter to 0°'],
        ['Fill overpowering top', 'Pull the bottom fill down or reduce output'],
      ],
    },
    distance: {
      lookFor: [
        'Glossy, even skin — signature beauty look',
        'No harsh shadows anywhere on the face',
        'Cheekbones still have subtle shape, not totally flat',
      ],
      fixes: [
        ['Skin looks pasty/flat', 'Back off the fill OR increase top-to-fill ratio'],
        ['Too much contrast left', 'Bring fill closer — clamshell is a wrap'],
        ['Hot spot on forehead', 'Top light too close — pull back or feather'],
      ],
    },
    height: {
      lookFor: [
        'Top light ~45° above subject, aimed down at the face',
        'Bottom fill level with or just below the chin, tilted up',
        'Catchlights at 12 and 6 in each iris',
      ],
      fixes: [
        ['Bottom catchlight missing', 'Raise the fill into eyeline'],
        ['Ghoulish under-lighting', 'Fill is too strong — it should SUPPORT, not compete'],
        ['Shadows under the jaw', 'Bring fill up closer to the chin line'],
      ],
    },
    capture: {
      lookFor: [
        'Glamour/beauty look — open, luminous, forgiving',
        'Dual catchlights, top AND bottom',
        'No shadow under jaw, no raccoon eyes',
      ],
      fixes: [
        ['Pattern reading as butterfly', 'Fill is missing or too weak — lift it'],
        ['Eyes looking dead', 'Raise fill or tilt reflector up into the eyes'],
        ['Looks over-retouched', 'Reduce fill ratio — you\'ve killed all modeling'],
      ],
    },
  },

  RIM: {
    position: {
      lookFor: [
        'Key light placed BEHIND the subject, off-axis from camera',
        'Clean bright edge along hair, shoulder, and silhouette',
        'Face reads mostly dark with a luminous outline',
      ],
      fixes: [
        ['Light spilling onto the face front', 'Key is too far forward — move it behind the shoulder line'],
        ['No rim visible', 'Key is directly behind subject — angle it off-axis 30–45°'],
        ['Double rim on both sides', 'One of your sources is fronting — isolate the back key'],
      ],
    },
    distance: {
      lookFor: [
        'Rim is a clean edge, not a halo blur',
        'Separation between subject and background',
        'Highlight holds detail, not blown',
      ],
      fixes: [
        ['Rim is blown out and flaring', 'Back the light off or flag lens from direct hit'],
        ['Rim fading into background', 'Pull closer or darken the background'],
        ['Lens flare washing image', 'Add a flag between light and camera'],
      ],
    },
    height: {
      lookFor: [
        'Rim traces hair, temple, cheekbone, jaw — top-down path',
        'No rim line breaking mid-face',
        'Shoulder gets rim without flood onto chest',
      ],
      fixes: [
        ['Only hair is rim-lit', 'Lower the light to catch more of the face edge'],
        ['Rim hits the eye socket directly', 'Raise and tilt away from the eye plane'],
        ['Pants/shoulder flooded', 'Flag lower spill or tilt light up'],
      ],
    },
    capture: {
      lookFor: [
        'Strong separation rim on dark background',
        'Mood is dramatic, cinematic, high-contrast',
        'Face detail is minimal — outline does the work',
      ],
      fixes: [
        ['Too dark to read the subject', 'Add minimal front fill — whisper, not key'],
        ['Drifted to silhouette', 'Boost any available front ambient'],
        ['Background drowning rim', 'Darker background or brighter rim — need 2+ stops'],
      ],
    },
  },

  RING_LIGHT: {
    position: {
      lookFor: [
        'Light encircles the lens — camera peers through the ring',
        'Donut or circular catchlight in both irises',
        'Shadow is an even halo around the subject, NOT directional',
      ],
      fixes: [
        ['Directional shadow on wall', 'Ring is off-axis — center it on the lens'],
        ['Donut catchlight broken', 'Subject is off-center or looking away from the ring'],
        ['Only one eye has the donut', 'Square the subject to the camera/ring axis'],
      ],
    },
    distance: {
      lookFor: [
        'Even, shadowless wrap across the entire face',
        'Signature flat-but-luminous beauty look',
        'Skin reads smooth, porcelain',
      ],
      fixes: [
        ['Face looks harsh/digital', 'Pull closer — ring wants intimate distance'],
        ['Halo shadow creeping onto background', 'Pull subject away from the wall'],
        ['Hot spot on forehead', 'Back ring off or dial power down'],
      ],
    },
    height: {
      lookFor: [
        'Ring centered on the eye line, lens through middle',
        'Donut catchlights sit dead-center at 12 clock position',
        'No bias top or bottom — symmetric wrap',
      ],
      fixes: [
        ['Donut offset low', 'Raise ring to eye level'],
        ['Shadow under chin', 'Ring is above eyeline — drop it'],
        ['Looking up at ring', 'Match subject eyeline exactly'],
      ],
    },
    capture: {
      lookFor: [
        'Perfect circular catchlights — the ring signature',
        'Beauty/editorial look with no cast shadow',
        'Background free of directional shadow',
      ],
      fixes: [
        ['No donut visible', 'Subject is not looking through the ring — recenter'],
        ['Too flat for taste', 'Add a hair light or kicker for separation'],
        ['Skin looks waxy', 'Slight ambient fill will soften the clinical look'],
      ],
    },
  },

  HIGH_KEY: {
    position: {
      lookFor: [
        'Multiple sources lifting shadows everywhere',
        'Background at or near full white',
        'Key light soft and broad — no harsh geometry',
      ],
      fixes: [
        ['Hard shadow visible anywhere', 'Soften or add fill — high-key tolerates no harsh shape'],
        ['Background reading gray', 'Add background lights or raise their output'],
        ['One side dark', 'High-key is ratio 1:1 or 1:1.5 — lift the weak side'],
      ],
    },
    distance: {
      lookFor: [
        'Expansive wrap from large modifiers, close-in',
        'Skin glowing, not blown, with subtle highlights',
        'Negative space in frame is bright white, not textured',
      ],
      fixes: [
        ['Skin losing texture', 'Back the key off slightly — you\'re clipping highlights'],
        ['Background not white enough', 'Move subject further from background OR raise bg lights'],
        ['Ratio feels heavy', 'Bring fill closer OR add another fill source'],
      ],
    },
    height: {
      lookFor: [
        'Soft, even top-down illumination',
        'Minimal under-eye shadow',
        'Chin and jaw both readable without darkness',
      ],
      fixes: [
        ['Under-eye shadow visible', 'Add clamshell fill or lower the key'],
        ['Top of head dark', 'Key is too low — raise it'],
        ['Nose shadow too defined', 'Soften or raise the key'],
      ],
    },
    capture: {
      lookFor: [
        'Bright, airy, optimistic mood',
        'Near-white background without being blown out of the frame',
        'Skin luminous, shadow-free, but with detail',
      ],
      fixes: [
        ['Feels blown out, not high-key', 'Ease key output OR meter to hold highlights'],
        ['Mood reading cold/clinical', 'Warm the key color temp slightly'],
        ['Looks flat/lifeless', 'Add minimal kicker or rim for subtle separation'],
      ],
    },
  },

  LOW_KEY: {
    position: {
      lookFor: [
        'Single directional key, everything else dark',
        'Pools of deep shadow dominate the frame',
        'Background falls to black or near-black',
      ],
      fixes: [
        ['Shadows muddy, not black', 'Flag all ambient spill — low-key demands control'],
        ['Too much fill', 'Cut fill entirely or use negative fill'],
        ['Background reading as gray', 'Add more distance from subject to background'],
      ],
    },
    distance: {
      lookFor: [
        'Controlled, sculpting key — often tighter modifier',
        'Deep falloff from lit side to shadow',
        'Highlights intact, shadows crushed',
      ],
      fixes: [
        ['Highlights clipping', 'Ease the key — drama lives in shadow, not blown white'],
        ['Falloff too gradual', 'Pull key further away OR grid/tighten the modifier'],
        ['Wrap too generous', 'Use a smaller or tighter source'],
      ],
    },
    height: {
      lookFor: [
        'Strong directional shape — Rembrandt or split geometry typical',
        'Clean shadow edges where the light lands',
        'Eyes catch the light, rest of face in mood shadow',
      ],
      fixes: [
        ['Eyes disappearing into shadow', 'Raise or lower key slightly to catch the socket'],
        ['Pattern reading sloppy', 'Commit to a pattern — split or Rembrandt — and shape it'],
        ['Face feels random', 'Pick a geometry and stick with it'],
      ],
    },
    capture: {
      lookFor: [
        'Dark, dramatic, cinematic mood',
        'Deep blacks and controlled highlights',
        'Clear chiaroscuro storytelling',
      ],
      fixes: [
        ['Not dark enough', 'Kill ambient — turn off room lights if needed'],
        ['Feels flat and moody', 'Commit harder to contrast — cut fill entirely'],
        ['Lost detail in shadow', 'Slightly raise fill just for subject, keep bg dark'],
      ],
    },
  },

  FLAT: {
    position: {
      lookFor: [
        'No directional shadow on the face',
        'Even illumination from multiple angles or a huge wrap source',
        'Subject has minimal modeling — fashion/catalog look',
      ],
      fixes: [
        ['Directional shadow visible', 'Add fill opposite the key to eliminate it'],
        ['Catchlights unbalanced', 'Balance both sources — flat wants symmetry'],
        ['Nose shadow present', 'Raise fill or widen wrap'],
      ],
    },
    distance: {
      lookFor: [
        'Close, large sources wrapping the subject',
        'Skin evenly lit, minimal falloff across the face',
        'Clean, editorial, retouch-friendly tonality',
      ],
      fixes: [
        ['Falloff from center to edge of face', 'Pull sources closer OR use larger modifiers'],
        ['Skin hot on one side', 'Balance sources to match output'],
        ['Background darker than subject', 'Light background separately'],
      ],
    },
    height: {
      lookFor: [
        'Sources at or near eye level, symmetric',
        'No top-light shadow under the chin',
        'No cross-shadow on the nose',
      ],
      fixes: [
        ['Shadow under chin', 'Lower the sources toward eye level'],
        ['Eye socket dark', 'Raise slightly OR add small clamshell fill'],
        ['Over-lit forehead', 'Sources too high — drop to eye level'],
      ],
    },
    capture: {
      lookFor: [
        'Clean, even, shadowless portrait',
        'Catalog/fashion/editorial clarity',
        'Skin tone reads accurately with minimal color shift',
      ],
      fixes: [
        ['Feels boring/lifeless', 'Flat is a choice — add a kicker or accent for interest'],
        ['Not flat enough', 'Add more sources or move them closer'],
        ['Reading washed out', 'Pull back overall exposure — flat is not blown'],
      ],
    },
  },
};

function coachingFor(pattern, stepKey) {
  const p = (pattern || '').toUpperCase();
  return PATTERN_COACHING[p]?.[stepKey] || null;
}

// ─── Derive per-step content from engine data ───────────────────────────────
function buildSteps({ pattern, confidence, modName, position, distance,
  heightDisplay, angleDeg, asymmetry, noseShadowAngle, cct, angularArea }) {

  const targetRange = targetRangeFor(pattern);
  const coach = stepKey => coachingFor(pattern, stepKey);

  // PHOTOGRAPHER — terse numeric leads, angle is primary photographer speak
  const photographer = [
    {
      key: 'position',
      title: 'KEY ANGLE',
      lead: angleDeg != null ? `${angleDeg}°` : position,
      subLead: targetRange
        ? `${pattern.toLowerCase()} target ${targetRange} · ${position}`
        : (angleDeg != null ? `${position} · ${modName}` : modName),
      coach: coach('position'),
    },
    {
      key: 'distance',
      title: 'DISTANCE',
      lead: distance,
      subLead: angularArea ? `${angularArea} wrap` : 'to subject',
      coach: coach('distance'),
    },
    {
      key: 'height',
      title: 'HEIGHT',
      lead: heightDisplay,
      subLead: 'tilt onto eyes',
      coach: coach('height'),
    },
    {
      key: 'capture',
      title: 'READY',
      lead: pattern,
      subLead: `${confidence}% confidence`,
      coach: coach('capture'),
    },
  ];

  // ASSISTANT — single HUGE command, imperative verbs, angle leads, clock as sub
  const assistant = [
    {
      key: 'position',
      verb: 'PLACE KEY',
      command: angleDeg != null ? `${angleDeg}°` : (position || '').toUpperCase(),
      subCommand: (() => {
        const parts = [];
        if (position) parts.push(position.toUpperCase());
        if (targetRange) parts.push(`${pattern} ${targetRange}`);
        return parts.length ? parts.join(' · ') : null;
      })(),
      coach: coach('position'),
    },
    {
      key: 'distance',
      verb: 'DISTANCE',
      command: (distance || '').toUpperCase(),
      coach: coach('distance'),
    },
    {
      key: 'height',
      verb: 'HEIGHT',
      command: (heightDisplay || '').toUpperCase(),
      coach: coach('height'),
    },
    {
      key: 'capture',
      verb: 'FIRE FRAME',
      command: pattern,
      coach: coach('capture'),
    },
  ];

  // LEARNING — narrative lead + WHY callout with lighting theory + data
  const learning = [
    {
      key: 'position',
      title: 'PLACE THE KEY LIGHT',
      lead: `Place the ${modName} at ${position}${angleDeg != null ? ` — about ${angleDeg}° off-axis` : ''}.`,
      why: noseShadowAngle != null
        ? `The nose shadow falls at ${noseShadowAngle.toFixed(0)}°, which is what creates this pattern. ${pattern.toLowerCase()} lighting forms when the key is ~30–45° off-axis — the shadow under the nose curves into a short "loop" or triangle on the shadow-side cheek.`
        : `Clock position is relative to the subject facing camera — 12 is directly behind, 6 is in front. Off-axis placement is what builds a directional pattern instead of flat lighting.`,
      coach: coach('position'),
    },
    {
      key: 'distance',
      title: 'SET THE DISTANCE',
      lead: `Pull the softbox to ${distance} from your subject.`,
      why: angularArea
        ? `Distance controls shadow hardness via apparent light size. At this range, your ${modName} yields ${angularArea} angular area — enough wrap for flattering skin without losing dimensional shadow.`
        : `Closer = softer, more wrap (larger apparent light). Farther = harder shadows, more directional fall-off. Distance is a dial, not a binary.`,
      coach: coach('distance'),
    },
    {
      key: 'height',
      title: 'DIAL THE HEIGHT',
      lead: `Raise the light to ${heightDisplay.toLowerCase()} — tilted down onto the eyes.`,
      why: `Height sets the nose-shadow *length*. Higher placement → longer shadow → more dramatic. Too high and you lose catchlights in the eyes; too low and the pattern flattens into a butterfly. Aim for the catchlight to land around 10–11 o'clock in the iris.`,
      coach: coach('height'),
    },
    {
      key: 'capture',
      title: 'FIRE A FRAME',
      lead: `${pattern} locked at ${confidence}% confidence — capture and compare.`,
      why: asymmetry != null
        ? `Your final reference had ${(asymmetry * 100).toFixed(0)}% left/right shadow asymmetry — that's what keeps this from reading as flat/butterfly. After capture, compare catchlight shape in both eyes: they should be near-identical in position and size.`
        : `Compare your frame against the reference. Catchlight position, shadow triangle under the eye, and shadow-side wrap all need to match. If pattern drifts, step back and re-check position before touching height.`,
      coach: coach('capture'),
    },
  ];

  return { photographer, assistant, learning };
}

export default function Day1ShootScreen({ result, imagePreview, mode = 'photographer', onExit }) {
  const [capturePressed, setCapturePressed] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [framesCaptured, setFramesCaptured] = useState(0);
  const [justCaptured, setJustCaptured] = useState(false);
  const [heroZoomed, setHeroZoomed] = useState(false);
  const [outcomeOpen, setOutcomeOpen] = useState(false);
  const outcomeSentRef = useRef(false);

  // Long-press detection for hero zoom — same trigger feel as ResultScreen.
  const heroLongPressTimer = useRef(null);
  const heroLongPressFired = useRef(false);
  const startHeroLongPress = useCallback(() => {
    heroLongPressFired.current = false;
    if (heroLongPressTimer.current) clearTimeout(heroLongPressTimer.current);
    heroLongPressTimer.current = setTimeout(() => {
      heroLongPressTimer.current = null;
      heroLongPressFired.current = true;
      longPressHaptic();
      setHeroZoomed(true);
    }, 500);
  }, []);
  const endHeroLongPress = useCallback(() => {
    if (heroLongPressTimer.current) {
      clearTimeout(heroLongPressTimer.current);
      heroLongPressTimer.current = null;
    }
  }, []);
  const heroPressHandlers = {
    onPointerDown: startHeroLongPress,
    onPointerUp: endHeroLongPress,
    onPointerLeave: endHeroLongPress,
    onPointerCancel: endHeroLongPress,
  };

  const modeInfo = MODE_LABELS[mode] || MODE_LABELS.photographer;
  const isAssistant = mode === 'assistant';
  const isLearning = mode === 'learning';

  // ── Derived engine data ────────────────────────────────────────────────────
  const pattern = result?.pattern || 'SETUP';
  const confidence = result?.confidence ?? 0;
  const modName = result?.sections?.modifier?.family || 'Modifier';
  const position = result?.sections?.modifier?.position
    || result?._raw?.lighting_inference?.key_position_text
    || '—';
  const distance = result?.sections?.modifier?.distRange || '—';
  const angularArea = result?.sections?.modifier?.angularArea || null;
  const heightRaw = result?._raw?.reconstruction?.key_light_height
    || result?._raw?.lighting_inference?.key_elevation;
  const heightDisplay = (() => {
    if (!heightRaw) return '—';
    if (typeof heightRaw === 'string') return heightRaw.charAt(0).toUpperCase() + heightRaw.slice(1);
    if (typeof heightRaw === 'number') {
      if (heightRaw >= 0.66) return 'High';
      if (heightRaw >= 0.33) return 'Medium';
      return 'Low';
    }
    return '—';
  })();
  const angleDeg = result?._raw?.reconstruction?.key_light_angle_deg;
  const signals = result?._raw?.signal_diagnostics?.signals || {};
  const asymmetry = signals.left_right_asymmetry;
  const noseShadowAngle = signals.nose_shadow_angle_deg;
  const cct = result?._raw?.lighting_inference?.detected_cct_kelvin
    || result?._raw?.reconstruction?.dominant_cct_kelvin;

  const stepsAll = useMemo(() => buildSteps({
    pattern, confidence, modName, position, distance, heightDisplay,
    angleDeg: (typeof angleDeg === 'number') ? Math.round(angleDeg) : null,
    asymmetry, noseShadowAngle, cct, angularArea,
  }), [pattern, confidence, modName, position, distance, heightDisplay,
       angleDeg, asymmetry, noseShadowAngle, cct, angularArea]);

  const steps = stepsAll[mode] || stepsAll.photographer;
  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;
  const isFirst = stepIndex === 0;

  useEffect(() => {
    trackEvent('SHOOT_MODE_ENTERED', { pattern, confidence, mode });
  }, [pattern, confidence, mode]);

  useEffect(() => {
    trackEvent('SHOOT_MODE_STEP_VIEW', { mode, stepKey: step.key, stepIndex });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  // Build the signal payload from the Day1 result schema and fire it.
  // Every cockpit session must produce a signal — pass null for "skipped".
  const fireOutcomeSignal = useCallback((outcomeValue) => {
    if (outcomeSentRef.current) return;
    outcomeSentRef.current = true;
    const _user = (() => { try { return getUser(); } catch { return null; } })();
    const _patternId = result?._raw?.authoritative_pattern || (result?.pattern || '').toLowerCase();
    if (!_patternId) return; // nothing to attribute
    postSignal({
      pattern_id:        _patternId,
      confidence_score:  typeof result?.confidence === 'number' ? result.confidence / 100 : null,
      outcome:           outcomeValue, // null → 'unknown'
      session_id:        (() => { try { return getSessionId(); } catch { return null; } })(),
      user_id:           _user?.id || null,
      input_method:      'reference_photo',
      subject_type:      result?._raw?.subject_type || null,
      environment:       result?._raw?.lighting_inference?.detected_environment || null,
      mood:              null,
      shoot_mode_entered: true,
      steps_completed:    Math.min(stepIndex + 1, steps.length),
      steps_total:        steps.length,
      deviation_count:    0,
      saved_setup:        false,
      upgraded:           false,
      revenue_value:      0,
    });
    trackEvent('OUTCOME_CAPTURED', { mode, outcome: outcomeValue || 'skipped', framesCaptured });
  }, [result, mode, stepIndex, steps, framesCaptured]);

  const handleExit = () => {
    navHaptic(); navSlideSound();
    // If they shot at least one frame, capture an outcome before leaving
    if (framesCaptured > 0 && !outcomeSentRef.current) {
      trackEvent('SHOOT_MODE_EXIT', { mode, framesCaptured });
      setOutcomeOpen(true);
      return;
    }
    onExit?.();
  };
  const handlePrev = () => {
    if (isFirst) return;
    navHaptic(); softClickSound();
    setStepIndex((i) => Math.max(0, i - 1));
  };
  const handleNext = () => {
    if (isLast) return;
    tapHaptic(); softClickSound();
    setStepIndex((i) => Math.min(steps.length - 1, i + 1));
  };
  const handleCapture = () => {
    if (!isLast) { handleNext(); return; }
    successHaptic(); softClickSound();
    const n = framesCaptured + 1;
    setFramesCaptured(n);
    setJustCaptured(true);
    trackEvent('SHOOT_MODE_FRAME_CAPTURED', { mode, frameCount: n });
    setTimeout(() => setJustCaptured(false), 1600);
    // Assistant auto-returns to step 1 for next take after brief ack
    if (isAssistant) {
      setTimeout(() => setStepIndex(0), 1800);
    }
  };
  const handleDone = () => {
    successHaptic(); navSlideSound();
    trackEvent('SHOOT_MODE_DONE', { mode, framesCaptured });
    if (!outcomeSentRef.current) {
      setOutcomeOpen(true);
      return;
    }
    onExit?.();
  };

  const handleOutcomePick = useCallback((outcome) => {
    fireOutcomeSignal(outcome);
    // Brief delay so the user sees the confirmation copy before we exit
    setTimeout(() => {
      setOutcomeOpen(false);
      onExit?.();
    }, 1100);
  }, [fireOutcomeSignal, onExit]);

  const handleOutcomeDismiss = useCallback(() => {
    // Per signal hygiene rule: every session must produce a signal
    fireOutcomeSignal(null);
    setOutcomeOpen(false);
    onExit?.();
  }, [fireOutcomeSignal, onExit]);

  // ── Role-specific body ────────────────────────────────────────────────────
  const body = isAssistant
    ? <AssistantBody step={step} />
    : isLearning
      ? <LearningBody step={step} imagePreview={imagePreview}
          result={result} stepKey={step.key} position={position}
          angleDeg={angleDeg} distance={distance} pattern={pattern} mode={mode}
          heroPressHandlers={heroPressHandlers} />
      : <PhotographerBody step={step} imagePreview={imagePreview}
          modName={modName} position={position} distance={distance}
          heightDisplay={heightDisplay} angleDeg={angleDeg}
          pattern={pattern} confidence={confidence} cct={cct}
          result={result} stepKey={step.key} mode={mode}
          heroPressHandlers={heroPressHandlers} />;

  const primaryLabel = justCaptured
    ? (isAssistant ? 'FRAME GOT' : 'FRAME CAPTURED')
    : isLast
      ? (framesCaptured > 0 ? `CAPTURE · ${framesCaptured + 1}` : 'CAPTURE')
      : (isAssistant ? 'READY' : 'NEXT STEP');

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: '#000', overflow: 'hidden' }}>
      <div
        onTouchStart={(e) => { if (e.target === e.currentTarget) grainHaptic(); }}
        onTouchMove={(e) => { if (e.target === e.currentTarget) grainHaptic(); }}
        style={{
        width: '100%', maxWidth: 430, height: '100%', margin: '0 auto',
        backgroundColor: C.bg,
        display: 'flex', flexDirection: 'column',
        position: 'relative', fontFamily: 'Inter, system-ui, sans-serif',
      }}>

        {/* ── Matte metal surface — layered ambient wash, vignette, specular edge, grain ── */}
        <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 75% 55% at 50% 22%, rgba(120,148,175,0.022) 0%, rgba(132, 158, 184,0.008) 40%, transparent 72%)' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 55% 38% at 50% 58%, rgba(180,150,110,0.008) 0%, transparent 65%)' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 118% 88% at 50% 50%, transparent 52%, rgba(0,0,0,0.45) 100%)' }} />
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(141.71deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.018) 40%, transparent 80%)' }} />
          <div style={{ position: 'absolute', inset: 0, opacity: 0.16, mixBlendMode: 'multiply',
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.32' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
            backgroundSize: '128px 128px' }} />
        </div>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px 10px', position: 'relative', zIndex: 1,
          flexShrink: 0,
        }}>
          <button
            onClick={handleExit}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: steel(0.65), fontSize: 14, padding: '4px 0',
              WebkitTapHighlightColor: 'transparent', ...FONT_SMOOTH,
            }}
          >
            ‹ Exit
          </button>
          <div style={{ textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: KEY_ACCENT,
              letterSpacing: '1.4px', ...FONT_SMOOTH }}>
              COCKPIT
            </p>
            <p style={{ margin: '2px 0 0', fontSize: 9, fontWeight: 600, color: steel(0.5),
              letterSpacing: '0.9px', ...FONT_SMOOTH }}>
              {modeInfo.tag} · STEP {stepIndex + 1}/{steps.length}
            </p>
          </div>
          {framesCaptured > 0 ? (
            <button
              onClick={handleDone}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: C.confHigh, fontSize: 12, fontWeight: 700,
                letterSpacing: '0.6px', padding: '4px 0',
                WebkitTapHighlightColor: 'transparent', ...FONT_SMOOTH,
              }}
            >
              DONE · {framesCaptured}
            </button>
          ) : (
            <div style={{ width: 40 }} />
          )}
        </div>

        {/* Scrollable body region — flex-1 so it expands, overflow-y:auto so tall coaching content scrolls */}
        <div style={{
          flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
          position: 'relative', zIndex: 1,
        }}>
          {body}
        </div>

        {/* Step dots (hidden in assistant — they get their own big indicator) */}
        {!isAssistant && (
          <div style={{
            display: 'flex', justifyContent: 'center', gap: 6,
            padding: '16px 20px 0', position: 'relative', zIndex: 1,
            flexShrink: 0,
          }}>
            {steps.map((_, i) => (
              <div key={i} style={{
                width: i === stepIndex ? 18 : 6, height: 6, borderRadius: 3,
                backgroundColor: i === stepIndex ? KEY_ACCENT : steel(0.18),
                transition: 'width 0.2s ease, background-color 0.2s ease',
              }} />
            ))}
          </div>
        )}

        {/* Cockpit action row — Prev / Capture|Next / Next */}
        <div style={{
          padding: '16px 20px 20px', position: 'relative', zIndex: 1,
          display: 'flex', alignItems: 'center', gap: 12,
          flexShrink: 0,
        }}>
          <button
            onClick={handlePrev}
            disabled={isFirst}
            style={{
              flex: '0 0 auto',
              width: isAssistant ? 64 : 52, height: isAssistant ? 64 : 52,
              borderRadius: isAssistant ? 32 : 26,
              backgroundColor: C.pillBg,
              boxShadow: 'inset 0px 2px 4px rgba(0,0,0,0.55), inset 0px 1px 2px rgba(0,0,0,0.35)',
              border: 'none', cursor: isFirst ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: isFirst ? steel(0.25) : steel(0.7),
              fontSize: isAssistant ? 26 : 20,
              WebkitTapHighlightColor: 'transparent',
              transition: 'color 0.15s ease',
              ...FONT_SMOOTH,
            }}
          >‹</button>

          <button
            onClick={handleCapture}
            onPointerDown={() => { setCapturePressed(true); tapHaptic(); }}
            onPointerUp={() => setCapturePressed(false)}
            onPointerLeave={() => setCapturePressed(false)}
            style={{
              flex: 1, height: isAssistant ? 64 : 52,
              borderRadius: isAssistant ? 32 : 26,
              background: justCaptured
                ? 'linear-gradient(141.71deg, rgba(72,186,136,0.55) 0%, rgba(72,186,136,0.3) 100%)'
                : CTA_BG,
              boxShadow: capturePressed
                ? 'inset 0px 2px 4px rgba(0,0,0,0.5)'
                : `${CTA_SHADOW}, ${CTA_BEVEL}`,
              border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              WebkitTapHighlightColor: 'transparent',
              transform: capturePressed ? 'scale(0.98)' : 'scale(1)',
              transition: 'transform 0.1s ease, box-shadow 0.1s ease, background 0.25s ease',
            }}
          >
            {justCaptured && (
              <svg width={isAssistant ? 18 : 14} height={isAssistant ? 18 : 14} viewBox="0 0 24 24" fill="none"
                stroke="rgba(245,247,250,0.95)" strokeWidth="3"
                strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
            )}
            <span style={{
              fontSize: isAssistant ? 16 : 13,
              fontWeight: isAssistant ? 800 : 600,
              color: 'rgba(245,247,250,0.95)',
              letterSpacing: isAssistant ? '1.4px' : '0.8px',
              ...FONT_SMOOTH,
            }}>
              {primaryLabel}
            </span>
          </button>

          <button
            onClick={handleNext}
            disabled={isLast}
            style={{
              flex: '0 0 auto',
              width: isAssistant ? 64 : 52, height: isAssistant ? 64 : 52,
              borderRadius: isAssistant ? 32 : 26,
              backgroundColor: C.pillBg,
              boxShadow: 'inset 0px 2px 4px rgba(0,0,0,0.55), inset 0px 1px 2px rgba(0,0,0,0.35)',
              border: 'none', cursor: isLast ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: isLast ? steel(0.25) : steel(0.7),
              fontSize: isAssistant ? 26 : 20,
              WebkitTapHighlightColor: 'transparent',
              transition: 'color 0.15s ease',
              ...FONT_SMOOTH,
            }}
          >›</button>
        </div>

        {/* iOS home indicator */}
        <div style={{ height: 34, display: 'flex', alignItems: 'center',
          justifyContent: 'center', position: 'relative', zIndex: 1 }}>
          <div style={{ width: 134, height: 5, borderRadius: 3,
            backgroundColor: 'rgba(245,247,250,0.06)' }} />
        </div>
      </div>

      {/* Hero zoom — long-press the cockpit photo to enter fullscreen */}
      <ZoomableHeroOverlay
        src={imagePreview}
        isOpen={heroZoomed}
        onClose={() => setHeroZoomed(false)}
      />

      {/* Outcome capture — every cockpit session must produce a signal */}
      <NailedItOverlay
        isOpen={outcomeOpen}
        onSelect={handleOutcomePick}
        onDismiss={handleOutcomeDismiss}
      />
    </div>
  );
}

// ─── Photographer body ──────────────────────────────────────────────────────
function PhotographerBody({ step, imagePreview, modName, position, distance,
  heightDisplay, angleDeg, pattern, confidence, cct, result, stepKey, mode, heroPressHandlers }) {
  return (
    <>
      {/* Dense hero card with full spec grid */}
      <div style={{ padding: '12px 20px 0', position: 'relative', zIndex: 1 }}>
        <div style={{
          backgroundColor: C.panelBg, borderRadius: 16,
          boxShadow: `${PANEL_SHADOW}, ${PANEL_BEVEL}`,
          padding: '14px 16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <p style={{ margin: 0, fontSize: 10, fontWeight: 700, color: KEY_ACCENT,
              letterSpacing: '1.2px', ...FONT_SMOOTH }}>
              KEY LIGHT · {modName.toUpperCase()}
            </p>
            <p style={{ margin: 0, fontSize: 10, fontWeight: 600,
              color: confidence >= 70 ? C.confHigh : C.confLow,
              letterSpacing: '0.6px', ...FONT_SMOOTH }}>
              {confidence}% · {pattern}
            </p>
          </div>

          {/* 4-cell spec grid — ANGLE leads, clock + pattern target as sub */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 10, marginTop: 12,
          }}>
            <SpecCell label="ANGLE"
              value={angleDeg != null ? `${Math.round(angleDeg)}°` : position}
              sub={(() => {
                const parts = [];
                if (angleDeg != null && position) parts.push(position);
                const tr = targetRangeFor(pattern);
                if (tr) parts.push(`target ${tr}`);
                return parts.length ? parts.join(' · ') : null;
              })()} />
            <SpecCell label="DIST" value={distance} />
            <SpecCell label="HEIGHT" value={heightDisplay} />
            <SpecCell label="CCT"
              value={cct ? `${cct}K` : '—'} />
          </div>
        </div>
      </div>

      {imagePreview && (
        <div
          {...(heroPressHandlers || {})}
          style={{ padding: '10px 20px 0', position: 'relative', zIndex: 1,
            display: 'flex', justifyContent: 'center', cursor: 'zoom-in', WebkitTapHighlightColor: 'transparent' }}
        >
          <ReferenceWithOverlay
            imagePreview={imagePreview}
            result={result}
            stepKey={stepKey}
            position={position}
            angleDeg={angleDeg}
            distance={distance}
            maxHeight={290}
            mode="photographer"
          />
        </div>
      )}

      {/* Terse step lead */}
      <div style={{ padding: '14px 24px 0', position: 'relative', zIndex: 1, textAlign: 'center' }}>
        <p style={{ margin: 0, fontSize: 10, fontWeight: 700,
          color: KEY_ACCENT, letterSpacing: '1.2px', ...FONT_SMOOTH }}>
          {step.title}
        </p>
        <p style={{ margin: '6px 0 0', fontSize: 22, fontWeight: 800,
          color: C.textPrimary, letterSpacing: '-0.5px', ...FONT_SMOOTH }}>
          {step.lead}
        </p>
        {step.subLead && (
          <p style={{ margin: '3px 0 0', fontSize: 11, fontWeight: 500,
            color: C.textSub, letterSpacing: '0.3px', ...FONT_SMOOTH }}>
            {step.subLead}
          </p>
        )}
      </div>

      <CoachingPanel coach={step.coach} variant="photographer" />
    </>
  );
}

// ─── Coaching panel ─────────────────────────────────────────────────────────
// Per-step visual cues + troubleshooting fixes, pulled from PATTERN_COACHING.
// Shown in Photographer (compact) and Learning (spacious) modes. The panel
// is intentionally terse: bullets, not prose. Fixes render as symptom → fix
// so the photographer can scan for the symptom they're seeing.
function CoachingPanel({ coach, variant = 'photographer' }) {
  if (!coach) return null;
  const isLearning = variant === 'learning';
  const pad = isLearning ? '14px 16px' : '10px 12px';
  const labelFs = isLearning ? 9 : 8;
  const itemFs = isLearning ? 11 : 10;
  const symptomFs = isLearning ? 10 : 9;
  const colGap = isLearning ? 14 : 10;

  return (
    <div style={{
      padding: isLearning ? '14px 20px 0' : '12px 20px 0',
      position: 'relative', zIndex: 1,
    }}>
      <div style={{
        backgroundColor: C.panelBg,
        borderRadius: 10,
        boxShadow: `inset 0px 0px 0px 1px rgba(255,255,255,0.03), ${PANEL_BEVEL}`,
        padding: pad,
        display: 'flex', gap: colGap,
      }}>
        {/* LOOK FOR — visual cues */}
        {coach.lookFor && coach.lookFor.length > 0 && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: labelFs, fontWeight: 800,
              color: '#48ba88', letterSpacing: '1.2px', ...FONT_SMOOTH }}>
              LOOK FOR
            </p>
            <ul style={{ margin: '6px 0 0', padding: 0, listStyle: 'none' }}>
              {coach.lookFor.map((cue, i) => (
                <li key={i} style={{
                  fontSize: itemFs, fontWeight: 500,
                  color: C.textSub, lineHeight: 1.4,
                  marginTop: i === 0 ? 0 : 5,
                  paddingLeft: 10, position: 'relative',
                  ...FONT_SMOOTH,
                }}>
                  <span style={{
                    position: 'absolute', left: 0, top: isLearning ? 5 : 4,
                    width: 3, height: 3, borderRadius: 2,
                    backgroundColor: 'rgba(72,186,136,0.7)',
                  }} />
                  {cue}
                </li>
              ))}
            </ul>
          </div>
        )}
        {/* FIXES — symptom → adjustment */}
        {coach.fixes && coach.fixes.length > 0 && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: labelFs, fontWeight: 800,
              color: '#d67b4e', letterSpacing: '1.2px', ...FONT_SMOOTH }}>
              FIXES
            </p>
            <ul style={{ margin: '6px 0 0', padding: 0, listStyle: 'none' }}>
              {coach.fixes.map(([symptom, fix], i) => (
                <li key={i} style={{
                  marginTop: i === 0 ? 0 : 6,
                  lineHeight: 1.35,
                }}>
                  <p style={{ margin: 0, fontSize: symptomFs, fontWeight: 700,
                    color: 'rgba(214,123,78,0.85)', ...FONT_SMOOTH }}>
                    {symptom}
                  </p>
                  <p style={{ margin: '1px 0 0', fontSize: itemFs, fontWeight: 500,
                    color: C.textSub, ...FONT_SMOOTH }}>
                    → {fix}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function SpecCell({ label, value, sub }) {
  return (
    <div>
      <p style={{ margin: 0, fontSize: 8, fontWeight: 600,
        color: steel(0.45), letterSpacing: '0.8px', ...FONT_SMOOTH }}>
        {label}
      </p>
      <p style={{ margin: '2px 0 0', fontSize: 12, fontWeight: 700,
        color: C.textPrimary, letterSpacing: '-0.1px', ...FONT_SMOOTH,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {value}
      </p>
      {sub && (
        <p style={{ margin: '1px 0 0', fontSize: 9, fontWeight: 500,
          color: steel(0.45), letterSpacing: '0.1px', ...FONT_SMOOTH,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {sub}
        </p>
      )}
    </div>
  );
}

// ─── Assistant body — single HUGE command ──────────────────────────────────
function AssistantBody({ step }) {
  return (
    <div style={{
      padding: '24px 24px 0', position: 'relative', zIndex: 1,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', flex: '0 0 auto',
    }}>
      <p style={{
        margin: 0, fontSize: 12, fontWeight: 700,
        color: KEY_ACCENT, letterSpacing: '2.0px', ...FONT_SMOOTH,
      }}>
        {step.verb}
      </p>
      <p style={{
        margin: '24px 0 0', fontSize: 56, fontWeight: 900,
        color: C.textPrimary, letterSpacing: '-2.0px',
        lineHeight: 1.0, textAlign: 'center',
        textShadow: '0px 2px 8px rgba(0,0,0,0.8)',
        ...FONT_SMOOTH,
      }}>
        {step.command}
      </p>
      {step.subCommand && (
        <p style={{
          margin: '16px 0 0', fontSize: 22, fontWeight: 700,
          color: steel(0.6), letterSpacing: '0.5px',
          textAlign: 'center', ...FONT_SMOOTH,
        }}>
          {step.subCommand}
        </p>
      )}
      {/* Assistant stays terse — single "IF X → Y" line from the first fix */}
      {step.coach?.fixes?.[0] && (
        <p style={{
          margin: '28px 0 0', fontSize: 13, fontWeight: 600,
          color: steel(0.5), letterSpacing: '0.8px',
          textAlign: 'center', lineHeight: 1.4,
          textTransform: 'uppercase',
          ...FONT_SMOOTH,
        }}>
          IF {step.coach.fixes[0][0]} → {step.coach.fixes[0][1]}
        </p>
      )}
    </div>
  );
}

// ─── Learning body — narrative lead + WHY callout + big reference ──────────
function LearningBody({ step, imagePreview, result, stepKey, position, angleDeg, distance, pattern, mode, heroPressHandlers }) {
  return (
    <>
      {imagePreview && (
        <div
          {...(heroPressHandlers || {})}
          style={{ padding: '12px 20px 0', position: 'relative', zIndex: 1,
            display: 'flex', justifyContent: 'center', cursor: 'zoom-in', WebkitTapHighlightColor: 'transparent' }}
        >
          <ReferenceWithOverlay
            imagePreview={imagePreview}
            result={result}
            stepKey={stepKey}
            position={position}
            angleDeg={angleDeg}
            distance={distance}
            pattern={pattern}
            maxHeight={340}
            mode="learning"
          />
        </div>
      )}

      <div style={{ padding: '18px 22px 0', position: 'relative', zIndex: 1 }}>
        <p style={{ margin: 0, fontSize: 10, fontWeight: 700,
          color: KEY_ACCENT, letterSpacing: '1.2px',
          textAlign: 'center', ...FONT_SMOOTH }}>
          {step.title}
        </p>
        <p style={{ margin: '8px 0 0', fontSize: 16, fontWeight: 700,
          color: C.textPrimary, letterSpacing: '-0.2px',
          lineHeight: 1.35, textAlign: 'center', ...FONT_SMOOTH }}>
          {step.lead}
        </p>
      </div>

      {/* WHY callout — lighting theory from signal diagnostics */}
      {step.why && (
        <div style={{ padding: '14px 20px 0', position: 'relative', zIndex: 1 }}>
          <div style={{
            backgroundColor: C.panelBg,
            borderRadius: 12,
            boxShadow: `inset 0px 0px 0px 1px rgba(200,155,69,0.14), ${PANEL_BEVEL}`,
            padding: '12px 14px',
          }}>
            <p style={{ margin: 0, fontSize: 9, fontWeight: 700,
              color: KEY_ACCENT, letterSpacing: '1.4px', ...FONT_SMOOTH }}>
              WHY
            </p>
            <p style={{ margin: '6px 0 0', fontSize: 12, fontWeight: 500,
              color: C.textSub, lineHeight: 1.55, ...FONT_SMOOTH }}>
              {step.why}
            </p>
          </div>
        </div>
      )}

      <CoachingPanel coach={step.coach} variant="learning" />
    </>
  );
}

// ─── Reference photo with per-step catchlight / key-light overlays ─────────
// Role-aware: Photographer gets minimal clinical markers; Learning gets
// labeled educational annotations. Assistant never renders a photo at all.
function ReferenceWithOverlay({ imagePreview, result, stepKey, position, angleDeg, distance, pattern, mode = 'photographer', maxHeight = 300 }) {
  const imgDim = result?._raw?.image_dimensions
    || result?._raw?.description?.size
    || { width: 1177, height: 1592 };
  const W = imgDim.width || 1177;
  const H = imgDim.height || 1592;

  const catchlights = result?._raw?.cv?.catchlights?.catchlights
    || result?._raw?.description?.vision?.catchlights?.catchlights
    || [];
  const faceGeom = result?._raw?.cv?.catchlights?.face_geometry
    || result?._raw?.description?.vision?.catchlights?.face_geometry
    || {};
  const signals = result?._raw?.signal_diagnostics?.signals || {};

  // Presence flags — the engine produces nose_tip/chin/forehead_top only on
  // the MediaPipe landmark path. On the estimated-from-face-box fallback path
  // those are absent, so we must synthesize them from what's available or
  // suppress the overlay that depends on them.
  const hasEyes = !!(faceGeom.left_eye_center && faceGeom.right_eye_center);
  const leftEye = faceGeom.left_eye_center || [W * 0.45, H * 0.4];
  const rightEye = faceGeom.right_eye_center || [W * 0.55, H * 0.4];
  const chin = faceGeom.chin || [W / 2, H * 0.7];
  const foreheadTop = faceGeom.forehead_top || [W / 2, H * 0.3];
  // Derived nose tip: prefer engine landmark. Fallback: eye midpoint shifted
  // down by ~1.1× interocular distance (face-proportion heuristic). Only
  // synthesize when we actually have both eye centers.
  const noseTip = (() => {
    if (faceGeom.nose_tip) return faceGeom.nose_tip;
    if (!hasEyes) return null;
    const midX = (leftEye[0] + rightEye[0]) / 2;
    const midY = (leftEye[1] + rightEye[1]) / 2;
    if (faceGeom.chin) {
      return [midX, midY + (chin[1] - midY) * 0.55];
    }
    const eyeDist = Math.hypot(rightEye[0] - leftEye[0], rightEye[1] - leftEye[1]);
    return [midX, midY + eyeDist * 1.1];
  })();

  // Pick primary key catchlight (highest intensity × size). Track by index so
  // `catchlights[primaryIdx] === primaryKey` lets downstream strict-equality
  // checks identify the primary (a spread copy would break reference equality).
  const primaryIdx = (() => {
    let bestIdx = -1;
    let bestScore = -1;
    catchlights.forEach((c, i) => {
      const score = (c.intensity || 0) * (c.size_ratio || 0);
      if (score > bestScore) { bestScore = score; bestIdx = i; }
    });
    return bestIdx;
  })();
  const primaryKey = primaryIdx >= 0 ? catchlights[primaryIdx] : null;

  // Clock string → unit vector (SVG screen coords, y-down; 12 = up)
  // Parse hour portion (e.g. "1 o'clock" or "1:30 o'clock")
  const clockHour = (() => {
    const m = (position || '').match(/(\d+)(?::(\d+))?\s*o'?clock/i);
    if (!m) return 1;
    return parseInt(m[1]) + (m[2] ? parseInt(m[2]) / 60 : 0);
  })();
  const clockVec = (() => {
    const angle = ((clockHour % 12) * 30 - 90) * Math.PI / 180;
    return { dx: Math.cos(angle), dy: Math.sin(angle) };
  })();

  // Face centroid (used for sizing & fallback arrow origin)
  const faceCx = (leftEye[0] + rightEye[0]) / 2;
  const faceCy = (foreheadTop[1] + chin[1]) / 2 - (chin[1] - foreheadTop[1]) * 0.25;
  const padding = Math.min(W, H) * 0.06;

  // Key-light arrow ANCHORS AT THE CATCHLIGHT (not face center).
  // This visually communicates: the catchlight in the eye IS the observable
  // evidence of where the key light is coming from. The arrow shows the
  // direction the light travels OUTWARD from that reflection point.
  const anchorX = primaryKey ? primaryKey.abs_cx : faceCx;
  const anchorY = primaryKey ? primaryKey.abs_cy : faceCy;

  const maxArrowLen = Math.min(
    clockVec.dx > 0 ? (W - padding - anchorX) / Math.max(0.001, clockVec.dx) : Infinity,
    clockVec.dx < 0 ? (anchorX - padding) / Math.max(0.001, -clockVec.dx) : Infinity,
    clockVec.dy > 0 ? (H - padding - anchorY) / Math.max(0.001, clockVec.dy) : Infinity,
    clockVec.dy < 0 ? (anchorY - padding - Math.min(W, H) * 0.08) / Math.max(0.001, -clockVec.dy) : Infinity
  );
  const arrowLen = Math.min(Math.min(W, H) * 0.38, maxArrowLen);
  // Arrow starts AT the primary catchlight center so the visual anchor is
  // unambiguous. The bright dot + ring render on top of the line, so the
  // overlap reads as "the line emerges from this catchlight."
  const arrowStartX = anchorX;
  const arrowStartY = anchorY;
  const arrowEndX = anchorX + clockVec.dx * arrowLen;
  const arrowEndY = anchorY + clockVec.dy * arrowLen;

  // Nose shadow: opposite direction of light, shorter
  const shadowLen = Math.min(W, H) * 0.14;
  const shadowEndX = noseTip ? noseTip[0] - clockVec.dx * shadowLen : 0;
  const shadowEndY = noseTip ? noseTip[1] - clockVec.dy * shadowLen + shadowLen * 0.5 : 0;

  const isLearning = mode === 'learning';

  // Distinct colors for the two concepts:
  //   catchColor — bright warm white; represents the reflection IN the eye
  //   keyColor   — amber; represents the inferred direction of the key light
  const catchColor = '#f5e4b8';
  const keyColor = KEY_ACCENT;
  const distColor = '#48ba88';
  const shadowColor = '#6ea8d1';
  const strokeBase = isLearning ? 7 : 6;
  const fontBase = isLearning ? 40 : 36;
  const ringR = isLearning ? 22 : 18;

  const showKey = stepKey === 'position' || stepKey === 'capture';
  const showDist = stepKey === 'distance' || stepKey === 'capture';
  const showShadow = stepKey === 'height' || stepKey === 'capture';
  // On the capture step every overlay system renders at once, so suppress
  // text labels to avoid stacking four callouts on one face. Visual markers
  // (rings, arrows) remain.
  const showLabels = isLearning && stepKey !== 'capture';

  // Aspect-preserving container sizes: height first, width derived
  const containerH = maxHeight;
  const containerW = containerH * (W / H);

  return (
    <div style={{
      position: 'relative',
      width: containerW, height: containerH,
      borderRadius: 12, overflow: 'hidden',
      backgroundColor: C.slotBg,
      boxShadow: `${PANEL_SHADOW}, ${PANEL_BEVEL}`,
    }}>
      <img src={imagePreview} alt="Reference"
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        <defs>
          <marker id={`kar-${mode}`} viewBox="0 0 10 10" refX="8" refY="5"
            markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill={keyColor} />
          </marker>
          <marker id={`sar-${mode}`} viewBox="0 0 10 10" refX="8" refY="5"
            markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill={shadowColor} />
          </marker>
        </defs>

        {/* Step 1 / 4:
            CATCHLIGHT POSITION — bright dot + ring on each eye (the reflection)
            KEY LIGHT ANGLE    — dashed arrow originating from the primary
                                 catchlight, extending outward toward the light */}
        {showKey && catchlights.map((c, i) => {
          const isPrimary = c === primaryKey;
          return (
            <g key={`c${i}`}>
              {/* Inner bright dot = the actual catchlight highlight */}
              <circle cx={c.abs_cx} cy={c.abs_cy} r={strokeBase * 0.9}
                fill={catchColor} opacity={isPrimary ? 1 : 0.7} />
              {/* Ring marker around it */}
              <circle cx={c.abs_cx} cy={c.abs_cy} r={ringR}
                fill="none" stroke={catchColor} strokeWidth={strokeBase * 0.55}
                opacity={isPrimary ? 0.95 : 0.5} />
              {isLearning && isPrimary && !showDist && (
                <circle cx={c.abs_cx} cy={c.abs_cy} r={ringR * 1.7}
                  fill="none" stroke={catchColor} strokeWidth={strokeBase * 0.3}
                  opacity="0.3" />
              )}
            </g>
          );
        })}
        {showKey && (
          <g>
            {/* KEY LIGHT ANGLE arrow — anchored at the catchlight, pointing outward */}
            <line x1={arrowStartX} y1={arrowStartY} x2={arrowEndX} y2={arrowEndY}
              stroke={keyColor} strokeWidth={strokeBase * 1.3} opacity="0.92"
              markerEnd={`url(#kar-${mode})`} strokeDasharray={isLearning ? '20 12' : '14 8'}
              strokeLinecap="round" />
            {showLabels && (() => {
              // KEY LIGHT ANGLE label — near the arrow tip, clamped inside image
              const labelX = Math.max(padding, Math.min(W - padding, arrowEndX - fontBase * 0.3));
              const labelY = Math.max(padding + fontBase, arrowEndY + fontBase * 1.0);
              const primary = angleDeg != null ? `KEY · ${Math.round(angleDeg)}°` : 'KEY LIGHT';
              const tr = targetRangeFor(pattern);
              const secondary = tr
                ? `${(pattern || '').toUpperCase()} TARGET ${tr}`
                : `FROM ${(position || '').toUpperCase()}`;
              return (
                <>
                  <text x={labelX} y={labelY} textAnchor="end"
                    fontSize={fontBase} fontWeight="900" fill={keyColor}
                    letterSpacing="2" fontFamily="Inter, system-ui, sans-serif"
                    style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.78)', strokeWidth: 8 }}>
                    {primary}
                  </text>
                  <text x={labelX} y={labelY + fontBase * 0.62} textAnchor="end"
                    fontSize={fontBase * 0.44} fontWeight="700" fill={keyColor}
                    letterSpacing="1.2" fontFamily="Inter, system-ui, sans-serif"
                    style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.78)', strokeWidth: 5 }}>
                    {secondary}
                  </text>
                </>
              );
            })()}
            {/* CATCHLIGHT POSITION label — tags the reflection in the eye */}
            {showLabels && primaryKey && !showDist && (
              <text x={primaryKey.abs_cx - ringR * 1.4} y={primaryKey.abs_cy - ringR * 1.9}
                textAnchor="end"
                fontSize={fontBase * 0.62} fontWeight="800" fill={catchColor}
                letterSpacing="1.5" fontFamily="Inter, system-ui, sans-serif"
                style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.78)', strokeWidth: 6 }}>
                CATCHLIGHT @ {position || ''}
              </text>
            )}
          </g>
        )}

        {/* Step 2 / 4: distance rings at primary catchlight */}
        {showDist && primaryKey && (
          <g>
            <circle cx={primaryKey.abs_cx} cy={primaryKey.abs_cy}
              r={ringR * 2.5} fill="none" stroke={distColor}
              strokeWidth={strokeBase * 0.7} opacity="0.85" />
            <circle cx={primaryKey.abs_cx} cy={primaryKey.abs_cy}
              r={ringR * 3.6} fill="none" stroke={distColor}
              strokeWidth={strokeBase * 0.4} opacity="0.45" strokeDasharray="10 8" />
            {showLabels && (
              <text x={primaryKey.abs_cx + ringR * 4.0} y={primaryKey.abs_cy + 14}
                fontSize={fontBase * 0.9} fontWeight="800" fill={distColor}
                letterSpacing="1.5" fontFamily="Inter, system-ui, sans-serif"
                style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.6)', strokeWidth: 6 }}>
                {distance || 'DIST'}
              </text>
            )}
          </g>
        )}

        {/* Step 3 / 4: nose shadow vector */}
        {showShadow && noseTip && (
          <g>
            <line x1={noseTip[0]} y1={noseTip[1]} x2={shadowEndX} y2={shadowEndY}
              stroke={shadowColor} strokeWidth={strokeBase} opacity="0.9"
              markerEnd={`url(#sar-${mode})`} strokeLinecap="round" />
            <circle cx={noseTip[0]} cy={noseTip[1]} r={strokeBase * 0.9}
              fill={shadowColor} />
            {showLabels && (
              <text x={shadowEndX + 12} y={shadowEndY + 14}
                fontSize={fontBase * 0.75} fontWeight="800" fill={shadowColor}
                letterSpacing="1.4" fontFamily="Inter, system-ui, sans-serif"
                style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.6)', strokeWidth: 5 }}>
                NOSE SHADOW
              </text>
            )}
          </g>
        )}
      </svg>
    </div>
  );
}
