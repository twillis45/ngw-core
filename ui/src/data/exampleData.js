/**
 * Pre-baked example analyses for the homepage.
 *
 * Each entry contains a DiagramCard-compatible spec, result chips,
 * and metadata so the homepage can showcase NGW output without
 * making an API call.
 *
 * Images from Unsplash (royalty-free).
 */

export const EXAMPLE_ANALYSES = [
  {
    id: 'rembrandt_portrait',
    label: 'Rembrandt Portrait',
    category: 'Portrait',
    thumbnail: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=600&q=80',
    placeholderGradient: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
    diagramSpec: {
      lights: [
        { role: 'key', label: 'Key', angle_deg: 315, distance_m: 1.5, height_m: 2.0, modifier: 'softbox' },
      ],
      camera: { distance_m: 2.2 },
    },
    chips: {
      pattern: 'Rembrandt',
      camera: 'f/2.8 \u00b7 1/200 \u00b7 ISO 100',
      modifier: '36\u2033 Softbox',
    },
    lightCount: 1,
    archetype: 'karsh',
    description: 'Single key light at 45\u00b0 above. One side of the face falls into shadow with the signature Rembrandt triangle on the cheek.',
  },
  {
    id: 'clamshell_beauty',
    label: 'Beauty Clamshell',
    category: 'Beauty',
    thumbnail: 'https://images.unsplash.com/photo-1616683693504-3ea7e9ad6fec?w=600&q=80',
    placeholderGradient: 'linear-gradient(135deg, #2d1b69 0%, #4a1942 50%, #6b1d5e 100%)',
    diagramSpec: {
      lights: [
        { role: 'key', label: 'Key (above)', angle_deg: 0, distance_m: 1.2, height_m: 2.1, modifier: 'beauty_dish' },
        { role: 'fill', label: 'Fill (below)', angle_deg: 180, distance_m: 1.0, height_m: 0.8, modifier: 'softbox_rect' },
      ],
      camera: { distance_m: 1.8 },
    },
    chips: {
      pattern: 'Butterfly',
      camera: 'f/5.6 \u00b7 1/160 \u00b7 ISO 200',
      modifier: '22\u2033 Beauty Dish + Fill Panel',
    },
    lightCount: 2,
    archetype: 'adler',
    description: 'Classic clamshell: beauty dish above, fill panel below. High symmetry, even skin tones.',
  },
  {
    id: 'editorial_fashion',
    label: 'Fashion Editorial',
    category: 'Fashion',
    thumbnail: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=600&q=80',
    placeholderGradient: 'linear-gradient(135deg, #0d1117 0%, #161b22 50%, #21262d 100%)',
    diagramSpec: {
      lights: [
        { role: 'key', label: 'Key', angle_deg: 330, distance_m: 2.0, height_m: 2.2, modifier: 'stripbox' },
        { role: 'rim', label: 'Rim', angle_deg: 135, distance_m: 2.5, height_m: 2.0, modifier: 'stripbox' },
        { role: 'background', label: 'Background', angle_deg: 180, distance_m: 3.0, height_m: 1.5, modifier: 'grid' },
      ],
      camera: { distance_m: 3.0 },
    },
    chips: {
      pattern: 'Split',
      camera: 'f/8 \u00b7 1/250 \u00b7 ISO 100',
      modifier: 'Strip Softboxes + BG Grid',
    },
    lightCount: 3,
    archetype: 'penn',
    description: 'Hard edge lighting with strip softboxes. Dramatic shadows, strong rim separation.',
  },
];

/** Gallery entries — uses same photos as example analyses + extras. */
export const GALLERY_ITEMS = [
  { id: 'gallery_portrait', label: 'Portrait', gradient: 'linear-gradient(135deg, #1a1a2e, #0f3460)', image: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=400&q=80' },
  { id: 'gallery_beauty', label: 'Beauty', gradient: 'linear-gradient(135deg, #2d1b69, #6b1d5e)', image: 'https://images.unsplash.com/photo-1616683693504-3ea7e9ad6fec?w=400&q=80' },
  { id: 'gallery_editorial', label: 'Editorial', gradient: 'linear-gradient(135deg, #0d1117, #21262d)', image: 'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=400&q=80' },
  { id: 'gallery_dramatic', label: 'Dramatic', gradient: 'linear-gradient(135deg, #0d1117, #21262d)', image: 'https://images.unsplash.com/photo-1552374196-c4e7ffc6e126?w=400&q=80' },
  { id: 'gallery_natural', label: 'Natural Light', gradient: 'linear-gradient(135deg, #3a3a0a, #5c5c1a)', image: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400&q=80' },
  { id: 'gallery_headshot', label: 'Headshot', gradient: 'linear-gradient(135deg, #1b2838, #2a475e)', image: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&q=80' },
];
