import { useState, useEffect } from 'react';
import { Card, Panel } from '../components/shared';

export default function ProcessingScreen({ imageFile, onComplete }) {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Initializing analysis...');

  useEffect(() => {
    // Simulate analysis progress
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) return prev; // Cap at 90% until complete
        return prev + Math.random() * 25;
      });
    }, 800);

    // Simulate completion after ~3 seconds
    const timeout = setTimeout(() => {
      setProgress(100);
      setStatus('Analysis complete');
      setTimeout(() => {
        if (onComplete) onComplete();
      }, 500);
    }, 3000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [onComplete]);

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
            Analyzing Setup
          </h1>
          <p style={{
            fontSize: 'var(--text-base)',
            color: 'var(--color-text-secondary)',
            margin: 0,
          }}>
            Processing your image
          </p>
        </div>

        {/* Image Preview Card */}
        <Card style={{
          marginBottom: 'var(--space-2xl)',
          padding: 'var(--space-lg)',
          textAlign: 'center',
        }}>
          <div style={{
            aspectRatio: '1',
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 'var(--space-lg)',
            border: '2px solid var(--color-border, rgba(255, 255, 255, 0.1))',
            overflow: 'hidden',
          }}>
            {imageFile && (
              <img
                src={URL.createObjectURL(imageFile)}
                alt="Analyzing"
                style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7 }}
              />
            )}
          </div>

          {/* Progress Bar */}
          <div style={{ marginBottom: 'var(--space-md)' }}>
            <div style={{
              width: '100%',
              height: '8px',
              backgroundColor: 'var(--color-surface)',
              borderRadius: 'var(--radius-sm)',
              overflow: 'hidden',
              marginBottom: 'var(--space-sm)',
            }}>
              <div style={{
                width: `${Math.round(progress)}%`,
                height: '100%',
                backgroundColor: 'var(--color-accent-primary)',
                transition: 'width var(--duration-normal) var(--ease-out)',
              }} />
            </div>
            <p style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text-secondary)',
              margin: 0,
            }}>
              {status}
            </p>
          </div>
        </Card>

        {/* Info Panel */}
        <Panel
          title="What we're analyzing"
          defaultOpen={true}
          style={{ marginBottom: 'var(--space-lg)' }}
        >
          <div style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--color-text)',
            lineHeight: 'var(--line-height-relaxed)',
            margin: 0,
          }}>
            <ul style={{ margin: 0, paddingLeft: '1.5em' }}>
              <li>Lighting modifiers (softbox, beauty dish, ring, etc.)</li>
              <li>Light positioning and angles</li>
              <li>Catchlights and shadow patterns</li>
              <li>Overall setup quality metrics</li>
            </ul>
          </div>
        </Panel>
      </div>
    </div>
  );
}
