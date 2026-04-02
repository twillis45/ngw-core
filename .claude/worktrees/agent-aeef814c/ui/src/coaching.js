/** Mood-specific coaching content: camera hints, good signs, warnings, quick fixes.
 *  Keyed by the mood token sent to the engine.
 *
 *  Voice: experienced commercial lighting specialist mentoring photographers entering
 *  commercial work. Identifies the problem AND tells them what to do about it.
 *  Clear, direct, never condescending — assumes competence, fills in the gaps.
 *
 *  goodSigns / warnings are arrays of { text: string, level: 1 | 2 }
 *    level 1 — Priority: most important on-set checks
 *    level 2 — Full read: technical refinements worth knowing
 *
 *  quickFixes are { problem, fix, priority?, level? }
 */

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
      tip: 'Shoot f/8\u2013f/11 for edge-to-edge skin sharpness. Save the bokeh for another setup.',
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
      { text: 'Catchlights in both eyes \u2014 your clamshell fill is reaching the shadow side', level: 1 },
      { text: 'Butterfly shadow sits cleanly under the nose, not pulling toward the lip', level: 1 },
      { text: 'Skin is showing gradation, not glare \u2014 the key is properly feathered', level: 1 },
      { text: 'Catchlights sitting at 11\u20131 o\u2019clock confirms the key is in front of the subject, not above them', level: 2 },
      { text: 'Shadow side has a soft roll, not a hard line \u2014 your fill ratio is right', level: 2 },
      { text: 'Hair separates cleanly from the background \u2014 rim or kicker is working', level: 2 },
    ],
    warnings: [
      { text: 'Hot spot on the forehead \u2014 feather the key 5\u201310\u00b0 past the face to move it off the skin', level: 1 },
      { text: 'Face looks flat with no dimension \u2014 pull the fill back 1\u20132 ft or drop it a stop', level: 1 },
      { text: 'Nose shadow reaching toward the lip \u2014 lower the key or bring it more front-on', level: 1 },
      { text: 'Catchlight sitting at 12 o\u2019clock dead center means the key is above the subject, not in front \u2014 lower it', level: 2 },
      { text: 'Two catchlights visible \u2014 flag or cut the secondary source, one is cleaner for beauty', level: 2 },
      { text: 'Hair blowing out from the rim \u2014 reduce rim power or move it 3 ft farther back', level: 2 },
    ],
    quickFixes: [
      { problem: 'Forehead hot spot',    fix: 'Feather the key 5\u201310\u00b0 past the face \u2014 shifts the specular off skin immediately', priority: true, level: 1 },
      { problem: 'Face looks flat',      fix: 'Pull fill back 2 ft or drop 1 stop \u2014 you need a 2:1 ratio minimum for any dimension', priority: true, level: 1 },
      { problem: 'Nose shadow too long', fix: 'Lower the key toward eye level or bring it more front-on \u2014 it\u2019s too steep', level: 1 },
      { problem: 'Catchlight too high',  fix: 'Lower the key to eye level with a 10\u00b0 downward pitch \u2014 not higher, more forward', level: 2 },
      { problem: 'Double catchlights',   fix: 'Flag or kill the secondary \u2014 single-source catchlight reads as intentional and clean', level: 2 },
      { problem: 'Rim blowing hair',     fix: 'Move rim 3 ft farther back and feather it past the shoulder', level: 2 },
    ],
  },

  cinematic: {
    emoji: '\u{1F3AC}',
    tagline: 'Dramatic shadows, bold contrast',
    masterRef: {
      primary: 'Rembrandt Portrait (Gregory Heisler, Annie Leibovitz)',
      tradition: 'Named for the Dutch master\u2019s signature triangle of light. Key at 45\u00b0 creates dimensional character portraits. John Alton codified the cinematic approach in \u201cPainting With Light.\u201d',
      modernPractitioners: ['Gregory Heisler', 'Annie Leibovitz', 'Roger Deakins'],
      signaturePattern: 'Rembrandt',
      keyAngle: '45° camera-left or camera-right',
    },
    camera: {
      aperture: 'f/2.8 \u2013 f/4',
      iso: '100 \u2013 400',
      shutter: '1/125',
      wb: '4800 K (warm)',
      tip: 'f/2.8\u2013f/4 gives you the shadow fall-off that reads cinematic. Consider a CTO gel on the key.',
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
      { text: 'Key-side eye lit, shadow-side eye in shadow \u2014 that\u2019s your Rembrandt split reading', level: 1 },
      { text: 'Background falling dark \u2014 your strobe is dominating the ambient', level: 1 },
      { text: 'Rim is holding the subject off the background with a crisp edge', level: 1 },
      { text: 'Rembrandt triangle of light visible on the shadow cheek \u2014 key is at true 45\u00b0', level: 2 },
      { text: 'Shadow side has a clean fall-off with no fill contamination \u2014 the drama is intact', level: 2 },
      { text: 'Key-side highlights are open but not clipping \u2014 you have controlled contrast', level: 2 },
    ],
    warnings: [
      { text: 'Both eyes equally lit \u2014 fill is too strong or too close; power it down or move it back', level: 1 },
      { text: 'Background reading mid-grey instead of dark \u2014 shoot at 1/160 and check your ambient exposure', level: 1 },
      { text: 'No edge separation \u2014 add or increase the rim light behind the subject', level: 1 },
      { text: 'Rim flaring into the lens \u2014 flag it or move it further behind the subject\u2019s shoulder plane', level: 2 },
      { text: 'Shadow side completely blocked up with no gradation \u2014 add a white reflector card at \u22124 stops', level: 2 },
      { text: 'Highlights clipping on the key side \u2014 back off key power 1/3 stop or feather it past the face', level: 2 },
    ],
    quickFixes: [
      { problem: 'Not dramatic enough',   fix: 'Cut the fill entirely \u2014 key + rim is the formula; fill flattens the drama', priority: true, level: 1 },
      { problem: 'Fill softening shadows', fix: 'Drop fill to \u22123 stops below key, or remove it completely', level: 1 },
      { problem: 'Background too bright',  fix: 'Close down to 1/160 to suppress ambient, then flag any key spill on the wall', level: 1 },
      { problem: 'Shadow side blocked up', fix: 'One white reflector card at \u22124 stops shadow side \u2014 a card, not a light', level: 2 },
      { problem: 'Rim flaring',            fix: 'Flag the rim or push it 2 ft further behind the shoulder \u2014 it should be out of frame', level: 2 },
      { problem: 'Highlights clipping',    fix: 'Back off key 1/3 stop or feather it slightly past the face', level: 2 },
    ],
  },

  corporate: {
    emoji: '\u{1F4BC}',
    tagline: 'Clean, professional, approachable',
    masterRef: {
      primary: 'Loop Lighting (Peter Hurley, Irving Penn)',
      tradition: 'The safest, most universally flattering pattern. Key at 25\u201335\u00b0 creates a small loop shadow beside the nose. The corporate headshot industry standard \u2014 highest reliability, flatters every face shape.',
      modernPractitioners: ['Peter Hurley', 'Karl Taylor', 'Martin Schoeller'],
      signaturePattern: 'Loop',
      keyAngle: '25-35° camera-left or camera-right',
    },
    camera: {
      aperture: 'f/5.6 \u2013 f/8',
      iso: '100',
      shutter: '1/160',
      wb: '5500 K',
      tip: 'f/5.6\u2013f/8 gives you full sharpness across the face \u2014 that\u2019s what the client is paying for',
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
      { text: 'Even illumination left to right \u2014 modifier is aligned and working', level: 1 },
      { text: 'Background is clean and consistent with no distracting shadows', level: 1 },
      { text: 'Face reads as open and approachable \u2014 fill is doing its job', level: 1 },
      { text: 'Small loop shadow beside the nose confirms you\u2019re in the 25\u201335\u00b0 key position', level: 2 },
      { text: 'Catchlight visible in the shadow-side eye \u2014 fill distance and power are right', level: 2 },
      { text: 'Jaw is defined without a hard drop shadow below the chin \u2014 key height is dialed in', level: 2 },
    ],
    warnings: [
      { text: 'Raccoon eyes \u2014 key is too high; lower it to just above eye level, pitched down 10\u00b0', level: 1 },
      { text: 'Uneven illumination left to right \u2014 check that your modifier is facing straight at the subject', level: 1 },
      { text: 'Glasses glare \u2014 raise the key 6 inches or have the subject tilt their frames down slightly', level: 1 },
      { text: 'Loop shadow too long, reaching the jaw \u2014 pull the key more front-on toward the camera axis', level: 2 },
      { text: 'No catchlight in the shadow-side eye \u2014 fill is underpowered; move it closer or power up 1/2 stop', level: 2 },
      { text: 'Background color shifting across the frame \u2014 background lights are not evenly placed', level: 2 },
    ],
    quickFixes: [
      { problem: 'Glasses glare',       fix: 'Raise the key 6 inches or have subject tilt their glasses down slightly', priority: true, level: 1 },
      { problem: 'Raccoon eyes',        fix: 'Lower key to just above eye level with a 10\u00b0 downward pitch', priority: true, level: 1 },
      { problem: 'Uneven face',         fix: 'Check the modifier \u2014 it\u2019s likely tilted off-axis; face it straight at the subject', level: 1 },
      { problem: 'Shadow too long',     fix: 'Pull the key more toward the camera axis to tighten the loop to under 35\u00b0', level: 2 },
      { problem: 'No shadow-eye catch', fix: 'Move fill closer or power up 1/2 stop \u2014 a catch in both eyes reads as professional', level: 2 },
      { problem: 'Result is boring',    fix: 'Add a hair light at \u22121 stop \u2014 one pop of edge separation changes the whole read', level: 2 },
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
      tip: 'Hard light rewards decisive placement. Pick an angle and commit \u2014 hedging kills the look.',
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
      { text: 'Shadows have hard, clean edges \u2014 your source is small and unmodified', level: 1 },
      { text: 'Strong directional contrast that reinforces the styling concept', level: 1 },
      { text: 'Subject reads clearly against the background without merging into it', level: 1 },
      { text: 'Shadow direction reinforces the composition \u2014 placement was intentional', level: 2 },
      { text: 'No fill contaminating the look \u2014 single source is reading with conviction', level: 2 },
      { text: 'Background is reacting to the light in a way that adds to the frame', level: 2 },
    ],
    warnings: [
      { text: 'Shadows are soft or diffuse \u2014 modifier is too large; swap to a grid, snoot, or bare bulb', level: 1 },
      { text: 'Multiple shadow directions \u2014 pull a light; fewer sources = stronger editorial read', level: 1 },
      { text: 'Background spill competing with the subject \u2014 add barn doors or flag the key', level: 1 },
      { text: 'Fill is softening the contrast \u2014 remove it entirely or push it to \u22123 stops below key', level: 2 },
      { text: 'Rim wrapping onto the face \u2014 push it behind the shoulder plane and flag any forward spill', level: 2 },
      { text: 'Key shadow merging with background shadow \u2014 move subject away from the wall or add a flag', level: 2 },
    ],
    quickFixes: [
      { problem: 'Too soft',            fix: 'Swap to bare bulb, grid, or snoot \u2014 remove the softbox entirely if you need to', priority: true, level: 1 },
      { problem: 'Shadow chaos',        fix: 'Pull one light \u2014 single-source editorial reads stronger than multi-light complexity', level: 1 },
      { problem: 'Background spill',    fix: 'Add barn doors to the key or flag the spill hitting the background', level: 1 },
      { problem: 'Fill softening it',   fix: 'Cut fill completely or dial to \u22123 stops \u2014 let the contrast make the statement', level: 2 },
      { problem: 'Rim wrapping face',   fix: 'Push rim behind the shoulder plane; flag any spill coming forward toward the lens', level: 2 },
      { problem: 'Shadows merging',     fix: 'Push subject 4+ ft from the background, or use a black card to separate them', level: 2 },
    ],
  },

  natural: {
    emoji: '\u{1F33F}',
    tagline: 'Soft, organic, window-light feel',
    masterRef: {
      primary: 'Vermeer Window Light (Annie Leibovitz, Peter Lindbergh)',
      tradition: 'Johannes Vermeer painted with north-facing window light. Large, soft, directional source at 60\u201390\u00b0 creates luminous skin with gentle rolling shadows. The foundation of \u201cnatural light\u201d portraiture.',
      modernPractitioners: ['Annie Leibovitz', 'Peter Lindbergh', 'Sue Bryce'],
      signaturePattern: 'Loop (soft, large source)',
      keyAngle: '60-90° with very large soft source placed close to subject',
    },
    camera: {
      aperture: 'f/2.8 \u2013 f/4',
      iso: '200 \u2013 800',
      shutter: '1/125',
      wb: '5800 K (daylight)',
      tip: 'Match your WB to the window source. Reach for ISO before you add a second light \u2014 a second source kills the organic feel.',
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
      { text: 'Light feels like it comes from one direction \u2014 soft, motivated, and believable', level: 1 },
      { text: 'Catchlights are rectangular, not circular \u2014 the source shape is reading through the eyes', level: 1 },
      { text: 'Shadow side rolls off gradually with no hard line on the cheek', level: 1 },
      { text: 'Color temperature is consistent across the frame \u2014 no strobe-vs-ambient mismatch', level: 2 },
      { text: 'Source placed at 60\u201390\u00b0 gives the directionality that makes it feel natural', level: 2 },
      { text: 'Skin is showing luminosity and surface detail in the highlights \u2014 not blown', level: 2 },
    ],
    warnings: [
      { text: 'Reads as studio, not natural \u2014 source is too centered or too small; move it to 90\u00b0 and closer', level: 1 },
      { text: 'Color cast visible \u2014 strobe and ambient are at different temperatures; gel the strobe to match', level: 1 },
      { text: 'Circular catchlights \u2014 the round modifier is breaking the window illusion; swap to a rectangular softbox', level: 1 },
      { text: 'Source too far away \u2014 you\u2019re losing the wrap and the soft shadow transition; move it to 3 ft', level: 2 },
      { text: 'Background overexposed from ambient leaking in \u2014 flag it or adjust your shooting time', level: 2 },
      { text: 'Shadows are too symmetrical \u2014 source is too centered; move it to 90\u00b0 so there\u2019s clear directionality', level: 2 },
    ],
    quickFixes: [
      { problem: 'Reads as studio',  fix: 'Move source to 90\u00b0 and bring it in to 3 ft \u2014 distance kills the wrap that makes it feel real', priority: true, level: 1 },
      { problem: 'Color mismatch',   fix: 'Gel the strobe to ambient temperature, or kill the ambient and go full strobe', priority: true, level: 1 },
      { problem: 'Too contrasty',    fix: 'Add a reflector on the shadow side \u2014 not a second light, which will read as artificial', level: 1 },
      { problem: 'Circular catchlights', fix: 'Swap to a rectangular softbox or panel \u2014 the shape reads through the catchlight', level: 2 },
      { problem: 'Source too far',   fix: 'Move it in to 3 ft from the face \u2014 the inverse square law is killing your wrap', level: 2 },
      { problem: 'Ambient blowing bg', fix: 'Flag ambient from the background zone, or shoot later when the ambient drops', level: 2 },
    ],
  },

  high_key: {
    emoji: '\u2728',
    tagline: 'Bright, airy, minimal shadows',
    masterRef: {
      primary: 'Avedon High-Key Clean (Richard Avedon, Karl Taylor)',
      tradition: 'Richard Avedon\u2019s pure white background portraits strip away context to focus entirely on the person. Background lights at +1 to +2 stops over key. The commercial standard for headshots and e-commerce.',
      modernPractitioners: ['Richard Avedon', 'Karl Taylor', 'Martin Schoeller'],
      signaturePattern: 'High Key (frontal, low contrast)',
      keyAngle: '10-20° near camera axis, with 2 background lights',
    },
    camera: {
      aperture: 'f/8 \u2013 f/11',
      iso: '100',
      shutter: '1/160',
      wb: '5500 K',
      tip: 'Overexpose the background 1\u20132 stops over key. Verify on the histogram \u2014 your screen will lie to you.',
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
      { text: 'Background blowing pure white \u2014 RGB 240+ confirms you\u2019re there', level: 1 },
      { text: 'Subject exposure is correct and not fighting the background brightness', level: 1 },
      { text: 'Face is open and bright with minimal shadow', level: 1 },
      { text: 'Background metering at +1 to +2 stops over key \u2014 confirmed on the meter, not the screen', level: 2 },
      { text: 'No visible shadows behind the subject on the background', level: 2 },
      { text: 'Background lights are even across the full frame \u2014 no hot center or dark edges', level: 2 },
    ],
    warnings: [
      { text: 'Background going grey instead of white \u2014 move background lights closer to 3 ft from the paper', level: 1 },
      { text: 'Subject disappearing into the background \u2014 increase key power or move it 2 ft closer', level: 1 },
      { text: 'Lens flare from background brightness \u2014 flag the background lights above the lens plane', level: 1 },
      { text: 'Background spill landing on the subject\u2019s shoulders \u2014 angle background lights lower and flag the spill', level: 2 },
      { text: 'Background uneven across the frame \u2014 recheck light placement, should be equidistant on both sides', level: 2 },
      { text: 'Hair detail lost in the white background \u2014 pull background down to +1.5 stops and bump the key to compensate', level: 2 },
    ],
    quickFixes: [
      { problem: 'Grey background',  fix: 'Move background lights in to 3 ft from the paper \u2014 they need to be 1 stop over key', priority: true, level: 1 },
      { problem: 'Subject too dark', fix: 'Increase key power or move it 2 ft closer to the subject', priority: true, level: 1 },
      { problem: 'Lens flare',       fix: 'Flag the background lights so they\u2019re not reaching the front of the lens', level: 1 },
      { problem: 'Spill on shoulders', fix: 'Angle background lights lower and flag the spill from reaching the subject', level: 2 },
      { problem: 'Uneven background', fix: 'Place lights equidistant on each side, angled 45\u00b0 toward the center of the paper', level: 2 },
      { problem: 'Hair blowing out',  fix: 'Pull background to +1.5 stops and increase key power to compensate', level: 2 },
    ],
  },

  low_key: {
    emoji: '\u{1F311}',
    tagline: 'Dark, moody, deep shadows',
    masterRef: {
      primary: 'Caravaggio Chiaroscuro (John Alton, Gregory Heisler)',
      tradition: 'Caravaggio painted with a single overhead skylight in his Roman studio. Single hard source carving the subject from darkness \u2014 extreme drama, zero fill. John Alton brought this to cinema; Heisler applies it to editorial portraiture.',
      modernPractitioners: ['Gregory Heisler', 'Annie Leibovitz', 'Joey Lawrence'],
      signaturePattern: 'Split / Chiaroscuro',
      keyAngle: '55-70° with hard modifier (grid spot, bare bulb), no fill',
    },
    camera: {
      aperture: 'f/5.6 \u2013 f/8',
      iso: '100',
      shutter: '1/200',
      wb: '5000 K',
      tip: 'Underexpose ambient by 2+ stops and let the strobe be your only source. The ambient will kill the mood if you let it in.',
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
      { text: 'Background is near-black \u2014 ambient is suppressed and strobe is the only light source', level: 1 },
      { text: 'Subject is selectively lit with deep shadows on one side', level: 1 },
      { text: 'A rim or edge light is holding the subject off the dark background', level: 1 },
      { text: 'Fill is absent or at least \u22123 stops below key \u2014 shadows are pure, not contaminated', level: 2 },
      { text: 'Shadow gradation is a controlled roll, not blocked up from an exposure error', level: 2 },
      { text: 'Rim is sharp and tight \u2014 not wrapping onto the face or blooming into the lens', level: 2 },
    ],
    warnings: [
      { text: 'Background lifting to grey \u2014 move the subject 6+ ft from the wall and flag any key spill', level: 1 },
      { text: 'Even a little fill will flatten this look \u2014 remove it entirely or dial down to \u22123 stops minimum', level: 1 },
      { text: 'Noise in the shadow areas \u2014 ISO must be 100; increase flash power instead of ISO', level: 1 },
      { text: 'Ambient lifting the background even at 1/200 \u2014 close down the aperture further to suppress it', level: 2 },
      { text: 'Rim is too bright and reads as overlit \u2014 pull rim power down 1.5 stops or move it 3 ft back', level: 2 },
      { text: 'Shadow side is completely blocked up with no gradation \u2014 use one white card at \u22124 stops, not a light', level: 2 },
    ],
    quickFixes: [
      { problem: 'Background lifting',     fix: 'Push subject 6+ ft from the wall; flag any key spill that\u2019s hitting the background', priority: true, level: 1 },
      { problem: 'Fill softening the mood', fix: 'Remove fill entirely or dial to \u22123 stops minimum \u2014 it doesn\u2019t take much to kill this look', priority: true, level: 1 },
      { problem: 'Noise in shadows',        fix: 'ISO 100 only; increase flash power to compensate, never ISO', level: 1 },
      { problem: 'Ambient bleeding in',     fix: 'Shoot at 1/200 and close down aperture to suppress ambient; let only the strobe count', level: 2 },
      { problem: 'Rim too bright',          fix: 'Pull rim down 1.5 stops and consider moving it 3 ft farther back', level: 2 },
      { problem: 'Shadows blocked solid',   fix: 'Place one white card at \u22124 stops on the shadow side \u2014 a card, not a light', level: 2 },
    ],
  },
};

/** Build the ordered test-shot checklist based on how many lights are used.
 *  Flow: position lights -> meter -> in-camera exposure check -> fine-tune -> lock. */
export function buildTestSteps(lightCount) {
  const steps = [];

  /* -- 1. Build one light at a time -- */
  steps.push('Key only \u2014 check shadow direction & hardness');
  if (lightCount >= 2) {
    steps.push('Add fill \u2014 check shadow-side detail');
  }
  if (lightCount >= 3) {
    steps.push('Add rim/hair \u2014 check edge separation');
  }

  /* -- 2. Meter -- */
  steps.push('Meter key at subject\u2019s face, set camera to that reading');
  if (lightCount >= 2) {
    steps.push('Meter fill solo \u2014 compare to key (1 stop = 2:1 ratio)');
  }

  /* -- 3. Verify -- */
  steps.push('All lights on \u2014 check blinkies, histogram, catch-lights');

  /* -- 4. Lock -- */
  steps.push('Fine-tune \u00b1 6\u2033, then tape stand positions');
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
  { value: 'beauty',    label: 'Beauty',    emoji: '\u{1F484}', desc: 'clean, even — axial, shadow-free' },
  { value: 'cinematic', label: 'Cinematic',  emoji: '\u{1F3AC}', desc: 'directional, high contrast' },
  { value: 'corporate', label: 'Corporate',  emoji: '\u{1F4BC}', desc: 'controlled softness, approachable' },
  { value: 'editorial', label: 'Editorial',  emoji: '\u{1F4F8}', desc: 'stylized, controlled highlights' },
  { value: 'natural',   label: 'Natural',    emoji: '\u{1F33F}', desc: 'soft, window-driven' },
  { value: 'high_key',  label: 'High Key',   emoji: '\u2728',    desc: 'flat, bright, minimal shadow' },
  { value: 'low_key',   label: 'Low Key',    emoji: '\u{1F311}', desc: 'deep shadow, selective reveal' },
];

export default COACHING;
