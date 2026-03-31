export default function WizardProgress({ steps, currentStep }) {
  const pct = ((currentStep + 1) / steps.length) * 100;
  return (
    <div className="wizard-bar">
      <div className="wizard-bar__fill" style={{ width: `${pct}%` }} />
    </div>
  );
}
