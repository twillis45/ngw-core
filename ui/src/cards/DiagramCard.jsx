import { useRef, useEffect } from 'react';

const LIGHT_COLORS = { key: '#f59e0b', fill: '#3b82f6', rim: '#a855f7' };
const SHORT_MOD = {
  softbox: 'Softbox', softbox_rect: 'Rect Softbox', umbrella: 'Umbrella',
  beauty_dish: 'Beauty Dish', grid_spot: 'Grid', grid: 'Grid',
  stripbox: 'Strip', barn_doors: 'Barndoors', snoot: 'Snoot', bare: 'Bare',
};

function drawDiagram(canvas, spec) {
  if (!canvas || !spec) return;

  const dpr = window.devicePixelRatio || 1;
  const W = canvas.parentElement?.clientWidth || 340;
  const H = Math.round(W * 1.15);           // taller than wide for top-down feel
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  // ── layout constants ──────────────────────────────
  const subjectY = H * 0.48;                // subject slightly above center
  const subjectX = W / 2;
  const scale = Math.min(W, H) * 0.16;      // px per metre — adapts to size
  const cam = spec.camera || {};
  const camDist = cam.distance_m || 2;

  // ── background / backdrop rectangle ───────────────
  const bgW = W * 0.52;
  const bgH = 18;
  const bgY = subjectY - scale * 2.2;       // behind the subject
  ctx.fillStyle = '#334155';
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(subjectX - bgW / 2, bgY - bgH / 2, bgW, bgH, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#94a3b8';
  ctx.font = '9px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Background', subjectX, bgY + 3);

  // ── grid rings ────────────────────────────────────
  ctx.strokeStyle = 'rgba(71,85,105,0.25)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  for (let r = 1; r <= 3; r++) {
    ctx.beginPath();
    ctx.arc(subjectX, subjectY, r * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(148,163,184,0.35)';
    ctx.font = '8px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${r}m`, subjectX + r * scale + 3, subjectY - 3);
  }
  ctx.setLineDash([]);

  // ── subject ───────────────────────────────────────
  ctx.fillStyle = '#f1f5f9';
  ctx.beginPath();
  ctx.arc(subjectX, subjectY, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#cbd5e1';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Subject', subjectX, subjectY + 24);

  // ── camera ────────────────────────────────────────
  const camX = subjectX;
  const camY = subjectY + camDist * scale;
  ctx.fillStyle = '#64748b';
  ctx.beginPath();
  ctx.roundRect(camX - 10, camY - 6, 20, 12, 3);
  ctx.fill();
  // lens circle
  ctx.fillStyle = '#94a3b8';
  ctx.beginPath();
  ctx.arc(camX, camY, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#94a3b8';
  ctx.font = '9px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Camera', camX, camY + 20);

  // ── compute light positions ───────────────────────
  const lights = (spec.lights || []).map(l => {
    // angle_deg: 0 = directly ahead (top of diagram), positive = camera-right
    const angleRad = (l.angle_deg - 90) * Math.PI / 180;
    const dist = l.distance_m * scale;
    return {
      ...l,
      lx: subjectX + Math.cos(angleRad) * dist,
      ly: subjectY + Math.sin(angleRad) * dist,
    };
  });

  // ── beams (light → subject) ───────────────────────
  lights.forEach(({ role, lx, ly }) => {
    const color = LIGHT_COLORS[role] || '#fff';

    // Soft beam cone
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = color;
    const dx = subjectX - lx;
    const dy = subjectY - ly;
    const angle = Math.atan2(dy, dx);
    const spread = 0.25;
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(lx + Math.cos(angle - spread) * 200, ly + Math.sin(angle - spread) * 200);
    ctx.lineTo(lx + Math.cos(angle + spread) * 200, ly + Math.sin(angle + spread) * 200);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Center beam line
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(subjectX, subjectY);
    ctx.stroke();
    ctx.globalAlpha = 1;
  });

  // ── light markers ─────────────────────────────────
  lights.forEach(({ role, lx, ly }) => {
    const color = LIGHT_COLORS[role] || '#fff';
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(lx, ly, 7, 0, Math.PI * 2);
    ctx.fill();
    // white dot center
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(lx, ly, 2.5, 0, Math.PI * 2);
    ctx.fill();
  });

  // ── labels (collision-aware) ──────────────────────
  const labelBoxes = [];
  const PAD = 4;

  function textFits(x, y, w, h) {
    const r = { x: x - w / 2 - PAD, y: y - h - PAD, w: w + PAD * 2, h: h + PAD * 2 };
    for (const b of labelBoxes) {
      if (r.x < b.x + b.w && r.x + r.w > b.x && r.y < b.y + b.h && r.y + r.h > b.y) {
        return false;
      }
    }
    return true;
  }

  function pushBox(x, y, w, h) {
    labelBoxes.push({ x: x - w / 2 - PAD, y: y - h - PAD, w: w + PAD * 2, h: h + PAD * 2 });
  }

  // Reserve space for subject and camera labels
  pushBox(subjectX, subjectY + 24, 50, 14);
  pushBox(camX, camY + 20, 50, 14);
  pushBox(subjectX, bgY + 3, 70, 12);

  lights.forEach(({ label, role, modifier, lx, ly, distance_m }) => {
    const color = LIGHT_COLORS[role] || '#fff';
    const ft = (distance_m * 3.281).toFixed(1);
    const modText = SHORT_MOD[modifier] || (modifier || '').replace(/_/g, ' ');
    const roleName = label || (role.charAt(0).toUpperCase() + role.slice(1));
    const line2 = `${ft} ft · ${modText}`;

    ctx.font = 'bold 10px sans-serif';
    const nameW = ctx.measureText(roleName).width;
    ctx.font = '9px sans-serif';
    const detailW = ctx.measureText(line2).width;
    const boxW = Math.max(nameW, detailW);
    const boxH = 24;

    // Try multiple offset directions to avoid overlap
    const dx = lx - subjectX;
    const dy = ly - subjectY;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const offsets = [
      { x: (dx / len) * 30,  y: (dy / len) * 30 },           // outward
      { x: (dx / len) * 30 + 30, y: (dy / len) * 30 },       // outward + right
      { x: (dx / len) * 30 - 30, y: (dy / len) * 30 },       // outward + left
      { x: (dx / len) * 50,  y: (dy / len) * 50 },           // further outward
      { x: 0, y: -35 },                                       // above
      { x: 0, y: 35 },                                        // below
    ];

    let labelX = lx + offsets[0].x;
    let labelY = ly + offsets[0].y;

    for (const off of offsets) {
      const tx = lx + off.x;
      const ty = ly + off.y;
      if (tx - boxW / 2 > 4 && tx + boxW / 2 < W - 4 && ty - boxH > 4 && ty < H - 4) {
        if (textFits(tx, ty, boxW, boxH)) {
          labelX = tx;
          labelY = ty;
          break;
        }
      }
    }

    // Draw connector line from marker to label
    ctx.strokeStyle = 'rgba(148,163,184,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.lineTo(labelX, labelY - boxH / 2);
    ctx.stroke();

    // Role name
    ctx.fillStyle = color;
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(roleName, labelX, labelY);

    // Distance + modifier
    ctx.fillStyle = '#94a3b8';
    ctx.font = '9px sans-serif';
    ctx.fillText(line2, labelX, labelY + 12);

    pushBox(labelX, labelY + 12, boxW, boxH);
  });
}

export default function DiagramCard({ spec }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    drawDiagram(canvasRef.current, spec);

    // Redraw on resize so canvas fills card width
    function onResize() { drawDiagram(canvasRef.current, spec); }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [spec]);

  if (!spec) return null;

  const lights = spec.lights || [];

  return (
    <div className="result-card">
      <div className="result-card__header">
        <span className="result-card__icon">{'\u{1F5FA}\uFE0F'}</span>
        <span>Lighting Diagram</span>
      </div>

      <div className="diagram-wrap">
        <canvas ref={canvasRef} className="diagram-canvas" />
        <div className="diagram-legend">
          {lights.map(l => (
            <span className="diagram-legend__item" key={l.role}>
              <span
                className="diagram-legend__dot"
                style={{ background: LIGHT_COLORS[l.role] || '#fff' }}
              />
              {l.label || l.role}
            </span>
          ))}
          <span className="diagram-legend__item">
            <span className="diagram-legend__dot" style={{ background: '#64748b' }} />
            Camera
          </span>
          <span className="diagram-legend__item">
            <span className="diagram-legend__dot" style={{ background: '#f1f5f9' }} />
            Subject
          </span>
          <span className="diagram-legend__item">
            <span className="diagram-legend__dot" style={{ background: '#334155', border: '1px solid #475569' }} />
            Background
          </span>
        </div>
      </div>
    </div>
  );
}
