/** PrimaryButton — full-width accent CTA with loading state. */
export default function PrimaryButton({ label, loadingLabel = '···', onClick, loading = false, disabled = false, fullWidth = true }) {
  const cls = [
    'ngw-primary-btn',
    fullWidth ? 'ngw-primary-btn--full' : '',
    loading   ? 'ngw-primary-btn--loading'  : '',
    disabled  ? 'ngw-primary-btn--disabled' : '',
  ].filter(Boolean).join(' ');

  return (
    <button
      className={cls}
      onClick={loading || disabled ? undefined : onClick}
      type="button"
      aria-disabled={loading || disabled}
    >
      {loading ? (
        <span aria-label="Loading">{loadingLabel}</span>
      ) : label}
    </button>
  );
}
