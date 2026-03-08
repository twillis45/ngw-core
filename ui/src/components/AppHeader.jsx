import { useAppState, useDispatch } from '../context/AppContext';

export default function AppHeader() {
  const { screen, history } = useAppState();
  const dispatch = useDispatch();
  const canGoBack = screen !== 'welcome' && history.length > 0 && screen !== 'loading';

  return (
    <header className="app-header">
      {canGoBack && (
        <button
          className="app-header__back"
          onClick={() => dispatch({ type: 'GO_BACK' })}
          aria-label="Go back"
        >
          &larr;
        </button>
      )}
      <span className="app-header__title">Lighting Coach</span>
    </header>
  );
}
