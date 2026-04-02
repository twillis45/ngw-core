export default function ChipStepper({ label, qty, onAdd, onIncrement, onDecrement, highlighted, reason }) {
  if (!qty) {
    // When highlighted and a reason is available, wrap in a column so the reason
    // appears as a sub-line directly under the chip (not added yet state).
    if (highlighted && reason) {
      return (
        <div className="chip-wrapper">
          <button className="chip chip--recommended" onClick={onAdd} type="button">
            + {label}
          </button>
          <span className="chip__reason">{reason}</span>
        </div>
      );
    }
    return (
      <button className={`chip${highlighted ? ' chip--recommended' : ''}`} onClick={onAdd} type="button">
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
