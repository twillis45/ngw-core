import { Component } from 'react';
import * as Sentry from '@sentry/react';

/**
 * Top-level error boundary.
 *
 * Catches unhandled render errors and shows a plain recovery UI instead of a
 * blank screen.  Wrap <App /> (or any sub-tree) with this component.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Surface in console so Render / Vercel logs capture it
    console.error('[NGW ErrorBoundary]', error, info?.componentStack);
    // Report to Sentry with component stack context
    Sentry.captureException(error, { contexts: { react: { componentStack: info?.componentStack } } });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const msg = this.state.error?.message || 'An unexpected error occurred.';

    return (
      <div className="error-boundary">
        <div className="error-boundary__card">
          <h2 className="error-boundary__title">Something went wrong</h2>
          <p className="error-boundary__message">{msg}</p>
          <div className="error-boundary__actions">
            <button className="error-boundary__btn" onClick={this.handleReset}>
              Try again
            </button>
            <button
              className="error-boundary__btn error-boundary__btn--secondary"
              onClick={() => window.location.reload()}
            >
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
