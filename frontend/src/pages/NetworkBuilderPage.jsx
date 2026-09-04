import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import WorkspaceTabs from "../workspace/components/WorkspaceTabs";
import WorkspaceTabsBoundary from "../workspace/components/WorkspaceTabsBoundary";
import { workspaceController } from "../workspace/services/workspaceControllerInstance";
import { useWorkspaceStore, workspaceStore } from "../workspace/store/workspaceStore";
import { canvasController } from "../canvas/controller/CanvasController";
import {
  snapshotElements,
  stripTransientClasses,
} from "../canvas/controller/canvasSnapshotSerializer";
import { useInspectorStore, inspectorStore } from "../inspector/store/inspectorStore";
import { useIssuesStore, issuesStore } from "../issues/store/issuesStore";
import { selectionStore } from "../selection/store/selectionStore";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import cytoscape from "cytoscape";
import Konva from "konva";
import contextMenus from "cytoscape-context-menus";
import edgeEditing from "cytoscape-edge-editing";
import "cytoscape-context-menus/cytoscape-context-menus.css";
import {
  EmptyIcon,
  IconActive,
  IconAlertTriangle,
  IconAlignCenter,
  IconAlignJustify,
  IconAlignLeft,
  IconAlignRight,
  IconArrowDown,
  IconArrowUp,
  IconBold,
  IconBriefcase,
  IconCheckSquare,
  IconChevronLeft,
  IconChevronRight,
  IconClipboard,
  IconCopy,
  IconCrosshair,
  IconDistributionNetwork,
  IconDownload,
  IconDroplet,
  IconEdit2,
  IconEye,
  IconEyeOff,
  IconFileText,
  IconFolder,
  IconGitBranch,
  IconHelpCircle,
  IconGrid,
  IconItalic,
  IconMaximize,
  IconMaximize2,
  IconMinimize2,
  IconMinus,
  IconPipe,
  IconPipelineNetwork,
  IconPlant,
  IconPlay,
  IconPlusCircle,
  IconRefresh,
  IconRotateCcw,
  IconRotateCw,
  IconSave,
  IconSearch,
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
import { ENTITY_TYPE_COLORS, ENTITY_TYPE_LABELS } from "../cytoscape/buildCyStyle";
import { applyEntitySymbol } from "../cytoscape/entitySymbol";
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
} from "../cytoscape/bendEditing";
import { applyIsolation, clearIsolation as clearIsolationClasses, isIsolated } from "../cytoscape/isolate";
import { normalizeBox, selectInBox } from "../cytoscape/boxSelect";
import {
  ASSET_CATEGORIES,
  FILTER_HIDDEN_CLASS,
  PIPELINE_KEY,
  applyCategoryFilter,
  canvasAssets as readCanvasAssets,
  capacityByYear,
  capacityOf,
  formatCapacity,
  horizonYears,
  largestByCapacity,
  nameOf,
  summarizeCategories,
} from "../cytoscape/assetFilter";
import { fetchNetworks, saveNetwork, updateNetwork, deleteNetwork } from "../api/networks";
import {
  fetchTransmissionSystems, createTransmissionSystem,
  fetchTransmissionLines, createTransmissionLine, fetchTransmissionSystemNetwork,
} from "../api/metrics";
import { lineDisplayName, lineSystemId } from "../lib/transmissionLines";
import NetworkPalette from "../components/NetworkPalette";
import NetworkNodeDetails from "../components/NetworkNodeDetails";
import WorkspaceRecordSidebar from "../components/WorkspaceRecordSidebar";
import WorkspaceHeader, { WorkspaceHeaderChip } from "../components/WorkspaceHeader";
import NetworkEntityCreateModal from "../components/NetworkEntityCreateModal";
import PipeVariablesModal from "../components/PipeVariablesModal";
import "./NetworkBuilderPage.css";

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

const rid = (p) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const INSERT_TOOL_LABELS = {
  plant: "Plant",
  handover_point: "Handover Point / City Gate",
  tank: "Tank",
  node: "Node",
  pump: "Pump Station",
};
const INSERT_ENTITY_BUTTONS = [
  { type: "plant", implemented: true },
  { type: "tank", implemented: true },
  { type: "handover_point", implemented: true },
  { type: "node", implemented: true },
  { type: "pump", implemented: true },
];
const INSERT_ASSET_ENTITY_TYPES = new Set(INSERT_ENTITY_BUTTONS
  .filter(({ type }) => type !== "node")
  .map(({ type }) => type));
const ENTITY_TYPES_LIST = [
  { type: "plant", label: "Plant", description: "Production asset" },
  { type: "pump", label: "Pump Station", description: "Pumping asset" },
  { type: "tank", label: "Tank", description: "Storage asset" },
  { type: "handover_point", label: "Handover Point", description: "City gate / HP" },
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

const formatTraceFlow = (flow, hasFlow) => {
  if (!hasFlow) return "flow n/a";
  const value = Number(flow || 0);
  if (Math.abs(value) >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (Math.abs(value) >= 10) return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return value.toLocaleString(undefined, { maximumFractionDigits: 3 });
};

const halveLengthValue = (value) => {
  if (value === "" || value == null) return value;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric / 2 : value;
};

const withHalvedPipeLength = (data) => {
  const next = cloneData(data);
  const specs = next.meta?.specifications;
  if (specs && Object.prototype.hasOwnProperty.call(specs, "pipelineLength")) {
    specs.pipelineLength = halveLengthValue(specs.pipelineLength);
  }
  if (specs && Object.prototype.hasOwnProperty.call(specs, "length_km")) {
    specs.length_km = halveLengthValue(specs.length_km);
  }
  return next;
};

// Snapshot the asset fields we keep with a placed element so the graph renders
// offline even if the source asset later changes.
const assetMeta = (a) => ({
  region: a.region,
  // Lifecycle dates drive the capacity-by-horizon chart in the right panel.
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

const toolbarEntityLabel = (type) => INSERT_TOOL_LABELS[type] || ENTITY_TYPE_LABELS[type] || type;
const pipeIdsForLine = (line) => (line?.pipes || []).map((pipe) => pipe.id);
const pipeIdsForSystem = (system) => [
  ...(system?.pipes || []).map((pipe) => pipe.id),
  ...(system?.lines || []).flatMap((line) => pipeIdsForLine(line)),
];
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

export default function NetworkBuilderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { setToolbar, setSidebar } = useLayout();

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
  const areaRef = useRef(null);
  const traceRunRef = useRef(null);
  const snapToGridRef = useRef(false);
  const grabbedNodeRef = useRef(null); // the node actually under the cursor
  const hoveredEdgeRef = useRef(null);
  const overlayFrameRef = useRef(null);

  const [cyReady, setCyReady] = useState(false);
  const [mode, setMode] = useState("select");
  const [pendingAsset, setPendingAsset] = useState(null);
  const [pendingSystem, setPendingSystem] = useState(null);
  const [pendingEntity, setPendingEntity] = useState(null);
  const [lineSource, setLineSource] = useState(null);
  const [selectedEl, setSelectedEl] = useState(null);
  const [hasSelection, setHasSelection] = useState(false);
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
    () => ({
      id: activeWorkspace?.document.networkId ?? null,
      name: activeWorkspace?.document.name ?? "",
      description: activeWorkspace?.document.description ?? "",
    }),
    [activeWorkspace]
  );
  const [saveStatus, setSaveStatus] = useState("idle");
  const [showLibrary, setShowLibrary] = useState(true);
  const [toast, setToast] = useState(null);
  const [pipeModal, setPipeModal] = useState({ open: false, source: null, target: null });
  const [insertModal, setInsertModal] = useState({ open: false });
  const [transmissionSystems, setTransmissionSystems] = useState([]);
  const [transmissionLines, setTransmissionLines] = useState([]);
  const [entityModal, setEntityModal] = useState({ open: false, type: null, position: null, mode: null, form: null, editId: null });
  const [showLabels, setShowLabels] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [snapToGrid, setSnapToGrid] = useState(false);
  // Midpoint dots on the hovered pipe; clicking one drops a bend there.
  const [edgeOverlay, setEdgeOverlay] = useState({ edgeId: null, handles: [] });
  const showInspector = useInspectorStore((state) => state.open);
  const setShowInspector = useCallback((next) => {
    const open = typeof next === "function" ? next(inspectorStore.getState().open) : next;
    if (open) inspectorStore.getState().openInspector();
    else inspectorStore.getState().closeInspector();
  }, []);
  const [canvasFocusMode, setCanvasFocusMode] = useState(false);
  const [isolationActive, setIsolationActive] = useState(false);
  const rightPanelTab = useInspectorStore((state) => state.activeTab);
  // Selecting a tab always opens the panel: every existing call site set both.
  const setRightPanelTab = useCallback(
    (tab) => inspectorStore.getState().openInspector(tab),
    []
  );
  const issuePanelMode = useIssuesStore((state) => state.mode);
  const setIssuePanelMode = useCallback(
    (mode) => issuesStore.getState().setMode(mode),
    []
  );
  const [validationIssues, setValidationIssues] = useState([]);
  const [panelFindQuery, setPanelFindQuery] = useState("");
  const [isolationQuery, setIsolationQuery] = useState("");
  const [activeIsolationLabel, setActiveIsolationLabel] = useState("");
  const [activeIsolationKey, setActiveIsolationKey] = useState("");
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [areaBox, setAreaBox] = useState(null); // {x,y,w,h} while area-zoom dragging
  const [boxSelect, setBoxSelect] = useState(null); // {x,y,w,h} while right-drag selecting
  const [hiddenAssetTypes, setHiddenAssetTypes] = useState(() => new Set());
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [horizon, setHorizon] = useState(() => {
    const thisYear = new Date().getFullYear();
    return { start: thisYear, end: thisYear + 10 };
  });
  // Bumped whenever element data changes, so the sidebar re-reads the graph.
  const [assetPanelVersion, setAssetPanelVersion] = useState(0);
  const [traceInfo, setTraceInfo] = useState(null);
  const [traceMode, setTraceMode] = useState("reachable");
  const [, setHistTick] = useState(0); // forces undo/redo enable refresh

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

  const visibleAssetCategories = useMemo(
    () => ASSET_CATEGORIES.filter((c) => assetSummary[c.key] && !hiddenAssetTypes.has(c.key)),
    [assetSummary, hiddenAssetTypes]
  );

  const chartYears = useMemo(() => horizonYears(horizon.start, horizon.end), [horizon.start, horizon.end]);

  const capacityChartRows = useMemo(() => {
    const visible = canvasAssetList.filter((asset) => !hiddenAssetTypes.has(asset.category));
    return capacityByYear(visible, chartYears);
  }, [canvasAssetList, hiddenAssetTypes, chartYears]);

  const largestAssets = useMemo(
    () => largestByCapacity(canvasAssetList, { hidden: hiddenAssetTypes, limit: 10 }),
    [canvasAssetList, hiddenAssetTypes]
  );

  const categoryColour = useCallback(
    (key) => (key === PIPELINE_KEY ? "#5b7ca3" : ENTITY_TYPE_COLORS[key] || "#94a3b8"),
    []
  );


  const toggleAssetType = useCallback((key) => {
    setHiddenAssetTypes((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const showAllAssetTypes = useCallback(() => setHiddenAssetTypes(new Set()), []);

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
    setSelectedEdgeCount(sel.filter((el) => el.isEdge()).length);
    setSelectedDeletableCount(
      sel.filter((el) => el.isEdge() || (el.isNode() && !ANNOTATION_TYPES.includes(el.data("type")))).length
    );
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
  }, []);

  const scheduleCommit = useCallback(() => {
    // A workspace restore replays the whole graph through add/remove; without
    // this guard the incoming workspace would arrive dirty with a history
    // entry already committed.
    if (restoringRef.current || canvasController.isRestoring()) return;
    // Document mutations funnel through here, which makes this the single
    // hook point for dirty tracking and debounced recovery writes.
    workspaceController.notifyDocumentMutated();
    if (commitPendingRef.current) return;
    commitPendingRef.current = true;
    setTimeout(() => {
      commitPendingRef.current = false;
      commitHistory();
    }, 0);
  }, [commitHistory]);

  const resetHistory = useCallback(() => {
    const cy = cyRef.current;
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

  const splitPipeWithNode = useCallback(
    (node) => {
      const cy = cyRef.current;
      const edgeId = insertEdgeRef.current;
      if (!cy || !node || !edgeId) return false;
      const edge = cy.getElementById(edgeId);
      if (!edge.length) {
        clearInsertTarget();
        return false;
      }

      const base = withHalvedPipeLength(edge.data());
      cy.batch(() => {
        edge.remove();
        cy.add({ group: "edges", data: { ...cloneData(base), id: rid("e"), source: base.source, target: node.id() } });
        cy.add({ group: "edges", data: { ...cloneData(base), id: rid("e"), source: node.id(), target: base.target } });
      });
      cy.$(":selected").unselect();
      node.select();
      clearInsertTarget();
      syncSelection();
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

  const clearTraceCanvas = useCallback((message) => {
    const cy = cyRef.current;
    if (cy) clearTraceClasses(cy);
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
      setShowInspector(true);
      setRightPanelTab("trace");
      if (requestedMode === "delivered" && !trace.hasFlow) {
        setToast("No flow results are attached to these pipes yet, so Trace is showing reachable topology.");
      }
    },
    [traceMode]
  );

  traceRunRef.current = runTrace;

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
    const cy = canvasController.initialize(containerRef.current);
    cyRef.current = cy;

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
        if (INSERT_ASSET_ENTITY_TYPES.has(type)) {
          pendingEntityRef.current = null;
          setPendingEntity(null);
          setEntityModal({
            open: true,
            type,
            position: { x: evt.position.x, y: evt.position.y },
            mode: "create",
            form: emptyEntityForm(type),
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
        if (!TRACE_ROOT_TYPES.has(type)) {
          setToast("Trace starts from a handover point or delivery node.");
          return;
        }
        traceRunRef.current?.(node);
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
      anchorColor: "#1a4a8a",
      endPointColor: "#1a4a8a",
      enableCreateAnchorOnDrag: false,
    });

    cy.contextMenus({
      evtType: "cxttap",
      menuItems: [
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
      canvasController.destroy();
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
    if (!cyReady || sessionStartedRef.current) return;
    sessionStartedRef.current = true;
    void workspaceController.recoverSession(id ?? null);
    // `id` is deliberately not a dependency: re-running on navigation is what
    // made document loading an effect's responsibility in the first place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cyReady]);

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
      setShowInspector(true);
      setRightPanelTab("trace");
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
      const insertMode = pendingPlacementRef.current?._insertMode === true;
      const added = placeAssetsAt(insertMode ? assets.slice(0, 1) : assets, position);
      if (insertMode && added?.[0]) splitPipeWithNode(added[0]);
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
      setEntityModal({
        open: true,
        mode: "insert-on-edge",
        form: emptyEntityForm(entityType),
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

  // ── Inspector edits ────────────────────────────────────────────────────────
  const handleLabelChange = useCallback(
    (value) => {
      const cy = cyRef.current;
      if (!cy || !selectedEl) return;
      const el = cy.getElementById(selectedEl.id);
      if (!el.isEdge()) return;
      el.data("label", value);
      el.data("displayLabel", value);
      syncSelection();
    },
    [selectedEl, syncSelection]
  );

  const handleSpecChange = useCallback(
    (field, value) => {
      const cy = cyRef.current;
      if (!cy || !selectedEl) return;
      const el = cy.getElementById(selectedEl.id);
      if (!el.isEdge()) return;
      const meta = { ...(el.data("meta") || {}) };
      const specs = { ...(meta.specifications || {}) };
      if (value === "" || value == null) delete specs[field];
      else specs[field] = STRING_SPEC_FIELDS.has(field) ? value : Number(value);
      meta.specifications = specs;
      el.data("meta", meta);
      syncSelection();
    },
    [selectedEl, syncSelection]
  );

  // Boolean spec fields (e.g. pipe `bidirectional`) always store an explicit
  // true/false — never deleted, unlike handleSpecChange's delete-on-empty.
  const handleSpecBooleanChange = useCallback(
    (field, checked) => {
      const cy = cyRef.current;
      if (!cy || !selectedEl) return;
      const el = cy.getElementById(selectedEl.id);
      if (!el.isEdge()) return;
      const meta = { ...(el.data("meta") || {}) };
      const specs = { ...(meta.specifications || {}), [field]: !!checked };
      meta.specifications = specs;
      el.data("meta", meta);
      syncSelection();
    },
    [selectedEl, syncSelection]
  );

  // Array spec fields (e.g. pipe `lineGroupIds` checkbox list) replace the
  // whole array; an empty selection deletes the key.
  const handleSpecArrayChange = useCallback(
    (field, values) => {
      const cy = cyRef.current;
      if (!cy || !selectedEl) return;
      const el = cy.getElementById(selectedEl.id);
      if (!el.isEdge()) return;
      const meta = { ...(el.data("meta") || {}) };
      const specs = { ...(meta.specifications || {}) };
      if (!values.length) delete specs[field];
      else specs[field] = values;
      meta.specifications = specs;
      el.data("meta", meta);
      syncSelection();
    },
    [selectedEl, syncSelection]
  );

  const handleNodeSpecChange = useCallback(
    (field, value) => {
      const cy = cyRef.current;
      if (!cy || !selectedEl) return;
      const el = cy.getElementById(selectedEl.id);
      if (!el.isNode()) return;
      const meta = { ...(el.data("meta") || {}) };
      const specs = { ...(meta.specifications || {}) };
      if (value === "" || value == null) delete specs[field];
      else specs[field] = value;
      meta.specifications = specs;
      el.data("meta", meta);
      syncSelection();
    },
    [selectedEl, syncSelection]
  );

  // Generic top-level edge field setter (e.g. pipe commissioningDate/
  // decommissioningDate).
  const handleEdgeFieldChange = useCallback(
    (field, value) => {
      const cy = cyRef.current;
      if (!cy || !selectedEl) return;
      const el = cy.getElementById(selectedEl.id);
      if (!el.isEdge()) return;
      el.data(field, value);
      syncSelection();
    },
    [selectedEl, syncSelection]
  );

  // Pipe's Active toggle: sets the top-level `active` flag and derives the
  // `status` used for the canvas status color band, mirroring how
  // createPipeEdge derives status from active at creation time.
  const handleEdgeActiveChange = useCallback(
    (checked) => {
      const cy = cyRef.current;
      if (!cy || !selectedEl) return;
      const el = cy.getElementById(selectedEl.id);
      if (!el.isEdge()) return;
      el.data("active", checked);
      el.data("status", checked ? "operational" : "inactive");
      syncSelection();
    },
    [selectedEl, syncSelection]
  );

  const handleDelete = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const sel = cy.$(":selected").filter((el) => el.isEdge() || (el.isNode() && !ANNOTATION_TYPES.includes(el.data("type"))));
    if (!sel.length) {
      setToast("Select a pipe or asset node to delete.");
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
  const submitPipe = useCallback(
    async (form) => {
      let systemId = form.transmissionSystemId || null;
      let lineIds = Array.isArray(form.lineGroupIds) ? form.lineGroupIds.filter(Boolean).slice(0, 1) : [];

      if (form.newTransmissionSystemName.trim()) {
        const created = await createTransmissionSystem({ name: form.newTransmissionSystemName.trim() });
        setTransmissionSystems((s) => [...s, created]);
        systemId = created.id;
      }
      const lineName = form.isBranch
        ? form.newLineName.trim() || form.branchName.trim()
        : form.newLineName.trim();
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

      createPipeEdge({
        source: pipeModal.source,
        target: pipeModal.target,
        label: form.name,
        active: form.active,
        commissioningDate: form.commissioningDate,
        decommissioningDate: form.decommissioningDate,
        specs,
      });
      setPipeModal({ open: false, source: null, target: null });
    },
    [pipeModal, createPipeEdge]
  );

  const handleCreateLineForInspector = useCallback(async (payload) => {
    const created = await createTransmissionLine(payload);
    const line = { ...created, systemId: created.systemId || payload.systemId || "" };
    setTransmissionLines((lines) => [...lines, line]);
    return line;
  }, []);

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
    workspaceController.registerInteraction({
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
    workspaceController.registerHistory({ reset: () => resetHistory() });
    return () => workspaceController.detach();
  }, [setModeSafe, resetHistory]);

  // Re-registered whenever a toggle changes so capture() always reads current
  // values; registration is a field assignment, so this is cheap.
  useEffect(() => {
    workspaceController.registerViewBridge({
      capture: () => ({
        showLabels,
        showGrid,
        snapToGrid,
        showLibrary,
        canvasFocusMode,
        hiddenAssetTypes: [...hiddenAssetTypes],
      }),
      apply: (toggles) => {
        setShowLabels(toggles.showLabels);
        setShowGrid(toggles.showGrid);
        setSnapToGrid(toggles.snapToGrid);
        setShowLibrary(toggles.showLibrary);
        setCanvasFocusMode(toggles.canvasFocusMode);
        setHiddenAssetTypes(new Set(toggles.hiddenAssetTypes));
      },
    });
  }, [showLabels, showGrid, snapToGrid, showLibrary, canvasFocusMode, hiddenAssetTypes]);

  useEffect(() => {
    workspaceController.registerNavigator({
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
      if (!cy || !traceInfo?.rootId) return;
      const root = cy.getElementById(traceInfo.rootId);
      if (root.length) runTrace(root, nextMode);
    },
    [runTrace, traceInfo?.rootId]
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

  const findAssetResults = useMemo(() => {
    const cy = cyRef.current;
    const needle = panelFindQuery.trim().toLowerCase();
    if (!cy || !needle) return [];
    return cy
      .elements()
      .filter((el) => {
        const data = el.data();
        const meta = data.meta || {};
        const spec = meta.specifications || {};
        return [
          data.label,
          data.displayLabel,
          data.assetId,
          data.id,
          data.type,
          data.category,
          meta.region,
          meta.cluster,
          spec.water_source,
          spec.pipelineMaterial,
        ].some((value) => value && String(value).toLowerCase().includes(needle));
      })
      .map((el) => {
        const data = el.data();
        const meta = data.meta || {};
        const isEdge = el.isEdge();
        return {
          id: data.id,
          name: data.label || data.displayLabel || data.assetId || data.id,
          type: isEdge ? "Pipe" : ENTITY_TYPE_LABELS[data.category] || data.type || "Node",
          meta: isEdge ? `${data.sourceLabel || data.source} to ${data.targetLabel || data.target}` : meta.region || meta.cluster || data.status,
        };
      });
  }, [panelFindQuery, counts.nodes, counts.edges, selectedEl]);

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
  const arrange = useCallback(
    (kind) => {
      const cy = cyRef.current;
      if (!cy) return;
      const nodes = cy.$("node:selected");
      if (nodes.length < 2) {
        setToast("Select 2+ nodes (shift-drag a box) to arrange.");
        return;
      }
      const items = nodes.map((n) => ({ n, p: n.position() }));
      const xs = items.map((i) => i.p.x);
      const ys = items.map((i) => i.p.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      if (kind === "left") items.forEach((i) => i.n.position("x", minX));
      else if (kind === "right") items.forEach((i) => i.n.position("x", maxX));
      else if (kind === "centerh") { const c = (minX + maxX) / 2; items.forEach((i) => i.n.position("x", c)); }
      else if (kind === "top") items.forEach((i) => i.n.position("y", minY));
      else if (kind === "bottom") items.forEach((i) => i.n.position("y", maxY));
      else if (kind === "centerv") { const c = (minY + maxY) / 2; items.forEach((i) => i.n.position("y", c)); }
      else if (kind === "disth") {
        const s = [...items].sort((a, b) => a.p.x - b.p.x);
        const step = (maxX - minX) / (s.length - 1);
        s.forEach((i, k) => i.n.position("x", minX + step * k));
      } else if (kind === "distv") {
        const s = [...items].sort((a, b) => a.p.y - b.p.y);
        const step = (maxY - minY) / (s.length - 1);
        s.forEach((i, k) => i.n.position("y", minY + step * k));
      }
      scheduleCommit();
    },
    [scheduleCommit]
  );

  // ── Auto-layout ──────────────────────────────────────────────────────────────
  const runLayout = useCallback(
    (name) => {
      const cy = cyRef.current;
      if (!cy || !cy.nodes().length) return;
      const map = { grid: "grid", circle: "circle", tree: "breadthfirst", force: "cose" };
      const layout = cy.layout({
        name: map[name] || "grid",
        animate: true,
        animationDuration: 400,
        fit: true,
        padding: 48,
        ...(name === "tree" ? { directed: false, spacingFactor: 1.3 } : {}),
      });
      layout.one("layoutstop", () => scheduleCommit());
      layout.run();
    },
    [scheduleCommit]
  );

  // ── Annotate ─────────────────────────────────────────────────────────────────
  const handleGroupBox = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const nodes = cy.$("node:selected").filter((n) => !ANNOTATION_TYPES.includes(n.data("type")));
    if (!nodes.length) {
      setToast("Select the nodes to enclose, then click Group Box.");
      return;
    }
    const bb = nodes.boundingBox();
    const pad = 34;
    const box = cy.add({
      group: "nodes",
      data: {
        id: rid("box"),
        type: "group-box",
        category: "group-box",
        label: "Group",
        displayLabel: "Group",
        boxWidth: bb.x2 - bb.x1 + pad * 2,
        boxHeight: bb.y2 - bb.y1 + pad * 2,
      },
      position: { x: (bb.x1 + bb.x2) / 2, y: (bb.y1 + bb.y2) / 2 },
    });
    box.unselect();
  }, []);

  // Note formatting is disabled here; Network Builder edits are pipe-only.
  const noteFmt = useCallback(
    () => {
      setToast("Only pipe edits are enabled.");
    },
    []
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

  const handlePaste = useCallback(() => {
    const cy = cyRef.current;
    const clip = clipboardRef.current;
    if (!cy || !clip || !clip.length) {
      setToast("Clipboard is empty.");
      return;
    }
    const idMap = {};
    const OFF = 44;
    const added = [];
    cy.$(":selected").unselect();
    cy.batch(() => {
      clip.filter((j) => j.group === "nodes").forEach((j) => {
        const nid = rid("n");
        idMap[j.data.id] = nid;
        const data = { ...j.data, id: nid };
        delete data.assetId; // pasted copies are not tied to the source asset
        added.push(cy.add({ group: "nodes", data, position: { x: (j.position?.x || 0) + OFF, y: (j.position?.y || 0) + OFF } }));
      });
      clip.filter((j) => j.group === "edges").forEach((j) => {
        const s = idMap[j.data.source];
        const t = idMap[j.data.target];
        if (!s || !t) return;
        const data = { ...j.data, id: rid("e"), source: s, target: t };
        delete data.assetId;
        added.push(cy.add({ group: "edges", data }));
      });
    });
    cy.collection(added).select();
  }, []);

  // ── File ─────────────────────────────────────────────────────────────────────
  const persist = useCallback(
    async (asNew) => {
      const cy = cyRef.current;
      if (!cy) return;
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
          workspaceController.markSaved(activeWorkspaceId, {
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
    [network, navigate]
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

  const handleImportFile = useCallback(
    (file) => {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const doc = JSON.parse(reader.result);
          const cy = cyRef.current;
          if (!cy) return;
          canvasController.loadDocument(doc);
          clearTraceClasses(cy);
          cy.fit(undefined, 48);
          // An import becomes a new unsaved document in the active workspace.
          const workspaceId = activeWorkspaceId;
          if (workspaceId) {
            workspaceController.markSaved(workspaceId, {
              networkId: null,
              name: doc.name || "Imported network",
            });
            workspaceController.notifyDocumentMutated();
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
    [activeWorkspaceId, syncGraph, resetHistory]
  );

  // "New" now opens another workspace tab instead of discarding the current
  // document, so there is nothing to confirm away.
  const handleNew = useCallback(() => {
    void workspaceController.createWorkspace();
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
    if (!cyReady) return;
    applyCategoryFilter(cyRef.current, hiddenAssetTypes);
  }, [hiddenAssetTypes, cyReady, counts]);

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
  }, [canvasFocusMode, showLibrary, showInspector]);

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
      // A modal owns the keyboard while it is open.
      return !!target.closest('.af__overlay, .af__modal, [role="dialog"]');
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
          void workspaceController.activateRelative(1);
          return;
        }
        if (key === "ArrowLeft") {
          e.preventDefault();
          void workspaceController.activateRelative(-1);
          return;
        }
        if (lower === "n") {
          e.preventDefault();
          void workspaceController.createWorkspace();
          return;
        }
      }
      if (mod && e.shiftKey && lower === "t") {
        e.preventDefault();
        void workspaceController.reopenLastClosed();
        return;
      }
      if (mod && !e.shiftKey && lower === "w") {
        // Closing is undoable via Ctrl/Cmd+Shift+T, so no confirmation prompt.
        e.preventDefault();
        const id = workspaceStore.getState().activeWorkspaceId;
        if (id) void workspaceController.closeWorkspace(id);
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
    nudgeSelection, handleFit, handleZoomToSelection, handleToggleCanvasFocus,
  ]);

  const handleOpenDetailsPanel = useCallback(() => {
    setCanvasFocusMode(false);
    setShowInspector(true);
    setRightPanelTab("details");
  }, []);

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
  const hasPipeSelection = selectedEdgeCount > 0;
  const hasDeletableSelection = selectedDeletableCount > 0;
  const canUndo = historyRef.current.past.length > 0;
  const canRedo = historyRef.current.future.length > 0;
  const realNodeCount = counts.nodes;

  useEffect(() => {
    const saveLabel = saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved ✓" : "Save";
    const Btn = ({ on, active, disabled, title, children, danger, primary, icon: Icon, iconOnly, dataId }) => (
      <button
        className={`toolbar-button${iconOnly ? " toolbar-button--icon toolbar-button--icon-only" : ""}${active ? " active" : ""}${danger ? " toolbar-button--danger" : ""}${primary ? " toolbar-button--primary" : ""}`}
        onClick={on}
        disabled={disabled}
        title={title}
        data-id={dataId}
      >
        {Icon && <Icon size={15} />}
        {(!iconOnly || !Icon) && <span>{children}</span>}
      </button>
    );

    setToolbar(
      <div className="nb-chrome">
      <WorkspaceTabsBoundary>
        <WorkspaceTabs />
      </WorkspaceTabsBoundary>
      <div className="contextual-toolbar contextual-toolbar--compact contextual-toolbar--static-fit">
        <div className="contextual-toolbar__container">
          {/* File */}
          <div className="toolbar-group toolbar-group--cols-2">
            <div className="toolbar-group__buttons">
              <Btn on={handleSave} icon={IconSave} primary disabled={saveStatus === "saving"} title="Save current canvas">{saveLabel}</Btn>
              <Btn on={handleSaveAs} icon={IconCopy} title="Save a copy under a new name">Save As</Btn>
              <Btn on={() => fileInputRef.current?.click()} icon={IconUpload} title="Import canvas from JSON file">Import</Btn>
              <Btn on={handleExportJSON} icon={IconDownload} title="Export canvas as JSON">JSON</Btn>
              <Btn on={handleExportCSV} icon={IconDownload} title="Export nodes & edges as CSV">CSV</Btn>
            </div>
            <span className="toolbar-group__label">File</span>
          </div>

          {/* History */}
          <div className="toolbar-group toolbar-group--cols-1">
            <div className="toolbar-group__buttons">
              <Btn on={handleUndo} icon={IconRotateCcw} disabled={!canUndo} title="Undo (Ctrl/Cmd+Z)">Undo</Btn>
              <Btn on={handleRedo} icon={IconRotateCw} disabled={!canRedo} title="Redo (Ctrl/Cmd+Shift+Z)">Redo</Btn>
            </div>
            <span className="toolbar-group__label">History</span>
          </div>

          {/* Insert */}
          <div className="toolbar-group toolbar-group--cols-3">
            <div className="toolbar-group__buttons">
              {INSERT_ENTITY_BUTTONS.map(({ type, implemented }) => {
                const label = toolbarEntityLabel(type);
                const Icon = ENTITY_ICONS[type] || EmptyIcon;
                return (
                <Btn
                  key={type}
                  icon={Icon}
                  on={() =>
                    implemented
                      ? (mode === "place-entity" && pendingEntity === type ? setModeSafe("select") : handleInsertEntity(type))
                      : notImplemented(label)
                  }
                  active={mode === "place-entity" && pendingEntity === type}
                  title={`Insert ${label}`}
                >
                  {label}
                </Btn>
                );
              })}
              <Btn on={handleToggleLibraryPanel} icon={IconFolder} active={showLibrary && !canvasFocusMode} title="Toggle the asset library panel">Library</Btn>
              <Btn
                on={() => setModeSafe(mode === "draw-pipe" ? "select" : "draw-pipe")}
                icon={IconPipe}
                active={mode === "draw-pipe"}
                disabled={realNodeCount < 2}
                title="Draw a pipe (click source then target)"
              >
                Pipe
              </Btn>
              <Btn
                on={() => setModeSafe(mode === "insert-on-edge" ? "select" : "insert-on-edge")}
                icon={IconPlusCircle}
                active={mode === "insert-on-edge"}
                disabled={counts.edges < 1}
                title="Insert an entity on a pipe"
              >
                Insert on Pipe
              </Btn>
              <Btn
                on={handleRemoveAllBends}
                icon={IconMinus}
                disabled={selectedEdgeCount < 1}
                title="Straighten the selected pipes (remove every bend point)"
              >
                Straighten
              </Btn>
            </div>
            <span className="toolbar-group__label">Insert</span>
          </div>

          {/* Select */}
          <div className="toolbar-group toolbar-group--cols-3">
            <div className="toolbar-group__buttons">
              <Btn on={handleSelectAll} icon={IconSelect} title="Select all (Ctrl/Cmd+A)">All</Btn>
              <Btn on={() => setFindOpen((v) => !v)} icon={IconSearch} active={findOpen} title="Find assets on the canvas">Find</Btn>
              <Btn on={handleZoomToSelection} icon={IconCrosshair} title="Zoom to selection (or fit all)">To Sel</Btn>
              <Btn on={handleToggleIsolation} icon={EmptyIcon} active={isolationActive} title="Isolate current selection, or clear isolate">Isolate / Unisolate</Btn>
              <Btn on={handleSelectActive} icon={IconActive} title="Select active assets and pipes">Active</Btn>
              <Btn on={handleSelectInactive} icon={IconEyeOff} title="Select inactive assets and pipes">Inactive</Btn>
              <Btn on={handleMakeSelectionActive} icon={EmptyIcon} disabled={!hasPipeSelection} title="Mark selected pipes active">Activate</Btn>
              <Btn on={handleMakeSelectionInactive} icon={IconStop} disabled={!hasPipeSelection} title="Mark selected pipes inactive">Inactive</Btn>
            </div>
            <span className="toolbar-group__label">Select</span>
          </div>

          {/* View */}
          <div className="toolbar-group toolbar-group--cols-2">
            <div className="toolbar-group__buttons">
              <Btn on={handleFit} icon={IconMaximize2} title="Fit to screen">Fit</Btn>
              <Btn on={() => setModeSafe(mode === "area-zoom" ? "select" : "area-zoom")} icon={IconMaximize} active={mode === "area-zoom"} title="Drag a rectangle to zoom">Area</Btn>
              <Btn on={() => setShowLabels((v) => !v)} icon={IconTag} active={showLabels} title="Toggle labels">Labels</Btn>
              <Btn on={() => setShowGrid((v) => !v)} icon={IconGrid} active={showGrid} title="Toggle grid">Grid</Btn>
              <Btn
                on={() => setSnapToGrid((v) => !v)}
                icon={IconTarget}
                active={snapToGrid}
                title="Align assets to the grid when you drop them (hold Alt to bypass)"
              >
                Snap
              </Btn>
              <Btn
                on={() => setModeSafe(mode === "trace" ? "select" : "trace")}
                icon={IconDistributionNetwork}
                active={mode === "trace"}
                disabled={realNodeCount < 1}
                title="Trace delivery paths from a handover point"
              >
                Trace HP
              </Btn>
              <Btn on={handleResetView} icon={IconRefresh} title="Reset pan and zoom">Reset</Btn>
              <Btn
                on={() => setShortcutsOpen((v) => !v)}
                icon={IconHelpCircle}
                active={shortcutsOpen}
                title="Show every keyboard shortcut (?)"
              >
                Shortcuts
              </Btn>
            </div>
            <span className="toolbar-group__label">View</span>
          </div>

          {/* Review */}
          <div className="toolbar-group toolbar-group--cols-3">
            <div className="toolbar-group__buttons">
              <Btn on={() => notImplemented("Group Lines")} icon={IconGitBranch} title="Group selected pipes into a line">Group Lines</Btn>
              <Btn on={handleValidateNetwork} icon={IconCheckSquare} title="Validate the current network">Validate</Btn>
              <Btn on={handleShowIssues} icon={IconAlertTriangle} title="Show validation issues">Issues</Btn>
              <Btn on={handleFocusIssues} icon={IconCrosshair} title="Focus the first validation issue">Focus</Btn>
              <Btn on={handleSelectDisconnected} icon={IconAlertTriangle} title="Select disconnected assets">Disconnected</Btn>
              <Btn on={handleSelectMissingCapacity} icon={EmptyIcon} title="Select pipes with missing capacity">No Capacity</Btn>
              <Btn on={handleSelectInactive} icon={IconEyeOff} title="Select inactive assets and pipes">Inactive</Btn>
              <Btn on={handleClearHighlights} icon={EmptyIcon} title="Clear selection, find results, and isolation">Clear Marks</Btn>
            </div>
            <span className="toolbar-group__label">Review</span>
          </div>

          {/* Arrange */}
          <div className="toolbar-group toolbar-group--cols-3">
            <div className="toolbar-group__buttons">
              <Btn icon={IconAlignLeft} on={() => arrange("left")} title="Align left">Left</Btn>
              <Btn icon={IconAlignCenter} on={() => arrange("centerh")} title="Center horizontally">Center H</Btn>
              <Btn icon={IconAlignRight} on={() => arrange("right")} title="Align right">Right</Btn>
              <Btn icon={IconArrowUp} on={() => arrange("top")} title="Align top">Top</Btn>
              <Btn icon={IconMinus} on={() => arrange("centerv")} title="Center vertically">Center V</Btn>
              <Btn icon={IconArrowDown} on={() => arrange("bottom")} title="Align bottom">Bottom</Btn>
              <Btn icon={IconAlignJustify} on={() => arrange("disth")} title="Distribute horizontally">Dist H</Btn>
              <Btn icon={IconGrid} on={() => arrange("distv")} title="Distribute vertically">Dist V</Btn>
            </div>
            <span className="toolbar-group__label">Arrange</span>
          </div>

          {/* Layout */}
          <div className="toolbar-group toolbar-group--cols-2">
            <div className="toolbar-group__buttons">
              <Btn on={() => runLayout("grid")} icon={EmptyIcon} title="Grid layout">Grid</Btn>
              <Btn on={() => runLayout("circle")} icon={EmptyIcon} title="Circle layout">Circle</Btn>
              <Btn on={() => runLayout("tree")} icon={EmptyIcon} title="Tree layout">Tree</Btn>
              <Btn on={() => runLayout("force")} icon={EmptyIcon} title="Force-directed layout">Force</Btn>
            </div>
            <span className="toolbar-group__label">Layout</span>
          </div>

          {/* Annotate */}
          <div className="toolbar-group toolbar-group--cols-1">
            <div className="toolbar-group__buttons">
              <Btn on={() => setModeSafe(mode === "place-note" ? "select" : "place-note")} icon={IconFileText} active={mode === "place-note"} title="Place a sticky note">Note</Btn>
              <Btn on={handleGroupBox} icon={IconSquare} title="Group box around selected nodes">Group</Btn>
            </div>
            <span className="toolbar-group__label">Annotate</span>
          </div>

          {/* Note Format */}
          <div className="toolbar-group toolbar-group--note toolbar-group--cols-3">
            <div className="toolbar-group__buttons toolbar-group__buttons--note">
              <select
                className="toolbar-select"
                disabled
                value={selectedEl?.noteFont || "sans"}
                onChange={(e) => noteFmt("noteFont", e.target.value)}
                title="Font"
              >
                <option value="sans">Sans</option>
                <option value="serif">Serif</option>
                <option value="mono">Mono</option>
              </select>
              <select
                className="toolbar-select"
                disabled
                value={selectedEl?.noteSize || "normal"}
                onChange={(e) => noteFmt("noteSize", e.target.value)}
                title="Size"
              >
                {NOTE_SIZES.map((s) => (
                  <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
              <Btn iconOnly dataId="note-size-down" icon={IconTextDecrease} disabled on={() => noteFmt("sizeStep", -1)} title="Decrease Size" />
              <Btn iconOnly dataId="note-size-up" icon={IconTextIncrease} disabled on={() => noteFmt("sizeStep", 1)} title="Increase Size" />
              <Btn iconOnly dataId="note-bold" icon={IconBold} disabled active={selectedEl?.noteBold === "true"} on={() => noteFmt("noteBold")} title="Bold" />
              <Btn iconOnly icon={IconItalic} disabled active={selectedEl?.noteItalic === "true"} on={() => noteFmt("noteItalic")} title="Italic" />
              <Btn iconOnly icon={IconUnderline} disabled active={selectedEl?.noteUnderline === "true"} on={() => noteFmt("noteUnderline")} title="Underline" />
            </div>
            <span className="toolbar-group__label">Note Format</span>
          </div>

          {/* Edit */}
          <div className="toolbar-group toolbar-group--cols-2">
            <div className="toolbar-group__buttons">
              <Btn on={handleCopySelection} icon={IconCopy} disabled={!hasSelection} title="Copy selection (Ctrl/Cmd+C)">Copy Sel</Btn>
              <Btn on={handleCopyAll} icon={IconCopy} title="Copy all">Copy All</Btn>
              <Btn on={handlePaste} icon={IconClipboard} title="Paste (Ctrl/Cmd+V)">Paste</Btn>
              <Btn on={handleOpenDetailsPanel} icon={IconEdit2} disabled={!isPipeSel} title="Edit selected pipe">Edit</Btn>
              <Btn danger icon={IconTrash2} on={handleDelete} disabled={!hasDeletableSelection} title="Delete selected pipe or asset node (Del)">Delete</Btn>
            </div>
            <span className="toolbar-group__label">Edit</span>
          </div>

          {/* Run */}
          <div className="toolbar-group toolbar-group--cols-1">
            <div className="toolbar-group__buttons">
              <Btn on={() => notImplemented("Run")} icon={IconPlay} title="Run network analysis">Run</Btn>
              <Btn on={() => notImplemented("Clear run results")} icon={EmptyIcon} title="Clear run results">Clear</Btn>
            </div>
            <span className="toolbar-group__label">Run</span>
          </div>

          {/* Panel */}
          <div className="toolbar-group toolbar-group--cols-1">
            <div className="toolbar-group__buttons">
              <Btn
                on={handleToggleDetailsPanel}
                icon={showInspector && !canvasFocusMode && rightPanelTab === "details" ? IconChevronRight : IconChevronLeft}
                active={showInspector && !canvasFocusMode && rightPanelTab === "details"}
                title="Toggle details panel"
              >
                Details
              </Btn>
            </div>
            <span className="toolbar-group__label">Panel</span>
          </div>
        </div>
      </div>
      </div>
    );
  }, [
    mode, pendingEntity, network.name, counts.nodes, counts.edges, realNodeCount, saveStatus,
    selectedEl, hasSelection, isPipeSel, hasPipeSelection, hasDeletableSelection, canUndo, canRedo,
    showLabels, showGrid, snapToGrid, showInspector, showLibrary, canvasFocusMode, findOpen, isolationActive, rightPanelTab,
    shortcutsOpen,
    handleRemoveAllBends,
    setToolbar, setModeSafe, notImplemented, handleInsertEntity, handleFit, handleResetView,
    handleToggleLibraryPanel, handleOpenDetailsPanel, handleToggleDetailsPanel,
    handleZoomToSelection, handleSelectAll, handleSelectActive, handleSelectInactive,
    handleMakeSelectionActive, handleMakeSelectionInactive, handleToggleIsolation,
    handleValidateNetwork, handleShowIssues, handleFocusIssues, handleSelectDisconnected,
    handleSelectMissingCapacity, handleClearHighlights,
    handleDelete, handleSave, handleSaveAs, handleExportJSON, handleExportCSV, handleUndo, handleRedo,
    handleCopySelection, handleCopyAll, handlePaste, handleGroupBox, arrange, runLayout, noteFmt,
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
      : mode === "area-zoom"
      ? "Drag a rectangle to zoom into that region"
      : mode === "draw-pipe"
      ? lineSource
        ? "Draw Pipe — click the target node"
        : "Draw Pipe — click the source node"
      : mode === "trace"
      ? "Trace HP — click a handover point or delivery node"
      : null;
  const saveStatusLabel = saveStatus === "saving" ? "Saving" : saveStatus === "saved" ? "Saved" : "Unsaved";
  const saveStatusTone = saveStatus === "saved" ? "green" : saveStatus === "saving" ? "blue" : "amber";

  return (
    <div className={`nb-page nb-page--${mode}${canvasFocusMode ? " nb-page--canvas-focus" : ""}`}>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        style={{ display: "none" }}
        onChange={(e) => {
          handleImportFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      {/* Saved networks rail */}
      {!canvasFocusMode && (
        <aside className="nb-rail">
          <WorkspaceRecordSidebar
            recordLabel="Network"
            newTitle="New Network"
            activeId={network.id}
            api={networkSidebarApi}
            savedEvent={NETWORK_SAVED_EVENT}
            getMeta={(n) => `${n.nodeCount} nodes · ${n.edgeCount} pipes`}
            onNew={handleNew}
            onSelect={(id) => navigate(`/network-builder/${id}`)}
          />
        </aside>
      )}

      {/* Asset library */}
      {showLibrary && !canvasFocusMode && (
        <aside className="nb-library ns2-library">
          <div className="ns2-library-header">
            <span className="ns2-library-title">Asset Library</span>
            <button className="nb-library__close ns2-btn ns2-btn--sm" onClick={() => setShowLibrary(false)} aria-label="Hide library">×</button>
          </div>
          <NetworkPalette
            onPick={handlePick}
            onPickSystem={handlePickTransmissionSystem}
            placedIds={placedIds}
            armedId={Array.isArray(pendingAsset) ? pendingAsset.map((asset) => asset.id) : pendingAsset?.id}
            armedSystemId={pendingSystem?.id}
          />
        </aside>
      )}

      <div className="nb-workspace">
        {!canvasFocusMode && (
          <WorkspaceHeader
            title="Network Builder"
            subtitle={network.name || "Untitled network"}
            icon={IconPipelineNetwork}
            status={saveStatusLabel}
            statusTone={saveStatusTone}
            className="workspace-header--network-builder"
            actions={[
              <WorkspaceHeaderChip key="nodes" tone={realNodeCount > 0 ? "blue" : "default"}>
                {realNodeCount} nodes
              </WorkspaceHeaderChip>,
              <WorkspaceHeaderChip key="pipes" tone={counts.edges > 0 ? "blue" : "default"}>
                {counts.edges} pipes
              </WorkspaceHeaderChip>,
            ]}
          />
        )}

        <div
          ref={canvasWrapRef}
          className={`nb-canvas-wrap ${showGrid ? "nb-canvas-wrap--grid" : ""}`}
          onDragOver={handleLibraryDragOver}
          onDrop={handleLibraryDrop}
        >
          <div ref={containerRef} className="nb-canvas" />

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

          <div className="nb-canvas-controls">
            <button
              type="button"
              className={`nb-canvas-ctl${shortcutsOpen ? " is-active" : ""}`}
              onClick={() => setShortcutsOpen((v) => !v)}
              aria-expanded={shortcutsOpen}
              aria-controls="nb-shortcut-guide"
              aria-label="Keyboard shortcuts"
              title="Show every keyboard shortcut (?)"
            >
              <IconHelpCircle size={13} />
            </button>

            <button
              type="button"
              className={`nb-canvas-ctl${canvasFocusMode ? " is-active" : ""}`}
              onClick={handleToggleCanvasFocus}
              aria-label={canvasFocusMode ? "Exit canvas fullscreen" : "Show only toolbar and canvas"}
              aria-pressed={canvasFocusMode}
              title={canvasFocusMode ? "Exit canvas fullscreen" : "Show only toolbar and canvas"}
            >
              {canvasFocusMode ? <IconMinimize2 size={13} /> : <IconMaximize2 size={13} />}
            </button>
          </div>

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
      </div>

      {showInspector && !canvasFocusMode && (
        <aside className="nb-inspector">
          <div className="ns2-right-panel">
            <div className="ns2-panel-tabs">
              <button
                className={`ns2-panel-tab${rightPanelTab === "details" ? " ns2-panel-tab--active" : ""}`}
                onClick={() => setRightPanelTab("details")}
              >
                Details
              </button>
              <button
                className={`ns2-panel-tab${rightPanelTab === "issues" && issuePanelMode === "issues" ? " ns2-panel-tab--active" : ""}${validationIssues.length ? " ns2-panel-tab--has-data" : ""}`}
                onClick={() => { setIssuePanelMode("issues"); setRightPanelTab("issues"); }}
                title={issueBadgeText ? `Errors / warnings: ${issueBadgeText}` : "Advisory network validation"}
              >
                Validation
              </button>
              <button
                className={`ns2-panel-tab${rightPanelTab === "issues" && issuePanelMode === "find" ? " ns2-panel-tab--active" : ""}`}
                onClick={() => { setIssuePanelMode("find"); setRightPanelTab("issues"); }}
              >
                Find
              </button>
              <button
                className={`ns2-panel-tab${rightPanelTab === "trace" ? " ns2-panel-tab--active" : ""}${traceInfo ? " ns2-panel-tab--has-data" : ""}`}
                onClick={() => setRightPanelTab("trace")}
              >
                Trace
              </button>
              <button
                className={`ns2-panel-tab${rightPanelTab === "isolation" ? " ns2-panel-tab--active" : ""}`}
                onClick={() => setRightPanelTab("isolation")}
              >
                Isolation
              </button>
            </div>

            {rightPanelTab === "details" && (
              <div className="ns2-panel-body ns2-panel-body--details">
                {/* Category visibility — hiding is a class on the elements, so
                    nothing is removed and clearing brings it all back. */}
                <section className="nb-asset-filter" aria-label="Show or hide asset categories">
                  <div className="nb-asset-filter__head">
                    <span className="nb-asset-filter__title">Canvas Categories</span>
                    {hiddenAssetTypes.size > 0 && (
                      <button type="button" className="nb-asset-filter__reset" onClick={showAllAssetTypes}>
                        Show all asset types
                      </button>
                    )}
                  </div>

                  <div className="nb-asset-filter__list">
                    {ASSET_CATEGORIES.map((category) => {
                      const stats = assetSummary[category.key];
                      if (!stats) return null;
                      const isHidden = hiddenAssetTypes.has(category.key);
                      return (
                        <button
                          key={category.key}
                          type="button"
                          className={`nb-asset-filter__row${isHidden ? " nb-asset-filter__row--hidden" : ""}`}
                          onClick={() => toggleAssetType(category.key)}
                          aria-pressed={!isHidden}
                          title={`${isHidden ? "Show" : "Hide"} ${category.label} on the canvas`}
                        >
                          <span className="nb-asset-filter__swatch" style={{ background: categoryColour(category.key) }} />
                          <span className="nb-asset-filter__label">{category.label}</span>
                          <span className="nb-asset-filter__count">{stats.count}</span>
                          <span
                            className="nb-asset-filter__capacity"
                            title={category.unit ? `Total capacity (${category.unit})` : undefined}
                          >
                            {category.unit ? formatCapacity(stats.capacity) : "—"}
                          </span>
                          <span className="nb-asset-filter__eye" aria-hidden="true">
                            {isHidden ? <IconEyeOff size={13} /> : <IconEye size={13} />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>

                {/* Capacity in service per year, stacked by visible category. */}
                <section className="nb-panel-section" aria-label="Capacity by horizon">
                  <div className="nb-panel-section__head">
                    <span className="nb-asset-filter__title">Capacity by horizon</span>
                    <span className="nb-horizon">
                      <input
                        type="number"
                        className="nb-horizon__input"
                        value={horizon.start}
                        onChange={(e) => setHorizon((h) => ({ ...h, start: e.target.value }))}
                        aria-label="Horizon start year"
                      />
                      <span className="nb-horizon__dash">–</span>
                      <input
                        type="number"
                        className="nb-horizon__input"
                        value={horizon.end}
                        onChange={(e) => setHorizon((h) => ({ ...h, end: e.target.value }))}
                        aria-label="Horizon end year"
                      />
                    </span>
                  </div>

                  {chartYears.length === 0 ? (
                    <div className="nb-panel-hint">Set a valid year range to chart capacity.</div>
                  ) : visibleAssetCategories.length === 0 ? (
                    <div className="nb-panel-hint">
                      All asset types are hidden — show one to chart its capacity.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={190}>
                      <BarChart data={capacityChartRows} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                        <XAxis dataKey="year" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={formatCapacity} width={44} />
                        <Tooltip
                          formatter={(value, name) => [
                            formatCapacity(value),
                            ASSET_CATEGORIES.find((c) => c.key === name)?.label || name,
                          ]}
                        />
                        {visibleAssetCategories.map((category) => (
                          <Bar
                            key={category.key}
                            dataKey={category.key}
                            stackId="capacity"
                            fill={categoryColour(category.key)}
                            isAnimationActive={false}
                          />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </section>

                <section className="nb-panel-section" aria-label="Largest assets by capacity">
                  <div className="nb-panel-section__head">
                    <span className="nb-asset-filter__title">Largest by capacity</span>
                  </div>

                  {largestAssets.length === 0 ? (
                    <div className="nb-panel-hint">No capacities recorded on the visible assets.</div>
                  ) : (
                    <div className="nb-asset-top">
                      {largestAssets.map((asset) => (
                        <button
                          key={asset.id}
                          type="button"
                          className="nb-asset-top__row"
                          onClick={() => focusCanvasElement(asset.id)}
                          title="Select and centre on the canvas"
                        >
                          <span
                            className="nb-asset-filter__swatch"
                            style={{ background: categoryColour(asset.category) }}
                          />
                          <span className="nb-asset-top__name">{nameOf(asset.data, asset.id)}</span>
                          <span className="nb-asset-filter__capacity">
                            {formatCapacity(capacityOf(asset.data))}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </section>

                <NetworkNodeDetails
                  selected={selectedEl}
                  systems={transmissionSystems}
                  lines={transmissionLinesForCanvas}
                  onLabelChange={handleLabelChange}
                  onSpecChange={handleSpecChange}
                  onSpecBooleanChange={handleSpecBooleanChange}
	                  onSpecArrayChange={handleSpecArrayChange}
	                  onEdgeFieldChange={handleEdgeFieldChange}
	                  onActiveChange={handleEdgeActiveChange}
	                  onNodeSpecChange={handleNodeSpecChange}
	                  onCreateLine={handleCreateLineForInspector}
	                  onDelete={handleDelete}
	                />
              </div>
            )}

            {rightPanelTab === "issues" && (
              <div className="ns2-panel-body ns2-panel-body--issues">
                <div className="ns2-adv-toggle">
                  <button
                    className={`ns2-adv-toggle-btn${issuePanelMode === "issues" ? " ns2-adv-toggle-btn--active" : ""}`}
                    onClick={() => setIssuePanelMode("issues")}
                  >
                    <IconAlertTriangle size={12} /> Issues
                  </button>
                  <button
                    className={`ns2-adv-toggle-btn${issuePanelMode === "find" ? " ns2-adv-toggle-btn--active" : ""}`}
                    onClick={() => setIssuePanelMode("find")}
                  >
                    <IconSearch size={12} /> Find
                  </button>
                </div>

                {issuePanelMode === "issues" ? (
                  <div className="ns2-issues-panel">
                    <div className="ns2-issues-summary">
                      <div>
                        <div className="ns2-issues-title">Network Validation</div>
                        <div className="ns2-issues-subtitle">
                          {validationIssues.length
                            ? `${issueCounts.error || 0} errors, ${issueCounts.warning || 0} warnings, ${issueCounts.info || 0} notes`
                            : "Run validation to check the current canvas."}
                        </div>
                      </div>
                      <button className="ns2-btn ns2-btn--sm" onClick={handleValidateNetwork}>
                        <IconCheckSquare size={12} /> Validate
                      </button>
                    </div>

                    {validationIssues.length === 0 ? (
                      <div className="ns2-panel-hint">No validation results yet.</div>
                    ) : (
                      <div className="ns2-issue-list">
                        {validationIssues.map((issue) => {
                          const IssueIcon =
                            issue.severity === "error"
                              ? IconAlertTriangle
                              : issue.severity === "success"
                              ? IconCheckSquare
                              : issue.severity === "info"
                              ? IconFileText
                              : IconAlertTriangle;
                          return (
                            <button
                              key={issue.id}
                              type="button"
                              className={`ns2-issue-row ns2-issue-row--${issue.severity}`}
                              onClick={() => issue.elementId && focusCanvasElement(issue.elementId)}
                              disabled={!issue.elementId}
                              title={issue.elementId ? "Focus on canvas" : undefined}
                            >
                              <span className="ns2-issue-icon"><IssueIcon size={14} /></span>
                              <span className="ns2-issue-copy">
                                <span className="ns2-issue-title">{issue.title}</span>
                                <span className="ns2-issue-detail">{issue.detail}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="ns2-find-panel">
                    <label className="ns2-label">Find Asset</label>
                    <input
                      className="ns2-input"
                      value={panelFindQuery}
                      onChange={(e) => setPanelFindQuery(e.target.value)}
                      placeholder="Search name, ID, type, region..."
                    />
                    <div className="ns2-find-meta">
                      {panelFindQuery.trim()
                        ? `${findAssetResults.length} result${findAssetResults.length === 1 ? "" : "s"}`
                        : "Search the current canvas."}
                    </div>
                    <div className="ns2-find-results">
                      {findAssetResults.map((result) => (
                        <button
                          key={result.id}
                          type="button"
                          className="ns2-find-row"
                          onClick={() => focusCanvasElement(result.id)}
                        >
                          <span className="ns2-find-name">{result.name}</span>
                          <span className="ns2-find-detail">{result.type}{result.meta ? ` - ${result.meta}` : ""}</span>
                        </button>
                      ))}
                      {panelFindQuery.trim() && findAssetResults.length === 0 && (
                        <div className="ns2-panel-hint">No matching canvas assets.</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {rightPanelTab === "trace" && (
              <div className="ns2-panel-body ns2-panel-body--trace">
                <div className="ns2-adv-toggle">
                  <button
                    className={`ns2-adv-toggle-btn${traceMode === "reachable" ? " ns2-adv-toggle-btn--active" : ""}`}
                    onClick={() => handleTraceModeSelect("reachable")}
                    disabled={!traceInfo}
                  >
                    Reachable
                  </button>
                  <button
                    className={`ns2-adv-toggle-btn${traceMode === "delivered" ? " ns2-adv-toggle-btn--active" : ""}`}
                    onClick={() => handleTraceModeSelect("delivered")}
                    disabled={!traceInfo || !traceInfo.hasFlow}
                    title={traceInfo?.hasFlow ? "Trace only pipes with delivered flow" : "No flow results attached to this canvas yet"}
                  >
                    Delivered
                  </button>
                </div>

                {!traceInfo ? (
                  <div className="ns2-panel-hint">Turn on Trace HP, then click a handover point or delivery node.</div>
                ) : (
                  <div className="ns2-trace-panel">
                    <div className="ns2-trace-summary">
                      <div>
                        <div className="ns2-trace-root">{traceInfo.rootName}</div>
                        <div className="ns2-trace-subtitle">
                          {traceInfo.mode === "delivered" ? "Delivered flow" : "Reachable topology"}
                          {!traceInfo.hasFlow && traceInfo.requestedMode === "delivered" ? " - no flow results attached" : ""}
                        </div>
                      </div>
                      <button className="ns2-btn ns2-btn--sm" onClick={() => clearTraceCanvas("Cleared trace.")}>
                        Clear
                      </button>
                    </div>

                    <div className="ns2-trace-stats">
                      <div className="ns2-trace-stat">
                        <span>Upstream</span>
                        <strong>{traceInfo.upCount}</strong>
                        <small>{traceInfo.upEdgeCount} pipes</small>
                      </div>
                      <div className="ns2-trace-stat">
                        <span>Downstream</span>
                        <strong>{traceInfo.downCount}</strong>
                        <small>{traceInfo.downEdgeCount} pipes</small>
                      </div>
                    </div>

                    <div className="ns2-trace-section">
                      <div className="ns2-trace-section__title">Immediate Sources</div>
                      {traceInfo.sources.length ? (
                        <div className="ns2-trace-list">
                          {traceInfo.sources.map((item) => (
                            <button key={`source-${item.id}`} className="ns2-trace-row" onClick={() => focusCanvasElement(item.id)}>
                              <span className="ns2-trace-row__name">{item.name}</span>
                              <span className="ns2-trace-row__flow">{formatTraceFlow(item.flow, traceInfo.hasFlow)}</span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="ns2-panel-hint">No immediate upstream neighbours found.</div>
                      )}
                    </div>

                    <div className="ns2-trace-section">
                      <div className="ns2-trace-section__title">Immediate Destinations</div>
                      {traceInfo.dests.length ? (
                        <div className="ns2-trace-list">
                          {traceInfo.dests.map((item) => (
                            <button key={`dest-${item.id}`} className="ns2-trace-row" onClick={() => focusCanvasElement(item.id)}>
                              <span className="ns2-trace-row__name">{item.name}</span>
                              <span className="ns2-trace-row__flow">{formatTraceFlow(item.flow, traceInfo.hasFlow)}</span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="ns2-panel-hint">No immediate downstream neighbours found.</div>
                      )}
                    </div>

                    <div className="ns2-trace-section">
                      <div className="ns2-trace-section__title">Ultimate Sources</div>
                      {traceInfo.ultimateSources.length ? (
                        <div className="ns2-trace-list">
                          {traceInfo.ultimateSources.map((item) => (
                            <button key={`ultimate-${item.id}`} className="ns2-trace-row" onClick={() => focusCanvasElement(item.id)}>
                              <span className="ns2-trace-row__name">{item.name}</span>
                              <span className="ns2-trace-row__type">{ENTITY_TYPE_LABELS[item.type] || item.type}</span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="ns2-panel-hint">No plant or STP nodes found upstream.</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {rightPanelTab === "isolation" && (
              <div className="ns2-panel-body ns2-panel-body--issues">
                <div className="ns2-isolation-tools">
                  <label className="ns2-label">Filter Isolation</label>
                  <input
                    className="ns2-input"
                    value={isolationQuery}
                    onChange={(e) => setIsolationQuery(e.target.value)}
                    placeholder="Search system, branch, line, pipe..."
                  />
                  <div className="ns2-isolation-status">
                    {isolationActive
                      ? `Showing ${activeIsolationLabel || "isolated scope"} only`
                      : "Click a system, line, branch, or pipe to isolate it."}
                  </div>
                  {isolationActive && (
                    <button type="button" className="ns2-btn ns2-btn--sm" onClick={() => clearIsolation()}>
                      Clear Isolation
                    </button>
                  )}
                </div>
                <div className="ns2-isolation-tree">
                  <div className="ns2-isolation-tree__title">Transmission Systems</div>
                  {filteredIsolationGroups.systems.length === 0 ? (
                    <div className="ns2-panel-hint">No transmission systems loaded yet.</div>
                  ) : (
                    filteredIsolationGroups.systems.map((system) => {
                      const systemPipeIds = pipeIdsForSystem(system);
                      return (
                      <div className="ns2-isolation-tree__system" key={system.id}>
                        <div className="ns2-isolation-tree__row ns2-isolation-tree__row--system">
	                          <button
	                            type="button"
	                            className={`ns2-isolation-tree__focus${activeIsolationKey === `system:${system.id}` ? " ns2-isolation-tree__focus--active" : ""}`}
	                            onClick={() => isolatePipeIds(systemPipeIds, `system ${system.name || system.id}`, `system:${system.id}`)}
	                            disabled={systemPipeIds.length === 0}
	                          >
                            <span className="ns2-isolation-tree__level">SYSTEM</span>
                            <strong>{system.name}</strong>
                            <small>{system.lines.length} lines, {systemPipeIds.length} pipe{systemPipeIds.length === 1 ? "" : "s"}</small>
                          </button>
                        </div>
                        <div className="ns2-isolation-tree__children">
                          {system.lines.length === 0 && system.pipes.length === 0 ? (
                            <div className="ns2-isolation-tree__empty">No canvas pipes assigned to this system.</div>
                          ) : (
                            <>
                              {system.pipes.map((pipe) => (
                                <div className="ns2-isolation-tree__row ns2-isolation-tree__row--segment" key={`${system.id}-${pipe.id}`}>
                                  <span className="ns2-isolation-tree__branch-mark">-</span>
	                                  <button
	                                    type="button"
	                                    className={`ns2-isolation-tree__focus${activeIsolationKey === `pipe:${pipe.id}` ? " ns2-isolation-tree__focus--active" : ""}`}
	                                    onClick={() => isolatePipeIds([pipe.id], `pipe ${pipe.name}`, `pipe:${pipe.id}`)}
	                                  >
                                    <span className="ns2-isolation-tree__level">PIPE</span>
                                    <strong>{pipe.name}</strong>
                                    <small>{pipe.source} to {pipe.target}</small>
                                  </button>
                                </div>
                              ))}
                              {system.lines.map((line) => {
                                const linePipeIds = pipeIdsForLine(line);
                                return (
                                <div className="ns2-isolation-tree__line" key={line.id}>
                                  <div className="ns2-isolation-tree__row ns2-isolation-tree__row--line">
                                    <button
                                      type="button"
	                                      className={`ns2-isolation-tree__focus${activeIsolationKey === `line:${line.id}` ? " ns2-isolation-tree__focus--active" : ""}`}
	                                      onClick={() => isolatePipeIds(linePipeIds, `${line.isBranch ? "branch" : "line"} ${lineDisplayName(line)}`, `line:${line.id}`)}
	                                      disabled={linePipeIds.length === 0}
                                    >
                                      <span className="ns2-isolation-tree__level">{line.isBranch ? "BRANCH" : "LINE"}</span>
                                      <strong>{lineDisplayName(line)}</strong>
                                      <small>
                                        {line.isBranch && (line.parentLineName || line.parentLineId)
                                          ? `Branch of ${line.parentLineName || line.parentLineId} - `
                                          : ""}
                                        {line.pipes.length} segment{line.pipes.length === 1 ? "" : "s"}
                                      </small>
                                    </button>
                                  </div>
                                  {line.pipes.map((pipe) => (
                                    <div className="ns2-isolation-tree__row ns2-isolation-tree__row--segment" key={`${line.id}-${pipe.id}`}>
                                      <span className="ns2-isolation-tree__branch-mark">-</span>
	                                      <button
	                                        type="button"
	                                        className={`ns2-isolation-tree__focus${activeIsolationKey === `pipe:${pipe.id}` ? " ns2-isolation-tree__focus--active" : ""}`}
	                                        onClick={() => isolatePipeIds([pipe.id], `pipe ${pipe.name}`, `pipe:${pipe.id}`)}
	                                      >
                                        <span className="ns2-isolation-tree__level">PIPE</span>
                                        <strong>{pipe.name}</strong>
                                        <small>{pipe.source} to {pipe.target}</small>
                                      </button>
                                    </div>
                                  ))}
                                </div>
                                );
                              })}
                            </>
                          )}
                        </div>
                      </div>
                      );
                    })
                  )}

                  <div className="ns2-isolation-tree__ungrouped">
                    <div className="ns2-isolation-tree__title">Lines Without System</div>
                    {filteredIsolationGroups.standaloneLines.length === 0 ? (
                      <div className="ns2-isolation-tree__empty">Every line with canvas pipes is assigned to a system.</div>
                    ) : (
                      filteredIsolationGroups.standaloneLines.map((line) => {
                        const linePipeIds = pipeIdsForLine(line);
                        return (
                          <div className="ns2-isolation-tree__line" key={line.id}>
                            <div className="ns2-isolation-tree__row ns2-isolation-tree__row--line">
                              <button
                                type="button"
	                                className={`ns2-isolation-tree__focus${activeIsolationKey === `line:${line.id}` ? " ns2-isolation-tree__focus--active" : ""}`}
	                                onClick={() => isolatePipeIds(linePipeIds, `${line.isBranch ? "branch" : "line"} ${lineDisplayName(line)}`, `line:${line.id}`)}
	                                disabled={linePipeIds.length === 0}
                              >
                                <span className="ns2-isolation-tree__level">{line.isBranch ? "BRANCH" : "LINE"}</span>
                                <strong>{lineDisplayName(line)}</strong>
                                <small>{line.pipes.length} segment{line.pipes.length === 1 ? "" : "s"}</small>
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="ns2-isolation-tree__ungrouped">
                    <div className="ns2-isolation-tree__title">Ungrouped Pipes</div>
                    {filteredIsolationGroups.ungroupedPipes.length === 0 ? (
                      <div className="ns2-isolation-tree__empty">Every canvas pipe is assigned to a line.</div>
                    ) : (
                      filteredIsolationGroups.ungroupedPipes.map((pipe) => (
                        <div className="ns2-isolation-tree__row ns2-isolation-tree__row--segment" key={pipe.id}>
	                          <button
	                            type="button"
	                            className={`ns2-isolation-tree__focus${activeIsolationKey === `pipe:${pipe.id}` ? " ns2-isolation-tree__focus--active" : ""}`}
	                            onClick={() => isolatePipeIds([pipe.id], `pipe ${pipe.name}`, `pipe:${pipe.id}`)}
	                          >
                            <span className="ns2-isolation-tree__level">PIPE</span>
                            <strong>{pipe.name}</strong>
                            <small>{pipe.source} to {pipe.target}</small>
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
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

      {entityModal.open && (
        <NetworkEntityCreateModal
          type={entityModal.type}
          mode={entityModal.mode}
          initialForm={entityModal.form}
          onCancel={closeEntityModal}
          onCreated={handleEntityCreated}
        />
      )}

      {pipeModal.open && (
        <PipeVariablesModal
          systems={transmissionSystems}
          lines={transmissionLinesForCanvas}
          onCancel={() => setPipeModal({ open: false, source: null, target: null })}
          onSubmit={submitPipe}
        />
      )}
    </div>
  );
}
