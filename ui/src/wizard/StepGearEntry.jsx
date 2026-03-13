import { useState } from 'react';
import { useAppState, useDispatch } from '../context/AppContext';
import ChipStepper from '../components/ChipStepper';
import { LIGHT_CATALOG } from '../data/lightCatalog';
import { MODIFIER_CATEGORIES } from '../data/modifierCatalog';
import { saveKit } from '../data/kitStore';

const SUPPORT_CATALOG = [
  { value: 'c_stand', label: 'C-Stand' },
  { value: 'light_stand', label: 'Light Stand' },
  { value: 'boom_arm', label: 'Boom Arm' },
  { value: 'bg_stand', label: 'Background Stand' },
  { value: 'sandbag', label: 'Sandbag' },
];

/** Group items within a category by vendor */
function groupByVendor(items) {
  const groups = [];
  const seen = {};
  for (const item of items) {
    if (!seen[item.vendor]) {
      seen[item.vendor] = { vendor: item.vendor, items: [] };
      groups.push(seen[item.vendor]);
    }
    seen[item.vendor].items.push(item);
  }
  return groups;
}

export default function StepGearEntry() {
  const { gear } = useAppState();
  const dispatch = useDispatch();
  const [openCats, setOpenCats] = useState({});
  const [openVendors, setOpenVendors] = useState({});
  const [openModCats, setOpenModCats] = useState({});
  const [supportOpen, setSupportOpen] = useState(false);
  const [kitSaved, setKitSaved] = useState(false);

  function toggleCat(cat) {
    setOpenCats(prev => ({ ...prev, [cat]: !prev[cat] }));
  }

  function toggleVendor(key) {
    setOpenVendors(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleModCat(key) {
    setOpenModCats(prev => ({ ...prev, [key]: !prev[key] }));
  }

  function lightQty(type) {
    const item = gear.lights.find(l => l.type === type);
    return item ? item.qty : 0;
  }

  function catCount(category) {
    return category.items.reduce((sum, item) => sum + lightQty(item.value), 0);
  }

  function vendorCount(items) {
    return items.reduce((sum, item) => sum + lightQty(item.value), 0);
  }

  function supportQty(type) {
    const item = gear.support.find(s => s.type === type);
    return item ? item.qty : 0;
  }

  function modQty(type) {
    const item = gear.modifiers.find(m => m.type === type);
    return item ? item.qty : 0;
  }

  function modCatCount(catItems) {
    return catItems.reduce((sum, m) => sum + modQty(m.value), 0);
  }

  function handleSaveKit() {
    saveKit(gear);
    setKitSaved(true);
    setTimeout(() => setKitSaved(false), 2000);
  }

  const lightCats = LIGHT_CATALOG.filter(c => c.section !== 'accessories');
  const accessoryCats = LIGHT_CATALOG.filter(c => c.section === 'accessories');

  return (
    <>
      <h2 className="screen-heading">What's in your kit?</h2>

      <div className="gear-section">
        <div className="gear-section__label">Lights</div>
        {lightCats.map(cat => {
          const isOpen = !!openCats[cat.category];
          const count = catCount(cat);
          const vendorGroups = groupByVendor(cat.items);
          return (
            <div className="gear-category" key={cat.category}>
              <button
                type="button"
                className="gear-category__header"
                onClick={() => toggleCat(cat.category)}
              >
                <span className="gear-category__icon">{cat.icon}</span>
                <span className="gear-category__label">{cat.label}</span>
                {count > 0 && <span className="gear-category__count">{count}</span>}
                <span className={`gear-category__arrow${isOpen ? ' gear-category__arrow--open' : ''}`}>
                  {'\u25BC'}
                </span>
              </button>
              {isOpen && (
                <div className="gear-category__items">
                  {vendorGroups.map(group => {
                    const vKey = `${cat.category}:${group.vendor}`;
                    const vOpen = !!openVendors[vKey];
                    const vCount = vendorCount(group.items);
                    return (
                      <div className="vendor-group" key={group.vendor}>
                        <button
                          type="button"
                          className="vendor-group__header"
                          onClick={() => toggleVendor(vKey)}
                        >
                          <span className="vendor-group__name">{group.vendor}</span>
                          {vCount > 0 && <span className="vendor-group__count">{vCount}</span>}
                          <span className={`vendor-group__arrow${vOpen ? ' vendor-group__arrow--open' : ''}`}>
                            {'\u203A'}
                          </span>
                        </button>
                        {vOpen && (
                          <div className="vendor-group__models">
                            {group.items.map(item => (
                              <ChipStepper
                                key={item.value}
                                label={item.model}
                                qty={lightQty(item.value)}
                                onAdd={() => dispatch({ type: 'ADD_GEAR_LIGHT', lightType: item.value })}
                                onIncrement={() => dispatch({ type: 'UPDATE_GEAR_QTY', lightType: item.value, delta: 1 })}
                                onDecrement={() => dispatch({ type: 'UPDATE_GEAR_QTY', lightType: item.value, delta: -1 })}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {accessoryCats.length > 0 && (
        <div className="gear-section">
          <div className="gear-section__label">Accessories</div>
          {accessoryCats.map(cat => {
            const isOpen = !!openCats[cat.category];
            const count = catCount(cat);
            const vendorGroups = groupByVendor(cat.items);
            return (
              <div className="gear-category" key={cat.category}>
                <button
                  type="button"
                  className="gear-category__header"
                  onClick={() => toggleCat(cat.category)}
                >
                  <span className="gear-category__icon">{cat.icon}</span>
                  <span className="gear-category__label">{cat.label}</span>
                  {count > 0 && <span className="gear-category__count">{count}</span>}
                  <span className={`gear-category__arrow${isOpen ? ' gear-category__arrow--open' : ''}`}>
                    {'\u25BC'}
                  </span>
                </button>
                {isOpen && (
                  <div className="gear-category__items">
                    {vendorGroups.map(group => {
                      const vKey = `${cat.category}:${group.vendor}`;
                      const vOpen = !!openVendors[vKey];
                      const vCount = vendorCount(group.items);
                      return (
                        <div className="vendor-group" key={group.vendor}>
                          <button
                            type="button"
                            className="vendor-group__header"
                            onClick={() => toggleVendor(vKey)}
                          >
                            <span className="vendor-group__name">{group.vendor}</span>
                            {vCount > 0 && <span className="vendor-group__count">{vCount}</span>}
                            <span className={`vendor-group__arrow${vOpen ? ' vendor-group__arrow--open' : ''}`}>
                              {'\u203A'}
                            </span>
                          </button>
                          {vOpen && (
                            <div className="vendor-group__models">
                              {group.items.map(item => (
                                <ChipStepper
                                  key={item.value}
                                  label={item.model}
                                  qty={lightQty(item.value)}
                                  onAdd={() => dispatch({ type: 'ADD_GEAR_LIGHT', lightType: item.value })}
                                  onIncrement={() => dispatch({ type: 'UPDATE_GEAR_QTY', lightType: item.value, delta: 1 })}
                                  onDecrement={() => dispatch({ type: 'UPDATE_GEAR_QTY', lightType: item.value, delta: -1 })}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="gear-section">
        <div className="gear-section__label">Modifiers</div>
        {MODIFIER_CATEGORIES.map(cat => {
          const isOpen = !!openModCats[cat.key];
          const count = modCatCount(cat.items);
          return (
            <div className="gear-category" key={cat.key}>
              <button
                type="button"
                className="gear-category__header"
                onClick={() => toggleModCat(cat.key)}
              >
                <span className="gear-category__label">{cat.label}</span>
                {count > 0 && <span className="gear-category__count">{count}</span>}
                <span className={`gear-category__arrow${isOpen ? ' gear-category__arrow--open' : ''}`}>
                  {'\u25BC'}
                </span>
              </button>
              {isOpen && (
                <div className="gear-category__items" style={{ padding: '4px 0 8px' }}>
                  <div className="chip-grid">
                    {cat.items.map(item => (
                      <ChipStepper
                        key={item.value}
                        label={item.label}
                        qty={modQty(item.value)}
                        onAdd={() => dispatch({ type: 'ADD_MODIFIER', modifier: item.value })}
                        onIncrement={() => dispatch({ type: 'UPDATE_MODIFIER_QTY', modifier: item.value, delta: 1 })}
                        onDecrement={() => dispatch({ type: 'UPDATE_MODIFIER_QTY', modifier: item.value, delta: -1 })}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="gear-section">
        <div className="gear-section__label">Support</div>
        <div className="gear-category">
          <button
            type="button"
            className="gear-category__header"
            onClick={() => setSupportOpen(prev => !prev)}
          >
            <span className="gear-category__label">Stands & Accessories</span>
            {gear.support.length > 0 && (
              <span className="gear-category__count">
                {gear.support.reduce((s, i) => s + i.qty, 0)}
              </span>
            )}
            <span className={`gear-category__arrow${supportOpen ? ' gear-category__arrow--open' : ''}`}>
              {'\u25BC'}
            </span>
          </button>
          {supportOpen && (
            <div className="gear-category__items" style={{ padding: '4px 0 8px' }}>
              <div className="chip-grid">
                {SUPPORT_CATALOG.map(item => (
                  <ChipStepper
                    key={item.value}
                    label={item.label}
                    qty={supportQty(item.value)}
                    onAdd={() => dispatch({ type: 'ADD_SUPPORT_GEAR', supportType: item.value })}
                    onIncrement={() => dispatch({ type: 'UPDATE_SUPPORT_QTY', supportType: item.value, delta: 1 })}
                    onDecrement={() => dispatch({ type: 'UPDATE_SUPPORT_QTY', supportType: item.value, delta: -1 })}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {gear.lights.length > 0 && (
        <button
          className="btn btn--ghost"
          onClick={handleSaveKit}
          style={{ width: '100%', marginTop: 'var(--space-md)' }}
          type="button"
        >
          {kitSaved ? '\u2713 Kit Saved!' : 'Save as My Kit'}
        </button>
      )}
    </>
  );
}
