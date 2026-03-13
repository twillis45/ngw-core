export default function WizardProgress({ steps, currentStep }) {
  return (
    <div className="wizard-dots">
      {steps.map((_, i) => (
        <div
          key={i}
          className={`wizard-dots__dot${
            i === currentStep ? ' wizard-dots__dot--active' :
            i < currentStep ? ' wizard-dots__dot--done' : ''
          }`}
        />
      ))}
    </div>
  );
}
