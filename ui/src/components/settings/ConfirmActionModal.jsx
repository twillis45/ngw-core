/**
 * ConfirmActionModal — bottom-sheet confirmation for destructive actions.
 * Rendered inline (portals avoided for simplicity in mobile-first context).
 *
 * Props:
 *   open        — bool
 *   title       — string
 *   message     — string
 *   confirmText — string (default "Confirm")
 *   cancelText  — string (default "Cancel")
 *   destructive — bool, red confirm button
 *   onConfirm   — () => void
 *   onCancel    — () => void
 */
export default function ConfirmActionModal({
  open,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  return (
    <div className="stg-modal-overlay" onClick={onCancel} role="presentation">
      <div
        className="stg-modal"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="stg-modal-title"
      >
        <div className="stg-modal__title" id="stg-modal-title">{title}</div>
        {message && (
          <div className="stg-modal__message">{message}</div>
        )}
        <div className="stg-modal__actions">
          <button
            className="btn btn--ghost"
            onClick={onCancel}
            type="button"
          >
            {cancelText}
          </button>
          <button
            className={`btn${destructive ? ' btn--danger' : ' btn--primary'}`}
            onClick={onConfirm}
            type="button"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
