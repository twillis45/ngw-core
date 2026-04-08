import { useState } from 'react';
import { Button, Card, Panel } from '../components/shared';

export default function SetupScreen({ result, onSave, onCancel }) {
  const [setupName, setSetupName] = useState('');
  const [notes, setNotes] = useState('');

  const handleSave = () => {
    if (onSave) {
      onSave({
        name: setupName.trim() || 'Untitled Setup',
        notes,
        timestamp: new Date().toISOString(),
        pattern: result?.pattern,
        confidence: result?.confidence,
        modifier: result?.sections?.catchlightModifier,
      });
    }
  };

  const inputStyle = {
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
  };

  const onFocus = (e) => { e.target.style.borderColor = 'var(--color-accent-primary)'; };
  const onBlur = (e) => { e.target.style.borderColor = 'var(--color-border, rgba(255, 255, 255, 0.1))'; };

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

        <div style={{ marginBottom: 'var(--space-2xl)', textAlign: 'center' }}>
          <h1 style={{
            fontSize: 'var(--text-2xl)', fontWeight: 600,
            color: 'var(--color-text)', margin: 0, marginBottom: 'var(--space-sm)',
          }}>
            Save Setup
          </h1>
          <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-text-secondary)', margin: 0 }}>
            Store this lighting configuration for future reference
          </p>
        </div>

        <Card style={{ marginBottom: 'var(--space-2xl)', padding: 'var(--space-lg)' }}>
          <div style={{ marginBottom: 'var(--space-lg)' }}>
            <label style={{
              display: 'block', fontSize: 'var(--text-sm)', fontWeight: 500,
              color: 'var(--color-text)', marginBottom: 'var(--space-sm)',
            }}>Setup Name</label>
            <input
              type="text"
              placeholder={result?.pattern ? `${result.pattern} Setup` : 'e.g., Studio A — Rembrandt Setup'}
              value={setupName}
              onChange={(e) => setSetupName(e.target.value)}
              style={inputStyle}
              onFocus={onFocus}
              onBlur={onBlur}
            />
          </div>

          <div style={{ marginBottom: 'var(--space-lg)' }}>
            <label style={{
              display: 'block', fontSize: 'var(--text-sm)', fontWeight: 500,
              color: 'var(--color-text)', marginBottom: 'var(--space-sm)',
            }}>Notes (Optional)</label>
            <textarea
              placeholder="Any additional details about this setup..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={{ ...inputStyle, minHeight: '100px', resize: 'vertical' }}
              onFocus={onFocus}
              onBlur={onBlur}
            />
          </div>

          {/* Auto-detected info from result — only show when real data is available */}
          {result && (
            <div style={{
              backgroundColor: 'rgba(16, 185, 129, 0.08)',
              padding: 'var(--space-md)',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text-secondary)',
              display: 'flex', flexDirection: 'column', gap: 6,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Pattern</span>
                <span style={{ color: 'var(--color-text)', fontWeight: 500 }}>{result.pattern}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Confidence</span>
                <span style={{ color: result.confidence >= 70 ? '#10b981' : '#f59e0b', fontWeight: 500 }}>{result.confidence}%</span>
              </div>
              {result.sections?.catchlightModifier && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Modifier</span>
                  <span style={{ color: 'var(--color-text)', fontWeight: 500, textAlign: 'right', maxWidth: '60%' }}>{result.sections.catchlightModifier.split(',')[0]}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Captured</span>
                <span style={{ color: 'var(--color-text)', fontWeight: 500 }}>{new Date().toLocaleDateString()}</span>
              </div>
            </div>
          )}
        </Card>

        <div style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-2xl)' }}>
          <Button variant="secondary" size="lg" onClick={onCancel} style={{ flex: 1 }}>Cancel</Button>
          <Button variant="primary" size="lg" onClick={handleSave} style={{ flex: 1 }}>Save Setup</Button>
        </div>

        <Panel title="What gets saved" defaultOpen={false} style={{ marginBottom: 'var(--space-lg)' }}>
          <p style={{
            fontSize: 'var(--text-sm)', color: 'var(--color-text)',
            lineHeight: 'var(--line-height-relaxed)', margin: 0,
          }}>
            Saved setups include the detected lighting pattern, confidence score, modifier analysis, and shadow data. Access them later to compare against new photos or replicate the setup.
          </p>
        </Panel>
      </div>
    </div>
  );
}
