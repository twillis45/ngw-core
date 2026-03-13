export default function ChipSelect({ options, selected, onSelect }) {
  return (
    <div className="chip-grid">
      {options.map(opt => (
        <button
          key={opt.value}
          className={`chip${selected === opt.value ? ' chip--selected' : ''}`}
          onClick={() => onSelect(opt.value)}
          type="button"
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
