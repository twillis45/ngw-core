export default function IntentCard({ emoji, label, desc, onClick }) {
  return (
    <button className="intent-card" onClick={onClick} type="button">
      <span className="intent-card__emoji">{emoji}</span>
      <div className="intent-card__label">{label}</div>
      <div className="intent-card__desc">{desc}</div>
    </button>
  );
}
