import React from "react";
import NetworkCanvasWorkspace from "../networkCanvas/NetworkCanvasWorkspace";

// Standalone host for the WIPlan-style canvas: workspace tabs, saved-networks
// rail and URL deep links all live inside the workspace in "builder" mode.
export default function NetworkBuilderPage() {
  return <NetworkCanvasWorkspace workspaceMode="builder" />;
}
