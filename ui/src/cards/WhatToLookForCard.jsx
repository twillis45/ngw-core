import ShowMore from '../components/ShowMore';

export default function WhatToLookForCard({ goodSigns, warnings }) {
  const hasContent = (goodSigns && goodSigns.length > 0) || (warnings && warnings.length > 0);
  if (!hasContent) return null;

  return (
    <div className="result-card">
      <div className="result-card__header">
        <span className="result-card__icon">{'\u{1F441}\uFE0F'}</span>
        <span>What to Look For</span>
      </div>

      {goodSigns && goodSigns.length > 0 && (
        <>
          <div className="section-label" style={{ marginBottom: 6 }}>Good signs</div>
          <ul className="sign-list sign-list--good">
            <ShowMore
              items={goodSigns}
              limit={4}
              renderItem={(s, i) => (
                <li className="sign-list__item" key={i}>{s}</li>
              )}
            />
          </ul>
        </>
      )}

      {warnings && warnings.length > 0 && (
        <>
          <div className="section-label" style={{ marginTop: 12, marginBottom: 6 }}>Watch out for</div>
          <ul className="sign-list sign-list--bad">
            <ShowMore
              items={warnings}
              limit={4}
              renderItem={(w, i) => (
                <li className="sign-list__item" key={i}>{w}</li>
              )}
            />
          </ul>
        </>
      )}
    </div>
  );
}
