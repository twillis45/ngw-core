/**
 * Symptom System
 * ==============
 * Defines 8 photographic lighting symptoms that can be detected from
 * analysis signals and edge-case flags. Each symptom links to likely
 * causes, fixes, related patterns, and a shoot-mode hint.
 *
 * Usage:
 *   import { SYMPTOMS, getSymptomsFromSignals, getSymptomBySlug } from './symptoms';
 */

export const SYMPTOMS = [
  {
    slug: 'too-flat',
    title: 'Too Flat',
    icon: '▭',
    tagline: 'Light hits the subject evenly — no shadow, no dimension.',
    description:
      'The lighting wraps the subject uniformly, eliminating depth and shape. ' +
      'The face looks two-dimensional, skin tones look washed out, and the overall ' +
      'image lacks the contrast needed to create a compelling portrait.',
    causes: [
      'Main light is too close to the camera axis (ring light / on-camera flash effect)',
      'Fill light is too bright relative to the key — ratio is 1:1 or less',
      'Oversized softbox directly in front with no directional offset',
      'No hair or rim light to separate subject from background',
    ],
    fixes: [
      'Move your main light 30–45° off axis to one side',
      'Reduce fill power or move it further back — aim for a 3:1 to 4:1 ratio',
      'Add a rim or hair light to restore depth behind the subject',
      'Drop the background light or remove it entirely to increase contrast',
    ],
    patterns: ['rembrandt', 'loop', 'split'],
    shootModeHint: 'In Shoot Mode, slide the key light off axis until you see a shadow appear under the nose.',
    relatedSlugs: ['no-catchlight'],
  },
  {
    slug: 'too-harsh',
    title: 'Too Harsh',
    icon: '◈',
    tagline: 'Hard shadows cut across the face — unflattering and distracting.',
    description:
      'The light source is too small, too close, or unmodified, creating sharp-edged ' +
      'shadows that accentuate wrinkles, pores, and facial structure in an unflattering way. ' +
      'Deep shadows under the eyes, nose, and chin are typical tell-tale signs.',
    causes: [
      'Bare strobe or bare speedlight with no modifier',
      'Small modifier (7" reflector, small umbrella) used at close range',
      'Light positioned too high or too far to the side',
      'Reflector or fill panel is missing to open up shadow areas',
    ],
    fixes: [
      'Add a large softbox (at least 24"×24") or a large umbrella as your main light',
      'Move the light closer — larger apparent size reduces harshness',
      'Use a reflector or white fill card on the shadow side',
      'Raise the fill or reduce the key-to-fill ratio below 4:1',
    ],
    patterns: ['butterfly', 'loop', 'flat'],
    shootModeHint: 'Watch the shadow edge under the nose — a feathered edge means the light is soft enough.',
    relatedSlugs: ['blown-highlights'],
  },
  {
    slug: 'no-catchlight',
    title: 'No Catchlight',
    icon: '◎',
    tagline: 'Eyes look flat and lifeless — missing the spark of light.',
    description:
      'Catchlights are the reflections of your light sources in the subject\'s eyes. ' +
      'Without them, eyes appear dull and dead, robbing the portrait of connection and vitality. ' +
      'They are the single most important element for an engaging portrait.',
    causes: [
      'Main light is positioned too far above eye level',
      'Light is behind or beside the subject rather than in front',
      'Subject is looking downward or away from the light',
      'No large enough modifier to create a visible catchlight reflection',
    ],
    fixes: [
      'Lower the main light until you see a catchlight — aim for 10–12 o\'clock position',
      'Have the subject tilt their chin slightly down to reveal the catchlight in the iris',
      'Use a large-enough modifier (octabox, beauty dish, or large reflector)',
      'Check catchlight position in Shoot Mode before finalizing the setup',
    ],
    patterns: ['butterfly', 'flat', 'beauty_dish'],
    shootModeHint: 'Look at the eye nearest the camera — the catchlight should sit at roughly 11 o\'clock.',
    relatedSlugs: ['too-flat'],
  },
  {
    slug: 'blown-highlights',
    title: 'Blown Highlights',
    icon: '◻',
    tagline: 'Overexposed areas are clipping — detail is lost in the whites.',
    description:
      'Highlights are exceeding the sensor\'s dynamic range, resulting in pure white areas ' +
      'with no texture or detail. This is most common on foreheads, cheekbones, and shirt ' +
      'collars. It can also indicate an incorrect overall exposure or power setting.',
    causes: [
      'Strobe power is too high for the camera\'s sync speed and aperture',
      'Key-to-subject distance is too short, increasing effective power',
      'ISO or aperture is set too wide for the power output being used',
      'Multiple lights are all hitting the same highlight area without attenuation',
    ],
    fixes: [
      'Reduce strobe power by 1–2 stops and recheck exposure',
      'Move the main light slightly further from the subject',
      'Stop down the aperture by 1/2 to 1 stop (e.g., f/8 → f/11)',
      'Check your histogram — aim to keep highlights 1/2 stop below the right edge',
    ],
    patterns: ['rembrandt', 'split', 'loop'],
    shootModeHint: 'Enable histogram overlay in your camera. Adjust power until the highlights touch but do not clip.',
    relatedSlugs: ['too-harsh'],
  },
  {
    slug: 'too-dramatic',
    title: 'Too Dramatic',
    icon: '◑',
    tagline: 'High contrast and deep shadows make the image feel moody or severe.',
    description:
      'The lighting ratio is too extreme for the intended mood. Heavy shadow areas, very ' +
      'low key tones, and deep contrast can look powerful in certain genres but become ' +
      'unflattering for standard portraiture or corporate work. The face is partially ' +
      'lost in shadow and expression details disappear.',
    causes: [
      'No fill light or fill is significantly underexposed relative to key',
      'Rembrandt, split, or rim-only lighting pattern used when not appropriate',
      'Background is very dark or black, amplifying contrast',
      'Subject is lit from a steep angle, creating deep under-eye shadows',
    ],
    fixes: [
      'Add a fill reflector or second light on the shadow side at -2 to -3 stops',
      'Bring the fill light closer or increase its power to open the shadows',
      'Switch to loop or butterfly lighting for a more flattering look',
      'Raise the background exposure slightly to reduce overall contrast',
    ],
    patterns: ['loop', 'butterfly', 'flat'],
    shootModeHint: 'Check the shadow value on the dark side of the face — aim for textured shadow, not pure black.',
    relatedSlugs: ['ambiguous-pattern'],
  },
  {
    slug: 'ambiguous-pattern',
    title: 'Ambiguous Pattern',
    icon: '◈',
    tagline: 'Multiple lighting patterns are nearly equal — the engine can\'t commit.',
    description:
      'The signals in the image suggest more than one plausible lighting pattern with ' +
      'very similar confidence levels. This typically happens when the light placement ' +
      'falls between two classic patterns, or when shadows are partially obscured or ' +
      'the face is at an angle that blends characteristics of two setups.',
    causes: [
      'Light positioned between classic loop and Rembrandt — falls in a gray zone',
      'Face angle creates ambiguous nose shadow direction',
      'Multiple lights overlapping in a way that obscures single-source cues',
      'Low resolution or out-of-focus reference image reduces signal quality',
    ],
    fixes: [
      'Pick the closest match from the alternatives and verify by shooting a test',
      'Upload a clearer, higher-resolution reference image with the face in focus',
      'Choose a more distinct classic pattern placement to eliminate ambiguity',
      'Compare the two top alternatives in Shoot Mode to find the better fit',
    ],
    patterns: ['loop', 'rembrandt'],
    shootModeHint: 'Use the Compare Patterns feature to toggle between the top two candidates while shooting.',
    relatedSlugs: ['unclear-setup'],
  },
  {
    slug: 'mixed-temperature',
    title: 'Mixed Color Temperature',
    icon: '◫',
    tagline: 'Warm and cool light sources are fighting — color casts across the subject.',
    description:
      'Two or more light sources with different color temperatures are illuminating the ' +
      'subject simultaneously. One side may appear warm (orange/tungsten), the other cool ' +
      '(blue/daylight or LED). This creates a color cast that is difficult to correct in ' +
      'post without causing other problems.',
    causes: [
      'Mixing flash (5500K) with tungsten room lights (2800K)',
      'Window light at one color temperature mixed with strobe at another',
      'LED lights with different CCT (correlated color temperature) settings',
      'Fill card bouncing warm wall color back onto the shadow side',
    ],
    fixes: [
      'Set all lights to the same color temperature (gel your strobe to match ambient)',
      'Overpower ambient with strobe so only one temperature dominates',
      'Turn off room lights and rely entirely on strobe or continuous light',
      'Set camera white balance manually based on the dominant light source',
    ],
    patterns: ['loop', 'flat', 'butterfly'],
    shootModeHint: 'Take a test shot with a grey card to identify the dominant color cast before correcting.',
    relatedSlugs: ['blown-highlights'],
  },
  {
    slug: 'unclear-setup',
    title: 'Unclear Setup',
    icon: '◌',
    tagline: 'Insufficient signals — the engine couldn\'t read enough detail to be certain.',
    description:
      'The analysis engine did not have enough reliable signals to make a confident ' +
      'pattern determination. This is typically caused by a low-resolution reference image, ' +
      'obscured facial features, an extreme camera angle, or the absence of a visible face. ' +
      'The result confidence is low and should not be treated as definitive.',
    causes: [
      'Reference image is too small, blurry, or low resolution',
      'Face is turned away, heavily backlit, or only partially visible',
      'No face detected — engine cannot use shadow/catchlight cues',
      'Heavily filtered or processed image removes key lighting signals',
    ],
    fixes: [
      'Upload a clearer, well-exposed reference image with the face clearly visible',
      'Use a front-facing or 3/4-angle shot where shadows are clearly readable',
      'Avoid heavy Lightroom presets or extreme processing on the reference image',
      'If no clear reference exists, use the Wizard mode to describe the intended look',
    ],
    patterns: ['loop', 'butterfly'],
    shootModeHint: 'When the signal is low, use Shoot Mode to test the recommended pattern in person and adjust from there.',
    relatedSlugs: ['ambiguous-pattern'],
  },
];

/**
 * Map analysis signals to symptom slugs.
 *
 * @param {object} opts
 * @param {object}  opts.ambiguityFlags   - from result.signalReliability.ambiguityFlags
 * @param {object}  opts.edgeCaseFlags    - from result.edgeCaseFlags
 * @param {number}  opts.reliabilityScore - 0–1 (normalized from result.bestMatch.reliabilityScore)
 * @param {number}  opts.signalStrength   - 0–1 from result.signalReliability.overallSignalStrength
 * @returns {string[]} ordered array of symptom slugs (most actionable first), max 3
 */
export function getSymptomsFromSignals({
  ambiguityFlags = {},
  edgeCaseFlags = {},
  reliabilityScore = 1,
  signalStrength = 1,
}) {
  const slugs = new Set();

  // Edge case flags map directly to symptoms
  if (edgeCaseFlags.blown_highlights)             slugs.add('blown-highlights');
  if (edgeCaseFlags.mixed_color_temperature)       slugs.add('mixed-temperature');
  if (edgeCaseFlags.extreme_low_key)               slugs.add('too-dramatic');
  if (edgeCaseFlags.bw_processing)                 slugs.add('unclear-setup');
  if (edgeCaseFlags.no_face)                       slugs.add('unclear-setup');
  if (edgeCaseFlags.outdoor_foliage_shadows)       slugs.add('too-harsh');
  if (edgeCaseFlags.window_light_gradient)         slugs.add('mixed-temperature');

  // Ambiguity flags
  if (ambiguityFlags.multiple_patterns_close_confidence) slugs.add('ambiguous-pattern');
  if (ambiguityFlags.no_face_detected)                   slugs.add('unclear-setup');
  if (ambiguityFlags.bw_limits_color_cues)               slugs.add('unclear-setup');
  if (ambiguityFlags.low_signal_count)                   slugs.add('unclear-setup');
  if (ambiguityFlags.tiny_face)                          slugs.add('unclear-setup');

  // Score-based triggers (only if nothing stronger was already detected)
  if (reliabilityScore < 0.5 && slugs.size === 0)        slugs.add('ambiguous-pattern');
  if (signalStrength < 0.4 && !slugs.has('unclear-setup')) slugs.add('unclear-setup');

  return [...slugs].slice(0, 3);
}

/**
 * Get a single symptom definition by slug.
 * @param {string} slug
 * @returns {object|null}
 */
export function getSymptomBySlug(slug) {
  return SYMPTOMS.find(s => s.slug === slug) || null;
}
