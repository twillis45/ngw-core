/**
 * DistanceRefCard — human-friendly distance reference.
 * Shows feet, meters, and an arm-length approximation.
 *
 * Props:
 *   ref_data - { feet, meters, approx, steps }
 */
export default function DistanceRefCard({ ref_data }) {
  if (!ref_data || !ref_data.feet) return null;

  return (
    <div className="distance-ref">
      <div className="distance-ref__row">
        <span className="distance-ref__label">{'\uD83D\uDCCF'}</span>
        <span className="distance-ref__value">{ref_data.feet}</span>
        {ref_data.meters && (
          <span className="distance-ref__alt">({ref_data.meters})</span>
        )}
      </div>
      {ref_data.approx && (
        <div className="distance-ref__approx">{ref_data.approx}</div>
      )}
    </div>
  );
}
