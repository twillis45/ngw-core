export default function Badge({
  variant = 'default',
  size = 'sm',
  children,
  ...props
}) {
  const variantClass = `badge--${variant}`;
  const sizeClass = `badge--${size}`;

  return (
    <span className={`badge ${variantClass} ${sizeClass}`} {...props}>
      {children}
    </span>
  );
}
