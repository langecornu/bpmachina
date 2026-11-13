// Catches a crash in part of the screen and shows a friendly message with a way to recover, so one broken view does not
// blank the whole app. React only supports this through a class component, which is the single exception to the
// "function components only" rule (Standards 2.1).
import { Component } from 'react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // The browser console is the only sink on the client; the stack helps whoever reports the problem.
    console.error(`[${this.props.label ?? 'app'}] render error`, error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }
    return (
      <div className="error-banner" role="alert">
        <p>
          Something went wrong{this.props.label ? ` in ${this.props.label}` : ''}. Your song is safe; nothing was
          changed.
        </p>
        <button type="button" className="btn" onClick={() => this.setState({ hasError: false })}>
          Try again
        </button>
      </div>
    );
  }
}
