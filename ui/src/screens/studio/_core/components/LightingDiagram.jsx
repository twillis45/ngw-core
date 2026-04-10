/**
 * LightingDiagram — Studio Matte top-down setup diagram
 *
 * Combines the compact SVG approach (from ShadowDiagram) with the rich
 * visual vocabulary from DiagramCard (light beams, distance badges, role colors).
 * Renders key light position, beam cone, shadow direction, camera, and
 * modifier/distance annotations — all in Studio Matte aesthetic.
 *
 * Props:
 *   result    — analysis result (needs ._raw.lighting_inference + .sections.modifier)
 *   compact   — boolean, smaller variant for inline use (default false)
 *   fluid     — boolean, render the SVG at 100% of its container so the
 *               diagram zooms with the viewport (default false)
 */
import { steel } from '../../../../theme/studioMatte';

// ─── Role colors (from DiagramCard palette — dark theme) ─────────────────────
const KEY_COLOR      = '#c89b45';
const KEY_FAINT      = 'rgba(200,159,69,0.25)';
const KEY_BEAM       = 'rgba(200,159,69,0.10)';
const SHADOW_COLOR   = steel(0.45);

// ─── Clock-position → angle mapping ─────────────────────────────────────────
function clockToAngle(position) {
  if (!position) return null;
  const match = position.match(/(\d+)\s*o.?clock/i);
  if (!match) return null;
  const hour = parseInt(match[1], 10);
  // 12=0°, 1=30°, 2=60° … 11=330° (clockwise from top)
  return (hour % 12) * 30;
}

function sideToAngle(side, elevation) {
  const base = side === 'right' ? 45 : side === 'center' ? 0 : -45;
  const elevAdj = elevation === 'high' ? -8 : elevation === 'low' ? 12 : 0;
  return base + elevAdj;
}

export default function LightingDiagram({ result, compact = false, fluid = false }) {
  if (!result) return null;

  const raw = result._raw || {};
  const li  = raw.lighting_inference || {};
  const sd  = raw.signal_diagnostics || {};
  const mod = result.sections?.modifier;

  const keySide      = li.key_side || 'left';
  const keyElevation = li.key_elevation || 'medium';
  const shadowDeg    = sd.nose_shadow_angle_deg ?? sd.signals?.nose_shadow_angle_deg ?? null;

  // Reconstruction-derived signals (preferred when available — these come
  // straight from the engine's pose-corrected estimate).
  const recon       = raw.reconstruction || {};
  // engine convention: 0–180, offset from camera axis (0 = on-axis, 90 = side)
  const reconKeyDeg = (typeof recon.key_light_angle_deg_pose_corrected === 'number'
    ? recon.key_light_angle_deg_pose_corrected
    : (typeof recon.key_light_angle_deg === 'number' ? recon.key_light_angle_deg : null));

  // Determine key light angle from clock position or key_side fallback
  const clockPos    = mod?.position || (li.catchlight_intelligence?.primary_key?.position);
  const clockAngle  = clockToAngle(clockPos);
  // Resolve diagram angle (0°=up/back-of-frame, 90°=right, 180°=down/camera-side):
  //   1) reconKeyDeg + side → camera-anchored offset (most accurate)
  //   2) clock position from catchlight intel
  //   3) key_side coarse fallback
  let kAngleDeg;
  if (reconKeyDeg != null) {
    // Engine angle is offset from camera axis (camera→subject line points UP
    // in our top-down canvas, so on-axis = 0° in our convention).  Sign comes
    // from key_side: camera-right key = positive (clockwise), camera-left key
    // = negative.  When side is unknown, fall back to nose-shadow polarity.
    const sign = keySide === 'right'
      ? 1
      : keySide === 'left'
        ? -1
        : (shadowDeg != null && shadowDeg > 180 ? -1 : 1);
    kAngleDeg = sign * reconKeyDeg;
  } else if (clockAngle != null) {
    // Top-down diagram: subject faces camera (downward).  The catchlight
    // clock position is from the subject's viewpoint — 1 o'clock = subject's
    // left = camera-right.  `180 - clockAngle` mirrors X so camera-right
    // maps to diagram-right.
    kAngleDeg = 180 - clockAngle;
  } else {
    kAngleDeg = sideToAngle(keySide, keyElevation);
  }

  // ─── Canvas dimensions ───────────────────────────────────────────────────
  // Compact mode uses a slightly wider aspect (220×150) so that at fluid
  // sizes the key light + distance annotations reach the canvas edges
  // instead of floating in dead space.  Full mode is unchanged.
  const W = compact ? 220 : 300;
  const H = compact ? 150 : 220;

  // Subject center — pulled up to leave room for the camera at the bottom
  // and the BG strip at the top.  Larger subR fills more of the canvas.
  const subX = W / 2;
  const subY = compact ? 58 : 90;
  const subR = compact ? 20 : 22;

  // Camera — at the bottom of the canvas, looking UP at the subject (top-down
  // POV: camera is "in front of" the subject's face).
  const camY = H - (compact ? 16 : 22);

  // Background indicator — behind the subject (top of canvas).
  const bgY  = compact ? 12 : 16;

  // Key light position — pushed farther from the subject in compact so the
  // key marker + rays land near the canvas edge instead of floating mid-way.
  const kDist = compact ? 66 : 72;
  const kRad  = (kAngleDeg * Math.PI) / 180;
  const kX    = subX + kDist * Math.sin(kRad);
  const kY    = subY + kDist * Math.cos(kRad);

  // Shadow direction (from nose).  Fallback when shadow_pass had no signal:
  // shadow falls roughly opposite the key, biased downward (chin-ward).
  // Convention: 0°=up, 90°=right, 180°=down, 270°=left.
  //   right key  → shadow falls down-and-left  → ~225°
  //   center key → shadow falls straight down  → ~180°
  //   left key   → shadow falls down-and-right → ~135°
  const fallbackShadow = keySide === 'right' ? 225 : keySide === 'center' ? 180 : 135;
  const sDeg  = shadowDeg ?? fallbackShadow;
  const sRad  = (sDeg * Math.PI) / 180;
  const sLen  = compact ? 22 : 30;
  // Shadow originates from the NOSE TIP (not subject center) so it cannot
  // be misread as a face-direction arrow.  The nose tip sits just below the
  // subject circle, pointing toward the camera.
  const noseTipX = subX;
  const noseTipY = subY + subR + 4;
  const sTipX = noseTipX + sLen * Math.sin(sRad);
  const sTipY = noseTipY - sLen * Math.cos(sRad);

  // Shadow arrowhead
  const aLen = compact ? 4 : 5;
  const aWidth = compact ? 2.5 : 3;
  const perp = sRad + Math.PI / 2;
  const arrX = sTipX + aLen * Math.sin(sRad);
  const arrY = sTipY - aLen * Math.cos(sRad);
  const arrowPts = [
    `${arrX},${arrY}`,
    `${sTipX - aWidth * Math.sin(perp)},${sTipY + aWidth * Math.cos(perp)}`,
    `${sTipX + aWidth * Math.sin(perp)},${sTipY - aWidth * Math.cos(perp)}`,
  ].join(' ');

  // Light beam cone (triangular spread from key to subject surface)
  const beamSpread = compact ? 12 : 18;
  const beamPerp = kRad + Math.PI / 2;
  const bX = subX + subR * Math.sin(kRad);
  const bY = subY + subR * Math.cos(kRad);
  const beamPts = [
    `${kX},${kY}`,
    `${bX + beamSpread * Math.sin(beamPerp)},${bY - beamSpread * Math.cos(beamPerp)}`,
    `${bX - beamSpread * Math.sin(beamPerp)},${bY + beamSpread * Math.cos(beamPerp)}`,
  ].join(' ');

  // Sun rays around key light
  const innerR = compact ? 8 : 11;
  const outerR = compact ? 12 : 17;
  const rays = [0, 45, 90, 135, 180, 225, 270, 315].map(deg => {
    const r = (deg * Math.PI) / 180;
    return {
      x1: kX + innerR * Math.sin(r), y1: kY - innerR * Math.cos(r),
      x2: kX + outerR * Math.sin(r), y2: kY - outerR * Math.cos(r),
    };
  });

  // Label positioning
  const keyLabelSide = kX > subX + 6 ? 'start' : 'end';
  const keyLabelX    = kX > subX + 6 ? kX + (compact ? 14 : 20) : kX - (compact ? 14 : 20);

  // Steel alias — every alpha is bumped by ~0.18 with a floor at 0.42 so
  // the diagram reads on bright displays. The original dim 0.15–0.30 stops
  // disappeared on calibrated monitors; lifting them keeps the matte
  // hierarchy intact while making every glyph legible.
  const st = (a) => `rgba(95,124,150,${Math.min(1, Math.max(0.42, a + 0.18))})`;

  // Modifier label for full mode
  const modLabel = mod ? `${mod.sizeLabel ? mod.sizeLabel + ' ' : ''}${mod.family || ''}`.trim() : null;

  // Camera height annotation — sourced from engine vision pass
  // (camera_height_relative_to_eyes: above | at_eye_level | below).
  const _camHeight = (
    raw.camera_height ||
    raw.geometry?.camera_height_relative_to_eyes ||
    raw.geometry_pass?.camera_height ||
    li.camera_height ||
    null
  );
  const camHeightLabel = _camHeight === 'above'        ? 'HIGH ANGLE'
                       : _camHeight === 'below'        ? 'LOW ANGLE'
                       : _camHeight === 'at_eye_level' ? 'EYE LEVEL'
                       : null;

  return (
    <svg
      {...(fluid
        ? { width: '100%', height: '100%', preserveAspectRatio: 'xMidYMid meet' }
        : { width: W, height: H })}
      viewBox={`0 0 ${W} ${H}`}
      style={{
        display: 'block',
        margin: fluid ? 0 : (compact ? '12px auto 4px' : '0 auto'),
        overflow: 'visible',
        ...(fluid ? { width: '100%', height: '100%' } : null),
      }}
    >
      {/* Background indicator — rendered in both modes so the top-down
          scene reads as subject-between-background-and-camera.  Width is
          a canvas-relative constant so it visually anchors the top edge. */}
      {(() => {
        const bgHalf = compact ? 70 : 60;
        const bgH    = compact ? 8  : 10;
        const fontSz = compact ? 6  : 7;
        return (
          <>
            <rect
              x={subX - bgHalf} y={bgY - bgH / 2} width={bgHalf * 2} height={bgH} rx={3}
              fill="none" stroke={st(0.22)} strokeWidth={0.75}
            />
            <text x={subX} y={bgY + 2.5} textAnchor="middle"
              fill={st(0.38)} fontSize={fontSz} fontWeight="600" letterSpacing="0.8"
              fontFamily="Inter, system-ui, sans-serif">BG</text>
          </>
        );
      })()}

      {/* Camera → subject axis (dashed) */}
      <line
        x1={subX} y1={subY + subR + 2} x2={subX} y2={camY - (compact ? 7 : 10)}
        stroke={st(0.15)} strokeWidth={0.75} strokeDasharray="3,3"
      />

      {/* Light beam cone */}
      <polygon points={beamPts} fill={KEY_BEAM} />

      {/* Light beam center line */}
      <line x1={kX} y1={kY} x2={bX} y2={bY}
        stroke={KEY_FAINT} strokeWidth={1.5} />

      {/* Shadow direction line — dashed, originates from the nose tip so it
          reads as a cast shadow rather than a nose / face-direction arrow. */}
      <line x1={noseTipX} y1={noseTipY} x2={sTipX} y2={sTipY}
        stroke={SHADOW_COLOR} strokeWidth={1.25} strokeLinecap="round"
        strokeDasharray="2,2" />
      <polygon points={arrowPts} fill={SHADOW_COLOR} />
      {/* SHADOW label — merged with angle readout so the two annotations
          can never overlap or collide with the KEY marker.  The label sits
          past the arrow tip along the shadow direction so it stays clear
          of the subject head and the key light cluster. */}
      {(() => {
        const dx = Math.sin(sRad);
        const dy = -Math.cos(sRad);
        // Base position: past the arrow tip along shadow direction.
        let lx = sTipX + dx * 10;
        let ly = sTipY + dy * 10 + 2;
        // Collision avoidance — if the label would land near the KEY
        // marker, push it perpendicular away from the key so the two
        // annotations can never stack on top of one another.
        const distToKey = Math.hypot(lx - kX, ly - kY);
        if (distToKey < (compact ? 22 : 28)) {
          // Perpendicular to shadow direction — choose the side further
          // from the key light.
          const px = -dy;
          const py = dx;
          const dot = px * (lx - kX) + py * (ly - kY);
          const sign = dot >= 0 ? 1 : -1;
          const off = compact ? 16 : 20;
          lx += sign * px * off;
          ly += sign * py * off;
        }
        const anchor = dx >= 0.2 ? 'start' : dx <= -0.2 ? 'end' : 'middle';
        const labelText = shadowDeg != null
          ? `SHADOW ${Math.round(shadowDeg)}°`
          : 'SHADOW';
        return (
          <text
            x={lx} y={ly} textAnchor={anchor}
            fill={st(0.42)} fontSize={compact ? 5.5 : 6} fontWeight="600"
            letterSpacing="0.4"
            fontFamily="Inter, system-ui, sans-serif"
          >{labelText}</text>
        );
      })()}

      {/* Sun rays */}
      {rays.map((r, i) => (
        <line key={i} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2}
          stroke={KEY_FAINT} strokeWidth={0.75} />
      ))}

      {/* Key light marker — outer ring + center dot */}
      <circle cx={kX} cy={kY} r={compact ? 7 : 9}
        fill="none" stroke={KEY_COLOR} strokeWidth={1.5} />
      <circle cx={kX} cy={kY} r={compact ? 2.5 : 3.5}
        fill={KEY_COLOR} />

      {/* Subject head */}
      <circle cx={subX} cy={subY} r={subR}
        fill="#0a0a0d" stroke={st(0.55)} strokeWidth={1.5} />
      {/* Eyes — two small dots near the front of the face (toward camera) */}
      <circle cx={subX - 5} cy={subY + 3} r={1.2} fill={st(0.55)} />
      <circle cx={subX + 5} cy={subY + 3} r={1.2} fill={st(0.55)} />
      {/* Nose — small triangle pointing toward the camera so the subject's
          orientation is unambiguous: the face is looking DOWN at the camera. */}
      <polygon
        points={`${subX - 3.5},${subY + subR - 3} ${subX + 3.5},${subY + subR - 3} ${subX},${subY + subR + 4}`}
        fill={st(0.55)}
      />

      {/* Camera icon */}
      <rect x={subX - 9} y={camY - 6} width={18} height={12} rx={2}
        fill="none" stroke={st(0.35)} strokeWidth={1} />
      <rect x={subX - 2.5} y={camY - 10} width={5} height={5} rx={1}
        fill="none" stroke={st(0.28)} strokeWidth={0.75} />

      {/* ─── Labels ─── */}

      {/* KEY label */}
      <text x={keyLabelX} y={kY + (compact ? 4 : 5)} textAnchor={keyLabelSide}
        fill={st(0.55)} fontSize={compact ? 7 : 8} fontWeight="700" letterSpacing="0.8"
        fontFamily="Inter, system-ui, sans-serif">KEY</text>

      {/* CAM label */}
      <text x={subX} y={camY + (compact ? 11 : 14)} textAnchor="middle"
        fill={st(0.30)} fontSize={compact ? 7 : 8} fontWeight="600" letterSpacing="0.5"
        fontFamily="Inter, system-ui, sans-serif">CAM</text>

      {/* Camera height annotation — derived from analysis */}
      {!compact && camHeightLabel && (
        <text x={subX} y={camY + 23} textAnchor="middle"
          fill={st(0.45)} fontSize={6.5} fontWeight="500" letterSpacing="0.4"
          fontFamily="Inter, system-ui, sans-serif">{camHeightLabel}</text>
      )}

      {/* Angle readout is now merged into the SHADOW label above so the
          two never stack on top of each other. */}

      {/* ─── Full-mode annotations ─── */}
      {!compact && (
        <>
          {/* Clock position label */}
          {clockPos && (
            <text
              x={keyLabelX} y={kY + 18} textAnchor={keyLabelSide}
              fill={st(0.40)} fontSize={7} fontWeight="500"
              fontFamily="Inter, system-ui, sans-serif"
            >{clockPos}</text>
          )}

          {/* Modifier label below key */}
          {modLabel && (
            <text
              x={keyLabelX} y={kY + 28} textAnchor={keyLabelSide}
              fill={st(0.30)} fontSize={6.5} fontWeight="500"
              fontFamily="Inter, system-ui, sans-serif"
            >{modLabel}</text>
          )}

          {/* Distance annotation — dashed line along the margin OPPOSITE
              the key light, so the modifier label and distance never overlap. */}
          {mod?.distRange && (() => {
            const keyOnLeft = kX < subX;
            const distX = keyOnLeft ? W - 20 : 20;
            const topY = subY;
            const botY = camY - 8;
            const midY = (topY + botY) / 2;
            return (
              <>
                <line x1={distX} y1={topY + 10} x2={distX} y2={midY - 8}
                  stroke={st(0.18)} strokeWidth={0.75} strokeDasharray="2,2" />
                <line x1={distX} y1={midY + 8} x2={distX} y2={botY - 4}
                  stroke={st(0.18)} strokeWidth={0.75} strokeDasharray="2,2" />
                {/* Arrowheads */}
                <polygon
                  points={`${distX},${topY + 6} ${distX - 3},${topY + 12} ${distX + 3},${topY + 12}`}
                  fill={st(0.22)} />
                <polygon
                  points={`${distX},${botY - 2} ${distX - 3},${botY - 8} ${distX + 3},${botY - 8}`}
                  fill={st(0.22)} />
                {/* Distance text */}
                <text x={distX} y={midY + 3} textAnchor="middle"
                  fill={st(0.40)} fontSize={7} fontWeight="600"
                  fontFamily="Inter, system-ui, sans-serif"
                >{mod.distRange}</text>
              </>
            );
          })()}

          {/* Subject label */}
          <text x={subX} y={subY + subR + 14} textAnchor="middle"
            fill={st(0.30)} fontSize={7} fontWeight="500" letterSpacing="0.3"
            fontFamily="Inter, system-ui, sans-serif">Subject</text>
        </>
      )}
    </svg>
  );
}
