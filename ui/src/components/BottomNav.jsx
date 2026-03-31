import { useAppState, useDispatch } from '../context/AppContext';
import useSettings from '../hooks/useSettings';

/**
 * BottomNav — 5-tab navigation matching Figma:
 * Home | Recipes | Shoot | Kit | Setups
 *
 * Respects settings.navStyle: 'both' | 'icons' | 'labels'
 */
export default function BottomNav() {
  const { screen, appMode } = useAppState();
  const dispatch = useDispatch();
  const { navStyle = 'both' } = useSettings();

  const isHome = screen === 'home';
  const isShoot = screen === 'shoot_mode' || appMode === 'shoot';

  return (
    <nav className={`bottom-nav${navStyle !== 'both' ? ` bottom-nav--${navStyle}` : ''}`}>
      <button
        className={`bottom-nav__item${isHome ? ' bottom-nav__item--active' : ''}`}
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
        className={`bottom-nav__item${isShoot ? ' bottom-nav__item--active' : ''}`}
        onClick={() => {
          if (isShoot) return;
          dispatch({ type: 'NAVIGATE', screen: 'shoot_mode' });
        }}
        type="button"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
        <span className="bottom-nav__label">Shoot</span>
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
        <span className="bottom-nav__label">Kit</span>
      </button>

      <button
        className={`bottom-nav__item${screen === 'saved_setups' ? ' bottom-nav__item--active' : ''}`}
        onClick={() => dispatch({ type: 'NAVIGATE', screen: 'saved_setups' })}
        type="button"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/>
        </svg>
        <span className="bottom-nav__label">Setups</span>
      </button>
    </nav>
  );
}
