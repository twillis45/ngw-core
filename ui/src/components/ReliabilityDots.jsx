export default function ReliabilityDots({ dots, label }) {
  return (
    <div className="reliability">
      <div className="reliability__dots">
        {[1, 2, 3, 4, 5].map(n => (
          <span
            key={n}
            className={`reliability__dot${n <= dots ? ' reliability__dot--filled' : ''}`}
          />
        ))}
      </div>
      <span className="reliability__label">{label}</span>
    </div>
  );
}
