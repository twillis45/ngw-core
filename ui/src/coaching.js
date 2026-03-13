/** Mood-specific coaching content: camera hints, good signs, warnings, quick fixes.
 *  Keyed by the mood token sent to the engine. */

const COACHING = {
  beauty: {
    emoji: '\u{1F484}',
    tagline: 'Soft, even, flawless skin',
    masterRef: {
      primary: 'Butterfly / Clamshell (Irving Penn, George Hurrell)',
      tradition: 'Hollywood Paramount studio system — centered key above camera creates symmetrical butterfly shadow under nose. Clamshell fill from below opens shadows for flawless beauty.',
      modernPractitioners: ['Irving Penn', 'Peter Lindbergh', 'Mario Testino'],
      signaturePattern: 'Butterfly / Clamshell',
      keyAngle: '0° (centered above camera axis)',
    },
    camera: {
      aperture: 'f/8 \u2013 f/11',
      iso: '100',
      shutter: '1/160',
      wb: '5500 K',
      tip: 'Shoot at f/8\u2013f/11 for edge-to-edge sharpness on skin; stop down for detail, not bokeh',
      lens: '85-105mm',
      height: 'At subject eye level',
      angle: 'Straight-on or slight down',
      distanceFromSubject: '6-8 ft',
    },
    subject: {
      distanceFromBackground: '6-8 ft',
      poseNote: 'Chin slightly down, eyes to lens',
    },
    background: null,
    goodSigns: [
      'Clean catchlights in both eyes',
      'Gradual shadow transition across the nose bridge',
      'Even skin tone with no hot spots',
      'Hair separation from background via rim light',
      'Clean catchlight in the key-side eye',
      'Short nose shadow ending mid-cheek',
      'Defined jawline without harsh edge',
    ],
    warnings: [
      'Double shadows on the background \u2014 move subject away from wall',
      'Hot spot on forehead \u2014 feather the key light',
      'Flat lighting with no dimension \u2014 check fill ratio',
      'Nose shadow too long \u2014 key is too high',
      'Face looks flat \u2014 fill is too strong or too close',
      'Rim blowing out hair \u2014 rim too close or too powerful',
      'No subject separation \u2014 move subject farther from background',
      'Catchlight too high in eye \u2014 lower the key light',
    ],
    quickFixes: [
      { problem: 'Too harsh',      fix: 'Move key 6\u2033 closer or swap to a larger modifier' },
      { problem: 'Too flat',       fix: 'Pull fill light back 1 ft or power it down 1 stop' },
      { problem: 'No separation',  fix: 'Add rim light or raise it above head height' },
      { problem: 'Hot spots',      fix: 'Feather key light slightly past the subject' },
      { problem: 'Face too flat', fix: 'Reduce fill power or move fill back' },
      { problem: 'Nose shadow too long', fix: 'Lower the key or move it more front-on' },
      { problem: 'Rim too hot', fix: 'Move rim farther back or feather it' },
      { problem: 'No separation', fix: 'Move subject 4+ ft from background' },
      { problem: 'Catchlight too high', fix: 'Lower key to just above eye level' },
      { problem: 'Background too bright', fix: 'Reduce bg light or increase subject-bg distance' },
    ],
  },

  cinematic: {
    emoji: '\u{1F3AC}',
    tagline: 'Dramatic shadows, bold contrast',
    masterRef: {
      primary: 'Rembrandt Portrait (Gregory Heisler, Annie Leibovitz)',
      tradition: 'Named for the Dutch master\'s signature triangle of light. Key at 45° creates dimensional character portraits. John Alton codified the cinematic approach in "Painting With Light."',
      modernPractitioners: ['Gregory Heisler', 'Annie Leibovitz', 'Roger Deakins'],
      signaturePattern: 'Rembrandt',
      keyAngle: '45° camera-left or camera-right',
    },
    camera: {
      aperture: 'f/2.8 \u2013 f/4',
      iso: '100 \u2013 400',
      shutter: '1/125',
      wb: '4800 K (warm)',
      tip: 'Shoot at f/2.8\u2013f/4 for dramatic fall-off; consider CTO gel on key',
      lens: '50-85mm',
      height: 'At or slightly below eye level',
      angle: 'Slight upward angle',
      distanceFromSubject: '8-12 ft',
    },
    subject: {
      distanceFromBackground: '8-10 ft',
      poseNote: 'Turned 30-45 degrees from camera',
    },
    background: null,
    goodSigns: [
      'Strong shadow on one side of face',
      'Sharp rim separating subject from dark background',
      'Catchlight in the key-side eye only',
      'Clean catchlight in the key-side eye',
      'Short nose shadow ending mid-cheek',
      'Defined jawline without harsh edge',
    ],
    warnings: [
      'Fill too strong \u2014 loses the dramatic contrast',
      'Rim light flaring into the lens',
      'Background too bright for the mood',
      'Nose shadow too long \u2014 key is too high',
      'Face looks flat \u2014 fill is too strong or too close',
      'Rim blowing out hair \u2014 rim too close or too powerful',
      'No subject separation \u2014 move subject farther from background',
      'Catchlight too high in eye \u2014 lower the key light',
    ],
    quickFixes: [
      { problem: 'Not dramatic enough', fix: 'Kill the fill entirely; rely on key + rim only' },
      { problem: 'Rim flare',           fix: 'Flag the rim light or move it further behind subject' },
      { problem: 'Shadows too deep',    fix: 'Add a subtle fill at 3+ stops below key' },
      { problem: 'Face too flat', fix: 'Reduce fill power or move fill back' },
      { problem: 'Nose shadow too long', fix: 'Lower the key or move it more front-on' },
      { problem: 'Rim too hot', fix: 'Move rim farther back or feather it' },
      { problem: 'No separation', fix: 'Move subject 4+ ft from background' },
      { problem: 'Catchlight too high', fix: 'Lower key to just above eye level' },
      { problem: 'Background too bright', fix: 'Reduce bg light or increase subject-bg distance' },
    ],
  },

  corporate: {
    emoji: '\u{1F4BC}',
    tagline: 'Clean, professional, approachable',
    masterRef: {
      primary: 'Loop Lighting (Peter Hurley, Irving Penn)',
      tradition: 'The safest, most universally flattering pattern. Key at 25-35° creates a small loop shadow beside the nose. The corporate headshot industry standard — highest reliability, flatters every face shape.',
      modernPractitioners: ['Peter Hurley', 'Karl Taylor', 'Martin Schoeller'],
      signaturePattern: 'Loop',
      keyAngle: '25-35° camera-left or camera-right',
    },
    camera: {
      aperture: 'f/5.6 \u2013 f/8',
      iso: '100',
      shutter: '1/160',
      wb: '5500 K',
      tip: 'Shoot at f/5.6\u2013f/8 for full sharpness across the face',
      lens: '85-105mm',
      height: 'At subject eye level',
      angle: 'Straight-on',
      distanceFromSubject: '8-10 ft',
    },
    subject: {
      distanceFromBackground: '6-8 ft',
      poseNote: 'Square to camera, slight chin down',
    },
    background: null,
    goodSigns: [
      'Even illumination across the face',
      'Professional, approachable look',
      'Clean background without distracting shadows',
      'Clean catchlight in the key-side eye',
      'Short nose shadow ending mid-cheek',
      'Defined jawline without harsh edge',
    ],
    warnings: [
      'Raccoon eyes from overhead light \u2014 raise or lower key',
      'Uneven illumination left to right',
      'Glasses glare \u2014 adjust angle 5\u201310\u00b0',
      'Nose shadow too long \u2014 key is too high',
      'Face looks flat \u2014 fill is too strong or too close',
      'Rim blowing out hair \u2014 rim too close or too powerful',
      'No subject separation \u2014 move subject farther from background',
      'Catchlight too high in eye \u2014 lower the key light',
    ],
    quickFixes: [
      { problem: 'Glasses glare',  fix: 'Raise key light or angle subject\u2019s chin down slightly' },
      { problem: 'Raccoon eyes',   fix: 'Lower key light to just above eye level' },
      { problem: 'Too boring',     fix: 'Add a subtle hair light for separation' },
      { problem: 'Face too flat', fix: 'Reduce fill power or move fill back' },
      { problem: 'Nose shadow too long', fix: 'Lower the key or move it more front-on' },
      { problem: 'Rim too hot', fix: 'Move rim farther back or feather it' },
      { problem: 'No separation', fix: 'Move subject 4+ ft from background' },
      { problem: 'Catchlight too high', fix: 'Lower key to just above eye level' },
      { problem: 'Background too bright', fix: 'Reduce bg light or increase subject-bg distance' },
    ],
  },

  editorial: {
    emoji: '\u{1F4F8}',
    tagline: 'Striking, stylized, fashion-forward',
    masterRef: {
      primary: 'Hard Light Editorial (Helmut Newton, Guy Bourdin)',
      tradition: 'Bold, graphic shadows from a single hard source. Fashion-forward lighting that prioritizes visual impact over flattery. Bare bulbs, gridded spots, and deliberate shadow play.',
      modernPractitioners: ['Steven Meisel', 'Tim Walker', 'Tim Tadder'],
      signaturePattern: 'Split or directional hard light',
      keyAngle: '60-90° with hard modifiers (grid, bare, snoot)',
    },
    camera: {
      aperture: 'f/4 \u2013 f/8',
      iso: '100',
      shutter: '1/200',
      wb: '5200 K',
      tip: 'Experiment with hard light and strong angles for graphic impact',
      lens: '35-85mm',
      height: 'Varies with concept',
      angle: 'Experiment freely',
      distanceFromSubject: '6-12 ft',
    },
    subject: {
      distanceFromBackground: '4-10 ft',
      poseNote: 'Dynamic, follow styling direction',
    },
    background: null,
    goodSigns: [
      'Bold, defined shadows with clean edges',
      'Strong geometric shadow patterns',
      'Dramatic contrast that supports the styling',
      'Clean catchlight in the key-side eye',
      'Short nose shadow ending mid-cheek',
      'Defined jawline without harsh edge',
    ],
    warnings: [
      'Shadows too chaotic \u2014 simplify to fewer lights',
      'Spill on the background competing with the subject',
      'Modifier too soft for the intended graphic look',
      'Nose shadow too long \u2014 key is too high',
      'Face looks flat \u2014 fill is too strong or too close',
      'Rim blowing out hair \u2014 rim too close or too powerful',
      'No subject separation \u2014 move subject farther from background',
      'Catchlight too high in eye \u2014 lower the key light',
    ],
    quickFixes: [
      { problem: 'Too soft',         fix: 'Switch to bare bulb or smaller modifier for harder shadows' },
      { problem: 'Messy shadows',    fix: 'Remove one light; simpler is often stronger' },
      { problem: 'Background spill', fix: 'Add barn doors or flag the key light' },
      { problem: 'Face too flat', fix: 'Reduce fill power or move fill back' },
      { problem: 'Nose shadow too long', fix: 'Lower the key or move it more front-on' },
      { problem: 'Rim too hot', fix: 'Move rim farther back or feather it' },
      { problem: 'No separation', fix: 'Move subject 4+ ft from background' },
      { problem: 'Catchlight too high', fix: 'Lower key to just above eye level' },
      { problem: 'Background too bright', fix: 'Reduce bg light or increase subject-bg distance' },
    ],
  },

  natural: {
    emoji: '\u{1F33F}',
    tagline: 'Soft, organic, window-light feel',
    masterRef: {
      primary: 'Vermeer Window Light (Annie Leibovitz, Peter Lindbergh)',
      tradition: 'Johannes Vermeer painted with north-facing window light. Large, soft, directional source at 60-90° creates luminous skin with gentle rolling shadows. The foundation of "natural light" portraiture.',
      modernPractitioners: ['Annie Leibovitz', 'Peter Lindbergh', 'Sue Bryce'],
      signaturePattern: 'Loop (soft, large source)',
      keyAngle: '60-90° with very large soft source placed close to subject',
    },
    camera: {
      aperture: 'f/2.8 \u2013 f/4',
      iso: '200 \u2013 800',
      shutter: '1/125',
      wb: '5800 K (daylight)',
      tip: 'Match your WB to the window light; bump ISO before adding flash',
      lens: '50-85mm',
      height: 'At subject eye level',
      angle: 'Straight-on',
      distanceFromSubject: '6-10 ft',
    },
    subject: {
      distanceFromBackground: '4-6 ft',
      poseNote: 'Relaxed, natural posture',
    },
    background: null,
    goodSigns: [
      'Soft, directional light that feels like a window',
      'Natural-looking catchlights (rectangular, not circular)',
      'Gentle shadow fall-off on the far cheek',
      'Clean catchlight in the key-side eye',
      'Short nose shadow ending mid-cheek',
      'Defined jawline without harsh edge',
    ],
    warnings: [
      'Light looks obviously artificial \u2014 too even, too centered',
      'Color mismatch between strobe and ambient',
      'Catchlights are round when they should mimic a window',
      'Nose shadow too long \u2014 key is too high',
      'Face looks flat \u2014 fill is too strong or too close',
      'Rim blowing out hair \u2014 rim too close or too powerful',
      'No subject separation \u2014 move subject farther from background',
      'Catchlight too high in eye \u2014 lower the key light',
    ],
    quickFixes: [
      { problem: 'Looks artificial', fix: 'Use a large softbox at 90\u00b0 to mimic a window' },
      { problem: 'Color mismatch',   fix: 'Gel your strobe to match the ambient color temperature' },
      { problem: 'Too contrasty',    fix: 'Add a reflector on the shadow side instead of a second light' },
      { problem: 'Face too flat', fix: 'Reduce fill power or move fill back' },
      { problem: 'Nose shadow too long', fix: 'Lower the key or move it more front-on' },
      { problem: 'Rim too hot', fix: 'Move rim farther back or feather it' },
      { problem: 'No separation', fix: 'Move subject 4+ ft from background' },
      { problem: 'Catchlight too high', fix: 'Lower key to just above eye level' },
      { problem: 'Background too bright', fix: 'Reduce bg light or increase subject-bg distance' },
    ],
  },

  high_key: {
    emoji: '\u2728',
    tagline: 'Bright, airy, minimal shadows',
    masterRef: {
      primary: 'Avedon High-Key Clean (Richard Avedon, Karl Taylor)',
      tradition: 'Richard Avedon\'s pure white background portraits strip away context to focus entirely on the person. Background lights at +1 to +2 stops over key. The commercial standard for headshots and e-commerce.',
      modernPractitioners: ['Richard Avedon', 'Karl Taylor', 'Martin Schoeller'],
      signaturePattern: 'High Key (frontal, low contrast)',
      keyAngle: '10-20° near camera axis, with 2 background lights',
    },
    camera: {
      aperture: 'f/8 \u2013 f/11',
      iso: '100',
      shutter: '1/160',
      wb: '5500 K',
      tip: 'Overexpose the background by 1\u20132 stops for that pure-white look',
      lens: '85-105mm',
      height: 'At subject eye level',
      angle: 'Straight-on',
      distanceFromSubject: '8-10 ft',
    },
    subject: {
      distanceFromBackground: '4-6 ft',
      poseNote: 'Open body language, facing camera',
    },
    background: {
      lightDistance: '3 ft from backdrop',
      intendedLook: '1-2 stops over key for pure white',
    },
    goodSigns: [
      'Background reads pure white (RGB 240+)',
      'Minimal shadows on the face',
      'Even, wrap-around illumination',
      'Clean catchlight in the key-side eye',
      'Short nose shadow ending mid-cheek',
      'Defined jawline without harsh edge',
    ],
    warnings: [
      'Background going grey instead of white \u2014 need more background light',
      'Lens flare from bright background \u2014 add a flag above the lens',
      'Subject underexposed relative to the background',
      'Nose shadow too long \u2014 key is too high',
      'Face looks flat \u2014 fill is too strong or too close',
      'Rim blowing out hair \u2014 rim too close or too powerful',
      'No subject separation \u2014 move subject farther from background',
      'Catchlight too high in eye \u2014 lower the key light',
    ],
    quickFixes: [
      { problem: 'Grey background', fix: 'Add two background lights, each 1 stop over your key' },
      { problem: 'Lens flare',      fix: 'Flag the background lights or add a lens hood' },
      { problem: 'Subject dark',    fix: 'Increase key power or move it closer' },
      { problem: 'Face too flat', fix: 'Reduce fill power or move fill back' },
      { problem: 'Nose shadow too long', fix: 'Lower the key or move it more front-on' },
      { problem: 'Rim too hot', fix: 'Move rim farther back or feather it' },
      { problem: 'No separation', fix: 'Move subject 4+ ft from background' },
      { problem: 'Catchlight too high', fix: 'Lower key to just above eye level' },
      { problem: 'Background too bright', fix: 'Reduce bg light or increase subject-bg distance' },
    ],
  },

  low_key: {
    emoji: '\u{1F311}',
    tagline: 'Dark, moody, deep shadows',
    masterRef: {
      primary: 'Caravaggio Chiaroscuro (John Alton, Gregory Heisler)',
      tradition: 'Caravaggio painted with a single overhead skylight in his Roman studio. Single hard source carving the subject from darkness — extreme drama, zero fill. John Alton brought this to cinema; Heisler applies it to editorial portraiture.',
      modernPractitioners: ['Gregory Heisler', 'Annie Leibovitz', 'Joey Lawrence'],
      signaturePattern: 'Split / Chiaroscuro',
      keyAngle: '55-70° with hard modifier (grid spot, bare bulb), no fill',
    },
    camera: {
      aperture: 'f/5.6 \u2013 f/8',
      iso: '100',
      shutter: '1/200',
      wb: '5000 K',
      tip: 'Underexpose ambient by 2+ stops; let the key be your only source',
      lens: '85-135mm',
      height: 'At or slightly above eye level',
      angle: 'Straight-on or slight down',
      distanceFromSubject: '8-12 ft',
    },
    subject: {
      distanceFromBackground: '8+ ft',
      poseNote: 'Subtle pose, minimal movement',
    },
    background: null,
    goodSigns: [
      'Background falls to near-black',
      'Dramatic light on face with deep shadows',
      'Subject clearly separated from dark background',
      'Clean catchlight in the key-side eye',
      'Short nose shadow ending mid-cheek',
      'Defined jawline without harsh edge',
    ],
    warnings: [
      'Background not dark enough \u2014 increase distance or add flags',
      'Fill light too strong \u2014 killing the mood',
      'Noisy shadows from high ISO \u2014 keep ISO at 100',
      'Nose shadow too long \u2014 key is too high',
      'Face looks flat \u2014 fill is too strong or too close',
      'Rim blowing out hair \u2014 rim too close or too powerful',
      'No subject separation \u2014 move subject farther from background',
      'Catchlight too high in eye \u2014 lower the key light',
    ],
    quickFixes: [
      { problem: 'Background too bright', fix: 'Move subject 6+ ft from background; flag spill' },
      { problem: 'Too much fill',         fix: 'Remove fill entirely or power it down to \u22123 stops' },
      { problem: 'Noise in shadows',      fix: 'Drop ISO to 100 and increase flash power instead' },
      { problem: 'Face too flat', fix: 'Reduce fill power or move fill back' },
      { problem: 'Nose shadow too long', fix: 'Lower the key or move it more front-on' },
      { problem: 'Rim too hot', fix: 'Move rim farther back or feather it' },
      { problem: 'No separation', fix: 'Move subject 4+ ft from background' },
      { problem: 'Catchlight too high', fix: 'Lower key to just above eye level' },
      { problem: 'Background too bright', fix: 'Reduce bg light or increase subject-bg distance' },
    ],
  },
};

/** Build the ordered test-shot checklist based on how many lights are used.
 *  Flow: position lights -> meter -> in-camera exposure check -> fine-tune -> lock. */
export function buildTestSteps(lightCount) {
  const steps = [];

  /* -- 1. Position lights one at a time -------------- */
  steps.push('Turn off all lights except the key light');
  steps.push('Take a test shot with key only \u2014 check shadow direction and hardness');
  if (lightCount >= 2) {
    steps.push('Add the fill light, take another test shot');
    steps.push('Check: can you see detail in the shadow side? Adjust fill distance if needed');
  }
  if (lightCount >= 3) {
    steps.push('Add the rim/hair light, take a final test shot');
    steps.push('Check: do you see a bright edge separating subject from background?');
  }

  /* -- 2. Light meter testing ------------------------ */
  steps.push('Meter the key: hold an incident meter at the subject\u2019s face, dome pointed at the key \u2014 note the f-stop reading');
  if (lightCount >= 2) {
    steps.push('Meter the fill: turn off the key, fire fill alone, and read the meter \u2014 the difference from your key reading is your lighting ratio (1 stop = 2:1, 2 stops = 4:1)');
  }
  if (lightCount >= 3) {
    steps.push('Meter the rim: solo the rim light \u2014 it should read 1\u20132 stops below key for most setups (match key only for dramatic/split looks). Adjust power if it\u2019s blowing out the edge');
  }
  steps.push('Set your camera to the key-light meter reading (f-stop, ISO, and sync speed)');

  /* -- 3. In-camera exposure verification ------------ */
  steps.push('Shoot a frame with all lights on \u2014 enable highlight warnings (blinkies) and check for blown highlights on skin');
  steps.push('Check the histogram: skin tones should sit in the right-center; the right edge should not clip');
  steps.push('Zoom to 100\u0025 on the LCD \u2014 verify catch-lights, shadow detail, and focus on the near eye');

  /* -- 4. Fine-tune and lock ------------------------- */
  steps.push('Fine-tune: move each light \u00b1 6\u2033 and compare shots side by side');
  steps.push('Lock it in: mark your light stand positions with gaffer tape on the floor');
  return steps;
}

export function getCoaching(mood) {
  return COACHING[mood] || COACHING.corporate;
}

/** Which subject types make sense for each mood */
export const MOOD_SUBJECTS = {
  beauty:    ['headshot', 'half_body'],
  cinematic: ['headshot', 'half_body', 'full_body', 'couple'],
  corporate: ['headshot', 'half_body', 'small_group'],
  editorial: ['headshot', 'half_body', 'full_body'],
  natural:   ['headshot', 'half_body', 'full_body', 'couple', 'small_group'],
  high_key:  ['headshot', 'half_body', 'full_body', 'product'],
  low_key:   ['headshot', 'half_body', 'full_body'],
};

export const MOOD_LIST = [
  { value: 'beauty',    label: 'Beauty',    emoji: '\u{1F484}', desc: 'Soft, even, flawless skin' },
  { value: 'cinematic', label: 'Cinematic',  emoji: '\u{1F3AC}', desc: 'Dramatic shadows, bold contrast' },
  { value: 'corporate', label: 'Corporate',  emoji: '\u{1F4BC}', desc: 'Clean, professional, approachable' },
  { value: 'editorial', label: 'Editorial',  emoji: '\u{1F4F8}', desc: 'Striking, stylized, fashion-forward' },
  { value: 'natural',   label: 'Natural',    emoji: '\u{1F33F}', desc: 'Soft, organic, window-light feel' },
  { value: 'high_key',  label: 'High Key',   emoji: '\u2728',    desc: 'Bright, airy, minimal shadows' },
  { value: 'low_key',   label: 'Low Key',    emoji: '\u{1F311}', desc: 'Dark, moody, deep shadows' },
];

export default COACHING;
