# Network Canvas Workspace — Greenfield Build Specification

## Purpose

Build a production-ready, multi-document engineering canvas application from scratch.

The application must support three independent tab systems:

1. Workspace Tabs — multiple open simulation/canvas instances, each preserving its own document and UI state.
2. Ribbon Tabs — Home / Insert / Edit / View / Tools toolbar categories.
3. Inspector Tabs — Details / Find / Isolation / Assets / Validation / Config / Results / Issues.

These are separate systems and must never share one generic `activeTab` state.

The architecture must be designed for future features such as:

- multiple open simulations
- autosave
- crash recovery
- undo / redo
- simulation execution
- validation
- command palette
- keyboard shortcuts
- resizable panels
- tab reordering
- canvas interaction modes
- large Cytoscape networks
- persistent workspace state
- backend integration
- future collaboration

---

# 1. Recommended Technology Stack

Use:

- React
- TypeScript
- Vite or the existing preferred React build tool
- Cytoscape.js
- Zustand
- Immer
- XState v5
- @xstate/react
- Radix UI Tabs
- Dexie
- IndexedDB
- Zod
- TanStack Query
- react-resizable-panels
- dnd-kit

Optional:

- cytoscape-edgehandles if it improves pipe/edge creation UX
- React Hook Form for complex inspector/config forms
- zundo only for small Zustand-based temporal state; do not use it for the main Cytoscape document history

Do not introduce Redux unless another major part of the application already depends on Redux.

Suggested install command:

```bash
npm install \
  cytoscape \
  zustand \
  immer \
  xstate \
  @xstate/react \
  @radix-ui/react-tabs \
  dexie \
  dexie-react-hooks \
  zod \
  @tanstack/react-query \
  react-resizable-panels \
  @dnd-kit/core \
  @dnd-kit/sortable \
  @dnd-kit/utilities
```

---

# 2. Core Architectural Rules

## Rule A — Cytoscape owns the live graph

Do not continuously duplicate the entire Cytoscape graph inside Zustand.

During an open workspace:

```text
Cytoscape = authoritative live graph
```

Zustand should store only application/workspace metadata.

Dexie/IndexedDB should store persisted snapshots.

---

## Rule B — Separate state into three categories

### Document State

Data that belongs to the simulation itself.

Examples:

- nodes
- edges
- node positions
- edge bends
- asset values
- simulation configuration
- hydraulic/network configuration
- document metadata

### Workspace/UI State

Data that belongs to how a user is currently viewing the document.

Examples:

- zoom
- pan
- selected element
- inspector open/closed
- inspector active tab
- inspector width
- ribbon active tab
- collapsed sections

### Runtime Interaction State

Temporary state that should normally not be persisted.

Examples:

- insert node mode
- insert pipe mode
- current pipe source
- edge preview
- dragging
- hover
- temporary context menu
- current interaction state
- temporary selection box

---

## Rule C — Explicit commands instead of scattered setters

Avoid components doing this repeatedly:

```ts
setShowRightPanel(true);
setRightPanelTab('assets');
```

Prefer:

```ts
commands.openInspector('assets');
```

The same command should be reusable from:

- toolbar
- keyboard shortcut
- context menu
- command palette
- canvas selection
- inspector actions

---

## Rule D — Workspace switching is an explicit transaction

Do not make workspace switching depend primarily on one large `useEffect` watching `activeInstanceId`.

The switch operation should be controlled:

```text
request workspace switch
        ↓
flush outgoing document changes
        ↓
persist outgoing viewport/UI state
        ↓
save recovery snapshot
        ↓
cancel unsafe canvas interaction
        ↓
change active workspace ID
        ↓
load incoming snapshot
        ↓
hydrate Cytoscape
        ↓
restore viewport
        ↓
restore inspector/UI state
        ↓
finish
```

---

# 3. Target Project Structure

Use a feature-oriented architecture.

```text
src/
│
├── app/
│   ├── App.tsx
│   ├── providers/
│   │   ├── QueryProvider.tsx
│   │   └── AppProviders.tsx
│   └── routes/
│
├── workspace/
│   ├── components/
│   │   ├── WorkspaceTabs.tsx
│   │   ├── WorkspaceTab.tsx
│   │   └── WorkspaceTabContextMenu.tsx
│   │
│   ├── store/
│   │   └── workspaceStore.ts
│   │
│   ├── services/
│   │   └── WorkspaceController.ts
│   │
│   ├── types/
│   │   └── workspace.types.ts
│   │
│   └── index.ts
│
├── canvas/
│   ├── components/
│   │   └── NetworkCanvas.tsx
│   │
│   ├── controller/
│   │   └── CanvasController.ts
│   │
│   ├── interaction/
│   │   ├── canvasMachine.ts
│   │   ├── canvasActor.ts
│   │   └── interaction.types.ts
│   │
│   ├── events/
│   │   └── CanvasEvents.ts
│   │
│   ├── commands/
│   │   ├── CanvasCommand.ts
│   │   ├── CanvasCommandHistory.ts
│   │   ├── AddNodeCommand.ts
│   │   ├── DeleteElementCommand.ts
│   │   ├── MoveNodeCommand.ts
│   │   └── AddEdgeCommand.ts
│   │
│   ├── persistence/
│   │   ├── CanvasRepository.ts
│   │   ├── canvasDb.ts
│   │   └── canvasSnapshot.types.ts
│   │
│   ├── hydration/
│   │   └── hydrateCyNodeCards.ts
│   │
│   └── types/
│       └── canvas.types.ts
│
├── ribbon/
│   ├── components/
│   │   ├── Ribbon.tsx
│   │   ├── RibbonTabs.tsx
│   │   ├── RibbonGroup.tsx
│   │   └── RibbonButton.tsx
│   │
│   ├── config/
│   │   └── ribbon.config.ts
│   │
│   ├── store/
│   │   └── ribbonStore.ts
│   │
│   └── types/
│       └── ribbon.types.ts
│
├── inspector/
│   ├── components/
│   │   ├── Inspector.tsx
│   │   ├── InspectorTabs.tsx
│   │   └── panels/
│   │       ├── DetailsPanel.tsx
│   │       ├── FindPanel.tsx
│   │       ├── IsolationPanel.tsx
│   │       ├── AssetsPanel.tsx
│   │       ├── ValidationPanel.tsx
│   │       ├── ConfigPanel.tsx
│   │       ├── ResultsPanel.tsx
│   │       └── IssuesPanel.tsx
│   │
│   ├── store/
│   │   └── inspectorStore.ts
│   │
│   └── types/
│       └── inspector.types.ts
│
├── issues/
│   ├── components/
│   │   ├── IssuesView.tsx
│   │   └── IssueFindView.tsx
│   │
│   └── store/
│       └── issuesStore.ts
│
├── commands/
│   ├── commandRegistry.ts
│   ├── commandBus.ts
│   ├── commands.ts
│   └── command.types.ts
│
├── selection/
│   └── store/
│       └── selectionStore.ts
│
├── simulation/
│   ├── api/
│   │   └── simulationApi.ts
│   ├── hooks/
│   │   └── useRunSimulation.ts
│   ├── schemas/
│   │   └── simulation.schemas.ts
│   └── types/
│       └── simulation.types.ts
│
├── assets/
│   ├── schemas/
│   │   └── asset.schemas.ts
│   └── types/
│       └── asset.types.ts
│
├── shortcuts/
│   ├── keyboardManager.ts
│   └── shortcut.config.ts
│
├── components/
│   ├── CommandPalette/
│   ├── ContextMenu/
│   └── common/
│
└── styles/
```

---

# 4. Workspace Tab System

Workspace Tabs represent open canvas/document instances.

Example:

```text
Network A | Network B* | Network C | +
```

The active workspace must preserve:

- Cytoscape graph
- node positions
- bends
- zoom
- pan
- selected configuration
- simulation results reference
- validation state reference
- dirty status
- inspector state
- unsaved recovery snapshot

Use Zustand for workspace metadata.

Suggested type:

```ts
export interface WorkspaceInstance {
  id: string;
  type: 'network-simulation';
  title: string;

  dirty: boolean;
  pinned: boolean;

  document: {
    snapshotId?: string;
    selectedConfigId?: string;
    simulationResultId?: string;
  };

  ui: {
    inspectorOpen: boolean;
    inspectorTab: InspectorTab;
    inspectorWidth: number;

    ribbonTab: RibbonTab;

    viewport?: {
      zoom: number;
      pan: {
        x: number;
        y: number;
      };
    };

    selectedElementId?: string | null;
  };
}
```

Suggested Zustand store:

```ts
interface WorkspaceStore {
  activeInstanceId: string | null;

  instances: Record<string, WorkspaceInstance>;
  order: string[];

  createWorkspace(): string;
  openWorkspace(workspace: WorkspaceInstance): void;

  requestActivateWorkspace(id: string): Promise<void>;

  closeWorkspace(id: string): Promise<void>;
  closeOtherWorkspaces(id: string): Promise<void>;
  closeWorkspacesToRight(id: string): Promise<void>;

  renameWorkspace(id: string, name: string): void;
  duplicateWorkspace(id: string): Promise<string>;

  reorderWorkspaces(from: number, to: number): void;

  markDirty(id: string): void;
  markSaved(id: string): void;

  updateWorkspaceUI(
    id: string,
    patch: Partial<WorkspaceInstance['ui']>
  ): void;
}
```

---

# 5. Workspace Tab Features

Implement:

- create new workspace
- activate workspace
- close workspace
- duplicate workspace
- rename workspace
- close others
- close tabs to the right
- pin tab
- drag reorder
- unsaved/dirty indicator
- simulation status indicator
- validation error indicator
- reopen recently closed tab
- keyboard cycling

Suggested shortcuts:

```text
Ctrl/Cmd + W        close tab
Ctrl/Cmd + Tab      next tab
Ctrl/Cmd + Shift+Tab previous tab
Ctrl/Cmd + Shift+T  reopen closed tab
```

Use dnd-kit for reorder.

---

# 6. Workspace Switching Controller

Create:

```text
WorkspaceController
```

It coordinates:

- CanvasController
- CanvasRepository
- workspace store
- inspector store
- interaction machine
- selection store

Pseudo-code:

```ts
class WorkspaceController {
  async activate(nextId: string) {
    const state = workspaceStore.getState();
    const previousId = state.activeInstanceId;

    if (previousId === nextId) return;

    if (previousId) {
      await this.flushWorkspace(previousId);
    }

    canvasActor.send({ type: 'RESET' });

    selectionStore.getState().clearSelection();

    workspaceStore.setState({
      activeInstanceId: nextId,
    });

    const snapshot =
      await canvasRepository.loadSnapshot(nextId);

    canvasController.restore(snapshot);

    const nextWorkspace =
      workspaceStore.getState().instances[nextId];

    if (nextWorkspace?.ui.viewport) {
      canvasController.restoreViewport(
        nextWorkspace.ui.viewport
      );
    }

    inspectorStore.getState().restoreFromWorkspace(
      nextWorkspace
    );
  }
}
```

Do not make React effects responsible for the entire switch transaction.

---

# 7. Cytoscape Controller

Create a CanvasController wrapper around Cytoscape.

Responsibilities:

```text
create
destroy
load document
clear document
restore snapshot
capture snapshot
fit
zoom
pan
select
unselect
add node
remove node
add edge
remove edge
update element
batch mutations
register events
```

Example interface:

```ts
export interface CanvasController {
  initialize(container: HTMLElement): void;
  destroy(): void;

  getCy(): cytoscape.Core;

  captureSnapshot(): CanvasSnapshot;
  restore(snapshot: CanvasSnapshot): void;

  getViewport(): CanvasViewport;
  restoreViewport(viewport: CanvasViewport): void;

  clear(): void;

  selectElement(id: string): void;

  runBatch(action: () => void): void;
}
```

When restoring a large graph:

```ts
cy.batch(() => {
  cy.elements().remove();
  cy.json(snapshot.cyJson);
  hydrateCyNodeCards(cy);
});
```

---

# 8. Canvas Interaction State Machine

Use XState v5 only for interaction behavior.

Do not use XState for simple Ribbon or Inspector tabs.

Main states:

```text
default
selecting
insertingNode
insertingEdge
moving
isolation
panning
```

Suggested machine:

```ts
const canvasMachine = setup({
  types: {
    events: {} as CanvasEvent,
  },
}).createMachine({
  id: 'canvasInteraction',

  initial: 'default',

  states: {
    default: {
      on: {
        INSERT_NODE: 'insertingNode',
        INSERT_EDGE: 'insertingEdge',
        ENTER_ISOLATION: 'isolation',
      },
    },

    insertingNode: {
      on: {
        PLACE_NODE: 'default',
        CANCEL: 'default',
        OPEN_PANEL: 'default',
        SWITCH_WORKSPACE: 'default',
      },
    },

    insertingEdge: {
      initial: 'selectSource',

      states: {
        selectSource: {
          on: {
            SOURCE_SELECTED: 'selectTarget',
            CANCEL: '#canvasInteraction.default',
          },
        },

        selectTarget: {
          on: {
            TARGET_SELECTED: '#canvasInteraction.default',
            CANCEL: '#canvasInteraction.default',
          },
        },
      },

      on: {
        OPEN_PANEL: '#canvasInteraction.default',
        SWITCH_WORKSPACE: '#canvasInteraction.default',
      },
    },

    isolation: {
      on: {
        EXIT_ISOLATION: 'default',
        SWITCH_WORKSPACE: 'default',
      },
    },
  },

  on: {
    RESET: '.default',
  },
});
```

The machine should own temporary interaction state such as:

```text
source node
temporary insertion point
edge preview state
unsafe mode
```

Remove ad-hoc mode refs wherever possible.

---

# 9. Ribbon / Toolbar Tabs

Use Radix UI Tabs.

Tabs:

```ts
type RibbonTab =
  | 'home'
  | 'insert'
  | 'edit'
  | 'view'
  | 'tools';
```

Keep Ribbon state independent from the workspace tabs and inspector tabs.

Create declarative configuration:

```ts
export const ribbonConfig = {
  tabs: [
    { id: 'home', label: 'Home' },
    { id: 'insert', label: 'Insert' },
    { id: 'edit', label: 'Edit' },
    { id: 'view', label: 'View' },
    { id: 'tools', label: 'Tools' },
  ],

  groups: [
    {
      id: 'file',
      label: 'File',
      tab: 'home',

      buttons: [
        {
          id: 'save',
          label: 'Save',
          commandId: 'file.save',
        },
        {
          id: 'save-as',
          label: 'Save As',
          commandId: 'file.saveAs',
        },
      ],
    },
  ],
};
```

The renderer should:

1. read the active Ribbon tab
2. filter groups
3. render buttons
4. execute commands through CommandBus

Do not embed business logic directly in Ribbon components.

---

# 10. Inspector / Right Sidebar

Use Radix Tabs inside a resizable panel.

Tabs:

```ts
type InspectorTab =
  | 'details'
  | 'find'
  | 'isolation'
  | 'assets'
  | 'validation'
  | 'config'
  | 'results'
  | 'issues';
```

Suggested state:

```ts
interface InspectorStore {
  open: boolean;
  activeTab: InspectorTab;
  width: number;

  openInspector(tab?: InspectorTab): void;
  closeInspector(): void;
  setActiveTab(tab: InspectorTab): void;
  setWidth(width: number): void;
}
```

Use `react-resizable-panels`.

Persist inspector width per workspace.

---

# 11. Element Selection Behavior

When a single element is selected:

```text
Cytoscape selection event
        ↓
selection command
        ↓
selection store updated
        ↓
Inspector opens
        ↓
Inspector tab = Details
```

Implement:

```ts
commands.selectElement(elementId);
```

Do not directly call multiple setters from the Cytoscape event callback.

Example event bridge:

```ts
cy.on('select', 'node, edge', event => {
  commands.selectElement(event.target.id());
});
```

When selection becomes empty or multiple selection is used, handle according to product requirements.

---

# 12. Command Layer

Create a centralized command system.

Example commands:

```text
file.new
file.open
file.save
file.saveAs

workspace.close
workspace.duplicate
workspace.rename

canvas.insertNode
canvas.insertEdge
canvas.deleteSelection
canvas.fit
canvas.zoomIn
canvas.zoomOut

edit.undo
edit.redo
edit.copy
edit.paste

inspector.open.details
inspector.open.assets
inspector.open.validation
inspector.open.results

simulation.run
simulation.cancel
```

Suggested interface:

```ts
interface AppCommand {
  id: string;
  label: string;

  execute(context?: unknown): void | Promise<void>;

  canExecute?(): boolean;

  isActive?(): boolean;
}
```

Create:

```ts
commandBus.execute('canvas.insertNode');
```

Toolbar, keyboard shortcuts, context menu and command palette must all reuse these commands.

---

# 13. Issues Sub-Tab

Keep Issues/Find as a separate mini state.

Do not merge it with the main inspector tabs.

Example:

```ts
type IssuePanelMode =
  | 'issues'
  | 'find';
```

State:

```ts
interface IssuesStore {
  mode: IssuePanelMode;
  setMode(mode: IssuePanelMode): void;
}
```

Behavior:

```text
Inspector tab = Issues
        ↓
IssuesPanel
        ↓
Issues | Find
```

---

# 14. Local Persistence / Dexie

Create a local IndexedDB repository.

Tables:

```text
workspaceSnapshots
workspaceRecovery
recentDocuments
userPreferences
```

Example:

```ts
interface CanvasSnapshot {
  workspaceId: string;

  version: number;

  cyJson: unknown;

  viewport: {
    zoom: number;
    pan: {
      x: number;
      y: number;
    };
  };

  selectedConfigId?: string;

  updatedAt: number;
}
```

Dexie schema example:

```ts
class CanvasDatabase extends Dexie {
  snapshots!: Table<CanvasSnapshot>;

  constructor() {
    super('NetworkCanvasApp');

    this.version(1).stores({
      snapshots: 'workspaceId, updatedAt',
    });
  }
}
```

---

# 15. Autosave / Recovery

Implement recovery snapshots.

Behavior:

```text
Canvas mutation
        ↓
mark workspace dirty
        ↓
debounce
        ↓
write recovery snapshot to IndexedDB
```

Recommended debounce:

```text
500–1000 ms
```

This is recovery/autosave state, not necessarily the official server save.

`Ctrl/Cmd + S` should:

```text
validate document
        ↓
save official document
        ↓
update persisted snapshot
        ↓
dirty = false
```

---

# 16. Undo / Redo

For the Cytoscape graph, implement command-based history.

Do not snapshot the entire graph on every small interaction.

Interface:

```ts
interface CanvasCommand {
  execute(): void;
  undo(): void;
  redo?(): void;
}
```

Commands:

```text
AddNodeCommand
DeleteNodeCommand
MoveNodeCommand
UpdateNodeCommand
AddEdgeCommand
DeleteEdgeCommand
ChangeEdgeBendCommand
PasteElementsCommand
UpdateAssetCommand
```

History:

```ts
class CanvasCommandHistory {
  execute(command: CanvasCommand): void;

  undo(): void;

  redo(): void;

  clear(): void;

  canUndo(): boolean;

  canRedo(): boolean;
}
```

Clear or swap history appropriately when changing documents unless history is intentionally persisted per workspace.

---

# 17. Validation Using Zod

Use Zod for runtime validation.

Examples:

```ts
const PumpSchema = z.object({
  id: z.string(),
  name: z.string(),

  flowRate: z.number().min(0),
  pressure: z.number().min(0),

  efficiency: z.number()
    .min(0)
    .max(1),
});
```

Create schemas for:

- node types
- asset types
- pipe types
- simulation config
- saved document
- imported document
- backend responses

Never blindly trust data loaded from:

```text
backend
IndexedDB
file import
clipboard
legacy documents
```

---

# 18. Simulation API State

Use TanStack Query for backend/server state.

Zustand should not become a cache for remote simulation APIs.

Use:

```text
Zustand
→ application/UI/workspace state

TanStack Query
→ backend simulation/query state
```

Use mutation for starting a simulation.

Example:

```ts
const runSimulationMutation = useMutation({
  mutationFn: runSimulation,

  onSuccess: result => {
    workspaceStore
      .getState()
      .attachSimulationResult(
        workspaceId,
        result.id
      );
  },
});
```

Workspace tab may show:

```text
idle
running
complete
failed
```

---

# 19. Workspace Tab UX

Show useful status without making tabs visually noisy.

Example:

```text
Network A
Network B *
Network C  ●
```

Possible indicators:

```text
* unsaved
● simulation running
! validation issue
✓ complete
```

Context menu:

```text
Rename
Duplicate
Save
Save As

Close
Close Others
Close Tabs to Right

Pin
```

---

# 20. Resizable Layout

Recommended desktop layout:

```text
┌──────────────────────────────────────────────────────────────┐
│ Workspace Tabs                                               │
├──────────────────────────────────────────────────────────────┤
│ Ribbon                                                       │
├──────────────────────────────────────────┬───────────────────┤
│                                          │                   │
│                                          │ Inspector         │
│              Cytoscape                   │                   │
│                                          │ Details           │
│                                          │ Assets            │
│                                          │ Config            │
│                                          │ Results           │
│                                          │                   │
├──────────────────────────────────────────┴───────────────────┤
│ Status Bar                                                   │
└──────────────────────────────────────────────────────────────┘
```

Inspector width must be resizable and persisted.

---

# 21. Keyboard Shortcuts

Create a centralized shortcut registry.

Suggested defaults:

```text
Ctrl/Cmd + S          Save
Ctrl/Cmd + Shift + S  Save As

Ctrl/Cmd + Z          Undo
Ctrl/Cmd + Shift + Z  Redo

Delete                Delete selection

Escape                Cancel current interaction

Ctrl/Cmd + Tab        Next workspace
Ctrl/Cmd + Shift+Tab  Previous workspace

Ctrl/Cmd + W          Close workspace

F                      Fit graph
```

Do not attach duplicate event listeners from multiple components.

Use one keyboard manager.

---

# 22. Selection Store

Keep selected element identity outside large React objects.

Prefer:

```ts
interface SelectionStore {
  selectedElementIds: string[];

  setSelection(ids: string[]): void;

  clearSelection(): void;
}
```

When rendering Details:

```text
selected ID
    ↓
retrieve current data from Cytoscape
```

Avoid keeping stale copies of full Cytoscape element data in React state unless needed for form editing.

---

# 23. Dirty State

Dirty state should be triggered by document changes, not UI changes.

Document mutation:

```text
move node
change asset
add pipe
delete node
change config
```

→ `dirty = true`

UI mutation:

```text
resize inspector
change ribbon tab
zoom
pan
```

should generally not mark the simulation document dirty unless your product explicitly stores that UI state as part of the saved document.

---

# 24. Error Boundaries

Use React error boundaries around major surfaces:

```text
Canvas
Inspector
Simulation Results
```

A panel crash should not destroy the entire workspace.

---

# 25. Performance Rules

For large graphs:

- use Cytoscape batching
- avoid serializing the graph on every render
- debounce recovery snapshots
- use Zustand selectors
- avoid subscribing whole components to full stores
- memoize Ribbon group rendering
- lazy-load heavy Inspector panels
- virtualize very large tables
- avoid storing the Cytoscape instance in Zustand
- avoid duplicating the whole graph into React state

---

# 26. Required First Milestone

Milestone 1 must produce a working application with:

### Workspace

- open 3 canvas tabs
- create new tab
- switch tabs
- close tab
- rename tab
- duplicate tab
- reorder tabs
- dirty indicator

### Canvas

- independent Cytoscape graph per workspace
- add node
- add edge
- select node
- select edge
- move node
- preserve node position

### Ribbon

- Home
- Insert
- Edit
- View
- Tools

with filtered Ribbon groups.

### Inspector

- Details
- Find
- Isolation
- Assets
- Validation
- Config
- Results
- Issues

### Selection

Selecting one node/edge automatically:

```text
opens Inspector
→ Details tab
```

### Persistence

Switching workspace:

```text
preserves outgoing canvas
restores incoming canvas
```

Refresh recovery:

```text
recovers open workspaces from IndexedDB
```

### Interaction Safety

If the user is inserting an edge and:

```text
opens Inspector
switches workspace
presses Escape
```

the unsafe insertion state must cancel correctly.

---

# 27. Required Second Milestone

Add:

- command layer
- keyboard shortcuts
- undo
- redo
- autosave
- crash recovery
- tab context menu
- simulation status
- validation status
- resizable inspector
- reopen closed workspace

---

# 28. Required Third Milestone

Add:

- backend save/load
- TanStack Query simulation execution
- simulation results
- schema validation
- file import/export
- command palette
- advanced Assets editing
- advanced validation
- large-network performance improvements

---

# 29. Testing Requirements

Use automated tests for critical state behavior.

Test:

```text
Workspace switching

A → B:
A state saved
B state loaded

B → A:
B state saved
A restored exactly
```

Test:

```text
Insert Edge
→ open Assets
→ mode = default
→ no preview remains
```

Test:

```text
Select node
→ Inspector open
→ Details active
```

Test:

```text
Select node
→ switch workspace
→ selection does not leak
```

Test:

```text
Modify node
→ dirty true
→ save
→ dirty false
```

Test:

```text
reorder tabs
→ active workspace remains unchanged
```

Test:

```text
close active workspace
→ predictable neighbor becomes active
```

Test recovery from IndexedDB.

---

# 30. Coding Standards

The implementation must:

- use TypeScript strict mode
- avoid `any` unless strongly justified
- use domain-specific type names
- avoid giant page components
- avoid business logic inside toolbar JSX
- avoid scattered Cytoscape event registration
- avoid direct store mutation
- use Zustand selectors
- keep command handlers testable
- keep persistence behind repository interfaces
- keep XState limited to interaction flows
- keep document state separate from UI state

---

# 31. Anti-Patterns to Avoid

Do not create:

```text
CanvasPage.tsx
4000 lines
all state
all events
all toolbar definitions
all dialogs
all canvas logic
all API logic
```

Do not create one store like:

```ts
useAppStore({
  everythingInTheApplication: ...
})
```

Do not store:

```ts
cy: cytoscapeInstance
```

inside Zustand.

Do not have three unrelated systems all using:

```ts
activeTab
```

without namespacing.

Use:

```text
activeWorkspaceId
activeRibbonTab
activeInspectorTab
issuePanelMode
```

Do not trigger workspace transactions purely from React effects.

Do not serialize the entire Cytoscape graph on every pointer movement.

---

# 32. Expected State Model

Final conceptual model:

```text
WorkspaceStore
│
├── activeWorkspaceId
├── workspace metadata
├── order
├── dirty state
└── workspace UI metadata


RibbonStore
│
└── activeRibbonTab


InspectorStore
│
├── open
├── activeInspectorTab
└── width


SelectionStore
│
└── selectedElementIds


CanvasInteractionMachine
│
├── default
├── insertingNode
├── insertingEdge
└── isolation


Cytoscape
│
└── live graph


Dexie
│
└── persisted/recovery snapshots


TanStack Query
│
└── backend/server simulation state
```

---

# 33. Master AI Coding Prompt

Use the following prompt with the coding agent working on the new repository.

---

## PROMPT

You are acting as a senior frontend architect and senior React/TypeScript engineer.

We are building a greenfield engineering network simulation/canvas application.

Do not treat this as a simple web page. Treat it as a multi-document desktop-style engineering workspace similar in interaction complexity to an IDE, CAD editor or network modeling application.

The application uses Cytoscape.js as the canvas engine.

Build the architecture from scratch using:

- React
- TypeScript
- Cytoscape.js
- Zustand
- Immer
- XState v5
- @xstate/react
- Radix UI Tabs
- Dexie/IndexedDB
- Zod
- TanStack Query
- react-resizable-panels
- dnd-kit

The application has FOUR distinct tab/state systems:

1. Workspace Tabs
   - represents separate open simulation/canvas documents
   - each document has independent Cytoscape state
   - each document preserves nodes, edges, positions, bends, config, viewport and unsaved state

2. Ribbon Tabs
   - Home
   - Insert
   - Edit
   - View
   - Tools
   - only filters Ribbon toolbar groups
   - must remain independent of workspace and inspector state

3. Inspector Tabs
   - Details
   - Find
   - Isolation
   - Assets
   - Validation
   - Config
   - Results
   - Issues

4. Issues Sub-Tab
   - Issues
   - Find
   - exists only inside the Inspector Issues panel

Never merge these states.

Use explicit names:

```text
activeWorkspaceId
activeRibbonTab
activeInspectorTab
issuePanelMode
```

Cytoscape must own the authoritative live graph.

Do NOT duplicate the complete Cytoscape graph inside Zustand.

Zustand should contain application/workspace metadata only.

Persist Cytoscape snapshots to IndexedDB through Dexie.

Create a CanvasController that wraps Cytoscape.

Create a WorkspaceController that handles switching workspace instances as a controlled transaction:

```text
flush outgoing workspace
save recovery snapshot
persist viewport/UI
reset unsafe interaction mode
clear transient selection
activate incoming workspace
load incoming snapshot
restore Cytoscape
restore viewport
restore Inspector state
```

Do not rely on one large React `useEffect` to perform the entire workspace transaction.

Use XState v5 only for canvas interaction modes.

Required interaction modes:

```text
default
insertingNode
insertingEdge
isolation
```

The edge insertion mode should have substates:

```text
selectSource
selectTarget
```

Opening an Inspector panel, switching workspaces or pressing Escape must safely cancel unsafe insertion modes.

Build a centralized CommandBus.

Examples:

```text
file.save
file.saveAs

canvas.insertNode
canvas.insertEdge
canvas.deleteSelection

edit.undo
edit.redo

inspector.open.details
inspector.open.assets
inspector.open.results

simulation.run
```

Toolbar buttons, keyboard shortcuts, context menus and command palette must call the same commands.

Implement Workspace Tabs with:

- create
- close
- switch
- rename
- duplicate
- reorder
- close others
- close to right
- pin
- dirty indicator
- simulation status
- validation indicator

Use dnd-kit for reorder.

Implement Ribbon Tabs using Radix UI Tabs.

Ribbon groups must be declarative configuration objects, not large conditional JSX structures.

Implement Inspector using Radix UI Tabs and react-resizable-panels.

When exactly one Cytoscape node or edge is selected:

```text
set selection
open Inspector
set Inspector tab to Details
```

Do this through the command layer.

Use a SelectionStore that stores selected element IDs.

Do not keep stale full Cytoscape element objects in React state unless needed for a specific editing form.

Implement IndexedDB recovery snapshots using Dexie.

On document-changing operations:

```text
mark workspace dirty
debounce 500-1000ms
write recovery snapshot
```

A UI-only operation such as changing Ribbon tab should not mark the document dirty.

Implement command-based undo/redo for Cytoscape document mutations.

Use commands such as:

```text
AddNodeCommand
DeleteNodeCommand
MoveNodeCommand
AddEdgeCommand
DeleteEdgeCommand
UpdateAssetCommand
ChangeEdgeBendCommand
```

Do not save the entire graph into undo history on every pointer movement.

Use Zod for:

- document schema
- asset schemas
- simulation config
- file imports
- IndexedDB loads
- backend responses

Use TanStack Query for remote/backend simulation state.

Do not place remote simulation API caching inside Zustand.

Structure the project by feature, not by one giant page component.

Target folders:

```text
workspace/
canvas/
ribbon/
inspector/
commands/
selection/
simulation/
assets/
shortcuts/
components/
```

Create a clean API between these modules.

The first implementation milestone must support:

1. Three independently functioning Workspace Tabs.
2. Separate Cytoscape graph per workspace.
3. Switching between tabs without graph/state leakage.
4. Node and edge creation.
5. Selection.
6. Node movement.
7. Home / Insert / Edit / View / Tools Ribbon tabs.
8. Details / Find / Isolation / Assets / Validation / Config / Results / Issues Inspector tabs.
9. Selecting an element automatically opens Details.
10. Edge insertion cancels if the user opens the Inspector or switches workspace.
11. Recovery snapshots stored in IndexedDB.
12. Dirty-state indicator.
13. Workspace tab drag/reorder.
14. Resizable Inspector.
15. Basic keyboard shortcuts.

Before writing implementation code:

1. produce the final folder structure
2. define the TypeScript domain types
3. define store responsibilities
4. define CanvasController interface
5. define WorkspaceController interface
6. define XState canvas interaction machine
7. define CommandBus interface
8. explain event flow between Cytoscape, commands, stores and Inspector

Then implement in small modules.

Do not create placeholder architecture that is immediately bypassed by components.

All UI interactions must go through the designed architecture.

Keep components thin.

Keep controllers framework-independent where practical.

Add tests for:

- workspace A → B → A restores correct graphs
- inserting edge → Inspector click cancels insertion
- selecting node opens Details
- selection does not leak across workspaces
- modify document → dirty
- save → not dirty
- tab reorder preserves active workspace
- closing active workspace activates predictable neighboring workspace
- IndexedDB recovery restores state

When making architectural decisions, optimize for:

- maintainability
- predictable state transitions
- large Cytoscape graphs
- future simulation features
- low coupling
- testability
- extensibility

Do not optimize only for getting the first demo working.

This is intended to become a production engineering application.

---

# 34. Recommended Build Order

Build in this order:

```text
1. Domain types
2. Zustand workspace store
3. CanvasController
4. single Cytoscape canvas
5. Dexie repository
6. WorkspaceController
7. multiple Workspace Tabs
8. workspace switching
9. XState interaction machine
10. CommandBus
11. Ribbon
12. Inspector
13. element selection integration
14. tab reordering
15. keyboard shortcuts
16. autosave recovery
17. undo/redo
18. Zod validation
19. simulation API
20. advanced panels
```

Do not start by implementing every Inspector panel.

First make the state architecture correct.

---

# 35. Definition of Done for the Core Architecture

The core architecture is considered successful when this sequence works without state corruption:

```text
Open Network A
↓
Add 5 nodes
↓
move them
↓
open Assets
↓
start Insert Pipe
↓
switch to Network B
↓
Network A snapshot automatically preserved
↓
Network B restores its own graph
↓
add nodes in B
↓
select node
↓
Details opens
↓
change Config
↓
switch back to A
↓
A appears exactly as it was
↓
undo an edit
↓
save A
↓
dirty indicator clears
↓
refresh browser
↓
recovery restores the workspace
```

No graph, selection, Inspector state or unsafe insertion state should leak between workspaces.

That is the baseline architecture for the new repository.
