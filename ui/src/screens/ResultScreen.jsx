import { Button, Card, Badge, Panel } from '../components/shared';

export default function ResultScreen({ confidence = 'high', imageFile, onSetup, onRetry }) {
  const isHighConfidence = confidence === 'high';

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
            Analysis Complete
          </h1>
          <p style={{
            fontSize: 'var(--text-base)',
            color: 'var(--color-text-secondary)',
            margin: 0,
          }}>
            {isHighConfidence ? 'High-quality setup detected' : 'Setup review recommended'}
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
                alt="Analysis result"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            )}
          </div>

          {/* Confidence Badge */}
          <div style={{ marginBottom: 'var(--space-lg)' }}>
            <Badge
              variant={isHighConfidence ? 'success' : 'warning'}
              size="md"
            >
              {isHighConfidence ? '✓ High Confidence' : '⚠ Low Confidence'}
            </Badge>
          </div>

          {/* Results Summary */}
          <div style={{
            backgroundColor: 'var(--color-bg)',
            padding: 'var(--space-md)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 'var(--space-lg)',
            textAlign: 'left',
          }}>
            <h3 style={{
              fontSize: 'var(--text-sm)',
              fontWeight: 600,
              color: 'var(--color-text)',
              margin: 0,
              marginBottom: 'var(--space-sm)',
            }}>
              Detected Elements
            </h3>
            <ul style={{
              margin: 0,
              paddingLeft: '1.5em',
              fontSize: 'var(--text-sm)',
              color: 'var(--color-text-secondary)',
              lineHeight: 'var(--line-height-relaxed)',
            }}>
              <li>Primary modifier: Octabox 3ft</li>
              <li>Fill light: Gold reflector</li>
              <li>Catchlight pattern: Symmetric</li>
              {!isHighConfidence && <li>⚠ Shadow visibility: Low</li>}
            </ul>
          </div>
        </Card>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-2xl)' }}>
          <Button
            variant="secondary"
            size="lg"
            onClick={onRetry}
            style={{ flex: 1 }}
          >
            Retry
          </Button>
          <Button
            variant="primary"
            size="lg"
            onClick={onSetup}
            style={{ flex: 1 }}
          >
            {isHighConfidence ? 'Save Setup' : 'Adjust & Retry'}
          </Button>
        </div>

        {/* Info Panel */}
        <Panel
          title={isHighConfidence ? 'Setup matches reference' : 'Recommendations'}
          defaultOpen={true}
          style={{ marginBottom: 'var(--space-lg)' }}
        >
          <p style={{
            fontSize: 'var(--text-sm)',
            color: 'var(--color-text)',
            lineHeight: 'var(--line-height-relaxed)',
            margin: 0,
          }}>
            {isHighConfidence
              ? 'Your lighting setup matches professional standards. Position, intensity, and catchlights are all within optimal ranges.'
              : 'Consider adjusting your main light position or fill light ratio. The analysis detected subtle inconsistencies that could improve results.'}
          </p>
        </Panel>
      </div>
    </div>
  );
}
