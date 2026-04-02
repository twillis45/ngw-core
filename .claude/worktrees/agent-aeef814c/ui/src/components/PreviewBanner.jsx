/**
 * PreviewBanner — sticky bar shown on every screen when Preview As is active.
 * Mounts in App.jsx just below AppHeader.
 */
import usePreviewMode from '../hooks/usePreviewMode';

const ACCESS_LABELS = { guest: 'Guest', free: 'Free', paid: 'Paid', admin: 'Admin' };
const ROLE_LABELS   = { photographer: 'Photographer', assistant: 'Assistant' };

export default function PreviewBanner() {
  const { access, role, clear, isPreviewing } = usePreviewMode();
  if (!isPreviewing) return null;

  const parts = [
    access ? ACCESS_LABELS[access] : null,
    role   ? ROLE_LABELS[role]     : null,
  ].filter(Boolean);

  return (
    <div className="preview-banner">
      <span className="preview-banner__eye">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      </span>
      <span className="preview-banner__label">
        Viewing as <strong>{parts.join(' / ')}</strong>
      </span>
      <button
        type="button"
        className="preview-banner__exit"
        onClick={clear}
      >
        Exit
      </button>
    </div>
  );
}
