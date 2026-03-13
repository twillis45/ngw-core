/**
 * Room dimension presets for common shooting environments.
 * All dimensions in feet.
 */

export const ROOM_PRESETS = [
  { label: 'Small Room',    lengthFt: 12, widthFt: 10, ceilingFt: 8,  icon: '\uD83C\uDFE0' },
  { label: 'Home Studio',   lengthFt: 20, widthFt: 15, ceilingFt: 10, icon: '\uD83C\uDFA8' },
  { label: 'Medium Studio', lengthFt: 25, widthFt: 20, ceilingFt: 12, icon: '\uD83D\uDCF7' },
  { label: 'Large Studio',  lengthFt: 35, widthFt: 25, ceilingFt: 14, icon: '\uD83C\uDFAC' },
  { label: 'Warehouse',     lengthFt: 50, widthFt: 40, ceilingFt: 20, icon: '\uD83C\uDFED' },
];

/**
 * Known reference objects for camera-based measurement.
 * Heights in feet.
 */
export const REFERENCE_OBJECTS = [
  { label: 'Standard Door Frame', heightFt: 6.667, description: '6 ft 8 in' },
  { label: 'Interior Door Width',  heightFt: 3.0,   description: '3 ft 0 in' },
  { label: 'Person Standing',      heightFt: null,   description: 'Enter height', requiresInput: true },
  { label: 'Custom Object',        heightFt: null,   description: 'Enter size',   requiresInput: true },
];
