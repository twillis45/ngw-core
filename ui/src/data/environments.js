export const ENVIRONMENTS = [
  { value: 'studio_small',       label: 'Small Studio',          desc: 'Dedicated studio, tight cyclorama, or compact backdrop' },
  { value: 'home_studio',        label: 'Home Studio',           desc: 'Garage, spare room, or home backdrop' },
  { value: 'studio_medium',      label: 'Studio — Medium',       desc: 'Shared studio or rental space' },
  { value: 'studio_large',       label: 'Studio — Large',        desc: 'Full commercial studio' },
  { value: 'on_location_indoor', label: 'On Location (Indoor)',  desc: 'Office, venue, warehouse, home' },
  { value: 'on_location_outdoor',label: 'On Location (Outdoor)', desc: 'Park, street, rooftop, natural light' },
  { value: 'event',              label: 'Event',                 desc: 'Wedding, corporate event, run-and-gun' },
];

/** Environments where ceiling height is not applicable */
export const NON_STUDIO_ENVIRONMENTS = [
  'on_location_outdoor',
  'on_location_indoor',
  'event',
];
