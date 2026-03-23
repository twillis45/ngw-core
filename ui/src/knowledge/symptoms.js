/**
 * NGW Symptom Library
 *
 * Single source of truth for every detectable lighting problem.
 * Drives: Results Screen symptom suggestions, Fix Flow, Symptom Page, ML labeling.
 *
 * Schema: SymptomEntry
 * Keys are symptom slugs (matches getSymptomsFromSignals output).
 *
 * Each fix.steps[] is ordered: quickest actionable step first.
 */

export const SYMPTOMS = {

  // ── Too Flat ─────────────────────────────────────────────────────────────────

  'too-flat': {
    id: 'too-flat',
    slug: 'too-flat',
    title: 'Too Flat',
    icon: '◻',
    tagline: 'No dimension or shadow — the face looks two-dimensional.',
    description:
      'The lighting lacks any meaningful shadow structure. The face has no depth, no modeling, and no sense of three-dimensionality. Usually caused by a key light that is too close to the camera axis, fill that is too bright, or both.',

    causes: [
      'Key light positioned on or near the camera axis (under 20°)',
      'Fill light or reflector is too powerful relative to key — ratio approaching 1:1',
      'Modifier too large and too close — wraps light around the face eliminating shadows',
      'No rim or hair light to add separation from background',
      'Bounce light from light-colored walls or ceiling acting as unintended fill',
    ],

    quickFix: {
      title: 'Move the key light to 30–45° off-axis',
      steps: [
        'Grab the key light stand and physically move it to the side until it\'s roughly 30–45° from the camera axis',
        'Watch for the nose shadow — it should appear and point slightly downward',
        'If using a reflector for fill, move it further from the subject to reduce fill brightness',
      ],
      timeEstimate: '60 seconds',
    },

    fixes: [
      {
        id: 'move-key-off-axis',
        title: 'Move Key Light Off-Axis',
        difficulty: 'easy',
        timeEstimate: '2 min',
        steps: [
          'Move key light to 30–45° to the side of the camera axis',
          'Watch for nose shadow to appear — confirms off-axis position',
          'Raise the light slightly above eye level if no shadow forms',
          'Adjust subject face angle to optimize the shadow shape for your target pattern',
        ],
        targetPatterns: ['loop', 'rembrandt'],
      },
      {
        id: 'reduce-fill',
        title: 'Reduce Fill Power',
        difficulty: 'easy',
        timeEstimate: '1 min',
        steps: [
          'Reduce fill light power by 1–2 stops (or move reflector further from subject)',
          'Target a 2:1 ratio minimum for loop, 3:1–4:1 for Rembrandt',
          'Meter both lights separately to confirm ratio',
          'If using a reflector, angle it slightly away or use a smaller reflector surface',
        ],
        targetPatterns: ['loop', 'rembrandt', 'butterfly'],
      },
      {
        id: 'add-rim-light',
        title: 'Add Rim or Hair Light',
        difficulty: 'medium',
        timeEstimate: '5 min',
        steps: [
          'Position a gridded strobe or small softbox behind the subject on the shadow side',
          'Aim it at the hair and shoulder edge',
          'Set power to 1:4 ratio relative to key light (2 stops below key)',
          'Check that no spill falls on the face — use grid or flag if needed',
        ],
        targetPatterns: ['loop', 'rembrandt'],
      },
    ],

    relatedPatterns: ['rembrandt', 'loop', 'split'],
    relatedSymptoms: ['no-catchlight'],
    signalTriggers: ['low_ratio', 'on_axis_key', 'flat_face_detected'],
  },

  // ── Too Harsh ────────────────────────────────────────────────────────────────

  'too-harsh': {
    id: 'too-harsh',
    slug: 'too-harsh',
    title: 'Too Harsh',
    icon: '⚡',
    tagline: 'Hard shadow edges and excessive contrast — the image reads as aggressive.',
    description:
      'Shadow edges are too defined and the contrast between lit and shadow areas is too extreme for the intended mood. Usually caused by a small or unmodified light source, or a light positioned at too steep an angle.',

    causes: [
      'Bare strobe or flash with no modifier — produces point-source hard light',
      'Modifier too small for the subject distance (e.g., 30cm beauty dish at 2m)',
      'Light positioned too high — steep downward angle creates harsh nose and brow shadows',
      'Light ratio exceeding 5:1 without intent for split-style drama',
      'No fill light or reflector to soften shadow side transitions',
    ],

    quickFix: {
      title: 'Add diffusion or move light source closer',
      steps: [
        'Attach a diffusion panel or softbox to the key light',
        'Move the modifier closer to the subject — a closer large source is softer',
        'Reduce the light ratio by adding a reflector on the shadow side',
      ],
      timeEstimate: '2 minutes',
    },

    fixes: [
      {
        id: 'add-modifier',
        title: 'Add or Upgrade the Modifier',
        difficulty: 'easy',
        timeEstimate: '3 min',
        steps: [
          'Attach a softbox or umbrella to the key light if bare',
          'Use the largest modifier you have available for the space',
          'Move the modifier closer to the subject — closer = softer',
          'Verify shadow edges are gradual, not abrupt',
        ],
        targetPatterns: ['loop', 'butterfly', 'flat'],
      },
      {
        id: 'add-fill',
        title: 'Add Fill to Soften Shadow Side',
        difficulty: 'easy',
        timeEstimate: '2 min',
        steps: [
          'Place a white reflector or foam core on the shadow side of the subject',
          'Position it at 90° to the key light direction, facing the subject',
          'Adjust distance to achieve 3:1 to 4:1 ratio (loop) or 2:1 (butterfly)',
          'Check shadow edges — they should soften as fill brightens',
        ],
        targetPatterns: ['loop', 'butterfly', 'rembrandt'],
      },
      {
        id: 'lower-key',
        title: 'Lower Key Light Height',
        difficulty: 'easy',
        timeEstimate: '1 min',
        steps: [
          'Lower the key light stand so the modifier center is at or just above eye level',
          'Reduce the downward angle to under 30° from horizontal',
          'Check that nose shadow shortens and brow shadow lightens',
          'Adjust subject chin position to compensate if needed',
        ],
        targetPatterns: ['loop', 'butterfly'],
      },
    ],

    relatedPatterns: ['butterfly', 'loop', 'flat'],
    relatedSymptoms: ['blown-highlights'],
    signalTriggers: ['hard_edge_detected', 'high_contrast', 'small_modifier'],
  },

  // ── No Catchlight ────────────────────────────────────────────────────────────

  'no-catchlight': {
    id: 'no-catchlight',
    slug: 'no-catchlight',
    title: 'No Catchlight',
    icon: '👁',
    tagline: 'Eyes look flat or lifeless — the key specular reflection is missing.',
    description:
      'The eyes have no visible specular highlight from the key light. This removes the perception of life and engagement. The most common cause is a key light positioned too high, too far to the side, or the subject looking in the wrong direction.',

    causes: [
      'Key light positioned above 60° from horizontal — light misses the eyes entirely',
      'Key light positioned directly behind or beside the subject',
      'Subject looking down or away from the light source',
      'Key modifier too small to produce a visible catchlight at the shooting distance',
      'Black background or flag accidentally blocking the eye zone',
    ],

    quickFix: {
      title: 'Lower the key light until catchlight appears in iris',
      steps: [
        'Ask subject to look directly into the camera',
        'Lower the key light slowly — watch the eyes in live view',
        'Stop when a small specular appears in the iris at the 10 or 2 o\'clock position',
      ],
      timeEstimate: '30 seconds',
    },

    fixes: [
      {
        id: 'lower-key-for-catchlight',
        title: 'Lower Key Light to Eye Level',
        difficulty: 'easy',
        timeEstimate: '1 min',
        steps: [
          'Lower the key light until the modifier center is closer to subject eye level',
          'Watch the iris in live view — a specular should appear',
          'Target the catchlight at 10 or 2 o\'clock position in the iris',
          'If using a beauty dish, aim the center of the dish at the face, not above it',
        ],
        targetPatterns: ['loop', 'butterfly', 'rembrandt'],
      },
      {
        id: 'adjust-subject-eyeline',
        title: 'Adjust Subject Eye Direction',
        difficulty: 'easy',
        timeEstimate: '30 sec',
        steps: [
          'Ask the subject to look slightly toward the key light',
          'Tilt their chin slightly down if light is above eye level',
          'Check that eyes are open and not squinting from bright source nearby',
        ],
        targetPatterns: ['loop', 'butterfly', 'rembrandt', 'flat'],
      },
      {
        id: 'use-larger-modifier',
        title: 'Use a Larger Modifier',
        difficulty: 'medium',
        timeEstimate: '5 min',
        steps: [
          'Switch to a larger softbox or umbrella — larger sources produce larger catchlights',
          'Move the modifier closer to the subject to increase apparent size',
          'A 90cm octabox at 1m produces a much more visible catchlight than a 30cm dish at 3m',
        ],
        targetPatterns: ['loop', 'butterfly', 'flat'],
      },
    ],

    relatedPatterns: ['butterfly', 'flat', 'loop'],
    relatedSymptoms: ['too-flat'],
    signalTriggers: ['no_catchlight_detected', 'eye_darkness', 'flat_eyes'],
  },

  // ── Blown Highlights ──────────────────────────────────────────────────────────

  'blown-highlights': {
    id: 'blown-highlights',
    slug: 'blown-highlights',
    title: 'Blown Highlights',
    icon: '☀',
    tagline: 'Overexposed clipping on skin — detail is lost in the brightest areas.',
    description:
      'The brightest areas of the face — typically forehead, cheekbones, or nose bridge — are overexposed to pure white, with no recoverable detail. This can be caused by excess light power, being too close to the subject, or aperture being too wide.',

    causes: [
      'Key light power too high for the shooting distance and aperture',
      'Light positioned too close to the subject — inverse square law effect',
      'Aperture too wide relative to strobe power',
      'Highly reflective skin catching specular spike that meter missed',
      'Background light spilling onto subject and adding to exposure',
    ],

    quickFix: {
      title: 'Reduce key light power by 1 stop',
      steps: [
        'Drop key light power by 1 full stop (halve the watt-seconds)',
        'Recheck histogram — if still clipping, reduce another half stop',
        'Alternatively, move the light back 40% to achieve a roughly 1-stop reduction',
      ],
      timeEstimate: '60 seconds',
    },

    fixes: [
      {
        id: 'reduce-power',
        title: 'Reduce Key Light Power',
        difficulty: 'easy',
        timeEstimate: '1 min',
        steps: [
          'Reduce key light power by 1–2 stops',
          'Check histogram after adjustment — no highlight clipping on skin',
          'If ratio changes, reduce fill proportionally to maintain lighting ratio',
        ],
        targetPatterns: ['loop', 'rembrandt', 'butterfly'],
      },
      {
        id: 'move-light-back',
        title: 'Move Light Further from Subject',
        difficulty: 'easy',
        timeEstimate: '2 min',
        steps: [
          'Move the key light back until highlights recover — typically 30–50cm',
          'Remember: moving light back also makes it effectively harder (smaller apparent source)',
          'Add or adjust fill if shadow side becomes too dark after repositioning',
          'Re-meter to confirm exposure',
        ],
        targetPatterns: ['loop', 'rembrandt', 'butterfly'],
      },
      {
        id: 'stop-down',
        title: 'Stop Down Aperture',
        difficulty: 'easy',
        timeEstimate: '30 sec',
        steps: [
          'Close aperture by 1 stop (e.g., f/5.6 → f/8)',
          'Increase ISO if depth of field becomes an issue',
          'This is the fastest fix — requires no physical light adjustment',
        ],
        targetPatterns: ['loop', 'rembrandt', 'butterfly', 'split'],
      },
    ],

    relatedPatterns: ['rembrandt', 'split', 'loop'],
    relatedSymptoms: ['too-harsh'],
    signalTriggers: ['blown_highlights', 'overexposure_detected', 'clipping'],
  },

  // ── Too Dramatic ──────────────────────────────────────────────────────────────

  'too-dramatic': {
    id: 'too-dramatic',
    slug: 'too-dramatic',
    title: 'Too Dramatic',
    icon: '🌓',
    tagline: 'High contrast and deep shadows — the mood is heavier than intended.',
    description:
      'The image reads as more dramatic, dark, or intense than the shot requires. Usually the result of a ratio that\'s too high (4:1+) for a commercial or flattering context, or a pattern like split being used where loop or butterfly would serve better.',

    causes: [
      'Using Rembrandt or Split pattern when Loop or Butterfly was intended',
      'Light ratio too high — fill too weak or absent for the context',
      'No fill on the shadow side — single-light setup without reflector',
      'Dark background absorbing rather than separating — increases perceived contrast',
      'Key light positioned too high — creates aggressive brow and eye shadows',
    ],

    quickFix: {
      title: 'Add a fill reflector on the shadow side',
      steps: [
        'Hold a white reflector or foam core on the opposite side from the key light',
        'Position it about 1m from the subject, facing the key light side',
        'Move it toward or away from the subject until the shadow side brightens to taste',
      ],
      timeEstimate: '60 seconds',
    },

    fixes: [
      {
        id: 'add-fill-reflector',
        title: 'Add Fill Reflector',
        difficulty: 'easy',
        timeEstimate: '2 min',
        steps: [
          'Position a white reflector on the shadow side of the subject',
          'Target a 2:1 to 2.5:1 ratio for loop, 2:1 for butterfly',
          'A silver reflector adds more fill — use white for subtle, silver for significant',
          'Meter both sides to confirm ratio reduction',
        ],
        targetPatterns: ['loop', 'butterfly'],
      },
      {
        id: 'switch-pattern',
        title: 'Switch to a Less Dramatic Pattern',
        difficulty: 'medium',
        timeEstimate: '5 min',
        steps: [
          'Move key light from 45°+ (Rembrandt/Split) to 30–40° (Loop)',
          'Raise or lower until nose shadow becomes a soft loop rather than merging with cheek shadow',
          'Add fill to reduce ratio to 2:1 to 2.5:1',
          'For beauty work, move key to camera axis for butterfly',
        ],
        targetPatterns: ['loop', 'butterfly', 'flat'],
      },
    ],

    relatedPatterns: ['loop', 'butterfly', 'flat'],
    relatedSymptoms: ['ambiguous-pattern'],
    signalTriggers: ['high_ratio', 'deep_shadows', 'rembrandt_or_split'],
  },

  // ── Ambiguous Pattern ─────────────────────────────────────────────────────────

  'ambiguous-pattern': {
    id: 'ambiguous-pattern',
    slug: 'ambiguous-pattern',
    title: 'Ambiguous Pattern',
    icon: '⟲',
    tagline: 'Multiple patterns scored nearly equally — the classification is uncertain.',
    description:
      'The analysis detected signals consistent with more than one lighting pattern. The confidence split between the top two patterns is too close to make a definitive call. This is usually a setup issue — the light is between two classic positions.',

    causes: [
      'Key light positioned between two classic pattern angles (e.g., 40° — between loop and Rembrandt)',
      'Subject face angled ambiguously relative to the light source',
      'Fill ratio that\'s in-between two patterns\' typical ranges',
      'Multiple lights creating competing pattern signals',
      'Low image quality or heavy post-processing obscuring diagnostic features',
    ],

    quickFix: {
      title: 'Commit the key light to a distinct position',
      steps: [
        'Move the key light to clearly under 35° for loop, or clearly to 45°+ for Rembrandt',
        'Check the nose shadow — it should either clearly loop (gap from cheek) or clearly merge (Rembrandt triangle)',
        'Re-upload the image to get a higher-confidence classification',
      ],
      timeEstimate: '2 minutes',
    },

    fixes: [
      {
        id: 'commit-to-pattern',
        title: 'Commit to a Specific Pattern Position',
        difficulty: 'easy',
        timeEstimate: '3 min',
        steps: [
          'Decide which pattern is the intended target — loop, Rembrandt, or butterfly',
          'For Loop: move key to 30–35° and verify nose shadow gap from cheek shadow',
          'For Rembrandt: move key to 45°+ and verify triangle appears on shadow-side cheek',
          'For Butterfly: move key to camera axis and verify symmetrical nose shadow',
          'Re-analyze the adjusted setup',
        ],
        targetPatterns: ['loop', 'rembrandt', 'butterfly'],
      },
      {
        id: 'upload-clearer-image',
        title: 'Upload a Clearer Reference Image',
        difficulty: 'easy',
        timeEstimate: '1 min',
        steps: [
          'Use a well-lit image with the subject facing approximately 3/4 to the camera',
          'Avoid heavy preset or post-processing that removes shadow detail',
          'Ensure the nose, cheeks, and both eyes are clearly visible',
          'A 1000px+ wide JPEG is sufficient — sensor-level quality not required',
        ],
        targetPatterns: ['loop', 'rembrandt', 'butterfly', 'split', 'flat'],
      },
    ],

    relatedPatterns: ['loop', 'rembrandt'],
    relatedSymptoms: ['unclear-setup'],
    signalTriggers: ['multiple_patterns', 'low_confidence', 'ambiguity_flag'],
  },

  // ── Mixed Temperature ──────────────────────────────────────────────────────────

  'mixed-temperature': {
    id: 'mixed-temperature',
    slug: 'mixed-temperature',
    title: 'Mixed Color Temperature',
    icon: '🌡',
    tagline: 'Competing light sources at different color temperatures create a color cast.',
    description:
      'The image shows evidence of light sources at different color temperatures mixing — typically flash (5500K) mixed with tungsten (3200K) or warm LED, or window light (6500K) mixed with strobes. This produces uneven color across the face.',

    causes: [
      'Strobe or flash mixed with tungsten practical lights (3200K vs 5500K)',
      'Window daylight mixed with strobe — especially in late afternoon when daylight goes warm',
      'LED panel with wrong CCT setting mixed with strobe',
      'Different LED panels in the same frame at different color temperatures',
      'Strobe not set to daylight-balanced output',
    ],

    quickFix: {
      title: 'Overpower the ambient or match temperatures',
      steps: [
        'Increase key strobe power until it overpowers all ambient sources by at least 2 stops',
        'Close blinds or block window light if shooting near windows',
        'Alternatively: gel the strobe to match ambient (CTO gel on strobe to match tungsten)',
      ],
      timeEstimate: '3 minutes',
    },

    fixes: [
      {
        id: 'overpower-ambient',
        title: 'Overpower Ambient with Strobe',
        difficulty: 'easy',
        timeEstimate: '3 min',
        steps: [
          'Increase strobe power until it is at least 2 stops brighter than ambient',
          'Block any window light with blackout curtains or gaffer\'s board',
          'Turn off all practical tungsten lights in frame',
          'Meter ambient only to confirm it\'s 2+ stops below strobe',
        ],
        targetPatterns: ['loop', 'butterfly', 'flat'],
      },
      {
        id: 'match-temperatures',
        title: 'Match All Light Sources to One Temperature',
        difficulty: 'medium',
        timeEstimate: '10 min',
        steps: [
          'Set your camera white balance to one fixed temperature (e.g., 5500K)',
          'Gel all strobes and flashes to match ambient if keeping practical lights',
          'Or: replace all practicals with daylight-balanced LEDs (5500–6000K)',
          'Avoid "auto white balance" — it compensates inconsistently across mixed sources',
        ],
        targetPatterns: ['loop', 'butterfly', 'flat', 'rembrandt'],
      },
    ],

    relatedPatterns: ['loop', 'flat', 'butterfly'],
    relatedSymptoms: ['blown-highlights'],
    signalTriggers: ['mixed_temperature', 'color_cast', 'cct_mismatch'],
  },

  // ── Unclear Setup ──────────────────────────────────────────────────────────────

  'unclear-setup': {
    id: 'unclear-setup',
    slug: 'unclear-setup',
    title: 'Unclear Setup',
    icon: '?',
    tagline: 'Insufficient signal data — the image lacks enough information to classify confidently.',
    description:
      'The image does not contain enough diagnostic information for a high-confidence pattern classification. Common causes include low resolution, extreme face angle, heavy preset or retouching, or no clearly visible face features.',

    causes: [
      'Image is low resolution or heavily compressed — shadow detail lost',
      'Subject is at an extreme angle (full side profile or looking up/down steeply)',
      'Heavy preset, filter, or retouching removed shadow and catchlight detail',
      'Face is partially obscured, backlit, or in silhouette',
      'No clearly visible nose, eyes, or cheeks — necessary diagnostic landmarks',
    ],

    quickFix: {
      title: 'Upload a clearer, front-facing reference image',
      steps: [
        'Use an image where the face is roughly 3/4 facing the camera',
        'Ensure eyes, nose, and both cheeks are visible',
        'Avoid applying heavy presets — analyze the camera raw or lightly edited file',
        'Use an image at least 800px wide with visible shadow/highlight separation',
      ],
      timeEstimate: '1 minute',
    },

    fixes: [
      {
        id: 'upload-better-image',
        title: 'Upload a More Diagnostic Reference Image',
        difficulty: 'easy',
        timeEstimate: '1 min',
        steps: [
          'Select a 3/4-face or front-facing image rather than a profile or extreme angle',
          'Ensure the image shows natural shadow/highlight separation — avoid heavily processed files',
          'Use at least 800–1000px width for adequate detail',
          'Avoid B&W conversions if possible — color information aids classification',
          'If analyzing a film stock simulation, upload the original pre-LUT version',
        ],
        targetPatterns: ['loop', 'rembrandt', 'butterfly', 'split', 'flat'],
      },
    ],

    relatedPatterns: ['loop', 'butterfly'],
    relatedSymptoms: ['ambiguous-pattern'],
    signalTriggers: ['low_reliability', 'no_face', 'low_resolution', 'extreme_angle'],
  },

  // ── No Triangle ──────────────────────────────────────────────────────────────

  'no-triangle': {
    id: 'no-triangle',
    slug: 'no-triangle',
    title: 'No Rembrandt Triangle',
    icon: '△',
    tagline: 'Expected cheek triangle not detected — the Rembrandt pattern may not be forming.',
    description:
      'The analysis expected a Rembrandt pattern based on other signals, but no triangular cheek highlight is visible on the shadow side. The triangle is the defining feature of Rembrandt — without it, the pattern defaults to Rembrandt-adjacent but cannot be confirmed.',

    causes: [
      'Key light too far to the side — triangle collapses when light goes past 60°',
      'Key light too low — triangle requires height above the cheekbone',
      'Subject face turned too far from the light — triangle cannot form',
      'Fill too bright — triangle washed out by fill ratio below 2:1',
      'Subject has a flat or low facial structure — cheekbone doesn\'t cast the triangle effectively',
    ],

    quickFix: {
      title: 'Raise and slightly pull the key light toward camera',
      steps: [
        'Raise the key light stand so center is about 30cm above the subject\'s eye level',
        'Move the light slightly toward the camera axis (from 60°+ back toward 45°)',
        'Have the subject turn their face slightly toward the light — the triangle should appear',
      ],
      timeEstimate: '90 seconds',
    },

    fixes: [
      {
        id: 'form-triangle',
        title: 'Adjust Light Position to Form Triangle',
        difficulty: 'medium',
        timeEstimate: '5 min',
        steps: [
          'Set key light at exactly 45° to the side — not further',
          'Raise light until modifier center is 20–30cm above subject eye level',
          'Have subject turn nose just past the light source — this is the critical pose cue',
          'Watch the shadow-side cheek in live view — triangle should appear as nose shadow merges with cheek shadow',
          'If still absent: reduce fill to at least 3:1 ratio so the triangle isn\'t washed out',
        ],
        targetPatterns: ['rembrandt'],
      },
    ],

    relatedPatterns: ['rembrandt'],
    relatedSymptoms: ['too-flat', 'ambiguous-pattern'],
    signalTriggers: ['rembrandt_no_triangle', 'missing_cheek_triangle'],
  },

  // ── Shadow Too Strong ─────────────────────────────────────────────────────────

  'shadow-too-strong': {
    id: 'shadow-too-strong',
    slug: 'shadow-too-strong',
    title: 'Shadow Too Strong',
    icon: '⬛',
    tagline: 'Shadow side is too dark for the intended mood — ratio is excessive.',
    description:
      'The shadow side of the face has gone too dark for the intended pattern and mood. While intentional in split lighting, excessive shadow depth in loop or Rembrandt can look unbalanced and unflattering. The fix is almost always to add or brighten fill.',

    causes: [
      'No fill light or reflector on the shadow side',
      'Fill light power too low or positioned too far from subject',
      'Room has no bounce surfaces to soften shadow side naturally',
      'Key light ratio exceeding 5:1 in a context calling for 2:1–3:1',
    ],

    quickFix: {
      title: 'Add a white reflector on the shadow side',
      steps: [
        'Hold a white reflector or foam board on the shadow side, about 1m from subject',
        'Face it toward the key light — it will bounce fill into the shadow',
        'Move it closer or further until the shadow ratio reaches 2:1–3:1',
      ],
      timeEstimate: '60 seconds',
    },

    fixes: [
      {
        id: 'add-fill-for-shadow',
        title: 'Add or Boost Fill Light',
        difficulty: 'easy',
        timeEstimate: '2 min',
        steps: [
          'Add a white reflector at 90° to the key on the shadow side',
          'Or: add a low-power strobe as a dedicated fill at 2–3 stops below key',
          'Target 2:1 to 3:1 ratio for loop, 3:1 to 4:1 for Rembrandt',
          'Meter shadow side and lit side independently to confirm ratio',
        ],
        targetPatterns: ['loop', 'rembrandt'],
      },
    ],

    relatedPatterns: ['rembrandt', 'loop', 'split'],
    relatedSymptoms: ['too-dramatic'],
    signalTriggers: ['deep_shadow', 'high_ratio_excessive'],
  },
};
