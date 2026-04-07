export default function Button({
  variant = 'primary',
  size = 'md',
  disabled = false,
  children,
  ...props
}) {
  const variantClass = `btn--${variant}`;
  const sizeClass = `btn--${size}`;

  return (
    <button
      className={`btn ${variantClass} ${sizeClass}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
