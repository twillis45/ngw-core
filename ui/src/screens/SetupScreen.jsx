import { useState } from 'react';
import { Button, Card, Panel } from '../components/shared';

export default function SetupScreen({ onSave, onCancel }) {
  const [setupName, setSetupName] = useState('');
  const [notes, setNotes] = useState('');

  const handleSave = () => {
    if (onSave) {
      onSave({
        name: setupName || 'Untitled Setup',
        notes,
        timestamp: new Date().toISOString(),
      });
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: 'var(--color-bg)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 'var(--space-xl)',
    }}>
      <div style={{ maxWidth: '500px', width: '100%' }}>
        {/* Header */}
        <div style={{ marginBottom: 'var(--space-2xl)', textAlign: 'center' }}>
          <h1 style={{
            fontSize: 'var(--text-2xl)',
            fontWeight: 600,
            color: 'var(--color-text)',
            margin: 0,
            marginBottom: 'var(--space-sm)',
          }}>
            Save Setup
          </h1>
          <p style={{
            fontSize: 'var(--text-base)',
            color: 'var(--color-text-secondary)',
            margin: 0,
          }}>
            Store your lighting configuration for future reference
          </p>
        </div>

        {/* Form Card */}
        <Card style={{
          marginBottom: 'var(--space-2xl)',
          padding: 'var(--space-lg)',
        }}>
          {/* Setup Name Field */}
          <div style={{ marginBottom: 'var(--space-lg)' }}>
            <label style={{
              display: 'block',
              fontSize: 'var(--text-sm)',
              fontWeight: 500,
              color: 'var(--color-text)',
              marginBottom: 'var(--space-sm)',
            }}>
              Setup Name
            </label>
            <input
              type="text"
              placeholder="e.g., Studio A - Beauty Dish Setup"
              value={setupName}
              onChange={(e) => setSetupName(e.target.value)}
              style={{
                width: '100%',
                padding: 'var(--space-md)',
                fontSize: 'var(--text-base)',
                backgroundColor: 'var(--color-bg)',
                border: '1px solid var(--color-border, rgba(255, 255, 255, 0.1))',
                borderRadius: 'var(--radius-md)',
                color: 'var(--color-text)',
                fontFamily: 'inherit',
                boxSizing: 'border-box',
                transition: 'border-color var(--duration-fast) var(--ease-out)',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = 'var(--color-accent-primary)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'var(--color-border, rgba(255, 255, 255, 0.1))';
              }}
            />
          </div>

          {/* Notes Field */}
          <div style={{ marginBottom: 'var(--space-lg)' }}>
            <label style={{
              display: 'block',
              fontSize: 'var(--text-sm)',
              fontWeight: 500,
              color: 'var(--color-text)',
              marginBottom: 'var(--space-sm)',
            }}>
              Notes (Optional)
            </label>
            <textarea
              placeholder="Any additional details about this setup..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{
                width: '100%',
                padding: 'var(--space-md)',
                fontSize: 'var(--text-base)',
                backgroundColor: 'var(--color-bg)',
                border: '1px solid var(--color-border, rgba(255, 255, 255, 0.1))',
                borderRadius: 'var(--radius-md)',
                color: 'var(--color-text)',
                fontFamily: 'inherit',
                minHeight: '100px',
                resize: 'vertical',
                boxSizing: 'border-box',
                transition: 'border-color var(--duration-fast) var(--ease-out)',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = 'var(--color-accent-primary)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'var(--color-border, rgba(255, 255, 255, 0.1))';
              }}
            />
          </div>

          {/* Auto-detected Info */}
          <div style={{
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            padding: 'var(--space-md)',
            borderRadius: 'var(--radius-md)',
            fontSize: 'var(--text-sm)',
            color: 'var(--color-text-secondary)',
          }}>
            <strong>Captured on:</strong> {new Date().toLocaleDateString()}
            <br />
            <strong>Primary Modifier:</strong> Octabox 3ft
            <br />
            <strong>Fill Light:</strong> Gold reflector
          </div>
        </Card>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-2xl)' }}>
          <Button
            variant="secondary"
            size="lg"
            onClick={onCancel}
            style={{ flex: 1 }}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="lg"
            onClick={handleSave}
            style={{ flex: 1 }}
          >
            Save Setup
          </Button>
        </div>

        {/* Info Panel */}
        <Panel
          title="What gets saved"
          defaultOpen={false}
          style={{ marginBottom: 'var(--space-lg)' }}
        >
          <p style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--color-text)',
            lineHeight: 'var(--line-height-relaxed)',
            margin: 0,
          }}>
            Your saved setups include the detected modifier types, positions, and analysis metadata. You can access them later to compare against new photos or troubleshoot your lighting.
          </p>
        </Panel>
      </div>
    </div>
  );
}
