import CardIcon from '../components/CardIcon';
import useSettings from '../hooks/useSettings';
import { powerHint } from '../transform';

const BARE_TOKENS = new Set(['bare', 'bare_bulb', 'bare bulb', 'direct', 'none', 'unknown', 'modifier not detected', '']);
function cleanMod(mod) {
  if (!mod) return null;
  return BARE_TOKENS.has(mod.toLowerCase().trim()) ? null : mod;
}

function getBHUrl(query) {
  return `https://www.bhphotovideo.com/c/search?q=${encodeURIComponent(query)}`;
}

export default function ShootSetupCard({ lights }) {
  const { units, powerDisplay } = useSettings();
  if (!lights || lights.length === 0) return null;

  return (
    <div className="result-card">
      <div className="result-card__header">
        <CardIcon name="light" />
        <span>Shoot This Setup</span>
      </div>

      {lights.map((l, i) => {
        const dist = units === 'metric' ? l.distanceM : l.distanceFt;
        const rawMod = cleanMod(l.modifier);
        const modLabel = rawMod ? rawMod + (l.modifierSize ? ` (${l.modifierSize})` : '') : null;
        return (
          <div className="setup-light" key={i}>
            <div className="setup-light__head">
              <span className={`setup-light__role setup-light__role--${l.role}`}>
                {l.label}
              </span>
              <span className="setup-light__summary">
                {modLabel ? (
                  <a href={getBHUrl(modLabel)} target="_blank" rel="noopener noreferrer" className="blueprint-shop-link">{modLabel}</a>
                ) : null}
                {modLabel && dist ? ' · ' : null}
                {dist}
                {l.meterReading && <span className="setup-light__val--meter"> · {l.meterReading}</span>}
              </span>
            </div>

            <div className="setup-light__row">
              <span className="setup-light__key">Position</span>
              <span className="setup-light__val">{l.positionText}</span>
            </div>
            <div className="setup-light__row">
              <span className="setup-light__key">Power</span>
              <span className="setup-light__val">
                {l._role ? powerHint(l._role, l._lightingPattern, powerDisplay, l.meterReading) : l.powerHint}
              </span>
            </div>
            {l.modifierSizeNote && (
              <div className="setup-light__tip">{l.modifierSizeNote}</div>
            )}
            {l.purpose && (
              <div className="setup-light__row">
                <span className="setup-light__key">Purpose</span>
                <span className="setup-light__val">{l.purpose}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
