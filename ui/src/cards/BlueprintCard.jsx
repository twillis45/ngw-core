/**
 * BlueprintCard — Phase 2, primary gated output.
 *
 * Renders a photographer-ready lighting blueprint from existing shoot-match
 * result data (result.setup.lights + result.lightingIntelligence).
 * No extra API call — reuses data already in result.
 *
 * Full version shown to paid users. Free users see the PaywallGate preview.
 */

import CardIcon from '../components/CardIcon';
import { getRoleColor } from '../lib/lightRoleColors';
import useSettings from '../hooks/useSettings';
import { powerHint } from '../transform';
import { wbTempClass } from '../utils/units';
import HelpTip from '../components/HelpTip';
import WBSpectrum from '../components/WBSpectrum';

const LIGHT_FIELD_TIPS = {
  Modifier: 'The shaping device on the light. Larger modifiers (octabox, large softbox) produce softer shadows. Smaller/harder modifiers (grid, snoot) produce crisp shadows and tight control.',
  Position: 'Camera-relative placement — left, right, above, behind. Determines shadow direction on the subject\'s face.',
  Distance: 'Light-to-subject distance. Closer = softer shadows + faster falloff (subject brighter than background). Farther = harder shadows + more even exposure across the frame.',
  Power:    'Output level relative to the key light. Key is always set first. Fill is 1–2 stops below key for natural contrast. Rim starts 0.5 stops below key.',
};

const CAMERA_FIELD_TIPS = {
  Aperture: 'Controls depth of field and flash exposure. f/8–f/11 keeps the whole face sharp. Wider apertures (f/2.8) blur the background but reduce flash sync headroom.',
  ISO:      'Sensor sensitivity. Lower ISO = cleaner image. Flash setups typically use ISO 100–200. Higher ISO may be needed outdoors or when mixing with ambient light.',
  Shutter:  'Controls ambient light bleed. Flash sync limit is typically 1/200s. Slower shutter = more ambient; faster = darker background (HSS required above sync speed).',
  WB:       'White balance. Flash is typically 5500–5600K (Daylight). Match your WB to the dominant light source to avoid colour casts between shadows and highlights.',
};

const SHOP_ICON = (
  <svg className="shop-link__icon" width="10" height="10" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
    <polyline points="15 3 21 3 21 9"/>
    <line x1="10" y1="14" x2="21" y2="3"/>
  </svg>
);

function getBHUrl(query) {
  return `https://www.bhphotovideo.com/c/search?q=${encodeURIComponent(query)}`;
}

const ROLE_LABELS = {
  key: 'Key Light',
  fill: 'Fill Light',
  rim: 'Rim / Hair Light',
  background: 'Background Light',
  accent: 'Accent',
  hair: 'Hair Light',
};

// SVG icons per role — consistent with diagram legend shapes
const ROLE_ICONS = {
  key:        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  fill:       <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 010 20z" fill="currentColor"/></svg>,
  rim:        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>,
  background: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>,
  hair:       <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10c1.38 0 2.5-1.12 2.5-2.5S13.38 17 12 17H9.5C8.12 17 7 15.88 7 14.5S8.12 12 9.5 12H12c3.59 0 6.5-2.91 6.5-6.5S15.59.5 12 2z"/></svg>,
  accent:     <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
};

function PowerBar({ ratio }) {
  const pct = Math.min(100, Math.round((ratio ?? 1.0) * 100));
  return (
    <div className="blueprint-power-bar">
      <div className="blueprint-power-bar__fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

const PASSIVE_FILL_MODIFIERS = ['reflector', 'reflector panel', 'mirror', 'foam core', 'whiteboard', 'silver panel', 'white panel', 'v-flat'];
function isPassiveFill(role, modifier) {
  if (role !== 'fill') return false;
  const lower = (modifier || '').toLowerCase();
  return PASSIVE_FILL_MODIFIERS.some(p => lower.includes(p));
}

function LightRow({ light, index, isAssistant }) {
  const { powerDisplay } = useSettings();
  const role = (light.role || 'key').toLowerCase();
  const label = ROLE_LABELS[role] || light.label || light.role;
  const icon = ROLE_ICONS[role] || ROLE_ICONS.key;
  const roleColor = getRoleColor(role);
  const position = light.positionText || '';
  const modifier = light.modifier || '';
  const modSize = light.modifierSize ? ` (${light.modifierSize})` : '';
  const distance = light.distanceFt || '';
  // Re-compute power hint reactively from settings; fall back to baked value
  const power = light._role
    ? powerHint(light._role, light._lightingPattern, powerDisplay, light.meterReading)
    : (light.powerHint || '');

  // Fill lights: always show strobe + softbox as primary; reflector is the alternative note
  const fillIsPassive = isPassiveFill(role, modifier);

  // Bare/unknown modifier tokens — engine returns these when no modifier was detected
  const BARE_TOKENS = ['bare', 'bare_bulb', 'bare bulb', 'direct', 'none', 'unknown', 'modifier not detected', ''];
  const isBareModifier = BARE_TOKENS.includes(modifier.toLowerCase().trim());

  // Background lights almost always use a standard reflector for even backdrop coverage.
  // "bare bulb" from the engine just means no specific modifier was detected — default to
  // Standard Reflector rather than showing a misleading or empty value.
  const backgroundDefault = (role === 'background' && isBareModifier) ? 'Standard Reflector' : null;

  // Rim and hair lights are legitimately used bare for tight specular separation —
  // suppress the modifier row rather than show a misleading label.
  const suppressModifier = (role === 'rim' || role === 'hair') && isBareModifier;

  const displayModifier = suppressModifier
    ? ''
    : backgroundDefault ?? (fillIsPassive ? 'Strobe + Softbox' : (modifier || ''));
  const fillAltNote = role === 'fill'
    ? 'Alternative: 5-in-1 Reflector 43–48" (silver/white panel) — no strobe needed'
    : null;

  return (
    <div className={`blueprint-light blueprint-light--${role}`}>
      <div className="blueprint-light__header" style={{ '--role-color': roleColor }}>
        <span className="blueprint-light__icon">{icon}</span>
        <span className="blueprint-light__label">{label}</span>
        {index === 0 && <span className="blueprint-light__primary-badge">Primary</span>}
      </div>

      <div className="blueprint-light__details">
        {displayModifier && (
          <div className="blueprint-light__row">
            <span className="blueprint-light__key">
              Modifier
              <HelpTip text={LIGHT_FIELD_TIPS.Modifier} />
            </span>
            <span className="blueprint-light__val">
              <a
                href={getBHUrl(`${displayModifier}${modSize ? ' ' + modSize : ''}`)}
                target="_blank"
                rel="noopener noreferrer"
                className="blueprint-shop-link"
                title="Search B&H Photo"
              >
                {displayModifier}{fillIsPassive ? '' : modSize}
                {SHOP_ICON}
              </a>
            </span>
          </div>
        )}
        {position && (
          <div className="blueprint-light__row">
            <span className="blueprint-light__key">
              Position
              <HelpTip text={LIGHT_FIELD_TIPS.Position} />
            </span>
            <span className="blueprint-light__val">{position}</span>
          </div>
        )}
        {distance && (
          <div className="blueprint-light__row">
            <span className="blueprint-light__key">
              Distance
              <HelpTip text={LIGHT_FIELD_TIPS.Distance} />
            </span>
            <span className="blueprint-light__val">{distance}</span>
          </div>
        )}
        {power && (
          <div className="blueprint-light__row">
            <span className="blueprint-light__key">
              Power
              <HelpTip text={LIGHT_FIELD_TIPS.Power} />
            </span>
            <span className="blueprint-light__val">{power}</span>
          </div>
        )}
      </div>

      {!isAssistant && light.notes && light.notes.length > 0 && (
        <div className="blueprint-light__note">{light.notes[0]}</div>
      )}
      {!isAssistant && fillAltNote && (
        <div className="blueprint-light__alt-note">{fillAltNote}</div>
      )}
    </div>
  );
}

export default function BlueprintCard({ lights, lightingIntelligence, cameraSettings, lightType, lightTypeNote, mode, twoHostSetup }) {
  if (!lights || lights.length === 0) return null;

  const cam = cameraSettings;
  const li = lightingIntelligence;
  const isAssistant = mode === 'assistant';

  return (
    <div className="result-card blueprint-card">
      <div className="result-card__header">
        <CardIcon name="light" />
        <span>Lighting Blueprint</span>
        <span className="blueprint-card__badge">Paid</span>
      </div>

      {!isAssistant && twoHostSetup && (
        <div className="blueprint-two-host-note">
          <strong>2-Host Crossed Key</strong> — each light is the other host's fill. Match outputs exactly or one host reads overlit.
        </div>
      )}
      {!isAssistant && !twoHostSetup && (
        <p className="blueprint-card__intro">
          Positions, modifiers, and power ratios — designed for repeatable results.
        </p>
      )}

      {/* Light stack */}
      <div className="blueprint-lights">
        {lights.map((light, i) => (
          <LightRow key={i} light={light} index={i} isAssistant={isAssistant} />
        ))}
      </div>

      {/* Camera settings inline */}
      {cam && (
        <div className="blueprint-camera">
          <div className="blueprint-camera__header">Camera Settings</div>
          <div className="blueprint-camera__grid">
            {cam.aperture && (
              <div className="blueprint-camera__item">
                <span className="blueprint-camera__key">
                  Aperture
                  <HelpTip text={CAMERA_FIELD_TIPS.Aperture} side="below" />
                </span>
                <span className="blueprint-camera__val">{cam.aperture}</span>
              </div>
            )}
            {cam.iso && (
              <div className="blueprint-camera__item">
                <span className="blueprint-camera__key">
                  ISO
                  <HelpTip text={CAMERA_FIELD_TIPS.ISO} side="below" />
                </span>
                <span className="blueprint-camera__val">{cam.iso}</span>
              </div>
            )}
            {cam.shutter && (
              <div className="blueprint-camera__item">
                <span className="blueprint-camera__key">
                  Shutter
                  <HelpTip text={CAMERA_FIELD_TIPS.Shutter} side="below" />
                </span>
                <span className="blueprint-camera__val">{cam.shutter}</span>
              </div>
            )}
            {cam.wb && (
              <div className="blueprint-camera__item">
                <span className="blueprint-camera__key">
                  WB
                  <HelpTip text={CAMERA_FIELD_TIPS.WB} side="below" />
                </span>
                <span className={`blueprint-camera__val ${wbTempClass(cam.wb)}`}>{cam.wb}</span>
                <WBSpectrum wb={cam.wb} />
              </div>
            )}
          </div>
          {li?.detectedCCT && (
            <div className={`blueprint-camera__cct ${wbTempClass(String(li.detectedCCT))}`}>
              Detected colour temp: <strong>{li.detectedCCT} K</strong>
            </div>
          )}
        </div>
      )}

      {/* Background / subject notes — suppressed in assistant mode (data only) */}
      {!isAssistant && li?.fillMethod && (
        <div className="blueprint-note">
          <span className="blueprint-note__label">Fill method:</span> {li.fillMethod}
        </div>
      )}

      {/* Light type note — shown when recipe has a strong strobe or continuous preference */}
      {!isAssistant && lightTypeNote && (
        <div className={`blueprint-light-type-note blueprint-light-type-note--${lightType || 'both'}`}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            {lightType === 'continuous'
              ? <><rect x="2" y="7" width="20" height="15" rx="2"/><polyline points="17 2 12 7 7 2"/></>
              : <><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></>
            }
          </svg>
          <span>{lightTypeNote}</span>
        </div>
      )}
    </div>
  );
}
