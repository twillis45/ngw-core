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
const KEY_BEAM       = 'rgba(200,159,69,0.22)';  // warm amber cone — must read on dark bg
const SHADOW_COLOR   = steel(0.55);              // lifted from 0.45 — shadow direction is primary signal

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
  const s = String(side).toLowerCase();
  const base = s.includes('right') ? 45 : s.includes('center') || s === 'on_axis' ? 0 : s.includes('left') ? -45 : 0;
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

  // Reconstruction-derived signals (preferred when available — these come
  // straight from the engine's pose-corrected estimate).
  const recon       = raw.reconstruction || {};

  // Elevation: reconstruction pass is authoritative; li.key_elevation is a fallback
  const keyElevation = recon.key_light_height || li.key_elevation || 'medium';
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
    // Engine convention: 0°=behind subject, 90°=side, 180°=camera-facing.
    // Diagram convention (math): 0°=directly below (camera-side), ±90°=side,
    // 180°=directly above (background-side).
    // Mapping: diagram = 180 - engine, so camera-facing (180°) → 0° (below),
    // side (90°) → 90° (side), behind (0°) → 180° (above).
    // This ensures Rembrandt/Loop keys (engine ~120-150°) render in the
    // camera-side zone where they physically illuminate the face.
    const _ks = String(keySide).toLowerCase();
    const sign = _ks.includes('right')
      ? 1
      : _ks.includes('left')
        ? -1
        : (shadowDeg != null && shadowDeg > 180 ? -1 : 1);
    kAngleDeg = sign * (180 - reconKeyDeg);
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
  const W = compact ? 240 : 300;
  const H = compact ? 165 : 220;

  // Subject center — pulled up to leave room for the camera at the bottom
  // and the BG strip at the top.  Larger subR fills more of the canvas.
  const subX = W / 2;
  const subY = compact ? 68 : 90;
  const subR = compact ? 26 : 28;  // larger head — more readable at fluid scale

  // Camera — at the bottom of the canvas, looking UP at the subject (top-down
  // POV: camera is "in front of" the subject's face).
  const camY = H - (compact ? 16 : 22);

  // Background indicator — behind the subject (top of canvas).
  const bgY  = compact ? 12 : 16;

  // Key light position — farther from subject so the beam has real sweep.
  const kDist = compact ? 82 : 88;
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
  const sLen = compact ? 28 : 36;
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
  const beamSpread = compact ? 20 : 26;
  const beamPerp = kRad + Math.PI / 2;
  const bX = subX + subR * Math.sin(kRad);
  const bY = subY + subR * Math.cos(kRad);
  const beamPts = [
    `${kX},${kY}`,
    `${bX + beamSpread * Math.sin(beamPerp)},${bY - beamSpread * Math.cos(beamPerp)}`,
    `${bX - beamSpread * Math.sin(beamPerp)},${bY + beamSpread * Math.cos(beamPerp)}`,
  ].join(' ');

  // Sun rays around key light
  const innerR = compact ? 10 : 13;
  const outerR = compact ? 16 : 22;
  const rays = [0, 45, 90, 135, 180, 225, 270, 315].map(deg => {
    const r = (deg * Math.PI) / 180;
    return {
      x1: kX + innerR * Math.sin(r), y1: kY - innerR * Math.cos(r),
      x2: kX + outerR * Math.sin(r), y2: kY - outerR * Math.cos(r),
    };
  });

  // Label positioning
  const keyLabelSide = kX > subX + 6 ? 'start' : 'end';
  const keyLabelX    = kX > subX + 6 ? kX + (compact ? 18 : 24) : kX - (compact ? 18 : 24);

  // Steel alias — every alpha is bumped by ~0.18 with a floor at 0.42 so
  // the diagram reads on bright displays. The original dim 0.15–0.30 stops
  // disappeared on calibrated monitors; lifting them keeps the matte
  // hierarchy intact while making every glyph legible.
  const st = (a) => `rgba(132, 158, 184,${Math.min(1, Math.max(0.42, a + 0.18))})`;

  // Modifier label for full mode
  const modLabel = mod ? `${mod.sizeLabel ? mod.sizeLabel + ' ' : ''}${mod.family || ''}`.trim() : null;

  // Unique gradient ID suffix — prevents collision when compact + expanded diagrams
  // appear on the same page simultaneously (ResultScreen inline + fullscreen modal).
  const sfx = compact ? 'c' : 'f';

  // Lit-side bearing — direction from subject center toward key light.
  // Used for the head glow gradient and is pre-computed here so both the
  // defs block and the arc section can reference the same value.
  const litAngle = Math.atan2(kX - subX, -(kY - subY));

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

  const FILL_COLOR     = 'rgba(130,170,220,1)';   // accent / cool — additive fill
  const NEG_FILL_COLOR = 'rgba(180,130,100,1)';   // warm muted — absorber/flag (subtractive)
  const RIM_COLOR  = 'rgba(180,205,235,1)';   // pale steel — reads as edge separation
  const BG_COLOR   = 'rgba(140,225,180,1)';   // soft green — matches success palette

  // FILL — gated on reconstruction.fill_present so we don't fabricate a fill
  // marker from the shallow shadowComponents pass alone.  The reconstruction
  // pass is authoritative; shadowComponents is a lower-fidelity hint.
  // fill_present === true  → show marker
  // fill_present === false → suppress entirely (engine says no fill)
  // fill_present === null  → only show if shadowComponents says strong/dominant
  //                          (moderate alone is ambient noise on single-light setups)
  // negative_fill === true → show NEG FILL marker with absorber styling
  const reconFillPresent = recon.fill_present;   // true | false | null
  const isNegFill = recon.negative_fill === true;
  const fillAlpha = (() => {
    if (reconFillPresent === false) return 0;
    if (reconFillPresent === true) return presenceAlpha(components.fill) || 0.62;
    // null: only render on strong/dominant signal, not moderate (avoids ambient noise)
    const p = String(components.fill || '').toLowerCase();
    if (p === 'dominant' || p === 'strong' || p === 'heavy') return 0.72;
    return 0;
  })();
  const fillX = subX - (kX - subX) * 0.80;
  // Fill sits in the camera-adjacent zone (physically correct — fill sources
  // are near the lens axis). This keeps it well below the shadow arrow which
  // always points into the subject/camera zone from the upper half.
  const fillY = camY - (compact ? 36 : 48);

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

  // Elevation is communicated by the HIGH/MED/LOW label in the key stack.
  // A previous iteration added a ⚠ warning glyph for high/low elevation,
  // but high key IS Rembrandt/butterfly and low key IS intentional dramatic —
  // flagging these as warnings contradicts the pattern identification and
  // patronizes working photographers.  Removed.

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
      {/* ─── SVG gradient defs ─────────────────────────────────────────────
          All gradients use userSpaceOnUse so they reference the same pixel
          coordinates as the geometry computed above — no bounding-box math. */}
      <defs>
        {/* Beam cone: amber bloom at key source → fully transparent at subject.
            Replaces the flat KEY_BEAM fill so the cone reads as real photon
            travel rather than a painted shape. */}
        <linearGradient id={`beamGrad_${sfx}`}
          x1={kX} y1={kY} x2={bX} y2={bY} gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor={KEY_COLOR} stopOpacity="0.52" />
          <stop offset="100%" stopColor={KEY_COLOR} stopOpacity="0" />
        </linearGradient>
        {/* Subject head lit-side glow: warm wash on the hemisphere facing
            the key — makes lit vs shadow instantly legible without text. */}
        <radialGradient id={`headLitGrad_${sfx}`}
          cx={subX + subR * 0.55 * Math.sin(litAngle)}
          cy={subY - subR * 0.55 * Math.cos(litAngle)}
          r={subR * 1.15}
          gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor={KEY_COLOR} stopOpacity="0.34" />
          <stop offset="100%" stopColor={KEY_COLOR} stopOpacity="0" />
        </radialGradient>
        {/* Modifier emission: soft white bloom at the center of the modifier
            shape so it reads as a practical light source, not just a symbol. */}
        <radialGradient id={`modEmit_${sfx}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="rgba(255,248,220,1)" stopOpacity="0.60" />
          <stop offset="100%" stopColor="rgba(255,248,220,1)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Background indicator — rendered in both modes so the top-down
          scene reads as subject-between-background-and-camera.  Width is
          a canvas-relative constant so it visually anchors the top edge. */}
      {(() => {
        const bgHalf = compact ? 70 : 60;
        const bgH    = compact ? 8  : 10;
        const fontSz = compact ? 6  : 7;
        const bgDist = recon.background_distance_ft ?? sd.background_distance_ft;
        const bgDistLabel = bgDist != null ? `${bgDist} ft` : null;
        return (
          <>
            <rect
              x={subX - bgHalf} y={bgY - bgH / 2} width={bgHalf * 2} height={bgH} rx={3}
              fill="none" stroke={st(0.22)} strokeWidth={0.75}
            />
            <text x={subX} y={bgY + 2.5} textAnchor="middle"
              fill={st(0.38)} fontSize={fontSz} fontWeight="600" letterSpacing="0.8"
              fontFamily="Inter, system-ui, sans-serif">BG</text>
            {bgDistLabel && (
              <text x={subX + bgHalf - 4} y={bgY + 2.5} textAnchor="end"
                fill={st(0.32)} fontSize={compact ? 5.5 : 6.5} fontWeight="500" letterSpacing="0.3"
                fontFamily="Inter, system-ui, sans-serif">{bgDistLabel}</text>
            )}
          </>
        );
      })()}

      {/* Camera → subject axis (dashed) — lifted opacity so the compositional
          axis reads at all viewport scales without competing with the beam. */}
      <line
        x1={subX} y1={subY + subR + 2} x2={subX} y2={camY - (compact ? 7 : 10)}
        stroke={st(0.22)} strokeWidth={0.75} strokeDasharray="3,3"
      />

      {/* Light beam cone — gradient fill: bright amber source → transparent
          at subject surface so the cone reads as actual light travel. */}
      <polygon points={beamPts} fill={`url(#beamGrad_${sfx})`} />

      {/* Light beam center line — lifted opacity so the principal ray is
          clearly visible even when the beam cone is narrow. */}
      <line x1={kX} y1={kY} x2={bX} y2={bY}
        stroke="rgba(200,155,60,0.50)" strokeWidth={1.5} />

      {/* Shadow direction line — dashed, originates from the nose tip so it
          reads as a cast shadow rather than a nose / face-direction arrow.
          Bumped strokeWidth so the shadow has visual weight comparable to
          the beam at expanded scale. */}
      <line x1={noseTipX} y1={noseTipY} x2={sTipX} y2={sTipY}
        stroke={SHADOW_COLOR} strokeWidth={1.8} strokeLinecap="round"
        strokeDasharray="2.5,2" />
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
        // Shadow label — direction is visually conveyed by the arrow itself;
        // the angle number was adding noise and colliding with the FILL marker.
        const labelText = `SHADOW`;
        return (
          <text
            x={lx} y={ly} textAnchor={anchor}
            fill={st(0.42)} fontSize={compact ? 5.5 : 6} fontWeight="600"
            letterSpacing="0.4"
            fontFamily="Inter, system-ui, sans-serif"
          >{labelText}</text>
        );
      })()}

      {/* ─── Secondary lights (rendered BEFORE the key so the key sits on top
              of any visual overlap, and BEFORE the subject so the subject head
              still occludes them at canvas center). ─── */}
      {fillAlpha > 0 && (() => {
        const fc = isNegFill ? NEG_FILL_COLOR : FILL_COLOR;
        const fillLabel = isNegFill ? 'NEG FILL' : 'FILL';
        return (
          <g opacity={fillAlpha}>
            <circle cx={fillX} cy={fillY} r={compact ? 5.5 : 7}
              fill="none" stroke={fc} strokeWidth={1}
              strokeDasharray={isNegFill ? '1,1.5' : '2,1.5'} />
            <circle cx={fillX} cy={fillY} r={compact ? 1.8 : 2.4} fill={fc} />
            <text x={fillX} y={fillY + (compact ? 12 : 14)} textAnchor="middle"
              fill={fc} fontSize={compact ? 5.5 : 6.5} fontWeight="700"
              letterSpacing="0.6" fontFamily="Inter, system-ui, sans-serif"
              opacity={0.85}
            >{fillLabel}</text>
          </g>
        );
      })()}
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

      {/* Key light marker — modifier-shape-aware.
          Shapes represent the actual top-down footprint of each modifier:
          a softbox IS a rectangle from above, an octabox IS an octagon,
          a beauty dish IS a circle with a deflector plate.  Each shape is
          rotated via kToSubDeg so its emission face aims at the subject —
          physically correct for a floor-plan lighting diagram. */}
      {(() => {
        const mf = (mod?.family || '').toLowerCase();
        const isRect  = mf.includes('rect') || (mf.includes('soft') && !mf.includes('oct'));
        const isOct   = mf.includes('oct');
        const isBeauty = mf.includes('beauty');
        const isStrip = mf.includes('strip');
        const isRing  = mf.includes('ring');
        const isPara  = mf.includes('para') || mf.includes('umbr');

        // Angle from key → subject (for orienting the modifier face)
        const kToSubDeg = Math.atan2(subX - kX, -(subY - kY)) * 180 / Math.PI;

        // Ambient glow halo (always)
        const halo = (
          <circle cx={kX} cy={kY} r={compact ? 18 : 24}
            fill="rgba(200,155,60,0.06)" stroke="none" />
        );

        // Modifier shape — sized to read as a real physical object on the
        // floor plan, not just a dot.  Inner structure (baffles, deflectors,
        // grid lines) communicates modifier type at a glance.
        let modShape = null;
        if (isRect || isStrip) {
          const rW = compact ? (isStrip ? 6 : 24) : (isStrip ? 8 : 32);
          const rH = compact ? (isStrip ? 20 : 12) : (isStrip ? 28 : 16);
          // Inner baffle line — shows the diffusion panel inside the box
          const baffleOffset = rH * 0.30;
          modShape = (
            <g transform={`rotate(${kToSubDeg}, ${kX}, ${kY})`}>
              <rect x={kX - rW/2} y={kY - rH/2} width={rW} height={rH} rx={2}
                fill="rgba(200,155,60,0.16)" stroke={KEY_COLOR} strokeWidth={1.25} strokeOpacity={0.75} />
              {/* Inner diffusion baffle — the front face of the softbox */}
              <line x1={kX - rW/2 + 2} y1={kY - rH/2 + baffleOffset}
                    x2={kX + rW/2 - 2} y2={kY - rH/2 + baffleOffset}
                stroke={KEY_COLOR} strokeWidth={0.5} strokeOpacity={0.35} />
            </g>
          );
        } else if (isOct) {
          const or = compact ? 11 : 15;
          const pts = Array.from({length:8}, (_,i) => {
            const a = (i * 45 + kToSubDeg) * Math.PI / 180;
            return `${kX + or * Math.sin(a)},${kY - or * Math.cos(a)}`;
          }).join(' ');
          // Inner octagon — shows the recessed baffle
          const ir = or * 0.55;
          const innerPts = Array.from({length:8}, (_,i) => {
            const a = (i * 45 + kToSubDeg) * Math.PI / 180;
            return `${kX + ir * Math.sin(a)},${kY - ir * Math.cos(a)}`;
          }).join(' ');
          modShape = (
            <>
              <polygon points={pts} fill="rgba(200,155,60,0.16)"
                stroke={KEY_COLOR} strokeWidth={1.25} strokeOpacity={0.75} />
              <polygon points={innerPts} fill="none"
                stroke={KEY_COLOR} strokeWidth={0.5} strokeOpacity={0.25} />
            </>
          );
        } else if (isBeauty) {
          const outerR = compact ? 11 : 14;
          modShape = (
            <>
              <circle cx={kX} cy={kY} r={outerR}
                fill="rgba(200,155,60,0.16)" stroke={KEY_COLOR} strokeWidth={1.25} strokeOpacity={0.75} />
              {/* Deflector plate — the solid center disc that defines a
                  beauty dish vs. a regular reflector */}
              <circle cx={kX} cy={kY} r={outerR * 0.38}
                fill="rgba(10,10,13,0.85)" stroke={KEY_COLOR} strokeWidth={0.75} strokeOpacity={0.45} />
            </>
          );
        } else if (isRing) {
          const outerR = compact ? 12 : 16;
          modShape = (
            <>
              {/* Ring donut — thick stroke with hollow center, just like
                  the actual ring light looks from above */}
              <circle cx={kX} cy={kY} r={outerR}
                fill="none" stroke={KEY_COLOR} strokeWidth={compact ? 4 : 5} strokeOpacity={0.50} />
              <circle cx={kX} cy={kY} r={outerR}
                fill="none" stroke="rgba(255,248,220,0.20)" strokeWidth={compact ? 2 : 3} />
            </>
          );
        } else if (isPara) {
          // Parabolic / umbrella — deep bowl shape.  From top-down it reads
          // as a large circle with radial spokes (umbrella ribs).
          const outerR = compact ? 12 : 16;
          const spokeR = outerR * 0.85;
          modShape = (
            <>
              <circle cx={kX} cy={kY} r={outerR}
                fill="rgba(200,155,60,0.12)" stroke={KEY_COLOR} strokeWidth={1.25} strokeOpacity={0.65} />
              {/* Umbrella ribs — 8 spokes radiating from center */}
              {[0, 45, 90, 135].map(deg => {
                const a = (deg + kToSubDeg) * Math.PI / 180;
                return (
                  <line key={deg}
                    x1={kX - spokeR * Math.sin(a)} y1={kY + spokeR * Math.cos(a)}
                    x2={kX + spokeR * Math.sin(a)} y2={kY - spokeR * Math.cos(a)}
                    stroke={KEY_COLOR} strokeWidth={0.4} strokeOpacity={0.25} />
                );
              })}
            </>
          );
        } else {
          // Unknown modifier — generic strobe head with reflector bowl
          modShape = (
            <>
              <circle cx={kX} cy={kY} r={compact ? 10 : 13}
                fill="rgba(200,155,60,0.12)" stroke={KEY_COLOR} strokeWidth={1} strokeOpacity={0.5} />
              <circle cx={kX} cy={kY} r={compact ? 5 : 7}
                fill="none" stroke={KEY_COLOR} strokeWidth={1.25} strokeOpacity={0.60} />
            </>
          );
        }

        return (
          <>
            {halo}
            {modShape}
            {/* Emission bloom — soft white radial over the modifier center so
                every shape reads as a live light source, not a schematic icon. */}
            <circle cx={kX} cy={kY} r={compact ? 8 : 11} fill={`url(#modEmit_${sfx})`} />
            {/* Amber center dot — the bulb / flash tube */}
            <circle cx={kX} cy={kY} r={compact ? 2.5 : 3.5} fill={KEY_COLOR} />
            {/* Inner hot-spot — the brightest point mimics the actual
                emission center / bare bulb of a strobe or LED panel. */}
            <circle cx={kX} cy={kY} r={compact ? 1.1 : 1.5} fill="rgba(255,250,230,0.95)" />
          </>
        );
      })()}

      {/* Elevation warning glyph removed — see comment above. */}

      {/* Subject head */}
      <circle cx={subX} cy={subY} r={subR}
        fill="#0a0a0d" stroke={st(0.60)} strokeWidth={1.5} />
      {/* Lit-side warmth overlay — radial gradient wash from the key-facing
          hemisphere so the head reads as physically illuminated before the
          eye even reaches the arc indicators. */}
      <circle cx={subX} cy={subY} r={subR} fill={`url(#headLitGrad_${sfx})`} />
      {/* Lit/shadow side arcs — amber on key side, cool dark on shadow side.
          Dual-indicator lets a photographer read the face instantly. */}
      {(() => {
        const litAngle = Math.atan2(kX - subX, -(kY - subY));
        const r2 = subR + 0.5;
        const arcSpan = 1.05;
        // Lit arc
        const lx1 = subX + r2 * Math.sin(litAngle - arcSpan);
        const ly1 = subY - r2 * Math.cos(litAngle - arcSpan);
        const lx2 = subX + r2 * Math.sin(litAngle + arcSpan);
        const ly2 = subY - r2 * Math.cos(litAngle + arcSpan);
        // Shadow arc — opposite side
        const shAng = litAngle + Math.PI;
        const sx1 = subX + r2 * Math.sin(shAng - arcSpan);
        const sy1 = subY - r2 * Math.cos(shAng - arcSpan);
        const sx2 = subX + r2 * Math.sin(shAng + arcSpan);
        const sy2 = subY - r2 * Math.cos(shAng + arcSpan);
        return (
          <>
            {/* Shadow arc — cool steel blue, slightly wider stroke so it
                reads as "dark side" against the warm lit arc. */}
            <path d={`M ${sx1} ${sy1} A ${r2} ${r2} 0 0 1 ${sx2} ${sy2}`}
              fill="none" stroke="rgba(60,90,160,0.58)" strokeWidth={2.8} strokeLinecap="round" />
            {/* Lit arc — warm amber; placed on top of shadow arc so the
                bright side always wins visually. */}
            <path d={`M ${lx1} ${ly1} A ${r2} ${r2} 0 0 1 ${lx2} ${ly2}`}
              fill="none" stroke="rgba(200,155,60,0.85)" strokeWidth={2.8} strokeLinecap="round" />
          </>
        );
      })()}
      {/* Nose pointer — the single orientation anchor. A tapered triangle
          toward camera tells the photographer which way the face points.
          No eyes — the dual arcs and lit-side glow already communicate
          everything about where light falls. Less is more. */}
      <polygon
        points={`${subX - 3},${subY + subR - 5} ${subX + 3},${subY + subR - 5} ${subX},${subY + subR + 5}`}
        fill={st(0.55)}
      />

      {/* Camera icon — body + pentaprism + lens circle for recognition at
          both compact and fullscreen scales. */}
      <rect x={subX - 9} y={camY - 6} width={18} height={12} rx={2}
        fill="none" stroke={st(0.38)} strokeWidth={1} />
      <rect x={subX - 2.5} y={camY - 10} width={5} height={5} rx={1}
        fill="none" stroke={st(0.30)} strokeWidth={0.75} />
      {/* Lens — small circle on the camera body */}
      <circle cx={subX} cy={camY} r={compact ? 2.5 : 3}
        fill="none" stroke={st(0.30)} strokeWidth={0.75} />

      {/* ─── Labels ─── */}

      {/* KEY label */}
      <text x={keyLabelX} y={kY + (compact ? 4 : 5)} textAnchor={keyLabelSide}
        fill={st(0.55)} fontSize={compact ? 7 : 8} fontWeight="700" letterSpacing="0.8"
        fontFamily="Inter, system-ui, sans-serif">KEY</text>
      {reconKeyDeg != null && (
        <text x={keyLabelX} y={kY + (compact ? 13 : 15)} textAnchor={keyLabelSide}
          fill={st(0.40)} fontSize={compact ? 6 : 7} fontWeight="600" letterSpacing="0.3"
          fontFamily="Inter, system-ui, sans-serif">{Math.round(180 - reconKeyDeg)}°</text>
      )}
      {/* Elevation + distance labels — stacked below the angle readout */}
      {(() => {
        const elev = (keyElevation || '').toLowerCase();
        const isMed = elev === 'medium' || elev === 'mid' || !elev || elev === 'unknown';
        const showElev = !isMed || !compact; // compact suppresses MED, full always shows
        const elevLabel = elev === 'high' ? 'HIGH' : elev === 'low' ? 'LOW' : 'MED';
        const elevColor = elev === 'high' ? 'rgba(245,190,72,0.85)'
                        : elev === 'low'  ? 'rgba(120,170,220,0.80)'
                        : st(0.38);
        const angleRow = reconKeyDeg != null;
        let y = kY + (compact ? 4 : 5); // KEY row
        if (angleRow) y += compact ? 9 : 10;  // 58° row
        y += compact ? 9 : 10; // elevation row base
        const distLabel = mod?.distRange;
        return (
          <>
            {showElev && (
              <text x={keyLabelX} y={y} textAnchor={keyLabelSide}
                fill={elevColor} fontSize={compact ? 5.5 : 6.5} fontWeight="700" letterSpacing="0.5"
                fontFamily="Inter, system-ui, sans-serif">{elevLabel}</text>
            )}
            {compact && distLabel && (
              <text x={keyLabelX} y={y + (showElev ? (compact ? 9 : 10) : 0)} textAnchor={keyLabelSide}
                fill={st(0.38)} fontSize={compact ? 5.5 : 6.5} fontWeight="500" letterSpacing="0.3"
                fontFamily="Inter, system-ui, sans-serif">{distLabel}</text>
            )}
          </>
        );
      })()}

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
              x={keyLabelX} y={kY + 26} textAnchor={keyLabelSide}
              fill={st(0.40)} fontSize={7} fontWeight="500"
              fontFamily="Inter, system-ui, sans-serif"
            >{clockPos}</text>
          )}

          {/* Modifier label below key */}
          {modLabel && (
            <text
              x={keyLabelX} y={kY + 36} textAnchor={keyLabelSide}
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
                  stroke={st(0.28)} strokeWidth={0.75} strokeDasharray="2,2" />
                <line x1={distX} y1={midY + 8} x2={distX} y2={botY - 4}
                  stroke={st(0.28)} strokeWidth={0.75} strokeDasharray="2,2" />
                {/* Arrowheads */}
                <polygon
                  points={`${distX},${topY + 6} ${distX - 3},${topY + 12} ${distX + 3},${topY + 12}`}
                  fill={st(0.32)} />
                <polygon
                  points={`${distX},${botY - 2} ${distX - 3},${botY - 8} ${distX + 3},${botY - 8}`}
                  fill={st(0.32)} />
                {/* Distance text */}
                <text x={distX} y={midY + 3} textAnchor="middle"
                  fill={st(0.40)} fontSize={7} fontWeight="600"
                  fontFamily="Inter, system-ui, sans-serif"
                >{mod.distRange}</text>
              </>
            );
          })()}

          {/* Subject label removed — the head circle is self-explanatory to photographers */}
        </>
      )}
    </svg>
  );
}
