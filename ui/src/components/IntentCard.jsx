export default function IntentCard({ icon, label, desc, onClick }) {
  return (
    <button className="intent-card" onClick={onClick} type="button">
      <span className="intent-card__icon">{icon}</span>
      <span className="intent-card__text">
        <strong>{label}</strong>
        <small>{desc}</small>
      </span>
      <span className="intent-card__arrow">{'\u203A'}</span>
    </button>
  );
}
