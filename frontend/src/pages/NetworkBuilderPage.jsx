import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import cytoscape from "cytoscape";
import {
  Save, CopyPlus, FileUp, Download, FileSpreadsheet,
  Undo2, Redo2,
  Factory, Droplet, Gauge, Dot, Library, Spline, Split,
  MousePointer2, Search, Crosshair,
  Maximize, Frame, Tag, Grid3x3,
  AlignStartVertical, AlignCenterVertical, AlignEndVertical,
  AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal,
  AlignHorizontalDistributeCenter, AlignVerticalDistributeCenter,
  LayoutGrid, Circle, Network, Waypoints,
  StickyNote, Group,
  Bold, Italic, Underline,
  Copy, ClipboardPaste, Pencil, Trash2, PanelRight,
} from "lucide-react";
import { useLayout } from "../contexts/LayoutContext";
import { buildCyStyle, ENTITY_TYPE_LABELS } from "../cytoscape/buildCyStyle";
import { fetchNetwork, fetchNetworks, saveNetwork, updateNetwork } from "../api/networks";
import NetworkPalette from "../components/NetworkPalette";
import NetworkNodeDetails from "../components/NetworkNodeDetails";
import "./NetworkBuilderPage.css";

const rid = (p) => `${p}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const EMPTY_PIPE_FORM = { label: "", length_km: "", diameter_mm: "", material: "", status: "operational" };
const INSERT_ENTITIES = ["plant", "pump", "valve", "node"];
const ENTITY_ICONS = { plant: Factory, pump: Droplet, valve: Gauge, node: Dot };
const ANNOTATION_TYPES = ["note", "group-box"];
const NOTE_SIZES = ["small", "normal", "large", "xlarge"];

// Snapshot the asset fields we keep with a placed element so the graph renders
// offline even if the source asset later changes.
const assetMeta = (a) => ({
  region: a.region,
  cluster: a.cluster,
  asset_type: a.asset_type,
  latitude: a.latitude,
  longitude: a.longitude,
  specifications: a.specifications || {},
});

// Normalized graph <-> payload helpers (also used for import/export). Nodes keep
// their full data + position; edges keep full data. Older saves used a flat
// shape, so addGraph tolerates both.
const serializeGraph = (cy) => ({
  nodes: cy.nodes().map((n) => ({ data: { ...n.data() }, position: { ...n.position() } })),
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

export default function NetworkBuilderPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { setToolbar, setSidebar } = useLayout();

  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const modeRef = useRef("select");
  const lineSourceRef = useRef(null);
  const pendingRef = useRef(null); // asset armed for placement
  const drawAssetRef = useRef(null); // pipeline asset being laid as an edge
  const pendingEntityRef = useRef(null); // blank entity type being inserted
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
  const [drawAsset, setDrawAsset] = useState(null);
  const [pendingEntity, setPendingEntity] = useState(null);
  const [lineSource, setLineSource] = useState(null);
  const [selectedEl, setSelectedEl] = useState(null);
  const [hasSelection, setHasSelection] = useState(false);
  const [counts, setCounts] = useState({ nodes: 0, edges: 0 });
  const [placedIds, setPlacedIds] = useState(new Set());
  const [network, setNetwork] = useState({ id: null, name: "", description: "" });
  const [saveStatus, setSaveStatus] = useState("idle");
  const [showLibrary, setShowLibrary] = useState(true);
  const [savedList, setSavedList] = useState(null);
  const [toast, setToast] = useState(null);
  const [pipeModal, setPipeModal] = useState({ open: false, source: null, target: null });
  const [pipeForm, setPipeForm] = useState(EMPTY_PIPE_FORM);
  const [showLabels, setShowLabels] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [showInspector, setShowInspector] = useState(true);
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

  // Create a pipe edge (asset-backed or ad-hoc).
  const createPipeEdge = useCallback(({ source, target, asset, label, status, specs }) => {
    const cy = cyRef.current;
    if (!cy) return;
    if (asset && cy.edges().some((e) => e.data("assetId") === asset.id)) {
      setToast(`"${asset.name || asset.id}" is already laid on the canvas.`);
      return;
    }
    const name = (label && label.trim()) || (asset ? asset.name || asset.id : "Pipe");
    const meta = asset ? assetMeta(asset) : { specifications: specs || {} };
    const edge = cy.add({
      group: "edges",
      data: {
        id: rid("e"),
        source,
        target,
        kind: "pipe",
        assetId: asset ? asset.id : null,
        label: name,
        displayLabel: name,
        status: status || (asset ? asset.status : "") || "",
        meta,
      },
    });
    cy.$(":selected").unselect();
    edge.select();
  }, []);

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
        const label = type === "node" ? "" : `New ${ENTITY_TYPE_LABELS[type] || type}`;
        const node = cy.add({
          group: "nodes",
          data: { id: rid("n"), type, category: type, label, displayLabel: label, status: "", meta: { specifications: {} } },
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

      if (m === "place-asset" && pendingRef.current) {
        const asset = pendingRef.current;
        if (cy.nodes().some((n) => n.data("assetId") === asset.id)) {
          setToast(`"${asset.name || asset.id}" is already on the canvas.`);
        } else {
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
            position: { x: evt.position.x, y: evt.position.y },
          });
          cy.$(":selected").unselect();
          node.select();
        }
        pendingRef.current = null;
        setPendingAsset(null);
        backToSelect();
        return;
      }

      if (m === "draw-pipe") {
        if (drawAssetRef.current) {
          clearDrawSource();
          drawAssetRef.current = null;
          setDrawAsset(null);
          backToSelect();
        } else {
          clearDrawSource();
        }
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
      const asset = drawAssetRef.current;
      clearDrawSource();
      if (asset) {
        createPipeEdge({ source, target, asset });
        drawAssetRef.current = null;
        setDrawAsset(null);
        backToSelect();
      } else {
        setPipeForm(EMPTY_PIPE_FORM);
        setPipeModal({ open: true, source, target });
        backToSelect();
      }
    });

    // Edge tap: insert a junction that splits the pipe.
    cy.on("tap", "edge", (evt) => {
      if (modeRef.current !== "insert-on-edge") return;
      const edge = evt.target;
      const base = { ...edge.data() };
      const jid = rid("n");
      cy.batch(() => {
        cy.add({
          group: "nodes",
          data: { id: jid, type: "node", category: "node", label: "", displayLabel: "", status: "", meta: {} },
          position: { x: evt.position.x, y: evt.position.y },
        });
        edge.remove();
        cy.add({ group: "edges", data: { ...base, id: rid("e"), source: base.source, target: jid } });
        cy.add({ group: "edges", data: { ...base, id: rid("e"), source: jid, target: base.target } });
      });
      backToSelect();
    });

    cy.on("select unselect", syncSelection);
    cy.on("add", (evt) => {
      if (!showLabelsRef.current) evt.target.addClass("hide-labels");
    });
    cy.on("add remove", () => {
      syncGraph();
      syncSelection();
    });
    cy.on("add remove dragfree", scheduleCommit);

    historyRef.current = { past: [], present: cy.elements().jsons(), future: [] };
    setCyReady(true);
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [syncGraph, syncSelection, createPipeEdge, scheduleCommit]);

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

  // ── Mode / placement ─────────────────────────────────────────────────────────
  const setModeSafe = useCallback((next) => {
    const cy = cyRef.current;
    if (cy) {
      cy.$(".draw-source").removeClass("draw-source");
      lineSourceRef.current = null;
      setLineSource(null);
    }
    pendingRef.current = null;
    setPendingAsset(null);
    drawAssetRef.current = null;
    setDrawAsset(null);
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
      setToast(`Click the canvas to place a ${ENTITY_TYPE_LABELS[type] || type}. Esc to finish.`);
    },
    [setModeSafe]
  );

  const handlePick = useCallback((asset) => {
    const cy = cyRef.current;
    if (asset.category === "pipeline") {
      if (!cy || cy.nodes().filter((n) => !ANNOTATION_TYPES.includes(n.data("type"))).length < 2) {
        setToast("Place at least two assets before laying a pipeline.");
        return;
      }
      pendingRef.current = null;
      setPendingAsset(null);
      pendingEntityRef.current = null;
      setPendingEntity(null);
      drawAssetRef.current = asset;
      setDrawAsset(asset);
      lineSourceRef.current = null;
      setLineSource(null);
      modeRef.current = "draw-pipe";
      setMode("draw-pipe");
      setToast(`Click two nodes to lay "${asset.name || asset.id}".`);
      return;
    }
    drawAssetRef.current = null;
    setDrawAsset(null);
    pendingEntityRef.current = null;
    setPendingEntity(null);
    pendingRef.current = asset;
    setPendingAsset(asset);
    modeRef.current = "place-asset";
    setMode("place-asset");
    setToast(`Click the canvas to place "${asset.name || asset.id}".`);
  }, []);

  // ── Inspector edits ────────────────────────────────────────────────────────
  const handleLabelChange = useCallback(
    (value) => {
      const cy = cyRef.current;
      if (!cy || !selectedEl) return;
      const el = cy.getElementById(selectedEl.id);
      el.data("label", value);
      el.data("displayLabel", value);
      syncSelection();
    },
    [selectedEl, syncSelection]
  );

  const handleStatusChange = useCallback(
    (value) => {
      const cy = cyRef.current;
      if (!cy || !selectedEl) return;
      cy.getElementById(selectedEl.id).data("status", value);
      syncSelection();
    },
    [selectedEl, syncSelection]
  );

  const handleSpecChange = useCallback(
    (field, value) => {
      const cy = cyRef.current;
      if (!cy || !selectedEl) return;
      const el = cy.getElementById(selectedEl.id);
      const meta = { ...(el.data("meta") || {}) };
      const specs = { ...(meta.specifications || {}) };
      if (value === "" || value == null) delete specs[field];
      else specs[field] = field === "material" ? value : Number(value);
      meta.specifications = specs;
      el.data("meta", meta);
      syncSelection();
    },
    [selectedEl, syncSelection]
  );

  const handleDelete = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const sel = cy.$(":selected");
    if (!sel.length) return;
    sel.remove();
    setSelectedEl(null);
  }, []);

  const submitPipe = useCallback(() => {
    const specs = {};
    if (pipeForm.length_km !== "") specs.length_km = Number(pipeForm.length_km);
    if (pipeForm.diameter_mm !== "") specs.diameter_mm = Number(pipeForm.diameter_mm);
    if (pipeForm.material.trim()) specs.material = pipeForm.material.trim();
    createPipeEdge({
      source: pipeModal.source,
      target: pipeModal.target,
      asset: null,
      label: pipeForm.label,
      status: pipeForm.status,
      specs,
    });
    setPipeModal({ open: false, source: null, target: null });
  }, [pipeForm, pipeModal, createPipeEdge]);

  // ── View ─────────────────────────────────────────────────────────────────────
  const handleFit = useCallback(() => {
    const cy = cyRef.current;
    if (cy && cy.elements().length) cy.fit(undefined, 48);
  }, []);

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

  // Note formatting on the selected note.
  const noteFmt = useCallback(
    (field, value) => {
      const cy = cyRef.current;
      if (!cy || !selectedEl || selectedEl.type !== "note") return;
      const el = cy.getElementById(selectedEl.id);
      if (field === "sizeStep") {
        const cur = el.data("noteSize") || "normal";
        const i = Math.min(NOTE_SIZES.length - 1, Math.max(0, NOTE_SIZES.indexOf(cur) + value));
        el.data("noteSize", NOTE_SIZES[i]);
      } else if (field === "noteBold" || field === "noteItalic" || field === "noteUnderline") {
        el.data(field, el.data(field) === "true" ? "false" : "true");
      } else {
        el.data(field, value);
      }
      syncSelection();
    },
    [selectedEl, syncSelection]
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
  const refreshSaved = useCallback(() => {
    fetchNetworks()
      .then((d) => setSavedList(d.networks || []))
      .catch(() => setSavedList([]));
  }, []);

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
        refreshSaved();
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
      } catch (e) {
        setSaveStatus("error");
        setToast(e.message || "Save failed");
      }
    },
    [network, navigate, refreshSaved]
  );

  const handleSave = useCallback(() => persist(false), [persist]);
  const handleSaveAs = useCallback(() => persist(true), [persist]);

  const handleExportJSON = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const doc = { name: network.name || "network", description: network.description || "", ...serializeGraph(cy) };
    download(`${(network.name || "network").replace(/\s+/g, "_")}.json`, JSON.stringify(doc, null, 2), "application/json");
  }, [network]);

  const handleExportCSV = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const header = ["element", "id", "label", "type", "category", "status", "source", "target", "assetId", "x", "y", "length_km", "diameter_mm", "material"];
    const rows = [header.join(",")];
    cy.nodes().forEach((n) => {
      const d = n.data();
      const p = n.position();
      const s = (d.meta || {}).specifications || {};
      rows.push([
        "node", d.id, d.label, d.type, d.category, d.status, "", "", d.assetId,
        Math.round(p.x), Math.round(p.y), s.length_km, s.diameter_mm, s.material,
      ].map(csvCell).join(","));
    });
    cy.edges().forEach((e) => {
      const d = e.data();
      const s = (d.meta || {}).specifications || {};
      rows.push([
        "edge", d.id, d.label, d.kind || "pipe", "", d.status, d.source, d.target, d.assetId,
        "", "", s.length_km, s.diameter_mm, s.material,
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

  useEffect(() => {
    if (cyReady) refreshSaved();
  }, [cyReady, refreshSaved]);

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
  const isNoteSel = selectedEl?.type === "note";
  const canUndo = historyRef.current.past.length > 0;
  const canRedo = historyRef.current.future.length > 0;
  const realNodeCount = counts.nodes;

  useEffect(() => {
    const saveLabel = saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved ✓" : "Save";
    const Btn = ({ on, active, disabled, title, children, danger, primary, icon: Icon, iconOnly }) => (
      <button
        className={`toolbar-button${iconOnly ? " toolbar-button--icon" : ""}${active ? " active" : ""}${danger ? " toolbar-button--danger" : ""}${primary ? " toolbar-button--primary" : ""}`}
        onClick={on}
        disabled={disabled}
        title={title}
      >
        {Icon && <Icon size={15} strokeWidth={1.9} />}
        {(!iconOnly || !Icon) && <span>{children}</span>}
      </button>
    );

    setToolbar(
      <div className="contextual-toolbar">
        <div className="contextual-toolbar__container">
          {/* File */}
          <div className="toolbar-group">
            <div className="toolbar-group__buttons">
              <Btn on={handleSave} icon={Save} primary disabled={saveStatus === "saving"} title="Save current canvas">{saveLabel}</Btn>
              <Btn on={handleSaveAs} icon={CopyPlus} title="Save a copy under a new name">Save As</Btn>
              <Btn on={() => fileInputRef.current?.click()} icon={FileUp} title="Import canvas from JSON file">Import</Btn>
              <Btn on={handleExportJSON} icon={Download} title="Export canvas as JSON">Export JSON</Btn>
              <Btn on={handleExportCSV} icon={FileSpreadsheet} title="Export nodes & edges as CSV">Export CSV</Btn>
            </div>
            <span className="toolbar-group__label">File</span>
          </div>

          {/* History */}
          <div className="toolbar-group">
            <div className="toolbar-group__buttons">
              <Btn on={handleUndo} icon={Undo2} disabled={!canUndo} title="Undo (Ctrl/Cmd+Z)">Undo</Btn>
              <Btn on={handleRedo} icon={Redo2} disabled={!canRedo} title="Redo (Ctrl/Cmd+Shift+Z)">Redo</Btn>
            </div>
            <span className="toolbar-group__label">History</span>
          </div>

          {/* Insert */}
          <div className="toolbar-group">
            <div className="toolbar-group__buttons">
              {INSERT_ENTITIES.map((type) => (
                <Btn
                  key={type}
                  icon={ENTITY_ICONS[type]}
                  on={() => (mode === "place-entity" && pendingEntity === type ? setModeSafe("select") : handleInsertEntity(type))}
                  active={mode === "place-entity" && pendingEntity === type}
                  title={`Insert ${ENTITY_TYPE_LABELS[type] || type}`}
                >
                  {ENTITY_TYPE_LABELS[type] || type}
                </Btn>
              ))}
              <Btn on={() => setShowLibrary((v) => !v)} icon={Library} active={showLibrary} title="Toggle the asset library panel">Asset Library</Btn>
              <Btn
                on={() => setModeSafe(mode === "draw-pipe" ? "select" : "draw-pipe")}
                icon={Spline}
                active={mode === "draw-pipe"}
                disabled={realNodeCount < 2}
                title="Draw a pipe (click source then target)"
              >
                Pipe
              </Btn>
              <Btn
                on={() => setModeSafe(mode === "insert-on-edge" ? "select" : "insert-on-edge")}
                icon={Split}
                active={mode === "insert-on-edge"}
                disabled={counts.edges < 1}
                title="Insert a junction on a pipe (splits it)"
              >
                Insert on Pipe
              </Btn>
            </div>
            <span className="toolbar-group__label">Insert</span>
          </div>

          {/* Select */}
          <div className="toolbar-group">
            <div className="toolbar-group__buttons">
              <Btn on={handleSelectAll} icon={MousePointer2} title="Select all (Ctrl/Cmd+A)">Select All</Btn>
              <Btn on={() => setFindOpen((v) => !v)} icon={Search} active={findOpen} title="Find assets on the canvas">Find Asset</Btn>
              <Btn on={handleZoomToSelection} icon={Crosshair} title="Zoom to selection (or fit all)">Zoom to Sel</Btn>
            </div>
            <span className="toolbar-group__label">Select</span>
          </div>

          {/* View */}
          <div className="toolbar-group">
            <div className="toolbar-group__buttons">
              <Btn on={handleFit} icon={Maximize} title="Fit to screen">Fit</Btn>
              <Btn on={() => setModeSafe(mode === "area-zoom" ? "select" : "area-zoom")} icon={Frame} active={mode === "area-zoom"} title="Drag a rectangle to zoom">Area Zoom</Btn>
              <Btn on={() => setShowLabels((v) => !v)} icon={Tag} active={showLabels} title="Toggle labels">Labels</Btn>
              <Btn on={() => setShowGrid((v) => !v)} icon={Grid3x3} active={showGrid} title="Toggle grid">Grid</Btn>
            </div>
            <span className="toolbar-group__label">View</span>
          </div>

          {/* Arrange */}
          <div className="toolbar-group">
            <div className="toolbar-group__buttons">
              <Btn iconOnly icon={AlignStartVertical} on={() => arrange("left")} title="Align left" />
              <Btn iconOnly icon={AlignCenterVertical} on={() => arrange("centerh")} title="Center horizontally" />
              <Btn iconOnly icon={AlignEndVertical} on={() => arrange("right")} title="Align right" />
              <Btn iconOnly icon={AlignStartHorizontal} on={() => arrange("top")} title="Align top" />
              <Btn iconOnly icon={AlignCenterHorizontal} on={() => arrange("centerv")} title="Center vertically" />
              <Btn iconOnly icon={AlignEndHorizontal} on={() => arrange("bottom")} title="Align bottom" />
              <Btn iconOnly icon={AlignHorizontalDistributeCenter} on={() => arrange("disth")} title="Distribute horizontally" />
              <Btn iconOnly icon={AlignVerticalDistributeCenter} on={() => arrange("distv")} title="Distribute vertically" />
            </div>
            <span className="toolbar-group__label">Arrange</span>
          </div>

          {/* Layout */}
          <div className="toolbar-group">
            <div className="toolbar-group__buttons">
              <Btn on={() => runLayout("grid")} icon={LayoutGrid} title="Grid layout">Grid</Btn>
              <Btn on={() => runLayout("circle")} icon={Circle} title="Circle layout">Circle</Btn>
              <Btn on={() => runLayout("tree")} icon={Network} title="Tree layout">Tree</Btn>
              <Btn on={() => runLayout("force")} icon={Waypoints} title="Force-directed layout">Force</Btn>
            </div>
            <span className="toolbar-group__label">Layout</span>
          </div>

          {/* Annotate */}
          <div className="toolbar-group">
            <div className="toolbar-group__buttons">
              <Btn on={() => setModeSafe(mode === "place-note" ? "select" : "place-note")} icon={StickyNote} active={mode === "place-note"} title="Place a sticky note">Add Note</Btn>
              <Btn on={handleGroupBox} icon={Group} title="Group box around selected nodes">Group Box</Btn>
            </div>
            <span className="toolbar-group__label">Annotate</span>
          </div>

          {/* Note Format */}
          <div className="toolbar-group toolbar-group--note">
            <div className="toolbar-group__buttons toolbar-group__buttons--note">
              <select
                className="toolbar-select"
                disabled={!isNoteSel}
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
                disabled={!isNoteSel}
                value={selectedEl?.noteSize || "normal"}
                onChange={(e) => noteFmt("noteSize", e.target.value)}
                title="Size"
              >
                {NOTE_SIZES.map((s) => (
                  <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
              <Btn iconOnly disabled={!isNoteSel} on={() => noteFmt("sizeStep", -1)} title="Decrease size">A↓</Btn>
              <Btn iconOnly disabled={!isNoteSel} on={() => noteFmt("sizeStep", 1)} title="Increase size">A↑</Btn>
              <Btn iconOnly icon={Bold} disabled={!isNoteSel} active={selectedEl?.noteBold === "true"} on={() => noteFmt("noteBold")} title="Bold" />
              <Btn iconOnly icon={Italic} disabled={!isNoteSel} active={selectedEl?.noteItalic === "true"} on={() => noteFmt("noteItalic")} title="Italic" />
              <Btn iconOnly icon={Underline} disabled={!isNoteSel} active={selectedEl?.noteUnderline === "true"} on={() => noteFmt("noteUnderline")} title="Underline" />
            </div>
            <span className="toolbar-group__label">Note Format</span>
          </div>

          {/* Edit */}
          <div className="toolbar-group">
            <div className="toolbar-group__buttons">
              <Btn on={handleCopySelection} icon={Copy} disabled={!hasSelection} title="Copy selection (Ctrl/Cmd+C)">Copy Sel</Btn>
              <Btn on={handleCopyAll} icon={CopyPlus} title="Copy all">Copy All</Btn>
              <Btn on={handlePaste} icon={ClipboardPaste} title="Paste (Ctrl/Cmd+V)">Paste</Btn>
              <Btn on={() => setShowInspector(true)} icon={Pencil} disabled={!selectedEl} title="Edit selected element">Edit</Btn>
              <Btn danger icon={Trash2} on={handleDelete} disabled={!hasSelection} title="Delete selected (Del)">Delete</Btn>
              <Btn on={() => setShowInspector((v) => !v)} icon={PanelRight} active={showInspector} title="Toggle details panel">Details</Btn>
            </div>
            <span className="toolbar-group__label">Edit</span>
          </div>

          <div className="toolbar-metadata">
            <span className="toolbar-metadata__item"><span className="toolbar-metadata__label">{realNodeCount} nodes</span></span>
            <span className="toolbar-metadata__item"><span className="toolbar-metadata__label">{counts.edges} pipes</span></span>
          </div>
        </div>
      </div>
    );
  }, [
    mode, pendingEntity, network.name, counts.nodes, counts.edges, realNodeCount, saveStatus,
    selectedEl, hasSelection, isNoteSel, canUndo, canRedo,
    showLabels, showGrid, showInspector, showLibrary, findOpen,
    setToolbar, setModeSafe, handleInsertEntity, handleFit, handleZoomToSelection, handleSelectAll,
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
      ? `Placing "${pendingAsset?.name || pendingAsset?.id}" — click the canvas`
      : mode === "place-entity"
      ? `Inserting ${ENTITY_TYPE_LABELS[pendingEntity] || pendingEntity} — click the canvas (Esc to finish)`
      : mode === "place-note"
      ? "Click the canvas to drop a note"
      : mode === "insert-on-edge"
      ? "Click a pipe to insert a junction that splits it"
      : mode === "area-zoom"
      ? "Drag a rectangle to zoom into that region"
      : mode === "draw-pipe"
      ? drawAsset
        ? lineSource
          ? `Laying "${drawAsset.name || drawAsset.id}" — click the target node`
          : `Laying "${drawAsset.name || drawAsset.id}" — click the source node`
        : lineSource
        ? "Draw Pipe — click the target node"
        : "Draw Pipe — click the source node"
      : null;

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
        <button className="nb-rail__new" onClick={handleNew}>
          <span aria-hidden="true">+</span> New Network
        </button>
        <div className="nb-rail__head">Saved</div>
        <div className="nb-rail__list">
          {!savedList && <div className="nb-rail__empty">Loading…</div>}
          {savedList && savedList.length === 0 && <div className="nb-rail__empty">No saved networks yet.</div>}
          {(savedList || []).map((n) => (
            <button
              key={n.id}
              className={`nb-rail__item ${network.id === n.id ? "is-active" : ""}`}
              onClick={() => navigate(`/network-builder/${n.id}`)}
              title={n.name}
            >
              <span className="nb-rail__name">{n.name}</span>
              <span className="nb-rail__meta">{n.nodeCount} nodes · {n.edgeCount} pipes</span>
            </button>
          ))}
        </div>
      </aside>

      {/* Asset library */}
      {showLibrary && (
        <aside className="nb-library">
          <div className="nb-library__head">
            <span className="nb-library__title">Asset Library</span>
            <button className="nb-library__close" onClick={() => setShowLibrary(false)} aria-label="Hide library">×</button>
          </div>
          <NetworkPalette onPick={handlePick} placedIds={placedIds} armedId={pendingAsset?.id || drawAsset?.id} />
        </aside>
      )}

      <div className="nb-canvas-wrap">
        <div ref={containerRef} className={`nb-canvas ${showGrid ? "nb-canvas--grid" : ""}`} />

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

      {showInspector && (
        <aside className="nb-inspector">
          <NetworkNodeDetails
            selected={selectedEl}
            onLabelChange={handleLabelChange}
            onStatusChange={handleStatusChange}
            onSpecChange={handleSpecChange}
            onDelete={handleDelete}
          />
        </aside>
      )}

      {pipeModal.open && (
        <div className="af__overlay" onMouseDown={() => setPipeModal({ open: false, source: null, target: null })}>
          <div className="af__modal nb-pipe-modal" onMouseDown={(e) => e.stopPropagation()}>
            <header className="af__head">
              <h2 className="af__title">Pipeline variables</h2>
              <button className="af__close" onClick={() => setPipeModal({ open: false, source: null, target: null })} aria-label="Close">×</button>
            </header>
            <form className="af__body" onSubmit={(e) => { e.preventDefault(); submitPipe(); }}>
              <div className="af__grid">
                <label className="af__field">
                  Name / label
                  <input type="text" value={pipeForm.label} placeholder="e.g. West trunk main"
                    onChange={(e) => setPipeForm((f) => ({ ...f, label: e.target.value }))} />
                </label>
                <label className="af__field">
                  Status
                  <select value={pipeForm.status} onChange={(e) => setPipeForm((f) => ({ ...f, status: e.target.value }))}>
                    <option value="operational">Operational</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="under_construction">Under construction</option>
                    <option value="planned">Planned</option>
                    <option value="decommissioned">Decommissioned</option>
                  </select>
                </label>
                <label className="af__field">
                  Length (km)
                  <input type="number" step="any" value={pipeForm.length_km}
                    onChange={(e) => setPipeForm((f) => ({ ...f, length_km: e.target.value }))} />
                </label>
                <label className="af__field">
                  Diameter (mm)
                  <input type="number" step="any" value={pipeForm.diameter_mm}
                    onChange={(e) => setPipeForm((f) => ({ ...f, diameter_mm: e.target.value }))} />
                </label>
                <label className="af__field">
                  Material
                  <input type="text" value={pipeForm.material} placeholder="e.g. Ductile iron"
                    onChange={(e) => setPipeForm((f) => ({ ...f, material: e.target.value }))} />
                </label>
              </div>
              <div className="af__footer">
                <button type="button" className="af__btn af__btn--ghost" onClick={() => setPipeModal({ open: false, source: null, target: null })}>Cancel</button>
                <button type="submit" className="af__btn af__btn--primary">Add pipe</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
