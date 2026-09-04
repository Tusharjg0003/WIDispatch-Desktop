// Zod schemas guarding the IndexedDB read boundary.
//
// These run on exactly one path: CanvasRepository.loadAll(). Data written by
// this application is trusted on the way in; data read back may have been
// written by an older schema version, so it is validated on the way out.

import { z } from "zod";

export const ViewportSchema = z.object({
  zoom: z.number().finite(),
  pan: z.object({ x: z.number().finite(), y: z.number().finite() }),
});

/**
 * Cytoscape element JSON is deliberately loose: `data.id` is the only field
 * this system depends on, and element data carries arbitrary domain fields
 * that must survive a round trip. A strict schema would reject valid graphs
 * every time a new domain field is added.
 */
export const CyElementSchema = z
  .object({
    group: z.enum(["nodes", "edges"]).optional(),
    data: z.object({ id: z.string() }).passthrough(),
    position: z
      .object({ x: z.number().finite(), y: z.number().finite() })
      .optional(),
    classes: z.string().optional(),
  })
  .passthrough();

export const CanvasSnapshotSchema = z.object({
  version: z.number().int().positive(),
  elements: z.array(CyElementSchema),
  viewport: ViewportSchema.nullable(),
});

export const ViewTogglesSchema = z.object({
  showLabels: z.boolean(),
  showGrid: z.boolean(),
  snapToGrid: z.boolean(),
  showLibrary: z.boolean(),
  canvasFocusMode: z.boolean(),
  hiddenAssetTypes: z.array(z.string()),
});

export const InspectorTabSchema = z.enum([
  "details",
  "issues",
  "trace",
  "isolation",
]);

export const IssuePanelModeSchema = z.enum(["issues", "find"]);

export const WorkspaceUiStateSchema = z.object({
  inspectorOpen: z.boolean(),
  inspectorTab: InspectorTabSchema,
  issuePanelMode: IssuePanelModeSchema,
  viewport: ViewportSchema.nullable(),
  selectedElementIds: z.array(z.string()),
  view: ViewTogglesSchema,
});

export const WorkspaceInstanceSchema = z.object({
  id: z.string().min(1),
  type: z.literal("network-simulation"),
  dirty: z.boolean(),
  pinned: z.boolean(),
  loadError: z.boolean(),
  document: z.object({
    networkId: z.string().nullable(),
    name: z.string(),
    description: z.string(),
  }),
  ui: WorkspaceUiStateSchema,
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const WorkspaceRecoveryRecordSchema = z.object({
  workspaceId: z.string().min(1),
  workspace: WorkspaceInstanceSchema,
  snapshot: CanvasSnapshotSchema,
  updatedAt: z.number(),
});

export const SessionRecordSchema = z.object({
  key: z.literal("current"),
  activeWorkspaceId: z.string().nullable(),
  order: z.array(z.string()),
});
