/**
 * exportSvg — SVG-to-PNG and SVG-to-PDF export utilities.
 *
 * Used by LightingDiagram (SVG-based) to provide the same export
 * capability as the legacy canvas-based DiagramCard.
 *
 * Flow: serialize SVG → draw onto offscreen canvas → export as PNG/PDF.
 */

/**
 * Render an SVG element onto an offscreen canvas.
 * @param {SVGElement} svgEl — the inline SVG DOM element
 * @param {number} scale — resolution multiplier (2 = 2x for retina)
 * @returns {Promise<HTMLCanvasElement>}
 */
function svgToCanvas(svgEl, scale = 2) {
  return new Promise((resolve, reject) => {
    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgEl);
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const img = new Image();
    img.onload = () => {
      const w = svgEl.viewBox?.baseVal?.width || svgEl.clientWidth || 400;
      const h = svgEl.viewBox?.baseVal?.height || svgEl.clientHeight || 400;
      const canvas = document.createElement('canvas');
      canvas.width = w * scale;
      canvas.height = h * scale;
      const ctx = canvas.getContext('2d');
      // Dark background matching Studio Matte
      ctx.fillStyle = '#0a0b0e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to render SVG to canvas'));
    };
    img.src = url;
  });
}

/**
 * Render an SVG element to an offscreen HTMLCanvasElement (no download).
 * Used by SocialExportPanel to composite the real lighting diagram into social cards.
 */
export function svgToCanvasElement(svgEl, scale = 2) {
  return svgToCanvas(svgEl, scale);
}

/**
 * Export an SVG element as a PNG file download.
 * @param {SVGElement} svgEl
 * @param {string} filename — without extension
 * @param {boolean} whiteLabel — if true, omit branding footer
 */
export async function exportSvgAsPng(svgEl, filename = 'diagram', whiteLabel = false) {
  if (!svgEl) return;
  const canvas = await svgToCanvas(svgEl, 2);

  // Optionally add branding footer
  if (!whiteLabel) {
    const brandH = 28 * 2; // 2x scale
    const final = document.createElement('canvas');
    final.width = canvas.width;
    final.height = canvas.height + brandH;
    const ctx = final.getContext('2d');
    ctx.fillStyle = '#0a0b0e';
    ctx.fillRect(0, 0, final.width, final.height);
    ctx.drawImage(canvas, 0, 0);
    ctx.fillStyle = '#0d0e12';
    ctx.fillRect(0, canvas.height, final.width, brandH);
    ctx.fillStyle = 'rgba(132,158,184,0.45)';
    ctx.font = '22px Inter, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No Guesswork Lighting', final.width / 2, canvas.height + brandH - 16);

    const link = document.createElement('a');
    link.download = `${filename}.png`;
    link.href = final.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } else {
    const link = document.createElement('a');
    link.download = `${filename}.png`;
    link.href = canvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

/**
 * Build a light legend array from an analysis result for PDF export.
 * Extracts key light info from lighting_inference + reconstruction + modifier.
 */
function buildLightLegend(result) {
  if (!result) return [];
  const raw = result._raw || {};
  const li = raw.lighting_inference || {};
  const recon = raw.reconstruction || {};
  const mod = result.sections?.modifier;
  const lights = [];

  // Key light — always present if we have inference
  if (li.pattern || li.key_side) {
    const keyParts = [];
    if (mod?.family) keyParts.push(mod.family);
    if (li.key_position_text) keyParts.push(li.key_position_text.replace(/_/g, ' '));
    if (mod?.distRange) keyParts.push(mod.distRange);
    if (recon.key_light_height) keyParts.push(recon.key_light_height + ' height');
    lights.push({ role: 'Key Light', detail: keyParts.join(' · ') || 'Detected' });
  }

  // Fill
  if (li.fill_method_text && li.fill_method_text !== 'none') {
    lights.push({ role: 'Fill', detail: li.fill_method_text.replace(/_/g, ' ') });
  }

  // Light count > 1 implies additional lights
  if (li.light_count > 1 && lights.length < li.light_count) {
    const remaining = li.light_count - lights.length;
    if (remaining > 0) {
      lights.push({ role: `${remaining} additional light${remaining > 1 ? 's' : ''}`, detail: 'Detected in scene' });
    }
  }

  return lights;
}

/**
 * Export an SVG element as a PDF file download.
 * Falls back to PNG if jsPDF is not available.
 * @param {SVGElement} svgEl
 * @param {object} result — full analysis result (for light legend extraction)
 * @param {string} title — diagram title / pattern name
 * @param {boolean} whiteLabel
 */
export async function exportSvgAsPdf(svgEl, result, title = 'Lighting Diagram', whiteLabel = false) {
  if (!svgEl) return;

  let jsPDF;
  try {
    const mod = await import('jspdf');
    jsPDF = mod.jsPDF || mod.default;
  } catch {
    const patternLabel = (title || '').replace(/\s+/g, '_');
    await exportSvgAsPng(svgEl, patternLabel || 'diagram', whiteLabel);
    return;
  }

  const canvas = await svgToCanvas(svgEl, 2);
  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  // Title
  pdf.setFontSize(16);
  pdf.setFont(undefined, 'bold');
  pdf.text(title || 'Lighting Diagram', 14, 16);

  // Subtitle — pattern + confidence
  const confidence = result?.confidence;
  if (confidence != null) {
    pdf.setFontSize(9);
    pdf.setFont(undefined, 'normal');
    pdf.setTextColor(100);
    pdf.text(`${confidence}% confidence · Top-down view`, 14, 22);
    pdf.setTextColor(0);
  }

  // Diagram image — preserve aspect ratio, center horizontally
  const aspectRatio = canvas.height / canvas.width;
  const maxImgW = pageW - 28;
  const maxImgH = pageH - 80; // room for title + legend + footer
  let imgW = maxImgW;
  let imgH = imgW * aspectRatio;
  if (imgH > maxImgH) {
    imgH = maxImgH;
    imgW = imgH / aspectRatio;
  }
  const imgX = 14 + (maxImgW - imgW) / 2; // center
  pdf.addImage(imgData, 'PNG', imgX, 26, imgW, imgH);

  // Light legend below diagram
  const lights = buildLightLegend(result);
  if (lights.length > 0) {
    let y = 26 + imgH + 8;
    pdf.setDrawColor(200);
    pdf.line(14, y - 2, pageW - 14, y - 2);
    pdf.setFontSize(8);
    lights.forEach(l => {
      if (y > pageH - 12) return;
      pdf.setFont(undefined, 'bold');
      pdf.text(l.role, 16, y);
      pdf.setFont(undefined, 'normal');
      const roleW = pdf.getTextWidth(l.role);
      if (l.detail) {
        pdf.text(` \u2014 ${l.detail}`, 16 + roleW + 2, y);
      }
      y += 5;
    });
  }

  // Brand footer
  if (!whiteLabel) {
    pdf.setFontSize(7);
    pdf.setTextColor(150);
    pdf.text('No Guesswork Lighting', pageW / 2, pageH - 6, { align: 'center' });
  }

  const filename = `${(title || 'diagram').replace(/\s+/g, '_')}.pdf`;
  pdf.save(filename);
}
