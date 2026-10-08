// Cytoscape stylesheet + entity constants for the Network Builder canvas.
// Lifted and trimmed from the reference NetworkSimulation2Page.js (entity
// constants ~132-189, buildCyStyle ~632-1019) — simulation selectors and the
// base64-SVG card-icon pipeline are dropped. Colors are
// restyled toward this app's light theme (see MetricDashboard.css / NetworkBuilderPage.css).

// This app's asset categories map straight onto cytoscape node "type".
// `node` is the internal junction type (a small dot, not a DB asset).
export const ENTITY_TYPE_COLORS = {
  plant: "#3b82f6",
  pump: "#ec4899",
  tank: "#6fa300",
  handover_point: "#f59e0b",
  node: "#6b7280",
  stp: "#a855f7",
  filling_station: "#f97316",
};

export const ENTITY_TYPE_ABBREVIATIONS = {
  plant: "PL",
  pump: "PU",
  tank: "TK",
  handover_point: "HP",
  node: "ND",
};

export const ENTITY_TYPE_LABELS = {
  plant: "Plant",
  pump: "Pump Station",
  tank: "Tank",
  handover_point: "Handover Point",
  node: "Junction",
};

// Category order for the palette + any grouped UI.
export const CATEGORY_ORDER = ["plant", "pump", "tank", "handover_point"];

// Statuses that should read as "not in service" → dashed node border.
const INACTIVE_STATUSES = new Set(["decommissioned", "inactive"]);

export const isInactiveStatus = (status) => INACTIVE_STATUSES.has(status);

// Canvas palettes per theme. Cytoscape paints to <canvas> and cannot resolve
// CSS custom properties, so the Control Room tokens (index.css) are mirrored
// here as solid colours. The light palette is the original canvas look.
export const CY_PALETTES = {
  light: {
    surface: "#ffffff",
    text: "#111827",
    edge: "#5b7ca3",
    edgeLabel: "#8aa5b8",
    junction: "#6b7280",
    accent: "#1d4f91",
    select: "#0969da",
    ok: "#22c55e",
    okStrong: "#6fa300",
    amber: "#f59e0b",
    purple: "#7c3aed",
    red: "#c11b1b",
    neutral: "#94a3b8",
    idle: "#cbd5e1",
    full: "#0ea5e9",
    edgeIdle: "#6b7280",
    overrideBg: "#fdeee7",
    noteBg: "#fef9e7",
    noteBorder: "#c4380f",
    noteText: "#78350f",
    labelBorder: "#d6dee6",
  },
  dark: {
    surface: "#0b2137",
    text: "#eef6fb",
    edge: "#7d9cb3",
    edgeLabel: "#7d9cb3",
    junction: "#7d9cb3",
    accent: "#00a3e0",
    select: "#6fd0f5",
    ok: "#97d700",
    okStrong: "#b4e34d",
    amber: "#fbbf24",
    purple: "#c084fc",
    red: "#f5908f",
    neutral: "#5c7d95",
    idle: "#21496f",
    full: "#38bdf8",
    edgeIdle: "#5c7d95",
    overrideBg: "#3a2216",
    noteBg: "#2a2410",
    noteBorder: "#fa4616",
    noteText: "#ffd166",
    labelBorder: "#21496f",
  },
};

// The app's own typeface (index.css), so canvas labels read like the panels.
const APP_FONT = '"Wtt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

/** Palette for the theme currently applied to <html> (light outside a browser). */
export function currentCyPalette() {
  if (typeof document === "undefined") return CY_PALETTES.light;
  return document.documentElement.dataset.theme === "light" ? CY_PALETTES.light : CY_PALETTES.dark;
}

/**
 * Re-apply the stylesheet whenever ThemeContext switches the theme.
 * Returns an unsubscribe function; call it before destroying `cy`.
 */
export function bindCyTheme(cy, build = buildCyStyle) {
  if (typeof window === "undefined" || !cy) return () => {};
  const handler = () => {
    if (!cy.destroyed()) cy.style(build());
  };
  window.addEventListener("widispatch:themechange", handler);
  return () => window.removeEventListener("widispatch:themechange", handler);
}

export function buildCyStyle(palette = currentCyPalette()) {
  const P = palette;
  const ACCENT = P.accent;
  return [
    // ── Entity symbol ────────────────────────────────────────────────────
    // An asset is a 44px map symbol, not a card: white body, a generated SVG
    // behind it (tinted disc + glyph + capacity dot, see entitySymbol.js), a
    // border reporting lifecycle status, and the label underneath.
    {
      selector: "node",
      style: {
        shape: "ellipse",
        width: 44,
        height: 44,
        "background-color": P.surface,
        "background-opacity": 1,
        "background-image": "data(cardIcon)",
        "background-fit": "none",
        "background-width": 44,
        "background-height": 44,
        "background-position-x": "0px",
        "background-position-y": "0px",
        "background-clip": "node",
        "border-width": 3,
        "border-color": "data(cardStatusColor)",
        "border-style": "solid",
        label: "data(displayLabel)",
        "text-valign": "bottom",
        "text-halign": "center",
        "text-margin-y": 6,
        color: P.text,
        "font-size": 10,
        "font-family": APP_FONT,
        "font-weight": "bold",
        "line-height": 1.25,
        "text-wrap": "wrap",
        "text-max-width": 130,
        // Break between words only; "anywhere" split names mid-word.
        "text-overflow-wrap": "whitespace",
        // Label sits on a bordered pill, like the tags in the side panels,
        // and stays legible where it crosses a pipe underneath it.
        "text-background-color": P.surface,
        "text-background-opacity": 0.94,
        "text-background-padding": 3,
        "text-background-shape": "roundrectangle",
        "text-border-width": 1,
        "text-border-color": P.labelBorder,
        "text-border-opacity": 1,
      },
    },
    // Inactive assets read as "not in service" via a dashed border.
    {
      selector: 'node[status="decommissioned"], node[status="inactive"]',
      style: { "border-style": "dashed" },
    },
    // Box symbols (View → Symbol): rounded square body instead of a disc.
    { selector: 'node[symbolShape="box"]', style: { shape: "round-rectangle" } },
    // Labels toggle (View → Labels).
    { selector: "node.hide-labels", style: { label: "" } },
    { selector: "edge.hide-labels", style: { label: "" } },
    // Junction node — a small plain dot, no symbol and no label.
    {
      selector: 'node[type="node"]',
      style: {
        shape: "ellipse",
        width: 16,
        height: 16,
        "background-color": P.surface,
        "background-image": "none",
        label: "",
        "text-margin-y": 0,
        "border-width": 3,
        "border-color": P.junction,
      },
    },
    // ── Level of detail ──────────────────────────────────────────────────
    // Applied by the canvas on zoom (symbol nodes only — junctions, notes and
    // group boxes keep their own geometry). Zoomed out the symbols shrink and
    // then drop their labels, so a large network stays readable instead of
    // turning into a wall of overlapping text.
    {
      selector: "node.lod-mid",
      style: {
        width: 36,
        height: 36,
        "background-width": 36,
        "background-height": 36,
        "border-width": 2.5,
        "font-size": 9,
        "text-max-width": 96,
      },
    },
    {
      selector: "node.lod-far",
      style: {
        label: "",
        width: 30,
        height: 30,
        "background-width": 30,
        "background-height": 30,
        "border-width": 2,
      },
    },
    // ── Pipe / edge ──────────────────────────────────────────────────────
    {
      selector: "edge",
      style: {
        width: 2.5,
        "line-color": P.edge,
        "line-cap": "round",
        "target-arrow-color": P.edge,
        "target-arrow-shape": "triangle",
        "arrow-scale": 0.85,
        "curve-style": "bezier",
        label: "data(displayLabel)",
        "font-size": 9,
        "font-family": APP_FONT,
        color: P.edgeLabel,
        "text-rotation": "autorotate",
        "text-background-color": P.surface,
        "text-background-opacity": 0.94,
        "text-background-padding": 2,
        "text-background-shape": "roundrectangle",
        "text-border-width": 1,
        "text-border-color": P.labelBorder,
        "text-border-opacity": 1,
      },
    },
    // Bent pipes: cytoscape-edge-editing stores the bends as weight/distance
    // pairs on the edge, and `segments` is what makes them actually draw.
    {
      selector: "edge.edgebendediting-hasbendpoints",
      style: {
        "curve-style": "segments",
        "segment-weights": "data(cyedgebendeditingWeights)",
        "segment-distances": "data(cyedgebendeditingDistances)",
        // Bends are stored relative to the two node *centres*, which is what
        // the geometry in canvasGeometry.js assumes. Without this, Cytoscape
        // measures them from the node borders instead, so a bend drifts as
        // soon as either node moves and changes the edge's angle. The editing
        // plugin installs the same rule for itself; the Simulation Canvas
        // renders saved bends without the plugin and relies on this one.
        "edge-distances": "node-position",
      },
    },
    // Pipes out of service read as dashed lines.
    {
      selector: 'edge[status="decommissioned"], edge[status="inactive"]',
      style: { "line-style": "dashed" },
    },
    // ── Simulation overlay ───────────────────────────────────────────────────
    // Applied by cytoscape/simulationOverlay.js on the Simulation Canvas tab.
    // Bucket classes carry colour; width is data-driven because it varies
    // continuously with utilisation. Only line-dash-offset is written inline,
    // since it changes ~16x/second to animate flow.
    //
    // This block must sit before node:selected / edge:selected / the trace
    // block below: Cytoscape resolves competing rules by stylesheet order
    // (last match wins per property), and selection + trace styling must win
    // over the sim overlay so the detail panel, handleFocus and trace/isolate
    // remain visibly effective on a painted canvas.
    { selector: "edge[simWidth]", style: { width: "data(simWidth)" } },
    {
      selector: "edge.sim-edge--idle",
      style: { "line-color": P.edgeIdle, "target-arrow-color": P.edgeIdle, "line-style": "solid", opacity: 0.55 },
    },
    {
      selector: "edge.sim-edge--low",
      style: {
        "line-color": P.ok, "target-arrow-color": P.ok,
        "line-style": "dashed", "line-dash-pattern": [10, 6],
      },
    },
    // Uncapacitated pipes get their own dash pattern (shorter, matching the
    // legend swatch) — same colour as "low" would be misleading here since
    // edgeState() deliberately buckets these apart from actual utilisation.
    {
      selector: "edge.sim-edge--unconstrained",
      style: {
        "line-color": P.ok, "target-arrow-color": P.ok,
        "line-style": "dashed", "line-dash-pattern": [4, 4],
      },
    },
    {
      selector: "edge.sim-edge--medium",
      style: {
        "line-color": P.amber, "target-arrow-color": P.amber,
        "line-style": "dashed", "line-dash-pattern": [10, 6],
      },
    },
    {
      selector: "edge.sim-edge--high",
      style: {
        "line-color": P.purple, "target-arrow-color": P.purple,
        "line-style": "dashed", "line-dash-pattern": [10, 6],
      },
    },
    {
      selector: "edge.sim-edge--bottleneck",
      style: {
        "line-color": P.red, "target-arrow-color": P.red,
        "line-style": "dashed", "line-dash-pattern": [10, 6], "z-index": 950,
      },
    },
    // Plants: how hard the solver ran them.
    { selector: "node.sim-plant--idle", style: { "border-color": P.idle, "border-width": 2 } },
    { selector: "node.sim-plant--partial", style: { "border-color": P.ok, "border-width": 3 } },
    { selector: "node.sim-plant--at-capacity", style: { "border-color": P.purple, "border-width": 4 } },
    {
      selector: "node.sim-plant--binding",
      style: {
        "border-color": P.red, "border-width": 4,
        "overlay-color": P.red, "overlay-padding": 5, "overlay-opacity": 0.12,
      },
    },
    {
      selector: "node.sim-plant--no-capacity",
      style: { "border-color": P.neutral, "border-width": 3, "border-style": "dotted", opacity: 0.7 },
    },
    // City gates: whether they were served.
    { selector: "node.sim-gate--no-demand", style: { "border-color": P.idle, "border-width": 2, opacity: 0.7 } },
    { selector: "node.sim-gate--met", style: { "border-color": P.ok, "border-width": 3 } },
    { selector: "node.sim-gate--adjusted", style: { "border-color": P.amber, "border-width": 4 } },
    {
      selector: "node.sim-gate--shortfall",
      style: {
        "border-color": P.red, "border-width": 4,
        "overlay-color": P.red, "overlay-padding": 5, "overlay-opacity": 0.12,
      },
    },
    // Pump stations.
    { selector: "node.sim-pump--normal", style: { "border-color": P.idle, "border-width": 2 } },
    { selector: "node.sim-pump--unconstrained", style: { "border-color": P.neutral, "border-width": 2, "border-style": "dotted" } },
    { selector: "node.sim-pump--offline", style: { "border-color": P.neutral, "border-width": 3, "border-style": "dashed", opacity: 0.6 } },
    {
      selector: "node.sim-pump--binding",
      style: {
        "border-color": P.red, "border-width": 4,
        "overlay-color": P.red, "overlay-padding": 5, "overlay-opacity": 0.12,
      },
    },
    // Storage tanks: end-of-day inventory relative to reserve and maximum.
    { selector: "node.sim-tank--empty", style: { "border-color": P.red, "border-width": 4 } },
    { selector: "node.sim-tank--reserve", style: { "border-color": P.amber, "border-width": 4 } },
    { selector: "node.sim-tank--available", style: { "border-color": P.ok, "border-width": 3 } },
    { selector: "node.sim-tank--full", style: { "border-color": P.full, "border-width": 4 } },
    // An element the displayed run never saw, because the canvas was edited
    // after the plan was produced.
    { selector: "edge.sim-stale", style: { opacity: 0.25, "line-style": "dotted", width: 1.5 } },
    { selector: "node.sim-stale", style: { opacity: 0.25, "border-style": "dotted" } },
    // A per-run override is operator input, not portal data — always visible.
    { selector: "node.sim-overridden", style: { "background-color": P.overrideBg } },
    // Simulation View → Bottlenecks: binding elements stand out, the rest dims.
    { selector: ".sim-focus-dim", style: { opacity: 0.15 } },
    { selector: "node.sim-focus", style: { "border-width": 5, "z-index": 950 } },
    { selector: "edge.sim-focus", style: { width: 6, "z-index": 950 } },
    // Show Gap: binding pipes upstream of a short delivery point, and the
    // plants upstream that still had spare capacity.
    {
      selector: "edge.sim-gap-binding",
      style: { "line-color": P.red, "target-arrow-color": P.red, width: 6, "z-index": 960, "line-style": "solid" },
    },
    { selector: "node.sim-gap-spare", style: { "border-color": P.ok, "border-width": 6, "z-index": 960 } },
    {
      selector: "node.sim-gap-root",
      style: { "border-color": P.red, "border-width": 6, "overlay-color": P.red, "overlay-opacity": 0.12, "overlay-padding": 6 },
    },
    // Selection highlight.
    {
      selector: "node:selected",
      style: {
        "border-color": P.select,
        "border-width": 3.5,
        // A halo behind the symbol (like the accent tint on selected rows in
        // the panels) rather than an overlay that would wash out the glyph.
        "underlay-color": P.select,
        "underlay-padding": 6,
        "underlay-opacity": 0.22,
        "underlay-shape": "ellipse",
        "text-border-color": P.select,
      },
    },
    { selector: 'node[symbolShape="box"]:selected', style: { "underlay-shape": "round-rectangle" } },
    // Pressed feedback in the accent colour rather than Cytoscape's grey.
    {
      selector: "node:active, edge:active",
      style: { "overlay-color": P.select, "overlay-opacity": 0.1, "overlay-padding": 4 },
    },
    // Isolation mode hides everything outside the focused selection/scope.
    {
      selector: ".nb-isolate-hidden",
      style: { display: "none" },
    },
    // Category visibility filter (right panel) — see cytoscape/assetFilter.js.
    {
      selector: ".filter-hidden",
      style: { display: "none" },
    },
    // First node picked while drawing a pipe.
    {
      selector: "node.draw-source",
      style: {
        "border-color": ACCENT,
        "border-width": 4,
        "overlay-color": ACCENT,
        "overlay-opacity": 0.18,
      },
    },
    // ── Sticky notes (Annotate → Add Note) ───────────────────────────────
    {
      selector: 'node[type="note"]',
      style: {
        shape: "round-rectangle",
        width: 200,
        height: 90,
        "background-color": P.noteBg,
        "background-opacity": 1,
        // The note's text is drawn by its HTML overlay editor (rich text).
        "text-opacity": 0,
        "background-image": "none",
        "border-width": 1,
        "border-style": "dashed",
        "border-color": P.noteBorder,
        label: "data(displayLabel)",
        "text-valign": "top",
        "text-halign": "center",
        "text-margin-x": 0,
        color: P.noteText,
        "font-size": 11,
        // The base rule styles an entity label sitting under a symbol; inside
        // a note the text is the content, and bold is a per-note toggle.
        "font-weight": "normal",
        "text-background-opacity": 0,
        "text-wrap": "wrap",
        "text-max-width": 180,
        "text-margin-y": 10,
        "z-index": 10,
      },
    },
    { selector: 'node[type="note"][boxWidth]', style: { width: "data(boxWidth)" } },
    { selector: 'node[type="note"][boxHeight]', style: { height: "data(boxHeight)" } },
    { selector: 'node[type="note"][noteFont="serif"]', style: { "font-family": 'Georgia, "Times New Roman", serif' } },
    { selector: 'node[type="note"][noteFont="mono"]', style: { "font-family": '"SFMono-Regular", Consolas, monospace' } },
    { selector: 'node[type="note"][noteSize="small"]', style: { "font-size": 10 } },
    { selector: 'node[type="note"][noteSize="large"]', style: { "font-size": 13 } },
    { selector: 'node[type="note"][noteSize="xlarge"]', style: { "font-size": 15 } },
    { selector: 'node[type="note"][noteItalic="true"]', style: { "font-style": "italic" } },
    { selector: 'node[type="note"][noteBold="true"]', style: { "font-weight": "bold" } },
    // ── Group box (Annotate → Group Box) ─────────────────────────────────
    {
      selector: 'node[type="group-box"]',
      style: {
        shape: "round-rectangle",
        width: 240,
        height: 160,
        "background-color": ACCENT,
        "background-opacity": 0.05,
        "background-image": "none",
        "border-width": 1,
        "border-style": "dashed",
        "border-color": ACCENT,
        "border-opacity": 0.45,
        label: "data(displayLabel)",
        "text-valign": "top",
        "text-halign": "center",
        "text-margin-x": 0,
        color: ACCENT,
        "font-size": 11,
        "font-weight": "normal",
        "text-background-opacity": 0,
        "z-index": 0,
      },
    },
    { selector: 'node[type="group-box"][boxWidth]', style: { width: "data(boxWidth)" } },
    { selector: 'node[type="group-box"][boxHeight]', style: { height: "data(boxHeight)" } },
    {
      selector: "edge:selected",
      style: {
        "line-color": ACCENT,
        "target-arrow-color": ACCENT,
        width: 3.5,
        "underlay-color": ACCENT,
        "underlay-padding": 4,
        "underlay-opacity": 0.2,
        "text-border-color": ACCENT,
        color: P.text,
      },
    },
    // Pipe whose end is being moved (right-click → Change Source/Destination).
    {
      selector: "edge.reconnect-source",
      style: {
        "line-color": P.amber,
        "target-arrow-color": P.amber,
        "line-style": "dashed",
        width: 4,
        "overlay-color": P.amber,
        "overlay-padding": 6,
        "overlay-opacity": 0.14,
      },
    },
    {
      selector: "edge.insert-target",
      style: {
        "line-color": P.amber,
        "target-arrow-color": P.amber,
        width: 4,
        "overlay-color": P.amber,
        "overlay-padding": 6,
        "overlay-opacity": 0.18,
      },
    },
    {
      selector: "node.trace-root",
      style: {
        "border-color": P.select,
        "border-width": 6,
        "overlay-color": P.select,
        "overlay-padding": 6,
        "overlay-opacity": 0.2,
        "z-index": 1000,
      },
    },
    {
      selector: "node.trace-up",
      style: {
        "border-color": ACCENT,
        "border-width": 4,
        "z-index": 900,
      },
    },
    {
      selector: "node.trace-down",
      style: {
        "border-color": P.okStrong,
        "border-width": 4,
        "z-index": 900,
      },
    },
    {
      selector: "edge.trace-up-edge",
      style: {
        "line-color": ACCENT,
        "target-arrow-color": ACCENT,
        "source-arrow-color": ACCENT,
        width: 5,
        opacity: 1,
        "z-index": 900,
      },
    },
    {
      selector: "edge.trace-down-edge",
      style: {
        "line-color": P.okStrong,
        "target-arrow-color": P.okStrong,
        "source-arrow-color": P.okStrong,
        width: 5,
        opacity: 1,
        "z-index": 900,
      },
    },
    // Reached by more than one traced root, or both upstream and downstream.
    {
      selector: "node.trace-shared",
      style: { "border-color": P.purple, "border-width": 4, "z-index": 900 },
    },
    {
      selector: "edge.trace-shared-edge",
      style: {
        "line-color": P.purple,
        "target-arrow-color": P.purple,
        "source-arrow-color": P.purple,
        width: 5,
        opacity: 1,
        "z-index": 900,
      },
    },
    {
      selector: ".trace-dim",
      style: {
        opacity: 0.1,
      },
    },
  ];
}
