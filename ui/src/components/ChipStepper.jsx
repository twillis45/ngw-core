export default function ChipStepper({ label, qty, onAdd, onIncrement, onDecrement }) {
  if (!qty) {
    return (
      <button className="chip" onClick={onAdd} type="button">
        + {label}
      </button>
    );
  }

  return (
    <div className="chip-stepper chip-stepper--active">
      <span className="chip-stepper__label">{label}</span>
      <button
        className="chip-stepper__btn"
        onClick={onDecrement}
        type="button"
        aria-label={`Remove one ${label}`}
      >
        &minus;
      </button>
      <span className="chip-stepper__qty">{qty}</span>
      <button
        className="chip-stepper__btn"
        onClick={onIncrement}
        type="button"
        aria-label={`Add one ${label}`}
      >
        +
      </button>
    </div>
  );
}
