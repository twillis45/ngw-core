/**
 * SettingsCard — subtle card wrapper that groups related settings rows.
 * Multiple cards can live inside one SettingsSection.
 */
export default function SettingsCard({ children, label }) {
  return (
    <div className="stg-card">
      {label && <div className="stg-card__label">{label}</div>}
      <div className="stg-card__body">
        {children}
      </div>
    </div>
  );
}
