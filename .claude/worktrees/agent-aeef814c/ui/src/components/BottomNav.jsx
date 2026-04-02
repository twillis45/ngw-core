import { useAppState, useDispatch } from '../context/AppContext';

export default function BottomNav({ onShare }) {
  const { screen, result } = useAppState();
  const dispatch = useDispatch();

  // Hide during wizard (has its own sticky bar) and loading
  if (screen === 'wizard' || screen === 'loading') return null;

  const isResults = screen === 'results' && result;
  const isWelcome = screen === 'welcome';

  return (
    <nav className="bottom-nav">
      <button
        className={`bottom-nav__item${isWelcome ? ' bottom-nav__item--active' : ''}`}
        onClick={() => dispatch({ type: 'RESET' })}
        type="button"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12L12 3l9 9"/>
          <path d="M5 10v9a1 1 0 001 1h4v-5h4v5h4a1 1 0 001-1v-9"/>
        </svg>
        <span className="bottom-nav__label">Home</span>
      </button>

      <button
        className={`bottom-nav__item${screen === 'recipes' ? ' bottom-nav__item--active' : ''}`}
        onClick={() => dispatch({ type: 'NAVIGATE', screen: 'recipes' })}
        type="button"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19.5A2.5 2.5 0 016.5 17H20"/>
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>
        </svg>
        <span className="bottom-nav__label">Recipes</span>
      </button>

      <button
        className={`bottom-nav__item${screen === 'my_kit' ? ' bottom-nav__item--active' : ''}`}
        onClick={() => dispatch({ type: 'NAVIGATE', screen: 'my_kit' })}
        type="button"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="9" width="20" height="12" rx="2"/>
          <path d="M8 9V6a4 4 0 0 1 8 0v2"/>
        </svg>
        <span className="bottom-nav__label">My Kit</span>
      </button>

      <button
        className={`bottom-nav__item${screen === 'saved_setups' ? ' bottom-nav__item--active' : ''}`}
        onClick={() => dispatch({ type: 'NAVIGATE', screen: 'saved_setups' })}
        type="button"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/>
        </svg>
        <span className="bottom-nav__label">Saved</span>
      </button>

      <button
        className="bottom-nav__item"
        onClick={() => dispatch({ type: 'RESET' })}
        disabled={isWelcome}
        type="button"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9"/>
          <path d="M12 8v8M8 12h8"/>
        </svg>
        <span className="bottom-nav__label">New</span>
      </button>

      {isResults && (
        <button
          className="bottom-nav__item"
          onClick={() => dispatch({ type: 'GO_BACK' })}
          type="button"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4v7"/>
            <path d="M4 4l7.586 7.586a2 2 0 010 2.828L7 19"/>
            <path d="M14 15h6v-6"/>
          </svg>
          <span className="bottom-nav__label">Edit</span>
        </button>
      )}

      {isResults && (
        <button
          className="bottom-nav__item"
          onClick={onShare}
          type="button"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7"/>
            <polyline points="16 6 12 2 8 6"/>
            <line x1="12" y1="2" x2="12" y2="15"/>
          </svg>
          <span className="bottom-nav__label">Share</span>
        </button>
      )}
    </nav>
  );
}
