import React from "react";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, resetKey: 0 };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error("DIALLED IN crash:", error, info);
  }
  handleReset() {
    // Increment resetKey to force full unmount+remount of children — simple setState(false)
    // re-renders the same crashed tree and crashes again immediately.
    this.setState(s => ({ hasError: false, error: null, resetKey: s.resetKey + 1 }));
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", height: "100vh", padding: 32,
          background: "#0a0a0a", color: "#ffffff", fontFamily: "system-ui",
          gap: 16, textAlign: "center"
        }}>
          <div style={{ fontSize: 48 }}>⚠️</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Something went wrong</div>
          <div style={{ fontSize: 14, color: "#888", maxWidth: 280 }}>
            {this.state.error?.message || "An unexpected error occurred"}
          </div>
          <button
            onClick={() => this.handleReset()}
            style={{
              marginTop: 8, padding: "12px 24px", borderRadius: 12,
              background: "#c6f135", color: "#0a0a0a",
              border: "none", fontSize: 15, fontWeight: 700, cursor: "pointer"
            }}
          >
            Try Again
          </button>
          <button
            onClick={async () => {
              try {
                const keys = await window.storage.list();
                await Promise.all(keys.map(k => window.storage.delete(k)));
              } catch(_e) {
                localStorage.clear();
              }
              window.location.reload();
            }}
            style={{
              padding: "10px 20px", borderRadius: 12, background: "transparent",
              color: "#666", border: "1px solid #333", fontSize: 13, cursor: "pointer"
            }}
          >
            Reset App
          </button>
        </div>
      );
    }
    return (
      <React.Fragment key={this.state.resetKey}>
        {this.props.children}
      </React.Fragment>
    );
  }
}

