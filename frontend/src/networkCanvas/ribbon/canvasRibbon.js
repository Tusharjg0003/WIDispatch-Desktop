import {
  AArrowDown,
  AArrowUp,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  Bold,
  CircleDot,
  Cylinder,
  Droplets,
  Factory,
  CircleX,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Crosshair,
  Download,
  Eraser,
  FileText,
  Focus,
  Fuel,
  Fullscreen,
  GitMerge,
  Italic,
  Keyboard,
  Layers,
  Library,
  ListChecks,
  ListFilter,
  LocateFixed,
  Map as MapIcon,
  MapPinned,
  Minimize2,
  Pencil,
  PenLine,
  Play,
  Redo2,
  RotateCcw,
  Route,
  Save,
  SaveAll,
  ScanSearch,
  Search,
  Shapes,
  SquareDashed,
  SquareDashedMousePointer,
  Spline,
  StickyNote,
  Table2,
  ToggleRight,
  Trash2,
  TriangleAlert,
  Underline,
  Undo2,
  Upload,
  Waypoints,
  Workflow,
  Zap,
  Activity,
  Minus,
  Type,
} from "lucide-react";
import { ENTITY_TYPE_COLORS } from "../../cytoscape/buildCyStyle";

// Ribbon definition (Home / Insert / Edit / View / Tools), laid out the way
// Office lays out its ribbon: each group is a row of columns, and a column is
// either one large button (icon over label, full height) or up to three rows
// of small controls. Universal actions (save, undo, copy, delete, align…) are
// icon-only; their name, shortcut and description appear in the hover tip.
//
// `ctx.cmd` holds the canvas handlers; a command whose handler is absent is
// simply omitted, so the ribbon never shows a dead button.
//
// Shapes consumed by components/CanvasRibbon.jsx:
//   group   { id, label, columns: [column] }
//   column  { large: item } | { rows: [[item, …], …] }   (max three rows)
//   item    { id, label, icon, onClick, active, disabled, primary, danger,
//             iconOnly, keys, tip }
//         | { type: "menu", id, label, icon, iconOnly, options: [{ value, label }],
//             value, onSelect, disabled, keys, tip }
//         | { type: "check", id, label, checked, onChange, disabled, keys, tip }

export const RIBBON_TABS = ["home", "insert", "edit", "view", "tools"];

export const NOTE_FONTS = [
  { value: "sans", label: "Sans" },
  { value: "serif", label: "Serif" },
  { value: "mono", label: "Mono" },
];

const when = (cond, item) => (cond ? item : null);

// Insert → Assets: one icon and colour per type, the same ones the Library
// rows, the Details card and the legend use, so a type reads the same
// everywhere.
const ENTITY_ICONS = {
  plant: Factory,
  pump: Droplets,
  tank: Cylinder,
  handover_point: MapPinned,
  filling_station: Fuel,
  node: CircleDot,
};

export function buildCanvasRibbon(ctx) {
  const { cmd = {}, workspaceMode = "builder", readOnly = false } = ctx;
  const isSim = workspaceMode === "simulation";
  const edit = !readOnly;
  const modeIs = (m) => ctx.mode === m;
  const toggleMode = (m) => () => cmd.setMode(modeIs(m) ? "select" : m);
  const saving = ctx.saveStatus === "saving";

  // ── Home: everyday commands ──────────────────────────────────────────────
  const home = {
    id: "home",
    label: "Home",
    groups: [
      {
        id: "undo",
        label: "Undo",
        columns: [
          {
            rows: [
              [when(cmd.undo && edit, { id: "undo", label: "Undo", icon: Undo2, iconOnly: true, onClick: cmd.undo, disabled: !ctx.canUndo, keys: "Ctrl+Z", tip: "Reverse your last change." })],
              [when(cmd.redo && edit, { id: "redo", label: "Redo", icon: Redo2, iconOnly: true, onClick: cmd.redo, disabled: !ctx.canRedo, keys: "Ctrl+Y", tip: "Re-apply the change you just undid." })],
            ],
          },
        ],
      },
      {
        id: "clipboard",
        label: "Clipboard",
        columns: [
          { large: when(cmd.paste && edit, { id: "paste", label: "Paste", icon: ClipboardPaste, onClick: cmd.paste, keys: "Ctrl+V", tip: "Paste copied assets at the centre of the view." }) },
          {
            rows: [
              [when(cmd.copySelection, { id: "copy", label: "Copy", icon: Copy, onClick: cmd.copySelection, disabled: !ctx.hasSelection, keys: "Ctrl+C", tip: "Copy the selected assets and pipes." })],
              [when(cmd.copyAll, { id: "copy-all", label: "Copy all", icon: CopyPlus, onClick: cmd.copyAll, tip: "Copy the whole network." })],
            ],
          },
        ],
      },
      {
        id: "file",
        label: "File",
        columns: [
          {
            rows: [
              [
                when(cmd.save && edit, { id: "save", label: saving ? "Saving…" : "Save", icon: Save, iconOnly: true, primary: true, onClick: cmd.save, disabled: saving, keys: "Ctrl+S", tip: isSim ? "Save the edited network for this configuration." : "Save this network." }),
                when(cmd.importFile && edit, { id: "import", label: "Import", icon: Upload, iconOnly: true, onClick: cmd.importFile, tip: "Import a network from JSON, KMZ or KML." }),
                when(cmd.exportAs, {
                  type: "menu",
                  id: "export",
                  label: "Export",
                  icon: Download,
                  iconOnly: true,
                  tip: "Download this network as a file.",
                  options: [
                    { value: "json", label: "JSON network file" },
                    { value: "csv", label: "CSV table" },
                    { value: "kmz", label: "KMZ for Google Earth (needs 2+ geo anchors)" },
                  ],
                  onSelect: (format) => cmd.exportAs(format),
                }),
              ],
              [when(cmd.saveAs && edit, { id: "save-as", label: "Save as", icon: SaveAll, onClick: cmd.saveAs, tip: "Save a copy under a new name." })],
              [when(cmd.rename && edit, { id: "rename", label: "Rename", icon: PenLine, onClick: cmd.rename, tip: "Rename this network." })],
            ],
          },
        ],
      },
      {
        id: "editing",
        label: "Editing",
        columns: [
          {
            rows: [
              [when(cmd.toggleFind, { id: "find", label: "Find", icon: Search, active: ctx.findOpen, onClick: cmd.toggleFind, tip: "Find an asset on the canvas by name." })],
              [when(cmd.selectAll, { id: "select-all", label: "Select all", icon: SquareDashedMousePointer, onClick: cmd.selectAll, keys: "Ctrl+A", tip: "Select everything on the canvas." })],
              [
                when(cmd.editSelected && edit, { id: "edit-selected", label: "Edit", icon: Pencil, onClick: cmd.editSelected, disabled: !ctx.canEditSelected, tip: "Edit the selected asset or pipe." }),
                when(cmd.deleteSelected && edit, { id: "delete", label: "Delete", icon: Trash2, iconOnly: true, danger: true, onClick: cmd.deleteSelected, disabled: !ctx.hasDeletableSelection, keys: "Del", tip: "Delete the selected assets and pipes." }),
              ],
            ],
          },
        ],
      },
      isSim && {
        id: "run",
        label: "Simulation",
        columns: [
          { large: when(cmd.run, { id: "run", label: ctx.running ? "Running…" : "Run", icon: Play, primary: true, onClick: cmd.run, disabled: ctx.running, tip: "Run the simulation for this configuration." }) },
          { rows: [[when(cmd.clearRun, { id: "run-clear", label: "Clear results", icon: CircleX, onClick: cmd.clearRun, disabled: !ctx.hasRunOverlay, tip: "Remove the run results from the canvas." })]] },
        ],
      },
    ].filter(Boolean),
  };

  // ── Insert: things you add to the canvas ─────────────────────────────────
  const entityColumns = edit
    ? (ctx.entityButtons || []).map(({ type, label, shortLabel }) => ({
        large: {
          id: `insert-${type}`,
          label: shortLabel || label,
          icon: ENTITY_ICONS[type] || CircleDot,
          colour: ENTITY_TYPE_COLORS[type],
          active: modeIs("place-entity") && ctx.pendingEntity === type,
          onClick: () => cmd.insertEntity(type),
          tip: `Click the canvas to place a new ${label}. Press Esc when you're done.`,
        },
      }))
    : [];

  const insert = {
    id: "insert",
    label: "Insert",
    groups: [
      {
        id: "assets",
        label: "Assets",
        columns: [
          ...entityColumns,
          { large: when(cmd.toggleLibrary && edit, { id: "library", label: "Asset library", icon: Library, active: ctx.libraryOpen, onClick: cmd.toggleLibrary, tip: "Show the registry of existing assets to drag onto the canvas." }) },
        ],
      },
      {
        id: "pipes",
        label: "Pipes",
        columns: [
          { large: when(edit, { id: "draw-pipe", label: "Pipe", icon: Spline, active: modeIs("draw-pipe"), disabled: ctx.nodeCount < 2, onClick: toggleMode("draw-pipe"), tip: "Draw a pipe: click the source asset, then the target." }) },
          {
            rows: [
              [when(cmd.hasDrawRoute && edit, { id: "draw-route", label: "Draw route", icon: Route, active: modeIs("draw-segmented-line"), disabled: ctx.nodeCount < 2, onClick: toggleMode("draw-segmented-line"), tip: "Click a source, click to add junctions (Shift+click for bends), then click the target." })],
              [when(edit, { id: "insert-on-pipe", label: "Insert on pipe", icon: Waypoints, active: modeIs("insert-on-edge"), disabled: ctx.edgeCount < 1, onClick: toggleMode("insert-on-edge"), tip: "Click a pipe to split it and insert an asset there." })],
            ],
          },
        ],
      },
      {
        id: "annotate",
        label: "Annotate",
        columns: [
          { large: when(edit, { id: "note", label: "Note", icon: StickyNote, active: modeIs("place-note"), onClick: toggleMode("place-note"), tip: "Click the canvas to drop a text note." }) },
          { large: when(cmd.groupBox && edit, { id: "group-box", label: "Group box", icon: SquareDashed, onClick: cmd.groupBox, disabled: !ctx.hasSelection, tip: "Draw a labelled box around the selected assets." }) },
        ],
      },
    ],
  };

  // ── Edit: selection, properties and layout ──────────────────────────────
  const editTab = {
    id: "edit",
    label: "Edit",
    groups: [
      {
        id: "selection",
        label: "Selection",
        columns: [
          {
            rows: [
              [when(cmd.selectAll, { id: "sel-all", label: "Select all", icon: SquareDashedMousePointer, onClick: cmd.selectAll, keys: "Ctrl+A", tip: "Select everything on the canvas." })],
              [when(cmd.selectByState, {
                type: "menu",
                id: "sel-by-state",
                label: "Select by state",
                icon: ListFilter,
                tip: "Select every active or inactive asset.",
                options: [
                  { value: "active", label: "Active assets" },
                  { value: "inactive", label: "Inactive assets" },
                ],
                onSelect: cmd.selectByState,
              })],
              [when(cmd.toggleIsolation, { id: "isolate", label: ctx.isolationActive ? "Clear isolation" : "Isolate", icon: Focus, active: ctx.isolationActive, onClick: cmd.toggleIsolation, tip: "Show only the selection and hide everything else, or bring it all back." })],
            ],
          },
        ],
      },
      {
        id: "modify",
        label: "Modify",
        columns: [
          {
            rows: [
              [when(cmd.setSelectedActive && edit, {
                type: "menu",
                id: "set-state",
                label: "Set state",
                icon: ToggleRight,
                disabled: !ctx.hasSelection,
                tip: "Mark the selected assets active or inactive.",
                options: [
                  { value: "active", label: "Make active" },
                  { value: "inactive", label: "Make inactive" },
                ],
                onSelect: cmd.setSelectedActive,
              })],
              [when(cmd.straighten && edit, { id: "straighten", label: "Straighten", icon: Minus, onClick: cmd.straighten, disabled: !ctx.hasPipeSelection, tip: "Remove every bend from the selected pipes." })],
              [when(cmd.groupLines && edit, { id: "group-lines", label: "Group into line", icon: GitMerge, onClick: cmd.groupLines, disabled: !ctx.hasPipeSelection, tip: "Group the selected pipes into one transmission line." })],
            ],
          },
        ],
      },
      edit && {
        id: "arrange",
        label: "Align",
        columns: [
          {
            rows: [
              [
                { id: "align-left", label: "Align left", icon: AlignStartVertical, iconOnly: true, onClick: () => cmd.arrange("left"), tip: "Line up the selection on its left edge." },
                { id: "align-center-h", label: "Align centre", icon: AlignCenterVertical, iconOnly: true, onClick: () => cmd.arrange("centerh"), tip: "Line up the selection on a vertical centre line." },
                { id: "align-right", label: "Align right", icon: AlignEndVertical, iconOnly: true, onClick: () => cmd.arrange("right"), tip: "Line up the selection on its right edge." },
              ],
              [
                { id: "align-top", label: "Align top", icon: AlignStartHorizontal, iconOnly: true, onClick: () => cmd.arrange("top"), tip: "Line up the selection on its top edge." },
                { id: "align-center-v", label: "Align middle", icon: AlignCenterHorizontal, iconOnly: true, onClick: () => cmd.arrange("centerv"), tip: "Line up the selection on a horizontal centre line." },
                { id: "align-bottom", label: "Align bottom", icon: AlignEndHorizontal, iconOnly: true, onClick: () => cmd.arrange("bottom"), tip: "Line up the selection on its bottom edge." },
              ],
              [
                { id: "dist-h", label: "Distribute horizontally", icon: AlignHorizontalDistributeCenter, iconOnly: true, onClick: () => cmd.arrange("disth"), tip: "Space the selection evenly from left to right." },
                { id: "dist-v", label: "Distribute vertically", icon: AlignVerticalDistributeCenter, iconOnly: true, onClick: () => cmd.arrange("distv"), tip: "Space the selection evenly from top to bottom." },
              ],
            ],
          },
        ],
      },
    ].filter(Boolean),
  };

  // ── View: how the canvas is shown ────────────────────────────────────────
  const view = {
    id: "view",
    label: "View",
    groups: [
      {
        id: "views",
        label: "Views",
        columns: [
          { large: when(cmd.toggleTable, { id: "view-table", label: "Table", icon: Table2, active: ctx.viewMode === "table", onClick: cmd.toggleTable, tip: "Edit assets and pipes in a spreadsheet-style table." }) },
          { large: when(cmd.toggleMap, { id: "view-map", label: "Map", icon: MapIcon, active: ctx.viewMode === "map", onClick: cmd.toggleMap, tip: "Show the network on a geographic map (needs 2+ geo anchors)." }) },
          { rows: [[when(cmd.toggleGeoPanel, { id: "geo-anchor", label: "Geo anchors", icon: MapPinned, active: ctx.geoPanelOpen, onClick: cmd.toggleGeoPanel, tip: "Pin assets to real latitude and longitude." })]] },
        ],
      },
      {
        id: "zoom",
        label: "Zoom",
        columns: [
          { large: when(cmd.fit, { id: "fit", label: "Fit to screen", icon: ScanSearch, onClick: cmd.fit, keys: "F", tip: "Zoom so the whole network is visible." }) },
          {
            rows: [
              [when(cmd.zoomToSelection, { id: "zoom-sel", label: "Zoom to selection", icon: LocateFixed, onClick: cmd.zoomToSelection, keys: "Z", tip: "Zoom in on the selected assets." })],
              [{ id: "area-zoom", label: "Zoom to area", icon: Crosshair, active: modeIs("area-zoom"), onClick: toggleMode("area-zoom"), tip: "Drag a rectangle on the canvas to zoom into it." }],
              [when(cmd.resetView, { id: "reset-view", label: "Reset view", icon: RotateCcw, onClick: cmd.resetView, tip: "Reset pan, zoom, isolation and trace." })],
            ],
          },
        ],
      },
      {
        id: "show",
        label: "Show",
        columns: [
          {
            rows: [
              [when(cmd.toggleLabels, { type: "check", id: "show-labels", label: "Labels", checked: ctx.showLabels, onChange: cmd.toggleLabels, tip: "Show asset and pipe names." })],
              [when(cmd.toggleGrid, { type: "check", id: "show-grid", label: "Grid", checked: ctx.showGrid, onChange: cmd.toggleGrid, tip: "Show the background grid." })],
              [when(cmd.toggleSnap && edit, { type: "check", id: "snap", label: "Snap to grid", checked: ctx.snapToGrid, onChange: cmd.toggleSnap, tip: "Snap assets to the grid when you drop them (hold Alt to bypass)." })],
            ],
          },
          {
            rows: [
              [when(cmd.setSymbolShape, {
                type: "menu",
                id: "symbol",
                label: "Symbols",
                icon: Shapes,
                value: ctx.symbolShape || "circle",
                tip: "Choose how assets are drawn.",
                options: [
                  { value: "circle", label: "Circles" },
                  { value: "box", label: "Boxes" },
                ],
                onSelect: cmd.setSymbolShape,
              })],
            ],
          },
        ],
      },
      {
        id: "window",
        label: "Window",
        columns: [
          { large: when(cmd.toggleFullScreen, { id: "full-screen", label: ctx.fullScreen ? "Exit full screen" : "Full screen", icon: ctx.fullScreen ? Minimize2 : Fullscreen, active: ctx.fullScreen, onClick: cmd.toggleFullScreen, keys: "Ctrl+Shift+F", tip: "Hide everything except the canvas." }) },
          {
            rows: [
              [when(cmd.openAssetsPanel, { id: "assets-panel", label: "Asset summary", icon: Layers, active: ctx.assetsPanelOpen, onClick: cmd.openAssetsPanel, tip: "Asset categories and capacity." })],
              [when(cmd.toggleShortcuts, { id: "shortcuts", label: "Shortcuts", icon: Keyboard, active: ctx.shortcutsOpen, onClick: cmd.toggleShortcuts, keys: "?", tip: "List every keyboard shortcut." })],
            ],
          },
        ],
      },
    ],
  };

  // ── Tools: analysis, checks and reports ──────────────────────────────────
  const tools = {
    id: "tools",
    label: "Tools",
    groups: [
      {
        id: "trace",
        label: "Trace",
        columns: [
          { large: { id: "trace", label: "Trace supply", icon: Workflow, active: modeIs("trace"), disabled: ctx.nodeCount < 1, onClick: toggleMode("trace"), tip: "Click delivery points, plants or tanks to highlight where their water comes from and goes." } },
          { large: when(cmd.exportTraceability, {
            type: "menu",
            id: "trace-report",
            label: "Trace report",
            icon: FileText,
            disabled: ctx.nodeCount < 1,
            tip: "Traceability report for every delivery point.",
            options: [
              { value: "pdf", label: "PDF report" },
              { value: "xlsx", label: "Excel workbook" },
            ],
            onSelect: (format) => cmd.exportTraceability(format),
          }) },
        ],
      },
      {
        id: "check",
        label: "Check",
        columns: [
          { large: when(cmd.validate, { id: "validate", label: "Validate", icon: ListChecks, onClick: cmd.validate, tip: "Check the network for disconnected assets, missing capacities and other problems." }) },
          {
            rows: [
              [when(cmd.showIssues, { id: "show-issues", label: "Show issues", icon: TriangleAlert, onClick: cmd.showIssues, tip: "Open the list of validation issues." })],
              [when(cmd.focusIssues, { id: "focus-issue", label: "Go to issue", icon: Crosshair, onClick: cmd.focusIssues, tip: "Zoom to the first validation issue." })],
              [when(cmd.selectByIssue, {
                type: "menu",
                id: "select-by-issue",
                label: "Select by issue",
                icon: ListFilter,
                tip: "Select every asset with a given problem.",
                options: [
                  { value: "disconnected", label: "Disconnected assets" },
                  { value: "missing-capacity", label: "Missing capacity" },
                  { value: "inactive-connected", label: "Inactive but connected" },
                ],
                onSelect: cmd.selectByIssue,
              })],
            ],
          },
          { rows: [[when(cmd.clearHighlights, { id: "clear-marks", label: "Clear marks", icon: Eraser, onClick: cmd.clearHighlights, tip: "Clear selection, find results, trace and isolation." })]] },
        ],
      },
      (cmd.toggleBottlenecks || cmd.toggleFlow) && {
        id: "simulation-view",
        label: "Results",
        columns: [
          { large: when(cmd.toggleBottlenecks, { id: "bottlenecks", label: "Bottlenecks", icon: Zap, active: modeIs("bottlenecks"), disabled: !ctx.hasRunOverlay, onClick: cmd.toggleBottlenecks, tip: "Highlight pipes, plants and delivery points running at their limit." }) },
          { large: when(cmd.toggleFlow, { id: "flow", label: "Flow", icon: Activity, active: ctx.flowAnimating, disabled: !ctx.hasRunOverlay, onClick: cmd.toggleFlow, tip: "Animate flow along the pipes that carry it." }) },
        ],
      },
    ].filter(Boolean),
  };

  return [home, insert, editTab, view, tools];
}

/** Contextual "Note Format" group, shown while a note is selected. */
export function buildNoteFormatGroup(ctx) {
  const { cmd = {}, selectedEl, noteSizes = [] } = ctx;
  if (!ctx.isNoteSel || ctx.readOnly) return [];
  const sizeLabel = (s) => s[0].toUpperCase() + s.slice(1);
  return [
    {
      id: "note-format",
      label: "Note format",
      contextLabel: "Note Format",
      columns: [
        {
          rows: [
            [{ type: "menu", id: "note-font", label: `Font: ${NOTE_FONTS.find((f) => f.value === (selectedEl?.noteFont || "sans"))?.label}`, icon: Type, value: selectedEl?.noteFont || "sans", options: NOTE_FONTS, onSelect: (v) => cmd.noteFormat("noteFont", v), tip: "Typeface for the note." }],
            [{ type: "menu", id: "note-size", label: `Size: ${sizeLabel(selectedEl?.noteSize || "normal")}`, icon: AArrowUp, value: selectedEl?.noteSize || "normal", options: noteSizes.map((s) => ({ value: s, label: sizeLabel(s) })), onSelect: (v) => cmd.noteFormat("noteSize", v), tip: "Text size for the note." }],
          ],
        },
        {
          rows: [
            [
              { id: "note-size-down", label: "Smaller text", icon: AArrowDown, iconOnly: true, onClick: () => cmd.noteFormat("sizeStep", -1), tip: "Decrease the text size." },
              { id: "note-size-up", label: "Larger text", icon: AArrowUp, iconOnly: true, onClick: () => cmd.noteFormat("sizeStep", 1), tip: "Increase the text size." },
            ],
            [
              { id: "note-bold", label: "Bold", icon: Bold, iconOnly: true, active: selectedEl?.noteBold === "true", onClick: () => cmd.noteFormat("bold"), keys: "Ctrl+B" },
              { id: "note-italic", label: "Italic", icon: Italic, iconOnly: true, active: selectedEl?.noteItalic === "true", onClick: () => cmd.noteFormat("italic"), keys: "Ctrl+I" },
              { id: "note-underline", label: "Underline", icon: Underline, iconOnly: true, active: selectedEl?.noteUnderline === "true", onClick: () => cmd.noteFormat("underline"), keys: "Ctrl+U" },
            ],
          ],
        },
      ],
    },
  ];
}
