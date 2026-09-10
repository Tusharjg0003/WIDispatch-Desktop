import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("WIDispatch interface error", error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main className="route-failure" role="alert">
        <div className="route-failure__mark">!</div>
        <p className="route-failure__eyebrow">Workspace interrupted</p>
        <h1>This view could not be displayed</h1>
        <p>The rest of WIDispatch is still available. Reload this view or return to Operations.</p>
        <div className="route-failure__actions">
          <button type="button" onClick={() => window.location.reload()}>Reload view</button>
          <a href="/">Go to Operations</a>
        </div>
      </main>
    );
  }
}

