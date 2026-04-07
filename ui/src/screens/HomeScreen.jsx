import { useState } from 'react';
import { Button, Card, Panel } from '../components/shared';

export default function HomeScreen({ onAnalyze }) {
  const [imageInput, setImageInput] = useState(null);

  const handleImageCapture = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageInput(file);
    }
  };

  const handleAnalyze = () => {
    if (imageInput && onAnalyze) {
      onAnalyze(imageInput);
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
            NGW Core
          </h1>
          <p style={{
            fontSize: 'var(--text-base)',
            color: 'var(--color-text-secondary)',
            margin: 0,
          }}>
            Analyze your lighting setup
          </p>
        </div>

        {/* Viewfinder / Image Input Card */}
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
            {imageInput ? (
              <img
                src={URL.createObjectURL(imageInput)}
                alt="Preview"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <div style={{ textAlign: 'center' }}>
                <p style={{
                  fontSize: 'var(--text-sm)',
                  color: 'var(--color-text-secondary)',
                  margin: 0,
                }}>
                  📷<br />Select or capture an image
                </p>
              </div>
            )}
          </div>

          <label style={{
            display: 'block',
            marginBottom: 'var(--space-md)',
          }}>
            <input
              type="file"
              accept="image/*"
              onChange={handleImageCapture}
              style={{ display: 'none' }}
            />
            <Button
              variant="secondary"
              size="md"
              onClick={() => document.querySelector('input[type="file"]')?.click()}
              style={{ width: '100%' }}
            >
              Choose Image
            </Button>
          </label>
        </Card>

        {/* Action Button */}
        <Button
          variant="primary"
          size="lg"
          disabled={!imageInput}
          onClick={handleAnalyze}
          style={{ width: '100%', marginBottom: 'var(--space-2xl)' }}
        >
          Analyze Setup
        </Button>

        {/* Info Panel */}
        <Panel
          title="How it works"
          defaultOpen={false}
          style={{ marginBottom: 'var(--space-lg)' }}
        >
          <p style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--color-text)',
            lineHeight: 'var(--line-height-relaxed)',
            margin: 0,
          }}>
            Upload a photo of your lighting setup. Our analysis engine will detect your modifiers, lighting patterns, and quality metrics to help you match or improve your setup.
          </p>
        </Panel>
      </div>
    </div>
  );
}
