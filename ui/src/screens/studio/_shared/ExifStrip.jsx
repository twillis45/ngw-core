/**
 * ExifStrip — shared EXIF readout strip for HomeScreen + ProcessingScreen.
 *
 * Renders the camera model chip (differentiated weight/color) + separator
 * dot + exposure data spans in a centered flex row. Sits at the bottom of
 * the viewfinder on both screens with identical styling.
 *
 * Props:
 *   exifData  — { model, aperture, shutter, iso, focalLength } | null
 *   style     — optional wrapper style overrides (position, animation, etc.)
 */
import { steel } from '../../../theme/studioMatte';

const TEXT_BASE = {
  WebkitFontSmoothing: 'antialiased',
  MozOsxFontSmoothing: 'grayscale',
  textRendering: 'geometricPrecision',
};

export default function ExifStrip({ exifData, style }) {
  if (!exifData) return null;

  const exposureValues = [
    exifData.aperture,
    exifData.shutter,
    exifData.iso && `ISO ${exifData.iso}`,
    exifData.focalLength,
  ].filter(Boolean);

  if (!exifData.model && exposureValues.length === 0) return null;

  return (
    <div style={{
      position: 'absolute', bottom: 10, left: 0, right: 0, zIndex: 11,
      display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14,
      pointerEvents: 'none',
      ...style,
    }}>
      {/* Model chip — equipment identity, differentiated from exposure data */}
      {exifData.model && (
        <>
          <span style={{
            fontSize: 9, fontWeight: 500, letterSpacing: '0.6px',
            color: steel(0.68),
            textShadow: '0 1px 4px rgba(0,0,0,0.90)',
            ...TEXT_BASE,
          }}>{exifData.model}</span>
          <span style={{
            fontSize: 7, color: steel(0.30), lineHeight: 1,
            alignSelf: 'center',
          }}>·</span>
        </>
      )}
      {exposureValues.map((val, i) => (
        <span key={i} style={{
          fontSize: 9, fontWeight: 600, letterSpacing: '0.8px',
          color: steel(0.58),
          textShadow: '0 1px 4px rgba(0,0,0,0.90)',
          fontVariantNumeric: 'tabular-nums',
          ...TEXT_BASE,
        }}>
          {val}
        </span>
      ))}
    </div>
  );
}
