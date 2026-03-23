/**
 * NGW Pattern Library
 *
 * Single source of truth for every lighting pattern.
 * Drives: Results Screen, Symptom Engine, Fix Flow, Comparison System,
 *         Web SEO pages, PDF exports, ML training metadata.
 *
 * Schema: PatternEntry
 * Keys are pattern slugs (matches API pattern_id).
 */

export const PATTERNS = {

  // ── Rembrandt ───────────────────────────────────────────────────────────────

  rembrandt: {
    id: 'rembrandt',
    slug: 'rembrandt',
    name: 'Rembrandt Lighting',
    category: 'classic',

    summary: {
      tagline: 'Dramatic depth through a triangle of light on the shadow cheek.',
      description:
        'Rembrandt lighting places the key light high and to the side, creating a small inverted triangle of light on the shadow-side cheek just below the eye. Named after the Dutch master\'s use of chiaroscuro, it produces strong three-dimensional modeling that is moody, sculptural, and powerful.',
      useCases: [
        'Character portraits and editorial headshots',
        'Environmental and documentary portraiture',
        'Men\'s grooming and lifestyle campaigns',
        'Any image where mood and depth take priority over even skin rendering',
      ],
    },

    recognition: {
      lookFor: [
        'Triangular highlight on the shadow-side cheek — roughly eye-width, apex pointing down toward corner of mouth',
        'Strong shadow cast by the nose merging with the cheek shadow, with the triangle as the gap',
        'Shadow-side eye still slightly lit — primarily by the triangle reflection',
        'Clear falloff from lit side to shadow side — typically 3:1 to 4:1 ratio',
      ],
      quickChecks: [
        'Can you draw a triangle between the inner corner of the shadow-side eye and the two ends of the cheek highlight?',
        'Is the triangle isolated — not connected to the main lit side?',
        'Does the nose shadow merge with the cheek shadow, with only that triangle breaking through?',
      ],
      visualCues: [
        'Single catchlight at 10 or 2 o\'clock in the iris on the lit side',
        'Deep shadow on the lit-side cheek from the nose projecting away from the key',
        'Gradual falloff — no abrupt hard edge unless using an extreme ratio',
      ],
    },

    blueprint: {
      keyLight: {
        position: '45° to the side — on the shadow side of the face',
        angle: '45° down from horizontal',
        height: 'Just above subject eye level — modifier center aimed at shadow-side cheek',
        modifier: [
          'Large softbox (60×90cm or larger)',
          'Octabox (90cm+)',
          'Deep parabolic umbrella with diffusion sock',
        ],
      },
      fill: {
        type: 'Reflector or low-power second strobe on camera side',
        ratio: '3:1 to 4:1 (key to fill)',
      },
      background: 'Mid-tone to dark gradient — avoids competing with face modeling',
      setupNotes: [
        'Pose the subject first — small head turns of 5–10° affect triangle formation more than large light moves',
        'Have subject turn nose just past the light source; triangle appears as nose shadow merges with cheek shadow',
        'Raise the key if triangle disappears — it forms from above the cheekbone, not from the side',
        'Use a flag or barn door on the fill side to prevent background from going too bright',
      ],
    },

    fixes: [
      {
        problem: 'Triangle disappears — shadow-side cheek is entirely in shadow',
        cause: 'Key light is too far to the side, or subject face turned too far away',
        solution: [
          'Move key light closer to camera axis (under 45°)',
          'Have subject turn face slightly toward the key light',
          'Raise the key light — the triangle forms from above, not from the side',
        ],
      },
      {
        problem: 'Triangle is too large — approaches loop or broad lighting',
        cause: 'Key light too close to camera axis or positioned too low',
        solution: [
          'Push light further to the side past 45°',
          'Raise light and tilt it down more steeply',
          'Have subject turn slightly away from the light',
        ],
      },
      {
        problem: 'Face looks flat despite the triangle being present',
        cause: 'Fill ratio is too even — less than 2:1',
        solution: [
          'Reduce fill power or move reflector further from subject',
          'Use a black card instead of a reflector on the shadow side',
          'Check that background isn\'t bouncing light back onto the shadow side',
        ],
      },
    ],

    mistakes: [
      {
        issue: 'Placing the key light at eye level instead of above',
        cause: 'Misunderstanding that Rembrandt requires height, not just angle',
        correction:
          'The light must be above eye level and angled downward — this is what creates the triangle from the cheekbone',
      },
      {
        issue: 'Moving the light instead of adjusting pose when triangle disappears',
        cause: 'Treating light position as the only variable',
        correction:
          'Small head turns of 5–10° have more effect on triangle formation than large light repositioning',
      },
    ],

    variations: [
      {
        name: 'Broad Rembrandt',
        difference: 'Subject\'s lit side faces the camera — adds width to the face',
        setupChange:
          'Turn subject so camera-near side receives key light; triangle appears on far cheek',
      },
      {
        name: 'Short Rembrandt',
        difference: 'Shadow side faces camera — slims the face',
        setupChange: 'Standard setup; turn subject so camera-near side is in shadow',
      },
      {
        name: 'Rembrandt with Hair Light',
        difference: 'Adds depth separation from background',
        setupChange:
          'Gridded small softbox behind subject on shadow side at 4:1 ratio to key; aimed at hair and shoulder',
      },
    ],

    detection: {
      signals: [
        'Isolated triangular highlight region on shadow-side cheek',
        'High contrast ratio — shadow side reads 1.5–2 stops darker than highlight side',
        'Single dominant catchlight at 10 or 2 o\'clock',
        'Nose shadow extending to merge with cheek shadow',
      ],
      confusionWith: ['loop', 'split'],
      confidenceNotes: [
        'High confidence when triangle is clearly isolated and nose shadow is merged with cheek shadow',
        'Lower confidence at ratios below 2:1 — appears ambiguous between Rembrandt and Loop',
        'High cheekbones can make the triangle appear larger than typical — affects boundary with Loop',
      ],
    },

    metadata: {
      difficulty: 'medium',
      mood: ['dramatic', 'moody', 'sculptural', 'classic'],
      environments: ['studio', 'environmental', 'window light'],
      starter: true,
      riskLevel: 'high',
      minSignalsForChange: 200,
    },

    assets: {
      hero: '/images/patterns/rembrandt/hero.jpg',
      diagram: '/images/patterns/rembrandt/diagram.png',
      examples: [
        '/images/patterns/rembrandt/example-01.jpg',
        '/images/patterns/rembrandt/example-02.jpg',
      ],
      mistakes: [
        '/images/patterns/rembrandt/mistake-flat-fill.jpg',
        '/images/patterns/rembrandt/mistake-no-triangle.jpg',
      ],
    },
  },

  // ── Loop ────────────────────────────────────────────────────────────────────

  loop: {
    id: 'loop',
    slug: 'loop',
    name: 'Loop Lighting',
    category: 'classic',

    summary: {
      tagline: 'The most commercially versatile portrait pattern — flattering and forgiving.',
      description:
        'Loop lighting sits slightly above eye level and 30–45° to the side, casting a small loop-shaped nose shadow that angles downward without touching the cheek shadow. The result is naturally flattering, dimensionally satisfying, and works for nearly every face shape — the true workhorse of commercial portraiture.',
      useCases: [
        'Commercial headshots and corporate portraits',
        'Actor and talent portfolios',
        'Environmental and lifestyle portraits',
        'Any job where flattering and natural are the priorities',
      ],
    },

    recognition: {
      lookFor: [
        'Small nose shadow angling downward and slightly to the side — does not touch the cheek shadow',
        'Both eyes clearly lit with visible catchlights',
        'Soft highlight across both cheeks with gentle falloff to shadow side',
        'Light ratio typically 2:1 — shadow side darker but with detail visible',
      ],
      quickChecks: [
        'Is there a clear gap between the nose shadow tip and the cheek shadow line? (Yes = Loop)',
        'Are both eyes fully lit? (One eye dark = Rembrandt or Split)',
        'Does the nose shadow loop downward at roughly 30–45° from horizontal?',
      ],
      visualCues: [
        'Catchlight at 10 or 2 o\'clock — slightly less extreme than Rembrandt',
        'Smooth cheek highlight with no isolated triangle',
        'Shadow side has shape and dimension, not drama',
      ],
    },

    blueprint: {
      keyLight: {
        position: '30–45° to the side on the key side',
        angle: '20–30° down from horizontal',
        height: 'Just above eye level — catchlight appears slightly above iris center',
        modifier: [
          'Large octabox (90–120cm)',
          'Softbox (60×90cm)',
          'Deep parabolic umbrella',
        ],
      },
      fill: {
        type: 'Reflector, fill card, or low-power strobe',
        ratio: '2:1 to 2.5:1 (key to fill)',
      },
      background: 'Any — clean or graduated; the pattern does not compete with background',
      setupNotes: [
        'Watch the nose shadow — move key toward camera until shadow points down and slightly to the side',
        'Modifier lower edge should be at forehead height — prevents unflattering under-lighting',
        'Loop is forgiving — small angle adjustments change shadow length without breaking the pattern',
        'Add a kicker on the shadow side behind the subject for depth without disrupting the loop',
      ],
    },

    fixes: [
      {
        problem: 'Nose shadow is too long, reaching toward the lip',
        cause: 'Key light is too high or too far to the side',
        solution: [
          'Lower the key light slightly until shadow shortens',
          'Move key slightly toward camera axis',
          'Check that subject is not tilting their head downward',
        ],
      },
      {
        problem: 'Nose shadow touches cheek shadow — pattern shifted to Rembrandt',
        cause: 'Light moved too far to the side or subject turned too far from key',
        solution: [
          'Bring key light back toward camera axis (under 40°)',
          'Turn subject face slightly toward the light',
          'Lower the key slightly to shorten the shadow',
        ],
      },
      {
        problem: 'Both eyes equally bright — face looks flat',
        cause: 'Key light too close to camera axis — approaching butterfly',
        solution: [
          'Move key further to the side past 30°',
          'Raise the key slightly to increase the downward angle',
          'Reduce fill ratio',
        ],
      },
    ],

    mistakes: [
      {
        issue: 'Assuming the pattern is set without checking the nose shadow',
        cause: 'Eyeballing the light position rather than checking live view or tether',
        correction:
          'Check at subject eye level in live view — nose shadow visible but not dominating',
      },
      {
        issue: 'Overusing fill until the pattern is invisible',
        cause: 'Trying to achieve a bright, even look the client requested',
        correction:
          'Maintain at least 2:1 ratio; at 1:1 the face loses all dimension regardless of key position',
      },
    ],

    variations: [
      {
        name: 'Broad Loop',
        difference: 'Camera-near side of face receives key light — adds width',
        setupChange: 'Turn subject so the camera-near side receives the key light',
      },
      {
        name: 'Short Loop',
        difference: 'Shadow side faces camera — slims the face',
        setupChange: 'Turn subject so shadow side faces camera; key is on the far side',
      },
      {
        name: 'Loop with Rim',
        difference: 'Adds hair and shoulder separation from background',
        setupChange:
          'Gridded strobe behind subject on shadow side; output 1:4 ratio to key',
      },
    ],

    detection: {
      signals: [
        'Nose shadow present and pointing downward-laterally',
        'Clear gap visible between nose shadow tip and cheek shadow',
        'Both eyes lit with catchlights',
        'Soft falloff across shadow cheek — detail visible',
      ],
      confusionWith: ['rembrandt', 'butterfly'],
      confidenceNotes: [
        'High confidence when nose shadow is clear and gap to cheek shadow is visible',
        'Ambiguous at very low ratios (1.5:1 or less) — can read as flat',
        'Ambiguous when key is very close to center (under 25°) — approaches butterfly',
      ],
    },

    metadata: {
      difficulty: 'easy',
      mood: ['flattering', 'natural', 'commercial', 'versatile'],
      environments: ['studio', 'environmental', 'window light', 'location'],
      starter: true,
      riskLevel: 'high',
      minSignalsForChange: 200,
    },

    assets: {
      hero: '/images/patterns/loop/hero.jpg',
      diagram: '/images/patterns/loop/diagram.png',
      examples: [
        '/images/patterns/loop/example-01.jpg',
        '/images/patterns/loop/example-02.jpg',
      ],
      mistakes: [
        '/images/patterns/loop/mistake-too-flat.jpg',
        '/images/patterns/loop/mistake-rembrandt-shift.jpg',
      ],
    },
  },

  // ── Butterfly ───────────────────────────────────────────────────────────────

  butterfly: {
    id: 'butterfly',
    slug: 'butterfly',
    name: 'Butterfly Lighting',
    category: 'beauty',

    summary: {
      tagline: 'Classic Hollywood glamour — centered light that sculpts cheekbones.',
      description:
        'Butterfly (Paramount) lighting places the key directly in front of and above the subject. The defining shadow is a small butterfly or chevron shape directly beneath the nose. It emphasizes the cheekbone structure, creates bilateral symmetry, and is the signature look of Hollywood glamour portraiture.',
      useCases: [
        'Beauty and cosmetics campaigns',
        'Fashion editorial portraiture',
        'Hollywood glamour and retro-style portraiture',
        'Headshots for subjects with strong facial structure',
      ],
    },

    recognition: {
      lookFor: [
        'Symmetrical lighting — left and right sides of the face match exactly',
        'Butterfly or chevron shadow directly beneath the nose, pointing straight down',
        'Strong highlight on top of cheekbones falling off evenly to both sides',
        'Catchlights at 12 o\'clock position in both eyes simultaneously',
      ],
      quickChecks: [
        'Are both sides of the face identically lit? (Yes = butterfly or flat)',
        'Is the nose shadow symmetrical and pointing straight down?',
        'Catchlights at 12 o\'clock in both eyes?',
      ],
      visualCues: [
        'Shadow visible under chin — light is above and angled down',
        'No side falloff — both cheeks and ears equally bright',
        'Cheekbone highlight is the brightest point below the eyes',
      ],
    },

    blueprint: {
      keyLight: {
        position: 'Directly in front — on the camera axis or just above and behind camera',
        angle: '30–45° down from horizontal, aimed at the face',
        height:
          'High enough to create nose shadow that clears the upper lip — typically 30–50cm above eye level',
        modifier: [
          'Beauty dish (55–70cm, with or without diffusion sock)',
          'Octabox on boom arm',
          'Large softbox on boom arm',
        ],
      },
      fill: {
        type: 'White reflector held below chin (butterfly board / foam core)',
        ratio: '2:1 — fill lifts chin shadow without eliminating it',
      },
      background: 'Clean white, seamless gradient, or simple dark tone',
      setupNotes: [
        'Boom arm required — modifier must be directly above and in front with no stand in frame',
        'Shadow length controlled by height — raise for longer shadow, lower for shorter; target: tip at or just above lip',
        'Pair with clamshell fill (large reflector at waist height) to control under-chin shadow',
        'Works best when subject looks directly at camera — off-axis looks break the symmetry',
      ],
    },

    fixes: [
      {
        problem: 'Nose shadow points to one side — asymmetrical',
        cause: 'Key light is off-axis, not centered above the camera',
        solution: [
          'Move key to be exactly on the camera axis — check from behind camera',
          'Have subject adjust face to center on the light',
          'Check in live view — shadow must be perfectly symmetrical',
        ],
      },
      {
        problem: 'Heavy shadow under chin creating unflattering look',
        cause: 'Key light too high with no fill beneath',
        solution: [
          'Raise a large white reflector at waist height just below frame',
          'Lower the key light slightly to reduce chin shadow depth',
          'Add clamshell fill card — hold foam core just below chin angled upward',
        ],
      },
      {
        problem: 'Nose shadow too long — reaching lip or further',
        cause: 'Key light is too high above eye level',
        solution: [
          'Lower the key light — shadow shortens as angle becomes less steep',
          'Ask subject to tilt chin slightly up — shortens shadow without moving the light',
        ],
      },
    ],

    mistakes: [
      {
        issue: 'Skipping the boom arm and placing light above but behind camera',
        cause: 'No boom arm available, improvising',
        correction:
          'Without boom, shadow falls behind the nose (toward camera) instead of below — creates flat or shadowless look, not butterfly',
      },
      {
        issue: 'Using butterfly on subjects with heavy brow ridges or deep-set eyes',
        cause: 'Not evaluating face structure before choosing pattern',
        correction:
          'Heavy brow ridges cast dense eye shadows in butterfly — switch to loop or Rembrandt to open the eyes',
      },
    ],

    variations: [
      {
        name: 'Clamshell Lighting',
        difference:
          'Second softbox below fills chin shadow completely — shadow-free glamour beauty light',
        setupChange:
          'Second softbox or beauty dish below camera at chin height, powered at 2:1 ratio to key',
      },
      {
        name: 'High Butterfly',
        difference: 'Longer nose shadow for more drama while maintaining symmetry',
        setupChange: 'Raise key until nose shadow reaches upper lip; keep modifier centered',
      },
      {
        name: 'Butterfly with Hair Light',
        difference: 'Adds dimension and separation from background',
        setupChange:
          'Gridded strobe behind and above subject aimed at crown of head; keep output low',
      },
    ],

    detection: {
      signals: [
        'Symmetrical bilateral face illumination',
        'Butterfly or chevron shadow beneath nose pointing straight down',
        'Catchlights at 12 o\'clock in both eyes',
        'Strong cheekbone highlight',
      ],
      confusionWith: ['flat', 'loop'],
      confidenceNotes: [
        'High confidence when shadow is clearly symmetrical and points straight down',
        'Lower confidence if nose shadow is small and subject looks slightly off-axis — may appear as loop',
        'Face shape affects shadow shape — wider noses produce wider butterfly shapes',
      ],
    },

    metadata: {
      difficulty: 'medium',
      mood: ['glamorous', 'polished', 'beauty', 'symmetrical'],
      environments: ['studio', 'controlled location'],
      starter: true,
      riskLevel: 'medium',
      minSignalsForChange: 75,
    },

    assets: {
      hero: '/images/patterns/butterfly/hero.jpg',
      diagram: '/images/patterns/butterfly/diagram.png',
      examples: [
        '/images/patterns/butterfly/example-01.jpg',
        '/images/patterns/butterfly/example-02.jpg',
      ],
      mistakes: [
        '/images/patterns/butterfly/mistake-no-fill.jpg',
        '/images/patterns/butterfly/mistake-off-axis.jpg',
      ],
    },
  },

  // ── Split ───────────────────────────────────────────────────────────────────

  split: {
    id: 'split',
    slug: 'split',
    name: 'Split Lighting',
    category: 'dramatic',

    summary: {
      tagline: 'Half light, half shadow — maximum contrast for maximum impact.',
      description:
        'Split lighting divides the face into two equal halves: one fully lit, one fully in shadow, with the dividing line running vertically through the nose. The most dramatic and directional of the classic patterns — it projects strength, edge, and mystery. A deliberate choice, not a flattering default.',
      useCases: [
        'Dramatic editorial and fine art portraiture',
        'Musician, artist, and creative professional branding',
        'Character studies and conceptual portraits',
        'Any image where mood and edge outweigh flattery',
      ],
    },

    recognition: {
      lookFor: [
        'Face divided into two near-equal halves — one fully lit, one fully in shadow',
        'Shadow line runs vertically through the nose bridge and forehead',
        'Shadow-side eye in deep shadow — often only a rim of light or none at all',
        'Single catchlight on the lit-side eye only',
      ],
      quickChecks: [
        'Does shadow cover approximately half the face in a near-vertical line?',
        'Is the shadow-side eye mostly or fully in shadow?',
        'No secondary light adding detail to the shadow side?',
      ],
      visualCues: [
        'Single catchlight on lit side only — shadow side eye has none',
        'Strong specular highlight on lit cheek and nose bridge',
        'Hard or defined shadow edge at the vertical divide',
      ],
    },

    blueprint: {
      keyLight: {
        position: '90° directly to one side of the subject',
        angle: 'Level with or very slightly above eye level',
        height: 'At or slightly above eye level — shadow bisects nose vertically',
        modifier: [
          'Small softbox (30×60cm)',
          'Strip box',
          'Unmodified strobe (maximum drama)',
          'Gridded reflector',
        ],
      },
      fill: {
        type: 'No fill — or black card to prevent ambient bounce',
        ratio: '5:1 or greater (near-total shadow)',
      },
      background: 'Dark or black — bright background competes with dramatic intent',
      setupNotes: [
        'Position at exactly 90° to face; subject looks directly at camera — not at the light',
        'Shadow line must bisect the nose exactly — short of the nose means the light is too far forward',
        'Use a black V-flat or card on shadow side to prevent ambient bounce',
        'Harder sources increase drama; larger soft sources soften edge but maintain the pattern',
      ],
    },

    fixes: [
      {
        problem: 'Shadow line doesn\'t reach the nose — looks like Rembrandt',
        cause: 'Light is not at 90° — too close to camera axis',
        solution: [
          'Move light directly to the side until shadow line bisects nose center',
          'Have subject turn face directly toward camera if they were angled',
        ],
      },
      {
        problem: 'Shadow side has too much ambient light — not dark enough',
        cause: 'Room ambient or light-colored walls bouncing fill onto shadow side',
        solution: [
          'Place a black V-flat on the shadow side',
          'Shoot in a darker environment',
          'Increase key light power to overpower ambient further',
        ],
      },
    ],

    mistakes: [
      {
        issue: 'Using split because it\'s dramatic without considering whether it serves the subject',
        cause: 'Treating split as a default dramatic option',
        correction:
          'Split is confrontational and intentionally unflattering — confirm with client that mood is the explicit goal',
      },
      {
        issue: 'Allowing the shadow line to miss the nose — drifting into Rembrandt',
        cause: 'Eyeballing the 90° position rather than verifying the shadow line',
        correction:
          'Always verify shadow line runs through the nose bridge in live view before shooting',
      },
    ],

    variations: [
      {
        name: 'Hard Split',
        difference: 'Near-instantaneous shadow edge from bare strobe',
        setupChange: 'Remove all modifiers; use 7" or 10" strobe reflector at 90°',
      },
      {
        name: 'Soft Split',
        difference: 'Equal half-division with softer shadow edge',
        setupChange: 'Large softbox or umbrella at 90° — split visible but edge transition is gradual',
      },
      {
        name: 'Split with Rim',
        difference: 'Adds hair and shoulder rim to prevent subject from disappearing into background',
        setupChange:
          'Gridded strobe on shadow side behind subject aimed at hair and shoulder; 1:8 ratio to key',
      },
    ],

    detection: {
      signals: [
        'Near-50/50 face division by a vertical shadow line',
        'Shadow-side eye in deep shadow or fully dark',
        'Single catchlight on lit side only',
        'Hard or defined shadow edge running through nose bridge',
      ],
      confusionWith: ['rembrandt'],
      confidenceNotes: [
        'High confidence when shadow clearly bisects face at 50/50 and shadow-side eye is dark',
        'Lower confidence at 40/60 shadow split — ambiguous with Rembrandt',
        'Hard vs soft edge does not affect classification — only shadow line position matters',
      ],
    },

    metadata: {
      difficulty: 'easy',
      mood: ['dramatic', 'intense', 'moody', 'confrontational'],
      environments: ['studio', 'controlled location'],
      starter: false,
      riskLevel: 'medium',
      minSignalsForChange: 75,
    },

    assets: {
      hero: '/images/patterns/split/hero.jpg',
      diagram: '/images/patterns/split/diagram.png',
      examples: [
        '/images/patterns/split/example-01.jpg',
        '/images/patterns/split/example-02.jpg',
      ],
      mistakes: [
        '/images/patterns/split/mistake-soft-shadow.jpg',
        '/images/patterns/split/mistake-fill-added.jpg',
      ],
    },
  },

  // ── Flat ────────────────────────────────────────────────────────────────────

  flat: {
    id: 'flat',
    slug: 'flat',
    name: 'Flat Lighting',
    category: 'natural',

    summary: {
      tagline: 'Even, shadowless — neutral light that lets everything show.',
      description:
        'Flat lighting places the key on or near the camera axis, producing minimal to no facial shadows. While it lacks the sculpting depth of loop or Rembrandt, it is technically demanding to execute with quality and serves important commercial applications — e-commerce, documentation, skin texture emphasis — where shadow-free rendering is a deliberate choice.',
      useCases: [
        'E-commerce and catalog portraiture',
        'Beauty and skin texture emphasis',
        'Medical and scientific portraiture',
        'Environmental available light that is naturally flat',
      ],
    },

    recognition: {
      lookFor: [
        'No directional nose shadow — absent or very faint symmetrical shadow directly below nose',
        'Both sides of face equally lit — no visible side falloff',
        'Both eyes lit — no shadow-side eye',
        'Catchlights at 12 o\'clock or centered in both eyes',
      ],
      quickChecks: [
        'Is there any directional nose shadow? (No = flat or near-flat)',
        'Both sides identically lit with no falloff?',
        'Catchlights at the same position in both eyes?',
      ],
      visualCues: [
        'Skin texture clearly visible — no shadow creating illusion of smooth skin',
        'No directional modeling on nose bridge or cheekbones',
        'Background may also be evenly lit if source is large and close',
      ],
    },

    blueprint: {
      keyLight: {
        position: 'Directly on the camera axis or within 10° either side',
        angle: 'Level with subject eye level — zero downward angle',
        height: 'Eye level — no height difference between light center and subject eye',
        modifier: [
          'Ring flash (most efficient — true on-axis)',
          'Large octabox centered on camera axis via boom',
          'Ring light',
          'On-axis umbrella through',
        ],
      },
      fill: {
        type: 'None, or second identical light matched to key on opposite side',
        ratio: '1:1 — any power difference creates direction and breaks the pattern',
      },
      background: 'White or light seamless; any background works — flat light on face doesn\'t control background separately',
      setupNotes: [
        'Ring flash is the most efficient flat-light tool — wraps light directly around the lens axis',
        'For softbox flat: center modifier directly behind camera on boom, aligning center to lens axis',
        'With two side lights at 1:1, pattern is flat — any power difference shifts it toward loop or split',
        'In natural light: north-facing window or open shade on overcast day — check for nose shadows',
      ],
    },

    fixes: [
      {
        problem: 'Nose shadow appearing despite on-axis positioning',
        cause: 'Modifier center is above the lens axis — light coming from slightly above',
        solution: [
          'Lower the modifier to center at lens level',
          'Move light closer to camera to reduce angle',
          'Add fill card below chin level to eliminate remaining shadow',
        ],
      },
      {
        problem: 'One side of face slightly darker — subtle asymmetry',
        cause: 'On-axis source has slight rotation or is not perfectly centered',
        solution: [
          'Use a ring light or ring flash to guarantee true on-axis symmetry',
          'Check in live view — 0.3-stop differences are detectable',
          'Add white reflector on darker side or adjust second light',
        ],
      },
    ],

    mistakes: [
      {
        issue: 'Treating flat as "no lighting" or a beginner mistake',
        cause: 'Pattern bias from photographers who\'ve learned sculpting patterns',
        correction:
          'Flat is a deliberate choice with specific commercial applications — evaluate whether it serves the image before adding direction',
      },
      {
        issue: 'Using two lights at slightly unequal power and calling it flat',
        cause: 'Not metering both sources independently',
        correction:
          'Meter each source separately at the subject\'s face position; match to within 0.1 stops',
      },
    ],

    variations: [
      {
        name: 'Ring Flash Style',
        difference: 'Distinctive donut catchlight and slight shadow halo around subject',
        setupChange:
          'Ring flash at 1.5–2m from subject; f/8+ for the characteristic ring shadow on the background',
      },
      {
        name: 'Environmental Flat',
        difference: 'Available light that is flat by circumstance',
        setupChange:
          'Open shade, overcast sky, or north-facing window — no modifiers needed; verify flatness by checking nose',
      },
    ],

    detection: {
      signals: [
        'Absence of any directional nose shadow',
        'Symmetrical bilateral illumination',
        'No visible cheek falloff or modeling',
        'Catchlights in both eyes at the same position',
      ],
      confusionWith: ['butterfly'],
      confidenceNotes: [
        'High confidence when no shadow is detectable on nose or cheeks',
        'Ambiguous in heavily retouched images — shadows may have been removed in post',
        'Ring flash creates distinctive background halo — strong additional confirmation signal',
      ],
    },

    metadata: {
      difficulty: 'easy',
      mood: ['neutral', 'clean', 'commercial', 'even'],
      environments: ['studio', 'location', 'available light'],
      starter: true,
      riskLevel: 'low',
      minSignalsForChange: 25,
    },

    assets: {
      hero: '/images/patterns/flat/hero.jpg',
      diagram: '/images/patterns/flat/diagram.png',
      examples: [
        '/images/patterns/flat/example-01.jpg',
        '/images/patterns/flat/example-02.jpg',
      ],
      mistakes: [
        '/images/patterns/flat/mistake-uneven.jpg',
        '/images/patterns/flat/mistake-ring-catchlight.jpg',
      ],
    },
  },
};
