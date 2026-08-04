// Cytoscape stylesheet + entity constants for the Network Builder canvas.
// Lifted and trimmed from the reference NetworkSimulation2Page.js (entity
// constants ~132-189, buildCyStyle ~632-1019) — simulation selectors and the
// base64-SVG card-icon pipeline are dropped. Colors are
// restyled toward this app's light theme (see MetricDashboard.css / NetworkBuilderPage.css).

// This app's asset categories map straight onto cytoscape node "type".
// `node` is the internal junction type (a small dot, not a DB asset).
export const ENTITY_TYPE_COLORS = {
  plant: "#567cff",
  pump: "#ec4899",
  tank: "#0ea5e9",
  handover_point: "#14b8a6",
  node: "#8b93a7",
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

const ACCENT = "#1a4a8a";

export function buildCyStyle() {
  return [
    // ── Base asset card ──────────────────────────────────────────────────
    // A white card body with a status-tinted icon band on the left (supplied
    // as a data-URI SVG via data(cardIcon)) and the label in the right region.
    {
      selector: "node",
      style: {
        shape: "round-rectangle",
        width: 186,
        height: 54,
        "background-color": "#ffffff",
        "background-opacity": 1,
        "background-image": "data(cardIcon)",
        "background-fit": "none",
        "background-width": 54,
        "background-height": 54,
        "background-position-x": "0px",
        "background-position-y": "0px",
        "background-clip": "node",
        "border-width": 1.5,
        "border-color": "#cbd5e1",
        "border-style": "solid",
        label: "data(displayLabel)",
        "text-valign": "center",
        "text-halign": "center",
        // Shift the label into the right region (past the 54px band).
        "text-margin-x": 28,
        color: "#1e293b",
        "font-size": 11,
        "font-family": '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        "font-weight": "600",
        "line-height": 1.2,
        "text-wrap": "wrap",
        "text-max-width": 118,
        "shadow-blur": 8,
        "shadow-color": "#0f172a",
        "shadow-opacity": 0.12,
        "shadow-offset-x": 0,
        "shadow-offset-y": 2,
      },
    },
    // Inactive assets read as "not in service" via a dashed border.
    {
      selector: 'node[status="decommissioned"], node[status="inactive"]',
      style: { "border-style": "dashed" },
    },
    // Labels toggle (View → Labels).
    { selector: "node.hide-labels", style: { label: "" } },
    { selector: "edge.hide-labels", style: { label: "" } },
    // Junction node — a small dot, no card.
    {
      selector: 'node[type="node"]',
      style: {
        shape: "ellipse",
        width: 16,
        height: 16,
        "background-color": "#64748b",
        "background-image": "none",
        color: "#64748b",
        label: "",
        "text-margin-x": 0,
        "border-width": 2,
        "border-color": "#ffffff",
        "shadow-blur": 4,
        "shadow-color": "#0f172a",
        "shadow-opacity": 0.18,
      },
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
      style: { "line-color": "#6b7280", "target-arrow-color": "#6b7280", "line-style": "solid", opacity: 0.55 },
    },
    {
      selector: "edge.sim-edge--low",
      style: {
        "line-color": "#22c55e", "target-arrow-color": "#22c55e",
        "line-style": "dashed", "line-dash-pattern": [10, 6],
      },
    },
    // Uncapacitated pipes get their own dash pattern (shorter, matching the
    // legend swatch) — same colour as "low" would be misleading here since
    // edgeState() deliberately buckets these apart from actual utilisation.
    {
      selector: "edge.sim-edge--unconstrained",
      style: {
        "line-color": "#22c55e", "target-arrow-color": "#22c55e",
        "line-style": "dashed", "line-dash-pattern": [4, 4],
      },
    },
    {
      selector: "edge.sim-edge--medium",
      style: {
        "line-color": "#f59e0b", "target-arrow-color": "#f59e0b",
        "line-style": "dashed", "line-dash-pattern": [10, 6],
      },
    },
    {
      selector: "edge.sim-edge--high",
      style: {
        "line-color": "#7c3aed", "target-arrow-color": "#7c3aed",
        "line-style": "dashed", "line-dash-pattern": [10, 6],
      },
    },
    {
      selector: "edge.sim-edge--bottleneck",
      style: {
        "line-color": "#dc2626", "target-arrow-color": "#dc2626",
        "line-style": "dashed", "line-dash-pattern": [10, 6], "z-index": 950,
      },
    },
    // Plants: how hard the solver ran them.
    { selector: "node.sim-plant--idle", style: { "border-color": "#cbd5e1", "border-width": 2 } },
    { selector: "node.sim-plant--partial", style: { "border-color": "#22c55e", "border-width": 3 } },
    { selector: "node.sim-plant--at-capacity", style: { "border-color": "#7c3aed", "border-width": 4 } },
    {
      selector: "node.sim-plant--no-capacity",
      style: { "border-color": "#94a3b8", "border-width": 3, "border-style": "dotted", opacity: 0.7 },
    },
    // City gates: whether they were served.
    { selector: "node.sim-gate--no-demand", style: { "border-color": "#cbd5e1", "border-width": 2, opacity: 0.7 } },
    { selector: "node.sim-gate--met", style: { "border-color": "#22c55e", "border-width": 3 } },
    { selector: "node.sim-gate--adjusted", style: { "border-color": "#f59e0b", "border-width": 4 } },
    {
      selector: "node.sim-gate--shortfall",
      style: {
        "border-color": "#dc2626", "border-width": 4,
        "overlay-color": "#dc2626", "overlay-padding": 5, "overlay-opacity": 0.12,
      },
    },
    // Pump stations.
    { selector: "node.sim-pump--normal", style: { "border-color": "#cbd5e1", "border-width": 2 } },
    { selector: "node.sim-pump--unconstrained", style: { "border-color": "#94a3b8", "border-width": 2, "border-style": "dotted" } },
    { selector: "node.sim-pump--offline", style: { "border-color": "#94a3b8", "border-width": 3, "border-style": "dashed", opacity: 0.6 } },
    {
      selector: "node.sim-pump--binding",
      style: {
        "border-color": "#dc2626", "border-width": 4,
        "overlay-color": "#dc2626", "overlay-padding": 5, "overlay-opacity": 0.12,
      },
    },
    // An element the displayed run never saw, because the canvas was edited
    // after the plan was produced.
    { selector: "edge.sim-stale", style: { opacity: 0.25, "line-style": "dotted", width: 1.5 } },
    { selector: "node.sim-stale", style: { opacity: 0.25, "border-style": "dotted" } },
    // A per-run override is operator input, not portal data — always visible.
    { selector: "node.sim-overridden", style: { "background-color": "#fffbeb" } },
    // Selection highlight.
    {
      selector: "node:selected",
      style: {
        "border-color": ACCENT,
        "border-width": 3,
        "overlay-color": ACCENT,
        "overlay-padding": 5,
        "overlay-opacity": 0.14,
      },
    },
    // Isolation mode hides everything outside the focused selection/scope.
    {
      selector: ".nb-isolate-hidden",
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
    // ── Pipe / edge ──────────────────────────────────────────────────────
    {
      selector: "edge",
      style: {
        width: 2.5,
        "line-color": "#5b7ca3",
        "target-arrow-color": "#5b7ca3",
        "target-arrow-shape": "triangle",
        "curve-style": "bezier",
        label: "data(displayLabel)",
        "font-size": 9,
        color: "#475569",
        "font-family": '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        "text-rotation": "autorotate",
        "text-background-color": "#ffffff",
        "text-background-opacity": 0.9,
        "text-background-padding": 2,
      },
    },
    // Pipes out of service read as dashed lines.
    {
      selector: 'edge[status="decommissioned"], edge[status="inactive"]',
      style: { "line-style": "dashed" },
    },
    // ── Sticky notes (Annotate → Add Note) ───────────────────────────────
    {
      selector: 'node[type="note"]',
      style: {
        shape: "round-rectangle",
        width: 200,
        height: 90,
        "background-color": "#fef9e7",
        "background-opacity": 1,
        "background-image": "none",
        "border-width": 1,
        "border-style": "dashed",
        "border-color": "#d97706",
        label: "data(displayLabel)",
        "text-valign": "top",
        "text-halign": "center",
        "text-margin-x": 0,
        color: "#78350f",
        "font-size": 11,
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
    { selector: 'node[type="note"][noteBold="true"]', style: { "font-weight": "700" } },
    { selector: 'node[type="note"][noteItalic="true"]', style: { "font-style": "italic" } },
    { selector: 'node[type="note"][noteUnderline="true"]', style: { "text-decoration-line": "underline" } },
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
        "overlay-color": ACCENT,
        "overlay-padding": 4,
        "overlay-opacity": 0.12,
      },
    },
    {
      selector: "edge.insert-target",
      style: {
        "line-color": "#f59e0b",
        "target-arrow-color": "#f59e0b",
        width: 4,
        "overlay-color": "#f59e0b",
        "overlay-padding": 6,
        "overlay-opacity": 0.18,
      },
    },
    {
      selector: "node.trace-root",
      style: {
        "border-color": "#0969da",
        "border-width": 6,
        "overlay-color": "#0969da",
        "overlay-padding": 6,
        "overlay-opacity": 0.2,
        "z-index": 1000,
      },
    },
    {
      selector: "node.trace-up",
      style: {
        "border-color": "#2563eb",
        "border-width": 4,
        "z-index": 900,
      },
    },
    {
      selector: "node.trace-down",
      style: {
        "border-color": "#16a34a",
        "border-width": 4,
        "z-index": 900,
      },
    },
    {
      selector: "edge.trace-up-edge",
      style: {
        "line-color": "#2563eb",
        "target-arrow-color": "#2563eb",
        "source-arrow-color": "#2563eb",
        width: 5,
        opacity: 1,
        "z-index": 900,
      },
    },
    {
      selector: "edge.trace-down-edge",
      style: {
        "line-color": "#16a34a",
        "target-arrow-color": "#16a34a",
        "source-arrow-color": "#16a34a",
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
