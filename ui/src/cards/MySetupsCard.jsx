import { useEffect, useMemo } from 'react';
import { useDispatch } from '../context/AppContext';
import { loadSetups, getStylePattern } from '../data/setupStore';
import { trackEvent } from '../data/analytics';
import CardIcon from '../components/CardIcon';

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function MySetupsCard() {
  const dispatch = useDispatch();

  const setups = useMemo(() => loadSetups(), []);
  const stylePattern = useMemo(() => getStylePattern(setups), [setups]);

  useEffect(() => {
    if (stylePattern) {
      trackEvent('STYLE_PATTERN_DETECTED', {
        pattern: stylePattern.pattern,
        count: stylePattern.count,
        total: stylePattern.total,
      });
    }
  }, [stylePattern]);

  if (!setups.length) return null;

  const recent = setups.slice(-3).reverse();
  const totalCount = setups.length;
  const hasMore = totalCount > 3;

  function handleLoad(setup) {
    trackEvent('SETUP_REUSED', {
      id: setup.id,
      name: setup.name,
      pattern: setup.result?.bestMatch?.lightingPattern,
    });
    dispatch({ type: 'SET_RESULT', result: setup.result, apiResponse: null });
  }

  function handleViewAll() {
    dispatch({ type: 'NAVIGATE', screen: 'saved_setups' });
  }

  return (
    <div className="result-card my-setups-card">
      <div className="result-card__header">
        <CardIcon name="bookmark" />
        <span>My Setups</span>
      </div>

      {stylePattern && (
        <div className="my-setups-card__identity">
          <span>
            You consistently use{' '}
            <span className="my-setups-card__pattern-badge">{stylePattern.pattern}</span>
            {' '}lighting
            {stylePattern.total >= 3 && (
              <span className="my-setups-card__pattern-count">
                {' '}({stylePattern.count} of {stylePattern.total} saved)
              </span>
            )}
          </span>
        </div>
      )}

      <ul className="my-setups-card__list">
        {recent.map(setup => {
          const pattern = setup.result?.bestMatch?.lightingPattern;
          const score = setup.result?.bestMatch?.reliabilityScore;
          return (
            <li key={setup.id} className="my-setups-card__item">
              <div className="my-setups-card__item-info">
                <span className="my-setups-card__item-name">{setup.name}</span>
                <div className="my-setups-card__item-meta">
                  {pattern && (
                    <span className="my-setups-card__pattern-pill">{pattern}</span>
                  )}
                  {score != null && (
                    <span className="my-setups-card__score">{Math.round(score)}%</span>
                  )}
                  <span className="my-setups-card__date">{formatDate(setup.timestamp)}</span>
                </div>
              </div>
              <button
                className="btn btn--ghost btn--sm my-setups-card__load-btn"
                onClick={() => handleLoad(setup)}
                type="button"
              >
                Load
              </button>
            </li>
          );
        })}
      </ul>

      {hasMore && (
        <button
          className="my-setups-card__view-all"
          onClick={handleViewAll}
          type="button"
        >
          View all {totalCount} saved setups →
        </button>
      )}
    </div>
  );
}
