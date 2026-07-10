import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import cytoscape from "cytoscape";
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
  IconEyeOff,
  IconFileText,
  IconFolder,
  IconGitBranch,
  IconGrid,
  IconItalic,
  IconLayers,
  IconMaximize,
  IconMaximize2,
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
  IconTag,
  IconTarget,
  IconTreatmentPlant,
  IconTrash2,
  IconUnderline,
  IconUpload,
} from "../components/IconAssets";
import { useLayout } from "../contexts/LayoutContext";
import { buildCyStyle, ENTITY_TYPE_COLORS, ENTITY_TYPE_LABELS } from "../cytoscape/buildCyStyle";
import { applyCardIcon } from "../cytoscape/nodeCard";
import { fetchNetwork, fetchNetworks, saveNetwork, updateNetwork, deleteNetwork } from "../api/networks";
import {
  fetchTransmissionSystems, createTransmissionSystem,
  fetchTransmissionLines, createTransmissionLine,
} from "../api/metrics";
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

const rid = (p) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const INSERT_TOOL_LABELS = {
  plant: "Plant",
  handover_point: "Handover Point / City Gate",
  node: "Node",
  pump: "Pump Station",
};
const INSERT_ENTITY_BUTTONS = [
  { type: "plant", implemented: true },
  { type: "handover_point", implemented: true },
  { type: "node", implemented: true },
  { type: "pump", implemented: true },
];
const ENTITY_TYPES_LIST = [
  { type: "plant", label: "Plant", description: "Production asset" },
  { type: "pump", label: "Pump Station", description: "Pumping asset" },
  { type: "handover_point", label: "Handover Point", description: "City gate / HP" },
];
const ENTITY_ICONS = {
  plant: IconPlant,
  tank: IconLayers,
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
// Pipe spec keys that must stay strings — everything else handleSpecChange
// coerces to a number, since most pipe spec fields are numeric.
const STRING_SPEC_FIELDS = new Set(["pipelineMaterial", "infraSource", "capacityLimitationType", "transmissionSystemId"]);
const LIBRARY_DRAG_TYPE = "application/x-widispatch-assets";

const emptyEntityForm = (entityType) => ({
  category: entityType,
  name: "",
  status: entityType === "pump" ? "inactive" : "planned",
  commissioning_date: "",
  decommissioning_date: "",
  active: true,
});

const cloneData = (value) => {
  if (!value || typeof value !== "object") return value;
  return JSON.parse(JSON.stringify(value));
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
  // cardIcon is a derived data-URI regenerated on load — don't persist it.
  nodes: cy.nodes().map((n) => {
    const { cardIcon, ...data } = n.data();
    return { data, position: { ...n.position() } };
  }),
  edges: cy.edges().map((e) => ({ data: { ...e.data() } })),
});

const addGraph = (cy, g) => {
  cy.batch(() => {
    (g.nodes || []).forEach((n) => {
      const data = n.data
        ? n.data
        : {
            id: n.id,
            assetId: n.assetId,
            category: n.category,
            type: n.type || n.category,
            label: n.label,
            displayLabel: n.label,
            status: n.status || "",
            meta: n.meta || {},
          };
      cy.add({ group: "nodes", data, position: n.position || { x: 0, y: 0 } });
    });
    (g.edges || []).forEach((e) => {
      const data = e.data
        ? e.data
        : {
            id: e.id,
            source: e.source,
            target: e.target,
            kind: e.kind || "pipe",
            assetId: e.assetId || null,
            label: e.label || "",
            displayLabel: e.label || "",
            status: e.status || "",
            meta: e.meta || {},
          };
      cy.add({ group: "edges", data });
    });
  });
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
  const loadedIdRef = useRef(null);
  const saveTimerRef = useRef(null);
  const showLabelsRef = useRef(true);
  const clipboardRef = useRef(null);
  const fileInputRef = useRef(null);
  const historyRef = useRef({ past: [], present: null, future: [] });
  const restoringRef = useRef(false);
  const commitPendingRef = useRef(false);
  const areaRef = useRef(null);

  const [cyReady, setCyReady] = useState(false);
  const [mode, setMode] = useState("select");
  const [pendingAsset, setPendingAsset] = useState(null);
  const [pendingEntity, setPendingEntity] = useState(null);
  const [lineSource, setLineSource] = useState(null);
  const [selectedEl, setSelectedEl] = useState(null);
  const [hasSelection, setHasSelection] = useState(false);
  const [selectedEdgeCount, setSelectedEdgeCount] = useState(0);
  const [selectedDeletableCount, setSelectedDeletableCount] = useState(0);
  const [counts, setCounts] = useState({ nodes: 0, edges: 0 });
  const [placedIds, setPlacedIds] = useState(new Set());
  const [network, setNetwork] = useState({ id: null, name: "", description: "" });
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
  const [showInspector, setShowInspector] = useState(true);
  const [isolationActive, setIsolationActive] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState("details");
  const [issuePanelMode, setIssuePanelMode] = useState("issues");
  const [validationIssues, setValidationIssues] = useState([]);
  const [panelFindQuery, setPanelFindQuery] = useState("");
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [areaBox, setAreaBox] = useState(null); // {x,y,w,h} while area-zoom dragging
  const [, setHistTick] = useState(0); // forces undo/redo enable refresh

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
    h.present = cy.elements().jsons();
    h.future = [];
    if (h.past.length > 80) h.past.shift();
    setHistTick((t) => t + 1);
  }, []);

  const scheduleCommit = useCallback(() => {
    if (restoringRef.current || commitPendingRef.current) return;
    commitPendingRef.current = true;
    setTimeout(() => {
      commitPendingRef.current = false;
      commitHistory();
    }, 0);
  }, [commitHistory]);

  const resetHistory = useCallback(() => {
    const cy = cyRef.current;
    historyRef.current = { past: [], present: cy ? cy.elements().jsons() : [], future: [] };
    setHistTick((t) => t + 1);
  }, []);

  const restoreEls = useCallback(
    (snap) => {
      const cy = cyRef.current;
      if (!cy) return;
      restoringRef.current = true;
      cy.elements().remove();
      cy.add(snap);
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
              x: position.x + column * 220,
              y: position.y + row * 84,
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

  // ── Cytoscape init (mount once) ──────────────────────────────────────────────
  useEffect(() => {
    const cy = cytoscape({
      container: containerRef.current,
      style: buildCyStyle(),
      layout: { name: "preset" },
      minZoom: 0.05,
      maxZoom: 4,
      boxSelectionEnabled: true, // shift-drag box-selects; plain drag pans
      wheelSensitivity: 0.2,
    });
    cyRef.current = cy;

    const updateGridBackground = () => {
      const wrap = canvasWrapRef.current;
      if (!wrap) return;
      const pan = cy.pan();
      const size = 24 * cy.zoom();
      const offsetX = ((pan.x % size) + size) % size;
      const offsetY = ((pan.y % size) + size) % size;

      wrap.style.setProperty("--grid-size", `${size}px`);
      wrap.style.setProperty("--grid-offset-x", `${offsetX}px`);
      wrap.style.setProperty("--grid-offset-y", `${offsetY}px`);
    };

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

      if (m === "place-entity" && pendingEntityRef.current) {
        const type = pendingEntityRef.current;
        if (type === "plant" || type === "pump" || type === "handover_point") {
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
        const node = cy.add({
          group: "nodes",
          data: { id: rid("n"), type, category: type, label: "", displayLabel: "", status: "", meta: { specifications: {} } },
          position: { x: evt.position.x, y: evt.position.y },
        });
        cy.$(":selected").unselect();
        node.select();
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

    cy.on("select unselect", syncSelection);
    cy.on("add", (evt) => {
      if (!showLabelsRef.current) evt.target.addClass("hide-labels");
    });
    cy.on("add", "node", (evt) => applyCardIcon(evt.target));
    cy.on("add remove", () => {
      syncGraph();
      syncSelection();
    });
    cy.on("add remove dragfree", scheduleCommit);
    cy.on("pan zoom resize", updateGridBackground);
    updateGridBackground();

    historyRef.current = { past: [], present: cy.elements().jsons(), future: [] };
    setCyReady(true);
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [syncGraph, syncSelection, createPipeEdge, scheduleCommit, placeAssetsAt, splitPipeWithNode]);

  // ── Hydrate from a saved network when the route :id changes ──────────────────
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !cyReady) return;
    if (!id) {
      loadedIdRef.current = null;
      return;
    }
    if (id === loadedIdRef.current) return;
    let cancelled = false;
    fetchNetwork(id)
      .then((doc) => {
        if (cancelled || !cyRef.current) return;
        loadedIdRef.current = id;
        restoringRef.current = true;
        cy.elements().remove();
        addGraph(cy, doc);
        restoringRef.current = false;
        cy.fit(undefined, 48);
        setNetwork({ id: doc.id, name: doc.name, description: doc.description || "" });
        setSelectedEl(null);
        syncGraph();
        resetHistory();
      })
      .catch((e) => setToast(e.message || "Couldn't load network"));
    return () => {
      cancelled = true;
    };
  }, [id, cyReady, syncGraph, resetHistory]);

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
      lineSourceRef.current = null;
      setLineSource(null);
    }
    insertEdgeRef.current = null;
    insertPositionRef.current = null;
    setInsertModal({ open: false });
    pendingPlacementRef.current = null;
    setPendingAsset(null);
    pendingEntityRef.current = null;
    setPendingEntity(null);
    setAreaBox(null);
    modeRef.current = next;
    setMode(next);
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

  const handleLibraryDragOver = useCallback((event) => {
    if (Array.from(event.dataTransfer.types).includes(LIBRARY_DRAG_TYPE)) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const handleLibraryDrop = useCallback(
    (event) => {
      const payload = event.dataTransfer.getData(LIBRARY_DRAG_TYPE);
      if (!payload) return;
      event.preventDefault();
      const cy = cyRef.current;
      if (!cy || !containerRef.current) return;
      let assets;
      try {
        assets = JSON.parse(payload);
      } catch {
        return;
      }
      const rect = containerRef.current.getBoundingClientRect();
      const rendered = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const pan = cy.pan();
      const zoom = cy.zoom();
      const position = {
        x: (rendered.x - pan.x) / zoom,
        y: (rendered.y - pan.y) / zoom,
      };
      const insertMode = pendingPlacementRef.current?._insertMode === true;
      const added = placeAssetsAt(insertMode ? assets.slice(0, 1) : assets, position);
      if (insertMode && added?.[0]) splitPipeWithNode(added[0]);
      pendingPlacementRef.current = null;
      setPendingAsset(null);
      modeRef.current = "select";
      setMode("select");
    },
    [placeAssetsAt, splitPipeWithNode]
  );

  const closeEntityModal = useCallback(() => {
    setEntityModal({ open: false, type: null, position: null, mode: null, form: null, editId: null });
    if (entityModal.mode === "insert-on-edge") clearInsertTarget();
  }, [clearInsertTarget, entityModal.mode]);

  const closeInsertModal = useCallback(() => {
    setInsertModal({ open: false });
    clearInsertTarget();
  }, [clearInsertTarget]);

  const handleInsertTypeChoice = useCallback((entityType) => {
    setInsertModal({ open: false });
    setEntityModal({
      open: true,
      mode: "insert-on-edge",
      form: emptyEntityForm(entityType),
      editId: null,
      type: entityType,
      position: insertPositionRef.current || { x: 0, y: 0 },
    });
  }, []);

  const handleInsertFromLibrary = useCallback(() => {
    setInsertModal({ open: false });
    setShowLibrary(true);
    pendingPlacementRef.current = { entityType: null, _insertMode: true };
    setPendingAsset(null);
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

  // Array spec fields (e.g. pipe `lineGroupIds` multi-select) replace the
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
      let lineIds = [...form.lineGroupIds];

      if (form.newTransmissionSystemName.trim()) {
        const created = await createTransmissionSystem({ name: form.newTransmissionSystemName.trim() });
        setTransmissionSystems((s) => [...s, created]);
        systemId = created.id;
      }
      if (form.newLineName.trim()) {
        const created = await createTransmissionLine({
          name: form.newLineName.trim(),
          isBranch: form.isBranch,
          parentLineId: form.isBranch ? form.parentLineId || null : null,
          branchName: form.isBranch ? form.branchName : null,
        });
        setTransmissionLines((s) => [...s, created]);
        lineIds = [...lineIds, created.id];
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

  const handleToggleIsolation = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    if (isolationActive || cy.elements(".nb-isolate-dim").length) {
      cy.elements().removeClass("nb-isolate-dim");
      setIsolationActive(false);
      setToast("Cleared isolate.");
      return;
    }
    const selected = cy.$(":selected");
    if (!selected.length) {
      setToast("Select something to isolate first.");
      return;
    }
    const keep = selected.union(selected.edges().connectedNodes());
    const keepIds = new Set(keep.map((el) => el.id()));
    cy.elements().forEach((el) => {
      if (!keepIds.has(el.id())) el.addClass("nb-isolate-dim");
    });
    setIsolationActive(true);
    setToast("Isolated current selection.");
  }, [isolationActive]);

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
    cy.elements().removeClass("nb-isolate-dim");
    setIsolationActive(false);
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
      cy.animate({ center: { eles: el }, zoom: Math.max(cy.zoom(), 1.15) }, { duration: 240 });
      syncSelection();
    },
    [syncSelection]
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

  const isolationGroups = useMemo(() => {
    const cy = cyRef.current;
    const systemsById = new Map(transmissionSystems.map((system) => [system.id, { ...system, lines: [] }]));
    const linesById = new Map(transmissionLines.map((line) => [line.id, { ...line, pipes: [] }]));
    const ungroupedPipes = [];

    if (!cy) return { systems: Array.from(systemsById.values()), lines: Array.from(linesById.values()), ungroupedPipes };

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
        ungroupedPipes.push(pipe);
        return;
      }
      lineIds.forEach((lineId) => {
        if (!linesById.has(lineId)) linesById.set(lineId, { id: lineId, name: lineId, pipes: [] });
        const line = linesById.get(lineId);
        line.pipes.push(pipe);
        if (systemId && !line.systemId && !line.transmissionSystemId && !line.parentSystemId) {
          line.canvasSystemId = systemId;
        }
      });
    });

    linesById.forEach((line) => {
      const systemId = line.systemId || line.transmissionSystemId || line.parentSystemId || line.canvasSystemId;
      if (systemId && systemsById.has(systemId)) systemsById.get(systemId).lines.push(line);
    });

    return {
      systems: Array.from(systemsById.values()),
      lines: Array.from(linesById.values()),
      ungroupedPipes,
    };
  }, [transmissionSystems, transmissionLines, counts.edges, selectedEl]);

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
    clipboardRef.current = sel.jsons();
    setToast(`Copied ${sel.length} element${sel.length === 1 ? "" : "s"}.`);
  }, []);

  const handleCopyAll = useCallback(() => {
    const cy = cyRef.current;
    if (!cy || !cy.elements().length) return;
    clipboardRef.current = cy.elements().jsons();
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
        setNetwork((prev) => ({ ...prev, id: doc.id, name: doc.name }));
        setSaveStatus("saved");
        if (!useUpdate) {
          loadedIdRef.current = doc.id;
          navigate(`/network-builder/${doc.id}`, { replace: true });
        }
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
          restoringRef.current = true;
          cy.elements().remove();
          addGraph(cy, doc);
          restoringRef.current = false;
          cy.fit(undefined, 48);
          loadedIdRef.current = null;
          setNetwork({ id: null, name: doc.name || "", description: doc.description || "" });
          setSelectedEl(null);
          syncGraph();
          resetHistory();
          navigate("/network-builder");
          setToast("Imported canvas from file.");
        } catch {
          setToast("Couldn't parse that JSON file.");
        }
      };
      reader.readAsText(file);
    },
    [navigate, syncGraph, resetHistory]
  );

  const handleNew = useCallback(() => {
    const cy = cyRef.current;
    if (cy && cy.elements().length && !window.confirm("Start a new network? Unsaved changes will be lost.")) return;
    if (cy) cy.elements().remove();
    loadedIdRef.current = null;
    setNetwork({ id: null, name: "", description: "" });
    setSelectedEl(null);
    setModeSafe("select");
    syncGraph();
    resetHistory();
    navigate("/network-builder");
  }, [navigate, setModeSafe, syncGraph, resetHistory]);

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

  // ── Keyboard shortcuts ───────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT")) {
        if (e.key === "Escape") t.blur();
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === "Escape") setModeSafe("select");
      else if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); handleUndo(); }
      else if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) { e.preventDefault(); handleRedo(); }
      else if (mod && e.key.toLowerCase() === "c") { e.preventDefault(); handleCopySelection(); }
      else if (mod && e.key.toLowerCase() === "v") { e.preventDefault(); handlePaste(); }
      else if (mod && e.key.toLowerCase() === "a") { e.preventDefault(); handleSelectAll(); }
      else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); handleDelete(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setModeSafe, handleUndo, handleRedo, handleCopySelection, handlePaste, handleSelectAll, handleDelete]);

  // ── Toast auto-dismiss + label visibility ────────────────────────────────────
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    showLabelsRef.current = showLabels;
    const cy = cyRef.current;
    if (!cy) return;
    if (showLabels) cy.elements().removeClass("hide-labels");
    else cy.elements().addClass("hide-labels");
  }, [showLabels, cyReady]);

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
              <Btn on={() => setShowLibrary((v) => !v)} icon={IconFolder} active={showLibrary} title="Toggle the asset library panel">Library</Btn>
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
              <Btn on={() => notImplemented("Trace Delivery")} icon={IconDistributionNetwork} title="Trace delivery paths">Trace HP</Btn>
              <Btn on={handleResetView} icon={IconRefresh} title="Reset pan and zoom">Reset</Btn>
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
              <Btn on={handleClearHighlights} icon={EmptyIcon} title="Clear selection, find results, and isolate dimming">Clear Marks</Btn>
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
              <Btn on={() => { setShowInspector(true); setRightPanelTab("details"); }} icon={IconEdit2} disabled={!isPipeSel} title="Edit selected pipe">Edit</Btn>
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
                on={() => {
                  setShowInspector((v) => !v);
                  setRightPanelTab("details");
                }}
                icon={showInspector && rightPanelTab === "details" ? IconChevronRight : IconChevronLeft}
                active={showInspector && rightPanelTab === "details"}
                title="Toggle details panel"
              >
                Details
              </Btn>
            </div>
            <span className="toolbar-group__label">Panel</span>
          </div>
        </div>
      </div>
    );
  }, [
    mode, pendingEntity, network.name, counts.nodes, counts.edges, realNodeCount, saveStatus,
    selectedEl, hasSelection, isPipeSel, hasPipeSelection, hasDeletableSelection, canUndo, canRedo,
    showLabels, showGrid, showInspector, showLibrary, findOpen, isolationActive, rightPanelTab,
    setToolbar, setModeSafe, notImplemented, handleInsertEntity, handleFit, handleResetView,
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
      ? !pendingAsset
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
      : null;
  const saveStatusLabel = saveStatus === "saving" ? "Saving" : saveStatus === "saved" ? "Saved" : "Unsaved";
  const saveStatusTone = saveStatus === "saved" ? "green" : saveStatus === "saving" ? "blue" : "amber";

  return (
    <div className={`nb-page nb-page--${mode}`}>
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

      {/* Asset library */}
      {showLibrary && (
        <aside className="nb-library ns2-library">
          <div className="ns2-library-header">
            <span className="ns2-library-title">Asset Library</span>
            <button className="nb-library__close ns2-btn ns2-btn--sm" onClick={() => setShowLibrary(false)} aria-label="Hide library">×</button>
          </div>
          <NetworkPalette
            onPick={handlePick}
            placedIds={placedIds}
            armedId={Array.isArray(pendingAsset) ? pendingAsset.map((asset) => asset.id) : pendingAsset?.id}
          />
        </aside>
      )}

      <div className="nb-workspace">
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

        <div
          ref={canvasWrapRef}
          className={`nb-canvas-wrap ${showGrid ? "nb-canvas-wrap--grid" : ""}`}
          onDragOver={handleLibraryDragOver}
          onDrop={handleLibraryDrop}
        >
          <div ref={containerRef} className="nb-canvas" />

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

      {showInspector && (
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
                className={`ns2-panel-tab${rightPanelTab === "isolation" ? " ns2-panel-tab--active" : ""}`}
                onClick={() => setRightPanelTab("isolation")}
              >
                Isolation
              </button>
            </div>

            {rightPanelTab === "details" && (
              <div className="ns2-panel-body ns2-panel-body--details">
                <NetworkNodeDetails
                  selected={selectedEl}
                  systems={transmissionSystems}
                  lines={transmissionLines}
                  onLabelChange={handleLabelChange}
                  onSpecChange={handleSpecChange}
                  onSpecBooleanChange={handleSpecBooleanChange}
                  onSpecArrayChange={handleSpecArrayChange}
                  onEdgeFieldChange={handleEdgeFieldChange}
                  onActiveChange={handleEdgeActiveChange}
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

            {rightPanelTab === "isolation" && (
              <div className="ns2-panel-body ns2-panel-body--issues">
                <div className="ns2-isolation-tree">
                  <div className="ns2-isolation-tree__title">Transmission Systems</div>
                  {isolationGroups.systems.length === 0 ? (
                    <div className="ns2-panel-hint">No transmission systems loaded yet.</div>
                  ) : (
                    isolationGroups.systems.map((system) => (
                      <div className="ns2-isolation-tree__system" key={system.id}>
                        <div className="ns2-isolation-tree__row ns2-isolation-tree__row--system">
                          <button type="button" className="ns2-isolation-tree__focus" disabled>
                            <span className="ns2-isolation-tree__level">SYSTEM</span>
                            <strong>{system.name}</strong>
                            <small>{system.lines.length} lines</small>
                          </button>
                        </div>
                        <div className="ns2-isolation-tree__children">
                          {system.lines.length === 0 ? (
                            <div className="ns2-isolation-tree__empty">No canvas pipes assigned to this system.</div>
                          ) : (
                            system.lines.map((line) => (
                              <div className="ns2-isolation-tree__line" key={line.id}>
                                <div className="ns2-isolation-tree__row ns2-isolation-tree__row--line">
                                  <button type="button" className="ns2-isolation-tree__focus" disabled>
                                    <span className="ns2-isolation-tree__level">LINE</span>
                                    <strong>{line.name}</strong>
                                    <small>{line.pipes.length} segment{line.pipes.length === 1 ? "" : "s"}</small>
                                  </button>
                                </div>
                                {line.pipes.map((pipe) => (
                                  <div className="ns2-isolation-tree__row ns2-isolation-tree__row--segment" key={`${line.id}-${pipe.id}`}>
                                    <span className="ns2-isolation-tree__branch-mark">-</span>
                                    <button type="button" className="ns2-isolation-tree__focus" onClick={() => focusCanvasElement(pipe.id)}>
                                      <span className="ns2-isolation-tree__level">PIPE</span>
                                      <strong>{pipe.name}</strong>
                                      <small>{pipe.source} to {pipe.target}</small>
                                    </button>
                                  </div>
                                ))}
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    ))
                  )}

                  <div className="ns2-isolation-tree__ungrouped">
                    <div className="ns2-isolation-tree__title">Ungrouped Pipes</div>
                    {isolationGroups.ungroupedPipes.length === 0 ? (
                      <div className="ns2-isolation-tree__empty">Every canvas pipe is assigned to a line.</div>
                    ) : (
                      isolationGroups.ungroupedPipes.map((pipe) => (
                        <div className="ns2-isolation-tree__row ns2-isolation-tree__row--segment" key={pipe.id}>
                          <button type="button" className="ns2-isolation-tree__focus" onClick={() => focusCanvasElement(pipe.id)}>
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
          lines={transmissionLines}
          onCancel={() => setPipeModal({ open: false, source: null, target: null })}
          onSubmit={submitPipe}
        />
      )}
    </div>
  );
}
