/**
 * VendorLogo — shared across gear cards.
 *
 * Shows a Clearbit favicon-sized brand logo for known vendors.
 * Falls back to a colored single-letter badge if the image fails to load.
 * Returns null for unknown vendors so layout stays clean.
 *
 * Usage:
 *   <VendorLogo name="Godox AD200Pro strobe (~$280)" />
 *   <VendorLogo name="Profoto B10 Plus" />
 *
 * The `name` prop is the full product string — the component sniffs the
 * leading word to identify the brand.
 */

import { useState } from 'react';

export const VENDOR_DOMAINS = {
  godox:     'godox.com',
  profoto:   'profoto.com',
  broncolor: 'broncolor.com',
  elinchrom: 'elinchrom.com',
  westcott:  'fjwestcott.com',
  neewer:    'neewer.com',
  bowens:    'bowens.co.uk',
  nanlite:   'nanlite.com',
  aputure:   'aputure.com',
  canon:     'canon.com',
  nikon:     'nikon.com',
  sony:      'sony.com',
  yongnuo:   'yongnuo.com',
  fujifilm:  'fujifilm.com',
  olympus:   'olympus-global.com',
  leica:     'leica-camera.com',
  hasselblad:'hasselblad.com',
  phase:     'phaseone.com',   // "Phase One"
};

export const VENDOR_COLORS = {
  godox:     '#e63329',
  profoto:   '#1a1a1a',
  broncolor: '#003087',
  elinchrom: '#e2001a',
  westcott:  '#0066cc',
  neewer:    '#ff6600',
  bowens:    '#444444',
  nanlite:   '#00aaff',
  aputure:   '#ff4500',
  canon:     '#c8102e',
  nikon:     '#ffd700',
  sony:      '#000000',
  yongnuo:   '#1a73e8',
  fujifilm:  '#cc0000',
  olympus:   '#0055a5',
  leica:     '#cc0000',
  hasselblad:'#f5a623',
  phase:     '#222222',
};

export function getVendorInfo(itemName) {
  const lower = (itemName || '').toLowerCase();
  for (const [key, domain] of Object.entries(VENDOR_DOMAINS)) {
    if (lower.startsWith(key)) {
      return { brand: key, domain, color: VENDOR_COLORS[key] || '#888' };
    }
  }
  return null;
}

export default function VendorLogo({ name }) {
  const [failed, setFailed] = useState(false);
  const vendor = getVendorInfo(name);
  if (!vendor) return null;

  if (failed) {
    return (
      <span
        className="kits-vendor-badge"
        style={{ background: vendor.color }}
        title={vendor.brand}
      >
        {vendor.brand[0].toUpperCase()}
      </span>
    );
  }

  return (
    <img
      className="kits-vendor-logo"
      src={`https://logo.clearbit.com/${vendor.domain}`}
      alt={vendor.brand}
      title={vendor.brand}
      onError={() => setFailed(true)}
    />
  );
}
