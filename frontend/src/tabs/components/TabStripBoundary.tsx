import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
}

/**
 * A crash in the tab bar must not take the canvas down with it: losing the
 * ability to switch workspaces is far better than losing the graph on screen.
 */
export default class TabStripBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[tabs] strip render failed", error, info);
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="tab-strip tab-strip--failed">
          Tabs failed to render. Your content is unaffected; reload to restore
          the tab bar.
        </div>
      );
    }
    return this.props.children;
  }
}
