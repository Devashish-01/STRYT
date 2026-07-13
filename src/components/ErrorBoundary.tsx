import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
  message?: string;
}

// Top-level safety net. With real data a single unexpected null can throw
// during render; without this the whole app white-screens.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, message: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(error: unknown) {
    // Hook for Sentry/PostHog later.
    console.error("Uncaught render error:", error);
  }

  reset = () => {
    this.setState({ hasError: false, message: undefined });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="col center" style={{ minHeight: "100vh", padding: 28, textAlign: "center", gap: 12 }}>
          <div style={{ fontSize: 54 }}>😵</div>
          <h2 className="h2">Something broke</h2>
          <p className="muted small" style={{ maxWidth: 300, lineHeight: 1.5 }}>
            An unexpected error stopped this screen. You can reload and keep going.
          </p>
          <button
            className="btn btn-primary"
            style={{ marginTop: 8 }}
            onClick={() => {
              this.reset();
              window.location.assign("/home");
            }}
          >
            Reload app
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
