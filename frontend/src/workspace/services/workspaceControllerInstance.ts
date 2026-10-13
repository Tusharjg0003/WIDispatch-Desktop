// The application's WorkspaceController.
//
// Wired here rather than in a component so the controller has a lifetime
// independent of React mounting: workspace metadata survives navigating away
// from the Network Builder and back.

import { WorkspaceController } from "./WorkspaceController.ts";
import { canvasController } from "../../canvas/controller/CanvasController.ts";
import { createCanvasRepository, scopeRepositoryToWorkspace } from "../../canvas/persistence/CanvasRepository.ts";
import { isWindowFor, thisTabWindow } from "../../windows/tabWindows.ts";
import { fetchNetwork } from "../../api/networks.js";

// In a window holding one Network Builder tab, recovery covers only that tab.
const repository =
  isWindowFor("workspace") && thisTabWindow
    ? scopeRepositoryToWorkspace(createCanvasRepository(), thisTabWindow.key)
    : createCanvasRepository();

export const workspaceController = new WorkspaceController({
  canvas: canvasController,
  repository,
  fetchNetwork: (networkId: string) => fetchNetwork(networkId),
});
