import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import WorkspaceTabs from "../workspace/components/WorkspaceTabs";
import TabStripBoundary from "../tabs/components/TabStripBoundary";
import { workspaceController } from "../workspace/services/workspaceControllerInstance";
import { useWorkspaceStore, workspaceStore } from "../workspace/store/workspaceStore";
import { CanvasController, canvasController } from "../canvas/controller/CanvasController";
import { createEmbeddedWorkspace } from "./embeddedWorkspace";
import CanvasRibbon from "./components/CanvasRibbon";
import useCanvasStatus from "./hooks/useCanvasStatus";
import CanvasEntityModal from "./modals/CanvasEntityModal";
import useDrawRoute, { DRAW_ROUTE_MODE, routeToLegs } from "./hooks/useDrawRoute";
import useSidebarResize from "./hooks/useSidebarResize";
import useReconnect, { RECONNECT_MODE } from "./hooks/useReconnect";
import useAnnotationOverlays, { groupBoxAround } from "./hooks/useAnnotationOverlays";
import AnnotationOverlays from "./components/AnnotationOverlays";
import GroupLinesModal from "./modals/GroupLinesModal";
import TracePanel from "./components/TracePanel";
import GeoAnchorPanel from "./components/GeoAnchorPanel";
import CanvasTableView from "./components/CanvasTableView";
import CapacityRequiredModal from "./modals/CapacityRequiredModal";
import KmzReviewModal from "./modals/KmzReviewModal";
import { Keyboard, Map as MapIcon, Maximize2, Minimize2, PanelLeft, PanelRight } from "lucide-react";
import CanvasLegend from "./components/CanvasLegend";
import SelectionInspector from "./components/SelectionInspector";
import ValidationPanel from "./components/ValidationPanel";
import IsolationPanel from "./components/IsolationPanel";
import useSimulationLayer, { BOTTLENECK_MODE } from "./hooks/useSimulationLayer";
import { BottleneckPanel, SimulationRunBar } from "./components/SimulationPanels";
import NodeInsightPopover from "../components/simulation/NodeInsightPopover";
import CanvasDetails from "../components/simulation/CanvasDetails";
import "./SimulationCanvas.css";
import { applyKmzOverrides, buildKmzReviewRows } from "./lib/kmzReview";
import { assetCapacity } from "./lib/canvasTable";
import {
  DELIVERY_TRACE_TYPES as MULTI_DELIVERY_TYPES,
  TRACE_ROOT_TYPES as MULTI_TRACE_ROOT_TYPES,
  aggregateTraceMembership,
  buildTraceInfo,
  paintMultiTrace,
  toggleTraceRoot,
} from "../cytoscape/multiTrace";
import { exportTraceExcel, exportTracePDF } from "../lib/traceExport";
import { buildCanvasRibbon, buildNoteFormatGroup } from "./ribbon/canvasRibbon";
import {
  snapshotElements,
  stripTransientClasses,
} from "../canvas/controller/canvasSnapshotSerializer";
import { useInspectorStore, inspectorStore } from "../inspector/store/inspectorStore";
import { useIssuesStore, issuesStore } from "../issues/store/issuesStore";
import { selectionStore } from "../selection/store/selectionStore";
import cytoscape from "cytoscape";
import Konva from "konva";
import contextMenus from "cytoscape-context-menus";
import edgeEditing from "cytoscape-edge-editing";
import "cytoscape-context-menus/cytoscape-context-menus.css";
import {
  EmptyIcon,
  IconActive,
  IconAlignCenter,
  IconAlignJustify,
  IconAlignLeft,
  IconAlignRight,
  IconArrowDown,
  IconArrowUp,
  IconBold,
  IconBriefcase,
  IconChevronLeft,
  IconChevronRight,
  IconClipboard,
  IconCopy,
  IconCrosshair,
  IconDistributionNetwork,
  IconDownload,
  IconDroplet,
  IconEdit2,
  IconFolder,
  IconGitBranch,
  IconGrid,
  IconItalic,
  IconMap,
  IconMapPin,
  IconMaximize,
  IconMinus,
  IconPipe,
  IconPlant,
  IconPlay,
  IconPlusCircle,
  IconRefresh,
  IconRotateCcw,
  IconRotateCw,
  IconSave,
  IconSelect,
  IconSquare,
  IconStop,
  IconStorageTank,
  IconTag,
  IconTarget,
  IconTreatmentPlant,
  IconTrash2,
  IconUnderline,
  IconUpload,
} from "../components/IconAssets";
import { useLayout } from "../contexts/LayoutContext";
import { ENTITY_TYPE_COLORS, ENTITY_TYPE_LABELS, currentCyPalette } from "../cytoscape/buildCyStyle";
import { applyEntitySymbol, getEntitySymbolShape, setEntitySymbolShape } from "../cytoscape/entitySymbol";
import { SNAP_TO_GRID_STORAGE_KEY, projectPointOntoPolyline } from "../cytoscape/canvasGeometry";
import { bendPointsToPairs, planPipeSplit, splitPipeSpecs } from "../cytoscape/pipeSplit";
import { LOD_CLASSES, applyZoomLod as applyZoomLodTo } from "../cytoscape/lod";
import {
  TRACE_CLASSES,
  clearTraceClasses,
  computeTrace,
  paintTrace,
  traceNeighbours,
} from "../cytoscape/trace";
import {
  CANVAS_GRID_PITCH,
  computeGridPitch,
  snapPosition,
  wrapOffset,
} from "../cytoscape/canvasGeometry";
import {
  BEND_CLASS,
  addBendPoint,
  edgeBendPoints,
  edgePolyline,
  removeAllBendPoints,
  removeNearestBendPoint,
  restoreBendClasses,
  updateBendClasses,
} from "../cytoscape/bendEditing";
import { alignPositions, distributePositions } from "../cytoscape/align";
import { applyIsolation, clearIsolation as clearIsolationClasses, isIsolated } from "../cytoscape/isolate";
import { normalizeBox, selectInBox } from "../cytoscape/boxSelect";
import {
  ASSET_CATEGORIES,
  PIPELINE_KEY,
  canvasAssets as readCanvasAssets,
  summarizeCategories,
} from "../cytoscape/assetFilter";
import { fetchNetworks, saveNetwork, updateNetwork, deleteNetwork } from "../api/networks";
import {
  fetchTransmissionSystems, createTransmissionSystem,
  fetchTransmissionLines, createTransmissionLine, fetchTransmissionSystemNetwork,
} from "../api/metrics";
import { lineDisplayName, lineSystemId } from "../lib/transmissionLines";
import NetworkPalette, { LIBRARY_DRAG_TYPE, TRANSMISSION_SYSTEM_DRAG_TYPE } from "../components/NetworkPalette";
import WorkspaceRecordSidebar from "../components/WorkspaceRecordSidebar";
import NetworkEntityCreateModal from "../components/NetworkEntityCreateModal";
import PipeVariablesModal, { segmentName } from "../components/PipeVariablesModal";
import CanvasMinimap from "../components/CanvasMinimap";
import NetworkCanvasMapView from "../components/networkCanvas/NetworkCanvasMapView";
import { computeTransform, geoToPixel, pixelToGeo, transformStatus } from "../lib/canvasGeoreference";
import { exportNetworkToKmz, parseNetworkGeoFile } from "../lib/networkKmz";
import { classifyKmzPoint } from "../lib/kmzEntityClassifier";
import "./NetworkCanvasWorkspace.css";

// Dispatched after a successful save/update so WorkspaceRecordSidebar (which
// owns its own fetch) knows to refresh its list.
const NETWORK_SAVED_EVENT = "widispatch:network-saved";

// Cytoscape extensions register onto the shared cytoscape module, so this must
// happen exactly once per page load — the flag survives Vite's hot reloads,
// which would otherwise re-register and double up the plugins' event handlers.
const CY_EXTENSIONS_KEY = "__widispatchCyExtensionsRegistered__";
if (typeof window !== "undefined" && !window[CY_EXTENSIONS_KEY]) {
  cytoscape.use(contextMenus);
  edgeEditing(cytoscape, Konva);
  window[CY_EXTENSIONS_KEY] = true;
}

// Right-clicking a pipe lands exactly on the centreline; a bend with no
// perpendicular offset would be stored but invisible.
const CONTEXT_BEND_MIN_OFFSET = 40;
// Screen-pixel radius for "you double-clicked an existing bend".
const BEND_GRAB_RADIUS_PX = 14;
// How far the pointer travels before a right-click becomes a box select.
// Matches Cytoscape's own desktopTapThreshold, so a gesture we treat as a drag
// is one it also treats as a drag — and therefore does not fire cxttap for,
// which is what keeps the pipe context menu shut on a right-drag.
const RIGHT_DRAG_THRESHOLD = 4;
// A double-click edit is applied a frame later, after cytoscape-edge-editing
// has finished its own (5ms-debounced) handling of the same gesture — writing
// inside the event turn gets clobbered, and pulling a bend out from under the
// plugin mid-gesture makes it throw on an edge that no longer has any.
const BEND_EDIT_DEFER_MS = 24;

// Per-browser layout preferences (left rail hidden / toolbar collapsed). Storage can
// be unavailable; the toggles then just reset on reload.
const LEFT_RAIL_PREF = "nb.leftRailOpen";
const TOOLBAR_PREF = "nb.toolbarOpen";
const readFlag = (key, fallback) => {
  try {
    const value = window.localStorage.getItem(key);
    return value == null ? fallback : value === "true";
  } catch {
    return fallback;
  }
};
const writeFlag = (key, value) => {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Storage unavailable: keep the in-memory state only.
  }
};


const rid = (p) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const cloneData = (value) => {
  if (!value || typeof value !== "object") return value;
  return JSON.parse(JSON.stringify(value));
};
const SHORTCUT_GROUPS = [
  { title: "Edit", rows: [
    { keys: "Ctrl/Cmd + Z", desc: "Undo" },
    { keys: "Ctrl/Cmd + Shift + Z", desc: "Redo" },
    { keys: "Ctrl/Cmd + S", desc: "Save network" },
    { keys: "Ctrl/Cmd + C / X / V", desc: "Copy / cut / paste selection" },
    { keys: "Delete / Backspace", desc: "Delete selection" },
  ] },
  { title: "Select and view", rows: [
    { keys: "Ctrl/Cmd + A", desc: "Select all" },
    { keys: "Arrow keys", desc: "Move selection one grid step" },
    { keys: "Shift + Arrow keys", desc: "Move selection ten grid steps" },
    { keys: "F / Z", desc: "Fit network / zoom to selection" },
    { keys: "Ctrl/Cmd + Shift + F", desc: "Toggle canvas focus" },
    { keys: "Esc", desc: "Close guide or leave the active tool" },
  ] },
  { title: "Network tabs", rows: [
    { keys: "Ctrl/Cmd + Alt + N", desc: "New network" },
    { keys: "Ctrl/Cmd + Alt + Left / Right", desc: "Previous / next network" },
    { keys: "Ctrl/Cmd + W", desc: "Close current network" },
    { keys: "Ctrl/Cmd + Shift + T", desc: "Reopen last closed network" },
  ] },
];
const INSERT_TOOL_LABELS = {
  plant: "Plant",
  handover_point: "Handover Point / City Gate",
  tank: "Tank",
  node: "Node",
  pump: "Pump Station",
  filling_station: "Filling Station",
};
// Ribbon button text where the full name is too wide; the tooltip keeps the full name.
const INSERT_TOOL_SHORT_LABELS = {
  handover_point: "Handover / CG",
};
const INSERT_ENTITY_BUTTONS = [
  { type: "plant", implemented: true },
  { type: "tank", implemented: true },
  { type: "handover_point", implemented: true },
  { type: "node", implemented: true },
  { type: "pump", implemented: true },
  { type: "filling_station", implemented: true },
];
// Canvas-only entity types: created on the canvas with CanvasEntityModal,
// with no Asset Registry record behind them.
const CANVAS_ONLY_ENTITY_TYPES = new Set(["filling_station"]);
const INSERT_ASSET_ENTITY_TYPES = new Set(INSERT_ENTITY_BUTTONS
  .filter(({ type }) => type !== "node" && !CANVAS_ONLY_ENTITY_TYPES.has(type))
  .map(({ type }) => type));
const ENTITY_TYPES_LIST = [
  { type: "plant", label: "Plant", description: "Production asset" },
  { type: "pump", label: "Pump Station", description: "Pumping asset" },
  { type: "tank", label: "Tank", description: "Storage asset" },
  { type: "handover_point", label: "Handover Point", description: "City gate / HP" },
  { type: "filling_station", label: "Filling Station", description: "Delivery point (canvas only)" },
  { type: "node", label: "Node", description: "Junction node" },
];
const ENTITY_ICONS = {
  plant: IconPlant,
  tank: IconStorageTank,
  handover_point: IconTarget,
  node: EmptyIcon,
  pump: IconDroplet,
  stp: IconTreatmentPlant,
  filling_station: IconBriefcase,
};
const IconTextDecrease = ({ size = 15, className = "", style = {}, ...props }) => (
  <span
    aria-hidden="true"
    className={className}
    style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: size,
      height: size,
      fontSize: typeof size === "number" ? Math.max(10, Math.round(size * 0.78)) : size,
      fontWeight: 700,
      lineHeight: 1,
      ...style,
    }}
    {...props}
  >
    A-
  </span>
);
const IconTextIncrease = ({ size = 15, className = "", style = {}, ...props }) => (
  <span
    aria-hidden="true"
    className={className}
    style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: size,
      height: size,
      fontSize: typeof size === "number" ? Math.max(10, Math.round(size * 0.78)) : size,
      fontWeight: 700,
      lineHeight: 1,
      ...style,
    }}
    {...props}
  >
    A+
  </span>
);
const ANNOTATION_TYPES = ["note", "group-box"];
const NOTE_SIZES = ["small", "normal", "large", "xlarge"];
// Toolbar "Arrange" kinds → cytoscape/align.js alignment modes.
const ARRANGE_ALIGN_MODES = {
  left: "left", right: "right", centerh: "centerH",
  top: "top", bottom: "bottom", centerv: "middleV",
};
// Producing sources and demand sinks, for the supply-path validation rule.
// Pipe spec fields kept as text; every other spec edited in the inspector is numeric.
const STRING_SPEC_FIELDS = new Set([
  "pipelineMaterial",
  "infraSource",
  "transmissionSystemId",
  "transmissionLineId",
  "capacityLimitationType",
  "commissioningDate",
  "decommissioningDate",
]);
const SUPPLY_NODE_TYPES = new Set(["plant", "stp"]);
const DELIVERY_NODE_TYPES = new Set(["handover_point", "filling_station"]);
const ACTIVE_STATUSES = new Set(["operational", "maintenance", "under_construction", "planned"]);
const INACTIVE_STATUSES = new Set(["inactive", "decommissioned"]);
const TRACE_ROOT_TYPES = new Set(["handover_point", "point", "filling_station", "filling-station", "distribution_point", "distribution-point"]);
const TRACE_SOURCE_TYPES = new Set(["plant", "stp"]);
const firstNumeric = (...values) => {
  for (const value of values) {
    if (value === "" || value == null) continue;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
};

const extractEdgeFlowValue = (edge) => {
  const data = edge.data();
  const meta = data.meta || {};
  const spec = meta.specifications || {};
  return firstNumeric(
    data.total_flow,
    data.totalFlow,
    data.flow,
    data.flowAmount,
    meta.total_flow,
    meta.totalFlow,
    meta.flow,
    meta.flowAmount,
    spec.total_flow,
    spec.totalFlow,
    spec.flow,
    spec.flowAmount,
    spec.currentFlow
  );
};

const buildFlowByEdge = (cy) => {
  const flowByEdge = {};
  cy.edges().forEach((edge) => {
    const flow = extractEdgeFlowValue(edge);
    if (flow != null) flowByEdge[edge.id()] = flow;
  });
  return flowByEdge;
};


// Snapshot the asset fields we keep with a placed element so the graph renders
// offline even if the source asset later changes.
const assetMeta = (a) => ({
  region: a.region,
  // Lifecycle dates, shown in the Details panel.
  commissioning_date: a.commissioning_date,
  decommissioning_date: a.decommissioning_date,
  cluster: a.cluster,
  asset_type: a.asset_type,
  latitude: a.latitude,
  longitude: a.longitude,
  active: a.active,
  entity_category: a.entity_category,
  specifications: a.specifications || {},
});

// Normalized graph <-> payload helpers (also used for import/export). Nodes keep
// their full data + position; edges keep full data. Older saves used a flat
// shape, so addGraph tolerates both.
const serializeGraph = (cy) => ({
  // cardIcon / cardStatusColor are derived (see entitySymbol.js) and are
  // recomputed on load — persisting them would freeze a stale symbol style.
  nodes: cy.nodes().map((n) => {
    const { cardIcon, cardStatusColor, ...data } = n.data();
    return { data, position: { ...n.position() } };
  }),
  edges: cy.edges().map((e) => ({ data: { ...e.data() } })),
});

const elementData = (element) => element?.data || element || {};

const graphPosition = (element, index = 0) => element?.position || {
  x: (index % 3) * 130,
  y: Math.floor(index / 3) * 96,
};

const download = (name, text, mime) => {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
};

const csvCell = (v) => {
  if (v == null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Specification keys the pipe form owns (see PipeVariablesModal / submitPipe).
const PIPE_FORM_SPEC_KEYS = [
  "capacity", "pipelineLength", "pipelineDiameter", "pipelineMaterial", "designCapacity", "maximumCapacity",
  "infraSource", "bidirectional", "transmissionSystemId", "lineGroupIds", "capacityLimitationType",
  "capacityLimitationValue",
];
const asInput = (value) => (value == null ? "" : String(value));
// Pre-fill for Details → Edit on a pipe.
const pipeFormFromEdge = (edge) => {
  const data = edge.data();
  const spec = data.meta?.specifications || {};
  return {
    name: data.label || "",
    capacity: asInput(spec.capacity),
    pipelineLength: asInput(spec.pipelineLength),
    pipelineDiameter: asInput(spec.pipelineDiameter),
    pipelineMaterial: spec.pipelineMaterial || "",
    designCapacity: asInput(spec.designCapacity),
    maximumCapacity: asInput(spec.maximumCapacity),
    infraSource: spec.infraSource || "",
    commissioningDate: data.commissioningDate || "",
    decommissioningDate: data.decommissioningDate || "",
    active: data.active != null ? !!data.active : data.status !== "inactive",
    bidirectional: !!spec.bidirectional,
    transmissionSystemId: spec.transmissionSystemId || "",
    lineGroupIds: Array.isArray(spec.lineGroupIds) ? spec.lineGroupIds.slice(0, 1) : [],
    capacityLimitationType: spec.capacityLimitationType || "none",
    capacityLimitationValue: asInput(spec.capacityLimitationValue),
  };
};

const toolbarEntityLabel = (type) => INSERT_TOOL_LABELS[type] || ENTITY_TYPE_LABELS[type] || type;
const matchesText = (needle, ...values) =>
  values.some((value) => value && String(value).toLowerCase().includes(needle));

const isInactiveElement = (el) => {
  const data = el.data();
  const status = String(data.status || "").toLowerCase();
  return data.active === false || data.meta?.active === false || INACTIVE_STATUSES.has(status);
};

const isActiveElement = (el) => {
  const data = el.data();
  const status = String(data.status || "").toLowerCase();
  return !isInactiveElement(el) && (
    data.active === true ||
    data.meta?.active === true ||
    ACTIVE_STATUSES.has(status)
  );
};

// The WIPlan-style network canvas. Used standalone by the Network Builder
// (workspaceMode "builder": workspace tabs, saved-networks rail, URL deep
// links, IndexedDB recovery) and embedded by Simulation Config (workspaceMode
// "simulation": the host owns the document and saving, as SWIIMS embeds
// NetworkSimulation2Page with a controlled snapshot).
export default function NetworkCanvasWorkspace({
  workspaceMode = "builder",
  controlledDocument = null,
  controlledName = "",
  controlledDescription = "",
  readOnly = false,
  plan = null,
  horizonStart = null,
  horizonEnd = null,
  canvasFocus = null,
  onControlledSave = null,
  onDirtyChange = null,
  onRun = null,
  running = false,
  readOnlyNotice = null,
} = {}) {
  const isBuilder = workspaceMode === "builder";
  const { id: routeId } = useParams();
  const id = isBuilder ? routeId : null;
  const navigate = useNavigate();
  const { setToolbar, setSidebar } = useLayout();
  // One live Cytoscape graph per mounted canvas: the builder keeps the
  // application-wide controller its workspace layer is bound to; an embedded
  // canvas gets its own so it can never disturb the builder's tabs.
  const controller = useMemo(() => (isBuilder ? canvasController : new CanvasController()), [isBuilder]);
  const [embeddedDirty, setEmbeddedDirty] = useState(false);
  const hostRef = useRef({});
  hostRef.current = {
    onDirtyChange: (next) => {
      setEmbeddedDirty(next);
      onDirtyChange?.(next);
    },
    onControlledSave,
  };
  const ws = useMemo(
    () => (isBuilder ? workspaceController : createEmbeddedWorkspace(() => hostRef.current)),
    [isBuilder]
  );

  const containerRef = useRef(null);
  const canvasWrapRef = useRef(null);
  const cyRef = useRef(null);
  const modeRef = useRef("select");
  const lineSourceRef = useRef(null);
  const pendingPlacementRef = useRef(null); // asset armed for placement
  const pendingEntityRef = useRef(null); // blank entity type being inserted
  const insertEdgeRef = useRef(null);
  const insertPositionRef = useRef(null);
  const saveTimerRef = useRef(null);
  const showLabelsRef = useRef(true);
  const clipboardRef = useRef(null);
  const fileInputRef = useRef(null);
  const historyRef = useRef({ past: [], present: null, future: [] });
  const restoringRef = useRef(false);
  const commitPendingRef = useRef(false);
  // Bumped by resetHistory so a debounced commit queued before a reset (e.g.
  // an edit right before a tab switch) cannot land in the new baseline.
  const historyEpochRef = useRef(0);
  const areaRef = useRef(null);
  const traceRunRef = useRef(null);
  const traceToggleRef = useRef(null);
  const traceRootsRef = useRef([]);
  const snapToGridRef = useRef(false);
  const grabbedNodeRef = useRef(null); // the node actually under the cursor
  const hoveredEdgeRef = useRef(null);
  const overlayFrameRef = useRef(null);
  // Late-bound actions for the right-click menu, which is registered once at
  // mount (before these handlers exist).
  const menuActionsRef = useRef({});

  const [cyReady, setCyReady] = useState(false);
  const [mode, setMode] = useState("select");
  const [pendingAsset, setPendingAsset] = useState(null);
  const [pendingSystem, setPendingSystem] = useState(null);
  const [pendingEntity, setPendingEntity] = useState(null);
  const [lineSource, setLineSource] = useState(null);
  const [selectedEl, setSelectedEl] = useState(null);
  const [hasSelection, setHasSelection] = useState(false);
  const [selectedCount, setSelectedCount] = useState(0);
  const [selectedEdgeCount, setSelectedEdgeCount] = useState(0);
  const [selectedDeletableCount, setSelectedDeletableCount] = useState(0);
  const [counts, setCounts] = useState({ nodes: 0, edges: 0 });
  const [placedIds, setPlacedIds] = useState(new Set());
  // The document identity lives on the active workspace, so renaming a tab and
  // the page header can never disagree.
  const activeWorkspaceId = useWorkspaceStore((state) => state.activeWorkspaceId);
  // Select the workspace itself — a stable reference between Immer updates —
  // and derive from it. Returning a fresh object from the selector would give
  // useSyncExternalStore a new snapshot every call and spin forever.
  const activeWorkspace = useWorkspaceStore((state) =>
    state.activeWorkspaceId ? state.instances[state.activeWorkspaceId] : null
  );
  const network = useMemo(
    () => (isBuilder
      ? {
          id: activeWorkspace?.document.networkId ?? null,
          name: activeWorkspace?.document.name ?? "",
          description: activeWorkspace?.document.description ?? "",
        }
      : { id: null, name: controlledName || "", description: controlledDescription || "" }),
    [isBuilder, activeWorkspace, controlledName, controlledDescription]
  );
  const [saveStatus, setSaveStatus] = useState("idle");
  const [showLibrary, setShowLibrary] = useState(true);
  const [showRail, setShowRailState] = useState(() => readFlag(LEFT_RAIL_PREF, true));
  const [showRibbon, setShowRibbonState] = useState(() => readFlag(TOOLBAR_PREF, true));
  const setShowRail = useCallback((next) => {
    setShowRailState((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      writeFlag(LEFT_RAIL_PREF, value);
      return value;
    });
  }, []);
  const setShowRibbon = useCallback((next) => {
    setShowRibbonState((prev) => {
      const value = typeof next === "function" ? next(prev) : next;
      writeFlag(TOOLBAR_PREF, value);
      return value;
    });
  }, []);
  const [toast, setToast] = useState(null);
  const [pipeModal, setPipeModal] = useState({ open: false, source: null, target: null });
  const [insertModal, setInsertModal] = useState({ open: false });
  const [transmissionSystems, setTransmissionSystems] = useState([]);
  const [transmissionLines, setTransmissionLines] = useState([]);
  const [canvasEntityModal, setCanvasEntityModal] = useState(null); // { type, mode, targetId, position }
  const [capacityPrompt, setCapacityPrompt] = useState(null); // [{ id, name, type }]
  const [kmzReview, setKmzReview] = useState(null); // { imported, fileName, rows }
  const [entityModal, setEntityModal] = useState({ open: false, type: null, position: null, mode: null, form: null, editId: null });
  const [showLabels, setShowLabels] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(() => {
    try {
      return window.localStorage.getItem(SNAP_TO_GRID_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });
  const [symbolShape, setSymbolShapeState] = useState(getEntitySymbolShape);
  // Midpoint dots on the hovered pipe; clicking one drops a bend there.
  const [edgeOverlay, setEdgeOverlay] = useState({ edgeId: null, handles: [] });
  const showInspector = useInspectorStore((state) => state.open);
  const setShowInspector = useCallback((next) => {
    const open = typeof next === "function" ? next(inspectorStore.getState().open) : next;
    if (open) inspectorStore.getState().openInspector();
    else inspectorStore.getState().closeInspector();
  }, []);
  const [canvasFocusMode, setCanvasFocusMode] = useState(false);
  // Full screen collapses the toolbar too; this lets you reopen it for a
  // moment without leaving full screen (and without touching the remembered
  // toolbar preference). Reset every time full screen is entered.
  const [focusRibbonOpen, setFocusRibbonOpen] = useState(false);
  // Both side rails resize from their inner edge; widths are remembered.
  const leftRailSize = useSidebarResize({ key: "nb.leftRailWidth", side: "left", initial: 232, min: 190, max: 440 });
  const rightPanelSize = useSidebarResize({ key: "nb.rightPanelWidth", side: "right", initial: 300, min: 250, max: 520 });
  useEffect(() => {
    if (canvasFocusMode) setFocusRibbonOpen(false);
  }, [canvasFocusMode]);
  const [showMinimap, setShowMinimap] = useState(true);
  // Schematic (Cytoscape) vs geographic (Leaflet) view. `geoTick` forces the
  // geo derivations to recompute after an anchor pin, a map drag, or a route.
  const [viewMode, setViewMode] = useState("schematic");
  const [geoTick, setGeoTick] = useState(0);
  const [isolationActive, setIsolationActive] = useState(false);
  // The panel no longer has a Trace tab (trace results live in the floating
  // TracePanel), so a workspace saved on it reopens on Details.
  const rightPanelTab = useInspectorStore((state) => (state.activeTab === "trace" ? "details" : state.activeTab));
  // Selecting a tab always opens the panel: every existing call site set both.
  const setRightPanelTab = useCallback(
    (tab) => inspectorStore.getState().openInspector(tab),
    []
  );
  const setIssuePanelMode = useCallback(
    (mode) => issuesStore.getState().setMode(mode),
    []
  );
  const [validationIssues, setValidationIssues] = useState([]);
  const [isolationQuery, setIsolationQuery] = useState("");
  const [activeIsolationLabel, setActiveIsolationLabel] = useState("");
  const [activeIsolationKey, setActiveIsolationKey] = useState("");
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [areaBox, setAreaBox] = useState(null); // {x,y,w,h} while area-zoom dragging
  const [boxSelect, setBoxSelect] = useState(null); // {x,y,w,h} while right-drag selecting
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // Bumped whenever element data changes, so the sidebar re-reads the graph.
  const [assetPanelVersion, setAssetPanelVersion] = useState(0);
  const [traceInfo, setTraceInfo] = useState(null);
  const [traceMode, setTraceMode] = useState("reachable");
  const [histTick, setHistTick] = useState(0); // forces undo/redo enable refresh
  const [ribbonTab, setRibbonTab] = useState("home");

  // ── Right panel: assets, filters and insights ──────────────────────────────
  // The panel reads the live graph as plain records once, then counts, charts
  // and ranks from those. `counts` moves on every add/remove and
  // `assetPanelVersion` on every data edit, which is what makes it re-read.
  const canvasAssetList = useMemo(
    () => (cyReady ? readCanvasAssets(cyRef.current) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cyReady, counts, placedIds, assetPanelVersion]
  );

  const assetSummary = useMemo(() => summarizeCategories(canvasAssetList), [canvasAssetList]);





  const categoryColour = useCallback(
    (key) => (key === PIPELINE_KEY ? "#5b7ca3" : ENTITY_TYPE_COLORS[key] || "#94a3b8"),
    []
  );




  // ── Graph → React sync ─────────────────────────────────────────────────────
  const syncGraph = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const realNodes = cy.nodes().filter((n) => !ANNOTATION_TYPES.includes(n.data("type")));
    setCounts({ nodes: realNodes.length, edges: cy.edges().length });
    const ids = new Set();
    cy.elements().forEach((el) => {
      const a = el.data("assetId");
      if (a) ids.add(a);
    });
    setPlacedIds(ids);
  }, []);

  const syncSelection = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const sel = cy.$(":selected");
    // Workspace-level selection identity: IDs only. The `selectedEl` object
    // below stays a derived view-model for the editing forms.
    selectionStore.getState().setSelection(sel.map((el) => el.id()));
    setHasSelection(sel.length > 0);
    setSelectedCount(sel.length);
    setSelectedEdgeCount(sel.filter((el) => el.isEdge()).length);
    // Everything selectable can be deleted: assets, pipes, notes, group boxes.
    setSelectedDeletableCount(sel.length);
    if (sel.length !== 1) {
      setSelectedEl(null);
      return;
    }
    const el = sel[0];
    if (el.isEdge()) {
      setSelectedEl({
        _group: "edge",
        ...el.data(),
        sourceLabel: cy.getElementById(el.data("source")).data("label") || el.data("source"),
        targetLabel: cy.getElementById(el.data("target")).data("label") || el.data("target"),
      });
    } else {
      setSelectedEl({ _group: "node", ...el.data() });
    }
  }, []);

  // ── Undo / redo history ─────────────────────────────────────────────────────
  const commitHistory = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const h = historyRef.current;
    if (h.present !== null) h.past.push(h.present);
    h.present = snapshotElements(cy);
    h.future = [];
    if (h.past.length > 80) h.past.shift();
    setHistTick((t) => t + 1);
    // Keep an open Map view in step with schematic edits (no-op cost when the
    // map is closed — buildGeoData is only run while viewMode is "map").
    setGeoTick((t) => t + 1);
  }, []);

  const scheduleCommit = useCallback(() => {
    // A workspace restore replays the whole graph through add/remove; without
    // this guard the incoming workspace would arrive dirty with a history
    // entry already committed.
    if (restoringRef.current || controller.isRestoring()) return;
    // Document mutations funnel through here, which makes this the single
    // hook point for dirty tracking and debounced recovery writes.
    ws.notifyDocumentMutated();
    if (commitPendingRef.current) return;
    commitPendingRef.current = true;
    const epoch = historyEpochRef.current;
    setTimeout(() => {
      commitPendingRef.current = false;
      if (epoch !== historyEpochRef.current) return;
      commitHistory();
    }, 0);
  }, [commitHistory]);

  const resetHistory = useCallback(() => {
    const cy = cyRef.current;
    historyEpochRef.current += 1;
    commitPendingRef.current = false;
    historyRef.current = { past: [], present: cy ? snapshotElements(cy) : [], future: [] };
    setHistTick((t) => t + 1);
  }, []);

  const restoreEls = useCallback(
    (snap) => {
      const cy = cyRef.current;
      if (!cy) return;
      const cleanSnap = (snap || []).map(stripTransientClasses);
      restoringRef.current = true;
      cy.elements().remove();
      cy.add(cleanSnap);
      restoringRef.current = false;
      syncGraph();
      syncSelection();
    },
    [syncGraph, syncSelection]
  );

  const handleUndo = useCallback(() => {
    const h = historyRef.current;
    if (!h.past.length) return;
    h.future.unshift(h.present);
    h.present = h.past.pop();
    restoreEls(h.present);
    setHistTick((t) => t + 1);
  }, [restoreEls]);

  const handleRedo = useCallback(() => {
    const h = historyRef.current;
    if (!h.future.length) return;
    h.past.push(h.present);
    h.present = h.future.shift();
    restoreEls(h.present);
    setHistTick((t) => t + 1);
  }, [restoreEls]);

  // Create an ad-hoc pipe edge between two nodes. `active` drives the derived
  // `status` (used for the canvas status color band) since the pipe modal has
  // no separate Status field, only Active.
  const createPipeEdge = useCallback(({ source, target, label, active, commissioningDate, decommissioningDate, specs }) => {
    const cy = cyRef.current;
    if (!cy) return;
    const name = (label && label.trim()) || "Pipe";
    const edge = cy.add({
      group: "edges",
      data: {
        id: rid("e"),
        source,
        target,
        kind: "pipe",
        assetId: null,
        label: name,
        displayLabel: name,
        status: active ? "operational" : "inactive",
        active: !!active,
        commissioningDate: commissioningDate || "",
        decommissioningDate: decommissioningDate || "",
        meta: { specifications: specs || {} },
      },
    });
    cy.$(":selected").unselect();
    edge.select();
    return edge;
  }, []);

  const createJunctionNode = useCallback(
    (position) => {
      const cy = cyRef.current;
      if (!cy) return null;
      const node = cy.add({
        group: "nodes",
        data: { id: rid("n"), type: "node", category: "node", label: "", displayLabel: "", status: "", meta: { specifications: {} } },
        position,
      });
      cy.$(":selected").unselect();
      node.select();
      syncSelection();
      return node;
    },
    [syncSelection]
  );

  const clearInsertTarget = useCallback(() => {
    const cy = cyRef.current;
    if (cy) cy.edges().removeClass("insert-target");
    insertEdgeRef.current = null;
    insertPositionRef.current = null;
  }, []);

  // Insert on Pipe (SWIIMS insertEntityOnEdge): the asset lands where the pipe
  // was clicked, projected onto the pipe as drawn; the recorded length is
  // split in the same proportion and each bend stays with its half. The mode
  // then stays armed so several assets can be inserted in a row.
  const splitPipeWithNode = useCallback(
    (node, { keepInsertMode = true } = {}) => {
      const cy = cyRef.current;
      const edgeId = insertEdgeRef.current;
      if (!cy || !node || !edgeId) return false;
      const edge = cy.getElementById(edgeId);
      if (!edge.length) {
        clearInsertTarget();
        return false;
      }

      const srcPos = { ...edge.source().position() };
      const tgtPos = { ...edge.target().position() };
      const plan = planPipeSplit({
        srcPos,
        tgtPos,
        weights: edge.data("cyedgebendeditingWeights") || [],
        distances: edge.data("cyedgebendeditingDistances") || [],
        clickPos: insertPositionRef.current || { ...node.position() },
      });
      const base = cloneData(edge.data());
      delete base.cyedgebendeditingWeights;
      delete base.cyedgebendeditingDistances;
      delete base.bendPointPositions;
      const [firstSpecs, secondSpecs] = splitPipeSpecs(base.meta?.specifications || {}, plan.ratio);
      const baseName = base.label || base.displayLabel || "Pipe";
      const legData = (suffix, specs, source, target) => ({
        ...cloneData(base),
        id: rid("e"),
        source,
        target,
        label: `${baseName} (${suffix})`,
        displayLabel: `${baseName} (${suffix})`,
        meta: { ...(base.meta || {}), specifications: specs },
      });

      let first = null;
      let second = null;
      cy.batch(() => {
        node.position(plan.point);
        const nodePos = { ...plan.point };
        edge.remove();
        first = cy.add({ group: "edges", data: legData("1", firstSpecs, base.source, node.id()) });
        second = cy.add({ group: "edges", data: legData("2", secondSpecs, node.id(), base.target) });
        const firstPairs = bendPointsToPairs(srcPos, nodePos, plan.firstBends);
        const secondPairs = bendPointsToPairs(nodePos, tgtPos, plan.secondBends);
        first.data({ cyedgebendeditingWeights: firstPairs.weights, cyedgebendeditingDistances: firstPairs.distances });
        second.data({ cyedgebendeditingWeights: secondPairs.weights, cyedgebendeditingDistances: secondPairs.distances });
        updateBendClasses(first, firstPairs.weights.length);
        updateBendClasses(second, secondPairs.weights.length);
      });
      cy.$(":selected").unselect();
      node.select();
      clearInsertTarget();
      syncSelection();
      if (keepInsertMode && cy.edges().length) {
        modeRef.current = "insert-on-edge";
        setMode("insert-on-edge");
      }
      return true;
    },
    [clearInsertTarget, syncSelection]
  );

  const placeAssetsAt = useCallback(
    (assetOrAssets, position) => {
      const cy = cyRef.current;
      if (!cy || !assetOrAssets) return;
      const assets = Array.isArray(assetOrAssets) ? assetOrAssets : [assetOrAssets];
      const unplaced = assets.filter((asset) => !cy.nodes().some((n) => n.data("assetId") === asset.id));

      if (!unplaced.length) {
        const first = assets[0];
        setToast(
          assets.length === 1
            ? `"${first?.name || first?.id}" is already on the canvas.`
            : "All selected assets are already on the canvas."
        );
        return [];
      }

      const added = [];
      cy.batch(() => {
        unplaced.forEach((asset, index) => {
          const column = index % 3;
          const row = Math.floor(index / 3);
          const node = cy.add({
            group: "nodes",
            data: {
              id: rid("n"),
              assetId: asset.id,
              category: asset.category,
              type: asset.category,
              label: asset.name || asset.id,
              displayLabel: asset.name || asset.id,
              status: asset.status || "",
              meta: assetMeta(asset),
            },
            position: {
              x: position.x + column * 130,
              y: position.y + row * 96,
            },
          });
          added.push(node);
        });
      });

      cy.$(":selected").unselect();
      if (added.length) cy.collection(added).select();
      syncSelection();
      const missing = added
        .filter((node) => assetCapacity(node.data("meta")?.specifications || {}) == null)
        .map((node) => ({ id: node.id(), name: node.data("label") || node.id(), type: ENTITY_TYPE_LABELS[node.data("type")] || node.data("type") }));
      if (missing.length) setCapacityPrompt(missing);
      if (assets.length > 1) {
        const skipped = assets.length - unplaced.length;
        setToast(
          skipped
            ? `Placed ${unplaced.length} assets; skipped ${skipped} already on canvas.`
            : `Placed ${unplaced.length} assets.`
        );
      }
      return added;
    },
    [syncSelection]
  );

  const mergeTransmissionBundleCatalog = useCallback((bundle) => {
    if (bundle?.system?.id) {
      setTransmissionSystems((prev) => (
        prev.some((system) => system.id === bundle.system.id) ? prev : [...prev, bundle.system]
      ));
    }
    if (Array.isArray(bundle?.lines) && bundle.lines.length) {
      setTransmissionLines((prev) => {
        const seen = new Set(prev.map((line) => line.id));
        const additions = bundle.lines.filter((line) => line?.id && !seen.has(line.id));
        return additions.length ? [...prev, ...additions] : prev;
      });
    }
  }, []);

  const placeTransmissionSystemAt = useCallback(
    (bundle, position) => {
      const cy = cyRef.current;
      if (!cy || !bundle) return [];
      const nodes = Array.isArray(bundle.nodes) ? bundle.nodes : [];
      const edges = Array.isArray(bundle.edges) ? bundle.edges : [];
      if (!nodes.length || !edges.length) {
        setToast(`"${bundle.system?.name || bundle.system?.id || "Transmission system"}" has no saved pipes to place.`);
        return [];
      }

      const positions = nodes.map((node, index) => graphPosition(node, index));
      const minX = Math.min(...positions.map((pos) => pos.x));
      const maxX = Math.max(...positions.map((pos) => pos.x));
      const minY = Math.min(...positions.map((pos) => pos.y));
      const maxY = Math.max(...positions.map((pos) => pos.y));
      const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
      const idMap = new Map();
      const added = [];

      cy.batch(() => {
        nodes.forEach((node, index) => {
          const sourceData = cloneData(elementData(node)) || {};
          const oldId = sourceData.id || node.id;
          const nextId = rid("n");
          idMap.set(oldId, nextId);
          delete sourceData.cardIcon;
          delete sourceData.cardStatusColor;
          const pos = positions[index];
          const addedNode = cy.add({
            group: "nodes",
            data: {
              ...sourceData,
              id: nextId,
              importedFromNodeId: sourceData.originalNodeId || oldId,
              importedFromSystemId: bundle.system?.id || "",
            },
            position: {
              x: position.x + (pos.x - center.x),
              y: position.y + (pos.y - center.y),
            },
          });
          added.push(addedNode);
        });

        edges.forEach((edge) => {
          const sourceData = cloneData(elementData(edge)) || {};
          const nextSource = idMap.get(sourceData.source);
          const nextTarget = idMap.get(sourceData.target);
          if (!nextSource || !nextTarget) return;
          const addedEdge = cy.add({
            group: "edges",
            data: {
              ...sourceData,
              id: rid("e"),
              source: nextSource,
              target: nextTarget,
              importedFromEdgeId: sourceData.originalEdgeId || sourceData.id || edge.id,
              importedFromSystemId: bundle.system?.id || "",
            },
          });
          added.push(addedEdge);
        });
      });

      cy.$(":selected").unselect();
      if (added.length) cy.collection(added).select();
      syncSelection();
      setToast(`Placed ${bundle.system?.name || "transmission system"} with ${nodes.length} nodes and ${edges.length} pipes.`);
      return added;
    },
    [syncSelection]
  );

  const [traceInfos, setTraceInfos] = useState([]);
  const clearTraceCanvas = useCallback((message) => {
    const cy = cyRef.current;
    if (cy) clearTraceClasses(cy);
    traceRootsRef.current = [];
    setTraceInfos([]);
    setTraceInfo(null);
    if (message) setToast(message);
  }, []);

  const runTrace = useCallback(
    (node, requestedMode = traceMode) => {
      const cy = cyRef.current;
      if (!cy || !node?.length) return;
      const flowByEdge = buildFlowByEdge(cy);
      const trace = computeTrace(cy, node.id(), { flowByEdge, mode: requestedMode });
      paintTrace(cy, trace);
      const { sources, dests } = traceNeighbours(cy, trace);
      const ultimateSources = Array.from(trace.up.nodes)
        .map((nodeId) => cy.getElementById(nodeId))
        .filter((upstreamNode) => upstreamNode?.length && TRACE_SOURCE_TYPES.has(upstreamNode.data("type")))
        .map((upstreamNode) => ({
          id: upstreamNode.id(),
          name: upstreamNode.data("label") || upstreamNode.data("displayLabel") || upstreamNode.id(),
          type: upstreamNode.data("type"),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      setTraceInfo({
        rootId: trace.rootId,
        rootName: node.data("label") || node.data("displayLabel") || node.id(),
        rootType: node.data("type") || node.data("category") || "",
        upCount: trace.up.nodes.size,
        downCount: trace.down.nodes.size,
        upEdgeCount: trace.up.edges.size,
        downEdgeCount: trace.down.edges.size,
        sources,
        dests,
        hasFlow: trace.hasFlow,
        mode: trace.mode,
        requestedMode: trace.requestedMode,
        ultimateSources,
      });
      if (requestedMode === "delivered" && !trace.hasFlow) {
        setToast("No flow results are attached to these pipes yet, so Trace is showing reachable topology.");
      }
    },
    [traceMode]
  );

  traceRunRef.current = runTrace;

  // Multi-root trace (SWIIMS applyTraceRoots): every root walks the direction
  // its type implies; overlaps between roots / directions paint as "shared".
  const applyTraceRoots = useCallback(
    (roots, requestedMode = traceMode) => {
      const cy = cyRef.current;
      if (!cy) return;
      traceRootsRef.current = roots;
      if (!roots.length) {
        clearTraceClasses(cy);
        setTraceInfos([]);
        setTraceInfo(null);
        return;
      }
      const flowByEdge = buildFlowByEdge(cy);
      const infos = roots.map((id) => buildTraceInfo(cy, id, { flowByEdge, mode: requestedMode })).filter(Boolean);
      paintMultiTrace(cy, aggregateTraceMembership(infos.map((info) => ({ ...info.trace, rootId: info.rootId }))));
      setTraceInfos(infos);
      const last = infos[infos.length - 1];
      if (last) {
        setTraceInfo({
          rootId: last.rootId,
          rootName: last.rootName,
          rootType: last.rootType,
          upCount: last.upCount,
          downCount: last.downCount,
          upEdgeCount: last.direction === "downstream" ? 0 : last.trace.up.edges.size,
          downEdgeCount: last.direction === "upstream" ? 0 : last.trace.down.edges.size,
          sources: last.sources,
          dests: last.dests,
          hasFlow: last.hasFlow,
          mode: last.mode,
          requestedMode: last.requestedMode,
          ultimateSources: last.terminalSources,
        });
      }
      if (requestedMode === "delivered" && infos.length && !infos[0].hasFlow) {
        setToast("No flow results are attached to these pipes yet, so Trace is showing reachable topology.");
      }
    },
    [traceMode]
  );
  traceToggleRef.current = (node) => {
    const next = toggleTraceRoot(traceRootsRef.current, node.id());
    applyTraceRoots(next);
  };

  // ── Grid, snapping and bend-point plumbing ─────────────────────────────────
  // The grid is a CSS background on the wrapper rather than a Cytoscape layer,
  // so pan/zoom have to be mirrored onto custom properties by hand. The pitch
  // adapts (see computeGridPitch) so the mesh never collapses into a solid fill
  // when zoomed out or stretches into nothing when zoomed in.
  const updateGridBackground = useCallback(() => {
    const wrap = canvasWrapRef.current;
    const cy = cyRef.current;
    if (!wrap || !cy) return;

    const pan = cy.pan();
    const zoom = cy.zoom();
    const { minor, major, minorAlpha } = computeGridPitch(zoom, CANVAS_GRID_PITCH);
    const minorPx = minor * zoom;
    const majorPx = major * zoom;

    wrap.style.setProperty("--grid-size", `${minorPx}px`);
    wrap.style.setProperty("--grid-major-size", `${majorPx}px`);
    wrap.style.setProperty("--grid-minor-alpha", String(minorAlpha));
    wrap.style.setProperty("--grid-offset-x", `${wrapOffset(pan.x, minorPx)}px`);
    wrap.style.setProperty("--grid-offset-y", `${wrapOffset(pan.y, minorPx)}px`);
    wrap.style.setProperty("--grid-major-offset-x", `${wrapOffset(pan.x, majorPx)}px`);
    wrap.style.setProperty("--grid-major-offset-y", `${wrapOffset(pan.y, majorPx)}px`);
  }, []);

  const applyZoomLod = useCallback(() => {
    applyZoomLodTo(cyRef.current);
  }, []);

  // cytoscape-edge-editing draws its drag anchors on a Konva stage layered over
  // the container. It does not resize or re-place that stage itself, and it
  // keeps drawing anchors for edges that are no longer selected.
  const syncBendEditingOverlay = useCallback(() => {
    const cy = cyRef.current;
    const container = containerRef.current;
    if (!cy || !container) return;

    // Re-derive bend state from the weight/distance arrays before drawing:
    // they are the source of truth, and the plugin occasionally drops the
    // marker class (or leaves stale absolute positions behind) while working
    // an anchor, which would otherwise straighten a bent pipe on the next
    // node drag.
    restoreBendClasses(cy);

    const bentEdges = cy.edges(`.${BEND_CLASS}`);
    // Visibility follows "are there any bends at all", not "is a bent pipe
    // selected": the plugin unselects an edge while its anchors are being
    // dragged, and a stage that disappears mid-drag never receives the mouseup
    // it does its bookkeeping in (see restoreInteraction below).
    container.querySelectorAll('[id^="cy-node-edge-editing-stage"]').forEach((overlay) => {
      overlay.style.position = "absolute";
      overlay.style.top = "0";
      overlay.style.left = "0";
      overlay.style.width = `${container.clientWidth}px`;
      overlay.style.height = `${container.clientHeight}px`;
      overlay.style.zIndex = "999";
      overlay.style.display = bentEdges.length ? "block" : "none";
    });

    const api = typeof cy.edgeEditing === "function" ? cy.edgeEditing("get") : null;
    api?.initAnchorPoints?.(bentEdges);
  }, []);

  // cytoscape-edge-editing turns off grabbing, selection and panning while an
  // anchor is being dragged, and clears those flags again only from a Konva
  // "mouse released over the stage" handler. Release anywhere else — outside
  // the canvas, or over a bend this canvas has just rewritten — and the flags
  // stay set, which reads to the user as "after touching a bend I can't move
  // my assets any more". Every gesture therefore ends by putting the canvas
  // back into its normal interactive state.
  const restoreInteraction = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;

    // The plugin does that cleanup itself in a Konva "mouse released over the
    // stage" handler — it resets the flags, releases the anchor it thinks is
    // still held (a stuck one keeps being redrawn, even for a deleted pipe)
    // and redraws. It binds that handler only while an anchor is being
    // dragged, so firing the event at the end of every gesture is a no-op the
    // rest of the time, and the real fix when the release never reached it.
    const stage = Konva.stages?.find((candidate) =>
      containerRef.current?.contains(candidate.container())
    );
    stage?.fire?.("contentMouseup");

    if (cy.autoungrabify()) cy.autoungrabify(false);
    if (cy.autounselectify()) cy.autounselectify(false);
    if (!cy.panningEnabled()) cy.panningEnabled(true);
    if (!cy.zoomingEnabled()) cy.zoomingEnabled(true);
    if (!cy.boxSelectionEnabled()) cy.boxSelectionEnabled(true);
  }, []);

  // Ghost handles: a dot at the midpoint of every current pipe segment, so a
  // bend is discoverable without knowing about the context menu.
  const syncEdgeOverlay = useCallback(() => {
    const cy = cyRef.current;
    const edgeId = hoveredEdgeRef.current;
    if (!cy || !edgeId) return;

    const edge = cy.getElementById(edgeId);
    if (!edge || !edge.length || edge.hasClass("nb-isolate-hidden")) {
      setEdgeOverlay({ edgeId: null, handles: [] });
      return;
    }

    const pan = cy.pan();
    const zoom = cy.zoom();
    const polyline = edgePolyline(edge);
    const handles = polyline.slice(0, -1).map((point, index) => {
      const next = polyline[index + 1];
      const mid = { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 };
      return {
        key: index,
        x: mid.x * zoom + pan.x,
        y: mid.y * zoom + pan.y,
        model: mid,
      };
    });

    setEdgeOverlay({ edgeId, handles });
  }, []);

  const clearEdgeOverlay = useCallback(() => {
    hoveredEdgeRef.current = null;
    setEdgeOverlay((prev) => (prev.edgeId === null ? prev : { edgeId: null, handles: [] }));
  }, []);

  // Both overlays are redrawn on pan/zoom/drag, so coalesce to one per frame.
  const scheduleOverlaySync = useCallback(() => {
    if (overlayFrameRef.current) return;
    overlayFrameRef.current = requestAnimationFrame(() => {
      overlayFrameRef.current = null;
      syncEdgeOverlay();
      syncBendEditingOverlay();
    });
  }, [syncEdgeOverlay, syncBendEditingOverlay]);

  const addBendAtModelPoint = useCallback(
    (edgeId, modelPoint, options) => {
      const cy = cyRef.current;
      if (!cy) return;
      const edge = cy.getElementById(edgeId);
      // A double-click fires the midpoint handle's mousedown twice before React
      // can re-render it, so every add is guarded against stacking bends.
      const minSeparation = BEND_GRAB_RADIUS_PX / 2 / (cy.zoom() || 1);
      if (!addBendPoint(edge, modelPoint, { minSeparation, ...options })) return;
      scheduleCommit();
      syncEdgeOverlay();
      syncBendEditingOverlay();
      restoreInteraction();
    },
    [scheduleCommit, syncEdgeOverlay, syncBendEditingOverlay, restoreInteraction]
  );

  const handleRemoveAllBends = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const bent = cy.edges(`:selected.${BEND_CLASS}`);
    if (!bent.length) {
      setToast("Select a bent pipe first.");
      return;
    }
    bent.forEach((edge) => removeAllBendPoints(edge));
    scheduleCommit();
    clearEdgeOverlay();
    syncBendEditingOverlay();
    restoreInteraction();
  }, [scheduleCommit, clearEdgeOverlay, syncBendEditingOverlay, restoreInteraction]);

  // ── Cytoscape init (mount once) ──────────────────────────────────────────────
  useEffect(() => {
    // cytoscape-edge-editing mounts a Konva stage next to the canvas and does
    // not always take it back down; a remount would otherwise stack them.
    containerRef.current
      ?.querySelectorAll('[id^="cy-node-edge-editing-stage"]')
      .forEach((el) => el.remove());

    // CanvasController owns construction and destruction; this page keeps
    // ownership of what the graph means — the handlers and extensions below.
    const cy = controller.initialize(containerRef.current);
    cyRef.current = cy;
    // Dev-only handle for in-browser verification of canvas behaviour.
    if (import.meta.env?.DEV) window.__widispatchCy = cy;

    const clearDrawSource = () => {
      cy.$(".draw-source").removeClass("draw-source");
      lineSourceRef.current = null;
      setLineSource(null);
    };
    const backToSelect = () => {
      modeRef.current = "select";
      setMode("select");
    };

    // Background tap: place assets / entities / notes, or cancel a pipe.
    cy.on("tap", (evt) => {
      if (evt.target !== cy) return;
      const m = modeRef.current;

      if (m === "trace") {
        clearTraceClasses(cy);
        setTraceInfo(null);
        return;
      }

      if (m === "place-entity" && pendingEntityRef.current) {
        const type = pendingEntityRef.current;
        if (CANVAS_ONLY_ENTITY_TYPES.has(type)) {
          pendingEntityRef.current = null;
          setPendingEntity(null);
          setCanvasEntityModal({ type, mode: "create", targetId: null, position: { x: evt.position.x, y: evt.position.y } });
          backToSelect();
          return;
        }
        if (INSERT_ASSET_ENTITY_TYPES.has(type)) {
          pendingEntityRef.current = null;
          setPendingEntity(null);
          setEntityModal({
            open: true,
            type,
            position: { x: evt.position.x, y: evt.position.y },
            mode: "create",
            form: null,
            editId: null,
          });
          backToSelect();
          return;
        }
        createJunctionNode({ x: evt.position.x, y: evt.position.y });
        return; // sticky — keep placing
      }

      if (m === "place-note") {
        const node = cy.add({
          group: "nodes",
          data: { id: rid("note"), type: "note", category: "note", label: "Note", displayLabel: "Note", noteSize: "normal" },
          position: { x: evt.position.x, y: evt.position.y },
        });
        cy.$(":selected").unselect();
        node.select();
        backToSelect();
        return;
      }

      if (m === "place-asset" && pendingPlacementRef.current) {
        const pending = pendingPlacementRef.current;
        if (pending?._type === "transmission-system") {
          placeTransmissionSystemAt(pending.bundle, { x: evt.position.x, y: evt.position.y });
          pendingPlacementRef.current = null;
          setPendingSystem(null);
          setPendingAsset(null);
          backToSelect();
          return;
        }
        const insertMode = pending?._insertMode === true;
        const assetPayload = insertMode ? pending.asset || pending.assets?.[0] : pending;
        if (insertMode && !assetPayload) {
          setToast("Choose an asset from the library, then click the canvas to place it on the selected pipe.");
          return;
        }
        const added = placeAssetsAt(assetPayload, { x: evt.position.x, y: evt.position.y });
        if (insertMode) {
          const placedNode = added?.[0];
          if (placedNode) splitPipeWithNode(placedNode);
        }
        pendingPlacementRef.current = null;
        setPendingAsset(null);
        backToSelect();
        return;
      }

      if (m === "draw-pipe") {
        clearDrawSource();
      }
    });

    // Node tap: two-click pipe drawing.
    cy.on("tap", "node", (evt) => {
      if (modeRef.current === "trace") {
        const node = evt.target;
        const type = node.data("type") || node.data("category");
        if (!MULTI_TRACE_ROOT_TYPES.has(type)) {
          setToast("Trace from a delivery point, a plant or a tank.");
          return;
        }
        traceToggleRef.current?.(node);
        return;
      }
      if (modeRef.current !== "draw-pipe") return;
      const node = evt.target;
      if (ANNOTATION_TYPES.includes(node.data("type"))) return;
      if (!lineSourceRef.current) {
        lineSourceRef.current = node.id();
        node.addClass("draw-source");
        setLineSource(node.id());
        return;
      }
      if (lineSourceRef.current === node.id()) return;
      const source = lineSourceRef.current;
      const target = node.id();
      clearDrawSource();
      setPipeModal({ open: true, source, target });
      backToSelect();
    });

    // Edge tap: choose an entity/asset to insert on the selected pipe.
    cy.on("tap", "edge", (evt) => {
      if (modeRef.current !== "insert-on-edge") return;
      const edge = evt.target;
      cy.edges().removeClass("insert-target");
      edge.addClass("insert-target");
      insertEdgeRef.current = edge.id();
      insertPositionRef.current = { x: evt.position.x, y: evt.position.y };
      setInsertModal({ open: true });
      backToSelect();
    });

    // ── Bend-point editing ───────────────────────────────────────────────
    // Bends only: the plugin's own menu items, Bezier control points and
    // endpoint reconnection are all off, so the weight/distance arrays stay
    // the single source of truth for a pipe's shape.
    cy.edgeEditing({
      undoable: false,
      bendPositionsFunction: () => null,
      bendPointPositionsSetterFunction: () => {},
      addBendMenuItemTitle: false,
      removeBendMenuItemTitle: false,
      removeAllBendMenuItemTitle: false,
      addControlMenuItemTitle: false,
      removeControlMenuItemTitle: false,
      removeAllControlMenuItemTitle: false,
      handleReconnectEdge: false,
      anchorShapeSizeFactor: 8,
      enableFixedAnchorSize: true,
      zIndex: 999,
      bendRemovalSensitivity: 8,
      anchorColor: currentCyPalette().accent,
      endPointColor: currentCyPalette().accent,
      enableCreateAnchorOnDrag: false,
      // The plugin swallows arrow keys and Space document-wide (to nudge bend
      // points) unless an <input>/<textarea> has focus, which broke typing
      // spaces and moving the caret in notes. Stand down whenever focus is in
      // any text editor, dropdown or form window.
      moveSelectedAnchorsOnKeyEvents: () => {
        const el = document.activeElement;
        return !(
          el &&
          (el.isContentEditable ||
            /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) ||
            el.closest?.('[role="dialog"]'))
        );
      },
    });

    cy.contextMenus({
      evtType: "cxttap",
      menuItems: [
        {
          id: "nb-change-source",
          content: "Change Source",
          selector: "edge",
          onClickFunction: (evt) => menuActionsRef.current.reconnect?.(evt.target || evt.cyTarget, "source"),
        },
        {
          id: "nb-change-target",
          content: "Change Destination",
          selector: "edge",
          onClickFunction: (evt) => menuActionsRef.current.reconnect?.(evt.target || evt.cyTarget, "target"),
        },
        {
          id: "nb-copy-selection",
          content: "Copy Selection",
          selector: "node, edge",
          coreAsWell: true,
          onClickFunction: () => menuActionsRef.current.copy?.(),
        },
        {
          id: "nb-paste-network",
          content: "Paste Network",
          selector: "node, edge",
          coreAsWell: true,
          onClickFunction: () => menuActionsRef.current.paste?.(),
        },
        {
          id: "nb-add-bend",
          content: "Add bend point",
          selector: "edge",
          onClickFunction: (evt) => {
            const edge = evt.target || evt.cyTarget;
            const pos = evt.position || evt.cyPosition;
            if (edge && pos) {
              addBendAtModelPoint(edge.id(), pos, { minOffset: CONTEXT_BEND_MIN_OFFSET });
            }
          },
        },
        {
          id: "nb-remove-bend",
          content: "Remove nearest bend point",
          selector: `edge.${BEND_CLASS}`,
          onClickFunction: (evt) => {
            const edge = evt.target || evt.cyTarget;
            const pos = evt.position || evt.cyPosition;
            if (edge && pos && removeNearestBendPoint(edge, pos)) {
              scheduleCommit();
              scheduleOverlaySync();
            }
            restoreInteraction();
          },
        },
        {
          id: "nb-remove-all-bends",
          content: "Remove all bend points",
          selector: `edge.${BEND_CLASS}`,
          onClickFunction: (evt) => {
            const edge = evt.target || evt.cyTarget;
            if (edge && removeAllBendPoints(edge)) {
              scheduleCommit();
              scheduleOverlaySync();
            }
            restoreInteraction();
          },
        },
      ],
    });

    // Double-click a pipe to add a bend, or to drop the bend you clicked on.
    //
    // Two quirks shape this. Removal cannot ride on Cytoscape's own dblclick:
    // while a bent pipe is selected the plugin's Konva stage sits over the
    // canvas and swallows every pointer event that lands on an anchor — which
    // is exactly where a "delete this bend" double-click lands. So removal is
    // caught on the container in the capture phase, ahead of both, and tells
    // the Cytoscape handler to stand down for that gesture. And either edit has
    // to be applied after the gesture settles: the plugin handles the same
    // double-click and rewrites the weight/distance arrays from its own state,
    // clobbering anything written inside the event turn.
    let removedBendOnDblclick = false;

    // Screen (client) coordinates → Cytoscape model coordinates.
    const toModelPoint = (clientX, clientY) => {
      const container = containerRef.current;
      if (!container) return null;
      const rect = container.getBoundingClientRect();
      const pan = cy.pan();
      const zoom = cy.zoom() || 1;
      return {
        x: (clientX - rect.left - pan.x) / zoom,
        y: (clientY - rect.top - pan.y) / zoom,
      };
    };

    const nearBendAnchor = (clientX, clientY) => {
      const modelPoint = toModelPoint(clientX, clientY);
      if (!modelPoint) return false;
      const grabRadius = BEND_GRAB_RADIUS_PX / (cy.zoom() || 1);
      return cy.edges(`.${BEND_CLASS}`).some((edge) =>
        edgeBendPoints(edge).some(
          (point) => Math.hypot(point.x - modelPoint.x, point.y - modelPoint.y) <= grabRadius
        )
      );
    };

    const dblclickCapture = (event) => {
      const container = containerRef.current;
      if (!container) return;

      const modelPoint = toModelPoint(event.clientX, event.clientY);
      if (!modelPoint) return;
      const zoom = cy.zoom() || 1;
      const grabRadius = BEND_GRAB_RADIUS_PX / zoom;

      // Any bent pipe, not just a selected one: the plugin unselects an edge
      // while it manipulates its anchors, so selection is not a reliable
      // filter here.
      const hit = cy.edges(`.${BEND_CLASS}`).filter((edge) =>
        edgeBendPoints(edge).some(
          (point) => Math.hypot(point.x - modelPoint.x, point.y - modelPoint.y) <= grabRadius
        )
      );
      if (!hit.length) return;

      const edgeId = hit[0].id();
      removedBendOnDblclick = true;
      setTimeout(() => {
        const edge = cy.getElementById(edgeId);
        if (removeNearestBendPoint(edge, modelPoint)) {
          scheduleCommit();
          scheduleOverlaySync();
        }
        restoreInteraction();
      }, BEND_EDIT_DEFER_MS);
    };

    containerRef.current?.addEventListener("dblclick", dblclickCapture, true);

    cy.on("dblclick", "edge", (evt) => {
      if (removedBendOnDblclick) {
        removedBendOnDblclick = false;
        return;
      }
      const edge = evt.target;
      const clickPos = evt.position || evt.cyPosition;
      if (!clickPos) return;

      const grabRadius = BEND_GRAB_RADIUS_PX / (cy.zoom() || 1);
      const onExistingBend = edgeBendPoints(edge).some(
        (point) => Math.hypot(point.x - clickPos.x, point.y - clickPos.y) <= grabRadius
      );
      const edgeId = edge.id();

      setTimeout(() => {
        if (onExistingBend) {
          if (removeNearestBendPoint(cy.getElementById(edgeId), clickPos)) {
            scheduleCommit();
            scheduleOverlaySync();
          }
          restoreInteraction();
          return;
        }
        addBendAtModelPoint(edgeId, clickPos, { minOffset: 0 });
      }, BEND_EDIT_DEFER_MS);
    });

    cy.on("mouseover", "edge", (evt) => {
      if (modeRef.current !== "select") return;
      hoveredEdgeRef.current = evt.target.id();
      syncEdgeOverlay();
    });
    cy.on("mouseout", "edge", clearEdgeOverlay);
    cy.on("remove", "edge", (evt) => {
      if (hoveredEdgeRef.current === evt.target.id()) clearEdgeOverlay();
    });

    // ── Right-drag box select ────────────────────────────────────────────
    // Cytoscape's own box selection is on the left button behind Shift; this
    // adds the right button, which is what operators reach for. A stationary
    // right-click still opens the context menu — only a drag turns into a
    // rectangle, and only then is the browser menu suppressed.
    let boxSelectOrigin = null;
    let boxSelectMoved = false;

    const handleBoxSelectDown = (event) => {
      if (event.button !== 2) return;
      // The bend plugin drives its anchors from the right button too; leave
      // gestures that start on one alone.
      if (nearBendAnchor(event.clientX, event.clientY)) return;

      boxSelectOrigin = { x: event.clientX, y: event.clientY, shiftKey: event.shiftKey };
      boxSelectMoved = false;
    };

    const handleBoxSelectMove = (event) => {
      if (!boxSelectOrigin) return;

      const dx = event.clientX - boxSelectOrigin.x;
      const dy = event.clientY - boxSelectOrigin.y;
      if (!boxSelectMoved && Math.hypot(dx, dy) < RIGHT_DRAG_THRESHOLD) return;
      boxSelectMoved = true;

      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      setBoxSelect({
        x: Math.min(boxSelectOrigin.x, event.clientX) - rect.left,
        y: Math.min(boxSelectOrigin.y, event.clientY) - rect.top,
        w: Math.abs(dx),
        h: Math.abs(dy),
      });
    };

    const handleBoxSelectUp = (event) => {
      if (!boxSelectOrigin) return;

      const origin = boxSelectOrigin;
      const wasDrag = boxSelectMoved;
      boxSelectOrigin = null;
      setBoxSelect(null);
      // Left set for the contextmenu handler that fires right after this, and
      // cleared there; a plain right-click must still open the menu.
      setTimeout(() => { boxSelectMoved = false; }, 0);

      if (!wasDrag) return;

      const a = toModelPoint(origin.x, origin.y);
      const b = toModelPoint(event.clientX, event.clientY);
      if (!a || !b) return;

      selectInBox(cy, normalizeBox(a, b), { additive: origin.shiftKey });
    };

    const handleBoxSelectContextMenu = (event) => {
      if (!boxSelectMoved) return;
      event.preventDefault();
      event.stopPropagation();
      boxSelectMoved = false;
    };

    containerRef.current?.addEventListener("mousedown", handleBoxSelectDown);
    window.addEventListener("mousemove", handleBoxSelectMove);
    window.addEventListener("mouseup", handleBoxSelectUp);
    containerRef.current?.addEventListener("contextmenu", handleBoxSelectContextMenu, true);

    // Registered after the plugin's own tapend handler, so it runs last.
    cy.on("tapend", () => setTimeout(restoreInteraction, 0));
    const onPointerUp = () => setTimeout(restoreInteraction, 0);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("mouseup", onPointerUp);

    cy.on("select unselect remove", "edge", syncBendEditingOverlay);
    cy.on("cyedgeediting.changeAnchorPoints bendPointMovement", () => {
      scheduleCommit();
      scheduleOverlaySync();
    });

    // ── Snap to grid ─────────────────────────────────────────────────────
    // A node follows the cursor freely; the grid is applied once, on drop, and
    // only when Snap is on (Alt bypasses it for a single drag). Snapping on
    // every drag tick instead makes a node jump between grid intersections
    // under the cursor, which reads as movement locked to the axes.
    //
    // Only the node under the cursor is snapped; anything else moving with it
    // is shifted by the same delta, so a multi-selection keeps its internal
    // spacing instead of collapsing onto shared grid intersections.
    const coMovers = (node) =>
      node.selected() ? cy.nodes(":selected").difference(node) : cy.collection();

    const snapOnDrop = (node) => {
      const raw = node.position();
      const snapped = snapPosition(raw, CANVAS_GRID_PITCH);
      const dx = snapped.x - raw.x;
      const dy = snapped.y - raw.y;
      if (!dx && !dy) return;
      const others = coMovers(node);
      node.position(snapped);
      if (others.length) {
        others.positions((other) => ({
          x: other.position().x + dx,
          y: other.position().y + dy,
        }));
      }
    };

    cy.on("grab", "node", (evt) => {
      grabbedNodeRef.current = evt.target.id();
      clearEdgeOverlay();
    });

    cy.on("free", "node", (evt) => {
      const node = evt.target;
      // Cytoscape fires free for every node that moved; only act on the
      // grabbed one, which carries the rest along.
      const wasGrabbed = !grabbedNodeRef.current || grabbedNodeRef.current === node.id();
      grabbedNodeRef.current = null;
      if (!snapToGridRef.current || !wasGrabbed) return;
      if (evt.originalEvent?.altKey) return;
      snapOnDrop(node);
    });

    cy.on("drag position", "node", scheduleOverlaySync);
    cy.on("dragfree", "node", syncBendEditingOverlay);

    cy.on("select unselect", syncSelection);
    cy.on("add", (evt) => {
      if (!showLabelsRef.current) evt.target.addClass("hide-labels");
    });
    cy.on("add", "node", (evt) => applyEntitySymbol(evt.target));
    // Status and capacity live in persisted data; the symbol and its border are
    // derived, so they follow every later edit too.
    cy.on("data", "node", (evt) => applyEntitySymbol(evt.target));
    cy.on("data", () => setAssetPanelVersion((version) => version + 1));
    cy.on("add remove", () => {
      syncGraph();
      syncSelection();
    });
    cy.on("add remove dragfree", scheduleCommit);
    cy.on("pan zoom resize", updateGridBackground);
    cy.on("pan zoom", scheduleOverlaySync);
    cy.on("zoom", applyZoomLod);
    cy.on("add", "node", applyZoomLod);
    updateGridBackground();
    applyZoomLod();

    historyRef.current = { past: [], present: snapshotElements(cy), future: [] };
    setCyReady(true);
    const containerEl = containerRef.current;
    return () => {
      containerEl?.removeEventListener("dblclick", dblclickCapture, true);
      containerEl?.removeEventListener("mousedown", handleBoxSelectDown);
      containerEl?.removeEventListener("contextmenu", handleBoxSelectContextMenu, true);
      window.removeEventListener("mousemove", handleBoxSelectMove);
      window.removeEventListener("mouseup", handleBoxSelectUp);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("mouseup", onPointerUp);
      if (overlayFrameRef.current) {
        cancelAnimationFrame(overlayFrameRef.current);
        overlayFrameRef.current = null;
      }
      controller.destroy();
      cyRef.current = null;
    };
  }, [
    syncGraph, syncSelection, createPipeEdge, createJunctionNode, scheduleCommit,
    placeAssetsAt, placeTransmissionSystemAt, splitPipeWithNode,
    updateGridBackground, applyZoomLod, addBendAtModelPoint, syncEdgeOverlay,
    syncBendEditingOverlay, clearEdgeOverlay, scheduleOverlaySync, restoreInteraction,
  ]);

  // ── Workspace session bootstrap ─────────────────────────────────────────────
  // WorkspaceController owns document loading. The route :id is deep-link
  // INTENT, read once here; it is no longer a live data source, so switching
  // tabs does not re-trigger a fetch.
  const sessionStartedRef = useRef(false);
  useEffect(() => {
    if (!cyReady || sessionStartedRef.current || !isBuilder) return;
    sessionStartedRef.current = true;
    void ws.recoverSession(id ?? null);
    // `id` is deliberately not a dependency: re-running on navigation is what
    // made document loading an effect's responsibility in the first place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cyReady]);

  // Embedded mode: the host's controlled document is the canvas. Reloaded
  // whenever the host hands over a different document (network switch, a
  // save that produced an edited copy, or a frozen run snapshot).
  useEffect(() => {
    if (!cyReady || isBuilder) return;
    const cy = cyRef.current;
    if (!cy) return;
    controller.loadDocument(controlledDocument || { nodes: [], edges: [] });
    cy.fit(undefined, 48);
    ws.resetDirty();
    syncGraph();
    resetHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cyReady, isBuilder, controlledDocument]);

  // Read-only (a past run's frozen network): nodes cannot be dragged.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cyReady || !cy) return;
    cy.autoungrabify(Boolean(readOnly));
  }, [cyReady, readOnly]);

  // ── Transmission Systems/Lines: fetched once, shared by the pipe modal and
  // the canvas inspector so a newly-created system/line is immediately known
  // to both (see submitPipe, which appends to this state on creation). ──────────
  useEffect(() => {
    let cancelled = false;
    fetchTransmissionSystems()
      .then((data) => { if (!cancelled) setTransmissionSystems(data.systems || []); })
      .catch(() => {});
    fetchTransmissionLines()
      .then((data) => { if (!cancelled) setTransmissionLines(data.lines || []); })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Mode / placement ─────────────────────────────────────────────────────────
  const setModeSafe = useCallback((next) => {
    const cy = cyRef.current;
    if (cy) {
      cy.$(".draw-source").removeClass("draw-source");
      cy.edges().removeClass("insert-target");
      if (next !== "trace") clearTraceClasses(cy);
      lineSourceRef.current = null;
      setLineSource(null);
    }
    if (next !== "trace") setTraceInfo(null);
    insertEdgeRef.current = null;
    insertPositionRef.current = null;
    setInsertModal({ open: false });
    pendingPlacementRef.current = null;
    setPendingAsset(null);
    setPendingSystem(null);
    pendingEntityRef.current = null;
    setPendingEntity(null);
    setAreaBox(null);
    modeRef.current = next;
    setMode(next);
    if (next === "trace") {
      setToast("Trace mode: click a handover point or delivery node.");
    }
  }, []);

  const handleInsertEntity = useCallback(
    (type) => {
      setModeSafe("place-entity");
      pendingEntityRef.current = type;
      setPendingEntity(type);
      setToast(`Click the canvas to place a ${toolbarEntityLabel(type)}. Esc to finish.`);
    },
    [setModeSafe]
  );

  const handlePick = useCallback((assetOrAssets) => {
    const assets = Array.isArray(assetOrAssets) ? assetOrAssets : [assetOrAssets];
    if (!assets.length) return;
    const insertMode = pendingPlacementRef.current?._insertMode === true;
    pendingEntityRef.current = null;
    setPendingEntity(null);
    setPendingSystem(null);
    pendingPlacementRef.current = insertMode
      ? {
          _insertMode: true,
          entityType: null,
          ...(Array.isArray(assetOrAssets) ? { assets } : { asset: assets[0] }),
        }
      : Array.isArray(assetOrAssets)
      ? assets
      : assets[0];
    setPendingAsset(insertMode ? assets[0] : Array.isArray(assetOrAssets) ? assets : assets[0]);
    modeRef.current = "place-asset";
    setMode("place-asset");
    setToast(
      insertMode
        ? assets.length === 1
          ? `Click the canvas to place "${assets[0].name || assets[0].id}" on the selected pipe.`
          : `Click the canvas to place the first of ${assets.length} selected assets on the selected pipe.`
        : assets.length === 1
        ? `Click the canvas to place "${assets[0].name || assets[0].id}".`
        : `Click the canvas to place ${assets.length} selected assets.`
    );
  }, []);

  const handlePickTransmissionSystem = useCallback(async (system) => {
    if (!system?.id) return;
    try {
      setToast(`Loading ${system.name || system.id}...`);
      const bundle = await fetchTransmissionSystemNetwork(system.id);
      mergeTransmissionBundleCatalog(bundle);
      pendingPlacementRef.current = { _type: "transmission-system", system, bundle };
      setPendingAsset(null);
      setPendingSystem(system);
      pendingEntityRef.current = null;
      setPendingEntity(null);
      modeRef.current = "place-asset";
      setMode("place-asset");
      setToast(`Click the canvas to place "${system.name || system.id}".`);
    } catch (err) {
      setToast(err.message || "Couldn't load transmission system");
    }
  }, [mergeTransmissionBundleCatalog]);

  const handleLibraryDragOver = useCallback((event) => {
    const types = Array.from(event.dataTransfer.types);
    if (types.includes(LIBRARY_DRAG_TYPE) || types.includes(TRANSMISSION_SYSTEM_DRAG_TYPE)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const handleLibraryDrop = useCallback(
    async (event) => {
      const assetPayloadText = event.dataTransfer.getData(LIBRARY_DRAG_TYPE);
      const systemPayloadText = event.dataTransfer.getData(TRANSMISSION_SYSTEM_DRAG_TYPE);
      if (!assetPayloadText && !systemPayloadText) return;
      event.preventDefault();
      const cy = cyRef.current;
      if (!cy || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const rendered = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const pan = cy.pan();
      const zoom = cy.zoom();
      const position = {
        x: (rendered.x - pan.x) / zoom,
        y: (rendered.y - pan.y) / zoom,
      };
      if (systemPayloadText) {
        try {
          const systemPayload = JSON.parse(systemPayloadText);
          const bundle = await fetchTransmissionSystemNetwork(systemPayload.id);
          mergeTransmissionBundleCatalog(bundle);
          placeTransmissionSystemAt(bundle, position);
        } catch (err) {
          setToast(err.message || "Couldn't place transmission system");
        }
        pendingPlacementRef.current = null;
        setPendingSystem(null);
        setPendingAsset(null);
        modeRef.current = "select";
        setMode("select");
        return;
      }

      let assets;
      try {
        assets = JSON.parse(assetPayloadText);
      } catch {
        return;
      }
      let insertMode = pendingPlacementRef.current?._insertMode === true;
      // Dropping a single asset onto a pipe inserts it into that pipe
      // (SWIIMS findEdgeAtModelPoint + handleCanvasDrop).
      if (!insertMode && assets.length === 1) {
        const tolerance = 12 / zoom;
        let best = null;
        cy.edges(":visible").forEach((edge) => {
          const hit = projectPointOntoPolyline(edgePolyline(edge), position);
          if (hit && hit.distance <= tolerance && (!best || hit.distance < best.distance)) best = { edge, distance: hit.distance };
        });
        if (best) {
          insertEdgeRef.current = best.edge.id();
          insertPositionRef.current = { ...position };
          insertMode = true;
        }
      }
      const added = placeAssetsAt(insertMode ? assets.slice(0, 1) : assets, position);
      if (insertMode && added?.[0]) splitPipeWithNode(added[0], { keepInsertMode: false });
      pendingPlacementRef.current = null;
      setPendingSystem(null);
      setPendingAsset(null);
      modeRef.current = "select";
      setMode("select");
    },
    [mergeTransmissionBundleCatalog, placeAssetsAt, placeTransmissionSystemAt, splitPipeWithNode]
  );

  const closeEntityModal = useCallback(() => {
    setEntityModal({ open: false, type: null, position: null, mode: null, form: null, editId: null });
    if (entityModal.mode === "insert-on-edge") clearInsertTarget();
  }, [clearInsertTarget, entityModal.mode]);

  const closeInsertModal = useCallback(() => {
    setInsertModal({ open: false });
    clearInsertTarget();
  }, [clearInsertTarget]);

  const handleInsertTypeChoice = useCallback(
    (entityType) => {
      const position = insertPositionRef.current || { x: 0, y: 0 };
      setInsertModal({ open: false });
      if (entityType === "node") {
        const node = createJunctionNode(position);
        if (node) splitPipeWithNode(node);
        return;
      }
      if (CANVAS_ONLY_ENTITY_TYPES.has(entityType)) {
        setCanvasEntityModal({ type: entityType, mode: "create", targetId: null, position, insertOnEdge: true });
        return;
      }
      setEntityModal({
        open: true,
        mode: "insert-on-edge",
        form: null,
        editId: null,
        type: entityType,
        position,
      });
    },
    [createJunctionNode, splitPipeWithNode]
  );

  const handleInsertFromLibrary = useCallback(() => {
    setInsertModal({ open: false });
    setShowLibrary(true);
    pendingPlacementRef.current = { entityType: null, _insertMode: true };
    setPendingAsset(null);
    setPendingSystem(null);
    modeRef.current = "place-asset";
    setMode("place-asset");
    setToast("Choose an asset from the library, then click the canvas to place it on the selected pipe.");
  }, []);

  const handleEntityCreated = useCallback((asset) => {
    const cy = cyRef.current;
    if (cy && entityModal.position) {
      const node = cy.add({
        group: "nodes",
        data: {
          id: rid("n"),
          assetId: asset.id,
          category: asset.category,
          type: asset.category,
          label: asset.name || asset.id,
          displayLabel: asset.name || asset.id,
          status: asset.status || "",
          meta: assetMeta(asset),
        },
        position: entityModal.position,
      });
      cy.$(":selected").unselect();
      node.select();
      if (entityModal.mode === "insert-on-edge") splitPipeWithNode(node);
    }
    setEntityModal({ open: false, type: null, position: null, mode: null, form: null, editId: null });
  }, [entityModal.position, entityModal.mode, splitPipeWithNode]);








  const handleDelete = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const sel = cy.$(":selected");
    if (!sel.length) {
      setToast("Select an asset, pipe, note or group box to delete.");
      return;
    }
    sel.remove();
    scheduleCommit();
    setSelectedEl(null);
    setSelectedEdgeCount(0);
    setSelectedDeletableCount(0);
    syncGraph();
    syncSelection();
  }, [scheduleCommit, syncGraph, syncSelection]);

  // Called by PipeVariablesModal's onSubmit with the raw form values. Creates
  // any new Transmission System/Line first (appending to the shared state so
  // the inspector picks them up immediately), then builds the pipe edge. If
  // either creation POST rejects, this rejects too — PipeVariablesModal
  // catches it, shows the error inline, and keeps the modal open.
  // Resolve the transmission system / line a form points at, creating a new
  // system, line or branch when one was typed. Shared by the pipe modal and
  // Group Lines so both stay in step with the inspector's systems/lines.
  const resolveSystemAndLine = useCallback(async (form) => {
    let systemId = form.transmissionSystemId || null;
    let lineIds = Array.isArray(form.lineGroupIds) ? form.lineGroupIds.filter(Boolean).slice(0, 1) : [];
    if (form.newTransmissionSystemName?.trim()) {
      const created = await createTransmissionSystem({ name: form.newTransmissionSystemName.trim() });
      setTransmissionSystems((s) => [...s, created]);
      systemId = created.id;
    }
    const lineName = form.isBranch ? form.newLineName.trim() || form.branchName.trim() : form.newLineName.trim();
    if (lineName) {
      if (!systemId) throw new Error("Choose or create a transmission system before adding a line.");
      if (form.isBranch && !form.parentLineId) throw new Error("Choose a parent line before creating a branch.");
      const created = await createTransmissionLine({
        name: lineName,
        systemId,
        isBranch: form.isBranch,
        parentLineId: form.isBranch ? form.parentLineId || null : null,
        branchName: form.isBranch ? form.branchName.trim() || lineName : null,
      });
      const line = { ...created, systemId: created.systemId || systemId };
      setTransmissionLines((s) => [...s, line]);
      lineIds = [line.id];
    }
    return { systemId, lineIds };
  }, []);

  // Draw Route saves the route as one transmission line named after it: an
  // existing line of that name in the chosen system is reused, otherwise a
  // new one is created there.
  const resolveRouteLine = useCallback(async (form) => {
    const name = form.name.trim();
    if (form.transmissionSystemId && !form.newTransmissionSystemName?.trim()) {
      const existing = transmissionLines.find((line) =>
        !line.isBranch &&
        lineSystemId(line) === form.transmissionSystemId &&
        (line.name || "").trim().toLowerCase() === name.toLowerCase()
      );
      if (existing) return { systemId: form.transmissionSystemId, lineIds: [existing.id] };
    }
    return resolveSystemAndLine({ ...form, newLineName: name, lineGroupIds: [], isBranch: false, parentLineId: "", branchName: "" });
  }, [transmissionLines, resolveSystemAndLine]);

  const submitPipe = useCallback(
    async (form) => {
      const route = pipeModal.route;
      const { systemId, lineIds } = route ? await resolveRouteLine(form) : await resolveSystemAndLine(form);

      const specs = {};
      if (form.capacity !== "") specs.capacity = Number(form.capacity);
      if (form.pipelineLength !== "") specs.pipelineLength = Number(form.pipelineLength);
      if (form.pipelineDiameter !== "") specs.pipelineDiameter = Number(form.pipelineDiameter);
      if (form.pipelineMaterial) specs.pipelineMaterial = form.pipelineMaterial;
      if (form.designCapacity !== "") specs.designCapacity = Number(form.designCapacity);
      if (form.maximumCapacity !== "") specs.maximumCapacity = Number(form.maximumCapacity);
      if (form.infraSource.trim()) specs.infraSource = form.infraSource.trim();
      specs.bidirectional = !!form.bidirectional;
      if (systemId) specs.transmissionSystemId = systemId;
      if (lineIds.length) specs.lineGroupIds = lineIds;
      specs.capacityLimitationType = form.capacityLimitationType;
      if (form.capacityLimitationType !== "none" && form.capacityLimitationValue !== "") {
        specs.capacityLimitationValue = Number(form.capacityLimitationValue);
      }

      const cy = cyRef.current;
      if (pipeModal.editId && cy) {
        // Details → Edit: rewrite the pipe in place. Fields the form owns are
        // cleared first so emptying one in the form removes it; any other
        // specification keys on the pipe are kept.
        const edge = cy.getElementById(pipeModal.editId);
        if (edge && edge.length) {
          const meta = { ...(edge.data("meta") || {}) };
          const kept = { ...(meta.specifications || {}) };
          PIPE_FORM_SPEC_KEYS.forEach((key) => delete kept[key]);
          const previousStatus = edge.data("status");
          const name = form.name.trim() || "Pipe";
          edge.data({
            label: name,
            displayLabel: name,
            active: !!form.active,
            status: form.active ? (previousStatus && previousStatus !== "inactive" ? previousStatus : "operational") : "inactive",
            commissioningDate: form.commissioningDate || "",
            decommissioningDate: form.decommissioningDate || "",
            meta: { ...meta, specifications: { ...kept, ...specs } },
          });
          scheduleCommit();
          syncSelection();
          setToast(`Saved "${name}".`);
        }
      } else if (route && cy) {
        // Draw Route: one pipe per leg. Junction clicks become real Nodes,
        // bends stay on the leg they were dropped on, and a given total
        // length is shared across the legs by their drawn length.
        const junctions = route.points
          .filter((point) => point.kind === "junction")
          .map((point) => createJunctionNode({ x: point.x, y: point.y }));
        const idFor = (key) => (key === "source" ? route.sourceId : key === "target" ? route.targetId : junctions[key]?.id());
        const legs = routeToLegs(route.points);
        const posOf = (key) => ({ ...cy.getElementById(idFor(key)).position() });
        const legLength = (leg) => {
          const pts = [posOf(leg.from), ...leg.bends, posOf(leg.to)];
          return pts.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0);
        };
        const lengths = legs.map(legLength);
        const total = lengths.reduce((a, b) => a + b, 0) || 1;
        const created = [];
        legs.forEach((leg, index) => {
          const legSpecs = { ...specs };
          if (specs.pipelineLength != null) {
            legSpecs.pipelineLength = Math.round(specs.pipelineLength * (lengths[index] / total) * 1000) / 1000;
          }
          const edge = createPipeEdge({
            source: idFor(leg.from),
            target: idFor(leg.to),
            label: segmentName(form.name, index + 1),
            active: form.active,
            commissioningDate: form.commissioningDate,
            decommissioningDate: form.decommissioningDate,
            specs: legSpecs,
          });
          if (edge && leg.bends.length) {
            const { weights, distances } = bendPointsToPairs(posOf(leg.from), posOf(leg.to), leg.bends);
            edge.data({ cyedgebendeditingWeights: weights, cyedgebendeditingDistances: distances });
            updateBendClasses(edge, weights.length);
          }
          if (edge) created.push(edge);
        });
        cy.$(":selected").unselect();
        cy.collection(created).select();
        syncSelection();
        setToast(`Route "${form.name.trim()}" added as a line: ${created.length} segment${created.length === 1 ? "" : "s"}${junctions.length ? `, ${junctions.length} junction${junctions.length === 1 ? "" : "s"}` : ""}.`);
      } else {
        createPipeEdge({
          source: pipeModal.source,
          target: pipeModal.target,
          label: form.name,
          active: form.active,
          commissioningDate: form.commissioningDate,
          decommissioningDate: form.decommissioningDate,
          specs,
        });
      }
      setPipeModal({ open: false, source: null, target: null });
    },
    [pipeModal, resolveRouteLine, resolveSystemAndLine, createPipeEdge, createJunctionNode, scheduleCommit, syncSelection]
  );


  // ── View ─────────────────────────────────────────────────────────────────────
  const handleFit = useCallback(() => {
    const cy = cyRef.current;
    if (cy && cy.elements().length) cy.fit(undefined, 48);
  }, []);

  const handleResetView = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.reset();
    if (cy.elements().length) cy.fit(undefined, 48);
    setModeSafe("select");
  }, [setModeSafe]);

  const handleZoomToSelection = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const sel = cy.$(":selected");
    cy.fit(sel.length ? sel : cy.elements(), 60);
  }, []);

  // Arrow keys move the selection by a grid square, Shift by ten.
  const nudgeSelection = useCallback(
    (dx, dy) => {
      const cy = cyRef.current;
      if (!cy || (!dx && !dy)) return false;
      const nodes = cy.nodes(":selected");
      if (!nodes.length) return false;

      cy.batch(() => {
        nodes.forEach((node) => {
          const p = node.position();
          node.position({ x: p.x + dx, y: p.y + dy });
        });
      });
      scheduleCommit();
      return true;
    },
    [scheduleCommit]
  );

  const handleSelectAll = useCallback(() => {
    const cy = cyRef.current;
    if (cy) cy.elements().select();
  }, []);

  const notImplemented = useCallback((label) => {
    setToast(`${label} is not implemented yet.`);
  }, []);

  const selectElementsWhere = useCallback(
    (label, predicate) => {
      const cy = cyRef.current;
      if (!cy) return;
      cy.$(":selected").unselect();
      const matches = cy.elements().filter((el) => predicate(el));
      matches.select();
      if (matches.length) cy.fit(matches, 80);
      setToast(`Selected ${matches.length} ${label}.`);
      syncSelection();
    },
    [syncSelection]
  );

  const handleSelectActive = useCallback(() => {
    selectElementsWhere("active element(s)", isActiveElement);
  }, [selectElementsWhere]);

  const handleSelectInactive = useCallback(() => {
    selectElementsWhere("inactive element(s)", isInactiveElement);
  }, [selectElementsWhere]);

  const handleMakeSelectionActive = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const editable = cy.$(":selected").filter((el) => el.isEdge());
    editable.forEach((el) => {
      el.data("active", true);
      el.data("status", "operational");
    });
    if (editable.length) scheduleCommit();
    syncSelection();
    setToast(editable.length ? `Marked ${editable.length} selected pipe(s) active.` : "Select a pipe first.");
  }, [scheduleCommit, syncSelection]);

  const handleMakeSelectionInactive = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const editable = cy.$(":selected").filter((el) => el.isEdge());
    editable.forEach((el) => {
      el.data("active", false);
      el.data("status", "inactive");
    });
    if (editable.length) scheduleCommit();
    syncSelection();
    setToast(editable.length ? `Marked ${editable.length} selected pipe(s) inactive.` : "Select a pipe first.");
  }, [scheduleCommit, syncSelection]);

  const clearIsolation = useCallback((message = "Cleared isolate.") => {
    const cy = cyRef.current;
    if (!cy) return;
    clearIsolationClasses(cy);
    setIsolationActive(false);
    setActiveIsolationLabel("");
    setActiveIsolationKey("");
    setToast(message);
  }, []);

  // ── Workspace adapters ──────────────────────────────────────────────────────
  // WorkspaceController reaches page-owned state only through these seams, so
  // it stays framework-independent and unaffected when a later phase moves any
  // of this state into a store.
  useEffect(() => {
    ws.registerInteraction({
      cancelUnsafeInteraction: () => {
        // setModeSafe already clears draw-source, the pipe source, pending
        // entity/asset placement, insert refs and the area box.
        setModeSafe("select");
      },
      reset: () => {
        const cy = cyRef.current;
        if (cy) {
          clearIsolationClasses(cy);
          clearTraceClasses(cy);
        }
        setIsolationActive(false);
        setActiveIsolationLabel("");
        setActiveIsolationKey("");
        setTraceInfo(null);
        setTraceMode("reachable");
      },
    });
    ws.registerHistory({ reset: () => resetHistory() });
    return () => ws.detach();
  }, [setModeSafe, resetHistory]);

  // Re-registered whenever a toggle changes so capture() always reads current
  // values; registration is a field assignment, so this is cheap.
  useEffect(() => {
    ws.registerViewBridge({
      capture: () => ({
        showLabels,
        showGrid,
        snapToGrid,
        showLibrary,
        canvasFocusMode,
        // The category filter was retired; kept empty for the persisted shape.
        hiddenAssetTypes: [],
      }),
      apply: (toggles) => {
        setShowLabels(toggles.showLabels);
        setShowGrid(toggles.showGrid);
        setSnapToGrid(toggles.snapToGrid);
        setShowLibrary(toggles.showLibrary);
        setCanvasFocusMode(toggles.canvasFocusMode);
      },
    });
  }, [showLabels, showGrid, snapToGrid, showLibrary, canvasFocusMode]);

  useEffect(() => {
    ws.registerNavigator({
      replace: (path) => navigate(path, { replace: true }),
    });
  }, [navigate]);

  const isolateCollection = useCallback((elements, label = "selection", activeKey = "") => {
    const cy = cyRef.current;
    if (!cy) return;
    if (!applyIsolation(cy, elements)) {
      setToast(`No canvas elements found for ${label}.`);
      return;
    }
    setIsolationActive(true);
    setActiveIsolationLabel(label);
    setActiveIsolationKey(activeKey);
    setToast(`Isolated ${label}.`);
    syncSelection();
  }, [syncSelection]);

  const isolatePipeIds = useCallback((pipeIds, label, activeKey = "") => {
    const cy = cyRef.current;
    if (!cy) return;
    const ids = new Set(pipeIds);
    const edges = cy.edges().filter((edge) => ids.has(edge.id()));
    isolateCollection(edges, label, activeKey);
  }, [isolateCollection]);

  const handleToggleIsolation = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    if (isolationActive || isIsolated(cy)) {
      clearIsolation();
      return;
    }
    const selected = cy.$(":selected");
    if (!selected.length) {
      setToast("Select something to isolate first.");
      return;
    }
    isolateCollection(selected, "current selection", "selection");
  }, [clearIsolation, isolateCollection, isolationActive]);

  const handleSelectDisconnected = useCallback(() => {
    selectElementsWhere(
      "disconnected node(s)",
      (el) => el.isNode() && !ANNOTATION_TYPES.includes(el.data("type")) && el.connectedEdges().length === 0
    );
  }, [selectElementsWhere]);

  const handleSelectMissingCapacity = useCallback(() => {
    selectElementsWhere("pipe(s) missing capacity", (el) => {
      if (!el.isEdge()) return false;
      const spec = el.data("meta")?.specifications || {};
      return spec.capacity == null && spec.designCapacity == null && spec.maximumCapacity == null;
    });
  }, [selectElementsWhere]);

  const handleClearHighlights = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.$(":selected").unselect();
    cy.elements().removeClass("nb-isolate-hidden nb-isolate-dim");
    clearTraceClasses(cy);
    setTraceInfo(null);
    setIsolationActive(false);
    setActiveIsolationLabel("");
    setActiveIsolationKey("");
    setFindOpen(false);
    setFindQuery("");
    syncSelection();
    setToast("Cleared highlights.");
  }, [syncSelection]);

  // Live find: select matching nodes as the user types.
  const runFind = useCallback((q) => {
    const cy = cyRef.current;
    if (!cy) return;
    const needle = q.trim().toLowerCase();
    cy.$(":selected").unselect();
    if (!needle) return;
    const matches = cy.nodes().filter((n) => {
      const d = n.data();
      const meta = d.meta || {};
      const spec = meta.specifications || {};
      return [d.label, d.assetId, d.type, d.category, meta.region, spec.water_source]
        .some((v) => v && String(v).toLowerCase().includes(needle));
    });
    matches.select();
    if (matches.length) cy.fit(matches, 80);
  }, []);

  const focusCanvasElement = useCallback(
    (elementId) => {
      const cy = cyRef.current;
      if (!cy || !elementId) return;
      const el = cy.getElementById(elementId);
      if (!el.length) return;
      cy.$(":selected").unselect();
      el.select();
      // Centre and zoom together. Cytoscape only honours a numeric `zoom`
      // alongside an explicit `pan` here — `center: { eles }` with a zoom level
      // moves the pan and leaves the zoom untouched — so the centring pan is
      // worked out by hand.
      const level = Math.max(cy.zoom(), 1.15);
      const target = el.isNode() ? el.position() : el.midpoint();
      const viewport = {
        zoom: level,
        pan: { x: cy.width() / 2 - target.x * level, y: cy.height() / 2 - target.y * level },
      };

      // Cytoscape steps animations off requestAnimationFrame, which a hidden
      // tab never fires: the viewport would then simply never arrive. Nothing
      // to animate for an audience that isn't looking, so jump straight there.
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        cy.viewport(viewport);
      } else {
        cy.animate(viewport, { duration: 240 });
      }
      syncSelection();
      // A focused element is one the user wants to inspect.
      setShowInspector(true);
      setRightPanelTab("details");
    },
    [syncSelection]
  );

  const handleTraceModeSelect = useCallback(
    (nextMode) => {
      setTraceMode(nextMode);
      const cy = cyRef.current;
      if (!cy || !traceRootsRef.current.length) return;
      applyTraceRoots(traceRootsRef.current, nextMode);
    },
    [applyTraceRoots]
  );

  const handleValidateNetwork = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const nodes = cy.nodes().filter((n) => !ANNOTATION_TYPES.includes(n.data("type")));
    const edges = cy.edges();
    const issues = [];

    if (nodes.length === 0) {
      issues.push({
        id: "empty-canvas",
        severity: "info",
        title: "Canvas is empty",
        detail: "Add plants, pump stations, junctions, and pipes to validate a network.",
      });
    }

    if (nodes.length > 1 && edges.length === 0) {
      issues.push({
        id: "no-pipes",
        severity: "warning",
        title: "No pipes connected",
        detail: "The canvas has multiple nodes but no pipe connections.",
      });
    }

    nodes.forEach((node) => {
      const degree = node.connectedEdges().length;
      const type = node.data("type");
      if (degree === 0 && type !== "node") {
        issues.push({
          id: `isolated-${node.id()}`,
          severity: "warning",
          title: "Isolated asset",
          detail: `${node.data("label") || node.id()} is not connected to a pipe.`,
          elementId: node.id(),
        });
      }
      if (type === "node" && degree < 2) {
        issues.push({
          id: `loose-junction-${node.id()}`,
          severity: "info",
          title: "Loose junction",
          detail: "Junctions usually connect at least two pipe segments.",
          elementId: node.id(),
        });
      }
    });

    edges.forEach((edge) => {
      const data = edge.data();
      const source = cy.getElementById(data.source);
      const target = cy.getElementById(data.target);
      const spec = data.meta?.specifications || {};
      if (!source.length || !target.length) {
        issues.push({
          id: `broken-${edge.id()}`,
          severity: "error",
          title: "Pipe endpoint missing",
          detail: `${data.label || edge.id()} references a missing source or target node.`,
          elementId: edge.id(),
        });
      }
      if (spec.capacity == null && spec.designCapacity == null && spec.maximumCapacity == null) {
        issues.push({
          id: `capacity-${edge.id()}`,
          severity: "info",
          title: "Pipe capacity not set",
          detail: `${data.label || edge.id()} has no capacity, design capacity, or maximum capacity.`,
          elementId: edge.id(),
        });
      }
      if (data.active === false || data.status === "inactive") {
        issues.push({
          id: `inactive-${edge.id()}`,
          severity: "warning",
          title: "Inactive pipe",
          detail: `${data.label || edge.id()} is marked inactive.`,
          elementId: edge.id(),
        });
      }
    });

    // SWIIMS validateCurrentNetwork checks not covered above.
    const ASSET_CAPACITY_TYPES = new Set(["plant", "pump", "handover_point", "filling_station", "tank", "stp"]);
    nodes.forEach((node) => {
      const d = node.data();
      const type = d.type;
      if (type === "node") return;
      if (!String(d.label || "").trim()) {
        issues.push({ id: `name-${node.id()}`, severity: "warning", title: "Missing name", detail: `An asset (${type}) has no name.`, elementId: node.id() });
      }
      const spec = d.meta?.specifications || {};
      const hasCap = [spec.design_capacity, spec.capacity, spec.contracted_capacity, spec.total_capacity_m3, spec.capacity_m3_day]
        .some((v) => v !== null && v !== undefined && v !== "");
      if (ASSET_CAPACITY_TYPES.has(type) && !hasCap) {
        issues.push({ id: `asset-capacity-${node.id()}`, severity: "info", title: "Missing capacity", detail: `${d.label || node.id()} has no capacity.`, elementId: node.id() });
      }
      const inactive = d.active === false || d.meta?.active === false || ["inactive", "decommissioned"].includes(d.status);
      if (inactive && node.connectedEdges().length > 0) {
        issues.push({ id: `inactive-connected-${node.id()}`, severity: "warning", title: "Inactive but connected", detail: `${d.label || node.id()} is inactive but still has pipes attached.`, elementId: node.id() });
      }
      if (DELIVERY_NODE_TYPES.has(type) && node.connectedEdges().length > 0) {
        const fed = node.connectedEdges().some((e) => e.data("target") === node.id() || !!(e.data("bidirectional") ?? e.data("meta")?.specifications?.bidirectional));
        if (!fed) {
          issues.push({ id: `no-incoming-${node.id()}`, severity: "error", title: "No incoming pipe", detail: `${d.label || node.id()} only has outgoing pipes, so nothing can flow into it.`, elementId: node.id() });
        }
      }
    });
    edges.forEach((edge) => {
      const d = edge.data();
      if (d.source === d.target) {
        issues.push({ id: `self-loop-${edge.id()}`, severity: "error", title: "Invalid pipe", detail: `${d.label || edge.id()} starts and ends on the same node.`, elementId: edge.id() });
      }
      if (!String(d.label || "").trim() || d.label === "Pipe") {
        issues.push({ id: `pipe-name-${edge.id()}`, severity: "info", title: "Pipe without a name", detail: `Pipe ${edge.id()} has no descriptive name.`, elementId: edge.id() });
      }
    });

    // Every delivery point should have a directed supply path from a producing
    // plant. Mirrors the engine's reachableFromSupply BFS
    // (backend/src/simulation/dispatch.js): follow active edges source→target,
    // plus the reverse on bidirectional pipes, seeded from the active plants.
    const nodeInactive = (n) => {
      const d = n.data();
      return d.active === false || d.meta?.active === false ||
        ["inactive", "decommissioned"].includes(d.status);
    };
    const edgeActive = (e) => e.data("active") !== false && e.data("status") !== "inactive";
    const edgeBidi = (e) => {
      const d = e.data();
      return !!(d.bidirectional ?? d.meta?.specifications?.bidirectional);
    };
    const adjacency = new Map();
    const linkAdj = (from, to) => {
      if (!adjacency.has(from)) adjacency.set(from, []);
      adjacency.get(from).push(to);
    };
    edges.forEach((edge) => {
      if (!edgeActive(edge)) return;
      const s = edge.data("source");
      const t = edge.data("target");
      linkAdj(s, t);
      if (edgeBidi(edge)) linkAdj(t, s);
    });
    const reachable = new Set();
    const stack = [];
    nodes.forEach((n) => {
      if (SUPPLY_NODE_TYPES.has(n.data("type")) && !nodeInactive(n) && !reachable.has(n.id())) {
        reachable.add(n.id());
        stack.push(n.id());
      }
    });
    while (stack.length) {
      const u = stack.pop();
      for (const v of adjacency.get(u) || []) {
        if (!reachable.has(v)) {
          reachable.add(v);
          stack.push(v);
        }
      }
    }
    nodes.forEach((node) => {
      if (!DELIVERY_NODE_TYPES.has(node.data("type"))) return;
      if (nodeInactive(node)) return;
      if (node.connectedEdges().length === 0) return; // already flagged as isolated
      if (!reachable.has(node.id())) {
        issues.push({
          id: `no-supply-${node.id()}`,
          severity: "error",
          title: "No supply path",
          detail: `${node.data("label") || node.id()} has no active pipe route back to a producing plant.`,
          elementId: node.id(),
        });
      }
    });

    if (issues.length === 0) {
      issues.push({
        id: "validation-ok",
        severity: "success",
        title: "No issues found",
        detail: "The current canvas passes the frontend validation checks.",
      });
    }

    setValidationIssues(issues);
    setRightPanelTab("issues");
    setIssuePanelMode("issues");
  }, []);

  const issueCounts = useMemo(
    () =>
      validationIssues.reduce(
        (acc, issue) => ({ ...acc, [issue.severity]: (acc[issue.severity] || 0) + 1 }),
        {}
      ),
    [validationIssues]
  );

  const issueBadgeText = useMemo(() => {
    const parts = [];
    if (issueCounts.error) parts.push(`${issueCounts.error} error${issueCounts.error === 1 ? "" : "s"}`);
    if (issueCounts.warning) parts.push(`${issueCounts.warning} warning${issueCounts.warning === 1 ? "" : "s"}`);
    if (issueCounts.info) parts.push(`${issueCounts.info} note${issueCounts.info === 1 ? "" : "s"}`);
    return parts.join(", ");
  }, [issueCounts]);

  const handleShowIssues = useCallback(() => {
    setShowInspector(true);
    setIssuePanelMode("issues");
    setRightPanelTab("issues");
    if (!validationIssues.length) setToast("Run validation to populate issues.");
  }, [validationIssues.length]);

  const handleFocusIssues = useCallback(() => {
    setShowInspector(true);
    setIssuePanelMode("issues");
    setRightPanelTab("issues");
    const firstFocusableIssue = validationIssues.find((issue) => issue.elementId);
    if (!firstFocusableIssue) {
      setToast(validationIssues.length ? "No focusable issues found." : "Run validation before focusing issues.");
      return;
    }
    focusCanvasElement(firstFocusableIssue.elementId);
  }, [focusCanvasElement, validationIssues]);

  const transmissionLinesForCanvas = useMemo(() => {
    const cy = cyRef.current;
    if (!cy) return transmissionLines;

    const inferredSystemByLineId = new Map();
    cy.edges().forEach((edge) => {
      const spec = edge.data("meta")?.specifications || {};
      const systemId = spec.transmissionSystemId;
      const lineIds = Array.isArray(spec.lineGroupIds) ? spec.lineGroupIds : [];
      if (!systemId || !lineIds.length) return;
      lineIds.forEach((lineId) => {
        if (!inferredSystemByLineId.has(lineId)) inferredSystemByLineId.set(lineId, systemId);
      });
    });

    return transmissionLines.map((line) => {
      if (lineSystemId(line)) return line;
      const canvasSystemId = inferredSystemByLineId.get(line.id);
      return canvasSystemId ? { ...line, canvasSystemId } : line;
    });
  }, [transmissionLines, counts.edges, selectedEl]);

  const isolationGroups = useMemo(() => {
    const cy = cyRef.current;
    const lineNameById = new Map(transmissionLinesForCanvas.map((line) => [line.id, lineDisplayName(line)]));
    const systemsById = new Map(transmissionSystems.map((system) => [system.id, { ...system, lines: [], pipes: [] }]));
    const linesById = new Map(
      transmissionLinesForCanvas.map((line) => [
        line.id,
        { ...line, parentLineName: line.parentLineId ? lineNameById.get(line.parentLineId) : "", pipes: [] },
      ])
    );
    const ungroupedPipes = [];

    if (!cy) {
      return {
        systems: Array.from(systemsById.values()),
        standaloneLines: Array.from(linesById.values()),
        ungroupedPipes,
      };
    }

    cy.edges().forEach((edge) => {
      const data = edge.data();
      const spec = data.meta?.specifications || {};
      const pipe = {
        id: edge.id(),
        name: data.label || data.displayLabel || edge.id(),
        source: cy.getElementById(data.source).data("label") || data.source,
        target: cy.getElementById(data.target).data("label") || data.target,
      };
      const systemId = spec.transmissionSystemId;
      const lineIds = Array.isArray(spec.lineGroupIds) ? spec.lineGroupIds : [];
      if (!lineIds.length) {
        if (systemId) {
          if (!systemsById.has(systemId)) systemsById.set(systemId, { id: systemId, name: systemId, lines: [], pipes: [] });
          systemsById.get(systemId).pipes.push(pipe);
          return;
        }
        ungroupedPipes.push(pipe);
        return;
      }
      lineIds.forEach((lineId) => {
        if (!linesById.has(lineId)) linesById.set(lineId, { id: lineId, name: lineId, parentLineName: "", pipes: [] });
        const line = linesById.get(lineId);
        line.pipes.push(pipe);
        if (systemId && !lineSystemId(line)) {
          line.canvasSystemId = systemId;
        }
      });
    });

    linesById.forEach((line) => {
      const systemId = lineSystemId(line);
      if (!systemId) return;
      if (!systemsById.has(systemId)) systemsById.set(systemId, { id: systemId, name: systemId, lines: [], pipes: [] });
      systemsById.get(systemId).lines.push(line);
    });

    const standaloneLines = Array.from(linesById.values()).filter((line) => {
      return !lineSystemId(line) && line.pipes.length > 0;
    });

    return {
      systems: Array.from(systemsById.values()),
      standaloneLines,
      ungroupedPipes,
    };
  }, [transmissionSystems, transmissionLinesForCanvas, counts.edges, selectedEl]);

  const filteredIsolationGroups = useMemo(() => {
    const needle = isolationQuery.trim().toLowerCase();
    if (!needle) return isolationGroups;

    const pipeMatches = (pipe) => matchesText(needle, pipe.id, pipe.name, pipe.source, pipe.target);
    const filterLine = (line) => {
      const lineMatches = matchesText(needle, line.id, line.name, line.branchName, line.parentLineName, lineDisplayName(line));
      return { ...line, pipes: lineMatches ? line.pipes : line.pipes.filter(pipeMatches), _selfMatch: lineMatches };
    };
    const filterSystem = (system) => {
      const systemMatches = matchesText(needle, system.id, system.name);
      if (systemMatches) return { ...system, _selfMatch: true };
      return {
        ...system,
        lines: system.lines.map(filterLine).filter((line) => line._selfMatch || line.pipes.length > 0),
        pipes: system.pipes.filter(pipeMatches),
        _selfMatch: false,
      };
    };

    return {
      systems: isolationGroups.systems
        .map(filterSystem)
        .filter((system) => system._selfMatch || system.lines.length > 0 || system.pipes.length > 0),
      standaloneLines: isolationGroups.standaloneLines
        .map(filterLine)
        .filter((line) => line._selfMatch || line.pipes.length > 0),
      ungroupedPipes: isolationGroups.ungroupedPipes.filter(pipeMatches),
    };
  }, [isolationGroups, isolationQuery]);

  // ── Arrange (align / distribute selected nodes) ──────────────────────────────
  // Read the selected real nodes into plain {id,x,y,w,h} descriptors, let the
  // pure align/distribute math decide the new centres, then write them back.
  // Edge-aware alignment (respects each node's size) and annotation exclusion
  // live in cytoscape/align.js so the two apps share one definition and it stays
  // unit-tested.
  const selectedAlignNodes = useCallback((cy) =>
    cy
      .$("node:selected")
      .filter((n) => !ANNOTATION_TYPES.includes(n.data("type")))
      .map((n) => {
        const p = n.position();
        return { id: n.id(), x: p.x, y: p.y, w: n.outerWidth(), h: n.outerHeight() };
      }), []);

  const applyPositions = useCallback(
    (cy, positions) => {
      if (!positions.length) return;
      for (const pos of positions) {
        const node = cy.getElementById(pos.id);
        if (node && node.nonempty()) node.position({ x: pos.x, y: pos.y });
      }
      scheduleCommit();
    },
    [scheduleCommit]
  );

  const arrange = useCallback(
    (kind) => {
      const cy = cyRef.current;
      if (!cy) return;
      const nodes = selectedAlignNodes(cy);
      const distributing = kind === "disth" || kind === "distv";
      if (distributing) {
        if (nodes.length < 3) {
          setToast("Select 3+ assets to distribute.");
          return;
        }
        applyPositions(cy, distributePositions(nodes, kind === "disth" ? "h" : "v"));
        return;
      }
      if (nodes.length < 2) {
        setToast("Select 2+ assets (shift-drag a box) to arrange.");
        return;
      }
      const mode = ARRANGE_ALIGN_MODES[kind];
      if (mode) applyPositions(cy, alignPositions(nodes, mode));
    },
    [selectedAlignNodes, applyPositions]
  );

  // ── Geographic view (anchors → affine transform → Leaflet map + KMZ) ────────
  // Anchors are nodes pinned to a real lat/lng (meta.geoAnchor). With >= 2 the
  // fitted transform gives every other node and pipe vertex a derived
  // coordinate, which drives the Map view and the KMZ export.
  const georefAnchors = useCallback((cy) => {
    const anchors = [];
    cy.nodes().forEach((n) => {
      const m = n.data("meta") || {};
      if (m.geoAnchor !== true) return;
      const lat = Number(m.latitude);
      const lng = Number(m.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const p = n.position();
      anchors.push({ id: n.id(), px: { x: p.x, y: p.y }, geo: { lat, lng } });
    });
    return anchors;
  }, []);

  const buildGeoData = useCallback(
    (cy) => {
      const transform = computeTransform(georefAnchors(cy));
      const status = transformStatus(georefAnchors(cy));
      if (!transform) return { transform: null, status, nodes: [], edges: [] };
      const nodes = cy
        .nodes()
        .filter((n) => !ANNOTATION_TYPES.includes(n.data("type")))
        .map((n) => {
          const m = n.data("meta") || {};
          const lat = Number(m.latitude);
          const lng = Number(m.longitude);
          const isAnchor = m.geoAnchor === true && Number.isFinite(lat) && Number.isFinite(lng);
          const geo = isAnchor ? { lat, lng } : pixelToGeo(n.position(), transform);
          return {
            id: n.id(),
            name: n.data("label") || n.id(),
            type: n.data("type"),
            assetId: n.data("assetId") || "",
            isAnchor,
            lat: geo.lat,
            lng: geo.lng,
          };
        });
      const edges = cy.edges().map((e) => ({
        id: e.id(),
        name: e.data("label") || e.id(),
        sourceId: e.data("source"),
        targetId: e.data("target"),
        positions: edgePolyline(e).map((pt) => {
          const geo = pixelToGeo(pt, transform);
          return [geo.lat, geo.lng];
        }),
      }));
      return { transform, status, nodes, edges };
    },
    [georefAnchors]
  );

  const handlePinGeoAnchor = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const sel = cy.$("node:selected").filter((n) => !ANNOTATION_TYPES.includes(n.data("type")));
    if (sel.length !== 1) {
      setToast("Select a single asset to pin as a geo anchor.");
      return;
    }
    const node = sel[0];
    const meta = node.data("meta") || {};
    if (meta.geoAnchor === true) {
      node.data("meta", { ...meta, geoAnchor: false });
      setToast("Removed geo anchor.");
    } else {
      let lat = Number(meta.latitude);
      let lng = Number(meta.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        const input = window.prompt("Latitude, longitude for this anchor (e.g. 24.71, 46.67):", "");
        if (input == null) return;
        const [rawLat, rawLng] = input.split(",").map((s) => Number(s.trim()));
        lat = rawLat;
        lng = rawLng;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          setToast("Couldn't read those coordinates.");
          return;
        }
      }
      node.data("meta", { ...meta, geoAnchor: true, latitude: lat, longitude: lng });
      setToast("Pinned geo anchor. Two or more enable the Map view.");
    }
    scheduleCommit();
    setGeoTick((v) => v + 1);
  }, [scheduleCommit]);

  const handleMapMoveNode = useCallback(
    (nodeId, geo) => {
      const cy = cyRef.current;
      const node = cy?.getElementById(nodeId);
      if (!node || !node.length) return;
      const transform = computeTransform(georefAnchors(cy));
      if (!transform) return;
      const meta = node.data("meta") || {};
      if (meta.geoAnchor === true) {
        node.data("meta", { ...meta, latitude: Number(geo.lat), longitude: Number(geo.lng) });
      } else {
        const px = geoToPixel(geo, transform);
        node.position(snapToGrid ? snapPosition(px) : px);
      }
      scheduleCommit();
      setGeoTick((v) => v + 1);
    },
    [georefAnchors, scheduleCommit, snapToGrid]
  );

  const handleMapCreateRoute = useCallback(({ sourceId, targetId }) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    // The pipe modal lives over the schematic canvas; drop back to it to capture
    // the pipe's variables. Intermediate route points are not yet applied as
    // bends — the pipe is created straight and can be bent in the schematic view.
    setViewMode("schematic");
    setPipeModal({ open: true, source: sourceId, target: targetId });
  }, []);

  const handleExportKMZ = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const { transform, nodes, edges } = buildGeoData(cy);
    if (!transform || !nodes.length) {
      setToast("Pin at least two geo anchors before exporting KMZ.");
      return;
    }
    exportNetworkToKmz({ nodes, edges, name: network.name || "network" }).catch((err) =>
      setToast(`KMZ export failed: ${err.message}`)
    );
  }, [buildGeoData, network]);

  // ── Annotate ─────────────────────────────────────────────────────────────────
  const handleGroupBox = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const nodes = cy.$("node:selected").filter((n) => !ANNOTATION_TYPES.includes(n.data("type")));
    if (!nodes.length) {
      setToast("Select the nodes to enclose, then click Group Box.");
      return;
    }
    const frame = groupBoxAround(nodes);
    const box = cy.add({
      group: "nodes",
      data: {
        id: rid("box"),
        type: "group-box",
        category: "group-box",
        label: "Group",
        displayLabel: "Group",
        boxWidth: frame.boxWidth,
        boxHeight: frame.boxHeight,
      },
      position: frame.position,
    });
    cy.$(":selected").unselect();
    box.select();
    setToast("Group box added. Drag it to move its contents; drag the corner to resize; Edit to rename.");
  }, []);

  // Note formatting is disabled here; Network Builder edits are pipe-only.
  // Format the selected sticky note(s). Font/size/italic/bold render on the
  // Cytoscape label (see buildCyStyle); underline is stored as a flag but not
  // drawn (Cytoscape has no label text-decoration). Values live in node data so
  // they persist through save and the toolbar reflects the active toggle state.
  const noteFmt = useCallback(
    (key, value) => {
      const cy = cyRef.current;
      if (!cy) return;
      const notes = cy.$('node:selected[type="note"]');
      if (!notes.length) {
        setToast("Select a note to format it.");
        return;
      }
      notes.forEach((note) => {
        if (key === "noteFont") {
          if (value === "sans") note.removeData("noteFont");
          else note.data("noteFont", value);
        } else if (key === "noteSize") {
          if (value === "normal") note.removeData("noteSize");
          else note.data("noteSize", value);
        } else if (key === "sizeStep") {
          const cur = note.data("noteSize") || "normal";
          const idx = Math.max(0, Math.min(NOTE_SIZES.length - 1, NOTE_SIZES.indexOf(cur) + value));
          const next = NOTE_SIZES[idx];
          if (next === "normal") note.removeData("noteSize");
          else note.data("noteSize", next);
        } else if (key === "noteBold" || key === "noteItalic" || key === "noteUnderline") {
          if (note.data(key) === "true") note.removeData(key);
          else note.data(key, "true");
        }
      });
      scheduleCommit();
      syncSelection();
    },
    [scheduleCommit, syncSelection]
  );

  // ── Clipboard ────────────────────────────────────────────────────────────────
  const handleCopySelection = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const sel = cy.$(":selected");
    if (!sel.length) {
      setToast("Nothing selected to copy.");
      return;
    }
    clipboardRef.current = sel.jsons().map(stripTransientClasses);
    setToast(`Copied ${sel.length} element${sel.length === 1 ? "" : "s"}.`);
  }, []);

  const handleCutSelection = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const sel = cy.$(":selected");
    if (!sel.length) {
      setToast("Nothing selected to cut.");
      return;
    }
    clipboardRef.current = sel.jsons().map(stripTransientClasses);
    handleDelete();
    setToast(`Cut ${sel.length} element${sel.length === 1 ? "" : "s"}.`);
  }, [handleDelete]);

  const handleCopyAll = useCallback(() => {
    const cy = cyRef.current;
    if (!cy || !cy.elements().length) return;
    clipboardRef.current = snapshotElements(cy);
    setToast("Copied entire canvas.");
  }, []);

  // Paste lands at the centre of the current view (SWIIMS handlePasteNetwork)
  // and gives a clashing name a "-copy" suffix (uniqueEntityName). Pasted
  // copies are not tied to the source registry asset.
  const handlePaste = useCallback(() => {
    const cy = cyRef.current;
    const clip = clipboardRef.current;
    if (!cy || !clip || !clip.length) {
      setToast("Clipboard is empty.");
      return;
    }
    const clipNodes = clip.filter((j) => j.group === "nodes");
    const xs = clipNodes.map((j) => j.position?.x || 0);
    const ys = clipNodes.map((j) => j.position?.y || 0);
    const clipCentre = clipNodes.length
      ? { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }
      : { x: 0, y: 0 };
    const ext = cy.extent();
    const viewCentre = { x: (ext.x1 + ext.x2) / 2, y: (ext.y1 + ext.y2) / 2 };
    const dx = viewCentre.x - clipCentre.x;
    const dy = viewCentre.y - clipCentre.y;
    const taken = new Set(cy.elements().map((el) => el.data("label")).filter(Boolean));
    const uniqueName = (name) => {
      if (!name || !taken.has(name)) {
        if (name) taken.add(name);
        return name;
      }
      let candidate = `${name}-copy`;
      for (let n = 2; taken.has(candidate); n += 1) candidate = `${name}-copy-${n}`;
      taken.add(candidate);
      return candidate;
    };
    const idMap = {};
    const added = [];
    cy.$(":selected").unselect();
    cy.batch(() => {
      clipNodes.forEach((j) => {
        const nid = rid("n");
        idMap[j.data.id] = nid;
        const label = uniqueName(j.data.label);
        const data = { ...j.data, id: nid, ...(j.data.label ? { label, displayLabel: label } : {}) };
        delete data.assetId;
        added.push(cy.add({ group: "nodes", data, position: { x: (j.position?.x || 0) + dx, y: (j.position?.y || 0) + dy } }));
      });
      clip.filter((j) => j.group === "edges").forEach((j) => {
        const s = idMap[j.data.source];
        const t = idMap[j.data.target];
        if (!s || !t) return;
        const label = uniqueName(j.data.label);
        const data = { ...j.data, id: rid("e"), source: s, target: t, ...(j.data.label ? { label, displayLabel: label } : {}) };
        delete data.assetId;
        added.push(cy.add({ group: "edges", data }));
      });
    });
    cy.collection(added).select();
    setToast(`Pasted ${added.length} element(s) at the centre of the view.`);
  }, []);

  // ── File ─────────────────────────────────────────────────────────────────────
  const persist = useCallback(
    async (asNew) => {
      const cy = cyRef.current;
      if (!cy) return;
      if (!isBuilder) {
        // Embedded (Simulation Config): the host saves, e.g. as a new
        // "<name> - Edited Network" it then points the configuration at.
        if (readOnly || !hostRef.current.onControlledSave) return;
        const payload = {
          name: network.name || "Simulation Network",
          description: network.description || "",
          force: asNew === "force",
          ...serializeGraph(cy),
        };
        setSaveStatus("saving");
        try {
          await hostRef.current.onControlledSave(payload);
          ws.markSaved();
          setSaveStatus("saved");
          clearTimeout(saveTimerRef.current);
          saveTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
        } catch (e) {
          setSaveStatus("error");
          setToast(e.message || "Save failed");
        }
        return;
      }
      let name = network.name.trim();
      if (asNew) {
        const proposed = window.prompt("Save a copy as:", name ? `${name} copy` : "Untitled network");
        if (proposed == null) return;
        name = proposed.trim();
      } else if (!name) {
        // No name yet — ask for one on the first save.
        const proposed = window.prompt("Name this network:", "Untitled network");
        if (proposed == null) return;
        name = proposed.trim();
      }
      if (!name) {
        setToast("Give the network a name before saving.");
        return;
      }
      const payload = { name, description: network.description || "", ...serializeGraph(cy) };
      setSaveStatus("saving");
      try {
        const useUpdate = network.id && !asNew;
        const doc = useUpdate ? await updateNetwork(network.id, payload) : await saveNetwork(payload);
        // markSaved clears dirty, adopts the backend id for a previously
        // unsaved workspace, and mirrors the id into the URL.
        if (activeWorkspaceId) {
          ws.markSaved(activeWorkspaceId, {
            networkId: doc.id,
            name: doc.name,
          });
        }
        setSaveStatus("saved");
        window.dispatchEvent(new Event(NETWORK_SAVED_EVENT));
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
      } catch (e) {
        setSaveStatus("error");
        setToast(e.message || "Save failed");
      }
    },
    [network, navigate, isBuilder, readOnly, ws]
  );

  const handleSave = useCallback(() => persist(false), [persist]);
  const handleSaveAs = useCallback(() => persist(true), [persist]);

  // Stable identity — an inline object literal here would change on every
  // NetworkBuilderPage render (canvas drags, selection changes, etc. all
  // re-render this page), which would re-trigger WorkspaceRecordSidebar's
  // load effect constantly.
  const networkSidebarApi = useMemo(
    () => ({ list: () => fetchNetworks().then((d) => d.networks || []), remove: deleteNetwork }),
    []
  );

  const handleExportJSON = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const doc = { name: network.name || "network", description: network.description || "", ...serializeGraph(cy) };
    download(`${(network.name || "network").replace(/\s+/g, "_")}.json`, JSON.stringify(doc, null, 2), "application/json");
  }, [network]);

  const handleExportCSV = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const header = ["element", "id", "label", "type", "category", "status", "source", "target", "assetId", "x", "y", "pipelineLength", "pipelineDiameter", "pipelineMaterial"];
    const rows = [header.join(",")];
    cy.nodes().forEach((n) => {
      const d = n.data();
      const p = n.position();
      const s = (d.meta || {}).specifications || {};
      rows.push([
        "node", d.id, d.label, d.type, d.category, d.status, "", "", d.assetId,
        Math.round(p.x), Math.round(p.y), s.pipelineLength, s.pipelineDiameter, s.pipelineMaterial,
      ].map(csvCell).join(","));
    });
    cy.edges().forEach((e) => {
      const d = e.data();
      const s = (d.meta || {}).specifications || {};
      rows.push([
        "edge", d.id, d.label, d.kind || "pipe", "", d.status, d.source, d.target, d.assetId,
        "", "", s.pipelineLength, s.pipelineDiameter, s.pipelineMaterial,
      ].map(csvCell).join(","));
    });
    download(`${(network.name || "network").replace(/\s+/g, "_")}.csv`, rows.join("\n"), "text/csv");
  }, [network]);

  // Build a canvas document from a parsed KMZ/KML: points become classified
  // nodes (pinned as anchors so the Map view works immediately and a re-export
  // round-trips), lines become straight pipes between their resolved endpoints.
  const buildGeoImportDoc = useCallback((imported) => {
    const coords = [
      ...imported.points.map((p) => ({ lat: p.lat, lng: p.lng })),
      ...imported.lines.flatMap((l) => l.coordinates),
    ];
    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity;
    for (const c of coords) {
      const lat = Number(c.lat);
      const lng = Number(c.lng);
      if (Number.isFinite(lat)) { if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat; }
      if (Number.isFinite(lng)) { if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng; }
    }
    const spanLng = Math.max(maxLng - minLng, 1e-7);
    const spanLat = Math.max(maxLat - minLat, 1e-7);
    const scale = Math.min(900 / spanLng, 650 / spanLat);
    const toModel = (g) => ({ x: 100 + (g.lng - minLng) * scale, y: 100 + (maxLat - g.lat) * scale });

    const nodes = [];
    const placed = []; // { id, x, y } for nearest-endpoint matching
    const byRoundTripId = new Map();
    imported.points.forEach((point, i) => {
      const type = point.forcedType || classifyKmzPoint(point).type;
      const name = point.name || `Imported ${i + 1}`;
      const id = rid("n");
      const position = toModel(point);
      nodes.push({
        data: {
          id, type, category: type, label: name, displayLabel: name, status: "active",
          meta: {
            latitude: point.lat, longitude: point.lng, geoAnchor: true, active: true,
            asset_type: type, specifications: {},
          },
        },
        position,
      });
      placed.push({ id, ...position });
      if (point.widispatchId) byRoundTripId.set(String(point.widispatchId), id);
    });

    const nearestNodeId = (pos, maxDist = 26) => {
      let best = null;
      let bestD = Infinity;
      for (const p of placed) {
        const d = Math.hypot(p.x - pos.x, p.y - pos.y);
        if (d < bestD) { bestD = d; best = p.id; }
      }
      return bestD <= maxDist ? best : null;
    };
    const junctionAt = (pos, latlng) => {
      const id = rid("n");
      nodes.push({
        data: {
          id, type: "node", category: "node", label: "Junction", displayLabel: "Junction", status: "active",
          meta: { latitude: latlng.lat, longitude: latlng.lng, geoAnchor: true, active: true, specifications: {} },
        },
        position: pos,
      });
      placed.push({ id, ...pos });
      return id;
    };
    const resolveEndpoint = (roundTripId, coord) => {
      if (roundTripId && byRoundTripId.has(String(roundTripId))) return byRoundTripId.get(String(roundTripId));
      const pos = toModel(coord);
      return nearestNodeId(pos) || junctionAt(pos, coord);
    };

    const edges = [];
    imported.lines.forEach((line) => {
      const first = line.coordinates[0];
      const last = line.coordinates[line.coordinates.length - 1];
      const source = resolveEndpoint(line.sourceId, first);
      const target = resolveEndpoint(line.targetId, last);
      if (!source || !target || source === target) return;
      const label = line.name || "Pipe";
      edges.push({
        data: {
          id: rid("e"), source, target, kind: "pipe", label, displayLabel: label,
          status: "active", active: true, meta: { specifications: { bidirectional: false } },
        },
      });
    });

    return { name: imported.name || "Imported network", description: "", nodes, edges };
  }, []);

  // KMZ/KML import: parse, then let the user review/override the detected
  // entity type per KML folder (SWIIMS KMZ review dialog) before placing.
  const importGeoFile = useCallback(async (file) => {
    try {
      const imported = await parseNetworkGeoFile(file);
      if (!imported.points.length && !imported.lines.length) {
        setToast("No Point or LineString geometry was found in that file.");
        return;
      }
      if (!imported.points.length) {
        placeGeoImportRef.current?.(imported, file.name);
        return;
      }
      setKmzReview({ imported, fileName: file.name, rows: buildKmzReviewRows(imported.points) });
    } catch (err) {
      setToast(`Couldn't import that file: ${err.message}`);
    }
  }, []);

  const placeGeoImportRef = useRef(null);
  const placeGeoImport = useCallback(
    (imported, fileName) => {
      const file = { name: fileName };
      try {
        const cy = cyRef.current;
        if (!cy) return;
        const doc = buildGeoImportDoc(imported);
        controller.loadDocument(doc);
        clearTraceClasses(cy);
        cy.fit(undefined, 48);
        const workspaceId = activeWorkspaceId;
        if (workspaceId) {
          ws.markSaved(workspaceId, { networkId: null, name: doc.name });
          ws.notifyDocumentMutated();
        }
        setSelectedEl(null);
        setTraceInfo(null);
        syncGraph();
        resetHistory();
        setGeoTick((v) => v + 1);
        setToast(`Imported ${doc.nodes.length} asset(s) and ${doc.edges.length} pipe(s) from ${file.name}.`);
      } catch (err) {
        setToast(`Couldn't import that file: ${err.message}`);
      }
    },
    [buildGeoImportDoc, activeWorkspaceId, syncGraph, resetHistory]
  );
  placeGeoImportRef.current = placeGeoImport;

  const handleImportFile = useCallback(
    (file) => {
      if (!file) return;
      if (/\.(kmz|kml)$/i.test(file.name)) {
        void importGeoFile(file);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const doc = JSON.parse(reader.result);
          const cy = cyRef.current;
          if (!cy) return;
          controller.loadDocument(doc);
          clearTraceClasses(cy);
          cy.fit(undefined, 48);
          // An import becomes a new unsaved document in the active workspace.
          const workspaceId = activeWorkspaceId;
          if (workspaceId) {
            ws.markSaved(workspaceId, {
              networkId: null,
              name: doc.name || "Imported network",
            });
            ws.notifyDocumentMutated();
          }
          setSelectedEl(null);
          setTraceInfo(null);
          syncGraph();
          resetHistory();
          setToast("Imported canvas from file.");
        } catch {
          setToast("Couldn't parse that JSON file.");
        }
      };
      reader.readAsText(file);
    },
    [activeWorkspaceId, syncGraph, resetHistory, importGeoFile]
  );

  // "New" now opens another workspace tab instead of discarding the current
  // document, so there is nothing to confirm away.
  const handleNew = useCallback(() => {
    void ws.createWorkspace();
  }, []);

  // ── Area-zoom drag overlay ───────────────────────────────────────────────────
  const areaDown = useCallback((e) => {
    const rect = containerRef.current.getBoundingClientRect();
    areaRef.current = { x0: e.clientX - rect.left, y0: e.clientY - rect.top };
    setAreaBox({ x: areaRef.current.x0, y: areaRef.current.y0, w: 0, h: 0 });
  }, []);
  const areaMove = useCallback((e) => {
    if (!areaRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const { x0, y0 } = areaRef.current;
    setAreaBox({ x: Math.min(x0, x), y: Math.min(y0, y), w: Math.abs(x - x0), h: Math.abs(y - y0) });
  }, []);
  const areaUp = useCallback(() => {
    const cy = cyRef.current;
    const box = areaRef.current;
    areaRef.current = null;
    setAreaBox(null);
    if (!cy || !box) return;
    const rect = containerRef.current.getBoundingClientRect();
    const zoom = cy.zoom();
    const pan = cy.pan();
    const cur = box.cur;
    if (!cur || cur.w < 8 || cur.h < 8) {
      setModeSafe("select");
      return;
    }
    const mx1 = (cur.x - pan.x) / zoom;
    const my1 = (cur.y - pan.y) / zoom;
    const mx2 = (cur.x + cur.w - pan.x) / zoom;
    const my2 = (cur.y + cur.h - pan.y) / zoom;
    const bw = mx2 - mx1;
    const bh = my2 - my1;
    const nz = Math.max(cy.minZoom(), Math.min(cy.maxZoom(), Math.min(rect.width / bw, rect.height / bh) * 0.9));
    cy.zoom(nz);
    cy.pan({ x: rect.width / 2 - ((mx1 + mx2) / 2) * nz, y: rect.height / 2 - ((my1 + my2) / 2) * nz });
    setModeSafe("select");
  }, [setModeSafe]);

  // ── Toast auto-dismiss + label visibility ────────────────────────────────────
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);


  useEffect(() => {
    snapToGridRef.current = snapToGrid;
  }, [snapToGrid]);

  useEffect(() => {
    showLabelsRef.current = showLabels;
    const cy = cyRef.current;
    if (!cy) return;
    if (showLabels) cy.elements().removeClass("hide-labels");
    else cy.elements().addClass("hide-labels");
  }, [showLabels, cyReady]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      cyRef.current?.resize();
    });
    return () => cancelAnimationFrame(frame);
  }, [canvasFocusMode, showLibrary, showInspector, showRail, showRibbon, focusRibbonOpen]);

  // Cytoscape only re-measures on window resizes, so follow the canvas box
  // itself (sidebar drags, panels opening, the toolbar collapsing).
  useEffect(() => {
    const wrap = canvasWrapRef.current;
    if (!cyReady || !wrap || typeof ResizeObserver === "undefined") return undefined;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        cyRef.current?.resize();
        updateGridBackground();
      });
    });
    observer.observe(wrap);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [cyReady, updateGridBackground]);

  const handleToggleCanvasFocus = useCallback(() => {
    setCanvasFocusMode((v) => !v);
  }, []);

  const handleToggleLibraryPanel = useCallback(() => {
    if (canvasFocusMode) {
      setCanvasFocusMode(false);
      setShowLibrary(true);
      return;
    }
    setShowLibrary((v) => !v);
  }, [canvasFocusMode]);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────
  // The canvas registers every shortcut here and nowhere else: toolbar buttons
  // call the same handlers, but binding keys next to them as well would fire
  // each action twice.
  useEffect(() => {
    const isTypingTarget = (target) => {
      if (!target || typeof target.closest !== "function") return false;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
      if (target.isContentEditable) return true;
      // A form window owns the keyboard while focus is inside it.
      return !!target.closest('[role="dialog"]');
    };

    const onKey = (e) => {
      const key = e.key;
      const lower = typeof key === "string" ? key.toLowerCase() : "";
      const mod = e.metaKey || e.ctrlKey;

      if (isTypingTarget(e.target)) {
        if (key === "Escape" && typeof e.target.blur === "function") e.target.blur();
        return;
      }

      // Workspace shortcuts live in this handler rather than a second global
      // listener, so nothing fires twice.
      //
      // Ctrl/Cmd+Tab is deliberately absent: Chrome reserves it for browser
      // tab switching and the event is not cancelable, so binding it would
      // silently do nothing.
      if (mod && e.altKey) {
        if (key === "ArrowRight") {
          e.preventDefault();
          void ws.activateRelative(1);
          return;
        }
        if (key === "ArrowLeft") {
          e.preventDefault();
          void ws.activateRelative(-1);
          return;
        }
        if (lower === "n") {
          e.preventDefault();
          void ws.createWorkspace();
          return;
        }
      }
      if (mod && e.shiftKey && lower === "t") {
        e.preventDefault();
        void ws.reopenLastClosed();
        return;
      }
      if (mod && !e.shiftKey && lower === "w") {
        // Closing is undoable via Ctrl/Cmd+Shift+T, so no confirmation prompt.
        e.preventDefault();
        const id = workspaceStore.getState().activeWorkspaceId;
        if (id) void ws.closeWorkspace(id);
        return;
      }

      // The guide is a pinned panel rather than a modal, so it does not take
      // the keyboard: it only claims Esc, ahead of leaving a tool.
      if (shortcutsOpen && (key === "Escape" || key === "?")) {
        e.preventDefault();
        setShortcutsOpen(false);
        return;
      }

      // Edit
      if (mod && lower === "z" && !e.shiftKey) { e.preventDefault(); handleUndo(); return; }
      if (mod && (lower === "y" || (lower === "z" && e.shiftKey))) { e.preventDefault(); handleRedo(); return; }
      if (mod && lower === "s") { e.preventDefault(); handleSave(); return; }
      if (mod && lower === "c") { e.preventDefault(); handleCopySelection(); return; }
      if (mod && lower === "x") { e.preventDefault(); handleCutSelection(); return; }
      if (mod && lower === "v") { e.preventDefault(); handlePaste(); return; }
      if (key === "Delete" || key === "Backspace") { e.preventDefault(); handleDelete(); return; }

      // Select
      if (mod && lower === "a") { e.preventDefault(); handleSelectAll(); return; }
      if (lower === "arrowleft" || lower === "arrowright" || lower === "arrowup" || lower === "arrowdown") {
        const step = (e.shiftKey ? 10 : 1) * CANVAS_GRID_PITCH;
        const dx = lower === "arrowleft" ? -step : lower === "arrowright" ? step : 0;
        const dy = lower === "arrowup" ? -step : lower === "arrowdown" ? step : 0;
        if (nudgeSelection(dx, dy)) e.preventDefault();
        return;
      }

      // Note formatting — only claim the key while a note is selected, so
      // Ctrl/Cmd+B/I/U stay free everywhere else.
      if (mod && !e.shiftKey && (lower === "b" || lower === "i" || lower === "u")) {
        const cy = cyRef.current;
        if (cy && cy.$('node:selected[type="note"]').nonempty()) {
          e.preventDefault();
          noteFmt(lower === "b" ? "noteBold" : lower === "i" ? "noteItalic" : "noteUnderline");
          return;
        }
      }

      // View
      if (mod && e.shiftKey && lower === "f") { e.preventDefault(); handleToggleCanvasFocus(); return; }
      if (!mod && lower === "f") { e.preventDefault(); handleFit(); return; }
      if (!mod && lower === "z") { e.preventDefault(); handleZoomToSelection(); return; }
      if (key === "?") { e.preventDefault(); setShortcutsOpen(true); return; }
      if (key === "Escape") {
        e.preventDefault();
        // Leave the active tool first; full screen is only dropped once there
        // is no tool left to leave.
        if (modeRef.current !== "select") setModeSafe("select");
        else if (canvasFocusMode) setCanvasFocusMode(false);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    shortcutsOpen, canvasFocusMode, setModeSafe, handleUndo, handleRedo, handleSave,
    handleCopySelection, handleCutSelection, handlePaste, handleDelete, handleSelectAll,
    nudgeSelection, handleFit, handleZoomToSelection, handleToggleCanvasFocus, noteFmt,
  ]);


  const handleToggleDetailsPanel = useCallback(() => {
    setRightPanelTab("details");
    if (canvasFocusMode) {
      setCanvasFocusMode(false);
      setShowInspector(true);
      return;
    }
    setShowInspector((v) => !v);
  }, [canvasFocusMode]);

  // ── Contextual toolbar ────────────────────────────────────────────────────────
  const isPipeSel = selectedEl?._group === "edge";
  const isNoteSel = selectedEl?._group === "node" && selectedEl?.type === "note";
  // Geographic view data, recomputed when the map opens or an anchor / node
  // position changes (geoTick — bumped on pin, map drag, and route).
  const geoView = useMemo(
    () => (viewMode === "map" && cyReady && cyRef.current ? buildGeoData(cyRef.current) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [viewMode, cyReady, geoTick, buildGeoData]
  );
  const hasPipeSelection = selectedEdgeCount > 0;
  const hasDeletableSelection = selectedDeletableCount > 0;
  const canUndo = historyRef.current.past.length > 0;
  const canRedo = historyRef.current.future.length > 0;
  const realNodeCount = counts.nodes;

  useEffect(() => {
    try {
      window.localStorage.setItem(SNAP_TO_GRID_STORAGE_KEY, String(snapToGrid));
    } catch {
      // Storage unavailable: the toggle still works for this session.
    }
  }, [snapToGrid]);

  // ── Status bar (SWIIMS StatusBar): counts, save state, selection, zoom ─────
  const workspaceDirty = isBuilder ? Boolean(activeWorkspace?.dirty) : embeddedDirty;
  const saveState = saveStatus === "saving"
    ? { label: "Saving…", tone: "acc" }
    : saveStatus === "error"
    ? { label: "Save failed", tone: "err" }
    : !network.id && !workspaceDirty && isBuilder
    ? { label: "New", tone: "neutral" }
    : workspaceDirty
    ? { label: "Unsaved", tone: "warn" }
    : { label: "Saved", tone: "ok" };
  // Footer toggles for the two sidebars (the toolbar collapses from its own
  // button). Canvas focus mode hides both, so turning one on from there also
  // leaves focus mode.
  const leftRailVisible = showRail && !canvasFocusMode;
  const inspectorVisible = showInspector && !canvasFocusMode;
  // Both sit together at the far right of the bar.
  const panelToggles = useMemo(() => [
    {
      id: "left-panel",
      label: "Left panel",
      title: leftRailVisible ? "Hide the left sidebar" : "Show the left sidebar",
      icon: PanelLeft,
      pressed: leftRailVisible,
      onClick: () => {
        if (canvasFocusMode) { setCanvasFocusMode(false); setShowRail(true); }
        else setShowRail((v) => !v);
      },
    },
    {
      id: "right-panel",
      label: "Right panel",
      title: inspectorVisible ? "Hide the right sidebar" : "Show the right sidebar",
      icon: PanelRight,
      pressed: inspectorVisible,
      onClick: () => {
        if (canvasFocusMode) { setCanvasFocusMode(false); setShowInspector(true); }
        else setShowInspector((v) => !v);
      },
    },
  ], [leftRailVisible, inspectorVisible, canvasFocusMode, setShowRail, setShowInspector]);

  // One footer count per asset type on the canvas, in the right panel's
  // category order and colours; edges are counted as "Pipes".
  const footerAssetCounts = useMemo(
    () => ASSET_CATEGORIES
      .filter(({ key }) => assetSummary[key]?.count)
      .map(({ key, label }) => ({
        label: key === PIPELINE_KEY ? "Pipes" : label,
        value: assetSummary[key].count,
        tone: categoryColour(key),
      })),
    [assetSummary, categoryColour]
  );

  const canvasStatus = useCanvasStatus({
    cyRef,
    cyReady,
    assetCounts: footerAssetCounts,
    selectedCount,
    saveState,
    trailing: panelToggles,
  });

  // ── Symbol shape (View → Symbol), remembered per browser ─────────────────
  const handleSetSymbolShape = useCallback((shape) => {
    const next = setEntitySymbolShape(shape);
    setSymbolShapeState(next);
    const cy = cyRef.current;
    if (cy) cy.batch(() => cy.nodes().forEach((node) => applyEntitySymbol(node)));
  }, []);

  // ── Rename (Home → File → Rename) ──────────────────────────────────────────
  const handleRename = useCallback(async () => {
    const current = network.name || "";
    const proposed = window.prompt("Rename network:", current || "Untitled network");
    if (proposed == null) return;
    const name = proposed.trim();
    if (!name || name === current) return;
    try {
      if (network.id) await updateNetwork(network.id, { name });
      if (activeWorkspaceId) {
        if (network.id) ws.markSaved(activeWorkspaceId, { networkId: network.id, name });
        else workspaceController.renameWorkspace(activeWorkspaceId, name);
      }
      window.dispatchEvent(new Event(NETWORK_SAVED_EVENT));
      setToast(`Renamed to "${name}".`);
    } catch (e) {
      setToast(e.message || "Rename failed");
    }
  }, [network, activeWorkspaceId, ws]);

  // ── Draw Route (Insert → Draw Route) ──────────────────────────────────────
  const drawRoute = useDrawRoute({
    cyRef,
    cyReady,
    mode,
    onToast: setToast,
    onFinish: (finished) => {
      setPipeModal({ open: true, source: finished.sourceId, target: finished.targetId, route: finished });
      modeRef.current = "select";
      setMode("select");
    },
  });

  // ── Notes & group boxes as HTML overlays ──────────────────────────────────
  const annotations = useAnnotationOverlays({
    cyRef,
    cyReady,
    snapToGridRef,
    readOnly,
    onCommit: () => {
      scheduleCommit();
      syncSelection();
    },
  });

  const handleSelectInactiveConnected = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const hits = cy.nodes().filter((n) => {
      const d = n.data();
      if (ANNOTATION_TYPES.includes(d.type)) return false;
      const inactive = d.active === false || d.meta?.active === false || ["inactive", "decommissioned"].includes(d.status);
      return inactive && n.connectedEdges().length > 0;
    });
    cy.$(":selected").unselect();
    hits.select();
    syncSelection();
    setToast(hits.length ? `Selected ${hits.length} inactive asset(s) that still have pipes.` : "No inactive assets are connected.");
  }, [syncSelection]);

  // ── Validation dock (Home → Panel → Validation) ───────────────────────────
  const [validationDockOpen, setValidationDockOpen] = useState(false);

  // ── Traceability exports (Tools → Export; per-trace in the trace panel) ──
  const exportTraces = useCallback(
    async (infos, format, label) => {
      const base = (network.name || "network").replace(/\s+/g, "_");
      const filename = `${base}_${label || "traceability"}`;
      try {
        if (format === "pdf") await exportTracePDF(infos, { title: "Traceability report", subtitle: network.name || "Network", filename });
        else await exportTraceExcel(infos, filename);
      } catch (err) {
        setToast(`Export failed: ${err.message}`);
      }
    },
    [network.name]
  );
  const handleExportAllTraceability = useCallback(
    (format) => {
      const cy = cyRef.current;
      if (!cy) return;
      const flowByEdge = buildFlowByEdge(cy);
      const infos = cy
        .nodes()
        .filter((n) => MULTI_DELIVERY_TYPES.has(n.data("type")))
        .map((n) => buildTraceInfo(cy, n.id(), { flowByEdge, mode: traceMode }))
        .filter(Boolean)
        .sort((a, b) => a.rootName.localeCompare(b.rootName));
      if (!infos.length) {
        setToast("No delivery points on the canvas to trace.");
        return;
      }
      void exportTraces(infos, format, "traceability_all");
    },
    [exportTraces, traceMode]
  );

  // ── Geo Anchor panel (View → Geo Anchor; SWIIMS GeoAnchorPanel) ───────────
  const [geoPanelOpen, setGeoPanelOpen] = useState(false);
  const geoPanelData = useMemo(() => {
    const cy = cyRef.current;
    if (!geoPanelOpen || !cy) return null;
    const anchors = georefAnchors(cy);
    const status = transformStatus(anchors);
    const transform = computeTransform(anchors);
    let node = null;
    if (selectedEl?._group === "node" && !ANNOTATION_TYPES.includes(selectedEl.type)) {
      const el = cy.getElementById(selectedEl.id);
      const meta = el.data("meta") || {};
      const lat = Number(meta.latitude);
      const lng = Number(meta.longitude);
      const hasCoords = Number.isFinite(lat) && Number.isFinite(lng) && meta.latitude !== "" && meta.longitude !== "" && meta.latitude != null;
      node = {
        id: el.id(),
        name: el.data("label") || el.id(),
        isAnchor: meta.geoAnchor === true && hasCoords,
        lat,
        lng,
        candidate: hasCoords && meta.geoAnchor !== true ? { lat, lng } : null,
        derived: transform ? pixelToGeo(el.position(), transform) : null,
      };
    }
    return { node, status, anchorCount: anchors.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoPanelOpen, selectedEl, geoTick, georefAnchors]);
  const setGeoAnchor = useCallback(
    (lat, lng) => {
      const cy = cyRef.current;
      const id = geoPanelData?.node?.id;
      if (!cy || !id) return;
      const el = cy.getElementById(id);
      el.data("meta", { ...(el.data("meta") || {}), geoAnchor: true, latitude: lat, longitude: lng });
      scheduleCommit();
      syncSelection();
      setGeoTick((v) => v + 1);
      setToast(`Pinned ${el.data("label") || id} at ${lat.toFixed(5)}, ${lng.toFixed(5)}.`);
    },
    [geoPanelData, scheduleCommit, syncSelection]
  );
  const clearGeoAnchor = useCallback(() => {
    const cy = cyRef.current;
    const id = geoPanelData?.node?.id;
    if (!cy || !id) return;
    const el = cy.getElementById(id);
    el.data("meta", { ...(el.data("meta") || {}), geoAnchor: false });
    scheduleCommit();
    syncSelection();
    setGeoTick((v) => v + 1);
    setToast("Removed geo anchor.");
  }, [geoPanelData, scheduleCommit, syncSelection]);

  // ── Table view edits (View → Table) ───────────────────────────────────────
  const [tableTick, setTableTick] = useState(0);
  const numOrNull = (v) => (v === "" || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
  const handleTableEditAsset = useCallback(
    (id, patch) => {
      const cy = cyRef.current;
      const el = cy?.getElementById(id);
      if (!el || !el.length) return;
      const meta = { ...(el.data("meta") || {}) };
      const specs = { ...(meta.specifications || {}) };
      if ("label" in patch) el.data({ label: patch.label, displayLabel: patch.label });
      if ("status" in patch) el.data("status", patch.status);
      if ("region" in patch) meta.region = patch.region || null;
      if ("capacity" in patch) specs.design_capacity = numOrNull(patch.capacity);
      if ("region" in patch || "capacity" in patch) el.data("meta", { ...meta, specifications: specs });
      scheduleCommit();
      syncGraph();
      setTableTick((t) => t + 1);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scheduleCommit, syncGraph]
  );
  const handleTableEditPipe = useCallback(
    (id, patch) => {
      const cy = cyRef.current;
      const el = cy?.getElementById(id);
      if (!el || !el.length) return;
      if ("label" in patch) el.data({ label: patch.label, displayLabel: patch.label });
      if ("active" in patch) el.data({ active: patch.active, status: patch.active ? "operational" : "inactive" });
      const specKeys = ["capacity", "pipelineLength", "pipelineDiameter", "pipelineMaterial"].filter((k) => k in patch);
      if (specKeys.length) {
        const meta = { ...(el.data("meta") || {}) };
        const specs = { ...(meta.specifications || {}) };
        specKeys.forEach((k) => {
          specs[k] = k === "pipelineMaterial" ? patch[k] || null : numOrNull(patch[k]);
        });
        el.data("meta", { ...meta, specifications: specs });
      }
      scheduleCommit();
      setTableTick((t) => t + 1);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scheduleCommit]
  );

  // ── Simulation layer (embedded in Simulation Config) ──────────────────────
  const [showRunLegend, setShowRunLegend] = useState(true);
  const sim = useSimulationLayer({
    cyRef,
    cyReady,
    plan,
    document: controlledDocument,
    enabled: !isBuilder,
    mode,
    setMode: setModeSafe,
    containerRef: canvasWrapRef,
    onToast: setToast,
  });

  // ── Group Lines (Tools → Review) ──────────────────────────────────────────
  const [groupLinesOpen, setGroupLinesOpen] = useState(false);
  const handleGroupLines = useCallback(() => {
    const cy = cyRef.current;
    if (!cy || !cy.$("edge:selected").length) {
      setToast("Select the pipes to group into a line first.");
      return;
    }
    setGroupLinesOpen(true);
  }, []);
  const submitGroupLines = useCallback(
    async (form) => {
      const cy = cyRef.current;
      if (!cy) return;
      const { systemId, lineIds } = await resolveSystemAndLine(form);
      const pipes = cy.$("edge:selected");
      cy.batch(() => {
        pipes.forEach((edge) => {
          const meta = { ...(edge.data("meta") || {}) };
          const specs = { ...(meta.specifications || {}) };
          if (systemId) specs.transmissionSystemId = systemId;
          specs.lineGroupIds = lineIds;
          edge.data("meta", { ...meta, specifications: specs });
        });
      });
      scheduleCommit();
      syncSelection();
      setGroupLinesOpen(false);
      setToast(`Grouped ${pipes.length} pipe(s) into the line.`);
    },
    [resolveSystemAndLine, scheduleCommit, syncSelection]
  );

  // ── Change Source / Destination (right-click a pipe) ──────────────────────
  const reconnect = useReconnect({
    cyRef,
    cyReady,
    mode,
    setMode: setModeSafe,
    onToast: setToast,
    onChanged: () => syncSelection(),
  });
  menuActionsRef.current = {
    reconnect: readOnly ? null : reconnect.begin,
    copy: handleCopySelection,
    paste: readOnly ? null : handlePaste,
  };

  // ── Entity editor (Home → Edit; SWIIMS entity modal) ──────────────────────
  const handleEditSelected = useCallback(() => {
    const cy = cyRef.current;
    if (!cy || readOnly) return;
    const sel = cy.$(":selected");
    if (sel.length !== 1) {
      setToast("Select one asset or pipe to edit.");
      return;
    }
    const el = sel[0];
    if (el.isEdge()) {
      setPipeModal({ open: true, editId: el.id(), initial: pipeFormFromEdge(el) });
      return;
    }
    setCanvasEntityModal({ type: el.data("type") || el.data("category"), mode: "edit", targetId: el.id(), position: null });
  }, [readOnly]);

  const submitCanvasEntity = useCallback(
    (patch) => {
      const cy = cyRef.current;
      const modal = canvasEntityModal;
      if (!cy || !modal) return;
      const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
      if (clean.label != null) clean.displayLabel = clean.label;
      if (modal.mode === "create") {
        const node = cy.add({
          group: "nodes",
          data: { id: rid("n"), type: modal.type, category: modal.type, status: "", meta: { specifications: {} }, ...clean },
          position: modal.position || { x: 0, y: 0 },
        });
        cy.$(":selected").unselect();
        node.select();
        if (modal.insertOnEdge) splitPipeWithNode(node);
      } else {
        const el = cy.getElementById(modal.targetId);
        if (el && el.length) el.data(clean);
        scheduleCommit();
      }
      setCanvasEntityModal(null);
      syncGraph();
      syncSelection();
    },
    [canvasEntityModal, scheduleCommit, syncGraph, syncSelection, splitPipeWithNode]
  );

  // Feature handlers/state contributed by the WIPlan feature modules below the
  // core canvas (absent ones are hidden from the ribbon).
  const ribbonExtras = {
    editSelected: readOnly ? null : handleEditSelected,
    groupLines: readOnly ? null : handleGroupLines,
    exportTraceability: handleExportAllTraceability,
    toggleGeoPanel: () => setGeoPanelOpen((v) => !v),
    toggleTable: () => setViewMode((v) => (v === "table" ? "schematic" : "table")),
    run: !isBuilder && onRun ? onRun : null,
    clearRun: !isBuilder ? sim.clearRun : null,
    toggleBottlenecks: !isBuilder ? sim.toggleBottlenecks : null,
    toggleFlow: !isBuilder ? () => sim.setAnimate((v) => !v) : null,
    selectInactiveConnected: handleSelectInactiveConnected,
    toggleValidationDock: () => {
      setValidationDockOpen((open) => {
        if (!open && !validationIssues.length) handleValidateNetwork();
        return !open;
      });
    },
    hasDrawRoute: !readOnly,
    rename: isBuilder && !readOnly ? handleRename : null,
    setSymbolShape: handleSetSymbolShape,
  };
  const ribbonState = useMemo(
    () => ({
      assetsPanelOpen: false,
      validationDockOpen,
      geoPanelOpen,
      symbolShape,
      running,
      hasRunOverlay: sim.active,
      flowAnimating: sim.animate,
    }),
    [symbolShape, validationDockOpen, geoPanelOpen, running, sim.active, sim.animate]
  );

  // Ribbon commands. Every canvas feature the ribbon can trigger is listed
  // here once; the ribbon definition (ribbon/canvasRibbon.js) decides where it
  // sits and omits any command whose handler is absent.
  const ribbonCommandsRef = useRef({});
  ribbonCommandsRef.current = {
    setMode: setModeSafe,
    save: handleSave,
    saveAs: isBuilder ? handleSaveAs : null,
    rename: ribbonExtras.rename,
    importFile: () => fileInputRef.current?.click(),
    exportAs: (format) => {
      if (format === "json") handleExportJSON();
      else if (format === "csv") handleExportCSV();
      else if (format === "kmz") handleExportKMZ();
    },
    undo: handleUndo,
    redo: handleRedo,
    copySelection: handleCopySelection,
    copyAll: handleCopyAll,
    paste: handlePaste,
    editSelected: ribbonExtras.editSelected || handleEditSelected,
    deleteSelected: handleDelete,
    run: ribbonExtras.run,
    clearRun: ribbonExtras.clearRun,
    toggleDetails: handleToggleDetailsPanel,
    toggleValidationDock: ribbonExtras.toggleValidationDock,
    toggleShortcuts: () => setShortcutsOpen((v) => !v),
    openAssetsPanel: ribbonExtras.openAssetsPanel,
    insertEntity: (type) => (mode === "place-entity" && pendingEntity === type ? setModeSafe("select") : handleInsertEntity(type)),
    toggleLibrary: handleToggleLibraryPanel,
    hasDrawRoute: Boolean(ribbonExtras.hasDrawRoute),
    straighten: handleRemoveAllBends,
    groupBox: handleGroupBox,
    selectAll: handleSelectAll,
    toggleFind: () => setFindOpen((v) => !v),
    toggleIsolation: handleToggleIsolation,
    selectByState: (state) => (state === "active" ? handleSelectActive() : handleSelectInactive()),
    setSelectedActive: (state) => (state === "active" ? handleMakeSelectionActive() : handleMakeSelectionInactive()),
    arrange,
    fit: handleFit,
    zoomToSelection: handleZoomToSelection,
    toggleLabels: () => setShowLabels((v) => !v),
    toggleGrid: () => setShowGrid((v) => !v),
    toggleTable: ribbonExtras.toggleTable,
    toggleMap: () => setViewMode((v) => (v === "map" ? "schematic" : "map")),
    toggleGeoPanel: ribbonExtras.toggleGeoPanel || handlePinGeoAnchor,
    toggleSnap: () => setSnapToGrid((v) => !v),
    setSymbolShape: ribbonExtras.setSymbolShape,
    toggleFullScreen: handleToggleCanvasFocus,
    resetView: handleResetView,
    exportTraceability: ribbonExtras.exportTraceability,
    groupLines: ribbonExtras.groupLines,
    validate: handleValidateNetwork,
    showIssues: handleShowIssues,
    focusIssues: handleFocusIssues,
    selectByIssue: (kind) => {
      if (kind === "disconnected") handleSelectDisconnected();
      else if (kind === "missing-capacity") handleSelectMissingCapacity();
      else if (kind === "inactive-connected") ribbonExtras.selectInactiveConnected?.();
    },
    clearHighlights: handleClearHighlights,
    toggleBottlenecks: ribbonExtras.toggleBottlenecks,
    toggleFlow: ribbonExtras.toggleFlow,
    noteFormat: (key, value) => {
      const legacy = { bold: "noteBold", italic: "noteItalic", underline: "noteUnderline" };
      // A text selection inside a note editor formats just that text
      // (SWIIMS runActiveNoteCommand); otherwise the whole note is formatted.
      if (legacy[key] && annotations.execNoteCommand(key)) return;
      noteFmt(legacy[key] || key, value);
    },
  };

  useEffect(() => {
    const cmd = ribbonCommandsRef.current;
    const ctx = {
      cmd,
      workspaceMode,
      readOnly,
      mode,
      pendingEntity,
      saveStatus,
      canUndo,
      canRedo,
      hasSelection,
      hasPipeSelection,
      hasDeletableSelection,
      canEditSelected: Boolean(selectedEl) && selectedEl?.type !== "note",
      isNoteSel,
      selectedEl,
      noteSizes: NOTE_SIZES,
      nodeCount: realNodeCount,
      edgeCount: counts.edges,
      libraryOpen: showLibrary && !canvasFocusMode,
      detailsOpen: showInspector && !canvasFocusMode && rightPanelTab === "details",
      assetsPanelOpen: ribbonState.assetsPanelOpen,
      validationDockOpen: ribbonState.validationDockOpen,
      shortcutsOpen,
      findOpen,
      isolationActive,
      showLabels,
      showGrid,
      snapToGrid,
      viewMode,
      geoPanelOpen: ribbonState.geoPanelOpen,
      symbolShape: ribbonState.symbolShape,
      fullScreen: canvasFocusMode,
      running: ribbonState.running,
      hasRunOverlay: ribbonState.hasRunOverlay,
      flowAnimating: ribbonState.flowAnimating,
      entityButtons: INSERT_ENTITY_BUTTONS.filter(({ implemented }) => implemented).map(({ type }) => ({
        type,
        label: toolbarEntityLabel(type),
        shortLabel: INSERT_TOOL_SHORT_LABELS[type],
        icon: ENTITY_ICONS[type] || EmptyIcon,
      })),
    };

    const ribbon = (
      <CanvasRibbon
        tabs={buildCanvasRibbon(ctx)}
        activeTab={ribbonTab}
        onTabChange={setRibbonTab}
        contextualGroups={buildNoteFormatGroup(ctx)}
        collapsed={canvasFocusMode ? !focusRibbonOpen : !showRibbon}
        onToggleCollapsed={() => (canvasFocusMode ? setFocusRibbonOpen((v) => !v) : setShowRibbon((v) => !v))}
      />
    );
    // The workspace tab bar (builder only) and the ribbon both live in the
    // app-wide toolbar slot, so they span the page and the side rails start
    // underneath them.
    setToolbar(
      <div className="nb-chrome">
        {isBuilder && (
          <TabStripBoundary>
            <WorkspaceTabs />
          </TabStripBoundary>
        )}
        {ribbon}
      </div>
    );
  }, [
    setToolbar, isBuilder, workspaceMode, readOnly, ribbonTab, mode, pendingEntity, saveStatus, canUndo, canRedo,
    hasSelection, hasPipeSelection, hasDeletableSelection, selectedEl, isNoteSel, realNodeCount, counts.edges,
    showLibrary, canvasFocusMode, showInspector, rightPanelTab, shortcutsOpen, findOpen, isolationActive,
    showLabels, showGrid, snapToGrid, viewMode, ribbonState, histTick, showRibbon, setShowRibbon, focusRibbonOpen,
  ]);

  useEffect(() => {
    setSidebar(null);
  }, [setSidebar]);

  useEffect(
    () => () => {
      setToolbar(null);
      setSidebar(null);
      clearTimeout(saveTimerRef.current);
    },
    [setToolbar, setSidebar]
  );

  const bannerText =
    mode === "place-asset"
      ? pendingSystem
        ? `Placing "${pendingSystem.name || pendingSystem.id}" system - click the canvas`
        : !pendingAsset
        ? "Select an asset from the library for the selected pipe"
        : Array.isArray(pendingAsset)
        ? `Placing ${pendingAsset.length} selected assets — click the canvas`
        : `Placing "${pendingAsset?.name || pendingAsset?.id}" — click the canvas`
      : mode === "place-entity"
      ? `Inserting ${toolbarEntityLabel(pendingEntity)} — click the canvas (Esc to finish)`
      : mode === "place-note"
      ? "Click the canvas to drop a note"
      : mode === "insert-on-edge"
      ? "Click a pipe to insert an entity on it"
      : mode === BOTTLENECK_MODE
      ? "Bottlenecks — binding pipes, plants and delivery points are highlighted"
      : mode === RECONNECT_MODE
      ? `Change ${reconnect.pending?.end === "source" ? "source" : "destination"} — click the new node`
      : mode === DRAW_ROUTE_MODE
      ? (drawRoute.route
        ? `Route: ${drawRoute.route.points.length} point(s) — click to add a junction, Shift+click for a bend, Backspace to undo, click the target asset to finish`
        : "Draw Route — click the source asset")
      : mode === "area-zoom"
      ? "Drag a rectangle to zoom into that region"
      : mode === "draw-pipe"
      ? lineSource
        ? "Draw Pipe — click the target node"
        : "Draw Pipe — click the source node"
      : mode === "trace"
      ? "Trace HP — click a handover point or delivery node"
      : null;

  return (
    <div className={`nb-page nb-page--${mode}${canvasFocusMode ? " nb-page--canvas-focus" : ""}`}>
      <input
        ref={fileInputRef}
        type="file"
        aria-label="Import network JSON"
        accept="application/json,.json,.kmz,.kml"
        style={{ display: "none" }}
        onChange={(e) => {
          handleImportFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {/* Left sidebar: saved networks, or the asset library when it is open */}
      {leftRailVisible && (
        <aside className="nb-rail" style={{ width: leftRailSize.width }}>
          <div {...leftRailSize.handleProps} />
          {isBuilder && (
          <div className="nb-rail__switch ns2-library-tabs" role="tablist" aria-label="Left sidebar">
            <button
              type="button"
              role="tab"
              aria-selected={!showLibrary}
              className={`ns2-library-tab${!showLibrary ? " ns2-library-tab--active" : ""}`}
              onClick={() => setShowLibrary(false)}
            >
              Networks
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={showLibrary}
              className={`ns2-library-tab${showLibrary ? " ns2-library-tab--active" : ""}`}
              onClick={() => setShowLibrary(true)}
            >
              Library
            </button>
          </div>
          )}
          <div className="nb-rail__body">
            {showLibrary || !isBuilder ? (
              <div className="nb-library ns2-library">
                <NetworkPalette
                  onPick={handlePick}
                  onPickSystem={handlePickTransmissionSystem}
                  placedIds={placedIds}
                  armedId={Array.isArray(pendingAsset) ? pendingAsset.map((asset) => asset.id) : pendingAsset?.id}
                  armedSystemId={pendingSystem?.id}
                />
              </div>
            ) : (
              <WorkspaceRecordSidebar
                recordLabel="Network"
                newTitle="New Network"
                activeId={network.id}
                api={networkSidebarApi}
                savedEvent={NETWORK_SAVED_EVENT}
                getMeta={(n) => `${n.nodeCount} nodes · ${n.edgeCount} pipes`}
                onNew={handleNew}
                onSelect={(id) => void ws.openNetwork(id)}
              />
            )}
          </div>
        </aside>
      )}

      <div className="nb-workspace">

        {readOnly && readOnlyNotice && <div className="nb-readonly-notice">{readOnlyNotice}</div>}

        <div
          ref={canvasWrapRef}
          className={`nb-canvas-wrap ${showGrid ? "nb-canvas-wrap--grid" : ""}`}
          onDragOver={handleLibraryDragOver}
          onDrop={handleLibraryDrop}
        >
          <div ref={containerRef} className="nb-canvas" />

          <AnnotationOverlays api={annotations} readOnly={readOnly} />

          {!isBuilder && sim.active && (
            <NodeInsightPopover insight={sim.insight} anchor={sim.insightAnchor} onClose={sim.closeInsight} />
          )}

          {mode === BOTTLENECK_MODE && sim.active && (
            <BottleneckPanel items={sim.bottlenecks} onFocus={focusCanvasElement} onClose={() => setModeSafe("select")} />
          )}

          {geoPanelOpen && geoPanelData && (
            <GeoAnchorPanel
              node={geoPanelData.node}
              status={geoPanelData.status}
              anchorCount={geoPanelData.anchorCount}
              onSet={setGeoAnchor}
              onClear={clearGeoAnchor}
              onClose={() => setGeoPanelOpen(false)}
            />
          )}

          {traceInfos.length > 0 && (
            <TracePanel
              infos={traceInfos}
              mode={traceMode}
              onFocus={focusCanvasElement}
              onRemove={(rootId) => applyTraceRoots(traceRootsRef.current.filter((id) => id !== rootId))}
              onClear={() => clearTraceCanvas("Cleared trace.")}
              onExport={(infos, format) => exportTraces(infos, format, infos.length === 1 ? `trace_${infos[0].rootName}` : "traceability")}
            />
          )}

          {drawRoute.preview && (
            <svg className="nb-edge-overlay nb-route-preview" aria-hidden="true">
              <polyline points={drawRoute.preview.path.map((p) => `${p.x},${p.y}`).join(" ")} />
              {drawRoute.preview.points.map((p, i) =>
                p.kind === "bend" ? (
                  <rect key={i} x={p.x - 4} y={p.y - 4} width="8" height="8" className="nb-route-preview__bend" />
                ) : (
                  <circle key={i} cx={p.x} cy={p.y} r="6" className="nb-route-preview__junction" />
                )
              )}
            </svg>
          )}

          {/* Midpoint dots on the hovered pipe. Dragging an existing bend is
              still the edge-editing plugin's job; these only add new ones. */}
          {edgeOverlay.handles.length > 0 && (
            <svg className="nb-edge-overlay" aria-hidden="true">
              {edgeOverlay.handles.map((handle) => (
                <g
                  key={handle.key}
                  className="nb-edge-ghost-handle"
                  transform={`translate(${handle.x} ${handle.y})`}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    addBendAtModelPoint(edgeOverlay.edgeId, handle.model, { minOffset: 0 });
                  }}
                >
                  <circle r="9" fill="transparent" />
                  <circle className="nb-edge-ghost-handle-dot" r="4" />
                </g>
              ))}
            </svg>
          )}

          <div className="nb-canvas-controls" role="toolbar" aria-label="Canvas view">
            <button
              type="button"
              className={`nb-canvas-ctl${shortcutsOpen ? " is-active" : ""}`}
              onClick={() => setShortcutsOpen((v) => !v)}
              aria-expanded={shortcutsOpen}
              aria-controls="nb-shortcut-guide"
              aria-label="Keyboard shortcuts"
              title="Keyboard shortcuts (?)"
            >
              <Keyboard size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`nb-canvas-ctl${canvasFocusMode ? " is-active" : ""}`}
              onClick={handleToggleCanvasFocus}
              aria-label={canvasFocusMode ? "Exit full screen" : "Full screen: hide the sidebars and collapse the toolbar"}
              aria-pressed={canvasFocusMode}
              title={canvasFocusMode ? "Exit full screen (Ctrl+Shift+F)" : "Full screen: hide the sidebars and collapse the toolbar (Ctrl+Shift+F)"}
            >
              {canvasFocusMode ? <Minimize2 size={15} aria-hidden="true" /> : <Maximize2 size={15} aria-hidden="true" />}
            </button>
            <button
              type="button"
              className={`nb-canvas-ctl${showMinimap ? " is-active" : ""}`}
              onClick={() => setShowMinimap((v) => !v)}
              aria-label={showMinimap ? "Hide minimap" : "Show minimap"}
              aria-pressed={showMinimap}
              title={showMinimap ? "Hide minimap" : "Show minimap"}
            >
              <MapIcon size={15} aria-hidden="true" />
            </button>
          </div>

          {cyReady && (
            <CanvasMinimap cyRef={cyRef} visible={showMinimap} onToggle={() => setShowMinimap(false)} />
          )}

          {viewMode === "table" && (
            <div className="nb-table-overlay">
              <CanvasTableView
                cyRef={cyRef}
                version={`${counts.nodes}:${counts.edges}:${histTick}:${tableTick}`}
                readOnly={readOnly}
                networkName={network.name}
                onEditAsset={handleTableEditAsset}
                onEditPipe={handleTableEditPipe}
                onFocus={(id) => {
                  setViewMode("schematic");
                  setTimeout(() => focusCanvasElement(id), 0);
                }}
              />
            </div>
          )}

          {viewMode === "map" && (
            <div className="nb-map-overlay">
              <NetworkCanvasMapView
                nodes={geoView?.nodes || []}
                edges={geoView?.edges || []}
                status={geoView?.status || transformStatus([])}
                onMoveNode={handleMapMoveNode}
                onCreateRoute={handleMapCreateRoute}
              />
            </div>
          )}

          {/* Collapsible reference, pinned to the canvas: it stays open while
              you keep working, so the shortcut you just read is usable. */}
          {shortcutsOpen && (
            <aside className="nb-shortcut-guide" id="nb-shortcut-guide" aria-label="Keyboard shortcuts">
              <header className="nb-shortcut-guide__head">
                <span className="nb-shortcut-guide__title">Keyboard shortcuts</span>
                <button
                  type="button"
                  className="nb-shortcut-guide__close"
                  onClick={() => setShortcutsOpen(false)}
                  aria-label="Collapse shortcut guide"
                  title="Collapse (Esc)"
                >
                  ×
                </button>
              </header>

              <div className="nb-shortcut-guide__body">
                {SHORTCUT_GROUPS.map((group) => (
                  <section key={group.title}>
                    <div className="nb-shortcut-group-title">{group.title}</div>
                    {group.rows.map((row) => (
                      <div className="nb-shortcut-row" key={row.keys}>
                        <kbd className="nb-shortcut-keys">{row.keys}</kbd>
                        <span className="nb-shortcut-desc">{row.desc}</span>
                      </div>
                    ))}
                  </section>
                ))}
              </div>
            </aside>
          )}

          {boxSelect && boxSelect.w > 2 && boxSelect.h > 2 && (
            <div
              className="nb-box-select-rect"
              style={{ left: boxSelect.x, top: boxSelect.y, width: boxSelect.w, height: boxSelect.h }}
            />
          )}

          {mode === "area-zoom" && (
            <div
              className="nb-area-capture"
              onMouseDown={areaDown}
              onMouseMove={(e) => {
                areaMove(e);
                // stash current box on the ref for mouseup
                if (areaRef.current) {
                  const rect = containerRef.current.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const y = e.clientY - rect.top;
                  const { x0, y0 } = areaRef.current;
                  areaRef.current.cur = { x: Math.min(x0, x), y: Math.min(y0, y), w: Math.abs(x - x0), h: Math.abs(y - y0) };
                }
              }}
              onMouseUp={areaUp}
              onMouseLeave={areaUp}
            >
              {areaBox && (
                <div
                  className="nb-area-rect"
                  style={{ left: areaBox.x, top: areaBox.y, width: areaBox.w, height: areaBox.h }}
                />
              )}
            </div>
          )}

          {bannerText && (
            <div className={`nb-mode-banner nb-mode-banner--${mode}`}>
              <span>{bannerText}</span>
              <button className="nb-mode-banner__cancel" onClick={() => setModeSafe("select")}>
                <span aria-hidden="true">×</span> Cancel
              </button>
            </div>
          )}

          {findOpen && (
            <div className="nb-find">
              <input
                autoFocus
                type="search"
                placeholder="Find by name, ID, type, region…"
                value={findQuery}
                onChange={(e) => {
                  setFindQuery(e.target.value);
                  runFind(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Escape") { setFindOpen(false); setFindQuery(""); }
                }}
              />
              <button onClick={() => { setFindOpen(false); setFindQuery(""); }} aria-label="Close find">×</button>
            </div>
          )}

          {realNodeCount === 0 && (
            <div className="nb-canvas__empty">
              <h3>Build a network</h3>
              <p>Insert assets from the toolbar or pick from the library, then connect them with pipes.</p>
            </div>
          )}
          {toast && <div className="nb-toast">{toast}</div>}
        </div>

        {!isBuilder && (
          <SimulationRunBar sim={sim} plan={plan} showLegend={showRunLegend} onToggleLegend={() => setShowRunLegend((v) => !v)} />
        )}

        {/* Bottom validation dock (SWIIMS showBottomDock). Each row focuses
            its own element — SWIIMS's dock always jumped to the first issue. */}
        {validationDockOpen && (
          <section className="nb-validation-dock" aria-label="Validation issues">
            <header className="nb-validation-dock__head">
              <strong>Validation</strong>
              <span className="cr-count">{validationIssues.filter((i) => i.severity !== "success").length} issue(s)</span>
              <span className="cr-spacer" />
              <button type="button" className="cr-btn cr-btn--sm" onClick={handleValidateNetwork}>Re-validate</button>
              <button type="button" className="cr-btn cr-btn--sm cr-btn--icon" onClick={() => setValidationDockOpen(false)} aria-label="Close validation dock">×</button>
            </header>
            <div className="nb-validation-dock__body">
              <table className="cr-table">
                <thead>
                  <tr><th>Severity</th><th>Issue</th><th>Detail</th></tr>
                </thead>
                <tbody>
                  {validationIssues.map((issue) => (
                    <tr
                      key={issue.id}
                      className={issue.elementId ? "is-clickable" : undefined}
                      onClick={() => issue.elementId && focusCanvasElement(issue.elementId)}
                    >
                      <td>
                        <span className={`cr-pill cr-pill--${issue.severity === "error" ? "err" : issue.severity === "warning" ? "warn" : issue.severity === "success" ? "ok" : "acc"}`}>
                          {issue.severity}
                        </span>
                      </td>
                      <td className="cr-td--strong">{issue.title}</td>
                      <td className="cr-td--muted">{issue.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>

      {inspectorVisible && (
        <aside
          className="nb-inspector"
          style={{ width: rightPanelSize.width }}
          onMouseDown={() => {
            // Working in the right panel ends a drawing / placement tool, as in
            // SWIIMS; Trace and Bottlenecks stay on because their results live here.
            if (!["select", "trace", "bottlenecks"].includes(modeRef.current)) setModeSafe("select");
          }}
        >
          <div {...rightPanelSize.handleProps} />
          <div className="ns2-right-panel">
            <div className="ns2-panel-tabs">
              <button
                className={`ns2-panel-tab${rightPanelTab === "details" ? " ns2-panel-tab--active" : ""}`}
                onClick={() => setRightPanelTab("details")}
              >
                Details
              </button>
              <button
                className={`ns2-panel-tab${rightPanelTab === "issues" ? " ns2-panel-tab--active" : ""}${validationIssues.length ? " ns2-panel-tab--has-data" : ""}`}
                onClick={() => { setIssuePanelMode("issues"); setRightPanelTab("issues"); }}
                title={issueBadgeText ? `Errors / warnings: ${issueBadgeText}` : "Advisory network validation"}
              >
                Validation
              </button>
              <button
                className={`ns2-panel-tab${rightPanelTab === "isolation" ? " ns2-panel-tab--active" : ""}`}
                onClick={() => setRightPanelTab("isolation")}
              >
                Isolation
              </button>
              {!isBuilder && (
                <button
                  className={`ns2-panel-tab${rightPanelTab === "run" ? " ns2-panel-tab--active" : ""}${sim.active ? " ns2-panel-tab--has-data" : ""}`}
                  onClick={() => setRightPanelTab("run")}
                >
                  Results
                </button>
              )}
            </div>

            {rightPanelTab === "run" && !isBuilder && (
              <div className="ns2-panel-body nb-run-details">
                {plan && sim.active ? (
                  <CanvasDetails
                    plan={plan}
                    dayIdx={sim.dayIdx}
                    selectedId={sim.selection.id}
                    selectedKind={sim.selection.kind}
                    traceInfo={traceInfo}
                    onFocus={focusCanvasElement}
                  />
                ) : (
                  <div className="ns2-panel-hint">Run the simulation to see per-day results for the selected element.</div>
                )}
              </div>
            )}

            {rightPanelTab === "details" && (
              <div className="ns2-panel-body ns2-panel-body--details">
                {/* Nothing selected: what the canvas symbols mean. Something
                    selected: its summary, with Edit / Zoom to / Delete. */}
                {selectedEl || selectedCount > 1 ? (
                  <SelectionInspector
                    selected={selectedEl}
                    selectedCount={selectedCount}
                    selectedEdgeCount={selectedEdgeCount}
                    systems={transmissionSystems}
                    lines={transmissionLinesForCanvas}
                    readOnly={readOnly}
                    onEdit={handleEditSelected}
                    onZoom={selectedEl ? () => focusCanvasElement(selectedEl.id) : handleZoomToSelection}
                    onDelete={handleDelete}
                  />
                ) : (
                  <CanvasLegend />
                )}
              </div>
            )}

            {rightPanelTab === "issues" && (
              <div className="ns2-panel-body ns2-panel-body--issues">
                <ValidationPanel
                  issues={validationIssues}
                  counts={issueCounts}
                  onValidate={handleValidateNetwork}
                  onFocus={focusCanvasElement}
                />
              </div>
            )}

            {rightPanelTab === "isolation" && (
              <div className="ns2-panel-body ns2-panel-body--issues">
                <IsolationPanel
                  groups={filteredIsolationGroups}
                  query={isolationQuery}
                  onQueryChange={setIsolationQuery}
                  active={isolationActive}
                  activeLabel={activeIsolationLabel}
                  activeKey={activeIsolationKey}
                  onIsolate={isolatePipeIds}
                  onClear={() => clearIsolation()}
                />
              </div>
            )}
          </div>
        </aside>
      )}

      {insertModal.open && (
        <div className="ns2-modal-overlay" onMouseDown={closeInsertModal}>
          <div className="ns2-modal ns2-modal--sm" onMouseDown={(e) => e.stopPropagation()}>
            <div className="ns2-modal-header">
              <h2>Insert Entity on Pipe</h2>
              <button type="button" className="ns2-modal-close" onClick={closeInsertModal} aria-label="Close">×</button>
            </div>
            <div className="ns2-insert-grid">
              {ENTITY_TYPES_LIST.map((entityType) => {
                const Icon = ENTITY_ICONS[entityType.type] || EmptyIcon;
                return (
                  <button
                    key={entityType.type}
                    type="button"
                    className="ns2-insert-card"
                    onClick={() => handleInsertTypeChoice(entityType.type)}
                  >
                    <span
                      className="ns2-entity-badge"
                      style={{ backgroundColor: ENTITY_TYPE_COLORS[entityType.type] }}
                    >
                      <Icon size={16} />
                    </span>
                    <span className="ns2-insert-card__copy">
                      <strong>{entityType.label}</strong>
                      <small>{entityType.description}</small>
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="ns2-modal-footer">
              <button type="button" className="ns2-btn" onClick={handleInsertFromLibrary}>
                <IconFolder size={13} /> Select From Asset Library
              </button>
              <button type="button" className="ns2-btn" onClick={closeInsertModal}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {kmzReview && (
        <KmzReviewModal
          fileName={kmzReview.fileName}
          pointCount={kmzReview.imported.points.length}
          lineCount={kmzReview.imported.lines.length}
          rows={kmzReview.rows}
          onCancel={() => setKmzReview(null)}
          onConfirm={(rows) => {
            const { imported, fileName } = kmzReview;
            setKmzReview(null);
            placeGeoImport({ ...imported, points: applyKmzOverrides(imported.points, rows) }, fileName);
          }}
        />
      )}

      {capacityPrompt && (
        <CapacityRequiredModal
          items={capacityPrompt}
          onSkip={() => setCapacityPrompt(null)}
          onSubmit={(values) => {
            const cy = cyRef.current;
            if (cy) {
              Object.entries(values).forEach(([id, capacity]) => {
                const el = cy.getElementById(id);
                if (!el.length) return;
                const meta = { ...(el.data("meta") || {}) };
                el.data("meta", { ...meta, specifications: { ...(meta.specifications || {}), design_capacity: capacity } });
              });
              scheduleCommit();
            }
            setCapacityPrompt(null);
          }}
        />
      )}

      {groupLinesOpen && (
        <GroupLinesModal
          pipeCount={selectedEdgeCount}
          systems={transmissionSystems}
          lines={transmissionLines}
          onCancel={() => setGroupLinesOpen(false)}
          onSubmit={submitGroupLines}
        />
      )}

      {canvasEntityModal && (
        <CanvasEntityModal
          key={canvasEntityModal.targetId || `new-${canvasEntityModal.type}-${canvasEntityModal.position?.x}-${canvasEntityModal.position?.y}`}
          type={canvasEntityModal.type}
          mode={canvasEntityModal.mode}
          data={canvasEntityModal.targetId ? cyRef.current?.getElementById(canvasEntityModal.targetId).data() : null}
          onCancel={() => {
            if (canvasEntityModal.insertOnEdge) clearInsertTarget();
            setCanvasEntityModal(null);
          }}
          onSubmit={submitCanvasEntity}
        />
      )}

      {entityModal.open && (
        <NetworkEntityCreateModal
          key={entityModal.editId || `new-${entityModal.type}-${entityModal.position?.x}-${entityModal.position?.y}`}
          type={entityModal.type}
          mode={entityModal.mode}
          initialForm={entityModal.form}
          onCancel={closeEntityModal}
          onCreated={handleEntityCreated}
        />
      )}

      {pipeModal.open && (
        <PipeVariablesModal
          key={pipeModal.editId || `${pipeModal.source}-${pipeModal.target}`}
          mode={pipeModal.editId ? "edit" : "create"}
          initial={pipeModal.initial}
          routeSegments={pipeModal.route ? routeToLegs(pipeModal.route.points).length : 0}
          systems={transmissionSystems}
          lines={transmissionLinesForCanvas}
          onCancel={() => setPipeModal({ open: false, source: null, target: null })}
          onSubmit={submitPipe}
        />
      )}
    </div>
  );
}
