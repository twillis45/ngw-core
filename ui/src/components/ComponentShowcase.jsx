import { Button, Card, Badge, Panel } from './shared';

export default function ComponentShowcase() {
  return (
    <div style={{ padding: 'var(--space-xl)', backgroundColor: 'var(--color-bg)' }}>
      <h1 style={{ color: 'var(--color-text)', marginBottom: 'var(--space-lg)' }}>Component Showcase</h1>

      <div style={{ marginBottom: 'var(--space-2xl)' }}>
        <h2 style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-md)' }}>Buttons</h2>
        <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
          <Button variant="primary" size="sm">Small Primary</Button>
          <Button variant="primary" size="md">Medium Primary</Button>
          <Button variant="primary" size="lg">Large Primary</Button>
          <Button variant="secondary" size="md">Secondary</Button>
          <Button variant="ghost" size="md">Ghost</Button>
          <Button disabled size="md">Disabled</Button>
        </div>
      </div>

      <div style={{ marginBottom: 'var(--space-2xl)' }}>
        <h2 style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-md)' }}>Cards</h2>
        <Card style={{ padding: 'var(--space-lg)', maxWidth: '300px' }}>
          <p style={{ color: 'var(--color-text)' }}>This is a card component with shadow and rounded corners.</p>
        </Card>
      </div>

      <div style={{ marginBottom: 'var(--space-2xl)' }}>
        <h2 style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-md)' }}>Badges</h2>
        <div style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
          <Badge variant="default" size="sm">Default</Badge>
          <Badge variant="success" size="sm">High Confidence</Badge>
          <Badge variant="warning" size="sm">Low Confidence</Badge>
        </div>
      </div>

      <div style={{ marginBottom: 'var(--space-2xl)' }}>
        <h2 style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 'var(--space-md)' }}>Panels</h2>
        <Panel title="Collapsible Panel (Default Open)" defaultOpen={true} style={{ maxWidth: '400px' }}>
          <p style={{ color: 'var(--color-text)', margin: 0 }}>This panel content is visible by default.</p>
        </Panel>
        <div style={{ marginTop: 'var(--space-md)' }}>
          <Panel title="Collapsible Panel (Default Closed)" defaultOpen={false} style={{ maxWidth: '400px' }}>
            <p style={{ color: 'var(--color-text)', margin: 0 }}>This panel content is hidden by default.</p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
