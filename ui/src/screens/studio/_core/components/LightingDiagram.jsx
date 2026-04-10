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
  // Detected components from the engine's lighting_read pass — drives the
  // muted secondary fill/rim markers below.  `presence` is one of:
  //   subtle | soft | moderate | medium | strong | heavy | dominant
  // We translate that into an opacity so a "subtle" fill reads as a ghost
  // marker and a "dominant" fill is nearly as solid as the key.
  const components = result.sections?.shadowComponents || {};

  const keySide      = li.key_side || 'left';
  const keyElevation = li.key_elevation || 'medium';
  // ⚠ Convention conversion — engine bug compensation.
  // The engine's `nose_shadow_angle_deg` is *usually* the centroid-derived
  // angle (vision_passes.py line 2962), measured as
  //   0° = shadow centroid BELOW nose, 90° = right, 180° = above, 270° = left.
  // The diagram below assumes the canonical shadow_pass convention:
  //   0° = up (back of head), 90° = right, 180° = down (toward camera), 270° = left.
  // The two are 180° apart, so a loop standard with the shadow correctly
  // falling lower-right of the nose was rendering as upper-left (e.g. the
  // 310° reading the user flagged).  We add 180° to map centroid → diagram.
  // If the engine ever standardizes to shadow_pass convention this single
  // line is the only place to revert.
  const _rawShadowDeg = sd.nose_shadow_angle_deg ?? sd.signals?.nose_shadow_angle_deg ?? null;
  const shadowDeg    = _rawShadowDeg != null ? ((_rawShadowDeg + 180) % 360) : null;

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

  // Shadow direction — derived from the RENDERED key position so it always
  // makes physical sense.  The cast shadow falls in the opposite direction
  // from the key (in pixel space) and we bias it slightly toward the camera
  // (down) so it reads as a face-cast shadow rather than a back-cast.
  //
  // We deliberately ignore engine `nose_shadow_angle_deg` here because the
  // engine emits two competing conventions (centroid vs shadow_pass) that
  // collide for many setups; trusting the visual key direction makes the
  // diagram self-consistent regardless of which convention the engine used.
  const noseTipX = subX;
  const noseTipY = subY + subR + 4;
  // Vector pointing FROM key TO nose (i.e. light-travel direction).
  let shVecX = noseTipX - kX;
  let shVecY = noseTipY - kY;
  let shMag  = Math.hypot(shVecX, shVecY) || 1;
  shVecX /= shMag;
  shVecY /= shMag;
  // Camera-side bias — shadow always falls a bit toward the lens so the
  // arrow reads as "where you'll see the chin shadow on the photo".
  shVecY += 0.55;
  shMag = Math.hypot(shVecX, shVecY) || 1;
  shVecX /= shMag;
  shVecY /= shMag;
  // Convert vector → degrees in the local "0°=up, 90°=right" convention so
  // the SHADOW xx° readout below stays meaningful.
  const sDeg = ((Math.atan2(shVecX, -shVecY) * 180) / Math.PI + 360) % 360;
  const sRad = (sDeg * Math.PI) / 180;
  const sLen = compact ? 22 : 30;
  const sTipX = noseTipX + sLen * shVecX;
  const sTipY = noseTipY + sLen * shVecY;

  // Shadow arrowhead — built from the same unit vector so it always points
  // along the shadow line.
  const aLen = compact ? 4 : 5;
  const aWidth = compact ? 2.5 : 3;
  // Perpendicular unit vector for the arrowhead base.
  const perpX = -shVecY;
  const perpY =  shVecX;
  const arrX = sTipX + aLen * shVecX;
  const arrY = sTipY + aLen * shVecY;
  const arrowPts = [
    `${arrX},${arrY}`,
    `${sTipX - aWidth * perpX},${sTipY - aWidth * perpY}`,
    `${sTipX + aWidth * perpX},${sTipY + aWidth * perpY}`,
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
  const st = (a) => `rgba(132, 158, 184,${Math.min(1, Math.max(0.42, a + 0.18))})`;

  // Modifier label for full mode
  const modLabel = mod ? `${mod.sizeLabel ? mod.sizeLabel + ' ' : ''}${mod.family || ''}`.trim() : null;

  // ─── Secondary lights (fill / rim / background) ───────────────────────────
  // The engine's lighting_read pass surfaces presence strings for fill and
  // rim; we render them as muted markers in canonical positions so the user
  // can SEE that the engine detected them, without claiming a measured angle
  // we don't actually have.
  // Threshold gate: ONLY render fill/rim markers when the engine reports a
  // moderate-or-stronger presence.  The engine's lighting_read pass is happy
  // to call any faint ambient bounce "subtle fill" — that's noise on a true
  // single-light setup like a loop-standard test image, and the user
  // shouldn't see a FILL marker materialize on a one-strobe portrait.  Faint
  // presences are still surfaced in the LIGHT COMPONENTS chip drawer for
  // engineering transparency, just not on the diagram itself.
  const presenceAlpha = (p) => {
    const v = String(p || '').toLowerCase();
    if (!v || v === 'none' || v === 'unknown' || v === 'subtle' || v === 'soft' || v === 'light') return 0;
    if (v === 'dominant' || v === 'strong' || v === 'heavy') return 0.85;
    if (v === 'moderate' || v === 'medium') return 0.62;
    return 0;
  };

  const FILL_COLOR = 'rgba(130,170,220,1)';   // accent / cool — visually distinct from key amber
  const RIM_COLOR  = 'rgba(180,205,235,1)';   // pale steel — reads as edge separation
  const BG_COLOR   = 'rgba(140,225,180,1)';   // soft green — matches success palette

  // FILL — mirror of key across the subject's vertical axis, pulled slightly
  // toward the camera (lower in the canvas) so it reads as front-fill rather
  // than as a second key.
  const fillAlpha = presenceAlpha(components.fill);
  const fillX = subX - (kX - subX) * 0.85;
  const fillY = subY + Math.abs(kY - subY) * 0.55 + (compact ? 18 : 24);

  // RIM — behind the subject (above the head in top-down view), opposite the
  // key side so it reads as a back-rim hairlight.
  const rimAlpha = presenceAlpha(components.rim);
  const rimX = subX - (kX - subX) * 0.55;
  const rimY = subY - subR - (compact ? 14 : 20);

  // BACKGROUND — only when the engine reports a non-trivial background light
  // (not just a BG color cast).  We piggyback off the existing fill/rim
  // detection: if the lighting_inference has a `background_light_present`
  // signal we use it; otherwise we leave the marker off so the diagram
  // doesn't fabricate a light that isn't there.
  const bgAlpha = li.background_light_present || li.bg_light_present
    ? 0.55
    : 0;

  // ─── Elevation warning ─────────────────────────────────────────────────────
  // The engine emits `key_elevation` as a coarse high|medium|low bucket.
  // Extreme elevation buckets are common artistic choices but they're also
  // the dominant cause of unflattering shadows for portraits, so we flag
  // them with a small ⚠ glyph next to the KEY marker.  Medium = no warning.
  const elevationWarn = (keyElevation === 'high' || keyElevation === 'low')
    ? (keyElevation === 'high'
        ? 'Key is high — expect deep eye sockets and a harsh nose shadow.'
        : 'Key is low — expect uplit "horror" shadows under the brow and chin.')
    : null;

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

      {/* ─── Secondary lights (rendered BEFORE the key so the key sits on top
              of any visual overlap, and BEFORE the subject so the subject head
              still occludes them at canvas center). ─── */}
      {fillAlpha > 0 && (
        <g opacity={fillAlpha}>
          {/* faint glow disc + ring + dot, scaled smaller than key */}
          <circle cx={fillX} cy={fillY} r={compact ? 5.5 : 7}
            fill="none" stroke={FILL_COLOR} strokeWidth={1} strokeDasharray="2,1.5" />
          <circle cx={fillX} cy={fillY} r={compact ? 1.8 : 2.4} fill={FILL_COLOR} />
          <text x={fillX} y={fillY + (compact ? 12 : 14)} textAnchor="middle"
            fill={FILL_COLOR} fontSize={compact ? 5.5 : 6.5} fontWeight="700"
            letterSpacing="0.6" fontFamily="Inter, system-ui, sans-serif"
            opacity={0.85}
          >FILL</text>
        </g>
      )}
      {rimAlpha > 0 && (
        <g opacity={rimAlpha}>
          <circle cx={rimX} cy={rimY} r={compact ? 5 : 6.5}
            fill="none" stroke={RIM_COLOR} strokeWidth={1} strokeDasharray="2,1.5" />
          <circle cx={rimX} cy={rimY} r={compact ? 1.6 : 2.2} fill={RIM_COLOR} />
          <text x={rimX} y={rimY - (compact ? 7 : 9)} textAnchor="middle"
            fill={RIM_COLOR} fontSize={compact ? 5.5 : 6.5} fontWeight="700"
            letterSpacing="0.6" fontFamily="Inter, system-ui, sans-serif"
            opacity={0.9}
          >RIM</text>
        </g>
      )}
      {bgAlpha > 0 && (
        <g opacity={bgAlpha}>
          <circle cx={subX + (compact ? 26 : 32)} cy={bgY + (compact ? 12 : 16)}
            r={compact ? 4 : 5}
            fill="none" stroke={BG_COLOR} strokeWidth={1} strokeDasharray="2,1.5" />
          <circle cx={subX + (compact ? 26 : 32)} cy={bgY + (compact ? 12 : 16)}
            r={compact ? 1.4 : 1.8} fill={BG_COLOR} />
          <text x={subX + (compact ? 26 : 32)} y={bgY + (compact ? 23 : 28)}
            textAnchor="middle"
            fill={BG_COLOR} fontSize={compact ? 5.5 : 6.5} fontWeight="700"
            letterSpacing="0.6" fontFamily="Inter, system-ui, sans-serif"
            opacity={0.9}
          >BG LIGHT</text>
        </g>
      )}

      {/* Key light marker — outer ring + center dot */}
      <circle cx={kX} cy={kY} r={compact ? 7 : 9}
        fill="none" stroke={KEY_COLOR} strokeWidth={1.5} />
      <circle cx={kX} cy={kY} r={compact ? 2.5 : 3.5}
        fill={KEY_COLOR} />

      {/* Elevation warning glyph — sits on the upper-right of the KEY marker,
          tooltip via <title> so the user can hover for the explanation. */}
      {elevationWarn && (
        <g>
          <circle cx={kX + (compact ? 6 : 8)} cy={kY - (compact ? 6 : 8)}
            r={compact ? 4 : 5}
            fill="rgba(245,190,72,0.18)"
            stroke="rgba(245,190,72,0.95)" strokeWidth={1}
          />
          <text x={kX + (compact ? 6 : 8)} y={kY - (compact ? 4 : 5)}
            textAnchor="middle"
            fill="rgba(245,190,72,1)" fontSize={compact ? 6 : 7} fontWeight="900"
            fontFamily="Inter, system-ui, sans-serif"
          >!
            <title>{elevationWarn}</title>
          </text>
        </g>
      )}

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
