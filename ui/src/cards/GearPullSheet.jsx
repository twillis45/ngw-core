/**
 * GearPullSheet — Pre-shoot equipment checklist.
 *
 * Generates a printable/downloadable gear list from a DiagramSpec or result.
 * Designed to be handed to an assistant or taped to a case.
 *
 * Data sources:
 * - DiagramSpec.lights → each light's role, modifier, distance, height, angle
 * - result.pattern → setup name
 * - Camera settings if available
 *
 * Output: opens a clean print window with checklist checkboxes.
 */
import { C, steel } from '../theme/studioMatte';

function fmtDist(m) {
  return m ? `${(m * 3.281).toFixed(1)} ft` : '—';
}

function fmtAngle(deg) {
  return deg != null ? `${Math.round(Math.abs(deg))}°` : '—';
}

function buildPullSheetHTML(spec, pattern, camera, title) {
  const lights = spec?.lights || [];
  const heading = title || `${(pattern || 'Setup').replace(/_/g, ' ')} — Gear Pull Sheet`;
  const now = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const lightRows = lights.map((l, i) => {
    const role = (l.label || l.role || '').replace(/_/g, ' ');
    const mod = (l.modifier || '').replace(/_/g, ' ');
    const dist = fmtDist(l.distance_m);
    const angle = fmtAngle(l.angle_deg);
    const height = fmtDist(l.height_m);
    const power = l.power_hint || l.continuous_power_hint || '';
    const notes = (l.notes || []).join('. ');

    return `<tr>
      <td class="check"><input type="checkbox" /></td>
      <td class="role">${role}</td>
      <td>${mod}</td>
      <td>${dist}</td>
      <td>${angle}</td>
      <td>${height}</td>
      <td>${power}</td>
      <td class="notes">${notes}</td>
    </tr>`;
  }).join('');

  const cameraRow = camera && (camera.aperture || camera.iso)
    ? `<div class="camera-row">
        <strong>Camera:</strong>
        ${[camera.aperture, camera.shutter, camera.iso ? `ISO ${camera.iso}` : '', camera.focal_length ? `${camera.focal_length}mm` : ''].filter(Boolean).join(' · ')}
      </div>`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <title>${heading}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; padding: 24px; color: #1e293b; font-size: 13px; }
    h1 { font-size: 18px; font-weight: 700; margin-bottom: 4px; }
    .meta { font-size: 11px; color: #64748b; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th { text-align: left; font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; padding: 6px 8px; border-bottom: 2px solid #e2e8f0; }
    td { padding: 8px; border-bottom: 1px solid #e2e8f0; font-size: 12px; vertical-align: top; }
    td.check { width: 28px; text-align: center; }
    td.check input { width: 16px; height: 16px; }
    td.role { font-weight: 600; text-transform: capitalize; white-space: nowrap; }
    td.notes { font-size: 11px; color: #64748b; max-width: 200px; }
    .camera-row { font-size: 12px; color: #475569; margin-bottom: 16px; padding: 8px 12px; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0; }
    .footer { font-size: 10px; color: #94a3b8; text-align: center; margin-top: 24px; padding-top: 12px; border-top: 1px solid #e2e8f0; }
    .notes-area { margin-top: 16px; }
    .notes-area h3 { font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; }
    .notes-lines { border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; min-height: 80px; }
    .notes-line { border-bottom: 1px solid #f1f5f9; height: 24px; }
    .notes-line:last-child { border-bottom: none; }
    @media print {
      @page { margin: 12mm; }
      body { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <h1>${heading}</h1>
  <div class="meta">${now} · ${lights.length} light${lights.length !== 1 ? 's' : ''}</div>

  ${cameraRow}

  <table>
    <thead>
      <tr>
        <th>✓</th>
        <th>Light</th>
        <th>Modifier</th>
        <th>Distance</th>
        <th>Angle</th>
        <th>Height</th>
        <th>Power</th>
        <th>Notes</th>
      </tr>
    </thead>
    <tbody>${lightRows}</tbody>
  </table>

  <div class="notes-area">
    <h3>On-Set Notes</h3>
    <div class="notes-lines">
      ${Array(4).fill('<div class="notes-line"></div>').join('')}
    </div>
  </div>

  <div class="footer">No Guesswork Lighting · Pull Sheet</div>

  <script>window.onload = function(){ window.print(); }</script>
</body>
</html>`;
}


export default function GearPullSheetButton({ spec, pattern, camera, title, style }) {
  const handlePrint = () => {
    const html = buildPullSheetHTML(spec, pattern, camera, title);
    const win = window.open('', '_blank', 'width=800,height=700');
    if (!win) return;
    win.document.write(html);
    win.document.close();
  };

  if (!spec?.lights?.length) return null;

  return (
    <button
      onClick={handlePrint}
      style={{
        padding: '8px 14px',
        borderRadius: 8,
        border: 'none',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.05em',
        cursor: 'pointer',
        background: C.slotBg,
        color: steel(0.6),
        boxShadow: 'inset 1px 1px 3px rgba(0,0,0,0.4)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        ...style,
      }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>
      Gear Pull Sheet
    </button>
  );
}

export { buildPullSheetHTML };
