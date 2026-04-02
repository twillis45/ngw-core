import { useEffect } from 'react';

export default function Toast({ message, visible, onDone }) {
  useEffect(() => {
    if (visible) {
      const t = setTimeout(onDone, 2000);
      return () => clearTimeout(t);
    }
  }, [visible, onDone]);

  return (
    <div className={`toast${visible ? ' toast--visible' : ''}`}>
      {message}
    </div>
  );
}
