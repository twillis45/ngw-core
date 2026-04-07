import { useState } from 'react';

export default function Panel({
  title,
  children,
  defaultOpen = true,
  onToggle,
  className = '',
  ...props
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const handleToggle = () => {
    const newState = !isOpen;
    setIsOpen(newState);
    if (onToggle) onToggle(newState);
  };

  return (
    <div className={`panel ${className}`} {...props}>
      {title && (
        <button
          className="panel__header"
          onClick={handleToggle}
        >
          <span className="panel__title">{title}</span>
          <span className={`panel__chevron ${isOpen ? 'open' : ''}`}>›</span>
        </button>
      )}
      {isOpen && (
        <div className="panel__content">
          {children}
        </div>
      )}
    </div>
  );
}
