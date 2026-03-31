/** BillingToggle — monthly/yearly selector.
 *  Default controlled by billing_default flag (passed as value prop).
 *  "Save 17%" chip always visible on yearly option. */
export default function BillingToggle({ value, onChange }) {
  return (
    <div className="ngw-billing-toggle" role="group" aria-label="Billing period">
      <button
        className={`ngw-billing-toggle__option${value === 'monthly' ? ' ngw-billing-toggle__option--active' : ''}`}
        onClick={() => onChange('monthly')}
        type="button"
        aria-pressed={value === 'monthly'}
      >
        Monthly
      </button>
      <button
        className={`ngw-billing-toggle__option ngw-billing-toggle__option--yearly${value === 'yearly' ? ' ngw-billing-toggle__option--active' : ''}`}
        onClick={() => onChange('yearly')}
        type="button"
        aria-pressed={value === 'yearly'}
      >
        Yearly
        <span className="ngw-billing-toggle__badge">Save 17%</span>
      </button>
    </div>
  );
}
