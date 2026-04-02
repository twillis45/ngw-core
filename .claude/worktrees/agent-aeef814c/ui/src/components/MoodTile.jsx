export default function MoodTile({ icon, emoji, label, desc, selected, onClick }) {
  return (
    <button
      className={`mood-tile${selected ? ' mood-tile--selected' : ''}`}
      onClick={onClick}
      type="button"
    >
      <span className="mood-tile__icon">{icon || emoji}</span>
      <div className="mood-tile__label">{label}</div>
      <div className="mood-tile__desc">{desc}</div>
    </button>
  );
}
