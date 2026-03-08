import { useDispatch } from '../context/AppContext';
import { GEAR_TYPES, GEAR_SHORT_NAMES } from '../gearPresets';

const FEATURE_LIST = [
  { key: 'dimmable',    label: 'Dimmable' },
  { key: 'battery',     label: 'Battery powered' },
  { key: 'waterproof',  label: 'Waterproof' },
  { key: 'smart_ready', label: 'Smart / app control' },
];

export default function LightEntry({ light, index, canRemove, totalLights }) {
  const dispatch = useDispatch();

  function update(updates) {
    dispatch({ type: 'UPDATE_LIGHT', lightId: light.id, updates });
  }

  function toggleFeature(feat) {
    dispatch({
      type: 'UPDATE_LIGHT_FEATURE',
      lightId: light.id,
      feature: feat,
      value: !light.features[feat],
    });
  }

  return (
    <div className="light-card">
      <div className="light-card__header">
        <span className="light-card__label">
          {light.brand || GEAR_SHORT_NAMES[light.type] || 'Light'}
          {totalLights > 1 ? ` ${index + 1}` : ''}
        </span>
        {canRemove && (
          <button
            className="light-card__remove"
            onClick={() => dispatch({ type: 'REMOVE_LIGHT', lightId: light.id })}
            aria-label="Remove light"
          >
            &times;
          </button>
        )}
      </div>

      <div className="field">
        <label className="field__label">Type</label>
        <select
          className="field__select"
          value={light.type}
          onChange={e => update({ type: e.target.value })}
        >
          {GEAR_TYPES.map(g => (
            <option key={g.value} value={g.value}>{g.label}</option>
          ))}
        </select>
      </div>

      <div className="field">
        <label className="field__label">Brand / model (optional)</label>
        <input
          className="field__input"
          type="text"
          value={light.brand}
          onChange={e => update({ brand: e.target.value })}
          placeholder="e.g. Godox AD600"
        />
      </div>

      {FEATURE_LIST.map(f => (
        <div className="toggle-row" key={f.key}>
          <span className="toggle-row__label">{f.label}</span>
          <button
            className={`toggle${light.features[f.key] ? ' toggle--on' : ''}`}
            onClick={() => toggleFeature(f.key)}
            type="button"
            aria-label={`Toggle ${f.label}`}
          />
        </div>
      ))}
    </div>
  );
}
