// The application's WorkspaceController.
//
// Wired here rather than in a component so the controller has a lifetime
// independent of React mounting: workspace metadata survives navigating away
// from the Network Builder and back.

import { WorkspaceController } from "./WorkspaceController.ts";
import { canvasController } from "../../canvas/controller/CanvasController.ts";
import { createCanvasRepository } from "../../canvas/persistence/CanvasRepository.ts";
import { fetchNetwork } from "../../api/networks.js";

export const workspaceController = new WorkspaceController({
  canvas: canvasController,
  repository: createCanvasRepository(),
  fetchNetwork: (networkId: string) => fetchNetwork(networkId),
});
